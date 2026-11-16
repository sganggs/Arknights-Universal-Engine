// 陷落雪祀 (docs/spec/foes.md 敌能-142). Talent `Attack` of one more shape: the normal attack jumps on as an enemy's
// chain (职业-11, on our side) and every hit of it carries 寒冷; whip.js owns the name and dispatches here by the shape.
// Skill `ChainBuff` (反自然馈赠): in the attack's turn, a chain over other enemies, each taking a share of its 攻击力 as
// arts damage and gaining speed for some seconds. Only the blackboards the read page marks with `page` are these;
// 空洞雪祀 has the same keys without it and stays uncovered (关卡-2). It acts only through the context (ADR 0055).
import { disarmed } from '@aue/sim';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext @typedef {import('@aue/sim').Unit} Unit */
/** @typedef {Parameters<NonNullable<import('@aue/sim').FoeBehavior['attack']>>[1]} AttackMods */

/** The talent's keys (敌能-142): the four data numbers and `page`, the marker of the read page. */
const ATTACK_KEYS = Object.freeze(['attack@freeze', 'attack@chain.max_target', 'attack@chain.atk_scale', 'attack@projectile_range', 'page']);
/** The skill's keys (敌能-142): the seven data numbers and `page`. */
const GIFT_KEYS = Object.freeze(['duration', 'move_speed', 'attack_speed', 'chain.max_target', 'projectile_range', 'chain.atk_scale', 'atk_scale', 'page']);
/** The buff 反自然馈赠 gives (敌能-142). No other family uses the key. */
export const GIFT_BUFF = 'chainBuff';

/** Whether `bb` has exactly these keys, each a number. @param {Record<string, unknown>} bb @param {readonly string[]} keys */
const exact = (bb, keys) => Object.keys(bb).length === keys.length && keys.every((k) => typeof bb[k] === 'number');

/** 陷落雪祀's `Attack` (敌能-142). @param {Record<string, unknown>} bb */
export const snowShape = (bb) => exact(bb, ATTACK_KEYS);

/**
 * Whether a skill of this name and blackboard is this family's (关卡-2): `ChainBuff` needs its whole blackboard and the
 * page marker. `Attack` is answered by whip.js, which owns the name; any other name passes.
 * @param {string} name @param {Record<string, unknown>} bb
 */
export const snowOwns = (name, bb) => name !== 'ChainBuff' || exact(bb, GIFT_KEYS);

/**
 * The normal attack (敌能-142): an enemy's chain of `attack@chain.max_target` targets in all, each jump
 * `attack@chain.atk_scale` × the one before within `attack@projectile_range`, and `attack@freeze` s of 寒冷 on every hit.
 * @param {FoeContext} ctx @param {AttackMods} mods @returns {AttackMods}
 */
export function snowAttack(ctx, mods) {
  const bb = ctx.bb, side = /** @type {const} */ ('friendly');
  const chain = { max: bb['attack@chain.max_target'], scale: bb['attack@chain.atk_scale'], radius: bb['attack@projectile_range'], cells: null, side };
  return { ...mods, chain, hitStatus: { key: 'cold', seconds: bb['attack@freeze'] } };
}

/** Centre distance squared. @param {{ x: number, y: number }} a @param {{ x: number, y: number }} b */
const dist2 = (a, b) => (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);

/**
 * Whether its normal attack may start this frame (敌人攻击-1), the turn 反自然馈赠 takes (敌能-142; the 技能 header's
 * 「大多数技能释放会占用攻击间隔」): it can act and attack — not in 失衡, not 恐惧, no `noAttack`, not 缴械 or 强制缴械
 * (状态-12), not 战栗 while blocked —, its cooldown is out and no swing is under way.
 * @param {FoeContext} ctx
 */
function attackTurn(ctx) {
  const e = ctx.self, s = ctx.stats(e), f = s.flags;
  if (s.disabled || s.atk <= 0 || e.hidden || ctx.unbalanced || f.noAttack || disarmed(e) || f.fear || (f.disarmedCombat && ctx.blocked)) return false;
  return e.atkCd <= 0 && !e.swing;
}

/**
 * The nearest enemy to `at` within `radius` that 反自然馈赠 may pick (敌能-142): another, not neutral, on the field and
 * not disappeared (`allies`), not 孤立 (`noAllyHeal`: 「无法被同阵营选中」), not picked yet. 隐匿, 无法选中 and 无敌 keep a
 * unit only from the other side. The earlier created on a tie.
 * @param {FoeContext} ctx @param {Unit} at @param {number} radius @param {Set<number>} seen @returns {Unit | null}
 */
function nearestAlly(ctx, at, radius, seen) {
  let best = null, bestD = Infinity;
  for (const u of ctx.allies(Infinity)) {
    if (seen.has(u.id) || ctx.stats(u).flags.noAllyHeal) continue;
    const d = dist2(u, at);
    if (d <= radius * radius && d < bestD) { best = u; bestD = d; }
  }
  return best;
}

/**
 * Whom 反自然馈赠 reaches, in order (敌能-142): the nearest within its attack radius (centres, no collider), then from
 * each the nearest within `projectile_range`; `chain.max_target` at most. @param {FoeContext} ctx @returns {Unit[]}
 */
function giftTargets(ctx) {
  const bb = ctx.bb, seen = new Set([ctx.self.id]), out = [];
  for (let next = nearestAlly(ctx, ctx.self, ctx.self.base.rangeRadius, seen); next && out.length < bb['chain.max_target'];) {
    out.push(next);
    seen.add(next.id);
    next = nearestAlly(ctx, next, bb.projectile_range, seen);
  }
  return out;
}

/**
 * 反自然馈赠 (敌能-142): ready, not silenced, in the attack's turn and with someone to pick — else it waits, ready. The
 * turn is taken (holdAttack, as 敌能-62) and the cooldown starts again; each target takes its current 攻击力 ×
 * `atk_scale` (× `chain.atk_scale` a jump) as arts damage, and one still up gains the speed for `duration` s.
 * @param {FoeContext} ctx
 */
function gift(ctx) {
  const bb = ctx.bb;
  if (!snowOwns('ChainBuff', bb) || !ctx.ready || ctx.stats(ctx.self).flags.silence || !attackTurn(ctx)) return;
  const targets = giftTargets(ctx);
  if (targets.length === 0) return;
  ctx.use();
  ctx.holdAttack();
  const left = ctx.frames(bb.duration), mods = { aspd: bb.attack_speed, movePct: bb.move_speed };
  let amount = ctx.stats(ctx.self).atk * bb.atk_scale;
  for (const t of targets) {
    ctx.dealDamage(t, { type: 'arts', amount, isAttack: true, isSkill: true });
    if (t.hp > 0) ctx.addBuff(t, { key: GIFT_BUFF, left, mods });
    amount *= bb['chain.atk_scale'];
  }
}

/** The behaviours of this family by name; `Attack` dispatches here from whip.js. @type {Readonly<Record<string, FoeBehavior>>} */
export const snowBehaviors = Object.freeze({ ChainBuff: Object.freeze({ tick: gift }) });
