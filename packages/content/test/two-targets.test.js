// 萨卡兹百夫长 and “独轮车玩具” (docs/spec/foes.md 敌能-134): two targets at once, by the PRTS extras on 敌能-27's
// `Targets` — and 敌能-33's `noFly` for 百夫长. Neither is in a shipped level, so the records are built here from
// enemy_database (ArknightsGameData 17759cc8, level 0); `dmgType` is enemy_handbook_table's damageType MAGIC (敌能-1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, buffs, bus, KIND } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent, FOE_EXTRAS } from '../src/index.js';
import { withFoeExtras, uncoveredAbilities } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const CENTURION = 'enemy_1501_demonk';
const TOY = 'enemy_10018_sgrobh';

/** 萨卡兹百夫长 as the data has it: no talent, no skill. @returns {EnemyDef} */
const centurion = () => ({
  name: '萨卡兹百夫长', maxHp: 15000, atk: 700, def: 250, res: 35, moveSpeed: 0.78, baseAttackTime: 5, massLevel: 5,
  rangeRadius: 2.35, applyWay: 'RANGED', motion: 'WALK', levelType: 'BOSS', dmgType: 'arts', tags: ['sarkaz'],
});
/** “独轮车玩具” as the data has it: no talent, no skill. @returns {EnemyDef} */
const toy = () => ({
  name: '“独轮车玩具”', maxHp: 7500, atk: 450, def: 280, res: 50, moveSpeed: 0.7, baseAttackTime: 4.5, massLevel: 2,
  rangeRadius: 1.4, applyWay: 'RANGED', motion: 'WALK', levelType: 'ELITE', dmgType: 'arts',
});
/** The enemy with this file's page extras merged on. @param {string} key */
const merged = (key) => withFoeExtras(key, key === CENTURION ? centurion() : toy());

/**
 * The enemy stands rooted on the road at row 1, col 2, its attack held. Operators have no attack, a million HP, DEF 1000
 * and RES 0, so an arts hit is the attack itself: s1, s2, s3 are snipers, g1 a guard, kite a flying sniper of 嘲讽等级 2.
 * @param {string} key @param {EnemyDef} def @param {(c: any) => void} [tweak]
 */
function field(key, def, tweak) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [key]: def };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, key)])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 9 };
  for (const op of [c.operators.guard, c.operators.sniper]) Object.assign(op, { cost: 0, atk: 0, def: 1000, res: 0, maxHp: 1e6 });
  for (const k of ['s1', 's2', 's3']) c.operators[k] = { ...c.operators.sniper, name: k };
  c.operators.g1 = { ...c.operators.guard, name: 'g1' };
  c.operators.kite = { ...c.operators.sniper, name: 'kite', motion: 'FLY', tauntLevel: 2 };
  tweak?.(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = /** @type {Unit} */ (w.units.find((u) => u.key === key));
  Object.assign(e, { x: 2, y: 1, path: [], pt: 0 });
  status.applyStatus(e, 'root', {});
  e.atkCd = 1000;
  return { c, w, e };
}

/** Deploys [op, row, col] in one frame: the later in the list, the later deployed. @param {ReturnType<typeof field>} box @param {[string, number, number][]} seats */
const deploy = (box, seats) => step(box.w, box.c, seats.map(([op, row, col]) => [0, { type: 'deploy', op, row, col, dir: 0 }]));

/** @param {World} w @param {string} key @returns {Unit} */
function unit(w, key) {
  const u = w.units.find((x) => x.key === key);
  if (!u) throw new Error(`no ${key}`);
  return u;
}

/**
 * The attack starts now; `n` frames run. The events, the enemy's hits' damage info and `attackHit` kinds, the dodges.
 * @param {ReturnType<typeof field>} box @param {number} [n]
 */
