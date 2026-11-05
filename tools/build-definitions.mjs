// The definitions the Daily Proof shows beside a word in its results, one for
// every word in the dictionary that has one to give:
//
//   node tools/build-definitions.mjs <wordnet dict dir>
//     e.g. node tools/build-definitions.mjs ~/sources/wordnet-db-3.1.14/package/dict
//
// (WordNet 3.1 as the npm package wordnet-db@3.1.14; see wordlists/MAKING-LISTS.md
// → "The Register Foundry" for fetching it.) Writes wordlists/definitions/a.txt
// … z.txt, one "word<TAB>definition" per line, and wordlists/definitions-missing.txt,
// the dictionary words that still have none.
//
// Where each definition comes from, first match wins:
//
//   1. wordlists/definitions-own.txt — written by hand: overrides of WordNet's
//      choice, and the words WordNet doesn't know. "word<TAB>definition".
//   2. WordNet, the word itself — the gloss of its commonest sense, in the part
//      of speech its tagged corpus met most often (HOME, a noun; RUN, a verb).
//      Example sentences are cut. Used when WordNet's corpus met the word, or
//      when the word has no base form to fall back on. An untagged noun whose
//      first-listed sense is a plant takes its food sense (PEACH, CHERRY), and
//      an animal or plant gloss with no head noun gets its hypernym (YELLOWFIN
//      "a tuna; may reach 400 pounds…").
//   3. A base form, by WordNet's rules for endings and a short table of
//      irregulars — STOPPED gives "STOP: come to a halt…", GEESE "GOOSE: …".
//      The base's own definition comes from 1 or 2.
//   4. A transparent formation on a defined word — UNMELTED "not melted",
//      HORNLESSNESS "the quality of being hornless" — for words neither
//      WordNet nor the hand list has.
//
// WordNet's definitions are Princeton's, used under the WordNet licence, whose
// notice travels with them in wordlists/definitions/WORDNET-LICENSE.txt.
//
// AFTER ADDING WORDS TO THE DICTIONARY: re-run this. Anything it can't define
// lands in definitions-missing.txt; write those into definitions-own.txt (one
// short definition each, in the plain style of the rest) and run it again.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wn = process.argv[2];
if (!wn) { console.error('usage: node tools/build-definitions.mjs <wordnet dict dir>'); process.exit(1); }
const read = f => fs.readFileSync(path.join(root, 'wordlists', f), 'utf8').replace(/\r/g, '').split('\n');
// Words on the block list are never played, so never defined (or missed).
const blocked = new Set(read('excluded-slurs.txt').map(l => l.trim().toLowerCase()).filter(l => l && !l.startsWith('#')));
const dict = read('wordlist.txt').map(l => l.trim()).filter(w => w && !blocked.has(w));
const own = new Map();
if (fs.existsSync(path.join(root, 'wordlists/definitions-own.txt'))) {
  for (const l of read('definitions-own.txt')) {
    if (!l.trim() || l.startsWith('#')) continue;
    const [w, ...d] = l.split('\t');
    if (w && d.length) own.set(w.trim().toLowerCase(), d.join('\t').trim());
  }
}

