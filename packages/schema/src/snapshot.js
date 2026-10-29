// The snapshot envelope, version 15 (ADR 0053): a version, the frame it was taken at, and the simulation's own data.
// The data's inner structure belongs to the simulation and changes together with SNAPSHOT_VERSION (version 2: units
// carry their base attributes, buffs, route state and skill; version 3: their element values, buffs a tag and a counter;
// version 4: units the cost they paid, players their cards; version 5: units their swing, the world its projectiles; version 6: players their revival and downs; version 7: their cost requests; version 8: the waves' progress, the predefined units, the result, the co-op stages, units their ability state, the bolts and explosions; version 9: projectiles their splash and aftershock; version 10: their chain; version 11: the status their hits give; version 12: whether the skill made them; version 13: operators their own attack range; version 14: projectiles a boomerang's speed back and whether it is on its way back; version 15: devices among the units, with their predefined unit's alias; version 16: a device's side; version 17: 堡垒守御's progress, a facility's level and a builder's work; version 18: the enemies brought in to appear later, a card the enemy that devoured its operator; version 19: a seat's 轰隆隆先生 cards — copies held, the frames they return, devices waiting to trigger; version 20: units a ball's physics and what it summed toward its kick and a 守门位's block, players the balls their goalkeepers caught, the world 阵地足球's progress, a 锦标 penalty shootout and a ball's countdown: 足球-2, 足球-3, 足球-6, 足球-13, 足球-14, 锦标-4).
import { isRecord, isInt, keyProblem } from './checks.js';
import { MAX_FRAME } from './protocol.js';

export const SNAPSHOT_VERSION = 20;

/** @typedef {{ v: number, frame: number, data: Record<string, unknown> }} Snapshot */

/** @param {unknown} s @returns {string | null} why the envelope is malformed, or null */
export function snapshotProblem(s) {
  if (!isRecord(s)) return 'snapshot is not an object';
  return keyProblem(s, ['v', 'frame', 'data'])
    ?? (s.v !== SNAPSHOT_VERSION ? `snapshot version ${String(s.v)}, expected ${SNAPSHOT_VERSION}` : null)
    ?? (!isInt(s.frame, 0, MAX_FRAME) ? 'snapshot.frame out of range' : null)
    ?? (!isRecord(s.data) ? 'snapshot.data is not an object' : null);
}