function strike(box, n = 1) {
  const id = box.e.id;
  /** @type {{ t: number, type: string, isAttack: boolean, isSkill: boolean, isProjectile: boolean }[]} */
  const dmg = [];
  /** @type {[number, string][]} */
  const kinds = [];
  /** @type {number[]} */
  const dodged = [];
  bus.on(box.w, 'hit', (k) => { if (k.source?.id === id) dmg.push({ t: k.target.id, type: k.dmg.type, isAttack: !!k.dmg.isAttack, isSkill: !!k.dmg.isSkill, isProjectile: !!k.dmg.isProjectile }); });
  bus.on(box.w, 'attackHit', (k) => { if (k.attacker.id === id) kinds.push([k.target.id, k.kind]); });
  bus.on(box.w, 'dodge', (k) => { if (k.source?.id === id) dodged.push(k.target.id); });
  box.e.atkCd = 0;
  /** @type {any[]} */
  const ev = [];
  for (let i = 0; i < n; i++) ev.push(...step(box.w, box.c).map((x) => ({ ...x, f: i })));
  const of = (/** @type {string} */ type) => ev.filter((x) => x.type === type && x.id === id);
  return { ev, attacks: of('attack').map((x) => x.target), shots: of('shot').map((x) => x.target), hits: of('hit'), dmg, kinds, dodged };
}

/** @param {number} got @param {number} want */
const near = (got, want) => Math.abs(got - want) < 1e-6;

test('[敌能-134] [敌能-27] [敌能-33] [关卡-2] the page extras: two targets for both, direct and noFly for 百夫长 only; a string n is not the shape', () => {
  assert.deepEqual(FOE_EXTRAS[CENTURION].talents, { Targets: { n: 2, direct: 1 }, noFly: {} });
  assert.deepEqual(FOE_EXTRAS[TOY].talents, { Targets: { n: 2 } });
  assert.deepEqual([FOE_EXTRAS[CENTURION].skills, FOE_EXTRAS[TOY].skills], [undefined, undefined]);
  assert.ok(FOE_EXTRAS[CENTURION].source.endsWith(`=${encodeURIComponent('萨卡兹百夫长')}&oldid=413934`));
  assert.ok(FOE_EXTRAS[TOY].source.endsWith(`=${encodeURIComponent('“独轮车玩具”')}&oldid=354028`));
  for (const [key, raw] of /** @type {[string, EnemyDef][]} */ ([[CENTURION, centurion()], [TOY, toy()]])) {
    assert.deepEqual([raw.talents, raw.skills], [undefined, undefined], `${key}: the data has neither`);
    assert.deepEqual(uncoveredAbilities([merged(key)]), [], key);
  }
  const text = /** @type {EnemyDef} */ (/** @type {any} */ ({ ...centurion(), talents: { Targets: { n: '2', direct: 1 }, noFly: {} } }));
  assert.deepEqual(uncoveredAbilities([text]), ['Targets'], 'a string n');
  assert.deepEqual(uncoveredAbilities([{ ...toy(), talents: { Targets: {} } }]), ['Targets'], 'no n');
});

test('[敌能-134] [敌能-27] [索敌-5] 百夫长 unblocked: the first two by 仇恨值, each at its current attack as arts, at once with no projectile', () => {
  const box = field(CENTURION, merged(CENTURION), (c) => {
    c.operators.s1.tauntLevel = 1;
    c.operators.s3.res = 50;
  });
  deploy(box, [['s1', 0, 2], ['s2', 0, 3], ['s3', 2, 3]]);
  buffs.addBuff(box.e, buffs.makeBuff({ key: 'up', mods: { atkPct: 0.5 } }));
  assert.equal(attrs.statsOf(box.e).atk, 1050);
  const [s1, s2, s3] = ['s1', 's2', 's3'].map((k) => unit(box.w, k));
  const got = strike(box);
  assert.equal(box.e.blockedBy, -1);
  assert.deepEqual(got.attacks, [s1.id, s3.id], 'the taunting one, then the later deployed');
  assert.deepEqual(got.shots, [], 'no projectile');
  assert.deepEqual(got.hits.map((h) => h.target), [s1.id, s3.id], 'both land on the attack frame');
  assert.ok(near(got.hits[0].damage, 1050) && near(got.hits[1].damage, 1050 * 0.5), 'arts: DEF 1000 does nothing, RES 50 halves');
  const flags = { type: 'arts', isAttack: true, isSkill: false, isProjectile: false };
  assert.deepEqual(got.dmg, [{ t: s1.id, ...flags }, { t: s3.id, ...flags }]);
  assert.deepEqual(got.kinds, [[s1.id, 'main'], [s3.id, 'main']], 'both are main targets, not a splash');
  assert.equal(s2.hp, s2.maxHp);
});

