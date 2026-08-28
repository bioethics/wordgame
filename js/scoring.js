import {
  TILE_POINTS, TRIMS, COLOURS, PURPLE_TRIM_STEP, REWARD, CURSED_MULT,
  CURSED_PENALTY, SPIKE_MULT, SILVER_BONUS, isDeadline, splitMarks, isRule, BOLD_MULT,
  HONORIFIC_STEP, LAUREATE_MULT_STEP, FLEURON, FLEURON_PAGE_COIN, lengthMult, POSTNOM,
  ALDERMAN_STEP,
} from './constants.js';
import {
  PATRON_DEFS, patronById, guildsOf, guildSeats, resolveMedieval,
} from './patrons.js';
import { bossById } from './bosses.js';
import {
  state, owns, allSeats, getActiveLetter, getActiveColour, getActiveGrowth,
  returnsToBag, isWrapped, spellsOnly, restingPoints,
} from './state.js';

// ─── Score a word ─────────────────────────────────────────────────────────────
// Pure (no state mutation): a patron that paints a tile (pass ½) paints a COPY
// of the word, and only its onPrinted makes the colour permanent. Returns a
// "script" of every step, so the UI can replay the score tile by tile:
//
// {
//   word, letters, points, mult, total, coins, refresh, spiked, plainTotal, adjusted, bold
//     — `plainTotal` is what the word was worth before the Deadline's editor
//       touched it (its temper, its spike), and `adjusted` says the two differ;
//       the readout strikes the first through and writes the second beside it.
//     — `word` is what PRINTS (glyphs and marks); `letters` is what the table
//       READ (medieval sorts resolved, marks stripped), which is what the
//       patrons, the editors and the measure all judged.
//   tileSteps:      [{ id, points, coins, refresh, returns }] — one per tile, in order
//   tilePaintSteps: [{ id, uid, emoji, text, hits: [{ id, colour }] }]
//   tilePaint:      Map(id → colour) — the same paint, for the live preview
//   twinSteps:      [{ id, uid, emoji, hits: [{ kind, id, fromId, at, mould, changed, grew }] }]
//                     — The Twins' recasting: 'clone' rewrites the tile at `id`,
//                     'summon' adds one the word never had. `mould` is what the
//                     seat lays into the collection for good; `changed` is false
//                     for a recasting that alters nothing to look at.
//   twinCloned:     Map(id → tile) — what a recast tile now reads as (preview)
//   twinSummons:    [{ at, tile }] — tiles struck into the word, by place (preview)
//   twinPairMarks:  Map(id → 'open' | 'close' | 'both') — which tiles stand in a
//                     doubled pair, and which end of it, so the groove can bracket
//                     them while the word is still being composed
//   tileBoostSteps: [{ id, uid, emoji, points, hits: [{ id, delta }] }]
//   tileGrowth:     Set(id) — tiles whose boost is permanent growth
//   nickSteps:      [{ sourceId, kind, points, hits: [{ id, delta }] }]
//                     — `points` is what the nick took; `hits` are the tiles it
//                     read, each with what it was worth to the reading
//   nickGains:      Map(id → points) — for the live preview
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

// ─── The Twins' recasting (scoring's pass ⅓) ──────────────────────────────────
// The second tile of a pair is struck again from the first, and it is a CLONE:
// paint, trim, nick, metal, grown Points and both faces of a dual, all of it,
// overwriting whatever the second tile was wearing. Nothing survives but its
// identity — its id, so every Map and element already keyed to it still finds
// it, and its place in the word. Which means the pair can be set the wrong way
// round and cost you the better tile: the groove marks every pair it reads
// (twinPairMarks below) so the warning is on the board while you compose, and
// which tile is the mould is which one you set FIRST.
//
// MOULD is what one tile hands another. Everything else on a tile is either its
// identity or a thing of the moment: `selected` is a pointer's business, `wash`
// comes off both tiles when the word is done (washOff), and `ephemeral`,
// `aboveHand` and `lender` say whose tile it is rather than what it is.
const MOULD = [
  'letter', 'altLetter', 'letterType', 'activeVariant',
  'colour', 'trim', 'nick', 'material', 'bonusPoints', 'altBonusPoints',
];

