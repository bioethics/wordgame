// Game flow: the print cinematic, page and chapter turnover, board input
// modes, settings, and init. Board rendering is render.js; the full-screen
// sheets (Market, Colophon, draft) render and handle themselves in sheets.js,
// with the flow callbacks below injected via initSheets().

import {
  state, settings, loadSettings, saveSettings, loadState, clearSave,
  newRun, startPage, drawUpToRackSize, clearWord, shuffleRack,
  discardSelected, discardSundry, getWordString, moveRackToWord, owns, allSeats,
  effectiveGhostSlots, clearAllSelected,
  toggleDualVariant, retirePrinted, recordWord, applySundry, sundrySelected, takePaintEchoes,
  rollTubeOffer, applyWash, washOff, effectiveSundrySlots, takeGhostEchoes,
  getActiveColour, getActiveLetter, countsAsColour, growTile, paintTile, trimTile,
  trashFromCollection, mergeTiles, castMaterialTile, castMarkTile, castTile, castLentTile, lentInHand, chapterTitle,
  grantRandomPatron,
  rollGamble, effectivePatronSlots, nextId,
} from './state.js';
import {
  TILE_POINTS, ANIM, PAGES_PER_CHAPTER, FINAL_CHAPTER,
  REACTION, NEOLOGIST_LENGTH, MATERIALS, TRIMS, WRAPPED_CONTENTS, MARK_TRIM,
  chapterLabel, COLOURS, MULT_TRACKS, NICKS, splitMarks, isDeadline,
  FLEURON, TOOLBOX_POOL, HONORIFIC_STEP, TONGS_BONUS, LOUPE_CAP, RIPPER_WORDS, sundryTip,
  PACKAGES, APPLICATORS, SILVER_BONUS, BAG_COUNTS,
  lengthFlourish, medievalExpansions,
} from './constants.js';
import { bossById, bossOnPrinted, bossReplenish } from './bosses.js';
import { DICT, dictLoaded, loadDict, loadCustom, coinWord, scrambleMatch } from './dict.js';
import { THEME_SETS, loadThemes } from './themes.js';
import { loadExclusions, exclusionsLoaded, isExcluded } from './excluded.js';

import { computeScore, computeReward } from './scoring.js';
import { openMarket, restoreMarket, closeMarket, sellPatron, sellSundry } from './market.js';
import {
  colophon, openColophon, closeColophon, restoreColophon, applyColophonSkip,
} from './colophon.js';
import {
  renderAll, renderRack, renderWord, renderCounts, renderButtons, persist,
  renderDictStatus, readoutEls, renderChips, setChip,
  log, showBanner, hideOverlay,
  showGameOver, showVictory, openInspector, closeInspector, coinHTML,
  showPatronPopover, hidePopover, openManuscript, closeManuscript,
  openGhosts, closeGhosts, ghostsOpen,
  showCoinWordSheet, setCoinNote,
} from './render.js';
import {
  initSheets, renderMarket, renderColophon, renderDraft,
} from './sheets.js';
import { openDraft, closeDraft, restoreDraft, applyDraft } from './draft.js';
import {
  sleep, flyClone, popReveal, floatText, tweenNum, setNum, fmtMult,
  pulse, sparkleBurst, sfx, applySpeedCSS, speechBubble, flourishTime,
} from './anim.js';
import { initInput, initInspect, initShelfDrag } from './drag.js';
import {
  PATRON_DEFS, patronById, doubledReading, boundNouns, patronName, patronShelf,
} from './patrons.js';
import { randomQuip } from './quips.js';

const $ = id => document.getElementById(id);
const rect = el => el?.getBoundingClientRect();

// ─── Tile flight helpers ───────────────────────────────────────────────────────

const bagRect  = () => rect($('bagBtn'))  ?? { left: 40, top: 300, width: 60, height: 60 };
const pileRect = () => rect($('discardBtn')) ?? { left: innerWidth - 100, top: 300, width: 60, height: 60 };

const wordTileEl = id => document.querySelector(`#word .tile[data-id="${id}"]`);
const rackTileEl = id => document.querySelector(`#rack .tile[data-id="${id}"]`);

// Where a seat's news is shown — by uid where there is one, so each copy of a
// stackable patron flashes and badges as itself. A ghost has given its card up,
// so its notes float over the graveyard door instead.
const patronCard = p => document.querySelector(
  p.uid != null ? `#shelf .patron[data-uid="${p.uid}"]` : `#shelf .patron[data-patron="${p.id}"]`)
  ?? (state.ghosts?.some(g => g.uid === p.uid) ? $('ghostBtn') : null);

async function animateDraw(drawn) {
  if (!drawn.length) return;
  renderRack(new Set(drawn.map(t => t.id)));
  renderCounts();
  const from = bagRect();
  const flights = [];
  for (let i = 0; i < drawn.length; i++) {
    const el = rackTileEl(drawn[i].id);
    if (!el) continue;
    sfx.draw();
    flights.push(
      flyClone(el, from, rect(el), { duration: ANIM.fly, scaleFrom: 0.35 })
        .then(() => popReveal(el))
    );
    await sleep(ANIM.stagger);
  }
  await Promise.all(flights);
}

// Fly tiles (already removed from state) to wherever they went — the discard
// pile by default, or the bag for Fountain returns. Sources may still be in the
// DOM (e.g. discarded rack tiles), so they are hidden and only the clone flies.
async function animateDiscard(rects, to = pileRect(), bump = 'discardBtn') {
  const flights = [];
  for (const { el, r } of rects) {
    sfx.discard();
    flights.push(flyClone(el, r, to, { duration: ANIM.fly, scaleTo: 0.25, fade: true }));
    el.style.visibility = 'hidden';
    pulse($(bump), 'pouch--bump', 300);
    await sleep(ANIM.stagger);
  }
  await Promise.all(flights);
}

// What comes out of a wrapped tile — a flat pick from WRAPPED_CONTENTS in
// constants.js, which is where the odds are set.
const pickWrapped = () =>
  WRAPPED_CONTENTS[Math.floor(Math.random() * WRAPPED_CONTENTS.length)];

// ─── Discard mode ─────────────────────────────────────────────────────────────

function cancelDiscardMode(quiet = false) {
  if (!state.discardMode) return false;
  state.discardMode = false;
  clearAllSelected();
  if (!quiet) log('Discard cancelled.');
  renderAll();
  return true;
}

// ─── Sundry mode (an armed tube or ratchet) ───────────────────────────────────

function cancelSundryMode(quiet = false) {
  if (state.sundryMode < 0) return false;
  const kind = state.sundries[state.sundryMode]?.kind;
  state.sundryMode = -1;
  state.tubeOffer = null;
  clearAllSelected();
  if (!quiet) log(`The ${kind === 'tube' ? 'tube' : 'ratchet'} goes back on the workbench.`);
  renderAll();
  return true;
}

// A sundry onto the workbench, if the workbench can take one — the hook helper
// behind the Ragman's tongs and the registers' packages alike. It REFUSES rather
// than overflows, so a seat that pays in tools is one you make room for
// beforehand. Takes a kind, or a whole sundry when it needs fields of its own.
function benchPut(sundry) {
  if (state.sundries.length >= effectiveSundrySlots()) return false;
  state.sundries.push(typeof sundry === 'string' ? { kind: sundry } : sundry);
  return true;
}

// One prize from a weighted [id, weight] table.
function pickLoot(table) {
  const total = table.reduce((n, [, w]) => n + w, 0);
  let roll = Math.random() * total;
  for (const [id, w] of table) { roll -= w; if (roll <= 0) return id; }
  return table[table.length - 1][0];
}

// Hand over one package's worth of loot, and say what it was. A prize lands in
// the hand, on the bench (the package's own slot was freed a moment ago, so
// there is always room for one), or on the shelf — the love potion is the one
// prize that can fizzle, since it needs an empty seat, and it says so plainly.
async function openPackage(prize, pkg) {
  const flyIn = async (tile, label, cls) => {
    renderAll();
    const el = rackTileEl(tile.id);
    if (el) {
      await flyClone(el, bagRect(), rect(el), { duration: ANIM.fly, scaleFrom: 0.3 });
      popReveal(el);
      sparkleBurst(el, 14);
      floatText(el, label, cls);
    }
  };

  switch (prize) {
    case 'xotile': {
      const tile = castTile({ letter: 'X', letterType: 'dual', altLetter: 'O', colour: 'crimson' });
      await flyIn(tile, 'X | O', 'fl-set fl-set--crimson');
      return 'a two-faced X|O, painted crimson, and yours for good.';
    }
    case 'oo-ghost': {
      const tile = castTile({ letter: 'OO', colour: 'azure', material: 'ghost' });
      await flyIn(tile, 'OO', 'fl-set fl-set--azure');
      return 'an azure OO in ghost metal — it costs you no room in the hand.';
    }
    case 'oo-cursed': {
      const tile = castTile({ letter: 'OO', colour: 'azure', material: 'cursed' });
      await flyIn(tile, 'OO', 'fl-set fl-set--azure');
      return `an azure OO in hellbox iron — ${MATERIALS.cursed.desc.toLowerCase()}`;
    }
    case 'futile': {
      const tile = castTile({ letter: 'FU', trim: 'silver' });
      await flyIn(tile, 'FU', 'fl-set fl-set--purple');
      return `a silver-trimmed FU — ${SILVER_BONUS} Points over the odds, and rude with it.`;
    }
    case 'rosetile': {
      const letters = Object.keys(BAG_COUNTS);
      const tile = castTile({ letter: letters[Math.floor(Math.random() * letters.length)], material: 'rose' });
      await flyIn(tile, MATERIALS.rose.label, 'fl-set fl-mat--rose');
      return `a ${getActiveLetter(tile)} struck in rose metal — print it and a patron is crowned.`;
    }
    case 'tube-crimson': case 'tube-azure': {
      const colour = prize.slice(5);
      benchPut({ kind: 'tube', colour });
      return `a tube of ${COLOURS[colour].label.toLowerCase()} for the workbench.`;
    }
    case 'wash':  benchPut('wash');  return 'a pot of ink wash for the workbench.';
    case 'tongs': benchPut('tongs'); return 'a pair of tongs for the workbench.';
    case 'applicator-rainbow': case 'applicator-cursed': {
      const material = prize.slice(11);
      benchPut({ kind: 'applicator', material });
      return `${APPLICATORS[material].label} in an applicator, for the workbench.`;
    }
    case 'potion':
      benchPut('potion');
      return 'a love potion for the workbench — uncork it when a seat is free.';
    default:
      return 'nothing at all, which is its own kind of joke.';
  }
}

