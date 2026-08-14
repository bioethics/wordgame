// Game flow: the print cinematic, page and chapter turnover, board input
// modes, settings, and init. Board rendering is render.js; the full-screen
// sheets (Market, Colophon, draft) render and handle themselves in sheets.js,
// with the flow callbacks below injected via initSheets().

import {
  state, settings, loadSettings, saveSettings, loadState, clearSave,
  newRun, startPage, drawUpToRackSize, clearWord, shuffleRack,
  discardSelected, getWordString, moveRackToWord, owns, clearAllSelected,
  toggleDualVariant, retirePrinted, recordWord, applySundry, sundrySelected,
  getActiveColour, growTile,
} from './state.js';
import {
  TILE_POINTS, ANIM, PAGES_PER_CHAPTER, FINAL_CHAPTER, TUBE_TILES, tileCount,
  WORDS_PER_PAGE, REACTION,
  chapterTitle, roman, COLOURS, NICKS, splitMarks,
} from './constants.js';
import { DICT, dictLoaded, loadDict, loadCustom } from './dict.js';
import { computeScore, computeReward } from './scoring.js';
import { openMarket, restoreMarket, closeMarket, sellPatron } from './market.js';
import {
  colophon, openColophon, closeColophon, restoreColophon, applyColophonSkip,
} from './colophon.js';
import {
  renderAll, renderRack, renderWord, renderCounts, renderButtons, persist,
  renderDictStatus, readoutEls, renderChips, setChip,
  log, showBanner, hideOverlay,
  showGameOver, showVictory, openInspector, closeInspector, coinHTML,
  showPatronPopover, hidePopover, openLedger, closeLedger,
} from './render.js';
import {
  initSheets, renderMarket, renderColophon, renderDraft,
} from './sheets.js';
import { openDraft, closeDraft, restoreDraft, applyDraft } from './draft.js';
import {
  sleep, flyClone, popReveal, floatText, tweenNum, setNum, fmtMult,
  pulse, sparkleBurst, sfx, applySpeedCSS, speechBubble,
} from './anim.js';
import { initInput, initInspect } from './drag.js';
import { patronById } from './patrons.js';
import { randomQuip } from './quips.js';

const $ = id => document.getElementById(id);
const rect = el => el?.getBoundingClientRect();

// ─── Tile flight helpers ───────────────────────────────────────────────────────

const bagRect  = () => rect($('bagBtn'))  ?? { left: 40, top: 300, width: 60, height: 60 };
const pileRect = () => rect($('discardBtn')) ?? { left: innerWidth - 100, top: 300, width: 60, height: 60 };

const wordTileEl = id => document.querySelector(`#word .tile[data-id="${id}"]`);
const rackTileEl = id => document.querySelector(`#rack .tile[data-id="${id}"]`);

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
// pile by default, or the bag for Mercury trims.
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

// ─── Discard mode ─────────────────────────────────────────────────────────────

function cancelDiscardMode(quiet = false) {
  if (!state.discardMode) return false;
  state.discardMode = false;
  clearAllSelected();
  if (!quiet) log('Discard cancelled.');
  renderAll();
  return true;
}

// ─── Sundry mode (an armed paint tube) ────────────────────────────────────────

function cancelSundryMode(quiet = false) {
  if (state.sundryMode < 0) return false;
  state.sundryMode = -1;
  clearAllSelected();
  if (!quiet) log('The tube goes back on the workbench.');
  renderAll();
  return true;
}

// ─── Patron reactions (flavour only — never affects scoring) ──────────────────
// Self-scaling: the word is judged against the page's own quota, so the
// curve holds across chapters and the appendices. Knobs live in REACTION.
function reactionChance(script) {
  const perWordQuota = state.quota / WORDS_PER_PAGE;
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
    const card = document.querySelector(`#shelf .patron[data-patron="${p.id}"]`);
    if (!card) continue;
    if (shown > 0) await sleep(180);   // stagger so bubbles don't stack
    speechBubble(card, randomQuip(script.word));
    shown++;
  }
}

// ─── Titivillus (one wrong vowel forgiven) ────────────────────────────────────
// If the letters miss the dictionary by exactly one vowel — and the word holds
// an azure letter to smudge — the word stands as typed. The manuscript and the
// ledger keep the misprint; that's the joke.

const VOWELS = 'AEIOU';

function titivillusPardon(letters) {
  if (!owns('titivillus')) return null;
  if (!state.word.some(t => getActiveColour(t) === 'azure')) return null;
  for (let i = 0; i < letters.length; i++) {
    if (!VOWELS.includes(letters[i])) continue;
    for (const v of VOWELS) {
      if (v === letters[i]) continue;
      const fixed = letters.slice(0, i) + v + letters.slice(i + 1);
      if (DICT.has(fixed)) return fixed;
    }
  }
  return null;
}

