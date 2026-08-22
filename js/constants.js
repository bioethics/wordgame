// ─── Letterforms ──────────────────────────────────────────────────────────────
// Bag tiles are template objects so they can carry trim/nick/colour before being
// given an id when drawn to the rack.
// Template shape: { letter, letterType, altLetter, activeVariant,
//                   colour, trim, nick }
// Rack tile shape: { ...template, id, basePoints, selected }
// Paint, trim and nick belong to the tile, not to either face: a dual tile wears
// the same coat whichever letter it shows. Flipping changes the letter only.

// Scrabble's values, with one measured correction: U scores 2. Over the 24,545
// playable words (3-7 letters) U fills 3.59% of letter slots — rarer than D
// (worth 2) and C (worth 3) — and the bag carries only 2 of it.
export const TILE_POINTS = {
  A:1, B:4, C:3, D:3, E:1, F:5, G:3, H:4,
  I:1, J:10, K:6, L:1, M:3, N:1, O:1, P:3,
  QU:10, R:1, S:1, T:1, U:2, V:6, W:6, X:8,
  Y:5, Z:8,
  // A ligature scores what its letters score apart — CH is C+H — so it buys a
  // tile slot, never free points. QU keeps 10: there is no lone Q to sum from.
  ING:5, CH:7, CK:9, TH:5, WH:10,
  RAT:3,                    // R+A+T, exactly what the three would score apart
  OLOGY:11,                 // O+L+O+G+Y — The Scientist's loan, and no one else's
  OO:2, FU:7,               // out of the Sexton's and the Vulgarian's packages only
  // The medieval sorts pay well over what they stand for — TH is 5, thorn 10.
  // Kept in step with MEDIEVAL[…].points by the check just after it.
  'Þ':10, 'Ȝ':5, 'Ƿ':8, 'Æ':1,
  '☙':1,                    // the fleuron — an ornament, not a letter; prints alone
  '?':1, '!':1,
  '‽':50,                   // the interrobang — cut, never dealt; see INTERROBANG
};

export const BAG_COUNTS = {
  A:4, B:1, C:1, D:1, E:5, F:1, G:1, H:1,
  I:4, J:1, K:1, L:3, M:1, N:4, O:4, P:1,
  QU:1, R:4, S:4, T:4, U:2, V:1, W:1, X:1, Y:1, Z:1,
};

// Multi-letter "ligature" tiles — one tile that spells several letters. QU is the
// odd one out, being also a bag letter. Exactly one *dealt* suffix is deliberate:
// a ligature should be a find, not a staple. OLOGY is lent, never dealt.
export const LIGATURES = ['ING', 'CH', 'CK', 'TH', 'WH', 'QU', 'RAT', 'OLOGY', 'OO', 'FU'];

// Letters no shop, draft or heap will ever hand you: each comes from one patron
// and nowhere else. RAT is The Rat Catcher's; OLOGY The Scientist's, only ever on
// loan; the fleuron sells at its own price (FLEURON_PRICE).
export const EXCLUSIVE_LETTERS = ['RAT', 'OLOGY', '☙', 'Þ', 'Ȝ', 'Ƿ', 'Æ', '‽', 'OO', 'FU'];

// ─── The medieval sorts (The Medievalist's stall) ─────────────────────────────
// Each STANDS FOR ordinary letters when the word is read: the tile prints as its
// own glyph and scores its own Points, but the dictionary, the patrons and the
// editors all see what it stands for — Þ+O+R+N is THORN, five letters of measure
// from four tiles. The key is the UPPERCASE form, because a word is upper-cased
// before anything reads it; `glyph` is what the tile shows (lowercase where that
// is more recognisable, but ƿ reads as a p so wynn keeps its capital). `reads` is
// tried IN ORDER and the first reading that makes a word wins.
export const MEDIEVAL = {
  'Þ': {
    glyph: 'þ', name: 'Thorn', points: 10, reads: ['TH'],
    note: 'The letter English used for TH, and kept longest. It is why “ye olde” exists: '
        + 'printers importing type from the Continent had no þ to set, so they used the '
        + 'nearest shape they had — a y. Nobody ever said “ye”.',
  },
  'Ȝ': {
    glyph: 'ȝ', name: 'Yogh', points: 5, reads: ['Y', 'GH', 'Z'],
    note: 'Middle English’s workhorse: the Y of ȝe, and the GH of niȝt — night. Scots '
        + 'printers, short of the sort, set z in its place, which is why Menzies is said '
        + '“Ming-iss” and Dalziel “Dee-ell”.',
  },
  'Æ': {
    glyph: 'Æ', name: 'Ash', points: 1, reads: ['AE', 'A', 'E'],
    note: 'A and E written as one letter, for a sound Latin had no sign for — the a of cat. '
        + 'It survived in the words English took from Latin (encyclopædia, æther) and has been '
        + 'quietly losing its second half ever since.',
  },
  'Ƿ': {
    glyph: 'Ƿ', name: 'Wynn', points: 8, reads: ['W'],
    note: 'A rune, borrowed whole into the Old English alphabet for a sound Latin had no '
        + 'letter for. Scribes later wrote it uu instead — which is, quite literally, '
        + 'how W got its name.',
  },
};
export const MEDIEVAL_LETTERS = Object.keys(MEDIEVAL);
// Points live in TILE_POINTS too (scoring reads that and nothing else); checked
// against each other at load so the two can't drift apart.
for (const [L, m] of Object.entries(MEDIEVAL)) {
  if (TILE_POINTS[L] !== m.points) {
    throw new Error(`${L} pays ${TILE_POINTS[L]} in TILE_POINTS but ${m.points} in MEDIEVAL`);
  }
}
export const isMedieval  = L => Object.prototype.hasOwnProperty.call(MEDIEVAL, L);
// What a letter SHOWS, as against what it is called; only medieval sorts differ.
export const letterGlyph = L => MEDIEVAL[L]?.glyph ?? L;

