// The Daily Proof — one word, sixteen sorts, ranked against the whole field.
//
// The page is small enough to re-render whole on every change: sixteen tiles,
// a stick, a readout. State lives in `S`; every handler changes it and calls
// render(). The case is counted (daily/score.js, solveCase) in the background
// from the moment it is dealt, so by the time a word is printed the field it is
// ranked against is usually already waiting.

import { dealChallenge, todaysNumber, EPOCH } from './deal.js';
import {
  scoreWord, judge, withTool, solveCase, rankOf, bracketOf, BRACKETS, activeLetter, faceLetter,
  restingOf, ringStep, shiftable, loupeDelta,
} from './score.js';
import {
  COLOURS, TRIMS, NICKS, MEDIEVAL, LIGATURES, isMark, letterGlyph, colourDesc,
  TILE_POINTS, LOUPE_CAP, CURSED_MULT, CURSED_PENALTY, EXPLOSIVE_MULT,
} from '../js/constants.js';
import { adoptExclusions, isExcluded } from '../js/excluded.js';
import {
  OMEN_TEXT, TOOL_TEXT, SORT_TEXT, UI, RULES, RESULT, VERDICTS, fill,
} from './text.js';
import { drawField } from './chart.js';

// While the mode is being tried out: walk to any challenge, and set a printed
// one again. Turn it off and the page is a daily — today's case, once.
const PLAYTEST = true;

const STORE = 'great-work-daily-v1';
const $ = id => document.getElementById(id);
const fmtN = n => n.toLocaleString('en-GB');

// ─── The dictionary ───────────────────────────────────────────────────────────
// The game's own list and the game's own exclusions. Entries carrying a marker
// (abductee+) never match in the game — adoptWordlist keeps the marker — so
// they are left out here too, rather than becoming words only this page knows.
let WORDS = [];
let WORDSET = new Set();
const has = w => WORDSET.has(w);

