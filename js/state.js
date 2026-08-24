import {
  RACK_SIZE, WORDS_PER_PAGE, DISCARDS_PER_PAGE, STARTING_COINS,
  PATRON_SLOTS, SUNDRY_SLOTS, SMELT_MIN_COLLECTION,
  BAG_COUNTS, TILE_POINTS, DABBLER_ODDS, CURSED_MAX_POINTS, isImmutable, isMark,
  MARKS, MARK_TRIM, SILVER_BONUS, FLEURON, LOUPE_CAP, TONGS_BONUS, WASH_COUNT,
  REVENANT_ODDS,
  COLOURS, TRIMS, NICKS, MATERIALS,
  quotaFor, makeTileTemplate, GAMBLER_ODDS, isDeadline,
  MAGPIE_WEIGHT, MAKO_WEIGHT,
} from './constants.js';
import { CHAPTER_TITLES } from './chapters.js';
import { BOSS_DEFS, activeBoss, bossConflicts } from './bosses.js';

const SAVE_KEY     = 'folio_save_v1';
const SETTINGS_KEY = 'folio_settings_v1';
const SAVE_VERSION = 12;  // v12: the Vintner was cut

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

// Deep-copy a template into a collection-ready tile with a fresh tid. Every
// route into the collection goes through here, so no two owned tiles share one.
export function adoptTemplate(tmpl) {
  return { ...JSON.parse(JSON.stringify(tmpl)), tid: nextTid() };
}

export function getActiveLetter(tile) {
  if (tile.letterType === 'dual' && tile.activeVariant === 1 && tile.altLetter) {
    return tile.altLetter;
  }
  return tile.letter;
}

// A tile wrapped by The Redactor (js/bosses.js) still spells, and nothing
// else. The readers below hide its colour and value rather than destroying
// them, so the page's end gives everything back. Scoring reads a few things off
// the tile directly rather than through these — see computeScore's pass 0.
export const isWrapped = tile => !!tile?.wrapped;

// A tile that SPELLS AND NOTHING ELSE — no Points, no paint, no growth, no
// colour to any patron that counts them. Two quite different things read this
// way: The Redactor's wrapping, which is a page-long condition laid over a real
// tile and taken off again; and a counterfeit sort, which is a forgery with
// nothing under it at all and never was anything else. The readers below hide
// rather than destroy, so the Redactor's page gives everything back.
export const spellsOnly = tile => isWrapped(tile) || !!tile?.counterfeit;

// The paint a tile is wearing — the same whichever face a dual shows, since
// paint belongs to the tile. A wash reads as paint here, so it counts to
// patrons AND multipliers alike, unlike rainbow metal (which speaks only
// through countsAsColour). Real paint sits over a wash and wins.
export const getActiveColour = tile =>
  (spellsOnly(tile) ? null : tile.colour ?? tile.wash ?? null);

// What a tile is worth before the word it sits in touches it: face value,
// growth set permanently into it, and a silver trim — the number it wears
// wherever it appears. Growth follows the FACE, not the tile: a dual keeps
// `bonusPoints` for its first letter and `altBonusPoints` for its second, so
// flipping it flips which one counts.
export const getActiveGrowth = tile =>
  (spellsOnly(tile) ? 0 : (tile.activeVariant === 1 ? tile.altBonusPoints : tile.bonusPoints) ?? 0);

export const restingPoints = tile =>
  (spellsOnly(tile) ? 0
    : (TILE_POINTS[getActiveLetter(tile)] ?? tile.basePoints ?? 1)
      + getActiveGrowth(tile)
      + (tile.trim === 'silver' ? SILVER_BONUS : 0));

// Whether a tile reads as a given colour to anything that cares *which* colour
// it is — every patron, and the Fountain's return-to-bag. A rainbow tile reads
// as all four at once. Deliberately NOT what the colour multipliers use: those
// count actual paint (getActiveColour), so a rainbow tile lifts a multiplier
// only where it has been painted.
export const countsAsColour = (tile, colour) =>
  !spellsOnly(tile) && (tile.material === 'rainbow' || getActiveColour(tile) === colour);

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
  ratchetDir: 1,       // which way an armed ratchet is pointing: +1 later, -1 earlier
  luck: 1,             // scales every "good outcome" roll (see luckyRoll) — a future dial
  rackBonus: 0,        // hand size lent for the rest of THIS page (the Ragman's azure)
  primed: {},          // source id → Points armed for the NEXT word (the tongs,
                       // the Winnower). Spent when a word prints, dropped at a
                       // page turn; scoring reads it so the preview shows it.
  ghosts: [],          // patrons The Ripper has killed — they work on, off the shelf
  lastFirstLetter: null,  // first letter of the last word printed this run (The Skald)
  gambleWon: false,    // this word's coin, tossed by rollGamble (The Gambler)
  chapterTitles: {},   // chapter → the title this run drew for it
  boss: null,          // the Deadline's editor: { id, data } while page 3 runs, else null
  bossesSeen: [],      // editor ids met this run — no repeats until the roster runs out
  compost: [],         // The Composter's heap: jade templates waiting at the Market
  compostPending: 0,   // tiles destroyed since the last Market, not yet rotted down
  freeRerolls: 0,      // The Factor's banked Market re-rolls — spent before coins, gone at close

  totalScore: 0,
  stats: { words: 0, pages: 0, bestWord: '', bestScore: 0 },
  manuscript: [],   // { word, score, chapter, page } for every word printed this run,
                    // in the order they were set — the book the run is writing

  endless:   false,
  inMarket: false,
  inDraft:   false,      // the opening draft is up
  inColophon: false,     // the end-of-chapter upgrade pick is up
  isAnimating: false,
  discardMode: false,    // rack taps select tiles to discard
  sundryMode: -1,        // index of the armed sundry; board taps select its targets
  tubeOffer: null,       // ids of the tiles an armed tube is offering — transient, never saved
  gameOver:  false,
};

