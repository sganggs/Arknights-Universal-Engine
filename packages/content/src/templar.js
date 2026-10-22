// 圣堂剑士 (docs/spec/foes.md 敌能-61): every `interval` seconds it tries to spend one round of its 技力 (its ammo) for a
// permanent layer of attack and move speed. The skill does not cast itself when its cooldown (0) is ready. The ammo,
// 5 or 7, is the page's 技力槽 that content adds to the skill (`ammo`). It acts only through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext */

/**
 * The numbers the try reads, or null when this skill is not the templar shape (敌能-61).
 * @param {FoeContext} ctx
 * @returns {{ interval: number, maxStack: number, move: number, atk: number, moveAdd: number, atkAdd: number, ammo: number } | null}
 */
function read(ctx) {
  const trigger = ctx.talent('SkillTrigger'), store = ctx.talent('AttributeStorage');
  if (!trigger || !store || !(ctx.sp > 0)) return null;
  const interval = trigger.interval, maxStack = trigger.max_stack_cnt, move = store.move_speed, atk = store.atk;
  const moveAdd = ctx.bb.move_speed_add, atkAdd = ctx.bb.atk_add, ammo = ctx.bb.ammo;
  if (typeof interval !== 'number' || typeof maxStack !== 'number' || typeof move !== 'number' || typeof atk !== 'number') return null;
  if (typeof moveAdd !== 'number' || typeof atkAdd !== 'number' || typeof ammo !== 'number' || !(interval > 0) || !(ammo > 0)) return null;
  return { interval, maxStack, move, atk, moveAdd, atkAdd, ammo };
}

/**
 * Counts down `interval` seconds and says whether a try is due (敌能-13, 敌能-61). The first tick arms it, so the
 * first try is one full interval after the enemy appears; a failed try starts the same wait again.
 * @param {FoeContext} ctx @param {number} every
 */
function due(ctx, every) {
  const left = ctx.state.get('t') || ctx.frames(every);
  if (left > 1) { ctx.state.set('t', left - 1); return false; }
  ctx.state.set('t', ctx.frames(every));
  return true;
}

/** One permanent layer (敌能-61): one move multiplier, attack as 直接乘算. @param {FoeContext} ctx @param {NonNullable<ReturnType<typeof read>>} p @param {number} n */
function layer(ctx, p, n) {
  ctx.setBuff(ctx.self, 'forever', n, { moveMul: p.move + n * p.moveAdd, atkPct: p.atk + n * p.atkAdd });
}

/**
 * 赐我力量 (敌能-61). Silence and 缴械 do not stop a try. Being unable to act fails that try without spending 技力.
 * @type {FoeBehavior}
 */
const ForeverEnhance = Object.freeze({
  spawn(ctx) {
    const p = read(ctx);
    if (p) ctx.state.set('sp', p.ammo);
  },
  tick(ctx) {
    const p = read(ctx);
    if (!p || !due(ctx, p.interval)) return;
    const n = ctx.state.get('n'), sp = ctx.state.get('sp');
    if (ctx.stats(ctx.self).disabled || n >= p.maxStack || sp < ctx.sp) return;
    const next = n + 1, left = sp - ctx.sp;
    ctx.state.set('n', next);
    ctx.state.set('sp', left);
    layer(ctx, p, next);
  },
});

/** The behaviours of this file, by skill name. @type {Readonly<Record<string, FoeBehavior>>} */
export const templarBehaviors = Object.freeze({ ForeverEnhance });