// Every way a word holding medieval sorts could be read, in `reads` order, or
// null when it holds none. Capped, because a rack full of yoghs is an exponential
// lookup: past the cap the word is left as set and fails the dictionary.
const MEDIEVAL_MAX_READINGS = 512;
export function medievalExpansions(letters) {
  const chars = [...(letters ?? '')];
  if (!chars.some(isMedieval)) return null;
  let count = 1;
  for (const ch of chars) count *= MEDIEVAL[ch]?.reads.length ?? 1;
  if (count > MEDIEVAL_MAX_READINGS) return null;

  let out = [''];
  for (const ch of chars) {
    const reads = MEDIEVAL[ch]?.reads;
    out = reads ? out.flatMap(w => reads.map(r => w + r)) : out.map(w => w + ch);
  }
  return out;
}

// ─── Postnoms (a distinguished patron) ────────────────────────────────────────
// A patron that arrives already lettered: same patron, same effect, plus a
// ×POSTNOM.mult paid at its own seat — so where you seat it matters as much as
// which one it is. The surcharge keeps it a decision rather than a windfall.
export const POSTNOM = {
  odds: 0.12,        // per patron card laid out at the Market
  mult: 1.2,         // ×Mult, paid at that patron's own turn in the running order
  surcharge: 3,      // Coins on top of the def's cost
  titles: ['PhD'],
};

// ─── What a patron is asking today ────────────────────────────────────────────
// The asking price is rolled as the card is laid out, a coin either side of the
// def's cost. It rides on the OFFER rather than the def, so a re-roll re-rolls
// it. A free patron (the cat) is never haggled; no card asks less than one Coin.
export const PATRON_HAGGLE = { spread: 1, chance: 0.25 };   // per side; the rest is list price
export const rollHaggle = () => {
  const r = Math.random();
  return r < PATRON_HAGGLE.chance ? -PATRON_HAGGLE.spread
       : r < PATRON_HAGGLE.chance * 2 ? PATRON_HAGGLE.spread
       : 0;
};

// ─── What the bag hands you first ─────────────────────────────────────────────
// Two patrons reach into the bag rather than at the board. A weight of 2 means
// a tile is drawn about twice as often as its share of the bag would give it.
// The two multiply, so a gold-trimmed crimson tile with both seated is 6× — and
// neither conjures anything: the bag holds exactly what it held.
export const MAGPIE_WEIGHT = 2;   // a gold trim, to The Magpie
export const MAKO_WEIGHT   = 3;   // crimson paint, to The Shortfin Mako

// ─── A ghost for hire ─────────────────────────────────────────────────────────
// Now and then the Market lays out a patron who is already dead. It works
// exactly as a living one does and takes no SEAT — it goes straight to the
// graveyard, where The Ripper's victims work on. A free seat is worth paying
// for, so a ghost asks a surcharge over its living price, and its contract is
// worth nothing back: dismissing one pays no Coins at all. Rare enough to be a
// find rather than a plan.
export const GHOST_HIRE = { odds: 0.01, surcharge: 3 };   // odds per patron card laid out

// ─── The fleuron ──────────────────────────────────────────────────────────────
// A printer's ornament: the one tile that refuses to join a word — it prints
// alone, for its single point, spending a whole word slot — and the one tile that
// earns while idle, paying 1 Coin per page completion wherever it sits.
export const FLEURON = '☙';
export const FLEURON_PRICE        = 3;
export const FLEURON_PAGE_COIN    = 1;     // paid per fleuron owned, every page
export const FLEURON_OFFER_CHANCE = 0.18;  // odds a Market tile slot holds one

// ─── Marks (punctuation tiles) ────────────────────────────────────────────────
// Not letters and not ligatures: a mark spells nothing and is simply appended to
// a finished word. One ? or one !, or the two as ?! — never doubled, never
// mid-word. They take paint, trims and nicks like any other tile, and a left nick
// on a trailing mark reaches back across the entire word. Marks are never sold:
// the only way one enters a run is out of a wrapped tile, under a purple trim
// (see WRAPPED_CONTENTS). The interrobang is not among them — it is made.
export const MARKS      = ['?', '!'];

// ‽ — one glyph for the pair, cut by the Punchcutter from a ? and a ! and by no
// other road (see PROPOSAL_STALLS.punchcutter in js/market.js). It IS the ?! tail.
// Points only, no multiplier: at five times the best letter in the case, a ×Mult
// on top would make it the only tile worth building around.
export const INTERROBANG = '‽';

export const MARK_RUNS  = ['?', '!', '?!', INTERROBANG];   // every legal tail
export const isMark     = ch => MARKS.includes(ch) || ch === INTERROBANG;

