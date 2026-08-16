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

A tile is a **letter** (or ligature, or mark), optionally **painted** a colour,
plus an optional **trim** and **nick**.

| Layer | Options |
| --- | --- |
| Paint | crimson / azure / jade / amber — each raises its colour's multiplier by 1 |
| Trim | **Gold** pays 1 Coin · **Silver** +6 Points · **Cobalt** refreshes 1 Discard (and wears the Discard's own blue) · **Mercury** slips back into the bag instead of the discard pile · **Purple** raises the fifth multiplier by 0.5 |
| Nick | A notch cut into one edge; the notched side is the direction. **Right** ×3 Points to everything on its right · **Left** ×3 to its left. Nicks don't stack — a letter is multiplied once at most. While you compose, an affected tile's corner number becomes the multiplied value, restyled, rippling outward from the notch. |
| Letterform | Dual tiles hold two letters (flip to switch; each face painted independently) · Ligatures ING · CH · CK · TH · WH · QU spell several letters from one tile (RAT too, but only from the Rat Catcher) · **Marks** ? and ! spell nothing at all |
| Material | What the tile is cast from, under everything else: ordinary lead, or **cursed** / **ghost** / **rainbow** (see below) |
| Growth | Grown points — permanent +1s a patron (The Grafter) writes into a tile, worn as a jade corner number wherever the tile appears |

A dual tile shares its trim and nick across both faces; only the letters and
their paint swap.

**Materials** — most type is lead. An **ingot** bought at the Market (4 Coins,
on the workbench beside the paint tubes) is tapped once and casts a single tile
of something stranger, straight into your hand and into your collection for
good. The material sits *under* everything else, so a cursed or rainbow tile
still takes paint, trims and nicks like any other.

- **Cursed** (hellbox iron) — ×3 Mult when printed, and it can never be
  discarded: the only way out of your hand is to play it. While it waits there,
  every word you set *without* it loses 666 Points, once per curse — enough
  that such words score nothing (a word's total never falls below zero), so you
  can keep printing to turn the rack over until the curse finds a home. A press
  strong enough to clear 666 Points can shrug one off and still score. Never
  cast on an expensive letter, and two in one word compound to ×9.
- **Ghost** (ghost metal) — holds no place in your hand, so you effectively
  draw one more; but nothing can ever be done to it. No paint, no trim, no
  nick, no second letter, no growth, and the Stereotyper can't copy it —
  there's nothing solid to take an impression from.
- **Rainbow** (rainbow roll) — reads as *every* colour to your patrons, so one
  tile wakes the whole guild. It doesn't lift the colour multipliers on its
  own, though: paint it, and only that colour's multiplier rises. Mind the
  Stoker, who reads it as crimson and burns it.

**Misspellings** — three patrons forgive a word the dictionary turns away, and
none of them correct it: what you set is what prints, in the manuscript and the
ledger both. *Titivillus* takes one wrong or transposed vowel (WIERD stands for
WEIRD) so long as the word holds an azure letter; *the Stumbler* takes one pair
of adjacent letters swapped (TEH for THE); *the Skimmer* takes the middle
letters in any order, provided the first and last are right. Your book fills
with misprints, which is the point of them.

**Compounds** — *the Binder* is a fourth pardon of a different kind: nothing has
gone wrong, it simply licenses a construction English makes freely. Any two
nouns set end to end count as a word, so DOOM and HAT make DOOMHAT. The nouns
it knows are a flat list in `wordlists-themed/nouns.txt` — edit it freely.

**Marks** — `?` and `!` are tiles that spell nothing. A mark is appended to a
finished word: one `?`, or one `!`, or the two together as `?!` — never
doubled, never reversed, never mid-word. The dictionary only ever sees the
letters in front, and so do your patrons, so `CAT?` is still a three-letter
word and `ANNA!` is still a palindrome. A mark is worth a point, but that
isn't the point of it: marks take paint, trims and nicks like any other tile,
and a mark sits at the *end* of the word, which is exactly where a **left
nick** wants to be — one notch there reaches back across every letter you
just set. Marks never come out of the bag; they turn up in the Market now and
then, and they cost a little extra when they do.

**The opening draft** — before page 1 you kit out the press from a free
spread: 2 paints of 4, 4 tiles of 10. No coins involved. The starting
collection ships unpainted, so those two paints are where colour enters the
run. No patron is drafted: the first one is hired at the first Market, with
coins, once you've printed a page and know what the press needs.

**The Market** (between pages) keeps a fixed layout with churning contents:
3 patrons, 4 tiles, 2 **sundries**, and 2 **stalls** drawn from a roster of
six. *New offers* re-rolls everything — patrons, tiles, sundries, and a fresh
pair of stalls with their doubling-price reset — and its own price doubles
with each press. Tiles live in your **collection**; each page the whole
collection shuffles into the **bag**, and printed or discarded tiles wait in
the **discard pile**.

**Sundries** are consumables kept on the **workbench** (two slots, beside the
patron shelf). The **paint tube**: tap it mid-page, tap one tile anywhere on
the board — rack or half-composed word alike — and tap the tube again to paint
it, permanently. The **reshuffle**: no target to pick, just banked until you
spend it — on the Market's own offers (free, doesn't touch the escalating
reroll price) or on a Colophon pick. (The random-scatter paint pots survive
only in the opening draft.)

**The compost heap** appears at the Market while the Composter is seated:
every tile destroyed anywhere — burned by the Stoker, lost to the Arsonist,
fed to the Smelter — rots down into a jade tile with complications of its own.
The heap holds the freshest six, older rot is turned under, and you may lift
one free of charge each visit.

**Stalls** are services: the **Smelter** (trash a tile), the **Painter**
(paint any letter a colour of your choice), and the **Stereotyper** (clone any
tile). Three more are
*proposal stalls* — they lay out a spread of six of your own tiles, each
paired with a proposed change, and you commission the one you like: the
**Gilder** offers trims, the **Punchcutter** cuts a second letter into a tile
(making it dual), and the **Dresser** cuts a nick into a tile's edge. Every
purchase doubles that stall's price for the rest of the visit; prices reset
when the next market opens. The Dresser starts at 3 Coins, the Smelter and
Punchcutter at 2, the rest at 1.

**Patrons** grant standing boons — five seats to start (the Colophon can add
more), dismissable for half their cost (hover for the ✕, or tap the patron on
touch). The roster is built around **colour guilds**: each paint keeps a family
of patrons that makes committing to it an archetype — amber pays coins, jade
compounds forever (grown tiles, chapter-scaling boons), crimson burns tiles
for power, azure bends the rules of spelling — plus neutral wildcards and the
word-shape classics. A guild member's calling card wears its livery — a silk
ribbon and a wash in the guild's colour, with the guild named on the title
line — and its seat carries a small livery pin; neutral patrons stay plain
ivory. *The Alderman* reads the liveries: ×1.5 Mult for each guild with a
patron on your shelf, counted once per guild and whether or not it fires. Some patrons act after a word prints (burning,
growing, painting) or as a chapter turns (the dye commons), not just while it
scores. While you compose, the shelf shows its hand: every patron whose
condition the word already meets wakes up — rising, breathing a candlelit
glow, catching a slow sweep of gold leaf — and wears a badge of exactly what
it stands to add (+10 Points, ×3 Mult). The ones sitting this word out dim
out of the way, and a badge whose number moves as you add letters bumps
rather than silently swapping. It reads off the same score script as the
readout, so what a patron promises is what it pays when it fires.

**Letting things go** — the Market lists what you already hold beneath each
section: seated patrons (back for half their cost) and workbench sundries
(back for 1 Coin). Selling a sundry is about freeing the slot, not the coin.

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
beyond. Each chapter draws its title at random from `js/chapters.js` and keeps
it for the run.

The climb is not a fixed rate — the rate itself grows, so each chapter is a
bigger step than the last and a built press has to multiply rather than add:

| | ch 1 | ch 4 | ch 7 | ch 10 | App. II |
| --- | --- | --- | --- | --- | --- |
| page 1 | 40 | 230 | 2,100 | 30,000 | 210,000 |
| Deadline | 80 | 470 | 4,300 | 59,000 | 420,000 |

## Where to tune the design

| Knob | Where |
| --- | --- |
| Quota curve | `js/constants.js` → `quotaFor`, `QUOTA_BASE`, `QUOTA_GROWTH_START`, `QUOTA_GROWTH_RAMP`. The rate itself grows: chapter 2 asks ×1.7 of chapter 1, chapter 3 ×1.8 of chapter 2, and so on. START makes the whole run harder; RAMP makes the ending harder without touching the opening — a harder mode is a bigger pair |
| Trim effects & prices | `js/constants.js` → `TRIMS` (effects live in `js/scoring.js`) |
| Materials, the cursed ×Mult, ingot price & how often one is offered | `js/constants.js` → `MATERIALS`, `CURSED_MULT`, `CURSED_MAX_POINTS`, `INGOT_PRICE`, `INGOT_OFFER_CHANCE` |
| Letters only one patron can hand you | `js/constants.js` → `EXCLUSIVE_LETTERS` (RAT belongs to the Rat Catcher; shop, draft and heap all skip them) |
| Compost heap size & what you may take a visit | `js/constants.js` → `COMPOST_HEAP_MAX`, `COMPOST_PER_MARKET` |
| Purple trim step size | `js/constants.js` → `PURPLE_TRIM_STEP` |
| Nick multiplier & prices | `js/constants.js` → `NICK_MULT`, `NICKS` |
| Tube price / tiles per tube / workbench slots / sell-back | `js/constants.js` → `TUBE_PRICE`, `TUBE_TILES`, `SUNDRY_SLOTS`, `SUNDRY_SELL` |
| Reshuffle sundry price | `js/constants.js` → `RESHUFFLE_PRICE` |
| Stall roster, base prices, spread size | `js/constants.js` → `STALL_DEFS`, `STALLS_PER_SHOP`, `PROPOSAL_RANGE`, `SMELT_MIN_COLLECTION` |
| Marks: which ones exist, legal tails, how often they're offered | `js/constants.js` → `MARKS`, `MARK_RUNS`, `MARK_WEIGHT` (and `TILE_POINTS`) |
| What a proposal stall works on & offers | `js/market.js` → `PROPOSAL_STALLS` (one `eligible`/`propose` pair per stall — a new one is a few lines) |
| Letters per draft paint pot | `js/constants.js` → `PAINT_PER_POT` |
| Opening draft spread & pick counts | `js/constants.js` → `DRAFT` |
| How loaded offered tiles are | `js/constants.js` → `FEATURE_CHAIN_CHANCE`, `MAX_FEATURES` (one feature free, then keep rolling); generation in `js/market.js` → `randomSpecialTile` |
| Rewards & interest | `js/constants.js` → `REWARD` (base bumped 4→5 alongside the Colophon) |
| Colophon roster, offer count, repeat cap, skip grant | `js/constants.js` → `UPGRADE_OFFERS`, `MAX_UPGRADE_REPEATS`, `SKIP_COIN_GRANT`; definitions in `js/upgrades.js` |
| Patron reaction odds | `js/constants.js` → `REACTION`; the lines themselves in `js/quips.js` — a flat array, add more any time |
| Words / discards / seats per page | `js/constants.js` |
| Patron roster, costs, effects | `js/patrons.js` (design notes in `docs/PATRON_OVERHAUL.md`) |
| Patron tuning that reaches beyond a score (growth steps, burn odds, trim chance, dye count, coined-word length) | `js/constants.js` → `GRAFTER_STEP`, `STOKER_STEP`, `ARSONIST_ODDS`, `NUDIST_TRIM_CHANCE`, `DIPPER_PAINT_CHANCE`, `GAMBLER_ODDS`, `DYE_TILES_PER_CHAPTER`, `NEOLOGIST_LENGTH` |
| Animation step timings | `js/constants.js` → `ANIM` (all divided by the Settings speed slider) |
| Chapter titles | `js/chapters.js` — a flat array, add as many as you like; each run draws its own and won't repeat until the list runs out |
| The Stenographer's acronyms | `wordlists-themed/acronyms.txt` — one per line, `#` comments; letters only, and no lone Q (the press has no Q sort to set it with) |
| The four registers' word lists (the Sexton, the Paramour, the Poppet, the Vulgarian) | `wordlists-themed/theme-*.txt` — one word per line, edit freely; loading in `js/themes.js` |
| The Frontispiece's opening multiplier & growth | `js/constants.js` → `FRONTISPIECE` |

## Architecture

| File | Role |
| --- | --- |
| `js/state.js` | game state, save/load (`folio_save_v1`, schema v7), settings, tile ops, painting, sundries, effective hand/seat/workbench sizes, the ledger |
| `js/scoring.js` | pure score computation — returns a step-by-step *script* the UI replays |
| `js/patrons.js` | patron definitions |
| `js/upgrades.js` | the Colophon's upgrade definitions (pure data, no logic) |
| `js/colophon.js` | the Colophon's ephemeral screen state: rolling, capping, applying, reshuffling |
| `js/quips.js` | patron reaction lines — a flat, editable array; no logic beyond `{word}` substitution |
| `js/chapters.js` | chapter titles — a flat, editable array; a run draws one per chapter and keeps it |
| `js/market.js` | market state: offers, buying, sundries, stalls, rerolls |
| `js/draft.js` | the opening draft: free spread, picks, applying them |
| `js/render.js` | board-side DOM: tiles, shelf, workbench, status, readout, popovers, overlays |
| `js/sheets.js` | the full-screen sheets — Market, stalls, Colophon, draft — HTML and click handling, with game flow injected from main.js |
| `js/anim.js` | flights, floaters, tweens, sparkles, WebAudio sfx — every duration respects the speed setting |
| `js/main.js` | orchestration: submit cinematic, page/chapter flow, input, settings |
| `js/drag.js` | pointer input: tap / drag / long-press for rack and word, mouse and touch alike |
| `js/dict.js` | dictionary loading/caching (also reads a `window.FOLIO_WORDLIST` global, for single-file bundles) |
| `js/themes.js` | the themed lists in `wordlists-themed/` — registers and acronyms — as Sets (also reads a `window.FOLIO_THEMES` global, for single-file bundles) |

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
