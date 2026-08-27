// The Colophon's roster — permanent picks offered when a chapter clears.
//
// The NAMES and DESCRIPTIONS are copy and live in js/text.js (UPGRADE_TEXT and
// PAINT_UPGRADE_TEXT). This file is the roster itself: which picks exist, what
// kind each is, and the emoji it wears.
//
// kind: 'structural'  — a lasting bonus, tracked by upgradeCounts and read back
//                       by the effective-* getters in state.js.
//       'paint'       — an immediate one-off: PAINT_PER_POT tiles take the colour.
//       'blackmarket' — not an upgrade at all: a door, opened once, before the
//                       ordinary Market. See js/blackmarket.js.
//
// `endless: true` exempts a pick from MAX_UPGRADE_REPEATS (eligibleIds in
// js/colophon.js), so it can be taken every chapter for the rest of the run.
// Only the alley wears it: a structural bonus taken without limit would run away
// with the run, and there is nothing in the alley you are not paying for.

import { COLOURS, PAINT_PER_POT, KNOBS } from './constants.js';
import { UPGRADE_TEXT, PAINT_UPGRADE_TEXT, fillKnobs, fillSlots } from './text.js';

const say = (id, field) => fillKnobs(UPGRADE_TEXT[id][field], KNOBS, `text: UPGRADE_TEXT.${id}`);

export const UPGRADE_DEFS = [
  { id: 'handSize',      kind: 'structural', emoji: '🖐️',
    name: say('handSize', 'name'),      desc: say('handSize', 'desc') },
  { id: 'discard',       kind: 'structural', emoji: '♻️',
    name: say('discard', 'name'),       desc: say('discard', 'desc') },
  { id: 'patronSeat',    kind: 'structural', emoji: '💺',
    name: say('patronSeat', 'name'),    desc: say('patronSeat', 'desc') },
  { id: 'workbenchSlot', kind: 'structural', emoji: '🧰',
    name: say('workbenchSlot', 'name'), desc: say('workbenchSlot', 'desc') },

  // One paint pick per colour, all four written from the one entry — {0} is the
  // colour's name, {1} how many tiles a pot covers.
  ...Object.keys(COLOURS).map(colour => ({
    id: colour, kind: 'paint', colour,
    name: fillSlots(PAINT_UPGRADE_TEXT.name, COLOURS[colour].label),
    desc: fillSlots(PAINT_UPGRADE_TEXT.desc, COLOURS[colour].label, PAINT_PER_POT),
  })),

  // The alley. Its card says plainly that it is stock and not a gift: taking
  // this over a hand size should be a decision, not a surprise. It is not dealt
  // at all below BLACK_MARKET_MINIMUM Coins — see eligibleIds in js/colophon.js.
  { id: 'blackmarket', kind: 'blackmarket', emoji: '🕯️', endless: true,
    name: say('blackmarket', 'name'),   desc: say('blackmarket', 'desc') },
];

export const upgradeById = id => UPGRADE_DEFS.find(d => d.id === id);
