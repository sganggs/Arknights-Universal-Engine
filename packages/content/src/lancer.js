// 萨卡兹穿刺手 (docs/spec/foes.md 敌能-53): unblocked, it enters 加速状态 and stacks move speed; a block keeps the
// state, and the first normal hit that takes HP adds one physical hit from the current move speed and leaves it.
// `firstattack` holds that hit's scale and is read here (FOE_COVERED). The buff key is `dlance` because 敌能-19's
// 冲锋 already uses `rush`. It acts only through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext */

const MS = 'dlancer_t[trigger].move_speed';
const IV = 'dlancer_t[trigger].interval';
const CAP = 'dlancer_t[trigger].trig_cnt';
/** Move-speed layers (敌能-53). Not 敌能-19's buff key `rush`. */
const BUFF = 'dlance';

/** The read pages' blackboard, including the page-only marker (敌能-53, 关卡-2). @param {Record<string, number>} bb */
const rushShaped = (bb) => typeof bb[MS] === 'number' && typeof bb[IV] === 'number' && typeof bb[CAP] === 'number' && typeof bb.paged === 'number';

/** The extra hit's scale from `firstattack` on a read page (敌能-53), or null. @param {FoeContext} ctx */
function extraScale(ctx) {
  const f = ctx.talent('firstattack');
  return f && typeof f.atk_scale === 'number' && typeof f.paged === 'number' ? f.atk_scale : null;
}

/** 晕眩 or 束缚 (敌能-53). 冻结, 沉睡 and 缚地 are other statuses. @param {FoeContext} ctx */
function held(ctx) {
  const f = ctx.stats(ctx.self).flags;
  return f.stun === true || f.root === true;
}

/** Leaves 加速状态 (敌能-53): the move-speed layers, the try count and the interval clock. @param {FoeContext} ctx */
function exitRush(ctx) {
  for (const k of ['on', 'layers', 'tries', 'acc']) ctx.state.set(k, 0);
  ctx.removeBuff(ctx.self, BUFF);
}

/**
 * One tick of the interval while 加速状态 holds and it is not blocked (敌能-53). A try that comes due adds one 直接乘算
 * layer, up to `trig_cnt`; past the cap the state stays and nothing is tried.
 * @param {FoeContext} ctx
 */
function tryLayer(ctx) {
  const st = ctx.state, iv = ctx.frames(ctx.bb[IV]);
  if (st.get('tries') >= ctx.bb[CAP] || !(iv > 0)) return;
  const acc = st.get('acc') + 1;
  if (acc < iv) { st.set('acc', acc); return; }
  const n = st.get('layers') + 1;
  st.set('layers', n);
  st.set('tries', st.get('tries') + 1);
  st.set('acc', acc - iv);
  ctx.setBuff(ctx.self, BUFF, n, { movePct: ctx.bb[MS] * n });
}

/**
 * 加速状态 (敌能-53). 晕眩 or 束缚 leave it every tick. Blocked, it stays as it is and tries nothing; out of it, a block
 * keeps it from entering. The entering tick tries nothing. A normal hit that took HP while in it adds the extra hit
 * from the move speed of that moment, then the state ends.
 * @type {FoeBehavior}
 */
const rush = Object.freeze({
  tick: (ctx) => {
    if (!rushShaped(ctx.bb)) return;
    if (held(ctx)) { exitRush(ctx); return; }
    if (ctx.blocked) return;
    if (ctx.state.get('on') !== 1) { ctx.state.set('on', 1); ctx.state.set('acc', 0); return; }
    tryLayer(ctx);
  },
  hit: (ctx, target, dealt) => {
    const k = extraScale(ctx);
    if (!rushShaped(ctx.bb) || k === null || !(dealt > 0) || ctx.state.get('on') !== 1) return;
    ctx.dealDamage(target, { type: 'phys', amount: ctx.stats(ctx.self).moveSpeed * k });
    exitRush(ctx);
  },
});

/** The behaviours of this file, by talent name. @type {Readonly<Record<string, FoeBehavior>>} */
export const lancerBehaviors = Object.freeze({ rush });
