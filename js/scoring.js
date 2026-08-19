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
  state, owns, getActiveLetter, getActiveColour, getActiveGrowth, returnsToBag,
  isWrapped,
} from './state.js';

// ─── Score a word ─────────────────────────────────────────────────────────────
// Pure (no state mutation) — a patron that paints a tile (pass ½) does it to a
// copy of the word, and only its onPrinted makes the colour permanent. Returns
// a "script" describing every step of the score so the UI can replay it tile by
// tile:
//
// {
//   word, points, mult, total, coins, refresh,
//   tileSteps:   [{ id, points, coins, refresh, returns }]  — one per tile, in order
//   tilePaintSteps: [{ id, uid, emoji, text, hits: [{ id, colour }] }]
//                                                            — patrons painting
//                                                              tiles, before
//                                                              anything is counted
//   tilePaint:   Map(id → colour)                            — the same, for the
//                                                              live preview and
//                                                              the brush at print
//   tileBoostSteps: [{ id, uid, emoji, points, hits: [{ id, delta }] }]
//                                                            — patrons writing
//                                                              Points onto tiles,
//                                                              before anything scores
//   nickSteps:   [{ sourceId, kind, mult, hits: [{ id, delta }] }]
//   nickAffected: Map(id → mult)                             — for the live preview
//   colourSteps: [{ colour, ids, count, mult }]              — incl. 'purple' (trim)
//   patronSteps: [{ id, uid, text, points?, mult?, xmult?, running? }]
//   perTile:     Map(id → { final, parts[] })                — for tooltips
// }
//
// score = Points × Mult, where Mult is the product of the colour multipliers:
// each colour starts ×1 and every painted letter of that colour adds +1.
// Purple trims raise a fifth multiplier in half-steps (+0.5 each).
//
// Points is a RUNNING figure by the time the patrons have finished with it:
// they act one seat at a time and their multipliers fold into it as they go
// (see pass 4), so `running` on each step is what the readout should be
// showing at that moment in the print.

