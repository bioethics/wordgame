import {
  RACK_SIZE, WORDS_PER_PAGE, DISCARDS_PER_PAGE, STARTING_COINS,
  PATRON_SLOTS, SUNDRY_SLOTS, SMELT_MIN_COLLECTION,
  BAG_COUNTS, TILE_POINTS, TUBE_TILES, CURSED_MAX_POINTS, isImmutable,
  quotaFor, makeTileTemplate,
} from './constants.js';
import { CHAPTER_TITLES } from './chapters.js';

const SAVE_KEY     = 'folio_save_v1';
const SETTINGS_KEY = 'folio_settings_v1';
const SAVE_VERSION = 10;  // v10: tiles carry a material

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

// Whether a tile reads as a given colour to anything that cares *which* colour
// it is — every patron, and the Fountain's return-to-bag. A rainbow tile reads
// as all four at once. This is deliberately NOT what the colour multipliers
// use: those count actual paint (getActiveColour), so a rainbow tile lifts a
// multiplier only where it has been painted, and can't be four at once there.
export const countsAsColour = (tile, colour) =>
  tile.material === 'rainbow' || getActiveColour(tile) === colour;

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
  discardsMax: DISCARDS_PER_PAGE,   // cobalt trims refresh up to this
  wordsPrinted: 0,  // words printed this page

  coins:   STARTING_COINS,
  patrons: [],      // [{ id, uid, data }] — data is the seat's own memory (Stoker stacks,
                    // a Monogrammist's letters); uid tells copies of a stackable patron apart
  sundries: [],     // [{ kind: 'tube', colour } | { kind: 'reshuffle' }] — the workbench
  upgradeCounts: {}, // id → times taken this run, from the Colophon (see js/upgrades.js)
  luck: 1,             // scales every "good outcome" roll (see luckyRoll) — a future dial
  lastFirstLetter: null,  // first letter of the last word printed this run (The Skald)
  chapterTitles: {},   // chapter → the title this run drew for it
  compost: [],         // The Composter's heap: jade templates waiting at the Market
  compostPending: 0,   // tiles destroyed since the last Market, not yet rotted down

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

// ─── Chapter titles ───────────────────────────────────────────────────────────
// Drawn at random from js/chapters.js the first time a chapter is named, then
// kept for the rest of the run — a reload must not rename a chapter under you.
// A run won't repeat a title until the list is exhausted, so a longer list in
// chapters.js makes for a stranger book.

export function chapterTitle(ch) {
  state.chapterTitles ??= {};
  if (state.chapterTitles[ch]) return state.chapterTitles[ch];
  const used = new Set(Object.values(state.chapterTitles));
  const fresh = CHAPTER_TITLES.filter(t => !used.has(t));
  const pool = fresh.length ? fresh : CHAPTER_TITLES;
  state.chapterTitles[ch] = pool[Math.floor(Math.random() * pool.length)] ?? '';
  return state.chapterTitles[ch];
}

// A seated patron's private memory (created on first touch, saved with the run).
export function patronData(id) {
  const seat = state.patrons.find(p => p.id === id);
  if (!seat) return null;
  seat.data ??= {};
  return seat.data;
}

// Every chance roll a player would *want* to succeed goes through here, so the
// luck dial (state.luck, ×1 by default) can one day be turned by patrons or
// Colophon picks. Deliberately NOT used for bad outcomes (e.g. Arsonist burns).
export const luckyRoll = p => Math.random() < Math.min(1, p * (state.luck ?? 1));

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
    state.luck ??= 1;
    state.lastFirstLetter ??= null;
    state.chapterTitles ??= {};
    state.compost ??= [];
    state.compostPending ??= 0;
    if (savedId)  _nextId  = savedId;
    if (savedTid) _nextTid = savedTid;
    // Seats saved before uids existed get one now — after the counters above,
    // so a backfilled uid can never collide with a tile id already in the save.
    state.patrons?.forEach(p => { p.uid ??= nextId(); });
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
    coins: STARTING_COINS, patrons: [], sundries: [], upgradeCounts: {},
    luck: 1, lastFirstLetter: null, chapterTitles: {},
    compost: [], compostPending: 0,
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
  state.discardMode = false;
  state.sundryMode = -1;
}

