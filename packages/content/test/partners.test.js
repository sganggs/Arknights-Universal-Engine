// 深池伙友卫队 and 深池伙友影刃 (docs/spec/foes.md 敌能-126) on the tiny map. No extracted level has them, so the four
// records are built here from enemy_database (ArknightsGameData 17759cc8, level 0); FOE_EXTRAS adds the pages' 1.4
// (`partner`) and the 卫队's idle `Flame` (`idle`). 深池焚毁者's `Flame` is that record's skill blackboard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, buffs, KIND } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras, uncoveredAbilities, foeBehaviors, FOE_EXTRAS } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const GUARD = 'enemy_1174_duholy', GUARD_2 = 'enemy_1174_duholy_2', BLADE = 'enemy_1175_dushdo', BLADE_2 = 'enemy_1175_dushdo_2';

/** The 卫队's skill, the same on both. @returns {NonNullable<EnemyDef['skills']>[number]} */
const flame = () => ({
  key: 'Flame', initCooldown: 0, cooldown: 0, sp: 0,
  bb: { 'duspfr_flame[cd].duration': 7, 'duspfr_flame[cd].cooldown': 10, atk_scale: 0.2, ep_damage_ratio: 1, hit_interval: 0.5 },
});

/** 深池伙友卫队 / 卫队精英. @param {string} name @param {number} maxHp @param {number} atk @param {number} def @returns {EnemyDef} */
const guard = (name, maxHp, atk, def) => ({
  name, maxHp, atk, def, res: 0, moveSpeed: 0.8, baseAttackTime: 4, rangeRadius: 1.4, applyWay: 'MELEE', motion: 'WALK', massLevel: 5, tauntLevel: 1,
  levelType: 'ELITE', talents: { traitAbility: { range_radius: 1.1, taunt_level: 0, attack_speed: -30 }, refracting: { magic_resistance: 70 } }, skills: [flame()],
});

/** 深池伙友影刃 / 影刃精英. @param {string} name @param {number} maxHp @param {number} atk @param {number} def @param {number} bat @returns {EnemyDef} */
const blade = (name, maxHp, atk, def, bat) => ({
  name, maxHp, atk, def, res: 0, moveSpeed: 0.8, baseAttackTime: 2.1, rangeRadius: 1.4, applyWay: 'MELEE', motion: 'WALK', massLevel: 2,
  levelType: 'ELITE', dmgType: 'arts', talents: { traitAbility: { base_attack_time: bat } }, skills: [],
});

/** @type {Record<string, EnemyDef>} */
const RAW = {
  [GUARD]: guard('深池伙友卫队', 15000, 900, 900),
  [GUARD_2]: guard('深池伙友卫队精英', 20000, 1100, 1000),
  [BLADE]: blade('深池伙友影刃', 12000, 400, 350, -1.2),
  [BLADE_2]: blade('深池伙友影刃精英', 15000, 580, 550, -1.3),
};

/** 深池焚毁者 / 焚毁者队长's `Flame` (17759cc8): another shape of the name. @param {string} name @returns {EnemyDef} */
const burner = (name) => ({
  name, maxHp: 100, atk: 100, def: 0, res: 0, moveSpeed: 1,
  skills: [{
    key: 'Flame', initCooldown: 0, cooldown: 0, sp: 0,
    bb: { 'duspfr_flame[cd].duration': 10.6, 'duspfr_flame[cd].cooldown': 10, atk_scale: 0.12, ep_damage_ratio: 0.06, hit_interval: 0.5, 'duspfr_flame[cd].interval': 6 },
  }],
});

/** The arena's records: the four, a neutral unit, and a `traitAbility` with `partner` that is neither shape. @type {Record<string, EnemyDef>} */
const ENEMIES = {
  ...RAW,
  neutral: { name: '中立', maxHp: 1000, atk: 0, def: 0, res: 0, moveSpeed: 1, neutral: true },
  odd: { ...RAW[BLADE], name: 'odd', talents: { traitAbility: { base_attack_time: -1.2, partner: 1.4, extra: 1 } } },
};