// ─── WordNet ──────────────────────────────────────────────────────────────────
// lemma → [{ pos, tagged, offset }], from the index files. An index line is
// "lemma pos synset_cnt p_cnt [p_cnt pointers] sense_cnt tagsense_cnt offsets…",
// offsets commonest sense first.
const POS = ['noun', 'verb', 'adj', 'adv'];
const index = new Map();
for (const pos of POS) {
  for (const line of fs.readFileSync(path.join(wn, `index.${pos}`), 'latin1').split('\n')) {
    if (!line || line.startsWith(' ')) continue;
    const f = line.split(' ');
    if (!/^[a-z]+$/.test(f[0])) continue;
    const p = +f[3];
    const tagged = +f[5 + p];
    const offsets = f.slice(6 + p, 6 + p + +f[4 + p]);
    if (!index.has(f[0])) index.set(f[0], []);
    index.get(f[0]).push({ pos, tagged, offset: offsets[0], offsets });
  }
}
const data = Object.fromEntries(POS.map(pos => [pos, fs.readFileSync(path.join(wn, `data.${pos}`), 'latin1')]));
// A synset's line: "offset lexfile pos w_cnt word lex_id… p_cnt pointers… | gloss".
function synset(pos, offset) {
  const s = data[pos];
  const at = +offset;
  const line = s.slice(at, s.indexOf('\n', at));
  const f = line.split(' ');
  const w = parseInt(f[3], 16);
  const words = Array.from({ length: w }, (_, i) => f[4 + 2 * i].replace(/\(.*\)$/, '').replace(/_/g, ' '));
  const pAt = 4 + 2 * w;
  const pointers = Array.from({ length: +f[pAt] }, (_, i) => ({ sym: f[pAt + 1 + 4 * i], offset: f[pAt + 2 + 4 * i], pos: f[pAt + 3 + 4 * i] }));
  return { lexfile: +f[1], words, pointers, text: line.slice(line.indexOf('| ') + 2).trim() };
}
// Where WordNet's corpus never met a word, its senses come in no particular
// order, and the first is often the plant: PEACH "cultivated in temperate
// regions", CHERRY "wood of any of various cherry trees". For those, the food.
const PLANT = 20, FOOD = 13;
for (const senses of index.values()) {
  for (const sn of senses) {
    if (sn.pos !== 'noun' || sn.tagged > 0 || sn.offsets.length < 2) continue;
    if (synset('noun', sn.offset).lexfile !== PLANT) continue;
    const food = sn.offsets.find(o => synset('noun', o).lexfile === FOOD);
    if (food) sn.offset = food;
  }
}
// Some animal and plant glosses leave the kind of thing to the synset's
// hypernym and start straight in on the difference: YELLOWFIN "may reach 400
// pounds; worldwide in tropics" (a tuna), ASP "of southern Europe; similar to
// but smaller than the adder" (a viper). Those get the hypernym read back in.
const ANIMAL = 5;
const HEADLESS = /^(may|of|native to|found in|similar to|related to|distinguished from|sometimes placed|usually coiled|(widely |often )?(cultivated|grown) (in|for|as))\b/;
const RUNS_ON = /^(of|native to|found in|similar to|related to|distinguished from|(widely |often )?(cultivated|grown) (in|for|as))\b/;
const article = w => (/^[aeiou]/i.test(w) ? 'an' : 'a');
function withHead(pos, offset, g) {
  if (pos !== 'noun' || !HEADLESS.test(g)) return g;
  const at = synset(pos, offset);
  if (at.lexfile !== ANIMAL && at.lexfile !== PLANT) return g;
  const up = at.pointers.find(p => p.sym === '@' || p.sym === '@i');
  if (!up) return g;
  const kind = synset('noun', up.offset).words[0];
  if (g.includes(kind)) return g;   // OKAPI "similar to the giraffe": no "a giraffe" in front of that
  return `${article(kind)} ${kind}${RUNS_ON.test(g) ? ' ' : '; '}${g}`;
}
function gloss({ pos, offset }) {
  let g = synset(pos, offset).text;
  const ex = g.indexOf('"');            // examples are quoted; cut from the first
  if (ex >= 0) g = g.slice(0, ex);
  g = g.replace(/[;:\s]+$/, '').trim();
  // A leading label naming a field — "(behavioral attributes) the way a person
  // behaves" — is dropped; one saying what the word applies to, "(of a pipe)
  // blocked", is kept.
  const label = g.match(/^\(([^)]*)\)\s*/);
  if (label && !/^(of|used|in|as|with|especially|usually|often|sometimes|chiefly)\b/.test(label[1])) g = g.slice(label[0].length);
  return withHead(pos, offset, g);
}
const bestSense = senses => senses.reduce((a, b) => (b.tagged > a.tagged ? b : a));

// Picked senses. Where the corpus never met a word in any part of speech, its
// senses (and which part of speech comes first) are in no particular order;
// wordlists/definitions-senses.txt names the one to use, "word<TAB>pos<TAB>
// offset<TAB># the gloss's start", offsets as in WordNet 3.1's data files.
const picks = new Map();
if (fs.existsSync(path.join(root, 'wordlists/definitions-senses.txt'))) {
  for (const l of read('definitions-senses.txt')) {
    if (!l.trim() || l.startsWith('#')) continue;
    const [w, pos, offset] = l.split('\t').map(x => x.trim());
    if (!index.get(w)?.some(sn => sn.pos === pos && sn.offsets.includes(offset))) {
      console.error(`definitions-senses.txt: ${w} has no ${pos} sense ${offset}`); process.exit(1);
    }
    picks.set(w, { pos, offset });
  }
}
const arbitrary = w => {
  const s = index.get(w);
  return !!s && s.every(sn => sn.tagged === 0) && s.reduce((n, sn) => n + sn.offsets.length, 0) > 1;
};
const used = new Set();   // every word whose WordNet gloss went into a definition
const senseOf = w => { used.add(w); return picks.get(w) ?? bestSense(index.get(w)); };

