// The Editors — one takes the desk at every Deadline (the third page of each
// chapter). An editor never bans anything and never changes what a tile is
// worth: each warps the SHAPE of the words instead, so whatever rack arrives
// stays playable. A word that breaks the house rule is not refused, it is
// SPIKED: printed and counted at ×SPIKE_MULT (constants.js), and the live
// preview shows the spike coming.
//
// THIS FILE IS BEHAVIOUR ONLY. An editor's name, portrait and the rule in their
// own voice live against the same id in js/boss-cards.js — edit there to rename
// one or reword what they say. The two halves are married just past the end of
// the BOSS_BEHAVIOURS array below, exactly as patrons and their calling cards
// are. Each editor's own tuning numbers stay here, with the editor, and are
// quotable from its card as {KNOBS}.
//
// Def shape:
//   id                     — and, from the card, name, emoji and desc
//   setup(data, state)     — roll per-page state as the Deadline is dealt
//   demand(data)           — live line for the bar: what the NEXT word must
//                            satisfy. null = static rule, desc says it all.
//   judge(letters, tiles, data, preTotal)
//                          — null if the word passes, else a short reason. Runs
//                            on every keystroke for the preview, so it must be
//                            pure and must not write to `data`. `preTotal` is
//                            the total BEFORE the spike.
//   mood(data)             — ×Mult applied to EVERY word (the Reviewer)
//   onPrinted(data, script, letters, state)
//                          — advance the editor's memory after a word commits
//   gift: true             — an ephemeral tile of data.letter as the page is
//                            dealt (the Enthusiast)
//   lent: { letter, count }— tiles held IN the hand all page, topped back up as
//                            they print (the Eeeditor). May instead be a
//                            function of data, for an editor that lends only
//                            some of the time (the Janussian Typist).
//   wraps: <share>         — that fraction of the COLLECTION is wrapped for the
//                            page: it spells and nothing else (the Redactor).
//                            Laid and cleared in startPage; read via isWrapped.
//   rackBonus / noDiscards — structural knobs read by state.js
//   eatsSpare: true        — after every word one sort left in the rack is
//                            destroyed for good (the Economiser); main.js.
//                            May be a function of data, as `lent` may.
//
// Tuning numbers live here with their editor; SPIKE_MULT is in constants.js
// because scoring and the bar both read it.

import { inTheme, themeRank, themeSize } from './themes.js';
import { BRIBRARIAN, bribeMult, KNOBS } from './constants.js';
import { BOSS_CARDS } from './boss-cards.js';
import { fillKnobs } from './text.js';

// The Columnist's measures. With ten tiles in hand three is always reachable
// and six is a genuine reach. Never the same measure twice running.
const COLUMN_MIN = 3;
const COLUMN_MAX = 6;

const PADDER_MIN   = 5;   // letters a Padded word must reach
// Places the two lending editors fill, and keep filled as their tiles print.
// Both cards quote it as {LENT_COUNT}, so one number moves all four.
const LENT_COUNT   = 3;

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

// The Reviewer's temper, in twentieths. Squaring the roll skews the days good,
// so deep sulks stay occasional and the page tax averages ×0.7. His card quotes
// both ends through {REVIEWER_WORST} and {REVIEWER_BEST}, so moving either end
// moves what he says he'll do.
const MOOD_RANGE = { worst: 0.2, best: 0.95 };

// "half" / "third" / "quarter" for the shares that have a name in English, and
// "1 tile in 7" for the ones that don't, so a card never reads "a 7th".
const SHARE_WORDS = { 2: 'half', 3: 'third', 4: 'quarter', 5: 'fifth' };
const shareInWords = share => {
  const d = Math.round(1 / share);
  return SHARE_WORDS[d] ?? `1 tile in ${d}`;
};
function rollMood(data) {
  const r = Math.random();
  const spread = MOOD_RANGE.best - MOOD_RANGE.worst;
  data.mood = Math.round((MOOD_RANGE.best - spread * r * r) * 20) / 20;
}

function rollColumn(data) {
  let n;
  do { n = COLUMN_MIN + Math.floor(Math.random() * (COLUMN_MAX - COLUMN_MIN + 1)); }
  while (n === data.required);
  data.required = n;
}

