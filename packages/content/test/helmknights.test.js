// 锋盔骑士团 (docs/spec/foes.md 敌能-78): 削弱斗志 picks the highest current ATK of ours on the whole field,
// and the first knockdown is 敌能-18's rebirth at full HP. Unread `reborn` shapes stay uncovered (关卡-2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secondsToFrames } from '@aue/math';
import { createWorld, step, attrs, buffs, damage, status, targeting } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { levelContent, skeletonContent } from '../src/index.js';
import { levelAt } from '../src/levels.js';
import { uncoveredAbilities, withFoeExtras } from '../src/foes.js';
import rm01 from '../data/levels/act1multi_fortress_rm01.json' with { type: 'json' };

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

const TITUS = 'enemy_1104_lfkght_3';
const APPRENTICE = 'enemy_1104_lfkght';
const ELITE = 'enemy_1104_lfkght_2';
/** The data skill key. The buff key is the lowercase `atkDesWeaken` (敌能-78). */
const SKILL = 'AtkDesWeaken';
const WEAK = 'atkDesWeaken';
const WEAKEN = secondsToFrames(25);

/** A read knight: the data's skill and the duration-only 重生, plus the page marker from FOE_EXTRAS. @param {string} key @param {number} init @param {number} period @param {Record<string, unknown>} [more] */
function knight(key, init, period, more = {}) {
  return withFoeExtras(key, /** @type {any} */ ({
    name: key, maxHp: 1e9, atk: 0, def: 0, res: 0, moveSpeed: 0, baseAttackTime: 100,
    rangeRadius: 1.3, applyWay: 'RANGED', motion: 'WALK', dmgType: 'arts',
    talents: { reborn: { duration: 5 } },
    skills: [{ key: SKILL, cooldown: period, initCooldown: init, sp: 0, bb: { atk: -0.5, duration: 25 } }],
    ...more,
  }));
}

/** @param {string} key @param {any} def @param {(c: any) => void} [tweak] */
function world(key, def, tweak) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [key]: def };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, key)])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 9 };
  for (const op of Object.values(c.operators)) Object.assign(op, { cost: 0, maxHp: 1e7 });
  tweak?.(c);
  return { c, w: createWorld(c, { seed: 1, players: 1 }) };
}

/** @param {World} w @param {string} key @returns {Unit} */
function unit(w, key) {
  const u = w.units.find((x) => x.key === key);
  if (!u) throw new Error(`no ${key}`);
  return u;
}

/** The step that starts at frame `frame` has finished (a cooldown of n frames casts on the step that starts at frame n). @param {World} w @param {any} c @param {number} frame */
function through(w, c, frame) {
  while (w.frame <= frame) step(w, c);
}

/** @param {World} w @param {any} c @param {number} n */
function run(w, c, n) {
  for (let i = 0; i < n; i++) step(w, c);
}

/** @param {World} w @param {any} c @param {string} key @returns {Unit} */
function spawn(w, c, key) {
  step(w, c);
  return unit(w, key);
}

/** @param {World} w @param {any} c @param {[string, number, number][]} ops */
function deploy(w, c, ops) {
  step(w, c, ops.map(([op, row, col]) => [0, { type: 'deploy', op, row, col, dir: 0 }]));
}

/** @param {Unit} u @param {number} x @param {number} y */
function pin(u, x, y) {
  u.x = x;
  u.y = y;
  status.applyStatus(u, 'root', {});
}

/** @param {Unit} u */
const atk = (u) => attrs.statsOf(u).atk;
/** @param {Unit} u */
const holding = (u) => u.buffs.some((b) => b.key === WEAK);
/** @param {Unit} u */
function left(u) {
  const b = u.buffs.find((x) => x.key === WEAK);
  if (!b) throw new Error('no weaken');
  return b.left;
}

/** @param {Record<string, Record<string, number>>} talents */
const gaps = (talents) => uncoveredAbilities([/** @type {any} */ ({ talents })]);

/** @param {any} enemy @param {string} name */
function talentOf(enemy, name) {
  const talents = enemy.talents;
  return talents ? talents[name] : undefined;
}

