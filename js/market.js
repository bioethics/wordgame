import {
  state, adoptTemplate, shuffle, owns, allSeats, trashFromCollection, nextId,
  effectivePatronSlots, effectiveSundrySlots, luckyRoll, makeGhost,
} from './state.js';
import {
  BAG_COUNTS, LIGATURES, EXCLUSIVE_LETTERS, isMark, MARKS, INTERROBANG,
  TILE_POINTS, TRIMS, NICKS, COLOURS,
  WRAPPED_PRICE, WRAPPED_OFFER_CHANCE, isImmutable,
  COMPOST_HEAP_MAX, COMPOST_PER_MARKET,
  TILE_BASE_PRICE, REROLL_BASE,
  SUNDRY_OFFERS, PATRON_OFFERS, TUBE_PRICE, RESHUFFLE_PRICE, RATCHET_PRICE, SUNDRY_SELL, HEADSMAN_STEP,
  TOOLBOX_PRICE, FLEURON, FLEURON_PRICE, FLEURON_OFFER_CHANCE,
  RULE, RULE_PACK_PRICE, RULE_PACK_CHANCE,
  STALL_DEFS, STALLS_PER_SHOP, PROPOSAL_RANGE, SMELT_MIN_COLLECTION,
  FEATURE_CHAIN_CHANCE, MAX_FEATURES, MEDIEVAL_LETTERS, isMedieval,
  makeTileTemplate, rollHaggle, GHOST_HIRE,
} from './constants.js';
import {
  PATRON_DEFS, RARITY_WEIGHT, patronById, guildSeats, rollPostnom, patronCost, patronName,
} from './patrons.js';

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
  rerollCost: REROLL_BASE,
};

// ─── Offer generation ─────────────────────────────────────────────────────────

function buildLetterPool() {
  const pool = [];
  for (const [L, c] of Object.entries(BAG_COUNTS)) {
    for (let i = 0; i < Math.max(1, c); i++) pool.push(L);
  }
  // Exclusive letters belong to one patron and turn up nowhere else. QU is both
  // a ligature and a bag letter, so the loop above has already stocked it.
  LIGATURES
    .filter(L => !EXCLUSIVE_LETTERS.includes(L) && !(L in BAG_COUNTS))
    .forEach(L => pool.push(L, L));
  // No marks — they come wrapped and nowhere else (see WRAPPED_CONTENTS).
  return pool;
}
const LETTER_POOL = buildLetterPool();

const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function dualPairsFor(letter) {
  const pts = TILE_POINTS[letter] ?? 1;
  // No fleuron on either face: "it prints alone" has to stay the whole truth.
  // Nothing on EXCLUSIVE_LETTERS either, or the Punchcutter would cut a thorn
  // into the back of a Z — the Medievalist's stock without the Medievalist.
  return Object.keys(TILE_POINTS)
    .filter(l => l !== letter && l.length === 1 && !isMark(l) && l !== FLEURON
              && !EXCLUSIVE_LETTERS.includes(l)
              && Math.abs(TILE_POINTS[l] - pts) <= 2);
}

// The one cut the Punchcutter will make on a mark, and the only road to an
// interrobang. It asks that you own BOTH marks, and consumes neither.
const otherMark = letter => MARKS.find(m => m !== letter) ?? null;
const canInterrobang = t =>
  isMark(t.letter) && t.letter !== INTERROBANG
  && state.collection.some(o => o.tid !== t.tid && o.letter === otherMark(t.letter));

// ─── Feature helpers ──────────────────────────────────────────────────────────
// A tile's "features" are the things that make it worth owning.

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
  if (tmpl.letterType !== 'dual' && !LIGATURES.includes(tmpl.letter)
      && !isMark(tmpl.letter) && !isMedieval(tmpl.letter)) missing.push('dual');

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

