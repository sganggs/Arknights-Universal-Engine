// 深池逐火's reed `aura` (docs/spec/foes.md 敌能-159). Records are enemy_database level 0 (ArknightsGameData 17759cc8);
// handbook damageType MAGIC is arts. The reed is not in this engine, so an attack adds no 灼燃 and a guard takes no less.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, damage, attrs, status, elements, KIND } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras, uncoveredAbilities, FOE_EXTRAS } from '../src/foes.js';

/** @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const REVIVE = 'Revive[Trigger]';

/**
 * Level 0 of the four (数据). `hits` is `Revive[Trigger].prop_max_hp`.
 * @type {Record<string, { maxHp: number, atk: number, def: number, res: number, moveSpeed: number, baseAttackTime: number, massLevel: number, hits: number, elite?: boolean, guard?: boolean }>}
 */
const DATA = {
  enemy_1288_duskls: { maxHp: 5000, atk: 150, def: 50, res: 50, moveSpeed: 0.7, baseAttackTime: 2, massLevel: 1, hits: 5 },
  enemy_1288_duskls_2: { maxHp: 6000, atk: 180, def: 100, res: 50, moveSpeed: 0.7, baseAttackTime: 2, massLevel: 1, hits: 5 },
  enemy_1292_duskld: { maxHp: 10000, atk: 350, def: 550, res: 60, moveSpeed: 0.5, baseAttackTime: 3.5, massLevel: 4, hits: 10, elite: true, guard: true },
  enemy_1292_duskld_2: { maxHp: 15000, atk: 450, def: 750, res: 60, moveSpeed: 0.5, baseAttackTime: 3.5, massLevel: 4, hits: 10, elite: true, guard: true },
};

/**
 * One database enemy. `ratio` and `dr` override the aura numbers; `dr` omitted keeps the guard's 0.5.
 * @param {string} key @param {{ ratio?: number, dr?: number, silenceImmune?: boolean }} [over]
 * @returns {EnemyDef}
 */
function record(key, over = {}) {
  const d = DATA[key];
  const aura = { ep_damage_ratio: over.ratio ?? 1, range_radius: 1.5, ...(d.guard ? { damage_resistance: over.dr ?? 0.5 } : {}) };
  return {
    name: key, maxHp: d.maxHp, atk: d.atk, def: d.def, res: d.res, moveSpeed: d.moveSpeed, baseAttackTime: d.baseAttackTime,
    massLevel: d.massLevel, applyWay: 'MELEE', motion: 'WALK', dmgType: 'arts', ...(d.elite ? { levelType: 'ELITE' } : {}),
    ...(over.silenceImmune !== false ? { immune: ['silence'] } : {}),
    talents: { [REVIVE]: { prop_max_hp: d.hits, interval: 10 }, aura },
    skills: [{ key: 'BornAnim', cooldown: 0, initCooldown: 0, sp: 0, bb: {} }],
  };
}

/** @param {string} key @param {EnemyDef} def @returns {string[]} */
const gaps = (key, def) => uncoveredAbilities([withFoeExtras(key, def)]);

/** @param {Record<string, unknown>} bb @returns {EnemyDef} */
const bare = (bb) => /** @type {EnemyDef} */ ({ name: 'e', maxHp: 100, atk: 100, def: 0, res: 0, moveSpeed: 1, talents: { aura: bb } });

/**
 * The enemy spawns rooted on the road tile a guard deploys onto. Its attack waits until `atkCd` is set to 0.
 * @param {string} key @param {EnemyDef} def
 */
function fight(key, def) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [key]: withFoeExtras(key, def) };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, key)])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 8 };
  const tough = { cost: 0, maxHp: 1e6, atk: 0, def: 0, res: 0, maxEp: 1e6, blockCnt: 1 };
  Object.assign(c.operators.guard, tough);
  Object.assign(c.operators.sniper, tough, { blockCnt: 0 });
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = w.units.find((u) => u.kind === KIND.ENEMY);
  assert.ok(e);
  Object.assign(e, { x: 2, y: 1, path: [], pt: 0, atkCd: 999 });
  status.applyStatus(e, 'root', {});
  return { c, w, e };
}

/** @param {ReturnType<typeof fight>} box @param {string} op @param {number} row @param {number} col */
function place(box, op, row, col) {
  step(box.w, box.c, [[0, { type: 'deploy', op, row, col, dir: 0 }]]);
  const u = box.w.units.find((x) => x.kind === KIND.OPERATOR && x.key === op);
  assert.ok(u);
  return u;
}

/** One swing, now. @param {ReturnType<typeof fight>} box @returns {any[]} */
function strike(box) {
  box.e.atkCd = 0;
  return /** @type {any[]} */ (step(box.w, box.c));
}

/** @param {any[]} ev @param {number} id */
const hitsOf = (ev, id) => ev.filter((x) => x.type === 'hit' && x.id === id);

/** @param {Unit} u */
const fire = (u) => elements.epOf(u, 'FIRE');

