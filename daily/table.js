// The Daily Proof's table: the patrons and editors a day may seat, and what
// each one DOES to a single word.
//
// Every def here is a port of the same id in js/patrons.js or js/bosses.js,
// cut down to the part that acts on one word. Coins, laurels, packages,
// permanent growth and anything that waits for the NEXT word are gone, because
// in a game of one word there is no next word to wait for. What is left must
// score exactly as the game scores it: tools/daily-check.mjs seats each of
// these in the game's own computeScore and fails on any difference.
//
// The roster is the cull. A patron is here only if it changes WHICH word is
// best, not merely how much the best word scores — see README.md, "The table",
// for what was left out and why, and for the measurements behind the tiers.
//
// A patron def may carry:
//   tileBonus(t, letters, resting) — Points written on one tile before the
//            nicks read (scoring's pass 1½). `resting` is the tile's value in
//            hand, which is what The Jeweller prices.
//   echo(t, data)  — the tile prints twice (pass 0 / 2½): The Monogrammist.
//   twins: true    — the second tile of a doubled letter is recast as the first
//                    (pass ⅓), and every pair pays (pass 4).
//   paint(tiles)   — { at, colour } laid before anything is counted (pass ½).
//   effect(ctx)    — the seat's word-level ruling (pass 4), through
//                    ctx.addPoints / ctx.addMult / ctx.xMult.
//   adds           — a tile the patron puts in the case: The Scientist's OLOGY,
//                    The Counterfeiter's blank. Cast by daily/deal.js.
//
// An editor def carries judge(letters, tiles, data) → a reason, or null, and
// may lend a tile (`adds`). A judged word is SPIKED: scored at ×SPIKE_MULT, as
// at a Deadline. Nothing is refused.

import {
  COLOURS, LOVERS, QUOIN_MULT, GLOVER_STEP, TYPESETTER_STEP, TWINS_POINTS,
  SERPENT_POINTS, APPRENTICE_LENGTH, APPRENTICE_STEP, CARTOGRAPHER_MULT,
  CARTOGRAPHER_MIN_VOWELS, isMark, EXPECTANTS_BONUS,
} from '../js/constants.js';
import { isExcluded } from '../js/excluded.js';

// ─── The lists ────────────────────────────────────────────────────────────────
// The same flat files the game reads (THEME_FILES in js/themes.js), parsed the
// same way: comments skipped, upper-cased, the excluded words struck. `common`
// keeps its order, since two editors read how far down it a word sits.
export const LIST_FILES = {
  common:     'wordlists/common.txt',
  adjectives: 'wordlists/adjectives.txt',
  verbs:      'wordlists/verbs.txt',
  nouns:      'wordlists/nouns.txt',
  spooky:     'wordlists/theme-spooky.txt',
  romantic:   'wordlists/theme-romantic.txt',
  cute:       'wordlists/theme-cute.txt',
  rude:       'wordlists/theme-rude.txt',
  commoner:   'wordlists/commoner.txt',
  nautical:   'wordlists/theme-nautical.txt',
  names:      'wordlists/names.txt',
};
// Lists that are words in their own right rather than a cut of the dictionary:
// tools/build-daily.mjs keeps them whole instead of trimming them to it.
export const LEXICONS = new Set(['names']);

export const LISTS = Object.fromEntries(Object.keys(LIST_FILES).map(k => [k, new Map()]));

export function adoptList(key, text) {
  const m = LISTS[key];
  if (!m) return 0;
  m.clear();
  for (const line of text.replace(/\r/g, '').split('\n')) {
    const w = line.trim();
    if (!w || w.startsWith('#')) continue;
    const W = w.toUpperCase();
    if (isExcluded(W)) continue;
    if (!m.has(W)) m.set(W, m.size);   // 0 = commonest
  }
  return m.size;
}

const inList = (key, word) => LISTS[key].has(word);
const listsFor = ids => [...new Set(ids.flatMap(id => PATRONS[id]?.lists ?? EDITORS[id]?.lists ?? []))];
// Which lists a set of seats needs before it can be judged.
export const listsNeeded = listsFor;

