// Themed word lists — the flat files in wordlists-themed/, one word per line.
// Lines starting with # are comments; blank lines are ignored; case doesn't
// matter. Edit the files freely, nothing else needs changing. To add a whole
// new list, drop the file in the folder and give it a line in THEME_FILES.
//
// Four lists back the register patrons (the Sexton, the Paramour, the Poppet,
// the Vulgarian); the acronyms list backs the Stenographer. A word only ever
// scores if the dictionary (or a pardon) lets it through first, so list
// entries the dictionary lacks are harmless — they just never come up.
//
// A bundled build (single-file/artifact) embeds the lists as
// window.FOLIO_THEMES = { cute: "text…", … }, which is checked first —
// the same arrangement dict.js has with window.FOLIO_WORDLIST.

export const THEME_FILES = {
  cute:     'wordlists-themed/theme-cute.txt',
  romantic: 'wordlists-themed/theme-romantic.txt',
  rude:     'wordlists-themed/theme-rude.txt',
  spooky:   'wordlists-themed/theme-spooky.txt',
  acronyms: 'wordlists-themed/acronyms.txt',
};

export const THEME_SETS = Object.fromEntries(
  Object.keys(THEME_FILES).map(k => [k, new Set()]));

export function adoptTheme(key, text) {
  const set = THEME_SETS[key];
  if (!set) return 0;
  set.clear();
  for (const line of text.replace(/\r/g, '').split('\n')) {
    const w = line.trim();
    if (!w || w.startsWith('#')) continue;
    set.add(w.toUpperCase());
  }
  return set.size;
}

// True when `word` (letters only, marks already split off) is on the list.
export const inTheme = (key, word) => THEME_SETS[key]?.has(word) ?? false;

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
