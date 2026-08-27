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
//   {REDACTOR_SHARE}     the share The Redactor wraps, in words: "third"
//   {REVIEWER_WORST}     the sourest temper The Reviewer can be in
//   {REVIEWER_BEST}      the kindest
//   {LENT_COUNT}         places the two lending editors fill

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
    desc: 'Adjectives are the enemy of clean modern prose. Adjectives and adverbs are spiked.',
  },
  columnist: {
    name: 'The Columnist', emoji: '📰',
    desc: 'Everything must fit the column; I will tell you how many letters to use. Off-measure words are spiked.',
  },
  serialist: {
    name: 'The Serialist', emoji: '🔗',
    desc: 'We need continuity. Each word must begin with the letter the previous word ended on, or be spiked.',
  },
  indexer: {
    name: 'The Indexer', emoji: '🗂️',
    desc: 'Order above all else: each word must come after the last one in dictionary order. Any exceptions are spiked.',
  },
  escalationist: {
    name: 'The Escalationist', emoji: '📈',
    desc: 'Build to a climax: every word must outscore the one before it, or be spiked.',
  },
  enthusiast: {
    name: '#1 Specific Letter Enthusiast', emoji: '🤩',
    desc: 'I really love one specific letter. I will gift you a temporary copy, but words that do not use it are spiked.',
  },
  bribrarian: {
    name: 'The Bribrarian', emoji: '🤝',
    desc: 'I will spike every word you write. Though if this makes you unahppy, perhaps we could come to an arrangement...',
  },
  epitaphist: {
    name: 'The Epitaphist', emoji: '⚱️',
    desc: 'You have one word, and a bonus discard to help you assemble it. Find a good one.',
  },
  reviewer: {
    name: 'Peer Reviewer #2', emoji: '🧐',
    desc: 'Your best work is never good enough. Every word is penalised, depending on my mood at that moment — somewhere between ×{REVIEWER_WORST} and ×{REVIEWER_BEST}.',
  },
  eeeditor: {
    name: 'The Eeeditor', emoji: '🅴',
    desc: 'E is a good letter. Here: I saved {LENT_COUNT} especially for you.',
  },
  editooor: {
    name: 'The Editooor', emoji: '🅾️',
    desc: 'O is such a sensual, sophisticated letter. Take {LENT_COUNT}, with my compliments.',
  },
  redactor: {
    name: 'The Redactor', emoji: '📝',
    desc: 'This is just the first draft. A {REDACTOR_SHARE} of your tiles are replaced with draft tiles, which score nothing.',
  },
  completist: {
    name: 'The Hoarder', emoji: '🗄️',
    desc: 'Waste nothing, and you can always find what you need: +2 hand size, but 0 discards.',
  },
  economiser: {
    name: 'The Economiser', emoji: '🗑️',
    desc: 'Efficiency! After each word, I will destroy one tile left unused in your hand; clearly you do not need it.',
  },
  janussian: {
    name: 'The Janussian Typist', emoji: '\ud83c\udfad',
    desc: 'I contain multitudes. Multitudes of editors. I like to wear their faces.',
  },
};
