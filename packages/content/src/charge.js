// 神勇的帕拉杜利斯 (docs/spec/foes.md 敌能-112). Its skill `rush` (with the page's `charge` marker; 萨卡兹穿刺手's talent
// of the name is 敌能-53): unblocked, ready, able and not silenced, with one of ours on the ground ahead of it in its
// row or column along its way, it marks that unit's tile and charges there — neither attacking nor blocked —; the first
// of ours on the ground that comes within 0.45 takes `CollideChar`'s `atk_scale_collide` × 攻击力 physical damage, and
// that ends the charge, as reaching the tile does. `rushEndNormal` and `rushEndAdvance` are its two endings; the second,
// the wall it runs into under 入戏(敌方), has no source in the engine's levels. It acts only through the context.

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext @typedef {import('@aue/sim').Unit} Unit */

/** How near one of ours is hit (敌能-112: 「进入半径0.45的我方单位」). */
const HIT = 0.45;
/** The charge (敌能-112): not attacking, not blocked. */
const CHARGING = 'charging';

/** `rush` with the page's marker alone (敌能-112). @param {Record<string, unknown>} bb */
export const chargeShape = (bb) => Object.keys(bb).length === 1 && bb.charge === 1;

/** Whether a behaviour of this name is this family's, by its shape (关卡-2); any other name passes. @param {string} name @param {Record<string, unknown>} bb */
export function chargeOwns(name, bb) {
  if (name === 'CollideChar') return Object.keys(bb).length === 1 && typeof bb.atk_scale_collide === 'number';
  if (name === 'rushEndNormal') return Object.keys(bb).length === 0;
  if (name === 'rushEndAdvance') return ['stun', 'cooldown', 'atk_scale_pure'].every((k) => typeof bb[k] === 'number') && Object.keys(bb).length === 3;
  return true;
}

/**
 * The unit of ours ahead (敌能-112): on the ground, in its row or column, on the side its course points to; the
 * nearest. @param {FoeContext} ctx @returns {Unit | null}
 */
function ahead(ctx) {
  const self = ctx.self, aim = ctx.course();
  if (!aim) return null;
  const dx = Math.sign(Math.round(aim.x - self.x)), dy = Math.sign(Math.round(aim.y - self.y));
  if ((dx === 0) === (dy === 0)) return null;
  const row = Math.round(self.y), col = Math.round(self.x);
  const along = ctx.ours().filter((u) => !ctx.stats(u).flying && (dx !== 0 ? Math.round(u.y) === row && Math.sign(u.x - self.x) === dx : Math.round(u.x) === col && Math.sign(u.y - self.y) === dy));
  return along.toSorted((a, b) => Math.abs(a.x - self.x) + Math.abs(a.y - self.y) - (Math.abs(b.x - self.x) + Math.abs(b.y - self.y)) || a.id - b.id)[0] ?? null;
}

/** The charge over (敌能-112). @param {FoeContext} ctx */
function stop(ctx) {
  ctx.state.set('on', 0);
  ctx.removeBuff(ctx.self, CHARGING);
}

/**
 * One frame of the charge (敌能-112): the first of ours on the ground within 0.45 is hit and the charge ends; else a
 * step toward the tile, and at it the charge ends. @param {FoeContext} ctx
 */
function charge(ctx) {
  const self = ctx.self, st = ctx.state, scale = ctx.talent('CollideChar')?.atk_scale_collide ?? 0;
  const t = ctx.ours().find((u) => !ctx.stats(u).flying && (u.x - self.x) * (u.x - self.x) + (u.y - self.y) * (u.y - self.y) <= HIT * HIT);
  if (t) { ctx.dealDamage(t, { type: 'phys', amount: ctx.stats(self).atk * scale }); stop(ctx); return; }
  if (!ctx.chase(st.get('tx'), st.get('ty')) || (self.x === st.get('tx') && self.y === st.get('ty'))) stop(ctx);
}

/** `rush` (敌能-112). @type {FoeBehavior} */
export const chargeRush = Object.freeze({
  targets: (ctx, cands) => (chargeShape(ctx.bb) && ctx.state.get('on') === 1 ? [] : cands),
  tick: (ctx) => {
    if (!chargeShape(ctx.bb)) return;
    if (ctx.state.get('on') === 1) { charge(ctx); return; }
    const s = ctx.stats(ctx.self);
    if (!ctx.ready || ctx.blocked || s.disabled || s.flags.silence) return;
    const t = ahead(ctx);
    if (!t) return;
    ctx.use();
    ctx.state.set('on', 1);
    ctx.state.set('tx', Math.round(t.x));
    ctx.state.set('ty', Math.round(t.y));
    ctx.addBuff(ctx.self, { key: CHARGING, flags: { noAttack: true, unblockable: true } });
  },
});

/** Read by `rush`, or its endings (敌能-112). @type {FoeBehavior} */
const idle = Object.freeze({});

/** The behaviours of this file, by name; `rush` dispatches here by its shape (foes.js). @type {Readonly<Record<string, FoeBehavior>>} */
export const chargeBehaviors = Object.freeze({ CollideChar: idle, rushEndNormal: idle, rushEndAdvance: idle });