/** A taken-damage multiplier from this aura would live on a buff. @param {Unit} e */
const reduced = (e) => e.buffs.some((b) => b.mods?.physTakenMul != null || b.mods?.artsTakenMul != null);

/**
 * Damage a hit of `amount` actually takes, then the HP is put back.
 * @param {ReturnType<typeof fight>} box @param {'phys' | 'arts' | 'true'} type @param {number} amount
 */
function taken(box, type, amount) {
  const hp = box.e.hp;
  const back = damage.dealDamage(box.w, null, box.e, { type, amount });
  box.e.hp = hp;
  return back;
}

test('[敌能-159] the four database records are covered with Revive and BornAnim, and have no page row', () => {
  for (const key of Object.keys(DATA)) {
    assert.deepEqual(gaps(key, record(key)), [], key);
    assert.equal(FOE_EXTRAS[key], undefined, key);
  }
});

test('[敌能-159] a missing key, an extra key or a non-number stays uncovered; other aura shapes stay as they were', () => {
  /** @param {Record<string, unknown>} bb */
  const miss = (bb) => gaps('shape', bare(bb));
  assert.deepEqual(miss({ ep_damage_ratio: 1 }), ['aura']);
  assert.deepEqual(miss({ ep_damage_ratio: 1, range_radius: 1.5, foo: 1 }), ['aura']);
  assert.deepEqual(miss({ ep_damage_ratio: '1', range_radius: 1.5 }), ['aura']);
  assert.deepEqual(miss({ ep_damage_ratio: 1, range_radius: 1.5, damage_resistance: 0.5, foo: 1 }), ['aura']);
  assert.deepEqual(miss({ damage_resistance: 0.5, range_radius: 1.5 }), ['aura']);
  assert.deepEqual(miss({ atk: 0.15, max_valid_stack_cnt: 6 }), []);
  assert.deepEqual(miss({
    'enemy_dsuply_t[attr_buff].atk': 0.1, 'enemy_dsuply_t[attr_buff].max_valid_stack_cnt': 5, ep_damage_ratio: 0.1,
  }), []);
  assert.deepEqual(miss({ block_cnt: 3 }), []);
  assert.deepEqual(miss({ sp: 0, value: 0, block_cnt: 3 }), []);
  assert.deepEqual(miss({ range_radius: 1.5, atk_scale: 1, ep_damage_ratio: 0.5 }), []);
  assert.deepEqual(miss({ interval: 0.5, atk_scale: 0.05, range_radius: 1.1, isenabled: 'aura_off' }), ['aura']);
});

test('[敌能-159] a warrior hit is its arts attack and adds no 灼燃, at 100% and at another ratio', () => {
  for (const [key, ratio] of /** @type {const} */ ([['enemy_1288_duskls', 1], ['enemy_1288_duskls_2', 0.25]])) {
    const box = fight(key, record(key, { ratio }));
    const g = place(box, 'guard', 1, 2);
    const ev = strike(box);
    assert.equal(hitsOf(ev, box.e.id).length, 1, key);
    assert.equal(g.hp, 1e6 - DATA[key].atk, key);
    assert.equal(fire(g), 1e6, key);
    assert.equal(reduced(box.e), false, key);
  }
});

test('[敌能-159] a guard takes full physical, arts and true damage at 0.5 and at 0.2', () => {
  for (const [key, dr] of /** @type {const} */ ([['enemy_1292_duskld', 0.5], ['enemy_1292_duskld_2', 0.2]])) {
    const box = fight(key, record(key, { dr }));
    const d = DATA[key];
    assert.equal(reduced(box.e), false, key);
    assert.equal(taken(box, 'phys', 2000), 2000 - d.def, key);
    assert.equal(taken(box, 'arts', 1000), 1000 * (1 - d.res / 100), key);
    assert.equal(taken(box, 'true', 300), 300, key);
    const g = place(box, 'guard', 1, 2);
    strike(box);
    assert.equal(g.hp, 1e6 - d.atk, key);
    assert.equal(fire(g), 1e6, key);
  }
});

test('[敌能-159] [敌能-28] a stack-capped aura still feeds a 重生造物 when the reed shape is covered', () => {
  const c = /** @type {any} */ (tinyContent());
  const cart = bare({ 'enemy_dsuply_t[attr_buff].atk': 0.1, 'enemy_dsuply_t[attr_buff].max_valid_stack_cnt': 5, ep_damage_ratio: 0.1 });
  const made = /** @type {EnemyDef} */ ({ name: 'made', maxHp: 1000, atk: 100, def: 0, res: 0, moveSpeed: 0, talents: { Creation: {} } });
  c.enemies = { cart: withFoeExtras('cart', cart), made: withFoeExtras('made', made) };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, 'cart'), spawnAt(0, 'made')])];
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const z = w.units.find((u) => u.key === 'made');
  assert.ok(z);
  assert.ok(Math.abs(attrs.statsOf(z).atk - 110) < 1e-6);
});