/**
 * The tiny map: each foe [key, x, y] spawns and is rooted at (x, y); then each operator [key, row, col] is deployed and
 * held from attacking. `bird` is a flying sniper, `far` a second guard.
 * @param {[string, number, number][]} foes @param {[string, number, number][]} [ops]
 */
function arena(foes, ops = []) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = Object.fromEntries(Object.entries(ENEMIES).map(([k, e]) => [k, withFoeExtras(k, e)]));
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave(foes.map(([k]) => spawnAt(0, k)))];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 9 };
  for (const op of Object.values(c.operators)) Object.assign(op, { cost: 0, maxHp: 1e7, atk: 0 });
  c.operators.bird = { ...c.operators.sniper, name: 'bird', motion: 'FLY' };
  c.operators.far = { ...c.operators.guard, name: 'far' };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const es = w.units.filter((u) => u.kind === KIND.ENEMY);
  es.forEach((e, i) => {
    Object.assign(e, { x: foes[i][1], y: foes[i][2], path: [], pt: 0 });
    status.applyStatus(e, 'root', {});
  });
  if (ops.length) step(w, c, ops.map(([op, row, col]) => [0, { type: 'deploy', op, row, col, dir: 0 }]));
  const us = ops.map(([op]) => /** @type {Unit} */ (w.units.find((u) => u.key === op)));
  for (const u of us) flag(u, 'hold', 'noAttack');
  return { c, w, es, us };
}

/** Runs n frames. @param {World} w @param {any} c @param {number} n */
function run(w, c, n) {
  for (let i = 0; i < n; i++) step(w, c);
}

const S = attrs.statsOf;
/** @param {Unit} u @param {string} key @param {string} name */
const flag = (u, key, name) => { buffs.addBuff(u, buffs.makeBuff({ key, flags: { [name]: true } })); };
/** @param {Unit} u @param {string} key */
const count = (u, key) => u.buffs.filter((b) => b.key === key).length;
/** @param {number} got @param {number} want */
const near = (got, want) => Math.abs(got - want) < 1e-9;

/** The frames of `e`'s hits within n frames. @param {World} w @param {any} c @param {Unit} e @param {number} n */
function hitFrames(w, c, e, n) {
  /** @type {number[]} */
  const out = [];
  for (let i = 0; i < n; i++) for (const ev of step(w, c)) if (ev.type === 'hit' && ev.id === e.id) out.push(w.frame);
  return out;
}

test('[敌能-126] [关卡-2] the four take the pages\' 1.4 and the two 卫队 an idle Flame; without them, and 深池焚毁者\'s Flame, stay uncovered', () => {
  for (const key of [GUARD, GUARD_2]) {
    const merged = withFoeExtras(key, RAW[key]);
    assert.deepEqual(merged.talents?.traitAbility, { range_radius: 1.1, taunt_level: 0, attack_speed: -30, partner: 1.4 }, key);
    assert.equal(merged.skills?.[0].bb.idle, 1, key);
    assert.deepEqual(uncoveredAbilities([merged]), [], key);
    assert.deepEqual(uncoveredAbilities([RAW[key]]), ['traitAbility', 'Flame'], key);
  }
  for (const [key, bat] of /** @type {[string, number][]} */ ([[BLADE, -1.2], [BLADE_2, -1.3]])) {
    const merged = withFoeExtras(key, RAW[key]);
    assert.deepEqual(merged.talents?.traitAbility, { base_attack_time: bat, partner: 1.4 }, key);
    assert.deepEqual(uncoveredAbilities([merged]), [], key);
    assert.deepEqual(uncoveredAbilities([RAW[key]]), ['traitAbility'], key);
  }
  for (const key of ['enemy_1173_duspfr', 'enemy_1173_duspfr_2']) {
    assert.equal(FOE_EXTRAS[key], undefined, key);
    assert.deepEqual(uncoveredAbilities([withFoeExtras(key, burner(key))]), ['Flame'], key);
  }
  assert.deepEqual(Object.keys(foeBehaviors.Flame), [], 'covered, and does nothing');
  assert.deepEqual(uncoveredAbilities([ENEMIES.odd]), [], 'a marked blackboard of neither shape is covered and does nothing');
});

