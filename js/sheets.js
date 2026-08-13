// The full-screen sheets: the Market (and its stalls and collection view),
// the Colophon, and the opening draft — their HTML and their click handling,
// in one place. Board-side rendering lives in render.js; game flow stays in
// main.js and is injected via initSheets().

import {
  state, effectivePatronSlots, effectiveSundrySlots, spendReshuffleSundry,
} from './state.js';
import {
  TRIMS, COLOURS, STALL_DEFS, SMELT_MIN_COLLECTION, SKIP_COIN_GRANT,
  PAINT_PER_POT, TUBE_TILES, ANIM,
  colourDesc, roman,
} from './constants.js';
import { patronById } from './patrons.js';
import { upgradeById } from './upgrades.js';
import {
  market, stallById, stallPrice, restorable,
  buyPatron, buyTile, buySundry, rerollMarket, freeRerollMarket,
  stallSmelt, stallPaint, stallGild, stallClone, stallRestore,
} from './market.js';
import {
  colophon, closeColophon, applyColophonPick, applyColophonSkip, reshuffleColophon,
} from './colophon.js';
import { draft, draftLimit, toggleDraftPick } from './draft.js';
import { makeTileEl, coinHTML, log, renderAll, persist } from './render.js';
import { sfx, pulse, sparkleBurst, flyClone, sleep } from './anim.js';

const $ = id => document.getElementById(id);
const rect = el => el?.getBoundingClientRect();

function setText(id, val) {
  const el = $(id);
  if (el) el.textContent = val;
}

// ─── The Market ───────────────────────────────────────────────────────────────

// Full build. Only for opening the market, switching view, or completing a
// stall purchase — buying offers patches in place (see updateMarketState) so
// a purchase never throws away your scroll position.
export function renderMarket() {
  const m = $('marketModal');
  if (!m) return;
  if (!market.open) { m.classList.remove('show'); m.innerHTML = ''; return; }

  m.innerHTML = market.view === 'stall'      ? marketStallHTML()
              : market.view === 'collection' ? marketCollectionHTML()
              :                                 marketShopHTML();
  m.classList.add('show');

  if (market.view === 'stall') {
    renderStallBody();
    updateStallState();
  } else if (market.view === 'collection') {
    renderCollectionGrid();
  } else {
    market.tileOffers.forEach((o, i) => {
      const slot = m.querySelector(`[data-offer-tile="${i}"]`);
      if (slot && !slot.children.length) slot.appendChild(makeTileEl({ ...o.template, id: '' }, 'offer'));
    });
    updateMarketState();
  }
}

// Sold state, prices you can and can't afford, the coin count — all patched
// without rebuilding the sheet.
export function updateMarketState() {
  const m = $('marketModal');
  if (!m || !market.open) return;

  setText('marketCoins', state.coins);

  const seatsFull = state.patrons.length >= effectivePatronSlots();
  const benchFull = state.sundries.length >= effectiveSundrySlots();
  for (const card of m.querySelectorAll('[data-offer]')) {
    const kind = card.dataset.offer;
    const idx  = Number(card.dataset.idx);
    const offer = kind === 'patron' ? market.patronOffers[idx]
                : kind === 'tile'   ? market.tileOffers[idx]
                :                     market.sundryOffers[idx];
    if (!offer) continue;
    const cost = kind === 'patron' ? patronById(offer.id).cost : offer.price;
    const afford = state.coins >= cost
      && (kind !== 'patron' || !seatsFull)
      && (kind !== 'sundry' || !benchFull);
    card.classList.toggle('offer--sold', !!offer.sold);
    const btn = card.querySelector('.btn-price');
    if (btn) btn.disabled = offer.sold || !afford;
  }

  const seats = m.querySelector('[data-seats]');
  if (seats) seats.textContent = `${state.patrons.length}/${effectivePatronSlots()} seated${seatsFull ? ' — table full' : ''}`;
  const bench = m.querySelector('[data-bench]');
  if (bench) bench.textContent = `${state.sundries.length}/${effectiveSundrySlots()} on the workbench${benchFull ? ' — full' : ''}`;

  const reroll = m.querySelector('#btnReroll');
  if (reroll) reroll.disabled = state.coins < market.rerollCost;
}

