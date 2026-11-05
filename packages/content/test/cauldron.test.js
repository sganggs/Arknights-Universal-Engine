// 鼎沸 and 飘香 (docs/spec/foes.md 敌能-129), and the shapes of the shared talent `aoe` (敌能-26, 关卡-2). 鼎沸 is in no
// shipped level: its record is built from enemy_database (ArknightsGameData 17759cc8, level 0). 飘香 is in PF-S-2
// 盘带练习 (act1football_sub-1-2) and also runs from that level's record. Ours have 防御力 10000, 法术抗性 0 and no attack,
// so one pulse of 鼎沸 (攻击力 140) is exactly −140 HP and −56 灼燃 on each, and 鼎沸 deals nothing else.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, elements, buffs, bus, stateHash, takeSnapshot, restoreSnapshot, KIND } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent, levelAt, levelContent } from '../src/index.js';
import { withFoeExtras, withoutIncomplete, uncoveredAbilities } from '../src/foes.js';

/** @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef @typedef {import('@aue/sim').World} World */

const HOT_KEY = 'enemy_10054_cjhot';
const AROMA_KEY = 'enemy_10054_cjhot_2';
const LEVEL = 'act1football_sub-1-2';
/** 鼎沸 at level 0 (enemy_database). @type {EnemyDef} */
const HOT = /** @type {any} */ ({
  name: '鼎沸', maxHp: 15000, atk: 140, def: 250, res: 60, moveSpeed: 0.8, baseAttackTime: 1, rangeRadius: 1.6, applyWay: 'NONE',
  motion: 'WALK', massLevel: 3, levelType: 'ELITE', talents: { aoe: { atk_scale: 1, ep_damage_ratio: 0.4 } },
});
/** The other blackboards of the name (enemy_database): 爆破攻坚手(组长), 腐败骑士 / 并驾骑士, 伤心的大锁. */
const SPLASH = { 'attack@bsthmr_range.atk_scale': 0.5 };
const KNIGHT = { 'attack@dekght[aoe].atk_scale': 1, 'attack@dekght[aoe].range_id': 'x-5' };
const LOCK = { atk_scale: 1.5 };
const HURT = { id: 's', type: 'MANUAL', sp: 'hurt', cost: 99, init: 0, charges: 1, duration: 0, ammo: false, bb: {} };

/** An enemy with these `aoe` numbers and nothing else of its own. @param {Record<string, unknown>} aoe @param {any} [more] @returns {EnemyDef} */
const foe = (aoe, more = {}) => /** @type {any} */ ({ ...HOT, talents: { aoe }, ...more });
/** @param {Unit} u */
const fire = (u) => elements.epOf(u, 'FIRE');

/** Our device, on the road one tile left of where the enemy stands. @param {any} c */
function useDevice(c) {
  c.devices = { box: { name: 'box', maxHp: 1e6, atk: 0, def: 0, res: 0, blockCnt: 0, baseAttackTime: 1, aspd: 100, tauntLevel: 0, massLevel: 0, talentBb: {} } };
  c.level.predefines = [{ alias: 'box#1', key: 'box', hidden: false, row: 1, col: 1, dir: 'UP' }];
}

/** Ours: sturdy, harmless, 法术抗性 `res`. @param {any} c @param {any} o */
function ours(c, o) {
  const body = { cost: 0, maxHp: 1e6, atk: 0, def: 10000, res: o.res ?? 0, maxEp: 1000 };
  Object.assign(c.operators.guard, body, o.skill ? { skill: o.skill } : {});
  Object.assign(c.operators.sniper, body);
  for (const k of ['far', 'summon']) c.operators[k] = { ...c.operators.guard, name: k };
  for (const k of ['hide', 'lift']) c.operators[k] = { ...c.operators.sniper, name: k };
  c.operators.fly = { ...c.operators.sniper, name: 'fly', motion: 'FLY' };
}

/**
 * The enemy `key` of record `def` at (x 2, y 1), rooted, as the content gives it (extras merged, incomplete abilities
 * dropped) unless `raw`; `o.neutral` neutral units at those points; `o.ops` [key, row, col] deployed on the next step;
 * `o.born` hears the `enemySpawn` event (钩子-3) from the first step on.
 * @param {string} key @param {EnemyDef} def @param {any} [o]
 */
