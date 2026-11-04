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
// Two more are left out because in one word they pose no choice. A mark (? or
// !) only ever rides on the end, so it is a flat Point or two on whatever word
// you set; and squib lead's whole game is the blast that follows the print,
// which one word never sees, leaving a plain ×2 that is just another stamp.
//
// The deal is pure: a number in, a case out, no dictionary consulted. A vowel
// floor and ceiling keep every case playable without asking which words exist,
// so the same number deals the same case even if the word list is changed.

import {
  BAG_COUNTS, TILE_POINTS, COLOURS, CURSED_MAX_POINTS, dualPairsFor, makeTileTemplate,
} from '../js/constants.js';

// Bump the salt and every challenge is re-dealt — for when the tuning below
// changes enough that the old numbers should not keep their old cases.
// v2: the marks and squib lead taken out of the case.
// v3: the week — patrons, editors and two-word days.
export const DEAL_SALT = 'great-work-daily-v3';
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
  hellbox:    { odds: 1.5, force: { cursed: 1 } },
  fat:        { odds: 1.5, dressed: 1.7 },
  lean:       { odds: 1.5, dressed: 0.35 },
  toolchest:  { odds: 2, force: { tool: true } },
};

// ─── The deal ─────────────────────────────────────────────────────────────────
export function dealChallenge(n, opts = {}) {
  const day = opts.day ?? dayOf(n);
  const pair = day.kind === 'pair';
  const { size = pair ? PAIR.size : CASE_SIZE, vowels = pair ? PAIR.vowels : LUCK.vowels, salt = '' } = opts;
  const rng = rngFor(`${DEAL_SALT}:${salt}${n}`);
  // A two-word day draws from the almanac's quieter pages: no tool and no
  // cursed iron, whose rules are written for one word (the toll is charged to
  // "a word set without it", and a case of two words always sets one).
  const omens = Object.entries(OMENS).filter(([id]) => !pair || !PAIR.noOmens.includes(id));
  const omenId = pickWeighted(rng, omens.map(([id, o]) => [id, o.odds]));
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
    for (let i = 0; i < size; i++) letters.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    const v = letters.filter(L => VOWELS.has(L)).length;
    if (v >= vowels[0] && v <= vowels[1]) break;
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
  for (const t of tiles) {
    if (!/^[A-Z]$/.test(t.letter) || VOWELS.has(t.letter)) continue;
    const r = rng();
    if (r < LUCK.ligature) recast(t, pickWeighted(rng, LIGATURE_WEIGHTS));
    else if (r < LUCK.ligature + LUCK.medieval) placeMedieval(rng, tiles, () => [t]);
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
    // Never on a dear letter (CURSED_MAX_POINTS): a curse has to be something
    // you can build a word around.
    const ok = tiles.filter(t => /^[A-Z]$/.test(t.letter) && TILE_POINTS[t.letter] <= CURSED_MAX_POINTS);
    if (ok.length) pick(rng, ok).material = 'cursed';
  }

  // 5. The bench.
  const toolRoll = rng();
  const tool = !pair && (force.tool || toolRoll < LUCK.tool) ? pickWeighted(rng, LUCK.tools) : null;

  // 6. The table: who sits today, rolled on a stream of its own so the case
  //    above is the same whoever is seated.
  const srng = rngFor(`${DEAL_SALT}:seat:${n}`);
  const deal = { n, omen: omenId, tiles, tool, day: { kind: day.kind } };
  if (day.kind === 'patron') {
    deal.day.patron = seatFor(day.id, deal, srng);
  } else if (day.kind === 'choice') {
    deal.day.tier = day.tier;
    deal.day.choices = day.ids.map(id => seatFor(id, deal, srng));
  } else if (day.kind === 'editor') {
    deal.day.editor = deskFor(day.id, deal, srng);
  } else if (pair) {
    deal.day.min = PAIR.min;
  }
  // A seat or a desk that lends a tile puts it at the end of the case.
  const lends = deal.day.patron?.adds ?? deal.day.editor?.adds;
  if (lends) deal.tiles = withAdded(deal.tiles, lends);
  return deal;
}

// ─── The week ─────────────────────────────────────────────────────────────────
// Each day of the week has its own kind of case, by the calendar date of the
// challenge (№ 1 was a Tuesday). Three plain days; one with a patron seated for
// everyone; one with an editor at the desk; one of two words; and one where the
// reader picks a patron from three.
//
// Who sits is chosen by turn rather than by chance: each roster is shuffled
// once per lap of it, so every patron and every editor comes round before any
// comes round twice.
//
// The rosters are the cull. tools/daily-table.mjs measured every patron the
// game has against sixty cases, and a patron is here only if it changes WHICH
// word is best on a good share of them — README.md, "The table", has the
// figures and the reasons for each one left out.
export const WEEK = ['choice', 'plain', 'patron', 'plain', 'editor', 'plain', 'pair'];   // Sunday first

