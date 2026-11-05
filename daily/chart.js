// The field, drawn: every word the case could set as one curve — score
// against place — with the printed word marked on it. The best word is at the
// RIGHT, so the curve climbs as the words get better and a better word sits
// further along, the way a reader expects "more" to go (it ran best-first,
// left to right, until 5 November, and a good word looked like a retreat).
//
// The place runs on a log axis anchored at the top 1%: log(1 + place ÷ one
// per cent of the field). Below the 1% mark it is an ordinary log axis, fine
// at the top and broad underneath, because the difference between 900th and
// 1,000th is no story at all. Above it the axis turns linear, so the top 1%
// takes about a sixth of the width. A plain log axis gave it two fifths, and
// a word in the top 1.5% sat halfway along, looking much further down the
// field than it was. Score runs linear, so the drop from the head of the
// field to its body reads at its real size.
//
// Emphasis, not categories: the field is one gray series and the printed word
// is the one mark in the press's red (validated against the paper — see the
// dataviz notes in README.md). One series, so no legend; the title names it.

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent?.appendChild(e);
  return e;
};

const niceStep = max => {
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
};
// One style per axis: compact throughout once the axis reaches ten thousand.
const fmtFor = top => (top >= 10000
  ? n => (n ? `${+(n / 1000).toFixed(1)}K` : '0')
  : n => n.toLocaleString('en-GB'));