test('[敌能-126] 影刃: a 卫队 of either rank within 1.4 takes its attack interval to 0.9 s, the 精英\'s to 0.8 s; 1.5 away it is 2.1 s', () => {
  for (const [b, g, want] of /** @type {[string, string, number][]} */ ([[BLADE, GUARD, 0.9], [BLADE, GUARD_2, 0.9], [BLADE_2, GUARD, 0.8], [BLADE_2, GUARD_2, 0.8]])) {
    const { c, w, es: [e, partner] } = arena([[b, 2, 1], [g, 3.4, 1]]);
    run(w, c, 3);
    assert.ok(near(S(e).bat, want), `${b} beside ${g}: ${S(e).bat}`);
    assert.equal(count(e, 'partnerHaste'), 1);
    assert.equal(S(partner).bat, 4, 'the 卫队 keeps its own interval');
    partner.x = 3.5;
    run(w, c, 3);
    assert.equal(S(e).bat, 2.1, `${b} with ${g} 1.5 away`);
    assert.equal(count(e, 'partnerHaste'), 0);
  }
});

test('[敌能-126] another of the same kind is no partner, two partners give one effect, and a marked blackboard of neither shape does nothing', () => {
  const pair = arena([[BLADE, 2, 1], [BLADE_2, 3, 1]]);
  run(pair.w, pair.c, 3);
  assert.deepEqual(pair.es.map((e) => S(e).bat), [2.1, 2.1]);
  const two = arena([[BLADE, 2, 1], [GUARD, 3, 1], [GUARD_2, 1, 1]]);
  run(two.w, two.c, 3);
  assert.ok(near(S(two.es[0]).bat, 0.9));
  assert.equal(count(two.es[0], 'partnerHaste'), 1);
  const blades = arena([[GUARD, 2, 1], [BLADE, 1, 1], [BLADE_2, 3, 1]], [['sniper', 0, 2]]);
  run(blades.w, blades.c, 3);
  assert.equal(S(blades.us[0]).aspd, 70, 'two 影刃 beside one 卫队: −30 once');
  assert.equal(count(blades.us[0], 'partnerField'), 1);
  const odd = arena([['odd', 2, 1], [GUARD, 3, 1]], [['guard', 1, 4]]);
  run(odd.w, odd.c, 3);
  assert.equal(S(odd.es[0]).bat, 2.1);
  assert.equal(S(odd.us[0]).aspd, 100, 'nor does the 卫队 see a partner in it');
});

test('[敌能-126] 影刃: the shorter interval paces its attacks on the unit blocking it — every 27 frames beside a 卫队, every 63 alone', () => {
  const together = arena([[BLADE, 2, 1], [GUARD, 3.4, 1]], [['guard', 1, 2]]);
  assert.equal(together.es[0].blockedBy, together.us[0].id);
  const fast = hitFrames(together.w, together.c, together.es[0], 120);
  assert.ok(fast.length >= 4, `${fast.length} hits`);
  assert.deepEqual(fast.slice(1).map((f, i) => f - fast[i]), fast.slice(1).map(() => 27));
  const alone = arena([[BLADE, 2, 1]], [['guard', 1, 2]]);
  const slow = hitFrames(alone.w, alone.c, alone.es[0], 200);
  assert.ok(slow.length >= 3, `${slow.length} hits`);
  assert.deepEqual(slow.slice(1).map((f, i) => f - slow[i]), slow.slice(1).map(() => 63));
});

