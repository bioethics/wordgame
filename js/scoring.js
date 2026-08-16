import {
  TILE_POINTS, TRIMS, NICKS, COLOURS, PURPLE_TRIM_STEP, REWARD, CURSED_MULT,
  CURSED_PENALTY, isDeadline, splitMarks,
} from './constants.js';
import { PATRON_DEFS, patronById } from './patrons.js';
import { state, owns, getActiveLetter, getActiveColour, returnsToBag } from './state.js';

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
    if (t.trim === 'cobalt') { stepRefresh = 1; refresh += 1; }

    contrib[i] = points;
    tileSteps.push({
      id: t.id, points, coins: stepCoins, refresh: stepRefresh,
      returns: returnsToBag(t),
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

  // ── Pass 2½: patrons whose chosen letters score again ─────────────────────
  // Each seated Monogrammist doubles what its three letters scored, trims and
  // nicks included. Copies fire in seat order and each doubles what it finds,
  // so two copies that love the same letter reach ×4 — the intended ceiling
  // of collecting them. Each copy's gain is its own patron step, keyed by the
  // seat's uid, so every copy badges and animates as itself.
  const patronSteps = [];
  for (const p of state.patrons) {
    const def = patronById(p.id);
    if (!def?.tileEcho) continue;
    let added = 0;
    wordTiles.forEach((t, i) => {
      if (!def.tileEcho(t, p.data ?? {})) return;
      added += contrib[i];
      contrib[i] *= 2;
      noteMap[i].push(`×2 № ${p.data?.num?.toLocaleString() ?? '?'}`);
    });
    if (added) patronSteps.push({ id: p.id, uid: p.uid, text: `+${added} Points`, points: added });
  }

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

  // Cursed metal multiplies alongside the colours, and stacks with itself —
  // two cursed tiles in one word is ×9. It rides the same steps as the colour
  // multipliers so it previews, animates and chips exactly like them.
  const cursedIds = wordTiles.filter(t => t.material === 'cursed').map(t => t.id);
  if (cursedIds.length) {
    const m = CURSED_MULT ** cursedIds.length;
    colourSteps.push({ colour: 'cursed', ids: cursedIds, count: cursedIds.length, mult: m });
    mult *= m;
  }
  mult = Math.round(mult * 1000) / 1000;   // keep half-steps off floating-point drift

  // ── Pass 4: patrons (in the order you seated them) ──────────────────────────
  // `data` is the seat's memory, handed over READ-ONLY: this runs on every
  // keystroke for the live preview, so a score effect that wrote to it would
  // fire dozens of times a word. Counters are advanced in onPrinted instead.
  // (patronSteps was declared back in pass 2½, where the Monogrammists fire.)
  let current = null;
  const ctx = {
    word: letters, tiles: wordTiles, state, data: null,
    addPoints(v) { points += v; patronSteps.push({ id: current, text: `+${v} Points`, points: v }); },
    addMult(v)   { mult += v;   patronSteps.push({ id: current, text: `+${v} Mult`,   mult: v }); },
    xMult(v)     { mult *= v;   patronSteps.push({ id: current, text: `×${v} Mult`,   xmult: v }); },
    addCoins(v)  {
      coins += v;
      patronSteps.push({ id: current, text: `+${v} Coin${v > 1 ? 's' : ''}`, coins: v });
    },
  };

  for (const p of state.patrons) {
    const def = patronById(p.id);
    if (def?.when === 'score') { current = p.id; ctx.data = p.data ?? {}; def.effect(ctx); }
  }

  // ── Pass 4¼: curses left in the hand ───────────────────────────────────────
  // A cursed tile you didn't set takes its due from the word you set instead —
  // once for each one still waiting in the rack. Points, not Mult, so it lands
  // before the multipliers and a press strong enough to clear 666 can shrug a
  // curse off; two is another matter. Since the tile can never be discarded,
  // this is what keeps it from stranding a hand: the words around it are worth
  // nothing (the total floors at zero, below) rather than impossible, so the
  // rack keeps turning over until the curse finds a word to sit in.
  const cursesInHand = state.rack.filter(t => t.material === 'cursed').length;
  if (cursesInHand) {
    const toll = cursesInHand * CURSED_PENALTY;
    points -= toll;
    patronSteps.push({
      id: 'cursed', text: `−${toll} Points — ${cursesInHand > 1 ? 'curses' : 'a curse'} left in hand`,
      points: -toll,
    });
  }

  // ── Pass 4½: the Alderman counts the guilds at his table ───────────────────
  // One ×1.5 for each guild represented on the shelf. Two things he does NOT
  // care about: whether those patrons fired on this word (they need not have),
  // and how many of them share a livery (a guild is counted once, so three
  // amber patrons pay as one). Four guilds is therefore his ceiling, ×5.06.
  // He speaks after everyone else, so what he multiplies is the whole score.
  if (owns('alderman')) {
    const guilds = new Set();
    for (const p of state.patrons) {
      const g = patronById(p.id)?.guild;
      if (g) guilds.add(g);
    }
    for (const g of guilds) {
      mult *= 1.5;
      patronSteps.push({
        id: 'alderman', text: `×1.5 Mult — the ${COLOURS[g].label} guild`, xmult: 1.5,
      });
    }
    if (guilds.size) mult = Math.round(mult * 1000) / 1000;
  }

  // Floored at nothing. Only a curse left in the hand can drive Points below
  // zero, and a word that scores *negative* would eat the page you'd already
  // built — which is the trap the curse's toll exists to open, not to spring.
  // At zero you can keep setting words to turn the rack over until the curse
  // finds a home; the page simply doesn't advance while you do.
  const total = Math.max(0, Math.round(points * mult));

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
