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

(ES modules don't run from `file://`, and the bundled `wordlists/wordlist.txt`
— 72k words — is fetched over HTTP. A custom list can be loaded in Settings.)

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

### The two looks

The board has two looks, chosen in Settings. **The Bench** is the default: one
working surface with the game's objects on it, each object being the
information it carries. The composing stick is the groove, and it is a ruler —
the measure is cut along its edge (`renderRule` in `js/render.js`), a tick per
sort and the multiplier each length earns from the sixth, so how far a word
reaches *is* the length multiplier, and the steel knee closes on the word's
end. The marks are re-cut for the word in the groove rather than engraved once,
because the measure counts letters where the stick holds tiles: a þ or a CH is
one sort of two letters, so every tick says what the word would be worth if it
ended there. The manuscript sheet is the status — chapter, folio, quota, and
the words of the page on ruled lines, with the word pips as the lines' bullets.
The proof slip is the readout: Points, then the measure and the paints as inked
stamps, only those that apply, and the total under a rule; what each *patron*
adds stays on its own calling card, in the order the seats speak, because seat
order is a rule of the game and a bar would flatten it. The type case is the
hand, one socket per place, so a wider hand is more sockets — and the case is
sized to those places exactly, because `auto-fill` cuts a column only where a
whole one fits and two pixels short drops the last sort to a second row with
the space for it still showing.

The bench's buttons say what they do and stop: no shortcut printed under each
one, and no "swap tiles for new" under Discard. The keys are listed in Settings
instead, and the one caption that was guidance rather than a shortcut — what to
do once a discard is armed — is already said in the status bar (`discardArmed`
in `js/text.js`). Retro keeps its captions.

