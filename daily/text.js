// Every word the Daily Proof shows a player — and there are few on purpose: the
// sorts, the numbers and the slip carry the page, and anything that explains
// itself does so on a hold (or a hover), never in the way. The same rule as
// js/text.js: a `name` may be flavour, a `desc` states the rule and stops.
// Tile features borrow the game's own wording (TRIMS, NICKS, colourDesc in
// js/constants.js), so a sort means the same thing on both pages.

// ─── What the day is ──────────────────────────────────────────────────────────
// The masthead's label: the case's most salient trait (traitsOf in
// daily/deal.js), with every trait it has listed on a tap. Most names are the
// almanac's own, since most of its pages are the traits they deal.
export const TRAIT_TEXT = {
  twoUp:    { name: 'Two-Up',               desc: 'Play two words of at least {0} letters.' },
  choice:   { name: 'A Choice of Patrons',  desc: 'Seat one of two.' },
  patron:   { name: 'A Patron Calls',       desc: 'Seated for every reader.' },
  deadline: { name: 'Deadline',             desc: 'An editor at the desk, with the day’s rule on the card.' },
  hellbox:  { name: 'From the Hellbox',     desc: 'One tile is cast in Hellbox iron.' },
  lean:     { name: 'Lean Matter',          desc: 'Most of the case is plain.' },
  fat:      { name: 'Fat Matter',           desc: 'Most of the case is dressed.' },
  ratchet:  { name: 'The Ratchet',          desc: 'A ratchet on the bench.' },
  loupe:    { name: 'The Loupe',            desc: 'A loupe on the bench.' },
  tube:     { name: 'A Tube of {0}',        desc: 'A tube of {1} paint on the bench.' },   // {0} Crimson, {1} crimson
  oldstock: { name: 'Old Stock',            desc: 'A medieval sort in the case.' },
  tied:     { name: 'Tied Letters',         desc: 'Ligatures in the case.' },
  wetink:   { name: 'Wet Ink',              desc: 'More paint than usual.' },
  silver:   { name: 'The Silversmith Calls', desc: 'More silver trims than usual.' },
  purple:   { name: 'Purple Passage',       desc: 'More purple trims than usual.' },
  blade:    { name: 'A Fresh Blade',        desc: 'More nicks than usual.' },
  double:   { name: 'Double-Struck',        desc: 'More tiles with a second face than usual.' },
  fair:     { name: 'Fair Copy',            desc: 'Nothing out of the ordinary.' },
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
  // No glyph: the bench draws the tube itself, in its paint.
  tube: {
    name: 'Tube of {0}',               // {0} Crimson
    desc: 'Paint one of {2} offered tiles {1}. Tap again to undo.',   // {1} crimson, {2} three
  },
};
export const COUNT_WORDS = ['none', 'one', 'two', 'three', 'four', 'five'];

// ─── The sorts, held ──────────────────────────────────────────────────────────
export const SORT_TEXT = {
  medievalHead: '{0} — reads as {1}.',
  medievalBody: 'Counts as {0}.',              // "two letters", "one or two letters"
  letterCount: ['', 'one', 'two', 'three'],
  cursed: { head: 'Hellbox iron', body: '×{0} Mult. A word set without it loses {1} Points.' },
  ratcheted: 'Stepped from {0}',
  louped: 'Doubled by the loupe',
  painted: 'Painted from the tube',
  wrapped: { head: 'A draft', body: 'Wrapped by The Redactor: it spells, and scores nothing.' },
  locked: { head: 'Locked', body: 'The Turnkey has locked this sort: it can’t be set.' },
};

// ─── The table ────────────────────────────────────────────────────────────────
// A seated patron's rule as it stands in a game of one word. Names and
// portraits are the game's own (PATRON_CARDS, BOSS_CARDS); where the game's card
// says more than one word can use — a Coin, a package, a next word — the rule is
// said again here without it. {0} is filled per day (The Monogrammist's letters).
// The daily's own patrons, who have no card in the game to take a name from.
export const DAILY_CARDS = {
  commoner: { name: 'The Commoner', emoji: '🍺' },
  limner:   { name: 'The Limner', emoji: '🖌️' },   // his card shows the day's letter instead (patronFace in main.js)
  turnkey:  { name: 'The Turnkey', emoji: '🔐' },
  variationist: { name: 'The Elegant Variationist', emoji: '🦢' },
  bookends: { name: 'The Bookends', emoji: '🔖' },
  capitalist: { name: 'The Capitalist', emoji: '🧐' },
};

