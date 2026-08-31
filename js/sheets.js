// The full-screen sheets — the Market (with its stalls and collection view), the
// Colophon, and the Testing Chamber: their HTML and click handling. Board-side
// rendering is render.js; game flow stays in main.js, injected via initSheets().

import {
  state, owns, effectivePatronSlots, effectiveSundrySlots, spendReshuffleSundry,
  takePaintEchoes, takeGhostEchoes, completesLovers, restingPoints,
} from './state.js';
import {
  TRIMS, NICKS, COLOURS, STALL_DEFS, SMELT_MIN_COLLECTION, SKIP_COIN_GRANT,
  ANIM, SUNDRY_SELL, tileCount, sundryTip, TOOL_LOOK, PACKAGES, APPLICATORS,
  colourDesc, POSTNOM, GHOST_HIRE, MATERIALS, TILE_POINTS, letterGlyph,
  BLACK_PATRON_MARKUP, HACKER_CAP, SHELL_COINS,
} from './constants.js';
import { PATRON_DEFS, patronById, guildsOf, patronName, patronShelf, patronEmoji, patronCost, laurelWorth } from './patrons.js';
import { upgradeById } from './upgrades.js';
import {
  market, stallById, stallPrice, beadleFavour, isProposalStall,
  offerPrice, compostLeft, takeCompost,
  buyPatron, buyTile, buySundry, sellPatron, sellSundry, patronRefund,
  rerollMarket, freeRerollMarket,
  stallSmelt, stallCommission, stallClone,
} from './market.js';
import {
  colophon, closeColophon, applyColophonPick, applyColophonSkip, reshuffleColophon,
} from './colophon.js';
import {
  blackMarket, closeBlackMarket, buyBlackTile, buyBlackPatron, buyBlackSundry, alleyAsks,
  hackerEligible, hackerPrice, hackTile, shellPrice, playShell,
} from './blackmarket.js';
// Every heading, note and button label on these three sheets is copy, and lives
// in js/text.js with the rest of the game's writing.
import {
  MARKET_TEXT as MT, BLACK_MARKET_TEXT as BT, COLOPHON_TEXT as CT, fillSlots, logLine,
} from './text.js';
import {
  chamber, chamberPatrons, CHAMBER_COINS, chamberLetters, CHAMBER_SUNDRIES,
  CHAMBER_COLOURS, CHAMBER_TRIMS, CHAMBER_NICKS, CHAMBER_MATERIALS,
  EXPERIMENTS, experimentOn, toggleExperiment,
  grantCoins, seatPatron, unseatPatron, hauntPatron, addSeats, addBenchSlots,
  giveSundry, dropSundry, strikeTile, scrapTile, scrapAllTiles,
  setBuild, freshBuild, buildPoints, canBeDual,
} from './chamber.js';
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

// Full build — only for opening the market, switching view, or completing a
// stall purchase. Buying an offer patches in place (see updateMarketState).
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
      if (o.quire) {
        o.templates.forEach((t, k) => {
          const slot = m.querySelector(`[data-offer-tile="${i}"][data-quire-slot="${k}"]`);
          if (slot && !slot.children.length) slot.appendChild(makeTileEl({ ...t, id: '' }, 'offer'));
        });
        return;
      }
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

// Sold state, affordability and the coin count, patched without a rebuild.
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
    // A ghost needs no seat, and neither does the lover whose arrival marries
    // the pair and frees one — so a full table is no bar to either. The buy
    // itself allows both (buyPatron), and this must agree or the card is greyed
    // out for a rule that doesn't apply to it.
    const seated = kind !== 'patron' || !seatsFull
                || !!offer.data?.ghost || completesLovers(offer.id);
    const afford = state.coins >= cost && seated
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

  // Redrawn in place, so a hire appears seated without a rebuild.
  const strip = m.querySelector('[data-market-shelf]');
  if (strip) {
    strip.style.setProperty('--seat-count', effectivePatronSlots());
    strip.innerHTML = marketShelfCardsHTML();
  }
  // The workbench, for the same reason.
  const benchStrip = m.querySelector('[data-market-bench]');
  if (benchStrip) {
    benchStrip.style.setProperty('--slot-count', effectiveSundrySlots());
    benchStrip.innerHTML = marketBenchSlotsHTML();
  }
  // A full table or bench makes the tally urgent rather than a footnote.
  m.querySelector('[data-market-shelf-wrap]')?.classList.toggle('market-shelf--wanted', seatsFull);
  m.querySelector('[data-market-bench-wrap]')?.classList.toggle('market-shelf--wanted', benchFull);

  const reroll = m.querySelector('#btnReroll');
  if (reroll) reroll.disabled = !(state.freeRerolls > 0) && state.coins < market.rerollCost;
}

function rewardHTML() {
  if (!market.rewardParts?.length) return '';
  const rows = market.rewardParts
    .map(p => `<span class="reward-part">${p.label} <b>+${p.coins}</b></span>`).join('');
  return `<div class="reward-line">${rows}<span class="reward-total">${coinHTML(market.rewardTotal)} ${MT.earned}</span></div>`;
}

// Written on a fresh sheet and on every in-place patch, so they can't drift.
const seatsLabel = () => {
  const max = effectivePatronSlots();
  return fillSlots(MT.seated, state.patrons.length, max)
       + (state.patrons.length >= max ? MT.seatsFull : '');
};
const benchLabel = () => {
  const max = effectiveSundrySlots();
  return fillSlots(MT.benched, state.sundries.length, max)
       + (state.sundries.length >= max ? MT.benchFull : '');
};
// The short form, for the bench heading's narrow column. The long one above
// belongs to the Sundries shop column.
const benchCount = () => {
  const max = effectiveSundrySlots();
  return `${state.sundries.length}/${max}${state.sundries.length >= max ? ' — full' : ''}`;
};

// ─── The table, restated inside the Market ────────────────────────────────────
// The board's patron shelf drawn again, since the modal covers the board. Same
// cards: ✕ dismisses, a tap opens the calling card, and dragging reseats it
// (initShelfDrag in drag.js takes this shelf as well as the board's).
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
        <span class="patron-emoji">${patronEmoji(def, p.data)}</span>
        <span class="patron-name">${label}</span>
        ${p.data?.postnom ? `<span class="patron-postnom" title="A distinguished patron — ×${POSTNOM.mult} Mult, paid at this seat's turn">${p.data.postnom}</span>` : ''}
        ${laurels ? `<span class="patron-laurel" title="${laurelWorth(laurels)}, paid at this seat's turn">🏵️${laurels > 1 ? `<b>${laurels}</b>` : ''}</span>` : ''}
        <button class="patron-x" data-sell-patron="${p.uid ?? def.id}" title="Dismiss ${name} for ${half} Coins">✕</button>
      </div>`;
  }
  return cards;
}

// ─── The workbench, restated inside the Market ────────────────────────────────
// The board's bench, for the same reason. Nothing is armed from here (a tube has
// no hand to paint), so the slots are plain cards and the ✕ sells one back.
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
  : s.kind === 'package' && PACKAGES[s.theme]
                           ? { cls: `sundry--wrapped sundry--package sundry--pkg-${s.theme}`,
                               mark: '<span class="wrapped-mark"></span>', name: 'Parcel' }
  : s.kind === 'applicator' && APPLICATORS[s.material]
                           ? { cls: `sundry--tool sundry--applicator sundry--app-${s.material}`,
                               mark: `<span class="sundry-glyph">${APPLICATORS[s.material].glyph}</span>`,
                               name: 'Applicator' }
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
      <h3 class="market-sec">${MT.bench} <span class="market-sub" data-bench-count>${benchCount()}</span></h3>
      <div class="sundries sundries--market" data-market-bench
           style="--slot-count:${effectiveSundrySlots()}">${marketBenchSlotsHTML()}</div>
    </section>`;
}

