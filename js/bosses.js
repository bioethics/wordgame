// The Editors — one takes the desk at every Deadline (the third page of each
// chapter), unannounced until the page is dealt. An editor never bans
// anything and never touches what a tile is worth: each one warps the shape
// of the words instead — length, order, sequence — so the puzzle is solvable
// with whatever rack arrives, no preparation asked or possible.
//
// A word that breaks the house rule is not refused; it is SPIKED — printed,
// filed, counted, but at ×SPIKE_MULT (see constants.js) of what it would have
// scored. Every rack stays playable; the rule is a cost, not a wall. The live
// preview shows the spike coming, because the whole game runs on honest
// readouts.
//
// Def shape:
//   id, name, emoji, desc      — desc is the standing rule, in full
//   setup(data, state)         — roll per-page state as the Deadline is dealt
//   demand(data)               — the live line for the editor's bar: what the
//                                NEXT word must satisfy. null = the rule is
//                                static and desc says it all.
//   judge(letters, tiles, data, preTotal)
//                              — null if the word passes, else a short reason.
//                                Runs on every keystroke for the preview, so
//                                it must be pure and read data without writing.
//                                `preTotal` is the word's total before the
//                                spike (the Escalationist's bar is scored
//                                against real value, not spiked value).
//   mood(data)                 — a ×Mult applied to EVERY word (the Reviewer);
//                                shown in the bar before you compose.
//   onPrinted(data, script, letters)
//                              — advance the editor's memory after a word
//                                commits: chains, bars, re-rolls.
//   gift: true                 — grants an ephemeral tile of data.letter as
//                                the page is dealt (the Enthusiast).
//   rackBonus / noDiscards     — structural knobs read by state.js.
//
// Tuning numbers live here with their editor, patron-style; SPIKE_MULT lives
// in constants.js because scoring and the bar both read it.

import { themeRank, themeSize } from './themes.js';

// The Columnist's measures. Ten tiles in hand: three is always reachable,
// six is a genuine reach. Never the same measure twice running.
const COLUMN_MIN = 3;
const COLUMN_MAX = 6;

const ABRIDGER_MAX = 4;   // letters an Abridged word may run to
const PADDER_MIN   = 5;   // letters a Padded word must reach

// The Populist's band: how far down the frequency list a word may sit and
// still count as plain English. wordlists-themed/common.txt carries some 8,000
// ranks, so this can be widened to soften the editor without new data.
//
// Measured against 1,500 random racks: at 500 the best legal word is worth a
// mean 8.0 Points where an unconstrained rack manages 14.0 — the steepest
// squeeze of any editor (the Abridger leaves 11.5) — and yet 99.2% of racks
// can satisfy it, because the band includes A, IT, IS and their kin. That is
// the shape this roster wants: a hard ask that never bricks, with a cheap
// sacrificial word always available to whoever needs one.
const POPULIST_BAND = 500;

// The Obscurantist's bar — and the one number here that measurement lies
// about. Enumerate the whole dictionary and barring the commonest 1,000 words
// costs a solver almost nothing: it simply reads further down the list, losing
// 2% of its score ceiling. A player has to *think of* the rarer word, and the
// words that come to mind first are exactly the common ones. This editor is
// therefore far harder in the hand than on paper, and it is the one to tune by
// playing rather than by simulating.
const OBSCURANTIST_BAND = 1000;

// common.txt is fetched, so a Deadline can be dealt before the list lands.
// Neither editor may judge until it has. There is no single safe answer to
// give them while they wait, either — they read the same ranking in opposite
// directions, so an absent list would let one spike nothing and the other
// spike everything. Both ask, and both decline to judge until it is ready.
const commonReady = () => themeSize('common') > 0;
const commonRank  = word => themeRank('common', word);

// The Reviewer's temper: 0.2 at rock bottom, 0.95 on a good day, in
// twentieths. Squaring the roll skews the days good — the deep sulks are
// dramatic because they're occasional, and the tax across a page stays
// survivable (it averages ×0.7).
function rollMood(data) {
  const r = Math.random();
  data.mood = Math.round((0.95 - 0.75 * r * r) * 20) / 20;
}

