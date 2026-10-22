// Cold-cache stand-in for Stronghold's shared/plugins/officialBounds.js (兼容-2). The real module imports no engine
// code, but visit, appendFactionBounds, boundMessage and exceed are outside the source limits, so the mapping loads
// this instead. Nothing installs a vanilla snapshot here: every read is the real module's cache-miss — no official
// maximum, and dataBound of that is the floor. steps.js and textNumber.js call officialPositiveMin and officialTextMax
// at use time, which is what a cold cache returns.
import { dataBound } from './limits.js';

/** No bounds snapshot is installed (the real officialBoundsReady before remember or install). */
export function officialBoundsReady() {
  return false;
}

/** No cached official blackboard maximum. @param {unknown} key @returns {null} */
export function officialBbMax(key) {
  void key;
  return null;
}

/** No cached official loop-field maximum. @param {unknown} name @returns {null} */
export function officialFieldMax(name) {
  void name;
  return null;
}

/** Runtime cap for a blackboard key: the floor, the real bbCap when officialBbMax is null. @param {unknown} key */
export function bbCap(key) {
  return dataBound(officialBbMax(key));
}

/** Runtime cap for a documented loop field: the floor. @param {unknown} name */
export function fieldCap(name) {
  return dataBound(officialFieldMax(name));
}

/** No cached description-text maximum. @param {unknown} patternId @returns {null} */
export function officialTextMax(patternId) {
  void patternId;
  return null;
}

/** No cached positive minimum, so stepOf stays on its cold-cache branch. @param {unknown} key */
export function officialPositiveMin(key) {
  void key;
  return 0;
}
