# GREAT WORK ❦

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

(ES modules don't run from `file://`, and the bundled `wordlist.txt` — 70k
words — is fetched over HTTP. A custom list can be loaded in Settings.)

`node tools/build-single.mjs` bundles the whole game — wordlist included — into
one HTML file, `great-work-single.html` by default; pass a path to override.

### Playing on a phone

The game is touch-native: tap a rack tile to play it, tap a word tile to take it
back, drag to reorder (tiles on the board, patron cards on the shelf), and
long-press any tile or patron for its details — also how you flip a dual tile on
touch. To test on a device, serve on your LAN:

```
python -m http.server 8431 --bind 0.0.0.0
# on the phone: http://<your-computer's-ip>:8431
```

## How a word scores

```
score = Points × Mult
```

- **Points** — every tile's value (after trims and nicks) plus everything the
  patrons add. It is a *running* figure: patrons act one seat at a time, and a
  ×Mult multiplies it where it stands.
- **Mult** — the length multiplier times the five colour multipliers. Length is
  the one multiplier every press owns from its first page: 6 letters earns ×2,
  +0.5 per letter beyond, counted in letters, so ligatures and dual faces are
  length cheats (`LENGTH_MULT_*` and the milestone copy `LENGTH_FLOURISHES` in
  `js/constants.js`). Each colour starts at ×1 and every painted *tile* of that
  colour raises it by 1; purple trims raise a fifth multiplier in half-steps.
  Colours multiply together, so one tile each of two colours is ×4 where two of
  the same colour is ×3.

Tiles, not letters: a `CH` or `QU` tile spells two letters but wears one coat of
paint and lifts its multiplier once. Everything counting what is *in* a word
counts tiles — paint, nicks, the colour patrons. Only a word's *shape* counts
letters: length, spelling, order. Editors judge shape, so they count letters —
except the two that don't judge words at all, the Redactor (which wraps tiles)
and the Hoarder (which rearranges the hand).

The readout shows a live projection with a chip per colour, and **everything
that does something explains itself where it sits**: hover with a mouse,
long-press on touch, wherever the thing appears. Nothing is summarised beneath
market cards. What a sundry does is written once, in `js/constants.js` →
`sundryTip`. On print the score replays in the order it happens: patrons write
bonuses onto the tiles, the tiles pay, nicks fire, each colour's multiplier
lights, and the patrons weigh in seat by seat.

### Seat order

Patrons act **in the order they sit**, and one rule follows from it:

> A ×Mult multiplies everything the table has said in front of it, and nothing
> behind it.

So seats that *add* are worth more in front, seats that *multiply* worth more
behind. Drag a card along the shelf to reseat it, on the board or on **Your
table** at the top of the Market. (Additive Mult and ×Mult commute; it is the
Points that care.)

Two things happen before the table speaks. Patrons whose promise reads
*"such-and-such tiles gain +N Points"* write that number onto the tile itself,
so **the nicks and the Monogrammists multiply it**; where it is written in for
keeps the groove shows it in **jade** rather than brass. And the tongs' heat and
the toll for a curse left in hand land first, so any multiplier seated at all
catches them.

**Ghosts.** *The Ripper* kills one of your other patrons when you print KILL,
MURDER or SLAY, then flees back to the Market's pool. The victim moves off the
shelf into your **ghosts**, behind a door beside the patron row, keeping its
whole effect — score turn, hooks, laurels — and giving up only its seat, which
is the entire payment. Ghosts speak **after every living patron**, so a killed
×Mult that sat late keeps its worth and a killed +Points that sat early loses
it; which patron dies is not yours to choose. They still count for the
Innkeeper's headcount and the Alderman's guilds. The Market lays out a patron
already dead about **1 card in 100**: a ghost for hire needs no seat, so a full
table is no bar to taking one, but it asks **3 Coins over** the living price
and its contract still pays nothing back. The contributor's rule:
anything asking what your patrons *do* reads `allSeats()` in `js/state.js`
(which spans `state.ghosts`); only the seat limit, the shelf and the reordering
read `state.patrons`.

*The Revenant* is the other half: every tile destroyed anywhere has a 1-in-2
chance of walking back out of the hellbox in **ghost metal**, whole — paint,
trim, nick, grown Points, both faces of a dual — with only the metal
overwritten. It needs no hook: every road to permanent destruction runs through
`trashFromCollection`, and the rite is performed from inside it, as *the
Dabbler* is heard from inside `paintTile`. Nothing caps it, so a press that
keeps feeding it plays out of a hand of thirty and the rack wraps — intended.
And the knife turns on it: the dead cannot be murdered, so *the Revenant* takes
*the Ripper* instead, and every watchword thereafter kills again, free.

