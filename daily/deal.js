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
  BAG_COUNTS, TILE_POINTS, COLOURS, CURSED_MAX_POINTS, dualPairsFor, makeTileTemplate, isImmutable,
} from '../js/constants.js';

// Bump the salt and every challenge is re-dealt — for when the tuning below
// changes enough that the old numbers should not keep their old cases.
// v2: the marks and squib lead taken out of the case.
// v3: the week — patrons, editors and two-word days.
// v4: № 1 moved to 5 November, and Tuesday's patrons dealt what they read.
export const DEAL_SALT = 'great-work-daily-v4';
// Printed proofs are kept under the salt (daily/main.js), so a re-dealt case
// never reopens on an old proof; the front door (js/door.js) reads them too.
export const PROOF_STORE = DEAL_SALT;
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
  // A floor, on the days no patron sits (plain days and two-word days, since 5
  // November): with no one seated, the dressing is the whole of what makes the
  // case this game's rather than Scrabble's, so such a case dressed on fewer
  // sorts than this is dressed up to it, one feature on each sort added. One or
  // two dressed sorts is what the author found too thin; a day with a patron
  // or an editor may be as thin as the dice deal it.
  plainFloor: 3,
  // Which feature a roll lands on. Paint leads because colour is the game's
  // multiplicative engine — a case without it plays like Scrabble.
  weights: { paint: 4, silver: 2, purple: 1.5, nick: 2, dual: 1.5 },
  // Per tile, before features: the chance the sort is something other than a
  // plain letter. Small — these are finds.
  ligature: 0.03,
  medieval: 0.01,
  // The chance a tool is on the bench, and which: half the time the ratchet,
  // otherwise the loupe or a tube of one of the four paints, evenly (since 5
  // November; until then the ratchet and the loupe, 55 to 45).
  tool: 0.35,
  tools: [['ratchet', 50], ['loupe', 10],
    ['tube-crimson', 10], ['tube-azure', 10], ['tube-jade', 10], ['tube-amber', 10]],
  vowels: [5, 7],          // the case holds between these many vowels, inclusive
};

// A tube offers this many tiles, and you paint one of them. The game's tube
// offers two (TUBE_CHOICES in js/constants.js); a day's case is all you have,
// so the daily's offers three, for the choice of which colour to stack where.
export const TUBE_OFFER = 3;

const LIGATURE_WEIGHTS = [['TH', 3], ['CH', 3], ['ING', 2], ['CK', 1], ['WH', 1]];
const MEDIEVAL_WEIGHTS = [['Þ', 3], ['Ȝ', 2], ['Æ', 2], ['Ƿ', 1]];
const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);

// ─── The almanac ──────────────────────────────────────────────────────────────
// Here: how often each is drawn, and what it does to the odds. The page never
// names the omen; it names what the case turned out to be (traitsOf, below),
// which is usually the omen's own trait and borrows its name. `weights` multiplies the feature weights;
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
  oldstock:   { odds: 1.5, force: { medieval: 1 } },
  hellbox:    { odds: 1.5, force: { cursed: 1 } },
  fat:        { odds: 1.5, dressed: 1.7 },
  lean:       { odds: 1.5, dressed: 0.35 },
  toolchest:  { odds: 2, force: { tool: true } },
};

