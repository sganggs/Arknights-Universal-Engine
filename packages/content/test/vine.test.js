// 纠缠藤蔓 (docs/spec/foes.md 敌能-140): 致幻缠绕 makes the third attack the skill's and stuns its target, under the one
// `StunAttack` behaviour of 敌能-83; 抵抗 from its page; a `Weak` that no damage of the engine sets off. The vine is in no
// shipped level: its record is built from enemy_database (17759cc8, level 0), as defdown.test.js builds 碎骨.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secondsToFrames } from '@aue/math';
import { createWorld, step, status, buffs, attrs, bus, damage } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent, levelContent } from '../src/index.js';
import { uncoveredAbilities, withFoeExtras } from '../src/foes.js';

/** @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const KEY = 'enemy_2052_smgia';
/** Its attack interval: 3 s at attack speed 100 (属性-5). */
const EVERY = attrs.intervalFrames(3, 100);

/**
 * 纠缠藤蔓 at level 0 (enemy_database 17759cc8; 目标价值 5 is the page's). `stun` and `sp` change its skill, the rest its
 * record. @param {{ stun?: number, sp?: number } & Record<string, unknown>} [o] @returns {EnemyDef}
 */
function vine({ stun = 15, sp = 2, ...over } = {}) {
  return /** @type {EnemyDef} */ ({
    name: '纠缠藤蔓', maxHp: 90000, atk: 1200, def: 700, res: 30, moveSpeed: 0.5, baseAttackTime: 3, rangeRadius: 0,
    applyWay: 'MELEE', motion: 'WALK', massLevel: 5, levelType: 'BOSS', lifePointReduce: 5, immune: ['silence'],
    talents: { Weak: { 'weak[limit]': 10, damage_scale: 2 } },
    skills: [{ key: 'StunAttack', cooldown: 0, initCooldown: 0, sp, bb: { stun } }],
    ...over,
  });
}

/**
 * The tiny map: the enemy spawns in frame 0 and stands rooted on the road at (1, 2), its first attack 10 frames off; the
 * guard deploys there in frame 1 and blocks it. `seen` logs the enemy's hits as the bus's `hit` sees them (钩子-3).
 * @param {{ key?: string, def?: EnemyDef, guard?: Record<string, unknown>, before?: (e: Unit) => void }} [o]
 */
function arena(o = {}) {
  const key = o.key ?? KEY, c = /** @type {any} */ (tinyContent());
  c.enemies = { [key]: withFoeExtras(key, o.def ?? vine()) };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, key)])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 9 };
  for (const op of Object.values(c.operators)) Object.assign(op, { cost: 0, maxHp: 1e6 });
  Object.assign(c.operators.guard, { def: 0, ...o.guard });
  const w = createWorld(c, { seed: 1, players: 1 });
  /** @type {{ frame: number, isAttack: boolean, isSkill: boolean, amount: number }[]} */
  const seen = [];
  bus.on(w, 'hit', (x) => { if (x.credit?.key === key) seen.push({ frame: w.frame, isAttack: !!x.dmg.isAttack, isSkill: !!x.dmg.isSkill, amount: x.dmg.amount }); });
  step(w, c);
  const e = /** @type {Unit} */ (w.units.find((u) => u.owner < 0));
  Object.assign(e, { x: 2, y: 1, path: [] });
  status.applyStatus(e, 'root', {});
  e.atkCd = 10;
  o.before?.(e);
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 2, dir: 0 }]]);
  return { c, w, e, g: /** @type {Unit} */ (w.units.find((u) => u.owner >= 0)), seen };
}

/**
 * The enemy's next `n` hits, each with the HP its frame's hits took and the guard's stun buffs (frames left) at the end
 * of the frame it landed in. @param {ReturnType<typeof arena>} box @param {number} n
 */
function swings(box, n) {
  /** @type {{ frame: number, isAttack: boolean, isSkill: boolean, amount: number, dealt: number, stun: number[] }[]} */
  const out = [];
  for (let i = 0; i < 9000 && out.length < n; i++) {
    const from = box.seen.length, ev = /** @type {any[]} */ (step(box.w, box.c));
    const dealt = ev.filter((x) => x.type === 'hit' && x.id === box.e.id).reduce((a, x) => a + x.damage, 0);
    const stun = box.g.buffs.filter((b) => b.key === 'stun').map((b) => b.left);
    for (const x of box.seen.slice(from)) out.push({ ...x, dealt, stun });
  }
  assert.equal(out.length, n, `${out.length} of ${n} hits`);
  return out;
}

