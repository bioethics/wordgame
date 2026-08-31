// Tuning, tables and the small pure helpers everything else reads.
//
// THE WORDS ARE NOT HERE. Every label, name and description a player reads lives
// in js/text.js; this file holds the NUMBERS and marries the two at the bottom
// (see "Filling the copy's knobs"). To reword a trim, a metal, a stall or a
// tool, edit js/text.js — the shapes exported here keep their fields either way,
// so nothing downstream needs to know where the words came from.

import {
  TRIM_TEXT, NICK_TEXT, COLOUR_TEXT, COLOUR_DESC, MULT_TRACK_TEXT, MATERIAL_TEXT,
  SUNDRY_TEXT, TOOL_TEXT, APPLICATOR_TEXT, PACKAGE_TEXT, STALL_TEXT,
  LENGTH_FLOURISHES, LENGTH_FLOURISH_BEYOND,
  fillTable, fillKnobs, fillSlots,
} from './text.js';

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
  // The lone Q. It is NOT in BAG_COUNTS and no shop deals one, so no press
  // begins with it and none is ever handed to you: the ratchet steps a P or an
  // R into one, and the Punchcutter will cut one into the back of a dual. That
  // is the whole of the supply, which makes owning a Q an achievement rather
  // than an accident — and a mixed blessing, since almost every Q word in the
  // dictionary wants the U as well.
  Q:8,
  QU:10, R:1, S:1, T:1, U:2, V:6, W:6, X:8,
  Y:5, Z:8,
  // A ligature scores what its letters score apart — CH is C+H — so it buys a
  // tile slot, never free points. QU is Q+U, 8+2, exactly as it always was.
  ING:5, CH:7, CK:9, TH:5, WH:10,
  RAT:3,                    // R+A+T, exactly what the three would score apart
  '*': 0,                   // a rule is a mark on the copy, not a letter — see RULE
  '▨': 0,                   // a batter is ruined type — see BATTER
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

// Letters no shop or heap will ever hand you: each comes from one patron
// and nowhere else. RAT is The Rat Catcher's; OLOGY The Scientist's, only ever on
// loan; the fleuron sells at its own price (FLEURON_PRICE).
export const EXCLUSIVE_LETTERS = ['RAT', 'OLOGY', '☙', 'Þ', 'Ȝ', 'Ƿ', 'Æ', '‽', 'OO', 'FU', '*', '▨'];

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

// ─── The Usurer's book ────────────────────────────────────────────────────────
// He lends against the SEAT, not against interest: hiring him is the fee, and
// the single Coin over the loan is a formality he insists on. The debt is
// collected a little at a time as pages end — he takes what you have if you
// have less — and while a Coin of it stands he cannot be dismissed. Murder
// settles the account: a ghost has no use for money.
export const USURER = { loan: 15, owed: 16, collect: 4 };

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

// ─── The batter (a sort broken past use) ──────────────────────────────────────
// "Batter" is the trade's own word for type damaged past printing — a face
// bruised flat, a shoulder knocked in. This is one: worth NOTHING, spelling
// nothing, and like the fleuron it can only be set alone, so printing it spends
// a whole word of the page to put a ruined sort on the paper.
//
// Which would make it pure punishment but for one thing: it is a SORT, and the
// Abecedarian's case has a place for it (ABECEDARIAN_CASE below). Setting it
// once, ever, is worth its permanent step of Mult — so the right move with a
// batter is to print it the moment a cheap page can spare the word, and never
// think about it again. It comes out of the alley's shell game and nowhere
// else, which is why it is on EXCLUSIVE_LETTERS.
export const BATTER = '▨';

// Sorts that spell nothing and can only be set ALONE — the ornament and the
// ruin. Every gate that used to name the fleuron reads this instead, so a third
// one would need no new law (spellsAlone in js/main.js).
export const SOLO_SORTS = [FLEURON, BATTER];
export const isSolo     = L => SOLO_SORTS.includes(L);

// ─── The rules (the compositor's marks for emphasis) ──────────────────────────
// A pair of sorts that bracket a word and set it BOLD. They spell nothing, take
// no place in the measure, and are worth no Points — what they buy is the
// multiplier, and they only buy it TOGETHER, one at each end of the word.
//
// Which is the whole of why they work where a single mark would not: one piece
// that modifies its neighbour always has a best slot, so placing it is a sum.
// A pair that must bracket the WHOLE word has exactly one legal arrangement, so
// there is nothing to place and everything to decide — which word deserves it,
// and whether to hold two places in the hand until that word comes.
//
// They cost twice over: two places in the hand while they are held, and two
// sorts in the case that spell nothing, so every draw that hands you one is a
// draw that did not hand you a letter. A single rule is worth nothing at all.
export const RULE       = '*';
export const isRule     = L => L === RULE;
export const BOLD_MULT  = 2;     // the multiplier a bracketed word is set at
export const RULE_PACK_PRICE  = 4;
export const RULE_PACK_CHANCE = 0.15;   // odds a Market tile slot holds the pair

export const FLEURON_PRICE        = 3;
export const FLEURON_PAGE_COIN    = 1;     // paid per fleuron owned, every page
export const FLEURON_OFFER_CHANCE = 0.12;  // odds a Market tile slot holds one

// ─── The quire (a gathering of sorts, sold as one) ───────────────────────────
// A quire is a gathering of sheets folded together, and this is one: three sorts
// bought as a lot, taking a single tile slot at the fair (QUIRE_OFFER_CHANCE,
// the same door the fleuron uses).
//
//   · one WELL DRESSED — QUIRE_DRESSED features, rolled out of the four the
//     fair deals in (paint, trim, nick, a second face). Only 12% of ordinary
//     offers carry three, so this is the draw: a tile you could not reliably
//     buy on the row however long you looked.
//   · one with a SINGLE feature.
//   · one BARE, and the bare one is the point.
//
// No metal, ever — addRandomFeature does not deal in them, so rare materials
// stay the alley's alone and the Black Market keeps a pillar it is charging a
// Colophon pick for.
//
// Bought separately the three run to about 14 Coins, so QUIRE_PRICE is a deal
// of some size; what you are paying for the discount with is CHOICE, since you
// pick neither the letters nor which features land. And with the cruft: every
// other road in the game TAKES tiles out of a press (the smelter, the tongs,
// the Serpent's meal, a squib), so a run trends slimmer and cleaner the longer
// it goes. This is the one road that puts ballast back in — which is what makes
// the smelter's fee and the Composter's heap matter again.
export const QUIRE_PRICE         = 8;
export const QUIRE_OFFER_CHANCE  = 0.12;
export const QUIRE_DRESSED       = 3;    // features on the good sort
export const QUIRE_MIDDLING      = 1;    // …and on the second

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

// Which letters may share a slug with this one. The Punchcutter cuts the second
// face, the Market sells duals ready-cut, and the Powder Editor's charges come
// double-sided — all three ask the same question, so it is answered here.
// Faces stay within two points of each other so a dual can't smuggle in a Z;
// no fleuron on either face ("it prints alone" has to stay the whole truth) and
// nothing on EXCLUSIVE_LETTERS, or a thorn would end up cut into the back of a Z
// — the Medievalist's stock without the Medievalist.
export function dualPairsFor(letter) {
  const pts = TILE_POINTS[letter] ?? 1;
  return Object.keys(TILE_POINTS)
    .filter(l => l !== letter && l.length === 1 && !isMark(l) && l !== FLEURON
              && !EXCLUSIVE_LETTERS.includes(l)
              && Math.abs(TILE_POINTS[l] - pts) <= 2);
}

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
  crimson: { label: COLOUR_TEXT.crimson.label, glyph: '#b23a2e', bright: '#ff9d8e' },
  azure:   { label: COLOUR_TEXT.azure.label,   glyph: '#2e6fb2', bright: '#8ec6ff' },
  jade:    { label: COLOUR_TEXT.jade.label,    glyph: '#2d8a5c', bright: '#90e8ba' },
  amber:   { label: COLOUR_TEXT.amber.label,   glyph: '#a87010', bright: '#ffd68c' },
};