// Split a composed word into its letters and its trailing marks. Returns null
// when the marks aren't a legal tail — doubled, reversed, or mid-word.
export function splitMarks(str) {
  const i = [...str].findIndex(isMark);
  if (i < 0) return { letters: str, marks: '' };
  const letters = str.slice(0, i);
  const marks   = str.slice(i);
  return MARK_RUNS.includes(marks) ? { letters, marks } : null;
}

// ─── Colours (tile paint) ─────────────────────────────────────────────────────
// Each colour has its own multiplier, ×1 by default; every painted tile of that
// colour raises it by +1. The word's Mult is the product of all of them, so
// spreading colours multiplies together. Tiles, not letters: a CH or QU tile
// spells two letters but wears one coat and lifts its multiplier once. Anything
// counting what is *in* a word counts tiles; only rules about a word's shape —
// length, spelling, order — count letters.
export const COLOURS = {
  crimson: { label: 'Crimson', glyph: '#b23a2e', bright: '#ff9d8e' },
  azure:   { label: 'Azure',   glyph: '#2e6fb2', bright: '#8ec6ff' },
  jade:    { label: 'Jade',    glyph: '#2d8a5c', bright: '#90e8ba' },
  amber:   { label: 'Amber',   glyph: '#a87010', bright: '#ffd68c' },
};

export const colourDesc = c =>
  `Each ${COLOURS[c].label} tile adds +1 to the ${COLOURS[c].label} multiplier.`;

// Every multiplier the readout keeps a chip for — the paints plus the ones that
// come from somewhere other than paint. Score steps look their `colour` up here.
export const MULT_TRACKS = {
  ...COLOURS,
  purple: { label: 'Purple', glyph: '#8a5fb0', bright: '#cfa6ff' },
  cursed: { label: 'Cursed', glyph: '#c93c2d', bright: '#ff7a66' },
  length: { label: 'Length', glyph: '#7d8fa0', bright: '#d9e6f2' },   // type-metal steel
};

export const PAINT_PER_POT   = 3;   // tiles painted per draft pot (random, unpainted)

// ─── Sundries (consumables kept on the workbench) ─────────────────────────────
// Bought at the Shop, spent mid-page. A paint tube is the first kind: uncork it
// and one random unpainted tile in hand takes the colour, permanently. The tile
// is the paint's choice — aimed paint only ever hit the same four workhorses.
export const SUNDRY_SLOTS  = 2;   // sundries the workbench can hold
export const SUNDRY_OFFERS = 2;   // sundries offered per shop

// ─── The registers' packages ──────────────────────────────────────────────────
// The four register patrons pay ×3 Mult for a word on their list, a condition you
// cannot plan for (the lists run 3–9% of the dictionary). So the ×3 keeps a parcel
// behind it: PACKAGE_ODDS that a package lands on the workbench, rolled once per
// firing register, and a full bench turns the gift away. A package is a sundry
// like any other — the Market buys it back for SUNDRY_SELL. Loot tables are
// weighted [id, weight] pairs, resolved in js/main.js (openPackage).
export const PACKAGE_ODDS = 0.5;

export const PACKAGES = {
  romantic: {
    patron: 'paramour', label: 'A billet-doux', emoji: '💌',
    body: 'Sealed and scented. Open it for a two-faced X|O in crimson, a love potion for the workbench, or a tube of crimson.',
    loot: [['xotile', 3], ['potion', 3], ['tube-crimson', 3]],
  },
  spooky: {
    patron: 'sexton', label: 'Grave goods', emoji: '⚰️',
    // Rarer than its ghostly twin: a cursed tile can never be discarded, so a
    // Sexton collecting one per third parcel would brick their own hand.
    body: 'Buried with someone. Open it for an azure OO in ghost metal, the same in cursed iron, or a tube of azure.',
    loot: [['oo-ghost', 3], ['oo-cursed', 2], ['tube-azure', 3]],
  },
  cute: {
    patron: 'poppet', label: 'A party bag', emoji: '🎁',
    // Weighted to the rose tile: The Poppet's list is the smallest of the four
    // (2,158 words), so its parcels are the rarest and want the best odds.
    body: 'Somebody had a birthday. Open it for a tile struck in rose metal, a rainbow applicator, or a pot of ink wash.',
    loot: [['rosetile', 4], ['applicator-rainbow', 3], ['wash', 2]],
  },
  rude: {
    patron: 'vulgarian', label: 'A plain brown wrapper', emoji: '📦',
    body: 'No return address. Open it for a pair of tongs, a curse applicator, or a silver-trimmed FU.',
    loot: [['tongs', 3], ['applicator-cursed', 3], ['futile', 3]],
  },
};

// theme → the patron who sends it, and back again.
export const PACKAGE_OF_PATRON = Object.fromEntries(
  Object.entries(PACKAGES).map(([theme, p]) => [p.patron, theme]));