test('[敌能-134] [敌能-27] the number of targets is the blackboard\'s n, on both', () => {
  for (const key of [CENTURION, TOY]) {
    const row = /** @type {Record<string, Record<string, number>>} */ (FOE_EXTRAS[key].talents);
    for (const n of [1, 2, 3]) {
      const def = n === 2 ? merged(key) : { ...(key === CENTURION ? centurion() : toy()), talents: { ...row, Targets: { ...row.Targets, n } } };
      const box = field(key, def);
      deploy(box, [['s1', 0, 2], ['s2', 0, 3], ['s3', 2, 3]]);
      const got = strike(box, 8);
      const want = ['s3', 's2', 's1'].slice(0, n).map((k) => unit(box.w, k).id);
      assert.deepEqual(got.attacks, want, `${key} n ${n}`);
      assert.deepEqual(got.shots, key === CENTURION ? [] : want, `${key} n ${n}: projectiles`);
      assert.equal(got.hits.length, n, `${key} n ${n}: hits`);
    }
  }
});

test('[敌能-134] [索敌-5] [敌人攻击-1] 百夫长 blocked: the blocker and the highest 仇恨值 of the rest, both hit directly', () => {
  const box = field(CENTURION, merged(CENTURION));
  deploy(box, [['guard', 1, 2], ['s1', 0, 2], ['s2', 0, 3]]);
  const [g, s1, s2] = ['guard', 's1', 's2'].map((k) => unit(box.w, k));
  assert.equal(box.e.blockedBy, g.id);
  const got = strike(box);
  assert.deepEqual(got.attacks, [g.id, s2.id], 'the blocker first, deployed first as it was');
  assert.deepEqual(got.shots, []);
  assert.deepEqual(got.hits.map((h) => [h.target, h.damage]), [[g.id, 700], [s2.id, 700]]);
  assert.equal(s1.hp, s1.maxHp);
});

test('[敌能-134] [敌能-33] [敌能-68] flyers: 百夫长 skips a flying blocker and a flyer in range for two others; “独轮车玩具” still hits the flying blocker', () => {
  const seats = /** @type {[string, number, number][]} */ ([['guard', 1, 2], ['kite', 2, 2], ['s1', 0, 2], ['s2', 0, 3]]);
  /** @param {any} c */
  const fly = (c) => { c.operators.guard.motion = 'FLY'; };
  const ids = (/** @type {World} */ w, /** @type {string[]} */ keys) => keys.map((k) => unit(w, k).id);
  const a = field(CENTURION, merged(CENTURION), fly);
  deploy(a, seats);
  assert.deepEqual([a.e.blockedBy, attrs.statsOf(unit(a.w, 'guard')).flying, attrs.statsOf(unit(a.w, 'kite')).flying], [unit(a.w, 'guard').id, true, true]);
  const hitA = strike(a);
  assert.deepEqual(hitA.attacks, ids(a.w, ['s2', 's1']), '百夫长: the two on the ground');
  assert.deepEqual([unit(a.w, 'guard').hp, unit(a.w, 'kite').hp], [1e6, 1e6]);
  const b = field(TOY, merged(TOY), fly);
  deploy(b, seats);
  assert.equal(b.e.blockedBy, unit(b.w, 'guard').id);
  const hitB = strike(b, 6);
  assert.deepEqual(hitB.attacks, ids(b.w, ['guard', 's2']), 'the toy: the flying blocker, then the ground');
  assert.deepEqual(hitB.hits.map((h) => h.target).sort((x, y) => x - y), ids(b.w, ['guard', 's2']).sort((x, y) => x - y));
  assert.equal(unit(b.w, 'kite').hp, 1e6, 'a flyer only in range is not a ranged candidate');
});