async function loadWords() {
  const get = async (file, embedded) => {
    if (embedded) return embedded;
    // Relative to the PAGE (/daily/), which is where the game's lists sit beside.
    // A bundled build (tools/build-daily.mjs) never gets here: it carries both.
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
  order: [],        // socket order (Shuffle rearranges it)
  word: [],         // tile ids in the stick, in order
  applied: null,    // the tool's use: { kind, id, face, offset? }
  armed: false,
  field: null,      // { results, scores, ranked } once counted
  counting: null,   // the promise of it
  progress: 0,
  result: null,     // the printed proof
  note: '',         // the status line
  noteKind: '',
  printing: false,
  open: new Set(),  // rows of the best-of list showing their setting
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
  if (location.hash !== `#${n}`) history.replaceState(null, '', `#${n}`);
  solveAbort?.abort();
  hidePop();

  S.n = n;
  S.deal = dealChallenge(n);
  S.tiles = S.deal.tiles.map(t => ({ ...t }));
  S.order = S.tiles.map(t => t.id);
  S.word = [];
  S.applied = null;
  S.armed = false;
  S.result = null;
  S.field = null;
  S.progress = 0;
  S.note = '';
  S.open = new Set();
  S.openInit = false;
  S.printing = false;

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
  S.counting = solveCase(S.deal.tiles, S.deal.tool, WORDS, has, {
    signal: ac.signal,
    onProgress: p => { if (S.n === n) { S.progress = p; renderCount(); } },
  }).then(res => {
    if (!res || S.n !== n) return null;
    const ranked = [...res.results].map(([word, r]) => ({ word, ...r }))
      .sort((a, b) => b.score - a.score || a.word.localeCompare(b.word));
    S.field = { ...res, ranked };
    renderCount();
    if (S.result) renderResult();
    return S.field;
  });

  render(true);
}

// ─── Composing ────────────────────────────────────────────────────────────────
const locked = () => !!S.result || S.printing;

function place(id) {
  if (locked() || S.word.includes(id)) return;
  S.word.push(id);
  S.note = '';
  render();
}
function unplace(id) {
  if (locked()) return;
  S.word = S.word.filter(x => x !== id);
  S.note = '';
  render();
}
function flip(id) {
  if (locked()) return;
  const t = S.tiles.find(x => x.id === id);
  if (t?.letterType !== 'dual') return;
  t.activeVariant = t.activeVariant === 1 ? 0 : 1;
  render();
}

function tapTile(id, zone) {
  if (S.armed) { useToolOn(id); return; }
  if (zone === 'case') place(id); else unplace(id);
}

// The keyboard: a letter places the first sort in the case showing it (or a
// dual whose other face does, flipped), Backspace lifts the last, Enter prints.
function typeLetter(L) {
  if (locked()) return;
  const free = S.order.map(id => S.tiles.find(t => t.id === id)).filter(t => !S.word.includes(t.id));
  const eff = new Map(effective().map(t => [t.id, t]));
  const showing = free.find(t => activeLetter(eff.get(t.id)) === L);
  if (showing) { place(showing.id); return; }
  const other = free.find(t => t.letterType === 'dual' && faceLetter(eff.get(t.id), t.activeVariant ? 0 : 1) === L);
  if (other) { other.activeVariant = other.activeVariant ? 0 : 1; place(other.id); }
}

// ─── The tool ─────────────────────────────────────────────────────────────────
function toolTap() {
  if (locked() || !S.deal.tool) return;
  hidePop();
  if (S.applied) { S.applied = null; S.armed = false; S.note = ''; render(); return; }
  S.armed = !S.armed;
  S.note = S.armed ? TOOL_TEXT[S.deal.tool].armed : '';
  S.noteKind = '';
  render();
}

function useToolOn(id) {
  const t = S.tiles.find(x => x.id === id);
  const face = t.activeVariant ?? 0;
  if (S.deal.tool === 'loupe') {
    const d = loupeDelta(t, face);
    if (!d) { S.note = fill(TOOL_TEXT.loupe.capped, restingOf(t, face)); S.noteKind = 'warn'; render(); return; }
    S.applied = { kind: 'loupe', id, face };
    S.armed = false;
    S.note = '';
    render();
    return;
  }
  // The ratchet asks which way, on the tile itself.
  if (!shiftable(t, face)) { S.note = TOOL_TEXT.notHere; S.noteKind = 'warn'; render(); return; }
  const from = faceLetter(t, face);
  const anchor = document.querySelector(`.tile[data-id="${id}"]`);
  showPop(anchor, pop => {
    const head = document.createElement('div');
    head.className = 'pop-head';
    head.textContent = `${TOOL_TEXT.ratchet.name} · ${from}`;
    const row = document.createElement('div');
    row.className = 'ratchet-row';
    for (const off of [-1, 1]) {
      const to = ringStep(from, off);
      const b = document.createElement('button');
      b.className = 'ratchet-choice';
      b.innerHTML = off < 0 ? `‹ <b>${to}</b>` : `<b>${to}</b> ›`;
      b.title = fill(TOOL_TEXT.ratchet.on, from, to);
      b.addEventListener('click', () => {
        S.applied = { kind: 'ratchet', id, face, offset: off };
        S.armed = false;
        S.note = '';
        hidePop();
        render();
      });
      row.appendChild(b);
    }
    pop.append(head, row);
  });
}

// ─── Printing ─────────────────────────────────────────────────────────────────
async function print() {
  if (locked() || !S.word.length) return;
  hidePop();
  S.armed = false;
  const { word, rest } = wordAndRest();
  const j = judge(word, has);
  if (!j.ok) {
    S.note = j.why === 'marksLast' ? UI.marksLast
           : j.why === 'markAlone' ? UI.markAlone
           : fill(UI.notAWord, j.set.split('').map(letterGlyph).join(''));
    S.noteKind = 'bad';
    render();
    const st = $('stick');
    st.classList.remove('stick--reject'); void st.offsetWidth; st.classList.add('stick--reject');
    return;
  }
  const sc = scoreWord(word, rest, has);
  S.printing = true;
  S.note = S.field ? '' : UI.waiting;
  S.noteKind = '';
  render();
  stamp();

  const n = S.n;
  const field = S.field ?? await S.counting;
  if (!field || S.n !== n) return;
  const { rank, field: size, pct } = rankOf(sc.total, field.scores);
  const own = field.results.get(j.letters);
  S.result = {
    set: sc.set, letters: j.letters, score: sc.total, rank, size, pct,
    bracket: bracketOf(pct), ownBest: own?.score ?? sc.total,
    word: [...S.word], applied: S.applied,
    faces: S.tiles.filter(t => t.letterType === 'dual').map(t => ({ id: t.id, face: t.activeVariant })),
    at: Date.now(),
  };
  S.printing = false;
  S.note = '';
  const store = loadStore();
  store[n] = S.result;
  saveStore(store);
  render();
  requestAnimationFrame(() => $('result').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }));
}

