// Measures the Tuesday patrons (DAY_PATRONS in daily/deal.js), each on cases
// dealt as its own Tuesday deals them — what it reads dealt in, a tile lent,
// a licence's spellings in the field. README.md, "The table", has the figures.
//
//   node tools/daily-tuesday.mjs [challenges] [ids]      (default: 1–60, the roster)
//
// Per patron: power (best seated ÷ best unseated, the median), moved (how often
// the best word is a different word with him seated), fired (he pays on his own
// best word), dead (nothing in the field pays), and the share of the seated
// field's hundred best words he pays on.
import fs from 'node:fs';
import path from 'node:path';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = p => import(new URL(`../${p}`, import.meta.url).href);
const { adoptExclusions, isExcluded } = await imp('js/excluded.js');
const S = await imp('daily/score.js');
const TB = await imp('daily/table.js');
const D = await imp('daily/deal.js');
adoptExclusions(fs.readFileSync(path.join(root, 'wordlists/excluded-slurs.txt'), 'utf8'));
const words = fs.readFileSync(path.join(root, 'wordlists/wordlist.txt'), 'utf8').replace(/\r/g, '').split('\n')
  .map(w => w.trim().toUpperCase()).filter(w => /^[A-Z]+$/.test(w) && !isExcluded(w));
const dict = new Set(words);
const has = w => dict.has(w);
for (const [k, f] of Object.entries(TB.LIST_FILES)) TB.adoptList(k, fs.readFileSync(path.join(root, f), 'utf8'));

const [from, to] = (process.argv[2] ?? '1-60').split('-').map(Number);
const ids = process.argv[3] ? process.argv[3].split(',') : D.DAY_PATRONS;
const med = a => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
for (const id of ids) {
  const st = { power: [], moved: 0, fired: 0, dead: 0, top: [], n: 0 };
  for (let n = from; n <= to; n++) {
    const deal = D.dealChallenge(n, { day: { kind: 'patron', id } });
    // A seat that brings a tile the deal doesn't lend (the Scientist's OLOGY).
    if (TB.PATRONS[id]?.adds && !deal.day.patron.adds) deal.tiles = D.withAdded(deal.tiles, TB.PATRONS[id].adds);
    const seat = deal.day.patron;
    const T = TB.compileTable(seat, null, has);
    const lent = !!TB.PATRONS[id]?.adds;
    const plainTiles = lent ? deal.tiles.slice(0, -1) : deal.tiles;
    const extra = T.spell ? new Set(TB.spellingsFor([T], words, has, deal.tiles, deal.tool)) : null;
    const plain = S.solveCaseSync(plainTiles, deal.tool, words, has, [TB.compileTable(null, null, has)]).results;
    let seated;
    if (extra || lent) {
      const ws = extra ? [...words, ...extra] : words;
      const h = extra ? w => dict.has(w) || extra.has(w) : has;
      seated = S.solveCaseSync(deal.tiles, deal.tool, ws, h, [{ ...T, has: h }]).results;
    } else seated = S.solveCaseSync(deal.tiles, deal.tool, words, has, [TB.compileTable(null, null, has), T]).results;
    const unseatedOf = (w, r) => (extra || lent ? (plain.get(w)?.score ?? null) : r.scores[0]);
    const seatedOf = r => (extra || lent ? r.score : r.scores[1]);
    let pTop = { w: null, s: -1 }; for (const [w, r] of plain) if (r.score > pTop.s) pTop = { w, s: r.score };
    const list = [...seated].map(([w, r]) => ({ w, s: seatedOf(r), u: unseatedOf(w, r) })).filter(e => e.s != null).sort((a, b) => b.s - a.s);
    const sTop = list[0];
    st.n++;
    st.power.push(sTop.s / Math.max(1, pTop.s));
    if (sTop.w !== pTop.w) st.moved++;
    if (sTop.s !== sTop.u) st.fired++;
    if (!list.some(e => e.s !== e.u)) st.dead++;
    const h = list.slice(0, 100); st.top.push(h.filter(e => e.s !== e.u).length / Math.max(1, h.length));
  }
  const pct = x => `${Math.round(100 * x / st.n)}%`.padStart(4);
  console.log(`${id.padEnd(13)} power ×${med(st.power).toFixed(2)}  moved ${pct(st.moved)}  fired ${pct(st.fired)}  dead ${pct(st.dead)}  top100 ${Math.round(100 * st.top.reduce((a, b) => a + b, 0) / st.n)}%`);
}
