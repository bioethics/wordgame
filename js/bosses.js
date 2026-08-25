// The Editors — one takes the desk at every Deadline (the third page of each
// chapter). An editor never bans anything and never changes what a tile is
// worth: each warps the SHAPE of the words instead, so whatever rack arrives
// stays playable. A word that breaks the house rule is not refused, it is
// SPIKED: printed and counted at ×SPIKE_MULT (constants.js), and the live
// preview shows the spike coming.
//
// Def shape:
//   id, name, emoji, desc  — desc is the standing rule, in full
//   setup(data, state)     — roll per-page state as the Deadline is dealt
//   demand(data)           — live line for the bar: what the NEXT word must
//                            satisfy. null = static rule, desc says it all.
//   judge(letters, tiles, data, preTotal)
//                          — null if the word passes, else a short reason. Runs
//                            on every keystroke for the preview, so it must be
//                            pure and must not write to `data`. `preTotal` is
//                            the total BEFORE the spike.
//   mood(data)             — ×Mult applied to EVERY word (the Reviewer)
//   onPrinted(data, script, letters)
//                          — advance the editor's memory after a word commits
//   gift: true             — an ephemeral tile of data.letter as the page is
//                            dealt (the Enthusiast)
//   lent: { letter, count }— tiles held IN the hand all page, topped back up as
//                            they print (the Eeeditor)
//   wraps: <share>         — that fraction of the COLLECTION is wrapped for the
//                            page: it spells and nothing else (the Redactor).
//                            Laid and cleared in startPage; read via isWrapped.
//   rackBonus / noDiscards — structural knobs read by state.js
//   eatsSpare: true        — after every word one sort left in the rack is
//                            destroyed for good (the Economiser); main.js
//
// Tuning numbers live here with their editor; SPIKE_MULT is in constants.js
// because scoring and the bar both read it.

import { inTheme, themeRank, themeSize } from './themes.js';
import { BRIBRARIAN, bribeMult } from './constants.js';

// The Columnist's measures. With ten tiles in hand three is always reachable
// and six is a genuine reach. Never the same measure twice running.
const COLUMN_MIN = 3;
const COLUMN_MAX = 6;

const PADDER_MIN   = 5;   // letters a Padded word must reach

// The Redactor's share of the case. A wrapped tile still SPELLS — it fills a
// place, reaches a length multiplier, satisfies whatever shape the page asks —
// and brings nothing of its own, so a third is felt in every word without ever
// stranding a hand. Half reads as a wall rather than a cost.
const REDACTOR_SHARE = 1 / 3;

// The Populist's band: how far down common.txt (~8,000 ranks) a word may sit
// and still count as plain English. Effectively the whole list — a word passes
// if the common reader has met it at all.
//
// It sat at 750 and was brutal, in a way counting playable words hides. A
// solver still found something in 98% of racks, so the band looked fine; what
// it actually did was forbid SCORING. Of the words a rack can make, the share
// that survived: 8.7% at four letters, 1.4% at six, 0.6% at seven or more — and
// a Deadline wants long words. The editor didn't squeeze the rack, it banned
// the top half of it. At the full list those read 42% / 22% / 16%, which is a
// real constraint you can play around instead of a wall.
const POPULIST_BAND = 8000;

// The Obscurantist's bar — the one number here that measurement lies about. A
// solver just reads further down the list and barely notices; a player has to
// *think of* the rarer word, and the words that come to mind first are the
// common ones. Tune it by playing, not by simulating. Both the desc and the
// spike message quote it, so moving it moves the copy.
const OBSCURANTIST_BAND = 500;

// common.txt is fetched, so a Deadline can be dealt before the list lands and
// neither editor may judge until it has. There is no safe fallback: they read
// the same ranking in opposite directions, so an absent list would let one
// spike nothing and the other spike everything.
const commonReady = () => themeSize('common') > 0;
const commonRank  = word => themeRank('common', word);

