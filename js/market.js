import {
  state, adoptTemplate, shuffle, owns, trashFromCollection, nextId,
  effectivePatronSlots, effectiveSundrySlots,
} from './state.js';
import {
  BAG_COUNTS, LIGATURES, EXCLUSIVE_LETTERS, isMark, MARKS, INTERROBANG,
  TILE_POINTS, TRIMS, NICKS, COLOURS,
  WRAPPED_PRICE, WRAPPED_OFFER_CHANCE, isImmutable,
  COMPOST_HEAP_MAX, COMPOST_PER_MARKET,
  TILE_BASE_PRICE, REROLL_BASE,
  SUNDRY_OFFERS, PATRON_OFFERS, TUBE_PRICE, RESHUFFLE_PRICE, RATCHET_PRICE, SUNDRY_SELL, HEADSMAN_STEP,
  TOOLBOX_PRICE, FLEURON, FLEURON_PRICE, FLEURON_OFFER_CHANCE,
  STALL_DEFS, STALLS_PER_SHOP, PROPOSAL_RANGE, SMELT_MIN_COLLECTION,
  FEATURE_CHAIN_CHANCE, MAX_FEATURES, MEDIEVAL_LETTERS, isMedieval,
  makeTileTemplate,
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
  // Exclusive letters belong to the patron that makes them and turn up
  // nowhere else — not in the shop, the draft, or the compost heap. QU is both
  // a ligature and a bag letter, so the loop above has already stocked it;
  // skip it here rather than serving it three times over.
  LIGATURES
    .filter(L => !EXCLUSIVE_LETTERS.includes(L) && !(L in BAG_COUNTS))
    .forEach(L => pool.push(L, L));
  // No marks. They used to be stocked here at MARK_WEIGHT apiece, which put
  // them in the shop, the draft and the compost heap alike; they come wrapped
  // now and nowhere else (see WRAPPED_CONTENTS).
  return pool;
}
const LETTER_POOL = buildLetterPool();

const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function dualPairsFor(letter) {
  const pts = TILE_POINTS[letter] ?? 1;
  // No fleuron on either face: an ornament with a letter on its back could
  // join words half the time, and "it prints alone" has to stay the whole truth.
  //
  // And nothing on EXCLUSIVE_LETTERS either, which is the point of that list:
  // those sorts come from one patron and no other road. Without this the
  // Punchcutter would cheerfully cut a thorn into the back of a Z — a way to own
  // the Medievalist's stock without ever seating him. (Cutting INTO a medieval
  // sort is fine and intended; it is the other direction that leaks.)
  return Object.keys(TILE_POINTS)
    .filter(l => l !== letter && l.length === 1 && !isMark(l) && l !== FLEURON
              && !EXCLUSIVE_LETTERS.includes(l)
              && Math.abs(TILE_POINTS[l] - pts) <= 2);
}

// The one cut the Punchcutter will make on a mark, and the only road to an
// interrobang: carve the ? into the ! (or the other way about) and the two
// become one sort. It asks that you own BOTH marks — the cutter has to have
// seen the pair to cut it — and marks are scarce enough that this is a find
// rather than a plan. Nothing is consumed: the other mark stays where it is.
const otherMark = letter => MARKS.find(m => m !== letter) ?? null;
const canInterrobang = t =>
  isMark(t.letter) && t.letter !== INTERROBANG
  && state.collection.some(o => o.tid !== t.tid && o.letter === otherMark(t.letter));

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

function tilePrice(tmpl) {
  let p = TILE_BASE_PRICE;
  if (tmpl.trim) p += TRIMS[tmpl.trim]?.price ?? 0;
  if (tmpl.nick) p += NICKS[tmpl.nick]?.price ?? 0;
  if (tmpl.colour) p += 1;
  if (tmpl.letterType === 'dual') p += 1;
  if (LIGATURES.includes(tmpl.letter)) p += 1;
  return p;
}

