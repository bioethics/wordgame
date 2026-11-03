// Bundle the Daily Proof into one page that stands on its own — for serving it
// from a subdomain, which on GitHub Pages means a second Pages site (one custom
// domain per repository). The modules are bundled, the stylesheet inlined, and
// the game's word list and exclusions embedded as window.FOLIO_WORDLIST and
// window.FOLIO_THEMES, which daily/main.js reads before it would fetch.
//
//   node tools/build-daily.mjs [--out dir] [--cname daily.example.com] [--home url]
//
//   --out    where to write index.html (default: dist-daily/)
//   --cname  also write a CNAME file, for the Pages site that serves it
//   --home   where "Great Work" in the masthead goes (default: https://<this
//            repo's CNAME>/, the full game)
//
// Requires esbuild (`npm i esbuild` anywhere node can resolve it), as
// tools/build-single.mjs does. .github/workflows/daily-subdomain.yml runs this
// and pushes the result to the subdomain's repository.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { build } = await import('esbuild').catch(() =>
  import(pathToFileURL(path.join(process.cwd(), 'node_modules/esbuild/lib/main.js')).href));

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = name => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : null;
};
const out = path.resolve(arg('out') ?? path.join(root, 'dist-daily'));
const cname = arg('cname');
const gameHost = fs.existsSync(path.join(root, 'CNAME'))
  ? fs.readFileSync(path.join(root, 'CNAME'), 'utf8').trim() : null;
const home = arg('home') ?? (gameHost ? `https://${gameHost}/` : null);

const js = (await build({
  entryPoints: [path.join(root, 'daily/main.js')],
  bundle: true,
  format: 'iife',
  write: false,
  minify: true,
})).outputFiles[0].text;

const css = fs.readFileSync(path.join(root, 'daily/daily.css'), 'utf8');
const wordlist = fs.readFileSync(path.join(root, 'wordlists/wordlist.txt'), 'utf8');
const excluded = fs.readFileSync(path.join(root, 'wordlists/excluded-slurs.txt'), 'utf8');

let html = fs.readFileSync(path.join(root, 'daily/index.html'), 'utf8');
const swap = (from, to) => {
  if (!html.includes(from)) throw new Error(`daily/index.html no longer contains: ${from}`);
  html = html.replace(from, () => to);
};
swap('<link rel="stylesheet" href="daily.css" />', `<style>\n${css}\n</style>`);
swap('<script type="module" src="main.js"></script>',
  `<script>window.FOLIO_WORDLIST = ${JSON.stringify(wordlist)};
window.FOLIO_THEMES = ${JSON.stringify({ 'excluded-slurs': excluded })};
${home ? `window.DAILY_HOME = ${JSON.stringify(home)};` : ''}</script>
<script>\n${js}\n</script>`);

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), html);
if (cname) fs.writeFileSync(path.join(out, 'CNAME'), `${cname}\n`);
console.log(`wrote ${path.relative(process.cwd(), path.join(out, 'index.html'))} (${Math.round(html.length / 1024)} KB)`
  + (cname ? ` and CNAME ${cname}` : ''));
