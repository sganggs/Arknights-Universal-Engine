// The engine's parts the compat layer's stand-ins for Stronghold's kit functions use (docs/spec/compat.md 兼容-4): an
// attack now with a 倍率 of content's or as a heal (攻击-5), a heal chain's jump with a rule of its own for who may take
// it (职业-11), whether a unit's element values are locked (元素-3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step, bus, attackNow, healJump } from '../src/index.js';
import { makeEnemy } from '../src/units.js';
import { applyStatus } from '../src/status.js';
import { statsOf } from '../src/attrs.js';
import { addBuff, makeBuff } from '../src/buffs.js';
import { dealEp, epLocked, bursting } from '../src/elements.js';

/** @typedef {import('../src/types.js').Unit} Unit */

/** A 3 × 3 range around a tile. */
const AROUND = [-1, 0, 1].flatMap((row) => [-1, 0, 1].map((col) => ({ row, col })));

/**
 * The tiny level without spawns: guards g1…g3 besides the guard, a rooted slime without defence on `put`'s call;
 * `tweak` changes the content first.
 * @param {(c: any) => void} [tweak]
 */
function arena(tweak) {
  const c = tinyContent();
  c.level.waves = [];
  c.level.options = { ...c.level.options, characterLimit: 9, initialCost: 99, maxCost: 99 };
  for (const k of ['g1', 'g2', 'g3']) c.operators[k] = { ...c.operators.guard, atk: 0 };
  tweak?.(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  /** A rooted enemy, DEF 0, a million HP, at (row, col). @param {number} row @param {number} col */
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
  return { w, c, foe, put };
}

test('[攻击-5] an attack now as a heal: a guard heals the targets given for its 攻击力 × the attack\'s 倍率, whatever its attack is; no chance talent drawn', () => {
  const { w, c, foe, put } = arena((cc) => { cc.operators.guard.critTalents = [{ prob: 1, scale: 10 }]; });
  const guard = put('guard', 1, 1), ally = put('g1', 1, 2), e = foe(1, 4);
  ally.hp = 100;
  addBuff(guard, makeBuff({ key: 'test:atk', mods: { atkPct: 0.5 } }));
  const cd = guard.atkCd, rng = JSON.stringify(w.rng), seen = /** @type {any[]} */ ([]);
  bus.on(w, 'attack', (k) => { seen.push(k.targets.map((/** @type {Unit} */ t) => t.key)); });
  assert.equal(attackNow(w, c, guard, [ally], { heal: true }), true);
  assert.deepEqual([ally.hp, guard.atkCd, JSON.stringify(w.rng), seen], [100 + 75, cd, rng, [['g1']]], '50 + 50 %: 75 healed; its cooldown as it was; no draw for its crit');
  attackNow(w, c, guard, [ally], { heal: true, scale: 2 });
  assert.equal(ally.hp, 175 + 150, 'scale 2');
  attackNow(w, c, guard, [ally], { heal: true, scale: 0 });
  assert.equal(ally.hp, 325, 'scale 0: nothing');
  attackNow(w, c, guard, [e], { scale: 2 });
  assert.equal(1e6 - e.hp, 75 * 2 * 10, 'an attack: its crit drawn (× 10), × the 2');
  attackNow(w, c, guard, [ally], { heal: true, scale: -1 });
  attackNow(w, c, guard, [ally], { heal: true, scale: Number.NaN });
  assert.equal(ally.hp, 325 + 75 + 75, 'no number ≥ 0: its own 倍率');
});

test('[攻击-5] an attack now as a heal with no targets given takes none of its own: the enemy in its range is not healed', () => {
  const { w, c, foe, put } = arena();
  const guard = put('guard', 1, 1), near = foe(1, 2);
  near.hp = 1000;
  assert.deepEqual([attackNow(w, c, guard, null, { heal: true }), near.hp], [false, 1000]);
  assert.equal(attackNow(w, c, guard), true, 'without heal: its own target');
  assert.equal(near.hp, 1000 - 50, 'struck for its ATK');
});

test('[职业-11] healJump: the next operator of a heal chain among the cells around the last; who may take it the caller\'s `may`, by default not one refusing allies\' heals', () => {
  const { w, c, put } = arena();
  const g1 = put('g1', 1, 2), g2 = put('g2', 1, 1), g3 = put('g3', 1, 3);
  g2.hp = 500; g3.hp = 600;
  addBuff(g2, makeBuff({ key: 'test:refuse', flags: { noAllyHeal: true } }));
  assert.equal(healJump(w, c, g1, new Set([g1.id]), { cells: AROUND })?.key, 'g3', 'g2 (0.5) refuses allies\' heals');
  assert.equal(healJump(w, c, g1, new Set([g1.id]), { cells: AROUND, may: () => true })?.key, 'g2', 'a `may` that lets it in');
  assert.equal(healJump(w, c, g1, new Set([g1.id]), { cells: AROUND, may: (u) => u !== g3 && !statsOf(u).flags.noAllyHeal }), null);
  assert.equal(healJump(w, c, g1, new Set([g1.id, g3.id]), { cells: [{ row: 0, col: 1 }] }), null, 'only the cell to its right: g3, already jumped to');
});

test('[元素-3] epLocked: a unit\'s element values are locked in its burst and while it begins (its elementBurst handlers), not before or after', () => {
  const c = tinyContent();
  c.level.waves = [];
  const w = createWorld(c, { seed: 1, players: 1 }), e = makeEnemy(w, c, { key: 'slime', route: 0 });
  e.base = { ...e.base, maxHp: 1e6 };
  e.hp = e.maxHp = statsOf(e).maxHp;
  applyStatus(e, 'root', {});
  w.units.push(e);
  const seen = /** @type {boolean[][]} */ ([]);
  bus.on(w, 'elementBurst', (k) => { seen.push([epLocked(k.target), bursting(k.target)]); });
  dealEp(w, e, 'FIRE', 999, null);
  assert.equal(epLocked(e), false);
  dealEp(w, e, 'FIRE', 1, null);
  assert.deepEqual([seen, epLocked(e)], [[[true, false]], true], 'locked as it begins, before the burst buff; then in it');
  for (let i = 0; i < 300; i++) step(w, c);
  assert.equal(epLocked(e), false, 'the 10 s burst over');
});
