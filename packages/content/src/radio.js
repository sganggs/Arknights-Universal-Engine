// 神经损伤 on the recorders' attacks, and from a designer to the unit blocking it (docs/spec/foes.md 敌能-65).
// The pages name 神经, so the element is fixed (元素-1 id 1) and no content `el` is added. `weakness` is not here:
// it needs a facing the simulation does not settle. These act only through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext */

/** The only blackboard key this family reads. It is not prefixed with `attack@` (敌能-65). */
const RATIO = 'ep_damage_ratio';
/** Keys a ratio blackboard may hold. Anything else is a different ability (关卡-2). */
const RATIO_KEYS = new Set([RATIO]);

/**
 * The ratio-only blackboard (敌能-65). @param {Record<string, unknown>} bb
 */
function ratioShape(bb) {
  if (typeof bb[RATIO] !== 'number') return false;
  for (const k of Object.keys(bb)) if (!RATIO_KEYS.has(k)) return false;
  return true;
}

/**
 * Whether `ep` or `block` with this blackboard is this ability (敌能-65). Any other name is not this family's concern.
 * @param {string} name @param {Record<string, unknown>} bb
 */
export function radioOwns(name, bb) {
  if (name === 'ep' || name === 'block') return ratioShape(bb);
  return true;
}

/**
 * 临时收音师 / 执拗的收音师 (敌能-65): each hit of the normal attack carries 神经损伤 of the current attack × the ratio,
 * settled with that hit (敌能-38). No photography area exists, so the page's 范围外 holds on every tile (INF-0482).
 * @type {FoeBehavior}
 */
const ep = Object.freeze({
  attack: (ctx, mods) => {
    if (!ratioShape(ctx.bb)) return mods;
    return { ...mods, element: 'SANITY', ep: ctx.stats(ctx.self).atk * /** @type {number} */ (ctx.bb[RATIO]) };
  },
});

/**
 * 设计师 do not make normal attacks (敌能-65). applyWay NONE is not what 敌人攻击-1 reads, and their attack is not 0.
 * @param {FoeContext} ctx
 */
function holdFire(ctx) {
  if (!ratioShape(ctx.bb)) return;
  ctx.addBuff(ctx.self, { key: 'noAttack', flags: { noAttack: true } });
}

/**
 * Whether this frame is the end of one second blocked by the same unit (敌能-65, 状态-4). A new blocker starts over.
 * The first frame of a second does not fire.
 * @param {FoeContext} ctx @param {number} id
 */
function secondElapsed(ctx, id) {
  if (ctx.state.get('who') !== id) {
    ctx.state.set('who', id);
    ctx.state.set('n', 0);
  }
  const every = ctx.frames(1);
  if (!(every > 0)) return false;
  const n = ctx.state.get('n') + 1;
  if (n < every) {
    ctx.state.set('n', n);
    return false;
  }
  ctx.state.set('n', 0);
  return true;
}

/** Drop the second in progress (敌能-65): it does not carry into the next block. @param {FoeContext} ctx */
function clearBlock(ctx) {
  ctx.state.set('n', 0);
  ctx.state.set('who', 0);
}

/**
 * 心虚设计师 / 顺从内心的设计师 (敌能-65): while blocked, every second the recorded blocker takes 神经损伤 of the
 * current attack × the ratio. Silence and stun are not consulted. Nothing while nobody is blocking.
 * @param {FoeContext} ctx
 */
function blockTick(ctx) {
  const b = ctx.blocker();
  if (!b || b.hp <= 0 || !ratioShape(ctx.bb)) {
    clearBlock(ctx);
    return;
  }
  if (!secondElapsed(ctx, b.id)) return;
  ctx.dealEp(b, 'SANITY', ctx.stats(ctx.self).atk * /** @type {number} */ (ctx.bb[RATIO]));
}

/** The behaviours of this file, by talent name. @type {Readonly<Record<string, FoeBehavior>>} */
export const radioBehaviors = Object.freeze({
  ep,
  block: Object.freeze({ spawn: holdFire, tick: blockTick }),
});
