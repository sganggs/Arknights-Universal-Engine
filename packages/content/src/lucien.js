// 卢西恩，“猩红血钻” and 不祥幻影 (docs/spec/foes.md 敌能-156). Their talents `penetrate` (物理穿透 on everything they
// deal) and `evade` (物理/法术闪避 while not blocked) are this file's; `combat` is 敌能-38's element hit, its `el` 1 (神经)
// from FOE_EXTRAS. Their skill `aoe` keeps the one behaviour of the name (partisans.js) and hands its shape here: with
// one of ours within `radius`, physical damage and 神经损伤 on all of ours there, in place of a normal attack. 卢西恩's
// `blink` is 弑君者's and leaves a 不祥幻影 (blink.js). They act only through the context (ADR 0055).

import { disarmed, targeting } from '@aue/sim';
import { blinkedNow } from './blink.js';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext @typedef {import('@aue/sim').Unit} Unit */

/** The skill `aoe` of the two pages: the data's two numbers and the page's radius (半径2), which the data does not have. */
const AOE_KEYS = Object.freeze(['atk_scale', 'ep_damage_ratio', 'radius']);
/** 物理穿透 of `penetrate`, under a key no other ability gives. */
const PIERCE = 'lucienPierce';
/** The dodge of `evade`. evade.js's `Evade` gives the key `evade`; taking this one off leaves that one alone. */
const DODGE = 'lucienEvade';
/** 神经损伤 (元素-1). */
const SANITY = 'SANITY';

/** Whether a blackboard holds exactly these keys, each a number. @param {Record<string, unknown>} bb @param {readonly string[]} keys */
const exactly = (bb, keys) => Object.keys(bb).length === keys.length && keys.every((k) => typeof bb[k] === 'number');

/** `penetrate` (敌能-156): `def_penetrate` alone. @param {Record<string, unknown>} bb */
const pierceShape = (bb) => exactly(bb, ['def_penetrate']);
/** `evade` (敌能-156): `prob` alone. @param {Record<string, unknown>} bb */
const dodgeShape = (bb) => exactly(bb, ['prob']);

/**
 * The skill `aoe` of 卢西恩 and 不祥幻影 (敌能-156): the two numbers with the page's `radius`. The two numbers alone are
 * also 鼎沸's talent, and a shape check cannot tell a talent from a skill, so neither counts without its marker.
 * @param {Record<string, unknown>} bb
 */
export const shadeAoe = (bb) => exactly(bb, AOE_KEYS);

/**
 * Whether a blackboard of this family's own names is a shape it understands (敌能-156, 关卡-2); any other name passes.
 * `aoe` and `blink` are asked through aoeOwns and blinkOwns. @param {string} name @param {Record<string, unknown>} bb
 */
export function lucienOwns(name, bb) {
  if (name === 'penetrate') return pierceShape(bb);
  if (name === 'evade') return dodgeShape(bb);
  return true;
}

/** Gives a buff once; it is given again only if something took it away. @param {FoeContext} ctx @param {import('@aue/sim').buffs.BuffInit} init */
function keep(ctx, init) {
  if (!ctx.self.buffs.some((b) => b.key === init.key)) ctx.addBuff(ctx.self, init);
}

/**
 * 无视防御 (敌能-156): from the spawn, 物理穿透（百分比）+`def_penetrate` — a stat of the source, so its attacks and its skill
 * both carry it. Taken away, it is back on its next turn. A talent: silence does not stop it. @param {FoeContext} ctx
 */
function pierce(ctx) {
  if (pierceShape(ctx.bb)) keep(ctx, { key: PIERCE, mods: { defIgnorePct: ctx.bb.def_penetrate } });
}

/**
 * 闪避 (敌能-156): not blocked as its turn starts — and so from the spawn —, 物理闪避 and 法术闪避 of `prob`; blocked,
 * none. A block that starts or ends later in the frame shows on its next turn. Silence does not stop it.
 * @param {FoeContext} ctx
 */