/** The three read ids, once the page marker is merged, are not gaps. @param {string} key @param {any[]} skill */
function assertReadKnight(key, skill) {
  const merged = withFoeExtras(key, { name: key, maxHp: 1, atk: 0, def: 0, res: 0, moveSpeed: 1, talents: { reborn: { duration: 5 } }, skills: skill });
  const rebornBb = talentOf(merged, 'reborn');
  assert.equal(rebornBb.page, 1);
  assert.deepEqual(talentOf(merged, 'noFly'), {});
  const gap = uncoveredAbilities([merged]);
  assert.equal(gap.includes('reborn'), false);
  assert.equal(gap.includes(SKILL), false);
}

/** Unread `reborn` shapes, including a marked one with an extra key, stay gaps. */
function assertUnreadShapes() {
  assert.equal(gaps({ reborn: { duration: 10 } }).includes('reborn'), true);
  assert.equal(gaps({ reborn: { duration: 5, hp_ratio: 0.5 } }).includes('reborn'), true);
  assert.equal(gaps({ reborn: { duration: 5, invincible: 0 } }).includes('reborn'), true);
  assert.equal(gaps({ reborn: { duration: 5, page: 1, hp_ratio: 1 } }).includes('reborn'), true);
}

/** 泰特斯 in rm01 loses both names; the level list keeps `reborn` because 丑东西 is unmarked. */
function assertRm01() {
  const enemies = /** @type {any} */ (rm01).enemies;
  const titusGap = uncoveredAbilities([withFoeExtras(TITUS, enemies[TITUS])]);
  assert.equal(titusGap.includes('reborn'), false);
  assert.equal(titusGap.includes(SKILL), false);
  const ugly = uncoveredAbilities([withFoeExtras('enemy_1512_mcmstr', enemies.enemy_1512_mcmstr)]);
  assert.equal(ugly.includes('reborn'), true);
  const uncovered = levelAt('act1multi_fortress_rm01', 'NORMAL').level.uncovered || [];
  assert.equal(uncovered.includes(SKILL), false);
  assert.equal(uncovered.includes('reborn'), true);
  const loaded = levelContent('act1multi_fortress_rm01', 'NORMAL');
  const t = loaded.enemies[TITUS];
  const rb = talentOf(t, 'reborn');
  assert.equal(rb.duration, 5);
  assert.equal(rb.page, 1);
  assert.deepEqual(talentOf(t, 'noFly'), {});
  const skill0 = (t.skills || [])[0];
  assert.equal(skill0.bb.atk, -0.5);
  assert.equal(skill0.initCooldown, 10);
  assert.equal(talentOf(loaded.enemies.enemy_1512_mcmstr, 'reborn'), undefined);
}

test('[敌能-78] the three read pages are covered; other reborn shapes stay gaps; rm01 drops AtkDesWeaken for 泰特斯', () => {
  const skill = [{ key: SKILL, cooldown: 10, initCooldown: 10, sp: 0, bb: { atk: -0.5, duration: 25 } }];
  for (const key of [APPRENTICE, ELITE, TITUS]) assertReadKnight(key, skill);
  assertUnreadShapes();
  assertRm01();
});