function rollColumn(data) {
  let n;
  do { n = COLUMN_MIN + Math.floor(Math.random() * (COLUMN_MAX - COLUMN_MIN + 1)); }
  while (n === data.required);
  data.required = n;
}

export const BOSS_DEFS = [
  {
    id: 'abridger', name: 'The Abridger', emoji: '✂️',
    desc: `Nobody reads past the ${ABRIDGER_MAX}th letter. Longer words are spiked.`,
    judge: letters => letters.length > ABRIDGER_MAX
      ? `too long — ${ABRIDGER_MAX} letters at most` : null,
  },
  {
    id: 'padder', name: 'The Padder', emoji: '🪶',
    desc: `I pay by the word, so the words had better be long: anything under ${PADDER_MIN} letters is spiked.`,
    judge: letters => letters.length < PADDER_MIN
      ? `too short — ${PADDER_MIN} letters at least` : null,
  },
  {
    id: 'populist', name: 'The Populist', emoji: '📣',
    desc: `Popular fiction is profitable fiction. Every word must be among the ${POPULIST_BAND} commonest in English. Anything rare is spiked.`,
    judge: letters => {
      if (!commonReady()) return null;
      const rank = commonRank(letters);
      return rank == null || rank >= POPULIST_BAND
        ? `too rare — the ${POPULIST_BAND} commonest words only` : null;
    },
  },
  {
    id: 'obscurantist', name: 'The Obscurantist', emoji: '🕯️',
    desc: `True literature demands erudition: the ${OBSCURANTIST_BAND.toLocaleString()} commonest words in English are spiked.`,
    judge: letters => {
      if (!commonReady()) return null;
      const rank = commonRank(letters);
      return rank != null && rank < OBSCURANTIST_BAND
        ? `too plain — one of the ${OBSCURANTIST_BAND.toLocaleString()} commonest words` : null;
    },
  },
  {
    id: 'columnist', name: 'The Columnist', emoji: '📰',
    desc: 'Everything must fit the column: each word to an exact measure, re-set after every print. Off-measure words are spiked.',
    setup: data => rollColumn(data),
    demand: data => `This word: exactly ${data.required} letters.`,
    judge: (letters, tiles, data) => letters.length !== data.required
      ? `off the measure — exactly ${data.required} letters` : null,
    onPrinted: data => rollColumn(data),
  },
  {
    id: 'serialist', name: 'The Serialist', emoji: '🔗',
    desc: 'We need continuity. Each word must open with the letter the one before ended on, or be spiked.',
    demand: data => data.last
      ? `This word must open with ${data.last}.`
      : 'The first word is free — but mind how it ends.',
    judge: (letters, tiles, data) => data.last && letters[0] !== data.last
      ? `a broken chain — it must open with ${data.last}` : null,
    onPrinted: (data, script, letters) => { data.last = letters[letters.length - 1]; },
  },
  {
    id: 'indexer', name: 'The Indexer', emoji: '🗂️',
    desc: 'Order above all else: each word must alphabetically follow the prior word, or be spiked.',
    demand: data => data.last
      ? `This word must sort after ${data.last}.`
      : 'The first word may be anything — the index begins there.',
    judge: (letters, tiles, data) => data.last && letters <= data.last
      ? `out of order — it must sort after ${data.last}` : null,
    onPrinted: (data, script, letters) => { data.last = letters; },
  },
  {
    id: 'escalationist', name: 'The Escalationist', emoji: '📈',
    desc: 'Build to a climax: every word must outscore the one before it, or be spiked.',
    demand: data => data.bar != null
      ? `This word must beat ${data.bar.toLocaleString()}.`
      : 'The first word sets the bar. Open softly.',
    judge: (letters, tiles, data, preTotal) => data.bar != null && preTotal <= data.bar
      ? `no climax — it had to beat ${data.bar.toLocaleString()}` : null,
    onPrinted: (data, script) => { data.bar = script.total; },
  },
  {
    id: 'enthusiast', name: 'The Enthusiast', emoji: '🤩',
    desc: 'I really love specific letters! Every word set without my current favourite is spiked.',
    gift: true,
    // The passion lands on a letter drawn from the player's own collection,
    // weighted by how many they hold — so it's usually a common letter, and
    // never one the press doesn't carry. Ligatures and marks hold no appeal.
    setup: (data, state) => {
      const singles = state.collection.filter(t => /^[A-Z]$/.test(t.letter));
      data.letter = singles.length
        ? singles[Math.floor(Math.random() * singles.length)].letter : 'E';
    },
    demand: data => `Every word must contain ${data.letter}.`,
    judge: (letters, tiles, data) => !letters.includes(data.letter)
      ? `no ${data.letter} — the Enthusiast is crushed` : null,
  },
  {
    id: 'reviewer', name: 'The Reviewer', emoji: '🧐',
    desc: 'Your best work is still not good enough. (A random negative multiplier is applied to each word.)',
    setup: data => rollMood(data),
    demand: data => `The current temper: ×${data.mood} Mult.`,
    mood: data => data.mood,
    onPrinted: data => rollMood(data),
  },
  {
    // Structural, like the Completist — no rule to break, so nothing it can
    // spike. It simply takes three of your ten places and fills them with the
    // cheapest letter in the case.
    //
    // Measured over 2,000 hands: seven tiles plus EEE reach a best word worth
    // a mean 12.1 Points against 14.0 for a free ten — a 14% toll, among the
    // gentlest here — and the hand is never once stranded (0 of 4,000), since
    // three vowels will always find something. Against a bare seven (10.1) the
    // E's are worth a real +2.0, so they are a genuine gift; but the best word
    // absorbs all three only 9% of the time, and none of them 31%, and the
    // ones left over are the cage.
    id: 'eeeditor', name: 'The Eeeditor', emoji: '🅴',
    desc: 'E is a good letter. Here: I saved three especially for you.',
    lent: { letter: 'E', count: 3 },
  },
  {
    id: 'completist', name: 'The Hoarder', emoji: '🗄️',
    desc: 'Waste nothing, and you can always find what you need: +2 hand size, but 0 discards.',
    rackBonus: 2,
    noDiscards: true,
  },
];