// The bin at the end of the bench. Nothing is paid (the Market is where a sundry
// is worth a Coin, sellSundry) — the slot it frees is the whole of the point.
function throwSundryAway(idx) {
  // Named from sundryTip, and never with an article of our own in front of it:
  // the heads read "Tongs", "Tube of Jade", "A wrapped tile" alike.
  const name = sundryTip(state.sundries[idx])?.head ?? 'The sundry';
  if (!discardSundry(idx)) return;
  hidePopover();
  sfx.discard();
  log(`${name} — thrown away, and the slot is free.`);
  renderAll();
}

// ─── Patron reactions (flavour only — never affects scoring) ──────────────────
// Self-scaling: the word is judged against the page's own quota, so the curve
// holds across chapters and the appendices. Nothing at all below half a quota,
// then a straight ramp to a certainty at twice it. Knobs live in REACTION.
function reactionChance(script) {
  const ratio = script.total / Math.max(1, state.quota);
  const span = REACTION.ceil - REACTION.floor;
  return Math.max(0, Math.min(1, (ratio - REACTION.floor) / span));
}

async function patronReactions(script) {
  if (!state.patrons.length) return;
  const chance = reactionChance(script);
  if (chance <= 0) return;
  let shown = 0;
  for (const p of state.patrons) {
    if (Math.random() >= chance) continue;
    const card = patronCard(p);
    if (!card) continue;
    if (shown > 0) await sleep(180);   // stagger so bubbles don't stack
    speechBubble(card, randomQuip(script.word));
    shown++;
  }
}

// Set the word CAT and she waits at the head of the patrons next time the shop
// opens, free — but only ONE Market's worth: the offer is spent the moment that
// Market rolls, bought or not (offerTheCat, js/market.js). The latch is what
// keeps her from being a loophole: without it a Headsman build could dismiss and
// rebuy her free every Market forever, each dismissal worth another permanent
// +0.2 Mult. A run where she is already seated is quietly skipped.
function noticeTheCat(script) {
  if (owns('shorthair') || state.catPending || script?.letters !== 'CAT') return;
  state.catPending = true;
  sfx.chime();
  log('🐈 Somewhere beyond the lamplight, something sits up and takes an interest.', 'good');
}

// ─── The Economiser (a sort melted down per word) ─────────────────────────────
// One tile you did NOT set goes to the melting pot after every word — the only
// editor whose cost outlives its page. Destroyed through trashFromCollection
// like everything else, so the Smelter's floor holds and the Composter is fed.
// It reaches only into the rack, so what you committed to the page is safe by
// construction, and a tile with no collection template behind it (lent letters,
// an unfiled ghost) cannot be melted at all — the toll simply passes.
async function editorEats() {
  if (!bossById(state.boss?.id)?.eatsSpare) return;
  const spare = state.rack.filter(t => state.collection.some(c => c.tid === t.tid));
  if (!spare.length) return;
  const doomed = spare[Math.floor(Math.random() * spare.length)];
  if (!trashFromCollection(doomed.tid)) {
    log('🗑️ The Economiser reaches into the case, and thinks better of it — the press is down to its last sorts.', 'warn');
    return;
  }
  const el = rackTileEl(doomed.id);
  state.isAnimating = true;
  if (el) await animateBurn([el]);
  state.rack = state.rack.filter(t => t.id !== doomed.id);
  state.isAnimating = false;
  renderAll();
  log(`🗑️ The Economiser melts down the ${getActiveLetter(doomed)} you left in the case — gone for good.`, 'warn');
  reportPaintEchoes();   // The Revenant may have caught it
}

// ─── Rose metal (a tile that crowns) ──────────────────────────────────────────
// Print a sort struck in rose metal and one of your seated patrons is crowned.
// Not consumed — the tile is yours, and printing it again crowns again, which is
// rarer than it sounds: it has to be drawn out of the whole collection and then
// fitted into a word. Ghosts are not crowned, the same rule the laurel follows.
async function roseCrowns(printed) {
  const roses = printed.filter(t => t.material === 'rose');
  if (!roses.length) return;
  if (!state.patrons.length) {
    log('🎀 The rose metal shines, and there is nobody at the table to crown.', 'warn');
    return;
  }
  for (const tile of roses) {
    const seat = state.patrons[Math.floor(Math.random() * state.patrons.length)];
    seat.data ??= {};
    seat.data.honorifics = (seat.data.honorifics ?? 0) + 1;
    const def = patronById(seat.id);
    const card = patronCard(seat);
    if (card) {
      pulse(card, 'patron--firing', 620);
      sparkleBurst(card, 9);
      floatText(card, `🏵️ +${HONORIFIC_STEP}`, 'fl-points', { dy: -44 });
    }
    log(`🎀 ${getActiveLetter(tile)} was struck in rose metal — ${patronName(def, seat.data)} is crowned, `
      + `+${seat.data.honorifics * HONORIFIC_STEP} Points on every word.`, 'good');
  }
  renderAll();
  await sleep(ANIM.stepColour);
}

// ─── The Ripper (a patron killed, a seat freed) ───────────────────────────────
// Print one of his watchwords and one of your OTHER patrons dies where it sits:
// it moves from the shelf to state.ghosts, keeping every part of its effect and
// giving up only its seat, and then the Ripper flees. Done here rather than in
// an onPrinted hook because a hook cannot remove its own seat from the loop
// that is running it. He refuses rather than half-acts: no other patron to
// kill, or no room among the ghosts, and nothing happens at all. The victim is
// chosen blind.
async function ripperStrikes(script) {
  // He may be seated OR haunting: a ghost has nowhere to flee to, so a Ripper
  // who has met The Revenant keeps his knife.
  const killer = allSeats().find(p => p.id === 'ripper');
  if (!killer || !RIPPER_WORDS.includes(script?.letters)) return;
  const alreadyDead = (state.ghosts ?? []).includes(killer);

  const victims = state.patrons.filter(p => p !== killer);
  if (!victims.length) {
    log('🔪 The Ripper turns the knife over, and finds nobody at the table but himself.', 'warn');
    return;
  }
  if (state.ghosts.length >= effectiveGhostSlots()) {
    log('🔪 The Ripper stays his hand — there is no room left among your ghosts.', 'warn');
    return;
  }

  const victim = victims[Math.floor(Math.random() * victims.length)];
  const def = patronById(victim.id);
  const name = patronName(def, victim.data);

  // ── The knife turns ────────────────────────────────────────────────────────
  // You cannot murder the dead: the knife turns in the Ripper's hand and takes
  // him instead. He goes to the ghosts wearing his own effect, and a ghost
  // cannot flee — so from here on every watchword kills again, at no further
  // cost, until there is no room among your ghosts or nobody living to take.
  if (victim.id === 'revenant') {
    const hers = patronCard(victim);
    const his  = patronCard(killer);
    state.isAnimating = true;
    if (hers) { pulse(hers, 'patron--firing', 900); sparkleBurst(hers, 14); }
    sfx.lose();
    if (!alreadyDead && his) {
      pulse(his, 'patron--murdered', 900);
      floatText(his, '🔪', 'fl-points', { dy: -46 });
    }
    await sleep(ANIM.stepColour * 2);
    if (!alreadyDead) {
      state.ghosts.push(killer);
      state.patrons.splice(state.patrons.indexOf(killer), 1);
    }
    state.isAnimating = false;
    renderAll();
    log(alreadyDead
      ? `💀 The knife passes straight through ${name}. You cannot murder the dead.`
      : `💀 ${name} was already dead, and the knife turns in the Ripper's hand: he is murdered, and haunts your table now — with nowhere left to flee to.`,
      'warn');
    return;
  }

  const card = patronCard(victim);
  const knife = patronCard(killer);

  state.isAnimating = true;
  if (card) {
    pulse(card, 'patron--murdered', 900);
    sparkleBurst(card, 12);
    floatText(card, '🔪', 'fl-points', { dy: -46 });
  }
  if (knife) pulse(knife, 'patron--firing', 620);
  sfx.bad();
  await sleep(ANIM.stepColour * 2);

  state.ghosts.push(victim);
  state.patrons.splice(state.patrons.indexOf(victim), 1);
  if (!alreadyDead) state.patrons.splice(state.patrons.indexOf(killer), 1);

  state.isAnimating = false;
  renderAll();
  log(`🔪 ${name} is murdered — and works on as a ghost, its seat now empty.`
    + (alreadyDead ? ' The Ripper waits for another word.' : ' The Ripper is gone.'), 'warn');
}

// ─── Titivillus (one wrong vowel forgiven) ────────────────────────────────────
// If the letters miss the dictionary by exactly one vowel — and the word holds
// an azure letter to smudge — the word stands as typed, misprint and all.

const VOWELS = 'AEIOU';

// Four slips count as one vowel going astray, tried in the order of how the
// error usually happens: the wrong vowel (SEPERATE), two changing places
// (WIERD), one too many (ATHELETE), one left out (SEPRATE). The last is the
// widest door, which is why the pardon stays behind azure ink and a rare seat.
function titivillusPardon(letters) {
  // countsAsColour, not getActiveColour: rainbow ink smudges as well as
  // azure ink does — "every colour to your patrons" includes the demon.
  if (!state.word.some(t => countsAsColour(t, 'azure'))) return null;

  for (let i = 0; i < letters.length; i++) {
    if (!VOWELS.includes(letters[i])) continue;
    for (const v of VOWELS) {
      if (v === letters[i]) continue;
      const fixed = letters.slice(0, i) + v + letters.slice(i + 1);
      if (DICT.has(fixed)) return fixed;
    }
  }
  for (let i = 0; i < letters.length - 1; i++) {
    const [a, b] = [letters[i], letters[i + 1]];
    if (a === b || !VOWELS.includes(a) || !VOWELS.includes(b)) continue;
    const fixed = letters.slice(0, i) + b + a + letters.slice(i + 2);
    if (DICT.has(fixed)) return fixed;
  }
  for (let i = 0; i < letters.length; i++) {
    if (!VOWELS.includes(letters[i])) continue;
    const fixed = letters.slice(0, i) + letters.slice(i + 1);
    if (DICT.has(fixed)) return fixed;
  }
  for (let i = 0; i <= letters.length; i++) {
    for (const v of VOWELS) {
      const fixed = letters.slice(0, i) + v + letters.slice(i);
      if (DICT.has(fixed)) return fixed;
    }
  }
  return null;
}

