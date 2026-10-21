// Targeting (docs/spec/targeting.md): range tiles, selectability and the official orders of candidates. Compared with the
// pinned Stronghold oracle: the range keys of random grids (same key set while no row has a gap: DIF-0010), the order of an
// operator's enemy candidates (exact, while path distances sit in the middle of a 0.1 bucket and are all in different
// buckets: DIF-0005), and the order of an enemy's ally candidates (later-deployed units come later in (born, bornN)).
// The rest — selectability, precision, the stable sort, 目标数 — is checked against the spec.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { loadOracle } from '@aue/testkit';
import { targeting as T, buffs, blocking } from '../src/index.js';

const SEED = 20261011, G = { rows: 19, cols: 21 }, FPS = 30;
/** @type {any} */
let shT;
/** @type {any} */
let shU;
before(async () => {
  shT = await loadOracle('server/sim/targeting.js');
  shU = await loadOracle('server/sim/units.js');
});

/** One of our units, with only what targeting reads. @param {number} id @param {Record<string, any>} [over] @returns {any} */
const mk = (id, over = {}) => ({ id, kind: 1, x: 0, y: 0, hp: 10, base: {}, buffs: [], blockedBy: -1, born: 0, bornN: 1, ...over });
/** A unit with one buff. @param {Record<string, any>} buff @param {Record<string, any>} [over] @returns {any} */
const withBuff = (buff, over = {}) => mk(1, { buffs: [buffs.makeBuff({ key: 'x', ...buff })], ...over });
/** The ids of units. @param {any[]} list */
const ids = (list) => list.map((u) => u.id);

/** An oracle unit. @param {number} id @param {'ally' | 'enemy'} side @param {number} taunt @param {Record<string, any>} [over] @returns {any} */
function oracleUnit(id, side, taunt, over = {}) {
  const u = new shU.Unit({ id, side, kind: side === 'ally' ? 'op' : 'enemy', base: { tauntLevel: taunt } });
  u.alive = true;
  u.deployed = true;
  Object.assign(u, over);
  u.markDirty();
  return u;
}

const DIRS = /** @type {const} */ (['UP', 'RIGHT', 'DOWN', 'LEFT']);
/** A row of the range: contiguous columns from `from`. */
const rowOf = fc.record({ dr: fc.integer({ min: -2, max: 2 }), from: fc.integer({ min: -1, max: 3 }), len: fc.integer({ min: 1, max: 5 }) });
const grids = fc.uniqueArray(rowOf, { selector: (r) => r.dr, minLength: 1, maxLength: 5 });
/** @param {{ dr: number, from: number, len: number }[]} rows */
const cellsOf = (rows) => rows.flatMap((r) => Array.from({ length: Math.min(4, r.from + r.len - 1) - r.from + 1 }, (_, i) => ({ row: r.dr, col: r.from + i })));

test('[索敌-1] range tiles: the oracle\'s key set for any row without a gap, every facing and extension', () => {
  fc.assert(fc.property(grids, fc.integer({ min: 0, max: 18 }), fc.integer({ min: 0, max: 20 }), fc.constantFrom(...DIRS), fc.integer({ min: 0, max: 2 }),
    (rows, y, x, dir, extend) => {
      const offsets = cellsOf(rows);
      const ours = T.rangeKeys(G, { x, y, dir }, offsets, extend);
      const theirs = shT.absoluteRangeKeys(offsets.map((o) => [o.row, o.col]), y, x, dir, extend);
      assert.deepStrictEqual([...ours].sort((a, b) => a - b), [...theirs].sort((/** @type {number} */ a, /** @type {number} */ b) => a - b));
      return true;
    }), { seed: SEED, numRuns: 1500 });
});

