// 假想敌：蚀裂 and 假想敌：淤困 (docs/spec/foes.md 敌能-160, 敌能-161). Talent `1` is shared with the spy's ammunition
// (敌能-31), the barrel (敌能-62) and the 孽生者's toxin (敌能-127): this file only adds the two shapes, the one
// behaviour object stays in devourers.js and the shape check of `1` in wine.js. They act only through the context
// (ADR 0055).
import { FPS, roundHalfEven } from '@aue/math';
import { KIND } from '@aue/sim';

/** @typedef {import('@aue/sim').FoeContext} FoeContext */
/** @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').FoeHpDamage} FoeHpDamage */
/** @typedef {{ source: Unit | null, target: Unit, element: string }} ElementBurst */

/** 蚀裂's cloud (敌能-160): these four numbers and nothing else. */
const CLOUD_KEYS = ['projectile_range', 'projectile_life_time', 'interval', 'damage_atk_scale'];
/** 淤困's attachment (敌能-161): these three numbers and nothing else. `damage_scale` is unread. */
const SILT_KEYS = ['atk_scale', 'damage_scale', 'ep_damage_scale'];
/** 自缚 while attached (敌能-161). A key nobody else uses, so removing it leaves another root alone. */
const BIND = 'imaginaryBind';
/**
 * 不进行普通攻击 (敌能-161). `applyWay` NONE still swings at the blocker (敌人攻击-1, 敌能-37), and silence drops only the
 * attachment, so this stays for the whole life of the shape.
 */
const QUIET = 'imaginaryQuiet';
/** The page's 1000 of the same element when the host bursts (敌能-161). Not a blackboard key. */
const SPREAD = 1000;

/** Whether `bb` has exactly these keys, each a number. @param {Record<string, unknown>} bb @param {readonly string[]} keys */
const exact = (bb, keys) => Object.keys(bb).length === keys.length && keys.every((k) => typeof bb[k] === 'number');

/** 蚀裂 (敌能-160). @param {Record<string, unknown>} bb */
export const cloudShape = (bb) => exact(bb, CLOUD_KEYS);

/** 淤困 (敌能-161). @param {Record<string, unknown>} bb */
export const siltShape = (bb) => exact(bb, SILT_KEYS);

/** A 我方单位 (敌能-160, 敌能-161): operators and summons, and our devices. A neutral is an enemy. @param {Unit} u */
const ours = (u) => u.kind !== KIND.ENEMY && !(u.kind === KIND.DEVICE && u.base.hostile === true);

/**
 * 蚀裂 hit (敌能-160): the 我方单位 behind a hit that brings its HP to 0 — the hit's source, or the unit it credits when
 * it has none — is the one its cloud is thrown at.
 * @param {FoeContext} ctx @param {FoeHpDamage} hit @returns {void}
 */
export function cloudHit(ctx, hit) {
  if (!cloudShape(ctx.bb) || hit.amount < ctx.self.hp) return;
  const by = hit.source ?? hit.credit;
  ctx.state.set('killer', by && ours(by) ? by.id : 0);
}

/**
 * 蚀裂's cloud (敌能-160): knocked down and not silenced (死亡爆炸, as 敌能-58), at the 我方单位 that dealt the killing
 * hit while it is still on the field, else where it fell; at once. The zone ticks once a second, so `interval` must be
 * that one second; a different number is not placed.
 * @param {FoeContext} ctx @returns {void}
 */
export function cloudDeath(ctx) {
  const bb = ctx.bb, self = ctx.self;
  if (!cloudShape(bb) || bb.interval !== 1 || ctx.stats(self).flags.silence) return;
  const id = ctx.state.get('killer'), at = (id > 0 ? ctx.unit(id) : null) ?? self;
  ctx.zone({
    x: at.x, y: at.y, radius: bb.projectile_range, life: bb.projectile_life_time, low: 0, high: 0,
    arts: ctx.stats(self).atk * bb.damage_atk_scale, air: true,
  });
}

