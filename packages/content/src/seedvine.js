// 卷心籽 / 卷心草 and 灼藤 / 灼芯 (docs/spec/foes.md 敌能-136). The vines' talent `pow`: from its spawn its 攻击力 rises
// every 0.1 s to + `add_max_atk` at `time` s; while that 【首次攻击增益】 lasts its attack also hits the 3×3 around the target
// (`attack@range_id` x-4) at the page's `splash`, every hit carrying 灼燃损伤; the first attack that takes HP ends it, and
// the 灼燃 drops to `attack@ep_damage_ratio_normal`. Each turn a vine lights the seeds within the page's `ignite`: a seed's
// `boom` carries the page marker `kindle`, and its death blast (敌能-5, foes.js) goes off only once it is lit. The
// seeds' skill `onfire` has no numbers and does nothing of its own. It acts only through the context (ADR 0055).
import { elements } from '@aue/sim';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext */

/** 灼燃 (元素-1 id 3), the element of every hit of a vine (敌能-136). */
const FIRE = elements.ELEMENTS[2];
/** The 【首次攻击增益】 rises once every 0.1 s: 灼芯's 「每0.1秒提升1次」; 灼藤's page by it (敌能-136, INF-0833). */
const STEP_S = 0.1;
/** The rise, a buff on the vine itself. No one else gives this key, so removing it by its key removes only this. */
const RAMP = 'vineRamp';
/** 燃烧状态 on a seed: the vine's mark, with no end (敌能-136). No one else gives this key. */
const LIT = 'vineLit';
/** The range the data names for the splash. range_table's x-4 is the 3×3 around the target: the engine's square (敌能-26). */
const SQUARE = 'x-4';
/** `pow`'s numbers: the data's four, the page's `splash` and `ignite`; `attack@range_id` is the fifth data key, a text. */
const VINE_NUMBERS = Object.freeze(['add_max_atk', 'time', 'attack@ep_damage_ratio', 'attack@ep_damage_ratio_normal', 'splash', 'ignite']);
/** A seed's `boom`: the data's `atk_scale`, 敌能-5's death-blast extras and the page marker `kindle`. */
const SEED_KEYS = Object.freeze(['atk_scale', 'radius', 'delay', 'arts', 'air', 'sourced', 'kindle']);

/** Whether each of these keys of `bb` is a number. @param {Record<string, unknown>} bb @param {readonly string[]} keys */
const numbers = (bb, keys) => keys.every((k) => typeof bb[k] === 'number');

/**
 * A vine's `pow` (敌能-136): exactly the data's four numbers and the text x-4, and the page's `splash` and `ignite`;
 * `time` above 0. A range given as a number, another range or one more key is not this ability.
 * @param {Record<string, unknown>} bb
 */
const vineShape = (bb) => Object.keys(bb).length === VINE_NUMBERS.length + 1 && bb['attack@range_id'] === SQUARE
  && numbers(bb, VINE_NUMBERS) && Number(bb.time) > 0;

/** A seed's `boom` (敌能-136): exactly these keys, each a number, and `kindle` 1. @param {Record<string, unknown>} bb */
const seedShape = (bb) => Object.keys(bb).length === SEED_KEYS.length && numbers(bb, SEED_KEYS) && bb.kindle === 1;

/**
 * Whether a behaviour of this name is this family's, by its shape (关卡-2): `pow` the vine's, `onfire` with an empty
 * blackboard, a `boom` with `kindle` the seed's. A `boom` without `kindle` is 敌能-5's; any other name passes.
 * @param {string} name @param {Record<string, unknown>} bb
 */
export function seedVineOwns(name, bb) {
  if (name === 'pow') return vineShape(bb);
  if (name === 'onfire') return Object.keys(bb).length === 0;
  if (name === 'boom' && Object.hasOwn(bb, 'kindle')) return seedShape(bb);
  return true;
}

/**
 * A seed's `boom` that is not lit (敌能-136): its death blast (敌能-5) does not go off. A `boom` without the marker
 * `kindle` is not a seed's and is never held back. @param {FoeContext} ctx
 */
export const seedUnlit = (ctx) => Object.hasOwn(ctx.bb, 'kindle') && !ctx.self.buffs.some((b) => b.key === LIT);

/**
 * The rise (敌能-136): n whole steps of 0.1 s since its spawn, up to `time`, give + `add_max_atk` × (n steps ÷ `time`),
 * 直接乘算; the one buff is retuned at each step and no longer once it is full. @param {FoeContext} ctx
 */
function rise(ctx) {
  const step = ctx.frames(STEP_S), full = ctx.frames(ctx.bb.time);
  const risen = Math.min(Math.floor((ctx.frame - ctx.state.get('start')) / step) * step, full);
  if (risen === ctx.state.get('risen')) return;
  ctx.state.set('risen', risen);
  ctx.setBuff(ctx.self, RAMP, 0, { atkPct: ctx.bb.add_max_atk * risen / full });
}

/**
 * Lighting (敌能-136): each enemy within `ignite` of the vine — on the field, not neutral (`allies`), not in the air —
 * whose `boom` is a seed's gets the mark once. Silence on either side does not stop it (INF-0831).
 * @param {FoeContext} ctx
 */
function light(ctx) {
  for (const u of ctx.allies(ctx.bb.ignite)) {
    if (u === ctx.self || ctx.stats(u).flying || u.buffs.some((b) => b.key === LIT)) continue;
    const boom = ctx.talentOf(u, 'boom');
    if (boom && seedShape(boom)) ctx.addBuff(u, { key: LIT });
  }
}

/**
 * `pow` (敌能-136). The 【首次攻击增益】 lasts until `done`: the rise, and an attack that also hits the 3×3 around its
 * target at `splash`, 灼燃 of its attack × `attack@ep_damage_ratio` on each; after it, 灼燃 × the `_normal` ratio on the
 * target only. It is a talent: silence stops none of it.
 * @type {FoeBehavior}
 */
const pow = Object.freeze({
  spawn: (ctx) => { if (vineShape(ctx.bb)) ctx.state.set('start', ctx.frame); },
  tick: (ctx) => {
    if (!vineShape(ctx.bb)) return;
    if (ctx.state.get('done') === 0) rise(ctx);
    light(ctx);
  },
  attack: (ctx, mods) => {
    const bb = ctx.bb;
    if (!vineShape(bb)) return mods;
    if (ctx.state.get('done') === 1) return { ...mods, element: FIRE, epScale: bb['attack@ep_damage_ratio_normal'] };
    return { ...mods, element: FIRE, epScale: bb['attack@ep_damage_ratio'], square: true, splashScale: bb.splash };
  },
  // 首次成功攻击: the main hit took HP (INF-0834); a dodged one, or one on an invincible target, keeps the 增益.
  landed: (ctx, target, how) => {
    if (!vineShape(ctx.bb) || ctx.state.get('done') === 1 || !(how.dealt > 0)) return;
    ctx.state.set('done', 1);
    ctx.removeBuff(ctx.self, RAMP);
  },
});

/** The behaviours of this file, by name. `onfire` holds no numbers and does nothing of its own (敌能-136). @type {Readonly<Record<string, FoeBehavior>>} */
export const seedVineBehaviors = Object.freeze({ pow, onfire: Object.freeze({}) });
