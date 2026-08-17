# The Colour Guilds — patron overhaul

The approved redesign of Folio's patron roster. **All four phases have
shipped**; this document remains as the design record — per-patron rationale,
conventions, and the playtest watchpoints. Design intent in one line: paint is
the heart of scoring, so each colour gets a guild of patrons that makes
committing to it an archetype — amber pays coins, jade compounds forever,
crimson burns for power, azure bends the rules of spelling.

## House style for effect text

Player-facing `desc` is **simple, direct and concrete** — one sentence, real
numbers, no metaphor. State the rule, not the feeling: "Crimson letters are
destroyed when printed" rather than "burn to ash"; "Words with an azure letter
are accepted with one vowel wrong" rather than "one vowel may go wrong". A
concrete example earns its place when the rule is easier shown than said
(BALLOON pays twice; TEH counts as THE). Keep it under ~110 characters. The
flavour lives in the patron's name, emoji and quips — never in the rule.

Deviations from the plan as written, decided during implementation:

- **Titivillus also forgives a vowel transposition** (WIERD, RECIEVE, THIER) —
  substitution alone missed the archetypal i-before-e slip, which is the error
  Titivillus exists to collect. Desc updated to match.
- The Assayer's coins ride the score script via a new `addCoins` ctx helper;
  patron coin steps get their own amber badge chip (`+2c`) and coin floater.
- The Fountain and mercury share one rule, `returnsToBag` (state.js), read by
  both `retirePrinted` and scoring's `returns` flag so preview and print agree.
- `paintTile` / `trimTile` joined `growTile` as write-through helpers; the
  paint tubes now go through `paintTile` too.
- Burns get `ANIM.stepBurn`, an `sfx.burn`, and a `.tile--burning` keyframe
  (flare, char, crumble — reduced-motion chars in place). Burned tiles skip
  the retire flight entirely.
- The Neologist coins through a "Coin a word…" action on its popover, opening
  a letterpress-styled sheet on the overlay modal; it retires with no refund.
- **Added after playtest discussion: the misspelling family.** Titivillus was
  joined by **The Stumbler** (common · 3 — one pair of adjacent letters
  swapped, reaching the ends of the word: TEH for THE) and **The Skimmer**
  (rare · 12 — the middle letters in any order while the first and last hold).
  They are colourless wildcards, not azure: Titivillus needs ink to smudge,
  these two are about how a word is *read*. All three are consulted by one
  ladder in `main.js` (`PARDONS` / `pardonWord`), cheapest excuse first, and
  the log credits whoever saved the word. The Skimmer is served by a lazy
  index in `dict.js` keyed on first letter + sorted middle + last letter,
  rebuilt whenever the dictionary changes (including a coined word).

### Materials (a later addition, beyond the patron roster)

Tiles gained a `material` — `null` (lead), `cursed`, `ghost` or `rainbow` —
cast by a 4-Coin **ingot** sundry. Two design decisions worth recording:

- **Rainbow reads as every colour to patrons, but lifts no colour multiplier
  by itself.** One helper, `countsAsColour` in `state.js`, is the only thing
  that knows this: `painted()` in `patrons.js` and the Fountain's
  `returnsToBag` both go through it, so all twelve-odd colour patrons picked
  rainbow up without being touched. The colour-multiplier pass in `scoring.js`
  deliberately keeps using `getActiveColour`, so a bare rainbow tile can't be
  four colours at once where it would multiply out to ×16.
- **A ghost can't be cloned.** The brief left this open; refusing it keeps
  "nothing can be done to a ghost" absolute, closes a cheap repeat-purchase
  loop at the Stereotyper (each clone would be another permanent +1 hand
  size), and has the better fiction — there's no impression to cast from.
  `isImmutable` in `constants.js` is the single guard, checked by
  `paintTile`/`trimTile`/`growTile`, every proposal stall's `eligible`, the
  Painter and the Stereotyper. (The Restorer, also guarded by it, has since
  been cut from the stall roster.)

Watchpoints: cursed tiles compound (×9 for two, ×27 for three) and are
permanent; and the Stoker burns rainbow tiles, which is consistent but is the
one pairing to warn players about.

**Cursed metal gained a toll after playtest.** It remains undiscardable — the
only way out of the hand is to print it — which is the whole character of the
tile and is deliberately kept. What changed is what happens while it waits:
every word set without it loses `CURSED_PENALTY` (666) Points, once per curse.

The point is not the punishment, it is that the punishment is *survivable*.
Words set around a curse are worth nothing rather than impossible, so the rack
keeps turning over and keeps drawing until the curse finds a word to sit in —
which is the way out of the hand that a stuck player previously did not have.
Two details make that true rather than merely intended:

- It is **Points, not Mult**, so it lands before the multipliers. A press
  strong enough to clear 666 shrugs a single curse off and scores anyway;
  two is another matter.
- **A word's total floors at zero** (`computeScore`). Without that floor the
  toll would run `state.pageScore` *backwards*, eating a page already built —
  turning the escape hatch into a deeper trap than the one it opens.

The toll rides the score script as a step with no seat of its own, so pass 4
of the cinematic floats it over the word (`fl-curse`) rather than subtracting
666 in silence.

### Three later patrons, and what they needed from the engine

- **The Rat Catcher** (rare · 10) brought the first `onPageStart` hook, and
  with it `EXCLUSIVE_LETTERS`: RAT is a real ligature (3 Points, counted by
  the Typesetter) that no shop, draft or heap will ever hand you. Its free
  random paint every page makes it the roster's anti-mono-colour engine —
  over a run you drift toward all four colours whether you meant to or not.
- **The Chapman** (uncommon · 7) needed a *guarantee* clause, not just a
  discount. Measured before building: without one, only 17 of 60 Markets
  offered any amber tile at all, so "amber is free" would have been a dead
  card two visits in three. `rollOffers` now paints one offer amber when they
  are seated, and `offerPrice` is read live rather than baked into the offer,
  so hiring or dismissing them re-prices the shelf immediately.
- **The Composter** (uncommon · 7) deliberately does *not* interrupt the print
  cinematic. Destruction is tallied by `trashFromCollection` — now the single
  road out of the collection, with the Smelter routed through it too — and
  the tally is only turned into tiles when the Market opens, which is the one
  place the heap is ever seen. That also sidesteps a circular import, since
  tile generation lives in `market.js` and the tally lives in `state.js`.

### The Monogrammist, and stackable patrons

The first patron you can hold several of. Each copy arrives loving three
letters (uniform over the game's letter set, QU included — variance in copy
quality is the point) and wearing an edition number, both rolled **when the
Market lays the card out**, so the offer shows exactly what you'd be buying.
Its letters' Points count twice, after trims and nicks; copies stack
multiplicatively, so two that love the same letter reach ×4 — the intended
ceiling. Machinery this forced into existence, all reusable:

- Every seat now carries a **uid** (`nextId()`, backfilled onto old saves), and
  `sellPatron`/badges/popovers/cinematic flashes address seats by uid with the
  def-id as fallback — so copies are dismissed, badged and animated as
  themselves.
- Def surface for stackables: `stackable` (the Market keeps offering it),
  `onOffer()` (per-copy roll, carried on the offer and moved to the seat at
  purchase), `instName/instShelf/instDesc(data)` (presentation), and
  `tileEcho(tile, data)` (scoring pass 2½ doubles matching tiles' contribution
  once per copy, each gain its own uid-keyed patron step).

### The Skimmer × the Cartographer

Measured, not guessed: 2,630 of the 64,662 dictionary words (4.07%) can be
played in alphabetical order and still be accepted by The Skimmer, which hands
The Cartographer its ×3 — 1,411 of them are 7 letters or under, so plausibly
assembled from a ten-tile rack. That costs two rare seats and 24 Coins, and
still needs the tiles for one specific word, so it ships as a real combo
rather than a free multiplier. If it proves too reliable in play, the fix is
to have The Cartographer read the *dictionary* spelling rather than the played
one. The measurement lives in the pardons test so a playtest can argue with
the number.

### The four registers

The Sexton ⚰️ (spooky), the Paramour 💘 (romantic), the Poppet 🧸 (cute) and
the Vulgarian 🍑 (rude): each keeps one of the themed lists in
`wordlists-themed/` and pays **×3 Mult** when the printed word is on it. All
four are rares at 9 Coins.

**Why ×3 and not ×2.** The player can't read the list — they steer by
register ("play spooky words") and won't land every time. The lists cover
1.9% (cute) to 7.3% (spooky) of the dictionary, and even a steered player
misses plenty, so the payoff has to feel like a jackpot when intuition
connects. ×2 with those odds is a dead card next to guild multipliers that
fire every word. The lists differ threefold in size, but the small-list
patrons aren't strictly weaker — cute words are short and common (KITTEN,
BUNNY), spooky's breadth is offset by its obscure tail — so all four ship at
the same rarity and cost until play says otherwise.

**Curation, applied on the way in** (low barrier for admission, high barrier
against removal): slurs and hate symbols went, everywhere; sexual register
was struck from *cute* but deliberately kept in *romantic* — STREETWALKER
stays beside HARLOT and COURTESAN where the register is consistent; bare
function words (THE, YOU, THAT) went; the merely-odd stayed. The word lists
are flat files — one word per line, `#` comments — and entries the
dictionary lacks are harmless, they just never come up.

