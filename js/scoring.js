import {
  TILE_POINTS, TRIMS, NICKS, COLOURS, PURPLE_TRIM_STEP, REWARD, CURSED_MULT,
  CURSED_PENALTY, SPIKE_MULT, SILVER_BONUS, isDeadline, splitMarks,
  HONORIFIC_STEP, FLEURON, FLEURON_PAGE_COIN, lengthMult, POSTNOM,
} from './constants.js';
import {
  PATRON_DEFS, patronById, guildsOf, guildSeats, resolveMedieval,
} from './patrons.js';
import { bossById } from './bosses.js';
import {
  state, owns, allSeats, getActiveLetter, getActiveColour, getActiveGrowth,
  returnsToBag, isWrapped,
} from './state.js';

// ─── Score a word ─────────────────────────────────────────────────────────────
// Pure (no state mutation): a patron that paints a tile (pass ½) paints a COPY
// of the word, and only its onPrinted makes the colour permanent. Returns a
// "script" of every step, so the UI can replay the score tile by tile:
//
// {
//   word, letters, points, mult, total, coins, refresh, spiked
//     — `word` is what PRINTS (glyphs and marks); `letters` is what the table
//       READ (medieval sorts resolved, marks stripped), which is what the
//       patrons, the editors and the measure all judged.
//   tileSteps:      [{ id, points, coins, refresh, returns }] — one per tile, in order
//   tilePaintSteps: [{ id, uid, emoji, text, hits: [{ id, colour }] }]
//   tilePaint:      Map(id → colour) — the same paint, for the live preview
//   tileBoostSteps: [{ id, uid, emoji, points, hits: [{ id, delta }] }]
//   tileGrowth:     Set(id) — tiles whose boost is permanent growth
//   nickSteps:      [{ sourceId, kind, mult, hits: [{ id, delta }] }]
//   nickAffected:   Map(id → mult) — for the live preview
//   colourSteps:    [{ colour, ids, count, mult }] — incl. 'length', 'purple', 'cursed'
//   patronSteps:    [{ id, uid, text, points?, mult?, xmult?, running? }]
//   perTile:        Map(id → { final, parts[] }) — for tooltips
// }
//
// score = Points × Mult. Mult is the product of the colour multipliers: each
// colour starts ×1 and every painted letter of it adds +1; purple trims raise a
// fifth multiplier in half-steps. Points is a RUNNING figure once the patrons
// are done (pass 4), so `running` on a step is what the readout should show at
// that moment in the print.

// Who armed a primed bonus, for the readout. Patrons answer for themselves;
// the tongs are a tool and have their own line.
const primedLabel = source =>
  (source === 'tongs' ? "the tongs' due" : patronById(source)?.name ?? 'primed');

