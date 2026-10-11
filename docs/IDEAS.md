# Ideas — not yet designed, not yet scheduled

Things worth remembering, not yet worth building. Nothing here is approved or
scoped — an idea leaves this file when someone actually plans it.

## The Medium: seeing the bag in order

Raised 2026-08, when the name was freed up — the patron who raises destroyed
tiles turned out to need to be *already dead* (so The Ripper's knife can turn
on it), and became The Revenant. "The Medium" is too good a name to waste on
nothing, and the obvious trade for a medium is not raising the dead but
**seeing what is coming**.

**The idea itself:** a seat that shows you the bag in draw order — the next few
tiles, or all of them. Nothing about the draw changes; you simply know it.

**Why it might be good:** every decision in the game is currently made against
an unknown bag. Knowing the next three tiles turns discarding from a shrug into
arithmetic ("throw these two, I get the Q and an E"), makes The Fountain's
return-to-bag legible, and gives the azure guild — whose whole business is
latitude — something that widens knowledge rather than spelling.

**Open questions for whoever designs this for real:**

- How much is shown: the next N (3? 5?), or the whole bag in order? The whole
  bag is a solver's tool and might be exhausting to read; the next three is a
  glance. Showing too much risks turning a light word game into bookkeeping.
- Where it is shown. The bag button already opens an inspector (`openInspector`
  in `js/render.js`) which lists the bag SORTED, deliberately — it is a
  "what do I still own" view, not a "what comes next" view. A medium's view is
  the same modal with the sort removed and a "next" marker, which is cheap, or
  a strip on the board, which is not.
- The Magpie already bends the draw (weighted, in `drawFromBag`), so the order
  shown has to be the order that will actually happen — the weighting is rolled
  at draw time, not at deal time, so with both seated the preview would be a
  lie. Either the Magpie's weighting moves to the page deal, or the two seats
  are declared to conflict, or the medium shows the bag AS IT STANDS and says
  so.
- Rarity and cost: information is quietly one of the strongest things a seat
  can sell, and it never stops paying.

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

**Settled, 2026-10:**

- **A pack is opened at the end of a full run**, not a chapter.
- **Packs hold existing tile types only**: trims, paints, nicks, materials.
  Nothing a pack deals is a tile the run itself could never offer.
- **A custom bag may replace at most a quarter of the standard bag**: 13 of
  the 54 tiles in `BAG_COUNTS`, rounding down. The quarter is a first guess,
  there to be tuned.
- **Difficulty does not climb between runs.** The difficulty picker on the
  prospectus (`DIFFICULTIES` in `js/constants.js`) is the only dial; what a
  run carries forward is the bag, and nothing else.
- **No clash with the Colophon or the Market.** A custom bag is the set of
  tiles a run *starts* with, settled once before page 1. The Market and the
  Colophon improve tiles during a run. The two never act at the same time.
- **Coins do not convert.** Unspent Coins die with the run, as they do now.
  The pack currency comes from selling tiles out of the collection, and only
  from that.
- **The way in is the prospectus** (`js/start.js`): beside look, room and
  difficulty, a link to a sheet where bags are built and one is chosen for
  the run.

**Where it would plug in:**

- `newRun({ difficulty })` in `js/state.js` already takes the prospectus's
  choice; a chosen bag rides beside it and replaces `buildStarterCollection()`,
  which is the one place the starting case is made.
- The Market's **quire** (`rollQuire` in `js/market.js`) is a three-tile pack
  already — one well-dressed sort, one middling, one bare, bought as a lot.
  `randomSpecialTile` deals from the same letter pool the Market does, so it
  already skips `EXCLUSIVE_LETTERS` and the Q. It never deals a material,
  though (that is the alley's and the wrapped tile's business), so a pack
  that can hold one needs a roll of its own.
- `tilePrice` (`js/market.js`) is a ready-made basis for what a tile sells for.

**Still open:**

- **Which endings earn a pack.** A run can bust before Chapter X, be won at
  Chapter X, or be won and carried into the Appendices until it busts. Is the
  pack handed over at the win, at the final bust, or both? Does a won run earn
  more than a lost one?
- **Is a bag a loadout or a spend?** If the run is dealt *copies* of the bag's
  tiles, anything that destroys a tile mid-run (`trashFromCollection`) costs
  the collection nothing, and one gilded K can sit in several bags at once. If
  the run takes the tiles themselves, every destroyed sort is lost for good,
  which is a much harsher game.
- **Does a replacement have to match its letter?** Swapping a plain K for a
  gilded K leaves the bag's spelling alone. Swapping a plain E for a gilded Z
  changes it, and thirteen such swaps could strip out most of the vowels.
  Either a replacement keeps its letter, or the quarter needs a vowel floor
  of its own.
- Pack size, pack price, the sale price of a tile, and what the currency is
  called.
