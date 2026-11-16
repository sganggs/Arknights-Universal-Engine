// 元核孽生者 and 异光体孽生者 (docs/spec/foes.md 敌能-127) on the tiny map. Neither is in a shipped level: the records are
// the level-0 enemy_database figures (ArknightsGameData 17759cc8). Our units have no attack, so only the test hurts the
// enemies; atk 500 makes one 元核 pulse −50 神经, 600 one 异光体 pulse −60.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, elements, buffs, damage, KIND } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras, uncoveredAbilities, FOE_EXTRAS } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const CORE = 'enemy_1439_dslntf';
const GLOW = 'enemy_1439_dslntf_2';
const TOXIN = Object.freeze({ ep_damage_ratio: 0.1, interval: 1, range_radius: 2.5 });

/** The enemy_database record, level 0. @param {string} key @returns {EnemyDef} */
function spawner(key) {
  const glow = key === GLOW;
  return {
    name: glow ? '异光体孽生者' : '元核孽生者', maxHp: glow ? 33000 : 30000, atk: glow ? 600 : 500, def: 0, res: glow ? 80 : 70,
    moveSpeed: 0.25, baseAttackTime: 3, rangeRadius: 0, applyWay: 'MELEE', motion: 'WALK', massLevel: 2, levelType: 'ELITE',
    immune: ['silence'], talents: { 0: { move_speed: 4 }, 1: { ...TOXIN }, 3: { hp_ratio: glow ? 0.2 : 0.25, range_radius: 0.5 } },
  };
}

/** @param {Record<string, Record<string, unknown>>} talents @returns {EnemyDef} */
const named = (talents) => /** @type {EnemyDef} */ ({ name: 'e', maxHp: 100, atk: 100, def: 0, res: 0, moveSpeed: 1, talents });
/** @param {string} key @param {Record<string, Record<string, unknown>>} talents */
const gaps = (key, talents) => uncoveredAbilities([withFoeExtras(key, named(talents))]);

/**
 * The tiny map: `foes` spawn at once, each pinned (rooted) at its x when one is given, else left to walk the route; a
 * neutral unit and our device where asked; our units deploy on the next frame as [op, row, col]. `defs` adds records.
 * @param {{ foes: [string, number?][], ops?: [string, number, number][], neutral?: number, device?: [number, number], defs?: Record<string, EnemyDef> }} o
 */
function arena(o) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [CORE]: spawner(CORE), [GLOW]: spawner(GLOW), neutral: { name: 'neutral', maxHp: 1e6, atk: 0, def: 0, res: 0, moveSpeed: 0, neutral: true }, ...o.defs };
  c.behaviors = skeletonContent.behaviors;
  const spawns = o.foes.map(([key]) => spawnAt(0, key));
  if (o.neutral !== undefined) spawns.push(spawnAt(0, 'neutral'));
  c.level.waves = [oneWave(spawns)];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 8 };
  const body = { cost: 0, maxHp: 1e7, atk: 0, def: 0, res: 0 };
  for (const name of ['guard', 'g2', 'g3', 'g4', 'hide']) c.operators[name] = { ...c.operators.guard, ...body, name };
  for (const name of ['sniper', 's2', 'fly', 'camo']) c.operators[name] = { ...c.operators.sniper, ...body, name };
  c.operators.fly.motion = 'FLY';
  if (o.device) {
    c.devices = { box: { name: 'box', maxHp: 1e6, atk: 0, def: 0, res: 0, blockCnt: 0, baseAttackTime: 1, aspd: 100, tauntLevel: 0, massLevel: 0, talentBb: {} } };
    c.level.predefines = [{ alias: 'box#1', key: 'box', hidden: false, row: o.device[0], col: o.device[1], dir: 'UP' }];
  }
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const es = w.units.filter((u) => u.kind === KIND.ENEMY && !u.base.neutral);
  o.foes.forEach(([, x], i) => { if (x !== undefined) pin(es[i], x); });
  const nu = w.units.find((u) => u.base.neutral === true);
  if (nu && o.neutral !== undefined) pin(nu, o.neutral);
  const ops = o.ops ?? [];
  if (ops.length) step(w, c, ops.map(([op, row, col]) => [0, { type: 'deploy', op, row, col, dir: 0 }]));
  /** @param {string} name */
  const op = (name) => /** @type {Unit} */ (w.units.find((u) => u.key === name));
  return { c, w, es, nu, op, dev: w.units.find((u) => u.kind === KIND.DEVICE) };
}