// The graveyard door, restated for the same reason. Its sheet is a modal at the
// body level, so it opens over the Market without either knowing the other.
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
      <h3 class="market-sec">${MT.table} <span class="market-sub" data-seats>${seatsLabel()}</span><span class="market-sub market-sub--hint">${MT.tableHint}</span>${marketGhostDoorHTML()}</h3>
      <div class="shelf shelf--market" data-market-shelf style="--seat-count:${effectivePatronSlots()}">${marketShelfCardsHTML()}</div>
    </section>`;
}

function marketShopHTML() {
  const patronCards = market.patronOffers.map((o, i) => {
    const def = patronById(o.id);
    // A stackable patron's card shows the exact copy on offer, not the def.
    const name = patronName(def, o.data);
    const desc = def.instDesc?.(o.data) ?? def.desc;
    // A guild member's card wears its livery; a dual-livery card binds a second
    // ribbon and names both. Neutral cards stay plain ivory.
    const liveries = guildsOf(def);
    const livery = (liveries.length ? ` offer-patron--g-${liveries[0]}` : '')
                 + (liveries[1] ? ` offer-patron--g2-${liveries[1]}` : '');
    // Struck differently: the ×Mult a postnom carries is not in the desc.
    const lettered = o.data?.postnom ? ' offer-patron--postnom' : '';
    // Already dead: it works on, takes no seat, and its contract is worth
    // nothing back. The card says only WHAT it is — the colours carry the rest,
    // and the price tag's tooltip has the terms for anyone who asks.
    const spectral = o.data?.ghost ? ' offer-patron--ghost' : '';
    return `
      <div class="offer-patron offer-patron--${def.rarity}${livery}${lettered}${spectral}" data-offer="patron" data-idx="${i}">
        <div class="op-portrait">${def.portrait
          ? `<img src="${def.portrait}" alt="${name}">`
          : `<span class="op-emoji">${patronEmoji(def, o.data)}</span>`}</div>
        <div class="op-card-body">
          <div class="op-name">${name}</div>
          <div class="op-title">${def.rarity}${liveries.length ? ` · <span class="op-guild">${liveries.join(' & ')}</span>` : ''}${
            o.data?.postnom ? ` · <span class="op-postnom">${o.data.postnom} · ×${POSTNOM.mult} Mult</span>` : ''}${
            o.data?.ghost ? ' · <span class="op-ghost">👻 a ghost</span>' : ''}</div>
          <div class="op-desc">${desc}</div>
        </div>
        <span class="op-sold">seated</span>
        <button class="btn-price${haggleClass(def, o.data)}" data-buy-patron="${def.id}"${haggleTip(def, o.data)}>${
          patronCost(def, o.data) === 0 ? 'Free' : coinHTML(patronCost(def, o.data))}</button>
      </div>`;
  }).join('') || `<p class="sheet-note">${MT.noPatrons}</p>`;

  // Nothing is summarised under the tile — hover or long-press it.
  const tileCards = market.tileOffers.map((o, i) => {
    const price = offerPrice(o);
    // A quire holds three sorts in one slot, so it shows all three and says so.
    if (o.quire) {
      return `
      <div class="offer-tile offer-quire" data-offer="tile" data-idx="${i}">
        <div class="offer-quire-slots">${o.templates
          .map((_, k) => `<div class="offer-tile-slot" data-offer-tile="${i}" data-quire-slot="${k}"></div>`)
          .join('')}</div>
        <div class="bm-tile-note">${MT.quireNote}</div>
        <span class="op-sold">bought</span>
        <button class="btn-price" data-buy-tile="${i}">${coinHTML(price)}</button>
      </div>`;
    }
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

  // One source for every sundry's words (constants.js → sundryTip).
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
          <div class="stall-from">${beadleFavour(s)
            ? 'the Beadle’s favour — free' : `work from ${coinHTML(stallPrice(s))}`}</div>
        </div>
      </div>`;
  }).join('');

  const reshuffles = state.sundries.filter(s => s.kind === 'reshuffle').length;

  const returning = market.returning ? ' sheet--return' : '';
  market.returning = false;

  return `
    <div class="sheet sheet--market${returning}">
      <div class="sheet-head">
        <div>
          <h2 class="market-title">${MT.title}</h2>
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
          <h3 class="market-sec">${MT.patrons} <span class="market-sub">${MT.patronsSub}</span></h3>
          <div class="offer-list">${patronCards}</div>
        </section>
        <section class="market-col">
          <h3 class="market-sec">${MT.tiles}</h3>
          <div class="offer-tiles">${tileCards}</div>
          <h3 class="market-sec market-sec--paint">${MT.sundries} <span class="market-sub" data-bench>${benchLabel()}</span></h3>
          <div class="offer-list">${sundryCards}</div>
        </section>
      </div>

      ${owns('composter') ? `
      <section class="market-compost">
        <h3 class="market-sec">${MT.compost} <span class="market-sub">${
          heap.length
            ? compostLeft()
              ? fillSlots(MT.compostTake, compostLeft())
              : MT.compostSpent
            : MT.compostEmpty
        }</span></h3>
        ${heap.length ? `<div class="offer-tiles offer-tiles--compost">${heapCards}</div>` : ''}
      </section>` : ''}

      <section class="market-stalls">
        <h3 class="market-sec">${MT.stalls} <span class="market-sub">${MT.stallsSub}</span></h3>
        <div class="stall-row">${stallCards}</div>
      </section>

      <div class="market-foot">
        <button class="btn btn-quiet" id="btnReroll" title="${MT.rerollTip}${state.freeRerolls > 0 ? ' ' + fillSlots(MT.factorTip, state.freeRerolls > 1 ? state.freeRerolls + ' fees' : 'fee') : ''}"
          ${!(state.freeRerolls > 0) && state.coins < market.rerollCost ? 'disabled' : ''}>
          ${MT.reroll} ${state.freeRerolls > 0 ? `🤝 free · ${state.freeRerolls} left` : coinHTML(market.rerollCost)}
        </button>
        ${reshuffles ? `<button class="btn btn-quiet" id="btnMarketReshuffle" title="${MT.reshuffleTip}">
          ${MT.reshuffle} · ${reshuffles} left
        </button>` : ''}
        <button class="btn btn-quiet" id="btnOpenCollection">${MT.collection}</button>
        <div class="market-spacer"></div>
        <button class="btn btn-print" id="btnMarketContinue">${MT.leave}</button>
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
  // self-evident the stall carries a key.
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
    ? `<p class="sheet-note stall-warn">${MT.smeltFloor}</p>`
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
        <button class="btn btn-quiet" id="btnStallBack">${MT.stallBack}</button>
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

// Collection minis for most stalls, full-size previews for the proposal stalls.
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
  // The Smelter and Stereotyper work off the whole case, a proposal stall off
  // the spread it laid out.
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

// Patched in place, so a tap never rebuilds the sheet under your thumb.
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
  // A stall the Beadle has opened costs nothing, and "for 0 Coins" is not what a
  // free thing says. Every label below reads this one string.
  const priceTag = beadleFavour(stall)
    ? 'on the Beadle’s favour'
    : `for ${price} Coin${price === 1 ? '' : 's'}`;
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

// Marked on the price tag rather than spelled out in words: a tag tipped
// green-side-down is under the odds, red-side-down over, and the tooltip says
// which for anyone who wants it said. An unexplained difference would read as a
// fault rather than a bargain, but it needs a glance, not a sentence. A free
// patron never haggles (see patronCost), so its tag is never marked.
const haggled = (def, data) => (def?.cost ? (data?.haggle ?? 0) : 0);
const haggleClass = (def, data) => {
  const h = haggled(def, data);
  return h ? (h < 0 ? ' btn-price--under' : ' btn-price--over') : '';
};
// The tag carries the surcharges too — the letters after a name, and a ghost's
// free seat — so the asking price is never an unexplained number. All of it in
// the tooltip: the card itself already says what a postnom and a ghost are.
const haggleTip = (def, data) => {
  if (!def?.cost) return '';
  const h = haggled(def, data);
  const notes = [];
  if (h) notes.push(`${h < 0 ? 'Going cheap today — a Coin under' : 'A Coin over'} the usual ${def.cost}`);
  if (data?.postnom) notes.push(`${POSTNOM.surcharge} Coins over for the ${data.postnom}`);
  if (data?.ghost)   notes.push(`${GHOST_HIRE.surcharge} Coins over for a ghost — it needs no seat`);
  return notes.length ? ` title="${notes.join(' · ')}"` : '';
};

// ─── Collection view (read-only) ──────────────────────────────────────────────

// Counted by the paint ON the tile, so the buckets partition the case and add up
// to the total. Rainbow metal would break that (it scores as EVERY colour), so
// it is tallied and said apart.
function collectionTally() {
  const counts = Object.fromEntries(Object.keys(COLOURS).map(c => [c, 0]));
  let bare = 0, rainbow = 0;
  for (const t of state.collection) {
    if (t.material === 'rainbow') { rainbow++; continue; }
    const c = t.colour ?? t.wash ?? null;
    if (c && counts[c] != null) counts[c]++;
    else bare++;
  }
  return { counts, bare, rainbow };
}

function collectionTallyHTML() {
  const { counts, bare, rainbow } = collectionTally();
  const chips = Object.entries(counts).map(([c, n]) =>
    `<span class="case-tally-chip case-tally-chip--${c}${n ? '' : ' case-tally-chip--none'}"
           title="${COLOURS[c].label} tiles in your collection"
      ><i class="case-tally-dot"></i>${COLOURS[c].label} <b>${n}</b></span>`).join('');
  const extras = [
    rainbow ? `<span class="case-tally-chip case-tally-chip--rainbow"
                     title="Rainbow metal counts as every colour when a word is scored — so it is counted apart here rather than four times over"
                ><i class="case-tally-dot"></i>Rainbow <b>${rainbow}</b></span>` : '',
    `<span class="case-tally-chip case-tally-chip--bare${bare ? '' : ' case-tally-chip--none'}"
           title="Unpainted tiles — they lift no colour multiplier"
      ><i class="case-tally-dot"></i>Unpainted <b>${bare}</b></span>`,
  ].join('');
  return `<div class="case-tally">${chips}${extras}</div>`;
}

function marketCollectionHTML() {
  const n = state.collection.length;
  return `
    <div class="sheet sheet--market">
      <div class="sheet-head">
        <div>
          <h2 class="market-title">Your collection</h2>
          <p class="sheet-note">${n} tile${n === 1 ? '' : 's'}.</p>
          ${collectionTallyHTML()}
        </div>
      </div>
      <div class="mini-grid mini-grid--case" id="collectionGrid"></div>
      <div class="market-foot">
        <button class="btn btn-quiet" id="btnCollectionBack">${MT.stallBack}</button>
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
  }).join('') || `<p class="sheet-note">${CT.empty}</p>`;

  m.innerHTML = `
    <div class="sheet sheet--market sheet--colophon">
      <div class="sheet-head">
        <div>
          <h2 class="market-title">${CT.title}</h2>
          <p class="sheet-note">${CT.note}</p>
        </div>
      </div>
      <div class="colophon-grid">${cards}</div>
      ${colophon.offers.length ? `
        <div class="market-foot">
          <button class="btn btn-quiet" id="btnColophonSkip" title="${CT.skipTip}">
            ${CT.skip} · +${coinHTML(SKIP_COIN_GRANT)}
          </button>
          ${reshuffles ? `<button class="btn btn-quiet" id="btnColophonReshuffle" title="${CT.reshuffleTip}">
            ${CT.reshuffle} · ${reshuffles} left
          </button>` : ''}
          <div class="market-spacer"></div>
        </div>` : ''}
    </div>`;
  m.classList.add('show');
}

