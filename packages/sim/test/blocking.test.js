// Blocking (docs/spec/blocking.md) and enemy attacks (docs/spec/enemies.md 敌人攻击-1). Who blocks an enemy that comes
// near two operators, and how much each holds, equal the pinned Stronghold oracle's `_checkBlock` on random positions
// and weights; the rest is checked on hand-made fields and on the tiny level.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { oracleDir, tinyContent } from '@aue/testkit';
import { KIND } from '@aue/schema';
import { makeOperator, makeEnemy } from '../src/units.js';
import { tryBlock, keepOrRelease, enforceCapacity, heldBy, blockLoad, blockBy } from '../src/blocking.js';
import { enemyTargets } from '../src/combat.js';
import { applyStatus } from '../src/status.js';
import { addBuff, makeBuff } from '../src/buffs.js';
import { createWorld, step, pickTarget } from '../src/index.js';

const SEED = 20261011;
/** @type {any} */
let H;
before(async () => { H = await import(pathToFileURL(join(oracleDir(), 'test/helpers/battleHarness.js')).href); });

/** @typedef {import('../src/types.js').Unit} Unit @typedef {import('../src/types.js').World} World */

const ROAD = { key: 'tile_road', height: 'LOWLAND', buildable: 'MELEE', passable: 'ALL', side: 'ALL' };
const HIGH = { key: 'tile_wall', height: 'HIGHLAND', buildable: 'RANGED', passable: 'ALL', side: 'ALL' };

/** A 6 × 21 field of road, (2, 7) high ground; operators gA, gB with the given block counts, enemies of weight 1 and 2. @returns {any} */
function field(a = 2, b = 2) {
  const tiles = Array.from({ length: 6 }, (_, r) => Array.from({ length: 21 }, (_, c) => (r === 2 && c === 7 ? HIGH : ROAD)));
  const op = (/** @type {number} */ n) => ({ name: 'g', position: 'MELEE', cost: 1, blockCnt: n, baseAttackTime: 1, maxHp: 1000, atk: 0, def: 0, res: 0, range: [] });
  const foe = (/** @type {number} */ n) => ({ name: 'e', maxHp: 1e8, atk: 0, def: 0, res: 0, moveSpeed: 0, blockCnt: n });
  return {
    level: { id: 'f', width: 21, height: 6, tiles, waves: [],
      options: { maxLifePoint: 3, initialCost: 10, maxCost: 99, costIncreaseTime: 1, characterLimit: 9, moveMultiplier: 0.5 },
      routes: [{ start: { row: 3, col: 9 }, end: { row: 3, col: 20 }, checkpoints: [], motion: 'WALK' }] },
    enemies: { e1: foe(1), e2: foe(2) }, operators: { gA: op(a), gB: op(b) },
  };
}
/** @param {any} c @param {[string, number, number][]} ops key, row, col @returns {World} */
function worldWith(c, ops) {
  const w = createWorld(c, { seed: 1, players: 1 });
  for (const [key, row, col] of ops) w.units.push(makeOperator(w, c, { key, owner: 0, row, col, dir: 0 }));
  w.frame = 1;
  return w;
}
/** @param {World} w @param {any} c @param {string} key @param {number} x @param {number} y */
function enemyAt(w, c, key, x, y) {
  const e = makeEnemy(w, c, { key, route: 0 });
  e.x = x; e.y = y;
  w.units.push(e);
  return e;
}