// ─── Reading tiles the way the patrons do ─────────────────────────────────────
const glyph = t => (t.activeVariant === 1 && t.letterType === 'dual' && t.altLetter ? t.altLetter : t.letter);
const VOWELS = 'AEIOU';
const countColour = (tiles, c) => { let n = 0; for (const t of tiles) if (t.colour === c) n++; return n; };
const distinctColours = tiles => Object.keys(COLOURS).filter(c => tiles.some(t => t.colour === c));
const houseOnly = (tiles, mine, rival) => countColour(tiles, mine) > 0 && countColour(tiles, rival) === 0;

// Adjacent doubled letters, without overlap: AAA is one pair (doubledPairs).
export function doubledPairs(word) {
  let n = 0;
  for (let i = 0; i < word.length - 1; i++) if (word[i] === word[i + 1]) { n++; i++; }
  return n;
}

// The Twins' pairs, walked letter by letter so a ligature counts for what it
// spells (twinPairs in js/patrons.js, without the Haplographer's licence).
// 'clone' pairs recast the second tile; 'letters' pairs are paid and left alone.
export function twinPairs(tiles) {
  const chars = [];
  for (const t of tiles) {
    const L = glyph(t);
    if (isMark(L)) continue;
    for (const ch of L) chars.push({ ch, tile: t });
  }
  const pairs = [];
  for (let i = 0; i < chars.length - 1; i++) {
    if (chars[i].ch !== chars[i + 1].ch) continue;
    const first = chars[i].tile, second = chars[i + 1].tile;
    const clonable = first !== second && glyph(first) === glyph(second);
    pairs.push({ kind: clonable ? 'clone' : 'letters', first, second });
    i++;
  }
  return pairs;
}

// What a clone copies (MOULD in js/scoring.js). Identity stays: the id, and so
// the place in the word.
const MOULD = ['letter', 'altLetter', 'letterType', 'activeVariant',
  'colour', 'trim', 'nick', 'material', 'bonusPoints', 'altBonusPoints'];
export const recast = (first, second) => {
  const t = { ...second };
  for (const k of MOULD) t[k] = first[k] ?? null;
  t.counterfeit = false;
  t.ephemeral = false;
  return t;
};

// The Cartographer's run: each tile's vowels, a repeat within a tile counted once.
function vowelRun(tiles) {
  const seq = [];
  let count = 0;
  for (const t of tiles) {
    let last = null;
    for (const ch of glyph(t) ?? '') {
      if (!VOWELS.includes(ch)) continue;
      count++;
      if (ch !== last) seq.push(ch);
      last = ch;
    }
  }
  return { seq, count };
}

const IRREGULAR_PLURALS = {
  CHILDREN: 'CHILD', DICE: 'DIE', FEET: 'FOOT', GEESE: 'GOOSE', LICE: 'LOUSE',
  MICE: 'MOUSE', OXEN: 'OX', PEOPLE: 'PERSON', TEETH: 'TOOTH',
};
function nounSingulars(word) {
  const irregular = IRREGULAR_PLURALS[word];
  if (irregular) return [irregular];
  const drop = n => word.slice(0, -n);
  if (word.length > 3 && word.endsWith('MEN'))  return [drop(3) + 'MAN'];
  if (word.length > 3 && word.endsWith('IES'))  return [drop(3) + 'Y'];
  if (word.length > 3 && word.endsWith('VES'))  return [drop(3) + 'F', drop(3) + 'FE'];
  if (word.length > 3 && word.endsWith('ES'))   return [drop(2), drop(1)];
  if (word.length > 3 && word.endsWith('I'))    return [drop(1) + 'US'];
  if (word.length > 3 && word.endsWith('S') && !word.endsWith('SS')) return [drop(1)];
  return [];
}
const readsAsNoun = word => inList('nouns', word) || nounSingulars(word).some(w => inList('nouns', w));

// ─── The patrons ──────────────────────────────────────────────────────────────
const register = theme => ({
  lists: [theme],
  effect({ letters, xMult }) { if (inList(theme, letters)) xMult(3); },
});

