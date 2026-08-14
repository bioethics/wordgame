import { TILE_POINTS, TRIMS, NICKS, COLOURS, PURPLE_TRIM_STEP, REWARD, isDeadline, splitMarks } from './constants.js';
import { PATRON_DEFS, patronById } from './patrons.js';
import { state, owns, getActiveLetter, getActiveColour } from './state.js';

// ─── Score a word ─────────────────────────────────────────────────────────────
// Pure (no state mutation). Returns a "script" describing every step of the
// score so the UI can replay it tile by tile:
//
// {
//   word, points, mult, total, coins, refresh,
//   tileSteps:   [{ id, points, coins, refresh, returns }]  — one per tile, in order
//   nickSteps:   [{ sourceId, kind, mult, hits: [{ id, delta }] }]
//   nickAffected: Map(id → mult)                             — for the live preview
//   colourSteps: [{ colour, ids, count, mult }]              — incl. 'purple' (trim)
//   patronSteps: [{ id, text, points?, mult?, xmult? }]
//   perTile:     Map(id → { final, parts[] })                — for tooltips
// }
//
// score = Points × Mult, where Mult is the product of the colour multipliers:
// each colour starts ×1 and every painted letter of that colour adds +1.
// Purple trims raise a fifth multiplier in half-steps (+0.5 each).

export function computeScore(wordTiles) {
  if (!wordTiles?.length) return null;

  // `word` is what gets printed, marks and all — the ledger and the manuscript
  // want to see HELLO!. Patrons are handed the letters alone, so a trailing
  // mark can't make a 3-letter word read as four or spoil a palindrome.
  const word = wordTiles.map(t => getActiveLetter(t)).join('').toUpperCase();
  const letters = splitMarks(word)?.letters ?? word;
  const n = wordTiles.length;

  // ── Pass 1: each tile's own Points, plus trim side effects ─────────────────
  const contrib   = [];
  const tileSteps = [];
  const noteMap   = wordTiles.map(() => []);
  let coins = 0;
  let refresh = 0;

  wordTiles.forEach((t, i) => {
    const face  = TILE_POINTS[getActiveLetter(t)] ?? t.basePoints ?? 1;
    const grown = t.bonusPoints ?? 0;
    let points = face + grown;
    noteMap[i].push(`base ${face}`);
    if (grown) noteMap[i].push(`grown +${grown}`);

    if (t.trim === 'silver') { points += 6; noteMap[i].push('Silver +6'); }

    let stepCoins = 0, stepRefresh = 0;
    if (t.trim === 'gold')   { stepCoins = owns('magpie') ? 2 : 1; coins += stepCoins; }
    if (t.trim === 'copper') { stepRefresh = 1; refresh += 1; }

    contrib[i] = points;
    tileSteps.push({
      id: t.id, points, coins: stepCoins, refresh: stepRefresh,
      returns: t.trim === 'mercury',
    });
  });

  // ── Pass 2: nicks multiply their targets ──────────────────────────────────
  // Nicks don't stack. Each letter is multiplied at most once no matter how
  // many nicks point at it; earlier tiles in the word claim their targets
  // first, so a second nick covering the same ground simply does nothing.
  const nickSteps = [];
  const nickAffected = new Map();
  const claimed = new Set();
  wordTiles.forEach((t, i) => {
    if (!t.nick) return;
    const targets = [];
    if (t.nick === 'right') for (let j = i + 1; j < n; j++) targets.push(j);
    if (t.nick === 'left')  for (let j = 0; j < i; j++)     targets.push(j);

    const m = NICKS[t.nick]?.mult ?? 1;
    const hits = [];
    for (const j of targets) {
      if (claimed.has(j)) continue;
      claimed.add(j);
      const delta = contrib[j] * (m - 1);
      contrib[j] *= m;
      noteMap[j].push(`×${m} nick`);
      nickAffected.set(wordTiles[j].id, m);
      if (delta > 0) hits.push({ id: wordTiles[j].id, delta });
    }
    if (hits.length) nickSteps.push({ sourceId: t.id, kind: t.nick, mult: m, hits });
  });

  let points = contrib.reduce((a, b) => a + b, 0);

  // ── Pass 3: colour multipliers (painted letters, then purple trims) ────────
  const byColour = {};
  const purpleIds = [];
  wordTiles.forEach(t => {
    const c = getActiveColour(t);
    if (c) (byColour[c] ??= []).push(t.id);
    if (t.trim === 'purple') purpleIds.push(t.id);
  });

  let mult = 1;
  const colourSteps = [];
  for (const colour of Object.keys(COLOURS)) {
    const ids = byColour[colour];
    if (!ids?.length) continue;
    const m = ids.length + 1;
    colourSteps.push({ colour, ids, count: ids.length, mult: m });
    mult *= m;
  }
  if (purpleIds.length) {
    const m = 1 + purpleIds.length * PURPLE_TRIM_STEP;
    colourSteps.push({ colour: 'purple', ids: purpleIds, count: purpleIds.length, mult: m });
    mult *= m;
  }
  mult = Math.round(mult * 1000) / 1000;   // keep half-steps off floating-point drift

  // ── Pass 4: patrons (in the order you seated them) ──────────────────────────
  const patronSteps = [];
  let current = null;
  const ctx = {
    word: letters, tiles: wordTiles, state,
    addPoints(v) { points += v; patronSteps.push({ id: current, text: `+${v} Points`, points: v }); },
    addMult(v)   { mult += v;   patronSteps.push({ id: current, text: `+${v} Mult`,   mult: v }); },
    xMult(v)     { mult *= v;   patronSteps.push({ id: current, text: `×${v} Mult`,   xmult: v }); },
  };

  if (state.scavengerPoints > 0 && owns('scavenger')) {
    points += state.scavengerPoints;
    patronSteps.push({ id: 'scavenger', text: `+${state.scavengerPoints} Points`, points: state.scavengerPoints });
  }

  for (const p of state.patrons) {
    const def = patronById(p.id);
    if (def?.when === 'score') { current = p.id; def.effect(ctx); }
  }

  const total = Math.round(points * mult);

  // ── Per-tile breakdown for tooltips ─────────────────────────────────────────
  const perTile = new Map();
  wordTiles.forEach((t, i) => {
    perTile.set(t.id, { final: contrib[i], parts: noteMap[i] });
  });

  return {
    word, points, mult, total, coins, refresh,
    tileSteps, nickSteps, nickAffected, colourSteps, patronSteps, perTile,
  };
}

// ─── Page reward breakdown ────────────────────────────────────────────────────

export function computeReward() {
  const parts = [{ label: 'Page completed', coins: REWARD.base }];

  if (state.wordsLeft > 0) {
    parts.push({ label: `${state.wordsLeft} word${state.wordsLeft > 1 ? 's' : ''} to spare`,
                 coins: state.wordsLeft * REWARD.perSpareWord });
  }
  if (isDeadline(state.page)) {
    parts.push({ label: 'Deadline met', coins: REWARD.finaleBonus });
  }
  const interest = Math.min(REWARD.interestCap, Math.floor(state.coins / REWARD.interestPer));
  if (interest > 0) {
    parts.push({ label: 'Interest on savings', coins: interest });
  }
  if (owns('banker')) {
    parts.push({ label: 'The Banker', coins: 2 });
  }

  return { parts, total: parts.reduce((a, p) => a + p.coins, 0) };
}

// All patrons, for reference screens
export { PATRON_DEFS };
