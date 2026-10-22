// 泥岩小队践行者 / 组长 (docs/spec/foes.md 敌能-66): an arts barrier of dynamic × 3, and max HP and attack speed
// while any of it remains. The leader is not in the extracted IG-6 file; its numbers are enemy_database level 0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, damage, attrs, status, KIND } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { uncoveredAbilities, withFoeExtras, withoutIncomplete, FOE_EXTRAS } from '../src/foes.js';
import rm05 from '../data/levels/act1multi_rm05.json' with { type: 'json' };

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const SHAPE = { dynamic: 2000, max_hp: 0.5, attack_speed: 50 };
const LEADER = { dynamic: 3334, max_hp: 0.5, attack_speed: 50 };
const level = /** @type {any} */ (rm05);

/**
 * One rooted enemy of `key`, its record merged with the PRTS extras, on the tiny map.
 * @param {string} key @param {Record<string, unknown>} def
 */
function place(key, def) {
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [oneWave([spawnAt(0, key)])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 9 };
  c.behaviors = skeletonContent.behaviors;
  c.enemies[key] = withFoeExtras(key, /** @type {EnemyDef} */ ({ name: key, maxHp: 10000, atk: 0, def: 0, res: 0, moveSpeed: 1, ...def }));
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = w.units.find((u) => u.kind === KIND.ENEMY);
  if (!e) throw new Error(`no enemy ${key}`);
  status.applyStatus(e, 'root', {});
  return { c, w, e };
}

/** @param {{ w: World, c: any, e: Unit }} box @param {import('@aue/sim').damage.Damage} dmg */
const hit = (box, dmg) => damage.dealDamage(box.w, null, box.e, dmg, box.c);

/** @param {Unit} e */
function view(e) {
  const b = e.buffs.find((x) => x.key === 'mudShield');
  return { hp: e.hp, max: e.maxHp, aspd: attrs.statsOf(e).aspd, barrier: b ? b.value : null };
}

test('[敌能-66] [关卡-2] the pages barrier is dynamic × 3; IG-6 does not scale the blackboard', () => {
  const row = level.enemies.enemy_1091_mdhmmr;
  assert.equal(row.maxHp, 10000);
  assert.equal(row.atk, 900);
  assert.equal(row.def, 800);
  assert.equal(row.res, 30);
  assert.deepEqual(row.talents.shield, SHAPE);
  assert.equal(level.enemies.enemy_1091_mdhmmr_2, undefined);
  assert.deepEqual(level.difficulties.NORMAL.enemyMul, []);
  assert.deepEqual(level.difficulties.FOUR_STAR.enemyMul, [{ mods: { atk: 1.4, def: 1.2, max_hp: 1.3 } }]);
  const born = place('enemy_1091_mdhmmr', { maxHp: row.maxHp, talents: { shield: { ...row.talents.shield } } });
  assert.deepEqual(view(born.e), { hp: 15000, max: 15000, aspd: 150, barrier: 6000 });
  const lead = place('enemy_1091_mdhmmr_2', { maxHp: 13000, atk: 1000, talents: { shield: { ...LEADER } } });
  assert.deepEqual(view(lead.e), { hp: 19500, max: 19500, aspd: 150, barrier: 10002 });
});

test('[敌能-66] [伤害-8] [伤害-10] arts damage is absorbed; physical, true, elemental and 生命流失 are not', () => {
  const box = place('enemy_1091_mdhmmr', { talents: { shield: { ...SHAPE } } });
  assert.equal(hit(box, { type: 'arts', amount: 1000 }), 0);
  assert.deepEqual(view(box.e), { hp: 15000, max: 15000, aspd: 150, barrier: 5000 });
  assert.equal(hit(box, { type: 'phys', amount: 400 }), 400);
  assert.deepEqual(view(box.e), { hp: 14600, max: 15000, aspd: 150, barrier: 5000 });
  assert.equal(hit(box, { type: 'true', amount: 250 }), 250);
  assert.deepEqual(view(box.e), { hp: 14350, max: 15000, aspd: 150, barrier: 5000 });
  assert.equal(hit(box, { type: 'elemental', amount: 100 }), 100);
  assert.deepEqual(view(box.e), { hp: 14250, max: 15000, aspd: 150, barrier: 5000 });
  const loss = place('enemy_1091_mdhmmr', { talents: { shield: { ...SHAPE } } });
  assert.equal(hit(loss, { type: 'arts', amount: 80, hpLoss: true }), 80);
  assert.deepEqual(view(loss.e), { hp: 14920, max: 15000, aspd: 150, barrier: 6000 });
});