// ─── The Black Market ─────────────────────────────────────────────────────────
// The alley behind the fair. Deliberately NOT the Market's sheet with a dark
// class on it: the stock is laid out on one long table rather than in columns,
// there is no re-roll, no stalls, no reward line and no purse in gold — the only
// things carried over are the shelf and workbench strips, because you cannot
// judge a hire or a tool without seeing what you already hold.
//
// State lives in js/blackmarket.js; this is only its face and its buttons.

// One line, always drawn — an empty one on ordinary stock — so every card on the
// table reserves the same caption row and the rows line up whatever is laid out.
const blackTileNote = offer =>
  offer.material ? fillSlots(BT.metalNote, MATERIALS[offer.material].metal)
  : offer.mark   ? BT.markNote
  :                '';

function blackMarketHTML() {
  const tiles = blackMarket.tileOffers.map((o, i) => `
      <div class="bm-tile${o.material ? ` bm-tile--${o.material}` : ''}${o.mark ? ' bm-tile--mark' : ''}"
           data-bm-offer="tile" data-idx="${i}">
        <div class="offer-tile-slot" data-bm-tile="${i}"></div>
        <div class="bm-tile-note">${blackTileNote(o)}</div>
        <span class="op-sold">${BT.gone}</span>
        <button class="btn-price" data-buy-bm-tile="${i}">${coinHTML(alleyAsks(o.price))}</button>
      </div>`).join('');

  const patrons = blackMarket.patronOffers.map((o, i) => {
    const def = patronById(o.id);
    const name = patronName(def, o.data);
    const desc = def.instDesc?.(o.data) ?? def.desc;
    const liveries = guildsOf(def);
    const livery = (liveries.length ? ` offer-patron--g-${liveries[0]}` : '')
                 + (liveries[1] ? ` offer-patron--g2-${liveries[1]}` : '');
    const lettered = o.data?.postnom ? ' offer-patron--postnom' : '';
    return `
      <div class="offer-patron offer-patron--rare${livery}${lettered}" data-bm-offer="patron" data-idx="${i}">
        <div class="op-portrait">${def.portrait
          ? `<img src="${def.portrait}" alt="${name}">`
          : `<span class="op-emoji">${patronEmoji(def, o.data)}</span>`}</div>
        <div class="op-card-body">
          <div class="op-name">${name}</div>
          <div class="op-title">rare${liveries.length ? ` · <span class="op-guild">${liveries.join(' & ')}</span>` : ''}${
            o.data?.postnom ? ` · <span class="op-postnom">${o.data.postnom} · ×${POSTNOM.mult} Mult</span>` : ''}</div>
          <div class="op-desc">${desc}</div>
        </div>
        <span class="op-sold">seated</span>
        <button class="btn-price btn-price--over" data-buy-bm-patron="${i}"
                title="${fillSlots(BT.markupTip, def.cost, BLACK_PATRON_MARKUP)}${
                  o.data?.postnom ? ` · ${fillSlots(BT.postnomTip, POSTNOM.surcharge, o.data.postnom)}` : ''}">${
          coinHTML(alleyAsks(patronCost(def, o.data)))}</button>
      </div>`;
  }).join('') || `<p class="sheet-note">${BT.noPatrons}</p>`;

  const sundries = blackMarket.sundryOffers.map((o, i) => {
    const tip = sundryTip(o) ?? { head: 'Sundry', body: '' };
    const mark = o.kind === 'package'
        ? `<span class="sundry--pkg-${o.theme}"><span class="wrapped-mark wrapped-mark--offer"></span></span>`
      : o.kind === 'applicator'
        ? `<span class="sundry-glyph sundry-glyph--offer">${APPLICATORS[o.material].glyph}</span>`
        : `<span class="sundry-glyph sundry-glyph--offer">${TOOL_LOOK[o.kind]?.glyph ?? '✒'}</span>`;
    return `
      <div class="offer-paint offer-tool bm-sundry" data-bm-offer="sundry" data-idx="${i}"
           data-tip-head="${tip.head}" data-tip-body="${tip.body}">
        ${mark}
        <div class="op-body"><div class="op-name">${tip.head}</div></div>
        <span class="op-sold">bought</span>
        <button class="btn-price" data-buy-bm-sundry="${i}">${coinHTML(alleyAsks(o.price))}</button>
      </div>`;
  }).join('');

  const hacks = (blackMarket.hacker?.proposals ?? []).map((tid, i) => {
    const tmpl = state.collection.find(t => t.tid === tid);
    if (!tmpl) return '';
    const from  = restingPoints(tmpl);
    const maxed = !hackerEligible(tmpl);
    const note  = maxed ? BT.hackMaxed
                        : fillSlots(BT.hackNote, from, Math.min(HACKER_CAP, from * 2));
    return `
      <div class="bm-tile bm-hack" data-bm-offer="hack" data-idx="${i}">
        <div class="offer-tile-slot" data-bm-hack-tile="${i}"></div>
        <div class="bm-tile-note">${note}</div>
        <button class="btn-price" data-buy-bm-hack="${i}" ${maxed ? 'disabled' : ''}>${coinHTML(hackerPrice())}</button>
      </div>`;
  }).join('') || `<p class="sheet-note">${BT.noHacks}</p>`;

  // Each shell shows the ACTUAL prize under it — the tool by name, the sort in
  // its metal — because the gamble is which of the three you get, and a gamble
  // you cannot read is not a decision.
  const shells = (blackMarket.shell?.shells ?? []).map((p, i) => {
    const face = p.kind === 'coins'
        ? { glyph: `<span class="bm-shell-coin">${coinHTML(p.coins)}</span>`,
            note: fillSlots(BT.shellCoins, p.coins) }
      : p.kind === 'sundry'
        ? { glyph: `<span class="bm-shell-sundry">${sundryGlyph(p.sundry)}</span>`,
            note: sundryTip(p.sundry)?.head ?? 'A sundry' }
      : { glyph: `<span class="offer-tile-slot" data-bm-shell-tile="${i}"></span>`,
          note: p.kind === 'batter' ? BT.shellBatter
              : p.template.material ? MATERIALS[p.template.material].metal
              : BT.shellSortPlain };
    return `
      <div class="bm-shell" data-shell="${i}">
        <span class="bm-shell-glyph">${face.glyph}</span>
        <div class="bm-tile-note">${face.note}</div>
      </div>`;
  }).join('');

  return `
    <div class="sheet sheet--market sheet--black">
      <div class="sheet-head">
        <div>
          <h2 class="market-title bm-title">${BT.title}</h2>
          <p class="sheet-note">${BT.note}</p>
        </div>
        <div class="market-purse bm-purse"><span class="coin coin--lg"></span><b id="bmCoins">${state.coins}</b></div>
      </div>

      <div class="market-hold">
        ${marketShelfHTML()}
        ${marketBenchHTML()}
      </div>

      <section class="bm-sec">
        <h3 class="market-sec">${BT.tiles} <span class="market-sub">${BT.tilesSub}</span></h3>
        <div class="bm-tiles">${tiles}</div>
      </section>

      <section class="bm-sec">
        <h3 class="market-sec">${BT.hacker} <span class="market-sub">${fillSlots(BT.hackerSub, HACKER_CAP)}</span></h3>
        <div class="bm-tiles bm-hacks">${hacks}</div>
      </section>

      <section class="bm-sec">
        <h3 class="market-sec">${BT.shell} <span class="market-sub">${BT.shellSub}</span></h3>
        <div class="bm-shells" data-bm-offer="shell" data-idx="0">
          ${shells}
          <button class="btn-price bm-shell-play" data-play-shell>${BT.shellPlay} ${coinHTML(shellPrice())}</button>
        </div>
      </section>

      <div class="bm-grid">
        <section class="bm-sec">
          <h3 class="market-sec">${BT.patrons} <span class="market-sub">${BT.patronsSub}</span></h3>
          <div class="offer-list bm-patrons">${patrons}</div>
        </section>
        <section class="bm-sec">
          <h3 class="market-sec">${BT.sundries} <span class="market-sub" data-bench>${benchLabel()}</span></h3>
          <div class="offer-list">${sundries}</div>
        </section>
      </div>

      <div class="market-foot">
        <div class="market-spacer"></div>
        <button class="btn btn-print" id="btnBlackMarketLeave">${BT.leave}</button>
      </div>
    </div>`;
}

