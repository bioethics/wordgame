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

Brainstorm by sub-topic, in clusters, with every inflection: *kitten kittens
kitty kitties cat cats puppy puppies pup pups…* is how cute begins. A few
hundred to a few thousand words. Clusters are cheap to produce and easy to
check for gaps, since a missing member of a cluster stands out.

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

What could be recovered from the session history and the commits:

- **15 August.** The four lists were built outside these sessions, by the
  author's own process, and uploaded at 1,352 (cute), 3,690 (romantic),
  2,922 (rude) and 4,754 (spooky) words. A Claude session then read all four in
  full on the "low in, high out" brief. It struck the clangers and deduplicated
  cute (160 repeats). It also brainstormed about 350 further candidates, of
  which 81 survived the dictionary check (commit 5fe6de6).
- **17 August.** The author appended a large batch to each list. They also
  classified the 5,595 new dictionary words of that week into the four themes,
  and started the block list (`excluded-slurs.txt`).
- **21 and 26 August.** Longer "merged" cute and romantic lists, then v3 and v4
  of the rest, replaced the originals wholesale (67bba18, 1152258, 7afa065).
  How those versions were generated isn't recorded in anything these sessions
  can reach.
- **27 August.** The sweep in step 6, with the slur findings and the decision
  to bar at the block list only (489cc17, 8159cfd).
