// Shared ability names whose behaviour implements only some of the blackboards the enemy data gives them
// (docs/spec/foes.md 敌能-153, 关卡-2). A name's other shapes did nothing, ran another enemy's rule, or threw; here they
// stop counting as covered. Where one shape means two rules, FOE_EXTRAS gives the enemies whose page was read the
// marker `page: 1`, so that the unread holders of the same shape stay uncovered.

import { plantShape } from './plant.js';

/** @typedef {(bb: Record<string, unknown>) => boolean} ShapeCheck */

/** @param {unknown} v */
const num = (v) => typeof v === 'number';

/** @param {unknown} v */
const text = (v) => typeof v === 'string' && v !== '';

/** A value as these shapes hold it: `enemy_key` names an enemy, `page` is the content's marker 1, the rest are numbers. @param {string} k @param {unknown} v */
function fits(k, v) {
  if (k === 'enemy_key') return text(v);
  if (k === 'page') return v === 1;
  return num(v);
}

/** Whether `bb` has these keys and no other, each value as it should be. @param {Record<string, unknown>} bb @param {readonly string[]} keys */
const exactly = (bb, keys) => Object.keys(bb).length === keys.length && keys.every((k) => Object.hasOwn(bb, k) && fits(k, bb[k]));

/** 投嗣育母's `Attack` shape, the marker aside (敌能-106): an enemy key and nothing else. @param {Record<string, unknown>} bb */
const broodLike = (bb) => Object.hasOwn(bb, 'enemy_key') && Object.keys(bb).every((k) => k === 'enemy_key' || k === 'page');

/**
 * Per name, the shapes its behaviour implements (敌能-153); the clause in each comment is the one that implements it.
 * @type {Readonly<Record<string, ShapeCheck>>}
 */
const SHAPES = Object.freeze({
  // 敌能-18's once-revival lasts `duration` s: “死志的凝结” has `hp_ratio` and no `duration`, and threw at its first
  // knockdown. A `Reborn` without `hp_ratio` is the players' branch (足球-9), not this check's.
  Reborn: (bb) => !Object.hasOwn(bb, 'hp_ratio') || num(bb.duration),
  // 敌能-40 reads `block_free_time` and `move_speed`; the other skill shapes threw, the talent shape is never ready.
  StartRun: (bb) => exactly(bb, ['block_free_time', 'move_speed']),
  // 敌能-108's plant, or 敌能-30's blocker devour on a read page: the empty skill is other rules elsewhere (INF-1002).
  Devour: (bb) => plantShape(bb) || exactly(bb, ['page']),
  // 敌能-63's death summon, on its three read pages: the same two keys are other enemies' skills (INF-1002).
  Summon: (bb) => exactly(bb, ['cnt', 'enemy_key', 'page']),
  // 敌能-25: a 传令兵 has exactly `atk` and `def`; 游击队突袭战士's lone `atk` is not one (INF-1002).
  strength: (bb) => exactly(bb, ['atk', 'def']) || exactly(bb, ['move_speed']) || exactly(bb, ['attack_speed']),
  // 敌能-27's 抵抗 is the content's empty talent; the behaviour does not read a `damage_resistance`.
  Resist: (bb) => Object.keys(bb).length === 0,
  // 敌能-25 reads `taunt_level`.
  taunt: (bb) => exactly(bb, ['taunt_level']),
  // 敌能-23 summons the enemy it names.
  deathrattle: (bb) => text(bb.enemy_key),
  // 敌能-10's bombs need their scale and blast radius.
  Bomb: (bb) => exactly(bb, ['atk_scale', 'projectile_range']),
  // 敌能-32's alarm gives `atk` and `def`.
  Awake: (bb) => exactly(bb, ['atk', 'def']),
  // 敌能-94's lasting physical and arts dodge, on a read page: the same `prob` is another dodge elsewhere (INF-1002).
  Evade: (bb) => exactly(bb, ['prob', 'page']),
  // 敌能-106's brood, on its read page. The other `Attack` shapes are whipOwns' (whip.js).
  Attack: (bb) => !broodLike(bb) || exactly(bb, ['enemy_key', 'page']),
  // 敌能-16: the behaviour does not read the partners' `enemy_key` and `mode`.
  Bus: (bb) => exactly(bb, ['max_cnt']),
  // 敌能-153: 术师囚犯's liberated attack takes this many targets.
  liberty: (bb) => !Object.hasOwn(bb, 'attack@max_target') || num(bb['attack@max_target']),
  // 敌能-40's run never ends; the behaviour does not read a `run_duration`.
  run: (bb) => exactly(bb, ['attack@move_speed']),
  // 敌能-27's frozen-target 倍率 by a bare `atk_scale`, on a read page: the same key is another bonus elsewhere (INF-1002).
  atkup: (bb) => !Object.hasOwn(bb, 'atk_scale') || exactly(bb, ['atk_scale', 'page']),
  // 敌能-32's standby needs its `unmove_duration`; the 收割者' standby is another talent, `sleepwalking`.
  revive: (bb) => exactly(bb, ['hp_ratio', 'move_speed', 'unmove_duration']),
});

/**
 * Whether a blackboard of one of these names is a shape its behaviour implements (敌能-153, 关卡-2); any other name
 * passes, for the other owners to judge.
 * @param {string} name @param {Record<string, unknown>} bb @returns {boolean}
 */
export function sharedShapeOwns(name, bb) {
  return !Object.hasOwn(SHAPES, name) || SHAPES[name](bb);
}