// ─── Effective sizes ────────────────────────────────────────────────────────
// Base constants plus whatever the Colophon has permanently granted this run.
export const effectiveWordsPerPage = () =>
  WORDS_PER_PAGE + (owns('overseer') ? 1 : 0) + (state.upgradeCounts?.words ?? 0);
// rackBonus is the one term here that is neither permanent nor the editor's: a
// hand widened for the rest of a page only, cleared at the page turn.
export const effectiveRackSize    = () => RACK_SIZE    + (state.upgradeCounts?.handSize     ?? 0)
                                                       + (activeBoss(state)?.rackBonus      ?? 0)
                                                       + (state.rackBonus                   ?? 0);
export const effectivePatronSlots = () => PATRON_SLOTS + (state.upgradeCounts?.patronSeat    ?? 0);
export const effectiveSundrySlots = () => SUNDRY_SLOTS + (state.upgradeCounts?.workbenchSlot ?? 0);

// Every patron working for you, in the order they speak: the shelf first, then
// the ghosts. A ghost keeps its whole effect and gives up only its seat, so the
// rule for every reader is: ask allSeats what your patrons DO, ask
// state.patrons how many seats are LEFT (the Market's limit, the shelf, the
// reordering). Hands back the live array rather than a copy while there are no
// ghosts — this is called on every keystroke through scoring.
export const allSeats = () =>
  (state.ghosts?.length ? [...state.patrons, ...state.ghosts] : state.patrons);

// Ghosts are held to the same count as the living.
export const effectiveGhostSlots = () => effectivePatronSlots();

// The only door into the graveyard — The Ripper's victims and the ghosts hired
// dead in the Market alike. Marking the seat's own `data` keeps the fact with
// the copy, so a calling card can price it and pay it back correctly wherever
// it is read. Taking the seat off the shelf is the caller's business: a hired
// ghost was never on it.
export const makeGhost = seat => {
  (seat.data ??= {}).ghost = true;
  (state.ghosts ??= []).push(seat);
  return seat;
};

export const owns = id => allSeats().some(p => p.id === id);

// ─── Chapter titles ───────────────────────────────────────────────────────────
// Drawn at random from js/chapters.js the first time a chapter is named, then
// kept in state for the rest of the run — a reload must not rename a chapter
// under you. No repeats until the list is exhausted.

export function chapterTitle(ch) {
  state.chapterTitles ??= {};
  if (state.chapterTitles[ch]) return state.chapterTitles[ch];
  const used = new Set(Object.values(state.chapterTitles));
  const fresh = CHAPTER_TITLES.filter(t => !used.has(t));
  const pool = fresh.length ? fresh : CHAPTER_TITLES;
  state.chapterTitles[ch] = pool[Math.floor(Math.random() * pool.length)] ?? '';
  return state.chapterTitles[ch];
}

// ─── The Editors (Deadline bosses) ────────────────────────────────────────────
// One takes the desk as each Deadline page is dealt, never announced sooner:
// the rule is a puzzle for the rack in front of you, not something to build
// against. Drawn without repeats until the roster runs out. The pick is stored
// in state, so a reload never swaps the editor under you.

function assignBoss() {
  state.bossesSeen ??= [];
  // An editor that inverts a seated patron never takes the desk (see
  // BOSS_CONFLICTS in bosses.js). The shelf is read HERE, as the page is dealt:
  // patrons are hired between pages, so what is seated now is what you face.
  const seated = allSeats().map(p => p.id);
  const allowed = BOSS_DEFS.filter(b => !bossConflicts(b.id, seated));
  // A shelf that rules out every editor still gets one: the whole page's
  // structure (rack size, discards, the bar) assumes an editor is at the desk.
  const roster = allowed.length ? allowed : BOSS_DEFS;

  const fresh = roster.filter(b => !state.bossesSeen.includes(b.id));
  const pool = fresh.length ? fresh : roster;
  if (!fresh.length) state.bossesSeen = [];
  const def = pool[Math.floor(Math.random() * pool.length)];
  state.bossesSeen.push(def.id);
  const data = {};
  def.setup?.(data, state);
  state.boss = { id: def.id, data };
}

// A tile an editor lends you: real for this page, but cast from no template, so
// it takes no permanent change (isImmutable covers it) and is gone as soon as
// the next page rebuilds the bag from the collection.
//
// `aboveHand` rides BESIDE the rack instead of taking one of its places (the
// Enthusiast's gift; the Eeeditor's three E's deliberately do not). `overrides`
// reach makeTileTemplate, so a lent tile can be born wearing a trim it could
// never be given later. `lender` names who is lending it.
export function castLentTile(letter, { aboveHand = false, lender = null, ...overrides } = {}) {
  const tile = templateToTile(makeTileTemplate(letter, overrides));
  tile.ephemeral = true;
  if (aboveHand) tile.aboveHand = true;
  if (lender) tile.lender = lender;
  state.rack.push(tile);
  return tile;
}

// The Counterfeiter's forgeries: a sort with nothing under it. It spells, takes
// a place in the hand like any other tile, and is worth nothing — spellsOnly
// hides its value, isImmutable refuses anything written to it, and `ephemeral`
// means it is cast from no template and gone when the page turns. Everything
// that destroys a tile still works on it; there is simply nothing to salvage.
export function castCounterfeit(letter) {
  const tile = templateToTile(makeTileTemplate(letter));
  tile.ephemeral = true;
  tile.counterfeit = true;
  tile.lender = 'counterfeiter';
  state.rack.push(tile);
  return tile;
}

