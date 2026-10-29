// 萨卡兹穿刺手 (docs/spec/foes.md 敌能-53): unblocked, it enters 加速状态 and stacks move speed; a block keeps the
// state, and the first normal hit that takes HP adds one physical hit from the current move speed and leaves it.
// `firstattack` holds that hit's scale and is read here (FOE_COVERED). The buff key is `dlance` because 敌能-19's
// 冲锋 already uses `rush`. 赏金猎人“骑士” (敌能-95) does the same under `Rush` with its own keys, its extra hit arts
// from `FirstAttack`. It acts only through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext */

/**
 * The keys of a speed-up (敌能-53, 敌能-95): its blackboard's layer, interval and tries, the talent with the extra
 * hit's scale and that hit's damage type.
 * @typedef {{ ms: string, iv: string, cap: string, first: string, type: 'phys' | 'arts' }} SpeedUp
 */

/** 萨卡兹穿刺手's (敌能-53). @type {SpeedUp} */
const LANCER = Object.freeze({ ms: 'dlancer_t[trigger].move_speed', iv: 'dlancer_t[trigger].interval', cap: 'dlancer_t[trigger].trig_cnt', first: 'firstattack', type: 'phys' });
/** 赏金猎人“骑士”'s (敌能-95). @type {SpeedUp} */
const KNIGHT = Object.freeze({ ms: 'enemy_mmstck_t[trigger].move_speed', iv: 'enemy_mmstck_t[trigger].interval', cap: 'enemy_mmstck_t[trigger].trig_cnt', first: 'FirstAttack', type: 'arts' });
/** Move-speed layers (敌能-53). Not 敌能-19's buff key `rush`. */
const BUFF = 'dlance';

/** The read pages' blackboard, including the page-only marker (敌能-53, 关卡-2). @param {Record<string, unknown>} bb */
const rushShaped = (bb) => [LANCER.ms, LANCER.iv, LANCER.cap, 'paged'].every((k) => typeof bb[k] === 'number');

/** 赏金猎人“骑士”'s `Rush` (敌能-95): its three keys alone. @param {Record<string, unknown>} bb */
export const knightShape = (bb) => Object.keys(bb).length === 3 && [KNIGHT.ms, KNIGHT.iv, KNIGHT.cap].every((k) => typeof bb[k] === 'number');

/**
 * The extra hit's scale (敌能-53, 敌能-95): `firstattack` on a read page, `FirstAttack`'s `atk_scale` alone; else null.
 * @param {FoeContext} ctx @param {SpeedUp} K
 */
function extraScale(ctx, K) {
  const f = ctx.talent(K.first);
  if (!f || typeof f.atk_scale !== 'number') return null;
  return K === LANCER ? (typeof f.paged === 'number' ? f.atk_scale : null) : (Object.keys(f).length === 1 ? f.atk_scale : null);
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
 * @param {FoeContext} ctx @param {SpeedUp} K
 */
function tryLayer(ctx, K) {
  const st = ctx.state, iv = ctx.frames(ctx.bb[K.iv]);
  if (st.get('tries') >= ctx.bb[K.cap] || !(iv > 0)) return;
  const acc = st.get('acc') + 1;
  if (acc < iv) { st.set('acc', acc); return; }
  const n = st.get('layers') + 1;
  st.set('layers', n);
  st.set('tries', st.get('tries') + 1);
  st.set('acc', acc - iv);
  ctx.setBuff(ctx.self, BUFF, n, { movePct: ctx.bb[K.ms] * n });
}

/**
 * 加速状态 (敌能-53, 敌能-95). 晕眩 or 束缚 leave it every tick. Blocked, it stays as it is and tries nothing; out of
 * it, a block keeps it from entering. The entering tick tries nothing. A normal hit that took HP while in it adds the
 * extra hit from the move speed of that moment, then the state ends.
 * @param {SpeedUp} K @param {(bb: Record<string, unknown>) => boolean} shaped @returns {FoeBehavior}
 */
const speedUp = (K, shaped) => Object.freeze({
  tick: (ctx) => {
    if (!shaped(ctx.bb)) return;
    if (held(ctx)) { exitRush(ctx); return; }
    if (ctx.blocked) return;
    if (ctx.state.get('on') !== 1) { ctx.state.set('on', 1); ctx.state.set('acc', 0); return; }
    tryLayer(ctx, K);
  },
  hit: (ctx, target, dealt) => {
    const k = extraScale(ctx, K);
    if (!shaped(ctx.bb) || k === null || !(dealt > 0) || ctx.state.get('on') !== 1) return;
    ctx.dealDamage(target, { type: K.type, amount: ctx.stats(ctx.self).moveSpeed * k });
    exitRush(ctx);
  },
});

/** 赏金猎人“骑士”'s speed-up, for the shared `Rush` (敌能-95). @type {FoeBehavior} */
export const knightRush = speedUp(KNIGHT, knightShape);

/** The behaviours of this file, by talent name. @type {Readonly<Record<string, FoeBehavior>>} */
export const lancerBehaviors = Object.freeze({ rush: speedUp(LANCER, rushShaped) });