// ─── Patron hooks (after a word commits; as a chapter turns) ──────────────────
// Score-time patrons live in the score script; these are the ones that reach
// beyond it — permanent growth, burns, chapter-end dyes. See js/patrons.js.

function runPrintedHooks(tiles, script) {
  state.lastFirstLetter = splitMarks(script.word)?.letters?.[0] ?? null;
  for (const p of state.patrons) {
    const def = patronById(p.id);
    if (!def?.onPrinted) continue;
    p.data ??= {};
    const r = def.onPrinted({ tiles, script, state, data: p.data, grow: growTile });
    if (r?.note) {
      const card = document.querySelector(`#shelf .patron[data-patron="${p.id}"]`);
      if (card) { pulse(card, 'patron--firing', 520); floatText(card, r.note, 'fl-points', { dy: -44 }); }
    }
  }
}

function runChapterHooks() {
  const notes = [];
  for (const p of state.patrons) {
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
  let pardoned = null;
  if (!DICT.has(parts.letters)) {
    pardoned = titivillusPardon(parts.letters);
    if (!pardoned) return reject(`“${w}” isn't in the dictionary.`);
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
    const glow = COLOURS[step.colour]?.glyph ?? '#8a5fb0';
    const label = COLOURS[step.colour]?.label ?? 'Purple';
    for (const id of step.ids) {
      const el = wordTileEl(id);
      if (el) {
        el.style.setProperty('--glow', glow);
        pulse(el, 'tile--set-glow', 620);
      }
    }
    sfx.chime();
    floatText($('word'), `${label} ×${fmtMult(step.mult)}`, `fl-set fl-set--${step.colour}`, { dy: -60 });
    setChip(ro.chip(step.colour), step.mult);
    pulse(ro.chip(step.colour), 'chip--pop', 420);
    await sleep(ANIM.stepColour);
  }

  // ── Pass 4: patrons weigh in ───────────────────────────────────────────────
  for (const p of script.patronSteps) {
    const card = document.querySelector(`#shelf .patron[data-patron="${p.id}"]`);
    if (card) {
      pulse(card, 'patron--firing', 520);
      floatText(card, p.text, p.points ? 'fl-points' : 'fl-mult', { dy: -44 });
    }
    if (p.points) { pointsSoFar += p.points; tweenNum(ro.points, pointsSoFar); sfx.tick(8); }
    if (p.mult || p.xmult) sfx.mult();
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
  state.scavengerPoints = 0;
  state.stats.words += 1;
  if (script.total > state.stats.bestScore) {
    state.stats.bestScore = script.total;
    state.stats.bestWord  = script.word;
  }
  recordWord(script.word, script.total);

  // Patrons that reach beyond the score fire before the tiles retire, so a
  // grown tile carries its growth wherever it goes next (even back to the bag).
  runPrintedHooks(printed, script);

  // Mercury trims slip back into the bag; everything else is discarded
  const { toBag, toPile } = retirePrinted(printed);
  state.word.length = 0;

  let msg = `”${script.word}” — ${script.points} × ${fmtMult(script.mult)} = ${script.total}.`;
  if (script.coins)   msg += `  +${script.coins} Coin${script.coins > 1 ? 's' : ''}.`;
  if (script.refresh) msg += `  +${script.refresh} Discard${script.refresh > 1 ? 's' : ''}.`;
  if (toBag.length)   msg += `  ${toBag.length} slipped back into the bag.`;
  if (pardoned)       msg += `  😈 Titivillus pockets the error — it stands for ${pardoned}.`;
  log(msg, 'good');

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

  // …and only now do fresh tiles arrive from the bag.
  const drawn = drawUpToRackSize();
  await animateDraw(drawn);

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
  await showBanner('Page complete', `${state.pageScore} of ${state.quota} — ${chapterTitle(state.chapter)}`);

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
    await showBanner(`Chapter ${roman(state.chapter)}`, chapterTitle(state.chapter), 1350);
  }

  const drawn = drawUpToRackSize();
  await animateDraw(drawn);

  state.isAnimating = false;
  renderAll();   // the status bar settles back to the manuscript on its own
  if (chapterNotes.length) log(chapterNotes.join('  '), 'good');
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

  await animateDiscard(selectedEls.map(el => ({ el, r: rect(el) })));
  await animateDraw(result.drawn);

  state.isAnimating = false;
  renderAll();

  let msg = `Discarded ${result.removed.length} tile${result.removed.length > 1 ? 's' : ''}.`;
  if (owns('scavenger')) msg += '  +12 Points next word (Scavenger).';
  if (!result.drawn.length && !state.bag.length) msg += '  The bag is empty.';
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

// The workbench: first tap arms a tube, board taps pick its targets, a second
// tap on the tube paints them (or puts it away if nothing is chosen).
$('sundries')?.addEventListener('click', async e => {
  if (state.isAnimating || state.inMarket || state.inDraft || state.inColophon || state.gameOver) return;
  const slot = e.target.closest('[data-sundry]');
  if (!slot) return;
  hidePopover();
  const idx = Number(slot.dataset.sundry);
  const armed = state.sundries[idx];

  if (armed?.kind === 'reshuffle') {
    log('Spend this at the Market or the Colophon.', 'warn');
    return;
  }

  if (state.sundryMode !== idx) {
    cancelDiscardMode(true);
    cancelSundryMode(true);
    clearAllSelected();
    state.sundryMode = idx;
    const s = state.sundries[idx];
    log(`Tap ${tileCount(TUBE_TILES)} to paint ${COLOURS[s.colour].label}, then tap the tube again.`);
    renderAll();
    return;
  }

  // Second tap on the armed tube: paint the selection, or stand down.
  if (!sundrySelected().length) { cancelSundryMode(); return; }
  const result = applySundry(idx);
  if (!result) { cancelSundryMode(); return; }

  state.isAnimating = true;
  renderAll();
  sfx.chime();
  for (const id of result.ids) {
    const el = wordTileEl(id) ?? rackTileEl(id);
    if (el) {
      el.style.setProperty('--glow', COLOURS[result.colour].glyph);
      pulse(el, 'tile--set-glow', 620);
      floatText(el, COLOURS[result.colour].label, `fl-set fl-set--${result.colour}`);
    }
  }
  await sleep(ANIM.stepColour);
  state.isAnimating = false;
  renderAll();
  log(`Painted ${result.letters.join(', ')} ${COLOURS[result.colour].label.toLowerCase()}.`, 'good');
});

$('bagBtn')?.addEventListener('click', () => { if (!state.isAnimating) openInspector('bag'); });
$('discardBtn')?.addEventListener('click', () => { if (!state.isAnimating) openInspector('discard'); });

$('ledgerBtn')?.addEventListener('click', () => { if (!state.isAnimating) openLedger(); });
$('ledgerModal')?.addEventListener('click', e => {
  if (e.target.closest('[data-close-ledger]') || e.target.id === 'ledgerModal') closeLedger();
});

$('inspectorModal')?.addEventListener('click', e => {
  if (e.target.closest('[data-close-inspector]') || e.target.id === 'inspectorModal') closeInspector();
});

// Patron shelf: ✕ dismisses (desktop hover); tapping the card shows its boon
function dismissPatron(id) {
  const r = sellPatron(id);
  if (r.ok) {
    log(`${r.def.name} departs with thanks — ${r.refund} Coin${r.refund !== 1 ? 's' : ''} returned.`);
    renderAll();
    if (state.inMarket) renderMarket();
  }
}

$('shelf')?.addEventListener('click', e => {
  if (state.isAnimating) return;
  const sell = e.target.closest('[data-sell]');
  if (sell) { dismissPatron(sell.dataset.sell); return; }
  const card = e.target.closest('.patron[data-patron]');
  if (card) {
    const def = patronById(card.dataset.patron);
    if (def) showPatronPopover(def, card);
  }
});

// Popover actions (flip a dual tile, dismiss a patron)
$('popover')?.addEventListener('click', e => {
  const sell = e.target.closest('[data-sell]');
  if (sell) { hidePopover(); if (!state.isAnimating) dismissPatron(sell.dataset.sell); return; }
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
  await showBanner(`Chapter ${roman(1)}`, chapterTitle(1), 1250);
  const drawn = drawUpToRackSize();
  await animateDraw(drawn);
  state.isAnimating = false;
  renderAll();
  if (painted.length) log(`Painted ${painted.join(', ')}.`);
}

(async function init() {
  loadSettings();
  applySpeedCSS();
  initInput();
  initInspect();
  initSheets({ nextPage: beginNextPage, advancePage, beginRun });

  renderDictStatus('loading', 0);
  loadDict((status, count) => renderDictStatus(status, count));

  const restored = loadState();
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
      drawUpToRackSize();   // top up in case a save landed mid-draw
      renderAll();
      log('Welcome back.');
    }
  }

  // Console access for tinkering & automated tests
  window.folio = { state, settings };

  window.addEventListener('beforeunload', persist);
})();
