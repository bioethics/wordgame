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

import { dealChallenge, todaysNumber, traitsOf, EPOCH, TUBE_OFFER, PROOF_STORE } from './deal.js';
import {
  scoreWord, judge, withTool, solveCase, rankOf, bracketOf, BRACKETS, activeLetter, faceLetter,
  restingOf, ringStep, shiftable, loupeDelta, settingOf, solveWords, solvePairs, pairBest, RING,
} from './score.js';
import { tablesForDay, seatIdsOfDay, listsNeeded, LISTS, LIST_FILES, adoptList, PATRONS, EDITORS, spellingsFor, barred, barsAny } from './table.js';
import {
  COLOURS, TRIMS, NICKS, MEDIEVAL, letterGlyph, colourDesc, SPIKE_MULT,
  LOUPE_CAP, CURSED_MULT, CURSED_PENALTY, LENGTH_MULT_MIN, lengthMult, lengthFlourish,
  makeTileTemplate,
} from '../js/constants.js';
import { PATRON_CARDS } from '../js/patron-cards.js';
import { BOSS_CARDS } from '../js/boss-cards.js';
import { adoptExclusions, isExcluded } from '../js/excluded.js';
import { loadSettings } from '../js/state.js';
import {
  sfx, snapTiles, flipTiles, applySpeedCSS, sleep, pulse, floatText, tweenNum, setNum,
  sparkleBurst, fmtMult, flourishTime,
} from '../js/anim.js';
import {
  TRAIT_TEXT, TOOL_TEXT, SORT_TEXT, UI, RESULT, PATRON_TEXT, EDITOR_TEXT, SPIKE_TEXT, PAIR_TEXT, fill, COUNT_WORDS,
  HOWTO, DEF_TEXT,
  DAILY_CARDS,
} from './text.js';
import { drawField } from './chart.js';

// While the mode is being tried out: walk to any challenge, and set a printed
// one again. Turn it off and the page is a daily — today's case, once.
const PLAYTEST = true;

// Keyed to the deal's salt: a re-dealt case must not reopen on an old proof.
const STORE = PROOF_STORE;
const $ = id => document.getElementById(id);
const fmtN = n => n.toLocaleString('en-GB');
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ─── The dictionary ───────────────────────────────────────────────────────────
// The game's own list and the game's own exclusions, filtered to plain A–Z
// entries as a guard: the list once carried its source's annotation marks
// (abductee+), which the game never matched, and an entry like that must not
// become a word only this page knows.
let WORDS = [];
let WORDSET = new Set();
// The dictionary, and on a licence's day the spellings it admits besides
// (spellingsFor in daily/table.js): the page judges and the solver counts with
// both, so the field is the field the day's patron allows.
let EXTRA = new Set();
const inDict = w => WORDSET.has(w);
const has = w => WORDSET.has(w) || EXTRA.has(w);
// A word only the licence lets through.
const byLicence = tiles => EXTRA.size > 0 && judge(tiles, has).ok && !judge(tiles, inDict).ok;

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

// The lists today's seats read (the registers, the parts of speech, the
// commonest words), fetched the first time a day asks for them. An embedded
// bundle carries them in FOLIO_THEMES under the same names as the files.
const listLoads = new Map();
function loadLists(keys) {
  return Promise.all(keys.map(key => {
    if (!listLoads.has(key)) {
      const file = LIST_FILES[key];
      const name = file.split('/').pop().replace(/\.txt$/, '');
      const embedded = window.FOLIO_THEMES?.[name];
      listLoads.set(key, (embedded != null ? Promise.resolve(embedded)
        : fetch(`../${file}`).then(r => { if (!r.ok) throw new Error(`${file}: ${r.status}`); return r.text(); }))
        .then(text => adoptList(key, text)));
    }
    return listLoads.get(key);
  }));
}

// ─── Definitions ──────────────────────────────────────────────────────────────
// What each word in the results means, from wordlists/definitions/ (built by
// tools/build-definitions.mjs): a file per first two letters, a few tens of
// kilobytes, fetched for every word the results list as soon as they show
// (prefetchDefs), so a tap finds its definition already here. An embedded
// bundle carries them in FOLIO_DEFS. A row asks with defSpan, and is filled
// when its file lands.
const DEFS = new Map();
const defLoads = new Map();
const defKey = word => word.slice(0, 2).toLowerCase();
function loadDefs(word) {
  const K = defKey(word);
  if (!/^[a-z]{1,2}$/.test(K)) return Promise.resolve();
  if (!defLoads.has(K)) {
    const embedded = window.FOLIO_DEFS?.[K];
    defLoads.set(K, (embedded != null ? Promise.resolve(embedded)
      : fetch(`../wordlists/definitions/${K[0]}/${K}.txt`).then(r => (r.ok ? r.text() : '')))
      .then(text => {
        for (const line of text.split('\n')) {
          const tab = line.indexOf('\t');
          if (tab > 0) DEFS.set(line.slice(0, tab).toUpperCase(), line.slice(tab + 1));
        }
      })
      .catch(() => {}));
  }
  return defLoads.get(K);
}
const prefetchDefs = words => { for (const w of words) loadDefs(headOf(w)); };
// The dictionary word a licensed spelling stands for (ZEAZONZ's SEASONS, under
// the Izzard; MATE's MATTE, under the Haplographer), whose definition it shows.
const headOf = word => {
  if (inDict(word)) return word;
  for (const T of S.tables ?? []) { const w = T.reads?.(word, inDict); if (w) return w; }
  return word;
};
// A word's definition, or a name's: the Expectant Parents' licence admits names
// the dictionary doesn't hold.
const defOf = word => DEFS.get(word)
  ?? (LISTS.names?.has(word) || LISTS.borrowed?.has(word) ? DEF_TEXT.name : null);