function rewardHTML() {
  if (!market.rewardParts?.length) return '';
  const rows = market.rewardParts
    .map(p => `<span class="reward-part">${p.label} <b>+${p.coins}</b></span>`).join('');
  return `<div class="reward-line">${rows}<span class="reward-total">${coinHTML(market.rewardTotal)} earned</span></div>`;
}

function marketShopHTML() {
  const patronCards = market.patronOffers.map((o, i) => {
    const def = patronById(o.id);
    return `
      <div class="offer-patron offer-patron--${def.rarity}" data-offer="patron" data-idx="${i}">
        <div class="op-portrait">${def.portrait
          ? `<img src="${def.portrait}" alt="${def.name}">`
          : `<span class="op-emoji">${def.emoji}</span>`}</div>
        <div class="op-card-body">
          <div class="op-name">${def.name}</div>
          <div class="op-title">${def.rarity}</div>
          <div class="op-desc">${def.desc}</div>
        </div>
        <span class="op-sold">seated</span>
        <button class="btn-price" data-buy-patron="${def.id}">${coinHTML(def.cost)}</button>
      </div>`;
  }).join('') || '<p class="sheet-note">No patrons calling today.</p>';

  // Nothing is summarised under the tile — hover or long-press it.
  const tileCards = market.tileOffers.map((o, i) => `
      <div class="offer-tile" data-offer="tile" data-idx="${i}">
        <div class="offer-tile-slot" data-offer-tile="${i}"></div>
        <span class="op-sold">bought</span>
        <button class="btn-price" data-buy-tile="${i}">${coinHTML(o.price)}</button>
      </div>`).join('');

  const sundryCards = market.sundryOffers.map((o, i) => o.kind === 'reshuffle' ? `
      <div class="offer-paint" data-offer="sundry" data-idx="${i}"
           data-tip-head="Reshuffle" data-tip-body="A free re-roll, banked on your workbench for later — spend it here on these same offers, or on a Colophon pick when a chapter clears.">
        <span class="sundry-shuffle sundry-shuffle--offer">↻</span>
        <div class="op-body">
          <div class="op-name">Reshuffle</div>
        </div>
        <span class="op-sold">bought</span>
        <button class="btn-price" data-buy-sundry="${i}">${coinHTML(o.price)}</button>
      </div>` : `
      <div class="offer-paint offer-paint--${o.colour}" data-offer="sundry" data-idx="${i}"
           data-tip-head="Tube of ${COLOURS[o.colour].label}"
           data-tip-body="Tap it mid-page, tap up to ${TUBE_TILES} tiles, tap it again — painted ${COLOURS[o.colour].label} for good. ${colourDesc(o.colour)}">
        <span class="paint-tube paint-tube--${o.colour}"></span>
        <div class="op-body">
          <div class="op-name">Tube of ${COLOURS[o.colour].label}</div>
        </div>
        <span class="op-sold">bought</span>
        <button class="btn-price" data-buy-sundry="${i}">${coinHTML(o.price)}</button>
      </div>`).join('');

  const stallCards = market.stalls.map(s => {
    const def = STALL_DEFS[s.id];
    return `
      <div class="offer-stall awning--${s.id}" data-stall-card="${s.id}">
        <span class="stall-emoji">${def.emoji}</span>
        <div class="op-body">
          <div class="op-name">${def.name}</div>
          <div class="op-desc">${def.desc}</div>
        </div>
        <button class="btn-price" data-visit-stall="${s.id}">Visit · ${coinHTML(stallPrice(s))}</button>
      </div>`;
  }).join('');

  const fullSeats = state.patrons.length >= effectivePatronSlots();
  const fullBench = state.sundries.length >= effectiveSundrySlots();
  const reshuffles = state.sundries.filter(s => s.kind === 'reshuffle').length;

  const returning = market.returning ? ' sheet--return' : '';
  market.returning = false;

  return `
    <div class="sheet sheet--market${returning}">
      <div class="sheet-head">
        <div>
          <h2 class="market-title">The Market</h2>
          <div class="market-purse"><span class="coin coin--lg"></span><b id="marketCoins">${state.coins}</b></div>
        </div>
        ${rewardHTML()}
      </div>

      <div class="market-grid">
        <section class="market-col">
          <h3 class="market-sec">Patrons <span class="market-sub" data-seats>${state.patrons.length}/${effectivePatronSlots()} seated${fullSeats ? ' — table full' : ''}</span></h3>
          <div class="offer-list">${patronCards}</div>
        </section>
        <section class="market-col">
          <h3 class="market-sec">Tiles</h3>
          <div class="offer-tiles">${tileCards}</div>
          <h3 class="market-sec market-sec--paint">Sundries <span class="market-sub" data-bench>${state.sundries.length}/${effectiveSundrySlots()} on the workbench${fullBench ? ' — full' : ''}</span></h3>
          <div class="offer-list">${sundryCards}</div>
        </section>
      </div>

      <section class="market-stalls">
        <h3 class="market-sec">Stalls <span class="market-sub">each purchase doubles the price · new stalls next shop</span></h3>
        <div class="stall-row">${stallCards}</div>
      </section>

      <div class="market-foot">
        <button class="btn btn-quiet" id="btnReroll" title="Re-rolls patrons, tiles and sundries — the stalls stay put"
          ${state.coins < market.rerollCost ? 'disabled' : ''}>
          New offers ${coinHTML(market.rerollCost)}
        </button>
        ${reshuffles ? `<button class="btn btn-quiet" id="btnMarketReshuffle" title="Spend a banked reshuffle for a free re-roll">
          ↻ Reshuffle · ${reshuffles} left
        </button>` : ''}
        <button class="btn btn-quiet" id="btnOpenCollection">Your collection</button>
        <div class="market-spacer"></div>
        <button class="btn btn-print" id="btnMarketContinue">Next page ❧</button>
      </div>
    </div>`;
}