test('[敌能-134] [攻击-3] “独轮车玩具”: a projectile to each of two at its current attack, the hits as projectile damage when they arrive', () => {
  const box = field(TOY, merged(TOY));
  deploy(box, [['s1', 0, 2], ['s2', 0, 3], ['s3', 2, 3]]);
  buffs.addBuff(box.e, buffs.makeBuff({ key: 'up', mods: { atkPct: 0.5 } }));
  assert.equal(attrs.statsOf(box.e).atk, 675);
  const [s1, s2, s3] = ['s1', 's2', 's3'].map((k) => unit(box.w, k));
  const got = strike(box, 8);
  assert.deepEqual(got.attacks, [s3.id, s2.id]);
  assert.deepEqual(got.shots, [s3.id, s2.id], 'one projectile each');
  assert.ok(got.hits.length === 2 && got.hits.every((h) => h.f > 0 && near(h.damage, 675)), 'arts hits of 450 × 1.5 after a flight');
  const flags = { type: 'arts', isAttack: true, isSkill: false, isProjectile: true };
  assert.deepEqual([...got.dmg].sort((x, y) => x.t - y.t), [{ t: s2.id, ...flags }, { t: s3.id, ...flags }]);
  assert.deepEqual([...got.kinds].sort((x, y) => x[0] - y[0]), [[s2.id, 'main'], [s3.id, 'main']], 'both are main targets, not a splash');
  assert.equal(s1.hp, s1.maxHp);
});

test('[敌能-134] [敌人攻击-1] “独轮车玩具” reaches only its data radius 1.4 + 0.25 (no 结晶), and a lone candidate is attacked alone; 百夫长 reaches 2.35', () => {
  const seats = /** @type {[string, number, number][]} */ ([['s1', 0, 2], ['g1', 1, 4]]);
  /** @param {any} c */
  const loud = (c) => { c.operators.g1.tauntLevel = 2; };
  const near2 = field(TOY, merged(TOY), loud);
  deploy(near2, seats);
  const toyHits = strike(near2, 8);
  assert.deepEqual([toyHits.attacks, toyHits.shots.length, toyHits.hits.length], [[unit(near2.w, 's1').id], 1, 1], 'g1 is 2 away: out of 1.65');
  const far = field(CENTURION, merged(CENTURION), loud);
  deploy(far, seats);
  assert.deepEqual(strike(far).attacks, [unit(far.w, 'g1').id, unit(far.w, 's1').id], '2 is within 2.6');
});

test('[敌能-134] [伤害-7] [伤害-8] each target\'s hit is its own: one dodges, is invincible or has a shield, the other takes the whole hit', () => {
  /** @type {[string, (u: Unit) => void][]} */
  const ways = [
    ['dodge', (u) => { buffs.addBuff(u, buffs.makeBuff({ key: 'dodge', mods: { dodgeArts: 1 } })); }],
    ['invincible', (u) => { status.applyStatus(u, 'invincible', { seconds: 10 }); }],
    ['shield', (u) => { buffs.addBuff(u, buffs.makeBuff({ key: 'wall', shieldHits: 1 })); }],
  ];
  for (const [way, prep] of ways) {
    const box = field(CENTURION, merged(CENTURION));
    deploy(box, [['s1', 0, 2], ['s2', 0, 3]]);
    const [s1, s2] = ['s1', 's2'].map((k) => unit(box.w, k));
    prep(s2);
    const got = strike(box);
    assert.deepEqual(got.attacks, [s2.id, s1.id], `${way}: both are attacked`);
    assert.equal(s2.hp, s2.maxHp, way);
    assert.deepEqual(got.hits.map((h) => [h.target, h.damage]), [[s1.id, 700]], way);
    assert.deepEqual(got.dodged, way === 'dodge' ? [s2.id] : [], way);
  }
});