// Any two neighbours changing places — TEH for THE. Unlike The Skimmer, this
// one can reach the ends of the word.
function stumblerPardon(letters) {
  for (let i = 0; i < letters.length - 1; i++) {
    if (letters[i] === letters[i + 1]) continue;
    const fixed = letters.slice(0, i) + letters[i + 1] + letters[i] + letters.slice(i + 2);
    if (DICT.has(fixed)) return fixed;
  }
  return null;
}

// Any combination of the word's Zs may be read as S — a handful of lookups at
// most. The tile is still a Z where it counts: it prints as Z and scores ten.
function izzardPardon(letters) {
  const at = [];
  for (let i = 0; i < letters.length; i++) if (letters[i] === 'Z') at.push(i);
  if (!at.length) return null;
  for (let mask = 1; mask < (1 << at.length); mask++) {
    const out = [...letters];
    at.forEach((pos, bit) => { if (mask & (1 << bit)) out[pos] = 'S'; });
    const fixed = out.join('');
    if (DICT.has(fixed)) return fixed;
  }
  return null;
}

// Two nouns set end to end make a word of their own — DOOM and HAT make DOOMHAT.
// The split itself is boundNouns in patrons.js, because The Sculptor reads the
// same rule at scoring; here it only wants naming, for the log.
function binderPardon(letters) {
  const halves = boundNouns(letters);
  return halves ? `${halves[0]} + ${halves[1]}` : null;
}

// The excuses a word can call on when the dictionary turns it away, tried in
// order and credited to whoever saved it. None of them change the word: what you
// set is what prints. The order is by likeliest story, which is why the Binder's
// coinage goes last. (doubledReading lives in patrons.js, since the
// Haplographer's licence also feeds The Twins at scoring.)
const PARDONS = [
  { id: 'izzard',       find: izzardPardon },
  { id: 'titivillus',   find: titivillusPardon },
  { id: 'stumbler',     find: stumblerPardon },
  { id: 'haplographer', find: doubledReading },
  { id: 'skimmer',      find: scrambleMatch },
  { id: 'binder',       find: binderPardon },
];

function pardonWord(letters) {
  for (const { id, find } of PARDONS) {
    if (!owns(id)) continue;
    const stands = find(letters);
    if (stands) return { stands, id };
  }
  return null;
}

// ─── Patron hooks (after a word commits; as a chapter turns) ──────────────────
// Score-time patrons live in the score script; these are the ones that reach
// beyond it — permanent growth, burns, chapter-end dyes. See js/patrons.js.

// Returns { burned, said }: the tiles that were destroyed — they must never
// reach the discard pile, so the caller drops them from the retire list and
// burns them away on screen instead — and any lines the seats want read at the
// foot of the board. The lines are handed back rather than logged where they
// happen because the word's own score line, written a beat later, would paint
// straight over them.
function runPrintedHooks(tiles, script) {
  state.lastFirstLetter = splitMarks(script.word)?.letters?.[0] ?? null;
  const burned = new Map();   // id → tile (a tile can only burn once)
  const said = [];

  for (const p of allSeats()) {
    const def = patronById(p.id);
    if (!def?.onPrinted) continue;
    p.data ??= {};
    const r = def.onPrinted({
      tiles: tiles.filter(t => !burned.has(t.id)),   // ash is out of everyone's reach
      script, state, data: p.data,
      grow:  growTile,
      paint: paintTile,
      trim:  trimTile,
      burn:  t => !!trashFromCollection(t.tid),
      // The same bench the discard hooks get: it refuses rather than overflows.
      bench: benchPut,
    });
    if (!r) continue;
    for (const t of r.burned ?? []) burned.set(t.id, t);
    if (r.refused) {
      // A gift with nowhere to go is worth saying out loud.
      log(`${def.emoji} ${def.name} had something for you, and your workbench is full.`, 'warn');
    }
    if (r.note) {
      const card = patronCard(p);
      if (card) { pulse(card, 'patron--firing', 520); floatText(card, r.note, 'fl-points', { dy: -44 }); }
    }
    for (const line of r.say ?? []) said.push(`${def.emoji} ${line}`);
    // Something to SHOW over the card rather than say: the Wordler's marking.
    // Held longer than its handful of characters would earn, because squares
    // are read slower than words and this one has to be memorised.
    if (r.bubble) {
      const card = patronCard(p);
      if (card) speechBubble(card, r.bubble, { cls: 'speech-bubble--wordle', duration: 2600 });
    }
  }
  return { burned: [...burned.values()], said };
}

// Tiles thrown away, offered to whoever cares. Runs after they've left the rack
// but before the hand tops up, so a patron that paints one is writing to a tile
// already filed in the discard pile — and to the collection, which is what makes
// the change outlast the page.
//
// SEAT ORDER IS THE RULE OF PRECEDENCE, here and in every hook loop: patrons
// fire in the order they were seated, and a tile one of them consumes is out of
// every later seat's reach. That is a promise to the player, not an accident of
// iteration (tempered by pickiness: a pair the crucible refuses falls through to
// the next seat). Future conflicting patrons resolve the same way; don't
// special-case an ordering here.
//
// Returns the tiles a patron recoloured; the tiles destroyed outright, which
// must be unfiled from the pile and burned away rather than flown to it; and the
// tiles recast with a second face, so the new letter can be shown first.
function runDiscardHooks(tiles) {
  const painted = [];
  const merged  = [];
  const trashed = new Map();   // id → tile (already gone from the collection)
  for (const p of allSeats()) {
    const def = patronById(p.id);
    if (!def?.onDiscard) continue;
    p.data ??= {};
    const r = def.onDiscard({
      tiles: tiles.filter(t => !trashed.has(t.id)),   // ash is out of everyone's reach
      state, data: p.data,
      paint: paintTile,
      trash: t => !!trashFromCollection(t.tid),
      merge: mergeTiles,
      grow:  growTile,
      bench: benchPut,
    });
    if (!r) continue;
    for (const t of r.trashed ?? []) trashed.set(t.id, t);
    if (r.painted?.length) painted.push(...r.painted);
    if (r.merged?.length) merged.push(...r.merged);
    if (r.note) {
      const card = patronCard(p);
      if (card) { pulse(card, 'patron--firing', 520); floatText(card, r.note, 'fl-points', { dy: -44 }); }
    }
  }
  // A trashed tile was filed in the pile a moment ago; unfile it, or the
  // inspector would keep showing a tile whose template no longer exists.
  if (trashed.size) state.discardPile = state.discardPile.filter(t => !trashed.has(t.id));
  return { painted, trashed: [...trashed.values()], merged };
}

// A tile caught by the vat takes its colour where it stands, held a beat before
// it files away. These tiles are already out of state.rack, so there is no
// re-render coming to carry the news: the glyph is recoloured on the element by
// hand, which the discard flight then clones and carries to the pile.
async function animateDip(painted, els) {
  const byId = new Map(els.map(el => [el.dataset.id, el]));
  let shown = 0;
  for (const { tile, colour } of painted) {
    const el = byId.get(String(tile.id));
    if (!el) continue;
    const glyph = COLOURS[colour].glyph;
    const letter = el.querySelector('.tile-letter');
    if (letter) letter.style.color = glyph;
    el.style.setProperty('--glow', glyph);
    pulse(el, 'tile--set-glow', 620);
    sparkleBurst(el, 9);
    floatText(el, COLOURS[colour].label, `fl-set fl-set--${colour}`, { dy: -52 });
    shown++;
  }
  if (!shown) return;
  sfx.chime();
  await sleep(ANIM.stepColour);
}

// A burned tile flares, chars, and crumbles where it sits — no flight to the
// discard pile, because there's nothing left to file.
async function animateBurn(els) {
  if (!els.length) return;
  sfx.burn();
  for (const el of els) {
    el.classList.add('tile--burning');
    sparkleBurst(el, 10);
  }
  await sleep(ANIM.stepBurn);
  for (const el of els) el.style.visibility = 'hidden';
}

// Patrons that put something in your hand as a page is dealt. Returns the
// tiles they struck, so they can fly in alongside the opening draw.
function runPageHooks() {
  const arrivals = [], notes = [];
  for (const p of allSeats()) {
    const def = patronById(p.id);
    if (!def?.onPageStart) continue;
    p.data ??= {};
    const r = def.onPageStart({ state, data: p.data, cast: castTile });
    if (!r) continue;
    arrivals.push(...(r.tiles ?? []));
    if (r.note) notes.push(`${def.name}: ${r.note}`);
  }
  return { arrivals, notes };
}

// The Dabbler's splashes happen deep in paintTile, far below anywhere that can
// speak: they queue in state.js and drain into the log here.
function reportPaintEchoes() {
  for (const e of takePaintEchoes()) {
    log(`🖍️ The Dabbler splashes ${e.letter} ${COLOURS[e.colour].label.toLowerCase()} as well.`, 'good');
  }
  // The Revenant's raisings queue and drain the same way.
  for (const e of takeGhostEchoes()) {
    log(`💀 The Revenant walks ${e.letter} back out of the hellbox in ghost metal — it costs you no room in the hand.`, 'good');
  }
}

// Patrons that read the hand a page finished with — fired as the quota clears,
// before the Market opens, so what they bank is waiting at its stalls.
function runPageCompleteHooks() {
  const notes = [];
  for (const p of allSeats()) {
    const def = patronById(p.id);
    if (!def?.onPageComplete) continue;
    p.data ??= {};
    const r = def.onPageComplete({ state, data: p.data });
    if (r?.note) notes.push(`${def.emoji} ${def.name}: ${r.note}`);
  }
  return notes;
}

function runChapterHooks() {
  const notes = [];
  for (const p of allSeats()) {
    const def = patronById(p.id);
    if (!def?.onChapterEnd) continue;
    p.data ??= {};
    const r = def.onChapterEnd({ state, data: p.data });
    if (r?.note) notes.push(`${def.name}: ${r.note}`);
  }
  return notes;
}

// ─── Submit (PRINT) ───────────────────────────────────────────────────────────