// The Eeeditor's E's, counted across rack and word alike: one laid into a word
// has not left your hand yet, and must not be replaced until it prints.
export const lentInHand = () =>
  [...state.rack, ...state.word].filter(t => t.ephemeral && !t.aboveHand);


// Every chance roll a player would *want* to succeed goes through here, so the
// luck dial (state.luck, ×1 by default) can scale it. Deliberately NOT used for
// bad outcomes (e.g. Arsonist burns).
export const luckyRoll = p => Math.random() < Math.min(1, p * (state.luck ?? 1));

// ─── Persist ──────────────────────────────────────────────────────────────────

// Walk an older save's shapes forward: a per-face paint folds into the tile's,
// an ingot sundry becomes a wrapped tile, and the minimalist patron id becomes
// abecedarian (a stale id resolves to nothing and renders a blank seat). The
// whole save is walked because any of them can be hiding anywhere in it.
function migrateSave(node) {
  if (Array.isArray(node)) { node.forEach(migrateSave); return; }
  if (!node || typeof node !== 'object') return;
  if ('altColour' in node) {
    node.colour ??= node.altColour;
    delete node.altColour;
  }
  if (node.kind === 'ingot') {
    node.kind = 'wrapped';
    delete node.material;
  }
  if (node.id === 'minimalist') node.id = 'abecedarian';
  // A Market offer used to carry its own `ghost` flag; being dead now rides the
  // copy's `data`, where patronCost can charge for it.
  if (node.ghost === true && 'sold' in node) {
    (node.data ??= {}).ghost = true;
    delete node.ghost;
  }
  // tongsBonus became one entry in the `primed` pool, so the tongs and the
  // Winnower can arm the same word and each be named for it.
  if (typeof node.tongsBonus === 'number') {
    if (node.tongsBonus) (node.primed ??= {}).tongs ??= node.tongsBonus;
    delete node.tongsBonus;
  }
  for (const v of Object.values(node)) migrateSave(v);
}

export function saveState(extra = {}) {
  try {
    const rack = state.rack.map(t => ({ ...t, selected: false }));
    const word = state.word.map(t => ({ ...t, selected: false }));
    const s = {
      ...state, rack, word,
      isAnimating: false, sundryMode: -1, tubeOffer: null,
      _nextId, _nextTid, _v: SAVE_VERSION,
      ...extra,                       // e.g. a market snapshot
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch { /* quota */ }
}

// One-time repair for saves holding the retired mercury trim: a tile still
// wearing one would look itself up in a table that no longer has the row, which
// throws wherever a trim is described. Cobalt is the nearest swap. The whole
// save is walked — a trim can be on a template, a live tile or an unbought
// offer. Returns how many were repaired, so the board can say so.
function retireMercury(node) {
  if (Array.isArray(node)) return node.reduce((n, v) => n + retireMercury(v), 0);
  if (!node || typeof node !== 'object') return 0;
  let n = 0;
  if (node.trim === 'mercury') { node.trim = 'cobalt'; n += 1; }
  for (const v of Object.values(node)) n += retireMercury(v);
  return n;
}

export function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (s._v !== SAVE_VERSION) return null;
    migrateSave(s);
    if (!Array.isArray(s.collection) || !Array.isArray(s.rack)) return null;
    const mercury = retireMercury(s);
    const { _nextId: savedId, _nextTid: savedTid, _v, _market, _draft, _colophon, ...fields } = s;
    Object.assign(state, fields, { isAnimating: false, discardMode: false, sundryMode: -1, tubeOffer: null });
    state.sundries ??= [];
    state.upgradeCounts ??= {};
    state.luck ??= 1;
    state.ratchetDir ??= 1;
    // `ledger` was the manuscript's name in older saves. Tested on emptiness
    // rather than `??=`: state.manuscript defaults to [], which is not nullish,
    // so a coalescing assign would throw an old save's words away.
    if (Array.isArray(state.ledger)) {
      if (!state.manuscript?.length) state.manuscript = state.ledger;
      delete state.ledger;
    }
    state.manuscript ??= [];
    state.lastFirstLetter ??= null;
    state.chapterTitles ??= {};
    state.boss ??= null;
    state.bossesSeen ??= [];
    state.compost ??= [];
    state.compostPending ??= 0;
    state.freeRerolls ??= 0;
    state.rackBonus ??= 0;
    state.ghosts ??= [];
    if (savedId)  _nextId  = savedId;
    if (savedTid) _nextTid = savedTid;
    // Seats saved before uids existed get one now — after the counters above,
    // so a backfilled uid can never collide with a tile id already in the save.
    state.patrons?.forEach(p => { p.uid ??= nextId(); });
    // Every ghost seat says so on its own `data`, however it was hired or made,
    // so the calling card can price it (and pay it back) without asking which
    // list it sits in.
    state.ghosts?.forEach(p => { p.uid ??= nextId(); (p.data ??= {}).ghost = true; });
    return { market: _market ?? null, draft: _draft ?? null, colophon: _colophon ?? null, mercury };
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
    coins: STARTING_COINS, patrons: [], ghosts: [], sundries: [], upgradeCounts: {},
    luck: 1, rackBonus: 0, ratchetDir: 1, lastFirstLetter: null, gambleWon: false, chapterTitles: {},
    boss: null, bossesSeen: [],
    compost: [], compostPending: 0, freeRerolls: 0,
    totalScore: 0,
    stats: { words: 0, pages: 0, bestWord: '', bestScore: 0 },
    manuscript: [],
    endless: false, inMarket: false, inDraft: false, inColophon: false,
    isAnimating: false, discardMode: false, sundryMode: -1, tubeOffer: null, gameOver: false,
    catPending: false,
  });
  startPage();
}

