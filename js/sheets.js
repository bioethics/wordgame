// The full-screen sheets: the Market (and its stalls and collection view),
// the Colophon, and the opening draft — their HTML and their click handling,
// in one place. Board-side rendering lives in render.js; game flow stays in
// main.js and is injected via initSheets().

import {
  state, owns, effectivePatronSlots, effectiveSundrySlots, spendReshuffleSundry,
  takePaintEchoes, takeGhostEchoes,
} from './state.js';
import {
  TRIMS, NICKS, COLOURS, STALL_DEFS, SMELT_MIN_COLLECTION, SKIP_COIN_GRANT,
  PAINT_PER_POT, ANIM, SUNDRY_SELL, tileCount, sundryTip, TOOL_LOOK,
  colourDesc, HONORIFIC_STEP, POSTNOM,
} from './constants.js';
import { patronById, guildsOf, patronName, patronShelf, patronCost } from './patrons.js';
import { upgradeById } from './upgrades.js';
import {
  market, stallById, stallPrice, isProposalStall,
  offerPrice, compostLeft, takeCompost,
  buyPatron, buyTile, buySundry, sellPatron, sellSundry, patronRefund,
  rerollMarket, freeRerollMarket,
  stallSmelt, stallCommission, stallClone,
} from './market.js';
import {
  colophon, closeColophon, applyColophonPick, applyColophonSkip, reshuffleColophon,
} from './colophon.js';
import { draft, draftLimit, toggleDraftPick } from './draft.js';
import {
  makeTileEl, coinHTML, log, renderAll, persist, showPatronPopover, openGhosts,
} from './render.js';
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
    (state.compost ?? []).forEach((t, i) => {
      const slot = m.querySelector(`[data-compost-tile="${i}"]`);
      if (slot && !slot.children.length) slot.appendChild(makeTileEl({ ...t, id: '' }, 'offer'));
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
    // The heap isn't bought, so it prices and sells out on its own terms.
    if (kind === 'compost') {
      const btn = card.querySelector('.btn-price');
      if (btn) btn.disabled = !compostLeft();
      continue;
    }
    const offer = kind === 'patron' ? market.patronOffers[idx]
                : kind === 'tile'   ? market.tileOffers[idx]
                :                     market.sundryOffers[idx];
    if (!offer) continue;
    const cost = kind === 'patron' ? patronCost(patronById(offer.id), offer.data)
               : kind === 'tile'   ? offerPrice(offer)
               :                     offer.price;
    const afford = state.coins >= cost
      && (kind !== 'patron' || !seatsFull)
      && (kind !== 'sundry' || !benchFull);
    card.classList.toggle('offer--sold', !!offer.sold);
    const btn = card.querySelector('.btn-price');
    if (btn) btn.disabled = offer.sold || !afford;
  }

  const seats = m.querySelector('[data-seats]');
  if (seats) seats.textContent = seatsLabel();
  const bench = m.querySelector('[data-bench]');
  if (bench) bench.textContent = benchLabel();
  const benchN = m.querySelector('[data-bench-count]');
  if (benchN) benchN.textContent = benchCount();

  // The shelf strip redraws in place, so a hire appears seated the moment the
  // coin is paid — without rebuilding the sheet under your scroll position.
  const strip = m.querySelector('[data-market-shelf]');
  if (strip) {
    strip.style.setProperty('--seat-count', effectivePatronSlots());
    strip.innerHTML = marketShelfCardsHTML();
  }
  // The workbench redraws in place for the same reason: a tool bought or sold
  // back should appear on the bench without the sheet jumping under you.
  const benchStrip = m.querySelector('[data-market-bench]');
  if (benchStrip) {
    benchStrip.style.setProperty('--slot-count', effectiveSundrySlots());
    benchStrip.innerHTML = marketBenchSlotsHTML();
  }
  // A full table (or bench) makes letting something go the only way forward,
  // so the tally stops being a footnote.
  m.querySelector('[data-market-shelf-wrap]')?.classList.toggle('market-shelf--wanted', seatsFull);
  m.querySelector('[data-market-bench-wrap]')?.classList.toggle('market-shelf--wanted', benchFull);

  const reroll = m.querySelector('#btnReroll');
  if (reroll) reroll.disabled = !(state.freeRerolls > 0) && state.coins < market.rerollCost;
}

