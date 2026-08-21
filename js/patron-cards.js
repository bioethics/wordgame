// ═══ The patron cards ═════════════════════════════════════════════════════════
//
// EVERY patron's name, emoji, rarity, price, guild and card text — the whole
// roster, in one table. This is the file to edit to rename a patron, reword a
// card, reprice one, or move it between rarities. Nothing here is code: what a
// patron DOES lives beside its id in js/patrons.js.
//
//   name     what the card and the popover call it
//   emoji    the portrait
//   rarity   'common' | 'uncommon' | 'rare' — sets how often the Market offers
//            it (RARITY_WEIGHT in js/patrons.js) and the card's ring colour
//   cost     Coins at the Market, before the day's haggle and any postnom
//   guild    'amber' | 'jade' | 'crimson' | 'azure', or an array for a patron
//            of two liveries; omit for a wildcard. Guild-counting patrons
//            (the Orchardist, the Banker, the Alderman) read this.
//   desc     one sentence, concrete, under ~110 characters. State the rule,
//            not the feeling — the flavour belongs to the name and the quips.
//
// A desc may carry {KNOBS} in braces, filled from the table below as the module
// loads, so tuning a number in constants.js retunes the card text with it:
//
//   {ESPALIER_STEP}          the value itself
//   {1/NUDIST_TRIM_CHANCE}   one over it, rounded — for "a 1-in-4 chance"
//
// Optional, and rare: `unlisted` keeps a patron out of the Market's pool (the
// cat is found, never sold), `stackable` lets you hold more than one copy, and
// `portrait` takes a path to an image ('img/patrons/scholar.png') to show on
// the calling card in place of the emoji.

import {
  ABECEDARIAN_STEP, ESPALIER_STEP, HONORIFIC_STEP, HEADSMAN_STEP, BEEKEEPER_STEP,
  STOKER_BASE, STOKER_STEP, RAGMAN_COINS, RAGMAN_ODDS, DYE_TILES_PER_CHAPTER,
  NUDIST_TRIM_CHANCE, NUDIST_PAINT_CHANCE, DIPPER_PAINT_CHANCE, REVENANT_ODDS,
  PACKAGE_ODDS, FRONTISPIECE, MATERIALS, RIPPER_WORDS, PACKAGES, PRINCE, WORDLER,
  WINNOWER_BONUS,
} from './constants.js';

// What {BRACES} in a desc may refer to. Add a line here to expose a new knob.
const KNOBS = {
  ABECEDARIAN_STEP, ESPALIER_STEP, HONORIFIC_STEP, HEADSMAN_STEP, BEEKEEPER_STEP,
  STOKER_BASE, STOKER_STEP, RAGMAN_COINS, RAGMAN_ODDS, DYE_TILES_PER_CHAPTER,
  NUDIST_TRIM_CHANCE, NUDIST_PAINT_CHANCE, DIPPER_PAINT_CHANCE, REVENANT_ODDS,
  PACKAGE_ODDS,
  FRONTISPIECE_MULT: FRONTISPIECE.base,
  GHOST_METAL:      MATERIALS.ghost.metal.toLowerCase(),
  RIPPER_WORDS:     `${RIPPER_WORDS.slice(0, -1).join(', ')} or ${RIPPER_WORDS.at(-1)}`,
  PARCEL_SPOOKY:    PACKAGES.spooky.label,
  PARCEL_ROMANTIC:  PACKAGES.romantic.label,
  PARCEL_CUTE:      PACKAGES.cute.label,
  PARCEL_RUDE:      PACKAGES.rude.label,
  PRINCE_STEP:      PRINCE.step,
  WORDLER_BONUS:    WORDLER.bonus,
  WINNOWER_BONUS,
  WORDLER_LENGTH:   WORDLER.length,
  PRINCE_CROWN:     PRINCE.crown,
};

