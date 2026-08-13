// Board-side rendering: tiles, the shelf and workbench, the status row and
// readout, popovers, banners, and the end screens. The full-screen sheets
// (Market, Colophon, draft) live in sheets.js.

import {
  state, settings, saveState, getActiveLetter, getActiveColour, selectedCount,
  effectivePatronSlots, effectiveSundrySlots,
} from './state.js';
import {
  TILE_POINTS, TRIMS, NICKS, COLOURS, LIGATURES,
  WORDS_PER_PAGE, PAGES_PER_CHAPTER, TUBE_TILES,
  colourDesc, chapterTitle, roman, isDeadline,
} from './constants.js';
import { patronById } from './patrons.js';
import { computeScore } from './scoring.js';
import { marketSnapshot } from './market.js';
import { draftSnapshot } from './draft.js';
import { colophonSnapshot } from './colophon.js';
import { setNum, sleep, fmtMult } from './anim.js';

const $ = id => document.getElementById(id);

export const coinHTML = n => `<span class="coin"></span>${n}`;

// ─── Tile element factory ──────────────────────────────────────────────────────

// pts: override the number in the corner (the word groove passes the tile's
// actual contribution, so nicks and silver trims change the number itself).
export function makeTileEl(tile, zone, { mini = false, pts = null } = {}) {
  const div = document.createElement('div');
  div.className = mini ? 'tile tile--mini' : 'tile';
  div.setAttribute('role', 'listitem');
  div.dataset.id   = tile.id ?? '';
  div.dataset.zone = zone;

  if (tile.selected)              div.classList.add('tile--selected');
  if (tile.trim)                  div.classList.add(`tile--trim-${tile.trim}`);
  if (tile.nick)                  div.classList.add(`tile--nick-${tile.nick}`);

  const active = getActiveLetter(tile);
  const paint  = getActiveColour(tile);

  // Letter (painted in its colour)
  const letter = document.createElement('span');
  letter.className = 'tile-letter';
  letter.dataset.len = active.length;
  letter.textContent = active;
  if (paint) letter.style.color = COLOURS[paint].glyph;
  div.appendChild(letter);

  // Point value (bottom-right). When an override is given and it beats the
  // letter's face value, the number itself carries the news.
  const base = TILE_POINTS[active] ?? tile.basePoints ?? 1;
  const ptsEl = document.createElement('span');
  ptsEl.className = 'tile-pts';
  ptsEl.textContent = pts ?? base;
  if (pts != null && pts !== base) ptsEl.classList.add('tile-pts--boosted');
  div.appendChild(ptsEl);

  // Dual-letter hint (top-right), painted in the other face's colour
  if (tile.letterType === 'dual' && tile.altLetter) {
    const otherLetter = tile.activeVariant === 1 ? tile.letter : tile.altLetter;
    const otherPaint  = tile.activeVariant === 1 ? tile.colour : tile.altColour;
    const alt = document.createElement('span');
    alt.className = 'tile-alt';
    alt.textContent = `⇄${otherLetter}`;
    if (otherPaint) alt.style.color = COLOURS[otherPaint].glyph;
    div.appendChild(alt);
  }

  // Nicks are notches bitten out of the tile's edge (the mask does the cutting;
  // these elements only paint the shaded lip around each notch).
  if (tile.nick) {
    const a = document.createElement('span');
    a.className = `tile-nick tile-nick--${tile.nick === 'right' ? 'r' : 'l'}`;
    div.appendChild(a);
  }

  div.title = tileTitleLines(tile).join('\n');
  return div;
}

