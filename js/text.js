// ═══ THE WRITING ══════════════════════════════════════════════════════════════
//
// Everything in this file is COPY, not code. Rewrite any of it freely: nothing
// below is read for its meaning, only for its words. Change a description and
// the shop card, the tooltip and the calling card all change with it, because
// each of them reads from here.
//
// This file imports nothing, deliberately — it is the leaf of the whole tree, so
// there is never a question of what you may safely say in it.
//
//
// ─── WHERE EVERY WORD IN THE GAME LIVES ───────────────────────────────────────
//
//   js/text.js            THIS FILE. The things you own and the sheets you use:
//                         trims, nicks, colours, metals, tools, parcels, stalls,
//                         the Colophon's picks, the headings and buttons of the
//                         Market, the Black Market and the Colophon — and the
//                         NARRATOR: every line the status log speaks, the
//                         banners, the refusals and the end screens (LOG_TEXT,
//                         below).
//
//   js/patron-cards.js    Every patron: name, portrait, price, rarity, guild and
//                         the sentence on the calling card. (What a patron DOES
//                         is js/patrons.js, beside the same id.)
//
//   js/boss-cards.js      Every editor who takes the desk at a Deadline: name,
//                         portrait, and the house rule in their own voice. (What
//                         the rule DOES is js/bosses.js, beside the same id.)
//
//   js/quips.js           The unsolicited opinions patrons pop after a good word.
//
//   js/chapters.js        The chapter titles a run draws from.
//
//   wordlists/            Every word list: the dictionary, the themed lists —
//                         cute, romantic, rude, spooky and the parts of speech —
//                         the dummy letters, and the barred words. One word per
//                         line, and the paths are js/themes.js.
//
//   js/patrons.js         The one-line notes a patron's own hooks report as a
//                         word prints ("3 Coins collected — the book is
//                         clear"), which stay beside the hook that computes
//                         them. Everything else the game SAYS is LOG_TEXT here.
//
//
// ─── {KNOBS} AND {0} SLOTS ────────────────────────────────────────────────────
//
// Copy may quote a tuning number rather than repeating it, so retuning the game
// retunes the words with it:
//
//   {TONGS_BONUS}        the value of that constant, filled as the game loads
//   {1/DIPPER_CHANCE}    one over it, rounded — for "a 1-in-4 chance"
//
// A knob that does not exist is a typo, and the game says so loudly at load
// rather than shipping a card that reads "{TONGS_BONS}". The knobs available
// are listed in KNOBS at the foot of js/constants.js.
//
// A few lines also carry NUMBERED slots — {0}, {1} — for something only known as
// the line is spoken: which colour the tube holds, which metal the applicator
// carries. The comment above each says what each slot will be.

// ─── The filler ───────────────────────────────────────────────────────────────
// Shared by this file's tables and by js/patron-cards.js, so there is one
// implementation of what a {KNOB} means.

// Replace every {KNOB} in `str` from `knobs`. `where` only names the offender in
// the error, so a typo points at the line that has it.
export function fillKnobs(str, knobs, where = 'text') {
  return String(str).replace(/\{(1\/)?([A-Z_][A-Z0-9_]*)\}/g, (_, inverse, knob) => {
    if (!(knob in knobs)) throw new Error(`${where} wants unknown knob {${knob}}`);
    return String(inverse ? Math.round(1 / knobs[knob]) : knobs[knob]);
  });
}

// The same, over every string field of a table of { id: { …, field: str } }.
export function fillTable(table, knobs, where = 'text', fields = ['desc', 'body', 'label', 'empty', 'head']) {
  for (const [id, entry] of Object.entries(table)) {
    for (const f of fields) {
      if (typeof entry?.[f] === 'string') entry[f] = fillKnobs(entry[f], knobs, `${where}: ${id}`);
    }
  }
  return table;
}

// Fill {0}, {1}, … from a list — the runtime slots described above.
export const fillSlots = (str, ...values) =>
  String(str).replace(/\{(\d+)\}/g, (m, i) => (values[i] ?? m));