const showDef = d => (d ? d[0].toUpperCase() + d.slice(1) : '');
// `headed`: the definition names its word, once. An inflection's already does
// (EMBARKATIONS gives "EMBARKATION: the act of…"); any other is given its own
// ("URIAL: bearded reddish sheep…").
const HEADED = /^[A-Z][A-Z'-]*: /;
function defSpan(word, cls = 'best-def', headed = false) {
  const s = document.createElement('span');
  s.className = cls;
  // A licensed spelling is always headed, by the word it stands for.
  const head = headOf(word);
  if (head !== word) headed = true;
  const fill = () => {
    const d = defOf(head);
    s.textContent = !d ? '' : headed && !HEADED.test(d) ? `${head}: ${d}` : showDef(d);
    s.hidden = !s.textContent;
  };
  s.hidden = true;
  loadDefs(head).then(fill);
  return s;
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
  words: [[]],      // tile ids in each stick, in order — two sticks on a two-word day
  active: 0,        // the stick a tap or a key sets into
  seat: 0,          // on a day with a choice of patrons, the one seated
  tables: [],       // the day's compiled seatings (tablesForDay)
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
const pairDay = () => S.deal?.day.kind === 'pair';
const placedIn = id => S.words.findIndex(w => w.includes(id));
const placed = id => placedIn(id) >= 0;
// The table a word is scored under right now: the day's patron or editor, or
// on a choice day, whichever is seated.
const tableNow = () => (S.tables.length ? S.tables[S.deal.day.kind === 'choice' ? S.seat : 0] : null);
const seatNow = () => (S.deal.day.kind === 'choice' ? S.deal.day.choices[S.seat] : S.deal.day.patron) ?? null;

// The Turnkey's locks are his seat's, not the case's: they hold while he is
// seated, and lift when a reader on a Sunday seats the other patron. Synced at
// every render: a sort he locks comes off the stick, and a tool used on it is
// handed back.
function syncLocks() {
  const T = tableNow();
  for (const t of S.tiles) t.locked = barred(T, t.id);
  if (S.result || !T?.bars) return;
  S.words = S.words.map(w => w.filter(id => !barred(T, id)));
  if (S.applied && barred(T, S.applied.id)) S.applied = null;
}
// ...and stand together at the end of the case, as they do after a shuffle.
function locksToEnd() {
  const T = tableNow();
  if (T?.bars) S.order = [...S.order.filter(id => !barred(T, id)), ...S.order.filter(id => barred(T, id))];
}

function wordAndRest(k = S.active) {
  const eff = effective();
  const byId = new Map(eff.map(t => [t.id, t]));
  const inAny = new Set(S.words.flat());
  return { word: (S.words[k] ?? []).map(id => byId.get(id)), rest: eff.filter(t => !inAny.has(t.id) && !t.locked), byId };
}
const scoreOf = k => {
  const { word, rest } = wordAndRest(k);
  return word.length ? scoreWord(word, rest, has, tableNow()) : null;
};

// ─── A challenge ──────────────────────────────────────────────────────────────
let solveAbort = null;

function openChallenge(n) {
  n = Math.max(1, Math.floor(n) || 1);
  if (!PLAYTEST) n = Math.min(n, todaysNumber());
  // A framed host (a claude.ai artifact) may refuse to have its address rewritten.
  try { if (location.hash !== `#${n}`) history.replaceState(null, '', `#${n}`); } catch { /* framed */ }
  solveAbort?.abort();
  hidePop();
  // A word left half-set on this day comes back (read before the first render,
  // which would otherwise file the empty stick over it).
  const draft = loadDrafts()[n];

  const deal = dealChallenge(n);
  Object.assign(S, {
    n, deal, words: deal.day.kind === 'pair' ? [[], []] : [[]], active: 0, seat: 0,
    applied: null, armed: false, result: null, best: null,
    field: null, note: '', printing: false, open: new Set(), openInit: false,
  });
  EXTRA = new Set();
  S.tables = tablesForDay(deal.day, has);
  S.traits = traitsOf(deal);
  S.tiles = deal.tiles.map(t => ({ ...t }));
  // The Turnkey's locked sorts stand together at the end of the case.
  S.order = S.tiles.map(t => t.id);
  locksToEnd();
  S.tracks = tracksOf(S.tiles);

  // A proof already printed comes back as it was printed.
  const saved = loadStore()[n];
  if (saved) {
    restoreFaces(saved);
    S.words = saved.words ?? [saved.word ?? []];
    S.applied = saved.applied ?? null;
    S.seat = saved.seat ?? 0;
    S.result = saved;
  }

  const ac = new AbortController();
  solveAbort = ac;
  const lists = loadLists(listsNeeded(seatIdsOfDay(deal.day)));
  S.counting = lists.then(() => {
    if (ac.signal.aborted) return null;
    EXTRA = spellingsFor(S.tables, WORDS, inDict, deal.tiles, deal.tool);
    render();   // the seats can judge now that their lists are in
    return deal.day.kind === 'pair' ? countPairs(deal, ac.signal) : countWords(deal, ac.signal);
  }).then(field => {
    if (!field || S.n !== n) return null;
    S.field = field;
    if (S.result) renderResult();
    return S.field;
  });

  render({ fresh: true });
  if (draft && !S.result) resume(draft);
  if (deal.tool && !S.result && !S.applied) helloTool();
}

// A tool on the bench is easy to miss. When a day opens with one, unprinted,
// the tool lights and pulses three times once the case is dealt, then rests;
// picking it up stops it. With reduced motion it holds a still ring a moment.
let helloTimer = 0;
function helloTool() {
  const btn = $('toolBtn');
  clearTimeout(helloTimer);
  btn.classList.remove('tool--hello');
  void btn.offsetWidth;   // so a second day's greeting starts from the top
  btn.classList.add('tool--hello');
  helloTimer = setTimeout(() => btn.classList.remove('tool--hello'), reducedMotion() ? 2400 : 3200);
}

function countWords(deal, signal) {
  const words = EXTRA.size ? WORDS.concat([...EXTRA]) : WORDS;
  return solveCase(deal.tiles, deal.tool, words, has, { signal, tables: S.tables }).then(res => {
    if (!res) return null;
    const ranked = [...res.results].map(([word, r]) => ({ word, ...r }))
      .sort((a, b) => b.score - a.score || a.word.localeCompare(b.word));
    return { ...res, ranked };
  });
}

// A two-word day counts every word of the measure and then every pair of them.
async function countPairs(deal, signal) {
  const long = WORDS.filter(w => w.length >= deal.day.min);
  const words = await solveWords(deal.tiles, long, has, { signal });
  if (!words) return null;
  const pairs = await solvePairs(words, { signal });
  if (!pairs) return null;
  const byWord = new Map(words.words.map(e => [e.word, e]));
  const { scores, top, withScore } = pairs;
  return {
    pairs: true, scores, top, byWord, withScore,
    // The chart reads places through this rather than an array of millions.
    ranked: {
      length: scores.length,
      get: i => ({ score: scores[i], word: top[i] && top[i].score === scores[i] ? top[i].words.join(' + ') : '' }),
    },
  };
}

function restoreFaces(saved) {
  for (const { id, face, letter } of saved.faces ?? []) {
    const t = S.tiles.find(x => x.id === id);
    if (!t) continue;
    t.activeVariant = face;
    if (letter) t.letter = letter;
  }
}
const facesNow = () => S.tiles.filter(t => t.letterType === 'dual' || t.blank)
  .map(t => ({ id: t.id, face: t.activeVariant ?? 0, ...(t.blank ? { letter: t.letter } : {}) }));

// Every multiplier this case could light, in the order the readout reads them:
// the measure always, then each paint the case holds, then purple and the
// metal where a sort carries it. They wait on the sheet faintly from the
// first frame, so the player sees what there is to reach for (the bench's blind
// stamps, css/bench.css), and ink in as the word lights them.
function tracksOf(tiles) {
  const out = ['length'];
  // A colour the day's tube holds has its stamp too, before it is poured.
  for (const c of Object.keys(COLOURS)) if (tiles.some(t => t.colour === c) || S.deal.tube === c) out.push(c);
  if (tiles.some(t => t.trim === 'purple')) out.push('purple');
  if (tiles.some(t => t.material === 'cursed')) out.push('cursed');
  // A seat that rules ×Mult on the word has a stamp of its own; the editor's
  // spike waits blind until a word breaks the rule.
  if (S.deal.day.patron && stamps(S.deal.day.patron.id)) out.push('seat');
  if (S.deal.day.choices?.some(c => stamps(c.id))) out.push('seat');
  if (S.deal.day.editor && EDITORS[S.deal.day.editor.id]?.judge) out.push('spike');
  return out;
}
// The patrons whose ruling is a ×Mult on the word, rather than Points on tiles.
const stamps = id => !!(PATRONS[id]?.effect || PATRONS[id]?.bind) && id !== 'twins';

// ─── Composing ────────────────────────────────────────────────────────────────
const locked = () => !!S.result || S.printing;

function place(id, at = S.words[S.active].length) {
  if (locked() || placed(id) || S.tiles.find(t => t.id === id)?.locked) return;
  S.words[S.active].splice(at, 0, id);
  S.note = '';
  sfx.place();
  render();
  // A blank set without a letter asks for one, on the spot.
  const t = S.tiles.find(x => x.id === id);
  if (t?.blank && t.letter === '_') pickBlank(id);
}
function unplace(id) {
  if (locked()) return;
  const k = placedIn(id);
  if (k < 0) return;
  S.words[k] = S.words[k].filter(x => x !== id);
  S.active = k;
  S.note = '';
  sfx.retrieve();
  render();
}
function flip(id) {
  if (locked()) return;
  const t = S.tiles.find(x => x.id === id);
  if (t?.blank) { pickBlank(id); return; }
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

// On a two-word day, which stick a tap or a key sets into.
function setActive(k) {
  if (!pairDay() || k === S.active || locked()) return;
  S.active = k;
  sfx.select();
  render();
}

// The blank: a row of letters on the tile itself, as the ratchet asks which way.
function pickBlank(id) {
  if (locked()) return;
  const el = document.querySelector(`.tile[data-id="${id}"]`);
  showPop(el, pop => {
    const h = document.createElement('div'); h.className = 'pop-head'; h.textContent = UI.blankPick;
    const grid = document.createElement('div');
    grid.className = 'blank-grid';
    for (const L of RING) {
      const b = document.createElement('button');
      b.className = 'blank-choice';
      b.textContent = L;
      b.addEventListener('click', () => setBlank(id, L));
      grid.appendChild(b);
    }
    pop.append(h, grid);
  }, 'pop--blank');
}
function setBlank(id, L) {
  const t = S.tiles.find(x => x.id === id);
  if (!t || locked()) return;
  t.letter = L;
  hidePop();
  sfx.flip();
  render();
}

// The keyboard: a letter places the first sort in the case showing it (or a
// dual whose other face does, flipped, or the blank, set as it), Backspace
// lifts the last, Enter prints.
function typeLetter(L) {
  if (locked()) return;
  const eff = new Map(effective().map(t => [t.id, t]));
  const free = S.order.filter(id => !placed(id)).map(id => S.tiles.find(t => t.id === id));
  // Q finds a lone Q first and the QU ligature after it, as on the full board.
  const showing = free.find(t => !t.blank && activeLetter(eff.get(t.id)) === L)
    ?? (L === 'Q' ? free.find(t => activeLetter(eff.get(t.id)) === 'QU') : null);
  if (showing) { place(showing.id); return; }
  const other = free.find(t => t.letterType === 'dual' && faceLetter(eff.get(t.id), t.activeVariant ? 0 : 1) === L);
  if (other) { other.activeVariant = other.activeVariant ? 0 : 1; place(other.id); return; }
  const blank = free.find(t => t.blank);
  if (blank && RING.includes(L)) { blank.letter = L; place(blank.id); }
}

function clearWord() {
  if (locked() || !S.words.some(w => w.length)) return;
  // On a two-word day Clear empties the stick in hand, then the other.
  if (pairDay() && S.words[S.active].length) S.words[S.active] = [];
  else S.words = S.words.map(() => []);
  S.note = '';
  sfx.clear();
  render();
}
// The sorts still in the case are shuffled into the first sockets; the empty
// ones, whose sorts are on the stick, go to the end.
function shuffle() {
  if (locked()) return;
  const barred = new Set(S.tiles.filter(t => t.locked).map(t => t.id));
  const loose = S.order.filter(id => !placed(id) && !barred.has(id));
  for (let i = loose.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [loose[i], loose[j]] = [loose[j], loose[i]];
  }
  // Locked sorts stay together at the end, whatever the shuffle does to the rest.
  S.order = [...loose, ...S.order.filter(id => barred.has(id)), ...S.order.filter(id => placed(id))];
  sfx.shuffle();
  render();
}

function refuse(id) {
  sfx.nudge();
  const el = document.querySelector(`.tile[data-id="${id}"]`);
  el?.animate([{ transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'none' }], { duration: 180 });
}

// ─── The tool ─────────────────────────────────────────────────────────────────
function toolTap() {
  if (locked() || !S.deal.tool) return;
  $('toolBtn').classList.remove('tool--hello');
  hidePop();
  if (S.applied) { S.applied = null; S.armed = false; sfx.disarm(); render(); return; }
  S.armed = !S.armed;
  if (S.armed) sfx.arm(); else sfx.disarm();
  render();
}

function useToolOn(id) {
  const t = S.tiles.find(x => x.id === id);
  const face = t.activeVariant ?? 0;
  if (t.blank || t.ephemeral || t.wrapped) { refuse(id); return; }
  // The tube paints one of the tiles it offers, and only those.
  if (S.deal.tool === 'tube') {
    if (!t.paintOffer || t.colour) { refuse(id); return; }
    S.applied = { kind: 'tube', id, colour: S.deal.tube };
    S.armed = false;
    sfx.select();
    render();
    return;
  }
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
function reject(note, k = S.active) {
  S.note = note;
  sfx.bad();
  render();
  const st = stickEl(k);
  st.classList.remove('stick--reject'); void st.offsetWidth; st.classList.add('stick--reject');
}

async function print() {
  if (locked() || !S.words.some(w => w.length)) return;
  hidePop();
  S.armed = false;
  const K = S.words.length;
  // Every stick judged before anything prints: a word that is no word, and on
  // a two-word day a missing or a short one, sends the print back.
  const sets = [];
  for (let k = 0; k < K; k++) {
    const { word, rest } = wordAndRest(k);
    if (!word.length) { S.active = k; reject(PAIR_TEXT.both, k); return; }
    const j = judge(word, has);
    if (!j.ok) {
      S.active = k;
      reject(K > 1 ? fill(UI.notWords, word.map(activeLetter).join('')) : UI.notAWord, k);
      return;
    }
    if (pairDay() && j.letters.length < S.deal.day.min) { S.active = k; reject(fill(PAIR_TEXT.short, S.deal.day.min), k); return; }
    sets.push({ word, letters: j.letters, sc: scoreWord(word, rest, has, tableNow()) });
  }
  S.printing = true;
  S.hurry = false;
  S.note = '';
  render();
  // One word is replayed in full. On a two-word day that is the one that
  // scored more; the other's total then drops into the sum with one plop.
  const lead = sets.reduce((b, s, k) => (s.sc.total > sets[b].sc.total ? k : b), 0);
  if (K > 1) { S.active = lead; renderSticksActive(); renderReadout(sets[lead].sc); }
  await replay(sets[lead].word, sets[lead].sc, lead);
  let sum = sets[lead].sc.total;
  if (K > 1) await sumUp(lead, sum, sum);
  for (let k = 0; k < K; k++) {
    if (k === lead) continue;
    sum += sets[k].sc.total;
    await plop(k, sets[k].sc.total, sum);
  }
  // The readout ends on the word it showed being scored.
  S.active = lead;

  const n = S.n;
  if (!S.field) { S.note = UI.waiting; render(); }
  const field = S.field ?? await S.counting;
  if (!field || S.n !== n) return;
  const { rank, field: size, pct } = rankOf(sum, field.scores);
  S.result = {
    sets: sets.map(x => x.sc.set), letters: sets.map(x => x.letters), scores: sets.map(x => x.sc.total),
    score: sum, rank, size, pct, bracket: bracketOf(pct),
    words: S.words.map(w => [...w]), applied: S.applied, seat: S.seat, faces: facesNow(), at: Date.now(),
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

// A two-word day's running sum: the word's total lands on its stick, then the
// pair's on the line beneath.
async function sumUp(k, total, sum) {
  const badge = $(`stickSum${k}`);
  badge.hidden = false;
  tween(badge, total, { duration: 260 });
  pulse(badge, 'chip--pop', 500);
  const line = $('pairSum');
  line.hidden = false;
  await tween(line.querySelector('b'), sum, { duration: 360 });
  sfx.total();
  pulse(line, 'readout--slam', 500);
  await beat(ANIM.chip);
}

// The other word of a pair, all at once: its total lands on its stick and in
// the sum with a single plop, no replay.
async function plop(k, total, sum) {
  S.active = k;
  renderSticksActive();
  const badge = $(`stickSum${k}`);
  badge.hidden = false;
  badge.textContent = fmtN(total);
  pulse(badge, 'chip--pop', 500);
  sfx.place();
  const line = $('pairSum');
  line.hidden = false;
  await tween(line.querySelector('b'), sum, { duration: 240 });
  sfx.total();
  pulse(line, 'readout--slam', 500);
  await beat(ANIM.chip);
}

// ─── The print, replayed ──────────────────────────────────────────────────────
// The full game's print (submitWord in js/main.js), for one word and an empty
// table, in the order the arithmetic runs:
//   1. each sort pays its own Points, a note higher up the scale each time,
//      voiced by its metal;
//   2. each nick reads its side — every sort it counts flashes its figure —
//      and the sum lands back on the nick;
//   3. a curse left in the case takes its toll;
//   4. the multipliers, on the finished Points: each stamp's sorts glow, the
//      bell rings a step higher, and the stamp inks in — the measure with its
//      cheer;
//   5. the press comes down on the total.
// A tap or a key during it hurries the rest through (S.hurry), since the tenth
// time a player has seen it they know what it says.
const ANIM = { tile: 300, nick: 430, chip: 560, hold: 820 };   // constants.js ANIM, the game's pace
const beat = ms => (S.hurry ? Promise.resolve() : sleep(ms));
const tween = (el, to, opts = {}) => tweenNum(el, to, S.hurry ? { ...opts, duration: 60 } : opts);

const TRACK_GLOW = {
  length: '#d9e6f2', purple: '#cfa6ff', cursed: '#ff7a66', seat: '#ffe6a6', spike: '#ff9a8a',
  ...Object.fromEntries(Object.entries(COLOURS).map(([c, v]) => [c, v.bright])),
};
const trackHas = (kind, t) =>
  kind === 'length' || kind === 'seat' || kind === 'spike' || t.colour === kind
  || (kind === 'purple' && t.trim === 'purple') || t.material === kind;

// What the readout's stamps are, in the order it reads them: the word's own
// multipliers, then the seat's ruling, then the spike.
function chipsShown(sc) {
  if (!sc) return [];
  const own = sc.chips.filter(c => c.kind !== 'spike');
  const out = [...own];
  if (sc.seatX && sc.seatX !== 1) out.push({ kind: 'seat', mult: sc.seatX });
  const sp = sc.chips.find(c => c.kind === 'spike');
  if (sp) out.push(sp);
  return out;
}

async function replay(word, sc, k = 0) {
  const stickTile = id => stickEl(k).querySelector(`.tile[data-id="${id}"]`);
  const ro = { points: $('roPoints'), mult: $('roMult'), total: $('roTotal') };
  setNum(ro.points, 0); setNum(ro.total, 0); setNum(ro.mult, 1, fmtMult);
  // Every stamp the word will light is outlined in its colour, due rather than
  // struck, and fills as the print reaches it.
  for (const c of $('roChips').querySelectorAll('.chip--on')) c.classList.add('chip--due');

  // Each tile's own figure (its face, its growth, a patron's Points on it),
  // what its nick reads, and whether it prints twice.
  const parts = sc.perTile.map(p => {
    const once = p.points / p.echo;
    return { own: once - p.nick, nick: p.nick, again: p.echo > 1 ? once : 0 };
  });
  let running = 0;

  // 1. The sorts.
  for (const [i, t] of word.entries()) {
    const el = stickTile(t.id);
    pulse(el, 'tile--scoring', 360);
    if (!S.hurry) floatText(el, `+${parts[i].own}`, 'fl-points');
    sfx.tick(i, t.material ?? null);
    running += parts[i].own;
    tween(ro.points, running);
    await beat(ANIM.tile);
  }

  // 2. The nicks.
  for (const [i, t] of word.entries()) {
    const gain = parts[i].nick;
    if (!gain) continue;
    const src = stickTile(t.id);
    pulse(src, 'tile--nick-firing', 480);
    sfx.aura();
    const read = t.nick === 'right' ? word.map((_, j) => j).filter(j => j > i) : word.map((_, j) => j).filter(j => j < i);
    for (const j of read) {
      const el = stickTile(word[j].id);
      pulse(el, 'tile--nick-hit', 460);
      if (!S.hurry) floatText(el, `${restingOf(word[j])}`, 'fl-aura');
    }
    if (!S.hurry) floatText(src, `+${gain}`, 'fl-aura', { dy: -74 });
    running += gain;
    tween(ro.points, running);
    await beat(ANIM.nick);
  }

  // 2½. The tiles that print twice (The Monogrammist).
  if (parts.some(p => p.again)) {
    for (const [i, t] of word.entries()) {
      if (!parts[i].again) continue;
      const el = stickTile(t.id);
      pulse(el, 'tile--scoring', 360);
      if (!S.hurry) floatText(el, `×2`, 'fl-points');
      sfx.tick(i, null);
      running += parts[i].again;
      tween(ro.points, running);
      await beat(ANIM.tile);
    }
    seatFire();
  }

  // 3. The curse's toll.
  if (sc.toll) {
    if (!S.hurry) floatText(stickEl(k), `−${fmtN(sc.toll)}`, 'fl-curse', { dy: -60 });
    sfx.bad();
    running -= sc.toll;
    tween(ro.points, running);
    await beat(ANIM.chip);
  }

  // 3½. A seat's Points (The Twins' pairs).
  if (sc.seatPoints) {
    seatFire();
    if (!S.hurry) floatText(stickEl(k), `+${sc.seatPoints}`, 'fl-points', { dy: -60 });
    sfx.aura();
    running += sc.seatPoints;
    tween(ro.points, running);
    await beat(ANIM.chip);
  }

  // 4. The multipliers, the seat's among them, and the spike last.
  let mult = 1;
  for (const [ci, ch] of chipsShown(sc).entries()) {
    for (const t of word) {
      if (!trackHas(ch.kind, t)) continue;
      const el = stickTile(t.id);
      el?.style.setProperty('--glow', TRACK_GLOW[ch.kind]);
      pulse(el, 'tile--set-glow', 620);
    }
    if (ch.kind === 'spike') sfx.bad(); else sfx.chime(ci);
    if (ch.kind === 'seat' || ch.kind === 'spike') seatFire();
    if (!S.hurry) {
      if (ch.kind === 'length') {
        const line = `${ch.count} letters — ×${fmtMult(ch.mult)}: ${lengthFlourish(ch.count)}`;
        floatText(stickEl(k), line, 'fl-flourish', { dy: -138, duration: flourishTime(line) });
        sparkleBurst(stickEl(k), Math.min(6 + ch.count, 18));
      } else {
        floatText(stickEl(k), `${chipName(ch.kind)} ×${fmtMult(ch.mult)}`, `fl-set fl-set--${ch.kind}`, { dy: -60 });
      }
    }
    const chip = chipEl(ch.kind);
    chip?.classList.remove('chip--due');
    pulse(chip, 'chip--pop', 500);
    mult *= ch.mult;
    tween(ro.mult, Math.round(mult * 1000) / 1000, { fmt: fmtMult });
    await beat(ANIM.chip);
  }

  // 5. The press comes down.
  sfx.crank(480);
  await tween(ro.total, sc.total, { duration: 480 });
  sfx.total();
  if (!S.hurry) sparkleBurst(ro.total, 12);
  pulse($('readout'), 'readout--slam', 500);
  await beat(ANIM.hold);
}

// The seated card, lit as it speaks.
function seatFire() {
  const card = $('seats').querySelector('.seat--on, .seat--desk, .seat--only');
  if (card) pulse(card, 'seat--firing', 620);
}

// ─── Tiles ────────────────────────────────────────────────────────────────────
// The game's tile, drawn with the game's class names (makeTileEl in
// js/render.js), so daily.css can carry the same paint, trims, nicks and metals.
// `pays`, when given, is what the tile is worth in the word it stands in — its
// own figure plus whatever its nick reads — and the corner shows that instead of
// the resting value, in brass when it is more (makeTileEl's `pts` in js/render.js).
function tileEl(t, zone, { mini = false, pays = null } = {}) {
  const div = document.createElement(mini ? 'span' : 'div');
  div.className = `tile${mini ? ' tile--mini' : ''}`;
  div.dataset.id = t.id;
  div.dataset.zone = zone;
  const L = activeLetter(t);
  if (t.blank) div.classList.add('tile--blank');
  if (t.ephemeral) div.classList.add('tile--lent');
  if (t.wrapped) div.classList.add('tile--wrapped');
  if (t.locked) { div.classList.add('tile--locked'); div.setAttribute('aria-disabled', 'true'); }
  if (t.recast) div.classList.add('tile--recast');
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
  letter.textContent = L === '_' ? '' : letterGlyph(L);
  if (t.colour) letter.style.color = COLOURS[t.colour].glyph;
  div.appendChild(letter);

  const resting = restingOf(t);
  const shown = pays ?? resting;
  const ptsEl = document.createElement('span');
  ptsEl.className = `tile-pts${grown ? ' tile-pts--grown' : ''}${shown !== resting ? ' tile-pts--boosted' : ''}`;
  ptsEl.textContent = shown;
  div.appendChild(ptsEl);

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
    div.setAttribute('aria-label', t.locked ? SORT_TEXT.locked.head : `${L === '_' ? UI.blankHead : L}, ${restingOf(t)}`);
    // A head that is already a sentence ("Thorn — reads as TH.") takes no colon.
    div.title = tileLines(t).map(f => (f.body ? `${f.head}${/[.!?]$/.test(f.head) ? '' : ':'} ${f.body}` : f.head)).join('\n');
  }
  return div;
}

// What a tile is, in the game's words where the game has them.
function tileLines(t) {
  const out = [];
  const L = activeLetter(t);
  if (t.blank) out.push({ head: UI.blankHead, body: UI.blankBody });
  if (t.ephemeral) out.push({ head: UI.lentHead });
  const med = MEDIEVAL[L];
  if (med) {
    const reads = med.reads.length > 1
      ? `${med.reads.slice(0, -1).join(', ')} or ${med.reads[med.reads.length - 1]}` : med.reads[0];
    // How many letters it counts as, over every reading: Thorn two, Wynn one,
    // Yogh and Ash one or two.
    const lens = [...new Set(med.reads.map(r => r.length))].sort((a, b) => a - b);
    const count = `${lens.map(n => SORT_TEXT.letterCount[n] ?? n).join(' or ')} letter${lens.at(-1) > 1 ? 's' : ''}`;
    out.push({ head: fill(SORT_TEXT.medievalHead, med.name, reads), body: fill(SORT_TEXT.medievalBody, count) });
  }
  if (t.material === 'cursed') out.push({ head: SORT_TEXT.cursed.head, body: fill(SORT_TEXT.cursed.body, CURSED_MULT, CURSED_PENALTY) });
  if (t.colour) out.push({ head: `${COLOURS[t.colour].label} paint`, body: colourDesc(t.colour) });
  if (t.trim) out.push({ head: `${TRIMS[t.trim].label} trim`, body: TRIMS[t.trim].desc });
  if (t.nick) out.push({ head: NICKS[t.nick].label, body: NICKS[t.nick].desc });
  if (t.ratcheted != null && t.ratcheted === t.activeVariant) out.push({ head: fill(SORT_TEXT.ratcheted, t.ratchetFrom) });
  if (t.louped != null && t.louped === t.activeVariant) out.push({ head: SORT_TEXT.louped });
  if (t.painted) out.push({ head: SORT_TEXT.painted });
  if (t.wrapped) out.push(SORT_TEXT.wrapped);
  if (t.locked) return [SORT_TEXT.locked];
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
    const paid = placed(id) ? lastPays.get(id) : null;
    if (paid != null && paid !== restingOf(t)) {
      lines.push({ head: fill(UI.inWord, paid), body: fill(UI.inWordParts, restingOf(t), paid - restingOf(t)) });
    }
    popLines(pop, lines.length ? lines : [{ head: `${activeLetter(t)} · ${restingOf(t)}` }]);
    if (t.letterType === 'dual' && !locked()) {
      const b = document.createElement('button');
      b.className = 'pop-btn';
      b.textContent = fill(UI.flipTo, letterGlyph(faceLetter(t, t.activeVariant === 1 ? 0 : 1)));
      b.addEventListener('click', () => { hidePop(); flip(id); });
      pop.appendChild(b);
    }
    if (t.blank && !locked()) {
      const b = document.createElement('button');
      b.className = 'pop-btn';
      b.textContent = UI.blankChange;
      b.addEventListener('click', () => pickBlank(id));
      pop.appendChild(b);
    }
  });
}

// ─── Rendering ────────────────────────────────────────────────────────────────
// Every render notes where each sort sat and, once the board is rebuilt, tosses
// it from there to its new place (snapTiles/flipTiles in js/anim.js) — so a sort
// set, lifted, dragged or shuffled travels rather than blinks.
const stickEl = k => $(k ? 'stick1' : 'stick');
const ruleEl  = k => $(k ? 'rule1' : 'rule');
const kneeEl  = k => $(k ? 'knee1' : 'knee');
const zones = () => [$('case'), stickEl(0), stickEl(1)];

function render({ fresh = false } = {}) {
  syncLocks();
  const before = fresh ? new Map() : new Map(zones().flatMap(z => [...snapTiles(z)]));
  if (fresh) lastPays = new Map();
  const scs = S.words.map((_, k) => scoreOf(k));
  const sc = scs[S.active];
  renderHeader();
  renderAlmanac();
  renderSeats(sc);
  renderCase(fresh);
  for (let k = 0; k < 2; k++) renderStick(k, scs[k]);
  renderSticksActive();
  renderPairSum(scs);
  noteBest();
  renderBest();
  if (!S.printing) renderReadout(sc);
  renderBench();
  renderResult();
  $('status').textContent = S.note;
  if (before.size) for (const z of zones()) flipTiles(z, before);
  // Once the word is printed and scored, the case and the bench have nothing
  // left to do: they go, and the result stands under the stick.
  const done = !!S.result && !S.printing;
  document.querySelector('.case').hidden = done;
  document.querySelector('.bench').hidden = done;
  saveDraft();
}

// A word being set is kept, day by day, until it is printed: step across to
// the Campaign, or to another day, and it is waiting when you come back. The
// last few days' drafts are kept; a printed day's goes, the proof standing in
// its place.
const DRAFTS = `${STORE}-drafts`;
function loadDrafts() { try { return JSON.parse(localStorage.getItem(DRAFTS) || '{}'); } catch { return {}; } }
function saveDraft() {
  if (!S.deal || S.printing) return;
  const drafts = loadDrafts();
  const empty = !S.words.some(w => w.length) && !S.applied && !S.best;
  if (S.result || empty) delete drafts[S.n];
  else drafts[S.n] = snapshot();
  for (const k of Object.keys(drafts).map(Number).sort((a, b) => b - a).slice(7)) delete drafts[k];
  try { localStorage.setItem(DRAFTS, JSON.stringify(drafts)); } catch { /* private window */ }
}

function renderHeader() {
  $('numLabel').textContent = fill(UI.number, S.n);
  const d = new Date(EPOCH + (S.n - 1) * 864e5);
  $('dateLabel').textContent = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  $('prevBtn').disabled = S.n <= 1;
  $('nextBtn').disabled = !PLAYTEST && S.n >= todaysNumber();
}

// The day's label: the case's most salient trait, and on a tap all of them.
// A tube's trait names its paint; a two-word day's, its minimum.
const traitArgs = k => (k === 'tube'
  ? [COLOURS[S.deal.tube].label, COLOURS[S.deal.tube].label.toLowerCase()]
  : [S.deal.day.min ?? '']);
const traitName = k => fill(TRAIT_TEXT[k].name, ...traitArgs(k));
const traitLines = () => S.traits.map(k => ({
  head: traitName(k), body: fill(TRAIT_TEXT[k].desc, ...traitArgs(k)),
}));
function renderAlmanac() {
  const el = $('almanac');
  el.textContent = traitName(S.traits[0]);
  el.title = traitLines().map(l => `${l.head}: ${l.body}`).join('\n');
}

// ─── The seats ────────────────────────────────────────────────────────────────
// Who sits today. A patron is a card; two on offer are two cards, one
// seated, and a tap seats another (and reads it); the editor's card carries the
// day's rule on its face, since it is the one thing a reader must know before
// setting a word. A card lights while the word in hand is one it rules on.
const patronName = id => PATRON_CARDS[id]?.name ?? DAILY_CARDS[id]?.name ?? id;
const patronEmoji = id => PATRON_CARDS[id]?.emoji ?? DAILY_CARDS[id]?.emoji ?? '';
// A seated patron's face, wherever it is shown — the card, the readout's chip,
// the marks in the results: the emoji; or, for the Limner, the day's letter as
// an illuminated initial. His letter is the whole of his rule, and he wears it
// as his portrait so that a reader choosing between him and another patron
// need not tap to learn it.
function patronFace(p) {
  const L = p?.id === 'limner' ? p.data?.letters?.[0] : null;
  if (!L) return document.createTextNode(patronEmoji(p?.id));
  const i = document.createElement('span');
  i.className = 'seat-initial';
  i.textContent = L;
  return i;
}
const patronRule = seat => fill(PATRON_TEXT[seat.id] ?? '', (seat.data?.letters ?? []).join(', ').replace(/, ([^,]*)$/, ' or $1'));
const editorRule = desk => fill(EDITOR_TEXT[desk.id].rule, desk.data.n ?? desk.data.letter ?? '');
const editorVoice = desk => fill(EDITOR_TEXT[desk.id].voice, desk.data.n ?? desk.data.letter ?? '');

function seatCard(cls, emoji, name, rule = null) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `seat ${cls}`;
  const e = document.createElement('span'); e.className = 'seat-emoji'; e.textContent = emoji;
  const n = document.createElement('span'); n.className = 'seat-name'; n.textContent = name;
  b.append(e, n);
  if (rule) { const r = document.createElement('span'); r.className = 'seat-rule'; r.textContent = rule; b.appendChild(r); }
  return b;
}

function withFace(card, p) {
  card.querySelector('.seat-emoji').replaceChildren(patronFace(p));
  return card;
}

function renderSeats(sc) {
  const host = $('seats');
  const day = S.deal.day;
  host.replaceChildren();
  host.hidden = day.kind === 'plain';
  host.dataset.kind = day.kind;
  const lit = !!sc && (!!sc.seat || sc.perTile.some(p => p.echo > 1 || p.bonus) || byLicence(wordAndRest(S.active).word));
  if (day.kind === 'patron') {
    const p = day.patron;
    const card = withFace(seatCard(`seat--only${lit ? ' seat--lit' : ''}`, patronEmoji(p.id), patronName(p.id), patronRule(p)), p);
    card.addEventListener('click', () => readSeat(card, patronName(p.id), patronRule(p)));
    host.appendChild(card);
  } else if (day.kind === 'choice') {
    day.choices.forEach((p, i) => {
      const on = i === S.seat;
      const card = withFace(seatCard(`seat--choice${on ? ' seat--on' : ''}${on && lit ? ' seat--lit' : ''}`, patronEmoji(p.id), patronName(p.id), patronRule(p)), p);
      card.setAttribute('aria-pressed', on ? 'true' : 'false');
      card.disabled = locked() && !on;
      card.addEventListener('click', () => {
        if (!on && !locked()) { S.seat = i; locksToEnd(); S.tracks = tracksOf(S.tiles); sfx.select(); render(); }
        const now = $('seats').children[i];
        readSeat(now, patronName(p.id), patronRule(p));
      });
      host.appendChild(card);
    });
  } else if (day.kind === 'editor') {
    const d = day.editor;
    const card = seatCard(`seat--desk${sc?.spiked ? ' seat--spiked' : ''}`, BOSS_CARDS[d.id]?.emoji ?? '', BOSS_CARDS[d.id]?.name ?? d.id, editorRule(d));
    card.addEventListener('click', () => readSeat(card, BOSS_CARDS[d.id]?.name, `${editorVoice(d)}${EDITORS[d.id]?.judge ? ` ${fill(SPIKE_TEXT, SPIKE_MULT)}` : ''}`));
    host.appendChild(card);
  } else if (day.kind === 'pair') {
    const r = document.createElement('p');
    r.className = 'seat-pair';
    r.textContent = fill(PAIR_TEXT.rule, day.min);
    host.appendChild(r);
  }
}
function readSeat(anchor, head, body) {
  if (!$('pop').hidden && $('pop')._anchor === anchor) { hidePop(); return; }
  showPop(anchor, pop => popLines(pop, [{ head, body }]));
  $('pop')._anchor = anchor;
}

function renderCase(fresh) {
  const host = $('case');
  host.replaceChildren();
  // Four sockets across for a case of sixteen, five for anything bigger, so
  // a lent tile or a two-word day's twenty still fills whole rows.
  host.style.setProperty('--cols', S.tiles.length > 16 ? 5 : 4);
  const eff = new Map(effective().map(t => [t.id, t]));
  S.order.forEach((id, i) => {
    const socket = document.createElement('div');
    socket.className = 'socket';
    if (!placed(id)) {
      const el = tileEl(eff.get(id), 'case');
      if (S.armed && toolFits(eff.get(id))) {
        el.classList.add('tile--target');
        socket.classList.add('socket--halo');
      }
      if (fresh && !reducedMotion()) { el.classList.add('tile--dealt'); el.style.animationDelay = `${i * 28}ms`; }
      socket.appendChild(el);
    }
    host.appendChild(socket);
  });
  host.classList.toggle('case--locked', locked());
}

const toolFits = t => !t.blank && !t.ephemeral && !t.wrapped && !t.locked
  && (S.deal.tool === 'tube' ? !!t.paintOffer && !t.colour
    : S.deal.tool === 'loupe' ? loupeDelta(t, t.activeVariant) > 0 : shiftable(t, t.activeVariant));

// The day's tool in words, and its glyph: a tube is drawn in its own paint.
const toolWords = (kind = S.deal.tool, colour = S.deal.tube) => {
  const tt = TOOL_TEXT[kind];
  const label = colour ? COLOURS[colour].label : '';
  return {
    name: fill(tt.name, label),
    desc: fill(tt.desc, kind === 'loupe' ? LOUPE_CAP : label, label.toLowerCase(), COUNT_WORDS[TUBE_OFFER] ?? TUBE_OFFER),
  };
};
function toolGlyph(kind, colour) {
  const g = document.createElement('span');
  if (kind === 'tube') {
    g.className = 'tool-tube';
    g.style.setProperty('--paint', COLOURS[colour].glyph);
  } else g.textContent = TOOL_TEXT[kind].glyph;
  return g;
}

// The armed tool's ring is drawn by what holds a target, never by the target
// itself: its socket in the case, a halo wrapped round it in the stick. A
// nicked sort is cut by a mask that cuts away anything drawn outside it, the
// ring included (Safari has no mask-clip: no-clip to stop it); and a ring in
// the sort's own shadow could not pulse, only blink, because the shadow it
// sits in has inset layers where the ring has outer ones and a browser only
// tweens shadows whose layers pair up. A socket or a halo has nothing in the
// way, so every target pulses the same.
function withHalo(el) {
  if (!el.classList.contains('tile--target')) return el;
  const halo = document.createElement('div');
  halo.className = 'halo';
  halo.appendChild(el);
  return halo;
}
// A stick's sorts, the haloed one included.
const stickTiles = k => [...stickEl(k).querySelectorAll(':scope > .tile, :scope > .halo > .tile')];

// The stick's corner figures are live: each sort shows what it pays in THIS
// word, so a nick's reach is read off the tiles as the word is built, and a
// figure that changes pops (renderWord's pts-pop in js/render.js). A tile The
// Twins recast is drawn as what it now reads as.
let lastPays = new Map();
function renderStick(k, sc) {
  const host = stickEl(k);
  host.replaceChildren();
  const wrap = host.closest('.stick-wrap');
  wrap.hidden = k >= S.words.length;
  if (k >= S.words.length) return;
  const { word } = wordAndRest(k);
  const pays = new Map((sc?.perTile ?? []).map(p => [p.id, p.points]));
  const shownAs = new Map((sc?.recasts ?? []).map(r => [r.id, { ...r.tile, recast: true }]));
  let popped = 0;
  for (const t0 of word) {
    const t = shownAs.get(t0.id) ?? t0;
    const el = tileEl(t, 'stick', { pays: pays.get(t.id) });
    el.dataset.stick = k;
    if (S.armed && toolFits(t0)) el.classList.add('tile--target');
    const was = lastPays.get(t.id);
    const now = pays.get(t.id);
    if ((was != null && was !== now) || (was == null && now !== restingOf(t))) {
      const ptsEl = el.querySelector('.tile-pts');
      ptsEl.classList.add('pts-pop');
      ptsEl.style.animationDelay = `${popped++ * 60}ms`;
    }
    if (now !== restingOf(t)) el.title += `\n${fill(UI.inWord, now)}`;
    host.appendChild(withHalo(el));
  }
  for (const [id, v] of pays) lastPays.set(id, v);
  fitStick(k);
  renderRule(k, word, sc);
  const badge = $(`stickSum${k}`);
  badge.hidden = !pairDay() || !sc;
  if (!S.printing) badge.textContent = sc ? fmtN(sc.total) : '';
}

// On a two-word day the stick in hand is lit and the other stands back, faded,
// until it's tapped; once the pair is printed both stand alike.
function renderSticksActive() {
  const choosing = pairDay() && !S.result;
  for (const w of document.querySelectorAll('.stick-wrap')) {
    const mine = Number(w.dataset.stick) === S.active;
    w.classList.toggle('stick-wrap--active', choosing && mine);
    w.classList.toggle('stick-wrap--idle', choosing && !mine);
  }
}

// The pair's sum, under the two sticks.
function renderPairSum(scs) {
  let line = $('pairSum');
  if (!line) {
    line = document.createElement('p');
    line.id = 'pairSum';
    line.className = 'pair-sum';
    line.innerHTML = '<span></span> <b>0</b>';
    $('status').parentElement.before(line);
  }
  line.hidden = !pairDay();
  if (!pairDay() || S.printing) return;
  const [a, b] = scs.map(x => x?.total ?? 0);
  line.querySelector('span').textContent = `${fmtN(a)} + ${fmtN(b)} =`;
  line.querySelector('b').textContent = fmtN(a + b);
  line.querySelector('b')._val = undefined;
  line.classList.toggle('pair-sum--live', scs.every(Boolean));
}

// ─── The measure, engraved ────────────────────────────────────────────────────
// The full game's stick (renderRule in js/render.js): a tick per place along its
// foot and, from LENGTH_MULT_MIN letters, the multiplier each length earns, with
// a steel knee closing on the word's end. Cut for the word in the stick rather
// than engraved once, because the measure counts LETTERS where the stick holds
// sorts — a þ or a CH is one sort of two letters — so
// each tick says what the word would be worth if it ended there. Ahead of the
// word the ticks are a full-size sort apart, where the next sort will land
// before fitStick shrinks a long word to fit.
const measureOf = t => {
  const L = activeLetter(t);
  if (!L || L === '_') return L === '_' ? 1 : 0;
  return MEDIEVAL[L]?.reads?.[0]?.length ?? L.length;
};
const LABEL_SPACING = 30;   // px a label needs from its neighbour before it is cut
const LABEL_ROOM = 30;      // px under the sorts a label needs to stand over its tick

// The step a sort takes at full size (4.25em of the stick's own --tfs, and the
// gap), read with fitStick's overrides for a long word set aside.
function fullStep(stick) {
  const tfs = stick.style.getPropertyValue('--tfs'), gap = stick.style.gap;
  stick.style.removeProperty('--tfs');
  stick.style.removeProperty('gap');
  const cs = getComputedStyle(stick);
  const step = (parseFloat(cs.getPropertyValue('--tfs')) || 16) * 4.25 + (parseFloat(cs.columnGap) || 0);
  if (tfs) stick.style.setProperty('--tfs', tfs);
  if (gap) stick.style.gap = gap;
  return step;
}

function renderRule(k, word, sc) {
  const stick = stickEl(k), bar = ruleEl(k), knee = kneeEl(k);
  const cs = getComputedStyle(stick);
  const gap = parseFloat(cs.columnGap) || 0;
  const padL = parseFloat(cs.paddingLeft) || 0;
  const tiles = stickTiles(k);
  const tfs = parseFloat(cs.getPropertyValue('--tfs')) || 16;
  const origin = stick.offsetLeft + stick.clientLeft;
  const room = origin + stick.clientWidth - 4;

  const ticks = [], labels = [];
  let letters = 0;
  let x = origin + padL - gap / 2;
  const cut = (at, n, here = false) => {
    if (at > room) return false;
    const major = n >= LENGTH_MULT_MIN;
    ticks.push(`<span class="tick${major ? ' tick--major' : ''}${here || at <= x ? ' tick--on' : ''}" style="left:${at}px"></span>`);
    if (major) labels.push({ at, n, here });
    return true;
  };
  tiles.forEach((el, i) => {
    letters += measureOf(word[i]);
    x = origin + el.offsetLeft + el.offsetWidth + gap / 2;
    const last = i === tiles.length - 1;
    // The knee's mark is the score's own count, which resolves the readings.
    cut(x, last && sc ? sc.letters.length : letters, last);
  });
  if (tiles.length && sc) letters = sc.letters.length;
  const step = fullStep(stick);
  for (let j = 1; j <= 64; j++) if (!cut(x + j * step, letters + j)) break;

  // A label stands over its tick when the sorts leave room for it, and beside
  // it, at the tick's own height, when they don't (full-size sorts on a two-word
  // day's shorter sticks): a label never runs into a letter. When a long word
  // is shrunk to fit, the room opens and the labels stand up again.
  const wrapH = stick.offsetTop + stick.offsetHeight;
  const sortFoot = tiles.length
    ? Math.max(...tiles.map(el => stick.offsetTop + el.offsetTop + el.offsetHeight))
    : stick.offsetTop + parseFloat(cs.paddingTop) + (parseFloat(cs.getPropertyValue('--tfs')) || 16) * 4.5;
  const beside = wrapH - (sortFoot + tfs * 0.3) < LABEL_ROOM;
  bar.classList.toggle('rule-bar--beside', beside);

  // Labels where they fit: the word's own first, then left to right, each kept
  // clear of the ones already cut — a crowded stick labels fewer lengths.
  const drawn = [];
  for (const l of [...labels.filter(l => l.here), ...labels.filter(l => !l.here)]) {
    if (drawn.some(d => Math.abs(d.at - l.at) < LABEL_SPACING)) continue;
    drawn.push(l);
    // Kept inside the steel: a label at the stick's end is nudged in (over its
    // tick) or turned to the tick's left (beside it), not cut off.
    const left = beside && l.at > room - 30;
    const at = beside ? l.at : Math.min(origin + stick.clientWidth - 14, Math.max(origin + 14, l.at));
    ticks.push(`<span class="tick-label${l.here ? ' tick--here' : ''}${left ? ' tick-label--left' : ''}" style="left:${at}px">×${fmtMult(lengthMult(l.n))}</span>`);
  }
  bar.innerHTML = ticks.join('');

  const last = tiles[tiles.length - 1];
  knee.style.left = `${last ? origin + last.offsetLeft + last.offsetWidth + 3 : origin + padL - 4}px`;
  knee.style.top = `${stick.offsetTop + (last?.offsetTop ?? parseFloat(cs.paddingTop)) - 3}px`;
  knee.style.height = `${(last?.offsetHeight ?? tfs * 4.5) + 6}px`;
}

const KNEE_ROOM = 16;
// One course of type, whatever the word: a word too long for the measure is set
// in a smaller size (fitWord in js/render.js does the same on the bench).
function fitStick(k) {
  const host = stickEl(k);
  const n = host.querySelectorAll('.tile').length;
  host.style.removeProperty('--tfs');
  host.style.removeProperty('gap');
  if (!n) return;
  const cs = getComputedStyle(host);
  // The knee closes on the word's end, so a fitted word leaves it its width.
  const avail = host.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - KNEE_ROOM;
  const base = parseFloat(getComputedStyle(host.querySelector('.tile')).fontSize);
  // A sort is 4.25em wide; the type size that lets n of them and their gaps fit.
  const sizeFor = gap => (avail - (n - 1) * gap) / (n * 4.25);
  let gap = parseFloat(cs.columnGap) || 0;
  if (sizeFor(gap) >= base) return;
  // Crowded: close the gaps up before shrinking the type any further.
  if (sizeFor(gap) < base * 0.7) { gap = 2; host.style.gap = `${gap}px`; }
  host.style.setProperty('--tfs', `${Math.max(4, Math.min(base, sizeFor(gap)))}px`);
}

const CHIP_NAMES = { purple: 'Purple', cursed: 'Hellbox iron', spike: 'Spiked' };
const chipName = (kind, count) =>
  (kind === 'length' ? fill(UI.letters, count)
    : kind === 'seat' ? patronName(seatNow()?.id)
    : COLOURS[kind]?.label ?? CHIP_NAMES[kind]);
const chipEl = kind => $('roChips').querySelector(`.chip[data-kind="${kind}"]`);

function renderReadout(sc) {
  $('roPoints').textContent = fmtN(sc?.shownPoints ?? 0);
  if (!S.printing) $('roTotal').textContent = fmtN(sc?.total ?? 0);
  $('roMult').textContent = String(+(sc?.shownMult ?? 1).toFixed(2));
  for (const id of ['roPoints', 'roTotal', 'roMult']) $(id)._val = undefined;
  const chips = $('roChips');
  chips.replaceChildren();
  // One stamp per track the case can light: blind at ×1, inked when lit. The
  // name rides on hover. The seat's stamp wears its patron; on a choice day,
  // whichever is seated, and none for a seat that rules no ×Mult.
  const shown = chipsShown(sc);
  for (const kind of S.tracks) {
    if (kind === 'seat' && !stamps(seatNow()?.id)) continue;
    const ch = shown.find(c => c.kind === kind);
    const c = document.createElement('span');
    c.className = `chip chip--${kind}${ch ? ' chip--on' : ''}`;
    c.dataset.kind = kind;
    c.title = chipName(kind, ch?.count ?? sc?.letters.length ?? 0);
    const sw = document.createElement('i');
    if (kind === 'seat') sw.replaceChildren(patronFace(seatNow()));
    if (kind === 'spike') sw.textContent = '✂';
    const v = document.createElement('b'); v.textContent = `×${fmtMult(ch?.mult ?? 1)}`;
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
    const tt = toolWords();
    btn.replaceChildren(toolGlyph(tool, S.deal.tube));
    btn.title = `${tt.name}: ${tt.desc}`;
    btn.setAttribute('aria-label', tt.name);
    btn.classList.toggle('tool--armed', S.armed);
    btn.classList.toggle('tool--used', !!S.applied);
    btn.disabled = locked();
    btn.setAttribute('aria-pressed', S.armed ? 'true' : 'false');
  }
  const any = S.words.some(w => w.length);
  $('printBtn').disabled = locked() || !any;
  $('clearBtn').disabled = locked() || !any;
  $('shuffleBtn').disabled = locked();
}

// ─── The result ───────────────────────────────────────────────────────────────
// "Top 100%" is true of every word, so the last bracket is said from the other
// end: past the second-last cut, a place is in the bottom of the field.
function gradeLabel(r) {
  const last = BRACKETS[BRACKETS.length - 2];
  return r.bracket > last ? fill(RESULT.bottom, 100 - last) : fill(RESULT.top, r.bracket);
}

// A solver's entry set out on the case, under the table it was best under.
const setOut = (entry, seatIdx = entry.seat ?? 0) => ({
  tiles: settingOf(S.deal.tiles, entry).word,
  T: S.tables.length ? S.tables[S.deal.day.kind === 'choice' ? seatIdx : 0] : null,
});

// A word set small — on the slip, or a setting in the best-of list — with each
// sort's figure as it paid in that word, so a winning setting shows its nicks.
function miniWord(tiles, T = tableNow()) {
  const row = document.createElement('span');
  row.className = 'mini-word';
  const sc = scoreWord(tiles, [], has, T);
  const pays = new Map((sc?.perTile ?? []).map(p => [p.id, p.points]));
  const shownAs = new Map((sc?.recasts ?? []).map(r => [r.id, r.tile]));
  for (const t of tiles) row.appendChild(tileEl(shownAs.get(t.id) ?? t, 'mini', { mini: true, pays: pays.get(t.id) }));
  return row;
}
// Two words, side by side, for a two-word day.
function miniPair(a, b) {
  const row = document.createElement('span');
  row.className = 'mini-pair';
  const plus = document.createElement('span'); plus.className = 'mini-plus'; plus.textContent = '+';
  row.append(miniWord(a, null), plus, miniWord(b, null));
  row.style.setProperty('--n', Math.max(a.length, b.length));   // the CSS sizes the sorts to fit
  return row;
}
// A patron's mark goes on a setting only where it paid: where the setting
// scores differently without it, or uses the tile it lent. On a choice day the
// patron is the seat the setting was scored under, and the same rule holds. A
// word neither patron pays for is filed under the first seat only because a
// tie has to go somewhere; marked, it read as the first patron paying for it
// (SUBSEQUENT wore the Poppet's bear on № 4, at 1,728 under both seats).
// On a choice day a word either patron would pay the same carries both, in the
// order they sit: the setting is as good under one as the other.
function paidBy(tiles, seat = 0) {
  const day = S.deal.day;
  const choice = day.kind === 'choice';
  const p = choice ? day.choices[seat] : day.kind === 'patron' ? day.patron : null;
  const T = S.tables[choice ? seat : 0];
  if (!p || !T) return [];
  const plain = scoreWord(tiles, [], has, null).total;
  const total = scoreWord(tiles, [], has, T).total;
  const paid = tiles.some(t => t.blank) || byLicence(tiles) || total !== plain;
  if (!paid) return [];
  return !choice ? [p] : day.choices.filter((q, i) => i === seat
    || (S.tables[i] && !barsAny(S.tables[i], tiles) && scoreWord(tiles, [], has, S.tables[i]).total === total));
}
const patronMark = (tiles, seat = 0) => {
  const by = paidBy(tiles, seat);
  if (!by.length) return null;
  const m = document.createElement('span');
  m.className = 'best-seat';
  m.append(...by.map(patronFace));
  m.title = by.map(q => patronName(q.id)).join(' or ');
  return m;
};

// The share, Wordle's way: each word as a row of squares, a sort to a square in
// the order it was set, each in its paint (⬜, the cream of the type, if it wore
// none) — how it was set, without a letter of it — and beside it its total, the
// emoji of a patron who paid for it and an editor's scissors if it was spiked;
// then the place.
const SHARE_SQUARE = { crimson: '🟥', azure: '🟦', jade: '🟩', amber: '🟨' };
function shareText(r, pairs) {
  const rows = S.words.map((_, k) => {
    const { word } = wordAndRest(k);
    const sc = scoreOf(k);
    if (!sc) return null;
    const squares = word.map(t => SHARE_SQUARE[t.colour] ?? '⬜').join('');
    const marks = [...paidBy(word, r.seat ?? 0).map(p => patronEmoji(p.id)).filter(Boolean), ...(sc.spiked ? ['✂️'] : [])].join('');
    return `${squares} ${fmtN(sc.total)}${marks ? ` ${marks}` : ''}`;
  }).filter(Boolean);
  return [
    fill(RESULT.shareHead, S.n),
    ...rows,
    [...(rows.length > 1 ? [fmtN(r.score)] : []),
      r.rank === 1 ? RESULT.best : gradeLabel(r),
      fill(RESULT.place, fmtN(r.rank), fmtN(r.size))].join(' · '),
  ].join('\n');
}

// The share, beside Next: on a phone the share sheet, as Wordle does;
// elsewhere the clipboard; and where neither will take it, the text itself,
// laid out under the buttons to copy by hand.
function shareButton(r, pairs, host) {
  const share = document.createElement('button');
  share.className = 'btn share-btn';
  share.textContent = RESULT.share;
  share.addEventListener('click', async () => {
    const text = shareText(r, pairs);
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ text }); return; } catch (e) { if (e?.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(text); share.textContent = RESULT.copied; }
    catch {
      let pre = host.querySelector('.share-text');
      if (!pre) { pre = document.createElement('pre'); pre.className = 'share-text'; host.appendChild(pre); }
      pre.textContent = text;
      getSelection()?.selectAllChildren(pre);
    }
  });
  return share;
}