// The Minimalist reads the adjectives list The Poet is paid from, and declines
// to judge until it lands for the same reason.
const adjectivesReady = () => themeSize('adjectives') > 0;

// The Reviewer's temper: 0.2 to 0.95, in twentieths. Squaring the roll skews
// the days good, so deep sulks stay occasional and the page tax averages ×0.7.
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
    id: 'padder', name: 'The Padder', emoji: '🪶',
    desc: `I pay by the word, so the words had better be long: anything under ${PADDER_MIN} letters is spiked.`,
    judge: letters => letters.length < PADDER_MIN
      ? `too short — ${PADDER_MIN} letters at least` : null,
  },
  {
    id: 'populist', name: 'The Populist', emoji: '📣',
    desc: `Popular fiction is profitable fiction. Every word must be one the common reader knows — anything outside the ${POPULIST_BAND.toLocaleString()} commonest words in English is spiked.`,
    judge: letters => {
      if (!commonReady()) return null;
      const rank = commonRank(letters);
      return rank == null || rank >= POPULIST_BAND
        ? 'too rare — plain English only' : null;
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
    // The one editor who judges what a word MEANS, not what shape it is. He
    // reads the same adjectives.txt The Poet is paid from, so the two are exact
    // opposites (see BOSS_CONFLICTS). That list carries adverbs too, which
    // suits him: the advice he is made of never distinguished them.
    id: 'minimalist', name: 'The Minimalist', emoji: '⬜',
    desc: 'The adjective is the enemy of the noun. Every describing word is spiked.',
    judge: letters => {
      if (!adjectivesReady()) return null;
      return inTheme('adjectives', letters)
        ? 'an adjective — say it plainly or not at all' : null;
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
    // Drawn from the player's own collection, weighted by how many they hold,
    // so it is never a letter the press doesn't carry. Plain sorts only.
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
    // The only editor with nothing to satisfy. He does not read your words; he
    // reads the room. Every word is penalised, and the whole of the lever is
    // money laid down BEFORE the page is set — a blind wager, since you cannot
    // know yet what the hand will give you.
    //
    // He rides mood() rather than judge(), which is exactly right: he is not
    // spiking a word for breaking a rule, he is taking his cut of everything.
    // The readout crosses the figure out either way (script.adjusted).
    //
    // The purse may go into the RED to pay him, and nothing else in the game
    // needs to know: every purchase already refuses a purse that cannot cover
    // it, so a debt simply shuts the Market until it is worked off. That is the
    // real price of a big bribe, and it is paid a page later.
    id: 'bribrarian', name: 'The Bribrarian', emoji: '🤝',
    desc: `Nothing you write will please me, and everything is negotiable. `
        + `A consideration before the page is set — ${BRIBRARIAN.steps} Coins and my pen is `
        + `perfectly kind. Less, and it is less kind. Nothing, and you will see what I mean.`,
    setup: data => { data.paid = 0; },
    demand: data => (data.paid >= BRIBRARIAN.steps
      ? `Paid in full — the pen is kind. ×1 Mult.`
      : `${data.paid} of ${BRIBRARIAN.steps} Coins laid down: every word at ×${bribeMult(data.paid)} Mult.`),
    mood: data => bribeMult(data?.paid ?? 0),
    // No judge: he spikes nothing and pardons nothing. His cut is the whole of him.
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
    // Structural: no rule to break, so nothing it can spike. It takes three of
    // your ten places and fills them with the cheapest letter in the case.
    id: 'eeeditor', name: 'The Eeeditor', emoji: '🅴',
    desc: 'E is a good letter. Here: I saved three especially for you.',
    lent: { letter: 'E', count: 3 },
  },
  {
    // The Eeeditor's rule in a rounder vowel: O costs the same single Point.
    id: 'editooor', name: 'The Editooor', emoji: '🅾️',
    desc: 'O is the shape of a mouth saying oh. Take three, with my compliments.',
    lent: { letter: 'O', count: 3 },
  },
  {
    // Structural: no rule to break, nothing it can spike. A wrapped tile spells
    // and does nothing else — no Points, trim, paint, metal or nick — and
    // nothing can be laid on it while wrapped (isImmutable). The wrapping goes
    // on the COLLECTION, not the hand, which makes it a page-long condition
    // rather than an opening inconvenience: discard a wrapped tile and you draw
    // from a bag that is still a third wrapped. The next startPage clears it
    // (js/state.js), so it can't outlive its Deadline.
    id: 'redactor', name: 'The Redactor', emoji: '📝',
    desc: 'This is a draft, not a book. A third of the case comes back in manuscript: those tiles spell, and nothing more.',
    wraps: REDACTOR_SHARE,
  },
  {
    id: 'completist', name: 'The Hoarder', emoji: '🗄️',
    desc: 'Waste nothing, and you can always find what you need: +2 hand size, but 0 discards.',
    rackBonus: 2,
    noDiscards: true,
  },
  {
    // The only editor whose cost outlives its page: every other rule warps a
    // word and is gone at the page turn, this one melts a sort down for good.
    // Bounded by three things — it takes only from tiles you DIDN'T set, it
    // eats one sort per word, and it goes through trashFromCollection like
    // every other destruction, so the Smelter's floor, the Composter and The
    // Revenant all still apply. It never spikes, so there is no judge here.
    id: 'economiser', name: 'The Economiser', emoji: '🗑️',
    desc: 'Idle type is dead capital. For every word you set, one sort you left in the case goes to the melting pot — for good.',
    eatsSpare: true,
  },
];

export const bossById = id => BOSS_DEFS.find(b => b.id === id);

// ─── Editors an assembled press will never meet ───────────────────────────────
// Listed here when the editor spikes the EXACT words a patron is paid for, so a
// seat you spent Coins on becomes a machine for losing score. The bar is
// deliberately high: exact inversion, the patron's trigger and the editor's
// spike condition being one test read in opposite directions. "Awkward for that
// build" is not enough — that is the game. One entry covers both directions;
// a listed editor never takes the desk while an opposite is seated (assignBoss
// in state.js).
//
// TO ADD A PAIR: one line, editor id → the patron ids it inverts.
export const BOSS_CONFLICTS = {
  // The Poet is paid ×2 for exactly what The Minimalist spikes.
  minimalist: ['poet'],
  // Same common.txt read in opposite directions: The Lexicographer pays ×1.5
  // for words absent from the list, The Populist spikes all but its top.
  populist: ['lexicographer'],
  // The Padder spikes anything under five letters — the whole of what these two
  // are paid for.
  padder: ['abecedarian', 'apprentice'],
};

// Whether this editor inverts any patron currently on the shelf.
export const bossConflicts = (bossId, patronIds) =>
  (BOSS_CONFLICTS[bossId] ?? []).some(id => patronIds.includes(id));

// The seated editor's def, or null. Takes state rather than importing it so
// this module stays leaf-like (state.js imports it for the structural knobs).
export const activeBoss = state => (state.boss ? bossById(state.boss.id) : null);

// Advance the editor's memory after a word commits. `letters` is the word
// without its marks — the same string judge() saw. Verdicts are kept in order
// so the bar can show how the page has gone: once a word is printed its ✓ or ✂
// is otherwise gone from the screen.
export function bossOnPrinted(state, script, letters) {
  if (!state.boss) return;
  const def = bossById(state.boss.id);
  const data = (state.boss.data ??= {});
  (data.verdicts ??= []).push(script.spiked ? 'spiked' : 'passed');
  def?.onPrinted?.(data, script, letters);
}

// Tiles the seated editor puts in your hand, on every refill — as the page is
// dealt, and again after each word prints. `cast` is state.js's castLentTile
// and `held` its lentInHand, passed in to keep this module free of imports from
// state. Returns the tiles created, so they can fly in alongside the draw.
//
// The two shapes differ in when they come back: the gift is once per page, so
// data.gifted latches; lent tiles are a standing supply restored the instant
// one leaves, so this counts what is still in hand.
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
