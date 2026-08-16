// Rebuild wordlists-themed/common.txt — the commonest words of English, in
// frequency order, filtered to words this game's dictionary will actually
// accept (an entry the dictionary turns away could never be played, so it
// would only make the list's own numbering lie).
//
//   curl -O https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-usa.txt
//   node tools/build-common-list.mjs google-10000-english-usa.txt
//
// The source list is google-10000-english (public domain, derived from the
// Google Web Trillion Word Corpus). Order is everything here: js/themes.js
// records each word's line number as its rank, and the editors in
// js/bosses.js slice that ranking at whatever band they care about — so the
// file must stay sorted commonest-first, and must not be alphabetised.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Ranks retained. The Populist takes the first 500 and the Obscurantist bars
// the first 1,000, but The Lexicographer asks whether a word is on the list at
// ALL — so the file's length is itself a game number, not just headroom.
const KEEP = 10000;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2];
if (!src) {
  console.error('usage: node tools/build-common-list.mjs <frequency-list.txt>');
  process.exit(1);
}

const dict = new Set(fs.readFileSync(path.join(root, 'wordlist.txt'), 'utf8')
  .split(/\r?\n/).map(w => w.trim().toUpperCase()).filter(Boolean));

const seen = new Set();
const kept = [];
for (const line of fs.readFileSync(src, 'utf8').split(/\r?\n/)) {
  const w = line.trim().toUpperCase();
  if (!/^[A-Z]+$/.test(w) || seen.has(w) || !dict.has(w)) continue;
  seen.add(w);
  kept.push(w);
  if (kept.length >= KEEP) break;
}

const out = path.join(root, 'wordlists-themed/common.txt');
fs.writeFileSync(out, `# The commonest words of English, commonest first.
#
# Source: google-10000-english (public domain), derived from the Google Web
# Trillion Word Corpus, filtered to words this game's dictionary accepts.
# Rebuild with tools/build-common-list.mjs.
#
# ORDER IS DATA. js/themes.js reads each word's position as its frequency
# rank. The Populist accepts only the first 500 and the Obscurantist bars the
# first 1,000 (js/bosses.js); The Lexicographer (js/patrons.js) pays for words
# absent from the file entirely, so its length is a game number too. Sorting
# this file alphabetically would silently change what that editor asks for.
${kept.join('\n')}\n`);

console.log(`wrote ${out} — ${kept.length} words (${kept[0]} … ${kept[kept.length - 1]})`);