// ═══ THE NARRATOR ══════════════════════════════════════════════════════════════
//
// Every line the status log speaks — and the banners, refusals and end screens
// beside it — in one table. The code only decides WHEN a line is said and what
// goes in its {0} {1} slots; the words are all here. The comment before each
// group says what the slots will hold.
//
// Where English forks on a count, there are two keys — `xxx` for many and
// `xxx1` for exactly one — because "1 Coins" is not a line anyone should read.
// A few entries are SUFFIXES, marked ⌐: fragments another line carries in a
// slot when there is more to say (they start with their own space).

export const LOG_TEXT = {
  // ─── Modes & small refusals ─────────────────────────────────────────────────
  discardCancelled: 'Discard cancelled.',
  discardArmed:     'Tap tiles to discard, then press again.',
  noDiscardsLeft:   'No discards left this page.',
  toolBack:         'The {0} goes back on the workbench.',           // {0} tube | ratchet
  sundryThrownAway: '{0} — thrown away, and the slot is free.',      // {0} the tool's name
  reshuffleSpend:   'Spend this at the Market or the Colophon.',
  dictLoading:      'The dictionary is still loading…',

  // The board's refusals when a tap can't mean what it asked (js/drag.js).
  oneTileAtATime:  'One tile at a time — deselect first.',
  immutableTile:   'A lent tile takes no paint — nor does a ghost.',
  unshiftable:     'The ratchet steps single letters — not ligatures or marks.',
  unoffered:       'Only the glowing tiles are on offer.',
  loupeCapped:     'That tile is already at its finest — the loupe goes no further.',
  cursedNoDiscard: 'A cursed tile cannot be discarded — it has to be played.',
  lentNoDiscard:   'A lent tile cannot be discarded — play it or let the page end.',
  seatOrder:       '{0} takes seat {1} — patrons act in the order they sit.',

  // The press's refusals when a word can't print as set.
  ruleNeedsPair: 'A rule needs its pair — one at each end.',
  ruleTwoMost:   'Two rules to a word, no more.',
  ruleBracket:   'Rules bracket the word — one at each end.',
  ruleWantsWord: 'The rules want a word between them.',
  marksGoLast:   'Marks go last, as ? or ! or ?!.',
  markNeedsWord: 'A mark needs a word in front of it.',
  fleuronAlone:  'The fleuron sets no word — it prints alone.',
  notAWord:      "“{0}” isn't in the dictionary.",              // {0} the word

  // ─── The printed word ───────────────────────────────────────────────────────
  // {0} word · {1} points · {2} mult · {3} total — then the suffixes it may carry.
  printedWord:      '”{0}” — {1} × {2} = {3}.',
  printedCoins:     '  +{0} Coins.',                                 // ⌐ {0} how many
  printedCoin1:     '  +1 Coin.',                                    // ⌐
  printedDiscards:  '  +{0} Discards.',                              // ⌐
  printedDiscard1:  '  +1 Discard.',                                 // ⌐
  printedBagged:    '  {0} slipped back into the bag.',              // ⌐ {0} tile count
  printedBurned:    '  {0} burned to ash.',                          // ⌐
  pardonStands:     '  {0} {1} lets it stand for {2}.',              // ⌐ emoji · name · the word it reads as
  vouchSteno:       '  📟 The Stenographer vouches for it.',         // ⌐
  vouchExpectants:  '  🤰 The Expectant Parents had that very name on their list.',  // ⌐

  // ─── Patrons acting beyond the score ────────────────────────────────────────
  catNotice:        '🐈 Somewhere beyond the lamplight, something sits up and takes an interest.',
  economiserSpares: '🗑️ The Economiser reaches into the case, and thinks better of it — the press is down to its last sorts.',
  economiserEats:   '🗑️ The Economiser melts down the {0} you left in the case — gone for good.',
  roseNoTable:      '🎀 The rose metal shines, and there is nobody at the table to crown.',
  roseCrown:        '🎀 {0} was struck in rose metal — {1} is crowned, +{2} Points on every word.',
  ripperAlone:      '🔪 The Ripper turns the knife over, and finds nobody at the table but himself.',
  ripperNoRoom:     '🔪 The Ripper stays his hand — there is no room left among your ghosts.',
  ripperMurder:     '🔪 {0} is murdered — and works on as a ghost, its seat now empty.{1}',
  ripperWaits:      ' The Ripper waits for another word.',           // ⌐
  ripperGone:       ' The Ripper is gone.',                          // ⌐
  benchFullGift:    '{0} {1} had something for you, and your workbench is full.',   // {0} emoji · {1} name
  dabblerSplash:    '🖍️ The Dabbler splashes {0} {1} as well.',                     // {0} letter · {1} colour
  revenantHand:     '💀 The Revenant walks {0} back out of the hellbox in ghost metal — it costs you no room in the hand.',
  revenantCase:     '💀 The Revenant walks {0} back out of the hellbox — it will be waiting in the case.',
  neologistRetires: '“{0}” is a word now, and always will be. The Neologist retires, satisfied.',

  // ─── Tools spent on the board ───────────────────────────────────────────────
  bodkinEmptyBag:  'The bag is empty — nothing left in it to reach for. The bodkin keeps.',
  bodkinGone:      'That one has already left the bag. The bodkin keeps.',
  bodkinFinds:     'The bodkin finds the {0} and lifts it out of the bag.{1}',
  bodkinOverHand:  ' Your hand is over its size — nothing will be drawn until it is back under.',  // ⌐
  packageOpened:   '{0} {1} — {2}',                                  // emoji · parcel name · what was inside
  applicatorNone:  'Nothing in your hand will take a new metal — the applicator keeps.',
  applicatorOffer: 'The applicator offers {0} tiles — tap the one to strike in {1}.',
  applicatorOne:   'Only one tile will take a new metal — tap it.',
  struckIn:        '{0} is struck in {1} — {2}',                     // letter · metal · what the metal does
  potionSeat:      'The potion is uncorked — {0} is smitten, and takes a seat for nothing.',
  laurelNone:      'No patron seated to crown — the laurel keeps.',
  laurelCrown:     "🏵️ {0} is crowned — +{1} Points on every word, paid at that seat's turn, while the seat is kept{2}.",
  laurelCount:     ' ({0} laurels now)',                             // ⌐
  washNone:        'Nothing in your hand will take the wash — it keeps.',
  washSettles:     'The wash settles: {0} — faint, and spent when each tile prints.',   // {0} "E amber, R jade"
  tubeNone:        'Nothing in your hand will take paint — the tube keeps.',
  tubeOffer:       'The tube offers {0} tiles — tap the one to paint.',
  tubeOne:         'Only one tile will take paint — tap it.',
  painted:         'Painted {0} {1}.',                               // letter · colour
  tongsGrip:       'The tongs grip {0} — ash, and +{1} Points waiting on the next word.',
  tongsFloater:    '+{0} to the next word',                          // over the groove, not in the log
  ratchetArmed:    'Tap a letter — the ratchet will offer you a step either way.',
  ratchetPickWay:  'Tap one of the two letters on the ratchet to step it there.',
  ratchetSteps:    'The ratchet steps {0} to {1} — and there it stays.',
  loupeArmed:      'Tap a tile to double it — {0} Points is the loupe\'s limit.',
  tongsArmed:      'Tap a tile, then the tongs again to feed it to the furnace.',

  // ─── Seats kept and given up ────────────────────────────────────────────────
  patronDeparts:   '{0} departs with thanks — {1} Coins returned.',
  patronDeparts1:  '{0} departs with thanks — 1 Coin returned.',
  ghostLetGo:      "{0} is let go — a ghost's contract is worth nothing.",
  headsmanNow:     '🪓 The Headsman approves — ×{0} Mult now.',
  headsmanAt:      '🪓 The Headsman is at ×{0} Mult.',
  soldBack:        'Sold back for {0} Coin.',

  // ─── Patrons with a button of their own ─────────────────────────────────────
  usurerOneBook:   '🧾 One book at a time.',
  usurerLoan:      '🧾 {0} Coins, and {1} written in the book — {2} as each page ends. He keeps his seat until it is clear.',
  usurerShort:     '🧾 {0} Coins would clear the book. You have {1}.',
  usurerClear:     '🧾 The book is clear. He bows, and is yours to dismiss.',
  plateCold:       '💵 The plate is cold until the next page.',
  plateHandFull:   '💵 Your hand is full — there is nowhere to put a forgery.',
  counterfeitMade: '💵 A counterfeit {0} — worth nothing, and yours till the page turns.',
  scienceStandards:'🔬 One tile per page — science has standards.',
  scientistLends:  '🔬 The Scientist lends a gold-trimmed OLOGY tile — for this page only.',

  // ─── The Bribrarian's desk ──────────────────────────────────────────────────
  bribePaid:       '🤝 {0} Coins across the desk — every word this page at ×{1} Mult.{2}',
  bribePaid1:      '🤝 1 Coin across the desk — every word this page at ×{1} Mult.{2}',
  bribeDebt:       '  The purse is {0}: the Market is shut until it is clear.',   // ⌐
  bribeNone:       '🤝 Not a penny. Every word this page at ×{0} Mult.',

  // ─── Pages turning ──────────────────────────────────────────────────────────
  bossTakesDesk:      '{0} {1} takes the desk. {2}',                 // emoji · name · their rule
  bannerDeadlineMet:  'Deadline met',
  bannerPageDone:     'Page complete',
  bannerBossPleased:  '{0} {1} is satisfied — {2} of {3}',           // emoji · name · score · quota
  bannerPageScore:    '{0} of {1} — {2}',                            // score · quota · chapter title
  appendicesBegin:    'The appendices begin — quotas keep climbing. Good luck.',

  // ─── The Market, the alley, the Colophon ────────────────────────────────────
  bmTileBought:    'Bought “{0}”{1} for {2} Coins.',                 // letter · ⌐bmInMetal or '' · price
  bmInMetal:       ' in {0}',                                        // ⌐ the metal's name
  bmPatronSeat:    '{0} takes a seat — {1} Coins, and no questions.',
  bmSundry:        '{0} goes on the workbench.',
  bmDismissed:     '{0} is dismissed{1}.',                           // name · ⌐bmForCoins or ''
  bmForCoins:      ' for {0} Coins',                                 // ⌐
  compostLifted:   'Lifted from the heap — it joins the bag next page.',
  tileBought:      'New tile joins the bag next page.',
  marketDeparts:   '{0} departs — {1} Coins back.',
  marketDeparts1:  '{0} departs — 1 Coin back.',
  colophonSkipped: 'Skipped the Colophon — +{0} Coins instead.',

  // ─── The Testing Chamber (the playtest bench) ───────────────────────────────
  chamberSeat:       '{0} takes a seat.',
  chamberHaunt:      '{0} works on, dead.',
  chamberStruck:     'Struck {0} for the case.',
  chamberScrapped:   'Scrapped {0}.',
  chamberExperiment: '{0} switched {1} for this run.',

  // ─── Loading & returning ────────────────────────────────────────────────────
  customListLoaded:  'Custom word list loaded: {0} words.',
  exclusionsMissing: 'The excluded-words list could not be read — word lists are unfiltered this session.',
  welcomeBack:       'Welcome back.',
  mercuryRetired:    'The mercury trim has been retired — {0} tiles wear cobalt instead. Azure tiles find their way back to the bag through The Fountain now.',
  mercuryRetired1:   'The mercury trim has been retired — 1 tile wears cobalt instead. Azure tiles find their way back to the bag through The Fountain now.',
  orphanSeats:       '{0} seats are no longer in the roster and have left the shelf.',
  orphanSeat1:       '1 seat is no longer in the roster and has left the shelf.',

  // ─── The end of the run ─────────────────────────────────────────────────────
  endLoseTitle:    'The press falls silent',
  endLoseSub:      '{0}, {1} — the quota of {2} went unmet.{3}',     // chapter · endLoseDeadline/endLosePage · quota · ⌐endLoseBoss or ''
  endLoseDeadline: 'the Deadline',
  endLosePage:     'page {0}',
  endLoseBoss:     ' {0} {1} remains unimpressed.',                  // ⌐ emoji · name
  endWinTitle:     'The folio is complete',
  endWinSub:       "Ten chapters set, proofed, and printed. The house's finest work.",
  endNewRun:       'Begin a new folio',
  endEndless:      'Keep printing (appendices)',
};

