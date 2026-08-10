import { state, owns, paintRandomFaces, unpaintedFaces } from './state.js';
import {
  BAG_COUNTS, LIGATURES, TILE_POINTS, TRIMS, NICKS, COLOURS,
  PATRON_SLOTS, TILE_BASE_PRICE, SMELT_COST, REROLL_BASE,
  PAINT_PRICE, PAINT_PER_POT, FEATURE_CHAIN_CHANCE, MAX_FEATURES,
  makeTileTemplate,
} from './constants.js';
import { PATRON_DEFS, RARITY_WEIGHT, patronById } from './patrons.js';

// ─── Shop state (ephemeral between pages) ─────────────────────────────────────

export const foundry = {
  open: false,
  view: 'shop',          // 'shop' | 'case' (smelting view)
  rewardParts: [],
  rewardTotal: 0,
  patronOffers: [],      // [{ id, sold }]
  tileOffers: [],        // [{ template, price, sold }]
  paintOffers: [],       // [{ colour, price, sold }]
  rerollCost: REROLL_BASE,
  smeltSel: -1,          // selected collection index in case view
};

// ─── Offer generation ─────────────────────────────────────────────────────────

function buildLetterPool() {
  const pool = [];
  for (const [L, c] of Object.entries(BAG_COUNTS)) {
    for (let i = 0; i < Math.max(1, c); i++) pool.push(L);
  }
  LIGATURES.forEach(L => pool.push(L, L));
  return pool;
}
const LETTER_POOL = buildLetterPool();

const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function dualPairsFor(letter) {
  const pts = TILE_POINTS[letter] ?? 1;
  return Object.keys(TILE_POINTS)
    .filter(l => l !== letter && l.length === 1 && Math.abs(TILE_POINTS[l] - pts) <= 2);
}

// ─── Feature helpers ──────────────────────────────────────────────────────────
// A tile's "features" are the things that make it worth owning. Counting and
// topping them up lets the draft offer genuinely loaded tiles.

export function featureCount(t) {
  return (t.colour ? 1 : 0) + (t.trim ? 1 : 0) + (t.nick ? 1 : 0)
       + (t.letterType === 'dual' ? 1 : 0) + (LIGATURES.includes(t.letter) ? 1 : 0);
}

// Add one feature the tile doesn't already have. Returns false when it's full.
export function addRandomFeature(tmpl) {
  const missing = [];
  if (!tmpl.colour) missing.push('colour');
  if (!tmpl.trim)   missing.push('trim');
  if (!tmpl.nick)   missing.push('nick');
  if (tmpl.letterType !== 'dual' && !LIGATURES.includes(tmpl.letter)) missing.push('dual');

  while (missing.length) {
    const f = missing.splice(Math.floor(Math.random() * missing.length), 1)[0];
    if (f === 'colour') { tmpl.colour = pick(Object.keys(COLOURS)); return true; }
    if (f === 'trim')   { tmpl.trim   = pick(Object.keys(TRIMS));   return true; }
    if (f === 'nick')   { tmpl.nick   = pick(Object.keys(NICKS));   return true; }
    if (f === 'dual') {
      const pairs = dualPairsFor(tmpl.letter);
      if (pairs.length) { tmpl.letterType = 'dual'; tmpl.altLetter = pick(pairs); return true; }
      // no valid partner for this letter — fall through and try another feature
    }
  }
  return false;
}


// How many features this tile gets: one for free, then keep rolling.
function rollFeatureCount(floor = 1) {
  let n = 1;
  while (n < MAX_FEATURES && Math.random() < FEATURE_CHAIN_CHANCE) n++;
  return Math.max(floor, n);
}

// A tile worth offering: never bare, occasionally loaded.
export function randomSpecialTile(floor = 1) {
  const tmpl = makeTileTemplate(pick(LETTER_POOL));
  const target = rollFeatureCount(floor);
  while (featureCount(tmpl) < target && addRandomFeature(tmpl)) { /* keep adding */ }
  return tmpl;
}

export function randomTileOffer() {
  const tmpl = randomSpecialTile();
  return { template: tmpl, price: tilePrice(tmpl), sold: false };
}

export function tilePrice(tmpl) {
  let p = TILE_BASE_PRICE;
  if (tmpl.trim) p += TRIMS[tmpl.trim]?.price ?? 0;
  if (tmpl.nick) p += NICKS[tmpl.nick]?.price ?? 0;
  if (tmpl.colour) p += 1;
  if (tmpl.altColour) p += 1;
  if (tmpl.letterType === 'dual') p += 1;
  if (LIGATURES.includes(tmpl.letter)) p += 1;
  return p;
}

