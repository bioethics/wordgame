// The opening draft — a free spread laid out before the first page. You pick a
// patron, two paints, and four tiles; no coins change hands. Everything picked
// is applied to the collection before page 1's bag is shuffled.

import { state, paintRandomFaces, adoptTemplate } from './state.js';
import { DRAFT, COLOURS, PAINT_PER_POT } from './constants.js';
import { PATRON_DEFS, RARITY_WEIGHT } from './patrons.js';
import { randomSpecialTile } from './market.js';

export const draft = {
  open:    false,
  patrons: [],   // [id]
  paints:  [],   // [colour]
  tiles:   [],   // [template]
  picked:  { patron: [], paint: [], tile: [] },   // indices into the arrays above
};

const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// Same generator as the shop — pass a floor here to make the opening spread
// richer than what's on sale later.
const draftTile = () => randomSpecialTile();

function samplePatrons(n) {
  const pool = [];
  for (const def of PATRON_DEFS) {
    for (let i = 0; i < (RARITY_WEIGHT[def.rarity] ?? 1); i++) pool.push(def.id);
  }
  const out = [];
  while (out.length < n && pool.length) {
    const id = pick(pool);
    out.push(id);
    for (let i = pool.length - 1; i >= 0; i--) if (pool[i] === id) pool.splice(i, 1);
  }
  return out;
}

export function openDraft() {
  draft.open    = true;
  draft.patrons = samplePatrons(DRAFT.patrons.show);
  draft.paints  = Object.keys(COLOURS).slice(0, DRAFT.paints.show);
  draft.tiles   = Array.from({ length: DRAFT.tiles.show }, draftTile);
  draft.picked  = { patron: [], paint: [], tile: [] };
  state.inDraft = true;
}

export function closeDraft() {
  draft.open = false;
  state.inDraft = false;
}

export const draftLimit = kind =>
  kind === 'patron' ? DRAFT.patrons.pick : kind === 'paint' ? DRAFT.paints.pick : DRAFT.tiles.pick;

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

export const draftComplete = () =>
  ['patron', 'paint', 'tile'].every(k => draft.picked[k].length === draftLimit(k));

// Tiles join the collection first so the paints can land on them too.
export function applyDraft() {
  for (const i of draft.picked.tile) {
    state.collection.push(adoptTemplate(draft.tiles[i]));
  }
  const painted = [];
  for (const i of draft.picked.paint) {
    painted.push(...paintRandomFaces(draft.paints[i], PAINT_PER_POT));
  }
  for (const i of draft.picked.patron) {
    state.patrons.push({ id: draft.patrons[i] });
  }
  return { painted };
}

export function draftSnapshot() {
  const { open, ...rest } = draft;
  return JSON.parse(JSON.stringify(rest));
}

export function restoreDraft(snapshot) {
  Object.assign(draft, snapshot, { open: true });
  draft.picked ??= { patron: [], paint: [], tile: [] };
  state.inDraft = true;
}
