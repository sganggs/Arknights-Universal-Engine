// 深溟巢涌者 and 富营养的巢涌者 (docs/spec/foes.md 敌能-47). Atk 1000 makes one pulse −1000 arts HP and −50 神经.
// The guard's defence is 10000, so a normal physical hit is 50 and cannot be mistaken for the pulse.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, elements, buffs, KIND } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras, uncoveredAbilities, FOE_EXTRAS } from '../src/foes.js';

/** @typedef {import('@aue/sim').Unit} Unit */
/** @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const DEEP = 'enemy_1234_dsubrl';
const RICH = 'enemy_1234_dsubrl_2';
const NEST = { Buff: { one_minus_status_resistance: -0.5 }, EpDamage: { ep_damage_ratio: 0.05 } };
const BACK = { Buff: { one_minus_status_resistance: -0.5 }, EpDamage: { ep_damage_ratio: 0.1 } };
const TRACE = {
  Creep: { hp_ratio: 0.5 },
  Buff: { hp_ratio: 0.5, def: 3, max_hp: 0.5, block_volume: 1 },
  EpDamage: { ep_damage_ratio: 0 },
};
/** @type {[string, number, number][]} */
const GUARD = [['guard', 1, 2]];
const HURT = { id: 's', type: 'MANUAL', sp: 'hurt', cost: 99, init: 0, charges: 1, duration: 0, ammo: false, bb: {} };

/** @param {Record<string, Record<string, number>>} talents @param {any} [more] @returns {EnemyDef} */
function enemy(talents, more = {}) {
  return {
    name: 'e', maxHp: 1e6, atk: 1000, def: 0, res: 0, moveSpeed: 0, baseAttackTime: 1, rangeRadius: 1.6, applyWay: 'RANGED',
    talents, ...more,
  };
}

/** @param {string} key @param {EnemyDef} def */
const gaps = (key, def) => uncoveredAbilities([withFoeExtras(key, def)]);
/** @param {Unit} u */
const san = (u) => elements.epOf(u, 'SANITY');
/** @param {Unit} e */
const clock = (e) => e.ab['EpDamage.n'] ?? 0;

/** @param {any} o */
function bodyOf(o) {
  return { cost: 0, maxHp: 1e6, atk: 0, def: o.def ?? 10000, res: o.res ?? 0, maxEp: 1000 };
}

/** Our device, on the road one tile from where the enemy is stood. @param {any} c */
function useDevice(c) {
  c.devices = {
    box: { name: 'box', maxHp: 1e6, atk: 0, def: 0, res: 0, blockCnt: 0, baseAttackTime: 1, aspd: 100, tauntLevel: 0, massLevel: 0, talentBb: {} },
  };
  c.level.predefines = [{ alias: 'box#1', key: 'box', hidden: false, row: 1, col: 1, dir: 'UP' }];
}

/** Stand the enemies: the nest one on the guard's tile, a neutral one tile over. Root keeps them there. @param {any} w */
function pin(w) {
  for (const e of w.units) if (e.kind === KIND.ENEMY) {
    Object.assign(e, e.base.neutral ? { x: 3, y: 1 } : { x: 2, y: 1 }, { path: [], pt: 0 });
    status.applyStatus(e, 'root', {});
  }
}

/**
 * Spawn `key`, stand it, and deploy `o.ops` on the next step. Extras merge unless `raw`.
 * @param {string} key @param {any} [o]
 */
function stand(key, o = {}) {
  const c = /** @type {any} */ (tinyContent());
  const def = enemy(o.talents ?? NEST, o.more);
  c.enemies = { [key]: o.raw ? def : withFoeExtras(key, def) };
  const spawns = [spawnAt(0, key)];
  if (o.neutral) {
    c.enemies.neutral = { name: 'neutral', maxHp: 1e6, atk: 0, def: 0, res: 0, moveSpeed: 0, neutral: true };
    spawns.push(spawnAt(0, 'neutral'));
  }
  c.behaviors = skeletonContent.behaviors;
  if (o.device) useDevice(c);
  c.level.waves = [oneWave(spawns)];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 8 };
  const body = bodyOf(o);
  Object.assign(c.operators.guard, body);
  Object.assign(c.operators.sniper, body, { name: 'sniper' });
  if (o.skill) c.operators.guard.skill = o.skill;
  c.operators.far = { ...c.operators.guard, name: 'far' };
  c.operators.s2 = { ...c.operators.sniper, name: 's2' };
  c.operators.fly = { ...c.operators.sniper, name: 'fly', motion: 'FLY' };
  c.operators.lift = { ...c.operators.sniper, name: 'lift' };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  pin(w);
  const ops = o.ops ?? [];
  if (ops.length) step(w, c, ops.map((/** @type {[string, number, number]} */ [id, row, col]) => [0, { type: 'deploy', op: id, row, col, dir: 0 }]));
  return {
    c, w, e: /** @type {Unit} */ (w.units.find((u) => u.key === key)),
    ops: w.units.filter((u) => u.kind === KIND.OPERATOR),
    dev: w.units.find((u) => u.kind === KIND.DEVICE),
  };
}