/** The oracle's battle with operators of block counts a, b at (3, 5) and (3, 6). @param {number} a @param {number} b */
function oracleBattle(a, b) {
  const chess = (/** @type {string} */ id, /** @type {number} */ n) => H.chessRec({ id, stats: { atk: 0, blockCnt: n, maxHp: 1e7 }, rangeGrid: [[0, 0]], skill: null });
  const h = H.makeBattle({
    kind: 'boss', content: 'none', autoFinish: false, timeLimit: 60,
    defs: { chess: { t_a: chess('t_a', a), t_b: chess('t_b', b) },
      enemies: { e1: H.enemyRec({ key: 'e1', hp: 1e8, speed: 0 }), e2: H.enemyRec({ key: 'e2', hp: 1e8, speed: 0, blockCnt: 2 }) } },
    players: [{ playerId: 'p1', seat: 0, side: 'L', coords: 'field', bonds: {},
      units: [{ uid: 1, kind: 'chess', chessId: 't_a', row: 3, col: 5 }, { uid: 2, kind: 'chess', chessId: 't_b', row: 3, col: 6 }] }],
  });
  h.step();
  return h;
}

test('[阻挡-1] [阻挡-2] who blocks each enemy that comes near two operators, and what they hold: the oracle\'s', () => {
  const foe = fc.record({ heavy: fc.boolean(), x: fc.double({ min: 4.1, max: 6.9, noNaN: true }), y: fc.double({ min: 2.4, max: 3.6, noNaN: true }) });
  fc.assert(fc.property(fc.integer({ min: 1, max: 3 }), fc.integer({ min: 0, max: 3 }), fc.array(foe, { minLength: 1, maxLength: 6 }), (a, b, foes) => {
    const h = oracleBattle(a, b), c = field(a, b), w = worldWith(c, [['gA', 3, 5], ['gB', 3, 6]]);
    for (const f of foes) {
      const key = f.heavy ? 'e2' : 'e1', se = h.spawn(key, { pos: [3, 9], routeIndex: 0 });
      se.x = f.x; se.y = f.y;
      h.b._checkBlock(se);
      const e = enemyAt(w, c, key, f.x, f.y);
      tryBlock(w, c, e);
      const theirs = se.blockedBy ? se.blockedBy.x : -1, ours = e.blockedBy < 0 ? -1 : /** @type {Unit} */ (w.units.find((u) => u.id === e.blockedBy)).x;
      assert.equal(ours, theirs, `${JSON.stringify(f)} a=${a} b=${b}`);
    }
  }), { seed: SEED, numRuns: 200 });
});

test('[阻挡-1] inside the radius strictly: (dx² + dy²) < 0.49999037 for ground enemies', () => {
  const c = field(), w = worldWith(c, [['gA', 3, 5]]);
  assert.ok(!tryBlock(w, c, enemyAt(w, c, 'e1', 5 + 0.7071, 3)), '0.7071² = 0.49999041 is outside');
  assert.ok(tryBlock(w, c, enemyAt(w, c, 'e1', 5 - 0.70709, 3)), '0.70709² is inside');
  for (const key of /** @type {const} */ (['fear', 'levitate', 'sleep'])) {
    const e = enemyAt(w, c, 'e1', 5.2, 3);
    applyStatus(e, key, { frames: 30 });
    assert.ok(!tryBlock(w, c, e), key);
  }
  const u = enemyAt(w, c, 'e1', 5.2, 3);
  addBuff(u, makeBuff({ key: 'ub', flags: { unblockable: true } }));
  assert.ok(!tryBlock(w, c, u), 'unblockable');
});

test('[阻挡-2] who can block: not stunned or asleep, not on high ground; flyers only with blockFly, in the larger radius', () => {
  const c = field(5);
  const w = worldWith(c, [['gA', 3, 5], ['gA', 2, 7]]);
  const [op, high] = w.units;
  assert.ok(!tryBlock(w, c, enemyAt(w, c, 'e1', 7.2, 2)), 'high ground does not block');
  applyStatus(op, 'stun', { frames: 30 });
  assert.ok(!tryBlock(w, c, enemyAt(w, c, 'e1', 5.2, 3)));
  op.buffs = [];
  applyStatus(op, 'sleep', { frames: 30 });
  assert.ok(!tryBlock(w, c, enemyAt(w, c, 'e1', 5.2, 3)));
  op.buffs = [];
  const fly = enemyAt(w, c, 'e1', 5.8, 3);
  fly.base.motion = 'FLY';
  assert.ok(!tryBlock(w, c, fly), 'no blockFly');
  addBuff(op, makeBuff({ key: 'sky', flags: { blockFly: true } }));
  assert.ok(tryBlock(w, c, fly), '0.8² < 0.79995137');
  assert.equal(high.hp, 1000);
});

