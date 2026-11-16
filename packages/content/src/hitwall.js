// 雪孩子 / 雪顽童 (docs/spec/foes.md 敌能-150): a 失衡 slide that high ground stops costs it `value` true damage, then
// not again for `rearm` seconds. Whether the slide hit high ground is the engine's (位移-3, the context's `bumpedHigh`);
// the 5 s is only on the pages, so FOE_EXTRAS gives `rearm`. It acts only through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext */

/**
 * 与高地碰撞 (敌能-150): its slide hit high ground since its last turn, and `rearm` seconds have passed since the last
 * time — `value` true damage on itself, sourceless and credited to it (as 敌能-42's bleed), and the window starts again
 * now, also when 无敌 takes the damage away.
 * @param {FoeContext} ctx
 */
function collide(ctx) {
  if (!ctx.bumpedHigh() || ctx.frame < ctx.state.get('until')) return;
  ctx.state.set('until', ctx.frame + ctx.frames(ctx.bb.rearm));
  const amount = ctx.bb.value;
  if (amount > 0) ctx.dealDamage(ctx.self, { type: 'true', amount, sourceless: true });
}

/** The note of collisions starts as it appears (敌能-150): the first call to `bumpedHigh` arms it. @param {FoeContext} ctx */
function arm(ctx) {
  ctx.bumpedHigh();
}

/** The behaviours of this file, by talent name. @type {Readonly<Record<string, FoeBehavior>>} */
export const hitWallBehaviors = Object.freeze({ hitWall: Object.freeze({ spawn: arm, tick: collide }) });

/**
 * A `hitWall` is 敌能-150's only with exactly the data's `value` and the page's `rearm`, both numbers (关卡-2):
 * 直立小雪怪's has no `rearm` and stays uncovered. Every other name passes.
 * @param {string} name @param {Record<string, unknown>} bb @returns {boolean}
 */
export function hitWallOwns(name, bb) {
  if (name !== 'hitWall') return true;
  return Object.keys(bb).length === 2 && typeof bb.value === 'number' && typeof bb.rearm === 'number';
}