test('[敌能-78] the highest current ATK, a flyer past reach, takes ×0.5 for 25 s; the next cast skips whoever already holds it', () => {
  const { c, w } = world(TITUS, knight(TITUS, 10, 10), (cc) => {
    cc.operators.guard.atk = 50;
    cc.operators.sniper.atk = 40;
    cc.operators.sniper.motion = 'FLY';
  });
  const e = spawn(w, c, TITUS);
  deploy(w, c, [['guard', 1, 0], ['sniper', 0, 3]]);
  const guard = unit(w, 'guard'), sniper = unit(w, 'sniper');
  buffs.addBuff(sniper, buffs.makeBuff({ key: 'boost', mods: { atkPct: 1 } }));
  assert.equal(atk(sniper), 80);
  assert.equal(attrs.statsOf(sniper).flying, true);
  pin(e, guard.x, guard.y);
  step(w, c);
  assert.equal(e.blockedBy, guard.id);
  const dx = sniper.x - e.x, dy = sniper.y - e.y;
  assert.ok(dx * dx + dy * dy > 4);
  through(w, c, 299);
  assert.equal(holding(sniper), false);
  through(w, c, 300);
  assert.equal(atk(sniper), 40);
  assert.equal(left(sniper), WEAKEN);
  assert.equal(holding(guard), false);
  through(w, c, 600);
  assert.equal(left(sniper), 450);
  assert.equal(atk(guard), 25);
  assert.equal(left(guard), WEAKEN);
  through(w, c, 900);
  assert.equal(e.ab[`${SKILL}.cd`], 0);
  assert.equal(left(sniper), 150);
  assert.equal(left(guard), 450);
  e.ab[`${SKILL}.cd`] = 1e9;
  through(w, c, 1049);
  assert.equal(left(sniper), 1);
  assert.equal(atk(sniper), 40);
  through(w, c, 1050);
  assert.equal(holding(sniper), false);
  assert.equal(atk(sniper), 80);
});

test('[敌能-78] 精锐 casts at 15 s and, alone, stays ready while that unit is still weakened', () => {
  const { c, w } = world(ELITE, knight(ELITE, 15, 15), (cc) => { cc.operators.guard.atk = 20; });
  const e = spawn(w, c, ELITE);
  deploy(w, c, [['guard', 1, 1]]);
  const g = unit(w, 'guard');
  through(w, c, 449);
  assert.equal(holding(g), false);
  through(w, c, 450);
  assert.equal(left(g), WEAKEN);
  assert.equal(atk(g), 10);
  through(w, c, 900);
  assert.equal(e.ab[`${SKILL}.cd`], 0);
  assert.equal(left(g), 300);
});

test('[敌能-78] 学徒 casts at 25 s, and the same unit is chosen again once the 25 s weaken ends on that frame', () => {
  const { c, w } = world(APPRENTICE, knight(APPRENTICE, 25, 25), (cc) => { cc.operators.guard.atk = 20; });
  spawn(w, c, APPRENTICE);
  deploy(w, c, [['guard', 1, 1]]);
  const g = unit(w, 'guard');
  through(w, c, 749);
  assert.equal(holding(g), false);
  through(w, c, 750);
  assert.equal(left(g), WEAKEN);
  assert.equal(atk(g), 10);
  through(w, c, 1499);
  assert.equal(left(g), 1);
  through(w, c, 1500);
  assert.equal(left(g), WEAKEN);
  assert.equal(atk(g), 10);
});

test('[敌能-78] nobody eligible: the skill stays ready, and the next frame with a unit spends it', () => {
  const { c, w } = world(TITUS, knight(TITUS, 10, 10));
  const e = spawn(w, c, TITUS);
  through(w, c, 300);
  assert.equal(e.ab[`${SKILL}.cd`], 0);
  assert.equal(w.units.some((u) => holding(u)), false);
  deploy(w, c, [['guard', 1, 1]]);
  const g = unit(w, 'guard');
  assert.equal(holding(g), true);
  assert.equal(e.ab[`${SKILL}.cd`], secondsToFrames(10) - 1);
});

test('[敌能-78] silence and stun hold the cast; a later silence leaves the weaken in place', () => {
  const silenced = world(TITUS, knight(TITUS, 10, 10), (cc) => { cc.operators.guard.atk = 40; });
  const e = spawn(silenced.w, silenced.c, TITUS);
  deploy(silenced.w, silenced.c, [['guard', 1, 1]]);
  const g = unit(silenced.w, 'guard');
  e.ab[`${SKILL}.cd`] = 0;
  status.applyStatus(e, 'silence', {});
  step(silenced.w, silenced.c);
  assert.equal(holding(g), false);
  assert.equal(e.ab[`${SKILL}.cd`], 0);
  buffs.removeBuff(e, 'silence');
  step(silenced.w, silenced.c);
  assert.equal(left(g), WEAKEN);
  assert.equal(atk(g), 20);
  status.applyStatus(e, 'silence', {});
  step(silenced.w, silenced.c);
  assert.equal(left(g), WEAKEN - 1);
  const stunned = world(TITUS, knight(TITUS, 10, 10), (cc) => { cc.operators.guard.atk = 40; });
  const f = spawn(stunned.w, stunned.c, TITUS);
  deploy(stunned.w, stunned.c, [['guard', 1, 1]]);
  f.ab[`${SKILL}.cd`] = 0;
  status.applyStatus(f, 'stun', {});
  step(stunned.w, stunned.c);
  assert.equal(holding(unit(stunned.w, 'guard')), false);
  assert.equal(f.ab[`${SKILL}.cd`], 0);
});