// Seated for everyone: each moves the best word to a different word on a third
// to nine-tenths of cases, and none is ever without a word to fire on.
export const DAY_PATRONS = [
  'sexton', 'counterfeiter', 'paramour', 'athlete', 'poppet', 'cartographer',
  'vulgarian', 'monogrammist', 'poet', 'herald',
];
// Offered three at a time, from one tier, so that no one of the three is the
// obvious answer: in the measured cases no patron in either tier is the best
// choice more than about half the time against any two of its tier-mates. The
// two tiers alternate by week. The Sexton is too strong to offer (the best of
// any three holding him, seven times in ten); the Mirror too narrow (never).
export const CHOICE_TIERS = {
  rich:  ['paramour', 'poppet', 'vulgarian', 'poet', 'athlete', 'serpent'],
  plain: ['herald', 'cartographer', 'sculptor', 'twins'],
};
// Each bites: the best word unseated is spiked on a quarter to all of cases,
// and the best word under them is a different one on two-fifths or more.
export const EDITOR_DAYS = ['columnist', 'populist', 'serialist', 'enthusiast', 'minimalist'];

// A two-word day: a bigger case, and both words at least six letters — the
// measure where the length multiplier begins — so neither can be a scrap left
// over from the other. Added together, the sum of a long word and a scrap is
// all but the long word alone; the floor makes the split the puzzle.
export const PAIR = { size: 20, vowels: [7, 9], min: 6, noOmens: ['hellbox', 'toolchest'] };

export const weekdayOf = n => new Date(EPOCH + (n - 1) * 864e5).getUTCDay();
// Weeks run Sunday to Saturday, counted from the week of № 1.
const weekOf = n => Math.floor((n - 1 + weekdayOf(1)) / 7);

// The k-th turn of a roster: shuffled afresh for each lap, by a seed.
function turn(list, k, key) {
  const lap = Math.floor(k / list.length);
  const rng = rngFor(`${DEAL_SALT}:${key}:${lap}`);
  const order = [...list];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order[k % list.length];
}

export function dayOf(n) {
  const kind = WEEK[weekdayOf(n)];
  const w = weekOf(n);
  if (kind === 'patron') return { kind, id: turn(DAY_PATRONS, w, 'patron') };
  if (kind === 'editor') return { kind, id: turn(EDITOR_DAYS, w, 'editor') };
  if (kind === 'choice') {
    const tier = w % 2 ? 'plain' : 'rich';
    const pool = CHOICE_TIERS[tier];
    // Three of the tier, a different three each week where the tier allows.
    const rng = rngFor(`${DEAL_SALT}:choice:${w}`);
    const order = [...pool];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return { kind, tier, ids: order.slice(0, 3) };
  }
  return { kind };
}

// What a seated patron needs from the case: The Monogrammist's three letters,
// and what The Counterfeiter lends.
function seatFor(id, deal, rng) {
  const seat = { id, data: {} };
  if (id === 'monogrammist') seat.data.letters = monogramFor(deal, rng);
  if (id === 'counterfeiter') seat.adds = { letter: '_', counterfeit: true, blank: true };
  return seat;
}

// What an editor rolls for the day: the Columnist's measure, the Serialist's
// letter, the Enthusiast's darling and the copy of it he lends.
const COLUMN_MEASURES = [6, 7, 8];
function deskFor(id, deal, rng) {
  const desk = { id, data: {} };
  const singles = [...new Set(deal.tiles.map(t => t.letter).filter(L => /^[A-Z]$/.test(L) && L !== 'Q'))];
  if (id === 'columnist') desk.data.n = pick(rng, COLUMN_MEASURES);
  if (id === 'serialist') desk.data.letter = pick(rng, singles);
  if (id === 'enthusiast') {
    // A letter worth three or more, so the rule bites: the long words a case
    // can set mostly hold its cheap letters already.
    const dear = singles.filter(L => TILE_POINTS[L] >= 3);
    desk.data.letter = pick(rng, dear.length ? dear : singles);
    desk.adds = { letter: desk.data.letter, ephemeral: true };
  }
  return desk;
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

// ─── What a seat brings ───────────────────────────────────────────────────────
// A patron or editor who lends a tile puts it at the end of the case, plain and
// undressed: The Scientist's OLOGY, The Counterfeiter's blank, the Enthusiast's
// darling letter.
export function withAdded(tiles, adds) {
  return [...tiles, { ...makeTileTemplate(adds.letter === '_' ? 'A' : adds.letter), id: tiles.length,
    letter: adds.letter, ...(adds.counterfeit ? { counterfeit: true } : {}),
    ...(adds.blank ? { blank: true } : {}), ...(adds.ephemeral ? { ephemeral: true } : {}) }];
}

// The Monogrammist's three letters, drawn from the case so that all three can
// be set: plain single letters only, likelier the more of them the case holds.
export function monogramFor(deal, rng) {
  const pool = deal.tiles.map(t => t.letter).filter(L => /^[A-Z]$/.test(L));
  const out = [];
  while (out.length < 3 && pool.length) {
    const L = pool[Math.floor(rng() * pool.length)];
    out.push(L);
    for (let i = pool.length - 1; i >= 0; i--) if (pool[i] === L) pool.splice(i, 1);
  }
  return out;
}

// ─── Numbering ────────────────────────────────────────────────────────────────
// Challenge № 1 is the first day of the proof; every day after is one more.
// While the mode is being tried out the page lets you walk to any number, so
// "today's" is only where it opens.
export const EPOCH = Date.UTC(2026, 10, 3);   // 3 November 2026 — № 1
export const todaysNumber = (now = new Date()) =>
  Math.max(1, Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - EPOCH) / 864e5) + 1);
