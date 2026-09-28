// The records — what outlasts a run.
//
// Everything else a run makes is thrown away when the next begins; this keeps a
// line for each run that ENDED — lost, or won — under its own key, apart from
// the save, as the Neologist's coined words are kept (js/dict.js). It is what
// the end screen reads to say how this run stands against the others, and it is
// the ground any meta-progression would be built on.
//
// A run is recorded under its own id (state.runId), so a folio that is finished
// and then carried on into the appendices updates its one line when the
// appendices end, rather than counting twice. A run the Testing Chamber or a
// dev shortcut has touched (state.assisted) is never recorded: its numbers
// were not earned, and a record is only worth what it excludes.

import { state, runDifficulty } from './state.js';

const KEY = 'folio_records_v1';
const KEEP = 200;   // the most recent runs; bests are read from what is kept

function read() {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) || 'null');
    return r && Array.isArray(r.runs) ? r : { v: 1, runs: [] };
  } catch { return { v: 1, runs: [] }; }
}

function write(r) {
  try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* quota: the run still ends */ }
}

// Pages cleared is the one measure of reach that runs across chapters and the
// appendices alike; where it ended is kept beside it to say it in words.
function lineForThisRun() {
  return {
    id: state.runId,
    date: new Date().toISOString().slice(0, 10),
    edition: state.difficulty,
    won: !!state.endless,
    lost: !!state.gameOver,
    chapter: state.chapter,
    page: state.page,
    pages: state.stats.pages,
    words: state.stats.words,
    total: state.totalScore,
    bestWord: state.stats.bestWord || null,
    bestScore: state.stats.bestScore || 0,
  };
}

// The bests among the OTHER recorded runs, so this one can be held up to them.
function bestsExcept(runs, id, edition) {
  const others = runs.filter(r => r.id !== id);
  const sameBook = others.filter(r => r.edition === edition);
  const furthest = sameBook.reduce((a, r) => (!a || r.pages > a.pages ? r : a), null);
  const bestWord = others.reduce((a, r) => (!a || r.bestScore > a.bestScore ? r : a), null);
  return {
    runs: others.length,
    folios: others.filter(r => r.won).length,
    furthest,
    bestWord: bestWord?.bestWord ? bestWord : null,
  };
}

// Called as a run ends — at the loss, or at the folio's completion. Returns how
// this run stands, for the end screen: null for an assisted run, which the
// screen says is kept out.
export function recordRun() {
  if (state.assisted || !state.runId) return null;
  const r = read();
  const line = lineForThisRun();
  const before = bestsExcept(r.runs, line.id, line.edition);
  r.runs = [...r.runs.filter(x => x.id !== line.id), line].slice(-KEEP);
  write(r);
  return {
    line,
    edition: runDifficulty().label,
    runs: before.runs + 1,
    folios: before.folios + (line.won ? 1 : 0),
    furthest: before.furthest,
    bestWord: before.bestWord,
    furthestIsNew: !before.furthest || line.pages > before.furthest.pages,
    bestWordIsNew: !!line.bestWord && (!before.bestWord || line.bestScore > before.bestWord.bestScore),
  };
}
