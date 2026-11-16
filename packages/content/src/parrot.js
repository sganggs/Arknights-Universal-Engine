// 吉兆飞鳞 (docs/spec/foes.md 敌能-147). `Mode` drives its two modes: 初始模式 hovers (近地悬浮) with 失衡免疫; 晕眩 or
// 沉睡 puts it in 晕眩模式 — on the ground, unblockable, stunned `Stun.duration` s — until neither holds it; a freeze's
// end stuns it 0.05 s (【失温坠落】); the first damage outside 晕眩模式 speeds it up for `M0SpeedUp.duration` s. 搬运模式
// needs a 寻险水手 the engine cannot run, so that mode's talents and skill have nothing to act on. Every ability needs
// the page marker `parrot`: 噩兆飞鳞 and the other users of `Stun` and `Mode` share the shapes. They act only through
// the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext */

/** 【失温坠落】's stun in seconds: on the page, not in the blackboard (敌能-147). */
const CHILL_STUN = 0.05;
/** The buffs of 初始模式 and 晕眩模式, and the speed-up's: keys no other ability gives, so removing them touches no one else's. */
const FLOAT = 'parrot:float';
const DOWN = 'parrot:down';
const RUN = 'parrot:run';
/** The `phase` state: 0 before 初始模式 began, then 初始模式 or 晕眩模式. */
const UP = 1;
const GROUNDED = 2;

/** A finite number. @param {unknown} v */
const num = (v) => typeof v === 'number' && Number.isFinite(v);
/** Seconds the frame conversion takes (时间-2): finite and not below 0. @param {unknown} v */
const secs = (v) => num(v) && /** @type {number} */ (v) >= 0;
/** A name, as the data's `enemy_key` stores it (敌能-64). @param {unknown} v */
const text = (v) => typeof v === 'string';

/**
 * Exactly these keys, each passing its check: one key more or less, or text where a number belongs, is another shape.
 * @param {Record<string, unknown>} bb @param {Record<string, (v: unknown) => boolean>} keys
 */
function exact(bb, keys) {
  const names = Object.keys(keys);
  return Object.keys(bb).length === names.length && names.every((k) => Object.hasOwn(bb, k) && keys[k](bb[k]));
}

/** Each name's shape on the read page, the marker included (敌能-147). @type {Readonly<Record<string, (bb: Record<string, unknown>) => boolean>>} */
const SHAPES = Object.freeze({
  // Any other mode is a level starting it in 搬运模式, which this clause does not do.
  Mode: (bb) => exact(bb, { mode: (v) => v === 0, parrot: num }),
  Stun: (bb) => exact(bb, { duration: secs, parrot: num }),
  M0SpeedUp: (bb) => exact(bb, { duration: secs, move_speed: num, parrot: num }),
  M1SpeedUp: (bb) => exact(bb, { duration: secs, move_speed: num, parrot: num }),
  // The talent's checkpoint, and the skill “丢下去！” under the same name.
  ThrowEnemy: (bb) => exact(bb, { checkpoint: num, parrot: num }) || exact(bb, { enemy_key: text, cnt: num, delay: num, mode: num, parrot: num }),
  StateController: (bb) => exact(bb, { enemy_key: text, cnt: num, delay: num, parrot: num }),
});

/**
 * Whether a talent or skill of this name, with this blackboard, is this page's (敌能-147, 关卡-2). Any other name is not
 * this family's concern: the caller still asks FOE_NEEDS.
 * @param {string} name @param {Record<string, unknown>} bb
 */
export function parrotOwns(name, bb) {
  return !Object.hasOwn(SHAPES, name) || SHAPES[name](bb);
}

/** 近地悬浮 with 失衡免疫, 初始模式's buff. @returns {import('@aue/sim').buffs.BuffInit} */
const floating = () => ({ key: FLOAT, flags: { hover: true, noDisplace: true } });
/** 无法被阻挡, 晕眩模式's buff: no 失衡免疫 (the page lists it for the other two modes only). @returns {import('@aue/sim').buffs.BuffInit} */
const downed = () => ({ key: DOWN, flags: { unblockable: true } });

/** 初始模式 (敌能-147): 近地悬浮 begins — the block ends first (术语释义) — and 晕眩模式's buff goes. @param {FoeContext} ctx */
function float(ctx) {
  ctx.state.set('phase', UP);
  ctx.removeBuff(ctx.self, DOWN);
  ctx.release();
  ctx.addBuff(ctx.self, floating());
}