test('[索敌-1] a row with a gap: every offset is stretched, so the gap is filled (the oracle stretches past the row\'s end: DIF-0010)', () => {
  const offsets = [{ row: 0, col: 0 }, { row: 0, col: 3 }];
  const at = { x: 5, y: 9, dir: 'RIGHT' };
  const row = (/** @type {number[]} */ cols) => cols.map((c) => 9 * 21 + c);
  assert.deepStrictEqual([...T.rangeKeys(G, at, offsets, 2)].sort((a, b) => a - b), row([5, 6, 7, 8, 9, 10]));
  assert.deepStrictEqual([...shT.absoluteRangeKeys([[0, 0], [0, 3]], 9, 5, 'RIGHT', 2)].sort((/** @type {number} */ a, /** @type {number} */ b) => a - b), row([5, 8, 9, 10]));
  assert.deepStrictEqual([...T.rangeKeys(G, at, offsets, 0)].sort((a, b) => a - b), row([5, 8]), 'no extension, no change');
});

test('[索敌-1] the extension stretches straight ahead of the facing, not along the row', () => {
  const keys = T.rangeKeys(G, { x: 4, y: 4, dir: 'UP' }, [{ row: 0, col: 1 }], 2);
  assert.deepStrictEqual([...keys].sort((a, b) => a - b), [5, 6, 7].map((r) => r * 21 + 4));
  assert.equal(T.rangeKeys(G, { x: 4, y: 4, dir: 'LEFT' }, [{ row: 0, col: 1 }], 1).has(4 * 21 + 2), true);
});

test('[索敌-1] tiles off the board are dropped (a unit in a corner, any facing)', () => {
  const cells = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 }, { row: -1, col: 0 }];
  assert.deepStrictEqual([...T.rangeKeys(G, { x: 0, y: 0, dir: 'LEFT' }, cells)].sort((a, b) => a - b), [0, 21]);
  assert.deepStrictEqual([...T.rangeKeys(G, { x: 20, y: 18, dir: 'RIGHT' }, cells, 3)].sort((a, b) => a - b), [17 * 21 + 20, 18 * 21 + 20]);
  assert.deepStrictEqual([...T.rangeKeys({ rows: 9, cols: 12 }, { x: 11, y: 8, dir: 'UP' }, cells)].sort((a, b) => a - b), [8 * 12 + 10, 8 * 12 + 11]);
  assert.equal(T.rangeKeys(G, { x: 3, y: 3, dir: 'DOWN' }, []).size, 0);
});

test('[索敌-1] a unit is in range when any tile of its body is: a huge unit counts by every tile it covers', () => {
  const huge = mk(1, { x: 5, y: 5, hitArea: { w: 3, h: 3, dx: 0, dy: 0 } });
  assert.equal(T.inKeys(huge, new Set([6 * 21 + 6]), G), true, 'a corner tile of its body');
  assert.equal(T.inKeys(huge, new Set([7 * 21 + 5]), G), false, 'just outside');
  const point = mk(2, { x: 5, y: 5 });
  assert.equal(T.inKeys(point, new Set([6 * 21 + 6]), G), false);
  assert.equal(T.inKeys(point, new Set([5 * 21 + 5]), G), true);
  assert.equal(T.inKeys(mk(3, { x: 30, y: 2 }), new Set([2 * 21 + 9]), G), false, 'off the board');
});

test('[索敌-2] a unit with no HP left cannot be selected', () => {
  assert.equal(T.selectable(mk(1)), true);
  assert.equal(T.selectable(mk(1, { hp: 0 })), false);
  assert.equal(T.selectable(mk(1, { hp: -3 })), false);
});

test('[索敌-2] 无法选中, 隐匿 and 沉睡 cannot be selected, not even by an attack that ignores 迷彩 or hits flyers', () => {
  for (const flag of ['untargetable', 'stealth', 'sleep']) {
    const u = withBuff({ flags: { [flag]: true } });
    assert.equal(T.selectable(u), false, flag);
    assert.equal(T.selectable(u, { canHitFly: true, ignoreCamou: true }), false, flag);
  }
  assert.equal(T.selectable(withBuff({ flags: { stealth: false } })), true, 'a flag that is off');
});

