// 鼠王 (docs/spec/foes.md 敌能-144): which shapes are covered, the arts barrier with DEF, 低血 and the normal attack.
// 唱沙 is ratking-sand.test.js. The record is enemy_database level 0 (ratking-kit.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step, attrs, damage, status, buffs } from '@aue/sim';
import { uncoveredAbilities, withFoeExtras, FOE_EXTRAS } from '../src/foes.js';
import { KEY, TALENTS, rawRat, rat, field, lost, run } from './ratking-kit.js';

/** @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

/** The barrier left, DEF and HP. @param {Unit} e */
function view(e) {
  const b = e.buffs.find((x) => x.key === 'ratShield');
  return { barrier: b ? b.value : null, def: attrs.statsOf(e).def, hp: e.hp };
}

/** A record of only these abilities, for the coverage check. @param {Record<string, any>} talents @param {any[]} [skills] */
const only = (talents, skills) => /** @type {EnemyDef} */ (/** @type {unknown} */ ({ talents, ...(skills ? { skills } : {}) }));
/** One skill of that name and blackboard. @param {string} key @param {Record<string, unknown>} bb */
const skill = (key, bb) => [{ key, initCooldown: 1, cooldown: 1, sp: 0, bb }];

test('[敌能-144] [关卡-2] the page marks finish shield, defup and DriftSand; SandStorm and Mark stay uncovered', () => {
  assert.deepEqual(uncoveredAbilities([rawRat()]), ['shield', 'defup', 'DriftSand', 'SandStorm', 'Mark']);
  assert.deepEqual(uncoveredAbilities([withFoeExtras(KEY, rawRat())]), ['SandStorm', 'Mark']);
  assert.match(FOE_EXTRAS[KEY].source, /title=%E9%BC%A0%E7%8E%8B&oldid=378897$/);
  const e = rat();
  assert.deepEqual(e.talents, { shield: { dynamic: 4667, page: 1 }, defup: { def: 3000, page: 1 }, enrage: { hp_ratio: 0.5, damage_scale: 1.5 }, noFly: {} });
  assert.deepEqual(e.skills?.map((s) => [s.key, s.bb]), [['DriftSand', { damage: 800, arm: 3 }], ['SandStorm', { damage: 70, atk: -0.7, duration: 15 }], ['Mark', {}]]);
});

test('[敌能-144] [关卡-2] shared names: the unread shapes stay uncovered and the other owners keep theirs', () => {
  // 布景小丑 and 布景大师 have { dynamic } alone; 灰尾's { dynamic, def } is not this shape even with the mark.
  assert.deepEqual(uncoveredAbilities([only({ shield: { dynamic: 2500 } }), only({ shield: { dynamic: 3000 } })]), ['shield']);
  assert.deepEqual(uncoveredAbilities([only({ shield: { dynamic: 2000, def: 1250, page: 1 } })]), ['shield']);
  assert.deepEqual(uncoveredAbilities([only({ shield: { dynamic: '4667', page: 1 } })]), ['shield']);
  assert.deepEqual(uncoveredAbilities([only({ shield: { dynamic: 4667, page: 2 } })]), ['shield']);
  assert.deepEqual(uncoveredAbilities([only({ shield: { dynamic: 2000, max_hp: 0.5, attack_speed: 50, page: 1 } })]), []);
  // defup: 御4 and 寒霜 stay 敌能-35's; a def without the mark, or a string def, is not 鼠王's.
  assert.deepEqual(uncoveredAbilities([only({ defup: { def: 300, range_radius: 2.5 } }), only({ defup: { range_radius: 2.5 } })]), []);
  assert.deepEqual(uncoveredAbilities([only({ defup: { def: 3000 } })]), ['defup']);
  assert.deepEqual(uncoveredAbilities([only({ defup: { def: '3000', page: 1 } })]), ['defup']);
  assert.deepEqual(uncoveredAbilities([only({ defup: { def: 3000, page: 1 } })]), []);
  assert.deepEqual(uncoveredAbilities([only({ enrage: { hp_ratio: '0.5', damage_scale: 1.5 } }), only({ enrage: { hp_ratio: 0.5, damage_scale: 1.5, atk: 1 } })]), ['enrage']);
  assert.deepEqual(uncoveredAbilities([only({ enrage: { hp_ratio: 0.5, damage_scale: 1.5 } })]), []);
  for (const bb of [{ damage: 800 }, { damage: 800, arm: '3' }, { damage: '800', arm: 3 }, { damage: 800, arm: 3, radius: 1 }]) {
    assert.deepEqual(uncoveredAbilities([only({}, skill('DriftSand', bb))]), ['DriftSand']);
  }
  assert.deepEqual(uncoveredAbilities([only({}, skill('DriftSand', { damage: 800, arm: 3 }))]), []);
  // 怨恨祭坛's Mark has max_target; neither Mark has a behaviour.
  assert.deepEqual(uncoveredAbilities([only({}, skill('Mark', { max_target: 2 })), only({}, skill('Mark', { page: 1 }))]), ['Mark']);
});

