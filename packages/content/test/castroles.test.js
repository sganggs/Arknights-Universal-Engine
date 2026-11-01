// 主角阵营角色 and 反派阵营角色 (docs/spec/foes.md 敌能-128): 神经损伤 on each hit outside a 摄影区域 (no level has one),
// 入戏 that never fires, and 主角's 重生 (敌能-78's, with 敌能-18's `invincible`). Neither is in a shipped level: the
// records are the level-0 enemy_database values of ArknightsGameData 17759cc8. The operators' maxEp is a fixture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, buffs, bus, damage, elements, status, targeting, KIND } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras, uncoveredAbilities, FOE_EXTRAS } from '../src/foes.js';

/** @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef @typedef {NonNullable<EnemyDef['skills']>[number]} FoeSkill */

const HERO = 'enemy_10098_crhro';
const VILLAIN = 'enemy_10099_crvln';
const RATIO = 'attack@ep_damage_ratio';
const EP = 1e6;

/** 入戏 as the data has it: no cooldowns, 2 s. @returns {FoeSkill} */
const read = () => ({ key: 'read', cooldown: 0, initCooldown: 0, sp: 0, bb: { duration: 2 } });

/** 主角阵营角色 at level 0. @param {Partial<EnemyDef>} [more] @returns {EnemyDef} */
const heroData = (more = {}) => ({
  name: '主角阵营角色', maxHp: 15000, atk: 720, def: 600, res: 20, moveSpeed: 0.65, baseAttackTime: 5, massLevel: 3,
  rangeRadius: 1.5, applyWay: 'RANGED', motion: 'WALK', levelType: 'ELITE', immune: ['silence'],
  talents: { inside: { atk_scale_normal: 1, atk_scale_crvln: 5, ability_range_forward_extend: 2, [RATIO]: 0.15 }, reborn: { duration: 3, invincible: 0 } },
  skills: [read()],
  ...more,
});

/** 反派阵营角色 at level 0; its attack is arts (图鉴 法术). @param {Partial<EnemyDef>} [more] @returns {EnemyDef} */
const villainData = (more = {}) => ({
  name: '反派阵营角色', maxHp: 15000, atk: 480, def: 450, res: 60, moveSpeed: 0.65, baseAttackTime: 5, massLevel: 3,
  rangeRadius: 3.5, applyWay: 'RANGED', motion: 'WALK', levelType: 'ELITE', immune: ['silence'], dmgType: 'arts',
  talents: { inside: { atk_scale_normal: 1, atk_scale_crhro: 5, attack_speed: 1, [RATIO]: 0.15 } },
  skills: [read()],
  ...more,
});

/** @param {string} key @param {EnemyDef} def */
const gaps = (key, def) => uncoveredAbilities([withFoeExtras(key, def)]);
/** @param {number} got @param {number} want */
const close = (got, want) => Math.abs(got - want) < 1e-6;
/** @param {Unit} u */
const sanity = (u) => elements.epOf(u, 'SANITY');

/**
 * The enemy spawns, rooted on the road tile a guard will stand on. The guard does not attack and hardly loses HP.
 * Incomplete abilities stay on the record, so a bad shape can be seen to add nothing.
 * @param {string} key @param {EnemyDef} def
 */
function fight(key, def) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [key]: def };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, key)])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 8 };
  Object.assign(c.operators.guard, { cost: 0, maxHp: 1e6, atk: 0, def: 10000, res: 0, maxEp: EP });
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = w.units.find((u) => u.kind === KIND.ENEMY);
  assert.ok(e);
  Object.assign(e, { x: 2, y: 1, path: [], pt: 0 });
  status.applyStatus(e, 'root', {});
  return { c, w, e };
}

/** @param {ReturnType<typeof fight>} box @param {number} n */
function run(box, n) {
  /** @type {any[]} */
  const ev = [];
  for (let i = 0; i < n; i++) for (const x of step(box.w, box.c)) ev.push(x);
  return ev;
}

/** The guard on the enemy's tile, blocking it. @param {ReturnType<typeof fight>} box */
function guard(box) {
  /** @type {any[]} */
  const ev = [...step(box.w, box.c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 2, dir: 0 }]])];
  const u = box.w.units.find((x) => x.kind === KIND.OPERATOR && x.key === 'guard');
  assert.ok(u);
  return { ev, u };
}