function stamp() {
  const t = $('roTotal');
  t.classList.remove('ro-stamp'); void t.offsetWidth; t.classList.add('ro-stamp');
}

function setAgain() {
  const store = loadStore();
  delete store[S.n];
  saveStore(store);
  S.result = null;
  S.word = [];
  S.applied = null;
  S.open = new Set();
  S.openInit = false;
  render(true);
  window.scrollTo({ top: 0, behavior: 'smooth' });
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
  if (t.ratcheted === t.activeVariant && t.ratcheted != null) div.classList.add('tile--ratcheted');
  if (t.louped === t.activeVariant && t.louped != null) div.classList.add('tile--louped');

  const letter = document.createElement('span');
  letter.className = 'tile-letter';
  letter.dataset.len = L.length;
  letter.textContent = letterGlyph(L);
  if (t.colour) letter.style.color = COLOURS[t.colour].glyph;
  div.appendChild(letter);

  const pts = document.createElement('span');
  pts.className = 'tile-pts';
  pts.textContent = restingOf(t);
  if (t.louped === t.activeVariant && t.louped != null) pts.classList.add('tile-pts--grown');
  div.appendChild(pts);

  if (t.letterType === 'dual' && t.altLetter) {
    const other = faceLetter(t, t.activeVariant === 1 ? 0 : 1);
    const alt = document.createElement(mini ? 'span' : 'button');
    alt.className = 'tile-alt';
    alt.textContent = `⇄${letterGlyph(other)}`;
    if (!mini) {
      alt.type = 'button';
      alt.setAttribute('aria-label', `Flip to ${other}`);
      alt.dataset.flip = t.id;
    }
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
    div.setAttribute('aria-label', `${L}, ${restingOf(t)} points`);
    div.title = tileLines(t).map(f => `${f.head}${f.body ? ` — ${f.body}` : ''}`).join('\n');
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
    out.push({
      head: fill(SORT_TEXT.medievalHead, med.name, reads),
      body: fill(SORT_TEXT.medievalBody, reads, med.reads[0].length > 1 ? 'those letters do' : 'one letter',
        TILE_POINTS[L], med.note),
    });
  }
  if (t.material === 'cursed') out.push({ head: SORT_TEXT.cursed.head, body: fill(SORT_TEXT.cursed.body, CURSED_MULT, CURSED_PENALTY) });
  if (t.material === 'explosive') out.push({ head: SORT_TEXT.explosive.head, body: fill(SORT_TEXT.explosive.body, EXPLOSIVE_MULT) });
  if (t.colour) out.push({ head: `${COLOURS[t.colour].label} paint`, body: colourDesc(t.colour) });
  if (t.trim) out.push({ head: `${TRIMS[t.trim].label} trim`, body: TRIMS[t.trim].desc });
  if (t.nick) out.push({ head: NICKS[t.nick].label, body: NICKS[t.nick].desc });
  if (t.letterType === 'dual') out.push({ head: 'Dual letter', body: fill(SORT_TEXT.dual, faceLetter(t, 0), faceLetter(t, 1)) });
  if (LIGATURES.includes(L)) out.push({ head: 'Ligature', body: fill(SORT_TEXT.ligature, L) });
  if (isMark(L)) out.push({ head: 'Mark', body: SORT_TEXT.mark });
  if (t.ratcheted != null && t.ratcheted === t.activeVariant) out.push({ head: TOOL_TEXT.ratchet.name, body: fill(SORT_TEXT.ratcheted, t.ratchetFrom) });
  if (t.louped != null && t.louped === t.activeVariant) out.push({ head: TOOL_TEXT.loupe.name, body: SORT_TEXT.louped });
  if (!out.length) out.push({ head: `${L} · ${restingOf(t)} Points`, body: SORT_TEXT.plain });
  return out;
}

// ─── The popover ──────────────────────────────────────────────────────────────
function showPop(anchor, fillPop) {
  const pop = $('pop');
  pop.replaceChildren();
  fillPop(pop);
  pop.hidden = false;
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  const left = Math.min(innerWidth - pw - 8, Math.max(8, r.left + r.width / 2 - pw / 2));
  const above = r.top - ph - 10;
  pop.style.left = `${left + scrollX}px`;
  pop.style.top = `${(above > 8 ? above : r.bottom + 10) + scrollY}px`;
}
function hidePop() { $('pop').hidden = true; }

