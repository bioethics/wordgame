// Patrons of the print house. Each grants a standing boon.
//
// THIS FILE IS BEHAVIOUR ONLY. A patron's name, emoji, rarity, price, guild and
// card text live against the same id in js/patron-cards.js — edit there to
// rename, reword, reprice or re-rarity one. The two halves are married at the
// bottom of this file.
//
// Conventions for a new patron:
//   · Name it "The <trade>". Give it a card in patron-cards.js first.
//   · Numbers one patron alone cares about live on its def here; numbers
//     anything else reads live in constants.js (and can be quoted into the
//     card text as a {KNOB}).
//   · Randomness the player should feel lucky about goes through luckyRoll.
//   · A patron's memory lives on its seat's `data`, never on the def and never
//     in a module global — it has to survive save and load.
//
// when: 'score' — effect(ctx) runs while a word is scored.
//       'meta'  — handled explicitly elsewhere (page start, page reward,
//                 discards, the dictionary check), or via the hooks below.
//
// Score ctx: { word, tiles, state, data, addPoints(n), addMult(n), xMult(n),
//              addCoins(n) }. The add/x helpers record an animation step.
// `data` is the seat's memory and is READ-ONLY here: scoring runs on every
// keystroke to draw the live preview, so counters advance in onPrinted only.
//
// The patron pass is SEQUENTIAL: seats speak in the order they sit, and a
// ×Mult multiplies everything said in front of it and nothing behind it. A
// seat that adds Points wants to sit ahead of the seats that multiply — see
// the running order in scoring.js, pass 4.
//
// Scoring hooks. All three must be pure functions of the word, giving the same
// answer every time they are asked: scoring re-runs on every keystroke, and an
// answer that wandered would make the live preview a lie.
//
//   tileBonus(tile, ctx) — Points written onto ONE TILE before the word is
//     scored; ctx { tiles, state, data }. Return 0 for a tile the patron
//     doesn't touch. The number lands on the tile itself, so nicks and
//     Monogrammists multiply it. A patron paying for a PROPERTY of the whole
//     word (the Firebrand's two crimson tiles) is not this: it stays an effect()
//     and pays the word.
//
//   bonusIsGrowth — set alongside tileBonus when those Points are the same
//     Points onPrinted then writes into the tile for good (the Abecedarian,
//     the Espalier). Cosmetic only: the groove shows them in jade rather than
//     brass, so a permanent gain never looks like a passing one.
//
//   tilePaint(ctx) — paint laid on tiles BEFORE the word is counted; ctx
//     { tiles, state, data }. Return [{ tile, colour }] or null. Scoring's pass
//     ½ applies it to a copy of the word, so every reader downstream sees the
//     new colour. Provisional until the word prints: the seat's own onPrinted
//     makes it permanent, laying what the script recorded rather than working
//     it out a second time.
//
//   tileEcho(tile, data, tiles) — marks tiles that print TWICE: Points, Coins,
//     cobalt refreshes, paint and trim alike. Pass 0 counts the marking seats
//     and passes 1–3 spend the result, doubling per seat, so two seats naming
//     one tile reach ×4. The whole word arrives as `tiles`, so a seat may pick
//     its tiles out of the word (The Twins) rather than by name.
//
// Optional hooks (main.js dispatches these for every seated patron). Each may
// return { note } to speak over the patron's own card.
//   onPrinted(ctx)    — after a word commits; ctx { tiles, script, state, data,
//                       grow(tile, n), paint(tile, colour), burn(tile),
//                       trim(tile, kind) }. May mutate the collection. Also
//                       returns { say: [line…] } to speak in the status bar at
//                       the foot of the board instead — where news about the
//                       PRESS belongs, a tile leaving the collection above all
//                       (runPrintedHooks in js/main.js); { bubble: text } to pop
//                       it over the card instead, for something SHOWN rather
//                       than said (the Wordler's marking) — and { burned: [tile…] }
//                       for tiles that must not retire to the discard pile.
//   onPageStart(ctx)  — as a page's bag is dealt, before the hand is drawn; ctx
//                       { state, data, cast(overrides) }, where cast strikes a
//                       new tile into hand and collection alike. Also returns
//                       { tiles } so the arrival can be animated.
//   onChapterEnd(ctx) — as a chapter clears, before the next page's bag is
//                       shuffled; ctx { state, data }.
//   onPageComplete(ctx) — as a page's quota clears, while the hand still holds
//                       whatever went unplayed; ctx { state, data }. The hook
//                       for patrons that read the leftover hand — the Factor
//                       banks re-rolls, the Cellarer ages.
//   onDiscard(ctx)    — after tiles are thrown away, before the hand tops up;
//                       ctx { tiles, state, data, paint(tile, colour),
//                       trash(tile), merge(left, right), grow(tile, n),
//                       bench(kind), prime(n) }. prime arms n Points against
//                       the NEXT word printed, credited to this patron so the
//                       readout names it and its card badges it. bench puts a sundry on the workbench and
//                       returns false when there is no room. The tiles are in
//                       the discard pile but still in the collection, so paint
//                       written here waits for the bag to come round; a hand
//                       widened here is felt at once, main.js refilling after
//                       the seats have spoken. Also returns { painted: [{ tile,
//                       colour }] } to show a new colour before the tile flies
//                       off, { trashed: [tile…] } for tiles destroyed outright,
//                       { merged: [{ tile, alt }] } for tiles recast twofaced.
//
// Stackable patrons (the Monogrammist): the card's `stackable: true` lets the
// Market keep offering a patron you already hold, and every seat carries a
// unique `uid` so copies can be badged and animated as themselves. Such defs
// may roll per-copy state with `onOffer()` (shown on the Market card, moved
// onto the seat's data at purchase) and present themselves with instName,
// instShelf, instEmoji and instDesc, each falling back to the plain card field.
// A seat whose OWN state changes what it is (the Azure Prince takes a crown)
// uses the same four, so every view agrees about what it is called and wears.
//
// `popover(data)` is the other half of that: extra HTML for the card's
// tap-through, under the desc and above the dismissal — for a seat with
// something to SHOW rather than say, like the Prince's cypher of boxes.
//
// `guild` (a card field) is thematic, not mechanical: it drives the calling
// card's ribbon and the seat's livery pin, and nothing else — except the
// Alderman, who pays ×1.5 per guild on the shelf, and the guild-counting seats
// (the Orchardist, the Banker). Adding a livery therefore changes what a patron
// is worth to those builds without touching its own effect. Read it through
// guildsOf(def), which always returns an array.
//
// Optional `refundBonus(data)`: extra Coins this seat's dismissal pays on top
// of the standard half-cost — read by patronRefund in market.js.

import {
  GRAFTER_STEP, STOKER_BASE, STOKER_STEP, BEEKEEPER_STEP, ARSONIST_ODDS,
  NUDIST_TRIM_CHANCE, NUDIST_PAINT_CHANCE, ABECEDARIAN_STEP,
  RAGMAN_ODDS, RAGMAN_COINS, REVENANT_ODDS, MATERIALS,
  PACKAGE_ODDS, PACKAGES, PACKAGE_OF_PATRON,
  DYE_TILES_PER_CHAPTER, COLOURS, TRIMS, LIGATURES, isMark,
  BAG_COUNTS, FRONTISPIECE, DIPPER_PAINT_CHANCE,
  HEADSMAN_STEP, ESPALIER_STEP, HONORIFIC_STEP, RIPPER_WORDS, splitMarks, isImmutable,
  medievalExpansions, POSTNOM, GHOST_HIRE,
  PRINCE, princeMult,
  WORDLER,
  WINNOWER_BONUS,
} from './constants.js';
import {
  state, getActiveColour, getActiveLetter, countsAsColour, luckyRoll,
  paintRandomTiles, restingPoints, shuffle, owns, allSeats, effectiveSundrySlots,
} from './state.js';
import { inTheme, themeSize, THEME_SETS } from './themes.js';
import { DICT } from './dict.js';
import { PATRON_CARDS } from './patron-cards.js';

const VOWELS = 'AEIOU';

// The four dearest letters in the case — 8+ Points apiece, one of each in the
// starting bag. The Antiquary pays a finder's fee for any of them.
const RARE_LETTERS = ['J', 'QU', 'X', 'Z'];

const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// ─── The Azure Prince's cypher ────────────────────────────────────────────────
// A row of boxes with one marked: `len` tiles, an azure tile standing at `at`
// (0-based). Rolled fresh each time one is read, so a seat never sets the same
// puzzle twice running.
const rollCypher = () => {
  const len = pick(PRINCE.lengths);
  return { len, at: Math.floor(Math.random() * len) };
};
const princeCrowned = data => princeMult(data?.solved ?? 0) >= PRINCE.crown;

