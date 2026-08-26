// The Colophon's roster — permanent picks offered when a chapter clears.
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

import { COLOURS, PAINT_PER_POT, BLACK_TILE_OFFERS, BLACK_PATRON_OFFERS } from './constants.js';

export const UPGRADE_DEFS = [
  { id: 'handSize', kind: 'structural', name: '+1 Hand size', emoji: '🖐️',
    desc: 'One more tile in your hand, every page.' },
  { id: 'discard', kind: 'structural', name: '+1 Discard', emoji: '♻️',
    desc: 'One more discard, every page.' },
  { id: 'patronSeat', kind: 'structural', name: '+1 Patron seat', emoji: '💺',
    desc: 'Room for one more patron.' },
  { id: 'workbenchSlot', kind: 'structural', name: '+1 Workbench slot', emoji: '🧰',
    desc: 'Room for one more sundry.' },
  ...Object.keys(COLOURS).map(colour => ({
    id: colour, kind: 'paint', colour,
    name: `${COLOURS[colour].label} paint`,
    desc: `Paints ${PAINT_PER_POT} unpainted letters ${COLOURS[colour].label}.`,
  })),
  // Says plainly that it is stock and not a gift: taking this over a hand size
  // with an empty purse should be a decision, not a surprise.
  { id: 'blackmarket', kind: 'blackmarket', name: 'The Black Market', emoji: '🕯️',
    endless: true,
    desc: `A door in the alley, open once before the fair. ${BLACK_TILE_OFFERS} tiles — `
        + `rare metals and punctuation among them — ${BLACK_PATRON_OFFERS} rare patrons, and `
        + `tools no stall will sell. Everything at the alley's price.` },
];

export const upgradeById = id => UPGRADE_DEFS.find(d => d.id === id);
