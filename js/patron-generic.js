// ─── The Generic: a patron rolled from a table ────────────────────────────────
//
// THIS FILE IS THE TUNING TABLE, and it is meant to be edited between
// playtests. Everything the randomised patron can be lives here — the triggers
// it can ask for, the effects it can pay, the weights that decide which pairs
// with which, and the names and epithets it can go by. The behaviour that reads
// it all is the `generic` def in js/patrons.js; the card it wears is in
// js/patron-cards.js.
//
// HOW ONE IS ROLLED (rollGeneric, at the foot)
//   · one trigger from SET A — something about the WORD          · weight 1-4
//   · one trigger from SET B — something about the TILES or PAGE  · weight 2-4
//   · both must hold. They are ANDed, always.
//   · then an effect whose `cost` equals the two weights added — so 3 to 8.
//
// The price on the card is FLAT (GENERIC_PRICE). The pairing does the work, not
// the price: a cheap trigger married to a cheap effect is a poor buy and an
// awkward trigger married to a rich one is a windfall, and spotting which is
// which is the game. Nothing here consults the dictionary at runtime — the
// weights are corpus-informed guesses, and where one proves wrong the fix is to
// change the number in this file and play on.
//
// TO RETUNE: move a trigger's `weight` and it re-pairs with a different band of
// effects at once. Nothing else needs touching — the roller only ever asks for
// an effect whose cost matches, and the check at the foot of this file refuses
// to load a table with a weight no effect can answer.

import { COLOURS, TRIMS, PACKAGES, ALMONER_RELIEF, KNOBS } from './constants.js';
import { fillKnobs } from './text.js';
import { state, restingPoints, countsAsColour } from './state.js';
import { themePick } from './themes.js';

const pick = list => list[Math.floor(Math.random() * list.length)];

// "an amber tile", "a jade tile". The clauses are built from the colour and trim
// tables rather than written out, so the article has to be worked out too.
const an = word => `${/^[aeiou]/i.test(word) ? 'an' : 'a'} ${word}`;

// ─── What a trigger is asked ──────────────────────────────────────────────────
// Every `test` is a PURE function of one context, and must stay that way:
// scoring re-runs on every keystroke to draw the live preview, so a test that
// wandered would make the preview a lie.
//
//   word   the letters the table READ — medieval sorts resolved, marks stripped
//   tiles  the tiles of the word, as scored
//   at     a snapshot of the press when the word was scored (snapOf, below).
//          Read the press through THIS and never through `state`: onPrinted asks
//          these same questions after the commit has already banked the score,
//          bumped the word count and paid back the discards.
export const snapOf = (s = state) => ({
  wordsPrinted: s.wordsPrinted ?? 0,
  pageScore:    s.pageScore ?? 0,
  quota:        s.quota ?? 1,
  discards:     s.discards ?? 0,
  chapter:      s.chapter ?? 1,
  page:         s.page ?? 1,
});

const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);
const vowelCount = w => [...w].filter(c => VOWELS.has(c)).length;
const endsIn = l => ({ word }) => word.endsWith(l);

