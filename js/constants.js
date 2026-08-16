// ─── Letterforms ──────────────────────────────────────────────────────────────
// Bag tiles are stored as template objects so they can carry trim/nick/colour
// info before being assigned an id when drawn to the rack.
// Template shape: { letter, letterType, altLetter, activeVariant,
//                   colour, altColour, trim, nick }
// Rack tile shape: { ...template, id, basePoints, selected }
//
// A dual tile's two faces are painted independently (colour / altColour);
// trim and nick belong to the tile and apply to both faces.

export const TILE_POINTS = {
  A:1, B:3, C:3, D:2, E:1, F:4, G:2, H:4,
  I:1, J:8, K:5, L:1, M:3, N:1, O:1, P:3,
  QU:10, R:1, S:1, T:1, U:1, V:4, W:4, X:8,
  Y:4, Z:10,
  // A ligature scores exactly what its letters would score apart — CH is C+H,
  // CK is C+K — so it buys you a tile slot, never free points. QU is the one
  // exception: there's no lone Q to sum from, so it keeps its long-held 10.
  ING:4, CH:7, CK:8, TH:5, WH:8,
  RAT:3,                    // R+A+T, exactly what the three would score apart
  '?':1, '!':1,
};

export const BAG_COUNTS = {
  A:4, B:1, C:1, D:1, E:5, F:1, G:1, H:1,
  I:4, J:1, K:1, L:3, M:1, N:4, O:4, P:1,
  QU:1, R:4, S:4, T:4, U:2, V:1, W:1, X:1, Y:1, Z:1,
};

// Multi-letter "ligature" tiles — one tile that spells several letters.
// Between them they reach every part of a word: WH and TH open one, CK and CH
// sit in the middle, ING closes it off. QU is the odd one out, being also a bag
// letter — the one ligature every run starts holding.
//
// One suffix is deliberate. ED sat here too and was cut: it turned up in three
// times as many short words as anything else, for the fewest points of any
// ligature, which made drawing one both automatic and unexciting. A ligature
// should be a find, not a staple.
export const LIGATURES = ['ING', 'CH', 'CK', 'TH', 'WH', 'QU', 'RAT'];

// Letters no shop, draft or heap will ever hand you: they come from one
// patron and nowhere else. RAT belongs to The Rat Catcher.
export const EXCLUSIVE_LETTERS = ['RAT'];

// ─── Marks (punctuation tiles) ────────────────────────────────────────────────
// Not letters, and not ligatures either: a mark spells nothing and is simply
// appended to a finished word. One ? or one !, or the two together as ?! —
// never doubled, never mid-word. They're worth a point apiece, but they take
// paint, trims and nicks like any other tile, and a left nick on a trailing
// mark reaches back across the entire word.
export const MARKS      = ['?', '!'];
export const MARK_RUNS  = ['?', '!', '?!'];   // every legal tail
export const isMark     = ch => MARKS.includes(ch);
export const MARK_WEIGHT = 2;                 // copies of each in the shop's letter pool

// Split a composed word into its letters and its trailing marks. Returns null
// when the marks aren't a legal tail — doubled, reversed, or mid-word.
export function splitMarks(str) {
  const i = [...str].findIndex(isMark);
  if (i < 0) return { letters: str, marks: '' };
  const letters = str.slice(0, i);
  const marks   = str.slice(i);
  return MARK_RUNS.includes(marks) ? { letters, marks } : null;
}

// ─── Colours (letter paint) ───────────────────────────────────────────────────
// Each colour has its own multiplier, ×1 by default. Every painted letter of
// that colour in the word raises it by +1 (×2, ×3, …). The word's Mult is the
// product of all colour multipliers, so spreading colours multiplies together.
export const COLOURS = {
  crimson: { label: 'Crimson', glyph: '#b23a2e', bright: '#ff9d8e' },
  azure:   { label: 'Azure',   glyph: '#2e6fb2', bright: '#8ec6ff' },
  jade:    { label: 'Jade',    glyph: '#2d8a5c', bright: '#90e8ba' },
  amber:   { label: 'Amber',   glyph: '#a87010', bright: '#ffd68c' },
};

export const colourDesc = c =>
  `Each ${COLOURS[c].label} letter adds +1 to the ${COLOURS[c].label} multiplier.`;

