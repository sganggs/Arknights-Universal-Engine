// “庞贝” (docs/spec/foes.md 敌能-103): its normal attack burns (`dot`); blocked, it bursts every `interval` seconds
// (`rangedamage`); below `hp_ratio` of its HP it attacks faster (`selfbuff`). Its four targets and no flying ones are the
// page's (FOE_EXTRAS `Targets`, `noFly`), as is the burst's radius. The burn is a buff that ticks on its own, through
// the sim's damage module; the rest acts through the context (ADR 0055).
import { damage } from '@aue/sim';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext */

/** 【“庞贝”的灼烧】 (敌能-103). */
const BURN = 'pompeiiBurn';

/** Whether `bb` has exactly these keys, each a number. @param {Record<string, unknown>} bb @param {readonly string[]} keys */
const exact = (bb, keys) => Object.keys(bb).length === keys.length && keys.every((k) => typeof bb[k] === 'number');

/** @param {Record<string, unknown>} bb */
const dotShape = (bb) => exact(bb, ['duration', 'damage', 'interval']);
/** With the page's `radius` (敌能-103). @param {Record<string, unknown>} bb */
const burstShape = (bb) => exact(bb, ['interval', 'attack@damage', 'radius']);
/** @param {Record<string, unknown>} bb */
const lowShape = (bb) => exact(bb, ['attack_speed', 'hp_ratio']);

/** Whether a behaviour of this name is this family's, by its shape (关卡-2); any other name passes. @param {string} name @param {Record<string, unknown>} bb */
export function pompeiiOwns(name, bb) {
  if (name === 'dot') return dotShape(bb);
  if (name === 'rangedamage') return burstShape(bb);
  if (name === 'selfbuff') return lowShape(bb);
  return true;
}

/**
 * The burn (敌能-103): a hit puts `duration` seconds of it on the target, or sets the time of the one already there
 * back to `duration`; each `interval` seconds it deals `damage` sourceless arts that does not give 受击回复.
 * @type {FoeBehavior}
 */
const dot = Object.freeze({
  hit: (ctx, target) => {
    const bb = ctx.bb;
    if (!dotShape(bb) || target.hp <= 0) return;
    const left = ctx.frames(bb.duration);
    if (target.buffs.some((b) => b.key === BURN)) ctx.renew(target, BURN, left, {});
    else ctx.addBuff(target, { key: BURN, value: bb.damage, left, every: ctx.frames(bb.interval), fixed: true });
  },
});

/** A tick of the burn (敌能-103). @type {NonNullable<import('@aue/sim').buffs.Behavior['tick']>} */
const burnTick = (w, u, b) => { damage.dealDamage(w, null, u, { type: 'arts', amount: b.value, sourceless: true, noHurtSp: true, tags: ['dot'] }); };

/** Held: 晕眩, 无法行动, 沉睡, 冻结 or 浮空 (敌能-103). @param {FoeContext} ctx */
function held(ctx) {
  const s = ctx.stats(ctx.self), f = s.flags;
  return s.disabled || f.stun === true || f.sleep === true || f.freeze === true || f.levitate === true;
}

/**
 * The burst (敌能-103): blocked, a clock that stops while it is held and starts over when the block ends; each
 * `interval` seconds on it, each of ours on the ground within `radius` takes `attack@damage` arts splash.
 * @type {FoeBehavior}
 */
const rangedamage = Object.freeze({
  tick: (ctx) => {
    const bb = ctx.bb, st = ctx.state, self = ctx.self;
    if (!burstShape(bb)) return;
    if (!ctx.blocked) { st.set('acc', 0); return; }
    if (held(ctx)) return;
    const acc = st.get('acc') + 1;
    if (acc < ctx.frames(bb.interval)) { st.set('acc', acc); return; }
    st.set('acc', 0);
    const r = bb.radius;
    for (const u of ctx.ours().filter((x) => !ctx.stats(x).flying && (x.x - self.x) * (x.x - self.x) + (x.y - self.y) * (x.y - self.y) <= r * r)) {
      ctx.dealDamage(u, { type: 'arts', amount: bb['attack@damage'], isSplash: true });
    }
  },
});

/** Below `hp_ratio` of its max HP, 攻击速度 + `attack_speed` (敌能-103). @type {FoeBehavior} */
const selfbuff = Object.freeze({
  tick: (ctx) => {
    const bb = ctx.bb, self = ctx.self;
    if (!lowShape(bb)) return;
    const low = self.hp < bb.hp_ratio * ctx.stats(self).maxHp, on = ctx.buffValue(self, 'selfbuff') !== null;
    if (low && !on) ctx.setBuff(self, 'selfbuff', 1, { aspd: bb.attack_speed });
    else if (!low && on) ctx.removeBuff(self, 'selfbuff');
  },
});

/** The behaviours of this file, by talent name. @type {Readonly<Record<string, FoeBehavior>>} */
export const pompeiiBehaviors = Object.freeze({ dot, rangedamage, selfbuff });

/** The burn's ticks (敌能-103). @type {Readonly<Record<string, import('@aue/sim').buffs.Behavior>>} */
export const pompeiiBuffs = Object.freeze({ [BURN]: { tick: burnTick } });