// Look a line up and fill its slots — loudly, so a mistyped key is a crash at
// the moment it is spoken rather than an "undefined" in the player's log.
export function logLine(key, ...values) {
  const s = LOG_TEXT[key];
  if (s == null) throw new Error(`LOG_TEXT has no line '${key}'`);
  return fillSlots(s, ...values);
}

// ═══ THINGS YOU OWN ════════════════════════════════════════════════════════════

// ─── Trims (the band around a tile's edge) ────────────────────────────────────
export const TRIM_TEXT = {
  gold:   { label: 'Gold',   desc: '+1 Coin.' },
  silver: { label: 'Silver', desc: '+{SILVER_BONUS} Points.' },
  cobalt: { label: 'Cobalt', desc: 'Refunds a Discard.' },
  purple: { label: 'Purple', desc: 'Adds +{PURPLE_TRIM_STEP} to the purple multiplier.' },
};

// ─── Nicks (a notch cut out of one edge) ──────────────────────────────────────
export const NICK_TEXT = {
  right: { label: 'Right nick',
           desc: 'Scores again every tile on its right — their Points are added to this one. '
               + 'A nicked tile among them counts only the number it wears in the hand.' },
  left:  { label: 'Left nick',
           desc: 'Scores again every tile on its left — their Points are added to this one. '
               + 'A nicked tile among them counts only the number it wears in the hand.' },
};

