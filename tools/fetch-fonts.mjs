// Fetch the game's typefaces from Google Fonts into css/fonts/, and write
// css/fonts.css to serve them from there.
//
//   node tools/fetch-fonts.mjs
//
// The faces used to be linked straight from Google's CSS, which is
// render-blocking: a request to fonts.googleapis.com that never answered held
// back every script behind it, and the game never started. Served from the
// game's own origin they arrive with everything else, and a deploy carries its
// fonts with it.
//
// Only the Latin and Latin Extended subsets are kept — the medieval sorts ȝ and
// Ƿ live in Latin Extended — and the unicode-range on each face is kept too,
// so a browser still downloads a subset only when the page uses a letter in it.
// All five families are under the SIL Open Font License 1.1; the licence and
// copyright ride inside each font file's own name table.
//
// Change the families in FAMILIES, run this again, and commit what it writes.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'css', 'fonts');
const OUT_CSS = join(ROOT, 'css', 'fonts.css');

const FAMILIES = [
  'Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,700;0,9..144,900;1,9..144,500',
  'Inter:wght@400;600;800',
  'Caveat:wght@500;700',
  'IM+Fell+English:ital@0;1',
  'IM+Fell+English+SC',
];
const KEEP = new Set(['latin', 'latin-ext']);

// Google serves woff2 only to a browser that says it can read it.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
         + '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const url = 'https://fonts.googleapis.com/css2?'
  + FAMILIES.map(f => `family=${f}`).join('&') + '&display=swap';
const res = await fetch(url, { headers: { 'User-Agent': UA } });
if (!res.ok) throw new Error(`Google Fonts answered ${res.status}`);
const css = await res.text();

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const faces = [...css.matchAll(/\/\* ([\w-]+) \*\/\s*@font-face \{([^}]*)\}/g)]
  .map(([, subset, body]) => ({
    subset,
    family: body.match(/font-family: '([^']+)'/)[1],
    style:  body.match(/font-style: (\w+)/)[1],
    weight: body.match(/font-weight: ([\d ]+)/)[1],
    src:    body.match(/url\((https:[^)]+)\)/)[1],
    format: body.match(/format\('(\w+)'\)/)?.[1] ?? 'woff2',
    range:  body.match(/unicode-range: ([^;]+);/)?.[1],
  }))
  .filter(f => KEEP.has(f.subset));

await mkdir(OUT_DIR, { recursive: true });
const fileFor = new Map();   // one file per source: variable faces share theirs across weights
for (const f of faces) {
  if (fileFor.has(f.src)) continue;
  const ext = f.src.split('.').pop();
  const name = `${slug(f.family)}-${f.style}-${f.subset}.${ext}`;
  const body = await fetch(f.src, { headers: { 'User-Agent': UA } });
  if (!body.ok) throw new Error(`${f.src} answered ${body.status}`);
  await writeFile(join(OUT_DIR, name), Buffer.from(await body.arrayBuffer()));
  fileFor.set(f.src, name);
  console.log(`  ${name}`);
}

const rules = faces.map(f => `/* ${f.family} ${f.style} ${f.weight} — ${f.subset} */
@font-face {
  font-family: '${f.family}';
  font-style: ${f.style};
  font-weight: ${f.weight};
  font-display: swap;
  src: url(fonts/${fileFor.get(f.src)}) format('${f.format}');${f.range ? `
  unicode-range: ${f.range};` : ''}
}`).join('\n');

await writeFile(OUT_CSS, `/* The game's typefaces, served from its own origin. Written by
   tools/fetch-fonts.mjs — edit the families there and run it again rather than
   editing this file. SIL Open Font License 1.1, carried in each font's name table. */

${rules}
`);
console.log(`${faces.length} faces, ${fileFor.size} files → css/fonts.css`);
