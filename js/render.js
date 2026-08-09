import { state, settings, saveState, getActiveLetter, getActiveColour, selectedCount } from './state.js';
import {
  TILE_POINTS, TRIMS, NICKS, COLOURS, LIGATURES,
  PATRON_SLOTS, WORDS_PER_PAGE, PAGES_PER_CHAPTER,
  SMELT_COST, PAINT_PER_POT, chapterTitle, roman, isDeadline,
} from './constants.js';
import { patronById } from './patrons.js';
import { computeScore } from './scoring.js';
import { foundry, foundrySnapshot, tilePrice } from './foundry.js';
import { draft, draftLimit, draftComplete, draftSnapshot } from './draft.js';
import { setNum, tweenNum, sleep, dur, fmtMult } from './anim.js';

const $ = id => document.getElementById(id);

export const coinHTML = n => `<span class="coin"></span>${n}`;

// ─── Tile element factory ──────────────────────────────────────────────────────

export function makeTileEl(tile, zone, { mini = false } = {}) {
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

  // Point value (bottom-right)
  const pts = document.createElement('span');
  pts.className = 'tile-pts';
  pts.textContent = TILE_POINTS[active] ?? tile.basePoints ?? 1;
  div.appendChild(pts);

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

  // Nick tabs on the edges
  if (tile.nick === 'right' || tile.nick === 'side') {
    const a = document.createElement('span');
    a.className = 'tile-nicktab tile-nicktab--r';
    a.textContent = '»';
    div.appendChild(a);
  }
  if (tile.nick === 'left' || tile.nick === 'side') {
    const a = document.createElement('span');
    a.className = 'tile-nicktab tile-nicktab--l';
    a.textContent = '«';
    div.appendChild(a);
  }

  div.title = tileTitleLines(tile).join('\n');
  return div;
}

