// The Commoner's list, wordlists/commoner.txt: the 8,000 commonest words in
// English (wordlists/common.txt) and their everyday inflections. That is a
// plural where the word is a noun, the other tenses where it is a verb, and
// the comparative and superlative where it is an adjective. Each form is
// checked against the game's own parts-of-speech lists (nouns.txt,
// verbs.txt, adjectives.txt), so a form is only added when the list says the
// word really is that part of speech: SEVERED is SEVER's and not SEVERE's,
// and nobody gets YEARLIES or EXCEPTS. Derivations (-LY, -NESS, -ER for a
// doer) are not inflections and are left out.
//
//   node tools/build-commoner.mjs
//
// Re-run it after editing common.txt or the parts-of-speech lists.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(root, 'wordlists', f), 'utf8')
  .replace(/\r/g, '').split('\n').map(l => l.trim().toLowerCase()).filter(l => l && !l.startsWith('#'));

const common = read('common.txt');
const dict = new Set(read('wordlist.txt'));
const nouns = new Set(read('nouns.txt'));
const verbs = new Set(read('verbs.txt'));
const adjs = new Set(read('adjectives.txt'));

const CONS = /[^aeiou]$/;
const doubled = w => (/[^aeiou][aeiou][bdgklmnprtvz]$/.test(w) ? w + w.at(-1) : null);

function plurals(b) {
  const out = [b + 's', b + 'es'];
  if (/[^aeiou]y$/.test(b)) out.push(b.slice(0, -1) + 'ies');
  if (b.endsWith('f')) out.push(b.slice(0, -1) + 'ves');
  if (b.endsWith('fe')) out.push(b.slice(0, -2) + 'ves');
  return out;
}
function tenses(b) {
  const out = [b + 's', b + 'es', b + 'ed', b + 'd', b + 'ing'];
  if (/[^aeiou]y$/.test(b)) out.push(b.slice(0, -1) + 'ies', b.slice(0, -1) + 'ied');
  if (b.endsWith('e')) out.push(b.slice(0, -1) + 'ing');
  if (b.endsWith('ie')) out.push(b.slice(0, -2) + 'ying');
  const d = doubled(b);
  if (d) out.push(d + 'ed', d + 'ing');
  return out;
}
function degrees(b) {
  const out = [b + 'er', b + 'est', b + 'r', b + 'st'];
  if (/[^aeiou]y$/.test(b)) out.push(b.slice(0, -1) + 'ier', b.slice(0, -1) + 'iest');
  const d = doubled(b);
  if (d) out.push(d + 'er', d + 'est');
  return out;
}

const forms = new Set();
for (const b of common) {
  if (!CONS.test(b) && b.length < 2) continue;
  if (nouns.has(b)) for (const f of plurals(b)) if (dict.has(f)) forms.add(f);
  if (verbs.has(b)) for (const f of tenses(b)) if (verbs.has(f) && dict.has(f)) forms.add(f);
  if (adjs.has(b)) for (const f of degrees(b)) if (adjs.has(f) && dict.has(f)) forms.add(f);
}
const base = new Set(common);
const added = [...forms].filter(f => !base.has(f)).sort();
const all = [...new Set([...common, ...added])].sort();

const head = `# The Commoner's list: the 8,000 commonest words (common.txt) and their
# everyday inflections — plurals of nouns, tenses of verbs, comparatives of
# adjectives — each checked against nouns.txt, verbs.txt and adjectives.txt.
# Built by tools/build-commoner.mjs; edit the sources and re-run it rather than
# editing this file.
#
`;
fs.writeFileSync(path.join(root, 'wordlists/commoner.txt'), head + all.join('\n') + '\n');
console.log(`commoner.txt: ${common.length} common words + ${added.length} inflections = ${all.length}`);
console.log('a sample of the inflections:', added.filter((_, i) => i % Math.ceil(added.length / 30) === 0).join(' '));
