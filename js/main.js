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
  effectiveWordsPerPage, rollGamble, effectivePatronSlots, nextId,
} from './state.js';
import {
  TILE_POINTS, ANIM, PAGES_PER_CHAPTER, FINAL_CHAPTER,
  REACTION, NEOLOGIST_LENGTH, MATERIALS, TRIMS, WRAPPED_CONTENTS, MARK_TRIM,
  chapterLabel, COLOURS, MULT_TRACKS, NICKS, splitMarks, isDeadline,
  FLEURON, TOOLBOX_POOL, HONORIFIC_STEP, TONGS_BONUS, LOUPE_CAP, RIPPER_WORDS, sundryTip,
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
  pulse, sparkleBurst, sfx, applySpeedCSS, speechBubble, longReadingTime,
} from './anim.js';
import { initInput, initInspect, initShelfDrag } from './drag.js';
import { patronById, doubledReading, boundNouns, patronName, patronShelf } from './patrons.js';
import { randomQuip } from './quips.js';

const $ = id => document.getElementById(id);
const rect = el => el?.getBoundingClientRect();

// ─── Tile flight helpers ───────────────────────────────────────────────────────

const bagRect  = () => rect($('bagBtn'))  ?? { left: 40, top: 300, width: 60, height: 60 };
const pileRect = () => rect($('discardBtn')) ?? { left: innerWidth - 100, top: 300, width: 60, height: 60 };

const wordTileEl = id => document.querySelector(`#word .tile[data-id="${id}"]`);
const rackTileEl = id => document.querySelector(`#rack .tile[data-id="${id}"]`);

// The shelf card for a seat or a patron step — by uid where there is one, so
// each copy of a stackable patron flashes and badges as itself.
// Where a seat's news is shown. A living patron has a card on the shelf; a
// ghost has given its card up, so its notes float over the door it now lives
// behind — the dead still visibly act, which is the whole point of keeping
// them.
const patronCard = p => document.querySelector(
  p.uid != null ? `#shelf .patron[data-uid="${p.uid}"]` : `#shelf .patron[data-patron="${p.id}"]`)
  ?? (state.ghosts?.some(g => g.uid === p.uid) ? $('ghostBtn') : null);

// Fly freshly drawn tiles out of the bag into their rack positions
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
// pile by default, or the bag for azure tiles while The Fountain is seated.
// Sources may still be in the DOM (e.g. discarded rack tiles) — hide them so
// only the flying clone is visible.
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

// What comes out of a wrapped tile — a flat pick from the table in
// constants.js, which is where the odds are set. Three of the four are the
// strange materials, and one of those is a curse you will have to find a word
// for; the fourth is a mark, which is worth unwrapping because no shop deals
// in them any more.
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