test('[敌能-66] [属性-4] max HP and attack speed last while any barrier remains, and the ratio is kept when it breaks', () => {
  const box = place('enemy_1091_mdhmmr', { talents: { shield: { ...SHAPE } } });
  assert.equal(hit(box, { type: 'arts', amount: 5999 }), 0);
  assert.deepEqual(view(box.e), { hp: 15000, max: 15000, aspd: 150, barrier: 1 });
  assert.equal(hit(box, { type: 'arts', amount: 1 }), 0);
  assert.deepEqual(view(box.e), { hp: 10000, max: 10000, aspd: 100, barrier: null });
  const cut = place('enemy_1091_mdhmmr', { talents: { shield: { ...SHAPE } } });
  assert.equal(hit(cut, { type: 'phys', amount: 3000 }), 3000);
  assert.deepEqual(view(cut.e), { hp: 12000, max: 15000, aspd: 150, barrier: 6000 });
  assert.equal(hit(cut, { type: 'arts', amount: 8000 }), 2000);
  assert.deepEqual(view(cut.e), { hp: 6000, max: 10000, aspd: 100, barrier: null });
  const lead = place('enemy_1091_mdhmmr_2', { maxHp: 13000, talents: { shield: { ...LEADER } } });
  assert.equal(hit(lead, { type: 'arts', amount: 10002 }), 0);
  assert.deepEqual(view(lead.e), { hp: 13000, max: 13000, aspd: 100, barrier: null });
});

test('[敌能-66] silence does not remove the barrier or the bonus', () => {
  const box = place('enemy_1091_mdhmmr', { talents: { shield: { ...SHAPE } } });
  status.applyStatus(box.e, 'silence', { seconds: 10 });
  step(box.w, box.c);
  assert.equal(attrs.statsOf(box.e).flags.silence, true);
  assert.deepEqual(view(box.e), { hp: 15000, max: 15000, aspd: 150, barrier: 6000 });
});

test('[敌能-66] [关卡-2] 覆面大锤客的同形黑板没有页面标记，仍算没有行为，出场也不获得屏障', () => {
  const hammer = /** @type {any} */ ({ talents: { shield: { ...SHAPE } } });
  const rock = /** @type {any} */ ({ talents: { shield: { dynamic: 5500, max_hp: 0.5, attack_speed: 50 } } });
  const tail = /** @type {any} */ ({ talents: { shield: { dynamic: 2000, def: 1250, page: 1 } } });
  assert.deepEqual(uncoveredAbilities([hammer]), ['shield']);
  assert.deepEqual(uncoveredAbilities([rock]), ['shield']);
  assert.deepEqual(uncoveredAbilities([tail]), ['shield']);
  assert.equal(FOE_EXTRAS.enemy_15059_dqhmmr, undefined);
  assert.equal(FOE_EXTRAS.enemy_1511_mdrock, undefined);
  const read = withoutIncomplete(withFoeExtras('enemy_1091_mdhmmr', /** @type {EnemyDef} */ ({ name: 'a', maxHp: 1, atk: 0, def: 0, res: 0, moveSpeed: 1, talents: { shield: { ...SHAPE } } })));
  assert.equal(read.talents?.shield?.page, 1);
  assert.deepEqual(uncoveredAbilities([read]), []);
  const stripped = withoutIncomplete(/** @type {EnemyDef} */ ({ name: 'h', maxHp: 1, atk: 0, def: 0, res: 0, moveSpeed: 1, talents: { shield: { ...SHAPE } } }));
  assert.deepEqual(stripped.talents, {});
  const bare = place('enemy_15059_dqhmmr', { talents: { shield: { ...SHAPE } } });
  assert.deepEqual(view(bare.e), { hp: 10000, max: 10000, aspd: 100, barrier: null });
});
