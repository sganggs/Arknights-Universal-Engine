// 鼠王 (docs/spec/foes.md 敌能-144): its arts barrier with DEF while any of it remains (`shield` reads `defup`; the
// talent name `shield` is 敌能-66's behaviour, which dispatches here by this shape), 低血 (`enrage`) and 唱沙
// (`DriftSand`) on the cross of the highest max HP unit, cast in place of an attack. 沙狱 (`SandStorm`) is a zone the
// engine has no object for and 标记 (`Mark`) only draws marks: both stay uncovered (关卡-2). Acts only through the
// context (ADR 0055).
import { body, disarmed } from '@aue/sim';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext @typedef {import('@aue/sim').Unit} Unit */

/** The barrier and its DEF (敌能-144): a key no other ability gives, so nothing else removes it. */
const BARRIER = 'ratShield';
/** 低血 (敌能-144). */
const RAGE = 'ratRage';
/** The page's 「可吸收14001法术伤害」 over the data's dynamic 4667 (INF-0910, as 敌能-66's INF-0488). */
const PER_DYNAMIC = 3;

/** Exactly these keys, each a number: a string-valued entry is not this shape. @param {Record<string, unknown>} bb @param {readonly string[]} keys */
const exact = (bb, keys) => Object.keys(bb).length === keys.length && keys.every((k) => typeof bb[k] === 'number');

/** 鼠王's `shield` (敌能-144): `dynamic` and the page marker. 布景小丑 / 布景大师 have no marker. @param {Record<string, unknown>} bb */
export const ratShield = (bb) => exact(bb, ['dynamic', 'page']) && bb.page === 1;

/** 鼠王's `defup` (敌能-144): `def` and the page marker; 御4 and 寒霜 carry `range_radius` (敌能-35). @param {Record<string, unknown>} bb */
export const ratDef = (bb) => exact(bb, ['def', 'page']) && bb.page === 1;

/** 低血 (敌能-144). @param {Record<string, unknown>} bb */
const rageShape = (bb) => exact(bb, ['hp_ratio', 'damage_scale']);

/** 唱沙 (敌能-144): the data's damage and the page's arm length (its range figure). @param {Record<string, unknown>} bb */
const sandShape = (bb) => exact(bb, ['damage', 'arm']);

/**
 * Whether a blackboard of this family's names is the shape it understands (关卡-2); other names pass. `shield` is
 * shieldOwns (敌能-66), `defup` is whole by ratWhole.
 * @param {string} name @param {Record<string, unknown>} bb
 */
export function ratOwns(name, bb) {
  if (name === 'enrage') return rageShape(bb);
  if (name === 'DriftSand') return sandShape(bb);
  return true;
}

/** 鼠王's `defup` is whole without 御4's radius: the barrier reads it (敌能-144). @param {string} k @param {Record<string, unknown>} bb */
export const ratWhole = (k, bb) => k === 'defup' && ratDef(bb);

/**
 * The barrier on appearance (敌能-144, INF-0910): 3 × `dynamic` of arts, and DEF + `defup.def` (直接加算) on the same
 * buff, so the DEF ends in the 伤判 step that empties it. `act` is 敌能-66's arts-only take on `value`.
 * @param {FoeContext} ctx @param {string} act
 */
export function ratBarrier(ctx, act) {
  const amount = ctx.bb.dynamic * PER_DYNAMIC;
  if (!(amount > 0)) return;
  const up = ctx.talent('defup');
  ctx.addBuff(ctx.self, { key: BARRIER, act, value: amount, mods: { defFlat: up && ratDef(up) ? up.def : 0 } });
}

/**
 * 低血 (敌能-144, INF-0911): strictly below `hp_ratio` of its max HP at its turn, all the damage it deals × `damage_scale`;
 * gone once it is not below. One buff. A talent: silence does not stop it.
 * @type {FoeBehavior}
 */