/** Steps until the world frame is `frame`, and the events of those steps. @param {any} box @param {number} frame */
function play(box, frame) {
  /** @type {any[]} */
  const ev = [];
  while (box.w.frame < frame) for (const e of step(box.w, box.c)) ev.push(e);
  return ev;
}

test('[敌能-47] the two nest enemies are complete only with their markers; a ratio plus el is still 敌能-38\'s gap', () => {
  const deep = withFoeExtras(DEEP, enemy(NEST));
  const rich = withFoeExtras(RICH, enemy(NEST));
  assert.deepEqual(deep.talents?.EpDamage, { ep_damage_ratio: 0.05, pulse: 1, form: 1 });
  assert.deepEqual(deep.talents?.Buff, { one_minus_status_resistance: -0.5, form: 1 });
  assert.deepEqual(rich.talents?.EpDamage, { ep_damage_ratio: 0.05, pulse: 1, form: 2 });
  assert.deepEqual(rich.talents?.Buff, { one_minus_status_resistance: -0.5, form: 2 });
  assert.deepEqual(gaps(DEEP, enemy(NEST)), []);
  assert.deepEqual(gaps(RICH, enemy(NEST)), []);
  assert.deepEqual(gaps('enemy_1230_bare', enemy({ EpDamage: { ep_damage_ratio: 0.8, el: 2 } })), ['EpDamage']);
});

test('[敌能-47] [关卡-2] 退行的巢涌者 and the 引痕者 shapes stay uncovered and do not pulse', () => {
  assert.equal(FOE_EXTRAS.enemy_1234_dsubrl_4, undefined);
  assert.deepEqual(gaps('enemy_1234_dsubrl_4', enemy(BACK)), ['Buff', 'EpDamage']);
  for (const key of ['enemy_1232_dssalr', 'enemy_1232_dssalr_2', 'enemy_1232_dssalr_4']) {
    assert.deepEqual(gaps(key, enemy(TRACE)), ['Creep', 'Buff', 'EpDamage'], key);
  }
  const back = stand('enemy_1234_dsubrl_4', { talents: BACK, raw: true, ops: GUARD });
  const trace = stand('enemy_1232_dssalr', { talents: TRACE, raw: true, ops: GUARD });
  const ev = play(back, 40);
  play(trace, 40);
  assert.equal(clock(back.e), 0);
  assert.equal(clock(trace.e), 0);
  assert.equal(san(back.ops[0]), 1000);
  assert.equal(san(trace.ops[0]), 1000);
  assert.equal(attrs.statsOf(back.e).statusRes, 1);
  assert.equal(back.e.buffs.some((b) => b.key === 'nestUnslowed'), false);
  assert.ok(ev.some((x) => x.type === 'hit' && x.id === back.e.id));
});

test('[敌能-38] [敌能-47] an on-hit EpDamage keeps attacking and does not take the pulse', () => {
  const ratio = 'attack@ep_damage_ratio';
  const box = stand('enemy_1305_mhslim', {
    talents: { EpDamage: { [ratio]: 1 } }, ops: GUARD, more: { dmgType: 'arts', applyWay: 'RANGED', rangeRadius: 1.8 },
  });
  assert.deepEqual(FOE_EXTRAS.enemy_1305_mhslim.talents?.EpDamage, { el: 3 });
  const ev = play(box, 40);
  assert.equal(box.e.buffs.some((b) => b.key === 'nestStill'), false);
  assert.equal(!!attrs.statsOf(box.e).flags.noAttack, false);
  assert.equal(san(box.ops[0]), 1000);
  assert.ok(ev.some((x) => x.type === 'hit' && x.id === box.e.id));
});

test('[敌能-47] the pulse lands at frames 30 and 60: 100% arts, 5% 神经, nothing before', () => {
  for (const key of [DEEP, RICH]) {
    const box = stand(key, { ops: GUARD });
    const op = box.ops[0];
    const ep0 = san(op);
    play(box, 29);
    assert.equal(op.hp, 1e6, key);
    assert.equal(san(op), ep0, key);
    play(box, 30);
    assert.equal(op.hp, 1e6 - 1000, key);
    assert.equal(san(op), ep0 - 50, key);
    assert.equal(clock(box.e), 0, key);
    play(box, 59);
    assert.equal(op.hp, 1e6 - 1000, key);
    play(box, 60);
    assert.equal(op.hp, 1e6 - 2000, key);
    assert.equal(san(op), ep0 - 100, key);
  }
});

