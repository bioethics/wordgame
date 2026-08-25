// THE TESTING CHAMBER — a playtest bench, not a part of the game.
//
// It opens at the top of a new run and can be reopened from Settings
// at any point in a run. Everything here writes directly to the run's state:
// coins, seats, the workbench, and the case of tiles the bag is shuffled from.
// Nothing is priced, nothing is rolled, nothing is earned.
//
// The one rule the chamber keeps is that it uses the game's OWN doors — seats go
// through the same shape buyPatron builds, tiles through adoptTemplate, sundries
// through the same objects the shop sells — so anything set up here behaves
// exactly as the same thing would if it had been come by honestly.

import { state, adoptTemplate, nextId, makeGhost, effectivePatronSlots,
         effectiveSundrySlots } from './state.js';
import { makeTileTemplate, COLOURS, TRIMS, NICKS, MATERIALS, MARKS, BAG_COUNTS,
         MEDIEVAL_LETTERS, EXCLUSIVE_LETTERS, FLEURON, INTERROBANG, RULE,
         TILE_POINTS, PACKAGES, APPLICATORS } from './constants.js';
import { PATRON_DEFS, patronById } from './patrons.js';

export const CHAMBER_COINS = 999;

// The sort case the tile-maker offers, in the order it lays them out: the bag's
// own letters first, then the marks, then everything a patron or a shop is the
// only usual road to. Built from the tables rather than written out, so a letter
// added to the press turns up here without anyone remembering to add it.
export const CHAMBER_LETTERS = [
  ...Object.keys(BAG_COUNTS),
  ...MARKS, INTERROBANG,
  ...MEDIEVAL_LETTERS,
  ...EXCLUSIVE_LETTERS.filter(L =>
    L !== INTERROBANG && !MEDIEVAL_LETTERS.includes(L)),
];

// Every sundry the bench can hold, as the objects the shop would sell.
export const CHAMBER_SUNDRIES = [
  ...Object.keys(COLOURS).map(colour => ({ kind: 'tube', colour })),
  { kind: 'ratchet' }, { kind: 'toolbox' }, { kind: 'reshuffle' },
  { kind: 'wrapped' }, { kind: 'loupe' }, { kind: 'laurel' },
  { kind: 'tongs' }, { kind: 'wash' }, { kind: 'potion' },
  ...Object.keys(APPLICATORS).map(material => ({ kind: 'applicator', material })),
  ...Object.keys(PACKAGES).map(theme => ({ kind: 'package', theme })),
];

// What the chamber is showing, and what the tile-maker is holding. `atStart` is
// the difference between the chamber that opens a run — which ends in "Begin the
// run" — and the one Settings opens mid-page, which simply closes.
export const chamber = {
  open:    false,
  atStart: false,
  tab:     'patrons',
  filter:  '',
  build:   null,   // a tile template, or null before the first render
};

export const freshBuild = () => makeTileTemplate('E');

export function openChamber({ atStart = false } = {}) {
  chamber.open    = true;
  chamber.atStart = atStart;
  chamber.tab     = 'patrons';
  chamber.filter  = '';
  chamber.build ??= freshBuild();
  state.inChamber = true;
}

export function closeChamber() {
  chamber.open = false;
  state.inChamber = false;
}

// ─── Coins ────────────────────────────────────────────────────────────────────

export function grantCoins(n) {
  state.coins += n;
  return state.coins;
}

// ─── Seats ────────────────────────────────────────────────────────────────────
// The chamber widens the table rather than refusing a seat: a testing bench that
// said "no room" would be no use for testing what six patrons do together. The
// extra seats are real upgradeCounts, so the shelf, the Market and the save all
// agree the table is that size.

export function seatPatron(id) {
  const def = patronById(id);
  if (!def) return { ok: false, reason: 'No such patron.' };
  if (!def.stackable && state.patrons.some(p => p.id === id)) {
    return { ok: false, reason: 'Already seated.' };
  }
  if (state.patrons.length >= effectivePatronSlots()) addSeats(1);
  const seat = { id, uid: nextId(), data: {} };
  state.patrons.push(seat);
  return { ok: true, def, seat };
}