function weightedPatronSample(n) {
  const ownedIds = new Set(state.patrons.map(p => p.id));
  const pool = [];
  for (const def of PATRON_DEFS) {
    if (ownedIds.has(def.id)) continue;
    for (let i = 0; i < (RARITY_WEIGHT[def.rarity] ?? 1); i++) pool.push(def.id);
  }
  const out = [];
  while (out.length < n && pool.length) {
    const id = pick(pool);
    out.push({ id, sold: false });
    for (let i = pool.length - 1; i >= 0; i--) if (pool[i] === id) pool.splice(i, 1);
  }
  return out;
}

function rollPaintOffers() {
  const colours = [...Object.keys(COLOURS)];
  const out = [];
  for (let i = 0; i < 2 && colours.length; i++) {
    const c = pick(colours);
    colours.splice(colours.indexOf(c), 1);
    out.push({ colour: c, price: PAINT_PRICE, sold: false });
  }
  return out;
}

function rollOffers() {
  foundry.patronOffers = weightedPatronSample(3);
  foundry.tileOffers   = Array.from({ length: 4 }, randomTileOffer);
  foundry.paintOffers  = rollPaintOffers();
}

// ─── Open / close ─────────────────────────────────────────────────────────────

export function openFoundry(rewardParts, rewardTotal) {
  state.inFoundry = true;
  foundry.open = true;
  foundry.view = 'shop';
  foundry.rewardParts = rewardParts;
  foundry.rewardTotal = rewardTotal;
  foundry.rerollCost = REROLL_BASE;
  foundry.smeltSel = -1;
  rollOffers();
}

// Restore a shop snapshot from a saved game
export function restoreFoundry(snapshot) {
  Object.assign(foundry, snapshot, { open: true });
  foundry.paintOffers ??= [];
  state.inFoundry = true;
}

export function foundrySnapshot() {
  const { open, ...rest } = foundry;
  return JSON.parse(JSON.stringify(rest));
}

export function closeFoundry() {
  state.inFoundry = false;
  foundry.open = false;
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export function buyPatron(id) {
  const offer = foundry.patronOffers.find(o => o.id === id && !o.sold);
  const def = patronById(id);
  if (!offer || !def)                      return { ok: false, reason: 'Not available.' };
  if (state.patrons.length >= PATRON_SLOTS) return { ok: false, reason: 'No empty seats at your table.' };
  if (state.coins < def.cost)              return { ok: false, reason: `You need ${def.cost} Coins.` };
  state.coins -= def.cost;
  state.patrons.push({ id });
  offer.sold = true;
  return { ok: true, def };
}

export function sellPatron(id) {
  const i = state.patrons.findIndex(p => p.id === id);
  const def = patronById(id);
  if (i < 0 || !def) return { ok: false };
  const refund = Math.floor(def.cost / 2);
  state.patrons.splice(i, 1);
  state.coins += refund;
  return { ok: true, refund, def };
}

export function buyTile(idx) {
  const offer = foundry.tileOffers[idx];
  if (!offer || offer.sold)        return { ok: false, reason: 'Not available.' };
  if (state.coins < offer.price)   return { ok: false, reason: `You need ${offer.price} Coins.` };
  state.coins -= offer.price;
  state.collection.push(JSON.parse(JSON.stringify(offer.template)));
  offer.sold = true;
  return { ok: true, template: offer.template };
}

export function buyPaint(idx) {
  const offer = foundry.paintOffers[idx];
  if (!offer || offer.sold)        return { ok: false, reason: 'Not available.' };
  if (!unpaintedFaces().length)    return { ok: false, reason: 'Every letter is already painted.' };
  if (state.coins < offer.price)   return { ok: false, reason: `You need ${offer.price} Coins.` };
  state.coins -= offer.price;
  const painted = paintRandomFaces(offer.colour, PAINT_PER_POT);
  offer.sold = true;
  return { ok: true, colour: offer.colour, painted };
}

export function smeltTile(collectionIdx) {
  if (collectionIdx < 0 || collectionIdx >= state.collection.length) return { ok: false };
  if (state.collection.length <= 12) return { ok: false, reason: 'Your collection is too small to smelt further.' };
  if (state.coins < SMELT_COST)      return { ok: false, reason: `Smelting costs ${SMELT_COST} Coins.` };
  state.coins -= SMELT_COST;
  const [removed] = state.collection.splice(collectionIdx, 1);
  foundry.smeltSel = -1;
  return { ok: true, removed };
}

export function rerollFoundry() {
  if (state.coins < foundry.rerollCost) return false;
  state.coins -= foundry.rerollCost;
  foundry.rerollCost += 1;
  rollOffers();
  return true;
}
