// ─── Letterforms ──────────────────────────────────────────────────────────────
// Bag tiles are stored as template objects so they can carry cast/aura/ink
// info before being assigned an id when drawn to the rack.
// Template shape: { letter, letterType, altLetter, activeVariant, cast, aura, ink }
// Rack tile shape: { ...template, id, basePoints, selected }

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

// ─── Casts (the metal a tile is cast in) ──────────────────────────────────────
export const CASTS = {
  plain:    { label: '',         badge: '',  desc: '', price: 0 },
  gilded:   { label: 'Gilded',   badge: 'G', desc: 'Pays 1 Coin when printed',  price: 2 },
  bold:     { label: 'Bold',     badge: 'B', desc: 'Prints double Ink',          price: 3 },
  master:   { label: 'Master',   badge: 'M', desc: '+6 Ink when printed',        price: 2 },
  resonant: { label: 'Resonant', badge: 'R', desc: '+1 Press when printed',      price: 4 },
};

// ─── Auras (positional engravings) ────────────────────────────────────────────
export const AURAS = {
  crescendo: { symbol: '»',  label: 'Crescendo', desc: 'Doubles the Ink of every tile to its right',     price: 4 },
  echo:      { symbol: '«',  label: 'Echo',      desc: 'Doubles the Ink of every tile to its left',      price: 4 },
  halo:      { symbol: '«»', label: 'Halo',      desc: 'Doubles the Ink of the tiles directly beside it', price: 3 },
};

// ─── Coloured inks (set bonuses) ──────────────────────────────────────────────
export const INKS = {
  crimson: { label: 'Crimson', onLight: '#b23a2e', onDark: '#ff9d8e' },
  azure:   { label: 'Azure',   onLight: '#2e6fb2', onDark: '#8ec6ff' },
  jade:    { label: 'Jade',    onLight: '#2d8a5c', onDark: '#90e8ba' },
  amber:   { label: 'Amber',   onLight: '#a87010', onDark: '#ffd68c' },
};

// Press bonus for N tiles of the same ink colour in one word.
// Added directly to Press (not a separate multiplier). Accelerating ladder.
// Index by count; the last entry covers everything beyond it.
export const INK_SET_BONUS = [0, 0.5, 1.0, 2.0, 3.0, 4.0];
export const inkSetBonus = n => INK_SET_BONUS[Math.min(n, INK_SET_BONUS.length - 1)];

// ─── Run structure ────────────────────────────────────────────────────────────
export const RACK_SIZE          = 10;
export const WORDS_PER_PAGE     = 5;
export const EXCHANGES_PER_PAGE = 3;
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
  stepAura:   430,
  stepSet:    560,
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
    cast:          'plain',
    aura:          null,
    ink:           null,
    ...overrides,
  };
}

// A few coloured tiles in the starting collection so the set mechanic
// shows itself early.
export const STARTER_INKED = [
  ['A', 'crimson'], ['A', 'crimson'],
  ['E', 'azure'],   ['E', 'azure'],
];
