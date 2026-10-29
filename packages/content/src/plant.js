// 暴走食人花 (docs/spec/foes.md 敌能-108). In its 初始模式 it eats one of ours on the ground within 1.0, whether it is
// blocked or not: knocked down with no damage, its card locked (吞噬, 敌能-30); then it digests for `Eat`'s `duration`
// s — 自缚 with the page's immunities — and when that ends the card waits its 再部署时间. At its spawn it digests for
// `InitEat`'s `duration` s first. Falling, it lets go of what it holds. Its `Devour` with the page's `plant` marker runs
// this; `Eat`, `InitEat` (skill and talent) hold its numbers. The fruit it drops is not done. It acts only through the
// context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext */

/** How near what it eats is (敌能-108: 「自身半径1.0范围内」). */
const REACH = 1;
/** 消化 (敌能-108): 自缚, 失衡免疫, and 晕眩, 冻结, 浮空, 恐惧 and 沉睡 immune. */
const DIGESTING = 'digesting';
const DIGEST = Object.freeze({ root: true, noDisplace: true, 'immune:stun': true, 'immune:freeze': true, 'immune:levitate': true, 'immune:fear': true, 'immune:sleep': true });

/** `Devour` with the page's marker alone (敌能-108). @param {Record<string, unknown>} bb */
export const plantShape = (bb) => Object.keys(bb).length === 1 && bb.plant === 1;

/** Whether a behaviour of this name is this family's, by its shape (关卡-2); any other name passes. @param {string} name @param {Record<string, unknown>} bb */
export function plantOwns(name, bb) {
  const n = Object.keys(bb).length;
  if (name === 'Eat') return n === 1 && typeof bb.duration === 'number';
  if (name === 'InitEat') return (n === 1 && typeof bb.duration === 'number') || (n === 2 && typeof bb.token_key === 'string' && typeof bb.cnt === 'number');
  return true;
}

/** It digests for `seconds` from now (敌能-108). @param {FoeContext} ctx @param {number | undefined} seconds */
function digest(ctx, seconds) {
  if (!(typeof seconds === 'number' && seconds > 0)) return;
  ctx.state.set('until', ctx.frame + ctx.frames(seconds));
  ctx.addBuff(ctx.self, { key: DIGESTING, flags: { ...DIGEST } });
}

/** The 登场消化 (敌能-108). @param {FoeContext} ctx */
export const plantSpawn = (ctx) => { digest(ctx, ctx.skillBb('InitEat')?.duration); };

/**
 * Its turn (敌能-108): digesting, until the time is up — then what it ate waits its 再部署时间; else, able to act, it eats
 * the first of ours on the ground within 1.0 its attack would pick, and digests. @param {FoeContext} ctx
 */
export function plantTick(ctx) {
  const st = ctx.state, self = ctx.self;
  if (st.get('until') > 0) {
    if (ctx.frame < st.get('until')) return;
    st.set('until', 0);
    ctx.removeBuff(self, DIGESTING);
    if (st.get('meal') === 1) { st.set('meal', 0); ctx.unlock(true); }
    return;
  }
  if (ctx.stats(self).disabled) return;
  const near = ctx.ours().filter((u) => !ctx.stats(u).flying && (u.x - self.x) * (u.x - self.x) + (u.y - self.y) * (u.y - self.y) <= REACH * REACH);
  const t = ctx.order(near)[0];
  if (!t || !ctx.devour(t)) return;
  st.set('meal', 1);
  digest(ctx, ctx.skillBb('Eat')?.duration);
}

/** `Eat` and `InitEat`: their numbers are read by the plant's `Devour` (敌能-108). @type {FoeBehavior} */
const idle = Object.freeze({});

/** The behaviours of this file, by name; `Devour` dispatches here by its shape (devourers.js). @type {Readonly<Record<string, FoeBehavior>>} */
export const plantBehaviors = Object.freeze({ Eat: idle, InitEat: idle });
