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
  ING:4, ED:3, TCH:8,
  '?':1, '!':1,
};

export const BAG_COUNTS = {
  A:4, B:1, C:1, D:1, E:5, F:1, G:1, H:1,
  I:4, J:1, K:1, L:3, M:1, N:4, O:4, P:1,
  QU:1, R:4, S:4, T:4, U:2, V:1, W:1, X:1, Y:1, Z:1,
};

// Multi-letter "ligature" tiles — one tile that spells several letters
export const LIGATURES = ['ING', 'ED', 'TCH'];

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
  restorer: {
    name: 'The Restorer', emoji: '🧼', base: 1,
    desc: 'Strips a tile bare — paint, trim and nick.',
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
  copper:  { label: 'Copper',  price: 3, desc: 'Refunds a Discard when printed.' },
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

export const CHAPTER_NAMES = [
  'A Fresh Leaf', 'Rising Action', 'The Plot Thickens', 'Strange Characters',
  'Crossing Out', 'The Midpoint', 'Darkest Ink', 'The Climax',
  'Falling Action', 'The Final Proof',
];

const PAGE_FACTORS = [1, 1.4, 2];
const QUOTA_BASE   = 35;
// Nudged 1.5 → 1.55 for the Colophon: permanent hand-size/discard/seat/
// workbench stacks now accumulate over a run, so the back half needs a
// slightly steeper climb to keep asking something of that extra power.
// Compounds, so the effect is tiny in chapter 2-3 and real by chapter 8-10 —
// a first guess, worth revisiting after a playtest or two.
const QUOTA_GROWTH = 1.55;

export function quotaFor(chapter, page) {
  const raw = QUOTA_BASE * QUOTA_GROWTH ** (chapter - 1) * PAGE_FACTORS[page - 1];
  return Math.max(5, Math.round(raw / 5) * 5);
}

export function roman(n) {
  const table = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],
                 [50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
  let out = '';
  for (const [v, s] of table) while (n >= v) { out += s; n -= v; }
  return out;
}

export const chapterTitle = ch =>
  ch <= FINAL_CHAPTER ? CHAPTER_NAMES[ch - 1] : `Appendix ${roman(ch - FINAL_CHAPTER)}`;

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
  holdTotal:  820,
  fly:        430,
  stagger:    65,
};

// ─── Tile-template factory ────────────────────────────────────────────────────
export function makeTileTemplate(letter, overrides = {}) {
  return {
    letter,
    letterType:    'normal',   // 'normal' | 'dual'
    altLetter:     null,
    activeVariant: 0,          // 0 = letter, 1 = altLetter
    colour:        null,       // paint on the front face
    altColour:     null,       // paint on a dual tile's other face
    trim:          null,       // gold | silver | copper | purple
    nick:          null,       // right | left | side
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
export const DRAFT = {
  patrons: { show: 3,  pick: 1 },
  paints:  { show: 4,  pick: 2 },
  tiles:   { show: 10, pick: 4 },
};
