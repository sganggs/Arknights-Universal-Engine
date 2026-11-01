// The boats' crew (docs/spec/foes.md 敌能-133): 术师快艇 and 领潮员快艇 carry a 控潮术师 / 领潮员 — the data's
// `DeathRattle.enemy_key` — who goes on fighting when the boat goes down: 0.8 s later one appears in the square of side
// 0.2 around where the boat fell, on the boat's route (敌能-22). The 0.8 s and the square are not in the data: FOE_EXTRAS
// gives them (`delay`, `offset_bound`) to these two boats only; 水手重艇 and 水手长重艇 have the same data blackboard and
// stay uncovered and inert (FOE_NEEDS, 关卡-2). absent.js dispatches `DeathRattle` here by its shape. It acts only
// through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeContext} FoeContext */

/** What a boat's `DeathRattle` holds besides the data's `enemy_key`: the pages' delay and half the square's side. */
const PAGE_KEYS = Object.freeze(['delay', 'offset_bound']);

/**
 * Whether a `DeathRattle` blackboard is the boats' shape (敌能-133): a non-empty `enemy_key`, and otherwise only the
 * pages' numbers. The data's blackboard alone is this shape; FOE_NEEDS asks for the two numbers.
 * @param {Record<string, unknown>} bb
 */
export function boatShape(bb) {
  if (typeof bb.enemy_key !== 'string' || bb.enemy_key === '') return false;
  return Object.keys(bb).every((k) => k === 'enemy_key' || (PAGE_KEYS.includes(k) && typeof bb[k] === 'number'));
}

/** A read boat (敌能-133): the shape with both page numbers. @param {Record<string, unknown>} bb */
const manned = (bb) => boatShape(bb) && PAGE_KEYS.every((k) => typeof bb[k] === 'number');

/**
 * The boat goes down (敌能-133): `delay` s later one `enemy_key` appears where it fell, up to `offset_bound` off along x
 * and along y, on its route from its leg (敌能-22). Every knock-down counts, a fall and `remove` too; the goal and the
 * intermission are none (敌能-2, 合作-8). A talent, and both boats resist silence: no silence check.
 * @param {FoeContext} ctx
 */
export function boatDeath(ctx) {
  const bb = ctx.bb;
  if (!manned(bb)) return;
  ctx.summon(String(/** @type {unknown} */ (bb.enemy_key)), { cnt: 1, delay: bb.delay, bound: bb.offset_bound });
}