test('[阻挡-2] [阻挡-3] the block count holds weights; when it drops, the latest blocked goes first', () => {
  const c = field(3), w = worldWith(c, [['gA', 3, 5]]), op = w.units[0];
  const a = enemyAt(w, c, 'e1', 5.3, 3), b = enemyAt(w, c, 'e2', 5.2, 3), d = enemyAt(w, c, 'e1', 5.1, 3);
  assert.ok(tryBlock(w, c, a) && tryBlock(w, c, b) && !tryBlock(w, c, d));
  assert.equal(blockLoad(w, op), 3);
  w.frame = 2;
  addBuff(op, makeBuff({ key: 'less', mods: { blockCnt: -1 } }));
  enforceCapacity(w, c, op);
  assert.deepEqual(heldBy(w, op).map((e) => e.id), [a.id], 'b (weight 2) was blocked later');
  assert.ok(tryBlock(w, c, d), 'one slot left for d');
  addBuff(op, makeBuff({ key: 'none', mods: { blockCnt: -9 } }));
  enforceCapacity(w, c, op);
  assert.deepEqual(heldBy(w, op), []);
});

test('[阻挡-3] released when the blocker cannot block, leaves, or the enemy becomes unblockable', () => {
  const c = field(), w = worldWith(c, [['gA', 3, 5]]), op = w.units[0];
  const e = enemyAt(w, c, 'e1', 5.3, 3);
  tryBlock(w, c, e);
  applyStatus(op, 'stun', { frames: 30 });
  keepOrRelease(w, e);
  assert.equal(e.blockedBy, -1);
  op.buffs = [];
  tryBlock(w, c, e);
  applyStatus(e, 'levitate', { frames: 30 });
  keepOrRelease(w, e);
  assert.equal(e.blockedBy, -1, '浮空: released at its next turn');
  e.buffs = [];
  tryBlock(w, c, e);
  op.hp = 0;
  keepOrRelease(w, e);
  assert.equal(e.blockedBy, -1);
  op.hp = 1000;
  tryBlock(w, c, e);
  w.units.splice(0, 1);
  keepOrRelease(w, e);
  assert.equal(e.blockedBy, -1, 'its blocker left the field');
});

test('[阻挡-4] deployed onto an enemy\'s tile: the enemy goes onto the circle of radius 0.5; at the centre it stays', () => {
  const c = field(), w = worldWith(c, [['gA', 3, 5]]), op = w.units[0];
  op.born = w.frame;
  const e = enemyAt(w, c, 'e1', 5.2, 3.15);
  tryBlock(w, c, e);
  assert.ok(Math.abs(Math.hypot(e.x - 5, e.y - 3) - 0.5) < 1e-12);
  assert.ok(Math.abs((e.y - 3) / (e.x - 5) - 0.75) < 1e-12, 'along the line from the operator');
  const w2 = worldWith(field(), [['gA', 3, 5]]);
  w2.units[0].born = w2.frame;
  const m2 = enemyAt(w2, field(), 'e1', 5 + 1e-6, 3);
  tryBlock(w2, field(), m2);
  assert.equal(m2.x, 5 + 1e-6);
  const later = worldWith(field(), [['gA', 3, 5]]);
  const l = enemyAt(later, field(), 'e1', 5.2, 3);
  tryBlock(later, field(), l);
  assert.equal(l.x, 5.2, 'not deployed this frame: no offset');
});

