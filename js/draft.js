// The opening draft — a free spread laid out before the first page. You pick a
// patron, two paints, and four tiles; no coins change hands. Everything picked
// is applied to the collection before page 1's bag is shuffled.

import { state, paintRandomTiles, adoptTemplate } from './state.js';
import { DRAFT, COLOURS, PAINT_PER_POT } from './constants.js';
import { randomSpecialTile } from './market.js';

export const draft = {
  open:    false,
  paints:  [],   // [colour]
  tiles:   [],   // [template]
  picked:  { paint: [], tile: [] },   // indices into the arrays above
};

// Same generator as the shop — pass a floor here to make the opening spread
// richer than what's on sale later.
const draftTile = () => randomSpecialTile();

export function openDraft() {
  draft.open    = true;
  draft.paints  = Object.keys(COLOURS).slice(0, DRAFT.paints.show);
  draft.tiles   = Array.from({ length: DRAFT.tiles.show }, draftTile);
  draft.picked  = { paint: [], tile: [] };
  state.inDraft = true;
}

export function closeDraft() {
  draft.open = false;
  state.inDraft = false;
}

export const draftLimit = kind =>
  kind === 'paint' ? DRAFT.paints.pick : DRAFT.tiles.pick;

// Tap to select, tap again to drop. At the limit, other options simply don't
// take — you deselect first, so a pick is never silently swapped out.
export function toggleDraftPick(kind, idx) {
  const list = draft.picked[kind];
  if (!list) return false;
  const at = list.indexOf(idx);
  if (at >= 0) { list.splice(at, 1); return true; }
  if (list.length >= draftLimit(kind)) return false;
  list.push(idx);
  return true;
}


// Tiles join the collection first so the paints can land on them too.
export function applyDraft() {
  for (const i of draft.picked.tile) {
    state.collection.push(adoptTemplate(draft.tiles[i]));
  }
  const painted = [];
  for (const i of draft.picked.paint) {
    painted.push(...paintRandomTiles(draft.paints[i], PAINT_PER_POT));
  }
  return { painted };
}

export function draftSnapshot() {
  const { open, ...rest } = draft;
  return JSON.parse(JSON.stringify(rest));
}

export function restoreDraft(snapshot) {
  Object.assign(draft, snapshot, { open: true });
  draft.picked ??= { paint: [], tile: [] };
  state.inDraft = true;
}
