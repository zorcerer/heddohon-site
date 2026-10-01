#!/bin/sh
# Fills /music with the albums the screenshots show. Runs inside a container
# (see run.sh) with the library volume mounted at /music, so a second run only
# fetches what is missing.
#
#   Josh Woodward     every song on joshwoodward.com, CC BY 4.0, MP3
#   Kimiko Ishizaka   J.S. Bach: The Art of the Fugue, CC0, 24-bit FLAC, from
#                     the Internet Archive
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

incomplete=$(find /music -name '*.part' | wc -l)
echo "Library: $(du -sh /music | cut -f1), $incomplete incomplete"
[ "$incomplete" -eq 0 ]