// ─── The Wordler's marking ────────────────────────────────────────────────────
// Wordle's own rule, duplicates and all: greens are claimed first, then yellows
// are drawn from whatever letters the secret has left over. Doing it in one
// pass would mark the second L of LLAMA yellow against a secret holding one L.
// The squares are the emoji Wordle shares in, which need no styling and are
// read instantly by anyone who has played it.
const markGuess = (guess, secret) => {
  const mark = Array.from(guess, () => '⬜');
  const left = {};
  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === secret[i]) mark[i] = '🟩';
    else left[secret[i]] = (left[secret[i]] ?? 0) + 1;
  }
  for (let i = 0; i < guess.length; i++) {
    if (mark[i] === '🟩' || !left[guess[i]]) continue;
    mark[i] = '🟨';
    left[guess[i]] -= 1;
  }
  return mark.join('');
};

// The commonest five-letter words the dictionary will accept, in frequency
// order — common.txt is already filtered to playable words, so anything here
// can actually be set. Returns null until the list has loaded (it is fetched),
// and the callers all roll again later rather than settling for no secret.
const rollSecret = () => {
  const pool = [];
  for (const w of THEME_SETS.common ?? []) {
    if (w.length === WORDLER.length && /^[A-Z]+$/.test(w)) pool.push(w);
    if (pool.length >= WORDLER.pool) break;
  }
  return pool.length ? pick(pool) : null;
};

const wordlerColour = t => countsAsColour(t, 'amber') || countsAsColour(t, 'jade');
// Counted in TILES, not letters: the boxes ARE tiles, and a trailing mark
// stands in the groove like anything else.
const readsCypher = (tiles, c) =>
  !!c && tiles.length === c.len && countsAsColour(tiles[c.at], 'azure');

// Tiles that read as a given colour: the tile's own paint, or a rainbow, which
// reads as every colour at once. Every colour-caring patron goes through here,
// so rainbow metal reaches all of them for free.
const painted = (tiles, colour) => tiles.filter(t => countsAsColour(t, colour));

// Adjacent doubled pairs, counted without overlapping: AAA is one pair,
// AAAA is two. BALLOON has two (LL, OO).
function doubledPairs(word) {
  let n = 0;
  for (let i = 0; i < word.length - 1; i++) {
    if (word[i] === word[i + 1]) { n++; i++; }
  }
  return n;
}

// The Haplographer's licence: a word that becomes a dictionary word when one of
// its letters is printed twice may be read that way (MATE reads as MATTE). The
// rule cuts two ways — main.js consults it at the dictionary check, The Twins
// and The Stammerer at scoring, where it counts as one more doubled pair. The
// scoring half doesn't ask whether the pardon actually fired: a word valid as
// typed that can ALSO be read doubled still pays. Returns the index rather than
// the word because The Twins pay the TILE, so it must name which letter.
function licencedIndex(word) {
  if (!word || word.length < 2) return -1;
  for (let i = 0; i < word.length; i++) {
    const w = word.slice(0, i + 1) + word[i] + word.slice(i + 1);
    if (DICT.has(w)) return i;
  }
  return -1;
}

export function doubledReading(word) {
  const i = licencedIndex(word);
  return i < 0 ? null : word.slice(0, i + 1) + word[i] + word.slice(i + 1);
}

// One extra doubled pair when the Haplographer's licence applies to the word.
const licencedPairs = word =>
  owns('haplographer') && doubledReading(word) ? 1 : 0;

// What a word of tiles spells, marks left off — the reading a patron handed only
// `tiles` must do for itself. Scoring's own `letters` is richer (medieval sorts
// resolved), but the tile hooks are given the tiles alone.
const wordLetters = tiles =>
  tiles.map(getActiveLetter).filter(L => !isMark(L)).join('');

// The tiles standing in a doubled pair — what The Twins read. Walked LETTER by
// letter rather than tile by tile, each letter remembering the tile it came
// from, so a ligature is counted for what it spells: a CH beside an H doubles
// them both, and a tile that spells its own double is a pair by itself.
function doubledTileIds(tiles) {
  const chars = [];
  for (const t of tiles) {
    const L = getActiveLetter(t);
    if (isMark(L)) continue;                  // HELLO! is doubled by its Ls, not its !
    for (const ch of L) chars.push({ ch, tile: t });
  }
  const ids = new Set();
  for (let i = 0; i < chars.length - 1; i++) {
    if (chars[i].ch !== chars[i + 1].ch) continue;
    ids.add(chars[i].tile.id);
    ids.add(chars[i + 1].tile.id);
    i++;
  }
  // The licence read onto the tile it pardons: the single L of BALOON stands
  // for two, so that tile is a doubled letter like any other.
  if (owns('haplographer')) {
    const at = licencedIndex(chars.map(c => c.ch).join(''));
    if (at >= 0) ids.add(chars[at].tile.id);
  }
  return ids;
}

// The medieval sorts, read as the letters they stand for. Readings are tried in
// `reads` order and the first real word wins, else the first reading stands. The
// live preview (scoring) and the print (main.js) both resolve through this one
// function, so they cannot disagree about what þORN spells.
export function resolveMedieval(letters) {
  const options = medievalExpansions(letters);
  if (!options) return letters;
  return options.find(w => DICT.has(w)) ?? options[0];
}

// The Stoker's furnace: lit at STOKER_BASE the moment he sits, STOKER_STEP
// hotter per crimson tile eaten since. His effect and the note his card floats
// both read it here, so the number he promises is the number he pays.
const stokerMult = stacks =>
  Math.round((STOKER_BASE + stacks * STOKER_STEP) * 100) / 100;

// The Binder's licence: two nouns end to end make a word, so DOOM and HAT make
// DOOMHAT. Returns the halves (the log shows its working) or null; three letters
// is the shortest nouns entry, so a compound under six cannot exist. Like the
// Haplographer's, the rule cuts two ways: main.js at the dictionary check, The
// Sculptor at scoring.
export function boundNouns(word) {
  const nouns = THEME_SETS.nouns;
  if (!nouns.size || !word || word.length < 6) return null;
  for (let i = 3; i <= word.length - 3; i++) {
    const head = word.slice(0, i), tail = word.slice(i);
    if (nouns.has(head) && nouns.has(tail)) return [head, tail];
  }
  return null;
}

// Plurals the nouns list doesn't carry. nouns.txt holds singular lemmas only —
// it is The Binder's compounding list first, where two entries have to fit the
// rack together — so rather than double the file, a plural is read back to its
// singular here and looked up as that. A candidate that isn't a noun simply
// misses: the list is the judge, this only decides what to ask it.
const IRREGULAR_PLURALS = {
  CHILDREN: 'CHILD', DICE: 'DIE', FEET: 'FOOT', GEESE: 'GOOSE', LICE: 'LOUSE',
  MICE: 'MOUSE', OXEN: 'OX', PEOPLE: 'PERSON', TEETH: 'TOOTH',
};

function nounSingulars(word) {
  const irregular = IRREGULAR_PLURALS[word];
  if (irregular) return [irregular];
  const drop = n => word.slice(0, -n);
  // MEN covers its compounds too, WOMEN and POSTMEN alike.
  if (word.length > 3 && word.endsWith('MEN'))  return [drop(3) + 'MAN'];
  if (word.length > 3 && word.endsWith('IES'))  return [drop(3) + 'Y'];
  if (word.length > 3 && word.endsWith('VES'))  return [drop(3) + 'F', drop(3) + 'FE'];
  // BOXES → BOX and HORSES → HORSE are the same ending read two ways.
  if (word.length > 3 && word.endsWith('ES'))   return [drop(2), drop(1)];
  if (word.length > 3 && word.endsWith('I'))    return [drop(1) + 'US'];   // CACTI, FUNGI
  // A word ending in SS is no plural: GLASS is one glass.
  if (word.length > 3 && word.endsWith('S') && !word.endsWith('SS')) return [drop(1)];
  return [];
}

// Whether a word reads as a noun — on the list outright, the plural of one on
// it, or two entries stacked while The Binder is seated. That last half is his
// alone: without the seat DOOMHAT is no word at all. His halves stay singular,
// so DOOM and HAT make a word and CATS and HAT still don't.
const readsAsNoun = word =>
  inTheme('nouns', word)
  || nounSingulars(word).some(w => inTheme('nouns', w))
  || (owns('binder') && !!boundNouns(word));