test('[敌能-47] arts damage is reduced by res; the neural amount is not', () => {
  for (const key of [DEEP, RICH]) {
    const box = stand(key, { ops: GUARD, res: 50 });
    play(box, 30);
    assert.equal(box.ops[0].hp, 1e6 - 500, key);
    assert.equal(san(box.ops[0]), 950, key);
  }
});

test('[敌能-47] 晕眩 does not stop the pulse', () => {
  const box = stand(DEEP, { ops: GUARD });
  status.applyStatus(box.e, 'stun', { seconds: 30 });
  play(box, 30);
  assert.equal(box.ops[0].hp, 1e6 - 1000);
  assert.equal(san(box.ops[0]), 950);
  assert.equal(clock(box.e), 0);
});

test('[敌能-47] operators, summons and our devices in range are hit; neutrals, camouflage, flying, liftoff and the far tile are not', () => {
  const box = stand(DEEP, {
    ops: [['guard', 1, 2], ['far', 1, 4], ['sniper', 0, 3], ['s2', 0, 2], ['fly', 2, 2], ['lift', 2, 3]],
    device: true, neutral: true,
  });
  /** @param {number} x @param {number} y */
  const at = (x, y) => box.w.units.find((u) => u.x === x && u.y === y && u.kind !== KIND.ENEMY);
  const summon = at(3, 0);
  const camou = at(2, 0);
  const lift = at(3, 2);
  assert.ok(summon);
  assert.ok(camou);
  assert.ok(lift);
  assert.ok(box.dev);
  summon.summoner = 1;
  buffs.addBuff(camou, buffs.makeBuff({ key: 'hide', flags: { camou: true } }));
  buffs.addBuff(lift, buffs.makeBuff({ key: 'up', flags: { liftoff: true } }));
  play(box, 30);
  /** @param {Unit} u */
  const fell = (u) => u.hp === 1e6 - 1000 && san(u) === 950;
  /** @param {Unit} u */
  const held = (u) => u.hp === 1e6 && san(u) === 1000;
  assert.equal(fell(/** @type {Unit} */ (at(2, 1))), true);
  assert.equal(fell(/** @type {Unit} */ (summon)), true);
  assert.equal(fell(/** @type {Unit} */ (box.dev)), true);
  assert.equal(held(/** @type {Unit} */ (at(4, 1))), true);
  assert.equal(held(/** @type {Unit} */ (camou)), true);
  assert.equal(held(/** @type {Unit} */ (at(2, 2))), true);
  assert.equal(held(/** @type {Unit} */ (lift)), true);
  const neutral = box.w.units.find((u) => u.base.neutral);
  assert.ok(neutral);
  assert.equal(held(/** @type {Unit} */ (neutral)), true);
});

test('[敌能-47] 深溟 still deals 神经 through a shield; 富营养 deals it only when the hit takes HP', () => {
  /** @param {string} key */
  const absorbed = (key) => {
    const box = stand(key, { ops: GUARD });
    const op = box.ops[0];
    buffs.addBuff(op, buffs.makeBuff({ key: 'wall', shieldHits: 1 }));
    const ep0 = san(op);
    play(box, 30);
    return { hp: op.hp, ep: san(op), ep0 };
  };
  const deep = absorbed(DEEP);
  assert.equal(deep.hp, 1e6);
  assert.equal(deep.ep, deep.ep0 - 50);
  const rich = absorbed(RICH);
  assert.equal(rich.hp, 1e6);
  assert.equal(rich.ep, rich.ep0);
});

test('[敌能-47] each pulse counts once for 受击回复, and nothing counts before it', () => {
  for (const key of [DEEP, RICH]) {
    const box = stand(key, { ops: GUARD, skill: HURT });
    const op = box.ops[0];
    const early = play(box, 29);
    assert.equal(op.skill?.sp, 0, key);
    assert.equal(early.some((x) => x.type === 'hit' && x.id === box.e.id), false, key);
    play(box, 30);
    assert.equal(op.skill?.sp, 1, key);
    play(box, 60);
    assert.equal(op.skill?.sp, 2, key);
  }
});

