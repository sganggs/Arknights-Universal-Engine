// “遗弃者”'s layers (docs/spec/foes.md 敌能-138). It is in no extracted level, so its record is the enemy_database
// 17759cc8 level-0 row, and the other `atkup` shapes are that table's 22 other users. It stands rooted on the tiny
// map's road; the operators have no attack, no DEF and ten million HP, so a hit's damage is the ATK it was dealt at.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, buffs, damage, KIND } from '@aue/sim';
import { secondsToFrames } from '@aue/math';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras, uncoveredAbilities, FOE_EXTRAS, foeBehaviors } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */
/** @typedef {{ c: any, w: World, e: Unit }} Box */

const KEY = 'enemy_2005_axetro';
const STACK = Object.freeze({ atk: 0.07, attack_speed: 5, max_stack_cnt: 28 });
const CHECK = Object.freeze({ delay: 4 });
/** The layers' buff (敌能-138). */
const LAYERS = 'axetroStack';
const HP = 1e7;
/** The other users of `atkup`, with their blackboards (enemy_database 17759cc8). @type {[string, Record<string, number>][]} */
const OTHERS = [
  ['enemy_1025_reveng', { atk: 1 }], ['enemy_1025_reveng_2', { atk: 1.8 }], ['enemy_1059_buster', { atk_scale: 1.5 }],
  ['enemy_1059_buster_2', { atk_scale: 1.8 }], ['enemy_1064_snsbr', { atk_scale: 1.5 }], ['enemy_1065_snwolf', { atk_scale: 1.5 }],
  ['enemy_1065_snwolf_2', { atk_scale: 1.5 }], ['enemy_1066_snbow', { atk_scale: 1.5 }], ['enemy_1066_snbow_2', { atk_scale: 1.5 }],
  ['enemy_1069_icebrk', { atk_scale: 2.5 }], ['enemy_1069_icebrk_2', { atk_scale: 3 }], ['enemy_1113_empace', { atk: 1 }],
  ['enemy_1113_empace_2', { atk: 1 }], ['enemy_1129_spklr', { atk_scale: 1.8 }], ['enemy_1129_spklr_2', { atk_scale: 1.8 }],
  ['enemy_1193_krgbsk', { 'enemy_krgbsk_t[frozen].atk_scale': 1.6 }], ['enemy_1193_krgbsk_2', { 'enemy_krgbsk_t[frozen].atk_scale': 2 }],
  ['enemy_1500_skulsr', { atk: 0.5, hp_ratio: 0.5 }], ['enemy_15024_dqreid', { hp_ratio: 0.5 }], ['enemy_15082_dqklr', { atk_scale: 1.8 }],
  ['enemy_1539_reid', { hp_ratio: 0.5 }], ['enemy_5035_dqveng_2', { atk: 1.8 }],
];

/** The level-0 row (enemy_database 17759cc8). @param {Record<string, Record<string, number>>} [talents] @returns {EnemyDef} */
function axetro(talents) {
  return {
    name: '“遗弃者”', maxHp: 50000, atk: 500, def: 300, res: 30, moveSpeed: 0.6, baseAttackTime: 3, rangeRadius: 2.5,
    applyWay: 'ALL', motion: 'WALK', massLevel: 3, levelType: 'BOSS',
    talents: talents ?? { atkup: { ...STACK }, checker: { ...CHECK } },
  };
}

/**
 * 遗弃者 rooted on the road at column 2 with its attack held off, `ops` deployed in the next frame (a guard blocking it by
 * default). `more` joins its record; `raw` leaves out its extras; `tune` changes the content first.
 * @param {{ talents?: Record<string, Record<string, number>>, ops?: [string, number, number][], more?: Record<string, unknown>, raw?: boolean, tune?: (c: any) => void }} [o]
 * @returns {Box}
 */
function stand(o = {}) {
  const c = /** @type {any} */ (tinyContent()), def = { ...axetro(o.talents), ...o.more };
  c.enemies = { [KEY]: o.raw ? def : withFoeExtras(KEY, def) };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, KEY)])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 8 };
  for (const op of Object.values(c.operators)) Object.assign(op, { cost: 0, atk: 0, def: 0, res: 0, maxHp: HP });
  o.tune?.(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = /** @type {Unit} */ (w.units.find((u) => u.key === KEY));
  Object.assign(e, { x: 2, y: 1, path: [], pt: 0 });
  status.applyStatus(e, 'root', {});
  e.atkCd = 1000;
  const ops = o.ops ?? [['guard', 1, 2]];
  if (ops.length) step(w, c, ops.map(([op, row, col]) => [0, { type: 'deploy', op, row, col, dir: 0 }]));
  return { c, w, e };
}

