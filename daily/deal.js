// The Daily Proof's case: sixteen sorts, dealt from a seed so that every reader
// of challenge № n gets the same sixteen, and dressed by luck.
//
// The luck comes in two layers.
//
//   1. THE ALMANAC. Each challenge draws one omen first — a page of the printer's
//      almanac that tilts the whole case: a wet-ink day paints more of it, a
//      tied-letters day guarantees ligatures, a hellbox day casts one sort in
//      cursed iron. Most omens nudge weights; a few force something into the
//      case outright. Fair Copy, the commonest, changes nothing.
//
//   2. THE SORTS. Then each tile rolls for itself, the way the Market dresses
//      its tiles (FEATURE_CHAIN_CHANCE in js/constants.js): a chance of one
//      feature, and while the chain holds, another — paint, a trim, a nick or
//      a second face, never two of a kind. So most of the case is plain lead,
//      a handful is dressed, and once in a while one sort comes up loaded.
//
// Only features that change ONE word's score are in the pool. Gold pays a Coin
// and cobalt refunds a Discard — in a game of one word there is nothing to buy
// and nothing to discard, so those two trims never appear. Neither do the metals
// that speak only to patrons and editors (rainbow, rose, blind, ghost).
//
// The deal is pure: a number in, a case out, no dictionary consulted. A vowel
// floor and ceiling keep every case playable without asking which words exist,
// so the same number deals the same case even if the word list is changed.

import {
  BAG_COUNTS, TILE_POINTS, COLOURS, CURSED_MAX_POINTS, dualPairsFor, makeTileTemplate,
} from '../js/constants.js';

// Bump the salt and every challenge is re-dealt — for when the tuning below
// changes enough that the old numbers should not keep their old cases.
export const DEAL_SALT = 'great-work-daily-v1';
export const CASE_SIZE = 16;

// ─── Seeded randomness ────────────────────────────────────────────────────────
// xmur3 to turn the string into a seed, mulberry32 to run from it. Small, fast,
// and the same everywhere JavaScript runs, which is all a shared puzzle needs.
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const rngFor = key => mulberry32(xmur3(key)());

const pickWeighted = (rng, entries) => {
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let r = rng() * total;
  for (const [v, w] of entries) { if ((r -= w) < 0) return v; }
  return entries[entries.length - 1][0];
};
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

// ─── The odds ─────────────────────────────────────────────────────────────────
export const LUCK = {
  // Per tile: the chance it is dressed at all, then the chance of each further
  // feature while the chain holds. 0.42 / 0.4 gives a case of sixteen about
  // eleven features, spread over seven or eight tiles.
  dressed: 0.42,
  chain: 0.4,
  maxFeatures: 3,
  // Which feature a roll lands on. Paint leads because colour is the game's
  // multiplicative engine — a case without it plays like Scrabble.
  weights: { paint: 4, silver: 2, purple: 1.5, nick: 2, dual: 1.5 },
  // Per tile, before features: the chance the sort is something other than a
  // plain letter. Small — these are finds.
  ligature: 0.03,
  medieval: 0.01,
  mark: 0.012,
  // The chance a tool is on the bench.
  tool: 0.35,
  tools: [['ratchet', 55], ['loupe', 45]],
  vowels: [5, 7],          // the case holds between these many vowels, inclusive
};

const LIGATURE_WEIGHTS = [['TH', 3], ['CH', 3], ['ING', 2], ['CK', 1], ['WH', 1]];
const MEDIEVAL_WEIGHTS = [['Þ', 3], ['Ȝ', 2], ['Æ', 2], ['Ƿ', 1]];
const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);

// ─── The almanac ──────────────────────────────────────────────────────────────
// Names and rules in daily/text.js (OMEN_TEXT). Here: how often each is drawn,
// and what it does to the odds. `weights` multiplies the feature weights;
// `dressed` multiplies the chance a tile is dressed at all; `force` puts things
// in the case outright.
export const OMENS = {
  fair:       { odds: 4 },
  wetink:     { odds: 2, weights: { paint: 2.5 } },
  silver:     { odds: 2, weights: { silver: 3 } },
  blade:      { odds: 2, weights: { nick: 3 } },
  purple:     { odds: 2, weights: { purple: 3 } },
  double:     { odds: 2, weights: { dual: 3 } },
  tied:       { odds: 2, force: { ligatures: 3 } },
  oldstock:   { odds: 1.5, force: { medieval: 2 } },
  marginalia: { odds: 1.5, force: { marks: true } },
  hellbox:    { odds: 1.5, force: { cursed: 1 } },
  squib:      { odds: 1.5, force: { explosive: 1 } },
  fat:        { odds: 1.5, dressed: 1.7 },
  lean:       { odds: 1.5, dressed: 0.35 },
  toolchest:  { odds: 2, force: { tool: true } },
};

