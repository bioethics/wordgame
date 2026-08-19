# The patrons

**Generated — but editable.** The list is built from the defs in
`js/patrons.js` by `tools/patrons.mjs`. Tweak a patron's **name** or its
**description** right here, then push the changes back into the game:

```sh
node tools/patrons.mjs --apply    # doc → js/patrons.js
node tools/patrons.mjs            # js/patrons.js → doc (after code changes)
```

Everything else in a row — rarity, cost, guild — is a fact about the def and
is rewritten from the code each time this file is regenerated, so change
those in `js/patrons.js`. Rows marked 🔒 can't be written back either: their
wording is built from a tuning knob in `constants.js` (or, for the four dyes,
shared by one generated def), and flattening it here would cut the knob's
wire. Edit those at the source.

House style for a description, from `docs/PATRON_OVERHAUL.md`: one sentence,
real numbers, no metaphor, under ~110 characters. State the rule, not the
feeling — the flavour belongs to the name, the emoji and the quips.

**77 patrons** — 21 common, 35 uncommon, 21 rare. Guilds: amber 12, jade 12, crimson 11, azure 14, no guild 31 — a dual-livery patron counts in each of its guilds.

## Amber · the counting-house

| Patron | Rarity | Cost | Description |
|---|---|---|---|
| ⚖️ **The Assayer** `assayer` | common | 3 | Words with an amber tile pay 1 Coin. |
| 🪙 **The Goldsmith** `goldsmith` | common | 4 | Amber tiles gain +4 Points. |
| 🌼 **The Weld** `weld` 🔒 | common | 4 | As each chapter ends, 2 tiles of your collection are painted amber. |
| 🏦 **The Banker** `banker` | uncommon | 4 | When a page completes: +1 Coin per amber patron on your shelf — this one included. |
| 🤝 **The Factor** `factor` | uncommon | 5 | Amber tiles still in your hand when a page completes earn a free Market re-roll each, up to 2. |
| 🏺 **The Antiquary** `antiquary` | uncommon | 6 | Words containing a J, QU, X or Z tile pay 2 Coins. |
| 🔬 **The Scientist** `scientist` | uncommon | 6 | Once a page, ask him for an OLOGY tile — gold-trimmed, riding above your hand, gone when the page ends. |
| 💰 **The Bursar** `bursar` | uncommon | 7 | Words with an amber tile gain +1 Mult for every 5 Coins you hold (max +5). |
| 🛒 **The Chapman** `chapman` | uncommon | 7 | One tile at the Market is always amber, and amber tiles cost nothing. |
| 🐦 **The Magpie** `magpie` | uncommon | 7 | Gold-trimmed tiles pay double Coins, and every hand you draw holds one if the bag has any. |
| 🏰 **The Medievalist** `medievalist` | rare · also azure | 8 | Opens a stall at the Market selling medieval sorts — þ, ȝ and Ƿ — and hands you a yogh on arrival. |

## Jade · growth and permanence

| Patron | Rarity | Cost | Description |
|---|---|---|---|
| 🪣 **The Dipper** `dipper` 🔒 | common | 4 | Each tile you discard has a 1-in-12 chance of being painted a random colour. |
| 🌱 **The Seedsman** `seedsman` | common | 4 | Jade tiles gain +1 Point per chapter reached — +5 Points each in Chapter V. |
| 🍏 **The Verdigris** `verdigris` 🔒 | common | 4 | As each chapter ends, 2 tiles of your collection are painted jade. |
| 🐝 **The Beekeeper** `beekeeper` 🔒 | uncommon | 6 | Every B you print permanently raises this patron's Mult by 0.2. |
| 🧀 **The Cellarer** `cellarer` | uncommon · also amber | 6 | Ages when a page ends with a jade tile in hand: +1 Point to every word, +1 Coin when dismissed. |
| 🖍️ **The Dabbler** `dabbler` | uncommon | 6 | Whenever a tile is painted, a second unpainted tile has a 1-in-2 chance of taking the same colour. |
| 🪴 **The Espalier** `espalier` 🔒 | uncommon | 6 | Print a two-tile word: both tiles permanently gain +2 Points — in time to score. |
| 🖼️ **The Frontispiece** `frontispiece` 🔒 | uncommon | 7 | The first word of each page gets ×1.5 Mult — and a laurel each time that word clears the quota alone. |
| 🍷 **The Vintner** `vintner` | uncommon | 7 | Words with a jade tile gain +1 Mult per chapter reached — +5 Mult in Chapter V. |
| 🌿 **The Grafter** `grafter` | rare | 8 | When a word with a jade tile prints, every tile in it permanently gains +1 Point. |
| 👑 **The Laureate** `laureate` 🔒 | rare | 10 | Every jade tile you print crowns this patron with a laurel — +5 Points on every word, for good. |

