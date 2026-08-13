// Patron quips — short, often gleefully wrong reactions a seated patron might
// pop up in a speech bubble after a strong word. Purely cosmetic: nothing
// here affects scoring. Add or edit lines any time; `{word}` is swapped for
// the word just printed (as typed, e.g. "FROG").
//
// Keep them SHORT — they render in a small bubble above a patron's card.

export const PATRON_QUIPS = [
  // Wordless enthusiasm
  'Wow!',
  'Bravo!',
  'Golly!',
  'I say!',
  'Splendid!',
  'Marvellous!',
  'Well I never!',
  'Extraordinary!',
  'Astonishing!',
  'Delightful!',
  'Enjoyable!',
  'Chef’s kiss!',
  'Be still, my heart.',
  'I felt that in my ligatures.',
  'Ten out of ten, no notes.',
  'Poetry. Sheer poetry.',

  // About the word specifically (often nonsensically)
  'I love {word}!',
  '{word} is good!',
  '{word}? Genius!',
  '{word}! My favourite!',
  'What a word — {word}!',
  'I’ve always loved the word {word}.',
  'They should print {word} on money.',
  'Never seen anything like {word}!',
  'That’s the best {word} I’ve ever seen.',
  'Frame it! Frame {word} immediately!',
  'I named my cat after {word}.',
  '{word} — now THAT’S a word.',
  'My grandmother used to say {word}.',
  'I’d marry {word} if I could.',

  // Overwrought praise for the craft
  'Impeccable spelling!',
  'Flawless typesetting!',
  'Such craftsmanship!',
  'The ink itself applauds!',
  'A word for the ages!',
  'I shall tell my grandchildren of this.',
  'The presses will remember this day.',
  'Somewhere, a lexicographer weeps with joy.',
  'A word so fine it needs no Mult.',
  'The dictionary should be so lucky.',

  // Faintly unhinged
  'Be honest — did you rehearse that?',
  'I’m told this is what winning feels like.',
  'That word has main character energy.',
  'I enjoy those letters!',
  'Correct! Whatever that means!',
  'I have no notes. I also have no idea what a note is.',
  'This is the proudest I have been of a stranger.',
  'I will be thinking about this for the rest of the page.',
];

export function randomQuip(word) {
  const line = PATRON_QUIPS[Math.floor(Math.random() * PATRON_QUIPS.length)];
  return line.replace(/\{word\}/g, word);
}
