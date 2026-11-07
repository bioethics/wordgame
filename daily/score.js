// The Daily Proof's arithmetic: one word, scored the way the press scores it,
// and every OTHER word the case could have set, scored the same way, so the one
// you printed can be ranked against them.
//
// This is computeScore (js/scoring.js) for one word, nothing primed, nothing
// washed, and at most one patron and one editor (daily/table.js). With the
// table empty that leaves exactly the base game:
//
//   Points = each tile's face + growth + a silver trim, plus what every nick
//            reads off its side of the word, minus 666 per curse left out
//   Mult   = the measure × (1 + n) per paint × (1 + ½ per purple trim)
//            × 2 per cursed tile × 2 per squib
//   total  = max(0, round(Points × Mult))
//
// It is re-written here rather than imported because the solver below calls it
// tens of thousands of times a case, and computeScore builds a full replay
// script on every call. tools/daily-check.mjs holds the two to each other: it
// scores thousands of random arrangements both ways and fails on any
// difference, so a change to the base arithmetic shows up there first.

import {
  TILE_POINTS, SILVER_BONUS, PURPLE_TRIM_STEP, CURSED_MULT, CURSED_PENALTY,
  EXPLOSIVE_MULT, LOUPE_CAP, COLOURS, MEDIEVAL, LIGATURES, isMark, splitMarks,
  medievalExpansions, lengthMult, LENGTH_MULT_MIN, SPIKE_MULT,
} from '../js/constants.js';
import { twinPairs, recast } from './table.js';

// ─── A tile's faces ───────────────────────────────────────────────────────────
// Tiles use the game's own template shape (makeTileTemplate in constants.js):
// letter, letterType, altLetter, activeVariant, colour, trim, nick,
// bonusPoints, altBonusPoints, material. So the same object can be handed to
// the game's computeScore when the two are checked against each other.

export const faceLetter = (t, v = t.activeVariant) =>
  (v === 1 && t.letterType === 'dual' && t.altLetter ? t.altLetter : t.letter);

export const activeLetter = t => faceLetter(t, t.activeVariant);

const growthOf = (t, v = t.activeVariant) =>
  (v === 1 ? t.altBonusPoints : t.bonusPoints) ?? 0;

// What the tile is worth at rest — the corner figure. restingPoints in state.js.
// A counterfeit (The Counterfeiter's blank) spells and is worth nothing, and
// so does a tile The Redactor has wrapped.
export const restingOf = (t, v = t.activeVariant) =>
  (t.counterfeit || t.wrapped ? 0
    : (TILE_POINTS[faceLetter(t, v)] ?? 1) + growthOf(t, v) + (t.trim === 'silver' ? SILVER_BONUS : 0));

// ─── The two tools ────────────────────────────────────────────────────────────
// The ratchet's alphabet is the press's own (SHIFT_RING in state.js): every
// single-letter sort, Q included, in a ring, so A steps back to Z.
export const RING = Object.keys(TILE_POINTS).filter(l => /^[A-Z]$/.test(l)).sort();
export const ringStep = (letter, offset) => {
  const i = RING.indexOf(letter);
  if (i < 0) return null;
  const n = RING.length;
  return RING[((i + offset) % n + n) % n];
};
export const shiftable = (t, v = t.activeVariant) =>
  t.material !== 'ghost' && RING.includes(faceLetter(t, v));

// What the loupe would add to a face: double its resting value, never past the
// cap (applySundry in state.js). Zero means it would be refused.
export const loupeDelta = (t, v = t.activeVariant) => {
  const r = restingOf(t, v);
  return Math.max(0, Math.min(LOUPE_CAP, r * 2) - r);
};

// The case as it stands with the tool applied — on copies, so taking the tool
// back is just forgetting `applied`. A ratchet rewrites the face it was used on;
// a loupe grows it. Both are tied to a FACE, not a tile, because that is how the
// game does it: growth and a stepped letter follow the face that was showing.
export function withTool(tiles, applied) {
  if (!applied) return tiles;
  return tiles.map(t => {
    if (t.id !== applied.id) return t;
    const v = applied.face ?? 0;
    const field = v === 1 ? 'altLetter' : 'letter';
    if (applied.kind === 'ratchet') {
      const to = ringStep(faceLetter(t, v), applied.offset);
      return to ? { ...t, [field]: to, ratcheted: v, ratchetFrom: faceLetter(t, v) } : t;
    }
    if (applied.kind === 'loupe') {
      const grow = v === 1 ? 'altBonusPoints' : 'bonusPoints';
      return { ...t, [grow]: (t[grow] ?? 0) + loupeDelta(t, v), louped: v };
    }
    // A tube paints the whole sort, both faces: paint is the tile's, not a face's.
    if (applied.kind === 'tube') return { ...t, colour: applied.colour, painted: true };
    return t;
  });
}