const BOSS_BEHAVIOURS = [
  {
    id: 'padder',
    judge: letters => letters.length < PADDER_MIN
      ? `too short — ${PADDER_MIN} letters at least` : null,
  },
  {
    id: 'populist',
    judge: letters => {
      if (!commonReady()) return null;
      const rank = commonRank(letters);
      return rank == null || rank >= POPULIST_BAND
        ? 'too rare — plain English only' : null;
    },
  },
  {
    id: 'obscurantist',
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
    id: 'minimalist',
    judge: letters => {
      if (!adjectivesReady()) return null;
      return inTheme('adjectives', letters)
        ? 'an adjective — say it plainly or not at all' : null;
    },
  },
  {
    id: 'columnist',
    setup: data => rollColumn(data),
    demand: data => `This word: exactly ${data.required} letters.`,
    judge: (letters, tiles, data) => letters.length !== data.required
      ? `off the measure — exactly ${data.required} letters` : null,
    onPrinted: data => rollColumn(data),
  },
  {
    id: 'serialist',
    demand: data => data.last
      ? `This word must open with ${data.last}.`
      : 'The first word is free — but mind how it ends.',
    judge: (letters, tiles, data) => data.last && letters[0] !== data.last
      ? `a broken chain — it must open with ${data.last}` : null,
    onPrinted: (data, script, letters) => { data.last = letters[letters.length - 1]; },
  },
  {
    id: 'indexer',
    demand: data => data.last
      ? `This word must sort after ${data.last}.`
      : 'The first word may be anything — the index begins there.',
    judge: (letters, tiles, data) => data.last && letters <= data.last
      ? `out of order — it must sort after ${data.last}` : null,
    onPrinted: (data, script, letters) => { data.last = letters; },
  },
  {
    id: 'escalationist',
    demand: data => data.bar != null
      ? `This word must beat ${data.bar.toLocaleString()}.`
      : 'The first word sets the bar. Open softly.',
    judge: (letters, tiles, data, preTotal) => data.bar != null && preTotal <= data.bar
      ? `no climax — it had to beat ${data.bar.toLocaleString()}` : null,
    onPrinted: (data, script) => { data.bar = script.total; },
  },
  {
    id: 'enthusiast',
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
    id: 'bribrarian',
    setup: data => { data.paid = 0; },
    demand: data => (data.paid >= BRIBRARIAN.steps
      ? `Paid in full — the pen is kind. ×1 Mult.`
      : `${data.paid} of ${BRIBRARIAN.steps} Coins laid down: every word at ×${bribeMult(data.paid)} Mult.`),
    mood: data => bribeMult(data?.paid ?? 0),
    // No judge: he spikes nothing and pardons nothing. His cut is the whole of him.
  },
  {
    // One line, and it must last. Where every other editor warps the shape of
    // the words, this one takes the PAGE apart: a single word to meet the whole
    // quota. The quota is halved and a discard added to make that a puzzle
    // rather than a wall — you are not composing a word any more, you are
    // assembling one, and every discard is spent looking for the pieces.
    //
    // He is on the Astronomer's conflict list: a seat paid per word already
    // printed this page is paid nothing at all on a page of one.
    id: 'epitaphist',
    words: 1,
    discardBonus: 1,
    quotaMult: 0.5,
    // Nothing to break: the page itself is the rule.
  },
  {
    id: 'reviewer',
    setup: data => rollMood(data),
    demand: data => `The current temper: ×${data.mood} Mult.`,
    mood: data => data.mood,
    onPrinted: data => rollMood(data),
  },
  {
    // Structural: no rule to break, so nothing it can spike. It takes LENT_COUNT
    // of your ten places and fills them with the cheapest letter in the case.
    id: 'eeeditor',
    lent: { letter: 'E', count: LENT_COUNT },
  },
  {
    // The Eeeditor's rule in a rounder vowel: O costs the same single Point.
    id: 'editooor',
    lent: { letter: 'O', count: LENT_COUNT },
  },
  {
    // Structural: no rule to break, nothing it can spike. A wrapped tile spells
    // and does nothing else — no Points, trim, paint, metal or nick — and
    // nothing can be laid on it while wrapped (isImmutable). The wrapping goes
    // on the COLLECTION, not the hand, which makes it a page-long condition
    // rather than an opening inconvenience: discard a wrapped tile and you draw
    // from a bag that is still a third wrapped. The next startPage clears it
    // (js/state.js), so it can't outlive its Deadline.
    id: 'redactor',
    wraps: REDACTOR_SHARE,
  },
  {
    id: 'completist',
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
    id: 'economiser',
    eatsSpare: true,
  },
  {
    // Every word, another editor's face. Only the borrowable ones: a judge() is
    // by construction a per-word test — pure, handed the word, run on every
    // keystroke — where every other hook rebuilds the PAGE and physically
    // cannot change between words. So the lent tiles, the wrapped case, the
    // hand size, the halved quota and the Bribrarian's standing cut are all out;
    // what is left is nine rules that can be asked of one word and answered by
    // it. See JANUS_FACES.
    //
    // The face is rolled BEFORE the word, never after, and the bar names it —
    // an editor you cannot see coming is a gotcha, not a rule.
    //
    // He is deliberately NOT on the conflict list. The bar there is a whole page
    // of exact inversion turning a bought seat into a machine for losing score;
    // one word in nine wearing the Minimalist's face is just awkward for that
    // build, and that is the game.
    id: 'janussian',
    setup: (data, state) => { rollFace(data, state); },
    // Worn faces that do something other than judge. Each reads the same data
    // the face's owner would, and is inert while any other face is on.
    mood: data => (data?.face === 'reviewer' ? data.mood : 1),
    lent: data => (JANUS_LENT[data?.face]
      ? { letter: JANUS_LENT[data.face], count: 3, lender: JANUS_LENDER }
      : null),
    // Read AFTER the word commits (editorEats in main.js runs past
    // bossOnPrinted, which has already turned the face over), so this asks what
    // was worn for the word just set — not what is waiting for the next one.
    eatsSpare: data => data?.wore === 'economiser',
    demand: (data) => {
      const face = faceOf(data);
      if (!face) return null;
      const line = face.demand?.(faceView(data)) ?? face.desc;
      return `Wearing ${face.name} \u2014 ${line}`;
    },
    judge: (letters, tiles, data, preTotal) =>
      faceOf(data)?.judge?.(letters, tiles, faceView(data), preTotal) ?? null,
    // Every memory is kept, whichever face was worn, so a face that reads the
    // page's history always has one to read. The Serialist wants the last
    // LETTER and the Indexer the last WORD — both call it `last`, so they are
    // held apart here and projected back by faceView.
    onPrinted: (data, script, letters, state) => {
      data.lastLetter = letters[letters.length - 1];
      data.lastWord   = letters;
      data.bar        = script.total;
      data.wore       = data.face;   // whoever judged the word just set
      rollFace(data, state);
    },
  },
];

