// `AtkUp` (docs/spec/foes.md 敌能-149): the shapes that count — 排球发球车 / 排球重扣车's, “复仇者”'s and 新硎's with their
// page markers — and the cars' layers. Each car stands on the tiny map's road (the level does not move it: it is never
// rooted, since 束缚 clears the layers) and shoots a sniper of no defence on the high ground.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, buffs, bus } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent, levelAt, levelContent, LEVELS, withFoeExtras } from '../src/index.js';
import { uncoveredAbilities, withoutIncomplete, foeBehaviors } from '../src/foes.js';
import { volleyBehaviors } from '../src/volley.js';
import { avengerBehaviors } from '../src/avenger.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */
/** @typedef {{ amount: number, attack: boolean, skill: boolean }} Hit */
/** @typedef {{ c: any, w: World, e: Unit, hits: Hit[], acts: number[] }} Box */

const SERVE = 'enemy_1261_dursho';
const DUNK = 'enemy_1261_dursho_2';
const REID = 'enemy_1539_reid';
const HONE = 'enemy_1207_sfji_2';
/** A neutral unit (合作-9) of no attack, an enemy-kind unit the cars may attack (敌人攻击-1). */
const NEUTRAL = Object.freeze({ name: 'neutral', maxHp: 1e9, atk: 0, def: 0, res: 0, moveSpeed: 1, neutral: true });
/** The sniper's deploy on the high ground at (row 0, col 2), within the cars' 2.5. */
const SNIPER = [[0, { type: 'deploy', op: 'sniper', row: 0, col: 2, dir: 0 }]];

/** 排球重扣车 as act1football_sub-1-1 gives it to the simulation: its extras merged, nothing left out. */
const dunk = () => /** @type {EnemyDef} */ (levelContent('act1football_sub-1-1', 'NORMAL').enemies[DUNK]);
/** 排球发球车 as act1multi_02's own record (that level's runes do not load yet), assembled the same way. */
const serve = () => withoutIncomplete(withFoeExtras(SERVE, /** @type {EnemyDef} */ (LEVELS.act1multi_02.enemies[SERVE])));

/** @param {Record<string, unknown>} talents @param {any[]} [skills] @returns {EnemyDef} */
const named = (talents, skills) => /** @type {EnemyDef} */ ({ name: 'e', maxHp: 100, atk: 100, def: 0, res: 0, moveSpeed: 1, talents, ...(skills ? { skills } : {}) });
/** Its layers: the stacks of its one `volleyAtk` buff, or 0. @param {Unit} u */
const layers = (u) => u.buffs.find((b) => b.key === 'volleyAtk')?.stacks ?? 0;
/** @param {Unit} u @param {string} key */
const has = (u, key) => u.buffs.some((b) => b.key === key);
/** @param {any[]} ev @param {Unit} e */
const attacked = (ev, e) => ev.some((x) => x.type === 'attack' && x.id === e.id);
/** @param {number} got @param {number} want @param {string} [msg] */
const near = (got, want, msg) => assert.ok(Math.abs(got - want) < 1e-9, `${msg ?? ''} ${got} ≠ ${want}`);

/**
 * A car on the road at (row 1, col 1), standing still (moveMultiplier 0); unless `sniper` is false, a sniper of no
 * defence and a billion HP deployed on the next frame. The hits it deals are logged with their flags, and the layers
 * right after each attack it starts (`acts`). With `neutral`, a neutral unit enters at the route's start, within its 2.5,
 * 0.2 s in (after the car is placed).
 * @param {EnemyDef} def @param {{ sniper?: boolean, key?: string, neutral?: boolean }} [o] @returns {Box}
 */
function car(def, o = {}) {
  const key = o.key ?? DUNK, c = /** @type {any} */ (tinyContent());
  c.enemies = { [key]: def, ...(o.neutral ? { neutral: NEUTRAL } : {}) };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, key), ...(o.neutral ? [spawnAt(0.2, 'neutral')] : [])])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, moveMultiplier: 0 };
  Object.assign(c.operators.sniper, { cost: 0, atk: 0, def: 0, maxHp: 1e9 });
  Object.assign(c.operators.guard, { cost: 0, atk: 0, maxHp: 1e9 });
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = /** @type {Unit} */ (w.units.find((u) => u.key === key));
  Object.assign(e, { x: 1, y: 1, path: [], pt: 0 });
  /** @type {Hit[]} */
  const hits = [];
  bus.on(w, 'hit', (k) => { if (k.credit === e) hits.push({ amount: k.dmg.amount, attack: k.dmg.isAttack === true, skill: k.dmg.isSkill === true }); });
  /** @type {Box} */
  const b = { c, w, e, hits, acts: [] };
  if (o.sniper !== false) frame(b, SNIPER);
  return b;
}

