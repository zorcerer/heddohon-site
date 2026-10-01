// heddohon.app: the room's colour, the theme switch, the sleeve, what arrives
// on scroll, the small scenes in the cards, the screens and the terminal.

const root = document.documentElement;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

// The app's motion tokens (`client/motion.ts`), for the Web Animations API and
// for timers, neither of which reads a custom property.
const DUR = { press: 120, hover: 220, state: 340, travel: 480, colour: 900 };
const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
// A reaction rises for this long in the app; the scenes change on it.
const BEAT = 2400;

/*
 * The colour of an image, as `client/artwork.ts` in the app takes it: a 32x32
 * draw, bucketed by hue, weighted toward saturated pixels at mid lightness,
 * and averaged as vectors rather than as degrees (the mean of 350 and 10 is 0,
 * not 180). An image with no usable hue gives null, and the room goes to the
 * near-neutral the app shows before anything plays.
 */
function sample(img) {
	const size = 32;
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = size;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) return null;
	ctx.drawImage(img, 0, 0, size, size);
	let data;
	try {
		data = ctx.getImageData(0, 0, size, size).data;
	} catch {
		return null;
	}

	const buckets = Array.from({ length: 12 }, () => ({ w: 0, x: 0, y: 0, s: 0, l: 0 }));
	for (let i = 0; i < data.length; i += 4) {
		const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
		const max = Math.max(r, g, b), min = Math.min(r, g, b);
		const l = (max + min) / 2;
		const d = max - min;
		if (d < 0.06) continue;
		const s = d / (1 - Math.abs(2 * l - 1));
		let h;
		if (max === r) h = ((g - b) / d) % 6;
		else if (max === g) h = (b - r) / d + 2;
		else h = (r - g) / d + 4;
		h = (h * 60 + 360) % 360;
		const w = s * s * (1 - Math.abs(l - 0.5) * 2);
		const bucket = buckets[Math.floor(h / 30) % 12];
		const rad = (h * Math.PI) / 180;
		bucket.w += w;
		bucket.x += Math.cos(rad) * w;
		bucket.y += Math.sin(rad) * w;
		bucket.s += s * w;
		bucket.l += l * w;
	}

	const best = buckets.reduce((a, b) => (b.w > a.w ? b : a));
	if (best.w < 1.5) return null;
	const h = ((Math.atan2(best.y, best.x) * 180) / Math.PI + 360) % 360;
	// Clamped as in the app, so a vivid capture tints the page rather than
	// taking it over: saturation 18 to 38 percent, lightness 38 to 62.
	const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
	return {
		h: Math.round(h),
		s: Math.round(clamp((best.s / best.w) * 100, 18, 38)),
		l: Math.round(clamp((best.l / best.w) * 100, 38, 62))
	};
}

const NEUTRAL = { h: 218, s: 16, l: 54 };

function tint(colour = NEUTRAL) {
	root.style.setProperty('--art-h', String(colour.h));
	root.style.setProperty('--art-s', `${colour.s}%`);
	root.style.setProperty('--art-l', `${colour.l}%`);
}

/*
 * The figure taking up the most of the viewport sets the colour. With none on
 * screen the room keeps the last one, as a paused track keeps it in the app
 * when the page has nothing of its own to offer. The frame of screens is one
 * figure, and its colour is that of the capture it is showing.
 */
const colours = new Map();
const swatches = [...document.querySelectorAll('.swatch')];
const ratios = new Map();
const figures = [...document.querySelectorAll('[data-tint]')];
// Each capture has an image for either theme; the one shown is the one sampled.
const imageOf = (figure) => {
	const scope = figure.querySelector('.slide.on') ?? figure;
	return scope.querySelector(`img[data-for="${root.dataset.theme}"]`) ?? scope.querySelector('img');
};

function whenLoaded(img) {
	return img.complete && img.naturalWidth ? Promise.resolve() : new Promise((r) => img.addEventListener('load', r, { once: true }));
}

let current = null;
function pick() {
	let top = null;
	let best = 0.15;
	for (const [figure, ratio] of ratios) {
		if (ratio > best) {
			best = ratio;
			top = figure;
		}
	}
	const img = top && imageOf(top);
	if (!img || img === current) return;
	whenLoaded(img).then(() => {
		if (!colours.has(img)) colours.set(img, sample(img));
		current = img;
		tint(colours.get(img) ?? NEUTRAL);
		for (const swatch of swatches) swatch.setAttribute('aria-pressed', 'false');
	});
}

