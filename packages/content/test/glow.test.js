// 微光之触 (docs/spec/foes.md 敌能-77) on the fortress elites, placed on the tiny map.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, targeting, buffs } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { levelContent } from '../src/index.js';
import { uncoveredAbilities, withFoeExtras } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

const fort = levelContent('act1multi_fortress_rm01', 'NORMAL');
const HP = 1e6;
const ELITE = 'enemy_1184_cadkgt_2';
const VIVIANA = 'enemy_1184_cadkgt_3';
const NOVICE = 'enemy_1184_cadkgt';

/**
 * Fortress enemies on the tiny map. Foes spawn in frame 0 and are put at (row, col), rooted unless `free`.
 * Operators deploy in frame 1. A tweak may replace an enemy def; it must copy, not edit `fort`.
 * @param {[string, number, number][]} foes @param {[string, number, number][]} ops @param {{ free?: boolean, tweak?: (c: any) => void }} [o]
 */
function arena(foes, ops, o = {}) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { ...c.enemies, ...fort.enemies };
  c.behaviors = fort.behaviors;
  c.level.waves = [oneWave(foes.map(([k]) => spawnAt(0, k)))];
  c.level.options = { ...c.level.options, initialCost: 50, maxCost: 99, costIncreaseTime: 1000, characterLimit: 9 };
  for (const op of Object.values(c.operators)) Object.assign(op, { cost: 0, maxHp: HP });
  o.tweak?.(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const es = w.units.filter((u) => u.owner < 0);
  es.forEach((e, i) => { e.x = foes[i][2]; e.y = foes[i][1]; if (!o.free) status.applyStatus(e, 'root', {}); });
  step(w, c, ops.map(([op, row, col]) => [0, { type: 'deploy', op, row, col, dir: 0 }]));
  return { c, w, es, ops: w.units.filter((u) => u.owner >= 0) };
}

/** Steps until `w.frame` reaches `frame`; events carry the frame they happened in. @param {World} w @param {any} c @param {number} frame */
function until(w, c, frame) {
  /** @type {any[]} */
  const out = [];
  while (w.frame < frame) for (const ev of step(w, c)) out.push({ ...ev, f: w.frame - 1 });
  return out;
}

/** A second melee operator, so two of ours can stand on the road. @param {any} c */
function secondGuard(c) {
  c.operators.guard2 = { ...c.operators.guard, name: 'guard2' };
}

/** The sniper is born flying. Setting it after the first frames lets a ground attack start (索敌-2). @param {any} c */
function flySniper(c) {
  c.operators.sniper = { ...c.operators.sniper, motion: 'FLY' };
}

/** 学徒, from the database's level 0 and the read page. Not in the fortress level. @param {any} c */
function addNovice(c) {
  c.enemies[NOVICE] = withFoeExtras(NOVICE, {
    name: '散华骑士团学徒', maxHp: 7500, atk: 350, def: 300, res: 60, moveSpeed: 0.7, baseAttackTime: 3.2,
    rangeRadius: 2.2, applyWay: 'RANGED', motion: 'WALK', massLevel: 4, levelType: 'ELITE', dmgType: 'arts',
    skills: [{ key: 'ChargeAttack', cooldown: 25, initCooldown: 25, sp: 0, bb: { duration: 7, atk_scale: 2.5, range_radius: 2.2 } }],
  });
}

/** Copies a skill with a new first cooldown, so the shared fortress def stays as the level wrote it. @param {any} c @param {string} key @param {number} init */
function firstCd(c, key, init) {
  const e = c.enemies[key];
  c.enemies[key] = { ...e, skills: [{ ...e.skills[0], initCooldown: init }] };
}

test('[敌能-77] [关卡-2] the three read pages are covered; 点灯骑士 and the other ChargeAttack shapes stay open', () => {
  const foes = Object.values(fort.enemies);
  assert.equal(uncoveredAbilities(foes).includes('ChargeAttack'), false);
  const elite = fort.enemies[ELITE], viviana = fort.enemies[VIVIANA];
  assert.equal(elite.skills?.[0].bb.page, 1);
  assert.equal(elite.skills?.[0].bb.ground, undefined);
  assert.equal(elite.talents?.noFly, undefined);
  assert.deepEqual(viviana.skills?.[0].bb, { duration: 7, atk_scale: 3, range_radius: 2.2, page: 1, ground: 1 });
  assert.deepEqual(viviana.talents?.noFly, {});
  const bare = (/** @type {Record<string, unknown>} */ bb) => uncoveredAbilities([/** @type {any} */ ({ skills: [{ key: 'ChargeAttack', bb }] })]);
  assert.deepEqual(bare({ duration: 7, atk_scale: 2.5, range_radius: 3.2 }), ['ChargeAttack'], '点灯骑士 has the keys and no page');
  assert.deepEqual(bare({ atk_scale: 2, duration: 5 }), ['ChargeAttack'], '妒');
  assert.deepEqual(bare({ atk_scale: 3, 'dekght[aoe].atk_scale': 3, duration: 4 }), ['ChargeAttack'], '腐败骑士');
  assert.deepEqual(bare({ duration: 6, damage_resistance: 0.75, atk_scale: 1.4, radius: 1.8, heavy_atk_scale: 2.8 }), ['ChargeAttack'], '管钳');
  assert.deepEqual(uncoveredAbilities([withFoeExtras(NOVICE, fort.enemies[ELITE])]), [], '学徒, once the page marker is on');
});