/** One frame; when the car started an attack in it, its layers right after. @param {Box} b @param {any[]} [cmds] */
function frame(b, cmds = []) {
  const ev = step(b.w, b.c, cmds);
  if (attacked(ev, b.e)) b.acts.push(layers(b.e));
  return ev;
}

/** The sniper. @param {Box} b */
const sniperOf = (b) => /** @type {Unit} */ (b.w.units.find((u) => u.key === 'sniper'));

/**
 * Steps until `n` more attacks of the car have started; the layers right after each of them.
 * @param {Box} b @param {number} n @returns {number[]}
 */
function more(b, n) {
  const from = b.acts.length;
  for (let f = 0; f < 4000 && b.acts.length < from + n; f++) frame(b);
  return b.acts.slice(from);
}

/** Steps until the car has dealt `n` hits in all. @param {Box} b @param {number} n */
function untilHits(b, n) {
  for (let f = 0; f < 4000 && b.hits.length < n; f++) frame(b);
  assert.equal(b.hits.length, n);
}

/**
 * What a shipped level says when it is assembled (关卡-2): its uncovered abilities (关卡-8), or why it is refused.
 * @param {string} id @param {'NORMAL' | 'FOUR_STAR'} d
 */
function loadOutcome(id, d) {
  try {
    return (levelAt(id, d).level.uncovered ?? []).join(',');
  } catch (err) {
    return String(err);
  }
}

/** The other users of the name, with their level-0 blackboards (enemy_database 17759cc8). @type {[string, Record<string, unknown>][]} */
const OTHERS = [
  ['enemy_10222_agtski', { atk: 600, def: 800, enemy_key: 'enemy_10223_agtrac' }],
  ['enemy_10222_agtski_2', { atk: 720, def: 1000, enemy_key: 'enemy_10223_agtrac_2' }],
  ['enemy_1194_krgmtr', { atk: 0.3 }], ['enemy_1194_krgmtr_2', { atk: 0.3 }], ['enemy_15006_dqkrgm', { atk: 0.3 }], ['enemy_1536_ncrmcr', { atk: 0.3 }],
  ['enemy_1235_dsbskr', { atk: 0.15, max_stack_cnt: 15, 'dsbskr_atk_reduce.interval': 0 }],
  ['enemy_1235_dsbskr_2', { atk: 0.1, max_stack_cnt: 15, 'dsbskr_atk_reduce.interval': 0.5 }],
  ['enemy_1235_dsbskr_4', { atk: 0.15, max_stack_cnt: 15, 'dsbskr_atk_reduce.interval': 0 }],
  ['enemy_15005_dqdsbs', { atk: 0.15, max_stack_cnt: 15, 'dsbskr_atk_reduce.interval': 0 }],
  ['enemy_15024_dqreid', { atk: 2.8, damage_resistance: 0.6 }],
  ['enemy_1525_blkswb', { 'enemy_blkswb_t_1.atk': 0.3, 'enemy_blkswb_t_1[reborn].atk': 0.5 }],
  ['enemy_6020_orang', { max_cnt: 20, atk: 0.25, buff_duration: 15 }],
];