test('[索敌-2] 迷彩 cannot be selected unless the attack ignores it', () => {
  const u = withBuff({ flags: { camou: true } });
  assert.equal(T.selectable(u), false);
  assert.equal(T.selectable(u, { canHitFly: true }), false);
  assert.equal(T.selectable(u, { ignoreCamou: true }), true);
});

test('[索敌-2] flying units need an attack that can hit them; melee attackers pass no canHitFly, so they cannot (INF-0021)', () => {
  const flyer = mk(1, { base: { motion: 'FLY' } });
  assert.equal(T.selectable(flyer), false);
  assert.equal(T.selectable(flyer, {}), false);
  assert.equal(T.selectable(flyer, { canHitFly: false, ignoreCamou: true }), false);
  assert.equal(T.selectable(flyer, { canHitFly: true }), true);
  assert.equal(T.selectable(mk(2, { base: { motion: 'WALK' } })), true);
});

test('[索敌-2] 浮空 makes a ground unit flying, 缚地 grounds a flyer', () => {
  const lifted = withBuff({ flags: { levitate: true } }, { base: { motion: 'WALK' } });
  assert.equal(T.selectable(lifted), false);
  assert.equal(T.selectable(lifted, { canHitFly: true }), true);
  assert.equal(T.selectable(withBuff({ flags: { groundbind: true } }, { base: { motion: 'FLY' } })), true);
});

test('[索敌-2] immunity suppresses the flag: an immune unit is selectable as if it had none', () => {
  assert.equal(T.selectable(withBuff({ flags: { stealth: true } }, { base: { immune: ['stealth'] } })), true);
  assert.equal(T.selectable(withBuff({ flags: { camou: true } }, { base: { immune: ['camou'] } })), true);
  assert.equal(T.selectable(withBuff({ flags: { levitate: true } }, { base: { immune: ['levitate'] } })), true);
  assert.equal(T.selectable(withBuff({ flags: { stealth: true } }, { base: { immune: ['camou'] } })), false, 'another immunity does not help');
});

test('[索敌-2] an enemy\'s 隐匿 lifts while blocked and through its restore window; an operator\'s does not', () => {
  const enemy = withBuff({ flags: { stealth: true } }, { blockedBy: 7 });
  assert.equal(T.selectable(enemy), true, 'blocked');
  assert.equal(T.stealthed(enemy), false);
  blocking.release(enemy);
  assert.equal(T.selectable(enemy), true, 'the window');
  assert.equal(enemy.buffs.find((/** @type {any} */ b) => b.key === 'stealthOff:x')?.left, 90);
  const op = withBuff({ flags: { stealth: true } }, { kind: 0, blockedBy: 7 });
  blocking.release(op);
  assert.equal(T.selectable(op), false);
  assert.equal(op.buffs.some((/** @type {any} */ b) => String(b.key).startsWith('stealthOff:')), false);
});

test('[索敌-2] restore 0 returns at once, and one source still outside its window keeps 隐匿', () => {
  const now = withBuff({ flags: { stealth: true }, restore: 0 }, { blockedBy: 4 });
  blocking.release(now);
  assert.equal(T.stealthed(now), true);
  assert.equal(now.buffs.some((/** @type {any} */ b) => String(b.key).startsWith('stealthOff:')), false);
  const both = mk(1, { blockedBy: 4, buffs: [buffs.makeBuff({ key: 'a', flags: { stealth: true }, restore: 0 }), buffs.makeBuff({ key: 'b', flags: { stealth: true } })] });
  blocking.release(both);
  assert.equal(T.stealthed(both), true, 'a has no window');
  assert.equal(both.buffs.some((/** @type {any} */ b) => b.key === 'stealthOff:a'), false);
  assert.equal(both.buffs.find((/** @type {any} */ b) => b.key === 'stealthOff:b')?.left, 90);
  const closed = mk(2, { blockedBy: 4, buffs: [buffs.makeBuff({ key: 'a', flags: { stealth: true } }), buffs.makeBuff({ key: 'b', flags: { stealth: true } })] });
  blocking.release(closed);
  assert.equal(T.stealthed(closed), false);
});