test('[敌能-78] blocked, and 战栗 while blocked, the skill still fires', () => {
  const { c, w } = world(TITUS, knight(TITUS, 10, 10), (cc) => { cc.operators.guard.atk = 40; });
  const e = spawn(w, c, TITUS);
  deploy(w, c, [['guard', 1, 0]]);
  const g = unit(w, 'guard');
  pin(e, g.x, g.y);
  step(w, c);
  assert.equal(e.blockedBy, g.id);
  status.applyStatus(e, 'disarmedCombat', {});
  e.ab[`${SKILL}.cd`] = 0;
  step(w, c);
  assert.equal(e.blockedBy, g.id);
  assert.equal(left(g), WEAKEN);
  assert.equal(atk(g), 20);
});

test('[敌能-78] equal ATK: later deployment, then higher taunt, then the lower id', () => {
  const later = world(TITUS, knight(TITUS, 10, 10), (cc) => { cc.operators.guard.atk = 30; cc.operators.sniper.atk = 30; });
  spawn(later.w, later.c, TITUS);
  deploy(later.w, later.c, [['guard', 1, 1]]);
  deploy(later.w, later.c, [['sniper', 0, 2]]);
  through(later.w, later.c, 300);
  assert.equal(holding(unit(later.w, 'sniper')), true);
  assert.equal(holding(unit(later.w, 'guard')), false);
  const taunt = world(TITUS, knight(TITUS, 10, 10), (cc) => {
    cc.operators.guard.atk = 30;
    cc.operators.guard.tauntLevel = 1;
    cc.operators.sniper.atk = 30;
  });
  spawn(taunt.w, taunt.c, TITUS);
  deploy(taunt.w, taunt.c, [['sniper', 0, 2], ['guard', 1, 1]]);
  through(taunt.w, taunt.c, 300);
  assert.equal(holding(unit(taunt.w, 'guard')), true);
  assert.equal(holding(unit(taunt.w, 'sniper')), false);
  const tied = world(TITUS, knight(TITUS, 10, 10), (cc) => { cc.operators.guard.atk = 30; cc.operators.sniper.atk = 30; });
  spawn(tied.w, tied.c, TITUS);
  deploy(tied.w, tied.c, [['guard', 1, 1], ['sniper', 0, 2]]);
  const guard = unit(tied.w, 'guard'), sniper = unit(tied.w, 'sniper');
  guard.born = sniper.born = 4;
  guard.bornN = sniper.bornN = 1;
  through(tied.w, tied.c, 300);
  const low = guard.id < sniper.id ? guard : sniper;
  const high = guard.id < sniper.id ? sniper : guard;
  assert.equal(holding(low), true);
  assert.equal(holding(high), false);
});

