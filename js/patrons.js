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
//     its tiles out of the word rather than by name.
//
//   tileTwin(tiles) — RECASTS one tile as another before the word is read, and
//     may add a tile the word does not have. Return [{ kind, first, second, at }]
//     (twinPairs, below). Scoring's pass ⅓ applies it to a copy, ahead of the
//     brush and of `word` itself, so a summoned tile is in the word for every
//     reader that follows — it spells, it lengthens, it takes paint. The only
//     hook that can change what PRINTS, which is why exactly one seat has it.
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
// `tally(data)` is what a seat has ACCUMULATED, in one plain sentence: the
// Beekeeper's hive and what the next bee is worth, the Stoker's stacks, the
// Usurer's book. Anything a seat carries that changes what it pays belongs
// here, because a number kept privately in `data` is a number the player is
// being asked to remember. Read by seatTally() below, which pairs it with the
// laurels every seat may wear and hands both to the popover — so tapping any
// patron answers "what is this one worth to me *now*". Return null (or leave
// the hook off) for a seat whose worth never moves.
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
//
// Optional `speaksLast`: this seat's onPrinted runs after every other seat's,
// whatever order it sits in. For a patron that CLEANS UP after the table — it
// would otherwise be reading a forme the other seats are still painting, and
// seating it in front of them would be strictly better than seating it behind.
// Everything else obeys seat order, which is a promise to the player.
//
// Optional `locked()`: while it returns true the patron is out of every pool
// that deals a card — the Market's counter, the Black Market's, the love
// potion's — as though it were `unlisted`, and it starts being dealt the moment
// the condition turns. Read live off `state`, never cached, so a run that meets
// the condition mid-Market is offered the seat at the next deal. The Testing
// Chamber ignores it and lists the patron anyway, with the card's `unlockNote`
// beside it: a dev screen has no business keeping secrets.

import {
  GRAFTER_STEP, STOKER_BASE, STOKER_STEP, beekeeperMult, ARSONIST_ODDS,
  NUDIST_TRIM_CHANCE, NUDIST_PAINT_CHANCE,
  RAGMAN_ODDS, RAGMAN_COINS, REVENANT_ODDS, MATERIALS,
  PACKAGE_ODDS, PACKAGES, PACKAGE_OF_PATRON,
  DYE_TILES_PER_CHAPTER, COLOURS, TRIMS, LIGATURES, isMark,
  BAG_COUNTS, FRONTISPIECE, DIPPER_PAINT_CHANCE,
  HEADSMAN_STEP, ESPALIER_STEP, HONORIFIC_STEP, LAUREATE_MULT_STEP, RIPPER_WORDS, splitMarks, isImmutable,
  TWINS_POINTS, CHILD_STEP, ABECEDARIAN_MULT, ABECEDARIAN_CASE, abecedarianMult, caseGlyphs, MEDIEVAL,
  ASTRONOMER_STEP, GLOVER_STEP, TYPESETTER_STEP, EXPECTANTS_BONUS, PURVEYOR,
  SHORTHAIR_MULT, CARTOGRAPHER_MULT, CARTOGRAPHER_MIN_VOWELS,
  medievalExpansions, POSTNOM, GHOST_HIRE, USURER,
  PRINCE, princeMult,
  WORDLER,
  WINNOWER_BONUS, SERPENT_EAT_ODDS, lyeBoyMult,
  LOVERS,
} from './constants.js';
import {
  state, getActiveColour, getActiveLetter, countsAsColour, luckyRoll,
  paintRandomTiles, restingPoints, shuffle, owns, allSeats, effectiveSundrySlots,
  strikeMaterial, primeMult,
} from './state.js';
import { inTheme, themeSize, THEME_SETS, silentAt, SILENT } from './themes.js';
import { DICT } from './dict.js';
import { PATRON_CARDS } from './patron-cards.js';
// The Generic's whole roster of triggers, effects and names — one file, meant
// to be retuned between playtests. Nothing about that patron is decided here.
import {
  rollGeneric, genericFires, genericClause, genericName, snapOf,
  triggerA, triggerB, effectOf,
} from './patron-generic.js';

const VOWELS = 'AEIOU';

// The dearest letters in the case — 8+ Points apiece. Four of them ship one
// apiece in the starting bag; the lone Q ships nowhere at all and has to be
// made on the ratchet, which is exactly why it belongs here. The Antiquary pays
// a finder's fee for any of them, and a Q you went to the trouble of striking
// should not be the one rare sort he fails to notice.
const RARE_LETTERS = ['J', 'Q', 'QU', 'X', 'Z'];

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

// What The Usurer is still owed. A ghost is owed nothing: being murdered
// settles the account, and a dead lender will not open a new one either.
const usurerOwed = data => (data?.ghost ? 0 : data?.debt ?? 0);

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

// What the cat's meals are worth, rounded so nothing ever shows the raw
// 0.30000000000000004 that repeated addition of a tenth produces.
const shorthairMult = eaten => Math.round((eaten ?? 0) * SHORTHAIR_MULT * 100) / 100;

// A plain sort: one letter of the alphabet and nothing else. Everything the
// press can set that ISN'T one of these — a ligature (several letters on one
// body), a medieval sort (a single character outside A-Z), a mark, the fleuron,
// the interrobang — is what The Typesetter is paid for.
const isPlainSort = L => /^[A-Z]$/.test(L ?? '');

// The vowels of a word, read TILE BY TILE, giving two different counts because
// The Cartographer needs both:
//
//   seq    the ORDER to check, with each tile's own run of one vowel counted
//          once. This is what lets a doubled vowel written on a single body
//          pass: the OO ligature contributes one O, where two separate O tiles
//          contribute two and break the run.
//   count  how many vowels are SPOKEN, the OO's pair counted as two. This is
//          what the minimum is measured against, so BOOK set with an OO tile is
//          a two-vowel word that happens to spell them on one sort — and CAT,
//          with a single vowel and no order to be in, is not.
//
// Y is left out of both. It is a vowel only sometimes, and a rule that has to
// guess is a rule players cannot compose towards.
const vowelRun = tiles => {
  const seq = [];
  let count = 0;
  for (const t of tiles) {
    let last = null;
    for (const ch of getActiveLetter(t) ?? '') {
      if (!VOWELS.includes(ch)) continue;
      count++;
      if (ch !== last) seq.push(ch);
      last = ch;
    }
  }
  return { seq, count };
};

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

