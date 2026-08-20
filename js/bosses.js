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
//   lent: { letter, count }    — tiles held IN the hand for the whole page,
//                                topped back up as they print (the Eeeditor).
//   wraps: <share>             — that fraction of the COLLECTION is wrapped in
//                                manuscript for the page: it still spells and
//                                nothing else (the Redactor). Laid and cleared
//                                in startPage; read through isWrapped.
//   rackBonus / noDiscards     — structural knobs read by state.js.
//   eatsSpare: true            — after every word, one sort left in the rack
//                                is destroyed for good (the Economiser). Read
//                                by main.js at commit, where the rack and the
//                                animation both are.
//
// Tuning numbers live here with their editor, patron-style; SPIKE_MULT lives
// in constants.js because scoring and the bar both read it.

import { inTheme, themeRank, themeSize } from './themes.js';

// The Columnist's measures. Ten tiles in hand: three is always reachable,
// six is a genuine reach. Never the same measure twice running.
const COLUMN_MIN = 3;
const COLUMN_MAX = 6;

const PADDER_MIN   = 5;   // letters a Padded word must reach

// The Redactor's share of the case sent back in manuscript. A third of ten is
// three dead tiles in a hand — felt in every word without ever stranding one,
// since a wrapped tile still SPELLS: it fills a place in the word, reaches a
// length multiplier, and satisfies whatever shape the page asks for. It simply
// brings nothing of its own. Half was tried on paper and reads as a wall
// rather than a cost, which is not what this roster is for.
const REDACTOR_SHARE = 1 / 3;

// The Populist's band: how far down the frequency list a word may sit and
// still count as plain English. wordlists-themed/common.txt carries some 8,000
// ranks, so this can be widened to soften the editor without new data.
//
// Measured against 1,500 random racks: at 500 the best legal word was worth a
// mean 8.0 Points where an unconstrained rack manages 14.0 — the steepest
// squeeze of any editor then measured — and yet 99.2% of racks
// could satisfy it, because the band includes A, IT, IS and their kin. That is
// the shape this roster wants: a hard ask that never bricks, with a cheap
// sacrificial word always available to whoever needs one. 750 keeps that shape
// and gives back a little of the squeeze: the band is the first three quarters
// of the thousand words a reader meets everywhere, and it now sits clear of the
// Obscurantist's 500, so the two editors read the same list at three settings
// rather than at each other's edge.
const POPULIST_BAND = 750;

// The Obscurantist's bar — and the one number here that measurement lies
// about. Enumerate the whole dictionary and barring the commonest 1,000 words
// costs a solver almost nothing: it simply reads further down the list, losing
// 2% of its score ceiling. A player has to *think of* the rarer word, and the
// words that come to mind first are exactly the common ones. This editor is
// therefore far harder in the hand than on paper, and it was always the one to
// tune by playing rather than by simulating — which is exactly what happened:
// 1,000 proved punishing in the hand, the band came down to 250, and 250 then
// proved barely felt, because the words a player reaches for first sit inside
// the first few hundred ranks and little else does. 500 is the setting between
// the two. Both the desc and the spike message quote this number, so moving it
// moves the copy.
const OBSCURANTIST_BAND = 500;

// common.txt is fetched, so a Deadline can be dealt before the list lands.
// Neither editor may judge until it has. There is no single safe answer to
// give them while they wait, either — they read the same ranking in opposite
// directions, so an absent list would let one spike nothing and the other
// spike everything. Both ask, and both decline to judge until it is ready.
const commonReady = () => themeSize('common') > 0;
const commonRank  = word => themeRank('common', word);