// ─── The deal ─────────────────────────────────────────────────────────────────
export function dealChallenge(n) {
  const rng = rngFor(`${DEAL_SALT}:${n}`);
  const omenId = pickWeighted(rng, Object.entries(OMENS).map(([id, o]) => [id, o.odds]));
  const omen = OMENS[omenId];
  const force = omen.force ?? {};
  const weights = Object.fromEntries(Object.entries(LUCK.weights)
    .map(([k, w]) => [k, w * (omen.weights?.[k] ?? 1)]));
  const dressed = Math.min(0.95, LUCK.dressed * (omen.dressed ?? 1));

  // 1. Letters, drawn without replacement from one press's bag, until the
  //    vowels land inside the band.
  const bag = Object.entries(BAG_COUNTS).flatMap(([L, k]) => Array(k).fill(L));
  let letters;
  for (let tries = 0; tries < 200; tries++) {
    const pool = [...bag];
    letters = [];
    for (let i = 0; i < CASE_SIZE; i++) letters.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    const v = letters.filter(L => VOWELS.has(L)).length;
    if (v >= LUCK.vowels[0] && v <= LUCK.vowels[1]) break;
  }
  const tiles = letters.map((L, id) => ({ ...makeTileTemplate(L), id }));
  const consonants = () => tiles.filter(t => !VOWELS.has(t.letter) && t.letter.length === 1
    && TILE_POINTS[t.letter] != null && /^[A-Z]$/.test(t.letter));

  // 2. Letterforms. A ligature or a medieval sort replaces a consonant, so the
  //    vowel band holds; Æ is the exception, a vowel standing in for a vowel.
  const recast = (t, letter) => { t.letter = letter; };
  const forcedLig = force.ligatures ?? 0;
  for (let k = 0; k < forcedLig; k++) {
    const c = consonants(); if (!c.length) break;
    recast(pick(rng, c), pickWeighted(rng, LIGATURE_WEIGHTS));
  }
  const forcedMed = force.medieval ?? 0;
  for (let k = 0; k < forcedMed; k++) placeMedieval(rng, tiles, consonants);
  if (force.marks) {
    for (const m of ['?', '!']) { const c = consonants(); if (c.length) recast(pick(rng, c), m); }
  }
  for (const t of tiles) {
    if (!/^[A-Z]$/.test(t.letter) || VOWELS.has(t.letter)) continue;
    const r = rng();
    if (r < LUCK.ligature) recast(t, pickWeighted(rng, LIGATURE_WEIGHTS));
    else if (r < LUCK.ligature + LUCK.medieval) placeMedieval(rng, tiles, () => [t]);
    else if (r < LUCK.ligature + LUCK.medieval + LUCK.mark) {
      const have = new Set(tiles.map(x => x.letter));
      const free = ['?', '!'].filter(m => !have.has(m));
      if (free.length) recast(t, pick(rng, free));
    }
  }

  // 3. Features, tile by tile: dressed at all? then chain.
  for (const t of tiles) {
    if (rng() >= dressed) continue;
    let count = 1;
    while (count < LUCK.maxFeatures && rng() < LUCK.chain) count++;
    for (let k = 0; k < count; k++) {
      const open = Object.entries(weights).filter(([f]) => canTake(t, f));
      if (!open.length) break;
      dress(rng, t, pickWeighted(rng, open));
    }
  }

  // 4. Metals the almanac casts.
  if (force.cursed) {
    // Never on a dear letter (CURSED_MAX_POINTS), and never a mark: a curse
    // has to be something you can build a word around.
    const ok = tiles.filter(t => /^[A-Z]$/.test(t.letter) && TILE_POINTS[t.letter] <= CURSED_MAX_POINTS);
    if (ok.length) pick(rng, ok).material = 'cursed';
  }
  if (force.explosive) {
    const ok = tiles.filter(t => !t.material && !/^[?!]$/.test(t.letter));
    if (ok.length) pick(rng, ok).material = 'explosive';
  }

  // 5. The bench.
  const tool = (force.tool || rng() < LUCK.tool) ? pickWeighted(rng, LUCK.tools) : null;

  return { n, omen: omenId, tiles, tool };
}

function placeMedieval(rng, tiles, candidates) {
  const sort = pickWeighted(rng, MEDIEVAL_WEIGHTS);
  // Æ stands for vowels, so it takes a vowel's place; the rest take a consonant's.
  const pool = sort === 'Æ'
    ? tiles.filter(t => t.letter === 'A' || t.letter === 'E')
    : candidates();
  if (pool.length) pick(rng, pool).letter = sort;
}

// Whether a tile can still take a feature of this kind. One of each kind; a
// trim is a trim (silver OR purple); a second face only on a plain A–Z letter.
function canTake(t, f) {
  switch (f) {
    case 'paint':  return !t.colour;
    case 'silver':
    case 'purple': return !t.trim;
    case 'nick':   return !t.nick;
    case 'dual':   return t.letterType !== 'dual' && /^[A-Z]$/.test(t.letter)
                       && dualPairsFor(t.letter).length > 0;
    default: return false;
  }
}

function dress(rng, t, f) {
  switch (f) {
    case 'paint':  t.colour = pick(rng, Object.keys(COLOURS)); break;
    case 'silver': t.trim = 'silver'; break;
    case 'purple': t.trim = 'purple'; break;
    case 'nick':   t.nick = rng() < 0.5 ? 'left' : 'right'; break;
    case 'dual': {
      t.letterType = 'dual';
      t.altLetter = pick(rng, dualPairsFor(t.letter));
      break;
    }
  }
}

// ─── Numbering ────────────────────────────────────────────────────────────────
// Challenge № 1 is the first day of the proof; every day after is one more.
// While the mode is being tried out the page lets you walk to any number, so
// "today's" is only where it opens.
export const EPOCH = Date.UTC(2026, 10, 3);   // 3 November 2026 — № 1
export const todaysNumber = (now = new Date()) =>
  Math.max(1, Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - EPOCH) / 864e5) + 1);