// Every multiplier the readout keeps a chip for. The four paints, plus the two
// that come from somewhere other than a painted letter: the purple trim, and
// cursed metal. Anything reading a score step's `colour` looks it up here.
export const MULT_TRACKS = {
  ...COLOURS,
  purple: { label: 'Purple', glyph: '#8a5fb0', bright: '#cfa6ff' },
  cursed: { label: 'Cursed', glyph: '#c93c2d', bright: '#ff7a66' },
};

export const PAINT_PER_POT   = 3;   // letters painted per draft pot (random, unpainted)

// ─── Sundries (consumables kept on the workbench) ─────────────────────────────
// Bought at the Shop, spent mid-page. A paint tube is the first kind: arm it,
// pick up to TUBE_TILES tiles on the board, and they're painted that colour —
// permanently, right where they sit.
export const SUNDRY_SLOTS  = 2;   // sundries the workbench can hold
export const SUNDRY_OFFERS = 2;   // sundries offered per shop
export const TUBE_PRICE    = 2;
export const TUBE_TILES    = 1;   // tiles painted per tube
export const SUNDRY_SELL   = 1;   // what the Market pays to take one back

// "one tile" / "2 tiles" — keeps copy reading right whatever TUBE_TILES is
export const tileCount = n => n === 1 ? 'one tile' : `${n} tiles`;

// ─── Stalls ───────────────────────────────────────────────────────────────────
// Two pitch up at each shop, drawn from the roster below. A stall's price
// starts at its base and doubles with every purchase, then resets when the
// next shop opens — the Smelter alone starts dearer.
export const STALLS_PER_SHOP = 2;
export const PROPOSAL_RANGE  = 6;    // tiles a proposal stall lays out at a time
export const SMELT_MIN_COLLECTION = 12;

export const STALL_DEFS = {
  smelter: {
    name: 'The Smelter', emoji: '🔥', base: 2,
    desc: 'Feeds a tile to the furnace — gone for good.',
  },
  painter: {
    name: 'The Painter', emoji: '🖌️', base: 1,
    desc: 'Paints any letter a colour of your choice.',
  },
  gilder: {
    name: 'The Gilder', emoji: '⚜️', base: 1,
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
    name: 'The Stereotyper', emoji: '🗜️', base: 1,
    desc: 'Casts an exact copy of any tile.',
  },
};

// ─── Special-tile generation ──────────────────────────────────────────────────
// Every offered tile gets one feature outright, then keeps rolling for another
// at this chance until it fails or runs out of slots (paint / trim / nick /
// dual — a ligature letter counts as one of them). At 0.5 that's roughly
// 50% one feature · 25% two · 12% three · 6% four.
export const FEATURE_CHAIN_CHANCE = 0.5;
export const MAX_FEATURES         = 4;

// ─── Trims (the ring around a tile's edge) ────────────────────────────────────
// Purple is trim-only: a fifth multiplier that stacks with the letter colours.
export const TRIMS = {
  gold:    { label: 'Gold',    price: 2, desc: 'Pays 1 Coin when printed.' },
  silver:  { label: 'Silver',  price: 2, desc: '+6 Points.' },
  cobalt:  { label: 'Cobalt',  price: 3, desc: 'Refunds a Discard when printed.' },
  mercury: { label: 'Mercury', price: 3, desc: 'Returns to the bag instead of the discard pile.' },
  purple:  { label: 'Purple',  price: 4, desc: 'Adds +0.5 to the purple multiplier.' },
};

// A purple trim is worth half a step, where a painted letter is worth a whole
// one: one purple trim gives ×1.5, two ×2, three ×2.5. It's the cheaper half of
// a tile that can also carry paint, and it's the multiplier patrons will add to.
export const PURPLE_TRIM_STEP = 0.5;

