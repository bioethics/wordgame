// Measures the Daily Proof's patrons and editors against real cases, so the
// roster in daily/deal.js is chosen by what each seat DOES to the field rather
// than by what its card promises.
//
//   node tools/daily-table.mjs [challenges] [out.json]     (default: 1–48)
//
// For every case the whole dictionary is solved once with every seating priced
// at each leaf (bestFor's `tables`), plus once more for each seat that brings a
// tile of its own. Per seating it reports:
//
//   power   best seated score ÷ best unseated, as a median over the cases — how
//           much the seat is worth to a reader who finds the best word
//   moved   how often the best word is a DIFFERENT word with the seat — the
//           thing that matters: a seat that only multiplies the word you were
//           already going to set poses no question
//   fired   how often the seat touches the best seated word at all
//   dead    how often nothing in the whole field triggers it
//
// Editors also report `bit` (the unseated best word is spiked) and `through`
// (the best word under the editor is a spiked one — the spike paid anyway).
//
// With an output path, the per-case bests are written out for the choice-set
// analysis (tools/daily-sets.mjs reads them).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = p => import(new URL(`../${p}`, import.meta.url).href);

const { adoptExclusions, isExcluded } = await imp('js/excluded.js');
const S = await imp('daily/score.js');
const TB = await imp('daily/table.js');
const D = await imp('daily/deal.js');

adoptExclusions(fs.readFileSync(path.join(root, 'wordlists/excluded-slurs.txt'), 'utf8'));
const words = fs.readFileSync(path.join(root, 'wordlists/wordlist.txt'), 'utf8')
  .replace(/\r/g, '').split('\n').map(w => w.trim().toUpperCase())
  .filter(w => /^[A-Z]+$/.test(w) && !isExcluded(w));
const set = new Set(words);
const has = w => set.has(w);
for (const [k, f] of Object.entries(TB.LIST_FILES)) TB.adoptList(k, fs.readFileSync(path.join(root, f), 'utf8'));

const [from, to] = (process.argv[2] ?? '1-48').split('-').map(Number);
const outPath = process.argv[3] ?? null;

// The seatings measured. Editors with a rolled part are measured at each value
// they might roll; letters are drawn from the case itself, as a deal would.
const caseLetters = deal => deal.tiles.map(t => t.letter).filter(L => /^[A-Z]$/.test(L));
function seatingsFor(deal, rng) {
  const out = [{ key: '—', seat: null, desk: null }];
  for (const id of Object.keys(TB.PATRONS)) {
    if (TB.PATRONS[id].adds) continue;
    const data = id === 'monogrammist' ? { letters: D.monogramFor(deal, rng) } : {};
    out.push({ key: id, seat: { id, data }, desk: null });
  }
  for (const n of [4, 5, 6, 7, 8]) out.push({ key: `columnist ${n}`, seat: null, desk: { id: 'columnist', data: { n } } });
  const Ls = [...new Set(caseLetters(deal))];
  const L = Ls[Math.floor(rng() * Ls.length)];
  out.push({ key: 'serialist', seat: null, desk: { id: 'serialist', data: { letter: L } } });
  for (const band of [500, 2000, 4000]) out.push({ key: `obscurantist ${band}`, seat: null, desk: { id: 'obscurantist', data: { band } } });
  for (const id of ['padder', 'populist', 'minimalist']) out.push({ key: id, seat: null, desk: { id, data: {} } });
  return out;
}

const tally = new Map();
const perCase = [];
const bump = (key, f) => { if (!tally.has(key)) tally.set(key, { power: [], moved: 0, fired: 0, dead: 0, bit: 0, through: 0, n: 0 }); f(tally.get(key)); };