test('[阻挡-4] [攻击-1] a melee operator selects the enemy it blocks outside its range; a ranged one does not', () => {
  const c = tinyContent();
  c.enemies.slime.moveSpeed = 0;
  c.operators.guard.range = [{ row: 0, col: 1 }];
  const w = createWorld(c, { seed: 1, players: 1 });
  for (let f = 0; f < 16; f++) step(w, c);
  const e = w.units[0];
  e.x = 1; e.y = 1;
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 2 }]]);
  const op = w.units[1];
  assert.equal(e.blockedBy, op.id);
  assert.equal(pickTarget(w, c, op), e, 'its range is the tile ahead only, but it blocks the slime on its own tile');
  c.operators.guard.position = 'RANGED';
  assert.equal(pickTarget(w, c, op), null);
});

test('[阻挡-4] [帧-1] on the tiny level: a guard on the road holds the slimes; they stop and stay', () => {
  const c = tinyContent();
  c.enemies.slime.maxHp = 1e6;
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 3, dir: 2 }]]);
  for (let f = 1; f < 400; f++) step(w, c);
  const slimes = w.units.filter((u) => u.kind === KIND.ENEMY);
  assert.equal(slimes.length, 2);
  for (const s of slimes) assert.ok(s.blockedBy === w.units[0].id && s.x > 2 && s.x < 3, `${s.x}`);
  assert.equal(w.players[0].life, 3);
});

test('[敌人攻击-1] a melee enemy hits only its blocker; a ranged one whatever its radius + 0.25 reaches, the blocker always', () => {
  const c = field(), w = worldWith(c, [['gA', 3, 5], ['gA', 3, 8], ['gA', 1, 5]]);
  const [a, b, far] = w.units;
  const e = enemyAt(w, c, 'e1', 6.5, 3);
  assert.deepEqual(enemyTargets(w, e), []);
  tryBlock(w, c, enemyAt(w, c, 'e1', 5.5, 3));
  e.blockedBy = a.id;
  assert.deepEqual(enemyTargets(w, e), [a]);
  e.base.applyWay = 'RANGED';
  e.base.rangeRadius = 1.25;
  assert.deepEqual(enemyTargets(w, e).map((u) => u.id), [a.id, b.id], '1.5 = 1.25 + 0.25 reaches (3, 8) exactly');
  e.base.rangeRadius = 1.2;
  assert.deepEqual(enemyTargets(w, e).map((u) => u.id), [a.id]);
  applyStatus(a, 'invincible', {});
  addBuff(a, makeBuff({ key: 'cam', flags: { camou: true } }));
  assert.deepEqual(enemyTargets(w, e).map((u) => u.id), [a.id], 'the blocker whatever its selectability');
  e.blockedBy = -1;
  assert.deepEqual(enemyTargets(w, e), []);
  assert.equal(far.hp, 1000);
});

test('[敌人攻击-1] [索敌-5] on the tiny level: the slime hits the guard blocking it once per interval; stunned, it waits', () => {
  const c = tinyContent();
  Object.assign(c.enemies.slime, { atk: 300, baseAttackTime: 2, maxHp: 1e6 });
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 3, dir: 2 }]]);
  /** @type {{ f: number, id: number }[]} */
  const hits = [];
  for (let f = 1; f < 300; f++) for (const ev of step(w, c)) if (ev.type === 'hit' && ev.target === 1) hits.push({ f, id: Number(ev.id) });
  const first = hits.filter((h) => h.id === 2);
  assert.ok(first.length >= 2 && first[1].f - first[0].f === 60, JSON.stringify(first));
  const slime = /** @type {Unit} */ (w.units.find((u) => u.id === 2));
  applyStatus(slime, 'stun', { frames: 90 });
  const cd = slime.atkCd;
  step(w, c);
  assert.equal(slime.atkCd, cd, 'the cooldown waits while it cannot act');
});

/** The frames of the slime's (id 2) hits on the guard (id 1) over `n` frames. @param {any} w @param {any} c @param {number} n */
const slimeHits = (w, c, n) => Array.from({ length: n }, (_, f) => (step(w, c).some((ev) => ev.type === 'hit' && ev.target === 1 && Number(ev.id) === 2) ? f : -1)).filter((f) => f >= 0);