let resizeChart = null;
function renderResult() {
  const host = $('result');
  const r = S.result;
  host.hidden = !r;
  host.replaceChildren();
  resizeChart = null;
  if (!r) return;
  const pairs = pairDay();
  const label = r.sets.map(x => [...x].map(letterGlyph).join('')).join(' + ');

  // The slip: your word (or words), the score, the place.
  const slip = document.createElement('div');
  slip.className = 'slip';
  const top = document.createElement('div');
  top.className = 'slip-word';
  top.appendChild(pairs ? miniPair(wordAndRest(0).word, wordAndRest(1).word) : miniWord(wordAndRest(0).word));
  { const m = patronMark(wordAndRest(0).word, r.seat ?? 0); if (m) top.appendChild(m); }
  const score = document.createElement('b');
  score.className = 'slip-score';
  score.textContent = fmtN(r.score);
  top.appendChild(score);
  const grade = document.createElement('div');
  grade.className = `slip-grade${r.rank === 1 ? ' slip-grade--best' : ''}`;
  grade.textContent = r.rank === 1 ? RESULT.best : gradeLabel(r);
  const place = document.createElement('div');
  place.className = 'slip-place';
  place.textContent = fill(pairs ? RESULT.placePairs : RESULT.place, fmtN(r.rank), fmtN(r.size));
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
  const draw = () => drawField(plot, field.ranked, { rank: r.rank, score: r.score, label });
  draw();
  resizeChart = draw;

  host.appendChild(pairs ? bestPairs(r, field) : bestWords(r, field));
  // Every word the list shows, its definition fetched now rather than on a tap.
  prefetchDefs([...host.querySelectorAll('.best-word')].flatMap(e => e.textContent.split(' + ')));

  // The way on.
  // (No second go: once a day is printed, its best words are on the page.)
  const acts = document.createElement('div');
  acts.className = 'result-acts';
  acts.appendChild(shareButton(r, pairs, acts));
  if (PLAYTEST || S.n < todaysNumber()) {
    const next = document.createElement('button');
    next.className = 'btn btn-print';
    next.textContent = RESULT.next;
    next.addEventListener('click', () => { openChallenge(S.n + 1); window.scrollTo({ top: 0 }); });
    acts.appendChild(next);
  }
  host.appendChild(acts);
}

