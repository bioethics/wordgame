// Holds the Daily Proof to the game it is made from.
//
//   node tools/daily-check.mjs [challenges]      (default: 1–40)
//
// 1. SCORING. Thousands of random arrangements from real deals are scored by
//    daily/score.js AND by the game's own computeScore (js/scoring.js) with an
//    empty table. Any difference in Points, Mult or total fails the run.
// 2. SOLVING. For a sample of words on each case, a naive search — every tile,
//    every face, every mark tail, every possible use of the day's tool, no
//    shortcuts — finds the best score independently. The solver must agree,
//    must find every word the naive search can set, and its plan must
//    reproduce its own score when replayed through scoreWord.
// 3. THE DEALS. Field sizes, top scores, solve times and what the luck dealt,
//    so the tuning in daily/deal.js can be read rather than guessed at.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// state.js and themes.js touch localStorage on the way in; give them a shelf.
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = p => import(new URL(`../${p}`, import.meta.url).href);

const { adoptExclusions, isExcluded } = await imp('js/excluded.js');
const { DICT } = await imp('js/dict.js');
const { computeScore } = await imp('js/scoring.js');
const { state } = await imp('js/state.js');
const { isMark, MEDIEVAL, makeTileTemplate } = await imp('js/constants.js');
const S = await imp('daily/score.js');
const { dealChallenge, OMENS } = await imp('daily/deal.js');
const TB = await imp('daily/table.js');
const { adoptTheme, THEME_FILES } = await imp('js/themes.js');

adoptExclusions(fs.readFileSync(path.join(root, 'wordlists/excluded-slurs.txt'), 'utf8'));
const words = fs.readFileSync(path.join(root, 'wordlists/wordlist.txt'), 'utf8')
  .replace(/\r/g, '').split('\n').map(w => w.trim().toUpperCase())
  .filter(w => /^[A-Z]+$/.test(w) && !isExcluded(w));
const wordSet = new Set(words);
const has = w => wordSet.has(w);
for (const w of words) DICT.add(w);   // so the game's resolveMedieval reads as ours does
// The lists the patrons and editors read, into the game's themes and the daily's
// own copy alike, from the same files.
for (const [k, f] of Object.entries(TB.LIST_FILES)) {
  const text = fs.readFileSync(path.join(root, f), 'utf8');
  TB.adoptList(k, text);
  const key = Object.keys(THEME_FILES).find(t => THEME_FILES[t] === f);
  if (key) adoptTheme(key, text);
}

const [from, to] = (process.argv[2] ?? '1-40').split('-').map(Number);
let rng = 12345;
const rand = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const shuffled = a => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

let failures = 0;
const fail = msg => { failures++; if (failures < 25) console.error('  ✗', msg); };

// ─── 1. Scoring parity ────────────────────────────────────────────────────────
let compared = 0;
const PLAIN = { day: { kind: 'plain' } };
for (let n = from; n <= to; n++) {
  const deal = dealChallenge(n, PLAIN);
  for (let k = 0; k < 150; k++) {
    // A random tool application, sometimes — so grown and stepped faces are
    // compared too.
    let tiles = deal.tiles.map(t => ({ ...t, activeVariant: t.letterType === 'dual' && rand() < 0.5 ? 1 : 0 }));
    if (deal.tool && rand() < 0.5) {
      const offered = tiles.filter(x => x.paintOffer);
      const t = deal.tool === 'tube' ? offered[Math.floor(rand() * offered.length)]
        : tiles[Math.floor(rand() * tiles.length)];
      const applied = deal.tool === 'ratchet'
        ? { kind: 'ratchet', id: t.id, face: t.activeVariant, offset: rand() < 0.5 ? -1 : 1 }
        : deal.tool === 'tube' ? { kind: 'tube', id: t.id, colour: deal.tube }
        : { kind: 'loupe', id: t.id, face: t.activeVariant };
      tiles = S.withTool(tiles, applied);
    }
    // Sometimes a tile The Redactor has wrapped, still dressed underneath, as
    // the game would hand it over: both must read it as spelling only.
    if (rand() < 0.3) {
      const i = Math.floor(rand() * tiles.length);
      if (!tiles[i].material) tiles = tiles.map((t, j) => (j === i ? { ...t, wrapped: true } : t));
    }
    const order = shuffled(tiles);
    const len = 1 + Math.floor(rand() * Math.min(12, order.length));
    const word = order.slice(0, len);
    const rest = order.slice(len);
    state.rack = rest;
    const theirs = computeScore(word);
    const ours = S.scoreWord(word, rest, has);
    compared++;
    if (theirs.total !== ours.total || theirs.mult !== ours.mult || theirs.points !== ours.points) {
      fail(`№${n} ${ours.set}: game ${theirs.points}×${theirs.mult}=${theirs.total}, daily ${ours.points}×${ours.mult}=${ours.total}`);
    }
  }
}
console.log(`scoring: ${compared} arrangements compared with computeScore`);