// Reshuffle the whole collection into the bag and reset page counters.
// (Drawing the opening rack is left to the caller so it can be animated.)
export function startPage() {
  // Last page's wrappers come off first, before anything else looks at a tile.
  // Unconditional, so a wrapper can never outlive the editor that laid it,
  // however the page was left — cleared, lost, or reloaded halfway through.
  for (const t of state.collection) delete t.wrapped;

  state.bag  = shuffle([...state.collection]);
  state.rack = [];
  state.word = [];
  state.discardPile = [];
  state.quota        = quotaFor(state.chapter, state.page);
  state.pageScore    = 0;
  state.wordsPrinted = 0;
  state.wordsLeft    = effectiveWordsPerPage();
  // The Deadline's editor takes the desk before anything is counted out —
  // rack size, discards and the wrapping below are theirs to bend.
  if (isDeadline(state.page)) assignBoss();
  else state.boss = null;
  // The Redactor wraps a share of the CASE, not of the hand: bag and collection
  // share templates, so a wrapped tile stays wrapped when it is discarded and
  // drawn again, and the condition lasts the whole page.
  const wraps = activeBoss(state)?.wraps;
  if (wraps) {
    const pool = shuffle([...state.collection]);
    for (let i = 0; i < Math.round(pool.length * wraps); i++) pool[i].wrapped = true;
  }
  state.discardsMax = activeBoss(state)?.noDiscards
    ? 0
    : DISCARDS_PER_PAGE + (owns('quartermaster') ? 1 : 0) + (state.upgradeCounts?.discard ?? 0);
  state.discards    = state.discardsMax;
  state.discardMode = false;
  state.sundryMode = -1;
  state.tubeOffer = null;
  // A fresh hand means fresh tile ids, so no remembered offer can still name
  // anything — clear them rather than leave dangling ids around.
  for (const s of state.sundries ?? []) s.offer = null;
  state.primed    = {};   // a page turn lets the furnace's heat out
  state.rackBonus = 0;    // and takes back any hand the Ragman widened
  rollGamble();
}

// ─── Tile operations ──────────────────────────────────────────────────────────

// Tiles that take up a place in the hand. Ghosts and aboveHand tiles ride
// beside it rather than in it, so drawing tops up around them; the Eeeditor's
// lent E's emphatically do not.
export const handCount = () =>
  [...state.rack, ...state.word].filter(t => t.material !== 'ghost' && !t.aboveHand).length;

// One tile off the bag — the end of it, hence the pop; a weighted reach if
// anyone at the table is watching the bag. The Magpie catches a gold trim, the
// Shortfin Mako crimson paint (rainbow metal reads as crimson here as it does
// everywhere), and their weights multiply on a tile that answers both. Every
// draw in the game comes through drawUpToRackSize, so the opening hand and
// every top-up run the same rule.
function drawFromBag() {
  const magpie = owns('magpie');
  const mako   = owns('mako');
  if (!magpie && !mako) return state.bag.pop();
  const weigh = t => (magpie && t.trim === 'gold' ? MAGPIE_WEIGHT : 1)
                   * (mako && countsAsColour(t, 'crimson') ? MAKO_WEIGHT : 1);
  const total = state.bag.reduce((n, t) => n + weigh(t), 0);
  let roll = Math.random() * total;
  for (let i = state.bag.length - 1; i >= 0; i--) {
    roll -= weigh(state.bag[i]);
    if (roll <= 0) return state.bag.splice(i, 1)[0];
  }
  return state.bag.pop();
}

// Returns the tiles drawn (so the caller can animate them in).
export function drawUpToRackSize() {
  const drawn = [];
  while (handCount() < effectiveRackSize() && state.bag.length) {
    const tile = templateToTile(drawFromBag());
    state.rack.push(tile);
    drawn.push(tile);
  }
  return drawn;
}

// Strike a new tile: it joins the collection for good and arrives in the rack
// straight away.
export function castTile(overrides = {}) {
  const { letter, ...rest } = overrides;
  const tmpl = adoptTemplate(makeTileTemplate(letter, rest));
  state.collection.push(tmpl);
  const tile = templateToTile(tmpl);
  state.rack.push(tile);
  return tile;
}

// What comes out of a wrapped tile: a random letter in the given material. A
// cursed one is never cast on a letter worth much — its ×Mult is the point, not
// its Points.
export function castMaterialTile(material) {
  const letters = Object.keys(BAG_COUNTS).filter(L =>
    material !== 'cursed' || (TILE_POINTS[L] ?? 99) <= CURSED_MAX_POINTS);
  return castTile({ letter: letters[Math.floor(Math.random() * letters.length)], material });
}

