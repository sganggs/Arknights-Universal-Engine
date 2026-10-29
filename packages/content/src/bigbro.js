// 绝望的大哥 (docs/spec/foes.md 敌能-113). From its spawn a 屏障 of `dynamic` physical or arts damage (`Shield`, this
// shape); once that is spent, or a 失衡 of its has ended, it drops its shield — the empty skill `EndShieldSwitchMode`,
// forced every 0.1 s while it is not held — and from then on its 防御力 is × (1 + `DefDesc`'s `def`). The “某种天命”
// that also makes it drop the shield is not in the engine's levels. It acts only through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext */

/** The 屏障 (敌能-113). */
const SHIELD = 'bigShield';
/** How often the drop is tried (敌能-113: 「每0.1秒」), seconds. */
const TRY_S = 0.1;

/** 大哥's `Shield` (敌能-113): `dynamic` and `range_radius` alone. @param {Record<string, unknown>} bb */
export const broShield = (bb) => Object.keys(bb).length === 2 && typeof bb.dynamic === 'number' && typeof bb.range_radius === 'number';

/** Whether a behaviour of this name is this family's, by its shape (关卡-2); any other name passes. @param {string} name @param {Record<string, unknown>} bb */
export function broOwns(name, bb) {
  if (name === 'DefDesc') return Object.keys(bb).length === 1 && typeof bb.def === 'number';
  if (name === 'EndShieldSwitchMode') return Object.keys(bb).length === 0;
  return true;
}

/** The 屏障 at its spawn (敌能-113). @param {FoeContext} ctx */
export const broSpawn = (ctx) => { ctx.addBuff(ctx.self, { key: SHIELD, shield: ctx.bb.dynamic, shieldType: 'phys+arts' }); };

/**
 * 失去盾牌 (敌能-113): with the 屏障 spent, or after a 失衡 ended, each 0.1 s it tries — not while 晕眩, 冻结, 沉睡 or
 * unable to act; silence does not stop it —; then the 屏障 is gone and the 失盾模式 begins. @param {FoeContext} ctx
 */
export function broTick(ctx) {
  const st = ctx.state, self = ctx.self;
  if (st.get('lost') === 1) return;
  const spent = !self.buffs.some((b) => b.key === SHIELD);
  if (!spent && st.get('fell') !== 1) return;
  if (ctx.frame < st.get('next')) return;
  st.set('next', ctx.frame + ctx.frames(TRY_S));
  const s = ctx.stats(self);
  if (s.disabled || s.flags.stun || s.flags.freeze || s.flags.sleep) return;
  st.set('lost', 1);
  ctx.removeBuff(self, SHIELD);
  const down = ctx.talent('DefDesc');
  if (down && typeof down.def === 'number') ctx.addBuff(self, { key: 'shieldless', mods: { defPct: down.def } });
}

/** A 失衡 of its ended (敌能-113). @param {FoeContext} ctx */
export const broFell = (ctx) => { ctx.state.set('fell', 1); };

/** `DefDesc` and `EndShieldSwitchMode`: read and forced by `Shield` (敌能-113). @type {FoeBehavior} */
const idle = Object.freeze({});

/** The behaviours of this file, by name; `Shield` dispatches here by its shape (blockdamage.js). @type {Readonly<Record<string, FoeBehavior>>} */
export const broBehaviors = Object.freeze({ DefDesc: idle, EndShieldSwitchMode: idle });
