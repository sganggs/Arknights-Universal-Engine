// The memos of pure functions the frame asks many times (docs/spec/attributes.md 属性-1…属性-3, status.md 状态-2,
// traits.md 职业-1): statsOf and traitOfDef give their last answer again only while everything it was made from is the
// same — changed through the engine or in place by content — and always the answer a fresh computation gives.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { tinyContent } from '@aue/testkit';
import { DIR } from '@aue/schema';
import { statsOf, computeStats, activeBuffs, maxHpOf } from '../src/attrs.js';
import { makeBuff, addBuff } from '../src/buffs.js';
import { traitOfDef } from '../src/traits.js';
import { reachKeys, setRange, setExtraRange } from '../src/reach.js';
import { inKeys } from '../src/targeting.js';
import { bodyKeys } from '../src/body.js';
import { createWorld, step } from '../src/world.js';

const SEED = 20261014;

/** A unit as statsOf reads it. @param {Record<string, any>} [base] @param {any[]} [buffs] @returns {any} */
const unitOf = (base = {}, buffs = []) => ({ base: { maxHp: 1000, atk: 300, def: 100, res: 10, aspd: 100, bat: 1, blockCnt: 1, moveSpeed: 1, motion: 'WALK', immune: [], ...base }, buffs });

/** statsOf's answer is a fresh computation's, and, asked again at once, the same object. @param {any} u */
function fresh(u) {
  const s = statsOf(u);
  assert.deepStrictEqual(s, computeStats(u));
  assert.equal(statsOf(u), s, 'the same object while nothing changed');
  return s;
}

test('[属性-1] [属性-2] statsOf gives its last stats again while nothing changed, and new ones after any change it reads', () => {
  const u = unitOf({}, [makeBuff({ key: 'a', mods: { atkFlat: 50 } }), makeBuff({ key: 'b', mods: { aspd: 20 }, flags: { root: true } })]);
  let s = fresh(u);
  /** @type {[string, () => void][]} */
  const changes = [
    ['a base value in place', () => { u.base.atk = 400; }], ['a base value added', () => { u.base.hpRecoveryPerSec = 5; }],
    ['the motion', () => { u.base.motion = 'FLY'; }], ['an immunity added in place', () => { u.base.immune.push('root'); }],
    ['a mod in place', () => { u.buffs[0].mods.atkFlat = 70; }], ['a mod added in place', () => { u.buffs[0].mods.defPct = 0.5; }],
    ['a mod deleted in place', () => { delete u.buffs[0].mods.defPct; }], ['the mods replaced', () => { u.buffs[0].mods = { atkFlat: 70 }; }],
    ['a flag in place', () => { u.buffs[1].flags.stun = true; }], ['the stacks', () => { u.buffs[0].stacks = 2; }],
    ['the rule', () => { u.buffs[1].rule = 'max'; }], ['the value', () => { u.buffs[1].value = 3; }], ['the key', () => { u.buffs[1].key = 'a'; }],
    ['a buff added', () => { u.buffs.push(makeBuff({ key: 'c', mods: { atkMul: 1.5 } })); }], ['a buff taken', () => { u.buffs.splice(0, 1); }],
    ['the buffs replaced', () => { u.buffs = [makeBuff({ key: 'd', mods: { defFlat: 9 } })]; }], ['the base replaced', () => { u.base = { ...u.base, def: 1 }; }],
  ];
  for (const [what, change] of changes) {
    change();
    const next = fresh(u);
    assert.notEqual(next, s, what);
    s = next;
  }
  u.buffs = [...u.buffs];
  assert.deepStrictEqual(statsOf(u), computeStats(u), 'a copy of the same buffs');
  u.buffs[0].left = 1;
  assert.equal(statsOf(u), statsOf(u), 'time left is not read');
});

