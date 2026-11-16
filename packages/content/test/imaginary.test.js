// 假想敌：蚀裂 and 假想敌：淤困 (docs/spec/foes.md 敌能-160, 敌能-161). No shipped level has these ids, so the records
// are level 0 of enemy_database (ArknightsGameData 17759cc8). 蚀裂's handbook damage type is not in that file; the page
// says 法术, so the record sets dmgType. A parked 蚀裂 is also 束缚: moveSpeed's floor is 0.1, so zeroing the base still creeps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, buffs, damage, devices, summons, elements, blocking, bus, KIND } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras, uncoveredAbilities } from '../src/foes.js';
import { LEVELS } from '../src/levels.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const CLOUD = { projectile_range: 0.8, projectile_life_time: 8, interval: 1, damage_atk_scale: 0.15 };
const SILT = { atk_scale: 0.3, damage_scale: 1.3, ep_damage_scale: 1.3 };
const QUIET = 'imaginaryQuiet';
const BIND = 'imaginaryBind';
const OURS = { name: 'ours', maxHp: 1e6, atk: 0, def: 0, res: 0, blockCnt: 0, baseAttackTime: 1, maxEp: 5000, talentBb: {} };
/** Eight pulses, one per second, the birth frame skipped (敌能-46). */
const EIGHT = [30, 60, 90, 120, 150, 180, 210, 240];

/** @param {Record<string, number>} [bb] @returns {EnemyDef} */
function actoxi(bb = CLOUD) {
  return {
    name: '假想敌：蚀裂', maxHp: 15000, atk: 400, def: 400, res: 10, moveSpeed: 0.6, baseAttackTime: 1.5,
    rangeRadius: -1, applyWay: 'MELEE', motion: 'WALK', levelType: 'ELITE', massLevel: 2, dmgType: 'arts', talents: { 1: { ...bb } },
  };
}

/** @returns {EnemyDef} */
function acelem() {
  return {
    name: '假想敌：淤困', maxHp: 36000, atk: 600, def: 200, res: 40, moveSpeed: 0.5, baseAttackTime: 1,
    rangeRadius: -1, applyWay: 'NONE', motion: 'WALK', levelType: 'ELITE', massLevel: 1, talents: { 1: { ...SILT } },
  };
}

/** @param {Record<string, Record<string, number>>} talents @returns {EnemyDef} */
const named = (talents) => ({ name: 'e', maxHp: 100, atk: 100, def: 0, res: 0, moveSpeed: 1, talents });

/** @param {Record<string, Record<string, number>>} talents */
const gaps = (talents) => uncoveredAbilities([named(talents)]);

/** @param {[string, EnemyDef][]} foes @param {(c: any) => void} [tune] */
function board(foes, tune) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = Object.fromEntries(foes);
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave(foes.map(([k]) => spawnAt(0, k)))];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 12 };
  for (const name of ['g2', 'g3', 'g4', 'g5']) c.operators[name] = { ...c.operators.guard, name };
  for (const name of ['s2', 's3', 's4']) c.operators[name] = { ...c.operators.sniper, name };
  c.operators.puppet = { ...c.operators.guard, name: 'puppet' };
  for (const o of Object.values(c.operators)) Object.assign(o, { cost: 0, atk: 0, def: 0, res: 0, maxHp: 1e6, maxEp: 5000 });
  tune?.(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  return { c, w };
}

/** @param {World} w @param {string} key @returns {Unit} */
function unitKey(w, key) {
  const u = w.units.find((x) => x.key === key);
  if (!u) throw new Error(`no ${key}`);
  return u;
}

/** @param {Unit} e @param {number} x @param {number} y */
function park(e, x, y) {
  e.x = x;
  e.y = y;
  e.path = [];
  e.base.moveSpeed = 0;
}

/** @param {World} w @param {any} c @param {[string, number, number][]} seats */
const deploy = (w, c, seats) => step(w, c, seats.map(([op, row, col]) => [0, { type: 'deploy', op, row, col, dir: 0 }]));

/** @param {World} w @param {any} c @param {number} n */
function run(w, c, n) {
  /** @type {any[]} */
  const out = [];
  for (let i = 0; i < n; i++) for (const ev of step(w, c)) out.push({ ...ev, f: w.frame - 1 });
  return out;
}