if ('IntersectionObserver' in window) {
	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) ratios.set(entry.target, entry.intersectionRatio);
			pick();
		},
		{ threshold: [0, 0.15, 0.3, 0.5, 0.7, 0.9, 1] }
	);
	figures.forEach((f) => observer.observe(f));
}

/*
 * A colour chosen by hand, from the squares in "Coloured by the artwork". It
 * holds until the scroll brings another capture to the middle of the screen.
 */
for (const swatch of swatches) {
	swatch.addEventListener('click', () => {
		const { h, s, l } = swatch.dataset;
		tint({ h: Number(h), s: Number(s), l: Number(l) });
		for (const other of swatches) other.setAttribute('aria-pressed', String(other === swatch));
	});
}

/* ── Theme ─────────────────────────────────────────────────────────────── */
const GROUND = { light: '#f0e7d5', dark: '#0b0c0f' };
const themeColour = document.querySelector('meta[name="theme-color"]');
function applyTheme(theme) {
	root.dataset.theme = theme;
	themeColour?.setAttribute('content', GROUND[theme]);
	// The captures change with the theme, and the room takes the new one's colour.
	pick();
}

/*
 * The captures of the theme about to be shown are lazy and not displayed, so
 * not yet fetched. Those within a screen of the window are fetched as the
 * switch is pressed, which gives them the length of the veil to arrive.
 */
function warm(theme) {
	for (const img of document.querySelectorAll(`img[data-for="${theme}"]`)) {
		if (img.closest('.slide:not(.on)')) continue;
		const box = img.parentElement.getBoundingClientRect();
		if (box.bottom > -innerHeight && box.top < innerHeight * 2) img.loading = 'eager';
	}
}
applyTheme(root.dataset.theme);

/*
 * The new theme's ground spreads from the switch over the travel length, the
 * theme changes under it, and it fades over the state length. The first
 * animation holds its last frame until the second has started, so the old
 * theme is not shown for a frame between them.
 */
const veil = document.querySelector('.veil');
let turning = false;
document.querySelector('.theme')?.addEventListener('click', (event) => {
	if (turning) return;
	const next = root.dataset.theme === 'light' ? 'dark' : 'light';
	try {
		localStorage.setItem('hh-theme', next);
	} catch {}
	warm(next);
	if (!veil?.animate || reducedMotion.matches) return applyTheme(next);

	const box = event.currentTarget.getBoundingClientRect();
	const at = `${box.left + box.width / 2}px ${box.top + box.height / 2}px`;
	turning = true;
	veil.style.background = GROUND[next];
	const spread = veil.animate(
		[
			{ opacity: 1, clipPath: `circle(0 at ${at})` },
			{ opacity: 1, clipPath: `circle(150vmax at ${at})` }
		],
		{ duration: DUR.travel, easing: EASE_OUT, fill: 'forwards' }
	);
	const settle = () => {
		applyTheme(next);
		veil.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DUR.state, easing: EASE_OUT });
		spread.cancel();
		turning = false;
	};
	spread.finished.then(settle, settle);
});

/* ── The sleeve ────────────────────────────────────────────────────────── */
const sleeve = document.querySelector('.sleeve');
const turn = sleeve?.querySelector('.sleeve-turn');
if (sleeve && turn) {
	sleeve.addEventListener('pointermove', (e) => {
		if (e.pointerType !== 'mouse' || reducedMotion.matches) return;
		const box = sleeve.getBoundingClientRect();
		const x = (e.clientX - box.left) / box.width;
		const y = (e.clientY - box.top) / box.height;
		sleeve.classList.add('tracking');
		turn.style.setProperty('--ry', `${((x - 0.5) * 18).toFixed(2)}deg`);
		turn.style.setProperty('--rx', `${((0.5 - y) * 18).toFixed(2)}deg`);
		turn.style.setProperty('--lift', '1.25rem');
		turn.style.setProperty('--px', `${(x * 100).toFixed(1)}%`);
		turn.style.setProperty('--py', `${(y * 100).toFixed(1)}%`);
	});
	const settle = () => {
		sleeve.classList.remove('tracking');
		for (const p of ['--rx', '--ry', '--lift']) turn.style.removeProperty(p);
	};
	sleeve.addEventListener('pointerleave', settle);
	sleeve.addEventListener('pointerdown', settle);
}

/* ── Pointer ───────────────────────────────────────────────────────────── */
// The pool of colour under the pointer on a card (`.pane::before`).
document.addEventListener(
	'pointermove',
	(e) => {
		if (e.pointerType !== 'mouse') return;
		const pane = e.target instanceof Element ? e.target.closest('.pane') : null;
		if (!pane) return;
		const box = pane.getBoundingClientRect();
		pane.style.setProperty('--px', `${e.clientX - box.left}px`);
		pane.style.setProperty('--py', `${e.clientY - box.top}px`);
	},
	{ passive: true }
);

