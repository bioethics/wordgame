import {
  state,
  moveRackToWord, moveWordToRack,
  reorderWord, reorderRack,
  toggleSelected, toggleDualVariant,
} from './state.js';
import { renderAll } from './render.js';

// ─── Insert-index helper ───────────────────────────────────────────────────────

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

// ─── Drag state ────────────────────────────────────────────────────────────────

let _dragId   = null;
let _dragZone = null;

const blocked = () => state.inFoundry || state.isAnimating || state.gameOver;

// ─── Init ──────────────────────────────────────────────────────────────────────

export function initDrag() {
  const rackEl = document.getElementById('rack');
  const wordEl = document.getElementById('word');
  if (!rackEl || !wordEl) return;

  for (const container of [rackEl, wordEl]) {
    container.addEventListener('dragstart', e => {
      const tile = e.target.closest('.tile');
      if (!tile || blocked()) { e.preventDefault(); return; }
      _dragId   = Number(tile.dataset.id);
      _dragZone = tile.dataset.zone;
      tile.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    container.addEventListener('dragend', e => {
      e.target.closest('.tile')?.classList.remove('dragging');
      _dragId = _dragZone = null;
    });
    container.addEventListener('dragover', e => { e.preventDefault(); });
  }

  rackEl.addEventListener('drop', e => {
    e.preventDefault();
    if (_dragId === null || blocked()) return;
    const idx = insertIndex(rackEl, e.clientX);
    if (_dragZone === 'rack') reorderRack(_dragId, idx);
    if (_dragZone === 'word') moveWordToRack(_dragId, idx);
    renderAll();
  });

  wordEl.addEventListener('drop', e => {
    e.preventDefault();
    if (_dragId === null || blocked()) return;
    const idx = insertIndex(wordEl, e.clientX);
    if (_dragZone === 'rack') moveRackToWord(_dragId, idx);
    if (_dragZone === 'word') reorderWord(_dragId, idx);
    renderAll();
  });

  // Click rack tile → select for exchange. Right-click → flip dual letter.
  rackEl.addEventListener('click', e => {
    const tile = e.target.closest('.tile');
    if (!tile || blocked()) return;
    toggleSelected(Number(tile.dataset.id));
    renderAll();
  });

  rackEl.addEventListener('contextmenu', e => {
    const tile = e.target.closest('.tile');
    if (!tile) return;
    e.preventDefault();
    if (blocked()) return;
    toggleDualVariant(Number(tile.dataset.id));
    renderAll();
  });

  // Click word tile → return to rack. Right-click → flip dual letter.
  wordEl.addEventListener('click', e => {
    const tile = e.target.closest('.tile');
    if (!tile || blocked()) return;
    moveWordToRack(Number(tile.dataset.id));
    renderAll();
  });

  wordEl.addEventListener('contextmenu', e => {
    const tile = e.target.closest('.tile');
    if (!tile) return;
    e.preventDefault();
    if (blocked()) return;
    toggleDualVariant(Number(tile.dataset.id));
    renderAll();
  });
}