function weightedPatronSample(n) {
  const ownedIds = new Set(state.patrons.map(p => p.id));
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
    // Per-copy state (the Monogrammist's letters and number) rolls as the card
    // is laid out, so what's on offer is exactly what you'd be buying.
    // Per-copy state rolls as the card is laid out, so what's on offer is
    // exactly what you'd be buying: the Monogrammist's letters and number, and
    // — for any patron at all — the letters after its name.
    const postnom = rollPostnom();
    const rolled = patronById(id)?.onOffer?.() ?? null;
    out.push({
      id, sold: false,
      data: (rolled || postnom) ? { ...rolled, ...(postnom ? { postnom } : {}) } : null,
    });
    for (let i = pool.length - 1; i >= 0; i--) if (pool[i] === id) pool.splice(i, 1);
  }
  return out;
}

// Paint tubes and the reshuffle are the everyday stock; a wrapped tile turns up
// in one of the slots about half the time. The shop doesn't know what is in it
// either — the material is rolled when the paper comes off, not here. The
// toolbox joined the rotation as one more entry, which is the whole of its
// effect on the old stock's rates — nothing else was reweighted.
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

// What an offered tile actually costs right now. The Chapman gives amber away,
// and is checked live rather than baked into the offer, so hiring or dismissing
// them mid-visit re-prices the shelf immediately.
export const offerPrice = offer =>
  owns('chapman') && isAmberTile(offer.template) ? 0 : offer.price;

// Patrons/tiles/sundries — "New offers" also re-rolls the stalls (see rollStalls).
function rollOffers() {
  market.patronOffers = weightedPatronSample(PATRON_OFFERS);
  market.tileOffers   = Array.from({ length: 4 }, randomTileOffer);
  // The fleuron turns up in a tile slot now and then, at its own flat price —
  // an annuity bought with open eyes, never gambled on. (See constants.js.)
  if (Math.random() < FLEURON_OFFER_CHANCE) {
    const i = Math.floor(Math.random() * market.tileOffers.length);
    market.tileOffers[i] = { template: makeTileTemplate(FLEURON), price: FLEURON_PRICE, sold: false };
  }
  market.sundryOffers = rollSundryOffers();
  guaranteeAmber();
  stockTheMedievalStall();
  offerTheCat();
}

// A cat noticed you (js/main.js, on the word CAT) and has come to look you over.
// She waits at the HEAD of the patrons rather than among them — she was not
// sent for, and does not queue — and she is free, so the only question is
// whether she is worth a seat. Offered whenever she is noticed and unowned, so
// dismissing her is not final: she will simply be there again next Market,
// unbothered.
function offerTheCat() {
  if (!state.catNoticed || owns('shorthair')) return;
  market.patronOffers.unshift({ id: 'shorthair', sold: false, data: {} });
}

// The Medievalist's stall: one extra slot on the tile row, holding one medieval
// sort. It is an ADDITION rather than a substitution — the four ordinary slots
// are untouched — because the patron's promise is a stall of his own, not a
// tile the shop would have offered anyway.
//
// The sort is dressed like any other offered tile except that it never takes a
// second face: a þ that could flip to a P would be nobody's idea of a thorn.
// `addRandomFeature` already refuses a second face to a ligature, and the
// medieval sorts are barred there the same way.
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
// The Gilder, the Punchcutter and the Dresser all work the same way: a spread
// of your own tiles, each paired with a proposed change, and you commission the
// one you like. Each is defined by which tiles it can work on and what it
// proposes for them; everything else below is shared.

// Which of your tiles a stall puts in front of you. Most of the case is Es and
// Rs and Ss, so an unweighted draw spends its six slots on letters you hold
// four of and would rather not pay a doubling price to dress. The lean is
// deliberately soft — the square root of the bag count, not the count itself —
// so a Z is about twice as likely to be laid out as any one of your Es, rather
// than crowding them out entirely. (You hold five Es, so the letter still turns
// up in most spreads; it just no longer fills them.) Anything not in the bag at
// all — ligatures, marks, the Rat Catcher's RAT — counts as rare, which is
// right: those are the tiles worth dressing. Marked `biased` per stall, so the
// Punchcutter and the Dresser keep drawing flat; their eligibility filters
// already narrow the case sharply on their own.
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

