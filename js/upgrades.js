// The Colophon's roster — permanent picks offered when a chapter clears.
// kind: 'structural' — a lasting bonus, tracked by upgradeCounts and read
//                       back by the effective-* getters in state.js.
//       'paint'       — an immediate one-off, same effect as a draft paint pot.

import { COLOURS, colourDesc, PAINT_PER_POT } from './constants.js';

export const UPGRADE_DEFS = [
  { id: 'handSize', kind: 'structural', name: '+1 Hand size', emoji: '🖐️',
    desc: 'Draw one more tile to your rack, every page, for the rest of the run.' },
  { id: 'discard', kind: 'structural', name: '+1 Discard', emoji: '♻️',
    desc: 'One more discard every page, for the rest of the run.' },
  { id: 'patronSeat', kind: 'structural', name: '+1 Patron seat', emoji: '💺',
    desc: 'Room for one more patron at your table, for the rest of the run.' },
  { id: 'workbenchSlot', kind: 'structural', name: '+1 Workbench slot', emoji: '🧰',
    desc: 'Room for one more sundry on your workbench, for the rest of the run.' },
  ...Object.keys(COLOURS).map(colour => ({
    id: colour, kind: 'paint', colour,
    name: `${COLOURS[colour].label} paint`,
    desc: `Paints ${PAINT_PER_POT} random unpainted letters ${COLOURS[colour].label} — same as a draft pot. ${colourDesc(colour)}`,
  })),
];

export const upgradeById = id => UPGRADE_DEFS.find(d => d.id === id);