/** @param {any[]} ev @param {number} id */
const attacks = (ev, id) => ev.filter((x) => x.type === 'attack' && x.id === id);
/** @param {any[]} ev @param {number} id */
const hitsFrom = (ev, id) => ev.filter((x) => x.type === 'hit' && x.id === id);
/** @param {any[]} ev @param {number} id */
const hitsOn = (ev, id) => ev.filter((x) => x.type === 'hit' && x.target === id);
/** @param {Unit} u @param {string} key */
const buffOf = (u, key) => u.buffs.find((b) => b.key === key);
/** @param {Unit} u @param {string} name */
const flag = (u, name) => { buffs.addBuff(u, buffs.makeBuff({ key: `t:${name}`, flags: { [name]: true } })); };

/** 蚀裂 held on its tile after the spawn step. 束缚, not moveSpeed 0: the attribute floor is 0.1 (属性). A 地穴 still falls (地图-4). @param {[string, EnemyDef][]} [extra] */
function opened(extra = []) {
  const box = board([['enemy_9006_actoxi', actoxi()], ...extra]);
  const e = unitKey(box.w, 'enemy_9006_actoxi');
  park(e, 3, 1);
  status.applyStatus(e, 'root', {});
  return { ...box, e };
}

/** @param {ReturnType<typeof opened>} box */
function placeCloud(box) {
  box.e.hp = 0;
  step(box.w, box.c);
  const z = /** @type {any} */ (box.w.zones?.[0]);
  return { z, placed: box.w.frame - 1 };
}

/**
 * n 淤困, parked off the guard, then moved onto it the step after the guard is deployed. The returned step is the one
 * that blocks them; attachment is the step after that (敌能-2).
 * @param {number} [n] @param {[string, EnemyDef][]} [more]
 */
function siltReady(n = 1, more = []) {
  /** @type {[string, EnemyDef][]} */
  const foes = more.slice();
  for (let i = 0; i < n; i++) foes.push([i === 0 ? 'enemy_9007_acelem' : `silt${i}`, acelem()]);
  const box = board(foes, (c) => { c.operators.guard.blockCnt = 3; });
  const es = box.w.units.filter((u) => u.base.levelType === 'ELITE');
  for (const e of es) park(e, 0, 2);
  deploy(box.w, box.c, [['guard', 1, 2]]);
  es.forEach((e, i) => park(e, 2.4, 1.3 - i * 0.05));
  const blocked = step(box.w, box.c);
  return { ...box, es, g: unitKey(box.w, 'guard'), blocked };
}

/** The step after a block: 闪现 and 自缚, no arts yet. @param {ReturnType<typeof siltReady>} s */
function attach(s) {
  const ev = step(s.w, s.c);
  return { ...s, ev, frame: s.w.frame - 1 };
}

test('[敌能-160] [敌能-161] [敌能-31] [敌能-62] [敌能-127] [关卡-2] these two shapes of talent 1 are covered; the spy, the barrel and the toxin stay covered; every other shape of 1 stays uncovered', () => {
  assert.equal(Object.values(LEVELS).some((lv) => lv.enemies && (Object.hasOwn(lv.enemies, 'enemy_9006_actoxi') || Object.hasOwn(lv.enemies, 'enemy_9007_acelem'))), false);
  assert.deepEqual(gaps({ 1: { ...CLOUD } }), []);
  assert.deepEqual(gaps({ 1: { ...SILT } }), []);
  assert.deepEqual(gaps({ 1: { ...CLOUD, interval: 2 } }), [], 'a different interval is still this shape');
  assert.deepEqual(gaps({ 1: { ...CLOUD, ammo: 3 } }), [], 'ammo is the spy, and that shape is covered');
  /** @type {Record<string, number>} */
  const short = { ...CLOUD };
  delete short.damage_atk_scale;
  assert.deepEqual(gaps({ 1: short }), ['1']);
  assert.deepEqual(gaps({ 1: { ...CLOUD, foo: 1 } }), ['1']);
  assert.deepEqual(gaps({ 1: { ...SILT, extra: 1 } }), ['1']);
  assert.deepEqual(uncoveredAbilities([named({ 1: { ...CLOUD, projectile_range: /** @type {any} */ ('0.8') } })]), ['1']);
  assert.deepEqual(gaps({ 1: { move_speed: 0.5 } }), ['1'], 'move_speed without the page marker is not the barrel');
  assert.deepEqual(gaps({ 1: { move_speed: 0.5, carry: 1 } }), []);
  assert.deepEqual(gaps({ 1: { ep_damage_ratio: 0.2, interval: 1, range_radius: 1.5 } }), []);
  assert.deepEqual(gaps({ 1: { 'attack@ep_damage_ratio': 0.2 } }), ['1']);
  const spy = named({ 1: { 'attack@cost': -2, 'attack@sp': -1 } });
  assert.deepEqual(uncoveredAbilities([withFoeExtras('enemy_1317_wdexg', spy)]), []);
  const barrel = named({ 1: { move_speed: 0.5 } });
  assert.deepEqual(uncoveredAbilities([withFoeExtras('enemy_10044_wintun', barrel)]), []);
});

