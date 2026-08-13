// The Colophon — a permanent-upgrade pick offered when a chapter clears.
// A publisher's colophon marks the close of a book; this one marks the close
// of a chapter. Three cards, one guaranteed structural, capped repeats.

import { state, shuffle, unpaintedFaces, paintRandomFaces } from './state.js';
import { UPGRADE_OFFERS, MAX_UPGRADE_REPEATS, UPGRADE_COIN_GRANT, PAINT_PER_POT } from './constants.js';
import { UPGRADE_DEFS, upgradeById } from './upgrades.js';

export const colophon = {
  open:   false,
  offers: [],   // [id]
};

const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function eligibleIds() {
  const noPaintLeft = !unpaintedFaces().length;
  return UPGRADE_DEFS
    .filter(d => (state.upgradeCounts?.[d.id] ?? 0) < MAX_UPGRADE_REPEATS)
    .filter(d => !(d.kind === 'paint' && noPaintLeft))
    .map(d => d.id);
}

// One structural pick guaranteed whenever one remains eligible; the rest —
// and the whole spread, once structural options run dry — comes from
// whatever's left. Degrades gracefully deep into the appendices, where the
// pool can run thin.
function rollOffers() {
  const eligible = eligibleIds();
  const n = Math.min(UPGRADE_OFFERS, eligible.length);
  if (!n) { colophon.offers = []; return; }

  const structural = eligible.filter(id => upgradeById(id).kind === 'structural');
  const offers = [];
  if (structural.length) offers.push(pick(structural));

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

  let painted = null;
  if (id === 'coins')        state.coins += UPGRADE_COIN_GRANT;
  else if (def.kind === 'paint') painted = paintRandomFaces(def.colour, PAINT_PER_POT);

  return { def, painted };
}

export function colophonSnapshot() {
  const { open, ...rest } = colophon;
  return JSON.parse(JSON.stringify(rest));
}

export function restoreColophon(snapshot) {
  Object.assign(colophon, snapshot, { open: true });
  state.inColophon = true;
}
