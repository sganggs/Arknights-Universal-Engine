// 主角阵营角色 and 反派阵营角色 (docs/spec/foes.md 敌能-128). Each hit of their attack adds 神经损伤 at `inside`'s
// `attack@ep_damage_ratio`. The rest of `inside`, and the skill `read` (入戏), act only in a 摄影区域, which the
// engine's levels do not have (INF-0482, INF-0750): here they do nothing. 主角's 重生 is 敌能-78's `reborn`
// (helmknights.js). They act only through the context (ADR 0055).
import { elements } from '@aue/sim';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */

/** 神经损伤 (元素-1 id 1): both pages name it, so no content `el` (敌能-128). */
const NEURAL = elements.ELEMENTS[0];
/** The data's ratio of the attacker's ATK the 神经损伤 is. */
const RATIO = 'attack@ep_damage_ratio';
/** The read-page marker (关卡-2). 命定的主角 and 命定的反派 have these shapes and no saved page, so no marker. */
const PAGE = 'page';
/** 主角阵营角色's `inside`: its 摄影区域 numbers and the ratio. */
const HERO = Object.freeze(['atk_scale_normal', 'atk_scale_crvln', 'ability_range_forward_extend', RATIO]);
/** 反派阵营角色's `inside`: its 摄影区域 numbers and the ratio. */
const VILLAIN = Object.freeze(['atk_scale_normal', 'atk_scale_crhro', 'attack_speed', RATIO]);
/** `read` (入戏): its seconds of reading. */
const READ = Object.freeze(['duration']);

/**
 * Exactly these keys, each a number, and maybe the marker, which is then 1 (敌能-128).
 * @param {Record<string, unknown>} bb @param {readonly string[]} keys
 */
function shaped(bb, keys) {
  if (bb[PAGE] !== undefined && bb[PAGE] !== 1) return false;
  return keys.every((k) => typeof bb[k] === 'number') && Object.keys(bb).every((k) => k === PAGE || keys.includes(k));
}

/** Either side's `inside` (敌能-128). @param {Record<string, unknown>} bb */
const insideShape = (bb) => shaped(bb, HERO) || shaped(bb, VILLAIN);

/**
 * Whether `inside` or `read` with this blackboard is this family's, by its shape (关卡-2); any other name passes. The
 * marker itself is required by FOE_NEEDS. @param {string} name @param {Record<string, unknown>} bb
 */
export function castOwns(name, bb) {
  if (name === 'inside') return insideShape(bb);
  if (name === 'read') return shaped(bb, READ);
  return true;
}

/**
 * `inside` outside a 摄影区域 (敌能-128): each hit of the normal attack adds 神经损伤 of the current ATK × the ratio,
 * settled with the hit as 敌能-38's. A read page's only (the marker); any other blackboard leaves the attack alone.
 * @type {FoeBehavior}
 */
const inside = Object.freeze({
  attack: (ctx, mods) => (ctx.bb[PAGE] === 1 && insideShape(ctx.bb) ? { ...mods, element: NEURAL, ep: ctx.stats(ctx.self).atk * ctx.bb[RATIO] } : mods),
});

/** 入戏 (敌能-128): only on first entering a 摄影区域, which no level has, so it never fires. @type {FoeBehavior} */
const read = Object.freeze({});

/** The behaviours of this file, by talent or skill name. @type {Readonly<Record<string, FoeBehavior>>} */
export const castBehaviors = Object.freeze({ inside, read });
