// The Daily Proof — one word, sixteen sorts, ranked against the whole field.
//
// The page is small enough to re-render whole on every change: sixteen tiles,
// a stick, a readout. State lives in `S`; every handler changes it and calls
// render(). The case is counted (daily/score.js, solveCase) in the background
// from the moment it is dealt, so by the time a word is printed the field it is
// ranked against is usually already waiting.
//
// The hands are the full game's (js/drag.js): tap a sort to set it or lift it,
// drag to move it between the case and the stick or to reorder either, hold it
// to read it (and flip a dual), right-click to flip. The sounds and the toss a
// sort makes on its way somewhere are the game's own (js/anim.js), and they
// follow the game's sound setting.

import { dealChallenge, todaysNumber, EPOCH } from './deal.js';
import {
  scoreWord, judge, withTool, solveCase, rankOf, bracketOf, BRACKETS, activeLetter, faceLetter,
  restingOf, ringStep, shiftable, loupeDelta,
} from './score.js';
import {
  COLOURS, TRIMS, NICKS, MEDIEVAL, isMark, letterGlyph, colourDesc,
  TILE_POINTS, LOUPE_CAP, CURSED_MULT, CURSED_PENALTY, EXPLOSIVE_MULT,
} from '../js/constants.js';
import { adoptExclusions, isExcluded } from '../js/excluded.js';
import { loadSettings } from '../js/state.js';
import { sfx, snapTiles, flipTiles } from '../js/anim.js';
import { OMEN_TEXT, TOOL_TEXT, SORT_TEXT, UI, RESULT, fill } from './text.js';
import { drawField } from './chart.js';

// While the mode is being tried out: walk to any challenge, and set a printed
// one again. Turn it off and the page is a daily — today's case, once.
const PLAYTEST = true;

const STORE = 'great-work-daily-v1';
const $ = id => document.getElementById(id);
const fmtN = n => n.toLocaleString('en-GB');
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ─── The dictionary ───────────────────────────────────────────────────────────
// The game's own list and the game's own exclusions. Entries carrying a marker
// (abductee+) never match in the game — adoptWordlist keeps the marker — so
// they are left out here too, rather than becoming words only this page knows.
let WORDS = [];
let WORDSET = new Set();
const has = w => WORDSET.has(w);

async function loadWords() {
  const get = async (file, embedded) => {
    // An embedded list may be empty on purpose (a bundle ships its dictionary
    // already filtered), so only a MISSING one sends the page to the network.
    if (embedded != null) return embedded;
    // Relative to the PAGE (/daily/), which is where the game's lists sit beside.
    const res = await fetch(`../wordlists/${file}`);
    if (!res.ok) throw new Error(`${file}: ${res.status}`);
    return res.text();
  };
  adoptExclusions(await get('excluded-slurs.txt', window.FOLIO_THEMES?.['excluded-slurs']));
  const text = await get('wordlist.txt', window.FOLIO_WORDLIST);
  WORDS = text.split(/\r?\n/).map(w => w.trim().toUpperCase())
    .filter(w => /^[A-Z]+$/.test(w) && !isExcluded(w));
  WORDSET = new Set(WORDS);
}

// ─── Saved proofs ─────────────────────────────────────────────────────────────
const loadStore = () => { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; } };
const saveStore = s => { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* private window */ } };

// ─── State ────────────────────────────────────────────────────────────────────
const S = {
  n: 1,
  deal: null,
  tiles: [],        // the case, faces as currently flipped
  order: [],        // socket order (drag and Shuffle rearrange it)
  word: [],         // tile ids in the stick, in order
  applied: null,    // the tool's use: { kind, id, face, offset? }
  armed: false,
  field: null,      // { results, scores, ranked } once counted
  counting: null,   // the promise of it
  result: null,     // the printed proof
  note: '',         // the status line — refusals only
  printing: false,
  open: new Set(),  // rows of the best-of list showing their setting
  openInit: false,
};

const effective = () => withTool(S.tiles, S.applied);
function wordAndRest() {
  const eff = effective();
  const byId = new Map(eff.map(t => [t.id, t]));
  const inWord = new Set(S.word);
  return { word: S.word.map(id => byId.get(id)), rest: eff.filter(t => !inWord.has(t.id)), byId };
}

// ─── A challenge ──────────────────────────────────────────────────────────────
let solveAbort = null;

function openChallenge(n) {
  n = Math.max(1, Math.floor(n) || 1);
  if (!PLAYTEST) n = Math.min(n, todaysNumber());
  // A framed host (a claude.ai artifact) may refuse to have its address rewritten.
  try { if (location.hash !== `#${n}`) history.replaceState(null, '', `#${n}`); } catch { /* framed */ }
  solveAbort?.abort();
  hidePop();

  Object.assign(S, {
    n, deal: dealChallenge(n), word: [], applied: null, armed: false, result: null,
    field: null, note: '', printing: false, open: new Set(), openInit: false,
  });
  S.tiles = S.deal.tiles.map(t => ({ ...t }));
  S.order = S.tiles.map(t => t.id);

  // A proof already printed comes back as it was printed.
  const saved = loadStore()[n];
  if (saved) {
    for (const { id, face } of saved.faces ?? []) {
      const t = S.tiles.find(x => x.id === id);
      if (t) t.activeVariant = face;
    }
    S.word = saved.word ?? [];
    S.applied = saved.applied ?? null;
    S.result = saved;
  }

  const ac = new AbortController();
  solveAbort = ac;
  S.counting = solveCase(S.deal.tiles, S.deal.tool, WORDS, has, { signal: ac.signal }).then(res => {
    if (!res || S.n !== n) return null;
    const ranked = [...res.results].map(([word, r]) => ({ word, ...r }))
      .sort((a, b) => b.score - a.score || a.word.localeCompare(b.word));
    S.field = { ...res, ranked };
    if (S.result) renderResult();
    return S.field;
  });

  render({ fresh: true });
}