// ─── The toolbox and its tools ────────────────────────────────────────────────
// Open it on the bench and two DIFFERENT tools from the pool take its place (the
// second only if the bench has room). No shop sells the four guild tools, and the
// box is the only door to three of them. Repeating an entry makes it likelier.
export const TOOLBOX_PRICE = 4;
export const TOOLBOX_POOL  = [
  'loupe', 'loupe', 'laurel', 'laurel', 'tongs', 'tongs', 'wash', 'wash',
  'ratchet',
];
export const LOUPE_CAP      = 30;  // a doubled tile never passes this resting value
// Points per word, per laurel a patron wears, paid at the crowned patron's own
// turn in the running order (see the patron pass in scoring.js) — so a laurel in
// front of a ×Mult seat is multiplied by it and one behind it is not. Kept modest
// because laurels arrive from several sources at once.
export const HONORIFIC_STEP = 3;
export const TONGS_BONUS    = 8;   // Points armed for the next word, per grip
// The Winnower's due: Points armed for the next word every time a discard is
// spent — once per discard ACTION, however many tiles go with it, and stacking
// if both discards are spent before a word is set. He is the first patron to
// pay for discarding at all, which quietly makes the cobalt trim (and every
// other source of a spare discard) worth more.
export const WINNOWER_BONUS = 10;
export const WASH_COUNT     = 4;   // tiles washed per pot — one of each colour

// One look per tool, shared by the bench, the shop card and the held row.
export const TOOL_LOOK = {
  toolbox: { glyph: '🧰', label: 'Toolbox' },
  loupe:   { glyph: '🔍', label: 'Loupe' },
  laurel:  { glyph: '🏵️', label: 'Laurel' },
  tongs:   { glyph: '🗜️', label: 'Tongs' },
  wash:    { glyph: '💧', label: 'Ink wash' },
  potion:  { glyph: '🧪', label: 'Love potion' },
};

// The applicators strike one tile in hand into a new material. Like the tube, the
// tool lays out two candidates and you choose, so the gift can never be aimed at
// the one tile that would break the game. A tile already cast is refused: a sort
// is cast in one metal, not two.
export const APPLICATORS = {
  rainbow: { glyph: '🌈', label: 'Rainbow roll' },
  cursed:  { glyph: '🩸', label: 'Hellbox iron' },
};
// Patrons offered per Market. Scale with the roster: too few offers against a big
// roster shows a thin slice of the game and makes guild assembly unreliable.
export const PATRON_OFFERS = 4;
export const TUBE_PRICE    = 2;
export const SUNDRY_SELL   = 1;   // what the Market pays to take one back
export const RATCHET_PRICE = 3;   // the ratchet: one letter, one step either way

// "one tile" / "2 tiles" — keeps counted copy reading right
export const tileCount = n => n === 1 ? 'one tile' : `${n} tiles`;

// ─── Stalls ───────────────────────────────────────────────────────────────────
// Two pitch up at each shop. A stall's price starts at its base and doubles with
// every purchase, resetting when the next shop opens. Nothing opens under 2, or
// the interesting question — is this worth the doubling? — never gets asked.
export const STALLS_PER_SHOP = 2;
export const PROPOSAL_RANGE  = 6;    // tiles a proposal stall lays out at a time
export const SMELT_MIN_COLLECTION = 12;

export const STALL_DEFS = {
  smelter: {
    name: 'The Smelter', emoji: '🔥', base: 2,
    desc: 'Destroys a tile by feeding it to the furnace.',
  },
  painter: {
    name: 'The Painter', emoji: '🖌️', base: 2,
    desc: 'Proposes colours for six unpainted tiles.',
    empty: 'Every tile you own already wears paint.',
  },
  gilder: {
    name: 'The Gilder', emoji: '⚜️', base: 2,
    desc: 'Proposes trims for six untrimmed tiles.',
    empty: 'Every tile you own already wears a trim.',
  },
  punchcutter: {
    name: 'The Punchcutter', emoji: '⚒️', base: 2,
    desc: 'Cuts a second letter into a tile — flip to play either face.',
    empty: 'Every tile you own already holds two letters.',
  },
  dresser: {
    name: 'The Dresser', emoji: '🪚', base: 3,
    desc: 'Cuts a nick into the edge of a tile.',
    empty: 'Every tile you own already carries a nick.',
  },
  stereotyper: {
    // base 4 where its neighbours open at 2-3: a copy inherits every feature the
    // original carries, so duplicating a loaded tile beats any single
    // improvement the other stalls sell.
    name: 'The Stereotyper', emoji: '🗜️', base: 4,
    desc: 'Casts an exact copy of any tile.',
  },
};

// ─── Special-tile generation ──────────────────────────────────────────────────
// Every offered tile gets one feature outright, then keeps rolling for another at
// this chance until it fails or runs out of slots (paint / trim / nick / dual — a
// ligature letter counts as one). At 0.5: ~50% one · 25% two · 12% three · 6% four.
export const FEATURE_CHAIN_CHANCE = 0.5;
export const MAX_FEATURES         = 4;

// ─── Trims (the ring around a tile's edge) ────────────────────────────────────
// Purple is trim-only: a fifth multiplier that stacks with the letter colours.

// Silver's Points belong to the tile, not to the word it lands in — part of what
// the tile is worth wherever it appears, which is why the corner number carries
// them (see restingPoints in state.js). Everything reads the bonus from here.
export const SILVER_BONUS = 5;

// A retired fifth trim (mercury) is still stripped out of old saves at load (see
// retireMercury in state.js); its rule now belongs to The Fountain (returnsToBag).
export const TRIMS = {
  gold:    { label: 'Gold',    price: 2, desc: 'Pays 1 Coin when printed.' },
  silver:  { label: 'Silver',  price: 2, desc: `+${SILVER_BONUS} Points.` },
  cobalt:  { label: 'Cobalt',  price: 3, desc: 'Refunds a Discard when printed.' },
  purple:  { label: 'Purple',  price: 4, desc: 'Adds +0.5 to the purple multiplier.' },
};