/** The enemy's attacks among these events: a ranged enemy shoots once per attack (攻击-3). @param {any[]} ev @param {number} id */
const shots = (ev, id) => ev.filter((x) => x.type === 'shot' && x.id === id).length;

/** The enemy attacks on this frame. @param {ReturnType<typeof fight>} box */
function strike(box) {
  box.e.atkCd = 0;
  return run(box, 1);
}

test('[敌能-128] the two read pages are covered; 命定的主角 and 命定的反派, the same shapes without a page, are not', () => {
  assert.deepEqual(gaps(HERO, heroData()), []);
  assert.deepEqual(gaps(VILLAIN, villainData()), []);
  assert.match(FOE_EXTRAS[HERO].source, /&oldid=354169$/);
  assert.match(FOE_EXTRAS[VILLAIN].source, /&oldid=354171$/);
  const hero = withFoeExtras(HERO, heroData());
  assert.deepEqual(hero.talents?.reborn, { duration: 3, invincible: 0, page: 1 });
  assert.deepEqual(hero.skills?.[0].bb, { duration: 2, page: 1 });
  assert.equal(withFoeExtras(VILLAIN, villainData()).talents?.reborn, undefined);
  assert.deepEqual(gaps(`${HERO}_2`, heroData()), ['inside', 'reborn', 'read']);
  assert.deepEqual(gaps(`${VILLAIN}_2`, villainData()), ['inside', 'read']);
});

test('[敌能-128] [敌能-78] only the exact shapes count: a key more or less, the other side\'s key, a marker other than 1', () => {
  /** @param {Record<string, Record<string, number>>} talents @param {FoeSkill[]} [skills] */
  const loose = (talents, skills = []) => uncoveredAbilities([{ ...heroData(), talents, skills }]);
  const hero = { atk_scale_normal: 1, atk_scale_crvln: 5, ability_range_forward_extend: 2, [RATIO]: 0.15, page: 1 };
  const villain = { atk_scale_normal: 1, atk_scale_crhro: 5, attack_speed: 1, [RATIO]: 0.15, page: 1 };
  assert.deepEqual(loose({ inside: hero }), []);
  assert.deepEqual(loose({ inside: villain }), []);
  assert.deepEqual(loose({ inside: { ...hero, el: 1 } }), ['inside']);
  assert.deepEqual(loose({ inside: { ...hero, attack_speed: 1 } }), ['inside']);
  assert.deepEqual(loose({ inside: { atk_scale_normal: 1, atk_scale_crvln: 5, ability_range_forward_extend: 2, page: 1 } }), ['inside']);
  assert.deepEqual(loose({ inside: { ...villain, page: 2 } }), ['inside']);
  assert.deepEqual(loose({}, [{ ...read(), bb: { duration: 2, page: 1 } }]), []);
  assert.deepEqual(loose({}, [{ ...read(), bb: { duration: 2, page: 1, range_radius: 1 } }]), ['read']);
  assert.deepEqual(loose({}, [{ ...read(), bb: { page: 1 } }]), ['read']);
  assert.deepEqual(loose({ reborn: { duration: 3, invincible: 0, page: 1 } }), []);
  assert.deepEqual(loose({ reborn: { duration: 3, invincible: 0 } }), ['reborn']);
  assert.deepEqual(loose({ reborn: { duration: 3, invincible: 0, page: 1, hp_ratio: 1 } }), ['reborn']);
  assert.deepEqual(loose({ reborn: /** @type {any} */ ({ duration: 3, invincible: '0', page: 1 }) }), ['reborn'], 'a numeric invincible only');
  assert.deepEqual(loose({ reborn: { duration: 5, page: 1 } }), [], '锋盔 unchanged');
});