## Crimson · sacrifice and fire

| Patron | Rarity | Cost | Description |
|---|---|---|---|
| 💈 **The Bloodletter** `bloodletter` | common | 4 | Discard exactly two tiles: one is destroyed, the other painted crimson. |
| ❤️‍🔥 **The Firebrand** `firebrand` | common | 4 | Words with 2 or more crimson tiles gain +15 Points. |
| 🎲 **The Gambler** `gambler` | common | 4 | Each word has a 1-in-2 chance of ×2 Mult — the coin is tossed before you set it. |
| 🌺 **The Madder** `madder` 🔒 | common | 4 | As each chapter ends, 2 tiles of your collection are painted crimson. |
| 🐀 **The Rat Catcher** `ratcatcher` | uncommon | 2 | Every page begins with a RAT tile in hand, painted a random colour. It is yours for good. |
| 🎒 **The Quartermaster** `quartermaster` | uncommon | 5 | Begin each page with an extra Discard. |
| 🧨 **The Arsonist** `arsonist` | uncommon | 7 | Every tile you print has a 1-in-10 chance of being painted crimson, and a 1-in-100 chance of being destroyed. |
| 🍂 **The Composter** `composter` | uncommon · also jade | 7 | Destroyed tiles rot into jade ones — at each Market, take one from the heap per jade patron you keep. |
| 🪓 **The Headsman** `headsman` 🔒 | uncommon | 7 | Each patron you dismiss permanently raises this patron's Mult by 0.2. |
| ⚗️ **The Typefounder** `typefounder` | rare | 10 | Discard exactly two tiles: they are recast as one tile with a letter on either face. |
| 🔥 **The Stoker** `stoker` 🔒 | rare | 11 | ×1.25 Mult, and crimson tiles are destroyed when printed — each one raises that Mult by 0.25, for good. |

## Azure · ink, flow and latitude

| Patron | Rarity | Cost | Description |
|---|---|---|---|
| ⚡ **The Izzard** `izzard` | common | 4 | Any Z you play may be read as an S — and still scores as a Z. |
| 🎶 **The Siren** `siren` | common | 4 | Vowels gain +2 Points — or +6 if they are azure. |
| 🪻 **The Woad** `woad` 🔒 | common | 4 | As each chapter ends, 2 tiles of your collection are painted azure. |
| 📚 **The Lexicographer** `lexicographer` | uncommon | 6 | ×1.5 Mult when the word is not among the commonest in English — reach for the word nobody else would. |
| 📟 **The Stenographer** `stenographer` | uncommon | 6 | Common acronyms and abbreviations count as words: LOL, BRB, WTF and the rest. |
| ⛲ **The Fountain** `fountain` | uncommon | 7 | Azure tiles return to the bag when printed, instead of the discard pile. |
| 🌀 **The Marbler** `marbler` | uncommon | 7 | Words with 2 or more azure tiles get ×2 Mult. |
| 🗿 **The Sculptor** `sculptor` | rare | 9 | ×2 Mult when the word is a noun, singular or plural — a Binder's compound counts as one. |
| 😈 **Titivillus** `titivillus` | rare | 9 | Words with an azure tile are accepted with one vowel wrong: swapped, changed, missing or extra. |
| 📖 **The Neologist** `neologist` | rare | 10 | Add one six-letter word of your choosing to the dictionary permanently, then this patron leaves. |
| 🪶 **The Poet** `poet` | rare | 10 | ×2 Mult when the word is an adjective — the describing words, ABLE to ZESTY. |
| 🏃 **The Athlete** `athlete` | rare | 12 | ×2 Mult when the word is a verb — a doing word, in any tense: RUN, RAN, RUNNING. |
| 🔗 **The Binder** `binder` | rare | 12 | Any two nouns stacked together count as a word: DOOM and HAT make DOOMHAT. |

## No guild · the wildcards