// ─── Nicks (a notch cut out of one edge of the tile) ──────────────────────────
// Nicks do not stack: a letter is multiplied at most once however many nicks
// point at it. Where two compete, the earlier tile in the word claims it.
export const NICK_MULT = 3;
export const NICKS = {
  right: { label: 'Right nick', mult: NICK_MULT, price: 4,
           desc: `×${NICK_MULT} Points to every letter on its right.` },
  left:  { label: 'Left nick',  mult: NICK_MULT, price: 4,
           desc: `×${NICK_MULT} Points to every letter on its left.` },
};

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
// bigger step than the last and the back half of a run gets genuinely steep.
// Chapter 2 asks ×1.7 of chapter 1, chapter 3 asks ×1.8 of chapter 2, and so
// on. That keeps chapters 1-4 close to where they always were while the final
// chapters run into the tens of thousands and the appendices into the
// hundreds of thousands — which is the point, since a built press multiplies
// rather than adds.
//
//   ch1     40 · ch4    230 · ch7   2,100 · ch10  30,000   (page 1)
//   ch1     80 · ch4    470 · ch7   4,300 · ch10  59,000   (the Deadline)
//
// Raising START makes the whole run harder; raising RAMP makes the ending
// harder without touching the opening. A harder mode is a bigger pair.
const QUOTA_GROWTH_START = 1.7;
const QUOTA_GROWTH_RAMP  = 0.1;

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
  return roundQuota(raw * PAGE_FACTORS[page - 1]);
}

export function roman(n) {
  const table = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],
                 [50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
  let out = '';
  for (const [v, s] of table) while (n >= v) { out += s; n -= v; }
  return out;
}

// What a chapter is called by number: the ten chapters of the folio proper,
// then the appendices, counted from one again.
export const chapterLabel = ch =>
  ch <= FINAL_CHAPTER ? `Chapter ${roman(ch)}` : `Appendix ${roman(ch - FINAL_CHAPTER)}`;

export const isDeadline = page => page === PAGES_PER_CHAPTER;

// ─── Economy ──────────────────────────────────────────────────────────────────
// base nudged 4 → 5 alongside the quota bump — the Market grew more sinks
// (five stalls, sundries) since this was last tuned, so income leans up
// slightly to compensate. Also a first guess.
export const REWARD = {
  base:         5,   // coins for completing a page
  perSpareWord: 1,   // per unused word
  finaleBonus:  3,   // extra for clearing a Deadline page
  interestPer:  10,  // +1 coin per N coins held…
  interestCap:  3,   // …capped here
};

export const TILE_BASE_PRICE = 2;
export const REROLL_BASE     = 2;

