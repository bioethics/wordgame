const DICT_KEY = 'wordfun_wordlist';

export let DICT = new Set();
export let dictLoaded = false;

const FALLBACK = 'test words word board letter letters quiz play game read write stone notes road train rail me you he she we be bee at it is an are was has had not but for are';

export function adoptWordlist(text) {
  const words = text.replace(/\r/g, '').split(/\n+/).map(w => w.trim()).filter(Boolean);
  DICT = new Set(words.map(w => w.toUpperCase()));
  dictLoaded = true;
  return DICT.size;
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
