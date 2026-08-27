// Appearance: the room's theme, the table's layout, and the UI scale.
//
// The theme repaints the ROOM — page, wood, leather, groove, watermark — and
// deliberately not the objects standing in it: parchment cards, ivory tiles,
// the paints and trims all keep their colours, because they mean things. The
// deadline's ember light also stays itself in every theme (body.deadline-on
// pins the room dark), so the third page always feels like the third page.
//
// The scale is a plain CSS zoom on <body>, driven by --ui on <html>. Auto mode
// sizes the board to the window; a fixed factor is available for taste. An
// inline script in index.html pre-sets data-theme / data-layout / --ui from
// localStorage before the stylesheet paints, so none of this flashes — this
// module is the owner from then on.

import { settings, saveSettings } from './state.js';

// ─── The rooms ────────────────────────────────────────────────────────────────
// `swatch` is the picker's three-colour spine: page, wood, accent.

export const THEMES = {
  candlelit: {
    name: 'Candlelit',
    blurb: 'the press by candlelight',
    swatch: ['#221726', '#5d3f28', '#d9a64b'],
    themeColor: '#150e18',
  },
  foolscap: {
    name: 'Foolscap',
    blurb: 'the shutters thrown open',
    swatch: ['#e8dcbc', '#a97a49', '#a8761f'],
    themeColor: '#e8dcbc',
  },
  hellbox: {
    name: 'Hellbox',
    blurb: 'the type runs hot',
    swatch: ['#1c0c0f', '#57301f', '#ff8a5e'],
    themeColor: '#120708',
  },
  moonstone: {
    name: 'Moonstone',
    blurb: 'the night shift',
    swatch: ['#141b2c', '#4e3a2e', '#9fc2ff'],
    themeColor: '#0c1120',
  },
  baize: {
    name: 'The Baize',
    blurb: 'the gaming table',
    swatch: ['#14291f', '#6b3d2a', '#d9a64b'],
    themeColor: '#0b1d15',
  },
};

export const LAYOUTS = {
  classic: {
    name: 'Folio',
    blurb: 'one centred column — the original',
  },
  desk: {
    name: 'Workshop',
    blurb: 'ledger on the left, press on the right — for wide screens',
  },
};

const DEFAULT_THEME  = 'candlelit';
const DEFAULT_LAYOUT = 'classic';

// ─── UI scale ─────────────────────────────────────────────────────────────────
// Auto sizes the board to the window: the classic column is designed around
// ~1240×880 of viewport, the workshop spreads wider and shorter. Below the
// mobile breakpoints the media queries own the sizing, so auto never leaves 1.
// A chosen factor is honoured, but clamped so the board can always fit the
// window it is in.

export const SCALE_MIN = 0.85;
export const SCALE_MAX = 1.75;

const AUTO_FIT = {
  classic: { w: 1320, h: 920 },
  desk:    { w: 1720, h: 800 },
};

function autoScale() {
  const fit = AUTO_FIT[activeLayout()] ?? AUTO_FIT.classic;
  const s = Math.min(innerWidth / fit.w, innerHeight / fit.h, SCALE_MAX);
  return Math.max(1, s);
}

// The factor actually applied: never force a scale the window can't hold.
function effectiveScale() {
  const chosen = settings.uiScale === 'auto' ? autoScale()
    : Math.max(SCALE_MIN, Math.min(SCALE_MAX, Number(settings.uiScale) || 1));
  return Math.min(chosen, Math.max(1, innerWidth / 1180));
}

let _ui = 1;

// Everything that positions FX from getBoundingClientRect needs this: rects
// and pointer events arrive in visual (zoomed) coordinates, while a px written
// into the zoomed page is multiplied by the zoom on the way back out. Divide.
export const uiZoom = () => _ui;

export function applyScale() {
  _ui = Math.round(effectiveScale() * 1000) / 1000;
  document.documentElement.style.setProperty('--ui', String(_ui));
}

// ─── Applying ─────────────────────────────────────────────────────────────────

export function activeTheme()  { return THEMES[settings.theme]   ? settings.theme  : DEFAULT_THEME; }
export function activeLayout() { return LAYOUTS[settings.layout] ? settings.layout : DEFAULT_LAYOUT; }

export function applyTheme() {
  const id = activeTheme();
  document.documentElement.dataset.theme = id;
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEMES[id].themeColor);
}

export function applyLayout() {
  document.documentElement.dataset.layout = activeLayout();
  applyScale();                   // the two layouts fit a window differently
}

export function setTheme(id) {
  settings.theme = THEMES[id] ? id : DEFAULT_THEME;
  applyTheme();
  saveSettings();
}

export function setLayout(id) {
  settings.layout = LAYOUTS[id] ? id : DEFAULT_LAYOUT;
  applyLayout();
  saveSettings();
}

export function setUiScale(v) {
  settings.uiScale = v === 'auto' ? 'auto'
    : Math.max(SCALE_MIN, Math.min(SCALE_MAX, Number(v) || 1));
  applyScale();
  saveSettings();
}

export function initAppearance() {
  applyTheme();
  applyLayout();                  // calls applyScale
  let raf = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(applyScale);
  });
}