// ─── Colours (tile paint) ─────────────────────────────────────────────────────
// {0} is the colour's own label, so the sentence names it twice from one entry.
export const COLOUR_TEXT = {
  crimson: { label: 'Crimson' },
  azure:   { label: 'Azure' },
  jade:    { label: 'Jade' },
  amber:   { label: 'Amber' },
};
export const COLOUR_DESC = 'Each {0} tile adds +1 to the {0} multiplier.';

// The multiplier chips that come from somewhere other than paint.
export const MULT_TRACK_TEXT = {
  purple: { label: 'Purple' },
  cursed: { label: 'Cursed' },
  length: { label: 'Length' },
};

// ─── Metals (what a sort is cast in) ──────────────────────────────────────────
// `metal` is the name of the material itself, as a founder would say it; `label`
// is the short word the board uses.
export const MATERIAL_TEXT = {
  cursed: {
    label: 'Cursed', metal: 'Hellbox iron',
    desc: '×{CURSED_MULT} Mult when printed. Cannot be discarded. Words set while this remains in your hand lose {CURSED_PENALTY} Points.',
  },
  ghost: {
    label: 'Ghost', metal: 'Ghost metal',
    desc: 'Does not count against your hand size. Unmodifiable.',
  },
  rainbow: {
    label: 'Rainbow', metal: 'Rainbow roll',
    desc: 'Counts as every colour to your patrons.',
  },
  blind: {
    label: 'Blind', metal: 'Blind emboss',
    desc: 'Struck into the paper carrying no ink. A word set with one in it is never spiked — the editor cannot see what was never printed.',
  },
  rose: {
    label: 'Rose', metal: 'Rose metal',
    desc: 'Crowns a random patron with a laurel.',
  },
};

