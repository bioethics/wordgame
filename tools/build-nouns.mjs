// The two noun lists, from WordNet 3.1 (the npm package wordnet-db@3.1.14; see
// wordlists/MAKING-LISTS.md → "The Register Foundry" for fetching it):
//
//   node tools/build-nouns.mjs <wordnet dict dir>
//     e.g. node tools/build-nouns.mjs ~/sources/wordnet-db-3.1.14/package/dict
//
// wordlists/noun-forms.txt — The Sculptor's: every dictionary word whose
//   ordinary meaning is a noun, and their plurals. "Ordinary" is WordNet's own
//   count of how often each sense was met in its tagged corpus: a word is a
//   noun here when its noun senses were met at least as often as its senses as
//   any other part of speech (HOME 6 to 0; RUN, 29 as a verb, is not). A word
//   never met in the corpus counts only if WordNet knows it as a noun and
//   nothing else, and the game's verb and adjective lists don't hold it (ARE
//   is a form of BE, not the hundredth of a hectare). Plurals are made by the
//   regular rules, the Latin and Greek ones (DATA, CRISES, LARVAE, INDICES)
//   and a short table of the rest (CHILDREN, GEESE), each one only if the
//   dictionary holds it.
//
// wordlists/nouns.txt — The Binder's: what he stacks two of into a word, so
//   singular, three letters or more, and recognisable: the entries the list
//   already held, and every dictionary word WordNet's corpus has met as a noun
//   at all, whatever else it is more often (MUSIC, WORLD, PERSON, BUS, PENNY,
//   and ECHO, which is oftener a verb).
//
// Re-run it after the dictionary or the verb and adjective lists change.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wn = process.argv[2];
if (!wn) { console.error('usage: node tools/build-nouns.mjs <wordnet dict dir>'); process.exit(1); }

const read = f => fs.readFileSync(path.join(root, 'wordlists', f), 'utf8')
  .replace(/\r/g, '').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => l.toLowerCase());
const dict = new Set(read('wordlist.txt'));
const slurs = new Set(read('excluded-slurs.txt'));
const verbs = new Set(read('verbs.txt'));
const adjs = new Set(read('adjectives.txt'));
const oldNouns = read('nouns.txt');

// lemma → tagged-sense count, per part of speech. An index line is
// "lemma pos synset_cnt p_cnt [p_cnt pointers] sense_cnt tagsense_cnt offsets…".
const tagged = {};
for (const pos of ['noun', 'verb', 'adj', 'adv']) {
  const m = new Map();
  for (const line of fs.readFileSync(path.join(wn, `index.${pos}`), 'latin1').split('\n')) {
    if (!line || line.startsWith(' ')) continue;
    const f = line.split(' ');
    if (!/^[a-z]+$/.test(f[0])) continue;
    const p = +f[3];
    m.set(f[0], +f[5 + p]);
  }
  tagged[pos] = m;
}

const isNoun = w => {
  const n = tagged.noun.get(w);
  if (n == null) return false;
  const other = Math.max(tagged.verb.get(w) ?? -1, tagged.adj.get(w) ?? -1, tagged.adv.get(w) ?? -1);
  if (n > 0) return n >= other;
  return other < 0 && !verbs.has(w) && !adjs.has(w);
};
const singulars = [...dict].filter(w => !slurs.has(w) && w.length >= 2 && isNoun(w));

// Plurals. A plural is only taken if the dictionary holds it.
const IRREGULAR = {
  child: 'children', die: 'dice', foot: 'feet', goose: 'geese', louse: 'lice', mouse: 'mice',
  ox: 'oxen', person: 'people', tooth: 'teeth', brother: 'brethren', cherub: 'cherubim',
  seraph: 'seraphim', penny: 'pence', man: 'men', woman: 'women',
};
function pluralsOf(s) {
  const out = [s + 's', s + 'es'];
  if (/[^aeiou]y$/.test(s)) out.push(s.slice(0, -1) + 'ies');
  if (s.endsWith('f')) out.push(s.slice(0, -1) + 'ves');
  if (s.endsWith('fe')) out.push(s.slice(0, -2) + 'ves');
  if (s.endsWith('man')) out.push(s.slice(0, -3) + 'men');
  if (s.endsWith('um') || s.endsWith('on')) out.push(s.slice(0, -2) + 'a');   // DATA, CRITERIA
  if (s.endsWith('a')) out.push(s + 'e');                                       // LARVAE
  if (s.endsWith('us')) out.push(s.slice(0, -2) + 'i');                         // CACTI
  if (s.endsWith('ex') || s.endsWith('ix')) out.push(s.slice(0, -2) + 'ices');  // INDICES
  if (s.endsWith('is')) out.push(s.slice(0, -2) + 'es');                        // CRISES
  if (IRREGULAR[s]) out.push(IRREGULAR[s]);
  return out;
}
const plurals = new Set();
for (const s of singulars) for (const p of pluralsOf(s)) if (dict.has(p) && !slurs.has(p)) plurals.add(p);

const forms = [...new Set([...singulars, ...plurals])].sort();
const met = [...dict].filter(w => w.length >= 3 && (tagged.noun.get(w) ?? 0) > 0);
const binder = [...new Set([...oldNouns, ...met])].filter(w => !slurs.has(w)).sort();

const write = (file, head, words) =>
  fs.writeFileSync(path.join(root, 'wordlists', file), head + words.map(w => w.toUpperCase()).join('\n') + '\n');
write('noun-forms.txt', `# Nouns and their plurals — The Sculptor's list. A word whose ordinary meaning
# is a noun (WordNet's tagged-corpus counts, noun at least as often as anything
# else), and its plurals: regular, Latin and Greek (DATA, CRISES, LARVAE,
# INDICES) and the rest (CHILDREN, GEESE). Built by tools/build-nouns.mjs; edit
# the sources and re-run it rather than editing this file.
#
`, forms);
write('nouns.txt', `# Nouns — The Binder's list. Two of these stacked together count as a word
# while he is seated, so DOOM and HAT make DOOMHAT, and MUSIC and WORLD make
# MUSICWORLD. Singular, three letters or more, and recognisable: every noun
# WordNet's tagged corpus has met as a noun, and the entries the list held
# before. The Sculptor reads noun-forms.txt, which adds the plurals and the
# rarer nouns. Built by tools/build-nouns.mjs, which keeps what is here; add
# entries freely and re-run it.
#
`, binder);
console.log(`noun-forms.txt: ${singulars.length} nouns + ${forms.length - singulars.length} plurals = ${forms.length}`);
console.log(`nouns.txt: ${oldNouns.length} → ${binder.length}`);