// ─── Stall view ───────────────────────────────────────────────────────────────

const tileName = t => `“${t.letter}${t.letterType === 'dual' ? '/' + t.altLetter : ''}”`;

function marketStallHTML() {
  const stall = stallById(market.activeStall);
  const def = STALL_DEFS[market.activeStall];
  if (!stall || !def) return marketShopHTML();

  const painterColours = market.activeStall === 'painter' ? `
    <div class="painter-colours">
      ${Object.keys(COLOURS).map(c => `
        <button class="paint-swatch paint-swatch--${c}" data-stall-colour="${c}"
                title="${COLOURS[c].label} — ${colourDesc(c)}"></button>`).join('')}
    </div>` : '';

  const body = market.activeStall === 'gilder'
    ? `<div class="offer-tiles gilder-grid" id="stallGilderGrid"></div>`
    : `${painterColours}<div class="mini-grid mini-grid--case" id="stallGrid"></div>`;

  const note = market.activeStall === 'smelter' && state.collection.length <= SMELT_MIN_COLLECTION
    ? `<p class="sheet-note stall-warn">Your collection is too small to smelt further.</p>`
    : '';

  return `
    <div class="sheet sheet--market sheet--stall awning--${market.activeStall}">
      <div class="sheet-head">
        <div>
          <h2 class="market-title">${def.emoji} ${def.name}</h2>
          <p class="sheet-note">${def.desc}</p>
        </div>
        <div class="market-purse"><span class="coin coin--lg"></span><b id="marketCoins">${state.coins}</b></div>
      </div>
      ${note}
      ${body}
      <div class="market-foot">
        <button class="btn btn-quiet" id="btnStallBack">← Back to the market</button>
        <div class="market-spacer"></div>
        <button class="btn ${market.activeStall === 'smelter' ? 'btn-danger' : 'btn-print'}" id="btnStallConfirm" disabled></button>
      </div>
    </div>`;
}

