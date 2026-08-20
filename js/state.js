import {
  RACK_SIZE, WORDS_PER_PAGE, DISCARDS_PER_PAGE, STARTING_COINS,
  PATRON_SLOTS, SUNDRY_SLOTS, SMELT_MIN_COLLECTION,
  BAG_COUNTS, TILE_POINTS, DABBLER_ODDS, CURSED_MAX_POINTS, isImmutable, isMark,
  MARKS, MARK_TRIM, SILVER_BONUS, FLEURON, LOUPE_CAP, TONGS_BONUS, WASH_COUNT,
  COLOURS,
  quotaFor, makeTileTemplate, GAMBLER_ODDS, isDeadline,
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

// Wrapped in manuscript by The Redactor (js/bosses.js): the tile is under
// paper for the page, with a pencilled letter on the wrapper. It still spells
// — that is the whole of what it still does — and everything else about it is
// hidden rather than destroyed: the paint, trim, metal, nick and grown Points
// are all sitting underneath, waiting for the page to end.
//
// The readers just below are where that promise is kept, so nothing else in
// the game had to learn the word "wrapped": ask what colour a wrapped tile is
// and it has none, what it is worth and it is worth nothing. Scoring strips
// the few things that are read off the tile directly rather than through
// these (trim, nick, metal, face value) — see computeScore's pass 0.
export const isWrapped = tile => !!tile?.wrapped;

// The paint a tile is wearing. Paint belongs to the tile, not to either face,
// so this is the same whichever letter a dual is showing — kept as a function
// because everything that scores paint calls it, which is exactly what lets
// the ink wash slot in here: a washed tile counts as its wash colour to
// patrons AND multipliers alike, deliberately unlike rainbow metal (which
// speaks only through countsAsColour and never lifts a multiplier unpainted).
// Real paint sits over a wash and wins; the wash comes off when the tile
// prints (washOff, called at commit in main.js).
export const getActiveColour = tile =>
  (isWrapped(tile) ? null : tile.colour ?? tile.wash ?? null);

// What a tile is worth before the word it sits in touches it: its letter's face
// value, any growth set permanently into it, and a silver trim. All three
// belong to the tile rather than to the word, so this is the number it wears
// wherever it appears — rack, shop, collection, groove. A nick's reach and a
// Monogrammist's echo are the word's business and scoring adds those on top,
// which is what leaves the corner number free to be honest at rest.
// Growth follows the face, the way a letter's own Points do — unlike paint,
// trim and nick, which belong to the whole tile. Each face of a dual keeps
// its own grown points: `bonusPoints` for the first letter, `altBonusPoints`
// for the second, and flipping the tile flips which one counts. The
// Typefounder's melt is why: each side brings its own history to the
// crucible, and playing the T face shouldn't pay for what the E earned.
export const getActiveGrowth = tile =>
  (isWrapped(tile) ? 0 : (tile.activeVariant === 1 ? tile.altBonusPoints : tile.bonusPoints) ?? 0);

export const restingPoints = tile =>
  (isWrapped(tile) ? 0
    : (TILE_POINTS[getActiveLetter(tile)] ?? tile.basePoints ?? 1)
      + getActiveGrowth(tile)
      + (tile.trim === 'silver' ? SILVER_BONUS : 0));

// Whether a tile reads as a given colour to anything that cares *which* colour
// it is — every patron, and the Fountain's return-to-bag. A rainbow tile reads
// as all four at once. This is deliberately NOT what the colour multipliers
// use: those count actual paint (getActiveColour), so a rainbow tile lifts a
// multiplier only where it has been painted, and can't be four at once there.
// A wrapped tile is caught here as well as in getActiveColour, because rainbow
// metal speaks through this reader alone: under the wrapper the metal is as
// hidden as the paint.
export const countsAsColour = (tile, colour) =>
  !isWrapped(tile) && (tile.material === 'rainbow' || getActiveColour(tile) === colour);

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
// rackBonus is the one term here that is neither permanent nor the editor's:
// a hand widened for the rest of a page only, cleared at the page turn the
// way the tongs' heat is.
export const effectiveRackSize    = () => RACK_SIZE    + (state.upgradeCounts?.handSize     ?? 0)
                                                       + (activeBoss(state)?.rackBonus      ?? 0)
                                                       + (state.rackBonus                   ?? 0);
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

// ─── The Editors (Deadline bosses) ────────────────────────────────────────────
// One takes the desk as each Deadline page is dealt — never announced sooner,
// which is the point: the rule is a puzzle for the rack in front of you, not
// something to build against. Drawn without repeats until the roster runs
// out, then the roster refreshes. The pick is stored in state, so a reload
// never swaps the editor under you.

function assignBoss() {
  state.bossesSeen ??= [];
  // An editor that inverts a seated patron never takes the desk (see
  // BOSS_CONFLICTS in bosses.js): a Deadline is a puzzle, not a tax on what you
  // bought. The shelf is read HERE, as the page is dealt, which is the moment
  // it is settled — patrons are hired at the Market between pages, so what is
  // seated now is what you will face the editor with.
  const seated = state.patrons.map(p => p.id);
  const allowed = BOSS_DEFS.filter(b => !bossConflicts(b.id, seated));
  // A shelf that somehow rules out every editor still gets one: an unfair
  // Deadline beats a Deadline with nobody at the desk, and the whole page's
  // structure (rack size, discards, the bar) assumes an editor is there.
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

// A tile an editor lends you: real in every way that matters this page, but
// cast from no template. It takes no permanent change (isImmutable covers it —
// there is no collection tile behind it to write to), and since every new page
// rebuilds the bag from the collection, it simply isn't there tomorrow.
//
// Two editors lend, and they differ in the one way that matters to the hand.
// The Enthusiast's gift rides ABOVE your hand size, a bonus tile beside the
// rack. The Eeeditor's three E's do not: they sit IN the hand and take three
// of its places, which is the whole of that editor — a gift and a cage in one.
//
// The Scientist lends too, and his loan arrives dressed: `overrides` reaches
// makeTileTemplate, so a lent tile can be born wearing a trim it could never
// be given later (isImmutable bars writing to a tile with no template behind
// it, but says nothing about what it was cast with). `lender` names who is
// lending, so the tile can explain itself as theirs.
export function castLentTile(letter, { aboveHand = false, lender = null, ...overrides } = {}) {
  const tile = templateToTile(makeTileTemplate(letter, overrides));
  tile.ephemeral = true;
  if (aboveHand) tile.aboveHand = true;
  if (lender) tile.lender = lender;
  state.rack.push(tile);
  return tile;
}

// The Eeeditor's E's, wherever they currently sit. Counted across rack and
// word alike: one laid into a word has not left your hand yet, and must not
// be replaced until it actually prints.
export const lentInHand = () =>
  [...state.rack, ...state.word].filter(t => t.ephemeral && !t.aboveHand);

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

// Shape changes an older save has to be walked forward through. Both of these
// can be hiding anywhere — the collection, the rack, the discard pile, the
// shop's offers and the workbench inside the market snapshot, the draft, the
// compost heap — so the whole save is walked rather than each list found by
// hand, which is cheaper to write and can't miss one.
//
//   altColour  Paint used to belong to a face; it belongs to the tile now, so
//              a second coat folds into the first. A tile painted on both keeps
//              the front one — the alternative is asking the player which half
//              of a tile they meant.
//   ingot      A sundry that named its metal at the shop. It is a wrapped tile
//              now, and what is inside is rolled when the paper comes off, so
//              the stored material is simply dropped.
//   minimalist The three-letter-word patron, renamed to the Abecedarian. Seats
//              and shop offers both store a patron by id, so an id left behind
//              would resolve to nothing and the seat would render blank.
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

// One-time repair for saves written while the mercury trim existed. The trim is
// gone (its rule is The Fountain's now), so a tile still wearing one would look
// itself up in a table that no longer has the row — which throws wherever a
// trim is described. Cobalt costs the same 3 Coins and is the nearest thing to
// a straight swap, so those tiles are re-trimmed rather than stripped bare.
// The whole save is walked because a trim can be on a collection template, on a
// tile in the hand or the pile, or on a tile still sitting unbought on a Market
// or draft sheet. Returns how many were repaired, so the board can say so.
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
    // The run's record of printed words was `ledger` before it was bound into
    // chapters and became the manuscript. Same rows, same order, new name.
    // Tested on emptiness rather than `??=`: state.manuscript defaults to [],
    // which is not nullish, so a coalescing assign would silently keep the
    // empty default and throw an old save's words away.
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
    if (savedId)  _nextId  = savedId;
    if (savedTid) _nextTid = savedTid;
    // Seats saved before uids existed get one now — after the counters above,
    // so a backfilled uid can never collide with a tile id already in the save.
    state.patrons?.forEach(p => { p.uid ??= nextId(); });
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
    coins: STARTING_COINS, patrons: [], sundries: [], upgradeCounts: {},
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
  // Last page's manuscript comes off first, before anything else looks at a
  // tile. Unconditional: clearing here rather than when the Deadline ends is
  // what guarantees a wrapper can never outlive the editor that laid it, however
  // the page was left — cleared, lost, or reloaded halfway through.
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
  // The Redactor wraps a share of the CASE, not of the hand: the bag holds the
  // very templates the collection does, so a wrapped tile stays wrapped when it
  // is discarded and drawn again, and the condition lasts the page instead of
  // washing out with the first refill.
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
  // A fresh hand means fresh tile ids, so no tube's remembered offer can
  // still name anything — clear them rather than leave dangling ids around.
  for (const s of state.sundries ?? []) s.offer = null;
  state.tongsBonus = 0;   // a page turn lets the furnace's heat out
  state.rackBonus  = 0;   // and takes back any hand the Ragman widened
  rollGamble();
}

// ─── Tile operations ──────────────────────────────────────────────────────────

// Tiles that take up a place in the hand. A ghost holds none — it rides along
// beside the hand rather than in it, so drawing tops up around it. The
// Enthusiast's gift rides the same way. The Eeeditor's E's emphatically do
// not: they are lent, but they are *in* the hand, and the seven places they
// leave you are the point of that editor.
const handCount = () =>
  [...state.rack, ...state.word].filter(t => t.material !== 'ghost' && !t.aboveHand).length;

// The Magpie can't help herself: she goes through the bag for the bright ones.
// Every tile in it is weighed for the draw, and a gold trim weighs twice what
// anything else does — so gold comes up about twice as often as its share of
// the bag, and the more of your collection you gild the more of it she finds.
// She promises nothing (a hand can still come up dull) and conjures nothing:
// the bag holds exactly what it held, only the reaching-in is crooked.
const MAGPIE_WEIGHT = 2;
const magpieWeight = t => (t.trim === 'gold' ? MAGPIE_WEIGHT : 1);

// One tile off the bag. Ordinarily the top of it (the bag is drawn from the
// end, hence the pop); with the Magpie seated, a weighted reach instead.
// Every draw in the game comes through drawUpToRackSize, so the opening hand,
// a top-up after discards and a top-up after printing all run the same rule.
function drawFromBag() {
  if (!owns('magpie')) return state.bag.pop();
  const total = state.bag.reduce((n, t) => n + magpieWeight(t), 0);
  let roll = Math.random() * total;
  for (let i = state.bag.length - 1; i >= 0; i--) {
    roll -= magpieWeight(state.bag[i]);
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
// straight away, so whatever paid for it pays off on the page you spend it.
export function castTile(overrides = {}) {
  const { letter, ...rest } = overrides;
  const tmpl = adoptTemplate(makeTileTemplate(letter, rest));
  state.collection.push(tmpl);
  const tile = templateToTile(tmpl);
  state.rack.push(tile);
  return tile;
}

// What comes out of a wrapped tile: a random letter in the given material. A
// cursed one is never cast on a letter worth much — its ×Mult is the point,
// not its Points, and a cursed QU would be a punishment rather than a gamble.
export function castMaterialTile(material) {
  const letters = Object.keys(BAG_COUNTS).filter(L =>
    material !== 'cursed' || (TILE_POINTS[L] ?? 99) <= CURSED_MAX_POINTS);
  return castTile({ letter: letters[Math.floor(Math.random() * letters.length)], material });
}

// The other thing a wrapper can hold: a mark, in ordinary lead, under the trim
// it always comes wearing. A bare mark is worth a point and spells nothing, so
// it would be a poor thing to unwrap; the purple is what makes the slot worth
// giving up. Nothing else in the game hands one out (see MARKS).
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
// every azure tile while The Fountain is seated, and nothing else. (The mercury
// trim did this for a single tile and was retired; the rule was always better
// as a colour's than as a trim's.) Read through countsAsColour, so a rainbow
// tile takes the road too — one of the few places rainbow metal pays off
// without being painted at all.
// Scoring reads the same rule for its "↩ to bag" flag, so the promise the
// board makes while you compose is the one printing keeps.
// A lent tile can never take this road whatever else is true of it: the bag
// holds templates, and filing one there would turn a tile you were lent for a
// page into a tile you own for the rest of the run.
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

// Grow a tile's value for good: the bonus is written to the live tile AND the
// collection template it was drawn from (same write-through as painting), so
// it survives the page, the save, and every reshuffle. Growth lands on the
// face the tile is showing — grow a dual as E and the T on its back learns
// nothing — and the corner number renders jade while a grown face is up.
export function growTile(tile, n = 1) {
  if (isImmutable(tile)) return false;
  const field = tile.activeVariant === 1 ? 'altBonusPoints' : 'bonusPoints';
  tile[field] = (tile[field] ?? 0) + n;
  const tmpl = state.collection.find(c => c.tid === tile.tid);
  if (tmpl) tmpl[field] = (tmpl[field] ?? 0) + n;
  return tile[field];
}

// Paint a tile, writing through to the collection so the paint is permanent.
// A dual tile takes its coat whole — both letters, whichever face was showing
// when the brush landed. Every route to permanent paint goes through here —
// tubes, the Painter, patrons — so none of them can drift apart, and so The
// Dabbler sees every brushstroke there is.
export function paintTile(tile, colour) {
  if (isImmutable(tile)) return false;
  tile.colour = colour;
  tile.wash = null;   // real paint replaces a wash outright
  const tmpl = state.collection.find(c => c.tid === tile.tid);
  if (tmpl) { tmpl.colour = colour; tmpl.wash = null; }
  dabblerSplash(tile, colour);
  return true;
}

// The Dabbler can't resist a wet brush: any paint landing anywhere has a
// chance of splashing a second unpainted tile of the collection the same
// colour. Guarded so a splash never splashes again — one echo per
// brushstroke, however lucky the day. This runs too deep to speak, so the
// splashes queue up for main.js (and the Market sheet) to drain into the
// log via takePaintEchoes.
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
// A faint coat, one tile per colour, laid on random unpainted tiles in the
// hand. It counts as its colour everywhere paint does (getActiveColour reads
// it), but it is not paint: it never goes through paintTile, so the Dabbler
// never splashes off it, and it comes off the moment the tile prints. Written
// through to the collection template like paint, so a washed tile discarded
// today is still washed when the bag deals it again — the ink is spent by
// printing and nothing else.
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

// The wash pays its way at scoring and comes off as the word commits — called
// from main.js on the printed tiles, before they retire, so The Fountain sees
// them bare (an azure wash buys the multiplier, not the trip back to the bag).
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

// Melt two tiles into one two-faced sort (The Typefounder): the left tile
// takes the right's letter as its second face, and the right is destroyed.
// Where both carry the same finery — paint, trim, nick, material — the left
// tile's survives the melt; where only one does, it is kept whichever side it
// came from. Grown points stay with their letter: each face brings its own
// growth to the crucible and keeps it (see getActiveGrowth). Only plain
// single-letter tiles will take the crucible: no duals (a tile has at most
// two faces), no ligatures or marks (not single letters — same bar the
// Punchcutter sets), and nothing immutable. The destruction goes through
// trashFromCollection, so it respects the Smelter's floor and feeds the
// Composter like every other route out.
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
// letter you lay down to power the live preview, so a roll in there would
// flicker as you compose and then disagree with what actually printed. Holding
// the result in state keeps the promise the shelf makes — and means the coin is
// settled before you set the word, so you can see whether to spend a good hand
// on it. It is re-tossed as each page opens and after every word prints.
export function rollGamble() {
  state.gambleWon = luckyRoll(GAMBLER_ODDS);
}

// ─── Selection ────────────────────────────────────────────────────────────────

// Returns 'on' | 'off' | 'cursed' | 'lent' | 'none', so a refused pick can be
// explained. A cursed tile can't be thrown away; the only way out of the rack
// is to print it. A lent tile can't either, for a happier reason: the editor
// would only hand you another exactly like it, so a discard spent on one would
// buy nothing at all.
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

// Throw one off the bench, wherever you are standing. A tool you will never
// spend is worth less than the slot it sits in, and the only way out used to
// be the Market's Coin — so a bench full of ratchets could lock you out of the
// wrapped tile you actually wanted until the next shop. Nothing is paid for it
// here: this is a bin, not a buyer (the Market still buys back, see
// sellSundry). The armed tool is put down first, and anything armed BEHIND the
// gap slides down with it, so state.sundryMode can never end up pointing at
// the wrong tool. Returns the discarded sundry, or null if the slot was empty.
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
  // The ratchet only has purchase on a single letter — refuse ligatures and
  // marks at the point of picking rather than after the choice is made.
  if (state.sundries[state.sundryMode]?.kind === 'ratchet' && !shiftable(tile)) return 'unshiftable';
  // An armed tube takes only the tiles it laid out.
  if (state.sundries[state.sundryMode]?.kind === 'tube'
      && !(state.tubeOffer ?? []).includes(tile.id)) return 'unoffered';
  // The loupe magnifies nothing past its own limit — refuse a tile already
  // at the cap when it is picked, not after.
  if (state.sundries[state.sundryMode]?.kind === 'loupe'
      && restingPoints(tile) >= LOUPE_CAP) return 'capped';
  if (sundrySelected().length >= 1) return 'full';   // every armed tool takes one target
  tile.selected = true;
  return 'on';
}

// ─── The ratchet's alphabet ───────────────────────────────────────────────────
// The ring a letter steps around, taken from the game's own sorts rather than
// A-Z: the press carries no lone Q (only the QU sort), so Q simply isn't a
// place a letter can land — P steps up to R, and R back down to P. It wraps,
// so A steps down to Z. Ligatures and marks aren't single letters and have no
// place on the ring at all.
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

// Spend the armed sundry on the selected tiles. The live tile's showing face is
// changed, and written through to the collection template it was drawn from —
// paint and letter alike are permanent, not just for this page. `dir` is the
// ratchet's direction (+1 later in the alphabet, -1 earlier) and is ignored by
// every other kind.
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
  // trim together — capped at LOUPE_CAP, and written in as permanent growth
  // so the gain survives the page like everything the Grafter does.
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

  // The tongs feed a tile to the furnace by hand: gone for good (through
  // trashFromCollection, so the Composter is fed and the Smelter's floor
  // holds), and the next word prints hotter for it. Grips stack; the bonus
  // is read by computeScore and cleared when a word commits or a page turns.
  if (sundry.kind === 'tongs') {
    const tile = sundrySelected().filter(t => !isImmutable(t))[0];
    if (!tile) return null;
    if (!trashFromCollection(tile.tid)) return null;
    state.rack = state.rack.filter(t => t.id !== tile.id);
    state.word = state.word.filter(t => t.id !== tile.id);
    state.tongsBonus = (state.tongsBonus ?? 0) + TONGS_BONUS;
    state.sundries.splice(idx, 1);
    state.sundryMode = -1;
    return { kind: 'tongs', letters: [getActiveLetter(tile)], ids: [tile.id], bonus: state.tongsBonus };
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

// The tube's offer, rolled as it is armed: up to two random unpainted tiles
// from the hand — rack and half-composed word alike. Aimed paint only ever
// landed on the same four workhorse letters, and a painted A never changed
// which word you reached for; an offer of two keeps a real choice without
// the auto-pilot. Returns null (and leaves no offer) when nothing in the
// hand will take paint.
export function rollTubeOffer(sundry = null) {
  const takesPaint = t => !t.colour && !isImmutable(t);
  const inHand = [...state.rack, ...state.word];
  const byId = new Map(inHand.map(t => [t.id, t]));

  // THE OFFER BELONGS TO THE TUBE, NOT TO THE GESTURE. It is remembered on the
  // sundry itself, so putting the tube down and picking it up again lays out
  // the SAME two tiles — otherwise backing out re-rolled the pair, and a
  // player could keep flinching until the offer named the tile they wanted,
  // which is the one thing the offer exists to prevent.
  //
  // Tiles that have since left the hand or taken paint drop out of the
  // remembered offer; only when none survive does the tube lay out a fresh
  // one. That is not a way back to fishing — emptying the offer means
  // printing or discarding those tiles, which costs far more than it wins.
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
// seat's reach (see runDiscardHooks in main.js) — so dragging a card is a real
// tactical act, not decoration: it is how you tell the Bloodletter and the
// Typefounder which of them gets first refusal on a discarded pair.
//
// `ref` is a seat uid or a def id, the same currency sellPatron takes. The
// index counts seats, empty ones included, so a card dropped past the end of
// the company simply goes last rather than vanishing into a gap.
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
