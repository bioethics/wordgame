import {
  state, adoptTemplate, shuffle, owns, trashFromCollection, nextId,
  effectivePatronSlots, effectiveSundrySlots,
} from './state.js';
import {
  BAG_COUNTS, LIGATURES, EXCLUSIVE_LETTERS, MARKS, MARK_WEIGHT, isMark,
  TILE_POINTS, TRIMS, NICKS, COLOURS,
  MATERIALS, INGOT_PRICE, INGOT_OFFER_CHANCE, isImmutable,
  COMPOST_HEAP_MAX, COMPOST_PER_MARKET,
  TILE_BASE_PRICE, REROLL_BASE,
  SUNDRY_OFFERS, TUBE_PRICE, RESHUFFLE_PRICE, RATCHET_PRICE, SUNDRY_SELL,
  STALL_DEFS, STALLS_PER_SHOP, PROPOSAL_RANGE, SMELT_MIN_COLLECTION,
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
  compostTaken: 0,       // tiles lifted from the compost heap this visit
  sundryOffers: [],      // [{ kind: 'tube', colour, price, sold }]
  stalls: [],            // [{ id, uses, proposals? }] — this visit's two stalls
  stallWear: {},         // stall id → uses this visit, surviving re-rolls (see rollStalls)
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
  // Exclusive letters belong to the patron that makes them and turn up
  // nowhere else — not in the shop, the draft, or the compost heap. QU is both
  // a ligature and a bag letter, so the loop above has already stocked it;
  // skip it here rather than serving it three times over.
  LIGATURES
    .filter(L => !EXCLUSIVE_LETTERS.includes(L) && !(L in BAG_COUNTS))
    .forEach(L => pool.push(L, L));
  MARKS.forEach(m => { for (let i = 0; i < MARK_WEIGHT; i++) pool.push(m); });
  return pool;
}
const LETTER_POOL = buildLetterPool();

const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function dualPairsFor(letter) {
  const pts = TILE_POINTS[letter] ?? 1;
  return Object.keys(TILE_POINTS)
    .filter(l => l !== letter && l.length === 1 && !isMark(l)
              && Math.abs(TILE_POINTS[l] - pts) <= 2);
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
  if (tmpl.letterType !== 'dual' && !LIGATURES.includes(tmpl.letter) && !isMark(tmpl.letter)) missing.push('dual');

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
  if (isMark(tmpl.letter)) p += 1;
  return p;
}

function weightedPatronSample(n) {
  const ownedIds = new Set(state.patrons.map(p => p.id));
  const pool = [];
  for (const def of PATRON_DEFS) {
    // A stackable patron is never crossed off — you can always be sold another.
    if (ownedIds.has(def.id) && !def.stackable) continue;
    for (let i = 0; i < (RARITY_WEIGHT[def.rarity] ?? 1); i++) pool.push(def.id);
  }
  const out = [];
  while (out.length < n && pool.length) {
    const id = pick(pool);
    // Per-copy state (the Monogrammist's letters and number) rolls as the card
    // is laid out, so what's on offer is exactly what you'd be buying.
    out.push({ id, sold: false, data: patronById(id)?.onOffer?.() ?? null });
    for (let i = pool.length - 1; i >= 0; i--) if (pool[i] === id) pool.splice(i, 1);
  }
  return out;
}

// Paint tubes and the reshuffle are the everyday stock; an ingot of strange
// metal turns up in one of the slots about half the time.
function rollSundryOffers() {
  const offers = shuffle([...Object.keys(COLOURS), 'reshuffle', 'ratchet'])
    .slice(0, SUNDRY_OFFERS)
    .map(entry => entry === 'reshuffle'
      ? { kind: 'reshuffle', colour: null, price: RESHUFFLE_PRICE, sold: false }
      : entry === 'ratchet'
      ? { kind: 'ratchet', colour: null, price: RATCHET_PRICE, sold: false }
      : { kind: 'tube', colour: entry, price: TUBE_PRICE, sold: false });

  if (offers.length && Math.random() < INGOT_OFFER_CHANCE) {
    offers[Math.floor(Math.random() * offers.length)] = {
      kind: 'ingot', colour: null, material: pick(Object.keys(MATERIALS)),
      price: INGOT_PRICE, sold: false,
    };
  }
  return offers;
}