export function renderBlackMarket() {
  const m = $('blackMarketModal');
  if (!m) return;
  if (!blackMarket.open) { m.classList.remove('show'); m.innerHTML = ''; return; }

  m.innerHTML = blackMarketHTML();
  m.classList.add('show');

  blackMarket.tileOffers.forEach((o, i) => {
    const slot = m.querySelector(`[data-bm-tile="${i}"]`);
    if (slot && !slot.children.length) slot.appendChild(makeTileEl({ ...o.template, id: '' }, 'offer'));
  });
  (blackMarket.shell?.shells ?? []).forEach((p, i) => {
    const slot = m.querySelector(`[data-bm-shell-tile="${i}"]`);
    if (slot && p.template && !slot.children.length) {
      slot.appendChild(makeTileEl({ ...p.template, id: '' }, 'offer'));
    }
  });
  (blackMarket.hacker?.proposals ?? []).forEach((tid, i) => {
    const slot = m.querySelector(`[data-bm-hack-tile="${i}"]`);
    const tmpl = state.collection.find(t => t.tid === tid);
    if (slot && tmpl && !slot.children.length) slot.appendChild(makeTileEl({ ...tmpl, id: '' }, 'offer'));
  });
  updateBlackMarketState();
}

// Sold state and affordability, patched without a rebuild — the same job
// updateMarketState does for the fair.
export function updateBlackMarketState() {
  const m = $('blackMarketModal');
  if (!m || !blackMarket.open) return;

  setText('bmCoins', state.coins);

  const seatsFull = state.patrons.length >= effectivePatronSlots();
  const benchFull = state.sundries.length >= effectiveSundrySlots();

  for (const card of m.querySelectorAll('[data-bm-offer]')) {
    const kind = card.dataset.bmOffer;
    const idx  = Number(card.dataset.idx);
    // The Hacker's bench: no `sold` — a struck tile may be struck again under
    // the cap — so the button is priced and gated here and nothing else applies.
    if (kind === 'shell') {
      const btn = card.querySelector('.btn-price');
      if (btn) {
        const cost = shellPrice();
        btn.disabled = state.coins < cost;
        btn.innerHTML = `${BT.shellPlay} ${coinHTML(cost)}`;
      }
      continue;
    }
    if (kind === 'hack') {
      const tid  = blackMarket.hacker?.proposals?.[idx];
      const tmpl = state.collection.find(t => t.tid === tid);
      const cost = hackerPrice();
      const btn  = card.querySelector('.btn-price');
      if (btn) {
        btn.disabled = !tmpl || !hackerEligible(tmpl) || state.coins < cost;
        btn.innerHTML = coinHTML(cost);
      }
      continue;
    }
    const offer = kind === 'patron' ? blackMarket.patronOffers[idx]
                : kind === 'tile'   ? blackMarket.tileOffers[idx]
                :                     blackMarket.sundryOffers[idx];
    if (!offer) continue;
    const cost = alleyAsks(kind === 'patron'
      ? patronCost(patronById(offer.id), offer.data)
      : offer.price);
    const afford = state.coins >= cost
      && (kind !== 'patron' || !seatsFull)
      && (kind !== 'sundry' || !benchFull);
    card.classList.toggle('offer--sold', !!offer.sold);
    const btn = card.querySelector('.btn-price');
    if (btn) {
      btn.disabled = offer.sold || !afford;
      // The figure, not just whether it can be met: The Fence may have been
      // hired off this very table a moment ago, and every price behind him just
      // came down.
      btn.innerHTML = coinHTML(cost);
    }
  }

  const seats = m.querySelector('[data-seats]');
  if (seats) seats.textContent = seatsLabel();
  const bench = m.querySelector('[data-bench]');
  if (bench) bench.textContent = benchLabel();
  const benchN = m.querySelector('[data-bench-count]');
  if (benchN) benchN.textContent = benchCount();

  const strip = m.querySelector('[data-market-shelf]');
  if (strip) {
    strip.style.setProperty('--seat-count', effectivePatronSlots());
    strip.innerHTML = marketShelfCardsHTML();
  }
  const benchStrip = m.querySelector('[data-market-bench]');
  if (benchStrip) {
    benchStrip.style.setProperty('--slot-count', effectiveSundrySlots());
    benchStrip.innerHTML = marketBenchSlotsHTML();
  }
  m.querySelector('[data-market-shelf-wrap]')?.classList.toggle('market-shelf--wanted', seatsFull);
  m.querySelector('[data-market-bench-wrap]')?.classList.toggle('market-shelf--wanted', benchFull);
}