// Half a step where a painted letter is a whole one: one purple trim gives ×1.5,
// two ×2. It stacks with paint on the same tile, and patrons add to it.
export const PURPLE_TRIM_STEP = 0.5;

// ─── Nicks (a notch cut out of one edge of the tile) ──────────────────────────
// Nicks do not stack: a letter is multiplied at most once however many nicks
// point at it, and where two compete the earlier tile in the word claims it.
// Keep the multiplier low — a nick reaches across every letter on one side of it,
// so its value grows with the word where a trim's stays put, and patron tile
// bonuses (see the tileBonus pass in scoring.js) go through it as well.
export const NICK_MULT = 2;
export const NICKS = {
  right: { label: 'Right nick', mult: NICK_MULT, price: 4,
           desc: `×${NICK_MULT} Points to every tile on its right.` },
  left:  { label: 'Left nick',  mult: NICK_MULT, price: 4,
           desc: `×${NICK_MULT} Points to every tile on its left.` },
};

// ─── The measure (the length multiplier) ──────────────────────────────────────
// The one multiplier every press owns from its first page: the word itself.
// LENGTH_MULT_MIN letters or more earns its own chip — ×LENGTH_MULT_BASE at the
// threshold, +LENGTH_MULT_STEP per letter beyond — and it MULTIPLIES with the
// paint rather than competing against it. LETTERS, not tiles, like every rule
// about a word's shape, which is why an ING tile is three letters of measure
// from one seat in the hand.
export const LENGTH_MULT_MIN  = 6;
export const LENGTH_MULT_BASE = 2;
export const LENGTH_MULT_STEP = 0.5;
export const lengthMult = n =>
  n < LENGTH_MULT_MIN ? 1 : LENGTH_MULT_BASE + (n - LENGTH_MULT_MIN) * LENGTH_MULT_STEP;

// EDIT FREELY — copy, not code. Each entry is only the reaction clause: main.js
// puts the count and the ×Mult in front, so a line reads "6 letters — ×2 Mult:
// good!" Longer words fall through to LENGTH_FLOURISH_BEYOND. Keep them short:
// the floater is a cheer, and it holds only long enough to be read.
export const LENGTH_FLOURISHES = {
  6:  'good!',
  7:  'great!',
  8:  'a true accomplishment!',
  9:  'astounding!',
  10: 'a credit to mankind!',
  11: 'the Press itself is honoured.',
  12: 'words about words fail us.',
};
export const LENGTH_FLOURISH_BEYOND = 'the stuff of legend.';
export const lengthFlourish = n =>
  LENGTH_FLOURISHES[n] ?? LENGTH_FLOURISH_BEYOND;

// ─── Run structure ────────────────────────────────────────────────────────────
export const RACK_SIZE          = 10;
export const WORDS_PER_PAGE     = 5;
export const DISCARDS_PER_PAGE  = 2;
export const PATRON_SLOTS       = 5;
export const PAGES_PER_CHAPTER  = 3;
export const FINAL_CHAPTER      = 10;
export const STARTING_COINS     = 3;

// Chapter titles are drawn at random per run from js/chapters.js — see
// chapterTitle() in js/state.js, which has to remember what a run has drawn.

const PAGE_FACTORS = [1, 1.4, 2];
const QUOTA_BASE   = 40;

// The climb is not a fixed rate: the rate itself grows, so each chapter is a
// bigger step than the last (ch2 asks ×1.7 of ch1, ch3 ×1.8 of ch2 …), which runs
// the last chapters into the tens of thousands — a built press multiplies rather
// than adds. Raising START makes the whole run harder; raising RAMP makes the
// ending harder without touching the opening.
const QUOTA_GROWTH_START = 1.7;
const QUOTA_GROWTH_RAMP  = 0.1;

// Chapter 1 alone gets a gentler on-ramp. QUOTA_GROWTH_START anchors chapter 2's
// climb off QUOTA_BASE directly, so easing here — rather than lowering
// QUOTA_BASE itself — leaves chapter 2 onward untouched.
const CHAPTER_1_EASE = 0.75;   // 40/56/80 → 30/40/60

// The middle of the run sags: by chapter 4 a press that has met three Markets is
// compounding while the quota still climbs at the rate set for a bare hand. These
// are per-chapter nudges rather than a change to the growth rate, so the dip
// lifts without compounding into the back half; chapter 6 on is untouched.
const CHAPTER_EASE = { 4: 1.2, 5: 1.15 };

// Quotas are targets, not arithmetic: show a round number. Under 100 they
// land on 5s, above it on two significant figures — 4,937 reads as 4,900.
function roundQuota(n) {
  if (n < 100) return Math.max(5, Math.round(n / 5) * 5);
  const mag = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.round(n / mag) * mag;
}

export function quotaFor(chapter, page) {
  let raw = QUOTA_BASE;
  for (let c = 2; c <= chapter; c++) raw *= QUOTA_GROWTH_START + (c - 2) * QUOTA_GROWTH_RAMP;
  if (chapter === 1) raw *= CHAPTER_1_EASE;
  raw *= CHAPTER_EASE[chapter] ?? 1;
  return roundQuota(raw * PAGE_FACTORS[page - 1]);
}

export function roman(n) {
  const table = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],
                 [50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
  let out = '';
  for (const [v, s] of table) while (n >= v) { out += s; n -= v; }
  return out;
}

