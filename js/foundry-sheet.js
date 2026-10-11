// THE FOUNDRY, the sheet — crates, the stock, the founts and the distinctions.
// The state and its rules are js/foundry.js; this is only the face and the
// clicks. It opens from the prospectus, over it, and hands back to it: the
// prospectus is the only place a fount can be chosen for a run that exists.
//
// The crate is the part built to be enjoyed. The lid comes up on six sorts
// lying face down, each glowing faintly in its grade's colour — so the crate
// tells you it holds something good before it tells you what — and they turn
// one tap at a time, in order, ending on the best. The sorts are in the stock
// the moment the lid is up (openCrate); the turning is only the showing.

import {
  foundry, openCrate, buyCrate, sellSort, stockByUid, fountsUsing,
  allFounts, fountById, fountCase, selectFount, newFount, renameFount, deleteFount,
  swapIn, swapOut, isDressed, gradeOf, saleValue, distinctionDesc, rewardText, stockPiles,
  signature,
  CRATE_PRICE, FOUNT_DRESSED_MAX,
} from './foundry.js';
import { DISTINCTIONS, FOUNT_MAX } from './constants.js';
import { FOUNDRY_TEXT as FT, GRADE_TEXT, fillSlots } from './text.js';
import { makeTileEl, tileFeatures, hidePopover } from './render.js';
import { pickCardHTML } from './appearance.js';
import { sfx, sparkleBurst, popReveal, sleep } from './anim.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const plural = (n, one, many) => (n === 1 ? one : fillSlots(many, n));

export const foundrySheet = {
  open: false,
  tab: 'crates',      // 'crates' | 'stock' | 'founts' | 'honours'
  reveal: null,       // the crate being shown: { kind, sorts, turned: Set<index>, sold: Map<uid, ems> }
  filter: 'all',      // the stock's: 'all' | 'dressed' | 'plain'
  editing: null,      // the id of the fount open in the editor
  pickOut: null,      // the house letter chosen to come out, in the editor
  pickIn: null,       // the stock uid chosen to go in, in the editor
  notice: '',         // a refusal, said once under the editor's note
  looking: null,      // the signature of the stock pile laid out in the detail panel
};

let flow = { back: () => {}, fountsChanged: () => {} };

export function openFoundry() {
  foundrySheet.open = true;
  foundrySheet.tab = foundry.crates.length || !foundry.stock.length ? 'crates' : 'stock';
  foundrySheet.reveal = null;
  foundrySheet.editing = null;
  clearPicks();
}

export function closeFoundry() {
  foundrySheet.open = false;
  foundrySheet.reveal = null;
  hidePopover();
}

function clearPicks() {
  foundrySheet.pickOut = null;
  foundrySheet.pickIn = null;
  foundrySheet.notice = '';
}

// ─── Small pieces ─────────────────────────────────────────────────────────────

export const emsHTML = n => `<span class="em-quad" aria-hidden="true"></span>${Number(n).toLocaleString()}`;

const purseHTML = () => `
  <div class="fd-purse">
    <span class="fd-ems" title="${esc(FT.emsTip)}">${emsHTML(foundry.ems)} <small>${FT.ems}</small></span>
  </div>`;

function tabsHTML() {
  const earned = Object.keys(foundry.distinctions).length;
  const tabs = [
    ['crates', FT.tabCrates, foundry.crates.length || ''],
    ['stock', FT.tabStock, foundry.stock.length || ''],
    ['founts', FT.tabFounts, foundry.founts.length || ''],
    ['honours', FT.tabHonours, `${earned}/${Object.keys(DISTINCTIONS).length}`],
  ];
  return `<div class="fd-tabs" role="tablist">${tabs.map(([id, label, n]) => `
    <button class="fd-tab${foundrySheet.tab === id ? ' fd-tab--on' : ''}" data-fd-tab="${id}" role="tab">
      ${label}${n !== '' ? ` <span class="fd-tab-n">${n}</span>` : ''}
    </button>`).join('')}</div>`;
}