test('[索敌-2] releasing again refills the window; a free enemy\'s release does not; a dead enemy arms none', () => {
  const e = withBuff({ flags: { stealth: true } }, { blockedBy: 3 });
  blocking.release(e);
  const window = /** @type {import('../src/types.js').Buff} */ (e.buffs.find((/** @type {any} */ b) => b.key === 'stealthOff:x'));
  buffs.setLeft(window, 10);
  e.blockedBy = 8;
  blocking.release(e);
  assert.equal(window.left, 90);
  blocking.release(e);
  assert.equal(window.left, 90, 'already free');
  const dead = withBuff({ flags: { stealth: true } }, { blockedBy: 3, hp: 0 });
  blocking.release(dead);
  assert.equal(dead.buffs.some((/** @type {any} */ b) => String(b.key).startsWith('stealthOff:')), false);
});

/** Candidate enemies of the differential test: a taunt level, a path distance bucket (all different) and a blocked flag. */
const cand = fc.record({ taunt: fc.integer({ min: -2, max: 2 }), k: fc.integer({ min: 0, max: 200 }), blocked: fc.boolean() });
const candidates = fc.uniqueArray(cand, { selector: (c) => c.k, minLength: 1, maxLength: 8 });

test('[索敌-3] an operator\'s targets: the oracle\'s order for a melee attacker (blocked, taunt, path distance, appearance)', () => {
  fc.assert(fc.property(candidates, (list) => {
    const dist = new Map(list.map((c, i) => [i + 1, c.k / 10 + 0.05]));
    const foe = oracleUnit(100, 'ally', 0);
    const theirs = list.map((c, i) => oracleUnit(i + 1, 'enemy', c.taunt, { blockedBy: c.blocked ? foe : null, spawnSeq: i }));
    shT.sortEnemyTargets({ remainingDistance: (/** @type {any} */ e) => dist.get(e.id) }, foe, theirs, null);
    const ours = list.map((c, i) => mk(i + 1, { base: { tauntLevel: c.taunt }, blockedBy: c.blocked ? 100 : -1 }));
    const got = T.sortEnemies(mk(100, { kind: 0 }), ours, { blockedFirst: true, pathDist: (e) => /** @type {number} */ (dist.get(e.id)) });
    assert.deepStrictEqual(ids(got), ids(theirs));
    return true;
  }), { seed: SEED, numRuns: 200 });
});

test('[索敌-3] path distances within the same 0.1 count as equal: the earlier one stays first (the oracle puts the nearer first: DIF-0005)', () => {
  const dist = new Map([[1, 0.17], [2, 0.13]]);
  const got = T.sortEnemies(mk(100), [mk(1), mk(2)], { blockedFirst: true, pathDist: (e) => /** @type {number} */ (dist.get(e.id)) });
  assert.deepStrictEqual(ids(got), [1, 2]);
  assert.equal(T.precisionKey(T.enemyHatred(0, 0.17)), T.precisionKey(T.enemyHatred(0, 0.13)));
  const theirs = [oracleUnit(1, 'enemy', 0, { spawnSeq: 0 }), oracleUnit(2, 'enemy', 0, { spawnSeq: 1 })];
  shT.sortEnemyTargets({ remainingDistance: (/** @type {any} */ e) => dist.get(e.id) }, oracleUnit(100, 'ally', 0), theirs, null);
  assert.deepStrictEqual(ids(theirs), [2, 1]);
  const apart = new Map([[1, 0.27], [2, 0.13]]);
  assert.deepStrictEqual(ids(T.sortEnemies(mk(100), [mk(1), mk(2)], { blockedFirst: true, pathDist: (e) => /** @type {number} */ (apart.get(e.id)) })), [2, 1], 'a whole bucket apart');
});

