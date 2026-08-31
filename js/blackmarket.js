// ═══ The Black Market ══════════════════════════════════════════════════════════
//
// A door in the alley behind the fair, opened by a Colophon pick (see the
// 'blackmarket' entry in js/upgrades.js) and shut again when you leave for the
// ordinary Market. One visit per pick; the pick has no repeat cap, so the alley
// is available every chapter for the rest of the run.
//
// What makes it worth the walk is that NOTHING here is sold anywhere else:
//
//   Tiles     BLACK_TILE_OFFERS of them, and one to two cast in each rare
//             material — chosen off a table rather than gambled for out of a
//             wrapper — plus punctuation, which otherwise comes only wrapped.
//             The rest are ordinary sorts, but never plainly dressed
//             (BLACK_TILE_FEATURES).
//   Patrons   BLACK_PATRON_OFFERS, every one of them RARE. The Market's own list
//             is weighted three-to-one towards commons, so this is the only
//             place a rare build can be assembled on purpose.
//   Sundries  BLACK_SUNDRY_OFFERS from BLACK_SUNDRY_STOCK — the four guild tools
//             (the toolbox's own, sold at no stall), the two applicators, the
//             love potion, and the four registers' parcels.
//
// Everything carries a markup, and there is no re-roll: the alley shows you what
// it has, once, and you take it or you don't.
//
// The shape deliberately mirrors js/market.js — an `open` flag, offer arrays of
// { …, price, sold }, buy functions returning { ok, reason? }, a snapshot pair
// for the save — so the sheet code and the save code treat the two the same way.
//
// FOR LATER: the side-quest hook. `state.blackMarketVisits` counts the trips and
// survives the save, so a patron that changes character once it has been down
// the alley has a number to read. Nothing consumes it yet.

import { state, adoptTemplate, shuffle, allSeats, owns, nextId, effectivePatronSlots,
         effectiveSundrySlots, restingPoints, spendCoins } from './state.js';
import {
  BLACK_TILE_OFFERS, BLACK_PATRON_OFFERS, BLACK_SUNDRY_OFFERS,
  BLACK_MATERIAL_STOCK, BLACK_MARK_PRICE, BLACK_TILE_SURCHARGE, BLACK_TILE_MAX_PRICE,
  BLACK_PATRON_MARKUP, BLACK_TILE_FEATURES, BLACK_SUNDRY_STOCK,
  HACKER_BASE_PRICE, HACKER_CAP, HACKER_OFFERS, isImmutable,
  SHELL_BASE_PRICE, SHELL_SHOWN, SHELL_COINS, SHELL_PRIZES, SHELL_RARE_ODDS,
  BATTER, COLOURS, PACKAGES,
  MARKS, MARK_TRIM, makeTileTemplate, FENCE_DISCOUNT,
} from './constants.js';
import { randomSpecialTile, randomBareTile, tilePrice } from './market.js';
import { PATRON_DEFS, patronById, patronCost, patronName, rollPostnom } from './patrons.js';

export const blackMarket = {
  open:         false,
  tileOffers:   [],   // [{ template, price, sold, material?, mark? }]
  patronOffers: [],   // [{ id, sold, data }]
  sundryOffers: [],   // [{ kind, price, sold, material?, theme? }]
  hacker:       { proposals: [], uses: 0 },   // [tid…]; price doubles per use
  shell:        { shells: [], uses: 0 },      // [kind…]; price doubles per play
};

const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// ─── What the alley asks ──────────────────────────────────────────────────────
// The Fence's cut, and the single door every price in here goes through — the
// three buy functions below and both halves of the sheet (blackMarketHTML and
// updateBlackMarketState in js/sheets.js). Checked LIVE rather than baked into
// the offers, exactly as The Chapman's free amber is at the fair (offerPrice in
// js/market.js), so hiring him off the alley's own table re-prices the rest of
// the visit in front of you — and dismissing him puts it back up.
//
// Rounded UP and floored at a Coin: half of three is two here, and nothing in
// the alley is ever given away.
export const alleyAsks = n =>
  (owns('fence') ? Math.max(1, Math.ceil(n * (1 - FENCE_DISCOUNT))) : n);

// ─── Stock ────────────────────────────────────────────────────────────────────