// Every feature a tile carries, spelled out in full. These lines are the tile's
// only explanation now — nothing is summarised under shop cards any more — so
// they say what a thing does rather than naming it.
export function tileFeatures(tile) {
  const paint = getActiveColour(tile);
  const out = [];
  if (paint) out.push({ head: `${COLOURS[paint].label} paint`, body: colourDesc(paint) });
  if (tile.trim) out.push({ head: `${TRIMS[tile.trim].label} trim`, body: TRIMS[tile.trim].desc });
  if (tile.nick) out.push({ head: NICKS[tile.nick]?.label ?? 'Nick', body: NICKS[tile.nick]?.desc ?? '' });
  if (tile.letterType === 'dual') {
    const otherLetter = tile.activeVariant === 1 ? tile.letter : tile.altLetter;
    const otherPaint  = tile.activeVariant === 1 ? tile.colour : tile.altColour;
    out.push({
      head: `Dual letter`,
      body: `Holds ${tile.letter} and ${tile.altLetter} on one tile — flip it to play ${otherLetter} instead${otherPaint ? `, which is painted ${COLOURS[otherPaint].label}` : ''}. Each face is painted separately.`,
    });
  }
  if (LIGATURES.includes(tile.letter)) {
    out.push({ head: 'Ligature', body: `One tile that spells ${tile.letter} — it fills a single slot in the word.` });
  }
  return out;
}

export function tileTitleLines(tile, breakdown = null) {
  const active = getActiveLetter(tile);
  const lines = [`${active} — ${TILE_POINTS[active] ?? 1} Points`];
  for (const f of tileFeatures(tile)) lines.push(`${f.head}: ${f.body}`);
  if (breakdown) lines.push(`This word: ${breakdown.parts.join(', ')} → ${breakdown.final} Points`);
  return lines;
}

export const tileTitle = (tile, breakdown = null) => tileTitleLines(tile, breakdown).join('\n');

// ─── Popover (tap/long-press replacement for hover tooltips) ──────────────────

export function showPopover(anchorEl, html) {
  const pop = $('popover');
  if (!pop || !anchorEl) return;
  pop.innerHTML = html;
  pop.classList.remove('hidden');

  const a = anchorEl.getBoundingClientRect();
  const p = pop.getBoundingClientRect();
  let left = a.left + a.width / 2 - p.width / 2;
  left = Math.max(8, Math.min(left, innerWidth - p.width - 8));
  let top = a.top - p.height - 10;                 // prefer above…
  if (top < 8) top = a.bottom + 10;                // …else below
  top = Math.max(8, Math.min(top, innerHeight - p.height - 8));
  pop.style.left = `${left}px`;
  pop.style.top  = `${top}px`;
}

export function showTilePopover(tile, anchorEl, breakdown = null, { canFlip = true } = {}) {
  const active = getActiveLetter(tile);
  const feats = tileFeatures(tile);
  const flip = canFlip && tile.letterType === 'dual' && tile.id
    ? `<button class="btn btn-quiet tip-btn" data-flip="${tile.id}">Flip to ${tile.activeVariant === 1 ? tile.letter : tile.altLetter}</button>`
    : '';
  showPopover(anchorEl, `
    <div class="tip-head">${active} <span class="tip-pts">${TILE_POINTS[active] ?? 1} Points</span></div>
    ${feats.length
      ? feats.map(f => `<div class="tip-feat"><b>${f.head}</b>${f.body}</div>`).join('')
      : '<div class="tip-line">A plain tile.</div>'}
    ${breakdown ? `<div class="tip-line tip-calc">In this word: ${breakdown.parts.join(' · ')} → <b>${breakdown.final} Points</b></div>` : ''}
    ${flip}`);
}

export function showPatronPopover(def, anchorEl) {
  showPopover(anchorEl, `
    <div class="tip-head">${def.emoji} ${def.name} <span class="op-rarity">${def.rarity}</span></div>
    <div class="tip-line">${def.desc}</div>
    <button class="btn btn-quiet tip-btn" data-sell="${def.id}">Dismiss for ${coinHTML(Math.floor(def.cost / 2))}</button>`);
}

export function hidePopover() {
  const pop = $('popover');
  if (pop && !pop.classList.contains('hidden')) pop.classList.add('hidden');
}

// ─── Main render ───────────────────────────────────────────────────────────────

export function renderAll() {
  renderShelf();
  renderSundries();
  renderStatus();
  renderRack();
  renderWord();
  renderCounts();
  renderButtons();
  persist();
}

export function persist() {
  saveState(
    state.inDraft    ? { _draft: draftSnapshot() } :
    state.inMarket  ? { _market: marketSnapshot() } :
    state.inColophon ? { _colophon: colophonSnapshot() } : {}
  );
}