async function submitWord() {
  if (state.isAnimating || state.inMarket || state.inColophon || state.gameOver) return;
  const w = getWordString();
  if (!w) return;
  hidePopover();
  cancelDiscardMode(true);
  cancelSundryMode(true);

  if (!dictLoaded) { log('The dictionary is still loading…', 'warn'); return; }

  // Marks ride at the end of a word, and only as ?, ! or ?!. The dictionary
  // never sees them — it's the letters in front that have to be a word.
  const parts = splitMarks(w.toUpperCase());
  const reject = msg => {
    log(msg, 'bad');
    sfx.bad();
    pulse($('word'), 'word-groove--reject', 420);
  };
  if (!parts)          return reject('Marks go last, as ? or ! or ?!.');
  if (!parts.letters)  return reject('A mark needs a word in front of it.');
  // The fleuron decorates the page, never a word: alone it stands, beside
  // anything else it is refused before the dictionary is even asked.
  const fleuronAlone = parts.letters === FLEURON;
  if (parts.letters.includes(FLEURON) && !fleuronAlone) {
    return reject('The fleuron sets no word — it prints alone.');
  }
  // A medieval sort stands for ordinary letters, so the word is READ before it
  // is judged: every reading is tried, in the sort's own order, and the first
  // through any door — dictionary, lexicon patron, pardon — is the one the rest
  // of the print uses. That is what lets the patrons, the editors and the measure
  // see THORN where the board shows þORN. (resolveMedieval in patrons.js does the
  // same for the live preview.)
  const readings = medievalExpansions(parts.letters) ?? [parts.letters];
  let pardoned = null;
  let vouched = null;   // patron id — the lexicon patrons vouch, they don't pardon
  if (!fleuronAlone && !readings.some(r => DICT.has(r))) {
    // The lexicon patrons are checked before the pardons: their entries are
    // legitimate in their own right, not misspellings of something else.
    const stenographed = owns('stenographer') && readings.find(r => THEME_SETS.acronyms.has(r));
    const named        = owns('expectants')   && readings.find(r => THEME_SETS.names.has(r));
    if (stenographed)      { vouched = 'stenographer'; parts.letters = stenographed; }
    else if (named)        { vouched = 'expectants';   parts.letters = named; }
    else {
      for (const r of readings) {
        const excuse = pardonWord(r);
        if (excuse) { pardoned = excuse; parts.letters = r; break; }
      }
      if (!pardoned) return reject(`“${w}” isn't in the dictionary.`);
    }
  } else if (!fleuronAlone) {
    parts.letters = readings.find(r => DICT.has(r));
  }

  state.isAnimating = true;
  renderButtons();

  const script = computeScore(state.word);
  const ro = readoutEls();

  // Start the readout from zero so the build-up reads clearly
  setNum(ro.points, 0); setNum(ro.total, 0);
  renderChips(null);
  ro.root.classList.remove('readout--idle');
  ro.root.classList.add('readout--live');

  let pointsSoFar = 0;

  // ── Pass ½: the brush ──────────────────────────────────────────────────────
  // The patrons who PAINT a tile go before anything is counted, so everything
  // below — the tile's own Points, the colour multipliers, the seats that care
  // about colour — counts a tile that is simply that colour now.
  for (const brush of script.tilePaintSteps ?? []) {
    const card = patronCard(brush);
    if (card) pulse(card, 'patron--firing', 520);
    for (const hit of brush.hits) {
      const el = wordTileEl(hit.id);
      if (!el) continue;
      const glyph = COLOURS[hit.colour].glyph;
      el.classList.remove('tile--illuminating');
      el.querySelector('.tile-letter')?.style.setProperty('color', glyph);
      el.style.setProperty('--glow', glyph);
      pulse(el, 'tile--painted', 620);
      sparkleBurst(el, 9);
      floatText(el, `${brush.emoji} ${COLOURS[hit.colour].label}`, `fl-set fl-set--${hit.colour}`, { dy: -52 });
    }
    sfx.chime();
    await sleep(ANIM.stepColour);
  }

  // ── Pass 0: patrons write onto the tiles ───────────────────────────────────
  // The patrons who improve the tiles themselves go before any tile pays; the
  // tile's own corner figure is what pass 1 pays out. This adds nothing to the
  // running total — it is why the numbers below are as big as they are.
  for (const boost of script.tileBoostSteps ?? []) {
    const card = patronCard(boost);
    if (card) pulse(card, 'patron--firing', 520);
    sfx.aura();
    for (const hit of boost.hits) {
      const el = wordTileEl(hit.id);
      if (el) {
        pulse(el, 'tile--boosted', 520);
        floatText(el, `${boost.emoji} +${hit.delta}`, 'fl-boost');
      }
    }
    await sleep(ANIM.stepBoost);
  }

  // ── Pass 1: each tile pops and pays its Points ─────────────────────────────
  let i = 0;
  for (const step of script.tileSteps) {
    const el = wordTileEl(step.id);
    if (el) {
      pulse(el, 'tile--scoring', 360);
      floatText(el, `+${step.points}`, 'fl-points');
      if (step.refresh) { floatText(el, '↻ Discard', 'fl-refresh', { dy: -70 }); }
      if (step.returns) { floatText(el, '↩ to bag', 'fl-return', { dy: -88 }); }
      if (step.coins)   { floatText(el, `+${coinHTML(step.coins)}`, 'fl-coin', { dy: -70 }); sfx.coin(); }
    }
    sfx.tick(i++);
    pointsSoFar += step.points;
    tweenNum(ro.points, pointsSoFar);
    await sleep(ANIM.stepTile);
  }

  // ── Pass 2: nicks multiply their targets ───────────────────────────────────
  for (const nick of script.nickSteps) {
    const src = wordTileEl(nick.sourceId);
    if (src) pulse(src, 'tile--nick-firing', 480);
    sfx.aura();
    for (const hit of nick.hits) {
      const el = wordTileEl(hit.id);
      if (el) { pulse(el, 'tile--nick-hit', 460); floatText(el, `×${NICKS[nick.kind].mult}`, 'fl-aura'); }
      pointsSoFar += hit.delta;
    }
    tweenNum(ro.points, pointsSoFar);
    await sleep(ANIM.stepNick);
  }

  // ── Pass 3: colour multipliers ─────────────────────────────────────────────
  for (const step of script.colourSteps) {
    const glow  = MULT_TRACKS[step.colour]?.glyph ?? '#8a5fb0';
    const label = MULT_TRACKS[step.colour]?.label ?? 'Purple';
    for (const id of step.ids) {
      const el = wordTileEl(id);
      if (el) {
        el.style.setProperty('--glow', glow);
        pulse(el, 'tile--set-glow', 620);
      }
    }
    sfx.chime();
    // The measure's arithmetic and its flourish are one floater, not two that
    // would collide on the same beat (flourishTime, js/anim.js).
    if (step.colour === 'length') {
      const line = `${step.count} letters — ×${fmtMult(step.mult)} Mult: ${lengthFlourish(step.count)}`;
      floatText($('word'), line, 'fl-flourish', { dy: -138, duration: flourishTime(line) });
      sparkleBurst($('word'), Math.min(6 + step.count, 18));
    } else {
      floatText($('word'), `${label} ×${fmtMult(step.mult)}`, `fl-set fl-set--${step.colour}`, { dy: -60 });
    }
    setChip(ro.chip(step.colour), step.mult);
    pulse(ro.chip(step.colour), 'chip--pop', 420);
    await sleep(ANIM.stepColour);
  }

  // ── Pass 4: patrons weigh in ───────────────────────────────────────────────
  for (const p of script.patronSteps) {
    const card = patronCard(p);
    if (card) {
      pulse(card, 'patron--firing', 520);
      const cls = p.coins ? 'fl-coin' : p.points ? 'fl-points' : 'fl-mult';
      floatText(card, p.coins ? `+${coinHTML(p.coins)}` : p.text, cls, { dy: -44 });
    } else {
      // A step with no seat of its own — the curse's toll, the editor's verdict
      // — still has to be seen, so it rises over the word instead.
      const cls = p.id === 'cursed' ? 'fl-curse'
                : p.id === 'boss'   ? (p.spiked ? 'fl-spike' : 'fl-mult')
                :                     'fl-points';
      floatText($('word'), p.text, cls, { dy: -60 });
      if (p.id === 'boss') pulse($('bossBar'), p.spiked ? 'boss-bar--spiking' : 'boss-bar--firing', 520);
    }
    // Patrons act on the running score in seat order, so the readout follows it
    // seat by seat: a ×Mult patron visibly multiplies what the seats in front of
    // it built. Steps that only pay Coins carry the same figure and move nothing.
    if (p.running != null && p.running !== pointsSoFar) {
      pointsSoFar = p.running;
      tweenNum(ro.points, pointsSoFar);
      sfx.tick(8);
    }
    if (p.spiked) sfx.bad();
    else if (p.mult || p.xmult) sfx.mult();
    if (p.coins) sfx.coin();
    await sleep(ANIM.stepPatron);
  }

  // ── Finale: the total lands ────────────────────────────────────────────────
  sfx.total();
  await tweenNum(ro.total, script.total, { duration: 480 });
  sparkleBurst(ro.total, script.total >= state.quota ? 18 : 10);
  pulse(ro.root, 'readout--slam', 500);
  patronReactions(script);   // fire-and-forget flavour — never blocks the flow
  await sleep(ANIM.holdTotal);

  // ── Commit ─────────────────────────────────────────────────────────────────
  const printed = [...state.word];
  const rectOf = new Map(printed.map(t => [t.id, wordTileEl(t.id)]).filter(([, el]) => el)
    .map(([id, el]) => [id, { el, r: rect(el) }]));

  state.pageScore  += script.total;
  state.totalScore += script.total;
  state.coins      += script.coins;
  state.discards    = Math.min(state.discardsMax, state.discards + script.refresh);
  state.wordsLeft   = Math.max(0, state.wordsLeft - 1);
  state.wordsPrinted += 1;
  state.stats.words += 1;
  if (script.total > state.stats.bestScore) {
    state.stats.bestScore = script.total;
    state.stats.bestWord  = script.word;
  }
  recordWord(script.word, script.total);

  // This word is spent, so the Gambler's coin goes back in the air — here
  // rather than in the score effect, which re-runs on every keystroke.
  rollGamble();

  // The tongs' heat went into this word; the furnace is cold again for the next.
  state.tongsBonus = 0;

  // The editor's memory moves on likewise — chains advance, bars re-set,
  // tempers and measures re-roll — here and never during scoring.
  bossOnPrinted(state, script, parts.letters);

  // Patrons that reach beyond the score fire before the tiles retire, so a
  // grown tile carries its growth wherever it goes next (even back to the bag).
  const { burned, said } = runPrintedHooks(printed, script);
  reportPaintEchoes();   // the Arsonist, Nudist or Illuminator may have painted
  if (burned.length) {
    await animateBurn(burned.map(t => rectOf.get(t.id)?.el).filter(Boolean));
  }

  // The wash comes off before the tiles retire, so The Fountain sees them bare:
  // an azure wash buys the multiplier, not the trip back to the bag.
  washOff(printed);

  // Ash goes nowhere at all: burned tiles never reach the retire list.
  const burnedIds = new Set(burned.map(t => t.id));
  const { toBag, toPile } = retirePrinted(printed.filter(t => !burnedIds.has(t.id)));
  state.word.length = 0;

  let msg = `”${script.word}” — ${script.points.toLocaleString()} × ${fmtMult(script.mult)} = ${script.total.toLocaleString()}.`;
  if (script.coins)   msg += `  +${script.coins} Coin${script.coins > 1 ? 's' : ''}.`;
  if (script.refresh) msg += `  +${script.refresh} Discard${script.refresh > 1 ? 's' : ''}.`;
  if (toBag.length)   msg += `  ${toBag.length} slipped back into the bag.`;
  if (burned.length)  msg += `  ${burned.length} burned to ash.`;
  if (pardoned) {
    const def = patronById(pardoned.id);
    msg += `  ${def.emoji} ${def.name} lets it stand for ${pardoned.stands}.`;
  }
  if (vouched === 'stenographer') msg += `  📟 The Stenographer vouches for it.`;
  if (vouched === 'expectants')   msg += `  🤰 The Expectant Parents had that very name on their list.`;
  for (const line of said) msg += `  ${line}`;
  log(msg, 'good');

  // Said after the score, so the notice isn't the line the score writes over.
  noticeTheCat(script);
  await roseCrowns(printed);
  await editorEats();
  await ripperStrikes(script);

  renderWord();
  const pick = list => list.map(t => rectOf.get(t.id)).filter(Boolean);
  await animateDiscard(pick(toPile));
  if (toBag.length) await animateDiscard(pick(toBag), bagRect(), 'bagBtn');

  renderAllStable();

  // ── Outcomes ───────────────────────────────────────────────────────────────
  // Check the quota BEFORE topping the rack up: announcing "page complete"
  // straight after dealing a fresh hand you never get to use reads as a bug.
  if (state.pageScore >= state.quota) { state.isAnimating = false; await pageComplete(); return; }
  if (state.wordsLeft === 0)          { state.isAnimating = false; await gameLost(); return; }

  // Anything the editor lends is replaced before the hand tops up, so the
  // places it holds are never briefly free for the draw to take.
  const relent = bossReplenish(state, castLentTile, lentInHand);
  const drawn = drawUpToRackSize();
  await animateDraw([...relent, ...drawn]);

  state.isAnimating = false;
  renderAll();

  if (state.rack.length === 0 && !state.bag.length) { await gameLost(); return; }
}