// A tile is amber if either of its faces is — that's what The Chapman deals in.
export const isAmberTile = tmpl => tmpl?.colour === 'amber' || tmpl?.altColour === 'amber';

// What an offered tile actually costs right now. The Chapman gives amber away,
// and is checked live rather than baked into the offer, so hiring or dismissing
// them mid-visit re-prices the shelf immediately.
export const offerPrice = offer =>
  owns('chapman') && isAmberTile(offer.template) ? 0 : offer.price;

// Patrons/tiles/sundries — "New offers" also re-rolls the stalls (see rollStalls).
function rollOffers() {
  market.patronOffers = weightedPatronSample(3);
  market.tileOffers   = Array.from({ length: 4 }, randomTileOffer);
  market.sundryOffers = rollSundryOffers();
  guaranteeAmber();
}

// The Chapman knows a supplier: without this, amber paint turns up on roughly
// one offered tile in ten and the patron would sit dead most visits.
function guaranteeAmber() {
  if (!owns('chapman') || !market.tileOffers.length) return;
  if (market.tileOffers.some(o => isAmberTile(o.template))) return;
  const offer = pick(market.tileOffers);
  offer.template.colour = 'amber';
  offer.price = tilePrice(offer.template);
}

// ─── Stalls ───────────────────────────────────────────────────────────────────

export const stallById   = id => market.stalls.find(s => s.id === id);
export const stallPrice  = stall => (STALL_DEFS[stall.id]?.base ?? 1) * 2 ** stall.uses;

// ── Proposal stalls ───────────────────────────────────────────────────────────
// The Gilder, the Punchcutter and the Dresser all work the same way: a spread
// of your own tiles, each paired with a proposed change, and you commission the
// one you like. Each is defined by which tiles it can work on and what it
// proposes for them; everything else below is shared.

// Every stall that changes a tile has to leave ghosts alone — there's nothing
// there to take a tool to.
export const PROPOSAL_STALLS = {
  gilder: {
    eligible: t => !t.trim && !isImmutable(t),
    propose:  () => ({ trim: pick(Object.keys(TRIMS)) }),
  },
  punchcutter: {
    // A tile can only take a second letter if it hasn't one already, isn't a
    // ligature, and has a partner of comparable value to pair with.
    eligible: t => t.letterType !== 'dual'
                && !LIGATURES.includes(t.letter)
                && !isMark(t.letter)
                && !isImmutable(t)
                && dualPairsFor(t.letter).length > 0,
    propose:  t => ({ altLetter: pick(dualPairsFor(t.letter)) }),
  },
  dresser: {
    eligible: t => !t.nick && !isImmutable(t),
    propose:  () => ({ nick: pick(Object.keys(NICKS)) }),
  },
};

export const isProposalStall = id => !!PROPOSAL_STALLS[id];

// A fresh spread for one stall. Re-rolled after every commission.
export function rollProposals(stallId) {
  const spec = PROPOSAL_STALLS[stallId];
  if (!spec) return [];
  return shuffle(state.collection.filter(spec.eligible))
    .slice(0, PROPOSAL_RANGE)
    .map(t => ({ tid: t.tid, ...spec.propose(t) }));
}

// Smelting can orphan a proposal mid-visit — drop any whose tile is gone or
// no longer eligible.
function pruneProposals() {
  for (const stall of market.stalls) {
    const spec = PROPOSAL_STALLS[stall.id];
    if (!spec || !stall.proposals) continue;
    stall.proposals = stall.proposals.filter(p =>
      state.collection.some(t => t.tid === p.tid && spec.eligible(t)));
  }
}