function showTileInfo(id, anchor) {
  const t = effective().find(x => x.id === id);
  showPop(anchor, pop => {
    for (const f of tileLines(t)) {
      const h = document.createElement('div'); h.className = 'pop-head'; h.textContent = f.head;
      pop.appendChild(h);
      if (f.body) { const b = document.createElement('div'); b.className = 'pop-body'; b.textContent = f.body; pop.appendChild(b); }
    }
  });
}

// ─── Rendering ────────────────────────────────────────────────────────────────
function render(fresh = false) {
  renderHeader();
  renderAlmanac();
  renderCase(fresh);
  renderStick();
  renderReadout();
  renderBench();
  renderCount();
  renderResult();
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
  $('omenName').textContent = o.name;
  $('omenDesc').textContent = o.desc;
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
      if (fresh) { el.classList.add('tile--dealt'); el.style.animationDelay = `${i * 28}ms`; }
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
  if (!word.length) {
    const p = document.createElement('span');
    p.className = 'stick-empty';
    p.textContent = UI.stickEmpty;
    host.appendChild(p);
  }
  for (const t of word) {
    const el = tileEl(t, 'stick');
    if (S.armed && toolFits(t)) el.classList.add('tile--target');
    host.appendChild(el);
  }
  fitStick();
  $('status').textContent = S.note;
  $('status').className = `status${S.noteKind ? ` status--${S.noteKind}` : ''}`;
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

function renderReadout() {
  const { word, rest } = wordAndRest();
  const sc = word.length ? scoreWord(word, rest, has) : null;
  $('roPoints').textContent = fmtN(sc?.points ?? 0);
  $('roTotal').textContent = fmtN(sc?.total ?? 0);
  $('roMult').textContent = String(+(sc?.mult ?? 1).toFixed(2));
  const chips = $('roChips');
  chips.replaceChildren();
  const list = sc?.chips ?? [];
  if (!list.length) {
    const c = document.createElement('span');
    c.className = 'chip chip--idle';
    c.textContent = '×1';
    chips.appendChild(c);
  }
  for (const ch of list) {
    const c = document.createElement('span');
    c.className = `chip chip--${ch.kind}`;
    const label = ch.kind === 'length' ? `${ch.count} letters`
      : COLOURS[ch.kind] ? COLOURS[ch.kind].label
      : ch.kind === 'purple' ? 'Purple'
      : ch.kind === 'cursed' ? 'Hellbox'
      : 'Squib';
    const sw = document.createElement('i');
    const lb = document.createElement('span'); lb.textContent = label;
    const v = document.createElement('b'); v.textContent = `×${+ch.mult.toFixed(2)}`;
    c.append(sw, lb, v);
    chips.appendChild(c);
  }
  // A curse's toll is the one subtraction in the game: said where it happens.
  if (sc?.toll) {
    const c = document.createElement('span');
    c.className = 'chip chip--toll';
    c.textContent = fill(UI.toll, fmtN(sc.toll));
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
    btn.replaceChildren();
    const g = document.createElement('span'); g.className = 'tool-glyph'; g.textContent = tt.glyph;
    const body = document.createElement('span'); body.className = 'tool-body';
    const name = document.createElement('b'); name.textContent = tt.name;
    const line = document.createElement('span'); line.className = 'tool-line';
    if (S.applied) {
      const t = S.tiles.find(x => x.id === S.applied.id);
      const from = faceLetter(t, S.applied.face);
      line.textContent = `${tool === 'ratchet'
        ? fill(tt.on, from, ringStep(from, S.applied.offset))
        : fill(tt.on, from, Math.min(LOUPE_CAP, restingOf(t, S.applied.face) * 2))}. ${locked() ? '' : TOOL_TEXT.takeBack}`;
    } else {
      line.textContent = fill(tt.desc, LOUPE_CAP);
    }
    body.append(name, line);
    btn.append(g, body);
    btn.classList.toggle('tool--armed', S.armed);
    btn.classList.toggle('tool--used', !!S.applied);
    btn.disabled = locked();
    btn.setAttribute('aria-pressed', S.armed ? 'true' : 'false');
  }
  $('printBtn').disabled = locked() || !S.word.length;
  $('clearBtn').disabled = locked() || !S.word.length;
  $('shuffleBtn').disabled = locked();
}

function renderCount() {
  const el = $('count');
  if (!S.field) {
    el.textContent = `${UI.counting} ${Math.round(S.progress * 100)}%`;
    return;
  }
  const n = S.field.results.size;
  el.textContent = n === 1 ? UI.countedOne : fill(UI.counted, fmtN(n));
}

// ─── The result ───────────────────────────────────────────────────────────────
function verdictFor(r) {
  if (r.rank === 1) return VERDICTS[0][1];
  return (VERDICTS.find(([cut]) => cut > 0 && r.pct <= cut + 1e-9) ?? VERDICTS[VERDICTS.length - 1])[1];
}

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

function renderResult() {
  const host = $('result');
  const r = S.result;
  host.hidden = !r;
  document.body.classList.toggle('printed', !!r);
  if (!r) { host.replaceChildren(); return; }
  host.replaceChildren();

  // The proof slip: your word, its score, its place.
  const slip = document.createElement('div');
  slip.className = 'slip';
  const { word } = wordAndRest();
  const top = document.createElement('div');
  top.className = 'slip-word';
  top.appendChild(miniWord(word));
  const score = document.createElement('b');
  score.className = 'slip-score';
  score.textContent = fmtN(r.score);
  top.appendChild(score);

  const grade = document.createElement('div');
  grade.className = `slip-grade${r.rank === 1 ? ' slip-grade--best' : ''}`;
  grade.textContent = r.rank === 1 ? RESULT.best : gradeLabel(r);

  const place = document.createElement('div');
  place.className = 'slip-place';
  const verdict = document.createElement('i');
  verdict.textContent = verdictFor(r);
  place.append(`${r.rank === 1 ? RESULT.placeBest : fill(RESULT.place, fmtN(r.rank), fmtN(r.size))} `, verdict);

  slip.append(top, grade, place);
  if (r.ownBest > r.score) {
    const could = document.createElement('div');
    could.className = 'slip-could';
    could.textContent = fill(RESULT.couldHave, r.letters, fmtN(r.ownBest));
    slip.appendChild(could);
  }
  host.appendChild(slip);

  const field = S.field;
  if (!field) {
    const wait = document.createElement('p');
    wait.className = 'count';
    wait.textContent = UI.waiting;
    host.appendChild(wait);
    return;
  }

  // The field, drawn.
  const fig = document.createElement('figure');
  fig.className = 'field';
  const cap = document.createElement('figcaption');
  cap.textContent = RESULT.chartTitle;
  const plot = document.createElement('div');
  plot.className = 'field-plot';
  fig.append(cap, plot);
  host.appendChild(fig);
  const glyphs = [...r.set].map(letterGlyph).join('');
  const label = r.rank === 1 ? glyphs : `${glyphs} · ${gradeLabel(r)}`;
  const draw = () => drawField(plot, field.ranked, { rank: r.rank, score: r.score, label }, { xLabel: RESULT.chartX });
  draw();
  resizeChart = draw;

  // The best of the case, with how each was set — the winner's open from the start.
  if (!S.openInit) { S.open.add(field.ranked[0].word); S.openInit = true; }
  const best = document.createElement('div');
  best.className = 'best';
  const h = document.createElement('h2');
  h.textContent = RESULT.bestWords;
  best.appendChild(h);
  const list = document.createElement('ol');
  list.className = 'best-list';
  const shown = field.ranked.slice(0, 10);
  if (!shown.some(e => e.word === r.letters)) {
    const mine = field.ranked.find(e => e.word === r.letters);
    if (mine) shown.push(mine);
  }
  for (const e of shown) {
    const li = document.createElement('li');
    li.className = 'best-row';
    if (e.word === r.letters) li.classList.add('best-row--yours');
    const btn = document.createElement('button');
    btn.className = 'best-head';
    btn.setAttribute('aria-expanded', S.open.has(e.word) ? 'true' : 'false');
    const pl = document.createElement('span'); pl.className = 'best-place'; pl.textContent = `${fmtN(rankOf(e.score, field.scores).rank)}`;
    const w = document.createElement('span'); w.className = 'best-word'; w.textContent = e.word;
    if (e.word === r.letters) { const y = document.createElement('em'); y.textContent = RESULT.yours; w.append(' ', y); }
    const sc = document.createElement('b'); sc.className = 'best-score'; sc.textContent = fmtN(e.score);
    btn.append(pl, w, sc);
    btn.addEventListener('click', () => {
      if (S.open.has(e.word)) S.open.delete(e.word); else S.open.add(e.word);
      renderResult();
    });
    li.appendChild(btn);
    if (S.open.has(e.word)) {
      const set = document.createElement('div');
      set.className = 'best-set';
      set.appendChild(miniWord(settingOf(e)));
      if (e.tool) {
        const tt = TOOL_TEXT[e.tool.kind];
        const note = document.createElement('span');
        note.className = 'best-tool';
        note.textContent = `${tt.glyph} ${tt.name}`;
        set.appendChild(note);
      }
      li.appendChild(set);
    }
    list.appendChild(li);
  }
  best.appendChild(list);
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
      r.rank === 1 ? RESULT.best : `${gradeLabel(r)} (${fill(RESULT.place, fmtN(r.rank), fmtN(r.size))})`,
      `${location.origin}${location.pathname}#${S.n}`,
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
    next.textContent = `${RESULT.next} ›`;
    next.addEventListener('click', () => { openChallenge(S.n + 1); window.scrollTo({ top: 0 }); });
    acts.appendChild(next);
  }
  host.appendChild(acts);
}
let resizeChart = null;

