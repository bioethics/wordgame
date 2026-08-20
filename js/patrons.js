// Patrons of the print house. Each grants a standing boon.
//
// when: 'score' — effect(ctx) runs while a word is scored.
//       'meta'  — handled explicitly elsewhere (page start, page reward, discards,
//                 the dictionary check), or via the hooks below.
//
// Score ctx: { word, tiles, state, data, addPoints(n), addMult(n), xMult(n),
//              addCoins(n) }
// The add/x helpers record an animation step automatically. `data` is the
// seat's memory and is READ-ONLY here — scoring runs on every keystroke to
// power the live preview, so counters are advanced in onPrinted, never here.
//
// The patron pass is SEQUENTIAL: seats speak in the order they sit, and a
// ×Mult multiplies everything said in front of it and nothing said behind it.
// A seat that adds Points therefore wants to sit ahead of the seats that
// multiply — see the running order in scoring.js, pass 4.
//
//   tileBonus(tile, ctx) — Points written onto ONE TILE before the word is
//     scored at all; ctx { tiles, state, data }. Return 0 for a tile the
//     patron doesn't touch. This is the hook for every patron whose promise is
//     of the form "such-and-such tiles gain +N Points": the number lands on
//     the tile itself, visibly, in the live preview and again at the head of
//     the print — which means nicks and Monogrammists multiply it, as the
//     wording always implied. A patron that pays for a PROPERTY of the whole
//     word (the Firebrand's two crimson tiles, the Apprentice's four letters)
//     is not this; it stays an effect() and pays the word, not a tile.
//
//   bonusIsGrowth — set alongside tileBonus when the Points that hook pays are
//     the same Points onPrinted then writes into the tile for good (the jade
//     trellises: the Abecedarian, the Espalier). It changes nothing about the
//     count; it tells the groove to show those numbers in jade rather than
//     brass, so a permanent gain never looks like a passing one.
//
//   tilePaint(ctx) — paint laid on tiles BEFORE the word is counted at all;
//     ctx { tiles, state, data }. Return [{ tile, colour }] for the tiles this
//     patron paints, or null for none. Scoring's pass ½ applies it to a copy of
//     the word, so everything downstream — the colour multipliers, the tile
//     bonuses, every patron's effect — reads the new colour, and the groove
//     shows it as you compose. The paint is provisional until the word prints:
//     the seat's own onPrinted is what makes it permanent, and it should lay
//     what the script recorded rather than working it out a second time.
//     Must be a pure function of the word, and must give the same answer every
//     time it is asked — scoring runs on every keystroke, and a brush that
//     wandered would make the preview a lie.
//
// Optional hooks (main.js dispatches these for every seated patron):
//   onPrinted(ctx)    — after a word commits; ctx { tiles, script, state, data,
//                       grow(tile, n), paint(tile, colour), burn(tile),
//                       trim(tile, kind) }. May mutate the collection
//                       (permanent growth, paint, burns). Return { note } to
//                       say something over the patron's own card, { say: [line…] }
//                       to say it in the status bar at the foot of the board
//                       instead — which is where news about the PRESS belongs,
//                       a tile leaving the collection for good above all; the
//                       lines are folded into the word's own score line, which
//                       is what holds the bar long enough for them to be read
//                       (see runPrintedHooks in js/main.js) — and
//                       { burned: [tile…] } for tiles that must not retire to
//                       the discard pile.
//   onPageStart(ctx)  — as a page's bag is dealt, before the hand is drawn;
//                       ctx { state, data, cast(overrides) }, where cast
//                       strikes a new tile into hand and collection alike.
//                       Return { note, tiles } so the arrival can be animated.
//   onChapterEnd(ctx) — as a chapter clears, before the next page's bag is
//                       shuffled; ctx { state, data }. Return { note } likewise.
//   onPageComplete(ctx) — as a page's quota clears, while the hand still
//                       holds whatever went unplayed; ctx { state, data }.
//                       Return { note } likewise (logged). This is the hook
//                       for patrons that read the leftover hand — the
//                       Factor banks re-rolls, the Cellarer ages.
//   onDiscard(ctx)    — after tiles are thrown away, before the hand tops up;
//                       ctx { tiles, state, data, paint(tile, colour),
//                       trash(tile), merge(left, right), grow(tile, n),
//                       bench(kind) }. bench puts a sundry on the workbench
//                       and returns false when there is no room for it —
//                       a seat that pays in tools is one you clear a slot
//                       for. The tiles are
//                       already in the discard pile but still in the
//                       collection, so paint written here is waiting when the
//                       bag comes round again. A hand widened here (the
//                       Ragman's azure) is felt at once: main.js fills the
//                       hand a second time after the seats have spoken. Return { note } likewise,
//                       { painted: [{ tile, colour }] } for tiles that should
//                       take their new colour on screen before they fly off,
//                       { trashed: [tile…] } for tiles destroyed outright —
//                       main.js unfiles those from the pile and burns them
//                       away instead of flying them — and
//                       { merged: [{ tile, alt }] } for tiles recast with a
//                       second face, shown on the board before they file.
// `data` is the seat's own saved memory (state.js patronData) — counters live
// there, never on the def.
//
// Stackable patrons (the Monogrammist): `stackable: true` lets the Market keep
// offering a patron you already hold, and every seat carries a unique `uid` so
// copies can be badged, dismissed and animated as themselves. Such defs may
// roll per-copy state with `onOffer()` (shown on the Market card, moved onto
// the seat's data at purchase) and present themselves with `instName(data)`,
// `instShelf(data)` and `instDesc(data)` — everything falls back to the plain
// def fields when absent.
//
//   tileEcho(tile, data, tiles) — marks tiles that print TWICE: Points, gold
//     Coins, cobalt refreshes, paint and purple trim alike. Scoring counts the
//     seats in pass 0 and spends the result across passes 1 to 3, doubling per
//     marking seat, so two seats that both name a tile reach ×4. Not only for
//     stackable patrons: the whole word is handed over as `tiles`, so a seat
//     may pick its tiles out of the word it is in (The Twins double a doubled
//     letter) rather than by name (a Monogrammist's three letters). Like every
//     scoring hook it must give the same answer every time it is asked.
//
// Optional `portrait`: path to an image (e.g. 'img/patrons/scholar.png') shown
// on the patron's business card in the market and draft instead of the emoji.
//
// Optional `guild`: the livery a patron wears — 'amber' | 'jade' | 'crimson' |
// 'azure' — absent for the neutral majority, and an ARRAY for the rare patron
// who wears two (the Cellarer). Read it through guildsOf(def), which always
// returns an array; the first entry is the primary — the ribbon and pin the
// card wears — and every entry counts as represented on the shelf. Membership
// is thematic, not mechanical: it drives the calling card's ribbon, the
// seat's livery pin, and nothing else — except the Alderman, who pays ×1.5
// for every guild represented on the shelf, fired or not (scoring pass 4½).
// Because he counts liveries rather than effects, adding a `guild` to a def
// makes that patron worth more to an Alderman build even if its own effect
// never changes — and a dual-livery patron flies two flags from one seat.
// Assignments may drift as flavour demands.
//
// Optional `refundBonus(data)`: extra Coins this seat's dismissal pays on
// top of the standard half-cost — read by patronRefund in market.js.

import {
  GRAFTER_STEP, STOKER_BASE, STOKER_STEP, BEEKEEPER_STEP, ARSONIST_ODDS,
  NUDIST_TRIM_CHANCE, NUDIST_PAINT_CHANCE, ABECEDARIAN_STEP,
  RAGMAN_ODDS, RAGMAN_COINS, REVENANT_ODDS, MATERIALS,
  PACKAGE_ODDS, PACKAGES, PACKAGE_OF_PATRON,
  DYE_TILES_PER_CHAPTER, COLOURS, TRIMS, LIGATURES, isMark,
  BAG_COUNTS, FRONTISPIECE, DIPPER_PAINT_CHANCE,
  HEADSMAN_STEP, ESPALIER_STEP, HONORIFIC_STEP, RIPPER_WORDS, splitMarks, isImmutable,
  medievalExpansions, POSTNOM,
} from './constants.js';
import {
  state, getActiveColour, getActiveLetter, countsAsColour, luckyRoll,
  paintRandomTiles, restingPoints, shuffle, owns, allSeats, effectiveSundrySlots,
} from './state.js';
import { inTheme, themeSize, THEME_SETS } from './themes.js';
// The Mirror reads a word backwards against the dictionary; the Haplographer's
// licence reads it with one letter doubled.
import { DICT } from './dict.js';

const VOWELS = 'AEIOU';

// The four dearest letters in the case — 8+ Points apiece, one of each in the
// starting bag. The Antiquary pays a finder's fee for any of them.
const RARE_LETTERS = ['J', 'QU', 'X', 'Z'];

const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// Tiles that read as a given colour: the tile's own paint, or a
// rainbow tile, which reads as every colour at once. Every patron that cares
// about colour goes through here, so rainbow metal reaches all of them and
// none of them had to learn about it.
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

// The Haplographer's licence: a word that becomes a dictionary word when one
// of its letters is printed twice may be read that way. The doubled form has
// to be real — MATE reads as MATTE, GRIP reads as nothing. Exported because
// the licence cuts two ways from one rule: main.js consults it at the
// dictionary check (BALOON stands for BALLOON), and The Twins and The
// Stammerer consult it at scoring, where the reading counts as one more
// doubled pair. Note the scoring half doesn't ask whether the pardon fired —
// a word valid as typed that can also be read doubled (MATE) still pays,
// which is the licence being a licence rather than an excuse.
//
// The index half is what The Twins need: they pay the TILE now, not the word,
// so the licence has to name WHICH letter is being read twice.
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

