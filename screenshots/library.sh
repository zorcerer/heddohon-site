#!/bin/sh
# Fills /music with the albums the screenshots show. Runs inside a container
# (see run.sh) with the library volume mounted at /music, so a second run only
# fetches what is missing.
#
#   Josh Woodward     every song on joshwoodward.com, CC BY 4.0, MP3
#   Kimiko Ishizaka   J.S. Bach: The Art of the Fugue, CC0, 24-bit FLAC, from
#                     the Internet Archive
#   From the Internet Archive, for their covers, each CC BY under its own
#   metadata: Stellardrone (Light Years, Invent the Universe), Lezet
#   (Accumulation), Grove of Whispers (The Sheltering Sky, Vast), Tale Twist
#   (Wry Way), Chump Change (Footage / East), the unfound88 compilation (happy
#   in novi sad), in FLAC; Broke For Free (Slam Funk), in MP3
set -eu

apk add --no-cache curl jq ffmpeg >/dev/null

export UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130 Safari/537.36'

# Reads "url<TAB>file" lines and fetches $1 at a time. Each file is written to
# a .part first, so an interrupted run is picked up by the next.
fetch_all() {
	tr '\t\n' '\0\0' | xargs -0 -n 2 -P "$1" sh -c '
		[ -s "$2" ] && exit 0
		curl -sf -L -m 3600 -A "$UA" -o "$2.part" "$1" && mv "$2.part" "$2" || echo "failed: $1" >&2
	' _
}

# joshwoodward.com answers 403 without a browser user agent. Every album page
# carries the MP3 paths of the whole catalogue, and the tags in each file say
# which album it is on. They are kept as downloaded in .downloads, which
# Navidrome skips (.ndignore), and sorted into albums below.
mkdir -p /music/.downloads/josh-woodward
touch /music/.downloads/.ndignore
cd /music/.downloads/josh-woodward
curl -sf -A "$UA" https://www.joshwoodward.com/album/TheWake > /tmp/site.html
grep -o '/mp3/[^"\\]*\.mp3' /tmp/site.html | grep -v NoVox | sort -u \
	| while read -r path; do
		printf 'https://www.joshwoodward.com%s\t%s\n' "$path" "$(echo "$path" | cut -d/ -f3- | tr / _)"
	done > /tmp/josh.tsv
echo "Josh Woodward: $(wc -l < /tmp/josh.tsv) songs"
fetch_all 6 < /tmp/josh.tsv

# A folder per album, with the cover from the site: 238 of the 263 files carry
# no artwork of their own. Copied without re-encoding, with one album artist
# on every file: a single song on Breadcrumbs carrying the tag split it into
# two albums. Songs tagged Unreleased, or with no album, are left out.
# "Crawford Street (Remixed)" and "The Simple Life, Part 2" take the cover of
# the album they name.
grep -o '\\"key\\":\\"[^"\\]*\\",\\"name\\":\\"[^"\\]*\\"' /tmp/site.html \
	| sed 's/\\"key\\":\\"\([^"\\]*\)\\",\\"name\\":\\"\([^"\\]*\)\\"/\2\t\1/' | sort -u > /tmp/covers.tsv
for f in *.mp3; do
	album=$(ffprobe -v quiet -show_entries format_tags=album -of default=nw=1:nk=1 "$f" | sed 's/ *$//')
	case "$album" in '' | Unreleased) continue ;; esac
	dir="/music/josh-woodward/$(echo "$album" | tr '/' '-')"
	[ -s "$dir/$f" ] && continue
	mkdir -p "$dir"
	ffmpeg -v error -i "$f" -map 0 -c copy -id3v2_version 3 \
		-metadata album="$album" -metadata album_artist='Josh Woodward' -f mp3 "$dir/$f.part" \
		&& mv "$dir/$f.part" "$dir/$f"
	if [ ! -s "$dir/cover.jpg" ]; then
		base=$(echo "$album" | sed 's/ (Remixed)$//; s/, Part [0-9]*$//')
		key=$(awk -F '\t' -v name="$base" '$1 == name { print $2; exit }' /tmp/covers.tsv)
		[ -n "$key" ] && printf '%s\t%s\n' "https://www.joshwoodward.com/nextImages/albums/$key-Full.jpg" "$dir/cover.jpg" | fetch_all 1
	fi
done
echo "Josh Woodward: $(ls -d /music/josh-woodward/*/ | wc -l) albums, $(ls /music/josh-woodward/*/cover.jpg | wc -l) covers"

# One connection to the Archive ran at about 0.5 MB/s when this was written,
# and ten at about 8 MB/s: 3 minutes for the 1.3 GB album rather than 45.
ITEM=pandacd-715-js-bach-the-art-of-the-fugue-kunst-der-fuge-bwv-1080
mkdir -p /music/kimiko-ishizaka/art-of-the-fugue
cd /music/kimiko-ishizaka/art-of-the-fugue
curl -sf "https://archive.org/metadata/$ITEM" > /tmp/item.json
jq -r --arg item "$ITEM" '
	(.files[] | select(.format == "24bit Flac") | "https://archive.org/download/\($item)/\(.name | @uri)\t\(.name)"),
	(first(.files[] | select(.format == "JPEG")) | "https://archive.org/download/\($item)/\(.name | @uri)\tcover.jpg")
