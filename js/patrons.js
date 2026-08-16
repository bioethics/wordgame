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
// Optional hooks (main.js dispatches these for every seated patron):
//   onPrinted(ctx)    — after a word commits; ctx { tiles, script, state, data,
//                       grow(tile, n), paint(tile, colour), burn(tile),
//                       trim(tile, kind) }. May mutate the collection
//                       (permanent growth, paint, burns). Return { note } to
//                       say something, and { burned: [tile…] } for tiles that
//                       must not retire to the discard pile.
//   onPageStart(ctx)  — as a page's bag is dealt, before the hand is drawn;
//                       ctx { state, data, cast(overrides) }, where cast
//                       strikes a new tile into hand and collection alike.
//                       Return { note, tiles } so the arrival can be animated.
//   onChapterEnd(ctx) — as a chapter clears, before the next page's bag is
//                       shuffled; ctx { state, data }. Return { note } likewise.
//   onDiscard(ctx)    — after tiles are thrown away, before the hand tops up;
//                       ctx { tiles, state, data, paint(tile, colour) }. The
//                       tiles are already in the discard pile but still in the
//                       collection, so paint written here is waiting when the
//                       bag comes round again. Return { note } likewise, and
//                       { painted: [{ tile, colour }] } for tiles that should
//                       take their new colour on screen before they fly off.
// `data` is the seat's own saved memory (state.js patronData) — counters live
// there, never on the def.
//
// Stackable patrons (the Monogrammist): `stackable: true` lets the Market keep
// offering a patron you already hold, and every seat carries a unique `uid` so
// copies can be badged, dismissed and animated as themselves. Such defs may
// roll per-copy state with `onOffer()` (shown on the Market card, moved onto
// the seat's data at purchase) and present themselves with `instName(data)`,
// `instShelf(data)` and `instDesc(data)` — everything falls back to the plain
// def fields when absent. `tileEcho(tile, data)` marks tiles that print twice —
// Points, gold Coins, cobalt refreshes, paint and purple trim alike. Scoring
// counts the seats in pass 0 and spends the result across passes 1 to 3.
//
// Optional `portrait`: path to an image (e.g. 'img/patrons/scholar.png') shown
// on the patron's business card in the market and draft instead of the emoji.
//
// Optional `guild`: the livery a patron wears — 'amber' | 'jade' | 'crimson' |
// 'azure' — absent for the neutral majority. Membership is thematic, not
// mechanical: it drives the calling card's ribbon, the seat's livery pin, and
// nothing else — except the Alderman, who pays ×1.5 for every liveried patron
// on the shelf, fired or not (scoring pass 4½). Because he counts seats rather
// than effects, adding a `guild` to a def makes that patron worth more to an
// Alderman build even if its own effect never changes. Assignments may drift
// as flavour demands.

import {
  GRAFTER_STEP, STOKER_STEP, BEEKEEPER_STEP, ARSONIST_ODDS, NUDIST_TRIM_CHANCE,
  DYE_TILES_PER_CHAPTER, COLOURS, TRIMS, LIGATURES, COMPOST_PER_MARKET,
  BAG_COUNTS, FRONTISPIECE, DIPPER_PAINT_CHANCE,
} from './constants.js';
import {
  getActiveColour, getActiveLetter, countsAsColour, luckyRoll, paintRandomTiles,
  shuffle,
} from './state.js';
import { inTheme, themeSize } from './themes.js';
import { DICT } from './dict.js';   // The Mirror reads a word backwards against it