## The pieces

A tile is a **letter** (or ligature, or mark), optionally **painted** a colour,
plus an optional **trim** and **nick**.

| Layer | Options |
| --- | --- |
| Paint | crimson / azure / jade / amber — each raises its colour's multiplier by 1 |
| Trim | **Gold** pays 1 Coin · **Silver** +5 Points, counted into the tile's corner number wherever it appears · **Cobalt** refreshes 1 Discard · **Purple** raises the fifth multiplier by 0.5 |
| Nick | A notch in one edge; the notched side is the direction. **Right** ×2 Points to everything on its right · **Left** ×2 to its left. Nicks don't stack — a tile is multiplied once at most. While you compose, an affected tile's corner number shows the multiplied value |
| Letterform | Dual tiles hold two letters (flip to switch; paint, trim and nick belong to the tile, so both faces wear them) · Ligatures ING · CH · CK · TH · WH · QU spell several letters from one tile (RAT too, but only from the Rat Catcher) · **Medieval sorts** þ · ȝ · Æ · Ƿ and **marks** ? · ! — below |
| Material | What the tile is cast from, under everything else: ordinary lead, or **cursed** / **ghost** / **rainbow** / **rose** |
| Growth | Permanent +1s a patron (The Grafter) writes into a tile, worn as a jade corner number |

**Materials** — most type is lead. A **wrapped tile** (4 Coins at the Market) is
tapped once to unwrap: out comes one tile of a random letter struck in something
stranger, straight into your hand and collection for good. The material isn't
decided until the paper comes off — two of the three are gifts and the third a
curse, so it is a parcel you open rather than a metal you buy. A wrapper may
instead hold a **mark** under a purple trim, which is the only way marks come.
Material sits *under* everything else, so a cursed or rainbow tile still takes
paint, trims and nicks.

- **Cursed** (hellbox iron) — ×2 Mult when printed, and never discardable: the
  only way out of your hand is to play it. While it waits, every word set
  *without* it loses 666 Points, once per curse — enough that such words score
  nothing (a total never falls below zero), so you can keep printing to turn the
  rack over. Two in one word compound to ×4.
- **Ghost** (ghost metal) — holds no place in your hand, so you effectively draw
  one more, but nothing can ever be done to it: no paint, trim, nick, second
  letter or growth, and the Stereotyper can't copy it.
- **Rainbow** (rainbow roll) — reads as *every* colour to your patrons, waking a
  whole guild, though it lifts no colour multiplier until painted. It counts as
  azure to *the Fountain*. Mind the Stoker, who reads it as crimson and burns it.
- **Rose** (rose metal) — print a sort struck in it and a seated patron is
  crowned with a laurel. Not consumed, so it pays every time you fit it into a
  word. It comes only out of a party bag.

**The Editors** — every chapter's third page is its **Deadline**, and the room
knows it: the candles go redder and the wood darkens, fading with the page
(`body.deadline-on` in `css/style.css`). An editor holds the desk, drawn at
random from a roster (`js/bosses.js`) as the page is dealt and never announced
sooner, so the rule is a puzzle for the rack in front of you rather than
something to build against. Almost none bans anything — each warps the *shape*
of the words instead:

- **Padder** — five letters at least, and pays by the word.
- **Columnist** — re-sets an exact measure after every print.
- **Populist** — none but words the common reader knows; **Obscurantist** —
  spikes the commonest 500.
- **Minimalist** — spikes every describing word, off the same list *the Poet* is
  paid from, so the two are exact opposites.
- **Serialist** — each word opens on the letter the last one ended with.
- **Indexer** — files the page alphabetically; **Escalationist** — every word
  must outscore the one before.
- **Enthusiast** — lends a tile of a beloved letter and expects it in every word.
- **Reviewer** — receives each word in a temper (×0.2–×0.95), rolled openly
  before you compose.
- **Completist** — deals two extra tiles and permits no discards.
- **Eeeditor** — keeps three places in your hand filled with plain E, restoring
  one the moment you print it; **Editooor** — the same in O.
- **Economiser** and **Redactor** — below; the two whose rules reach past the
  word in the groove.