' /tmp/item.json > /tmp/fugue.tsv
echo "The Art of the Fugue: $(wc -l < /tmp/fugue.tsv) files"
fetch_all 10 < /tmp/fugue.tsv

# An album from the Internet Archive: its files of one format, and its cover,
# named. Where the item has no front of its own, the cover is the artwork in
# the first file, at its own size: the pictures the Archive takes from the
# files are thumbnails of 6 to 9 KB, and Slam Funk's came out black.
archive_album() {
	item=$1 dir=$2 format=$3 cover=$4
	mkdir -p "/music/$dir"
	cd "/music/$dir"
	curl -sf "https://archive.org/metadata/$item" > /tmp/item.json
	jq -r --arg item "$item" --arg format "$format" --arg cover "$cover" '
		(.files[] | select(.format == $format) | "https://archive.org/download/\($item)/\(.name | @uri)\t\(.name)"),
		(.files[] | select($cover != "" and .name == $cover)
			| "https://archive.org/download/\($item)/\(.name | @uri)\tcover.\(.name | split(".") | last | ascii_downcase)")
	' /tmp/item.json > /tmp/album.tsv
	echo "$dir: $(wc -l < /tmp/album.tsv) files"
	fetch_all 8 < /tmp/album.tsv
	if [ -z "$cover" ] && [ ! -s cover.jpg ]; then
		rm -f cover.png
		first=$(ls *.flac *.mp3 2>/dev/null | head -1)
		ffmpeg -v error -y -i "$first" -an -frames:v 1 cover.jpg || echo "$dir: no artwork in $first" >&2
	fi
}
# Sets the album and its artist on every file of a folder, copied without
# re-encoding. With "names", the files carry no tags at all (Tale Twist, Chump
# Change), and the artist, the title and the track come from the file name:
# "01.TaleTwist-BirdsMigration.flac" is track 1, "Birds Migration". The
# unfound88 compilation carries an album artist per track, which split it
# into an album each. `.tagged` marks a folder done.
tag_album() {
	dir=/music/$1 album=$2 album_artist=$3 names=${4:-}
	[ -e "$dir/.tagged" ] && return
	for f in "$dir"/*.flac "$dir"/*.mp3; do
		[ -e "$f" ] || continue
		set -- -metadata album="$album" -metadata album_artist="$album_artist"
		[ "$album_artist" = 'Various Artists' ] && set -- "$@" -metadata compilation=1
		if [ -n "$names" ]; then
			name=$(basename "${f%.*}")
			track=$(echo "$name" | sed -n 's/^\([0-9][0-9]*\).*/\1/p' | sed 's/^0*//')
			title=$(echo "$name" | sed 's/^[0-9]*[ ._-]*//; s/^[^-]*-//; s/_/ /g; s/\([a-z]\)\([A-Z]\)/\1 \2/g')
			set -- "$@" -metadata artist="$album_artist" -metadata title="$title" -metadata track="$track"
		fi
		ext=${f##*.}
		ffmpeg -v error -y -i "$f" -map 0 -c copy "$@" -f "$([ "$ext" = mp3 ] && echo mp3 || echo flac)" "$f.part" && mv "$f.part" "$f"
	done
	touch "$dir/.tagged"
	echo "$1: tagged"
}

archive_album Stellardrone-LightYears stellardrone/light-years Flac ''
archive_album Stellardrone-InventTheUniverse-CC-BY stellardrone/invent-the-universe Flac ''
archive_album bof066 lezet/accumulation Flac 00_Lezet_-_Accumulation_01_front.jpg
archive_album bof060 grove-of-whispers/the-sheltering-sky Flac 00_Grove_of_Whispers_-_The_Sheltering_Sky_01_front.jpg
archive_album bof056 grove-of-whispers/vast Flac 00_Grove_of_Whispers_-_Vast_01_front.jpg
archive_album tranz060TaleTwist-WryWay tale-twist/wry-way Flac 01.tranz060CoverFront.jpg
archive_album yarn014 chump-change/footage-east Flac yarn014-artwork.png
archive_album unfound88 unfound/happy-in-novi-sad Flac unfound88.jpg
archive_album Slam_Funk-7603 broke-for-free/slam-funk 'VBR MP3' ''
tag_album tale-twist/wry-way 'Wry Way' 'Tale Twist' names
tag_album chump-change/footage-east 'Footage / East' 'Chump Change' names
tag_album unfound/happy-in-novi-sad 'happy in novi sad' 'Various Artists'

incomplete=$(find /music -name '*.part' | wc -l)
echo "Library: $(du -sh /music | cut -f1), $incomplete incomplete"
[ "$incomplete" -eq 0 ]