/** What each random change does to a unit (a buff picked by index among those it has). @type {Record<string, (u: any, o: any, b: any) => void>} */
const CHANGES = {
  add: (u, o) => { u.buffs.push(makeBuff({ key: o.key, rule: o.rule, value: o.v, mods: { [o.k]: o.v } })); },
  base: (u, o) => { u.base[o.k] = o.v; },
  set: (_u, o, b) => { if (b) b.mods[o.k] = o.v; },
  flag: (_u, o, b) => { if (b) b.flags[o.k] = o.on; },
  stacks: (_u, o, b) => { if (b) b.stacks = o.n; },
  drop: (u, _o, b) => { if (b) u.buffs.splice(u.buffs.indexOf(b), 1); },
};
/** @param {any} u @param {any} o */
const apply = (u, o) => CHANGES[o.t](u, o, u.buffs.length ? u.buffs[(o.i ?? 0) % u.buffs.length] : null);

test('[属性-2] [状态-2] statsOf equals a fresh computation after any random sequence of changes', () => {
  const mod = fc.constantFrom('atkFlat', 'atkPct', 'atkMul', 'defFlat', 'aspd', 'hpPct', 'dmgDealtMul', 'dodgePhys');
  const op = fc.oneof(
    fc.record({ t: fc.constant('add'), key: fc.constantFrom('a', 'b', 'c'), rule: fc.constantFrom('queue', 'max', 'independent'), k: mod, v: fc.double({ min: -2, max: 2, noNaN: true }) }),
    fc.record({ t: fc.constant('set'), i: fc.nat(5), k: mod, v: fc.double({ min: -2, max: 2, noNaN: true }) }),
    fc.record({ t: fc.constant('flag'), i: fc.nat(5), k: fc.constantFrom('stun', 'levitate', 'immune:stun', 'sleep'), on: fc.boolean() }),
    fc.record({ t: fc.constant('drop'), i: fc.nat(5) }), fc.record({ t: fc.constant('stacks'), i: fc.nat(5), n: fc.integer({ min: 1, max: 4 }) }),
    fc.record({ t: fc.constant('base'), k: fc.constantFrom('atk', 'def', 'aspd', 'maxHp', 'statusRes'), v: fc.double({ min: 0, max: 500, noNaN: true }) }),
  );
  fc.assert(fc.property(fc.array(op, { maxLength: 30 }), (ops) => {
    const u = unitOf();
    for (const o of ops) {
      apply(u, /** @type {any} */ (o));
      assert.ok(Object.is(maxHpOf(u), computeStats(u).maxHp), 'the maximum HP alone, to the bit');
      assert.deepStrictEqual(statsOf(u), computeStats(u));
      assert.ok(Object.is(maxHpOf(u), statsOf(u).maxHp));
    }
  }), { seed: SEED, numRuns: 300 });
});

test('[属性-1] maxHpOf reads a mod as statsOf does: an own key that for…in visits, not a hidden or an inherited one', () => {
  const u = unitOf({}, [makeBuff({ key: 'a' })]), mods = Object.create({ hpFlat: 300 });
  Object.defineProperty(mods, 'hpPct', { value: 0.5, enumerable: false });
  mods.hpFinal = 20;
  u.buffs[0].mods = mods;
  assert.ok(Object.is(maxHpOf(u), computeStats(u).maxHp));
  assert.ok(Object.is(maxHpOf(u), statsOf(u).maxHp));
});

