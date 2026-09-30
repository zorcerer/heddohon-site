// heddohon.app: the room's colour, the theme switch, the sleeve and the copy key.

const root = document.documentElement;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

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
 * when the page has nothing of its own to offer.
 */
const colours = new Map();
const ratios = new Map();
const figures = [...document.querySelectorAll('[data-tint]')];

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
	if (!top || top === current) return;
	const img = top.querySelector('img');
	whenLoaded(img).then(() => {
		if (!colours.has(top)) colours.set(top, sample(img));
		current = top;
		tint(colours.get(top) ?? NEUTRAL);
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

/* ── Theme ─────────────────────────────────────────────────────────────── */
const themeColour = document.querySelector('meta[name="theme-color"]');
function applyTheme(theme) {
	root.dataset.theme = theme;
	themeColour?.setAttribute('content', theme === 'light' ? '#f0e7d5' : '#0b0c0f');
}
applyTheme(root.dataset.theme);

document.querySelector('.theme')?.addEventListener('click', () => {
	const next = root.dataset.theme === 'light' ? 'dark' : 'light';
	applyTheme(next);
	try {
		localStorage.setItem('hh-theme', next);
	} catch {}
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

/* ── Copy ──────────────────────────────────────────────────────────────── */
for (const button of document.querySelectorAll('[data-copy]')) {
	button.addEventListener('click', async () => {
		const text = document.getElementById(button.dataset.copy)?.textContent ?? '';
		try {
			await navigator.clipboard.writeText(text);
			button.textContent = 'Copied';
		} catch {
			button.textContent = 'Select and copy';
		}
		setTimeout(() => (button.textContent = 'Copy'), 1600);
	});
}