// A tile cast in one of the rare metals. It is dressed BEFORE the metal is named
// because ghost tiles are immutable ever after (isImmutable) — paint or a trim
// on one is a thing no stall could ever add, which is exactly what the alley is
// selling. The price is the tile's own worth plus what the metal asks.
// The ceiling is applied at the point of sale rather than by trimming what the
// alley stocks: the table still lays out gorgeous things, they just never ask
// an absurd price for one. (See BLACK_TILE_MAX_PRICE.)
const alleyPrice = p => Math.min(p, BLACK_TILE_MAX_PRICE);

function materialOffer(material) {
  // A metal stocked `bare` arrives on an undressed sort (squib lead: the tile
  // destroys itself when it goes off, so finery would be money buried with it).
  const template = BLACK_MATERIAL_STOCK[material].bare
    ? randomBareTile()
    : randomSpecialTile(BLACK_TILE_FEATURES);
  template.material = material;
  return {
    template,
    price: alleyPrice(tilePrice(template) + BLACK_MATERIAL_STOCK[material].price),
    sold: false,
    material,
  };
}

// Punctuation in lead under a purple trim — struck exactly as a wrapper's is, so
// the two doors lead to the same tile.
function markOffer() {
  const template = makeTileTemplate(pick(MARKS), { trim: MARK_TRIM });
  return { template, price: BLACK_MARK_PRICE, sold: false, mark: true };
}

function plainOffer() {
  const template = randomSpecialTile(BLACK_TILE_FEATURES);
  return { template, price: alleyPrice(tilePrice(template) + BLACK_TILE_SURCHARGE), sold: false };
}

// The table, shuffled so the contraband isn't always laid out in the same corner.
function rollTileOffers() {
  const offers = [];
  for (const [material, stock] of Object.entries(BLACK_MATERIAL_STOCK)) {
    const n = 1 + Math.floor(Math.random() * stock.max);   // 1..max
    for (let i = 0; i < n; i++) offers.push(materialOffer(material));
  }
  offers.push(markOffer());
  while (offers.length < BLACK_TILE_OFFERS) offers.push(plainOffer());
  // A generous material roll could in principle crowd the table; the contraband
  // is what the visit is for, so it is the plain stock that gives way.
  return shuffle(offers).slice(0, BLACK_TILE_OFFERS);
}

// Rares only, and no weighting — every one of them is a one-in-one here. A
// patron already seated (or haunting) is not offered again unless it stacks, the
// same rule the Market plays by; the cat is never sold at all.
function rollPatronOffers() {
  const owned = new Set(allSeats().map(p => p.id));
  const pool = PATRON_DEFS.filter(def =>
    def.rarity === 'rare' && !def.unlisted && !def.locked?.()
    && (def.stackable || !owned.has(def.id)));

  return shuffle(pool).slice(0, BLACK_PATRON_OFFERS).map(def => {
    // Per-copy state rolls here exactly as it does at the Market, so the card
    // shows what you would actually be buying. No ghost roll and no haggle: the
    // alley does not deal in dead patrons and it does not come down on price.
    const postnom = rollPostnom();
    const rolled = def.onOffer?.() ?? null;
    return {
      id: def.id,
      sold: false,
      data: { ...rolled, ...(postnom ? { postnom } : {}), markup: BLACK_PATRON_MARKUP },
    };
  });
}

function rollSundryOffers() {
  return shuffle([...BLACK_SUNDRY_STOCK])
    .slice(0, BLACK_SUNDRY_OFFERS)
    .map(s => ({ ...s, sold: false }));
}

// ─── The Tile Hacker (the alley's one stall) ──────────────────────────────────
// A spread of YOUR OWN sorts off the collection, and for a price the number in
// the corner is struck double — permanent growth, written to the template like
// the loupe's, capped hard at HACKER_CAP. The same tile can be struck again on
// a later look while it is under the cap, and the price doubles with every
// strike this visit, so the road from 2 to 50 costs real money by the end. The
// Fence's cut applies here as everywhere in the alley.
export const hackerEligible = t =>
  !isImmutable(t) && restingPoints(t) > 0 && restingPoints(t) < HACKER_CAP;

const rollHackerOffers = () =>
  shuffle(state.collection.filter(hackerEligible)).slice(0, HACKER_OFFERS).map(t => t.tid);

export const hackerPrice = () =>
  alleyAsks(HACKER_BASE_PRICE * 2 ** (blackMarket.hacker?.uses ?? 0));

