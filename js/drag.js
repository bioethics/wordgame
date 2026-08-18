// Unified pointer input for the rack and word groove — one code path for
// mouse and touch alike:
//
//   tap        rack tile → play it into the word (or select it, in discard mode)
//              word tile → return it to the rack
//   drag       move/reorder tiles between rack and word
//   long-press inspect a tile (popover with its effects; flip button for duals)
//   right-click flip a dual tile directly (desktop nicety)
//
// The patron shelf takes the same gesture at the bottom of this file (tap to
// inspect, drag to reseat), because seat order decides which patron acts first.

import {
  state,
  moveRackToWord, moveWordToRack,
  reorderWord, reorderRack, reorderPatrons,
  toggleSelected, toggleSundrySelect, toggleDualVariant,
} from './state.js';
import { renderAll, showTilePopover, showPopover, hidePopover, log } from './render.js';
import { computeScore } from './scoring.js';
import { patronById } from './patrons.js';
import { market, stallById } from './market.js';
import { proposalPreview, updateMarketState } from './sheets.js';
import { draft } from './draft.js';

const DRAG_THRESHOLD = 8;     // px of travel before a press becomes a drag
const LONG_PRESS_MS  = 450;

// ─── Insert-index helper ───────────────────────────────────────────────────────

// The held tile stays in the DOM (dimmed), so indices line up with the state
// arrays — reorderRack/reorderWord compensate for the removal themselves.
function insertIndex(container, clientX) {
  const tiles = [...container.querySelectorAll(':scope > .tile')];
  if (!tiles.length) return 0;
  let best = tiles.length, bestDist = Infinity;
  for (let i = 0; i < tiles.length; i++) {
    const b  = tiles[i].getBoundingClientRect();
    const cx = b.left + b.width / 2;
    const d  = Math.abs(cx - clientX);
    if (d < bestDist) { bestDist = d; best = clientX < cx ? i : i + 1; }
  }
  return Math.max(0, Math.min(best, tiles.length));
}

const blocked = () => state.inMarket || state.inDraft || state.inColophon || state.isAnimating || state.gameOver;

// Rack taps mean "select for discard" while discard mode is armed;
// any board tap means "select for the tube" while a sundry is armed.
const selectingToDiscard = () => state.discardMode;
const selectingForSundry = () => state.sundryMode >= 0;

// ─── Press / drag state ────────────────────────────────────────────────────────

let press = null;   // { pointerId, id, zone, el, x0, y0, timer, dragging, popped }
let ghost = null;   // clone that rides along under the pointer

function findTile(id) {
  return state.rack.find(t => t.id === id) ?? state.word.find(t => t.id === id);
}

function startLongPressTimer() {
  press.timer = setTimeout(() => {
    if (!press || press.dragging) return;
    press.popped = true;
    const tile = findTile(press.id);
    if (!tile) return;
    let breakdown = null;
    if (press.zone === 'word') {
      breakdown = computeScore(state.word)?.perTile.get(tile.id) ?? null;
    }
    showTilePopover(tile, press.el, breakdown);
    if (navigator.vibrate) navigator.vibrate(12);
  }, LONG_PRESS_MS);
}

// A clone of what you picked up, parked in #fx and carried under the pointer.
// Shared by the board and the shelf — a patron card rides exactly as a tile
// does, which is most of what makes the shelf feel draggable at all.
function makeGhost(el, x, y) {
  const r = el.getBoundingClientRect();
  const g = el.cloneNode(true);
  g.classList.add('fly-clone', 'drag-ghost');
  g.classList.remove('tile--selected');
  Object.assign(g.style, {
    left:  `${r.left}px`,
    top:   `${r.top}px`,
    width: `${r.width}px`,
    height:`${r.height}px`,
  });
  g._dx = x - r.left;
  g._dy = y - r.top;
  document.getElementById('fx')?.appendChild(g);
  positionGhost(g, x, y);
  return g;
}

function positionGhost(g, x, y) {
  if (!g) return;
  g.style.left = `${x - g._dx}px`;
  g.style.top  = `${y - g._dy}px`;
}

function startDrag(x, y) {
  press.dragging = true;
  clearTimeout(press.timer);
  hidePopover();
  ghost = makeGhost(press.el, x, y);
  press.el.classList.add('tile--held');
}

function moveGhost(x, y) { positionGhost(ghost, x, y); }

function endDrag(x, y) {
  const rackEl = document.getElementById('rack');
  const wordEl = document.getElementById('word');
  const under  = document.elementFromPoint(x, y);
  const target = under?.closest('.word-groove') ? wordEl
               : under?.closest('.rack')        ? rackEl
               : null;

  if (target === wordEl) {
    const idx = insertIndex(wordEl, x);
    if (press.zone === 'rack') moveRackToWord(press.id, idx);
    else                       reorderWord(press.id, idx);
  } else if (target === rackEl) {
    const idx = insertIndex(rackEl, x);
    if (press.zone === 'word') moveWordToRack(press.id, idx);
    else                       reorderRack(press.id, idx);
  }
  // No target → the tile just returns to where it was (re-render fixes it)
}