test('[敌能-160] [敌能-1] a blocked 蚀裂 still swings, and the swing is arts', () => {
  const box = board([['enemy_9006_actoxi', actoxi()]], (c) => { c.operators.guard.res = 100; c.operators.guard.def = 0; });
  const e = unitKey(box.w, 'enemy_9006_actoxi');
  park(e, 2, 1);
  const ev = deploy(box.w, box.c, [['guard', 1, 2]]);
  const g = unitKey(box.w, 'guard');
  const hit = hitsFrom(ev, e.id);
  assert.equal(e.blockedBy, g.id);
  assert.equal(attacks(ev, e.id).length, 1);
  assert.equal(hit.length, 1);
  assert.equal(hit[0].damage, 20, 'res 100 of 400 arts is 20; a physical swing would be 400');
  assert.equal(hit[0].target, g.id);
  assert.equal(box.w.zones, undefined);
});

test('[敌能-160] the cloud lands on the operator whose hit knocked it down, with the page numbers', () => {
  const box = opened();
  deploy(box.w, box.c, [['guard', 1, 0]]);
  const g = unitKey(box.w, 'guard');
  damage.dealDamage(box.w, g, box.e, { type: 'true', amount: box.e.hp }, box.c);
  step(box.w, box.c);
  const z = /** @type {any} */ (box.w.zones?.[0]);
  assert.equal(box.w.units.includes(box.e), false);
  assert.deepEqual(
    [z.x, z.y, z.radius, z.life, z.next, z.low, z.high, z.air, z.open, z.wide, z.arts, z.placed],
    [g.x, g.y, 0.8, 240, 30, 0, 0, true, false, false, 60, box.w.frame - 1],
  );
  assert.notDeepEqual([g.x, g.y], [3, 1], 'not where it fell');
  assert.equal(z.pad, undefined);
});

/** Where the cloud of a 蚀裂 knocked down by `kill` lands, or null for none. @param {(box: ReturnType<typeof opened>, g: Unit) => void} kill */
function cloudAfter(kill) {
  const box = opened([['slime2', named({})]]);
  deploy(box.w, box.c, [['guard', 1, 0]]);
  kill(box, unitKey(box.w, 'guard'));
  const z = /** @type {{ x: number, y: number } | undefined} */ (box.w.zones?.[0]);
  return z ? [z.x, z.y] : null;
}

test('[敌能-160] the unit of the killing hit, or the one it credits; where it fell after an enemy hit, an earlier hit, a killer gone; silenced none', () => {
  /** @param {ReturnType<typeof opened>} box @param {Unit | null} src @param {Record<string, unknown>} [more] */
  const kill = (box, src, more = {}) => damage.dealDamage(box.w, src, box.e, /** @type {any} */ ({ type: 'true', amount: box.e.hp, ...more }), box.c);
  assert.deepEqual(cloudAfter((box, g) => { kill(box, g, { sourceless: true }); step(box.w, box.c); }), [0, 1], 'credited to the guard');
  assert.deepEqual(cloudAfter((box) => { kill(box, unitKey(box.w, 'slime2')); step(box.w, box.c); }), [3, 1], 'an enemy is no 我方单位');
  assert.deepEqual(cloudAfter((box, g) => {
    damage.dealDamage(box.w, g, box.e, { type: 'true', amount: 10 }, box.c);
    damage.knockDown(box.e);
    step(box.w, box.c);
  }), [3, 1], 'the guard\'s hit did not knock it down');
  assert.deepEqual(cloudAfter((box, g) => { kill(box, g); step(box.w, box.c, [[0, { type: 'retreat', unit: g.id }]]); }), [3, 1], 'the guard left first');
  assert.equal(cloudAfter((box, g) => { status.applyStatus(box.e, 'silence', {}); kill(box, g); step(box.w, box.c); }), null, '死亡爆炸 is silenced');
});