// Base forms. WordNet's own endings, and the irregulars (its exception lists
// are not in the npm package, so the common ones are here).
const ENDINGS = {
  noun: [['s', ''], ['ses', 's'], ['xes', 'x'], ['zes', 'z'], ['ches', 'ch'], ['shes', 'sh'], ['men', 'man'], ['ies', 'y']],
  verb: [['s', ''], ['ies', 'y'], ['ied', 'y'], ['es', 'e'], ['es', ''], ['ed', 'e'], ['ed', ''], ['ing', 'e'], ['ing', '']],
  adj: [['er', ''], ['est', ''], ['er', 'e'], ['est', 'e'], ['ier', 'y'], ['iest', 'y']],
};
const IRREGULAR = Object.fromEntries(`
arose arise arisen arise awoke awake awoken awake was be were be been be bore bear borne bear born bear
beat beat beaten beat became become began begin begun begin bent bend bet bet bit bite bitten bite bled bleed
blew blow blown blow broke break broken break bred breed brought bring built build burnt burn bought buy
caught catch chose choose chosen choose clung cling came come crept creep dealt deal dug dig dove dive
did do done do drew draw drawn draw dreamt dream drank drink drunk drink drove drive driven drive ate eat
eaten eat fell fall fallen fall fed feed felt feel fought fight found find fled flee flung fling flew fly
flown fly forbade forbid forbidden forbid forgot forget forgotten forget forgave forgive forgiven forgive
froze freeze frozen freeze got get gotten get gave give given give went go gone go ground grind grew grow
grown grow hung hang had have heard hear hid hide hidden hide held hold hurt hurt kept keep knelt kneel knew
know known know laid lay led lead leapt leap learnt learn left leave lent lend lay lie lain lie lit light
lost lose made make meant mean met meet paid pay pled plead proved prove proven prove quit quit ran run rang
ring rung ring rode ride ridden ride rose rise risen rise said say saw see seen see sought seek sold sell
sent send set set sewn sew shook shake shaken shake shone shine shot shoot shown show shrank shrink shrunk
shrink shut shut sang sing sung sing sank sink sunk sink sat sit slept sleep slid slide slung sling smelt
smell spoke speak spoken speak sped speed spelt spell spent spend spilt spill spun spin spat spit split
split spoilt spoil spread spread sprang spring sprung spring stood stand stole steal stolen steal stuck
stick stung sting stank stink stunk stink strode stride struck strike strung string strove strive swore
swear sworn swear swept sweep swam swim swum swim swung swing took take taken take taught teach tore tear
torn tear told tell thought think threw throw thrown throw thrust thrust trod tread trodden tread woke wake
woken wake wore wear worn wear wove weave woven weave wept weep won win wound wind withdrew withdraw
withdrawn withdraw wrung wring wrote write written write
men man women woman children child feet foot teeth tooth geese goose mice mouse lice louse oxen ox
people person dice die pence penny
better good best good worse bad worst bad more much most much less little least little further far
furthest far farther far elder old eldest old
`.trim().split(/\s+/).reduce((pairs, w, i, a) => (i % 2 ? pairs : [...pairs, [w, a[i + 1]]]), []));

function baseOf(w) {
  const out = [];
  if (IRREGULAR[w] && (index.has(IRREGULAR[w]) || own.has(IRREGULAR[w]))) out.push(IRREGULAR[w]);
  for (const pos of ['noun', 'verb', 'adj']) {
    for (const [a, b] of ENDINGS[pos]) {
      if (!w.endsWith(a)) continue;
      const base = w.slice(0, -a.length) + b;
      if (base.length > 1 && (index.get(base)?.some(s => s.pos === pos) || own.has(base))) out.push(base);
    }
    // a doubled consonant: STOPPED, RUNNING, BIGGER
    for (const a of ['ed', 'ing', 'er', 'est']) {
      if (!w.endsWith(a)) continue;
      const stem = w.slice(0, -a.length);
      if (stem.length > 2 && stem.at(-1) === stem.at(-2) && (index.has(stem.slice(0, -1)) || own.has(stem.slice(0, -1)))) out.push(stem.slice(0, -1));
    }
  }
  if (!out.length) return null;
  // the base its corpus met most often
  // a base we wrote ourselves first; then the one WordNet's corpus met most
  const mine = out.find(b => own.has(b));
  if (mine) return mine;
  return out.reduce((a, b) => (bestSense(index.get(b)).tagged > bestSense(index.get(a)).tagged ? b : a));
}