// A solver's plan laid back onto the case: faces as the plan set them, a blank
// set as the letter the plan gave it, and the tool where the plan put it.
// Returns the word's tiles in order and the rest of the case.
export function settingOf(caseTiles, entry) {
  const base = caseTiles.map(t => ({ ...t }));
  const byIdBase = new Map(base.map(t => [t.id, t]));
  for (const p of entry.plan) {
    const t = byIdBase.get(p.id);
    if (!t) continue;
    t.activeVariant = p.face;
    if (p.letter) t.letter = p.letter;
  }
  const eff = withTool(base, entry.tool ?? null);
  const byId = new Map(eff.map(t => [t.id, t]));
  const used = new Set(entry.plan.map(p => p.id));
  return { word: entry.plan.map(p => byId.get(p.id)), rest: eff.filter(t => !used.has(t.id)) };
}

// ─── Reading a word ───────────────────────────────────────────────────────────
// What the table READS: medieval sorts resolved (resolveMedieval in patrons.js
// — the first reading, in the sort's own order, that is a word), marks stripped.
export function readLetters(word, has) {
  const parts = splitMarks(word);
  if (!parts) return null;
  const options = medievalExpansions(parts.letters);
  if (!options) return parts.letters;
  return options.find(has) ?? options[0];
}

// submitWord's gate in js/main.js, minus the doors only patrons open.
// Returns { ok, letters } or { ok: false, why }.
export function judge(wordTiles, has) {
  if (!wordTiles.length) return { ok: false, why: 'empty' };
  const set = wordTiles.map(activeLetter).join('');
  const parts = splitMarks(set);
  if (!parts) return { ok: false, why: 'marksLast' };
  if (!parts.letters) return { ok: false, why: 'markAlone' };
  const readings = medievalExpansions(parts.letters) ?? [parts.letters];
  const hit = readings.find(has);
  return hit ? { ok: true, letters: hit, set } : { ok: false, why: 'notAWord', set };
}

// ─── Scoring one arrangement, with its breakdown ──────────────────────────────
// `rest` is every tile of the case NOT in the word — the rack, in the game's
// terms — which is where a curse takes its toll from. `T` is the day's table
// (compileTable in daily/table.js), or null for a day with nobody seated.
// A wrapped tile spells and nothing else: computeScore's pass 0 takes its
// paint, trim, nick and metal off a copy, and so does this. (The deal wraps
// sorts bare already; this is for anything else that hands one over.)
const paper = t => (t.wrapped ? { ...t, colour: null, wash: null, trim: null, nick: null, material: null } : t);

export function scoreWord(wordTiles, rest, has, T = null) {
  if (!wordTiles.length) return null;
  if (wordTiles.some(t => t.wrapped)) wordTiles = wordTiles.map(paper);
  const set = wordTiles.map(activeLetter).join('');
  const letters = readLetters(set, has) ?? set;
  const restCurses = rest.filter(t => t.material === 'cursed').length;
  return { set, letters, ...core(wordTiles, letters, restCurses, T, true) };
}

const round3 = m => Math.round(m * 1000) / 1000;