/** @param {Box} box @param {string} key */
const unitOf = (box, key) => /** @type {Unit} */ (box.w.units.find((u) => u.key === key));
/** One attack now, then the next held off; the frame's events. @param {Box} box */
function strike(box) {
  box.e.atkCd = 0;
  const ev = step(box.w, box.c);
  box.e.atkCd = 1000;
  return ev;
}
/** n frames' events. @param {Box} box @param {number} n */
function run(box, n) {
  /** @type {any[]} */
  const out = [];
  for (let i = 0; i < n; i++) out.push(...step(box.w, box.c));
  return out;
}
/** Steps until frame `f` is the next to run. @param {Box} box @param {number} f */
function until(box, f) {
  while (box.w.frame < f) step(box.w, box.c);
}
/** Its hits in some events. @param {any[]} ev @param {Unit} e */
const hitsOf = (ev, e) => ev.filter((x) => x.type === 'hit' && x.id === e.id);
/** The layers it holds. @param {Unit} e */
const layers = (e) => e.buffs.filter((b) => b.key === LAYERS);
/** How many layers. @param {Unit} e */
const count = (e) => layers(e)[0]?.stacks ?? 0;
/** @param {number} got @param {number} want */
const near = (got, want) => Math.abs(got - want) < 1e-6;

test('[敌能-138] [关卡-2] 遗弃者\'s atkup and checker are covered in their exact shapes only; the other atkup shapes stay covered', () => {
  const raw = axetro(), merged = withFoeExtras(KEY, raw);
  assert.deepEqual(FOE_EXTRAS[KEY].talents, { noFly: {} });
  assert.deepEqual(merged.talents, { atkup: { ...STACK }, checker: { ...CHECK }, noFly: {} });
  assert.deepEqual(uncoveredAbilities([merged]), []);
  assert.deepEqual(uncoveredAbilities([raw]), []);
  const gaps = (/** @type {Record<string, unknown>} */ talents) => uncoveredAbilities([/** @type {any} */ ({ ...raw, talents })]);
  const partial = [{ atk: 0.07, attack_speed: 5 }, { atk: 0.07, max_stack_cnt: 28 }, { attack_speed: 5, max_stack_cnt: 28 },
    { ...STACK, hp_ratio: 0.5 }, { ...STACK, atk: '0.07' }, { ...STACK, max_stack_cnt: '28' }];
  for (const bb of partial) assert.deepEqual(gaps({ atkup: bb, checker: { ...CHECK } }), ['atkup'], JSON.stringify(bb));
  for (const bb of [{}, { delay: '4' }, { delay: 4, range_radius: 1 }, { duration: 4 }]) {
    assert.deepEqual(gaps({ atkup: { ...STACK }, checker: bb }), ['checker'], JSON.stringify(bb));
  }
  // 敌能-153: a bare `atkup {atk_scale}` counts only with its read page's marker — 狂徒, “盛怒” and “情绪失控” are another rule.
  const other = new Set(['enemy_1059_buster', 'enemy_1059_buster_2', 'enemy_1129_spklr', 'enemy_1129_spklr_2', 'enemy_15082_dqklr']);
  for (const [key, bb] of OTHERS) {
    const merged = withFoeExtras(key, /** @type {any} */ ({ ...raw, talents: { atkup: bb } }));
    assert.deepEqual(uncoveredAbilities([{ ...merged, talents: { atkup: merged.talents?.atkup ?? {} } }]), other.has(key) ? ['atkup'] : [], key);
  }
});

