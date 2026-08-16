// Board-side rendering: tiles, the shelf and workbench, the status row and
// readout, popovers, banners, and the end screens. The full-screen sheets
// (Market, Colophon, draft) live in sheets.js.

import {
  state, settings, saveState, getActiveLetter, getActiveColour, selectedCount,
  effectivePatronSlots, effectiveSundrySlots, effectiveWordsPerPage, chapterTitle,
  sundrySelected, restingPoints,
} from './state.js';
import {
  TILE_POINTS, TRIMS, NICKS, COLOURS, LIGATURES, isMark, MATERIALS,
  WORDS_PER_PAGE, PAGES_PER_CHAPTER, TUBE_TILES, tileCount,
  colourDesc, chapterLabel, roman, isDeadline, NEOLOGIST_LENGTH, SPIKE_MULT, SILVER_BONUS,
} from './constants.js';
import { patronById } from './patrons.js';
import { bossById } from './bosses.js';
import { computeScore } from './scoring.js';
import { marketSnapshot } from './market.js';
import { draftSnapshot } from './draft.js';
import { colophonSnapshot } from './colophon.js';
import { setNum, sleep, fmtMult, readingTime } from './anim.js';

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
  if (tile.material)              div.classList.add(`tile--mat-${tile.material}`);
  // Both kinds of lent tile are marked, and marked apart: the Enthusiast's
  // gift is a bonus beside your hand, the Eeeditor's E is a place taken out of
  // it, and confusing the two would misread the board badly.
  if (tile.ephemeral)             div.classList.add(tile.aboveHand ? 'tile--gift' : 'tile--lent');

  const active = getActiveLetter(tile);
  const paint  = getActiveColour(tile);

  // Letter (painted in its colour)
  const letter = document.createElement('span');
  letter.className = 'tile-letter';
  letter.dataset.len = active.length;
  letter.textContent = active;
  if (paint) letter.style.color = COLOURS[paint].glyph;
  div.appendChild(letter);

  // Point value (bottom-right). This is what the tile is worth at rest —
  // including a silver trim's Points, which belong to the tile and so belong in
  // its number. An override beating that says the *word* has changed it (a
  // nick's reach, a Monogrammist's echo), and the number carries that news.
  // A tile carrying grown points (The Grafter) wears its number in jade.
  const base = restingPoints(tile);
  const ptsEl = document.createElement('span');
  ptsEl.className = 'tile-pts';
  ptsEl.textContent = pts ?? base;
  if (tile.bonusPoints) ptsEl.classList.add('tile-pts--grown');
  if (pts != null && pts !== base) ptsEl.classList.add('tile-pts--boosted');
  div.appendChild(ptsEl);

  // Dual-letter hint (top-right). Paint belongs to the tile, so the waiting
  // letter is shown in the same colour as the one on show — the hint says what
  // you'd be flipping to, and flipping no longer changes the coat.
  if (tile.letterType === 'dual' && tile.altLetter) {
    const otherLetter = tile.activeVariant === 1 ? tile.letter : tile.altLetter;
    const alt = document.createElement('span');
    alt.className = 'tile-alt';
    alt.textContent = `⇄${otherLetter}`;
    if (tile.colour) alt.style.color = COLOURS[tile.colour].glyph;
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
  // The material comes first: it's what the tile *is*, under everything else.
  if (tile.material) {
    const m = MATERIALS[tile.material];
    if (m) out.push({ head: `${m.label} tile`, body: m.desc });
  }
  if (paint) out.push({ head: `${COLOURS[paint].label} paint`, body: colourDesc(paint) });
  if (tile.trim) out.push({ head: `${TRIMS[tile.trim].label} trim`, body: TRIMS[tile.trim].desc });
  if (tile.nick) out.push({ head: NICKS[tile.nick]?.label ?? 'Nick', body: NICKS[tile.nick]?.desc ?? '' });
  if (tile.letterType === 'dual') {
    out.push({
      head: `Dual letter`,
      body: `Holds ${tile.letter} and ${tile.altLetter} — flip to swap. Paint, trim and nick belong to the tile, so both letters wear them.`,
    });
  }
  if (LIGATURES.includes(tile.letter)) {
    out.push({ head: 'Ligature', body: `One tile that spells ${tile.letter}.` });
  }
  if (isMark(tile.letter)) {
    out.push({ head: 'Mark', body: 'Spells nothing — goes on the end of a word. One ? or one ! or ?!.' });
  }
  if (tile.bonusPoints) {
    out.push({ head: 'Grown', body: `+${tile.bonusPoints} Points set permanently into this tile.` });
  }
  if (tile.ephemeral) {
    out.push(tile.aboveHand
      ? {
          head: 'The Enthusiast’s gift',
          body: 'Lent for this page only — it rides above your hand size, and vanishes when the page ends, played or not.',
        }
      : {
          head: 'The Eeeditor’s E',
          body: 'Lent for this page only, and holding one of your hand’s own places. It takes no paint, trim or nick, it cannot be discarded, and printing it brings another at once.',
        });
  }
  return out;
}

