const DICT_KEY   = 'wordfun_wordlist';
const COINED_KEY = 'folio_coined_words_v1';

export let DICT = new Set();
export let dictLoaded = false;

const FALLBACK = 'test words word board letter letters quiz play game read write stone notes road train rail me you he she we be bee at it is an are was has had not but for are';

// Words coined by The Neologist — the player's own, kept for good, across runs.
export function coinedWords() {
  try { return JSON.parse(localStorage.getItem(COINED_KEY) || '[]'); }
  catch { return []; }
}

export function coinWord(word) {
  const w = word.toUpperCase();
  const list = coinedWords();
  if (!list.includes(w)) {
    list.push(w);
    try { localStorage.setItem(COINED_KEY, JSON.stringify(list)); } catch { /* quota */ }
  }
  DICT.add(w);
  _scrambleIndex = null;   // a new word is a new shape to match
  return w;
}

export function adoptWordlist(text) {
  const words = text.replace(/\r/g, '').split(/\n+/).map(w => w.trim()).filter(Boolean);
  DICT = new Set(words.map(w => w.toUpperCase()));
  for (const w of coinedWords()) DICT.add(w.toUpperCase());
  dictLoaded = true;
  _scrambleIndex = null;
  return DICT.size;
}

// ─── Scrambled spellings (The Skimmer) ────────────────────────────────────────
// A word indexed by its first letter, its last letter, and the letters between
// them in sorted order — so every spelling that keeps the ends still and
// shuffles the middle lands on the same key. Built on first use, because most
// runs never seat The Skimmer, and dropped whenever the dictionary changes.

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
    onStatus('loaded', DICT.size);
    return;
  }

  // Use cached copy immediately so first paint isn't blocked
  try {
    const saved = localStorage.getItem(DICT_KEY);
    if (saved) { adoptWordlist(saved); onStatus('loaded', DICT.size); }
  } catch { /* ignore */ }

  if (location.protocol.startsWith('http')) {
    try {
      const res = await fetch('wordlist.txt', { cache: 'no-store' });
      if (res.ok) {
        const text = await res.text();
        adoptWordlist(text);
        onStatus('loaded', DICT.size);
        try { localStorage.setItem(DICT_KEY, text); } catch { /* quota */ }
        return;
      }
    } catch { /* fall through */ }
  }

  if (!dictLoaded) {
    adoptWordlist(FALLBACK);
    onStatus('fallback', DICT.size);
  }
}

export function loadCustom(text) {
  const n = adoptWordlist(text);
  try { localStorage.setItem(DICT_KEY, text); } catch { /* quota */ }
  return n;
}
