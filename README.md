# Folio ❦

*A word-forging roguelike.* You run a small print house: draw letter tiles from
the bag, compose words, and **PRINT** them to meet each page's quota. Clear
pages, survive each chapter's **Deadline**, spend your coins at **the Market**,
and finish all ten chapters of the folio.

## Running it

Any static server from the project root works:

```
python -m http.server 8431
# then open http://localhost:8431
```

(ES modules don't run from `file://`, and the bundled `wordlist.txt` — 64k
words — is fetched over HTTP. A custom list can be loaded in Settings.)

`node tools/build-single.mjs` bundles the whole game — wordlist included —
into one HTML file for playtesting anywhere.

### Playing on a phone

The game is touch-native: tap a rack tile to play it, tap a word tile to take
it back, drag to reorder, and long-press any tile or patron for its details
(long-press is also how you flip a dual tile on touch). To test on a device,
serve on your LAN and open the machine's address from the phone:

```
python -m http.server 8431 --bind 0.0.0.0
# on the phone: http://<your-computer's-ip>:8431
```

## How a word scores

```
score = Points × Mult
```

- **Points** — the sum of every tile's value (after trims and nicks).
- **Mult** — the product of the five colour multipliers. Each colour starts at
  ×1 and every painted letter of that colour in the word raises it by 1
  (×2, ×3, …); purple trims raise a fifth multiplier in half-steps (×1.5, ×2,
  ×2.5, …). Spreading colours multiplies together: one letter each of two
  colours is ×2×2 = ×4, where two of the same colour is only ×3.

The readout shows a live projection — including a chip per colour — and
hovering or long-pressing any tile, on the board or in the market or the draft,
spells out everything it does. Nothing is summarised beneath market cards; the
tile itself is the documentation. On print, the score replays tile by tile: Points land, nicks fire, each colour's
multiplier lights up, then the patrons weigh in.

## The pieces

A tile is a **letter** (or ligature), optionally **painted** a colour, plus an
optional **trim** and **nick**.

| Layer | Options |
| --- | --- |
| Paint | crimson / azure / jade / amber — each raises its colour's multiplier by 1 |
| Trim | **Gold** pays 1 Coin · **Silver** +6 Points · **Copper** refreshes 1 Discard · **Mercury** slips back into the bag instead of the discard pile · **Purple** raises the fifth multiplier by 0.5 |
| Nick | A notch cut into one edge; the notched side is the direction. **Right** ×3 Points to everything on its right · **Left** ×3 to its left. Nicks don't stack — a letter is multiplied once at most. While you compose, an affected tile's corner number becomes the multiplied value, restyled, rippling outward from the notch. |
| Letterform | Dual tiles hold two letters (flip to switch; each face painted independently) · Ligatures ING · ED · TCH spell several letters from one tile |

A dual tile shares its trim and nick across both faces; only the letters and
their paint swap.

**The opening draft** — before page 1 you kit out the press from a free
spread: 1 patron of 3, 2 paints of 4, 4 tiles of 10. No coins involved. The
starting collection ships unpainted, so those two paints are where colour
enters the run.

**The Market** (between pages) keeps a fixed layout with churning contents:
3 patrons, 4 tiles, 2 **sundries**, and 2 **stalls** drawn from a roster of
five. *New offers* re-rolls the patrons, tiles and sundries; the stalls stay
put. Tiles live in your **collection**; each page the whole collection
shuffles into the **bag**, and printed or discarded tiles wait in the
**discard pile**.

**Sundries** are consumables kept on the **workbench** (two slots, beside the
patron shelf). The **paint tube**: tap it mid-page, tap up to 2 tiles
anywhere on the board — rack or half-composed word alike — and tap the tube
again to paint them its colour, permanently. The **reshuffle**: no target to
pick, just banked until you spend it — on the Market's own offers (free,
doesn't touch the escalating reroll price) or on a Colophon pick. (The
random-scatter paint pots survive only in the opening draft.)

**Stalls** are services: the **Smelter** (trash a tile), the **Painter**
(paint any letter a colour of your choice), the **Gilder** (proposes trims on
6 of your untrimmed tiles; commission your favourite), the **Stereotyper**
(clone any tile), and the **Restorer** (strip a tile back to bare metal).
Every purchase doubles that stall's price for the rest of the visit; prices
reset when the next market opens. The Smelter starts at 2 Coins, the rest at 1.

**Patrons** grant standing boons — five seats to start (the Colophon can add
more), dismissable for half their cost (hover for the ✕, or tap the patron on
touch).

**The Colophon** — when a chapter's Deadline is cleared and the Market is
done, choose one of three permanent upgrades before the next chapter begins:
+1 hand size, +1 discard, +1 patron seat, +1 workbench slot, or a paint pot of
a colour of your choice. At least one non-paint option is always offered
while one remains available, and each of the eight possible picks caps out
at 2 takes across a run. *Skip* declines all three for 2 Coins instead — the
same consolation the run pays out on its own once every option is exhausted
(only reachable deep into the appendices).

