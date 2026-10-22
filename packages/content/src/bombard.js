// 伦蒂尼姆城防自行炮 (docs/spec/foes.md 敌能-59): a fixed 9-tile bombardment. Acts only through the context (ADR 0055).

import { KIND, body } from '@aue/sim';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext @typedef {import('@aue/sim').Unit} Unit */

/** Collider reach added to the attack radius (敌人攻击-1). */
const REACH = 0.25;

/**
 * The show (敌能-59). No `left`: buffs tick before the enemy's turn, so a countdown on the buff would end a frame
 * early. The behaviour removes it. 寒冷 is not one of the page's immunities.
 */
const SHOW = Object.freeze({
  noDisplace: true, root: true, noAttack: true,
  'immune:stun': true, 'immune:freeze': true, 'immune:levitate': true, 'immune:sleep': true,
});

/** An operator (summons included) or a device of ours (敌能-59); a neutral unit is not 我方单位. @param {Unit} u */
const ours = (u) => u.kind !== KIND.ENEMY;

/**
 * Grounded against this gun (敌能-59). 起飞 keeps a ground 行动方式 and evades a gun that is not flying; the skill
 * tooltip's 可对空 does not pull it in.
 * @param {FoeContext} ctx @param {Unit} u
 */
function grounded(ctx, u) {
  return !(ctx.stats(u).flags.liftoff && !ctx.stats(ctx.self).flying);
}

/**
 * Our units the gun may bombard (敌能-59). `foes(radius, { canHitFly: true })` includes flying units: the skill tooltip says a skill
 * targets air unless the page says otherwise. 隐匿 and 迷彩 stay out through selectable's default.
 * @param {FoeContext} ctx @param {number} radius
 */
function pool(ctx, radius) {
  return ctx.foes(radius, { canHitFly: true }).filter((u) => ours(u) && grounded(ctx, u));
}

/**
 * The anchor (敌能-59): highest max HP. A tie keeps the earlier unit in 索敌-5 order, so a blocker wins an equal max HP.
 * @param {FoeContext} ctx @param {Unit[]} units @returns {Unit | null}
 */
function anchorOf(ctx, units) {
  /** @type {Unit | null} */
  let best = null;
  for (const u of ctx.order(units)) if (!best || ctx.stats(u).maxHp > ctx.stats(best).maxHp) best = u;
  return best;
}

/** Whether a unit stands in the stored 3×3 (敌能-59). Occupancy is the standing tile, not the collider. @param {FoeContext} ctx @param {Unit} u */
function inZone(ctx, u) {
  const [r, c] = body.tileOf(u);
  return Math.max(Math.abs(r - ctx.state.get('row')), Math.abs(c - ctx.state.get('col'))) <= 1;
}

/**
 * The tick's target (敌能-59): the highest exact HP ratio inside the stored zone. A tie keeps the earlier 索敌-5 unit.
 * Full HP counts. The zone is not limited to the gun's attack radius.
 * @param {FoeContext} ctx @returns {Unit | null}
 */
function ratioTarget(ctx) {
  const inside = pool(ctx, Infinity).filter((u) => inZone(ctx, u));
  /** @type {Unit | null} */
  let best = null;
  let ratio = -1;
  for (const u of ctx.order(inside)) {
    const r = u.hp / ctx.stats(u).maxHp;
    if (r > ratio) { best = u; ratio = r; }
  }
  return best;
}

/** One bombardment check (敌能-59). An empty zone does not spend one of the ten attacks. @param {FoeContext} ctx */
function strike(ctx) {
  const st = ctx.state;
  if (st.get('shots') >= ctx.bb.times) return;
  const t = ratioTarget(ctx);
  if (!t) return;
  st.set('shots', st.get('shots') + 1);
  ctx.dealDamage(t, { type: 'arts', amount: ctx.stats(ctx.self).atk * ctx.bb.atk_scale, isAttack: true, isSkill: true });
}

/**
 * One frame of the show (敌能-59). The cast frame is not a check. Checks fall when the frame counter hits a multiple
 * of the interval, through the frame `left` reaches 0. The buff comes off after that check, then the cooldown starts,
 * so the same turn's later attack and step are outside the show.
 * @param {FoeContext} ctx
 */
function bombard(ctx) {
  const st = ctx.state;
  const left = st.get('left') - 1, n = st.get('t') + 1;
  st.set('left', left);
  st.set('t', n);
  if (n % ctx.frames(ctx.bb.interval) === 0) strike(ctx);
  if (left > 0) return;
  st.set('on', 0);
  ctx.removeBuff(ctx.self, 'bombard');
  ctx.use();
}

/** Starts the show when the skill is ready and someone in attack range can be the anchor (敌能-59). @param {FoeContext} ctx */
function tryCast(ctx) {
  const s = ctx.stats(ctx.self);
  if (!ctx.ready || s.disabled || s.flags.silence) return;
  const picked = anchorOf(ctx, pool(ctx, ctx.self.base.rangeRadius + REACH));
  if (!picked) return;
  const [row, col] = body.tileOf(picked);
  const st = ctx.state;
  st.set('on', 1);
  st.set('left', ctx.frames(ctx.bb.duration));
  st.set('t', 0);
  st.set('shots', 0);
  st.set('row', row);
  st.set('col', col);
  ctx.addBuff(ctx.self, { key: 'bombard', flags: SHOW });
}

/** 轰炸 (敌能-59). The cooldown starts when the show ends, so `use` is not called on the cast. @type {FoeBehavior} */
const Cannon = Object.freeze({
  tick: (ctx) => {
    if (ctx.state.get('on')) { bombard(ctx); return; }
    tryCast(ctx);
  },
});

/** The behaviours of this file, by skill name. @type {Readonly<Record<string, FoeBehavior>>} */
export const bombardBehaviors = Object.freeze({ Cannon });