export function tileTitleLines(tile, breakdown = null) {
  const active = getActiveLetter(tile);
  const face   = TILE_POINTS[active] ?? 1;
  const grown  = tile.bonusPoints ?? 0;
  const silver = tile.trim === 'silver' ? SILVER_BONUS : 0;
  const parts = [`${face} base`];
  if (grown)  parts.push(`${grown} grown`);
  if (silver) parts.push(`${silver} silver`);
  const lines = [`${active} — ${restingPoints(tile)} Points${parts.length > 1 ? ` (${parts.join(' + ')})` : ''}`];
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

export function showPatronPopover(def, anchorEl, seat = null) {
  // A patron with something to be *used* offers it above the dismissal.
  const act = def.id === 'neologist'
    ? `<button class="btn btn-quiet tip-btn" data-patron-act="neologist">Coin a word…</button>`
    : '';
  const name = def.instName?.(seat?.data) ?? def.name;
  const desc = def.instDesc?.(seat?.data) ?? def.desc;
  showPopover(anchorEl, `
    <div class="tip-head">${def.emoji} ${name} <span class="op-rarity">${def.rarity}</span></div>
    <div class="tip-line">${desc}</div>
    ${act}
    <button class="btn btn-quiet tip-btn" data-sell="${seat?.uid ?? def.id}">Dismiss for ${coinHTML(Math.floor(def.cost / 2))}</button>`);
}

// ─── The Neologist's coining sheet ────────────────────────────────────────────
// Six letters, no more, and nothing the dictionary already knows. What you
// coin here outlives the run: it's kept beside the save and folded into every
// dictionary the game loads afterwards.

export function showCoinWordSheet() {
  showOverlay(`
    <div class="sheet sheet--end sheet--coin">
      <div class="end-flourish">📖</div>
      <h2 class="end-title">Coin a word</h2>
      <p class="end-sub">${NEOLOGIST_LENGTH} letters of your own devising, entered into the
        dictionary for good — in this folio and every one after it. The Neologist
        retires the moment the ink dries.</p>
      <input id="coinInput" class="coin-input" maxlength="${NEOLOGIST_LENGTH}"
             autocomplete="off" autocapitalize="characters" spellcheck="false"
             placeholder="${'·'.repeat(NEOLOGIST_LENGTH)}" aria-label="New word">
      <div id="coinNote" class="coin-note">&nbsp;</div>
      <div class="end-actions">
        <button class="btn btn-quiet" data-coin-cancel>Not yet</button>
        <button class="btn btn-print btn-big" data-coin-confirm>Set it in type</button>
      </div>
    </div>`);
  const input = $('coinInput');
  input?.focus();
}

export function setCoinNote(msg, bad = false) {
  const el = $('coinNote');
  if (!el) return;
  el.textContent = msg || ' ';
  el.classList.toggle('coin-note--bad', bad);
}

export function hidePopover() {
  const pop = $('popover');
  if (pop && !pop.classList.contains('hidden')) pop.classList.add('hidden');
}

// ─── Main render ───────────────────────────────────────────────────────────────

// An armed tool with its targets picked needs one more tap — on the tool, not
// the board — and that is the step that got missed: with the tiles chosen the
// board looks finished, and the thing still waiting is off at the workbench.
// So the table steps back and leaves the tool the brightest thing on it. What
// stays lit is exactly what the gesture still involves: the workbench, and the
// tiles you picked.
function applyToolReady() {
  const table = document.querySelector('.table');
  if (!table) return;
  const armed = state.sundryMode >= 0 ? state.sundries[state.sundryMode] : null;
  table.classList.toggle('table--tool-ready', !!armed && sundrySelected().length > 0);
}

export function renderAll() {
  // One script for the whole frame: the shelf and the readout read the same
  // numbers, so what a patron promises and what it pays can't disagree.
  const script = computeScore(state.word);
  renderShelf(script);
  renderSundries();
  renderStatus();
  renderBossBar(script);
  renderRack();
  renderWord(script);
  renderCounts();
  renderButtons();
  applyToolReady();
  refreshStatusBar();
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

// The seats only get rebuilt when the seating itself changes — hiring,
// dismissing, or an extra seat from the Colophon. Everything else about a
// patron is a class or a badge, so laying down a tile can't restart the
// standing-to-gain glow from frame zero.
let _shelfSig = '';
let _armedIds = new Set();

function renderShelf(script) {
  const shelf = $('shelf');
  if (!shelf) return;
  const seats = effectivePatronSlots();
  const sig = `${seats}|${state.patrons.map(p => p.uid ?? p.id).join(',')}`;

  if (sig !== _shelfSig) {
    _shelfSig = sig;
    _armedIds = new Set();
    shelf.innerHTML = '';
    shelf.classList.toggle('shelf--empty', state.patrons.length === 0);
    shelf.style.setProperty('--seat-count', seats);

    for (let i = 0; i < seats; i++) {
      const slot = document.createElement('div');
      const p = state.patrons[i];
      if (p) {
        const def = patronById(p.id);
        const name  = def.instName?.(p.data)  ?? def.name;
        const label = def.instShelf?.(p.data) ?? def.name.replace(/^The /, '');
        const desc  = def.instDesc?.(p.data)  ?? def.desc;
        slot.className = `patron patron--${def.rarity}${def.guild ? ` patron--g-${def.guild}` : ''}`;
        slot.dataset.patron = def.id;
        if (p.uid != null) slot.dataset.uid = p.uid;
        slot.dataset.baseTitle = `${name} — ${desc}\n(✕ dismisses for ${Math.floor(def.cost / 2)} Coins)`;
        slot.title = slot.dataset.baseTitle;
        slot.innerHTML = `
          <span class="patron-emoji">${def.emoji}</span>
          <span class="patron-name">${label}</span>
          <button class="patron-x" data-sell="${p.uid ?? def.id}" title="Dismiss ${name} for ${Math.floor(def.cost / 2)} Coins">✕</button>`;
      } else {
        slot.className = 'patron patron--empty';
        slot.title = 'Empty seat — patrons are hired at the Market';
        slot.innerHTML = `<span class="patron-empty-mark">❧</span>`;
      }
      shelf.appendChild(slot);
    }
  }

  paintArmed(shelf, script);
}

// What each patron stands to add to the word in progress, read straight off
// the score script. Several steps from one patron fold into a single badge.
// Keys are the seat's uid where the step carries one (copies of a stackable
// patron badge separately), falling back to the def id for everyone else.
function patronTakes(script) {
  const takes = new Map();
  for (const s of script?.patronSteps ?? []) {
    const chip = s.xmult ? `×${fmtMult(s.xmult)}`
               : s.mult  ? `+${fmtMult(s.mult)}`
               : s.coins ? `+${s.coins}c`
               :           `+${s.points}`;
    const kind = s.points ? 'points' : s.coins ? 'coins' : 'mult';
    const key = String(s.uid ?? s.id);
    const prev = takes.get(key);
    takes.set(key, prev
      ? { chip: `${prev.chip} ${chip}`, kind: prev.kind, text: `${prev.text}, ${s.text}` }
      : { chip, kind, text: s.text });
  }
  return takes;
}

// Patrons whose condition the word already meets light up wearing what
// they'd contribute; the rest of the shelf dims out of their way. A patron
// that has just woken gets a one-shot flourish, and a badge whose number
// moves as you compose bumps rather than silently swapping.
function paintArmed(shelf, script) {
  const takes = patronTakes(script);
  shelf.classList.toggle('shelf--live', takes.size > 0);

  // Remember which CARDS were lit (by their own key), not which steps fired —
  // a card matched through the def-id fallback must still count as armed, or
  // its wake-up flourish would restart on every keystroke.
  const nowArmed = new Set();
  for (const card of shelf.querySelectorAll('.patron[data-patron]')) {
    const key = card.dataset.uid ?? card.dataset.patron;
    const take = takes.get(key) ?? takes.get(card.dataset.patron);
    if (take) nowArmed.add(key);
    const fresh = !!take && !_armedIds.has(key);
    card.classList.toggle('patron--armed', !!take);
    card.classList.toggle('patron--just-armed', fresh);
    card.title = card.dataset.baseTitle + (take ? `\nStanding to add: ${take.text}` : '');

    let badge = card.querySelector('.patron-take');
    if (!take) { badge?.remove(); continue; }

    const moved = badge && !fresh && badge.textContent !== take.chip;
    if (!badge) {
      badge = document.createElement('span');
      card.appendChild(badge);
    }
    badge.className = `patron-take patron-take--${take.kind}`;
    badge.textContent = take.chip;
    if (moved) { void badge.offsetWidth; badge.classList.add('patron-take--bump'); }
  }
  _armedIds = nowArmed;
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
      const armed  = state.sundryMode === i;
      const picked = armed && sundrySelected().length > 0;
      const slot = document.createElement('button');
      slot.className = `sundry sundry--${s.colour}${armed ? ' sundry--armed' : ''}`
                     + (picked ? ' sundry--ready' : '');
      slot.dataset.sundry = i;
      slot.title = `Tube of ${COLOURS[s.colour].label} — tap, pick ${tileCount(TUBE_TILES)}, tap again.`;
      slot.innerHTML = `
        <span class="paint-tube paint-tube--${s.colour}"></span>
        <span class="sundry-name">${picked ? 'Paint it' : COLOURS[s.colour].label}</span>`;
      bench.appendChild(slot);
    } else if (s?.kind === 'reshuffle') {
      const slot = document.createElement('button');
      slot.className = 'sundry sundry--reshuffle';
      slot.dataset.sundry = i;
      slot.title = 'A free re-roll for the Market or the Colophon.';
      slot.innerHTML = `
        <span class="sundry-shuffle">↻</span>
        <span class="sundry-name">Reshuffle</span>`;
      bench.appendChild(slot);
    } else if (s?.kind === 'ratchet') {
      const armed  = state.sundryMode === i;
      const picked = armed && sundrySelected().length > 0;
      // Both arrows are on show from the start and never move: the tool keeps
      // one shape through the whole gesture, the way the tube does. The arrows
      // choose the direction; spending it is a tap anywhere on the slot, so
      // there is no small target to miss and no dead ground to cancel on.
      const dir = state.ratchetDir ?? 1;
      const slot = document.createElement('button');
      slot.className = `sundry sundry--ratchet${armed ? ' sundry--armed' : ''}`
                     + (picked ? ' sundry--ready' : '');
      slot.dataset.sundry = i;
      slot.title = 'Ratchet — tap to arm, tap one letter, then tap again to step it. '
                 + 'The arrows say which way.';
      slot.innerHTML = `
        <span class="ratchet-arrows">
          <span class="ratchet-arrow${dir === 1 ? ' ratchet-arrow--on' : ''}"
                data-shift="1" title="A step later — D to E">▲</span>
          <span class="ratchet-arrow${dir === -1 ? ' ratchet-arrow--on' : ''}"
                data-shift="-1" title="A step earlier — D to C">▼</span>
        </span>
        <span class="sundry-name">${picked ? 'Step it' : armed ? 'Pick a letter' : 'Ratchet'}</span>`;
      bench.appendChild(slot);
    } else if (s?.kind === 'wrapped') {
      // No material on the slot: the parcel is the whole point, and it is not
      // decided until it is opened.
      const slot = document.createElement('button');
      slot.className = 'sundry sundry--wrapped';
      slot.dataset.sundry = i;
      slot.title = 'A wrapped tile — tap to unwrap it.\n'
                 + 'Inside is one tile, straight into your hand and yours for the rest of the '
                 + 'run: a random letter in one of the three strange materials, or a mark under '
                 + 'a purple trim. Nothing decides which until the paper comes off.';
      slot.innerHTML = `
        <span class="wrapped-mark"></span>
        <span class="sundry-name">Wrapped</span>`;
      bench.appendChild(slot);
    } else {
      const slot = document.createElement('div');
      slot.className = 'sundry sundry--empty';
      slot.title = 'Room for a sundry — sold at the Market';
      slot.innerHTML = `<span class="sundry-empty-mark">✒</span>`;
      bench.appendChild(slot);
    }
  }
}

