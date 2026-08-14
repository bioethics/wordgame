import {
  RACK_SIZE, WORDS_PER_PAGE, DISCARDS_PER_PAGE, STARTING_COINS,
  PATRON_SLOTS, SUNDRY_SLOTS,
  BAG_COUNTS, TILE_POINTS, sundryDef,
  quotaFor, makeTileTemplate,
} from './constants.js';

const SAVE_KEY     = 'folio_save_v1';
const SETTINGS_KEY = 'folio_settings_v1';
const SAVE_VERSION = 7;   // v7: foundry→market rename reaches saved field names

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

let _nextId = 1;
export const nextId = () => _nextId++;

// Collection templates carry a stable id (tid) so live rack tiles, stall
// selections and gilder proposals can all point back at the owned tile —
// painting a tile mid-word has to reach the template it was drawn from.
let _nextTid = 1;
const nextTid = () => _nextTid++;

// Deep-copy a template into a collection-ready tile with a fresh tid.
// Every route into the collection (draft picks, shop buys, the Stereotyper)
// goes through here so no two owned tiles ever share a tid.
export function adoptTemplate(tmpl) {
  return { ...JSON.parse(JSON.stringify(tmpl)), tid: nextTid() };
}

// The letter this tile is currently acting as
export function getActiveLetter(tile) {
  if (tile.letterType === 'dual' && tile.activeVariant === 1 && tile.altLetter) {
    return tile.altLetter;
  }
  return tile.letter;
}

// The paint on the face currently showing (dual faces are painted independently)
export function getActiveColour(tile) {
  if (tile.letterType === 'dual' && tile.activeVariant === 1) return tile.altColour;
  return tile.colour;
}

// Convert a bag template into a full rack tile
function templateToTile(template) {
  const active = template.activeVariant === 1 ? template.altLetter : template.letter;
  return {
    ...template,
    id:         nextId(),
    basePoints: TILE_POINTS[active] ?? TILE_POINTS[template.letter] ?? 1,
    selected:   false,
  };
}

// Plain and unpainted — the opening draft is where colour enters the run.
function buildStarterCollection() {
  const col = [];
  for (const [L, count] of Object.entries(BAG_COUNTS)) {
    for (let i = 0; i < count; i++) col.push(adoptTemplate(makeTileTemplate(L)));
  }
  return col;
}

// ─── Settings (persist independently of the run) ──────────────────────────────

export const settings = {
  animSpeed: 1,     // 0.5 – 3, divides every duration
  sound:     true,
};

export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    if (typeof s.animSpeed === 'number') settings.animSpeed = Math.min(3, Math.max(0.5, s.animSpeed));
    if (typeof s.sound === 'boolean')    settings.sound = s.sound;
  } catch { /* defaults */ }
}

export function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* quota */ }
}

// ─── State ────────────────────────────────────────────────────────────────────

export const state = {
  collection: [],   // template[] — every tile you own
  bag:  [],         // template[] — undrawn tiles this page
  rack: [],         // tile[]
  word: [],         // tile[]
  discardPile: [],  // tile[]    — printed or discarded this page

  chapter: 1,
  page:    1,
  quota:   quotaFor(1, 1),
  pageScore: 0,
  wordsLeft: WORDS_PER_PAGE,
  discards: DISCARDS_PER_PAGE,
  discardsMax: DISCARDS_PER_PAGE,   // copper trims refresh up to this
  wordsPrinted: 0,  // words printed this page

  coins:   STARTING_COINS,
  patrons: [],      // [{ id }]
  sundries: [],     // [{ kind: 'tube', colour } | { kind: 'graver', nick } | { kind: 'reshuffle' }]
  upgradeCounts: {}, // id → times taken this run, from the Colophon (see js/upgrades.js)
  scavengerPoints: 0,  // pending bonus from The Scavenger

  totalScore: 0,
  stats: { words: 0, pages: 0, bestWord: '', bestScore: 0 },
  ledger: [],       // { word, score, chapter, page } for every word printed this run

  endless:   false,
  inMarket: false,
  inDraft:   false,      // the opening draft is up
  inColophon: false,     // the end-of-chapter upgrade pick is up
  isAnimating: false,
  discardMode: false,    // rack taps select tiles to discard
  sundryMode: -1,        // index of the armed sundry; board taps select its targets
  gameOver:  false,
};

// ─── Effective sizes ────────────────────────────────────────────────────────
// Base constants plus whatever the Colophon has permanently granted this run.
export const effectiveRackSize    = () => RACK_SIZE    + (state.upgradeCounts?.handSize     ?? 0);
export const effectivePatronSlots = () => PATRON_SLOTS + (state.upgradeCounts?.patronSeat    ?? 0);
export const effectiveSundrySlots = () => SUNDRY_SLOTS + (state.upgradeCounts?.workbenchSlot ?? 0);

export const owns = id => state.patrons.some(p => p.id === id);

// ─── Persist ──────────────────────────────────────────────────────────────────

