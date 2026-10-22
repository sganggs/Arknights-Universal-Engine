// Support auras, 远眺's death debuff (docs/spec/foes.md 敌能-35) and the scouts' on-hit expose (敌能-54). 御4, 寒霜,
// 护障, 远眺, 装甲侦察兵 and 重装侦察兵. Shared talent names split by blackboard shape: 寒霜's atkSpeedDown aura stays
// in summoners.js beside 畸变恶性瘤, because that talent name is already a behaviour. Expose is one behaviour too.
// These act only through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext */
/** @typedef {import('@aue/sim').FoeHpDamage} FoeHpDamage */

/**
 * 御4 and 寒霜 do not make normal attacks (敌能-35): their pages say so; the data's applyWay NONE is not read by the
 * attack rule. The page puts 「可被沉默」 on the aura, so silence does not give the attack back. A defup with no radius
 * is not one of these drones.
 * @param {FoeContext} ctx
 */
function holdFire(ctx) {
  if (typeof ctx.bb.range_radius === 'number') ctx.addBuff(ctx.self, { key: 'noAttack', flags: { noAttack: true } });
}

/**
 * 御4 (敌能-35): other non-neutral enemies within `range_radius` have 防御力 + `def` (直接加算), one lent key.
 * 寒霜's defup has the radius and no `def` — not a DEF aura. A defup with `def` and no radius is not this aura.
 * @param {FoeContext} ctx
 */
function defAura(ctx) {
  const def = ctx.bb.def, radius = ctx.bb.range_radius;
  if (typeof def !== 'number' || typeof radius !== 'number' || ctx.stats(ctx.self).flags.silence) return;
  for (const u of ctx.allies(radius)) if (u !== ctx.self) ctx.lend(u, 'defup', { mods: { defFlat: def } });
}

/** 御4's defence and the two drones' refusal to attack (敌能-35). @type {FoeBehavior} */
const defup = Object.freeze({ spawn: holdFire, tick: defAura });

/**
 * 护障 / 护障·P (敌能-35): other non-neutral enemies within the holder's attack radius have 法术抗性
 * + `magic_resistance` (直接加算), one lent key, not the holder. The radius is the record's rangeRadius (INF-0308).
 * @param {FoeContext} ctx
 */
function resAura(ctx) {
  const res = ctx.bb.magic_resistance, radius = ctx.self.base.rangeRadius;
  if (typeof res !== 'number' || typeof radius !== 'number' || ctx.stats(ctx.self).flags.silence) return;
  for (const u of ctx.allies(radius)) if (u !== ctx.self) ctx.lend(u, 'magdef', { mods: { resFlat: res } });
}

/** 护障 (敌能-35). @type {FoeBehavior} */
const magdef_add = Object.freeze({ tick: resAura });

/**
 * 远眺 (敌能-35): knocked down and not silenced, each of our units within `range_radius` gains 脆弱 for
 * `weak[limit]` seconds at v = `damage_scale` − 1 (同名效果取最高, 状态-2). No radius: the scouts' on-hit shape, not this.
 * @param {FoeContext} ctx
 */
function expose(ctx) {
  const radius = ctx.bb.range_radius, seconds = ctx.bb['weak[limit]'], scale = ctx.bb.damage_scale;
  if (typeof radius !== 'number' || typeof seconds !== 'number' || typeof scale !== 'number') return;
  if (ctx.stats(ctx.self).flags.silence) return;
  for (const u of ctx.foes(radius)) if (u.base.neutral !== true) ctx.applyStatus(u, 'fragile', { seconds, value: scale - 1 });
}

/**
 * 装甲侦察兵 / 重装侦察兵 (敌能-54): a hit from a 默认类 ally exposes that ally. 远眺's radius is the death aura, not
 * this. The hit's amount is already fixed, so the fragile does not apply to it. 生命流失 does not reach `hpDamage`.
 * @param {FoeContext} ctx @param {FoeHpDamage} hit
 */
function exposeOnHit(ctx, hit) {
  if (typeof ctx.bb.range_radius === 'number') return;
  const seconds = ctx.bb['weak[limit]'], scale = ctx.bb.damage_scale, who = hit.source;
  if (typeof seconds !== 'number' || typeof scale !== 'number' || !(hit.amount > 0)) return;
  if (ctx.stats(ctx.self).flags.silence || !who || !ctx.defaultAlly(who)) return;
  ctx.applyStatus(who, 'fragile', { seconds, value: scale - 1 });
}

/** Expose: 远眺's death aura when it has a radius (敌能-35); the scouts' on-hit expose when it does not (敌能-54). @type {FoeBehavior} */
const Expose = Object.freeze({ death: expose, hpDamage: exposeOnHit });

/** The behaviours of this file, by talent name. @type {Readonly<Record<string, FoeBehavior>>} */
export const auraBehaviors = Object.freeze({ defup, magdef_add, Expose });
