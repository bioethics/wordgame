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

import { state, adoptTemplate, shuffle, allSeats, nextId, effectivePatronSlots,
         effectiveSundrySlots } from './state.js';
import {
  BLACK_TILE_OFFERS, BLACK_PATRON_OFFERS, BLACK_SUNDRY_OFFERS,
  BLACK_MATERIAL_STOCK, BLACK_MARK_PRICE, BLACK_TILE_SURCHARGE,
  BLACK_PATRON_MARKUP, BLACK_TILE_FEATURES, BLACK_SUNDRY_STOCK,
  MARKS, MARK_TRIM, makeTileTemplate,
} from './constants.js';
import { randomSpecialTile, tilePrice } from './market.js';
import { PATRON_DEFS, patronById, patronCost, patronName, rollPostnom } from './patrons.js';

export const blackMarket = {
  open:         false,
  tileOffers:   [],   // [{ template, price, sold, material?, mark? }]
  patronOffers: [],   // [{ id, sold, data }]
  sundryOffers: [],   // [{ kind, price, sold, material?, theme? }]
};

const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// ─── Stock ────────────────────────────────────────────────────────────────────

// A tile cast in one of the rare metals. It is dressed BEFORE the metal is named
// because ghost tiles are immutable ever after (isImmutable) — paint or a trim
// on one is a thing no stall could ever add, which is exactly what the alley is
// selling. The price is the tile's own worth plus what the metal asks.
function materialOffer(material) {
  const template = randomSpecialTile(BLACK_TILE_FEATURES);
  template.material = material;
  return {
    template,
    price: tilePrice(template) + BLACK_MATERIAL_STOCK[material].price,
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
  return { template, price: tilePrice(template) + BLACK_TILE_SURCHARGE, sold: false };
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
    def.rarity === 'rare' && !def.unlisted && (def.stackable || !owned.has(def.id)));

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

// ─── Open / close ─────────────────────────────────────────────────────────────

export function openBlackMarket() {
  state.inBlackMarket = true;
  state.blackMarketVisits = (state.blackMarketVisits ?? 0) + 1;
  blackMarket.open = true;
  blackMarket.tileOffers   = rollTileOffers();
  blackMarket.patronOffers = rollPatronOffers();
  blackMarket.sundryOffers = rollSundryOffers();
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
  state.inBlackMarket = true;
}

// ─── Buying ───────────────────────────────────────────────────────────────────
// Same contract as the Market's buys: { ok, reason? } and the offer marked sold.

export function buyBlackTile(idx) {
  const offer = blackMarket.tileOffers[idx];
  if (!offer || offer.sold)   return { ok: false, reason: 'Gone already.' };
  if (state.coins < offer.price) return { ok: false, reason: `You need ${offer.price} Coins.` };
  state.coins -= offer.price;
  state.collection.push(adoptTemplate(offer.template));
  offer.sold = true;
  return { ok: true, template: offer.template, price: offer.price };
}

export function buyBlackPatron(idx) {
  const offer = blackMarket.patronOffers[idx];
  const def = offer && patronById(offer.id);
  if (!offer || offer.sold || !def) return { ok: false, reason: 'Gone already.' };
  if (state.patrons.length >= effectivePatronSlots()) {
    return { ok: false, reason: 'No empty seats at your table.' };
  }
  const cost = patronCost(def, offer.data);
  if (state.coins < cost) return { ok: false, reason: `You need ${cost} Coins.` };
  state.coins -= cost;
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
  if (state.coins < offer.price) return { ok: false, reason: `You need ${offer.price} Coins.` };
  state.coins -= offer.price;
  const { kind, material, theme } = offer;
  state.sundries.push({ kind, ...(material ? { material } : {}), ...(theme ? { theme } : {}) });
  offer.sold = true;
  return { ok: true, offer };
}