const enrage = Object.freeze({
  tick: (ctx) => {
    const bb = ctx.bb, self = ctx.self;
    if (!rageShape(bb)) return;
    const low = self.hp < ctx.stats(self).maxHp * bb.hp_ratio, has = self.buffs.some((b) => b.key === RAGE);
    if (low && !has) ctx.addBuff(self, { key: RAGE, mods: { dmgDealtMul: bb.damage_scale } });
    else if (!low && has) ctx.removeBuff(self, RAGE);
  },
});

/**
 * Whether this frame's normal attack could start (敌人攻击-1), so the skill may take its place (INF-0914): the attack
 * cooldown is out and no swing is under way; it can act, has attack, has not disappeared and is not in 失衡; no
 * `noAttack`, neither 缴械 nor 强制缴械 (状态-12) nor 恐惧, nor 战栗 while blocked; not silenced (技能默认可被沉默).
 * @param {FoeContext} ctx
 */
function freeTurn(ctx) {
  const self = ctx.self, s = ctx.stats(self), f = s.flags;
  if (self.atkCd > 0 || self.swing || self.hidden || ctx.unbalanced) return false;
  if (s.disabled || !(s.atk > 0) || f.noAttack || disarmed(self) || f.fear || f.silence) return false;
  return !(f.disarmedCombat && ctx.blocked);
}

/**
 * 唱沙's centre (敌能-144, INF-0912): the highest max HP on the field among what its normal attack may select — the
 * default selector keeps flying, 隐匿, 迷彩, 无法选中 and sleeping units out; 起飞 evades a ground enemy (阻挡-2). A tie
 * keeps the earlier unit in 索敌-5 order.
 * @param {FoeContext} ctx @returns {Unit | null}
 */
function heaviest(ctx) {
  const air = ctx.stats(ctx.self).flying;
  /** @type {Unit | null} */
  let best = null;
  for (const u of ctx.order(ctx.foes(Infinity))) {
    if (ctx.stats(u).flags.liftoff && !air) continue;
    if (!best || ctx.stats(u).maxHp > ctx.stats(best).maxHp) best = u;
  }
  return best;
}

/**
 * The cross (敌能-144, INF-0913): the centre's tile and `arm` tiles along its row and its column, by the tile a unit
 * stands on. Flying units and 迷彩 are in it (a tile judgment); 隐匿 and 无法选中 are not. In creation order.
 * @param {FoeContext} ctx @param {Unit} centre @returns {Unit[]}
 */
function crossOf(ctx, centre) {
  const [row, col] = body.tileOf(centre), arm = ctx.bb.arm;
  return ctx.foes(Infinity, { canHitFly: true, ignoreCamou: true }).filter((u) => {
    const [r, c] = body.tileOf(u);
    return (r === row && Math.abs(c - col) <= arm) || (c === col && Math.abs(r - row) <= arm);
  });
}

/**
 * 唱沙 (敌能-144): in place of an attack that could start this frame, `damage` physical splash on everyone in the
 * cross of the centre, as a skill hit. Then the cooldown (from this frame) and the attack interval it took. No centre:
 * nothing, and the skill stays ready.
 * @type {FoeBehavior}
 */
const DriftSand = Object.freeze({
  tick: (ctx) => {
    if (!sandShape(ctx.bb) || !ctx.ready || !freeTurn(ctx)) return;
    const centre = heaviest(ctx);
    if (!centre) return;
    for (const u of crossOf(ctx, centre)) ctx.dealDamage(u, { type: 'phys', amount: ctx.bb.damage, isAttack: false, isSkill: true, isSplash: true });
    ctx.use();
    ctx.holdAttack();
  },
});

/** The behaviours of this file, by name. `shield` stays 敌能-66's registration and calls ratBarrier. @type {Readonly<Record<string, FoeBehavior>>} */
export const ratBehaviors = Object.freeze({ enrage, DriftSand });
