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
};

export const BAG_COUNTS = {
  A:4, B:1, C:1, D:1, E:5, F:1, G:1, H:1,
  I:4, J:1, K:1, L:3, M:1, N:4, O:4, P:1,
  QU:1, R:4, S:4, T:4, U:2, V:1, W:1, X:1, Y:1, Z:1,
};

// Multi-letter "ligature" tiles (cast as a single piece of type)
export const LIGATURES = ['ING', 'ED', 'TCH'];

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

export const PAINT_PRICE     = 3;   // one pot
export const PAINT_PER_POT   = 3;   // letters painted per pot (random, unpainted)

// ─── Trims (the ring around a tile's edge) ────────────────────────────────────
// Purple is trim-only: a fifth multiplier that stacks with the letter colours.
export const TRIMS = {
  gold:   { label: 'Gold',   desc: 'Pays 1 Coin when printed',            price: 2 },
  silver: { label: 'Silver', desc: '+6 Points when printed',              price: 2 },
  copper: { label: 'Copper', desc: 'Refreshes 1 Exchange when printed',   price: 3 },
  purple: { label: 'Purple', desc: 'Its own ×multiplier — every purple trim in the word raises it by 1', price: 4 },
};

// ─── Nicks (grooves cut into a tile's edge) ───────────────────────────────────
export const NICKS = {
  right: { symbol: '»',  label: 'Right nick', mult: 3, desc: '×3 Points to every tile on its right', price: 4 },
  left:  { symbol: '«',  label: 'Left nick',  mult: 3, desc: '×3 Points to every tile on its left',  price: 4 },
  side:  { symbol: '«»', label: 'Side nick',  mult: 5, desc: '×5 Points to the tiles directly beside it', price: 5 },
};

// ─── Run structure ────────────────────────────────────────────────────────────
export const RACK_SIZE          = 10;
export const WORDS_PER_PAGE     = 5;
export const EXCHANGES_PER_PAGE = 2;
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
const QUOTA_GROWTH = 1.5;

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
export const REWARD = {
  base:         4,   // coins for completing a page
  perSpareWord: 1,   // per unused word
  finaleBonus:  3,   // extra for clearing a Deadline page
  interestPer:  10,  // +1 coin per N coins held…
  interestCap:  3,   // …capped here
};

export const SMELT_COST      = 2;
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

// A few painted tiles in the starting collection so the colour multipliers
// show themselves early.
export const STARTER_COLOURED = [
  ['A', 'crimson'], ['A', 'crimson'],
  ['E', 'azure'],   ['E', 'azure'],
];
