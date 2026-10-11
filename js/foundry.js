// THE FOUNDRY — what outlives a run.
//
// A run is thrown away when it ends; the Foundry is not. It keeps four things
// in a localStorage key of its own (FOUNDRY_KEY), quite apart from the run's
// save, the way the Neologist's coined words keep theirs (js/dict.js):
//
//   · EMS, the Foundry's money. Compositors on piece-work were paid by the
//     thousand ems they set, so it is the one currency in the trade that was
//     earned by the page. Sorts sell for ems; crates cost them.
//   · CRATES waiting to be opened — six sorts apiece, graded before they are
//     cast (CRATE_SLOTS in js/constants.js), the best always last.
//   · the STOCK: every sort won from a crate and not yet sold.
//   · FOUNTS: named starting cases. A fount is the house's own BAG_COUNTS with
//     some sorts taken out and sorts from the stock put in their places. It is
//     a LOADOUT, not a spend: a run is dealt copies, so nothing a run does to a
//     tile — smelting it, the Ripper's knife, squib lead going off — ever
//     reaches the stock, and one sort can sit in every fount you own.
//
// The rules a fount keeps: it is always STARTING_CASE sorts, because every swap
// is one out and one in; plain sorts (letters and ligatures with nothing on
// them) swap without limit, so a fount's letters are the player's to reshape;
// and no more than FOUNT_DRESSED_MAX of the sorts put in may be dressed.
//
// A run pays in at three moments: a win (a crate, and its difficulty's
// `winEms`), every appendix chapter cleared after it, and a distinction earned.
// What it paid is kept on the run as `state.takings`, for the end screens. A
// run that has been through the Testing Chamber or touched a dev button pays
// nothing (`state.playtested`), since both hand out what the game would not.
//
// State and rules only. The sheet is js/foundry-sheet.js; the prospectus picks
// a fount through selectFount and main.js deals the run from fountTemplates.

import {
  BAG_COUNTS, LIGATURES, EXCLUSIVE_LETTERS, TILE_POINTS, CURSED_MAX_POINTS, COLOURS,
  STARTING_CASE, FINAL_CHAPTER, INTERROBANG, makeTileTemplate, chapterLabel,
  difficultyOf, DEFAULT_DIFFICULTY,
  CRATE_SIZE, CRATE_GRADES, CRATE_SLOTS, FINE_CRATE_ODDS, CRATE_PRICE, CRATE_LIGATURE_WEIGHT, CRATE_METALS,
  GRADE_EMS, LIGATURE_EMS_BONUS, FOUNT_DRESSED_MAX, FOUNT_MAX,
  APPENDIX_EMS, APPENDIX_CRATE_EVERY, DISTINCTIONS,
} from './constants.js';
import { state, getActiveLetter, countsAsColour } from './state.js';
import { addRandomFeature } from './market.js';
import { FOUNDRY_TEXT as FT, logLine, fillSlots } from './text.js';

const FOUNDRY_KEY = 'folio_foundry_v1';

export const foundry = {
  ems: 0,
  crates: [],         // kinds waiting to be opened, oldest first: 'crate' | 'fine'
  stock: [],          // tile templates, each with a `uid` the founts point at
  founts: [],         // [{ id, name, swaps: [{ out, uid }] }] — the house's is not stored
  selected: 'house',  // the fount the next run is dealt from
  distinctions: {},   // id → true, once earned
  opened: 0,          // crates opened, ever
  seen: [],           // signatures of every sort ever held, for the "New" stamp
  nextUid: 1,
  nextFount: 1,
};