// ─── Patron shelf ─────────────────────────────────────────────────────────────

function renderShelf() {
  const shelf = $('shelf');
  if (!shelf) return;
  shelf.innerHTML = '';
  shelf.classList.toggle('shelf--empty', state.patrons.length === 0);
  const seats = effectivePatronSlots();
  shelf.style.setProperty('--seat-count', seats);

  for (let i = 0; i < seats; i++) {
    const slot = document.createElement('div');
    const p = state.patrons[i];
    if (p) {
      const def = patronById(p.id);
      slot.className = `patron patron--${def.rarity}`;
      slot.dataset.patron = def.id;
      slot.title = `${def.name} — ${def.desc}\n(✕ dismisses for ${Math.floor(def.cost / 2)} Coins)`;
      slot.innerHTML = `
        <span class="patron-emoji">${def.emoji}</span>
        <span class="patron-name">${def.name.replace(/^The /, '')}</span>
        <button class="patron-x" data-sell="${def.id}" title="Dismiss ${def.name} for ${Math.floor(def.cost / 2)} Coins">✕</button>`;
    } else {
      slot.className = 'patron patron--empty';
      slot.title = 'An empty seat — invite patrons at the Market';
      slot.innerHTML = `<span class="patron-empty-mark">❧</span>`;
    }
    shelf.appendChild(slot);
  }
}

// ─── Sundries (the workbench beside the shelf) ────────────────────────────────
// Fixed slot count so buying or spending a tube never reflows the board.

function renderSundries() {
  const bench = $('sundries');
  if (!bench) return;
  bench.innerHTML = '';
  const slots = effectiveSundrySlots();
  bench.style.setProperty('--slot-count', slots);

  for (let i = 0; i < slots; i++) {
    const s = state.sundries?.[i];
    if (s?.kind === 'tube') {
      const slot = document.createElement('button');
      slot.className = `sundry sundry--${s.colour}${state.sundryMode === i ? ' sundry--armed' : ''}`;
      slot.dataset.sundry = i;
      slot.title = `Tube of ${COLOURS[s.colour].label} — tap it, tap up to ${TUBE_TILES} tiles, tap it again. The paint is permanent.`;
      slot.innerHTML = `
        <span class="paint-tube paint-tube--${s.colour}"></span>
        <span class="sundry-name">${COLOURS[s.colour].label}</span>`;
      bench.appendChild(slot);
    } else if (s?.kind === 'reshuffle') {
      const slot = document.createElement('button');
      slot.className = 'sundry sundry--reshuffle';
      slot.dataset.sundry = i;
      slot.title = 'A free reshuffle, banked for later — spend it at the Market or on a Colophon pick, not here.';
      slot.innerHTML = `
        <span class="sundry-shuffle">↻</span>
        <span class="sundry-name">Reshuffle</span>`;
      bench.appendChild(slot);
    } else {
      const slot = document.createElement('div');
      slot.className = 'sundry sundry--empty';
      slot.title = 'An empty spot on the workbench — buy sundries at the Market';
      slot.innerHTML = `<span class="sundry-empty-mark">✒</span>`;
      bench.appendChild(slot);
    }
  }
}

// ─── Status row ───────────────────────────────────────────────────────────────

function renderStatus() {
  const deadline = isDeadline(state.page);

  setText('chapterLabel', `Chapter ${roman(state.chapter)}`);
  setText('chapterName', chapterTitle(state.chapter));

  const pageEl = $('pageLabel');
  if (pageEl) {
    pageEl.innerHTML = deadline
      ? `<span class="deadline-tag">Deadline</span>`
      : `Page ${state.page} <span class="page-of">of ${PAGES_PER_CHAPTER}</span>`;
  }

  setText('quotaNow', state.pageScore);
  setText('quotaTarget', state.quota);
  const fill = $('quotaFill');
  if (fill) {
    fill.style.width = `${Math.min(100, (state.pageScore / state.quota) * 100)}%`;
    fill.classList.toggle('quota-fill--done', state.pageScore >= state.quota);
  }
  $('quotaCard')?.classList.toggle('quota-card--deadline', deadline);

  renderPips('wordPips', WORDS_PER_PAGE, state.wordsLeft, 'pip--word');
  const dMax = Math.max(state.discardsMax ?? 2, state.discards);
  renderPips('discardPips', dMax, state.discards, 'pip--swap');

  const coinsEl = $('coinCount');
  if (coinsEl) setNum(coinsEl, state.coins);
  setText('ledgerCount', state.ledger?.length ?? 0);
}

