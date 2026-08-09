# Folio ❦

*A word-forging roguelike.* You run a small print house: draw letter tiles from
the bag, compose words, and **PRINT** them to meet each page's quota. Clear
pages, survive each chapter's **Deadline**, spend your coins at **the Shop**,
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
hovering (or long-pressing) a tile shows exactly what it contributes. On
print, the score replays tile by tile: Points land, nicks fire, each colour's
multiplier lights up, then the patrons weigh in.

## The pieces

A tile is a **letter** (or ligature), optionally **painted** a colour, plus an
optional **trim** and **nick**.

| Layer | Options |
| --- | --- |
| Paint | crimson / azure / jade / amber — each raises its colour's multiplier by 1 |
| Trim | **Gold** pays 1 Coin · **Silver** +6 Points · **Copper** refreshes 1 Exchange · **Purple** raises the fifth multiplier by 0.5 |
| Nick | **Right »** ×3 Points to everything on its right · **Left «** ×3 to its left · **Side «»** ×5 to both neighbours |
| Letterform | Dual tiles hold two letters (flip to switch; each face painted independently) · Ligatures ING · ED · TCH are one piece of type |

Nicks stack multiplicatively when several cover the same tile. A dual tile
shares its trim and nick across both faces; only the letters and their paint
swap.

**The opening draft** — before page 1 you kit out the press from a free
spread: 1 patron of 3, 2 paints of 4, 4 tiles of 10. No coins involved. The
starting collection ships unpainted, so those two paints are where colour
enters the run.

**The Shop** (between pages) offers patrons, tiles, and **paint pots** — a pot
paints 3 random unpainted letters in your collection its colour. Tiles live in
your **collection**; each page the whole collection shuffles into the **bag**,
and printed or exchanged tiles wait in the **spent tray**.

**Patrons** grant standing boons — up to five seats, dismissable for half
their cost (hover for the ✕, or tap the patron on touch).

**Exchanging** — press *Exchange* to arm it, tap the tiles to swap out, then
press it again to confirm (press with nothing selected to cancel).

**Run structure** — 10 chapters × 3 pages; the third page of each chapter is a
Deadline with a steeper quota and a coin bonus. 5 words and 2 exchanges per
page. Clearing chapter X wins the run; the appendices (endless mode) continue
beyond.

## Where to tune the design

| Knob | Where |
| --- | --- |
| Quota curve (base, growth, page factors) | `js/constants.js` → `quotaFor`, `QUOTA_BASE`, `QUOTA_GROWTH` |
| Trim effects & prices | `js/constants.js` → `TRIMS` (effects live in `js/scoring.js`) |
| Purple trim step size | `js/constants.js` → `PURPLE_TRIM_STEP` |
| Nick multipliers & prices | `js/constants.js` → `NICKS` |
| Paint pot price / letters per pot | `js/constants.js` → `PAINT_PRICE`, `PAINT_PER_POT` |
| Opening draft spread & pick counts | `js/constants.js` → `DRAFT` |
| Shop offer probabilities | `js/foundry.js` → `randomTileOffer` |
| Rewards & interest | `js/constants.js` → `REWARD` |
| Words / exchanges / seats per page | `js/constants.js` |
| Patron roster, costs, effects | `js/patrons.js` |
| Animation step timings | `js/constants.js` → `ANIM` (all divided by the Settings speed slider) |
| Chapter names | `js/constants.js` → `CHAPTER_NAMES` |

## Architecture

| File | Role |
| --- | --- |
| `js/state.js` | game state, save/load (`folio_save_v1`, schema v3), settings, tile ops, painting |
| `js/scoring.js` | pure score computation — returns a step-by-step *script* the UI replays |
| `js/patrons.js` | patron definitions |
| `js/foundry.js` | shop state: offers, buying, painting, smelting, rerolls |
| `js/draft.js` | the opening draft: free spread, picks, applying them |
| `js/render.js` | all DOM construction (board, readout, modals, popovers, overlays) |
| `js/anim.js` | flights, floaters, tweens, sparkles, WebAudio sfx — every duration respects the speed setting |
| `js/main.js` | orchestration: submit cinematic, page/chapter flow, input, settings |
| `js/drag.js` | pointer input: tap / drag / long-press for rack and word, mouse and touch alike |
| `js/dict.js` | dictionary loading/caching (also reads a `window.FOLIO_WORDLIST` global, for single-file bundles) |

Scoring is deliberately pure (`computeScore` never mutates state), so the same
function powers the live preview, the tooltips, and the replayed cinematic —
they can't disagree.

A *Developer* section in Settings has shortcuts: +20 Coins, open the Shop,
clear the current page. The console exposes `window.folio = { state, settings }`.