function rewardHTML() {
  if (!market.rewardParts?.length) return '';
  const rows = market.rewardParts
    .map(p => `<span class="reward-part">${p.label} <b>+${p.coins}</b></span>`).join('');
  return `<div class="reward-line">${rows}<span class="reward-total">${coinHTML(market.rewardTotal)} earned</span></div>`;
}

// The seat and bench tallies are written in two places — on a fresh sheet and
// on every in-place patch — so they read from one function and can't drift.
// When there's no room left, the tally says what to do about it.
const seatsLabel = () => {
  const max = effectivePatronSlots();
  return `${state.patrons.length}/${max} seated${state.patrons.length >= max ? ' — dismiss one to make room' : ''}`;
};
const benchLabel = () => {
  const max = effectiveSundrySlots();
  return `${state.sundries.length}/${max} on the workbench${state.sundries.length >= max ? ' — sell one to make room' : ''}`;
};
// The bench's own heading sits in a column barely wider than its slots, so it
// gets the short form; the long one belongs to the Sundries shop column.
const benchCount = () => {
  const max = effectiveSundrySlots();
  return `${state.sundries.length}/${max}${state.sundries.length >= max ? ' — full' : ''}`;
};

// ─── The table, restated inside the Market ────────────────────────────────────
// The board's patron shelf, drawn again at the top of the sheet so who you
// hold is never out of sight while you shop. Same cards as the board: the ✕
// dismisses outright (desktop hover), tapping a card shows its calling card
// with a dismissal button — the popover route main.js already wires — and
// dragging one along the strip reseats it (initShelfDrag in drag.js takes this
// shelf as well as the board's). The Market is where that decision belongs:
// you have just hired someone, and seat order is half of what you bought.
function marketShelfCardsHTML() {
  const seats = effectivePatronSlots();
  let cards = '';
  for (let i = 0; i < seats; i++) {
    const p = state.patrons[i];
    if (!p) {
      cards += `<div class="patron patron--empty" title="An empty seat at your table"><span class="patron-empty-mark">❧</span></div>`;
      continue;
    }
    const def = patronById(p.id);
    const name  = patronName(def, p.data);
    const label = patronShelf(def, p.data);
    const desc  = def.instDesc?.(p.data)  ?? def.desc;
    const half  = patronRefund(p);
    const [livery, livery2] = guildsOf(def);
    const lettered = p.data?.postnom ? ' patron--postnom' : '';
    const laurels = p.data?.honorifics ?? 0;
    cards += `
      <div class="patron patron--${def.rarity}${livery ? ` patron--g-${livery}` : ''}${livery2 ? ` patron--g2-${livery2}` : ''}${lettered}"
           data-patron="${def.id}"${p.uid != null ? ` data-uid="${p.uid}"` : ''}
           title="${name} — ${desc}
(drag to reseat · ✕ dismisses for ${half} Coins)">
        <span class="patron-emoji">${def.emoji}</span>
        <span class="patron-name">${label}</span>
        ${laurels ? `<span class="patron-laurel" title="${laurels > 1 ? `${laurels} laurels` : 'A laurel'} — +${laurels * HONORIFIC_STEP} Points every word, paid at this seat's turn">🏵️${laurels > 1 ? `<b>${laurels}</b>` : ''}</span>` : ''}
        <button class="patron-x" data-sell-patron="${p.uid ?? def.id}" title="Dismiss ${name} for ${half} Coins">✕</button>
      </div>`;
  }
  return cards;
}

