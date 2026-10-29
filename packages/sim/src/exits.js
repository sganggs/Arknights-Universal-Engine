// Units that left the field, for one talent family (docs/spec/foes.md 敌能-63). The log stays absent until an ability
// asks, so a battle that never asks keeps the same state hash (同步-1 skips a key whose value is undefined).
import { KIND } from '@aue/schema';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit */

/**
 * One enemy or operator that left (敌能-63): its id, its kind, and where it stood when it was removed.
 * @typedef {{ id: number, x: number, y: number, kind: number }} Exit
 */

/**
 * Notes a leaving enemy or operator, and only once some ability has asked (敌能-63). Devices are not 敌人/干员, and
 * neither is a neutral unit: it is a camp of its own (INF-0468). A missing log is left missing.
 * @param {World} w @param {Unit} u
 */
export function noteExit(w, u) {
  if (!w.exits) return;
  if (u.kind !== KIND.ENEMY && u.kind !== KIND.OPERATOR) return;
  if (u.base.neutral === true) return;
  w.exits.push({ id: u.id, x: u.x, y: u.y, kind: u.kind });
}

/**
 * Leaves since this ability last asked (敌能-63). The first call only arms the log and parks the cursor at its end,
 * so a unit does not see leaves from before it started watching.
 * @param {World} w @param {Record<string, number>} ab @param {string} name @returns {Exit[]}
 */
export function readDeparted(w, ab, name) {
  w.exits ??= [];
  const key = `${name}.exit`;
  if (!Object.hasOwn(ab, key)) {
    ab[key] = w.exits.length;
    return [];
  }
  const from = ab[key];
  const out = w.exits.slice(from);
  ab[key] = w.exits.length;
  return out;
}