// Every colour represented in a set of tiles, read the way patrons read colour —
// so a rainbow represents all four at once, the Harlequin's whole jackpot.
const distinctColours = tiles =>
  Object.keys(COLOURS).filter(c => tiles.some(t => countsAsColour(t, c)));

// The Illuminator's brief: exactly three colours, and at least one tile that
// reads as no colour and will take paint. The FIRST bare one, deliberately, so
// the answer never changes between keystrokes and the brush at print lands
// where the preview promised. A rainbow reads as all four colours, so a word
// holding one is never at exactly three: the two ignore each other.
function illuminate(tiles) {
  const present = distinctColours(tiles);
  if (present.length !== 3) return null;
  const missing = Object.keys(COLOURS).find(c => !present.includes(c));
  const target = tiles.find(t => !distinctColours([t]).length && !isImmutable(t));
  return target ? { missing, target } : null;
}

// The registers' parcel, written once for all four: each keeps a package behind
// its ×3 and prints one onto the workbench PACKAGE_ODDS of the time it fires
// (PACKAGES in constants.js). A full bench turns the parcel away and says so.
// The score effect and onPrinted share one condition through inTheme, so a
// register can never pay the ×3 and withhold the package, or the reverse.
function registerPatron(id, theme) {
  return {
    id,
    when: 'score',
    effect({ word, xMult }) { if (inTheme(theme, word)) xMult(3); },
    onPrinted({ script, bench }) {
      const word = script?.letters;
      if (!word || !inTheme(theme, word) || !luckyRoll(PACKAGE_ODDS)) return null;
      if (!bench?.({ kind: 'package', theme })) return { note: 'no room on the bench', refused: true };
      return { note: PACKAGES[theme].label };
    },
  };
}

// The dye commons: one per colour, each the same patron in a different pot. They
// paint at a chapter's turn, before the next bag is shuffled, so what they
// colour is in play from the very first draw.
function dyePatron(id, colour) {
  const label = COLOURS[colour].label.toLowerCase();
  return {
    id,
    when: 'meta',
    onChapterEnd() {
      const letters = paintRandomTiles(colour, DYE_TILES_PER_CHAPTER);
      return letters.length ? { note: `${letters.join(', ')} painted ${label}` } : null;
    },
  };
}