// The press on a key, as `client/press.ts` starts it in the app: the ripple
// begins where the key was pressed, and a second press starts a new one.
document.addEventListener(
	'pointerdown',
	(e) => {
		if (e.button !== 0 || reducedMotion.matches) return;
		const key = e.target instanceof Element ? e.target.closest('.key') : null;
		if (!(key instanceof HTMLElement)) return;
		const box = key.getBoundingClientRect();
		key.style.setProperty('--press-x', `${e.clientX - box.left}px`);
		key.style.setProperty('--press-y', `${e.clientY - box.top}px`);
		key.classList.remove('pressed');
		void key.offsetWidth;
		key.classList.add('pressed');
	},
	{ passive: true }
);
document.addEventListener('animationend', (e) => {
	if (e.animationName === 'press-ripple' && e.target instanceof HTMLElement) e.target.classList.remove('pressed');
});

/* ── The bar ───────────────────────────────────────────────────────────── */
/*
 * The line along the bar's foot is how far down the page the scroll is, and
 * the marker under the links is the section at 40 percent of the way down the
 * window. Both are read once a frame at most.
 */
const progress = document.querySelector('.progress i');
const marker = document.querySelector('.marker');
const links = [...document.querySelectorAll('.bar nav a')];
const sections = links.map((link) => document.querySelector(link.getAttribute('href')));
let here = null;

function place() {
	const link = here;
	for (const other of links) other.classList.toggle('here', other === link);
	if (!marker) return;
	marker.classList.toggle('on', Boolean(link));
	if (!link) return;
	const inset = 12;
	marker.style.setProperty('--x', `${link.offsetLeft + inset}px`);
	marker.style.setProperty('--w', String(link.offsetWidth - inset * 2));
}

let queued = false;
function onScroll() {
	queued = false;
	const span = root.scrollHeight - innerHeight;
	progress?.style.setProperty('--p', span > 0 ? (scrollY / span).toFixed(4) : '0');
	const line = innerHeight * 0.4;
	let found = null;
	sections.forEach((section, index) => {
		if (section && section.getBoundingClientRect().top <= line) found = links[index];
	});
	if (found !== here) {
		here = found;
		place();
	}
}
const queue = () => {
	if (!queued) {
		queued = true;
		requestAnimationFrame(onScroll);
	}
};
addEventListener('scroll', queue, { passive: true });
addEventListener('resize', () => {
	queue();
	place();
});
onScroll();

/* ── The ticker ────────────────────────────────────────────────────────── */
const run = document.querySelector('.ticker-run');
if (run && !reducedMotion.matches) {
	for (const item of [...run.children]) run.append(item.cloneNode(true));
	run.classList.add('loop');
}

/* ── Arriving on scroll ────────────────────────────────────────────────── */
/*
 * An element marked `data-reveal` gets `in` the first time it comes into view,
 * and the stylesheet brings it in. Those that come in on the same pass are
 * numbered in document order, so a row of cards follows one another.
 *
 * One marked `data-live` has `live` for as long as any of it is on screen; its
 * scene runs only then.
 */