export function computeScore(wordTiles) {
  if (!wordTiles?.length) return null;

  // `word` is what gets printed, marks and all; patrons are handed the letters
  // alone, so a trailing mark can't make a 3-letter word read as four.
  const word = wordTiles.map(t => getActiveLetter(t)).join('').toUpperCase();
  // What the table READS: a medieval sort prints and scores as itself but
  // stands for ordinary letters everywhere else (þORN is judged and paid as
  // THORN). main.js resolves the same way at the dictionary check, so the
  // preview can't promise a reading the print then refuses.
  const letters = resolveMedieval(splitMarks(word)?.letters ?? word);
  const n = wordTiles.length;

  // ── Pass 0: the wrapper ────────────────────────────────────────────────────
  // A tile The Redactor has wrapped (js/bosses.js) keeps its letter and loses
  // everything else — on a copy, since scoring never mutates. Face value is
  // looked up from the letter, not the tile, so pass 1 zeroes it separately.
  // `wrapped` rides along, keeping getActiveGrowth and isImmutable correct.
  if (wordTiles.some(isWrapped)) {
    wordTiles = wordTiles.map(t => (isWrapped(t)
      ? { ...t, colour: null, wash: null, trim: null, nick: null, material: null }
      : t));
  }

  // ── Pass ½: the brush, before a single thing is counted ────────────────────
  // Patrons who PAINT a tile rather than pay it go first of all, because paint
  // is not a bonus laid on top of the count — it is part of what is counted.
  // From here down `wordTiles` IS the painted word: the colour multipliers,
  // tile bonuses and patron effects below all read it. It lands on a copy, so
  // the collection is untouched until the word prints. Seats speak in order,
  // and a tile already claimed can't be repainted — first brush wins.
  const tilePaintSteps = [];
  const tilePaint = new Map();   // tile id → colour, for this word only
  for (const p of allSeats()) {
    const def = patronById(p.id);
    if (!def?.tilePaint) continue;
    const laid = def.tilePaint({ tiles: wordTiles, state, data: p.data ?? {} }) || [];
    const hits = [];
    for (const { tile, colour } of laid) {
      if (!tile || !COLOURS[colour] || tilePaint.has(tile.id)) continue;
      tilePaint.set(tile.id, colour);
      hits.push({ id: tile.id, colour });
    }
    if (!hits.length) continue;
    wordTiles = wordTiles.map(t =>
      tilePaint.has(t.id) ? { ...t, colour: tilePaint.get(t.id) } : t);
    tilePaintSteps.push({
      id: p.id, uid: p.uid, emoji: def.emoji, hits,
      text: hits.length > 1
        ? `${hits.length} tiles painted`
        : `${COLOURS[hits[0].colour].label} — onto the tile`,
    });
  }

  // ── Pass 0: which tiles print twice ────────────────────────────────────────
  // An echoing patron doesn't just double what its letters are worth — the
  // whole tile prints again: gold pays a second Coin, cobalt buys a second
  // refresh, paint, purple and cursed all count twice. `echo[i]` is how many
  // times tile i counts, doubling per matching seat. The one thing an echo
  // can't repeat is the nick: nicks don't stack, so a second reading finds
  // every target already claimed.
  const echoSeats = allSeats().filter(p => patronById(p.id)?.tileEcho);
  const echo = wordTiles.map(t => echoSeats.reduce(
    (n, p) => patronById(p.id).tileEcho(t, p.data ?? {}, wordTiles) ? n * 2 : n, 1));

  // ── Pass 1: each tile's own Points, plus trim side effects ─────────────────
  const contrib   = [];
  const tileSteps = [];
  const noteMap   = wordTiles.map(() => []);
  let coins = 0;
  let refresh = 0;

  wordTiles.forEach((t, i) => {
    // Zeroed here because pass 0's stripping can't reach the face value.
    const face  = isWrapped(t) ? 0 : TILE_POINTS[getActiveLetter(t)] ?? t.basePoints ?? 1;
    const grown = getActiveGrowth(t);   // growth follows the showing face
    let points = face + grown;
    noteMap[i].push(isWrapped(t) ? 'in manuscript — no Points' : `base ${face}`);
    if (grown) noteMap[i].push(`grown +${grown}`);

    if (t.trim === 'silver') { points += SILVER_BONUS; noteMap[i].push(`Silver +${SILVER_BONUS}`); }

    // An echoed tile pays its trim once per printing.
    let stepCoins = 0, stepRefresh = 0;
    if (t.trim === 'gold')   { stepCoins = echo[i]; coins += stepCoins; }
    if (t.trim === 'cobalt') { stepRefresh = echo[i]; refresh += stepRefresh; }

    contrib[i] = points;
    tileSteps.push({
      id: t.id, points, coins: stepCoins, refresh: stepRefresh,
      returns: returnsToBag(t),
    });
  });

  // ── Pass 1½: patrons that write Points onto the tiles ─────────────────────
  // Every patron whose promise reads "such-and-such tiles gain +N Points" pays
  // HERE, onto the tile, before the word is scored — not as a lump sum at the
  // end. Two things follow, both the point of the pass: the number is in
  // perTile as you compose, so the corner figure the groove shows is the true
  // one; and the nicks and echoes below multiply it, as "+4 to the tile"
  // implies. Seats speak in seat order, each recording its own step.
  //
  // A patron whose bonus IS permanent growth (`bonusIsGrowth`) names the tiles
  // it grows here, so the groove can wear those numbers in jade rather than
  // brass — renderWord in js/render.js, tile-pts--growing in the CSS.
  const tileBoostSteps = [];
  const tileGrowth = new Set();
  for (const p of allSeats()) {
    const def = patronById(p.id);
    if (!def?.tileBonus) continue;
    const bctx = { tiles: wordTiles, state, data: p.data ?? {} };
    const hits = [];
    let added = 0;
    wordTiles.forEach((t, i) => {
      const v = def.tileBonus(t, bctx) || 0;
      if (!v) return;
      contrib[i] += v;
      added += v;
      noteMap[i].push(`${def.emoji} +${v}${def.bonusIsGrowth ? ' — for good' : ''}`);
      hits.push({ id: t.id, delta: v });
      if (def.bonusIsGrowth) tileGrowth.add(t.id);
    });
    if (hits.length) {
      tileBoostSteps.push({
        id: p.id, uid: p.uid, emoji: def.emoji, hits, points: added,
        text: `+${added} Points — onto the tiles`,
      });
    }
  }
  tileSteps.forEach((step, i) => { step.points = contrib[i]; });

  // ── Pass 2: nicks multiply their targets ──────────────────────────────────
  // Nicks don't stack: each letter is multiplied at most once however many
  // nicks point at it. Earlier tiles claim their targets first, so a second
  // nick covering the same ground does nothing.
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
  // The Points half of the echo: each seat doubles what it finds, the same
  // ×2-per-seat that pass 0 wrote into `echo`. Each seat's gain is its own
  // step, keyed by uid, so stacked copies badge and animate separately.
  const patronSteps = [];
  for (const p of allSeats()) {
    const def = patronById(p.id);
    if (!def?.tileEcho) continue;
    // A Monogrammist signs with its edition number, everyone else with emoji.
    const mark = p.data?.num ? `№ ${p.data.num.toLocaleString()}` : def.emoji;
    let added = 0;
    wordTiles.forEach((t, i) => {
      if (!def.tileEcho(t, p.data ?? {}, wordTiles)) return;
      added += contrib[i];
      contrib[i] *= 2;
      noteMap[i].push(`×2 ${mark}`);
    });
    if (added) patronSteps.push({ id: p.id, uid: p.uid, text: `+${added} Points`, points: added });
  }

  let points = contrib.reduce((a, b) => a + b, 0);

  // Those steps were pushed before there was a total to measure them against.
  // Their deltas are already inside `points`, so counting back from it gives
  // each one the running figure every later step carries.
  {
    let run = points - patronSteps.reduce((a, st) => a + (st.points ?? 0), 0);
    for (const st of patronSteps) { run += st.points ?? 0; st.running = Math.round(run); }
  }

  // ── Pass 3: colour multipliers (painted letters, then purple trims) ────────
  // Each entry carries the tile's echo as its weight, so an echoed jade letter
  // counts as two. `ids` stays one id per tile (it drives the animation);
  // `count` is what the multiplier is actually built from.
  const byColour = {};
  const purples  = [];
  const cursed   = [];
  wordTiles.forEach((t, i) => {
    const entry = { id: t.id, weight: echo[i] };
    const c = getActiveColour(t);
    if (c) (byColour[c] ??= []).push(entry);
    if (t.trim === 'purple')      purples.push(entry);
    if (t.material === 'cursed')  cursed.push(entry);
  });
  const weigh = list => list.reduce((n, e) => n + e.weight, 0);
  const idsOf = list => list.map(e => e.id);

  let mult = 1;
  const colourSteps = [];

  // The measure speaks first: the word's own length, the one multiplier a press
  // owns before buying anything. Letters, not tiles — an ING ligature is three
  // letters of measure. It rides the colour steps so it previews like them.
  const measure = lengthMult(letters.length);
  if (measure > 1) {
    colourSteps.push({
      colour: 'length', ids: wordTiles.map(t => t.id),
      count: letters.length, mult: measure,
    });
    mult *= measure;
  }

  for (const colour of Object.keys(COLOURS)) {
    const list = byColour[colour];
    if (!list?.length) continue;
    const count = weigh(list);
    const m = count + 1;
    colourSteps.push({ colour, ids: idsOf(list), count, mult: m });
    mult *= m;
  }
  if (purples.length) {
    const count = weigh(purples);
    const m = 1 + count * PURPLE_TRIM_STEP;
    colourSteps.push({ colour: 'purple', ids: idsOf(purples), count, mult: m });
    mult *= m;
  }

  // Cursed metal multiplies alongside the colours and stacks with itself: two
  // cursed tiles in one word is ×9.
  if (cursed.length) {
    const count = weigh(cursed);
    const m = CURSED_MULT ** count;
    colourSteps.push({ colour: 'cursed', ids: idsOf(cursed), count, mult: m });
    mult *= m;
  }
  mult = Math.round(mult * 1000) / 1000;   // keep half-steps off floating-point drift

  // ── Pass 3½: what the hand itself brings to the word ───────────────────────
  // Both land BEFORE the patrons speak: the patron pass below is sequential, so
  // anything a ×Mult seat should multiply must be on the table first.

  // Points armed against this word before it was set — a tile fed to the tongs,
  // a discard the Winnower approved of. Read here so the preview shows them,
  // cleared when the word commits; this runs on every keystroke. The step is
  // credited to whoever armed it, so a patron's own card badges its share.
  for (const [source, armed] of Object.entries(state.primed ?? {})) {
    if (!armed) continue;
    points += armed;
    patronSteps.push({
      id: source, text: `+${armed} Points — ${primedLabel(source)}`,
      points: armed, running: Math.round(points),
    });
  }

  // A cursed tile you didn't set takes its due from the word you set instead,
  // once per curse still in the rack. Points, not Mult, so it lands before the
  // multipliers. The tile can never be discarded, so the floor at zero (below)
  // is what stops it stranding a hand: words around it go worth-nothing rather
  // than impossible, and the rack keeps turning over.
  const cursesInHand = state.rack.filter(t => t.material === 'cursed').length;
  if (cursesInHand) {
    const toll = cursesInHand * CURSED_PENALTY;
    points -= toll;
    patronSteps.push({
      id: 'cursed', text: `−${toll} Points — ${cursesInHand > 1 ? 'curses' : 'a curse'} left in hand`,
      points: -toll, running: Math.round(points),
    });
  }

  // ── Pass 4: patrons, in the order you seated them ──────────────────────────
  // The rule fits on a card: A ×MULT MULTIPLIES EVERYTHING THE TABLE HAS SAID
  // IN FRONT OF IT, AND NOTHING BEHIND IT. Adding seats are worth more early,
  // multiplying seats more late, so ordering the shelf is a real decision
  // (reorderPatrons in state.js).
  //
  // Two registers carry it: `points` is the running score, `pmult` the Mult
  // added since the last multiplication. Points and +Mult accumulate together
  // between multiplications, so those two commute; a ×Mult folds `pmult` into
  // `points` and starts again from a clean slate. The colour multipliers stay
  // out of it — the word's own arithmetic, applied to the finished figure.
  //
  // `data` is the seat's memory, READ-ONLY here: this runs on every keystroke
  // for the preview, so a score effect that wrote to it would fire dozens of
  // times a word. Counters are advanced in onPrinted instead.
  let current = null, currentUid = null;
  let pmult = 1;
  const fold = () => { points = Math.round(points * pmult); pmult = 1; };
  const step = (extra) => patronSteps.push({
    id: current, uid: currentUid, ...extra,
    running: Math.round(points * pmult),
  });
  const ctx = {
    word: letters, tiles: wordTiles, state, data: null,
    addPoints(v) { points += v;                step({ text: `+${v} Points`, points: v }); },
    addMult(v)   { pmult += v;                 step({ text: `+${v} Mult`,   mult: v }); },
    xMult(v)     { pmult *= v; fold();         step({ text: `×${v} Mult`,   xmult: v }); },
    addCoins(v)  {
      coins += v;
      step({ text: `+${v} Coin${v > 1 ? 's' : ''}`, coins: v });
    },
  };

  for (const p of allSeats()) {
    const def = patronById(p.id);
    current = p.id;
    currentUid = p.uid ?? null;
    if (def?.when === 'score' && def.effect) { ctx.data = p.data ?? {}; def.effect(ctx); }

    // A laurel speaks with the head that wears it, not after the whole table,
    // so crowning a seat in front of your multipliers is worth more. The count
    // is written when the laurel lands (main.js), never during scoring.
    const laurels = p.data?.honorifics ?? 0;
    if (laurels) {
      const v = laurels * HONORIFIC_STEP;
      points += v;
      step({
        text: `+${v} Points — ${laurels > 1 ? `${laurels} laurels` : 'the laurel'}`,
        points: v, laurel: true,
      });
    }

    // Postnominals speak last at this seat, so the ×1.2 multiplies what the
    // seat itself just said — effect and laurels both — as well as the table
    // in front of it.
    if (p.data?.postnom) {
      pmult *= POSTNOM.mult;
      fold();
      step({ text: `×${POSTNOM.mult} Mult — ${p.data.postnom}`, xmult: POSTNOM.mult, postnom: true });
    }
  }
  fold();   // any Mult still pending when the last seat sits down
  current = null;
  currentUid = null;

  // ── Pass 4½: the Alderman counts the guilds at his table ───────────────────
  // One ×1.5 per guild represented on the shelf. Whether those patrons fired on
  // this word doesn't matter, and a guild counts once however many wear its
  // livery. He speaks after everyone else, so he multiplies the whole score.
  if (owns('alderman')) {
    // guildsOf, not .guild: a dual-livery patron flies two flags from one seat.
    const guilds = new Set();
    for (const p of allSeats()) {
      for (const g of guildsOf(patronById(p.id))) guilds.add(g);
    }
    for (const g of guilds) {
      mult *= 1.5;
      patronSteps.push({
        id: 'alderman', text: `×1.5 Mult — the ${COLOURS[g].label} guild`, xmult: 1.5,
      });
    }
    if (guilds.size) mult = Math.round(mult * 1000) / 1000;
  }

  // ── Pass 4¾: the Editor at the Deadline (see js/bosses.js) ─────────────────
  // Two things, in order: the Reviewer's temper multiplies every word, spiked
  // or not; then the seated editor judges, and a break is spiked at ×SPIKE_MULT
  // as a visible step, so preview and print agree. judge() gets the PRE-spike
  // total, so the Escalationist's bar measures what a word was really worth.
  let spiked = false;
  if (state.boss) {
    const def = bossById(state.boss.id);
    const data = state.boss.data ?? {};
    const temper = def?.mood?.(data);
    if (temper != null && temper !== 1) {
      mult *= temper;
      patronSteps.push({
        id: 'boss', text: `×${temper} Mult — the ${def.name.replace(/^The /, '')}'s temper`, xmult: temper,
      });
    }
    const preTotal = Math.max(0, Math.round(points * mult));
    const reason = def?.judge?.(letters, wordTiles, data, preTotal);
    if (reason) {
      spiked = true;
      mult *= SPIKE_MULT;
      patronSteps.push({
        id: 'boss', spiked: true, xmult: SPIKE_MULT,
        text: `Spiked — ${reason}. ×${SPIKE_MULT} Mult`,
      });
    }
    mult = Math.round(mult * 1000) / 1000;
  }

  // Floored at nothing: only a curse left in hand can drive Points below zero,
  // and a negative word would eat the page you'd already built.
  const total = Math.max(0, Math.round(points * mult));

  // ── Per-tile breakdown for tooltips ─────────────────────────────────────────
  const perTile = new Map();
  wordTiles.forEach((t, i) => {
    perTile.set(t.id, { final: contrib[i], parts: noteMap[i] });
  });

  return {
    word, letters, points, mult, total, coins, refresh, spiked,
    tileSteps, tilePaintSteps, tilePaint, tileBoostSteps, tileGrowth, nickSteps, nickAffected,
    colourSteps, patronSteps, perTile,
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
  // Overset: one Coin per half-quota of overshoot (150% pays 1, 200% pays 2),
  // capped like interest so a press scoring into the thousands can't mint money.
  const overset = Math.min(REWARD.oversetCap,
    Math.floor((state.pageScore / state.quota - 1) / REWARD.oversetPer));
  if (overset > 0) {
    parts.push({
      label: `Overset — ${Math.round(100 * state.pageScore / state.quota)}% of quota`,
      coins: overset,
    });
  }
  const interest = Math.min(REWARD.interestCap, Math.floor(state.coins / REWARD.interestPer));
  if (interest > 0) {
    parts.push({ label: 'Interest on savings', coins: interest });
  }
  if (owns('banker')) {
    // +1 Coin per amber patron seated, the Banker counting himself.
    parts.push({ label: 'The Banker', coins: guildSeats('amber') });
  }

  // A coin per fleuron owned, every page, wherever it sits. Unconditional by
  // design: the tile's drawback is the hand it clogs, not the coin it misses.
  const fleurons = state.collection.filter(t => t.letter === FLEURON).length;
  if (fleurons > 0) {
    parts.push({
      label: fleurons > 1 ? `${FLEURON} ${fleurons} fleurons` : `${FLEURON} The fleuron`,
      coins: fleurons * FLEURON_PAGE_COIN,
    });
  }

  return { parts, total: parts.reduce((a, p) => a + p.coins, 0) };
}

// All patrons, for reference screens
export { PATRON_DEFS };
