// “帝国的甲胄” (docs/spec/foes.md 敌能-137). `range`: unblocked as an attack starts, flying units are left out and the
// attack's 倍率 is × `attack@atk_scale_range`. `Appear` (回忆里的誓死): once, as it comes in, a 3×3 bombardment on the
// tile of the unit of ours with the most HP on the field; from `delay` s, every `interval` s up to `duration` s, the
// one with the most HP inside takes 攻击力 as physical damage, at most `times` strikes. The data has only `times`; the
// three seconds are the page's (FOE_EXTRAS). `MultiCombat` (回忆里的怒守): blocked, ready and not silenced as an attack
// starts, that attack is the skill's — `times` hits on the blocker. It acts only through the context (ADR 0055).
import { body } from '@aue/sim';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext @typedef {import('@aue/sim').Unit} Unit */

/** `Appear`'s keys: the data's `times` and the page's three seconds (敌能-137). */
const APPEAR = Object.freeze(['times', 'duration', 'delay', 'interval']);

/** Whether `bb` has exactly these keys, each a number. @param {Record<string, unknown>} bb @param {readonly string[]} keys */
const exact = (bb, keys) => Object.keys(bb).length === keys.length && keys.every((k) => typeof bb[k] === 'number');

/** The talent `range` of this enemy (敌能-137). @param {Record<string, unknown>} bb */
const rangeShape = (bb) => exact(bb, ['attack@atk_scale_range']);
/** 回忆里的誓死 with the page's seconds (敌能-137). @param {Record<string, unknown>} bb */
const appearShape = (bb) => exact(bb, APPEAR);
/** 回忆里的怒守 (敌能-137). @param {Record<string, unknown>} bb */
const comboShape = (bb) => exact(bb, ['times']);

/**
 * Whether a behaviour of this name is this family's, by its shape (关卡-2); any other name passes. 汉科's talent
 * `Appear` (only `mark`) is not 回忆里的誓死 and stays uncovered.
 * @param {string} name @param {Record<string, unknown>} bb
 */
export function imperialArmorOwns(name, bb) {
  if (name === 'range') return rangeShape(bb);
  if (name === 'Appear') return appearShape(bb);
  if (name === 'MultiCombat') return comboShape(bb);
  return true;
}

/**
 * `range` (敌能-137): unblocked as the attack starts, no flying target and its 倍率 × the talent's; blocked, the attack
 * on its blocker as it is. A talent is not silenceable unless its page says so (the 天赋 tooltip's default).
 * @type {FoeBehavior}
 */
const range = Object.freeze({
  targets: (ctx, cands) => (ctx.blocked || !rangeShape(ctx.bb) ? cands : cands.filter((u) => !ctx.stats(u).flying)),
  attack: (ctx, mods) => (ctx.blocked || !rangeShape(ctx.bb) ? mods : { ...mods, scale: mods.scale * ctx.bb['attack@atk_scale_range'] }),
});

/**
 * Ours this skill may pick anywhere on the field (敌能-137): operators, our devices and neutral units it may select —
 * flying ones too, as a skill targets air unless its page says otherwise —, not 起飞 for a ground enemy (地面规避).
 * 隐匿, 迷彩, 沉睡 and 无法选中 stay out through the selector's default (索敌-2).
 * @param {FoeContext} ctx
 */
function pool(ctx) {
  const air = ctx.stats(ctx.self).flying;
  return ctx.foes(Infinity, { canHitFly: true }).filter((u) => air || !ctx.stats(u).flags.liftoff);
}

/** The one with the most HP now; a tie keeps the earlier in 索敌-5 order. @param {FoeContext} ctx @param {Unit[]} units @returns {Unit | null} */
function most(ctx, units) {
  /** @type {Unit | null} */
  let best = null;
  for (const u of ctx.order(units)) if (!best || u.hp > best.hp) best = u;
  return best;
}

/** Whether a unit stands on one of the zone's nine tiles (敌能-137): its own tile, not its collider. @param {FoeContext} ctx @param {Unit} u */
function inZone(ctx, u) {
  const [r, c] = body.tileOf(u), st = ctx.state;
  return Math.abs(r - st.get('row')) <= 1 && Math.abs(c - st.get('col')) <= 1;
}

/**
 * One strike (敌能-137): the one with the most HP in the zone takes the current 攻击力 as physical damage, an attack's and
 * the skill's. Nobody there: no strike and no count. A dodged or invincible target still counts as one.
 * @param {FoeContext} ctx
 */
function strike(ctx) {
  const st = ctx.state;
  if (st.get('hits') >= ctx.bb.times) return;
  const t = most(ctx, pool(ctx).filter((u) => inZone(ctx, u)));
  if (!t) return;
  st.set('hits', st.get('hits') + 1);
  ctx.dealDamage(t, { type: 'phys', amount: ctx.stats(ctx.self).atk, isAttack: true, isSkill: true });
}

/**
 * Frame `t` of the zone, the cast's frame being 0 (敌能-137): a strike on `delay` + k × `interval` up to `duration`, that
 * last frame included; the zone is gone after it.
 * @param {FoeContext} ctx @param {number} t
 */
function zoneFrame(ctx, t) {
  const bb = ctx.bb, first = ctx.frames(bb.delay), every = Math.max(1, ctx.frames(bb.interval)), end = ctx.frames(bb.duration);
  ctx.state.set('t', t);
  if (t >= first && t <= end && (t - first) % every === 0) strike(ctx);
  if (t >= end) ctx.state.set('on', 0);
}

/** The cast (敌能-137): the zone on the centre's tile — its own when it has none to pick —, once. @param {FoeContext} ctx */
function cast(ctx) {
  const st = ctx.state, [row, col] = body.tileOf(most(ctx, pool(ctx)) ?? ctx.self);
  ctx.use();
  st.set('done', 1);
  st.set('on', 1);
  st.set('hits', 0);
  st.set('row', row);
  st.set('col', col);
  zoneFrame(ctx, 0);
}

/**
 * 回忆里的誓死 (敌能-137): not silenceable and once; being blocked or disarmed does not stop it — it is no attack — and
 * it neither takes the attack interval nor holds the enemy. Once cast, its own stun or silence does not stop the zone;
 * the zone is this ability's state, so it ends when the enemy leaves the field.
 * @type {FoeBehavior}
 */
const Appear = Object.freeze({
  tick: (ctx) => {
    if (!appearShape(ctx.bb)) return;
    const st = ctx.state;
    if (st.get('on')) zoneFrame(ctx, st.get('t') + 1);
    else if (!st.get('done') && ctx.ready && !ctx.stats(ctx.self).disabled) cast(ctx);
  },
});

/**
 * 回忆里的怒守 (敌能-137): blocked, ready and not silenced as an attack starts — and no other skill took it —, that
 * attack is the skill's: `times` hits on the blocker, its normal wind-up and interval. The cooldown starts there, as the
 * engine's do (敌能-2); the page's tooltip counts it from the skill's end.
 * @type {FoeBehavior}
 */
const MultiCombat = Object.freeze({
  attack: (ctx, mods) => {
    if (!comboShape(ctx.bb) || mods.skill || !ctx.blocked || !ctx.ready || ctx.stats(ctx.self).flags.silence) return mods;
    ctx.use();
    return { ...mods, skill: true, times: ctx.bb.times };
  },
});

/** The behaviours of this file, by name. @type {Readonly<Record<string, FoeBehavior>>} */
export const imperialArmorBehaviors = Object.freeze({ range, Appear, MultiCombat });
