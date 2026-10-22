// 莱茵生命防卫科 (docs/spec/foes.md 敌能-51): `max_block_damage_cnt` layers of 护盾 on appearing, minus
// `block_damage_cnt` already spent. Each layer cancels one physical or arts instance (伤害-8) and does not return.
// Talents also named Shield, without these keys, stay uncovered (关卡-2).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */

/**
 * Layers granted on appearing (敌能-51). None unless both keys are numbers and some layers are left.
 * @param {Record<string, number>} bb
 */
function layersOf(bb) {
  const max = bb.max_block_damage_cnt, spent = bb.block_damage_cnt;
  if (typeof max !== 'number' || typeof spent !== 'number' || !(max > 0)) return 0;
  const left = Math.round(max) - Math.round(spent);
  return left > 0 ? left : 0;
}

/** 护盾 (敌能-51): those layers, absorbing only physical and arts damage. Silence does not stop a talent the page leaves unsilenceable. @type {FoeBehavior} */
const Shield = Object.freeze({
  spawn: (ctx) => {
    const n = layersOf(ctx.bb);
    if (n <= 0) return;
    ctx.addBuff(ctx.self, { key: 'blockDamage', shieldHits: n, shieldType: 'phys+arts' });
  },
});

/** The behaviours of this file, by talent name. @type {Readonly<Record<string, FoeBehavior>>} */
export const blockDamageBehaviors = Object.freeze({ Shield });
