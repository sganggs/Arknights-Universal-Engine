// The render state, version 7 (ADR 0053; version 2 adds each unit's skill, version 3 its statuses, version 4 its element, version 5 the unit kind DEVICE,
// version 6 a 傀儡师's form, version 7 an enemy's left or right): one Float64Array per simulated frame,
// transferred from the worker to the main thread without a copy. Layout: the header, then each player's fields, then
// each unit's fields.
// Positions are in tile coordinates of the level: x = column, y = row (row 0 the nearest), z = the height level of the
// tile under the unit (0 ground, 1 high ground); the renderer turns them into world coordinates. `owner` is the player
// index of an operator, −1 for enemies and devices. `sp` is the unit's SP (−1 without a skill), `spCost` what one use takes, `skill`
// the skill's state (SKILL_STATE), `skillLeft` the frames left of a running skill's duration (−1 for none), `status`
// the statuses it has (STATUS_BIT, or-ed); `element` its 当前损伤元素 (ELEMENT; NONE when every element value is full),
// `ep` that element's value as a share of the maximum — while a burst locks it, the share of the burst gone by —, and
// `burst` 1 during a burst; `form` a 傀儡师's form (FORM: its own, switching to its 替身, the 替身, switching back; 0 for any other
// unit); `lr` an enemy's left or right facing in the simulation (敌能-90: −1 left, 1 right; 0 for a unit that is not an enemy).

export const VIEW_VERSION = 7;

/** The header fields, in order. */
export const VIEW_HEADER = Object.freeze(['version', 'frame', 'units', 'players']);
/** Each player's fields, in order. */
export const VIEW_PLAYER = Object.freeze(['life', 'cost']);
/** Each unit's fields, in order. */
export const VIEW_UNIT = Object.freeze(['id', 'kind', 'owner', 'x', 'y', 'z', 'dir', 'hp', 'maxHp', 'anim', 'sp', 'spCost', 'skill', 'skillLeft', 'status', 'element', 'ep', 'burst', 'form', 'lr']);
/** A 傀儡师's form in the render state (职业-15): its own, switching to its 替身, the 替身, switching back. */
export const FORM = Object.freeze({ OWN: 0, SWITCH_IN: 1, DOLL: 2, SWITCH_OUT: 3 });

/** Unit kinds: a device is a level's predefined unit on our side (装置-1). */
export const KIND = Object.freeze({ OPERATOR: 0, ENEMY: 1, DEVICE: 2 });
/** What a unit is doing, for the renderer's animation choice. */
export const ANIM = Object.freeze({ IDLE: 0, MOVE: 1, ATTACK: 2, DIE: 3 });
/** A unit's skill: none, gathering SP, ready to start, running (a next-attack skill waiting for its attack counts as running). */
export const SKILL_STATE = Object.freeze({ NONE: 0, CHARGING: 1, READY: 2, RUNNING: 3 });
/** Operator facing: the four deploy directions. */
export const DIR = Object.freeze({ RIGHT: 0, UP: 1, LEFT: 2, DOWN: 3 });
/** A unit's 当前损伤元素 in the render state: none, or the elements in the order of their ids 1…5 (元素-1). */
export const ELEMENT = Object.freeze({ NONE: 0, SANITY: 1, WATER: 2, FIRE: 3, DARK: 4, ANGER: 5 });
/** The statuses a unit shows (the render state's `status`, or-ed bits). */
export const STATUS_BIT = Object.freeze({
  stun: 1, freeze: 2, sleep: 4, cold: 8, silence: 16, sluggish: 32, fragile: 64, weaken: 128, fear: 256, levitate: 512, root: 1024, invincible: 2048,
});
/** The shown statuses that keep an operator from starting its skill (技能-3; 界面-14): stunned, frozen, asleep, levitated, silenced. */
export const NO_SKILL = STATUS_BIT.stun | STATUS_BIT.freeze | STATUS_BIT.sleep | STATUS_BIT.levitate | STATUS_BIT.silence;

/** @typedef {{ life: number, cost: number }} ViewPlayer */
/**
 * @typedef {{ id: number, kind: number, owner: number, x: number, y: number, z: number, dir: number, hp: number, maxHp: number, anim: number,
 *   sp: number, spCost: number, skill: number, skillLeft: number, status: number, element: number, ep: number, burst: number, form?: number, lr?: number }} ViewUnit
 */
/** @typedef {{ frame: number, players: ViewPlayer[], units: ViewUnit[] }} View */

/** The length in numbers of a view. @param {number} units @param {number} players */
export function viewLength(units, players) {
  return VIEW_HEADER.length + players * VIEW_PLAYER.length + units * VIEW_UNIT.length;
}

/**
 * Writes a view; returns the array (a new one when `out` is missing or too short).
 * @param {View} view @param {Float64Array} [out] @returns {Float64Array}
 */
export function writeView(view, out) {
  const n = viewLength(view.units.length, view.players.length);
  const a = out && out.length >= n ? out : new Float64Array(n);
  let i = 0;
  for (const v of [VIEW_VERSION, view.frame, view.units.length, view.players.length]) a[i++] = v;
  for (const p of view.players) for (const k of VIEW_PLAYER) a[i++] = p[/** @type {keyof ViewPlayer} */ (k)];
  for (const u of view.units) for (const k of VIEW_UNIT) a[i++] = u[/** @type {keyof ViewUnit} */ (k)] ?? 0;
  return a;
}

/** @template T @param {Float64Array} a @param {number} at @param {readonly string[]} fields @returns {T} */
function record(a, at, fields) {
  /** @type {Record<string, number>} */
  const r = {};
  fields.forEach((k, j) => { r[k] = a[at + j]; });
  return /** @type {T} */ (r);
}

/**
 * Reads a view written by writeView.
 * @param {Float64Array} a @returns {View}
 */
export function readView(a) {
  if (a[0] !== VIEW_VERSION) throw new RangeError(`render state version ${a[0]}, expected ${VIEW_VERSION}`);
  const frame = a[1], units = a[2], players = a[3];
  if (a.length < viewLength(units, players)) throw new RangeError('render state shorter than its header says');
  const p0 = VIEW_HEADER.length, u0 = p0 + players * VIEW_PLAYER.length;
  return {
    frame,
    players: Array.from({ length: players }, (_, i) => record(a, p0 + i * VIEW_PLAYER.length, VIEW_PLAYER)),
    units: Array.from({ length: units }, (_, i) => record(a, u0 + i * VIEW_UNIT.length, VIEW_UNIT)),
  };
}
