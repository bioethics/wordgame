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
it back, drag to reorder — tiles on the board, and patron cards on the shelf,
which is what sets the order they act in — and long-press any tile or patron
for its details (long-press is also how you flip a dual tile on touch). To
test on a device,
serve on your LAN and open the machine's address from the phone:

```
python -m http.server 8431 --bind 0.0.0.0
# on the phone: http://<your-computer's-ip>:8431
```

## How a word scores

```
score = Points × Mult
```

- **Points** — the sum of every tile's value (after trims and nicks), plus
  everything the patrons then add to it. It is a *running* figure: the patrons
  act one seat at a time, and a patron's ×Mult multiplies it where it stands.
- **Mult** — the product of the **length multiplier** and the five colour
  multipliers. Length is the one multiplier every press owns from its first
  page: a word of 6 letters earns ×2, +0.5 per letter beyond (7 → ×2.5,
  8 → ×3…), counted in letters like every shape rule — so ligatures and dual
  faces are length cheats, and a long word in colour beats a short word in
  colour, always. Each milestone prints a flourish of its own
  (`LENGTH_FLOURISHES` in `js/constants.js` — copy, not code; edit freely).
  Each colour starts at
  ×1 and every painted *tile* of that colour in the word raises it by 1
  (×2, ×3, …); purple trims raise a fifth multiplier in half-steps (×1.5, ×2,
  ×2.5, …). Spreading colours multiplies together: one tile each of two colours
  is ×2×2 = ×4, where two of the same colour is only ×3.

Tiles, not letters, and the difference is worth holding onto: a `CH` or `QU`
tile spells two letters but wears one coat of paint and lifts its multiplier
once. Everything that counts what is *in* a word counts tiles — paint, nicks,
the colour patrons. Only the rules about a word's *shape* count letters: how
long it is, how it is spelled, what order it runs in. Every editor that judges
a word judges its shape, so they all count letters. (Two editors don't judge
words at all — the Redactor wraps tiles and the Hoarder rearranges the hand —
and those, naturally, count tiles.)

The readout shows a live projection — including a chip per colour — and
**everything that does something explains itself where it sits**: hover it with
a mouse, long-press it on touch. Tiles on the board, in the market, in the
draft, in your collection, in the bag or the discard pile, and on the compost
heap; sundries on the workbench as well as on the shop shelf and in the row of
what you already hold; patrons on the shelf and in the market. Nothing is
summarised beneath market cards — the thing itself is the documentation. What a
sundry does is written once, in `js/constants.js` → `sundryTip`, so the shop,
the workbench and the held row can't tell you three different things about it. On print, the score replays in the order it happens: patrons write their bonuses
onto the tiles, then the tiles pay, nicks fire, each colour's multiplier lights
up, and the patrons weigh in seat by seat.

### Seat order

Patrons act **in the order they sit**, and one rule follows from it:

> A ×Mult multiplies everything the table has said in front of it, and nothing
> behind it.

So the seats that *add* — Points, and the laurels your patrons wear — are worth
more in front, and the seats that *multiply* are worth more behind them. Drag a
card along the shelf to reseat it, on the board or on **Your table** at the top
of the Market, which is usually where you want to: you have just hired someone,
and where they sit is half of what you bought. (Additive Mult and ×Mult commute
with each other; it is the Points that care.)

Two things happen before any of that. Patrons whose promise reads *"such-and-such
tiles gain +N Points"* — the Goldsmith, the Seedsman, the Siren, the Jeweller,
the Calligrapher, the Espalier — write that number onto the tile itself, in the
groove as you compose and again at the head of the print, which means **the
nicks and the Monogrammists multiply it**. And the tongs' heat and the toll for
a curse left in hand land before the table speaks, so any multiplier seated at
all catches them.

## The pieces

A tile is a **letter** (or ligature, or mark), optionally **painted** a colour,
plus an optional **trim** and **nick**.