/** The buff key of this 淤困's attachment on its host (敌能-161). Two of them do not share a key. @param {FoeContext} ctx */
const hostKey = (ctx) => `silt:${ctx.self.id}`;

/** Talent silenced (敌能-161): the ability lines start with ·. @param {FoeContext} ctx */
const silenced = (ctx) => ctx.stats(ctx.self).flags.silence === true;

/** The standing 不进行普通攻击 (敌能-161). Put back if something else took the buff off. @param {FoeContext} ctx */
function keepQuiet(ctx) {
  if (!ctx.self.buffs.some((b) => b.key === QUIET)) ctx.addBuff(ctx.self, { key: QUIET, flags: { noAttack: true } });
}

/** Drops this attachment's buffs and 自缚 (敌能-161). The host id 0 means there is none. @param {FoeContext} ctx */
function dropHost(ctx) {
  const id = ctx.state.get('host');
  ctx.state.set('host', 0);
  ctx.state.set('due', 0);
  ctx.removeBuff(ctx.self, BIND);
  if (!(id > 0)) return;
  const u = ctx.unit(id);
  if (u) ctx.removeBuff(u, hostKey(ctx));
}

/**
 * Starts an attachment (敌能-161): 闪现 to the blocker's tile centre, 自缚, and the element-taken multiplier. The first
 * arts hit waits a full second.
 * @param {FoeContext} ctx @param {Unit} host
 */
function beginAttach(ctx, host) {
  ctx.place(roundHalfEven(host.x), roundHalfEven(host.y));
  ctx.addBuff(ctx.self, { key: BIND, flags: { root: true } });
  ctx.state.set('host', host.id);
  ctx.state.set('due', FPS);
  ctx.lend(host, hostKey(ctx), { mods: { epTakenMul: ctx.bb.ep_damage_scale } });
}

/** One frame of the arts tick (敌能-161): current ATK × `atk_scale`, once a second, not on the frame it attached. @param {FoeContext} ctx @param {Unit} host */
function tickDot(ctx, host) {
  const due = ctx.state.get('due') - 1;
  if (due > 0) { ctx.state.set('due', due); return; }
  ctx.state.set('due', FPS);
  ctx.dealDamage(host, { type: 'arts', amount: ctx.stats(ctx.self).atk * ctx.bb.atk_scale });
}

/**
 * 淤困 while its talent is the attachment (敌能-161). Block is seen at the turn's start (敌能-2), so the frame a block
 * begins is the next turn. Silence drops the attachment on that turn; a stun does not. 不进行普通攻击 is not part of that.
 * @param {FoeContext} ctx @returns {void}
 */
export function siltTick(ctx) {
  if (!siltShape(ctx.bb)) return;
  keepQuiet(ctx);
  const host = ctx.blocker();
  const stop = host === null || !(host.hp > 0) || silenced(ctx);
  const same = !stop && ctx.state.get('host') === host.id;
  if (!same) dropHost(ctx);
  if (stop || host === null) return;
  if (!same) beginAttach(ctx, host);
  else { ctx.lend(host, hostKey(ctx), { mods: { epTakenMul: ctx.bb.ep_damage_scale } }); tickDot(ctx, host); }
}

/** 淤困 knocked down (敌能-161): the attachment ends with it, not two frames later. @param {FoeContext} ctx @returns {void} */
export function siltDeath(ctx) {
  if (siltShape(ctx.bb)) dropHost(ctx);
}

/**
 * The host's 元素爆发 (敌能-161): 1000 of that element on the cross `around` returns. The host is beginning its burst,
 * so 元素-3 makes its own 1000 come to nothing; the others are dealt. Silence does not spread.
 * @param {FoeContext} ctx @param {ElementBurst} burst @returns {void}
 */
export function siltBurst(ctx, burst) {
  if (!siltShape(ctx.bb) || silenced(ctx)) return;
  const id = ctx.state.get('host');
  if (!(id > 0) || burst.target.id !== id) return;
  const host = ctx.unit(id);
  if (!host) return;
  for (const u of ctx.around(host, 'cross')) if (ours(u)) ctx.dealEp(u, burst.element, SPREAD);
}