// The ten chapters of the folio proper, then the appendices, counted from one.
export const chapterLabel = ch =>
  ch <= FINAL_CHAPTER ? `Chapter ${roman(ch)}` : `Appendix ${roman(ch - FINAL_CHAPTER)}`;

export const isDeadline = page => page === PAGES_PER_CHAPTER;

// ─── Economy ──────────────────────────────────────────────────────────────────
// Income is tuned against the Market's sinks and the quota climb; move `base` if
// either changes much.
export const REWARD = {
  base:         5,   // coins for completing a page
  perSpareWord: 1,   // per unused word
  finaleBonus:  3,   // extra for clearing a Deadline page
  interestPer:  10,  // +1 coin per N coins held…
  interestCap:  3,   // …capped here
  oversetPer:   0.5, // +1 coin per this fraction of quota beyond it (150% pays 1)…
  oversetCap:   3,   // …capped here, like interest
};

export const TILE_BASE_PRICE = 2;
export const REROLL_BASE     = 2;

// ─── Animation base timings (ms, divided by the speed setting) ────────────────
export const ANIM = {
  stepBoost:  380,   // a patron writing Points onto the tiles, before any scoring
  stepTile:   300,
  stepNick:   430,
  stepColour: 560,
  stepPatron: 460,
  stepBurn:   620,
  holdTotal:  820,
  fly:        430,
  stagger:    65,
};

// ─── Materials (what a tile is cast from) ─────────────────────────────────────
// Ordinary tiles are lead. A wrapped tile holds one cast from something stranger,
// and the material sits under everything else the tile carries: a cursed or
// rainbow tile still takes paint, trims and nicks; a ghost takes nothing, ever.
// What is under the paper is not known until it comes off — not to the shop, not
// to the save — so a wrapped tile is a parcel you open, not a metal you buy.
export const CURSED_MULT       = 2;   // ×Mult a cursed tile gives the word
export const CURSED_MAX_POINTS = 3;   // never cast on a letter worth more than this
// What a curse takes from any word set without it while it waits in the hand. A
// curse cannot be discarded — printing it is the only way out of the rack — so
// this is what keeps it from stranding you: words set around a curse are worth
// nothing rather than impossible. Points, not Mult, so a strong press can shrug
// one off and score anyway.
export const CURSED_PENALTY    = 666;  // Points lost per unplayed curse in hand
export const WRAPPED_PRICE        = 4;
export const WRAPPED_OFFER_CHANCE = 0.5;  // odds one of a Market's sundry slots holds one

// What is inside a wrapped tile, and the only place these odds live. Three
// entries name a material from MATERIALS; 'mark' is a punctuation tile in lead
// under a purple trim. Flat pick, so repeating an entry makes it likelier.
export const WRAPPED_CONTENTS = ['cursed', 'ghost', 'rainbow', 'mark'];
export const MARK_TRIM = 'purple';   // what a wrapped mark always comes wearing

export const MATERIALS = {
  cursed: {
    label: 'Cursed', metal: 'Hellbox iron', emoji: '🩸',
    desc: `×${CURSED_MULT} Mult when printed. Cannot be discarded. Words set while this remains in your hand lose ${CURSED_PENALTY} Points.`,
  },
  ghost: {
    label: 'Ghost', metal: 'Ghost metal', emoji: '👻',
    desc: 'Does not count against your hand size. Cannot be modified.',
  },
  rainbow: {
    label: 'Rainbow', metal: 'Rainbow roll', emoji: '🌈',
    desc: 'Counts as every colour to your patrons.',
  },
  // Rose metal is real: an alloy soft enough to melt in boiling water, so no
  // press could set a page in it. Out of The Poppet's party bag only.
  rose: {
    label: 'Rose', metal: 'Rose metal', emoji: '🎀',
    desc: `Crowns a random patron with a laurel when printed — +${HONORIFIC_STEP} Points on every word thereafter.`,
  },
};

// Tiles nothing can be done to: a ghost; any tile an editor has merely lent you
// (see js/bosses.js) — no collection template stands behind a lent tile, so paint
// laid on one would look permanent and evaporate with the page; and a tile The
// Redactor has wrapped. (`wrapped` is isWrapped in state.js; checked bare here
// because constants.js is a leaf and imports from nobody.)
export const isImmutable = tile =>
  tile?.material === 'ghost' || !!tile?.ephemeral || !!tile?.wrapped;

// ─── The Editors (Deadline bosses — see js/bosses.js) ─────────────────────────
// A word that breaks the seated editor's rule is SPIKED: printed and counted, but
// at this fraction of its score. Soft on purpose — a cost to weigh, not a wall.
// Scoring applies it as a visible ×Mult step; the editor's bar quotes it.
export const SPIKE_MULT = 0.2;