// ranked: [{ word, score }] best first — or, for a field too big to hold as
// objects (every pair a two-word case could set), { length, get(i) } giving
// the same shape on demand. you: { rank, score, label }.
export function drawField(host, ranked, you, { onFocusRank, xLabel = '' } = {}) {
  host.replaceChildren();
  const at = Array.isArray(ranked) ? i => ranked[i] : ranked.get;
  const N = ranked.length;
  if (!N) return;
  const W = Math.max(280, host.clientWidth || 320);
  const H = xLabel ? 190 : 176;
  const m = { l: 40, r: 12, t: 16, b: xLabel ? 34 : 22 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const maxS = Math.max(1, at(0).score);
  const step = niceStep(maxS);
  const yTop = Math.ceil(maxS / step) * step;

  const c = Math.max(1, N / 100);
  const span = Math.log1p(Math.max(1, N - 1) / c);
  // Place 1 at the right edge, the last place at the left.
  const x = rank => m.l + iw - (Math.log1p((rank - 1) / c) / span) * iw;
  const y = s => m.t + ih - (s / yTop) * ih;
  const rankAt = px => Math.min(N, Math.max(1, Math.round(1 + c * Math.expm1(((m.l + iw - px) / iw) * span))));

  const svg = el('svg', {
    viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'field-svg',
    role: 'img', tabindex: '0',
    'aria-label': `${N} settings, the best at the right. Yours is ${you.label} at place ${you.rank}.`,
  }, host);

  // Gridlines and y ticks — hairline, recessive.
  const fmt = fmtFor(yTop);
  for (let s = 0; s <= yTop + 1e-9; s += step) {
    el('line', { x1: m.l, x2: W - m.r, y1: y(s), y2: y(s), class: 'field-grid' }, svg);
    const t = el('text', { x: m.l - 6, y: y(s) + 3.5, class: 'field-tick', 'text-anchor': 'end' }, svg);
    t.textContent = fmt(s);
  }

  // The brackets the field is reported in, where they fall inside it, from
  // the top 1% (near the right) down. 50% and 100% sit close, and 100%'s
  // label hangs right of its line (the left edge), so a guide with no room for
  // its label after the one before is left out rather than printed over it:
  // on a phone that is the 100%, and the curve meeting the edge says as much.
  const marks = [1, 10, 50, 100].filter(p => (p / 100) * N >= 1);
  let lastGuide = Infinity;
  for (const p of marks) {
    const px = x(Math.max(1, (p / 100) * N));
    if (lastGuide - px < (p === 100 ? 52 : 34)) continue;
    lastGuide = px;
    el('line', { x1: px, x2: px, y1: m.t, y2: m.t + ih, class: 'field-guide' }, svg);
    const t = el('text', { x: px, y: H - m.b + 15, class: 'field-tick', 'text-anchor': p === 100 ? 'start' : 'middle' }, svg);
    t.textContent = `${p}%`;
  }
  if (xLabel) el('text', { x: m.l, y: H - 4, class: 'field-axis' }, svg).textContent = xLabel;

  // The curve. Sampled per pixel column rather than per word: a field of
  // fifteen thousand words is fifteen thousand points nobody can see.
  const pts = [];
  let lastPx = -1;
  for (let r = 1; r <= N; r++) {
    const px = Math.round(x(r));
    if (px === lastPx && r !== N) continue;
    lastPx = px;
    pts.push([x(r), y(at(r - 1).score)]);
  }
  const line = pts.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)},${b.toFixed(1)}`).join('');
  el('path', { d: `${line}L${pts[pts.length - 1][0].toFixed(1)},${y(0)}L${pts[0][0].toFixed(1)},${y(0)}Z`, class: 'field-area' }, svg);
  el('path', { d: line, class: 'field-line' }, svg);

  // You.
  const yx = x(you.rank), yy = y(you.score);
  el('line', { x1: yx, x2: yx, y1: yy, y2: m.t + ih, class: 'field-you-drop' }, svg);
  el('circle', { cx: yx, cy: yy, r: 5, class: 'field-you' }, svg);
  const lab = el('text', {
    x: yx + (yx > m.l + iw * 0.6 ? -9 : 9), y: Math.max(m.t + 10, yy - 8),
    class: 'field-you-label', 'text-anchor': yx > m.l + iw * 0.6 ? 'end' : 'start',
  }, svg);
  lab.textContent = you.label;

  // The hover layer: a crosshair that snaps to the nearest place, and one
  // tooltip that names the word there. Keyboard steps it the same way.
  const cross = el('line', { y1: m.t, y2: m.t + ih, class: 'field-cross', visibility: 'hidden' }, svg);
  const dot = el('circle', { r: 4, class: 'field-dot', visibility: 'hidden' }, svg);
  const tip = document.createElement('div');
  tip.className = 'field-tip';
  tip.hidden = true;
  host.appendChild(tip);

  let focus = you.rank;
  const show = rank => {
    focus = rank;
    const w = at(rank - 1);
    const px = x(rank), py = y(w.score);
    cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', px); dot.setAttribute('cy', py); dot.setAttribute('visibility', 'visible');
    tip.replaceChildren();
    const v = document.createElement('b'); v.textContent = w.score.toLocaleString('en-GB');
    const k = document.createElement('span'); k.textContent = `${w.word ? `${w.word} · ` : ''}#${rank.toLocaleString('en-GB')}`;
    tip.append(v, k);
    tip.hidden = false;
    const left = Math.min(W - 8 - tip.offsetWidth, Math.max(8, px - tip.offsetWidth / 2));
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(0, py - tip.offsetHeight - 12)}px`;
    onFocusRank?.(rank);
  };
  const hide = () => {
    cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); tip.hidden = true;
  };
  svg.addEventListener('pointermove', e => {
    const r = svg.getBoundingClientRect();
    show(rankAt(((e.clientX - r.left) / r.width) * W));
  });
  svg.addEventListener('pointerleave', hide);
  svg.addEventListener('focus', () => show(focus));
  svg.addEventListener('blur', hide);
  svg.addEventListener('keydown', e => {
    // A step is one place near the top and a growing stride further down,
    // so the arrows cross the log axis at an even pace. Right is better, and
    // Home and End are the left and right edges, as the arrows are.
    const stride = Math.max(1, Math.round(focus * 0.08));
    if (e.key === 'ArrowLeft')  { show(Math.min(N, focus + stride)); e.preventDefault(); }
    if (e.key === 'ArrowRight') { show(Math.max(1, focus - stride)); e.preventDefault(); }
    if (e.key === 'Home')       { show(N); e.preventDefault(); }
    if (e.key === 'End')        { show(1); e.preventDefault(); }
  });
}