// computeScore's passes, in its order, for one word and at most one patron and
// one editor. With `full` it also keeps what the board and the replay show;
// without, it is the solver's inner loop and returns the total alone.
//
//   ⅓  The Twins recast the second of each doubled pair as the first
//   ½  The Illuminator paints
//   1  each tile's own Points; 1½ a patron writes onto the tiles
//   2  nicks read their side (a nicked tile is read at its resting value)
//   2½ The Monogrammist's tiles print twice
//   3  the measure × each paint × purple × cursed (echoed tiles count twice)
//   3½ a curse left out takes its toll
//   4  the patron rules on the word (Points, +Mult, ×Mult — all on Points)
//   4¾ the editor spikes
function core(word, letters, restCurses, T, full) {
  let tiles = word;
  let pairs = null, recasts = null, lit = null;
  if (T?.twins) {
    pairs = twinPairs(tiles);
    for (const q of pairs) {
      if (q.kind !== 'clone' || q.first.counterfeit) continue;
      const twin = recast(q.first, q.second);
      if (tiles === word) tiles = tiles.slice();
      tiles[tiles.indexOf(q.second)] = twin;
      if (full) (recasts ??= []).push({ id: q.second.id, from: q.first.id, tile: twin });
    }
  }
  if (T?.paint) {
    lit = T.paint(tiles);
    if (lit) {
      if (tiles === word) tiles = tiles.slice();
      tiles[lit.at] = { ...tiles[lit.at], colour: lit.colour };
    }
  }

  const n = tiles.length;
  const own = new Array(n), contrib = new Array(n);
  const echo = T?.echo ? tiles.map((t, i) => (T.echo(t, i) ? 2 : 1)) : null;
  const bonus = T?.tileBonus ? new Array(n) : null;
  for (let i = 0; i < n; i++) {
    own[i] = restingOf(tiles[i]);
    contrib[i] = own[i];
    if (bonus) { bonus[i] = T.tileBonus(tiles[i], letters, own[i]) || 0; contrib[i] += bonus[i]; }
  }
  // Nicks, off one frozen list: a nicked tile is read at what it wears in hand.
  const gain = full ? new Array(n).fill(0) : null;
  {
    const readAs = new Array(n);
    let all = 0;
    for (let i = 0; i < n; i++) { readAs[i] = tiles[i].nick ? own[i] : contrib[i]; all += readAs[i]; }
    let left = 0;
    const add = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      const k = tiles[i].nick;
      if (k === 'right') add[i] = all - left - readAs[i];
      else if (k === 'left') add[i] = left;
      left += readAs[i];
    }
    for (let i = 0; i < n; i++) if (add[i]) { contrib[i] += add[i]; if (gain) gain[i] = add[i]; }
  }
  if (echo) for (let i = 0; i < n; i++) contrib[i] *= echo[i];
  let points = 0;
  for (let i = 0; i < n; i++) points += contrib[i];

  // The multipliers, in the order the readout shows them.
  const chips = full ? [] : null;
  let mult = 1;
  const measure = lengthMult(letters.length);
  if (measure > 1) { mult *= measure; chips?.push({ kind: 'length', count: letters.length, mult: measure }); }
  const w = i => (echo ? echo[i] : 1);
  for (const c of Object.keys(COLOURS)) {
    let count = 0;
    for (let i = 0; i < n; i++) if (tiles[i].colour === c) count += w(i);
    if (count) { mult *= count + 1; chips?.push({ kind: c, count, mult: count + 1 }); }
  }
  let pu = 0, cu = 0, sq = 0;
  for (let i = 0; i < n; i++) {
    if (tiles[i].trim === 'purple') pu += w(i);
    if (tiles[i].material === 'cursed') cu += w(i);
    if (tiles[i].material === 'explosive') sq += w(i);
  }
  if (pu) { const m = 1 + pu * PURPLE_TRIM_STEP; mult *= m; chips?.push({ kind: 'purple', count: pu, mult: m }); }
  if (cu) { const m = CURSED_MULT ** cu; mult *= m; chips?.push({ kind: 'cursed', count: cu, mult: m }); }
  if (sq) { const m = EXPLOSIVE_MULT ** sq; mult *= m; chips?.push({ kind: 'explosive', count: sq, mult: m }); }
  mult = round3(mult);

  const toll = restCurses * CURSED_PENALTY;
  points -= toll;

  // The seat. A ×Mult folds into Points at once (scoring's pass 4), so a
  // patron's ruling is paid on the Points side of the readout.
  const before = points;
  let seat = null;
  if (T?.effect) {
    let pmult = 1;
    const said = full ? [] : null;
    T.effect({
      letters, tiles, pairs, has: T.has,
      addPoints(v) { points += v; said?.push({ points: v }); },
      addMult(v)   { pmult += v;  said?.push({ mult: v }); },
      xMult(v)     { pmult *= v; points = Math.round(points * pmult); pmult = 1; said?.push({ xmult: v }); },
    });
    points = Math.round(points * pmult);
    if (said?.length) seat = said;
  }

  // The desk.
  const plainMult = mult;
  let spiked = null;
  if (T?.judge) {
    spiked = T.judge(letters, tiles);
    if (spiked) { mult *= SPIKE_MULT; chips?.push({ kind: 'spike', mult: SPIKE_MULT }); }
    mult = round3(mult);
  }

  const total = Math.max(0, Math.round(points * mult));
  if (!full) return total;
  // What the readout shows. A seat's ×Mult folds into Points in the arithmetic,
  // but every patron the day can seat pays a whole-number ×Mult (or plain
  // Points), so it can stand among the stamps instead — Points before it, the
  // stamps after — and the sum on the sheet still comes out to the penny.
  let seatX = 1, seatPoints = 0;
  for (const st of seat ?? []) {
    if (st.points) seatPoints += st.points;
    if (st.xmult) seatX *= st.xmult;
    if (st.mult) seatX *= 1 + st.mult;
  }
  return {
    points, mult, total, chips, toll, before, seat, spiked, seatX, seatPoints,
    shownPoints: seatX === 1 ? points : before + seatPoints,
    shownMult: round3(mult * seatX),
    plainTotal: Math.max(0, Math.round(points * plainMult)),
    perTile: tiles.map((t, i) => ({
      id: t.id, points: contrib[i], nick: gain[i], bonus: bonus?.[i] ?? 0, echo: echo?.[i] ?? 1,
    })),
    scored: tiles, recasts, lit: lit ? { id: tiles[lit.at].id, colour: lit.colour } : null,
  };
}