// ─── 1½. The same, with each patron and each editor seated ────────────────────
// The game's own seat for the patron (state.patrons) and its own desk for the
// editor (state.boss), against daily/table.js. The editors' daily data is read
// into the shape the game's editor keeps.
const GAME_DESK = {
  columnist:  d => ({ required: d.n }),
  serialist:  d => ({ last: d.letter }),
  enthusiast: d => ({ letter: d.letter }),
};
// The daily's own ×2 versions (adapted: true in daily/table.js) are not the
// game's patrons and are not held to computeScore; they are counted, below.
const adapted = Object.keys(TB.PATRONS).filter(id => TB.PATRONS[id].adapted);
const seatings = [
  ...Object.keys(TB.PATRONS).filter(id => !TB.PATRONS[id].adapted).map(id => ({
    seat: { id, data: id === 'monogrammist' ? { letters: ['E', 'S', 'T'] } : {} }, desk: null })),
  ...Object.keys(TB.EDITORS).map(id => ({
    seat: null, desk: { id, data: { n: 6, letter: 'S', band: 500 } } })),
];
let seatedCompared = 0;
for (const { seat, desk } of seatings) {
  const T = TB.compileTable(seat, desk, has);
  state.patrons = seat ? [{ id: seat.id, uid: 1, data: seat.data }] : [];
  state.ghosts = [];
  state.boss = desk ? { id: desk.id, data: (GAME_DESK[desk.id] ?? (() => ({})))(desk.data) } : null;
  for (let n = from; n <= Math.min(to, from + 9); n++) {
    const deal = dealChallenge(n, PLAIN);
    for (let k = 0; k < 120; k++) {
      let tiles = deal.tiles.map(t => ({ ...t, activeVariant: t.letterType === 'dual' && rand() < 0.5 ? 1 : 0 }));
      // A seat that brings a tile: the OLOGY, or a blank set as some letter.
      if (TB.PATRONS[seat?.id]?.adds) {
        const a = TB.PATRONS[seat.id].adds;
        tiles.push({ ...tiles[0], id: tiles.length, colour: null, trim: null, nick: null, material: null,
          letterType: 'normal', altLetter: null, activeVariant: 0, bonusPoints: 0, altBonusPoints: 0,
          letter: a.blank ? S.RING[Math.floor(rand() * 26)] : a.letter, counterfeit: !!a.counterfeit });
      }
      // Doubled letters and touching colours are what several seats read, and
      // a random order rarely deals them — so sometimes sort the word to bring
      // like next to like.
      let order = shuffled(tiles);
      if (rand() < 0.4) order.sort((a, b) => (S.activeLetter(a) + (a.colour ?? '')).localeCompare(S.activeLetter(b) + (b.colour ?? '')));
      const len = 1 + Math.floor(rand() * Math.min(12, order.length));
      const start = Math.floor(rand() * (order.length - len + 1));
      const word = order.slice(start, start + len);
      const rest = order.filter(t => !word.includes(t));
      state.rack = rest;
      const theirs = computeScore(word);
      const ours = S.scoreWord(word, rest, has, T);
      seatedCompared++;
      if (theirs.total !== ours.total || theirs.mult !== ours.mult || theirs.points !== ours.points) {
        fail(`${seat?.id ?? desk.id} №${n} ${ours.set}: game ${theirs.points}×${theirs.mult}=${theirs.total}, daily ${ours.points}×${ours.mult}=${ours.total}`);
      }
    }
  }
}
state.patrons = []; state.boss = null;
console.log(`seated: ${seatedCompared} arrangements under ${seatings.length} seatings compared with computeScore (${adapted.length} adapted for the daily, not compared: ${adapted.join(', ')})`);

// The Expectant Parents pay on names, which a random setting almost never
// spells: so score real names — in the dictionary and out of it — under both.
{
  const T = TB.compileTable({ id: 'expectants', data: {} }, null, has);
  state.patrons = [{ id: 'expectants', uid: 1, data: {} }];
  state.ghosts = []; state.boss = null; state.rack = [];
  const names = [...TB.LISTS.names.keys(), ...TB.LISTS.borrowed.keys()].filter(w => /^[A-Z]{3,10}$/.test(w));
  const step = Math.max(1, Math.floor(names.length / 300));
  let compared = 0, paid = 0;
  for (let i = 0; i < names.length; i += step) {
    const word = [...names[i]].map((L, id) => ({ ...makeTileTemplate(L), id, activeVariant: 0 }));
    const theirs = computeScore(word);
    const ours = S.scoreWord(word, [], w => has(w) || TB.LISTS.names.has(w) || TB.LISTS.borrowed.has(w), T);
    compared++; if (ours.seat) paid++;
    if (theirs.total !== ours.total) fail(`expectants ${names[i]}: game ${theirs.total}, daily ${ours.total}`);
  }
  state.patrons = [];
  console.log(`names: ${compared} names scored under The Expectant Parents (${paid} paid), matching computeScore`);
}