test('[敌能-77] 精锐 does not fire with nobody inside 2.2; 25 s later the cooldown is still ready', () => {
  const { w, c, es: [e] } = arena([[ELITE, 1, 0]], [['guard', 1, 4]]);
  const ev = until(w, c, 1000);
  assert.equal(ev.filter((x) => x.type === 'blast').length, 0);
  assert.equal(e.ab['ChargeAttack.cd'] ?? 0, 0);
  assert.equal(e.buffs.some((b) => b.key === 'glowHold'), false);
});

test('[敌能-77] 精锐: the lock is a point; 7 s later 250% arts hits everyone there, a flyer included, and the one who left', () => {
  const tweak = (/** @type {any} */ c) => { secondGuard(c); flySniper(c); };
  const { w, c, es: [e], ops: [gone, stayed, fly] } = arena(
    [[ELITE, 1, 0]], [['guard', 1, 4], ['guard2', 1, 3], ['sniper', 0, 2]], { tweak });
  assert.equal(fly.base.motion, 'FLY');
  until(w, c, 750);
  gone.x = 1;
  until(w, c, 751);
  assert.deepEqual([e.ab['ChargeAttack.x'], e.ab['ChargeAttack.y']], [1, 1]);
  gone.x = 4;
  stayed.x = 1;
  fly.x = 1;
  fly.y = 1;
  const hp = [gone.hp, stayed.hp, fly.hp];
  const ev = until(w, c, 961);
  assert.deepEqual(ev.filter((x) => x.type === 'blast').map((x) => [x.f, x.x, x.y]), [[960, 1, 1]]);
  assert.deepEqual([gone.hp, hp[1] - stayed.hp, hp[2] - fly.hp], [hp[0], 1125, 1125]);
  assert.deepEqual(ev.filter((x) => x.type === 'attack' && x.id === e.id && x.f < 960).map((x) => x.f), []);
  assert.equal(e.ab['ChargeAttack.cd'], 749, '25 s starts as the shot resolves');
});

test('[敌能-77] 精锐 can lock a flyer, and the next shot is another 25 s after the first', () => {
  const { w, c, ops: [fly] } = arena([[ELITE, 1, 2]], [['sniper', 0, 2]], { tweak: flySniper });
  assert.equal(fly.base.motion, 'FLY');
  const ev = until(w, c, 1921);
  assert.deepEqual(ev.filter((x) => x.type === 'blast').map((x) => x.f), [960, 1920]);
  assert.equal(HP - fly.hp, 2250);
});

test('[敌能-77] a stun during 精锐\'s charge cancels the shot and starts the 25 s cooldown', () => {
  const { w, c, es: [e] } = arena([[ELITE, 1, 0]], [['guard', 1, 1]]);
  until(w, c, 800);
  assert.equal(e.buffs.some((b) => b.key === 'glowHold'), true);
  status.applyStatus(e, 'stun', { seconds: 5 });
  until(w, c, 801);
  assert.equal(e.ab['ChargeAttack.cd'], 749, '25 s starts on the cancel, before later frames count it down');
  const ev = until(w, c, 961);
  assert.equal(ev.filter((x) => x.type === 'blast').length, 0);
  assert.equal(e.buffs.some((b) => b.key === 'glowHold'), false);
  assert.equal(e.ab['ChargeAttack.ch'] ?? 0, 0);
});

test('[敌能-77] 薇薇安娜 does not lock a flyer; a ground unit, then 300% arts on the area including a flyer, cooldown 20 s', () => {
  const lone = arena([[VIVIANA, 1, 2]], [['sniper', 0, 2]], { tweak: flySniper });
  assert.equal(lone.ops[0].base.motion, 'FLY');
  const quiet = until(lone.w, lone.c, 900);
  assert.equal(quiet.filter((x) => x.type === 'blast').length, 0);
  assert.equal(lone.es[0].ab['ChargeAttack.cd'] ?? 0, 0);
  assert.equal(quiet.filter((x) => x.type === 'attack' && x.id === lone.es[0].id).length, 0);
  const { w, c, es: [e], ops: [ground, fly] } = arena([[VIVIANA, 1, 0]], [['guard', 1, 4], ['sniper', 0, 2]], { tweak: flySniper });
  assert.equal(fly.base.motion, 'FLY');
  until(w, c, 600);
  ground.x = 1;
  until(w, c, 601);
  ground.x = 4;
  fly.x = 1;
  fly.y = 1;
  const before = fly.hp;
  const ev = until(w, c, 811);
  assert.deepEqual(ev.filter((x) => x.type === 'blast').map((x) => [x.f, x.x, x.y]), [[810, 1, 1]]);
  assert.equal(before - fly.hp, 1500);
  assert.equal(ground.hp, HP);
  assert.equal(e.ab['ChargeAttack.cd'], 599);
});

