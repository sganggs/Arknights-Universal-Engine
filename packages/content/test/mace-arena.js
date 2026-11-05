// 锏 (docs/spec/foes.md 敌能-157) for the tests: its enemy_database record (ArknightsGameData 17759cc8, level 0; the enemy
// is in no shipped level, so the record is built here, as defdown.test.js builds 碎骨) with FOE_EXTRAS merged, and an
// arena on the tiny level where 锏 stands rooted on the road, on its move toward the checkpoint at (row 1, col 4).
import { createWorld, step, status, damage, routes, bus } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

export const KEY = 'enemy_1525_blkswb';
/** A neutral unit (合作-9) for the tests that leave it out. */
export const MAN = 'man';
/** The route: from the start down to the road, a checkpoint at (row 1, col 4), the goal at (row 1, col 5). */
const ROAD = { start: { row: 2, col: 0 }, end: { row: 1, col: 5 }, motion: 'WALK', checkpoints: [{ type: 'MOVE', row: 1, col: 4, time: 0 }] };

/**
 * The raw data record of 锏 (enemy_database 17759cc8, level 0), before FOE_EXTRAS: talents and skills in the data's order.
 * @returns {EnemyDef}
 */
export function rawMace() {
  return /** @type {EnemyDef} */ ({
    name: '锏', maxHp: 28000, atk: 900, def: 600, res: 50, moveSpeed: 0.6, baseAttackTime: 4, rangeRadius: 0, massLevel: 6,
    applyWay: 'MELEE', motion: 'WALK', levelType: 'BOSS', lifePointReduce: 2, immune: ['stun', 'silence', 'sleep', 'freeze'],
    talents: {
      AtkUp: { 'enemy_blkswb_t_1.atk': 0.3, 'enemy_blkswb_t_1[reborn].atk': 0.5 },
      DefPenetrate: { 'enemy_blkswb_t_2.def_penetrate': 0.2, 'enemy_blkswb_t_2[reborn].def_penetrate': 0.4 },
      Reborn: { duration: 5, invincible: 10 },
      ClearSp: { hp_ratio: 0.25, duration: 10, range_radius: 2.8 },
    },
    skills: [
      { key: 'CircleAttack', cooldown: 15, initCooldown: 15, sp: 0, bb: { atk_scale: 1, range_radius: 1.5 } },
      { key: 'Blink', cooldown: 30, initCooldown: 0, sp: 0, bb: { atk_scale: 1.5, dist: 1.5 } },
      { key: 'CircleAttack2', cooldown: 15, initCooldown: 15, sp: 0, bb: { atk_scale: 1, range_radius: 1.5 } },
      { key: 'Blink2', cooldown: 30, initCooldown: 0, sp: 0, bb: { atk_scale: 1.5, dist: 1.5 } },
    ],
  });
}

/**
 * @typedef {object} MaceChange
 * @property {Record<string, Record<string, unknown>>} [bb] blackboard values by ability name, set after the extras
 * @property {Record<string, { initCooldown?: number, cooldown?: number }>} [skill] a skill's cooldowns
 * @property {Record<string, unknown>} [def] record fields (atk, def …)
 */

/**
 * 锏 with FOE_EXTRAS merged, then a test's changes. @param {MaceChange} [o] @returns {EnemyDef}
 */
export function mace(o = {}) {
  const e = /** @type {any} */ (withFoeExtras(KEY, rawMace()));
  const bb = o.bb ?? {};
  const talents = Object.fromEntries(Object.entries(e.talents).map(([k, v]) => [k, { ...v, ...bb[k] }]));
  const skills = e.skills.map((/** @type {any} */ s) => ({ ...s, ...o.skill?.[s.key], bb: { ...s.bb, ...bb[s.key] } }));
  return /** @type {EnemyDef} */ ({ ...e, ...o.def, talents, skills });
}

/**
 * The arena: 锏 appears on the first step and stands rooted at `at` (row 1, col 2 by default) on its first move; a
 * neutral unit stands at (row 0, col 1) when `man` is set; our operators deploy on the second step as [op, row, col]
 * (or [op, row, col, player] with `players` 2, a co-op match). Operators cost nothing, do not attack and have 1e6 HP and
 * no 防御; `tune` changes the content first.
 * @param {EnemyDef} def @param {[string, number, number, number?][]} [ops]
 * @param {{ at?: { x: number, y: number }, man?: boolean, players?: number, tune?: (c: any) => void }} [o]
 */