// ─── Composing ────────────────────────────────────────────────────────────────
const locked = () => !!S.result || S.printing;

function place(id, at = S.word.length) {
  if (locked() || S.word.includes(id)) return;
  S.word.splice(at, 0, id);
  S.note = '';
  sfx.place();
  render();
}
function unplace(id) {
  if (locked()) return;
  S.word = S.word.filter(x => x !== id);
  S.note = '';
  sfx.retrieve();
  render();
}
function flip(id) {
  if (locked()) return;
  const t = S.tiles.find(x => x.id === id);
  if (t?.letterType !== 'dual') return;
  t.activeVariant = t.activeVariant === 1 ? 0 : 1;
  sfx.flip();
  render();
}
// Move an id to `to` within a list, `to` counted in the list as it stood before
// the move (so dropping onto a later place lands after what was there).
function moveIn(list, id, to) {
  const from = list.indexOf(id);
  if (from < 0) return list.splice(to, 0, id);
  list.splice(from, 1);
  list.splice(from < to ? to - 1 : to, 0, id);
}

function tapTile(id, zone) {
  if (S.armed) { useToolOn(id); return; }
  if (zone === 'case') place(id); else unplace(id);
}

// The keyboard: a letter places the first sort in the case showing it (or a
// dual whose other face does, flipped), Backspace lifts the last, Enter prints.
function typeLetter(L) {
  if (locked()) return;
  const eff = new Map(effective().map(t => [t.id, t]));
  const free = S.order.filter(id => !S.word.includes(id)).map(id => S.tiles.find(t => t.id === id));
  const showing = free.find(t => activeLetter(eff.get(t.id)) === L);
  if (showing) { place(showing.id); return; }
  const other = free.find(t => t.letterType === 'dual' && faceLetter(eff.get(t.id), t.activeVariant ? 0 : 1) === L);
  if (other) { other.activeVariant = other.activeVariant ? 0 : 1; place(other.id); }
}

function refuse(id) {
  sfx.nudge();
  const el = document.querySelector(`.tile[data-id="${id}"]`);
  el?.animate([{ transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'none' }], { duration: 180 });
}

// ─── The tool ─────────────────────────────────────────────────────────────────
function toolTap() {
  if (locked() || !S.deal.tool) return;
  hidePop();
  if (S.applied) { S.applied = null; S.armed = false; sfx.disarm(); render(); return; }
  S.armed = !S.armed;
  if (S.armed) sfx.arm(); else sfx.disarm();
  render();
}

function useToolOn(id) {
  const t = S.tiles.find(x => x.id === id);
  const face = t.activeVariant ?? 0;
  if (S.deal.tool === 'loupe') {
    if (!loupeDelta(t, face)) { refuse(id); return; }
    S.applied = { kind: 'loupe', id, face };
    S.armed = false;
    sfx.select();
    render();
    return;
  }
  // The ratchet asks which way, on the tile itself: two letters, nothing else.
  if (!shiftable(t, face)) { refuse(id); return; }
  const from = faceLetter(t, face);
  showPop(document.querySelector(`.tile[data-id="${id}"]`), pop => {
    const row = document.createElement('div');
    row.className = 'ratchet-row';
    for (const off of [-1, 1]) {
      const to = ringStep(from, off);
      const b = document.createElement('button');
      b.className = 'ratchet-choice';
      b.innerHTML = off < 0 ? `‹ <b>${to}</b>` : `<b>${to}</b> ›`;
      b.setAttribute('aria-label', fill(TOOL_TEXT.ratchet.on, from, to));
      b.addEventListener('click', () => {
        S.applied = { kind: 'ratchet', id, face, offset: off };
        S.armed = false;
        hidePop();
        sfx.flip();
        render();
      });
      row.appendChild(b);
    }
    pop.appendChild(row);
  }, 'pop--ratchet');
}

