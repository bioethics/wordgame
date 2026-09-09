// THE PROSPECTUS — the sheet a run opens on.
//
// A prospectus is what a printer put out before a book existed: this is the
// edition we mean to print, this is what it will look like, subscribe if you
// like the sound of it. Three things are settled here before the first tile is
// drawn — the board's LOOK, the room's THEME, and the run's DIFFICULTY.
//
// The first two are preferences: they live in `settings`, are changeable at any
// point from Settings, and belong to the player rather than the run. The third
// belongs to the RUN, is fixed once the first page is dealt, and is asked here
// because there is nowhere else it can honestly be asked. Both are shown
// together anyway, because the moment before a run starts is the moment a
// player is actually thinking about how they want to play.
//
// The Testing Chamber opens FROM this sheet rather than in front of it, and
// says what it is on the way in: it is a playtest bench, and somebody who
// pressed "New run" did not ask for one.
//
// State only. The sheet's face is renderStart in js/sheets.js, and the flow —
// beginning the run, walking through to the chamber and back — is main.js's.

import { state, settings, saveSettings } from './state.js';
import { difficultyKey, quotaFor } from './constants.js';

// Nothing else to remember: every pick is written straight through to the run
// or to settings as it is made, so a reload comes back to the same sheet with
// the same things chosen. `state.inStart` is what the save carries.
export const start = { open: false };

export function openStart() {
  start.open = true;
  state.inStart = true;
}

export function closeStart() {
  start.open = false;
  state.inStart = false;
}

// Set on the run AND remembered for the next one — a player who wants the
// gentler book usually wants it again, and being asked afresh every time is the
// sort of politeness nobody thanks you for.
export function setDifficulty(id) {
  const key = difficultyKey(id);
  state.difficulty = key;
  settings.difficulty = key;
  saveSettings();
  // The opening page is already counted out behind this sheet, and its quota
  // was reckoned on whatever the run opened with. Re-reckon it here so the
  // board under the prospectus is never showing a target the pick has just
  // changed; startPage settles it in full — relief, the editor's share — when
  // the run actually begins.
  state.quota = quotaFor(state.chapter, state.page, key);
  return key;
}