export const PATRONS = {
  // The four registers: ×3 for a word on a themed list.
  sexton:    register('spooky'),
  paramour:  register('romantic'),
  poppet:    register('cute'),
  vulgarian: register('rude'),
  seadog:    register('nautical'),

  // The parts of speech: ×2.
  poet:     { lists: ['adjectives'], effect({ letters, xMult }) { if (inList('adjectives', letters)) xMult(2); } },
  athlete:  { lists: ['verbs'],      effect({ letters, xMult }) { if (inList('verbs', letters)) xMult(2); } },
  sculptor: { lists: ['nouns'],      effect({ letters, xMult }) { if (readsAsNoun(letters)) xMult(2); } },
  lexicographer: {
    lists: ['common'],
    effect({ letters, xMult }) { if (LISTS.common.size && letters && !inList('common', letters)) xMult(1.5); },
  },

  // The shape of the word.
  mirror: {
    effect({ letters, has, xMult }) {
      if (letters.length < 3) return;
      const back = [...letters].reverse().join('');
      if (back === letters || has(back)) xMult(4);
    },
  },
  // Adapted: the game's Herald wants the word to END on its first letter, which
  // a good word does about one time in twenty-five — too seldom to stand in a
  // Friday choice. The daily's hears the first letter again anywhere after it.
  herald:   { adapted: true, effect({ letters, xMult }) { if (/^(.).*\1/.test(letters)) xMult(2); } },
  novelist: { effect({ letters, xMult }) { if (letters.length >= 7) xMult(2); } },
  cartographer: {
    effect({ tiles, xMult }) {
      const { seq, count } = vowelRun(tiles);
      if (count < CARTOGRAPHER_MIN_VOWELS) return;
      for (let i = 0; i < seq.length - 1; i++) if (seq[i] >= seq[i + 1]) return;
      xMult(CARTOGRAPHER_MULT);
    },
  },
  // The daily's ×2 versions, for the Friday choice: a tier pays one way, so a
  // patron that pays otherwise in the game is ADAPTED here (and daily-check,
  // which holds every other seat to the game's computeScore, knows it).
  stammerer: { adapted: true, effect({ letters, xMult }) { if (doubledPairs(letters)) xMult(2); } },
  siren: {
    adapted: true,
    effect({ letters, xMult }) {
      const v = [...letters].filter(c => VOWELS.includes(c)).length;
      if (letters.length > 1 && v * 2 >= letters.length) xMult(2);
    },
  },
  antiquary: { adapted: true, effect({ letters, xMult }) { if (/[JQXZ]/.test(letters)) xMult(2); } },
  // The daily's own: no such seat in the game.
  commoner: { adapted: true, lists: ['commoner'], effect({ letters, xMult }) { if (inList('commoner', letters)) xMult(2); } },
  serpent: {
    tileBonus: t => (glyph(t) === 'S' ? SERPENT_POINTS : 0),
    effect({ letters, xMult }) { if (letters.length > 1 && letters.endsWith('S')) xMult(2); },
  },
  apprentice: {
    tileBonus: (t, letters) => {
      if (letters.length !== APPRENTICE_LENGTH) return 0;
      const L = glyph(t);
      return isMark(L) ? 0 : L.length * APPRENTICE_STEP;
    },
  },
  twins: {
    twins: true,
    effect({ pairs, addPoints }) { if (pairs?.length) addPoints(TWINS_POINTS * pairs.length); },
  },

  // The colours.
  quoin: {
    effect({ tiles, xMult }) {
      for (let i = 1; i < tiles.length; i++) {
        const c = tiles[i].colour;
        if (c && c === tiles[i - 1].colour) { xMult(QUOIN_MULT); return; }
      }
    },
  },
  harlequin: { effect({ tiles, xMult }) { if (distinctColours(tiles).length >= 4) xMult(2); } },
  illuminator: {
    // Exactly three colours: the first bare tile takes the fourth, before
    // anything is counted (illuminate in js/patrons.js).
    paint(tiles) {
      const present = distinctColours(tiles);
      if (present.length !== 3) return null;
      const colour = Object.keys(COLOURS).find(c => !present.includes(c));
      const at = tiles.findIndex(t => !t.colour && !t.counterfeit && !t.ephemeral);
      return at >= 0 ? { at, colour } : null;
    },
  },
  romeo:   { effect({ tiles, xMult }) { if (houseOnly(tiles, 'amber', 'jade')) xMult(LOVERS.apart); } },
  juliet:  { effect({ tiles, xMult }) { if (houseOnly(tiles, 'jade', 'amber')) xMult(LOVERS.apart); } },
  marbler: { effect({ tiles, xMult }) { if (countColour(tiles, 'azure') >= 2) xMult(2); } },
  glover: {
    effect({ tiles, addMult }) {
      const pairs = Object.keys(COLOURS).filter(c => countColour(tiles, c) === 2).length;
      if (pairs) addMult(Math.round(pairs * GLOVER_STEP * 100) / 100);
    },
  },
  alloy: {
    effect({ tiles, addMult }) { if (countColour(tiles, 'crimson') && countColour(tiles, 'amber')) addMult(1); },
  },
  firebrand: { effect({ tiles, addPoints }) { if (countColour(tiles, 'crimson') >= 2) addPoints(15); } },

  // What the tiles are worth.
  jeweller: { tileBonus: (t, letters, resting) => (resting >= 8 ? Math.round(resting * 0.5) : 0) },
  typesetter: {
    effect({ tiles, addMult }) {
      const n = tiles.filter(t => !/^[A-Z]$/.test(glyph(t) ?? '')).length;
      if (n) addMult(Math.round(n * TYPESETTER_STEP * 100) / 100);
    },
  },
  monogrammist: { echo: (t, data) => (data?.letters ?? []).includes(glyph(t)) },

  // Patrons who bring a tile instead of a rule.
  scientist:     { adds: { letter: 'OLOGY' } },

  // Licences: patrons that change what counts as a word, as main.js's pardons
  // and lexicons do in the game. What is set is what prints and scores — the
  // licence only lets it through. spell(words, has, tiles) lists the spellings
  // the licence admits beyond the dictionary, for the page to accept and the
  // solver to try; the case's tiles bound the ones that need a V or an O.
  expectants: {
    lists: ['names'],
    spell: (words, has) => [...LISTS.names.keys()].filter(w => /^[A-Z]+$/.test(w) && !has(w)),
    // A name pays whether or not the dictionary holds it: GRACE is no less a name.
    effect({ letters, addPoints }) { if (inList('names', letters)) addPoints(EXPECTANTS_BONUS); },
  },
  haplographer: {
    // One letter of a doubled pair may be set once: MATE reads as MATTE.
    spell(words, has) {
      const out = new Set();
      for (const W of words) for (let i = 0; i < W.length - 1; i++) {
        if (W[i] !== W[i + 1]) continue;
        const s = W.slice(0, i + 1) + W.slice(i + 2);
        if (!has(s)) out.add(s);
      }
      return [...out];
    },
  },
  bookbinder: {
    // The accent: a V may be read as a W. The howl: a run of O's may be set as
    // long as the case allows and still read as the word's own run.
    spell(words, has, tiles) {
      const faces = t => [t.letter, t.altLetter].filter(Boolean);
      const nV = tiles.filter(t => faces(t).includes('V')).length;
      const nO = tiles.filter(t => faces(t).includes('O')).length;
      const out = new Set();
      for (const W of words) {
        const ws = [...W].flatMap((c, i) => (c === 'W' ? [i] : []));
        const oCount = [...W].filter(c => c === 'O').length;
        const spare = nO - oCount;
        if (!(ws.length && nV) && !(oCount && spare > 0)) continue;
        // Every choice of W's to set as V (as many as the case has V's)…
        const subsets = [];
        for (let m = 0; m < (1 << ws.length); m++) {
          let k = 0; for (let b = m; b; b &= b - 1) k++;
          if (k <= nV) subsets.push(m);
        }
        // …and every way of lengthening the word's O-runs with the spare O's.
        const runs = [];
        for (let i = 0; i < W.length; i++) if (W[i] === 'O' && W[i - 1] !== 'O') runs.push(i);
        const ext = [[]];
        for (let r = 0; r < runs.length; r++) {
          const next = [];
          for (const e of ext) {
            const used = e.reduce((a, b) => a + b, 0);
            for (let x = 0; x <= Math.max(0, spare) - used; x++) next.push([...e, x]);
          }
          ext.splice(0, ext.length, ...next);
        }
        for (const m of subsets) for (const e of ext) {
          if (!m && e.every(x => !x)) continue;
          let s = '', run = 0;
          for (let i = 0; i < W.length; i++) {
            const c = W[i];
            s += c === 'W' && m & (1 << ws.indexOf(i)) ? 'V' : c;
            if (c === 'O' && W[i + 1] !== 'O') s += 'O'.repeat(e[run++] ?? 0);
          }
          if (!has(s)) out.add(s);
        }
      }
      return [...out];
    },
  },
  counterfeiter: { adds: { letter: '_', counterfeit: true, blank: true } },
};

