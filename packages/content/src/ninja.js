// 水遁忍者 and 水遁宗师 (docs/spec/foes.md 敌能-104): two forms. In 初始形态 only what blocks it is attacked; its skill
// `SwitchModeTrigger` turns it to 漩涡形态 — never in the first `ProtectionTime.protection_duration` s of a form —, where
// it does not attack but every `RotateDamage.interval` s hurts ours on the ground within `attack@range_radius`; it turns
// back when a 失衡 slide ends or after `EndRotate.rotate_duration` s. The talents hold the numbers the skill reads;
// `BeginAnim` and `EndAnim` are the turn's animation. It acts only through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext */

/** Whether `bb` has exactly these keys, each a number. @param {Record<string, unknown>} bb @param {readonly string[]} keys */
const exact = (bb, keys) => Object.keys(bb).length === keys.length && keys.every((k) => typeof bb[k] === 'number');

const SPIN = Object.freeze(['attack@atk_scale', 'attack@range_radius', 'interval']);
/** The skill and the two animation skills: empty blackboards (敌能-104). */
const EMPTY = new Set(['SwitchModeTrigger', 'BeginAnim', 'EndAnim']);

/** Whether a behaviour of this name is this family's, by its shape (关卡-2); any other name passes. @param {string} name @param {Record<string, unknown>} bb */
export function ninjaOwns(name, bb) {
  if (name === 'ProtectionTime') return exact(bb, ['protection_duration']);
  if (name === 'EndRotate') return exact(bb, ['rotate_duration']);
  if (name === 'RotateDamage') return exact(bb, SPIN);
  if (EMPTY.has(name)) return Object.keys(bb).length === 0;
  return true;
}

/** The three talents the skill reads, or null when one is missing or not of its shape (敌能-104). @param {FoeContext} ctx */
function numbers(ctx) {
  const p = ctx.talent('ProtectionTime'), r = ctx.talent('EndRotate'), d = ctx.talent('RotateDamage');
  if (!p || !r || !d || !exact(p, ['protection_duration']) || !exact(r, ['rotate_duration']) || !exact(d, SPIN)) return null;
  return { guard: ctx.frames(p.protection_duration), spin: ctx.frames(r.rotate_duration), every: ctx.frames(d.interval), scale: d['attack@atk_scale'], r: d['attack@range_radius'] };
}

/** Into a form at this frame (敌能-104): 1 the 漩涡形态, 0 the 初始形态. @param {FoeContext} ctx @param {number} form */
function enter(ctx, form) {
  ctx.state.set('spin', form);
  ctx.state.set('since', ctx.frame);
}

/** One beat of the 漩涡 (敌能-104): ours on the ground within its radius, its 攻击力 × scale physical, unless it may not attack. @param {FoeContext} ctx @param {{ scale: number, r: number }} n */
function whirl(ctx, n) {
  const s = ctx.stats(ctx.self), self = ctx.self;
  if (s.disabled || s.flags.noAttack) return;
  for (const u of ctx.ours().filter((x) => !ctx.stats(x).flying && (x.x - self.x) * (x.x - self.x) + (x.y - self.y) * (x.y - self.y) <= n.r * n.r)) {
    ctx.dealDamage(u, { type: 'phys', amount: s.atk * n.scale });
  }
}

/**
 * 回レ回レ回レ回レ回レ (敌能-104): in 初始形态, ready, able, not silenced and past the form's first seconds, it turns; in
 * 漩涡形态 the beats, and back after `rotate_duration` s. @param {FoeContext} ctx
 */
function turn(ctx) {
  const n = numbers(ctx), st = ctx.state;
  if (!n) return;
  if (st.get('spin') === 1) {
    if (ctx.frame - st.get('since') >= n.spin) { enter(ctx, 0); return; }
    if ((ctx.frame - st.get('since')) % n.every === 0 && ctx.frame > st.get('since')) whirl(ctx, n);
    return;
  }
  const s = ctx.stats(ctx.self);
  if (!ctx.ready || s.disabled || s.flags.silence || ctx.frame - st.get('since') < n.guard) return;
  ctx.use();
  enter(ctx, 1);
}

/** 水遁's forms (敌能-104). @type {FoeBehavior} */
const SwitchModeTrigger = Object.freeze({
  spawn: (ctx) => { enter(ctx, 0); },
  targets: (ctx, cands) => {
    if (!numbers(ctx)) return cands;
    const b = ctx.blocker();
    return ctx.state.get('spin') === 0 && b ? cands.filter((u) => u.id === b.id) : [];
  },
  tick: turn,
  unbalanceEnd: (ctx) => {
    const n = numbers(ctx);
    if (n && ctx.state.get('spin') === 1 && ctx.frame - ctx.state.get('since') >= n.guard) enter(ctx, 0);
  },
});

/** Read by the skill, or the animation's (敌能-104). @type {FoeBehavior} */
const idle = Object.freeze({});

/** The behaviours of this file, by name. @type {Readonly<Record<string, FoeBehavior>>} */
export const ninjaBehaviors = Object.freeze({ SwitchModeTrigger, ProtectionTime: idle, EndRotate: idle, RotateDamage: idle, BeginAnim: idle, EndAnim: idle });