test('[敌能-138] [关卡-2] a shape it does not know does nothing at runtime either; the hook adds nothing for a hit that dealt 0', () => {
  const loose = stand({ talents: { atkup: { ...STACK }, checker: { delay: 4, range_radius: 1 } } });
  for (let i = 0; i < 3; i++) strike(loose);
  run(loose, 200);
  assert.equal(count(loose.e), 3, 'that checker never clears');
  assert.equal(Object.keys(loose.e.ab).some((k) => k.startsWith('checker.')), false, 'nor keeps any state');
  const half = stand({ talents: { atkup: { atk: 0.07, attack_speed: 5 }, checker: { ...CHECK } } });
  half.e.hp = half.e.maxHp * 0.1;
  assert.equal(hitsOf(strike(half), half.e).length, 1);
  assert.equal(count(half.e), 0, 'no layer');
  assert.equal(half.e.buffs.some((b) => b.key === 'atkup'), false, 'nor 低血强化');
  const cold = stand({ talents: { atkup: { atk_scale: 2, attack_speed: 5 } } });
  status.applyStatus(unitOf(cold, 'guard'), 'freeze', { seconds: 5 });
  assert.equal(attrs.statsOf(unitOf(cold, 'guard')).flags.freeze, true);
  assert.deepEqual(hitsOf(strike(cold), cold.e).map((x) => x.damage), [500], 'nor 冻结增伤');
  const ice = stand({ talents: { atkup: { atk_scale: 2 } } });
  status.applyStatus(unitOf(ice, 'guard'), 'freeze', { seconds: 5 });
  assert.deepEqual(hitsOf(strike(ice), ice.e).map((x) => x.damage), [1000], '敌能-27\'s shape keeps it');
  /** @type {any[]} */
  const added = [];
  const ctx = /** @type {any} */ ({ bb: { ...STACK }, self: half.e, addBuff: (/** @type {Unit} */ _t, /** @type {any} */ b) => added.push(b) });
  foeBehaviors.atkup.hit?.(ctx, half.e, 0, false);
  assert.equal(added.length, 0);
  foeBehaviors.atkup.hit?.(ctx, half.e, 1, false);
  assert.equal(added.length, 1);
});

test('[敌能-138] each hit that takes HP adds one layer: ATK 直接乘算 +7 % on the current ATK and attack speed +5; the hit is at the ATK before it', () => {
  const box = stand();
  assert.equal(box.e.blockedBy, unitOf(box, 'guard').id);
  assert.deepEqual(hitsOf(strike(box), box.e).map((x) => x.damage), [500]);
  assert.equal(count(box.e), 1);
  assert.ok(near(attrs.statsOf(box.e).atk, 535));
  assert.equal(attrs.statsOf(box.e).aspd, 105);
  // another source's direct add and multiplier: the layers add to that multiplier, they do not multiply it
  buffs.addBuff(box.e, buffs.makeBuff({ key: 'boost', mods: { atkFlat: 100, atkPct: 0.5 } }));
  assert.ok(near(attrs.statsOf(box.e).atk, 600 * 1.57));
  const [second] = hitsOf(strike(box), box.e);
  assert.ok(near(second.damage, 600 * 1.57));
  assert.equal(count(box.e), 2);
  assert.equal(layers(box.e).length, 1, 'one buff with two layers');
  assert.ok(near(attrs.statsOf(box.e).atk, 600 * 1.64));
  assert.equal(attrs.statsOf(box.e).aspd, 110);
});

test('[敌能-138] the ATK, the attack speed and the cap follow the blackboard; with the data, 28 layers at most and no end', () => {
  const small = stand({ talents: { atkup: { atk: 0.1, attack_speed: 7, max_stack_cnt: 3 }, checker: { ...CHECK } } });
  for (let i = 0; i < 5; i++) strike(small);
  assert.equal(count(small.e), 3);
  assert.ok(near(attrs.statsOf(small.e).atk, 650));
  assert.equal(attrs.statsOf(small.e).aspd, 121);
  const full = stand();
  for (let i = 0; i < 30; i++) strike(full);
  assert.equal(count(full.e), 28);
  assert.equal(layers(full.e).length, 1);
  assert.equal(layers(full.e)[0].left, -1);
  assert.ok(near(attrs.statsOf(full.e).atk, 500 * 2.96));
  assert.equal(attrs.statsOf(full.e).aspd, 240);
});

test('[敌能-138] [属性-5] attacking on its own every attack comes sooner by the layers so far, and none is cleared', () => {
  const box = stand();
  box.e.atkCd = 0;
  /** @type {number[]} */
  const at = [];
  for (let i = 0; i < 700; i++) {
    const f = box.w.frame;
    if (hitsOf(step(box.w, box.c), box.e).length) at.push(f);
  }
  // 3 s × 100 ÷ (100 + 5n) for the n layers it holds as each attack starts
  assert.deepEqual(at.slice(1, 6).map((f, i) => f - at[i]), [90, 86, 82, 78, 75]);
  assert.equal(count(box.e), at.length);
});

test('[敌能-138] 120 frames after its last attack every layer goes as its turn starts; then they come back from one', () => {
  const box = stand();
  for (let i = 0; i < 3; i++) strike(box);
  const last = box.w.frame - 1;
  until(box, last + 120);
  assert.equal(count(box.e), 3, 'the 119th frame after it');
  step(box.w, box.c);
  assert.equal(count(box.e), 0, 'the 120th');
  assert.equal(attrs.statsOf(box.e).atk, 500);
  assert.equal(attrs.statsOf(box.e).aspd, 100);
  assert.deepEqual(hitsOf(strike(box), box.e).map((x) => x.damage), [500]);
  assert.equal(count(box.e), 1);
});