A word that breaks the house rule is not refused — it is **spiked**: printed,
filed, counted, but at ×0.2. The editor's bar above the readout carries the live
demand and calls the verdict while you compose, because nothing here scores what
the preview didn't promise; beside it runs the page's record, one mark per word.
Chains and indexes are reset by the spiked word itself, so a sacrificial APPLE
is always a way back in.

**An editor that inverts a patron you own never takes the desk.** Most editors
merely idle a seat for a page, a fair cost of the roster being a lottery — but a
few would spike the *exact* words a patron is paid for. Those pairs live in
`BOSS_CONFLICTS` (`js/bosses.js`) and are filtered out as the Deadline is dealt:
keep *the Poet* and the Minimalist stays away, *the Lexicographer* and the
Populist does, *the Abecedarian* or *the Apprentice* and the Padder does. The
bar is exact inversion — the patron's trigger and the editor's spike condition
being one test read in opposite directions. Adding a pair is one line, and both
directions come with it.

The two frequency editors read `wordlists-themed/common.txt`, the one themed
list whose *order* is data: `js/themes.js` keeps each word's line number as its
frequency rank. The Populist takes the first 8,000 — effectively the whole list,
so a word passes if the list has heard of it — the Obscurantist bars the first
500, and The Lexicographer — a patron, not an editor — pays ×1.5 for words absent
altogether, so its 8,000 entries are a game number too. Rebuild it with
`tools/build-common-list.mjs`, and never sort it alphabetically.

Three editors **lend** tiles. A lent tile is cast from no collection template:
no paint, trim or nick, never discardable or returned to the bag, gone when the
page ends. The Enthusiast's gift rides *above* your hand size; the Eeeditor's
three E's sit *in* the hand and take three of its places, a cage you build
around, and the Editooor runs the same cage in O. The two kinds are coloured
apart on the board: warm brass for the gift, cold ink-blue for the lender's own.

**The Economiser** is the only editor whose cost outlives its page: after each
word you set, one tile you *didn't* is destroyed for good. It reaches only into
the rack (so the word you just built is safe by construction, and a longer word
is a smaller offering), takes one sort per word, and goes through
`trashFromCollection` like every other destruction — so the Smelter's floor
holds it at twelve tiles, the Composter is fed by it, and *the Revenant* walks
half of it back out. It never spikes: the toll is the whole editor.

**The Redactor** writes its rule on the tiles rather than the words, wrapping a
third of the **collection** — not of the hand, which is the point: discard a
wrapped tile and you draw from a bag still a third wrapped, so the condition
lasts the page. A wrapped tile keeps its letter and loses everything else. That
promise is kept in one place: `isWrapped` in `js/state.js` sits inside
`getActiveColour`, `countsAsColour`, `getActiveGrowth` and `restingPoints`, so
nothing else had to learn the word; scoring's pass 0 strips what is read
straight off the tile (trim, nick, metal, face value), on a copy.
`REDACTOR_SHARE` in `js/bosses.js` sets the share, and the wrapping is laid and
cleared in `startPage`, so it cannot outlive the editor that laid it.

**Postnoms** — now and then a patron calls at the Market already lettered. *The
Scholar* arrives as **Dr Scholar, PhD**: the same patron, plus a ×1.2 Mult of
its own paid at its own turn, so it is worth most late. The card is struck on
foiled stock and names its letters, since the multiplier is nowhere in the
description. It costs 3 Coins over the odds, half of which comes back if you
dismiss it. `POSTNOM` in `js/constants.js`.

**Misspellings** — three patrons forgive a word the dictionary turns away, and
none of them correct it: what you set is what prints. *Titivillus* takes one
wrong or transposed vowel (WIERD for WEIRD) if the word holds an azure letter;
*the Stumbler* takes one pair of adjacent letters swapped (TEH for THE); *the
Skimmer* takes the middle letters in any order, provided first and last are
right. Your book fills with misprints, which is the point of them.

**Compounds** — *the Binder* licenses a construction English makes freely: any
two nouns set end to end count as a word, so DOOM and HAT make DOOMHAT (its
nouns are `wordlists-themed/nouns.txt`). What it coins is a noun like any other,
so *the Sculptor* pays ×2 for it — one seat makes the word legal, the other pays
for what it is. The halves stay singular, so CATS and HAT still don't.

