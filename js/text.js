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
//                         the Colophon's picks, and the headings and buttons of
//                         the Market, the Black Market and the Colophon.
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
//   js/main.js            The running narration in the status log — "The Ripper
//   js/sheets.js          turns the knife over…", "The book is clear." These
//                         stay at the moment they are spoken, because each is
//                         written around the values it reports.
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
  right: { label: 'Right nick', desc: '×{NICK_MULT} Points to every tile on its right.' },
  left:  { label: 'Left nick',  desc: '×{NICK_MULT} Points to every tile on its left.' },
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
    desc: 'Worth nothing on its own.',
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
    body: 'Step a letter a single place up or down the alphabet.',
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