// ─── The solver ───────────────────────────────────────────────────────────────
// For every word in the dictionary: can this case set it, and if so, what is it
// worth at its very best? "Best" ranges over everything the player controls —
// which tile fills which place (two E's are not the same E if one is painted),
// which face of a dual shows, which marks ride on the end, and where the day's
// tool goes. The ranking is only fair if the field it ranks you against was
// given every chance you were.
//
// It walks each word left to right, trying every unused tile whose face (or a
// ligature, or a medieval reading) matches what comes next. Tiles identical in
// every respect are tried once per step, not once each.

// A tile the day's tube offers is not the same as its twin that it doesn't.
const sigOf = t => [t.letter, t.letterType, t.altLetter, t.colour, t.trim, t.nick,
  t.material, t.bonusPoints ?? 0, t.altBonusPoints ?? 0, t.paintOffer ?? '', t.wrapped ? 'w' : ''].join('|');

// What a face can stand for in a word, in the order the game would try it.
function readsOf(letter) {
  if (MEDIEVAL[letter]) return MEDIEVAL[letter].reads;
  return [letter];
}

// `tables` are the day's compiled seatings (compileTable in daily/table.js):
// none on a plain day, one when a patron or an editor is seated, several when
// the reader chooses between patrons — every word is then priced under each.
export function prepareCase(tiles, item = null, tables = []) {
  // A sort barred under every table (the Turnkey's locks, when he is the only
  // seat) is in the case and in no word; one barred under some tables only is
  // walked, and priced under the others (bestFor).
  const everywhere = tables.length ? tables.reduce((m, T) => m & (T.bars ?? 0), ~0) : 0;
  // Identical sorts are tried once (the walk's `sig`), so a sort locked under
  // some table is no longer identical to its free twin: which tables bar it
  // joins its signature.
  const barSig = id => (tables.some(T => (T.bars ?? 0) & (1 << id))
    ? `|${tables.map(T => ((T.bars ?? 0) >> id) & 1).join('')}` : '');
  const prepared = tiles.filter(t => !(everywhere & (1 << t.id))).map(paper).map(t => {
    const faces = [0, ...(t.letterType === 'dual' && t.altLetter ? [1] : [])].map(v => {
      const L = faceLetter(t, v);
      return {
        v, L, reads: readsOf(L), medieval: !!MEDIEVAL[L],
        pts: restingOf(t, v), shiftable: item === 'ratchet' && !t.ephemeral && !t.counterfeit && !t.wrapped && shiftable(t, v),
        loupe: item === 'loupe' && !t.ephemeral && !t.counterfeit ? loupeDelta(t, v) : 0,
        tile: (t.activeVariant ?? 0) === v ? t : { ...t, activeVariant: v },
      };
    });
    return {
      t, faces, sig: sigOf(t) + barSig(t.id), blank: !!t.blank,
      mark: isMark(t.letter) ? t.letter : null,
      colour: t.colour ?? null, purple: t.trim === 'purple' ? 1 : 0,
      // The colour the day's tube would paint it, if it is one the tube offers.
      paint: item === 'tube' && t.paintOffer && !t.colour ? t.paintOffer : null,
      nick: t.nick === 'right' ? 1 : t.nick === 'left' ? -1 : 0,
      cursed: t.material === 'cursed' ? 1 : 0, squib: t.material === 'explosive' ? 1 : 0,
    };
  });
  // How many tiles could supply each letter, generously counted: a dual counts
  // for both its faces, a ligature or a medieval sort for every letter it could
  // stand for. Only ever an OVER-count, so a word it rules out is one no
  // arrangement could set — and most of the dictionary is ruled out here, in a
  // count, before the walk below is asked anything. A blank supplies nothing
  // here and is counted as slack instead, as the ratchet is.
  const supply = new Uint8Array(26);
  for (const p of prepared) {
    if (p.mark || p.blank) continue;
    const seen = new Set();
    for (const f of p.faces) for (const r of f.reads) for (const ch of r) seen.add(ch);
    for (const ch of seen) supply[ch.charCodeAt(0) - 65]++;
  }
  const blanks = prepared.filter(p => p.blank).length;
  return {
    tiles: prepared, item, supply, tables,
    slack: blanks + (item === 'ratchet' ? 1 : 0),
    letterTiles: prepared.filter(p => !p.mark),
    qTiles: prepared.filter(p => p.mark === '?'),
    eTiles: prepared.filter(p => p.mark === '!'),
    curses: prepared.reduce((a, p) => a + p.cursed, 0),
    // The longest word the case could possibly spell, to skip the rest unread.
    reach: prepared.reduce((a, p) => a + (p.blank ? 1
      : Math.max(0, ...p.faces.flatMap(f => (p.mark ? [0] : f.reads.map(r => r.length))))), 0),
  };
}

