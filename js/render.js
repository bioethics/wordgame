import { state, settings, saveState, getActiveLetter, selectedCount } from './state.js';
import {
  TILE_POINTS, CASTS, AURAS, INKS, LIGATURES,
  PATRON_SLOTS, WORDS_PER_PAGE, EXCHANGES_PER_PAGE, PAGES_PER_CHAPTER,
  SMELT_COST, chapterTitle, roman, isDeadline,
} from './constants.js';
import { patronById } from './patrons.js';
import { computeScore } from './scoring.js';
import { foundry, foundrySnapshot, tilePrice } from './foundry.js';
import { setNum, tweenNum, sleep, dur } from './anim.js';

const $ = id => document.getElementById(id);

export const coinHTML = n => `<span class="coin"></span>${n}`;

// ─── Tile element factory ──────────────────────────────────────────────────────

export function makeTileEl(tile, zone, { mini = false } = {}) {
  const div = document.createElement('div');
  div.className = mini ? 'tile tile--mini' : 'tile';
  div.setAttribute('role', 'listitem');
  div.draggable = !mini;
  div.dataset.id   = tile.id ?? '';
  div.dataset.zone = zone;

  if (tile.selected)              div.classList.add('tile--selected');
  if (tile.cast !== 'plain')      div.classList.add(`tile--${tile.cast}`);
  if (tile.ink)                   div.classList.add('tile--inked');
  if (tile.aura)                  div.classList.add(`tile--aura-${tile.aura}`);

  const active = getActiveLetter(tile);
  const darkCast = ['bold', 'master', 'resonant'].includes(tile.cast);

  // Letter
  const letter = document.createElement('span');
  letter.className = 'tile-letter';
  letter.dataset.len = active.length;
  letter.textContent = active;
  if (tile.ink) {
    letter.style.color = darkCast ? INKS[tile.ink].onDark : INKS[tile.ink].onLight;
  }
  div.appendChild(letter);

  // Point value (bottom-right)
  const pts = document.createElement('span');
  pts.className = 'tile-pts';
  pts.textContent = TILE_POINTS[active] ?? tile.basePoints ?? 1;
  div.appendChild(pts);

  // Ink droplet (top-left)
  if (tile.ink) {
    const drop = document.createElement('span');
    drop.className = `tile-drop tile-drop--${tile.ink}`;
    div.appendChild(drop);
  }

  // Dual-letter hint (top-right)
  if (tile.letterType === 'dual' && tile.altLetter) {
    const alt = document.createElement('span');
    alt.className = 'tile-alt';
    alt.textContent = `⇄${tile.activeVariant === 1 ? tile.letter : tile.altLetter}`;
    div.appendChild(alt);
  }

  // Cast badge (bottom-left)
  if (tile.cast !== 'plain') {
    const badge = document.createElement('span');
    badge.className = 'tile-cast';
    badge.textContent = CASTS[tile.cast].badge;
    div.appendChild(badge);
  }

  // Aura chevrons (edge-mounted)
  if (tile.aura === 'crescendo' || tile.aura === 'halo') {
    const a = document.createElement('span');
    a.className = 'tile-chev tile-chev--r';
    a.textContent = '»';
    div.appendChild(a);
  }
  if (tile.aura === 'echo' || tile.aura === 'halo') {
    const a = document.createElement('span');
    a.className = 'tile-chev tile-chev--l';
    a.textContent = '«';
    div.appendChild(a);
  }

  div.title = tileTitle(tile);
  return div;
}

export function tileTitle(tile, breakdown = null) {
  const active = getActiveLetter(tile);
  const lines = [`${active} — ${TILE_POINTS[active] ?? 1} Ink`];
  if (tile.cast !== 'plain') lines.push(`${CASTS[tile.cast].label}: ${CASTS[tile.cast].desc}`);
  if (tile.aura)             lines.push(`${AURAS[tile.aura].label}: ${AURAS[tile.aura].desc}`);
  if (tile.ink)              lines.push(`${INKS[tile.ink].label} ink — matching tiles in a word add to Press (+0.5/+1/+2/+3/+4)`);
  if (tile.letterType === 'dual') lines.push(`Dual cast — right-click to flip to ${tile.activeVariant === 1 ? tile.letter : tile.altLetter}`);
  if (breakdown)             lines.push(`This word: ${breakdown.parts.join(', ')} → ${breakdown.final} Ink`);
  return lines.join('\n');
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
  saveState(state.inFoundry ? { _foundry: foundrySnapshot() } : {});
}

// ─── Patron shelf ─────────────────────────────────────────────────────────────

