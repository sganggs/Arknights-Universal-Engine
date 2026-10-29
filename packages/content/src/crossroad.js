// “十字路口”试做型 (docs/spec/foes.md 敌能-115): 失衡免疫 and never attacking; each second it hits, along each of the four
// straight ways, the first of ours within the bolt's 0.2 s at 6.0 tiles a second and its 0.2 radius — `attack@FourDirAttack`
// × 攻击力 arts —, and each of ours on the ground within 0.7 — `attack@CloseAttack` × 攻击力 arts. The 行星碎屑 it pushes are
// not in the engine's levels. The bolts land at once (INF-0672). It acts only through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext @typedef {import('@aue/sim').Unit} Unit */

/** The bolt's reach: 6.0 tiles a second for 0.2 s, plus its 0.2 radius (敌能-115). */
const REACH = 6 * 0.2, WIDTH = 0.2;
/** The close hit's radius (敌能-115). */
const CLOSE = 0.7;
const DIRS = Object.freeze([[1, 0], [-1, 0], [0, 1], [0, -1]]);

/** `AttackTrigger` of this shape (敌能-115). @param {Record<string, unknown>} bb */
const crossShape = (bb) => Object.keys(bb).length === 2 && typeof bb['attack@FourDirAttack'] === 'number' && typeof bb['attack@CloseAttack'] === 'number';

/** Whether a behaviour of this name is this family's, by its shape (关卡-2); any other name passes. @param {string} name @param {Record<string, unknown>} bb */
export const crossOwns = (name, bb) => name !== 'AttackTrigger' || crossShape(bb);

/** The first of ours a bolt along (dx, dy) meets (敌能-115), or null. @param {FoeContext} ctx @param {number} dx @param {number} dy */
function first(ctx, dx, dy) {
  const self = ctx.self;
  /** @param {Unit} u */
  const along = (u) => (u.x - self.x) * dx + (u.y - self.y) * dy, off = (/** @type {Unit} */ u) => Math.abs((u.x - self.x) * dy - (u.y - self.y) * dx);
  return ctx.ours().filter((u) => along(u) > 0 && along(u) <= REACH + WIDTH && off(u) <= WIDTH).toSorted((a, b) => along(a) - along(b) || a.id - b.id)[0] ?? null;
}

/** Each second (敌能-115). @param {FoeContext} ctx */
function pulse(ctx) {
  const self = ctx.self, atk = ctx.stats(self).atk, bb = ctx.bb;
  for (const [dx, dy] of DIRS) {
    const t = first(ctx, dx, dy);
    if (t) ctx.dealDamage(t, { type: 'arts', amount: atk * bb['attack@FourDirAttack'], isProjectile: true });
  }
  for (const u of ctx.ours().filter((x) => !ctx.stats(x).flying && (x.x - self.x) * (x.x - self.x) + (x.y - self.y) * (x.y - self.y) <= CLOSE * CLOSE)) {
    ctx.dealDamage(u, { type: 'arts', amount: atk * bb['attack@CloseAttack'] });
  }
}

/** `AttackTrigger` (敌能-115). @type {FoeBehavior} */
const AttackTrigger = Object.freeze({
  spawn: (ctx) => { if (crossShape(ctx.bb)) ctx.addBuff(ctx.self, { key: 'crossroad', flags: { noDisplace: true, noAttack: true } }); },
  tick: (ctx) => {
    if (!crossShape(ctx.bb)) return;
    const st = ctx.state;
    if (st.get('next') === 0) st.set('next', ctx.frame + ctx.frames(1));
    if (ctx.frame < st.get('next')) return;
    st.set('next', ctx.frame + ctx.frames(1));
    if (!ctx.stats(ctx.self).disabled) pulse(ctx);
  },
});

/** The behaviours of this file, by name. @type {Readonly<Record<string, FoeBehavior>>} */
export const crossBehaviors = Object.freeze({ AttackTrigger });