// Score a placement fast. `seq` is [{ p (prepared tile), pts, ... }] in word
// order; `len` the letters the measure counts. Mirrors scoreWord exactly.
// `extra` is the tool on one place: { at, delta } a loupe's growth, or
// { at, colour } a tube's paint.
function fastTotal(seq, len, cursesLeft, extra = null) {
  const n = seq.length;
  let base = 0;
  const own = new Array(n);
  for (let i = 0; i < n; i++) { own[i] = seq[i].pts + (extra && extra.at === i && extra.delta ? extra.delta : 0); base += own[i]; }
  let points = base;
  // Nick readings off prefix sums.
  let left = 0;
  for (let i = 0; i < n; i++) {
    const k = seq[i].p.nick;
    if (k === 1) points += base - left - own[i];
    else if (k === -1) points += left;
    left += own[i];
  }
  let mult = lengthMult(len);
  let cr = 0, az = 0, jd = 0, am = 0, pu = 0, cu = 0, sq = 0;
  for (let i = 0; i < n; i++) {
    const p = seq[i].p;
    const c = extra && extra.at === i && extra.colour ? extra.colour : p.colour;
    if (c === 'crimson') cr++; else if (c === 'azure') az++; else if (c === 'jade') jd++; else if (c === 'amber') am++;
    pu += p.purple; cu += p.cursed; sq += p.squib;
  }
  mult *= (cr + 1) * (az + 1) * (jd + 1) * (am + 1) * (1 + pu * PURPLE_TRIM_STEP)
        * CURSED_MULT ** cu * EXPLOSIVE_MULT ** sq;
  mult = Math.round(mult * 1000) / 1000;
  points -= (cursesLeft - cu) * CURSED_PENALTY;
  return Math.max(0, Math.round(points * mult));
}

// Every way to finish a set of letters with the marks left over: none, ?, !, ?!.
function tailsFor(cs, usedMask) {
  const free = list => {
    const seen = new Set(), out = [];
    for (const p of list) if (!(usedMask & (1 << p.t.id)) && !seen.has(p.sig)) { seen.add(p.sig); out.push(p); }
    return out;
  };
  const qs = free(cs.qTiles), es = free(cs.eTiles);
  const tails = [[]];
  for (const q of qs) tails.push([q]);
  for (const e of es) tails.push([e]);
  for (const q of qs) for (const e of es) tails.push([q, e]);
  return tails;
}

