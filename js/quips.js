// Patron quips — the lines patrons pop up in speech bubbles after a strong
// word. Purely cosmetic; often gleefully wrong on purpose.
//
// TO ADD A LINE: drop a string anywhere in the array below. That's it.
// `{word}` becomes the word just printed (e.g. "FROG"). Keep lines short —
// they render in a small bubble above a patron's card. Odds are tuned by
// REACTION in constants.js.

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

// Never serve the same line twice in a row — repeats read as a glitch.
let _lastQuip = -1;
export function randomQuip(word) {
  let i;
  do { i = Math.floor(Math.random() * PATRON_QUIPS.length); }
  while (PATRON_QUIPS.length > 1 && i === _lastQuip);
  _lastQuip = i;
  return PATRON_QUIPS[i].replace(/\{word\}/g, word);
}