export const bossById = id => BOSS_DEFS.find(b => b.id === id);

// The seated editor's def, or null. Takes state rather than importing it so
// this module stays leaf-like (state.js imports it for the structural knobs).
export const activeBoss = state => (state.boss ? bossById(state.boss.id) : null);

// Advance the editor's memory after a word commits. `letters` is the word
// without its marks — the same string judge() saw.
//
// Every verdict is also kept, in order, so the bar can show how the page has
// gone rather than only how the word in the groove is going: once a word is
// printed its ✓ or ✂ is otherwise gone from the screen, and on a five-word
// page that is most of what you want to know.
export function bossOnPrinted(state, script, letters) {
  if (!state.boss) return;
  const def = bossById(state.boss.id);
  const data = (state.boss.data ??= {});
  (data.verdicts ??= []).push(script.spiked ? 'spiked' : 'passed');
  def?.onPrinted?.(data, script, letters);
}

// Tiles the seated editor puts in your hand, topped up every time the hand is
// refilled — as the page is dealt, and again after each word prints. `cast` is
// state.js's castLentTile and `held` its lentInHand, passed in to keep this
// module free of imports from state.
//
// Two shapes, and the difference is when they come back. The Enthusiast's gift
// is once per page: spend it and it is spent, which is why data.gifted latches
// (and why a reload mid-deal can't conjure a second). The Eeeditor's three are
// a standing supply, restored the instant one leaves — so this counts what is
// still in hand rather than tracking what it has handed over.
//
// Returns the tiles created, so they can fly in alongside the draw.
export function bossReplenish(state, cast, held) {
  if (!state.boss) return [];
  const def = bossById(state.boss.id);
  const data = (state.boss.data ??= {});
  const made = [];

  if (def?.gift && !data.gifted) {
    data.gifted = true;
    made.push(cast(data.letter, { aboveHand: true }));
  }

  if (def?.lent) {
    for (let i = held().length; i < def.lent.count; i++) made.push(cast(def.lent.letter));
  }

  return made;
}