// Every stall that changes a tile has to leave ghosts alone — there's nothing
// there to take a tool to.
export const PROPOSAL_STALLS = {
  gilder: {
    eligible: t => !t.trim && !isImmutable(t),
    propose:  () => ({ trim: pick(Object.keys(TRIMS)) }),
    biased:   true,
  },
  punchcutter: {
    // A tile can only take a second letter if it hasn't one already, isn't a
    // ligature (or the fleuron), and has a partner of comparable value. Marks
    // are barred — except for the one cut that makes an interrobang, which is
    // not a second face at all but a fusion (see canInterrobang above).
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
    // Reworked to match the Gilder: six unpainted tiles, colours proposed
    // rather than picked, and the spread dealt so every pot shows at least
    // once (the dress pass below). Choosing your colour — and repainting a
    // tile already coated — is the paint tube's trade now, which is what a
    // dearer, rarer sundry is for.
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

// A fresh spread for one stall. Re-rolled after every commission. A stall
// with a `dress` pass gets to look at the whole spread after the per-tile
// proposals are rolled — the Painter deals its colours there, so every pot
// is guaranteed a showing.
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

// A re-roll brings new stalls, but not a clean slate: work already commissioned
// this visit is remembered in market.stallWear, so a stall that turns up again
// re-opens at the price it had reached, not at its base. Wear is wiped only
// when the Market itself opens fresh (openMarket) — re-rolling your way back
// to a cheap Smelter is not a thing.
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
  // A save from before the Painter became a proposal stall holds a bare
  // stall (or one carrying the old `offers` list) — deal it a spread.
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
  if (!offer || !def)                                return { ok: false, reason: 'Not available.' };
  if (state.patrons.length >= effectivePatronSlots()) return { ok: false, reason: 'No empty seats at your table.' };
  const cost = patronCost(def, offer.data);
  if (state.coins < cost)              return { ok: false, reason: `You need ${cost} Coins.` };
  state.coins -= cost;
  const seat = { id, uid: nextId(), data: offer.data ? { ...offer.data } : {} };
  state.patrons.push(seat);
  offer.sold = true;
  return { ok: true, def, seat, name: patronName(def, seat.data) };
}

// What dismissing a seat pays: half the def's cost, plus whatever the
// patron's own refundBonus says its data has earned (the Cellarer's age).
// The shelf's ✕ tooltips read this too, so the number offered is the
// number paid.
export function patronRefund(seat) {
  const def = patronById(seat.id);
  if (!def) return 0;
  // Half of what the seat COST, so a distinguished patron's surcharge comes
  // half-way back like the rest of the price rather than being a sunk fee.
  return Math.floor(patronCost(def, seat.data) / 2)
       + (def.refundBonus?.(seat.data ?? {}) ?? 0);
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
  const refund = patronRefund(seat);
  state.patrons.splice(i, 1);
  state.coins += refund;

  // The Headsman counts every departure but his own — a dismissed Headsman
  // has already left the shelf by the time the axe falls. The count lives on
  // his seat's data, never touched during scoring (which is read-only there),
  // and rides back in the result so both dismissal routes can say so.
  let headsman = null;
  const axe = state.patrons.find(p => p.id === 'headsman');
  if (axe) {
    axe.data ??= {};
    axe.data.heads = (axe.data.heads ?? 0) + 1;
    headsman = { mult: Math.round((1 + axe.data.heads * HEADSMAN_STEP) * 100) / 100 };
  }

  return { ok: true, refund, def, name: patronName(def, seat.data), headsman };
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

// This visit's allowance from the heap: one tile per jade patron on the
// shelf — the gardeners who use the rot — floored at the classic
// COMPOST_PER_MARKET, which a lone Composter (jade himself) exactly meets.
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
  // The Factor's banked rolls go first — free, and without bumping the
  // escalating fee. Coins spend only once the agent's credit runs out.
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
  pruneStalls();
  return { ok: true, removed: t.tmpl, price: t.price };
}

// Commission a proposal from whichever proposal stall you're standing in.
// The proposal itself carries what changes — a trim, a second letter, or
// (the Painter) a coat of paint.
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
  // A fusion replaces the sort outright rather than giving it a second face:
  // there is no flipping an interrobang back into a question mark.
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

