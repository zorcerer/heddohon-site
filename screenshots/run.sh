#!/bin/sh
# Renews assets/shots/: a Navidrome and a Heddohon of their own, a library of
# freely licensed albums, and Playwright, all in containers. Needs Docker only.
#
#   screenshots/run.sh
#   HEDDOHON_IMAGE=ghcr.io/zorcerer/heddohon:dev screenshots/run.sh
#
# The library (3.8 GB) is kept in the volume hh-shots-library between runs;
# everything else is removed at the end. Nothing is bind-mounted, so this
# works the same where the Docker daemon is on another machine.
set -eu
cd "$(dirname "$0")"

HEDDOHON_IMAGE=${HEDDOHON_IMAGE:-ghcr.io/zorcerer/heddohon:latest}
NAVIDROME_IMAGE=${NAVIDROME_IMAGE:-deluan/navidrome:latest}
# Matches the playwright package installed below.
PLAYWRIGHT_IMAGE=mcr.microsoft.com/playwright:v1.63.0-noble
P=hh-shots

cleanup() {
	docker rm -f $P-navidrome $P-heddohon $P-capture $P-fetch >/dev/null 2>&1 || true
	docker volume rm $P-navidrome $P-data >/dev/null 2>&1 || true
	docker network rm $P >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

docker pull -q "$HEDDOHON_IMAGE" >/dev/null
docker pull -q "$NAVIDROME_IMAGE" >/dev/null

echo '== library'
docker volume create $P-library >/dev/null
docker run --rm -i --name $P-fetch -v $P-library:/music alpine:3 sh -c 'cat > /tmp/library.sh && sh /tmp/library.sh' < library.sh

echo '== servers'
docker network create $P >/dev/null
docker run -d --name $P-navidrome --network $P \
	-v $P-library:/music:ro -v $P-navidrome:/data \
	-e ND_SCANSCHEDULE=0 -e ND_ENABLEINSIGHTSCOLLECTOR=false -e ND_LOGLEVEL=warn \
	"$NAVIDROME_IMAGE" >/dev/null
# Plain HTTP on a network of its own, where a Secure cookie would be dropped.
docker run -d --name $P-heddohon --network $P \
	-v $P-data:/data \
	-e HEDDOHON_SECRET="$(head -c 48 /dev/urandom | base64 | tr -d '\n')" \
	-e HEDDOHON_SUBSONIC_URL=http://$P-navidrome:4533 \
	-e ORIGIN=http://$P-heddohon:3000 \
	-e HEDDOHON_LYRICS_LRCLIB=true \
	-e HEDDOHON_COOKIE_SECURE=false \
	"$HEDDOHON_IMAGE" >/dev/null

echo "== capture ($HEDDOHON_IMAGE)"
status=0
# The data volume is for the plays capture.mjs writes into Heddohon's database.
docker run -i --name $P-capture --network $P --ipc=host \
	-v $P-data:/data \
	-e ND_URL=http://$P-navidrome:4533 -e APP_URL=http://$P-heddohon:3000 \
	-e PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 -e npm_config_update_notifier=false \
	"$PLAYWRIGHT_IMAGE" sh -c '
		mkdir -p /work && cd /work && cat > capture.mjs &&
		npm init -y >/dev/null && npm i --silent --no-audit --no-fund playwright@1.63.0 &&
		node capture.mjs
	' < capture.mjs || status=$?

# On a failure this brings back failed.png, the page as it was.
docker cp $P-capture:/out/. ../assets/shots/ || true
exit $status