// The pairs The Twins read, each naming the tiles standing in it. Walked LETTER
// by letter rather than tile by tile, each letter remembering the tile it came
// from, so a ligature is counted for what it spells: a CH beside an H doubles
// them both, and a tile that spells its own double is a pair by itself.
//
// Every pair PAYS. Only some can be CLONED, and the reason is spelling: a clone
// rewrites the second tile as the first, so it is only safe where the two tiles
// already show the same face. Cloning the H of CH·H into a second CH would
// print CHCH — a different word than the one you set — so those pairs are paid
// and left alone. Hence a `kind`:
//
//   'clone'  — two whole tiles wearing the same letter. The second becomes the
//              first: its Points, trim, nick, metal and paint, all of it.
//   'letters'— the doubling straddles a ligature (CH·H), or one tile spells its
//              own double (OO). There is no second tile to rewrite, or
//              rewriting it would respell the word. Paid, never cloned.
//   'summon' — the Haplographer's licence: the second letter isn't in the word
//              at all. The Twins strike it, and it joins the word for real —
//              which is the one thing in the game that changes what prints.
//
// `at` on a summon is where the new tile goes: immediately after the tile whose
// last letter it doubles, which is the only place it can go without respelling
// the word (so a licence landing mid-ligature summons nothing and is paid as
// 'letters').
export function twinPairs(tiles) {
  const chars = [];
  for (const t of tiles) {
    const L = getActiveLetter(t);
    if (isMark(L)) continue;                  // HELLO! is doubled by its Ls, not its !
    for (const ch of L) chars.push({ ch, tile: t });
  }
  const pairs = [];
  for (let i = 0; i < chars.length - 1; i++) {
    if (chars[i].ch !== chars[i + 1].ch) continue;
    const first = chars[i].tile, second = chars[i + 1].tile;
    const clonable = first !== second && getActiveLetter(first) === getActiveLetter(second);
    pairs.push({ kind: clonable ? 'clone' : 'letters', first, second });
    i++;
  }
  // The licence read onto the tile it pardons: the single L of BALOON stands for
  // two, and The Twins are what makes the second one real.
  if (owns('haplographer')) {
    const at = licencedIndex(chars.map(c => c.ch).join(''));
    // Only the LAST letter of a tile can be doubled by a tile set after it: the
    // licence on the A of an AL ligature wants BAAL, and no tile placed beside
    // AL spells that.
    if (at >= 0 && chars[at].tile !== chars[at + 1]?.tile) {
      const first = chars[at].tile;
      // `ch` is the LETTER to be struck, which is not always the whole of the
      // tile it doubles: the licence on B·AL·OON wants a bare L after the
      // ligature (BALLOON), never a second AL (BALALOON).
      pairs.push({ kind: 'summon', first, second: null, ch: chars[at].ch,
                   at: tiles.indexOf(first) + 1 });
    } else if (at >= 0) {
      pairs.push({ kind: 'letters', first: chars[at].tile, second: chars[at].tile });
    }
  }
  return pairs;
}

// What a twinned pair is worth in Points — the seat's smaller half, paid per
// pair however the pair is made.
export const twinPoints = pairs => TWINS_POINTS * pairs.length;