export const PATRON_TEXT = {
  expectants:    'Baby names count as words, and score +15 Points.',
  haplographer:  'Any doubled letter may be set once: BALOON for BALLOON.',
  bookbinder:    'A V may stand for a W, and an O may repeat any number of times.',
  sexton:        '×3 Mult for spooky words.',
  paramour:      '×3 Mult for romantic words.',
  poppet:        '×3 Mult for cute words.',
  seadog:        '×3 Mult for nautical words.',
  schoolmarm:    '×3 Mult for educational words.',
  vulgarian:     '×3 Mult for rude words.',
  poet:          '×2 Mult for adjectives and adverbs.',
  athlete:       '×2 Mult for verbs.',
  stammerer:     '×2 Mult for words with a double letter (LL, OO…).',
  yodeller:      '×2 Mult for words with at least as many vowels as consonants.',
  apprentice:    'In a 4-letter word, each letter gains +4 Points.',
  jeweller:      'Sorts worth 8+ Points score 50% more.',
  novelist:      '×2 Mult for words of 7+ letters.',
  typesetter:    '+0.2 Mult per ligature or medieval sort.',
  romeo:         '×1.5 Mult for words with amber but no jade.',
  juliet:        '×1.5 Mult for words with jade but no amber.',
  siren:         'Vowels score +2 Points; azure ones +6.',
  firebrand:     '+15 Points for words with 2+ crimson sorts.',
  antiquary:     '×2 Mult for words with a J, Q, X or Z.',
  commoner:      '×2 Mult for the 8,000 commonest English words, plurals and tenses included.',
  sculptor:      '×2 Mult for nouns.',
  cartographer:  '×2 Mult when the word’s vowels (2+) run in alphabetical order, none repeated.',
  herald:        '×2 Mult for words whose first letter appears again.',
  serpent:       'Each S scores +3 Points. ×2 Mult for words ending in S.',
  twins:         'Each double letter (LL, OO…) scores +5 Points, and its second sort copies the first.',
  monogrammist:  'Each {0} prints twice: Points, trim and paint.',
  limner:        '×3 Mult for words beginning with {0}.',
  turnkey:       '×3 Mult. Four sorts in the case are locked.',
  izzard:        'Any Z may be set as an S.',
  shorthair:     '×2 Mult for words containing RAT. A RAT sort joins the case.',
  quoin:         '×2 Mult when two sorts of one colour sit side by side.',
  variationist:  '×2 Mult for words with no repeated letter.',
  bookends:      '×2 Mult when the first and last sorts are both painted.',
  capitalist:    'The first sort prints twice: Points, trim and paint.',
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
  eeeditor:   { rule: 'Use an E.',
                voice: 'E is a good letter. Here: I saved four especially for you, at the front of your case. A word without one is spiked.' },
  redactor:   { rule: '{0} sorts are drafts: they spell, and score nothing.',
                voice: 'This is just the first draft. {0} of your sorts are drafts: they spell, and score nothing.' },
  minimalist: { rule: 'No adjectives or adverbs.',
                voice: 'Adjectives are the enemy of clean modern prose. Adjectives and adverbs are spiked.' },
};
export const SPIKE_TEXT = 'A spiked word scores ×{0}.';

// A two-word day.
export const PAIR_TEXT = {
  rule: 'Play two words of at least {0} letters.',
  short: 'Each word needs {0} letters or more.',
  both: 'Set a second word.',
};

// ─── The board ────────────────────────────────────────────────────────────────
// ─── Definitions (in the results list) ────────────────────────────────────────
export const DEF_TEXT = { name: 'a given name' };

// ─── How to play (in the ❦ menu) ──────────────────────────────────────────────
// The worked example is drawn from real sorts and scored by the scorer, so its
// figures and chips are computed; only the sentence introducing it is fixed.
export const HOWTO = {
  title: 'How to play',
  close: 'Close',
  score: 'A word scores Points × Mult. Points are the figures in the sorts’ corners, added up.',
  mult: 'Mult comes from length (×2 at six letters, +0.5 for each letter after) and from paint. Each colour in the word is a multiplier of its own: one crimson sort is ×2, two are ×3, three ×4. Different colours multiply together.',
  example: 'For example, {0} with two crimson sorts and one azure:',
  sum: '{0} Points × {1} Mult = {2}',
  patrons: 'Some days seat a patron, or offer two to choose between. A patron changes the score in its own way, often with ×Mult for a kind of word, and its card lights up while your word pays. Tap a patron to read its rule.',
  hold: 'Hold a sort to read what its trim or nick does.',
};

export const UI = {
  best: 'Best: {0} · {1}',
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
  share: 'Share result',
  copied: 'Copied',
  next: 'Next ›',
  shareHead: 'Great Work Daily #{0}',
};

export const fill = (s, ...v) => s.replace(/\{(\d)\}/g, (_, i) => v[i] ?? '');
