# Folio ❦

*A word-forging roguelike.* You run a small print house: draw letter tiles from
the bag, compose words, and **PRINT** them to meet each page's quota. Clear
pages, survive each chapter's **Deadline**, spend your coins at **the
Foundry**, and finish all ten chapters of the folio.

## Running it

Any static server from the project root works:

```
python -m http.server 8431
# then open http://localhost:8431
```

(ES modules don't run from `file://`, and the bundled `wordlist.txt` — 64k
words — is fetched over HTTP. A custom list can be loaded in Settings.)

### Playing on a phone

The game is touch-native: tap a rack tile to play it, tap a word tile to take
it back, drag to reorder, and long-press any tile or patron for its details
(long-press is also how you flip a dual tile on touch). To test on a device,
serve on your LAN and open the machine's address from the phone:

```
python -m http.server 8431 --bind 0.0.0.0
# on the phone: http://<your-computer's-ip>:8431
```

For remote testing without a shared network, host the repo as a static site
(GitHub Pages pointed at the repository root works as-is).

## How a word scores

```
score = Points × Mult
```

- **Points** — the sum of every tile's value (after casts and auras).
- **Mult** — the multiplier, starts at 1. Raised by:
  - Resonant tiles (+1 Mult each)
  - Colour sets: matching coloured tiles in a word add Mult
    1 / 2 / 3 / 4 / 5+ matching tiles → +0.5 / +1 / +2 / +3 / +4 Mult
  - Patrons (various amounts)
  Multiple colours stack — each adds its own Mult bonus.

While composing, the readout shows a live projection, and hovering (or
long-pressing) a tile in the word shows exactly what it will contribute. When
you print, the score is replayed tile by tile: each tile pops and pays its
Points, auras flash and double their targets, colour sets glow, then each
patron weighs in.

## The pieces

**Tiles** live in your **collection** (open the Foundry's *type case* to see
it). At the start of every page the whole collection is shuffled into the
**bag**; printed and exchanged tiles land in the **spent tray** until the page
ends. Both are tappable to inspect.

| Kind | Effect |
| --- | --- |
| Gilded | pays 1 Coin when printed |
| Bold | scores ×2 Points |
| Master | +6 Points when printed |
| Resonant | +1 Mult when printed |
| Crescendo » | doubles the Points of every tile to its right |
| Echo « | doubles the Points of every tile to its left |
| Halo «» | doubles the Points of the tiles directly beside it |
| Colours | crimson / azure / jade / amber — matching tiles add Mult (see above) |
| Dual cast | two letters on one tile; right-click (or long-press) to flip |
| Ligatures | ING · ED · TCH cast as one piece of type |

Auras stack multiplicatively when several cover the same tile.

**Patrons** (24 of them) grant standing boons — bought at the Foundry, up to
five seats, dismissable for half their cost (hover for the ✕, or tap the
patron on touch).

**Exchanging** — press *Exchange* to arm it, tap the tiles you want to swap
out, then press it again to confirm (press with nothing selected to cancel).

**Run structure** — 10 chapters × 3 pages; the third page of each chapter is a
Deadline with a steeper quota and a coin bonus. 5 words and 3 exchanges per
page. Clearing chapter X wins the run; the appendices (endless mode) continue
beyond.

## Where to tune the design

| Knob | Where |
| --- | --- |
| Quota curve (base, growth, page factors) | `js/constants.js` → `quotaFor`, `QUOTA_BASE`, `QUOTA_GROWTH` |
| Colour set bonus ladder | `js/constants.js` → `COLOUR_SET_BONUS` |
| Tile/cast/aura prices | `js/constants.js` → `CASTS`/`AURAS` price fields, `TILE_BASE_PRICE`; assembly in `js/foundry.js` → `tilePrice` |
| Shop offer probabilities | `js/foundry.js` → `randomTileOffer` |
| Rewards & interest | `js/constants.js` → `REWARD` |
| Words / exchanges / seats per page | `js/constants.js` |
| Patron roster, costs, effects | `js/patrons.js` |
| Animation step timings | `js/constants.js` → `ANIM` (all divided by the Settings speed slider) |
| Chapter names | `js/constants.js` → `CHAPTER_NAMES` |
| Starting coloured tiles | `js/constants.js` → `STARTER_COLOURED` |

## Architecture

| File | Role |
| --- | --- |
| `js/state.js` | game state, save/load (`folio_save_v1`, schema v2), settings (`folio_settings_v1`), tile ops |
| `js/scoring.js` | pure score computation — returns a step-by-step *script* the UI replays |
| `js/patrons.js` | patron definitions |
| `js/foundry.js` | shop state: offers, buying, smelting, rerolls |
| `js/render.js` | all DOM construction (board, readout, modals, popovers, overlays) |
| `js/anim.js` | flights, floaters, tweens, sparkles, WebAudio sfx — every duration respects the speed setting |
| `js/main.js` | orchestration: submit cinematic, page/chapter flow, input, settings |
| `js/drag.js` | pointer input: tap / drag / long-press for rack and word, mouse and touch alike |
| `js/dict.js` | dictionary loading/caching (also reads a `window.FOLIO_WORDLIST` global, for single-file bundles) |

Scoring is deliberately pure (`computeScore` never mutates state), so the same
function powers the live preview, the tooltips, and the replayed cinematic —
they can't disagree.

A *Developer* section in Settings has shortcuts: +20 Coins, open the Foundry,
clear the current page. The console exposes `window.folio = { state, settings }`.
