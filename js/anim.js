// Animation + sound toolkit. Every duration is divided by the player's
// animation-speed setting, so the whole game scrubs faster or slower together.

import { settings } from './state.js';
import { uiZoom } from './appearance.js';

// ─── Speed ────────────────────────────────────────────────────────────────────

export const dur = ms => ms / (settings.animSpeed || 1);
export const sleep = ms => new Promise(r => setTimeout(r, dur(ms)));

// CSS animations read the same factor from a custom property
export function applySpeedCSS() {
  document.documentElement.style.setProperty('--aspd', settings.animSpeed);
}

// ─── FX layer ─────────────────────────────────────────────────────────────────

const fx = () => document.getElementById('fx');

// The page is zoomed by the UI scale (see js/appearance.js), so rects arrive
// in visual coordinates while a px written into the page is multiplied by the
// zoom on the way out. Everything that positions FX from a rect divides here.

// ─── Flying tile clones ───────────────────────────────────────────────────────
// The clone keeps the *element's own* size — the from/to rects supply only
// positions, and are often other things (the bag button, the spent tray).

export function flyClone(el, fromRect, toRect, {
  duration = 430, scaleFrom = 1, scaleTo = 1, fade = false, arc = 26,
} = {}) {
  const layer = fx();
  if (!layer) return Promise.resolve();

  const z = uiZoom();
  const own = el.getBoundingClientRect();
  const w = own.width  || fromRect.width;
  const h = own.height || fromRect.height;

  const clone = el.cloneNode(true);
  clone.classList.add('fly-clone');
  clone.classList.remove('tile--ghost', 'tile--selected', 'tile--held', 'drag-ghost');
  Object.assign(clone.style, {
    left:  `${(fromRect.left + fromRect.width / 2 - w / 2) / z}px`,
    top:   `${(fromRect.top + fromRect.height / 2 - h / 2) / z}px`,
    width: `${w / z}px`,
    height:`${h / z}px`,
  });
  layer.appendChild(clone);

  const dx = ((toRect.left + toRect.width / 2)  - (fromRect.left + fromRect.width / 2)) / z;
  const dy = ((toRect.top  + toRect.height / 2) - (fromRect.top  + fromRect.height / 2)) / z;

  const anim = clone.animate([
    { transform: `translate(0,0) scale(${scaleFrom})`, opacity: 1 },
    { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - arc}px) scale(${(scaleFrom + scaleTo) / 2})`,
      opacity: 1, offset: 0.55 },
    { transform: `translate(${dx}px, ${dy}px) scale(${scaleTo})`, opacity: fade ? 0.1 : 1 },
  ], { duration: dur(duration), easing: 'cubic-bezier(.5,.08,.32,1)', fill: 'forwards' });

  // If rendering is suspended (hidden tab), `finished` never resolves —
  // race it against a clock-based timeout so game flow can't deadlock.
  return Promise.race([
    anim.finished.catch(() => {}),
    new Promise(r => setTimeout(r, dur(duration) + 600)),
  ]).then(() => clone.remove());
}

// Reveal a tile that was rendered ghosted (used after a fly-in lands)
export function popReveal(el) {
  if (!el) return;
  el.classList.remove('tile--ghost');
  el.animate([
    { transform: 'scale(1.18)', filter: 'brightness(1.25)' },
    { transform: 'scale(1)',    filter: 'brightness(1)' },
  ], { duration: dur(190), easing: 'ease-out' });
}

// ─── Reading time ─────────────────────────────────────────────────────────────

// How long a line should stay up to be read — measured off the text, so a long
// quip isn't given less reading time than a short one.
const READ_BASE     = 1500;
const READ_PER_CHAR = 55;
const READ_MAX      = 7000;
// Markup isn't reading — a coin glyph is one thing to take in, not its tag.
const plainLength = html => String(html ?? '').replace(/<[^>]*>/g, '').length;
export const readingTime = text =>
  Math.min(READ_MAX, READ_BASE + READ_PER_CHAR * plainLength(text));

// ─── Floating numbers / labels ────────────────────────────────────────────────

// A floater is two things in one coat: a short number wants a pop that keeps up
// with the score cinematic, while anything past PROSE_LEN is treated as prose
// and holds still to be read (length measured on the text, so markup doesn't
// count). Capped below READ_MAX because floaters stack.
const PROSE_LEN  = 16;
const PROSE_MAX  = 3600;
const POP_MS     = 950;

// A flourish is a cheer, not a paragraph: read it once, briskly, and let it go
// before the next word is being composed.
const FLOURISH_MAX = 2200;
export const flourishTime = text => Math.min(FLOURISH_MAX, readingTime(text));

export function floatText(anchor, html, cls = '', { dy = -54, duration = null } = {}) {
  const layer = fx();
  if (!layer || !anchor) return;
  const rect = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : anchor;

  const z = uiZoom();
  const f = document.createElement('div');
  f.className = `floater ${cls}`;
  f.innerHTML = html;
  f.style.left = `${(rect.left + rect.width / 2) / z}px`;
  f.style.top  = `${rect.top / z - 4}px`;
  layer.appendChild(f);

  // Prose framing is a property of the TEXT, not of the caller's timing: an
  // explicit `duration` only overrides how long the hold lasts.
  const prose = plainLength(html) > PROSE_LEN;
  const total = duration ?? (prose ? Math.min(PROSE_MAX, readingTime(html)) : POP_MS);

  // Prose holds at two-thirds of its drift and finishes the rise only as it
  // fades, so a long note doesn't sail off the top while it waits to be read.
  const frames = prose
    ? [
        { transform: 'translate(-50%, 6px) scale(.7)',              opacity: 0 },
        { transform: `translate(-50%, ${dy * 0.4}px) scale(1.1)`,   opacity: 1, offset: Math.min(0.16, 260 / total) },
        { transform: `translate(-50%, ${dy * 0.66}px) scale(1)`,    opacity: 1, offset: 1 - Math.min(0.22, 420 / total) },
        { transform: `translate(-50%, ${dy}px) scale(.95)`,         opacity: 0 },
      ]
    : [
        { transform: 'translate(-50%, 6px) scale(.7)',     opacity: 0 },
        { transform: 'translate(-50%, -16px) scale(1.12)', opacity: 1, offset: 0.22 },
        { transform: `translate(-50%, ${dy}px) scale(1)`,  opacity: 0 },
      ];

  f.animate(frames, { duration: dur(total), easing: 'cubic-bezier(.2,.6,.3,1)', fill: 'forwards' })
   .finished.catch(() => {}).then(() => f.remove());
  setTimeout(() => f.remove(), dur(total) + 800);
}

// ─── Speech bubbles (a patron's unsolicited opinion) ──────────────────────────

export function speechBubble(anchorEl, text, { duration = null, cls = '' } = {}) {
  const layer = fx();
  if (!layer || !anchorEl) return;
  const r = anchorEl.getBoundingClientRect();

  const z = uiZoom();
  const b = document.createElement('div');
  b.className = `speech-bubble${cls ? ` ${cls}` : ''}`;
  b.textContent = text;
  b.style.left = `${(r.left + r.width / 2) / z}px`;
  b.style.top  = `${r.top / z - 6}px`;
  layer.appendChild(b);

  // Rise and fall are a fixed cost; everything between them is reading time.
  const total = duration ?? readingTime(text);
  const rise  = Math.min(0.18, 260 / total);
  const fall  = Math.min(0.24, 420 / total);

  const anim = b.animate([
    { transform: 'translate(-50%, 10px) scale(.6)',    opacity: 0 },
    { transform: 'translate(-50%, -10px) scale(1.06)', opacity: 1, offset: rise },
    { transform: 'translate(-50%, -16px) scale(1)',    opacity: 1, offset: 1 - fall },
    { transform: 'translate(-50%, -28px) scale(.92)',  opacity: 0 },
  ], { duration: dur(total), easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' });

  Promise.race([
    anim.finished.catch(() => {}),
    new Promise(res => setTimeout(res, dur(total) + 500)),
  ]).then(() => b.remove());
}

// ─── Number tweens ────────────────────────────────────────────────────────────

// Scores reach six figures, so digits are grouped by default. Pass `fmt` to opt out.
export const fmtNum = v => Math.round(v).toLocaleString();

export function tweenNum(el, to, { duration = 260, fmt = fmtNum, bump = true } = {}) {
  if (!el) return Promise.resolve();
  const from = el._val ?? (parseFloat(String(el.textContent).replace(/[^\d.-]/g, '')) || 0);
  el._val = to;
  if (from === to) { el.textContent = fmt(to); return Promise.resolve(); }

  if (bump) {
    el.animate([
      { transform: 'scale(1)' }, { transform: 'scale(1.22)' }, { transform: 'scale(1)' },
    ], { duration: dur(duration + 80), easing: 'ease-out' });
  }

  const t0 = performance.now();
  const d  = dur(duration);
  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.textContent = fmt(to);
      resolve();
    };
    function frame(t) {
      if (done) return;
      const k = Math.min(1, (t - t0) / d);
      const eased = 1 - (1 - k) ** 3;
      el.textContent = fmt(from + (to - from) * eased);
      if (k < 1) requestAnimationFrame(frame); else finish();
    }
    requestAnimationFrame(frame);
    // rAF stalls in hidden tabs — guarantee completion by wall clock
    setTimeout(finish, d + 120);
  });
}

export function setNum(el, v, fmt = fmtNum) {
  if (!el) return;
  el._val = v;
  el.textContent = fmt(v);
}

// Multipliers can be fractional, so they get their own formatter: 1.5 → "1.5".
export const fmtMult = v => String(Math.round(v * 100) / 100);

// ─── Pulses & sparkles ────────────────────────────────────────────────────────

export function pulse(el, cls, ms = 360) {
  if (!el) return;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), dur(ms));
}

export function sparkleBurst(anchor, n = 12) {
  const layer = fx();
  if (!layer || !anchor) return;
  const rect = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : anchor;
  const z  = uiZoom();
  const cx = (rect.left + rect.width / 2) / z;
  const cy = (rect.top + rect.height / 2) / z;

  for (let i = 0; i < n; i++) {
    const s = document.createElement('div');
    s.className = 'sparkle';
    s.style.left = `${cx}px`;
    s.style.top  = `${cy}px`;
    layer.appendChild(s);
    const ang  = Math.random() * Math.PI * 2;
    const dist = 36 + Math.random() * 64;
    s.animate([
      { transform: 'translate(-50%,-50%) scale(1) rotate(0deg)',   opacity: 1 },
      { transform: `translate(${Math.cos(ang) * dist - 8}px, ${Math.sin(ang) * dist - 8}px) scale(.1) rotate(${Math.random() > .5 ? 220 : -220}deg)`,
        opacity: 0 },
    ], { duration: dur(620 + Math.random() * 240), easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' })
     .finished.catch(() => {}).then(() => s.remove());
    setTimeout(() => s.remove(), dur(900) + 800);
  }
}

// ─── Sound (tiny WebAudio synth, no assets) ───────────────────────────────────
// The palette is the print house itself: lead type clacking into the composing
// stick, brass on the counter, the press coming down. Every voice is mixed from
// three primitives — `blip` (a note), `knock` (a pitched body meeting wood),
// `grit` (a burst of filtered noise: the snap of an impact, the shush of paper)
// — through one shared compressor, so the loud moments squash instead of clip
// and a single clack can sit at a confident level.

let _ac = null, _bus = null, _noise = null;
function ac() {
  if (!settings.sound) return null;
  try {
    _ac ??= new (window.AudioContext || window.webkitAudioContext)();
    if (_ac.state === 'suspended') _ac.resume();
    return _ac;
  } catch { return null; }
}

// A context born outside a user gesture stays suspended (and the opening
// draw is swallowed) — so it is primed on the first gesture, not the first
// sound. `once` because priming is idempotent after that.
document.addEventListener('pointerdown', () => ac(), { once: true, passive: true });
document.addEventListener('keydown', () => ac(), { once: true });

function bus(ctx) {
  if (!_bus) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 18;
    comp.ratio.value = 6;
    comp.attack.value = 0.002;
    comp.release.value = 0.14;
    const master = ctx.createGain();
    master.gain.value = 0.6;
    comp.connect(master);
    master.connect(ctx.destination);
    _bus = comp;
  }
  return _bus;
}

// Notes keep their own attack and decay at any game speed — nothing chipmunks —
// but the SPACING within a phrase follows the animation clock, so a fanfare's
// last note can't land after the moment it belongs to has already gone.
const beat = s => s / (settings.animSpeed || 1);

function blip(freq, { time = 0.08, type = 'triangle', gain = 0.09, when = 0, slide = 0 } = {}) {
  const ctx = ac();
  if (!ctx) return;
  const t0 = ctx.currentTime + beat(when);
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + time);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + time);
  osc.connect(g).connect(bus(ctx));
  osc.start(t0);
  osc.stop(t0 + time + 0.05);
}

// A pitched knock — the body of the impact. The pitch falling as it sounds is
// most of what reads as "something physical was set down".
function knock(freq, { time = 0.09, gain = 0.3, when = 0, type = 'sine', drop = 0.45 } = {}) {
  const ctx = ac();
  if (!ctx) return;
  const t0 = ctx.currentTime + beat(when);
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * drop), t0 + time);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + time);
  osc.connect(g).connect(bus(ctx));
  osc.start(t0);
  osc.stop(t0 + time + 0.05);
}

// Filtered noise. `band` centres a bandpass (`sweep` glides it as it decays),
// `low` caps with a lowpass instead; `attack` past a few ms turns the burst
// into a swell. The source loops one shared buffer from a random offset, so
// no two bursts are quite the same grain.
function grit({ time = 0.06, gain = 0.25, when = 0, band = 0, q = 1, sweep = 0, low = 0, attack = 0.002 } = {}) {
  const ctx = ac();
  if (!ctx) return;
  if (!_noise) {
    _noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.5), ctx.sampleRate);
    const d = _noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = ctx.currentTime + beat(when);
  const src = ctx.createBufferSource();
  src.buffer = _noise;
  src.loop = true;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + time);
  let node = src;
  if (band) {
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(band, t0);
    f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(60, band + sweep), t0 + time);
    node.connect(f);
    node = f;
  }
  if (low) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = low;
    node.connect(f);
    node = f;
  }
  node.connect(g).connect(bus(ctx));
  src.start(t0, Math.random() * 0.4);
  src.stop(t0 + time + 0.05);
}

// The signature clack — a knock with the snap of the impact on top. The pitch
// takes a little jitter so a row of tiles sounds like handwork, not gunfire.
function clack(freq, { gain = 1, when = 0, snap = 2600 } = {}) {
  knock(freq * (0.96 + Math.random() * 0.08), { time: 0.07, gain: 0.32 * gain, when });
  grit({ time: 0.035, gain: 0.26 * gain, when, band: snap, q: 0.9 });
}

// The scoring climb — C-major pentatonic, one note per tile. The climb is the
// point, so a long word caps at the top rather than wrapping back down.
const TICK_SCALE = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760, 2093, 2349];
// The colour multipliers climb too, but by chords: each lit colour rings the
// bell higher up a major arpeggio.
const CHIME_STEPS = [1, 1.25, 1.5, 2, 2.5, 3];

// ─── The metals' bodies ───────────────────────────────────────────────────────
// Each metal strikes with its own body; the scoring note always rides on top,
// so the climb up the scale survives whatever the tile is cast from. Lead is
// the standing clack and needs no entry. Auditioned on the Sound Specimen
// sheet; these are the picks.
const MATERIAL_BODY = {
  // Glass — thin, high and cold; barely there. Weightless, like the tile.
  ghost() {
    blip(2093, { time: 0.2, type: 'sine', gain: 0.07 });
    blip(3136, { time: 0.16, type: 'sine', gain: 0.04, when: 0.015 });
    grit({ time: 0.02, gain: 0.06, band: 6000, q: 1 });
  },
  // Prism — the clack, then the light splitting upward.
  rainbow() {
    clack(190, { gain: 0.9 });
    [1047, 1319, 1568].forEach((f, k) =>
      blip(f, { time: 0.12, type: 'sine', gain: 0.07, when: 0.02 + k * 0.035 }));
  },
  // Bloom — a soft strike that opens rather than snaps.
  rose() {
    knock(210, { time: 0.12, gain: 0.24, type: 'sine', drop: 0.55 });
    blip(660, { time: 0.26, type: 'sine', gain: 0.07, when: 0.01 });
    blip(990, { time: 0.2, type: 'sine', gain: 0.035, when: 0.03 });
  },
  // Felt — pressed into something soft; the quietest sort in the case.
  blind() {
    knock(120, { time: 0.09, gain: 0.26, type: 'sine', drop: 0.38 });
    grit({ time: 0.05, gain: 0.16, low: 380, attack: 0.006 });
  },
  // Shadow — the clack, answered a beat later from somewhere below.
  cursed() {
    clack(190, { gain: 0.9 });
    clack(95, { when: 0.13, gain: 0.35, snap: 900 });
  },
};

export const sfx = {
  // Each tile pays: type pressed onto the page, a note higher up the scale.
  // The body of the strike is the tile's metal; the note is always the scale's.
  tick(i = 0, material = null) {
    (MATERIAL_BODY[material] ?? (() => clack(190)))();
    blip(TICK_SCALE[Math.min(i, TICK_SCALE.length - 1)], { time: 0.09, type: 'triangle', gain: 0.12 });
  },
  // A ×Mult engages: the old low growl, under a ratchet-arm knock for teeth.
  mult() {
    knock(120, { time: 0.12, gain: 0.4, type: 'triangle', drop: 0.5 });
    blip(170, { time: 0.14, type: 'sawtooth', gain: 0.07, slide: -40 });
    grit({ time: 0.04, gain: 0.18, band: 1400, q: 1.2 });
  },
  // A patron leans in: airy on purpose — the one voice here that isn't wood.
  aura() {
    blip(740, { time: 0.12, type: 'sine', gain: 0.1, slide: 220 });
    grit({ time: 0.18, gain: 0.05, band: 5200, q: 0.6, sweep: 2400 });
  },
  // Paint lands, a colour lights: a small bell, struck — the soft mallet tap,
  // the fundamental, a fifth, and the inharmonic shimmer a real bell carries.
  chime(step = 0) {
    const root = 660 * CHIME_STEPS[Math.min(step, CHIME_STEPS.length - 1)];
    grit({ time: 0.02, gain: 0.1, band: 4000, q: 1 });
    blip(root, { time: 0.22, type: 'sine', gain: 0.12 });
    blip(root * 1.5, { time: 0.2, type: 'sine', gain: 0.07, when: 0.05 });
    blip(root * 2.76, { time: 0.1, type: 'sine', gain: 0.03, when: 0.01 });
  },
  // Coin, tuned: the chink rings the SAME note the scale just played, an
  // octave and a twelfth up — a harmonic of the climb, so it can never clash
  // with it. `i` is the scale step just paid; passed at the one call site that
  // knows it (the tile loop in main.js), defaulted elsewhere to a mid climb.
  coin(i = 3) {
    const f = TICK_SCALE[Math.min(i, TICK_SCALE.length - 1)];
    grit({ time: 0.015, gain: 0.1, band: 5600, q: 0.9 });
    blip(f * 2, { time: 0.05, type: 'sine', gain: 0.1 });
    blip(f * 3, { time: 0.07, type: 'sine', gain: 0.05, when: 0.008 });
  },
  // Good news that isn't money: a discard refunded, a tile back to the bag, a
  // patron crowned. Two soft notes stepping up, G to C — the smallest
  // possible yes, and never mistaken for the coin's own chink.
  gain() {
    blip(784, { time: 0.09, type: 'sine', gain: 0.08 });
    blip(1047, { time: 0.14, type: 'sine', gain: 0.08, when: 0.06 });
    grit({ time: 0.015, gain: 0.05, band: 3600, q: 1 });
  },
  // The press winds up under the counting readout… (ms matches the tween)
  crank(ms = 480) {
    const t = beat(ms / 1000);
    grit({ time: t, gain: 0.1, band: 500, q: 0.8, sweep: 700, attack: t * 0.7 });
    blip(70, { time: t, type: 'sawtooth', gain: 0.05, slide: 50 });
  },
  // …and comes DOWN: the platen's thud, the frame's rattle, then the old
  // triad rising out of it so the figure still sings.
  total() {
    knock(130, { time: 0.28, gain: 0.55, drop: 0.28 });
    grit({ time: 0.16, gain: 0.4, low: 500 });
    grit({ time: 0.05, gain: 0.25, band: 3200, q: 0.7 });
    blip(392, { time: 0.26, type: 'triangle', gain: 0.1, when: 0.03 });
    blip(494, { time: 0.26, type: 'triangle', gain: 0.09, when: 0.05 });
    blip(587, { time: 0.32, type: 'triangle', gain: 0.09, when: 0.07 });
  },
  // Page complete: the old fanfare given a body — each note doubled a hair
  // apart, two knocks of the press under it, brass on the last beat.
  win() {
    [523, 659, 784, 1047].forEach((f, i) => {
      blip(f, { time: 0.24, type: 'triangle', gain: 0.1, when: i * 0.09 });
      blip(f * 1.004, { time: 0.28, type: 'triangle', gain: 0.06, when: i * 0.09 + 0.01 });
    });
    knock(170, { time: 0.08, gain: 0.25 });
    knock(200, { time: 0.08, gain: 0.25, when: 0.18 });
    blip(3136, { time: 0.18, type: 'sine', gain: 0.06, when: 0.36 });
    grit({ time: 0.03, gain: 0.1, band: 5000, q: 0.8, when: 0.36 });
  },
  // The press winds down; something heavy is set on the floor at the end.
  lose() {
    blip(220, { time: 0.3, type: 'sawtooth', gain: 0.07, slide: -80 });
    blip(150, { time: 0.45, type: 'sawtooth', gain: 0.07, when: 0.18, slide: -50 });
    knock(90, { time: 0.3, gain: 0.42, drop: 0.5, when: 0.42 });
    grit({ time: 0.2, gain: 0.2, low: 350, when: 0.42 });
  },
  // A refusal: the forme jams — two dead knocks, the second lower.
  bad() {
    knock(160, { time: 0.08, gain: 0.28, drop: 0.6 });
    knock(110, { time: 0.12, gain: 0.32, drop: 0.55, when: 0.09 });
    grit({ time: 0.05, gain: 0.12, low: 600, when: 0.09 });
  },
  // A tile leaves the bag: the lightest pick — its landing owns the clack.
  draw() {
    grit({ time: 0.03, gain: 0.12, band: 2200, q: 1.4, sweep: 900 });
    blip(620, { time: 0.05, type: 'triangle', gain: 0.05, slide: 160 });
  },
  // …and lands on the rack.
  land() { clack(210, { gain: 0.9 }); },
  // A tile swept off the board: mostly air…
  discard() {
    grit({ time: 0.09, gain: 0.16, band: 1500, q: 0.7, sweep: -900 });
    blip(330, { time: 0.06, type: 'triangle', gain: 0.04, slide: -90 });
  },
  // …until the pile takes it.
  file() {
    knock(150, { time: 0.06, gain: 0.22, drop: 0.55 });
    grit({ time: 0.025, gain: 0.1, band: 900, q: 1 });
  },
  // A tile going up: the flare, the old falling crackle, and embers spitting.
  burn() {
    grit({ time: 0.28, gain: 0.22, band: 900, q: 0.7, sweep: 2200 });
    blip(880, { time: 0.1, type: 'sawtooth', gain: 0.05, slide: 420 });
    blip(260, { time: 0.34, type: 'sawtooth', gain: 0.06, when: 0.06, slide: -170 });
    for (let i = 0; i < 5; i++) {
      grit({ time: 0.02, gain: 0.14, band: 2400 + Math.random() * 2600, q: 2,
             when: 0.08 + i * 0.055 + Math.random() * 0.03 });
    }
  },

  // ─── The composing layer ────────────────────────────────────────────────────
  // Everything from here down fires dozens of times a minute, so it is texture
  // rather than event: a hand working, under a room that stays quiet until the
  // press comes down. The scale and the platen keep the loud end to themselves.

  // A tile set into the groove — pressed into something soft rather than
  // dropped on it. Deliberately smaller than land(), which is the rack's.
  place() {
    knock(150, { time: 0.05, gain: 0.18, drop: 0.4 });
    grit({ time: 0.03, gain: 0.07, low: 700, attack: 0.004 });
  },
  // …and lifted back out again: air, and nothing else. The inverse gesture,
  // and quiet enough to vanish under a fast hand.
  retrieve() {
    grit({ time: 0.07, gain: 0.11, band: 1200, q: 0.6, sweep: 900 });
  },
  // A tile slid to another place in the same row — a spacer dropping in. No
  // body at all, because nothing arrived: the row simply closed up differently.
  reorder() {
    grit({ time: 0.012, gain: 0.16, band: 3800, q: 3 });
  },
  // A tile taken up: the smallest possible tick, rising — pitch UP is the
  // whole of what says lifted rather than set down. Fires on every drag's
  // first frame, so it stays under the sounds it precedes rather than
  // announcing itself.
  lift() {
    blip(560, { time: 0.02, type: 'sine', gain: 0.028, slide: 140 });
  },
  // The groove emptied at a stroke — a handful of type dropped in a heap. The
  // one loud thing down here, because it undoes a minute's work in one keypress.
  clear() {
    knock(120, { time: 0.12, gain: 0.35, drop: 0.45 });
    grit({ time: 0.09, gain: 0.2, low: 900 });
  },
  // The hand turned over: one muffled rattle with two bodies inside it, so it
  // reads as a mass of sorts rather than a count of them.
  shuffle() {
    grit({ time: 0.24, gain: 0.15, low: 2600, attack: 0.02 });
    knock(150, { time: 0.06, gain: 0.16, when: 0.05, drop: 0.6 });
    knock(190, { time: 0.06, gain: 0.14, when: 0.14, drop: 0.6 });
  },
  // A dual tile turned over: the flick of the flip, then the other face landing.
  flip() {
    grit({ time: 0.03, gain: 0.1, band: 2800, q: 1.4, sweep: -1200 });
    clack(260, { gain: 0.45, when: 0.028 });
  },

  // ─── Marks and modes ────────────────────────────────────────────────────────
  // A tile marked — the tick, with the graphite of the stroke under it.
  select() {
    blip(1175, { time: 0.05, type: 'sine', gain: 0.07 });
    grit({ time: 0.012, gain: 0.07, band: 4200, q: 1.2 });
  },
  // …and the mark taken off: the same note, bent down. The pair has to be
  // told apart by ear alone, since the tile is usually under a thumb.
  deselect() {
    blip(880, { time: 0.05, type: 'sine', gain: 0.055, slide: -160 });
    grit({ time: 0.012, gain: 0.05, band: 3000, q: 1.2 });
  },
  // A mode comes on — discard armed, or a tool taken up off the bench. A latch
  // rather than a note: what changed is what the next tap will MEAN, and no
  // pitched voice says that as plainly as two dry clicks.
  arm() {
    grit({ time: 0.01, gain: 0.18, band: 3800, q: 3 });
    grit({ time: 0.014, gain: 0.15, band: 2400, q: 2.6, when: 0.052 });
  },
  // …and off again, with the tool set back down after it.
  disarm() {
    grit({ time: 0.012, gain: 0.14, band: 2400, q: 2.6 });
    grit({ time: 0.01, gain: 0.12, band: 3600, q: 3, when: 0.04 });
    knock(150, { time: 0.06, gain: 0.16, when: 0.06, drop: 0.55 });
  },
  // A tap the board won't take. bad() is the press jamming on a whole word;
  // this is one refused tile, and says no without accusing you of anything.
  nudge() {
    knock(110, { time: 0.09, gain: 0.22, drop: 0.4 });
    grit({ time: 0.05, gain: 0.1, low: 400, attack: 0.005 });
  },

  // ─── The shelf, the sheets, the page ────────────────────────────────────────
  // A patron takes a new seat: a chair pulled in, and someone settling into it.
  // Seat order is a rule of precedence, so the drop is worth a body.
  seat() {
    knock(110, { time: 0.12, gain: 0.32, drop: 0.6 });
    grit({ time: 0.07, gain: 0.14, low: 600, attack: 0.006 });
    blip(330, { time: 0.1, type: 'sine', gain: 0.04, when: 0.03 });
  },
  // A patron leaves the shelf, or a ghost is let go: the door, and no coin in
  // it. The refund is already counting up in the purse; this is the departure.
  dismiss() {
    knock(100, { time: 0.14, gain: 0.3, drop: 0.5 });
    grit({ time: 0.09, gain: 0.16, low: 500 });
  },
  // A sheet rises: the brass latch, and the door swinging in on the room
  // behind it. Nothing answers it on the way out — a sheet closing is its own
  // silence, and a pair of doors on every inspector would wear thin fast.
  sheetOpen() {
    grit({ time: 0.014, gain: 0.16, band: 3600, q: 2.6 });
    grit({ time: 0.2, gain: 0.1, low: 1400, attack: 0.05, when: 0.03 });
  },
  // A view changes inside a sheet. One dry tick and no more: you walk in and
  // out of four stalls a fair, and this is navigation, not an act.
  page() {
    grit({ time: 0.014, gain: 0.12, band: 3400, q: 2.4 });
  },
  // A new chapter: one bell, struck and left to ring. The same overtones as
  // chime() — mallet, fundamental, fifth, and the inharmonic a real bell
  // carries — but held four times as long, because nothing is being counted.
  chapter() {
    grit({ time: 0.02, gain: 0.1, band: 4000, q: 1 });
    blip(990,  { time: 0.42, type: 'sine', gain: 0.12 });
    blip(1485, { time: 0.36, type: 'sine', gain: 0.07, when: 0.05 });
    blip(2732, { time: 0.16, type: 'sine', gain: 0.03, when: 0.01 });
  },
  // The quota bar reaches its mark: a gauge clicking over. Threaded under the
  // count rather than stopping it — the page is made, and the figure carries on.
  quotaMet() {
    for (let i = 0; i < 3; i++) {
      grit({ time: 0.01, gain: 0.1, band: 3200, q: 2.6, when: i * 0.04 });
    }
    blip(1319, { time: 0.2, type: 'sine', gain: 0.07, when: 0.12 });
  },
};