// One row of a best-of list: place, name, score, and a setting under it when open.
// `words` are what the row's name is made of. Their definitions show only once
// the row is opened, in full: one word's under it, a pair's two beneath, each
// headed by the word it defines (or that word's root), in the definition's type.
function bestRow(row) {
  const { key, place, name, score, yours, stone, open, fillSet, words = [] } = row;
  const li = document.createElement('li');
  li.className = `best-row${yours ? ' best-row--yours' : ''}${stone ? ' best-row--stone' : ''}${open ? ' best-row--open' : ''}`;
  const btn = document.createElement('button');
  btn.className = 'best-head';
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  const pl = document.createElement('span'); pl.className = 'best-place'; pl.textContent = fmtN(place);
  const w = document.createElement('span'); w.className = 'best-word'; w.textContent = name;
  const sc = document.createElement('b'); sc.className = 'best-score'; sc.textContent = fmtN(score);
  const cell = document.createElement('span'); cell.className = 'best-name';
  cell.appendChild(w);
  if (open && words.length === 1) cell.appendChild(defSpan(words[0]));
  btn.append(pl, cell, sc);
  // Opened and closed where it stands: rebuilding the whole result would empty
  // the page for a moment and drop the reader back at the top of it.
  btn.addEventListener('click', () => {
    const now = !S.open.has(key);
    if (now) S.open.add(key); else S.open.delete(key);
    const fresh = bestRow({ ...row, open: now });
    li.replaceWith(fresh);
    fresh.querySelector('.best-head').focus({ preventScroll: true });
  });
  li.appendChild(btn);
  if (open && words.length > 1) {
    const defs = document.createElement('div');
    defs.className = 'best-defs';
    for (const word of words) defs.appendChild(defSpan(word, 'best-def best-def--pair', true));
    li.appendChild(defs);
  }
  if (open) fillSet(li);
  return li;
}
const toolMark = tool => {
  const note = document.createElement('span');
  note.className = 'best-tool';
  note.appendChild(toolGlyph(tool.kind, tool.colour));
  note.title = toolWords(tool.kind, tool.colour).name;
  return note;
};