// renderAll minus word/readout churn mid-animation
function renderAllStable() {
  renderRack();
  renderCounts();
  renderButtons();
  persist();
}

// ─── Page completion → Shop ────────────────────────────────────────────────

async function pageComplete() {
  state.isAnimating = true;
  state.stats.pages += 1;
  sfx.win();
  const bossDef = state.boss ? bossById(state.boss.id) : null;
  await showBanner(
    bossDef ? 'Deadline met' : 'Page complete',
    bossDef
      ? `${bossDef.emoji} ${bossDef.name} is satisfied — ${state.pageScore.toLocaleString()} of ${state.quota.toLocaleString()}`
      : `${state.pageScore.toLocaleString()} of ${state.quota.toLocaleString()} — ${chapterTitle(state.chapter)}`);

  for (const note of runPageCompleteHooks()) log(note, 'good');

  const reward = computeReward();
  state.coins += reward.total;

  state.isAnimating = false;

  // A cleared chapter pays its Colophon BEFORE the Market opens, so the upgrade
  // is in hand while you shop: an extra seat or workbench slot changes what is
  // worth buying, and being handed it afterwards made the pick feel academic.
  // The reward breakdown waits on state (and so rides the save) until the
  // Market is ready for it.
  state.pendingReward = { parts: reward.parts, total: reward.total };
  if (state.page === PAGES_PER_CHAPTER && offerColophon()) return;
  openTheMarket();
}

// Open the Colophon if it has anything left to offer. Returns false when the
// pool is spent — the skip grant is paid and the caller carries straight on.
function offerColophon() {
  openColophon();
  renderAll();
  if (colophon.offers.length) { renderColophon(); return true; }
  closeColophon();
  renderColophon();
  applyColophonSkip();
  renderAll();
  return false;
}

// The Market, with whatever the page paid: straight after an ordinary page, and
// after the Colophon on the page that ends a chapter.
export function openTheMarket() {
  const { parts = [], total = 0 } = state.pendingReward ?? {};
  state.pendingReward = null;
  openMarket(parts, total);
  renderAll();
  renderMarket();
}

// ─── Leaving the Shop → next page ──────────────────────────────────────────

async function beginNextPage() {
  closeMarket();
  renderMarket();

  // Victory check: the final Deadline of the last chapter was just cleared
  const finishedFinalPage = state.chapter === FINAL_CHAPTER && state.page === PAGES_PER_CHAPTER;
  if (finishedFinalPage && !state.endless) {
    state.endless = true;
    persist();
    showVictory();
    return;   // advance continues when they pick an overlay action
  }

  await advancePage();
}

async function advancePage() {
  const newChapter = state.page === PAGES_PER_CHAPTER;
  if (newChapter) { state.page = 1; state.chapter += 1; }
  else            { state.page += 1; }

  // Chapter-end patrons (the dye commons) act before the new bag is shuffled,
  // so what they paint is in play from the first draw.
  const chapterNotes = newChapter ? runChapterHooks() : [];
  if (newChapter) reportPaintEchoes();   // a dye's coat may have splashed

  state.isAnimating = true;

  // Sweep the table back into the bag
  const sweepRects = [...document.querySelectorAll('#rack .tile, #word .tile')]
    .slice(0, 12)
    .map(el => ({ el, r: rect(el) }));
  startPage();
  renderAll();
  const to = bagRect();
  const flights = [];
  for (const { el, r } of sweepRects) {
    flights.push(flyClone(el, r, to, { duration: ANIM.fly, scaleTo: 0.25, fade: true }));
    await sleep(28);
  }
  await Promise.all(flights);
  pulse($('bagBtn'), 'pouch--bump', 300);

  if (newChapter) {
    await showBanner(chapterLabel(state.chapter), chapterTitle(state.chapter), 1350);
  }

  // The Deadline's editor is announced only now, with the page already dealt
  // in front of you — the reveal is the puzzle beginning, not a warning.
  if (isDeadline(state.page) && state.boss) {
    const def = bossById(state.boss.id);
    sfx.bad();
    // The rule is a paragraph, not a title — hold the banner long enough to
    // read it, however long that particular rule runs.
    await showBanner(`${def.emoji} ${def.name}`, def.desc, 'read');
    log(`${def.emoji} ${def.name} takes the desk. ${def.desc}`, 'warn');
  }

  // Whatever a patron brings arrives with the hand; whatever the editor lends
  // comes first, since the Eeeditor's E's take places the draw would fill.
  const { arrivals, notes } = runPageHooks();
  const lent = bossReplenish(state, castLentTile, lentInHand);
  const drawn = drawUpToRackSize();
  await animateDraw([...arrivals, ...lent, ...drawn]);

  state.isAnimating = false;
  renderAll();   // the status bar settles back to the manuscript on its own
  const said = [...chapterNotes, ...notes];
  if (said.length) log(said.join('  '), 'good');
}

// ─── Loss ─────────────────────────────────────────────────────────────────────

async function gameLost() {
  state.gameOver = true;
  sfx.lose();
  persist();
  await sleep(350);
  showGameOver();
}

// ─── Discard ──────────────────────────────────────────────────────────────────

async function doDiscard() {
  if (state.isAnimating || state.inMarket || state.inColophon || state.gameOver) return;
  hidePopover();

  // First press arms the mode; tiles are then tapped to select.
  if (!state.discardMode) {
    if (state.discards <= 0) { log('No discards left this page.', 'warn'); return; }
    cancelSundryMode(true);
    state.discardMode = true;
    log('Tap tiles to discard, then press again.');
    renderAll();
    return;
  }

  const selectedEls = [...document.querySelectorAll('#rack .tile--selected')];
  if (!selectedEls.length) { cancelDiscardMode(); return; }

  const result = discardSelected();
  if (!result) { cancelDiscardMode(); return; }
  state.discardMode = false;

  state.isAnimating = true;
  renderButtons();

  // Dipped before filed: the vat has its moment while the tiles are still on the
  // board, then they fly to the pile wearing the new colour. A drained tile burns
  // away where it sits instead — there is nothing left to file.
  const { painted: dipped, trashed, merged } = runDiscardHooks(result.removed);
  // discardSelected tops the hand up before the seats speak, so a boon that
  // WIDENS the hand (the Ragman's azure) needs a second fill. Nothing is drawn
  // twice: drawUpToRackSize only ever fills to the size of the moment.
  const drawn = [...result.drawn, ...drawUpToRackSize()];
  if (dipped.length) await animateDip(dipped, selectedEls);

  // A recast tile shows off its second face where it stands, then its
  // consumed half burns away, and only then does anything fly to the pile.
  for (const { tile, alt } of merged) {
    const el = selectedEls.find(e => e.dataset.id === String(tile.id));
    if (!el) continue;
    pulse(el, 'tile--set-glow', 620);
    sparkleBurst(el, 9);
    floatText(el, `${getActiveLetter(tile)} | ${alt}`, 'fl-points', { dy: -52 });
  }
  if (merged.length) { sfx.chime(); await sleep(ANIM.stepColour); }

  const trashedIds = new Set(trashed.map(t => String(t.id)));
  const trashedEls = selectedEls.filter(el => trashedIds.has(el.dataset.id));
  if (trashedEls.length) await animateBurn(trashedEls);
  await animateDiscard(selectedEls.filter(el => !trashedIds.has(el.dataset.id))
    .map(el => ({ el, r: rect(el) })));
  await animateDraw(drawn);

  state.isAnimating = false;
  renderAll();

  reportPaintEchoes();   // the Dipper or Bloodletter may have painted

  let msg = `Discarded ${result.removed.length} tile${result.removed.length > 1 ? 's' : ''}.`;
  if (merged.length) {
    msg += `  Two recast as one: ${merged.map(m => `${getActiveLetter(m.tile)}|${m.alt}`).join(', ')}.`;
  } else if (trashed.length) {
    msg += `  ${trashed.length} destroyed for good.`;
  }
  if (!drawn.length && !state.bag.length) msg += '  The bag is empty.';
  log(msg);

  if (state.rack.length === 0 && !state.bag.length && state.word.length === 0) {
    await gameLost();
  }
}