// ─── The two halves, married ──────────────────────────────────────────────────
// An editor's WORDS live against the same id in js/boss-cards.js — the same
// split as patrons and their calling cards. Both directions are checked as the
// module loads, because the failure is otherwise silent: a behaviour with no
// card puts a nameless editor on the desk, and a card with no behaviour writes a
// rule nothing enforces.
//
// The knobs a card may quote are the game-wide ones plus each editor's own
// tuning, which stays up here with the editor it belongs to.
const BOSS_KNOBS = {
  ...KNOBS,
  PADDER_MIN,
  // A share reads as words, not as a figure — "a third of your tiles", never
  // "a 3rd". Anything without an English name falls back to "1 tile in 5".
  REDACTOR_SHARE:    shareInWords(REDACTOR_SHARE),
  REVIEWER_WORST:    MOOD_RANGE.worst,
  REVIEWER_BEST:     MOOD_RANGE.best,
  LENT_COUNT:        LENT_COUNT,
  POPULIST_BAND:     POPULIST_BAND.toLocaleString(),
  OBSCURANTIST_BAND: OBSCURANTIST_BAND.toLocaleString(),
  BRIBRARIAN_STEPS:  BRIBRARIAN.steps,
};

export const BOSS_DEFS = BOSS_BEHAVIOURS.map(behaviour => {
  const card = BOSS_CARDS[behaviour.id];
  if (!card) throw new Error(`bosses: '${behaviour.id}' has no card in js/boss-cards.js`);
  return {
    ...behaviour,
    name:  card.name,
    emoji: card.emoji,
    desc:  fillKnobs(card.desc, BOSS_KNOBS, `boss-cards: ${behaviour.id}`),
  };
});