// ─── The editors ──────────────────────────────────────────────────────────────
// `data` is what the day rolled for the desk: the Columnist's measure, the
// Serialist's letter, the Enthusiast's darling. Each reason is a key into
// EDITOR_TEXT in daily/text.js, so the copy lives with the rest of the copy.
export const EDITORS = {
  padder:       { judge: L => (L.length < 5 ? 'spike' : null) },
  columnist:    { judge: (L, tiles, d) => (L.length !== d.n ? 'spike' : null) },
  serialist:    { judge: (L, tiles, d) => (L[0] !== d.letter ? 'spike' : null) },
  enthusiast:   { judge: (L, tiles, d) => (!L.includes(d.letter) ? 'spike' : null) },
  populist: {
    lists: ['common'],
    judge: L => { const r = LISTS.common.get(L); return r == null || r >= 8000 ? 'spike' : null; },
  },
  obscurantist: {
    lists: ['common'],
    judge: (L, tiles, d) => { const r = LISTS.common.get(L); return r != null && r < (d.band ?? 500) ? 'spike' : null; },
  },
  minimalist:   { lists: ['adjectives'], judge: L => (inList('adjectives', L) ? 'spike' : null) },
};

// ─── A table, compiled ────────────────────────────────────────────────────────
// What scoring asks of the seats, gathered once per seating so the solver's
// inner loop calls straight through. `seat` is { id, data } or null; so is `desk`.
export function compileTable(seat, desk, has) {
  const p = seat ? PATRONS[seat.id] : null;
  const e = desk ? EDITORS[desk.id] : null;
  if (seat && !p) throw new Error(`daily table: no patron '${seat.id}'`);
  if (desk && !e) throw new Error(`daily table: no editor '${desk.id}'`);
  const pdata = seat?.data ?? {};
  const edata = desk?.data ?? {};
  return {
    seat, desk, has,
    twins: !!p?.twins,
    paint: p?.paint ?? null,
    echo: p?.echo ? t => p.echo(t, pdata) : null,
    tileBonus: p?.tileBonus ?? null,
    effect: p?.effect ?? null,
    spell: p?.spell ?? null,
    judge: e ? (L, tiles) => e.judge(L, tiles, edata) : null,
  };
}

// The spellings the day's licences admit beyond the dictionary (none on most days).
export function spellingsFor(tables, words, has, tiles) {
  const out = new Set();
  for (const T of tables) if (T.spell) for (const s of T.spell(words, has, tiles)) out.add(s);
  return out;
}

// ─── A day's tables ───────────────────────────────────────────────────────────
// What the solver prices each word under, for a day as daily/deal.js deals it:
// nothing on a plain or two-word day; the one patron or the one editor; or each
// of the patrons on offer, in the order the page shows them.
export function tablesForDay(day, has) {
  if (day?.kind === 'patron') return [compileTable(day.patron, null, has)];
  if (day?.kind === 'editor') return [compileTable(null, day.editor, has)];
  if (day?.kind === 'choice') return day.choices.map(c => compileTable(c, null, has));
  return [];
}

// The ids of everyone seated or offered, for the lists they read.
export const seatIdsOfDay = day =>
  [day?.patron?.id, day?.editor?.id, ...(day?.choices ?? []).map(c => c.id)].filter(Boolean);