// A sort as a tile element, carrying its uid so it can be read on hover/hold
// (drag.js → templateFor) and its grade so the sheet can colour around it.
function sortEl(t, { mini = true, attrs = {} } = {}) {
  const el = makeTileEl({ ...t, id: '' }, 'foundry', { mini });
  el.dataset.fdUid = t.uid ?? '';
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

// ─── The sheet ────────────────────────────────────────────────────────────────

export function renderFoundry() {
  const m = $('foundryModal');
  if (!m) return;
  if (!foundrySheet.open) { m.classList.remove('show'); m.innerHTML = ''; return; }

  m.innerHTML = `
    <div class="sheet sheet--foundry">
      <div class="sheet-head">
        <div>
          <h2>${FT.title}</h2>
          <p class="sheet-note">${FT.note}</p>
        </div>
        ${purseHTML()}
      </div>
      ${tabsHTML()}
      <div class="fd-body" id="fdBody"></div>
      <div class="market-foot">
        <button class="btn btn-quiet" id="btnFoundryBack">${FT.back}</button>
        <div class="market-spacer"></div>
      </div>
    </div>`;
  m.classList.add('show');
  renderBody();
}

function renderBody() {
  const body = $('fdBody');
  if (!body) return;
  const t = foundrySheet.tab;
  if (t === 'crates') return renderCrates(body);
  if (t === 'stock')  return renderStock(body);
  if (t === 'founts') return foundrySheet.editing ? renderEditor(body) : renderFountList(body);
  return renderHonours(body);
}

// Redraw only what a click changed when it can be kept local — the purse, the
// tab counts and the body — so the sheet's scroll position survives a sale.
function refresh() {
  const m = $('foundryModal');
  const sheet = m?.querySelector('.sheet--foundry');
  if (!sheet) return renderFoundry();
  sheet.querySelector('.fd-purse')?.replaceWith(htmlToEl(purseHTML()));
  sheet.querySelector('.fd-tabs')?.replaceWith(htmlToEl(tabsHTML()));
  renderBody();
}

function htmlToEl(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// ─── Crates ───────────────────────────────────────────────────────────────────

function renderCrates(body) {
  const r = foundrySheet.reveal;
  if (r) return renderReveal(body, r);

  const n = foundry.crates.length;
  const fine = foundry.crates.filter(k => k === 'fine').length;
  const afford = foundry.ems >= CRATE_PRICE;
  body.innerHTML = `
    <div class="fd-floor">
      ${n ? `
        <div class="fd-crate${fine ? ' fd-crate--fine' : ''}" aria-hidden="true">
          <div class="fd-crate-lid"></div>
          <div class="fd-crate-box"><span class="fd-crate-stencil">${foundry.crates[0] === 'fine' ? FT.fineLabel : FT.crateLabel}</span></div>
        </div>
        <p class="fd-floor-note">${n === 1 ? FT.waiting1 : fillSlots(FT.waiting, n)}${
          fine ? ` · ${fillSlots(FT.waitingFine, fine)}` : ''}</p>
        <button class="btn btn-print btn-big" id="btnFdOpen">${FT.open}</button>`
      : `<p class="fd-floor-note">${FT.noCrates}</p>`}
    </div>
    <div class="fd-buy">
      <button class="btn${afford ? '' : ' btn-quiet'}" id="btnFdBuy" ${afford ? '' : 'disabled'}>
        ${FT.buy} · ${emsHTML(CRATE_PRICE)}</button>
      <p class="sheet-note">${afford ? FT.crateOdds : `${FT.cantAfford} ${FT.crateOdds}`}</p>
    </div>`;
}

function renderReveal(body, r) {
  const all = r.turned.size === r.sorts.length;
  const worth = r.sorts.reduce((s, x) => s + x.value, 0);
  body.innerHTML = `
    <div class="fd-floor fd-floor--open${r.kind === 'fine' ? ' fd-floor--fine' : ''}">
      ${r.kind === 'fine' ? `<p class="fd-fine-banner">${FT.fineCrate}</p>` : ''}
      <div class="fd-haul" id="fdHaul"></div>
      <p class="fd-floor-note">${all ? fillSlots(FT.haulWorth, worth) : FT.tapToTurn}</p>
      <div class="fd-reveal-actions">
        ${all
          ? `<button class="btn btn-quiet" id="btnFdDone">${FT.intoStock}</button>
             ${foundry.crates.length ? `<button class="btn btn-print" id="btnFdOpen">${FT.openNext}</button>` : ''}`
          : `<button class="btn btn-quiet" id="btnFdTurnAll">${FT.turnAll}</button>`}
      </div>
    </div>`;
  const haul = $('fdHaul');
  r.sorts.forEach((s, i) => haul.appendChild(haulSlot(s, i, r)));
}

function haulSlot(s, i, r) {
  const slot = document.createElement('div');
  slot.className = `fd-slot fd-slot--${s.grade}`;
  slot.dataset.fdTurn = i;
  if (!r.turned.has(i)) {
    slot.innerHTML = `<div class="fd-back fd-back--${s.grade}"><span>❦</span></div>`;
    return slot;
  }
  slot.classList.add('fd-slot--up');
  const sold = r.sold.get(s.uid);
  const tile = sortEl({ ...s.tmpl, uid: sold == null ? s.uid : '' }, { mini: false });
  slot.appendChild(tile);
  slot.insertAdjacentHTML('beforeend', `
    <div class="fd-grade fd-grade--${s.grade}">${GRADE_TEXT[s.grade]}</div>
    ${s.isNew ? `<div class="fd-new">${FT.isNew}</div>` : ''}
    ${sold != null
      ? `<div class="fd-sold">${FT.sold} +${emsHTML(sold)}</div>`
      : `<button class="btn btn-quiet fd-sell-mini" data-fd-sell-haul="${s.uid}">${FT.sellMini} ${emsHTML(s.value)}</button>`}`);
  return slot;
}

async function turn(i, { quiet = false } = {}) {
  const r = foundrySheet.reveal;
  if (!r || r.turned.has(i)) return;
  r.turned.add(i);
  const s = r.sorts[i];
  const old = document.querySelector(`[data-fd-turn="${i}"]`);
  const next = haulSlot(s, i, r);
  if (old) old.replaceWith(next); else renderBody();
  const tile = next.querySelector('.tile');
  popReveal(tile);
  if (!quiet || s.grade !== 'plain') sfx.reveal(s.grade);
  if (s.grade === 'rare' || s.grade === 'masterwork') sparkleBurst(tile, s.grade === 'masterwork' ? 28 : 16);
  else if (s.grade === 'fine') sparkleBurst(tile, 7);
  if (r.turned.size === r.sorts.length) {
    // Every sort is up: the actions under the haul change, so the body redraws
    // — after a beat, so the last flourish isn't cut off by it.
    await sleep(380);
    if (foundrySheet.reveal === r) refresh();
  }
}

async function turnAll() {
  const r = foundrySheet.reveal;
  if (!r) return;
  for (let i = 0; i < r.sorts.length; i++) {
    if (r.turned.has(i)) continue;
    if (foundrySheet.reveal !== r) return;
    await turn(i, { quiet: true });
    await sleep(r.sorts[i].grade === 'plain' ? 140 : 420);
  }
}

async function prise() {
  const result = openCrate();
  if (!result) return;
  sfx.prise();
  const lid = document.querySelector('.fd-crate');
  if (lid) { lid.classList.add('fd-crate--prised'); await sleep(420); }
  foundrySheet.reveal = { ...result, turned: new Set(), sold: new Map() };
  refresh();
  if (result.kind === 'fine') { sfx.chapter(); sparkleBurst(document.querySelector('.fd-fine-banner'), 20); }
  for (const a of result.awarded) say(a.line);
}

// A line of news at the foot of the sheet's head — a distinction earned at
// the Foundry, said where the player is looking rather than on the board.
function say(line) {
  const head = document.querySelector('.sheet--foundry .sheet-head');
  if (!head) return;
  head.querySelector('.fd-news')?.remove();
  head.insertAdjacentHTML('beforeend', `<p class="fd-news">${esc(line)}</p>`);
  sfx.gain();
}

// ─── The stock ────────────────────────────────────────────────────────────────

function renderStock(body) {
  const n = foundry.stock.length;
  if (!n) { body.innerHTML = `<p class="sheet-note fd-empty">${FT.stockEmpty}</p>`; return; }
  const f = foundrySheet.filter;
  const all = stockPiles();
  const piles = all.filter(([t]) =>
    f === 'all' || (f === 'dressed' ? isDressed(t) : !isDressed(t)));
  const looked = all.find(p => signature(p[0]) === foundrySheet.looking) ?? null;
  if (!looked) foundrySheet.looking = null;
  body.innerHTML = `
    <p class="sheet-note">${fillSlots(FT.stockNote, n)}</p>
    <div class="fd-filters">
      ${['all', 'dressed', 'plain'].map(id => `
        <button class="fd-filter${f === id ? ' fd-filter--on' : ''}" data-fd-filter="${id}">${
          FT[`filter${id[0].toUpperCase()}${id.slice(1)}`]}</button>`).join('')}
    </div>
    ${looked ? detailHTML(looked) : ''}
    <div class="mini-grid fd-grid" id="fdStockGrid"></div>`;
  if (looked) $('fdDetailTile')?.appendChild(sortEl(looked[0], { mini: false }));
  const grid = $('fdStockGrid');
  for (const pile of piles) {
    const el = pileEl(pile, { 'data-fd-look': signature(pile[0]) });
    if (pile === looked) el.classList.add('fd-picked');
    grid.appendChild(el);
  }
}

// A pile of identical sorts: the top one, with how many lie under it.
function pileEl(pile, attrs) {
  const t = pile[0];
  const el = sortEl(t, { attrs });
  el.classList.add(`fd-tile--${gradeOf(t)}`);
  if (pile.length > 1) el.insertAdjacentHTML('beforeend', `<span class="fd-pile">×${pile.length}</span>`);
  return el;
}

// The pile being looked at, laid out above the stock: what it carries, how
// many there are, which founts use it, and what it sells for. A panel rather
// than a popover, so it stays put while the pointer goes to its buttons.
function detailHTML(pile) {
  const t = pile[0];
  const feats = tileFeatures(t);
  // The spares are the sorts no fount is using; they are sold first, so
  // selling from a pile leaves every fount as it was for as long as it can.
  const spare = pile.filter(x => !fountsUsing(x.uid).length);
  const using = [...new Set(pile.flatMap(x => fountsUsing(x.uid).map(f => f.name)))];
  const one = spare[0] ?? t;
  const each = saleValue(t);
  return `
    <div class="fd-detail">
      <div class="fd-detail-tile" id="fdDetailTile"></div>
      <div class="fd-detail-text">
        <div class="fd-detail-head">
          <span class="fd-grade fd-grade--${gradeOf(t)}">${GRADE_TEXT[gradeOf(t)]}</span>
          ${pile.length > 1 ? `<span class="fd-detail-n">${fillSlots(FT.pileOf, pile.length)}</span>` : ''}
        </div>
        ${feats.length
          ? feats.map(x => `<div class="fd-detail-feat"><b>${x.head}.</b> ${x.body}</div>`).join('')
          : `<div class="fd-detail-feat">${FT.plainSort}</div>`}
        ${using.length ? `<div class="fd-detail-feat fd-detail-use">${esc(fillSlots(
          spare.length ? FT.someInFounts : FT.inFounts, using.join(', ')))}</div>` : ''}
        <div class="fd-detail-acts">
          <button class="btn" data-fd-sell-confirm="${one.uid}">${fillSlots(FT.sellFor, emsHTML(each))}</button>
          ${spare.length > 1 ? `<button class="btn btn-quiet" data-fd-sell-confirm="${
            spare.map(x => x.uid).join(',')}">${fillSlots(FT.sellSpares, spare.length, emsHTML(each * spare.length))}</button>` : ''}
        </div>
      </div>
    </div>`;
}

function sell(uid, anchor = null) {
  const value = sellSort(uid);
  if (!value) return 0;
  sfx.coin(5);
  if (anchor) sparkleBurst(anchor, 5);
  flow.fountsChanged();
  return value;
}

// ─── The founts ───────────────────────────────────────────────────────────────

function fountBlurb(f) {
  if (f.house) return FT.houseBlurb;
  const c = fountCase(f);
  return fillSlots(FT.fountBlurb, c.swapped, c.dressed);
}

// The prospectus's row: every fount as a pick card. Shared with js/sheets.js so
// the two lists cannot disagree about what a fount is called or holds.
export const fountPicksHTML = attr => allFounts()
  .map(f => pickCardHTML(attr, f.id, esc(f.name), fountBlurb(f), f.id === foundry.selected))
  .join('');

function renderFountList(body) {
  const founts = allFounts();
  body.innerHTML = `
    <p class="sheet-note">${FT.fountsNote}</p>
    <div class="fd-founts">
      ${founts.map(f => `
        <div class="fd-fount${f.id === foundry.selected ? ' fd-fount--on' : ''}">
          <div class="fd-fount-text">
            <span class="fd-fount-name">${esc(f.name)}</span>
            <span class="fd-fount-blurb">${fountBlurb(f)}</span>
          </div>
          <div class="fd-fount-acts">
            ${f.id === foundry.selected
              ? `<span class="fd-fount-inuse">${FT.inUse}</span>`
              : `<button class="btn btn-quiet" data-fd-use="${f.id}">${FT.useFount}</button>`}
            ${f.house ? '' : `<button class="btn" data-fd-edit="${f.id}">${FT.editFount}</button>`}
          </div>
        </div>`).join('')}
    </div>
    <div class="fd-buy">
      ${foundry.founts.length < FOUNT_MAX
        ? `<button class="btn btn-print" id="btnFdNewFount">${FT.newFount}</button>`
        : `<p class="sheet-note">${FT.fountsFull}</p>`}
    </div>`;
}

function renderEditor(body) {
  const f = fountById(foundrySheet.editing);
  if (!f || f.house) { foundrySheet.editing = null; return renderFountList(body); }
  const c = fountCase(f);
  const full = c.dressed >= FOUNT_DRESSED_MAX;
  const status = foundrySheet.notice
    || (foundrySheet.pickOut ? fillSlots(FT.takingOut, foundrySheet.pickOut) : '')
    || (foundrySheet.pickIn ? fillSlots(FT.puttingIn, stockByUid(foundrySheet.pickIn)?.letter ?? '') : '');

  body.innerHTML = `
    <div class="fd-edit-head">
      <label class="fd-rename">${FT.rename}
        <input type="text" maxlength="32" value="${esc(f.name)}" data-fd-rename="${f.id}" />
      </label>
      <div class="fd-counts">
        <span class="fd-count${full ? ' fd-count--full' : ''}">${fillSlots(FT.dressedCount, c.dressed)}</span>
        <span class="fd-count">${fillSlots(FT.swappedCount, c.swapped)}</span>
        <span class="fd-count">${fillSlots(FT.vowels, c.vowels)}</span>
      </div>
    </div>
    <p class="sheet-note">${FT.editNote}</p>
    <p class="fd-status${foundrySheet.notice ? ' fd-status--warn' : ''}">${esc(status) || '&nbsp;'}</p>
    <h3 class="market-sec">${FT.inFount}<span class="market-sub">${c.places.length}</span></h3>
    <div class="mini-grid fd-grid fd-grid--fount" id="fdFountGrid"></div>
    <h3 class="market-sec">${FT.fromStock}</h3>
    <div class="mini-grid fd-grid" id="fdPickGrid"></div>
    <div class="fd-edit-foot">
      <button class="btn btn-quiet fd-danger" data-fd-delete="${f.id}">${FT.deleteFount}</button>
      ${f.id === foundry.selected
        ? `<span class="fd-fount-inuse">${FT.inUse}</span>`
        : `<button class="btn btn-quiet" data-fd-use="${f.id}">${FT.useFount}</button>`}
      <button class="btn btn-print" id="btnFdDoneEdit">${FT.doneEditing}</button>
    </div>`;

  const grid = $('fdFountGrid');
  let pickedShown = false;
  for (const p of c.places) {
    const el = sortEl(p.uid ? stockByUid(p.uid) : p.t);
    if (p.uid) {
      el.classList.add('fd-place--in', `fd-tile--${gradeOf(p.t)}`);
      el.insertAdjacentHTML('beforeend', '<span class="fd-pip" aria-hidden="true"></span>');
      el.dataset.fdOutUid = p.uid;
      el.title += `\n(in place of ${p.out})`;
    } else {
      el.classList.add('fd-place--house');
      el.dataset.fdHouse = p.out;
      // Every place of one letter is the same choice; mark the first.
      if (!pickedShown && foundrySheet.pickOut === p.out) { el.classList.add('fd-picked'); pickedShown = true; }
    }
    grid.appendChild(el);
  }

  const inFount = new Set(c.places.filter(p => p.uid).map(p => p.uid));
  const pick = $('fdPickGrid');
  const piles = stockPiles(foundry.stock.filter(t => !inFount.has(t.uid)));
  if (!piles.length) {
    pick.innerHTML = `<p class="sheet-note">${foundry.stock.length ? FT.stockAllIn : FT.stockEmpty}</p>`;
  }
  for (const pile of piles) {
    const el = pileEl(pile, { 'data-fd-in': pile[0].uid });
    if (full && isDressed(pile[0])) el.classList.add('fd-off');
    if (pile.some(t => t.uid === foundrySheet.pickIn)) el.classList.add('fd-picked');
    pick.appendChild(el);
  }
}

function trySwap(out, uid) {
  const why = swapIn(foundrySheet.editing, out, uid);
  clearPicks();
  if (why) { foundrySheet.notice = FT[why] ?? ''; sfx.bad(); }
  else { sfx.place(); flow.fountsChanged(); }
  refresh();
}

// ─── Distinctions ─────────────────────────────────────────────────────────────

function renderHonours(body) {
  const ids = Object.keys(DISTINCTIONS);
  const earned = ids.filter(id => foundry.distinctions[id]).length;
  body.innerHTML = `
    <p class="sheet-note">${fillSlots(FT.honoursNote, earned, ids.length)}</p>
    <div class="fd-honours">
      ${ids.map(id => {
        const d = DISTINCTIONS[id];
        const on = !!foundry.distinctions[id];
        return `
          <div class="fd-honour${on ? ' fd-honour--on' : ''}">
            <span class="fd-honour-mark">${on ? '❦' : '·'}</span>
            <div class="fd-honour-text">
              <span class="fd-honour-name">${esc(d.name)}</span>
              <span class="fd-honour-desc">${esc(distinctionDesc(id))}</span>
            </div>
            <span class="fd-honour-reward">${on ? FT.earned : esc(rewardText({ ems: d.ems, crate: d.crate }))}</span>
          </div>`;
      }).join('')}
    </div>`;
}

// ─── Clicks ───────────────────────────────────────────────────────────────────

function onFoundryClick(e) {
  const hit = sel => e.target.closest(`[${sel}]`);
  const id = sel => e.target.closest(sel);

  const tab = hit('data-fd-tab');
  if (tab) {
    foundrySheet.tab = tab.dataset.fdTab;
    if (foundrySheet.tab !== 'crates' && foundrySheet.reveal?.turned.size === foundrySheet.reveal?.sorts.length) {
      foundrySheet.reveal = null;
    }
    clearPicks();
    sfx.page();
    return refresh();
  }
  if (id('#btnFoundryBack')) { sfx.page(); return flow.back(); }

  // ── Crates
  if (id('#btnFdOpen')) {
    if (foundrySheet.reveal) { foundrySheet.reveal = null; refresh(); }
    return prise();
  }
  if (id('#btnFdBuy')) {
    if (buyCrate()) { sfx.coin(6); refresh(); } else sfx.bad();
    return;
  }
  if (id('#btnFdTurnAll')) return turnAll();
  if (id('#btnFdDone')) { foundrySheet.reveal = null; sfx.page(); return refresh(); }
  const haulSell = hit('data-fd-sell-haul');
  if (haulSell) {
    const uid = Number(haulSell.dataset.fdSellHaul);
    const value = sell(uid, haulSell);
    if (value) foundrySheet.reveal?.sold.set(uid, value);
    return refresh();
  }
  const slot = hit('data-fd-turn');
  if (slot && !slot.classList.contains('fd-slot--up')) return turn(Number(slot.dataset.fdTurn));

  // ── Stock
  const filter = hit('data-fd-filter');
  if (filter) { foundrySheet.filter = filter.dataset.fdFilter; sfx.select(); return refresh(); }
  const look = hit('data-fd-look');
  if (look) {
    foundrySheet.looking = foundrySheet.looking === look.dataset.fdLook ? null : look.dataset.fdLook;
    sfx.select();
    return refresh();
  }
  const sellBtn = hit('data-fd-sell-confirm');
  if (sellBtn) {
    for (const uid of sellBtn.dataset.fdSellConfirm.split(',').map(Number)) sell(uid, sellBtn);
    return refresh();
  }

  // ── Founts
  const use = hit('data-fd-use');
  if (use) { selectFount(use.dataset.fdUse); sfx.select(); flow.fountsChanged(); return refresh(); }
  const edit = hit('data-fd-edit');
  if (edit) { foundrySheet.editing = edit.dataset.fdEdit; clearPicks(); sfx.page(); return refresh(); }
  if (id('#btnFdNewFount')) {
    const f = newFount();
    if (f) { foundrySheet.editing = f.id; clearPicks(); sfx.draw(); flow.fountsChanged(); }
    return refresh();
  }
  if (id('#btnFdDoneEdit')) { foundrySheet.editing = null; clearPicks(); sfx.page(); return refresh(); }
  const del = hit('data-fd-delete');
  if (del) {
    deleteFount(del.dataset.fdDelete);
    foundrySheet.editing = null;
    clearPicks();
    sfx.bad();
    flow.fountsChanged();
    return refresh();
  }
  const house = hit('data-fd-house');
  if (house) {
    const L = house.dataset.fdHouse;
    if (foundrySheet.pickIn) return trySwap(L, foundrySheet.pickIn);
    foundrySheet.notice = '';
    foundrySheet.pickOut = foundrySheet.pickOut === L ? null : L;
    sfx.select();
    return refresh();
  }
  const outUid = hit('data-fd-out-uid');
  if (outUid) {
    swapOut(foundrySheet.editing, Number(outUid.dataset.fdOutUid));
    clearPicks();
    sfx.retrieve();
    flow.fountsChanged();
    return refresh();
  }
  const inUid = hit('data-fd-in');
  if (inUid) {
    const uid = Number(inUid.dataset.fdIn);
    if (foundrySheet.pickOut) return trySwap(foundrySheet.pickOut, uid);
    foundrySheet.notice = '';
    foundrySheet.pickIn = foundrySheet.pickIn === uid ? null : uid;
    sfx.select();
    return refresh();
  }
}

function onFoundryChange(e) {
  const input = e.target.closest('[data-fd-rename]');
  if (!input) return;
  renameFount(input.dataset.fdRename, input.value);
  flow.fountsChanged();
}

export function initFoundrySheet(callbacks) {
  flow = { ...flow, ...callbacks };
  $('foundryModal')?.addEventListener('click', onFoundryClick);
  $('foundryModal')?.addEventListener('change', onFoundryChange);
}
