// ═══ The editors' cards ════════════════════════════════════════════════════════
//
// EVERY editor's name, portrait and house rule — the whole masthead, in one
// table. This is the file to edit to rename an editor or reword the rule they
// announce. Nothing here is code: what the rule DOES lives beside the same id
// in js/bosses.js.
//
//   name   what the Deadline banner and the editor's bar call them
//   emoji  the portrait
//   desc   the standing rule, stated plainly — the same rule as every card's
//          desc (CLAUDE.md, "Card copy"): what is spiked, or what the editor
//          does, and nothing else. It is what the Deadline banner leads with,
//          what the bar shows for an editor with no live line, and what the
//          Janussian Typist's bar quotes for a face he borrows, so it has to be
//          the rule a player can act on at a glance.
//   voice  the editor in their own words — a demand, an excuse, a boast. Said
//          once, under the rule, as the editor takes the desk. The editors are
//          the one part of the game that talks to the player directly; this is
//          where they do it, and where no rule has to be dug out of the talk.
//
// Editors whose demand CHANGES as the page goes carry their bar lines here too
// — these are what the bar actually shows while you compose, so this file is
// the whole of what an editor says, not just the announcement:
//
//   demand       the live line, with the moving part in {BRACES} — the
//                Columnist's {N}, the Serialist's {LAST} — filled fresh on
//                every render by js/bosses.js
//   demandFirst  what the bar says before the first word, where the rule has
//                nothing to point at yet
//   demandPaid   the Bribrarian alone: the line once he is bought outright
//   spike        the short reason stamped on a spiked word ("too short —
//                {PADDER_MIN} letters at least"); editors that never spike
//                have none
//
// A line may carry {KNOBS} in braces, filled by js/bosses.js, so retuning an
// editor retunes what they say. The knobs available here are the game-wide
// ones (KNOBS at the foot of js/constants.js) plus each editor's own tuning,
// which lives with its editor in js/bosses.js:
//
//   {PADDER_MIN}         the shortest word The Padder will accept
//   {POPULIST_BAND}      how far down the frequency list The Populist reads
//   {OBSCURANTIST_BAND}  how far down the list The Obscurantist refuses
//   {BRIBRARIAN_STEPS}   what it costs to buy The Bribrarian outright
//   {BRIBRARIAN_STEP}    what each Coin laid down buys back
//   {BRIBRARIAN_FLOOR}   his pen with nothing paid (the standard spike)
//   {REDACTOR_SHARE}     the share The Redactor wraps, in words: "third"
//   {REVIEWER_WORST}     the sourest temper The Reviewer can be in
//   {REVIEWER_BEST}      the kindest
//   {LENT_COUNT}         places the two lending editors fill
//   {POWDER_CHARGES}     charges The Incendiary keeps in your hand

