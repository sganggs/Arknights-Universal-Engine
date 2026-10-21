// Zones, chains and heals for damage (docs/spec/traits.md 职业-11) on the tiny level without spawns.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step } from '../src/index.js';
import { makeEnemy } from '../src/units.js';
import { applyStatus } from '../src/status.js';
import { statsOf } from '../src/attrs.js';
import { creditedDamage } from '../src/traits.js';
import { dealEp } from '../src/elements.js';

/** @typedef {import('../src/types.js').Unit} Unit */

/** A 3 × 3 range around the operator. */
const AROUND = [-1, 0, 1].flatMap((row) => [-1, 0, 1].map((col) => ({ row, col })));

/**
 * The tiny level without spawns, two more guards `g2`, `g3`; `tweak` changes the content first.
 * @param {(c: any) => void} tweak
 */
function arena(tweak) {
  const c = tinyContent();
  c.level.waves = [];
  c.level.options = { ...c.level.options, characterLimit: 9, initialCost: 99, maxCost: 99 };
  c.operators.g2 = { ...c.operators.guard };
  c.operators.g3 = { ...c.operators.guard };
  tweak(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  /** A rooted enemy without defence at (row, col). @param {number} row @param {number} col */
  const foe = (row, col) => {
    const e = makeEnemy(w, c, { key: 'slime', route: 0 });
    e.x = col; e.y = row;
    e.base = { ...e.base, def: 0, maxHp: 1e6 };
    e.hp = e.maxHp = statsOf(e).maxHp;
    applyStatus(e, 'root', {});
    w.units.push(e);
    return e;
  };
  /** Deploys `op` at (row, col) facing right. @param {string} op @param {number} row @param {number} col */
  const put = (op, row, col) => { step(w, c, [[0, { type: 'deploy', op, row, col, dir: 0 }]]); return /** @type {Unit} */ (w.units.at(-1)); };
  /** The events of the next n frames. @param {number} n */
  const run = (n) => { /** @type {any[]} */ const ev = []; for (let i = 0; i < n; i++) ev.push(...step(w, c)); return ev; };
  return { w, c, foe, put, run };
}

test('[职业-11] a zone: the 倍率 × scale for a target inside its tiles; outside, when the zone scales the outside', () => {
  const { foe, put, run } = arena((c) => {
    c.operators.guard.range = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }];
    c.operators.guard.trait = { filter: 'ALL', targets: 'all', zone: { cells: [{ row: 0, col: 1 }], scale: 1.5, outside: false } };
  });
  const guard = put('guard', 1, 1), near = foe(1, 2), far = foe(1, 3);
  const ev = run(3).filter((e) => e.type === 'hit' && e.id === guard.id);
  assert.deepEqual(ev.slice(0, 2).map((e) => [e.target, e.damage]), [[near.id, 75], [far.id, 50]]);
  const out = arena((c) => {
    c.operators.guard.range = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }];
    c.operators.guard.trait = { filter: 'ALL', targets: 'all', zone: { cells: [{ row: 0, col: 1 }], scale: 0.5, outside: true } };
  });
  const g = out.put('guard', 1, 1), n2 = out.foe(1, 2), f2 = out.foe(1, 3);
  assert.deepEqual(out.run(3).filter((e) => e.type === 'hit' && e.id === g.id).slice(0, 2).map((e) => [e.target, e.damage]), [[n2.id, 50], [f2.id, 25]]);
});

test('[职业-11] a damage chain: the nearest enemy within the radius, each jump a share of the one before, none twice, at most max', () => {
  const { foe, put, run } = arena((c) => { c.operators.guard.trait = { chain: { max: 4, scale: 0.5, radius: 1.7, cells: null }, hitStatus: { key: 'sluggish', seconds: 0.5 } }; });
  const guard = put('guard', 1, 1), a = foe(1, 2), b = foe(1, 3.2), c3 = foe(1, 4.6), away = foe(1, 0.25);
  const hits = run(2).filter((e) => e.type === 'hit' && e.id === guard.id).map((e) => [e.target, e.damage]);
  assert.deepEqual(hits, [[a.id, 50], [b.id, 25], [c3.id, 12.5]], 'a → b (1.2) → c (1.4); the one 1.75 from a is out of reach, a is not hit twice');
  assert.equal(away.hp, away.maxHp);
  assert.deepEqual([a, b, c3].map((u) => u.buffs.some((x) => x.key === 'sluggish')), [true, true, true], 'each hit 停顿');
  const two = arena((c) => { c.operators.guard.trait = { chain: { max: 2, scale: 0.5, radius: 1.7, cells: null } }; });
  const g2 = two.put('guard', 1, 1);
  two.foe(1, 2); two.foe(1, 3); two.foe(1, 4);
  assert.equal(two.run(2).filter((e) => e.type === 'hit' && e.id === g2.id).length, 2, 'max counts the first target');
});