// Each entry is an id and what that patron DOES. Its card data lives against
// the same id in js/patron-cards.js and is married to it by the merge just past
// the end of this array.
const PATRON_BEHAVIOURS = [
  // ── Commons ─────────────────────────────────────────────────────────────────
  {
    id: 'apprentice',
    when: 'score',
    effect({ word, addPoints }) { if (word.length === 4) addPoints(10); },
  },
  {
    // The first seat that pays for THROWING TILES AWAY. Once per discard, not
    // per tile — the resource spent is the discard itself, and a handful costs
    // exactly what a single tile does. It stacks: spend both discards before
    // setting a word and both dues ride on it.
    //
    // Armed rather than paid, so it lands on the word AFTER the discard, which
    // is the whole shape of it — you clear the bad rack, then cash the better
    // one. Shares the tongs' pool (primePoints in js/state.js), so the readout
    // names each source and his own card badges his share.
    id: 'winnower',
    when: 'meta',
    onDiscard({ prime }) {
      prime(WINNOWER_BONUS);
      return { note: `+${WINNOWER_BONUS} to the next word` };
    },
  },
  {
    id: 'scholar',
    when: 'score',
    effect({ word, addPoints }) { if (word.length >= 5) addPoints(10); },
  },
  {
    // The one patron you can hold several of. Each copy rolls three letters when
    // the Market lays the card out, and wears an edition number for a name.
    // Copies stack: two loving the same letter double it twice, ×4 by design.
    // What repeats is the WHOLE tile, not just its Points — a monogrammed gold
    // letter pays two Coins, a jade one lifts the jade multiplier by two.
    id: 'monogrammist',
    when: 'meta',       // fires in scoring's pass 2½ via tileEcho
    onOffer() {
      return {
        letters: shuffle(Object.keys(BAG_COUNTS)).slice(0, 3),
        num: 1 + Math.floor(Math.random() * 99000),
      };
    },
    tileEcho(tile, data) { return (data.letters ?? []).includes(getActiveLetter(tile)); },
    instName(data)  { return data?.num ? `Monogrammist № ${data.num.toLocaleString()}` : 'The Monogrammist'; },
    instShelf(data) { return data?.num ? `№ ${data.num.toLocaleString()}` : 'Monogrammist'; },
    instDesc(data)  {
      if (!data?.letters?.length) return PATRON_CARDS.monogrammist.desc;
      const [a, b, c] = data.letters;
      return `A tile showing ${a}, ${b} or ${c} prints twice — Points, trim and paint alike.`;
    },
  },
  {
    // The Monogrammist's echo aimed by the word instead of by a name: a letter
    // standing doubled prints twice. Reads through tileEcho like every other
    // doubling seat, so a Monogrammist and a Twin stack on the same tile — ×4,
    // the same ceiling two Monogrammists reach.
    id: 'twins',
    when: 'meta',       // fires in scoring's pass 2½ via tileEcho
    tileEcho(tile, _data, tiles) {
      return doubledTileIds(tiles ?? []).has(tile.id);
    },
  },
  {
    // "Izzard" is the old English name for Z.
    id: 'izzard',
    when: 'meta',   // consulted at the dictionary check in main.js
  },

  // ── Uncommons ───────────────────────────────────────────────────────────────
  {
    // Paid by the size of the house: +1 Coin per amber patron on the shelf,
    // himself included. Paid in computeReward (js/scoring.js) via guildSeats.
    id: 'banker',
    when: 'meta',
  },
  {
    // Dual livery: amber for the stall he keeps, azure for the latitude in
    // spelling it sells. The stall is one extra tile slot holding one medieval
    // sort (MEDIEVAL in constants.js), never given a second face — a þ that
    // could flip to a P would be nobody's idea of a thorn. He gives nothing on
    // arrival; the stall is the whole of what he is.
    id: 'medievalist',
    when: 'meta',   // the stall is stocked in js/market.js; the sorts are read in js/constants.js
  },
  {
    id: 'quartermaster',
    when: 'meta',
  },
  {
    // Additive, so it queues with the other +Mult seats rather than
    // multiplying what they built. Stacks: ING and TH in one word is +0.5.
    id: 'typesetter',
    when: 'score',
    effect({ tiles, addMult }) {
      const n = tiles.filter(t => LIGATURES.includes(t.letter)).length;
      if (n) addMult(n * 0.25);
    },
  },
  {
    // Paid as a share, so the fee follows the work put into the tile. Growth
    // and silver both count towards the 8 (restingPoints), so a tile can be
    // raised into his notice as well as drawn into it.
    id: 'jeweller',
    when: 'score',
    tileBonus: (t) => {
      const worth = restingPoints(t);
      return worth >= 8 ? Math.round(worth * 0.5) : 0;
    },
  },
  {
    id: 'calligrapher',
    when: 'score',
    tileBonus: t => (getActiveColour(t) ? 3 : 0),
  },
  {
    // No promise, only a thumb on the scale: every draw weighs gold twice as
    // heavily as anything else in the bag (magpieWeight), so the more you gild
    // the more she finds.
    id: 'magpie',
    when: 'meta',   // the draw is weighted in js/state.js
  },
  {
    id: 'herald',
    when: 'score',
    effect({ word, xMult }) {
      if (word.length >= 3 && word[0] === word[word.length - 1]) xMult(2);
    },
  },
  {
    // Reads backwards for a palindrome or for ANOTHER word (DEVIL/LIVED).
    // Three letters minimum, deliberately: ON/NO would be a ×4 for nothing.
    id: 'mirror',
    when: 'score',
    effect({ word, xMult }) {
      if (word.length < 3) return;
      const back = [...word].reverse().join('');
      if (back === word || DICT.has(back)) xMult(4);
    },
  },
  {
    id: 'closer',
    when: 'score',
    effect({ state, xMult }) { if (state.wordsLeft === 1) xMult(3); },
  },
  {
    id: 'novelist',
    when: 'score',
    effect({ word, xMult }) { if (word.length >= 7) xMult(2); },
  },

  // ── Rares ───────────────────────────────────────────────────────────────────
  {
    id: 'overseer',
    when: 'meta',   // read by effectiveWordsPerPage in js/state.js
  },
  {
    id: 'astronomer',
    when: 'score',
    effect({ state, addMult }) { if (state.wordsPrinted > 0) addMult(state.wordsPrinted); },
  },
  {
    id: 'cartographer',
    when: 'score',
    effect({ word, xMult }) {
      if (word.length < 4) return;
      for (let i = 0; i < word.length - 1; i++) if (word[i] > word[i + 1]) return;
      xMult(3);
    },
  },

  // ══ The Colour Guilds ═══════════════════════════════════════════════════════
  // Mult is the product of the colour multipliers, so each colour keeps a guild
  // that makes committing to it an archetype of its own.

  // ── Amber · the counting-house ──────────────────────────────────────────────
  {
    id: 'goldsmith',
    when: 'score',
    tileBonus: t => (countsAsColour(t, 'amber') ? 4 : 0),
  },
  dyePatron('weld', 'amber'),
  {
    // Amber's on-ramp: one Coin whenever amber shows up at all, per word and
    // not per tile.
    id: 'assayer',
    when: 'score',
    effect({ tiles, addCoins }) {
      if (painted(tiles, 'amber').length) addCoins(1);
    },
  },
  {
    id: 'chapman',
    when: 'meta',   // the guarantee is in rollOffers, the price in offerPrice — js/market.js
  },
  {
    id: 'bursar',
    when: 'score',
    effect({ tiles, state, addMult }) {
      if (!painted(tiles, 'amber').length) return;
      const n = Math.min(5, Math.floor(state.coins / 5));
      if (n) addMult(n);
    },
  },
  {
    // Fires once per word however many rare letters it holds. The Izzard turns
    // this into an engine, deliberately: a Z read as an S is still a Z tile.
    id: 'antiquary',
    when: 'score',
    effect({ tiles, addCoins }) {
      if (tiles.some(t => RARE_LETTERS.includes(getActiveLetter(t)))) addCoins(2);
    },
  },
  {
    // The banked rolls live in state.freeRerolls, are spent by the re-roll button
    // before any coin is (rerollMarket in market.js), and expire when that Market
    // closes — an agent works the fair he was sent to. Rainbow counts as amber.
    id: 'factor',
    when: 'meta',
    onPageComplete({ state }) {
      const n = Math.min(2, state.rack.filter(t => countsAsColour(t, 'amber')).length);
      if (!n) return null;
      state.freeRerolls = (state.freeRerolls ?? 0) + n;
      return { note: `${n} free re-roll${n > 1 ? 's' : ''} banked` };
    },
  },
  {
    // Used from his card mid-page rather than at a sheet: tap the card, take the
    // loan. Cast through castLentTile wearing gold trim from birth — the one way
    // a lent tile wears metal, since nothing can be written to it later. Once a
    // page; the flag re-arms below as the next page is dealt.
    id: 'scientist',
    when: 'meta',   // used from his card — the act button in render.js, the loan in main.js
    onPageStart({ data }) { data.used = false; return null; },
  },

  // ── Jade · growth and permanence ────────────────────────────────────────────
  {
    // The growth arrives IN TIME TO SCORE: tileBonus pays the step on the
    // trigger word itself and onPrinted writes the same step in for good. An
    // immutable tile (a ghost, a fleuron) refuses the trellis and pays nothing
    // for it either way — hence the isImmutable guard in both halves.
    id: 'abecedarian',
    when: 'score',
    bonusIsGrowth: true,
    tileBonus: (t, { tiles }) =>
      (wordLetters(tiles).length === 3 && !isImmutable(t) ? ABECEDARIAN_STEP : 0),
    onPrinted({ tiles, grow }) {
      if (wordLetters(tiles).length !== 3) return null;
      const grown = tiles.filter(t => grow(t, ABECEDARIAN_STEP));
      if (!grown.length) return null;
      return { note: `${grown.map(getActiveLetter).join(', ')} grown +${ABECEDARIAN_STEP}` };
    },
  },
  {
    // The word must be wholly bare — no paint, no trim, no nick on ANY tile — a
    // bar that rises as the run dresses your collection, so the seat pays best
    // early and quietly retires itself. Two independent rolls per tile, so one
    // can leave the bath house both trimmed and painted.
    id: 'nudist',
    when: 'meta',
    onPrinted({ tiles, trim, paint }) {
      const bare = t => !t.colour && !t.trim && !t.nick;
      if (!tiles.length || !tiles.every(bare)) return null;
      const kinds = Object.keys(TRIMS);
      const colours = Object.keys(COLOURS);
      const dressed = [], daubed = [];
      for (const t of tiles) {
        if (luckyRoll(NUDIST_TRIM_CHANCE)) {
          const kind = kinds[Math.floor(Math.random() * kinds.length)];
          if (trim(t, kind)) dressed.push(TRIMS[kind].label);
        }
        if (luckyRoll(NUDIST_PAINT_CHANCE)) {
          const colour = pick(colours);
          if (paint(t, colour)) daubed.push(`${getActiveLetter(t)} ${COLOURS[colour].label.toLowerCase()}`);
        }
      }
      const notes = [];
      if (dressed.length) notes.push(`dressed in ${dressed.join(', ')}`);
      if (daubed.length)  notes.push(`painted ${daubed.join(', ')}`);
      return notes.length ? { note: notes.join(' · ') } : null;
    },
  },
  {
    id: 'seedsman',
    when: 'score',
    tileBonus: (t, { state }) => (countsAsColour(t, 'jade') ? state.chapter : 0),
  },
  dyePatron('verdigris', 'jade'),
  {
    // Dual livery, crimson first: destruction is his diet, jade what he makes
    // of it. The allowance scales with the gardeners — one tile per jade patron
    // on the shelf, himself included — in compostLeft (js/market.js) via
    // guildSeats.
    id: 'composter',
    when: 'meta',   // counted in trashFromCollection, rotted and taken in js/market.js
  },
  {
    // A dipped tile takes the new colour whatever it wore before, which is how
    // a careful amber build can find itself speckled.
    id: 'dipper',
    when: 'meta',
    // The `painted` return is what lets the board show the dip: main.js colours
    // those tiles where they stand and holds a beat before they fly to the
    // pile. Without it the player never sees the thing they were paid.
    onDiscard({ tiles, paint }) {
      const dipped = [];
      for (const t of tiles) {
        if (!luckyRoll(DIPPER_PAINT_CHANCE)) continue;
        const colour = pick(Object.keys(COLOURS));
        if (paint(t, colour)) dipped.push({ tile: t, colour });
      }
      if (!dipped.length) return null;
      const said = dipped.map(d => `${getActiveLetter(d.tile)} ${COLOURS[d.colour].label.toLowerCase()}`);
      return { note: `out of the vat: ${said.join(', ')}`, painted: dipped };
    },
  },
  {
    // Two TILES, not two letters: a ligature makes two-tile THE, SING or RATS.
    // The price is the word slot. Growth arrives IN TIME TO SCORE, as with the
    // Abecedarian. A ghost refuses the trellis and pays nothing at score time
    // either; its partner still takes its due.
    id: 'espalier',
    when: 'score',
    bonusIsGrowth: true,
    tileBonus: (t, { tiles }) =>
      (tiles.length === 2 && !isImmutable(t) ? ESPALIER_STEP : 0),
    onPrinted({ tiles, grow }) {
      if (tiles.length !== 2) return null;
      const grown = tiles.filter(t => grow(t, ESPALIER_STEP));
      if (!grown.length) return null;
      return { note: `${grown.map(getActiveLetter).join(', ')} grown +${ESPALIER_STEP}` };
    },
  },
  {
    // Paint begets paint. Needs no hook: every road to permanent paint — tube,
    // Painter, dye, Dipper, Arsonist, Illuminator, Bloodletter — runs through
    // paintTile (state.js), where the splash lives, so it can never miss one.
    // One splash per brushstroke: an echo never echoes.
    id: 'dabbler',
    when: 'meta',
  },
  {
    // Dual livery: jade in mechanic (he matures), amber in what maturity is
    // worth (coin at the end). Ages at most once a page, and the age pays twice
    // — a LAUREL (+HONORIFIC_STEP Points on every word, paid at this seat's own
    // turn, so dragging him ahead of your multipliers is worth real Points) and
    // +1 Coin on dismissal via refundBonus. HELD jade is the price, where the
    // guild's other patrons all want jade played. Rainbow counts.
    id: 'cellarer',
    when: 'meta',
    refundBonus(data) { return data?.aged ?? 0; },
    onPageComplete({ state, data }) {
      if (!state.rack.some(t => countsAsColour(t, 'jade'))) return null;
      data.aged = (data.aged ?? 0) + 1;
      data.honorifics = (data.honorifics ?? 0) + 1;
      return {
        note: `aged ${data.aged} page${data.aged > 1 ? 's' : ''} — `
            + `+${data.honorifics * HONORIFIC_STEP} Points every word, `
            + `+${data.aged} Coin${data.aged > 1 ? 's' : ''} when dismissed`,
      };
    },
  },
  {
    // Jade's Banker: paid by the size of the garden, not by anything you print.
    // Counted through guildSeats, so a dual-livery seat counts as the jade
    // patron it half is, and one The Ripper killed keeps counting from among
    // the ghosts — the trees stand whether or not anyone tends them. Additive,
    // so jade's own seats don't become worth buying for this seat's sake.
    id: 'orchardist',
    when: 'score',
    effect({ addMult }) {
      const trees = guildSeats('jade');
      if (trees) addMult(trees * 0.5);
    },
  },
  {
    id: 'grafter',
    when: 'meta',
    onPrinted({ tiles, grow }) {
      if (!painted(tiles, 'jade').length) return null;
      for (const t of tiles) grow(t, GRAFTER_STEP);
      return { note: `+${GRAFTER_STEP} grown into ${tiles.length} tile${tiles.length > 1 ? 's' : ''}` };
    },
  },
  {
    // He crowns one head only — his own — once per jade tile printed. Nothing in
    // scoring knows about him: laurels are already paid seat by seat for whoever
    // wears them (pass 4), so this hook need only put them on his head. Rainbow
    // crowns him too, and dismissing him takes every crown with him.
    id: 'laureate',
    when: 'meta',
    onPrinted({ tiles, data }) {
      const crowned = painted(tiles, 'jade').length;
      if (!crowned) return null;
      data.honorifics = (data.honorifics ?? 0) + crowned;
      return {
        note: `${crowned > 1 ? `${crowned} laurels` : 'a laurel'} — +${data.honorifics * HONORIFIC_STEP} Points every word`,
      };
    },
  },

  // ── Crimson · sacrifice and fire ────────────────────────────────────────────
  {
    id: 'firebrand',
    when: 'score',
    effect({ tiles, addPoints }) {
      if (painted(tiles, 'crimson').length >= 2) addPoints(15);
    },
  },
  dyePatron('madder', 'crimson'),
  {
    id: 'arsonist',
    when: 'meta',
    onPrinted({ tiles, paint, burn }) {
      const burned = [], flushed = [];
      for (const t of tiles) {
        // The burn is the Arsonist's own bad luck, so it dodges the luck dial;
        // the free paint is a gift, so it doesn't.
        if (Math.random() < ARSONIST_ODDS.burn && burn(t)) { burned.push(t); continue; }
        if (luckyRoll(ARSONIST_ODDS.paint) && paint(t, 'crimson')) flushed.push(t);
      }
      if (!burned.length && !flushed.length) return null;
      const notes = [];
      if (flushed.length) notes.push(`${flushed.length} splashed crimson`);
      if (burned.length)  notes.push(`${burned.length} to ash`);
      return { note: notes.join(', '), burned };
    },
  },
  {
    // The toss is held in state.gambleWon rather than rolled here: this effect
    // runs on every keystroke, so rolling inside it would flicker as you compose
    // and then disagree with what printed. The coin lands BEFORE you set the
    // word, and the shelf shows it.
    id: 'gambler',
    when: 'score',
    effect({ state, xMult }) { if (state.gambleWon) xMult(2); },
  },
  {
    // Throw him exactly two: one is destroyed, the other bled crimson, both
    // certain. WHICH takes which fate is his choice, not yours. Nothing is
    // rolled, so there is nothing for luckyRoll to tilt.
    //
    // He wants the same pair the Typefounder does. Discard hooks fire in seat
    // order (runDiscardHooks in main.js) and a consumed tile is out of every
    // later hook's reach, so whoever sits nearer the head takes the pair —
    // except that the crucible only accepts two plain single letters, so a pair
    // it refuses falls through to whoever sits after it.
    id: 'bloodletter',
    when: 'meta',
    onDiscard({ tiles, paint, trash }) {
      if (tiles.length !== 2) return null;
      const [drained, bled] = Math.random() < 0.5 ? [tiles[0], tiles[1]] : [tiles[1], tiles[0]];
      // Each half stands on its own: a ghost refuses the paint but its partner
      // still drains, and the Smelter's floor can spare the drained tile while
      // its partner still bleeds.
      const trashed = trash(drained) ? [drained] : [];
      const painted = paint(bled, 'crimson') ? [{ tile: bled, colour: 'crimson' }] : [];
      if (!trashed.length && !painted.length) return null;
      const notes = [];
      if (trashed.length) notes.push(`${getActiveLetter(drained)} drained dry`);
      if (painted.length) notes.push(`${getActiveLetter(bled)} bled crimson`);
      return { note: notes.join(', '), trashed, painted };
    },
  },
  {
    // The multiplier pays for the word as READ, so a mark is no shelter (DOGS!
    // is still a plural), but only a LOOSE S is eaten: an S inside a ligature
    // keeps its tile, since swallowing an ING to reach one letter would cost
    // more than the ×2 is worth. The meal goes through the same burn every
    // destruction does, so the Smelter's floor and a lent tile both refuse it —
    // and the word keeps its ×2 either way, paid before the meal.
    id: 'serpent',
    when: 'score',
    effect({ word, xMult }) { if (word.length > 1 && word.endsWith('S')) xMult(2); },
    onPrinted({ tiles, burn }) {
      if (!wordLetters(tiles).endsWith('S')) return null;
      // The last tile that is an S and nothing else: marks trailing it are
      // skipped, a ligature ending in S is left alone.
      const last = [...tiles].reverse().find(t => !isMark(getActiveLetter(t)));
      if (!last || getActiveLetter(last) !== 'S' || !burn(last)) return null;
      return { note: 'the S swallowed', burned: [last] };
    },
  },
  {
    // The only patron who kills another, and the only door to a ghost. Print a
    // watchword and one of your OTHER patrons dies where it sits: it moves to
    // state.ghosts, keeps every part of its effect — hooks, laurels, its turn —
    // and gives up only its seat. Then he flees back to the Market's pool, so
    // each ghost costs a rare hire. WHICH patron dies is not yours to choose,
    // and ghosts speak after every living seat, so a killed +Points seat that
    // sat early loses what its position was worth. The deed is in ripperStrikes
    // rather than a hook: a hook cannot remove its own seat from the loop
    // running it.
    id: 'ripper',
    when: 'meta',   // the deed is done in js/main.js as the word commits
  },
  {
    // Already on the other side of the table, which is what makes it the one
    // thing The Ripper's knife cannot touch (ripperStrikes in js/main.js).
    // Like The Dabbler, it needs no hook and can never miss a death: every road
    // to permanent destruction runs through trashFromCollection, and the rite
    // is performed from inside it. What comes back is the WHOLE tile — paint,
    // trim, nick, grown Points, both faces — struck again in ghost metal, so it
    // costs no room in the hand ever after and takes no further work.
    id: 'revenant',
    when: 'meta',   // the rite is performed inside trashFromCollection (js/state.js)
  },
  {
    // The Bloodletter's rival for the same pair — see his note on seat order.
    // Strictly two-for-one, so the collection shrinks. The merge rules (left
    // tile's finery wins a tie, grown points pour together, only plain single
    // letters will pour) live in mergeTiles in state.js.
    id: 'typefounder',
    when: 'meta',
    onDiscard({ tiles, merge }) {
      if (tiles.length !== 2) return null;
      const [left, right] = tiles;
      const alt = getActiveLetter(right);
      if (!merge(left, right)) return null;
      return {
        note: `${getActiveLetter(left)}|${alt} cast as one`,
        trashed: [right],
        merged: [{ tile: left, alt }],
      };
    },
  },
  {
    // Spends a resource no other patron does: the shelf itself. The count is
    // advanced in sellPatron (js/market.js), never here — scoring runs on every
    // keystroke and `data` is read-only in it. A dismissed Headsman collects
    // nothing on himself, having left the shelf before the axe is counted.
    id: 'headsman',
    when: 'score',
    effect({ data, xMult }) {
      const heads = data?.heads ?? 0;
      if (heads) xMult(Math.round((1 + heads * HEADSMAN_STEP) * 100) / 100);
    },
  },
  {
    // The card is `unlisted`, so it never enters the Market's pool: the only
    // way to a cat is to set the word CAT, whereupon one arrives and takes the
    // first seat at the table (see main.js). Free, so dismissing it pays
    // nothing — the right price for a stray.
    id: 'shorthair',
    when: 'score',
    effect({ word, addCoins }) { if (word.includes('RAT')) addCoins(1); },
    onPrinted({ tiles, script, data, burn }) {
      const notes = [], said = [];
      if ((script?.letters ?? '').includes('RAT')) {
        data.honorifics = (data.honorifics ?? 0) + 1;
        notes.push(`a rat! +${data.honorifics * HONORIFIC_STEP} Points every word`);
      }
      // ONLY the Rat Catcher's own tile is eaten. Loose R, A and T are a rat to
      // smell, not a rat to eat: spelling PIRATE must not cost you the letters.
      // The ligature is the only RAT there is (EXCLUSIVE_LETTERS), so testing
      // the active letter is the same test as "the Rat Catcher's gift".
      const eaten = tiles.filter(t => getActiveLetter(t) === 'RAT' && burn(t));
      if (eaten.length) {
        said.push(eaten.length > 1
          ? `The cat eats ${eaten.length} RAT tiles — gone from your collection for good.`
          : `The cat eats the RAT tile — gone from your collection for good.`);
      }
      return (notes.length || said.length)
        ? { note: notes.join(' · ') || null, say: said, burned: eaten }
        : null;
    },
  },
  {
    id: 'ratcatcher',
    when: 'meta',
    // RAT is a ligature worth 3 Points — exactly what R, A and T score apart —
    // and it comes from nowhere else in the game (see EXCLUSIVE_LETTERS).
    onPageStart({ cast }) {
      const colour = pick(Object.keys(COLOURS));
      const tile = cast({ letter: 'RAT', colour });
      return { note: `a ${COLOURS[colour].label.toLowerCase()} RAT`, tiles: [tile] };
    },
  },
  {
    // Where crimson meets amber: fire and the counting-house, and the effect is
    // the two guilds standing side by side — each pays in its own currency.
    // Dual livery rather than a colour of its own, so what it is worth to an
    // Alderman depends on what your shelf already covers.
    //
    // painted() reads through countsAsColour, so ONE rainbow tile satisfies
    // both halves by itself — the cheapest way to fire him, and intended.
    id: 'alloy',
    when: 'score',
    effect({ tiles, addCoins, addMult }) {
      if (!painted(tiles, 'crimson').length || !painted(tiles, 'amber').length) return;
      addCoins(2);
      addMult(1);
    },
  },
  {
    // The furnace is lit the moment he sits: ×STOKER_BASE before a single tile
    // has gone in, rising by STOKER_STEP for each one that does. Counters
    // advance in onPrinted, so the tiles he eats pay from the next word on.
    id: 'stoker',
    when: 'score',
    effect({ data, xMult }) {
      xMult(stokerMult(data?.stacks ?? 0));
    },
    onPrinted({ tiles, data, burn }) {
      const burned = [];
      for (const t of painted(tiles, 'crimson')) {
        if (burn(t)) { burned.push(t); data.stacks = (data.stacks ?? 0) + 1; }
      }
      if (!burned.length) return null;
      return {
        note: `${burned.length} to the fire — ×${stokerMult(data.stacks)} Mult`,
        burned,
      };
    },
  },

  {
    // Wordle at the press. He marks every five-letter word you print against a
    // secret one, and set the secret itself and he is upgraded for good: every
    // amber and jade tile prints TWICE, paint and all, which doubles those two
    // colour multipliers as well as the Points.
    //
    // Measured in LETTERS, not tiles — a ligature makes RAT+E+S a five-letter
    // word, and Wordle is about letters. (The Azure Prince counts the other
    // way, because his boxes are tiles.)
    //
    // The marking happens only when a word PRINTS, never while it is being
    // composed: a guess has to cost a word, or you would sit at the groove
    // trying letters until the answer fell out, which is not a puzzle.
    id: 'wordler',
    when: 'score',
    onOffer: () => ({ secret: rollSecret() }),

    tileBonus: t => (wordlerColour(t) ? WORDLER.bonus : 0),
    // The upgrade. Reads through tileEcho like the Monogrammist's letters and
    // the Twins' pairs, so pass 0 doubles the whole tile — Points, trim, paint.
    tileEcho: (tile, data) => !!data?.solved && wordlerColour(tile),

    // The list is fetched, so a seat taken before it landed has no secret yet.
    onPageStart({ data }) {
      if (!data.solved) data.secret ??= rollSecret();
      return null;
    },

    onPrinted({ script, data }) {
      if (data.solved) return null;
      const guess = script?.letters ?? '';
      if (guess.length !== WORDLER.length) return null;
      data.secret ??= rollSecret();
      if (!data.secret) return null;

      const mark = markGuess(guess, data.secret);
      // The board is the whole of what makes this solvable rather than a
      // memory test — Wordle shows you every guess you have made.
      data.board = [...(data.board ?? []), { word: guess, mark }].slice(-WORDLER.board);

      if (guess !== data.secret) return { bubble: mark };
      data.solved = true;
      data.secret = null;
      return {
        bubble: mark,
        note: 'the word!',
        say: [`The Wordler's word was ${guess}. Every amber and jade tile prints twice from here.`],
      };
    },

    instName:  data => (data?.solved ? 'The Wordler, Satisfied' : 'The Wordler'),
    instShelf: data => (data?.solved ? 'Wordler ✓' : 'Wordler'),
    instDesc(data) {
      if (data?.solved) {
        return `His word is out. Amber and jade tiles gain +${WORDLER.bonus} Points and print twice — Points, trim and paint alike.`;
      }
      const tried = data?.board?.length ?? 0;
      // Elliptical until you have shown him a five-letter word; the squares
      // teach the rule better than a sentence would, so the card waits.
      return tried
        ? `Amber and jade tiles gain +${WORDLER.bonus} Points. His word is ${WORDLER.length} letters — print it and they print twice.`
        : `Amber and jade tiles gain +${WORDLER.bonus} Points. He loves a secret word.`;
    },

    // His board, Wordle's grid: every guess he has marked, newest last.
    popover(data) {
      if (data?.solved || !data?.board?.length) return '';
      const rows = data.board.map(g =>
        `<div class="wordle-row"><span class="wordle-word">${g.word}</span>`
        + `<span class="wordle-mark">${g.mark}</span></div>`).join('');
      return `<div class="wordle-board">${rows}</div>`;
    },
  },
  // ── Azure · ink, flow, and latitude ─────────────────────────────────────────
  {
    // The one seat that asks for a SHAPE rather than a property: the cypher
    // names a length and a place, and only a word cut to fit reads it. Azure's
    // own trade — a tile standing where it is wanted — made into a puzzle.
    //
    // The cypher lives on the seat's data so it survives save and load, and is
    // rolled at the Market, so what is on the calling card is the puzzle you
    // would be buying.
    id: 'blueprince',
    when: 'score',
    onOffer: () => ({ cypher: rollCypher() }),
    // Silent until he has read something: a neutral ×1 is not a multiplier, and
    // announcing one would put a meaningless step in every print and a badge on
    // a card that has done nothing.
    effect({ data, xMult }) {
      const mult = princeMult(data?.solved ?? 0);
      if (mult > 1) xMult(mult);
    },

    // A seat that arrived by some road other than the shop has no cypher yet.
    onPageStart({ data }) {
      if (!princeCrowned(data)) data.cypher ??= rollCypher();
      return null;
    },

    onPrinted({ tiles, data }) {
      if (princeCrowned(data)) return null;
      data.cypher ??= rollCypher();
      if (!readsCypher(tiles, data.cypher)) return null;

      data.solved = (data.solved ?? 0) + 1;
      if (princeCrowned(data)) {
        data.cypher = null;
        return {
          note: `the last cypher — ×${princeMult(data.solved)} Mult`,
          say: ['The Azure Prince reads the last of his cyphers and is crowned. '
              + 'He sets no more — and his contract is worth a fortune now.'],
        };
      }
      data.cypher = rollCypher();
      return {
        note: `cypher read — ×${princeMult(data.solved)} Mult`,
        say: ['A cypher read. The Azure Prince sets another.'],
      };
    },

    // Crowned, he is a different card: a flat ×Mult, no puzzle, and a ransom.
    instName:  data => (princeCrowned(data) ? 'The Azure King' : 'The Azure Prince'),
    instShelf: data => (princeCrowned(data) ? 'Azure King' : 'Azure Prince'),
    instEmoji: data => (princeCrowned(data) ? '👑' : '🔷'),
    instDesc(data) {
      if (princeCrowned(data)) {
        return `Crowned. ×${PRINCE.crown} Mult, no more cyphers — and ${PRINCE.ransom} Coins `
             + `over the odds if he is ever dismissed.`;
      }
      const read = data?.solved ?? 0;
      const left = Math.round((PRINCE.crown - princeMult(read)) / PRINCE.step);
      const plural = n => `${n} cypher${n > 1 ? 's' : ''}`;
      // Silent about himself until he has done something. The Market card reads
      // through instDesc too, so this elliptical line is what a buyer sees:
      // he is bought on the strength of the puzzle, not of a promise.
      return read
        ? `×${princeMult(read)} Mult, ${plural(read)} read. ${left} more for the crown.`
        : 'Reclaim the crown.';
    },
    refundBonus: data => (princeCrowned(data) ? PRINCE.ransom : 0),

    // The boxes themselves, shown when the card is tapped. A crowned Prince has
    // no cypher left to set, so he shows none.
    popover(data) {
      const c = princeCrowned(data) ? null : data?.cypher;
      if (!c) return '';
      const boxes = Array.from({ length: c.len }, (_, i) =>
        `<span class="cypher-box${i === c.at ? ' cypher-box--marked' : ''}"></span>`).join('');
      return `<div class="cypher" role="img" aria-label="Cypher: `
           + `${c.len} tiles, azure in place ${c.at + 1}">${boxes}</div>`;
    },
  },
  {
    id: 'siren',
    when: 'score',
    tileBonus(t) {
      const L = getActiveLetter(t);
      if (L.length !== 1 || !VOWELS.includes(L)) return 0;
      // countsAsColour, not getActiveColour: a rainbow vowel sings for +6.
      return countsAsColour(t, 'azure') ? 6 : 2;
    },
  },
  dyePatron('woad', 'azure'),
  {
    id: 'marbler',
    when: 'score',
    effect({ tiles, xMult }) {
      if (painted(tiles, 'azure').length >= 2) xMult(2);
    },
  },
  {
    id: 'fountain',
    when: 'meta',   // read by retirePrinted, and by scoring's `returns` flag
  },
  {
    id: 'titivillus',
    when: 'meta',   // consulted at the dictionary check in main.js — the typo prints as typed
  },
  {
    id: 'neologist',
    when: 'meta',   // the coining sheet lives in sheets.js; the word outlives the run
  },

  // ── Wildcards · the glue between guilds ─────────────────────────────────────
  {
    id: 'skald',
    when: 'score',
    effect({ word, state, xMult }) {
      if (word && state.lastFirstLetter && word[0] === state.lastFirstLetter) xMult(2);
    },
  },
  {
    // The Skald's stricter cousin: he reads the whole manuscript, not the last
    // line, so the condition is dead on page one by definition. Marks are
    // stripped from both sides of the comparison, so HELLO! reprints HELLO.
    id: 'copyist',
    when: 'score',
    effect({ word, state, xMult }) {
      if (!word || !state.manuscript?.length) return;
      if (state.manuscript.some(r => (splitMarks(r.word)?.letters ?? r.word) === word)) xMult(2);
    },
  },
  {
    id: 'beekeeper',
    when: 'score',
    // Like The Stoker: the count grows in onPrinted, so the bees you just
    // caught pay from the next word on.
    effect({ data, xMult }) {
      const bees = data?.bees ?? 0;
      if (bees) xMult(Math.round((1 + bees * BEEKEEPER_STEP) * 100) / 100);
    },
    onPrinted({ tiles, data }) {
      const caught = tiles.filter(t => getActiveLetter(t) === 'B').length;
      if (!caught) return null;
      data.bees = (data.bees ?? 0) + caught;
      const mult = Math.round((1 + data.bees * BEEKEEPER_STEP) * 100) / 100;
      return { note: `${caught === 1 ? 'a bee' : `${caught} bees`} — ×${mult} Mult` };
    },
  },
  {
    // Names are vouched through the dictionary check in main.js, like the
    // Stenographer's acronyms — legitimate, not misspellings. Unlike his, the
    // list also PAYS whether or not the word is in the dictionary: GRACE is no
    // less a name for being a word. wordlists-themed/names.txt, rebuilt with
    // tools/build-names-list.mjs.
    id: 'expectants',
    when: 'score',
    effect({ word, addPoints }) {
      if (themeSize('names') && inTheme('names', word)) addPoints(10);
    },
  },
  {
    // "In time to score" is literal: the brush is a `tilePaint` hook, which
    // scoring runs before it counts anything (pass ½), so the fourth colour is
    // on the tile for every reader that follows — it lifts that colour's own
    // multiplier, the Calligrapher pays for a painted tile, and The Harlequin's
    // motley is met by it, all from one word. onPrinted then lays the same paint
    // permanently, read off the script rather than worked out again, so the tile
    // the player watched take the colour is the one that keeps it.
    id: 'illuminator',
    when: 'score',
    tilePaint({ tiles }) {
      const lit = illuminate(tiles);
      return lit ? [{ tile: lit.target, colour: lit.missing }] : null;
    },
    onPrinted({ tiles, script, paint }) {
      const hit = script?.tilePaintSteps?.find(st => st.id === 'illuminator')?.hits?.[0];
      const target = hit && tiles.find(t => t.id === hit.id);
      if (!target || !paint(target, hit.colour)) return null;
      return { note: `${getActiveLetter(target)} illuminated ${COLOURS[hit.colour].label.toLowerCase()}` };
    },
  },
  {
    // A flat multiplier on the page's first word, plus a LAUREL each time that
    // word clears the whole quota alone. The seat wants two things of the
    // running order — the ×Mult is worth more late, the laurels more early.
    id: 'frontispiece',
    when: 'score',
    effect({ state, xMult }) {
      if (state.wordsPrinted !== 0) return;
      xMult(FRONTISPIECE.base);
    },
    onPrinted({ state, script, data }) {
      if (state.wordsPrinted !== 1) return null;      // only the page's first word
      if (script.total < state.quota) return null;    // and only when it cleared the page alone
      data.honorifics = (data.honorifics ?? 0) + 1;
      return { note: `cleared alone — a laurel, +${data.honorifics * HONORIFIC_STEP} Points every word` };
    },
  },
  {
    // The one patron paid for what a word ISN'T. wordlists-themed/common.txt
    // holds the eight thousand commonest words of English that this dictionary
    // also knows; anything outside it is, by that measure, a word most readers
    // have never met. If it proves too easy in the hand, lower the multiplier
    // before narrowing the list — the list is shared with two editors.
    id: 'lexicographer',
    when: 'score',
    effect({ word, xMult }) {
      if (themeSize('common') && word && !inTheme('common', word)) xMult(1.5);
    },
  },
  {
    id: 'stenographer',
    when: 'meta',   // consulted at the dictionary check in main.js; the list lives in wordlists-themed/acronyms.txt
  },
  {
    // Not a misspelling like the excuses below: nothing has gone wrong here. It
    // licenses a construction — the compound noun, which English makes freely
    // and dictionaries only ever catch up with.
    id: 'binder',
    when: 'meta',   // consulted at the dictionary check in main.js; the list lives in wordlists-themed/nouns.txt
  },
  {
    // Additive, so it joins the other +Mult seats rather than multiplying what
    // they built. Pairs stack — BOOKKEEPER pays three times — and the
    // Haplographer's licence is worth one more pair (licencedPairs).
    id: 'stammerer',
    when: 'score',
    effect({ word, addMult }) {
      const n = doubledPairs(word) + licencedPairs(word);
      if (n) addMult(0.5 * n);
    },
  },
  {
    // Gloves come in pairs, and only in pairs: exactly two tiles of a colour
    // pay, a third spoils the set. Each colour is judged on its own, so two
    // crimson and two jade are two pairs while one of each is a drawer of odd
    // gloves. Additive, so he queues with the Typesetter and the Stammerer.
    // Colour is read the patrons' way, so a rainbow tile joins every colour's
    // count at once: beside one painted tile it completes that pair, beside a
    // painted PAIR it makes three and spoils it — the one patron for whom
    // rainbow metal cuts both ways.
    id: 'glover',
    when: 'score',
    effect({ tiles, addMult }) {
      const pairs = Object.keys(COLOURS).filter(c => painted(tiles, c).length === 2).length;
      if (pairs) addMult(Math.round(pairs * 0.2 * 100) / 100);
    },
  },
  {
    // The rag-picker sorted his sack BY COLOUR before selling it to the mill:
    // throw him a painted tile and he pays in the currency of that tile's own
    // guild, wearing no livery himself. Nothing is destroyed — the rags file
    // into the pile like any discard. One roll per painted tile, and REAL paint
    // only: deliberately `t.colour` rather than getActiveColour, which would
    // count a temporary ink wash. He buys dyed rags, not damp ones.
    id: 'ragman',
    when: 'meta',
    onDiscard({ tiles, state, bench }) {
      const notes = [];
      let refunded = false;
      for (const t of tiles) {
        if (!COLOURS[t.colour]) continue;
        if (!luckyRoll(RAGMAN_ODDS)) continue;
        if (t.colour === 'crimson') {
          // No room on the bench, no tongs, and no harm done.
          if (bench('tongs')) notes.push('the tongs');
        } else if (t.colour === 'amber') {
          state.coins += RAGMAN_COINS;
          notes.push(`${RAGMAN_COINS} Coin`);
        } else if (t.colour === 'jade') {
          // Felt at once (main.js refills the hand after the seats have spoken)
          // and taken back at the page turn.
          state.rackBonus = (state.rackBonus ?? 0) + 1;
          notes.push('a wider hand');
        } else if (!refunded) {
          // At most ONE discard back however much azure goes into the sack:
          // two refunds for one throw is a hand that cycles itself forever.
          refunded = true;
          state.discards += 1;
          notes.push('the discard back');
        }
      }
      return notes.length ? { note: notes.join(' · ') } : null;
    },
  },
  {
    // Motley is the whole joke: the one patron who cares about every colour
    // wears none. Colours are counted the patrons' way, so a single rainbow
    // tile reads as all four and meets his whole demand alone — the intended
    // shortcut, and what keeps a four-colour bar reachable.
    id: 'harlequin',
    when: 'score',
    effect({ tiles, xMult }) { if (distinctColours(tiles).length >= 4) xMult(2); },
  },
  {
    // Pays by the head at his table, himself included — a standing argument
    // with the Headsman, who'd rather the seats empty. Ghosts still drink: a
    // patron The Ripper killed has left the shelf but not the table, and
    // allSeats() counts every head in the room.
    id: 'innkeeper',
    when: 'score',
    effect({ addPoints }) { addPoints(5 * allSeats().length); },
  },
  {
    // He speaks after every other patron (scoring pass 4½) and counts GUILDS,
    // not patrons and not triggers: three amber patrons pay once, and a dye that
    // never touches scoring pays as well as the Bursar. Four guilds exist, so
    // ×5.06 is his ceiling however many seats the Colophon grants.
    id: 'alderman',
    when: 'meta',   // fires in scoring's pass 4½ — see js/scoring.js
  },

  // ── The four registers ──────────────────────────────────────────────────────
  // Each keeps one of the themed lists in wordlists-themed/ and pays ×3 when
  // the printed word is on it — and sends a package of its own the rest of the
  // time (registerPatron, above). The lists are flat files — edit them freely.
  registerPatron('sexton',    'spooky'),
  registerPatron('paramour',  'romantic'),
  registerPatron('poppet',    'cute'),
  registerPatron('vulgarian', 'rude'),

  // ── The three parts of speech ───────────────────────────────────────────────
  // The registers above ask what a word is ABOUT; these three ask what it DOES
  // in a sentence, off three more flat files in wordlists-themed/. They fire
  // far more often than the registers, and pay less for it. A word that is two
  // at once (an ANCHOR is a noun, to ANCHOR is a verb) pays both seats.
  {
    // The seat The Binder was waiting for: a compound of his — DOOM and HAT
    // into DOOMHAT — is itself a thing with a name, though without that seat it
    // is not a word at all. Plurals count too; both live in readsAsNoun.
    id: 'sculptor',
    when: 'score',
    effect({ word, xMult }) { if (readsAsNoun(word)) xMult(2); },
  },
  {
    id: 'poet',
    when: 'score',
    effect({ word, xMult }) { if (inTheme('adjectives', word)) xMult(2); },
  },
  {
    id: 'athlete',
    when: 'score',
    effect({ word, xMult }) { if (inTheme('verbs', word)) xMult(2); },
  },

  // ── Misspellings · the four excuses ─────────────────────────────────────────
  // Titivillus (azure) forgives anything a vowel can do wrong; these three
  // forgive the consonants their oldest slips. All four are consulted at the
  // dictionary check in main.js, and the word prints exactly as you set it,
  // misspelling and all. Only the Haplographer also touches the score.
  {
    id: 'stumbler',
    when: 'meta',
  },
  {
    // Haplography: writing once what ought to be written twice. The licence
    // cuts both ways from one rule — see licencedIndex at the top of the file.
    id: 'haplographer',
    when: 'meta',
  },
  {
    id: 'skimmer',
    when: 'meta',
  },
];