// Exported for the Black Market, which prices the same way and then adds the
// alley's markup on top (js/blackmarket.js).
export function tilePrice(tmpl) {
  let p = TILE_BASE_PRICE;
  if (tmpl.trim) p += TRIMS[tmpl.trim]?.price ?? 0;
  if (tmpl.nick) p += NICKS[tmpl.nick]?.price ?? 0;
  if (tmpl.colour) p += 1;
  if (tmpl.letterType === 'dual') p += 1;
  if (LIGATURES.includes(tmpl.letter)) p += 1;
  return p;
}

function weightedPatronSample(n) {
  // A ghost is still a patron you hold, so no second copy is offered — but a
  // fled Ripper is gone from both lists and can call again.
  const ownedIds = new Set(allSeats().map(p => p.id));
  const pool = [];
  for (const def of PATRON_DEFS) {
    // A stackable patron is never crossed off — you can always be sold another.
    if (def.unlisted) continue;          // the cat is found, never sold
    if (ownedIds.has(def.id) && !def.stackable) continue;
    for (let i = 0; i < (RARITY_WEIGHT[def.rarity] ?? 1); i++) pool.push(def.id);
  }
  const out = [];
  while (out.length < n && pool.length) {
    const id = pick(pool);
    // Per-copy state (the Monogrammist's letters, the postnom, the day's asking
    // price) rolls here, so the card shows exactly what you would be buying.
    const postnom = rollPostnom();
    const haggle = rollHaggle();
    const rolled = patronById(id)?.onOffer?.() ?? null;
    // …and once in a long while, one who is already dead. A wanted outcome, so
    // it rides luck like every other one. Being dead is part of the copy, so it
    // sits on `data` beside the postnom — that is what patronCost prices.
    const ghost = luckyRoll(GHOST_HIRE.odds);
    const data = { ...rolled, ...(postnom ? { postnom } : {}), ...(haggle ? { haggle } : {}),
                   ...(ghost ? { ghost: true } : {}) };
    out.push({ id, sold: false, data: Object.keys(data).length ? data : null });
    for (let i = pool.length - 1; i >= 0; i--) if (pool[i] === id) pool.splice(i, 1);
  }
  return out;
}

// Paint tubes and the reshuffle are the everyday stock; a wrapped tile displaces
// one slot about half the time. What is inside is rolled when it is opened.
function rollSundryOffers() {
  const offers = shuffle([...Object.keys(COLOURS), 'reshuffle', 'ratchet', 'toolbox'])
    .slice(0, SUNDRY_OFFERS)
    .map(entry => entry === 'reshuffle'
      ? { kind: 'reshuffle', colour: null, price: RESHUFFLE_PRICE, sold: false }
      : entry === 'ratchet'
      ? { kind: 'ratchet', colour: null, price: RATCHET_PRICE, sold: false }
      : entry === 'toolbox'
      ? { kind: 'toolbox', colour: null, price: TOOLBOX_PRICE, sold: false }
      : { kind: 'tube', colour: entry, price: TUBE_PRICE, sold: false });

  if (offers.length && Math.random() < WRAPPED_OFFER_CHANCE) {
    offers[Math.floor(Math.random() * offers.length)] = {
      kind: 'wrapped', colour: null, price: WRAPPED_PRICE, sold: false,
    };
  }
  return offers;
}

// Amber paint is what The Chapman deals in.
export const isAmberTile = tmpl => tmpl?.colour === 'amber';

// Checked live rather than baked into the offer, so hiring or dismissing The
// Chapman mid-visit re-prices the shelf immediately.
export const offerPrice = offer =>
  owns('chapman') && isAmberTile(offer.template) ? 0 : offer.price;

