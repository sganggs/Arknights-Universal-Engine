// 已损失生命值判定 and what passes it (docs/spec/foes.md 敌能-89): 囊海爬行者's 刺伤 (`damage_trigger`, `Stab`) and the
// check that 箭棘兽's quills share (bristle.js). The check: with its stage n (from 1) and its starting share (the HP share
// as it appeared, or 100%), it passes when the share lost since then is above the ratio × n and it still has HP; n then
// goes to ⌊lost ÷ ratio + 1⌋, so a big hit across several stages passes once.

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext */

/** 刺伤's reach (敌能-89: 「对半径2范围内所有我方单位」). */
const STAB_RADIUS = 2;

/**
 * 已损失生命值判定 at `ratio` (敌能-89), on an ability's own state; its starting share is noted on the first call (the
 * HP share as it appeared when `asSpawned`, else 100%). Whether it passed. @param {FoeContext} ctx @param {number} ratio @param {boolean} [asSpawned]
 */
export function lostLifePassed(ctx, ratio, asSpawned = false) {
  const st = ctx.state, self = ctx.self, now = self.hp / self.maxHp;
  if (!st.get('lifeSet')) { st.set('lifeSet', 1); st.set('stage', 1); st.set('from', asSpawned ? now : 1); }
  const lost = st.get('from') - now, stage = st.get('stage');
  if (!(ratio > 0) || !(lost > ratio * stage) || !(now > 0)) return false;
  st.set('stage', Math.floor(lost / ratio + 1));
  return true;
}

/** Whether 晕眩, 冻结 or 浮空 holds it: a forced skill does not start then (敌能-89). @param {FoeContext} ctx */
export const heldDown = (ctx) => { const f = ctx.stats(ctx.self).flags; return !!(f.stun || f.freeze || f.levitate); };

/**
 * 囊海爬行者 (敌能-89, `damage_trigger`): its starting share is its HP share as it appeared; after each turn it was hurt,
 * the check at `hp_ratio`; passed, and not 晕眩, 冻结 or 浮空, 刺伤 is forced — silence and 缴械 do not stop it —: its
 * 失衡 ends, and every unit of ours within 2 takes 攻击力 × `atk_scale` arts damage and 攻击力 × `ep_damage_ratio` of
 * 神经损伤 (the skill `Stab`'s blackboard).
 * @type {FoeBehavior}
 */
const damage_trigger = Object.freeze({
  spawn: (ctx) => { lostLifePassed(ctx, ctx.bb.hp_ratio, true); },
  tick: (ctx) => {
    if (!ctx.hurt || !lostLifePassed(ctx, ctx.bb.hp_ratio, true) || heldDown(ctx)) return;
    const stab = ctx.skillBb('Stab');
    if (!stab) return;
    ctx.steady();
    const atk = ctx.stats(ctx.self).atk;
    for (const u of ctx.foes(STAB_RADIUS)) {
      ctx.dealDamage(u, { type: 'arts', amount: atk * stab.atk_scale });
      ctx.dealEp(u, 'SANITY', atk * stab.ep_damage_ratio);
    }
  },
});

/** The behaviours of this file; `Stab` is only ever forced by `damage_trigger`. @type {Readonly<Record<string, FoeBehavior>>} */
export const lostLifeBehaviors = Object.freeze({ damage_trigger, Stab: Object.freeze({}) });
