import { state, owns } from './state.js';
import {
  BAG_COUNTS, LIGATURES, TILE_POINTS, CASTS, AURAS, COLOURS,
  PATRON_SLOTS, TILE_BASE_PRICE, SMELT_COST, REROLL_BASE,
  makeTileTemplate,
} from './constants.js';
import { PATRON_DEFS, RARITY_WEIGHT, patronById } from './patrons.js';

// ─── Foundry state (ephemeral between pages) ──────────────────────────────────

export const foundry = {
  open: false,
  view: 'shop',          // 'shop' | 'case' (smelting view)
  rewardParts: [],
  rewardTotal: 0,
  patronOffers: [],      // [{ id, sold }]
  tileOffers: [],        // [{ template, price, sold }]
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

function randomTileOffer() {
  const letter = pick(LETTER_POOL);
  const tmpl = makeTileTemplate(letter);

  const r = Math.random();
  if      (r < 0.40) tmpl.cast = 'plain';
  else if (r < 0.56) tmpl.cast = 'gilded';
  else if (r < 0.72) tmpl.cast = 'bold';
  else if (r < 0.86) tmpl.cast = 'master';
  else if (r < 0.94) tmpl.cast = 'resonant';

  if (Math.random() < 0.15) tmpl.aura   = pick(Object.keys(AURAS));
  if (Math.random() < 0.30) tmpl.colour = pick(Object.keys(COLOURS));

  if (Math.random() < 0.10 && !LIGATURES.includes(letter)) {
    const pairs = dualPairsFor(letter);
    if (pairs.length) {
      tmpl.letterType = 'dual';
      tmpl.altLetter  = pick(pairs);
    }
  }

  // A bare plain tile is a dull purchase — give it some colour half the time
  if (tmpl.cast === 'plain' && !tmpl.aura && !tmpl.colour && tmpl.letterType === 'normal') {
    if (Math.random() < 0.5) tmpl.colour = pick(Object.keys(COLOURS));
  }

  return { template: tmpl, price: tilePrice(tmpl), sold: false };
}

export function tilePrice(tmpl) {
  let p = TILE_BASE_PRICE;
  p += CASTS[tmpl.cast]?.price ?? 0;
  if (tmpl.aura) p += AURAS[tmpl.aura]?.price ?? 0;
  if (tmpl.colour) p += 1;
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

function rollOffers() {
  foundry.patronOffers = weightedPatronSample(3);
  foundry.tileOffers   = Array.from({ length: 4 }, randomTileOffer);
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

// Restore a foundry snapshot from a saved game
export function restoreFoundry(snapshot) {
  Object.assign(foundry, snapshot, { open: true });
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

export function smeltTile(collectionIdx) {
  if (collectionIdx < 0 || collectionIdx >= state.collection.length) return { ok: false };
  if (state.collection.length <= 12) return { ok: false, reason: 'Your type case is too small to smelt further.' };
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
