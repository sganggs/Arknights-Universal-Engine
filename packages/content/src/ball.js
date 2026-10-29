// 足球类敌人 (docs/spec/football.md 足球-2): talent `physic` gives a ball its friction factor, restitution, default force
// and the damage that kicks it; `aura` with only `block_cnt` is the block a unit of ours needs left to stop it — read
// here, so that `aura` is not 敌能-28's supply car. 阵地足球锦标's balls (cup.md): 决胜时刻球's countdown (锦标-4) and
// 充能飘浮球 aloft while it rolls fast (锦标-5).
/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */

/** The keys of a ball's `physic` (足球-2). */
export const PHYSIC_KEYS = Object.freeze(['friction_factor', 'restitution_factor', 'value', 'force']);

/** The block a ball's `aura` gives when it has none (足球-2: 「阻挡数不小于3」). */
const BALL_BLOCK = 3;

/** Whether an `aura` blackboard is a ball's (足球-2): `block_cnt` alone. @param {Record<string, unknown>} bb */
export const ballAura = (bb) => {
  const keys = Object.keys(bb);
  return keys.length === 1 && keys[0] === 'block_cnt' && typeof bb.block_cnt === 'number';
};

/**
 * `physic` (足球-2, 足球-16): at its spawn the enemy becomes a ball — `aura`'s `block_cnt` (3 when it has no ball
 * `aura`); a goal of it scores `score` (足球-7: the page's extra for 至纯源石球), else 1; it leaves `cover` (北境意志球's
 * ice, 底海滑动球's slime) on the tiles it enters.
 * @type {FoeBehavior}
 */
const physic = Object.freeze({
  spawn: (ctx) => {
    const bb = ctx.bb, aura = ctx.talent('aura');
    if (!PHYSIC_KEYS.every((k) => typeof bb[k] === 'number')) return;
    const block = aura && ballAura(aura) ? /** @type {number} */ (aura.block_cnt) : BALL_BLOCK;
    ctx.ball({ friction: bb.friction_factor, restitution: bb.restitution_factor, force: bb.force, need: bb.value, block, points: typeof bb.score === 'number' ? bb.score : 1,
      ...(typeof bb.cover === 'number' ? { cover: bb.cover } : {}) });
  },
});

/**
 * Whether a ball started to roll since its last turn (足球-16): it is in 失衡 now and was not then.
 * @param {import('@aue/sim').FoeContext} ctx
 */
function kicked(ctx) {
  const was = ctx.state.get('rolling');
  ctx.state.set('rolling', ctx.unbalanced ? 1 : 0);
  return ctx.unbalanced && !was;
}

/** Whether a `boom` blackboard is a ball's (足球-16): its counter. @param {Record<string, unknown>} bb */
export const ballBoom = (bb) => ['max_value', 'add_value_min', 'add_value_max', 'range_radius', 'duration', 'stun', 'damage'].every((k) => typeof bb[k] === 'number');

/**
 * 高能源石球's counter (足球-16): from `max_value`, each time it starts to roll it changes by a random amount in
 * [add_value_min, add_value_max) (随机-1); once it is at most 0, `duration` seconds on the ball blows up where it is
 * then — every unit within `range_radius`, flying too, takes `damage` true damage and `stun` seconds of 晕眩 — and
 * the counter is `max_value` again. @param {import('@aue/sim').FoeContext} ctx
 */
export function ballBoomTick(ctx) {
  const bb = ctx.bb, st = ctx.state, self = ctx.self;
  if (!st.get('set')) { st.set('set', 1); st.set('count', bb.max_value); }
  if (kicked(ctx)) {
    st.set('count', st.get('count') + bb.add_value_min + ctx.draw() * (bb.add_value_max - bb.add_value_min));
    if (st.get('count') <= 0 && !st.get('at')) st.set('at', ctx.frame + ctx.frames(bb.duration));
  }
  if (!st.get('at') || ctx.frame < st.get('at')) return;
  ctx.blast({ x: self.x, y: self.y, radius: bb.range_radius, delay: 0, air: true, sourced: true, all: true, type: 'true', amount: bb.damage, status: { key: 'stun', seconds: bb.stun } });
  st.set('count', bb.max_value);
  st.set('at', 0);
}

/**
 * 漏气甲虫球 and 膨胀甲虫球 (足球-16, `airleakage`, `airinflation`): each time it starts to roll, its kick threshold
 * changes by `value`, at most `kick_times` times. @type {FoeBehavior}
 */
const air = Object.freeze({
  tick: (ctx) => {
    const bb = ctx.bb, st = ctx.state;
    if (!kicked(ctx) || st.get('n') >= bb.kick_times) return;
    st.set('n', st.get('n') + 1);
    ctx.ballNeed(bb.value);
  },
});

/** Seconds of 决胜时刻球's countdown in our penalty round (锦标-4: 「倒计时10秒」). */
export const COUNTDOWN_SECONDS = 10;

/**
 * `Countdown` (锦标-4, 决胜时刻球's skill): at its spawn in our penalty round the ball holds what hits it for
 * COUNTDOWN_SECONDS and is then kicked by it. @type {FoeBehavior}
 */
const Countdown = Object.freeze({ spawn: (ctx) => { ctx.countdown(COUNTDOWN_SECONDS); } });

/** The buff of a 充能飘浮球 aloft (锦标-5). */
export const ALOFT = 'aloft';

/**
 * `flyBySpeed` (锦标-5, 充能飘浮球): while it rolls faster than `min_speed` it is aloft — 近地悬浮, an air unit
 * (敌能-20's `hover`) —, else not; its height is only a look. @type {FoeBehavior}
 */
const flyBySpeed = Object.freeze({
  tick: (ctx) => {
    const s = ctx.self.slide, fast = (s ? Math.sqrt(s.vx * s.vx + s.vy * s.vy) : 0) > ctx.bb.min_speed, up = ctx.buffValue(ctx.self, ALOFT) !== null;
    if (fast && !up) ctx.addBuff(ctx.self, { key: ALOFT, value: 1, flags: { hover: true } });
    else if (!fast && up) ctx.removeBuff(ctx.self, ALOFT);
  },
});

/** The behaviours of this file, by ability name. @type {Readonly<Record<string, FoeBehavior>>} */
export const ballBehaviors = Object.freeze({ physic, airleakage: air, airinflation: air, Countdown, flyBySpeed });
