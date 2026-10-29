// 萨卡兹骸骨鞭笞者 / 拷打者 and 新生血裔's share of that summon (docs/spec/foes.md 敌能-63).
// `Attack` and `Summon` are shared names (固海凿石者's `Attack` is stonecutter.js's, dispatched here). Only the
// blackboards below are this family; any other shape stays uncovered (关卡-2) and these hooks do nothing with it. `Passive` (血珀 and R-11) lives in passive.js, so the name has one owner.
// They act only through the context (ADR 0055).

import { guardShape, digIn } from './stonecutter.js';
import { stonesShape, broodShape, catapultAttack } from './catapult.js';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */
/** @typedef {import('@aue/sim').FoeContext} FoeContext */

/** 鞭笞者 / 拷打者 `Attack`: the half-strength shot and the leave aura. `range_radius` is the aura, not the shot. */
const ATTACK_KEYS = new Set(['attack@ranged_atk_scale', 'range_radius', 'hp_ratio', 'atk', 'max_stack_cnt']);
/** A death summon of only a count and a key. 骸骨卫士 adds `attack_speed` and `duration` and is not this. */
const SUMMON_KEYS = new Set(['cnt', 'enemy_key']);

/** One permanent 直接乘算 layer (属性-1 ③). Stacks sum, so n layers are ×(1 + atk·n), not 1.1ⁿ. */
const WHIP_ATK = 'whipAtk';

/** @param {Record<string, unknown>} bb @param {ReadonlySet<string>} keys */
function exactKeys(bb, keys) {
  const got = Object.keys(bb);
  if (got.length !== keys.size) return false;
  for (const k of got) if (!keys.has(k)) return false;
  return true;
}

/** @param {unknown} n */
const num = (n) => typeof n === 'number';

/** @param {Record<string, unknown>} bb */
function attackShape(bb) {
  if (!exactKeys(bb, ATTACK_KEYS)) return false;
  for (const k of ATTACK_KEYS) if (!num(bb[k])) return false;
  return true;
}

/** @param {Record<string, unknown>} bb */
function summonShape(bb) {
  if (!exactKeys(bb, SUMMON_KEYS) || !num(bb.cnt)) return false;
  return typeof bb.enemy_key === 'string' && bb.enemy_key !== '';
}

/**
 * Whether a talent of this name, with this blackboard, is this family (敌能-63). Any other name, including `Passive`,
 * is not this family's concern: the caller still asks the other owners. `passiveOwns` is the one check for `Passive`.
 * @param {string} name @param {Record<string, unknown>} bb
 */
export function whipOwns(name, bb) {
  if (name === 'Attack') return attackShape(bb) || guardShape(bb) || stonesShape(bb) || broodShape(bb);
  if (name === 'Summon') return summonShape(bb);
  return true;
}

/** @param {FoeContext} ctx */
const bbOf = (ctx) => /** @type {Record<string, unknown>} */ (ctx.bb);

/**
 * Centres, no collider padding (敌能-63). The attack's +0.25 belongs to 敌人攻击-1, not to this aura.
 * @param {number} ax @param {number} ay @param {number} bx @param {number} by @param {number} r
 */
function near(ax, ay, bx, by, r) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy <= r * r;
}

/** One heal and one layer per leaver inside the aura, including once the layer cap is full (敌能-63). @param {FoeContext} ctx */
function onLeave(ctx) {
  const bb = bbOf(ctx);
  if (!attackShape(bb)) return;
  const self = ctx.self;
  const radius = /** @type {number} */ (bb.range_radius);
  const heal = ctx.stats(self).maxHp * /** @type {number} */ (bb.hp_ratio);
  const cap = /** @type {number} */ (bb.max_stack_cnt);
  const atk = /** @type {number} */ (bb.atk);
  for (const u of ctx.departed()) {
    if (u.id === self.id || !near(u.x, u.y, self.x, self.y, radius)) continue;
    ctx.heal(self, heal);
    ctx.addBuff(self, { key: WHIP_ATK, rule: 'stack', stacks: 1, maxStacks: cap, mods: { atkPct: atk } });
  }
}

/**
 * 未被阻挡时 the shot is × `attack@ranged_atk_scale`. Blocked, the engine already hits only the blocker at ×1. 固海凿石者's
 * shape digs in before its first attack (敌能-87, stonecutter.js); 自制投石机's and 投嗣育母's are catapult.js's (敌能-106).
 */
const Attack = Object.freeze(/** @type {FoeBehavior} */ ({
  targets: (ctx, cands) => catapultAttack.targets?.(ctx, cands) ?? cands,
  cancelHit: (ctx, t) => catapultAttack.cancelHit?.(ctx, t) ?? false,
  landed: (ctx, t, how) => { catapultAttack.landed?.(ctx, t, how); },
  tick: (ctx) => { onLeave(ctx); },
  attack: (ctx, mods) => {
    const bb = bbOf(ctx);
    if (guardShape(bb)) return digIn(ctx, mods);
    if (!attackShape(bb) || ctx.blocked) return mods;
    return { ...mods, scale: mods.scale * /** @type {number} */ (bb['attack@ranged_atk_scale']) };
  },
}));

/** Death, including a fall: `cnt` of `enemy_key` on its own route, inside the 0.2 square (敌能-22, bound 0.1). */
const Summon = Object.freeze(/** @type {FoeBehavior} */ ({
  death: (ctx) => {
    const bb = bbOf(ctx);
    if (!summonShape(bb)) return;
    ctx.summon(/** @type {string} */ (bb.enemy_key), {
      cnt: /** @type {number} */ (bb.cnt), bound: 0.1, tile: true, delay: 0,
    });
  },
}));

/** @type {Readonly<Record<string, FoeBehavior>>} */
export const whipBehaviors = Object.freeze({ Attack, Summon });