// ─── The workbench, restated inside the Market ────────────────────────────────
// The board's bench, drawn again under the shelf for the same reason the shelf
// is: what you hold decides what is worth buying, and the modal covers the
// board. The slots are the board's slots — same wood, same faces, same order —
// but nothing is armed from here (a tube has no hand to paint), so they are
// plain cards rather than buttons. The ✕ on each is the Market's price for
// taking one back: SUNDRY_SELL, a pittance, because what you are really buying
// is the empty slot.
function benchSlotHTML(s, i) {
  if (!s) {
    return `<div class="sundry sundry--empty" title="Room for a sundry — sold here">
      <span class="sundry-empty-mark">✒</span></div>`;
  }
  const tip = sundryTip(s) ?? { head: 'Sundry', body: '' };
  const look =
    s.kind === 'tube'      ? { cls: `sundry--${s.colour}`, mark: `<span class="paint-tube paint-tube--${s.colour}"></span>`, name: COLOURS[s.colour].label }
  : s.kind === 'reshuffle' ? { cls: 'sundry--reshuffle', mark: '<span class="sundry-shuffle">↻</span>', name: 'Reshuffle' }
  : s.kind === 'ratchet'   ? { cls: 'sundry--ratchet', mark: '<span class="ratchet-mark">⇅</span>', name: 'Ratchet' }
  : s.kind === 'wrapped'   ? { cls: 'sundry--wrapped', mark: '<span class="wrapped-mark"></span>', name: 'Wrapped' }
  : TOOL_LOOK[s.kind]      ? { cls: `sundry--tool sundry--${s.kind}`, mark: `<span class="sundry-glyph">${TOOL_LOOK[s.kind].glyph}</span>`, name: TOOL_LOOK[s.kind].label }
  :                          { cls: '', mark: '', name: tip.head };
  return `
    <div class="sundry sundry--card ${look.cls}" data-bench-slot="${i}"
         data-tip-head="${tip.head}" data-tip-body="${tip.body} The ✕ sells it back for ${SUNDRY_SELL} Coin."
         title="${tip.head} — ${tip.body}">
      ${look.mark}
      <span class="sundry-name">${look.name}</span>
      <span class="sundry-x" role="button" tabindex="0" data-sell-sundry="${i}"
            aria-label="Sell the ${look.name.toLowerCase()} back for ${SUNDRY_SELL} Coin"
            title="Sell it back for ${SUNDRY_SELL} Coin">✕</span>
    </div>`;
}

function marketBenchSlotsHTML() {
  const slots = effectiveSundrySlots();
  let out = '';
  for (let i = 0; i < slots; i++) out += benchSlotHTML(state.sundries?.[i], i);
  return out;
}

function marketBenchHTML() {
  const full = state.sundries.length >= effectiveSundrySlots();
  return `
    <section class="market-bench${full ? ' market-shelf--wanted' : ''}" data-market-bench-wrap>
      <h3 class="market-sec">Workbench <span class="market-sub" data-bench-count>${benchCount()}</span></h3>
      <div class="sundries sundries--market" data-market-bench
           style="--slot-count:${effectiveSundrySlots()}">${marketBenchSlotsHTML()}</div>
    </section>`;
}

// The board's graveyard door, restated in the Market for the same reason the
// shelf and the bench are: the board is under the modal, and what your ghosts
// are doing is exactly the sort of thing you want to know while deciding who
// to hire. Same button, same sheet — the sheet is a modal at the body level,
// so it opens over the Market without either knowing about the other.
const marketGhostDoorHTML = () => {
  const n = state.ghosts?.length ?? 0;
  if (!n) return '';
  return `<button class="market-ghosts" data-open-ghosts>
    <span class="ghost-btn-mark">👻</span>${n} ghost${n > 1 ? 's' : ''}</button>`;
};

function marketShelfHTML() {
  const fullSeats = state.patrons.length >= effectivePatronSlots();
  return `
    <section class="market-shelf${fullSeats ? ' market-shelf--wanted' : ''}" data-market-shelf-wrap>
      <h3 class="market-sec">Your table <span class="market-sub" data-seats>${seatsLabel()}</span><span class="market-sub market-sub--hint">drag a card to change the running order</span>${marketGhostDoorHTML()}</h3>
      <div class="shelf shelf--market" data-market-shelf style="--seat-count:${effectivePatronSlots()}">${marketShelfCardsHTML()}</div>
    </section>`;
}

