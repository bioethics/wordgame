// Patrons of the print house. Each grants a standing boon.
//
// when: 'score' — effect(ctx) runs while a word is scored.
//       'meta'  — handled explicitly elsewhere (page start, page reward, exchanges).
//
// Score ctx: { word, tiles, state, addInk(n), addPress(n), multPress(n) }
// The add/mult helpers record an animation step automatically.

const VOWELS = 'AEIOU';

export const PATRON_DEFS = [
  // ── Commons ─────────────────────────────────────────────────────────────────
  {
    id: 'apprentice', name: 'The Apprentice', emoji: '🧹', rarity: 'common', cost: 3,
    desc: '4-letter words gain +20 Ink.',
    when: 'score',
    effect({ word, addInk }) { if (word.length === 4) addInk(20); },
  },
  {
    id: 'scholar', name: 'The Scholar', emoji: '📜', rarity: 'common', cost: 4,
    desc: 'Words of 5+ letters gain +3 Press.',
    when: 'score',
    effect({ word, addPress }) { if (word.length >= 5) addPress(3); },
  },
  {
    id: 'diva', name: 'The Diva', emoji: '🎭', rarity: 'common', cost: 4,
    desc: 'Each vowel prints +2 extra Ink.',
    when: 'score',
    effect({ word, addInk }) {
      const n = [...word].filter(c => VOWELS.includes(c)).length;
      if (n) addInk(n * 2);
    },
  },
  {
    id: 'botanist', name: 'The Botanist', emoji: '🌿', rarity: 'common', cost: 4,
    desc: 'Words with a doubled letter (LL, OO…) gain +25 Ink.',
    when: 'score',
    effect({ word, addInk }) {
      for (let i = 0; i < word.length - 1; i++) {
        if (word[i] === word[i + 1]) { addInk(25); return; }
      }
    },
  },
  {
    id: 'herald', name: 'The Herald', emoji: '📯', rarity: 'common', cost: 4,
    desc: 'Words that start and end with the same letter double their Press.',
    when: 'score',
    effect({ word, multPress }) {
      if (word.length >= 3 && word[0] === word[word.length - 1]) multPress(2);
    },
  },

  // ── Uncommons ───────────────────────────────────────────────────────────────
  {
    id: 'banker', name: 'The Banker', emoji: '🏦', rarity: 'uncommon', cost: 5,
    desc: 'Collect 2 extra Coins whenever a page is completed.',
    when: 'meta',
  },
  {
    id: 'quartermaster', name: 'The Quartermaster', emoji: '🎒', rarity: 'uncommon', cost: 5,
    desc: 'Begin each page with an extra Exchange.',
    when: 'meta',
  },
  {
    id: 'twins', name: 'The Twins', emoji: '👯', rarity: 'uncommon', cost: 6,
    desc: 'Words containing any repeated letter double their Press.',
    when: 'score',
    effect({ word, multPress }) {
      const seen = new Set();
      for (const c of word) { if (seen.has(c)) { multPress(2); return; } seen.add(c); }
    },
  },
  {
    id: 'typesetter', name: 'The Typesetter', emoji: '🔠', rarity: 'uncommon', cost: 6,
    desc: 'Each ligature tile (ING · ED · TCH) gains +2 Press.',
    when: 'score',
    effect({ tiles, addPress }) {
      const n = tiles.filter(t => ['ING', 'ED', 'TCH'].includes(t.letter)).length;
      if (n) addPress(n * 2);
    },
  },
  {
    id: 'jeweller', name: 'The Jeweller', emoji: '💎', rarity: 'uncommon', cost: 6,
    desc: 'Each tile worth 8+ Ink gains a further +6 Ink.',
    when: 'score',
    effect({ tiles, addInk }) {
      const n = tiles.filter(t => (t.basePoints ?? 0) >= 8).length;
      if (n) addInk(n * 6);
    },
  },
  {
    id: 'stonemason', name: 'The Stonemason', emoji: '🗿', rarity: 'uncommon', cost: 6,
    desc: 'Vowelless words gain +35 Ink.',
    when: 'score',
    effect({ word, addInk }) {
      if (word.length >= 2 && ![...word].some(c => VOWELS.includes(c))) addInk(35);
    },
  },
  {
    id: 'archivist', name: 'The Archivist', emoji: '🗃️', rarity: 'uncommon', cost: 6,
    desc: 'The first word on each page doubles its Press.',
    when: 'score',
    effect({ state, multPress }) { if (state.wordsPrinted === 0) multPress(2); },
  },
  {
    id: 'calligrapher', name: 'The Calligrapher', emoji: '✒️', rarity: 'uncommon', cost: 7,
    desc: 'Each coloured-ink tile gains +4 Ink.',
    when: 'score',
    effect({ tiles, addInk }) {
      const n = tiles.filter(t => t.ink).length;
      if (n) addInk(n * 4);
    },
  },
  {
    id: 'magpie', name: 'The Magpie', emoji: '🐦', rarity: 'uncommon', cost: 7,
    desc: 'Gilded tiles pay double Coins.',
    when: 'meta',   // read directly during scoring of gilded tiles
  },

  // ── Rares ───────────────────────────────────────────────────────────────────
  {
    id: 'minimalist', name: 'The Minimalist', emoji: '🪶', rarity: 'rare', cost: 8,
    desc: '3-letter words triple their Press.',
    when: 'score',
    effect({ word, multPress }) { if (word.length === 3) multPress(3); },
  },
  {
    id: 'blacksmith', name: 'The Blacksmith', emoji: '⚒️', rarity: 'rare', cost: 8,
    desc: 'Each Bold tile gains +2 Press.',
    when: 'score',
    effect({ tiles, addPress }) {
      const n = tiles.filter(t => t.cast === 'bold').length;
      if (n) addPress(n * 2);
    },
  },
  {
    id: 'economist', name: 'The Economist', emoji: '📈', rarity: 'rare', cost: 8,
    desc: '+1 Press for every 5 Coins you hold (max +4).',
    when: 'score',
    effect({ state, addPress }) {
      const n = Math.min(4, Math.floor(state.coins / 5));
      if (n) addPress(n);
    },
  },
  {
    id: 'chromatist', name: 'The Chromatist', emoji: '🎨', rarity: 'rare', cost: 9,
    desc: 'Ink set bonuses are doubled.',
    when: 'meta',   // applied inside set-bonus maths
  },
  {
    id: 'astronomer', name: 'The Astronomer', emoji: '🔭', rarity: 'rare', cost: 9,
    desc: '+1 Press for each word already printed this page.',
    when: 'score',
    effect({ state, addPress }) { if (state.wordsPrinted > 0) addPress(state.wordsPrinted); },
  },
  {
    id: 'closer', name: 'The Closer', emoji: '🌒', rarity: 'rare', cost: 9,
    desc: 'The final word of each page triples its Press.',
    when: 'score',
    effect({ state, multPress }) { if (state.wordsLeft === 1) multPress(3); },
  },
  {
    id: 'scavenger', name: 'The Scavenger', emoji: '🦝', rarity: 'rare', cost: 9,
    desc: 'Each Exchange grants your next word +12 Ink.',
    when: 'meta',   // accrues on exchange, consumed by scoring
  },
  {
    id: 'mirror', name: 'The Mirror', emoji: '🪞', rarity: 'rare', cost: 12,
    desc: 'Palindromes quadruple their Press.',
    when: 'score',
    effect({ word, multPress }) {
      if (word.length >= 2 && word === [...word].reverse().join('')) multPress(4);
    },
  },
  {
    id: 'cartographer', name: 'The Cartographer', emoji: '🗺️', rarity: 'rare', cost: 12,
    desc: 'Words whose letters run in alphabetical order triple their Press.',
    when: 'score',
    effect({ word, multPress }) {
      if (word.length < 4) return;
      for (let i = 0; i < word.length - 1; i++) if (word[i] > word[i + 1]) return;
      multPress(3);
    },
  },
  {
    id: 'novelist', name: 'The Novelist', emoji: '🖋️', rarity: 'rare', cost: 12,
    desc: 'Words of 7+ letters quintuple their Press.',
    when: 'score',
    effect({ word, multPress }) { if (word.length >= 7) multPress(5); },
  },
];

export const patronById = id => PATRON_DEFS.find(d => d.id === id);

export const RARITY_WEIGHT = { common: 3, uncommon: 2, rare: 1 };