export function loadFoundry() {
  try {
    const s = JSON.parse(localStorage.getItem(FOUNDRY_KEY) || 'null');
    if (!s || typeof s !== 'object') return;
    if (Number.isFinite(s.ems)) foundry.ems = Math.max(0, Math.floor(s.ems));
    if (Array.isArray(s.crates)) foundry.crates = s.crates.filter(k => CRATE_SLOTS[k]);
    if (Array.isArray(s.stock))  foundry.stock  = s.stock.filter(t => t && typeof t.letter === 'string' && t.uid);
    if (Array.isArray(s.founts)) {
      foundry.founts = s.founts.filter(f => f?.id && Array.isArray(f.swaps))
        .map(f => ({ id: String(f.id), name: String(f.name ?? ''), swaps: f.swaps.filter(w => w?.uid && w.out) }));
    }
    if (typeof s.selected === 'string') foundry.selected = s.selected;
    if (s.distinctions && typeof s.distinctions === 'object') {
      foundry.distinctions = Object.fromEntries(
        Object.keys(s.distinctions).filter(id => DISTINCTIONS[id]).map(id => [id, true]));
    }
    if (Number.isFinite(s.opened)) foundry.opened = s.opened;
    if (Array.isArray(s.seen)) foundry.seen = s.seen.filter(x => typeof x === 'string');
    foundry.nextUid = Math.max(Number(s.nextUid) || 1, 1 + Math.max(0, ...foundry.stock.map(t => t.uid)));
    foundry.nextFount = Math.max(Number(s.nextFount) || 1, 1 + foundry.founts.length);
    if (!fountById(foundry.selected)) foundry.selected = 'house';
  } catch { /* a fresh Foundry */ }
}

export function saveFoundry() {
  try { localStorage.setItem(FOUNDRY_KEY, JSON.stringify(foundry)); } catch { /* quota */ }
}

// ─── What a sort is ───────────────────────────────────────────────────────────

// Dressed: anything on it beyond the letter itself. A ligature with nothing on
// it is plain — it is a different letter, not a finer one — and swaps freely.
export const isDressed = t =>
  !!(t.colour || t.trim || t.nick || t.material || t.letterType === 'dual'
     || t.bonusPoints || t.altBonusPoints);

// How many coats a sort wears, its metal aside.
const coats = t => (t.colour ? 1 : 0) + (t.trim ? 1 : 0) + (t.nick ? 1 : 0)
                 + (t.letterType === 'dual' ? 1 : 0);

// The grade a sort reads as, worked out from what it carries — the same answer
// for a sort a crate graded on the way in and for one that has been sitting in
// the stock since. See CRATE_GRADES in js/constants.js.
export function gradeOf(t) {
  const n = coats(t);
  if (t.material) return n >= 2 ? 'masterwork' : 'rare';
  return CRATE_GRADES[Math.min(n, CRATE_GRADES.length - 1)];
}

export const saleValue = t =>
  GRADE_EMS[gradeOf(t)] + (LIGATURES.includes(t.letter) ? LIGATURE_EMS_BONUS : 0);

// Two sorts with the same signature are the same sort, as far as the "New"
// stamp is concerned: same face or faces, same coats, same metal.
export const signature = t => [t.letter, t.letterType === 'dual' ? t.altLetter : '',
  t.colour ?? '', t.trim ?? '', t.nick ?? '', t.material ?? ''].join('|');

// ─── The crates ───────────────────────────────────────────────────────────────

const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function weighted(table) {
  const entries = Object.entries(table);
  let r = Math.random() * entries.reduce((n, [, w]) => n + w, 0);
  for (const [k, w] of entries) if ((r -= w) < 0) return k;
  return entries[entries.length - 1][0];
}

// The bag's own proportions, plus the dealt ligatures. Built the way the
// Market's letter pool is (js/market.js), so a crate can hold nothing the
// Market could not deal: no Q, no patron's own sort.
const CRATE_LETTERS = (() => {
  const w = { ...BAG_COUNTS };
  for (const L of LIGATURES) {
    if (!EXCLUSIVE_LETTERS.includes(L) && !(L in BAG_COUNTS)) w[L] = CRATE_LIGATURE_WEIGHT;
  }
  return w;
})();

