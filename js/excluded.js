// The words this press will not set, whatever a word list says.
//
// `wordlists/excluded-slurs.txt` is the documented record — slurs and
// hate terms struck from the game on the way in (see docs/PATRON_OVERHAUL.md,
// "Curation, applied on the way in"). 
//
// Every road a word can take into play is filtered through `isExcluded`: the
// dictionary (adoptWordlist, dict.js), the themed lists (adoptTheme, themes.js)
// and The Neologist's coining sheet.
//
// Matching is exact and whole-word, never substring: the list carries the
// inflections it means to catch, and substring matching would take innocent
// words down with them.

import { fetchText } from './net.js';

const CACHE_KEY = 'folio_excluded_v1';
const FILE      = 'wordlists/excluded-slurs.txt';

const EXCLUDED = new Set();

// True once a real list has been adopted, so a failed load can be told apart
// from a genuinely empty one.
export let exclusionsLoaded = false;

export const isExcluded = word => EXCLUDED.has(word);

export function adoptExclusions(text) {
  EXCLUDED.clear();
  for (const line of text.replace(/\r/g, '').split('\n')) {
    const w = line.trim();
    if (!w || w.startsWith('#')) continue;
    EXCLUDED.add(w.toUpperCase());
  }
  exclusionsLoaded = EXCLUDED.size > 0;
  return EXCLUDED.size;
}

// Must finish BEFORE any word list is adopted — main.js awaits it ahead of
// loadDict and loadThemes, because a filter that arrives late filters nothing.
// With a copy cached from an earlier visit the start never waits on the
// network: the cached list is adopted at once and refreshed behind it, and a
// refreshed list takes hold of the word lists on the NEXT load (isExcluded
// itself reads the live set). Only a first-ever visit waits, and not for long:
// a failure leaves the set empty, which the returned count tells the caller.
export async function loadExclusions() {
  // A bundled build embeds every wordlists/*.txt file, this one included
  if (typeof window !== 'undefined' && window.FOLIO_THEMES?.['excluded-slurs']) {
    return adoptExclusions(window.FOLIO_THEMES['excluded-slurs']);
  }

  let cached = null;
  try { cached = localStorage.getItem(CACHE_KEY); } catch { /* no cache is not an error */ }
  if (cached) adoptExclusions(cached);

  if (typeof location !== 'undefined' && location.protocol.startsWith('http')) {
    const refresh = fetchText(FILE, 4000).then(text => {
      if (text == null || text === cached) return;
      adoptExclusions(text);
      try { localStorage.setItem(CACHE_KEY, text); } catch { /* quota */ }
    });
    if (!cached) await refresh;
  }

  return EXCLUDED.size;
}
