// Blocking (docs/spec/blocking.md 阻挡-1…阻挡-4): an operator stops the enemies that come within its block radius, as
// many as its block count holds; a blocked enemy stays where it is until it is released.
import { secondsToFrames } from '@aue/math';
import { turnLR } from './lr.js';
import { KIND } from '@aue/schema';
import { statsOf } from './attrs.js';
import { tileAt } from './level.js';
import { tileOf } from './body.js';
import { BLOCK_RADIUS_SQ } from './constants.js';
import { friendly } from './targeting.js';
import { sameGround } from './works.js';
import { makeBuff, addBuff, setLeft, removeBuff } from './buffs.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Content} Content */
/** @typedef {import('./attrs.js').Stats} Stats */

/** Whether a unit can block now (阻挡-2): not 晕眩, not 沉睡. @param {Stats} s */
export const canBlock = (s) => !(s.flags.stun || s.flags.sleep || s.flags.sidelined);

/** Whether an enemy can be blocked now (阻挡-1): not 无法被阻挡, 恐惧, 浮空 or 沉睡. @param {Stats} s */
export const blockable = (s) => !(s.flags.unblockable || s.flags.fear || s.flags.attract || s.flags.levitate || s.flags.sleep);

/** The enemies a unit blocks, in the order they were blocked (阻挡-3). @param {World} w @param {Unit} op @returns {Unit[]} */
export function heldBy(w, op) {
  const list = w.units.filter((e) => e.kind === KIND.ENEMY && e.blockedBy === op.id);
  return list.sort((a, b) => a.blockedAt - b.blockedAt);
}

/** The block weight (阻挡数消耗) a unit holds: the sum of its blocked enemies' block counts (阻挡-2). @param {World} w @param {Unit} op */
export const blockLoad = (w, op) => heldBy(w, op).reduce((n, e) => n + statsOf(e).blockCnt, 0);

/**
 * Whether a unit blocks enemies of this kind of motion (阻挡-2): one that took off (起飞, flag `liftoff`) flying enemies
 * only, from any tile; otherwise flying enemies only with `blockFly`, ground enemies from a ground tile (not high
 * ground) that every unit may pass.
 * @param {Content} c @param {Unit} op @param {Stats} os @param {boolean} flying
 */
function blocksMotion(c, op, os, flying) {
  if (os.flags.liftoff) return flying;
  if (flying) return !!os.flags.blockFly;
  const t = tileAt(c.level, op.y, op.x);
  return !!t && t.height !== 'HIGHLAND' && t.passable === 'ALL';
}

/**
 * Content makes an enemy blocked by a unit at once (阻挡-1): one on the field with HP left that nothing blocks yet — no
 * block radius or count is checked; 阻挡-3 then releases it as any other. Whether `by` blocks it now.
 * @param {World} w @param {Unit} e @param {Unit} by
 */
export function blockBy(w, e, by) {
  if (e.kind !== KIND.ENEMY || e.hp <= 0 || !w.units.includes(e) || !w.units.includes(by)) return false;
  if (e.blockedBy < 0) {
    e.blockedBy = by.id;
    e.blockedAt = w.frame;
    turnLR(e, by.x - e.x);
  }
  return e.blockedBy === by.id;
}

/** 3 seconds, in frames (索敌-2, 时间-2): the delay when a stealth source does not name its own. */
const STEALTH_RESTORE = secondsToFrames(3);

/** The frames a stealth source waits after the block ends (索敌-2): its `restore`, or 3 seconds. @param {import('./types.js').Buff} b */
const restoreFrames = (b) => (typeof b.restore === 'number' ? b.restore : STEALTH_RESTORE);

/**
 * Starts each stealth source's restore window (索敌-2). A source with no positive delay drops its window, and that pass
 * is second so it wins when two sources share a key — one source still outside a window keeps 隐匿.
 * @param {Unit} e
 */
function armStealth(e) {
  if (e.kind !== KIND.ENEMY || e.hp <= 0) return;
  const sources = e.buffs.filter((b) => b.flags.stealth);
  for (const b of sources) {
    const frames = restoreFrames(b);
    if (!(frames > 0)) continue;
    const key = `stealthOff:${b.key}`, off = e.buffs.find((o) => o.key === key);
    if (off) setLeft(off, frames);
    else addBuff(e, makeBuff({ key, flags: { stealthOff: true }, left: frames }));
  }
  for (const b of sources) if (!(restoreFrames(b) > 0)) removeBuff(e, `stealthOff:${b.key}`);
}

/**
 * Releases an enemy (阻挡-3). Letting go of a block — and only that — starts its 隐匿 windows (索敌-2), so retreat,
 * a fallen blocker and a kit's unblock all do.
 * @param {Unit} e
 */
export function release(e) {
  const held = e.blockedBy >= 0;
  e.blockedBy = -1;
  e.blockedAt = -1;
  if (held) armStealth(e);
}

/**
 * A unit deployed this frame onto the tile of an enemy it blocks puts the enemy on the circle of radius 0.5 around it,
 * along the line from its centre through the enemy; an enemy within 0.00001 of the centre stays (阻挡-4).
 * @param {World} w @param {Unit} op @param {Unit} e
 */