// ─── 2. The solver against a naive search ─────────────────────────────────────
// Every way the tool could be used (or not), applied up front through withTool;
// then every assignment of tiles to the word, every face, every legal tail, and
// every letter a blank could be. Scored by scoreWord under the table given.
function naiveBest(tiles, tool, word, T = null) {
  const uses = [null];
  if (tool === 'tube') {
    for (const t of tiles) if (t.paintOffer && !t.colour) uses.push({ kind: 'tube', id: t.id, colour: t.paintOffer });
  } else if (tool) for (const t of tiles) for (const v of [0, ...(t.letterType === 'dual' ? [1] : [])]) {
    if (t.ephemeral || t.counterfeit || t.wrapped) continue;   // as isImmutable: no tool takes them
    if (tool === 'ratchet') { for (const off of [-1, 1]) if (S.shiftable(t, v)) uses.push({ kind: 'ratchet', id: t.id, face: v, offset: off }); }
    else if (S.loupeDelta(t, v) > 0) uses.push({ kind: 'loupe', id: t.id, face: v });
  }
  let best = null;
  for (const use of uses) {
    const case_ = S.withTool(tiles, use);
    const letterTiles = case_.filter(t => !isMark(t.letter));
    const marks = case_.filter(t => isMark(t.letter));
    const tails = [[]];
    for (const q of marks.filter(m => m.letter === '?')) tails.push([q]);
    for (const e of marks.filter(m => m.letter === '!')) tails.push([e]);
    for (const q of marks.filter(m => m.letter === '?')) for (const e of marks.filter(m => m.letter === '!')) tails.push([q, e]);
    const seq = [];
    const walk = (pos, used) => {
      if (pos === word.length) {
        for (const tail of tails) {
          const set = [...seq, ...tail.map(t => ({ ...t, activeVariant: 0 }))];
          const j = S.judge(set, has);
          if (!j.ok || j.letters !== word) continue;
          const ids = new Set(set.map(s => s.id));
          const rest = case_.filter(t => !ids.has(t.id));
          const sc = S.scoreWord(set, rest, has, T).total;
          if (!best || sc > best) best = sc;
        }
        return;
      }
      for (const t of letterTiles) {
        if (used.has(t.id)) continue;
        if (t.blank) {
          if (!S.RING.includes(word[pos])) continue;
          seq.push({ ...t, letter: word[pos] });
          used.add(t.id); walk(pos + 1, used); used.delete(t.id);
          seq.pop();
          continue;
        }
        for (const v of [0, ...(t.letterType === 'dual' ? [1] : [])]) {
          const L = S.faceLetter(t, v);
          const reads = MEDIEVAL[L]?.reads ?? [L];
          for (const r of reads) {
            if (!word.startsWith(r, pos)) continue;
            seq.push({ ...t, activeVariant: v });
            used.add(t.id);
            walk(pos + r.length, used);
            used.delete(t.id);
            seq.pop();
          }
        }
      }
    };
    walk(0, new Set());
  }
  return best;
}

const stats = [];
for (let n = from; n <= to; n++) {
  const deal = dealChallenge(n);
  const day = deal.day;
  if (day.kind === 'pair') { checkPairs(deal); continue; }
  const tables = TB.tablesForDay(day, has);
  const t0 = performance.now();
  const { results, scores } = S.solveCaseSync(deal.tiles, deal.tool, words, has, tables);
  const ms = performance.now() - t0;

  // Every plan replays to its own score, and reads as its own word.
  for (const [w, r] of results) {
    const { word: set, rest } = S.settingOf(deal.tiles, r);
    const j = S.judge(set, has);
    const sc = S.scoreWord(set, rest, has, tables.length ? tables[r.seat] : null);
    if (!j.ok || j.letters !== w) fail(`№${n} plan for ${w} reads as ${j.letters ?? j.why}`);
    if (sc.total !== r.score) fail(`№${n} plan for ${w} replays to ${sc.total}, solver said ${r.score}`);
  }

  // A sample of words, found or not, against the naive search — under every
  // table the day prices words with.
  const found = [...results.keys()];
  const sample = [...shuffled(found).slice(0, 40), ...shuffled(words.filter(w => w.length <= 7)).slice(0, 80)];
  for (const w of sample) {
    const got = results.get(w);
    if (!tables.length) {
      const naive = naiveBest(deal.tiles, deal.tool, w);
      if (naive !== (got?.score ?? null)) fail(`№${n} ${w}: naive ${naive}, solver ${got?.score ?? null}`);
      continue;
    }
    tables.forEach((T, k) => {
      const naive = naiveBest(deal.tiles, deal.tool, w, T);
      const solved = got ? got.scores[k] : null;
      if (naive !== solved) fail(`№${n} ${day.kind} ${w} [${k}]: naive ${naive}, solver ${solved}`);
    });
  }

  const feats = deal.tiles.reduce((a, t) => a + !!t.colour + !!t.trim + !!t.nick + (t.letterType === 'dual'), 0);
  const top = [...results].sort((a, b) => b[1].score - a[1].score)[0];
  const who = day.patron?.id ?? day.editor?.id ?? (day.choices ?? []).map(c => c.id).join('/') ?? '';
  stats.push({ n, day: `${day.kind}${who ? ` ${who}` : ''}`, omen: deal.omen, tool: deal.tool ?? '—', field: results.size,
    top: top?.[0], best: scores[0], median: scores[Math.floor(scores.length / 2)], feats, ms: Math.round(ms) });
}

