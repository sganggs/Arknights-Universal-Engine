// Buffs (docs/spec/status.md 状态-1…状态-4): plain data in acquisition order. Adding follows the same-name rules;
// every frame each buff's time runs down by its decay rate and its triggers advance; at 0 it expires. A buff's
// behaviour (what a trigger or the expiry does) comes from a table by its key — or by the behaviour key it names —, never
// from the buff itself (ADR 0054).
import { statsOf, maxHpOf } from './attrs.js';

/** @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Buff} Buff @typedef {import('./types.js').World} World */

/**
 * A hit a buff's 伤判 behaviour sees (伤害-8). `amount` passed beside it is what this buff has left; `dmg.amount` is the
 * hit's base, before defences and 伤判. `credit` is the source the kill is counted for, also when the events see none.
 * @typedef {{ dmg: { amount: number, type?: string, tags?: readonly string[] }, src: Unit | null, credit: Unit | null, tags: readonly string[], c?: import('./types.js').Content }} TakeHit
 */

/**
 * What a buff does on its triggers, when it ends, and during its own 伤判 (伤害-8), by key. Its expiry gets the content,
 * so damage it deals takes the content's part of the path (tags, buff behaviours) as the hits of abilities do.
 * @typedef {{ tick?: (w: World, u: Unit, b: Buff) => void, expire?: (w: World, u: Unit, b: Buff, c?: import('./types.js').Content) => void, take?: (w: World, u: Unit, b: Buff, amount: number, hit: TakeHit) => number }} Behavior
 */

/** @typedef {Partial<Buff> & { key: string }} BuffInit */

/** Every field a buff may leave out, with its value then (状态-1), in the order a buff holds them. */
const DEFAULTS = Object.freeze({
  src: -1, rule: /** @type {Buff['rule']} */ ('queue'), value: 0, left: -1, every: 0, fixed: false, resist: false, decay: 1, prio: 0,
  shield: 0, shieldHits: 0, shieldType: '', n: 0, tag: '', act: '',
});

/**
 * A buff with every field set (状态-1). `left` and `every` are frames; no `left` means no end.
 * @param {BuffInit} o @returns {Buff}
 */
export function makeBuff(o) {
  if (o.every !== undefined && !(Number.isInteger(o.every) && o.every >= 0)) throw new RangeError(`makeBuff: every must be whole frames ≥ 0, got ${o.every}`);
  /** @type {Record<string, unknown>} */
  const d = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (o[/** @type {keyof BuffInit} */ (k)] !== undefined) d[k] = o[/** @type {keyof BuffInit} */ (k)];
  const stacks = Math.max(1, o.stacks ?? 1);
  return /** @type {Buff} */ ({
    key: o.key, ...d, mods: { ...o.mods }, flags: { ...o.flags }, stacks, maxStacks: Math.max(stacks, o.maxStacks ?? 1), acc: 0,
    // Not a default: only a stealth source names its own delay (索敌-2). Stamping it on every buff would change every hash.
    ...(o.restore !== undefined ? { restore: o.restore } : {}),
  });
}

/**
 * After a change to a unit's buffs: when its maximum HP changed, its HP keeps the same ratio to it (属性-4).
 * @param {Unit} u
 */
export function refreshHp(u) {
  const max = maxHpOf(u);
  if (max === u.maxHp) return;
  if (u.hp > 0) u.hp = u.hp * (max / u.maxHp);
  u.maxHp = max;
}

/**
 * Sets a unit's base maximum HP and the cached maximum, without rescaling current HP (敌能-45). The cache has to move
 * with the base: the next buff refresh would otherwise scale a still-positive HP by the new maximum over the old one.
 * @param {Unit} u @param {number} hp
 */
export function setBaseMaxHp(u, hp) {
  u.base.maxHp = hp;
  u.maxHp = maxHpOf(u);
}

/** The longer of two remaining times, −1 (no end) being the longest. @param {number} a @param {number} b */
const longer = (a, b) => (a < 0 || b < 0 ? -1 : Math.max(a, b));

/**
 * Merges `b` into the unit's buff of the same key under rule "stack" or "extend" (状态-2). Returns the merged buff, or
 * null when there is none to merge into.
 * @param {Unit} u @param {Buff} b @returns {Buff | null}
 */
function merge(u, b) {
  const old = u.buffs.find((x) => x.key === b.key);
  if (!old) return null;
  if (b.rule === 'stack') {
    old.maxStacks = Math.max(old.maxStacks, b.maxStacks);
    old.stacks = Math.min(old.stacks + b.stacks, old.maxStacks);
    old.left = b.left;
  } else old.left = longer(old.left, b.left);
  old.mods = b.mods;
  old.flags = b.flags;
  return old;
}

/**
 * Gives a unit a buff (状态-2). Rules "queue" and "max" keep every buff of a key and let one take effect; "stack" and
 * "extend" merge into the one there is; "independent" keeps at most maxStacks of a key, dropping the earliest.
 * Returns the buff now in the list.
 * @param {Unit} u @param {Buff} b @returns {Buff}
 */