// ─── Tile operations ──────────────────────────────────────────────────────────

// Tiles that take up a place in the hand. A ghost holds none — it rides along
// beside the hand rather than in it, so drawing tops up around it.
const handCount = () =>
  [...state.rack, ...state.word].filter(t => t.material !== 'ghost').length;

// Returns the tiles drawn (so the caller can animate them in).
export function drawUpToRackSize() {
  const drawn = [];
  while (handCount() < effectiveRackSize() && state.bag.length) {
    const tile = templateToTile(state.bag.pop());
    state.rack.push(tile);
    drawn.push(tile);
  }
  return drawn;
}

// Strike a new tile: it joins the collection for good and arrives in the rack
// straight away, so whatever paid for it pays off on the page you spend it.
export function castTile(overrides = {}) {
  const { letter, ...rest } = overrides;
  const tmpl = adoptTemplate(makeTileTemplate(letter, rest));
  state.collection.push(tmpl);
  const tile = templateToTile(tmpl);
  state.rack.push(tile);
  return tile;
}

// An ingot's tile. A cursed one is never cast on a letter worth much — its
// ×Mult is the point, not its Points.
export function castMaterialTile(material) {
  const letters = Object.keys(BAG_COUNTS).filter(L =>
    material !== 'cursed' || (TILE_POINTS[L] ?? 99) <= CURSED_MAX_POINTS);
  return castTile({ letter: letters[Math.floor(Math.random() * letters.length)], material });
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
  // Cursed tiles can't leave this way, however they came to be selected.
  const selected = state.rack.filter(t => t.selected && t.material !== 'cursed');
  if (!selected.length) return null;

  for (const t of selected) {
    const i = state.rack.indexOf(t);
    if (i >= 0) state.rack.splice(i, 1);
    t.selected = false;
    state.discardPile.push(t);
  }
  state.discards -= 1;

  const drawn = drawUpToRackSize();
  return { removed: selected, drawn };
}

export function getWordString() {
  return state.word.map(t => getActiveLetter(t)).join('');
}

// Which printed tiles slip back into the bag rather than the discard pile:
// mercury trims always, and every azure tile while The Fountain is seated.
// Scoring reads the same rule for its "↩ to bag" flag, so the promise the
// board makes while you compose is the one printing keeps.
export const returnsToBag = tile =>
  tile.trim === 'mercury' || (owns('fountain') && countsAsColour(tile, 'azure'));