export const colourDesc = c => fillSlots(COLOUR_DESC, COLOURS[c].label);

// Every multiplier the readout keeps a chip for — the paints plus the ones that
// come from somewhere other than paint. Score steps look their `colour` up here.
export const MULT_TRACKS = {
  ...COLOURS,
  purple: { label: MULT_TRACK_TEXT.purple.label, glyph: '#8a5fb0', bright: '#cfa6ff' },
  cursed: { label: MULT_TRACK_TEXT.cursed.label, glyph: '#c93c2d', bright: '#ff7a66' },
  length: { label: MULT_TRACK_TEXT.length.label, glyph: '#7d8fa0', bright: '#d9e6f2' },   // type-metal steel
  primed: { label: MULT_TRACK_TEXT.primed.label, glyph: '#3f7a6d', bright: '#9fe6d4' },   // armed, not earned
  explosive: { label: MULT_TRACK_TEXT.explosive.label, glyph: '#d96f1f', bright: '#ffb066' },   // squib lead
};

// Tiles painted by one Colophon paint pick — random, and only unpainted ones.
export const PAINT_PER_POT   = 3;

// ─── Sundries (consumables kept on the workbench) ─────────────────────────────
// Bought at the Shop, spent mid-page. A paint tube is the first kind: uncork it
// and one random unpainted tile in hand takes the colour, permanently. The tile
// is the paint's choice — aimed paint only ever hit the same four workhorses.
export const SUNDRY_SLOTS  = 2;   // sundries the workbench can hold
// Three, against a shop stocking eight kinds — four tubes, the reshuffle, the
// ratchet, the toolbox and the bodkin, with a wrapped tile displacing one about
// half the time. At two slots any particular one showed up a quarter of the
// time, which is not often enough to build towards; at three it is over a third,
// and the workbench still only holds SUNDRY_SLOTS, so the choice stays a choice.
export const SUNDRY_OFFERS = 3;   // sundries offered per shop

// ─── The registers' packages ──────────────────────────────────────────────────
// The four register patrons pay ×3 Mult for a word on their list, a condition you
// cannot plan for (the lists run 6–10% of the dictionary). So the ×3 keeps a parcel
// behind it: PACKAGE_ODDS that a package lands on the workbench, rolled once per
// firing register, and a full bench turns the gift away. A package is a sundry
// like any other — the Market buys it back for SUNDRY_SELL. Loot tables are
// weighted [id, weight] pairs, resolved in js/main.js (openPackage).
export const PACKAGE_ODDS = 2 / 3;

// "2-in-3", "1-in-4" — the smallest denominator that lands within half a percent
// of the real odds, so a card can never quote a chance the code doesn't run.
export const oddsText = p => {
  for (let d = 1; d <= 12; d++) {
    const n = Math.round(p * d);
    if (n && Math.abs(n / d - p) < 0.005) return `${n}-in-${d}`;
  }
  return `${Math.round(p * 100)}-in-100`;
};

// Which patron sends which parcel, and what is in it. The parcels' NAMES and
// the sentences describing them are in js/text.js; the loot tables are the
// mechanism and stay here. Weighted [id, weight] pairs, resolved by openPackage
// in js/main.js.
//
// Two weightings worth keeping: grave goods lean away from the cursed OO,
// because a cursed tile can never be discarded and a Sexton collecting one per
// third parcel would brick their own hand; the party bag leans towards the rose
// tile, The Poppet's list being the smallest of the four and its parcels the
// rarest.
export const PACKAGES = {
  romantic: { ...PACKAGE_TEXT.romantic, patron: 'paramour',   emoji: '💌',
              loot: [['xotile', 3], ['potion', 3], ['tube-crimson', 3]] },
  spooky:   { ...PACKAGE_TEXT.spooky,   patron: 'sexton',     emoji: '⚰️',
              loot: [['oo-ghost', 3], ['oo-cursed', 2], ['tube-azure', 3]] },
  cute:     { ...PACKAGE_TEXT.cute,     patron: 'poppet',     emoji: '🎁',
              loot: [['rosetile', 4], ['applicator-rainbow', 3], ['wash', 2]] },
  rude:     { ...PACKAGE_TEXT.rude,     patron: 'vulgarian',  emoji: '📦',
              loot: [['tongs', 3], ['applicator-cursed', 3], ['futile', 3]] },
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
// What a laurel is worth on TOP of that while The Laureate is seated: +Mult per
// laurel, to whoever wears it, paid at that wearer's own turn beside its Points.
// He does not hoard it — his own crowns count like anyone else's — so the seat
// is worth most to a table already wearing laurels, and worth nothing at all on
// a bare one. Additive rather than multiplying, and small, because laurels
// arrive from several sources at once and a whole table of them compounds fast:
// at +0.1 a seat wearing three is +0.3, and the Colophon can crown all night.
export const LAUREATE_MULT_STEP = 0.1;
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
  bodkin:  { glyph: '🪡', label: TOOL_TEXT.bodkin },
  toolbox: { glyph: '🧰', label: TOOL_TEXT.toolbox },
  loupe:   { glyph: '🔍', label: TOOL_TEXT.loupe },
  laurel:  { glyph: '🏵️', label: TOOL_TEXT.laurel },
  tongs:   { glyph: '🗜️', label: TOOL_TEXT.tongs },
  wash:    { glyph: '💧', label: TOOL_TEXT.wash },
  potion:  { glyph: '🧪', label: TOOL_TEXT.potion },
};

// The applicators strike one tile in hand into a new material. Like the tube, the
// tool lays out two candidates and you choose, so the gift can never be aimed at
// the one tile that would break the game. A tile already cast is refused: a sort
// is cast in one metal, not two.
export const APPLICATORS = {
  rainbow: { glyph: '🌈', label: APPLICATOR_TEXT.rainbow },
  cursed:  { glyph: '🩸', label: APPLICATOR_TEXT.cursed },
};
// Patrons offered per Market. Scale with the roster: too few offers against a big
// roster shows a thin slice of the game and makes guild assembly unreliable.
export const PATRON_OFFERS = 4;
// Tiles laid out on the Market's own row, before the Medievalist's extra stall
// slot and before The Purveyor widens it.
export const MARKET_TILE_OFFERS = 4;
export const TUBE_PRICE    = 2;
export const SUNDRY_SELL   = 1;   // what the Market pays to take one back
export const RATCHET_PRICE = 3;   // the ratchet: one letter, one step either way
// The bodkin: the compositor's needle, for picking one sort out of the case. The
// dearest sundry, and deliberately — every other one improves a tile you happened
// to draw, where this decides WHICH tile you draw. It answers a Deadline's
// measure, finishes the Prince's cypher, feeds the Wordler his own word, and
// walks straight past the two seats that bend the draw (the Magpie, the Mako).
export const BODKIN_PRICE  = 5;