/** Steps until the enemy starts a swing (its `attack` event, 攻击-2). @param {ReturnType<typeof arena>} box */
function untilSwing(box) {
  for (let i = 0; i < 9000; i++) if (/** @type {any[]} */ (step(box.w, box.c)).some((x) => x.type === 'attack' && x.id === box.e.id)) return;
  assert.fail('no swing');
}

/** A body with only these abilities, for the coverage checks. @param {Record<string, Record<string, unknown>>} talents @param {unknown[]} [skills] */
const named = (talents, skills) => /** @type {EnemyDef} */ (/** @type {any} */ ({ name: 'e', maxHp: 100, atk: 100, def: 0, res: 0, moveSpeed: 1, talents, ...(skills ? { skills } : {}) }));
/** A body whose only skill is a StunAttack. @param {Record<string, unknown>} bb @param {number} [sp] */
const stunSkill = (bb, sp = 2) => named({}, [{ key: 'StunAttack', cooldown: 0, initCooldown: 0, sp, bb }]);

test('[敌能-140] [敌能-83] [关卡-2] the vine is covered by its page\'s marks; 古老藤蔓 and the other StunAttack and Weak shapes stay uncovered', () => {
  const raw = vine(), merged = withFoeExtras(KEY, raw);
  assert.deepEqual(uncoveredAbilities([raw]), ['Weak', 'StunAttack']);
  assert.deepEqual(merged.talents, { Weak: { 'weak[limit]': 10, damage_scale: 2, page: 1 }, Resist: {} });
  assert.deepEqual(merged.skills?.[0].bb, { stun: 15, page: 1 });
  assert.deepEqual(uncoveredAbilities([merged]), []);
  // 古老藤蔓: the same two blackboards (enemy_database 17759cc8), no page read, so no marks
  assert.deepEqual(uncoveredAbilities([withFoeExtras('enemy_2053_smgia2', raw)]), ['Weak', 'StunAttack']);
  /** The other stun-only users: key, spCost, stun (enemy_database 17759cc8). @type {[string, number, number][]} */
  const others = [['enemy_1362_dfat', 3, 4], ['enemy_1362_dfat_2', 3, 4], ['enemy_5049_dqat', 3, 4], ['enemy_6003_trsslm', 3, 20], ['enemy_6019_escort', 2, 9]];
  for (const [key, sp, stun] of others) assert.deepEqual(uncoveredAbilities([withFoeExtras(key, stunSkill({ stun }, sp))]), ['StunAttack'], key);
  for (const bb of [{ stun: 15, page: 1, extra: 1 }, { stun: 15, page: 1, range_radius: 1 }, { stun: '15', page: 1 }, { stun: 15, page: '1' }, { page: 1 }, { stun: 15 }]) {
    assert.deepEqual(uncoveredAbilities([stunSkill(bb)]), ['StunAttack'], JSON.stringify(bb));
  }
  assert.deepEqual(uncoveredAbilities([stunSkill({ stun: 4, page: 1 }, 3)]), [], 'the two numbers are the shape; the mark gates it');
  assert.deepEqual(uncoveredAbilities([stunSkill({ atk_scale: 0.7, stun: 25, page: 1 }, 0)]), [], '眩晕击 as before');
  assert.deepEqual(uncoveredAbilities([stunSkill({ atk_scale: 0.7, stun: 25 }, 0)]), ['StunAttack']);
  /** The other Weak users (enemy_database 17759cc8). @type {[string, Record<string, number>][]} */
  const weak = [['enemy_1240_ltgint', { def: -1000, magic_resistance: -50 }], ['enemy_1240_ltgint_2', { def: -1200, magic_resistance: -50 }],
    ['enemy_1248_ltholo', { value: 500 }], ['enemy_6015_ictruck', { weak_duration: 10, damage_scale: 1.5 }]];
  for (const [key, bb] of weak) {
    assert.deepEqual(uncoveredAbilities([withFoeExtras(key, named({ Weak: bb }))]), ['Weak'], key);
    assert.deepEqual(uncoveredAbilities([named({ Weak: { ...bb, page: 1 } })]), ['Weak'], `${key} with a mark`);
  }
  for (const bb of [{ 'weak[limit]': 10, damage_scale: 2 }, { 'weak[limit]': 10, damage_scale: 2, page: 1, extra: 1 }, { 'weak[limit]': '10', damage_scale: 2, page: 1 }]) {
    assert.deepEqual(uncoveredAbilities([named({ Weak: bb })]), ['Weak'], JSON.stringify(bb));
  }
});

