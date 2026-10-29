// 固海凿石者's `Attack` (docs/spec/foes.md 敌能-87): before its first attack starts it digs in — `duration` seconds of
// 防御力 + `def` (直接加算) and 自缚. `Attack` is a shared name (whip.js reads 鞭笞者's): this shape is `duration` and
// `def` alone.

/** @typedef {import('@aue/sim').FoeContext} FoeContext @typedef {Parameters<NonNullable<import('@aue/sim').FoeBehavior['attack']>>[1]} AttackMods */

/** Whether an `Attack` blackboard is 固海凿石者's (敌能-87): `duration` and `def`, both numbers, nothing else. @param {Record<string, unknown>} bb */
export const guardShape = (bb) => {
  const keys = Object.keys(bb);
  return keys.length === 2 && typeof bb.duration === 'number' && typeof bb.def === 'number';
};

/**
 * 固海凿石者 (敌能-87): as its first attack starts, `duration` seconds of 防御力 + `def` (the buff `digIn`) and of 自缚
 * (束缚 on itself); the attack goes on. Once a life. @param {FoeContext} ctx @param {AttackMods} mods @returns {AttackMods}
 */
export function digIn(ctx, mods) {
  if (ctx.state.get('dug')) return mods;
  ctx.state.set('dug', 1);
  const bb = ctx.bb, left = ctx.frames(bb.duration);
  ctx.addBuff(ctx.self, { key: 'digIn', left, mods: { defFlat: bb.def } });
  ctx.applyStatus(ctx.self, 'root', { seconds: bb.duration });
  return mods;
}