// ─── Cards × behaviour ────────────────────────────────────────────────────────
// The roster the rest of the game sees. The two halves are disjoint by
// construction — nothing in a card is a function, nothing in a behaviour is card
// data — so the spread can never have one quietly overwrite the other. Both
// directions are checked as the module loads, because the failure is otherwise
// silent: a behaviour with no card seats a nameless patron at an undefined
// price, and a card with no behaviour sells one that does nothing.
export const PATRON_DEFS = PATRON_BEHAVIOURS.map(behaviour => {
  const card = PATRON_CARDS[behaviour.id];
  if (!card) throw new Error(`patrons: '${behaviour.id}' has no card in js/patron-cards.js`);
  return { ...card, ...behaviour };
});

{
  const seated = new Set(PATRON_BEHAVIOURS.map(b => b.id));
  const orphan = Object.keys(PATRON_CARDS).filter(id => !seated.has(id));
  if (orphan.length) throw new Error(`patron-cards: no behaviour for ${orphan.join(', ')} in js/patrons.js`);
}

export const patronById = id => PATRON_DEFS.find(d => d.id === id);

// A patron's liveries, always as an array — `guild` on a card may be absent, one
// string, or (for a dual-livery patron like the Cellarer) an array. The first
// entry is the primary: the ribbon and pin the card wears, with a second ribbon
// beside it for the second. Everything asking what a shelf flies comes here.
export const guildsOf = def => (def?.guild ? [].concat(def.guild) : []);