// Find the best way to set one dictionary word, or null if the case can't.
// `has` answers "is this a word" (for medieval readings, and The Mirror).
//
// Returns { score, plan: [{ id, face, letter? }], tool }, and on a seated day
// also `seat` (which table the best setting was under) and `scores` (the best
// under each table, in order; null under a table that bars every setting). A plan's `letter` is what a blank was set as.
export function bestFor(cs, word, has) {
  if (word.length > cs.reach) return null;
  // The count: letters the case cannot supply, beyond what a ratchet or a
  // blank could make up.
  {
    const need = new Uint8Array(26);
    let short = 0;
    for (let i = 0; i < word.length; i++) {
      const k = word.charCodeAt(i) - 65;
      if (++need[k] > cs.supply[k] && ++short > cs.slack) return null;
    }
  }
  const tables = cs.tables;
  const nT = tables.length;
  const tops = nT ? new Array(nT).fill(-1) : null;
  let best = null;
  const seq = [];
  const tiles = cs.letterTiles;

  // `at` is where a loupe or a tube was used in `full`, or -1.
  const offer = (total, full, ratchet, at, k) => {
    if (tops && total > tops[k]) tops[k] = total;
    if (!best || total > best.score) {
      best = {
        score: total,
        plan: full.map(s => (s.blankAs ? { id: s.p.t.id, face: 0, letter: s.blankAs } : { id: s.p.t.id, face: s.v })),
        tool: ratchet ? { kind: 'ratchet', id: ratchet.id, face: ratchet.face, offset: ratchet.offset }
            : at < 0 ? null
            : cs.item === 'loupe' ? { kind: 'loupe', id: full[at].p.t.id, face: full[at].v }
            : { kind: 'tube', id: full[at].p.t.id, colour: full[at].p.paint },
      };
      if (nT) best.seat = k;
    }
  };

  const leaf = (used, ratchet) => {
    // A medieval sort is read the way the game reads it: if this placement
    // would resolve to a DIFFERENT word, it belongs to that word, which the
    // solver reaches on its own turn.
    if (seq.some(s => s.medieval)) {
      const set = seq.map(s => s.glyph).join('');
      const opts = medievalExpansions(set);
      if (!opts) return;
      if ((opts.find(has) ?? opts[0]) !== word) return;
    }
    for (const tail of tailsFor(cs, used)) {
      const full = tail.length ? seq.concat(tail.map(p => ({ p, pts: p.faces[0].pts, v: 0, glyph: p.mark,
        tile: p.faces[0].tile, loupe: cs.item === 'loupe' ? p.faces[0].loupe : 0 }))) : seq;
      if (!nT) {
        let total = fastTotal(full, word.length, cs.curses);
        let at = -1;
        if (cs.item === 'loupe') {
          for (let i = 0; i < full.length; i++) {
            if (!full[i].loupe) continue;
            const t = fastTotal(full, word.length, cs.curses, { at: i, delta: full[i].loupe });
            if (t > total) { total = t; at = i; }
          }
        } else if (cs.item === 'tube') {
          for (let i = 0; i < full.length; i++) {
            if (!full[i].p.paint) continue;
            const t = fastTotal(full, word.length, cs.curses, { at: i, colour: full[i].p.paint });
            if (t > total) { total = t; at = i; }
          }
        }
        offer(total, full, ratchet, at, 0);
        continue;
      }
      // Seated: every table prices the same placement, through the game's
      // own passes (core), with the tool on each place it could go, or none.
      const word0 = full.map(s => s.tile);
      let inWord = 0;
      for (const s of full) inWord += s.p.cursed;
      const rest = cs.curses - inWord;
      const grown = [];
      if (cs.item === 'loupe') {
        for (let i = 0; i < full.length; i++) {
          if (!full[i].loupe) continue;
          const t = full[i].tile, v = full[i].v;
          const field = v === 1 ? 'altBonusPoints' : 'bonusPoints';
          const w = word0.slice();
          w[i] = { ...t, [field]: (t[field] ?? 0) + full[i].loupe };
          grown.push([i, w]);
        }
      } else if (cs.item === 'tube') {
        for (let i = 0; i < full.length; i++) {
          if (!full[i].p.paint) continue;
          const w = word0.slice();
          w[i] = { ...word0[i], colour: full[i].p.paint };
          grown.push([i, w]);
        }
      }
      let mask = used;
      for (const p of tail) mask |= 1 << p.t.id;
      for (let k = 0; k < nT; k++) {
        if (tables[k].bars & mask) continue;   // a sort this seat locks
        let total = core(word0, word, rest, tables[k], false);
        let at = -1;
        for (const [i, w] of grown) {
          const t = core(w, word, rest, tables[k], false);
          if (t > total) { total = t; at = i; }
        }
        offer(total, full, ratchet, at, k);
      }
    }
  };

  const walk = (pos, used, ratchet) => {
    if (pos === word.length) { leaf(used, ratchet); return; }
    const tried = new Set();
    for (const p of tiles) {
      const bit = 1 << p.t.id;
      if (used & bit) continue;
      if (p.blank) {
        // A blank is whatever single letter the word wants here, worth nothing.
        const ch = word[pos];
        const key = `${p.sig}/_${ch}`;
        if (!RING.includes(ch) || tried.has(key)) continue;
        tried.add(key);
        seq.push({ p, pts: 0, v: 0, glyph: ch, medieval: false, loupe: 0, blankAs: ch,
          tile: { ...p.t, letter: ch } });
        walk(pos + 1, used | bit, ratchet);
        seq.pop();
        continue;
      }
      for (const f of p.faces) {
        for (const r of f.reads) {
          if (!word.startsWith(r, pos)) continue;
          const key = `${p.sig}/${f.v}/${r}`;
          if (tried.has(key)) continue;
          tried.add(key);
          seq.push({ p, pts: f.pts, v: f.v, glyph: f.L, medieval: f.medieval, loupe: f.loupe, tile: f.tile });
          walk(pos + r.length, used | bit, ratchet);
          seq.pop();
        }
        // The ratchet: one face, one step either way, once a case.
        if (f.shiftable && !ratchet) {
          for (const off of [-1, 1]) {
            const to = ringStep(f.L, off);
            if (to !== word[pos]) continue;
            const key = `${p.sig}/${f.v}/~${off}`;
            if (tried.has(key)) continue;
            tried.add(key);
            const pts = f.pts - (TILE_POINTS[f.L] ?? 1) + (TILE_POINTS[to] ?? 1);
            const field = f.v === 1 ? 'altLetter' : 'letter';
            seq.push({ p, pts, v: f.v, glyph: to, medieval: false, loupe: 0,
              tile: { ...f.tile, [field]: to } });
            walk(pos + 1, used | bit, { id: p.t.id, face: f.v, offset: off });
            seq.pop();
          }
        }
      }
    }
  };
  walk(0, 0, null);
  // A table that could set the word no way (every setting uses a sort it
  // locks) scores it null.
  if (best && tops) best.scores = tops.map(x => (x < 0 ? null : x));
  return best;
}