// ─── Sundries (what sits on the workbench) ────────────────────────────────────
// `head` is the name on the card, `body` what it does. The last three name
// something chosen at the moment they are read:
//   tube        {0} the colour's name, {1} what that colour does
//   applicator  {0} the applicator's name, {1} the metal, {2} what the metal does
//   package     handled by PACKAGE_TEXT below — a parcel says its own name
export const SUNDRY_TEXT = {
  ratchet: {
    head: 'Ratchet',
    body: 'Tap a letter in your hand, then choose which of its two neighbours it becomes — permanently. (The press carries no lone Q, so P steps straight to R.)',
  },
  reshuffle: {
    head: 'Reshuffle',
    body: 'Reroll offerings at the Market or the Colophon.',
  },
  toolbox: {
    head: 'Toolbox',
    body: 'Unwrap to gain two tools (space permitting).',
  },
  bodkin: {
    head: 'Bodkin',
    body: 'Choose any one tile from your bag, and add it to your hand.',
  },
  loupe: {
    head: 'Loupe',
    body: 'Double the value of a tile (to a max of {LOUPE_CAP}).',
  },
  laurel: {
    head: 'Laurel',
    body: 'Crowns a random seated patron. A crowned patron pays +{HONORIFIC_STEP} Points on every word, '
        + 'at its own turn. Patrons can balance an infinite number of laurels on their heads.',
  },
  tongs: {
    head: 'Tongs',
    body: 'Destroys a tile. Also, gives your next word +{TONGS_BONUS} Points.',
  },
  wash: {
    head: 'Ink wash',
    body: 'Up to {WASH_COUNT} unpainted tiles in your hand gain temporary paint, which '
        + 'washes off on printing.',
  },
  wrapped: {
    head: 'A wrapped tile',
    body: 'Unwrap it to gain one tile made of an exotic material.',
  },
  potion: {
    head: 'Love potion',
    body: 'Uncork it and a RARE patron takes an empty seat at your table.'
        + 'You sexy thing, you.',
  },
  tube: {
    head: 'Tube of {0}',
    body: 'Paints one tile in your hand. {1}',
  },
  applicator: {
    head: '{0} applicator',
    body: 'Lays out two tiles from your hand; the one you pick is struck in {1}. {2}',
  },
};

