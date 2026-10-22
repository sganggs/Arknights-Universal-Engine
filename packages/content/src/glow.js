// 微光之触 (docs/spec/foes.md 敌能-77). The read pages share one blackboard shape. Other ChargeAttack
// blackboards stay uncovered (关卡-2): the page marker is required, and extra keys are not this skill.

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext */

/** Keys the read shape may hold. `page` and `ground` are content extras, not enemy data. */
const OWN = new Set(['duration', 'atk_scale', 'range_radius', 'page', 'ground']);
/** Standing still while the charge runs. Removed when the charge ends, so a cancel does not leave it. */
const HOLD = 'glowHold';
/** 隐匿 (and, where the page says 隐匿免疫, 迷彩) does not take effect. The stealth buff itself stays. */
const VEIL = 'glowVeil';

/**
 * Whether this name and blackboard are the read 微光之触 (敌能-77). Any other name is not this family's concern.
 * @param {string} name @param {Record<string, unknown>} bb
 */
export function chargeAttackOwns(name, bb) {
  if (name !== 'ChargeAttack') return true;
  if (typeof bb.duration !== 'number' || typeof bb.atk_scale !== 'number' || typeof bb.range_radius !== 'number') return false;
  for (const k of Object.keys(bb)) if (!OWN.has(k)) return false;
  return true;
}

/** The read pages only (关卡-2). A matching blackboard without `page` is 点灯骑士, and does not run. @param {Record<string, number>} bb */
const armed = (bb) => chargeAttackOwns('ChargeAttack', bb) && bb.page === 1;

/** The unit whose spot is locked (敌能-77): 索敌-5 inside the radius, our units only. @param {FoeContext} ctx */
function lockTarget(ctx) {
  const ground = ctx.bb.ground === 1;
  const list = ctx.foes(ctx.bb.range_radius, { canHitFly: true }).filter((u) => u.base.neutral !== true && (!ground || u.base.motion !== 'FLY'));
  return ctx.order(list)[0];
}

/** The charge's own buffs (敌能-77). `ground` is the pages that name 隐匿免疫, so 迷彩 fails too. @param {FoeContext} ctx */
function raise(ctx) {
  ctx.addBuff(ctx.self, { key: HOLD, flags: { root: true } });
  ctx.addBuff(ctx.self, { key: VEIL, flags: ctx.bb.ground === 1 ? { unstealth: true, uncamou: true } : { unstealth: true } });
}

/** Drops the charge and its buffs. The locked coordinates can stay: nothing reads them until the next lock. @param {FoeContext} ctx */
function lower(ctx) {
  ctx.state.set('ch', 0);
  ctx.removeBuff(ctx.self, HOLD);
  ctx.removeBuff(ctx.self, VEIL);
}

/** The light bullet (敌能-77): one blast at the locked point, this frame, air included. @param {FoeContext} ctx */
function fire(ctx) {
  const st = ctx.state;
  ctx.blast({
    x: st.get('x'), y: st.get('y'), radius: ctx.bb.range_radius, delay: 0, air: true, sourced: true,
    type: 'arts', amount: ctx.bb.atk_scale * ctx.stats(ctx.self).atk,
  });
}

/**
 * One frame of a charge already started (敌能-77). A hindrance or silence ends it without the shot. The cooldown
 * starts as the charge ends, including that cancel.
 * @param {FoeContext} ctx
 */
function channel(ctx) {
  const s = ctx.stats(ctx.self);
  if (s.disabled || s.flags.silence || ctx.self.hp <= 0) { lower(ctx); ctx.use(); return; }
  ctx.state.set('ch', ctx.state.get('ch') - 1);
  if (ctx.state.get('ch') > 0) return;
  fire(ctx);
  lower(ctx);
  ctx.use();
}

/** Starts a charge when the skill is ready and someone can be locked (敌能-77). The cooldown waits for the end. @param {FoeContext} ctx */
function begin(ctx) {
  const s = ctx.stats(ctx.self), t = lockTarget(ctx);
  if (!ctx.ready || s.disabled || s.flags.silence || !t) return;
  ctx.state.set('x', t.x);
  ctx.state.set('y', t.y);
  ctx.state.set('ch', ctx.frames(ctx.bb.duration));
  raise(ctx);
}

/** 微光之触 (敌能-77). While the charge runs it does not attack. @type {FoeBehavior} */
const ChargeAttack = Object.freeze({
  targets: (ctx, cands) => (ctx.state.get('ch') > 0 ? [] : cands),
  tick: (ctx) => {
    if (!armed(ctx.bb)) return;
    if (ctx.state.get('ch') > 0) channel(ctx);
    else begin(ctx);
  },
});

/** @type {Readonly<Record<string, FoeBehavior>>} */
export const glowBehaviors = Object.freeze({ ChargeAttack });
