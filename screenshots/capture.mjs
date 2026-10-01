// Takes the screenshots in assets/shots/. run.sh starts this inside the
// Playwright image, on a network with a Navidrome and a Heddohon of their own.
//
// Each shot names its album and track by title, not by id: ids are assigned by
// the scan and change with every fresh Navidrome.

import { chromium } from 'playwright';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';

const ND = process.env.ND_URL;
const APP = process.env.APP_URL;
const OUT = '/out';
const USER = 'listener';
const PASS = randomBytes(12).toString('hex');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(what, fn, seconds = 120) {
	for (let i = 0; i < seconds * 2; i++) {
		try {
			const value = await fn();
			if (value) return value;
		} catch {}
		await sleep(500);
	}
	throw new Error(`timed out waiting for ${what}`);
}

async function subsonic(method, params = {}) {
	const salt = randomBytes(6).toString('hex');
	const query = new URLSearchParams({
		u: USER,
		t: createHash('md5').update(PASS + salt).digest('hex'),
		s: salt,
		v: '1.16.1',
		c: 'heddohon-shots',
		f: 'json',
		...params
	});
	const body = await (await fetch(`${ND}/rest/${method}.view?${query}`)).json();
	const reply = body['subsonic-response'];
	if (reply.status !== 'ok') throw new Error(`${method}: ${JSON.stringify(reply.error)}`);
	return reply;
}

// ── Navidrome: the first account, then a full scan ─────────────────────────
await until('Navidrome', async () => (await fetch(`${ND}/ping`)).ok);
const created = await fetch(`${ND}/auth/createAdmin`, {
	method: 'POST',
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify({ username: USER, password: PASS })
});
if (!created.ok) throw new Error(`createAdmin: HTTP ${created.status}`);
await subsonic('startScan');
const scanned = await until(
	'the scan',
	async () => {
		const { scanStatus } = await subsonic('getScanStatus');
		return !scanStatus.scanning && scanStatus.count > 0 && scanStatus;
	},
	600
);
console.log(`scanned ${scanned.count} files`);

const { albumList2 } = await subsonic('getAlbumList2', { type: 'alphabeticalByName', size: '500' });
async function album(pattern) {
	const found = albumList2.album.find((a) => pattern.test(a.name));
	if (!found) throw new Error(`no album matching ${pattern} in: ${albumList2.album.map((a) => a.name).join(" | ")}`);
	return (await subsonic('getAlbum', { id: found.id })).album;
}

const fugue = await album(/Art of the Fugue/);
const stars = await album(/^Addressed to the Stars$/);
const wings = await album(/^Dirty Wings$/);
const whispering = await album(/^Only Whispering$/);
const machine = await album(/^The Beautiful Machine$/);

// ── Heddohon ───────────────────────────────────────────────────────────────
await until('Heddohon', async () => (await fetch(`${APP}/healthz`)).ok);
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

async function signedIn(options) {
	const context = await browser.newContext(options);
	const response = await context.request.post(`${APP}/login`, {
		form: { username: USER, password: PASS, backend: 'subsonic', next: '/' },
		headers: { origin: APP, accept: 'text/html' },
		maxRedirects: 0
	});
	if (response.status() !== 303) throw new Error(`sign-in: HTTP ${response.status()}`);
	return context;
}

// 1440x960 CSS pixels at 1.25, so the files are 1800x1200.
const desktop = await signedIn({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1.25 });
// An iPhone 15: 393x852 at 2, 786x1704.
const phone = await signedIn({
	viewport: { width: 393, height: 852 },
	deviceScaleFactor: 2,
	isMobile: true,
	hasTouch: true
});

let current;

async function shoot(page, name) {
	// The player holds a connection open, so the network never goes idle; wait
	// for the covers on screen instead (the ones below are lazy and never load).
	await page.waitForFunction(() =>
		[...document.images].every((i) => {
			const box = i.getBoundingClientRect();
			return i.complete || box.bottom < 0 || box.top > innerHeight || box.width === 0;
		})
	);
	// The room's colour eases over 900ms after a track or a page changes.
	await page.waitForTimeout(1600);
	await page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 86 });
	console.log(`${name}.jpg`);
}

/**
 * Opens `album`, plays its track at `index` and seeks it to `at` seconds. It
 * plays on through the shot. Pausing the media element from here did not hold:
 * the transport still showed Pause in the capture.
 */
async function play(page, album, index, at, { tap = false } = {}) {
	current = page;
	await page.goto(`${APP}/albums/${album.id}`);
	const title = album.song[index].title;
	const row = page.getByRole('button', { name: `Play ${title}`, exact: true });
	await (tap ? row.tap() : row.click());
	await page.waitForFunction(() => [...document.querySelectorAll('audio')].some((a) => !a.paused && a.currentTime > 0));
	await page.evaluate((at) => {
		const audio = [...document.querySelectorAll('audio')].find((a) => !a.paused);
		audio.currentTime = at;
	}, at);
	await page.waitForTimeout(400);
	// Away from every row and button, so nothing is shown under the pointer.
	if (!tap) await page.mouse.move(80, 940);
	return title;
}

try {
	// ── Desktop ────────────────────────────────────────────────────────────
	const page = await desktop.newPage();

	await play(page, fugue, 0, 99);
	await shoot(page, 'album');

	// LRCLIB has synced lyrics for this song; Heddohon fetches them with
	// HEDDOHON_LYRICS_LRCLIB=true. At 1:29 the second verse is under way; the
	// lyrics have an instrumental break from 0:57 to 1:13.
	await play(page, stars, stars.song.findIndex((s) => s.title === 'The Nest'), 89);
	await page.getByRole('button', { name: 'Lyrics', exact: true }).click();
	await page.getByRole('button', { name: 'Track details', exact: true }).click();
	await page.waitForTimeout(800);
	await shoot(page, 'lyrics');

	await play(page, wings, 2, 20);
	await page.locator('main section', { hasText: /More from/i }).last().evaluate((s) => s.scrollIntoView({ block: 'end' }));
	await page.mouse.move(80, 940);
	await shoot(page, 'recommendations');

	await play(page, whispering, 0, 0);
	await page.getByRole('button', { name: 'Share a link to this song' }).click();
	await page.getByRole('button', { name: 'Create link' }).click();
	const url = await page.locator('dialog input.url').inputValue();

	// The shared page, as someone without an account sees it.
	const visitor = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.25 });
	const shared = await visitor.newPage();
	current = shared;
	await shared.goto(url);
	await shared.mouse.move(40, 860);
	await shoot(shared, 'share');

	// ── Phone ──────────────────────────────────────────────────────────────
	const small = await phone.newPage();
	await play(small, machine, 0, 48, { tap: true });
	await small.evaluate(() => scrollTo(0, 0));
	await shoot(small, 'phone-album');

	await small.locator('.phone-dock .now').tap();
	await small.waitForFunction(() => document.querySelector('.app')?.classList.contains('player-open'));
	await shoot(small, 'phone-player');
} catch (error) {
	// What the page looked like when it failed, for whoever runs this next.
	await current?.screenshot({ path: `${OUT}/failed.png` }).catch(() => {});
	throw error;
} finally {
	await browser.close();
}