// The bin at the end of the bench. Nothing is paid for a tool thrown away
// here — the Market is where a sundry is worth a Coin (sellSundry) — and the
// slot it frees is the whole of the point: a bench of tools you will never
// spend is a bench that can't take the one you want.
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
// Self-scaling: the word is judged against the page's own quota, so the
// curve holds across chapters and the appendices. Knobs live in REACTION.
function reactionChance(script) {
  const perWordQuota = state.quota / effectiveWordsPerPage();
  const ratio = script.total / Math.max(1, perWordQuota);
  return Math.max(0, Math.min(REACTION.cap, (ratio - REACTION.floor) * REACTION.slope));
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

// Set the word CAT and something takes an interest — but only ONE Market's
// worth of interest. She waits at the head of the patrons next time the shop
// opens, free, and the offer is spent the moment that Market rolls, bought or
// not (offerTheCat, js/market.js): she does not linger from visit to visit.
// Spell CAT again whenever you want another look.
//
// This is what keeps her from being a standing loophole rather than a find —
// without it, a Headsman build could dismiss her and rebuy her free every
// single Market forever, each dismissal worth another permanent +0.2 Mult for
// nothing. Feeding him a cat is fine; feeding him infinitely, for free, is not
// the deal. Spelling CAT again is a real cost (a whole word, on a page with a
// quota to meet), so the loophole closes as soon as it has to be re-earned.
//
// `catPending` already latches once ownership is checked here, so a run where
// she is currently seated is quietly skipped rather than re-notified.
function noticeTheCat(script) {
  if (owns('shorthair') || state.catPending || script?.letters !== 'CAT') return;
  state.catPending = true;
  sfx.chime();
  log('🐈 Somewhere beyond the lamplight, something sits up and takes an interest.', 'good');
}

// ─── The Ripper (a patron killed, a seat freed) ───────────────────────────────
// Print one of his watchwords and one of your OTHER patrons dies where it
// sits: it moves from the shelf to state.ghosts, keeping every part of its
// effect and giving up only its seat, and then the Ripper flees — out of the
// run and back into the Market's pool, so the next ghost costs another rare
// hire. Done here rather than in an onPrinted hook because a hook cannot
// remove its own seat from the loop that is running it.
//
// He refuses rather than half-acts. No other patron to kill, or no room left
// among the ghosts, and nothing happens at all: he keeps his seat and waits
// for a word he can do something with, which is better than spending himself
// on nothing. The victim is chosen blind — WHICH seat dies is the price of the
// one he frees.
async function ripperStrikes(script) {
  // He may be seated OR haunting: a Ripper who has met The Revenant is a ghost
  // himself, and a ghost has nowhere to flee to, so he keeps his knife.
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
  // You cannot murder the dead. The Revenant is already on the other side of
  // the table, and what the knife finds when it reaches him is that it is
  // holding the wrong end: the Ripper is taken instead. He goes to the ghosts
  // wearing his own effect, and a ghost cannot flee — so from here on every
  // watchword kills again, at no further cost, until there is no room left
  // among your ghosts or nobody living to take. That is the rarest thing in
  // the game: two rare seats, one of them chosen blind, and it turns the
  // Ripper from a one-shot into an engine that empties your shelf into the
  // beyond and hands every seat back.
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

  // Off the shelf and into the beyond, then the knife lets itself out — unless
  // it is already dead, in which case it stays exactly where it is.
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
// an azure letter to smudge — the word stands as typed. The manuscript keeps
// the misprint; that's the joke.

const VOWELS = 'AEIOU';

// Four slips count as one vowel going astray, tried in the order of how the
// error usually happens: the wrong vowel written (SEPERATE), two vowels
// changing places (WIERD, RECIEVE, THIER), a vowel too many (ATHELETE), and
// a vowel left out entirely (SEPRATE). The last is the widest door — a rack
// short of vowels can set BRD and let the demon supply the I — which is why
// the whole pardon stays behind azure ink and a rare seat.
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

// Any combination of the word's Zs may be read as S — usually there is only
// one Z in the bag, so this is a handful of lookups at most. The tile is still
// a Z where it counts: it prints as Z and scores its ten Points.
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

// Two nouns set end to end make a word of their own — DOOM and HAT make
// DOOMHAT. The split itself is boundNouns in patrons.js, because The
// Sculptor reads the same rule at scoring (a compound is a noun); here it
// only wants naming, so the log can show its working.
function binderPardon(letters) {
  const halves = boundNouns(letters);
  return halves ? `${halves[0]} + ${halves[1]}` : null;
}

// The excuses a word can call on when the dictionary turns it away, tried in
// order and credited to whoever saved it. None of them change the word: what
// you set is what prints, and the manuscript keeps it. The Haplographer's
// doubling (doubledReading lives in patrons.js, because his licence also
// feeds The Twins at scoring) slots before the Skimmer — one letter standing
// for two is a likelier story than the middle of the word in shuffle. The
// Binder goes last: where a word could be read as either, a plain
// misspelling is the likelier story than a coinage.
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

// Returns the tiles that were destroyed — they must never reach the discard
// pile, so the caller drops them from the retire list and burns them away
// on screen instead.
function runPrintedHooks(tiles, script) {
  state.lastFirstLetter = splitMarks(script.word)?.letters?.[0] ?? null;
  const burned = new Map();   // id → tile (a tile can only burn once)

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
    });
    if (!r) continue;
    for (const t of r.burned ?? []) burned.set(t.id, t);
    if (r.note) {
      const card = patronCard(p);
      if (card) { pulse(card, 'patron--firing', 520); floatText(card, r.note, 'fl-points', { dy: -44 }); }
    }
  }
  return [...burned.values()];
}