// ─── Printing ─────────────────────────────────────────────────────────────────
async function print() {
  if (locked() || !S.word.length) return;
  hidePop();
  S.armed = false;
  const { word, rest } = wordAndRest();
  const j = judge(word, has);
  if (!j.ok) {
    S.note = j.why === 'marksLast' ? UI.marksLast : j.why === 'markAlone' ? UI.markAlone : UI.notAWord;
    sfx.bad();
    render();
    const st = $('stick');
    st.classList.remove('stick--reject'); void st.offsetWidth; st.classList.add('stick--reject');
    return;
  }
  const sc = scoreWord(word, rest, has);
  S.printing = true;
  S.note = '';
  render();
  sfx.crank(480);
  await countUp($('roTotal'), sc.total, 480);
  sfx.total();

  const n = S.n;
  if (!S.field) { S.note = UI.waiting; render(); }
  const field = S.field ?? await S.counting;
  if (!field || S.n !== n) return;
  const { rank, field: size, pct } = rankOf(sc.total, field.scores);
  S.result = {
    set: sc.set, letters: j.letters, score: sc.total, rank, size, pct,
    bracket: bracketOf(pct), word: [...S.word], applied: S.applied,
    faces: S.tiles.filter(t => t.letterType === 'dual').map(t => ({ id: t.id, face: t.activeVariant })),
    at: Date.now(),
  };
  S.printing = false;
  S.note = '';
  const store = loadStore();
  store[n] = S.result;
  saveStore(store);
  render();
  if (rank === 1) sfx.win();
  requestAnimationFrame(() => $('result').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' }));
}

// The total counted up as the press comes down, then stamped.
function countUp(el, to, ms) {
  return new Promise(done => {
    if (reducedMotion() || !to) { el.textContent = fmtN(to); done(); return; }
    const t0 = performance.now();
    const tick = now => {
      const k = Math.min(1, (now - t0) / ms);
      el.textContent = fmtN(Math.round(to * (1 - (1 - k) ** 3)));
      if (k < 1) requestAnimationFrame(tick);
      else { el.classList.remove('ro-stamp'); void el.offsetWidth; el.classList.add('ro-stamp'); done(); }
    };
    requestAnimationFrame(tick);
  });
}

function setAgain() {
  const store = loadStore();
  delete store[S.n];
  saveStore(store);
  Object.assign(S, { result: null, word: [], applied: null, open: new Set(), openInit: false });
  render({ fresh: true });
  window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
}

// ─── Tiles ────────────────────────────────────────────────────────────────────
// The game's tile, drawn with the game's class names (makeTileEl in
// js/render.js), so daily.css can carry the same paint, trims, nicks and metals.
function tileEl(t, zone, { mini = false } = {}) {
  const div = document.createElement(mini ? 'span' : 'div');
  div.className = `tile${mini ? ' tile--mini' : ''}`;
  div.dataset.id = t.id;
  div.dataset.zone = zone;
  const L = activeLetter(t);
  if (t.trim) div.classList.add(`tile--trim-${t.trim}`);
  if (t.nick) div.classList.add(`tile--nick-${t.nick}`);
  if (t.material) div.classList.add(`tile--mat-${t.material}`);
  if (MEDIEVAL[L]) div.classList.add('tile--medieval');
  const stepped = t.ratcheted != null && t.ratcheted === t.activeVariant;
  const grown = t.louped != null && t.louped === t.activeVariant;
  if (stepped) div.classList.add('tile--ratcheted');
  if (grown) div.classList.add('tile--louped');

  const letter = document.createElement('span');
  letter.className = 'tile-letter';
  letter.dataset.len = L.length;
  letter.textContent = letterGlyph(L);
  if (t.colour) letter.style.color = COLOURS[t.colour].glyph;
  div.appendChild(letter);

  const pts = document.createElement('span');
  pts.className = `tile-pts${grown ? ' tile-pts--grown' : ''}`;
  pts.textContent = restingOf(t);
  div.appendChild(pts);

  if (t.letterType === 'dual' && t.altLetter) {
    const alt = document.createElement('span');
    alt.className = 'tile-alt';
    alt.textContent = `⇄${letterGlyph(faceLetter(t, t.activeVariant === 1 ? 0 : 1))}`;
    if (t.colour) alt.style.color = COLOURS[t.colour].glyph;
    div.appendChild(alt);
  }
  if (t.nick) {
    const lip = document.createElement('span');
    lip.className = `tile-nick tile-nick--${t.nick === 'right' ? 'r' : 'l'}`;
    div.appendChild(lip);
  }
  if (!mini) {
    div.setAttribute('role', 'button');
    div.tabIndex = 0;
    div.setAttribute('aria-label', `${L}, ${restingOf(t)}`);
    div.title = tileLines(t).map(f => (f.body ? `${f.head}: ${f.body}` : f.head)).join('\n');
  }
  return div;
}

// What a tile is, in the game's words where the game has them.
function tileLines(t) {
  const out = [];
  const L = activeLetter(t);
  const med = MEDIEVAL[L];
  if (med) {
    const reads = med.reads.length > 1
      ? `${med.reads.slice(0, -1).join(', ')} or ${med.reads[med.reads.length - 1]}` : med.reads[0];
    out.push({ head: fill(SORT_TEXT.medievalHead, med.name, reads), body: med.note });
  }
  if (t.material === 'cursed') out.push({ head: SORT_TEXT.cursed.head, body: fill(SORT_TEXT.cursed.body, CURSED_MULT, CURSED_PENALTY) });
  if (t.material === 'explosive') out.push({ head: SORT_TEXT.explosive.head, body: fill(SORT_TEXT.explosive.body, EXPLOSIVE_MULT) });
  if (t.colour) out.push({ head: `${COLOURS[t.colour].label} paint`, body: colourDesc(t.colour) });
  if (t.trim) out.push({ head: `${TRIMS[t.trim].label} trim`, body: TRIMS[t.trim].desc });
  if (t.nick) out.push({ head: NICKS[t.nick].label, body: NICKS[t.nick].desc });
  if (isMark(L)) out.push({ head: SORT_TEXT.markHead, body: SORT_TEXT.mark });
  if (t.ratcheted != null && t.ratcheted === t.activeVariant) out.push({ head: fill(SORT_TEXT.ratcheted, t.ratchetFrom) });
  if (t.louped != null && t.louped === t.activeVariant) out.push({ head: SORT_TEXT.louped });
  return out;
}

// ─── The popover ──────────────────────────────────────────────────────────────
function showPop(anchor, fillPop, skin = '') {
  if (!anchor) return;
  const pop = $('pop');
  pop.replaceChildren();
  pop.className = `pop${skin ? ` ${skin}` : ''}`;
  fillPop(pop);
  pop.hidden = false;
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  const left = Math.min(innerWidth - pw - 8, Math.max(8, r.left + r.width / 2 - pw / 2));
  const above = r.top - ph - 10;
  pop.style.left = `${left + scrollX}px`;
  pop.style.top = `${(above > 8 ? above : r.bottom + 10) + scrollY}px`;
}
function hidePop() { const p = $('pop'); if (p) p.hidden = true; }

function popLines(pop, lines) {
  for (const f of lines) {
    const h = document.createElement('div'); h.className = 'pop-head'; h.textContent = f.head;
    pop.appendChild(h);
    if (f.body) { const b = document.createElement('div'); b.className = 'pop-body'; b.textContent = f.body; pop.appendChild(b); }
  }
}

// A held tile: what it is, and for a dual the other face, one tap away.
function showTileInfo(id, anchor) {
  const t = effective().find(x => x.id === id);
  showPop(anchor, pop => {
    const lines = tileLines(t);
    popLines(pop, lines.length ? lines : [{ head: `${activeLetter(t)} · ${restingOf(t)}` }]);
    if (t.letterType === 'dual' && !locked()) {
      const b = document.createElement('button');
      b.className = 'pop-btn';
      b.textContent = fill(UI.flipTo, letterGlyph(faceLetter(t, t.activeVariant === 1 ? 0 : 1)));
      b.addEventListener('click', () => { hidePop(); flip(id); });
      pop.appendChild(b);
    }
  });
}

// ─── Rendering ────────────────────────────────────────────────────────────────
// Every render notes where each sort sat and, once the board is rebuilt, tosses
// it from there to its new place (snapTiles/flipTiles in js/anim.js) — so a sort
// set, lifted, dragged or shuffled travels rather than blinks.
function render({ fresh = false } = {}) {
  const before = fresh ? new Map() : new Map([...snapTiles($('case')), ...snapTiles($('stick'))]);
  renderHeader();
  renderAlmanac();
  renderCase(fresh);
  renderStick();
  renderReadout();
  renderBench();
  renderResult();
  if (before.size) { flipTiles($('case'), before); flipTiles($('stick'), before); }
}

function renderHeader() {
  $('numLabel').textContent = fill(UI.number, S.n);
  const d = new Date(EPOCH + (S.n - 1) * 864e5);
  $('dateLabel').textContent = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  $('prevBtn').disabled = S.n <= 1;
  $('nextBtn').disabled = !PLAYTEST && S.n >= todaysNumber();
}

function renderAlmanac() {
  const o = OMEN_TEXT[S.deal.omen];
  const el = $('almanac');
  el.textContent = o.name;
  el.title = o.desc;
}

function renderCase(fresh) {
  const host = $('case');
  host.replaceChildren();
  const eff = new Map(effective().map(t => [t.id, t]));
  S.order.forEach((id, i) => {
    const socket = document.createElement('div');
    socket.className = 'socket';
    if (!S.word.includes(id)) {
      const el = tileEl(eff.get(id), 'case');
      if (S.armed && toolFits(eff.get(id))) el.classList.add('tile--target');
      if (fresh && !reducedMotion()) { el.classList.add('tile--dealt'); el.style.animationDelay = `${i * 28}ms`; }
      socket.appendChild(el);
    }
    host.appendChild(socket);
  });
  host.classList.toggle('case--locked', locked());
}

const toolFits = t => (S.deal.tool === 'loupe' ? loupeDelta(t, t.activeVariant) > 0 : shiftable(t, t.activeVariant));

function renderStick() {
  const host = $('stick');
  host.replaceChildren();
  const { word } = wordAndRest();
  for (const t of word) {
    const el = tileEl(t, 'stick');
    if (S.armed && toolFits(t)) el.classList.add('tile--target');
    host.appendChild(el);
  }
  fitStick();
  $('status').textContent = S.note;
}

// One course of type, whatever the word: a word too long for the measure is set
// in a smaller size (fitWord in js/render.js does the same on the bench).
function fitStick() {
  const host = $('stick');
  const n = host.querySelectorAll('.tile').length;
  host.style.removeProperty('--tfs');
  host.style.removeProperty('gap');
  if (!n) return;
  const cs = getComputedStyle(host);
  const avail = host.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const base = parseFloat(getComputedStyle(host.querySelector('.tile')).fontSize);
  // A sort is 4.25em wide; the type size that lets n of them and their gaps fit.
  const sizeFor = gap => (avail - (n - 1) * gap) / (n * 4.25);
  let gap = parseFloat(cs.columnGap) || 0;
  if (sizeFor(gap) >= base) return;
  // Crowded: close the gaps up before shrinking the type any further.
  if (sizeFor(gap) < base * 0.7) { gap = 2; host.style.gap = `${gap}px`; }
  host.style.setProperty('--tfs', `${Math.max(4, Math.min(base, sizeFor(gap)))}px`);
}

const CHIP_NAMES = { purple: 'Purple', cursed: 'Hellbox iron', explosive: 'Squib lead' };
function renderReadout() {
  const { word, rest } = wordAndRest();
  const sc = word.length ? scoreWord(word, rest, has) : null;
  $('roPoints').textContent = fmtN(sc?.points ?? 0);
  if (!S.printing) $('roTotal').textContent = fmtN(sc?.total ?? 0);
  $('roMult').textContent = String(+(sc?.mult ?? 1).toFixed(2));
  const chips = $('roChips');
  chips.replaceChildren();
  // Each multiplier a swatch and its figure; the name rides on hover.
  for (const ch of sc?.chips ?? []) {
    const c = document.createElement('span');
    c.className = `chip chip--${ch.kind}`;
    c.title = ch.kind === 'length' ? fill(UI.letters, ch.count) : COLOURS[ch.kind]?.label ?? CHIP_NAMES[ch.kind];
    const sw = document.createElement('i');
    const v = document.createElement('b'); v.textContent = `×${+ch.mult.toFixed(2)}`;
    c.append(sw, v);
    chips.appendChild(c);
  }
  // A curse's toll is the one subtraction in the game.
  if (sc?.toll) {
    const c = document.createElement('span');
    c.className = 'chip chip--toll';
    c.title = SORT_TEXT.cursed.head;
    c.textContent = `−${fmtN(sc.toll)}`;
    chips.appendChild(c);
  }
  $('readout').classList.toggle('readout--live', !!sc);
}

function renderBench() {
  const tool = S.deal.tool;
  const btn = $('toolBtn');
  btn.hidden = !tool;
  if (tool) {
    const tt = TOOL_TEXT[tool];
    btn.textContent = tt.glyph;
    btn.title = `${tt.name}: ${fill(tt.desc, LOUPE_CAP)}`;
    btn.setAttribute('aria-label', tt.name);
    btn.classList.toggle('tool--armed', S.armed);
    btn.classList.toggle('tool--used', !!S.applied);
    btn.disabled = locked();
    btn.setAttribute('aria-pressed', S.armed ? 'true' : 'false');
  }
  $('printBtn').disabled = locked() || !S.word.length;
  $('clearBtn').disabled = locked() || !S.word.length;
  $('shuffleBtn').disabled = locked();
}

// ─── The result ───────────────────────────────────────────────────────────────
// "Top 100%" is true of every word, so the last bracket is said from the other
// end: past the second-last cut, a place is in the bottom of the field.
function gradeLabel(r) {
  const last = BRACKETS[BRACKETS.length - 2];
  return r.bracket > last ? fill(RESULT.bottom, 100 - last) : fill(RESULT.top, r.bracket);
}

function settingOf(entry) {
  // A plan replayed onto a fresh copy of the case: faces as the plan set them,
  // and the tool where the plan put it.
  const base = S.deal.tiles.map(t => ({ ...t }));
  for (const p of entry.plan) { const t = base.find(x => x.id === p.id); if (t) t.activeVariant = p.face; }
  const eff = withTool(base, entry.tool);
  const byId = new Map(eff.map(t => [t.id, t]));
  return entry.plan.map(p => byId.get(p.id));
}

function miniWord(tiles) {
  const row = document.createElement('span');
  row.className = 'mini-word';
  for (const t of tiles) row.appendChild(tileEl(t, 'mini', { mini: true }));
  return row;
}

let resizeChart = null;
function renderResult() {
  const host = $('result');
  const r = S.result;
  host.hidden = !r;
  host.replaceChildren();
  resizeChart = null;
  if (!r) return;

  // The slip: your word, its score, its place.
  const slip = document.createElement('div');
  slip.className = 'slip';
  const top = document.createElement('div');
  top.className = 'slip-word';
  top.appendChild(miniWord(wordAndRest().word));
  const score = document.createElement('b');
  score.className = 'slip-score';
  score.textContent = fmtN(r.score);
  top.appendChild(score);
  const grade = document.createElement('div');
  grade.className = `slip-grade${r.rank === 1 ? ' slip-grade--best' : ''}`;
  grade.textContent = r.rank === 1 ? RESULT.best : gradeLabel(r);
  const place = document.createElement('div');
  place.className = 'slip-place';
  place.textContent = fill(RESULT.place, fmtN(r.rank), fmtN(r.size));
  slip.append(top, grade, place);
  host.appendChild(slip);

  const field = S.field;
  if (!field) return;   // still counting; the .then in openChallenge comes back here

  // The field, drawn.
  const fig = document.createElement('figure');
  fig.className = 'field';
  const plot = document.createElement('div');
  plot.className = 'field-plot';
  fig.appendChild(plot);
  host.appendChild(fig);
  const label = [...r.set].map(letterGlyph).join('');
  const draw = () => drawField(plot, field.ranked, { rank: r.rank, score: r.score, label });
  draw();
  resizeChart = draw;

  // The best of the case, each with how it was set — the winner's open.
  if (!S.openInit) {
    S.open.add(field.ranked[0].word);
    // Your own row opens too when the case could have set your word better.
    if ((field.results.get(r.letters)?.score ?? 0) > r.score) S.open.add('\u0000yours');
    S.openInit = true;
  }
  const best = document.createElement('ol');
  best.className = 'best best-list';
  // Your word is in the list as YOU printed it — your place, your score, your
  // setting — and, when the case could have set it better, that setting under it.
  const mine = field.ranked.find(e => e.word === r.letters);
  const yours = { word: r.letters, score: r.score, yours: true, better: mine && mine.score > r.score ? mine : null };
  const shown = field.ranked.slice(0, 10).filter(e => e.word !== r.letters || !yours.better);
  const at = shown.findIndex(e => e.word === r.letters);
  if (at >= 0) shown[at] = { ...shown[at], yours: true };
  else {
    // Slotted in where its place puts it, so the list stays in order.
    const k = shown.findIndex(e => e.score < r.score);
    shown.splice(k < 0 ? shown.length : k, 0, yours);
  }
  const toolMark = tool => {
    const note = document.createElement('span');
    note.className = 'best-tool';
    note.textContent = TOOL_TEXT[tool.kind].glyph;
    note.title = TOOL_TEXT[tool.kind].name;
    return note;
  };
  for (const e of shown) {
    const key = e.yours ? '\u0000yours' : e.word;
    const li = document.createElement('li');
    li.className = `best-row${e.yours ? ' best-row--yours' : ''}`;
    const btn = document.createElement('button');
    btn.className = 'best-head';
    btn.setAttribute('aria-expanded', S.open.has(key) ? 'true' : 'false');
    const pl = document.createElement('span'); pl.className = 'best-place';
    pl.textContent = fmtN(e.yours ? r.rank : rankOf(e.score, field.scores).rank);
    const w = document.createElement('span'); w.className = 'best-word'; w.textContent = e.word;
    const sc = document.createElement('b'); sc.className = 'best-score'; sc.textContent = fmtN(e.score);
    btn.append(pl, w, sc);
    btn.addEventListener('click', () => {
      if (S.open.has(key)) S.open.delete(key); else S.open.add(key);
      renderResult();
    });
    li.appendChild(btn);
    if (S.open.has(key)) {
      const set = document.createElement('div');
      set.className = 'best-set';
      if (e.yours && !e.plan) {
        set.appendChild(miniWord(wordAndRest().word));
        if (r.applied) set.appendChild(toolMark(r.applied));
      } else {
        set.appendChild(miniWord(settingOf(e)));
        if (e.tool) set.appendChild(toolMark(e.tool));
      }
      li.appendChild(set);
      if (e.better) {
        const alt = document.createElement('div');
        alt.className = 'best-set best-set--better';
        alt.appendChild(miniWord(settingOf(e.better)));
        if (e.better.tool) alt.appendChild(toolMark(e.better.tool));
        const v = document.createElement('b');
        v.className = 'best-alt-score';
        v.textContent = fmtN(e.better.score);
        alt.appendChild(v);
        li.appendChild(alt);
      }
    }
    best.appendChild(li);
  }
  host.appendChild(best);

  // The way on.
  const acts = document.createElement('div');
  acts.className = 'result-acts';
  const share = document.createElement('button');
  share.className = 'btn';
  share.textContent = RESULT.share;
  share.addEventListener('click', async () => {
    const lines = [
      fill(RESULT.shareHead, S.n),
      `${[...r.set].map(letterGlyph).join('')} — ${fmtN(r.score)}`,
      `${r.rank === 1 ? RESULT.best : gradeLabel(r)} (${fill(RESULT.place, fmtN(r.rank), fmtN(r.size))})`,
      // Inside a frame the page's own address is not one anybody could open.
      ...(window.DAILY_NO_LINK ? [] : [`${location.origin}${location.pathname}#${S.n}`]),
    ];
    try { await navigator.clipboard.writeText(lines.join('\n')); share.textContent = RESULT.copied; }
    catch { share.textContent = lines.join(' · '); }
  });
  acts.appendChild(share);
  if (PLAYTEST) {
    const again = document.createElement('button');
    again.className = 'btn';
    again.textContent = RESULT.again;
    again.addEventListener('click', setAgain);
    acts.appendChild(again);
  }
  if (PLAYTEST || S.n < todaysNumber()) {
    const next = document.createElement('button');
    next.className = 'btn btn-print';
    next.textContent = RESULT.next;
    next.addEventListener('click', () => { openChallenge(S.n + 1); window.scrollTo({ top: 0 }); });
    acts.appendChild(next);
  }
  host.appendChild(acts);
}

// ─── The hands ────────────────────────────────────────────────────────────────
// js/drag.js's gesture, for the case and the stick: one code path for mouse and
// touch. A press that travels becomes a drag; one that stays put long enough
// becomes a read; anything else is a tap.
const DRAG_THRESHOLD = 8;     // px of travel before a press becomes a drag
const LONG_PRESS_MS  = 450;
let press = null;             // { pointerId, id, zone, el, x0, y0, timer, dragging, popped }
let ghost = null;

function makeGhost(el, x, y) {
  const r = el.getBoundingClientRect();
  const g = el.cloneNode(true);
  g.classList.add('drag-ghost');
  g.classList.remove('tile--target', 'tile--dealt');
  Object.assign(g.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
    fontSize: getComputedStyle(el).fontSize });
  g._dx = x - r.left;
  g._dy = y - r.top;
  document.body.appendChild(g);
  return g;
}
function moveGhost(x, y) {
  if (!ghost) return;
  ghost.style.left = `${x - ghost._dx}px`;
  ghost.style.top = `${y - ghost._dy}px`;
}