// ─── Black Market actions ─────────────────────────────────────────────────────

function onBlackMarketClick(e) {
  const buyT = e.target.closest('[data-buy-bm-tile]');
  if (buyT) {
    const idx = Number(buyT.dataset.buyBmTile);
    const r = buyBlackTile(idx);
    if (!r.ok) { if (r.reason) log(r.reason, 'warn'); sfx.bad(); return; }
    sfx.coin();
    const tileEl = document.querySelector(`[data-bm-tile="${idx}"] .tile`);
    flyPurchase(tileEl, $('bagPile') ?? tileEl);
    log(logLine('bmTileBought', r.template.letter, r.template.material
      ? logLine('bmInMetal', MATERIALS[r.template.material].metal.toLowerCase()) : '', r.price), 'good');
    renderAll(); updateBlackMarketState();
    return;
  }

  const buyP = e.target.closest('[data-buy-bm-patron]');
  if (buyP) {
    const r = buyBlackPatron(Number(buyP.dataset.buyBmPatron));
    if (!r.ok) { if (r.reason) log(r.reason, 'warn'); sfx.bad(); return; }
    sfx.coin(); sfx.chime();
    log(logLine('bmPatronSeat', r.name, r.price), 'good');
    renderAll(); updateBlackMarketState();
    return;
  }

  const playS = e.target.closest('[data-play-shell]');
  if (playS) {
    const r = playShell();
    if (!r.ok) { if (r.reason) log(r.reason, 'warn'); sfx.bad(); return; }
    // What came out from under the shell, said in its own words.
    const got = r.refused
        ? fillSlots(logLine('shellNoRoom').trim(), sundryTip(r.refused)?.head ?? 'it', r.coins)
      : r.kind === 'coins'  ? logLine('shellCoinsWon', r.coins).trim()
      : r.kind === 'batter' ? logLine('shellBatterWon').trim()
      : r.kind === 'sort'
        ? logLine('shellSortWon', r.template.material
            ? logLine('bmInMetal', MATERIALS[r.template.material].metal.toLowerCase()) : '',
            r.template.letter).trim()
        : logLine('shellSundryWon', sundryTip(r.sundry)?.head ?? 'a sundry').trim();
    log(logLine('shellPlayed', got), r.kind === 'batter' ? 'warn' : 'good');
    if (r.kind === 'batter') sfx.bad(); else { sfx.coin(); sfx.chime(); }
    renderAll(); renderBlackMarket();
    return;
  }

  const hackB = e.target.closest('[data-buy-bm-hack]');
  if (hackB) {
    const tid = blackMarket.hacker?.proposals?.[Number(hackB.dataset.buyBmHack)];
    const r = hackTile(tid);
    if (!r.ok) { if (r.reason) log(r.reason, 'warn'); sfx.bad(); return; }
    sfx.coin(); sfx.chime();
    log(logLine('bmHacked', r.tmpl.letter, r.from, r.to, r.price), 'good');
    // A full re-render, not a patch: the corner number on the tile just changed,
    // and the note beside it with it.
    renderAll(); renderBlackMarket();
    return;
  }

  const buyS = e.target.closest('[data-buy-bm-sundry]');
  if (buyS) {
    const r = buyBlackSundry(Number(buyS.dataset.buyBmSundry));
    if (!r.ok) { if (r.reason) log(r.reason, 'warn'); sfx.bad(); return; }
    sfx.coin();
    log(logLine('bmSundry', sundryTip(r.offer)?.head ?? 'A sundry'), 'good');
    renderAll(); updateBlackMarketState();
    return;
  }

  // Dismissing a seat or selling a sundry from the strips, so room can be made
  // for what is on the table without leaving the alley to do it.
  const sellP = e.target.closest('[data-sell-patron]');
  if (sellP) {
    const r = sellPatron(sellP.dataset.sellPatron);
    if (!r.ok) { if (r.reason) log(r.reason, 'warn'); sfx.bad(); return; }
    sfx.coin();
    log(logLine('bmDismissed', r.name, r.refund ? logLine('bmForCoins', r.refund) : ''));
    if (r.headsman) log(logLine('headsmanAt', r.headsman.mult), 'good');
    renderAll(); updateBlackMarketState();
    return;
  }
  const sellS = e.target.closest('[data-sell-sundry]');
  if (sellS) {
    const r = sellSundry(Number(sellS.dataset.sellSundry));
    if (r.ok) {
      sfx.coin();
      log(logLine('soldBack', r.refund));
      renderAll(); updateBlackMarketState();
    }
    return;
  }
  const seatCard = e.target.closest('[data-market-shelf] .patron[data-patron]');
  if (seatCard) {
    const def = patronById(seatCard.dataset.patron);
    const seat = state.patrons.find(p => String(p.uid) === seatCard.dataset.uid)
              ?? state.patrons.find(p => p.id === seatCard.dataset.patron);
    if (def) showPatronPopover(def, seatCard, seat);
    return;
  }
  if (e.target.closest('[data-open-ghosts]')) { openGhosts(); return; }

  if (e.target.closest('#btnBlackMarketLeave')) {
    closeBlackMarket();
    renderBlackMarket();
    renderAll();
    flow.openMarket();
  }
}

// ─── The Testing Chamber ──────────────────────────────────────────────────────
// A playtest bench, not a part of the game: coins, seats, the workbench and the
// case, all writable by hand. It opens at the top of a new run and can be
// reopened from Settings at any point in a run. Rendered whole on every action
// rather than patched — nothing here is animated, and a full redraw keeps the
// four tabs honest about a state four of them can change.

const TAB_LABELS = {
  patrons:  'Patrons',
  sundries: 'Sundries',
  tiles:    'Tiles',
  run:      'Run',
  labs:     'Experimental',
};

const esc = s => String(s ?? '').replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function renderChamber() {
  const m = $('chamberModal');
  if (!m) return;
  if (!chamber.open) { m.classList.remove('show'); m.innerHTML = ''; return; }

  const tabs = Object.entries(TAB_LABELS).map(([id, label]) =>
    `<button class="tc-tab${chamber.tab === id ? ' tc-tab--on' : ''}" data-tc-tab="${id}">${label}</button>`
  ).join('');

  const body = chamber.tab === 'patrons'  ? chamberPatronsHTML()
             : chamber.tab === 'sundries' ? chamberSundriesHTML()
             : chamber.tab === 'tiles'    ? chamberTilesHTML()
             : chamber.tab === 'labs'     ? chamberLabsHTML()
             :                              chamberRunHTML();

  m.innerHTML = `
    <div class="sheet sheet--chamber">
      <div class="sheet-head tc-head">
        <div>
          <h2 class="tc-title">The Testing Chamber</h2>
          <p class="sheet-note">Nothing here is earned. Set the press however you need it, then print.</p>
        </div>
        <div class="tc-purse">
          <span class="tc-coins" id="tcCoins">${coinHTML(state.coins)}</span>
          <button class="btn btn-quiet tc-mini" data-tc-coins="${CHAMBER_COINS}">+${CHAMBER_COINS}</button>
          <button class="btn btn-quiet tc-mini" data-tc-coins="20">+20</button>
          <button class="btn btn-quiet tc-mini" data-tc-coins="-999999">Broke</button>
        </div>
      </div>

      <div class="tc-tabs">${tabs}</div>
      <div class="tc-body">${body}</div>

      <div class="market-foot">
        ${chamber.atStart ? '' : '<button class="btn btn-quiet" id="btnChamberClose">← Back to the page</button>'}
        <div class="market-spacer"></div>
        <button class="btn btn-print btn-big" id="btnChamberBegin">${
          chamber.atStart ? 'Begin the run ❧' : 'Done ❧'}</button>
      </div>
    </div>`;
  m.classList.add('show');

  if (chamber.tab === 'tiles') renderChamberTiles();
}

