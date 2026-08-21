// Patron quips — cosmetic lines patrons pop up after a strong word.
//
// TO ADD A LINE: drop a string anywhere below. `{word}` becomes the word just
// printed. Keep lines short — they render in a small bubble. Odds are tuned by
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
  'Orgasmic!',
  'Fashionable!',
  'Ten out of ten.',
  'Laudable.',
  'Desirable.',
  'Inspirational!',
  'Pure poetry.',
  'What a lark!',
  'A+',
  'An all-time top 10 word!',

  // About the word specifically (often nonsensically)
  'I love {word}!',
  '{word}! How cute!',
  '{word}... Luscious.',
  '{word} moves me deeply',
  '{word} is good!',
  '{word}? Genius!',
  '{word}! My favourite word!',
  'I approve of {word}.',
  'Nothing satisfies like {word}.',
  'How did you think of {word}?!',
  'What a word — {word}!',
  'I’ve always loved {word}.',
  '{word} would make a great name for a band.',
  'They should print {word} on tshirts.',
  'Never seen anything like {word}!',
  'That’s the best {word} I’ve ever seen.',
  'Frame it! Frame {word} immediately!',
  'I shall name my cat {word}.',
  'I shall tell my grandchildren: {word}.',
  '{word} — now THAT’S a word.',
  'My first word was {word}!',
  '{word} is popular right now.',
  'My grandmother used to say {word}.',
  'I’d marry {word} if I could.',
  '{word}! {word}! {word}!',
  'I simply must have {word}.',
  '{word}? You ARE good.',
  'Sleek. Sophisticated. {word}.',
  'Bold. Sexy. {word}.',
  'Time + Effort = {word}.',
  'No one will ever forget {word}.',
  'I wish my father could have lived to see {word}.',
  'That’s my favourite spelling of {word}!',
  '{word}? I will meditate on this.',

  // Overwrought praise for the craft
  'Praiseworthy spelling!',
  'Flawless typesetting!',
  'Such craftsmanship!',
  'A word for the ages!',
  'History is being made!',
  'I am prouder of you than I am of my son.',
  'I never doubted you.',
  'I would die for you.',

  // Faintly unhinged
  'Did you rehearse that?',
  'I wish I could spell words.',
  'That’s a word I’d take home to mother.',
  'Is this what emotion feels like?',
  'I enjoy those letters!',
  'Correct! {word}!',
  'I have no notes.',
  'I feel deep satisfaction.',
  'Where do you get your ideas from?',
  'Every house should have a {word}.',
  'What a show of force!'
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
