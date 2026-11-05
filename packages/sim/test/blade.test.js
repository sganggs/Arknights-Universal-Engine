// The engine side of 【国度】 (docs/spec/foes.md 敌能-141): the enemy context's `deployable(row, col)`, and the attack
// mods' `vsBuff` — a 倍率 on a target that holds a buff of a key, looked at as each hit is worked out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step } from '../src/index.js';
import { makeEnemy, makeOperator } from '../src/units.js';
import { foeSpawn } from '../src/foes.js';
import { addBuff, makeBuff } from '../src/buffs.js';

/** @typedef {import('../src/types.js').World} World @typedef {import('../src/types.js').Unit} Unit */

/**
 * The tiny map without waves; enemy `foe` with the given record fields and behaviours.
 * @param {Record<string, unknown>} def @param {Record<string, any>} behaviors
 */
function arena(def, behaviors) {
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [];
  c.enemies.foe = { name: 'foe', maxHp: 1000, atk: 100, def: 0, res: 0, moveSpeed: 0, ...def };
  c.behaviors = { foes: behaviors };
  const w = createWorld(c, { seed: 1, players: 1 });
  return { c, w };
}
/** An enemy of the arena at (row, col). @param {World} w @param {any} c @param {number} row @param {number} col */
function foe(w, c, row, col) {
  const e = makeEnemy(w, c, { key: 'foe', route: 0 });
  e.x = col; e.y = row;
  w.units.push(e);
  foeSpawn(w, c, e);
  return e;
}
/** An operator at (row, col). @param {World} w @param {any} c @param {string} key @param {number} row @param {number} col */
function op(w, c, key, row, col) {
  const u = makeOperator(w, c, { key, owner: 0, row, col, dir: 0 });
  w.units.push(u);
  return u;
}
/** HP each unit lost to the enemy over n frames. @param {World} w @param {any} c @param {Unit} e @param {number} n */
function hitsBy(w, c, e, n) {
  /** @type {[number, number][]} */
  const out = [];
  for (let i = 0; i < n; i++) for (const ev of step(w, c)) if (ev.type === 'hit' && ev.id === e.id) out.push([Number(ev.target), Number(ev.damage)]);
  return out;
}

/** Cells of the tiny map and whether each is a 可部署位: road MELEE, high ground RANGED, an ALL tile; floor, start, goal, off the map. */
const CELLS = /** @type {[number, number, boolean][]} */ ([
  [1, 2, true], [0, 2, true], [0, 0, true], [0, 1, false], [2, 0, false], [1, 5, false], [-1, 2, false], [0, 6, false], [3, 0, false],
]);

test('[敌能-141] [部署-1] deployable: MELEE, RANGED and ALL tiles are 可部署位, NONE and off the map are not, whoever stands there', () => {
  /** @type {boolean[]} */
  const seen = [];
  const { c, w } = arena({ talents: { look: {} } }, {
    look: { tick: (/** @type {any} */ ctx) => { if (seen.length === 0) for (const [r, col] of CELLS) seen.push(ctx.deployable(r, col)); } },
  });
  c.level.tiles[0][0] = { ...c.level.tiles[0][0], buildable: 'ALL' };
  foe(w, c, 1, 4);
  op(w, c, 'guard', 1, 2);
  step(w, c);
  assert.deepEqual(seen, CELLS.map((x) => x[2]));
});

test('[敌能-141] vsBuff: × scale before the DEF on a target holding the buff when the hit is worked out; × 1 without', () => {
  const { c, w } = arena({ applyWay: 'MELEE', talents: { realm: {} } }, {
    realm: {
      targets: (/** @type {any} */ ctx, /** @type {Unit[]} */ cands) => [...cands, ...ctx.foes(3)],
      attack: (/** @type {any} */ _ctx, /** @type {any} */ mods) => ({ ...mods, vsBuff: { key: 'mark', scale: 3 } }),
    },
  });
  const e = foe(w, c, 1, 4), g = op(w, c, 'guard', 1, 2);
  e.atkCd = 0;
  assert.deepEqual(hitsBy(w, c, e, 2), [[g.id, 5]], 'atk 100 against DEF 100: the 5% floor');
  addBuff(g, makeBuff({ key: 'mark', src: -1 }));
  e.atkCd = 0;
  assert.deepEqual(hitsBy(w, c, e, 2), [[g.id, 100 * 3 - 100]]);
  addBuff(g, makeBuff({ key: 'other', src: -1 }));
  g.buffs = g.buffs.filter((b) => b.key !== 'mark');
  e.atkCd = 0;
  assert.deepEqual(hitsBy(w, c, e, 2), [[g.id, 5]], 'another key is not this one');
});

/** A ranged enemy whose attack carries vsBuff unless its blackboard says `off`. @param {Record<string, number>} bb */
const shooter = (bb) => arena({ applyWay: 'RANGED', rangeRadius: 3, talents: { realm: bb } }, {
  realm: { attack: (/** @type {any} */ ctx, /** @type {any} */ mods) => (ctx.bb.off ? mods : { ...mods, vsBuff: { key: 'mark', scale: 2.5 } }) },
});

test('[敌能-141] [攻击-3] a shot carries vsBuff and looks at the target on arrival; a shot without it has no such field', () => {
  const { c, w } = shooter({});
  const e = foe(w, c, 1, 4), s = op(w, c, 'sniper', 0, 2);
  step(w, c);
  assert.deepEqual(w.shots.map((x) => x.vsBuff), [{ key: 'mark', scale: 2.5 }]);
  addBuff(s, makeBuff({ key: 'mark', src: -1 }));
  assert.deepEqual(hitsBy(w, c, e, 15), [[s.id, 100 * 2.5 - 20]], 'the buff came after the launch');
  const plain = shooter({ off: 1 });
  foe(plain.w, plain.c, 1, 4);
  op(plain.w, plain.c, 'sniper', 0, 2);
  step(plain.w, plain.c);
  assert.equal(plain.w.shots.length, 1);
  assert.equal(Object.hasOwn(plain.w.shots[0], 'vsBuff'), false);
});
