// Board-side rendering: tiles, the shelf and workbench, the status row and
// readout, popovers, banners, and the end screens. The full-screen sheets
// (Market, Colophon, Testing Chamber) live in sheets.js.

import {
  state, settings, saveState, getActiveLetter, getActiveColour, selectedCount,
  effectivePatronSlots, effectiveSundrySlots, effectiveGhostSlots,
  effectiveWordsPerPage, chapterTitle,
  sundrySelected, restingPoints, getActiveGrowth, isWrapped,
} from './state.js';
import {
  TILE_POINTS, TRIMS, NICKS, COLOURS, LIGATURES, isMark, MATERIALS,
  WORDS_PER_PAGE, PAGES_PER_CHAPTER, tileCount,
  colourDesc, chapterLabel, roman, isDeadline, NEOLOGIST_LENGTH, SPIKE_MULT, SILVER_BONUS,
  sundryTip, FLEURON, TOOL_LOOK, PACKAGES, APPLICATORS, HONORIFIC_STEP, MEDIEVAL, letterGlyph,
  INTERROBANG, POSTNOM, BAG_COUNTS, BRIBRARIAN, bribeMult, isRule, RULE, BOLD_MULT,
} from './constants.js';
import { patronById, guildsOf, patronName, patronShelf, patronEmoji } from './patrons.js';
import { bossById } from './bosses.js';
import { computeScore } from './scoring.js';
import { marketSnapshot, patronRefund } from './market.js';
import { chamberSnapshot } from './chamber.js';
import { colophonSnapshot } from './colophon.js';
import { blackMarketSnapshot } from './blackmarket.js';
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
  if (state.tubeOffer?.includes(tile.id)) div.classList.add('tile--tube-offer');
  if (tile.trim)                  div.classList.add(`tile--trim-${tile.trim}`);
  if (tile.nick)                  div.classList.add(`tile--nick-${tile.nick}`);
  if (tile.material)              div.classList.add(`tile--mat-${tile.material}`);
  // Marked apart: the gift rides beside the hand, the E takes a place out of it.
  // A counterfeit is lent in the same sense — page-only, cast from no template —
  // but it is not on loan from anybody, and it has a look of its own below.
  if (tile.ephemeral && !tile.counterfeit) {
    div.classList.add(tile.aboveHand ? 'tile--gift' : 'tile--lent');
  }

  const active = getActiveLetter(tile);
  const paint  = getActiveColour(tile);

  // Four or more letters outgrow the ligature type sizes, so the tile doubles.
  if (active.length >= 4) div.classList.add('tile--wide');
  if (tile.letter === FLEURON) div.classList.add('tile--fleuron');
  if (tile.wash && !tile.colour) div.classList.add('tile--washed');
  // The paper goes over everything the tile was, so this class is added LAST and
  // the CSS covers trim ring, nick and metal alike.
  if (isWrapped(tile)) div.classList.add('tile--wrapped');
  if (tile.counterfeit) div.classList.add('tile--counterfeit');
  if (isRule(getActiveLetter(tile))) div.classList.add('tile--rule');
  if (MEDIEVAL[active]) div.classList.add('tile--medieval');
  if (active === INTERROBANG) div.classList.add('tile--interrobang');

  const letter = document.createElement('span');
  letter.className = 'tile-letter';
  letter.dataset.len = active.length;
  // A medieval sort SHOWS its own glyph (lowercase þ, ȝ) while `letter` stays
  // the canonical uppercase form everything else reads.
  letter.textContent = letterGlyph(active);
  if (paint) letter.style.color = COLOURS[paint].glyph;
  div.appendChild(letter);

  // Point value (bottom-right): what the tile is worth at rest, silver included.
  // An override beating that means the *word* changed it — hence --boosted.
  const base = restingPoints(tile);
  const ptsEl = document.createElement('span');
  ptsEl.className = 'tile-pts';
  ptsEl.textContent = pts ?? base;
  if (getActiveGrowth(tile)) ptsEl.classList.add('tile-pts--grown');
  if (pts != null && pts !== base) ptsEl.classList.add('tile-pts--boosted');
  div.appendChild(ptsEl);

  // Dual-letter hint (top-right). Paint belongs to the tile, not the face.
  if (tile.letterType === 'dual' && tile.altLetter) {
    const otherLetter = tile.activeVariant === 1 ? tile.letter : tile.altLetter;
    const alt = document.createElement('span');
    alt.className = 'tile-alt';
    alt.textContent = `⇄${otherLetter}`;
    if (tile.colour) alt.style.color = COLOURS[tile.colour].glyph;
    div.appendChild(alt);
  }

  // The CSS mask does the cutting; these elements only paint the shaded lip.
  if (tile.nick) {
    const a = document.createElement('span');
    a.className = `tile-nick tile-nick--${tile.nick === 'right' ? 'r' : 'l'}`;
    div.appendChild(a);
  }

  div.title = tileTitleLines(tile).join('\n');
  return div;
}