// Lay `n` coats on a sort, stopping early if it can take no more.
function dress(tmpl, n) {
  while (coats(tmpl) < n && addRandomFeature(tmpl)) { /* keep dressing */ }
  return tmpl;
}

// Cast in a metal, keeping each metal's own rule: cursed iron only on a cheap
// letter, squib lead bare.
function castInMetal(n) {
  const metal = weighted(CRATE_METALS);
  let letter = weighted(CRATE_LETTERS);
  if (metal === 'cursed') {
    const cheap = Object.keys(CRATE_LETTERS).filter(L => (TILE_POINTS[L] ?? 99) <= CURSED_MAX_POINTS);
    letter = pick(cheap);
  }
  const tmpl = makeTileTemplate(letter);
  if (metal !== 'explosive') dress(tmpl, n);
  tmpl.material = metal;
  return tmpl;
}

function castGrade(grade) {
  const bare = () => makeTileTemplate(weighted(CRATE_LETTERS));
  switch (grade) {
    case 'dressed':    return dress(bare(), 1);
    case 'fine':       return dress(bare(), 2);
    case 'rare':       return Math.random() < 0.5 ? dress(bare(), 3) : castInMetal(1);
    case 'masterwork': return Math.random() < 0.3 ? dress(bare(), 4) : castInMetal(2 + (Math.random() < 0.4 ? 1 : 0));
    default:           return bare();
  }
}

// One crate's sorts, in the order they are revealed. Each slot names the grade
// it was rolled at; the sort is then graded again off what it actually carries
// (a letter with no partner for a second face can come out a coat short), and
// the reveal is sorted on that, so the crate still ends on its best.
export function rollCrate(kind = 'crate') {
  const slots = CRATE_SLOTS[kind] ?? CRATE_SLOTS.crate;
  const sorts = slots.slice(0, CRATE_SIZE).map(odds => castGrade(weighted(odds)));
  const rank = t => CRATE_GRADES.indexOf(gradeOf(t));
  return sorts.map((t, i) => ({ t, i })).sort((a, b) => rank(a.t) - rank(b.t) || a.i - b.i).map(x => x.t);
}

// Open the oldest crate waiting. An ordinary crate has FINE_CRATE_ODDS of
// turning out fine when the lid comes off; a fine one paid by a distinction is
// fine already. The sorts go straight into the stock — the sheet only shows
// them arriving — so closing the tab mid-reveal loses nothing.
export function openCrate() {
  if (!foundry.crates.length) return null;
  let kind = foundry.crates.shift();
  if (kind === 'crate' && Math.random() < FINE_CRATE_ODDS) kind = 'fine';
  const seen = new Set(foundry.seen);
  const sorts = rollCrate(kind).map(tmpl => {
    const sig = signature(tmpl);
    const isNew = !seen.has(sig);
    seen.add(sig);
    const uid = foundry.nextUid++;
    foundry.stock.push({ ...tmpl, uid });
    return { uid, tmpl, grade: gradeOf(tmpl), isNew, value: saleValue(tmpl) };
  });
  foundry.seen = [...seen];
  foundry.opened += 1;
  const awarded = checkFoundryDistinctions();
  saveFoundry();
  return { kind, sorts, awarded };
}

export function buyCrate() {
  if (foundry.ems < CRATE_PRICE) return false;
  foundry.ems -= CRATE_PRICE;
  foundry.crates.push('crate');
  saveFoundry();
  return true;
}

// ─── The stock ────────────────────────────────────────────────────────────────

export const stockByUid = uid => foundry.stock.find(t => t.uid === uid) ?? null;

// Sell a sort back for its ems. It leaves every fount it was set in, and the
// house sort it had replaced goes back in its place.
export function sellSort(uid) {
  const t = stockByUid(uid);
  if (!t) return 0;
  const value = saleValue(t);
  foundry.stock = foundry.stock.filter(s => s.uid !== uid);
  for (const f of foundry.founts) f.swaps = f.swaps.filter(w => w.uid !== uid);
  foundry.ems += value;
  saveFoundry();
  return value;
}

