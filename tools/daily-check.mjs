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
const { isMark, MEDIEVAL } = await imp('js/constants.js');
const S = await imp('daily/score.js');
const { dealChallenge, OMENS } = await imp('daily/deal.js');

adoptExclusions(fs.readFileSync(path.join(root, 'wordlists/excluded-slurs.txt'), 'utf8'));
const words = fs.readFileSync(path.join(root, 'wordlists/wordlist.txt'), 'utf8')
  .replace(/\r/g, '').split('\n').map(w => w.trim().toUpperCase())
  .filter(w => /^[A-Z]+$/.test(w) && !isExcluded(w));
const wordSet = new Set(words);
const has = w => wordSet.has(w);
for (const w of words) DICT.add(w);   // so the game's resolveMedieval reads as ours does

const [from, to] = (process.argv[2] ?? '1-40').split('-').map(Number);
let rng = 12345;
const rand = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const shuffled = a => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

let failures = 0;
const fail = msg => { failures++; if (failures < 25) console.error('  ✗', msg); };

// ─── 1. Scoring parity ────────────────────────────────────────────────────────
let compared = 0;
for (let n = from; n <= to; n++) {
  const deal = dealChallenge(n);
  for (let k = 0; k < 150; k++) {
    // A random tool application, sometimes — so grown and stepped faces are
    // compared too.
    let tiles = deal.tiles.map(t => ({ ...t, activeVariant: t.letterType === 'dual' && rand() < 0.5 ? 1 : 0 }));
    if (deal.tool && rand() < 0.5) {
      const t = tiles[Math.floor(rand() * tiles.length)];
      const applied = deal.tool === 'ratchet'
        ? { kind: 'ratchet', id: t.id, face: t.activeVariant, offset: rand() < 0.5 ? -1 : 1 }
        : { kind: 'loupe', id: t.id, face: t.activeVariant };
      tiles = S.withTool(tiles, applied);
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

// ─── 2. The solver against a naive search ─────────────────────────────────────
// Every way the tool could be used (or not), applied up front through withTool;
// then every assignment of tiles to the word, every face, every legal tail.
function naiveBest(tiles, tool, word) {
  const uses = [null];
  if (tool) for (const t of tiles) for (const v of [0, ...(t.letterType === 'dual' ? [1] : [])]) {
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
          const rest = case_.filter(t => !set.some(s => s.id === t.id));
          const sc = S.scoreWord(set, rest, has).total;
          if (!best || sc > best) best = sc;
        }
        return;
      }
      for (const t of letterTiles) {
        if (used.has(t.id)) continue;
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
  const t0 = performance.now();
  const { results, scores } = S.solveCaseSync(deal.tiles, deal.tool, words, has);
  const ms = performance.now() - t0;

  // Every plan replays to its own score, and reads as its own word.
  for (const [w, r] of results) {
    const tiles = S.withTool(deal.tiles, r.tool);
    const byId = new Map(tiles.map(t => [t.id, t]));
    const set = r.plan.map(p => ({ ...byId.get(p.id), activeVariant: p.face }));
    const rest = tiles.filter(t => !r.plan.some(p => p.id === t.id));
    const j = S.judge(set, has);
    const sc = S.scoreWord(set, rest, has);
    if (!j.ok || j.letters !== w) fail(`№${n} plan for ${w} reads as ${j.letters ?? j.why}`);
    if (sc.total !== r.score) fail(`№${n} plan for ${w} replays to ${sc.total}, solver said ${r.score}`);
  }

  // A sample of words, found or not, against the naive search.
  const found = [...results.keys()];
  const sample = [...shuffled(found).slice(0, 60), ...shuffled(words.filter(w => w.length <= 7)).slice(0, 120)];
  for (const w of sample) {
    const naive = naiveBest(deal.tiles, deal.tool, w);
    const solved = results.get(w)?.score ?? null;
    if (naive !== solved) fail(`№${n} ${w}: naive ${naive}, solver ${solved}`);
  }

  const feats = deal.tiles.reduce((a, t) => a + !!t.colour + !!t.trim + !!t.nick + (t.letterType === 'dual'), 0);
  const top = [...results].sort((a, b) => b[1].score - a[1].score)[0];
  stats.push({ n, omen: deal.omen, tool: deal.tool ?? '—', field: results.size, top: top?.[0], best: scores[0],
    median: scores[Math.floor(scores.length / 2)], feats, ms: Math.round(ms) });
}

console.table(stats);
const avg = k => Math.round(stats.reduce((a, s) => a + s[k], 0) / stats.length);
console.log(`field avg ${avg('field')}, min ${Math.min(...stats.map(s => s.field))}; solve avg ${avg('ms')} ms, max ${Math.max(...stats.map(s => s.ms))} ms; features avg ${avg('feats')}`);
const omenCount = {};
for (const s of stats) omenCount[s.omen] = (omenCount[s.omen] ?? 0) + 1;
console.log('omens:', Object.keys(OMENS).map(k => `${k} ${omenCount[k] ?? 0}`).join(', '));

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall checks passed');
