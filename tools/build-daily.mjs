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
// The dictionary is filtered HERE, the way daily/main.js filters it at load
// (A–Z entries only, minus the exclusions), so the page carries the playable
// words and nothing else. The exclusion list itself never ships: it is a list
// of slurs, and a page that only needs the words left after it has no use for it.
const excludedSet = new Set(fs.readFileSync(path.join(root, 'wordlists/excluded-slurs.txt'), 'utf8')
  .replace(/\r/g, '').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
  .map(l => l.toUpperCase()));
const wordlist = fs.readFileSync(path.join(root, 'wordlists/wordlist.txt'), 'utf8')
  .replace(/\r/g, '').split('\n').map(w => w.trim().toUpperCase())
  .filter(w => /^[A-Z]+$/.test(w) && !excludedSet.has(w)).join('\n');
const excluded = '';

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

// --artifact: the same page as a claude.ai artifact, for playtesting from a
// phone with no server at all. The artifact host wraps the file in its own
// skeleton (doctype, head, body, a viewport meta, safe-area padding on :root),
// so it gets the page's contents rather than a whole document, a name rather
// than a caption for its title, and no top/bottom safe-area padding of its own
// (the host already pads :root by those insets). The shared result leaves out
// a link, since the framed page's own address is not one anyone could open.
if (process.argv.includes('--artifact')) {
  const body = html.match(/<body>([\s\S]*)<\/body>/)?.[1];
  const fonts = html.match(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>/)?.[0];
  if (!body || !fonts) throw new Error('daily/index.html: could not find the body or the fonts link');
  const page = `<title>The Daily Proof</title>
<meta name="claude:viewport-fit-sides" content="cover">
${fonts}
<style>
${css}
.page { padding-block: 14px 28px; }
</style>
<script>window.DAILY_NO_LINK = true;</script>
${body.trim()}
`;
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'daily-proof.html'), page);
  console.log(`wrote ${path.join(out, 'daily-proof.html')} (${Math.round(page.length / 1024)} KB)`);
  process.exit(0);
}

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), html);
if (cname) fs.writeFileSync(path.join(out, 'CNAME'), `${cname}\n`);
console.log(`wrote ${path.relative(process.cwd(), path.join(out, 'index.html'))} (${Math.round(html.length / 1024)} KB)`
  + (cname ? ` and CNAME ${cname}` : ''));