export function computeScore(wordTiles) {
  if (!wordTiles?.length) return null;

  // `word` is what gets printed, marks and all — the manuscript and the board
  // want to see HELLO!. Patrons are handed the letters alone, so a trailing
  // mark can't make a 3-letter word read as four or spoil a palindrome.
  const word = wordTiles.map(t => getActiveLetter(t)).join('').toUpperCase();
  // What the table READS, as against what the press SETS. A medieval sort
  // prints as its own glyph and scores its own Points, but stands for ordinary
  // letters everywhere else — so þORN is counted, judged and paid as THORN,
  // five letters of measure and a noun for The Sculptor. The same resolver runs
  // at the dictionary check (main.js), so the preview cannot promise a reading
  // the print then refuses.
  const letters = resolveMedieval(splitMarks(word)?.letters ?? word);
  const n = wordTiles.length;

  // ── Pass 0: the wrapper ────────────────────────────────────────────────────
  // A tile The Redactor has wrapped in manuscript (js/bosses.js) keeps its
  // letter and loses everything else, so it is replaced here — on a copy, since
  // scoring never mutates — with a tile carrying nothing but that letter. The
  // paint, wash, trim, nick and metal are all read straight off the tile by the
  // passes below, and every one of them reads null now; the face value is the
  // one thing looked up from the letter rather than the tile, so pass 1 zeroes
  // it explicitly. `wrapped` rides along on the copy, which is what keeps
  // getActiveGrowth and isImmutable answering correctly downstream.
  if (wordTiles.some(isWrapped)) {
    wordTiles = wordTiles.map(t => (isWrapped(t)
      ? { ...t, colour: null, wash: null, trim: null, nick: null, material: null }
      : t));
  }

  // ── Pass ½: the brush, before a single thing is counted ────────────────────
  // Patrons who PAINT a tile rather than pay it (The Illuminator) go first of
  // all, because paint is not a bonus laid on top of the count — it is part of
  // what is being counted. The colour lands on a copy of the word, so scoring
  // stays pure and the tile in your collection is untouched until the word
  // actually prints; from here down, though, `wordTiles` IS the painted word,
  // and every reader below sees it: the colour multipliers count the new
  // colour, the tile bonuses pay for it, and the patrons' own effects read it
  // (which is what lets a fourth colour meet The Harlequin's full motley).
  //
  // Seats speak in order here as everywhere, and each sees what the seats in
  // front of it painted. A tile already claimed can't be repainted — first
  // brush wins, the same rule the nicks follow.
  const tilePaintSteps = [];
  const tilePaint = new Map();   // tile id → colour, for this word only
  for (const p of state.patrons) {
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
  // A Monogrammist doesn't just double what its letters are worth — the whole
  // tile prints again. Its gold trim pays a second Coin, its cobalt trim buys a
  // second refresh, its paint lifts the colour multiplier twice, its purple
  // trim counts twice, its cursed metal multiplies twice. `echo[i]` is the
  // number of times tile i counts, doubling per matching seat, so two copies
  // that love the same letter reach ×4 — the intended ceiling of collecting
  // them. The one thing an echo can't repeat is the tile's own nick: nicks
  // don't stack, so a second reading of one finds every target already claimed.
  const echoSeats = state.patrons.filter(p => patronById(p.id)?.tileEcho);
  const echo = wordTiles.map(t => echoSeats.reduce(
    (n, p) => patronById(p.id).tileEcho(t, p.data ?? {}) ? n * 2 : n, 1));

  // ── Pass 1: each tile's own Points, plus trim side effects ─────────────────
  const contrib   = [];
  const tileSteps = [];
  const noteMap   = wordTiles.map(() => []);
  let coins = 0;
  let refresh = 0;

  wordTiles.forEach((t, i) => {
    // Wrapped tiles are worth nothing: the face value is the one figure read
    // from the letter rather than from the tile, so pass 0's stripping can't
    // reach it and it is zeroed here instead.
    const face  = isWrapped(t) ? 0 : TILE_POINTS[getActiveLetter(t)] ?? t.basePoints ?? 1;
    const grown = getActiveGrowth(t);   // growth follows the showing face
    let points = face + grown;
    noteMap[i].push(isWrapped(t) ? 'in manuscript — no Points' : `base ${face}`);
    if (grown) noteMap[i].push(`grown +${grown}`);

    if (t.trim === 'silver') { points += SILVER_BONUS; noteMap[i].push(`Silver +${SILVER_BONUS}`); }

    // An echoed tile pays its trim once per printing, so a monogrammed gold
    // letter hands over two Coins where a plain one hands over one.
    let stepCoins = 0, stepRefresh = 0;
    if (t.trim === 'gold')   { stepCoins = (owns('magpie') ? 2 : 1) * echo[i]; coins += stepCoins; }
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
  // end of the count. Two things follow, both of them the point of the pass:
  // the number is visible on the tile itself as you compose (it is already in
  // perTile, so the corner figure the groove shows is the true one), and the
  // nicks and Monogrammists below multiply it, exactly as "the tile gains +4"
  // always implied and never did.
  //
  // Seats speak in seat order here as everywhere, and each records a step of
  // its own so the print can show the ink going onto the tiles before a single
  // tile pays out.
  const tileBoostSteps = [];
  for (const p of state.patrons) {
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
      noteMap[i].push(`${def.emoji} +${v}`);
      hits.push({ id: t.id, delta: v });
    });
    if (hits.length) {
      tileBoostSteps.push({
        id: p.id, uid: p.uid, emoji: def.emoji, hits, points: added,
        text: `+${added} Points — onto the tiles`,
      });
    }
  }
  // What each tile pays is now what it says: the print's first pass reads the
  // boosted figure, so no tile is ever seen paying less than its corner shows.
  tileSteps.forEach((step, i) => { step.points = contrib[i]; });

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
  // The Points half of the echo, and the only half with a number worth showing
  // the player: each seated Monogrammist doubles what its three letters scored,
  // trims and nicks included. Copies fire in seat order and each doubles what
  // it finds, which is the same ×2-per-seat that pass 0 wrote into `echo`.
  // Each copy's gain is its own patron step, keyed by the seat's uid, so every
  // copy badges and animates as itself.
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

  // The echo steps above were pushed before there was a total to measure them
  // against; the print's readout wants the running figure after each one, the
  // same as every later step carries. Their deltas are already inside `points`,
  // so counting back from it gives each step the number it should be showing.
  {
    let run = points - patronSteps.reduce((a, st) => a + (st.points ?? 0), 0);
    for (const st of patronSteps) { run += st.points ?? 0; st.running = Math.round(run); }
  }

  // ── Pass 3: colour multipliers (painted letters, then purple trims) ────────
  // Each entry carries the tile's echo as its weight, so a monogrammed jade
  // letter counts as two jade letters. `ids` stays one id per tile — it drives
  // the animation, and a tile only needs lighting up once — while `count` is
  // what the multiplier is actually built from.
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

  // The measure speaks first: the word's own length, the one multiplier a
  // press owns before it has bought anything. Letters, not tiles — an ING
  // ligature is three letters of measure — and marks don't count, having
  // already been stripped from `letters`. It rides the colour steps so it
  // previews, chips and animates exactly like them.
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

  // Cursed metal multiplies alongside the colours, and stacks with itself —
  // two cursed tiles in one word is ×9. It rides the same steps as the colour
  // multipliers so it previews, animates and chips exactly like them.
  if (cursed.length) {
    const count = weigh(cursed);
    const m = CURSED_MULT ** count;
    colourSteps.push({ colour: 'cursed', ids: idsOf(cursed), count, mult: m });
    mult *= m;
  }
  mult = Math.round(mult * 1000) / 1000;   // keep half-steps off floating-point drift

  // ── Pass 3½: what the hand itself brings to the word ───────────────────────
  // Both of these land BEFORE the patrons speak, because both are Points the
  // word already carries when the table turns to it — and because the patron
  // pass below is sequential, so anything meant to be multiplied by a ×Mult
  // seat has to be on the table before that seat opens its mouth.

  // The tongs' heat: points armed when a tile was fed to the furnace, spent
  // on the next word printed. Read here (so the live preview shows it) and
  // cleared when the word commits — the same arrangement as the Gambler's
  // coin, and for the same reason: this runs on every keystroke.
  if (state.tongsBonus) {
    points += state.tongsBonus;
    patronSteps.push({
      id: 'tongs', text: `+${state.tongsBonus} Points — the tongs' due`,
      points: state.tongsBonus, running: Math.round(points),
    });
  }

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
      points: -toll, running: Math.round(points),
    });
  }

  // ── Pass 4: patrons, in the order you seated them ──────────────────────────
  // The order is the whole point of the pass, and the rule fits on a card:
  // A ×MULT MULTIPLIES EVERYTHING THE TABLE HAS SAID IN FRONT OF IT, AND
  // NOTHING BEHIND IT. So a seat that adds is worth more early, a seat that
  // multiplies is worth more late, and dragging the shelf into order is a real
  // decision rather than a cosmetic one (reorderPatrons in state.js; the cards
  // take the gesture on the board and in the Market alike).
  //
  // Two registers carry it. `points` is the running score, and `pmult` holds
  // the Mult added since the last multiplication — Points and +Mult accumulate
  // together between multiplications, so those two commute with each other,
  // and a ×Mult folds the pending Mult into the running score and multiplies
  // the lot. Whatever is said afterwards starts again from a clean slate,
  // which is the whole asymmetry: the seats that ADD want to be in front of
  // the seats that MULTIPLY. The colour multipliers stay out of it — they are
  // the word's own arithmetic, not a patron's, and they multiply the finished
  // figure at the end.
  //
  // `data` is the seat's memory, handed over READ-ONLY: this runs on every
  // keystroke for the live preview, so a score effect that wrote to it would
  // fire dozens of times a word. Counters are advanced in onPrinted instead.
  // (patronSteps was declared back in pass 2½, where the Monogrammists fire.)
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

  for (const p of state.patrons) {
    const def = patronById(p.id);
    current = p.id;
    currentUid = p.uid ?? null;
    if (def?.when === 'score' && def.effect) { ctx.data = p.data ?? {}; def.effect(ctx); }

    // A laurel speaks with the head that wears it, not after the whole table
    // has finished: crowning the seat that sits in front of your multipliers
    // is worth more than crowning the one that sits behind them, which is the
    // decision the tool is for. Seat data is read-only here as ever; the count
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

    // And the letters after the name speak last of all at this seat, so the
    // ×1.2 multiplies what the seat itself just said — its effect and its
    // laurels both — as well as everything the table said in front of it. A
    // distinguished patron is therefore worth most where any multiplier is:
    // late in the running order, behind the seats that add.
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
  // One ×1.5 for each guild represented on the shelf. Two things he does NOT
  // care about: whether those patrons fired on this word (they need not have),
  // and how many of them share a livery (a guild is counted once, so three
  // amber patrons pay as one). Four guilds is therefore his ceiling, ×5.06.
  // He speaks after everyone else, so what he multiplies is the whole score.
  if (owns('alderman')) {
    // guildsOf, not .guild: a dual-livery patron (the Cellarer) flies two
    // flags from one seat, and the Alderman salutes them both.
    const guilds = new Set();
    for (const p of state.patrons) {
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
  // Two things can happen here, in order. The Reviewer's temper multiplies
  // every word, spiked or not, and is rolled before you compose — so it's a
  // promise kept, never a surprise. Then the seated editor judges the word
  // against the house rule; a word that breaks it is spiked at ×SPIKE_MULT,
  // as a visible step, so the preview and the print agree. The judgement is
  // handed the pre-spike total: the Escalationist's bar measures what a word
  // was really worth, not what the spike left of it.
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
    word, points, mult, total, coins, refresh, spiked,
    tileSteps, tilePaintSteps, tilePaint, tileBoostSteps, nickSteps, nickAffected,
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
  // Overset — type set well beyond what the page asked. One Coin per half-
  // quota of overshoot (150% pays 1, 200% pays 2), capped like interest so a
  // late-game press multiplying into the thousands doesn't mint money.
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
    // The counting-house pays by the size of the house, and by nothing else:
    // +1 Coin per amber patron seated, the Banker counting himself. One Coin
    // for a lone Banker, and a reason to fill the bench beside him.
    parts.push({ label: 'The Banker', coins: guildSeats('amber') });
  }

  // The fleuron's rent: a coin per ornament owned, every page, wherever it
  // sits — bag, pile, or clogging the rack. Unconditional by design; the
  // tile's drawback is the hand it clogs, not the coin it might miss.
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
