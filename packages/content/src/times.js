// 岁兽残响 (docs/spec/foes.md 敌能-39, 敌能-43): bodies that lose one HP per successful hit, the parents that leave them
// on their own route, and 烹泉 / 沏虹 — a radius splash on the normal attack, a death blast, and the ASPD debuff it leaves.
// They act only through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */
/** @typedef {import('@aue/sim').buffs.BuffInit} BuffInit */

/**
 * Which damage types a hit-count body accepts (敌能-43). A blackboard 1 accepts that type. None set accepts every type
 * (敌能-39).
 * @param {Record<string, number>} bb @returns {Record<string, boolean>}
 */
function typeFlags(bb) {
  /** @type {Record<string, boolean>} */
  const flags = {};
  if (bb.phys === 1) flags.hitPhys = true;
  if (bb.arts === 1) flags.hitArts = true;
  if (bb.true === 1) flags.hitTrue = true;
  if (bb.elemental === 1) flags.hitElement = true;
  return flags;
}

/**
 * 特殊生命值 (敌能-39, 敌能-43): from the moment it appears, a successful hit of an accepted type removes 1 HP whatever
 * its size (伤害-9), it cannot be blocked and it makes no normal attacks. The data has no talent for it; the content
 * gives `hitCount`.
 * @type {FoeBehavior}
 */
const hitCount = Object.freeze({
  spawn: (ctx) => {
    ctx.addBuff(ctx.self, { key: 'hitCount', flags: { hitCount: true, noAttack: true, unblockable: true, ...typeFlags(ctx.bb) } });
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

/**
 * The death debuff (敌能-43): ASPD `attack_speed` for `duration` seconds, resistible, each layer on its own, no cap. The
 * data's `interval` and `attack_speed_add` (固定每 3 秒额外 −0) add nothing and are not modelled.
 * @param {import('@aue/sim').foes.FoeContext} ctx @param {Record<string, number>} bb @returns {BuffInit}
 */
function brewOf(ctx, bb) {
  return {
    key: 'pengquan', rule: 'independent', maxStacks: Number.MAX_SAFE_INTEGER, resist: true,
    left: ctx.frames(bb.duration), mods: { aspd: bb.attack_speed ?? 0 },
  };
}

/**
 * 死亡爆炸 (敌能-43): knocked down and not silenced, an arts blast of `atk_scale` × attack at its position (敌能-3), and
 * the debuff on whoever it hits. Silence drops both. A fall still explodes; the summon's fall rule is DeadSpawn's.
 * @type {FoeBehavior}
 */
const DeadBoom = Object.freeze({
  death: (ctx) => {
    const bb = ctx.bb, s = ctx.stats(ctx.self);
    if (s.flags.silence || typeof bb.radius !== 'number' || typeof bb.delay !== 'number' || typeof bb.duration !== 'number') return;
    ctx.blast({
      x: ctx.self.x, y: ctx.self.y, radius: bb.radius, delay: bb.delay, air: bb.air === 1, sourced: true,
      type: 'arts', amount: s.atk * (typeof bb.atk_scale === 'number' ? bb.atk_scale : 1), buff: brewOf(ctx, bb),
    });
  },
});

/**
 * The normal attack's radius splash (敌能-43): arts, the target and every other ground friendly unit within `radius`
 * at the full amount, camouflage ignored (the flag). It rides the projectile (攻击-3). An enemy selects nothing in the
 * air or evading the ground already (索敌-2, 阻挡-2).
 * @type {FoeBehavior}
 */
const Splash = Object.freeze({
  spawn: (ctx) => { ctx.addBuff(ctx.self, { key: 'seeCamou', flags: { seeCamou: true } }); },
  attack: (ctx, mods) => (typeof ctx.bb.radius !== 'number' ? mods
    : { ...mods, type: 'arts', splash: { radius: ctx.bb.radius, scale: 1, ground: true, side: 'friendly' } }),
});

/** The behaviours of this file, by talent name. @type {Readonly<Record<string, FoeBehavior>>} */
export const timeBehaviors = Object.freeze({ hitCount, DeadSpawn, DeadBoom, Splash });