// The short names the bench and the shop card use for a tool.
export const TOOL_TEXT = {
  bodkin:  'Bodkin',
  toolbox: 'Toolbox',
  loupe:   'Loupe',
  laurel:  'Laurel',
  tongs:   'Tongs',
  wash:    'Ink wash',
  potion:  'Love potion',
};

export const APPLICATOR_TEXT = {
  rainbow: 'Rainbow roll',
  cursed:  'Hellbox iron',
};

// ─── The registers' parcels ───────────────────────────────────────────────────
// One per themed-wordlist patron. `label` is what the parcel is called, `body`
// what might be inside it.
export const PACKAGE_TEXT = {
  romantic: {
    label: 'A billet-doux',
    body: 'Sealed and scented. Contains one of three possible romantic rewards.',
  },
  spooky: {
    label: 'Grave goods',
    body: 'Exhumed from coffin. Contains one of three possible spooky rewards.',
  },
  cute: {
    label: 'A party bag',
    body: 'Somebody had a birthday. Contains one of three possible cute rewards.',
  },
  rude: {
    label: 'A plain brown wrapper',
    body: 'No return address. Contains one of three possible rude rewards.',
  },
};

// ─── The stalls at the Market ─────────────────────────────────────────────────
// `empty` is what the stall says when it has nothing left to work on.
export const STALL_TEXT = {
  smelter: {
    name: 'The Smelter', emoji: '🔥',
    desc: 'Feeds tiles to the furnace, destroying them forever.',
  },
  painter: {
    name: 'The Painter', emoji: '🖌️',
    desc: 'Proposes colours for six unpainted tiles.',
    empty: 'Every tile you own already wears paint.',
  },
  gilder: {
    name: 'The Gilder', emoji: '⚜️',
    desc: 'Proposes trims for six untrimmed tiles.',
    empty: 'Every tile you own already wears a trim.',
  },
  punchcutter: {
    name: 'The Punchcutter', emoji: '⚒️',
    desc: 'Cuts a second letter into the back side of a tile.',
    empty: 'Every tile you own already holds two letters.',
  },
  dresser: {
    name: 'The Dresser', emoji: '🪚',
    desc: 'Cuts a nick into the edge of a tile.',
    empty: 'Every tile you own already carries a nick.',
  },
  stereotyper: {
    name: 'The Stereotyper', emoji: '🗜️',
    desc: 'Casts an exact copy of any tile.',
  },
};