// ─── Patrons ──────────────────────────────────────────────────────────────────

function chamberPatronsHTML() {
  const seated = state.patrons.map(p => {
    const def = patronById(p.id);
    return `<button class="tc-seat" data-tc-unseat="${p.uid}"
                    title="Take ${esc(patronName(def, p.data))} off the shelf"
            ><span class="tc-seat-face">${patronEmoji(def, p.data)}</span>${
              esc(patronShelf(def, p.data))}<span class="tc-seat-x">✕</span></button>`;
  }).join('') || '<span class="sheet-note">No one seated.</span>';

  const haunting = (state.ghosts ?? []).map(p => {
    const def = patronById(p.id);
    return `<button class="tc-seat tc-seat--ghost" data-tc-unhaunt="${p.uid}"
            ><span class="tc-seat-face">👻</span>${esc(patronShelf(def, p.data))}<span class="tc-seat-x">✕</span></button>`;
  }).join('');

  const roster = chamberPatrons().map(def => {
    const guilds = guildsOf(def);
    const on = state.patrons.some(p => p.id === def.id);
    return `
      <div class="tc-patron tc-patron--${def.rarity}${on ? ' tc-patron--seated' : ''}${
        guilds.length ? ` op-livery--${guilds[0]}` : ''}" data-tc-patron="${def.id}">
        <div class="op-portrait">${def.portrait
          ? `<img src="${def.portrait}" alt="">`
          : `<span class="op-emoji">${def.emoji}</span>`}</div>
        <div class="op-card-body">
          <div class="op-name">${esc(def.name)}</div>
          <div class="op-title">${def.rarity}${guilds.length ? ` · ${guilds.join(' & ')}` : ''}${
            def.unlisted ? ' · unlisted' : ''}${def.locked?.() ? ' · locked' : ''}</div>
          <div class="op-desc">${esc(def.desc)}</div>${def.unlockNote
            ? `<div class="op-desc op-desc--lock">🔒 ${esc(def.unlockNote)}</div>` : ''}
        </div>
        <div class="tc-patron-acts">
          <button class="btn-price" data-tc-seat="${def.id}">Seat</button>
          <button class="btn-price btn-price--ghost" data-tc-haunt="${def.id}"
                  title="Hire it dead — it works on and takes no seat">👻</button>
        </div>
      </div>`;
  }).join('') || '<p class="sheet-note">Nobody by that name.</p>';

  return `
    <div class="tc-bench">
      <h3 class="market-sec">Your shelf
        <span class="market-sub">${state.patrons.length} of ${effectivePatronSlots()} seats</span>
        <button class="btn btn-quiet tc-mini" data-tc-seats="1">+ seat</button>
        <button class="btn btn-quiet tc-mini" data-tc-seats="-1">− seat</button>
      </h3>
      <div class="tc-seats">${seated}${haunting}</div>
    </div>
    <h3 class="market-sec">The roster
      <span class="market-sub">${chamberPatrons().length} of ${PATRON_DEFS.length}</span>
    </h3>
    <input class="tc-filter" id="tcFilter" type="search" placeholder="Filter by name, guild, rarity or rule…"
           value="${esc(chamber.filter)}" autocomplete="off">
    <div class="tc-patrons">${roster}</div>`;
}

// ─── Sundries ─────────────────────────────────────────────────────────────────

function chamberSundriesHTML() {
  const held = state.sundries.map((s, i) => {
    const tip = sundryTip(s);
    return `<button class="tc-seat" data-tc-drop="${i}" title="Throw it away"
            ><span class="tc-seat-face">${sundryGlyph(s)}</span>${esc(tip?.head ?? s.kind)}<span class="tc-seat-x">✕</span></button>`;
  }).join('') || '<span class="sheet-note">The bench is empty.</span>';

  const shelf = CHAMBER_SUNDRIES.map((s, i) => {
    const tip = sundryTip(s);
    return `
      <div class="tc-sundry" data-tc-sundry="${i}"
           data-tip-head="${esc(tip?.head ?? s.kind)}" data-tip-body="${esc(tip?.body ?? '')}">
        <span class="tc-sundry-face">${sundryGlyph(s)}</span>
        <div class="op-body"><div class="op-name">${esc(tip?.head ?? s.kind)}</div></div>
      </div>`;
  }).join('');

  return `
    <div class="tc-bench">
      <h3 class="market-sec">Your workbench
        <span class="market-sub">${state.sundries.length} of ${effectiveSundrySlots()} slots</span>
        <button class="btn btn-quiet tc-mini" data-tc-slots="1">+ slot</button>
        <button class="btn btn-quiet tc-mini" data-tc-slots="-1">− slot</button>
      </h3>
      <div class="tc-seats">${held}</div>
    </div>
    <h3 class="market-sec">Every sundry <span class="market-sub">click to take one</span></h3>
    <div class="tc-sundries">${shelf}</div>`;
}

// The face a sundry wears in the chamber — the same marks the workbench draws
// (renderSundries in render.js), so a thing taken here is recognisable when it
// lands on the bench a moment later.
function sundryGlyph(s) {
  if (s.kind === 'tube')       return `<span class="paint-tube paint-tube--${s.colour}"></span>`;
  if (s.kind === 'reshuffle')  return '<span class="sundry-shuffle">↻</span>';
  if (s.kind === 'ratchet')    return '<span class="ratchet-mark">⇅</span>';
  if (s.kind === 'wrapped')    return '<span class="wrapped-mark"></span>';
  if (s.kind === 'package')    return `<span class="sundry--pkg-${s.theme}"><span class="wrapped-mark"></span></span>`;
  if (s.kind === 'applicator') return APPLICATORS[s.material]?.glyph ?? '🧪';
  return TOOL_LOOK[s.kind]?.glyph ?? '❔';
}

// ─── Tiles ────────────────────────────────────────────────────────────────────