// ─── Keyboard ─────────────────────────────────────────────────────────────────

document.addEventListener('keydown', e => {
  if (state.inMarket || state.inDraft || state.inColophon || state.isAnimating || state.gameOver) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if ($('settingsModal')?.classList.contains('show')) return;
  if ($('inspectorModal')?.classList.contains('show')) {
    if (e.key === 'Escape') closeInspector();
    return;
  }
  if (ghostsOpen()) {
    if (e.key === 'Escape') closeGhosts();
    return;
  }

  if (e.key === 'Enter')  { submitWord(); return; }
  if (e.key === 'Escape') {
    hidePopover();
    if (!cancelSundryMode() && !cancelDiscardMode()) { clearWord(); renderAll(); }
    return;
  }
  if (e.key === ' ')      { e.preventDefault(); shuffleRack(); renderAll(); return; }

  if (e.key === 'Backspace') {
    e.preventDefault();
    const t = state.word.pop();
    if (t) state.rack.push(t);
    renderAll();
    return;
  }

  const L = e.key.toUpperCase();
  if (L.length !== 1 || L < 'A' || L > 'Z') return;
  const target = L === 'Q' ? 'QU' : L;
  const t = state.rack.find(t =>
    (t.letterType === 'dual' && t.activeVariant === 1 ? t.altLetter : t.letter) === target);
  if (t && TILE_POINTS[target]) { moveRackToWord(t.id); renderAll(); }
});

// ─── Buttons & delegation ─────────────────────────────────────────────────────

$('btnPrint')?.addEventListener('click', submitWord);
$('btnClear')?.addEventListener('click', () => {
  if (state.isAnimating) return;
  hidePopover();
  if (!cancelSundryMode() && !cancelDiscardMode()) { clearWord(); renderAll(); }
});
$('btnShuffle')?.addEventListener('click', () => { if (!state.isAnimating) { shuffleRack(); renderAll(); } });
$('btnDiscard')?.addEventListener('click', doDiscard);

// The workbench: first tap arms a tool, board taps pick its targets, a second
// tap on the tool spends it (or puts it away if nothing is chosen). Every tool
// shares that rhythm — the ratchet's arrows only say which way it points.
$('sundries')?.addEventListener('click', async e => {
  if (state.isAnimating || state.inMarket || state.inDraft || state.inColophon || state.gameOver) return;
  // The ✕ is caught before the slot it sits on, so binning a tool can't also
  // arm it.
  const bin = e.target.closest('[data-discard-sundry]');
  if (bin) { throwSundryAway(Number(bin.dataset.discardSundry)); return; }
  const slot = e.target.closest('[data-sundry]');
  if (!slot) return;
  hidePopover();
  await useSundry(Number(slot.dataset.sundry), e);
});

// Arming a tool is one tap; picking its target is the second, and the second
// SPENDS it — js/drag.js calls back here the moment a target is chosen. Going
// back up to the tool to confirm was a click that asked nothing and told you
// nothing. The tongs are the exception (see spendsOnPick).
async function useSundry(idx, e = null) {
  const armed = state.sundries[idx];

  // Reading the arrow first means a tap that lands on one both turns the tool
  // around and does whatever that tap was going to do anyway. There is no event
  // at all when the board calls in — the tile was the tap.
  const arrow = e?.target?.closest?.('[data-shift]');
  if (arrow && armed?.kind === 'ratchet') state.ratchetDir = Number(arrow.dataset.shift);

  if (armed?.kind === 'reshuffle') {
    log('Spend this at the Market or the Colophon.', 'warn');
    return;
  }

  // A wrapped tile needs no target: the paper comes off there and then, and what
  // is under it is rolled at this moment rather than at the shop.
  if (armed?.kind === 'wrapped') {
    cancelDiscardMode(true);
    cancelSundryMode(true);
    const content = pickWrapped();
    const isMarkTile = content === 'mark';
    const m = MATERIALS[content];
    const tile = isMarkTile ? castMarkTile() : castMaterialTile(content);
    state.sundries.splice(idx, 1);

    state.isAnimating = true;
    renderAll();
    sfx.chime();
    const el = rackTileEl(tile.id);
    if (el) {
      await flyClone(el, bagRect(), rect(el), { duration: ANIM.fly, scaleFrom: 0.3 });
      popReveal(el);
      sparkleBurst(el, 14);
      floatText(el, isMarkTile ? `${TRIMS[MARK_TRIM].label} mark` : m.label,
                isMarkTile ? 'fl-set fl-set--purple' : `fl-set fl-mat--${content}`);
    }
    await sleep(ANIM.stepColour);
    state.isAnimating = false;
    renderAll();
    log(isMarkTile
      ? `The wrapping comes off: a “${getActiveLetter(tile)}”, ${TRIMS[MARK_TRIM].label.toLowerCase()}-trimmed — no shop sells marks, and it is yours for good.`
      : `The wrapping comes off: ${getActiveLetter(tile)}, struck in ${m.metal.toLowerCase()} — ${m.label.toLowerCase()}, and yours for good.`,
      'good');
    return;
  }

  // A package opens exactly as a wrapped tile does, and what is inside is rolled
  // AT THIS MOMENT rather than when it was sent. Its own slot is freed first, so
  // a package holding a tool can hand it into the space the package occupied.
  if (armed?.kind === 'package' && PACKAGES[armed.theme]) {
    cancelDiscardMode(true);
    cancelSundryMode(true);
    const pkg = PACKAGES[armed.theme];
    const prize = pickLoot(pkg.loot);
    state.sundries.splice(idx, 1);          // the paper comes off first

    state.isAnimating = true;
    renderAll();
    sfx.chime();
    const said = await openPackage(prize, pkg);
    await sleep(ANIM.stepColour);
    state.isAnimating = false;
    renderAll();
    log(`${pkg.emoji} ${pkg.label} — ${said}`, 'good');
    reportPaintEchoes();
    return;
  }

  // An applicator arms with its offer laid out exactly as a tube does, and shares
  // the tube's code below; only the filter differs (see offerFilter).
  if (armed?.kind === 'applicator' && state.sundryMode !== idx) {
    cancelDiscardMode(true);
    cancelSundryMode(true);
    clearAllSelected();
    const offer = rollTubeOffer(armed);
    if (!offer) { log('Nothing in your hand will take a new metal — the applicator keeps.', 'warn'); return; }
    state.sundryMode = idx;
    const look = APPLICATORS[armed.material];
    log(offer.length === 2
      ? `The applicator offers two tiles — tap the one to strike in ${look.label.toLowerCase()}.`
      : `Only one tile will take a new metal — tap it.`);
    renderAll();
    return;
  }

  if (armed?.kind === 'applicator') {
    if (!sundrySelected().length) { cancelSundryMode(); return; }
    const result = applySundry(idx);
    if (!result) { cancelSundryMode(); return; }

    state.isAnimating = true;
    renderAll();
    sfx.chime();
    const el = wordTileEl(result.ids[0]) ?? rackTileEl(result.ids[0]);
    if (el) {
      popReveal(el);
      sparkleBurst(el, 11);
      floatText(el, MATERIALS[result.material].label, `fl-set fl-mat--${result.material}`);
    }
    await sleep(ANIM.stepColour);
    state.isAnimating = false;
    renderAll();
    log(`${result.letters[0]} is struck in ${MATERIALS[result.material].metal.toLowerCase()} — ${MATERIALS[result.material].desc}`, 'good');
    return;
  }

  // The toolbox opens where it sits: two DIFFERENT tools from the pool take its
  // place — the first in the box's own slot (always room for that one), the
  // second only if the bench has a free slot, else it rolls away.
  if (armed?.kind === 'toolbox') {
    cancelDiscardMode(true);
    cancelSundryMode(true);
    const pickOne = arr => arr[Math.floor(Math.random() * arr.length)];
    const first  = pickOne(TOOLBOX_POOL);
    const second = pickOne(TOOLBOX_POOL.filter(k => k !== first));
    state.sundries[idx] = { kind: first };
    const roomForSecond = state.sundries.length < effectiveSundrySlots();
    if (roomForSecond) state.sundries.push({ kind: second });

    // Named through sundryTip rather than TOOL_LOOK: the pool holds the ratchet,
    // which draws itself with arrows and so has no TOOL_LOOK entry.
    const nameOf = k => sundryTip({ kind: k })?.head ?? k;

    state.isAnimating = true;
    renderAll();
    sfx.chime();
    const bench = $('sundries');
    if (bench) {
      sparkleBurst(bench, 12);
      floatText(bench, roomForSecond
        ? `${nameOf(first)} · ${nameOf(second)}`
        : nameOf(first), 'fl-points', { dy: -46 });
    }
    await sleep(ANIM.stepColour);
    state.isAnimating = false;
    renderAll();
    log(roomForSecond
      ? `The toolbox opens: a ${nameOf(first).toLowerCase()} and a ${nameOf(second).toLowerCase()}.`
      : `The toolbox opens: a ${nameOf(first).toLowerCase()} — no room on the bench for the second tool, and it rolls away.`,
      'good');
    return;
  }

  // The laurel needs no target either — it picks its own head to crown, and dies
  // with the seat. A crown pays at that seat's turn in the running order, so
  // where it lands decides what it is worth.
  // Uncorked on a tap: it has no target to pick, and the seat it fills is its
  // own choice. It KEEPS when there is no room or no rare left to call on —
  // a gift you cannot use yet is not a gift you should lose.
  if (armed?.kind === 'potion') {
    const seat = grantRandomPatron(PATRON_DEFS, 'rare');
    if (!seat) {
      log(state.patrons.length >= effectivePatronSlots()
        ? 'No empty seat at your table — the potion stays corked.'
        : 'Every rare patron is already yours — the potion stays corked.', 'warn');
      return;
    }
    cancelDiscardMode(true);
    cancelSundryMode(true);
    state.sundries.splice(idx, 1);

    state.isAnimating = true;
    renderAll();
    sfx.chime();
    const card = patronCard(seat);
    if (card) {
      pulse(card, 'patron--firing', 620);
      sparkleBurst(card, 12);
      floatText(card, '🧪 smitten', 'fl-points', { dy: -44 });
    }
    await sleep(ANIM.stepColour);
    state.isAnimating = false;
    renderAll();
    const def = patronById(seat.id);
    log(`The potion is uncorked — ${patronName(def, seat.data)} is smitten, and takes a seat for nothing.`, 'good');
    return;
  }

  if (armed?.kind === 'laurel') {
    if (!state.patrons.length) { log('No patron seated to crown — the laurel keeps.', 'warn'); return; }
    cancelDiscardMode(true);
    cancelSundryMode(true);
    const seat = state.patrons[Math.floor(Math.random() * state.patrons.length)];
    seat.data ??= {};
    seat.data.honorifics = (seat.data.honorifics ?? 0) + 1;
    state.sundries.splice(idx, 1);

    state.isAnimating = true;
    renderAll();
    sfx.chime();
    const card = patronCard(seat);
    if (card) {
      pulse(card, 'patron--firing', 620);
      sparkleBurst(card, 9);
      floatText(card, `🏵️ +${HONORIFIC_STEP}`, 'fl-points', { dy: -44 });
    }
    await sleep(ANIM.stepColour);
    state.isAnimating = false;
    renderAll();
    const def = patronById(seat.id);
    const name = patronName(def, seat.data);
    const n = seat.data.honorifics;
    log(`🏵️ ${name} is crowned — +${HONORIFIC_STEP} Points on every word, paid at that seat's turn, while the seat is kept${n > 1 ? ` (${n} laurels now)` : ''}.`, 'good');
    return;
  }

  // The wash pours itself: up to four unpainted tiles in the hand, one of each
  // colour, no aiming. Faint on the tile, full-strength in the score.
  if (armed?.kind === 'wash') {
    cancelDiscardMode(true);
    cancelSundryMode(true);
    const washed = applyWash();
    if (!washed.length) { log('Nothing in your hand will take the wash — it keeps.', 'warn'); return; }
    state.sundries.splice(idx, 1);

    state.isAnimating = true;
    renderAll();
    sfx.chime();
    for (const { tile, colour } of washed) {
      const el = wordTileEl(tile.id) ?? rackTileEl(tile.id);
      if (!el) continue;
      el.style.setProperty('--glow', COLOURS[colour].glyph);
      pulse(el, 'tile--set-glow', 620);
      sparkleBurst(el, 6);
    }
    await sleep(ANIM.stepColour);
    state.isAnimating = false;
    renderAll();
    const said = washed.map(w => `${getActiveLetter(w.tile)} ${COLOURS[w.colour].label.toLowerCase()}`);
    log(`The wash settles: ${said.join(', ')} — faint, and spent when each tile prints.`, 'good');
    return;
  }

  // A tube arms with its offer already on the table: up to two unpainted tiles
  // light up; tapping one pours. Tapping the tube again puts it away. The tube
  // chooses the candidates, you choose between them.
  if (armed?.kind === 'tube' && state.sundryMode !== idx) {
    cancelDiscardMode(true);
    cancelSundryMode(true);
    clearAllSelected();
    const offer = rollTubeOffer(armed);
    if (!offer) { log('Nothing in your hand will take paint — the tube keeps.', 'warn'); return; }
    state.sundryMode = idx;
    log(offer.length === 2
      ? 'The tube offers two tiles — tap the one to paint.'
      : 'Only one tile will take paint — tap it.');
    renderAll();
    return;
  }

  if (armed?.kind === 'tube') {
    if (!sundrySelected().length) { cancelSundryMode(); return; }
    const result = applySundry(idx);
    if (!result) { cancelSundryMode(); return; }

    state.isAnimating = true;
    renderAll();
    sfx.chime();
    const el = wordTileEl(result.ids[0]) ?? rackTileEl(result.ids[0]);
    if (el) {
      el.style.setProperty('--glow', COLOURS[result.colour].glyph);
      pulse(el, 'tile--set-glow', 620);
      sparkleBurst(el, 9);
      floatText(el, COLOURS[result.colour].label, `fl-set fl-set--${result.colour}`);
    }
    await sleep(ANIM.stepColour);
    state.isAnimating = false;
    renderAll();
    log(`Painted ${result.letters[0]} ${COLOURS[result.colour].label.toLowerCase()}.`, 'good');
    reportPaintEchoes();
    return;
  }

  // The ratchet and the loupe go off on the tile you tap. The tongs do not: they
  // destroy it, so they keep a confirming tap (spendsOnPick).
  if (state.sundryMode !== idx) {
    cancelDiscardMode(true);
    cancelSundryMode(true);
    clearAllSelected();
    state.sundryMode = idx;
    log(armed?.kind === 'loupe'
      ? `Tap a tile to double it — ${LOUPE_CAP} Points is the loupe's limit.`
      : armed?.kind === 'tongs'
      ? 'Tap a tile, then the tongs again to feed it to the furnace.'
      : 'Tap one letter to step it. The arrows say which way — set them first.');
    renderAll();
    return;
  }

  if (!sundrySelected().length) { cancelSundryMode(); return; }

  // The tongs destroy their tile inside applySundry, so its element has to be
  // caught before any re-render sweeps it from the rack.
  const gripped = armed?.kind === 'tongs'
    ? (wordTileEl(sundrySelected()[0]?.id) ?? rackTileEl(sundrySelected()[0]?.id))
    : null;

  const result = applySundry(idx, state.ratchetDir ?? 1);
  if (!result) { cancelSundryMode(); renderAll(); return; }

  state.isAnimating = true;

  if (result.kind === 'tongs') {
    if (gripped) await animateBurn([gripped]);
    renderAll();
    const groove = $('word');
    if (groove) floatText(groove, `+${TONGS_BONUS} to the next word`, 'fl-points', { dy: -30 });
    await sleep(ANIM.stepColour);
    state.isAnimating = false;
    renderAll();
    log(`The tongs grip ${result.letters[0]} — ash, and +${result.bonus} Points waiting on the next word.`, 'good');
    reportPaintEchoes();   // The Revenant stands over the furnace too
    return;
  }

  renderAll();
  sfx.chime();
  const el = wordTileEl(result.ids[0]) ?? rackTileEl(result.ids[0]);
  if (result.kind === 'loupe') {
    if (el) {
      popReveal(el);
      sparkleBurst(el, 10);
      floatText(el, `${result.from} → ${result.to} Points`, 'fl-points', { dy: -54 });
    }
    await sleep(ANIM.stepColour);
    state.isAnimating = false;
    renderAll();
    log(result.to < result.from * 2
      ? `The loupe doubles ${result.letters[0]} — capped at ${LOUPE_CAP} Points, for good.`
      : `The loupe doubles ${result.letters[0]} — ${result.from} becomes ${result.to}, for good.`, 'good');
    return;
  }

  if (el) {
    popReveal(el);
    sparkleBurst(el, 10);
    floatText(el, `${result.from} → ${result.to}`, 'fl-points', { dy: -54 });
  }
  await sleep(ANIM.stepColour);
  state.isAnimating = false;
  renderAll();
  log(`The ratchet steps ${result.from} to ${result.to} — and there it stays.`, 'good');
}