// Stepping stones: when your word is well down the field, a few settings
// between the tenth best and yours, spaced by score (three-quarters, half and
// a quarter of the way up from yours), so there is something to aim at short
// of the very best. pick(s) names the lowest-scoring setting worth at least s;
// a stone that is your own word, or ties with the tenth, is left out.
function stonesBetween(r, tenth, pick, same) {
  const out = [];
  if (r.rank <= 10 || !(tenth > r.score)) return out;
  for (const f of [0.75, 0.5, 0.25]) {
    const e = pick(r.score + (tenth - r.score) * f);
    if (!e || e.score <= r.score || e.score >= tenth || same(e)) continue;
    if (!out.some(o => o.score === e.score)) out.push({ ...e, stone: true });
  }
  return out;
}
// The stones go in just above your row, in a panel of their own: a list
// inside the list, opened by one marker and closed by the next.
function withStones(shown, stones) {
  if (!stones.length) return shown;
  const k = shown.findIndex(e => e.yours);
  const at = k < 0 ? shown.length : k;
  return [...shown.slice(0, at), { mark: 'open' }, ...stones, { mark: 'close' }, ...shown.slice(at)];
}
function stonePanel(list) {
  const li = document.createElement('li');
  li.className = 'best-stones';
  const inner = document.createElement('ol');
  inner.className = 'best-stones-list';
  li.appendChild(inner);
  list.appendChild(li);
  return inner;
}