// Fill the stall's grid — collection minis for most stalls, full-size trim
// previews for the gilder — after the sheet HTML has landed.
function renderStallBody() {
  const stall = stallById(market.activeStall);
  if (!stall) return;

  if (market.activeStall === 'gilder') {
    const grid = $('stallGilderGrid');
    if (!grid) return;
    grid.innerHTML = '';
    const proposals = stall.proposals ?? [];
    if (!proposals.length) {
      grid.innerHTML = '<p class="sheet-note">Nothing to propose — every tile you own already wears a trim.</p>';
      return;
    }
    proposals.forEach((p, i) => {
      const tmpl = state.collection.find(t => t.tid === p.tid);
      if (!tmpl) return;
      const card = document.createElement('div');
      card.className = 'offer-tile pickable';
      card.dataset.gilderIdx = i;
      card.innerHTML = `<span class="pick-mark">✓</span>`;
      const slot = document.createElement('div');
      slot.className = 'offer-tile-slot';
      slot.appendChild(makeTileEl({ ...tmpl, trim: p.trim, id: '' }, 'gild'));
      card.prepend(slot);
      grid.appendChild(card);
    });
    return;
  }

  const grid = $('stallGrid');
  if (!grid) return;
  grid.innerHTML = '';
  state.collection.forEach(tmpl => {
    const el = makeTileEl({ ...tmpl, id: '' }, 'stall', { mini: true });
    el.dataset.stallTid = tmpl.tid;
    if (market.activeStall === 'restorer' && !restorable(tmpl)) {
      el.classList.add('tile--stall-locked');
    }
    grid.appendChild(el);
  });
}

// Selection, colour choice, and the confirm button — patched in place so a
// tap never rebuilds the sheet under your thumb.
export function updateStallState() {
  const m = $('marketModal');
  if (!m || market.view !== 'stall') return;
  const stall = stallById(market.activeStall);
  if (!stall) return;
  const price = stallPrice(stall);

  for (const el of m.querySelectorAll('[data-stall-tid]')) {
    el.classList.toggle('tile--stall-sel', Number(el.dataset.stallTid) === market.stallSel);
  }
  for (const el of m.querySelectorAll('[data-gilder-idx]')) {
    el.classList.toggle('picked', Number(el.dataset.gilderIdx) === market.stallSel);
  }
  for (const el of m.querySelectorAll('[data-stall-colour]')) {
    el.classList.toggle('paint-swatch--sel', el.dataset.stallColour === market.stallColour);
  }

  const btn = m.querySelector('#btnStallConfirm');
  if (!btn) return;

  const sel = market.stallSel >= 0 && market.activeStall !== 'gilder'
    ? state.collection.find(t => t.tid === market.stallSel) : null;
  const priceTag = `for ${price} Coin${price === 1 ? '' : 's'}`;
  let label = '', ready = false;

  switch (market.activeStall) {
    case 'smelter':
      label = sel ? `Smelt ${tileName(sel)} ${priceTag}` : 'Select a tile to smelt';
      ready = !!sel && state.collection.length > SMELT_MIN_COLLECTION;
      break;
    case 'painter':
      label = sel && market.stallColour
        ? `Paint ${tileName(sel)} ${COLOURS[market.stallColour].label} ${priceTag}`
        : 'Select a tile and a colour';
      ready = !!sel && !!market.stallColour;
      break;
    case 'stereotyper':
      label = sel ? `Cast a copy of ${tileName(sel)} ${priceTag}` : 'Select a tile to duplicate';
      ready = !!sel;
      break;
    case 'restorer':
      label = sel ? `Restore ${tileName(sel)} ${priceTag}` : 'Select a tile to strip bare';
      ready = !!sel && restorable(sel);
      break;
    case 'gilder': {
      const p = stall.proposals?.[market.stallSel];
      const tmpl = p && state.collection.find(t => t.tid === p.tid);
      label = tmpl
        ? `Commission the ${TRIMS[p.trim].label} trim on ${tileName(tmpl)} ${priceTag}`
        : 'Choose a proposal';
      ready = !!tmpl;
      break;
    }
  }
  btn.textContent = label;
  btn.disabled = !ready || state.coins < price;
}

// ─── Collection view (read-only) ──────────────────────────────────────────────

function marketCollectionHTML() {
  return `
    <div class="sheet sheet--market">
      <div class="sheet-head">
        <div>
          <h2 class="market-title">Your collection</h2>
          <p class="sheet-note">${state.collection.length} tiles — the whole collection shuffles into the bag each page.</p>
        </div>
      </div>
      <div class="mini-grid mini-grid--case" id="collectionGrid"></div>
      <div class="market-foot">
        <button class="btn btn-quiet" id="btnCollectionBack">← Back to the market</button>
        <div class="market-spacer"></div>
      </div>
    </div>`;
}