test('[索敌-3] only a melee attacker puts the enemy it blocks first (the oracle always does: DIF-0005)', () => {
  const dist = new Map([[1, 5], [2, 1]]);
  const pathDist = (/** @type {any} */ e) => /** @type {number} */ (dist.get(e.id));
  const cands = () => [mk(1, { blockedBy: 100 }), mk(2)];
  assert.deepStrictEqual(ids(T.sortEnemies(mk(100), cands(), { blockedFirst: true, pathDist })), [1, 2]);
  assert.deepStrictEqual(ids(T.sortEnemies(mk(100), cands(), { blockedFirst: false, pathDist })), [2, 1]);
  assert.deepStrictEqual(ids(T.sortEnemies(mk(100), [mk(1, { blockedBy: 7 }), mk(2)], { blockedFirst: true, pathDist })), [2, 1], 'blocked by someone else');
  const foe = oracleUnit(100, 'ally', 0);
  const theirs = [oracleUnit(1, 'enemy', 0, { blockedBy: foe, spawnSeq: 0 }), oracleUnit(2, 'enemy', 0, { spawnSeq: 1 })];
  shT.sortEnemyTargets({ remainingDistance: pathDist }, foe, theirs, null);
  assert.deepStrictEqual(ids(theirs), [1, 2]);
});

test('[索敌-3] 防御升序 (神射手): the lowest defence first, 仇恨值 among equals; the blocked enemies still go first', () => {
  const dist = new Map([[1, 1], [2, 2], [3, 3], [4, 4]]);
  const pathDist = (/** @type {any} */ e) => /** @type {number} */ (dist.get(e.id));
  const defs = () => [mk(1, { base: { def: 300 } }), mk(2, { base: { def: 100 } }), mk(3, { base: { def: 100.0004 } }), mk(4, { base: { def: 50 } })];
  assert.deepStrictEqual(ids(T.sortEnemies(mk(100), defs(), { blockedFirst: false, pathDist, filter: 'DEF_ASC' })), [4, 2, 3, 1], '100 and 100.0004 are equal at 0.001: path distance decides');
  const blocked = defs();
  blocked[0].blockedBy = 100;
  assert.deepStrictEqual(ids(T.sortEnemies(mk(100), blocked, { blockedFirst: true, pathDist, filter: 'DEF_ASC' })), [1, 4, 2, 3]);
  const taunting = defs();
  taunting[2].base.tauntLevel = 1;
  assert.deepStrictEqual(ids(T.sortEnemies(mk(100), taunting, { blockedFirst: false, pathDist, filter: 'DEF_ASC' })), [4, 3, 2, 1], 'taunt is the second key');
});

test('[索敌-3] 重量降序 (攻城手): 重量等级 × (−1000) − 仇恨值, the heaviest first; 全部 keeps the list', () => {
  const pathDist = (/** @type {any} */ e) => e.id;
  const cands = [mk(1), mk(2, { base: { massLevel: 3 } }), mk(3, { base: { massLevel: 1 } }), mk(4, { base: { massLevel: 3 } })];
  assert.deepStrictEqual(ids(T.sortEnemies(mk(100), cands, { blockedFirst: false, pathDist, filter: 'MASS_DES' })), [2, 4, 3, 1]);
  assert.deepStrictEqual(ids(T.sortEnemies(mk(100), cands, { blockedFirst: false, pathDist, filter: 'ALL' })), [1, 2, 3, 4]);
});