export function hackTile(tid) {
  const tmpl = state.collection.find(t => t.tid === tid);
  if (!tmpl || !hackerEligible(tmpl)) return { ok: false, reason: 'Not available.' };
  const price = hackerPrice();
  if (state.coins < price) return { ok: false, reason: `You need ${price} Coins.` };
  spendCoins(price);
  blackMarket.hacker.uses += 1;
  const from  = restingPoints(tmpl);
  const delta = Math.min(HACKER_CAP, from * 2) - from;
  // Growth follows the face the template is showing, the same rule growTile
  // keeps — written here directly because the template IS the store.
  const field = tmpl.activeVariant === 1 ? 'altBonusPoints' : 'bonusPoints';
  tmpl[field] = (tmpl[field] ?? 0) + delta;
  // A fresh spread after every strike, the same as a fair stall's — so the
  // bench is a new decision each time rather than the same six growing dearer.
  blackMarket.hacker.proposals = rollHackerOffers();
  return { ok: true, tmpl, from, to: from + delta, price };
}

// ─── The Shell Game (the alley's other stall) ─────────────────────────────────
// Three shells dealt off SHELL_PRIZES, all three shown, and the one you get
// decided when you pay — never by you. The deal is fresh after every play.
//
// Two of the four kinds resolve to a TILE, and both go straight into the
// collection rather than the hand: the alley sells stock, not a hand of cards.
// A sundry with nowhere to go pays out in Coins instead, so a full workbench
// can never eat a prize outright.

// Every sundry the game holds, in one list — the fair's stock, the alley's, and
// a tube in each colour. The shell game is the one place they all mix.
const everySundry = () => [
  ...Object.keys(COLOURS).map(colour => ({ kind: 'tube', colour })),
  { kind: 'reshuffle' }, { kind: 'ratchet' }, { kind: 'toolbox' }, { kind: 'bodkin' },
  { kind: 'loupe' }, { kind: 'laurel' }, { kind: 'tongs' }, { kind: 'wash' },
  { kind: 'applicator', material: 'rainbow' }, { kind: 'applicator', material: 'cursed' },
  ...Object.keys(PACKAGES).map(theme => ({ kind: 'package', theme })),
];

// A shell's prize, resolved WHOLE at deal time rather than when you pay: the
// actual tool, the actual sort in the actual metal. The gamble is which of the
// three you get, and nothing else — so a shell showing you a loupe is showing
// you a loupe, and the decision is a real one.
function resolveShell(kind) {
  if (kind === 'coins')  return { kind, coins: SHELL_COINS };
  if (kind === 'sundry') return { kind, sundry: pick(everySundry()) };
  if (kind === 'batter') return { kind, template: makeTileTemplate(BATTER) };
  // Contraband as often as SHELL_RARE_ODDS, ballast the rest of the time — and
  // ballast is a real cost, since every plain sort thins the bag.
  const rare = Math.random() < SHELL_RARE_ODDS;
  const template = rare ? randomSpecialTile(BLACK_TILE_FEATURES) : randomBareTile();
  if (rare) template.material = pick(Object.keys(BLACK_MATERIAL_STOCK));
  return { kind, template };
}

const shellDeal = () => {
  const pool = SHELL_PRIZES.flatMap(p => Array(p.weight).fill(p.kind));
  const out = [];
  while (out.length < SHELL_SHOWN && pool.length) {
    const kind = pick(pool);
    out.push(resolveShell(kind));
    for (let i = pool.length - 1; i >= 0; i--) if (pool[i] === kind) pool.splice(i, 1);
  }
  return out;
};

export const shellPrice = () =>
  alleyAsks(SHELL_BASE_PRICE * 2 ** (blackMarket.shell?.uses ?? 0));