test('[敌能-160] knockDown, setHp and a fall each leave a cloud; a leak and a non-1 interval do not', () => {
  for (const how of [damage.knockDown, (/** @type {Unit} */ u) => { damage.setHp(u, 0); }]) {
    const box = opened();
    how(box.e);
    step(box.w, box.c);
    const z = /** @type {{ x: number } | undefined} */ (box.w.zones?.[0]);
    assert.equal(box.w.zones?.length, 1);
    assert.ok(z);
    assert.equal(z.x, 3);
  }
  const fell = opened();
  fell.c.level.tiles[1][3] = { key: 'tile_hole', height: 'LOWLAND', buildable: 'NONE', passable: 'ALL', side: 'ALL' };
  step(fell.w, fell.c);
  const hole = /** @type {{ x: number, y: number } | undefined} */ (fell.w.zones?.[0]);
  assert.equal(fell.w.units.includes(fell.e), false);
  assert.ok(hole);
  assert.deepEqual([hole.x, hole.y], [3, 1]);
  const leak = board([['enemy_9006_actoxi', actoxi()]]);
  unitKey(leak.w, 'enemy_9006_actoxi').base.moveSpeed = 20;
  let goal = false;
  for (let i = 0; i < 400 && !goal; i++) goal = step(leak.w, leak.c).some((ev) => ev.type === 'goal');
  assert.equal(goal, true);
  assert.equal(leak.w.zones, undefined);
  const slow = board([['enemy_9006_actoxi', actoxi({ ...CLOUD, interval: 2 })]]);
  const slowE = unitKey(slow.w, 'enemy_9006_actoxi');
  park(slowE, 3, 1);
  slowE.hp = 0;
  step(slow.w, slow.c);
  assert.equal(slow.w.zones, undefined, 'interval 2 is covered and places nothing');
  const spy = board([['enemy_9006_actoxi', actoxi({ ...CLOUD, ammo: 1 })]]);
  const spyE = unitKey(spy.w, 'enemy_9006_actoxi');
  spyE.hp = 0;
  step(spy.w, spy.c);
  assert.equal(spy.w.zones, undefined, 'ammo is the spy and does not place a cloud');
});

test('[敌能-160] [敌能-46] eight sourceless arts ticks, res applied, the edge in and just past it out; then the zone is gone', () => {
  const box = opened();
  deploy(box.w, box.c, [['guard', 1, 0], ['g2', 1, 4], ['g3', 1, 2]]);
  const inside = unitKey(box.w, 'guard'), half = unitKey(box.w, 'g2'), out = unitKey(box.w, 'g3');
  inside.x = 3;
  inside.y = 1;
  half.base.res = 50;
  half.x = 3;
  half.y = 1;
  out.x = 3.8125;
  out.y = 1;
  const { placed } = placeCloud(box);
  const ev = run(box.w, box.c, 240);
  const low = hitsOn(ev, inside.id), mid = hitsOn(ev, half.id);
  assert.deepEqual(low.map((x) => x.damage), Array(8).fill(60));
  assert.deepEqual(low.map((x) => x.f), EIGHT.map((n) => placed + n));
  assert.deepEqual(low.map((x) => x.id), Array(8).fill(-1));
  assert.deepEqual(mid.map((x) => x.damage), Array(8).fill(30));
  assert.deepEqual(hitsOn(ev, out.id), []);
  assert.equal(box.w.zones, undefined);
});

/** Operators, a summon, a device and a neutral stood inside a cloud that has not ticked yet. */
function crowd() {
  const box = opened([['neutral', { name: 'n', maxHp: 1000, atk: 0, def: 0, res: 0, moveSpeed: 0, neutral: true, applyWay: 'NONE' }]]);
  const seats = /** @type {[string, number, number][]} */ ([
    ['guard', 1, 0], ['g2', 1, 4], ['g3', 1, 2], ['g4', 1, 1], ['sniper', 0, 2], ['s2', 0, 3], ['s3', 2, 2], ['s4', 2, 3],
  ]);
  deploy(box.w, box.c, seats);
  const owner = unitKey(box.w, 'guard');
  const puppet = summons.spawnSummon(box.w, box.c, owner, 'puppet', { row: 2, col: 0 });
  if (!puppet) throw new Error('no puppet');
  box.c.devices = { ours: OURS };
  assert.equal(devices.spawnDevice(box.w, box.c, 'ours', 0, 0), true);
  const boxU = unitKey(box.w, 'ours'), neutral = unitKey(box.w, 'neutral');
  const at = { guard: [3.8, 1], g2: [3.8125, 1], g3: [3, 1], g4: [3.2, 1], sniper: [3.3, 1], s2: [3.1, 1], s3: [2.9, 1], s4: [2.7, 1] };
  for (const [key, xy] of Object.entries(at)) { const u = unitKey(box.w, key); u.x = xy[0]; u.y = xy[1]; }
  puppet.x = 3.4;
  puppet.y = 1;
  boxU.x = 3.5;
  boxU.y = 1;
  neutral.x = 2.8;
  neutral.y = 1;
  status.applyStatus(unitKey(box.w, 'sniper'), 'levitate', {});
  flag(unitKey(box.w, 'g4'), 'camou');
  flag(unitKey(box.w, 's2'), 'untargetable');
  flag(unitKey(box.w, 's3'), 'stealth');
  flag(unitKey(box.w, 's4'), 'liftoff');
  return { box, puppet, boxU, neutral };
}

