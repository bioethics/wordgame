// The Colophon — a permanent-upgrade pick offered when a chapter clears.
// Three cards, one guaranteed structural, capped repeats.

import {
  state, shuffle, unpaintedTiles, paintRandomTiles, effectiveUpgradeOffers,
} from './state.js';
import {
  MAX_UPGRADE_REPEATS, SKIP_COIN_GRANT, PAINT_PER_POT, BLACK_MARKET_MINIMUM,
} from './constants.js';
import { UPGRADE_DEFS, upgradeById } from './upgrades.js';
import { alleyAsks } from './blackmarket.js';
import { owns } from './state.js';

export const colophon = {
  open:   false,
  offers: [],   // [id]
};

const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// A card is dealt only if it is worth something to THIS press right now. Two
// picks have a condition beyond the repeat cap: a paint pot with nothing left to
// paint, and the alley, which is only a door and asks you to bring your own
// money — under BLACK_MARKET_MINIMUM Coins it would be a wasted card rather than
// a choice, so it stays shut.
function eligibleIds() {
  const noPaintLeft = !unpaintedTiles().length;
  // The Fence lowers the bar as well as the prices behind it: the card is only
  // "a wasted pick" at prices you cannot meet, and his are lower.
  const tooPoorForTheAlley = state.coins < alleyAsks(BLACK_MARKET_MINIMUM);
  return UPGRADE_DEFS
    // `endless` picks ignore the repeat cap — the Black Market is a door, not a
    // bonus, and the alley is open however many times you have been down it.
    .filter(d => d.endless || (state.upgradeCounts?.[d.id] ?? 0) < MAX_UPGRADE_REPEATS)
    .filter(d => !(d.kind === 'paint' && noPaintLeft))
    .filter(d => !(d.kind === 'blackmarket' && tooPoorForTheAlley))
    .map(d => d.id);
}

// One structural pick guaranteed while one remains eligible; the rest — and the
// whole spread, once structural options run dry — comes from whatever's left.
function rollOffers() {
  const eligible = eligibleIds();
  const n = Math.min(effectiveUpgradeOffers(), eligible.length);
  if (!n) { colophon.offers = []; return; }

  const structural = eligible.filter(id => upgradeById(id).kind === 'structural');
  const offers = [];
  if (structural.length) offers.push(pick(structural));

  // The Fence keeps the alley door, and keeping it means it is always on offer —
  // taken out of the pool rather than added beside it, so the spread stays at n
  // and one of it is his. He is the only reason the alley is ever a certainty;
  // without him it is one card among the rest, dealt or not. This cannot
  // overfill the spread: two guarantees can only both fire when two things are
  // eligible, and n is at least the smaller of that count and the offer size.
  if (owns('fence') && eligible.includes('blackmarket') && !offers.includes('blackmarket')) {
    offers.push('blackmarket');
  }

  const pool = shuffle(eligible.filter(id => !offers.includes(id)));
  while (offers.length < n && pool.length) offers.push(pool.shift());
  colophon.offers = shuffle(offers);
}

export function openColophon() {
  colophon.open = true;
  state.inColophon = true;
  rollOffers();
}

export function closeColophon() {
  colophon.open = false;
  state.inColophon = false;
}

export function reshuffleColophon() {
  rollOffers();
}

// Applies the pick and returns what happened, or null if it wasn't on offer.
export function applyColophonPick(id) {
  if (!colophon.offers.includes(id)) return null;
  const def = upgradeById(id);
  if (!def) return null;

  state.upgradeCounts ??= {};
  state.upgradeCounts[id] = (state.upgradeCounts[id] ?? 0) + 1;

  const painted = def.kind === 'paint' ? paintRandomTiles(def.colour, PAINT_PER_POT) : null;

  return { def, painted };
}

// Decline all three — the consolation for skipping, or for a pool run dry.
export function applyColophonSkip() {
  state.coins += SKIP_COIN_GRANT;
}

export function colophonSnapshot() {
  const { open, ...rest } = colophon;
  return JSON.parse(JSON.stringify(rest));
}

export function restoreColophon(snapshot) {
  Object.assign(colophon, snapshot, { open: true });
  state.inColophon = true;
}
