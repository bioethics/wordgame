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
  'Gratifying!',
  'Pleasant!',
  'Tasty!',
  'Spicy!',
  'Stirring!',
  'Fashionable!',
  'Ten out of ten.',
  'Laudable.',
  'Pure poetry.',

  // About the word specifically (often nonsensically)
  'I love {word}!',
  '{word} moves me deeply',
  '{word} is good!',
  '{word}? Genius!',
  '{word}! My favourite!',
  'What a word — {word}!',
  'I’ve always loved {word}.',
  'They should print {word} on money.',
  'Never seen anything like {word}!',
  'That’s the best {word} I’ve ever seen.',
  'Frame it! Frame {word} immediately!',
  'I named my cat {word}.',
  'I shall tell my grandchildren: {word}.',
  '{word} — now THAT’S a word.',
  'My first word was {word}!',
  '{word} is popular right now.',
  'My grandmother used to say {word}.',
  'I’d marry {word} if I could.',
  '{word}! {word}! {word}!',
  'I must simply have {word}.',
  '{word}? You ARE good.',
  'Sleek. Sophisticated. {word}.',
  'No one will ever forget {word}.',
  'I wish my father could have lived to see {word}.',
  'That’s my favourite spelling of {word}!',

  // Overwrought praise for the craft
  'Praiseworthy spelling!',
  'Flawless typesetting!',
  'Such craftsmanship!',
  'The ink itself applauds!',
  'A word for the ages!',
  'History is being made!',
  'I am prouder of you than I am of my son.',
  ' never doubted you.',

  // Faintly unhinged
  'Did you rehearse that?',
  'I wish I could spell words.',
  'That’s a word I’d take home to mother.',
  'I’m told this is what winning feels like.',
  'I enjoy those letters!',
  'Correct! {word}!',
  'I have no notes.',
  'I feel satisfaction.',
  'I will be thinking on this.',
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
