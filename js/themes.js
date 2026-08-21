// Themed word lists — the flat files in wordlists-themed/, one word per line.
// Lines starting with # are comments, blank lines are ignored, case doesn't
// matter. To add a list, drop the file in and give it a line in THEME_FILES.
//
// A list entry only scores if the dictionary (or a pardon) lets the word through
// first, except for three that can open the door themselves: acronyms and names
// (vouched whole at the dictionary check) and nouns (read by The Binder).
//
// A bundled build embeds the lists as window.FOLIO_THEMES, checked first — as
// dict.js does with window.FOLIO_WORDLIST.

import { isExcluded } from './excluded.js';

export const THEME_FILES = {
  cute:       'wordlists-themed/theme-cute.txt',
  romantic:   'wordlists-themed/theme-romantic.txt',
  rude:       'wordlists-themed/theme-rude.txt',
  spooky:     'wordlists-themed/theme-spooky.txt',
  acronyms:   'wordlists-themed/acronyms.txt',
  nouns:      'wordlists-themed/nouns.txt',
  adjectives: 'wordlists-themed/adjectives.txt',
  verbs:      'wordlists-themed/verbs.txt',
  names:      'wordlists-themed/names.txt',
  common:     'wordlists-themed/common.txt',
};

export const THEME_SETS = Object.fromEntries(
  Object.keys(THEME_FILES).map(k => [k, new Set()]));

// Where a list's ORDER is itself data: common.txt is sorted commonest-first.
export const THEME_RANKS = Object.fromEntries(
  Object.keys(THEME_FILES).map(k => [k, new Map()]));

// Every themed list comes through here, so this is where exclusions are enforced
// for them — load-bearing for acronyms and names, which never face the
// dictionary's own filter. An excluded word takes no rank either.
export function adoptTheme(key, text) {
  const set = THEME_SETS[key];
  if (!set) return 0;
  set.clear();
  const ranks = THEME_RANKS[key];
  ranks.clear();
  for (const line of text.replace(/\r/g, '').split('\n')) {
    const w = line.trim();
    if (!w || w.startsWith('#')) continue;
    const W = w.toUpperCase();
    if (isExcluded(W)) continue;
    if (!ranks.has(W)) ranks.set(W, ranks.size);   // 0 = commonest
    set.add(W);
  }
  return set.size;
}

// True when `word` (letters only, marks already split off) is on the list.
export const inTheme = (key, word) => THEME_SETS[key]?.has(word) ?? false;

// A word's position in an ordered list, or null. Rank 0 is the file's first line.
export const themeRank = (key, word) => THEME_RANKS[key]?.get(word) ?? null;

// The editors use this to tell "the list says no" from "the list hasn't loaded",
// which must never spike a word.
export const themeSize = key => THEME_SETS[key]?.size ?? 0;

export async function loadThemes() {
  if (typeof window !== 'undefined' && window.FOLIO_THEMES) {
    for (const [k, text] of Object.entries(window.FOLIO_THEMES)) adoptTheme(k, text);
    return;
  }
  if (typeof location === 'undefined' || !location.protocol.startsWith('http')) return;
  await Promise.all(Object.entries(THEME_FILES).map(async ([k, file]) => {
    try {
      const res = await fetch(file, { cache: 'no-store' });
      if (res.ok) adoptTheme(k, await res.text());
    } catch { /* a missing list just never matches */ }
  }));
}