test('[状态-5] [敌人攻击-1] 战栗: a blocked enemy starts no attack while its cooldown runs out; once it ends, it attacks', () => {
  const c = tinyContent();
  Object.assign(c.enemies.slime, { atk: 300, baseAttackTime: 2, maxHp: 1e6 });
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 3, dir: 2 }]]);
  while (!w.units.some((u) => u.id === 2 && u.blockedBy === 1)) step(w, c);
  const slime = /** @type {Unit} */ (w.units.find((u) => u.id === 2));
  applyStatus(slime, 'disarmedCombat', { frames: 300 });
  assert.deepEqual([slimeHits(w, c, 240), slime.atkCd, slime.swing], [[], 0, null], 'blocked: no swing starts, the cooldown is out');
  slime.buffs = slime.buffs.filter((x) => x.key !== 'disarmedCombat');
  assert.equal(slimeHits(w, c, 60).length, 1, 'its next attack at once');
});

test('[敌人攻击-1] [阻挡-3] the guard falls: it leaves, may be deployed again, and the slimes walk on', () => {
  const c = tinyContent();
  Object.assign(c.enemies.slime, { atk: 2000, baseAttackTime: 1, maxHp: 1e6 });
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 3, dir: 2 }]]);
  /** @type {any[]} */
  const ev = [];
  for (let f = 1; f < 400; f++) ev.push(...step(w, c));
  assert.ok(ev.some((e) => e.type === 'death' && e.id === 1));
  assert.deepEqual(w.players[0].deployed, []);
  assert.ok(w.units.every((u) => u.blockedBy === -1));
  for (let f = 0; f < 600; f++) step(w, c);
  assert.ok(w.players[0].life < 3, 'they reached the goal');
});

test('[阻挡-1] [阻挡-3] content blocks an enemy at once — no radius or count — and 阻挡-3 releases it as any other', () => {
  const c = field(0, 2), w = worldWith(c, [['gA', 3, 5]]), gA = w.units[0], far = enemyAt(w, c, 'e2', 15, 3);
  assert.equal(blockBy(w, far, gA), true);
  assert.deepEqual([far.blockedBy, far.blockedAt, heldBy(w, gA)], [gA.id, 1, [far]]);
  assert.equal(blockBy(w, far, w.units[0]), true, 'already its');
  enforceCapacity(w, c, gA);
  assert.equal(far.blockedBy, -1, 'a block count of 0 lets it go');
  w.units.splice(w.units.indexOf(far), 1);
  assert.equal(blockBy(w, far, gA), false, 'not on the field');
});

test('[阻挡-2] [敌人攻击-1] 起飞 (liftoff): flyers only, from high ground too, at its liftoffBlock; no ground enemy selects it', () => {
  const c = field(1);
  c.operators.gA.trait = { liftoffBlock: 2 };
  const w = worldWith(c, [['gA', 2, 7]]), op = w.units[0];
  addBuff(op, makeBuff({ key: 'up', flags: { liftoff: true } }));
  assert.ok(!tryBlock(w, c, enemyAt(w, c, 'e1', 7.2, 2)), 'no ground enemy');
  const f1 = enemyAt(w, c, 'e1', 7.3, 2), f2 = enemyAt(w, c, 'e1', 6.8, 2), f3 = enemyAt(w, c, 'e1', 7, 2.4);
  for (const f of [f1, f2, f3]) f.base.motion = 'FLY';
  assert.deepEqual([tryBlock(w, c, f1), tryBlock(w, c, f2), tryBlock(w, c, f3)], [true, true, false], 'two flyers, from high ground');
  const shooter = enemyAt(w, c, 'e1', 8, 2);
  shooter.base = { ...shooter.base, applyWay: 'RANGED', rangeRadius: 3 };
  assert.deepEqual(enemyTargets(w, shooter), [], 'a ground enemy cannot select it');
  shooter.base.motion = 'FLY';
  assert.deepEqual(enemyTargets(w, shooter), [op], 'a flying one can');
});

