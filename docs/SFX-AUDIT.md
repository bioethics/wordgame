# Sound audit — the moments that pass in silence

The synth in `js/anim.js` is well developed and the scoring pass is richly scored.
The gap is almost entirely in **the quiet minute before you press Print** — composing,
discarding, browsing — plus the sheets, which are the largest scene changes in the
game and make no sound at all.

Twenty silent moments, grouped. Each was auditioned against five candidates in
`docs/sfx-audition.html` (open it in a browser); the **Chosen** column is what
shipped, and every one is wired at the call sites listed. Two were deliberately
left silent.

## I · Composing the word

| Voice | What was silent | Chosen | Wired at |
| --- | --- | --- | --- |
| `sfx.place()` | A tile set into the word groove — the most frequent act in the game | Felt-lined | `js/drag.js` tap + drop, `js/main.js` keyboard |
| `sfx.retrieve()` | A tile taken back to the rack | Paper slide | `js/drag.js` tap + drop, `js/main.js` Backspace |
| `sfx.reorder()` | A tile slid to a new place within its row | A spacer dropping | `js/drag.js` `endDrag()` |
| `sfx.lift()` | A drag beginning — the ghost appears with no acknowledgement | A tick of suction, tuned quieter still | `js/drag.js` `startDrag()` |
| `sfx.clear()` | The whole word emptied at once (Esc / Clear) | Dropped in a heap | `js/main.js` `clearOrCancel()` |
| `sfx.shuffle()` | The rack re-dealt in place (Space / Shuffle) | The bag shaken | `js/main.js` space + the Shuffle button |
| `sfx.flip()` | A dual tile turned over | Turned over | `js/drag.js` right-click, `js/main.js` the popover’s Flip |

## II · Discarding and the workbench

| Voice | What was silent | Chosen | Wired at |
| --- | --- | --- | --- |
| `sfx.select()` | A tile marked for discard, or picked as a tool's target | Marked up | `js/drag.js` `markSound()` |
| `sfx.deselect()` | The mark taken off — was indistinguishable from marking by ear | Unmarked | `js/drag.js` `markSound()` |
| `sfx.arm()` | Discard mode armed, or a sundry taken up | A latch thrown | `js/main.js` `doDiscard()`, `useSundry()` |
| `sfx.disarm()` | The mode cancelled, the tool put back | The latch released | `js/main.js` `cancelDiscardMode()`, `cancelSundryMode()` — only when not `quiet` |
| `sfx.nudge()` | A tap the board refuses — cursed/lent tiles, "one at a time", a ghost. These log a warning and play nothing; `bad()` is too heavy for one tap | Muffled on felt | `js/drag.js` `markSound()` |

## III · The shelf

| Voice | What was silent | Chosen | Wired at |
| --- | --- | --- | --- |
| `sfx.seat()` | A patron dropped into a new seat — this changes the rule of precedence | A chair pulled in | `js/drag.js` `endShelfPress()` |
| `sfx.dismiss()` | A patron dismissed, or a ghost let go. Buying plays `coin()`; the refund plays nothing | The door | `js/main.js` `dismissPatron()`, the ghost ✕ |

## IV · Reading and the sheets

| Voice | What was silent | Chosen | Wired at |
| --- | --- | --- | --- |
| `sfx.inspect()` | A popover opening. Touch gets a 12 ms vibration; a mouse gets nothing | **left silent** | — nothing wired |
| `sfx.sheetOpen()` | Market, Colophon, Black Market, manuscript, bag/discard inspectors, graveyard, Settings, Chamber — nine sheets, none of them sounded | Brass latch and swing | `js/main.js` — all nine sheets |
| `sfx.sheetClose()` | The same nine closing, including leaving the fair for the next page | **left silent** | — nothing wired |
| `sfx.page()` | A view change inside a sheet — stall in/out, the collection | A dry tick | `js/sheets.js` stall in/out, collection, Chamber tabs |

## V · The page's own rhythm

| Voice | What was silent | Chosen | Wired at |
| --- | --- | --- | --- |
| `sfx.chapter()` | The chapter banner. Page-complete rides `win()`, a boss reveal rides `bad()`; a new chapter has nothing | One struck bell | `js/main.js` `advancePage()`, `beginRun()` |
| `sfx.quotaMet()` | The quota bar crossing its target mid-count — the moment the page is actually made | The gauge clicks over | `js/render.js` `quotaCrossed()` — the crossing, not the state |

`sfx.inspect()` and `sfx.sheetClose()` were deliberately left silent, so neither
exists in `anim.js`: inspecting is reading rather than acting, and a sheet closing
is its own silence once the opening is sounded.

## Already sounded — left alone

`draw` · `land` · `discard` · `file` · `tick` · `chime` · `mult` · `aura` · `coin` ·
`gain` · `crank` · `total` · `win` · `lose` · `bad` · `burn`, plus buying, selling,
rerolling, Colophon picks, and binning a sundry at the bench.

One existing sound changed: the Testing Chamber's tabs used `draw()` as a stand-in
for a page turn, and now use `page()` like every other view change.

## Verified

Every voice was exercised in a real browser and fingerprinted by the oscillator
frequencies it starts, so each call site is confirmed to play the intended recipe —
and the two silent picks confirmed to play nothing.
