// Build the site GitHub Pages serves, into _site/ (or the directory given).
//
//   node tools/build-pages.mjs [outDir]
//
// Locally the game is served straight from the repo root and nothing here is
// needed. A deploy needs one thing the root cannot give it: behind each copy of
// the page, every file of ONE version of the code and no other. Pages lets a
// browser keep a file for ten minutes, and the game is ES modules imported by
// bare relative path, so a returning player could be handed the new index.html
// with yesterday's state.js still cached — a mix that fails to link, and a
// board that never starts.
//
// So the code and the styles go into a folder named for their own contents,
// v/<hash>/, and index.html is rewritten to point there. Every import is
// relative, so a page from one deploy can only ever reach its own version's
// files — and a deploy that changed neither keeps its hash, and its players'
// caches. A page older than the deploy asks for a folder that has gone, and
// the load guard in index.html asks for a reload, which brings the new page.
//
// The word lists stay where they are: they are data, and are fetched with
// `no-cache` (js/net.js), so they are always current anyway. docs/, tools/,
// the README and CLAUDE.md are not deployed at all.

import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, process.argv[2] ?? '_site');
const VERSIONED = ['js', 'css'];
const AS_THEY_ARE = ['wordlists', 'CNAME'];

async function* walk(dir) {
  const entries = (await readdir(dir, { withFileTypes: true }))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const hash = createHash('sha256');
for (const dir of VERSIONED) {
  for await (const file of walk(join(ROOT, dir))) {
    hash.update(relative(ROOT, file));
    hash.update(await readFile(file));
  }
}
const ver = hash.digest('hex').slice(0, 12);

await rm(OUT, { recursive: true, force: true });
await mkdir(join(OUT, 'v', ver), { recursive: true });
for (const dir of VERSIONED) {
  await cp(join(ROOT, dir), join(OUT, 'v', ver, dir), { recursive: true });
}
for (const item of AS_THEY_ARE) {
  await cp(join(ROOT, item), join(OUT, item), { recursive: true });
}

const page = await readFile(join(ROOT, 'index.html'), 'utf8');
let rewritten = 0;
const html = page.replace(/\b(href|src)="((?:css|js)\/)/g, (_, attr, dir) => {
  rewritten += 1;
  return `${attr}="v/${ver}/${dir}`;
});
// Four stylesheets and the one module; fewer means index.html has changed shape
// under this script, and a page half-pointed at the old paths is the very mix
// this exists to prevent.
if (rewritten < 5) throw new Error(`only ${rewritten} asset links rewritten in index.html`);
await writeFile(join(OUT, 'index.html'), html);

console.log(`_site built: version ${ver}, ${rewritten} links → v/${ver}/`);