function stand(key, def, o = {}) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [key]: o.raw ? def : withoutIncomplete(withFoeExtras(key, def)) };
  const spawns = [spawnAt(0, key)];
  for (const [i] of (o.neutral ?? []).entries()) {
    c.enemies[`neutral${i}`] = { name: 'neutral', maxHp: 1e6, atk: 0, def: 0, res: 0, moveSpeed: 0, neutral: true };
    spawns.push(spawnAt(0, `neutral${i}`));
  }
  c.behaviors = skeletonContent.behaviors;
  if (o.device) useDevice(c);
  c.level.waves = [oneWave(spawns)];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 9 };
  ours(c, o);
  const w = createWorld(c, { seed: 1, players: 1 });
  if (o.born) bus.on(w, 'enemySpawn', o.born);
  step(w, c);
  const es = w.units.filter((u) => u.kind === KIND.ENEMY);
  for (const [i, e] of es.entries()) {
    const [x, y] = i === 0 ? [2, 1] : o.neutral[i - 1];
    Object.assign(e, { x, y, path: [], pt: 0 });
    status.applyStatus(e, 'root', {});
  }
  const ops = /** @type {[string, number, number][]} */ (o.ops ?? [['guard', 1, 2]]);
  step(w, c, ops.map(([op, row, col]) => [0, { type: 'deploy', op, row, col, dir: 0 }]));
  /** @param {string} k */
  const op = (k) => /** @type {Unit} */ (w.units.find((u) => u.key === k));
  return { c, w, e: es[0], op, neutrals: es.slice(1), dev: w.units.find((u) => u.kind === KIND.DEVICE) };
}

/** Steps until the world frame is `frame`: the frames before it are done. The events of those steps. @param {{ w: World, c: any }} box @param {number} frame */
function play(box, frame) {
  /** @type {any[]} */
  const ev = [];
  while (box.w.frame < frame) for (const x of step(box.w, box.c)) ev.push(x);
  return ev;
}

test('[敌能-129] [敌能-26] [敌能-156] [关卡-2] aoe by its shape: 爆破攻坚手\'s share alone and the pulse\'s two numbers with the page marker are covered; every other shape is not', () => {
  const hot = withFoeExtras(HOT_KEY, HOT);
  assert.deepEqual(hot.talents, { aoe: { atk_scale: 1, ep_damage_ratio: 0.4, page: 1 } });
  assert.deepEqual(uncoveredAbilities([foe(SPLASH), hot]), []);
  const bare = { atk_scale: 1, ep_damage_ratio: 0.4 };
  for (const bb of [KNIGHT, LOCK, {}, bare, { ...bare, el: 3 }, { ...bare, page: '1' }, { ...bare, page: 1, radius: 2 }, { atk_scale: 1, ep_damage_ratio: '0.4', page: 1 }, { ep_damage_ratio: 0.4, page: 1 }, { ...SPLASH, atk_scale: 1 }]) {
    assert.deepEqual(uncoveredAbilities([foe(bb)]), ['aoe'], JSON.stringify(bb));
  }
  assert.deepEqual(withoutIncomplete(foe(LOCK)).talents, {});
  assert.deepEqual(withoutIncomplete(foe(KNIGHT)).talents, {});
  assert.deepEqual(withoutIncomplete(HOT).talents, {}, 'the two numbers alone are 卢西恩\'s skill too (敌能-156): not covered without the marker');
  assert.deepEqual(withoutIncomplete(hot).talents, hot.talents);
  assert.deepEqual(withoutIncomplete(foe(SPLASH)).talents, { aoe: SPLASH });
});

test('[敌能-129] [关卡-2] another aoe does nothing even when it stays on the enemy: it attacks, splashes nobody and does not pulse', () => {
  const lock = stand('enemy_2018_csdoll', foe(LOCK, { applyWay: 'RANGED', atk: 1000 }), { raw: true, ops: [['guard', 1, 2], ['sniper', 0, 2]] });
  const ev = play(lock, 61);
  const g = lock.op('guard'), s = lock.op('sniper');
  assert.ok(ev.some((x) => x.type === 'attack' && x.id === lock.e.id), 'it attacks');
  assert.equal(attrs.statsOf(lock.e).flags.noAttack, undefined);
  assert.equal(lock.e.buffs.some((b) => b.key === 'cauldronUnslowed'), false);
  assert.equal(lock.e.ab['aoe.next'], undefined);
  assert.ok(g.hp < 1e6 || s.hp < 1e6, 'its attack lands');
  assert.ok(g.hp === 1e6 || s.hp === 1e6, 'on one of them only: no cross splash');
  assert.equal(fire(g) + fire(s), 2000, 'no 灼燃');
});

