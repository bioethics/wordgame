import { TILE_POINTS, AURAS, colourSetBonus, REWARD, isDeadline } from './constants.js';
import { PATRON_DEFS, patronById } from './patrons.js';
import { state, owns, getActiveLetter } from './state.js';

// ─── Score a word ─────────────────────────────────────────────────────────────
// Pure (no state mutation). Returns a "script" describing every step of the
// score so the UI can replay it tile by tile:
//
// {
//   word, points, mult, total, coins,
//   tileSteps:   [{ id, points, coins, mult, notes[] }]     — one per tile, in order
//   auraSteps:   [{ sourceId, kind, hits: [{ id, delta }] }]
//   setSteps:    [{ colour, ids, count, bonus }]
//   patronSteps: [{ id, text, points?, mult?, xmult? }]
//   perTile:     Map(id → { final, parts[] })                — for tooltips
// }

export function computeScore(wordTiles) {
  if (!wordTiles?.length) return null;

  const word = wordTiles.map(t => getActiveLetter(t)).join('').toUpperCase();
  const n = wordTiles.length;

  // ── Pass 1: each tile's own Points (base × cast), plus coin/mult side effects ─
  const contrib   = [];
  const tileSteps = [];
  const noteMap   = wordTiles.map(() => []);
  let mult = 1;
  let coins = 0;

  wordTiles.forEach((t, i) => {
    const base = TILE_POINTS[getActiveLetter(t)] ?? t.basePoints ?? 1;
    let points = base;
    noteMap[i].push(`base ${base}`);

    if (t.cast === 'bold')   { points *= 2; noteMap[i].push('Bold ×2'); }
    if (t.cast === 'master') { points += 6; noteMap[i].push('Master +6'); }

    let stepCoins = 0, stepMult = 0;
    if (t.cast === 'gilded')   { stepCoins = owns('magpie') ? 2 : 1; coins += stepCoins; }
    if (t.cast === 'resonant') { stepMult = 1; mult += 1; }

    contrib[i] = points;
    tileSteps.push({ id: t.id, points, coins: stepCoins, mult: stepMult });
  });

  // ── Pass 2: auras double their targets (stacking multiplicatively) ──────────
  const auraSteps = [];
  wordTiles.forEach((t, i) => {
    if (!t.aura) return;
    const targets = [];
    if (t.aura === 'crescendo') for (let j = i + 1; j < n; j++) targets.push(j);
    if (t.aura === 'echo')      for (let j = 0; j < i; j++)     targets.push(j);
    if (t.aura === 'halo') {
      if (i > 0)     targets.push(i - 1);
      if (i < n - 1) targets.push(i + 1);
    }
    const hits = targets.map(j => {
      const delta = contrib[j];
      contrib[j] *= 2;
      noteMap[j].push(`×2 ${AURAS[t.aura].label}`);
      return { id: wordTiles[j].id, delta };
    }).filter(h => h.delta > 0);
    if (hits.length) auraSteps.push({ sourceId: t.id, kind: t.aura, hits });
  });

  let points = contrib.reduce((a, b) => a + b, 0);

  // ── Pass 3: colour set bonuses → add directly to Mult ──────────────────────
  const byColour = {};
  wordTiles.forEach(t => { if (t.colour) (byColour[t.colour] ??= []).push(t.id); });

  let bonusSum = 0;
  const setSteps = [];
  for (const [colour, ids] of Object.entries(byColour)) {
    const bonus = colourSetBonus(ids.length);
    if (bonus > 0) {
      setSteps.push({ colour, ids, count: ids.length, bonus });
      bonusSum += bonus;
    }
  }
  const chromed = bonusSum > 0 && owns('chromatist');
  if (chromed) bonusSum *= 2;
  mult += bonusSum;

  // ── Pass 4: patrons (in the order you seated them) ──────────────────────────
  const patronSteps = [];
  let current = null;
  const ctx = {
    word, tiles: wordTiles, state,
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
    word, points, mult, setBonus: bonusSum, chromed, total, coins,
    tileSteps, auraSteps, setSteps, patronSteps, perTile,
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