const revealed = [...document.querySelectorAll('[data-reveal]')];
const lively = [...document.querySelectorAll('[data-live]')];
if ('IntersectionObserver' in window) {
	const revealer = new IntersectionObserver(
		(entries) => {
			const arriving = entries.filter((entry) => entry.isIntersecting).map((entry) => entry.target);
			arriving.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
			arriving.forEach((element, index) => {
				element.style.setProperty('--stagger', String(Math.min(index, 12)));
				element.classList.add('in');
				revealer.unobserve(element);
			});
		},
		{ rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
	);
	revealed.forEach((element) => revealer.observe(element));

	const liveness = new IntersectionObserver((entries) => {
		for (const entry of entries) entry.target.classList.toggle('live', entry.isIntersecting);
	});
	lively.forEach((element) => liveness.observe(element));
} else {
	revealed.forEach((element) => element.classList.add('in'));
	lively.forEach((element) => element.classList.add('live'));
}

/* ── Scenes ────────────────────────────────────────────────────────────── */
/*
 * The small scenes at the head of the cards that need a script: each has a
 * step, taken once a beat while its card is on screen. Under reduced motion
 * they stay as the markup has them.
 */
const scenes = [];
function scene(selector, step, every = BEAT) {
	const element = document.querySelector(selector);
	const card = element?.closest('[data-live]');
	if (!element || !card) return;
	const state = { element, card, step, every, last: 0, count: 0 };
	scenes.push(state);
	step(element, 0);
}

// Original files: the badge, through the formats the player can show.
const QUALITIES = [
	['FLAC 24/192', 'hires'],
	['FLAC 24/96', 'hires'],
	['FLAC 16/44.1', 'lossless'],
	['OPUS 128', 'lossy'],
	['MP3 320', 'lossy'],
	['AAC 256', 'lossy']
];
scene('[data-quality]', (badge, n) => {
	const [label, kind] = QUALITIES[n % QUALITIES.length];
	badge.className = `badge badge--${kind}`;
	const text = document.createElement('span');
	text.className = 'swap';
	text.textContent = label;
	badge.replaceChildren(text);
});

// Synced lyrics: the next line.
scene(
	'[data-lines]',
	(list, n) => {
		const lines = [...list.children];
		const at = n % lines.length;
		lines.forEach((line, index) => line.classList.toggle('now', index === at));
		list.style.setProperty('--at', String(at));
	},
	BEAT * 0.75
);

// The equaliser: ten bands between 0 and 1, through a few shapes.
const SHAPES = [
	[0.78, 0.72, 0.62, 0.52, 0.46, 0.44, 0.48, 0.56, 0.64, 0.7],
	[0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
	[0.36, 0.4, 0.48, 0.58, 0.68, 0.72, 0.66, 0.56, 0.48, 0.42],
	[0.86, 0.78, 0.64, 0.5, 0.42, 0.4, 0.44, 0.5, 0.52, 0.5],
	[0.44, 0.46, 0.5, 0.5, 0.48, 0.52, 0.6, 0.7, 0.8, 0.84]
];
scene('[data-eq]', (eq, n) => {
	const shape = SHAPES[n % SHAPES.length];
	[...eq.children].forEach((band, index) => {
		band.style.setProperty('--v', String(shape[index]));
		band.style.setProperty('--n', String(index));
	});
});

// Shared links: a new token, and the next of the three lifetimes. The token is
// 43 characters of base64url, which is what 256 bits come to. It settles from
// the left over the travel length.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const randomToken = (length) => Array.from({ length }, () => ALPHABET[Math.floor(Math.random() * 64)]).join('');
const tokenText = document.querySelector('[data-token]');
scene('[data-expiry]', (expiry, n) => {
	const choice = (n + 1) % 3;
	expiry.style.setProperty('--n', String(choice));
	[...expiry.querySelectorAll('span')].forEach((span, index) => span.classList.toggle('on', index === choice));
	if (!tokenText || n === 0) return;
	const final = randomToken(43);
	const started = performance.now();
	const draw = (now) => {
		const done = Math.min(1, (now - started) / DUR.travel);
		const settled = Math.floor(done * final.length);
		tokenText.textContent = final.slice(0, settled) + randomToken(final.length - settled);
		if (done < 1) requestAnimationFrame(draw);
	};
	requestAnimationFrame(draw);
});

if (!reducedMotion.matches && scenes.length) {
	setInterval(() => {
		const now = performance.now();
		for (const state of scenes) {
			if (!state.card.classList.contains('live') || document.hidden) continue;
			if (now - state.last < state.every) continue;
			state.last = now;
			state.count += 1;
			state.step(state.element, state.count);
		}
	}, 150);
}

// Your listening: the totals counted up from 0 over the length of a colour
// change, the first time the card is on screen.
for (const hours of document.querySelectorAll('[data-hours]')) {
	const card = hours.closest('[data-live]');
	const figuresToCount = [...hours.querySelectorAll('[data-count]')];
	if (!card || reducedMotion.matches || !('MutationObserver' in window)) continue;
	const watcher = new MutationObserver(() => {
		if (!card.classList.contains('live')) return;
		watcher.disconnect();
		const started = performance.now();
		const draw = (now) => {
			const t = Math.min(1, (now - started) / DUR.colour);
			const eased = 1 - Math.pow(1 - t, 3);
			for (const figure of figuresToCount) figure.textContent = String(Math.round(Number(figure.dataset.count) * eased));
			if (t < 1) requestAnimationFrame(draw);
		};
		requestAnimationFrame(draw);
	});
	watcher.observe(card, { attributes: true, attributeFilter: ['class'] });
}

/* ── Screens ───────────────────────────────────────────────────────────── */
for (const viewer of document.querySelectorAll('[data-viewer]')) {
	const tabs = [...viewer.querySelectorAll('[role="tab"]')];
	const slides = tabs.map((tab) => document.getElementById(tab.getAttribute('aria-controls')));
	const mark = viewer.querySelector('.tab-mark');
	const timer = viewer.querySelector('.viewer-timer i');
	let at = 0;

	const placeMark = () => {
		const tab = tabs[at];
		mark?.style.setProperty('--x', `${tab.offsetLeft}px`);
		mark?.style.setProperty('--w', `${tab.offsetWidth}px`);
	};

	// Starts the six seconds again: the animation is taken off and put back
	// with a style read between.
	const restart = () => {
		if (!timer || !viewer.classList.contains('auto')) return;
		viewer.classList.remove('auto');
		void timer.offsetWidth;
		viewer.classList.add('auto');
	};

	const show = (index, byHand) => {
		at = (index + tabs.length) % tabs.length;
		tabs.forEach((tab, i) => {
			tab.setAttribute('aria-selected', String(i === at));
			tab.tabIndex = i === at ? 0 : -1;
			slides[i]?.classList.toggle('on', i === at);
		});
		placeMark();
		tabs[at].scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
		if (byHand) viewer.classList.remove('auto');
		else restart();
		// The frame's colour is that of the capture it shows.
		pick();
	};

	tabs.forEach((tab, index) => {
		tab.addEventListener('click', () => show(index, true));
		tab.addEventListener('keydown', (e) => {
			const move = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
			if (!move) return;
			e.preventDefault();
			show(at + move, true);
			tabs[at].focus();
		});
	});
	timer?.addEventListener('animationend', () => show(at + 1, false));

	placeMark();
	document.fonts?.ready.then(placeMark);
	addEventListener('resize', placeMark);
	if (!reducedMotion.matches) viewer.classList.add('auto');
}

/* ── The terminal ──────────────────────────────────────────────────────── */
/*
 * The commands are typed out the first time the terminal is on screen, 14ms a
 * character. Each line is split into what has been typed and what has not; the
 * rest is hidden and keeps its place, so the block is its full size from the
 * start. The text to copy is kept from before the split.
 */
const copyText = new Map();
for (const pre of document.querySelectorAll('.terminal pre')) {
	const code = pre.querySelector('code');
	if (!code) continue;
	const text = code.textContent ?? '';
	copyText.set(pre.id, text);

	const lines = text.split('\n').map((content) => {
		const line = document.createElement('span');
		const typed = document.createElement('span');
		const rest = document.createElement('span');
		line.className = 'line';
		typed.className = 'typed';
		rest.className = 'rest';
		typed.textContent = content;
		line.append(typed, rest);
		return { line, typed, rest, content };
	});
	code.replaceChildren(...lines.map((entry) => entry.line));
	if (reducedMotion.matches || !('IntersectionObserver' in window)) continue;

	for (const entry of lines) {
		entry.typed.textContent = '';
		entry.rest.textContent = entry.content;
	}
	const type = (index) => {
		const entry = lines[index];
		if (!entry) return;
		entry.line.classList.add('typing');
		let shown = 0;
		const tick = setInterval(() => {
			shown += 1;
			entry.typed.textContent = entry.content.slice(0, shown);
			entry.rest.textContent = entry.content.slice(shown);
			if (shown < entry.content.length) return;
			clearInterval(tick);
			if (index < lines.length - 1) entry.line.classList.remove('typing');
			setTimeout(() => type(index + 1), DUR.hover);
		}, 14);
	};
	const watcher = new IntersectionObserver(
		(entries) => {
			if (!entries.some((entry) => entry.isIntersecting)) return;
			watcher.disconnect();
			setTimeout(() => type(0), DUR.travel);
		},
		{ threshold: 0.4 }
	);
	watcher.observe(pre);
}

/* ── Copy ──────────────────────────────────────────────────────────────── */
for (const button of document.querySelectorAll('[data-copy]')) {
	const label = button.querySelector('span') ?? button;
	const say = (text) => {
		const next = document.createElement('span');
		next.className = 'swap';
		next.textContent = text;
		label.replaceChildren(next);
	};
	button.addEventListener('click', async () => {
		const id = button.dataset.copy;
		const text = copyText.get(id) ?? document.getElementById(id)?.textContent ?? '';
		try {
			await navigator.clipboard.writeText(text);
			say('Copied');
			button.classList.add('done');
		} catch {
			say('Select and copy');
		}
		setTimeout(() => {
			say('Copy');
			button.classList.remove('done');
		}, 1600);
	});
}

// Tells the page's inline script that this one ran; see `index.html`.
window.hhReady = true;