export function tileTitleLines(tile, breakdown = null) {
  const active = getActiveLetter(tile);
  const paint  = getActiveColour(tile);
  const lines = [`${active} — ${TILE_POINTS[active] ?? 1} Points`];
  if (paint)     lines.push(`Painted ${COLOURS[paint].label} — raises the ${COLOURS[paint].label} multiplier by 1`);
  if (tile.trim) lines.push(`${TRIMS[tile.trim].label} trim: ${TRIMS[tile.trim].desc}`);
  if (tile.nick) lines.push(`${NICKS[tile.nick].label}: ${NICKS[tile.nick].desc}`);
  if (tile.letterType === 'dual') {
    const otherLetter = tile.activeVariant === 1 ? tile.letter : tile.altLetter;
    const otherPaint  = tile.activeVariant === 1 ? tile.colour : tile.altColour;
    lines.push(`Dual — flips to ${otherLetter}${otherPaint ? ` (${COLOURS[otherPaint].label})` : ''}`);
  }
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

export function showTilePopover(tile, anchorEl, breakdown = null) {
  const [head, ...rest] = tileTitleLines(tile, breakdown);
  const flip = tile.letterType === 'dual'
    ? `<button class="btn btn-quiet tip-btn" data-flip="${tile.id}">Flip to ${tile.activeVariant === 1 ? tile.letter : tile.altLetter}</button>`
    : '';
  showPopover(anchorEl, `
    <div class="tip-head">${head}</div>
    ${rest.map(l => `<div class="tip-line">${l}</div>`).join('')}
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
  renderStatus();
  renderRack();
  renderWord();
  renderCounts();
  renderButtons();
  persist();
}

export function persist() {
  saveState(
    state.inDraft   ? { _draft: draftSnapshot() } :
    state.inFoundry ? { _foundry: foundrySnapshot() } : {}
  );
}

// ─── Patron shelf ─────────────────────────────────────────────────────────────

function renderShelf() {
  const shelf = $('shelf');
  if (!shelf) return;
  shelf.innerHTML = '';
  shelf.classList.toggle('shelf--empty', state.patrons.length === 0);

  for (let i = 0; i < PATRON_SLOTS; i++) {
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
      slot.title = 'An empty seat — invite patrons at the Shop';
      slot.innerHTML = `<span class="patron-empty-mark">❧</span>`;
    }
    shelf.appendChild(slot);
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
  const exMax = Math.max(state.exchangesMax ?? 2, state.exchanges);
  renderPips('exchangePips', exMax, state.exchanges, 'pip--swap');

  const coinsEl = $('coinCount');
  if (coinsEl) setNum(coinsEl, state.coins);
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
export function renderRack(ghostIds = null) {
  const el = $('rack');
  if (!el) return;
  el.innerHTML = '';
  el.classList.toggle('rack--exchange', state.exchangeMode);
  state.rack.forEach(t => {
    const tileEl = makeTileEl(t, 'rack');
    if (ghostIds?.has(t.id)) tileEl.classList.add('tile--ghost');
    el.appendChild(tileEl);
  });
}

export function renderWord() {
  const el = $('word');
  if (!el) return;
  el.innerHTML = '';
  el.dataset.placeholder = state.word.length ? '' : 'compose a word…';

  const script = computeScore(state.word);
  state.word.forEach(t => {
    const tileEl = makeTileEl(t, 'word');
    const bd = script?.perTile.get(t.id);
    if (bd) tileEl.title = tileTitle(t, bd);
    el.appendChild(tileEl);
  });
  updateReadoutPreview(script);
}

export function renderCounts() {
  setText('bagCount', state.bag.length);
  setText('trayCount', state.tray.length);
  $('bagBtn')?.classList.toggle('pouch--empty', state.bag.length === 0);
}

// ─── Readout (Points × Mult = total, plus the five colour multipliers) ────────

export const CHIP_COLOURS = [...Object.keys(COLOURS), 'purple'];

export function updateReadoutPreview(script) {
  const ro = $('readout');
  if (!ro) return;
  ro.classList.toggle('readout--idle', !script);
  setNum($('roPoints'), script ? script.points : 0);
  setNum($('roMult'), script ? script.mult : 1, fmtMult);
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
  points: $('roPoints'), mult: $('roMult'), total: $('roTotal'),
  root: $('readout'), coins: $('coinCount'),
  chip: c => $(`chip-${c}`),
});

// ─── Buttons ──────────────────────────────────────────────────────────────────

export function renderButtons() {
  const blocked = state.inFoundry || state.inDraft || state.isAnimating || state.gameOver;
  const sel = selectedCount();

  setDisabled('btnPrint',    !state.word.length || blocked);
  setDisabled('btnClear',    (!state.word.length && !state.exchangeMode) || blocked);
  setDisabled('btnShuffle',  state.rack.length < 2 || blocked);
  setDisabled('btnExchange', (!state.exchangeMode && state.exchanges <= 0) || blocked);

  const ex = $('btnExchange');
  if (ex) {
    ex.classList.toggle('btn-exchange--armed', state.exchangeMode);
    ex.querySelector('.btn-label').textContent =
      !state.exchangeMode ? 'Exchange'
      : sel > 0           ? `Swap ${sel}`
      :                     'Cancel';
    ex.querySelector('kbd').textContent =
      state.exchangeMode ? 'tap tiles, then confirm' : 'swap tiles for new';
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
  const items = kind === 'bag' ? state.bag : state.tray;
  const title = kind === 'bag' ? `In the bag — ${items.length} tile${items.length === 1 ? '' : 's'}`
                               : `Spent tray — ${items.length} tile${items.length === 1 ? '' : 's'}`;
  const sorted = [...items].sort((a, b) => a.letter.localeCompare(b.letter));
  m.innerHTML = `
    <div class="sheet sheet--inspector">
      <div class="sheet-head">
        <h2>${title}</h2>
        <button class="x" data-close-inspector>✕</button>
      </div>
      <p class="sheet-note">${kind === 'bag'
        ? 'Waiting to be drawn. The whole collection returns to the bag each page.'
        : 'Printed or exchanged this page.'}</p>
      <div class="mini-grid" id="inspectorGrid"></div>
    </div>`;
  const grid = m.querySelector('#inspectorGrid');
  sorted.forEach(tmpl => grid.appendChild(makeTileEl({ ...tmpl, id: '' }, 'inspect', { mini: true })));
  if (!sorted.length) grid.innerHTML = '<p class="sheet-note">Empty.</p>';
  m.classList.add('show');
}

export function closeInspector() {
  $('inspectorModal')?.classList.remove('show');
}

// ─── Shop ──────────────────────────────────────────────────────────────────

export function renderFoundry() {
  const m = $('foundryModal');
  if (!m) return;
  if (!foundry.open) { m.classList.remove('show'); return; }

  m.innerHTML = foundry.view === 'case' ? foundryCaseHTML() : foundryShopHTML();
  m.classList.add('show');

  if (foundry.view === 'case') {
    const grid = m.querySelector('#caseGrid');
    state.collection.forEach((tmpl, i) => {
      const el = makeTileEl({ ...tmpl, id: '' }, 'case', { mini: true });
      el.dataset.caseIdx = i;
      if (i === foundry.smeltSel) el.classList.add('tile--smelt-sel');
      grid.appendChild(el);
    });
  }
}

function rewardHTML() {
  if (!foundry.rewardParts?.length) return '';
  const rows = foundry.rewardParts
    .map(p => `<span class="reward-part">${p.label} <b>+${p.coins}</b></span>`).join('');
  return `<div class="reward-line">${rows}<span class="reward-total">${coinHTML(foundry.rewardTotal)} earned</span></div>`;
}

function foundryShopHTML() {
  const patronCards = foundry.patronOffers.map(o => {
    const def = patronById(o.id);
    const afford = state.coins >= def.cost && state.patrons.length < PATRON_SLOTS;
    return `
      <div class="offer-patron offer-patron--${def.rarity} ${o.sold ? 'offer--sold' : ''}">
        <span class="op-emoji">${def.emoji}</span>
        <div class="op-body">
          <div class="op-name">${def.name} <span class="op-rarity">${def.rarity}</span></div>
          <div class="op-desc">${def.desc}</div>
        </div>
        ${o.sold
          ? '<span class="op-sold">seated</span>'
          : `<button class="btn-price" data-buy-patron="${def.id}" ${afford ? '' : 'disabled'}>${coinHTML(def.cost)}</button>`}
      </div>`;
  }).join('') || '<p class="sheet-note">No patrons calling today.</p>';

  const tileCards = foundry.tileOffers.map((o, i) => {
    const afford = state.coins >= o.price;
    return `
      <div class="offer-tile ${o.sold ? 'offer--sold' : ''}">
        <div class="offer-tile-slot" data-offer-tile="${i}"></div>
        <div class="offer-tile-traits">${tileTraits(o.template)}</div>
        ${o.sold
          ? '<span class="op-sold">bought</span>'
          : `<button class="btn-price" data-buy-tile="${i}" ${afford ? '' : 'disabled'}>${coinHTML(o.price)}</button>`}
      </div>`;
  }).join('');

  const paintCards = foundry.paintOffers.map((o, i) => {
    const afford = state.coins >= o.price;
    return `
      <div class="offer-paint offer-paint--${o.colour} ${o.sold ? 'offer--sold' : ''}">
        <span class="paint-pot paint-pot--${o.colour}"></span>
        <div class="op-body">
          <div class="op-name">${COLOURS[o.colour].label} paint</div>
          <div class="op-desc">Paints ${PAINT_PER_POT} random unpainted letters</div>
        </div>
        ${o.sold
          ? '<span class="op-sold">used</span>'
          : `<button class="btn-price" data-buy-paint="${i}" ${afford ? '' : 'disabled'}>${coinHTML(o.price)}</button>`}
      </div>`;
  }).join('');

  setTimeout(() => {  // mount tile previews after innerHTML
    foundry.tileOffers.forEach((o, i) => {
      const slot = document.querySelector(`[data-offer-tile="${i}"]`);
      if (slot && !slot.children.length) slot.appendChild(makeTileEl({ ...o.template, id: '' }, 'offer'));
    });
  }, 0);

  const fullSeats = state.patrons.length >= PATRON_SLOTS;

  return `
    <div class="sheet sheet--foundry">
      <div class="sheet-head">
        <div>
          <h2 class="foundry-title">The Shop</h2>
          <p class="sheet-note">Coins: <b id="foundryCoins">${state.coins}</b></p>
        </div>
        ${rewardHTML()}
      </div>

      <div class="foundry-grid">
        <section class="foundry-col">
          <h3 class="foundry-sec">Patrons <span class="foundry-sub">${state.patrons.length}/${PATRON_SLOTS} seated${fullSeats ? ' — table full' : ''}</span></h3>
          <div class="offer-list">${patronCards}</div>
        </section>
        <section class="foundry-col">
          <h3 class="foundry-sec">Tiles</h3>
          <div class="offer-tiles">${tileCards}</div>
          <h3 class="foundry-sec foundry-sec--paint">Paint</h3>
          <div class="offer-list">${paintCards}</div>
        </section>
      </div>

      <div class="foundry-foot">
        <button class="btn btn-quiet" id="btnReroll" ${state.coins < foundry.rerollCost ? 'disabled' : ''}>
          New offers ${coinHTML(foundry.rerollCost)}
        </button>
        <button class="btn btn-quiet" id="btnOpenCase">Type case · smelt ${coinHTML(SMELT_COST)}</button>
        <div class="foundry-spacer"></div>
        <button class="btn btn-print" id="btnFoundryContinue">Next page ❧</button>
      </div>
    </div>`;
}

function foundryCaseHTML() {
  const sel = foundry.smeltSel >= 0 ? state.collection[foundry.smeltSel] : null;
  return `
    <div class="sheet sheet--foundry">
      <div class="sheet-head">
        <div>
          <h2 class="foundry-title">Your type case</h2>
          <p class="sheet-note">${state.collection.length} tiles. Smelting one costs ${SMELT_COST} Coins. Coins: <b id="foundryCoins">${state.coins}</b></p>
        </div>
      </div>
      <div class="mini-grid mini-grid--case" id="caseGrid"></div>
      <div class="foundry-foot">
        <button class="btn btn-quiet" id="btnCaseBack">← Back to the Shop</button>
        <div class="foundry-spacer"></div>
        <button class="btn btn-danger" id="btnSmeltConfirm" ${sel ? '' : 'disabled'}>
          ${sel ? `Smelt “${sel.letter}${sel.letterType === 'dual' ? '/' + sel.altLetter : ''}” for ${SMELT_COST} Coins` : 'Select a tile to smelt'}
        </button>
      </div>
    </div>`;
}

// ─── Opening draft ────────────────────────────────────────────────────────────

const TRIM_SHORT = { gold: 'Gold · 1 Coin', silver: 'Silver · +6 Points', copper: 'Copper · +1 Exchange', purple: 'Purple · ×1.5' };
const NICK_SHORT = { right: 'Nick » ×3 right', left: 'Nick « ×3 left', side: 'Nick «» ×5 both sides' };

export function tileTraits(t) {
  return [
    t.colour ? `${COLOURS[t.colour].label} paint` : '',
    t.trim ? TRIM_SHORT[t.trim] : '',
    t.nick ? NICK_SHORT[t.nick] : '',
    t.letterType === 'dual' ? `Dual ${t.letter}/${t.altLetter}` : '',
    LIGATURES.includes(t.letter) ? 'Ligature' : '',
  ].filter(Boolean).join(' · ') || 'Plain';
}

export function renderDraft() {
  const m = $('draftModal');
  if (!m) return;
  if (!draft.open) { m.classList.remove('show'); return; }

  const chosen = (kind, i) => draft.picked[kind].includes(i);
  const full   = kind => draft.picked[kind].length >= draftLimit(kind);
  const count  = kind => {
    const n = draft.picked[kind].length, max = draftLimit(kind);
    return n === max ? `${max} of ${max} chosen ✓` : `choose ${max - n} more`;
  };

  const patronCards = draft.patrons.map((id, i) => {
    const def = patronById(id);
    return `
      <div class="offer-patron offer-patron--${def.rarity} pickable ${chosen('patron', i) ? 'picked' : ''} ${!chosen('patron', i) && full('patron') ? 'pick-locked' : ''}"
           data-draft="patron" data-idx="${i}">
        <span class="op-emoji">${def.emoji}</span>
        <div class="op-body">
          <div class="op-name">${def.name} <span class="op-rarity">${def.rarity}</span></div>
          <div class="op-desc">${def.desc}</div>
        </div>
        <span class="pick-mark">✓</span>
      </div>`;
  }).join('');

  const paintCards = draft.paints.map((colour, i) => `
    <div class="offer-paint pickable ${chosen('paint', i) ? 'picked' : ''} ${!chosen('paint', i) && full('paint') ? 'pick-locked' : ''}"
         data-draft="paint" data-idx="${i}">
      <span class="paint-pot paint-pot--${colour}"></span>
      <div class="op-body">
        <div class="op-name">${COLOURS[colour].label}</div>
        <div class="op-desc">Paints ${PAINT_PER_POT} letters</div>
      </div>
      <span class="pick-mark">✓</span>
    </div>`).join('');

  const tileCards = draft.tiles.map((t, i) => `
    <div class="offer-tile pickable ${chosen('tile', i) ? 'picked' : ''} ${!chosen('tile', i) && full('tile') ? 'pick-locked' : ''}"
         data-draft="tile" data-idx="${i}">
      <div class="offer-tile-slot" data-draft-tile="${i}"></div>
      <div class="offer-tile-traits">${tileTraits(t)}</div>
      <span class="pick-mark">✓</span>
    </div>`).join('');

  m.innerHTML = `
    <div class="sheet sheet--draft">
      <div class="sheet-head">
        <div>
          <h2>Set up the press</h2>
          <p class="sheet-note">Free picks before the first page.</p>
        </div>
      </div>

      <h3 class="foundry-sec">Patron <span class="foundry-sub">${count('patron')}</span></h3>
      <div class="offer-list">${patronCards}</div>

      <h3 class="foundry-sec">Paint <span class="foundry-sub">${count('paint')} — each paints ${PAINT_PER_POT} random letters</span></h3>
      <div class="draft-paints">${paintCards}</div>

      <h3 class="foundry-sec">Tiles <span class="foundry-sub">${count('tile')}</span></h3>
      <div class="offer-tiles offer-tiles--draft">${tileCards}</div>

      <div class="foundry-foot">
        <div class="foundry-spacer"></div>
        <button class="btn btn-print btn-big" id="btnDraftBegin" ${draftComplete() ? '' : 'disabled'}>
          ${draftComplete() ? 'Begin the run ❧' : 'Choose all three'}
        </button>
      </div>
    </div>`;
  m.classList.add('show');

  draft.tiles.forEach((t, i) => {
    const slot = m.querySelector(`[data-draft-tile="${i}"]`);
    if (slot) slot.appendChild(makeTileEl({ ...t, id: '' }, 'draft'));
  });
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
