// The 鼠王 fixture (docs/spec/foes.md 敌能-144) shared by ratking.test.js and ratking-sand.test.js. 鼠王 is in no extracted
// level, so its record is enemy_database level 0 (ArknightsGameData 17759cc8) built here; withFoeExtras adds the page
// marks and the cross's arm, and withoutIncomplete drops what the content would drop (index.js).
import { createWorld, step, attrs, status } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras, withoutIncomplete } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

export const KEY = 'enemy_1509_mousek';

/** enemy_database level 0 (17759cc8); the page's 攻击性 远程 法术 is the arts. */
export const RAT = Object.freeze({
  name: '鼠王', maxHp: 22000, atk: 470, def: 350, res: 30, moveSpeed: 0.6, baseAttackTime: 3.4, massLevel: 5, rangeRadius: 2.5,
  applyWay: 'RANGED', motion: 'WALK', dmgType: 'arts', levelType: 'BOSS', immune: ['stun', 'silence', 'freeze'],
});
/** talentBlackboard, by talent. */
export const TALENTS = Object.freeze({ shield: { dynamic: 4667 }, defup: { def: 3000 }, enrage: { hp_ratio: 0.5, damage_scale: 1.5 } });
/** skills, in the data's (and the page's) order. */
export const SKILLS = Object.freeze([
  { key: 'DriftSand', initCooldown: 20, cooldown: 15, sp: 0, bb: { damage: 800 } },
  { key: 'SandStorm', initCooldown: 60, cooldown: 25, sp: 0, bb: { damage: 70, atk: -0.7, duration: 15 } },
  { key: 'Mark', initCooldown: 1, cooldown: 9999, sp: 0, bb: {} },
]);

/** The raw record, before the content's extras. @param {Record<string, unknown>} [over] @returns {EnemyDef} */
export const rawRat = (over = {}) => /** @type {EnemyDef} */ (/** @type {unknown} */ ({ ...RAT, talents: structuredClone(TALENTS), skills: structuredClone(SKILLS), ...over }));

/**
 * The record as the content loads it, with `sand` merged into 唱沙's blackboard after the extras (to vary them).
 * @param {Record<string, unknown>} [over] @param {Record<string, number>} [sand] @returns {EnemyDef}
 */
export function rat(over = {}, sand = {}) {
  const e = withoutIncomplete(withFoeExtras(KEY, rawRat(over)));
  return { ...e, skills: (e.skills ?? []).map((s) => (s.key === 'DriftSand' ? { ...s, bb: { ...s.bb, ...sand } } : s)) };
}

/** A tile every operator may stand on. @param {string} key */
const tile = (key) => ({ key, height: 'LOWLAND', buildable: 'ALL', passable: 'ALL', side: 'ALL' });

/** [operator key, row, col, max HP, more of its record]. @typedef {[string, number, number, number, Record<string, unknown>?]} Seat */

/**
 * 鼠王 (record `def`) rooted on `at` ([row, col]) of a 9 × 5 floor, with `more` enemies (spawned at the route start), and
 * one operator deployed per seat: 0 ATK, DEF and RES, blocking nobody unless the seat says so. Two frames have run (its
 * spawn, the deploy), so 唱沙's first cooldown has 598 frames left; its attack cooldown is 0.
 * @param {EnemyDef} def @param {Seat[]} seats @param {{ at?: [number, number], more?: Record<string, EnemyDef>, tweak?: (c: any) => void, players?: number }} [o]
 */
export function field(def, seats, o = {}) {
  const at = o.at ?? [4, 8], more = o.more ?? {};
  const c = /** @type {any} */ (tinyContent());
  const end = (/** @type {number} */ r, /** @type {number} */ k) => (r === 0 && k === 0 ? 'tile_start' : r === 0 && k === 8 ? 'tile_end' : 'tile_road');
  c.level = {
    ...c.level, width: 9, height: 5,
    tiles: Array.from({ length: 5 }, (_, r) => Array.from({ length: 9 }, (_, k) => tile(end(r, k)))),
    routes: [{ start: { row: 0, col: 0 }, end: { row: 0, col: 8 }, motion: 'WALK', checkpoints: [] }],
    waves: [oneWave([spawnAt(0, KEY), ...Object.keys(more).map((k) => spawnAt(0, k))])],
    options: { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 12 },
  };
  c.enemies = { [KEY]: def, ...more };
  c.behaviors = skeletonContent.behaviors;
  c.operators = Object.fromEntries(seats.map(([op, , , maxHp, extra]) => [op, {
    name: op, position: 'MELEE', cost: 0, blockCnt: 0, baseAttackTime: 1, maxHp, atk: 0, def: 0, res: 0, range: [{ row: 0, col: 0 }], ...extra,
  }]));
  o.tweak?.(c);
  const w = createWorld(c, { seed: 1, players: o.players ?? 1 });
  step(w, c);
  const e = /** @type {Unit} */ (w.units.find((u) => u.key === KEY));
  Object.assign(e, { x: at[1], y: at[0], path: [], pt: 0 });
  status.applyStatus(e, 'root', {});
  // no attack in the deploy step; then the attack slot is free, so each test starts from the same point
  e.atkCd = 9999;
  step(w, c, seats.map(([op, row, col]) => [0, { type: 'deploy', op, row, col, dir: 0 }]));
  e.atkCd = 0;
  /** @type {Record<string, Unit>} */
  const ops = Object.fromEntries(seats.map(([op]) => [op, /** @type {Unit} */ (w.units.find((u) => u.key === op))]));
  return { c, w, e, ops };
}

/** The HP a unit has lost. @param {Unit} u */
export const lost = (u) => attrs.statsOf(u).maxHp - u.hp;

/** n frames. @param {{ w: World, c: any }} box @param {number} n */
export function run(box, n) {
  /** @type {any[]} */
  const out = [];
  for (let i = 0; i < n; i++) out.push(...step(box.w, box.c));
  return out;
}