const VOWELS = 'AEIOU';

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
    id: 'scholar', name: 'The Scholar', emoji: '📜', rarity: 'common', cost: 4,
    desc: 'Words of 5+ letters gain +5 Points.',
    when: 'score',
    effect({ word, addPoints }) { if (word.length >= 5) addPoints(5); },
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
    id: 'twins', name: 'The Twins', emoji: '👯', rarity: 'common', cost: 4,
    desc: 'Words with a doubled letter (LL, OO…) gain +15 Points.',
    when: 'score',
    effect({ word, addPoints }) { if (doubledPairs(word)) addPoints(15); },
  },
  {
    id: 'izzard', name: 'The Izzard', emoji: '⚡', rarity: 'common', cost: 4, guild: 'azure',
    // "Izzard" is the old English name for Z, the letter kept in the far
    // corner of the type case because nothing ever needed it.
    desc: 'Any Z you play may be read as an S — and still scores as a Z.',
    when: 'meta',   // consulted at the dictionary check in main.js
  },
  {
    // This was a ×3, and a ×3 scales with everything you build after it: the
    // small base a three-letter word lands on stopped mattering the moment the
    // colours came in, and cursed metal made it frightening. A flat +10 does
    // what the card was for — it makes a short word worth printing — without
    // compounding into the rest of the run. It is at its best early, which is
    // when a common-weight card should be at its best.
    id: 'abecedarian', name: 'The Abecedarian', emoji: '🪶', rarity: 'common', cost: 5,
    desc: '3-letter words get +10 Points.',
    when: 'score',
    effect({ word, addPoints }) { if (word.length === 3) addPoints(10); },
  },

  // ── Uncommons ───────────────────────────────────────────────────────────────
  {
    id: 'banker', name: 'The Banker', emoji: '🏦', rarity: 'uncommon', cost: 5, guild: 'amber',
    desc: '+2 Coins whenever a page completes.',
    when: 'meta',
  },
  {
    id: 'quartermaster', name: 'The Quartermaster', emoji: '🎒', rarity: 'uncommon', cost: 5, guild: 'crimson',
    desc: 'Begin each page with an extra Discard.',
    when: 'meta',
  },
  {
    id: 'typesetter', name: 'The Typesetter', emoji: '🔠', rarity: 'uncommon', cost: 6,
    desc: 'Each ligature tile — one that spells several letters — gives +2 Mult.',
    when: 'score',
    effect({ tiles, addMult }) {
      const n = tiles.filter(t => LIGATURES.includes(t.letter)).length;
      if (n) addMult(n * 2);
    },
  },
  {
    id: 'jeweller', name: 'The Jeweller', emoji: '💎', rarity: 'uncommon', cost: 6,
    desc: 'Tiles worth 8+ Points gain a further +4.',
    when: 'score',
    effect({ tiles, addPoints }) {
      const n = tiles.filter(t => (t.basePoints ?? 0) >= 8).length;
      if (n) addPoints(n * 4);
    },
  },
  {
    id: 'calligrapher', name: 'The Calligrapher', emoji: '✒️', rarity: 'uncommon', cost: 7,
    desc: 'Each painted tile gains +3 Points.',
    when: 'score',
    effect({ tiles, addPoints }) {
      const n = tiles.filter(t => getActiveColour(t)).length;
      if (n) addPoints(n * 3);
    },
  },
  {
    id: 'magpie', name: 'The Magpie', emoji: '🐦', rarity: 'uncommon', cost: 7, guild: 'amber',
    desc: 'Gold-trimmed tiles pay double Coins.',
    when: 'meta',   // read directly during scoring of gold trims
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
    effect({ tiles, addPoints }) {
      const n = painted(tiles, 'amber').length;
      if (n) addPoints(n * 4);
    },
  },
  dyePatron('weld', 'The Weld', '🌼', 'amber'),
  {
    id: 'assayer', name: 'The Assayer', emoji: '⚖️', rarity: 'uncommon', cost: 6, guild: 'amber',
    desc: 'Amber tiles pay 1 Coin when printed, up to 2 a word.',
    when: 'score',
    effect({ tiles, addCoins }) {
      const n = Math.min(2, painted(tiles, 'amber').length);
      if (n) addCoins(n);
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

  // ── Jade · growth and permanence ────────────────────────────────────────────
  {
    id: 'seedsman', name: 'The Seedsman', emoji: '🌱', rarity: 'common', cost: 4, guild: 'jade',
    desc: 'Jade tiles gain +1 Point per chapter reached — +5 Points each in Chapter V.',
    when: 'score',
    effect({ tiles, state, addPoints }) {
      const n = painted(tiles, 'jade').length;
      if (n) addPoints(n * state.chapter);
    },
  },
  dyePatron('verdigris', 'The Verdigris', '🍏', 'jade'),
  {
    id: 'vintner', name: 'The Vintner', emoji: '🍷', rarity: 'uncommon', cost: 7, guild: 'jade',
    desc: 'Words with a jade tile gain +1 Mult per chapter reached — +5 Mult in Chapter V.',
    when: 'score',
    effect({ tiles, state, addMult }) {
      if (painted(tiles, 'jade').length) addMult(state.chapter);
    },
  },
  {
    id: 'composter', name: 'The Composter', emoji: '🍂', rarity: 'uncommon', cost: 7, guild: 'jade',
    desc: `Destroyed tiles rot down into jade ones — take ${COMPOST_PER_MARKET} from the heap at every Market.`,
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
    id: 'grafter', name: 'The Grafter', emoji: '🌿', rarity: 'rare', cost: 10, guild: 'jade',
    desc: 'When a word with a jade tile prints, every tile in it permanently gains +1 Point.',
    when: 'meta',
    onPrinted({ tiles, grow }) {
      if (!painted(tiles, 'jade').length) return null;
      for (const t of tiles) grow(t, GRAFTER_STEP);
      return { note: `+${GRAFTER_STEP} grown into ${tiles.length} tile${tiles.length > 1 ? 's' : ''}` };
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
    id: 'ratcatcher', name: 'The Rat Catcher', emoji: '🐀', rarity: 'uncommon', cost: 7, guild: 'crimson',
    desc: 'Every page begins with a RAT tile in hand, painted at random. It is yours for good.',
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
    id: 'stoker', name: 'The Stoker', emoji: '🔥', rarity: 'rare', cost: 11, guild: 'crimson',
    desc: 'Crimson tiles are destroyed when printed; each one permanently raises this patron\'s Mult by 0.25.',
    when: 'score',
    effect({ data, xMult }) {
      const stacks = data?.stacks ?? 0;
      if (stacks) xMult(Math.round((1 + stacks * STOKER_STEP) * 100) / 100);
    },
    onPrinted({ tiles, data, burn }) {
      const burned = [];
      for (const t of painted(tiles, 'crimson')) {
        if (burn(t)) { burned.push(t); data.stacks = (data.stacks ?? 0) + 1; }
      }
      if (!burned.length) return null;
      return {
        note: `${burned.length} to the fire — ×${Math.round((1 + data.stacks * STOKER_STEP) * 100) / 100} Mult`,
        burned,
      };
    },
  },

  // ── Azure · ink, flow, and latitude ─────────────────────────────────────────
  {
    id: 'siren', name: 'The Siren', emoji: '🎶', rarity: 'common', cost: 4, guild: 'azure',
    desc: 'Vowels gain +2 Points — or +6 if they are azure.',
    when: 'score',
    effect({ tiles, addPoints }) {
      let sum = 0;
      for (const t of tiles) {
        const L = getActiveLetter(t);
        if (L.length !== 1 || !VOWELS.includes(L)) continue;
        sum += getActiveColour(t) === 'azure' ? 6 : 2;
      }
      if (sum) addPoints(sum);
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
    desc: 'Words with an azure tile are accepted with one vowel wrong, or with two vowels swapped.',
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
    id: 'nudist', name: 'The Nudist', emoji: '🧖', rarity: 'common', cost: 4,
    desc: 'In a word where no tile has paint, a trim or a nick, each tile has a 1-in-4 chance of gaining a random trim.',
    when: 'meta',
    onPrinted({ tiles, trim }) {
      const bare = t => !t.colour && !t.trim && !t.nick;
      if (!tiles.length || !tiles.every(bare)) return null;
      const kinds = Object.keys(TRIMS);
      const dressed = [];
      for (const t of tiles) {
        if (!luckyRoll(NUDIST_TRIM_CHANCE)) continue;
        const kind = kinds[Math.floor(Math.random() * kinds.length)];
        if (trim(t, kind)) dressed.push(TRIMS[kind].label);
      }
      return dressed.length ? { note: `dressed in ${dressed.join(', ')}` } : null;
    },
  },
  {
    id: 'illuminator', name: 'The Illuminator', emoji: '🎨', rarity: 'rare', cost: 8,
    desc: 'When a word holds three paint colours, one unpainted tile in it is permanently painted the fourth.',
    when: 'meta',
    onPrinted({ tiles, paint }) {
      const present = new Set(tiles.map(getActiveColour).filter(Boolean));
      if (present.size !== 3) return null;
      const missing = Object.keys(COLOURS).find(c => !present.has(c));
      const bare = tiles.filter(t => !getActiveColour(t));
      if (!missing || !bare.length) return null;
      const target = bare[Math.floor(Math.random() * bare.length)];
      if (!paint(target, missing)) return null;
      return { note: `${getActiveLetter(target)} illuminated ${COLOURS[missing].label.toLowerCase()}` };
    },
  },
  {
    // Now the only patron that pays on a page's first word — the Archivist,
    // whose flat ×2 it could never catch, has been cut. The step stays small
    // deliberately: clearing a page on its first word already pays, in spare-
    // word Coins, so this needn't double up on the reward.
    id: 'frontispiece', name: 'The Frontispiece', emoji: '🖼️', rarity: 'uncommon', cost: 7, guild: 'jade',
    desc: `The first word of each page gets ×${FRONTISPIECE.base} Mult — +${FRONTISPIECE.step} more, for good, each time that word clears the quota alone.`,
    when: 'score',
    effect({ state, data, xMult }) {
      if (state.wordsPrinted !== 0) return;
      xMult(Math.round((FRONTISPIECE.base + (data?.steps ?? 0) * FRONTISPIECE.step) * 100) / 100);
    },
    onPrinted({ state, script, data }) {
      if (state.wordsPrinted !== 1) return null;      // only the page's first word
      if (script.total < state.quota) return null;    // and only when it cleared the page alone
      data.steps = (data.steps ?? 0) + 1;
      const next = Math.round((FRONTISPIECE.base + data.steps * FRONTISPIECE.step) * 100) / 100;
      return { note: `cleared alone — ×${next} from the next page` };
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
    // simulating. If it proves too easy in the hand, lower the multiplier
    // before narrowing the list: the list is shared with two editors.
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
    // Not a misspelling like the three excuses below — nothing has gone wrong
    // here. It licenses a construction: the compound noun, which English makes
    // freely and dictionaries only ever catch up with.
    id: 'binder', name: 'The Binder', emoji: '🔗', rarity: 'rare', cost: 12, guild: 'azure',
    desc: 'Any two nouns stacked together count as a word: DOOM and HAT make DOOMHAT.',
    when: 'meta',   // consulted at the dictionary check in main.js; the list lives in wordlists-themed/nouns.txt
  },
  {
    id: 'stammerer', name: 'The Stammerer', emoji: '🦜', rarity: 'rare', cost: 10,
    desc: '×2 Mult for every doubled letter in the word — BALLOON pays twice.',
    when: 'score',
    effect({ word, xMult }) {
      const n = doubledPairs(word);
      if (n) xMult(2 ** n);
    },
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
  // the printed word is on it. The lists are flat files — edit them freely.
  {
    id: 'sexton', name: 'The Sexton', emoji: '⚰️', rarity: 'rare', cost: 9,
    desc: '×3 Mult when the word is spooky — HAUNTED, CRYPT, WEREWOLF.',
    when: 'score',
    effect({ word, xMult }) { if (inTheme('spooky', word)) xMult(3); },
  },
  {
    id: 'paramour', name: 'The Paramour', emoji: '💘', rarity: 'rare', cost: 9,
    desc: '×3 Mult when the word is romantic — KISS, SWOON, SMITTEN.',
    when: 'score',
    effect({ word, xMult }) { if (inTheme('romantic', word)) xMult(3); },
  },
  {
    id: 'poppet', name: 'The Poppet', emoji: '🧸', rarity: 'rare', cost: 9,
    desc: '×3 Mult when the word is cute — KITTEN, BUNNY, CUDDLE.',
    when: 'score',
    effect({ word, xMult }) { if (inTheme('cute', word)) xMult(3); },
  },
  {
    id: 'vulgarian', name: 'The Vulgarian', emoji: '🍑', rarity: 'rare', cost: 9,
    desc: '×3 Mult when the word is rude — FART, BUM, TURD.',
    when: 'score',
    effect({ word, xMult }) { if (inTheme('rude', word)) xMult(3); },
  },

  // ── Misspellings · the three excuses ────────────────────────────────────────
  // Titivillus (azure) forgives a wrong vowel; these two forgive letters in the
  // wrong order. All three are consulted at the dictionary check in main.js,
  // cheapest excuse first, and none of them touch the score — the word prints
  // exactly as you set it, misspelling and all.
  {
    id: 'stumbler', name: 'The Stumbler', emoji: '🥾', rarity: 'common', cost: 3,
    desc: 'Words are accepted with one pair of adjacent letters swapped: TEH counts as THE.',
    when: 'meta',
  },
  {
    id: 'skimmer', name: 'The Skimmer', emoji: '👓', rarity: 'rare', cost: 12,
    desc: 'Words are accepted with their middle letters in any order, so long as the first and last letters are right.',
    when: 'meta',
  },
];

export const patronById = id => PATRON_DEFS.find(d => d.id === id);

export const RARITY_WEIGHT = { common: 3, uncommon: 2, rare: 1 };
