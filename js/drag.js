// Unified pointer input for the rack and word groove — one code path for
// mouse and touch alike:
//
//   tap        rack tile → play it into the word (or select it, in discard mode)
//              word tile → return it to the rack
//   drag       move/reorder tiles between rack and word
//   long-press inspect a tile (popover with its effects; flip button for duals)
//   right-click flip a dual tile directly (desktop nicety)

import {
  state,
  moveRackToWord, moveWordToRack,
  reorderWord, reorderRack,
  toggleSelected, toggleSundrySelect, toggleDualVariant,
} from './state.js';
import { TUBE_TILES } from './constants.js';
import { renderAll, showTilePopover, showPopover, hidePopover, log } from './render.js';
import { computeScore } from './scoring.js';
import { foundry } from './foundry.js';
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

const blocked = () => state.inFoundry || state.inDraft || state.isAnimating || state.gameOver;

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

function startDrag(x, y) {
  press.dragging = true;
  clearTimeout(press.timer);
  hidePopover();

  const r = press.el.getBoundingClientRect();
  ghost = press.el.cloneNode(true);
  ghost.classList.add('fly-clone', 'drag-ghost');
  ghost.classList.remove('tile--selected');
  Object.assign(ghost.style, {
    left:  `${r.left}px`,
    top:   `${r.top}px`,
    width: `${r.width}px`,
    height:`${r.height}px`,
  });
  ghost._dx = x - r.left;
  ghost._dy = y - r.top;
  document.getElementById('fx')?.appendChild(ghost);
  press.el.classList.add('tile--held');
  moveGhost(x, y);
}

function moveGhost(x, y) {
  if (!ghost) return;
  ghost.style.left = `${x - ghost._dx}px`;
  ghost.style.top  = `${y - ghost._dy}px`;
}

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
      if (toggleSundrySelect(press.id) === 'full') {
        log(`A tube covers ${TUBE_TILES} tiles at most — deselect one first.`, 'warn');
      }
    } else if (press.zone === 'rack') {
      if (selectingToDiscard()) toggleSelected(press.id);
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
  const gilded = tileEl.closest('[data-gilder-idx]')?.dataset.gilderIdx;
  if (gilded != null) {
    const p = foundry.stalls.find(s => s.id === 'gilder')?.proposals?.[Number(gilded)];
    const tmpl = p && state.collection.find(t => t.tid === p.tid);
    return tmpl ? { ...tmpl, trim: p.trim } : null;
  }
  const offer = tileEl.closest('[data-offer="tile"]')?.dataset.idx;
  if (offer != null) return foundry.tileOffers[Number(offer)]?.template;
  const drafted = tileEl.closest('[data-draft="tile"]')?.dataset.idx;
  if (drafted != null) return draft.tiles[Number(drafted)];
  return null;
}

export function initInspect() {
  const roots = ['foundryModal', 'draftModal', 'inspectorModal']
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
