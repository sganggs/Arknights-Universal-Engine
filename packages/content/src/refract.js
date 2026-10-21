// 折射 and the 深池 phalanx (docs/spec/foes.md 敌能-33): 折射 RES while not silenced, the phalanx DEF aura, and the
// shadow mage's refusal of flyers. They act only through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext */

/** 折射 (敌能-33): RES up while this turn is not silenced; a silence already on at the turn drops it. @type {FoeBehavior} */
const refracting = Object.freeze({
  tick: (ctx) => {
    const self = ctx.self;
    if (ctx.stats(self).flags.silence) { ctx.removeBuff(self, 'refracting'); return; }
    if (self.buffs.some((b) => b.key === 'refracting')) return;
    const res = ctx.bb.magic_resistance;
    if (typeof res !== 'number') return;
    ctx.addBuff(self, { key: 'refracting', mods: { resFlat: res } });
  },
});

/** A radius the page states (`key`), else the attack radius the data already carries (敌能-33). @param {FoeContext} ctx @param {string} key */
function radiusOf(ctx, key) {
  const n = ctx.bb[key];
  return typeof n === 'number' ? n : ctx.self.base.rangeRadius;
}

/**
 * 方阵 (敌能-33): each other living enemy with `auraDefup` inside the radius adds one copy of this enemy's own `def`.
 * Lent, so it ends within two frames of the last count; not silenceable.
 * @type {FoeBehavior}
 */
const auraDefup = Object.freeze({
  tick: (ctx) => {
    const self = ctx.self, def = ctx.bb.def;
    if (typeof def !== 'number') return;
    const n = ctx.allies(radiusOf(ctx, 'radius')).filter((u) => u !== self && ctx.talentOf(u, 'auraDefup')).length;
    if (n > 0) ctx.lend(self, 'phalanx', { mods: { defFlat: def * n } });
  },
});

/** 不会攻击飞行单位 (敌能-33): drop units whose motion is flying. 起飞 is not that. @type {FoeBehavior} */
const noFly = Object.freeze({
  targets: (ctx, cands) => cands.filter((u) => !ctx.stats(u).flying),
});

/** The behaviours of this file, by talent name. @type {Readonly<Record<string, FoeBehavior>>} */
export const refractBehaviors = Object.freeze({ refracting, auraDefup, noFly });