function releasePress(commit) {
  if (!press) return;
  clearTimeout(press.timer);
  const wasDrag = press.dragging, popped = press.popped;
  ghost?.remove();
  ghost = null;
  press.el.classList.remove('tile--held');

  if (commit && !wasDrag && !popped && !blocked()) {
    // A plain tap
    if (selectingForSundry()) {
      const r = toggleSundrySelect(press.id);
      if (r === 'full')      log('One tile at a time — deselect first.', 'warn');
      if (r === 'immutable') log('A lent tile takes no paint — nor does a ghost.', 'warn');
      if (r === 'unshiftable') log('The ratchet steps single letters — not ligatures or marks.', 'warn');
      if (r === 'unoffered') log('The tube offers only the glowing tiles.', 'warn');
      if (r === 'capped')    log('That tile is already at its finest — the loupe goes no further.', 'warn');
    } else if (press.zone === 'rack') {
      if (selectingToDiscard()) {
        const r = toggleSelected(press.id);
        if (r === 'cursed') log('A cursed tile cannot be discarded — it has to be played.', 'warn');
        if (r === 'lent')   log('A lent tile cannot be discarded — play it or let the page end.', 'warn');
      }
      else                      moveRackToWord(press.id);
    } else {
      moveWordToRack(press.id);
    }
    renderAll();
  } else if (wasDrag) {
    renderAll();   // re-render even on a no-op drop to restore the held tile
  }
  press = null;
}

// ─── Init ──────────────────────────────────────────────────────────────────────

export function initInput() {
  const rackEl = document.getElementById('rack');
  const wordEl = document.getElementById('word');
  if (!rackEl || !wordEl) return;

  for (const container of [rackEl, wordEl]) {
    container.addEventListener('pointerdown', e => {
      const tileEl = e.target.closest('.tile');
      if (!tileEl || press || blocked()) return;
      if (e.button !== undefined && e.button !== 0) return;   // primary only

      e.preventDefault();   // no text selection / native gestures on tiles
      press = {
        pointerId: e.pointerId,
        id:   Number(tileEl.dataset.id),
        zone: tileEl.dataset.zone,
        el:   tileEl,
        x0:   e.clientX,
        y0:   e.clientY,
        dragging: false,
        popped:   false,
        timer: null,
      };
      tileEl.setPointerCapture?.(e.pointerId);
      startLongPressTimer();
    });

    // Right-click a dual tile to flip it (desktop). Android surfaces a
    // contextmenu event for long-presses too — the active press means the
    // popover already has it, so only a genuine right-click falls through.
    container.addEventListener('contextmenu', e => {
      const tileEl = e.target.closest('.tile');
      if (!tileEl) return;
      e.preventDefault();
      if (press || blocked()) return;
      toggleDualVariant(Number(tileEl.dataset.id));
      renderAll();
    });
  }

  window.addEventListener('pointermove', e => {
    if (!press || e.pointerId !== press.pointerId) return;
    const dx = e.clientX - press.x0;
    const dy = e.clientY - press.y0;
    if (!press.dragging) {
      if (press.popped) return;   // popover is up — a hold, not a drag
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      startDrag(e.clientX, e.clientY);
    }
    moveGhost(e.clientX, e.clientY);
  });

  window.addEventListener('pointerup', e => {
    if (!press || e.pointerId !== press.pointerId) return;
    if (press.dragging && !blocked()) endDrag(e.clientX, e.clientY);
    releasePress(true);
  });

  window.addEventListener('pointercancel', e => {
    if (!press || e.pointerId !== press.pointerId) return;
    releasePress(false);
    renderAll();
  });
}

// Kept for compatibility with older callers
export const initDrag = initInput;

// ─── The patron shelf (drag a card to change the running order) ────────────────
// Seat order is the roster's rule of precedence — patrons act on the running
// score one seat at a time, so a seat that adds Points wants to sit in front of
// the seats that multiply (see pass 4 in scoring.js) — and the order of the
// cards is therefore a real decision that has to be editable by hand. The
// gesture is the rack's: press, travel past the threshold, drop where you want
// it. A plain tap still opens the card's popover; only a genuine drag reorders,
// and the click that trails a drag is swallowed so a reorder never also pops a
// tooltip. The ✕ keeps its own job — a press that starts on it is left alone.
//
// TWO shelves take the gesture: the board's, and the Market's restatement of it
// at the top of the shop sheet. The Market is exactly where the order wants
// rearranging — you have just hired someone, and where they sit is half of what
// you bought — so the listeners hang off the document and find whichever shelf
// the press landed in, rather than off one element that only exists on the board.