test('[敌能-140] 致幻缠绕: two ordinary attacks, then the skill — an attack and a skill hit, 100% of 攻击力 — and the count starts again', () => {
  const box = arena({ guard: { immune: ['stun'] } });
  const got = swings(box, 6);
  assert.deepEqual(got.map((s) => s.isSkill), [false, false, true, false, false, true]);
  assert.ok(got.every((s) => s.isAttack && s.amount === 1200 && s.dealt === 1200));
  // the skill is that attack: the 3 s interval goes on, nothing is held for it
  assert.deepEqual(got.map((s) => s.frame - got[0].frame), [0, 1, 2, 3, 4, 5].map((k) => k * EVERY));
  assert.deepEqual(got.slice(0, 3).map((s) => s.stun), [[], [], [secondsToFrames(15)]]);
  assert.equal(box.e.ab['StunAttack.sp'], 0);
});

test('[敌能-140] the record\'s numbers: `stun` seconds of stun, the record\'s cost, and the 攻击力 of the moment it lands', () => {
  for (const stun of [15, 7.5]) {
    const got = swings(arena({ def: vine({ stun }) }), 3);
    assert.deepEqual(got.map((s) => s.stun), [[], [], [secondsToFrames(stun)]], `${stun} s`);
  }
  assert.equal(secondsToFrames(7.5), 225);
  const dear = arena({ def: vine({ sp: 3 }), guard: { immune: ['stun'] } });
  assert.deepEqual(swings(dear, 5).map((s) => s.isSkill), [false, false, false, true, false]);
  const strong = arena({ guard: { def: 300 } });
  assert.deepEqual(swings(strong, 2).map((s) => s.dealt), [900, 900]);
  buffs.addBuff(strong.e, buffs.makeBuff({ key: 'up', mods: { atkPct: 0.5 } }));
  const [skill] = swings(strong, 1);
  assert.deepEqual([skill.isSkill, skill.amount, skill.dealt], [true, 1800, 1500]);
});

/**
 * The third swing — the skill's, landing as it starts — on a guard that `prep` sets up after the first two: the bus's
 * hits of it, the guard's HP before, and its stun buffs after. @param {(g: Unit) => void} prep
 */
function third(prep) {
  const box = arena();
  swings(box, 2);
  prep(box.g);
  const hp = box.g.hp, from = box.seen.length;
  untilSwing(box);
  return { box, hp, hits: box.seen.slice(from).map((s) => s.isSkill), stun: box.g.buffs.filter((b) => b.key === 'stun').map((b) => b.left) };
}

test('[敌能-140] the stun comes after the hit, resistible; a dodged hit and one on 无敌 still stun; a killing hit does not', () => {
  const plain = third(() => {});
  assert.deepEqual([plain.hits, plain.stun, plain.box.g.hp], [[true], [secondsToFrames(15)], plain.hp - 1200]);
  assert.deepEqual([plain.box.g.buffs.find((b) => b.key === 'stun')?.resist, attrs.statsOf(plain.box.g).flags.stun], [true, true]);
  const dodged = third((g) => { buffs.addBuff(g, buffs.makeBuff({ key: 'evade', mods: { dodgePhys: 1 } })); });
  assert.deepEqual([dodged.hits, dodged.box.g.hp, dodged.stun], [[true], dodged.hp, [secondsToFrames(15)]]);
  // 无敌 stops the hit before the bus's `hit` (伤害-7); the swing still spent the points and the stun still comes
  const shut = third((g) => { status.applyStatus(g, 'invincible', {}); });
  assert.deepEqual([shut.hits, shut.box.g.hp, shut.stun, shut.box.e.ab['StunAttack.sp']], [[], shut.hp, [secondsToFrames(15)], 0]);
  const frail = third((g) => { g.hp = 10; });
  assert.deepEqual([frail.hits, frail.box.g.hp, frail.stun], [[true], 0, []]);
});