// ─── Status row ───────────────────────────────────────────────────────────────

function renderStatus() {
  const deadline = isDeadline(state.page);

  setText('chapterLabel', chapterLabel(state.chapter));
  setText('chapterName', chapterTitle(state.chapter));

  const pageEl = $('pageLabel');
  if (pageEl) {
    pageEl.innerHTML = deadline
      ? `<span class="deadline-tag">Deadline</span>`
      : `Page ${state.page} <span class="page-of">of ${PAGES_PER_CHAPTER}</span>`;
  }

  // Quotas run into the hundreds of thousands by the appendices — grouped
  // digits are the difference between reading a number and counting it.
  setText('quotaNow', state.pageScore.toLocaleString());
  setText('quotaTarget', state.quota.toLocaleString());
  const fill = $('quotaFill');
  if (fill) {
    fill.style.width = `${Math.min(100, (state.pageScore / state.quota) * 100)}%`;
    fill.classList.toggle('quota-fill--done', state.pageScore >= state.quota);
  }
  $('quotaCard')?.classList.toggle('quota-card--deadline', deadline);

  renderPips('wordPips', Math.max(effectiveWordsPerPage(), state.wordsLeft), state.wordsLeft, 'pip--word');
  const dMax = Math.max(state.discardsMax ?? 2, state.discards);
  renderPips('discardPips', dMax, state.discards, 'pip--swap');

  const coinsEl = $('coinCount');
  if (coinsEl) setNum(coinsEl, state.coins);
  setText('manuscriptCount', state.manuscript?.length ?? 0);
}