test('[索敌-3] the 二次过滤器 飞行单位优先 swaps, it does not sort: [G1 G2 F1 G3 F2] becomes [F1 F2 G1 G3 G2]', () => {
  const fly = { base: { motion: 'FLY' } };
  const cands = [mk(1), mk(2), mk(3, fly), mk(4), mk(5, fly)];
  assert.deepStrictEqual(ids(T.sortEnemies(mk(100), cands, { blockedFirst: false, pathDist: () => 3, secondary: 'FLY_FIRST' })), [3, 5, 1, 4, 2]);
  assert.deepStrictEqual(T.swapForward([1, 2, 3], () => true), [1, 2, 3]);
  assert.deepStrictEqual(T.swapForward([1, 2, 3], () => false), [1, 2, 3]);
  const blocked = [mk(1, { blockedBy: 100 }), mk(2, fly)];
  assert.deepStrictEqual(ids(T.sortEnemies(mk(100), blocked, { blockedFirst: true, pathDist: () => 3, secondary: 'FLY_FIRST' })), [1, 2], 'the blocked enemies go first after it');
});

test('[职业-2] heal targets: units at full HP left out, the lowest HP ratio first at 0.001, then creation order', () => {
  const u = (/** @type {number} */ id, /** @type {number} */ hp, /** @type {number} */ max) => mk(id, { kind: 0, hp, maxHp: max });
  const got = T.sortHealTargets([u(1, 100, 100), u(4, 0.5, 1), u(2, 50, 100), u(3, 1000.8, 2000), u(5, 30, 100)]);
  assert.deepStrictEqual(ids(got), [5, 4, 2, 3], '0.5, 0.5 and 0.5004 are equal at 0.001: creation order');
  assert.deepStrictEqual(T.sortHealTargets([u(1, 10, 10)]), []);
});

test('[索敌-3] equal 仇恨值 keeps the order the candidates came in, and the input is not changed', () => {
  const cands = [mk(3), mk(1), mk(2)];
  const got = T.sortEnemies(mk(100), cands, { blockedFirst: true, pathDist: () => 4 });
  assert.deepStrictEqual(ids(got), [3, 1, 2]);
  assert.deepStrictEqual(ids(cands), [3, 1, 2]);
  assert.deepStrictEqual(T.sortEnemies(mk(100), [], { blockedFirst: true, pathDist: () => 0 }), []);
});

test('[索敌-3] the first n targets: n below 1 gives 1, a fraction is floored', () => {
  const list = [1, 2, 3, 4];
  assert.deepStrictEqual(T.firstN(list, 0), [1]);
  assert.deepStrictEqual(T.firstN(list, -4), [1]);
  assert.deepStrictEqual(T.firstN(list, 0.5), [1]);
  assert.deepStrictEqual(T.firstN(list, 1), [1]);
  assert.deepStrictEqual(T.firstN(list, 2.9), [1, 2]);
  assert.deepStrictEqual(T.firstN(list, 9), list);
  assert.deepStrictEqual(T.firstN([], 3), []);
});

test('[索敌-3] the insertion sort is stable, sorts in place and agrees with Array.prototype.sort', () => {
  const item = fc.record({ key: fc.integer({ min: 0, max: 3 }) });
  fc.assert(fc.property(fc.array(item, { maxLength: 30 }), (raw) => {
    const items = raw.map((r, i) => ({ ...r, i }));
    const cmp = (/** @type {any} */ a, /** @type {any} */ b) => a.key - b.key;
    const out = T.insertionSort([...items], cmp);
    const ref = [...items].sort(cmp);
    assert.deepStrictEqual(out, ref);
    for (let n = 1; n < out.length; n++) {
      assert.ok(out[n - 1].key < out[n].key || (out[n - 1].key === out[n].key && out[n - 1].i < out[n].i));
    }
    const inPlace = [...items];
    assert.equal(T.insertionSort(inPlace, cmp), inPlace);
    return true;
  }), { seed: SEED, numRuns: 300 });
});

