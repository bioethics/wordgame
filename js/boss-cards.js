// ═══ The editors' cards ════════════════════════════════════════════════════════
//
// EVERY editor's name, portrait and house rule — the whole masthead, in one
// table. This is the file to edit to rename an editor or reword the rule they
// announce. Nothing here is code: what the rule DOES lives beside the same id
// in js/bosses.js.
//
//   name   what the Deadline banner and the editor's bar call them
//   emoji  the portrait
//   desc   the standing rule, IN THE EDITOR'S OWN VOICE. They are the one part
//          of the game that talks to the player directly, so write them as
//          speech — a demand, an excuse, a boast — not as a rules note. Say what
//          is spiked, and say it in a sentence they would actually say.
//
// A desc may carry {KNOBS} in braces, filled by js/bosses.js as it loads, so
// retuning an editor retunes what they say. The knobs available here are the
// game-wide ones (KNOBS at the foot of js/constants.js) plus each editor's own
// tuning, which lives with its editor in js/bosses.js:
//
//   {PADDER_MIN}         the shortest word The Padder will accept
//   {POPULIST_BAND}      how far down the frequency list The Populist reads
//   {OBSCURANTIST_BAND}  how far down the list The Obscurantist refuses
//   {BRIBRARIAN_STEPS}   what it costs to buy The Bribrarian outright

export const BOSS_CARDS = {
  padder: {
    name: 'The Padder', emoji: '🪶',
    desc: 'I pay by the word, so the words had better be long: anything under {PADDER_MIN} letters is spiked.',
  },
  populist: {
    name: 'The Populist', emoji: '📣',
    desc: 'Popular fiction is profitable fiction. Every word must be one the common reader knows — anything outside the {POPULIST_BAND} commonest words in English is spiked.',
  },
  obscurantist: {
    name: 'The Obscurantist', emoji: '🕯️',
    desc: 'True literature demands erudition: the {OBSCURANTIST_BAND} commonest words in English are spiked.',
  },
  minimalist: {
    name: 'The Minimalist', emoji: '⬜',
    desc: 'The adjective is the enemy of the noun. Every describing word is spiked.',
  },
  columnist: {
    name: 'The Columnist', emoji: '📰',
    desc: 'Everything must fit the column: each word to an exact measure, re-set after every print. Off-measure words are spiked.',
  },
  serialist: {
    name: 'The Serialist', emoji: '🔗',
    desc: 'We need continuity. Each word must open with the letter the one before ended on, or be spiked.',
  },
  indexer: {
    name: 'The Indexer', emoji: '🗂️',
    desc: 'Order above all else: each word must alphabetically follow the prior word, or be spiked.',
  },
  escalationist: {
    name: 'The Escalationist', emoji: '📈',
    desc: 'Build to a climax: every word must outscore the one before it, or be spiked.',
  },
  enthusiast: {
    name: 'The Enthusiast', emoji: '🤩',
    desc: 'I really love specific letters! Every word set without my current favourite is spiked.',
  },
  bribrarian: {
    name: 'The Bribrarian', emoji: '🤝',
    desc: 'Nothing you write will please me, and everything is negotiable. A consideration before the page is set — {BRIBRARIAN_STEPS} Coins and my pen is perfectly kind. Less, and it is less kind. Nothing, and you will see what I mean.',
  },
  epitaphist: {
    name: 'The Epitaphist', emoji: '⚱️',
    desc: 'One line, and it must last. You have a single word for this page — half the quota to meet with it, and a discard more to find it.',
  },
  reviewer: {
    name: 'The Reviewer', emoji: '🧐',
    desc: 'Your best work is still not good enough. (A random negative multiplier is applied to each word.)',
  },
  eeeditor: {
    name: 'The Eeeditor', emoji: '🅴',
    desc: 'E is a good letter. Here: I saved three especially for you.',
  },
  editooor: {
    name: 'The Editooor', emoji: '🅾️',
    desc: 'O is the shape of a mouth saying oh. Take three, with my compliments.',
  },
  redactor: {
    name: 'The Redactor', emoji: '📝',
    desc: 'This is a draft, not a book. A third of the case comes back in manuscript: those tiles spell, and nothing more.',
  },
  completist: {
    name: 'The Hoarder', emoji: '🗄️',
    desc: 'Waste nothing, and you can always find what you need: +2 hand size, but 0 discards.',
  },
  economiser: {
    name: 'The Economiser', emoji: '🗑️',
    desc: 'Idle type is dead capital. For every word you set, one sort you left in the case goes to the melting pot — for good.',
  },
  janussian: {
    name: 'The Janussian Typist', emoji: '\ud83c\udfad',
    desc: 'I contain a whole masthead. Every word is read by a different editor — whose face I am wearing is on the bar before you set it.',
  },
};