test('[敌能-78] a summon and our device can be the highest; a neutral and an enemy device cannot; stealth waits, 起飞 is eligible', () => {
  const summoned = world(TITUS, knight(TITUS, 10, 10), (cc) => {
    cc.operators.guard.atk = 10;
    cc.operators.puppet = {
      name: 'puppet', position: 'MELEE', cost: 0, blockCnt: 0, baseAttackTime: 100, maxHp: 1e7, atk: 500, def: 0, res: 0,
      range: [{ row: 0, col: 0 }], summoner: 'guard',
      summon: { deployLimit: 1, holdLimit: 1, supply: 1, occupy: 0, respawn: 'default' },
    };
  });
  spawn(summoned.w, summoned.c, TITUS);
  deploy(summoned.w, summoned.c, [['guard', 1, 1]]);
  deploy(summoned.w, summoned.c, [['puppet', 1, 2]]);
  through(summoned.w, summoned.c, 300);
  assert.equal(holding(unit(summoned.w, 'puppet')), true);
  assert.equal(holding(unit(summoned.w, 'guard')), false);
  const bell = { name: 'bell', maxHp: 500, atk: 900, def: 0, res: 0, blockCnt: 0, baseAttackTime: 100, aspd: 100, tauntLevel: 0, massLevel: 0, talentBb: {} };
  const device = world(TITUS, knight(TITUS, 10, 10), (cc) => {
    cc.operators.guard.atk = 10;
    cc.devices = { bell };
    cc.level.predefines = [{ alias: 'bell#1', key: 'bell', hidden: false, row: 0, col: 4, dir: 'UP' }];
  });
  spawn(device.w, device.c, TITUS);
  deploy(device.w, device.c, [['guard', 1, 1]]);
  through(device.w, device.c, 300);
  assert.equal(holding(unit(device.w, 'bell')), true);
  assert.equal(holding(unit(device.w, 'guard')), false);
  const skipped = world(TITUS, knight(TITUS, 10, 10), (cc) => {
    cc.operators.guard.atk = 40;
    cc.devices = { mine: { ...bell, atk: 5000, side: 'ENEMY' } };
    cc.level.predefines = [{ alias: 'mine#1', key: 'mine', hidden: false, row: 0, col: 4, dir: 'UP' }];
    cc.enemies.doll = { name: 'doll', neutral: true, maxHp: 100, atk: 8000, def: 0, res: 0, moveSpeed: 0 };
    cc.level.waves = [oneWave([spawnAt(0, TITUS), spawnAt(0, 'doll')])];
  });
  spawn(skipped.w, skipped.c, TITUS);
  deploy(skipped.w, skipped.c, [['guard', 1, 1]]);
  through(skipped.w, skipped.c, 300);
  assert.equal(holding(unit(skipped.w, 'guard')), true);
  assert.equal(holding(unit(skipped.w, 'doll')), false);
  assert.equal(holding(unit(skipped.w, 'mine')), false);
  const hidden = world(TITUS, knight(TITUS, 10, 10), (cc) => { cc.operators.sniper.atk = 100; });
  const h = spawn(hidden.w, hidden.c, TITUS);
  deploy(hidden.w, hidden.c, [['sniper', 0, 2]]);
  const sniper = unit(hidden.w, 'sniper');
  buffs.addBuff(sniper, buffs.makeBuff({ key: 'hide', flags: { stealth: true } }));
  through(hidden.w, hidden.c, 300);
  assert.equal(holding(sniper), false);
  assert.equal(h.ab[`${SKILL}.cd`], 0);
  const lifted = world(TITUS, knight(TITUS, 10, 10), (cc) => { cc.operators.sniper.atk = 100; cc.operators.guard.atk = 10; });
  spawn(lifted.w, lifted.c, TITUS);
  deploy(lifted.w, lifted.c, [['guard', 1, 1], ['sniper', 0, 2]]);
  const flyer = unit(lifted.w, 'sniper');
  buffs.addBuff(flyer, buffs.makeBuff({ key: 'air', flags: { liftoff: true } }));
  assert.equal(attrs.statsOf(flyer).flying, false);
  through(lifted.w, lifted.c, 300);
  assert.equal(holding(flyer), true);
  assert.equal(holding(unit(lifted.w, 'guard')), false);
});

