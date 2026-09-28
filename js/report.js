// The run report — what a tester copies and sends.
//
// Where a run is lost, and by how much, is the number a quota curve is tuned
// from, and until now it lived only in whoever was playing. The report reads it
// all off the state: each page's quota against what it scored (state.pageLog,
// written as every page ends), what it cost in words and discards, the editor at
// the desk, and the press as it stands — the table in seat order, the bench,
// the case. Plain text, in columns, so it reads the same pasted into a message
// as into a spreadsheet.

import { state, runDifficulty, saveVersion, effectivePatronSlots } from './state.js';
import { chapterLabel, sundryTip } from './constants.js';
import { patronById, patronName } from './patrons.js';
import { bossById } from './bosses.js';

const n = v => (v ?? 0).toLocaleString('en-GB');
const pad = (s, w, right = false) => (right ? String(s).padStart(w) : String(s).padEnd(w));

function standing() {
  const where = `${chapterLabel(state.chapter)}, page ${state.page}`;
  const last = state.pageLog?.at(-1);
  if (state.gameOver && last?.outcome === 'lost') {
    return `Lost on ${where}: ${n(last.score)} of a ${n(last.quota)} quota.`;
  }
  if (state.endless) return `The folio complete; now in the appendices, at ${where}.`;
  return `In progress: ${where}.`;
}

export function runReportText() {
  const lines = [];
  const edition = runDifficulty().label;
  lines.push('GREAT WORK — run report');
  lines.push(`${new Date().toISOString().slice(0, 10)} · ${edition} edition · save v${saveVersion}`);
  lines.push(standing());
  const some = (k, one, many) => `${n(k)} ${k === 1 ? one : many}`;
  lines.push(`${some(state.stats.pages, 'page', 'pages')} cleared · ${some(state.stats.words, 'word', 'words')} · ${n(state.totalScore)} total`
    + (state.stats.bestWord ? ` · best word ${state.stats.bestWord} (${n(state.stats.bestScore)})` : ''));
  lines.push('');

  const log = state.pageLog ?? [];
  if (log.length) {
    lines.push(`${pad('page', 6)}${pad('quota', 10, true)}${pad('score', 10, true)}${pad('×quota', 8, true)}  words  disc  editor`);
    for (const r of log) {
      const ratio = r.quota ? (r.score / r.quota).toFixed(2) : '—';
      const editor = r.editor ? (bossById(r.editor)?.name ?? r.editor) : '';
      lines.push(`${pad(`${r.chapter}.${r.page}`, 6)}${pad(n(r.quota), 10, true)}${pad(n(r.score), 10, true)}${pad(ratio, 8, true)}  `
        + `${pad(r.words, 5, true)}  ${pad(r.discards, 4, true)}  ${editor}${r.outcome === 'lost' ? '  ✗ lost' : ''}`);
    }
    lines.push('');
  }

  const seat = p => patronName(patronById(p.id), p.data) ?? p.id;
  lines.push(`The table (${state.patrons.length} of ${effectivePatronSlots()} seats, in running order): `
    + (state.patrons.map(seat).join(', ') || 'empty'));
  if (state.ghosts?.length) lines.push(`Ghosts: ${state.ghosts.map(seat).join(', ')}`);
  lines.push(`The workbench: ${state.sundries.map(s => sundryTip(s)?.head ?? s.kind).join(', ') || 'empty'}`);
  const col = state.collection ?? [];
  const count = test => col.filter(test).length;
  lines.push(`The case: ${col.length} sorts — ${count(t => t.colour)} painted, ${count(t => t.trim)} trimmed, `
    + `${count(t => t.nick)} nicked, ${count(t => t.material)} in rare metal`);
  lines.push(`Coins: ${n(state.coins)}`);
  return lines.join('\n');
}

// To the clipboard, by whichever door the page has: the async API where the
// page is served securely, the old copy command where it is not (a single-file
// build opened from disk). Resolves true when the text went.
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch { /* fall through to the old door */ }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  area.remove();
  return ok;
}