// Tiles thrown away, offered to whoever cares. Runs after they've left the
// rack but before the hand tops up, so a patron that paints one is writing to
// a tile already filed in the discard pile — and the collection, which is what
// makes the change outlast the page.
//
// SEAT ORDER IS THE RULE OF PRECEDENCE, here and in every hook loop: patrons
// fire in the order they were seated, and a tile one of them consumes is out
// of every later seat's reach. That is a promise to the player, not an
// accident of iteration — the Bloodletter and the Typefounder both want a
// discarded pair, and which one takes it is decided by who sits nearer the
// head of the shelf (tempered by pickiness: a pair the crucible refuses
// falls through to the next seat). Future conflicting patrons resolve the
// same way; don't special-case an ordering here.
// Returns the tiles a patron recoloured, so the caller can show it happening;
// the tiles a patron destroyed outright (The Bloodletter, and the consumed
// half of a Typefounder melt), which must be unfiled from the pile and burned
// away rather than flown to it; and the tiles recast with a second face, so
// the new letter can be shown before the tile files away.
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
      // A tool onto the workbench, if the workbench can take one. It refuses
      // rather than overflows: a seat that pays in tools is a seat you make
      // room for before you throw, which is the whole of the Ragman's
      // crimson bargain.
      bench: kind => {
        if (state.sundries.length >= effectiveSundrySlots()) return false;
        state.sundries.push({ kind });
        return true;
      },
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

// A tile caught by the vat takes its colour where it stands, and is held there
// a beat before it files away — the paint is the whole reward, so it has to be
// seen happening. These tiles are already out of state.rack, so there is no
// re-render coming to carry the news: the glyph is recoloured on the element
// by hand, which the discard flight then clones and carries to the pile.
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

// The Dabbler's splashes happen deep in paintTile, far below anywhere that
// can speak — they queue in state.js and every action that might paint
// drains them here into the log.
function reportPaintEchoes() {
  for (const e of takePaintEchoes()) {
    log(`🖍️ The Dabbler splashes ${e.letter} ${COLOURS[e.colour].label.toLowerCase()} as well.`, 'good');
  }
  // The Revenant's raisings queue the same way, and drain wherever paint does —
  // every route to destruction is also a route to the log.
  for (const e of takeGhostEchoes()) {
    log(`💀 The Revenant walks ${e.letter} back out of the hellbox in ghost metal — it costs you no room in the hand.`, 'good');
  }
}