export function unseatPatron(uid) {
  const i = state.patrons.findIndex(p => p.uid === uid);
  if (i < 0) return null;
  const [seat] = state.patrons.splice(i, 1);
  return seat;
}

// A ghost works on without a seat — the one way to test the graveyard.
export function hauntPatron(id) {
  const def = patronById(id);
  if (!def) return { ok: false, reason: 'No such patron.' };
  const seat = { id, uid: nextId(), data: {} };
  makeGhost(seat);
  return { ok: true, def, seat };
}

export function addSeats(n) {
  state.upgradeCounts.patronSeat = Math.max(0, (state.upgradeCounts.patronSeat ?? 0) + n);
  return effectivePatronSlots();
}

export function addBenchSlots(n) {
  state.upgradeCounts.workbenchSlot =
    Math.max(0, (state.upgradeCounts.workbenchSlot ?? 0) + n);
  return effectiveSundrySlots();
}

// ─── The workbench ────────────────────────────────────────────────────────────

export function giveSundry(spec) {
  if (state.sundries.length >= effectiveSundrySlots()) addBenchSlots(1);
  state.sundries.push({ ...spec });
  return state.sundries.length;
}

export function dropSundry(idx) {
  if (idx < 0 || idx >= state.sundries.length) return null;
  return state.sundries.splice(idx, 1)[0];
}

// ─── The case ─────────────────────────────────────────────────────────────────
// Tiles are added to the COLLECTION, not the hand: the collection is what the
// bag is shuffled from at the top of every page, so a sort struck here is in the
// run for good, exactly as a bought one is.

export function strikeTile(tmpl, count = 1) {
  const made = [];
  for (let i = 0; i < count; i++) made.push(adoptTemplate({ ...tmpl }));
  state.collection.push(...made);
  return made;
}

// No SMELT_MIN_COLLECTION floor here: emptying the case is a thing worth being
// able to test, and startPage draws what it finds.
export function scrapTile(tid) {
  const i = state.collection.findIndex(c => c.tid === tid);
  if (i < 0) return null;
  return state.collection.splice(i, 1)[0];
}

export function scrapAllTiles() {
  const n = state.collection.length;
  state.collection.length = 0;
  return n;
}

// The letter a build wears decides what else it may wear: a dual face only makes
// sense against a second letter, and the fleuron and the rule spell nothing, so
// they are never given a second face.
export const canBeDual = letter => ![FLEURON, RULE].includes(letter);

export function setBuild(patch) {
  chamber.build = { ...(chamber.build ?? freshBuild()), ...patch };
  const b = chamber.build;
  if (!canBeDual(b.letter) || b.letterType !== 'dual') {
    b.letterType = 'normal';
    b.altLetter  = null;
    b.activeVariant = 0;
    b.altBonusPoints = 0;
  }
  return b;
}

// What a build is worth before it is struck, so the maker can say so.
export const buildPoints = tmpl =>
  (TILE_POINTS[tmpl?.letter] ?? 0) + (tmpl?.bonusPoints ?? 0);

// ─── Save ─────────────────────────────────────────────────────────────────────
// A reload mid-chamber comes back to it, the way a reload mid-Market does.

export function chamberSnapshot() {
  const { open, ...rest } = chamber;
  return JSON.parse(JSON.stringify(rest));
}

export function restoreChamber(snapshot) {
  Object.assign(chamber, snapshot, { open: true });
  chamber.build ??= freshBuild();
  state.inChamber = true;
}

// Named lists the sheet renders from, kept here so the sheet stays presentation.
export const chamberPatrons = () => {
  const q = chamber.filter.trim().toLowerCase();
  const all = [...PATRON_DEFS].sort((a, b) => a.name.localeCompare(b.name));
  if (!q) return all;
  return all.filter(d =>
    d.name.toLowerCase().includes(q) || d.id.includes(q)
    || (d.desc ?? '').toLowerCase().includes(q)
    || [].concat(d.guild ?? []).join(' ').includes(q)
    || d.rarity.includes(q));
};

export const CHAMBER_TRIMS     = Object.keys(TRIMS);
export const CHAMBER_NICKS     = Object.keys(NICKS);
export const CHAMBER_MATERIALS = Object.keys(MATERIALS);
export const CHAMBER_COLOURS   = Object.keys(COLOURS);