// A re-roll brings new stalls, but not a new ledger: work already commissioned
// this visit is remembered in market.stallWear, so a stall that turns up again
// re-opens at the price it had reached, not at its base. Wear is wiped only
// when the Market itself opens fresh (openMarket) — re-rolling your way back
// to a cheap Smelter is not a thing.
function rollStalls() {
  const ids = shuffle([...Object.keys(STALL_DEFS)]).slice(0, STALLS_PER_SHOP);
  market.stalls = ids.map(id => {
    const uses = market.stallWear?.[id] ?? 0;
    return isProposalStall(id)
      ? { id, uses, proposals: rollProposals(id) }
      : { id, uses };
  });
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
  market.compostTaken = 0;
  market.stallWear = {};
  rotCompost();
  rollOffers();
  rollStalls();
}

// Restore a shop snapshot from a saved game
export function restoreMarket(snapshot) {
  Object.assign(market, snapshot, { open: true });
  market.sundryOffers ??= [];
  market.stalls ??= [];
  market.stallWear ??= {};
  market.compostTaken ??= 0;
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
  const seat = { id, uid: nextId(), data: offer.data ? { ...offer.data } : {} };
  state.patrons.push(seat);
  offer.sold = true;
  return { ok: true, def, seat, name: def.instName?.(seat.data) ?? def.name };
}

// `ref` is a seat's uid when the caller has one (they all do now), or a def id
// as the old fallback — which is fine for every patron you can only hold once,
// and takes the first copy of one you can hold many of.
export function sellPatron(ref) {
  const i = state.patrons.findIndex(p => String(p.uid) === String(ref) || p.id === ref);
  if (i < 0) return { ok: false };
  const seat = state.patrons[i];
  const def = patronById(seat.id);
  if (!def) return { ok: false };
  const refund = Math.floor(def.cost / 2);
  state.patrons.splice(i, 1);
  state.coins += refund;
  return { ok: true, refund, def, name: def.instName?.(seat.data) ?? def.name };
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
  const price = offerPrice(offer);
  if (state.coins < price)         return { ok: false, reason: `You need ${price} Coins.` };
  state.coins -= price;
  state.collection.push(adoptTemplate(offer.template));
  offer.sold = true;
  return { ok: true, template: offer.template, price };
}

// ─── The compost heap (The Composter) ─────────────────────────────────────────
// Tiles destroyed anywhere — burned by The Stoker, lost to The Arsonist, fed to
// the Smelter — are tallied on state.compostPending. They rot down into jade
// tiles when the Market opens, because that's the only place the heap is ever
// seen. The heap keeps the freshest COMPOST_HEAP_MAX; older rot is turned under.

function rotCompost() {
  state.compost ??= [];
  let pending = state.compostPending ?? 0;
  while (pending > 0) {
    const tmpl = randomSpecialTile();
    tmpl.colour = 'jade';           // whatever else it grew, it comes up green
    state.compost.push(tmpl);
    if (state.compost.length > COMPOST_HEAP_MAX) state.compost.shift();
    pending--;
  }
  state.compostPending = 0;
}

export const compostLeft = () =>
  Math.max(0, COMPOST_PER_MARKET - (market.compostTaken ?? 0));

export function takeCompost(idx) {
  if (!owns('composter'))       return { ok: false, reason: 'No one is tending the heap.' };
  if (!compostLeft())           return { ok: false, reason: 'You have already taken from the heap this visit.' };
  const tmpl = state.compost?.[idx];
  if (!tmpl)                    return { ok: false, reason: 'Not available.' };
  state.compost.splice(idx, 1);
  state.collection.push(adoptTemplate(tmpl));
  market.compostTaken = (market.compostTaken ?? 0) + 1;
  return { ok: true, template: tmpl };
}