export function addBuff(u, b) {
  const merged = b.rule === 'stack' || b.rule === 'extend' ? merge(u, b) : null;
  if (merged) {
    refreshHp(u);
    return merged;
  }
  if (b.rule === 'independent') {
    const same = u.buffs.filter((x) => x.key === b.key);
    if (same.length >= b.maxStacks) u.buffs.splice(u.buffs.indexOf(same[0]), 1);
  }
  u.buffs.push(b);
  refreshHp(u);
  return b;
}

/**
 * Replaces a buff's strength and modifiers (a behaviour whose effect changes over time, 元素-4); HP keeps its ratio
 * (属性-4).
 * @param {Unit} u @param {Buff} b @param {number} value @param {Record<string, number>} mods
 */
export function retune(u, b, value, mods) {
  b.value = value;
  b.mods = { ...mods };
  refreshHp(u);
}

/** Sets the frames a buff has left (content that changes it, 状态-1): whole frames, −1 for no end. @param {Buff} b @param {number} frames */
export function setLeft(b, frames) {
  b.left = frames < 0 ? -1 : Math.max(0, Math.round(frames));
}

/**
 * Sets a buff's layers (content that changes them, 状态-2): at least 1, at most its maximum; the holder's HP keeps its
 * ratio (属性-4).
 * @param {Unit} u @param {Buff} b @param {number} n
 */
export function setStacks(u, b, n) {
  b.stacks = Math.max(1, Math.min(b.maxStacks, Math.round(n)));
  refreshHp(u);
}

/** Takes one layer of a stacking buff; the last one removes it (状态-8). @param {Unit} u @param {Buff} b */
export function consumeStack(u, b) {
  if (b.stacks > 1) b.stacks--;
  else removeBuff(u, b);
}

/** Counts towards a behaviour's own goal (its counter `n`). @param {Buff} b @param {number} d */
export function count(b, d) {
  b.n += d;
}

/** Notes the frame of a tracked event on a buff that keeps it (its counter `n`; the stats do not change). @param {Buff} b @param {number} frame */
export function stamp(b, frame) {
  b.n = frame;
}

/**
 * Removes buffs by key, or one buff; returns how many were removed. Removal is not expiry: no behaviour runs.
 * @param {Unit} u @param {string | Buff} which
 */
export function removeBuff(u, which) {
  const before = u.buffs.length;
  u.buffs = u.buffs.filter((b) => (typeof which === 'string' ? b.key !== which : b !== which));
  if (u.buffs.length !== before) refreshHp(u);
  return before - u.buffs.length;
}

/**
 * Removes buffs of one key that carry `tag` (敌能-72). Other buffs of that key stay. Removal is not expiry.
 * @param {Unit} u @param {string} key @param {string} tag @returns {number}
 */
export function removeTagged(u, key, tag) {
  const before = u.buffs.length;
  u.buffs = u.buffs.filter((b) => b.key !== key || b.tag !== tag);
  if (u.buffs.length !== before) refreshHp(u);
  return before - u.buffs.length;
}

/**
 * A buff's decay rate this frame (状态-3): its own multiplier, times the 综合抵抗衰减率 1 / 一减状态抵抗率 for a
 * resistible status.
 * @param {Buff} b @param {number} statusRes the holder's 一减状态抵抗率 (≥ 0.001)
 */
export const decayRate = (b, statusRes) => (b.resist ? b.decay / statusRes : b.decay);

/**
 * Advances a buff's triggers by `step` frames of progress and runs each trigger that comes due (状态-4).
 * @param {World} w @param {Unit} u @param {Buff} b @param {number} step @param {Behavior | undefined} beh
 */
function advance(w, u, b, step, beh) {
  b.acc += step;
  while (b.acc >= b.every) {
    b.acc -= b.every;
    beh?.tick?.(w, u, b);
    if (!u.buffs.includes(b)) return;
  }
}

/**
 * One frame of a unit's buffs (状态-3, 状态-4), in acquisition order: triggers advance by the decay rate (by 1 when
 * fixed), the time left drops by it, and a buff at 0 or below expires — it leaves the list, then its expiry runs.
 * @param {World} w @param {Unit} u @param {Record<string, Behavior>} behaviors @param {import('./types.js').Content} [c]
 */
export function tickUnitBuffs(w, u, behaviors, c) {
  if (u.buffs.length === 0) return;
  const list = [...u.buffs], statusRes = list.some((b) => b.resist) ? statsOf(u).statusRes : 1;
  let changed = false;
  for (const b of list) {
    if (!u.buffs.includes(b)) continue;
    const rate = decayRate(b, statusRes), act = b.act || b.key, beh = Object.hasOwn(behaviors, act) ? behaviors[act] : undefined;
    if (b.every > 0) advance(w, u, b, b.fixed ? 1 : rate, beh);
    if (b.left < 0 || !u.buffs.includes(b)) continue;
    b.left -= rate;
    if (b.left > 0) continue;
    u.buffs.splice(u.buffs.indexOf(b), 1);
    changed = true;
    beh?.expire?.(w, u, b, c);
  }
  if (changed) refreshHp(u);
}

/**
 * One frame of every unit's buffs, units in creation order (帧-1).
 * @param {World} w @param {Record<string, Behavior>} [behaviors] @param {import('./types.js').Content} [c]
 */
export function tickBuffs(w, behaviors = {}, c) {
  for (const u of [...w.units]) if (w.units.includes(u)) tickUnitBuffs(w, u, behaviors, c);
}