test('[敌能-26] [敌能-129] 爆破攻坚手\'s shape still splashes the next tile at its share, and has no pulse', () => {
  const blast = stand('enemy_1076_bsthmr', foe(SPLASH, { applyWay: 'RANGED', atk: 1000 }), { ops: [['guard', 1, 2], ['sniper', 0, 2]] });
  play(blast, 61);
  const g = blast.op('guard'), s = blast.op('sniper');
  assert.ok(g.hp < 1e6 && 1e6 - s.hp === (1e6 - g.hp) / 2, `${1e6 - g.hp} and ${1e6 - s.hp}`);
  assert.equal(attrs.statsOf(blast.e).flags.noAttack, undefined);
  assert.equal(fire(g), 1000);
});

test('[敌能-129] the pulse lands 30 and 60 frames after the spawn frame: 100% arts and 40% 灼燃, each counted once for 受击回复; never a normal attack, nor a hit marked as one', () => {
  const box = stand(HOT_KEY, HOT, { skill: HURT });
  const g = box.op('guard');
  /** @type {boolean[]} */
  const asAttack = [];
  bus.on(box.w, 'hit', (k) => { if (k.source === box.e) asAttack.push(k.dmg.isAttack === true); });
  const early = play(box, 30);
  assert.deepEqual([g.hp, fire(g), g.skill?.sp], [1e6, 1000, 0], 'nothing in frames 0…29');
  assert.equal(box.e.ab['aoe.next'], 30);
  play(box, 31);
  assert.deepEqual([g.hp, fire(g), g.skill?.sp], [1e6 - 140, 1000 - 56, 1], 'frame 30');
  play(box, 60);
  assert.deepEqual([g.hp, fire(g)], [1e6 - 140, 944]);
  const later = play(box, 91);
  assert.deepEqual([g.hp, fire(g), g.skill?.sp], [1e6 - 420, 1000 - 168, 3], 'frames 60 and 90');
  assert.equal([...early, ...later].some((x) => x.type === 'attack' && x.id === box.e.id), false, 'no normal attack, though blocked');
  assert.equal(attrs.statsOf(box.e).flags.noAttack, true);
  assert.deepEqual(asAttack, [false, false, false], 'three hits, none with isAttack');
});

test('[敌能-129] the numbers are the blackboard\'s, on the 攻击力 it has at each pulse: arts 攻击力 × atk_scale, 灼燃 攻击力 × ep_damage_ratio', () => {
  const box = stand(HOT_KEY, foe({ atk_scale: 0.5, ep_damage_ratio: 0.25 }));
  const g = box.op('guard');
  play(box, 31);
  assert.deepEqual([g.hp, fire(g)], [1e6 - 70, 1000 - 35], '140 × 0.5 and 140 × 0.25');
  buffs.addBuff(box.e, buffs.makeBuff({ key: 'up', mods: { atkPct: 0.5 } }));
  assert.equal(attrs.statsOf(box.e).atk, 210);
  play(box, 61);
  assert.deepEqual([g.hp, fire(g)], [1e6 - 70 - 105, 1000 - 35 - 52.5], '210 × 0.5 and 210 × 0.25');
});

test('[敌能-129] who: ours within 1.6 + 0.25 its attack could select, our device and neutral units; not flying, 迷彩, 隐匿, 起飞 or beyond', () => {
  const box = stand(HOT_KEY, HOT, {
    ops: [['guard', 1, 2], ['far', 1, 4], ['summon', 1, 3], ['sniper', 0, 2], ['hide', 0, 3], ['fly', 2, 2], ['lift', 2, 3]],
    device: true, neutral: [[3.8, 1], [2, 1.5]],
  });
  const summon = box.op('summon');
  summon.summoner = 1;
  buffs.addBuff(box.op('sniper'), buffs.makeBuff({ key: 'camo', flags: { camou: true } }));
  buffs.addBuff(box.op('hide'), buffs.makeBuff({ key: 'veil', flags: { stealth: true } }));
  buffs.addBuff(box.op('lift'), buffs.makeBuff({ key: 'up', flags: { liftoff: true } }));
  play(box, 31);
  /** @param {Unit} u */
  const hit = (u) => u.hp === 1e6 - 140 && fire(u) === 944;
  /** @param {Unit} u */
  const held = (u) => u.hp === 1e6 && fire(u) === 1000;
  assert.ok(box.dev);
  for (const u of [box.op('guard'), summon, box.dev]) assert.equal(hit(u), true, u.key);
  for (const k of ['far', 'sniper', 'hide', 'fly', 'lift']) assert.equal(held(box.op(k)), true, k);
  for (const n of box.neutrals) assert.deepEqual([n.hp, fire(n)], [1e6 - 140, 1000], `neutral at ${n.x}: arts, no 灼燃`);
});