/**
 * 晕眩模式 (敌能-147): the speed-up goes, 近地悬浮 ends — the block ends, then the hover goes (术语释义) —, it cannot be
 * blocked, and `seconds` of stun run alongside whatever put it there.
 * @param {FoeContext} ctx @param {number} seconds
 */
function ground(ctx, seconds) {
  ctx.state.set('phase', GROUNDED);
  ctx.removeBuff(ctx.self, RUN);
  ctx.release();
  ctx.removeBuff(ctx.self, FLOAT);
  ctx.addBuff(ctx.self, downed());
  ctx.applyStatus(ctx.self, 'stun', { seconds });
}

/** The mode's buff, given back when something else removed it: the mode, not the buff, is the state (敌能-147). @param {FoeContext} ctx */
function keep(ctx) {
  const up = ctx.state.get('phase') === UP;
  if (!ctx.self.buffs.some((b) => b.key === (up ? FLOAT : DOWN))) ctx.addBuff(ctx.self, up ? floating() : downed());
}

/**
 * 首次受到伤害 (敌能-147): the first turn `hurt` is set — 敌能-40's reading — after a turn that ended in 初始模式, move
 * speed × `move_speed` (最终乘算) for `duration` s; once. Damage taken in 晕眩模式 does not spend it.
 * @param {FoeContext} ctx
 */
function speedUp(ctx) {
  if (!ctx.hurt || ctx.state.get('ran') === 1 || ctx.state.get('phase') !== UP) return;
  const run = ctx.talent('M0SpeedUp');
  if (!run || !SHAPES.M0SpeedUp(run)) return;
  ctx.state.set('ran', 1);
  const left = ctx.frames(run.duration);
  if (left > 0) ctx.addBuff(ctx.self, { key: RUN, mods: { moveMul: run.move_speed }, left });
}

/** 【失温坠落】 (敌能-147): a freeze seen at a turn start is noted; the first turn start without it, 0.05 s of stun. @param {FoeContext} ctx */
function chill(ctx) {
  if (ctx.stats(ctx.self).flags.freeze) { ctx.state.set('chill', 1); return; }
  if (ctx.state.get('chill') !== 1) return;
  ctx.state.set('chill', 0);
  ctx.applyStatus(ctx.self, 'stun', { seconds: CHILL_STUN });
}

/**
 * The switch (敌能-147): 晕眩 or 沉睡 in 初始模式 — 无法行动 is the stun flag here (敌能-48) — grounds it; neither in
 * 晕眩模式 floats it again. A freeze alone does neither. @param {FoeContext} ctx @param {number} seconds `Stun`'s
 */
function shift(ctx, seconds) {
  const f = ctx.stats(ctx.self).flags, held = !!(f.stun || f.sleep), phase = ctx.state.get('phase');
  if (phase === UP && held) ground(ctx, seconds);
  else if (phase === GROUNDED && !held) float(ctx);
  else keep(ctx);
}

/** `Stun`'s seconds when `Mode` and `Stun` are this page's shapes, else null (敌能-147). @param {FoeContext} ctx */
function stunOf(ctx) {
  const stun = ctx.talent('Stun');
  return SHAPES.Mode(ctx.bb) && stun !== null && SHAPES.Stun(stun) ? stun.duration : null;
}

/**
 * `Mode` (敌能-147): 初始模式 from the spawn; then each turn the speed-up, 【失温坠落】 and the switch, in that order —
 * the damage `hurt` reports came before this turn's switch, in the mode it was in then. Talents are not silenced.
 * @type {FoeBehavior}
 */
const Mode = Object.freeze({
  spawn(ctx) { if (stunOf(ctx) !== null) float(ctx); },
  tick(ctx) {
    const seconds = stunOf(ctx);
    if (seconds === null || ctx.state.get('phase') === 0) return;
    speedUp(ctx);
    chill(ctx);
    shift(ctx, seconds);
  },
});

/** `Stun` and `M0SpeedUp` are read by `Mode`; 搬运模式's `M1SpeedUp`, `ThrowEnemy` and `StateController` have nothing to act on (敌能-147). @type {FoeBehavior} */
const idle = Object.freeze({});

/** The behaviours of this file, by talent or skill name. @type {Readonly<Record<string, FoeBehavior>>} */
export const parrotBehaviors = Object.freeze({ Mode, Stun: idle, M0SpeedUp: idle, M1SpeedUp: idle, ThrowEnemy: idle, StateController: idle });
