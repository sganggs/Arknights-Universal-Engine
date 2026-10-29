// 量产巨像 / 改进型量产巨像 (docs/spec/foes.md 敌能-120). The page's 占用2个阻挡数 is not on the enemy record.
// A buff adds block − 1 on top of the default 1 (阻挡-2, the same way as 敌能-55). Weak is the 重整束流 drop and is not this talent.

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext */

/**
 * Two block slots, from the page-only talent's `block` (敌能-120). Missing `block` is not this shape (关卡-2).
 * @param {FoeContext} ctx
 */
function takeBlock(ctx) {
  const block = ctx.bb.block;
  if (typeof block !== 'number') return;
  ctx.addBuff(ctx.self, { key: 'colossusBlock', mods: { blockCnt: block - 1 } });
}

/** @type {FoeBehavior} */
const blockSlots = Object.freeze({ spawn: takeBlock });

/** The behaviours of this file, by talent name. @type {Readonly<Record<string, FoeBehavior>>} */
export const colossusBehaviors = Object.freeze({ blockSlots });