function renderShelf() {
  const shelf = $('shelf');
  if (!shelf) return;
  shelf.innerHTML = '';

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
      slot.title = 'An empty seat — invite patrons at the Foundry';
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
  renderPips('exchangePips', Math.max(EXCHANGES_PER_PAGE + 1, state.exchanges), state.exchanges, 'pip--swap', EXCHANGES_PER_PAGE + 1);

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

// ─── Readout (Ink × Press × Sets = total) ─────────────────────────────────────

export function updateReadoutPreview(script) {
  const ro = $('readout');
  if (!ro) return;
  ro.classList.toggle('readout--idle', !script);
  setNum($('roInk'), script ? script.ink : 0);
  setNum($('roPress'), script ? script.press : 1);
  setReadoutSets(null);
  setNum($('roTotal'), script ? script.total : 0);
}

export function setReadoutSets(mult) {
  const slab = $('roSetsSlab'), op = $('roSetsOp');
  if (!slab || !op) return;
  const show = mult != null && mult > 1;
  slab.classList.toggle('hidden', !show);
  op.classList.toggle('hidden', !show);
  if (show) setNum($('roSets'), mult, v => `×${(Math.round(v * 100) / 100)}`);
}

// Imperative access for the scoring cinematic
export const readoutEls = () => ({
  ink: $('roInk'), press: $('roPress'), sets: $('roSets'), total: $('roTotal'),
  root: $('readout'), coins: $('coinCount'),
});

// ─── Buttons ──────────────────────────────────────────────────────────────────

export function renderButtons() {
  const blocked = state.inFoundry || state.isAnimating || state.gameOver;
  const sel = selectedCount();

  setDisabled('btnPrint',    !state.word.length || blocked);
  setDisabled('btnClear',    !state.word.length || blocked);
  setDisabled('btnShuffle',  state.rack.length < 2 || blocked);
  setDisabled('btnExchange', state.exchanges <= 0 || sel === 0 || blocked);

  const ex = $('btnExchange');
  if (ex) {
    ex.querySelector('.btn-label').textContent =
      sel > 0 ? `Exchange ${sel}` : 'Exchange';
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
        ? 'Tiles still waiting to be drawn this page. The whole collection returns to the bag when a new page begins.'
        : 'Tiles already printed or exchanged this page.'}</p>
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

// ─── Foundry ──────────────────────────────────────────────────────────────────

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
    const t = o.template;
    const traits = [
      CASTS[t.cast].label,
      t.aura ? AURAS[t.aura].label : '',
      t.ink ? INKS[t.ink].label + ' ink' : '',
      t.letterType === 'dual' ? `Dual ${t.letter}/${t.altLetter}` : '',
      LIGATURES.includes(t.letter) ? 'Ligature' : '',
    ].filter(Boolean).join(' · ') || 'Plain cast';
    return `
      <div class="offer-tile ${o.sold ? 'offer--sold' : ''}">
        <div class="offer-tile-slot" data-offer-tile="${i}"></div>
        <div class="offer-tile-traits">${traits}</div>
        ${o.sold
          ? '<span class="op-sold">cast</span>'
          : `<button class="btn-price" data-buy-tile="${i}" ${afford ? '' : 'disabled'}>${coinHTML(o.price)}</button>`}
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
          <h2 class="foundry-title">The Foundry</h2>
          <p class="sheet-note">Fresh type is cast between pages. Coins: <b id="foundryCoins">${state.coins}</b></p>
        </div>
        ${rewardHTML()}
      </div>

      <div class="foundry-grid">
        <section class="foundry-col">
          <h3 class="foundry-sec">Patrons <span class="foundry-sub">${state.patrons.length}/${PATRON_SLOTS} seated${fullSeats ? ' — table full' : ''}</span></h3>
          <div class="offer-list">${patronCards}</div>
        </section>
        <section class="foundry-col">
          <h3 class="foundry-sec">New type <span class="foundry-sub">cast into your collection</span></h3>
          <div class="offer-tiles">${tileCards}</div>
        </section>
      </div>

      <div class="foundry-foot">
        <button class="btn btn-quiet" id="btnReroll" ${state.coins < foundry.rerollCost ? 'disabled' : ''}>
          Recast offers ${coinHTML(foundry.rerollCost)}
        </button>
        <button class="btn btn-quiet" id="btnOpenCase">Type case · smelt ${coinHTML(SMELT_COST)}</button>
        <div class="foundry-spacer"></div>
        <button class="btn btn-print" id="btnFoundryContinue">Begin the next page ❧</button>
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
          <p class="sheet-note">${state.collection.length} tiles. Select one and smelt it down for ${SMELT_COST} Coins to thin your collection. Coins: <b id="foundryCoins">${state.coins}</b></p>
        </div>
      </div>
      <div class="mini-grid mini-grid--case" id="caseGrid"></div>
      <div class="foundry-foot">
        <button class="btn btn-quiet" id="btnCaseBack">← Back to the Foundry</button>
        <div class="foundry-spacer"></div>
        <button class="btn btn-danger" id="btnSmeltConfirm" ${sel ? '' : 'disabled'}>
          ${sel ? `Smelt “${sel.letter}${sel.letterType === 'dual' ? '/' + sel.altLetter : ''}” for ${SMELT_COST} Coins` : 'Select a tile to smelt'}
        </button>
      </div>
    </div>`;
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