for (let n = from; n <= to; n++) {
  const deal = D.dealChallenge(n);
  const rng = D.rngFor(`measure:${n}`);
  const seatings = seatingsFor(deal, rng);
  const tables = seatings.map(s => TB.compileTable(s.seat, s.desk, has));
  const t0 = performance.now();
  const { results } = S.solveCaseSync(deal.tiles, deal.tool, words, has, tables);
  const ms = performance.now() - t0;

  // Per seating: the best word, and whether the seat touched it.
  const tops = seatings.map(() => ({ word: null, score: -1 }));
  const anyFire = seatings.map(() => false);
  for (const [w, r] of results) {
    r.scores.forEach((sc, k) => {
      if (sc > tops[k].score) tops[k] = { word: w, score: sc };
      if (sc !== r.scores[0]) anyFire[k] = true;
    });
  }
  const plain = tops[0];
  const row = { n, omen: deal.omen, tool: deal.tool, plain: plain.score, bests: {} };
  seatings.forEach((s, k) => {
    if (!k) return;
    const top = tops[k];
    const unseatedOfTop = results.get(top.word).scores[0];
    row.bests[s.key] = top.score;
    bump(s.key, t => {
      t.n++;
      t.power.push(top.score / Math.max(1, plain.score));
      if (top.word !== plain.word) t.moved++;
      if (top.score !== unseatedOfTop) t.fired++;
      if (!anyFire[k]) t.dead++;
      if (s.desk) {
        if (results.get(plain.word).scores[k] < plain.score) t.bit++;
        // Spiked: worth less under the desk than unseated.
        if (top.score < unseatedOfTop) t.through++;
      }
    });
  });

  // The seats that bring a tile: a case of seventeen, solved on its own.
  for (const id of Object.keys(TB.PATRONS).filter(i => TB.PATRONS[i].adds)) {
    const tiles = D.withAdded(deal.tiles, TB.PATRONS[id].adds);
    const T = [TB.compileTable(null, null, has)];
    const r2 = S.solveCaseSync(tiles, deal.tool, words, has, T).results;
    let top = { word: null, score: -1 };
    for (const [w, r] of r2) if (r.score > top.score) top = { word: w, score: r.score };
    row.bests[id] = top.score;
    bump(id, t => {
      t.n++;
      t.power.push(top.score / Math.max(1, plain.score));
      if (top.word !== plain.word) t.moved++;
      const used = r2.get(top.word).plan.some(p => p.id === tiles.length - 1);
      if (used) t.fired++;
    });
  }
  // The Enthusiast: a gift of his letter, and the word must hold it.
  {
    const Ls = [...new Set(caseLetters(deal))];
    const L = Ls[Math.floor(rng() * Ls.length)];
    const tiles = D.withAdded(deal.tiles, { letter: L, ephemeral: true });
    const T = [TB.compileTable(null, null, has), TB.compileTable(null, { id: 'enthusiast', data: { letter: L } }, has)];
    const r2 = S.solveCaseSync(tiles, deal.tool, words, has, T).results;
    let top = { word: null, score: -1 }, raw = { word: null, score: -1 };
    for (const [w, r] of r2) {
      if (r.scores[1] > top.score) top = { word: w, score: r.scores[1] };
      if (r.scores[0] > raw.score) raw = { word: w, score: r.scores[0] };
    }
    row.bests.enthusiast = top.score;
    bump('enthusiast', t => {
      t.n++;
      t.power.push(top.score / Math.max(1, plain.score));
      if (top.word !== plain.word) t.moved++;
      if (r2.get(raw.word).scores[1] < raw.score) t.bit++;
      if (top.score < r2.get(top.word).scores[0]) t.through++;
    });
  }
  perCase.push(row);
  process.stderr.write(`№${n} ${Math.round(ms)}ms  `);
}
process.stderr.write('\n');

const med = a => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const pct = (k, t) => `${Math.round((100 * t[k]) / t.n)}%`;
const rows = [...tally].map(([key, t]) => ({
  seat: key, power: med(t.power).toFixed(2), moved: pct('moved', t), fired: pct('fired', t),
  dead: pct('dead', t), bit: t.bit ? pct('bit', t) : '', through: t.through ? pct('through', t) : '',
}));
console.table(rows);
if (outPath) fs.writeFileSync(outPath, JSON.stringify(perCase));