// "one tile" / "2 tiles" — keeps counted copy reading right
export const tileCount = n => n === 1 ? 'one tile' : `${n} tiles`;

// ─── Stalls ───────────────────────────────────────────────────────────────────
// Two pitch up at each shop. A stall's price starts at its base and doubles with
// every purchase, resetting when the next shop opens. Nothing opens under 2, or
// the interesting question — is this worth the doubling? — never gets asked.
export const STALLS_PER_SHOP = 2;
export const PROPOSAL_RANGE  = 6;    // tiles a proposal stall lays out at a time
export const SMELT_MIN_COLLECTION = 12;

// Names and words in js/text.js; the opening price is the mechanism and lives
// here. The Stereotyper opens at 4 where its neighbours open at 2-3: a copy
// inherits every feature the original carries, so duplicating a loaded tile
// beats any single improvement the other stalls sell.
export const STALL_DEFS = {
  smelter:     { ...STALL_TEXT.smelter,     base: 2 },
  painter:     { ...STALL_TEXT.painter,     base: 2 },
  gilder:      { ...STALL_TEXT.gilder,      base: 2 },
  punchcutter: { ...STALL_TEXT.punchcutter, base: 2 },
  dresser:     { ...STALL_TEXT.dresser,     base: 3 },
  stereotyper: { ...STALL_TEXT.stereotyper, base: 4 },
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
// Prices here, words in js/text.js — the knobs in the descriptions are filled at
// the foot of this file.
// `price` is what the finery ADDS to a tile's asking price at the Market (see
// tilePrice in js/market.js) — the stalls charge their own bases, so these move
// the shop's tiles and nothing else. Trimmed down a step in 2026: a tile
// wearing two features was asking double figures, which is a lot for one sort.
export const TRIMS = {
  gold:    { ...TRIM_TEXT.gold,   price: 2 },
  silver:  { ...TRIM_TEXT.silver, price: 2 },
  cobalt:  { ...TRIM_TEXT.cobalt, price: 2 },
  purple:  { ...TRIM_TEXT.purple, price: 3 },
};

// Half a step where a painted letter is a whole one: one purple trim gives ×1.5,
// two ×2. It stacks with paint on the same tile, and patrons add to it.
export const PURPLE_TRIM_STEP = 0.5;

// ─── Nicks (a notch cut out of one edge of the tile) ──────────────────────────
// A nick reads every tile on the side it points to and adds their Points to its
// own — so a right nick on the first letter scores the rest of the word twice,
// and a left nick on a trailing ‽ reaches back over everything before it. Patron
// tile bonuses (the tileBonus pass in scoring.js) are on the tiles by then, so
// they are read too.
//
// Nicks DO stack, and are meant to: two of them each read their own side and
// each take their own sum. What stops that compounding away is the resting rule
// — a tile that carries a nick of its own is read at its RESTING value, the
// number it wears in the hand (face + growth + a silver trim, restingPoints in
// js/state.js). So a nick never reads another nick's winnings, only the tile
// underneath, and a row of nicks adds up instead of multiplying up.
export const NICKS = {
  right: { ...NICK_TEXT.right, price: 3 },
  left:  { ...NICK_TEXT.left,  price: 3 },
};

// ─── The Lye Boy's bucket ─────────────────────────────────────────────────────
// He scrubs every coat off the tiles of a printed word and keeps a little Mult
// for each one, for good. What he is really selling is a CONVERSION: paint is
// the game's multiplicative engine — three crimson tiles are ×4, and the colours
// multiply across each other, so a well-dressed word reaches ×12 and past it —
// and he trades all of that for an additive number that never needs the right
// tile in the right word and never stops growing.
//
// Which means the step has to be paid honestly. A committed run feeds him
// perhaps forty or fifty coats (bought paint, a wash pot, a painting seat), and
// at a quarter each that lands near +12 Mult — about what a good colour build
// was worth, only permanent and drawn from every word instead of the lucky ones.
//
// ONE BAND on purpose: this is meant to be played with before it is capped. The
// Beekeeper and the Abecedarian both needed slowing in the end, and when this
// one does, it is a row in the table below and nothing else — the card quotes
// the whole of it through lyeBoySteps().
export const LYE_BOY_BANDS = [
  { upTo: Infinity, step: 0.25 },
];
export const LYE_BOY_STEP = LYE_BOY_BANDS[0].step;   // the first band's step, quoted on the card
export const lyeBoyMult = coats => walkBands(coats, LYE_BOY_BANDS, { base: 0, by: 'total' });
export const lyeBoySteps = () => bandSentence(LYE_BOY_BANDS, '+');

// ─── The Serpent's appetite ───────────────────────────────────────────────────
// The odds the S at the end of a word is swallowed. The ×2 is paid either way,
// so this is the only thing standing between the seat and a flat tax on every
// plural you own: at even money an S word stops being a road you never take and
// becomes a bet you decide to run. Raise it towards 1 to make the seat greedier;
// the ×2 does not move with it.
export const SERPENT_EAT_ODDS = 0.5;

// …and what every S in the word is worth to him, eaten or not. Small on purpose:
// the seat's payoff is still the ×2, and this is only there so he is not SILENT
// on the two words in three that hold an S without ending in one. Half the
// dictionary holds an S, so the card now lights up on half your words instead
// of under a third of them — and because it lands on the tile (the tileBonus
// pass), the corner number moves as you compose, which is the whole point.
//
// It is worth more than it looks on exactly the words the seat is built for:
// tileBonus pays in pass 1½ and his ×2 is a patron multiplier in pass 4, so an
// ends-in-S word (1.31 S's on average) takes about +4 Points and then has them
// doubled by his own hand.
export const SERPENT_POINTS = 3;

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

// The cheer for a long word. The lines themselves are in js/text.js; re-exported
// here because scoring and the board both reach for them through constants.
export { LENGTH_FLOURISHES, LENGTH_FLOURISH_BEYOND };
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
  stepTwin:   520,   // The Twins recasting a pair, before the word is even read
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

// Words in js/text.js; this is only which metals exist and what they wear on
// the board. The long notes on why blind and rose are what they are:
//   blind — struck into the paper carrying no ink, so the letter is felt and
//           never seen. The metal a silent letter is recast in: The Silent
//           Knight strikes them, and the alley sells them. What it DOES follows
//           from what it is — a letter the desk cannot see, so a word carrying
//           one is never spiked (scoring.js pass 4¾, beside the Knight's own
//           argument, which it generalises from the seat to the sort). It was
//           inert for a long while and the card admitted as much; this is the
//           effect that note was waiting for.
//   rose  — a real alloy, soft enough to melt in boiling water, so no press
//           could set a page in it. Out of The Poppet's party bag only.
export const MATERIALS = {
  cursed:  { ...MATERIAL_TEXT.cursed,  emoji: '🩸' },
  ghost:   { ...MATERIAL_TEXT.ghost,   emoji: '👻' },
  rainbow: { ...MATERIAL_TEXT.rainbow, emoji: '🌈' },
  blind:   { ...MATERIAL_TEXT.blind,   emoji: '\u25cc' },
  rose:    { ...MATERIAL_TEXT.rose,    emoji: '🎀' },
  explosive: { ...MATERIAL_TEXT.explosive, emoji: '💥' },
};

// Tiles nothing can be done to: a ghost; any tile an editor has merely lent you
// (see js/bosses.js) — no collection template stands behind a lent tile, so paint
// laid on one would look permanent and evaporate with the page; and a tile The
// Redactor has wrapped. (`wrapped` is isWrapped in state.js; checked bare here
// because constants.js is a leaf and imports from nobody.)
export const isImmutable = tile =>
  tile?.material === 'ghost' || !!tile?.ephemeral || !!tile?.wrapped || !!tile?.counterfeit;

// ─── The Editors (Deadline bosses — see js/bosses.js) ─────────────────────────
// A word that breaks the seated editor's rule is SPIKED: printed and counted, but
// at this fraction of its score. Soft on purpose — a cost to weigh, not a wall.
// Scoring applies it as a visible ×Mult step; the editor's bar quotes it.
export const SPIKE_MULT = 0.2;

// ─── Squib lead (the explosive sort) ──────────────────────────────────────────
// ×Mult per squib in the word, paid with the colour multipliers — and then the
// charge goes off in the commit (detonatePrinted in js/main.js): the tile
// itself is always destroyed, and each tile BESIDE it in the word rolls
// EXPLOSIVE_SPREAD_ODDS to be destroyed with it, independently. Set at either
// end of the word it stands beside only one tile, which is the whole of the
// play: the multiplier costs the squib and a coin flip, and where the flip
// lands is up to you.
export const EXPLOSIVE_MULT        = 2;
export const EXPLOSIVE_SPREAD_ODDS = 0.5;

// ─── The Powdermonkey's primed tile ───────────────────────────────────────────
// He keeps one tile of the hand primed — it SCORES and GOES OFF exactly as squib
// lead does, without being cast in it — and marks a fresh one every time the
// hand changes (primeSquib in js/state.js, called from drawUpToRackSize, the one
// door every draw comes through). Re-marking per hand rather than holding until
// spent is the whole of what makes him playable: a mark that stuck to your best
// tile would simply be a dead seat until you gave in, where a mark that moves is
// a fresh offer every hand — sometimes junk worth cashing, sometimes a tile you
// step around.
//
// He has a shape over a run worth keeping: early your bag is mostly ballast and
// feeding him costs nothing, and late every tile you own is dressed and grown,
// so the same ×Mult asks a real price. A seat that gets DEARER as the run goes
// on is rare, and it is the reason this one is not simply free Mult.

// ─── The Quoin's lock ─────────────────────────────────────────────────────────
// A quoin is the wedge that locks a forme of type tight, and this seat pays for
// type that sits tight: two tiles of one colour SIDE BY SIDE in the word.
//
// It is the one patron that reads position, and the constraint is real because a
// word's order is its spelling — you cannot shuffle the tiles to suit. So the
// build is to paint letters that turn up ADJACENT: a doubled letter (21% of
// words hold one) or both halves of a bigram you keep drawing (ER, IN, ES, ED).
//
// The number is set against the colour engine, which pays for SPREADING colour
// (one of each is ×16) and punishes stacking it (four of one is ×5). At ×3 this
// makes two-of-a-colour beat two spread (×9 against ×4) and four-of-a-colour
// pull level with four spread (×15 against ×16) — so it opens the build nobody
// plays without breaking the one everybody does.
//
// It reads countsAsColour, not getActiveColour, which is deliberate: a rainbow
// tile counts as every colour, so one beside ANY painted tile locks the forme.
// That is a real job in the multiplier game for a metal that has never had one.
export const QUOIN_MULT = 3;

// ─── The Goldsmith's purse ────────────────────────────────────────────────────
// +Points on every amber tile, and a roll of the dice on each one besides.
//
// The Points are the part that decays — worth a great deal against a first-page
// quota of 30 and nothing at all against a late one in the tens of thousands —
// so the seat used to die by chapter three. The purse is the part that does not:
// Coins keep their value, and the prices that matter late (the alley's stalls
// double with every use) are paid in them.
//
// Rolled PER AMBER TILE, which is what makes the seat scale with commitment
// rather than sitting flat. The arithmetic over a run of ~90 words, against a
// lifetime income of about 300 Coins:
//
//   1 amber tile a word →  3.0% a word ·  2.7 payouts · +27% lifetime income
//   3 amber tiles       →  8.7% a word ·  8.1 payouts · +81%
//   5 amber tiles       → 14.1% a word · 13.5 payouts · +135%
//
// That top line is a lot, and it is allowed to be for two reasons: the amber
// guild IS the money guild, so its signature common should pay in money; and
// Coins have hard diminishing returns here, because the alley caps a tile at
// BLACK_TILE_MAX_PRICE and there is only so much to buy. If a run stops caring
// about Coins by chapter seven, the ODDS are the knob to turn, not the purse.
// ─── Relief from the quota ────────────────────────────────────────────────────
// Two seats bring the bar DOWN instead of climbing it, which is the one axis the
// roster never touched: every other patron pays you more, and these two ask for
// less. They stack, and both are read where the page's quota is set (startPage
// in js/state.js).
//
// The Almoner shaves a slice off the CURRENT page when a word of hers prints —
// a one-page reprieve, big and immediate. The Gardener's relief is permanent and
// accumulates over the whole run, approaching but never reaching GARDENER_CAP:
// each jade sort printed takes GARDENER_RATE of whatever is still on the table,
// so the first is worth about 1% and the thousandth almost nothing. That shape
// is the point — a discount that could reach 100% would end the game, and one
// that climbed in a straight line would make the last chapters a formality.
export const ALMONER_RELIEF = 0.15;   // the Generic's effect, on this page only
export const GARDENER_CAP   = 0.5;    // the Gardener can never pass this
export const GARDENER_RATE  = 0.02;   // …and takes this share of the gap per jade sort
export const gardenerRelief = seen =>
  Math.round(GARDENER_CAP * (1 - (1 - GARDENER_RATE) ** (seen ?? 0)) * 10000) / 10000;

// ─── The Spendthrift's ledger ─────────────────────────────────────────────────
// Coins SPENT, not coins held — the other half of a ledger whose first half (the
// reward's interest) already pays you for hoarding. Every SPENDTHRIFT_STEP that
// leaves the purse writes Points into one sort of the collection, for good, and
// the amount is the chapter number, so the same seat pays more the deeper the
// run goes. It reads state.coinsSpent, maintained by spendCoins in js/state.js —
// the one door every purchase in the game goes through.
export const SPENDTHRIFT_STEP = 5;

// ─── The Alderman's opposite: the Beadle's thresholds ────────────────────────
// Where the Alderman pays Mult for BREADTH of livery, the Beadle pays favours
// for DEPTH: two seats of a colour and that guild's stall opens its door. Two is
// the number because it is the first count that cannot happen by accident.
export const BEADLE_THRESHOLD = 2;
export const BEADLE_PAGE_COIN = 1;   // what two ambers pay, every page

export const GOLDSMITH_POINTS = 3;
export const GOLDSMITH_ODDS   = 0.03;   // per amber tile in the word
export const GOLDSMITH_PURSE  = 30;

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

// ─── Banded curves ────────────────────────────────────────────────────────────
// Two seats grow a figure one step at a time and want that step to CHANGE as
// the figure grows — the Beekeeper's hive slows as it fills, the Abecedarian's
// case quickens. They are the same idea read in opposite directions, so they
// share one table shape and one walker rather than each rolling its own.
//
// A band table is `[{ upTo, step }, …]` in order: while the reading is under
// `upTo`, each step adds `step`; the last band has no ceiling. What the reading
// IS differs, which is the only parameter:
//
//   by: 'total'   the running figure itself — the Beekeeper, whose hive slows
//                 once the MULTIPLIER passes ×2 and again past ×3
//   by: 'count'   how many steps have been taken — the Abecedarian, whose case
//                 quickens once the fifteenth SORT is in it
//
// Walked one step at a time on purpose: a step that crosses a threshold pays
// the new rate for the rest of itself rather than the whole of it, so the curve
// has no jumps in it wherever you happen to land.
export function walkBands(n, bands, { base = 0, by = 'total' } = {}) {
  let total = base;
  for (let i = 0; i < n; i++) {
    const reading = by === 'count' ? i : total;
    const band = bands.find(b => reading < b.upTo) ?? bands[bands.length - 1];
    total += band.step;
  }
  return Math.round(total * 100) / 100;
}

// The same table said aloud, so a card can never drift from the arithmetic:
// "+0.2 Mult, then +0.1 past ×2, then +0.05 past ×3". `unit` is what the
// thresholds are counted in as the card says them ('×' for the hive, '' for a
// plain count of sorts).
export const bandSentence = (bands, unit = '') => bands
  .map((b, i) => (i === 0
    ? `+${b.step}`
    : `+${b.step} past ${unit}${bands[i - 1].upTo}`))
  .join(', then ');

// ─── The Beekeeper's hive ─────────────────────────────────────────────────────
// A permanent ×Mult that grows with every B printed — and the one seat that had
// no ceiling at all, so a press built to spell B's ran away with the run. It
// keeps its early pace and then slows twice: full steps up to the first
// threshold, half steps to the second, quarter steps for ever after. So the
// tenth bee is still worth catching and the fiftieth is not a different game.
//
// The bands are read in order, each { upTo, step }: the step applies while the
// multiplier is under `upTo`, and the last band has no ceiling. Retuning is a
// number here — the card quotes all of it through beekeeperCard().
export const BEEKEEPER_BASE  = 1;
export const BEEKEEPER_BANDS = [
  { upTo: 2, step: 0.2 },
  { upTo: 3, step: 0.1 },
  { upTo: Infinity, step: 0.05 },
];

// What `bees` bees are worth. The thresholds are read against the multiplier
// itself, so the hive slows as it fills.
export const beekeeperMult = (bees = 0) =>
  walkBands(bees, BEEKEEPER_BANDS, { base: BEEKEEPER_BASE, by: 'total' });

export const beekeeperSteps = () => bandSentence(BEEKEEPER_BANDS, '×');

export const BEEKEEPER_STEP     = 0.2;    // the first band's step — quoted on the card

// ─── The Alderman's guilds ────────────────────────────────────────────────────
// +Mult per guild flying a livery at your table, ADDED once per guild rather
// than multiplied: four guilds are +2 Mult, not ×5. He used to multiply, and a
// full table of liveries turned him into the whole run — the seat is paid for
// BREADTH, and breadth should be worth a good deal without being worth
// everything.
export const ALDERMAN_STEP      = 0.5;
export const ARSONIST_ODDS      = { paint: 0.10, burn: 0.01 };  // per tile played
export const NUDIST_TRIM_CHANCE = 0.25;   // per bare letter in an all-bare word
// A bare tile that misses the trim may still catch a colour — half the trim's
// rate, because paint is worth more.
export const NUDIST_PAINT_CHANCE = 0.125;
// The Child's trellis: permanent Points per tile of a three-letter word. (Named
// the Abecedarian until the case below took the name — an abecedarian is
// properly a primer of the alphabet, which is what the new seat keeps; a child
// is what learns from it, which is what this one is.)
export const CHILD_STEP         = 1;

// ─── The Abecedarian's case ───────────────────────────────────────────────────
// Every sort the press can put on a page, once each, for good. +Mult per sort
// the run has never pressed before — the one seat in the game that pays for
// BREADTH, where everything else pays for doubling down.
//
// The case is every sort the press can set — see ABECEDARIAN_CASE below, which
// is built from the game's own tables. Add a sort to the game and the ceiling
// rises on its own, which is the point of counting the case rather than a fixed
// list.
//
// The seat is the Beekeeper's mirror: where the hive SLOWS as it fills, the
// case QUICKENS. Both walk a band table (walkBands, above); the only difference
// is what the thresholds are read against — the hive against its own
// multiplier, the case against how many sorts are in it.
//
// Quickening is the right shape for a collection, and for a reason worth
// writing down. A collection's last places are its dearest by construction:
// the alphabet turns up on its own, but RAT waits on The Rat Catcher, OLOGY on
// The Scientist, OO and FU on two registers' parcels, the interrobang on a cut
// and the Q on the ratchet. A flat rate pays most for the sorts that cost you
// nothing and least for the ones you went out and got. This pays the other way
// round — and it turns a half-filled case from a sunk cost into a reason to go
// hunting, which is what the seat is FOR.
//
// The case is 45 places and the bands fall on its thirds, so the sentence stays
// short: +0.03 a sort, +0.05 past fifteen, +0.08 past thirty. A complete case is
// +2.4 Mult — the top of the range any single seat pays, which is where the
// hardest collection in the game belongs, and no further. (It was briefly
// +4.5, on bands of 0.05/0.1/0.15. That was not a top-tier seat, it was the
// whole run: an additive +4.5 lands as a ×5.5 on everything the table has said
// in front of it.)
//
// The early rate is lower than the flat +0.05 this seat used to pay, and that
// is right rather than a nerf by stealth: the case counts SORTS now, so a
// ligature or a mark fills a place that a letter alone used to, and the first
// dozen places come in faster than they ever did.
export const ABECEDARIAN_BANDS = [
  { upTo: 15, step: 0.03 },
  { upTo: 30, step: 0.05 },
  { upTo: Infinity, step: 0.08 },
];

// What a case of `sorts` sorts is worth. Read by count, so each place is worth
// more than the one before it.
export const abecedarianMult = (sorts = 0) =>
  walkBands(sorts, ABECEDARIAN_BANDS, { by: 'count' });

export const abecedarianSteps = () => bandSentence(ABECEDARIAN_BANDS);

// The first band's step, quoted on the card as what a sort is worth to begin
// with. Kept as its own name because several places want just that number.
export const ABECEDARIAN_MULT   = ABECEDARIAN_BANDS[0].step;

// The Astronomer's step, per word already printed this page. Additive: over a
// five-word page it builds 0 · 0.5 · 1 · 1.5 · 2, so the seat pays for holding
// its best word back rather than for opening with it.
export const ASTRONOMER_STEP    = 0.5;

// The Glover's matched pair: a colour worn by EXACTLY two tiles in the word, no
// more and no fewer, and paid per colour that manages it — so a word wearing two
// crimson and two jade pays twice.
export const GLOVER_STEP        = 0.5;

// The Typesetter's fee, per NON-STANDARD sort in the word — anything that is not
// a plain single letter of the alphabet. Ligatures (ING, QU, RAT), the medieval
// sorts, the marks, the fleuron and the interrobang all qualify; A to Z does not.
// A wider net than the ligatures alone, hence the smaller step.
export const TYPESETTER_STEP    = 0.2;

// The Expectant Parents' fee for a name.
export const EXPECTANTS_BONUS   = 15;

// The cat's Mult, added per RAT tile it has eaten. Permanent and stacking, and
// paid from the word AFTER the meal — the eating happens once a word has
// printed, like every other permanent gain. Small on purpose: the cat is free,
// found rather than bought, and RAT tiles arrive a page at a time from the Rat
// Catcher, so this is a slow engine that rewards keeping both seats rather than
// a windfall for one lucky word.
export const SHORTHAIR_MULT     = 0.2;

// The Cartographer reads the VOWELS of a word and asks that they run in
// alphabetical order — A before E before I before O before U — counting each
// TILE once, so the OO ligature is a single O and two separate O tiles are two.
// A word needs at least this many vowel-bearing tiles for them to "run" at all;
// below it there is no order to be in and nothing is paid.
export const CARTOGRAPHER_MULT       = 2;
export const CARTOGRAPHER_MIN_VOWELS = 2;
// The Twins' due, paid once per doubled letter in the word. The Points are the
// smaller half of the seat: the CLONE is what the pair is really for (twinPairs
// in js/patrons.js, and scoring's pass ⅓).
export const TWINS_POINTS       = 5;
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
// state.ghosts, where the victim goes on working. Matching is EXACT, so the
// whole word has to be one of these: SLAYER and KILLED walk past him.
//
// Keep them short and settable from an ordinary rack, so the seat is a decision
// rather than a lottery — DIE is the floor, three letters off three of the
// commonest sorts in the case, and nothing here asks for more than one scarce
// letter. Every word must earn its meaning too: a watchword that reads as
// ordinary English (END, CUT) would fire on a word set for score, and the knife
// should never be a surprise. Anything added here lengthens the Ripper's card,
// which quotes the whole list through the {RIPPER_WORDS} knob.
export const RIPPER_WORDS = [
  'KILL', 'MURDER', 'SLAY', 'DIE', 'STAB', 'SLASH', 'REAP', 'KNIFE',
];
// The Headsman: permanent ×Mult per patron dismissed while he is seated.
export const HEADSMAN_STEP = 0.2;
// The Gambler's coin, tossed once per word, not per keystroke: scoring runs on
// every letter laid to drive the live preview, so a roll inside the score effect
// would flicker and then disagree with what printed (rollGamble in state.js).
export const GAMBLER_ODDS       = 0.5;    // odds the coin comes up ×2
export const NEOLOGIST_LENGTH   = 6;      // letters in a coined word
export const DYE_TILES_PER_CHAPTER = 2;   // tiles painted by a dye patron at chapter end

// The Composter's heap: destroyed tiles rot down into jade ones, freshest kept.
// The heap holds the freshest COMPOST_HEAP_MAX and nothing else limits it: you
// may take every tile on it, every visit. What rations The Composter is the
// DESTRUCTION — a tile only reaches the heap because one was destroyed (see
// trashFromCollection in js/state.js) — so the seat is worth exactly as much as
// the burning you are already doing, and worth nothing to a press that burns
// nothing. That is the whole of the design; a per-visit cap on top of it only
// made a crimson build wait.
export const COMPOST_HEAP_MAX = 6;        // tiles the heap can hold at once

// ─── The star-crossed lovers ──────────────────────────────────────────────────
// Two houses, both alike in dignity — and both, as it happens, the guilds the
// roster carries most of: jade and amber lead the Market's pool by weight, so a
// player is likelier to have those paints on the tiles than any other pair.
//
// Apart, each lover pays for a word wearing their own house's colour with none
// of the rival's — the other two guilds are nobody's business in this quarrel.
// Hold both at once and neither keeps a seat: they leave the shelf together and
// the merged seat below takes their place — the only door to it, since its card
// is `unlisted` and no Market stocks it. The marriage itself is marryLovers in
// js/state.js; the ids live here because state, market and patrons all need to
// agree on them.
export const LOVERS = {
  pair:   ['romeo', 'juliet'],   // must be seated together for the wedding
  merged: 'lovers',              // what takes their place
  apart:  1.5,                   // ×Mult a lover pays alone
  united: 2,                     // ×Mult the merged seat pays
};

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

// ─── The Bribrarian's rate ────────────────────────────────────────────────────
// The one editor with no rule to satisfy: he spikes EVERY word, and the only
// lever is money. His pen opens at the standard spike (×SPIKE_MULT — an 80%
// penalty) and each Coin laid down buys a fifth of it back, so four Coins clear
// him entirely. Deliberately affordable: a Deadline page pays around eight
// Coins, so the bribe is never impossible — it simply costs you the Market you
// were saving for, and you may go into the RED to pay it, which costs you the
// next Market as well (every purchase in js/market.js already refuses a purse
// that cannot cover it, so debt needs no punishment of its own).
export const BRIBRARIAN = {
  steps: 4,      // Coins that clear the penalty outright
  step:  0.2,    // what each Coin buys back
};

// What the Bribrarian's pen does to a word, given what has been laid down.
// Read by his mood() in js/bosses.js and by the sheet that takes the money.
export const bribeMult = paid =>
  Math.round(Math.min(1, SPIKE_MULT + BRIBRARIAN.step * Math.max(0, paid)) * 100) / 100;

// Every sort the Abecedarian keeps a place for, in the order the case is laid
// out. Built from the tables above rather than written out, so a sort added to
// the press is a place added here without anyone remembering to.
//
// It keeps a place for EVERY tile the press can set, not merely every letter:
// the alphabet (the lone Q included, which no bag holds and no shop sells), all
// ten ligatures, both marks, the interrobang, the four medieval sorts, the
// fleuron and the rule. That is the seat's whole idea taken seriously — it is
// paid for BREADTH, so the case should be the breadth of the press rather than
// the breadth of the alphabet. Several of the places can only be filled by
// going and getting them: RAT comes from The Rat Catcher, OLOGY is lent by The
// Scientist and never owned, OO and FU fall out of two registers' parcels, the
// interrobang has to be cut, and the Q has to be made on the ratchet. A
// complete case is a genuine collection, and every place in it is +0.05.
export const ABECEDARIAN_CASE = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  ...LIGATURES,
  ...MARKS,
  INTERROBANG,
  ...Object.keys(MEDIEVAL),
  FLEURON,
  RULE,
  BATTER,
];