export const fountsUsing = uid => foundry.founts.filter(f => f.swaps.some(w => w.uid === uid));

// Dressed first, best first, then alphabetical — the order a haul is browsed in.
export function sortedStock(list = foundry.stock) {
  const rank = t => CRATE_GRADES.indexOf(gradeOf(t));
  return [...list].sort((a, b) => rank(b) - rank(a) || a.letter.localeCompare(b.letter) || a.uid - b.uid);
}

// The stock gathered into piles of identical sorts, in the same order: thirty
// plain Es are one pile marked ×30, not thirty tiles to scroll past.
export function stockPiles(list = foundry.stock) {
  const piles = new Map();
  for (const t of sortedStock(list)) {
    const sig = signature(t);
    if (!piles.has(sig)) piles.set(sig, []);
    piles.get(sig).push(t);
  }
  return [...piles.values()];
}

// ─── The founts ───────────────────────────────────────────────────────────────

const HOUSE = { id: 'house', name: FT.houseName, swaps: [], house: true };

export const allFounts = () => [HOUSE, ...foundry.founts];
export const fountById = id => allFounts().find(f => f.id === id) ?? null;
export const selectedFount = () => fountById(foundry.selected) ?? HOUSE;

// The swaps that still hold: a sort since sold has left, and a swap whose
// house letter is no longer in BAG_COUNTS (if the bag is ever retuned) gives
// way rather than growing the case past its size.
function liveSwaps(f) {
  const left = { ...BAG_COUNTS };
  const live = [];
  let dressed = 0;
  for (const w of f.swaps) {
    const t = stockByUid(w.uid);
    if (!t || !(left[w.out] > 0)) continue;
    if (isDressed(t)) { if (dressed >= FOUNT_DRESSED_MAX) continue; dressed++; }
    left[w.out]--;
    live.push({ ...w, t });
  }
  return { live, left, dressed };
}

// The fount laid out for the sheet: every one of its STARTING_CASE places, by
// letter, each either a house sort or a sort from the stock (with the house
// letter it stands in for).
export function fountCase(f) {
  const { live, left, dressed } = liveSwaps(f);
  const places = [
    ...live.map(w => ({ uid: w.uid, out: w.out, t: w.t })),
    ...Object.entries(left).flatMap(([L, n]) =>
      Array.from({ length: n }, () => ({ uid: null, out: L, t: makeTileTemplate(L) }))),
  ];
  const key = p => getActiveLetter(p.t);
  places.sort((a, b) => key(a).localeCompare(key(b)) || (a.uid ? 1 : 0) - (b.uid ? 1 : 0));
  const vowels = places.filter(p => /^[AEIOU]/.test(key(p))).length;
  return { places, dressed, swapped: live.length, vowels };
}

// The templates a run is dealt: copies, so the run can do as it likes to them.
export function fountTemplates(id = foundry.selected) {
  const f = fountById(id) ?? HOUSE;
  const { live, left } = liveSwaps(f);
  const out = [];
  for (const [L, n] of Object.entries(left)) for (let i = 0; i < n; i++) out.push(makeTileTemplate(L));
  for (const { t } of live) {
    const { uid, ...tmpl } = t;
    out.push(JSON.parse(JSON.stringify(tmpl)));
  }
  return out;
}

