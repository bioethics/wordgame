# Great Work

A vanilla-JS, no-build word game: print a word each turn from your rack, hire
"patrons" (passive modifiers, hired between pages) to survive escalating quotas
across chapters. Full architecture and design notes: README.md.

Run locally: `python3 -m http.server 8431` from the repo root, then open
`http://localhost:8431`.

## Card copy: state the rule, not the feeling

Every patron (`js/patron-cards.js`) and editor (`js/boss-cards.js`) has a `name`
(unlimited flavour) and a `desc` (the rule). Keep them separate.

- **`desc` states the mechanic, plainly.** No personification ("he takes",
  "doesn't ask how"), no scene-setting, no backstory. If the NAME is already
  doing the personality work (Fifteen-fingered Frank, The Bloodless Bohemian
  Bookbinder), the desc doesn't need to do it again.
- **Don't restate a rule you already stated.** A second sentence that
  re-describes the first in flowerier words is the most common failure here —
  cut it.
- **Reuse names, not explanations.** If a material, trim or nick already has its
  own name and tooltip (`MATERIAL_TEXT`, `TRIMS`, `NICKS` in
  constants.js/text.js), name it and stop: "revived in `{GHOST_METAL}`", "struck
  in Blind emboss" — not a restatement of what those mean. The tile explains
  itself on tap.
- **No hard length budget.** A patron with five conditions (The Beadle, The
  Ragman) needs more room than one with none (The Izzard). But if a desc is
  creeping past two or three short sentences, that's usually a sign the extra
  words are flavour, not rule — cut before you pad.
- **Trust the player, but don't go silent.** Don't spell out what a player will
  safely learn by playing one turn, especially where the game already shows it
  live (a per-trigger note, a tally on tap). DO say something if leaving it out
  lets them build a wrong mental model *before* they have any signal to correct
  it — the SHAPE of an effect (does it decay? one-time or ongoing?), or a
  ceiling they'd otherwise overshoot in their head. Isaac-style descriptions
  that tell you nothing are the opposite failure, and just as bad.
- **Precision beats brevity when they conflict.** A shorter phrase that reads as
  a different rule than the one implemented is worse than a longer, exact one.
  ("1 point per chapter played" sounds like a recurring rate; the rule is a
  one-time grant sized by the chapter you're on when it fires — "Points equal to
  the current chapter" says the true thing just as briefly.)

**Check the mechanic in `js/patrons.js` before rewriting its card.** The
Abecedarian was documented for a while as paying out as the case "nears
completion"; it actually pays from the very first sort, and quickens a third of
the way in. Prose written from memory of the flavour drifts away from the code.

## Two looks, one board

The board has two looks (Settings → Look): **the Bench**, the default, and
**Retro**, the original. Retro is `css/style.css` untouched. Every rule of the
bench is in `css/bench.css`, scoped to `html[data-look="bench"]`, so the two
never bleed. Add furniture only the bench has (the stick's scale, the sheet's
lines, the rule on a card) by rendering it always, putting it away in
`style.css` (`display: none`) and bringing it out in `bench.css` — never by
branching the DOM on the look. The full-screen sheets (Market, Black Market,
Colophon) are not yet restyled for the bench.

## Elsewhere

Flavour is welcome, at length, in code comments and in README.md — nobody
playing the game reads those. It is the `desc` field specifically, and the
player-facing strings in `js/text.js`, that stay plain.
