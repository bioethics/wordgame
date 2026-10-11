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
