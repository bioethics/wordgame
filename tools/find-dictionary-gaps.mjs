// Hunt for words the dictionary is MISSING — the THUNK problem.
//
// A player who reaches for an ordinary word and is refused loses trust in the
// press, and those refusals are invisible from the inside: nothing in the game
// can tell you what it failed to accept. This finds them from the outside.
//
//   node tools/find-dictionary-gaps.mjs paradigm  <attested.txt>
//   node tools/find-dictionary-gaps.mjs derived  <attested.txt>
//   node tools/find-dictionary-gaps.mjs frequency <attested.txt> <freq.txt> [top]
//
// `attested.txt` is any large real word list, one word per line, lowercase.
// Debian's are the easy source and are what this was built against:
//
//   apt-get install wamerican-large wamerican-huge wbritish-huge
//   cat /usr/share/dict/american-english-huge /usr/share/dict/british-english-huge \
//     | sed "s/'s$//" | grep -x "[a-z]\{2,\}" | sort -u > attested.txt
//
// `freq.txt` is "word count" per line, commonest first. OpenSubtitles works:
//   https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_full.txt
//
// ─── WHAT EACH MODE IS GOOD AT ────────────────────────────────────────────────
//
// paradigm   Words whose rhyme-neighbours all inflect but they don't, where the
//            missing form is attested. Finds BELAY, BREAM, CROUP, DANDER, DINT.
//            NOTE it can only ever find a word whose BASE we already hold — it
//            asks what is missing around what we have. Run against the
//            dictionary as it stood before THUNK was added it reports nothing,
//            because THUNK's whole family was absent, not just its inflections.
//
// derived    We hold the base but not what grows off it: PULMONOLOGY without
//            PULMONOLOGIST. The highest-yield mode by far, because adding a
//            family's root without its branches is the easiest mistake to make
//            — most of what it found the first time had been opened by an
//            earlier pass here that added 140 -ology words and no -ologists.
//
// frequency  Common words we simply never had — the only mode that can find a
//            word with no foothold in the dictionary at all, and so the one
//            that would have caught THUNK (rank 300 of 24,676 candidates, on a
//            corpus where it appears 841 times). CAVEAT, and it is a big one:
//            a subtitle corpus is dialogue, so its head is almost entirely
//            proper nouns (CARTER, HARPER, YORK), contraction fragments (ISN,
//            AIN) and interjections (MMM, HEH). Requiring lowercase attestation
//            culls some; the rest needs reading by eye. Treat its output as a
//            list of candidates, never as a list of words to add — and read
//            well past the first screen, since THUNK sat at 300.
//
// Nothing here writes to the dictionary. Everything it prints wants a human to
// look at it first: these lists are generated from other people's word lists,
// which carry their own junk, their own regionalisms and their own opinions.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readWords = f => new Set(fs.readFileSync(f, 'utf8').split(/\r?\n/)
  .map(w => w.trim().toLowerCase()).filter(Boolean));

const have = readWords(path.join(root, 'wordlists/wordlist.txt'));
const mode = process.argv[2];

// ─── paradigm: the rhyme-neighbour test ───────────────────────────────────────
// Group by final rime, then ask which members are missing an inflection all
// their neighbours have. Two guards keep it honest, and it is worthless without
// either: the neighbours must AGREE (three of them, so one odd word cannot
// invent a rule), and the missing form must be ATTESTED somewhere real.
//
// That second guard is what separates THUNKS from ABRUPTS. Rime alone says both
// are holes — CLUNK/PLUNK/CONK inflect, so THUNK looks like one; CORRUPT/DISRUPT
// /ERUPT inflect, so ABRUPT looks like one too. But ABRUPT is an adjective and
// no dictionary carries ABRUPTS, while every list carries THUNKS. Without the
// attestation check this mode reports several hundred adjectives and adverbs
// (ABLAZE, AKIMBO, ALBEIT) as missing verbs.
function paradigm(attestedFile) {
  const att = readWords(attestedFile);
  const FORMS = ['s', 'ed', 'ing'];
  const rimeOf = w => w.slice(-3);
  const groups = new Map();
  for (const w of have) {
    if (w.length < 4 || w.length > 7) continue;
    const r = rimeOf(w);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(w);
  }
  const byWord = new Map();
  for (const members of groups.values()) {
    if (members.length < 4) continue;
    for (const form of FORMS) {
      const withIt = members.filter(w => have.has(w + form));
      if (withIt.length < 3) continue;
      for (const w of members) {
        if (have.has(w + form) || !att.has(w + form)) continue;
        if (!byWord.has(w)) byWord.set(w, { peers: withIt.slice(0, 4), forms: [] });
        byWord.get(w).forms.push(form);
      }
    }
  }
  const out = [...byWord].sort((a, b) => b[1].forms.length - a[1].forms.length || a[0].localeCompare(b[0]));
  console.log(`${out.length} paradigm holes — the whole inflection is missing, and attested elsewhere\n`);
  for (const [w, g] of out.slice(0, 120)) {
    console.log(`  ${w.padEnd(12)} lacks ${g.forms.map(f => '-' + f).join(' ').padEnd(14)} though ${g.peers.join(', ')} take them`);
  }
}