function renderPips(id, total, filled, cls, maxShown = total) {
  const el = $(id);
  if (!el) return;
  el.innerHTML = '';
  const shown = Math.max(Math.min(total, maxShown), filled);
  for (let i = 0; i < shown; i++) {
    const pip = document.createElement('span');
    pip.className = `pip ${cls}${i < filled ? ' pip--on' : ''}`;
    el.appendChild(pip);
  }
}

// ─── Zones ────────────────────────────────────────────────────────────────────

// ghostIds: tiles rendered invisible so a fly-in animation can reveal them
// The armed tube tints both board zones with its own colour
function applyPaintingMode(el) {
  const tube = state.sundryMode >= 0 ? state.sundries[state.sundryMode] : null;
  el.classList.toggle('zone--painting', !!tube);
  if (tube) el.style.setProperty('--paintcol', COLOURS[tube.colour].glyph);
}

export function renderRack(ghostIds = null) {
  const el = $('rack');
  if (!el) return;
  el.innerHTML = '';
  el.classList.toggle('rack--discard', state.discardMode);
  applyPaintingMode(el);
  state.rack.forEach(t => {
    const tileEl = makeTileEl(t, 'rack');
    if (ghostIds?.has(t.id)) tileEl.classList.add('tile--ghost');
    el.appendChild(tileEl);
  });
}

// Displayed contributions from the previous render, so number changes can be
// animated rather than silently swapped.
let _lastWordPts = new Map();
const RIPPLE_STEP = 70;   // ms between neighbours as a nick's effect spreads

export function renderWord() {
  const el = $('word');
  if (!el) return;
  el.innerHTML = '';
  el.dataset.placeholder = state.word.length ? '' : 'compose a word…';
  applyPaintingMode(el);

  const script = computeScore(state.word);

  // Ripple order: distance from the nick that claimed each letter, so the
  // new numbers wash outward starting beside the notch.
  const posOf = new Map(state.word.map((t, i) => [t.id, i]));
  const delayOf = new Map();
  for (const step of script?.nickSteps ?? []) {
    const src = posOf.get(step.sourceId);
    for (const hit of step.hits) {
      delayOf.set(hit.id, (Math.abs(posOf.get(hit.id) - src) - 1) * RIPPLE_STEP);
    }
  }

  const nowPts = new Map();
  state.word.forEach(t => {
    const bd = script?.perTile.get(t.id);
    const shown = bd?.final ?? null;
    const tileEl = makeTileEl(t, 'word', { pts: shown });
    if (bd) tileEl.title = tileTitle(t, bd);
    nowPts.set(t.id, shown);

    // A number that just changed announces itself
    if (shown != null && _lastWordPts.get(t.id) !== shown) {
      const ptsEl = tileEl.querySelector('.tile-pts');
      ptsEl.classList.add('pts-pop');
      ptsEl.style.animationDelay = `${(delayOf.get(t.id) ?? 0) / (settings.animSpeed || 1)}ms`;
    }
    el.appendChild(tileEl);
  });
  _lastWordPts = nowPts;

  updateReadoutPreview(script);
}

export function renderCounts() {
  setText('bagCount', state.bag.length);
  setText('discardCount', state.discardPile.length);
  $('bagBtn')?.classList.toggle('pouch--empty', state.bag.length === 0);
}

// ─── Readout (Points × Mult = total, plus the five colour multipliers) ────────

export const CHIP_COLOURS = [...Object.keys(COLOURS), 'purple'];

export function updateReadoutPreview(script) {
  const ro = $('readout');
  if (!ro) return;
  ro.classList.toggle('readout--idle', !script);
  setNum($('roPoints'), script ? script.points : 0);
  setNum($('roTotal'), script ? script.total : 0);
  renderChips(script?.colourSteps);
}

