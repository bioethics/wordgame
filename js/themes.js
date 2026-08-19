// Themed word lists — the flat files in wordlists-themed/, one word per line.
// Lines starting with # are comments; blank lines are ignored; case doesn't
// matter. Edit the files freely, nothing else needs changing. To add a whole
// new list, drop the file in the folder and give it a line in THEME_FILES.
//
// Four lists back the register patrons (the Sexton, the Paramour, the Poppet,
// the Vulgarian) and three more back the parts of speech (the Sculptor's
// nouns, the Poet's adjectives, the Athlete's verbs); the acronyms list
// backs the Stenographer, and the names list The Expectant Parents. A word
// only ever scores if the dictionary (or a pardon) lets it through first, so
// list entries the dictionary lacks are harmless — they just never come up.
// (The nouns list is read by a pardon as well — The Binder's, which stacks two
// of its entries into a word — and the acronyms and names lists are vouched
// whole at the dictionary check, so those three can put a word through the
// door rather than only paying for it.)
//
// A bundled build (single-file/artifact) embeds the lists as
// window.FOLIO_THEMES = { cute: "text…", … }, which is checked first —
// the same arrangement dict.js has with window.FOLIO_WORDLIST.

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

// Where a list's ORDER is itself data. Most lists are unordered bags of words
// and never look at this; common.txt is sorted commonest-first, and The
// Populist asks how common a word is, not merely whether it is on the list.
export const THEME_RANKS = Object.fromEntries(
  Object.keys(THEME_FILES).map(k => [k, new Map()]));

// Every themed list comes through here, which is where the exclusion list is
// enforced for them. It matters most for the two lists that vouch a word
// straight past the dictionary — the Stenographer's acronyms and The
// Expectant Parents' names — since those never face the dictionary's own
// filter. An excluded word takes no rank either: it isn't on the list, so it
// holds no place in its order.
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

// A word's position in an ordered list, or null if it isn't on it. Rank 0 is
// the first line of the file.
export const themeRank = (key, word) => THEME_RANKS[key]?.get(word) ?? null;

// How many words a list holds — the editors use this to tell "the list says
// no" apart from "the list hasn't loaded yet", which must never spike a word.
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