// The clone as it stands for THIS word, and the mould the seat lays into the
// collection when the word prints. The reading takes the wash as well, since a
// coat of wash reads as paint for as long as the word lasts; the mould does not,
// because by the next word neither tile has it.
function recastPair(first, second) {
  const mould = Object.fromEntries(MOULD.map(k => [k, first[k] ?? null]));
  // A forgery struck again from real type PASSES, for the length of one word:
  // the copy is a genuine tile in every way the count OR THE EYE can see, so it
  // pays the mould's Points, lifts its colours, and sits in the groove wearing
  // cast metal rather than bank-note stock. That is what a counterfeit sort is
  // for, and the whole of what it can ever buy — the tile itself is untouched,
  // so isImmutable refuses to keep any of it and the page takes it back.
  // (The Redactor's paper is never recast at all; see applyTwins.)
  const tile = { ...second, ...mould, wash: first.wash ?? null,
                 basePoints: first.basePoints,
                 counterfeit: false, ephemeral: false, lender: null };
  const changed = MOULD.some(k => (first[k] ?? null) !== (second[k] ?? null))
               || (first.wash ?? null) !== (second.wash ?? null)
               || !!second.counterfeit;
  return { tile, mould, changed };
}

// Apply every seated tileTwin seat to a COPY of the word, in seat order. Returns
// the twinned word, the steps to replay it with, and — for the live preview —
// which tiles now read as something else and which were never there at all.
//
// A wrapped tile is neither copied nor copied onto: the paper is over it, and
// The Redactor's whole point is that you work around what it hides. Such a pair
// is still paid; it simply isn't recast.
function applyTwins(tiles) {
  const steps = [];
  const cloned  = new Map();   // tile id → what it now reads as
  const summons = [];          // [{ at, tile }] — tiles the word did not have
  const marks   = new Map();   // tile id → 'open' | 'close' | 'both'

  // Every pair the seat READS is marked, whether or not it can be recast: the
  // mark is a warning as much as a promise (a recasting overwrites the second
  // tile outright), and a pair that only pays its Points is still a pair.
  const mark = (tile, side) =>
    marks.set(tile.id, marks.get(tile.id) === (side === 'open' ? 'close' : 'open')
      ? 'both' : (marks.get(tile.id) ?? side));

  for (const p of allSeats()) {
    const def = patronById(p.id);
    if (!def?.tileTwin) continue;
    const pairs = def.tileTwin(tiles) ?? [];
    for (const q of pairs) {
      if (q.kind === 'summon') { mark(q.first, 'open'); continue; }
      if (q.first === q.second) { marks.set(q.first.id, 'both'); continue; }
      mark(q.first, 'open');
      mark(q.second, 'close');
    }

    // A forgery is not a mould. It can be struck FROM real type — which is most
    // of what a counterfeit sort is for, since for the length of a word it then
    // reads as the tile beside it — but nothing is struck from a fake, or a free
    // tile laid down carelessly would strip the good one behind it for good.
    const recasts = pairs.filter(q =>
      q.kind === 'clone' && !spellsOnly(q.first) && !isWrapped(q.second));
    // Struck back-to-front, so an earlier insertion can't shift a later one's
    // place. (Only one licence is ever read per word, but the order is free.)
    const struck = pairs.filter(q => q.kind === 'summon' && !spellsOnly(q.first))
                        .sort((a, b) => b.at - a.at);
    if (!recasts.length && !struck.length) continue;

    const hits = [];
    let next = [...tiles];
    for (const q of recasts) {
      const { tile: twin, mould, changed } = recastPair(q.first, q.second);
      next = next.map(t => (t.id === q.second.id ? twin : t));
      // Only a recasting that alters something goes to the preview: one that
      // doesn't would render the tile exactly as it already is.
      if (changed) cloned.set(q.second.id, twin);
      // `mould` is what the seat lays into the collection when the word prints —
      // recorded here so the permanent change is exactly the one the player was
      // shown, rather than worked out a second time against a tile some other
      // seat may have painted in the meantime.
      hits.push({ kind: 'clone', id: q.second.id, fromId: q.first.id, mould, changed,
                  grew: getActiveGrowth(twin) > getActiveGrowth(q.second) });
    }
    for (const q of struck) {
      // Cast from the tile it doubles — its trim, nick, metal and paint — but
      // showing only the LETTER that was doubled, which is not always the whole
      // of that tile: a licence read onto the L of an AL ligature strikes a bare
      // L, or the word would come out BALALOON. A single face, always: there is
      // no second side to a letter that was never in the bag.
      const twin = {
        ...q.first, id: `twin-${q.first.id}`, summoned: true,
        letter: q.ch, altLetter: null, letterType: 'normal', activeVariant: 0,
        altBonusPoints: 0, basePoints: TILE_POINTS[q.ch] ?? 1,
        selected: false, ephemeral: false, aboveHand: false, lender: null,
      };
      next.splice(q.at, 0, twin);
      summons.push({ at: q.at, tile: twin });
      hits.push({ kind: 'summon', id: twin.id, fromId: q.first.id, at: q.at, changed: true });
    }
    tiles = next;
    steps.push({ id: p.id, uid: p.uid, emoji: def.emoji, hits });
  }
  summons.sort((a, b) => a.at - b.at);
  // The letter a licence strikes closes the pair its source opened.
  for (const su of summons) marks.set(su.tile.id, 'close');
  return { tiles, steps, cloned, summons, marks };
}