let shelfPress = null;   // { pointerId, ref, el, shelf, x0, y0, dragging }
let shelfGhost = null;
let shelfDropped = false;   // a drag just landed — eat the click that follows

// Which shelves may be reordered right now. The board's shelf is off-limits
// while a sheet is up (it is behind the modal); the Market's own strip is the
// one shelf that IS in play there.
const isMarketShelf = shelf => !!shelf?.classList.contains('shelf--market');
function shelfBlocked(shelf) {
  if (state.isAnimating || state.gameOver) return true;
  if (state.inDraft || state.inColophon) return true;
  return state.inMarket !== isMarketShelf(shelf);
}

// Where the held card would land, counted in seats that HOLD a patron: an
// empty seat has no entry in state.patrons, so a card dropped over the empty
// tail simply goes last. The held card stays in the DOM (dimmed) so the
// indices line up with state.patrons, and reorderPatrons compensates for the
// removal itself — exactly the arrangement the rack uses.
function shelfInsertIndex(shelf, clientX) {
  const cards = [...shelf.querySelectorAll(':scope > .patron[data-patron]')];
  if (!cards.length) return 0;
  let best = cards.length, bestDist = Infinity;
  for (let i = 0; i < cards.length; i++) {
    const b  = cards[i].getBoundingClientRect();
    const cx = b.left + b.width / 2;
    const d  = Math.abs(cx - clientX);
    if (d < bestDist) { bestDist = d; best = clientX < cx ? i : i + 1; }
  }
  return Math.max(0, Math.min(best, cards.length));
}

function endShelfPress(commit, x) {
  if (!shelfPress) return;
  const shelf = shelfPress.shelf;
  const wasDrag = shelfPress.dragging;
  shelfGhost?.remove();
  shelfGhost = null;
  shelfPress.el.classList.remove('patron--held');

  if (commit && wasDrag && shelf && !shelfBlocked(shelf)) {
    const moved = reorderPatrons(shelfPress.ref, shelfInsertIndex(shelf, x));
    shelfDropped = true;             // suppress the trailing click either way
    if (moved) {
      const seat = state.patrons.findIndex(p =>
        String(p.uid) === String(shelfPress.ref) || p.id === shelfPress.ref);
      const def = patronById(state.patrons[seat]?.id);
      const name = def?.instName?.(state.patrons[seat]?.data) ?? def?.name ?? 'The patron';
      log(`${name} takes seat ${seat + 1} — patrons act in the order they sit.`);
    }
  }
  const wasMarket = isMarketShelf(shelf);
  shelfPress = null;
  if (wasDrag) {
    renderAll();                     // restore the held card, or show the new order
    // The Market's strip is patched in place rather than rebuilt, so the new
    // seating has to be asked for by name.
    if (wasMarket) updateMarketState();
  }
}

export function initShelfDrag() {
  document.addEventListener('pointerdown', e => {
    if (shelfPress) return;
    if (e.button !== undefined && e.button !== 0) return;   // primary only
    if (e.target.closest('[data-sell], [data-sell-patron]')) return;   // the ✕ dismisses
    const card = e.target.closest('.patron[data-patron]');
    if (!card) return;
    const shelf = card.closest('.shelf');
    if (!shelf || shelfBlocked(shelf)) return;

    // Deliberately no preventDefault here: on touch it would swallow the
    // click that tap-to-inspect is built on. Selection and scrolling are
    // headed off in CSS instead (user-select / touch-action on the card).
    shelfDropped = false;   // never let a stale flag eat this press's click
    shelfPress = {
      pointerId: e.pointerId,
      ref: card.dataset.uid ?? card.dataset.patron,
      el: card,
      shelf,
      x0: e.clientX,
      y0: e.clientY,
      dragging: false,
    };
    card.setPointerCapture?.(e.pointerId);
  });

  // A drag that lands is followed by a click on the card; that click would
  // otherwise open the popover the drag was never asking for.
  document.addEventListener('click', e => {
    if (!shelfDropped) return;
    if (!e.target.closest('.shelf')) return;
    shelfDropped = false;
    e.stopPropagation();
    e.preventDefault();
  }, true);

  window.addEventListener('pointermove', e => {
    if (!shelfPress || e.pointerId !== shelfPress.pointerId) return;
    if (!shelfPress.dragging) {
      if (Math.hypot(e.clientX - shelfPress.x0, e.clientY - shelfPress.y0) < DRAG_THRESHOLD) return;
      shelfPress.dragging = true;
      hidePopover();
      shelfGhost = makeGhost(shelfPress.el, e.clientX, e.clientY);
      shelfPress.el.classList.add('patron--held');
    }
    positionGhost(shelfGhost, e.clientX, e.clientY);
  });

  window.addEventListener('pointerup', e => {
    if (!shelfPress || e.pointerId !== shelfPress.pointerId) return;
    endShelfPress(true, e.clientX);
  });

  window.addEventListener('pointercancel', e => {
    if (!shelfPress || e.pointerId !== shelfPress.pointerId) return;
    endShelfPress(false, e.clientX);
  });
}