test('[敌能-129] [索敌-2] the unit blocking it counts only as the selection rules allow: a 迷彩 or 无法选中 blocker takes nothing', () => {
  for (const flag of ['camou', 'untargetable']) {
    const box = stand(HOT_KEY, HOT);
    const g = box.op('guard');
    play(box, 2);
    assert.equal(box.e.blockedBy, g.id);
    buffs.addBuff(g, buffs.makeBuff({ key: 'veil', flags: { [flag]: true } }));
    play(box, 31);
    assert.equal(box.e.blockedBy, g.id, flag);
    assert.deepEqual([g.hp, fire(g)], [1e6, 1000], flag);
  }
});

test('[敌能-129] arts goes through 伤判 and 法术抗性, then the 灼燃; the 灼燃 lands whatever the arts did; 无敌 takes neither', () => {
  const resisted = stand(HOT_KEY, HOT, { res: 50 });
  play(resisted, 31);
  assert.deepEqual([resisted.op('guard').hp, fire(resisted.op('guard'))], [1e6 - 70, 944], '法术抗性 halves the arts, not the 灼燃');
  // 50 灼燃 left: this pulse's 56 sets off the burst (元素-4: 法术抗性 −20, then 1200 arts) after the arts, not before it.
  const burnt = stand(HOT_KEY, HOT, { res: 50 });
  burnt.op('guard').ep = { FIRE: 50 };
  play(burnt, 31);
  assert.equal(burnt.op('guard').hp, 1e6 - 70 - 840, 'arts at 法术抗性 50, then the burst at 30');
  /** @type {[string, (u: Unit) => void][]} */
  const guards = [
    ['dodge', (u) => { buffs.addBuff(u, buffs.makeBuff({ key: 'evade', mods: { dodgeArts: 1 } })); }],
    ['shield', (u) => { buffs.addBuff(u, buffs.makeBuff({ key: 'wall', shieldHits: 1 })); }],
  ];
  for (const [name, put] of guards) {
    const box = stand(HOT_KEY, HOT);
    put(box.op('guard'));
    play(box, 31);
    assert.deepEqual([box.op('guard').hp, fire(box.op('guard'))], [1e6, 944], name);
  }
  const safe = stand(HOT_KEY, HOT);
  status.applyStatus(safe.op('guard'), 'invincible', {});
  play(safe, 31);
  assert.deepEqual([safe.op('guard').hp, fire(safe.op('guard'))], [1e6, 1000]);
});

test('[敌能-129] its own stun, freeze, sleep, silence, cold, 失衡 or 消失 do not stop or shift the pulse', () => {
  /** @param {string} key */
  const has = (key) => (/** @type {Unit} */ e) => e.buffs.some((b) => b.key === key);
  /** @type {[string, (e: Unit) => void, (e: Unit) => boolean][]} */
  const cases = [
    ['stun', (e) => { status.applyStatus(e, 'stun', { seconds: 30 }); }, has('stun')],
    ['freeze', (e) => { status.applyStatus(e, 'freeze', { seconds: 30 }); }, has('freeze')],
    ['sleep', (e) => { status.applyStatus(e, 'sleep', { seconds: 30 }); }, has('sleep')],
    ['silence', (e) => { status.applyStatus(e, 'silence', {}); }, has('silence')],
    ['cold', (e) => { status.applyStatus(e, 'cold', { seconds: 30 }); }, has('cold')],
    // 失衡 where it stands (位移-3): no speed, 硬直 past the second pulse
    ['失衡', (e) => { e.slide = { vx: 0, vy: 0, hard: 90 }; }, (e) => e.slide !== undefined],
    ['hidden', (e) => { e.hidden = true; }, (e) => e.hidden === true],
  ];
  for (const [name, put, holds] of cases) {
    const box = stand(HOT_KEY, HOT);
    put(box.e);
    const g = box.op('guard');
    play(box, 30);
    assert.equal(g.hp, 1e6, name);
    play(box, 31);
    assert.deepEqual([g.hp, fire(g)], [1e6 - 140, 944], name);
    play(box, 61);
    assert.deepEqual([g.hp, fire(g), holds(box.e)], [1e6 - 280, 888, true], name);
  }
});

