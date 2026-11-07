// ─── Definitions ──────────────────────────────────────────────────────────────
// What a word means, from wordlists/definitions/ (built by
// tools/build-definitions.mjs): a file per first two letters, a few tens of
// kilobytes, fetched the first time a word starting so is asked for. Shared by
// the Daily Proof's results and the Campaign's stick and page (js/render.js).
// An embedded build carries them in window.FOLIO_DEFS instead, and a build
// with neither (the single-file Campaign) simply finds no definitions.
const DEFS = new Map();
const loads = new Map();

export const defKey = word => word.slice(0, 2).toLowerCase();

// The file for a key, beside this module's own folder: /js/defs.js reads
// /wordlists/definitions/, from the Campaign at the root and the daily alike.
function fileFor(K) {
  try { return new URL(`../wordlists/definitions/${K[0]}/${K}.txt`, import.meta.url).href; }
  catch { return null; }
}

// Resolves once the word's file is in (or could not be had).
export function loadDefs(word) {
  const K = defKey(word ?? '');
  if (!/^[a-z]{1,2}$/.test(K)) return Promise.resolve();
  if (!loads.has(K)) {
    const embedded = typeof window !== 'undefined' ? window.FOLIO_DEFS?.[K] : null;
    const url = embedded == null ? fileFor(K) : null;
    loads.set(K, (embedded != null ? Promise.resolve(embedded)
      : url ? fetch(url).then(r => (r.ok ? r.text() : '')) : Promise.resolve(''))
      .then(text => {
        for (const line of text.split('\n')) {
          const tab = line.indexOf('\t');
          if (tab > 0) DEFS.set(line.slice(0, tab).toUpperCase(), line.slice(tab + 1));
        }
      })
      .catch(() => {}));
  }
  return loads.get(K);
}

// The definition, if its file is in.
export const lookupDef = word => DEFS.get(String(word ?? '').toUpperCase()) ?? null;

// A definition that names its own word: an inflection's points to its root
// ("EMBARKATION: the act of…", for EMBARKATIONS).
export const HEADED = /^[A-Z][A-Z'-]*: /;
export const showDef = d => (d ? d[0].toUpperCase() + d.slice(1) : '');