test('[敌能-126] 卫队: with a 影刃 within 1.4, ours within 1.1 have attack speed −30 (直接加算), flyers too; not 1.2 away, not neutral units, not enemies', () => {
  const { c, w, es: [g, b, neutral], us: [sniper, bird, guardOp, far] } = arena(
    [[GUARD, 2, 1], [BLADE, 1, 1], ['neutral', 2, 1.5]],
    [['sniper', 0, 2], ['bird', 2, 2], ['guard', 1, 3], ['far', 1, 4]]);
  run(w, c, 3);
  for (const u of [sniper, bird, guardOp]) assert.equal(S(u).aspd, 70, u.key);
  assert.equal(guardOp.buffs.find((x) => x.key === 'partnerField')?.mods.aspd, -30);
  assert.equal(S(far).aspd, 100, '2 away');
  assert.equal(S(neutral).aspd, 100);
  assert.equal(count(neutral, 'partnerField'), 0);
  assert.deepEqual([S(g).aspd, S(b).aspd], [100, 100]);
  g.x = 1.8;
  run(w, c, 3);
  assert.equal(S(guardOp).aspd, 100, '1.2 away');
  assert.deepEqual([S(sniper).aspd, S(bird).aspd], [70, 70]);
  b.x = 0.3;
  run(w, c, 3);
  assert.deepEqual([S(sniper).aspd, S(bird).aspd, S(guardOp).aspd], [100, 100, 100], 'the 影刃 1.5 away');
});

test('[敌能-126] 卫队\'s field: 迷彩 stays in, 隐匿 and 起飞 leave it; silence on either of the pair stops neither effect', () => {
  const { c, w, es: [g, b], us: [sniper, bird, guardOp] } = arena(
    [[GUARD, 2, 1], [BLADE, 1, 1]], [['sniper', 0, 2], ['bird', 2, 2], ['guard', 1, 3]]);
  run(w, c, 3);
  flag(guardOp, 'camo', 'camou');
  run(w, c, 3);
  assert.equal(S(guardOp).aspd, 70, '迷彩');
  flag(sniper, 'cloak', 'stealth');
  run(w, c, 3);
  assert.equal(S(sniper).aspd, 100, '隐匿');
  flag(guardOp, 'lift', 'liftoff');
  run(w, c, 3);
  assert.equal(S(guardOp).aspd, 100, '起飞');
  status.applyStatus(g, 'silence', {});
  status.applyStatus(b, 'silence', {});
  run(w, c, 3);
  assert.equal(S(g).flags.silence, true);
  assert.equal(S(g).res, 0, '折射 is silenced');
  assert.equal(S(bird).aspd, 70);
  assert.ok(near(S(b).bat, 0.9));
});

test('[敌能-126] 卫队: a 影刃 exactly 1.4 away turns its field on (the partner radius, not range_radius); 1.5 away it is off', () => {
  const { c, w, es: [, b], us: [op] } = arena([[GUARD, 3.4, 1], [BLADE, 2, 1]], [['guard', 1, 4]]);
  run(w, c, 3);
  assert.equal(S(op).aspd, 70, '1.4 away');
  b.x = 1.9;
  run(w, c, 3);
  assert.equal(S(op).aspd, 100, '1.5 away');
});

test('[敌能-126] 卫队\'s field: 无法选中, 无敌 and 沉睡 units of ours are left out', () => {
  const { c, w, us } = arena([[GUARD, 2, 1], [BLADE, 1, 1]], [['sniper', 0, 2], ['bird', 2, 2], ['guard', 1, 3]]);
  const [sniper, bird, guardOp] = us;
  run(w, c, 3);
  assert.deepEqual(us.map((u) => S(u).aspd), [70, 70, 70]);
  flag(sniper, 'untarget', 'untargetable');
  status.applyStatus(bird, 'invincible', {});
  status.applyStatus(guardOp, 'sleep', {});
  run(w, c, 3);
  assert.deepEqual(us.map((u) => S(u).aspd), [100, 100, 100], '无法选中, 无敌, 沉睡');
});