// The best of the case, each with how it was set — the winner's open. Your
// word is in the list as YOU printed it, and, when the case could have set it
// better, that setting under it.
function bestWords(r, field) {
  const mineWord = r.letters[0];
  if (!S.openInit) {
    S.open.add(field.ranked[0].word);
    if ((field.results.get(mineWord)?.score ?? 0) > r.score) S.open.add('\u0000yours');
    S.openInit = true;
  }
  const list = document.createElement('ol');
  list.className = 'best best-list';
  const mine = field.ranked.find(e => e.word === mineWord);
  const yours = { word: mineWord, score: r.score, yours: true, better: mine && mine.score > r.score ? mine : null };
  const shown = field.ranked.slice(0, 10).filter(e => e.word !== mineWord || !yours.better);
  const at = shown.findIndex(e => e.word === mineWord);
  if (at >= 0) shown[at] = { ...shown[at], yours: true };
  else {
    const k = shown.findIndex(e => e.score < r.score);
    shown.splice(k < 0 ? shown.length : k, 0, yours);
  }
  // The lowest-scoring word worth at least s: the field is best first, so a
  // binary search for the first word worth less, then back to the start of
  // the score it lands on (the first of a tie, alphabetically).
  const R = field.ranked;
  const pickWord = target => {
    let lo = 0, hi = R.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (R[mid].score >= target) lo = mid + 1; else hi = mid; }
    if (!lo) return null;
    let j = lo - 1;
    while (j > 0 && R[j - 1].score === R[lo - 1].score) j--;
    while (j < lo - 1 && R[j].word === mineWord) j++;
    return R[j];
  };
  const stones = stonesBetween(r, R[9]?.score, pickWord, e => e.word === mineWord);
  let into = list;
  for (const e of withStones(shown, stones)) {
    if (e.mark) { into = e.mark === 'open' ? stonePanel(list) : list; continue; }
    const key = e.yours ? '\u0000yours' : e.word;
    into.appendChild(bestRow({
      key, name: e.word, words: [e.word], score: e.score, yours: e.yours, stone: e.stone, open: S.open.has(key),
      place: e.yours ? r.rank : rankOf(e.score, field.scores).rank,
      fillSet: li => {
        const set = document.createElement('div');
        set.className = 'best-set';
        if (e.yours && !e.plan) {
          set.appendChild(miniWord(wordAndRest(0).word));
          const m = patronMark(wordAndRest(0).word, r.seat ?? 0); if (m) set.appendChild(m);
          if (r.applied) set.appendChild(toolMark(r.applied));
        } else {
          const { tiles, T } = setOut(e);
          set.appendChild(miniWord(tiles, T));
          const m = patronMark(tiles, e.seat ?? 0); if (m) set.appendChild(m);
          if (e.tool) set.appendChild(toolMark(e.tool));
        }
        li.appendChild(set);
        if (e.better) {
          const alt = document.createElement('div');
          alt.className = 'best-set best-set--better';
          const { tiles, T } = setOut(e.better);
          alt.appendChild(miniWord(tiles, T));
          const m = patronMark(tiles, e.better.seat ?? 0); if (m) alt.appendChild(m);
          if (e.better.tool) alt.appendChild(toolMark(e.better.tool));
          const v = document.createElement('b');
          v.className = 'best-alt-score';
          v.textContent = fmtN(e.better.score);
          alt.appendChild(v);
          li.appendChild(alt);
        }
      },
    }));
  }
  return list;
}

