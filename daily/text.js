// Every word the Daily Proof shows a player — and there are few on purpose: the
// sorts, the numbers and the slip carry the page, and anything that explains
// itself does so on a hold (or a hover), never in the way. The same rule as
// js/text.js: a `name` may be flavour, a `desc` states the rule and stops.
// Tile features borrow the game's own wording (TRIMS, NICKS, colourDesc in
// js/constants.js), so a sort means the same thing on both pages.

// ─── The almanac ──────────────────────────────────────────────────────────────
// One per challenge, drawn before the tiles (OMENS in daily/deal.js). The name
// is all the page shows; a tap reads the desc.
export const OMEN_TEXT = {
  fair:       { name: 'Fair Copy',             desc: 'Ordinary odds.' },
  wetink:     { name: 'Wet Ink',               desc: 'More paint than usual.' },
  silver:     { name: 'The Silversmith Calls', desc: 'More silver trims than usual.' },
  blade:      { name: 'A Fresh Blade',         desc: 'More nicks than usual.' },
  purple:     { name: 'Purple Passage',        desc: 'More purple trims than usual.' },
  double:     { name: 'Double-Struck',         desc: 'More tiles with a second face than usual.' },
  tied:       { name: 'Tied Letters',          desc: 'Three tiles are ligatures.' },
  oldstock:   { name: 'Old Stock',             desc: 'Two tiles are medieval sorts.' },
  hellbox:    { name: 'From the Hellbox',      desc: 'One tile is cast in Hellbox iron.' },
  fat:        { name: 'Fat Matter',            desc: 'Far more features than usual.' },
  lean:       { name: 'Lean Matter',           desc: 'Far fewer features than usual.' },
  toolchest:  { name: 'The Tool Chest',        desc: 'A tool is on the bench.' },
};

// ─── The tools ────────────────────────────────────────────────────────────────
// The bench shows the glyph; the name and desc are on hold or hover.
export const TOOL_TEXT = {
  ratchet: {
    name: 'Ratchet', glyph: '🔧',
    desc: 'Step a letter one place either way. Tap again to undo.',
    on: '{0} to {1}',                  // the choice's accessible name: {0} from, {1} to
  },
  loupe: {
    name: 'Loupe', glyph: '🔍',
    desc: 'Double a tile’s value (max {0}). Tap again to undo.',
  },
};

// ─── The sorts, held ──────────────────────────────────────────────────────────
export const SORT_TEXT = {
  medievalHead: '{0} — reads as {1}',
  medievalBody: 'Counts as {0} everywhere, length included.',
  cursed: { head: 'Hellbox iron', body: '×{0} Mult. A word set without it loses {1} Points.' },
  ratcheted: 'Stepped from {0}',
  louped: 'Doubled by the loupe',
};

// ─── The table ────────────────────────────────────────────────────────────────
// A seated patron's rule as it stands in a game of one word. Names and
// portraits are the game's own (PATRON_CARDS, BOSS_CARDS); where the game's card
// says more than one word can use — a Coin, a package, a next word — the rule is
// said again here without it. {0} is filled per day (The Monogrammist's letters).
export const PATRON_TEXT = {
  sexton:        '×3 Mult for words on the spooky list — thousands of them.',
  paramour:      '×3 Mult for words on the romantic list — thousands of them.',
  poppet:        '×3 Mult for words on the cute list — thousands of them.',
  vulgarian:     '×3 Mult for words on the rude list — thousands of them.',
  poet:          '×2 Mult when the word is an adjective or an adverb.',
  athlete:       '×2 Mult when the word is a verb.',
  sculptor:      '×2 Mult when the word is a noun.',
  cartographer:  '×2 Mult for words whose vowels run in alphabetical order. A repeated vowel breaks the run.',
  herald:        '×2 Mult for words that start and end with the same letter.',
  serpent:       'Every S is worth +3 Points. A word ending in S gets ×2 Mult.',
  twins:         'Every doubled letter (LL, OO…) pays +5 Points, and the second tile takes every feature of the first.',
  monogrammist:  'A tile showing {0} prints twice — Points, trim and paint alike.',
  counterfeiter: 'A blank joins the case: any letter, worth 0.',
};

// The editor at the desk. `rule` is the line the desk shows all day, filled
// from what the day rolled ({0}); `voice` is what the editor says on a tap,
// in their own voice as at a Deadline (BOSS_CARDS in js/boss-cards.js).
export const EDITOR_TEXT = {
  columnist:  { rule: 'Exactly {0} letters.',
                voice: 'Everything must fit the column, and today the column is {0} letters. Off-measure words are spiked.' },
  serialist:  { rule: 'Open with {0}.',
                voice: 'We need continuity. Every word opens with {0}, or it is spiked.' },
  enthusiast: { rule: 'Use a {0}.',
                voice: 'I really love {0}. Here is a copy of it — but a word without one is spiked.' },
  populist:   { rule: 'Common words only.',
                voice: 'Popular fiction is profitable fiction. Anything outside the 8,000 commonest words in English is spiked.' },
  minimalist: { rule: 'No adjectives or adverbs.',
                voice: 'Adjectives are the enemy of clean modern prose. Adjectives and adverbs are spiked.' },
};
export const SPIKE_TEXT = 'A spiked word scores ×{0}.';

// A two-word day.
export const PAIR_TEXT = {
  rule: 'Two words, {0} letters or more each. Their scores are added.',
  short: 'Each word needs {0} letters or more.',
  both: 'Set a second word.',
};

// ─── The board ────────────────────────────────────────────────────────────────
export const UI = {
  number: '№ {0}',
  flipTo: 'Flip to {0}',
  letters: '{0} letters',
  inWord: 'Pays {0} in this word',
  inWordParts: '{0} + {1} from its nick',
  notAWord: 'Not in the dictionary.',
  notWords: '{0} is not in the dictionary.',
  blankPick: 'Set the blank as…',
  blankChange: 'Change the letter',
  blankHead: 'Counterfeit blank',
  blankBody: 'Any letter. Scores 0.',
  lentHead: 'Lent by the editor',
  waiting: 'Counting the field…',
  dictFallback: 'The word list could not be loaded.',
};

// ─── The slip ─────────────────────────────────────────────────────────────────
export const RESULT = {
  best: 'Best in the case',
  top: 'Top {0}%',
  bottom: 'Bottom {0}%',
  place: '#{0} of {1}',
  placePairs: '#{0} of {1} pairs',
  share: 'Copy',
  copied: 'Copied',
  again: 'Again',
  next: 'Next ›',
  shareHead: 'Great Work · Daily Proof № {0}',
};

export const fill = (s, ...v) => s.replace(/\{(\d)\}/g, (_, i) => v[i] ?? '');