// Where in the stick a drop lands: before the nearest sort's centre, or after it.
function stickIndex(x) {
  const tiles = [...$('stick').querySelectorAll(':scope > .tile')];
  let best = tiles.length, bestDist = Infinity;
  tiles.forEach((t, i) => {
    const b = t.getBoundingClientRect();
    const cx = b.left + b.width / 2;
    const d = Math.abs(cx - x);
    if (d < bestDist) { bestDist = d; best = x < cx ? i : i + 1; }
  });
  return best;
}
// Which socket of the case a drop lands in: the one under the point, or the nearest.
function socketIndex(x, y) {
  const sockets = [...$('case').children];
  let best = sockets.length - 1, bestDist = Infinity;
  sockets.forEach((s, i) => {
    const b = s.getBoundingClientRect();
    const d = Math.hypot(b.left + b.width / 2 - x, b.top + b.height / 2 - y);
    if (d < bestDist) { bestDist = d; best = i; }
  });
  return best;
}

function endDrag(p, x, y) {
  const under = document.elementFromPoint(x, y);
  const { id, zone } = p;
  if (under?.closest('#stick, .stick-wrap')) {
    const at = stickIndex(x);
    if (zone === 'case') {
      S.word.splice(at, 0, id);
      sfx.place();
    } else {
      moveIn(S.word, id, at);
      sfx.reorder();
    }
  } else if (under?.closest('.case')) {
    const at = socketIndex(x, y);
    if (zone === 'stick') { S.word = S.word.filter(w => w !== id); sfx.retrieve(); }
    else sfx.reorder();
    // A socket is a place, not a gap: the sort lands in the one it was dropped on.
    S.order.splice(S.order.indexOf(id), 1);
    S.order.splice(at, 0, id);
  }
  S.note = '';
}

