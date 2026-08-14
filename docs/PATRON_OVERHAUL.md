# The Colour Guilds — patron overhaul

The approved redesign of Folio's patron roster. Phase 0 (engine foundations) and
the two subtlest patrons are **done**; this document is the worklist and the
contract for the remaining phases. Design intent in one line: paint is the heart
of scoring, so each colour gets a guild of patrons that makes committing to it
an archetype — amber pays coins, jade compounds forever, crimson burns for
power, azure bends the rules of spelling.

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