// ─── TRIGGER SET A — the word itself ──────────────────────────────────────────
// Weights 1 (a word half the dictionary answers) to 4 (a shape you have to go
// looking for). `clause` completes the sentence "A word that …".
export const GENERIC_TRIGGERS_A = [
  // ── weight 1 · about half of everything ──
  { id: 'firstNZ',  weight: 1, clause: 'starts with a letter from N to Z',
    test: ({ word }) => word[0] >= 'N' },
  { id: 'firstAM',  weight: 1, clause: 'starts with a letter from A to M',
    test: ({ word }) => word[0] <= 'M' },
  { id: 'noE',      weight: 1, clause: 'holds no E',
    test: ({ word }) => !word.includes('E') },

  // ── weight 2 · a third or so, or a common ending ──
  { id: 'halfVowels', weight: 2, clause: 'is half vowels or more',
    test: ({ word }) => vowelCount(word) * 2 >= word.length },
  { id: 'twoVowels',  weight: 2, clause: 'sets two vowels side by side',
    test: ({ word }) => [...word].some((c, i) => i && VOWELS.has(c) && VOWELS.has(word[i - 1])) },
  { id: 'endsS',      weight: 2, clause: 'ends in S', test: endsIn('S') },
  { id: 'endsVowel',  weight: 2, clause: 'ends in a vowel',
    test: ({ word }) => VOWELS.has(word.at(-1)) },

  // ── weight 3 · a fifth or less, or a shape the hand has to be steered into ──
  { id: 'hasKVWY',    weight: 3, clause: 'holds a K, V, W or Y',
    test: ({ word }) => /[KVWY]/.test(word) },
  { id: 'sixLetters', weight: 3, clause: 'runs to exactly six letters',
    test: ({ word }) => word.length === 6 },
  { id: 'endsE',      weight: 3, clause: 'ends in E', test: endsIn('E') },
  { id: 'threeVowels', weight: 3, clause: 'holds three vowels or more',
    test: ({ word }) => vowelCount(word) >= 3 },
  { id: 'endsT',      weight: 3, clause: 'ends in T', test: endsIn('T') },

  // ── weight 4 · the awkward endings. D and G are the two the press can BUY its
  // way into — an -ED or an -ING is one tile — which is the point of keeping
  // them dear: the pairing is a reason to go and build the hand for it.
  { id: 'endsN', weight: 4, clause: 'ends in N', test: endsIn('N') },
  { id: 'endsR', weight: 4, clause: 'ends in R', test: endsIn('R') },
  { id: 'endsD', weight: 4, clause: 'ends in D', test: endsIn('D') },
  { id: 'endsG', weight: 4, clause: 'ends in G', test: endsIn('G') },
];

// ─── TRIGGER SET B — the tiles, and where you are on the page ─────────────────
// Weights 2 to 4. Nothing here is free: the cheapest still asks you to look at
// the press before you print. `clause` follows Set A's as ", …".
export const GENERIC_TRIGGERS_B = [
  // ── weight 2 · true about half the time, or a tile you likely own ──
  { id: 'discardLeft', weight: 2, clause: 'printed while you still hold a discard',
    test: ({ at }) => at.discards > 0 },
  { id: 'belowHalf',   weight: 2, clause: 'printed before the page is half done',
    test: ({ at }) => at.pageScore * 2 < at.quota },
  { id: 'aboveHalf',   weight: 2, clause: 'printed once the page is half done',
    test: ({ at }) => at.pageScore * 2 >= at.quota },
  { id: 'bigTile',     weight: 2, clause: 'with a tile worth 8 Points or more in it',
    test: ({ tiles }) => tiles.some(t => restingPoints(t) >= 8) },

  // ── weight 3 · one dressed tile, or one particular seat on the page ──
  ...Object.keys(COLOURS).map(c => ({
    id: `paint-${c}`, weight: 3,
    clause: `with ${an(COLOURS[c].label.toLowerCase())} tile in it`,
    test: ({ tiles }) => tiles.some(t => countsAsColour(t, c)),
  })),
  { id: 'secondWord', weight: 3, clause: 'printed second on the page',
    test: ({ at }) => at.wordsPrinted === 1 },
  { id: 'thirdWord',  weight: 3, clause: 'printed third on the page',
    test: ({ at }) => at.wordsPrinted === 2 },

  // ── weight 4 · a tile you had to go to the Market and dress on purpose ──
  { id: 'nicked', weight: 4, clause: 'with a nicked tile in it',
    test: ({ tiles }) => tiles.some(t => t.nick) },
  ...Object.keys(TRIMS).map(k => ({
    id: `trim-${k}`, weight: 4,
    clause: `with ${an(`${k}-trimmed`)} tile in it`,
    test: ({ tiles }) => tiles.some(t => t.trim === k),
  })),
];