function deployOffset(w, op, e) {
  const [r, c] = tileOf(e);
  if (op.born !== w.frame || r !== op.y || c !== op.x) return;
  const dx = e.x - op.x, dy = e.y - op.y, d = Math.sqrt(dx * dx + dy * dy);
  if (d < 1e-5) return;
  e.x = op.x + (dx / d) * 0.5;
  e.y = op.y + (dy / d) * 0.5;
}

/**
 * Whether `op` may take `e` now (阻挡-2, 阻挡-1): it is alive and can block, it is not refusing new contact
 * (`noNewBlock`), it blocks this motion, and its block count holds the enemy's weight on top of what it already holds.
 * A unit with `noNewBlock` keeps enemies it already blocks; 迷狂牢笼 judges new blocks when it is created or refreshed
 * (character_table token_10055_phatm2_mndclv.description), and content assigns those with `blockBy`.
 * @param {World} w @param {Content} c @param {Unit} op @param {Stats} es
 */
function takes(w, c, op, es) {
  const os = statsOf(op), cap = blockCap(c, op);
  if (op.hp <= 0 || !canBlock(os) || os.flags.noNewBlock || !blocksMotion(c, op, os, es.flying) || cap <= 0) return false;
  return blockLoad(w, op) + es.blockCnt <= cap;
}

/**
 * The block count a unit has now (阻挡-2): its 阻挡数, or, while it took off, its trait's `liftoffBlock` when it has one
 * (巡空者, 职业-12).
 * @param {Content} c @param {Unit} op
 */
function blockCap(c, op) {
  const s = statsOf(op), n = s.flags.liftoff && op.kind === KIND.OPERATOR ? c.operators[op.key]?.trait?.liftoffBlock : undefined;
  return typeof n === 'number' ? n : s.blockCnt;
}

/**
 * Squared block radius of one candidate (常量-3). Ground stays 0.49999037. Flying is 0.79995137 × k², where
 * k = 1 + the summed `blockRadiusScale` additives (推断 INF-0288), at least 0: the default lower bound of 阻挡半径倍率
 * (数值范围). A negative sum shrinks the flying radius, down to nothing.
 * @param {Stats} os @param {boolean} flying
 */
function radiusSq(os, flying) {
  if (!flying) return BLOCK_RADIUS_SQ.ground;
  const scale = 1 + (os.sum.blockRadiusScale ?? 0), k = scale > 0 ? scale : 0;
  return BLOCK_RADIUS_SQ.fly * k * k;
}

/**
 * Blocks an enemy if it can be (阻挡-1): of the units that may take it and whose own block radius it is inside —
 * (dx² + dy²) < r², r² from 常量-3 for that unit — the nearest, the earliest created of equals. Returns whether the
 * enemy is blocked.
 * @param {World} w @param {Content} c @param {Unit} e
 */
export function tryBlock(w, c, e) {
  if (e.blockedBy >= 0) return true;
  const es = statsOf(e);
  if (e.hidden || e.base.neutral === true || !blockable(es)) return false;
  /** @type {Unit | null} */
  let best = null, bd = Infinity;
  for (const op of w.units) {
    if (op.kind === KIND.ENEMY || !friendly(op) || !sameGround(c, op, e)) continue;
    const dx = e.x - op.x, dy = e.y - op.y, d2 = dx * dx + dy * dy;
    if (d2 < radiusSq(statsOf(op), es.flying) && d2 < bd && takes(w, c, op, es)) { best = op; bd = d2; }
  }
  if (!best) return false;
  e.blockedBy = best.id;
  e.blockedAt = w.frame;
  turnLR(e, best.x - e.x);
  deployOffset(w, best, e);
  return true;
}

/**
 * Keeps an enemy blocked only while its blocker is on the field and can block and the enemy can be blocked (and has not
 * disappeared); otherwise releases it (阻挡-3).
 * @param {World} w @param {Unit} e
 */
export function keepOrRelease(w, e) {
  if (e.blockedBy < 0) return;
  const op = w.units.find((u) => u.id === e.blockedBy);
  if (!op || op.hp <= 0 || !canBlock(statsOf(op)) || e.hidden || !blockable(statsOf(e))) release(e);
}

/** A unit whose block count dropped below what it holds lets go of the latest blocked first (阻挡-3). @param {World} w @param {Content} c @param {Unit} op */
export function enforceCapacity(w, c, op) {
  const held = heldBy(w, op), cap = blockCap(c, op);
  let load = held.reduce((n, e) => n + statsOf(e).blockCnt, 0);
  while (load > cap && held.length) {
    const e = /** @type {Unit} */ (held.pop());
    load -= statsOf(e).blockCnt;
    release(e);
  }
}

/** Releases every enemy a unit blocks: it left the field (阻挡-3). @param {World} w @param {number} id */
export function releaseAll(w, id) {
  for (const e of w.units) if (e.blockedBy === id) release(e);
}