function marketShopHTML() {
  const patronCards = market.patronOffers.map((o, i) => {
    const def = patronById(o.id);
    // A stackable patron's card shows the exact copy on offer — its rolled
    // letters and its number — so buying one is a choice, not a lottery.
    const name = patronName(def, o.data);
    const desc = def.instDesc?.(o.data) ?? def.desc;
    // A guild member's card wears its livery: a ribbon bound into the top
    // edge, the portrait washed in the guild colour, and the guild named on
    // the title line. Neutral cards stay plain ivory; a dual-livery card
    // (the Cellarer, the Composter) binds a second ribbon beside the first
    // and names both guilds.
    const liveries = guildsOf(def);
    const livery = (liveries.length ? ` offer-patron--g-${liveries[0]}` : '')
                 + (liveries[1] ? ` offer-patron--g2-${liveries[1]}` : '');
    // A distinguished patron's card is struck differently — foiled edge, its
    // letters called out on the title line — because the ×Mult it carries is
    // not in the desc and would otherwise be invisible until it was bought.
    const lettered = o.data?.postnom ? ' offer-patron--postnom' : '';
    return `
      <div class="offer-patron offer-patron--${def.rarity}${livery}${lettered}" data-offer="patron" data-idx="${i}">
        <div class="op-portrait">${def.portrait
          ? `<img src="${def.portrait}" alt="${name}">`
          : `<span class="op-emoji">${def.emoji}</span>`}</div>
        <div class="op-card-body">
          <div class="op-name">${name}</div>
          <div class="op-title">${def.rarity}${liveries.length ? ` · <span class="op-guild">${liveries.join(' & ')}</span>` : ''}${
            o.data?.postnom ? ` · <span class="op-postnom">${o.data.postnom} · ×${POSTNOM.mult} Mult</span>` : ''}</div>
          <div class="op-desc">${desc}</div>
        </div>
        <span class="op-sold">seated</span>
        <button class="btn-price" data-buy-patron="${def.id}">${
          patronCost(def, o.data) === 0 ? 'Free' : coinHTML(patronCost(def, o.data))}</button>
      </div>`;
  }).join('') || '<p class="sheet-note">No patrons calling today.</p>';

  // Nothing is summarised under the tile — hover or long-press it.
  const tileCards = market.tileOffers.map((o, i) => {
    const price = offerPrice(o);
    return `
      <div class="offer-tile${price === 0 ? ' offer-tile--free' : ''}" data-offer="tile" data-idx="${i}">
        <div class="offer-tile-slot" data-offer-tile="${i}"></div>
        <span class="op-sold">bought</span>
        <button class="btn-price" data-buy-tile="${i}">${price === 0 ? 'Free' : coinHTML(price)}</button>
      </div>`;
  }).join('');

  // The compost heap — only while someone is tending it.
  const heap = owns('composter') ? (state.compost ?? []) : [];
  const heapCards = heap.map((t, i) => `
      <div class="offer-tile offer-compost" data-offer="compost" data-idx="${i}">
        <div class="offer-tile-slot" data-compost-tile="${i}"></div>
        <button class="btn-price" data-take-compost="${i}"
                ${compostLeft() ? '' : 'disabled'}>Take</button>
      </div>`).join('');

  // Every sundry card explains itself from one place (constants.js → sundryTip),
  // so the shop, the workbench and the held row below can't tell you three
  // different things about the same object.
  const sundryCards = market.sundryOffers.map((o, i) => {
    const tip  = sundryTip(o);
    const mark = o.kind === 'wrapped'   ? '<span class="wrapped-mark wrapped-mark--offer"></span>'
               : o.kind === 'ratchet'   ? '<span class="ratchet-mark">⇅</span>'
               : o.kind === 'reshuffle' ? '<span class="sundry-shuffle sundry-shuffle--offer">↻</span>'
               : TOOL_LOOK[o.kind]      ? `<span class="sundry-glyph sundry-glyph--offer">${TOOL_LOOK[o.kind].glyph}</span>`
               :                          `<span class="paint-tube paint-tube--${o.colour}"></span>`;
    const extra = o.kind === 'wrapped' ? ' offer-wrapped' : o.kind === 'ratchet' ? ' offer-ratchet'
                : TOOL_LOOK[o.kind] ? ' offer-tool'
                : o.kind === 'tube' ? ` offer-paint--${o.colour}` : '';
    return `
      <div class="offer-paint${extra}" data-offer="sundry" data-idx="${i}"
           data-tip-head="${tip.head}" data-tip-body="${tip.body}">
        ${mark}
        <div class="op-body">
          <div class="op-name">${tip.head}</div>
        </div>
        <span class="op-sold">bought</span>
        <button class="btn-price" data-buy-sundry="${i}">${coinHTML(o.price)}</button>
      </div>`;
  }).join('');

  const stallCards = market.stalls.map(s => {
    const def = STALL_DEFS[s.id];
    return `
      <div class="offer-stall awning--${s.id}" data-stall-card="${s.id}">
        <span class="stall-emoji">${def.emoji}</span>
        <div class="op-body">
          <div class="op-name">${def.name}</div>
          <div class="op-desc">${def.desc}</div>
        </div>
        <div class="stall-action">
          <button class="btn-price btn-visit" data-visit-stall="${s.id}">Visit</button>
          <div class="stall-from">work from ${coinHTML(stallPrice(s))}</div>
        </div>
      </div>`;
  }).join('');

  // What you already hold isn't listed here any more: it sits on the workbench
  // at the top of the sheet, where the ✕ on each slot sells it back.
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

      <div class="market-hold">
        ${marketShelfHTML()}
        ${marketBenchHTML()}
      </div>

      <div class="market-grid">
        <section class="market-col">
          <h3 class="market-sec">Patrons <span class="market-sub">calling today</span></h3>
          <div class="offer-list">${patronCards}</div>
        </section>
        <section class="market-col">
          <h3 class="market-sec">Tiles</h3>
          <div class="offer-tiles">${tileCards}</div>
          <h3 class="market-sec market-sec--paint">Sundries <span class="market-sub" data-bench>${benchLabel()}</span></h3>
          <div class="offer-list">${sundryCards}</div>
        </section>
      </div>

      ${owns('composter') ? `
      <section class="market-compost">
        <h3 class="market-sec">The compost heap <span class="market-sub">${
          heap.length
            ? compostLeft()
              ? `take ${compostLeft()} — the rest rots on`
              : 'nothing more this visit'
            : 'nothing has rotted down yet'
        }</span></h3>
        ${heap.length ? `<div class="offer-tiles offer-tiles--compost">${heapCards}</div>` : ''}
      </section>` : ''}

      <section class="market-stalls">
        <h3 class="market-sec">Stalls <span class="market-sub">prices double with each purchase</span></h3>
        <div class="stall-row">${stallCards}</div>
      </section>

      <div class="market-foot">
        <button class="btn btn-quiet" id="btnReroll" title="Re-rolls patrons, tiles, sundries and stalls — the fee doubles each time. A stall you've already paid keeps its raised price this visit.${state.freeRerolls > 0 ? ' The Factor is covering the next ' + (state.freeRerolls > 1 ? state.freeRerolls + ' fees' : 'fee') + '.' : ''}"
          ${!(state.freeRerolls > 0) && state.coins < market.rerollCost ? 'disabled' : ''}>
          New offers ${state.freeRerolls > 0 ? `🤝 free · ${state.freeRerolls} left` : coinHTML(market.rerollCost)}
        </button>
        ${reshuffles ? `<button class="btn btn-quiet" id="btnMarketReshuffle" title="A free re-roll">
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

const keyBlock = (defs, swatchClass) => `
  <div class="trim-key">
    ${Object.entries(defs).map(([id, d]) => `
      <span class="trim-key-item">
        <span class="${swatchClass(id)}"></span>
        <b>${d.label}</b> ${d.desc}
      </span>`).join('')}
  </div>`;

function marketStallHTML() {
  const stall = stallById(market.activeStall);
  const def = STALL_DEFS[market.activeStall];
  if (!stall || !def) return marketShopHTML();

  // A proposal shows the tile as it would be, so where the change isn't
  // self-evident the stall carries a key: metals for the Gilder, which way a
  // notch reaches for the Dresser, and what each colour pays for the Painter.
  const colourKey = Object.fromEntries(Object.entries(COLOURS).map(
    ([id, c]) => [id, { label: c.label, desc: colourDesc(id) }]));
  const stallKey =
      market.activeStall === 'gilder'  ? keyBlock(TRIMS, id => `trim-swatch trim-swatch--${id}`)
    : market.activeStall === 'dresser' ? keyBlock(NICKS, id => `nick-swatch nick-swatch--${id}`)
    : market.activeStall === 'painter' ? keyBlock(colourKey, id => `paint-swatch paint-swatch--${id}`)
    : '';

  const body = isProposalStall(market.activeStall)
    ? `${stallKey}<div class="offer-tiles proposal-grid" id="stallProposalGrid"></div>`
    : `<div class="mini-grid mini-grid--case" id="stallGrid"></div>`;

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

// What a proposal looks like once taken — the preview the stall puts on show.
export function proposalPreview(tmpl, p) {
  if (p.altLetter) return { ...tmpl, letterType: 'dual', altLetter: p.altLetter, activeVariant: 0, id: '' };
  if (p.nick)      return { ...tmpl, nick: p.nick, id: '' };
  if (p.colour)    return { ...tmpl, colour: p.colour, id: '' };
  return { ...tmpl, trim: p.trim, id: '' };
}

// Fill the stall's grid — collection minis for most stalls, full-size previews
// of the proposed tile for the Gilder and Punchcutter.
function renderStallBody() {
  const stall = stallById(market.activeStall);
  if (!stall) return;

  if (isProposalStall(market.activeStall)) {
    const grid = $('stallProposalGrid');
    if (!grid) return;
    grid.innerHTML = '';
    const proposals = stall.proposals ?? [];
    if (!proposals.length) {
      grid.innerHTML = `<p class="sheet-note">${STALL_DEFS[market.activeStall]?.empty ?? 'Nothing to propose.'}</p>`;
      return;
    }
    proposals.forEach((p, i) => {
      const tmpl = state.collection.find(t => t.tid === p.tid);
      if (!tmpl) return;
      const card = document.createElement('div');
      card.className = 'offer-tile pickable';
      card.dataset.proposalIdx = i;
      card.innerHTML = `<span class="pick-mark">✓</span>`;
      const slot = document.createElement('div');
      slot.className = 'offer-tile-slot';
      slot.appendChild(makeTileEl(proposalPreview(tmpl, p), 'proposal'));
      card.prepend(slot);
      grid.appendChild(card);
    });
    return;
  }

  const grid = $('stallGrid');
  if (!grid) return;
  grid.innerHTML = '';
  // The Smelter and the Stereotyper work off the whole case; the Painter works
  // off the spread it laid out, the way the proposal stalls do.
  const tiles = stall.offers
    ? stall.offers.map(tid => state.collection.find(t => t.tid === tid)).filter(Boolean)
    : state.collection;
  if (!tiles.length) {
    grid.innerHTML = `<p class="sheet-note">${STALL_DEFS[market.activeStall]?.empty ?? 'Nothing to offer.'}</p>`;
    return;
  }
  tiles.forEach(tmpl => {
    const el = makeTileEl({ ...tmpl, id: '' }, 'stall', { mini: true });
    el.dataset.stallTid = tmpl.tid;
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
  for (const el of m.querySelectorAll('[data-proposal-idx]')) {
    el.classList.toggle('picked', Number(el.dataset.proposalIdx) === market.stallSel);
  }

  const btn = m.querySelector('#btnStallConfirm');
  if (!btn) return;

  // At a proposal stall, stallSel is an index into the spread; elsewhere it's
  // the tid of a collection tile.
  const sel = market.stallSel >= 0 && !isProposalStall(market.activeStall)
    ? state.collection.find(t => t.tid === market.stallSel) : null;
  const priceTag = `for ${price} Coin${price === 1 ? '' : 's'}`;
  let label = '', ready = false;

  switch (market.activeStall) {
    case 'smelter':
      label = sel ? `Smelt ${tileName(sel)} ${priceTag}` : 'Select a tile to smelt';
      ready = !!sel && state.collection.length > SMELT_MIN_COLLECTION;
      break;
    case 'painter': {
      const p = stall.proposals?.[market.stallSel];
      const tmpl = p && state.collection.find(t => t.tid === p.tid);
      label = tmpl
        ? `Paint ${tileName(tmpl)} ${COLOURS[p.colour].label} ${priceTag}`
        : 'Choose a colour';
      ready = !!tmpl;
      break;
    }
    case 'stereotyper':
      label = sel ? `Cast a copy of ${tileName(sel)} ${priceTag}` : 'Select a tile to duplicate';
      ready = !!sel;
      break;
    case 'gilder': {
      const p = stall.proposals?.[market.stallSel];
      const tmpl = p && state.collection.find(t => t.tid === p.tid);
      label = tmpl
        ? `${TRIMS[p.trim].label} on ${tileName(tmpl)} ${priceTag}`
        : 'Choose a trim';
      ready = !!tmpl;
      break;
    }
    case 'punchcutter': {
      const p = stall.proposals?.[market.stallSel];
      const tmpl = p && state.collection.find(t => t.tid === p.tid);
      label = tmpl
        ? `Cut ${p.altLetter} into “${tmpl.letter}” ${priceTag}`
        : 'Choose a letterform';
      ready = !!tmpl;
      break;
    }
    case 'dresser': {
      const p = stall.proposals?.[market.stallSel];
      const tmpl = p && state.collection.find(t => t.tid === p.tid);
      label = tmpl
        ? `${NICKS[p.nick].label} in ${tileName(tmpl)} ${priceTag}`
        : 'Choose a nick';
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
          <p class="sheet-note">${state.collection.length} tiles.</p>
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
  }).join('') || '<p class="sheet-note">Nothing left to offer — on to the next chapter.</p>';

  m.innerHTML = `
    <div class="sheet sheet--market sheet--colophon">
      <div class="sheet-head">
        <div>
          <h2 class="market-title">The Colophon</h2>
          <p class="sheet-note">Choose one permanent upgrade.</p>
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

  const paintCards = draft.paints.map((colour, i) => `
    <div class="offer-paint pickable" data-draft="paint" data-idx="${i}"
         data-tip-head="${COLOURS[colour].label} paint"
         data-tip-body="Paints ${PAINT_PER_POT} unpainted letters ${COLOURS[colour].label}.">
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
          <p class="sheet-note">Free picks — take what you like. Patrons are hired later, at the Market.</p>
        </div>
      </div>

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
      sfx.coin(); log(`${r.name} takes a seat at your table.`, 'good');
      // The card flies to the shelf strip at the top of the sheet — the board
      // shelf is under the modal and can't be seen from here.
      flyPurchase(card, document.querySelector('[data-market-shelf]') ?? $('shelf'), { scaleTo: 0.2 });
    }
    renderAll(); updateMarketState();
    return;
  }
  const takeC = e.target.closest('[data-take-compost]');
  if (takeC) {
    const card = takeC.closest('[data-offer]');
    const r = takeCompost(Number(takeC.dataset.takeCompost));
    if (!r.ok) { log(r.reason, 'warn'); sfx.bad(); }
    else {
      sfx.chime();
      log('Lifted from the heap — it joins the bag next page.', 'good');
      flyPurchase(card?.querySelector('.tile'), $('bagBtn'));
    }
    renderAll(); renderMarket();
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
      // Named from sundryTip so every kind — tube, ratchet, wrapped, toolbox —
      // says the right thing. (COLOURS[colour] only exists for tubes: reading
      // it for a colourless sundry threw, and the purchase froze mid-click.)
      log(r.offer.kind === 'reshuffle'
        ? 'A reshuffle joins your workbench, banked for later.'
        : r.offer.kind === 'tube'
        ? `A tube of ${COLOURS[r.offer.colour].label} joins your workbench.`
        : `${sundryTip(r.offer).head} joins your workbench.`, 'good');
      flyPurchase(card?.querySelector('.paint-tube, .sundry-shuffle, .sundry-glyph, .ratchet-mark, .wrapped-mark'),
        document.querySelector('[data-market-bench]') ?? $('sundries'), { scaleTo: 0.6 });
    }
    renderAll(); updateMarketState();
    return;
  }
  // ── Letting things go ───────────────────────────────────────────────────────
  const sellP = e.target.closest('[data-sell-patron]');
  if (sellP) {
    const r = sellPatron(sellP.dataset.sellPatron);
    if (r.ok) {
      sfx.coin();
      log(`${r.name} departs — ${r.refund} Coin${r.refund === 1 ? '' : 's'} back.`);
      if (r.headsman) log(`🪓 The Headsman approves — ×${r.headsman.mult} Mult now.`);
      renderAll(); renderMarket();
    }
    return;
  }
  const sellS = e.target.closest('[data-sell-sundry]');
  if (sellS) {
    const r = sellSundry(Number(sellS.dataset.sellSundry));
    if (r.ok) {
      sfx.coin();
      log(`Sold back for ${r.refund} Coin.`);
      renderAll(); renderMarket();
    }
    return;
  }
  // A tap on a seated card (not its ✕ — that's data-sell-patron, caught above)
  // shows the patron's calling card, whose Dismiss button main.js handles.
  const seatCard = e.target.closest('[data-market-shelf] .patron[data-patron]');
  if (seatCard) {
    const def = patronById(seatCard.dataset.patron);
    const seat = state.patrons.find(p => String(p.uid) === seatCard.dataset.uid)
              ?? state.patrons.find(p => p.id === seatCard.dataset.patron);
    if (def) showPatronPopover(def, seatCard, seat);
    return;
  }

  if (e.target.closest('[data-open-ghosts]')) { openGhosts(); return; }
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
  const proposalCard = e.target.closest('[data-proposal-idx]');
  if (proposalCard) {
    const idx = Number(proposalCard.dataset.proposalIdx);
    market.stallSel = market.stallSel === idx ? -1 : idx;
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
        r = stallCommission('painter', market.stallSel);
        if (r.ok) msg = `The Painter coats “${r.tmpl.letter}” in ${COLOURS[r.colour].label.toLowerCase()}.`;
        break;
      case 'gilder':
        r = stallCommission('gilder', market.stallSel);
        if (r.ok) msg = `The Gilder lays a ${TRIMS[r.trim].label} trim on “${r.tmpl.letter}”.`;
        break;
      case 'punchcutter':
        r = stallCommission('punchcutter', market.stallSel);
        if (r.ok) msg = `The Punchcutter cuts ${r.altLetter} into “${r.tmpl.letter}”.`;
        break;
      case 'dresser':
        r = stallCommission('dresser', market.stallSel);
        if (r.ok) msg = `The Dresser cuts a ${r.nick} nick into “${r.tmpl.letter}”.`;
        break;
      case 'stereotyper':
        r = stallClone(market.stallSel);
        if (r.ok) msg = `The Stereotyper casts a perfect copy of “${r.tmpl.letter}”.`;
        break;
      default:
        r = { ok: false };
    }
    if (!r.ok) { if (r.reason) log(r.reason, 'warn'); sfx.bad(); }
    else {
      if (market.activeStall === 'smelter') sfx.discard(); else sfx.coin();
      log(msg, 'good');
      // A Painter's coat can splash (The Dabbler, deep in paintTile) and the
      // Smelter's furnace can be stood over (The Revenant, deep in
      // trashFromCollection) — drain both echo queues into the log here,
      // since main.js never sees this action.
      for (const e of takePaintEchoes()) {
        log(`🖍️ The Dabbler splashes ${e.letter} ${COLOURS[e.colour].label.toLowerCase()} as well.`, 'good');
      }
      for (const e of takeGhostEchoes()) {
        log(`💀 The Revenant walks ${e.letter} back out of the hellbox — it will be waiting in the case.`, 'good');
      }
      // Work done, back to the market — the stall card's risen price is the
      // thing to see, and lingering in the stall let it go unnoticed. The
      // Visit button is right there for whoever wants to pay it.
      market.view = 'shop'; market.activeStall = null; market.stallSel = -1;
      market.returning = true;
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