// Patrons/tiles/sundries — "New offers" also re-rolls the stalls (see rollStalls).
function rollOffers() {
  market.patronOffers = weightedPatronSample(PATRON_OFFERS);
  market.tileOffers   = Array.from({ length: 4 }, randomTileOffer);
  // The fleuron displaces a tile slot now and then, at its own flat price.
  if (Math.random() < FLEURON_OFFER_CHANCE) {
    const i = Math.floor(Math.random() * market.tileOffers.length);
    market.tileOffers[i] = { template: makeTileTemplate(FLEURON), price: FLEURON_PRICE, sold: false };
  }
  // …and so does the pair of rules, which is sold as a PAIR and no other way:
  // one rule alone is worth nothing at all, so half a purchase would be a trap.
  // Bold is an experiment, off in the main game: the shop only stocks the pair
  // for a run that switched it on in the Testing Chamber.
  if (state.experiments?.bold && Math.random() < RULE_PACK_CHANCE) {
    const i = Math.floor(Math.random() * market.tileOffers.length);
    market.tileOffers[i] = {
      template: makeTileTemplate(RULE), price: RULE_PACK_PRICE, sold: false, pack: 2,
    };
  }
  market.sundryOffers = rollSundryOffers();
  guaranteeAmber();
  stockTheMedievalStall();
  offerTheCat();
}

// Set pending by spelling CAT (js/main.js). The flag is spent the instant this
// runs, bought or not — see noticeTheCat in main.js, the only thing between the
// Headsman and a free multiplier machine.
function offerTheCat() {
  if (!state.catPending || owns('shorthair')) return;
  state.catPending = false;
  market.patronOffers.unshift({ id: 'shorthair', sold: false, data: {} });
}