function chamberTilesHTML() {
  const b = chamber.build ?? freshBuild();

  const letters = chamberLetters().map(L => `
    <button class="tc-sort${b.letter === L ? ' tc-sort--on' : ''}" data-tc-letter="${esc(L)}"
            title="${esc(L)} · ${TILE_POINTS[L] ?? 0} Points">${esc(letterGlyph(L))}</button>`).join('');

  const alts = chamberLetters().map(L => `
    <button class="tc-sort${b.altLetter === L ? ' tc-sort--on' : ''}" data-tc-alt="${esc(L)}"
            title="${esc(L)} · ${TILE_POINTS[L] ?? 0} Points">${esc(letterGlyph(L))}</button>`).join('');

  const swatch = (kind, key, label, cls) =>
    `<button class="tc-swatch ${cls}${b[kind] === key ? ' tc-swatch--on' : ''}"
             data-tc-${kind}="${key ?? ''}">${label}</button>`;

  return `
    <div class="tc-maker">
      <div class="tc-maker-preview">
        <div class="tc-preview-slot" id="tcPreview"></div>
        <div class="tc-preview-note">${buildPoints(b)} Point${buildPoints(b) === 1 ? '' : 's'} at rest</div>
        <div class="tc-strike">
          <button class="btn btn-print" data-tc-strike="1">Strike ×1</button>
          <button class="btn btn-quiet" data-tc-strike="4">×4</button>
          <button class="btn btn-quiet" id="tcReset">Reset</button>
        </div>
      </div>

      <div class="tc-maker-knobs">
        <h4 class="tc-knob-head">Sort</h4>
        <div class="tc-sorts">${letters}</div>

        <h4 class="tc-knob-head">Paint</h4>
        <div class="tc-swatches">
          ${swatch('colour', null, 'None', 'tc-swatch--none')}
          ${CHAMBER_COLOURS.map(c => swatch('colour', c, COLOURS[c].label, `tc-swatch--${c}`)).join('')}
        </div>

        <h4 class="tc-knob-head">Trim</h4>
        <div class="tc-swatches">
          ${swatch('trim', null, 'None', 'tc-swatch--none')}
          ${CHAMBER_TRIMS.map(t => swatch('trim', t, TRIMS[t].label, `tc-swatch--trim-${t}`)).join('')}
        </div>

        <h4 class="tc-knob-head">Nick</h4>
        <div class="tc-swatches">
          ${swatch('nick', null, 'None', 'tc-swatch--none')}
          ${CHAMBER_NICKS.map(n => swatch('nick', n, NICKS[n].label, 'tc-swatch--plain')).join('')}
        </div>

        <h4 class="tc-knob-head">Metal</h4>
        <div class="tc-swatches">
          ${swatch('material', null, 'Lead', 'tc-swatch--none')}
          ${CHAMBER_MATERIALS.map(mt => swatch('material', mt, MATERIALS[mt].label, `tc-swatch--mat-${mt}`)).join('')}
        </div>

        <h4 class="tc-knob-head">Grown Points
          <span class="market-sub">+${b.bonusPoints ?? 0}</span>
          <button class="btn btn-quiet tc-mini" data-tc-grow="1">+1</button>
          <button class="btn btn-quiet tc-mini" data-tc-grow="5">+5</button>
          <button class="btn btn-quiet tc-mini" data-tc-grow="-99">0</button>
        </h4>

        <h4 class="tc-knob-head">Second face
          <button class="btn btn-quiet tc-mini${b.letterType === 'dual' ? ' tc-mini--on' : ''}"
                  data-tc-dual="${b.letterType === 'dual' ? '0' : '1'}"
                  ${canBeDual(b.letter) ? '' : 'disabled'}>${
            b.letterType === 'dual' ? 'Two-faced' : 'One face'}</button>
        </h4>
        ${b.letterType === 'dual' ? `<div class="tc-sorts">${alts}</div>` : ''}
      </div>
    </div>

    <h3 class="market-sec">The case
      <span class="market-sub">${state.collection.length} tile${state.collection.length === 1 ? '' : 's'} — click one to scrap it</span>
      <button class="btn btn-quiet tc-mini" id="tcScrapAll">Empty it</button>
    </h3>
    <div class="mini-grid mini-grid--case" id="tcCase"></div>`;
}

// The preview tile and the case grid are real tile elements, so what the chamber
// shows is what the board would draw.
function renderChamberTiles() {
  const slot = $('tcPreview');
  if (slot) {
    slot.innerHTML = '';
    slot.appendChild(makeTileEl({ ...(chamber.build ?? freshBuild()), id: '' }, 'chamber'));
  }
  const grid = $('tcCase');
  if (!grid) return;
  grid.innerHTML = '';
  for (const tmpl of state.collection) {
    const el = makeTileEl({ ...tmpl, id: '' }, 'chamber', { mini: true });
    el.dataset.tcScrap = tmpl.tid;
    grid.appendChild(el);
  }
}

// ─── Experimental ─────────────────────────────────────────────────────────────
// Mechanics that were built and then kept out of the main game. Switching one on
// is a decision about THIS run, saved with it, so a folio always knows what it
// was played with.

function chamberLabsHTML() {
  const cards = EXPERIMENTS.map(x => {
    const on = experimentOn(x.id);
    return `
      <div class="tc-lab${on ? ' tc-lab--on' : ''}" data-tc-lab="${x.id}">
        <div class="tc-lab-head">
          <span class="tc-lab-name">${esc(x.name)}</span>
          <span class="tc-lab-state">${on ? 'ON' : 'OFF'}</span>
        </div>
        <p class="tc-lab-blurb">${esc(x.blurb)}</p>
        ${x.note ? `<p class="tc-lab-note">${esc(x.note)}</p>` : ''}
      </div>`;
  }).join('') || '<p class="sheet-note">Nothing on the bench just now.</p>';

  return `
    <h3 class="market-sec">Off the main game
      <span class="market-sub">click to switch one on for this run</span>
    </h3>
    <div class="tc-labs">${cards}</div>
    <p class="sheet-note">These are kept rather than thrown away. A switch here belongs
      to this run and is saved with it — a plain new game never meets one.</p>`;
}

// ─── Run ──────────────────────────────────────────────────────────────────────

function chamberRunHTML() {
  return `
    <h3 class="market-sec">The page</h3>
    <div class="tc-rows">
      <label class="tc-row">Quota
        <input class="tc-num" type="number" data-tc-field="quota" value="${state.quota}"></label>
      <label class="tc-row">Score so far
        <input class="tc-num" type="number" data-tc-field="pageScore" value="${state.pageScore}"></label>
      <label class="tc-row">Words left
        <input class="tc-num" type="number" data-tc-field="wordsLeft" value="${state.wordsLeft}"></label>
      <label class="tc-row">Discards
        <input class="tc-num" type="number" data-tc-field="discards" value="${state.discards}"></label>
      <label class="tc-row">Chapter
        <input class="tc-num" type="number" data-tc-field="chapter" value="${state.chapter}"></label>
      <label class="tc-row">Page
        <input class="tc-num" type="number" data-tc-field="page" value="${state.page}"></label>
    </div>
    <p class="sheet-note">Written straight in. The board redraws when you close the chamber;
      a quota or a word count you change here takes hold on this page, not the next.</p>`;
}

// ─── Click handling ───────────────────────────────────────────────────────────
// Game flow is main.js's business, injected here so the sheets never need to
// know about pages and chapters.

let flow = { nextPage: () => {}, beginRun: () => {}, openMarket: () => {},
             openBlackMarket: () => {}, leaveChamber: () => {} };

// The clones ride the #fx layer, which sits above the modal.
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
      sfx.coin();
      log(r.married
        ? `${r.parted.join(' and ')} will not be kept apart. Both leave the shelf, and ${r.married} take the seat between them.`
        : r.ghost
        ? `${r.name} was already dead — it works on from the graveyard, and takes no seat.`
        : `${r.name} takes a seat at your table.`, 'good');
      // To the sheet's own shelf strip — the board's is under the modal.
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
      log(logLine('compostLifted'), 'good');
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
      sfx.coin();
      log(r.pack > 1 ? logLine('quireBought', r.pack) : logLine('tileBought'), 'good');
      // A quire sends all three sorts to the bag, not just the one on top.
      for (const el of card?.querySelectorAll('.tile') ?? []) flyPurchase(el, $('bagBtn'));
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
      // Named from sundryTip so every kind says the right thing. COLOURS[colour]
      // exists only for tubes — reading it for a colourless sundry throws.
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
    if (r.reason) { log(r.reason, 'warn'); return; }
    if (r.ok) {
      sfx.coin();
      log(logLine(r.refund === 1 ? 'marketDeparts1' : 'marketDeparts', r.name, r.refund));
      if (r.headsman) log(logLine('headsmanNow', r.headsman.mult));
      renderAll(); renderMarket();
    }
    return;
  }
  const sellS = e.target.closest('[data-sell-sundry]');
  if (sellS) {
    const r = sellSundry(Number(sellS.dataset.sellSundry));
    if (r.ok) {
      sfx.coin();
      log(logLine('soldBack', r.refund));
      renderAll(); renderMarket();
    }
    return;
  }
  // A tap on a seated card (not its ✕, caught above) shows the calling card,
  // whose Dismiss button main.js handles.
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
    sfx.page();
    renderMarket();
    return;
  }
  if (e.target.closest('#btnStallBack')) {
    market.view = 'shop'; market.activeStall = null; market.returning = true; sfx.page(); renderMarket();
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
      // paintTile and trashFromCollection can queue echoes (The Dabbler, The
      // Revenant); drain them here, since main.js never sees this action.
      for (const e of takePaintEchoes()) {
        log(logLine('dabblerSplash', e.letter, COLOURS[e.colour].label.toLowerCase()), 'good');
      }
      for (const e of takeGhostEchoes()) {
        log(logLine('revenantCase', e.letter), 'good');
      }
      // Back to the market, where the stall card's risen price can be seen.
      market.view = 'shop'; market.activeStall = null; market.stallSel = -1;
      market.returning = true;
      sfx.page();
    }
    renderAll(); renderMarket();   // full rebuild: the price and grid both changed
    return;
  }

  // ── Collection (read-only) ──────────────────────────────────────────────────
  if (e.target.closest('#btnOpenCollection')) {
    market.view = 'collection'; sfx.page(); renderMarket();
    return;
  }
  if (e.target.closest('#btnCollectionBack')) {
    market.view = 'shop'; market.returning = true; sfx.page(); renderMarket();
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
  // The alley stands between the Colophon and the fair; its own Leave button
  // carries on to the Market, so both roads end in the same place.
  if (r.def.kind === 'blackmarket') flow.openBlackMarket();
  else                              flow.openMarket();
}