test('[敌能-149] [关卡-2] AtkUp counts only as the cars\', 复仇者\'s or 新硎\'s, markers included; every other user, a text value or one key more or less, stays uncovered', () => {
  for (const [key, bb] of OTHERS) {
    const e = withFoeExtras(key, named({ AtkUp: bb }));
    assert.deepEqual([e.talents?.AtkUp, uncoveredAbilities([e])], [bb, ['AtkUp']], key);
    assert.equal(withoutIncomplete(e).talents?.AtkUp, undefined, `${key}: left out where it would load (关卡-8)`);
  }
  const rusalka = { key: 'AtkUp', initCooldown: 0, cooldown: 0, sp: 0, bb: { anim_duration: 11, max_stack_cnt: 40, atk: 0.07 } };
  for (const key of ['enemy_10209_mubag', 'enemy_10209_mubag_2']) assert.deepEqual(uncoveredAbilities([withFoeExtras(key, named({}, [rusalka]))]), ['AtkUp'], key);
  const reid = /** @type {EnemyDef} */ (LEVELS['act1multi_hard-02'].enemies[REID]);
  assert.deepEqual([withFoeExtras(REID, reid).talents?.AtkUp, uncoveredAbilities([withFoeExtras(REID, reid)])], [{ atk: 1.8, damage_resistance: 40, low: 1 }, []]);
  assert.deepEqual(uncoveredAbilities([reid]), ['AtkUp'], 'without its page marker it is “火与钢”\'s shape');
  const hone = withFoeExtras(HONE, named({ AtkUp: { atk: 0.8 } }));
  assert.deepEqual([hone.talents?.AtkUp, uncoveredAbilities([hone])], [{ atk: 0.8, blade: 1 }, []]);
  assert.deepEqual(uncoveredAbilities([named({ AtkUp: { atk: 0.8 } })]), ['AtkUp'], 'without its page marker it is 山雪鬼\'s shape');
  for (const [k, cars] of /** @type {[string, Record<string, any>][]} */ ([['act1multi_02', LEVELS.act1multi_02.enemies], ['act1football_sub-1-1', LEVELS['act1football_sub-1-1'].enemies]])) {
    const own = [SERVE, DUNK].filter((x) => Object.hasOwn(cars, x)).map((x) => withFoeExtras(x, cars[x]));
    assert.deepEqual([own.length, uncoveredAbilities(own)], [k === 'act1multi_02' ? 2 : 1, []], k);
  }
  const bad = [{ atk: '0.1', max_stack_cnt: 10 }, { atk: 0.1, max_stack_cnt: '10' }, { atk: 0.1 }, { max_stack_cnt: 10 }, { atk: 0.1, max_stack_cnt: 10, blade: 1 },
    { atk: 0.8, blade: '1' }, { atk: 0.8, low: 1 }, { atk: 1.8, damage_resistance: 0, blade: 1 }, { atk: 1.8, damage_resistance: '0', low: 1 }, {}];
  for (const bb of bad) assert.deepEqual(uncoveredAbilities([named({ AtkUp: bb })]), ['AtkUp'], JSON.stringify(bb));
  assert.equal(foeBehaviors.AtkUp, volleyBehaviors.AtkUp, 'one behaviour for the name');
  assert.equal(Object.hasOwn(avengerBehaviors, 'AtkUp'), false, 'no second, shadowed object left in avenger.js');
});

test('[敌能-149] [关卡-2] [关卡-8] the shipped levels: act1football_sub-1-1 keeps 排球重扣车\'s AtkUp, act1multi_02 is refused for its runes only, 复仇者 keeps its marker; AtkUp is in no level\'s uncovered list or refusal', () => {
  for (const d of /** @type {const} */ (['NORMAL', 'FOUR_STAR'])) {
    const lv = levelAt('act1football_sub-1-1', d);
    assert.deepEqual([lv.level.uncovered ?? [], lv.enemies[DUNK].talents?.AtkUp], [[], { atk: 0.15, max_stack_cnt: 10 }], d);
    assert.deepEqual(levelContent('act1football_sub-1-1', d).enemies[DUNK].talents?.AtkUp, { atk: 0.15, max_stack_cnt: 10 }, d);
    assert.throws(() => levelAt('act1multi_02', d), /^RangeError: level act1multi_02 at \w+: runes not supported yet: env_system_new$/);
    assert.deepEqual(levelContent('act1multi_hard-02', d).enemies[REID].talents?.AtkUp, { atk: 1.8, damage_resistance: 40, low: 1 }, d);
  }
  assert.deepEqual([SERVE, DUNK].map((k) => LEVELS.act1multi_02.enemies[k].talents.AtkUp), [{ atk: 0.1, max_stack_cnt: 10 }, { atk: 0.15, max_stack_cnt: 10 }]);
  for (const id of Object.keys(LEVELS)) {
    for (const d of /** @type {const} */ (['NORMAL', 'FOUR_STAR'])) {
      assert.doesNotMatch(loadOutcome(id, d), /AtkUp/, `${id} ${d}`);
    }
  }
});