// What a printed tile gives up to the case: ITSELF. A QU is a QU — one sort,
// cast and set as one thing — and the case has a place for it, so it no longer
// gives up a Q and a U it never really was. (It used to decompose, which was
// the only road to a Q back when the press had no lone Q to strike; the ratchet
// is that road now, and a much better one, because you have to choose it.) The
// interrobang keeps the one exception, and keeps it for the same reason it
// always had: it is physically cut from a ? and a !, so it fills all three
// places at once.
export function caseGlyphs(letter) {
  if (!letter) return [];
  if (letter === INTERROBANG) return [INTERROBANG, '?', '!'];
  return ABECEDARIAN_CASE.includes(letter) ? [letter] : [];
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

// ─── The Black Market ─────────────────────────────────────────────────────────
// A Colophon pick rather than an upgrade: take it and a door opens in the alley
// behind the fair, once, before the ordinary Market. It is the ONE pick with no
// repeat cap (see eligibleIds in js/colophon.js) — the alley is always there, and
// what it is worth on any given chapter is whatever is in your purse.
//
// Its whole reason to exist is stock nothing else sells:
//   · tiles cast in the rare materials, CHOSEN rather than gambled for — a
//     wrapped tile rolls one of four blind, and this lays them out on a table;
//   · punctuation, which otherwise comes only wrapped;
//   · rare patrons, four of them, with none of the commons crowding the list;
//   · the four guild tools (the toolbox's own, sold nowhere) and the four
//     registers' parcels, which are otherwise a patron's gift and no one's stock.
// Everything carries the alley's markup. Nothing here is a bargain; it is a
// shortcut, and the price of a shortcut is the price.
//
// Placed this far down the file because it names MATERIALS and PACKAGES above:
// constants.js is a leaf module read top to bottom, so a table quoting another
// has to stand after it.
export const BLACK_TILE_OFFERS   = 16;
export const BLACK_PATRON_OFFERS = 4;
export const BLACK_SUNDRY_OFFERS = 4;

// The alley will not open its door to an empty purse. Without this the pick is a
// trap: three cards, one of which is worth nothing at all to a player who cannot
// buy from it, and the Colophon has no way to say so. Below the threshold the
// card simply isn't dealt (eligibleIds in js/colophon.js), so the spread is
// always three things you can actually use.
export const BLACK_MARKET_MINIMUM = 10;

// ─── The Tile Hacker (the alley's one stall) ──────────────────────────────────
// A spread of YOUR OWN sorts, and for a price the face value is struck double —
// written in as permanent growth, capped hard at HACKER_CAP, which is the
// ceiling every tile in the game answers to (the interrobang sits exactly on
// it). The price doubles with every strike, the same escalation every fair
// stall runs, so the road from 2 to 50 costs real money by the end.
export const HACKER_BASE_PRICE = 2;
export const HACKER_CAP        = 50;
export const HACKER_OFFERS     = 6;

// ─── The Shell Game (the alley's other stall) ─────────────────────────────────
// Three shells on a crate, and under one of them is your prize. The stall deals
// SHELL_SHOWN kinds out of the table below, shows you all three, and takes a
// price — and then which of the three you actually get is not yours to decide.
// So the decision is never "which do I want" (you don't get to choose) but "is
// this spread of three worth two Coins", which is a real question when one of
// the shells has a ruined sort under it.
//
// EDIT THIS TABLE to retune the gamble. `weight` decides how often a kind is
// among the three dealt; every kind dealt is equally likely to be the one you
// get, so the odds of any outcome are (its share of the deal) ÷ 3.
export const SHELL_BASE_PRICE = 2;
export const SHELL_SHOWN      = 3;
export const SHELL_COINS      = 5;
export const SHELL_PRIZES = [
  { kind: 'coins',  weight: 3 },   // SHELL_COINS Coins, and the only sure good
  { kind: 'sundry', weight: 3 },   // one tool, tube or parcel from the whole game
  { kind: 'sort',   weight: 3 },   // a tile — sometimes contraband, often ballast
  { kind: 'batter', weight: 2 },   // a sort broken past use (BATTER, above)
];
// How often the sort under a shell is a RARE one (a metal off the alley's own
// table) rather than an ordinary sort that only thickens the bag.
export const SHELL_RARE_ODDS  = 0.4;

// The Fence's cut. He knows the alley's people, so everything down there asks
// this much less — tiles, sundries and the rare patrons alike — and the door
// itself gets cheaper with it: the minimum in the purse above is discounted by
// the same fraction, since the card is only "a wasted pick" at prices you can't
// meet, and his prices are lower. Rounded UP at the point of sale and floored at
// a Coin, so nothing in the alley is ever free.
export const FENCE_DISCOUNT = 0.5;

// One to two tiles in each rare material every visit, and what the alley asks on
// top of the tile's own worth. Priced by what the metal is worth to a press:
// rainbow reads as every colour at once and costs the most; hellbox iron is a
// liability as much as a tile (it cannot be discarded) and is nearly given away.
//
// Blind emboss shares the bottom of the list with hellbox iron, and no longer
// because it does nothing: a word carrying one is never spiked, which is worth
// a great deal on a Deadline page and nothing at all on the other two. A metal
// that pays on one page in three is priced for one page in three.
export const BLACK_MATERIAL_STOCK = {
  rainbow: { max: 2, price: 5 },
  ghost:   { max: 2, price: 4 },
  rose:    { max: 2, price: 4 },
  cursed:  { max: 2, price: 2 },
  blind:   { max: 2, price: 2 },
  // Sold BARE and cheap on purpose: the tile destroys itself when it goes off,
  // so dressing one would only price up a thing you are buying to lose.
  explosive: { max: 2, price: 0, bare: true },
};

// Nothing on the alley's table asks more than this, whatever it is made of and
// however it is dressed. The surcharges above ride on a tile's own worth, and a
// well-dressed tile in a rare metal used to reach the high teens — a price
// nothing in the game is worth, and doubly so here, where getting through the
// door cost a Colophon pick and BLACK_MARKET_MINIMUM in the purse. The ceiling
// is the promise the alley makes: dear, never absurd.
export const BLACK_TILE_MAX_PRICE = 12;

// Punctuation, in lead under a purple trim — the same tile a wrapper holds, and
// the only other door to one.
export const BLACK_MARK_PRICE = 7;

// What the alley adds to an ordinary tile's list price, and to a patron's fee.
// The patron markup rides on the seat's own data, so a dismissal pays back half
// of what you ACTUALLY paid (patronRefund) rather than half of the list.
export const BLACK_TILE_SURCHARGE  = 1;
export const BLACK_PATRON_MARKUP   = 4;
// Ordinary black-market stock is never plainly dressed: two features minimum.
export const BLACK_TILE_FEATURES   = 2;

// The sundry counter. Four are laid out per visit, drawn from things the Market
// itself never stocks: the four guild tools (TOOLBOX_POOL's own, minus the
// ratchet, which the Market does sell), the two applicators, the love potion,
// and the four registers' parcels.
export const BLACK_SUNDRY_STOCK = [
  { kind: 'loupe',  price: 6 },
  { kind: 'laurel', price: 6 },
  { kind: 'tongs',  price: 4 },
  { kind: 'wash',   price: 4 },
  { kind: 'potion', price: 12 },
  { kind: 'applicator', material: 'rainbow', price: 10 },
  { kind: 'applicator', material: 'cursed',  price: 5 },
  ...Object.keys(PACKAGES).map(theme => ({ kind: 'package', theme, price: 7 })),
];

// ─── The Purveyor's extra options ───────────────────────────────────────────
// One seat that widens every CHOICE the game puts in front of you rather than
// improving any of them. Each number is added to the count wherever that choice
// is dealt, read through the effective-* getters in js/state.js so there is one
// answer per question and the Market, the Colophon and the workbench cannot
// disagree about how many the seat is worth.
//
// Nothing here pays Points or Mult, which is the point: it is a seat you buy
// early, when what you lack is the RIGHT tile rather than more of them, and it
// quietly stops mattering once your press knows what it wants.
export const PURVEYOR = {
  stalls:     1,   // more stalls pitched at the Market
  tiles:      2,   // more tiles laid out at the Market
  patrons:    1,   // more calling cards at the Market
  upgrades:   1,   // more picks on the Colophon
  paint:      1,   // more tiles a paint tube lays out to choose between
  proposals:  2,   // more of your own tiles a proposal stall spreads
};

// How many tiles a paint tube lays out to choose between. Two by design: the
// gift can never be aimed at the one tile that would break the game, but it is
// never a coin toss you cannot influence either.
export const TUBE_CHOICES = 2;

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

// ─── What a sundry is, in one place ───────────────────────────────────────────
// The workbench slot, the shop card and the held row all read from here, so what
// a thing does is written once and turns up wherever the thing does.
// The one place a sundry's words are looked up. Every entry lives in SUNDRY_TEXT
// (js/text.js); this only decides WHICH entry and fills the numbered slots for
// the three that name something chosen at the moment they are read.
export function sundryTip(s) {
  const kind = s?.kind;
  if (kind === 'tube' && COLOURS[s.colour]) {
    const t = SUNDRY_TEXT.tube;
    return {
      head: fillSlots(t.head, COLOURS[s.colour].label),
      body: fillSlots(t.body, COLOURS[s.colour].label, colourDesc(s.colour)),
    };
  }
  if (kind === 'applicator' && APPLICATORS[s.material]) {
    const t = SUNDRY_TEXT.applicator;
    const m = MATERIALS[s.material];
    return {
      head: fillSlots(t.head, APPLICATORS[s.material].label),
      body: fillSlots(t.body, APPLICATORS[s.material].label, m.metal.toLowerCase(), m.desc),
    };
  }
  // A parcel says its own name — the register that sent it is the point.
  if (kind === 'package' && PACKAGES[s.theme]) {
    const p = PACKAGES[s.theme];
    return { head: p.label, body: p.body };
  }
  const t = SUNDRY_TEXT[kind];
  return t ? { head: t.head, body: t.body } : null;
}

// ═══ Filling the copy's knobs ══════════════════════════════════════════════════
// One table of every number the writing is allowed to quote, and one pass that
// fills them in. Both the tables above and js/patron-cards.js read this, so a
// {KNOB} means the same thing wherever it is written and there is a single list
// to add to when a new one is wanted.
//
// This stands at the FOOT of the file because it quotes values defined all the
// way through it. Nothing reads a filled description at load — the shop cards,
// tooltips and calling cards are all built later — so filling here is in time.

export const KNOBS = {
  // Tiles and their finery
  SILVER_BONUS, PURPLE_TRIM_STEP, LENGTH_MULT_MIN, LENGTH_MULT_BASE,
  CURSED_MULT, CURSED_PENALTY, LOUPE_CAP, TONGS_BONUS, WASH_COUNT,
  GHOST_METAL: MATERIALS.ghost.metal.toLowerCase(),

  // The workbench and the Colophon
  HONORIFIC_STEP, LAUREATE_MULT_STEP, WINNOWER_BONUS, DYE_TILES_PER_CHAPTER, PAINT_PER_POT,
  SKIP_COIN_GRANT, MAX_UPGRADE_REPEATS,

  // The Black Market
  BLACK_TILE_OFFERS, BLACK_PATRON_OFFERS, BLACK_SUNDRY_OFFERS,
  BLACK_PATRON_MARKUP, BLACK_MARKET_MINIMUM,
  FENCE_OFF: `${Math.round(FENCE_DISCOUNT * 100)}%`,
  EXPLOSIVE_MULT,
  EXPLOSIVE_SPREAD_CHANCE: oddsText(EXPLOSIVE_SPREAD_ODDS),
  HACKER_CAP, SHELL_COINS, QUOIN_MULT, QUIRE_PRICE, QUIRE_DRESSED,
  GOLDSMITH_POINTS, GOLDSMITH_PURSE,
  BEADLE_THRESHOLD, BEADLE_PAGE_COIN, SPENDTHRIFT_STEP,
  ALMONER_RELIEF_PCT: `${Math.round(ALMONER_RELIEF * 100)}%`,
  GARDENER_CAP_PCT:   `${Math.round(GARDENER_CAP * 100)}%`,
  GOLDSMITH_CHANCE: oddsText(GOLDSMITH_ODDS),

  // Patron tuning
  CHILD_STEP, ABECEDARIAN_MULT, ESPALIER_STEP, HEADSMAN_STEP, BEEKEEPER_STEP,
  ALDERMAN_STEP, LYE_BOY_STEP,
  // The Lye Boy's whole curve as one phrase, so his card cannot drift from the
  // bands — one band today, and the sentence grows with the table.
  LYE_BOY_STEPS: lyeBoySteps(),
  // "1-in-2", off the odds themselves, so the card can never quote a bet the
  // snake doesn't run.
  SERPENT_EAT_CHANCE: oddsText(SERPENT_EAT_ODDS), SERPENT_POINTS,
  // The Beekeeper's whole curve as one phrase, so his card can never drift from
  // the bands: "+0.2 Mult, then +0.1 past ×2, then +0.05 past ×3".
  BEEKEEPER_STEPS: beekeeperSteps(),
  ASTRONOMER_STEP, GLOVER_STEP, TYPESETTER_STEP, EXPECTANTS_BONUS,
  SHORTHAIR_MULT, CARTOGRAPHER_MULT, CARTOGRAPHER_MIN_VOWELS,
  PURVEYOR_STALLS:    PURVEYOR.stalls,
  PURVEYOR_TILES:     PURVEYOR.tiles,
  PURVEYOR_PATRONS:   PURVEYOR.patrons,
  PURVEYOR_UPGRADES:  PURVEYOR.upgrades,
  PURVEYOR_PAINT:     PURVEYOR.paint,
  PURVEYOR_PROPOSALS: PURVEYOR.proposals,
  STOKER_BASE, STOKER_STEP, RAGMAN_COINS, RAGMAN_ODDS,
  NUDIST_TRIM_CHANCE, NUDIST_PAINT_CHANCE, DIPPER_PAINT_CHANCE, REVENANT_ODDS,
  MAGPIE_WEIGHT, MAKO_WEIGHT, TWINS_POINTS,
  PRINCE_STEP:   PRINCE.step,
  PRINCE_CROWN:  PRINCE.crown,
  WORDLER_BONUS: WORDLER.bonus,
  WORDLER_LENGTH: WORDLER.length,
  USURER_LOAN:    USURER.loan,
  USURER_OWED:    USURER.owed,
  USURER_COLLECT: USURER.collect,
  FRONTISPIECE_MULT: FRONTISPIECE.base,
  LOVERS_APART:   LOVERS.apart,
  LOVERS_UNITED:  LOVERS.united,
  // A full case, quoted so the ceiling follows the case itself.
  ABECEDARIAN_CASE_MULT: abecedarianMult(ABECEDARIAN_CASE.length),
  ABECEDARIAN_CASE_SIZE: ABECEDARIAN_CASE.length,
  // The whole curve as one phrase, so the card cannot drift from the bands.
  ABECEDARIAN_STEPS: abecedarianSteps(),
  PACKAGE_CHANCE: oddsText(PACKAGE_ODDS),
  RIPPER_WORDS:   `${RIPPER_WORDS.slice(0, -1).join(', ')} or ${RIPPER_WORDS.at(-1)}`,

  // The parcels, by the name each one goes by
  PARCEL_SPOOKY:   PACKAGES.spooky.label,
  PARCEL_ROMANTIC: PACKAGES.romantic.label,
  PARCEL_CUTE:     PACKAGES.cute.label,
  PARCEL_RUDE:     PACKAGES.rude.label,
};

fillTable(TRIMS,     KNOBS, 'text: TRIM_TEXT');
fillTable(NICKS,     KNOBS, 'text: NICK_TEXT');
fillTable(MATERIALS, KNOBS, 'text: MATERIAL_TEXT');
fillTable(STALL_DEFS, KNOBS, 'text: STALL_TEXT');
fillTable(PACKAGES,  KNOBS, 'text: PACKAGE_TEXT');
fillTable(SUNDRY_TEXT, KNOBS, 'text: SUNDRY_TEXT');