// ─── What a seat is called ────────────────────────────────────────────────────
// Two optional layers over the plain card name: a stackable patron may name its
// own copy (instName — the Monogrammist's number), and any patron may have
// called at the Market already lettered (POSTNOM). The second rewrites the
// first, dropping the article on purpose: "The Scholar" becomes "Dr Scholar,
// PhD". Every display of a name comes here, so the shelf, the card, the popover
// and the log need know nothing about postnoms.
const dropArticle = name => name.replace(/^The\s+/, '');

export const patronName = (def, data) => {
  const base = def?.instName?.(data) ?? def?.name ?? 'The patron';
  return data?.postnom ? `Dr ${dropArticle(base)}, ${data.postnom}` : base;
};

// The portrait a seat wears. A patron whose state changes may change face; the
// card's own emoji is the fallback.
export const patronEmoji = (def, data) => def?.instEmoji?.(data) ?? def?.emoji ?? '';

// The short form the shelf's cards wear, where there is room for a word.
export const patronShelf = (def, data) => {
  const base = def?.instShelf?.(data) ?? dropArticle(def?.name ?? '');
  return data?.postnom ? `${base}, ${data.postnom}` : base;
};

// Rolled as a card is laid out at the Market, never later: what is on the card
// is what you are buying.
export const rollPostnom = () =>
  (Math.random() < POSTNOM.odds
    ? POSTNOM.titles[Math.floor(Math.random() * POSTNOM.titles.length)]
    : null);

// What a card costs today — the card's price, plus the surcharge a lettered one
// asks, plus the day's haggle (rollHaggle in constants.js). Read live from the
// offer rather than baked in, the way tile prices are. A patron the card prices
// at NOTHING stays at nothing: the cat is found, not bought. Everyone else asks
// at least a Coin however the haggle went.
export const patronCost = (def, data) => {
  const base = def?.cost ?? 0;
  if (!base) return 0;
  const asked = base + (data?.haggle ?? 0)
              + (data?.postnom ? POSTNOM.surcharge : 0)
              + (data?.ghost   ? GHOST_HIRE.surcharge : 0);
  return Math.max(1, asked);
};

// Seats on the shelf flying a given colour, dual liveries included. Every
// guild-scaling effect counts through here — the Composter's heap allowance,
// the Banker's page coin, the Orchardist's Mult — and each counts the counting
// patron itself, so a lone one is as good as it was before guilds mattered.
export const guildSeats = colour =>
  allSeats().filter(p => guildsOf(patronById(p.id)).includes(colour)).length;

export const RARITY_WEIGHT = { common: 3, uncommon: 2, rare: 1 };
