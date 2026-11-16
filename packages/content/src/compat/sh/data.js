// Stands in for Stronghold's server/data.js (兼容-2, 兼容-7): the game data its content reads — the records of its bonds,
// equipment, 特质, strategies and effects — is Stronghold's own data (its data/*.json, from the same checkout as the
// content), which the host gives once (setShData) before any content reads it. Without it, reading it is a gap.
import { CompatGap } from './gap.js';

/** @type {Record<string, any> | null} */
let DATA = null;

/** Gives the data the content reads (Stronghold's data/*.json by basename), or takes it back (null). @param {Record<string, any> | null} data */
export function setShData(data) { DATA = data; }

/** The data the content reads. @returns {Record<string, any>} */
export function getData() {
  if (!DATA) throw new CompatGap('data.getData');
  return DATA;
}

/** The data, or null when none was given (the battle's own `data.raw`). */
export const shData = () => DATA;