export function buySundry(idx) {
  const offer = market.sundryOffers[idx];
  if (!offer || offer.sold)                          return { ok: false, reason: 'Not available.' };
  if (state.sundries.length >= effectiveSundrySlots()) return { ok: false, reason: 'Your workbench is full.' };
  if (state.coins < offer.price)                     return { ok: false, reason: `You need ${offer.price} Coins.` };
  state.coins -= offer.price;
  state.sundries.push({ kind: offer.kind, colour: offer.colour, material: offer.material ?? null });
  offer.sold = true;
  return { ok: true, offer };
}

export function rerollMarket() {
  if (state.coins < market.rerollCost) return false;
  state.coins -= market.rerollCost;
  market.rerollCost *= 2;
  rollOffers();
  rollStalls();
  return true;
}

// A reshuffle sundry buys the same re-roll, free and without bumping the
// escalating cost — the state.js caller is responsible for consuming it.
export function freeRerollMarket() {
  rollOffers();
  rollStalls();
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
  market.stallWear[stall.id] = stall.uses;   // remembered across re-rolls this visit
  market.stallSel = -1;
}

export function stallSmelt(tid) {
  const t = stallTarget('smelter', tid);
  if (!t)                            return { ok: false, reason: 'Not available.' };
  if (state.collection.length <= SMELT_MIN_COLLECTION)
                                     return { ok: false, reason: 'Your collection is too small to smelt further.' };
  if (state.coins < t.price)         return { ok: false, reason: `You need ${t.price} Coins.` };
  payStall(t.stall, t.price);
  trashFromCollection(t.tmpl.tid);   // the one road out, so the heap counts it too
  pruneProposals();
  return { ok: true, removed: t.tmpl, price: t.price };
}

export function stallPaint(tid, colour) {
  const t = stallTarget('painter', tid);
  if (!t || !COLOURS[colour])        return { ok: false, reason: 'Pick a tile and a colour.' };
  if (isImmutable(t.tmpl))           return { ok: false, reason: 'A ghost tile takes no paint.' };
  if (state.coins < t.price)         return { ok: false, reason: `You need ${t.price} Coins.` };
  payStall(t.stall, t.price);
  t.tmpl.colour = colour;            // the front face; a dual's other face keeps its coat
  return { ok: true, tmpl: t.tmpl, colour, price: t.price };
}

// Commission a proposal from whichever proposal stall you're standing in.
// The proposal itself carries what changes — a trim, or a second letter.
export function stallCommission(stallId, proposalIdx) {
  const spec  = PROPOSAL_STALLS[stallId];
  const stall = stallById(stallId);
  const proposal = stall?.proposals?.[proposalIdx];
  const tmpl = proposal && state.collection.find(t => t.tid === proposal.tid);
  if (!spec || !tmpl || !spec.eligible(tmpl)) return { ok: false, reason: 'Not available.' };
  const price = stallPrice(stall);
  if (state.coins < price)                    return { ok: false, reason: `You need ${price} Coins.` };

  payStall(stall, price);
  if (proposal.trim) tmpl.trim = proposal.trim;
  if (proposal.nick) tmpl.nick = proposal.nick;
  if (proposal.altLetter) {
    tmpl.letterType    = 'dual';
    tmpl.altLetter     = proposal.altLetter;
    tmpl.activeVariant = 0;
  }
  stall.proposals = rollProposals(stallId);
  return { ok: true, tmpl, ...proposal, price };
}

export function stallClone(tid) {
  const t = stallTarget('stereotyper', tid);
  if (!t)                            return { ok: false, reason: 'Not available.' };
  // You can't take an impression of a ghost — there's nothing solid to press.
  if (isImmutable(t.tmpl))           return { ok: false, reason: 'A ghost tile leaves no impression to cast from.' };
  if (state.coins < t.price)         return { ok: false, reason: `You need ${t.price} Coins.` };
  payStall(t.stall, t.price);
  state.collection.push(adoptTemplate(t.tmpl));
  return { ok: true, tmpl: t.tmpl, price: t.price };
}