// ─── Animation base timings (ms, divided by the speed setting) ────────────────
export const ANIM = {
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
// Ordinary tiles are lead. An ingot bought at the Market casts one tile from
// something stranger, and the material sits under everything else a tile
// carries: a cursed or rainbow tile still takes paint, trims and nicks. A
// ghost takes nothing at all, ever.
export const CURSED_MULT       = 3;   // ×Mult a cursed tile gives the word
export const CURSED_MAX_POINTS = 3;   // never cast on a letter worth more than this
// What a curse takes from any word set without it while it waits in the hand.
// It still cannot be discarded — printing it is the only way out of the rack —
// so this is what keeps that from stranding you: words set around a curse are
// worth nothing rather than impossible, and a rack you can still empty is a
// rack that keeps drawing until the curse finds a word. Points, not Mult, so a
// press strong enough to clear 666 can shrug one off and score anyway.
export const CURSED_PENALTY    = 666;  // Points lost per unplayed curse in hand
export const INGOT_PRICE       = 4;
export const INGOT_OFFER_CHANCE = 0.5;  // odds one of a Market's sundry slots holds an ingot

export const MATERIALS = {
  cursed: {
    label: 'Cursed', metal: 'Hellbox iron', emoji: '🩸',
    desc: `×${CURSED_MULT} Mult when printed, and it can never be discarded — only played. Every word you set without it loses ${CURSED_PENALTY} Points.`,
  },
  ghost: {
    label: 'Ghost', metal: 'Ghost metal', emoji: '👻',
    desc: 'Does not count against your hand size, and can never be painted, trimmed, nicked or copied.',
  },
  rainbow: {
    label: 'Rainbow', metal: 'Rainbow roll', emoji: '🌈',
    desc: 'Counts as every colour to your patrons. Paint it and that colour\'s multiplier rises as usual.',
  },
};

// A ghost is the one material nothing can be done to.
export const isImmutable = tile => tile?.material === 'ghost';

// ─── Patron tuning (the colour-guild overhaul) ────────────────────────────────
// Knobs for patron effects that reach beyond a single score: permanent tile
// growth, burn odds, trim lotteries. Plain score numbers stay in js/patrons.js
// with their patron, as ever.
export const GRAFTER_STEP       = 1;      // permanent Points per tile per print
export const STOKER_STEP        = 0.25;   // permanent ×Mult per crimson tile burned
export const BEEKEEPER_STEP     = 0.2;    // permanent ×Mult per B printed
export const ARSONIST_ODDS      = { paint: 0.10, burn: 0.01 };  // per tile played
export const NUDIST_TRIM_CHANCE = 0.25;   // per bare letter in an all-bare word
export const DIPPER_PAINT_CHANCE = 0.10;  // per tile discarded, painted at random
// The Gambler's coin. Tossed once per word rather than once per keystroke:
// scoring runs on every letter you lay to drive the live preview, so a roll
// inside the score effect would flicker as you compose and then disagree with
// what printed. state.gambleWon holds the toss (see rollGamble in state.js).
export const GAMBLER_ODDS       = 0.5;    // odds the coin comes up ×2
export const NEOLOGIST_LENGTH   = 6;      // letters in a coined word
export const DYE_TILES_PER_CHAPTER = 2;   // tiles painted by a dye patron at chapter end

// The Composter's heap: destroyed tiles rot down into jade ones, and the heap
// keeps only the freshest few — older rot is turned under to make room.
export const COMPOST_HEAP_MAX = 6;        // tiles the heap can hold at once
export const COMPOST_PER_MARKET = 1;      // how many you may take on a visit

// The Frontispiece: the first word of a page starts at ×base, and every page
// that word clears the whole quota by itself, the multiplier grows by +step.
export const FRONTISPIECE = { base: 1.5, step: 0.1 };

// ─── Tile-template factory ────────────────────────────────────────────────────
export function makeTileTemplate(letter, overrides = {}) {
  return {
    letter,
    letterType:    'normal',   // 'normal' | 'dual'
    altLetter:     null,
    activeVariant: 0,          // 0 = letter, 1 = altLetter
    colour:        null,       // paint on the front face
    altColour:     null,       // paint on a dual tile's other face
    trim:          null,       // gold | silver | cobalt | mercury | purple
    nick:          null,       // right | left | side
    bonusPoints:   0,          // permanent growth (The Grafter) — added to the letter's value
    material:      null,       // null = lead | cursed | ghost | rainbow (see MATERIALS)
    ...overrides,
  };
}

// ─── The Colophon (a permanent upgrade, chosen when a chapter clears) ─────────
// Structural picks (hand size, discards, seats, workbench slots) persist for
// the rest of the run; paint is an immediate one-off. Each of the 9 possible
// picks can be taken at most MAX_UPGRADE_REPEATS times across a run, and at
// least one structural option is guaranteed among the offers whenever one is
// still eligible.
export const UPGRADE_OFFERS      = 3;
export const MAX_UPGRADE_REPEATS = 2;

// Decline all three cards for this instead — also what a chapter transition
// pays out on its own if the whole pool is ever exhausted (endless mode only).
export const SKIP_COIN_GRANT = 2;

// ─── Patron reactions (flavour only) ──────────────────────────────────────────
// Odds a seated patron pops a speech bubble after a word, scored against the
// page's own quota: ratio = word total ÷ (quota ÷ words per page). Below
// `floor` nobody bothers; each step of `slope` above it raises the per-patron
// chance, capped so it's never a certainty. The lines live in js/quips.js.
export const REACTION = { floor: 0.6, slope: 0.35, cap: 0.7 };

// ─── Reshuffle sundry ─────────────────────────────────────────────────────────
// A free re-roll, banked for later: spend it on the Market's own offers, or
// on the Colophon's three cards.
export const RESHUFFLE_PRICE = 4;

// ─── Opening draft ────────────────────────────────────────────────────────────
// Before the first page you kit out the press: pick from a free spread, no
// coins involved. (The starting collection ships unpainted — the two paints
// picked here are what gets the colour multipliers going.)
// No patron here: the first one is hired at the first Market, with coins, as a
// decision you make about a press you've already printed a page with.
export const DRAFT = {
  paints:  { show: 4,  pick: 2 },
  tiles:   { show: 10, pick: 4 },
};