// ─── EFFECTS ──────────────────────────────────────────────────────────────────
// `cost` is what the pairing must add up to, so an effect is only ever offered
// against triggers that earn it. Fields:
//
//   kind        what the behaviour in js/patrons.js does with it
//   clause      completes "… — <clause>."
//   n           the number the kind reads, where it wants one
//   oncePerPage set on anything that leaves something PERMANENT behind (a nick,
//               a laurel, growth, a gift on the bench). Those compound over a
//               run where Points and Mult decay against the climbing quota, and
//               a cheap pairing that fired five times a page would run away
//               with the game. Everything else is unlimited on purpose.
export const GENERIC_EFFECTS = [
  // ── 3 ──
  { id: 'points10',    cost: 3, kind: 'points',  n: 10, clause: '+10 Points' },
  { id: 'coin1',       cost: 3, kind: 'coins',   n: 1,  clause: '+1 Coin' },
  { id: 'echoFirst',   cost: 3, kind: 'echo',    n: 0,  clause: 'its first tile prints twice' },
  { id: 'echoSecond',  cost: 3, kind: 'echo',    n: 1,  clause: 'its second tile prints twice' },

  // ── 4 ──
  { id: 'chapter5',    cost: 4, kind: 'perChapter', n: 5, clause: '+5 Points per chapter reached' },
  { id: 'coin2',       cost: 4, kind: 'coins',   n: 2,  clause: '+2 Coins' },
  { id: 'paintPot',    cost: 4, kind: 'paintPot', clause: 'a pot of paint onto the workbench',
    oncePerPage: true },

  // ── 5 ──
  { id: 'xmult15',     cost: 5, kind: 'xmult',   n: 1.5, clause: '×1.5 Mult' },
  { id: 'chapter8',    cost: 5, kind: 'perChapter', n: 8, clause: '+8 Points per chapter reached' },
  { id: 'grow1',       cost: 5, kind: 'grow',    n: 1,
    clause: '+1 Point, for good, into every tile of the word', oncePerPage: true },

  // ── 6 ──
  { id: 'refund',      cost: 6, kind: 'refund',  n: 1,  clause: 'a discard back' },
  { id: 'nickOne',     cost: 6, kind: 'nick',    clause: 'a nick cut into one of its tiles',
    oncePerPage: true },
  { id: 'primeMult',   cost: 6, kind: 'primeMult', n: 1.5,
    clause: 'the next word primed at ×1.5 Mult' },
  { id: 'laurel',      cost: 6, kind: 'laurel',  clause: 'a laurel to one of your patrons, at random',
    oncePerPage: true },

  // ── 7 ──
  // The one effect that lowers the bar instead of raising the score, and the
  // only reason it is not dearer: it lands on THIS page only, so a late-page
  // firing is worth little and an early one is worth a great deal. Stacks with
  // The Gardener, whose relief is permanent — hers comes off the page in front
  // of you, his off every page after.
  { id: 'relief',      cost: 7, kind: 'relief', n: ALMONER_RELIEF,
    clause: 'this page’s quota cut by {ALMONER_RELIEF_PCT}', oncePerPage: true },
  { id: 'draw2',       cost: 7, kind: 'draw',    n: 2,
    clause: 'two more tiles in hand for the rest of the page', oncePerPage: true },
  { id: 'parcel',      cost: 7, kind: 'parcel',  clause: 'a parcel onto the workbench',
    oncePerPage: true },

  // ── 8 ──
  { id: 'xmult2',      cost: 8, kind: 'xmult',   n: 2, clause: '×2 Mult' },
  { id: 'grow2',       cost: 8, kind: 'grow',    n: 2,
    clause: '+2 Points, for good, into every tile of the word', oncePerPage: true },
];

// ─── What one is called ───────────────────────────────────────────────────────
// A name off the Expectant Parents' register (wordlists/names.txt, 5,000 of
// them) and an epithet that undercuts it. The joke only works if the epithets
// stay deadpan — nothing grand, nothing sinister, nothing that sounds like a
// trade. Add freely.
export const GENERIC_EPITHETS = [
  'the Generic', 'the Unremarkable', 'the Human', 'the Ordinary', 'the Adequate',
  'the Passable', 'the Nondescript', 'the Unexceptional', 'the Middling',
  'the Plain', 'the Serviceable', 'the Usual', 'the Average', 'the Anonymous',
  'the Standard', 'the Indifferent', 'the Unassuming', 'the Tolerable',
  'the Modest', 'the Forgettable', 'the Reasonable', 'the Sufficient',
  'the Approximate', 'the Provisional', 'the Nominal', 'the Customary',
];