test('[敌能-160] operators and summons inside, including a flyer; 迷彩, 隐匿, 无法选择, 起飞, devices and neutrals out', () => {
  const { box, puppet, boxU, neutral } = crowd();
  assert.equal(attrs.statsOf(unitKey(box.w, 'sniper')).flying, true);
  placeCloud(box);
  const ev = run(box.w, box.c, 40);
  const once = (/** @type {number} */ id) => hitsOn(ev, id).map((x) => [x.damage, x.id]);
  assert.deepEqual(once(unitKey(box.w, 'guard').id), [[60, -1]], 'the edge of 0.8');
  assert.deepEqual(once(unitKey(box.w, 'g3').id), [[60, -1]]);
  assert.deepEqual(once(unitKey(box.w, 'sniper').id), [[60, -1]], '可对空');
  assert.deepEqual(once(puppet.id), [[60, -1]]);
  assert.deepEqual(hitsOn(ev, unitKey(box.w, 'g2').id), [], '0.8125 is outside');
  for (const u of [unitKey(box.w, 'g4'), unitKey(box.w, 's2'), unitKey(box.w, 's3'), unitKey(box.w, 's4'), boxU, neutral]) {
    assert.deepEqual(hitsOn(ev, u.id), [], u.key);
  }
});

test('[敌能-160] two clouds tick apart; invincible and 法术闪避 each skip one tick; a sourceless tick can still be dodged', () => {
  const pair = board([['enemy_9006_actoxi', actoxi()], ['act2', actoxi()]]);
  for (const e of pair.w.units.filter((u) => u.kind === KIND.ENEMY)) {
    park(e, 3, 1);
    status.applyStatus(e, 'root', {});
  }
  deploy(pair.w, pair.c, [['guard', 1, 0]]);
  const g = unitKey(pair.w, 'guard');
  g.x = 3;
  g.y = 1;
  for (const e of pair.w.units.filter((u) => u.kind === KIND.ENEMY)) e.hp = 0;
  step(pair.w, pair.c);
  assert.equal(pair.w.zones?.length, 2);
  const both = hitsOn(run(pair.w, pair.c, 40), g.id);
  assert.deepEqual(both.map((x) => x.damage), [60, 60]);
  const box = opened();
  deploy(box.w, box.c, [['guard', 1, 2]]);
  const one = unitKey(box.w, 'guard');
  one.x = 3;
  one.y = 1;
  placeCloud(box);
  status.applyStatus(one, 'invincible', {});
  const skipped = run(box.w, box.c, 30);
  assert.equal(hitsOn(skipped, one.id).length, 0);
  assert.equal(one.hp, one.maxHp);
  buffs.removeBuff(one, 'invincible');
  run(box.w, box.c, 29);
  buffs.addBuff(one, buffs.makeBuff({ key: 'slip', mods: { dodgeArts: 1 } }));
  /** @type {number[]} */
  const slips = [];
  bus.on(box.w, 'dodge', (k) => { slips.push(k.target.id); });
  const dodged = step(box.w, box.c);
  assert.deepEqual(slips, [one.id]);
  assert.equal(hitsOn(dodged, one.id).length, 0);
  assert.equal(one.hp, one.maxHp);
  buffs.removeBuff(one, 'slip');
  const later = hitsOn(run(box.w, box.c, 30), one.id);
  assert.deepEqual(later.map((x) => x.damage), [60]);
  assert.deepEqual(later.map((x) => x.id), [-1]);
});

