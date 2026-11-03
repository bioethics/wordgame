// The Daily Proof's arithmetic: one word, scored the way the press scores it,
// and every OTHER word the case could have set, scored the same way, so the one
// you printed can be ranked against them.
//
// This is computeScore (js/scoring.js) with an empty table — no patrons, no
// editor, nothing primed, nothing washed — which leaves exactly the base game:
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
  medievalExpansions, lengthMult, LENGTH_MULT_MIN,
} from '../js/constants.js';

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
export const restingOf = (t, v = t.activeVariant) =>
  (TILE_POINTS[faceLetter(t, v)] ?? 1) + growthOf(t, v) + (t.trim === 'silver' ? SILVER_BONUS : 0);

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
    return t;
  });
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
// terms — which is where a curse takes its toll from.
export function scoreWord(wordTiles, rest, has) {
  if (!wordTiles.length) return null;
  const set = wordTiles.map(activeLetter).join('');
  const letters = readLetters(set, has) ?? set;
  const n = wordTiles.length;

  // Pass 1: each tile's own Points.
  const own = wordTiles.map(t => restingOf(t));
  // Pass 2: nicks read their side at resting value (with nothing at the table,
  // every tile's contribution IS its resting value, so the frozen list is own).
  const nickGain = wordTiles.map((t, i) => {
    let g = 0;
    if (t.nick === 'right') for (let j = i + 1; j < n; j++) g += own[j];
    if (t.nick === 'left')  for (let j = 0; j < i; j++)     g += own[j];
    return g;
  });
  const perTile = wordTiles.map((t, i) => ({ id: t.id, points: own[i] + nickGain[i], nick: nickGain[i] }));
  let points = perTile.reduce((a, p) => a + p.points, 0);

  // Pass 3: the multipliers, in the order the readout shows them.
  const chips = [];
  let mult = 1;
  const measure = lengthMult(letters.length);
  if (measure > 1) { chips.push({ kind: 'length', count: letters.length, mult: measure }); mult *= measure; }
  for (const c of Object.keys(COLOURS)) {
    const count = wordTiles.filter(t => t.colour === c).length;
    if (count) { chips.push({ kind: c, count, mult: count + 1 }); mult *= count + 1; }
  }
  const purples = wordTiles.filter(t => t.trim === 'purple').length;
  if (purples) {
    const m = 1 + purples * PURPLE_TRIM_STEP;
    chips.push({ kind: 'purple', count: purples, mult: m }); mult *= m;
  }
  const cursed = wordTiles.filter(t => t.material === 'cursed').length;
  if (cursed) { const m = CURSED_MULT ** cursed; chips.push({ kind: 'cursed', count: cursed, mult: m }); mult *= m; }
  const squibs = wordTiles.filter(t => t.material === 'explosive').length;
  if (squibs) { const m = EXPLOSIVE_MULT ** squibs; chips.push({ kind: 'explosive', count: squibs, mult: m }); mult *= m; }
  mult = Math.round(mult * 1000) / 1000;

  // Pass 3½: a curse left out of the word takes its due.
  const curses = rest.filter(t => t.material === 'cursed').length;
  const toll = curses * CURSED_PENALTY;
  points -= toll;

  const total = Math.max(0, Math.round(points * mult));
  return { set, letters, points, mult, total, chips, perTile, toll };
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

const sigOf = t => [t.letter, t.letterType, t.altLetter, t.colour, t.trim, t.nick,
  t.material, t.bonusPoints ?? 0, t.altBonusPoints ?? 0].join('|');

// What a face can stand for in a word, in the order the game would try it.
function readsOf(letter) {
  if (MEDIEVAL[letter]) return MEDIEVAL[letter].reads;
  return [letter];
}

export function prepareCase(tiles, item = null) {
  const prepared = tiles.map(t => {
    const faces = [0, ...(t.letterType === 'dual' && t.altLetter ? [1] : [])].map(v => {
      const L = faceLetter(t, v);
      return {
        v, L, reads: readsOf(L), medieval: !!MEDIEVAL[L],
        pts: restingOf(t, v), shiftable: item === 'ratchet' && shiftable(t, v),
        loupe: item === 'loupe' ? loupeDelta(t, v) : 0,
      };
    });
    return {
      t, faces, sig: sigOf(t),
      mark: isMark(t.letter) ? t.letter : null,
      colour: t.colour ?? null, purple: t.trim === 'purple' ? 1 : 0,
      nick: t.nick === 'right' ? 1 : t.nick === 'left' ? -1 : 0,
      cursed: t.material === 'cursed' ? 1 : 0, squib: t.material === 'explosive' ? 1 : 0,
    };
  });
  // How many tiles could supply each letter, generously counted: a dual counts
  // for both its faces, a ligature or a medieval sort for every letter it could
  // stand for. Only ever an OVER-count, so a word it rules out is one no
  // arrangement could set — and most of the dictionary is ruled out here, in a
  // count, before the walk below is asked anything.
  const supply = new Uint8Array(26);
  for (const p of prepared) {
    if (p.mark) continue;
    const seen = new Set();
    for (const f of p.faces) for (const r of f.reads) for (const ch of r) seen.add(ch);
    for (const ch of seen) supply[ch.charCodeAt(0) - 65]++;
  }
  return {
    tiles: prepared, item, supply,
    letterTiles: prepared.filter(p => !p.mark),
    qTiles: prepared.filter(p => p.mark === '?'),
    eTiles: prepared.filter(p => p.mark === '!'),
    curses: prepared.reduce((a, p) => a + p.cursed, 0),
    // The longest word the case could possibly spell, to skip the rest unread.
    reach: prepared.reduce((a, p) => a + Math.max(0, ...p.faces.flatMap(f => (p.mark ? [0] : f.reads.map(r => r.length)))), 0),
  };
}

// Score a placement fast. `seq` is [{ p (prepared tile), pts, ... }] in word
// order; `len` the letters the measure counts. Mirrors scoreWord exactly.
function fastTotal(seq, len, cursesLeft, extra = null) {
  const n = seq.length;
  let base = 0;
  const own = new Array(n);
  for (let i = 0; i < n; i++) { own[i] = seq[i].pts + (extra && extra.at === i ? extra.delta : 0); base += own[i]; }
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
    const c = p.colour;
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
// `has` answers "is this a word" (for medieval readings).
export function bestFor(cs, word, has) {
  if (word.length > cs.reach) return null;
  // The count: letters the case cannot supply, beyond the one a ratchet could
  // make by stepping a neighbour.
  {
    const need = new Uint8Array(26);
    let short = 0;
    for (let i = 0; i < word.length; i++) {
      const k = word.charCodeAt(i) - 65;
      if (++need[k] > cs.supply[k] && ++short > (cs.item === 'ratchet' ? 1 : 0)) return null;
    }
  }
  let best = null;
  const seq = [];
  const tiles = cs.letterTiles;

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
        loupe: cs.item === 'loupe' ? p.faces[0].loupe : 0 }))) : seq;
      let total = fastTotal(full, word.length, cs.curses);
      let loupeAt = -1;
      if (cs.item === 'loupe') {
        for (let i = 0; i < full.length; i++) {
          if (!full[i].loupe) continue;
          const t = fastTotal(full, word.length, cs.curses, { at: i, delta: full[i].loupe });
          if (t > total) { total = t; loupeAt = i; }
        }
      }
      if (!best || total > best.score) {
        best = {
          score: total,
          plan: full.map(s => ({ id: s.p.t.id, face: s.v })),
          tool: ratchet ? { kind: 'ratchet', id: ratchet.id, face: ratchet.face, offset: ratchet.offset }
              : loupeAt >= 0 ? { kind: 'loupe', id: full[loupeAt].p.t.id, face: full[loupeAt].v }
              : null,
        };
      }
    }
  };

  const walk = (pos, used, ratchet) => {
    if (pos === word.length) { leaf(used, ratchet); return; }
    const tried = new Set();
    for (const p of tiles) {
      const bit = 1 << p.t.id;
      if (used & bit) continue;
      for (const f of p.faces) {
        for (const r of f.reads) {
          if (!word.startsWith(r, pos)) continue;
          const key = `${p.sig}/${f.v}/${r}`;
          if (tried.has(key)) continue;
          tried.add(key);
          seq.push({ p, pts: f.pts, v: f.v, glyph: f.L, medieval: f.medieval, loupe: f.loupe });
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
            seq.push({ p, pts, v: f.v, glyph: to, medieval: false, loupe: 0 });
            walk(pos + 1, used | bit, { id: p.t.id, face: f.v, offset: off });
            seq.pop();
          }
        }
      }
    }
  };
  walk(0, 0, null);
  return best;
}

// Solve the whole dictionary a few milliseconds at a time, so the page keeps
// answering taps while it works — the case is being counted while you compose,
// and the count is only needed when you print. `words` is the dictionary as an
// array; `has` its membership test.
// Resolves to { results: Map(word → { score, plan, tool }), scores: number[] desc }.
export async function solveCase(tiles, item, words, has, { budget = 12, onProgress, signal } = {}) {
  const cs = prepareCase(tiles, item);
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
export function solveCaseSync(tiles, item, words, has) {
  const cs = prepareCase(tiles, item);
  const results = new Map();
  for (const w of words) {
    const r = bestFor(cs, w, has);
    if (r) results.set(w, r);
  }
  const scores = [...results.values()].map(r => r.score).sort((a, b) => b - a);
  return { results, scores };
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