// The Medievalist's stall: an ADDITION to the tile row, not a substitution — the
// four ordinary slots are untouched. The sort never takes a second face
// (addRandomFeature bars medieval letters from `dual` for exactly this reason).
function stockTheMedievalStall() {
  if (!owns('medievalist')) return;
  const tmpl = makeTileTemplate(pick(MEDIEVAL_LETTERS));
  const target = 1 + (Math.random() < FEATURE_CHAIN_CHANCE ? 1 : 0);
  while (featureCount(tmpl) < target && addRandomFeature(tmpl)) { /* dress it */ }
  market.tileOffers.push({ template: tmpl, price: tilePrice(tmpl), sold: false, medieval: true });
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
// A spread of your own tiles, each paired with a proposed change. Each stall is
// defined by which tiles it can work on and what it proposes; the rest is shared.

// An unweighted draw would spend its slots on the Es and Rs you hold four of, so
// rare letters get a soft lean — the square root of the bag count, not the count
// itself. Anything not in the bag at all counts as rare. Applied only to stalls
// marked `biased`; the rest narrow the case with their eligibility filters.
const letterWeight = t => 1 / Math.sqrt(BAG_COUNTS[t.letter] ?? 1);

function biasedSample(tiles, n) {
  const pool = [...tiles];
  const out = [];
  while (out.length < n && pool.length) {
    let roll = Math.random() * pool.reduce((sum, t) => sum + letterWeight(t), 0);
    let i = 0;
    while (i < pool.length - 1 && (roll -= letterWeight(pool[i])) > 0) i++;
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

// Every stall that changes a tile has to leave ghosts alone (isImmutable).
export const PROPOSAL_STALLS = {
  gilder: {
    eligible: t => !t.trim && !isImmutable(t),
    propose:  () => ({ trim: pick(Object.keys(TRIMS)) }),
    biased:   true,
  },
  punchcutter: {
    // A second letter needs a tile with no second face, no ligature or fleuron,
    // and a partner of comparable value. Marks are barred except for the
    // interrobang, which is a fusion rather than a face (canInterrobang above).
    eligible: t => t.letterType !== 'dual'
                && !LIGATURES.includes(t.letter)
                && t.letter !== FLEURON
                && !isImmutable(t)
                && (canInterrobang(t)
                    || (!isMark(t.letter) && dualPairsFor(t.letter).length > 0)),
    propose:  t => (canInterrobang(t)
      ? { fuse: INTERROBANG }
      : { altLetter: pick(dualPairsFor(t.letter)) }),
  },
  dresser: {
    eligible: t => !t.nick && !isImmutable(t),
    propose:  () => ({ nick: pick(Object.keys(NICKS)) }),
  },
  painter: {
    // Colours are proposed rather than picked, and dealt so every pot shows at
    // least once (the dress pass below). Choosing is the paint tube's trade.
    eligible: t => !t.colour && !isImmutable(t),
    propose:  () => ({}),   // the colour is dealt across the whole spread, below
    dress(proposals) {
      const pots = shuffle(Object.keys(COLOURS).slice());
      while (pots.length < proposals.length) pots.push(pick(Object.keys(COLOURS)));
      shuffle(pots);
      proposals.forEach((p, i) => { p.colour = pots[i]; });
    },
    biased: true,
  },
};

export const isProposalStall = id => !!PROPOSAL_STALLS[id];

// A fresh spread for one stall, re-rolled after every commission. A `dress` pass
// sees the whole spread after the per-tile proposals roll.
export function rollProposals(stallId) {
  const spec = PROPOSAL_STALLS[stallId];
  if (!spec) return [];
  const eligible = state.collection.filter(spec.eligible);
  const spread = spec.biased
    ? biasedSample(eligible, PROPOSAL_RANGE)
    : shuffle(eligible).slice(0, PROPOSAL_RANGE);
  const proposals = spread.map(t => ({ tid: t.tid, ...spec.propose(t) }));
  spec.dress?.(proposals);
  return proposals;
}

// Smelting can orphan a spread mid-visit — drop any entry whose tile is gone or
// no longer eligible.
function pruneStalls() {
  for (const stall of market.stalls) {
    const spec = PROPOSAL_STALLS[stall.id];
    if (spec && stall.proposals) {
      stall.proposals = stall.proposals.filter(p =>
        state.collection.some(t => t.tid === p.tid && spec.eligible(t)));
    }
  }
}

// A re-roll brings new stalls, not a clean slate: market.stallWear remembers
// work commissioned this visit, and is wiped only when openMarket runs.
function rollStalls() {
  const ids = shuffle([...Object.keys(STALL_DEFS)]).slice(0, STALLS_PER_SHOP);
  market.stalls = ids.map(id => {
    const uses = market.stallWear?.[id] ?? 0;
    if (isProposalStall(id)) return { id, uses, proposals: rollProposals(id) };
    return { id, uses };
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
  // An old save can hold a proposal stall with no spread — deal it one.
  for (const s of market.stalls) {
    if (isProposalStall(s.id) && !s.proposals) s.proposals = rollProposals(s.id);
  }
  state.inMarket = true;
}

export function marketSnapshot() {
  const { open, ...rest } = market;
  return JSON.parse(JSON.stringify(rest));
}

export function closeMarket() {
  state.inMarket = false;
  market.open = false;
  // The Factor's credit is with this fair's stallholders, not the next one's.
  state.freeRerolls = 0;
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export function buyPatron(id) {
  const offer = market.patronOffers.find(o => o.id === id && !o.sold);
  const def = patronById(id);
  if (!offer || !def) return { ok: false, reason: 'Not available.' };
  // A ghost needs no seat — it goes to the graveyard, not the shelf — so the
  // table being full is no reason to turn one away.
  const ghost = !!offer.data?.ghost;
  if (!ghost && state.patrons.length >= effectivePatronSlots()) {
    return { ok: false, reason: 'No empty seats at your table.' };
  }
  const cost = patronCost(def, offer.data);
  if (state.coins < cost)              return { ok: false, reason: `You need ${cost} Coins.` };
  state.coins -= cost;
  const seat = { id, uid: nextId(), data: offer.data ? { ...offer.data } : {} };
  if (ghost) makeGhost(seat);
  else       state.patrons.push(seat);
  offer.sold = true;
  return { ok: true, def, seat, ghost, name: patronName(def, seat.data) };
}

// Half the seat's cost plus its refundBonus (the Cellarer's age). The shelf's ✕
// tooltips read this too, so the number offered is the number paid.
export function patronRefund(seat) {
  const def = patronById(seat.id);
  if (!def) return 0;
  // Half of what the seat COST, so a postnom surcharge isn't a sunk fee.
  return Math.floor(patronCost(def, seat.data) / 2)
       + (def.refundBonus?.(seat.data ?? {}) ?? 0);
}

// `ref` is a seat's uid, or a def id as a fallback — which takes the first copy
// of a patron you can hold many of.
export function sellPatron(ref) {
  // The shelf first, then the graveyard. A ghost is dismissed the same way and
  // pays nothing — the standing cost of the seat The Ripper freed.
  const match = p => String(p.uid) === String(ref) || p.id === ref;
  const list = state.patrons.some(match) ? state.patrons : (state.ghosts ?? []);
  const i = list.findIndex(match);
  if (i < 0) return { ok: false };
  const seat = list[i];
  const def = patronById(seat.id);
  if (!def) return { ok: false };
  // A patron may have a hold over the shelf — the Usurer's unpaid book. The
  // seat is the collateral, so it cannot be sold out from under the debt.
  const held = def.holds?.(seat.data);
  if (held) return { ok: false, reason: `${held} — ${patronName(def, seat.data)} keeps his seat.` };
  const ghost = list !== state.patrons;
  const refund = ghost ? 0 : patronRefund(seat);
  list.splice(i, 1);
  state.coins += refund;

  // The Headsman counts every departure but his own — he has already left the
  // shelf by the time the axe falls. The count lives on his seat's data.
  let headsman = null;
  const axe = state.patrons.find(p => p.id === 'headsman');
  if (axe) {
    axe.data ??= {};
    axe.data.heads = (axe.data.heads ?? 0) + 1;
    headsman = { mult: Math.round((1 + axe.data.heads * HEADSMAN_STEP) * 100) / 100 };
  }

  return { ok: true, refund, def, ghost, name: patronName(def, seat.data), headsman };
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
  // A pack buys several of the same sort at one price — the rules, which are
  // only ever sold two at a time.
  const n = offer.pack ?? 1;
  for (let k = 0; k < n; k++) state.collection.push(adoptTemplate(offer.template));
  offer.sold = true;
  return { ok: true, template: offer.template, price, pack: n };
}

// ─── The compost heap (The Composter) ─────────────────────────────────────────
// Tiles destroyed anywhere are tallied on state.compostPending and rot down into
// jade tiles when the Market opens. The heap keeps the freshest COMPOST_HEAP_MAX.

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

// This visit's allowance: one tile per jade patron seated, floored at
// COMPOST_PER_MARKET (which a lone Composter, jade himself, exactly meets).
export const compostLeft = () =>
  Math.max(0, Math.max(COMPOST_PER_MARKET, guildSeats('jade')) - (market.compostTaken ?? 0));

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
  state.sundries.push({ kind: offer.kind, colour: offer.colour });
  offer.sold = true;
  return { ok: true, offer };
}

export function rerollMarket() {
  // The Factor's banked rolls go first — free, and without bumping the fee.
  if ((state.freeRerolls ?? 0) > 0) {
    state.freeRerolls -= 1;
    rollOffers();
    rollStalls();
    return true;
  }
  if (state.coins < market.rerollCost) return false;
  state.coins -= market.rerollCost;
  market.rerollCost *= 2;
  rollOffers();
  rollStalls();
  return true;
}

// The same re-roll, free — the state.js caller consumes the sundry itself.
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
  pruneStalls();
  return { ok: true, removed: t.tmpl, price: t.price };
}

// Commission a proposal from whichever proposal stall you're standing in — the
// proposal itself carries what changes.
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
  if (proposal.colour) tmpl.colour = proposal.colour;   // a dual wears it on both letters
  if (proposal.altLetter) {
    tmpl.letterType    = 'dual';
    tmpl.altLetter     = proposal.altLetter;
    tmpl.activeVariant = 0;
  }
  // A fusion replaces the sort outright rather than giving it a second face.
  if (proposal.fuse) {
    tmpl.letter        = proposal.fuse;
    tmpl.letterType    = 'normal';
    tmpl.altLetter     = null;
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