test('[索敌-3] 仇恨值 is compared at a precision of 0.1, truncating toward zero (INF-0019), never giving −0', () => {
  assert.equal(T.precisionKey(0.19), 1);
  assert.equal(T.precisionKey(-0.19), -1);
  assert.equal(T.precisionKey(0.05), 0);
  assert.equal(T.precisionKey(-0.05), 0);
  assert.equal(Object.is(T.precisionKey(-0.05), 0), true);
  assert.equal(Object.is(T.precisionKey(-0), 0), true);
  assert.equal(T.precisionKey(7, 1), 7);
  assert.equal(T.precisionKey(0.75, 0.5), 1);
  assert.equal(T.precisionKey(-0.75, 0.5), -1);
});

test('[索敌-3] 仇恨值 of an enemy: 10⁸ per taunt level minus the path distance, the distance clamped to ±10⁸', () => {
  assert.equal(T.enemyHatred(0, 12), -12);
  assert.equal(T.enemyHatred(2, 12), 2e8 - 12);
  assert.equal(T.enemyHatred(0, 1e12), -1e8);
  assert.equal(T.enemyHatred(0, -1e12), 1e8);
  assert.equal(T.enemyHatred(1, 1e12), 0);
});

test('[索敌-4] taunt beats any path distance: a taunt-1 enemy far away comes before a taunt-0 enemy next to the goal', () => {
  const dist = new Map([[1, 1e6], [2, 0]]);
  const pathDist = (/** @type {any} */ e) => /** @type {number} */ (dist.get(e.id));
  const far = mk(1, { base: { tauntLevel: 1 } }), near = mk(2);
  assert.deepStrictEqual(ids(T.sortEnemies(mk(100), [near, far], { blockedFirst: false, pathDist })), [1, 2]);
  const shy = mk(3, { base: { tauntLevel: -1 } });
  dist.set(3, 0);
  assert.deepStrictEqual(ids(T.sortEnemies(mk(100), [shy, far, near], { blockedFirst: false, pathDist })), [1, 2, 3]);
  assert.ok(T.enemyHatred(1, 1e6) > T.enemyHatred(0, 0 - 1e6));
});

test('[索敌-4] taunt is an attribute clamped to −2…2, so a buff beyond that gains nothing', () => {
  const up = withBuff({ mods: { taunt: 5 } }), down = withBuff({ mods: { taunt: -5 } });
  assert.equal(T.enemyHatred(2, 0), 2e8);
  const base2 = mk(2, { base: { tauntLevel: 2 } }), baseDown = mk(3, { base: { tauntLevel: -2 } });
  const dist = new Map([[1, 50], [2, 10], [3, 50]]);
  const pathDist = (/** @type {any} */ e) => /** @type {number} */ (dist.get(e.id));
  // clamped to 2 like base2, so the nearer base2 comes first (unclamped, the buffed one would)
  assert.deepStrictEqual(ids(T.sortEnemies(mk(100), [up, base2], { blockedFirst: false, pathDist })), [2, 1]);
  // clamped to −2 like baseDown, so the two tie on taunt and the nearer one wins (unclamped, it would be last)
  dist.set(1, 10);
  assert.deepStrictEqual(ids(T.sortEnemies(mk(100), [baseDown, down], { blockedFirst: false, pathDist })), [1, 3]);
});

/** Allies with increasing (born, bornN): a taunt level and how many frames after the one before it. */
const allyRow = fc.record({ taunt: fc.integer({ min: -2, max: 2 }), gap: fc.integer({ min: 0, max: 3 }) });
const allyLists = fc.array(allyRow, { minLength: 1, maxLength: 8 });

