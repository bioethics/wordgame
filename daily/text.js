// Every word the Daily Proof shows a player. The same rule as js/text.js: a
// `name` may be flavour, a `desc` states the rule and stops. Tile features
// borrow the game's own wording where the game has it (TRIMS, NICKS,
// colourDesc in js/constants.js), so a sort means the same thing on both pages.

export const TITLE = 'The Daily Proof';
export const STRAPLINE = 'One word from sixteen sorts, ranked against every word they could have set.';

// ─── The almanac ──────────────────────────────────────────────────────────────
// One per challenge, drawn before the tiles (OMENS in daily/deal.js).
export const OMEN_TEXT = {
  fair:       { name: 'Fair Copy',             desc: 'Ordinary odds.' },
  wetink:     { name: 'Wet Ink',               desc: 'More paint than usual.' },
  silver:     { name: 'The Silversmith Calls', desc: 'More silver trims than usual.' },
  blade:      { name: 'A Fresh Blade',         desc: 'More nicks than usual.' },
  purple:     { name: 'Purple Passage',        desc: 'More purple trims than usual.' },
  double:     { name: 'Double-Struck',         desc: 'More tiles with a second face than usual.' },
  tied:       { name: 'Tied Letters',          desc: 'Three tiles are ligatures.' },
  oldstock:   { name: 'Old Stock',             desc: 'Two tiles are medieval sorts.' },
  marginalia: { name: 'Marginalia',            desc: 'A ? and a ! are in the case.' },
  hellbox:    { name: 'From the Hellbox',      desc: 'One tile is cast in Hellbox iron.' },
  squib:      { name: 'Squib Day',             desc: 'One tile is cast in Squib lead.' },
  fat:        { name: 'Fat Matter',            desc: 'Far more features than usual.' },
  lean:       { name: 'Lean Matter',           desc: 'Far fewer features than usual.' },
  toolchest:  { name: 'The Tool Chest',        desc: 'A tool is on the bench.' },
};

// ─── The tools ────────────────────────────────────────────────────────────────
export const TOOL_TEXT = {
  ratchet: {
    name: 'Ratchet', glyph: '🔧',
    desc: 'Step one letter to its neighbour in the alphabet, either way (A steps back to Z).',
    armed: 'Tap the letter to step.',
    on: 'Stepped {0} to {1}',          // {0} from, {1} to
  },
  loupe: {
    name: 'Loupe', glyph: '🔍',
    desc: 'Double the value of one tile (to a max of {0}).',
    armed: 'Tap the tile to double.',
    on: '{0} doubled to {1}',          // {0} the letter, {1} its new value
    capped: 'Already worth {0} — the loupe can do nothing for it.',
  },
  takeBack: 'Tap to take it back.',
  notHere: 'The ratchet only turns a single letter.',
};

// ─── The sorts ────────────────────────────────────────────────────────────────
export const SORT_TEXT = {
  dual: 'Holds {0} and {1} — tap ⇄ to flip. Paint, trim and nick belong to the tile, so both letters wear them.',
  ligature: 'One tile that spells {0}.',
  mark: 'Spells nothing — goes on the end of a word. One ? or one !, or ?!.',
  medievalHead: '{0} — reads as {1}',
  medievalBody: 'Set it where you would set {0}. It counts for the length as {1}, and scores its own {2} Points. {3}',
  cursed: { head: 'Hellbox iron', body: '×{0} Mult when printed. A word set without it loses {1} Points.' },
  explosive: { head: 'Squib lead', body: '×{0} Mult when printed.' },
  plain: 'Plain lead.',
  ratcheted: 'Stepped from {0} by the ratchet.',
  louped: 'Doubled by the loupe.',
};

// ─── The board ────────────────────────────────────────────────────────────────
export const UI = {
  loading: 'Setting the type…',
  counting: 'Counting the case…',
  counted: '{0} words can be set from this case.',
  countedOne: 'One word can be set from this case.',
  stickEmpty: 'Tap the sorts to set a word.',
  print: 'Print',
  clear: 'Clear',
  shuffle: 'Shuffle',
  points: 'Points',
  total: 'Total',
  toll: '−{0} — a curse left in the case',
  notAWord: '{0} is not in the dictionary.',
  marksLast: 'Marks go at the end of a word.',
  markAlone: 'A mark needs a word in front of it.',
  waiting: 'Counting every other word the case could set…',
  almanac: 'The almanac',
  bench: 'On the bench',
  prev: 'Previous challenge',
  next: 'Next challenge',
  today: 'Today',
  number: '№ {0}',
  rules: 'How it scores',
  dictFallback: 'The word list could not be fetched, so this page cannot judge words.',
};

export const RULES = [
  ['Print one word', 'from the sixteen sorts in the case. It is ranked against every word the case could have set, each scored at its best.'],
  ['Score', 'is Points × Mult.'],
  ['Points', 'are the numbers in the tiles’ corners. A nicked tile scores again every tile on its notched side.'],
  ['Length', 'multiplies: six letters is ×2, and each letter past six adds ×0.5. A ligature counts every letter it spells.'],
  ['Paint', 'multiplies: each colour is ×(1 + its tiles in the word), and different colours multiply together. A purple trim adds ×0.5.'],
  ['Hold a tile', 'or hover over it, to read what it does.'],
];

// ─── The result ───────────────────────────────────────────────────────────────
export const RESULT = {
  best: 'The best word in the case',
  top: 'Top {0}%',
  bottom: 'Bottom {0}%',
  place: '#{0} of {1} words',
  placeBest: 'No word in the case scores higher.',
  couldHave: 'Set differently, {0} was worth {1}.',
  bestWords: 'The best of the case',
  yours: 'yours',
  chartTitle: 'Every word the case could set, best first',
  chartX: 'top % of the field — best on the left, on a log scale',
  next: 'Next challenge',
  again: 'Set it again',
  share: 'Copy result',
  copied: 'Copied',
  shareHead: 'Great Work · Daily Proof № {0}',
};

// What the place says about the proof, from the top down. Flavour, so it can be
// as florid as it likes; the number beside it is the rule.
export const VERDICTS = [
  [0,    'Editio princeps.'],
  [0.25, 'Fit for vellum.'],
  [1,    'A fine impression.'],
  [3,    'Clean copy.'],
  [10,   'Good, workmanlike setting.'],
  [25,   'Serviceable.'],
  [50,   'Middling matter.'],
  [80,   'Foul proof.'],
  [100,  'Pie.'],          // type spilled and jumbled — the trade's word for it
];

export const fill = (s, ...v) => s.replace(/\{(\d)\}/g, (_, i) => v[i] ?? '');
