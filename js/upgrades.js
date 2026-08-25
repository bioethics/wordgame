// The Colophon's roster — permanent picks offered when a chapter clears.
// kind: 'structural' — a lasting bonus, tracked by upgradeCounts and read back
//                      by the effective-* getters in state.js.
//       'paint'      — an immediate one-off: PAINT_PER_POT tiles take the colour.

import { COLOURS, PAINT_PER_POT } from './constants.js';

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
];

export const upgradeById = id => UPGRADE_DEFS.find(d => d.id === id);