// Faces, kept studiously blank. One is rolled per copy so two Generics on the
// shelf are told apart at a glance.
export const GENERIC_FACES = ['🧍', '👤', '🙂', '😐', '🧑', '🫥', '🪪', '🙃'];

// Where the register hasn't loaded (a bundled build without the lists, a file://
// page), the roller falls back to these rather than going nameless.
export const GENERIC_FALLBACK_NAMES = [
  'Alice', 'Suzy', 'Gary', 'Dennis', 'Marge', 'Kevin', 'Doreen', 'Trevor',
  'Sandra', 'Nigel', 'Beryl', 'Colin',
];

// What the card asks, whatever it rolled. Flat on purpose — see the note at the
// head of this file.
export const GENERIC_PRICE = 4;

// ─── Rolling one ──────────────────────────────────────────────────────────────

const titleCase = s => s.charAt(0) + s.slice(1).toLowerCase();

// A name off the register, or out of the fallback list. Names are stored
// uppercase, so it is title-cased for the card.
export function rollGenericName() {
  const off = themePick('names');
  return off ? titleCase(off) : pick(GENERIC_FALLBACK_NAMES);
}

// The whole roll, kept on the seat's `data`. Everything is stored as an ID, so a
// save made today still reads tomorrow against a retuned table — and a trigger
// or effect DELETED from the tables above leaves a seat that quietly does
// nothing rather than one that throws (see byId, below).
export function rollGeneric() {
  const a = pick(GENERIC_TRIGGERS_A);
  const b = pick(GENERIC_TRIGGERS_B);
  const want = a.weight + b.weight;
  const affordable = GENERIC_EFFECTS.filter(e => e.cost === want);
  return {
    a: a.id,
    b: b.id,
    effect: pick(affordable.length ? affordable : GENERIC_EFFECTS).id,
    who: rollGenericName(),
    epithet: pick(GENERIC_EPITHETS),
    face: pick(GENERIC_FACES),
  };
}

export const triggerA = data => GENERIC_TRIGGERS_A.find(t => t.id === data?.a) ?? null;
export const triggerB = data => GENERIC_TRIGGERS_B.find(t => t.id === data?.b) ?? null;
export const effectOf = data => GENERIC_EFFECTS.find(e => e.id === data?.effect) ?? null;

// An effect's clause may quote a {KNOB}, the same as any card's desc — filled
// once here, as the module loads, so nothing downstream has to know.
for (const e of GENERIC_EFFECTS) e.clause = fillKnobs(e.clause, KNOBS, 'patron-generic: effect');

// Both triggers, ANDed. A roll missing either half never fires.
export function genericFires(data, ctx) {
  const a = triggerA(data), b = triggerB(data);
  if (!a || !b || !ctx.word) return false;
  return a.test(ctx) && b.test(ctx);
}

// The sentence on the card, and the one on the shelf's tap-through.
export function genericClause(data) {
  const a = triggerA(data), b = triggerB(data), e = effectOf(data);
  if (!a || !b || !e) return null;
  return `A word that ${a.clause}, ${b.clause} — ${e.clause}.`;
}

export const genericName = data =>
  (data?.who ? `${data.who} ${data.epithet ?? 'the Generic'}` : null);

// ─── The check ────────────────────────────────────────────────────────────────
// A weight with no effect to answer it would roll a patron paying something it
// never earned, and the fault would show up as a strange card months later
// rather than as a crash now. So the tables are checked against each other at
// load, the same way a patron card is checked against its behaviour.
{
  const costs = new Set(GENERIC_EFFECTS.map(e => e.cost));
  const unanswered = [];
  for (const a of GENERIC_TRIGGERS_A) {
    for (const b of GENERIC_TRIGGERS_B) {
      if (!costs.has(a.weight + b.weight)) unanswered.push(`${a.id}+${b.id}=${a.weight + b.weight}`);
    }
  }
  if (unanswered.length) {
    throw new Error(`patron-generic: no effect costs ${[...new Set(unanswered.map(u => u.split('=')[1]))].join(', ')}`
      + ` — pairings with nothing to pay them: ${unanswered.slice(0, 4).join(', ')}`);
  }
}