test('[敌能-144] 屏障: 3 × dynamic of arts, and DEF + defup.def (直接加算) while any of it remains', () => {
  const box = field(rat(), []);
  assert.deepEqual(view(box.e), { barrier: 14001, def: 3350, hp: 22000 });
  const other = field(rat({ talents: { ...structuredClone(TALENTS), shield: { dynamic: 1000 }, defup: { def: 500 } } }), []);
  assert.deepEqual(view(other.e), { barrier: 3000, def: 850, hp: 22000 });
  // 直接加算: a +50 % 直接乘算 then multiplies the 3000 with the base (a 最终加算 would give 350 × 1.5 + 3000 = 3525).
  buffs.addBuff(box.e, buffs.makeBuff({ key: 'testDefPct', mods: { defPct: 0.5 } }));
  assert.equal(attrs.statsOf(box.e).def, 5025);
  assert.equal(box.e.buffs.filter((b) => b.key === 'ratShield').length, 1);
});

test('[敌能-144] 屏障: no mark, no barrier — 布景小丑\'s { dynamic } and a string dynamic grant nothing', () => {
  const clown = field(withFoeExtras('enemy_10104_mjcbln', rawRat({ talents: { shield: { dynamic: 2500 } } })), []);
  assert.deepEqual(view(clown.e), { barrier: null, def: 350, hp: 22000 });
  const text = field(/** @type {EnemyDef} */ (/** @type {unknown} */ (rawRat({ talents: { shield: { dynamic: '4667', page: 1 }, defup: { def: 3000, page: 1 } } }))), []);
  assert.deepEqual(view(text.e), { barrier: null, def: 350, hp: 22000 });
  // a defup that is not 鼠王's shape adds no DEF to the barrier
  const bare = field(rawRat({ talents: { shield: { dynamic: 1000, page: 1 }, defup: { def: 3000 } } }), []);
  assert.deepEqual(view(bare.e), { barrier: 3000, def: 350, hp: 22000 });
  // 3 × dynamic not above 0: no barrier, so no DEF either
  for (const dynamic of [0, -100]) {
    const none = field(rat({ talents: { ...structuredClone(TALENTS), shield: { dynamic } } }), []);
    assert.deepEqual([dynamic, view(none.e), none.e.buffs.some((b) => b.key === 'ratShield')], [dynamic, { barrier: null, def: 350, hp: 22000 }, false]);
  }
});

test('[敌能-144] [伤害-8] [伤害-10] 屏障: arts after RES comes off it; physical, true, elemental and 生命流失 do not', () => {
  const box = field(rat(), []);
  /** @param {import('@aue/sim').damage.Damage} dmg */
  const hit = (dmg) => damage.dealDamage(box.w, null, box.e, dmg, box.c);
  assert.equal(hit({ type: 'arts', amount: 1000 }), 0);
  assert.deepEqual(view(box.e), { barrier: 13301, def: 3350, hp: 22000 });
  assert.equal(hit({ type: 'phys', amount: 5000 }), 1650);
  assert.equal(hit({ type: 'true', amount: 100 }), 100);
  assert.equal(hit({ type: 'elemental', amount: 100 }), 100);
  assert.equal(hit({ type: 'arts', amount: 50, hpLoss: true }), 50);
  assert.deepEqual(view(box.e), { barrier: 13301, def: 3350, hp: 22000 - 1650 - 100 - 100 - 50 });
});