test('[敌能-129] [状态-7] 不进行普通攻击 and 停顿免疫 are on from the spawn, before its first turn: a 停顿 given as it appears does not take', () => {
  /** @type {unknown[]} */
  const seen = [];
  const box = stand(HOT_KEY, HOT, { born: (/** @type {{ enemy: Unit }} */ k) => {
    const f = attrs.statsOf(k.enemy).flags;
    seen.push(f.noAttack, f['immune:sluggish']);
    status.applyStatus(k.enemy, 'sluggish', { seconds: 10 });
  } });
  assert.deepEqual(seen, [true, true]);
  assert.equal(box.e.buffs.some((b) => b.key === 'sluggish'), false);
});

test('[敌能-129] [状态-7] 停顿免疫: 停顿 does not take hold, so nothing sees it; silence lifts neither it nor 不进行普通攻击, and taken away both are back on its next turn', () => {
  const box = stand(HOT_KEY, HOT);
  const e = box.e, speed = attrs.statsOf(e).moveSpeed;
  assert.equal(attrs.statsOf(e).flags['immune:sluggish'], true);
  status.applyStatus(e, 'sluggish', { seconds: 10 });
  step(box.w, box.c);
  assert.equal(e.buffs.some((b) => b.key === 'sluggish'), false);
  assert.equal(attrs.statsOf(e).moveSpeed, speed);
  status.applyStatus(e, 'silence', {});
  status.applyStatus(e, 'sluggish', { seconds: 10 });
  step(box.w, box.c);
  assert.equal(e.buffs.some((b) => b.key === 'sluggish'), false);
  assert.deepEqual([attrs.statsOf(e).flags.noAttack, attrs.statsOf(e).flags['immune:sluggish']], [true, true]);
  assert.deepEqual(['cauldronStill', 'cauldronUnslowed'].map((k) => e.buffs.filter((b) => b.key === k).length), [1, 1], 'one each, not one a turn');
  for (const key of ['cauldronStill', 'cauldronUnslowed']) buffs.removeBuff(e, key);
  assert.deepEqual([attrs.statsOf(e).flags.noAttack, attrs.statsOf(e).flags['immune:sluggish']], [undefined, undefined]);
  step(box.w, box.c);
  assert.deepEqual([attrs.statsOf(e).flags.noAttack, attrs.statsOf(e).flags['immune:sluggish']], [true, true], '一直有效');
});

test('[敌能-129] [关卡-2] 飘香 in PF-S-2 盘带练习: its aoe is covered and kept, and the level\'s record pulses at its 攻击力 200', () => {
  assert.equal(levelAt(LEVEL, 'NORMAL').level.uncovered, undefined);
  assert.deepEqual(levelAt(LEVEL, 'NORMAL').enemies[AROMA_KEY].talents, { aoe: { atk_scale: 1, ep_damage_ratio: 0.4 } }, 'the level record: the data');
  const record = /** @type {EnemyDef} */ (levelContent(LEVEL, 'NORMAL').enemies[AROMA_KEY]);
  assert.deepEqual([record.atk, record.rangeRadius, record.applyWay, record.talents], [200, 1.6, 'NONE', { aoe: { atk_scale: 1, ep_damage_ratio: 0.4, page: 1 } }]);
  const box = stand(AROMA_KEY, record, { raw: true, ops: [['guard', 1, 2], ['far', 1, 4]] });
  const ev = play(box, 61);
  assert.deepEqual([box.op('guard').hp, fire(box.op('guard'))], [1e6 - 400, 1000 - 160]);
  assert.deepEqual([box.op('far').hp, fire(box.op('far'))], [1e6, 1000]);
  assert.equal(ev.some((x) => x.type === 'attack' && x.id === box.e.id), false);
  assert.equal(attrs.statsOf(box.e).flags['immune:sluggish'], true);
});

test('[敌能-129] [同步-2] the pulse count is in the snapshot: a match restored between two pulses goes on alike', () => {
  const box = stand(HOT_KEY, HOT);
  play(box, 45);
  const copy = { w: restoreSnapshot(JSON.parse(JSON.stringify(takeSnapshot(box.w)))), c: box.c };
  play(box, 91);
  play(copy, 91);
  assert.equal(stateHash(copy.w), stateHash(box.w));
  const g = /** @type {Unit} */ (copy.w.units.find((u) => u.key === 'guard'));
  assert.deepEqual([g.hp, fire(g)], [1e6 - 420, 1000 - 168]);
});