test('[状态-2] activeBuffs hands out a list of its own, also when every buff takes effect; long lists take the general way', () => {
  const list = [makeBuff({ key: 'a' }), makeBuff({ key: 'b', rule: 'independent' }), makeBuff({ key: 'b' })];
  const act = activeBuffs(list);
  assert.notEqual(act, list);
  assert.deepEqual(act, list);
  const long = Array.from({ length: 20 }, (_, i) => makeBuff({ key: `k${i % 18}`, rule: 'max', value: i, mods: { atkFlat: i } }));
  assert.deepEqual(activeBuffs(long).map((b) => b.value), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  assert.deepStrictEqual(statsOf(unitOf({}, long)), computeStats(unitOf({}, long)));
});

test('[职业-1] a record\'s trait is the same object while its position and trait fields are, made again after any change', () => {
  /** @type {any} */
  const d = { position: 'MELEE', trait: { targets: 2 } };
  let t = traitOfDef(d);
  assert.equal(traitOfDef(d), t);
  /** @type {[string, () => void, (x: any) => boolean][]} */
  const changes = [
    ['a field in place', () => { d.trait.targets = 3; }, (x) => x.targets === 3],
    ['a field added', () => { d.trait.heal = true; }, (x) => x.heal === true],
    ['a field deleted', () => { delete d.trait.heal; }, (x) => x.heal === false],
    ['the trait replaced', () => { d.trait = { targets: 3 }; }, (x) => x.targets === 3],
    ['the position', () => { d.position = 'RANGED'; }, (x) => x.antiAir === true && x.blockedFirst === false],
    ['no trait', () => { d.trait = undefined; }, (x) => x.targets === 1],
  ];
  for (const [what, change, holds] of changes) {
    change();
    const next = traitOfDef(d);
    assert.notEqual(next, t, what);
    assert.ok(holds(next), what);
    assert.equal(traitOfDef(d), next);
    t = next;
  }
});

test('[攻击-1] [技能-8] an operator\'s reach is the same set while nothing it is worked out from changed, and new after any change', () => {
  const c = tinyContent(), w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: DIR.RIGHT }]]);
  const op = /** @type {any} */ (w.units.find((u) => u.key === 'guard'));
  /** A fresh computation's answer: the same unit as another object, which has no memo. */
  const fresh = () => [...reachKeys(c, { ...op })].sort((a, b) => a - b);
  let keys = reachKeys(c, op);
  assert.equal(reachKeys(c, op), keys);
  /** @type {[string, () => void][]} */
  const changes = [
    ['a step', () => { op.x = 2; }], ['a turn', () => { op.dir = 'LEFT'; }], ['its own range', () => { setRange(op, [{ row: 0, col: 1 }, { row: 0, col: 2 }]); }],
    ['a cell of it in place', () => { op.range[1].col = 3; }], ['a cell of it added in place', () => { op.range.push({ row: 0, col: 2 }); }],
    ['extra tiles', () => { setExtraRange(c, op, [0, 5]); }], ['other extra tiles', () => { setExtraRange(c, op, [0, 4]); }],
    ['攻击距离', () => { addBuff(op, makeBuff({ key: 'far', mods: { rangeExtend: 1 } })); }], ['its record\'s range back', () => { setRange(op, null); }],
  ];
  for (const [what, change] of changes) {
    change();
    const next = reachKeys(c, op);
    assert.notEqual(next, keys, what);
    assert.deepEqual([...next].sort((a, b) => a - b), fresh(), what);
    keys = next;
  }
});

test('[体积-1] [体积-2] inKeys of a unit other than a regular enemy is the tiles of its body: the same answer as bodyKeys, at halves and off the map too', () => {
  const grid = { rows: 3, cols: 6 }, pos = fc.integer({ min: -4, max: 16 }).map((n) => n / 2);
  const area = fc.option(fc.record({ w: fc.integer({ min: 1, max: 3 }), h: fc.integer({ min: 1, max: 3 }), dx: fc.constantFrom(0, 0.5), dy: fc.constantFrom(0, -0.5) }), { nil: undefined });
  fc.assert(fc.property(pos, pos, area, fc.uniqueArray(fc.integer({ min: 0, max: 17 }), { maxLength: 6 }), (x, y, hitArea, ks) => {
    const u = /** @type {any} */ ({ x, y, ...(hitArea ? { hitArea } : {}) }), keys = new Set(ks);
    return inKeys(u, keys, grid) === bodyKeys(u, grid).some((k) => keys.has(k));
  }), { seed: SEED, numRuns: 2000 });
});