// Which tools go off the instant a target is picked. Everything beneficial
// does; the tongs do not, because a mis-tapped tile would be ash before you
// saw it, and the confirming tap is the only chance to change your mind.
export const spendsOnPick = kind => kind !== 'tongs';

// The board has picked a target for the armed tool — spend it where it stands.
export async function spendArmedSundry() {
  if (state.sundryMode >= 0) await useSundry(state.sundryMode);
}

$('bagBtn')?.addEventListener('click', () => { if (!state.isAnimating) openInspector('bag'); });
$('discardBtn')?.addEventListener('click', () => { if (!state.isAnimating) openInspector('discard'); });

$('manuscriptBtn')?.addEventListener('click', () => { if (!state.isAnimating) openManuscript(); });
$('manuscriptModal')?.addEventListener('click', e => {
  if (e.target.closest('[data-close-manuscript]') || e.target.id === 'manuscriptModal') closeManuscript();
});

$('inspectorModal')?.addEventListener('click', e => {
  if (e.target.closest('[data-close-inspector]') || e.target.id === 'inspectorModal') closeInspector();
});

// Patron shelf: ✕ dismisses (desktop hover); tapping the card shows its boon.
// `ref` is a seat uid or a def id — sellPatron takes either.
function dismissPatron(ref) {
  const r = sellPatron(ref);
  if (r.ok) {
    log(`${r.name} departs with thanks — ${r.refund} Coin${r.refund !== 1 ? 's' : ''} returned.`);
    if (r.headsman) log(`🪓 The Headsman approves — ×${r.headsman.mult} Mult now.`);
    renderAll();
    if (state.inMarket) renderMarket();
  }
}

// The graveyard door beside the shelf, and the sheet behind it. A ghost is
// dismissed the way a patron is — sellPatron finds it and pays nothing.
$('ghostBtn')?.addEventListener('click', () => {
  if (state.isAnimating) return;
  hidePopover();
  openGhosts();
});

$('ghostModal')?.addEventListener('click', e => {
  if (e.target.closest('[data-close-ghosts]') || e.target === $('ghostModal')) {
    closeGhosts();
    return;
  }
  const sell = e.target.closest('[data-sell-ghost]');
  if (sell) {
    const r = sellPatron(sell.dataset.sellGhost);
    if (r.ok) {
      log(`${r.name} is let go — a ghost's contract is worth nothing.`);
      if (r.headsman) log(`🪓 The Headsman approves — ×${r.headsman.mult} Mult now.`);
      renderAll();
      if (state.ghosts.length) openGhosts(); else closeGhosts();
    }
    return;
  }
  const card = e.target.closest('.patron[data-patron]');
  if (card) {
    const def = patronById(card.dataset.patron);
    const seat = state.ghosts.find(p => String(p.uid) === card.dataset.uid)
              ?? state.ghosts.find(p => p.id === card.dataset.patron);
    if (def) showPatronPopover(def, card, seat);
  }
});

$('shelf')?.addEventListener('click', e => {
  if (state.isAnimating) return;
  const sell = e.target.closest('[data-sell]');
  if (sell) { dismissPatron(sell.dataset.sell); return; }
  const card = e.target.closest('.patron[data-patron]');
  if (card) {
    const def = patronById(card.dataset.patron);
    const seat = state.patrons.find(p => String(p.uid) === card.dataset.uid)
              ?? state.patrons.find(p => p.id === card.dataset.patron);
    if (def) showPatronPopover(def, card, seat);
  }
});