/** Root an enemy on road row 1 at this x. @param {Unit} e @param {number} x */
function pin(e, x) {
  Object.assign(e, { x, y: 1, path: [], pt: 0 });
  status.applyStatus(e, 'root', {});
}

/** @param {ReturnType<typeof arena>} box @param {number} n @returns {any[]} the events */
function run(box, n) {
  const ev = [];
  for (let i = 0; i < n; i++) ev.push(...step(box.w, box.c));
  return ev;
}

/** Hurts an enemy outside the turn order: its next turn sees it (敌能-2). @param {ReturnType<typeof arena>} box @param {Unit} e */
const hurt = (box, e) => damage.dealDamage(box.w, null, e, { type: 'true', amount: 10 });
/** @param {Unit} u */
const san = (u) => elements.epOf(u, 'SANITY');
/** @param {Unit} u */
const speed = (u) => attrs.statsOf(u).moveSpeed;
/** @param {Unit} u @param {string} flag */
const flagged = (u, flag) => attrs.statsOf(u).flags[flag] === true;
/** @param {any[]} ev @param {Unit} e */
const hitsBy = (ev, e) => ev.filter((x) => x.type === 'hit' && x.id === e.id);

test('[敌能-127] [关卡-2] the two 孽生者 are whole in their shapes; other shapes of 0, 1 and 3 stay uncovered, the spy and the barrel keep 1', () => {
  for (const key of [CORE, GLOW]) {
    assert.equal(FOE_EXTRAS[key], undefined, key);
    assert.deepEqual(uncoveredAbilities([withFoeExtras(key, spawner(key))]), [], key);
  }
  // other talent `0` users (enemy_database 17759cc8): 纤核漂游者, 诡核集养者, “织郁伯爵”, 蕴核饲育者
  assert.deepEqual(gaps('enemy_1435_dsflys', { 0: { 'attack@ep_damage_ratio': 0.15 } }), ['0']);
  assert.deepEqual(gaps('enemy_1436_dsdivi', { 0: { interval: 0.3, hp_ratio: 0.5, offset_bound: 0.2 } }), ['0']);
  assert.deepEqual(gaps('enemy_6022_m2cnt', { 0: { damage_resistance: 0.7 } }), ['0']);
  assert.deepEqual(gaps('enemy_1437_dsfull', { 0: { prob1: 0.2, prob2: 0.5, move_speed: 2, enemy_1: 'enemy_1434_dsshel', cnt: 1 } }), ['0']);
  // talent `3`: 假想敌：铳, “裂管之音”/“断弦之音”; and the 赘生甲壳 radius without its HP share
  assert.deepEqual(gaps('enemy_9017_achunt', { 3: { move_speed: 2, atk_scale: 1.2, duration: 15 } }), ['3']);
  assert.deepEqual(gaps('enemy_9023_acdums', { 3: { atk_scale: 0.1, ep_damage_ratio: 0.1 } }), ['3']);
  assert.deepEqual(gaps('e', { 3: { range_radius: 0.5 } }), ['3']);
  // talent `1`: the toxin less a key, the toxin plus a key, 假想敌：铳's, “高亢群歌”'s
  assert.deepEqual(gaps('e', { 1: { ep_damage_ratio: 0.1, interval: 1 } }), ['1']);
  assert.deepEqual(gaps('e', { 1: { ...TOXIN, el: 1 } }), ['1']);
  assert.deepEqual(gaps('enemy_9017_achunt', { 1: { ep_damage_ratio: 0.4, damage_scale: 1 } }), ['1']);
  assert.deepEqual(gaps('enemy_6028_cosgia', { 1: { ratio_each_level: 0.2, interval: 1, toast: 'LEGION_ENEMY_6028_COSGIA' } }), ['1']);
  // 悖谬谍报官's ammunition (敌能-31) and the barrel (敌能-62) are still talent `1`'s
  assert.deepEqual(gaps('enemy_1317_wdexg', { 1: { 'attack@cost': -2, 'attack@sp': -1 } }), []);
  assert.deepEqual(gaps('enemy_10044_wintun', { 1: { move_speed: 3 } }), []);
});

