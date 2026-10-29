// `Attack` of two more shapes (docs/spec/foes.md 敌能-106): 自制投石机's three stones and 投嗣育母's thrown 注亡拟嗣.
// 自制投石机: its normal attack's main hit is three stones on the target's spot instead, `attack@hit_interval` s apart,
// each its 攻击力 as physical splash within three times `attack@projectile_range` (the 入戏(敌方) scatter has no source in
// the engine's levels). 投嗣育母: it attacks only ours on low ground, and each hit that connects brings one `enemy_key`
// in on the target's tile, within a 0.4 square. 发条巡逻机器's `IntoFire` slows it in a 紧急供暖器's reach, which the
// engine's levels do not have. It acts only through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext */

/** Whether `bb` has exactly these keys, each a number. @param {Record<string, unknown>} bb @param {readonly string[]} keys */
const exact = (bb, keys) => Object.keys(bb).length === keys.length && keys.every((k) => typeof bb[k] === 'number');

const STONES = Object.freeze(['attack@times', 'attack@projectile_range', 'attack@offset_bound', 'attack@hit_interval']);
/** The stone's splash: the page's 「3.0倍可变半径」 of `attack@projectile_range` (敌能-106, INF-0670). */
const SPLASH_MUL = 3;
/** Half the side of the square a 注亡拟嗣 lands in around the target's tile centre (敌能-106: 「0.4边长正方形」). */
const BROOD_BOUND = 0.2;

/** 自制投石机's `Attack` (敌能-106). @param {Record<string, unknown>} bb */
export const stonesShape = (bb) => exact(bb, STONES);
/** 投嗣育母's `Attack` (敌能-106): `enemy_key` alone. @param {Record<string, unknown>} bb */
export const broodShape = (bb) => Object.keys(bb).length === 1 && typeof bb.enemy_key === 'string' && bb.enemy_key !== '';

/** Whether a behaviour of this name is this file's, by its shape (关卡-2); any other name passes. @param {string} name @param {Record<string, unknown>} bb */
export const catapultOwns = (name, bb) => name !== 'IntoFire' || exact(bb, ['move_speed']);

/**
 * The stones (敌能-106): `attack@times` blasts on the target's spot, the first at once, then `attack@hit_interval` s
 * apart; the main hit itself does not land. @param {FoeContext} ctx @param {import('@aue/sim').Unit} t
 */
function stones(ctx, t) {
  const bb = ctx.bb, atk = ctx.stats(ctx.self).atk, radius = bb['attack@projectile_range'] * SPLASH_MUL;
  for (let i = 0; i < bb['attack@times']; i++) {
    ctx.blast({ x: t.x, y: t.y, radius, delay: i * bb['attack@hit_interval'], air: false, sourced: true, type: 'phys', amount: atk });
  }
  return true;
}

/** `Attack` of these shapes (敌能-106). @type {FoeBehavior} */
export const catapultAttack = Object.freeze({
  targets: (ctx, cands) => (broodShape(ctx.bb) ? cands.filter((u) => ctx.onLow(u)) : cands),
  cancelHit: (ctx, t) => (stonesShape(ctx.bb) ? stones(ctx, t) : false),
  landed: (ctx, t) => {
    if (!broodShape(ctx.bb)) return;
    const key = /** @type {string} */ (/** @type {unknown} */ (ctx.bb.enemy_key));
    ctx.summon(key, { cnt: 1, delay: 0, bound: BROOD_BOUND, dx: Math.round(t.x) - ctx.self.x, dy: Math.round(t.y) - ctx.self.y });
  },
});

/** The behaviours of this file, by name; `Attack` dispatches here by its shape (whip.js). @type {Readonly<Record<string, FoeBehavior>>} */
export const catapultBehaviors = Object.freeze({ IntoFire: Object.freeze({}) });