**Retro** is the board as it was — panels, chips and pips. It is `css/style.css`
untouched: every rule of the bench lives in `css/bench.css` (the board) and
`css/bench-sheets.css` (the sheets), each scoped to `html[data-look="bench"]`,
so the two cannot bleed into one another, and a piece of furniture only the
bench has (the scale, the knee, the sheet's lines, the rule on a card) is put
away by one line in `style.css` and brought out in `bench.css`. The rooms tint
the bench top — the Baize is green felt under the paper — and the Deadline
still pulls it to ember. The layouts belong to retro; the bench holds the Folio
column underneath and puts the picker away.

The sheets follow the same idiom. The Market is a fair: a trestle of scrubbed
deal under a striped awning, the calling cards as they were, the sorts in the
hand's own type case with swing tags, the sundries as things on the table, the
stalls as signs hung from a rail, each under its own awning. The Black Market
is the same trestle at night — a tarpaulin, one lantern, a black cloth, and
chalk where the fair has type. The Colophon is a printed leaf with three picks
on it, the manuscript a bound book with its initials rubricated, and the
banner a broadside. The Testing Chamber and the graveyard keep their own
skins in both looks: a dev bench has no idiom to honour, and the ghosts'
darkness is the point of them.

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

When the Deadline's editor changes what a word is worth — a spike, or the
Reviewer's temper — the readout **strikes the figure through and writes the
editor's beside it**, so a spike reads as a thing done *to* a score rather than
as the score. The print shows it happening: the number the word was worth lands
whole, and then the desk reaches over and crosses it out.

The readout shows a live projection with a chip per colour — plus the measure,
the purple trims, a cursed tile, a bold word, and a **primed** multiplier armed
against this word before it was set, each of which appears only while it has
something to say — and **everything that does something explains itself where it
sits**: hover with a mouse,
long-press on touch, wherever the thing appears. Nothing is summarised beneath
market cards. What a sundry does is written once, in `js/text.js` →
`SUNDRY_TEXT`, and looked up through `sundryTip` in `js/constants.js`. On print the score replays in the order it happens: *the Twins*
recast the doubled pairs, patrons write bonuses onto the tiles, the tiles pay,
the nicks read their side, each colour's multiplier lights, and the patrons weigh in seat by
seat.

### Seat order

Patrons act **in the order they sit**, and one rule follows from it:

> A ×Mult multiplies everything the table has said in front of it, and nothing
> behind it.

So seats that *add* are worth more in front, seats that *multiply* worth more
behind. Drag a card along the shelf to reseat it, on the board or on **Your
table** at the top of the Market. (Additive Mult and ×Mult commute; it is the
Points that care.)

The one documented exception is a seat that **cleans up after the table**
(`speaksLast` on its behaviour — currently only *The Lye Boy*). Its `onPrinted`
runs after every other seat's, wherever you sit it: it would otherwise be
scrubbing a forme the other seats are still painting, and seating it in front of
a painter would be strictly better than seating it behind. Everything else obeys
seat order, which is a promise to the player.

Two things happen before the table speaks. Patrons whose promise reads
*"such-and-such tiles gain +N Points"* write that number onto the tile itself,
so **the nicks read it and the Monogrammists double it**; where it is written in for
keeps the groove shows it in **jade** rather than brass. And the tongs' heat and
the toll for a curse left in hand land first, so any multiplier seated at all
catches them.

### The Quoin — the seat that reads position

Colour multipliers pay for **spreading** colour (one of each is ×16) and punish
**stacking** it (four of one is ×5), so nobody stacks a colour on purpose. **The
Quoin** (rare, 11 Coins) is named for the wedge that locks a forme of type tight,
and it pays for type that sits tight: **×3 Mult when two tiles of one colour
stand side by side in the word**. That makes two of a colour beat two spread (×9
to ×4) and four of a colour pull level with four spread (×15 to ×16) — the dead
build opens, the live one is untouched.

It is the only patron in the game that reads **position**, and the constraint is
real because *a word's order is its spelling*: you cannot shuffle the tiles to
suit. So the build is to paint letters that turn up adjacent — a doubled letter
(21% of words hold one) or both halves of a bigram you keep drawing (ER, IN, ES,
ED). Nothing else asks you to think about paint that way.

It reads `countsAsColour` rather than `getActiveColour`, deliberately: a rainbow
tile counts as *every* colour, so one beside any painted neighbour locks the
forme. That is a real job in the multiplier game for a metal that has never had
one — rainbow lifts no multiplier of its own.

### The Powdermonkey — a charge that moves

He keeps **one tile of your hand primed**, and marks a fresh one every time the
hand changes. A primed tile scores and goes off exactly as squib lead does
without being cast in it: ×2 Mult, then destroyed, each neighbour on a 1-in-2.
The seat has no score hook at all — a primed tile *is* a squib to everything that
asks (`isSquib` in `js/state.js`), so scoring pays its ×Mult and `detonatePrinted`
sets it off, neither knowing he exists.

The mark **moving** is the design. Held until spent it would settle on your best
tile and sit there being a dead seat until you gave in; moving, it is a fresh
offer every hand — junk worth cashing, or a tile to step around. He also has a
shape over a run worth keeping: early your bag is ballast and feeding him costs
nothing, and late every tile you own is dressed and grown, so the same ×Mult asks
a real price. A seat that gets *dearer* as the run goes on is rare.

### Four seats that pay outside the word

**Fifteen-fingered Frank** (azure, uncommon, 7 Coins) is the plainest of them and
the easiest to feel: **every word printed grows him a finger — and widens your
hand by one — for the rest of the page**, and the page turn takes them all back.
Nothing on the first word, +1 on the second, +4 by the fifth — so he pays most
exactly where the length multiplier does, and a page you are already winning is a
page he makes easier. He rides `state.rackBonus`, the one term in
`effectiveRackSize` that is neither permanent nor the editor's, which is why the
reset is free: `startPage` already clears it.

He is bounded by the press. A hand of fifteen needs fifteen sorts left in the bag,
so a slim collection feels him less than a fat one — the right way round for a
seat you buy to make a big hand bigger. A **spiked** word still counts: it is a
word printed, an editor's page is where a wide hand is worth most, and letting the
toll take the fetch as well would be two punishments for one word.

His name is arithmetic rather than a round number: `RACK_SIZE` (10) +
`WORDS_PER_PAGE` (5) × `DEVIL_STEP` (1) lands him on **fifteen fingers exactly**
on the last word of an ordinary page — the same fifteen the paragraph above
arrives at from the bag's side. Nothing enforces the pun: a patron's name can't
carry a `{KNOB}` the way its `desc` can, so retuning any of the three quietly
makes him a liar.


Most patrons are paid at the moment a word scores. These four are not, and each
one attaches to a number the game already keeps but never spent.

**The Gardener** (jade, rare, 10 Coins) brings the **bar down** instead of
pushing the score up — the only seat in the game that does. Every jade sort
printed shaves a slice off *every quota for the rest of the run*, and each slice
is smaller than the last: `gardenerRelief` in `js/constants.js` takes
`GARDENER_RATE` of whatever slack is left, so the first print is worth about 1%,
twenty-five prints reach 20%, and the whole approaches `GARDENER_CAP` (50%) and
never arrives inside a run. A relief that could reach 100% would end the game;
one that climbed straight would make the last chapters a formality. This one is
generous early, when a page is a fight, and decorative late, when it is not —
which is the opposite of how it reads, and the reason it is worth a rare seat.
It is read where the quota is *set* (`startPage` in `js/state.js`), so it is
permanent and never has to be re-applied.

**The Spendthrift** (amber-jade, uncommon, 6 Coins) is the reward's other half.
The page reward already pays interest on Coins **held**, so nothing in the game
rewarded spending them. He does: every `SPENDTHRIFT_STEP` Coins out of the purse,
one random sort of your collection gains Points **for good**, as many as the
chapter you are on. He is worth more the deeper you are, which is the right way
round for a seat you buy early. He could only be written because every purchase
in the game goes through one door — `spendCoins` in `js/state.js` — which keeps
`state.coinsSpent`; a new shop that debits `state.coins` directly would be
invisible to him, and that is the reason to route it through the door.

**The Beadle** (amber, rare, 9 Coins) keeps the guilds' books, *and their doors*.
The Alderman pays Mult for **breadth** of livery; the Beadle pays favours for
**depth**. `BEADLE_THRESHOLD` (2) seats of a colour and that guild's stall works
once a visit for nothing — crimson opens the smelter, azure the punchcutter,
jade the gilder — and two ambers put `BEADLE_PAGE_COIN` on the end of every page.
Two is the threshold because it is the first count that cannot happen by
accident. The favours are read live at the price (`stallPrice` in `js/market.js`),
so hiring a second crimson mid-Market opens the smelter *that same visit*, and
`stall.uses` makes it once per visit rather than once per stall.

**The Quartermaster** now flies **crimson *and* azure**, because a discard is both
halves at once: it **dismisses** tiles, which is crimson's whole business, and
what it buys you is **flexibility** — a second look at the hand — which is
azure's. He was crimson alone and read as a destruction seat that never destroyed
anything. He gives +1 Discard, and a second while two of your seats fly azure,
*himself counted* — which is what makes the second discard a thing you build for
rather than a thing you find, and is the mechanical half of the same argument: a
dual livery is what lets him count towards his own threshold.

### The Lye Boy — selling the paint engine

Paint is the game's *multiplicative* half: each painted tile is +1 to its
colour's multiplier and the colours multiply **across** one another, so a
well-dressed word reaches ×12 and past it. **The Lye Boy** (crimson, uncommon)
is the one seat that spends that engine instead of feeding on it. Every painted
tile in a word he sees is scrubbed bare — permanently, written through to the
collection — and he keeps **+0.25 Mult for each coat**, for good.

What makes it a decision rather than a one-time cost is that the ramp is paid
**per coat, not per word**. Once your tiles are bare he pays nothing, so keeping
him fed means buying paint — a tube, a pot, a wash. He is a sink that turns
Coins into permanent Mult, which is the thing a rich late run has nowhere to
put. A committed run feeds him forty or fifty coats and lands near +12 Mult:
about what a good colour build was worth, only permanent, and drawn from every
word instead of the lucky ones.

A **wash** counts (`getActiveColour` reads a wash as paint, so anything that can
see a coat can take one), and so does a coat laid *mid-word* by a painting seat
— read off the script rather than the tile, since scoring's pass ½ paints a
copy. Which makes the painters his feeders rather than his rivals: an
Illuminator lays a colour, the word scores with it, and he drinks it. A tile's
**metal** is untouched, so a rainbow tile survives the bucket still reading as
every colour.

His curve is `LYE_BOY_BANDS` in `js/constants.js` — deliberately **one band**,
because this is meant to be played with before it is capped. The Beekeeper and
the Abecedarian both needed slowing in the end; when this one does, it is a row
in that table and nothing else, and the card quotes the whole of it.

### The Sesquipedalian — the record the run keeps

**The Sesquipedalian** (uncommon, 6 Coins) is paid for the longest word the run
has set: `SESQUIPEDALIAN_STEP` (0.1) Mult per letter of it, added on every word
thereafter. He keeps no tally of his own. The manuscript already holds every
word printed this run, so he reads that, as *the Copyist* does — which means a
word set before he was hired counts, a save needs nothing new, and there is no
second record that can drift from the book. The word in the groove counts too,
read live off the same letters the measure counts, so the preview and the print
agree and the record word is paid itself rather than only every word after it;
a seat that paid for the *last* long word would ask you to set your best word
twice.

Letters, not tiles, like every rule about a word's shape: þORN is five, BALLOON
is seven whoever struck the second L, and a trailing mark is not counted. Ten
letters is +1 Mult for the rest of the run — about what one long word's measure
is worth, paid again on every word — which is generous in the first chapters,
where +1 is a third of the multiplier, and small by the last, where the colour
engine stands at ×12 and a seat that only adds is a seat you sell. A record is
announced once, over his card, when a word breaks it; the tap-through says what
the record is and what it pays. `SESQUIPEDALIAN_STEP` in `js/constants.js`; the
reading of the book is `longestPrinted` in `js/patrons.js`.

**Ghosts.** *The Ripper* kills one of your other patrons when you print one of
his watchwords — KILL, MURDER, SLAY, DIE, STAB, SLASH, REAP or KNIFE — then
flees back to the Market's pool. The match is exact, so SLAYER walks past him. The victim moves off the
shelf into your **ghosts**, in a drawer that pulls out over the patron row
from the door on its edge (and pulls itself out when a ghost speaks), keeping its
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

### The Twins

A doubled letter is two of the same thing, and *the Twins* hold the press to it.
Every doubled letter pays **+5 Points**, and where the double is two whole tiles
showing the same face, **the second is struck again from the first** — paint,
trim, nick, metal, grown Points and both faces of a dual, overwriting whatever
it wore before, **and keeping it for good**. Two plain Ls are unchanged by that
and paid anyway; one gorgeous L beside a plain one is the whole point, and the
reason the seat wants your pairs *lopsided* rather than tidy. The recasting
lands in scoring's **pass ⅓**, before the word is so much as read, so everything
downstream sees two identical tiles: the colour multipliers count the coat
twice, a gold trim pays a second Coin, a Monogrammist finds two of its letter —
and then the seat's `onPrinted` lays the same mould into the collection, so the
tile carries it into every word after this one.

It is a clone, which means it can cost you: **the mould is whichever tile you
set in front**, so a plain L laid down first will strip the good one behind it.
That is the decision the seat is made of, so it is never taken blind — the
groove **brackets every pair the Twins can see** while the word is still being
composed, a gap either side and a dashed rule that breathes, and the second tile
already shows what it is about to become. Set the good tile first.

That gives the seat a shape over a run: at the first Market your tiles are all
bare and it is worth its +5 and nothing more; through the middle it is the
cheapest way there is to spread one good tile across a collection; by the end
most of what you own is dressed already and it has little left to give — bar the
one extraordinary tile you are trying to make copies of.

The pair has to be two whole tiles because a recasting rewrites what a tile
*spells*. Striking the H of `CH`·`H` again as a CH would print CHCH, a
different word than the one you set, so a double that straddles a ligature — or
a tile that spells its own double, like `OO` — is **paid and left alone**. A
wrapped tile is neither copied nor copied onto: the paper is over it.

And with *the Haplographer* seated, the third case, which is the loud one. Her
licence lets a word be read as though one letter were doubled (BALOON reads as
BALLOON); *the Twins* make it so. The missing letter is **struck** — a real
tile, cast from the one it doubles and wearing its coat — and joins the word.
It is the only thing in the game that changes what *prints*: BALOON goes to the
manuscript as BALLOON, seven letters long, and the length multiplier follows.
The struck tile belongs to nobody, though: it was never in your hand, so when
the word is done it goes out with it rather than filing into the pile. The
groove shows it as a phantom from the moment the word is composed, so the
projection and the board agree about how long the word is, and the print is
where it turns solid.

### The Counterfeiter

Once a page, tap his card and the **plate** opens: the whole case, forged. Take
**one** sort — any letter you like — and the plate is cold until the next page.
One is the whole of the limit, and it has to be: a free letter is a small
kindness, a free hand is a different game.

A counterfeit sort **spells, and does nothing else**: no Points, no paint, trim,
metal or nick, and nothing can be written on one (`spellsOnly` and `isImmutable`
in `js/state.js` — the same reading the Redactor's manuscript tiles get, on
bank-note stock rather than draft paper). It takes a place in your hand while it
is there, and the page takes it back.

So what a forgery buys is **length**, and whatever your table can make of a
letter that is merely *there*: a doubled pair for *the Twins* to strike from, a
fourth colour for *the Illuminator* to find, a shape an editor will pass.

**Unless the Twins get to it.** A twin struck onto a forgery makes it **real** —
it stops being counterfeit, stops being page-only, and is adopted into the
collection wearing the mould. The worthless letter you took this morning goes
into the bag tonight as a copy of your finest tile, and that is the seat at its
best. The rule cuts one way only, though: **a forgery is never a mould.** Set
your gorgeous L and *then* the counterfeit L and you keep a second gorgeous L
for good; put the forgery in front and nothing happens to the good tile behind
it — there is nothing to strike from a fake.

## The pieces

A tile is a **letter** (or ligature, or mark), optionally **painted** a colour,
plus an optional **trim** and **nick**.

| Layer | Options |
| --- | --- |
| Paint | crimson / azure / jade / amber — each raises its colour's multiplier by 1 |
| Trim | **Gold** pays 1 Coin · **Silver** +5 Points, counted into the tile's corner number wherever it appears · **Cobalt** refreshes 1 Discard · **Purple** raises the fifth multiplier by 0.5 |
| Nick | A notch in one edge; the notched side is the direction. The nick reads every tile on that side and **adds their Points to its own** — a right nick on the first letter scores the rest of the word twice over. Nicks *do* stack, but a tile that carries a nick of its own is read at its **resting value** (the number it wears in the hand), so no nick ever reads another nick's winnings. While you compose, the nicked tile's corner number already shows what it will take |
| Letterform | Dual tiles hold two letters (flip to switch; paint, trim and nick belong to the tile, so both faces wear them) · Ligatures ING · CH · CK · TH · WH · QU spell several letters from one tile (RAT too, but only from the Rat Catcher) · **Medieval sorts** þ · ȝ · Æ · Ƿ and **marks** ? · ! — below · the lone **Q**, which no bag holds and no shop sells: the ratchet is the only door to one |
| Material | What the tile is cast from, under everything else: ordinary lead, or **cursed** / **ghost** / **rainbow** / **rose** / **blind** / **explosive** |
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
- **Explosive** (squib lead) — a squib is a small charge, and in the trade a
  short explosive piece of writing; this is both. **×2 Mult when printed**, and
  then the charge goes off: the tile is destroyed, and each tile *beside it in
  the word* rolls an independent 1-in-2 to be destroyed with it. Set at either
  end of the word it stands beside only one tile, which is the whole play —
  the multiplier costs the squib and a coin flip, and where the flip lands is
  yours to place. Survival rides luck (the escape is the outcome you'd wish
  for, the Serpent's rule), destruction runs through the same furnace as every
  other (the Composter is fed, the Revenant stands at the graveside), and two
  squibs in one word compound to ×4 — with a wider blast radius. Sold bare and
  cheap at the Black Market, nowhere else.
- **Blind** (blind emboss) — struck into the paper carrying no ink, so the
  letter is felt and never seen. A word set with one in it is **never spiked**:
  the editor cannot read what was never printed. That makes it worth a great
  deal on a Deadline and nothing at all on the other two pages, which is what
  it is priced for. The pardon belongs to the METAL and to nothing else —
  *the Silent Knight* is how blind sorts are made (print a word holding a
  letter that is written and never spoken and he strikes that letter into
  blind emboss, for good, taking a laurel for it) and the alley is where they
  are bought, but neither seat nor shop grants the pardon: the tile in the word
  does. He used to carry a word-level pardon of his own, which made the seat
  and its own product do the same job twice; his loop reads straight through
  now — print a silent letter, gain a permanent tile the editors cannot read,
  and use it on every word after. A blind sort is cast in cool grey against the
  case's warm ivory: the one metal whose point is being unreadable should not
  itself be unreadable at a glance.

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
- **Bribrarian** — below; the one who reads your purse rather than your prose.
- **Epitaphist** — one line for the whole page: a single word, half the quota to
  meet with it, and a discard more to find it. The only editor who takes the
  *page* apart rather than the words, so you stop composing and start
  assembling. (*The Astronomer*, paid per word already printed, never shares a
  desk with him — there is no such word.)
- **Completist** — deals two extra tiles and permits no discards.
- **Eeeditor** — keeps three places in your hand filled with plain E, restoring
  one the moment you print it; **Editooor** — the same in O.
- **The Incendiary** — below; the lending editor whose loan you have to spend.
- **Economiser** and **Redactor** — below; the two whose rules reach past the
  word in the groove.

A word that breaks the house rule is not refused — it is **spiked**: printed,
filed, counted, but at ×0.2. The editor's bar above the readout carries the live
demand and calls the verdict while you compose, because nothing here scores what
the preview didn't promise; beside it runs the page's record, one mark per word.
Chains and indexes are reset by the spiked word itself, so a sacrificial APPLE
is always a way back in.

**The Abecedarian** is the one seat paid for *breadth*. Everything else in the
game rewards doubling down — one colour, one letter, one shape — and this one
keeps a **case of every sort the press can set**, paying for each the first time
you print it. Every TILE has a place, not merely every letter: the alphabet, all
ten ligatures (`QU` is a QU, not a Q and a U), both marks, the interrobang, the
four medieval sorts, the fleuron, the rule and the batter — **46 places**. A medieval sort
is collected as *itself*, because þ stands for TH but is a letter in its own
right; the interrobang is the one exception, physically cut from a `?` and a `!`
and so filling all three places at once.

**The case quickens as it fills**: +0.03 a sort, +0.05 past fifteen, +0.08 past
thirty, so a complete case is **+2.4 Mult** — the top of what any single seat
pays, which is where the hardest collection in the game belongs and no further.
(The early rate is under the flat +0.05 this seat used to pay, and that is not a
nerf by stealth: the case counts SORTS now, so a ligature or a mark fills a
place a letter alone used to, and the first dozen come in faster than they ever
did.) That shape is the Beekeeper's read
backwards — the hive slows, the case quickens, and both walk the same band table
(`walkBands` in `js/constants.js`). It is the right way round for a collection,
because a collection's last places are its dearest by construction: the alphabet
turns up on its own, but RAT waits on *the Rat Catcher*, OLOGY on *the
Scientist*, `OO` and `FU` on two registers' parcels, the interrobang on a cut,
and the lone **Q** on the ratchet. A flat rate would pay most for the sorts that
cost you nothing; this pays for the ones you went out and got, and turns a
half-filled case from a sunk cost into a reason to go hunting. Add a sort to the
press and the ceiling rises on its own.

(The seat that used to hold this name — three-letter words grow their tiles — is
**The Child** now. An abecedarian is properly a *primer of the alphabet*, which
is what the case is; a child is what learns from one.)

**The Bribrarian** is the one editor with nothing to satisfy. He does not read
your words: he penalises every one of them, and the whole of the lever is money
laid across the desk **before the page is set**. Nothing paid is an 80% penalty
— every word at ×0.2 — and each Coin buys a fifth of it back, so four Coins
leave his pen perfectly kind. Which makes him the only editor you beat with the
Market rather than the dictionary, and the only one whose price you pay blind,
since the sheet comes up before you have seen a tile.

You may go **into the red** to pay him, and the game does not stop you — it just
says what it costs. Nothing in the Market will sell to a purse that cannot cover
the price, so a debt shuts the shop until it is worked off, and the real cost of
a big bribe is paid a page later. He rides `mood()` rather than `judge()`,
because he is not spiking a word for breaking a rule; he is taking his cut of
everything, and the bar says so rather than claiming the word passed.

**An editor that inverts a patron you own never takes the desk.** Most editors
merely idle a seat for a page, a fair cost of the roster being a lottery — but a
few would spike the *exact* words a patron is paid for. Those pairs live in
`BOSS_CONFLICTS` (`js/bosses.js`) and are filtered out as the Deadline is dealt:
keep *the Poet* and the Minimalist stays away, *the Lexicographer* and the
Populist does, *the Child* or *the Apprentice* and the Padder does. The
bar is exact inversion — the patron's trigger and the editor's spike condition
being one test read in opposite directions. Adding a pair is one line, and both
directions come with it.

The two frequency editors read `wordlists/common.txt`, the one themed
list whose *order* is data: `js/themes.js` keeps each word's line number as its
frequency rank. The Populist takes the first 8,000 — effectively the whole list,
so a word passes if the list has heard of it — the Obscurantist bars the first
500, and The Lexicographer — a patron, not an editor — pays ×1.5 for words absent
altogether, so its 8,000 entries are a game number too. Rebuild it with
`tools/build-common-list.mjs`, and never sort it alphabetically.

Four editors **lend** tiles. A lent tile is cast from no collection template:
no paint, trim or nick, never discardable or returned to the bag, gone when the
page ends. The Enthusiast's gift rides *above* your hand size; the Eeeditor's
three E's sit *in* the hand and take three of its places, a cage you build
around, the Editooor runs the same cage in O, and the Incendiary's two charges
(below) take two places and go off when you spend them. The two kinds are
coloured apart on the board: warm brass for the gift, cold ink-blue for the
lender's own. A lent tile that is *destroyed* leaves nothing behind — there is no
template to trash — so `detonatePrinted` treats an ephemeral charge as spent
rather than as a dud.

**The Incendiary** lends differently. Two of your places are charged with **squib
lead** — a common letter each, never a dear one, so a charge you dare not print
is never just a place gone — and **every word must carry one**, or it is spiked.
Printing it sets it off: the charge is destroyed, and each tile standing beside
it in the word goes on its own 1-in-2. Which makes every word the same puzzle,
and it is a *placement* puzzle rather than a spelling one: at either end of the
word the charge stands beside one tile, in the middle beside two, so the question
is never only "what can I spell" but "what am I willing to stand next to it".

Both charges come **double-faced**, cut with a second letter within two Points of
the first, because half the puzzle is where the thing will *fit*. And they are
topped straight back up — `bossReplenish` restores a lent tile the instant one
leaves the hand — so the supply never runs out and the toll is paid on every
word of the page. Two, not three: three leaves nothing of the hand to protect,
and the protecting is the fun. `POWDER_CHARGES` and `POWDER_DEAR` in
`js/bosses.js` are the whole of the tuning.

He asks for **his** charges specifically, not for anything explosive: *the
Powdermonkey*'s mark is free and re-marked every hand, so counting it would let
one seated patron answer the editor for nothing and the puzzle would go away.
The two read apart on the desk — hazard stripes against the primed mark.

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
none of them corrects it: what you set is what prints. *Titivillus* takes one
wrong or transposed vowel (WIERD for WEIRD) if the word holds an azure letter;
*the Skimmer* takes the middle letters in any order, provided first and last are
right. *The Bloodless Bohemian Bookbinder* has two licences and they are one
voice: he cannot say W, so a **V may be read as a W** (VORD stands as WORD, never
the other way about), and any **run of O's may be read as any shorter run**, so a
word may be howled to whatever length you like — BOB set as BOOOOOB, DOOM as
DOOOOOOM. Since the word prints as you set it, every howled O counts for the
measure, which turns a pile of cheap O tiles into a length engine and is the
whole of why he is worth seven Coins. Your book fills with misprints, which is
the point of them.

He is also the one patron the Market will not offer you on request: he is
**locked** until a ghost has turned up in the run — one dealt dead at the
counter, one the Ripper made, one a merger left with nowhere to sit. A ghost
calls a ghost. The condition lives on the behaviour as `locked()` and is read
live, so the seat starts being dealt at the next spread; the Testing Chamber
ignores the lock and prints the card's `unlockNote` beside it.

**Compounds** — *the Binder* licenses a construction English makes freely: any
two nouns set end to end count as a word, so DOOM and HAT make DOOMHAT (its
nouns are `wordlists/nouns.txt`). What it coins is a noun like any other,
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
4 patrons, 4 tiles (5 with the Medievalist's stall), 3 **sundries** and 2
**stalls** from a roster of six. (The sundry slots went from two to three when
the shop's own stock reached eight kinds — four tubes, the reshuffle, the
ratchet, the toolbox and the bodkin — because two slots showed only a quarter of
the range a visit, which is too thin to build towards. The workbench still holds
`SUNDRY_SLOTS`, so a third offer widens the choice without widening the pocket.) *New offers* re-rolls everything, and its own
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
**ratchet** asks for the letter FIRST and the direction second: tap the tool,
tap a letter in your hand, and the slot offers that letter's two neighbours **by
name** — tap one and it is stepped, for good. It walks the press's own alphabet
rather than A-Z, which now includes Q: no bag holds a lone Q and no shop sells
one, so stepping a P forward or an R back is how a Q gets made at all — and
ligatures and marks can't be stepped. (It used to want the direction set blind
beforehand, which meant its two arrows sat on the bench at rest, reading as two
tools sharing one slot; and it asked you to carry the press's alphabet in your
head, Q-shaped hole and all.) The **tongs** are the one other tool that wants a
confirming tap on itself, because they destroy the tile.
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
quietly pays *the Twins* (though it is one tile, so there is nothing for them to
recast — see below).

The **toolbox** opens into two *different* tools — the first in the box's own
slot, the second only if the bench has room, else it rolls away. No shop sells
four of the five, one per guild's temperament; the box is the only door to three
of them, *the Ragman* pays the fourth for a crimson rag, and the odd ratchet
rattles around in there at half the rate:

- **Loupe** (jade) — a tile's value doubles, to a maximum of 30, written in for
  good. It doubles the whole corner number, so raising a common letter first (a
  silver trim, the Grafter's growth) and *then* doubling beats doubling the
  jewel already near the cap.
- **Bodkin** — the compositor's needle, for picking one sort out of the case.
  Tap it and the bag lays itself out; take any tile in it straight to hand. The
  dearest sundry at 5 Coins, and deliberately: every other one improves a tile
  you happened to draw, where this decides *which* tile you draw. It answers a
  Columnist's measure, finishes the Prince's cypher, feeds the Wordler his own
  word — and walks straight past *the Magpie* and *the Shortfin Mako*, the two
  seats that weight the draw. It may put you over your hand size; nothing is
  drawn to replace it until you are back under. Sold at the Market, not in the
  toolbox.
- **Laurel** (amber) — crowns a random seated patron: +3 Points on every word
  while they keep their seat, stacking if it lands twice. The crown pays at its
  own seat's turn, so a laurel in front of your multipliers is multiplied and
  one behind is not — and a dismissed patron takes their laurels with them. The
  tool is not the only source: *the Laureate* crowns himself for a word holding
  a gold-trimmed and a silver-trimmed tile at once, *the Frontispiece* each time
  his opening word clears a page single-handed, *the Cellarer* for every page he
  ages through.

  **While *the Laureate* is at the table every laurel is worth more**: each one
  also pays its wearer +0.1 Mult, at that wearer's own turn, beside the Points
  it already pays. His own crowns count like anybody else's, and a murdered
  Laureate keeps the trade — a ghost is still at the table. So the seat is worth
  nothing on a bare shelf and a great deal on a decorated one, and it makes the
  order of a crowned shelf matter twice over.
- **Tongs** (crimson) — grip a tile and it goes to the furnace for good; the
  next word printed gains +8 Points. Grips stack; the heat expires with the page.
- **Ink wash** (azure) — up to four unpainted tiles take a faint wash, one of
  each colour. A washed tile counts as its colour to patrons *and* to the
  multiplier, and keeps the promise until it prints. Real paint replaces a wash.

A **quire** — a gathering of sheets, and here a gathering of sorts — is added to
the Market's tile row at `QUIRE_OFFER_CHANCE`, the same door the fleuron uses. It
sits as a band across the foot of the row rather than in a slot, so the grid of
four keeps its shape whether a quire turns up or not: the pack is a **bonus lot**,
never a tile you lost the chance to buy. Three
sorts sold as one lot at a flat 8 Coins: **one well dressed** (three of the four
features the fair deals in — paint, trim, nick, a second face), **one with a
single feature**, and **one bare**. Never a metal: `addRandomFeature` does not
deal in them, so rare materials stay the alley's alone.

Bought separately the three run to about 14 Coins, so the price is a real
discount — and what you pay for it with is *choice*, since you pick neither the
letters nor which features land. And with the **ballast**: every other road in
the game takes tiles *out* of a press (the smelter, the tongs, the Serpent's
meal, a squib), so a run trends slimmer and cleaner the longer it goes. The quire
is the one road that puts junk back in, which is what makes the smelter's fee and
the Composter's heap matter again. The dilution is milder than it sounds — two
dressed tiles ride in with the one dud, so a pack buyer ends a run with *more*
dressed tiles per hand than someone buying singles, at the same value per Coin.

The **fleuron** ❧'s mirror, ☙, is a tile rather than a sundry: a printer's
ornament in gold that sets no word at all. It can only be printed alone, for its
single Point, and pays 1 Coin every time a page completes, wherever it is.

The **batter** ▨ is its opposite number and the alley's booby prize: type broken
past printing. Worth **no Points**, spelling nothing, and — like the fleuron —
settable only alone, so printing one spends a whole word of the page to put a
ruin on the paper. What redeems it is that it is still a *sort*, and the
Abecedarian's case has a place for it: set it once, ever, and the place is
filled for good. So the right move with a batter is to print it the moment a
cheap page can spare the word, and never think about it again. It comes out of
the Shell Game and nowhere else. Both sorts go through one gate (`SOLO_SORTS`
in `js/constants.js`), so a third would need no new law.

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
classics. A guild member's card wears its livery, and so does its seat — a
ribbon over the card's top edge on the bench, a small enamel pin in retro;
neutral patrons stay plain ivory. *The Alderman* reads the liveries:
**+0.5 Mult per guild** represented on your shelf, counted once each and
whether or not it fires. He ADDS rather than multiplies — a full table of
liveries is +2 Mult, not ×5. He used to compound, and a shelf flying four
flags turned one seat into the whole run; the seat is paid for breadth, and
breadth should be worth a great deal without being worth everything. Some patrons act after a word prints (burning, growing, painting) or
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

Rarity decides how thick the Market's pool is with a card — `RARITY_WEIGHT` at
the foot of `js/patrons.js`, `{ ubiquitous: 9, common: 3, uncommon: 2, rare: 1 }`.
**Ubiquitous** is not a lesser tier but a more frequent one, and it belongs to
the two patrons that are *rolled* rather than written — the Monogrammist and
the Generic. What makes those worth meeting is the roll, and one card a run
teaches you nothing about a table of them, so they turn up three times as often
as a common patron.

### The Generic — a patron rolled from a table

One trigger about the **word**, one about the **tiles or the page**, ANDed, and
an effect worth exactly what the two conditions are worth together. *Alice the
Generic: a word that ends in R, with a gold-trimmed tile in it — ×2 Mult.* The
price is flat, so the pairing does all the work: a cheap condition married to a
cheap effect is a poor buy and an awkward one married to a rich effect is a
windfall, and reading which is which at the counter is the whole decision.

Everything it can be lives in one file meant to be edited between playtests —
**`js/patron-generic.js`**: `GENERIC_TRIGGERS_A` (the word, weights 1–4),
`GENERIC_TRIGGERS_B` (the tiles and the page, weights 2–4), `GENERIC_EFFECTS`
(each with the `cost` it must be paired against, 3–8), `GENERIC_EPITHETS` and
`GENERIC_FACES` (what it goes by — the name itself comes off
`wordlists/names.txt`), and `GENERIC_PRICE`. Move a weight and it re-pairs with
a different band of effects at once; the file checks itself at load and refuses
to start if a pairing exists that no effect can pay.

Anything that leaves something **permanent** behind — a nick, a laurel, growth,
a gift on the bench — carries `oncePerPage`, because those compound over a run
where Points and Mult decay against a climbing quota. Points, Coins, Mult and
the echo are uncapped on purpose: they are paid for the word and gone with it.

A seat that has *accumulated* something says so in its **tally** — the strip
under the desc in the tap-through, fed by `tally(data)` on the behaviour and by
the laurels every patron may wear. That is not the same as `instDesc`, which is
for what a seat **is** rather than what it has **done**: the Monogrammist's
rolled letters, the Generic's rolled clause, the Prince crowned, the Usurer's
book. Put a running count in `instDesc` and the card stops explaining its own
rule the moment the seat is used — which is exactly when a player asks it to.

A `desc` may contain `{KNOB}` placeholders, filled as the module loads —
`{ESPALIER_STEP}` for the value itself, `{1/NUDIST_TRIM_CHANCE}` for "a 1-in-4
chance" — so retuning a number retunes the card text with it. New knobs are
exposed by adding a line to the `KNOBS` object at the foot of `js/constants.js`,
which the rest of the game's writing shares.

## Where the writing lives

Every word a player reads sits in a copy file, separate from the code that acts
on it. **`js/text.js`** is the door: it holds the things you own and the sheets
you use, and its header is a map of the rest.

| Writing | Where |
| --- | --- |
| Trims, nicks, colours, metals, tools, parcels, stalls, the Colophon's picks, and the headings and buttons of the Market, the Black Market and the Colophon | `js/text.js` |
| **Every line the status log speaks** — plus the banners, the board's refusals, and the end screens | `js/text.js` → `LOG_TEXT`, one keyed table with `{0}` slots for the moving parts; the code only decides *when* a line is said |
| Every patron — name, portrait, price, rarity, guild, card text | `js/patron-cards.js` (behaviour: `js/patrons.js`; the one-line notes a patron's own hooks report — "3 Coins collected" — stay beside the hook that computes them) |
| The Generic's trigger and effect clauses, its epithets and its faces | `js/patron-generic.js` — the sentence on its card is built from them, so the writing and the tuning are the same edit |
| Every editor — name, portrait, the house rule in their own voice, **the live bar line (`demand`/`demandFirst`) and the spike reason (`spike`)** | `js/boss-cards.js` (behaviour: `js/bosses.js`) — the bar re-reads these on every render, so an edit shows the moment the page reloads |
| The unsolicited opinions patrons pop after a good word | `js/quips.js` |
| Chapter titles | `js/chapters.js` |
| The themed word lists | `wordlists/` — beside the dictionary and the barred-words list |

`js/text.js` imports nothing, so there is never a question of what may safely be
said in it. Copy may quote a tuning number rather than repeating it, with the
same `{KNOB}` syntax the patron cards use; a knob that does not exist throws at
load naming the line that wants it, rather than shipping a card reading
`{TONGS_BONS}`. Both card files and `js/text.js` fill from the one `KNOBS` table
at the foot of `js/constants.js`, so a knob means the same thing everywhere.

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

A ninth card is not an upgrade at all: **The Black Market** opens a door in the
alley behind the fair, once, before the ordinary Market. It is the only pick with
no repeat cap — the alley is open however many times you have been down it — and
the only one with an entry requirement: it is not dealt at all under 10 Coins,
since a door you cannot afford to walk through is a wasted card rather than a
choice.

**The Black Market** — sixteen tiles on one long table, one to two of them cast
in each of the rare metals (rainbow, ghost, rose and hellbox iron) and *chosen*
rather than gambled for out of a wrapper, plus punctuation, which comes no other
way. Four patrons in the back room, every one of them rare — the Market's own
list is weighted three-to-one towards commons, so this is the only place a rare
build can be assembled on purpose. Four sundries under the counter, drawn from
the four guild tools, the two applicators, the love potion and the four
registers' parcels: things a patron may give you and no stall will sell.

Nothing there is a bargain. Tiles carry a surcharge, patrons a markup that rides
on the seat itself — so dismissing one refunds half of what you actually paid,
not half a list price you never saw — and there is no re-roll. The alley shows
you what it has, once. `js/blackmarket.js`, and the constants beginning `BLACK_`
in `js/constants.js`.

The alley also keeps **two stalls, always open**.

**The Tile Hacker** deals six of *your own* sorts, and for a price the number in
the corner is struck **double** — permanent growth, written to the collection,
capped hard at 50 (the ceiling every tile in the game answers to; the
interrobang sits exactly on it). The price starts at 2 Coins and doubles with
every strike this visit, so the road from 1 to 50 costs 62 Coins walked end to
end. A fresh six is dealt after every strike, so the bench is a new decision
each time rather than the same spread growing dearer.

**The Shell Game** deals three shells off a table of four prizes — 5 Coins, a
sundry from the whole game, a sort (contraband as often as `SHELL_RARE_ODDS`,
ballast the rest of the time), and a **batter**. Each shell is resolved **whole**
when the crate is laid out and shows you the *actual* prize under it: the tool by
name, the sort drawn in its own metal. Which of the three you get is the only
thing decided when you pay, and it is not yours to decide — so the question is
never "which do I want" but "is this spread worth two Coins", which is a real one
when a ruin is under one of them.
Every dealt shell is equally likely to be the one you get, so the odds of any
outcome are its share of the deal ÷ 3. A sundry with nowhere to go pays out in
Coins instead, so a full workbench can never eat a prize outright. Both stalls
double their price with use, and the Fence's cut applies to both.

Unless you have hired **The Fence** (rare, amber), who is the alley what *The
Chapman* is to the fair, and built the same way — a guarantee and a price, both
read live off `owns` rather than baked into the offers. The Black Market becomes
one of the Colophon's picks **every chapter** rather than a card you hope for,
and everything down there — tiles, sundries and the rare patrons alike — asks
`FENCE_DISCOUNT` less, rounded up and floored at a Coin. The entry requirement
comes down with the prices, since a door is only unaffordable at the prices
behind it. Because it is live, hiring him off the alley's own counter re-prices
the rest of the visit in front of you, and dismissing him puts it back up. Every
price in the alley goes through one function, `alleyAsks` in `js/blackmarket.js`
— the three buys and both halves of the sheet — so the figure on the button is
always the figure you are charged. He scores nothing at all, which is the
company he keeps: a seat you buy for what it does to the *shape* of a run.

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
| Nick prices & the resting rule | `js/constants.js` → `NICKS`; the reading itself is pass 2 in `js/scoring.js` |
| The length multiplier — threshold, base, step, and the milestone copy | `js/constants.js` → `LENGTH_MULT_MIN`, `LENGTH_MULT_BASE`, `LENGTH_MULT_STEP`, `LENGTH_FLOURISHES` |
| Tube price / tiles per tube / workbench slots / sell-back | `js/constants.js` → `TUBE_PRICE`, `TUBE_TILES`, `SUNDRY_SLOTS`, `SUNDRY_SELL` |
| Reshuffle sundry price | `js/constants.js` → `RESHUFFLE_PRICE` |
| Bodkin price | `js/constants.js` → `BODKIN_PRICE`. What it reaches into is `pluckFromBag` in `js/state.js`, and the sheet it opens is `openBagPicker` in `js/render.js` — the bag inspector's own grid, made choosable |
| How many sundries a shop lays out | `js/constants.js` → `SUNDRY_OFFERS` (the pool is `SUNDRY_PRICES` plus one tube per colour, in `js/market.js`) |
| Ratchet sundry price | `js/constants.js` → `RATCHET_PRICE` (the alphabet it walks is derived from `TILE_POINTS` — see `SHIFT_RING` in `js/state.js`) |
| Toolbox price and what is inside it | `js/constants.js` → `TOOLBOX_PRICE`, `TOOLBOX_POOL` (repeat an entry to make it likelier; the box always yields two *different* tools) |
| Tool tuning — doubling cap, laurel step, tongs bonus, wash count | `js/constants.js` → `LOUPE_CAP`, `HONORIFIC_STEP`, `TONGS_BONUS`, `WASH_COUNT` |
| What a laurel is worth in Mult while The Laureate is seated | `js/constants.js` → `LAUREATE_MULT_STEP`. Paid in `js/scoring.js` pass 4 beside the laurel's Points; the badge copy is `laurelWorth` in `js/patrons.js`, which the shelf, the graveyard and the Market's shelf strip all read |
| Where the patrons' turns happen, and what a ×Mult reaches | `js/scoring.js` → pass 4. Points that must be multiplied by the table have to land before it (the tongs' heat and the curse's toll do, in pass 3½) |
| Patrons that improve the tiles rather than the word | `js/patrons.js` → the `tileBonus` hook (pass 1½ in `js/scoring.js`); the number goes onto the tile, so nicks read it and Monogrammists carry it |
| Patrons that PAINT a tile rather than pay it | `js/patrons.js` → the `tilePaint` hook (pass ½ in `js/scoring.js`, before anything is counted). The colour lands on a copy of the word, so the multipliers count it and the groove shows it under a dashed edge while you compose; the seat's own `onPrinted` makes it permanent when the word prints |
| The quire — price, how often it is offered, and how dressed its sorts are | `js/constants.js` → `QUIRE_PRICE`, `QUIRE_OFFER_CHANCE`, `QUIRE_DRESSED`, `QUIRE_MIDDLING` (the roll is `rollQuire` in `js/market.js`) |
| The fleuron — price, page rent, how often it is offered | `js/constants.js` → `FLEURON_PRICE`, `FLEURON_PAGE_COIN`, `FLEURON_OFFER_CHANCE` (the glyph itself is `FLEURON`) |
| Stall roster, base prices, spread size | `js/constants.js` → `STALL_DEFS`, `STALLS_PER_SHOP`, `PROPOSAL_RANGE`, `SMELT_MIN_COLLECTION` |
| Marks: which ones exist, legal tails, and what they arrive wearing | `js/constants.js` → `MARKS`, `MARK_RUNS`, `MARK_TRIM` (and `TILE_POINTS`). How often one turns up is `WRAPPED_CONTENTS`, since a wrapper is the only source |
| What a proposal stall works on & offers | `js/market.js` → `PROPOSAL_STALLS` (one `eligible`/`propose` pair per stall — a new one is a few lines) |
| Letters per draft paint pot | `js/constants.js` → `PAINT_PER_POT` |
| Opening draft spread & pick counts | `js/constants.js` → `DRAFT` |
| How loaded offered tiles are | `js/constants.js` → `FEATURE_CHAIN_CHANCE`, `MAX_FEATURES` (one feature free, then keep rolling); generation in `js/market.js` → `randomSpecialTile` |
| Rewards & interest | `js/constants.js` → `REWARD` |
| Squib lead — the ×Mult and the blast radius's odds | `js/constants.js` → `EXPLOSIVE_MULT`, `EXPLOSIVE_SPREAD_ODDS`; the ×Mult pays in scoring's pass 3, the charge goes off in `detonatePrinted` (`js/main.js`) |
| The Tile Hacker — base price, cap, spread size | `js/constants.js` → `HACKER_BASE_PRICE`, `HACKER_CAP`, `HACKER_OFFERS` |
| The Shell Game — what is under the shells and how often | `js/constants.js` → `SHELL_PRIZES` (a `weight` per kind — how often it is among the three dealt), `SHELL_BASE_PRICE`, `SHELL_SHOWN`, `SHELL_COINS`, `SHELL_RARE_ODDS` |
| The Fence's cut, and the alley's entry requirement | `js/constants.js` → `FENCE_DISCOUNT`, `BLACK_MARKET_MINIMUM` (the minimum is discounted by the same fraction; both go through `alleyAsks` in `js/blackmarket.js`) |
| Colophon roster, offer count, repeat cap, skip grant | `js/constants.js` → `UPGRADE_OFFERS`, `MAX_UPGRADE_REPEATS`, `SKIP_COIN_GRANT`; definitions in `js/upgrades.js` |
| Everything the Generic can roll — triggers, weights, effects, epithets, faces, price | `js/patron-generic.js`, the whole file. `GENERIC_TRIGGERS_A/B` carry the weights, `GENERIC_EFFECTS` the `cost` each must be paired against |
| The Lye Boy's ramp — what a scrubbed coat is worth, and where it should slow | `js/constants.js` → `LYE_BOY_BANDS` (one band today; add a row to slow it, and `lyeBoySteps()` rewrites the card with it) |
| The Quoin's lock | `js/constants.js` → `QUOIN_MULT`. Set against the colour engine: ×3 makes stacking a colour pull level with spreading it |
| The Goldsmith's purse — the Points, the odds and the prize | `js/constants.js` → `GOLDSMITH_POINTS`, `GOLDSMITH_ODDS` (rolled **per amber tile**, so the seat scales with commitment), `GOLDSMITH_PURSE`. The run-level arithmetic is in the comment beside them; if a run stops caring about Coins by chapter seven, the odds are the knob, not the purse |
| The Serpent — what an S is worth, and how often he swallows the last one | `js/constants.js` → `SERPENT_POINTS` (paid on every S in the word, written onto the tile so a nick reads it and his own ×2 doubles it), `SERPENT_EAT_ODDS`. The ×2 is paid either way, so this is the whole of the bet; the card quotes it through the `SERPENT_EAT_CHANCE` knob and can never drift from it |
| What unlocks a locked patron | the `locked()` predicate on its behaviour in `js/patrons.js` (read live off `state`, checked by every pool that deals a card), with the sentence explaining it on the card as `unlockNote` |
| How often the Market offers each tier | `js/patrons.js` → `RARITY_WEIGHT` (`ubiquitous` is 3× `common`) |
| Patron reaction odds | `js/constants.js` → `REACTION` (`floor`/`ceil` as fractions of the page's whole quota: silence below `floor`, a certainty at `ceil`); the lines themselves in `js/quips.js` — a flat array, add more any time |
| How far a patron's asking price can drift | `js/constants.js` → `PATRON_HAGGLE` (`spread` Coins each way, `chance` per side) |
| How long a line stays up to be read | `js/anim.js` → `READ_BASE` / `READ_PER_CHAR` / `READ_MAX`. Every bubble, floater and bar message holds for a span measured off its own length, so a long line is given longer, not read faster |
| Words / discards / seats per page | `js/constants.js` |
| Where every word list lives | `wordlists/` — the dictionary (`wordlist.txt`), all ten themed lists, the dummy-letter list (`silent.txt`) and `excluded-slurs.txt`, in one folder. The paths are `THEME_FILES` and `SILENT_FILE` in `js/themes.js`, which is also where `tools/build-single.mjs` reads the folder name from, so moving them is a change to that one file (plus `js/dict.js` and `js/excluded.js`, which fetch their own) |
| The Silent Knight's dummy letters | `wordlists/silent.txt` — one `word index` pair per line, the index naming the letter that is written and not spoken (`knot 0`). Read into a Map by `adoptSilent` in `js/themes.js` |
| The Ripper's watchwords | `js/constants.js` → `RIPPER_WORDS`. Matching is exact and the Ripper's card quotes the whole list, so a long one is a long card |
| Patron names, emoji, rarities, costs, guilds and card text | `js/patron-cards.js` — one flat table keyed by patron id; `{KNOB}` braces in a `desc` are filled from the `KNOBS` object at the top of the file |
| What a patron *does* | `js/patrons.js`, against the same id |
| Patron tuning that reaches beyond a score (growth steps, burn odds, trim chance, dye count, coined-word length) | `js/constants.js` → `GRAFTER_STEP`, `STOKER_BASE`, `STOKER_STEP`, `ARSONIST_ODDS`, `NUDIST_TRIM_CHANCE`, `DIPPER_PAINT_CHANCE`, `GAMBLER_ODDS`, `DYE_TILES_PER_CHAPTER`, `NEOLOGIST_LENGTH` |
| Fifteen-fingered Frank's growth | `js/constants.js` → `DEVIL_STEP` (places per word printed; it rides `state.rackBonus`, so the page turn takes it back for free). His name quotes `RACK_SIZE + WORDS_PER_PAGE × DEVIL_STEP` at authoring time — retune any of the three and re-check the sum by hand |
| The Beekeeper's curve | `js/constants.js` → `BEEKEEPER_BANDS` — `{ upTo, step }` in order, so the hive slows as it fills (+0.2 to ×2, +0.1 to ×3, +0.05 thereafter) instead of climbing for ever at one rate. `beekeeperMult()` walks it a bee at a time, so crossing a threshold never jumps; `beekeeperSteps()` writes the card's own sentence from the same table, so the words cannot drift from the arithmetic |
| The Alderman's guild step | `js/constants.js` → `ALDERMAN_STEP` (added per guild, not multiplied — see pass 4½ in `js/scoring.js`) |
| The Sesquipedalian's rate | `js/constants.js` → `SESQUIPEDALIAN_STEP`, per letter of the run's longest word. The record is read off `state.manuscript` by `longestPrinted` in `js/patrons.js` (the word in the groove counts), and `sesquipedalianMult` rounds the sum so the badge never shows a floating-point tail |
| What the alley may ask for a tile | `js/constants.js` → `BLACK_TILE_MAX_PRICE`, the ceiling every black-market tile is clamped to, plus `BLACK_MATERIAL_STOCK` and `BLACK_TILE_SURCHARGE`. The Market's own tiles are priced by `tilePrice` in `js/market.js`, off `TILE_BASE_PRICE` and the `price` on each entry of `TRIMS` / `NICKS` |
| What a seat has ACCUMULATED, shown when you tap its card | `js/patrons.js` → the `tally(data)` hook, gathered with the seat's laurels by `seatTally()`. A number a seat keeps privately in `data` is a number the player is being asked to remember — put it here instead |
| The editor roster, the conflict pairs, the Redactor's share | `js/bosses.js` → `BOSS_CONFLICTS`, `REDACTOR_SHARE` |
| The Incendiary's charges — how many, and how dear a letter he will lend | `js/bosses.js` → `POWDER_CHARGES`, `POWDER_DEAR` (a letter worth this or more is kept out, so the pool is common letters only; each charge is given a second face by `dualPairsFor` in `js/constants.js`) |
| The Gardener's relief — the first slice, how fast it slows, and the ceiling | `js/constants.js` → `GARDENER_RATE`, `GARDENER_CAP` (the curve is `gardenerRelief`; the quota reads `state.quotaRelief` in `startPage`, `js/state.js`) |
| The Spendthrift's step | `js/constants.js` → `SPENDTHRIFT_STEP` (Coins spent per sort grown; the growth is the chapter number, and the running total is `state.coinsSpent`, kept by `spendCoins`) |
| The Beadle's threshold and page Coin | `js/constants.js` → `BEADLE_THRESHOLD`, `BEADLE_PAGE_COIN`; which stall each guild opens is `BEADLE_STALLS` in `js/patrons.js`, read live by `stallPrice`/`beadleFavour` in `js/market.js` |
| The Generic's quota reprieve | `js/constants.js` → `ALMONER_RELIEF` (the `relief` effect at cost 7 in `js/patron-generic.js`; it cuts the live page's quota, where the Gardener's cuts every quota as it is set) |
| Animation step timings | `js/constants.js` → `ANIM` (all divided by the Settings speed slider) |
| Chapter titles | `js/chapters.js` — a flat array, add as many as you like; each run draws its own and won't repeat until the list runs out |
| The Stenographer's acronyms | `wordlists/acronyms.txt` — one per line, `#` comments; letters only. A lone Q is settable now (the ratchet makes one), but it is rare enough that an acronym leaning on it will mostly go unset |
| Finding words the dictionary is MISSING | `tools/find-dictionary-gaps.mjs` — three modes, none of which writes anything. `derived` (we hold PULMONOLOGY but not PULMONOLOGIST) is the highest-yield; `paradigm` finds a word whose rhyme-neighbours all inflect where it doesn't; `frequency` wants a corpus and is the only one that can find a word with no foothold here at all, but its head is thick with proper nouns. Every mode prints candidates for a human to read, never a list to paste |
| The Expectant Parents' baby names | `wordlists/names.txt` — same format; regenerate from the US and England & Wales charts with `tools/build-names-list.mjs` |
| Words barred from the game entirely | `wordlists/excluded-slurs.txt` — one per line, `#` comments. Enforced at load by `js/excluded.js` against the dictionary, every themed list, and The Neologist's coining sheet, so an entry here can't come back through a word list, a custom dictionary or a coined word. Whole-word matches only |
| The four registers' word lists (the Sexton, the Paramour, the Poppet, the Vulgarian) | `wordlists/theme-*.txt` — one word per line, edit freely; loading in `js/themes.js` |
| The three parts of speech (the Sculptor, the Poet, the Athlete) | `wordlists/nouns.txt`, `adjectives.txt`, `verbs.txt` — same format. The nouns list holds singulars only: plurals are read back to their singular in `readsAsNoun` (`js/patrons.js`), which is also where the irregular ones (MICE, TEETH, CHILDREN) are named. It is The Binder's list too, so an entry added there can be stacked into a compound as well as paid for |
| The Frontispiece's opening multiplier & growth | `js/constants.js` → `FRONTISPIECE` |
| The star-crossed lovers — who marries whom, and for how much | `js/constants.js` → `LOVERS` (`pair`, `merged`, `apart`, `united`); the wedding itself is `marryLovers` in `js/state.js` |

## Architecture

| File | Role |
| --- | --- |
| `js/state.js` | game state, save/load (`folio_save_v1`, schema v12), settings, tile ops, painting, sundries, effective hand/seat/workbench sizes, the manuscript |
| `js/scoring.js` | pure score computation — returns a step-by-step *script* the UI replays |
| `js/patron-cards.js` | the patron roster as data: name, emoji, rarity, cost, guild and card text, keyed by id |
| `js/patrons.js` | what each patron does, against the same ids — and the merge that marries the two |
| `js/patron-generic.js` | the Generic's whole roster: the triggers it can ask for, the effects it can pay, the weights that marry the two, and the names it goes by. Pure data plus the roller — the tuning table |
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
| `js/appearance.js` | the look (the Bench or Retro), the room (theme), the table's layout, and the UI scale — `LOOKS`, `THEMES`, `LAYOUTS`, auto-fit, and `uiZoom()`, the factor every rect-to-style write divides by |
| `css/bench.css`, `css/bench-sheets.css` | the Bench look — the board, and the sheets — every rule scoped to `html[data-look="bench"]` over `css/style.css`, which is Retro whole |
| `js/main.js` | orchestration: submit cinematic, page/chapter flow, input, settings |
| `js/drag.js` | pointer input: tap / drag / long-press for rack, word and the patron shelf (where a drag reseats a patron, changing the order effects fire in), mouse and touch alike |
| `js/dict.js` | dictionary loading/caching (also reads a `window.FOLIO_WORDLIST` global, for single-file bundles) |
| `js/themes.js` | the themed lists in `wordlists/` — registers, parts of speech, acronyms and names — as Sets, and the one table of paths every list is found through (also reads a `window.FOLIO_THEMES` global, for single-file bundles) |
| `js/excluded.js` | the barred-words list, loaded before any word list and applied by `dict.js` and `themes.js` as they build their Sets |

Scoring is deliberately pure (`computeScore` never mutates state), so the same
function powers the live preview, the tooltips and the replayed cinematic — they
can't disagree.

**Single doors.** Three things happen in exactly one place, on purpose, and every
route to them goes through it: destruction through `trashFromCollection` (which
is where *the Revenant*'s rite and the Composter's heap are performed, so neither
needs a hook), paint through `paintTile` (where *the Dabbler* is heard), and Coins
leaving the purse through `spendCoins` (which keeps `state.coinsSpent` for *the
Spendthrift*). A new shop that debits `state.coins` directly would be invisible to
the seat that watches it — the reason to route it through the door is that the
door is where the game listens.

**Checked as the module loads.** A patron or an editor whose card and behaviour
don't marry throws by name, in both directions; so does a `{KNOB}` in a card with
nothing to fill it, an effect the Generic can roll and cannot pay, and **two
patrons wearing the same emoji**. A portrait is how a seat is recognised at a
glance — on the shelf, on the card, in the ticker — and the jade guild alone has
four growing things in it, so a clash is a real bug and the only other way to
find it is to notice it in a screenshot.

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

**Appearance** — Settings holds the room, the layout and the UI size, all
persisted in `folio_settings_v1` and applied before first paint by an inline
script in `index.html`. The **UI scale** is a plain CSS zoom on `<body>`
driven by `--ui` — auto-fit sizes the board to the window (high-res monitors
finally get a board that fills them), a fixed factor is there for taste. Two
consequences run through the code: rects and pointer events arrive in
*visual* coordinates while a px written into the page is re-multiplied on
the way out, so everything that positions FX from `getBoundingClientRect`
divides by `uiZoom()` (`js/appearance.js`); and viewport units are *not*
divided by the zoom, so lengths meant as a share of the real window are
written in the compensated units `--vwu`/`--vhu`/`--vmu` (`css/style.css`).

**Themes** repaint the ROOM — page, watermark, wood, leather, groove,
readout, the Market's tint — through the tokens at the top of `css/style.css`,
one `html[data-theme=…]` block per room at the foot of the file: *Candlelit*
(the original), *Foolscap* (daylight), *Hellbox* (embers), *Moonstone* (the
night shift), *The Baize* (green felt). The objects standing in the room —
parchment cards, ivory tiles, paints, trims, liveries — keep their colours in
every theme, because their colours mean things; surfaces that stay dark
everywhere (the readout, the editor's bar, the candlelit sheets) re-pin the
dark room's ink so no theme can strand their text; and `body.deadline-on`
pins every room dark, so the third page always feels like the third page.
A new theme is one block of token overrides plus a `THEMES` entry in
`js/appearance.js`.

**Layouts** — the board's sections sit in two wrappers, `.rail` (chapter,
quota, pips, the editor's bar, the log) and `.board` (shelf, readout,
groove, rack, actions). In the classic **Folio** column the wrappers
dissolve (`display: contents`) and explicit `order` keeps the original
interleaving; the **Workshop** layout makes them real columns on wide
screens — ledger left, press right — and collapses back to Folio below
1200px.

A *Developer* section in Settings has shortcuts: +20 Coins, open the Market,
clear the current page. The console exposes `window.folio = { state, settings }`.