| Patron | Rarity | Cost | Description |
|---|---|---|---|
| 🧹 **The Apprentice** `apprentice` | common | 3 | 4-letter words gain +10 Points. |
| 📜 **The Scholar** `scholar` | common | 3 | Words of 5+ letters gain +10 Points. |
| 🥾 **The Stumbler** `stumbler` | common | 3 | Words are accepted with one pair of adjacent letters swapped: TEH counts as THE. |
| 📑 **The Copyist** `copyist` | common | 4 | ×2 Mult when the word already stands in your manuscript. |
| 🪭 **The Monogrammist** `monogrammist` | common | 4 | Arrives with three letters of its own; a tile showing one prints twice — Points, trim and paint alike. |
| 🧖 **The Nudist** `nudist` | common | 4 | In a word where no tile has paint, a trim or a nick, each tile has a 1-in-4 chance of gaining a random trim. |
| 👯 **The Twins** `twins` | common | 4 | Words with a doubled letter (LL, OO…) gain +15 Points. |
| 🐣 **The Abecedarian** `abecedarian` | common | 5 | 3-letter words get +10 Points. |
| 🪞 **The Mirror** `mirror` | uncommon | 5 | Words that spell another word backwards — or themselves — get ×4 Mult. |
| 🤰 **The Expectant Parents** `expectants` | uncommon | 6 | Common baby names count as words, and any name gains +10 Points — SOPHIE, ARCHIE, BARNABY. |
| 🔂 **The Haplographer** `haplographer` | uncommon | 6 | One letter may read as doubled: BALOON counts as BALLOON — and doubles pay The Twins. |
| 📯 **The Herald** `herald` | uncommon | 6 | Words that start and end with the same letter get ×2 Mult. |
| 🍻 **The Innkeeper** `innkeeper` | uncommon | 6 | Every word gains +5 Points per seated patron — this one included. |
| 💎 **The Jeweller** `jeweller` | uncommon | 6 | Tiles worth 8+ Points gain a further +4. |
| 🎵 **The Skald** `skald` | uncommon | 6 | Words starting with the same letter as your last word get ×2 Mult. |
| 🔠 **The Typesetter** `typesetter` | uncommon | 6 | Each ligature tile — one that spells several letters — gives +2 Mult. |
| 🎩 **The Alderman** `alderman` | uncommon | 7 | Each guild with a patron on your shelf gives ×1.5 Mult. |
| ✒️ **The Calligrapher** `calligrapher` | uncommon | 7 | Each painted tile gains +3 Points. |
| 🌒 **The Closer** `closer` | uncommon | 7 | The final word of each page gets ×3 Mult. |
| 🃏 **The Harlequin** `harlequin` | uncommon | 7 | Words holding all four colours get ×2 Mult. |
| 🖋️ **The Novelist** `novelist` | uncommon | 7 | Words of 7+ letters get ×2 Mult. |
| 🧸 **The Poppet** `poppet` | rare | 7 | ×3 Mult for any of the thousands of words The Poppet finds cute. |
| 🎨 **The Illuminator** `illuminator` | rare | 8 | When a word holds exactly three colours, its first bare tile is painted the fourth — before the word is counted. |
| 💘 **The Paramour** `paramour` | rare | 8 | ×3 Mult for any of the thousands of words The Paramour finds romantic. |
| ⚰️ **The Sexton** `sexton` | rare | 8 | ×3 Mult for any of the thousands of words The Sexton finds spooky. |
| 🍑 **The Vulgarian** `vulgarian` | rare | 8 | ×3 Mult for any of the thousands of words The Vulgarian finds rude. |
| 🔭 **The Astronomer** `astronomer` | rare | 9 | +1 Mult for each word already printed this page. |
| 📋 **The Overseer** `overseer` | rare | 9 | Print one more word each page. |
| 🦜 **The Stammerer** `stammerer` | rare | 10 | ×2 Mult for every doubled letter in the word — BALLOON pays twice. |
| 🗺️ **The Cartographer** `cartographer` | rare | 12 | Words whose letters run in alphabetical order get ×3 Mult. |
| 👓 **The Skimmer** `skimmer` | rare | 12 | Words are accepted with their middle letters in any order, so long as the first and last letters are right. |

---

Design rationale, per-patron, lives in `docs/PATRON_OVERHAUL.md`. The quips
patrons say after a good word are a separate list in `js/quips.js`.