// Solve the whole dictionary a few milliseconds at a time, so the page keeps
// answering taps while it works — the case is being counted while you compose,
// and the count is only needed when you print. `words` is the dictionary as an
// array; `has` its membership test.
// Resolves to { results: Map(word → { score, plan, tool }), scores: number[] desc }.
export async function solveCase(tiles, item, words, has, { budget = 12, onProgress, signal, tables = [] } = {}) {
  const cs = prepareCase(tiles, item, tables);
  const results = new Map();
  let j = 0;
  while (j < words.length) {
    const stop = performance.now() + budget;
    while (j < words.length && performance.now() < stop) {
      // Checked in runs of 200: reading the clock per word costs more than the word.
      const end = Math.min(words.length, j + 200);
      for (; j < end; j++) {
        const r = bestFor(cs, words[j], has);
        if (r) results.set(words[j], r);
      }
    }
    if (signal?.aborted) return null;
    onProgress?.(j / words.length);
    if (j < words.length) await new Promise(res => setTimeout(res, 0));
  }
  const scores = [...results.values()].map(r => r.score).sort((a, b) => b - a);
  return { results, scores };
}

// The synchronous form, for tools and tests.
export function solveCaseSync(tiles, item, words, has, tables = []) {
  const cs = prepareCase(tiles, item, tables);
  const results = new Map();
  for (const w of words) {
    const r = bestFor(cs, w, has);
    if (r) results.set(w, r);
  }
  const scores = [...results.values()].map(r => r.score).sort((a, b) => b - a);
  return { results, scores };
}

// ─── Two words ────────────────────────────────────────────────────────────────
// A two-word day sets two words from the one case, each scored on its own, and
// ranks their sum against every PAIR the case could set. So what a word is
// worth is no longer one number: it depends on which tiles it leaves for the
// other. Each word is solved for every set of tiles it could take (a bitmask
// of tile ids) and the best score each set allows; a pair is then the best sum
// over two sets that do not overlap.
//
// Identical tiles are NOT folded together here, as they are in bestFor: two
// plain E's are interchangeable within a word but not across two, since the
// second word may need the E the first one left. Two-word days carry no tool
// and no cursed iron (daily/deal.js), so a word's score is its own business.

// Every set of tiles that can spell `word`, each with the best it scores and
// how. Best first. [] if the case cannot set the word.
export function plansFor(cs, word, has) {
  if (word.length > cs.reach) return [];
  {
    const need = new Uint8Array(26);
    let short = 0;
    for (let i = 0; i < word.length; i++) {
      const k = word.charCodeAt(i) - 65;
      if (++need[k] > cs.supply[k] && ++short > cs.slack) return [];
    }
  }
  const byMask = new Map();
  const seq = [];
  const tiles = cs.letterTiles;
  const leaf = used => {
    if (seq.some(s => s.medieval)) {
      const opts = medievalExpansions(seq.map(s => s.glyph).join(''));
      if (!opts || (opts.find(has) ?? opts[0]) !== word) return;
    }
    const total = fastTotal(seq, word.length, cs.curses);
    const had = byMask.get(used);
    if (!had || total > had.score) {
      byMask.set(used, { mask: used, score: total, plan: seq.map(s => ({ id: s.p.t.id, face: s.v })) });
    }
  };
  const walk = (pos, used) => {
    if (pos === word.length) { leaf(used); return; }
    for (const p of tiles) {
      const bit = 1 << p.t.id;
      if (used & bit) continue;
      for (const f of p.faces) {
        for (const r of f.reads) {
          if (!word.startsWith(r, pos)) continue;
          seq.push({ p, pts: f.pts, v: f.v, glyph: f.L, medieval: f.medieval });
          walk(pos + r.length, used | bit);
          seq.pop();
        }
      }
    }
  };
  walk(0, 0);
  return [...byMask.values()].sort((a, b) => b.score - a.score);
}