test('[敌能-127] [关卡-2] at run time another shape of 0 or of 1 does nothing', () => {
  const core = spawner(CORE);
  /** @type {Record<string, EnemyDef>} */
  const defs = {
    // a `0` with move_speed among other keys, as 蕴核饲育者's is: no 待命, no 临战, no pulse
    odd0: { ...core, talents: { ...core.talents, 0: { move_speed: 2, cnt: 1 } } },
    // the toxin with one more key: 待命 and 临战 as usual, but no pulse
    odd1: { ...core, talents: { ...core.talents, 1: { ...TOXIN, el: 1 } } },
  };
  const box = arena({ foes: [['odd0', 0], ['odd1', 3]], ops: [['g2', 1, 1]], defs });
  const [o0, o1] = box.es;
  assert.deepEqual([flagged(o0, 'noAttack'), flagged(o1, 'noAttack')], [false, true]);
  for (const e of box.es) hurt(box, e);
  run(box, 61);
  assert.deepEqual([speed(o0), flagged(o0, 'noWait'), flagged(o0, 'noAttack')], [0.25, false, false]);
  assert.deepEqual([speed(o1), flagged(o1, 'noWait'), flagged(o1, 'noAttack')], [1.25, true, false]);
  assert.equal(san(box.op('g2')), 1000, 'no pulse from either');
});

test('[敌能-127] 待命: no normal attack on its blocker, its own speed, and the route\'s wait holds it', () => {
  const walk = arena({ foes: [[CORE]] });
  const [e] = walk.es;
  assert.equal(flagged(e, 'noAttack'), true);
  assert.equal(speed(e), 0.25);
  let n = 0;
  while (!(e.wait > 0) && n < 400) { step(walk.w, walk.c); n++; }
  assert.deepEqual([e.x, e.y], [0, 1]);
  run(walk, 60);
  assert.deepEqual([e.x, e.y], [0, 1], 'still waiting out the 3 s');
  const held = arena({ foes: [[CORE]], ops: [['guard', 1, 0]] });
  const [h] = held.es, g = held.op('guard');
  const ev = run(held, 400);
  assert.equal(h.blockedBy, g.id);
  assert.equal(hitsBy(ev, h).length, 0);
  assert.equal(g.hp, 1e7);
  assert.equal(h.hp, 30000);
  hurt(held, h);
  const later = run(held, 120);
  assert.ok(hitsBy(later, h).length >= 1, '临战 attacks the blocker');
  assert.ok(g.hp < 1e7);
});

test('[敌能-127] 临战: the first HP loss, seen the next turn, gives +400% move speed for good and leaves the wait; no loss, no 临战', () => {
  const box = arena({ foes: [[CORE]] });
  const [e] = box.es;
  let n = 0;
  while (!(e.wait > 0) && n < 400) { step(box.w, box.c); n++; }
  buffs.addBuff(e, buffs.makeBuff({ key: 'shield', shieldHits: 1 }));
  assert.equal(hurt(box, e), 0);
  run(box, 2);
  status.applyStatus(e, 'invincible', {});
  assert.equal(hurt(box, e), 0);
  buffs.removeBuff(e, 'invincible');
  run(box, 2);
  assert.equal(damage.dealDamage(box.w, null, e, { type: 'true', amount: 0 }), 0);
  run(box, 2);
  assert.deepEqual([speed(e), flagged(e, 'noAttack'), flagged(e, 'noWait'), e.x], [0.25, true, false, 0]);
  hurt(box, e);
  assert.equal(speed(e), 0.25);
  step(box.w, box.c);
  assert.deepEqual([speed(e), flagged(e, 'noAttack'), flagged(e, 'noWait')], [1.25, false, true]);
  run(box, 2);
  assert.ok(e.x > 0, 'the rest of the 3 s wait is dropped');
  hurt(box, e);
  run(box, 60);
  assert.equal(speed(e), 1.25);
  assert.equal(e.buffs.filter((b) => b.key === 'nucleusEngaged').length, 1);
  assert.equal(e.buffs.find((b) => b.key === 'nucleusEngaged')?.left, -1);
});

