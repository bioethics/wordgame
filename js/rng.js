// The run's dice.
//
// Every roll the game makes — the bag's shuffle, the Market's offers, the
// editors' choices, every chance a patron takes — comes from here, from one
// generator seeded as the run begins: with a seed drawn fresh for the run, or
// one typed on the prospectus to deal a run again. The same seed and the same
// moves make the same run, so a bug report that names its seed (the run report
// does) can be played again, move for move. The generator's position rides in
// the save (state.js), so a reload carries on the sequence where it stood.
//
// What only the eye sees — a sparkle's angle, whether a patron speaks up and
// which line it says — stays on Math.random, so a faster animation setting or a
// new quip can never move a run's rolls.
//
// sfc32, seeded through cyrb128: small, fast, and far better than a run needs.

let a = 0x9e3779b9, b = 0x243f6a88, c = 0xb7e15162, d = 1;

function cyrb128(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

// A float in [0, 1), as Math.random gives.
export function random() {
  a |= 0; b |= 0; c |= 0; d |= 0;
  const t = (((a + b) | 0) + d) | 0;
  d = (d + 1) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) | 0;
  return (t >>> 0) / 4294967296;
}

// The part of a seed the dice are cut from. Case, spaces and dashes are
// forgiven, so a seed copied out by hand — "abcd efgh" for ABCD-EFGH — still
// finds its run.
const seedKey = seed => String(seed ?? '').toUpperCase().replace(/[\s-]+/g, '');
export const sameSeed = (x, y) => seedKey(x) === seedKey(y);

export function seedRng(seed) {
  [a, b, c, d] = cyrb128(seedKey(seed));
  // The first few outputs of a freshly seeded sfc32 are still close to the seed.
  for (let i = 0; i < 15; i++) random();
}

// Where the dice stand, for the save — and back again. False when what was
// saved is not a position, and the caller seeds afresh.
export const rngState = () => [a >>> 0, b >>> 0, c >>> 0, d >>> 0];
export function setRngState(s) {
  if (!Array.isArray(s) || s.length !== 4 || !s.every(Number.isInteger)) return false;
  [a, b, c, d] = s;
  return true;
}

// A seed to write down: eight characters with nothing easily misread in them
// (no 0/O, no 1/I/L), from the crypto source rather than the dice it seeds.
const SEED_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export function freshSeed() {
  const bytes = globalThis.crypto?.getRandomValues
    ? globalThis.crypto.getRandomValues(new Uint8Array(8))
    : Uint8Array.from({ length: 8 }, () => Math.floor(Math.random() * 256));
  const chars = [...bytes].map(v => SEED_ALPHABET[v % SEED_ALPHABET.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

// A typed seed can be any word, date or name, and is kept to be shown back in
// capitals. Only letters, digits, spaces and dashes are kept — anything else is
// dropped as it is typed in — so a seed is safe to print anywhere as it stands.
// One copied by hand from a drawn seed goes back into the drawn seed's form, so
// "mr2g k3z5" is shown as the MR2G-K3Z5 it deals — but only when it looks like
// one (four and four, split or holding a digit), so PANTHERS stays a word.
// SEED_MAX is the field's limit.
export const SEED_MAX = 24;
export function tidySeed(s) {
  const kept = String(s ?? '').toUpperCase()
    .replace(/[^A-Z0-9 -]+/g, '').replace(/\s+/g, ' ').trim().slice(0, SEED_MAX);
  const shape = kept.match(/^([A-Z0-9]{4})([ -]?)([A-Z0-9]{4})$/);
  if (!shape) return kept;
  const [, head, split, tail] = shape;
  const drawable = [...head + tail].every(ch => SEED_ALPHABET.includes(ch));
  return drawable && (split || /\d/.test(head + tail)) ? `${head}-${tail}` : kept;
}