test('[敌能-160] [合作-8] an intermission removes the enemy and leaves the cloud', () => {
  const box = opened();
  placeCloud(box);
  assert.equal(box.w.zones?.length, 1);
  box.c.level.stages = [
    { alias: 'a', objective: 'survive', time: 0, goal: 0, rest: 0 },
    { alias: 'b', objective: 'survive', time: 0, goal: 0, rest: 0 },
  ];
  box.w.stage = { ...box.w.stage, running: true, index: 0, start: box.w.frame, passed: 0 };
  step(box.w, box.c);
  assert.equal(box.w.units.some((u) => u.kind === KIND.ENEMY), false);
  assert.equal(box.w.zones?.length, 1);
});

test('[敌能-161] [敌能-37] [敌人攻击-1] 淤困 never swings; the no-attack mark is on from the spawn and outlives the attachment', () => {
  const s = siltReady();
  const e = s.es[0];
  const q = buffOf(e, QUIET);
  assert.ok(q);
  assert.equal(q.flags.noAttack, true);
  assert.equal(q.left, -1);
  assert.equal(attrs.statsOf(e).taunt, 0);
  assert.equal(attacks(s.blocked, e.id).length, 0);
  assert.equal(e.blockedBy, s.g.id);
  assert.equal(e.x, 2.4);
  assert.equal(e.y, 1.3);
  assert.equal(buffOf(e, BIND), undefined);
  const held = attach(s);
  assert.deepEqual([e.x, e.y], [2, 1]);
  assert.equal(buffOf(e, BIND)?.flags.root, true);
  assert.equal(e.buffs.some((b) => b.key === 'root'), false);
  assert.equal(hitsFrom(held.ev, e.id).length, 0);
  assert.equal(buffOf(s.g, `silt:${e.id}`)?.mods.epTakenMul, 1.3);
  assert.equal(buffOf(s.g, `silt:${e.id}`)?.mods.dmgTakenMul, undefined);
  assert.equal(buffOf(s.g, `silt:${e.id}`)?.mods.elementalTakenMul, undefined);
  status.applyStatus(e, 'silence', {});
  const quiet = step(s.w, s.c);
  assert.equal(attacks(quiet, e.id).length, 0);
  assert.ok(buffOf(e, QUIET));
  assert.equal(buffOf(e, BIND), undefined);
  assert.equal(buffOf(s.g, `silt:${e.id}`), undefined);
});

test('[敌能-161] the first arts hit is 30 frames after the attach, at the current attack, and a physical hit is not multiplied', () => {
  const s = attach(siltReady());
  const e = s.es[0], g = s.g;
  const before = g.hp;
  assert.equal(damage.dealDamage(s.w, null, g, { type: 'phys', amount: 200 }), 200);
  assert.equal(g.hp, before - 200);
  assert.equal(elements.dealEp(s.w, g, 'FIRE', 100), 130);
  e.base.atk = 1000;
  const ev = run(s.w, s.c, 30);
  const hit = hitsFrom(ev, e.id);
  assert.equal(hit.length, 1);
  assert.equal(hit[0].damage, 300);
  assert.equal(hit[0].target, g.id);
  assert.equal(hit[0].f, s.frame + 30);
  assert.ok(buffOf(g, `silt:${e.id}`));
});

test('[敌能-161] retreat drops the attachment the same step; stunning the guard drops it the step after, and the rooted enemy does not walk off', () => {
  const left = attach(siltReady());
  const ev = step(left.w, left.c, [[0, { type: 'retreat', unit: left.g.id }]]);
  assert.equal(attacks(ev, left.es[0].id).length, 0);
  assert.equal(buffOf(left.es[0], BIND), undefined);
  assert.equal(left.w.units.includes(left.g), false);
  assert.ok(buffOf(left.es[0], QUIET));
  const s = attach(siltReady());
  s.es[0].base.moveSpeed = 20;
  status.applyStatus(s.g, 'stun', {});
  step(s.w, s.c);
  assert.equal(s.es[0].blockedBy, -1);
  assert.equal(buffOf(s.es[0], BIND)?.flags.root, true);
  assert.ok(buffOf(s.g, `silt:${s.es[0].id}`));
  assert.deepEqual([s.es[0].x, s.es[0].y], [2, 1]);
  step(s.w, s.c);
  assert.equal(buffOf(s.es[0], BIND), undefined);
  assert.equal(buffOf(s.g, `silt:${s.es[0].id}`), undefined);
  assert.equal(s.w.units.includes(s.es[0]), true);
  assert.ok(buffOf(s.es[0], QUIET));
});

