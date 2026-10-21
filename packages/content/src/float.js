// 掠海漂移体's 近地悬浮 and 喷气人's 升空 (docs/spec/foes.md 敌能-48). The drifter reuses the hover mark and keeps a ground
// route; the balloon really flies, then comes back to ground. Other TakeOff blackboards are not this ability. They act
// only through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext */

/** How long 近地悬浮's ending stun lasts, in seconds (敌能-48). */
const DROP_STUN = 0.5;
/** How often a held 升空检测器 looks at the block, in seconds. The grant frame does not count. */
const POLL = 0.33;
/** The opening of a flight whose move speed is ×0.1, and the same cut after landing, in seconds. */
const BRAKE = 1.5;
const LAND = 1.333;
/** 最终降低 90% (最终乘算). */
const FINAL_CUT = 0.1;
/** The blackboard key of the flight's 直接乘算. */
const SPEED_KEY = 'balloon_s[fly].move_speed';
/** The only keys 喷气人's TakeOff carries. */
const BALLOON_KEYS = new Set(['duration', SPEED_KEY]);

/**
 * 喷气人's blackboard (敌能-48): both values finite numbers, and no other key.
 * @param {Record<string, unknown>} bb
 */
function balloonShape(bb) {
  const speed = bb[SPEED_KEY];
  if (typeof bb.duration !== 'number' || !Number.isFinite(bb.duration)) return false;
  if (typeof speed !== 'number' || !Number.isFinite(speed)) return false;
  for (const k of Object.keys(bb)) if (!BALLOON_KEYS.has(k)) return false;
  return true;
}

/**
 * Whether a talent or skill of this name, with this blackboard, is the ability this file implements (敌能-48). Any
 * other name is not this family's concern: the caller still asks FOE_NEEDS.
 * @param {string} name @param {Record<string, unknown>} bb
 */
export function takeOffOwns(name, bb) {
  if (name !== 'TakeOff') return true;
  return balloonShape(bb);
}

/** 近地悬浮 ends (敌能-48): the block ends, the mark goes, and 0.5 s of stun is applied on top of whatever is there. @param {FoeContext} ctx */
function drop(ctx) {
  ctx.state.set('up', 0);
  ctx.removeBuff(ctx.self, 'hover');
  ctx.release();
  ctx.applyStatus(ctx.self, 'stun', { seconds: DROP_STUN });
}

/**
 * 近地悬浮 (敌能-48): hovering from the moment it appears — in the air for blocking and being targeted, still on the
 * ground route, still attacking, 失衡免疫 only while the mark holds. 晕眩, 沉睡 or 冻结 (无法行动 is the stun flag) ends
 * it for good, and afterwards only the blocker is a target.
 * @type {FoeBehavior}
 */
const Float = Object.freeze({
  spawn(ctx) {
    ctx.addBuff(ctx.self, { key: 'hover', flags: { hover: true, noDisplace: true } });
    ctx.state.set('up', 1);
  },
  tick(ctx) {
    if (ctx.state.get('up') !== 1) return;
    const f = ctx.stats(ctx.self).flags;
    if (f.stun || f.sleep || f.freeze) drop(ctx);
  },
  targets(ctx, cands) {
    if (ctx.state.get('up') === 1) return cands;
    const blocker = ctx.blocker();
    return blocker ? cands.filter((u) => u === blocker) : [];
  },
});

/** The flight's seconds ran out (敌能-48): back to the ground, the opening cut removed, then the landing. @param {FoeContext} ctx */
function flying(ctx) {
  if (ctx.self.buffs.some((b) => b.key === 'takeOff')) return;
  ctx.state.set('phase', 3);
  ctx.ground();
  ctx.release();
  ctx.removeBuff(ctx.self, 'takeOff:brake');
  ctx.addBuff(ctx.self, { key: 'takeOff:land', flags: { unblockable: true }, mods: { moveMul: FINAL_CUT }, left: ctx.frames(LAND) });
  ctx.use();
}

/** True while the landing cut is still on. Once it is gone the phase is idle, so the same turn may take a detector. @param {FoeContext} ctx */
function stillLanding(ctx) {
  if (ctx.self.buffs.some((b) => b.key === 'takeOff:land')) return true;
  ctx.state.set('phase', 0);
  return false;
}

/** Switches to flying (敌能-48): the detector goes, the block ends, and both speed changes start together. @param {FoeContext} ctx */
function lift(ctx) {
  ctx.state.set('phase', 2);
  ctx.fly();
  ctx.addBuff(ctx.self, {
    key: 'takeOff', flags: { noAttack: true, unblockable: true, noDisplace: true },
    mods: { movePct: ctx.bb[SPEED_KEY] }, left: ctx.frames(ctx.bb.duration),
  });
  ctx.addBuff(ctx.self, { key: 'takeOff:brake', mods: { moveMul: FINAL_CUT }, left: ctx.frames(BRAKE) });
  ctx.release();
}

/** One look at the block (敌能-48). The interval is reset either way; only a block that is there now lifts. @param {FoeContext} ctx */
function poll(ctx) {
  const wait = ctx.state.get('wait') - 1;
  if (wait > 0) { ctx.state.set('wait', wait); return; }
  ctx.state.set('wait', ctx.frames(POLL));
  if (ctx.blocked) lift(ctx);
}

/** The detector, with its first look one interval away (敌能-48). @param {FoeContext} ctx */
function hold(ctx) {
  ctx.state.set('phase', 1);
  ctx.state.set('wait', ctx.frames(POLL));
}

/** Ready, blocked now, able to act and not silenced (敌能-48): the only moment those gates apply. @param {FoeContext} ctx */
function mayHold(ctx) {
  const s = ctx.stats(ctx.self);
  return ctx.ready && ctx.blocked && !s.disabled && !s.flags.silence;
}

/**
 * 升空 (敌能-48). Phase 0 idle, 1 holding the detector, 2 flying, 3 landing. A blackboard that is not 喷气人's does
 * nothing, including when the skill was left on the enemy by hand.
 * @param {FoeContext} ctx
 */
function tickTakeOff(ctx) {
  if (!balloonShape(ctx.bb)) return;
  const phase = ctx.state.get('phase');
  if (phase === 2) { flying(ctx); return; }
  if (phase === 3 && stillLanding(ctx)) return;
  if (ctx.state.get('phase') === 1) { poll(ctx); return; }
  if (mayHold(ctx)) hold(ctx);
}

/** @type {FoeBehavior} */
const TakeOff = Object.freeze({ tick: tickTakeOff });

/** The behaviours of this file, by talent or skill name. @type {Readonly<Record<string, FoeBehavior>>} */
export const floatBehaviors = Object.freeze({ Float, TakeOff });
