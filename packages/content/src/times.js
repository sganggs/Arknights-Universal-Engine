// 岁兽残响, part one (docs/spec/foes.md 敌能-39): bodies that lose one HP per successful hit, and the parents that leave
// them on their own route when they die. They act only through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */

/**
 * 特殊生命值 (敌能-39): from the moment it appears, a successful hit removes 1 HP whatever its size (伤害-9), it cannot
 * be blocked and it makes no normal attacks. The data has no talent for it; the content gives `hitCount`.
 * @type {FoeBehavior}
 */
const hitCount = Object.freeze({
  spawn: (ctx) => {
    ctx.addBuff(ctx.self, { key: 'hitCount', flags: { hitCount: true, noAttack: true, unblockable: true } });
  },
});

/** The enemy key a blackboard names (the data keeps it as text). @param {Record<string, number>} bb */
const keyIn = (bb) => String(/** @type {unknown} */ (bb.enemy_key) ?? '');

/**
 * 死亡召唤 (敌能-39): knocked down — not by a fall when `fall` is 0 — after one shared draw of [0, 0.7) seconds, `cnt`
 * enemies of `enemy_key` (one by default) appear in the square of side 1 centred on it (offset up to 0.5), on its
 * route (敌能-22). The pages do not say the talent can be silenced.
 * @type {FoeBehavior}
 */
const DeadSpawn = Object.freeze({
  death: (ctx) => {
    const bb = ctx.bb;
    if (bb.fall === 0 && ctx.fell) return;
    const key = keyIn(bb);
    if (!key) return;
    ctx.summon(key, { cnt: bb.cnt ?? 1, delay: ctx.draw() * 0.7, bound: 0.5 });
  },
});

/** The behaviours of this file, by talent name. @type {Readonly<Record<string, FoeBehavior>>} */
export const timeBehaviors = Object.freeze({ hitCount, DeadSpawn });