export function saveState(extra = {}) {
  try {
    const rack = state.rack.map(t => ({ ...t, selected: false }));
    const word = state.word.map(t => ({ ...t, selected: false }));
    const s = {
      ...state, rack, word,
      isAnimating: false, sundryMode: -1,
      _nextId, _nextTid, _v: SAVE_VERSION,
      ...extra,                       // e.g. a market snapshot
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch { /* quota */ }
}

export function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (s._v !== SAVE_VERSION) return null;
    if (!Array.isArray(s.collection) || !Array.isArray(s.rack)) return null;
    const { _nextId: savedId, _nextTid: savedTid, _v, _market, _draft, _colophon, ...fields } = s;
    Object.assign(state, fields, { isAnimating: false, discardMode: false, sundryMode: -1 });
    state.sundries ??= [];
    state.upgradeCounts ??= {};
    if (savedId)  _nextId  = savedId;
    if (savedTid) _nextTid = savedTid;
    return { market: _market ?? null, draft: _draft ?? null, colophon: _colophon ?? null };
  } catch { return null; }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

// ─── Run / page lifecycle ─────────────────────────────────────────────────────

export function newRun() {
  _nextId = 1;
  _nextTid = 1;
  Object.assign(state, {
    collection: buildStarterCollection(),
    bag: [], rack: [], word: [], discardPile: [],
    chapter: 1, page: 1,
    quota: quotaFor(1, 1), pageScore: 0,
    wordsLeft: WORDS_PER_PAGE, discards: DISCARDS_PER_PAGE,
    discardsMax: DISCARDS_PER_PAGE, wordsPrinted: 0,
    coins: STARTING_COINS, patrons: [], sundries: [], upgradeCounts: {}, scavengerPoints: 0,
    totalScore: 0,
    stats: { words: 0, pages: 0, bestWord: '', bestScore: 0 },
    ledger: [],
    endless: false, inMarket: false, inDraft: false, inColophon: false,
    isAnimating: false, discardMode: false, sundryMode: -1, gameOver: false,
  });
  startPage();
}

// Reshuffle the whole collection into the bag and reset page counters.
// (Drawing the opening rack is left to the caller so it can be animated.)
export function startPage() {
  state.bag  = shuffle([...state.collection]);
  state.rack = [];
  state.word = [];
  state.discardPile = [];
  state.quota        = quotaFor(state.chapter, state.page);
  state.pageScore    = 0;
  state.wordsPrinted = 0;
  state.wordsLeft    = WORDS_PER_PAGE;
  state.discardsMax = DISCARDS_PER_PAGE + (owns('quartermaster') ? 1 : 0) + (state.upgradeCounts?.discard ?? 0);
  state.discards    = state.discardsMax;
  state.scavengerPoints = 0;
  state.discardMode = false;
  state.sundryMode = -1;
}

// ─── Tile operations ──────────────────────────────────────────────────────────

// Returns the tiles drawn (so the caller can animate them in).
export function drawUpToRackSize() {
  const drawn = [];
  while (state.rack.length + state.word.length < effectiveRackSize() && state.bag.length) {
    const tile = templateToTile(state.bag.pop());
    state.rack.push(tile);
    drawn.push(tile);
  }
  return drawn;
}

export function clearWord() {
  state.rack.push(...state.word.splice(0));
}

export function shuffleRack() {
  shuffle(state.rack);
}

// Discard the selected rack tiles: they go to the discard pile and
// replacements come from the bag. Returns { removed, drawn } or null.
export function discardSelected() {
  if (state.discards <= 0) return null;
  const selected = state.rack.filter(t => t.selected);
  if (!selected.length) return null;

  for (const t of selected) {
    const i = state.rack.indexOf(t);
    if (i >= 0) state.rack.splice(i, 1);
    t.selected = false;
    state.discardPile.push(t);
  }
  state.discards -= 1;
  if (owns('scavenger')) state.scavengerPoints += 12;

  const drawn = drawUpToRackSize();
  return { removed: selected, drawn };
}

export function getWordString() {
  return state.word.map(t => getActiveLetter(t)).join('');
}

// Where a printed tile goes. Mercury trims slip back into the bag — dropped in
// at a random depth so they aren't simply redrawn on the next turn.
export function retirePrinted(tiles) {
  const toBag = [], toPile = [];
  for (const t of tiles) {
    if (t.trim === 'mercury') {
      const { id, selected, basePoints, ...template } = t;
      const at = Math.floor(Math.random() * (state.bag.length + 1));
      state.bag.splice(at, 0, template);
      toBag.push(t);
    } else {
      state.discardPile.push(t);
      toPile.push(t);
    }
  }
  return { toBag, toPile };
}

// ─── Ledger ───────────────────────────────────────────────────────────────────

export function recordWord(word, score) {
  state.ledger ??= [];
  state.ledger.push({ word, score, chapter: state.chapter, page: state.page });
}

// ─── Selection ────────────────────────────────────────────────────────────────

export function toggleSelected(id) {
  const tile = state.rack.find(t => t.id === id);
  if (tile) tile.selected = !tile.selected;
}

export function clearAllSelected() {
  state.rack.forEach(t => { t.selected = false; });
  state.word.forEach(t => { t.selected = false; });
}

export const selectedCount = () => state.rack.filter(t => t.selected).length;

// ─── Sundries (the workbench) ─────────────────────────────────────────────────

export const sundrySelected = () =>
  [...state.word, ...state.rack].filter(t => t.selected);

// The sundry currently armed, if any.
export const armedSundry = () =>
  state.sundryMode >= 0 ? state.sundries[state.sundryMode] ?? null : null;

// While a sundry is armed, board taps select its targets — rack and word
// alike. Returns 'on' | 'off' | 'full' | 'blocked' so the caller can explain a
// refused pick (see SUNDRY_DEFS for the words it uses).
export function toggleSundrySelect(id) {
  const tile = state.rack.find(t => t.id === id) ?? state.word.find(t => t.id === id);
  const def  = sundryDef(armedSundry());
  if (!tile || !def?.max) return 'off';
  if (tile.selected) { tile.selected = false; return 'off'; }
  if (!def.eligible(tile)) return 'blocked';
  if (sundrySelected().length >= def.max) return 'full';
  tile.selected = true;
  return 'on';
}

// A board sundry marks the live tile and the collection template it was drawn
// from alike — the change is permanent, not just for this page.
function writeThrough(tile, change) {
  change(tile);
  const tmpl = state.collection.find(c => c.tid === tile.tid);
  if (tmpl) change(tmpl);
}

// Spend the armed sundry on the selected tiles: a tube paints the face that's
// showing (dual faces are painted independently), a graver cuts its nick into
// the tile itself (both faces carry it, as nicks always do).
export function applySundry(idx) {
  const sundry = state.sundries[idx];
  const def = sundryDef(sundry);
  if (!def?.max) return null;
  const targets = sundrySelected().filter(def.eligible).slice(0, def.max);
  if (!targets.length) return null;

  const letters = [];
  for (const t of targets) {
    if (sundry.kind === 'graver') {
      writeThrough(t, x => { x.nick = sundry.nick; });
    } else {
      const face = t.letterType === 'dual' && t.activeVariant === 1 ? 'altColour' : 'colour';
      writeThrough(t, x => { x[face] = sundry.colour; });
    }
    t.selected = false;
    letters.push(getActiveLetter(t));
  }
  state.sundries.splice(idx, 1);
  state.sundryMode = -1;
  return { ...sundry, letters, ids: targets.map(t => t.id) };
}

// A reshuffle sundry has no board target — it's spent from the Market or the
// Colophon instead. Consumes the first one on the workbench, if any.
export function spendReshuffleSundry() {
  const idx = state.sundries.findIndex(s => s.kind === 'reshuffle');
  if (idx < 0) return false;
  state.sundries.splice(idx, 1);
  return true;
}

export function toggleDualVariant(id) {
  const tile = state.rack.find(t => t.id === id) ?? state.word.find(t => t.id === id);
  if (!tile || tile.letterType !== 'dual') return;
  tile.activeVariant = tile.activeVariant === 0 ? 1 : 0;
  tile.basePoints = TILE_POINTS[getActiveLetter(tile)] ?? 1;
}

// ─── Painting ─────────────────────────────────────────────────────────────────

// Every unpainted letter face in the collection (dual faces count separately).
export function unpaintedFaces() {
  const faces = [];
  for (const t of state.collection) {
    if (!t.colour) faces.push({ tile: t, face: 0 });
    if (t.letterType === 'dual' && !t.altColour) faces.push({ tile: t, face: 1 });
  }
  return faces;
}

// Paint `count` random unpainted faces. Returns the letters painted.
export function paintRandomFaces(colour, count) {
  const faces = shuffle(unpaintedFaces()).slice(0, count);
  return faces.map(({ tile, face }) => {
    if (face === 0) tile.colour = colour;
    else            tile.altColour = colour;
    return face === 0 ? tile.letter : tile.altLetter;
  });
}

// ─── Tile movement ────────────────────────────────────────────────────────────

export function moveRackToWord(id, insertIdx) {
  const i = state.rack.findIndex(t => t.id === id);
  if (i < 0) return;
  const [tile] = state.rack.splice(i, 1);
  tile.selected = false;
  state.word.splice(insertIdx ?? state.word.length, 0, tile);
}

export function moveWordToRack(id, insertIdx) {
  const i = state.word.findIndex(t => t.id === id);
  if (i < 0) return;
  const [tile] = state.word.splice(i, 1);
  state.rack.splice(insertIdx ?? state.rack.length, 0, tile);
}

export function reorderWord(id, insertIdx) {
  const i = state.word.findIndex(t => t.id === id);
  if (i < 0) return;
  const [tile] = state.word.splice(i, 1);
  state.word.splice(insertIdx > i ? insertIdx - 1 : insertIdx, 0, tile);
}

export function reorderRack(id, insertIdx) {
  const i = state.rack.findIndex(t => t.id === id);
  if (i < 0) return;
  const [tile] = state.rack.splice(i, 1);
  state.rack.splice(insertIdx > i ? insertIdx - 1 : insertIdx, 0, tile);
}