test('[敌能-126] stun, freeze and sleep on the pair stop neither effect', () => {
  const { c, w, es: [g, b], us: [op] } = arena([[GUARD, 2, 1], [BLADE, 1, 1]], [['guard', 1, 3]]);
  status.applyStatus(g, 'stun', {});
  status.applyStatus(b, 'freeze', {});
  run(w, c, 3);
  assert.deepEqual([S(g).flags.stun, S(b).flags.freeze], [true, true]);
  assert.equal(S(op).aspd, 70, 'the field, its holder stunned');
  assert.ok(near(S(b).bat, 0.9), 'the haste, its holder frozen');
  status.applyStatus(g, 'sleep', {});
  status.applyStatus(b, 'sleep', {});
  run(w, c, 3);
  assert.deepEqual([S(g).flags.sleep, S(b).flags.sleep], [true, true]);
  assert.equal(S(op).aspd, 70, 'the field, both asleep');
  assert.ok(near(S(b).bat, 0.9), 'the haste, both asleep');
});

test('[敌能-126] two 卫队 give one −30; the field ends within two frames of the 影刃 knocked down, the haste once no 卫队 is left', () => {
  const { c, w, es: [, , b], us: [op] } = arena([[GUARD, 2, 1], [GUARD_2, 2, 1], [BLADE, 1, 1]], [['guard', 1, 3]]);
  run(w, c, 3);
  assert.equal(S(op).aspd, 70);
  assert.equal(count(op, 'partnerField'), 1);
  b.hp = 0;
  run(w, c, 1);
  assert.equal(S(op).aspd, 70, 'lent: it outlasts one frame');
  run(w, c, 2);
  assert.equal(S(op).aspd, 100);
  assert.equal(count(op, 'partnerField'), 0);
  const again = arena([[GUARD, 2, 1], [GUARD_2, 2, 1], [BLADE, 1, 1]]);
  const [k1, k2, bl] = again.es;
  run(again.w, again.c, 3);
  k1.hp = 0;
  run(again.w, again.c, 3);
  assert.ok(near(S(bl).bat, 0.9), 'the other 卫队 is still near');
  k2.hp = 0;
  run(again.w, again.c, 1);
  assert.ok(near(S(bl).bat, 0.9), 'lent: it outlasts one frame');
  run(again.w, again.c, 2);
  assert.equal(S(bl).bat, 2.1);
  assert.equal(count(bl, 'partnerHaste'), 0);
});

test('[敌能-126] a 隐匿 partner still counts, a disappeared one does not', () => {
  const { c, w, es: [, b], us: [op] } = arena([[GUARD, 2, 1], [BLADE, 1, 1]], [['guard', 1, 3]]);
  flag(b, 'hide', 'stealth');
  run(w, c, 3);
  assert.equal(S(op).aspd, 70);
  b.hidden = true;
  run(w, c, 3);
  assert.equal(S(op).aspd, 100);
});

test('[敌能-126] the 卫队 keeps its record\'s 嘲讽等级 1 — taunt_level 0 changes nothing — and its Flame does nothing', () => {
  const { c, w, es: [g], us: [sniper] } = arena([[GUARD, 2, 1], [BLADE, 1, 1]], [['sniper', 0, 2]]);
  /** @type {any[]} */
  const ev = [];
  for (let i = 0; i < 300; i++) ev.push(...step(w, c));
  assert.equal(S(g).taunt, 1);
  assert.equal(S(sniper).aspd, 70, 'the field is on');
  assert.equal(sniper.hp, sniper.maxHp);
  assert.equal(ev.filter((e) => e.id === g.id && (e.type === 'attack' || e.type === 'hit')).length, 0, 'no attack and no hit of its own');
});