// ─── derived: base present, branch absent ─────────────────────────────────────
const SUFFIX = [
  ['ology', 'ologist'], ['ology', 'ologists'], ['ology', 'ological'],
  ['ist', 'ists'], ['y', 'ies'], ['e', 'ed'], ['e', 'ing'],
  ['', 's'], ['', 'ed'], ['', 'ing'], ['', 'er'], ['', 'ers'],
  ['', 'ly'], ['', 'ness'], ['', 'less'], ['', 'able'],
];
function derived(attestedFile) {
  const att = readWords(attestedFile);
  const bySuffix = new Map();
  for (const w of have) {
    for (const [old, add] of SUFFIX) {
      if (old && !w.endsWith(old)) continue;
      const cand = (old ? w.slice(0, -old.length) : w) + add;
      if (have.has(cand) || !att.has(cand)) continue;
      (bySuffix.get(add) ?? bySuffix.set(add, []).get(add)).push([w, cand]);
    }
  }
  const rows = [...bySuffix].sort((a, b) => b[1].length - a[1].length);
  const total = rows.reduce((n, [, v]) => n + v.length, 0);
  console.log(`${total} derived forms attested elsewhere but missing here\n`);
  console.log('suffix        gaps  examples');
  for (const [suf, pairs] of rows) {
    const ex = pairs.slice(0, 5).map(([, c]) => c).join(', ');
    console.log(`  -${suf.padEnd(10)} ${String(pairs.length).padStart(5)}  ${ex}`);
  }
  console.log('\nThe long tails here (-ly, -ness, -able) are mostly the attesting');
  console.log('list being over-generative. The short, specific ones are the real finds.');
}

// ─── frequency: common words we never had ─────────────────────────────────────
function frequency(attestedFile, freqFile, top = 300) {
  const att = readWords(attestedFile);
  const rows = [];
  const seen = new Set();
  for (const line of fs.readFileSync(freqFile, 'utf8').split(/\r?\n/)) {
    const [w, n] = line.split(/\s+/);
    if (!w || !n) continue;
    const word = w.toLowerCase();
    if (!/^[a-z]{4,}$/.test(word) || seen.has(word)) continue;
    seen.add(word);
    if (have.has(word) || !att.has(word)) continue;
    rows.push([Number(n), word]);
  }
  rows.sort((a, b) => b[0] - a[0]);
  console.log(`${rows.length} attested words absent from the dictionary, commonest first.`);
  console.log('EXPECT NOISE: proper nouns and interjections dominate a dialogue corpus.\n');
  for (const [n, w] of rows.slice(0, top)) console.log(`  ${w.padEnd(22)}${n}`);
}

const args = process.argv.slice(3);
if (mode === 'paradigm' && args[0]) paradigm(args[0]);
else if (mode === 'derived' && args[0]) derived(args[0]);
else if (mode === 'frequency' && args[1]) frequency(args[0], args[1], Number(args[2]) || 300);
else {
  console.error('usage:\n'
    + '  node tools/find-dictionary-gaps.mjs paradigm  <attested.txt>\n'
    + '  node tools/find-dictionary-gaps.mjs derived   <attested.txt>\n'
    + '  node tools/find-dictionary-gaps.mjs frequency <attested.txt> <freq.txt> [top]');
  process.exit(1);
}