test('[敌能-149] [属性-2] 排球重扣车: each attack it starts adds a layer first — 直接乘算 +15 % on its current ATK, summed — up to 10; one buff; its hits stay normal-attack hits', () => {
  const b = car(dunk(), { sniper: false });
  buffs.addBuff(b.e, buffs.makeBuff({ key: 'test', mods: { atkFlat: 50, atkPct: 0.2 } }));
  frame(b, SNIPER);
  more(b, 12 - b.acts.length);
  assert.deepEqual(b.acts, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10]);
  untilHits(b, 12);
  b.hits.forEach((h, i) => near(h.amount, (450 + 50) * (1 + 0.2 + 0.15 * Math.min(i + 1, 10)), `hit ${i + 1}`));
  assert.deepEqual([...new Set(b.hits.map((h) => `${h.attack}/${h.skill}`))], ['true/false']);
  const own = b.e.buffs.filter((x) => x.key === 'volleyAtk');
  assert.deepEqual(own.map((x) => [x.stacks, x.maxStacks, x.left, x.mods.atkPct]), [[10, 10, -1, 0.15]], 'one buff, no end');
  near(attrs.statsOf(b.e).atk, 500 * (1 + 0.2 + 1.5));
  near(sniperOf(b).maxHp - sniperOf(b).hp, b.hits.reduce((s, h) => s + h.amount, 0), 'no defence: the damage is the amount');
});

test('[敌能-149] the numbers are the blackboard\'s: 排球发球车\'s 10 % and 10 (act1multi_02\'s record), an inline car\'s 25 % and 3', () => {
  const b = car(serve(), { key: SERVE });
  more(b, 11 - b.acts.length);
  assert.deepEqual(b.acts, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10]);
  untilHits(b, 11);
  b.hits.forEach((h, i) => near(h.amount, 350 * (1 + 0.1 * Math.min(i + 1, 10)), `hit ${i + 1}`));
  const inline = car({ ...named({ AtkUp: { atk: 0.25, max_stack_cnt: 3 } }), atk: 200, applyWay: 'RANGED', rangeRadius: 2.5, baseAttackTime: 2, maxHp: 5000 });
  more(inline, 5 - inline.acts.length);
  assert.deepEqual(inline.acts, [1, 2, 3, 3, 3]);
  untilHits(inline, 5);
  assert.deepEqual(inline.hits.map((h) => h.amount), [250, 300, 350, 350, 350]);
});

/** The six states that clear the layers, by the status that gives each (状态-5); both kinds of 冻结. */
const CLEARING = ['stun', 'freeze', 'enemyFreeze', 'sleep', 'levitate', 'root', 'silence'];

test('[敌能-149] [状态-5] 晕眩, 冻结, 沉睡, 浮空, 束缚 and 沉默 take every layer by its next turn; no attack adds one while they last; after them the next adds one again', () => {
  for (const key of CLEARING) {
    const b = car(dunk());
    more(b, 3 - b.acts.length);
    untilHits(b, 3);
    assert.deepEqual(b.acts, [1, 2, 3], key);
    status.applyStatus(b.e, /** @type {any} */ (key), { seconds: 4.5 });
    frame(b);
    assert.deepEqual([has(b.e, key), layers(b.e), b.acts.length], [true, 0, 3], `${key}: gone at its next turn`);
    /** @type {number[]} */
    const during = [];
    /** @type {number[]} */
    const after = [];
    for (let f = 0; f < 2000 && after.length === 0; f++) {
      const n = b.acts.length;
      frame(b);
      if (b.acts.length > n) (has(b.e, key) ? during : after).push(layers(b.e));
    }
    const acts = key === 'root' || key === 'silence';
    assert.deepEqual([during.length > 0, during.every((n) => n === 0)], [acts, true], `${key}: ${during}`);
    assert.deepEqual(after, [1], key);
    untilHits(b, 3 + during.length + 1);
    assert.deepEqual(b.hits.slice(3).map((h) => h.amount), [...during.map(() => 450), 450 * 1.15], key);
  }
});