// The Minimalist reads the same adjectives list The Poet is paid from, and
// declines to judge until it lands for the same reason: an absent list would
// have him spike nothing at all.
const adjectivesReady = () => themeSize('adjectives') > 0;

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
    // The one editor who judges what a word MEANS rather than what shape it
    // is. He reads wordlists-themed/adjectives.txt — the same list The Poet is
    // paid from, so the two are exact opposites at the same desk — and that
    // list carries adverbs beside the adjectives, which suits him exactly: the
    // advice he is made of has never distinguished them.
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
    // The Eeeditor's rule exactly, in a rounder vowel. O is worth the same
    // single Point as E and is very nearly as obliging, so the toll on the
    // hand is the same shape — three of your ten places, filled with something
    // you can always spend but rarely want three of.
    id: 'editooor', name: 'The Editooor', emoji: '🅾️',
    desc: 'O is the shape of a mouth saying oh. Take three, with my compliments.',
    lent: { letter: 'O', count: 3 },
  },
  {
    // Structural, like the Hoarder — no rule to break, so nothing it can
    // spike. Instead a third of the case comes back set in manuscript: the
    // tile is wrapped, a pencilled letter written on the wrapper, and
    // everything the tile WAS is hidden under it for the page. It spells, and
    // that is all it does — no Points, no trim, no paint, no metal, no nick,
    // and nothing can be laid on it while it is wrapped (isImmutable).
    //
    // The wrapping is laid on the COLLECTION, not the hand, which is what
    // makes it a page-long condition rather than an opening inconvenience:
    // discard a wrapped tile and you draw from a bag that is still a third
    // wrapped. It is cleared at the top of the next startPage, so it can
    // never outlive the Deadline that laid it (js/state.js).
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
    // The Hoarder's exact opposite, and the only editor whose cost outlives
    // its page. Every other rule here warps the shape of a word and is gone at
    // the page turn; this one melts a sort down for good. That is a deliberate
    // exception to the roster's own promise, and it is bounded by three
    // things: it takes only from the tiles you DIDN'T set, so the word you
    // just built is never touched; it eats one sort per word, so a page costs
    // at most what its words earn; and it goes through trashFromCollection
    // like every other destruction, which means the Smelter's floor holds it
    // at twelve tiles, the Composter is fed by it, and The Revenant will walk
    // half of what it takes straight back out of the hellbox.
    //
    // It never spikes, so there is no rule to satisfy and no judge here — the
    // toll is the whole editor. The right answer to it is to set longer words:
    // the more of your hand you commit to the page, the less of it is left in
    // the case for the melting pot.
    id: 'economiser', name: 'The Economiser', emoji: '🗑️',
    desc: 'Idle type is dead capital. For every word you set, one sort you left in the case goes to the melting pot — for good.',
    eatsSpare: true,
  },
];

export const bossById = id => BOSS_DEFS.find(b => b.id === id);

// ─── Editors an assembled press will never meet ───────────────────────────────
// A Deadline is meant to be a puzzle, not a punishment for what you bought.
// Most editors merely make a patron idle for a page, which is a fair cost of
// the roster being a lottery. These pairs are worse than idle: the editor
// spikes the EXACT words the patron is paid for, so a seat you spent Coins on
// becomes a machine for losing four-fifths of your score. Buying The Poet
// should never mean dreading a Deadline.
//
// The bar for entry here is deliberately high — exact inversion, where the
// patron's trigger and the editor's spike condition are the same test read in
// opposite directions. "This editor happens to be awkward for that build" is
// not enough; that is the game. Both directions are covered by one entry, and
// an editor listed here simply never takes the desk while any of its opposites
// is seated (assignBoss in state.js).
//
// TO ADD A PAIR: one line, editor id → the patron ids it inverts.
export const BOSS_CONFLICTS = {
  // Adjectives: The Poet is paid ×2 for exactly what The Minimalist spikes.
  minimalist: ['poet'],
  // Frequency, read in opposite directions off the same common.txt: The
  // Lexicographer pays ×1.5 for words absent from the list, The Populist
  // spikes everything that isn't near the top of it.
  populist: ['lexicographer'],
  // Length: The Padder spikes anything under five letters, which is the whole
  // of what these two are paid for.
  padder: ['abecedarian', 'apprentice'],
};

// Whether this editor inverts any patron currently on the shelf.
export const bossConflicts = (bossId, patronIds) =>
  (BOSS_CONFLICTS[bossId] ?? []).some(id => patronIds.includes(id));

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