test('[敌能-161] silence drops the attachment and a later block attaches again; a stun on 淤困 does not drop it; death and a dead host drop it the same step', () => {
  const s = attach(siltReady());
  const e = s.es[0], g = s.g;
  status.applyStatus(e, 'silence', {});
  step(s.w, s.c);
  park(e, 2.4, 1.3);
  buffs.removeBuff(e, 'silence');
  step(s.w, s.c);
  assert.deepEqual([e.x, e.y], [2, 1]);
  assert.equal(buffOf(e, BIND)?.flags.root, true);
  assert.equal(buffOf(g, `silt:${e.id}`)?.mods.epTakenMul, 1.3);
  const stunned = attach(siltReady());
  status.applyStatus(stunned.es[0], 'stun', {});
  const pulsed = hitsFrom(run(stunned.w, stunned.c, 30), stunned.es[0].id);
  assert.deepEqual(pulsed.map((x) => x.damage), [180]);
  assert.ok(buffOf(stunned.es[0], BIND));
  const dead = attach(siltReady());
  dead.es[0].hp = 0;
  step(dead.w, dead.c);
  assert.equal(dead.w.units.includes(dead.es[0]), false);
  assert.equal(buffOf(dead.g, `silt:${dead.es[0].id}`), undefined);
  const host = attach(siltReady());
  host.g.hp = 0;
  step(host.w, host.c);
  assert.equal(buffOf(host.es[0], BIND), undefined);
  assert.ok(buffOf(host.es[0], QUIET));
  assert.equal(host.w.units.includes(host.g), false);
});

test('[敌能-161] a dodged or invincible arts tick is empty and the attachment stays; two attachments multiply the element damage', () => {
  const s = attach(siltReady());
  status.applyStatus(s.g, 'invincible', {});
  assert.equal(hitsFrom(run(s.w, s.c, 30), s.es[0].id).length, 0);
  assert.equal(s.g.hp, s.g.maxHp);
  assert.ok(buffOf(s.g, `silt:${s.es[0].id}`));
  buffs.removeBuff(s.g, 'invincible');
  buffs.addBuff(s.g, buffs.makeBuff({ key: 'slip', mods: { dodgeArts: 1 } }));
  /** @type {number[]} */
  const slips = [];
  bus.on(s.w, 'dodge', (k) => { slips.push(k.target.id); });
  const dodged = run(s.w, s.c, 30);
  assert.equal(hitsFrom(dodged, s.es[0].id).length, 0);
  assert.deepEqual(slips, [s.g.id]);
  assert.ok(buffOf(s.g, `silt:${s.es[0].id}`));
  buffs.removeBuff(s.g, 'slip');
  assert.equal(hitsFrom(run(s.w, s.c, 30), s.es[0].id)[0].damage, 180);
  const two = attach(siltReady(2));
  const keys = two.g.buffs.filter((b) => b.key.startsWith('silt:')).map((b) => b.key);
  assert.deepEqual(keys.sort(), two.es.map((e) => `silt:${e.id}`).sort());
  const taken = elements.dealEp(two.w, two.g, 'FIRE', 100);
  assert.ok(Math.abs(taken - 169) < 1e-6, String(taken));
});

test('[敌能-161] switching the blocker drops the old buff and 闪现s onto the new tile', () => {
  const s = attach(siltReady());
  deploy(s.w, s.c, [['g2', 1, 4]]);
  const g2 = unitKey(s.w, 'g2');
  s.es[0].blockedBy = -1;
  assert.equal(blocking.blockBy(s.w, s.es[0], g2), true);
  step(s.w, s.c);
  assert.deepEqual([s.es[0].x, s.es[0].y], [4, 1]);
  assert.equal(buffOf(s.g, `silt:${s.es[0].id}`), undefined);
  assert.equal(buffOf(g2, `silt:${s.es[0].id}`)?.mods.epTakenMul, 1.3);
  assert.equal(buffOf(s.es[0], BIND)?.flags.root, true);
});

/** @param {World} w @param {Unit} host */
function watch(w, host) {
  host.base.maxEp = 1000;
  /** @type {{ id: number, target: number, amount: number, el: string }[]} */
  const seen = [];
  bus.on(w, 'elementHit', (k) => {
    seen.push({ id: k.source ? k.source.id : -1, target: k.target.id, amount: k.dmg.amount, el: k.dmg.element });
  });
  elements.dealEp(w, host, 'FIRE', 1000);
  return seen;
}

