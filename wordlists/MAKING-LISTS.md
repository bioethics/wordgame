# Making a themed list

The four register lists — `theme-spooky.txt`, `theme-romantic.txt`,
`theme-cute.txt`, `theme-rude.txt` — each pay ×3 Mult when the printed word is
on them (the Sexton, the Paramour, the Poppet, the Vulgarian). This is how to
make another, or grow these when the dictionary grows. The mechanical steps
are `tools/theme-list.mjs`; the step that matters is reading, and no script
does it.

## What the lists are for, and so what "good" means

A player never sees the list. They steer by intuition: *this word feels
spooky, so the Sexton should pay for it.* A good list is one whose verdicts a
player would have guessed, so the two failures are opposites and not equally
bad:

- **A word missing** that a player is sure belongs (PHANTASMS, POLTERGEISTS and
  BROOMSTICKS were missing from spooky; FARTS, in the plural, from rude). This
  feels like being cheated, and it is the commoner failure.
- **A word present** that nobody would have guessed. This is harmless unless it
  is a clanger: a slur, a function word, or a word in the wrong register.

Hence the rule every round so far has run on, in the original brief's words:
*"a low barrier for additional admissions, but a high barrier against removal;
just get rid of the really glaring mistakes."*

How big a list is decides how often its patron fires. The four cover 7–13% of
the playable dictionary (`node tools/theme-list.mjs check`). At that coverage
the register patrons change the Daily Proof's best word on 68–82% of cases
(`tools/daily-table.mjs`), the most of any patron measured. A list of 1–2%
would be a patron that rarely fires; one of 30% would be a ×3 on every word.

## The recipe

### 0. Write the brief

One paragraph: what the theme is, what it is not, and which nearby registers
belong to some other list. Then ten clear ins, ten clear outs, and five
borderline words with a ruling on each. Register rulings matter most, and they
are made per list rather than once for all four. Sexual vocabulary is struck
from cute but kept in romantic, where STREETWALKER sits beside HARLOT and
COURTESAN. The brief is what every reader in step 3 is handed, so it has to
stand on its own.

### 1. Seed

Two ways in, and the four lists used both (*Where the four came from*, below):

- **A cluster brainstorm.** Brainstorm by sub-topic, in clusters, with every
  inflection: *kitten kittens kitty kitties cat cats puppy puppies pup pups…*
  is how cute begins. A few hundred to a few thousand words. Clusters are cheap
  to produce and easy to check for gaps, since a missing member of a cluster
  stands out.
- **A ranked related-words list.** Ask a word-similarity tool for everything
  near the theme word, closest first. It is wide and fast, and it is how
  spooky, rude and romantic seem to have begun. Cut it where it stops being on
  theme. Its tail is association and then noise: the first spooky list carried
  SKANK, BITCH and YOU until a review struck them.

Check them in with a dry run, which reports anything the dictionary doesn't
hold, and anything barred:

```
node tools/theme-list.mjs add NAME seed.txt          # dry run
node tools/theme-list.mjs add NAME seed.txt --write
```

(A new list starts as an empty `wordlists/theme-NAME.txt`.)

### 2. Inherit

Every word the dictionary holds whose base is already on the list:

```
node tools/theme-list.mjs inherit NAME > inherit.tsv
```

Plurals, verb forms, -ly and -ness can mostly be taken in bulk after a skim.
Two kinds are flagged for a proper read, because both went wrong before:

- **-er words that aren't comparatives.** These can name a different thing:
  COTTER is not a COT, a BORER is not a BORE, a MOONLIGHTER does not work by
  MOONLIGHT, an ARCHER has nothing to do with ARCH. Twenty-two were cut for
  this in the August sweep.
- **Comparatives.** A spell-checker accepts AWFULLER and TRANQUILLEST; nobody
  says them. Thirty-eight were cut. The tool tells comparatives from agentives
  by the pair: a comparative has an -est beside it, an agentive (REVILER,
  SQUEALER) does not. Cutting by "-er" alone wrongly took those two.