**Discarding** — press *Discard* to arm it, tap the tiles to throw away, then
press it again to confirm (press with nothing selected to cancel).

**Patron reactions** — after a strong-enough word, a seated patron may pop up
a one-line, often gleefully wrong reaction. Purely cosmetic; the odds scale
with how many "average words" that one word alone was worth against the
page's quota, so the curve never needs retuning as quotas climb.

**Run structure** — 10 chapters × 3 pages; the third page of each chapter is a
Deadline with a steeper quota and a coin bonus. 5 words and 2 discards per
page. Clearing chapter X wins the run; the appendices (endless mode) continue
beyond.

## Where to tune the design

| Knob | Where |
| --- | --- |
| Quota curve (base, growth, page factors) | `js/constants.js` → `quotaFor`, `QUOTA_BASE`, `QUOTA_GROWTH` (bumped 1.5→1.55 alongside the Colophon — a first guess, watch chapters 7-10 when playtesting) |
| Trim effects & prices | `js/constants.js` → `TRIMS` (effects live in `js/scoring.js`) |
| Purple trim step size | `js/constants.js` → `PURPLE_TRIM_STEP` |
| Nick multiplier & prices | `js/constants.js` → `NICK_MULT`, `NICKS` |
| Tube price / tiles per tube / workbench slots | `js/constants.js` → `TUBE_PRICE`, `TUBE_TILES`, `SUNDRY_SLOTS` |
| Reshuffle sundry price | `js/constants.js` → `RESHUFFLE_PRICE` |
| Stall roster, base prices, gilder range | `js/constants.js` → `STALL_DEFS`, `STALLS_PER_SHOP`, `GILDER_RANGE`, `SMELT_MIN_COLLECTION` |
| Letters per draft paint pot | `js/constants.js` → `PAINT_PER_POT` |
| Opening draft spread & pick counts | `js/constants.js` → `DRAFT` |
| How loaded offered tiles are | `js/constants.js` → `FEATURE_CHAIN_CHANCE`, `MAX_FEATURES` (one feature free, then keep rolling); generation in `js/market.js` → `randomSpecialTile` |
| Rewards & interest | `js/constants.js` → `REWARD` (base bumped 4→5 alongside the Colophon) |
| Colophon roster, offer count, repeat cap, skip grant | `js/constants.js` → `UPGRADE_OFFERS`, `MAX_UPGRADE_REPEATS`, `SKIP_COIN_GRANT`; definitions in `js/upgrades.js` |
| Patron reaction odds | `js/constants.js` → `REACTION`; the lines themselves in `js/quips.js` — a flat array, add more any time |
| Words / discards / seats per page | `js/constants.js` |
| Patron roster, costs, effects | `js/patrons.js` |
| Animation step timings | `js/constants.js` → `ANIM` (all divided by the Settings speed slider) |
| Chapter names | `js/constants.js` → `CHAPTER_NAMES` |

## Architecture

| File | Role |
| --- | --- |
| `js/state.js` | game state, save/load (`folio_save_v1`, schema v7), settings, tile ops, painting, sundries, effective hand/seat/workbench sizes, the ledger |
| `js/scoring.js` | pure score computation — returns a step-by-step *script* the UI replays |
| `js/patrons.js` | patron definitions |
| `js/upgrades.js` | the Colophon's upgrade definitions (pure data, no logic) |
| `js/colophon.js` | the Colophon's ephemeral screen state: rolling, capping, applying, reshuffling |
| `js/quips.js` | patron reaction lines — a flat, editable array; no logic beyond `{word}` substitution |
| `js/market.js` | market state: offers, buying, sundries, stalls, rerolls |
| `js/draft.js` | the opening draft: free spread, picks, applying them |
| `js/render.js` | board-side DOM: tiles, shelf, workbench, status, readout, popovers, overlays |
| `js/sheets.js` | the full-screen sheets — Market, stalls, Colophon, draft — HTML and click handling, with game flow injected from main.js |
| `js/anim.js` | flights, floaters, tweens, sparkles, WebAudio sfx — every duration respects the speed setting |
| `js/main.js` | orchestration: submit cinematic, page/chapter flow, input, settings |
| `js/drag.js` | pointer input: tap / drag / long-press for rack and word, mouse and touch alike |
| `js/dict.js` | dictionary loading/caching (also reads a `window.FOLIO_WORDLIST` global, for single-file bundles) |

Scoring is deliberately pure (`computeScore` never mutates state), so the same
function powers the live preview, the tooltips, and the replayed cinematic —
they can't disagree.

The **manuscript** is the strip under the board: every word printed this run,
set as one long line of type, newest last, the earlier ones running off the
left edge under a fade. It's the book you're actually making. Messages (a
rejected word, a purchase, a hint) borrow the strip for a few seconds and it
settles back on its own — so nothing needs to announce the page or chapter
there, since the status row already does.

The **ledger** (❦ in the header) is the same words with their scores, page by
page. A *Developer* section in Settings has shortcuts: +20 Coins, open the Market,
clear the current page. The console exposes `window.folio = { state, settings }`.