// ─── The Neologist (coin a word, then bow out) ────────────────────────────────

function confirmCoinedWord() {
  const input = $('coinInput');
  const w = (input?.value || '').trim().toUpperCase();
  if (w.length !== NEOLOGIST_LENGTH || !/^[A-Z]+$/.test(w)) {
    setCoinNote(`${NEOLOGIST_LENGTH} letters, A to Z — no more, no less.`, true);
    return;
  }
  if (DICT.has(w)) {
    setCoinNote('The dictionary knows that one already.', true);
    return;
  }
  // Checked here as well as inside coinWord, so the sheet can say no rather
  // than appearing to accept a word the press then quietly drops.
  if (isExcluded(w)) {
    setCoinNote('The press will not set that one.', true);
    return;
  }
  if (!coinWord(w)) {
    setCoinNote('The press will not set that one.', true);
    return;
  }
  const i = state.patrons.findIndex(p => p.id === 'neologist');
  if (i >= 0) state.patrons.splice(i, 1);
  hideOverlay();
  renderAll();
  renderDictStatus('loaded', DICT.size);
  log(`“${w}” is a word now, and always will be. The Neologist retires, satisfied.`, 'good');
}

$('overlayModal')?.addEventListener('click', e => {
  if (e.target.closest('[data-coin-cancel]')) { hideOverlay(); return; }
  if (e.target.closest('[data-coin-confirm]')) confirmCoinedWord();
});
$('overlayModal')?.addEventListener('keydown', e => {
  if (!$('coinInput')) return;
  if (e.key === 'Enter')  { e.preventDefault(); confirmCoinedWord(); }
  if (e.key === 'Escape') { e.preventDefault(); hideOverlay(); }
});

// The Scientist's loan: a gold-trimmed OLOGY tile, cast lent so it vanishes with
// the page. Once a page — data.used latches here, re-arms in his onPageStart.
async function lendOlogyTile() {
  if (state.isAnimating || state.inMarket || state.inColophon || state.gameOver) return;
  const seat = state.patrons.find(p => p.id === 'scientist');
  if (!seat) return;
  seat.data ??= {};
  if (seat.data.used) { log('🔬 One tile per page — science has standards.', 'warn'); return; }
  seat.data.used = true;

  const tile = castLentTile('OLOGY', { aboveHand: true, lender: 'scientist', trim: 'gold' });
  state.isAnimating = true;
  renderButtons();
  renderRack(new Set([tile.id]));
  const el = rackTileEl(tile.id);
  const card = patronCard(seat);
  if (card) pulse(card, 'patron--firing', 520);
  if (el) {
    sfx.draw();
    await flyClone(el, rect(card) ?? bagRect(), rect(el), { duration: ANIM.fly, scaleFrom: 0.35 });
    popReveal(el);
    sparkleBurst(el, 9);
  }
  state.isAnimating = false;
  log('🔬 The Scientist lends a gold-trimmed OLOGY tile — for this page only.', 'good');
  renderAll();
}

// Popover actions (flip a dual tile, dismiss a patron, use a patron)
$('popover')?.addEventListener('click', e => {
  const act = e.target.closest('[data-patron-act]');
  if (act) {
    hidePopover();
    if (!state.isAnimating) {
      if (act.dataset.patronAct === 'neologist') showCoinWordSheet();
      if (act.dataset.patronAct === 'scientist') lendOlogyTile();
    }
    return;
  }
  const sell = e.target.closest('[data-sell]');
  if (sell) { hidePopover(); if (!state.isAnimating) dismissPatron(sell.dataset.sell); return; }
  // The touch route to the bench's ✕ (see showTipFor in drag.js): in the
  // Market the sundry is sold back, on the board it is simply thrown away.
  const drop = e.target.closest('[data-pop-discard]');
  if (drop) {
    hidePopover();
    if (state.isAnimating) return;
    const idx = Number(drop.dataset.popDiscard);
    if (state.inMarket) {
      const r = sellSundry(idx);
      if (r.ok) { sfx.coin(); log(`Sold back for ${r.refund} Coin.`); renderAll(); renderMarket(); }
    } else {
      throwSundryAway(idx);
    }
    return;
  }
  const flip = e.target.closest('[data-flip]');
  if (flip) {
    hidePopover();
    if (state.isAnimating || state.inMarket || state.inColophon || state.gameOver) return;
    toggleDualVariant(Number(flip.dataset.flip));
    renderAll();
  }
});

document.addEventListener('pointerdown', e => {
  if (!e.target.closest('#popover')) hidePopover();
});
window.addEventListener('scroll', () => hidePopover(), { capture: true, passive: true });


// Overlay actions (game over / victory)
$('overlayModal')?.addEventListener('click', async e => {
  const btn = e.target.closest('[data-overlay-action]');
  if (!btn) return;
  const action = btn.dataset.overlayAction;
  hideOverlay();
  if (action === 'newrun') {
    await startFreshRun();
  } else if (action === 'endless') {
    log('The appendices begin — quotas keep climbing. Good luck.');
    await advancePage();
  }
});

// ─── Settings ─────────────────────────────────────────────────────────────────

function syncSettingsUI() {
  const slider = $('animSlider');
  if (slider) slider.value = settings.animSpeed;
  setTextContent('animSpeedLabel', `×${settings.animSpeed}`);
  const snd = $('soundToggle');
  if (snd) snd.checked = settings.sound;
}

function setTextContent(id, v) { const el = $(id); if (el) el.textContent = v; }

$('settingsBtn')?.addEventListener('click', () => {
  syncSettingsUI();
  $('settingsModal')?.classList.add('show');
});
$('settingsClose')?.addEventListener('click', () => $('settingsModal')?.classList.remove('show'));
$('settingsModal')?.addEventListener('click', e => {
  if (e.target.id === 'settingsModal') $('settingsModal')?.classList.remove('show');
});

$('animSlider')?.addEventListener('input', e => {
  settings.animSpeed = Number(e.target.value);
  setTextContent('animSpeedLabel', `×${settings.animSpeed}`);
  applySpeedCSS();
  saveSettings();
});

$('soundToggle')?.addEventListener('change', e => {
  settings.sound = e.target.checked;
  saveSettings();
});

$('fileInput')?.addEventListener('change', e => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const n = loadCustom(String(reader.result || ''));
    log(`Custom word list loaded: ${n.toLocaleString()} words.`, 'good');
    renderDictStatus('loaded', n);
  };
  reader.readAsText(file);
});

$('btnNewRun')?.addEventListener('click', async () => {
  $('settingsModal')?.classList.remove('show');
  await startFreshRun();
});

// Dev helpers
$('devCoins')?.addEventListener('click', () => { state.coins += 20; renderAll(); if (state.inMarket) renderMarket(); });
$('devMarket')?.addEventListener('click', () => {
  if (state.inMarket || state.inColophon || state.isAnimating) return;
  $('settingsModal')?.classList.remove('show');
  openMarket([], 0);
  renderAll(); renderMarket();
});
$('devWinPage')?.addEventListener('click', () => {
  if (state.inMarket || state.inColophon || state.isAnimating || state.gameOver) return;
  $('settingsModal')?.classList.remove('show');
  state.pageScore = state.quota;
  pageComplete();
});

// ─── Init ─────────────────────────────────────────────────────────────────────

async function startFreshRun() {
  clearSave();
  hideOverlay();
  closeMarket();
  renderMarket();
  newRun();
  openDraft();
  renderAll();
  renderDraft();
}

// Leaving the draft → the run proper begins
async function beginRun() {
  const { painted } = applyDraft();
  closeDraft();
  renderDraft();

  startPage();          // reshuffle the bag now the drafted tiles have joined
  state.isAnimating = true;
  renderAll();
  await showBanner(chapterLabel(1), chapterTitle(1), 1250);
  const { arrivals } = runPageHooks();
  const lent = bossReplenish(state, castLentTile, lentInHand);
  const drawn = drawUpToRackSize();
  await animateDraw([...arrivals, ...lent, ...drawn]);
  state.isAnimating = false;
  renderAll();
  if (painted.length) log(`Painted ${painted.join(', ')}.`);
}

(async function init() {
  loadSettings();
  applySpeedCSS();
  initInput({ spendArmedSundry, spendsOnPick });
  initInspect();
  initShelfDrag();
  initSheets({ nextPage: beginNextPage, beginRun, openMarket: openTheMarket });

  renderDictStatus('loading', 0);
  // The exclusion list lands before a single word does: adoptWordlist and
  // adoptTheme consult it as they build their Sets. Hence this alone is awaited.
  await loadExclusions();
  if (!exclusionsLoaded) {
    log('The excluded-words list could not be read — word lists are unfiltered this session.', 'warn');
  }
  loadDict((status, count) => renderDictStatus(status, count));
  loadThemes();

  const restored = loadState();
  // A seat whose patron no longer exists is dropped rather than carried: an old
  // save would otherwise hand the shelf an id nothing answers to, which the
  // board cannot draw.
  const orphaned = restored ? state.patrons.filter(p => !patronById(p.id)).length : 0;
  if (orphaned) state.patrons = state.patrons.filter(p => patronById(p.id));

  if (!restored) {
    await startFreshRun();
  } else {
    if (state.gameOver) { renderAll(); showGameOver(); }
    else if (restored.draft) {
      restoreDraft(restored.draft);
      renderAll(); renderDraft();
    }
    else if (restored.market) {
      restoreMarket(restored.market);
      renderAll(); renderMarket();
      log('Welcome back.');
    }
    else if (restored.colophon) {
      restoreColophon(restored.colophon);
      renderAll(); renderColophon();
      log('Welcome back.');
    } else {
      bossReplenish(state, castLentTile, lentInHand);   // restore anything a mid-deal reload lost
      drawUpToRackSize();                               // top up in case a save landed mid-draw
      renderAll();
      log('Welcome back.');
    }
    // Said last, so they aren't lines "Welcome back." writes over.
    if (restored.mercury) {
      log(`The mercury trim has been retired — ${restored.mercury} tile${restored.mercury > 1 ? 's wear' : ' wears'} cobalt instead. Azure tiles find their way back to the bag through The Fountain now.`, 'warn');
    }
    if (orphaned) {
      log(`${orphaned} seat${orphaned > 1 ? 's are' : ' is'} no longer in the roster and ${orphaned > 1 ? 'have' : 'has'} left the shelf.`, 'warn');
    }
  }

  // Console access for tinkering & automated tests
  window.folio = { state, settings };

  window.addEventListener('beforeunload', persist);
})();