{
  const seated = new Set(BOSS_BEHAVIOURS.map(b => b.id));
  const orphan = Object.keys(BOSS_CARDS).filter(id => !seated.has(id));
  if (orphan.length) throw new Error(`boss-cards: no behaviour for ${orphan.join(', ')} in js/bosses.js`);
}


// The editors the Typist can wear. Everything here has a judge(); nothing here
// needs the page rebuilt around it.
// Nine judge the word; four do something to it or around it instead. The line
// is not "has a judge()" — that was the easy read, and wrong. It is whether the
// rule can be asked of ONE word: the Reviewer's temper is rolled per word
// already, the Economiser eats a sort per word already, and the lending pair
// hand tiles over on the same per-word refill every editor uses. What is left
// out is genuinely page-shaped — see JANUS_UNWEARABLE.
export const JANUS_FACES = [
  'padder', 'populist', 'obscurantist', 'minimalist', 'columnist',
  'serialist', 'indexer', 'escalationist', 'enthusiast',
  'reviewer', 'eeeditor', 'editooor', 'economiser',
];

// Why the rest stay off, written down so the next person does not have to
// re-derive it: the Epitaphist IS the page (one word, half the quota) and
// cannot be one word of several; the Redactor and the Hoarder rebuild the case
// and the hand as the page is dealt; the Bribrarian's whole lever is a wager
// laid down BEFORE the page, and a mid-page till would be a different editor.
export const JANUS_UNWEARABLE = ['epitaphist', 'redactor', 'completist', 'bribrarian'];

// What the Typist lends, and who is lending it — marked so his loans can be
// swept when the face changes. A loan belongs to the word it was made for.
const JANUS_LENT = { eeeditor: 'E', editooor: 'O' };
const JANUS_LENDER = 'janussian';

const faceOf = data => (data?.face ? BOSS_DEFS.find(b => b.id === data.face) : null);

// The shape the worn face expects, built fresh each call so judge() stays pure.
// `last` is the one key two faces claim for different things.
const faceView = data => ({
  required: data.required,
  mood:     data.mood,
  letter:   data.letter,
  bar:      data.bar,
  last:     data.face === 'indexer' ? data.lastWord : data.lastLetter,
});

// A new face, never the same one twice running, with whatever that face needs
// rolled alongside it — the Columnist's measure, the Enthusiast's letter.
function rollFace(data, state) {
  const pool = JANUS_FACES.filter(id => id !== data.face);
  data.face = pool[Math.floor(Math.random() * pool.length)];
  if (data.face === 'columnist') rollColumn(data);
  if (data.face === 'reviewer')  rollMood(data);
  if (data.face === 'enthusiast') {
    const singles = (state?.collection ?? []).filter(t => /^[A-Z]$/.test(t.letter));
    data.letter = singles.length
      ? singles[Math.floor(Math.random() * singles.length)].letter : 'E';
  }
  // A loan belongs to the word it was made for. The lending face's tiles take
  // real places in the hand, so leaving them behind would silently narrow the
  // rack for the rest of the page — and three dead E's under a face that wants
  // a seven-letter word is the whole of the unfairness. Swept from the rack
  // only: one already laid into the word is spoken for.
  // Swept unconditionally, before the refill lends for the new face: a face
  // that lends the OTHER letter would otherwise find three E's already held
  // (lentInHand counts them all) and hand over no O's at all.
  if (state?.rack) state.rack = state.rack.filter(t => t.lender !== JANUS_LENDER);
}

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
  // are paid for. (It was The Abecedarian that sat here until the name moved to
  // the case of sorts; the seat paid for three-letter words is The Child now,
  // and the new Abecedarian cares nothing for how long a word is.)
  padder: ['child', 'apprentice'],
  // A page of one word pays a seat counting the words already printed nothing
  // at all — the Astronomer would sit through the Deadline saying nothing.
  epitaphist: ['astronomer'],
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
  def?.onPrinted?.(data, script, letters, state);
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

  // `lent` may be a standing shape (the Eeeditor's three E's, all page) or a
  // function of the editor's state (the Typist, who lends only while wearing a
  // lending face). Read the same way either way.
  const lent = typeof def?.lent === 'function' ? def.lent(data) : def?.lent;
  if (lent) {
    for (let i = held().length; i < lent.count; i++) {
      made.push(cast(lent.letter, lent.lender ? { lender: lent.lender } : {}));
    }
  }

  return made;
}
