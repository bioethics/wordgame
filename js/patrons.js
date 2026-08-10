// Patrons of the print house. Each grants a standing boon.
//
// when: 'score' — effect(ctx) runs while a word is scored.
//       'meta'  — handled explicitly elsewhere (page start, page reward, discards).
//
// Score ctx: { word, tiles, state, addPoints(n), addMult(n), xMult(n) }
// The add/x helpers record an animation step automatically.

const VOWELS = 'AEIOU';

export const PATRON_DEFS = [
  // ── Commons ─────────────────────────────────────────────────────────────────
  {
    id: 'apprentice', name: 'The Apprentice', emoji: '🧹', rarity: 'common', cost: 3,
    desc: '4-letter words gain +20 Points.',
    when: 'score',
    effect({ word, addPoints }) { if (word.length === 4) addPoints(20); },
  },
  {
    id: 'scholar', name: 'The Scholar', emoji: '📜', rarity: 'common', cost: 4,
    desc: 'Words of 5+ letters gain +3 Mult.',
    when: 'score',
    effect({ word, addMult }) { if (word.length >= 5) addMult(3); },
  },
  {
    id: 'diva', name: 'The Diva', emoji: '🎭', rarity: 'common', cost: 4,
    desc: 'Each vowel scores +2 extra Points.',
    when: 'score',
    effect({ word, addPoints }) {
      const n = [...word].filter(c => VOWELS.includes(c)).length;
      if (n) addPoints(n * 2);
    },
  },
  {
    id: 'botanist', name: 'The Botanist', emoji: '🌿', rarity: 'common', cost: 4,
    desc: 'Words with a doubled letter (LL, OO…) gain +25 Points.',
    when: 'score',
    effect({ word, addPoints }) {
      for (let i = 0; i < word.length - 1; i++) {
        if (word[i] === word[i + 1]) { addPoints(25); return; }
      }
    },
  },
  {
    id: 'herald', name: 'The Herald', emoji: '📯', rarity: 'common', cost: 4,
    desc: 'Words that start and end with the same letter get ×2 Mult.',
    when: 'score',
    effect({ word, xMult }) {
      if (word.length >= 3 && word[0] === word[word.length - 1]) xMult(2);
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
    desc: 'Begin each page with an extra Discard.',
    when: 'meta',
  },
  {
    id: 'twins', name: 'The Twins', emoji: '👯', rarity: 'uncommon', cost: 6,
    desc: 'Words containing any repeated letter get ×2 Mult.',
    when: 'score',
    effect({ word, xMult }) {
      const seen = new Set();
      for (const c of word) { if (seen.has(c)) { xMult(2); return; } seen.add(c); }
    },
  },
  {
    id: 'typesetter', name: 'The Typesetter', emoji: '🔠', rarity: 'uncommon', cost: 6,
    desc: 'Each ligature tile (ING · ED · TCH) gives +2 Mult.',
    when: 'score',
    effect({ tiles, addMult }) {
      const n = tiles.filter(t => ['ING', 'ED', 'TCH'].includes(t.letter)).length;
      if (n) addMult(n * 2);
    },
  },
  {
    id: 'jeweller', name: 'The Jeweller', emoji: '💎', rarity: 'uncommon', cost: 6,
    desc: 'Each tile worth 8+ Points gains a further +6 Points.',
    when: 'score',
    effect({ tiles, addPoints }) {
      const n = tiles.filter(t => (t.basePoints ?? 0) >= 8).length;
      if (n) addPoints(n * 6);
    },
  },
  {
    id: 'stonemason', name: 'The Stonemason', emoji: '🗿', rarity: 'uncommon', cost: 6,
    desc: 'Vowelless words gain +35 Points.',
    when: 'score',
    effect({ word, addPoints }) {
      if (word.length >= 2 && ![...word].some(c => VOWELS.includes(c))) addPoints(35);
    },
  },
  {
    id: 'archivist', name: 'The Archivist', emoji: '🗃️', rarity: 'uncommon', cost: 6,
    desc: 'The first word on each page gets ×2 Mult.',
    when: 'score',
    effect({ state, xMult }) { if (state.wordsPrinted === 0) xMult(2); },
  },
  {
    id: 'calligrapher', name: 'The Calligrapher', emoji: '✒️', rarity: 'uncommon', cost: 7,
    desc: 'Each painted letter gains +4 Points.',
    when: 'score',
    effect({ tiles, addPoints }) {
      const n = tiles.filter(t => (t.activeVariant === 1 ? t.altColour : t.colour)).length;
      if (n) addPoints(n * 4);
    },
  },
  {
    id: 'magpie', name: 'The Magpie', emoji: '🐦', rarity: 'uncommon', cost: 7,
    desc: 'Gold-trimmed tiles pay double Coins.',
    when: 'meta',   // read directly during scoring of gold trims
  },

  // ── Rares ───────────────────────────────────────────────────────────────────
  {
    id: 'minimalist', name: 'The Minimalist', emoji: '🪶', rarity: 'rare', cost: 8,
    desc: '3-letter words get ×3 Mult.',
    when: 'score',
    effect({ word, xMult }) { if (word.length === 3) xMult(3); },
  },
  {
    id: 'economist', name: 'The Economist', emoji: '📈', rarity: 'rare', cost: 8,
    desc: '+1 Mult for every 5 Coins you hold (max +4).',
    when: 'score',
    effect({ state, addMult }) {
      const n = Math.min(4, Math.floor(state.coins / 5));
      if (n) addMult(n);
    },
  },
  {
    id: 'astronomer', name: 'The Astronomer', emoji: '🔭', rarity: 'rare', cost: 9,
    desc: '+1 Mult for each word already printed this page.',
    when: 'score',
    effect({ state, addMult }) { if (state.wordsPrinted > 0) addMult(state.wordsPrinted); },
  },
  {
    id: 'closer', name: 'The Closer', emoji: '🌒', rarity: 'rare', cost: 9,
    desc: 'The final word of each page gets ×3 Mult.',
    when: 'score',
    effect({ state, xMult }) { if (state.wordsLeft === 1) xMult(3); },
  },
  {
    id: 'scavenger', name: 'The Scavenger', emoji: '🦝', rarity: 'rare', cost: 9,
    desc: 'Each Discard grants your next word +12 Points.',
    when: 'meta',   // accrues on discard, consumed by scoring
  },
  {
    id: 'mirror', name: 'The Mirror', emoji: '🪞', rarity: 'rare', cost: 12,
    desc: 'Palindromes get ×4 Mult.',
    when: 'score',
    effect({ word, xMult }) {
      if (word.length >= 2 && word === [...word].reverse().join('')) xMult(4);
    },
  },
  {
    id: 'cartographer', name: 'The Cartographer', emoji: '🗺️', rarity: 'rare', cost: 12,
    desc: 'Words whose letters run in alphabetical order get ×3 Mult.',
    when: 'score',
    effect({ word, xMult }) {
      if (word.length < 4) return;
      for (let i = 0; i < word.length - 1; i++) if (word[i] > word[i + 1]) return;
      xMult(3);
    },
  },
  {
    id: 'novelist', name: 'The Novelist', emoji: '🖋️', rarity: 'rare', cost: 12,
    desc: 'Words of 7+ letters get ×5 Mult.',
    when: 'score',
    effect({ word, xMult }) { if (word.length >= 7) xMult(5); },
  },
];

export const patronById = id => PATRON_DEFS.find(d => d.id === id);

export const RARITY_WEIGHT = { common: 3, uncommon: 2, rare: 1 };