// Every feature a tile carries — the tile's only explanation, so these say what
// a thing does rather than naming it.
export function tileFeatures(tile) {
  const out = [];
  // A forgery has nothing under it, so it is said first and there is nothing
  // below to come back — unlike the wrapping, which is a page-long condition.
  if (tile.counterfeit) {
    out.push({
      head: 'A counterfeit sort',
      body: 'Forged on The Counterfeiter\'s plate. It spells, and does nothing else — no '
          + 'Points, no paint, no trim, no metal, no nick, and nothing can ever be laid on '
          + 'it. It takes a place in your hand like any other tile, and it is gone when the '
          + 'page turns. What it buys is length, and whatever your table can make of a '
          + 'letter that is merely there.',
    });
  }
  // First, because it hides everything: while the wrapper is on none of the
  // lines below are true — but they stay listed, being what comes back.
  if (isWrapped(tile)) {
    out.push({
      head: 'In manuscript',
      body: 'The Redactor has wrapped this tile and pencilled the letter on top. It still '
          + 'spells, and does nothing else — no Points, no paint, no trim, no metal, no '
          + 'nick, and nothing can be laid on it. The wrapping comes off when the page ends, '
          + 'and everything below is waiting underneath.',
    });
  }
  // A medieval sort explains what it STANDS FOR first — not guessable from the
  // glyph, and the whole reason to hold one.
  const med = MEDIEVAL[getActiveLetter(tile)];
  if (med) {
    const reads = med.reads.length > 1
      ? `${med.reads.slice(0, -1).join(', ')} or ${med.reads[med.reads.length - 1]}`
      : med.reads[0];
    out.push({
      head: `${med.name} — reads as ${reads}`,
      body: `Set it where you would set ${reads}: the dictionary, your patrons and the `
          + `editor all see the letters it stands for, so it counts for the measure as `
          + `${med.reads[0].length > 1 ? 'those letters do' : 'one letter'}. It prints as `
          + `${med.glyph} and scores its own ${TILE_POINTS[getActiveLetter(tile)]} Points. ${med.note}`,
    });
  }
  if (getActiveLetter(tile) === INTERROBANG) {
    out.push({
      head: 'Interrobang',
      body: `One glyph for ?! — so it says in a single tile what has always taken two, and `
          + `it can close a word by itself. Worth ${TILE_POINTS[INTERROBANG]} Points, the most of any `
          + `sort in the case. There is only one road to one: hold a ? and a !, and let the `
          + `Punchcutter cut the pair together.`,
    });
  }
  // What the tile *is* comes next — a material, or the fleuron.
  if (tile.letter === FLEURON) {
    out.push({
      head: 'Fleuron',
      body: 'A printer’s ornament, struck in gold. It sets no word — it can only print '
          + 'alone, for its 1 Point — and it pays 1 Coin every time a page completes, '
          + 'wherever it happens to be.',
    });
  }
  if (tile.material) {
    const m = MATERIALS[tile.material];
    if (m) out.push({ head: `${m.label} tile`, body: m.desc });
  }
  if (tile.colour) {
    out.push({ head: `${COLOURS[tile.colour].label} paint`, body: colourDesc(tile.colour) });
  } else if (tile.wash) {
    out.push({
      head: `${COLOURS[tile.wash].label} wash`,
      body: `Counts as ${COLOURS[tile.wash].label} — patrons and multiplier alike — until this tile prints, then it washes off. Real paint would replace it.`,
    });
  }
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
  if (getActiveGrowth(tile)) {
    out.push({ head: 'Grown', body: `+${getActiveGrowth(tile)} Points set permanently into this letter.` });
  }
  if (tile.ephemeral) {
    out.push(tile.lender === 'scientist'
      ? {
          head: 'The Scientist’s loan',
          body: 'Lent for this page only — it rides above your hand size, and vanishes when the page ends, played or not.',
        }
      : tile.aboveHand
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
  const grown  = getActiveGrowth(tile);
  const silver = tile.trim === 'silver' ? SILVER_BONUS : 0;
  const parts = [`${face} base`];
  if (grown)  parts.push(`${grown} grown`);
  if (silver) parts.push(`${silver} silver`);
  // Headed by the glyph the tile actually shows, not the canonical capital.
  const lines = [`${letterGlyph(active)} — ${restingPoints(tile)} Points${parts.length > 1 ? ` (${parts.join(' + ')})` : ''}`];
  for (const f of tileFeatures(tile)) lines.push(`${f.head}: ${f.body}`);
  if (breakdown) lines.push(`This word: ${breakdown.parts.join(', ')} → ${breakdown.final} Points`);
  return lines;
}

export const tileTitle = (tile, breakdown = null) => tileTitleLines(tile, breakdown).join('\n');

// ─── Popover (tap/long-press replacement for hover tooltips) ──────────────────

export function showPopover(anchorEl, html, skin = '') {
  const pop = $('popover');
  if (!pop || !anchorEl) return;
  pop.innerHTML = html;
  // The class list is SET rather than added to: a skin (a ghost's card) must
  // not outlive the popover that asked for it.
  pop.className = `tip-pop${skin ? ` ${skin}` : ''}`;

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
  // A patron with something to be *used* offers it above the dismissal, and
  // says so on its own def (patrons.js `act`) rather than being named here.
  const act = def.act?.({ seat, data: seat?.data }) ?? '';
  const name = patronName(def, seat?.data);
  const desc = def.instDesc?.(seat?.data) ?? def.desc;
  // What the seat would actually pay back, not half the list price: a patron
  // whose state has earned it a bonus (the crowned Prince) must not be offered
  // one figure and pay another — and a ghost's contract is worth nothing.
  const ghost  = !!seat?.data?.ghost;
  const refund = ghost ? 0 : seat ? patronRefund(seat) : Math.floor(def.cost / 2);
  // A patron with a hold over you (the Usurer's book) offers no way out at all.
  const held = seat ? def.holds?.(seat.data) : null;
  showPopover(anchorEl, `
    <div class="tip-head">${patronEmoji(def, seat?.data)} ${name} <span class="op-rarity">${def.rarity}</span></div>
    <div class="tip-line">${desc}</div>
    ${def.popover?.(seat?.data) ?? ''}
    ${act}
    ${held
      ? `<button class="btn btn-quiet tip-btn" disabled>${held}</button>`
      : `<button class="btn btn-quiet tip-btn" data-sell="${seat?.uid ?? def.id}">${
          ghost ? 'Let go for nothing' : `Dismiss for ${coinHTML(refund)}`}</button>`}`,
    ghost ? 'tip-pop--ghost' : '');
}

// ─── The Neologist's coining sheet ────────────────────────────────────────────
// What you coin outlives the run — kept beside the save (dict.js) and folded
// into every dictionary loaded afterwards.

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

// ─── The Counterfeiter's plate ────────────────────────────────────────────────
// Every sort he can forge, laid out at once — and you take exactly one, which is
// why the whole case can be shown without the seat becoming a free hand. Picking
// closes the plate; looking and walking away costs nothing.
export function showCounterfeitSheet() {
  const letters = Object.keys(BAG_COUNTS);
  showOverlay(`
    <div class="sheet sheet--end sheet--plate">
      <div class="end-flourish">💵</div>
      <h2 class="end-title">The plate</h2>
      <p class="end-sub">One forged sort, free, and the plate is cold until the next
        page. It spells, and nothing else — no Points, and nothing can be written on
        it. It is gone when the page turns.</p>
      <div class="plate-grid" id="plateGrid">
        ${letters.map(L => `
          <button class="plate-sort" data-counterfeit="${L}" aria-label="Take a counterfeit ${L}">
            <span class="plate-sort-letter">${L}</span>
            <span class="plate-sort-pts">0</span>
          </button>`).join('')}
      </div>
      <div class="end-actions">
        <button class="btn btn-quiet" data-plate-done>Not this page</button>
      </div>
    </div>`);
}

// ─── The Bribrarian's consideration ───────────────────────────────────────────
// Taken before the page is set, which is the whole of the gamble: you are
// buying his pen down without yet knowing what the hand will give you. Every
// step is offered, including the ones that put the purse in the red — the game
// lets you go into debt for this, and says plainly what that costs.
export function showBribeSheet(coins) {
  const rows = Array.from({ length: BRIBRARIAN.steps + 1 }, (_, n) => {
    const after = coins - n;
    const red = after < 0;
    return `
      <button class="bribe-step${red ? ' bribe-step--red' : ''}" data-bribe="${n}">
        <span class="bribe-coins">${n === 0 ? 'Nothing' : `${n} ${n === 1 ? 'Coin' : 'Coins'}`}</span>
        <span class="bribe-mult">×${bribeMult(n)}</span>
        <span class="bribe-after">${red ? `${after} — in the red` : `${after} left`}</span>
      </button>`;
  }).join('');
  showOverlay(`
    <div class="sheet sheet--end sheet--bribe">
      <div class="end-flourish">🤝</div>
      <h2 class="end-title">A consideration</h2>
      <p class="end-sub">The Bribrarian will penalise every word you set this page.
        How heavily is a matter between the two of you, and it is settled now —
        before you have seen what the hand holds.</p>
      <div class="bribe-grid">${rows}</div>
      <p class="bribe-note">You have ${coins} ${coins === 1 ? 'Coin' : 'Coins'}. You may go into
        the red — nothing in the Market will sell to a purse that cannot cover it,
        so a debt shuts the shop until it is worked off.</p>
    </div>`);
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
// the board — so the table steps back and leaves only the workbench lit.
function applyToolReady() {
  const table = document.querySelector('.table');
  if (!table) return;
  const armed = state.sundryMode >= 0 ? state.sundries[state.sundryMode] : null;
  table.classList.toggle('table--tool-ready', !!armed && sundrySelected().length > 0);
}

export function renderAll() {
  // One script for the whole frame, so what a patron promises and what it pays
  // can't disagree.
  const script = computeScore(state.word);
  renderShelf(script);
  renderGhosts();
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
    state.inChamber  ? { _chamber: chamberSnapshot() } :
    state.inMarket  ? { _market: marketSnapshot() } :
    state.inColophon ? { _colophon: colophonSnapshot() } :
    state.inBlackMarket ? { _blackmarket: blackMarketSnapshot() } : {}
  );
}

// ─── Patron shelf ─────────────────────────────────────────────────────────────

// Seats are rebuilt only when the seating itself changes; everything else is a
// class or a badge, so laying a tile can't restart the glow from frame zero.
let _shelfSig = '';
let _armedIds = new Set();

function renderShelf(script) {
  const shelf = $('shelf');
  if (!shelf) return;
  const seats = effectivePatronSlots();
  // Laurels ride the signature, or a crowning mid-page would wait for the next
  // seating change to show. So does anything else that changes a seat's FACE —
  // the Azure Prince's cyphers rename him and hand him a crown — read through
  // the same instName the card will use, so nothing can drift out of step.
  const sig = `${seats}|${state.patrons.map(p =>
    `${p.uid ?? p.id}~${p.data?.honorifics ?? 0}~${patronShelf(patronById(p.id), p.data)}`).join(',')}`;

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
        const name  = patronName(def, p.data);
        const label = patronShelf(def, p.data);
        const desc  = def.instDesc?.(p.data)  ?? def.desc;
        const [livery, livery2] = guildsOf(def);   // a dual-livery seat wears both pins
        const refund = patronRefund(p);
        slot.className = `patron patron--${def.rarity}${livery ? ` patron--g-${livery}` : ''}`
                       + (livery2 ? ` patron--g2-${livery2}` : '')
                       + (p.data?.postnom ? ' patron--postnom' : '');
        slot.dataset.patron = def.id;
        if (p.uid != null) slot.dataset.uid = p.uid;
        slot.dataset.baseTitle = `${name} — ${desc}\n(✕ dismisses for ${refund} Coins)`;
        slot.title = slot.dataset.baseTitle;
        const laurels = p.data?.honorifics ?? 0;
        slot.innerHTML = `
          <span class="patron-emoji">${patronEmoji(def, p.data)}</span>
          <span class="patron-name">${label}</span>
          ${p.data?.postnom ? `<span class="patron-postnom" title="${patronName(def, p.data)} — a distinguished patron: ×${POSTNOM.mult} Mult, paid at this seat's turn in the running order">${p.data.postnom}</span>` : ''}
          ${laurels ? `<span class="patron-laurel" title="${laurels > 1 ? `${laurels} laurels` : 'A laurel'} — +${laurels * HONORIFIC_STEP} Points every word, paid at this seat's turn, lost if this patron is dismissed">🏵️${laurels > 1 ? `<b>${laurels}</b>` : ''}</span>` : ''}
          <button class="patron-x" data-sell="${p.uid ?? def.id}" title="Dismiss ${name} for ${refund} Coins">✕</button>`;
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

// What each patron stands to add, read off the score script; several steps fold
// into one badge. Keyed by the seat's uid where the step carries one (so
// stackable copies badge separately), else the def id.
function patronTakes(script) {
  const takes = new Map();
  // Tile bonuses first — the badge reads in the order the print will.
  for (const s of [...(script?.tilePaintSteps ?? []), ...(script?.tileBoostSteps ?? []),
                  ...(script?.patronSteps ?? [])]) {
    // A brush step pays nothing itself, so its badge shows the colour it lays.
    const chip = s.hits?.[0]?.colour ? COLOURS[s.hits[0].colour].label
               : s.xmult ? `×${fmtMult(s.xmult)}`
               : s.mult  ? `+${fmtMult(s.mult)}`
               : s.coins ? `+${s.coins}c`
               :           `+${s.points}`;
    const kind = s.hits?.[0]?.colour ? `paint patron-take--paint-${s.hits[0].colour}`
               : s.points ? 'points' : s.coins ? 'coins' : 'mult';
    const key = String(s.uid ?? s.id);
    const prev = takes.get(key);
    takes.set(key, prev
      ? { chip: `${prev.chip} ${chip}`, kind: prev.kind, text: `${prev.text}, ${s.text}` }
      : { chip, kind, text: s.text });
  }
  return takes;
}

// Patrons the word already satisfies light up wearing what they'd contribute.
// A newly woken one gets a one-shot flourish; a badge whose number moves bumps.
function paintArmed(shelf, script) {
  const takes = patronTakes(script);
  shelf.classList.toggle('shelf--live', takes.size > 0);

  // Remember which CARDS were lit, not which steps fired — a card matched
  // through the def-id fallback must still count as armed, or its wake-up
  // flourish restarts on every keystroke.
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

// ─── The ghosts (patrons The Ripper killed) ───────────────────────────────────
// A ghost gave up its seat and kept everything else — its turn in the running
// order, its hooks, its laurels — so it lives behind a door beside the shelf.

// One card per ghost slot, filled or not — The Ripper stays his hand when there
// is no room left, so the empties matter too.
function ghostCardsHTML() {
  const slots = effectiveGhostSlots();
  let out = '';
  for (let i = 0; i < slots; i++) {
    const p = state.ghosts?.[i];
    if (!p) {
      out += `<div class="patron patron--empty patron--ghost" title="Room for another ghost">
        <span class="patron-empty-mark">❧</span></div>`;
      continue;
    }
    const def = patronById(p.id);
    if (!def) continue;
    const name  = patronName(def, p.data);
    const label = patronShelf(def, p.data);
    const desc  = def.instDesc?.(p.data) ?? def.desc;
    const laurels = p.data?.honorifics ?? 0;
    out += `
      <div class="patron patron--ghost patron--${def.rarity}"
           data-patron="${def.id}"${p.uid != null ? ` data-uid="${p.uid}"` : ''}
           title="${name} — ${desc}
(dead, and working still · ✕ lets it go for nothing)">
        <span class="patron-emoji">${patronEmoji(def, p.data)}</span>
        <span class="patron-name">${label}</span>
        ${laurels ? `<span class="patron-laurel" title="${laurels > 1 ? `${laurels} laurels` : 'A laurel'} — +${laurels * HONORIFIC_STEP} Points every word, paid at this ghost's turn">🏵️${laurels > 1 ? `<b>${laurels}</b>` : ''}</span>` : ''}
        <button class="patron-x" data-sell-ghost="${p.uid ?? def.id}" title="Let ${name} go — a ghost's contract is worth nothing">✕</button>
      </div>`;
  }
  return out;
}

function renderGhosts() {
  const btn = $('ghostBtn');
  if (!btn) return;
  const ghosts = state.ghosts ?? [];
  btn.classList.toggle('hidden', ghosts.length === 0);
  if (!ghosts.length) return;
  const named = ghosts.map(p => patronName(patronById(p.id), p.data)).join(', ');
  btn.innerHTML = `<span class="ghost-btn-mark">👻</span>
    <span class="ghost-btn-count">${ghosts.length}</span>`;
  btn.title = `${named} — dead, and working still. Ghosts act after every seated patron.`;
}

export function openGhosts() {
  const m = $('ghostModal');
  if (!m) return;
  const n = state.ghosts?.length ?? 0;
  m.innerHTML = `
    <div class="sheet sheet--ghosts">
      <div class="sheet-head">
        <h2>Your ghosts <span class="ghost-tally">${n}/${effectiveGhostSlots()}</span></h2>
        <button class="x" data-close-ghosts>✕</button>
      </div>
      <p class="sheet-note">Murdered by The Ripper, and working still. A ghost keeps its whole
        effect and gives up only its seat — it speaks after every living patron, and its
        contract is worth nothing when you let it go.</p>
      <div class="shelf shelf--ghosts" style="--seat-count:${effectiveGhostSlots()}">${ghostCardsHTML()}</div>
    </div>`;
  m.classList.add('show');
}

export function closeGhosts() { $('ghostModal')?.classList.remove('show'); }

export const ghostsOpen = () => !!$('ghostModal')?.classList.contains('show');

// ─── Sundries (the workbench beside the shelf) ────────────────────────────────
// Fixed slot count so buying or spending a tube never reflows the board.

// A slot explains itself through the shop's popover (drag.js → initInspect).
function tagSlot(slot, s) {
  const tip = sundryTip(s);
  if (!tip) return;
  slot.dataset.tipHead = tip.head;
  slot.dataset.tipBody = tip.body;
  slot.title = `${tip.head} — ${tip.body}`;
}

// Every occupied slot wears a ✕, hidden until hover — which also keeps it off a
// touchscreen, where a stray tap would cost you a toolbox. There the act lives
// on the long-press popover instead (showTipFor in drag.js).
function tagDiscard(slot, s, i) {
  const head = sundryTip(s)?.head ?? 'The sundry';
  // A span, not a button: the slot it sits on IS a button, and HTML forbids the
  // nesting. The click reaches main.js through delegation either way.
  const x = document.createElement('span');
  x.className = 'sundry-x';
  x.setAttribute('role', 'button');
  x.dataset.discardSundry = i;
  x.title = `${head} — throw it away`;
  x.textContent = '✕';
  slot.appendChild(x);
}

function renderSundries() {
  const bench = $('sundries');
  if (!bench) return;
  bench.innerHTML = '';
  const slots = effectiveSundrySlots();
  bench.style.setProperty('--slot-count', slots);

  for (let i = 0; i < slots; i++) {
    const s = state.sundries?.[i];
    let slot;
    if (s?.kind === 'tube') {
      const armed  = state.sundryMode === i;
      const picked = armed && sundrySelected().length > 0;
      slot = document.createElement('button');
      slot.className = `sundry sundry--${s.colour}${armed ? ' sundry--armed' : ''}`
                     + (picked ? ' sundry--ready' : '');
      slot.dataset.sundry = i;
      slot.innerHTML = `
        <span class="paint-tube paint-tube--${s.colour}"></span>
        <span class="sundry-name">${picked ? 'Paint it' : COLOURS[s.colour].label}</span>`;
    } else if (s?.kind === 'reshuffle') {
      slot = document.createElement('button');
      slot.className = 'sundry sundry--reshuffle';
      slot.dataset.sundry = i;
      slot.innerHTML = `
        <span class="sundry-shuffle">↻</span>
        <span class="sundry-name">Reshuffle</span>`;
    } else if (s?.kind === 'ratchet') {
      const armed  = state.sundryMode === i;
      const picked = armed && sundrySelected().length > 0;
      // The arrows only choose direction — spending is a tap anywhere on the slot.
      const dir = state.ratchetDir ?? 1;
      slot = document.createElement('button');
      slot.className = `sundry sundry--ratchet${armed ? ' sundry--armed' : ''}`
                     + (picked ? ' sundry--ready' : '');
      slot.dataset.sundry = i;
      slot.innerHTML = `
        <span class="ratchet-arrows">
          <span class="ratchet-arrow${dir === 1 ? ' ratchet-arrow--on' : ''}"
                data-shift="1" title="A step later — D to E">▲</span>
          <span class="ratchet-arrow${dir === -1 ? ' ratchet-arrow--on' : ''}"
                data-shift="-1" title="A step earlier — D to C">▼</span>
        </span>
        <span class="sundry-name">${picked ? 'Step it' : armed ? 'Pick a letter' : 'Ratchet'}</span>`;
    } else if (s?.kind === 'wrapped') {
      // No material on the slot: nothing is decided until it is opened.
      slot = document.createElement('button');
      slot.className = 'sundry sundry--wrapped';
      slot.dataset.sundry = i;
      slot.innerHTML = `
        <span class="wrapped-mark"></span>
        <span class="sundry-name">Wrapped</span>`;
    } else if (s?.kind === 'package' && PACKAGES[s.theme]) {
      // The wrapped tile's own mark, recoloured — one language for "open me".
      slot = document.createElement('button');
      slot.className = `sundry sundry--wrapped sundry--package sundry--pkg-${s.theme}`;
      slot.dataset.sundry = i;
      slot.innerHTML = `
        <span class="wrapped-mark"></span>
        <span class="sundry-name">Parcel</span>`;
    } else if (s?.kind === 'applicator' && APPLICATORS[s.material]) {
      const armed  = state.sundryMode === i;
      const picked = armed && sundrySelected().length > 0;
      slot = document.createElement('button');
      slot.className = `sundry sundry--tool sundry--applicator sundry--app-${s.material}`
                     + (armed ? ' sundry--armed' : '') + (picked ? ' sundry--ready' : '');
      slot.dataset.sundry = i;
      slot.innerHTML = `
        <span class="sundry-glyph">${APPLICATORS[s.material].glyph}</span>
        <span class="sundry-name">${picked ? 'Strike it' : armed ? 'Pick a tile' : 'Applicator'}</span>`;
    } else if (s?.kind && TOOL_LOOK[s.kind]) {
      // The loupe and the tongs arm like the ratchet, so they show the same
      // armed/ready states; the box, the laurel and the wash spend on a tap.
      const armed  = state.sundryMode === i;
      const picked = armed && sundrySelected().length > 0;
      slot = document.createElement('button');
      slot.className = `sundry sundry--tool sundry--${s.kind}${armed ? ' sundry--armed' : ''}`
                     + (picked ? ' sundry--ready' : '');
      slot.dataset.sundry = i;
      const name = s.kind === 'loupe' ? (picked ? 'Double it' : armed ? 'Pick a tile' : 'Loupe')
                 : s.kind === 'tongs' ? (picked ? 'Destroy it' : armed ? 'Grip a tile' : 'Tongs')
                 : TOOL_LOOK[s.kind].label;
      slot.innerHTML = `
        <span class="sundry-glyph">${TOOL_LOOK[s.kind].glyph}</span>
        <span class="sundry-name">${name}</span>`;
    } else {
      slot = document.createElement('div');
      slot.className = 'sundry sundry--empty';
      slot.title = 'Room for a sundry — sold at the Market';
      slot.innerHTML = `<span class="sundry-empty-mark">✒</span>`;
    }
    tagSlot(slot, s);
    if (s) tagDiscard(slot, s, i);
    bench.appendChild(slot);
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

  // Quotas run into six figures by the appendices — group the digits.
  setText('quotaNow', state.pageScore.toLocaleString());
  setText('quotaTarget', state.quota.toLocaleString());
  const fill = $('quotaFill');
  if (fill) {
    fill.style.width = `${Math.min(100, (state.pageScore / state.quota) * 100)}%`;
    fill.classList.toggle('quota-fill--done', state.pageScore >= state.quota);
  }
  $('quotaCard')?.classList.toggle('quota-card--deadline', deadline);
  // Hung on the body so the stylesheet can relight the whole room without every
  // component having to be told (see "The Deadline's light" in style.css).
  document.body.classList.toggle('deadline-on', deadline);

  renderPips('wordPips', Math.max(effectiveWordsPerPage(), state.wordsLeft), state.wordsLeft, 'pip--word');
  const dMax = Math.max(state.discardsMax ?? 2, state.discards);
  renderPips('discardPips', dMax, state.discards, 'pip--swap');

  const coinsEl = $('coinCount');
  if (coinsEl) setNum(coinsEl, state.coins);

  // The tally lives in the tooltip and nowhere else: a counter pinned to the
  // button would read as an unread-notification pip demanding to be cleared.
  const msBtn = $('manuscriptBtn');
  if (msBtn) {
    const n = state.manuscript?.length ?? 0;
    msBtn.title = n
      ? `The manuscript — ${n} word${n === 1 ? '' : 's'} printed this run`
      : 'The manuscript — nothing printed yet';
  }
}

// ─── The editor's bar (Deadline pages only) ───────────────────────────────────
// The seated editor, their live demand, and a verdict called before you print.
// Reads the same score script as the readout, so the two can't disagree.

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
  // An editor with a MOOD takes a cut of every word without spiking anything —
  // the Reviewer's temper, the Bribrarian's fee. Saying "passes" beside a score
  // he has just shortened is a small lie, so the cut is named instead.
  const cut = def.mood?.(data);
  const cutting = cut != null && cut < 1;
  const verdict = !state.word.length || !script ? ''
    : script.spiked
      ? `<span class="boss-verdict boss-verdict--bad">✂ spiked — ×${SPIKE_MULT} Mult</span>`
      : cutting
        ? `<span class="boss-verdict boss-verdict--bad">✂ his cut — ×${cut} Mult</span>`
        : `<span class="boss-verdict boss-verdict--ok">✓ passes</span>`;

  // One mark per word printed, in order. Only for editors that judge — the
  // Reviewer and the Completist never spike, so a row of ✓s would say nothing.
  const trail = def.judge ? (data.verdicts ?? []) : [];
  const trailHTML = trail.length
    ? `<span class="boss-trail" title="${trail.filter(v => v === 'spiked').length} of ${trail.length} spiked so far">${
        trail.map(v => `<span class="boss-mark boss-mark--${v}">${v === 'spiked' ? '✂' : '✓'}</span>`).join('')}</span>`
    : '';

  el.classList.remove('hidden');
  el.classList.toggle('boss-bar--warn', (!!script?.spiked || cutting) && !!state.word.length);
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

// An armed sundry tints both board zones. A tube tints them its own colour; the
// ratchet has none and takes steel. That fallback is load-bearing — `COLOURS[null]`
// threw here, between emptying the rack and refilling it, wiping the whole hand.
function applyPaintingMode(el) {
  const armed = state.sundryMode >= 0 ? state.sundries[state.sundryMode] : null;
  el.classList.toggle('zone--painting', !!armed);
  el.classList.toggle('zone--stepping', armed?.kind === 'ratchet');
  // Only a tube lays tiles out to choose between — the ratchet, loupe and tongs
  // take any tile, so their zones dim nothing. Hence a class of its own.
  el.classList.toggle('zone--offering',
    armed?.kind === 'tube' && !!state.tubeOffer?.length);
  if (armed) el.style.setProperty('--paintcol', COLOURS[armed.colour]?.glyph ?? 'var(--steel)');
}

// The rack reserves room for the WHOLE HAND — the tiles in it plus the ones
// standing in the word — so composing never shrinks it and jumps the board up.
// It reserves, never fixes: a bigger hand still grows it. Written as a custom
// property CSS maxes against its own minimum, so the stylesheet's floors stay
// in charge of the empty case.
function reserveRackHeight(el) {
  const cs = getComputedStyle(el);
  const inner = el.clientWidth
    - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
  if (!(inner > 0)) return;                     // not laid out yet — nothing to measure

  const root  = getComputedStyle(document.documentElement);
  const tileW = parseFloat(root.getPropertyValue('--tile-w')) || 0;
  const tileH = parseFloat(root.getPropertyValue('--tile-h')) || 0;
  if (!tileW || !tileH) return;
  const colGap = parseFloat(cs.columnGap || 0) || 0;
  const rowGap = parseFloat(cs.rowGap || 0) || 0;

  // Same packing flex-wrap does, over the whole hand in rack order. A tile
  // showing four or more letters is drawn double width (see makeTileEl).
  const hand = [...state.rack, ...state.word];
  let rows = 1, run = 0;
  for (const t of hand) {
    const w = (getActiveLetter(t)?.length ?? 1) >= 4 ? tileW * 2 : tileW;
    if (run > 0 && run + colGap + w > inner + 0.5) { rows++; run = w; }
    else run += (run > 0 ? colGap : 0) + w;
  }
  const padY = parseFloat(cs.paddingTop || 0) + parseFloat(cs.paddingBottom || 0);
  el.style.setProperty('--rack-reserve', `${rows * tileH + (rows - 1) * rowGap + padY}px`);
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
  reserveRackHeight(el);
}

// A resize, rotation or breakpoint changes how many tiles fit a row — measure again.
if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => {
    const el = $('rack');
    if (el) reserveRackHeight(el);
  });
}

// Last render's displayed contributions, so changes can be animated.
let _lastWordPts = new Map();
const RIPPLE_STEP = 70;   // ms between neighbours as a nick's effect spreads

export function renderWord(script = computeScore(state.word)) {
  const el = $('word');
  if (!el) return;
  el.innerHTML = '';
  el.dataset.placeholder = state.word.length ? '' : 'compose a word…';
  applyPaintingMode(el);

  // Ripple order: distance from the nick that claimed each letter.
  const posOf = new Map(state.word.map((t, i) => [t.id, i]));
  const delayOf = new Map();
  for (const step of script?.nickSteps ?? []) {
    const src = posOf.get(step.sourceId);
    for (const hit of step.hits) {
      delayOf.set(hit.id, (Math.abs(posOf.get(hit.id) - src) - 1) * RIPPLE_STEP);
    }
  }

  const nowPts = new Map();
  // The Twins strike the letters a word is missing (BALOON's second L), and the
  // groove shows them from the moment the word is composed: the projection
  // already counts them, so a promise of seven letters must show seven. They are
  // rendered as phantoms — nothing in state.word, nothing to drag, nothing to
  // file away afterwards — and the print is where they turn solid.
  const summonsAt = new Map((script?.twinSummons ?? []).map(su => [su.at, su.tile]));

  // The Twins read a pair before anything is counted, and a recasting OVERWRITES
  // the second tile — so the groove brackets every pair the seat can see while
  // the word is still being composed: a gap either side, and a dashed rule that
  // breathes. It is a warning as much as a promise, and it is what makes "set
  // the good tile first" a choice rather than a trap.
  const markTwinPair = (el, id) => {
    const side = script?.twinPairMarks?.get(id);
    if (!side) return;
    el.classList.add('tile--twin-pair');
    if (side === 'open' || side === 'both') el.classList.add('tile--twin-pair-open');
    if (side === 'close' || side === 'both') el.classList.add('tile--twin-pair-close');
  };

  const phantomTwinEl = t => {
    const e = makeTileEl(t, 'word', { pts: script?.perTile?.get(t.id)?.final ?? null });
    e.classList.add('tile--twin-phantom');
    markTwinPair(e, t.id);
    e.dataset.twin = t.id;          // addressable by the print, but not by a pointer
    e.removeAttribute('data-id');   // nothing may drag, flip or select a phantom
    return e;
  };

  const wordTileEl = t => {
    const bd = script?.perTile.get(t.id);
    const shown = bd?.final ?? null;
    // The Twins recast a doubled tile as the one beside it before anything is
    // counted, so the groove shows what it now READS as — again on a copy, since
    // the tile itself is unchanged and files away as plain as it arrived.
    const twinned = script?.twinCloned?.get(t.id);
    const base = twinned ?? t;
    // The Illuminator's brush lands before the word is counted, so the groove
    // shows the colour on a COPY — the paint isn't owned until the word prints.
    const wet = script?.tilePaint?.get(t.id);
    const tileEl = makeTileEl(wet ? { ...base, colour: wet } : base, 'word', { pts: shown });
    markTwinPair(tileEl, t.id);
    if (wet) {
      tileEl.style.setProperty('--glow', COLOURS[wet].glyph);
      tileEl.classList.add('tile--illuminating');
    }
    if (bd) tileEl.title = tileTitle(t, bd);
    // A jade trellis writes these Points in for keeps — jade, not boost brass.
    if (script?.tileGrowth?.has(t.id)) {
      tileEl.querySelector('.tile-pts')?.classList.add('tile-pts--growing');
    }
    nowPts.set(t.id, shown);

    // Worth announcing: a number a nick just rewrote, or one landing boosted.
    const wasShowing = _lastWordPts.has(t.id);
    const face       = restingPoints(t);
    const rewritten  = wasShowing && _lastWordPts.get(t.id) !== shown;
    const bornBoosted = !wasShowing && shown !== face;
    if (shown != null && (rewritten || bornBoosted)) {
      const ptsEl = tileEl.querySelector('.tile-pts');
      ptsEl.classList.add('pts-pop');
      ptsEl.style.animationDelay = `${(delayOf.get(t.id) ?? 0) / (settings.animSpeed || 1)}ms`;
    }
    return tileEl;
  };

  // A phantom takes the place it was struck into, which may be the end of the
  // word — hence the extra turn past the last tile.
  for (let i = 0; i <= state.word.length; i++) {
    const su = summonsAt.get(i);
    if (su) el.appendChild(phantomTwinEl(su));
    if (state.word[i]) el.appendChild(wordTileEl(state.word[i]));
  }
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
// Bold rides at the end with cursed: its chip only appears when the word is
// actually bracketed, so the rack doesn't carry a slot most words never use.
export const CHIP_COLOURS = ['length', ...Object.keys(COLOURS), 'purple', 'cursed', 'bold'];

export function updateReadoutPreview(script) {
  const ro = $('readout');
  if (!ro) return;
  ro.classList.toggle('readout--idle', !script);
  setNum($('roPoints'), script ? script.points : 0);
  setNum($('roTotal'), script ? script.total : 0);
  showStruckTotal(script?.adjusted ? script.plainTotal : null);
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

// The figure the Deadline's editor crossed out. Shown beside the real total,
// struck through — the score the word was worth, and what the desk made of it.
// Passing null puts it away.
export function showStruckTotal(plain) {
  const el = $('roTotalPlain');
  if (!el) return;
  el.hidden = plain == null;
  if (plain != null) setNum(el, plain);
}

// Imperative access for the scoring cinematic
export const readoutEls = () => ({
  points: $('roPoints'), total: $('roTotal'), plain: $('roTotalPlain'),
  root: $('readout'), coins: $('coinCount'),
  chip: c => $(`chip-${c}`),
});

// ─── Buttons ──────────────────────────────────────────────────────────────────

export function renderButtons() {
  const blocked = state.inMarket || state.inChamber || state.inColophon || state.inBlackMarket
                || state.isAnimating || state.gameOver;
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
// At rest the bar is the manuscript — every word printed this run as one long
// line of type, newest last. A message takes it over, then it settles back.

// How long a message holds the bar, measured off the text rather than fixed —
// `readingTime` plus a little, the bar being at the foot of the board where the
// eye is not already resting.
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

// The page being set, as one line of type. The bound book is openManuscript().
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
    const cls = `ms-word${last ? ' ms-word--last' : ''}${last && grew ? ' ms-word--new' : ''}`
              + `${r.bold ? ' ms-word--bold' : ''}`;
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

// `hold` is how long the banner stays up: a number fixes it, 'read' holds it
// long enough to read the subtitle. A 'read' banner is also dismissible on tap —
// fixed-length ones are not, so a stray tap can't skip the chapter title.
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
  // data-tid is what makes a tile inspectable (drag.js → templateFor), so the
  // bag and the discard pile explain their tiles like everywhere else does.
  sorted.forEach(tmpl => {
    const el = makeTileEl({ ...tmpl, id: '' }, 'inspect', { mini: true });
    if (tmpl.tid != null) el.dataset.tid = tmpl.tid;
    grid.appendChild(el);
  });
  if (!sorted.length) grid.innerHTML = '<p class="sheet-note">Empty.</p>';
  m.classList.add('show');
}

// ─── The manuscript, bound (every word printed this run) ──────────────────────
// The whole book so far, gathered into chapters and read front to back. The
// strip at the foot of the board (renderManuscript, above) is the current page.

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

  // `initial` gives a chapter's first word its drop cap; ::first-letter can't,
  // since these are inline runs rather than blocks.
  const entry = (r, initial) => {
    const word = initial
      ? `<span class="book-initial">${r.word.slice(0, 1)}</span>${r.word.slice(1)}`
      : r.word;
    const n = r.score.toLocaleString();
    return `<span class="book-entry${best && r.score === best ? ' book-entry--best' : ''}" `
         + `title="${r.word} — ${n} points${r.bold ? ', set bold' : ''}">`
         + `<span class="book-word${r.bold ? ' book-word--bold' : ''}">${word}</span>`
         + `<span class="book-score">${n}</span></span>`;
  };

  // Folio in the margin, lower-case roman. A Deadline is marked, not numbered.
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