**Marks** — `?` and `!` spell nothing. A mark is appended to a finished word:
one `?`, one `!`, or `?!` — never doubled, reversed or mid-word. The dictionary
and your patrons only ever see the letters in front, so `CAT?` is still a
three-letter word and `ANNA!` is still a palindrome. A mark is worth a point,
but the point of it is that marks take paint, trims and nicks like any tile and
sit at the *end* of the word, exactly where a **left nick** wants to be. The
**interrobang ‽** is the only sort you *make*: hold a `?` and a `!` and the
Punchcutter cuts the pair into one tile that closes a word by itself, worth
**50 Points** — the most in the case — with nothing consumed.

**The Medieval sorts** — four letters English gave up, sold only at *the
Medievalist's* stall. Each **stands for** ordinary letters: **þ** thorn is TH
(10 Points), **Ƿ** wynn is W (8), **ȝ** yogh is Y, GH or Z (5), **Æ** ash is AE,
A or E (1). They print as themselves and score their own Points, but the
dictionary, your patrons, the editor and the measure all see the letters they
stand for, so þORN is judged as THORN: five letters of measure from four tiles.
Every reading is tried in order and the first that makes a word wins. They take
paint, trims and nicks, but never a second face. `MEDIEVAL` in
`js/constants.js`.

**Hidden things** — the game has a few, and this is the only place they are
written down. Set **CAT** and *the Domestic Shorthair* waits at the head of the
patrons at the next Market — and only the next — **free**. The offer is spent
the instant that Market rolls, bought or not, until you spell CAT again. Any
word spelling out R-A-T pays her a Coin and earns her a laurel (PIRATE and
GRATIS count). What she EATS is narrower: only a **RAT ligature tile**, which
comes from *the Rat Catcher* and nowhere else.

**The opening draft** — before page 1 you kit out the press from a free spread:
2 paints of 4, 4 tiles of 10, no coins involved. The starting collection ships
unpainted, so those two paints are where colour enters the run. No patron is
drafted: the first is hired at the first Market, once you know what the press
needs.

