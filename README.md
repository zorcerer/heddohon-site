# heddohon-site

The site at [heddohon.app](https://heddohon.app) for
[Heddohon](https://github.com/zorcerer/heddohon), a self-hosted music player.

Static HTML, CSS and one script, served by GitHub Pages from the root of
`main`. There is no build step. To preview it, serve the directory with any
static file server, for example `docker run --rm -p 8080:80 -v "$PWD":/usr/share/nginx/html:ro nginx:alpine`.

It follows the application's [design notes](https://github.com/zorcerer/heddohon/blob/main/docs/design.md):
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
| `assets/shots/` | Screenshots from the Heddohon repository's `docs/assets` |
| `CNAME` | The custom domain for GitHub Pages |

## License

[MIT](LICENSE). The fonts are under the SIL Open Font License 1.1; see
`assets/fonts/`.