test('[敌能-77] 薇薇安娜\'s next shot is another 20 s after the first, while a ground unit stays inside 2.2', () => {
  const { w, c } = arena([[VIVIANA, 1, 0]], [['guard', 1, 1]]);
  const ev = until(w, c, 1621);
  assert.deepEqual(ev.filter((x) => x.type === 'blast').map((x) => x.f), [810, 1620]);
});

test('[敌能-77] 学徒 uses 精锐\'s numbers and 薇薇安娜\'s refusal of a flying lock', () => {
  const tweak = (/** @type {any} */ c) => { addNovice(c); flySniper(c); };
  const lone = arena([[NOVICE, 1, 2]], [['sniper', 0, 2]], { tweak });
  assert.equal(lone.ops[0].base.motion, 'FLY');
  assert.deepEqual(lone.c.enemies[NOVICE].talents.noFly, {});
  until(lone.w, lone.c, 800);
  assert.equal(lone.es[0].ab['ChargeAttack.ch'] ?? 0, 0);
  const { w, c, ops: [g] } = arena([[NOVICE, 1, 0]], [['guard', 1, 4]], { tweak: addNovice });
  until(w, c, 750);
  g.x = 1;
  const ev = until(w, c, 961);
  assert.deepEqual(ev.filter((x) => x.type === 'blast').map((x) => x.f), [960]);
  assert.equal(HP - g.hp, 875);
});

test('[敌能-77] [索敌-2] while charging, 精锐 stands, does not attack, and its 隐匿 fails without being cleared; 迷彩 still hides it', () => {
  const tweak = (/** @type {any} */ c) => { firstCd(c, ELITE, 0); };
  const { w, c, es: [e] } = arena([[ELITE, 1, 0]], [['guard', 1, 1]], { free: true, tweak });
  assert.deepEqual([e.x, e.y, attrs.statsOf(e).immobile], [0, 1, true]);
  buffs.addBuff(e, buffs.makeBuff({ key: 'hide', flags: { stealth: true } }));
  buffs.addBuff(e, buffs.makeBuff({ key: 'cam', flags: { camou: true } }));
  assert.equal(targeting.stealthed(e), false);
  assert.equal(targeting.selectable(e), false);
  const ev = until(w, c, 212);
  assert.deepEqual([e.x, e.y], [0, 1]);
  assert.equal(ev.filter((x) => x.type === 'attack' && x.id === e.id && x.f < 211).length, 0);
  assert.equal(ev.some((x) => x.type === 'blast' && x.f === 211), true);
  assert.equal(e.buffs.some((b) => b.key === 'hide'), true);
  assert.equal(e.buffs.some((b) => b.key === 'glowVeil'), false);
  assert.equal(targeting.stealthed(e), true);
});

test('[敌能-77] [索敌-2] 薇薇安娜\'s 隐匿免疫 also drops 迷彩 for the charge', () => {
  const tweak = (/** @type {any} */ c) => { firstCd(c, VIVIANA, 0); };
  const { es: [e] } = arena([[VIVIANA, 1, 0]], [['guard', 1, 1]], { tweak });
  buffs.addBuff(e, buffs.makeBuff({ key: 'cam', flags: { camou: true } }));
  assert.equal(attrs.statsOf(e).flags.uncamou, true);
  assert.equal(targeting.selectable(e), true);
});

test('[敌能-77] the lock follows 索敌-5: the blocker, not the nearer unit that cannot block', () => {
  const tweak = (/** @type {any} */ c) => { c.operators.near = { ...c.operators.guard, name: 'near', blockCnt: 0 }; };
  // The guard deploys on the enemy and blocks it. A blocker is only recognised while its own x,y is the integer
  // tile (阻挡-2 reads the tile that way), so it stays on column 2. The enemy then stands at 2.4, inside that
  // block radius, and the unit that cannot block stands closer, at 2.6.
  const { w, c, es: [e], ops: [near, guard] } = arena([[ELITE, 1, 2]], [['near', 1, 1], ['guard', 1, 2]], { tweak });
  assert.equal(near.key, 'near');
  assert.equal(guard.key, 'guard');
  e.x = 2.4;
  near.x = 2.6;
  until(w, c, 750);
  assert.equal(e.blockedBy, guard.id);
  const nd = (near.x - e.x) * (near.x - e.x) + (near.y - e.y) * (near.y - e.y);
  const gd = (guard.x - e.x) * (guard.x - e.x) + (guard.y - e.y) * (guard.y - e.y);
  assert.ok(nd < gd);
  until(w, c, 751);
  assert.equal(e.ab['ChargeAttack.x'], guard.x);
});