// Patrons that read the hand a page finished with — fired as the quota
// clears, before the Market opens, so what they bank is waiting at its
// stalls. Notes go to the log: the banner and reward sheet own the screen.
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
  // The fleuron decorates the page, never a word: alone it stands (for its
  // single point — the price of clearing it from the hand is the word slot),
  // beside anything else it is refused before the dictionary is even asked.
  const fleuronAlone = parts.letters === FLEURON;
  if (parts.letters.includes(FLEURON) && !fleuronAlone) {
    return reject('The fleuron sets no word — it prints alone.');
  }
  // A medieval sort stands for ordinary letters, so the word is READ before it
  // is judged: every reading is tried, in the sort's own order, and the first
  // that gets through any door — the dictionary, a lexicon patron, a pardon —
  // is the one the rest of the print uses. From here on `parts.letters` is that
  // reading, which is what lets the patrons, the editors and the measure see
  // THORN where the board shows þORN. A word with no medieval sort in it has
  // exactly one reading and none of this changes anything.
  // (resolveMedieval in patrons.js does the same for the live preview.)
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
  // Before anything is counted, the patrons who PAINT a tile do it where it can
  // be seen. The groove has been showing this colour under a dashed edge since
  // the word called for it; here the ink sets, the outline goes, and everything
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
  // Before a single tile pays, the patrons who improve the tiles themselves do
  // it where it can be seen: the card fires, the ink lands on each tile it
  // touches, and the tile's own corner figure — already carrying the bonus, as
  // the groove has been showing all along — is what pass 1 then pays out. This
  // adds nothing to the running total on its own; it is the reason the numbers
  // below are as big as they are.
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
    // The measure gets one line, not two. It used to float its arithmetic
    // ("Length ×2") and its flourish ("the compositor nods.") as separate
    // floaters landing on the word within the same beat, which read as a
    // collision rather than two things worth saying — so they're one message
    // now, held onscreen twice as long since nothing else is due to land on
    // top of it (longReadingTime, js/anim.js).
    if (step.colour === 'length') {
      const line = `${step.count} letters — ×${fmtMult(step.mult)} Mult: ${lengthFlourish(step.count)}`;
      floatText($('word'), line, 'fl-flourish', { dy: -138, duration: longReadingTime(line) });
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
      // A step with no seat of its own — the curse's toll, the editor's
      // verdict — still has to be seen, so it rises over the word instead of
      // going by in silence. The editor's bar flares as its step lands.
      const cls = p.id === 'cursed' ? 'fl-curse'
                : p.id === 'boss'   ? (p.spiked ? 'fl-spike' : 'fl-mult')
                :                     'fl-points';
      floatText($('word'), p.text, cls, { dy: -60 });
      if (p.id === 'boss') pulse($('bossBar'), p.spiked ? 'boss-bar--spiking' : 'boss-bar--firing', 520);
    }
    // Patrons act on the running score in seat order, so the readout follows
    // it seat by seat: a ×Mult patron visibly multiplies what the seats in
    // front of it built, which is the whole reason the order is worth arguing
    // about. Steps that only pay Coins carry the same figure and move nothing.
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

  // This word is spent, so the Gambler's coin goes back in the air for the
  // next one. Tossed here rather than in the score effect, which re-runs on
  // every keystroke — see rollGamble in state.js.
  rollGamble();

  // The tongs' heat went into this word (computeScore read it); the furnace
  // is cold again for the next.
  state.tongsBonus = 0;

  // The editor's memory moves on likewise — chains advance, bars re-set,
  // tempers and measures re-roll — here and never during scoring, which
  // re-runs on every keystroke.
  bossOnPrinted(state, script, parts.letters);

  // Patrons that reach beyond the score fire before the tiles retire, so a
  // grown tile carries its growth wherever it goes next (even back to the bag).
  const burned = runPrintedHooks(printed, script);
  reportPaintEchoes();   // the Arsonist, Nudist or Illuminator may have painted
  if (burned.length) {
    await animateBurn(burned.map(t => rectOf.get(t.id)?.el).filter(Boolean));
  }

  // A wash pays at scoring and comes off as the word commits — before the
  // tiles retire, so The Fountain sees them bare (an azure wash buys the
  // multiplier, not the trip back to the bag).
  washOff(printed);

  // With The Fountain seated, azure tiles slip back into the bag;
  // everything else is discarded. Ash goes nowhere at all.
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
  log(msg, 'good');

  // Said after the score, so the notice isn't the line the score writes over.
  noticeTheCat(script);
  await ripperStrikes(script);

  // Tiles fly to wherever they actually went
  renderWord();
  const pick = list => list.map(t => rectOf.get(t.id)).filter(Boolean);
  await animateDiscard(pick(toPile));
  if (toBag.length) await animateDiscard(pick(toBag), bagRect(), 'bagBtn');

  // …the page score banks…
  renderAllStable();

  // ── Outcomes ───────────────────────────────────────────────────────────────
  // Check the quota BEFORE topping the rack up: announcing "page complete"
  // straight after dealing a fresh hand you never get to use reads as a bug.
  if (state.pageScore >= state.quota) { state.isAnimating = false; await pageComplete(); return; }
  if (state.wordsLeft === 0)          { state.isAnimating = false; await gameLost(); return; }

  // …and only now do fresh tiles arrive from the bag. Anything the editor
  // lends is replaced first: an E played is an E back before the hand tops up,
  // so the three places it holds are never briefly free for the draw to take.
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
  openMarket(reward.parts, reward.total);
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

  // A chapter just cleared — the Colophon offers a permanent upgrade before
  // the next one begins. advancePage() resumes once a pick lands (or, deep
  // into the appendices, the pool has nothing left to offer — the same
  // consolation as a skip, paid out without a screen to skip from).
  if (state.page === PAGES_PER_CHAPTER) {
    openColophon();
    renderAll();
    if (colophon.offers.length) { renderColophon(); return; }
    closeColophon();
    renderColophon();
    applyColophonSkip();
    renderAll();
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
    // The editor's rule is a paragraph, not a title — hold the banner long
    // enough to actually read it, however long that particular rule runs.
    await showBanner(`${def.emoji} ${def.name}`, def.desc, 'read');
    log(`${def.emoji} ${def.name} takes the desk. ${def.desc}`, 'warn');
  }

  // Whatever a patron brings to the page arrives with the hand, not after it —
  // and whatever the editor lends comes first of all, since the Eeeditor's E's
  // take places the draw would otherwise fill.
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

  // Dipped before filed: the vat has its moment while the tiles are still on
  // the board, then they fly to the pile wearing the new colour. A tile the
  // Bloodletter drained burns away where it sits instead — there is nothing
  // left to file.
  const { painted: dipped, trashed, merged } = runDiscardHooks(result.removed);
  // discardSelected tops the hand up before the seats speak, so a boon that
  // WIDENS the hand (the Ragman's azure) would otherwise not be felt until the
  // next word. Fill it a second time and let the late arrivals fly in with the
  // rest of the draw. Nothing is drawn twice: drawUpToRackSize only ever fills
  // to the size of the moment.
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
// tap on the tool spends it (or puts it away if nothing is chosen). The tube
// and the ratchet share that rhythm exactly — the ratchet's arrows only say
// which way it points, so there is no small target to hit and no tap that
// silently cancels the gesture.
$('sundries')?.addEventListener('click', async e => {
  if (state.isAnimating || state.inMarket || state.inDraft || state.inColophon || state.gameOver) return;
  // The ✕ is caught before the slot it sits on, so binning a tool can't also
  // arm it.
  const bin = e.target.closest('[data-discard-sundry]');
  if (bin) { throwSundryAway(Number(bin.dataset.discardSundry)); return; }
  const slot = e.target.closest('[data-sundry]');
  if (!slot) return;
  hidePopover();
  const idx = Number(slot.dataset.sundry);
  const armed = state.sundries[idx];

  // The ratchet's arrows only ever set which way it points — arming it and
  // spending it are taps on the slot, exactly as with the tube. Reading the
  // arrow first means a tap that lands on one both turns the tool around and
  // does whatever that tap was going to do anyway.
  const arrow = e.target.closest('[data-shift]');
  if (arrow && armed?.kind === 'ratchet') state.ratchetDir = Number(arrow.dataset.shift);

  if (armed?.kind === 'reshuffle') {
    log('Spend this at the Market or the Colophon.', 'warn');
    return;
  }

  // A wrapped tile needs no target: the paper comes off there and then, and
  // what is under it is rolled at this moment rather than at the shop — the
  // parcel was genuinely unknown right up until you opened it.
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

  // The toolbox opens where it sits: two DIFFERENT tools from the pool take
  // its place — the first in the box's own slot (always room for that one),
  // the second only if the bench has a free slot, else it rolls away. Rolled
  // at this moment, like the wrapped tile's paper coming off.
  if (armed?.kind === 'toolbox') {
    cancelDiscardMode(true);
    cancelSundryMode(true);
    const pickOne = arr => arr[Math.floor(Math.random() * arr.length)];
    const first  = pickOne(TOOLBOX_POOL);
    const second = pickOne(TOOLBOX_POOL.filter(k => k !== first));
    state.sundries[idx] = { kind: first };
    const roomForSecond = state.sundries.length < effectiveSundrySlots();
    if (roomForSecond) state.sundries.push({ kind: second });

    // Named through sundryTip rather than TOOL_LOOK: the pool holds the
    // ratchet too, which draws itself with arrows and so has no TOOL_LOOK
    // entry. sundryTip knows every kind there is, which is the point of it.
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

  // The laurel needs no target either — it picks its own head to crown, which
  // is the tool's whole gamble: it dies with the seat, so where it lands
  // decides who you can no longer afford to dismiss — and, since a crown pays
  // at its own seat's turn in the running order, where that seat sits decides
  // what the crown is worth.
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

  // The wash pours itself: up to four unpainted tiles in the hand, one of
  // each colour, no aiming. Faint on the tile, full-strength in the score,
  // and spent the moment each tile prints.
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

  // A tube arms with its offer already on the table: up to two unpainted
  // tiles from the hand light up as it's picked up. Tap one, then the tube
  // again to pour; the second tap with nothing picked puts it away. The
  // offer is the whole design — aimed paint only ever landed on the same
  // four workhorse letters, so the tube chooses the candidates and you
  // choose between them.
  if (armed?.kind === 'tube' && state.sundryMode !== idx) {
    cancelDiscardMode(true);
    cancelSundryMode(true);
    clearAllSelected();
    const offer = rollTubeOffer(armed);
    if (!offer) { log('Nothing in your hand will take paint — the tube keeps.', 'warn'); return; }
    state.sundryMode = idx;
    log(offer.length === 2
      ? 'The tube offers two tiles — tap one, then the tube again to pour.'
      : 'Only one tile will take paint — tap it, then the tube again to pour.');
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

  // The ratchet, the loupe and the tongs share one rhythm: arm the tool, tap
  // a tile to grip it, tap the tool again to spend it (or put it away if
  // nothing is picked).
  if (state.sundryMode !== idx) {
    cancelDiscardMode(true);
    cancelSundryMode(true);
    clearAllSelected();
    state.sundryMode = idx;
    log(armed?.kind === 'loupe'
      ? `Tap a tile, then the loupe again to double it — ${LOUPE_CAP} Points is its limit.`
      : armed?.kind === 'tongs'
      ? 'Tap a tile, then the tongs again to feed it to the furnace.'
      : 'Tap one letter, then tap the ratchet again to step it. The arrows say which way.');
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
});

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
// dismissed the way a patron is — sellPatron finds it and pays nothing — and
// tapping the card shows the same calling card the living get.
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

// The Scientist's loan: a gold-trimmed OLOGY tile, cast lent (no template
// behind it, so it vanishes with the page) and flown in from his own card.
// Once a page — data.used latches here and re-arms in his onPageStart.
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

// Dismiss the popover on any press outside it, and on scroll
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
  initInput();
  initInspect();
  initShelfDrag();
  initSheets({ nextPage: beginNextPage, advancePage, beginRun });

  renderDictStatus('loading', 0);
  // The exclusion list lands before a single word does. A filter that arrives
  // late filters nothing — adoptWordlist and adoptTheme consult it as they
  // build their Sets — so this is awaited while the lists that follow are not.
  await loadExclusions();
  if (!exclusionsLoaded) {
    log('The excluded-words list could not be read — word lists are unfiltered this session.', 'warn');
  }
  loadDict((status, count) => renderDictStatus(status, count));
  loadThemes();

  const restored = loadState();
  // A seat whose patron no longer exists is dropped rather than carried: the
  // roster is edited between builds (a patron renamed, retuned or cut), and a
  // save from before the change would otherwise hand the shelf an id nothing
  // answers to — which the board cannot draw. Losing the seat costs the run one
  // patron; keeping it would cost the run the board.
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