// ─── Every word ───────────────────────────────────────────────────────────────
const defs = new Map();
const source = { own: 0, wordnet: 0, base: 0, made: 0 };
const ownOrWordNet = w => {
  if (own.has(w)) return own.get(w);
  const senses = index.get(w);
  return senses ? gloss(senseOf(w)) : null;
};
for (const w of dict) {
  if (own.has(w)) { defs.set(w, own.get(w)); source.own++; continue; }
  const senses = index.get(w);
  const base = baseOf(w);
  const met = senses && bestSense(senses).tagged > 0;
  if (senses && (met || !base || (index.has(base) && bestSense(senses).tagged >= bestSense(index.get(base)).tagged))) {
    defs.set(w, gloss(senseOf(w))); source.wordnet++; continue;
  }
  if (base) { defs.set(w, `${base.toUpperCase()}: ${ownOrWordNet(base)}`); source.base++; continue; }
}
// 4. Transparent formations on a word that has a definition by now.
const isVerb = v => index.get(v)?.some(s => s.pos === 'verb');
const third = v => (/(s|x|z|ch|sh)$/.test(v) ? `${v}es` : /[^aeiou]y$/.test(v) ? `${v.slice(0, -1)}ies` : `${v}s`);
function agentOf(w) {
  if (!w.endsWith('er') || w.length < 6) return null;
  const stem = w.slice(0, -2);
  for (const v of [stem, `${stem}e`, stem.at(-1) === stem.at(-2) ? stem.slice(0, -1) : null, stem.endsWith('i') ? `${stem.slice(0, -1)}y` : null]) {
    if (v && isVerb(v)) return `one who ${third(v)}`;
  }
  return null;
}
const has = w => defs.has(w) || own.has(w);
for (const w of dict) {
  if (defs.has(w)) continue;
  let made = null;
  if (w.startsWith('un') && has(w.slice(2))) made = `not ${w.slice(2)}`;
  else if (w.endsWith('ness') && has(w.slice(0, -4))) made = `the quality of being ${w.slice(0, -4)}`;
  else if (w.endsWith('iness') && has(w.slice(0, -5) + 'y')) made = `the quality of being ${w.slice(0, -5)}y`;
  else if (w.endsWith('lessly') && has(w.slice(0, -2))) made = `in a ${w.slice(0, -2)} way`;
  else if (w.endsWith('ly') && has(w.slice(0, -2)) && !w.endsWith('lly')) made = `in a ${w.slice(0, -2)} way`;
  else if (w.endsWith('less') && has(w.slice(0, -4))) made = `without ${w.slice(0, -4)}`;
  // An agent noun on a verb WordNet knows: EMBELLISHER "one who embellishes";
  // its plural lends the singular's, as a base form would.
  else if (agentOf(w)) made = agentOf(w);
  else if (w.endsWith('s') && agentOf(w.slice(0, -1))) made = `${w.slice(0, -1).toUpperCase()}: ${agentOf(w.slice(0, -1))}`;
  if (made) { defs.set(w, made); source.made++; }
}

// ─── Out ──────────────────────────────────────────────────────────────────────
const dir = path.join(root, 'wordlists/definitions');
fs.mkdirSync(dir, { recursive: true });
const byLetter = new Map();
for (const w of dict) {
  if (!defs.has(w)) continue;
  const k = w[0];
  if (!byLetter.has(k)) byLetter.set(k, []);
  byLetter.get(k).push(`${w}\t${defs.get(w).replace(/\s+/g, ' ')}`);
}
for (const [k, lines] of byLetter) fs.writeFileSync(path.join(dir, `${k}.txt`), lines.join('\n') + '\n');
const missing = dict.filter(w => !defs.has(w));
fs.writeFileSync(path.join(root, 'wordlists/definitions-missing.txt'),
  `# Dictionary words with no definition yet: write theirs into definitions-own.txt\n# and run tools/build-definitions.mjs again. Built by that tool; don't edit.\n#\n${missing.join('\n')}\n`);
// The words still to pick a sense for, each with its senses to choose from.
const unpicked = [...used].filter(w => arbitrary(w) && !picks.has(w)).sort();
const flat = g => g.replace(/\s+/g, ' ');
fs.writeFileSync(path.join(root, 'wordlists/definitions-unpicked.txt'),
  `# Words whose WordNet senses come in no particular order, with no pick yet in\n# definitions-senses.txt. Each: the word, then every sense as pos<TAB>offset<TAB>gloss.\n# Built by tools/build-definitions.mjs; don't edit.\n#\n${
    unpicked.map(w => [w, ...index.get(w).flatMap(sn => sn.offsets.map(o => `  ${sn.pos}\t${o}\t${flat(synset(sn.pos, o).text.split('"')[0].replace(/[;:\s]+$/, ''))}`))].join('\n')).join('\n')}\n`);
console.log(`${picks.size} senses picked by hand, ${unpicked.length} words still to pick (definitions-unpicked.txt)`);
console.log(`${dict.length} words: ${source.own} from definitions-own.txt, ${source.wordnet} from WordNet, ${source.base} by a base form, ${source.made} made from a defined word, ${missing.length} still missing`);
