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
// A desc may carry {KNOBS} in braces, filled as the module loads, so tuning a
// number in constants.js retunes the card text with it:
//
//   {ESPALIER_STEP}          the value itself
//   {1/NUDIST_TRIM_CHANCE}   one over it, rounded — for "a 1-in-4 chance"
//
// The knobs available are listed in KNOBS at the foot of js/constants.js, shared
// with the rest of the game's writing in js/text.js. Add a line there to expose
// a new one.
//
// Optional, and rare: `unlisted` keeps a patron out of the Market's pool (the
// cat is found, never sold), `stackable` lets you hold more than one copy,
// `supersedes` lists the patrons this one replaces — holding it keeps them off
// the Market too — and `portrait` takes a path to an image
// ('img/patrons/scholar.png') to show on the calling card in place of the emoji.

// Both the {KNOBS} a desc may quote and the filler that resolves them are shared
// with js/text.js, where the rest of the game's writing lives — so a knob means
// the same thing on a calling card as it does on a tooltip. The list of knobs
// available is KNOBS at the foot of js/constants.js.
import { KNOBS, LOVERS } from './constants.js';
import { fillKnobs } from './text.js';

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
    desc: 'When a page completes: +1 Coin per amber patron on your shelf (including The Banker).',
  },
  factor: {
    name: 'The Factor', emoji: '🤝', rarity: 'uncommon', cost: 5, guild: 'amber',
    desc: 'Every amber tile still in your hand when a page completes earns a free Market re-roll.',
  },
  antiquary: {
    name: 'The Antiquary', emoji: '🏺', rarity: 'uncommon', cost: 6, guild: 'amber',
    desc: 'Words containing a J, QU, X or Z tile pay 2 Coins.',
  },
  scientist: {
    name: 'The Scientist', emoji: '🔬', rarity: 'uncommon', cost: 6, guild: 'amber',
    desc: 'Once a page, you may ask him for a free OLOGY tile — gold-trimmed, and gone when the page ends.',
  },
  bursar: {
    name: 'The Bursar', emoji: '💰', rarity: 'uncommon', cost: 7, guild: 'amber',
    desc: 'Words with an amber tile gain +1 Mult for every 5 Coins you hold (max +5).',
  },
  chapman: {
    name: 'The Chapman', emoji: '🛒', rarity: 'uncommon', cost: 7, guild: 'amber',
    desc: 'At the Market, amber tiles are free. At least one tile at the Market is always amber.',
  },
  usurer: {
    name: 'The Usurer', emoji: '🧾', rarity: 'common', cost: 1, guild: 'amber',
    desc: 'Tap for a loan of {USURER_LOAN} Coins. He cannot be dismissed until {USURER_OWED} is paid; until then, he collects {USURER_COLLECT} per page.',
  },
  magpie: {
    name: 'The Magpie', emoji: '🐦', rarity: 'uncommon', cost: 7, guild: 'amber',
    desc: 'Gold-trimmed tiles are {MAGPIE_WEIGHT}× as likely to be drawn from the bag.',
  },
  shorthair: {
    name: 'The Domestic Shorthair', emoji: '🐈', rarity: 'rare', cost: 0, guild: 'amber', unlisted: true,
    desc: 'Print any word spelling out R-A-T (e.g., pirate or gratis) for 1 Coin and 1 laurel. Also, eats RAT tiles for +{SHORTHAIR_MULT} Mult.',
  },
  medievalist: {
    name: 'The Medievalist', emoji: '🏰', rarity: 'rare', cost: 8, guild: ['amber', 'azure'],
    desc: 'Opens a new stall at the Market, selling medieval sorts: þ, ȝ, Æ and Ƿ.',
  },
  romeo: {
    name: 'Romeo', emoji: '🌹', rarity: 'uncommon', cost: 6, guild: 'amber',
    desc: '×{LOVERS_APART} Mult when the word contains an amber paint, but no jade tiles.',
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
    desc: 'Jade tiles score +1 Point per chapter reached.',
  },
  lapidary: {
    name: 'The Lapidary', emoji: '💠', rarity: 'common', cost: 6, guild: 'jade',
    desc: 'Jade tiles score for +1 Point for every jade tile in your collection.',
  },
  verdigris: {
    name: 'The Verdigris', emoji: '🍏', rarity: 'common', cost: 4, guild: 'jade',
    desc: 'As each chapter ends, {DYE_TILES_PER_CHAPTER} tiles of your collection are painted jade.',
  },
  child: {
    name: 'The Child', emoji: '🐣', rarity: 'common', cost: 5, guild: 'jade',
    desc: 'Print a 3-letter word: every tile in it permanently gains +{CHILD_STEP} Point before scoring.',
  },
  abecedarian: {
    name: 'The Abecedarian', emoji: '🔠', rarity: 'rare', cost: 8, guild: 'jade',
    desc: 'Collects letters. The first time you print any letter, this patron gains +{ABECEDARIAN_MULT} Mult, for good. A full case is +{ABECEDARIAN_CASE_MULT}.',
  },
  beekeeper: {
    name: 'The Beekeeper', emoji: '🐝', rarity: 'uncommon', cost: 6, guild: 'jade',
    desc: '×1 Mult to begin with, raised for good with every B you print — {BEEKEEPER_STEPS}. The hive fills; it never quite stops.',
  },
  wordler: {
    name: 'The Wordler', emoji: '🟩', rarity: 'uncommon', cost: 7, guild: ['amber', 'jade'],
    desc: 'Amber and jade tiles gain +{WORDLER_BONUS} Points. Also, he will reward you for spelling a secret 5-letter word.',
  },
  cellarer: {
    name: 'The Cellarer', emoji: '🧀', rarity: 'uncommon', cost: 6, guild: ['jade', 'amber'],
    desc: 'When a page ends with a jade tile still in hand: gain a laurel, and +1 sell value.',
  },
  dabbler: {
    name: 'The Dabbler', emoji: '🖍️', rarity: 'uncommon', cost: 6, guild: 'jade',
    desc: 'Whenever a tile is painted, a second unpainted tile has a 1-in-2 chance of taking the same colour.',
  },
  espalier: {
    name: 'The Espalier', emoji: '🪴', rarity: 'uncommon', cost: 6, guild: 'jade',
    desc: 'Print a two-tile word: both tiles permanently gain +{ESPALIER_STEP} Points before scoring.',
  },
  orchardist: {
    name: 'The Orchardist', emoji: '🌳', rarity: 'uncommon', cost: 6, guild: 'jade',
    desc: 'Every word gains +0.5 Mult per jade patron on your bench (including the Orchardist.)',
  },
  frontispiece: {
    name: 'The Frontispiece', emoji: '🖼️', rarity: 'uncommon', cost: 7, guild: 'jade',
    desc: 'The first word of each page gets ×{FRONTISPIECE_MULT} Mult. Also, gains a laurel when the first word meets quota.',
  },
  laureate: {
    name: 'The Laureate', emoji: '👑', rarity: 'uncommon', cost: 5, guild: 'jade',
    desc: 'A word holding both a gold-trimmed and a silver-trimmed tile crowns this patron with a laurel — +{HONORIFIC_STEP} Points on every word, for good. Also, while seated, every laurel at your table gives its wearer +{LAUREATE_MULT_STEP} Mult.',
  },
  grafter: {
    name: 'The Grafter', emoji: '🌿', rarity: 'rare', cost: 8, guild: 'jade',
    desc: 'When a word with a jade tile prints, every tile in it permanently gains +1 Point.',
  },
  juliet: {
    name: 'Juliet', emoji: '🌷', rarity: 'uncommon', cost: 6, guild: 'jade',
    desc: '×{LOVERS_APART} Mult when the word contains at least one jade letter, and no amber letters.',
  },
  // The seat no Market sells: `unlisted` keeps it out of the pool, and the only
  // way to it is to hold both lovers at once (marryLovers in js/state.js).
  // `supersedes` then keeps Romeo and Juliet off the Market for good, so the
  // wedding can never happen twice.
  lovers: {
    name: 'The Star-Crossed Lovers', emoji: '💞', rarity: 'rare', cost: 12,
    guild: ['amber', 'jade'], unlisted: true, supersedes: LOVERS.pair,
    desc: '×{LOVERS_UNITED} Mult when the word wears both amber and jade paint — one rainbow tile is both at once.',
  },

  // ── Crimson · sacrifice and fire ────────────────────────────────────────────
  bloodletter: {
    name: 'The Bloodletter', emoji: '💈', rarity: 'common', cost: 4, guild: 'crimson',
    desc: 'Discard exactly two tiles: one is destroyed, the other painted crimson.',
  },
  firebrand: {
    name: 'The Firebrand', emoji: '❤️‍🔥', rarity: 'common', cost: 4, guild: 'crimson',
    desc: 'Words with 2 or more crimson tiles score +15 Points.',
  },
  gambler: {
    name: 'The Gambler', emoji: '🎲', rarity: 'common', cost: 4, guild: 'crimson',
    desc: 'Each word has a 1-in-2 chance of ×2 Mult (determined ahead of scoring).',
  },
  madder: {
    name: 'The Madder', emoji: '🌺', rarity: 'common', cost: 4, guild: 'crimson',
    desc: 'As each chapter ends, {DYE_TILES_PER_CHAPTER} tiles of your collection are painted crimson.',
  },
  ratcatcher: {
    name: 'The Rat Catcher', emoji: '🐀', rarity: 'uncommon', cost: 2, guild: 'crimson',
    desc: 'Every page, gain a RAT tile to your hand that is painted a random colour.',
  },
  quartermaster: {
    name: 'The Quartermaster', emoji: '🎒', rarity: 'uncommon', cost: 5, guild: 'crimson',
    desc: 'Begin each page with an extra Discard.',
  },
  arsonist: {
    name: 'The Arsonist', emoji: '🧨', rarity: 'uncommon', cost: 6, guild: 'crimson',
    desc: 'Every tile you print has a 1-in-10 chance of being painted crimson, and a 1-in-100 chance of being destroyed.',
  },
  composter: {
    name: 'The Composter', emoji: '🍂', rarity: 'uncommon', cost: 7, guild: ['crimson', 'jade'],
    desc: 'Tends a compost heap at the Market. Destroyed tiles are composted, and you may take as many as you like.',
  },
  headsman: {
    name: 'The Headsman', emoji: '🪓', rarity: 'uncommon', cost: 7, guild: 'crimson',
    desc: '×1 Mult to begin with, raised by {HEADSMAN_STEP} for good with every patron you dismiss.',
  },
  serpent: {
    name: 'The Serpent', emoji: '🐍', rarity: 'uncommon', cost: 7, guild: 'crimson',
    desc: 'Words ending in S get ×2 Mult. Also, the S is destroyed.',
  },
  mako: {
    name: 'The Shortfin Mako', emoji: '🦈', rarity: 'uncommon', cost: 6, guild: 'crimson',
    desc: 'Crimson tiles are {MAKO_WEIGHT}× as likely to be drawn from the bag.',
  },
  revenant: {
    name: 'The Revenant', emoji: '💀', rarity: 'rare', cost: 8, guild: 'crimson',
    desc: 'Every tile destroyed has a 1-in-{1/REVENANT_ODDS} chance of being revived in {GHOST_METAL}.',
  },
  ripper: {
    name: 'The Ripper', emoji: '🔪', rarity: 'rare', cost: 9, guild: 'crimson',
    desc: 'Print {RIPPER_WORDS} and one of your other patrons becomes a ghost. Then, this patron flees.',
  },
  typefounder: {
    name: 'The Typefounder', emoji: '⚗️', rarity: 'rare', cost: 10, guild: 'crimson',
    desc: 'Discard exactly two tiles to combine them into one tile with a letter on either face.',
  },
  alloy: {
    name: 'The Alloy', emoji: '🟠', rarity: 'uncommon', cost: 7, guild: ['crimson', 'amber'],
    desc: 'A word with both a crimson and an amber tile pays 2 Coins and gains +1 Mult.',
  },
  stoker: {
    name: 'The Stoker', emoji: '🔥', rarity: 'rare', cost: 11, guild: 'crimson',
    desc: '×{STOKER_BASE} Mult. Also, crimson tiles are destroyed when printed, but raise Mult by {STOKER_STEP}.',
  },

  // ── Azure · ink, flow and latitude ──────────────────────────────────────────
  izzard: {
    name: 'The Izzard', emoji: '⚡', rarity: 'common', cost: 4, guild: 'azure',
    desc: 'Any Z may be played as an S.',
  },
  siren: {
    name: 'The Siren', emoji: '🎶', rarity: 'common', cost: 4, guild: 'azure',
    desc: 'Vowels gain +2 Points, or +6 if they are azure.',
  },
  woad: {
    name: 'The Woad', emoji: '🪻', rarity: 'common', cost: 4, guild: 'azure',
    desc: 'As each chapter ends, {DYE_TILES_PER_CHAPTER} tiles of your collection are painted azure.',
  },
  lexicographer: {
    name: 'The Lexicographer', emoji: '📚', rarity: 'uncommon', cost: 6, guild: 'azure',
    desc: '×1.5 Mult for words that are not among the 8000 commonest words in English.',
  },
  stenographer: {
    name: 'The Stenographer', emoji: '📟', rarity: 'uncommon', cost: 6, guild: 'azure',
    desc: 'Common acronyms and abbreviations count as words: LOL, BRB, WTF, etc.',
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
    desc: '×2 Mult when the word is a noun.',
  },
  titivillus: {
    name: 'Titivillus', emoji: '😈', rarity: 'rare', cost: 9, guild: 'azure',
    desc: 'Words with an azure tile accept one vowel-based spelling mistake (swapped, changed, missing or extra.)',
  },
  neologist: {
    name: 'The Neologist', emoji: '📖', rarity: 'rare', cost: 10, guild: 'azure',
    desc: 'Add one six-letter word of your choosing to the dictionary permanently. Then this patron leaves.',
  },
  poet: {
    name: 'The Poet', emoji: '🪶', rarity: 'rare', cost: 10, guild: 'azure',
    desc: '×2 Mult when the word is an adjective or an adverb.',
  },
  athlete: {
    name: 'The Athlete', emoji: '🏃', rarity: 'rare', cost: 12, guild: 'azure',
    desc: '×2 Mult when the word is a verb.',
  },
  binder: {
    name: 'The Binder', emoji: '🔗', rarity: 'rare', cost: 12, guild: 'azure',
    desc: 'Any two nouns stacked together count as a word. DOOM and HAT make DOOMHAT.',
  },
  blueprince: {
    name: 'The Azure Prince', emoji: '🔷', rarity: 'rare', cost: 5, guild: 'azure',
    desc: 'Will reward you if you do something for him, but he will only hint at what this is.',
  },

  // ── No guild · the wildcards ────────────────────────────────────────────────
  apprentice: {
    name: 'The Apprentice', emoji: '🧹', rarity: 'common', cost: 3,
    desc: '+10 Points for 4-letter words.',
  },
  winnower: {
    name: 'The Winnower', emoji: '🌾', rarity: 'common', cost: 4,
    desc: 'When you spend a discard, arms your next word with +{WINNOWER_BONUS} Points.',
  },
  scholar: {
    name: 'The Grandiloquent', emoji: '📜', rarity: 'common', cost: 3,
    desc: '+10 points for words of 5+ letters.',
  },
  stumbler: {
    name: 'The Stumbler', emoji: '🥾', rarity: 'common', cost: 3,
    desc: 'Words are accepted with one pair of adjacent letters swapped (e.g., TEH counts as THE).',
  },
  copyist: {
    name: 'The Copyist', emoji: '📑', rarity: 'common', cost: 4,
    desc: '×2 Mult for words that have already been printed in your manuscript.',
  },
  monogrammist: {
    name: 'The Monogrammist', emoji: '🪭', rarity: 'common', cost: 4, stackable: true,
    desc: 'Arrives with three letters of its own; a tile showing one prints twice.',
  },
  twins: {
    name: 'The Twins', emoji: '👯', rarity: 'common', cost: 4,
    desc: 'Every doubled letter (LL, OO…) pays +{TWINS_POINTS} Points. Also, all features of the first tile are copied to the second.',
  },
  silentknight: {
    name: 'The Silent Knight', emoji: '\u2694\ufe0f', rarity: 'rare', cost: 8, guild: 'azure',
    desc: 'Words with silent letters cause the silent knight to gain a laurel, and recast the the silent letter in a special material.',
  },
  innkeeper: {
    name: 'The Innkeeper', emoji: '🍻', rarity: 'common', cost: 5,
    desc: '+5 Points per patron you hold, including The Innkeeper.',
  },
  purveyor: {
    // The card states the shape; the six exact numbers are in the tap-through
    // (the `popover` on this patron's def in js/patrons.js), where a list can be
    // read properly and a calling card cannot.
    name: 'The Purveyor', emoji: '🏪', rarity: 'rare', cost: 9,
    desc: 'Widens every choice: more tiles, patrons and stalls at the Market, more cards at the Colophon. Tap for the terms.',
  },
  glover: {
    name: 'The Glover', emoji: '🧤', rarity: 'uncommon', cost: 4,
    desc: 'Each colour worn by exactly two tiles in the word gives +{GLOVER_STEP} Mult.',
  },
  jeweller: {
    name: 'The Jeweller', emoji: '💎', rarity: 'uncommon', cost: 5,
    desc: 'Tiles worth 8+ Points are worth half as much again.',
  },
  mirror: {
    name: 'The Mirror', emoji: '🪞', rarity: 'uncommon', cost: 5,
    desc: '×4 Mult for words that also spell any valid word backwards (including itself).',
  },
  expectants: {
    name: 'The Expectant Parents', emoji: '🤰', rarity: 'uncommon', cost: 4,
    desc: 'Common baby names count as words. +{EXPECTANTS_BONUS} Points for baby names.',
  },
  counterfeiter: {
    name: 'The Counterfeiter', emoji: '💵', rarity: 'uncommon', cost: 7, guild: 'azure',
    desc: 'Once per page, you may ask the Counterfeiter to provide you with one temporary tile.',
  },
  haplographer: {
    name: 'The Haplographer', emoji: '🔂', rarity: 'uncommon', cost: 6,
    desc: 'Single letters can read as doubled (BALOON counts as BALLOON).',
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
    name: 'The Typesetter', emoji: '🔣', rarity: 'uncommon', cost: 6,
    desc: 'Each non-standard tile (e.g., QU, RAT, medieval glyphs) give +{TYPESETTER_STEP} Mult.',
  },
  alderman: {
    name: 'The Alderman', emoji: '🎩', rarity: 'uncommon', cost: 7,
    desc: '+{ALDERMAN_STEP} Mult for each guild with a patron at your table.',
  },
  calligrapher: {
    name: 'The Calligrapher', emoji: '✒️', rarity: 'common', cost: 7,
    desc: '+3 Points for painted tiles.',
  },
  closer: {
    name: 'The Closer', emoji: '🌒', rarity: 'uncommon', cost: 7,
    desc: '×3 Mult on the final word of each page.',
  },
  harlequin: {
    name: 'The Harlequin', emoji: '🃏', rarity: 'uncommon', cost: 7,
    desc: '×2 Mult for words containing all four colours.',
  },
  novelist: {
    name: 'The Novelist', emoji: '🖋️', rarity: 'uncommon', cost: 7,
    desc: '×2 Mult for words of 7+ letters.',
  },
  ragman: {
    name: 'The Ragman', emoji: '🧺', rarity: 'uncommon', cost: 7,
    desc: 'Discarding painted tiles has a 1-in-{1/RAGMAN_ODDS} chance of paying a prize. Crimson: gain the tongs. Amber: +{RAGMAN_COINS} Coin. Jade: +1 hand size for the page. Azure: +1 discard.',
  },
  stammerer: {
    name: 'The Stammerer', emoji: '🦜', rarity: 'uncommon', cost: 8,
    desc: '+0.5 Mult for every doubled letter ',
  },
  poppet: {
    name: 'The Poppet', emoji: '🧸', rarity: 'rare', cost: 7,
    desc: '×3 Mult for any of the thousands of words The Poppet finds cute — and a {PACKAGE_CHANCE} chance of {PARCEL_CUTE} for the workbench.',
  },
  illuminator: {
    name: 'The Illuminator', emoji: '🎨', rarity: 'rare', cost: 8,
    desc: 'Before scoring: when a word holds exactly three colours, its first bare tile is painted the remaining colour.',
  },
  paramour: {
    name: 'The Paramour', emoji: '💘', rarity: 'rare', cost: 8,
    desc: '×3 Mult for any of the thousands of words The Paramour finds romantic — and a {PACKAGE_CHANCE} chance of {PARCEL_ROMANTIC} for the workbench.',
  },
  sexton: {
    name: 'The Sexton', emoji: '⚰️', rarity: 'rare', cost: 8,
    desc: '×3 Mult for any of the thousands of words The Sexton finds spooky — and a {PACKAGE_CHANCE} chance of {PARCEL_SPOOKY} for the workbench.',
  },
  vulgarian: {
    name: 'The Vulgarian', emoji: '🍑', rarity: 'rare', cost: 8,
    desc: '×3 Mult for any of the thousands of words The Vulgarian finds rude — and a {PACKAGE_CHANCE} chance of {PARCEL_RUDE} for the workbench.',
  },
  astronomer: {
    name: 'The Astronomer', emoji: '🔭', rarity: 'rare', cost: 9,
    desc: '+{ASTRONOMER_STEP} Mult for each word already printed this page.',
  },
  overseer: {
    name: 'The Overseer', emoji: '📋', rarity: 'rare', cost: 9,
    desc: 'Print one more word each page.',
  },
  cartographer: {
    name: 'The Cartographer', emoji: '🗺️', rarity: 'rare', cost: 12,
    desc: '×{CARTOGRAPHER_MULT} Mult for words whose vowels run in alphabetical order. A repeated vowel breaks the run, unless one tile spells the pair.',
  },
  skimmer: {
    name: 'The Skimmer', emoji: '👓', rarity: 'rare', cost: 12,
    desc: 'Words are accepted with their middle letters in any order, so long as the first and last letters are right.',
  },
};

// Fill a card's {KNOBS} the moment the module loads, so nothing downstream has
// to know templates exist. An unknown knob is a typo — fillKnobs says so loudly
// rather than shipping a card reading "{ESPALER_STEP}".
for (const [id, card] of Object.entries(PATRON_CARDS)) {
  card.desc = fillKnobs(card.desc, KNOBS, `patron-cards: ${id}`);
}