// ─── Inspecting things outside the board ───────────────────────────────────────
// Shop offers, draft cards and the collection explain themselves on hover (mouse)
// or long-press (touch) rather than carrying a summary line underneath. Anything
// with a .tile inside, or with data-tip-head/body, is inspectable.

const HOVER_DELAY = 260;
let _hoverTimer = null, _holdTimer = null, _held = null;

function tipTargetOf(el) {
  return el.closest('[data-tip-head]')
      || el.closest('.offer-tile, [data-draft="tile"], [data-stall-tid], [data-tid]');
}

function showTipFor(target) {
  if (!target) return false;
  const head = target.dataset.tipHead;
  if (head) {
    showPopover(target, `<div class="tip-head">${head}</div><div class="tip-feat">${target.dataset.tipBody ?? ''}</div>`);
    return true;
  }
  const tileEl = target.matches('.tile') ? target : target.querySelector('.tile');
  const tmpl = tileEl && templateFor(tileEl);
  if (!tmpl) return false;
  showTilePopover(tmpl, tileEl, null, { canFlip: false });
  return true;
}

// Recover the template a preview tile was built from
function templateFor(tileEl) {
  const tid = tileEl.closest('[data-stall-tid]')?.dataset.stallTid
           ?? tileEl.closest('[data-tid]')?.dataset.tid;
  if (tid != null) return state.collection.find(t => t.tid === Number(tid));
  // A proposal card previews the tile as it would be, not as it is
  const proposed = tileEl.closest('[data-proposal-idx]')?.dataset.proposalIdx;
  if (proposed != null) {
    const p = stallById(market.activeStall)?.proposals?.[Number(proposed)];
    const tmpl = p && state.collection.find(t => t.tid === p.tid);
    return tmpl ? proposalPreview(tmpl, p) : null;
  }
  const offer = tileEl.closest('[data-offer="tile"]')?.dataset.idx;
  if (offer != null) return market.tileOffers[Number(offer)]?.template;
  const rotted = tileEl.closest('[data-offer="compost"]')?.dataset.idx;
  if (rotted != null) return state.compost?.[Number(rotted)];
  const drafted = tileEl.closest('[data-draft="tile"]')?.dataset.idx;
  if (drafted != null) return draft.tiles[Number(drafted)];
  return null;
}

export function initInspect() {
  // The three sheets, plus the board's own workbench: a sundry is the one thing
  // you hold that isn't a tile, and it was explained only by a native browser
  // tooltip — which touch never shows. Its long-press swallows the click that
  // follows, so reading a tool can't also arm it.
  const roots = ['marketModal', 'draftModal', 'inspectorModal', 'sundries']
    .map(id => document.getElementById(id)).filter(Boolean);

  for (const root of roots) {
    root.addEventListener('pointerover', e => {
      if (e.pointerType === 'touch') return;          // touch uses long-press
      const target = tipTargetOf(e.target);
      clearTimeout(_hoverTimer);
      if (!target) { hidePopover(); return; }
      _hoverTimer = setTimeout(() => showTipFor(target), HOVER_DELAY);
    });
    root.addEventListener('pointerout', e => {
      if (e.pointerType === 'touch') return;
      if (!tipTargetOf(e.relatedTarget ?? document.body)) { clearTimeout(_hoverTimer); hidePopover(); }
    });

    root.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch') return;
      const target = tipTargetOf(e.target);
      if (!target) return;
      _held = null;
      _holdTimer = setTimeout(() => {
        if (showTipFor(target)) {
          _held = target;                              // swallow the click that follows
          if (navigator.vibrate) navigator.vibrate(12);
        }
      }, LONG_PRESS_MS);
    });
    root.addEventListener('pointerup',     () => clearTimeout(_holdTimer));
    root.addEventListener('pointercancel', () => { clearTimeout(_holdTimer); _held = null; });
    root.addEventListener('pointermove',   () => clearTimeout(_holdTimer));

    // A long-press that opened a popover must not also count as a pick/buy
    root.addEventListener('click', e => {
      if (_held && (_held === e.target || _held.contains(e.target))) {
        e.stopPropagation();
        e.preventDefault();
        _held = null;
      }
    }, true);
  }
}
