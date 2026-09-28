// The game's self-checks, run before anything ships.
//
//   node tools/check.mjs
//
// The game checks itself as its modules load: a patron or editor whose card and
// behaviour don't marry, a {KNOB} with nothing to fill it, an effect the Generic
// can roll and cannot pay, two patrons wearing one emoji — each throws by name.
// In a browser that throw is a player's broken page. Here it is a failed deploy,
// which is where it belongs. The modules below pull in the rest of the rules
// between them, and none of them touch the page as they load.

const MODULES = [
  'constants', 'text', 'patron-cards', 'patrons', 'patron-generic', 'boss-cards',
  'bosses', 'scoring', 'state', 'market', 'blackmarket', 'colophon', 'upgrades',
];

let failed = 0;
for (const m of MODULES) {
  try {
    await import(new URL(`../js/${m}.js`, import.meta.url));
  } catch (err) {
    failed += 1;
    console.error(`✗ js/${m}.js — ${err.message}`);
  }
}
if (failed) process.exit(1);
console.log(`✓ ${MODULES.length} modules load and pass their own checks`);
