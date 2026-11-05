// 扎罗，“狼之主” (docs/spec/foes.md 敌能-148) for the tests: the enemy_database record (ArknightsGameData 17759cc8, level
// 0; the enemy is in no shipped level, so the record is built here, as defdown.test.js builds 碎骨) with FOE_EXTRAS
// merged, and an arena on the tiny level where 扎罗 stands on the road at column 2.
import { createWorld, step, status, damage } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

export const KEY = 'enemy_1535_wlfmster';
/** The unread variant with the same blackboards and a 10 s rebirth. */
export const AGAIN = 'enemy_15023_dqwlfm';

/**
 * The data's talents and skills (enemy_database 17759cc8, level 0), in the data's order.
 * @param {number} rebirth Reborn.duration @returns {Pick<EnemyDef, 'talents' | 'skills'>}
 */
function abilities(rebirth) {
  return {
    talents: {
      Passive: { sp: 1, damage_resistance: 0.3 }, Reborn: { duration: rebirth }, Passive2: { atk: 0.5, base_attack_time: -1.5, invincible_time: 10 },
    },
    skills: [
      { key: 'WildCalling', cooldown: 40, initCooldown: 5, sp: 0, bb: { duration: 5.5, sp: 35 } },
      { key: 'FearCage', cooldown: 0, initCooldown: 0, sp: 55,
        bb: { max_target: 3, attack_speed: -70, duration_s: 5, sp: 5, hp_ratio: 0.3, duration_bleed: 40, hp_ratio_offset: -0.2, duration_wait: 7 } },
    ],
  };
}

/**
 * The raw data record of 扎罗 (or of the variant, `again`), before FOE_EXTRAS.
 * @param {boolean} [again] @returns {EnemyDef}
 */
export function rawWolf(again = false) {
  return /** @type {EnemyDef} */ ({
    name: again ? '依然“狼之主”' : '扎罗，“狼之主”', maxHp: again ? 50000 : 35000, atk: again ? 1000 : 800, def: again ? 1300 : 1000, res: 60,
    moveSpeed: 0.6, baseAttackTime: 4, massLevel: 5, applyWay: 'ALL', motion: 'WALK', levelType: 'BOSS', lifePointReduce: 3,
    immune: ['silence', 'sleep', 'freeze', 'levitate'], ...(again ? { rangeRadius: 0.8 } : {}), ...abilities(again ? 10 : 40),
  });
}

/**
 * @typedef {object} WolfChange
 * @property {Record<string, Record<string, unknown>>} [bb] blackboard values by ability name, set after the extras
 * @property {Record<string, { initCooldown?: number, cooldown?: number, sp?: number }>} [skill] a skill's cooldowns or SP cost
 * @property {string[]} [without] abilities left out
 * @property {Record<string, unknown>} [def] record fields (atk, def …)
 */

/**
 * 扎罗 with FOE_EXTRAS merged, then a test's changes.
 * @param {WolfChange} [o] @returns {EnemyDef}
 */
export function wolf(o = {}) {
  const e = /** @type {any} */ (withFoeExtras(KEY, rawWolf()));
  const bb = o.bb ?? {}, out = o.without ?? [];
  const talents = Object.fromEntries(Object.entries(e.talents).filter(([k]) => !out.includes(k)).map(([k, v]) => [k, { ...v, ...bb[k] }]));
  const skills = e.skills.filter((/** @type {any} */ s) => !out.includes(s.key))
    .map((/** @type {any} */ s) => ({ ...s, ...o.skill?.[s.key], bb: { ...s.bb, ...bb[s.key] } }));
  return /** @type {EnemyDef} */ ({ ...e, ...o.def, talents, skills });
}

/**
 * The arena: 扎罗 appears on the first step and is pinned on the road at (row 1, col 2); our operators deploy on the
 * second step as [op, row, col]. Operators do not attack, cost nothing and have 40000 HP; `bird` flies, `wall` blocks.
 * @param {EnemyDef} def @param {[string, number, number][]} [ops] @param {(c: any) => void} [tune]
 */
export function arena(def, ops = [], tune) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [KEY]: def };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, KEY)])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 9 };
  const quiet = { cost: 0, atk: 0, def: 0, res: 0, blockCnt: 0, maxHp: 40000, baseAttackTime: 100 };
  Object.assign(c.operators.guard, quiet);
  Object.assign(c.operators.sniper, quiet);
  c.operators.bird = { ...c.operators.sniper, name: 'bird', motion: 'FLY' };
  c.operators.wall = { ...c.operators.guard, name: 'wall', blockCnt: 3 };
  c.operators.archer = { ...c.operators.sniper, name: 'archer' };
  tune?.(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = unitOf(w, KEY);
  pin(e);
  if (ops.length) deploy(w, c, ops);
  return { c, w, e };
}

/** Deploys on this step. @param {World} w @param {any} c @param {[string, number, number][]} ops */
export function deploy(w, c, ops) {
  step(w, c, ops.map(([op, row, col]) => [0, { type: 'deploy', op, row, col, dir: 0 }]));
}

/** 扎罗 stands at (row 1, col 2) and does not walk (an untagged root of the test's own). @param {Unit} e */
export function pin(e) {
  Object.assign(e, { x: 2, y: 1, path: [], pt: 0 });
  status.applyStatus(e, 'root', {});
}

/** @param {World} w @param {string} key @returns {Unit} */
export function unitOf(w, key) {
  const u = w.units.find((x) => x.key === key);
  if (!u) throw new Error(`no ${key}`);
  return u;
}

/** @param {World} w @param {any} c @param {number} n */
export function run(w, c, n) {
  for (let i = 0; i < n; i++) step(w, c);
}

/**
 * The hits on `id` over the next `n` steps, with the frame of each.
 * @param {World} w @param {any} c @param {number} id @param {number} n
 */
export function hitsOn(w, c, id, n) {
  /** @type {{ frame: number, src: number, damage: number }[]} */
  const out = [];
  for (let i = 0; i < n; i++) {
    const frame = w.frame;
    for (const ev of /** @type {any[]} */ (step(w, c))) if (ev.type === 'hit' && ev.target === id) out.push({ frame, src: ev.id, damage: ev.damage });
  }
  return out;
}

/**
 * 扎罗's HP runs out now; the step after puts it into its rebirth at the frame's end. Returns the frame of that step.
 * @param {World} w @param {any} c @param {Unit} e
 */
export function fell(w, c, e) {
  damage.setHp(e, 0);
  const at = w.frame;
  step(w, c);
  return at;
}

/** @param {Unit} u @param {string} key */
export const buffOf = (u, key) => u.buffs.find((b) => b.key === key);
