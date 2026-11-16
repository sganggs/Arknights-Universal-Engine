// 元核孽生者 and 异光体孽生者 (docs/spec/foes.md 敌能-127). They come in standing by (待命: no normal attacks); the first
// turn they are hurt they turn to 临战 for good — faster, past the route's waits, attacking again — and every `interval`
// seconds ours within `range_radius` take 神经损伤, from one of a kind at a time. The talent names are shared: `0` and `3`
// are told apart here and `1` in wineOwns, since `1` is also 悖谬谍报官's ammunition and the barrel (敌能-31, 敌能-62);
// `0` reads `1`'s numbers, as `Devour` reads `Stronger`. The 赘生甲壳 talent `3` breaks is a device the content does not
// describe (装置-3). They act only through the context (ADR 0055).

import { KIND } from '@aue/sim';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext @typedef {import('@aue/sim').Unit} Unit */

/** 待命's no-attack. Not 敌能-32's `standby`, which is the mercenaries'. */
const STANDBY = 'nucleusStandby';
/** 临战: the move speed and 无视停驻检查点 (路线-1's `noWait`) on one buff, with no end. */
const ENGAGED = 'nucleusEngaged';
/** The mark a pulse leaves on its target until the next pulse. The enemy key follows: 不叠加 is within one kind (INF-0744). */
const MARK = 'nucleusToxin';
/** 神经损伤 (元素-1). The pages name it, so no content `el` is added. */
const NEURAL = 'SANITY';
/** 无视迷彩, and flying units too: the pages do not say 不可对空 (INF-0743). */
const REACH = Object.freeze({ ignoreCamou: true, canHitFly: true });

/** Whether `bb` has exactly these keys, each a number. @param {Record<string, unknown>} bb @param {readonly string[]} keys */
const exact = (bb, keys) => Object.keys(bb).length === keys.length && keys.every((k) => typeof bb[k] === 'number');

/** Talent `0` of this family: `move_speed` alone. @param {Record<string, unknown>} bb */
const standbyShape = (bb) => exact(bb, ['move_speed']);

/** Talent `1` of this family: the toxin's three numbers, nothing else (敌能-127). @param {Record<string, unknown>} bb */
export const toxinShape = (bb) => exact(bb, ['ep_damage_ratio', 'interval', 'range_radius']);

/**
 * Whether a name and blackboard are this family's (关卡-2): `0` and `3` only in these shapes; `1` is told apart in
 * wineOwns. Any other name is not this family's concern.
 * @param {string} name @param {Record<string, unknown>} bb
 */
export function nucleusOwns(name, bb) {
  if (name === '0') return standbyShape(bb);
  if (name === '3') return exact(bb, ['hp_ratio', 'range_radius']);
  return true;
}

/** Gives it a buff of this file's key once; again only if something took it away. @param {FoeContext} ctx @param {import('@aue/sim').buffs.BuffInit} init */
function keep(ctx, init) {
  if (!ctx.self.buffs.some((b) => b.key === init.key)) ctx.addBuff(ctx.self, init);
}

/** Ours within the radius of its centre (INF-0743). Neutral units are in `foes` and are not ours. @param {FoeContext} ctx @param {number} radius */
const reach = (ctx, radius) => ctx.foes(radius, REACH).filter((u) => u.kind !== KIND.ENEMY);

/** Whether another of its kind holds this unit (不叠加, INF-0744): its mark is still on it. @param {Unit} t @param {string} key @param {number} id */
const heldByAnother = (t, key, id) => t.buffs.some((b) => b.key === key && b.src !== id);

/**
 * One pulse (敌能-127): each of ours in reach that another of its kind does not hold takes 神经损伤 of the current attack
 * × `ep_damage_ratio`, and is this one's — also when the hit changes nothing (元素-2). Any mark of the key left on it is
 * this one's own, so `renew` restarts it. Buffs run down before the enemies' turns (帧-1), so the mark lasts one frame
 * past the interval: it is still there on this one's next pulse, and the holder keeps the unit whatever the turn order.
 * @param {FoeContext} ctx @param {Record<string, number>} toxin talent `1` @param {number} every frames
 */
function pulse(ctx, toxin, every) {
  const self = ctx.self, key = `${MARK}:${self.key}`, amount = ctx.stats(self).atk * toxin.ep_damage_ratio;
  for (const t of reach(ctx, toxin.range_radius)) {
    if (heldByAnother(t, key, self.id)) continue;
    ctx.renew(t, key, every + 1, {});
    ctx.dealEp(t, NEURAL, amount);
  }
}

/**
 * The toxin's clock (敌能-127, INF-0742): the turn 临战 begins sets it, the first pulse comes a full interval later, then
 * one every interval.
 * @param {FoeContext} ctx @param {Record<string, number>} toxin
 */
function toxinTick(ctx, toxin) {
  const st = ctx.state, every = ctx.frames(toxin.interval);
  if (!(every > 0)) return;
  if (st.get('next') === 0) { st.set('next', ctx.frame + every); return; }
  if (ctx.frame < st.get('next')) return;
  st.set('next', ctx.frame + every);
  pulse(ctx, toxin, every);
}

/**
 * 待命 and 临战 (敌能-127), talent `0`: from spawn no normal attacks; the first turn `hurt` is set (敌能-2) it turns to
 * 临战 for good — 移动速度 + `move_speed` (直接乘算), no route waits, normal attacks back — and pulses with talent `1`'s
 * numbers when they are the toxin's shape. A talent: stun, freeze and sleep do not stop it (INF-0742).
 * @type {FoeBehavior}
 */
const standby = Object.freeze({
  spawn: (ctx) => { if (standbyShape(ctx.bb)) keep(ctx, { key: STANDBY, flags: { noAttack: true } }); },
  tick: (ctx) => {
    if (!standbyShape(ctx.bb)) return;
    if (!ctx.state.get('on')) {
      if (!ctx.hurt) { keep(ctx, { key: STANDBY, flags: { noAttack: true } }); return; }
      ctx.state.set('on', 1);
      ctx.removeBuff(ctx.self, STANDBY);
    }
    keep(ctx, { key: ENGAGED, mods: { movePct: ctx.bb.move_speed }, flags: { noWait: true } });
    const toxin = ctx.talent('1');
    if (toxin && toxinShape(toxin)) toxinTick(ctx, toxin);
  },
});

/**
 * Talent `3` (敌能-127, INF-0745): the 赘生甲壳 it breaks is a device the content does not describe, and a level with one
 * is not assembled (装置-3). Covered in its shape; it does nothing.
 * @type {FoeBehavior}
 */
const shell = Object.freeze({});

/** The behaviours of this file, by talent name (the data names them `0` and `3`). @type {Readonly<Record<string, FoeBehavior>>} */
export const nucleusBehaviors = Object.freeze({ 0: standby, 3: shell });
