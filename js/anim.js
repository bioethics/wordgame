// Animation + sound toolkit. Every duration is divided by the player's
// animation-speed setting, so the whole game scrubs faster or slower together.

import { settings } from './state.js';

// ─── Speed ────────────────────────────────────────────────────────────────────

export const dur = ms => ms / (settings.animSpeed || 1);
export const sleep = ms => new Promise(r => setTimeout(r, dur(ms)));

// CSS animations read the same factor from a custom property
export function applySpeedCSS() {
  document.documentElement.style.setProperty('--aspd', settings.animSpeed);
}

// ─── FX layer ─────────────────────────────────────────────────────────────────

const fx = () => document.getElementById('fx');

// ─── Flying tile clones ───────────────────────────────────────────────────────
// Clone `el`, place the clone at fromRect, fly it to toRect with a slight arc.

export function flyClone(el, fromRect, toRect, {
  duration = 430, scaleFrom = 1, scaleTo = 1, fade = false, arc = 26,
} = {}) {
  const layer = fx();
  if (!layer) return Promise.resolve();

  const clone = el.cloneNode(true);
  clone.classList.add('fly-clone');
  clone.classList.remove('tile--ghost', 'tile--selected', 'tile--held', 'drag-ghost');
  Object.assign(clone.style, {
    left:  `${fromRect.left}px`,
    top:   `${fromRect.top}px`,
    width: `${fromRect.width}px`,
    height:`${fromRect.height}px`,
  });
  layer.appendChild(clone);

  const dx = (toRect.left + toRect.width / 2)  - (fromRect.left + fromRect.width / 2);
  const dy = (toRect.top  + toRect.height / 2) - (fromRect.top  + fromRect.height / 2);

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

// ─── Floating numbers / labels ────────────────────────────────────────────────

export function floatText(anchor, html, cls = '', { dy = -54, duration = 950 } = {}) {
  const layer = fx();
  if (!layer || !anchor) return;
  const rect = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : anchor;

  const f = document.createElement('div');
  f.className = `floater ${cls}`;
  f.innerHTML = html;
  f.style.left = `${rect.left + rect.width / 2}px`;
  f.style.top  = `${rect.top - 4}px`;
  layer.appendChild(f);

  f.animate([
    { transform: 'translate(-50%, 6px) scale(.7)',          opacity: 0 },
    { transform: 'translate(-50%, -16px) scale(1.12)',      opacity: 1, offset: 0.22 },
    { transform: `translate(-50%, ${dy}px) scale(1)`,       opacity: 0 },
  ], { duration: dur(duration), easing: 'cubic-bezier(.2,.6,.3,1)', fill: 'forwards' })
   .finished.catch(() => {}).then(() => f.remove());
  setTimeout(() => f.remove(), dur(duration) + 800);
}

// ─── Number tweens ────────────────────────────────────────────────────────────

export function tweenNum(el, to, { duration = 260, fmt = v => Math.round(v).toString(), bump = true } = {}) {
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

export function setNum(el, v, fmt = x => Math.round(x).toString()) {
  if (!el) return;
  el._val = v;
  el.textContent = fmt(v);
}

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
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

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

let _ac = null;
function ac() {
  if (!settings.sound) return null;
  try {
    _ac ??= new (window.AudioContext || window.webkitAudioContext)();
    if (_ac.state === 'suspended') _ac.resume();
    return _ac;
  } catch { return null; }
}

function blip(freq, { time = 0.08, type = 'triangle', gain = 0.09, when = 0, slide = 0 } = {}) {
  const ctx = ac();
  if (!ctx) return;
  const t0 = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + time);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + time);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + time + 0.05);
}

export const sfx = {
  tick(i = 0)  { blip(480 + i * 52, { time: 0.07, type: 'triangle', gain: 0.07 }); },
  mult()       { blip(170, { time: 0.13, type: 'sawtooth', gain: 0.05, slide: -40 }); },
  aura()       { blip(740, { time: 0.10, type: 'sine', gain: 0.06, slide: 220 }); },
  chime()      { blip(660, { time: 0.16, type: 'sine', gain: 0.05 });
                 blip(880, { time: 0.18, type: 'sine', gain: 0.05, when: 0.07 }); },
  coin()       { blip(1320, { time: 0.05, type: 'square', gain: 0.035 });
                 blip(1760, { time: 0.10, type: 'square', gain: 0.03, when: 0.05 }); },
  total()      { blip(392, { time: 0.24, type: 'triangle', gain: 0.07 });
                 blip(494, { time: 0.24, type: 'triangle', gain: 0.06, when: 0.02 });
                 blip(587, { time: 0.30, type: 'triangle', gain: 0.06, when: 0.04 }); },
  win()        { [523, 659, 784, 1047].forEach((f, i) => blip(f, { time: 0.22, type: 'triangle', gain: 0.06, when: i * 0.09 })); },
  lose()       { blip(220, { time: 0.3, type: 'sawtooth', gain: 0.05, slide: -80 });
                 blip(150, { time: 0.45, type: 'sawtooth', gain: 0.05, when: 0.18, slide: -50 }); },
  bad()        { blip(190, { time: 0.16, type: 'square', gain: 0.04, slide: -60 }); },
  draw()       { blip(620, { time: 0.05, type: 'triangle', gain: 0.035, slide: 160 }); },
  discard()    { blip(330, { time: 0.06, type: 'triangle', gain: 0.035, slide: -90 }); },
};