// ─── 2½. Two words ────────────────────────────────────────────────────────────
// For a sample of word pairs, every assignment of tiles to both words at once,
// scored by scoreWord, against pairBest. And the field's best pair must replay.
function checkPairs(deal) {
  const n = deal.n;
  const min = deal.day.min;
  const long = words.filter(w => w.length >= min);
  const t0 = performance.now();
  const cs = S.prepareCase(deal.tiles, null);
  const W = [];
  for (const w of long) {
    const plans = S.plansFor(cs, w, has);
    if (plans.length) { let req = plans[0].mask; for (const q of plans) req &= q.mask; W.push({ word: w, plans, req, best: plans[0].score }); }
  }
  const ms = performance.now() - t0;
  const settings = w => {
    // Every way to set one word: [{ ids:Set, score }].
    const out = [];
    const tiles = deal.tiles;
    const seq = [];
    const walk = (pos, used) => {
      if (pos === w.length) {
        const j = S.judge(seq, has);
        if (!j.ok || j.letters !== w) return;
        out.push({ ids: new Set(used), score: S.scoreWord(seq, [], has).total });
        return;
      }
      for (const t of tiles) {
        if (used.has(t.id)) continue;
        for (const v of [0, ...(t.letterType === 'dual' ? [1] : [])]) {
          const L = S.faceLetter(t, v);
          for (const r of MEDIEVAL[L]?.reads ?? [L]) {
            if (!w.startsWith(r, pos)) continue;
            seq.push({ ...t, activeVariant: v }); used.add(t.id);
            walk(pos + r.length, used);
            used.delete(t.id); seq.pop();
          }
        }
      }
    };
    walk(0, new Set());
    return out;
  };
  const sample = shuffled(W).slice(0, 14);
  let pairs = 0;
  for (let i = 0; i < sample.length; i++) for (let j = i; j < sample.length; j++) {
    const A = sample[i], B = sample[j];
    const sa = settings(A.word), sb = settings(B.word);
    let naive = -1;
    for (const a of sa) for (const b of sb) {
      if ([...a.ids].some(id => b.ids.has(id))) continue;
      naive = Math.max(naive, a.score + b.score);
    }
    const got = S.pairBest(A, B).score;
    pairs++;
    if (naive !== got) fail(`№${n} pair ${A.word}+${B.word}: naive ${naive}, solver ${got}`);
  }
  // Each word's best plan replays to its score.
  for (const e of W.slice(0, 200)) {
    const { word: set } = S.settingOf(deal.tiles, e.plans[0]);
    const sc = S.scoreWord(set, [], has).total;
    if (sc !== e.best) fail(`№${n} ${e.word} replays to ${sc}, plans said ${e.best}`);
  }
  stats.push({ n, day: 'pair', omen: deal.omen, tool: '—', field: W.length, top: W[0]?.word, best: W[0]?.best,
    median: `${pairs} pairs checked`, feats: deal.tiles.length, ms: Math.round(ms) });
}

console.table(stats);
const avg = k => Math.round(stats.reduce((a, s) => a + s[k], 0) / stats.length);
console.log(`field avg ${avg('field')}, min ${Math.min(...stats.map(s => s.field))}; solve avg ${avg('ms')} ms, max ${Math.max(...stats.map(s => s.ms))} ms; features avg ${avg('feats')}`);
const omenCount = {};
for (const s of stats) omenCount[s.omen] = (omenCount[s.omen] ?? 0) + 1;
console.log('omens:', Object.keys(OMENS).map(k => `${k} ${omenCount[k] ?? 0}`).join(', '));

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall checks passed');