// The other thing a wrapper can hold: a mark in ordinary lead, under the trim
// it always comes wearing. Nothing else in the game hands one out (see MARKS).
export function castMarkTile() {
  return castTile({
    letter: MARKS[Math.floor(Math.random() * MARKS.length)],
    trim: MARK_TRIM,
  });
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
// every azure tile while The Fountain is seated, and nothing else. Read through
// countsAsColour, so a rainbow tile takes the road too. Scoring reads the same
// rule for its "↩ to bag" flag, so the promise the board makes while you
// compose is the one printing keeps. A lent tile never qualifies: the bag holds
// templates, and filing one would make a page's loan permanent.
export const returnsToBag = tile =>
  !tile.ephemeral && owns('fountain') && countsAsColour(tile, 'azure');

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

// Grow a tile's value for good: written to the live tile AND the collection
// template it was drawn from (the same write-through as painting), so it
// survives the page, the save and every reshuffle. Growth lands on the face the
// tile is showing — grow a dual as E and the T on its back learns nothing.
export function growTile(tile, n = 1) {
  if (isImmutable(tile)) return false;
  const field = tile.activeVariant === 1 ? 'altBonusPoints' : 'bonusPoints';
  tile[field] = (tile[field] ?? 0) + n;
  const tmpl = state.collection.find(c => c.tid === tile.tid);
  if (tmpl) tmpl[field] = (tmpl[field] ?? 0) + n;
  return tile[field];
}

// Paint a tile, writing through to the collection so the paint is permanent. A
// dual takes its coat whole, both faces. Every route to permanent paint goes
// through here, so none can drift apart and The Dabbler sees every brushstroke.
export function paintTile(tile, colour) {
  if (isImmutable(tile)) return false;
  tile.colour = colour;
  tile.wash = null;   // real paint replaces a wash outright
  const tmpl = state.collection.find(c => c.tid === tile.tid);
  if (tmpl) { tmpl.colour = colour; tmpl.wash = null; }
  dabblerSplash(tile, colour);
  return true;
}

// The Dabbler: any paint landing anywhere may splash a second unpainted tile of
// the collection the same colour. Guarded so a splash never splashes again.
// This runs too deep to speak, so splashes queue for main.js (and the Market
// sheet) to drain into the log via takePaintEchoes.
let paintEchoes = [];
let splashing = false;

export function takePaintEchoes() {
  const out = paintEchoes;
  paintEchoes = [];
  return out;
}

function dabblerSplash(painted, colour) {
  if (splashing || !owns('dabbler') || !luckyRoll(DABBLER_ODDS)) return;
  const bare = unpaintedTiles().filter(t => t.tid !== painted.tid && !isImmutable(t));
  if (!bare.length) return;
  const extra = bare[Math.floor(Math.random() * bare.length)];
  splashing = true;
  paintTile(extra, colour);   // the same road as every other coat
  splashing = false;
  // The template is painted for good; any live copy on the board this page
  // wears it immediately too, so the splash is seen where it landed.
  for (const t of [...state.rack, ...state.word, ...state.discardPile]) {
    if (t.tid === extra.tid) t.colour = colour;
  }
  paintEchoes.push({ letter: getActiveLetter(extra), colour });
}

// ─── The ink wash (the toolbox's azure tool) ──────────────────────────────────
// A faint coat, one tile per colour, on random unpainted tiles in the hand. It
// counts as its colour everywhere paint does (getActiveColour reads it), but it
// is not paint: it never goes through paintTile, so the Dabbler never splashes
// off it. Written through to the template like paint, so a washed tile is still
// washed when the bag deals it again — printing is the only thing that spends
// the ink.
export function applyWash() {
  const candidates = [...state.rack, ...state.word]
    .filter(t => !t.colour && !t.wash && !isImmutable(t));
  const picks = shuffle(candidates).slice(0, WASH_COUNT);
  const colours = shuffle(Object.keys(COLOURS)).slice(0, picks.length);
  return picks.map((tile, i) => {
    tile.wash = colours[i];
    const tmpl = state.collection.find(c => c.tid === tile.tid);
    if (tmpl) tmpl.wash = colours[i];
    return { tile, colour: colours[i] };
  });
}

// Called from main.js on the printed tiles before they retire, so The Fountain
// sees them bare: an azure wash buys the multiplier, not the trip to the bag.
export function washOff(tiles) {
  let rinsed = 0;
  for (const t of tiles) {
    if (!t.wash) continue;
    t.wash = null;
    const tmpl = state.collection.find(c => c.tid === t.tid);
    if (tmpl) tmpl.wash = null;
    rinsed++;
  }
  return rinsed;
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

// The Twins' recasting, laid in for good. A `mould` is the whole of what one
// tile hands another (MOULD in js/scoring.js): letter and faces, paint, trim,
// nick, metal and grown Points. It OVERWRITES — a clone is a clone, so the
// second tile of a pair can come out of this worse than it went in, and which
// tile is the mould is decided by which one you set first. The groove brackets
// every pair it reads so that choice is made with both tiles in front of you.
//
// Written through to the collection template like every other permanent change,
// so it outlives the page, the save and every reshuffle. Paint still goes out
// through paintTile where a NEW colour lands, so the one route holds and The
// Dabbler hears the brushstroke; everything else is written here, because no
// other seat in the game overwrites and the helpers all refuse to.
//
// Returns a short list of what changed, for the seat to read out, or null.
export function recastTile(tile, mould) {
  if (!tile || !mould || isImmutable(tile)) return null;
  const was = { colour: tile.colour, trim: tile.trim, nick: tile.nick,
                material: tile.material, growth: getActiveGrowth(tile) };

  if (mould.colour && mould.colour !== tile.colour) paintTile(tile, mould.colour);
  else if (!mould.colour) tile.colour = null;

  for (const k of ['letter', 'altLetter', 'letterType', 'activeVariant',
                   'trim', 'nick', 'material', 'bonusPoints', 'altBonusPoints']) {
    tile[k] = mould[k] ?? (k === 'activeVariant' || k.endsWith('Points') ? 0 : null);
  }
  tile.basePoints = TILE_POINTS[getActiveLetter(tile)] ?? tile.basePoints ?? 1;

  const tmpl = state.collection.find(c => c.tid === tile.tid);
  if (tmpl) {
    for (const k of ['letter', 'altLetter', 'letterType', 'activeVariant', 'colour',
                     'trim', 'nick', 'material', 'bonusPoints', 'altBonusPoints']) {
      tmpl[k] = tile[k];
    }
    tmpl.wash = tile.wash ?? null;
  }

  const said = [];
  if (tile.colour !== was.colour) {
    said.push(tile.colour ? COLOURS[tile.colour].label.toLowerCase() : 'the paint off it');
  }
  if (tile.trim !== was.trim) {
    said.push(tile.trim ? `a ${TRIMS[tile.trim].label.toLowerCase()} trim` : 'its trim off');
  }
  if (tile.nick !== was.nick) said.push(tile.nick ? NICKS[tile.nick].label.toLowerCase() : 'its nick filled');
  if (tile.material !== was.material && tile.material) said.push(MATERIALS[tile.material].label.toLowerCase());
  const grew = getActiveGrowth(tile) - was.growth;
  if (grew) said.push(`${grew > 0 ? '+' : ''}${grew} Points`);
  return said.length ? said : null;
}

// Remove a tile from the collection for good. Honours the Smelter's floor, so
// nothing can eat the press out of house and home; returns the removed
// template, or null if the floor held. Live copies (rack / word / discard pile)
// are the caller's to clean up.
//
// Every route to permanent destruction comes through here, which is what lets
// The Composter count them all. The rot is banked as a number and turned into
// tiles when the Market opens (see rotCompost in js/market.js).
export function trashFromCollection(tid) {
  if (state.collection.length <= SMELT_MIN_COLLECTION) return null;
  const i = state.collection.findIndex(c => c.tid === tid);
  if (i < 0) return null;
  const [removed] = state.collection.splice(i, 1);
  if (owns('composter')) state.compostPending = (state.compostPending ?? 0) + 1;
  revenantRaises(removed);
  return removed;
}

// The Revenant stands at every graveside: because every road to destruction
// runs through trashFromCollection above, he is present at all of them from
// this one place — exactly as The Dabbler sits inside paintTile.
//
// What comes back is the WHOLE tile — paint, trim, nick, grown Points, both
// faces of a dual — with only the metal overwritten to ghost, which is
// immutable (isImmutable), so what it came back as is what it stays. The wash
// and the wrapper are left behind: both belong to the page, not to the type.
// No cap on how many are raised; ghost tiles take no room in the hand.
//
// `raising` guards against raising the dead twice: a ghost can be destroyed
// again later, and the rite would otherwise run inside its own casting.
let ghostEchoes = [];
let raising = false;

export function takeGhostEchoes() {
  const out = ghostEchoes;
  ghostEchoes = [];
  return out;
}

function revenantRaises(template) {
  if (raising || !owns('revenant') || !luckyRoll(REVENANT_ODDS)) return;
  if (!template.letter) return;
  raising = true;
  const { wash, wrapped, ephemeral, tid, ...kept } = template;
  // Between pages there is no hand to arrive in — the bag is dealt from the
  // collection at the page turn, so a tile raised at the Market's furnace is
  // waiting in the case when the next page begins.
  const tmpl = adoptTemplate({ ...kept, material: 'ghost' });
  state.collection.push(tmpl);
  if (!state.inMarket && !state.inDraft && !state.inColophon) {
    state.rack.push(templateToTile(tmpl));
  }
  raising = false;
  ghostEchoes.push({ letter: getActiveLetter(tmpl) });
}


// Melt two tiles into one two-faced sort (The Typefounder): the left tile takes
// the right's letter as its second face, and the right is destroyed. Finery the
// two share is kept from the left; grown points stay with their own letter (see
// getActiveGrowth). Only plain, single-letter, mutable tiles take the crucible.
// The destruction goes through trashFromCollection, so it respects the
// Smelter's floor and feeds the Composter like every other route out.
export function mergeTiles(left, right) {
  const plain = t => t.letter.length === 1 && !isMark(t.letter) && t.letter !== FLEURON
                  && t.letterType !== 'dual' && !isImmutable(t);
  if (!plain(left) || !plain(right)) return false;
  if (!trashFromCollection(right.tid)) return false;   // the floor held
  const merged = {
    letterType:    'dual',
    altLetter:     right.letter,
    activeVariant: 0,
    colour:        left.colour   ?? right.colour,
    trim:          left.trim     ?? right.trim,
    nick:          left.nick     ?? right.nick,
    material:      left.material ?? right.material,
    bonusPoints:    left.bonusPoints  ?? 0,
    altBonusPoints: right.bonusPoints ?? 0,
  };
  Object.assign(left, merged);
  const tmpl = state.collection.find(c => c.tid === left.tid);
  if (tmpl) Object.assign(tmpl, merged);
  return true;
}

// ─── The manuscript ───────────────────────────────────────────────────────────

export function recordWord(word, score) {
  state.manuscript ??= [];
  state.manuscript.push({ word, score, chapter: state.chapter, page: state.page });
}

// ─── The Gambler's coin ───────────────────────────────────────────────────────
// Tossed once per word, never inside the score effect: scoring re-runs on every
// letter laid down to power the live preview, so a roll in there would flicker
// as you compose and then disagree with what printed. Held in state, so the
// coin is settled before you set the word. Re-tossed as each page opens and
// after every word prints.
export function rollGamble() {
  state.gambleWon = luckyRoll(GAMBLER_ODDS);
}

// ─── Selection ────────────────────────────────────────────────────────────────

// Returns 'on' | 'off' | 'cursed' | 'lent' | 'none', so a refused pick can be
// explained. A cursed tile leaves the rack only by printing; a lent one would
// only be handed back again, so a discard spent on it buys nothing.
export function toggleSelected(id) {
  const tile = state.rack.find(t => t.id === id);
  if (!tile) return 'none';
  if (!tile.selected && tile.material === 'cursed') return 'cursed';
  if (!tile.selected && tile.ephemeral) return 'lent';
  tile.selected = !tile.selected;
  return tile.selected ? 'on' : 'off';
}

export function clearAllSelected() {
  state.rack.forEach(t => { t.selected = false; });
  state.word.forEach(t => { t.selected = false; });
}

export const selectedCount = () => state.rack.filter(t => t.selected).length;

// ─── Sundries (the workbench) ─────────────────────────────────────────────────

// Throw one off the bench, wherever you are standing. Nothing is paid for it:
// this is a bin, not a buyer (the Market still buys back, see sellSundry). The
// armed tool is put down first, and anything armed BEHIND the gap slides down
// with it, so state.sundryMode can never end up pointing at the wrong tool.
// Returns the discarded sundry, or null if the slot was empty.
export function discardSundry(idx) {
  const s = state.sundries[idx];
  if (!s) return null;
  state.sundries.splice(idx, 1);
  if (state.sundryMode === idx) {
    state.sundryMode = -1;
    state.tubeOffer = null;
    clearAllSelected();
  } else if (state.sundryMode > idx) {
    state.sundryMode -= 1;
  }
  return s;
}

export const sundrySelected = () =>
  [...state.word, ...state.rack].filter(t => t.selected);

// While a tube is armed, board taps select its targets — rack and word alike.
// Returns 'on' | 'off' | 'full' so the caller can explain a refused pick.
export function toggleSundrySelect(id) {
  const tile = state.rack.find(t => t.id === id) ?? state.word.find(t => t.id === id);
  if (!tile) return 'off';
  if (tile.selected) { tile.selected = false; return 'off'; }
  if (isImmutable(tile)) return 'immutable';
  // The ratchet only has purchase on a single letter — refused at the point of
  // picking rather than after the choice is made.
  if (state.sundries[state.sundryMode]?.kind === 'ratchet' && !shiftable(tile)) return 'unshiftable';
  // An armed tube — or an applicator, which shares its whole gesture — takes
  // only the tiles it laid out.
  if (['tube', 'applicator'].includes(state.sundries[state.sundryMode]?.kind)
      && !(state.tubeOffer ?? []).includes(tile.id)) return 'unoffered';
  // The loupe magnifies nothing past its own limit — refused when the tile is
  // picked, not after.
  if (state.sundries[state.sundryMode]?.kind === 'loupe'
      && restingPoints(tile) >= LOUPE_CAP) return 'capped';
  if (sundrySelected().length >= 1) return 'full';   // every armed tool takes one target
  tile.selected = true;
  return 'on';
}

// ─── The ratchet's alphabet ───────────────────────────────────────────────────
// The ring a letter steps around, taken from the game's own sorts rather than
// A-Z: the press carries no lone Q (only the QU sort), so Q simply isn't a
// place a letter can land — P steps up to R, and R back down to P. It wraps, so
// A steps down to Z.
const SHIFT_RING = Object.keys(TILE_POINTS)
  .filter(l => /^[A-Z]$/.test(l))   // letters only — no marks, and no fleuron
  .sort();

export const shiftable = tile =>
  !!tile && !isImmutable(tile) && SHIFT_RING.includes(getActiveLetter(tile));

// Step the showing face one place along the ring, written through to the
// collection template — the new letter is permanent, and re-prices the tile.
export function shiftTile(tile, dir) {
  if (!shiftable(tile)) return false;
  const i = SHIFT_RING.indexOf(getActiveLetter(tile));
  const next = SHIFT_RING[(i + dir + SHIFT_RING.length) % SHIFT_RING.length];
  const altFace = tile.letterType === 'dual' && tile.activeVariant === 1;
  if (altFace) tile.altLetter = next; else tile.letter = next;
  tile.basePoints = TILE_POINTS[next] ?? 1;
  const tmpl = state.collection.find(c => c.tid === tile.tid);
  if (tmpl) {
    if (altFace) tmpl.altLetter = next; else tmpl.letter = next;
  }
  return true;
}

// Spend the armed sundry on the selected tiles. Changes to the showing face are
// written through to the collection template, so paint and letter alike outlive
// the page. `dir` is the ratchet's direction (+1 later in the alphabet, -1
// earlier) and is ignored by every other kind.
export function applySundry(idx, dir = 0) {
  const sundry = state.sundries[idx];
  if (!sundry) return null;

  if (sundry.kind === 'ratchet') {
    const tile = sundrySelected().filter(t => !isImmutable(t))[0];
    if (!tile) return null;
    const from = getActiveLetter(tile);
    if (!shiftTile(tile, dir)) return null;
    tile.selected = false;
    state.sundries.splice(idx, 1);
    state.sundryMode = -1;
    return { kind: 'ratchet', from, to: getActiveLetter(tile), ids: [tile.id] };
  }

  // The loupe doubles what the corner number says — face, growth and silver
  // trim together — capped at LOUPE_CAP and written in as permanent growth.
  if (sundry.kind === 'loupe') {
    const tile = sundrySelected().filter(t => !isImmutable(t))[0];
    if (!tile) return null;
    const from = restingPoints(tile);
    const delta = Math.min(LOUPE_CAP, from * 2) - from;
    if (delta <= 0 || !growTile(tile, delta)) return null;
    tile.selected = false;
    state.sundries.splice(idx, 1);
    state.sundryMode = -1;
    return { kind: 'loupe', from, to: from + delta, letters: [getActiveLetter(tile)], ids: [tile.id] };
  }

  // The tongs feed a tile to the furnace: gone for good (through
  // trashFromCollection, so the Composter is fed and the Smelter's floor holds).
  // Grips stack; the bonus is read by computeScore and cleared when a word
  // commits or a page turns.
  if (sundry.kind === 'tongs') {
    const tile = sundrySelected().filter(t => !isImmutable(t))[0];
    if (!tile) return null;
    if (!trashFromCollection(tile.tid)) return null;
    state.rack = state.rack.filter(t => t.id !== tile.id);
    state.word = state.word.filter(t => t.id !== tile.id);
    const bonus = primePoints('tongs', TONGS_BONUS);
    state.sundries.splice(idx, 1);
    state.sundryMode = -1;
    return { kind: 'tongs', letters: [getActiveLetter(tile)], ids: [tile.id], bonus };
  }

  // An applicator strikes its tile into a new metal, written through to the
  // collection so the change outlives the page.
  if (sundry.kind === 'applicator') {
    const target = sundrySelected().find(t => (state.tubeOffer ?? []).includes(t.id));
    if (!target || target.material || isImmutable(target)) return null;
    target.material = sundry.material;
    const tmpl = state.collection.find(c => c.tid === target.tid);
    if (tmpl) tmpl.material = sundry.material;
    target.selected = false;
    state.sundries.splice(idx, 1);
    state.sundryMode = -1;
    state.tubeOffer = null;
    return {
      kind: 'applicator', material: sundry.material,
      letters: [getActiveLetter(target)], ids: [target.id],
    };
  }

  // The tube pours onto whichever of its offered tiles was picked. The offer
  // itself was rolled when the tube was armed — see rollTubeOffer.
  const tile = sundrySelected().find(t => (state.tubeOffer ?? []).includes(t.id));
  if (!tile) return null;
  paintTile(tile, sundry.colour);
  tile.selected = false;
  state.sundries.splice(idx, 1);
  state.sundryMode = -1;
  state.tubeOffer = null;
  return { kind: 'tube', colour: sundry.colour, letters: [getActiveLetter(tile)], ids: [tile.id] };
}

// What a given tool will consider. The tube wants a tile with no paint; an
// applicator wants one with no metal — a sort is cast in one material and not
// two, the same rule that stops trims stacking. Both refuse the immutable.
export const offerFilter = sundry =>
  (sundry?.kind === 'applicator'
    ? t => !t.material && !isImmutable(t)
    : t => !t.colour && !isImmutable(t));

export function rollTubeOffer(sundry = null) {
  const takesPaint = offerFilter(sundry);
  const inHand = [...state.rack, ...state.word];
  const byId = new Map(inHand.map(t => [t.id, t]));

  // THE OFFER BELONGS TO THE TUBE, NOT TO THE GESTURE. It is remembered on the
  // sundry itself, so putting the tube down and picking it up again lays out the
  // SAME two tiles — otherwise a player could keep backing out until the offer
  // named the tile they wanted, which is the one thing it exists to prevent.
  // Tiles that have since left the hand or taken paint drop out; only when none
  // survive does the tube lay out a fresh offer.
  const kept = (sundry?.offer ?? []).filter(id => byId.has(id) && takesPaint(byId.get(id)));
  if (kept.length) {
    state.tubeOffer = kept;
    if (sundry) sundry.offer = kept.slice();
    return kept;
  }

  const candidates = inHand.filter(takesPaint);
  if (!candidates.length) {
    state.tubeOffer = null;
    if (sundry) sundry.offer = null;
    return null;
  }
  state.tubeOffer = shuffle(candidates.slice()).slice(0, 2).map(t => t.id);
  if (sundry) sundry.offer = state.tubeOffer.slice();
  return state.tubeOffer;
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

// A patron out of nowhere, for nothing: The Paramour's love potion. Rarity is
// ignored on purpose. Nothing already held is offered, nor the cat, who is
// found rather than given. Returns the new seat, or null when the table is full
// or the roster exhausted; the caller says so.
// `rarity` narrows the draw — the love potion asks for a rare one and nothing
// else. Returns null when no seat is free or nothing in the pool qualifies, and
// the caller says so rather than silently pocketing the gift.
// Arm Points against the NEXT word printed, credited to whoever armed them so
// the readout can name them and a patron's own card can badge them. Stacks:
// two discards before a word pay twice.
export function primePoints(source, n) {
  state.primed ??= {};
  state.primed[source] = (state.primed[source] ?? 0) + n;
  return state.primed[source];
}

export function grantRandomPatron(defs, rarity = null) {
  if (state.patrons.length >= effectivePatronSlots()) return null;
  const held = new Set(allSeats().map(p => p.id));
  const pool = defs.filter(d => !d.unlisted && (d.stackable || !held.has(d.id))
                             && (!rarity || d.rarity === rarity));
  if (!pool.length) return null;
  const def = pool[Math.floor(Math.random() * pool.length)];
  const seat = { id: def.id, uid: nextId(), data: def.onOffer?.() ?? {} };
  state.patrons.push(seat);
  return seat;
}

// ─── Painting ─────────────────────────────────────────────────────────────────

// Every unpainted tile in the collection. A dual counts once, not twice: its
// two letters share one coat.
export const unpaintedTiles = () => state.collection.filter(t => !t.colour);

// Paint `count` random unpainted tiles. Returns the letters painted.
export function paintRandomTiles(colour, count) {
  return shuffle(unpaintedTiles()).slice(0, count).map(tile => {
    tile.colour = colour;
    tile.wash = null;   // the dye is real paint — a wash under it is spent
    return getActiveLetter(tile);
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

// Seats change places. Seat order is the roster's rule of precedence — hooks
// fire down the shelf and a tile one patron consumes is out of every later
// seat's reach (see runDiscardHooks in main.js) — so dragging a card decides
// which of two hungry patrons gets first refusal on a discarded pair.
//
// `ref` is a seat uid or a def id, the same currency sellPatron takes. The index
// counts seats, empty ones included, so a card dropped past the end goes last.
export function reorderPatrons(ref, insertIdx) {
  const i = state.patrons.findIndex(p => String(p.uid) === String(ref) || p.id === ref);
  if (i < 0) return false;
  const to = Math.max(0, Math.min(insertIdx, state.patrons.length));
  const at = to > i ? to - 1 : to;
  if (at === i) return false;
  const [seat] = state.patrons.splice(i, 1);
  state.patrons.splice(at, 0, seat);
  return true;
}
