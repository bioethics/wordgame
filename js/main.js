import {
  state, settings, loadSettings, saveSettings, loadState, clearSave,
  newRun, startPage, drawUpToRackSize, clearWord, shuffleRack,
  discardSelected, getWordString, moveRackToWord, owns, clearAllSelected,
  toggleDualVariant, retirePrinted, recordWord, applySundry, sundrySelected,
  spendReshuffleSundry,
} from './state.js';
import {
  TILE_POINTS, ANIM, PAGES_PER_CHAPTER, FINAL_CHAPTER, TUBE_TILES, TRIMS,
  WORDS_PER_PAGE, SKIP_COIN_GRANT,
  chapterTitle, roman, isDeadline, COLOURS, NICKS,
} from './constants.js';
import { DICT, dictLoaded, loadDict, loadCustom } from './dict.js';
import { computeScore, computeReward } from './scoring.js';
import {
  foundry, openFoundry, restoreFoundry, closeFoundry,
  buyPatron, sellPatron, buyTile, buySundry, rerollFoundry, freeRerollFoundry,
  stallSmelt, stallPaint, stallGild, stallClone, stallRestore,
} from './foundry.js';
import {
  colophon, openColophon, closeColophon, restoreColophon,
  applyColophonPick, applyColophonSkip, reshuffleColophon,
} from './colophon.js';
import {
  renderAll, renderRack, renderWord, renderCounts, renderButtons, persist,
  renderFoundry, renderDictStatus, readoutEls, renderChips, setChip,
  updateReadoutPreview, log, showBanner, showOverlay, hideOverlay,
  showGameOver, showVictory, openInspector, closeInspector, makeTileEl, coinHTML,
  showPatronPopover, hidePopover, renderDraft, updateDraftSelection,
  updateFoundryState, updateStallState, openLedger, closeLedger, renderColophon,
} from './render.js';
import {
  draft, openDraft, closeDraft, restoreDraft, toggleDraftPick, applyDraft,
} from './draft.js';
import {
  sleep, dur, flyClone, popReveal, floatText, tweenNum, setNum, fmtMult,
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
// How many "average words" this one was worth, relative to the page's own
// quota — self-scaling across pages, chapters and the endless appendices, so
// the curve never needs retuning as quotas climb. Below an average word,
// nobody bothers; above it, the chance climbs steeply per seated patron, but
// never to a certainty.
function reactionChance(script) {
  const perWordQuota = state.quota / WORDS_PER_PAGE;
  const ratio = script.total / Math.max(1, perWordQuota);
  return Math.max(0, Math.min(0.7, (ratio - 0.6) * 0.35));
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

// ─── Submit (PRINT) ───────────────────────────────────────────────────────────

async function submitWord() {
  if (state.isAnimating || state.inFoundry || state.inColophon || state.gameOver) return;
  const w = getWordString();
  if (!w) return;
  hidePopover();
  cancelDiscardMode(true);
  cancelSundryMode(true);

  if (!dictLoaded) { log('The dictionary is still loading…', 'warn'); return; }
  if (!DICT.has(w.toUpperCase())) {
    log(`“${w}” isn't in the dictionary.`, 'bad');
    sfx.bad();
    pulse($('word'), 'word-groove--reject', 420);
    return;
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

  // Mercury trims slip back into the bag; everything else is discarded
  const { toBag, toPile } = retirePrinted(printed);
  state.word.length = 0;

  let msg = `”${script.word}” — ${script.points} × ${fmtMult(script.mult)} = ${script.total}.`;
  if (script.coins)   msg += `  +${script.coins} Coin${script.coins > 1 ? 's' : ''}.`;
  if (script.refresh) msg += `  +${script.refresh} Discard${script.refresh > 1 ? 's' : ''}.`;
  if (toBag.length)   msg += `  ${toBag.length} slipped back into the bag.`;
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
  openFoundry(reward.parts, reward.total);
  renderAll();
  renderFoundry();
}

// ─── Leaving the Shop → next page ──────────────────────────────────────────

async function beginNextPage() {
  closeFoundry();
  renderFoundry();

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

// ─── The Colophon ───────────────────────────────────────────────────────────

async function pickColophon(id) {
  if (state.isAnimating) return;
  const card = document.querySelector(`[data-colophon="${id}"]`);
  const r = applyColophonPick(id);
  if (!r) return;

  state.isAnimating = true;
  sfx.coin(); sfx.chime();
  if (card) { pulse(card, 'colophon-card--picked', 560); sparkleBurst(card, 16); }
  renderAll();

  log(r.painted?.length
    ? `Colophon: painted ${r.painted.join(', ')} ${COLOURS[r.def.colour].label.toLowerCase()}.`
    : `Colophon: ${r.def.name}.`, 'good');

  await sleep(620);
  closeColophon();
  renderColophon();
  state.isAnimating = false;
  await advancePage();
}

async function skipColophon() {
  if (state.isAnimating) return;
  applyColophonSkip();

  state.isAnimating = true;
  sfx.coin();
  renderAll();
  log(`Skipped the Colophon — +${SKIP_COIN_GRANT} Coins instead.`, 'good');

  await sleep(420);
  closeColophon();
  renderColophon();
  state.isAnimating = false;
  await advancePage();
}

function useColophonReshuffle() {
  if (!spendReshuffleSundry()) return;
  reshuffleColophon();
  sfx.draw();
  renderAll();
  renderColophon();
}

$('colophonModal')?.addEventListener('click', e => {
  const pickEl = e.target.closest('[data-colophon]');
  if (pickEl) { pickColophon(pickEl.dataset.colophon); return; }
  if (e.target.closest('#btnColophonSkip')) { skipColophon(); return; }
  if (e.target.closest('#btnColophonReshuffle')) useColophonReshuffle();
});

async function advancePage() {
  const newChapter = state.page === PAGES_PER_CHAPTER;
  if (newChapter) { state.page = 1; state.chapter += 1; }
  else            { state.page += 1; }

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
  renderAll();
  log(isDeadline(state.page)
    ? `The Deadline — quota ${state.quota}.`
    : `Page ${state.page} — quota ${state.quota}.`);
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
  if (state.isAnimating || state.inFoundry || state.inColophon || state.gameOver) return;
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
  if (state.inFoundry || state.inDraft || state.inColophon || state.isAnimating || state.gameOver) return;
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
  if (state.isAnimating || state.inFoundry || state.inDraft || state.inColophon || state.gameOver) return;
  const slot = e.target.closest('[data-sundry]');
  if (!slot) return;
  hidePopover();
  const idx = Number(slot.dataset.sundry);
  const armed = state.sundries[idx];

  if (armed?.kind === 'reshuffle') {
    log('Save this for the Market or a Colophon pick — nothing to reshuffle here.', 'warn');
    return;
  }

  if (state.sundryMode !== idx) {
    cancelDiscardMode(true);
    cancelSundryMode(true);
    clearAllSelected();
    state.sundryMode = idx;
    const s = state.sundries[idx];
    log(`Tap up to ${TUBE_TILES} tiles to paint ${COLOURS[s.colour].label}, then tap the tube again.`);
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
  log(`Painted ${result.letters.join(', ')} ${COLOURS[result.colour].label.toLowerCase()} — for good.`, 'good');
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
    if (state.inFoundry) renderFoundry();
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
    if (state.isAnimating || state.inFoundry || state.inColophon || state.gameOver) return;
    toggleDualVariant(Number(flip.dataset.flip));
    renderAll();
  }
});

// Dismiss the popover on any press outside it, and on scroll
document.addEventListener('pointerdown', e => {
  if (!e.target.closest('#popover')) hidePopover();
});
window.addEventListener('scroll', () => hidePopover(), { capture: true, passive: true });

// A bought thing flies out of the market to wherever it now lives — the
// clones ride the #fx layer, which sits above the modal.
function flyPurchase(fromEl, toEl, opts = {}) {
  if (!fromEl || !toEl) return;
  flyClone(fromEl, rect(fromEl), rect(toEl), { duration: ANIM.fly, scaleTo: 0.3, fade: true, ...opts });
}

// Market delegation
$('foundryModal')?.addEventListener('click', e => {
  const buyP = e.target.closest('[data-buy-patron]');
  if (buyP) {
    const card = buyP.closest('[data-offer]');
    const r = buyPatron(buyP.dataset.buyPatron);
    if (!r.ok) { log(r.reason, 'warn'); sfx.bad(); }
    else {
      sfx.coin(); log(`${r.def.name} takes a seat at your table.`, 'good');
      flyPurchase(card, $('shelf'), { scaleTo: 0.2 });
    }
    renderAll(); updateFoundryState();
    return;
  }
  const buyT = e.target.closest('[data-buy-tile]');
  if (buyT) {
    const card = buyT.closest('[data-offer]');
    const r = buyTile(Number(buyT.dataset.buyTile));
    if (!r.ok) { log(r.reason, 'warn'); sfx.bad(); }
    else {
      sfx.coin(); log('New tile joins the bag next page.', 'good');
      flyPurchase(card?.querySelector('.tile'), $('bagBtn'));
    }
    renderAll(); updateFoundryState();
    return;
  }
  const buyS = e.target.closest('[data-buy-sundry]');
  if (buyS) {
    const card = buyS.closest('[data-offer]');
    const r = buySundry(Number(buyS.dataset.buySundry));
    if (!r.ok) { log(r.reason, 'warn'); sfx.bad(); }
    else {
      sfx.coin();
      log(r.offer.kind === 'reshuffle'
        ? 'A reshuffle joins your workbench, banked for later.'
        : `A tube of ${COLOURS[r.offer.colour].label} joins your workbench.`, 'good');
      flyPurchase(card?.querySelector('.paint-tube, .sundry-shuffle'), $('sundries'), { scaleTo: 0.6 });
    }
    renderAll(); updateFoundryState();
    return;
  }
  if (e.target.closest('#btnReroll')) {
    if (rerollFoundry()) { sfx.draw(); renderAll(); renderFoundry(); }
    return;
  }
  if (e.target.closest('#btnMarketReshuffle')) {
    if (spendReshuffleSundry()) { freeRerollFoundry(); sfx.draw(); renderAll(); renderFoundry(); }
    return;
  }

  // ── Stalls ──────────────────────────────────────────────────────────────────
  const visit = e.target.closest('[data-visit-stall]');
  if (visit) {
    foundry.view = 'stall';
    foundry.activeStall = visit.dataset.visitStall;
    foundry.stallSel = -1;
    foundry.stallColour = null;
    renderFoundry();
    return;
  }
  if (e.target.closest('#btnStallBack')) {
    foundry.view = 'shop'; foundry.activeStall = null; foundry.returning = true; renderFoundry();
    return;
  }
  const stallTile = e.target.closest('[data-stall-tid]');
  if (stallTile && !stallTile.classList.contains('tile--stall-locked')) {
    const tid = Number(stallTile.dataset.stallTid);
    foundry.stallSel = foundry.stallSel === tid ? -1 : tid;
    updateStallState();
    return;
  }
  const gilderCard = e.target.closest('[data-gilder-idx]');
  if (gilderCard) {
    const idx = Number(gilderCard.dataset.gilderIdx);
    foundry.stallSel = foundry.stallSel === idx ? -1 : idx;
    updateStallState();
    return;
  }
  const swatch = e.target.closest('[data-stall-colour]');
  if (swatch) {
    foundry.stallColour = swatch.dataset.stallColour;
    updateStallState();
    return;
  }
  if (e.target.closest('#btnStallConfirm')) {
    let r, msg;
    switch (foundry.activeStall) {
      case 'smelter':
        r = stallSmelt(foundry.stallSel);
        if (r.ok) msg = `The Smelter feeds a “${r.removed.letter}” tile to the furnace.`;
        break;
      case 'painter':
        r = stallPaint(foundry.stallSel, foundry.stallColour);
        if (r.ok) msg = `The Painter coats “${r.tmpl.letter}” in ${COLOURS[r.colour].label.toLowerCase()}.`;
        break;
      case 'gilder':
        r = stallGild(foundry.stallSel);
        if (r.ok) msg = `The Gilder lays a ${TRIMS[r.trim].label} trim on “${r.tmpl.letter}” — new proposals are out.`;
        break;
      case 'stereotyper':
        r = stallClone(foundry.stallSel);
        if (r.ok) msg = `The Stereotyper casts a perfect copy of “${r.tmpl.letter}”.`;
        break;
      case 'restorer':
        r = stallRestore(foundry.stallSel);
        if (r.ok) msg = `The Restorer strips “${r.tmpl.letter}” back to bare metal.`;
        break;
      default:
        r = { ok: false };
    }
    if (!r.ok) { if (r.reason) log(r.reason, 'warn'); sfx.bad(); }
    else {
      if (foundry.activeStall === 'smelter') sfx.discard(); else sfx.coin();
      log(msg, 'good');
    }
    renderAll(); renderFoundry();   // full rebuild: the price and grid both changed
    return;
  }

  // ── Collection (read-only) ──────────────────────────────────────────────────
  if (e.target.closest('#btnOpenCollection')) {
    foundry.view = 'collection'; renderFoundry();
    return;
  }
  if (e.target.closest('#btnCollectionBack')) {
    foundry.view = 'shop'; foundry.returning = true; renderFoundry();
    return;
  }
  if (e.target.closest('#btnFoundryContinue')) beginNextPage();
});

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
$('devCoins')?.addEventListener('click', () => { state.coins += 20; renderAll(); if (state.inFoundry) renderFoundry(); });
$('devFoundry')?.addEventListener('click', () => {
  if (state.inFoundry || state.inColophon || state.isAnimating) return;
  $('settingsModal')?.classList.remove('show');
  openFoundry([], 0);
  renderAll(); renderFoundry();
});
$('devWinPage')?.addEventListener('click', () => {
  if (state.inFoundry || state.inColophon || state.isAnimating || state.gameOver) return;
  $('settingsModal')?.classList.remove('show');
  state.pageScore = state.quota;
  pageComplete();
});

// ─── Init ─────────────────────────────────────────────────────────────────────

async function startFreshRun() {
  clearSave();
  hideOverlay();
  closeFoundry();
  renderFoundry();
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
  log(painted.length
    ? `Painted ${painted.join(', ')}.  Page 1 — quota ${state.quota}.`
    : `Page 1 — quota ${state.quota}.`);
}

$('draftModal')?.addEventListener('click', e => {
  const pickEl = e.target.closest('[data-draft]');
  if (pickEl) {
    if (toggleDraftPick(pickEl.dataset.draft, Number(pickEl.dataset.idx))) sfx.draw();
    else sfx.bad();
    updateDraftSelection();   // in place — never rebuilds the sheet
    persist();
    return;
  }
  if (e.target.closest('#btnDraftBegin')) beginRun();
});

(async function init() {
  loadSettings();
  applySpeedCSS();
  initInput();
  initInspect();

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
    else if (restored.foundry) {
      restoreFoundry(restored.foundry);
      renderAll(); renderFoundry();
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
