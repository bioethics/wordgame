// The patron list, in both directions.
//
//   node tools/patrons.mjs            regenerate docs/PATRONS.md from the defs
//   node tools/patrons.mjs --apply    write the doc's names and descs back into js/patrons.js
//   node tools/patrons.mjs --check    exit 1 if the doc is out of date (no writes)
//
// js/patrons.js stays the source of truth: the doc is generated from it, and
// --apply only ever carries two fields back the other way (name and desc), so
// there is nothing else in the doc that could quietly disagree with the game.
//
// Two kinds of row can't be written back, and both are marked 🔒 in the doc:
// descs built from a constant (template literals — the number belongs to
// constants.js, and flattening it to plain text would cut the knob's wire),
// and the four dye patrons, which share one generated def (see dyePatron in
// js/patrons.js). Edit those at the source.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PATRON_DEFS, guildsOf } from '../js/patrons.js';

const root    = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC     = path.join(root, 'js', 'patrons.js');
const DOC     = path.join(root, 'docs', 'PATRONS.md');
const mode    = process.argv[2] ?? '--write';

const RARITY_ORDER = { common: 0, uncommon: 1, rare: 2 };
const GUILDS = [
  ['amber',   'Amber · the counting-house'],
  ['jade',    'Jade · growth and permanence'],
  ['crimson', 'Crimson · sacrifice and fire'],
  ['azure',   'Azure · ink, flow and latitude'],
  [null,      'No guild · the wildcards'],
];

// ─── Reading the source ───────────────────────────────────────────────────────

// Where a def's field literal sits in js/patrons.js, and whether it is the
// plain quoted string --apply is allowed to rewrite. Fields are found within
// the def block: from this def's `id:` to the next one's.
function findField(src, id, field) {
  const start = src.indexOf(`id: '${id}'`);
  if (start < 0) return null;                         // generated (a dye patron)
  const next = src.indexOf("\n    id: '", start + 1);
  const end  = next < 0 ? src.length : next;
  const at   = src.indexOf(`${field}:`, start);
  if (at < 0 || at > end) return null;

  let i = at + field.length + 1;
  while (i < end && (src[i] === ' ' || src[i] === '\n')) i++;
  const quote = src[i];
  if (quote !== "'" && quote !== '"' && quote !== '`') return null;
  if (quote === '`') return { computed: true };       // reads a constant — leave it be

  let j = i + 1;
  while (j < end) {
    if (src[j] === '\\') { j += 2; continue; }
    if (src[j] === quote) break;
    j++;
  }
  return { open: i, close: j, value: src.slice(i + 1, j) };
}

const jsString = s => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

// A row is editable only if both fields are plain quoted strings.
function editability(src, def) {
  const name = findField(src, def.id, 'name');
  const desc = findField(src, def.id, 'desc');
  if (!name || !desc) return { editable: false, why: 'generated — see dyePatron()' };
  if (name.computed || desc.computed) return { editable: false, why: 'built from a constant' };
  return { editable: true };
}

// ─── Writing the doc ──────────────────────────────────────────────────────────

const esc = s => s.replace(/\|/g, '\\|');

function buildDoc(src, defs) {
  const counts = { common: 0, uncommon: 0, rare: 0 };
  for (const d of defs) counts[d.rarity]++;
  // A patron is listed under its primary livery; a dual-livery patron (the
  // Cellarer) notes its second guild in the rarity cell, and the header's
  // guild counts count every livery worn, so both of his guilds claim him.
  const byGuild  = g => defs.filter(d => (guildsOf(d)[0] ?? null) === g);
  const inGuild  = g => defs.filter(d => guildsOf(d).includes(g));

  const out = [];
  out.push('# The patrons');
  out.push('');
  out.push('**Generated — but editable.** The list is built from the defs in');
  out.push('`js/patrons.js` by `tools/patrons.mjs`. Tweak a patron\'s **name** or its');
  out.push('**description** right here, then push the changes back into the game:');
  out.push('');
  out.push('```sh');
  out.push('node tools/patrons.mjs --apply    # doc → js/patrons.js');
  out.push('node tools/patrons.mjs            # js/patrons.js → doc (after code changes)');
  out.push('```');
  out.push('');
  out.push('Everything else in a row — rarity, cost, guild — is a fact about the def and');
  out.push('is rewritten from the code each time this file is regenerated, so change');
  out.push('those in `js/patrons.js`. Rows marked 🔒 can\'t be written back either: their');
  out.push('wording is built from a tuning knob in `constants.js` (or, for the four dyes,');
  out.push('shared by one generated def), and flattening it here would cut the knob\'s');
  out.push('wire. Edit those at the source.');
  out.push('');
  out.push('House style for a description, from `docs/PATRON_OVERHAUL.md`: one sentence,');
  out.push('real numbers, no metaphor, under ~110 characters. State the rule, not the');
  out.push('feeling — the flavour belongs to the name, the emoji and the quips.');
  out.push('');
  out.push(`**${defs.length} patrons** — ${counts.common} common, `
         + `${counts.uncommon} uncommon, ${counts.rare} rare. Guilds: `
         + GUILDS.filter(([g]) => g).map(([g, t]) => `${t.split(' · ')[0].toLowerCase()} ${inGuild(g).length}`).join(', ')
         + `, no guild ${byGuild(null).length} — a dual-livery patron counts in each of its guilds.`);
  out.push('');

  for (const [guild, title] of GUILDS) {
    const defs = byGuild(guild).sort((a, b) =>
      (RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity]) || (a.cost - b.cost)
        || a.name.localeCompare(b.name));
    if (!defs.length) continue;

    out.push(`## ${title}`);
    out.push('');
    out.push('| Patron | Rarity | Cost | Description |');
    out.push('|---|---|---|---|');
    for (const d of defs) {
      const { editable } = editability(src, d);
      const lock = editable ? '' : ' 🔒';
      const also = guildsOf(d).slice(1);
      out.push(`| ${d.emoji} **${esc(d.name)}** \`${d.id}\`${lock} `
             + `| ${d.rarity}${also.length ? ` · also ${also.join(' & ')}` : ''} | ${d.cost} | ${esc(d.desc)} |`);
    }
    out.push('');
  }

  out.push('---');
  out.push('');
  out.push('Design rationale, per-patron, lives in `docs/PATRON_OVERHAUL.md`. The quips');
  out.push('patrons say after a good word are a separate list in `js/quips.js`.');
  out.push('');
  return out.join('\n');
}

