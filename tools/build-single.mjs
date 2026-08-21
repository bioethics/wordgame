// Bundle the game into one self-contained HTML file — no server, no network.
// The JS modules are bundled, the CSS inlined, and the wordlist embedded as
// window.FOLIO_WORDLIST (which js/dict.js checks first). Useful for playtesting
// anywhere a single file can be dropped: a phone, an artifact page, an email.
//
//   node tools/build-single.mjs [outfile]     (default: great-work-single.html)
//
// Requires esbuild (`npm i esbuild` anywhere node can resolve it).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// esbuild may live next to this repo or next to wherever the command runs
const { build } = await import('esbuild').catch(() =>
  import(pathToFileURL(path.join(process.cwd(), 'node_modules/esbuild/lib/main.js')).href));

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] ?? path.join(root, 'great-work-single.html');

const js = (await build({
  entryPoints: [path.join(root, 'js/main.js')],
  bundle: true,
  format: 'iife',
  write: false,
  minify: true,
})).outputFiles[0].text;

const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
const wordlist = fs.readFileSync(path.join(root, 'wordlist.txt'), 'utf8');

// The themed lists ride along as window.FOLIO_THEMES. The paths are read out
// of js/themes.js rather than globbed, so the bundle carries exactly the lists
// the game asks for — a stray .txt left in the directory can't stow away.
const themeSrc = fs.readFileSync(path.join(root, 'js/themes.js'), 'utf8');
const themes = {};
for (const [, key, file] of themeSrc.matchAll(/(\w+):\s*'wordlists-themed\/([\w-]+\.txt)'/g)) {
  themes[key] = fs.readFileSync(path.join(root, 'wordlists-themed', file), 'utf8');
}
if (!Object.keys(themes).length) throw new Error('no themed lists found in js/themes.js');

// js/themes.js doesn't name this one — js/excluded.js fetches it directly, and
// reads it out of FOLIO_THEMES when there is no server to fetch from. Without
// it a bundled build runs with the slur filter switched off, silently.
themes['excluded-slurs'] = fs.readFileSync(path.join(root, 'wordlists-themed/excluded-slurs.txt'), 'utf8');

const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const body = index.match(/<body>([\s\S]*)<script type="module"[^>]*><\/script>/)?.[1];
if (!body) throw new Error('could not extract body markup from index.html');

// The Google-Fonts link is dropped (offline/CSP contexts block it); the CSS
// font stacks fall back to Georgia / system sans, and --hand (The Redactor's
// pencil) to whatever script face the platform carries — Segoe Script on
// Windows, Bradley Hand on macOS/iOS — so a bundled build still tells a
// wrapped tile apart from a cast one.
const html = `<title>GREAT WORK — a word-forging game</title>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#150e18" />
<style>
${css}
</style>
${body}
<script>window.FOLIO_WORDLIST = ${JSON.stringify(wordlist)};
window.FOLIO_THEMES = ${JSON.stringify(themes)};</script>
<script>
${js}
</script>
`;

fs.writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024 / 1024).toFixed(1)} MB)`);
