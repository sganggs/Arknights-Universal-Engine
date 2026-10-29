// 枯朽萃聚使徒 / 腐败萃聚使徒 and the seeds they call (docs/spec/foes.md 敌能-64). The data's BornBugs blackboard is
// empty and the seeds have no talents. FOE_EXTRAS supplies the page's delay, offsets and enemy key, and the talents
// the pages name only as abilities. They act only through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */
/** @typedef {import('@aue/sim').FoeContext} FoeContext */

/**
 * BornBugs is this summon only with the page's delay, left and right offsets, and a text enemy key (敌能-64, 关卡-2).
 * Any other name is not this family's concern.
 * @param {string} name
 * @param {Record<string, unknown>} bb
 */
export function bornBugsOwns(name, bb) {
  if (name !== 'BornBugs') return true;
  return typeof bb.delay === 'number' && typeof bb.left === 'number' && typeof bb.right === 'number' && typeof bb.enemy_key === 'string';
}

/** The enemy key a blackboard names (the page keeps it as text, as deathrattle's data does). @param {Record<string, number>} bb */
const keyIn = (bb) => String(/** @type {unknown} */ (bb.enemy_key));

/**
 * 枯朽召唤 (敌能-64): ready, able to act and not silenced, three seeds after one shared delay — on the caller, then
 * one tile to the left and one to the right along x — on the caller's route from the leg it is on. Then the cooldown.
 * @param {FoeContext} ctx
 */
function summonSeeds(ctx) {
  const s = ctx.stats(ctx.self);
  if (!ctx.ready || s.disabled || s.flags.silence) return;
  const bb = ctx.bb;
  if (!bornBugsOwns('BornBugs', bb)) return;
  ctx.use();
  const key = keyIn(bb), delay = bb.delay;
  ctx.summon(key, { delay, dx: 0 });
  ctx.summon(key, { delay, dx: -bb.left });
  ctx.summon(key, { delay, dx: bb.right });
}

/** @type {FoeBehavior} */
const BornBugs = Object.freeze({ tick: summonSeeds });

/**
 * 不进行普通攻击 (敌能-64; the pages of 敌能-117 too): a lasting flag. The pages do not call it silenceable, so spawn sets
 * it once.
 * @type {FoeBehavior}
 */
const NoAttack = Object.freeze({
  spawn: (ctx) => { ctx.addBuff(ctx.self, { key: 'noAttack', flags: { noAttack: true } }); },
});

/** 晕眩 / 冻结 / 浮空 / 沉睡, the flags that hold the knock-down back (敌能-64, 状态-5). @param {FoeContext} ctx */
const heldBack = (ctx) => {
  const f = ctx.stats(ctx.self).flags;
  return !!(f.stun || f.freeze || f.levitate || f.sleep);
};

/**
 * 普通攻击结束时强制击杀自身 (敌能-64): the frame the hit dealt damage. A forced knock-down, not a damage hit.
 * Skipped while the seed holds one of those four.
 * @type {FoeBehavior}
 */
const SelfDown = Object.freeze({
  hit: (ctx) => { if (!heldBack(ctx)) ctx.remove(ctx.self); },
});

/** @type {Readonly<Record<string, FoeBehavior>>} */
export const seedBehaviors = Object.freeze({ BornBugs, NoAttack, SelfDown });