// ─── Patron tuning (the colour-guild overhaul) ────────────────────────────────
// Knobs for patron effects that reach beyond a single score. Plain score numbers
// stay in js/patrons.js with their patron.
export const GRAFTER_STEP       = 1;      // permanent Points per tile per print
export const ESPALIER_STEP      = 2;      // permanent Points per tile of a two-tile word
// The Stoker's furnace, lit before it has eaten anything and hotter with every
// crimson tile that goes in: his ×Mult is STOKER_BASE + STOKER_STEP per burn.
export const STOKER_BASE        = 1.25;   // ×Mult the day he sits down, no tiles burned
export const STOKER_STEP        = 0.25;   // permanent ×Mult per crimson tile burned
// ─── The Wordler's secret word ────────────────────────────────────────────────
// He keeps a five-letter word and marks every five-letter word you print
// against it, Wordle's way. Print the word itself and he is upgraded for good.
//
// The answer is drawn from the head of common.txt — the `pool` commonest
// five-letter words — because a secret nobody could think of is not a puzzle.
// Widen the pool to make him harder; narrow it to make him kinder.
//
// A happy accident the marking leans on: Wordle's green and yellow ARE this
// game's jade and amber, which is exactly the pair he pays for.
export const WORDLER = {
  bonus:  2,    // Points on every amber or jade tile, upgraded or not
  length: 5,    // letters in the secret word
  pool:   400,  // how far down common.txt's five-letter words the answer may sit
  board:  8,    // guesses kept on his card, so the puzzle can actually be worked
};

// ─── The Azure Prince's cypher ────────────────────────────────────────────────
// A standing ×Mult that grows by solving a small puzzle he sets. The cypher is
// a row of boxes with one marked: print a word of exactly that many tiles with
// an azure tile standing in the marked place and he reads it, keeps the step
// for good, and sets a fresh one. At `crown` he is crowned and stops setting
// them — the seat becomes a flat ×crown, and a fortune if it is ever dismissed.
//
// He starts NEUTRAL, which is the whole of his bargain: ×1.5 to begin AND half
// a step per cypher was two gifts where one was meant, and a rare seat that is
// already strong before it has done anything has nothing to earn. So he is
// dead weight on the page you buy him — the cost of a ceiling this high — and
// four cyphers walk him to it.
//
// If the ramp proves too slow to be worth the seat, the fallback is a smaller
// spread rather than a friendlier start: base 1.25, step 0.25, crown 2.5.
export const PRINCE = {
  base:    1,               // ×Mult the day he sits — neutral, before any cypher
  step:    0.5,             // ×Mult per cypher read, permanent
  crown:   3,               // at this ×Mult he is crowned and sets no more
  ransom:  15,              // Coins over the odds a crowned seat pays to dismiss
  lengths: [5, 6, 7],       // boxes a cypher may show
};
export const princeMult = solved =>
  Math.min(PRINCE.crown, PRINCE.base + (solved ?? 0) * PRINCE.step);

export const BEEKEEPER_STEP     = 0.2;    // permanent ×Mult per B printed
export const ARSONIST_ODDS      = { paint: 0.10, burn: 0.01 };  // per tile played
export const NUDIST_TRIM_CHANCE = 0.25;   // per bare letter in an all-bare word
// A bare tile that misses the trim may still catch a colour — half the trim's
// rate, because paint is worth more.
export const NUDIST_PAINT_CHANCE = 0.125;
// The Abecedarian's trellis: permanent Points per tile of a three-letter word.
export const ABECEDARIAN_STEP   = 1;
// The Dabbler's splash: odds a painted tile splashes a second, randomly chosen
// unpainted tile of the collection the same colour. One splash per brushstroke.
export const DABBLER_ODDS = 0.5;
// Per tile discarded, painted at random. Keep it low — free paint at any faster
// rate speckles the collection. The Dipper's card reads its odds off this number.
export const DIPPER_PAINT_CHANCE = 1 / 12;
// ─── The Ragman's rates ───────────────────────────────────────────────────────
// What a painted tile fetches when thrown away, rolled per painted tile discarded
// — nothing is destroyed, the tiles file into the pile as any discard does, and
// the only cost is the page spent without them. Payouts are small for that reason.
export const RAGMAN_ODDS   = 0.5;   // per painted tile discarded
export const RAGMAN_COINS  = 1;     // amber: what the rag fetches
// The Revenant's due: odds a tile destroyed anywhere comes back in ghost metal.
// What returns is the WHOLE tile — paint, trim, nick, grown Points, both faces of
// a dual — with only the metal overwritten, so a cursed or rainbow tile loses its
// own material to the ghost.
export const REVENANT_ODDS = 0.5;
// The Ripper's watchwords. Print one and he kills a patron — see js/main.js and
// state.ghosts, where the victim goes on working. Keep them short and settable
// from an ordinary rack, so the seat is a decision rather than a lottery.
export const RIPPER_WORDS = ['KILL', 'MURDER', 'SLAY'];
// The Headsman: permanent ×Mult per patron dismissed while he is seated.
export const HEADSMAN_STEP = 0.2;
// The Gambler's coin, tossed once per word, not per keystroke: scoring runs on
// every letter laid to drive the live preview, so a roll inside the score effect
// would flicker and then disagree with what printed (rollGamble in state.js).
export const GAMBLER_ODDS       = 0.5;    // odds the coin comes up ×2
export const NEOLOGIST_LENGTH   = 6;      // letters in a coined word
export const DYE_TILES_PER_CHAPTER = 2;   // tiles painted by a dye patron at chapter end

// The Composter's heap: destroyed tiles rot down into jade ones, freshest kept.
export const COMPOST_HEAP_MAX = 6;        // tiles the heap can hold at once
export const COMPOST_PER_MARKET = 1;      // how many you may take on a visit

