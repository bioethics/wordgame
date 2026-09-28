// Bundle the game into one self-contained HTML file — no server, no network.
// The JS modules are bundled, the CSS inlined with the typefaces inside it, and
// the wordlist embedded as window.FOLIO_WORDLIST (which js/dict.js checks
// first). Useful for playtesting anywhere a single file can be dropped: a
// phone, an artifact page, an email.
//
//   node tools/build-single.mjs [outfile]     (default: great-work-single.html)
//
// Requires esbuild: `npm i esbuild` in the repo root (package.json is
// gitignored, so the install stays local), or anywhere node can resolve it
// from the directory the command runs in.
//
// The page is index.html's own, not a copy of it: its <head> is taken whole —
// the charset, the viewport, the script that sets the look and the room before
// the first paint — and every stylesheet it links is inlined in the order it
// links them, so a bundle wears the Bench exactly as the served game does,
// and a stylesheet added to index.html is bundled without anyone telling this
// file. The fonts that css/fonts.css points at ride along as data URIs.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// esbuild may live next to this repo or next to wherever the command runs
const esbuild = await import('esbuild').catch(() =>
  import(pathToFileURL(path.join(process.cwd(), 'node_modules/esbuild/lib/main.js')).href))
  .catch(() => {
    console.error('esbuild not found: run `npm i esbuild` in the repo root, then try again.');
    process.exit(1);
  });

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] ?? path.join(root, 'great-work-single.html');

const js = (await esbuild.build({
  entryPoints: [path.join(root, 'js/main.js')],
  bundle: true,
  format: 'iife',
  write: false,
  minify: true,
})).outputFiles[0].text;

// A stylesheet's url(...)s are relative to the stylesheet; in one file they
// have nowhere to point, so each becomes the file it names, as a data URI.
const MIME = { woff2: 'font/woff2', woff: 'font/woff', png: 'image/png', svg: 'image/svg+xml' };
function inlineUrls(css, from) {
  return css.replace(/url\((?!['"]?data:)['"]?([^'")]+)['"]?\)/g, (whole, ref) => {
    const file = path.join(path.dirname(from), ref);
    if (!fs.existsSync(file)) return whole;
    const type = MIME[path.extname(file).slice(1)] ?? 'application/octet-stream';
    return `url(data:${type};base64,${fs.readFileSync(file).toString('base64')})`;
  });
}

// The themed lists ride along as window.FOLIO_THEMES. The paths are read out
// of js/themes.js rather than globbed, so the bundle carries exactly the lists
// the game asks for — a stray .txt left in the directory can't stow away. The
// FOLDER comes out of the same strings, so moving the lists is a change to
// js/themes.js and nothing else.
const themeSrc = fs.readFileSync(path.join(root, 'js/themes.js'), 'utf8');
const themes = {};
let dir = null;
for (const [, key, folder, file] of themeSrc.matchAll(/(\w+):\s*'([\w-]+)\/([\w-]+\.txt)'/g)) {
  dir ??= folder;
  themes[key] = fs.readFileSync(path.join(root, folder, file), 'utf8');
}
if (!dir) throw new Error('no themed lists found in js/themes.js');

// Neither of these is named in THEME_FILES. The dictionary is js/dict.js's own
// fetch, and the slur list is js/excluded.js's — but both live in the same
// folder as the themed lists, so they come along from the same `dir`. Without
// the second a bundled build runs with the slur filter switched off, silently.
const wordlist = fs.readFileSync(path.join(root, dir, 'wordlist.txt'), 'utf8');
themes['excluded-slurs'] = fs.readFileSync(path.join(root, dir, 'excluded-slurs.txt'), 'utf8');

// The dummy letters are a Map, not a Set, so they ride in a global of their own
// (window.FOLIO_SILENT, read by loadThemes) rather than in FOLIO_THEMES. Without
// it a bundled build leaves The Silent Knight with nothing to find — the same
// silent failure the slur list has, and worth the same one line to prevent.
const silentSrc = themeSrc.match(/SILENT_FILE\s*=\s*'([\w-]+)\/([\w-]+\.txt)'/);
if (!silentSrc) throw new Error('no SILENT_FILE found in js/themes.js');
const silent = fs.readFileSync(path.join(root, silentSrc[1], silentSrc[2]), 'utf8');

const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
let head = index.match(/<head>([\s\S]*)<\/head>/)?.[1];
const body = index.match(/<body>([\s\S]*)<script type="module"[^>]*><\/script>/)?.[1];
if (!head || !body) throw new Error('could not find the head and body of index.html');

let sheets = 0;
head = head.replace(/<link rel="stylesheet" href="([^"]+)"\s*\/?>/g, (_, href) => {
  const file = path.join(root, href);
  sheets += 1;
  return `<style>\n${inlineUrls(fs.readFileSync(file, 'utf8'), file)}\n</style>`;
});
if (!sheets) throw new Error('no stylesheets linked from index.html');

const html = `<!DOCTYPE html>
<html lang="en">
<head>${head}</head>
<body>${body}
<script>window.FOLIO_WORDLIST = ${JSON.stringify(wordlist)};
window.FOLIO_THEMES = ${JSON.stringify(themes)};
window.FOLIO_SILENT = ${JSON.stringify(silent)};</script>
<script>
${js}
</script>
</body>
</html>
`;

fs.writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024 / 1024).toFixed(1)} MB, ${sheets} stylesheets inlined)`);