function renderCollectionGrid() {
  const grid = $('collectionGrid');
  if (!grid) return;
  grid.innerHTML = '';
  state.collection.forEach(tmpl => {
    const el = makeTileEl({ ...tmpl, id: '' }, 'collection', { mini: true });
    el.dataset.tid = tmpl.tid;
    grid.appendChild(el);
  });
}

// ─── The Colophon (end-of-chapter permanent upgrade) ──────────────────────────

export function renderColophon() {
  const m = $('colophonModal');
  if (!m) return;
  if (!colophon.open) { m.classList.remove('show'); m.innerHTML = ''; return; }

  const reshuffles = state.sundries.filter(s => s.kind === 'reshuffle').length;

  const cards = colophon.offers.map(id => {
    const def = upgradeById(id);
    const swatch = def.kind === 'paint'
      ? `<span class="paint-pot paint-pot--${def.colour}"></span>`
      : `<span class="colophon-icon">${def.emoji}</span>`;
    return `
      <button class="colophon-card colophon-card--${def.kind}${def.kind === 'paint' ? ' colophon-card--' + def.colour : ''}" data-colophon="${id}">
        ${swatch}
        <div class="colophon-card-name">${def.name}</div>
        <div class="colophon-card-desc">${def.desc}</div>
      </button>`;
  }).join('') || '<p class="sheet-note">Every upgrade is already taken to its limit — straight on to the next chapter.</p>';

  m.innerHTML = `
    <div class="sheet sheet--market sheet--colophon">
      <div class="sheet-head">
        <div>
          <h2 class="market-title">The Colophon</h2>
          <p class="sheet-note">Chapter ${roman(state.chapter)} is set. Choose one permanent upgrade before Chapter ${roman(state.chapter + 1)} begins.</p>
        </div>
      </div>
      <div class="colophon-grid">${cards}</div>
      ${colophon.offers.length ? `
        <div class="market-foot">
          <button class="btn btn-quiet" id="btnColophonSkip" title="Decline all three">
            Skip · +${coinHTML(SKIP_COIN_GRANT)}
          </button>
          ${reshuffles ? `<button class="btn btn-quiet" id="btnColophonReshuffle" title="Spend a banked reshuffle for a free re-roll">
            ↻ Reshuffle · ${reshuffles} left
          </button>` : ''}
          <div class="market-spacer"></div>
        </div>` : ''}
    </div>`;
  m.classList.add('show');
}

// ─── Opening draft ────────────────────────────────────────────────────────────

export function renderDraft() {
  const m = $('draftModal');
  if (!m) return;
  if (!draft.open) { m.classList.remove('show'); m.innerHTML = ''; return; }

  const patronCards = draft.patrons.map((id, i) => {
    const def = patronById(id);
    return `
      <div class="offer-patron offer-patron--${def.rarity} pickable" data-draft="patron" data-idx="${i}">
        <div class="op-portrait">${def.portrait
          ? `<img src="${def.portrait}" alt="${def.name}">`
          : `<span class="op-emoji">${def.emoji}</span>`}</div>
        <div class="op-card-body">
          <div class="op-name">${def.name}</div>
          <div class="op-title">${def.rarity}</div>
          <div class="op-desc">${def.desc}</div>
        </div>
        <span class="pick-mark">✓</span>
      </div>`;
  }).join('');

  const paintCards = draft.paints.map((colour, i) => `
    <div class="offer-paint pickable" data-draft="paint" data-idx="${i}"
         data-tip-head="${COLOURS[colour].label} paint"
         data-tip-body="${colourDesc(colour)} A pot paints ${PAINT_PER_POT} random unpainted letters in your collection.">
      <span class="paint-pot paint-pot--${colour}"></span>
      <div class="op-body">
        <div class="op-name">${COLOURS[colour].label}</div>
      </div>
      <span class="pick-mark">✓</span>
    </div>`).join('');

  const tileCards = draft.tiles.map((t, i) => `
    <div class="offer-tile pickable" data-draft="tile" data-idx="${i}">
      <div class="offer-tile-slot" data-draft-tile="${i}"></div>
      <span class="pick-mark">✓</span>
    </div>`).join('');

  m.innerHTML = `
    <div class="sheet sheet--draft">
      <div class="sheet-head">
        <div>
          <h2>Set up the press</h2>
          <p class="sheet-note">Free picks before the first page — take as many or as few as you like.</p>
        </div>
      </div>

      <h3 class="market-sec">Patron <span class="market-sub" data-count="patron"></span></h3>
      <div class="offer-list">${patronCards}</div>

      <h3 class="market-sec">Paint <span class="market-sub" data-count="paint"></span></h3>
      <div class="draft-paints">${paintCards}</div>

      <h3 class="market-sec">Tiles <span class="market-sub" data-count="tile"></span></h3>
      <div class="offer-tiles offer-tiles--draft">${tileCards}</div>

      <div class="market-foot">
        <div class="market-spacer"></div>
        <button class="btn btn-print btn-big" id="btnDraftBegin">Begin the run ❧</button>
      </div>
    </div>`;
  m.classList.add('show');

  draft.tiles.forEach((t, i) => {
    const slot = m.querySelector(`[data-draft-tile="${i}"]`);
    if (slot) slot.appendChild(makeTileEl({ ...t, id: '' }, 'draft'));
  });

  updateDraftSelection();
}

