# heddohon-site

The site at [heddohon.app](https://heddohon.app) for
[Heddohon](https://github.com/zorcerer/heddohon), a self-hosted music player.

Static HTML, CSS and one script, served by GitHub Pages from the root of
`main`. There is no build step. To preview it, serve the directory with any
static file server, for example `docker run --rm -p 8080:80 -v "$PWD":/usr/share/nginx/html:ro nginx:alpine`.

It follows the application's [design notes](https://github.com/zorcerer/heddohon/wiki/Design-notes):
a colourless ground, and every hue taken from artwork. `site.js` samples the
screenshot nearest the middle of the viewport and writes `--art-h/s/l` on the
root, so the page changes colour as it scrolls. The top bar switches between
Liquid and Paper, stored in `localStorage`.

## Files

| Path | Contents |
| --- | --- |
| `index.html` | The page |
| `style.css` | Tokens from the app's `app.css`, and the page's layout |
| `site.js` | Artwork tint, theme switch, sleeve tilt, copy button |
| `assets/fonts/` | Manrope and JetBrains Mono (latin subset, variable), SIL OFL 1.1 |
| `assets/shots/` | Screenshots, made by `screenshots/run.sh` |
| `screenshots/` | The scripts that make them |
| `CNAME` | The custom domain for GitHub Pages |

## Screenshots

`screenshots/run.sh` makes every image in `assets/shots/`. It needs Docker
and nothing else:

```sh
screenshots/run.sh                                           # the latest release
HEDDOHON_IMAGE=ghcr.io/zorcerer/heddohon:dev screenshots/run.sh
```

It downloads a library into the Docker volume `hh-shots-library` (3.8 GB, kept
for the next run), starts a Navidrome and a Heddohon on a network of their own,
scans the library, and captures five desktop pages at 1440x960 and two phone
pages at 393x852 with Playwright. The plays behind `listening.jpg` are mock:
`capture.mjs` writes about 2,700 of them, spread over 150 days, into
Heddohon's database. The servers, their data and the network are
removed at the end. Each shot names its album and track in `capture.mjs`;
change them there. On a failure, `assets/shots/failed.png` shows the page as
it was.

The library is freely licensed music:

- Josh Woodward, every song on [joshwoodward.com](https://www.joshwoodward.com/),
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Songs and covers
  shown are credited on the page, as the license asks.
- Kimiko Ishizaka, J.S. Bach: The Art of the Fugue, 24-bit FLAC from the
  [Internet Archive](https://archive.org/details/pandacd-715-js-bach-the-art-of-the-fugue-kunst-der-fuge-bwv-1080),
  [CC0](https://creativecommons.org/publicdomain/zero/1.0/).

Lyrics come from LRCLIB through Heddohon's `HEDDOHON_LYRICS_LRCLIB`.

## License

[MIT](LICENSE). The fonts are under the SIL Open Font License 1.1; see
`assets/fonts/`.