export function selectFount(id) {
  if (!fountById(id)) return false;
  foundry.selected = id;
  saveFoundry();
  return true;
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

export function newFount() {
  if (foundry.founts.length >= FOUNT_MAX) return null;
  const n = foundry.nextFount++;
  const f = { id: `f${n}`, name: fillSlots(FT.fountName, ROMAN[n] ?? n), swaps: [] };
  foundry.founts.push(f);
  saveFoundry();
  return f;
}

export function renameFount(id, name) {
  const f = foundry.founts.find(x => x.id === id);
  if (!f) return;
  f.name = String(name).trim().slice(0, 32) || f.name;
  saveFoundry();
}

export function deleteFount(id) {
  foundry.founts = foundry.founts.filter(f => f.id !== id);
  if (foundry.selected === id) foundry.selected = 'house';
  saveFoundry();
}

// Put a stock sort in place of one of the fount's house sorts. Returns null on
// success, or the reason it can't be done (a key of FOUNDRY_TEXT).
export function swapIn(id, out, uid) {
  const f = foundry.founts.find(x => x.id === id);
  const t = stockByUid(uid);
  if (!f || !t) return 'houseLocked';
  const { live, left, dressed } = liveSwaps(f);
  if (live.some(w => w.uid === uid)) return 'stockAllIn';
  if (!(left[out] > 0)) return 'houseLocked';
  if (isDressed(t) && dressed >= FOUNT_DRESSED_MAX) return 'dressedFull';
  f.swaps = [...live.map(({ out: o, uid: u }) => ({ out: o, uid: u })), { out, uid }];
  checkFoundryDistinctions();
  saveFoundry();
  return null;
}

export function swapOut(id, uid) {
  const f = foundry.founts.find(x => x.id === id);
  if (!f) return;
  f.swaps = f.swaps.filter(w => w.uid !== uid);
  saveFoundry();
}

// ─── What a run pays in ───────────────────────────────────────────────────────

// What a reward reads as, on a log line or the end screen.
export function rewardText({ ems = 0, crate = null } = {}) {
  const parts = [];
  if (crate) parts.push(logLine(crate === 'fine' ? 'rewardFine' : 'rewardCrate'));
  if (ems) parts.push(ems === 1 ? logLine('rewardEm1') : logLine('rewardEms', ems));
  return parts.join(' and ');
}

function grant({ ems = 0, crate = null }) {
  foundry.ems += ems;
  if (crate) foundry.crates.push(crate);
}

// Bank a reward from the run and write it on the run's takings.
function take(label, reward) {
  grant(reward);
  (state.takings ??= []).push({ label, ...reward });
}

// The win: called once, as the tenth chapter's last page is cleared and before
// the victory screen is drawn. `foundryPaid` marks the chapter, so a reload
// that lands on the far side of it can never pay twice.
export function payWin() {
  if (state.playtested || (state.foundryPaid ?? 0) >= FINAL_CHAPTER) return [];
  state.foundryPaid = FINAL_CHAPTER;
  const d = difficultyOf(state.difficulty);
  take(logLine('takingsWin', d.label), { crate: 'crate', ems: d.winEms ?? 0 });
  const awarded = checkDistinctions('win');
  saveFoundry();
  return awarded;
}

// An appendix chapter cleared — `chapter` is the one just finished. Returns the
// log line to say, or null.
export function payAppendix(chapter) {
  if (state.playtested || chapter <= FINAL_CHAPTER || (state.foundryPaid ?? 0) >= chapter) return null;
  state.foundryPaid = chapter;
  const n = chapter - FINAL_CHAPTER;
  const reward = { ems: APPENDIX_EMS, crate: n % APPENDIX_CRATE_EVERY === 0 ? 'crate' : null };
  take(logLine('takingsAppendix', chapterLabel(chapter)), reward);
  const awarded = checkDistinctions('appendix', { cleared: n });
  saveFoundry();
  return { line: logLine('appendixPaid', chapterLabel(chapter), rewardText(reward)), awarded };
}

// ─── Distinctions ─────────────────────────────────────────────────────────────

const has = id => !!foundry.distinctions[id];

export const distinctionDesc = (id) => {
  const d = DISTINCTIONS[id];
  return d ? fillSlots(d.desc, (d.at ?? '').toLocaleString()) : '';
};

// Earn it, pay it, and say so. A distinction earned in a run is written on the
// run's takings too; one earned at the Foundry itself (a crate opened, a fount
// filled) is paid quietly and the sheet shows it.
function award(id, { inRun = true } = {}) {
  if (has(id) || !DISTINCTIONS[id]) return null;
  const d = DISTINCTIONS[id];
  const reward = { ems: d.ems ?? 0, crate: d.crate ?? null };
  foundry.distinctions[id] = true;
  if (inRun) take(logLine('takingsDistinction', d.name), reward);
  else grant(reward);
  return { id, name: d.name, line: logLine('distinctionEarned', d.name, distinctionDesc(id), rewardText(reward)) };
}

// The checks that read a run, by the moment they are asked at. Nothing a
// playtest run does counts. Returns what was awarded, for the board to say.
export function checkDistinctions(moment, ctx = {}) {
  if (state.playtested) return [];
  const out = [];
  const tryAward = (id, cond) => { if (!has(id) && cond) { const a = award(id); if (a) out.push(a); } };

  if (moment === 'word') {
    const { script, printed = [] } = ctx;
    const len = String(script?.letters ?? '').length;
    const total = script?.total ?? 0;
    tryAward('nine',        len >= DISTINCTIONS.nine.at);
    tryAward('twelve',      len >= DISTINCTIONS.twelve.at);
    tryAward('thousand',    total >= DISTINCTIONS.thousand.at);
    tryAward('tenthousand', total >= DISTINCTIONS.tenthousand.at);
    tryAward('bigword',     total >= DISTINCTIONS.bigword.at);
    tryAward('allcolours',  Object.keys(COLOURS).every(c => printed.some(t => countsAsColour(t, c))));
    tryAward('quixote',     printed.some(t => getActiveLetter(t) === 'Q'));
    tryAward('interrobang', printed.some(t => getActiveLetter(t) === INTERROBANG));
  }
  if (moment === 'page') {
    tryAward('onestroke', ctx.deadline && state.wordsPrinted === 1);
  }
  if (moment === 'win') {
    tryAward('finis', true);
    tryAward('fullclimb', state.difficulty === DEFAULT_DIFFICULTY);
    tryAward('ownfount', !!state.fount && state.fount.id !== 'house' && (state.fount.swapped ?? 0) > 0);
  }
  if (moment === 'appendix') {
    tryAward('appendix3', ctx.cleared >= DISTINCTIONS.appendix3.at);
    tryAward('appendix6', ctx.cleared >= DISTINCTIONS.appendix6.at);
  }
  if (out.length) saveFoundry();
  return out;
}

// The distinctions earned at the Foundry rather than in a run.
function checkFoundryDistinctions() {
  const out = [];
  const tryAward = (id, cond) => { if (!has(id) && cond) { const a = award(id, { inRun: false }); if (a) out.push(a); } };
  tryAward('crates10', foundry.opened >= DISTINCTIONS.crates10.at);
  tryAward('crates50', foundry.opened >= DISTINCTIONS.crates50.at);
  tryAward('fullfount', foundry.founts.some(f => liveSwaps(f).dressed >= FOUNT_DRESSED_MAX));
  return out;
}

// ─── For the prospectus ───────────────────────────────────────────────────────

// What the run was dealt from, kept on the run for the end screen and for
// Private Press: the fount's id, its name, and how many sorts it swapped.
export function fountRecord(id = foundry.selected) {
  const f = fountById(id) ?? HOUSE;
  return { id: f.id, name: f.name, swapped: liveSwaps(f).live.length };
}

// Playtest helpers (Settings → dev tools).
export function devGrant({ ems = 0, crates = 0 } = {}) {
  foundry.ems += ems;
  for (let i = 0; i < crates; i++) foundry.crates.push('crate');
  saveFoundry();
}

export { CRATE_PRICE, STARTING_CASE, FOUNT_DRESSED_MAX };
