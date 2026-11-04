// The mechanical half of making or growing a themed word list (the registers'
// lists, theme-*.txt in wordlists/). The other half — deciding which words
// belong — is reading, and nothing here pretends to do it. The recipe that
// ties the two together is wordlists/MAKING-LISTS.md.
//
//   node tools/theme-list.mjs check   [list…]
//   node tools/theme-list.mjs inherit <list> [--from words.txt]
//   node tools/theme-list.mjs pool    [--lists a,b,…] [--from words.txt] [--chunk 1900] [--out dir]
//   node tools/theme-list.mjs add     <list> <picks.txt> [--write]
//
// A <list> is a short name (spooky, romantic, cute, rude, or any theme-NAME.txt
// in wordlists/) or a path. Words are compared upper-cased, as the game reads
// them; lists are written lower-case, as they are kept.
//
//   check    size, how much of the dictionary each list covers, and what would
//            silently fail to load: duplicates, entries the dictionary lacks,
//            entries the block list bars, lines that aren't plain words.
//   inherit  words the list lacks whose BASE it already holds — BAWDILY and
//            BAWDINESS when BAWDY is on rude. Proposals only, each with its
//            base and its kind, and the kinds that go wrong flagged for a read:
//            an -er off a noun or verb may name something else (COTTER is not
//            a COT), and an -er/-est pair off an adjective may be a comparative
//            English never forms (AWFULLER). Comparatives are told from
//            agentives by the pair: comparatives come as -er AND -est.
//   pool     the words left to READ: the dictionary (or --from, e.g. the words
//            a dictionary update added) minus everything already on the given
//            lists, minus the block list, minus what `inherit` would propose —
//            alphabetical, in files of --chunk words for one reader each.
//   add      merges a file of picks into a list: dictionary-checked, block-list
//            checked, deduped, appended alphabetically. Prints what it would do;
//            --write does it.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { adoptExclusions, isExcluded } = await import(new URL('../js/excluded.js', import.meta.url).href);
adoptExclusions(fs.readFileSync(path.join(root, 'wordlists/excluded-slurs.txt'), 'utf8'));

const lines = file => fs.readFileSync(file, 'utf8').replace(/\r/g, '').split('\n');
const words = file => lines(file).map(l => l.trim()).filter(l => l && !l.startsWith('#'));

// The dictionary as the game reads it: A–Z entries, upper-cased, minus the
// block list. (Entries with a marker, like abductee+, never match in play.)
const DICT = new Set(words(path.join(root, 'wordlists/wordlist.txt'))
  .map(w => w.toUpperCase()).filter(w => /^[A-Z]+$/.test(w) && !isExcluded(w)));

const listPath = name => (fs.existsSync(name) ? name : path.join(root, 'wordlists', `theme-${name}.txt`));
const listNames = () => fs.readdirSync(path.join(root, 'wordlists'))
  .filter(f => /^theme-.*\.txt$/.test(f)).map(f => f.slice(6, -4));
const readList = name => words(listPath(name)).map(w => w.toUpperCase());

const args = process.argv.slice(2);
const opt = (k, d = null) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const positional = args.filter((a, i) => !a.startsWith('--') && !(i && args[i - 1].startsWith('--') && args[i - 1] !== '--write'));
const [cmd, ...rest] = positional;
const pct = (a, b) => `${((100 * a) / b).toFixed(1)}%`;

// ─── Inflections ──────────────────────────────────────────────────────────────
// Every base a word could be an inflection or a plain derivation of, with the
// kind of step. Over-generates on purpose: a base only counts if the list
// holds it, and the list is the filter.
function basesOf(w) {
  const out = [];
  const add = (b, kind) => { if (b.length >= 2 && b !== w) out.push([b, kind]); };
  const undouble = s => (s.length > 2 && s.at(-1) === s.at(-2) ? s.slice(0, -1) : null);
  const stem = (suffix, kind) => {
    if (!w.endsWith(suffix) || w.length <= suffix.length + 1) return;
    const s = w.slice(0, -suffix.length);
    add(s, kind); add(`${s}E`, kind);
    if (s.endsWith('I')) add(`${s.slice(0, -1)}Y`, kind);
    const u = undouble(s); if (u) add(u, kind);
  };
  stem('S', 'plural'); stem('ES', 'plural');
  stem('ED', 'verb'); stem('D', 'verb'); stem('ING', 'verb');
  stem('LY', 'adverb'); stem('NESS', 'noun');
  stem('ER', 'er'); stem('EST', 'est'); stem('ERS', 'er');
  return out;
}

// The kind as it should be read: an -er is a comparative when the dictionary
// has the -est beside it, an agentive (or something else) when it does not.
function kindOf(w, kind) {
  if (kind === 'est') return 'comparative';
  if (kind !== 'er') return kind;
  const sing = w.endsWith('ERS') ? w.slice(0, -1) : w;
  return DICT.has(`${sing.slice(0, -2)}EST`) ? 'comparative' : 'agentive';
}
const READ = { comparative: 'read: does English form it?', agentive: 'read: same thing as its base?' };

function inherit(listWords, pool) {
  const on = new Set(listWords);
  const out = [];
  for (const w of pool) {
    if (on.has(w)) continue;
    const hit = basesOf(w).find(([b]) => on.has(b));
    if (!hit) continue;
    const kind = kindOf(w, hit[1]);
    out.push({ word: w, base: hit[0], kind, flag: READ[kind] ?? '' });
  }
  return out;
}