// One ×N chip per colour (and purple trim); dim while ×1
export function renderChips(colourSteps = null) {
  for (const c of CHIP_COLOURS) {
    const el = $(`chip-${c}`);
    if (!el) continue;
    const step = colourSteps?.find(s => s.colour === c);
    setChip(el, step ? step.mult : 1);
  }
}

export function setChip(el, mult) {
  if (!el) return;
  el.textContent = `×${fmtMult(mult)}`;
  el.classList.toggle('chip--on', mult > 1);
}

// Imperative access for the scoring cinematic
export const readoutEls = () => ({
  points: $('roPoints'), total: $('roTotal'),
  root: $('readout'), coins: $('coinCount'),
  chip: c => $(`chip-${c}`),
});

// ─── Buttons ──────────────────────────────────────────────────────────────────

export function renderButtons() {
  const blocked = state.inMarket || state.inDraft || state.inColophon || state.isAnimating || state.gameOver;
  const sel = selectedCount();

  setDisabled('btnPrint',    !state.word.length || blocked);
  setDisabled('btnClear',    (!state.word.length && !state.discardMode) || blocked);
  setDisabled('btnShuffle',  state.rack.length < 2 || blocked);
  setDisabled('btnDiscard',  (!state.discardMode && state.discards <= 0) || blocked);

  const d = $('btnDiscard');
  if (d) {
    d.classList.toggle('btn-discard--armed', state.discardMode);
    d.querySelector('.btn-label').textContent =
      !state.discardMode ? 'Discard'
      : sel > 0          ? `Discard ${sel}`
      :                    'Cancel';
    d.querySelector('kbd').textContent =
      state.discardMode ? 'tap tiles, then confirm' : 'swap tiles for new';
  }
}

// ─── Log line ─────────────────────────────────────────────────────────────────

export function log(msg, kind = '') {
  const el = $('log');
  if (!el) return;
  el.className = `log${kind ? ' log--' + kind : ''}`;
  el.textContent = msg;
}

// ─── Dictionary status ────────────────────────────────────────────────────────

export function renderDictStatus(status, count) {
  const dot = $('dictDot');
  const txt = $('dictStatus');
  if (dot) {
    dot.className = 'dict-dot';
    dot.classList.add(status === 'loaded' ? 'dict-dot--good' : status === 'fallback' ? 'dict-dot--warn' : 'dict-dot--wait');
    dot.title = status === 'loaded' ? `Dictionary: ${count.toLocaleString()} words`
              : status === 'fallback' ? 'Dictionary: tiny built-in list — load a word list in Settings'
              : 'Dictionary loading…';
  }
  if (txt) {
    txt.textContent = status === 'loaded' ? `${count.toLocaleString()} words loaded`
                    : status === 'fallback' ? 'Tiny built-in list (load a .txt word list)'
                    : 'loading…';
  }
}

// ─── Banner (page / chapter announcements) ────────────────────────────────────

export async function showBanner(title, sub = '', hold = 1150) {
  const b = $('banner');
  if (!b) return;
  b.querySelector('.banner-title').textContent = title;
  b.querySelector('.banner-sub').textContent = sub;
  b.classList.add('banner--show');
  await sleep(hold);
  b.classList.remove('banner--show');
  await sleep(280);
}

// ─── Overlay (game over / victory) ────────────────────────────────────────────

export function showOverlay(html) {
  const m = $('overlayModal');
  if (!m) return;
  m.innerHTML = html;
  m.classList.add('show');
}

export function hideOverlay() {
  $('overlayModal')?.classList.remove('show');
}

const statsHTML = () => `
  <div class="run-stats">
    <div class="run-stat"><span class="run-stat-num">${state.stats.pages}</span><span class="run-stat-label">pages completed</span></div>
    <div class="run-stat"><span class="run-stat-num">${state.stats.words}</span><span class="run-stat-label">words printed</span></div>
    <div class="run-stat"><span class="run-stat-num">${state.totalScore.toLocaleString()}</span><span class="run-stat-label">total score</span></div>
    <div class="run-stat"><span class="run-stat-num">${state.stats.bestWord || '—'}</span><span class="run-stat-label">best word${state.stats.bestScore ? ` · ${state.stats.bestScore}` : ''}</span></div>
  </div>`;

