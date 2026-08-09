import {
  RACK_SIZE, WORDS_PER_PAGE, EXCHANGES_PER_PAGE, STARTING_COINS,
  BAG_COUNTS, TILE_POINTS, STARTER_COLOURED,
  quotaFor, makeTileTemplate,
} from './constants.js';

const SAVE_KEY     = 'folio_save_v1';
const SETTINGS_KEY = 'folio_settings_v1';
const SAVE_VERSION = 2;   // v2: tile `ink` → `colour`, scavengerInk → scavengerPoints

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

// The letter this tile is currently acting as
export function getActiveLetter(tile) {
  if (tile.letterType === 'dual' && tile.activeVariant === 1 && tile.altLetter) {
    return tile.altLetter;
  }
  return tile.letter;
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

function buildStarterCollection() {
  const col = [];
  for (const [L, count] of Object.entries(BAG_COUNTS)) {
    for (let i = 0; i < count; i++) col.push(makeTileTemplate(L));
  }
  // Tint a few starter tiles so colour sets show themselves early
  for (const [L, colour] of STARTER_COLOURED) {
    const t = col.find(c => c.letter === L && !c.colour);
    if (t) t.colour = colour;
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
  tray: [],         // tile[]    — printed / exchanged this page

  chapter: 1,
  page:    1,
  quota:   quotaFor(1, 1),
  pageScore: 0,
  wordsLeft: WORDS_PER_PAGE,
  exchanges: EXCHANGES_PER_PAGE,
  wordsPrinted: 0,  // words printed this page

  coins:   STARTING_COINS,
  patrons: [],      // [{ id }]
  scavengerPoints: 0,  // pending bonus from The Scavenger

  totalScore: 0,
  stats: { words: 0, pages: 0, bestWord: '', bestScore: 0 },

  endless:   false,
  inFoundry: false,
  isAnimating: false,
  exchangeMode: false,   // rack taps select tiles for exchange
  gameOver:  false,
};

export const owns = id => state.patrons.some(p => p.id === id);

// ─── Persist ──────────────────────────────────────────────────────────────────

export function saveState(extra = {}) {
  try {
    const rack = state.rack.map(t => ({ ...t, selected: false }));
    const s = {
      ...state, rack,
      isAnimating: false,
      _nextId, _v: SAVE_VERSION,
      ...extra,                       // e.g. a foundry snapshot
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
    const { _nextId: savedId, _v, _foundry, ...fields } = s;
    Object.assign(state, fields, { isAnimating: false, exchangeMode: false });
    if (savedId) _nextId = savedId;
    return { foundry: _foundry ?? null };
  } catch { return null; }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

// ─── Run / page lifecycle ─────────────────────────────────────────────────────

export function newRun() {
  _nextId = 1;
  Object.assign(state, {
    collection: buildStarterCollection(),
    bag: [], rack: [], word: [], tray: [],
    chapter: 1, page: 1,
    quota: quotaFor(1, 1), pageScore: 0,
    wordsLeft: WORDS_PER_PAGE, exchanges: EXCHANGES_PER_PAGE, wordsPrinted: 0,
    coins: STARTING_COINS, patrons: [], scavengerPoints: 0,
    totalScore: 0,
    stats: { words: 0, pages: 0, bestWord: '', bestScore: 0 },
    endless: false, inFoundry: false, isAnimating: false, exchangeMode: false, gameOver: false,
  });
  startPage();
}

// Reshuffle the whole collection into the bag and reset page counters.
// (Drawing the opening rack is left to the caller so it can be animated.)
export function startPage() {
  state.bag  = shuffle([...state.collection]);
  state.rack = [];
  state.word = [];
  state.tray = [];
  state.quota        = quotaFor(state.chapter, state.page);
  state.pageScore    = 0;
  state.wordsPrinted = 0;
  state.wordsLeft    = WORDS_PER_PAGE;
  state.exchanges    = EXCHANGES_PER_PAGE + (owns('quartermaster') ? 1 : 0);
  state.scavengerPoints = 0;
  state.exchangeMode = false;
}

// ─── Tile operations ──────────────────────────────────────────────────────────

// Returns the tiles drawn (so the caller can animate them in).
export function drawUpToRackSize() {
  const drawn = [];
  while (state.rack.length + state.word.length < RACK_SIZE && state.bag.length) {
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

// Exchange the selected rack tiles: they go to the tray (spent),
// replacements come from the bag. Returns { removed, drawn } or null.
export function exchangeSelected() {
  if (state.exchanges <= 0) return null;
  const selected = state.rack.filter(t => t.selected);
  if (!selected.length) return null;

  for (const t of selected) {
    const i = state.rack.indexOf(t);
    if (i >= 0) state.rack.splice(i, 1);
    t.selected = false;
    state.tray.push(t);
  }
  state.exchanges -= 1;
  if (owns('scavenger')) state.scavengerPoints += 12;

  const drawn = drawUpToRackSize();
  return { removed: selected, drawn };
}

export function getWordString() {
  return state.word.map(t => getActiveLetter(t)).join('');
}

// ─── Selection ────────────────────────────────────────────────────────────────

export function toggleSelected(id) {
  const tile = state.rack.find(t => t.id === id);
  if (tile) tile.selected = !tile.selected;
}

export function clearAllSelected() {
  state.rack.forEach(t => { t.selected = false; });
}

export const selectedCount = () => state.rack.filter(t => t.selected).length;

export function toggleDualVariant(id) {
  const tile = state.rack.find(t => t.id === id) ?? state.word.find(t => t.id === id);
  if (!tile || tile.letterType !== 'dual') return;
  tile.activeVariant = tile.activeVariant === 0 ? 1 : 0;
  tile.basePoints = TILE_POINTS[getActiveLetter(tile)] ?? 1;
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