function renderRules() {
  const dl = $('rulesList');
  dl.replaceChildren();
  for (const [dt, dd] of RULES) {
    const t = document.createElement('dt'); t.textContent = dt;
    const d = document.createElement('dd'); d.textContent = dd;
    dl.append(t, d);
  }
}

// ─── Wiring ───────────────────────────────────────────────────────────────────
function wire() {
  // One listener for every tile: tap places or lifts, ⇄ flips, a long press reads.
  let press = null;
  const tileFrom = e => e.target.closest('.tile[data-zone="case"], .tile[data-zone="stick"]');
  document.addEventListener('pointerdown', e => {
    const tile = tileFrom(e);
    if (!tile || e.target.closest('[data-flip]')) return;
    press = { id: Number(tile.dataset.id), x: e.clientX, y: e.clientY, long: false };
    press.timer = setTimeout(() => {
      if (!press) return;
      press.long = true;
      showTileInfo(press.id, tile);
    }, 480);
  });
  const cancelPress = e => {
    if (press && e && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) { clearTimeout(press.timer); press = null; }
  };
  document.addEventListener('pointermove', cancelPress);
  document.addEventListener('pointercancel', () => { if (press) clearTimeout(press.timer); press = null; });
  document.addEventListener('contextmenu', e => { if (tileFrom(e)) e.preventDefault(); });

  document.addEventListener('click', e => {
    const flipBtn = e.target.closest('[data-flip]');
    if (flipBtn) { e.stopPropagation(); flip(Number(flipBtn.dataset.flip)); return; }
    const tile = tileFrom(e);
    if (tile) {
      const wasLong = press?.long && press.id === Number(tile.dataset.id);
      if (press) clearTimeout(press.timer);
      press = null;
      if (wasLong) return;
      hidePop();
      tapTile(Number(tile.dataset.id), tile.dataset.zone);
      return;
    }
    if (!e.target.closest('#pop')) hidePop();
  });

  // Tiles are focusable; Enter or Space taps them like a pointer would.
  document.addEventListener('keydown', e => {
    if (e.target.closest?.('.tile') && (e.key === 'Enter' || e.key === ' ')) {
      const tile = e.target.closest('.tile');
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
  $('clearBtn').addEventListener('click', () => { if (!locked()) { S.word = []; S.note = ''; render(); } });
  $('shuffleBtn').addEventListener('click', () => {
    if (locked()) return;
    for (let i = S.order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [S.order[i], S.order[j]] = [S.order[j], S.order[i]];
    }
    renderCase();
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
async function start() {
  // On its own subdomain the full game is somewhere else entirely; the build
  // says where (tools/build-daily.mjs, --home).
  if (window.DAILY_HOME) document.querySelector('.mast-house').href = window.DAILY_HOME;
  renderRules();
  wire();
  $('status').textContent = UI.loading;
  try {
    await loadWords();
  } catch (err) {
    $('status').textContent = UI.dictFallback;
    $('status').className = 'status status--bad';
    console.error(err);
    return;
  }
  const fromHash = parseInt(location.hash.slice(1), 10);
  openChallenge(fromHash || todaysNumber());
}

start();