// Where a printed tile goes. Returning tiles are dropped in at a random depth
// so they aren't simply redrawn on the next turn.
export function retirePrinted(tiles) {
  const toBag = [], toPile = [];
  for (const t of tiles) {
    if (returnsToBag(t)) {
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

// ─── Permanent tile changes (patron effects) ──────────────────────────────────

// Grow a tile's value for good: the bonus is written to the live tile AND the
// collection template it was drawn from (same write-through as painting), so
// it survives the page, the save, and every reshuffle. The corner number
// renders jade once a tile carries grown points.
export function growTile(tile, n = 1) {
  if (isImmutable(tile)) return false;
  tile.bonusPoints = (tile.bonusPoints ?? 0) + n;
  const tmpl = state.collection.find(c => c.tid === tile.tid);
  if (tmpl) tmpl.bonusPoints = (tmpl.bonusPoints ?? 0) + n;
  return tile.bonusPoints;
}

// Paint the face a tile is currently showing (dual faces are painted
// separately), writing through to the collection so the paint is permanent.
// Every route to permanent paint goes through here — tubes, the Painter,
// patrons — so none of them can drift apart.
export function paintTile(tile, colour) {
  if (isImmutable(tile)) return false;
  const altFace = tile.letterType === 'dual' && tile.activeVariant === 1;
  if (altFace) tile.altColour = colour;
  else         tile.colour    = colour;
  const tmpl = state.collection.find(c => c.tid === tile.tid);
  if (tmpl) {
    if (altFace) tmpl.altColour = colour;
    else         tmpl.colour    = colour;
  }
  return true;
}

// A trim belongs to the tile, not to either face. Refuses a tile that already
// wears one — trims don't stack.
export function trimTile(tile, kind) {
  if (tile.trim || isImmutable(tile)) return false;
  tile.trim = kind;
  const tmpl = state.collection.find(c => c.tid === tile.tid);
  if (tmpl) tmpl.trim = kind;
  return true;
}

// Remove a tile from the collection for good (Stoker burns, Arsonist
// accidents, the Smelter's furnace). Honours the same floor as the Smelter so
// nothing can eat the press out of house and home. Returns the removed
// template, or null if the floor held. Live copies (rack / word / discard
// pile) are the caller's to clean up.
//
// Every route to permanent destruction comes through here, which is what lets
// The Composter count them all. The rot is banked as a number and turned into
// actual tiles when the Market opens (see rotCompost in js/market.js) — the
// heap is only ever looked at there, and tile generation lives over in the
// Market, so this end just keeps the tally.
export function trashFromCollection(tid) {
  if (state.collection.length <= SMELT_MIN_COLLECTION) return null;
  const i = state.collection.findIndex(c => c.tid === tid);
  if (i < 0) return null;
  const [removed] = state.collection.splice(i, 1);
  if (owns('composter')) state.compostPending = (state.compostPending ?? 0) + 1;
  return removed;
}

// ─── Ledger ───────────────────────────────────────────────────────────────────

export function recordWord(word, score) {
  state.ledger ??= [];
  state.ledger.push({ word, score, chapter: state.chapter, page: state.page });
}

// ─── Selection ────────────────────────────────────────────────────────────────

// Returns 'on' | 'off' | 'cursed' | 'none', so a refused pick can be explained.
// A cursed tile can't be thrown away; the only way out of the rack is to print it.
export function toggleSelected(id) {
  const tile = state.rack.find(t => t.id === id);
  if (!tile) return 'none';
  if (!tile.selected && tile.material === 'cursed') return 'cursed';
  tile.selected = !tile.selected;
  return tile.selected ? 'on' : 'off';
}

export function clearAllSelected() {
  state.rack.forEach(t => { t.selected = false; });
  state.word.forEach(t => { t.selected = false; });
}

export const selectedCount = () => state.rack.filter(t => t.selected).length;

// ─── Sundries (the workbench) ─────────────────────────────────────────────────

export const sundrySelected = () =>
  [...state.word, ...state.rack].filter(t => t.selected);

// While a tube is armed, board taps select its targets — rack and word alike.
// Returns 'on' | 'off' | 'full' so the caller can explain a refused pick.
export function toggleSundrySelect(id) {
  const tile = state.rack.find(t => t.id === id) ?? state.word.find(t => t.id === id);
  if (!tile) return 'off';
  if (tile.selected) { tile.selected = false; return 'off'; }
  if (isImmutable(tile)) return 'immutable';
  if (sundrySelected().length >= TUBE_TILES) return 'full';
  tile.selected = true;
  return 'on';
}

// Spend the armed tube on the selected tiles. The live tile's showing face is
// painted, and the change is written through to the collection template it was
// drawn from — the paint is permanent, not just for this page.
export function applySundry(idx) {
  const sundry = state.sundries[idx];
  if (!sundry) return null;
  const targets = sundrySelected().filter(t => !isImmutable(t)).slice(0, TUBE_TILES);
  if (!targets.length) return null;

  const letters = [];
  for (const t of targets) {
    paintTile(t, sundry.colour);
    t.selected = false;
    letters.push(getActiveLetter(t));
  }
  state.sundries.splice(idx, 1);
  state.sundryMode = -1;
  return { colour: sundry.colour, letters, ids: targets.map(t => t.id) };
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