test('[敌能-128] each hit adds 15% of the current ATK as 神经损伤, outside any 摄影区域, on both pages', () => {
  for (const [key, def, atk] of /** @type {const} */ ([[HERO, heroData(), 720], [VILLAIN, villainData(), 480]])) {
    const box = fight(key, withFoeExtras(key, def));
    const { ev, u: g } = guard(box);
    assert.equal(box.e.blockedBy, g.id, key);
    assert.equal(shots(ev, box.e.id), 1, key);
    assert.ok(close(EP - sanity(g), atk * 0.15), key);
    assert.equal(shots(run(box, 149), box.e.id), 0, `${key}: 5 s between attacks`);
    assert.equal(shots(run(box, 1), box.e.id), 1, key);
    assert.ok(close(EP - sanity(g), atk * 0.3), key);
    box.e.base.atk = 1000;
    assert.equal(shots(run(box, 150), box.e.id), 1, key);
    assert.ok(close(EP - sanity(g), atk * 0.3 + 150), `${key}: the current ATK`);
    buffs.addBuff(box.e, buffs.makeBuff({ key: 'atkUp', mods: { atkMul: 2 } }));
    assert.equal(shots(run(box, 150), box.e.id), 1, key);
    assert.ok(close(EP - sanity(g), atk * 0.3 + 450), `${key}: the current ATK, its buffs included`);
    for (const el of /** @type {const} */ (['WATER', 'FIRE', 'DARK', 'ANGER'])) assert.equal(elements.epOf(g, el), EP, key);
  }
});

test('[敌能-128] the 神经损伤 is the ATK × the blackboard\'s attack@ep_damage_ratio, not a fixed 15%', () => {
  const edited = villainData({ talents: { inside: { atk_scale_normal: 1, atk_scale_crhro: 5, attack_speed: 1, [RATIO]: 0.4 } } });
  assert.deepEqual(gaps(VILLAIN, edited), []);
  const box = fight(VILLAIN, withFoeExtras(VILLAIN, edited));
  const { ev, u: g } = guard(box);
  assert.equal(shots(ev, box.e.id), 1);
  assert.ok(close(EP - sanity(g), 480 * 0.4));
});

test('[敌能-128] a dodged hit still carries the 神经损伤; an invincible target or a neutral unit takes none', () => {
  const box = fight(HERO, withFoeExtras(HERO, heroData()));
  box.e.atkCd = 1000;
  const { u: g } = guard(box);
  let dodges = 0;
  bus.on(box.w, 'dodge', () => { dodges += 1; });
  buffs.addBuff(g, buffs.makeBuff({ key: 'dodge', mods: { dodgePhys: 1 } }));
  assert.equal(shots(strike(box), box.e.id), 1);
  assert.equal(dodges, 1);
  assert.equal(g.hp, g.maxHp);
  assert.ok(close(EP - sanity(g), 108));
  buffs.removeBuff(g, 'dodge');
  buffs.addBuff(g, buffs.makeBuff({ key: 'untouchable', flags: { invincible: true } }));
  assert.equal(shots(strike(box), box.e.id), 1);
  assert.equal(g.hp, g.maxHp);
  assert.ok(close(EP - sanity(g), 108));
  buffs.removeBuff(g, 'untouchable');
  g.base.neutral = true;
  assert.equal(shots(strike(box), box.e.id), 1);
  assert.ok(g.hp < g.maxHp, 'the hit lands');
  assert.ok(close(EP - sanity(g), 108));
  g.base.neutral = false;
  strike(box);
  assert.ok(close(EP - sanity(g), 216));
});

test('[敌能-128] without the page marker, or in another shape, the attack carries no element', () => {
  const bare = fight(HERO, heroData());
  const { ev, u: g } = guard(bare);
  assert.equal(shots(ev, bare.e.id), 1);
  assert.equal(sanity(g), EP);
  const odd = withFoeExtras(VILLAIN, villainData({ talents: { inside: { atk_scale_normal: 1, atk_scale_crhro: 5, [RATIO]: 0.15 } } }));
  assert.deepEqual(uncoveredAbilities([odd]), ['inside']);
  const box = fight(VILLAIN, odd);
  const { ev: more, u: h } = guard(box);
  assert.equal(shots(more, box.e.id), 1);
  assert.equal(sanity(h), EP);
});