test('[敌能-47] the talents are not silenced: the pulse keeps time, 不攻击 and 抵抗 stay', () => {
  const box = stand(DEEP, { ops: GUARD });
  const { e, ops: [op] } = box;
  status.applyStatus(e, 'silence');
  const ev = play(box, 29);
  assert.equal(ev.some((x) => x.type === 'hit' && x.id === e.id), false);
  assert.equal(attrs.statsOf(e).flags.noAttack, true);
  assert.equal(attrs.statsOf(e).statusRes, 0.5);
  assert.equal(op.hp, 1e6);
  play(box, 30);
  assert.equal(op.hp, 1e6 - 1000);
  assert.equal(san(op), 950);
  assert.equal(clock(e), 0);
});

test('[敌能-47] 深溟 holds 抵抗, so 麻痹 decays; 富营养 has the same 状态抵抗 and is not 抵抗', () => {
  const named = stand(DEEP);
  const plain = stand(RICH);
  assert.equal(attrs.statsOf(named.e).statusRes, 0.5);
  assert.equal(attrs.statsOf(plain.e).statusRes, 0.5);
  assert.equal(named.e.buffs.some((b) => b.key === 'buffres'), true);
  assert.equal(plain.e.buffs.some((b) => b.key === 'buffres'), false);
  assert.equal(plain.e.buffs.some((b) => b.key === 'nestRes'), true);
  assert.equal(named.e.buffs.find((b) => b.key === 'buffres')?.value, 0.5);
  status.applyStatus(named.e, 'palsy', { stacks: 3 });
  status.applyStatus(plain.e, 'palsy', { stacks: 3 });
  step(named.w, named.c);
  step(plain.w, plain.c);
  const pn = named.e.buffs.find((b) => b.key === 'palsy');
  const pp = plain.e.buffs.find((b) => b.key === 'palsy');
  assert.equal(pn?.n, 2);
  assert.equal(pp?.n, 0);
  status.applyStatus(named.e, 'silence');
  step(named.w, named.c);
  step(named.w, named.c);
  assert.equal(pn?.n, 6, 'silence does not take 抵抗 away');
  assert.equal(named.e.buffs.some((b) => b.key === 'buffres'), true);
  step(plain.w, plain.c);
  assert.equal(pp?.n, 0);
});

test('[敌能-47] a 3s stun lasts 45 frames on both, at half the status resistance', () => {
  for (const key of [DEEP, RICH]) {
    const box = stand(key);
    status.applyStatus(box.e, 'stun', { seconds: 3 });
    assert.equal(box.e.buffs.find((b) => b.key === 'stun')?.left, 90, key);
    play(box, box.w.frame + 44);
    assert.equal(box.e.buffs.some((b) => b.key === 'stun'), true, key);
    step(box.w, box.c);
    assert.equal(box.e.buffs.some((b) => b.key === 'stun'), false, key);
  }
});

test('[敌能-47] [状态-7] 停顿免疫: 停顿 does not take hold, so nothing sees it, and silence does not lift it', () => {
  for (const key of [DEEP, RICH]) {
    const box = stand(key, { more: { moveSpeed: 1 } });
    const e = box.e;
    assert.equal(attrs.statsOf(e).flags['immune:sluggish'], true, key);
    status.applyStatus(e, 'sluggish', { seconds: 10 });
    step(box.w, box.c);
    assert.equal(e.buffs.some((b) => b.key === 'sluggish'), false, key);
    assert.equal(attrs.statsOf(e).moveSpeed, 1, key);
    status.applyStatus(e, 'silence');
    status.applyStatus(e, 'sluggish', { seconds: 10 });
    step(box.w, box.c);
    assert.equal(e.buffs.some((b) => b.key === 'sluggish'), false, key);
    assert.equal(attrs.statsOf(e).moveSpeed, 1, key);
  }
});

test('[敌能-47] 消失 pauses only 富营养; 深溟 still pulses on time', () => {
  const deep = stand(DEEP, { ops: GUARD });
  deep.e.hidden = true;
  play(deep, 29);
  assert.equal(deep.ops[0].hp, 1e6);
  play(deep, 30);
  assert.equal(deep.ops[0].hp, 1e6 - 1000);
  assert.equal(san(deep.ops[0]), 950);
  const rich = stand(RICH, { ops: GUARD });
  rich.e.hidden = true;
  play(rich, 30);
  assert.equal(clock(rich.e), 2);
  assert.equal(rich.ops[0].hp, 1e6);
  assert.equal(san(rich.ops[0]), 1000);
  rich.e.hidden = false;
  play(rich, 57);
  assert.equal(clock(rich.e), 29);
  assert.equal(rich.ops[0].hp, 1e6);
  play(rich, 58);
  assert.equal(rich.ops[0].hp, 1e6 - 1000);
  assert.equal(san(rich.ops[0]), 950);
  assert.equal(clock(rich.e), 0);
});