/** @param {ReturnType<typeof attach>} s @param {[string, number, number][]} seats */
function burstField(s, seats) {
  deploy(s.w, s.c, seats);
  return s;
}

test('[敌能-161] [敌能-2] [元素-3] a burst deals 1000 of that element on the cross, not on the bursting host, a diagonal, a neutral, 隐匿, 起飞 or a hostile device', () => {
  const s = burstField(attach(siltReady(1, [['neutral', { name: 'n', maxHp: 1e6, atk: 0, def: 0, res: 0, moveSpeed: 0, neutral: true, applyWay: 'NONE' }]])), [
    ['g2', 1, 3], ['sniper', 0, 2], ['s2', 2, 2], ['s3', 0, 3],
  ]);
  s.c.devices = { ours: OURS };
  assert.equal(devices.spawnDevice(s.w, s.c, 'ours', 1, 1), true);
  const ours = unitKey(s.w, 'ours'), fly = unitKey(s.w, 'sniper'), cam = unitKey(s.w, 'g2'), plain = unitKey(s.w, 's2');
  const diag = unitKey(s.w, 's3'), neutral = unitKey(s.w, 'neutral');
  status.applyStatus(fly, 'levitate', {});
  flag(cam, 'camou');
  neutral.x = 2;
  neutral.y = 1;
  const seen = watch(s.w, s.g).filter((x) => x.id === s.es[0].id);
  const of = (/** @type {Unit} */ u) => seen.filter((x) => x.target === u.id).map((x) => [x.amount, x.el]);
  assert.deepEqual(of(ours), [[1000, 'FIRE']]);
  assert.deepEqual(of(fly), [[1000, 'FIRE']]);
  assert.deepEqual(of(cam), [[1000, 'FIRE']]);
  assert.deepEqual(of(plain), [[1000, 'FIRE']]);
  assert.deepEqual(of(diag), []);
  assert.deepEqual(of(neutral), []);
  assert.deepEqual(of(s.g), [], 'the host is beginning its burst, so its own 1000 does not land');
  const other = burstField(attach(siltReady()), [['g2', 1, 1], ['g3', 1, 3], ['s2', 2, 2], ['s3', 0, 3]]);
  other.c.devices = { theirs: { ...OURS, name: 'theirs', side: 'ENEMY' } };
  assert.equal(devices.spawnDevice(other.w, other.c, 'theirs', 0, 2), true);
  const foe = unitKey(other.w, 'theirs'), kept = unitKey(other.w, 's2');
  flag(unitKey(other.w, 'g2'), 'stealth');
  flag(unitKey(other.w, 'g3'), 'liftoff');
  const rest = watch(other.w, other.g).filter((x) => x.id === other.es[0].id);
  const pick = (/** @type {Unit} */ u) => rest.filter((x) => x.target === u.id);
  assert.deepEqual(pick(kept).map((x) => x.amount), [1000]);
  assert.deepEqual(pick(unitKey(other.w, 'g2')), []);
  assert.deepEqual(pick(unitKey(other.w, 'g3')), []);
  assert.deepEqual(pick(foe), []);
  assert.deepEqual(pick(unitKey(other.w, 's3')), []);
});

test('[敌能-161] silence does not spread; two attachments each spread 1000', () => {
  const quiet = burstField(attach(siltReady()), [['g2', 1, 1]]);
  const near = unitKey(quiet.w, 'g2');
  status.applyStatus(quiet.es[0], 'silence', {});
  assert.equal(buffOf(quiet.g, `silt:${quiet.es[0].id}`)?.mods.epTakenMul, 1.3, 'no step yet, so the attachment is still lent');
  const silenced = watch(quiet.w, quiet.g).filter((x) => x.id === quiet.es[0].id);
  assert.deepEqual(silenced, []);
  assert.equal(near.hp, near.maxHp);
  const two = burstField(attach(siltReady(2)), [['g2', 1, 1]]);
  const mate = unitKey(two.w, 'g2');
  const seen = watch(two.w, two.g).filter((x) => x.target === mate.id);
  assert.deepEqual(seen.map((x) => x.amount).sort(), [1000, 1000]);
  assert.deepEqual(seen.map((x) => x.id).sort(), two.es.map((e) => e.id).sort());
});
