import {
  state, adoptTemplate, shuffle, effectivePatronSlots, effectiveSundrySlots,
} from './state.js';
import {
  BAG_COUNTS, LIGATURES, TILE_POINTS, TRIMS, NICKS, COLOURS,
  TILE_BASE_PRICE, REROLL_BASE,
  SUNDRY_OFFERS, TUBE_PRICE, RESHUFFLE_PRICE, SUNDRY_SELL,
  STALL_DEFS, STALLS_PER_SHOP, GILDER_RANGE, SMELT_MIN_COLLECTION,
  FEATURE_CHAIN_CHANCE, MAX_FEATURES,
  makeTileTemplate,
} from './constants.js';
import { PATRON_DEFS, RARITY_WEIGHT, patronById } from './patrons.js';

// ─── Shop state (ephemeral between pages) ─────────────────────────────────────

export const market = {
  open: false,
  view: 'shop',          // 'shop' | 'stall' | 'collection'
  rewardParts: [],
  rewardTotal: 0,
  patronOffers: [],      // [{ id, sold }]
  tileOffers: [],        // [{ template, price, sold }]
  sundryOffers: [],      // [{ kind: 'tube', colour, price, sold }]
  stalls: [],            // [{ id, uses, proposals? }] — this visit's two stalls
  activeStall: null,     // stall id while view === 'stall'
  stallSel: -1,          // selected tid (gilder: proposal index)
  stallColour: null,     // the painter's chosen colour
  rerollCost: REROLL_BASE,
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

function featureCount(t) {
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

function randomTileOffer() {
  const tmpl = randomSpecialTile();
  return { template: tmpl, price: tilePrice(tmpl), sold: false };
}

function tilePrice(tmpl) {
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

function rollSundryOffers() {
  return shuffle([...Object.keys(COLOURS), 'reshuffle'])
    .slice(0, SUNDRY_OFFERS)
    .map(entry => entry === 'reshuffle'
      ? { kind: 'reshuffle', colour: null, price: RESHUFFLE_PRICE, sold: false }
      : { kind: 'tube', colour: entry, price: TUBE_PRICE, sold: false });
}

// Re-rolled by "New offers"; the stalls are not.
function rollOffers() {
  market.patronOffers = weightedPatronSample(3);
  market.tileOffers   = Array.from({ length: 4 }, randomTileOffer);
  market.sundryOffers = rollSundryOffers();
}

// ─── Stalls ───────────────────────────────────────────────────────────────────

export const stallById   = id => market.stalls.find(s => s.id === id);
export const stallPrice  = stall => (STALL_DEFS[stall.id]?.base ?? 1) * 2 ** stall.uses;

// The gilder's spread: up to GILDER_RANGE untrimmed tiles, each with a
// proposed trim attached. Re-rolled after every commission.
export function rollGilderProposals() {
  const untrimmed = state.collection.filter(t => !t.trim);
  return shuffle([...untrimmed])
    .slice(0, GILDER_RANGE)
    .map(t => ({ tid: t.tid, trim: pick(Object.keys(TRIMS)) }));
}

// Smelting can orphan a gilder proposal mid-visit
function pruneGilderProposals() {
  const gilder = stallById('gilder');
  if (!gilder?.proposals) return;
  gilder.proposals = gilder.proposals.filter(p =>
    state.collection.some(t => t.tid === p.tid && !t.trim));
}

function rollStalls() {
  const ids = shuffle([...Object.keys(STALL_DEFS)]).slice(0, STALLS_PER_SHOP);
  market.stalls = ids.map(id =>
    id === 'gilder' ? { id, uses: 0, proposals: rollGilderProposals() }
                    : { id, uses: 0 });
}

// ─── Open / close ─────────────────────────────────────────────────────────────

export function openMarket(rewardParts, rewardTotal) {
  state.inMarket = true;
  market.open = true;
  market.view = 'shop';
  market.rewardParts = rewardParts;
  market.rewardTotal = rewardTotal;
  market.rerollCost = REROLL_BASE;
  market.activeStall = null;
  market.stallSel = -1;
  market.stallColour = null;
  rollOffers();
  rollStalls();
}

// Restore a shop snapshot from a saved game
export function restoreMarket(snapshot) {
  Object.assign(market, snapshot, { open: true });
  market.sundryOffers ??= [];
  market.stalls ??= [];
  state.inMarket = true;
}

export function marketSnapshot() {
  const { open, ...rest } = market;
  return JSON.parse(JSON.stringify(rest));
}

export function closeMarket() {
  state.inMarket = false;
  market.open = false;
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export function buyPatron(id) {
  const offer = market.patronOffers.find(o => o.id === id && !o.sold);
  const def = patronById(id);
  if (!offer || !def)                                return { ok: false, reason: 'Not available.' };
  if (state.patrons.length >= effectivePatronSlots()) return { ok: false, reason: 'No empty seats at your table.' };
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

// Sundries go back for a pittance — the point is freeing the slot, not the coin.
export function sellSundry(idx) {
  const s = state.sundries[idx];
  if (!s) return { ok: false };
  state.sundries.splice(idx, 1);
  state.coins += SUNDRY_SELL;
  return { ok: true, refund: SUNDRY_SELL, sundry: s };
}

export function buyTile(idx) {
  const offer = market.tileOffers[idx];
  if (!offer || offer.sold)        return { ok: false, reason: 'Not available.' };
  if (state.coins < offer.price)   return { ok: false, reason: `You need ${offer.price} Coins.` };
  state.coins -= offer.price;
  state.collection.push(adoptTemplate(offer.template));
  offer.sold = true;
  return { ok: true, template: offer.template };
}

export function buySundry(idx) {
  const offer = market.sundryOffers[idx];
  if (!offer || offer.sold)                          return { ok: false, reason: 'Not available.' };
  if (state.sundries.length >= effectiveSundrySlots()) return { ok: false, reason: 'Your workbench is full.' };
  if (state.coins < offer.price)                     return { ok: false, reason: `You need ${offer.price} Coins.` };
  state.coins -= offer.price;
  state.sundries.push({ kind: offer.kind, colour: offer.colour });
  offer.sold = true;
  return { ok: true, offer };
}

export function rerollMarket() {
  if (state.coins < market.rerollCost) return false;
  state.coins -= market.rerollCost;
  market.rerollCost += 1;
  rollOffers();
  return true;
}

// A reshuffle sundry buys the same re-roll, free and without bumping the
// escalating cost — the state.js caller is responsible for consuming it.
export function freeRerollMarket() {
  rollOffers();
}

// ─── Stall purchases ──────────────────────────────────────────────────────────
// Each returns { ok, ... } like the buys above. On success the stall's price
// doubles (uses += 1) and the selection is cleared for the next round.

// Shared preamble: resolve the stall, its price, and the targeted tile.
function stallTarget(stallId, tid) {
  const stall = stallById(stallId);
  const tmpl  = state.collection.find(t => t.tid === tid);
  if (!stall || !tmpl) return null;
  return { stall, tmpl, price: stallPrice(stall) };
}

function payStall(stall, price) {
  state.coins -= price;
  stall.uses += 1;
  market.stallSel = -1;
}

export function stallSmelt(tid) {
  const t = stallTarget('smelter', tid);
  if (!t)                            return { ok: false, reason: 'Not available.' };
  if (state.collection.length <= SMELT_MIN_COLLECTION)
                                     return { ok: false, reason: 'Your collection is too small to smelt further.' };
  if (state.coins < t.price)         return { ok: false, reason: `You need ${t.price} Coins.` };
  payStall(t.stall, t.price);
  state.collection.splice(state.collection.indexOf(t.tmpl), 1);
  pruneGilderProposals();
  return { ok: true, removed: t.tmpl, price: t.price };
}

export function stallPaint(tid, colour) {
  const t = stallTarget('painter', tid);
  if (!t || !COLOURS[colour])        return { ok: false, reason: 'Pick a tile and a colour.' };
  if (state.coins < t.price)         return { ok: false, reason: `You need ${t.price} Coins.` };
  payStall(t.stall, t.price);
  t.tmpl.colour = colour;            // the front face; a dual's other face keeps its coat
  return { ok: true, tmpl: t.tmpl, colour, price: t.price };
}

export function stallGild(proposalIdx) {
  const stall = stallById('gilder');
  const proposal = stall?.proposals?.[proposalIdx];
  const tmpl = proposal && state.collection.find(t => t.tid === proposal.tid);
  if (!tmpl || tmpl.trim)            return { ok: false, reason: 'Not available.' };
  const price = stallPrice(stall);
  if (state.coins < price)           return { ok: false, reason: `You need ${price} Coins.` };
  payStall(stall, price);
  tmpl.trim = proposal.trim;
  stall.proposals = rollGilderProposals();
  return { ok: true, tmpl, trim: proposal.trim, price };
}

export function stallClone(tid) {
  const t = stallTarget('stereotyper', tid);
  if (!t)                            return { ok: false, reason: 'Not available.' };
  if (state.coins < t.price)         return { ok: false, reason: `You need ${t.price} Coins.` };
  payStall(t.stall, t.price);
  state.collection.push(adoptTemplate(t.tmpl));
  return { ok: true, tmpl: t.tmpl, price: t.price };
}

export const restorable = tmpl =>
  !!(tmpl.colour || tmpl.altColour || tmpl.trim || tmpl.nick);

export function stallRestore(tid) {
  const t = stallTarget('restorer', tid);
  if (!t || !restorable(t.tmpl))     return { ok: false, reason: 'That tile is already bare.' };
  if (state.coins < t.price)         return { ok: false, reason: `You need ${t.price} Coins.` };
  payStall(t.stall, t.price);
  t.tmpl.colour = null;
  t.tmpl.altColour = null;
  t.tmpl.trim = null;
  t.tmpl.nick = null;
  return { ok: true, tmpl: t.tmpl, price: t.price };
}