// Solve every word's plans, a slice at a time. Resolves to
// { words: [{ word, plans, req, best }] best first }.
export async function solveWords(tiles, words, has, { budget = 12, signal, onProgress } = {}) {
  const cs = prepareCase(tiles, null);
  const out = [];
  let j = 0;
  while (j < words.length) {
    const stop = performance.now() + budget;
    while (j < words.length && performance.now() < stop) {
      const end = Math.min(words.length, j + 200);
      for (; j < end; j++) {
        const plans = plansFor(cs, words[j], has);
        if (!plans.length) continue;
        // The tiles every setting of the word needs: a pair that both need
        // one of them can never be set, whatever else is tried.
        let req = plans[0].mask;
        for (const q of plans) req &= q.mask;
        out.push({ word: words[j], plans, req, best: plans[0].score });
      }
    }
    if (signal?.aborted) return null;
    onProgress?.(j / words.length);
    if (j < words.length) await new Promise(res => setTimeout(res, 0));
  }
  out.sort((a, b) => b.best - a.best || (a.word < b.word ? -1 : 1));
  return { words: out };
}

// The best two words could do together, or -1 if no two settings fit side by
// side. Each word's plans are best first, so the search stops as soon as no
// later plan could beat what it has.
export function pairBest(A, B) {
  if (A.req & B.req) return { score: -1 };
  let best = -1, ia = -1, ib = -1;
  const pa = A.plans, pb = B.plans;
  for (let i = 0; i < pa.length; i++) {
    const a = pa[i];
    if (a.score + pb[0].score <= best) break;
    for (let k = 0; k < pb.length; k++) {
      if (a.mask & pb[k].mask) continue;
      if (a.score + pb[k].score > best) { best = a.score + pb[k].score; ia = i; ib = k; }
      break;
    }
  }
  return { score: best, a: ia, b: ib };
}

// Every pair of words the case could set — a word may be paired with itself
// where the case holds it twice — scored at its best, a slice at a time. The
// sums are kept in a typed array, unsorted until asked; the best few keep
// their settings for the slip, and the first pair to reach each score is
// remembered, so withScore(s) can name a pair worth s (the stepping stones
// between the best and yours).
export async function solvePairs(field, { budget = 12, signal, onProgress, keep = 12 } = {}) {
  const W = field.words;
  const N = W.length;
  let buf = new Int32Array(Math.min(1 << 20, Math.max(16, (N * (N + 1)) / 2)));
  let size = 0;
  const top = [];   // [{ score, i, j, a, b }] best first, at most `keep`
  const seen = new Map();   // score → { i, j, a, b }, the first pair to reach it
  let i = 0;
  while (i < N) {
    const stop = performance.now() + budget;
    for (; i < N && performance.now() < stop; i++) {
      const A = W[i];
      for (let j = i; j < N; j++) {
        const r = pairBest(A, W[j]);
        if (r.score < 0) continue;
        if (size === buf.length) { const b = new Int32Array(buf.length * 2); b.set(buf); buf = b; }
        buf[size++] = r.score;
        if (!seen.has(r.score)) seen.set(r.score, { i, j, a: r.a, b: r.b });
        if (top.length < keep || r.score > top[top.length - 1].score) {
          top.push({ score: r.score, i, j, a: r.a, b: r.b });
          top.sort((x, y) => y.score - x.score);
          if (top.length > keep) top.pop();
        }
      }
    }
    if (signal?.aborted) return null;
    onProgress?.(i / N);
    if (i < N) await new Promise(res => setTimeout(res, 0));
  }
  const scores = buf.slice(0, size).sort().reverse();   // best first
  const name = t => ({
    score: t.score,
    words: [W[t.i].word, W[t.j].word],
    plans: [W[t.i].plans[t.a].plan, W[t.j].plans[t.b].plan],
  });
  const withScore = score => { const t = seen.get(score); return t ? name({ score, ...t }) : null; };
  return { scores, top: top.map(name), withScore };
}

// ─── Ranking ──────────────────────────────────────────────────────────────────
// Your place is one more than the number of words that score strictly more than
// you did; "top X%" is that place over the size of the field. Ties go your way.
export function rankOf(score, scores) {
  // scores is descending: find the first index whose score is ≤ yours.
  let lo = 0, hi = scores.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (scores[mid] > score) lo = mid + 1; else hi = mid;
  }
  const rank = lo + 1;
  return { rank, field: scores.length, pct: (rank / Math.max(1, scores.length)) * 100 };
}

// The brackets a place is reported in: fine at the top, broad underneath.
export const BRACKETS = [0.1, 0.25, 0.5, 1, 2, 3, 5, 7.5, 10, 15, 20, 30, 40, 50, 65, 80, 100];
export const bracketOf = pct => BRACKETS.find(b => pct <= b + 1e-9) ?? 100;

export { LENGTH_MULT_MIN, LIGATURES };