// ─── The editor's bar (Deadline pages only) ───────────────────────────────────
// The seated editor, their standing rule or its live demand, and a verdict on
// the word being composed — ✓ or the spike, called before you print, because
// the game never scores anything the preview didn't promise. The bar reads
// the same score script as the readout, so the two can't disagree.

function renderBossBar(script) {
  const el = $('bossBar');
  if (!el) return;
  const def = state.boss ? bossById(state.boss.id) : null;
  if (!def) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }
  const data = state.boss.data ?? {};
  const demand = def.demand?.(data);
  const verdict = !state.word.length || !script ? ''
    : script.spiked
      ? `<span class="boss-verdict boss-verdict--bad">✂ spiked — ×${SPIKE_MULT} Mult</span>`
      : `<span class="boss-verdict boss-verdict--ok">✓ passes</span>`;

  // How the page has gone so far: one mark per word printed, in order. Only
  // for editors who actually judge — the Reviewer and the Completist never
  // spike anything, so a row of ✓s would be telling you nothing.
  const trail = def.judge ? (data.verdicts ?? []) : [];
  const trailHTML = trail.length
    ? `<span class="boss-trail" title="${trail.filter(v => v === 'spiked').length} of ${trail.length} spiked so far">${
        trail.map(v => `<span class="boss-mark boss-mark--${v}">${v === 'spiked' ? '✂' : '✓'}</span>`).join('')}</span>`
    : '';

  el.classList.remove('hidden');
  el.classList.toggle('boss-bar--warn', !!script?.spiked && !!state.word.length);
  el.title = `${def.name} — ${def.desc}`;
  el.innerHTML = `
    <span class="boss-emoji">${def.emoji}</span>
    <span class="boss-name">${def.name.replace(/^The /, '')}</span>
    <span class="boss-rule">${demand ?? def.desc}</span>
    ${trailHTML}
    ${verdict}`;
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
// An armed sundry tints both board zones so it's plain where its targets are
// picked. A tube tints them its own colour; the ratchet has none, and takes the
// steel it wears on the workbench. That fallback is load-bearing: `COLOURS[null]`
// threw here, and since the throw landed between emptying the rack and refilling
// it, arming a ratchet made the whole hand disappear.
function applyPaintingMode(el) {
  const armed = state.sundryMode >= 0 ? state.sundries[state.sundryMode] : null;
  el.classList.toggle('zone--painting', !!armed);
  el.classList.toggle('zone--stepping', armed?.kind === 'ratchet');
  if (armed) el.style.setProperty('--paintcol', COLOURS[armed.colour]?.glyph ?? 'var(--steel)');
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

export function renderWord(script = computeScore(state.word)) {
  const el = $('word');
  if (!el) return;
  el.innerHTML = '';
  el.dataset.placeholder = state.word.length ? '' : 'compose a word…';
  applyPaintingMode(el);

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

    // A number worth announcing: one a nick's reach has just rewritten, or
    // one that lands already boosted (a tile dropped into a nick's shadow).
    // Laying an ordinary tile down is not news, and shouldn't bulge.
    const wasShowing = _lastWordPts.has(t.id);
    const face       = restingPoints(t);
    const rewritten  = wasShowing && _lastWordPts.get(t.id) !== shown;
    const bornBoosted = !wasShowing && shown !== face;
    if (shown != null && (rewritten || bornBoosted)) {
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

// Cursed rides at the end: its chip only appears when a cursed tile is in the
// word (see the CSS), so the readout doesn't carry a slot most runs never use.
export const CHIP_COLOURS = [...Object.keys(COLOURS), 'purple', 'cursed'];

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

// ─── The status bar: manuscript at rest, messages when there's news ───────────
// Its resting state is the manuscript — every word printed this run, set as
// one long line of type, newest last, the earlier ones running off the left
// edge under a fade. That line IS the book you're making. A message (a
// rejected word, a purchase, a hint) takes the bar over for a moment, then it
// settles back to the manuscript.

// How long a message holds the bar before it settles back to the manuscript.
// Measured off the text rather than fixed: an editor's rule is three times the
// length of "Discard cancelled." and was given the same three seconds to be
// read in. `readingTime` is the same rule the patrons' bubbles use, plus a
// little more here, since the bar sits at the foot of the board where the eye
// is not already resting.
const MSG_HOLD_BONUS = 900;
let _msgUntil = 0;
let _msgTimer = null;
let _lastWordCount = -1;

export function log(msg, kind = '') {
  const el = $('log');
  if (!el) return;
  clearTimeout(_msgTimer);
  const hold = readingTime(msg) + MSG_HOLD_BONUS;
  _msgUntil = Date.now() + hold;
  el.className = `log log--msg${kind ? ' log--' + kind : ''}`;
  el.textContent = msg;
  _msgTimer = setTimeout(renderManuscript, hold);
}

// Called by renderAll — never stomps a message that's still holding.
export function refreshStatusBar() {
  if (Date.now() < _msgUntil) return;
  renderManuscript();
}

// The strip at the foot of the board: the page being set, as one line of type.
// The bound book — the same words gathered into chapters — is openManuscript().
export function renderManuscript() {
  const el = $('log');
  if (!el) return;
  _msgUntil = 0;

  const words = state.manuscript ?? [];
  el.className = 'log log--manuscript';

  if (!words.length) {
    el.innerHTML = '<span class="ms-blank">a blank page</span>';
    _lastWordCount = 0;
    return;
  }

  // Only the freshly printed word gets the ink-settling flourish.
  const grew = _lastWordCount >= 0 && words.length > _lastWordCount;
  _lastWordCount = words.length;

  el.innerHTML = words.map((r, i) => {
    const last = i === words.length - 1;
    const cls = `ms-word${last ? ' ms-word--last' : ''}${last && grew ? ' ms-word--new' : ''}`;
    return `<span class="${cls}">${r.word.toLowerCase()}</span>`;
  }).join('<span class="ms-dot">·</span>');
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

// `hold` is how long the banner stays up. Pass a number to fix it; pass 'read'
// to hold it long enough to read the subtitle, which is what an editor's rule
// needs and a chapter title does not.
//
// A 'read' banner is also dismissible, which is the other half of the same
// problem: a rule you are meeting for the first time wants seven seconds, and
// the fourth time you meet it you want none. Tap and it goes. Fixed-length
// banners stay as they were — they are already brief, and a stray tap during
// the page turn should not skip the chapter title.
export async function showBanner(title, sub = '', hold = 1150) {
  const b = $('banner');
  if (!b) return;
  const readable = hold === 'read';
  if (readable) hold = readingTime(sub);

  b.querySelector('.banner-title').textContent = title;
  b.querySelector('.banner-sub').textContent = sub;
  b.classList.toggle('banner--dismissible', readable);
  b.classList.add('banner--show');

  if (readable) {
    let done;
    const skip = () => done?.();
    b.addEventListener('pointerdown', skip, { once: true });
    await Promise.race([sleep(hold), new Promise(res => { done = res; })]);
    b.removeEventListener('pointerdown', skip);
  } else {
    await sleep(hold);
  }

  b.classList.remove('banner--show', 'banner--dismissible');
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
      <p class="end-sub">${chapterLabel(state.chapter)}, ${isDeadline(state.page) ? 'the Deadline' : `page ${state.page}`} — the quota of ${state.quota.toLocaleString()} went unmet.${
        state.boss ? ` ${bossById(state.boss.id)?.emoji ?? ''} ${bossById(state.boss.id)?.name ?? ''} remains unimpressed.` : ''}</p>
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
        ? 'Waiting to be drawn.'
        : 'Printed or discarded this page.'}</p>
      <div class="mini-grid" id="inspectorGrid"></div>
    </div>`;
  const grid = m.querySelector('#inspectorGrid');
  sorted.forEach(tmpl => grid.appendChild(makeTileEl({ ...tmpl, id: '' }, 'inspect', { mini: true })));
  if (!sorted.length) grid.innerHTML = '<p class="sheet-note">Empty.</p>';
  m.classList.add('show');
}

// ─── The manuscript, bound (every word printed this run) ──────────────────────
// The strip along the foot of the board (renderManuscript, above) is the page
// currently being set. This is the whole book so far, gathered into its
// chapters — so it reads front to back the way a book does, rather than
// newest-first the way a ledger of transactions would.

// Rows arrive in the order they were printed, so consecutive grouping is the
// whole job: a run never returns to a chapter or a page it has left.
function bindIntoChapters(rows) {
  const chapters = [];
  for (const r of rows) {
    let ch = chapters.at(-1);
    if (ch?.chapter !== r.chapter) chapters.push(ch = { chapter: r.chapter, pages: [], words: 0, score: 0 });
    let pg = ch.pages.at(-1);
    if (pg?.page !== r.page) ch.pages.push(pg = { page: r.page, entries: [] });
    pg.entries.push(r);
    ch.words += 1;
    ch.score += r.score;
  }
  return chapters;
}

export function openManuscript() {
  const m = $('manuscriptModal');
  if (!m) return;
  const rows = state.manuscript ?? [];
  const best = state.stats.bestScore;
  const chapters = bindIntoChapters(rows);

  // The score rides after its word as a raised figure, the way a footnote mark
  // does — present for anyone reading for it, out of the way of the prose.
  // `initial` gives a chapter's first word its drop cap; ::first-letter can't,
  // since these are inline runs rather than blocks.
  const entry = (r, initial) => {
    const word = initial
      ? `<span class="book-initial">${r.word.slice(0, 1)}</span>${r.word.slice(1)}`
      : r.word;
    const n = r.score.toLocaleString();
    return `<span class="book-entry${best && r.score === best ? ' book-entry--best' : ''}" `
         + `title="${r.word} — ${n} points">`
         + `<span class="book-word">${word}</span><span class="book-score">${n}</span></span>`;
  };

  // Each page keeps its folio number in the margin, in the lower-case romans a
  // book uses for its front matter. A Deadline is marked rather than numbered.
  const pageBlock = (pg, first) => `
    <div class="book-leaf">
      <span class="book-folio${isDeadline(pg.page) ? ' book-folio--deadline' : ''}"
            title="${isDeadline(pg.page) ? 'The Deadline' : `Page ${pg.page}`}"
        >${isDeadline(pg.page) ? '❦' : roman(pg.page).toLowerCase()}</span>
      <p class="book-prose">${pg.entries.map((r, i) => entry(r, first && i === 0)).join(' ')}</p>
    </div>`;

  const chapterBlock = c => `
    <section class="book-chapter">
      <header class="book-chapter-head">
        <span class="book-chapter-num">${chapterLabel(c.chapter)}</span>
        <h3 class="book-chapter-title">${state.chapterTitles?.[c.chapter] ?? ''}</h3>
        <span class="book-rule"></span>
        <span class="book-chapter-tally">${c.words} word${c.words === 1 ? '' : 's'} · ${c.score.toLocaleString()}</span>
      </header>
      ${c.pages.map((pg, i) => pageBlock(pg, i === 0)).join('')}
    </section>`;

  const body = chapters.length
    ? `<div class="book">${chapters.map(chapterBlock).join('')}</div>`
    : `<p class="book-blank">The first page is still blank.</p>`;

  m.innerHTML = `
    <div class="sheet sheet--manuscript">
      <div class="sheet-head book-head">
        <div>
          <h2>The manuscript</h2>
          <p class="sheet-note">${rows.length} word${rows.length === 1 ? '' : 's'} set · ${state.totalScore.toLocaleString()} in total${best ? ` · the best of them ${state.stats.bestWord} at ${best.toLocaleString()}` : ''}</p>
        </div>
        <button class="x" data-close-manuscript>✕</button>
      </div>
      ${body}
    </div>`;
  m.classList.add('show');
}

export function closeManuscript() {
  $('manuscriptModal')?.classList.remove('show');
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