function releasePress(commit, e) {
  if (!press) return;
  clearTimeout(press.timer);
  const p = press;
  press = null;
  const wasGhost = !!ghost;
  ghost?.remove();
  ghost = null;
  p.el.classList.remove('tile--held');
  if (commit && p.dragging) { endDrag(p, e.clientX, e.clientY); render(); return; }
  if (wasGhost) { render(); return; }
  if (commit && !p.popped) tapTile(p.id, p.zone);
}

function wireHands() {
  for (const root of [$('case'), $('stick')]) {
    root.addEventListener('pointerdown', e => {
      const el = e.target.closest('.tile');
      if (!el || press) return;
      if (e.button !== undefined && e.button !== 0) return;   // primary only
      e.preventDefault();   // no text selection, no native gesture on a sort
      hidePop();
      press = { pointerId: e.pointerId, id: Number(el.dataset.id), zone: el.dataset.zone, el,
        x0: e.clientX, y0: e.clientY, dragging: false, popped: false, timer: null };
      el.setPointerCapture?.(e.pointerId);
      press.timer = setTimeout(() => {
        if (!press || press.dragging) return;
        press.popped = true;
        showTileInfo(press.id, press.el);
        navigator.vibrate?.(12);
      }, LONG_PRESS_MS);
    });
    // Android raises contextmenu for a long press too; an active press means the
    // popover has it already, so only a genuine right-click flips.
    root.addEventListener('contextmenu', e => {
      const el = e.target.closest('.tile');
      if (!el) return;
      e.preventDefault();
      if (!press) flip(Number(el.dataset.id));
    });
  }
  addEventListener('pointermove', e => {
    if (!press || e.pointerId !== press.pointerId) return;
    if (!press.dragging) {
      if (press.popped || locked()) return;
      if (Math.hypot(e.clientX - press.x0, e.clientY - press.y0) < DRAG_THRESHOLD) return;
      press.dragging = true;
      clearTimeout(press.timer);
      hidePop();
      sfx.lift();
      ghost = makeGhost(press.el, e.clientX, e.clientY);
      press.el.classList.add('tile--held');
    }
    moveGhost(e.clientX, e.clientY);
  });
  addEventListener('pointerup', e => {
    if (press && e.pointerId === press.pointerId) releasePress(true, e);
  });
  addEventListener('pointercancel', e => {
    if (press && e.pointerId === press.pointerId) releasePress(false, e);
  });
}

