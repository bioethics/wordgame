// The words this press will not set, whatever a word list says.
//
// `wordlists-themed/excluded-slurs.txt` is the documented record — slurs and
// hate terms struck from the game on the way in (see docs/PATRON_OVERHAUL.md,
// "Curation, applied on the way in"). 
//
// Every road a word can take into play is filtered through `isExcluded`:
//   • the dictionary — adoptWordlist in dict.js, which is the single funnel
//     for the bundled list, the localStorage cache, the fetched file, and a
//     custom list pasted into Settings;
//   • the themed lists — adoptTheme in themes.js, which matters most for the
//     two that vouch words straight past the dictionary (the Stenographer's
//     acronyms, The Expectant Parents' names);
//   • The Neologist's coining sheet, the one door a *player* opens.
//
// Matching is exact and whole-word, never substring: the list carries the
// inflections it means to catch (nigger/niggers/nigga/niggas), and substring
// matching would take innocent words down with them.

const CACHE_KEY = 'folio_excluded_v1';
const FILE      = 'wordlists-themed/excluded-slurs.txt';

const EXCLUDED = new Set();

// True once a real list has been adopted — so a failure to load can be told
// apart from a list that is genuinely empty, and reported rather than assumed.
export let exclusionsLoaded = false;

export const isExcluded = word => EXCLUDED.has(word);

export const exclusionCount = () => EXCLUDED.size;

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

// Drop every excluded word from a list of words, for a caller that holds one
// already. Returns the survivors and how many were struck, so the count can
// be reported rather than silently swallowed.
export function withoutExcluded(words) {
  const kept = [];
  let struck = 0;
  for (const w of words) {
    if (EXCLUDED.has(w)) struck++;
    else kept.push(w);
  }
  return { kept, struck };
}

// Must finish BEFORE any word list is adopted — main.js awaits it ahead of
// loadDict and loadThemes, because a filter that arrives late filters nothing.
//
// The last good copy is cached, so once a browser has seen the list a later
// failed fetch (a deployment missing the file, an offline reload) still
// filters. A first-ever load that fails leaves the set empty; that is the one
// case the caller is told about, rather than left to assume it worked.
export async function loadExclusions() {
  // A bundled build embeds every wordlists-themed/*.txt file, this one included
  if (typeof window !== 'undefined' && window.FOLIO_THEMES?.['excluded-slurs']) {
    return adoptExclusions(window.FOLIO_THEMES['excluded-slurs']);
  }

  try {
    const saved = localStorage.getItem(CACHE_KEY);
    if (saved) adoptExclusions(saved);
  } catch { /* no cache is not an error */ }

  if (typeof location !== 'undefined' && location.protocol.startsWith('http')) {
    try {
      const res = await fetch(FILE, { cache: 'no-store' });
      if (res.ok) {
        const text = await res.text();
        adoptExclusions(text);
        try { localStorage.setItem(CACHE_KEY, text); } catch { /* quota */ }
      }
    } catch { /* fall through to whatever the cache gave us */ }
  }

  return EXCLUDED.size;
}