// ─── The deal ─────────────────────────────────────────────────────────────────
export function dealChallenge(n, opts = {}) {
  const day = opts.day ?? dayOf(n);
  const pair = day.kind === 'pair';
  // A day with a choice of patrons has its decision already: no tool joins
  // it (since 5 November), so the almanac's Toolchest is off its pages too.
  const choice = day.kind === 'choice';
  const { size = pair ? PAIR.size : CASE_SIZE, vowels = pair ? PAIR.vowels : LUCK.vowels, salt = '' } = opts;
  const rng = rngFor(`${DEAL_SALT}:${salt}${n}`);
  // A two-word day draws from the almanac's quieter pages: no tool and no
  // cursed iron, whose rules are written for one word (the toll is charged to
  // "a word set without it", and a case of two words always sets one).
  const omens = Object.entries(OMENS).filter(([id]) =>
    !(pair && PAIR.noOmens.includes(id)) && !(choice && id === 'toolchest'));
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
  // A seat that reads particular letters gets them (SEAT_SHAPES). A letter
  // dealt in takes the place of one of its own kind, vowel for vowel, so the
  // vowel band holds, and what is dealt in is set aside from the letterforms
  // below, so no ligature or medieval sort takes it.
  const shape = shapeFor(day);
  const keep = shapeLetters(letters, shape, rng);
  const tiles = letters.map((L, id) => ({ ...makeTileTemplate(L), id }));
  const consonants = () => tiles.filter(t => !keep.has(t.id) && !VOWELS.has(t.letter) && t.letter.length === 1
    && TILE_POINTS[t.letter] != null && /^[A-Z]$/.test(t.letter));

  // 2. Letterforms. A ligature or a medieval sort replaces a consonant, so the
  //    vowel band holds; Æ is the exception, a vowel standing in for a vowel.
  const recast = (t, letter) => { t.letter = letter; };
  const forcedLig = (force.ligatures ?? 0) + shape.ligatures;
  for (let k = 0; k < forcedLig; k++) {
    const c = consonants(); if (!c.length) break;
    recast(pick(rng, c), pickWeighted(rng, LIGATURE_WEIGHTS));
  }
  const forcedMed = force.medieval ?? 0;
  for (let k = 0; k < forcedMed; k++) placeMedieval(rng, tiles, consonants);
  for (const t of tiles) {
    if (!/^[A-Z]$/.test(t.letter) || VOWELS.has(t.letter) || keep.has(t.id)) continue;
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
  // 3¼. The unseated day's floor. A case already at it draws nothing here, so
  //     every case at or over it is dealt exactly as it was before the floor.
  if (day.kind === 'plain' || pair) {
    const isDressed = t => t.colour || t.trim || t.nick || t.letterType === 'dual' || t.material;
    const bare = tiles.filter(t => !isDressed(t) && Object.keys(weights).some(f => canTake(t, f)));
    while (tiles.filter(isDressed).length < LUCK.plainFloor && bare.length) {
      const t = bare.splice(Math.floor(rng() * bare.length), 1)[0];
      dress(rng, t, pickWeighted(rng, Object.entries(weights).filter(([f]) => canTake(t, f))));
    }
  }

  // 3½. Paint the seat reads, dealt in when the features above left it short.
  paintFor(tiles, shape.paint, rng);

  // 4. Metals the almanac casts.
  if (force.cursed) {
    // Never on a dear letter (CURSED_MAX_POINTS): a curse has to be something
    // you can build a word around.
    const ok = tiles.filter(t => /^[A-Z]$/.test(t.letter) && TILE_POINTS[t.letter] <= CURSED_MAX_POINTS);
    if (ok.length) pick(rng, ok).material = 'cursed';
  }

  // 5. The bench.
  const toolRoll = rng();
  let tool = !pair && !choice && (force.tool || toolRoll < LUCK.tool) ? pickWeighted(rng, LUCK.tools) : null;
  // A tube's offer is dealt with the case, so every reader is offered the same
  // tiles: unpainted ones the game would let a tube take, of different letters
  // where the case has them, drawn after everything else so that no other
  // day's case moves. Each offered tile carries the tube's colour.
  let tube = null;
  if (tool?.startsWith('tube-')) {
    tube = tool.slice(5);
    tool = 'tube';
    const open = tiles.filter(t => !t.colour && !isImmutable(t) && !t.blank);
    for (let i = open.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [open[i], open[j]] = [open[j], open[i]];
    }
    const letters = new Set(), offer = [];
    for (const t of open) if (offer.length < TUBE_OFFER && !letters.has(t.letter)) { offer.push(t); letters.add(t.letter); }
    for (const t of open) if (offer.length < TUBE_OFFER && !offer.includes(t)) offer.push(t);
    for (const t of offer) t.paintOffer = tube;
    if (!offer.length) { tool = null; tube = null; }
  }

  // 6. The table: who sits today, rolled on a stream of its own so the case
  //    above is the same whoever is seated.
  const srng = rngFor(`${DEAL_SALT}:seat:${n}`);
  const deal = { n, omen: omenId, tiles, tool, day: { kind: day.kind } };
  if (tube) deal.tube = tube;
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
// reader picks a patron from two.
//
// Who sits is chosen by turn rather than by chance: each roster is shuffled
// once per lap of it, so every patron and every editor comes round before any
// comes round twice.
//
// The rosters are the cull. tools/daily-table.mjs measured every patron the
// game has against sixty cases, and a patron is here only if it changes WHICH
// word is best on a good share of them — README.md, "The table", has the
// figures and the reasons for each one left out.
export const WEEK = ['choice', 'plain', 'patron', 'plain', 'editor', 'choice', 'pair'];   // Sunday first

// Seated for everyone: each moves the best word to a different word on three
// cases in ten to nearly all, and none is ever without a word to fire on.
export const DAY_PATRONS = [
  'sexton', 'counterfeiter', 'paramour', 'athlete', 'poppet', 'cartographer',
  'vulgarian', 'monogrammist', 'poet', 'herald',
  // Licences, 4 November: each changes what counts as a word.
  'expectants', 'haplographer', 'bookbinder',
  // Out of the choice tiers, 4 November: their pay is Points or a tile's own
  // value, which can't be weighed against another patron's ×Mult.
  'serpent', 'twins',
  'seadog', 'sculptor',
  // The weaker seats, 4 November: on a day nobody chooses, a patron need not
  // move the best word, only pay — and the deal gives each what it reads.
  'apprentice', 'jeweller', 'novelist', 'typesetter', 'stammerer',
  'romeo', 'juliet', 'siren', 'firebrand',
];
// Offered two at a time, from one tier. A tier is patrons that pay the SAME
// WAY, so the choice is between two words to look for, never between two kinds
// of pay a player can't weigh (+Points against ×Mult, say): ×3 for a themed
// word on Sunday, ×2 for a word of a given form on Friday, every pair of a tier
// once a lap. (Until 4 November the tiers were cut by how often each patron
// gave the solver's single best word, which no player is setting; the Twins,
// the Serpent and the Monogrammist, whose pay is Points or a tile's own value,
// moved to Tuesday then.)
export const CHOICE_TIERS = {
  // ×3 for a word on a themed list.
  rich:  ['sexton', 'paramour', 'poppet', 'vulgarian', 'seadog'],
  // ×2 for a word of a given form. Four are the daily's own ×2 versions of
  // patrons that pay otherwise in the game (adapted in daily/table.js), and
  // the Herald's and the Antiquary's days are dealt what they read
  // (SEAT_SHAPES). The Athlete pays on twice as many good words as the most
  // generous of these, so he sits on Tuesday instead — and so, since the noun
  // list grew (4 November) to every word whose ordinary meaning is a noun, does
  // the Sculptor, at 43%.
  plain: ['herald', 'cartographer', 'poet', 'stammerer', 'yodeller', 'antiquary', 'commoner'],
};
// Each bites: the best word unseated is spiked on a quarter to all of cases,
// and the best word under them is a different one on two-fifths or more.
export const EDITOR_DAYS = ['columnist', 'populist', 'serialist', 'enthusiast', 'minimalist', 'redactor'];
// The Redactor joined on 5 November, from the next Thursday (№ 8): the days
// before keep the roster they were dealt, and the new one counts its turns
// from there, on a seed of its own, so its first lap seats every editor.
const EDITOR_DAYS_BEFORE = EDITOR_DAYS.filter(id => id !== 'redactor');
const REDACTOR_FROM = 8;
// The Redactor's drafts: so many of the case's sorts are wrapped, and spell
// and nothing else, as the game's wrapped tiles do (spellsOnly in
// js/state.js). The game wraps a third of the collection (REDACTOR_SHARE in
// js/bosses.js); a third of sixteen is five.
export const REDACTOR_WRAPS = 5;

// A two-word day: a bigger case, and both words at least five letters, so
// neither can be a scrap left over from the other. Added together, the sum of
// a long word and a scrap is all but the long word alone; the floor makes the
// split the puzzle. (It was six, where the length multiplier begins, until 4
// November; five plays as well, and on six measured cases moved the best pair
// on one.)
export const PAIR = { size: 20, vowels: [7, 9], min: 5, noOmens: ['hellbox', 'toolchest'] };

export const weekdayOf = n => new Date(EPOCH + (n - 1) * 864e5).getUTCDay();
// How many of this weekday came before № n. Each weekday falls once in every
// seven numbers from № 1, so this counts every kind of day's turns from 0,
// whatever weekday № 1 was (counting calendar weeks instead skipped the first
// turn of any day that fell before № 1 in its week).
const turnOf = n => Math.floor((n - 1) / 7);

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
  const w = turnOf(n);
  if (kind === 'patron') return { kind, id: turn(DAY_PATRONS, w, 'patron') };
  if (kind === 'editor') {
    return n < REDACTOR_FROM ? { kind, id: turn(EDITOR_DAYS_BEFORE, w, 'editor') }
      : { kind, id: turn(EDITOR_DAYS, turnOf(n) - turnOf(REDACTOR_FROM), 'editor:6') };
  }
  if (kind === 'choice') {
    // Sunday offers two of the rich tier, Friday two of the plain, so the
    // choice days alternate. (Until 4 November there was only Sunday, and the
    // tiers alternated by week.)
    const friday = weekdayOf(n) === 5;
    const tier = friday ? 'plain' : 'rich';
    // Every pair of the tier once a lap, in a shuffled order, as the forced
    // patrons rotate: no pair comes round again until all the others have.
    const pool = CHOICE_TIERS[tier];
    const pairs = pool.flatMap((a, i) => pool.slice(i + 1).map(b => [a, b]));
    return { kind, tier, ids: turn(pairs, w, `choice:${tier}`) };
  }
  return { kind };
}

// What a day's seat must find in the case, dealt in when the draw didn't:
//   letters — at least so many of a letter: the Bookbinder's V (the accent)
//             and O's (the howl); the Serpent's S, forced on everyone, without
//             which a tenth of cases left him nothing.
//   pairs   — at least so many letters held twice (none asks for it now: dealing
//             the Herald pairs moved him from 3% of good words to 5%).
//   rare    — at least so many of J, X, Z and QU between them: the Antiquary's
//             two, on any day he is seated or offered (one until 5 November).
//   ligatures — so many consonants recast as ligatures: the Typesetter's, who
//             otherwise found nothing to pay for on two cases in five.
//   paint   — at least so many tiles of a colour, painted after the features:
//             the Siren's azure (one of them a vowel), the Firebrand's crimson,
//             and for Romeo and Juliet three of their own colour and one of the
//             rival's, to keep out of the word. (Two and two left either paying
//             on almost no good word: the best words wore both or neither.)
//             One, not two: with two he paid on 27% of good words, the most of
//             any ×2 on Friday by half again; with one, 16%.
const SEAT_SHAPES = {
  bookbinder: { letters: { V: 1, O: 2 } },
  serpent:    { letters: { S: 1 } },
  antiquary:  { rare: 2 },
  typesetter: { ligatures: 2 },
  siren:      { paint: { azure: 2, azureVowel: 1 } },
  firebrand:  { paint: { crimson: 3 } },
  romeo:      { paint: { amber: 3, jade: 1 } },
  juliet:     { paint: { jade: 3, amber: 1 } },
  jeweller:   { rare: 1 },
};
const RARE = ['J', 'X', 'Z', 'QU'];
function shapeFor(day) {
  const ids = day.kind === 'patron' ? [day.id] : day.kind === 'choice' ? day.ids : [];
  const out = { letters: {}, pairs: 0, rare: 0, ligatures: 0, paint: {} };
  for (const id of ids) {
    const s = SEAT_SHAPES[id] ?? {};
    for (const [L, k] of Object.entries(s.letters ?? {})) out.letters[L] = Math.max(out.letters[L] ?? 0, k);
    for (const [c, k] of Object.entries(s.paint ?? {})) out.paint[c] = Math.max(out.paint[c] ?? 0, k);
    out.pairs = Math.max(out.pairs, s.pairs ?? 0);
    out.rare = Math.max(out.rare, s.rare ?? 0);
    out.ligatures = Math.max(out.ligatures, s.ligatures ?? 0);
  }
  return out;
}

// Paints tiles to the seat's shape, in place. A tile already wearing another
// colour the shape wants, or one cast in a metal, is left alone; an unpainted
// letter is taken first, and a tile of a colour the shape doesn't mention only
// when there is no other.
function paintFor(tiles, paint, rng) {
  const wants = Object.keys(paint).filter(c => c in COLOURS);
  if (!wants.length) return;
  const pick = a => a[Math.floor(rng() * a.length)];
  const free = t => !t.material && /^[A-Z]$/.test(t.letter) && !wants.includes(t.colour);
  const take = (c, filter = () => true) => {
    const bare = tiles.filter(t => free(t) && !t.colour && filter(t));
    const pool = bare.length ? bare : tiles.filter(t => free(t) && filter(t));
    if (!pool.length) return false;
    pick(pool).colour = c;
    return true;
  };
  if (paint.azureVowel && !tiles.some(t => t.colour === 'azure' && VOWELS.has(t.letter))) take('azure', t => VOWELS.has(t.letter));
  for (const c of wants) {
    let have = tiles.filter(t => t.colour === c).length;
    while (have < paint[c] && take(c)) have++;
  }
}
// Deals the shape into the drawn letters, in place; returns the positions to
// keep from the letterforms.
function shapeLetters(letters, shape, rng) {
  const keep = new Set();
  const pick = a => a[Math.floor(rng() * a.length)];
  const single = x => /^[A-Z]$/.test(x);
  for (const [L, k] of Object.entries(shape.letters)) {
    const vowel = VOWELS.has(L);
    let have = letters.filter(x => x === L).length;
    while (have < k) {
      const at = letters.flatMap((x, i) => (x !== L && !keep.has(i) && single(x) && VOWELS.has(x) === vowel ? [i] : []));
      if (!at.length) break;
      const i = pick(at);
      letters[i] = L; keep.add(i); have++;
    }
    letters.forEach((x, i) => { if (x === L) keep.add(i); });
  }
  if (shape.rare) {
    let have = letters.filter(x => RARE.includes(x)).length;
    while (have < shape.rare) {
      const at = letters.flatMap((x, i) => (!keep.has(i) && single(x) && !VOWELS.has(x) && !RARE.includes(x) ? [i] : []));
      if (!at.length) break;
      const i = pick(at);
      letters[i] = pick(RARE); keep.add(i); have++;
    }
    letters.forEach((x, i) => { if (RARE.includes(x)) keep.add(i); });
  }
  if (shape.pairs) {
    const count = () => { const c = {}; for (const x of letters) if (single(x)) c[x] = (c[x] ?? 0) + 1; return c; };
    let c = count();
    while (Object.values(c).filter(n => n >= 2).length < shape.pairs) {
      // A letter held once is matched by recasting another of its kind — one
      // that is held once too, or three times or more, so no pair is broken.
      const lone = Object.keys(c).filter(L => c[L] === 1);
      const L = lone.length ? pick(lone) : null;
      if (!L) break;
      const at = letters.flatMap((x, i) => (x !== L && !keep.has(i) && single(x) && VOWELS.has(x) === VOWELS.has(L) && c[x] !== 2 ? [i] : []));
      if (!at.length) { delete c[L]; if (!Object.keys(c).some(x => c[x] === 1)) break; continue; }
      const i = pick(at);
      letters[i] = L;
      letters.forEach((x, j) => { if (x === L) keep.add(j); });
      c = count();
    }
  }
  return keep;
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
  if (id === 'redactor') {
    // Never a metal, whose rules would outlive the paper, nor a tile the tube
    // is offering. A wrapped sort is dealt bare: nothing shows through.
    const open = deal.tiles.filter(t => !t.material && !t.paintOffer && !t.blank && !t.ephemeral);
    for (let i = open.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [open[i], open[j]] = [open[j], open[i]];
    }
    for (const t of open.slice(0, REDACTOR_WRAPS)) Object.assign(t, { wrapped: true, colour: null, trim: null, nick: null });
    desk.data.n = Math.min(REDACTOR_WRAPS, open.length);
  }
  return desk;
}

// One medieval sort to a case at most: two is more strangeness than a word wants.
function placeMedieval(rng, tiles, candidates) {
  const sort = pickWeighted(rng, MEDIEVAL_WEIGHTS);
  if (tiles.some(t => MEDIEVAL_SORTS.includes(t.letter))) return;
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

// ─── What the day is, at a glance ─────────────────────────────────────────────
// The masthead names a case by what is most worth knowing about it before a
// sort is set — read off the case as dealt, not off the almanac page that
// tilted the dice, since a fair page can deal a lean case and a wet-ink page a
// dry one. In order of how much each changes the way the case is played:
//
//   1. who sits — two words, a choice of patrons, a patron, an editor
//   2. Hellbox iron — one letter every good word must hold
//   3. how dressed the case is — mostly plain, or mostly dressed
//   4. a tool on the bench
//   5. strange letterforms — medieval sorts, ligatures
//   6. one dressing far commoner than usual — paint, silver, purple, nicks, faces
//
// Returns every trait the case has, most salient first; the masthead shows the
// first and a tap lists them all. Thresholds are set per sixteen sorts, at
// about the tenth and ninetieth percentile of a Fair Copy deal, so a label
// marks a case that looks unusual rather than one the omen merely nudged.
export const TRAIT_BARS = {
  lean: 4, fat: 11,                                  // dressed sorts, per sixteen
  paint: 7, silver: 5, purple: 4, nick: 5, dual: 4,  // one dressing, per sixteen
  ligatures: 2, medieval: 1,
};
export function traitsOf(deal) {
  const out = [];
  const t = deal.tiles;
  const per16 = n => (n * 16) / t.length;
  const count = f => t.filter(f).length;
  const day = deal.day?.kind;
  if (day === 'pair') out.push('twoUp');
  if (day === 'choice') out.push('choice');
  if (day === 'patron') out.push('patron');
  if (day === 'editor') out.push('deadline');
  if (t.some(x => x.material === 'cursed')) out.push('hellbox');
  const dressed = per16(count(x => x.colour || x.trim || x.nick || x.letterType === 'dual' || x.material));
  if (dressed <= TRAIT_BARS.lean) out.push('lean');
  if (dressed >= TRAIT_BARS.fat) out.push('fat');
  if (deal.tool) out.push(deal.tool);
  if (count(x => MEDIEVAL_SORTS.includes(x.letter)) >= TRAIT_BARS.medieval) out.push('oldstock');
  if (count(x => LIGATURE_SORTS.includes(x.letter)) >= TRAIT_BARS.ligatures) out.push('tied');
  // The dressing furthest over its bar, if any is over at all.
  const tilts = [
    ['wetink', per16(count(x => x.colour)) / TRAIT_BARS.paint],
    ['silver', per16(count(x => x.trim === 'silver')) / TRAIT_BARS.silver],
    ['purple', per16(count(x => x.trim === 'purple')) / TRAIT_BARS.purple],
    ['blade',  per16(count(x => x.nick)) / TRAIT_BARS.nick],
    ['double', per16(count(x => x.letterType === 'dual')) / TRAIT_BARS.dual],
  ].filter(([, r]) => r >= 1).sort((a, b) => b[1] - a[1]);
  out.push(...tilts.map(([k]) => k));
  if (!out.length) out.push('fair');
  return out;
}
const MEDIEVAL_SORTS = MEDIEVAL_WEIGHTS.map(([L]) => L);
const LIGATURE_SORTS = LIGATURE_WEIGHTS.map(([L]) => L);

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
export const EPOCH = Date.UTC(2026, 10, 5);   // 5 November 2026 — № 1
export const todaysNumber = (now = new Date()) =>
  Math.max(1, Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - EPOCH) / 864e5) + 1);