test('[敌能-149] [状态-7] [状态-9] only those six: 寒冷, 麻痹震颤, 停顿 and 静默 leave the layers, and so does a 晕眩 it is immune to', () => {
  for (const key of ['cold', 'palsyShake', 'sluggish', 'mute']) {
    const b = car(dunk());
    more(b, 3 - b.acts.length);
    status.applyStatus(b.e, /** @type {any} */ (key), { seconds: 1 });
    frame(b);
    assert.deepEqual([has(b.e, key), layers(b.e)], [true, 3], key);
    assert.deepEqual(more(b, 1), [4], key);
  }
  const immune = car({ ...dunk(), immune: ['stun'] });
  more(immune, 2 - immune.acts.length);
  status.applyStatus(immune.e, 'stun', { seconds: 3 });
  assert.deepEqual([has(immune.e, 'stun'), more(immune, 1)], [true, [3]], 'the stun is on it, not in effect');
});

test('[敌能-149] [敌人攻击-1] no target, no attack and no layer; an attack on a neutral unit, a dodged one and one that meets an invincible unit each added theirs', () => {
  const alone = car(dunk(), { sniper: false });
  for (let f = 0; f < 300; f++) frame(alone);
  assert.deepEqual([alone.acts, layers(alone.e)], [[], 0]);
  const neutral = car(dunk(), { sniper: false, neutral: true });
  more(neutral, 3 - neutral.acts.length);
  untilHits(neutral, 3);
  assert.deepEqual([neutral.acts, neutral.hits.map((h) => h.amount)], [[1, 2, 3], [450 * 1.15, 450 * 1.3, 450 * 1.45]], 'a neutral unit is a target like ours');
  for (const guard of /** @type {((s: Unit) => void)[]} */ ([
    (s) => { buffs.addBuff(s, buffs.makeBuff({ key: 'dodge', mods: { dodgePhys: 1 } })); },
    (s) => { status.applyStatus(s, 'invincible', {}); },
  ])) {
    const b = car(dunk(), { sniper: false });
    b.e.atkCd = 2;
    frame(b, SNIPER);
    const s = sniperOf(b);
    guard(s);
    more(b, 3);
    for (let f = 0; f < 30; f++) frame(b);
    assert.deepEqual([b.acts, s.hp], [[1, 2, 3], s.maxHp], 'every layer added; nothing got through');
  }
});

test('[敌能-149] [敌能-8] [敌能-44] 复仇者\'s and 新硎\'s AtkUp: still read as before (+180 % at half HP, +80 % with blades), and this behaviour adds nothing of its own', () => {
  const boss = car(levelContent('act1multi_hard-02', 'NORMAL').enemies[REID], { key: REID, sniper: false });
  frame(boss, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  for (let f = 0; f < 400; f++) frame(boss);
  const atk = attrs.statsOf(boss.e).atk;
  boss.e.hp = attrs.statsOf(boss.e).maxHp * 0.5;
  step(boss.w, boss.c);
  near(attrs.statsOf(boss.e).atk, atk * 2.8, '复仇者');
  assert.ok(boss.hits.length > 0, '复仇者 attacked the guard');
  const parent = { maxHp: 20000, atk: 100, def: 0, res: 0, moveSpeed: 0, baseAttackTime: 2.2, blockCnt: 1,
    talents: { DeadSpawn: { enemy_key: 'enemy_1208_msfji_2', cnt: 4, cnt_add: -1 }, AtkUp: { atk: 0.8 } } };
  const hone = car(withoutIncomplete(withFoeExtras(HONE, /** @type {any} */ ({ name: '新硎', ...parent }))), { key: HONE, sniper: false });
  near(attrs.statsOf(hone.e).atk, 180, '新硎 holding its blades');
  const shaped = car(withoutIncomplete(withFoeExtras('enemy_1194_krgmtr', /** @type {any} */ ({ name: '山雪鬼', ...parent }))), { key: 'enemy_1194_krgmtr', sniper: false });
  near(attrs.statsOf(shaped.e).atk, 100, 'the same shape with no marker is left out, so no blade bonus');
  frame(hone, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  for (let f = 0; f < 300; f++) frame(hone);
  assert.ok(hone.hits.length > 0, '新硎 attacked the guard');
  for (const u of [boss.e, hone.e]) {
    assert.deepEqual([has(u, 'volleyAtk'), Object.keys(u.ab).filter((k) => k.startsWith('AtkUp.'))], [false, []], u.key);
  }
});
