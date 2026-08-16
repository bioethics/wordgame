# Ideas — not yet designed, not yet scheduled

Things worth remembering, not yet worth building. Unlike `PATRON_OVERHAUL.md`
(a design that shipped), nothing here is approved or scoped. An idea graduates
out of this file into its own design doc once someone actually plans it.

## Meta-progression: booster packs and custom starting bags

Raised 2026-08, on the strength of a driving thought. Holding until a full
run is fun to play through top to bottom on its own — this is additive
scaffolding on top of that, and building it early would be decorating a
house with no foundation poured.

**The idea itself:**

- At the end of a run, open a "booster pack" of tiles — including special
  ones already in the game's vocabulary (trims, paints, nicks, materials),
  not new mechanics.
- Collected tiles pool in a persistent, cross-run collection. Sell tiles you
  don't want for a currency, and spend that on more booster packs.
- From that collection, assemble named "tile bags": alternate starting bags
  that swap some of the standard bag's plain tiles for upgraded ones. Your
  untouched default bag stays available (it's just `BAG_COUNTS`).
- Bring a custom bag into a new run. As the game's difficulty scales — higher
  quotas, later chapters — a built-up bag is the return on past runs, the
  thing that makes a tenth run start from a different place than the first.

**Why it's a natural fit here:** the game already has one piece of exactly
this shape. The Neologist's coined word survives its run and is folded into
every dictionary loaded afterward — persisted in its own `localStorage` key
(`js/dict.js`, `COINED_KEY`), entirely separate from the per-run save
(`state.js`, `SAVE_KEY`). A tile collection and a set of named bags would be
a second instance of the same pattern: its own key, its own shape, read at
run start alongside the dictionary and the per-run save.

**Open questions for whoever designs this for real:**

- What "round" means here — full run (win or bust), or something smaller
  (a chapter)? Booster packs presumably want to be rare enough that a bag
  is built up over many runs, not one.
- Booster-pack contents: weighted toward the existing trim/paint/nick/material
  vocabulary, or does meta-progression want tiles no in-run source offers?
  Staying inside the existing vocabulary is the cheaper build and keeps a
  "collection" from becoming a second patron roster to balance.
- How much of a standard bag a custom one may replace — some floor of plain
  tiles probably has to stay, or an endgame bag trivialises the early bag-
  driven part of the run.
- Where "difficulty scales" actually lives right now (chapter/quota growth
  within a run) versus whether this idea implies something scaling *between*
  runs too — a second axis that doesn't exist yet.
- Interaction with the Colophon and Market, which already do permanent-ish
  upgrades and tile shopping within a run — three systems all pointing at
  "make your tiles better" want a story for how they don't step on each
  other.
- A second currency (booster-pack money, distinct from in-run Coins) is a
  new piece of UI and a new thing to balance — worth asking whether Coins
  earned but unspent at a run's end could just convert instead, before
  building a parallel economy.