// ─── The Colophon's picks ─────────────────────────────────────────────────────
export const UPGRADE_TEXT = {
  handSize:      { name: '+1 Hand size',       desc: 'One more tile in your hand, every page.' },
  discard:       { name: '+1 Discard',         desc: 'One more discard, every page.' },
  patronSeat:    { name: '+1 Patron seat',     desc: 'Room for one more patron.' },
  workbenchSlot: { name: '+1 Workbench slot',  desc: 'Room for one more sundry.' },
  blackmarket:   {
    name: 'The Black Market',
    desc: 'An unmarked door leads to the black market.' 
        + 'Sells goods that are otherwise difficult or impossible to come by.',
  },
};
// {0} is how many tiles a pot covers, {1} the colour's name.
export const PAINT_UPGRADE_TEXT = {
  name: '{0} paint',
  desc: 'Paints {1} unpainted letters {0}.',
};

// ─── The measure (a cheer for a long word) ────────────────────────────────────
// Each entry is only the reaction clause: the board puts the count and the ×Mult
// in front, so a line reads "6 letters — ×2 Mult: good!" Longer words fall
// through to LENGTH_FLOURISH_BEYOND. Keep them short — the floater is a cheer,
// and it holds only long enough to be read.
export const LENGTH_FLOURISHES = {
  6:  'good!',
  7:  'very good!',
  8:  'great!',
  9:  'astounding!',
  10: 'a credit to mankind!',
  11: 'words fail us.',
  12: 'the Spelling Bee herself could do no better.',
};
export const LENGTH_FLOURISH_BEYOND = 'the stuff of legend.';

// ═══ THE SHEETS ════════════════════════════════════════════════════════════════
// Headings, sub-headings, notes and buttons. A `sub` is the small grey line
// beside a heading; a `note` is the sentence under a title.

export const MARKET_TEXT = {
  title:        'The Market',
  patrons:      'Patrons',
  patronsSub:   'calling today',
  noPatrons:    'No patrons calling today.',
  tiles:        'Tiles',
  sundries:     'Sundries',
  stalls:       'Stalls',
  stallsSub:    'prices double with each purchase',
  table:        'Your table',
  tableHint:    'drag a card to change the running order',
  bench:        'Workbench',
  compost:      'The compost heap',
  compostTake:  '{0} rotted down — take as many as you like',   // {0} how many are on the heap
  compostSpent: 'the heap is bare — burn something',
  compostEmpty: 'nothing has rotted down yet',
  reroll:       'New offers',
  rerollTip:    'Re-rolls patrons, tiles, sundries and stalls — the fee doubles each time. '
              + "A stall you've already paid keeps its raised price this visit.",
  factorTip:    'The Factor is covering the next {0}.',   // {0} "fee" / "3 fees"
  reshuffle:    '↻ Reshuffle',
  reshuffleTip: 'A free re-roll',
  collection:   'Your collection',
  leave:        'Next page ❧',
  stallBack:    '← Back to the market',
  smeltFloor:   'Your collection is too small to smelt further.',
  earned:       'earned',
  seated:       '{0}/{1} seated',                    // {0} seats taken, {1} seats owned
  seatsFull:    ' — dismiss one to make room',
  benched:      '{0}/{1} on the workbench',
  benchFull:    ' — sell one to make room',
};

export const BLACK_MARKET_TEXT = {
  title:      'The Black Market',
  note:       'Nothing here is sold at the fair, and nothing here is cheap. '
            + 'Buy what you want; the door shuts behind you.',
  tiles:      'On the table',
  tilesSub:   'rare metals, and punctuation — sold nowhere else',
  patrons:    'In the back room',
  patronsSub: 'rare patrons only',
  noPatrons:  'No one is waiting in the alley tonight.',
  sundries:   'Under the counter',
  leave:      'On to the market ❧',
  gone:       'gone',
  // The caption under a contraband tile. {0} is the metal's name.
  metalNote:  '{0}',
  markNote:   'Punctuation',
  // The tooltip on a patron's price. {0} the fair's price, {1} the alley's markup.
  markupTip:  '{0} at the fair · {1} Coins over, for the walk',
  postnomTip: '{0} Coins over for the {1}',          // {0} surcharge, {1} the letters
};

export const COLOPHON_TEXT = {
  title:       'The Colophon',
  note:        'Choose one permanent upgrade.',
  empty:       'Nothing left to offer.',
  skip:        'Skip',
  skipTip:     'Decline all three',
  reshuffle:   '↻ Reshuffle',
  reshuffleTip:'Spend a banked reshuffle',
};