test('[敌能-127] 生命流失 starts 临战 too; a buff taken away comes back the next turn', () => {
  const box = arena({ foes: [[CORE, 2]] });
  const [e] = box.es;
  damage.dealDamage(box.w, null, e, { type: 'true', amount: 10, hpLoss: true });
  step(box.w, box.c);
  assert.equal(flagged(e, 'noWait'), true);
  buffs.removeBuff(e, 'nucleusEngaged');
  assert.equal(flagged(e, 'noWait'), false);
  step(box.w, box.c);
  assert.deepEqual([flagged(e, 'noWait'), flagged(e, 'noAttack')], [true, false]);
  const still = arena({ foes: [[CORE, 2]] });
  buffs.removeBuff(still.es[0], 'nucleusStandby');
  step(still.w, still.c);
  assert.equal(flagged(still.es[0], 'noAttack'), true);
});

/**
 * Our units around a 元核 pinned at x 0.5 (row 1): 0.5 away, exactly 2.5 (`g3`) and past it (`g4` 3.5, `s2` 2.69); flying
 * and camouflaged at 1.8, 隐匿 at 0.5. The device stands 1.5 away and the neutral unit 0.5.
 */
const AROUND = /** @type {[string, number, number][]} */ ([
  ['guard', 1, 1], ['g3', 1, 3], ['g4', 1, 4], ['fly', 0, 2], ['camo', 2, 2], ['s2', 0, 3], ['hide', 1, 0],
]);

test('[敌能-127] 每秒的神经损伤: a full second after the 临战 turn, then each second, 10% of the attack on ours within 2.5, flying and camouflaged too', () => {
  const box = arena({ foes: [[CORE, 0.5]], ops: AROUND, neutral: 1, device: [1, 2] });
  const [e] = box.es;
  buffs.addBuff(box.op('camo'), buffs.makeBuff({ key: 'camo', flags: { camou: true } }));
  buffs.addBuff(box.op('hide'), buffs.makeBuff({ key: 'hide', flags: { stealth: true } }));
  run(box, 60);
  const all = [...AROUND.map(([name]) => box.op(name)), /** @type {Unit} */ (box.dev), /** @type {Unit} */ (box.nu)];
  assert.ok(all.every((u) => san(u) === 1000), 'no pulse while standing by');
  hurt(box, e);
  step(box.w, box.c);
  run(box, 29);
  assert.ok(all.every((u) => san(u) === 1000), 'nothing before the full second');
  step(box.w, box.c);
  const inside = ['guard', 'g3', 'fly', 'camo'].map(box.op), outside = ['g4', 's2', 'hide'].map(box.op);
  assert.deepEqual([...inside, box.dev].map((u) => san(/** @type {Unit} */ (u))), [950, 950, 950, 950, 950]);
  assert.deepEqual([...outside, box.nu].map((u) => san(/** @type {Unit} */ (u))), [1000, 1000, 1000, 1000]);
  // dealEp alone refuses a neutral unit (元素-2): only the missing mark shows it was left out of the pulse
  assert.equal(box.nu?.buffs.some((x) => x.key.startsWith('nucleusToxin')), false, 'the neutral unit is not marked');
  run(box, 29);
  assert.equal(san(box.op('guard')), 950);
  step(box.w, box.c);
  assert.equal(san(box.op('guard')), 900);
  status.applyStatus(e, 'stun', { seconds: 5 });
  assert.equal(attrs.statsOf(e).disabled, true);
  run(box, 30);
  assert.equal(san(box.op('guard')), 850, 'stun does not stop it');
  buffs.addBuff(e, buffs.makeBuff({ key: 'atkUp', mods: { atkPct: 1 } }));
  run(box, 30);
  assert.equal(san(box.op('guard')), 750, 'the attack it has at that pulse');
  assert.equal(e.hp, 30000 - 10, '赘生甲壳 talent: no HP lost');
});

