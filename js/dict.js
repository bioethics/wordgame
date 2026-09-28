import { isExcluded } from './excluded.js';
import { fetchText } from './net.js';

const DICT_KEY   = 'wordfun_wordlist';
const COINED_KEY = 'folio_coined_words_v1';

export let DICT = new Set();
export let dictLoaded = false;
// 'loading' until a list is in hand, 'loaded' after, and 'failed' while the
// first download has not arrived and there was no copy from an earlier visit.
// There is no stand-in list: forty words would tell a player that ABED is not
// a word, and a refusal the press cannot stand behind is worse than a wait.
export let dictStatus = 'loading';

// Words coined by The Neologist — the player's own, kept for good, across runs.
export function coinedWords() {
  try { return JSON.parse(localStorage.getItem(COINED_KEY) || '[]'); }
  catch { return []; }
}

// Filtered like any other entry. Returns null when refused, so the sheet can say so.
export function coinWord(word) {
  const w = word.toUpperCase();
  if (isExcluded(w)) return null;
  const list = coinedWords();
  if (!list.includes(w)) {
    list.push(w);
    try { localStorage.setItem(COINED_KEY, JSON.stringify(list)); } catch { /* quota */ }
  }
  DICT.add(w);
  _scrambleIndex = null;   // a new word is a new shape to match
  return w;
}

// The single funnel for every dictionary — bundled, cached, fetched, fallback or
// pasted — which is why the exclusion filter sits here, not at each call site.
export function adoptWordlist(text) {
  const words = text.replace(/\r/g, '').split(/\n+/).map(w => w.trim()).filter(Boolean);
  DICT = new Set();
  for (const w of words) {
    const W = w.toUpperCase();
    if (!isExcluded(W)) DICT.add(W);
  }
  for (const w of coinedWords()) {
    const W = w.toUpperCase();
    if (!isExcluded(W)) DICT.add(W);
  }
  dictLoaded = true;
  _scrambleIndex = null;
  return DICT.size;
}

// ─── Scrambled spellings (The Skimmer) ────────────────────────────────────────
// Indexed by first letter + sorted middle + last letter, so every spelling that
// keeps the ends still lands on one key. Built lazily, dropped on any change.

let _scrambleIndex = null;

const scrambleKey = w =>
  `${w[0]}${[...w.slice(1, -1)].sort().join('')}${w[w.length - 1]}`;

// The real word `word` could be a shuffling of, or null if there isn't one.
export function scrambleMatch(word) {
  if (word.length < 4) return null;      // under four letters there's no middle to shuffle
  if (!_scrambleIndex) {
    _scrambleIndex = new Map();
    for (const w of DICT) {
      if (w.length < 4) continue;
      const k = scrambleKey(w);
      if (!_scrambleIndex.has(k)) _scrambleIndex.set(k, w);
    }
  }
  const hit = _scrambleIndex.get(scrambleKey(word));
  return hit && hit !== word ? hit : null;
}

export async function loadDict(onStatus) {
  // A bundled build (single-file/artifact) embeds the list as a global
  if (typeof window !== 'undefined' && window.FOLIO_WORDLIST) {
    adoptWordlist(window.FOLIO_WORDLIST);
    dictStatus = 'loaded';
    onStatus('loaded', DICT.size);
    return;
  }

  // Use cached copy immediately so first paint isn't blocked
  let saved = null;
  try { saved = localStorage.getItem(DICT_KEY); } catch { /* ignore */ }
  if (saved) { adoptWordlist(saved); dictStatus = 'loaded'; onStatus('loaded', DICT.size); }
  if (!location.protocol.startsWith('http')) {
    if (!dictLoaded) { dictStatus = 'failed'; onStatus('failed', 0); }
    return;
  }

  // The fetch revalidates, so an unchanged list costs a 304 — and is neither
  // rebuilt nor written back to storage, which it used to be on every load.
  // With nothing cached, a failure is said and the download tried again,
  // further apart each time; with a copy in hand it simply waits for next load.
  for (let attempt = 0; ; attempt++) {
    const text = await fetchText('wordlists/wordlist.txt', 30000);
    if (text != null) {
      if (text !== saved) {
        adoptWordlist(text);
        try { localStorage.setItem(DICT_KEY, text); } catch { /* quota */ }
      }
      dictStatus = 'loaded';
      onStatus('loaded', DICT.size);
      return;
    }
    if (dictLoaded) return;
    dictStatus = 'failed';
    onStatus('failed', 0);
    await new Promise(r => setTimeout(r, Math.min(60000, 5000 * 2 ** attempt)));
  }
}

export function loadCustom(text) {
  const n = adoptWordlist(text);
  dictStatus = 'loaded';
  try { localStorage.setItem(DICT_KEY, text); } catch { /* quota */ }
  return n;
}