test('[索敌-5] an enemy\'s targets: the oracle\'s order (its blocker, taunt, the latest deployed first)', () => {
  fc.assert(fc.property(allyLists, fc.integer({ min: -1, max: 7 }), (list, blockIdx) => {
    let born = 5, bornN = 0;
    const ours = [], theirs = [];
    const blocker = blockIdx < list.length ? blockIdx : -1;
    for (const [i, a] of list.entries()) {
      bornN = i > 0 && a.gap === 0 ? bornN + 1 : 1;
      born += i > 0 ? a.gap : 0;
      ours.push(mk(i + 1, { kind: 0, base: { tauntLevel: a.taunt }, born, bornN }));
      theirs.push(oracleUnit(i + 1, 'ally', a.taunt, { deploySeq: i + 1 }));
    }
    const foe = oracleUnit(100, 'enemy', 0, { blockedBy: blocker >= 0 ? theirs[blocker] : null });
    shT.sortAllyTargets(foe, theirs);
    const got = T.sortAllies(mk(100, { blockedBy: blocker >= 0 ? blocker + 1 : -1 }), ours, FPS);
    assert.deepStrictEqual(ids(got), ids(theirs));
    return true;
  }), { seed: SEED, numRuns: 200 });
});

test('[索敌-5] the unit blocking the enemy comes first, whatever its taunt and age', () => {
  const old = mk(1, { kind: 0, base: { tauntLevel: -2 }, born: 0, bornN: 1 });
  const taunting = mk(2, { kind: 0, base: { tauntLevel: 2 }, born: 90, bornN: 1 });
  const fresh = mk(3, { kind: 0, born: 120, bornN: 1 });
  assert.deepStrictEqual(ids(T.sortAllies(mk(100, { blockedBy: 1 }), [fresh, taunting, old], FPS)), [1, 2, 3]);
  assert.deepStrictEqual(ids(T.sortAllies(mk(100), [old, fresh, taunting], FPS)), [2, 3, 1], 'not blocked: taunt, then newest');
});

test('[索敌-5] units of the same frame: the one created later in it (higher bornN) comes first', () => {
  const a = mk(1, { kind: 0, born: 40, bornN: 1 }), b = mk(2, { kind: 0, born: 40, bornN: 2 }), c = mk(3, { kind: 0, born: 40, bornN: 3 });
  assert.deepStrictEqual(ids(T.sortAllies(mk(100), [a, b, c], FPS)), [3, 2, 1]);
  assert.notEqual(T.precisionKey(T.characterHatred(0, 40 / FPS, 1)), T.precisionKey(T.characterHatred(0, 40 / FPS, 2)));
});

test('[索敌-5] units created in consecutive frames are in different buckets: the later one comes first', () => {
  for (let f = 0; f < 600; f += 37) {
    const early = mk(1, { kind: 0, born: f, bornN: 1 }), late = mk(2, { kind: 0, born: f + 1, bornN: 1 });
    assert.notEqual(T.precisionKey(T.characterHatred(0, f / FPS, 1)), T.precisionKey(T.characterHatred(0, (f + 1) / FPS, 1)), `frame ${f}`);
    assert.deepStrictEqual(ids(T.sortAllies(mk(100), [early, late], FPS)), [2, 1], `frame ${f}`);
  }
});

test('[索敌-5] 仇恨值 of an ally: 3 × 10⁸ per taunt level plus the creation time in ms and the same-frame count, clamped to ±3 × 10⁸', () => {
  assert.equal(T.characterHatred(0, 2, 3), 2003);
  assert.equal(T.characterHatred(1, 0, 1), 3e8 + 1);
  assert.equal(T.characterHatred(0, 1e9, 1), 3e8);
  assert.equal(T.characterHatred(0, -1e9, 1), -3e8);
  const oldTaunting = mk(1, { kind: 0, base: { tauntLevel: 1 }, born: 0, bornN: 1 }), newPlain = mk(2, { kind: 0, born: 3000, bornN: 1 });
  assert.deepStrictEqual(ids(T.sortAllies(mk(100), [newPlain, oldTaunting], FPS)), [1, 2], 'taunt beats being the latest');
});