// What a word of tiles spells, marks left off — the reading a patron handed
// only `tiles` has to do for itself. Scoring's own `letters` (medieval sorts
// resolved) is richer, but the tile hooks are given the tiles alone.
const wordLetters = tiles =>
  tiles.map(getActiveLetter).filter(L => !isMark(L)).join('');

// The tiles standing in a doubled pair — what The Twins read. The word is
// walked LETTER by letter rather than tile by tile, each letter remembering
// the tile it came from, so a ligature is counted for what it spells: a CH
// beside an H doubles them both, and a tile that spells its own double stands
// as a pair by itself. Pairs don't overlap, the same rule doubledPairs counts
// by: AAA is one pair (and two tiles), AAAA is two.
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
  // The Haplographer's licence, read onto the tile it pardons: the single L of
  // BALOON stands for two, so that tile is a doubled letter like any other.
  if (owns('haplographer')) {
    const at = licencedIndex(chars.map(c => c.ch).join(''));
    if (at >= 0) ids.add(chars[at].tile.id);
  }
  return ids;
}

// The medieval sorts, read as the letters they stand for. Every reading is
// tried in `reads` order and the first that is a real word wins; failing that
// the first reading stands, so a word that is going to be refused anyway is at
// least refused as something pronounceable. Exported because the whole game
// downstream of the dictionary — the patrons, the editors, the measure — must
// see THORN where the board shows þORN, and both the live preview (scoring)
// and the print (main.js) resolve through this one function so they cannot
// disagree. A word holding no medieval sort comes back untouched.
export function resolveMedieval(letters) {
  const options = medievalExpansions(letters);
  if (!options) return letters;
  return options.find(w => DICT.has(w)) ?? options[0];
}

// The Stoker's furnace: lit at STOKER_BASE the moment he sits, and STOKER_STEP
// hotter for every crimson tile it has eaten since. His score effect and the
// note his card floats when a tile goes in both read it here, so the number
// he promises is the number he pays.
const stokerMult = stacks =>
  Math.round((STOKER_BASE + stacks * STOKER_STEP) * 100) / 100;

// The Binder's licence: two nouns set end to end make a word of their own, so
// DOOM and HAT make DOOMHAT. Returns the two halves (the log shows its
// working) or null. Three letters is the shortest entry on the nouns list, so
// a compound under six letters cannot exist. Exported because this rule, like
// the Haplographer's, cuts two ways from one place: main.js consults it at the
// dictionary check, and The Sculptor consults it at scoring, where a
// compound the Binder allows reads as the noun it plainly is.
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
// singular here and looked up as that. Every ending English regularly uses,
// and then the irregulars, which no rule can reach and so are named outright.
// A candidate that isn't a noun simply misses: the list is the judge, this
// only decides what to ask it.
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

// Whether a word reads as a noun — on the list outright, the plural of
// something on it, or two of its entries stacked while The Binder is seated.
// The compound half is his and no one else's: without that seat DOOMHAT is not
// a word at all, so there is nothing for The Sculptor to be paid for. (His
// halves stay singular: the list he stacks from is unchanged, so DOOM and HAT
// still make a word and CATS and HAT still don't.)
const readsAsNoun = word =>
  inTheme('nouns', word)
  || nounSingulars(word).some(w => inTheme('nouns', w))
  || (owns('binder') && !!boundNouns(word));

// Every colour represented in a set of tiles, read the way patrons read
// colour (countsAsColour) — so a rainbow tile represents all four at once.
// The distinct-colour patrons (the Harlequin, the Illuminator) count through
// here, which is exactly what makes a rainbow tile their jackpot.
const distinctColours = tiles =>
  Object.keys(COLOURS).filter(c => tiles.some(t => countsAsColour(t, c)));

// The Illuminator's brief: exactly three colours represented, and at least one
// tile that reads as no colour at all and will take paint. It names the tile
// as well as the colour — the FIRST bare one, deliberately, so the answer is
// the same every time it is asked. That matters now that the paint lands
// before the word is counted: the groove shows the tile take its colour as
// you compose, the multipliers count it, and the brush at print puts it
// exactly where the preview promised. Because a rainbow reads as all four
// colours, a word holding one is never at exactly three — the Illuminator and
// rainbow metal ignore each other.
function illuminate(tiles) {
  const present = distinctColours(tiles);
  if (present.length !== 3) return null;
  const missing = Object.keys(COLOURS).find(c => !present.includes(c));
  const target = tiles.find(t => !distinctColours([t]).length && !isImmutable(t));
  return target ? { missing, target } : null;
}