test('[敌能-78] the first knockdown revives to full HP for 5 s, invincible, then the second is final; silence does not stop it', () => {
  const { c, w } = world(TITUS, knight(TITUS, 10, 10, { maxHp: 800 }));
  const e = spawn(w, c, TITUS);
  e.ab[`${SKILL}.cd`] = 5;
  status.applyStatus(e, 'silence', {});
  assert.equal(attrs.statsOf(e).flags.silence, true);
  damage.dealDamage(w, null, e, { type: 'true', amount: 1e9 });
  step(w, c);
  assert.equal(w.units.includes(e), true);
  assert.equal(e.hp, 800);
  const s = attrs.statsOf(e);
  assert.equal(s.invincible, true);
  assert.equal(s.disabled, true);
  assert.equal(s.immobile, true);
  assert.equal(targeting.selectable(e), false);
  assert.equal(e.buffs.some((b) => b.key === 'reborn'), true);
  assert.equal(attrs.statsOf(e).flags.silence ?? false, false);
  assert.equal(damage.dealDamage(w, null, e, { type: 'true', amount: 100 }), 0);
  assert.equal(e.hp, 800);
  run(w, c, 149);
  assert.equal(e.buffs.some((b) => b.key === 'reborn'), true);
  run(w, c, 1);
  assert.equal(e.buffs.some((b) => b.key === 'reborn'), false);
  assert.equal(e.buffs.some((b) => b.key === 'reborn:invincible'), false);
  assert.equal(e.hp, 800);
  assert.equal(attrs.statsOf(e).invincible, false);
  assert.equal(e.ab[`${SKILL}.cd`], secondsToFrames(10) - 1);
  damage.dealDamage(w, null, e, { type: 'true', amount: 1e9 });
  step(w, c);
  assert.equal(w.units.includes(e), false);
});

test('[敌能-78] a reborn that is not the read shape does not revive', () => {
  const bare = { name: 'bare', maxHp: 100, atk: 0, def: 0, res: 0, moveSpeed: 0, talents: { reborn: { duration: 5 } } };
  const extra = { name: 'extra', maxHp: 100, atk: 0, def: 0, res: 0, moveSpeed: 0, talents: { reborn: { duration: 5, hp_ratio: 0.5, page: 1 } } };
  const box = world('bare', bare);
  box.c.enemies.extra = extra;
  box.c.level.waves = [oneWave([spawnAt(0, 'bare'), spawnAt(0, 'extra')])];
  const w = createWorld(box.c, { seed: 1, players: 1 });
  step(w, box.c);
  const a = unit(w, 'bare'), b = unit(w, 'extra');
  damage.dealDamage(w, null, a, { type: 'true', amount: 1e9 });
  damage.dealDamage(w, null, b, { type: 'true', amount: 1e9 });
  step(w, box.c);
  assert.equal(w.units.includes(a), false);
  assert.equal(w.units.includes(b), false);
});

test('[敌能-78] [敌能-33] a normal attack skips a flying blocker and hits the ground unit in range', () => {
  const { c, w } = world(TITUS, knight(TITUS, 10, 10, { atk: 100, baseAttackTime: 3 }), (cc) => {
    cc.operators.guard.motion = 'FLY';
    cc.operators.guard.maxHp = 500;
    cc.operators.sniper.maxHp = 500;
  });
  const e = spawn(w, c, TITUS);
  e.x = 2;
  e.y = 1;
  e.atkCd = 0;
  deploy(w, c, [['guard', 1, 2]]);
  const guard = unit(w, 'guard');
  assert.equal(e.blockedBy, guard.id);
  deploy(w, c, [['sniper', 2, 2]]);
  const sniper = unit(w, 'sniper');
  /** @type {any[]} */
  const got = [];
  for (let i = 0; i < 20 && got.length === 0; i++) got.push(...step(w, c).filter((ev) => ev.type === 'hit' && ev.id === e.id));
  assert.equal(got.length, 1);
  assert.equal(got[0].target, sniper.id);
  assert.equal(sniper.maxHp - sniper.hp, 100);
  assert.equal(guard.hp, guard.maxHp);
});

test('[敌能-78] reaching the goal is not a knockdown: the knight leaves and costs a life', () => {
  const { c, w } = world(TITUS, knight(TITUS, 10, 10, { moveSpeed: 4 }));
  spawn(w, c, TITUS);
  const life = w.players[0].life;
  for (let i = 0; i < 600 && w.units.some((u) => u.key === TITUS); i++) step(w, c);
  assert.equal(w.units.some((u) => u.key === TITUS), false);
  assert.equal(w.players[0].life, life - 1);
});