export function computeScore(wordTiles) {
  if (!wordTiles?.length) return null;

  // ── Pass 0: the wrapper ────────────────────────────────────────────────────
  // A tile The Redactor has wrapped (js/bosses.js) keeps its letter and loses
  // everything else — on a copy, since scoring never mutates. Face value is
  // looked up from the letter, not the tile, so pass 1 zeroes it separately.
  // `wrapped` rides along, keeping getActiveGrowth and isImmutable correct.
  // First of all, so that everything below — The Twins included — sees the
  // paper rather than what is under it.
  if (wordTiles.some(spellsOnly)) {
    wordTiles = wordTiles.map(t => (spellsOnly(t)
      ? { ...t, colour: null, wash: null, trim: null, nick: null, material: null }
      : t));
  }

  // ── Pass ¼: the rules come off the copy ────────────────────────────────────
  // A pair of rules brackets the word and sets it BOLD. They are marks on the
  // copy rather than sorts in it, so they are lifted out HERE, before anything
  // reads the word: nothing below sees them, nothing counts them, and the
  // measure never gives them a letter. Only the flag survives.
  //
  // Bracketing means exactly that — one at each end and nowhere else. A rule
  // anywhere in the middle, or one without its pair, is refused at the print
  // (submitWord in js/main.js), so by the time a word reaches here it is either
  // properly bracketed or carries no rules at all.
  const ruled = wordTiles.filter(t => isRule(getActiveLetter(t)));
  const bold  = ruled.length === 2
             && isRule(getActiveLetter(wordTiles[0]))
             && isRule(getActiveLetter(wordTiles[wordTiles.length - 1]));
  if (ruled.length) wordTiles = wordTiles.filter(t => !isRule(getActiveLetter(t)));

  // ── Pass ⅓: The Twins ──────────────────────────────────────────────────────
  // Before the word is so much as READ. A doubled letter means two of the same
  // tile, so the second is recast as the first — and a double the word is
  // missing outright is struck and joins it. From here down `wordTiles` IS the
  // twinned word: what prints, what the measure counts, what every seat reads.
  const twin = applyTwins(wordTiles);
  wordTiles = twin.tiles;

  // `word` is what gets printed, marks and all; patrons are handed the letters
  // alone, so a trailing mark can't make a 3-letter word read as four.
  const word = wordTiles.map(t => getActiveLetter(t)).join('').toUpperCase();
  // What the table READS: a medieval sort prints and scores as itself but
  // stands for ordinary letters everywhere else (þORN is judged and paid as
  // THORN). main.js resolves the same way at the dictionary check, so the
  // preview can't promise a reading the print then refuses.
  const letters = resolveMedieval(splitMarks(word)?.letters ?? word);
  const n = wordTiles.length;

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
  // times tile i counts, doubling per matching seat. A nick's winnings land on
  // its own tile in pass 2, before the echo doubles it in pass 2½ — so an echoed
  // nick reads its side once and is paid for it twice.
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
    const face  = spellsOnly(t) ? 0 : TILE_POINTS[getActiveLetter(t)] ?? t.basePoints ?? 1;
    const grown = getActiveGrowth(t);   // growth follows the showing face
    let points = face + grown;
    noteMap[i].push(isWrapped(t) ? 'in manuscript — no Points'
                  : t.counterfeit ? 'counterfeit — no Points'
                  : `base ${face}`);
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
      // What the tile is cast from, so the strike can SOUND like it (sfx.tick
      // in anim.js gives each metal its own body under the scoring note).
      material: t.material ?? null,
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

  // ── Pass 2: nicks read one side of the word ───────────────────────────────
  // A nick adds up every tile on the side it points to and takes that much for
  // itself. Nothing is taken away from the tiles it reads — the Points are
  // scored a second time, on the nick.
  //
  // What each tile is worth to a reading nick is fixed BEFORE any nick pays, in
  // `readAs`, and that is the whole of the stacking rule:
  //
  //   • an ordinary tile is read at its full value here — face, growth, silver,
  //     a tongs grip, whatever the patrons have just written onto it;
  //   • a tile that carries a nick of its own is read at its RESTING value, the
  //     number it wears in the hand.
  //
  // So nicks stack — two of them each read their own side and each take their
  // own sum — but no nick ever reads another nick's winnings, and a row of them
  // adds up instead of multiplying up. Reading order stops mattering too: every
  // sum is drawn from the same frozen list, so a left nick and a right nick
  // facing each other give the same answer whichever pays first.
  const readAs = wordTiles.map((t, i) => (t.nick ? restingPoints(t) : contrib[i]));
  const nickSteps = [];
  const nickGains = new Map();
  wordTiles.forEach((t, i) => {
    if (!t.nick) return;
    const targets = [];
    if (t.nick === 'right') for (let j = i + 1; j < n; j++) targets.push(j);
    if (t.nick === 'left')  for (let j = 0; j < i; j++)     targets.push(j);

    const hits = [];
    let gain = 0;
    for (const j of targets) {
      const delta = readAs[j];
      if (delta <= 0) continue;
      gain += delta;
      hits.push({ id: wordTiles[j].id, delta });
    }
    if (!gain) return;
    contrib[i] += gain;
    noteMap[i].push(`+${gain} — nick`);
    nickGains.set(t.id, gain);
    nickSteps.push({ sourceId: t.id, kind: t.nick, points: gain, hits });
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

  // Set bold, and the whole word is worth that much more. It rides the colour
  // steps like the measure does, so it has a chip of its own in the readout and
  // multiplies WITH the colours rather than queueing behind the patrons.
  if (bold) {
    colourSteps.push({
      colour: 'bold', ids: wordTiles.map(t => t.id),
      count: letters.length, mult: BOLD_MULT,
    });
    mult *= BOLD_MULT;
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
  // Asked once for the whole table rather than at every seat: whether he is
  // there cannot change halfway down the shelf, and a ghost of him still counts
  // (owns reads allSeats) — being murdered costs him his seat, never his trade.
  const laureate = owns('laureate');
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
      // And while The Laureate is at the table, every laurel on it is worth a
      // little Mult as well — his own included, since he wears them like anyone
      // else. It lands at the WEARER'S seat, beside that laurel's Points, so it
      // obeys the same rule they do: in front of a ×Mult it is multiplied by it,
      // behind it, it is not. Read live through owns(), so hiring or dismissing
      // him re-prices every crown on the shelf at once.
      if (laureate) {
        const m = Math.round(laurels * LAUREATE_MULT_STEP * 100) / 100;
        pmult += m;
        step({
          text: `+${m} Mult — ${laurels > 1 ? 'those laurels' : 'that laurel'}, for The Laureate`,
          mult: m, laurel: true,
        });
      }
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
  // +ALDERMAN_STEP per guild represented on the shelf, ADDED once each rather
  // than multiplied — four liveries are +2 Mult, not ×5. Whether those patrons
  // fired on this word doesn't matter, and a guild counts once however many
  // wear it. He speaks after everyone else, so what he adds is added to the
  // finished multiplier.
  if (owns('alderman')) {
    // guildsOf, not .guild: a dual-livery patron flies two flags from one seat.
    const guilds = new Set();
    for (const p of allSeats()) {
      for (const g of guildsOf(patronById(p.id))) guilds.add(g);
    }
    for (const g of guilds) {
      mult += ALDERMAN_STEP;
      patronSteps.push({
        id: 'alderman',
        text: `+${ALDERMAN_STEP} Mult — the ${COLOURS[g].label} guild`,
        mult: ALDERMAN_STEP,
      });
    }
    if (guilds.size) mult = Math.round(mult * 1000) / 1000;
  }

  // ── Pass 4¾: the Editor at the Deadline (see js/bosses.js) ─────────────────
  // Two things, in order: the Reviewer's temper multiplies every word, spiked
  // or not; then the seated editor judges, and a break is spiked at ×SPIKE_MULT
  // as a visible step, so preview and print agree. judge() gets the PRE-spike
  // total, so the Escalationist's bar measures what a word was really worth.
  //
  // What the word was worth BEFORE the desk touched it is kept: the readout
  // strikes that figure through and writes the editor's beside it, so a spike
  // (or a temper) is read as a thing done TO a score rather than as the score.
  const plainMult = mult;
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
    // The Silent Knight's whole argument: a letter that is written and not
    // spoken is a letter no editor hears, and a word carrying one is read past
    // rather than read. Asked BEFORE the judge, so a seat at the table is the
    // difference between a spike and a shrug — and asked of the same word the
    // dictionary saw, marks and medieval readings already resolved.
    // A sort struck into the paper carrying no ink is a letter the desk cannot
    // see, so a word with one set into it is passed over. The immunity belongs
    // to the METAL and to nothing else: The Silent Knight is how blind sorts
    // are made (he strikes a silent letter into one, permanently, in his
    // onPrinted) and the alley is where they are bought, but neither seat nor
    // shop grants the pardon — the tile in the word does. One is enough.
    //
    // He used to carry a word-level pardon of his own, which made the seat and
    // its own product do the same job twice; now his loop reads straight
    // through: print a silent letter, gain a permanent tile the editors cannot
    // read, and use it on every word after.
    const blind = wordTiles.some(t => t.material === 'blind');
    if (blind) {
      patronSteps.push({
        id: 'blind',
        text: `The ${def.name.replace(/^The /, '')} never saw it — a blind sort`,
        unheard: true,
      });
    }
    const unheard = blind;
    const reason = unheard ? null : def?.judge?.(letters, wordTiles, data, preTotal);
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
  const total      = Math.max(0, Math.round(points * mult));
  const plainTotal = Math.max(0, Math.round(points * plainMult));
  const adjusted   = plainTotal !== total;

  // Points the Twins raised are kept for good, so the groove writes them in jade
  // rather than boost brass — the same mark the trellis seats earn. (The coat
  // itself needs no such marking: renderWord already draws the recast tile.)
  for (const step of twin.steps) {
    for (const hit of step.hits) if (hit.grew) tileGrowth.add(hit.id);
  }

  // ── Per-tile breakdown for tooltips ─────────────────────────────────────────
  const perTile = new Map();
  wordTiles.forEach((t, i) => {
    perTile.set(t.id, { final: contrib[i], parts: noteMap[i] });
  });

  return {
    word, letters, points, mult, total, coins, refresh, spiked, plainTotal, adjusted, bold,
    tileSteps, tilePaintSteps, tilePaint, tileBoostSteps, tileGrowth, nickSteps, nickGains,
    colourSteps, patronSteps, perTile,
    twinSteps: twin.steps, twinCloned: twin.cloned, twinSummons: twin.summons,
    twinPairMarks: twin.marks,
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
