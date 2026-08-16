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
// still count as plain English. wordlists-themed/common.txt carries 2,000
// ranks, so this can be widened to soften the editor without new data.
//
// Measured against 1,500 random racks: at 500 the best legal word is worth a
// mean 8.0 Points where an unconstrained rack manages 14.0 — the steepest
// squeeze of any editor (the Abridger leaves 11.5) — and yet 99.2% of racks
// can satisfy it, because the band includes A, IT, IS and their kin. That is
// the shape this roster wants: a hard ask that never bricks, with a cheap
// sacrificial word always available to whoever needs one.
const POPULIST_BAND = 500;

// Nothing spikes while the list is still loading. common.txt is fetched, so
// a Deadline dealt in the first moments of a session would otherwise judge
// every word unknown-and-therefore-rare and spike the lot.
const commonRank = word => themeSize('common') ? themeRank('common', word) : 0;

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
    desc: `This house is paid by the word, and the words had better be long: anything under ${PADDER_MIN} letters is spiked.`,
    judge: letters => letters.length < PADDER_MIN
      ? `too slight — ${PADDER_MIN} letters at least` : null,
  },
  {
    id: 'populist', name: 'The Populist', emoji: '📣',
    desc: `Writes for the common reader and nobody else: every word must be among the ${POPULIST_BAND} commonest in English. Anything rarer is spiked, however clever.`,
    judge: letters => {
      const rank = commonRank(letters);
      return rank == null || rank >= POPULIST_BAND
        ? `too rare — the ${POPULIST_BAND} commonest words only` : null;
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
    desc: 'Every instalment picks up where the last left off: each word must open with the letter the one before ended on, or be spiked. A spiked word still sets the chain.',
    demand: data => data.last
      ? `This word must open with ${data.last}.`
      : 'The first word is free — but mind how it ends.',
    judge: (letters, tiles, data) => data.last && letters[0] !== data.last
      ? `a broken chain — it must open with ${data.last}` : null,
    onPrinted: (data, script, letters) => { data.last = letters[letters.length - 1]; },
  },
  {
    id: 'indexer', name: 'The Indexer', emoji: '🗂️',
    desc: 'The book is filed as it prints: each word must sort alphabetically after the one before, or be spiked. A spiked word is still filed — an APPLE, sacrificed, reopens the index.',
    demand: data => data.last
      ? `This word must sort after ${data.last}.`
      : 'The first word may be anything — the index begins there.',
    judge: (letters, tiles, data) => data.last && letters <= data.last
      ? `out of order — it must sort after ${data.last}` : null,
    onPrinted: (data, script, letters) => { data.last = letters; },
  },
  {
    id: 'escalationist', name: 'The Escalationist', emoji: '📈',
    desc: 'Build to a climax: every word must outscore the one before it, or be spiked. A spiked word still sets the bar — a cheap word can lower it on purpose.',
    demand: data => data.bar != null
      ? `This word must beat ${data.bar.toLocaleString()}.`
      : 'The first word sets the bar. Open softly.',
    judge: (letters, tiles, data, preTotal) => data.bar != null && preTotal <= data.bar
      ? `no climax — it had to beat ${data.bar.toLocaleString()}` : null,
    onPrinted: (data, script) => { data.bar = script.total; },
  },
  {
    id: 'enthusiast', name: 'The Enthusiast', emoji: '🤩',
    desc: 'Has conceived a passion for one letter, and lends you a tile of it above your hand size. Every word set without that letter is spiked.',
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
    desc: 'Receives each word in whatever temper the day allows — ×0.2 on the worst of them, ×0.95 at best — rolled openly before you compose. Spend your finest words on the better moods.',
    setup: data => rollMood(data),
    demand: data => `The current temper: ×${data.mood} Mult.`,
    mood: data => data.mood,
    onPrinted: data => rollMood(data),
  },
  {
    id: 'completist', name: 'The Completist', emoji: '🗄️',
    desc: 'Reads everything and throws nothing away: two extra rack tiles, and no discards at all.',
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
export function bossOnPrinted(state, script, letters) {
  if (!state.boss) return;
  const def = bossById(state.boss.id);
  state.boss.data ??= {};
  def?.onPrinted?.(state.boss.data, script, letters);
}

// The Enthusiast's tile, cast as the Deadline is dealt. `castEphemeral` is
// state.js's castEphemeralTile, passed in to keep this module import-free.
// Idempotent via data.gifted, so a reload mid-deal can't double the gift.
export function bossGift(state, castEphemeral) {
  if (!state.boss) return [];
  const def = bossById(state.boss.id);
  const data = (state.boss.data ??= {});
  if (!def?.gift || data.gifted) return [];
  data.gifted = true;
  return [castEphemeral(data.letter)];
}