// "crimson", "crimson and a Gold trim", "crimson, a Gold trim and +2 Points".
const listPhrase = xs =>
  (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

// The medieval sorts, read as the letters they stand for. Readings are tried in
// `reads` order and the first real word wins, else the first reading stands. The
// live preview (scoring) and the print (main.js) both resolve through this one
// function, so they cannot disagree about what þORN spells.
// ─── The dummy letters ────────────────────────────────────────────────────────
// Which TILE in the word carries the mute letter. The list holds the index of
// the letter inside the WORD, and a tile may spell several letters (QU, ING), so
// the word is walked tile by tile until the index falls inside one. That tile is
// the one struck blind — a ligature holding the silence is struck whole, because
// a sort is one piece of metal whatever it spells.
export function silentTile(wordTiles, word) {
  const at = silentAt(word);
  if (at == null) return null;
  let i = 0;
  for (const tile of wordTiles) {
    const len = (getActiveLetter(tile) ?? '').length;
    if (at < i + len) return tile;
    i += len;
  }
  return null;
}

// True when the word is one the press keeps a silence for. Read by the editor
// pass in scoring.js as well as by the seat itself, so what the board promises
// while you compose is what the print delivers.
export const hasSilence = word => SILENT.has(word);

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

// One house's colour with none of the rival's — the feud, read in paint. The
// other two guilds are nobody's business here: a lover minds who ELSE is in the
// word only when it is the other lover's livery. A rainbow tile counts as every
// colour (countsAsColour), so it answers the house and brings the rival in with
// it — the lovers' own metal is no use to either of them apart.
const houseOnly = (tiles, mine, rival) =>
  painted(tiles, mine).length > 0 && painted(tiles, rival).length === 0;

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
    // The other patron that is ROLLED rather than written, and the one whose
    // whole roster lives outside this file: js/patron-generic.js holds every
    // trigger it can ask for, every effect it can pay, the weights that marry
    // the two, and the names and epithets it goes by. That file is the tuning
    // table; this is only the machine that reads it.
    //
    // One trigger about the WORD and one about the TILES OR THE PAGE, ANDed,
    // paired with an effect worth exactly what the two conditions are worth
    // together. The price is flat, so a roll is a bargain or a swindle and
    // reading which is the whole of the decision at the Market.
    //
    // The roll is stored as three ids on the seat's data, never as functions —
    // so a save survives a retuning of the tables, and a trigger deleted from
    // them leaves a seat that quietly does nothing rather than one that throws.
    id: 'generic',
    when: 'score',
    onOffer: () => rollGeneric(),

    instName(data)  { return genericName(data) ?? PATRON_CARDS.generic.name; },
    instShelf(data) { return data?.who ?? 'Generic'; },
    instEmoji(data) { return data?.face ?? PATRON_CARDS.generic.emoji; },
    instDesc(data)  { return genericClause(data) ?? PATRON_CARDS.generic.desc; },

    // The half of the roster that pays while the word is being scored. Pure, as
    // every scoring hook must be: the two triggers are read off the live press
    // through snapOf, and nothing is written anywhere.
    effect({ word, tiles, state: st, data, addPoints, addCoins, xMult }) {
      const e = effectOf(data);
      if (!e || !genericFires(data, { word, tiles, at: snapOf(st) })) return;
      if (e.kind === 'points')     addPoints(e.n);
      if (e.kind === 'coins')      addCoins(e.n);
      if (e.kind === 'perChapter') addPoints(e.n * (st.chapter ?? 1));
      if (e.kind === 'xmult')      xMult(e.n);
    },

    // …and the tile that prints twice, where that is what it rolled. `n` is the
    // place in the word, so 0 is the first tile and 1 the second — the tile, not
    // the letter, so an ING ligature doubling is three letters doubled.
    tileEcho(tile, data, tiles) {
      const e = effectOf(data);
      if (e?.kind !== 'echo' || !tiles?.length) return false;
      if (tiles[e.n]?.id !== tile.id) return false;
      return genericFires(data, { word: wordLetters(tiles), tiles, at: snapOf(state) });
    },

    // Everything that CHANGES something. Asked against the snapshot the script
    // carried out of scoring (script.at), never against the live press: by the
    // time this runs the commit has banked the score, bumped the word count and
    // paid the discards back, so "was this the second word of the page?" has a
    // different answer here than it had a moment ago.
    onPrinted(ctx) {
      const { tiles, script, state: st, data, grow, nick, bench } = ctx;
      const e = effectOf(data);
      if (!e || !script) return null;
      const fired = genericFires(data, {
        word: script.letters, tiles, at: script.at ?? snapOf(st),
      });
      if (!fired) return null;

      // The valve. Everything that leaves something PERMANENT behind is capped
      // at one a page — a nick, a laurel, growth, a gift on the bench — because
      // those compound over a run where Points and Mult decay against the
      // climbing quota. Points, Coins, Mult and the echo are uncapped on
      // purpose: they are paid for the word and gone with it.
      const page = `${st.chapter}.${st.page}`;
      if (e.oncePerPage && data.spentOn === page) return null;
      const spend = () => { data.spentOn = page; data.paid = (data.paid ?? 0) + 1; };

      if (e.kind === 'grow') {
        const got = tiles.filter(t => grow(t, e.n));
        if (!got.length) return null;
        spend();
        return { say: [`${got.length} tile${got.length > 1 ? 's' : ''} keep +${e.n} Point${e.n > 1 ? 's' : ''}, for good.`] };
      }

      if (e.kind === 'nick') {
        const bare = tiles.filter(t => !t.nick && !isImmutable(t));
        if (!bare.length) return null;
        const target = bare[Math.floor(Math.random() * bare.length)];
        const side = Math.random() < 0.5 ? 'left' : 'right';
        if (!nick?.(target, side)) return null;
        spend();
        return { say: [`A ${side} nick is cut into the ${getActiveLetter(target)} — it will read the tiles on its ${side} from now on.`] };
      }

      if (e.kind === 'paintPot') {
        const colour = shuffle(Object.keys(COLOURS))[0];
        if (!bench?.({ kind: 'tube', colour })) return { note: 'no room on the bench', refused: true };
        spend();
        return { say: [`A pot of ${COLOURS[colour].label.toLowerCase()} paint, onto the workbench.`] };
      }

      if (e.kind === 'parcel') {
        const theme = shuffle(Object.keys(PACKAGES))[0];
        if (!bench?.({ kind: 'package', theme })) return { note: 'no room on the bench', refused: true };
        spend();
        return { say: [`${PACKAGES[theme].label}, onto the workbench.`] };
      }

      if (e.kind === 'laurel') {
        // Any seat but this one, so a Generic can't crown itself in a loop. With
        // nobody else at the table it goes without rather than picking itself.
        const others = (st.patrons ?? []).filter(p => p.uid !== ctx.uid && p.id !== 'generic');
        const pool = others.length ? others : (st.patrons ?? []).filter(p => p.uid !== ctx.uid);
        if (!pool.length) return null;
        const seat = pool[Math.floor(Math.random() * pool.length)];
        seat.data ??= {};
        seat.data.honorifics = (seat.data.honorifics ?? 0) + 1;
        spend();
        const def = patronById(seat.id);
        return { say: [`${patronName(def, seat.data)} takes a laurel — `
                     + `+${seat.data.honorifics * HONORIFIC_STEP} Points every word.`] };
      }

      if (e.kind === 'refund') {
        if (st.discards >= st.discardsMax) return null;
        st.discards = Math.min(st.discardsMax, st.discards + e.n);
        data.paid = (data.paid ?? 0) + 1;
        return { note: `+${e.n} discard` };
      }

      if (e.kind === 'draw') {
        st.rackBonus = (st.rackBonus ?? 0) + e.n;
        spend();
        return { say: [`${e.n} more places in the hand for the rest of the page.`] };
      }

      if (e.kind === 'primeMult') {
        primeMult('generic', e.n);
        data.paid = (data.paid ?? 0) + 1;
        return { note: `next word ×${e.n}` };
      }

      // The score-time kinds have already been paid; they are counted here so
      // the card's tally can say how many times this seat has come good.
      data.paid = (data.paid ?? 0) + 1;
      return null;
    },

    // What the seat has actually done for you, which for this patron is the one
    // number worth knowing: a roll that has never fired is a roll you misread.
    tally(data) {
      const e = effectOf(data);
      if (!e) return null;
      const paid = data?.paid ?? 0;
      const spent = e.oncePerPage && data?.spentOn === `${state.chapter}.${state.page}`;
      const done = paid === 0 ? 'Has not come good yet.'
                 : paid === 1 ? 'Has come good once.'
                 : `Has come good ${paid} times.`;
      return done + (e.oncePerPage
        ? ` Pays once a page — ${spent ? 'already spent on this one.' : 'ready.'}` : '');
    },

    // The two conditions apart, because ANDed together in one sentence they are
    // easy to half-read — and half-reading them is how a card gets bought.
    popover(data) {
      const a = triggerA(data), b = triggerB(data), e = effectOf(data);
      if (!a || !b || !e) return '';
      const row = (head, body) =>
        `<div class="gen-term"><span class="gen-term-head">${head}</span>${body}</div>`;
      return `<div class="gen-terms">`
        + row('if', `a word that ${a.clause}`)
        + row('and', b.clause)
        + row('pays', e.clause)
        + `</div>`;
    },
  },
  {
    // A doubled letter is two of the same thing, and The Twins hold the press to
    // it: the second tile is struck again from the first and KEEPS it — paint,
    // trim, nick, metal, grown Points and both faces of a dual, overwriting
    // whatever it wore before. Two plain Ls are unchanged by that and paid
    // anyway; one gorgeous L beside a plain one is where the seat earns its
    // keep, and where the puzzle lives — you want the pair lopsided, not tidy,
    // and set the good tile FIRST, because the mould is whichever you set in
    // front. Set them the wrong way round and the good one is what you lose;
    // the groove brackets every pair it reads so the choice is never blind.
    //
    // Which makes this a deck-builder rather than a score seat, and gives it a
    // shape over a run: at the first Market your tiles are all bare and it pays
    // its +5 and nothing more; through the middle of a run it is the cheapest
    // way there is to spread one good tile across a collection; by the end most
    // of what you own is already dressed and it has little left to give — bar
    // the one extraordinary tile you are trying to make copies of.
    //
    // It lands in scoring's pass ⅓, before anything is counted and before the
    // brush, so every reader downstream sees two identical tiles: the colour
    // multipliers count the coat twice, a gold trim pays a second Coin, the
    // Monogrammist finds two of its letter. Scoring stays pure — the copy is
    // made there, and onPrinted below is what lays it into the collection.
    //
    // twinPairs decides which pairs can be recast and which are only paid; the
    // Haplographer's licence is the third case, and the loudest — the missing
    // letter is STRUCK, and a real tile joins the word.
    id: 'twins',
    when: 'score',      // the recasting fires in scoring's pass ⅓; this pays the pairs
    tileTwin: tiles => twinPairs(tiles),
    effect({ tiles, addPoints }) {
      const n = twinPoints(twinPairs(tiles));
      if (n) addPoints(n);
    },
    // …and here it is made permanent. The mould was worked out at scoring and
    // carried on the step, so what goes into the collection is exactly what the
    // player was shown — not a second reckoning against a tile another seat may
    // have painted in between. The letter is read BEFORE the recasting, because
    // a clone takes the faces too and the tile may not be an L any more after.
    // The struck letter (a licence) has no line here: it was cast from nothing
    // and files into nothing, so there is no template to write to.
    onPrinted({ tiles, script, recast }) {
      const said = [];
      for (const step of script?.twinSteps ?? []) {
        if (step.id !== 'twins') continue;
        for (const hit of step.hits) {
          if (hit.kind !== 'clone' || !hit.changed) continue;
          const target = tiles.find(t => t.id === hit.id);
          const letter = target && getActiveLetter(target);
          const got = recast(target, hit.mould);
          if (got) said.push(`${letter} is struck again from its twin — ${listPhrase(got)}, for good.`);
        }
      }
      return said.length ? { say: said } : null;
    },
  },
  {
    // The one seat that reads a word for what is NOT said in it. Two halves:
    // no editor hears a word with a mute letter in it (the judge pass in
    // scoring.js asks hasSilence before it spikes), and the mute tile is struck
    // blind for good, which crowns him. The metal carries nothing yet — it is
    // there for other seats to care about later.
    id: 'silentknight',
    when: 'score',
    onPrinted({ tiles, script, data }) {
      const word = script?.word;
      if (!word || !hasSilence(word)) return null;
      const target = silentTile(tiles, word);
      if (!target) return null;
      const letter = getActiveLetter(target);
      if (!strikeMaterial(target, 'blind')) return null;
      data.struck = (data.struck ?? 0) + 1;
      data.honorifics = (data.honorifics ?? 0) + 1;
      return {
        say: [`The ${letter} in ${word} was never spoken — struck blind, for good. `
            + `A laurel with it: +${data.honorifics * HONORIFIC_STEP} Points every word.`],
      };
    },
    instDesc(data) {
      const n = data?.struck ?? 0;
      if (!n) return PATRON_CARDS.silentknight.desc;
      return `${n} letter${n > 1 ? 's' : ''} struck blind. `
           + `+${(data.honorifics ?? 0) * HONORIFIC_STEP} Points every word.`;
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
    // The one seat that pays in CHOICE and in nothing else. It adds no Points,
    // no Mult and no Coins; it widens every spread the game lays in front of you
    // — the Market's tiles, patrons and stalls, the Colophon's cards, the tiles a
    // proposal stall spreads, and the tiles a paint tube offers to choose
    // between.
    //
    // Which makes it an EARLY seat by design. What you lack in the first two
    // chapters is the right tile rather than more of them, and a wider spread is
    // the cheapest way to find it; by the last chapter your press knows what it
    // wants and one more card to look at is worth very little. A seat you buy,
    // use, and sell on without regret — which is a shape the roster is otherwise
    // short of.
    //
    // Every number lives in PURVEYOR (js/constants.js) and is read through the
    // effective-* getters in js/state.js, so the Market, the Colophon and the
    // workbench cannot disagree about what the seat is worth.
    id: 'purveyor',
    when: 'meta',   // read by the effective-* getters in js/state.js
    // The six numbers, laid out where there is room for them. Read straight off
    // PURVEYOR, so retuning the seat retunes what it promises.
    popover() {
      const rows = [
        ['Tiles at the Market',    PURVEYOR.tiles],
        ['Patrons calling',        PURVEYOR.patrons],
        ['Stalls pitched',         PURVEYOR.stalls],
        ['Tiles inside a stall',   PURVEYOR.proposals],
        ['Cards at the Colophon',  PURVEYOR.upgrades],
        ['Tiles a paint tube offers', PURVEYOR.paint],
      ];
      return `<ul class="tip-list">${rows
        .map(([what, n]) => `<li><span>${what}</span><b>+${n}</b></li>`).join('')}</ul>`;
    },
  },
  {
    // Additive, so it queues with the other +Mult seats rather than
    // multiplying what they built. Stacks: ING and TH in one word is +0.5.
    // Paid per NON-STANDARD sort: anything that is not a plain single letter of
    // the alphabet. That is one test, not a list — ligatures are several letters
    // on one body, the medieval sorts are single characters outside A-Z, and the
    // marks, the fleuron and the interrobang are not letters at all. A new odd
    // sort added to the case is counted by this seat the day it arrives, with
    // nothing here to update.
    //
    // Additive, so it queues with the other +Mult seats rather than multiplying
    // what they built. Stacks: a QU beside a þ is +0.4.
    id: 'typesetter',
    when: 'score',
    effect({ tiles, addMult }) {
      const n = tiles.filter(t => !isPlainSort(getActiveLetter(t))).length;
      if (n) addMult(Math.round(n * TYPESETTER_STEP * 100) / 100);
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
    // A loan against the seat. Everything reads the debt through usurerOwed, so
    // the card, the collector and the dismissal guard all forgive at the same
    // instant a knife goes in: a ghost is owed nothing. That also stops a ghost
    // hired dead at the Market from lending money nobody can collect.
    id: 'usurer',
    when: 'meta',   // borrowed and repaid from his card — the buttons are in main.js
    instDesc(data) {
      if (data?.ghost) return 'What good is money to me now? Keep it.';
      const owed = usurerOwed(data);
      return owed
        ? `You owe him ${owed} Coins. He takes ${USURER.collect} as each page ends, and will not go until the book is clear.`
        : PATRON_CARDS.usurer.desc;
    },
    act: ({ seat, data }) => {
      if (!seat || data?.ghost) return '';
      const owed = usurerOwed(data);
      if (!owed) {
        return `<button class="btn btn-quiet tip-btn" data-patron-act="usurer-borrow">Borrow ${USURER.loan} Coins</button>`;
      }
      return `<button class="btn btn-quiet tip-btn" data-patron-act="usurer-repay"${
        state.coins < owed ? ' disabled' : ''}>Settle the book — ${owed} Coins</button>`;
    },
    holds: data => {
      const owed = usurerOwed(data);
      return owed ? `He is owed ${owed} Coins` : null;
    },
    onPageComplete({ state, data }) {
      const owed = usurerOwed(data);
      if (!owed) return null;
      const take = Math.min(owed, USURER.collect, state.coins);
      if (!take) return { note: 'nothing to collect — the book stands' };
      state.coins -= take;
      data.debt = owed - take;
      return { note: data.debt ? `${take} Coins collected, ${data.debt} still owed` : `${take} Coins collected — the book is clear` };
    },
  },
  {
    // No promise, only a thumb on the scale: every draw weighs gold more
    // heavily than anything else in the bag (drawFromBag), so the more you gild
    // the more she finds.
    id: 'magpie',
    when: 'meta',   // the draw is weighted in js/state.js
  },
  {
    // The other pair of eyes on the bag: crimson paint is blood in the water,
    // and he swims to it. Weighted in drawFromBag beside the Magpie's gold, so
    // a tile wearing both is drawn all the harder.
    id: 'mako',
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
    effect({ state, addMult }) {
      if (state.wordsPrinted > 0) addMult(ASTRONOMER_STEP * state.wordsPrinted);
    },
  },
  {
    // Reads the VOWELS and asks that they run in order — A before E before I
    // before O before U — which is a rarer and more satisfying shape than the
    // old all-letters rule: ABSTEMIOUS and FACETIOUS are the famous ones, but
    // MARKET, PRESS and DOUBT all qualify too, so it is a seat you can compose
    // towards rather than wait on.
    //
    // Counted per TILE, which is what makes a doubled vowel written on one body
    // legal: the OO ligature contributes a single O and passes, where two
    // separate O tiles are two O's in a row and fail. The Haplographer's licence
    // never appears here at all — it doubles a letter in the READING, and this
    // reads the tiles as set.
    id: 'cartographer',
    when: 'score',
    effect({ tiles, xMult }) {
      const { seq, count } = vowelRun(tiles);
      if (count < CARTOGRAPHER_MIN_VOWELS) return;   // no order to be in
      for (let i = 0; i < seq.length - 1; i++) if (seq[i] >= seq[i + 1]) return;
      xMult(CARTOGRAPHER_MULT);
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
    // The Chapman one flight down, and built the same way: a guarantee and a
    // price, both read LIVE off `owns` rather than baked in, so hiring him
    // changes what is already on the table and dismissing him puts it back.
    //
    // He buys two things a run cannot otherwise plan for. The alley is the only
    // place rare patrons are sold one-in-one — the fair's own pool runs
    // three-to-one towards commons — so a rare build stops being a thing you
    // hope for and becomes a thing you shop for. And the Colophon pick the alley
    // costs stops being a gamble on the spread: it is simply there, every
    // chapter, for the rest of the run.
    //
    // He scores nothing at all, which is the company he keeps (the Purveyor,
    // the Chapman): a seat you buy for what it does to the SHAPE of a run.
    id: 'fence',
    when: 'meta',   // the guarantee is in rollOffers — js/colophon.js;
                    // the price in alleyAsks — js/blackmarket.js
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
    // Every amber tile in hand at the page's end, with no ceiling — the hand
    // itself is the limit, and filling it with amber is the build. The credit is
    // with THIS fair's stallholders and expires when the Market closes
    // (closeMarket in js/market.js), so a great haul cannot be hoarded.
    id: 'factor',
    when: 'meta',
    onPageComplete({ state }) {
      const n = state.rack.filter(t => countsAsColour(t, 'amber')).length;
      if (!n) return null;
      state.freeRerolls = (state.freeRerolls ?? 0) + n;
      return { note: `${n} free re-roll${n > 1 ? 's' : ''} banked` };
    },
  },
  {
    // The Factor's flat cousin, and the cheap way in: one free re-roll, banked
    // every page, where the Factor's count is whatever amber the hand ended
    // with. They stack — both write into state.freeRerolls — and both expire
    // when that Market closes (closeMarket in js/market.js), because a credit
    // with a stallholder is a credit with THIS fair. Which is the whole of what
    // the seat is: a page's worth of indecision, paid for by the stall.
    id: 'ditherer',
    when: 'meta',
    onPageComplete({ state }) {
      state.freeRerolls = (state.freeRerolls ?? 0) + 1;
      return { note: 'a free re-roll banked' };
    },
  },
  {
    // ONE forged sort a page, chosen off a plate of the whole case. It spells
    // and does nothing else — worth no Points, and nothing can be written on it
    // (spellsOnly and isImmutable in js/state.js) — so what it buys is LENGTH,
    // and whatever your engines can make of a letter that is merely present: a
    // doubled pair for The Twins to strike from, a fourth colour for The
    // Illuminator to find, a shape for an editor to approve of.
    //
    // One a page is the whole of the limit, and it has to be: a free letter is a
    // small kindness, a free HAND is a different game. It costs a place in the
    // hand while it is there, and the page takes it back.
    //
    // Unless The Twins get to it. A twin struck onto a forgery makes it REAL —
    // it stops being counterfeit, stops being page-only, and is adopted into the
    // collection wearing the mould (recastTile in js/state.js). That is the seat
    // at its best: a worthless letter you took this morning goes into the bag
    // tonight as a copy of your finest tile.
    id: 'counterfeiter',
    when: 'meta',   // used from his card — the sheet lives in render.js, the taking in main.js
    act: ({ seat, data }) =>
      (!seat || state.inMarket || state.inColophon) ? ''
      : data?.used
      ? `<button class="btn btn-quiet tip-btn" disabled>The plate is cold until the next page</button>`
      : `<button class="btn btn-quiet tip-btn" data-patron-act="counterfeiter">Look over the plate…</button>`,
    onPageStart({ data }) { data.used = false; return null; },
  },
  {
    // Used from his card mid-page rather than at a sheet: tap the card, take the
    // loan. Cast through castLentTile wearing gold trim from birth — the one way
    // a lent tile wears metal, since nothing can be written to it later. Once a
    // page; the flag re-arms below as the next page is dealt.
    id: 'scientist',
    when: 'meta',   // used from his card — the act button below, the loan in main.js
    act: ({ seat, data }) =>
      (!seat || state.inMarket || state.inColophon) ? ''
      : data?.used
      ? `<button class="btn btn-quiet tip-btn" disabled>Lent this page already</button>`
      : `<button class="btn btn-quiet tip-btn" data-patron-act="scientist">Ask for the OLOGY tile</button>`,
    onPageStart({ data }) { data.used = false; return null; },
  },

  {
    // Half of the feud. He is paid for a word in amber with no jade in it, so
    // he and Juliet can never fire on the same word — which is the whole point
    // of the seat they turn into: The Star-Crossed Lovers asks for exactly the
    // word neither house would take alone. The wedding itself is marryLovers in
    // js/state.js, called wherever a patron arrives.
    id: 'romeo',
    when: 'score',
    effect({ tiles, xMult }) { if (houseOnly(tiles, 'amber', 'jade')) xMult(LOVERS.apart); },
  },

  // ── Jade · growth and permanence ────────────────────────────────────────────
  {
    // The only seat in the game paid for BREADTH. Everything else rewards
    // doubling down — one colour, one letter, one shape — and this one rewards
    // having pressed a sort you have never pressed before, which is the whole
    // of a case of type: one of everything, in order.
    //
    // Which makes it the only reason to set your Q, your X, your Z: letters
    // every other seat teaches you to throw away. It grows slowly and it never
    // stops, and a full case is worth +1.6 Mult on every word for the rest of
    // the run — the alphabet alone is +1.4, and the four medieval sorts are the
    // last, hardest 0.2 (the Medievalist's stall is the only road to them).
    //
    // The tally is a plain array on the seat's data so it survives save and
    // load, and is advanced in onPrinted — never in effect(), which runs on
    // every keystroke.
    id: 'abecedarian',
    when: 'score',
    effect({ data, addMult }) {
      const n = (data?.seen ?? []).length;
      if (n) addMult(abecedarianMult(n));
    },
    // The case quickens as it fills, so what the NEXT sort is worth is half the
    // decision — the same reading the Beekeeper's hive gives, pointing the
    // other way.
    tally(data) {
      const n = (data?.seen ?? []).length;
      const all = ABECEDARIAN_CASE.length;
      if (!n) return `An empty case \u2014 ${all} sorts to find, and the first is worth +${ABECEDARIAN_MULT}.`;
      const next = Math.round((abecedarianMult(n + 1) - abecedarianMult(n)) * 100) / 100;
      return `${n} of ${all} sorts collected \u2014 +${abecedarianMult(n)} Mult.`
           + (n < all ? ` The next is worth +${next}.` : ' The case is complete.');
    },
    onPrinted({ tiles, data }) {
      const seen = (data.seen ??= []);
      const fresh = [];
      for (const t of tiles) {
        for (const g of caseGlyphs(getActiveLetter(t))) {
          if (seen.includes(g) || fresh.includes(g)) continue;
          fresh.push(g);
        }
      }
      if (!fresh.length) return null;
      seen.push(...fresh);
      const full = seen.length >= ABECEDARIAN_CASE.length;
      return {
        note: `${fresh.join(' ')} — new`,
        say: [full
          ? `the case is complete: every sort in the press, and +${abecedarianMult(seen.length)} Mult for good.`
          : `${fresh.join(', ')} set for the first time — ${seen.length} of ${ABECEDARIAN_CASE.length} sorts, +${abecedarianMult(seen.length)} Mult.`],
      };
    },
    instDesc(data) {
      const n = (data?.seen ?? []).length;
      if (!n) return PATRON_CARDS.abecedarian.desc;
      const next = Math.round((abecedarianMult(n + 1) - abecedarianMult(n)) * 100) / 100;
      return `${n} of ${ABECEDARIAN_CASE.length} sorts pressed — +${abecedarianMult(n)} Mult on every word. `
           + `The next is worth +${next}, for good.`;
    },
    // The case itself, laid out as a compositor would find it: what has been
    // pressed stands in type, what has not is an empty place.
    popover(data) {
      const seen = new Set(data?.seen ?? []);
      const cells = ABECEDARIAN_CASE.map(g => {
        const got = seen.has(g);
        const glyph = MEDIEVAL[g]?.glyph ?? g;
        return `<span class="case-sort${got ? ' case-sort--set' : ''}">${glyph}</span>`;
      }).join('');
      return `<div class="case-grid">${cells}</div>`;
    },
  },
  {
    // The growth arrives IN TIME TO SCORE: tileBonus pays the step on the
    // trigger word itself and onPrinted writes the same step in for good. An
    // immutable tile (a ghost, a fleuron) refuses the trellis and pays nothing
    // for it either way — hence the isImmutable guard in both halves.
    id: 'child',
    when: 'score',
    bonusIsGrowth: true,
    tileBonus: (t, { tiles }) =>
      (wordLetters(tiles).length === 3 && !isImmutable(t) ? CHILD_STEP : 0),
    onPrinted({ tiles, grow }) {
      if (wordLetters(tiles).length !== 3) return null;
      const grown = tiles.filter(t => grow(t, CHILD_STEP));
      if (!grown.length) return null;
      return { note: `${grown.map(getActiveLetter).join(', ')} grown +${CHILD_STEP}` };
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
      // `say`, not `note`: what he dressed goes to the status line at the foot
      // of the board rather than floating over his card. A floater is right for
      // a number you watch land; this is a list of tiles and what each is now
      // wearing, which wants reading rather than glancing at — and the coats
      // themselves are already being shown on the tiles (dressPrinted, main.js).
      const notes = [];
      if (dressed.length) notes.push(`dressed in ${dressed.join(', ')}`);
      if (daubed.length)  notes.push(`painted ${daubed.join(', ')}`);
      return notes.length ? { say: [notes.join(' · ')] } : null;
    },
  },
  {
    id: 'seedsman',
    when: 'score',
    tileBonus: (t, { state }) => (countsAsColour(t, 'jade') ? state.chapter : 0),
  },
  {
    // Paid by the size of the vein: +1 Point per jade tile in the whole
    // collection, on every jade tile printed. No growth to write — the count
    // moves with the collection itself, so a tile bought this page already
    // pays the tiles bought last page, and vice versa.
    id: 'lapidary',
    when: 'score',
    tileBonus: (t, { state }) =>
      (countsAsColour(t, 'jade') ? state.collection.filter(c => countsAsColour(c, 'jade')).length : 0),
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
    tally(data) {
      const n = data?.aged ?? 0;
      return n
        ? `${n} page${n === 1 ? '' : 's'} aged through \u2014 +${n} Coins on his dismissal.`
        : null;
    },
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
    // He crowns one head only — his own — and asks for a word wearing BOTH
    // metals: a gold trim and a silver trim, on any two tiles. One crown per
    // word however many of each are in it, because the achievement is the pair
    // and not the count.
    //
    // A condition you build the CASE for rather than the word: gold and silver
    // are bought a tile at a time at the Gilder's, so the seat is worth little
    // the day you sit him down and more with every trim you lay afterwards.
    // Nothing in scoring knows about him — laurels are already paid seat by seat
    // for whoever wears them (pass 4), so this hook need only put them on his
    // head. Dismissing him takes every crown with him.
    id: 'laureate',
    when: 'meta',
    onPrinted({ tiles, data }) {
      const wears = kind => tiles.some(t => t.trim === kind);
      if (!wears('gold') || !wears('silver')) return null;
      data.honorifics = (data.honorifics ?? 0) + 1;
      return {
        note: `gold and silver together — a laurel, +${data.honorifics * HONORIFIC_STEP} Points every word`,
      };
    },
  },

  {
    // Romeo's opposite number in jade — see his note above.
    id: 'juliet',
    when: 'score',
    effect({ tiles, xMult }) { if (houseOnly(tiles, 'jade', 'amber')) xMult(LOVERS.apart); },
  },
  {
    // What the pair become. The exclusion is gone and the demand inverted: the
    // houses are reconciled, so the word that paid neither of them apart is the
    // one that pays now. That makes a single rainbow tile enough on its own —
    // the seat rainbow metal was always owed, and the reason it is worth
    // striking.
    id: 'lovers',
    when: 'score',
    effect({ tiles, xMult }) {
      if (painted(tiles, 'amber').length && painted(tiles, 'jade').length) xMult(LOVERS.united);
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
    // The one seat that SPENDS the paint economy instead of feeding on it, and
    // the answer to a late run where the build is already built. Paint is the
    // game's multiplicative engine — each painted tile is +1 to its colour's
    // multiplier and the colours multiply ACROSS one another, so a well-dressed
    // word reaches ×12 and past it. He takes all of that away and gives back an
    // additive number that never needs the right colour in the right word, never
    // stops growing, and cannot be drawn badly.
    //
    // What makes it a decision rather than a one-time cost is that the ramp is
    // paid PER COAT, not per word: once your tiles are bare he pays nothing, so
    // keeping him fed means buying paint — a tube, a pot, a wash — and that is
    // the point. He is a sink that turns Coins into permanent Mult, which is the
    // thing a rich late run has nowhere to put.
    //
    // A wash counts (getActiveColour reads a wash as paint, so anything that can
    // see a coat can take one) and so does a coat laid mid-word by a painting
    // seat, which is read off the script rather than the tile — pass ½ paints a
    // COPY, and the seat that laid it may not have made it permanent yet.
    //
    // `speaksLast` is load-bearing. Without it, seating him in FRONT of a painter
    // would let him count that painter's coat and leave it on the tile, which is
    // strictly better than seating him behind and would make the seat free. He
    // washes the forme after the day's printing; there is no other order for it.
    id: 'lyeboy',
    when: 'score',
    speaksLast: true,
    effect({ data, addMult }) {
      const m = lyeBoyMult(data?.coats ?? 0);
      if (m) addMult(m);
    },
    onPrinted({ tiles, script, data, strip }) {
      const taken = [];
      for (const t of tiles) {
        // What the WORD wore, which is not always what the tile wears: a coat
        // laid in scoring's pass ½ is on the copy the score was read from.
        const coat = getActiveColour(t) ?? script?.tilePaint?.get(t.id) ?? null;
        if (!coat || isImmutable(t)) continue;
        strip?.(t);
        taken.push(coat);
      }
      if (!taken.length) return null;
      data.coats = (data.coats ?? 0) + taken.length;
      return { note: `+${lyeBoyMult(data.coats)} Mult`,
               say: [`${taken.length} coat${taken.length > 1 ? 's' : ''} scrubbed off — `
                   + `+${lyeBoyMult(data.coats)} Mult on every word from here.`] };
    },
    tally(data) {
      const coats = data?.coats ?? 0;
      if (!coats) return 'The bucket is clean — no coats drunk yet.';
      const next = Math.round((lyeBoyMult(coats + 1) - lyeBoyMult(coats)) * 100) / 100;
      return `${coats} coat${coats > 1 ? 's' : ''} scrubbed off — +${lyeBoyMult(coats)} Mult on every word. `
           + `The next is worth +${next}.`;
    },
  },
  {
    id: 'serpent',
    when: 'score',
    effect({ word, xMult }) { if (word.length > 1 && word.endsWith('S')) xMult(2); },
    onPrinted({ tiles, burn }) {
      if (!wordLetters(tiles).endsWith('S')) return null;
      // The last tile that is an S and nothing else: marks trailing it are
      // skipped, a ligature ending in S is left alone.
      const last = [...tiles].reverse().find(t => !isMark(getActiveLetter(t)));
      if (!last || getActiveLetter(last) !== 'S') return null;
      // He strikes at SERPENT_EAT_ODDS and misses the rest of the time — and the
      // ×2 is already paid, so what the seat asks is a bet rather than a toll.
      // Not a luckyRoll: keeping the S is the good outcome, so the luck dial
      // rides on the ESCAPE, which is the one the player would wish for.
      if (luckyRoll(1 - SERPENT_EAT_ODDS)) return { note: 'the S wriggles free' };
      if (!burn(last)) return null;
      return { note: 'the S swallowed', burned: [last] };
    },
  },
  {
    // Two licences, one voice, both of them spent at the dictionary check in
    // main.js (bookbinderPardon) — so like every other excuse in the game the
    // word PRINTS as you set it. That is not a detail here, it is the engine:
    // BOOOOOB prints as seven letters and the measure counts all seven, which
    // turns a howl into a length multiplier and a pile of cheap O tiles into a
    // build. The accent is the cheaper half and the one that saves a hand — a V
    // for a W wherever the word wants one.
    //
    // He is `locked` until the run has met a ghost. Nothing about the seat cares
    // which ghost or how: a card dealt dead at the counter, a patron the Ripper
    // took, a lover merged with nowhere to sit. state.metGhost is set at those
    // doors (makeGhost in js/state.js, the Market's deal in js/market.js) and
    // cleared with the run, so this is a thing a run earns rather than a thing
    // an account unlocks.
    id: 'bookbinder',
    when: 'meta',       // the licences are read at the dictionary check
    locked: () => !state.metGhost,
    instShelf: () => 'Bookbinder',
    popover() {
      const row = (head, body) =>
        `<div class="gen-term"><span class="gen-term-head">${head}</span>${body}</div>`;
      return `<div class="gen-terms">`
        + row('accent', 'a V may be read as a W — VORD stands as WORD. Never the other way about.')
        + row('howl', 'a run of O’s may be read as any shorter run — BOOOOOB stands as BOB.')
        + row('and', 'the word still prints as you set it, so every howled O counts for the measure.')
        + `</div>`;
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
    // The coin is for SPOTTING a rat, the Mult for having EATEN one — two
    // different appetites, and only the second is permanent. The tally lives on
    // the seat's data so it survives save and load, and is advanced in onPrinted
    // like every other permanent gain, so the Mult is paid from the next word on.
    effect({ word, data, addCoins, addMult }) {
      if (word.includes('RAT')) addCoins(1);
      const fed = data?.eaten ?? 0;
      if (fed) addMult(shorthairMult(fed));
    },
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
        data.eaten = (data.eaten ?? 0) + eaten.length;
        said.push(eaten.length > 1
          ? `The cat eats ${eaten.length} RAT tiles — gone for good, and +${shorthairMult(eaten.length)} Mult on every word.`
          : `The cat eats the RAT tile — gone for good, and +${shorthairMult(1)} Mult on every word.`);
      }
      return (notes.length || said.length)
        ? { note: notes.join(' · ') || null, say: said, burned: eaten }
        : null;
    },
    instDesc(data) {
      const fed = data?.eaten ?? 0;
      if (!fed) return PATRON_CARDS.shorthair.desc;
      return `${fed} rat${fed > 1 ? 's' : ''} eaten — +${shorthairMult(fed)} Mult on every word. `
           + PATRON_CARDS.shorthair.desc;
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
    tally(data) {
      const n = data?.stacks ?? 0;
      return `${n} tile${n === 1 ? '' : 's'} burnt — \u00d7${stokerMult(n)} Mult.`;
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
    act: () => `<button class="btn btn-quiet tip-btn" data-patron-act="neologist">Coin a word…</button>`,
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
      if (bees) xMult(beekeeperMult(bees));
    },
    onPrinted({ tiles, data }) {
      const caught = tiles.filter(t => getActiveLetter(t) === 'B').length;
      if (!caught) return null;
      data.bees = (data.bees ?? 0) + caught;
      return {
        note: `${caught === 1 ? 'a bee' : `${caught} bees`} — ×${beekeeperMult(data.bees)} Mult`,
      };
    },
    // What the hive is worth right now, and what the next bee would add — the
    // curve slows twice, so a seat that says only "×2.4" hides the decision.
    tally(data) {
      const bees = data?.bees ?? 0;
      if (!bees) return 'No bees yet — ×1 Mult.';
      const now  = beekeeperMult(bees);
      const next = Math.round((beekeeperMult(bees + 1) - now) * 100) / 100;
      return `${bees} bee${bees > 1 ? 's' : ''} in the hive — ×${now} Mult. The next is worth +${next}.`;
    },
  },
  {
    // Names are vouched through the dictionary check in main.js, like the
    // Stenographer's acronyms — legitimate, not misspellings. Unlike his, the
    // list also PAYS whether or not the word is in the dictionary: GRACE is no
    // less a name for being a word. wordlists/names.txt, rebuilt with
    // tools/build-names-list.mjs.
    id: 'expectants',
    when: 'score',
    effect({ word, addPoints }) {
      if (themeSize('names') && inTheme('names', word)) addPoints(EXPECTANTS_BONUS);
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
    // The one patron paid for what a word ISN'T. wordlists/common.txt
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
    when: 'meta',   // consulted at the dictionary check in main.js; the list lives in wordlists/acronyms.txt
  },
  {
    // Not a misspelling like the excuses below: nothing has gone wrong here. It
    // licenses a construction — the compound noun, which English makes freely
    // and dictionaries only ever catch up with.
    id: 'binder',
    when: 'meta',   // consulted at the dictionary check in main.js; the list lives in wordlists/nouns.txt
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
      if (pairs) addMult(Math.round(pairs * GLOVER_STEP * 100) / 100);
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
  // Each keeps one of the themed lists in wordlists/ and pays ×3 when
  // the printed word is on it — and sends a package of its own the rest of the
  // time (registerPatron, above). The lists are flat files — edit them freely.
  registerPatron('sexton',    'spooky'),
  registerPatron('paramour',  'romantic'),
  registerPatron('poppet',    'cute'),
  registerPatron('vulgarian', 'rude'),

  // ── The three parts of speech ───────────────────────────────────────────────
  // The registers above ask what a word is ABOUT; these three ask what it DOES
  // in a sentence, off three more flat files in wordlists/. They fire
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

  // ── Misspellings · the three excuses ────────────────────────────────────────
  // Titivillus (azure) forgives anything a vowel can do wrong; these two forgive
  // the consonants their oldest slips. All three are consulted at the dictionary
  // check in main.js, and the word prints exactly as you set it, misspelling and
  // all. Only the Haplographer also touches the score.
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
// asks, plus the day's haggle (rollHaggle in constants.js), plus whatever the
// seller adds on their own account (`markup` — the Black Market's, and the only
// one so far). Read live from the offer rather than baked in, the way tile
// prices are. A patron the card prices at NOTHING stays at nothing: the cat is
// found, not bought. Everyone else asks at least a Coin however the haggle went.
//
// The markup rides on the seat's `data` and so travels with the seat, which is
// what makes patronRefund pay back half of what you ACTUALLY paid rather than
// half of a list price you never saw.
export const patronCost = (def, data) => {
  const base = def?.cost ?? 0;
  if (!base) return 0;
  const asked = base + (data?.haggle ?? 0) + (data?.markup ?? 0)
              + (data?.postnom ? POSTNOM.surcharge : 0)
              + (data?.ghost   ? GHOST_HIRE.surcharge : 0);
  return Math.max(1, asked);
};

// Seats on the shelf flying a given colour, dual liveries included. Every
// guild-scaling effect counts through here — the Composter's heap allowance,
// the Banker's page coin, the Orchardist's Mult — and each counts the counting
// patron itself, so a lone one is as good as it was before guilds mattered.
// What a head wearing `laurels` is paid, as the badge's tooltip says it. The
// shelf, the graveyard and the Market's shelf strip all read this, so The
// Laureate's arrival re-prices every crown in all three at once, and none of
// them can drift from what scoring.js pass 4 actually does.
export const laurelWorth = laurels => {
  const points = `+${laurels * HONORIFIC_STEP} Points`;
  const mult = owns('laureate')
    ? ` and +${Math.round(laurels * LAUREATE_MULT_STEP * 100) / 100} Mult`
    : '';
  return `${laurels > 1 ? `${laurels} laurels` : 'A laurel'} — ${points}${mult} every word`;
};

// Everything a seat is carrying that changes what it pays, as plain lines for
// the card's tap-through. Two sources: the laurels any patron may wear (priced
// through laurelWorth, so The Laureate's arrival re-prices them here too), and
// the seat's own `tally(data)` — its hive, its stacks, its book. A seat with
// nothing accumulated returns an empty list and the popover shows no strip at
// all, so the ordinary card stays as short as it always was.
export function seatTally(def, data) {
  const lines = [];
  const laurels = data?.honorifics ?? 0;
  if (laurels) lines.push(laurelWorth(laurels));
  const own = def?.tally?.(data);
  if (Array.isArray(own)) lines.push(...own.filter(Boolean));
  else if (own) lines.push(own);
  return lines;
}

export const guildSeats = colour =>
  allSeats().filter(p => guildsOf(patronById(p.id)).includes(colour)).length;

// How often the Market's pool holds each card. 'ubiquitous' is three times a
// common one, and is for the two patrons that are ROLLED rather than written —
// the Monogrammist and the Generic. What makes those two worth meeting is the
// roll, and you learn nothing about a table of rolls from one card a run: they
// have to turn up often enough that you start reading them at a glance.
export const RARITY_WEIGHT = { ubiquitous: 9, common: 3, uncommon: 2, rare: 1 };