function dodge(ctx) {
  if (!dodgeShape(ctx.bb)) return;
  if (ctx.blocked) ctx.removeBuff(ctx.self, DODGE);
  else keep(ctx, { key: DODGE, mods: { dodgePhys: ctx.bb.prob, dodgeArts: ctx.bb.prob } });
}

/**
 * Whether it could start a normal attack this frame (敌人攻击-1, 状态-5), so the skill may take that turn (敌能-62,
 * 敌能-145): able to act, not silenced (the skill can be), no `noAttack`, not 缴械 or 强制缴械 (状态-12), not feared, not
 * under 战栗 while blocked, not disappeared, not in 失衡. The attack's own cooldown is not waited for (INF-0921).
 * @param {FoeContext} ctx
 */
function mayCast(ctx) {
  const s = ctx.stats(ctx.self), f = s.flags;
  return !s.disabled && !f.silence && !f.noAttack && !disarmed(ctx.self) && !f.fear && !(ctx.blocked && f.disarmedCombat) && !ctx.self.hidden && !ctx.unbalanced;
}

/**
 * Those it fights — ours, our devices, neutral units — within `r` of its centre, the boundary in (敌能-156): selectable
 * by 索敌-2, flyers too (技能默认可对空), none that took off from a ground enemy (对地规避); `camou` takes 迷彩 ones in
 * too — the damage's 无视迷彩 —, the trigger does not (触发选择器通常不无视迷彩).
 * @param {FoeContext} ctx @param {number} r @param {boolean} camou @returns {Unit[]}
 */
const nearby = (ctx, r, camou) => ctx.foes(r, { canHitFly: true, ignoreCamou: camou }).filter((u) => !targeting.evadesGround(ctx.self, u));

/**
 * The skill's main target (敌能-156), by 敌人类的常规的索敌 (总是选择阻挡目标): the unit blocking it — even one that 迷彩,
 * 隐匿 or 无法选中 keeps from the trigger (the tooltip's 伊内丝) —, else the first of those the trigger saw (索敌-5).
 * @param {FoeContext} ctx @param {Unit[]} seen @returns {Unit | undefined}
 */
function mainOf(ctx, seen) {
  const b = ctx.blocker();
  return b && b.hp > 0 ? b : ctx.order(seen)[0];
}

/**
 * The skill `aoe` (敌能-156), at the start of its turn: ready, able to take this frame's attack, its blink not just
 * triggered (it comes first in the table), and one of ours within `radius` that the trigger sees. It then takes the
 * attack, its cooldown starts, and each of ours within `radius`, 迷彩 too, and the main target takes 攻击力 × `atk_scale`
 * physical skill damage — splash but for the main target — and then 攻击力 × `ep_damage_ratio` 神经损伤, whatever the
 * damage did. @param {FoeContext} ctx
 */
export function shadeTick(ctx) {
  const bb = ctx.bb;
  if (!shadeAoe(bb) || !ctx.ready || !mayCast(ctx) || blinkedNow(ctx)) return;
  const seen = nearby(ctx, bb.radius, false), main = mainOf(ctx, seen);
  if (seen.length === 0 || !main) return;
  ctx.use();
  ctx.holdAttack();
  const atk = ctx.stats(ctx.self).atk, hit = nearby(ctx, bb.radius, true);
  if (!hit.includes(main)) hit.push(main);
  for (const u of hit) {
    ctx.dealDamage(u, { type: 'phys', amount: atk * bb.atk_scale, isAttack: false, isSkill: true, ...(u === main ? {} : { isSplash: true }) });
    ctx.dealEp(u, SANITY, atk * bb.ep_damage_ratio);
  }
}

/** The behaviours of this file, by talent name. @type {Readonly<Record<string, FoeBehavior>>} */
export const lucienBehaviors = Object.freeze({
  penetrate: Object.freeze({ spawn: pierce, tick: pierce }),
  evade: Object.freeze({ spawn: dodge, tick: dodge }),
});
