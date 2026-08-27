# Sound audit — the moments that pass in silence

The synth in `js/anim.js` is well developed and the scoring pass is richly scored.
The gap is almost entirely in **the quiet minute before you press Print** — composing,
discarding, browsing — plus the sheets, which are the largest scene changes in the
game and make no sound at all.

Twenty silent moments, grouped. Each has five candidate sounds to audition in
`docs/sfx-audition.html` (open it in a browser, or see the published bench).

## I · Composing the word

| Proposed | What is silent | Call sites |
| --- | --- | --- |
| `sfx.place()` | A tile set into the word groove — the most frequent act in the game | `js/drag.js:168`, `js/drag.js:127`, `js/main.js:1371` |
| `sfx.retrieve()` | A tile taken back to the rack | `js/drag.js:170`, `js/drag.js:131`, `js/main.js:1358` |
| `sfx.reorder()` | A tile slid to a new place within its row | `js/drag.js:128`, `js/drag.js:132` |
| `sfx.lift()` | A drag beginning — the ghost appears with no acknowledgement | `js/drag.js:107`, `js/drag.js:230` |
| `sfx.clear()` | The whole word emptied at once (Esc / Clear) | `js/main.js:1353`, `js/main.js:1380`, `js/state.js:615` |
| `sfx.shuffle()` | The rack re-dealt in place (Space / Shuffle) | `js/main.js:1356`, `js/main.js:1382`, `js/state.js:619` |
| `sfx.flip()` | A dual tile turned over | `js/drag.js:218`, `js/main.js:2086` |

## II · Discarding and the workbench

| Proposed | What is silent | Call sites |
| --- | --- | --- |
| `sfx.select()` | A tile marked for discard, or picked as a tool's target | `js/drag.js:164`, `js/drag.js:149` |
| `sfx.deselect()` | The mark taken off — currently indistinguishable from marking | same |
| `sfx.arm()` | Discard mode armed, or a sundry taken up | `js/main.js:1272`, `js/main.js:1725` |
| `sfx.disarm()` | The mode cancelled, the tool put back | `js/main.js:143`, `js/main.js:154` |
| `sfx.nudge()` | A tap the board refuses — cursed/lent tiles, "one at a time", a ghost. These log a warning and play nothing; `bad()` is too heavy for one tap | `js/drag.js:150-154`, `js/drag.js:165-166` |

## III · The shelf

| Proposed | What is silent | Call sites |
| --- | --- | --- |
| `sfx.seat()` | A patron dropped into a new seat — this changes the rule of precedence | `js/drag.js:294`, `js/state.js:1349` |
| `sfx.dismiss()` | A patron dismissed, or a ghost let go. Buying plays `coin()`; the refund plays nothing | `js/main.js:1814`, `js/main.js:1840` |

## IV · Reading and the sheets

| Proposed | What is silent | Call sites |
| --- | --- | --- |
| `sfx.inspect()` | A popover opening. Touch gets a 12 ms vibration; a mouse gets nothing | `js/drag.js:69`, `js/main.js:1865`, `js/drag.js:430` |
| `sfx.sheetOpen()` | Market, Colophon, Black Market, manuscript, bag/discard inspectors, graveyard, Settings, Chamber — nine sheets, none of them sounded | `js/main.js:1172`, `js/main.js:1147`, `js/render.js:1251`, `js/render.js:1301`, `js/render.js:594` |
| `sfx.sheetClose()` | The same nine closing, including leaving the fair for the next page | `js/main.js:1180`, `js/render.js:1400`, `js/main.js:1805`, `js/main.js:2127` |
| `sfx.page()` | A view change inside a sheet — stall in/out, the collection. The Chamber's tabs already use `draw()` for this, so the Market is inconsistent with our own precedent | `js/sheets.js:1518`, `js/sheets.js:1526`, `js/sheets.js:1531` (cf. `js/sheets.js:1605`) |

## V · The page's own rhythm

| Proposed | What is silent | Call sites |
| --- | --- | --- |
| `sfx.chapter()` | The chapter banner. Page-complete rides `win()`, a boss reveal rides `bad()`; a new chapter has nothing | `js/main.js:1223`, `js/main.js:2204` |
| `sfx.quotaMet()` | The quota bar crossing its target mid-count — the moment the page is actually made | `js/render.js:762`, `js/main.js:996` |

## Already sounded — left alone

`draw` · `land` · `discard` · `file` · `tick` · `chime` · `mult` · `aura` · `coin` ·
`gain` · `crank` · `total` · `win` · `lose` · `bad` · `burn`, plus buying, selling,
rerolling, Colophon picks, Chamber tabs, and binning a sundry at the bench.