test('[敌能-134] [合作-9] [索敌-2] candidates as usual: a neutral unit is one; 迷彩 and 隐匿 are not, unless blocking', () => {
  const box = field(CENTURION, merged(CENTURION), (c) => {
    c.enemies.civ = { name: 'civ', maxHp: 1e6, atk: 0, def: 0, res: 0, moveSpeed: 0, neutral: true, tauntLevel: 1 };
    c.level.waves = [oneWave([spawnAt(0, CENTURION), spawnAt(0, 'civ')])];
  });
  const civ = unit(box.w, 'civ');
  Object.assign(civ, { x: 1, y: 0, path: [], pt: 0 });
  status.applyStatus(civ, 'root', {});
  deploy(box, [['s1', 0, 2], ['s2', 0, 3]]);
  assert.equal(civ.kind, KIND.ENEMY);
  assert.deepEqual(strike(box).attacks, [civ.id, unit(box.w, 's2').id], 'the neutral one taunts');
  const hid = field(CENTURION, merged(CENTURION), (c) => {
    for (const k of ['s2', 's3']) c.operators[k].tauntLevel = 2;
  });
  deploy(hid, [['guard', 1, 2], ['s1', 0, 2], ['s2', 0, 3], ['s3', 2, 3]]);
  const [g, s1, s2, s3] = ['guard', 's1', 's2', 's3'].map((k) => unit(hid.w, k));
  for (const u of [g, s2]) buffs.addBuff(u, buffs.makeBuff({ key: 'camo', flags: { camou: true } }));
  buffs.addBuff(s3, buffs.makeBuff({ key: 'hide', flags: { stealth: true } }));
  assert.equal(hid.e.blockedBy, g.id);
  assert.deepEqual(strike(hid).attacks, [g.id, s1.id], 'the blocker in 迷彩 still; the taunting ones in 迷彩 and 隐匿 not');
});

test('[敌能-134] silence stops neither: still two targets; 百夫长 still without a projectile and still past a flying blocker', () => {
  for (const key of [CENTURION, TOY]) {
    const box = field(key, merged(key), (c) => { c.operators.guard.motion = 'FLY'; });
    deploy(box, [['guard', 1, 2], ['s1', 0, 2], ['s2', 0, 3]]);
    assert.equal(box.e.blockedBy, unit(box.w, 'guard').id, key);
    status.applyStatus(box.e, 'silence', { seconds: 30 });
    assert.equal(attrs.statsOf(box.e).flags.silence, true, key);
    const got = strike(box);
    assert.deepEqual(got.attacks, (key === CENTURION ? ['s2', 's1'] : ['guard', 's2']).map((k) => unit(box.w, k).id), key);
    assert.equal(got.shots.length, key === CENTURION ? 0 : 2, key);
  }
});

test('[敌能-134] [攻击-3] a locked target that leaves before its projectile arrives: its projectile goes, the other still lands', () => {
  const box = field(TOY, merged(TOY));
  deploy(box, [['s2', 0, 3], ['s3', 2, 3]]);
  const [s2, s3] = ['s2', 's3'].map((k) => unit(box.w, k));
  const got = strike(box);
  assert.deepEqual([got.shots, got.hits], [[s3.id, s2.id], []], 'both in flight');
  step(box.w, box.c, [[0, { type: 'retreat', unit: s2.id }]]);
  for (let i = 0; i < 6; i++) step(box.w, box.c);
  assert.equal(box.w.units.includes(s2), false);
  assert.deepEqual([got.dmg.map((d) => d.t), s3.hp], [[s3.id], s3.maxHp - 450]);
  assert.equal(box.w.shots.length, 0);
});
