// 面向我方干员较多的一侧 (docs/spec/foes.md 敌能-119): 圆仔 always, the two 驮兽补给员 while they are not blocked. The
// talent is the pages' (the data has none); the turn itself is the simulation's, after each enemy's turn (lr.js
// crowdTurn), so it outweighs the turns of 敌能-90.

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */

/**
 * `faceCrowd` (敌能-119): from its spawn, the flag the simulation turns it by — `faceCrowd`, or with `unblocked: 1`
 * `faceCrowdFree`, which holds only while it is not blocked. The pages do not call it silenceable.
 * @type {FoeBehavior}
 */
const faceCrowd = Object.freeze({
  spawn: (ctx) => {
    const flag = ctx.bb.unblocked === 1 ? 'faceCrowdFree' : 'faceCrowd';
    ctx.addBuff(ctx.self, { key: 'faceCrowd', flags: { [flag]: true } });
  },
});

/** The behaviours of this file, by talent name. @type {Readonly<Record<string, FoeBehavior>>} */
export const crowdBehaviors = Object.freeze({ faceCrowd });