// The registers' parcel, written once for all four. A ×3 Mult on a list you
// cannot plan for is a lottery ticket rather than a build — see PACKAGES in
// constants.js — so each register keeps a package behind its multiplier, and
// prints one onto the workbench PACKAGE_ODDS of the time it fires. The bench
// may refuse it: a full one turns the parcel away, and the caller says so, so
// keeping a slot free is a real thing to weigh against holding a second tube.
//
// The score effect and this share one condition through inTheme, so the card
// that lit up as you composed is the card that sends the parcel — a register
// can never pay the ×3 and withhold the package, or the reverse.
function registerPatron(id, name, emoji, theme, cost, blurb) {
  return {
    id, name, emoji, rarity: 'rare', cost,
    desc: `×3 Mult for any of the thousands of words ${name} finds ${blurb} — and a 1-in-${Math.round(1 / PACKAGE_ODDS)} chance of ${PACKAGES[theme].label} for the workbench.`,
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

// The dye commons: one per colour, each the same patron in a different pot.
// They paint at the turn of a chapter, before the next page's bag is shuffled,
// so what they colour is in play from the very first draw.
function dyePatron(id, name, emoji, colour) {
  const label = COLOURS[colour].label.toLowerCase();
  return {
    id, name, emoji, rarity: 'common', cost: 4, guild: colour,
    desc: `As each chapter ends, ${DYE_TILES_PER_CHAPTER} tiles of your collection are painted ${label}.`,
    when: 'meta',
    onChapterEnd() {
      const letters = paintRandomTiles(colour, DYE_TILES_PER_CHAPTER);
      return letters.length ? { note: `${letters.join(', ')} painted ${label}` } : null;
    },
  };
}

export const PATRON_DEFS = [
  // ── Commons ─────────────────────────────────────────────────────────────────
  {
    id: 'apprentice', name: 'The Apprentice', emoji: '🧹', rarity: 'common', cost: 3,
    desc: '4-letter words gain +10 Points.',
    when: 'score',
    effect({ word, addPoints }) { if (word.length === 4) addPoints(10); },
  },
  {
    // Was +3 Mult, which fired on 87% of words and asked nothing in return —
    // a ×4 on an unpainted word, for four Coins, at common weight. Points
    // instead: a median five-letter word is worth 9, so +5 still roughly
    // doubles it, but it no longer outruns the multiplier patrons that make
    // you build for them.
    id: 'scholar', name: 'The Scholar', emoji: '📜', rarity: 'common', cost: 3,
    desc: 'Words of 5+ letters gain +10 Points.',
    when: 'score',
    effect({ word, addPoints }) { if (word.length >= 5) addPoints(10); },
  },
  {
    // The one patron you can hold several of. Each copy arrives loving three
    // letters of its own, rolled when the Market lays the card out (so you can
    // see what you're buying), and wears an edition number for a name. Copies
    // stack: two that love the same letter double it twice — ×4 by design.
    //
    // What repeats is the whole tile, not just its Points: a monogrammed gold
    // letter pays two Coins, a monogrammed jade one lifts the jade multiplier
    // by two. That's the difference between a patron that likes three letters
    // and one that likes three letters *of yours* — it rewards putting the
    // work into the tiles it named. See pass 0 of computeScore.
    id: 'monogrammist', name: 'The Monogrammist', emoji: '🪭', rarity: 'common', cost: 4,
    desc: 'Arrives with three letters of its own; a tile showing one prints twice — Points, trim and paint alike.',
    when: 'meta',       // fires in scoring's pass 2½ via tileEcho
    stackable: true,    // never blocked by an owned copy; every copy is its own seat
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
      if (!data?.letters?.length) return 'Arrives with three letters of its own; a tile showing one prints twice — Points, trim and paint alike.';
      const [a, b, c] = data.letters;
      return `A tile showing ${a}, ${b} or ${c} prints twice — Points, trim and paint alike.`;
    },
  },
  {
    // Twice over, literally: a letter that stands doubled PRINTS twice, the
    // Monogrammist's echo aimed by the word instead of by a name. Points,
    // trim, paint and purple all count a second time, so the pair you keep
    // painting is the pair that pays — a jade OO lifts the jade multiplier
    // twice over, and a gold LL hands over two Coins. The flat +15 it replaces
    // paid the same on BOOK as on a pair you had spent the run building.
    //
    // Reads through tileEcho like every other doubling seat (pass 0 and pass
    // 2½ of computeScore), which is what lets a Monogrammist and a Twin
    // stack on the same tile — ×4, the same ceiling two Monogrammists reach.
    id: 'twins', name: 'The Twins', emoji: '👯', rarity: 'common', cost: 4,
    desc: 'Doubled letters (LL, OO…) print twice — Points, trim and paint alike.',
    when: 'meta',       // fires in scoring's pass 2½ via tileEcho
    tileEcho(tile, _data, tiles) {
      return doubledTileIds(tiles ?? []).has(tile.id);
    },
  },
  {
    id: 'izzard', name: 'The Izzard', emoji: '⚡', rarity: 'common', cost: 4, guild: 'azure',
    // "Izzard" is the old English name for Z, the letter kept in the far
    // corner of the type case because nothing ever needed it.
    desc: 'Any Z you play may be read as an S — and still scores as a Z.',
    when: 'meta',   // consulted at the dictionary check in main.js
  },

  // ── Uncommons ───────────────────────────────────────────────────────────────
  {
    // The counting-house pays by the size of the house: +1 Coin per amber
    // patron on the shelf, himself included, and nothing else. Alone he is a
    // single Coin a page for four — a poor bargain that becomes a good one the
    // moment a second amber seat joins him, which is the whole of what he is
    // for. (The old flat +2 floor is gone: it paid an amber bench nothing for
    // being a bench, and made the first two seats indistinguishable.) Paid in
    // computeReward (js/scoring.js) via guildSeats.
    id: 'banker', name: 'The Banker', emoji: '🏦', rarity: 'uncommon', cost: 4, guild: 'amber',
    desc: 'When a page completes: +1 Coin per amber patron on your shelf — this one included.',
    when: 'meta',
  },
  {
    // Amber first — what he is, mechanically, is a stall at the Market — and
    // azure second, because what he sells is latitude in spelling, which is
    // that guild's whole business. The Cellarer is the other dual livery.
    //
    // The stall is one extra tile slot, stocked with one medieval sort (see
    // MEDIEVAL in constants.js), dressed like any other offered tile but never
    // given a second face: a þ that could flip to a P would be nobody's idea
    // of a thorn. Priced under what it scores, which is the point of him: thorn
    // is worth 10 where the TH it stands for is worth 5.
    //
    // He gives nothing on arrival. A free yogh was tried and cut — the stall is
    // already a standing benefit at every Market, and the yogh is the most
    // useful sort of the four, so a signing gift on top made the page after
    // hiring him the best of the run for no decision at all. What he sells is
    // the whole of what he is.
    id: 'medievalist', name: 'The Medievalist', emoji: '🏰', rarity: 'rare', cost: 8, guild: ['amber', 'azure'],
    desc: 'Opens a stall at the Market selling medieval sorts — þ, ȝ, Æ and Ƿ — cheap, and worth far more than they cost.',
    when: 'meta',   // the stall is stocked in js/market.js; the sorts are read in js/constants.js
  },
  {
    id: 'quartermaster', name: 'The Quartermaster', emoji: '🎒', rarity: 'uncommon', cost: 5, guild: 'crimson',
    desc: 'Begin each page with an extra Discard.',
    when: 'meta',
  },
  {
    // Additive, and small: +2 Mult a tile was a ×3 on any word holding a CH or
    // a TH, which the case is full of, and it multiplied everything the table
    // had already said. A quarter-step apiece joins the other +Mult seats
    // instead — worth setting a ligature for, never worth building a run on,
    // and it still stacks: ING and TH in one word is +0.5.
    id: 'typesetter', name: 'The Typesetter', emoji: '🔠', rarity: 'uncommon', cost: 6,
    desc: 'Each ligature tile — one that spells several letters — gives +0.25 Mult.',
    when: 'score',
    effect({ tiles, addMult }) {
      const n = tiles.filter(t => LIGATURES.includes(t.letter)).length;
      if (n) addMult(n * 0.25);
    },
  },
  {
    // Paid as a share rather than a flat fee, and cheaper for it. A flat +4 was
    // worth the same on a bare J as on a J you had grown and silvered all run —
    // half of what the tile is worth follows the work you put into it, which is
    // the whole difference between a patron you buy and a patron you build for.
    // Growth and silver both count towards the 8, so a tile can be raised into
    // his notice as well as drawn into it.
    id: 'jeweller', name: 'The Jeweller', emoji: '💎', rarity: 'uncommon', cost: 5,
    desc: 'Tiles worth 8+ Points gain half as much again.',
    when: 'score',
    tileBonus: (t) => {
      const worth = restingPoints(t);
      return worth >= 8 ? Math.round(worth * 0.5) : 0;
    },
  },
  {
    id: 'calligrapher', name: 'The Calligrapher', emoji: '✒️', rarity: 'uncommon', cost: 7,
    desc: 'Each painted tile gains +3 Points.',
    when: 'score',
    tileBonus: t => (getActiveColour(t) ? 3 : 0),
  },
  {
    // One half now, and it is the half that was doing the work. She used to
    // double the Coin a gold trim pays AND guarantee a gold tile in every
    // hand, which made a single trim an income and the guarantee a certainty
    // — nothing to build towards. The doubler is gone; what is left is the
    // thieving. Every draw weighs gold twice as heavily as anything else in
    // the bag (magpieWeight in js/state.js), so gold comes up about twice as
    // often without ever being promised, and the more you gild the more she
    // finds.
    id: 'magpie', name: 'The Magpie', emoji: '🐦', rarity: 'uncommon', cost: 7, guild: 'amber',
    desc: 'Gold-trimmed tiles are twice as likely to be drawn from the bag.',
    when: 'meta',   // the draw is weighted in js/state.js
  },
  {
    // Down from common: a multiplier that asks nothing of your collection
    // belongs a shelf higher, beside the Marbler's ×2 for two azure letters.
    id: 'herald', name: 'The Herald', emoji: '📯', rarity: 'uncommon', cost: 6,
    desc: 'Words that start and end with the same letter get ×2 Mult.',
    when: 'score',
    effect({ word, xMult }) {
      if (word.length >= 3 && word[0] === word[word.length - 1]) xMult(2);
    },
  },
  {
    // Palindromes alone were 0.24% of playable words — a rare that never
    // fired. Reading backwards for *another* word (DEVIL/LIVED, DRAWER/
    // REWARD) adds 1.47% more, and reaches words worth setting. Two letters
    // no longer qualify: ON/NO would have been a ×4 for nothing.
    id: 'mirror', name: 'The Mirror', emoji: '🪞', rarity: 'uncommon', cost: 5,
    desc: 'Words that spell another word backwards — or themselves — get ×4 Mult.',
    when: 'score',
    effect({ word, xMult }) {
      if (word.length < 3) return;
      const back = [...word].reverse().join('');
      if (back === word || DICT.has(back)) xMult(4);
    },
  },
  {
    id: 'closer', name: 'The Closer', emoji: '🌒', rarity: 'uncommon', cost: 7,
    desc: 'The final word of each page gets ×3 Mult.',
    when: 'score',
    effect({ state, xMult }) { if (state.wordsLeft === 1) xMult(3); },
  },
  {
    // Was ×5 at rare — the largest multiplier in the game on a condition a
    // ten-tile rack meets whenever it means to, landing on the word that
    // already carries the most Points and the most paint. ×2 is the honest
    // size of it.
    id: 'novelist', name: 'The Novelist', emoji: '🖋️', rarity: 'uncommon', cost: 7,
    desc: 'Words of 7+ letters get ×2 Mult.',
    when: 'score',
    effect({ word, xMult }) { if (word.length >= 7) xMult(2); },
  },

  // ── Rares ───────────────────────────────────────────────────────────────────
  {
    id: 'overseer', name: 'The Overseer', emoji: '📋', rarity: 'rare', cost: 9,
    desc: 'Print one more word each page.',
    when: 'meta',   // read by effectiveWordsPerPage in js/state.js
  },
  {
    id: 'astronomer', name: 'The Astronomer', emoji: '🔭', rarity: 'rare', cost: 9,
    desc: '+1 Mult for each word already printed this page.',
    when: 'score',
    effect({ state, addMult }) { if (state.wordsPrinted > 0) addMult(state.wordsPrinted); },
  },
  {
    id: 'cartographer', name: 'The Cartographer', emoji: '🗺️', rarity: 'rare', cost: 12,
    desc: 'Words whose letters run in alphabetical order get ×3 Mult.',
    when: 'score',
    effect({ word, xMult }) {
      if (word.length < 4) return;
      for (let i = 0; i < word.length - 1; i++) if (word[i] > word[i + 1]) return;
      xMult(3);
    },
  },

  // ══ The Colour Guilds ═══════════════════════════════════════════════════════
  // Paint is the heart of the score — Mult is the product of the colour
  // multipliers — so each colour keeps a guild that makes committing to it an
  // archetype of its own. See docs/PATRON_OVERHAUL.md.

  // ── Amber · the counting-house ──────────────────────────────────────────────
  {
    id: 'goldsmith', name: 'The Goldsmith', emoji: '🪙', rarity: 'common', cost: 4, guild: 'amber',
    desc: 'Amber tiles gain +4 Points.',
    when: 'score',
    tileBonus: t => (countsAsColour(t, 'amber') ? 4 : 0),
  },
  dyePatron('weld', 'The Weld', '🌼', 'amber'),
  {
    // Was uncommon · 6, paying per amber tile up to 2 a word — a scaling
    // engine you built toward. Retuned per-word and priced at the floor: 1
    // Coin whenever amber shows up at all. The ceiling halved (5 a page,
    // down from 10), so the price fell further — this is amber's on-ramp
    // now, the guild's cheapest handshake, not its payoff.
    id: 'assayer', name: 'The Assayer', emoji: '⚖️', rarity: 'common', cost: 3, guild: 'amber',
    desc: 'Words with an amber tile pay 1 Coin.',
    when: 'score',
    effect({ tiles, addCoins }) {
      if (painted(tiles, 'amber').length) addCoins(1);
    },
  },
  {
    id: 'chapman', name: 'The Chapman', emoji: '🛒', rarity: 'uncommon', cost: 7, guild: 'amber',
    desc: 'One tile at the Market is always amber, and amber tiles cost nothing.',
    when: 'meta',   // the guarantee is in rollOffers, the price in offerPrice — js/market.js
  },
  {
    id: 'bursar', name: 'The Bursar', emoji: '💰', rarity: 'uncommon', cost: 7, guild: 'amber',
    desc: 'Words with an amber tile gain +1 Mult for every 5 Coins you hold (max +5).',
    when: 'score',
    effect({ tiles, state, addMult }) {
      if (!painted(tiles, 'amber').length) return;
      const n = Math.min(5, Math.floor(state.coins / 5));
      if (n) addMult(n);
    },
  },
  {
    // Amber income with no paint ante: the fee follows the letters themselves.
    // Fires once per word however many rarities it holds — the reward for a
    // second Z is the second Z's own 10 Points. The Izzard turns this into an
    // engine (a Z read as S is still a Z tile), which is deliberate: two cheap
    // curios that are each mild alone and a livelihood together.
    id: 'antiquary', name: 'The Antiquary', emoji: '🏺', rarity: 'uncommon', cost: 6, guild: 'amber',
    desc: 'Words containing a J, QU, X or Z tile pay 2 Coins.',
    when: 'score',
    effect({ tiles, addCoins }) {
      if (tiles.some(t => RARE_LETTERS.includes(getActiveLetter(t)))) addCoins(2);
    },
  },
  {
    // Amber's agent at the fair: the amber you didn't spend at the press, he
    // spends on your behalf at the stalls. Fires from the onPageComplete
    // hook; the banked rolls live in state.freeRerolls, are spent by the
    // re-roll button before any coin is (see rerollMarket in market.js), and
    // expire when that Market closes — an agent works the fair he was sent
    // to, not the next one. A rainbow tile in hand counts as amber, as ever.
    id: 'factor', name: 'The Factor', emoji: '🤝', rarity: 'uncommon', cost: 5, guild: 'amber',
    desc: 'Amber tiles still in your hand when a page completes earn a free Market re-roll each, up to 2.',
    when: 'meta',
    onPageComplete({ state }) {
      const n = Math.min(2, state.rack.filter(t => countsAsColour(t, 'amber')).length);
      if (!n) return null;
      state.freeRerolls = (state.freeRerolls ?? 0) + n;
      return { note: `${n} free re-roll${n > 1 ? 's' : ''} banked` };
    },
  },
  {
    // The counting-house's man of letters — the amber ones, after his name.
    // The first patron used from his card mid-page rather than at a sheet
    // (the Neologist's act opens an overlay; his just hands you the thing):
    // tap his card, take the loan. The tile is cast through castLentTile
    // wearing gold trim from birth — the one way a lent tile can wear metal,
    // since nothing can be written to it later — so printing it pays a Coin
    // (two under the Magpie), which is what makes him amber rather than a
    // curiosity. OLOGY is five letters on one double-wide tile: any word it
    // lands in is six letters or more, which is the Novelist's and the
    // Scholar's kind of word, and the dictionary holds 75 ways to use it
    // (APOLOGY, BIOLOGY, THEOLOGY…). Once a page; the flag re-arms as the
    // next page is dealt.
    id: 'scientist', name: 'The Scientist', emoji: '🔬', rarity: 'uncommon', cost: 6, guild: 'amber',
    desc: 'Once a page, ask him for an OLOGY tile — gold-trimmed, riding above your hand, gone when the page ends.',
    when: 'meta',   // used from his card — the act button in render.js, the loan in main.js
    onPageStart({ data }) { data.used = false; return null; },
  },

  // ── Jade · growth and permanence ────────────────────────────────────────────
  {
    // Was +10 Points for a three-letter word — a bonus that came and went with
    // the word. It grows the word instead now, the Espalier's trade one tile
    // wider: the smallest words the press can set are where jade does its
    // compounding, and CAT, RUN and ICE are printable from almost any rack.
    // Like the Espalier, the growth arrives IN TIME TO SCORE — the tileBonus
    // pays the step on the trigger word itself and onPrinted writes it in for
    // good — so a three-letter word is never worth less than it was, and the
    // tiles it leaves behind are worth more. An immutable tile (a ghost, a
    // fleuron) refuses the trellis and pays nothing for it either way.
    id: 'abecedarian', name: 'The Abecedarian', emoji: '🐣', rarity: 'common', cost: 5, guild: 'jade',
    desc: `Print a 3-letter word: every tile in it permanently gains +${ABECEDARIAN_STEP} Point — in time to score.`,
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
    // Jade by way of the bath house: what comes off is nothing, what goes on
    // is permanent. The word has to be wholly bare — no paint, no trim, no
    // nick on any tile — which is a bar that rises as the run dresses your
    // collection, so the seat pays best early and quietly retires itself.
    // Two rolls per bare tile now, independent of each other: a trim at
    // NUDIST_TRIM_CHANCE and a colour at half that. A tile can catch both.
    id: 'nudist', name: 'The Nudist', emoji: '🧖', rarity: 'common', cost: 4, guild: 'jade',
    desc: `In a word where no tile has paint, a trim or a nick, each tile has a 1-in-${Math.round(1 / NUDIST_TRIM_CHANCE)} chance of gaining a random trim and a 1-in-${Math.round(1 / NUDIST_PAINT_CHANCE)} chance of a random colour.`,
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
        // The two rolls are independent, so a tile can leave the bath house
        // trimmed and painted both.
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
    id: 'seedsman', name: 'The Seedsman', emoji: '🌱', rarity: 'common', cost: 4, guild: 'jade',
    desc: 'Jade tiles gain +1 Point per chapter reached — +5 Points each in Chapter V.',
    when: 'score',
    tileBonus: (t, { state }) => (countsAsColour(t, 'jade') ? state.chapter : 0),
  },
  dyePatron('verdigris', 'The Verdigris', '🍏', 'jade'),
  {
    // Dual livery, crimson first: destruction is his diet and jade is what
    // he makes of it — the guilds' whole relationship in one seat, and the
    // reason every crimson burn quietly pleases a jade build. His allowance
    // now scales with the gardeners: one tile per jade patron on the shelf
    // (himself included, so alone he takes the classic one), computed in
    // compostLeft in js/market.js via guildSeats.
    id: 'composter', name: 'The Composter', emoji: '🍂', rarity: 'uncommon', cost: 7, guild: ['crimson', 'jade'],
    desc: 'Destroyed tiles rot into jade ones — at each Market, take one from the heap per jade patron you keep.',
    when: 'meta',   // counted in trashFromCollection, rotted and taken in js/market.js
  },
  {
    // Jade's answer to a bad hand: the tiles you throw away come back stained.
    // What it paints over is its own business — a dipped tile takes the new
    // colour whatever it wore before, which is how a careful amber build can
    // find itself speckled. Discarded tiles are still yours, sitting in the
    // discard pile, so the paint is waiting when the bag comes round again.
    id: 'dipper', name: 'The Dipper', emoji: '🪣', rarity: 'common', cost: 4, guild: 'jade',
    desc: `Each tile you discard has a 1-in-${Math.round(1 / DIPPER_PAINT_CHANCE)} chance of being painted a random colour.`,
    when: 'meta',
    // `painted` is what lets the board show the dip: main.js colours those
    // tiles where they stand and holds a beat before they fly to the pile.
    // Without it the paint would be applied to a tile already on its way out
    // and the player would never see the thing they were paid.
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
    // Jade in miniature: the smallest word the press can set, grown for keeps.
    // The trigger is at-will — the dictionary holds sixty two-letter words,
    // and a ligature makes two-tile THE, SING or RATS — so the real price is
    // the word slot: a two-tile word scores next to nothing and spends one of
    // the page's five words to say it. Like the Illuminator, the growth
    // arrives IN TIME TO SCORE: the score effect pays the step per growable
    // tile on the trigger word itself, and onPrinted writes it in for good
    // (through growTile, so the corner number turns jade and the gain follows
    // the tile through bag, save and reshuffle). A ghost refuses the trellis,
    // as it refuses everything — it pays nothing at score time either; the
    // other tile of the pair still takes its due.
    id: 'espalier', name: 'The Espalier', emoji: '🪴', rarity: 'uncommon', cost: 6, guild: 'jade',
    desc: `Print a two-tile word: both tiles permanently gain +${ESPALIER_STEP} Points — in time to score.`,
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
    // Jade's answer to the wet brush: paint begets paint. Fires on every
    // road to permanent paint — tube, Painter, dye, Dipper, Arsonist,
    // Illuminator and Bloodletter alike — because they all go through
    // paintTile (state.js), where the splash lives; the splashed tile is a
    // random unpainted one from the whole collection, same colour. One
    // splash per brushstroke: an echo never echoes. DABBLER_ODDS in
    // constants.js, ridden through luckyRoll.
    id: 'dabbler', name: 'The Dabbler', emoji: '🖍️', rarity: 'uncommon', cost: 6, guild: 'jade',
    desc: 'Whenever a tile is painted, a second unpainted tile has a 1-in-2 chance of taking the same colour.',
    when: 'meta',
  },
  {
    // The first dual-livery patron: jade in mechanic (he matures), amber in
    // what maturity is worth (coin at the end). `guild` is an array here —
    // the Alderman counts both liveries, and the card wears the first as
    // its ribbon while naming them both. He ages via onPageComplete, at
    // most once a page, and the age pays twice: a LAUREL — +HONORIFIC_STEP
    // Points on every word, paid at this seat's own turn in the running
    // order — and +1 Coin on his dismissal (his refundBonus, read by
    // patronRefund in market.js). Held jade is the price; the guild's other
    // patrons all want jade *played*. Rainbow counts.
    //
    // The laurel is the whole of the rework. A flat +1 a page was paid after
    // nothing and multiplied by nothing you could arrange; a crown is paid
    // where the seat sits, so a Cellarer dragged in front of your multipliers
    // is worth more than one behind them — and, like every laurel, it leaves
    // with him if he is ever dismissed. Nothing in scoring knows about this:
    // laurels are paid seat by seat in pass 4 for whoever wears them.
    id: 'cellarer', name: 'The Cellarer', emoji: '🧀', rarity: 'uncommon', cost: 6, guild: ['jade', 'amber'],
    desc: 'Ages when a page ends with a jade tile in hand: a laurel each time, and +1 Coin when dismissed.',
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
    // Jade's answer to The Banker, and built the same way: he is paid by the
    // size of the garden rather than by anything you print, +0.5 Mult for
    // every jade seat including his own. Alone that is a modest +0.5 and a
    // poor bargain; the moment a second gardener joins him it is a real
    // number, and a committed jade bench carries him past +2.5. Counted
    // through guildSeats, so a dual-livery seat (the Cellarer, the Composter)
    // counts as the jade patron it half is, and a jade patron The Ripper
    // killed keeps counting from among the ghosts — the trees are still
    // standing whether or not anyone is tending them.
    //
    // Additive, deliberately. Jade already compounds through permanence, and a
    // ×Mult that grew with the bench would make the guild's own seats worth
    // buying for this one seat's sake rather than for what they do.
    id: 'orchardist', name: 'The Orchardist', emoji: '🌳', rarity: 'uncommon', cost: 6, guild: 'jade',
    desc: 'Every word gains +0.5 Mult per jade patron you keep — this one included.',
    when: 'score',
    effect({ addMult }) {
      const trees = guildSeats('jade');
      if (trees) addMult(trees * 0.5);
    },
  },
  {
    id: 'grafter', name: 'The Grafter', emoji: '🌿', rarity: 'rare', cost: 8, guild: 'jade',
    desc: 'When a word with a jade tile prints, every tile in it permanently gains +1 Point.',
    when: 'meta',
    onPrinted({ tiles, grow }) {
      if (!painted(tiles, 'jade').length) return null;
      for (const t of tiles) grow(t, GRAFTER_STEP);
      return { note: `+${GRAFTER_STEP} grown into ${tiles.length} tile${tiles.length > 1 ? 's' : ''}` };
    },
  },
  {
    // The laurel was a tool's gift before it was a patron's trade: the sundry
    // of that name (js/constants.js) crowns a RANDOM seated patron, and a crown
    // is +HONORIFIC_STEP Points on every word thereafter, paid at that seat's
    // own turn in the running order. He crowns one head only — his own — and
    // does it for every jade tile that prints, so what looks like a lottery on
    // the tool is a decision here: how much jade you paint says how fast the
    // laurels come, and where you drag him says what each one is worth, since
    // a crown in front of your multipliers is multiplied by them.
    //
    // Nothing in scoring knows about him. Laurels are already paid seat by seat
    // for whoever wears them (pass 4), so this hook has only to put them on his
    // head; the badge on his card and the Points in the readout follow by
    // themselves. Jade is counted the patrons' way, so a rainbow tile crowns
    // him as a painted one does — and, as with any laurel, dismissing him
    // takes every crown he ever gathered with him.
    id: 'laureate', name: 'The Laureate', emoji: '👑', rarity: 'uncommon', cost: 8, guild: 'jade',
    desc: `Every jade tile you print crowns this patron with a laurel — +${HONORIFIC_STEP} Points on every word, for good.`,
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
    id: 'firebrand', name: 'The Firebrand', emoji: '❤️‍🔥', rarity: 'common', cost: 4, guild: 'crimson',
    desc: 'Words with 2 or more crimson tiles gain +15 Points.',
    when: 'score',
    effect({ tiles, addPoints }) {
      if (painted(tiles, 'crimson').length >= 2) addPoints(15);
    },
  },
  dyePatron('madder', 'The Madder', '🌺', 'crimson'),
  {
    id: 'arsonist', name: 'The Arsonist', emoji: '🧨', rarity: 'uncommon', cost: 7, guild: 'crimson',
    desc: 'Every tile you print has a 1-in-10 chance of being painted crimson, and a 1-in-100 chance of being destroyed.',
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
    // Crimson's one-off drama, reduced to a coin. The toss is held in
    // state.gambleWon rather than rolled here, because this effect runs on
    // every keystroke to draw the live preview — rolling inside it would
    // flicker as you compose and then disagree with what printed. The coin
    // therefore lands *before* you set the word, and the shelf shows it: a
    // lit Gambler is an invitation to spend your best tiles now.
    id: 'gambler', name: 'The Gambler', emoji: '🎲', rarity: 'common', cost: 4, guild: 'crimson',
    desc: 'Each word has a 1-in-2 chance of ×2 Mult — the coin is tossed before you set it.',
    when: 'score',
    effect({ state, xMult }) { if (state.gambleWon) xMult(2); },
  },
  {
    // Crimson's surgery at the discard pile. Was a coin toss over a lone
    // tile; now a clean cut over a pair — throw him exactly two and one goes
    // to the furnace while the other is bled crimson, both outcomes certain.
    // Which tile takes which fate is his choice, not yours: the ante is
    // surrendering the pair. Both halves are crimson's currency — paint is
    // the guild's fuel, and a destroyed tile thins the bag, feeds the
    // Composter, and dodges nothing. No roll, so no luckyRoll: the luck dial
    // has nothing to tilt.
    //
    // He wants the same pair the Typefounder does. Discard hooks fire in
    // seat order (see runDiscardHooks in main.js) and a consumed tile is out
    // of every later hook's reach, so with both seated, whoever sits nearer
    // the head of the shelf takes the pair — except that the crucible only
    // accepts two plain single letters, so a pair it refuses falls through
    // to whoever sits after it.
    id: 'bloodletter', name: 'The Bloodletter', emoji: '💈', rarity: 'common', cost: 4, guild: 'crimson',
    desc: 'Discard exactly two tiles: one is destroyed, the other painted crimson.',
    when: 'meta',
    onDiscard({ tiles, paint, trash }) {
      if (tiles.length !== 2) return null;
      const [drained, bled] = Math.random() < 0.5 ? [tiles[0], tiles[1]] : [tiles[1], tiles[0]];
      // Each half stands on its own: a ghost refuses the paint but its
      // partner still drains, and the Smelter's floor can spare the drained
      // tile while its partner still bleeds.
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
    // Crimson's tax on the easiest word in English. A plural is the cheapest
    // ×2 in the game — half the rack can be made to end in S — so the price is
    // the S itself: the tile is swallowed the moment the word prints, gone
    // from the collection for good, and the bag holds fewer of them every time
    // you take the deal. That is the guild's whole bargain in one seat, and it
    // feeds the rest of it: a destroyed tile thins the bag and rots down for
    // the Composter.
    //
    // The multiplier pays for the word as READ (so a mark on the end is no
    // shelter — DOGS! is still a plural), but only a LOOSE S is eaten: an S
    // inside a ligature keeps its tile, since swallowing an ING to reach one
    // letter would cost more than the ×2 is worth. The swallowing goes through
    // the same burn every other destruction does, so the Smelter's floor and a
    // lent tile that was never in the collection both refuse it — and the word
    // keeps its ×2 either way, since the multiplier was paid before the meal.
    id: 'serpent', name: 'The Serpent', emoji: '🐍', rarity: 'uncommon', cost: 7, guild: 'crimson',
    desc: 'Words ending in S get ×2 Mult — and the S is swallowed.',
    when: 'score',
    effect({ word, xMult }) { if (word.length > 1 && word.endsWith('S')) xMult(2); },
    onPrinted({ tiles, burn }) {
      if (!wordLetters(tiles).endsWith('S')) return null;
      // The last tile that is an S and nothing else — marks trailing it are
      // skipped, a ligature ending in S is left alone.
      const last = [...tiles].reverse().find(t => !isMark(getActiveLetter(t)));
      if (!last || getActiveLetter(last) !== 'S' || !burn(last)) return null;
      return { note: 'the S swallowed', burned: [last] };
    },
  },
  {
    // The only patron who kills another, and the only door to a ghost. Print
    // one of his watchwords and one of your OTHER patrons dies where it sits:
    // it leaves the shelf for state.ghosts, keeps every part of its effect —
    // its turn in the running order, its hooks, its laurels — and gives up
    // only its seat. Then he flees, back into the Market's pool, which is what
    // stops the trick being repeatable at will: each ghost costs a whole rare
    // hire, and the hire has to call again.
    //
    // A freed seat is the entire payment, and it is a large one late in a run
    // when the table is full and the shop is still laying out cards you want.
    // The cost is control: WHICH patron dies is not yours to choose, so a
    // shelf you have carefully ordered is a shelf you are gambling with — the
    // ghosts speak after every living seat, so a killed ×Mult that was sitting
    // late in the order keeps its place, while a killed +Points seat that was
    // sitting early loses everything the position was worth.
    //
    // The deed itself is in js/main.js (ripperStrikes), where the word commits:
    // a hook can't remove its own seat from the loop that is running it, and
    // the kill wants animating besides.
    id: 'ripper', name: 'The Ripper', emoji: '🔪', rarity: 'rare', cost: 9, guild: 'crimson',
    desc: `Print ${RIPPER_WORDS.slice(0, -1).join(', ')} or ${RIPPER_WORDS.at(-1)} and one of your other patrons becomes a ghost — it works on, off the shelf, freeing its seat — then this patron flees.`,
    when: 'meta',   // the deed is done in js/main.js as the word commits
  },
  {
    // A corpse that walks back out of the hellbox, where broken type goes to
    // be melted down. It is the one patron already on the other side of the
    // table — which is what makes it the only thing in the game The Ripper's
    // knife cannot touch (see ripperStrikes in js/main.js).
    //
    // Every road to permanent destruction runs through trashFromCollection
    // (js/state.js), and the rite is performed from inside it — the Stoker's
    // fire, the Arsonist's accidents, the Bloodletter's basin, the Serpent's
    // meal, the tongs, the crucible, the Smelter's furnace — the same
    // arrangement that lets The Dabbler hear every brushstroke from inside
    // paintTile. So it needs no hook of its own and can never miss a death.
    //
    // What comes back is the WHOLE tile — paint, trim, nick, grown Points,
    // both faces — struck again in ghost metal, and so costing no room in the
    // hand ever after. Only the metal is overwritten. That is deliberately
    // generous: the tiles worth raising are the ones you least want to feed to
    // the fire, and a bare letter back would never be worth the wager. What it
    // came back as is what it stays; ghost metal takes no further work.
    //
    // Nothing caps how many it raises. A press that has fed thirty tiles to
    // the fire has earned its thirty-tile hand and whatever happens next.
    id: 'revenant', name: 'The Revenant', emoji: '💀', rarity: 'rare', cost: 8, guild: 'crimson',
    desc: `Every tile destroyed has a 1-in-${Math.round(1 / REVENANT_ODDS)} chance of walking back out of the hellbox in ${MATERIALS.ghost.metal.toLowerCase()} — everything it wore intact, and no room in your hand.`,
    when: 'meta',   // the rite is performed inside trashFromCollection (js/state.js)
  },
  {
    // The Bloodletter's rival for the same pair — see his note on seat order.
    // The melt is strictly two-for-one — the collection shrinks, the
    // Composter is fed — and what comes out is a Punchcutter cut you chose
    // both faces of, wearing the survivors' finery. The merge rules (left
    // tile's finery wins a tie, grown points pour together, only plain
    // single letters will pour) live in mergeTiles in state.js, and
    // deliberately not in the desc.
    id: 'typefounder', name: 'The Typefounder', emoji: '⚗️', rarity: 'rare', cost: 10, guild: 'crimson',
    desc: 'Discard exactly two tiles: they are recast as one tile with a letter on either face.',
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
    // Crimson's engine for a resource no other patron spends: the shelf
    // itself. Every dismissal — a dye that has done its work, a common
    // outgrown, a seat cleared for something better — leaves a permanent
    // ×0.2 behind. The count is advanced in sellPatron (js/market.js), never
    // here: scoring runs on every keystroke, and `data` is read-only in it.
    // A dismissed Headsman collects nothing on himself — he has already left
    // the shelf by the time the axe is counted.
    id: 'headsman', name: 'The Headsman', emoji: '🪓', rarity: 'uncommon', cost: 7, guild: 'crimson',
    desc: `Each patron you dismiss permanently raises this patron's Mult by ${HEADSMAN_STEP}.`,
    when: 'score',
    effect({ data, xMult }) {
      const heads = data?.heads ?? 0;
      if (heads) xMult(Math.round((1 + heads * HEADSMAN_STEP) * 100) / 100);
    },
  },
  {
    // Not for sale, and not in the shop's pool (`unlisted`): the only way to a
    // cat is to set the word CAT, whereupon one arrives and takes the first
    // seat at the table (see main.js). Free, so dismissing it pays nothing —
    // which is the right price for a stray.
    //
    // RAT is 1.6% of the dictionary, so the laurel is a genuine catch rather
    // than an income: aim for it and you might land one every few pages. With
    // the Rat Catcher seated it is faster, since his RAT tile arrives every
    // page and the letters R-A-T come with it — which is exactly the pair this
    // patron exists to complete. The tile itself is eaten, permanently, so his
    // gift becomes her dinner.
    id: 'shorthair', name: 'The Domestic Shorthair', emoji: '🐈', rarity: 'rare', cost: 0,
    guild: 'amber', unlisted: true,
    desc: `Print any word spelling out R-A-T — PIRATE and GRATIS count — for 1 Coin and a laurel. `
        + `Only the Rat Catcher's own RAT tile is ever eaten.`,
    when: 'score',
    effect({ word, addCoins }) { if (word.includes('RAT')) addCoins(1); },
    onPrinted({ tiles, script, data, burn }) {
      const notes = [], said = [];
      if ((script?.letters ?? '').includes('RAT')) {
        data.honorifics = (data.honorifics ?? 0) + 1;
        notes.push(`a rat! +${data.honorifics * HONORIFIC_STEP} Points every word`);
      }
      // The Rat Catcher's own tile, eaten where it sits — and ONLY that tile.
      // The letters R, A and T standing separately in the word are a rat to
      // smell, not a rat to eat: they are ordinary sorts you paid for, and
      // nothing about spelling PIRATE should cost you the P-I-R-A-T-E. The
      // ligature is the only RAT there is (EXCLUSIVE_LETTERS), so testing the
      // active letter is the same test as "the Rat Catcher's gift".
      const eaten = tiles.filter(t => getActiveLetter(t) === 'RAT' && burn(t));
      // Dinner is announced at the foot of the board rather than over the cat's
      // head: a tile leaving your collection for good is news about the press,
      // and the status bar is where the press says things.
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
    id: 'ratcatcher', name: 'The Rat Catcher', emoji: '🐀', rarity: 'uncommon', cost: 2, guild: 'crimson',
    desc: 'Every page begins with a RAT tile in hand, painted a random colour. It is yours for good.',
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
    // The furnace is lit the moment he sits: ×STOKER_BASE on every word before
    // a single tile has gone into it, rising by STOKER_STEP for each one that
    // does. The base is what makes the first crimson burn a gain rather than a
    // toll — he used to pay nothing at all until he had eaten something, which
    // asked a rare seat to be dead weight on the page you bought it.
    id: 'stoker', name: 'The Stoker', emoji: '🔥', rarity: 'rare', cost: 11, guild: 'crimson',
    desc: `×${STOKER_BASE} Mult, and crimson tiles are destroyed when printed — each one raises that Mult by ${STOKER_STEP}, for good.`,
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

  // ── Azure · ink, flow, and latitude ─────────────────────────────────────────
  {
    id: 'siren', name: 'The Siren', emoji: '🎶', rarity: 'common', cost: 4, guild: 'azure',
    desc: 'Vowels gain +2 Points — or +6 if they are azure.',
    when: 'score',
    tileBonus(t) {
      const L = getActiveLetter(t);
      if (L.length !== 1 || !VOWELS.includes(L)) return 0;
      // countsAsColour, not getActiveColour: a rainbow vowel sings for +6,
      // as the rainbow card's "every colour to your patrons" promises.
      return countsAsColour(t, 'azure') ? 6 : 2;
    },
  },
  dyePatron('woad', 'The Woad', '🪻', 'azure'),
  {
    id: 'marbler', name: 'The Marbler', emoji: '🌀', rarity: 'uncommon', cost: 7, guild: 'azure',
    desc: 'Words with 2 or more azure tiles get ×2 Mult.',
    when: 'score',
    effect({ tiles, xMult }) {
      if (painted(tiles, 'azure').length >= 2) xMult(2);
    },
  },
  {
    id: 'fountain', name: 'The Fountain', emoji: '⛲', rarity: 'uncommon', cost: 7, guild: 'azure',
    desc: 'Azure tiles return to the bag when printed, instead of the discard pile.',
    when: 'meta',   // read by retirePrinted, and by scoring's `returns` flag
  },
  {
    id: 'titivillus', name: 'Titivillus', emoji: '😈', rarity: 'rare', cost: 9, guild: 'azure',
    desc: 'Words with an azure tile are accepted with one vowel wrong: swapped, changed, missing or extra.',
    when: 'meta',   // consulted at the dictionary check in main.js — the typo prints as typed
  },
  {
    id: 'neologist', name: 'The Neologist', emoji: '📖', rarity: 'rare', cost: 10, guild: 'azure',
    desc: 'Add one six-letter word of your choosing to the dictionary permanently, then this patron leaves.',
    when: 'meta',   // the coining sheet lives in sheets.js; the word outlives the run
  },

  // ── Wildcards · the glue between guilds ─────────────────────────────────────
  {
    id: 'skald', name: 'The Skald', emoji: '🎵', rarity: 'uncommon', cost: 6,
    desc: 'Words starting with the same letter as your last word get ×2 Mult.',
    when: 'score',
    effect({ word, state, xMult }) {
      if (word && state.lastFirstLetter && word[0] === state.lastFirstLetter) xMult(2);
    },
  },
  {
    // The Skald's stricter cousin: he reads the manuscript, not the last
    // line. The condition is dead on page one by definition and never fires
    // by accident twice — a repeat has to be steered, tiles herded back into
    // a word the press has set before, which The Fountain turns into a plan. Marks are stripped from both sides of the comparison,
    // so HELLO! reprints HELLO.
    id: 'copyist', name: 'The Copyist', emoji: '📑', rarity: 'common', cost: 4,
    desc: '×2 Mult when the word already stands in your manuscript.',
    when: 'score',
    effect({ word, state, xMult }) {
      if (!word || !state.manuscript?.length) return;
      if (state.manuscript.some(r => (splitMarks(r.word)?.letters ?? r.word) === word)) xMult(2);
    },
  },
  {
    id: 'beekeeper', name: 'The Beekeeper', emoji: '🐝', rarity: 'uncommon', cost: 6, guild: 'jade',
    desc: `Every B you print permanently raises this patron's Mult by ${BEEKEEPER_STEP}.`,
    when: 'score',
    // Like The Stoker: the count grows as the word commits, so the bees you
    // just caught pay from the next word on.
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
    // The second lexicon patron with a door of its own: like the
    // Stenographer's acronyms, names are vouched through the dictionary
    // check in main.js — legitimate in their own right, not misspellings.
    // Unlike his, this list also pays: +10 Points whenever the word is on
    // it, dictionary word or not, because GRACE and ROSE are no less names
    // for being words already. The list (wordlists-themed/names.txt) merges
    // the US Social Security and ONS England & Wales charts — 5,000 names
    // that each held a top-1,000 spot for three years or more; rebuild it
    // with tools/build-names-list.mjs.
    id: 'expectants', name: 'The Expectant Parents', emoji: '🤰', rarity: 'uncommon', cost: 6,
    desc: 'Common baby names count as words, and any name gains +10 Points — SOPHIE, ARCHIE, BARNABY.',
    when: 'score',
    effect({ word, addPoints }) {
      if (themeSize('names') && inTheme('names', word)) addPoints(10);
    },
  },
  {
    // "In time to score" is now literal. The brush is a `tilePaint` hook, which
    // scoring runs before it counts anything (pass ½), so the fourth colour is
    // on the tile for every reader that follows: it lifts that colour's own
    // multiplier — the ×2 this patron used to hand over by hand, and more with
    // a Monogrammist echoing the tile — the Calligrapher pays for a painted
    // tile, and The Harlequin's full motley is met by it. That last is the
    // point of the rework: three colours and a bare tile now buy the fourth
    // colour AND the Harlequin, from one word.
    //
    // He reads colour the patrons' way (countsAsColour), which costs him
    // rainbow words: a rainbow is all four colours at once, so a word holding
    // one is never at exactly three.
    //
    // onPrinted lays the same paint permanently — read off the script rather
    // than worked out again, so whatever an earlier seat did to the word in
    // the meantime, the tile the player watched take the colour is the tile
    // that keeps it.
    id: 'illuminator', name: 'The Illuminator', emoji: '🎨', rarity: 'rare', cost: 8,
    desc: 'When a word holds exactly three colours, its first bare tile is painted the fourth — before the word is counted.',
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
    // Now the only patron that pays on a page's first word — the Archivist,
    // whose flat ×2 it could never catch, has been cut.
    //
    // His multiplier used to GROW, +0.1 for good every time the first word
    // cleared a page alone, and in the hand that compounded far too well: taken
    // early he could be carrying a ×2.5 opener by the middle of a run, on top
    // of the spare-word Coins the same feat already pays. The multiplier is
    // flat now and the achievement pays a LAUREL instead — +HONORIFIC_STEP
    // Points on every word, at this seat's turn. Points rather than Mult is the
    // whole of the fix: it rewards the same rare feat without compounding into
    // the multiplier that caused it.
    //
    // It does leave one seat wanting two things of the running order — the
    // ×1.5 is worth more late, the laurels are worth more early — which is a
    // real decision to make rather than a muddle to fix.
    id: 'frontispiece', name: 'The Frontispiece', emoji: '🖼️', rarity: 'uncommon', cost: 7, guild: 'jade',
    desc: `The first word of each page gets ×${FRONTISPIECE.base} Mult — and a laurel each time that word clears the quota alone.`,
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
    // have never met.
    //
    // ×1.5 rather than the ×2 its neighbours pay, because the condition is
    // met far more often than theirs: a dictionary of 64,000 words is mostly
    // obscure, so a solver clears this bar four times in five. A player does
    // not — the words that come to mind are the common ones — which is exactly
    // the nudge this patron is for, and why it is worth playing rather than
    // simulating. (A stated 1,500-word band was tried here and reverted: as a
    // number it read tighter but played looser, since "off the list entirely"
    // is the harder ask.) If it proves too easy in the hand, lower the
    // multiplier before narrowing the list: the list is shared with two editors.
    id: 'lexicographer', name: 'The Lexicographer', emoji: '📚', rarity: 'uncommon', cost: 6, guild: 'azure',
    desc: '×1.5 Mult when the word is not among the commonest in English — reach for the word nobody else would.',
    when: 'score',
    effect({ word, xMult }) {
      if (themeSize('common') && word && !inTheme('common', word)) xMult(1.5);
    },
  },
  {
    id: 'stenographer', name: 'The Stenographer', emoji: '📟', rarity: 'uncommon', cost: 6, guild: 'azure',
    desc: 'Common acronyms and abbreviations count as words: LOL, BRB, WTF and the rest.',
    when: 'meta',   // consulted at the dictionary check in main.js; the list lives in wordlists-themed/acronyms.txt
  },
  {
    // Not a misspelling like the four excuses below — nothing has gone wrong
    // here. It licenses a construction: the compound noun, which English makes
    // freely and dictionaries only ever catch up with.
    id: 'binder', name: 'The Binder', emoji: '🔗', rarity: 'rare', cost: 12, guild: 'azure',
    desc: 'Any two nouns stacked together count as a word: DOOM and HAT make DOOMHAT.',
    when: 'meta',   // consulted at the dictionary check in main.js; the list lives in wordlists-themed/nouns.txt
  },
  {
    // ×2 per pair was a doubling on 22% of the dictionary and a ×4 on the 1.2%
    // that hold two — the sort of number that decides a run on its own. It pays
    // +0.5 a pair now: the same ×1.5 on the word you actually set most of the
    // time, but ADDITIVE, so it joins the other +Mult seats rather than
    // multiplying whatever they built. Three pairs exists (BOOKKEEPER, and 28
    // more) and stacks the same way, which is the whole charm of the thing.
    // Down from rare · 10 with it: +0.5 on ~14% of common words no longer earns
    // the top shelf's price.
    id: 'stammerer', name: 'The Stammerer', emoji: '🦜', rarity: 'uncommon', cost: 8,
    desc: 'Every doubled letter gives +0.5 Mult — BALLOON pays twice, BOOKKEEPER three times.',
    when: 'score',
    effect({ word, addMult }) {
      const n = doubledPairs(word) + licencedPairs(word);
      if (n) addMult(0.5 * n);
    },
  },
  {
    // Gloves come in pairs, and only in pairs: a colour worn by exactly two
    // tiles is a match and pays; a third of the same colour spoils the set
    // and pays nothing, which is the whole discipline of the seat — more
    // paint is not better paint, PLACED paint is. Each colour is judged on
    // its own, so two crimson and two jade are two pairs (+0.4) while one of
    // each is a drawer of odd gloves. Additive Mult, so he queues with the
    // Typesetter and the Stammerer rather than multiplying the table.
    //
    // Colour is read the patrons' way (painted → countsAsColour), so a
    // rainbow tile joins every colour's count at once — one rainbow beside
    // one painted tile completes that colour's pair, and beside a painted
    // PAIR it makes three and spoils it. The one patron for whom rainbow
    // metal cuts both ways.
    id: 'glover', name: 'The Glover', emoji: '🧤', rarity: 'uncommon', cost: 4,
    desc: 'Each colour worn by exactly two tiles in the word gives +0.2 Mult — a matched pair, no more, no fewer.',
    when: 'score',
    effect({ tiles, addMult }) {
      const pairs = Object.keys(COLOURS).filter(c => painted(tiles, c).length === 2).length;
      if (pairs) addMult(Math.round(pairs * 0.2 * 100) / 100);
    },
  },
  {
    // Rags were the raw stuff of paper long before wood pulp was, and the
    // rag-picker sorted his sack BY COLOUR before he sold it to the mill.
    // That is the whole seat: throw him a painted tile and he pays you in the
    // currency of that tile's own guild — the tongs for crimson, a Coin for
    // amber, a wider hand for jade, your discard back for azure. He wears no
    // livery himself; a man who deals in all four colours belongs to none of
    // them.
    //
    // Nothing is destroyed. The rags file into the pile like any discard and
    // come round again with the next page's bag, so what you actually pay is
    // the page you spend without those tiles in it — which is why the payouts
    // are small, and why two of the four last only until the page turns.
    //
    // A roll per painted tile, so a sackful is a sackful of chances. Real
    // paint only — deliberately `t.colour` rather than getActiveColour, which
    // would count a wash: a pot of ink wash is four temporary colours a page,
    // and he buys dyed rags, not damp ones.
    id: 'ragman', name: 'The Ragman', emoji: '🧺', rarity: 'uncommon', cost: 7,
    desc: `Each painted tile you discard has a 1-in-${Math.round(1 / RAGMAN_ODDS)} chance of paying — crimson the tongs, amber ${RAGMAN_COINS} Coin, jade +1 hand size for the page, azure your discard back.`,
    when: 'meta',
    onDiscard({ tiles, state, bench }) {
      const notes = [];
      let refunded = false;
      for (const t of tiles) {
        if (!COLOURS[t.colour]) continue;
        if (!luckyRoll(RAGMAN_ODDS)) continue;
        if (t.colour === 'crimson') {
          // No room on the bench, no tongs — and no harm done: clear a slot
          // before you throw and the crimson rags are worth having.
          if (bench('tongs')) notes.push('the tongs');
        } else if (t.colour === 'amber') {
          state.coins += RAGMAN_COINS;
          notes.push(`${RAGMAN_COINS} Coin`);
        } else if (t.colour === 'jade') {
          // Felt at once — main.js fills the hand again after the seats have
          // spoken — and taken back at the page turn.
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
    // wears none. All four, nothing less — a full motley is a build you commit
    // to across a run, not a spread you stumble into. Colours are counted the
    // patrons' way (countsAsColour), which makes him a rainbow tile's best
    // friend: one reads as all four by itself, and so meets his whole demand
    // alone. That is the intended shortcut, and the reason the bar could be
    // raised from three without the seat becoming unreachable.
    id: 'harlequin', name: 'The Harlequin', emoji: '🃏', rarity: 'uncommon', cost: 7,
    desc: 'Words holding all four colours get ×2 Mult.',
    when: 'score',
    effect({ tiles, xMult }) { if (distinctColours(tiles).length >= 4) xMult(2); },
  },
  {
    // Pays by the head at his table, himself included: +5 alone, +25 on a
    // full shelf, more with Colophon seats. Points, deliberately — a crowd
    // feeds the base and the multipliers stay someone else's business — and
    // a standing argument with the Headsman, who'd rather the seats empty.
    id: 'innkeeper', name: 'The Innkeeper', emoji: '🍻', rarity: 'common', cost: 6,
    // Ghosts still drink: a patron The Ripper killed has left the shelf but
    // not the table, and the Innkeeper counts every head in the room.
    desc: 'Every word gains +5 Points per patron you hold — this one included, and your ghosts.',
    when: 'score',
    effect({ addPoints }) { addPoints(5 * allSeats().length); },
  },
  {
    // The guilds' man at the table, and the reason `guild` is a def field. He
    // speaks after every other patron (scoring pass 4½) and counts guilds, not
    // patrons and not triggers: a guild is either represented on your shelf or
    // it isn't. Three amber patrons pay once; a dye that never touches scoring
    // pays as well as the Bursar. Four guilds exist, so ×5.06 is his ceiling
    // however many seats the Colophon grants.
    id: 'alderman', name: 'The Alderman', emoji: '🎩', rarity: 'uncommon', cost: 7,
    desc: 'Each guild with a patron on your shelf gives ×1.5 Mult.',
    when: 'meta',   // fires in scoring's pass 4½ — see js/scoring.js
  },

  // ── The four registers ──────────────────────────────────────────────────────
  // Each keeps one of the themed lists in wordlists-themed/ and pays ×3 when
  // the printed word is on it — and sends a package of its own the rest of the
  // time (registerPatron, above). The lists are flat files — edit them freely.
  registerPatron('sexton',    'The Sexton',    '⚰️', 'spooky',   8, 'spooky'),
  registerPatron('paramour',  'The Paramour',  '💘', 'romantic', 8, 'romantic'),
  registerPatron('poppet',    'The Poppet',    '🧸', 'cute',     7, 'cute'),
  registerPatron('vulgarian', 'The Vulgarian', '🍑', 'rude',     8, 'rude'),

  // ── The three parts of speech ───────────────────────────────────────────────
  // The registers above ask what a word is ABOUT; these three ask what it DOES
  // in a sentence, off three more flat files in wordlists-themed/. They pay ×2
  // rather than the registers' ×3 because they fire far more often: of the
  // 2,000 commonest words, roughly a quarter read as nouns (plurals counted),
  // a third are on the adjectives list and over half on the verbs — which is
  // why the price climbs the same way, and why the verbs cost the most a patron
  // ever does. A word that is two of them at once (an ANCHOR is a noun, to
  // ANCHOR is a verb) pays both seats, as any two patrons that both like a word
  // always have.
  {
    // He works in things: nouns, and the seat The Binder was waiting for, since
    // a compound of his — two nouns stacked, DOOM and HAT into DOOMHAT — is
    // itself a thing with a name. Without that seat the compound is not a word
    // at all. Plurals count as well (readsAsNoun), so a rack full of S's is no
    // longer a rack he ignores.
    id: 'sculptor', name: 'The Sculptor', emoji: '🗿', rarity: 'rare', cost: 9, guild: 'azure',
    desc: '×2 Mult when the word is a noun, singular or plural — a Binder\'s compound counts as one.',
    when: 'score',
    effect({ word, xMult }) { if (readsAsNoun(word)) xMult(2); },
  },
  {
    id: 'poet', name: 'The Poet', emoji: '🪶', rarity: 'rare', cost: 10, guild: 'azure',
    desc: '×2 Mult when the word is an adjective — the describing words, ABLE to ZESTY.',
    when: 'score',
    effect({ word, xMult }) { if (inTheme('adjectives', word)) xMult(2); },
  },
  {
    id: 'athlete', name: 'The Athlete', emoji: '🏃', rarity: 'rare', cost: 12, guild: 'azure',
    desc: '×2 Mult when the word is a verb — a doing word, in any tense: RUN, RAN, RUNNING.',
    when: 'score',
    effect({ word, xMult }) { if (inTheme('verbs', word)) xMult(2); },
  },

  // ── Misspellings · the four excuses ─────────────────────────────────────────
  // Titivillus (azure) forgives anything a vowel can do wrong; these three
  // forgive the consonants their oldest slips — letters in the wrong order,
  // and one letter standing where two belong. All four are consulted at the
  // dictionary check in main.js, and the word prints exactly as you set it,
  // misspelling and all. Three of the four never touch the score; the
  // Haplographer is the exception, and wears the higher price for it — his
  // licence also feeds The Twins and The Stammerer (see doubledReading).
  {
    id: 'stumbler', name: 'The Stumbler', emoji: '🥾', rarity: 'common', cost: 3,
    desc: 'Words are accepted with one pair of adjacent letters swapped: TEH counts as THE.',
    when: 'meta',
  },
  {
    // Haplography: writing once what ought to be written twice — the scribal
    // slip this family was missing. The licence cuts both ways from one rule
    // (doubledReading, above): at the dictionary check BALOON stands for
    // BALLOON, and at scoring any word that CAN be read with a doubled
    // letter counts as holding one more doubled pair, which is what pays The
    // Twins and The Stammerer. The only pardon that reaches the score.
    id: 'haplographer', name: 'The Haplographer', emoji: '🔂', rarity: 'uncommon', cost: 6,
    desc: 'One letter may read as doubled: BALOON counts as BALLOON — and doubles pay The Twins.',
    when: 'meta',
  },
  {
    id: 'skimmer', name: 'The Skimmer', emoji: '👓', rarity: 'rare', cost: 12,
    desc: 'Words are accepted with their middle letters in any order, so long as the first and last letters are right.',
    when: 'meta',
  },
];

export const patronById = id => PATRON_DEFS.find(d => d.id === id);

// A patron's liveries, always as an array — `guild` on a def may be absent,
// one string, or (for a dual-livery patron like the Cellarer) an array. The
// first entry is the primary: the first ribbon and pin the card wears; a
// second entry hangs a second ribbon beside it. Everything that asks which
// guilds a shelf represents goes through here.
export const guildsOf = def => (def?.guild ? [].concat(def.guild) : []);

// ─── What a seat is called ────────────────────────────────────────────────────
// A patron's name has two optional layers over the plain def: a stackable
// patron may name its own copy (instName — the Monogrammist's number), and any
// patron at all may have called at the Market already lettered (POSTNOM). The
// second rewrites the first: "The Scholar" becomes "Dr Scholar, PhD", which
// drops the article on purpose — a doctorate outranks a definite article.
//
// Everything that shows a patron's name goes through here, so a distinction
// shows up on the shelf, the calling card, the popover, the Market's messages
// and the laurel's log line without any of them knowing what a postnom is.
const dropArticle = name => name.replace(/^The\s+/, '');

export const patronName = (def, data) => {
  const base = def?.instName?.(data) ?? def?.name ?? 'The patron';
  return data?.postnom ? `Dr ${dropArticle(base)}, ${data.postnom}` : base;
};

// The short form the shelf's cards wear, where there is room for a word and
// not a sentence.
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

// What a card costs today — the def's price, plus the surcharge a lettered one
// asks, plus whatever the day's haggle came to (rolled onto the offer at the
// Market; see rollHaggle in constants.js). Read live from the offer rather
// than baked in, the way tile prices are.
//
// A patron the def prices at nothing stays at nothing: the cat is found, not
// bought, and a haggle over a free stray would be a strange thing to stage.
// Everyone else asks at least a Coin however well the haggling went.
export const patronCost = (def, data) => {
  const base = def?.cost ?? 0;
  if (!base) return 0;
  const asked = base + (data?.haggle ?? 0) + (data?.postnom ? POSTNOM.surcharge : 0);
  return Math.max(1, asked);
};

// Seats on the shelf flying a given colour, dual liveries included. The
// guild-scaling effects count through here — the Composter's heap allowance
// and the Banker's page coin both pay by the company a guild keeps — and
// each counts the counting patron itself, so a lone Composter or Banker is
// exactly as good as he was before his guild learned to matter.
export const guildSeats = colour =>
  allSeats().filter(p => guildsOf(patronById(p.id)).includes(colour)).length;

export const RARITY_WEIGHT = { common: 3, uncommon: 2, rare: 1 };