// ─── The commands ─────────────────────────────────────────────────────────────
if (cmd === 'check') {
  const names = rest.length ? rest : listNames();
  const sets = {};
  for (const n of names) {
    const raw = words(listPath(n));
    const up = raw.map(w => w.toUpperCase());
    const seen = new Set(), dupes = [];
    for (const w of up) { if (seen.has(w)) dupes.push(w); seen.add(w); }
    const odd = up.filter(w => !/^[A-Z]+$/.test(w));
    const barred = [...seen].filter(isExcluded);
    const missing = [...seen].filter(w => /^[A-Z]+$/.test(w) && !isExcluded(w) && !DICT.has(w));
    const live = [...seen].filter(w => DICT.has(w));
    sets[n] = new Set(live);
    console.log(`${n}: ${raw.length} lines, ${seen.size} unique, ${live.length} playable — ${pct(live.length, DICT.size)} of the dictionary`);
    if (dupes.length) console.log(`  ${dupes.length} duplicate(s): ${dupes.slice(0, 12).join(' ')}${dupes.length > 12 ? ' …' : ''}`);
    if (odd.length) console.log(`  ${odd.length} not a plain word: ${odd.slice(0, 12).join(' | ')}`);
    if (barred.length) console.log(`  ${barred.length} on the block list (never scores): ${barred.slice(0, 12).join(' ')}${barred.length > 12 ? ' …' : ''}`);
    if (missing.length) console.log(`  ${missing.length} not in the dictionary (can't be set): ${missing.slice(0, 12).join(' ')}${missing.length > 12 ? ' …' : ''}`);
  }
  if (names.length > 1) {
    console.log('\noverlaps (a word on two lists pays both):');
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
      const both = [...sets[names[i]]].filter(w => sets[names[j]].has(w)).length;
      console.log(`  ${names[i]} ∩ ${names[j]}: ${both}`);
    }
  }
} else if (cmd === 'inherit') {
  const [name] = rest;
  if (!name) throw new Error('inherit <list> [--from words.txt]');
  const from = opt('from');
  const pool = from ? words(from).map(w => w.toUpperCase()).filter(w => DICT.has(w)) : [...DICT];
  const found = inherit(readList(name), pool);
  const kinds = {};
  for (const f of found) kinds[f.kind] = (kinds[f.kind] ?? 0) + 1;
  console.error(`${found.length} proposals for ${name}: ${Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(', ')}`);
  console.log('word\tbase\tkind\tflag');
  for (const f of found) console.log(`${f.word.toLowerCase()}\t${f.base.toLowerCase()}\t${f.kind}\t${f.flag}`);
} else if (cmd === 'pool') {
  const names = (opt('lists') ?? listNames().join(',')).split(',');
  const from = opt('from');
  const chunk = Number(opt('chunk', 1900));
  const out = opt('out', path.join(root, 'theme-pool'));
  const base = from ? words(from).map(w => w.toUpperCase()).filter(w => DICT.has(w)) : [...DICT];
  const lists = names.map(readList);
  const onAny = new Set(lists.flat());
  // What inheritance would propose is set aside: it gets its own, quicker read.
  const inherited = new Set(lists.flatMap(l => inherit(l, base).map(f => f.word)));
  const pool = [...new Set(base)].filter(w => !onAny.has(w) && !inherited.has(w)).sort();
  fs.mkdirSync(out, { recursive: true });
  const n = Math.ceil(pool.length / chunk);
  for (let i = 0; i < n; i++) {
    const file = path.join(out, `pool-${String(i + 1).padStart(2, '0')}.txt`);
    fs.writeFileSync(file, pool.slice(i * chunk, (i + 1) * chunk).map(w => w.toLowerCase()).join('\n') + '\n');
  }
  console.log(`${pool.length} words to read (${inherited.size} set aside for inheritance), in ${n} file(s) of up to ${chunk} in ${out}`);
} else if (cmd === 'add') {
  const [name, picksFile] = rest;
  if (!name || !picksFile) throw new Error('add <list> <picks.txt> [--write]');
  const file = listPath(name);
  const on = new Set(readList(name));
  const picks = [...new Set(words(picksFile).map(w => w.split(/\s/)[0].toUpperCase()))];
  const why = { on: [], barred: [], missing: [], odd: [] };
  const fresh = [];
  for (const w of picks) {
    if (!/^[A-Z]+$/.test(w)) why.odd.push(w);
    else if (on.has(w)) why.on.push(w);
    else if (isExcluded(w)) why.barred.push(w);
    else if (!DICT.has(w)) why.missing.push(w);
    else fresh.push(w);
  }
  fresh.sort();
  console.log(`${fresh.length} new for ${name}; skipped ${why.on.length} already on it, ${why.barred.length} barred, ${why.missing.length} not in the dictionary, ${why.odd.length} not plain words`);
  for (const [k, v] of Object.entries(why)) if (k !== 'on' && v.length) console.log(`  ${k}: ${v.slice(0, 20).join(' ')}${v.length > 20 ? ' …' : ''}`);
  if (args.includes('--write') && fresh.length) {
    const text = fs.readFileSync(file, 'utf8').replace(/\s*$/, '\n');
    fs.writeFileSync(file, text + fresh.map(w => w.toLowerCase()).join('\n') + '\n');
    console.log(`wrote ${fresh.length} to ${path.relative(root, file)}`);
  } else if (fresh.length) console.log('(dry run — add --write to write them)');
} else {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter(l => l.startsWith('//')).slice(0, 34).map(l => l.slice(3)).join('\n'));
}