test('[敌能-144] 屏障: the hit that empties it takes the DEF away in that step, and the rest of it reaches the HP', () => {
  const box = field(rat({ talents: { ...structuredClone(TALENTS), shield: { dynamic: 1000 } } }), []);
  /** @param {import('@aue/sim').damage.Damage} dmg */
  const hit = (dmg) => damage.dealDamage(box.w, null, box.e, dmg, box.c);
  assert.equal(hit({ type: 'arts', amount: 4000 }), 0);
  assert.deepEqual(view(box.e), { barrier: 200, def: 3350, hp: 22000 });
  assert.equal(hit({ type: 'arts', amount: 1000 }), 500);
  assert.deepEqual(view(box.e), { barrier: null, def: 350, hp: 21500 });
  assert.equal(hit({ type: 'phys', amount: 5000 }), 4650);
  assert.equal(box.e.buffs.some((b) => b.key === 'ratShield'), false);
});

test('[敌能-144] 屏障 and 低血 are talents: silence takes neither away', () => {
  const box = field(rat({ immune: [] }), []);
  status.applyStatus(box.e, 'silence', { seconds: 10 });
  box.e.hp = 10000;
  step(box.w, box.c);
  assert.equal(attrs.statsOf(box.e).flags.silence, true);
  assert.deepEqual(view(box.e), { barrier: 14001, def: 3350, hp: 10000 });
  assert.equal(attrs.statsOf(box.e).dmgDealtMul, 1.5);
});

test('[敌能-144] 低血: strictly below hp_ratio of its max HP, × damage_scale on all it deals; one buff, gone once not below', () => {
  const box = field(rat(), []);
  const mul = () => attrs.statsOf(box.e).dmgDealtMul, rage = () => box.e.buffs.filter((b) => b.key === 'ratRage').length;
  box.e.hp = 11000;
  run(box, 3);
  assert.deepEqual([mul(), rage()], [1, 0]);
  box.e.hp = 10999;
  run(box, 5);
  assert.deepEqual([mul(), rage()], [1.5, 1]);
  box.e.hp = 11000;
  step(box.w, box.c);
  assert.deepEqual([mul(), rage()], [1, 0]);
  box.e.hp = 5000;
  run(box, 2);
  assert.deepEqual([mul(), rage()], [1.5, 1]);
  const other = field(rat({ talents: { ...structuredClone(TALENTS), enrage: { hp_ratio: 0.3, damage_scale: 2 } } }), []);
  other.e.hp = 8800;
  step(other.w, other.c);
  assert.equal(attrs.statsOf(other.e).dmgDealtMul, 1);
  other.e.hp = 6599;
  step(other.w, other.c);
  assert.equal(attrs.statsOf(other.e).dmgDealtMul, 2);
});

test('[敌能-144] 低血: the line is hp_ratio of its current max HP — a max-HP buff raises it', () => {
  const box = field(rat(), []);
  buffs.addBuff(box.e, buffs.makeBuff({ key: 'testHp', mods: { hpPct: 1 } }));
  assert.equal(attrs.statsOf(box.e).maxHp, 44000);
  box.e.hp = 21999;
  step(box.w, box.c);
  assert.equal(attrs.statsOf(box.e).dmgDealtMul, 1.5);
  box.e.hp = 22000;
  step(box.w, box.c);
  assert.equal(attrs.statsOf(box.e).dmgDealtMul, 1);
});

test('[敌能-144] [敌能-33] 普通攻击: arts at a ground unit in range, never at a flying one; 低血 multiplies it', () => {
  // 唱沙 is kept off; the flyer is nearer, the ground unit is still in reach (2 ≤ 2.5 + 0.25).
  const box = field(rat(), [['bird', 2, 3, 5000, { motion: 'FLY' }], ['ground', 2, 6, 5000, { res: 20 }]], { at: [2, 4] });
  box.e.ab['DriftSand.cd'] = 99999;
  const first = run(box, 60);
  const attacks = first.filter((x) => x.type === 'attack' && x.id === box.e.id);
  assert.equal(attacks.length, 1);
  assert.equal(attacks[0].target, box.ops.ground.id);
  assert.equal(lost(box.ops.bird), 0);
  assert.equal(lost(box.ops.ground), 470 * 0.8);
  box.e.hp = 10000;
  run(box, 110);
  assert.equal(lost(box.ops.ground), 470 * 0.8 + 470 * 0.8 * 1.5);
  // only the flyer in reach: no attack at all
  const lone = field(rat(), [['bird', 2, 3, 5000, { motion: 'FLY' }]], { at: [2, 4] });
  lone.e.ab['DriftSand.cd'] = 99999;
  assert.equal(run(lone, 120).filter((x) => x.type === 'attack' && x.id === lone.e.id).length, 0);
});