export function arena(def, ops = [], o = {}) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [KEY]: def, [MAN]: { name: 'man', maxHp: 1e6, atk: 0, def: 0, res: 0, moveSpeed: 0, neutral: true } };
  c.behaviors = skeletonContent.behaviors;
  c.level.routes = [ROAD];
  c.level.waves = [oneWave([spawnAt(0, KEY), ...(o.man ? [spawnAt(0, MAN)] : [])])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 9 };
  const quiet = { cost: 0, atk: 0, def: 0, res: 0, maxHp: 1e6, baseAttackTime: 100 };
  Object.assign(c.operators.guard, quiet);
  Object.assign(c.operators.sniper, quiet);
  c.operators.archer = { ...c.operators.sniper, name: 'archer' };
  c.operators.wall = { ...c.operators.guard, name: 'wall' };
  o.tune?.(c);
  const w = createWorld(c, { seed: 1, players: o.players ?? 1 });
  step(w, c);
  const e = unitOf(w, KEY), at = o.at ?? { x: 2, y: 1 };
  routes.displace(e, at.x, at.y);
  status.applyStatus(e, 'root', {});
  if (o.man) {
    const m = unitOf(w, MAN);
    routes.displace(m, 1, 0);
    status.applyStatus(m, 'root', {});
  }
  if (ops.length) deploy(w, c, ops);
  return { c, w, e };
}

/** Our operators deploy on this step, as [op, row, col] or [op, row, col, player]. @param {World} w @param {any} c @param {[string, number, number, number?][]} ops */
export function deploy(w, c, ops) {
  step(w, c, ops.map(([op, row, col, p = 0]) => [p, { type: 'deploy', op, row, col, dir: 0 }]));
}

/** The operator of ours at (row, col). @param {World} w @param {number} row @param {number} col @returns {Unit} */
export function opAt(w, row, col) {
  const u = w.units.find((x) => x.owner >= 0 && x.x === col && x.y === row);
  if (!u) throw new Error(`no operator at (${row}, ${col})`);
  return u;
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

/** @param {Unit} u @param {string} key */
export const has = (u, key) => u.buffs.some((b) => b.key === key);

/**
 * Every hit 锏 deals from now on (the bus's `hit`, 钩子-3): its target, amount before 防御, its own penetration and source
 * flags, and the frame. @param {World} w @param {Unit} e
 */
export function watch(w, e) {
  /** @type {{ frame: number, target: number, amount: number, pen: number, attack: boolean, skill: boolean }[]} */
  const out = [];
  bus.on(w, 'hit', (x) => {
    if (x.source !== e) return;
    out.push({ frame: w.frame, target: x.target.id, amount: x.dmg.amount, pen: x.dmg.defIgnorePct ?? 0, attack: !!x.dmg.isAttack, skill: !!x.dmg.isSkill });
  });
  return out;
}

/**
 * 锏's HP runs out now; the step after puts it into its rebirth at the frame's end. Returns the frame of that step.
 * @param {World} w @param {any} c @param {Unit} e
 */
export function fell(w, c, e) {
  damage.setHp(e, 0);
  const at = w.frame;
  step(w, c);
  return at;
}

/**
 * Brings 锏 into its second form: its first fall, then the rebirth's `frames` steps; returns the frame the second
 * form began. The rebirth clears every buff, the test's root too, so it is rooted again (repin).
 * @param {World} w @param {any} c @param {Unit} e @param {number} [frames] @returns {number}
 */
export function secondForm(w, c, e, frames = 150) {
  fell(w, c, e);
  repin(e);
  run(w, c, frames);
  if (!has(e, 'maceSecond')) throw new Error('not in the second form');
  return w.frame - 1;
}

/** 锏 rooted again where it stands (an untagged root of the test's own). @param {Unit} e */
export function repin(e) {
  status.applyStatus(e, 'root', {});
}