**The Market** (between pages) keeps a fixed layout with churning contents:
4 patrons, 4 tiles (5 with the Medievalist's stall), 2 **sundries** and 2
**stalls** from a roster of six. *New offers* re-rolls everything, and its own
price doubles with each press. Tiles live in your **collection**; each page the
whole collection shuffles into the **bag**, and printed or discarded tiles wait
in the **discard pile**. *Your collection* opens the case read-only, headed by a
tally by colour — rainbow metal tallied apart, since it counts as every colour
and would otherwise be counted four times over.

**No two Markets price a patron alike.** A calling card's price is rolled as it
is laid out: half the time the price on the tin, a quarter a Coin cheaper, a
quarter a Coin dearer, and the card says which so a bargain can be spotted while
scanning the row. It rides on the offer, so *New offers* re-rolls it too; the
cat, being found rather than bought, is never haggled over, and no card asks
less than a Coin. `PATRON_HAGGLE` in `js/constants.js`.

**Sundries** are consumables kept on the **workbench** (two slots to start, and
the Colophon can add two more). Arming a tool is one tap and picking its target
is the second, which also spends it. The **paint tube**: tap it mid-page and two
random unpainted tiles from your hand light up; tap one and the paint is
permanent — the candidates are the tube's to choose, the pick is yours. The
**ratchet** keeps the same rhythm, stepping one letter a single place along the
alphabet (D becomes C or E, A becomes Z or B); two arrows say which way it
points, so set them before you pick the letter. The **tongs** are the one tool
that still wants a confirming tap on itself, because they destroy the tile.
It walks the press's own alphabet rather than A-Z, so P steps straight to R —
there is no lone Q sort to land on — and ligatures and marks can't be stepped.
The **reshuffle** is banked until spent, on the Market's own offers (free, and
it doesn't touch the escalating reroll price) or on a Colophon pick.

**The registers' packages.** The four register patrons — *the Sexton* (spooky),
*the Paramour* (romantic), *the Poppet* (cute), *the Vulgarian* (rude) — pay ×3
Mult for a word on their list, which plays like a lottery ticket: their lists
run 3–9% of the dictionary, so a seat fires by accident about one word in
fourteen. So the ×3 has a parcel behind it. Print a word one of them likes and
there is a 1-in-2 chance a **package** lands on the workbench — one roll per
firing register, so a word both spooky and romantic rolls twice, and a full
bench turns the gift away and says so. A package is a sundry like any other,
sold back for a Coin, and opens on a tap:

| | holds one of |
|---|---|
| 💌 **A billet-doux** | a two-faced X\|O in crimson · a **love potion** (a random patron takes an empty seat, free — and nothing at all if your table is full) · a tube of crimson |
| ⚰️ **Grave goods** | an azure **OO** in ghost metal · the same in cursed iron (rarer) · a tube of azure |
| 🎁 **A party bag** | a tile struck in **rose metal** (weighted highest — the Poppet's list is the smallest of the four) · a **rainbow applicator** · a pot of ink wash |
| 📦 **A plain brown wrapper** | a pair of tongs · a **curse applicator** · a silver-trimmed **FU** |

The **applicators** are the tube's gesture pointed at the metal: each lays out
two tiles from your hand and strikes the one you pick in rainbow or hellbox
iron, refusing any tile already wearing a material. **OO** and **FU** are
ligatures no shop will sell you — OO counts as a doubled letter by itself, so it
quietly feeds *the Twins*.

The **toolbox** opens into two *different* tools — the first in the box's own
slot, the second only if the bench has room, else it rolls away. No shop sells
four of the five, one per guild's temperament; the box is the only door to three
of them, *the Ragman* pays the fourth for a crimson rag, and the odd ratchet
rattles around in there at half the rate:

- **Loupe** (jade) — a tile's value doubles, to a maximum of 30, written in for
  good. It doubles the whole corner number, so raising a common letter first (a
  silver trim, the Grafter's growth) and *then* doubling beats doubling the
  jewel already near the cap.
- **Laurel** (amber) — crowns a random seated patron: +3 Points on every word
  while they keep their seat, stacking if it lands twice. The crown pays at its
  own seat's turn, so a laurel in front of your multipliers is multiplied and
  one behind is not — and a dismissed patron takes their laurels with them. The
  tool is not the only source: *the Laureate* crowns himself for every jade tile
  printed, *the Frontispiece* each time his opening word clears a page
  single-handed, *the Cellarer* for every page he ages through.
- **Tongs** (crimson) — grip a tile and it goes to the furnace for good; the
  next word printed gains +8 Points. Grips stack; the heat expires with the page.
- **Ink wash** (azure) — up to four unpainted tiles take a faint wash, one of
  each colour. A washed tile counts as its colour to patrons *and* to the
  multiplier, and keeps the promise until it prints. Real paint replaces a wash.

The **fleuron** ❧'s mirror, ☙, is a tile rather than a sundry: a printer's
ornament in gold that sets no word at all. It can only be printed alone, for its
single Point, and pays 1 Coin every time a page completes, wherever it is.

**The compost heap** appears at the Market while the Composter is seated: every
tile destroyed anywhere rots down into a jade tile with complications of its
own. The heap holds the freshest six, older rot is turned under, and you may
lift one free each visit.

**Stalls** are services. The **Smelter** (trash a tile) and the **Stereotyper**
(clone any tile) work off your whole case. Four are *proposal stalls* — they lay
out six of your own tiles, each paired with a proposed change, and you
commission the one you like: the **Gilder** offers trims, the **Punchcutter**
cuts a second letter into a tile, the **Dresser** cuts a nick into an edge, and
the **Painter** proposes colours for six unpainted tiles, every pot guaranteed a
showing. (Choosing your own colour, and repainting a coated tile, is the paint
tube's trade.) The Gilder and the Painter lean towards your rarer letters, so a
Z is about twice as likely to be laid out as any one of your Es. Every purchase
doubles that stall's price for the rest of the visit; prices reset when the next
market opens. The Dresser starts at 3 Coins, every other stall at 2.

**Patrons** grant standing boons — five seats to start (the Colophon can add
more), dismissable for half their cost. The roster is built around **colour
guilds**, each paint keeping a family that makes committing to it an archetype:
amber pays coins, jade compounds forever, crimson burns tiles for power, azure
bends the rules of spelling — plus neutral wildcards and the word-shape
classics. A guild member's card wears its livery and its seat a small livery
pin; neutral patrons stay plain ivory. *The Alderman* reads the liveries: ×1.5
Mult per guild represented on your shelf, counted once each and whether or not
it fires. Some patrons act after a word prints (burning, growing, painting) or
as a chapter turns, not only while it scores. While you compose, every patron
whose condition the word already meets wakes up and wears a badge of exactly
what it stands to add, while the rest dim away. It reads off the same score
script as the readout, so what a patron promises is what it pays.

**The star-crossed lovers.** One pair of patrons cannot be held at the same
time. *Romeo* (amber) and *Juliet* (jade) each pay ×1.5 for a word wearing their
own house's colour and none of the rival's — crimson and azure are nobody's
business in this quarrel — so the two can never fire on the same word.
Hire both and neither keeps a seat: they leave the shelf together and **The
Star-Crossed Lovers** takes the place between them — ×2 Mult for any word
carrying *both* liveries, which one rainbow tile satisfies alone. That seat is
`unlisted`, so the wedding is the only door to it, and its `supersedes` keeps
Romeo and Juliet off the Market afterwards, so no run marries twice. Ghosts
count as held — a murdered Romeo goes on working, and can still fall in love —
and if both halves were already dead the merged seat haunts the graveyard rather
than taking a place it has no claim on. The marriage is `marryLovers` in
`js/state.js`, checked wherever a patron arrives.

**Editing the roster.** Every patron's name, emoji, rarity, cost, guild and card
text lives in one flat table at **`js/patron-cards.js`**, keyed by patron id —
that is the single place to rename, reword, reprice, or re-rarity a patron. What
a patron *does* lives against the same id in `js/patrons.js`. The two are
married at the bottom of `js/patrons.js`, and a card with no behaviour (or a
behaviour with no card) throws on load naming the id.

A `desc` may contain `{KNOB}` placeholders, filled from `js/constants.js` as the
module loads — `{ESPALIER_STEP}` for the value itself, `{1/NUDIST_TRIM_CHANCE}`
for "a 1-in-4 chance" — so retuning a number retunes the card text with it. New
knobs are exposed by adding a line to the `KNOBS` object at the top of
`js/patron-cards.js`.

**Letting things go** — the top of the Market restates **Your table** and **Your
workbench**, so what you hold is never out of sight while you shop: the ✕ on a
seat dismisses its patron for half their cost, the ✕ on a bench slot sells the
sundry back for 1 Coin. Selling is about freeing the slot, not the coin — and a
tool you will never spend can be thrown away on the board's own bench for
nothing. (Touch has no hover: long-press a slot for the same act.)

**The Colophon** — when a chapter's Deadline is cleared, and *before* the Market
opens, choose one of three permanent upgrades: +1 hand size, +1 discard, +1 patron
seat, +1 workbench slot, or a paint pot of a colour of your choice. At least one
non-paint option is always offered while one remains, and each of the eight
picks caps at 2 takes across a run. *Skip* declines all three for 2 Coins.

**Discarding** — press *Discard* to arm it, tap the tiles to throw away, then
press it again to confirm (press with nothing selected to cancel).

**Patron reactions** — after a genuinely big word, a seated patron may pop up a
one-line, often gleefully wrong reaction. Purely cosmetic. The bar is half the
WHOLE PAGE'S quota in a single word: nothing below that, then the per-patron
chance climbs to a certainty at twice the quota — measured against the quota
rather than a page-fifth of it, so the curve never needs retuning as quotas
climb.

**Run structure** — 10 chapters × 3 pages; the third page of each chapter is a
Deadline with a steeper quota and a coin bonus. 5 words and 2 discards per page.
Clearing chapter X wins the run; the appendices (endless mode) continue beyond.
Each chapter draws its title at random from `js/chapters.js` and keeps it.

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
| A single chapter that plays too easy or too hard | `js/constants.js` → `CHAPTER_1_EASE` and `CHAPTER_EASE` (a per-chapter multiplier on that chapter's quota only) |
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
| Rewards & interest | `js/constants.js` → `REWARD` |
| Colophon roster, offer count, repeat cap, skip grant | `js/constants.js` → `UPGRADE_OFFERS`, `MAX_UPGRADE_REPEATS`, `SKIP_COIN_GRANT`; definitions in `js/upgrades.js` |
| Patron reaction odds | `js/constants.js` → `REACTION` (`floor`/`ceil` as fractions of the page's whole quota: silence below `floor`, a certainty at `ceil`); the lines themselves in `js/quips.js` — a flat array, add more any time |
| How far a patron's asking price can drift | `js/constants.js` → `PATRON_HAGGLE` (`spread` Coins each way, `chance` per side) |
| How long a line stays up to be read | `js/anim.js` → `READ_BASE` / `READ_PER_CHAR` / `READ_MAX`. Every bubble, floater and bar message holds for a span measured off its own length, so a long line is given longer, not read faster |
| Words / discards / seats per page | `js/constants.js` |
| Patron names, emoji, rarities, costs, guilds and card text | `js/patron-cards.js` — one flat table keyed by patron id; `{KNOB}` braces in a `desc` are filled from the `KNOBS` object at the top of the file |
| What a patron *does* | `js/patrons.js`, against the same id |
| Patron tuning that reaches beyond a score (growth steps, burn odds, trim chance, dye count, coined-word length) | `js/constants.js` → `GRAFTER_STEP`, `STOKER_BASE`, `STOKER_STEP`, `ARSONIST_ODDS`, `NUDIST_TRIM_CHANCE`, `DIPPER_PAINT_CHANCE`, `GAMBLER_ODDS`, `DYE_TILES_PER_CHAPTER`, `NEOLOGIST_LENGTH` |
| The editor roster, the conflict pairs, the Redactor's share | `js/bosses.js` → `BOSS_CONFLICTS`, `REDACTOR_SHARE` |
| Animation step timings | `js/constants.js` → `ANIM` (all divided by the Settings speed slider) |
| Chapter titles | `js/chapters.js` — a flat array, add as many as you like; each run draws its own and won't repeat until the list runs out |
| The Stenographer's acronyms | `wordlists-themed/acronyms.txt` — one per line, `#` comments; letters only, and no lone Q (the press has no Q sort to set it with) |
| The Expectant Parents' baby names | `wordlists-themed/names.txt` — same format; regenerate from the US and England & Wales charts with `tools/build-names-list.mjs` |
| Words barred from the game entirely | `wordlists-themed/excluded-slurs.txt` — one per line, `#` comments. Enforced at load by `js/excluded.js` against the dictionary, every themed list, and The Neologist's coining sheet, so an entry here can't come back through a word list, a custom dictionary or a coined word. Whole-word matches only |
| The four registers' word lists (the Sexton, the Paramour, the Poppet, the Vulgarian) | `wordlists-themed/theme-*.txt` — one word per line, edit freely; loading in `js/themes.js` |
| The three parts of speech (the Sculptor, the Poet, the Athlete) | `wordlists-themed/nouns.txt`, `adjectives.txt`, `verbs.txt` — same format. The nouns list holds singulars only: plurals are read back to their singular in `readsAsNoun` (`js/patrons.js`), which is also where the irregular ones (MICE, TEETH, CHILDREN) are named. It is The Binder's list too, so an entry added there can be stacked into a compound as well as paid for |
| The Frontispiece's opening multiplier & growth | `js/constants.js` → `FRONTISPIECE` |
| The star-crossed lovers — who marries whom, and for how much | `js/constants.js` → `LOVERS` (`pair`, `merged`, `apart`, `united`); the wedding itself is `marryLovers` in `js/state.js` |

## Architecture

| File | Role |
| --- | --- |
| `js/state.js` | game state, save/load (`folio_save_v1`, schema v12), settings, tile ops, painting, sundries, effective hand/seat/workbench sizes, the manuscript |
| `js/scoring.js` | pure score computation — returns a step-by-step *script* the UI replays |
| `js/patron-cards.js` | the patron roster as data: name, emoji, rarity, cost, guild and card text, keyed by id |
| `js/patrons.js` | what each patron does, against the same ids — and the merge that marries the two |
| `js/bosses.js` | the editors: the Deadline roster, `BOSS_CONFLICTS`, `REDACTOR_SHARE` |
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
function powers the live preview, the tooltips and the replayed cinematic — they
can't disagree.

The **manuscript** is the strip under the board: every word printed this run,
set as one long line of type, newest last, the earlier ones running off the left
edge under a fade. Messages (a rejected word, a purchase, a hint) borrow the
strip for a few seconds and it settles back on its own.

The **manuscript** proper (❦ in the header) is the same words bound as a book,
with the tally in the button's tooltip rather than a badge. Inside: a heading
and title for each chapter, ruled off with its word count and score, and beneath
it the words of each page set as running prose — small caps, each score riding
after its word as a raised figure the way a footnote mark does. Every page keeps
its folio number in the margin in lower-case romans, except a Deadline, which is
marked with a fleuron rather than numbered. The first word of each chapter takes
a drop cap, and the best word of the run is illuminated.

A *Developer* section in Settings has shortcuts: +20 Coins, open the Market,
clear the current page. The console exposes `window.folio = { state, settings }`.