test('[敌能-140] its silence immunity keeps 致幻缠绕 going; without it, silence holds a full bar and the attack after it is the skill', () => {
  /** @param {Unit} e */
  const hush = (e) => { status.applyStatus(e, 'silence', {}); };
  const immune = arena({ guard: { immune: ['stun'] }, before: hush });
  assert.equal(!!attrs.statsOf(immune.e).flags.silence, false);
  assert.deepEqual(swings(immune, 3).map((s) => s.isSkill), [false, false, true]);
  const open = arena({ def: vine({ immune: [] }), guard: { immune: ['stun'] }, before: hush });
  assert.equal(attrs.statsOf(open.e).flags.silence, true);
  assert.deepEqual(swings(open, 4).map((s) => s.isSkill), [false, false, false, false]);
  assert.equal(open.e.ab['StunAttack.sp'], 2);
  buffs.removeBuff(open.e, 'silence');
  assert.deepEqual(swings(open, 1).map((s) => s.isSkill), [true]);
  assert.equal(open.e.ab['StunAttack.sp'], 0);
});

test('[敌能-140] no attack, no point: 战栗 while blocked holds the count; a swing cut in its wind-up has spent the points', () => {
  const held = arena({ guard: { immune: ['stun'] }, before: (e) => { status.applyStatus(e, 'disarmedCombat', {}); } });
  for (let i = 0; i < 4 * EVERY; i++) step(held.w, held.c);
  assert.deepEqual([held.seen.length, held.e.ab['StunAttack.sp'] ?? 0], [0, 0]);
  buffs.removeBuff(held.e, 'disarmedCombat');
  assert.deepEqual(swings(held, 3).map((s) => s.isSkill), [false, false, true]);
  // a 0.5 s wind-up (攻击-2): the third swing has started, its points are gone; a stun drops it before it lands
  const cut = arena({ def: vine({ attack: { duration: 1, hit: 0.5 } }), guard: { immune: ['stun'] } });
  swings(cut, 2);
  untilSwing(cut);
  assert.equal(cut.e.ab['StunAttack.sp'], 0);
  status.applyStatus(cut.e, 'stun', { seconds: 1 });
  for (let i = 0; i < secondsToFrames(1); i++) step(cut.w, cut.c);
  assert.deepEqual([cut.seen.length, cut.g.buffs.some((b) => b.key === 'stun')], [2, false]);
  assert.deepEqual(swings(cut, 3).map((s) => s.isSkill), [false, false, true]);
});

test('[敌能-140] 抵抗 from its first frame, one buff; its Weak gives no 脆弱 for any damage the engine deals, sourceless or not', () => {
  const box = arena();
  for (let i = 0; i < 60; i++) step(box.w, box.c);
  assert.equal(box.e.buffs.filter((b) => b.key === 'buffres').length, 1);
  assert.equal(attrs.statsOf(box.e).statusRes, 0.5);
  // 热泵通道's 700 true damage has no counterpart here; a sourceless hit is not 环境伤害 (INF-0872)
  const hits = [
    damage.dealDamage(box.w, null, box.e, { type: 'true', amount: 700, sourceless: true }, box.c),
    damage.dealDamage(box.w, box.g, box.e, { type: 'true', amount: 700, sourceless: true, tags: ['dot'] }, box.c),
    damage.dealDamage(box.w, box.g, box.e, { type: 'true', amount: 700, isAttack: true }, box.c),
  ];
  step(box.w, box.c);
  hits.push(damage.dealDamage(box.w, null, box.e, { type: 'true', amount: 700, sourceless: true }, box.c));
  assert.deepEqual(hits, [700, 700, 700, 700]);
  assert.equal(box.e.buffs.some((b) => b.key === 'fragile' || b.mods.dmgTakenMul !== undefined), false);
});

test('[敌能-140] [敌能-83] one StunAttack: 致幻缠绕 throws no stone; 眩晕击 keeps its normal attacks plain and keeps no points', () => {
  const box = arena({ guard: { immune: ['stun'] } });
  let shots = 0;
  for (let i = 0; i < secondsToFrames(30); i++) for (const x of /** @type {any[]} */ (step(box.w, box.c))) if (x.type === 'shot' && x.id === box.e.id) shots++;
  assert.deepEqual([shots, box.w.shots.length], [0, 0]);
  const rock = 'enemy_2003_rockman', real = levelContent('act1multi_fortress_rm01', 'NORMAL');
  const stone = arena({ key: rock, def: real.enemies[rock], guard: { immune: ['stun'] } });
  const got = swings(stone, 5);
  const plain = got.filter((s) => s.isAttack), thrown = got.filter((s) => !s.isAttack);
  assert.ok(plain.length >= 3 && plain.every((s) => !s.isSkill && s.amount === 1500));
  assert.ok(thrown.length >= 1 && thrown.every((s) => s.isSkill && s.amount === 1500 * 0.7));
  assert.equal(stone.e.ab['StunAttack.sp'], undefined);
});