export const BOSS_CARDS = {
  padder: {
    name: 'The Padder', emoji: '🪶',
    desc: 'Words under {PADDER_MIN} letters are spiked.',
    voice: 'I pay by the word, so the words had better be long.',
    spike: 'too short — {PADDER_MIN} letters at least',
  },
  populist: {
    name: 'The Populist', emoji: '📣',
    desc: 'Words outside the {POPULIST_BAND} commonest in English are spiked.',
    voice: 'Popular fiction is profitable fiction. Every word must be one the common reader knows.',
    spike: 'too rare — plain English only',
  },
  obscurantist: {
    name: 'The Obscurantist', emoji: '🕯️',
    desc: 'The {OBSCURANTIST_BAND} commonest words in English are spiked.',
    voice: 'True literature demands erudition.',
    spike: 'too plain — one of the {OBSCURANTIST_BAND} commonest words',
  },
  minimalist: {
    name: 'The Minimalist', emoji: '⬜',
    desc: 'Adjectives and adverbs are spiked.',
    voice: 'Adjectives are the enemy of clean modern prose.',
    spike: 'an adjective — say it plainly or not at all',
  },
  columnist: {
    name: 'The Columnist', emoji: '📰',
    desc: 'Each word must be exactly the length the bar names, or it is spiked. The length changes after every word.',
    voice: 'Everything must fit the column; I will tell you how many letters to use.',
    demand: 'This word: exactly {N} letters.',
    spike: 'off the measure — exactly {N} letters',
  },
  serialist: {
    name: 'The Serialist', emoji: '🔗',
    desc: 'Each word must begin with the letter the previous word ended on, or it is spiked.',
    voice: 'We need continuity.',
    demand: 'This word must open with {LAST}.',
    demandFirst: 'The first word is free — but mind how it ends.',
    spike: 'a broken chain — it must open with {LAST}',
  },
  indexer: {
    name: 'The Indexer', emoji: '🗂️',
    desc: 'Each word must come after the previous one in alphabetical order, or it is spiked.',
    voice: 'Order above all else.',
    demand: 'This word must sort after {LAST}.',
    demandFirst: 'The first word may be anything — the index begins there.',
    spike: 'out of order — it must sort after {LAST}',
  },
  escalationist: {
    name: 'The Escalationist', emoji: '📈',
    desc: 'Each word must outscore the one before it, or it is spiked.',
    voice: 'Build to a climax.',
    demand: 'This word must beat {BAR}.',
    demandFirst: 'The first word sets the bar. Open softly.',
    spike: 'no climax — it had to beat {BAR}',
  },
  enthusiast: {
    name: '#1 Specific Letter Enthusiast', emoji: '🤩',
    desc: 'Every word must contain one letter, named on the bar, or it is spiked. You are lent a tile of it for the page, above your hand size.',
    voice: 'I really love one specific letter. I will gift you a temporary copy.',
    demand: 'Every word must contain {LETTER}.',
    spike: 'no {LETTER} — the Enthusiast is crushed',
  },
  bribrarian: {
    name: 'The Bribrarian', emoji: '🤝',
    desc: 'Every word is scored at ×{BRIBRARIAN_FLOOR} Mult. Each Coin paid before the page raises that by {BRIBRARIAN_STEP}; {BRIBRARIAN_STEPS} Coins restore ×1.',
    voice: 'I will spike every word you write. Though if this makes you unhappy, perhaps we could come to an arrangement...',
    demand: '{PAID} of {BRIBRARIAN_STEPS} Coins laid down: every word at ×{MULT} Mult.',
    demandPaid: 'Paid in full — the pen is kind. ×1 Mult.',
  },
  epitaphist: {
    name: 'The Epitaphist', emoji: '⚱️',
    desc: 'One word for the whole page. The quota is halved, and you have one extra discard.',
    voice: 'You have one word, and a bonus discard to help you assemble it. Find a good one.',
  },
  reviewer: {
    name: 'Peer Reviewer #2', emoji: '🧐',
    desc: 'Every word is scored at a Mult between ×{REVIEWER_WORST} and ×{REVIEWER_BEST}, drawn again before each word and shown on the bar.',
    voice: 'Your best work is never good enough.',
    demand: 'The current temper: ×{MOOD} Mult.',
  },
  eeeditor: {
    name: 'The Eeeditor', emoji: '🅴',
    desc: '{LENT_COUNT} places in your hand hold lent E’s all page. They cannot be discarded, and each one printed is replaced.',
    voice: 'E is a good letter. Here: I saved {LENT_COUNT} especially for you.',
  },
  editooor: {
    name: 'The Editooor', emoji: '🅾️',
    desc: '{LENT_COUNT} places in your hand hold lent O’s all page. They cannot be discarded, and each one printed is replaced.',
    voice: 'O is such a sensual, sophisticated letter. Take {LENT_COUNT}, with my compliments.',
  },
  powdereditor: {
    name: 'The Incendiary', emoji: '💣',
    desc: '{POWDER_CHARGES} places in your hand hold lent charges in squib lead, each with two faces, replaced as they are spent. Every word must carry one of them, or it is spiked.',
    voice: 'Nothing sells like an explosive piece.',
    spike: 'no charge of mine in it',
  },
  redactor: {
    name: 'The Redactor', emoji: '📝',
    desc: 'A {REDACTOR_SHARE} of your tiles are wrapped for the page: each still spells its letter, and does nothing else.',
    voice: 'This is just the first draft.',
  },
  completist: {
    name: 'The Hoarder', emoji: '🗄️',
    desc: '+2 hand size, and no discards.',
    voice: 'Waste nothing, and you can always find what you need.',
  },
  economiser: {
    name: 'The Economiser', emoji: '🗑️',
    desc: 'After each word, one tile left in your hand is destroyed for good.',
    voice: 'Efficiency! Whatever you did not use, clearly you do not need.',
  },
  janussian: {
    name: 'The Janussian Typist', emoji: '\ud83c\udfad',
    desc: 'Each word is judged by another editor’s rule, drawn before the word and named on the bar.',
    voice: 'I contain multitudes. Multitudes of editors. I like to wear their faces.',
    demand: 'Wearing {FACE} — {LINE}',
  },
};