// The Frontispiece: the first word of a page scores at ×base. Flat, not growing —
// a growing version compounded too well when the patron was taken early, so the
// feat now pays a laurel instead (see js/patrons.js).
export const FRONTISPIECE = { base: 1.5 };

// ─── Tile-template factory ────────────────────────────────────────────────────
export function makeTileTemplate(letter, overrides = {}) {
  return {
    letter,
    letterType:    'normal',   // 'normal' | 'dual'
    altLetter:     null,
    activeVariant: 0,          // 0 = letter, 1 = altLetter
    colour:        null,       // paint — the tile's, not either face's
    trim:          null,       // gold | silver | cobalt | purple
    nick:          null,       // right | left | side
    bonusPoints:   0,          // permanent growth of the first letter (The Grafter, The Espalier)
    altBonusPoints: 0,         // …and of the second, when a dual carries any — growth follows the face
    material:      null,       // null = lead | cursed | ghost | rainbow (see MATERIALS)
    ...overrides,
  };
}

// ─── The Colophon (a permanent upgrade, chosen when a chapter clears) ─────────
// Structural picks (hand size, discards, seats, bench slots) persist for the rest
// of the run; paint is an immediate one-off. Each of the 9 picks can be taken at
// most MAX_UPGRADE_REPEATS times, and one structural option is always offered
// while any is still eligible.
export const UPGRADE_OFFERS      = 3;
export const MAX_UPGRADE_REPEATS = 2;

// Decline all three cards for this instead — also what a chapter transition pays
// out on its own if the whole pool is ever exhausted (endless mode only).
export const SKIP_COIN_GRANT = 2;

// ─── Patron reactions (flavour only) ──────────────────────────────────────────
// Odds a seated patron pops a speech bubble after a word, scored against THE
// WHOLE PAGE'S QUOTA rather than a page-fifth of it: ratio = word total ÷ quota.
// Nothing is said below `floor`, a certainty at `ceil`. Self-scaling, so the
// curve holds from Chapter I to the appendices; keep the floor high, since praise
// is only worth something rationed. The lines live in js/quips.js.
export const REACTION = { floor: 0.5, ceil: 2 };

// ─── Reshuffle sundry ─────────────────────────────────────────────────────────
// A free re-roll, banked: spend it on the Market's offers or the Colophon's cards.
export const RESHUFFLE_PRICE = 4;

// ─── Opening draft ────────────────────────────────────────────────────────────
// Before the first page you kit out the press from a free spread, no coins. The
// starting collection ships unpainted, so the paints picked here are what gets
// the colour multipliers going. The first patron is hired at the first Market.
export const DRAFT = {
  paints:  { show: 4,  pick: 2 },
  tiles:   { show: 10, pick: 4 },
};

// ─── What a sundry is, in one place ───────────────────────────────────────────
// The workbench slot, the shop card and the held row all read from here, so what
// a thing does is written once and turns up wherever the thing does.
export function sundryTip(s) {
  if (s?.kind === 'tube') return {
    head: `Tube of ${COLOURS[s.colour].label}`,
    body: `Paints one tile in your hand, permanently. ${colourDesc(s.colour)}`,
  };
  if (s?.kind === 'ratchet') return {
    head: 'Ratchet',
    body: 'Tap it, tap one letter, then tap the ratchet again to step that letter '
        + 'a single place along the alphabet.',
  };
  if (s?.kind === 'reshuffle') return {
    head: 'Reshuffle',
    body: 'Can be used to reroll offerings at the market and the Colophone.',
  };
  if (s?.kind === 'toolbox') return {
    head: 'Toolbox',
    body: 'Unwrap to gain two tools (space permitting).',
  };
  if (s?.kind === 'loupe') return {
    head: 'Loupe',
    body: `Double the value of a tile (to a max of ${LOUPE_CAP}).`,
  };
  if (s?.kind === 'laurel') return {
    head: 'Laurel',
    body: `Crowns a random seated patron. A crowned patron pays +${HONORIFIC_STEP} Points on every word, `
        + 'at its own turn in the running order — so a crown in front of your multipliers is multiplied '
        + 'by them. Patrons can balance an infinite number of laurels on their heads.',
  };
  if (s?.kind === 'tongs') return {
    head: 'Tongs',
    body: `Destroys a tile for good, and gives your next word +${TONGS_BONUS} Points.`,
  };
  if (s?.kind === 'wash') return {
    head: 'Ink wash',
    body: `Up to ${WASH_COUNT} unpainted tiles in your hand gain temporary paint, which `
        + 'washes off on printing.',
  };
  if (s?.kind === 'wrapped') return {
    head: 'A wrapped tile',
    body: 'Unwrap it mid-page to gain one rare tile, permanently.'
  };
  if (s?.kind === 'potion') return {
    head: 'Love potion',
    body: 'Uncork it and a RARE patron takes an empty seat at your table, free. '
        + 'Keeps until there is a seat to spare.',
  };
  if (s?.kind === 'package' && PACKAGES[s.theme]) {
    const p = PACKAGES[s.theme];
    return { head: p.label, body: p.body };
  }
  if (s?.kind === 'applicator' && APPLICATORS[s.material]) {
    const m = MATERIALS[s.material];
    return {
      head: `${APPLICATORS[s.material].label} applicator`,
      body: `Lays out two tiles from your hand; the one you pick is struck in ${m.metal.toLowerCase()}. ${m.desc}`,
    };
  }
  return null;
}