Put the keepers in a file, one per line, and `add` them.

### 3. Sweep the dictionary — by reading it

```
node tools/theme-list.mjs pool --lists spooky,romantic,cute,rude --out pool/
```

This writes everything on none of the lists, minus the block list and minus
what step 2 already proposed, alphabetically, in files of 1,900 words. With
the current four lists that is about 52,000 words in 28 files.

**Read them.** In August nothing mechanical worked.

- Matching on thematic roots put ASSAILABLE and DEMITASSE in rude (both contain
  "ass") and BROTHERLINESS in spooky ("rot"). No threshold fixes that rate of
  false positives.
- A word-frequency cut was tried in the same session and dropped. Frequency
  doesn't decide whether a word belongs, and the rare words (BESOM, PONIARD,
  MIASMATA, THRALLDOM) are the best finds.

One reader per file, with the brief. Read once for every list at a time: a
reader picking for all four themes at once costs little more than one. The
reader can be you, a Claude session reading the files one after another (as
in August), or parallel agents, one per file. That last is the only practical
way to sweep a whole dictionary for a brand-new theme. Ask each reader for:

> You are choosing words for the **NAME** list of a word game: a word on it
> pays ×3 when a player sets it, and players guess what is on the list by
> feel. Brief: *(paste step 0)*. Read every word in the file. List each word a
> player would plausibly expect to count, erring towards inclusion: a word
> that clearly belongs to the theme in at least one ordinary sense is in.
> Leave out function words, words in a register the brief excludes, and
> anything offensive about a group of people. Return the picks one per line,
> under a heading for each list, and nothing else.

Every pick still goes through `add`, which checks it against the dictionary and
the block list, so a reader's slip can't put an unplayable word on a list.

### 4. Review: high barrier out

Read the list once more, top to bottom, for clangers only:

- **Slurs and hate symbols.** `excluded-slurs.txt` is the single place that
  decides what is playable. It is enforced at load on the dictionary and on
  every list, so a barred word on a list simply never scores; `check`
  reports any.
  - A new slur found in the dictionary goes on the block list, not out of the
    files: one file to read to know what is barred, one line to unbar.
  - Contested words (CHINK, GYP, SPASTIC…) are the author's call. Flag them;
    don't settle them.
  - Sweeps find slurs the block list missed under another spelling. NIGGAZ and
    the one-g FAGOT came in with the Debian word list in August.
- **Function words**: THE, YOU, or FINANCE in romantic.
- **Register violations**, against the brief's rulings.
- **Split phrases.** "roly poly" read as two words once let POLY into cute. A
  list holds single words; drop or close up anything with a space.

### 5. Check and measure

```
node tools/theme-list.mjs check
```

This gives each list's size, its coverage, and anything that won't load:
duplicates, block-listed entries, words the dictionary lacks. It also shows how
much the lists overlap, since a word on two lists pays both. Today 85 entries
across the four can't be set because the dictionary doesn't hold them (GOLEM,
ARCANA, BONEYARD…). Those are dictionary gaps (`tools/find-dictionary-gaps.mjs`)
rather than list errors.

Then measure the patron in play: `node tools/daily-table.mjs` reports how often
it moves the best word and how often it is dead.

### 6. When the dictionary grows

Run steps 2–4 on the new words only, with `--from` set to the words the update
added:

```
node tools/theme-list.mjs inherit NAME --from added.txt
node tools/theme-list.mjs pool --from added.txt --out pool/
```

In August that was 6,307 new words. Inheritance kept 663; the remaining 5,584
were read by eye in three files and gave 677 picks: spooky 176, rude 185,
cute 230, romantic 86. Romantic gains least from any dictionary sweep, because
what a spell-checker adds is mostly birds, plants, food and tools.

### 7. Wiring in a new theme

A new register patron needs:

- `wordlists/theme-NAME.txt`, and its path in `THEME_FILES` (`js/themes.js`);
- a behaviour, `registerPatron('id', 'NAME')` in `js/patrons.js`;
- a card in `js/patron-cards.js`;
- a parcel in `PACKAGES` (`js/constants.js`), with its label as a `PARCEL_*` knob.

For the Daily Proof, it also needs:

- the file in `LIST_FILES` and a `register('NAME')` entry in `PATRONS` (`daily/table.js`);
- a rule line in `PATRON_TEXT` (`daily/text.js`);
- a run of `tools/daily-check.mjs` and `tools/daily-table.mjs` before it goes in
  a roster.

## Where the four came from

What the session history, the commits and the author's Drive show:

- **15 August, before any session saw them.** Spooky, rude and romantic each
  began as one long ranked list: closest to the theme at the top, then looser
  associations, then noise. A Drive document made at 09:39 that morning opens
  *creepy, ghastly, spooky, ghostly, eerie, ghoulish, haunted, demon…* and
  drifts down to *comforting, skank, orgy*. `spooky-words.txt` (09:43–11:07)
  ends in *could, you, download, database, investors*. The first committed
  spooky list (d152116, 4,754 lines) keeps that order and carries the tail's
  noise: ARTIFACT at line 2,507, SKANK at 2,842, BITCH at 2,990. It closes on
  a hand-made cluster (*bellows, tinderbox, bolted, barred, shutters,
  hinges…*). Cute began differently, as clusters by sub-topic with every
  inflection: *kitten kittens kitty kitties cat cats puppy…*.
- **15 August, review.** A Claude session read all four in full on the "low
  in, high out" brief. It struck the tails' noise and the slurs, deduplicated
  cute (160 repeats), and added 81 of about 350 brainstormed candidates that
  passed the dictionary check (5fe6de6). The author declined an offer to
  draft further themes the same way: they had "a different workflow for the
  word lists".
- **17 August.** The author added inflections of existing entries by hand
  (POLTERGEISTS, MANACLING, BROOMSTICKS). They also sorted the week's 5,595
  new dictionary words into the four themes, and started the block list.
- **21–26 August.** Longer cute and romantic lists ("merged"), then v3 and v4
  of the rest, replaced the originals wholesale (67bba18, 1152258, 7afa065).
  Their additions were pasted into Drive documents and uploaded. Some are
  words no dictionary holds (*batpup, bearling*), the mark of a generator
  rather than a dictionary.
- **27 August.** The sweep in step 6, with the slur findings and the decision
  to bar at the block list only (489cc17, 8159cfd).
- **4 November.** The recipe's steps 2 and 6, with `tools/theme-list.mjs`.
  Eighty-five list entries the dictionary couldn't set were made playable.
  The four lists' 6,693 inflection proposals were read by five parallel
  readers, one per list and two for romantic. They kept 4,352 and cut drift
  (MATERS, LETTERING), wrong bases (DINS from DINE, HEROINS from HEROINE),
  comparatives nobody says (SPLENDIDER), and -er words that name a device
  (TUNER, BOILER). Romantic grew most, from 5,668 to 8,560: it had held most
  of its words in one form only, DRAGON without DRAGONS. The 487 words the
  dictionary gained when its 12dicts marks were stripped were swept by hand,
  and 45 joined a list.

Not found anywhere these sessions can reach: the tool or chat that produced
the ranked lists and the later batches. The ranking, the drift into
association and the noisy tails look like a word-similarity tool. The
clusters and the invented words look like a language model. The author's
claude.ai chats are the likeliest place, and they can't be read from here.

So the recipe above keeps both seeds:

- **A ranked related-words list.** It is quick and wide, but it needs cutting
  where it stops being on theme, and step 4 must read its tail.
- **A cluster brainstorm.** It is narrower but cleaner, and still needs step
  1's dictionary check, since a generator will invent words.