| Layer | Options |
| --- | --- |
| Paint | crimson / azure / jade / amber — each raises its colour's multiplier by 1 |
| Trim | **Gold** pays 1 Coin · **Silver** +5 Points, counted into the tile's corner number wherever it appears and written in the trim's own silver, so the tile says what it is worth rather than making you add · **Cobalt** refreshes 1 Discard (and wears the Discard's own blue) · **Purple** raises the fifth multiplier by 0.5 |
| Nick | A notch cut into one edge; the notched side is the direction. **Right** ×2 Points to everything on its right · **Left** ×2 to its left. Nicks don't stack — a tile is multiplied once at most. While you compose, an affected tile's corner number becomes the multiplied value, restyled, rippling outward from the notch. |
| Letterform | Dual tiles hold two letters (flip to switch; paint, trim and nick belong to the tile, so both letters wear them) · Ligatures ING · CH · CK · TH · WH · QU spell several letters from one tile (RAT too, but only from the Rat Catcher) · **Marks** ? and ! spell nothing at all, and come only from a wrapped tile, purple-trimmed |
| Material | What the tile is cast from, under everything else: ordinary lead, or **cursed** / **ghost** / **rainbow** (see below) |
| Growth | Grown points — permanent +1s a patron (The Grafter) writes into a tile, worn as a jade corner number wherever the tile appears |

A dual tile is one tile wearing one set of everything: its paint, trim and
nick belong to the tile, and flipping changes the letter and nothing else.

**Materials** — most type is lead. A **wrapped tile** bought at the Market
(4 Coins, on the workbench beside the paint tubes) is tapped once to unwrap it:
out comes a single tile of a random letter, struck in something stranger,
straight into your hand and into your collection for good. Which material is
not decided at the shop, or in the save, or anywhere at all until the paper
comes off — two of the three are gifts and the third is a curse, so it is a
parcel you choose to open rather than a metal you choose to buy. The fourth
thing a wrapper can hold isn't a material at all: a **mark** in ordinary lead
under a purple trim, which is the only way marks come now. The material sits
*under* everything else, so a cursed or rainbow tile still takes paint, trims
and nicks like any other.

- **Cursed** (hellbox iron) — ×2 Mult when printed, and it can never be
  discarded: the only way out of your hand is to play it. While it waits there,
  every word you set *without* it loses 666 Points, once per curse — enough
  that such words score nothing (a word's total never falls below zero), so you
  can keep printing to turn the rack over until the curse finds a home. A press
  strong enough to clear 666 Points can shrug one off and still score. Never
  cast on an expensive letter, and two in one word compound to ×4.
- **Ghost** (ghost metal) — holds no place in your hand, so you effectively
  draw one more; but nothing can ever be done to it. No paint, no trim, no
  nick, no second letter, no growth, and the Stereotyper can't copy it —
  there's nothing solid to take an impression from.
- **Rainbow** (rainbow roll) — reads as *every* colour to your patrons, so one
  tile wakes the whole guild. It doesn't lift the colour multipliers on its
  own, though: paint it, and only that colour's multiplier rises. It counts as
  azure to *the Fountain*, so an unpainted rainbow tile still finds its way back
  into the bag rather than the pile — one of the few things it does for you
  without being painted at all. Mind the Stoker, who reads it as crimson and
  burns it.

**The Editors** — every chapter's third page is its **Deadline**, and an editor
holds the desk there: one of a roster (see `js/bosses.js`), drawn at random as
the page is dealt and never announced sooner, so the rule is a puzzle for the
rack in front of you rather than something to build against. Almost none of
them bans anything — each warps the *shape* of the words instead. The Padder
pays by the word and wants five letters at least; the Columnist re-sets an exact
measure after every print; the Populist writes for the common reader and takes
none but the 750 commonest words in English, where the Obscurantist spikes the
commonest 500 outright; the Minimalist holds the adjective to be the enemy of
the noun and spikes every describing word (off the same list *the Poet* is paid
from, so the two are exact opposites); the Serialist demands each word open on
the letter the last one ended with; the Indexer files the page alphabetically;
the Escalationist insists every word outscore the one before; the Enthusiast
lends a tile of a beloved letter and expects it in every word; the Reviewer
receives each word in a temper (×0.2–×0.95) rolled openly before you compose;
the Completist deals two extra tiles and permits no discards; the Eeeditor
keeps three places in your hand and fills them with plain E, restoring one the
moment you print it, and the Editooor does the same in O; and the Redactor —
the one editor that does touch what a tile is worth — sends a third of the case
back in manuscript, wrapped in paper with the letter pencilled on top: those
tiles still spell, and do nothing else at all (no Points, no paint, no trim, no
metal, no nick) until the page ends and the wrapping comes off. A word that breaks
the house rule is not refused — it is **spiked**: printed, filed, counted, but
at ×0.2 of its score. The editor's bar above the readout carries the live
demand and calls the verdict — ✓ or the spike — while you compose, because
nothing in this game scores what the preview didn't promise. Beside it runs the
page's record: one mark per word printed, ✓ or ✂, so you can see how the whole
page has gone and not merely the word in the groove. Chains and indexes are
reset by the spiked word itself, so a sacrificial APPLE is always a way back in.

The two frequency editors read `wordlists-themed/common.txt`, the one themed
list whose *order* is data: `js/themes.js` keeps each word's line number as its
frequency rank. The Populist takes the first 750, the Obscurantist bars the
first 500, and The Lexicographer — a patron, not an editor — pays ×1.5 for
words absent from the file altogether, so its 8,000 entries are a game number
too. Rebuild it with `tools/build-common-list.mjs` (it filters a frequency list
down to words this dictionary will actually accept), and never sort it
alphabetically.

Three editors **lend** you tiles, and the difference between them is the whole of
what they do. A lent tile is cast from no collection template: it takes no
paint, trim or nick (there is nothing behind it for the change to be written
to), it can never be discarded or slip back into the bag, and it is gone when
the page ends. The Enthusiast's gift rides *above* your hand size and is a
present. The Eeeditor's three E's sit *in* the hand and take three of its
places, which is a cage — you draw seven real tiles and build around EEE; the
Editooor runs the same cage in O. On the board the two kinds are coloured
apart: warm brass for the gift, cold ink-blue with a proof-reader's double
rule for the lender's own type.

The Redactor is the one editor whose rule is written on the tiles rather than
on the words. As the Deadline is dealt it wraps a third of the **collection** —
not of the hand, which is the point: discard a wrapped tile and you draw from a
bag that is still a third wrapped, so the condition lasts the page instead of
washing out with the first refill. A wrapped tile keeps its letter and loses
everything else. In the code that promise is kept in one place: `isWrapped` in
`js/state.js` sits inside `getActiveColour`, `countsAsColour`, `getActiveGrowth`
and `restingPoints`, so nothing else in the game had to learn the word —
ask a wrapped tile what colour it is and it has none, what it is worth and it is
worth nothing. Scoring's pass 0 strips the few things read straight off the tile
instead (trim, nick, metal, face value), on a copy, as ever. The share is
`REDACTOR_SHARE` in `js/bosses.js`; the wrapping is laid and cleared in
`startPage`, so it can never outlive the editor that laid it.

A word is worth noting about the Obscurantist: measured against a solver it
looks feeble, costing 2% of the score ceiling, because a machine barred from
common words simply reads further down the dictionary. A player cannot. Its
difficulty is in recall rather than combinatorics, which is the kind of
difficulty a word game is made of, and the reason it is tuned by playing —
which is how its band has moved twice, from 1,000 down to 250 and back up to
500 once 250 turned out to be a bar a player steps over without noticing.

**Misspellings** — three patrons forgive a word the dictionary turns away, and
none of them correct it: what you set is what prints, in the strip under the
board and in the bound manuscript both. *Titivillus* takes one wrong or transposed vowel (WIERD stands for
WEIRD) so long as the word holds an azure letter; *the Stumbler* takes one pair
of adjacent letters swapped (TEH for THE); *the Skimmer* takes the middle
letters in any order, provided the first and last are right. Your book fills
with misprints, which is the point of them.

**Compounds** — *the Binder* is a fourth pardon of a different kind: nothing has
gone wrong, it simply licenses a construction English makes freely. Any two
nouns set end to end count as a word, so DOOM and HAT make DOOMHAT. The nouns
it knows are a flat list in `wordlists-themed/nouns.txt` — edit it freely. What
he coins is a noun like any other, so *the Sculptor* pays his ×2 for it: the
pair is the intended build, one seat making the word legal and the other paying
for what it is. His own halves stay singular, though — the list he stacks from
is unchanged, so DOOM and HAT make a word where CATS and HAT still don't.

**Marks** — `?` and `!` are tiles that spell nothing. A mark is appended to a
finished word: one `?`, or one `!`, or the two together as `?!` — never
doubled, never reversed, never mid-word. The dictionary only ever sees the
letters in front, and so do your patrons, so `CAT?` is still a three-letter
word and `ANNA!` is still a palindrome. A mark is worth a point, but that
isn't the point of it: marks take paint, trims and nicks like any other tile,
and a mark sits at the *end* of the word, which is exactly where a **left
nick** wants to be — one notch there reaches back across every letter you
just set. Marks never come out of the bag, and nothing sells them: the one way
a mark enters a run is out of a **wrapped tile**, always under a purple trim.
So a `?` is a find rather than a purchase — and the trim is what makes it worth
the unwrap, since a bare mark is one point and no letters.

**The opening draft** — before page 1 you kit out the press from a free
spread: 2 paints of 4, 4 tiles of 10. No coins involved. The starting
collection ships unpainted, so those two paints are where colour enters the
run. No patron is drafted: the first one is hired at the first Market, with
coins, once you've printed a page and know what the press needs.

**The Market** (between pages) keeps a fixed layout with churning contents:
4 patrons, 4 tiles, 2 **sundries**, and 2 **stalls** drawn from a roster of
six. *New offers* re-rolls everything — patrons, tiles, sundries, and a fresh
pair of stalls with their doubling-price reset — and its own price doubles
with each press. Tiles live in your **collection**; each page the whole
collection shuffles into the **bag**, and printed or discarded tiles wait in
the **discard pile**.

**Sundries** are consumables kept on the **workbench** (two slots to start, and
the Colophon can add two more, beside the patron shelf). The **paint tube**:
tap it mid-page and it lays out its offer — two random unpainted tiles from
your hand (rack or half-composed word alike) light up; tap one, tap the tube
again, and the paint is permanent. The candidates are the tube's to choose,
the pick is yours. (Aimed paint only ever landed on the same four workhorse
letters, which made every run's colours converge.) The **ratchet** keeps the
same rhythm: tap it, tap one letter, tap the ratchet again, and
that letter steps a single place along the alphabet — D becomes C or E, A
becomes Z or B. The two arrows on the tool say which way it is pointing and
can be flipped at any time, including on the tap that spends it. The new
letter is permanent, re-pricing the tile with it. It walks the press's own alphabet
rather than A-Z, so P steps straight to R: there is no lone Q sort to land on.
Ligatures and marks aren't single letters and can't be stepped at all. The
**wrapped tile**: no target either, just tap it and the paper comes off. The
**reshuffle**: no target to pick, just banked until you spend it — on the
Market's own offers (free, doesn't touch the escalating reroll price) or on a
Colophon pick. (The random-scatter paint pots survive only in the opening
draft.)

The **toolbox** is a parcel of a different kind: open it on the bench and two
*different* tools take its place — the first in the box's own slot, the second
only if the bench has room, else it rolls away. Four of the five come from
nowhere else in the game, one per guild's temperament, and the odd **ratchet**
rattles around in there at half the rate:

- **Loupe** (jade) — tap a tile, tap the loupe again: its value doubles, to a
  maximum of 30, written in for good. It doubles the whole corner number, so
  raising a common letter first (a silver trim, the Grafter's growth) and
  *then* doubling beats doubling the jewel that is already near the cap.
- **Laurel** (amber) — crowns a random seated patron: +5 Points on every word
  while they keep their seat, stacking if it lands twice. The crown pays at its
  own seat's turn, so a laurel in front of your multipliers is multiplied by
  them and one behind them is not — and a dismissed patron takes their laurels
  with them, which is the tool's whole tension. It is worn along the bottom
  edge of the card, clear of the livery pin and the ✕. The tool is not the only
  source: *the Laureate* crowns himself once for every jade tile you print,
  which turns the same reward from a lottery into something a jade press
  manufactures.
- **Tongs** (crimson) — grip a tile and it goes to the furnace for good
  (feeding the Composter, respecting the Smelter's floor); the next word you
  print gains +8 Points. Grips stack; the heat expires with the page.
- **Ink wash** (azure) — up to four unpainted tiles in your hand take a faint
  wash, one of each colour. A washed tile counts as its colour to patrons *and*
  to the multiplier, and keeps the promise until it prints — then the wash
  comes off. Real paint replaces a wash outright.

The **fleuron** ❧'s mirror, ☙, is a tile rather than a sundry: a printer's
ornament struck in gold that sets no word at all. It can only be printed
alone, for its single Point — which spends a whole word slot to clear it from
your hand — and it pays 1 Coin every time a page completes, wherever it
happens to be. It turns up now and then among the Market's tiles, priced at
about a chapter of its own rent.

**The compost heap** appears at the Market while the Composter is seated:
every tile destroyed anywhere — burned by the Stoker, lost to the Arsonist,
fed to the Smelter — rots down into a jade tile with complications of its own.
The heap holds the freshest six, older rot is turned under, and you may lift
one free of charge each visit.

**Stalls** are services: the **Smelter** (trash a tile) and the
**Stereotyper** (clone any tile) work off your whole case. Four are *proposal
stalls* — they lay out a spread of six of your own tiles, each paired with a
proposed change, and you commission the one you like: the **Gilder** offers
trims, the **Punchcutter** cuts a second letter into a tile (making it dual),
the **Dresser** cuts a nick into a tile's edge, and the **Painter** proposes
colours for six unpainted tiles — the colours are the stall's to deal, but
every pot is guaranteed a showing. (Choosing your own colour, and repainting
a tile already coated, is the paint tube's trade.) The Gilder and the Painter
draw their spread with a gentle lean towards your rarer letters, so a Z is
about twice as likely to be laid out as any one of your Es. Every purchase
doubles that stall's price for the rest of the visit and returns you to the
market floor; prices reset when the next market opens. The Dresser starts at
3 Coins, every other stall at 2.

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

The whole roster is listed, guild by guild, in **[`docs/PATRONS.md`](docs/PATRONS.md)** —
generated from the defs by `tools/patrons.mjs`, and the place to *edit* the
wording: change a name or a description there and `node tools/patrons.mjs
--apply` writes it back into `js/patrons.js`. Run the tool bare to refresh the
list after a code change. (Design rationale, per patron, is in
`docs/PATRON_OVERHAUL.md`.)

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
| A single chapter that plays too easy or too hard | `js/constants.js` → `CHAPTER_1_EASE` and `CHAPTER_EASE` (a per-chapter multiplier on that chapter's quota only — chapters 4 and 5 carry one, where the middle of the run had gone slack, and nothing after them moves) |
| Trim effects & prices | `js/constants.js` → `TRIMS` (effects live in `js/scoring.js`); silver's Points are `SILVER_BONUS`, read by scoring, the trim's card and the tile's own number alike |
| Materials, the cursed ×Mult, wrapped-tile price & how often one is offered | `js/constants.js` → `MATERIALS`, `CURSED_MULT`, `CURSED_MAX_POINTS`, `WRAPPED_PRICE`, `WRAPPED_OFFER_CHANCE` |
| What is inside a wrapped tile | `js/constants.js` → `WRAPPED_CONTENTS`, a flat list rolled evenly — repeat an entry to make it likelier — and `MARK_TRIM` for what a wrapped mark wears |
| Letters only one patron can hand you | `js/constants.js` → `EXCLUSIVE_LETTERS` (RAT belongs to the Rat Catcher; shop, draft and heap all skip them) |
| Compost heap size & what you may take a visit | `js/constants.js` → `COMPOST_HEAP_MAX`, `COMPOST_PER_MARKET` |
| Purple trim step size | `js/constants.js` → `PURPLE_TRIM_STEP` |
| Nick multiplier & prices | `js/constants.js` → `NICK_MULT`, `NICKS` |
| The length multiplier — threshold, base, step, and the milestone copy | `js/constants.js` → `LENGTH_MULT_MIN`, `LENGTH_MULT_BASE`, `LENGTH_MULT_STEP`, `LENGTH_FLOURISHES` |
| Tube price / tiles per tube / workbench slots / sell-back | `js/constants.js` → `TUBE_PRICE`, `TUBE_TILES`, `SUNDRY_SLOTS`, `SUNDRY_SELL` |
| Reshuffle sundry price | `js/constants.js` → `RESHUFFLE_PRICE` |
| Ratchet sundry price | `js/constants.js` → `RATCHET_PRICE` (the alphabet it walks is derived from `TILE_POINTS` — see `SHIFT_RING` in `js/state.js`) |
| Toolbox price and what is inside it | `js/constants.js` → `TOOLBOX_PRICE`, `TOOLBOX_POOL` (repeat an entry to make it likelier; the box always yields two *different* tools) |
| Tool tuning — doubling cap, laurel step, tongs bonus, wash count | `js/constants.js` → `LOUPE_CAP`, `HONORIFIC_STEP`, `TONGS_BONUS`, `WASH_COUNT` |
| Where the patrons' turns happen, and what a ×Mult reaches | `js/scoring.js` → pass 4. Points that must be multiplied by the table have to land before it (the tongs' heat and the curse's toll do, in pass 3½) |
| Patrons that improve the tiles rather than the word | `js/patrons.js` → the `tileBonus` hook (pass 1½ in `js/scoring.js`); the number goes onto the tile, so nicks and Monogrammists carry it |
| Patrons that PAINT a tile rather than pay it | `js/patrons.js` → the `tilePaint` hook (pass ½ in `js/scoring.js`, before anything is counted). The colour lands on a copy of the word, so the multipliers count it and the groove shows it under a dashed edge while you compose; the seat's own `onPrinted` makes it permanent when the word prints |
| The fleuron — price, page rent, how often it is offered | `js/constants.js` → `FLEURON_PRICE`, `FLEURON_PAGE_COIN`, `FLEURON_OFFER_CHANCE` (the glyph itself is `FLEURON`) |
| Stall roster, base prices, spread size | `js/constants.js` → `STALL_DEFS`, `STALLS_PER_SHOP`, `PROPOSAL_RANGE`, `SMELT_MIN_COLLECTION` |
| Marks: which ones exist, legal tails, and what they arrive wearing | `js/constants.js` → `MARKS`, `MARK_RUNS`, `MARK_TRIM` (and `TILE_POINTS`). How often one turns up is `WRAPPED_CONTENTS`, since a wrapper is the only source |
| What a proposal stall works on & offers | `js/market.js` → `PROPOSAL_STALLS` (one `eligible`/`propose` pair per stall — a new one is a few lines) |
| Letters per draft paint pot | `js/constants.js` → `PAINT_PER_POT` |
| Opening draft spread & pick counts | `js/constants.js` → `DRAFT` |
| How loaded offered tiles are | `js/constants.js` → `FEATURE_CHAIN_CHANCE`, `MAX_FEATURES` (one feature free, then keep rolling); generation in `js/market.js` → `randomSpecialTile` |
| Rewards & interest | `js/constants.js` → `REWARD` (base bumped 4→5 alongside the Colophon) |
| Colophon roster, offer count, repeat cap, skip grant | `js/constants.js` → `UPGRADE_OFFERS`, `MAX_UPGRADE_REPEATS`, `SKIP_COIN_GRANT`; definitions in `js/upgrades.js` |
| Patron reaction odds | `js/constants.js` → `REACTION`; the lines themselves in `js/quips.js` — a flat array, add more any time |
| How long a line stays up to be read | `js/anim.js` → `READ_BASE` / `READ_PER_CHAR` / `READ_MAX`. Every bubble, floater and bar message holds for a span measured off its own length, so a long line is given longer, not read faster |
| Words / discards / seats per page | `js/constants.js` |
| Patron roster, costs, effects | `js/patrons.js` (design notes in `docs/PATRON_OVERHAUL.md`) |
| Patron tuning that reaches beyond a score (growth steps, burn odds, trim chance, dye count, coined-word length) | `js/constants.js` → `GRAFTER_STEP`, `STOKER_BASE`, `STOKER_STEP`, `ARSONIST_ODDS`, `NUDIST_TRIM_CHANCE`, `DIPPER_PAINT_CHANCE`, `GAMBLER_ODDS`, `DYE_TILES_PER_CHAPTER`, `NEOLOGIST_LENGTH` |
| Animation step timings | `js/constants.js` → `ANIM` (all divided by the Settings speed slider) |
| Chapter titles | `js/chapters.js` — a flat array, add as many as you like; each run draws its own and won't repeat until the list runs out |
| The Stenographer's acronyms | `wordlists-themed/acronyms.txt` — one per line, `#` comments; letters only, and no lone Q (the press has no Q sort to set it with) |
| The Expectant Parents' baby names | `wordlists-themed/names.txt` — same format; regenerate from the US and England & Wales charts with `tools/build-names-list.mjs` |
| Words barred from the game entirely | `wordlists-themed/excluded-slurs.txt` — one per line, `#` comments. Enforced at load by `js/excluded.js` against the dictionary, every themed list, and The Neologist's coining sheet, so an entry here can't come back through a word list, a custom dictionary or a coined word. Whole-word matches only |
| The four registers' word lists (the Sexton, the Paramour, the Poppet, the Vulgarian) | `wordlists-themed/theme-*.txt` — one word per line, edit freely; loading in `js/themes.js` |
| The three parts of speech (the Sculptor, the Poet, the Athlete) | `wordlists-themed/nouns.txt`, `adjectives.txt`, `verbs.txt` — same format. The nouns list holds singulars only: plurals are read back to their singular in `readsAsNoun` (`js/patrons.js`), which is also where the irregular ones (MICE, TEETH, CHILDREN) are named. It is The Binder's list too, so an entry added there can be stacked into a compound as well as paid for |
| The Frontispiece's opening multiplier & growth | `js/constants.js` → `FRONTISPIECE` |

## Architecture

| File | Role |
| --- | --- |
| `js/state.js` | game state, save/load (`folio_save_v1`, schema v7), settings, tile ops, painting, sundries, effective hand/seat/workbench sizes, the manuscript |
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
| `js/drag.js` | pointer input: tap / drag / long-press for rack, word and the patron shelf (where a drag reseats a patron, changing the order effects fire in), mouse and touch alike |
| `js/dict.js` | dictionary loading/caching (also reads a `window.FOLIO_WORDLIST` global, for single-file bundles) |
| `js/themes.js` | the themed lists in `wordlists-themed/` — registers, parts of speech, acronyms and names — as Sets (also reads a `window.FOLIO_THEMES` global, for single-file bundles) |
| `js/excluded.js` | the barred-words list, loaded before any word list and applied by `dict.js` and `themes.js` as they build their Sets |

Scoring is deliberately pure (`computeScore` never mutates state), so the same
function powers the live preview, the tooltips, and the replayed cinematic —
they can't disagree.

The **manuscript** is the strip under the board: every word printed this run,
set as one long line of type, newest last, the earlier ones running off the
left edge under a fade. It's the book you're actually making. Messages (a
rejected word, a purchase, a hint) borrow the strip for a few seconds and it
settles back on its own — so nothing needs to announce the page or chapter
there, since the status row already does.

The **manuscript** proper (❦ in the header) is the same words bound as a book:
a heading and title for each chapter, ruled off with its word count and score,
and beneath it the words of each page set as running prose — small caps, with
each score riding after its word as a raised figure the way a footnote mark
does. Every page keeps its folio number out in the margin in lower-case romans,
except a Deadline, which is marked with a fleuron rather than numbered. The
first word of each chapter takes a drop cap, and the best word of the run is
illuminated. It reads front to back, the way a book does. A *Developer* section in Settings has shortcuts: +20 Coins, open the Market,
clear the current page. The console exposes `window.folio = { state, settings }`.