// ─── Reading the doc back ─────────────────────────────────────────────────────

const unesc = s => s.replace(/\\\|/g, '|');

function parseDoc(text) {
  const rows = new Map();
  const re = /^\|\s*\S+\s+\*\*(.+?)\*\*\s+`([a-z]+)`(\s*🔒)?\s*\|[^|]*\|[^|]*\|\s*(.*?)\s*\|\s*$/;
  for (const line of text.split('\n')) {
    const m = line.match(re);
    if (m) rows.set(m[2], { name: unesc(m[1]).trim(), desc: unesc(m[4]).trim() });
  }
  return rows;
}

// ─── Modes ────────────────────────────────────────────────────────────────────

const src = fs.readFileSync(SRC, 'utf8');

if (mode === '--apply') {
  if (!fs.existsSync(DOC)) {
    console.error(`No ${path.relative(root, DOC)} yet — run \`node tools/patrons.mjs\` first.`);
    process.exit(1);
  }
  const rows = parseDoc(fs.readFileSync(DOC, 'utf8'));
  let patched = src;
  const done = [], skipped = [], unknown = [];

  for (const [id, row] of rows) {
    const def = PATRON_DEFS.find(d => d.id === id);
    if (!def) { unknown.push(id); continue; }

    for (const [field, was, now] of [['name', def.name, row.name], ['desc', def.desc, row.desc]]) {
      if (was === now) continue;
      // Re-find each time: an earlier patch shifts every later offset.
      const spot = findField(patched, id, field);
      if (!spot || spot.computed) {
        skipped.push(`${id}.${field} — ${spot?.computed ? 'built from a constant' : 'generated def'}`);
        continue;
      }
      patched = patched.slice(0, spot.open) + jsString(now) + patched.slice(spot.close + 1);
      done.push(`${id}.${field}: “${was}” → “${now}”`);
    }
  }

  for (const d of done)    console.log(`  ✓ ${d}`);
  for (const s of skipped) console.log(`  🔒 skipped ${s} — edit js/patrons.js directly`);
  for (const u of unknown) console.log(`  ? unknown patron id “${u}” — ignored`);

  if (!done.length) { console.log('Nothing to apply — the doc matches the defs.'); process.exit(0); }

  fs.writeFileSync(SRC, patched);
  console.log(`\n${done.length} change${done.length > 1 ? 's' : ''} written to js/patrons.js.`);

  // The defs held in memory are the pre-patch ones, so the doc is rewritten
  // from a fresh read of what we just saved — the query string is what gets
  // past the module cache. That way one command leaves both sides agreeing,
  // including the tidying (row order, spacing) an edited table usually wants.
  const fresh = await import(`../js/patrons.js?v=${done.length}-${patched.length}`);
  fs.writeFileSync(DOC, buildDoc(patched, fresh.PATRON_DEFS));
  console.log('docs/PATRONS.md refreshed to match.');
  process.exit(0);
}

const doc = buildDoc(src, PATRON_DEFS);

if (mode === '--check') {
  const current = fs.existsSync(DOC) ? fs.readFileSync(DOC, 'utf8') : '';
  if (current === doc) { console.log('docs/PATRONS.md is up to date.'); process.exit(0); }
  console.error('docs/PATRONS.md is out of date — run `node tools/patrons.mjs`.');
  process.exit(1);
}

fs.writeFileSync(DOC, doc);
console.log(`Wrote ${path.relative(root, DOC)} — ${PATRON_DEFS.length} patrons.`);