// Patch picked/locked state in place — no reflow of the whole sheet, so the
// page doesn't scroll out from under your thumb.
export function updateDraftSelection() {
  const m = $('draftModal');
  if (!m || !draft.open) return;

  for (const el of m.querySelectorAll('[data-draft]')) {
    const kind = el.dataset.draft;
    const idx  = Number(el.dataset.idx);
    const picked = draft.picked[kind].includes(idx);
    const full   = draft.picked[kind].length >= draftLimit(kind);
    el.classList.toggle('picked', picked);
    el.classList.toggle('pick-locked', !picked && full);
  }

  for (const el of m.querySelectorAll('[data-count]')) {
    const kind = el.dataset.count;
    const n = draft.picked[kind].length, max = draftLimit(kind);
    el.textContent = n === max ? `${max} of ${max} ✓` : `${n} of ${max}`;
    el.classList.toggle('market-sub--done', n === max);
  }
}

// ─── Click handling ───────────────────────────────────────────────────────────
// Game flow (what happens after "Next page", a Colophon pick, or "Begin the
// run") is main.js's business — injected here so the sheets never need to
// know about pages and chapters.

let flow = { nextPage: () => {}, advancePage: async () => {}, beginRun: () => {} };

// A bought thing flies out of the market to wherever it now lives — the
// clones ride the #fx layer, which sits above the modal.
function flyPurchase(fromEl, toEl, opts = {}) {
  if (!fromEl || !toEl) return;
  flyClone(fromEl, rect(fromEl), rect(toEl), { duration: ANIM.fly, scaleTo: 0.3, fade: true, ...opts });
}