test('[敌能-128] 入戏 never fires: the attacks come at the same frames with or without it', () => {
  /** @param {EnemyDef} def */
  const frames = (def) => {
    const box = fight(VILLAIN, withFoeExtras(VILLAIN, def));
    guard(box);
    /** @type {number[]} */
    const at = [];
    for (let i = 0; i < 400; i++) if (shots([...step(box.w, box.c)], box.e.id)) at.push(box.w.frame);
    return at;
  };
  const withRead = frames(villainData()), without = frames(villainData({ skills: [] }));
  assert.equal(withRead.length, 2);
  assert.deepEqual(withRead, without);
});

test('[敌能-128] 主角\'s first knockdown revives it to full HP for 3 s, with 0 s of 无敌 after; the second is final', () => {
  const box = fight(HERO, withFoeExtras(HERO, heroData()));
  const { w, c, e } = box;
  assert.equal(e.buffs.some((b) => b.key === 'root'), true);
  damage.dealDamage(w, null, e, { type: 'true', amount: 1e9 });
  step(w, c);
  assert.equal(w.units.includes(e), true);
  assert.equal(e.hp, 15000);
  assert.equal(e.buffs.some((b) => b.key === 'root'), false, 'its buffs are cleared');
  const s = attrs.statsOf(e);
  assert.equal(s.invincible, true);
  assert.equal(s.disabled, true);
  assert.equal(targeting.selectable(e), false);
  assert.equal(damage.dealDamage(w, null, e, { type: 'true', amount: 100 }), 0);
  run(box, 89);
  assert.equal(e.buffs.some((b) => b.key === 'reborn'), true);
  run(box, 1);
  assert.equal(e.buffs.some((b) => b.key === 'reborn'), false);
  assert.equal(e.buffs.some((b) => b.key === 'reborn:invincible'), false, '0 s of 无敌');
  assert.equal(attrs.statsOf(e).invincible, false);
  assert.equal(targeting.selectable(e), true);
  damage.dealDamage(w, null, e, { type: 'true', amount: 1e9 });
  step(w, c);
  assert.equal(w.units.includes(e), false);
});

test('[敌能-128] [敌能-18] an invincible above 0 adds that many seconds of 无敌 after the rebirth; 反派 does not revive', () => {
  const longer = heroData({ talents: { ...heroData().talents, reborn: { duration: 3, invincible: 2 } } });
  const box = fight(HERO, withFoeExtras(HERO, longer));
  damage.dealDamage(box.w, null, box.e, { type: 'true', amount: 1e9 });
  run(box, 91);
  assert.equal(box.e.buffs.some((b) => b.key === 'reborn'), false);
  const after = box.e.buffs.find((b) => b.key === 'reborn:invincible');
  assert.ok(after);
  assert.equal(after.left, 60);
  assert.equal(attrs.statsOf(box.e).invincible, true);
  run(box, 59);
  assert.equal(box.e.buffs.some((b) => b.key === 'reborn:invincible'), true);
  run(box, 1);
  assert.equal(box.e.buffs.some((b) => b.key === 'reborn:invincible'), false);
  assert.equal(attrs.statsOf(box.e).invincible, false);
  const villain = fight(VILLAIN, withFoeExtras(VILLAIN, villainData()));
  damage.dealDamage(villain.w, null, villain.e, { type: 'true', amount: 1e9 });
  step(villain.w, villain.c);
  assert.equal(villain.w.units.includes(villain.e), false);
});

test('[敌能-128] HP set to 0 outright (the context\'s remove) is a first knockdown too; reaching the goal is not one', () => {
  const box = fight(HERO, withFoeExtras(HERO, heroData()));
  damage.knockDown(box.e);
  step(box.w, box.c);
  assert.equal(box.w.units.includes(box.e), true);
  assert.equal(box.e.hp, 15000);
  assert.equal(box.e.buffs.some((b) => b.key === 'reborn'), true);
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [HERO]: withFoeExtras(HERO, heroData({ moveSpeed: 4 })) };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, HERO)])];
  const w = createWorld(c, { seed: 1, players: 1 });
  const life = w.players[0].life;
  step(w, c);
  assert.equal(w.units.some((u) => u.key === HERO), true);
  for (let i = 0; i < 600 && w.units.some((u) => u.key === HERO); i++) step(w, c);
  assert.equal(w.units.some((u) => u.key === HERO), false);
  assert.equal(w.players[0].life, life - 1);
});