async function skipColophon() {
  if (state.isAnimating) return;
  applyColophonSkip();

  state.isAnimating = true;
  sfx.coin();
  renderAll();
  log(logLine('colophonSkipped', SKIP_COIN_GRANT), 'good');

  await sleep(420);
  closeColophon();
  renderColophon();
  state.isAnimating = false;
  flow.openMarket();
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

// ─── Testing Chamber actions ──────────────────────────────────────────────────
// One handler for four tabs. Every branch ends the same way — redraw the sheet,
// redraw the board, save — because a chamber that got out of step with the state
// it writes would be worse than no chamber.

function onChamberClick(e) {
  const hit = sel => e.target.closest(`[${sel}]`);
  let touched = true;

  const tab = hit('data-tc-tab');
  if (tab) { chamber.tab = tab.dataset.tcTab; sfx.page(); return finishChamber(); }

  const coins = hit('data-tc-coins');
  if (coins) {
    const n = Number(coins.dataset.tcCoins);
    grantCoins(n === -999999 ? -state.coins : n);
    sfx.coin();
    return finishChamber();
  }

  // ── Patrons
  const seat = hit('data-tc-seat');
  if (seat) {
    const r = seatPatron(seat.dataset.tcSeat);
    if (r.ok) { sfx.draw(); log(logLine('chamberSeat', patronName(r.def, r.seat.data))); }
    else sfx.bad();
    return finishChamber();
  }
  const haunt = hit('data-tc-haunt');
  if (haunt) {
    const r = hauntPatron(haunt.dataset.tcHaunt);
    if (r.ok) { sfx.draw(); log(logLine('chamberHaunt', patronName(r.def, r.seat.data))); }
    else sfx.bad();
    return finishChamber();
  }
  const unseat = hit('data-tc-unseat');
  if (unseat) { unseatPatron(Number(unseat.dataset.tcUnseat)); sfx.bad(); return finishChamber(); }
  const unhaunt = hit('data-tc-unhaunt');
  if (unhaunt) {
    const uid = Number(unhaunt.dataset.tcUnhaunt);
    const i = (state.ghosts ?? []).findIndex(g => g.uid === uid);
    if (i >= 0) state.ghosts.splice(i, 1);
    sfx.bad();
    return finishChamber();
  }
  const seats = hit('data-tc-seats');
  if (seats) { addSeats(Number(seats.dataset.tcSeats)); sfx.draw(); return finishChamber(); }

  // ── Sundries
  const sundry = hit('data-tc-sundry');
  if (sundry) {
    giveSundry(CHAMBER_SUNDRIES[Number(sundry.dataset.tcSundry)]);
    sfx.draw();
    return finishChamber();
  }
  const drop = hit('data-tc-drop');
  if (drop) { dropSundry(Number(drop.dataset.tcDrop)); sfx.bad(); return finishChamber(); }
  const slots = hit('data-tc-slots');
  if (slots) { addBenchSlots(Number(slots.dataset.tcSlots)); sfx.draw(); return finishChamber(); }

  // ── The tile-maker. The knobs all write through setBuild, which is what keeps
  //    a one-faced sort from keeping a second letter it can no longer show.
  const letter = hit('data-tc-letter');
  if (letter) { setBuild({ letter: letter.dataset.tcLetter }); sfx.draw(); return finishChamber(); }
  const alt = hit('data-tc-alt');
  if (alt) { setBuild({ altLetter: alt.dataset.tcAlt }); sfx.draw(); return finishChamber(); }
  for (const knob of ['colour', 'trim', 'nick', 'material']) {
    const el = hit(`data-tc-${knob}`);
    if (el) { setBuild({ [knob]: el.dataset[`tc${knob[0].toUpperCase()}${knob.slice(1)}`] || null });
              sfx.draw(); return finishChamber(); }
  }
  const grow = hit('data-tc-grow');
  if (grow) {
    const n = Number(grow.dataset.tcGrow);
    const at = chamber.build?.bonusPoints ?? 0;
    setBuild({ bonusPoints: n === -99 ? 0 : Math.max(0, at + n) });
    sfx.draw();
    return finishChamber();
  }
  const dual = hit('data-tc-dual');
  if (dual && !dual.disabled) {
    const on = dual.dataset.tcDual === '1';
    setBuild(on ? { letterType: 'dual', altLetter: chamber.build?.altLetter ?? 'A' }
                : { letterType: 'normal' });
    sfx.draw();
    return finishChamber();
  }
  const strike = hit('data-tc-strike');
  if (strike) {
    const n = Number(strike.dataset.tcStrike);
    strikeTile(chamber.build ?? freshBuild(), n);
    sfx.draw();
    log(logLine('chamberStruck', tileCount(n)));
    return finishChamber();
  }
  if (e.target.closest('#tcReset')) { chamber.build = freshBuild(); sfx.draw(); return finishChamber(); }
  const scrap = hit('data-tc-scrap');
  if (scrap) { scrapTile(Number(scrap.dataset.tcScrap)); sfx.bad(); return finishChamber(); }
  if (e.target.closest('#tcScrapAll')) {
    log(logLine('chamberScrapped', tileCount(scrapAllTiles())));
    sfx.bad();
    return finishChamber();
  }

  // ── Experiments
  const lab = hit('data-tc-lab');
  if (lab) {
    const id = lab.dataset.tcLab;
    const on = toggleExperiment(id);
    // The tile-maker may be holding a sort the experiment just took away.
    if (!on && chamber.build && !chamberLetters().includes(chamber.build.letter)) {
      chamber.build = freshBuild();
    }
    sfx[on ? 'draw' : 'bad']();
    log(logLine('chamberExperiment', EXPERIMENTS.find(x => x.id === id)?.name ?? id, on ? 'on' : 'off'));
    return finishChamber();
  }

  // ── Leaving
  if (e.target.closest('#btnChamberBegin')) return flow.beginRun();
  if (e.target.closest('#btnChamberClose')) return flow.leaveChamber();

  touched = false;
  if (!touched) return;
}

// The Run tab's fields are typed, not clicked.
function onChamberInput(e) {
  const field = e.target.closest('[data-tc-field]');
  if (field) {
    const n = Number(field.value);
    if (Number.isFinite(n)) { state[field.dataset.tcField] = n; renderAll(); persist(); }
    return;
  }
  if (e.target.id === 'tcFilter') {
    chamber.filter = e.target.value;
    const at = e.target.selectionStart;
    renderChamber();
    const again = $('tcFilter');
    if (again) { again.focus(); again.setSelectionRange(at, at); }
  }
}

function finishChamber() {
  renderChamber();
  renderAll();
  persist();
}

// ─── Wiring ───────────────────────────────────────────────────────────────────

export function initSheets(flowCallbacks) {
  flow = { ...flow, ...flowCallbacks };
  $('marketModal')?.addEventListener('click', onMarketClick);
  $('blackMarketModal')?.addEventListener('click', onBlackMarketClick);
  $('colophonModal')?.addEventListener('click', onColophonClick);
  $('chamberModal')?.addEventListener('click', onChamberClick);
  $('chamberModal')?.addEventListener('input', onChamberInput);
}