function onMarketClick(e) {
  const buyP = e.target.closest('[data-buy-patron]');
  if (buyP) {
    const card = buyP.closest('[data-offer]');
    const r = buyPatron(buyP.dataset.buyPatron);
    if (!r.ok) { log(r.reason, 'warn'); sfx.bad(); }
    else {
      sfx.coin(); log(`${r.def.name} takes a seat at your table.`, 'good');
      flyPurchase(card, $('shelf'), { scaleTo: 0.2 });
    }
    renderAll(); updateMarketState();
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
    renderAll(); updateMarketState();
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
    renderAll(); updateMarketState();
    return;
  }
  if (e.target.closest('#btnReroll')) {
    if (rerollMarket()) { sfx.draw(); renderAll(); renderMarket(); }
    return;
  }
  if (e.target.closest('#btnMarketReshuffle')) {
    if (spendReshuffleSundry()) { freeRerollMarket(); sfx.draw(); renderAll(); renderMarket(); }
    return;
  }

  // ── Stalls ──────────────────────────────────────────────────────────────────
  const visit = e.target.closest('[data-visit-stall]');
  if (visit) {
    market.view = 'stall';
    market.activeStall = visit.dataset.visitStall;
    market.stallSel = -1;
    market.stallColour = null;
    renderMarket();
    return;
  }
  if (e.target.closest('#btnStallBack')) {
    market.view = 'shop'; market.activeStall = null; market.returning = true; renderMarket();
    return;
  }
  const stallTile = e.target.closest('[data-stall-tid]');
  if (stallTile && !stallTile.classList.contains('tile--stall-locked')) {
    const tid = Number(stallTile.dataset.stallTid);
    market.stallSel = market.stallSel === tid ? -1 : tid;
    updateStallState();
    return;
  }
  const gilderCard = e.target.closest('[data-gilder-idx]');
  if (gilderCard) {
    const idx = Number(gilderCard.dataset.gilderIdx);
    market.stallSel = market.stallSel === idx ? -1 : idx;
    updateStallState();
    return;
  }
  const swatch = e.target.closest('[data-stall-colour]');
  if (swatch) {
    market.stallColour = swatch.dataset.stallColour;
    updateStallState();
    return;
  }
  if (e.target.closest('#btnStallConfirm')) {
    let r, msg;
    switch (market.activeStall) {
      case 'smelter':
        r = stallSmelt(market.stallSel);
        if (r.ok) msg = `The Smelter feeds a “${r.removed.letter}” tile to the furnace.`;
        break;
      case 'painter':
        r = stallPaint(market.stallSel, market.stallColour);
        if (r.ok) msg = `The Painter coats “${r.tmpl.letter}” in ${COLOURS[r.colour].label.toLowerCase()}.`;
        break;
      case 'gilder':
        r = stallGild(market.stallSel);
        if (r.ok) msg = `The Gilder lays a ${TRIMS[r.trim].label} trim on “${r.tmpl.letter}”.`;
        break;
      case 'stereotyper':
        r = stallClone(market.stallSel);
        if (r.ok) msg = `The Stereotyper casts a perfect copy of “${r.tmpl.letter}”.`;
        break;
      case 'restorer':
        r = stallRestore(market.stallSel);
        if (r.ok) msg = `The Restorer strips “${r.tmpl.letter}” back to bare metal.`;
        break;
      default:
        r = { ok: false };
    }
    if (!r.ok) { if (r.reason) log(r.reason, 'warn'); sfx.bad(); }
    else {
      if (market.activeStall === 'smelter') sfx.discard(); else sfx.coin();
      log(msg, 'good');
    }
    renderAll(); renderMarket();   // full rebuild: the price and grid both changed
    return;
  }

  // ── Collection (read-only) ──────────────────────────────────────────────────
  if (e.target.closest('#btnOpenCollection')) {
    market.view = 'collection'; renderMarket();
    return;
  }
  if (e.target.closest('#btnCollectionBack')) {
    market.view = 'shop'; market.returning = true; renderMarket();
    return;
  }
  if (e.target.closest('#btnMarketContinue')) flow.nextPage();
}

// ─── Colophon actions ─────────────────────────────────────────────────────────

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
  await flow.advancePage();
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
  await flow.advancePage();
}

function useColophonReshuffle() {
  if (!spendReshuffleSundry()) return;
  reshuffleColophon();
  sfx.draw();
  renderAll();
  renderColophon();
}

function onColophonClick(e) {
  const pickEl = e.target.closest('[data-colophon]');
  if (pickEl) { pickColophon(pickEl.dataset.colophon); return; }
  if (e.target.closest('#btnColophonSkip')) { skipColophon(); return; }
  if (e.target.closest('#btnColophonReshuffle')) useColophonReshuffle();
}

// ─── Draft actions ────────────────────────────────────────────────────────────

function onDraftClick(e) {
  const pickEl = e.target.closest('[data-draft]');
  if (pickEl) {
    if (toggleDraftPick(pickEl.dataset.draft, Number(pickEl.dataset.idx))) sfx.draw();
    else sfx.bad();
    updateDraftSelection();   // in place — never rebuilds the sheet
    persist();
    return;
  }
  if (e.target.closest('#btnDraftBegin')) flow.beginRun();
}

// ─── Wiring ───────────────────────────────────────────────────────────────────

export function initSheets(flowCallbacks) {
  flow = { ...flow, ...flowCallbacks };
  $('marketModal')?.addEventListener('click', onMarketClick);
  $('colophonModal')?.addEventListener('click', onColophonClick);
  $('draftModal')?.addEventListener('click', onDraftClick);
}