// The same for a two-word day: the best pairs, yours among them.
function bestPairs(r, field) {
  const name = ws => ws.join(' + ');
  const mineKey = name(r.letters);
  const A = field.byWord.get(r.letters[0]), B = field.byWord.get(r.letters[1]);
  const pb = A && B ? pairBest(A, B) : { score: -1 };
  const better = pb.score > r.score
    ? { score: pb.score, plans: [A.plans[pb.a].plan, B.plans[pb.b].plan] } : null;
  if (!S.openInit) {
    if (field.top[0]) S.open.add(name(field.top[0].words));
    if (better) S.open.add('\u0000yours');
    S.openInit = true;
  }
  const list = document.createElement('ol');
  list.className = 'best best-list';
  const same = e => name(e.words) === mineKey || name([...e.words].reverse()) === mineKey;
  const shown = field.top.slice(0, 10).filter(e => !same(e) || !better);
  const at = shown.findIndex(same);
  const yours = { words: r.letters, score: r.score, yours: true, better };
  if (at >= 0) shown[at] = { ...shown[at], yours: true };
  else {
    const k = shown.findIndex(e => e.score < r.score);
    shown.splice(k < 0 ? shown.length : k, 0, yours);
  }
  const tilesOf = plan => settingOf(S.deal.tiles, { plan }).word;
  // The lowest pair score worth at least s, and a pair that scores it.
  const pickPair = target => {
    const sc = field.scores;
    let lo = 0, hi = sc.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (sc[mid] >= target) lo = mid + 1; else hi = mid; }
    return lo && field.withScore ? field.withScore(sc[lo - 1]) : null;
  };
  const stones = stonesBetween(r, field.scores[9], pickPair, same);
  let into = list;
  for (const e of withStones(shown, stones)) {
    if (e.mark) { into = e.mark === 'open' ? stonePanel(list) : list; continue; }
    const key = e.yours ? '\u0000yours' : name(e.words);
    into.appendChild(bestRow({
      key, name: name(e.words), words: e.words, score: e.score, yours: e.yours, stone: e.stone, open: S.open.has(key),
      place: e.yours ? r.rank : rankOf(e.score, field.scores).rank,
      fillSet: li => {
        const set = document.createElement('div');
        set.className = 'best-set';
        set.appendChild(e.yours && !e.plans
          ? miniPair(wordAndRest(0).word, wordAndRest(1).word)
          : miniPair(tilesOf(e.plans[0]), tilesOf(e.plans[1])));
        li.appendChild(set);
        if (e.better) {
          const alt = document.createElement('div');
          alt.className = 'best-set best-set--better';
          alt.appendChild(miniPair(tilesOf(e.better.plans[0]), tilesOf(e.better.plans[1])));
          const v = document.createElement('b');
          v.className = 'best-alt-score';
          v.textContent = fmtN(e.better.score);
          alt.appendChild(v);
          li.appendChild(alt);
        }
      },
    }));
  }
  return list;
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