test('[职业-11] a heal chain: among its cells around each target, the lowest 生命比例 — full HP too — then the latest deployed', () => {
  const { put, run } = arena((c) => {
    c.operators.sniper = { ...c.operators.sniper, atk: 200, range: AROUND, trait: { heal: true, targets: 1, chain: { max: 3, scale: 0.5, radius: 0, cells: AROUND } } };
  });
  const g1 = put('guard', 1, 2), g2 = put('g2', 1, 1), g3 = put('g3', 1, 3), healer = put('sniper', 2, 2);
  g1.hp = 500; g2.hp = 900;
  const heals = run(2).filter((e) => e.type === 'heal' && e.id === healer.id).map((e) => [e.target, e.amount]);
  assert.deepEqual(heals, [[g1.id, 200], [g2.id, 100], [healer.id, 0]], 'g1 (0.5) → g2 (0.9, 100 of 100) → around g2 only the healer is left (full, 0)');
  assert.equal(g3.hp, 1000);
});

test('[职业-11] a heal for damage: the most wounded operator in range takes the share of each hit; none when nobody is', () => {
  const { foe, put, run } = arena((c) => { c.operators.guard.trait = { healOnHit: 0.5 }; });
  const guard = put('guard', 1, 1), mate = put('g2', 1, 2);
  mate.hp = 500;
  foe(1, 2);
  const ev = run(2);
  assert.deepEqual(ev.filter((e) => e.type === 'heal').map((e) => [e.id, e.target, e.amount]), [[guard.id, mate.id, 25]]);
  mate.hp = 1000;
  assert.equal(run(40).filter((e) => e.type === 'heal').length, 0);
});

/** Heal events after `n`, as [healer, target, amount]. @param {import('../src/types.js').World} w @param {number} n */
const healsSince = (w, n) => w.events.slice(n).filter((e) => e.type === 'heal').map((e) => [e.id, e.target, e.amount]);

test('[职业-11] damage other than an attack heals by its share; a gauge fill, 生命流失 and a sourceless hit do not', () => {
  const { w, c, foe, put } = arena((cc) => { cc.operators.guard.trait = { healOnHit: 0.5 }; });
  const guard = put('guard', 1, 1), mate = put('g2', 1, 2);
  mate.hp = 400;
  const e = foe(1, 2);
  let n = w.events.length;
  creditedDamage(w, c, guard, e, { type: 'true', amount: 80 });
  assert.deepEqual(healsSince(w, n), [[guard.id, mate.id, 40]], '80 × 0.5');
  e.hp = 30;
  n = w.events.length;
  creditedDamage(w, c, guard, e, { type: 'true', amount: 100 });
  assert.equal(e.hp, 0);
  assert.deepEqual(healsSince(w, n), [[guard.id, mate.id, 50]], 'the share of the damage determined, not the HP left');
  const e2 = foe(1, 2);
  n = w.events.length;
  dealEp(w, e2, 'FIRE', 10, guard);
  creditedDamage(w, c, guard, e2, { type: 'true', amount: 40, hpLoss: true });
  creditedDamage(w, c, guard, e2, { type: 'true', amount: 40, sourceless: true });
  assert.deepEqual(healsSince(w, n), []);
  n = w.events.length;
  creditedDamage(w, c, guard, e2, { type: 'elemental', amount: 40 });
  assert.deepEqual(healsSince(w, n), [[guard.id, mate.id, 20]], 'elemental HP damage still counts');
  mate.hp = mate.maxHp;
  const out = put('g3', 1, 3);
  out.hp = 200;
  n = w.events.length;
  creditedDamage(w, c, guard, e2, { type: 'true', amount: 40 });
  assert.deepEqual(healsSince(w, n), [], 'the only wounded ally is outside the attack range');
  assert.equal(out.hp, 200);
});