test('[敌能-138] [时间-2] the time out of the attack state follows checker.delay: 2.5 s is 75 frames', () => {
  const box = stand({ talents: { atkup: { ...STACK }, checker: { delay: 2.5 } } });
  strike(box);
  strike(box);
  const last = box.w.frame - 1, n = secondsToFrames(2.5);
  assert.equal(n, 75);
  until(box, last + n);
  assert.equal(count(box.e), 2);
  step(box.w, box.c);
  assert.equal(count(box.e), 0);
});

test('[敌能-138] an attack interval of exactly 4 s finds the layer cleared each time; at 118 frames they build up', () => {
  /** The layers after each of its own attacks in 500 frames, its attack speed lowered by `slow`. @param {number} slow */
  const after = (slow) => {
    const box = stand();
    buffs.addBuff(box.e, buffs.makeBuff({ key: 'slow', mods: { aspd: -slow } }));
    box.e.atkCd = 0;
    /** @type {number[]} */
    const seen = [];
    for (let i = 0; i < 500; i++) if (hitsOf(step(box.w, box.c), box.e).length) seen.push(count(box.e));
    return seen;
  };
  assert.deepEqual(after(25), [1, 1, 1, 1, 1], '3 s × 100 ÷ 75: 120 frames');
  assert.deepEqual(after(24).slice(0, 4), [1, 2, 3, 4], '3 s × 100 ÷ 76: 118 frames');
});

test('[敌能-138] [伤害-8] dodged, blocked, shielded and invincible hits add no layer, and it is still attacking: nothing is cleared', () => {
  const box = stand();
  strike(box);
  strike(box);
  const g = unitOf(box, 'guard');
  /** @type {{ key: string, mods?: Record<string, number>, shield?: number, flags?: Record<string, boolean> }[]} */
  const guards = [{ key: 'dodge', mods: { dodgePhys: 1 } }, { key: 'parry', mods: { blockAll: 1 } }, { key: 'wall', shield: 1e9 }, { key: 'safe', flags: { invincible: true } }];
  for (const init of guards) {
    const b = buffs.makeBuff(init), hp = g.hp;
    buffs.addBuff(g, b);
    box.e.atkCd = 0;
    const ev = run(box, 300);
    assert.ok(ev.filter((x) => x.type === 'attack' && x.id === box.e.id).length >= 3, init.key);
    assert.equal(g.hp, hp, init.key);
    assert.equal(count(box.e), 2, init.key);
    buffs.removeBuff(g, b);
  }
});

test('[敌能-138] silenced, it still gains its layers and still loses them 4 s after its last attack', () => {
  const box = stand();
  buffs.addBuff(box.e, buffs.makeBuff({ key: 'silence', flags: { silence: true } }));
  strike(box);
  strike(box);
  assert.equal(attrs.statsOf(box.e).flags.silence, true);
  assert.equal(count(box.e), 2);
  const last = box.w.frame - 1;
  until(box, last + 120);
  assert.equal(count(box.e), 2);
  step(box.w, box.c);
  assert.equal(count(box.e), 0);
});

test('[敌能-138] [敌人攻击-1] stunned it does not attack: the 4 s run and the layers go while it is stunned; after it, one again', () => {
  const box = stand();
  strike(box);
  strike(box);
  const last = box.w.frame - 1;
  status.applyStatus(box.e, 'stun', { seconds: 6 });
  box.e.atkCd = 0;
  until(box, last + 120);
  assert.equal(count(box.e), 2);
  step(box.w, box.c);
  assert.equal(attrs.statsOf(box.e).flags.stun, true);
  assert.equal(count(box.e), 0);
  const ev = run(box, 90);
  assert.deepEqual(hitsOf(ev, box.e).map((x) => x.damage), [500], 'the stun over, its next hit');
  assert.equal(count(box.e), 1);
});