// Where in a stick a drop lands: before the nearest sort's centre, or after it.
function stickIndex(x, k) {
  const tiles = stickTiles(k);
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
  const wrap = under?.closest('.stick-wrap');
  if (wrap) {
    const k = Number(wrap.dataset.stick) || 0;
    const from = placedIn(id);
    const at = stickIndex(x, k);
    if (from === k) {
      moveIn(S.words[k], id, at);
      sfx.reorder();
    } else {
      // From the case, or across from the other stick.
      if (from >= 0) S.words[from] = S.words[from].filter(w => w !== id);
      S.words[k].splice(at, 0, id);
      sfx.place();
    }
    S.active = k;
    const t = S.tiles.find(x2 => x2.id === id);
    if (zone === 'case' && t?.blank && t.letter === '_') requestAnimationFrame(() => pickBlank(id));
  } else if (under?.closest('.case')) {
    const at = socketIndex(x, y);
    if (zone === 'stick') { const k = placedIn(id); S.words[k] = S.words[k].filter(w => w !== id); sfx.retrieve(); }
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
  for (const root of [$('case'), $('stick'), $('stick1')]) {
    root.addEventListener('pointerdown', e => {
      const el = e.target.closest('.tile');
      if (!el || press) return;
      if (e.button !== undefined && e.button !== 0) return;   // primary only
      e.preventDefault();   // no text selection, no native gesture on a sort
      hidePop();
      // A locked sort neither sets nor drags: a tap says why.
      if (el.classList.contains('tile--locked')) { showTileInfo(Number(el.dataset.id), el); return; }
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
    const tt = toolWords();
    return [{ head: tt.name, body: tt.desc }];
  });
  // The almanac's day has nothing to do but be read, so a tap reads it.
  $('almanac').addEventListener('click', e => {
    e.stopPropagation();
    if (!$('pop').hidden) { hidePop(); return; }
    showPop($('almanac'), pop => popLines(pop, traitLines()));
  });
  document.addEventListener('pointerdown', e => {
    if (!e.target.closest('#pop, .tile, #almanac, .seat')) hidePop();
  });
  // On a two-word day, a tap on a stick's open steel takes that stick in hand.
  for (const w of document.querySelectorAll('.stick-wrap')) {
    w.addEventListener('click', e => { if (!e.target.closest('.tile')) setActive(Number(w.dataset.stick)); });
  }
  // A tap or a key while the print runs hurries the replay through.
  addEventListener('pointerdown', () => { if (S.printing) S.hurry = true; }, true);
  addEventListener('keydown', () => { if (S.printing) S.hurry = true; }, true);

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
    else if (e.key === 'Backspace') {
      const w = S.words[S.active];
      // On a two-word day an empty second stick hands back to the first.
      if (!w.length && S.active > 0) setActive(S.active - 1);
      else if (w.length) unplace(w[w.length - 1]);
      e.preventDefault();
    }
    else if (e.key === 'Enter' && !onControl) {
      // Enter on a first word moves to the second while it is empty.
      if (pairDay() && S.active === 0 && S.words[0].length && !S.words[1].length) setActive(1);
      else print();
      e.preventDefault();
    }
    // Space shuffles the case and Escape puts the tool away or empties the
    // stick, as on the full game's board (Space on a button presses it).
    else if (e.key === ' ' && !onControl) { shuffle(); e.preventDefault(); }
    else if (e.key === 'Escape') {
      if (!$('pop').hidden) hidePop();
      else if (S.armed) toolTap();
      else clearWord();
    }
  });

  $('printBtn').addEventListener('click', print);
  $('clearBtn').addEventListener('click', clearWord);
  $('shuffleBtn').addEventListener('click', shuffle);
  $('bestBtn').addEventListener('click', restoreBest);
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
    rz = requestAnimationFrame(() => {
      if (!S.printing) {
        for (let k = 0; k < S.words.length; k++) { fitStick(k); renderRule(k, wordAndRest(k).word, scoreOf(k)); }
      }
      resizeChart?.(); hidePop();
    });
  });
}

// ─── Start ────────────────────────────────────────────────────────────────────
// A host that can swap the page under a running game (a claude.ai artifact,
// republished mid-playtest) asks for what to carry across; this is the case as
// it was being set. Everything printed is in localStorage already.
const snapshot = () => ({
  n: S.n, words: S.words, active: S.active, seat: S.seat, applied: S.applied, order: S.order, faces: facesNow(),
  best: S.best,
});
function resume(data) {
  if (!data || data.n !== S.n || S.result || !Array.isArray(data.words) || data.words.length !== S.words.length) return;
  const ids = new Set(S.tiles.map(t => t.id));
  restoreFaces(data);
  if (Array.isArray(data.order) && data.order.length === ids.size && data.order.every(id => ids.has(id))) S.order = data.order;
  S.words = data.words.map(w => w.filter(id => ids.has(id)));
  S.active = Math.min(data.active ?? 0, S.words.length - 1);
  S.seat = data.seat ?? 0;
  S.applied = data.applied ?? null;
  const b = data.best;
  S.best = b && Array.isArray(b.words) && b.words.length === S.words.length
    && b.words.every(w => w.every(id => ids.has(id))) ? b : null;
  render();
}

// ─── Your best ────────────────────────────────────────────────────────────────
// The highest-scoring setting made on the day — a word, or on a two-word day a
// pair of them, each a word and long enough — kept with the day's draft, and
// set again, faces, seat and tool alike, by a tap on the line under the stick.
function settingNow() {
  if (S.result || S.printing) return null;
  let total = 0;
  const letters = [];
  for (let k = 0; k < S.words.length; k++) {
    const { word, rest } = wordAndRest(k);
    if (!word.length) return null;
    const j = judge(word, has);
    if (!j.ok || (pairDay() && j.letters.length < S.deal.day.min)) return null;
    total += scoreWord(word, rest, has, tableNow()).total;
    letters.push(j.letters);
  }
  return { total, letters };
}
const sameSetting = b => JSON.stringify([S.words, S.seat, S.applied ?? null, facesNow()])
  === JSON.stringify([b.words, b.seat, b.applied ?? null, b.faces]);
function noteBest() {
  const now = settingNow();
  if (now && (!S.best || now.total > S.best.total)) {
    S.best = { ...now, words: S.words.map(w => [...w]), seat: S.seat, applied: S.applied ?? null, faces: facesNow() };
  }
}
// Shown from the first word made until the day is printed. While the stick
// holds the best setting itself, the line names it and a tap does nothing.
function renderBest() {
  const btn = $('bestBtn');
  const b = S.best;
  btn.hidden = !b || !!S.result || S.printing;
  if (btn.hidden) return;
  btn.textContent = fill(UI.best, b.letters.join(' + '), fmtN(b.total));
  btn.disabled = sameSetting(b);
}
function restoreBest() {
  const b = S.best;
  if (!b || locked() || sameSetting(b)) return;
  hidePop();
  restoreFaces(b);
  S.words = b.words.map(w => [...w]);
  S.seat = b.seat ?? 0;
  S.applied = b.applied ?? null;
  locksToEnd();
  S.armed = false;
  S.active = 0;
  S.note = '';
  S.tracks = tracksOf(S.tiles);
  sfx.place();
  render();
}

async function start(carried = {}) {
  window.claude?.hot?.snapshot?.(snapshot);
  loadSettings();   // the full game's sound and speed settings, where the two share a site
  applySpeedCSS();
  // On its own subdomain the full game is somewhere else entirely; the build
  // says where (tools/build-daily.mjs, --home).
  if (window.DAILY_HOME) $('modeHome').href = window.DAILY_HOME;
  // Framed as an artifact there is no other mode to go to; the menu keeps
  // How to play.
  if (window.DAILY_NO_LINK) $('modeHome').remove();
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

// ─── How to play ──────────────────────────────────────────────────────────────
// A short sheet from the ❦ menu: Points × Mult, length and paint, one worked
// example set in real sorts and scored by the scorer, so its
// chips and sum are the game's own. Built the first time it opens.
const HOWTO_WORD = { letters: 'GARDEN', paint: { 1: 'crimson', 4: 'crimson', 2: 'azure' } };
function openHowto() {
  const dlg = $('howto');
  if (!dlg.firstChild) {
    const body = document.createElement('div');
    body.className = 'howto-body';
    const head = document.createElement('div');
    head.className = 'howto-head';
    const h = document.createElement('h2');
    h.id = 'howtoTitle';
    h.textContent = HOWTO.title;
    const x = document.createElement('button');
    x.className = 'howto-close';
    x.type = 'button';
    x.textContent = '×';
    x.setAttribute('aria-label', HOWTO.close);
    x.addEventListener('click', () => dlg.close());
    head.append(h, x);
    const para = text => { const p = document.createElement('p'); p.textContent = text; return p; };
    body.append(head, para(HOWTO.score), para(HOWTO.mult));

    const tiles = [...HOWTO_WORD.letters].map((L, id) =>
      ({ ...makeTileTemplate(L), id: 900 + id, colour: HOWTO_WORD.paint[id] ?? null }));
    const sc = scoreWord(tiles, [], has, null);
    const fig = document.createElement('figure');
    fig.className = 'howto-example';
    const cap = document.createElement('figcaption');
    cap.textContent = fill(HOWTO.example, HOWTO_WORD.letters);
    const chips = document.createElement('div');
    chips.className = 'howto-chips';
    for (const ch of sc.chips) {
      const c = document.createElement('span');
      c.className = `chip chip--${ch.kind} chip--on`;
      const sw = document.createElement('i');
      const v = document.createElement('b');
      v.textContent = `×${fmtMult(ch.mult)}`;
      c.append(sw, v);
      const name = document.createElement('span');
      name.className = 'howto-chip-name';
      name.textContent = ch.kind === 'length' ? fill(UI.letters, ch.count) : COLOURS[ch.kind]?.label ?? '';
      const pair = document.createElement('span');
      pair.className = 'howto-chip';
      pair.append(name, c);
      chips.appendChild(pair);
    }
    const sum = document.createElement('p');
    sum.className = 'howto-sum';
    sum.textContent = fill(HOWTO.sum, fmtN(sc.shownPoints), fmtMult(sc.shownMult), fmtN(sc.total));
    fig.append(cap, miniWord(tiles, null), chips, sum);
    body.appendChild(fig);
    body.appendChild(para(HOWTO.hold));
    body.appendChild(para(HOWTO.patrons));
    dlg.appendChild(body);
    // A tap on the dimmed page around the sheet puts it away.
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  }
  hidePop();
  dlg.showModal();
}

// ─── The two ways to play ─────────────────────────────────────────────────────
// The name in the corner opens a short list of the modes, the one you are in
// marked; a tap anywhere else, or Escape, puts it away. (The same menu sits
// under the ❦ of the other page.)
{
  const btn = document.getElementById('modeBtn'), list = document.getElementById('modeList');
  const show = on => { list.hidden = !on; btn.setAttribute('aria-expanded', on ? 'true' : 'false'); };
  btn?.addEventListener('click', e => { e.stopPropagation(); show(list.hidden); });
  document.addEventListener('click', e => { if (list && !list.hidden && !list.contains(e.target)) show(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && list && !list.hidden) { show(false); btn.focus(); } });
  document.getElementById('howtoBtn')?.addEventListener('click', e => { e.stopPropagation(); show(false); openHowto(); });
}
