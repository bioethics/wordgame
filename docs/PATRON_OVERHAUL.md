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
  Painter, the Stereotyper and the Restorer.

Watchpoints: cursed tiles compound (×9 for two, ×27 for three) and are
permanent, bounded only by clogging a hand you can't discard from; and the
Stoker burns rainbow tiles, which is consistent but is the one pairing to
warn players about.

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
scoring gained a pass 4½ where, after every other patron has spoken, each
guild with a member among the word's score steps pays ×1.5, once per guild —
two amber voices add nothing over one. All four guilds firing together is
×5.06, and costs most of the shelf. Only patrons that *write score steps* can
rouse him; the dyes, pardons and shop men act outside scoring and never
count. Per guild, the patrons that can light him: amber — Goldsmith, Assayer,
Bursar; jade — Seedsman, Vintner, Beekeeper, Frontispiece; crimson —
Firebrand, Stoker; azure — Siren, Marbler. Crimson and azure offer only two
igniters each — worth remembering when guild assignments are next tuned.

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
