// Rebuild wordlists/names.txt — common baby names, for The Expectant
// Parents. Unlike common.txt this list is deliberately NOT filtered to the
// game's dictionary: its whole job is to let names through the door that the
// dictionary would turn away (see the vouch check in js/main.js).
//
//   git clone --depth 1 https://github.com/hadley/data-baby-names
//   git clone --depth 1 https://github.com/mine-cetinkaya-rundel/ukbabynames
//   node tools/build-names-list.mjs \
//     data-baby-names/baby-names.csv \
//     ukbabynames/data-raw/ewbabynames/ewbabynames.csv
//
// Sources, both open data:
//   US — Social Security Administration top-1000 names per year and sex,
//        1880-2008 (public domain), via hadley/data-baby-names.
//   England & Wales — ONS baby names 1996-2020 (Open Government Licence),
//        via mine-cetinkaya-rundel/ukbabynames.
//
// "Common" means charted for a while, not merely charted: a name qualifies by
// reaching the top 1,000 of its chart in at least MIN_YEARS distinct years
// (US years before 1930 don't count — the list should read as names, not as
// ancestors). Spellable names only — letters A to Z, no hyphens or spaces,
// nothing longer than a rack could plausibly set.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIN_YEARS = 3;      // distinct qualifying years to count as common
const US_SINCE  = 1930;   // US years before this don't count toward the bar
const EW_RANK   = 1000;   // E&W chart depth (US data is top-1000 by construction)

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [usSrc, ewSrc] = process.argv.slice(2);
if (!usSrc || !ewSrc) {
  console.error('usage: node tools/build-names-list.mjs <us-baby-names.csv> <ewbabynames.csv>');
  process.exit(1);
}

const spellable = n => /^[A-Z]{2,12}$/.test(n);

// US: "year","name","percent","sex" — presence in a year IS a top-1000 rank.
const usYears = new Map();
for (const line of fs.readFileSync(usSrc, 'utf8').split(/\r?\n/).slice(1)) {
  const m = line.match(/^(\d+),"([^"]+)",[\d.]+,"\w+"$/);
  if (!m) continue;
  const name = m[2].toUpperCase();
  if (+m[1] < US_SINCE || !spellable(name)) continue;
  (usYears.get(name) ?? usYears.set(name, new Set()).get(name)).add(+m[1]);
}

// E&W: year,sex,name,n,rank,nation — every name with 3+ uses is present, so
// the rank column does the narrowing the US data's cut-off did for free.
const ewYears = new Map();
for (const line of fs.readFileSync(ewSrc, 'utf8').split(/\r?\n/).slice(1)) {
  const [year, , rawName, , rank] = line.split(',');
  if (!rawName || +rank > EW_RANK) continue;
  const name = rawName.toUpperCase();
  if (!spellable(name)) continue;
  (ewYears.get(name) ?? ewYears.set(name, new Set()).get(name)).add(+year);
}

const names = new Set();
for (const [name, years] of usYears) if (years.size >= MIN_YEARS) names.add(name);
for (const [name, years] of ewYears) if (years.size >= MIN_YEARS) names.add(name);
const sorted = [...names].sort();

const out = path.join(root, 'wordlists/names.txt');
fs.writeFileSync(out, `# Common baby names — The Expectant Parents' register.
#
# Sources, both open data, merged: the US Social Security Administration's
# top-1000 names per year and sex, 1880-2008 (public domain, via
# hadley/data-baby-names), and the ONS baby names for England & Wales,
# 1996-2020 (Open Government Licence, via mine-cetinkaya-rundel/ukbabynames).
# A name qualifies by charting in the top 1,000 in at least three distinct
# years (US years before 1930 don't count). Rebuild with
# tools/build-names-list.mjs; order is not data — the file is alphabetical.
#
# Unlike the other lists, entries here need NOT be dictionary words: the
# patron vouches names through the dictionary check (js/main.js), the same
# door the Stenographer's acronyms use.
${sorted.join('\n')}\n`);

console.log(`wrote ${out} — ${sorted.length} names (${sorted[0]} … ${sorted[sorted.length - 1]})`);