test('[敌能-127] 不叠加: two 元核 on one unit pulse it once a second, the first to reach it keeps it; 元核 and 异光体 each count', () => {
  const box = arena({ foes: [[CORE, 0], [CORE, 3]], ops: [['g2', 1, 1], ['guard', 1, 0], ['g4', 1, 4]] });
  const [a, b] = box.es, mid = box.op('g2'), left = box.op('guard'), right = box.op('g4');
  hurt(box, a);
  run(box, 10);
  hurt(box, b);
  run(box, 21);
  assert.deepEqual([mid, left, right].map(san), [950, 950, 1000], 'a first, b not yet');
  run(box, 10);
  assert.deepEqual([mid, left, right].map(san), [950, 950, 950], 'b passes the unit a holds');
  run(box, 60);
  assert.deepEqual([mid, left, right].map(san), [850, 850, 850]);
  assert.equal(mid.buffs.filter((x) => x.key === `nucleusToxin:${CORE}`).length, 1);
  assert.equal(mid.buffs.find((x) => x.key === `nucleusToxin:${CORE}`)?.src, a.id);
  const mix = arena({ foes: [[CORE, 0], [GLOW, 3]], ops: [['g2', 1, 1]] });
  for (const e of mix.es) hurt(mix, e);
  run(mix, 31);
  assert.equal(san(mix.op('g2')), 1000 - 50 - 60);
  run(mix, 30);
  assert.equal(san(mix.op('g2')), 1000 - 2 * 110);
});

test('[敌能-127] 不叠加: the holder keeps the unit on its next pulse, against one earlier in the turn order on that frame', () => {
  const box = arena({ foes: [[CORE, 3], [CORE, 0]], ops: [['g2', 1, 1]] });
  const [first, holder] = box.es, mid = box.op('g2');
  const marks = () => mid.buffs.filter((x) => x.key === `nucleusToxin:${CORE}`).map((x) => x.src);
  hurt(box, holder);
  run(box, 30);
  hurt(box, first);
  step(box.w, box.c);
  assert.equal(san(mid), 950);
  assert.deepEqual(marks(), [holder.id]);
  run(box, 30);
  assert.equal(san(mid), 900, 'one pulse on the frame both pulse');
  assert.deepEqual(marks(), [holder.id]);
});

test('[敌能-127] 不叠加: when the holder is gone its mark runs out, then the other 元核 pulses the unit', () => {
  const box = arena({ foes: [[CORE, 0], [CORE, 3]], ops: [['g2', 1, 1]] });
  const [a, b] = box.es, mid = box.op('g2');
  hurt(box, a);
  run(box, 10);
  hurt(box, b);
  run(box, 21);
  assert.equal(san(mid), 950);
  damage.setHp(a, 0);
  run(box, 2);
  assert.equal(box.w.units.includes(a), false);
  run(box, 8);
  assert.equal(san(mid), 950, "b's pulse while a's mark lasts passes it");
  run(box, 30);
  assert.equal(san(mid), 900, 'then b holds it');
  assert.equal(mid.buffs.find((x) => x.key === `nucleusToxin:${CORE}`)?.src, b.id);
});

test('[敌能-127] 不叠加: a pulse on an invincible unit takes nothing and still makes the unit its holder\'s', () => {
  const box = arena({ foes: [[CORE, 0], [CORE, 3]], ops: [['g2', 1, 1]] });
  const [a, b] = box.es, mid = box.op('g2');
  const holder = () => mid.buffs.find((x) => x.key === `nucleusToxin:${CORE}`)?.src;
  status.applyStatus(mid, 'invincible', {});
  hurt(box, a);
  run(box, 10);
  hurt(box, b);
  run(box, 21);
  assert.deepEqual([san(mid), holder()], [1000, a.id], "a's pulse takes nothing, the unit is a's");
  run(box, 5);
  buffs.removeBuff(mid, 'invincible');
  run(box, 5);
  assert.deepEqual([san(mid), holder()], [1000, a.id], "b's pulse passes the unit a holds");
  run(box, 20);
  assert.deepEqual([san(mid), holder()], [950, a.id], "a's next pulse takes it");
});