**Machinery.** `js/themes.js` loads every list into a Set (fetched over
http, or from a `window.FOLIO_THEMES` global that `build-single.mjs` embeds,
mirroring the dictionary's own arrangement). The Stenographer's acronyms
moved from `js/acronyms.js` into `wordlists-themed/acronyms.txt` to ride the
same loader, so every "extra words" list now lives in one folder and is
edited the same way. Registers stack: a word on two lists with both patrons
seated pays ×9 (SCUTTLE, it turns out, is both spooky and cute).

## What Phase 0 already delivered (main branch of this feature)

- **Patron seats carry memory**: `state.patrons` entries are `{ id, data }`;
  `patronData(id)` in `state.js`. Save schema bumped to v8 (old saves are
  discarded on load, as the loader has always done on version mismatch).
- **Permanent tile growth**: `bonusPoints` on tile templates, added into
  scoring pass 1 (`grown +n` in the per-tile breakdown), written through to
  the collection by `growTile(tile, n)` (state.js). Grown tiles show their
  corner number in jade (`.tile-pts--grown`), everywhere they appear, and the
  tooltip says `(face + n grown)`.
- **Trashing from play**: `trashFromCollection(tid)` (state.js), honouring
  `SMELT_MIN_COLLECTION` (12) as a hard floor. Callers clean up live copies.
- **The luck dial**: `state.luck` (×1) and `luckyRoll(p)` (state.js). Every
  roll the player *wants* to win goes through `luckyRoll`; bad outcomes (the
  Arsonist's burn) deliberately use raw `Math.random()`.
- **Patron hooks**: optional `onPrinted(ctx)` and `onChapterEnd(ctx)` on
  patron defs, dispatched from `main.js` (`runPrintedHooks` — *before*
  `retirePrinted`, so mutations ride along to the bag; `runChapterHooks` —
  before `startPage()` shuffles the new bag). Contract documented at the top
  of `js/patrons.js`.
- **`state.lastFirstLetter`**: maintained on every print (for The Skald).
- **Coined words**: `coinWord` / `coinedWords` in `dict.js`, persisted in
  `localStorage` (`folio_coined_words_v1`) across runs and merged into every
  dictionary (re)load (for The Neologist).
- **Tuning knobs** in `constants.js`: `GRAFTER_STEP`, `STOKER_STEP`,
  `ARSONIST_ODDS`, `NUDIST_TRIM_CHANCE`, `NEOLOGIST_LENGTH`,
  `DYE_TILES_PER_CHAPTER`. Plain score numbers stay in patron defs.
- **Implemented patrons**: **The Grafter** 🌿 (rare · 10) end-to-end, and
  **Titivillus** 😈 (rare · 9) — the vowel pardon lives in `main.js`
  (`titivillusPardon`), the misspelling prints as typed into the manuscript
  and ledger, and the log line notes what it stood for.

## The roster

### Kept unchanged (17)
Apprentice, Scholar, Herald, Banker, Quartermaster, Typesetter, Jeweller,
Stonemason, Archivist, Calligrapher, Magpie, Minimalist, Astronomer, Closer,
Mirror, Cartographer, Novelist.

### Cut (4) — remove defs and any wiring in Phase 4
- **The Diva** → absorbed by The Siren.
- **The Botanist** → absorbed by The Twins rework.
- **The Economist** → absorbed by The Bursar.
- **The Scavenger** → absorbed by the crimson guild; also remove
  `state.scavengerPoints` wiring in `state.js`, `scoring.js`, `main.js`.

### New / reworked (to build)

Rarity·cost | Patron | Effect | Implementation notes
---|---|---|---
**AMBER — coins** | | |
c·4 | **The Goldsmith** 🪙 | Amber letters gain +5 Points. | Pure `score` def: count tiles with `getActiveColour(t) === 'amber'`.
c·4 | **The Weld** 🌼 | At each chapter's end, 2 random tiles are painted amber. | `onChapterEnd`: `paintRandomFaces('amber', DYE_TILES_PER_CHAPTER)` (exists in state.js); return `{ note }` listing letters.
u·6 | **The Assayer** ⚖️ | Amber letters pay 1 Coin when printed (up to 2 a word). | Score-time: add an `addCoins(v)` helper to the scoring ctx (mirrors `addPoints`, pushes a patron step with `coins`, adds to `script.coins` — commit already applies it). Give the pass-4 loop in main.js a coin floater + `sfx.coin()` for patron steps with `coins`.
r·8 | **The Bursar** 💰 | Words with an amber letter gain +1 Mult per 5 Coins you hold (max +5). | Pure `score` def reading `state.coins`.
**JADE — growth** | | |
c·4 | **The Seedsman** 🌱 | Jade letters gain +1 Point per chapter. | Pure `score` def: `addPoints(jadeCount * state.chapter)`.
c·4 | **The Verdigris** 🍏 | At each chapter's end, 2 random tiles are painted jade. | Same as The Weld.
u·7 | **The Vintner** 🍷 | Words with a jade letter gain +1 Mult per chapter. | Pure `score` def: `addMult(state.chapter)`.
r·10 | **The Grafter** 🌿 | *(done)* | —
**CRIMSON — sacrifice** | | |
c·4 | **The Firebrand** ❤️‍🔥 | Words with 2+ crimson letters gain +25 Points. | Pure `score` def.
c·4 | **The Madder** 🌺 | At each chapter's end, 2 random tiles are painted crimson. | Same as The Weld.
u·7 | **The Arsonist** 🧨 | Every tile played has a 10% chance of being painted crimson — and a 1% chance of burning to ash. | `onPrinted`: per tile, `luckyRoll(ARSONIST_ODDS.paint)` → paint the showing face crimson (write through to the template, like `applySundry` does); independently raw-roll `ARSONIST_ODDS.burn` → `trashFromCollection(tid)`. Burned tiles must not retire normally: return their ids, have `runPrintedHooks`/`submitWord` drop them from the retire list and give them a fire animation (see Stoker). May repaint tiles of other colours — intended.
r·11 | **The Stoker** 🔥 | Crimson letters burn to ash after printing; each one permanently gives this patron +×0.25 Mult. | Two halves. Score-time: extend scoring's pass-4 loop to put the seat's `data` on the ctx; effect does `xMult(1 + data.stacks * STOKER_STEP)` when stacks > 0. `onPrinted`: for each printed crimson-face tile, `trashFromCollection(tid)` (stops silently at the floor); each success `data.stacks += 1`. Burned tiles skip the discard flight — burn/ash animation instead (one CSS keyframe + `sparkleBurst`; `anim.js` has the pieces).
**AZURE — ink** | | |
c·4 | **The Siren** 🎶 | Vowels gain +2 Points; azure vowels gain +6 instead. | Pure `score` def; vowel = active letter in `AEIOU` (ligatures don't count; a dual tile counts by its showing face).
c·4 | **The Woad** 🪻 | At each chapter's end, 2 random tiles are painted azure. | Same as The Weld.
u·7 | **The Marbler** 🌀 | Words with 2+ azure letters get ×2 Mult. | Pure `score` def.
u·7 | **The Fountain** ⛲ | Azure tiles slip back into the bag when printed. | In `retirePrinted` (state.js): route to bag when `owns('fountain') && getActiveColour(t) === 'azure'` (alongside mercury). Also extend the `returns` flag in scoring's `tileSteps` the same way so the "↩ to bag" floater and preview stay truthful.
r·9 | **Titivillus** 😈 | *(done)* | —
r·10 | **The Neologist** 📖 | Coin one six-letter word into the dictionary, for good — then this patron retires. | `coinWord` (dict.js) is ready. Needs a small entry UI: a "Coin a word" action on the patron's popover → modal (copy the settings-modal pattern) with a single input, validate `/^[A-Z]{6}$/` (`NEOLOGIST_LENGTH`) and `!DICT.has`, then `coinWord(w)`, remove the seat (no refund — it *retires*), log something smug. Words persist across runs — that's the point.
**WILDCARDS** | | |
c·4 | **The Twins** 👯 *(rework)* | Words with a doubled letter (LL, OO…) gain +30 Points. | Replace the old any-repeat effect; now common · 4. Fires once.
u·6 | **The Skald** 🎵 | ×2 Mult when your word starts with the same letter as your last word. | Pure `score` def: compare `word[0]` to `state.lastFirstLetter` (maintained in Phase 0; carries across pages by design). Previews live once the first tile is laid.
u·6 | **The Nudist** 🧖 | Print a word of entirely bare tiles: each has a 1-in-4 chance of gaining a random trim. | `onPrinted`: bare = no paint on either face, no trim, no nick, for *every* printed tile. Then per tile `luckyRoll(NUDIST_TRIM_CHANCE)` → random trim from `TRIMS`, written through to the template. Self-limiting: every success shrinks the bare pool.
r·8 | **The Illuminator** 🎨 | Words holding three paint colours get a fourth: one unpainted letter in them is painted the missing colour, for keeps. | `onPrinted`: if distinct showing-face colours == 3 and an unpainted tile exists, paint a random one the missing colour (write-through). Reuse the sundry paint animation.
r·10 | **The Stammerer** 🦜 | ×2 Mult for every doubled pair — BALLOON hits twice. | Pure `score` def: count non-overlapping adjacent pairs (AAA counts once, AAAA twice), `xMult(2 ** pairs)`.

## The legacy rebalance (a later pass)

The overhaul established a contract — a multiplier is bought with a condition:
paint, burns, chapters survived — but the patrons that predated it were never
brought under it. Four of them handed out multipliers for no build investment
at all, and two more were priced as rares for conditions that essentially
never fired. Measured against the 3-7 letter words a rack actually produces:

| Condition | Fires on |
|---|---|
| 5+ letters (Scholar) | 87.4% |
| 7+ letters (Novelist) | 39.0% |
| doubled pair (Twins, Stammerer) | 19.3% |
| start = end (Herald) | 6.6% |
| alphabetical (Cartographer) | 1.1% |
| palindrome (Mirror, as it was) | **0.24%** |
| vowelless (Stonemason) | **0.2%** |

**Cut.** The **Stonemason** (0.2%, and flat Points besides) and the
**Archivist**, whose flat ×2 on a page's first word the Frontispiece could
never catch — five solo quota clears just to draw level, at four Coins more.
The Frontispiece inherits the slot at uncommon · 7. Its step stays at 0.1:
clearing a page on its first word already pays in spare-word Coins, and the
reward needn't double up. `SAVE_VERSION` went to 11 so seated copies of the
cut two retire with the save rather than dangling.

**Brought under the contract.** The **Scholar** trades +3 Mult for +5 Points —
it fired on 87% of words and asked nothing, which made it every run's correct
first purchase. The **Novelist** goes ×5 → ×2 and rare → uncommon: its
condition is met whenever a ten-tile rack means it, and it lands on the word
already carrying the most Points and paint. The **Herald** goes common →
uncommon, because a ×Mult that asks nothing of your collection does not belong
at common weight beside the Marbler's ×2 for two azure letters.

**The Mirror, reworked rather than cut.** Palindromes alone were 0.24% and the
Skimmer cannot rescue them (only 0.3% of words can be Skimmer-arranged into
one — measured). Reading a word backwards for *another* word adds 1.47%,
and reaches words worth setting: DEVIL/LIVED, DRAWER/REWARD, STRESSED/
DESSERTS. Combined 1.72%, which sits beside the Cartographer — so it keeps ×4
and drops to uncommon · 5. Two-letter words no longer qualify; ON/NO would
have been a ×4 for nothing.

**The +Points sweep.** An early word is 7-10 base Points and chapters 2-3 ask
14-49 per word, so a common should boost a word by half to double, not
quadruple it: Apprentice +20 → +10, Twins +30 → +15, Firebrand +25 → +15,
Jeweller +6 → +4, Calligrapher +4 → +3, Goldsmith +5 → +4. Left alone: the
Siren (already modest), the Seedsman (scaling is its design), the
Monogrammist (self-limiting).

**Rarity, where the effect was fine and the shelf was wrong.** Minimalist rare
→ common · 5 (its condition *fights* the word — three tiles carry little paint
and few Points — which is what earns a multiplier at common weight, where the
Herald's did not); Rat Catcher, Bursar and Closer rare → uncommon · 7; Nudist
uncommon → common · 4. The Beekeeper's step doubled to 0.2, since one B in the
bag ended a committed run around ×2.

Roster 56 → 54, and the tiers move from 15/19/22 to **16/23/15**. That was the
other structural problem: rares are the scarcest offers, so a crowded rare
tier is the one players see least of. Every rare left is build-defining — the
pardons, the engines, the registers, the Binder.

**Still watching.** The Typesetter and the Jeweller were both quietly buffed
when the ligature set grew (six types in the shop pool, and CK/WH/QU all sit
at 8+ Points). **Stammerer × Skimmer** is the combo to measure next: 19.7% of
words hold a doubled pair, but 46.7% can be *arranged* into one, which is
Cartographer × Skimmer all over again at two rare seats.

## From the pitch pile

A later batch, built from design pitches rather than the overhaul plan. All
of them follow the contract: a multiplier or an income is bought with a
condition, and the condition asks something real of the player.

- **The Copyist** 📑 (common · 4, neutral) — ×2 Mult when the word already
  stands in the manuscript. The Skald's stricter cousin: same family (word-
  history conditions), much harder condition, so it holds common weight where
  the Skald sits at uncommon. Dead on page one by definition, and a repeat
  never lands by accident — it has to be steered, which mercury trims and The
  Fountain turn into a build. Marks are stripped from both sides of the
  comparison, so HELLO! reprints HELLO.
- **The Bloodletter** 💈 (common · 4, crimson) — discard *exactly one* tile:
  even odds it is painted crimson or destroyed. The single-tile trigger is the
  ante — a whole Discard spent on one tile — and it caps the pace at two
  tosses a page, which is what keeps the paint honest next to the Dipper
  (whose 1-in-10 was already too fast and got cut to 1-in-12). A per-tile
  50% on full discards was the other reading of the pitch and is flatly too
  much — measured against that same Dipper note. Both faces are crimson's
  currency: paint fuels the guild, a destroyed tile thins the bag and feeds
  the Composter. Paint is the wanted face so it rides `luckyRoll`; the
  furnace is raw chance. Brought `trash(tile)` and `{ trashed }` to the
  `onDiscard` contract — main.js unfiles those tiles from the pile and plays
  the burn where they stand.
- **The Headsman** 🪓 (uncommon · 7, crimson) — each dismissed patron
  permanently adds ×0.2 to his Mult (`HEADSMAN_STEP`). Crimson's engine for a
  resource nothing else spends: the shelf itself. The count advances in
  `sellPatron` — never in scoring, where `data` is read-only — and a
  dismissed Headsman collects nothing on himself, having already left the
  shelf when the axe is counted. **Watchpoint:** the buy-to-behead loop.
  Hiring a common at 3–4 and dismissing it for half back prices a head at
  ~2 Coins; three patron offers a market and the escalating re-roll bound the
  pace, but if a dedicated player outruns the Stoker with none of the
  Stoker's tile cost, drop the step to 0.15 before touching anything else.
- **The Antiquary** 🏺 (uncommon · 6, amber) — words containing a J, QU, X or
  Z tile pay 2 Coins, once per word. Amber income with no paint ante; the
  pitch named Z X J, and QU joins them as the fourth 8+-Point letter (the
  Scrabble quartet, one of each in the starting bag). Fee follows the tile's
  active letter, so a dual counts by its showing face, like the Siren. The
  Izzard makes it an engine — a Z read as S still pays — and that pairing is
  deliberate: two curios, mild alone, a livelihood together. **Watchpoint:**
  benchmark against The Banker's flat +2 a page; the Antiquary should beat
  it only when the collection has been steered toward its letters.

- **The Espalier** 🪴 (uncommon · 6, jade) — print a two-tile word and both
  tiles permanently gain +2 Points (`ESPALIER_STEP`). Measured before
  building: the dictionary holds **60 two-letter words**, and ligatures make
  two-tile THE, SING, KING, QUA and RATS — so the trigger is at-will, not a
  lottery. What it costs is the word slot: a two-tile word scores next to
  nothing, and a spare word slot is otherwise worth a Coin at page's end, so
  every fire is a small, real payment for +4 permanent Points placed on
  exactly the two tiles you chose. That concentration is the contrast with
  the Grafter (rare · 10), which grows more per page but sprays it across
  whatever jade touched. Growth rides `growTile`, so the corner number wears
  jade wherever the tile appears, and a ghost refuses it as it refuses
  everything. **Watchpoints:** if burning two spare slots a page proves too
  fast, drop the step to 1 (Grafter parity) before gating the trigger; and
  the Stenographer's acronym list holds 38 two-letter entries (DM, GG, RN…),
  which widens the trigger for a rare seat — probably fine, worth a look.

### The Typefounder (a later pitch)

**The Typefounder** ⚗️ (rare · 10, crimson) — discard *exactly two* tiles
and they are recast as one two-faced sort: the left tile takes the right's
letter as its second face, and the right is destroyed. This completes a
discard ladder with the Bloodletter — one tile tempts the barber, two go to
the crucible — with no overlap between their triggers, so both can be
seated and read together.

The melt rules live in `mergeTiles` (state.js), deliberately not in the
desc: where both tiles carry the same finery (paint, trim, nick, material)
the **left** tile's survives; where only one does, it is kept whichever
side it came from; grown points pour together. Only plain single-letter
tiles will pour — no duals (two faces is the most a tile has), no ligatures
or marks (the Punchcutter's own bar), no ghosts or lent tiles. The
destruction goes through `trashFromCollection`, so it respects the
Smelter's floor and feeds the Composter.

Why rare: this is a god-tile foundry. It casts a Punchcutter cut where you
chose *both* faces, and it consolidates finery — merge a purple-trimmed
tile onto a painted one and the survivor wears both. The price is real
(every melt shrinks the collection by one, and spends a whole Discard on
two tiles), but the ceiling is a build around one perfect tile, which is
rare-shelf material beside the Stoker and the Grafter. Crimson reaches 10
patrons with him, drawing level with azure. **Watchpoint:** the
Monogrammist echoes whatever a god-tile becomes; if a merged
paint-trim-rainbow sort with an echo proves silly, the first lever is
cost, not the melt rules.

### The spelling pass (a later round of pitches)

Three changes in one sitting, all to how words are excused or paid:

- **Titivillus forgives everything a vowel can do wrong.** To substitution
  and transposition he adds omission (SEPRATE) and intrusion (ATHELETE) —
  one slip per word, as ever. Omission is the wide door: a rack short of
  vowels can set BRD and let the demon supply the I, which materially
  changes what a consonant-heavy hand is worth. Deliberately kept behind
  the existing gates — azure ink in the word, a rare · 9 seat. Watchpoint:
  if vowel-skipping proves to be the whole patron in play, gate the
  omission branch on word length (4+) before touching the rest.
- **The Haplographer** 🔂 (uncommon · 6, neutral) — haplography is writing
  once what ought to be written twice, the scribal slip the family was
  missing. One rule, `doubledReading` in patrons.js, consulted twice: at
  the dictionary check (BALOON stands for BALLOON, slotted before the
  Skimmer in the ladder), and at scoring, where a word that *can* be read
  with one letter doubled counts as holding one more doubled pair — which
  is what pays The Twins (+15) and The Stammerer (an extra ×2). **This
  deliberately breaks the family's no-score rule**, and is priced above
  the Stumbler for it. Two consequences to know about: the licence pays
  even when the word was valid as typed (MATE reads as MATTE and pays the
  Twins — a licence, not an excuse), and Stammerer × Skimmer ×
  Haplographer does *not* compound the way it sounds — the Skimmer's
  arrangements are gibberish as typed, and doubling a letter of gibberish
  almost never lands in the dictionary.
- **The Assayer retuned**: uncommon · 6 paying per amber tile (cap 2 a
  word) → **common · 3 paying 1 Coin per word with an amber tile**. The
  per-tile version was a scaling engine priced like one; the per-word
  version has half the ceiling (5 a page against the old 10) and is
  priced at the floor to match — amber's on-ramp, not its payoff. The old
  watchpoint (Assayer vs the Banker's 2-a-page benchmark) still applies,
  now with 3 fewer Coins on the front.

The family after the pass, cheapest excuse first: the Stumbler (common · 3,
adjacent swap), the Haplographer (uncommon · 6, one letter for two), 
Titivillus (rare · 9, the vowels), the Skimmer (rare · 12, the middle in any
order). Reviewed for replacement and every seat kept: each forgives a slip
the others can't reach — the Stumbler alone can swap a word's end letters,
the Haplographer alone changes a word's length for consonants, and the
Skimmer's wholesale shuffle is the only one that reorders at a distance.
The overlap that does exist is small and paid for: a doubled *vowel*
(SED → SEED) is now reachable by both the Haplographer and Titivillus, but
Titivillus costs a rare seat and azure ink to do it.

Guild arithmetic, which this batch was partly chosen to serve: crimson was
the thinnest guild at 7 and takes two of the new seats (→ 9), amber and jade
take one each (→ 8, → 9), against azure's noted 10. Tiers move 18/25/15 →
20/28/15 — the newcomers' commons earn their weight the way the contract
demands.

## The guilds made visible, and the Alderman

Guild membership graduated from a comment block to a def field: `guild:
'amber' | 'jade' | 'crimson' | 'azure'`, absent for the neutral majority.
Assignments are **thematic first** — flavour may drift them — and reach
beyond the paint mechanics: crimson took the Quartermaster (discards are deck
management), jade took the Beekeeper and the Frontispiece (permanent
self-growth), amber took the Banker and the Magpie, azure took the whole
spelling wing — Izzard, Stenographer, Binder — alongside its paint guild. The
Stumbler and the Skimmer stay colourless per the original ruling. Standing
counts: azure 9, amber 7, jade 7, crimson 6, neutral 26 — azure's bloat is a
known imbalance, to be designed around rather than papered over.

The livery is CSS only: a silk ribbon bound into the calling card's top edge,
the portrait panel washed in the guild's dye, the guild named beside the
rarity, and a small enamel pin on the seat. Rarity keeps the hairline; guild
keeps the ribbon — separate facts, separate inks.

**The Alderman** 🎩 (uncommon · 7) is why the field is mechanical at all:
scoring gained a pass 4½ where, after every other patron has spoken, **each
guild represented on the shelf pays ×1.5**. He counts guilds, and only guilds —
two things he pointedly ignores:

- **whether those patrons fired.** A dye that acts at chapter's end and a
  pardon that acts at the dictionary check both fly their colours as well as
  the Bursar does. He is paid for the company you keep, not the work it does.
- **how many share a livery.** Three amber patrons pay once. Doubling up
  inside a guild buys nothing from him.

So his ceiling is **×5.06**, set by there being four guilds — not by seat
count, which means the Colophon's `+1 Patron seat` cannot inflate him. Seating
all four costs four of five starting seats, which is the price of the card.

| guilds on the shelf | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| whole-score × | 1.5 | 2.25 | 3.38 | **5.06** |

Two design consequences worth keeping in view. **Adding a `guild` to any def
makes that patron better in an Alderman build even when its own effect is
untouched** — guild assignment is no longer cosmetic bookkeeping. And because
he ignores triggers, **the guilds' thin igniter counts no longer matter to
him**: crimson and azure each have only two patrons that write score steps,
but any crimson or azure patron at all satisfies the Alderman.

## Two commons for the thin guilds

Crimson and azure ran shortest, and crimson had no cheap way in at all. Two
commons at 4 Coins:

- **The Dipper** 🪣 (jade) — each tile you discard has a 1-in-10 chance of
  being painted a random colour, over the top of whatever it wore. It brought
  the **`onDiscard(ctx)`** hook with it (`ctx { tiles, state, data, paint }`,
  dispatched by `runDiscardHooks` in main.js after the tiles leave the rack
  and before the hand tops up). Discarded tiles are still in the collection,
  so the paint is waiting when the bag comes round again — jade's permanence,
  bought with a resource you were spending anyway.
- **The Gambler** 🎲 (crimson) — each word has a 1-in-2 chance of ×2 Mult.
  The toss lives in `state.gambleWon` (`rollGamble`, re-tossed as a page opens
  and after every word prints) rather than inside the score effect, because
  **`computeScore` re-runs on every keystroke to drive the live preview**: a
  roll in there would flicker as you compose and then disagree with what
  printed, breaking the roster's one hard promise — that what a patron shows
  on the shelf is what it pays. The side effect is that the coin lands
  *before* you set the word and the shelf shows it, which reads as a tactical
  invitation rather than a leak: a lit Gambler is a reason to spend your best
  tiles now. If the loss of suspense disappoints in play, the alternative is
  to roll at print and let the readout jump — at the cost of that promise.

## Remaining phases

1. **Phase 1 — score-time patrons.** All "pure `score` def" rows above, plus
   the two small scoring-loop extensions they need (ctx `data` for the Stoker,
   ctx `addCoins` + pass-4 coin floater for the Assayer). Everything here
   previews on the shelf automatically — that's why these go first.
2. **Phase 2 — print-time effects.** The `onPrinted` rows (Stoker's burn,
   Arsonist, Nudist, Illuminator), the burned-tiles-skip-retire flow, the
   Fountain's `retirePrinted` + `returns` change, and the fire/paint
   animations.
3. **Phase 3 — chapter dyes and the Neologist.** The four dye commons (one
   shared helper, four one-line defs) and the Neologist's modal.
4. **Phase 4 — cuts and docs.** Remove the four cut patrons and the
   scavenger wiring; update the README's patron section and knob table;
   rebuild the single-file bundle; playtest pass.

## Conventions

- Names are "The <trade>"; descs are one sentence with concrete numbers.
- Cross-cutting numbers live in `constants.js`; score-only numbers live in
  the def, like the existing roster.
- Wanted-outcome randomness goes through `luckyRoll`. Always.
- A patron's memory lives in its seat's `data`, never on the def, never in a
  module global — it must survive save/load.
- Meta patrons (`onPrinted`/`onChapterEnd`) don't light up during composition
  (only score-script steps do). Acceptable for now; a later `armed(ctx)`
  predicate could fix it. The Fountain is the exception — its `returns` flag
  rides the script.

## Watchpoints for playtest

- **Assayer** income vs The Banker (the 5-coin → 2/page benchmark).
- **Neologist**: players will coin `ZAXJKQ`-style tile-fit words; if that's
  too strong, require a vowel, or make it chapter-gated.
- **Arsonist** repainting carefully-built rainbows is intended crimson chaos —
  if testers hate it, fall back to 15% on unpainted tiles only.
- **Azure guild** runs six deep (others four). The Marbler is first against
  the wall if the roster feels fat.
- Roster grows 22 → 40; if guild assembly through 3-offer markets feels slow,
  consider weighting patron offers toward colours the player has painted.