test('[常量-3] [阻挡-1] +0.23 blocks a flyer just outside the plain radius; ground stays on 0.49999037', () => {
  const c = field(3), w = worldWith(c, [['gA', 3, 5]]), op = w.units[0];
  addBuff(op, makeBuff({ key: 'sky', flags: { blockFly: true } }));
  const flyer = enemyAt(w, c, 'e1', 5.9, 3);
  flyer.base.motion = 'FLY';
  assert.equal(tryBlock(w, c, flyer), false, '0.9² = 0.81 is outside 0.79995137');
  addBuff(op, makeBuff({ key: 'wide', mods: { blockRadiusScale: 0.23 } }));
  assert.equal(tryBlock(w, c, flyer), true, '0.81 < 0.79995137 × 1.23²');
  assert.equal(tryBlock(w, c, enemyAt(w, c, 'e1', 5.5, 3)), true, 'ground 0.5² stays inside');
  assert.equal(tryBlock(w, c, enemyAt(w, c, 'e1', 5.75, 3)), false, 'ground 0.75² stays outside');
});

test('[常量-3] blockRadiusScale adds; a negative sum shrinks the flying radius, down to nothing', () => {
  const c = field(2), w = worldWith(c, [['gA', 3, 5]]), op = w.units[0];
  addBuff(op, makeBuff({ key: 'sky', flags: { blockFly: true }, mods: { blockRadiusScale: 0.1 } }));
  const far = enemyAt(w, c, 'e1', 6, 3);
  far.base.motion = 'FLY';
  assert.equal(tryBlock(w, c, far), false, '1² is outside 0.79995137 × 1.1²');
  addBuff(op, makeBuff({ key: 'wider', mods: { blockRadiusScale: 0.13 } }));
  assert.equal(tryBlock(w, c, far), true, '0.1 + 0.13 blocks it');
  const neg = worldWith(c, [['gA', 3, 5]]), nOp = neg.units[0];
  addBuff(nOp, makeBuff({ key: 'sky', flags: { blockFly: true }, mods: { blockRadiusScale: -0.5 } }));
  const inside = enemyAt(neg, c, 'e1', 5.4, 3), outside = enemyAt(neg, c, 'e1', 5.5, 3);
  inside.base.motion = 'FLY';
  outside.base.motion = 'FLY';
  assert.equal(tryBlock(neg, c, inside), true, '0.4² is inside 0.79995137 × 0.5²');
  assert.equal(tryBlock(neg, c, outside), false, '0.5² is outside it');
  const none = worldWith(c, [['gA', 3, 5]]), zOp = none.units[0];
  addBuff(zOp, makeBuff({ key: 'sky', flags: { blockFly: true }, mods: { blockRadiusScale: -1.5 } }));
  const under = enemyAt(none, c, 'e1', 5, 3);
  under.base.motion = 'FLY';
  assert.equal(tryBlock(none, c, under), false, 'the scale stops at 0: no flying radius at all');
});

test('[阻挡-1] noNewBlock keeps the blocks it has and refuses a new one by contact', () => {
  const c = field(2), w = worldWith(c, [['gA', 3, 5]]), op = w.units[0];
  const held = enemyAt(w, c, 'e1', 5.2, 3);
  assert.equal(tryBlock(w, c, held), true);
  addBuff(op, makeBuff({ key: 'cage', flags: { noNewBlock: true } }));
  const next = enemyAt(w, c, 'e1', 5.1, 3);
  assert.equal(tryBlock(w, c, next), false);
  assert.equal(held.blockedBy, op.id);
  keepOrRelease(w, held);
  assert.equal(held.blockedBy, op.id, 'the flag does not release');
  const handed = enemyAt(w, c, 'e1', 15, 3);
  assert.equal(blockBy(w, handed, op), true);
  applyStatus(op, 'stun', { frames: 30 });
  keepOrRelease(w, held);
  keepOrRelease(w, handed);
  assert.equal(held.blockedBy, -1, 'stun still releases');
  assert.equal(handed.blockedBy, -1);
});
