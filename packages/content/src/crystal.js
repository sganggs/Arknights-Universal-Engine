// 活性态萨卡兹术师结晶 and 静滞虚幻·β (docs/spec/foes.md 敌能-110): each once throws at our terminal. `StopCost`: a
// chain that reaches the cost 0.8 s after the cast — a silence in between ends it — and stops its natural regeneration
// for `projectile_life_time` s. `CardBoom`: a bomb that reaches the top of the 待部署区 (the time a UI distance takes,
// here 1 s: INF-0672) and seals the costliest card there for `duration` s. It acts only through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext */

/** The chain's flight (敌能-110: 「弹道固定0.8秒后抵达目标位置」), seconds. */
const CHAIN_S = 0.8;
/** The bomb's flight to the top of the 待部署区 (敌能-110, INF-0672), seconds. */
const BOMB_S = 1;

/** Whether `bb` has exactly these keys, each a number. @param {Record<string, unknown>} bb @param {readonly string[]} keys */
const exact = (bb, keys) => Object.keys(bb).length === keys.length && keys.every((k) => typeof bb[k] === 'number');

/** @param {Record<string, unknown>} bb */
const chainShape = (bb) => exact(bb, ['projectile_life_time', 'cost_add_locked']);
/** @param {Record<string, unknown>} bb */
const bombShape = (bb) => exact(bb, ['duration', 'respawn_disabled']);

/** Whether a behaviour of this name is this family's, by its shape (关卡-2); any other name passes. @param {string} name @param {Record<string, unknown>} bb */
export function crystalOwns(name, bb) {
  if (name === 'StopCost') return chainShape(bb);
  if (name === 'CardBoom') return bombShape(bb);
  return true;
}

/** Whether it may cast now: ready, able, not silenced. @param {FoeContext} ctx */
const castable = (ctx) => { const s = ctx.stats(ctx.self); return ctx.ready && !s.disabled && !s.flags.silence; };

/**
 * The one throw (敌能-110): ready and able, it casts once; `hit` lands it `delay` s later unless `stops` says the cast
 * was broken. @param {FoeContext} ctx @param {number} delay @param {(ctx: FoeContext) => boolean} stops @param {(ctx: FoeContext) => void} hit
 */
function once(ctx, delay, stops, hit) {
  const st = ctx.state;
  if (st.get('done') === 1) return;
  if (st.get('due') > 0) {
    if (stops(ctx)) { st.set('done', 1); return; }
    if (ctx.frame < st.get('due')) return;
    st.set('done', 1);
    hit(ctx);
    return;
  }
  if (!castable(ctx)) return;
  ctx.use();
  st.set('due', ctx.frame + ctx.frames(delay));
}

/** 枷锁侵蚀：费用 (敌能-110). @type {FoeBehavior} */
const StopCost = Object.freeze({
  tick: (ctx) => {
    if (!chainShape(ctx.bb)) return;
    once(ctx, CHAIN_S, (x) => !!x.stats(x.self).flags.silence, (x) => { x.lockCost(x.bb.projectile_life_time); });
  },
});

/** 静滞侵蚀：高牌 (敌能-110): once launched, the bomb flies whatever befalls it. @type {FoeBehavior} */
const CardBoom = Object.freeze({
  tick: (ctx) => {
    if (!bombShape(ctx.bb)) return;
    once(ctx, BOMB_S, () => false, (x) => { x.sealCard(x.bb.duration); });
  },
});

/** The behaviours of this file, by name. @type {Readonly<Record<string, FoeBehavior>>} */
export const crystalBehaviors = Object.freeze({ StopCost, CardBoom });
