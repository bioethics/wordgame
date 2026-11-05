// THE FRONT DOOR — which game, whenever the site is opened at its root.
//
// Both games live on one site: the Campaign here, the Daily Proof at daily/.
// Opened at its root, the site asks which, every time, and says what each has
// waiting: today's case and whether it is printed, and the run in hand. Each
// game's own menu crosses straight to the other — the daily's sends
// ?play=campaign, which the head of index.html reads to keep the door shut —
// and neither loses its place on the way: the Campaign saves its run as it
// goes, and the daily keeps a word being set until it is printed.
//
// The door is drawn in the HTML, so it is up before anything behind it paints;
// the Campaign boots underneath it regardless, so choosing it is instant.

import { todaysNumber, EPOCH, PROOF_STORE } from '../daily/deal.js';
import { roman } from './constants.js';

const door = document.getElementById('door');
const skip = document.documentElement.dataset.door === 'skip';

const read = key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };

function dailyLine() {
  const n = todaysNumber();
  const day = new Date(EPOCH + (n - 1) * 864e5)
    .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const printed = !!read(PROOF_STORE)?.[n];
  return `Today: № ${n}, ${day}${printed ? ' · printed' : ''}`;
}

function campaignLine() {
  const run = read('folio_save_v1');
  if (!run || run.inStart) return 'Begin a run';
  if (run.gameOver) return 'The last run is over: begin another';
  return `Continue: Chapter ${roman(run.chapter ?? 1)}, page ${run.page ?? 1}`;
}

if (door && !skip) {
  document.getElementById('doorDailyMeta').textContent = dailyLine();
  document.getElementById('doorCampaignMeta').textContent = campaignLine();
  // Neither card is focused: a ring on one would read as the default.
  document.getElementById('doorCampaign').addEventListener('click', () => door.remove());
} else {
  door?.remove();
}