export function playShell() {
  const shells = blackMarket.shell?.shells ?? [];
  if (!shells.length) return { ok: false, reason: 'Nothing on the crate.' };
  const price = shellPrice();
  if (state.coins < price) return { ok: false, reason: `You need ${price} Coins.` };
  spendCoins(price);
  blackMarket.shell.uses += 1;

  // WHICH shell is the whole of the gamble — the prizes themselves were settled
  // when the crate was laid out, and you have been looking at them since.
  const prize = pick(shells);
  const won = { ...prize, price };

  if (prize.kind === 'coins') {
    state.coins += prize.coins;
  } else if (prize.template) {
    state.collection.push(adoptTemplate(prize.template));
  } else if (state.sundries.length >= effectiveSundrySlots()) {
    // No room, so it is sold on for you rather than lost.
    state.coins += SHELL_COINS;
    won.refused = prize.sundry;
    won.coins = SHELL_COINS;
  } else {
    state.sundries.push(prize.sundry);
  }

  blackMarket.shell.shells = shellDeal();
  return { ok: true, ...won };
}

// ─── Open / close ─────────────────────────────────────────────────────────────

export function openBlackMarket() {
  state.inBlackMarket = true;
  state.blackMarketVisits = (state.blackMarketVisits ?? 0) + 1;
  blackMarket.open = true;
  blackMarket.tileOffers   = rollTileOffers();
  blackMarket.patronOffers = rollPatronOffers();
  blackMarket.sundryOffers = rollSundryOffers();
  blackMarket.hacker       = { proposals: rollHackerOffers(), uses: 0 };
  blackMarket.shell        = { shells: shellDeal(), uses: 0 };
}

export function closeBlackMarket() {
  state.inBlackMarket = false;
  blackMarket.open = false;
}

export function blackMarketSnapshot() {
  const { open, ...rest } = blackMarket;
  return JSON.parse(JSON.stringify(rest));
}

export function restoreBlackMarket(snapshot) {
  Object.assign(blackMarket, snapshot, { open: true });
  blackMarket.tileOffers   ??= [];
  blackMarket.patronOffers ??= [];
  blackMarket.sundryOffers ??= [];
  // An old save may hold no bench, and a saved spread may name sorts that have
  // since been smelted or struck to the cap — deal or prune accordingly.
  blackMarket.hacker ??= { proposals: rollHackerOffers(), uses: 0 };
  blackMarket.shell  ??= { shells: shellDeal(), uses: 0 };
  if (!blackMarket.shell.shells?.length) blackMarket.shell.shells = shellDeal();
  blackMarket.hacker.proposals = blackMarket.hacker.proposals.filter(tid => {
    const t = state.collection.find(c => c.tid === tid);
    return t && hackerEligible(t);
  });
  state.inBlackMarket = true;
}

// ─── Buying ───────────────────────────────────────────────────────────────────
// Same contract as the Market's buys: { ok, reason? } and the offer marked sold.

export function buyBlackTile(idx) {
  const offer = blackMarket.tileOffers[idx];
  if (!offer || offer.sold)   return { ok: false, reason: 'Gone already.' };
  const price = alleyAsks(offer.price);
  if (state.coins < price) return { ok: false, reason: `You need ${price} Coins.` };
  spendCoins(price);
  state.collection.push(adoptTemplate(offer.template));
  offer.sold = true;
  return { ok: true, template: offer.template, price };
}

export function buyBlackPatron(idx) {
  const offer = blackMarket.patronOffers[idx];
  const def = offer && patronById(offer.id);
  if (!offer || offer.sold || !def) return { ok: false, reason: 'Gone already.' };
  if (state.patrons.length >= effectivePatronSlots()) {
    return { ok: false, reason: 'No empty seats at your table.' };
  }
  const cost = alleyAsks(patronCost(def, offer.data));
  if (state.coins < cost) return { ok: false, reason: `You need ${cost} Coins.` };
  spendCoins(cost);
  const seat = { id: offer.id, uid: nextId(), data: { ...offer.data } };
  state.patrons.push(seat);
  offer.sold = true;
  return { ok: true, def, seat, name: patronName(def, seat.data), price: cost };
}

export function buyBlackSundry(idx) {
  const offer = blackMarket.sundryOffers[idx];
  if (!offer || offer.sold) return { ok: false, reason: 'Gone already.' };
  if (state.sundries.length >= effectiveSundrySlots()) {
    return { ok: false, reason: 'Your workbench is full.' };
  }
  const price = alleyAsks(offer.price);
  if (state.coins < price) return { ok: false, reason: `You need ${price} Coins.` };
  spendCoins(price);
  const { kind, material, theme } = offer;
  state.sundries.push({ kind, ...(material ? { material } : {}), ...(theme ? { theme } : {}) });
  offer.sold = true;
  return { ok: true, offer };
}