export function showGameOver() {
  showOverlay(`
    <div class="sheet sheet--dark sheet--end">
      <div class="end-flourish">✕</div>
      <h2 class="end-title">The press falls silent</h2>
      <p class="end-sub">Chapter ${roman(state.chapter)}, ${isDeadline(state.page) ? 'the Deadline' : `page ${state.page}`} — the quota of ${state.quota} went unmet.</p>
      ${statsHTML()}
      <button class="btn btn-print btn-big" data-overlay-action="newrun">Begin a new folio</button>
    </div>`);
}

export function showVictory() {
  showOverlay(`
    <div class="sheet sheet--end">
      <div class="end-flourish end-flourish--win">❦</div>
      <h2 class="end-title end-title--win">The folio is complete</h2>
      <p class="end-sub">Ten chapters set, proofed, and printed. The house's finest work.</p>
      ${statsHTML()}
      <div class="end-actions">
        <button class="btn btn-quiet" data-overlay-action="endless">Keep printing (appendices)</button>
        <button class="btn btn-print btn-big" data-overlay-action="newrun">Begin a new folio</button>
      </div>
    </div>`);
}

// ─── Inspector (bag / tray contents) ──────────────────────────────────────────

export function openInspector(kind) {
  const m = $('inspectorModal');
  if (!m) return;
  const items = kind === 'bag' ? state.bag : state.discardPile;
  const title = kind === 'bag' ? `In the bag — ${items.length} tile${items.length === 1 ? '' : 's'}`
                               : `Discard pile — ${items.length} tile${items.length === 1 ? '' : 's'}`;
  const sorted = [...items].sort((a, b) => a.letter.localeCompare(b.letter));
  m.innerHTML = `
    <div class="sheet sheet--inspector">
      <div class="sheet-head">
        <h2>${title}</h2>
        <button class="x" data-close-inspector>✕</button>
      </div>
      <p class="sheet-note">${kind === 'bag'
        ? 'Waiting to be drawn. The whole collection returns to the bag each page.'
        : 'Printed or discarded this page.'}</p>
      <div class="mini-grid" id="inspectorGrid"></div>
    </div>`;
  const grid = m.querySelector('#inspectorGrid');
  sorted.forEach(tmpl => grid.appendChild(makeTileEl({ ...tmpl, id: '' }, 'inspect', { mini: true })));
  if (!sorted.length) grid.innerHTML = '<p class="sheet-note">Empty.</p>';
  m.classList.add('show');
}

// ─── Ledger (every word printed this run) ─────────────────────────────────────

export function openLedger() {
  const m = $('ledgerModal');
  if (!m) return;
  const rows = [...(state.ledger ?? [])].reverse();
  const best = state.stats.bestScore;

  const body = rows.length
    ? `<ol class="ledger-list">${rows.map(r => `
        <li class="ledger-row${r.score === best ? ' ledger-row--best' : ''}">
          <span class="ledger-word">${r.word}</span>
          <span class="ledger-where">ch ${roman(r.chapter)} · p${r.page}</span>
          <span class="ledger-score">${r.score.toLocaleString()}</span>
        </li>`).join('')}</ol>`
    : '<p class="sheet-note">Nothing printed yet.</p>';

  m.innerHTML = `
    <div class="sheet sheet--ledger">
      <div class="sheet-head">
        <div>
          <h2>The ledger</h2>
          <p class="sheet-note">${rows.length} word${rows.length === 1 ? '' : 's'} printed · ${state.totalScore.toLocaleString()} total${best ? ` · best ${state.stats.bestWord} at ${best.toLocaleString()}` : ''}</p>
        </div>
        <button class="x" data-close-ledger>✕</button>
      </div>
      ${body}
    </div>`;
  m.classList.add('show');
}

export function closeLedger() {
  $('ledgerModal')?.classList.remove('show');
}

export function closeInspector() {
  $('inspectorModal')?.classList.remove('show');
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function setText(id, val) {
  const el = $(id);
  if (el) el.textContent = val;
}

function setDisabled(id, val) {
  const el = $(id);
  if (el) el.disabled = val;
}
