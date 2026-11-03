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

// ─── The board ────────────────────────────────────────────────────────────────
export const UI = {
  number: '№ {0}',
  flipTo: 'Flip to {0}',
  letters: '{0} letters',
  inWord: 'Pays {0} in this word',
  inWordParts: '{0} + {1} from its nick',
  notAWord: 'Not in the dictionary.',
  waiting: 'Counting the field…',
  dictFallback: 'The word list could not be loaded.',
};

// ─── The slip ─────────────────────────────────────────────────────────────────
export const RESULT = {
  best: 'Best in the case',
  top: 'Top {0}%',
  bottom: 'Bottom {0}%',
  place: '#{0} of {1}',
  share: 'Copy',
  copied: 'Copied',
  again: 'Again',
  next: 'Next ›',
  shareHead: 'Great Work · Daily Proof № {0}',
};

export const fill = (s, ...v) => s.replace(/\{(\d)\}/g, (_, i) => v[i] ?? '');