test('[敌能-138] [攻击-2] with a wind-up the 4 s start at the hit; a swing a stun cancels starts them where it was cancelled', () => {
  // a 2 s clip with its OnAttack at 1 s: 30 frames of wind-up
  const timed = () => stand({ more: { attack: { duration: 2, hit: 1 } } });
  const box = timed(), s = box.w.frame;
  strike(box);
  until(box, s + 30);
  assert.equal(count(box.e), 0, 'still in the wind-up');
  assert.equal(hitsOf(step(box.w, box.c), box.e).length, 1);
  assert.equal(count(box.e), 1);
  until(box, s + 150);
  assert.equal(count(box.e), 1, '149 frames after the start, 119 after the hit');
  step(box.w, box.c);
  assert.equal(count(box.e), 0);
  const cut = timed(), t = cut.w.frame;
  strike(cut);
  until(cut, t + 40);
  assert.equal(count(cut.e), 1, 'its hit at t + 30');
  strike(cut);
  until(cut, t + 50);
  status.applyStatus(cut.e, 'stun', { seconds: 1 });
  assert.equal(hitsOf(run(cut, 40), cut.e).length, 0, 'the second swing is cancelled at t + 50');
  until(cut, t + 170);
  assert.equal(count(cut.e), 1, '119 frames after the cancel; its start and the hit are further back');
  step(cut.w, cut.c);
  assert.equal(count(cut.e), 0);
});

test('[敌能-138] [敌能-33] it does not attack a flying unit: a flying blocker is passed over for the sniper in range', () => {
  /** @param {any} c */
  const fly = (c) => { c.operators.guard.motion = 'FLY'; };
  const box = stand({ ops: [['guard', 1, 2], ['sniper', 0, 2]], tune: fly });
  const g = unitOf(box, 'guard'), s = unitOf(box, 'sniper');
  assert.equal(box.e.blockedBy, g.id);
  assert.deepEqual(hitsOf(strike(box), box.e).map((x) => x.target), [s.id]);
  assert.equal(g.hp, HP);
  assert.equal(count(box.e), 1);
  const bare = stand({ ops: [['guard', 1, 2], ['sniper', 0, 2]], tune: fly, raw: true });
  assert.deepEqual(hitsOf(strike(bare), bare.e).map((x) => x.target), [unitOf(bare, 'guard').id], 'without noFly it hits its blocker');
});

test('[敌能-138] [合作-9] a hit that takes a neutral unit\'s HP counts too', () => {
  const box = stand({ ops: [], tune: (c) => {
    c.enemies.civ = { name: 'civ', maxHp: HP, atk: 0, def: 0, res: 0, moveSpeed: 1, neutral: true };
    c.level.waves = [oneWave([spawnAt(0, KEY), spawnAt(0.2, 'civ')])];
  } });
  run(box, 10);
  const civ = unitOf(box, 'civ');
  assert.equal(civ.kind, KIND.ENEMY);
  Object.assign(civ, { x: 3, y: 1, path: [], pt: 0 });
  status.applyStatus(civ, 'root', {});
  assert.deepEqual(hitsOf(strike(box), box.e).map((x) => x.target), [civ.id]);
  assert.equal(civ.hp, HP - 500);
  assert.equal(count(box.e), 1);
});

test('[敌能-138] [伤害-9] the hit that knocks its target down dealt damage too: one layer', () => {
  const box = stand();
  const g = unitOf(box, 'guard');
  g.hp = 100;
  assert.deepEqual(hitsOf(strike(box), box.e).map((x) => x.target), [g.id]);
  assert.ok(!(g.hp > 0), 'knocked down');
  assert.equal(count(box.e), 1);
});

test('[敌能-138] [敌能-8] no 低血强化 below half HP, while the {atk} shape keeps it; the clear leaves other buffs; damage outside its attack adds nothing', () => {
  const box = stand();
  box.e.hp = box.e.maxHp * 0.1;
  step(box.w, box.c);
  assert.equal(box.e.buffs.some((b) => b.key === 'atkup'), false);
  assert.equal(attrs.statsOf(box.e).atk, 500);
  const g = unitOf(box, 'guard'), hp = g.hp;
  damage.dealDamage(box.w, box.e, g, { type: 'phys', amount: 1000, isAttack: true }, box.c);
  assert.equal(g.hp, hp - 1000);
  assert.equal(count(box.e), 0);
  buffs.addBuff(box.e, buffs.makeBuff({ key: 'lent', src: g.id, mods: { atkPct: 0.2 } }));
  strike(box);
  assert.equal(count(box.e), 1);
  until(box, box.w.frame + 120);
  assert.equal(count(box.e), 0);
  assert.equal(box.e.buffs.filter((b) => b.key === 'lent').length, 1);
  assert.ok(near(attrs.statsOf(box.e).atk, 600));
  const low = stand({ talents: { atkup: { atk: 1 } } });
  low.e.hp = low.e.maxHp * 0.4;
  step(low.w, low.c);
  assert.equal(low.e.buffs.find((b) => b.key === 'atkup')?.mods.atkPct, 1);
  assert.equal(attrs.statsOf(low.e).atk, 1000);
});