// Hold-to-read for the two things on the page that explain themselves but are
// not tiles: the almanac's day and the tool. A tap still does what it does.
function wireReading(el, lines) {
  let timer = null, held = false;
  el.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    held = false;
    timer = setTimeout(() => { held = true; showPop(el, pop => popLines(pop, lines())); navigator.vibrate?.(12); }, LONG_PRESS_MS);
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, () => clearTimeout(timer));
  el.addEventListener('click', e => {
    if (held) { held = false; e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);
}

function wire() {
  wireHands();
  wireReading($('toolBtn'), () => {
    const tt = TOOL_TEXT[S.deal.tool];
    return [{ head: tt.name, body: fill(tt.desc, LOUPE_CAP) }];
  });
  // The almanac's day has nothing to do but be read, so a tap reads it.
  $('almanac').addEventListener('click', e => {
    e.stopPropagation();
    const o = OMEN_TEXT[S.deal.omen];
    if (!$('pop').hidden) { hidePop(); return; }
    showPop($('almanac'), pop => popLines(pop, [{ head: o.name, body: o.desc }]));
  });
  document.addEventListener('pointerdown', e => {
    if (!e.target.closest('#pop, .tile, #almanac')) hidePop();
  });

  // Tiles are focusable; Enter or Space taps them like a pointer would.
  document.addEventListener('keydown', e => {
    const tile = e.target.closest?.('.tile[data-zone="case"], .tile[data-zone="stick"]');
    if (tile && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      tapTile(Number(tile.dataset.id), tile.dataset.zone);
      requestAnimationFrame(() => document.querySelector(`.tile[data-id="${tile.dataset.id}"]`)?.focus());
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest?.('input, textarea')) return;
    // Enter on a focused button presses that button, not Print.
    const onControl = e.target.closest?.('button, summary, a, svg');
    if (/^[a-z]$/i.test(e.key)) { typeLetter(e.key.toUpperCase()); e.preventDefault(); }
    else if (e.key === 'Backspace') { const last = S.word[S.word.length - 1]; if (last != null) unplace(last); e.preventDefault(); }
    else if (e.key === 'Enter' && !onControl) { print(); e.preventDefault(); }
    else if (e.key === 'Escape') { hidePop(); if (S.armed) toolTap(); }
  });

  $('printBtn').addEventListener('click', print);
  $('clearBtn').addEventListener('click', () => {
    if (locked() || !S.word.length) return;
    S.word = []; S.note = '';
    sfx.clear();
    render();
  });
  $('shuffleBtn').addEventListener('click', () => {
    if (locked()) return;
    for (let i = S.order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [S.order[i], S.order[j]] = [S.order[j], S.order[i]];
    }
    sfx.shuffle();
    render();
  });
  $('toolBtn').addEventListener('click', toolTap);
  $('prevBtn').addEventListener('click', () => openChallenge(S.n - 1));
  $('nextBtn').addEventListener('click', () => openChallenge(S.n + 1));
  addEventListener('hashchange', () => {
    const n = parseInt(location.hash.slice(1), 10);
    if (n && n !== S.n) openChallenge(n);
  });
  let rz = 0;
  addEventListener('resize', () => {
    cancelAnimationFrame(rz);
    rz = requestAnimationFrame(() => { fitStick(); resizeChart?.(); hidePop(); });
  });
}

// ─── Start ────────────────────────────────────────────────────────────────────
// A host that can swap the page under a running game (a claude.ai artifact,
// republished mid-playtest) asks for what to carry across; this is the case as
// it was being set. Everything printed is in localStorage already.
const snapshot = () => ({
  n: S.n, word: S.word, applied: S.applied, order: S.order,
  faces: S.tiles.map(t => [t.id, t.activeVariant ?? 0]),
});
function resume(data) {
  if (!data || data.n !== S.n || S.result) return;
  const ids = new Set(S.tiles.map(t => t.id));
  for (const [id, face] of data.faces ?? []) { const t = S.tiles.find(x => x.id === id); if (t) t.activeVariant = face; }
  if (Array.isArray(data.order) && data.order.length === ids.size && data.order.every(id => ids.has(id))) S.order = data.order;
  S.word = (data.word ?? []).filter(id => ids.has(id));
  S.applied = data.applied ?? null;
  render();
}

async function start(carried = {}) {
  window.claude?.hot?.snapshot?.(snapshot);
  loadSettings();   // the full game's sound setting, where the two share a site
  // On its own subdomain the full game is somewhere else entirely; the build
  // says where (tools/build-daily.mjs, --home).
  if (window.DAILY_HOME) document.querySelector('.mast-house').href = window.DAILY_HOME;
  wire();
  try {
    await loadWords();
  } catch (err) {
    $('status').textContent = UI.dictFallback;
    console.error(err);
    return;
  }
  const fromHash = parseInt(location.hash.slice(1), 10);
  openChallenge(carried?.n || fromHash || todaysNumber());
  resume(carried);
}

if (window.claude?.hot?.ready) window.claude.hot.ready(start);
else start(window.claude?.hot?.data ?? {});