export const PATRON_CARDS = {
  // ── Amber · the counting-house ────────────────────────────────────────────
  assayer: {
    name: 'The Assayer', emoji: '⚖️', rarity: 'common', cost: 3, guild: 'amber',
    desc: 'Words with an amber tile pay 1 Coin.',
  },
  goldsmith: {
    name: 'The Goldsmith', emoji: '🪙', rarity: 'common', cost: 4, guild: 'amber',
    desc: 'Amber tiles gain +4 Points.',
  },
  weld: {
    name: 'The Weld', emoji: '🌼', rarity: 'common', cost: 4, guild: 'amber',
    desc: 'As each chapter ends, {DYE_TILES_PER_CHAPTER} tiles of your collection are painted amber.',
  },
  banker: {
    name: 'The Banker', emoji: '🏦', rarity: 'uncommon', cost: 4, guild: 'amber',
    desc: 'When a page completes: +1 Coin per amber patron on your shelf — this one included.',
  },
  factor: {
    name: 'The Factor', emoji: '🤝', rarity: 'uncommon', cost: 5, guild: 'amber',
    desc: 'Amber tiles still in your hand when a page completes earn a free Market re-roll each, up to 2.',
  },
  antiquary: {
    name: 'The Antiquary', emoji: '🏺', rarity: 'uncommon', cost: 6, guild: 'amber',
    desc: 'Words containing a J, QU, X or Z tile pay 2 Coins.',
  },
  scientist: {
    name: 'The Scientist', emoji: '🔬', rarity: 'uncommon', cost: 6, guild: 'amber',
    desc: 'Once a page, ask him for an OLOGY tile — gold-trimmed, riding above your hand, gone when the page ends.',
  },
  bursar: {
    name: 'The Bursar', emoji: '💰', rarity: 'uncommon', cost: 7, guild: 'amber',
    desc: 'Words with an amber tile gain +1 Mult for every 5 Coins you hold (max +5).',
  },
  chapman: {
    name: 'The Chapman', emoji: '🛒', rarity: 'uncommon', cost: 7, guild: 'amber',
    desc: 'One tile at the Market is always amber, and amber tiles cost nothing.',
  },
  magpie: {
    name: 'The Magpie', emoji: '🐦', rarity: 'uncommon', cost: 7, guild: 'amber',
    desc: 'Gold-trimmed tiles are twice as likely to be drawn from the bag.',
  },
  shorthair: {
    name: 'The Domestic Shorthair', emoji: '🐈', rarity: 'rare', cost: 0, guild: 'amber', unlisted: true,
    desc: 'Print any word spelling out R-A-T — PIRATE and GRATIS count — for 1 Coin and a laurel. Only the Rat Catcher\'s own RAT tile is ever eaten.',
  },
  medievalist: {
    name: 'The Medievalist', emoji: '🏰', rarity: 'rare', cost: 8, guild: ['amber', 'azure'],
    desc: 'Opens a stall at the Market selling medieval sorts — þ, ȝ, Æ and Ƿ — cheap, and worth far more than they cost.',
  },

  // ── Jade · growth and permanence ────────────────────────────────────────────
  dipper: {
    name: 'The Dipper', emoji: '🪣', rarity: 'common', cost: 4, guild: 'jade',
    desc: 'Each tile you discard has a 1-in-{1/DIPPER_PAINT_CHANCE} chance of being painted a random colour.',
  },
  nudist: {
    name: 'The Nudist', emoji: '🧖', rarity: 'common', cost: 4, guild: 'jade',
    desc: 'In a word where no tile has paint, a trim or a nick, each tile has a 1-in-{1/NUDIST_TRIM_CHANCE} chance of gaining a random trim and a 1-in-{1/NUDIST_PAINT_CHANCE} chance of a random colour.',
  },
  seedsman: {
    name: 'The Seedsman', emoji: '🌱', rarity: 'common', cost: 4, guild: 'jade',
    desc: 'Jade tiles gain +1 Point per chapter reached — +5 Points each in Chapter V.',
  },
  verdigris: {
    name: 'The Verdigris', emoji: '🍏', rarity: 'common', cost: 4, guild: 'jade',
    desc: 'As each chapter ends, {DYE_TILES_PER_CHAPTER} tiles of your collection are painted jade.',
  },
  abecedarian: {
    name: 'The Abecedarian', emoji: '🐣', rarity: 'common', cost: 5, guild: 'jade',
    desc: 'Print a 3-letter word: every tile in it permanently gains +{ABECEDARIAN_STEP} Point — in time to score.',
  },
  beekeeper: {
    name: 'The Beekeeper', emoji: '🐝', rarity: 'uncommon', cost: 6, guild: 'jade',
    desc: 'Every B you print permanently raises this patron\'s Mult by {BEEKEEPER_STEP}.',
  },
  wordler: {
    name: 'The Wordler', emoji: '🟩', rarity: 'uncommon', cost: 7, guild: ['amber', 'jade'],
    desc: 'Amber and jade tiles gain +{WORDLER_BONUS} Points. He loves a secret word.',
  },
  cellarer: {
    name: 'The Cellarer', emoji: '🧀', rarity: 'uncommon', cost: 6, guild: ['jade', 'amber'],
    desc: 'Ages when a page ends with a jade tile in hand: a laurel each time, and +1 Coin when dismissed.',
  },
  dabbler: {
    name: 'The Dabbler', emoji: '🖍️', rarity: 'uncommon', cost: 6, guild: 'jade',
    desc: 'Whenever a tile is painted, a second unpainted tile has a 1-in-2 chance of taking the same colour.',
  },
  espalier: {
    name: 'The Espalier', emoji: '🪴', rarity: 'uncommon', cost: 6, guild: 'jade',
    desc: 'Print a two-tile word: both tiles permanently gain +{ESPALIER_STEP} Points — in time to score.',
  },
  orchardist: {
    name: 'The Orchardist', emoji: '🌳', rarity: 'uncommon', cost: 6, guild: 'jade',
    desc: 'Every word gains +0.5 Mult per jade patron you keep — this one included.',
  },
  frontispiece: {
    name: 'The Frontispiece', emoji: '🖼️', rarity: 'uncommon', cost: 7, guild: 'jade',
    desc: 'The first word of each page gets ×{FRONTISPIECE_MULT} Mult — and a laurel each time that word clears the quota alone.',
  },
  laureate: {
    name: 'The Laureate', emoji: '👑', rarity: 'uncommon', cost: 8, guild: 'jade',
    desc: 'Every jade tile you print crowns this patron with a laurel — +{HONORIFIC_STEP} Points on every word, for good.',
  },
  grafter: {
    name: 'The Grafter', emoji: '🌿', rarity: 'rare', cost: 8, guild: 'jade',
    desc: 'When a word with a jade tile prints, every tile in it permanently gains +1 Point.',
  },

  // ── Crimson · sacrifice and fire ────────────────────────────────────────────
  bloodletter: {
    name: 'The Bloodletter', emoji: '💈', rarity: 'common', cost: 4, guild: 'crimson',
    desc: 'Discard exactly two tiles: one is destroyed, the other painted crimson.',
  },
  firebrand: {
    name: 'The Firebrand', emoji: '❤️‍🔥', rarity: 'common', cost: 4, guild: 'crimson',
    desc: 'Words with 2 or more crimson tiles gain +15 Points.',
  },
  gambler: {
    name: 'The Gambler', emoji: '🎲', rarity: 'common', cost: 4, guild: 'crimson',
    desc: 'Each word has a 1-in-2 chance of ×2 Mult — the coin is tossed before you set it.',
  },
  madder: {
    name: 'The Madder', emoji: '🌺', rarity: 'common', cost: 4, guild: 'crimson',
    desc: 'As each chapter ends, {DYE_TILES_PER_CHAPTER} tiles of your collection are painted crimson.',
  },
  ratcatcher: {
    name: 'The Rat Catcher', emoji: '🐀', rarity: 'uncommon', cost: 2, guild: 'crimson',
    desc: 'Every page begins with a RAT tile in hand, painted a random colour. It is yours for good.',
  },
  quartermaster: {
    name: 'The Quartermaster', emoji: '🎒', rarity: 'uncommon', cost: 5, guild: 'crimson',
    desc: 'Begin each page with an extra Discard.',
  },
  arsonist: {
    name: 'The Arsonist', emoji: '🧨', rarity: 'uncommon', cost: 7, guild: 'crimson',
    desc: 'Every tile you print has a 1-in-10 chance of being painted crimson, and a 1-in-100 chance of being destroyed.',
  },
  composter: {
    name: 'The Composter', emoji: '🍂', rarity: 'uncommon', cost: 7, guild: ['crimson', 'jade'],
    desc: 'Destroyed tiles rot into jade ones — at each Market, take one from the heap per jade patron you keep.',
  },
  headsman: {
    name: 'The Headsman', emoji: '🪓', rarity: 'uncommon', cost: 7, guild: 'crimson',
    desc: 'Each patron you dismiss permanently raises this patron\'s Mult by {HEADSMAN_STEP}.',
  },
  serpent: {
    name: 'The Serpent', emoji: '🐍', rarity: 'uncommon', cost: 7, guild: 'crimson',
    desc: 'Words ending in S get ×2 Mult — and the S is swallowed.',
  },
  revenant: {
    name: 'The Revenant', emoji: '💀', rarity: 'rare', cost: 8, guild: 'crimson',
    desc: 'Every tile destroyed has a 1-in-{1/REVENANT_ODDS} chance of walking back out of the hellbox in {GHOST_METAL} — everything it wore intact, and no room in your hand.',
  },
  ripper: {
    name: 'The Ripper', emoji: '🔪', rarity: 'rare', cost: 9, guild: 'crimson',
    desc: 'Print {RIPPER_WORDS} and one of your other patrons becomes a ghost — it works on, off the shelf, freeing its seat — then this patron flees.',
  },
  typefounder: {
    name: 'The Typefounder', emoji: '⚗️', rarity: 'rare', cost: 10, guild: 'crimson',
    desc: 'Discard exactly two tiles: they are recast as one tile with a letter on either face.',
  },
  alloy: {
    name: 'The Alloy', emoji: '🟠', rarity: 'uncommon', cost: 6, guild: ['crimson', 'amber'],
    desc: 'A word with both a crimson and an amber tile pays 2 Coins and gains +1 Mult.',
  },
  stoker: {
    name: 'The Stoker', emoji: '🔥', rarity: 'rare', cost: 11, guild: 'crimson',
    desc: '×{STOKER_BASE} Mult, and crimson tiles are destroyed when printed — each one raises that Mult by {STOKER_STEP}, for good.',
  },

  // ── Azure · ink, flow and latitude ──────────────────────────────────────────
  izzard: {
    name: 'The Izzard', emoji: '⚡', rarity: 'common', cost: 4, guild: 'azure',
    desc: 'Any Z you play may be read as an S — and still scores as a Z.',
  },
  siren: {
    name: 'The Siren', emoji: '🎶', rarity: 'common', cost: 4, guild: 'azure',
    desc: 'Vowels gain +2 Points — or +6 if they are azure.',
  },
  woad: {
    name: 'The Woad', emoji: '🪻', rarity: 'common', cost: 4, guild: 'azure',
    desc: 'As each chapter ends, {DYE_TILES_PER_CHAPTER} tiles of your collection are painted azure.',
  },
  lexicographer: {
    name: 'The Lexicographer', emoji: '📚', rarity: 'uncommon', cost: 6, guild: 'azure',
    desc: '×1.5 Mult when the word is not among the commonest in English — reach for the word nobody else would.',
  },
  stenographer: {
    name: 'The Stenographer', emoji: '📟', rarity: 'uncommon', cost: 6, guild: 'azure',
    desc: 'Common acronyms and abbreviations count as words: LOL, BRB, WTF and the rest.',
  },
  fountain: {
    name: 'The Fountain', emoji: '⛲', rarity: 'uncommon', cost: 7, guild: 'azure',
    desc: 'Azure tiles return to the bag when printed, instead of the discard pile.',
  },
  marbler: {
    name: 'The Marbler', emoji: '🌀', rarity: 'uncommon', cost: 7, guild: 'azure',
    desc: 'Words with 2 or more azure tiles get ×2 Mult.',
  },
  sculptor: {
    name: 'The Sculptor', emoji: '🗿', rarity: 'rare', cost: 9, guild: 'azure',
    desc: '×2 Mult when the word is a noun, singular or plural — a Binder\'s compound counts as one.',
  },
  titivillus: {
    name: 'Titivillus', emoji: '😈', rarity: 'rare', cost: 9, guild: 'azure',
    desc: 'Words with an azure tile are accepted with one vowel wrong: swapped, changed, missing or extra.',
  },
  neologist: {
    name: 'The Neologist', emoji: '📖', rarity: 'rare', cost: 10, guild: 'azure',
    desc: 'Add one six-letter word of your choosing to the dictionary permanently, then this patron leaves.',
  },
  poet: {
    name: 'The Poet', emoji: '🪶', rarity: 'rare', cost: 10, guild: 'azure',
    desc: '×2 Mult when the word is an adjective — the describing words, ABLE to ZESTY.',
  },
  athlete: {
    name: 'The Athlete', emoji: '🏃', rarity: 'rare', cost: 12, guild: 'azure',
    desc: '×2 Mult when the word is a verb — a doing word, in any tense: RUN, RAN, RUNNING.',
  },
  binder: {
    name: 'The Binder', emoji: '🔗', rarity: 'rare', cost: 12, guild: 'azure',
    desc: 'Any two nouns stacked together count as a word: DOOM and HAT make DOOMHAT.',
  },
  blueprince: {
    name: 'The Azure Prince', emoji: '🔷', rarity: 'rare', cost: 5, guild: 'azure',
    desc: 'Tap for a cypher: that many tiles, an azure one in the marked place, +{PRINCE_STEP} Mult for good. Crowned at ×{PRINCE_CROWN} — and worth a fortune dismissed.',
  },

  // ── No guild · the wildcards ────────────────────────────────────────────────
  apprentice: {
    name: 'The Apprentice', emoji: '🧹', rarity: 'common', cost: 3,
    desc: '4-letter words gain +10 Points.',
  },
  winnower: {
    name: 'The Winnower', emoji: '🌾', rarity: 'common', cost: 4,
    desc: 'Every discard you spend arms your next word with +{WINNOWER_BONUS} Points.',
  },
  scholar: {
    name: 'The Scholar', emoji: '📜', rarity: 'common', cost: 3,
    desc: 'Words of 5+ letters gain +10 Points.',
  },
  stumbler: {
    name: 'The Stumbler', emoji: '🥾', rarity: 'common', cost: 3,
    desc: 'Words are accepted with one pair of adjacent letters swapped: TEH counts as THE.',
  },
  copyist: {
    name: 'The Copyist', emoji: '📑', rarity: 'common', cost: 4,
    desc: '×2 Mult when the word already stands in your manuscript.',
  },
  monogrammist: {
    name: 'The Monogrammist', emoji: '🪭', rarity: 'common', cost: 4, stackable: true,
    desc: 'Arrives with three letters of its own; a tile showing one prints twice — Points, trim and paint alike.',
  },
  twins: {
    name: 'The Twins', emoji: '👯', rarity: 'common', cost: 4,
    desc: 'Doubled letters (LL, OO…) print twice — Points, trim and paint alike.',
  },
  innkeeper: {
    name: 'The Innkeeper', emoji: '🍻', rarity: 'common', cost: 6,
    desc: 'Every word gains +5 Points per patron you hold — this one included, and your ghosts.',
  },
  glover: {
    name: 'The Glover', emoji: '🧤', rarity: 'uncommon', cost: 4,
    desc: 'Each colour worn by exactly two tiles in the word gives +0.2 Mult — a matched pair, no more, no fewer.',
  },
  jeweller: {
    name: 'The Jeweller', emoji: '💎', rarity: 'uncommon', cost: 5,
    desc: 'Tiles worth 8+ Points gain half as much again.',
  },
  mirror: {
    name: 'The Mirror', emoji: '🪞', rarity: 'uncommon', cost: 5,
    desc: 'Words that spell another word backwards — or themselves — get ×4 Mult.',
  },
  expectants: {
    name: 'The Expectant Parents', emoji: '🤰', rarity: 'uncommon', cost: 6,
    desc: 'Common baby names count as words, and any name gains +10 Points — SOPHIE, ARCHIE, BARNABY.',
  },
  haplographer: {
    name: 'The Haplographer', emoji: '🔂', rarity: 'uncommon', cost: 6,
    desc: 'One letter may read as doubled: BALOON counts as BALLOON — and doubles pay The Twins.',
  },
  herald: {
    name: 'The Herald', emoji: '📯', rarity: 'uncommon', cost: 6,
    desc: 'Words that start and end with the same letter get ×2 Mult.',
  },
  skald: {
    name: 'The Skald', emoji: '🎵', rarity: 'uncommon', cost: 6,
    desc: 'Words starting with the same letter as your last word get ×2 Mult.',
  },
  typesetter: {
    name: 'The Typesetter', emoji: '🔠', rarity: 'uncommon', cost: 6,
    desc: 'Each ligature tile — one that spells several letters — gives +0.25 Mult.',
  },
  alderman: {
    name: 'The Alderman', emoji: '🎩', rarity: 'uncommon', cost: 7,
    desc: 'Each guild with a patron on your shelf gives ×1.5 Mult.',
  },
  calligrapher: {
    name: 'The Calligrapher', emoji: '✒️', rarity: 'uncommon', cost: 7,
    desc: 'Each painted tile gains +3 Points.',
  },
  closer: {
    name: 'The Closer', emoji: '🌒', rarity: 'uncommon', cost: 7,
    desc: 'The final word of each page gets ×3 Mult.',
  },
  harlequin: {
    name: 'The Harlequin', emoji: '🃏', rarity: 'uncommon', cost: 7,
    desc: 'Words holding all four colours get ×2 Mult.',
  },
  novelist: {
    name: 'The Novelist', emoji: '🖋️', rarity: 'uncommon', cost: 7,
    desc: 'Words of 7+ letters get ×2 Mult.',
  },
  ragman: {
    name: 'The Ragman', emoji: '🧺', rarity: 'uncommon', cost: 7,
    desc: 'Each painted tile you discard has a 1-in-{1/RAGMAN_ODDS} chance of paying — crimson the tongs, amber {RAGMAN_COINS} Coin, jade +1 hand size for the page, azure your discard back.',
  },
  stammerer: {
    name: 'The Stammerer', emoji: '🦜', rarity: 'uncommon', cost: 8,
    desc: 'Every doubled letter gives +0.5 Mult — BALLOON pays twice, BOOKKEEPER three times.',
  },
  poppet: {
    name: 'The Poppet', emoji: '🧸', rarity: 'rare', cost: 7,
    desc: '×3 Mult for any of the thousands of words The Poppet finds cute — and a 1-in-{1/PACKAGE_ODDS} chance of {PARCEL_CUTE} for the workbench.',
  },
  illuminator: {
    name: 'The Illuminator', emoji: '🎨', rarity: 'rare', cost: 8,
    desc: 'When a word holds exactly three colours, its first bare tile is painted the fourth — before the word is counted.',
  },
  paramour: {
    name: 'The Paramour', emoji: '💘', rarity: 'rare', cost: 8,
    desc: '×3 Mult for any of the thousands of words The Paramour finds romantic — and a 1-in-{1/PACKAGE_ODDS} chance of {PARCEL_ROMANTIC} for the workbench.',
  },
  sexton: {
    name: 'The Sexton', emoji: '⚰️', rarity: 'rare', cost: 8,
    desc: '×3 Mult for any of the thousands of words The Sexton finds spooky — and a 1-in-{1/PACKAGE_ODDS} chance of {PARCEL_SPOOKY} for the workbench.',
  },
  vulgarian: {
    name: 'The Vulgarian', emoji: '🍑', rarity: 'rare', cost: 8,
    desc: '×3 Mult for any of the thousands of words The Vulgarian finds rude — and a 1-in-{1/PACKAGE_ODDS} chance of {PARCEL_RUDE} for the workbench.',
  },
  astronomer: {
    name: 'The Astronomer', emoji: '🔭', rarity: 'rare', cost: 9,
    desc: '+1 Mult for each word already printed this page.',
  },
  overseer: {
    name: 'The Overseer', emoji: '📋', rarity: 'rare', cost: 9,
    desc: 'Print one more word each page.',
  },
  cartographer: {
    name: 'The Cartographer', emoji: '🗺️', rarity: 'rare', cost: 12,
    desc: 'Words whose letters run in alphabetical order get ×3 Mult.',
  },
  skimmer: {
    name: 'The Skimmer', emoji: '👓', rarity: 'rare', cost: 12,
    desc: 'Words are accepted with their middle letters in any order, so long as the first and last letters are right.',
  },
};

// Fill a card's {KNOBS} the moment the module loads, so nothing downstream has
// to know templates exist. An unknown knob is a typo — say so loudly rather
// than shipping a card reading "{ESPALER_STEP}".
for (const [id, card] of Object.entries(PATRON_CARDS)) {
  card.desc = card.desc.replace(/\{(1\/)?([A-Z_][A-Z0-9_]*)\}/g, (_, inverse, knob) => {
    if (!(knob in KNOBS)) throw new Error(`patron-cards: ${id} wants unknown knob {${knob}}`);
    return String(inverse ? Math.round(1 / KNOBS[knob]) : KNOBS[knob]);
  });
}
