// Heals through 禁疗 (docs/spec/damage.md 伤害-13, traits.md 职业-6 healThrough): a healer whose trait behaviour names an
// ally heals it through its 禁疗 and 不被友方治疗 — the heal, the heal attack's choice, its chain's heals; the others stay
// under 禁疗, the one locked before its 禁疗 too; only `true` counts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step, targetsOf, healsThrough, BEHAVIOR_API_VERSION, KIND } from '../src/index.js';
import { heal } from '../src/damage.js';
import { applyStatus } from '../src/status.js';
import { addBuff, makeBuff } from '../src/buffs.js';
import { on } from '../src/bus.js';

/** @typedef {import('../src/types.js').Unit} Unit */

/** A 3 × 3 range around the operator. */
const AROUND = [-1, 0, 1].flatMap((row) => [-1, 0, 1].map((col) => ({ row, col })));

/**
 * The tiny level without spawns: a medic of branch `doc` (ATK 100) whose trait behaviour is `answer` for each ally, and
 * three guards `pet`, `mate`, `other`. @param {(t: Unit, ctx: any) => unknown} [answer] @param {(c: any) => void} [tweak]
 */
function arena(answer, tweak) {
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [];
  c.level.options = { ...c.level.options, characterLimit: 9, initialCost: 99, maxCost: 99 };
  c.operators.medic = { ...c.operators.sniper, name: 'medic', atk: 100, branch: 'doc', trait: { heal: true }, range: AROUND };
  for (const k of ['pet', 'mate', 'other']) c.operators[k] = { ...c.operators.guard, name: k };
  if (answer) c.behaviors = { traits: { doc: { healThrough: (/** @type {any} */ ctx, /** @type {Unit} */ t) => answer(t, ctx) } } };
  tweak?.(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  /** Deploys `op` at (row, col). @param {string} op @param {number} row @param {number} col */
  const put = (op, row, col) => { step(w, c, [[0, { type: 'deploy', op, row, col, dir: 0 }]]); return /** @type {Unit} */ (w.units.at(-1)); };
  /** The heals of the next n frames: [healer key, target key, amount]. @param {number} n */
  const heals = (n) => {
    const out = [];
    for (let i = 0; i < n; i++) for (const e of step(w, c)) if (e.type === 'heal') out.push([w.units.find((u) => u.id === e.id)?.key, w.units.find((u) => u.id === e.target)?.key, e.amount]);
    return out;
  };
  return { w, c, put, heals };
}

/** 禁疗 on a unit (状态-5). @param {Unit} u */
const healFree = (u) => { applyStatus(u, 'healFree', {}); };
/** 不被友方治疗 on a unit (职业-9). @param {Unit} u */
const noAllyHeal = (u) => { addBuff(u, makeBuff({ key: 'aloof', flags: { noAllyHeal: true } })); };

test('[伤害-13] heal through: neither 禁疗 nor 不被友方治疗 voids it; the multipliers and the heal event as usual; without it, nothing', () => {
  const { w, put } = arena();
  const medic = put('medic', 2, 2), pet = put('pet', 1, 2), mate = put('mate', 1, 3);
  healFree(pet); noAllyHeal(mate);
  pet.hp = 500; mate.hp = 500;
  assert.deepEqual([heal(w, medic, pet, 100), heal(w, medic, mate, 100)], [0, 0], '禁疗, 不被友方治疗');
  addBuff(medic, makeBuff({ key: 'out', mods: { healingDealtMul: 1.5 } }));
  addBuff(pet, makeBuff({ key: 'in', mods: { healingTakenMul: 2 } }));
  const seen = /** @type {number[]} */ ([]);
  on(w, 'heal', (k) => { seen.push(k.amount); k.amount += 1; });
  assert.deepEqual([heal(w, medic, pet, 100, { through: true }), heal(w, medic, mate, 100, { through: true })], [301, 151]);
  assert.deepEqual([seen, pet.hp, mate.hp], [[300, 150], 801, 651], '100 × 1.5 × 2, then the handler’s +1');
  pet.hp = 500;
  assert.equal(heal(w, medic, pet, 100, { free: true }), 301, '职业-29’s free passes 禁疗 as before');
  assert.equal(heal(w, medic, mate, 100, { free: true }), 0, 'but not 不被友方治疗');
  healFree(medic);
  medic.hp = 200;
  assert.deepEqual([heal(w, medic, medic, 100), heal(w, medic, medic, 100, { through: true })], [0, 151], 'its own heal under its own 禁疗: through it too');
});

test('[伤害-13] [职业-6] healThrough: the heal attack takes the ally its behaviour names under 禁疗 and heals it; another under 禁疗 stays out', () => {
  const { w, c, put, heals } = arena((t) => t.key === 'pet');
  const medic = put('medic', 2, 2), pet = put('pet', 1, 2), other = put('other', 1, 3);
  healFree(pet); healFree(other);
  pet.hp = 600; other.hp = 300;
  assert.deepEqual(targetsOf(w, c, medic), [pet], 'the other is lower but under 禁疗');
  const got = heals(31);
  assert.deepEqual(got[0], ['medic', 'pet', 100]);
  assert.ok(got.every((h) => h[1] === 'pet'), JSON.stringify(got));
  assert.deepEqual([pet.hp, other.hp], [600 + 100 * got.length, 300]);
  const none = arena();
  const m2 = none.put('medic', 2, 2), p2 = none.put('pet', 1, 2);
  healFree(p2);
  p2.hp = 600;
  assert.deepEqual([targetsOf(none.w, none.c, m2), none.heals(31), p2.hp], [[], [], 600], 'no behaviour: 禁疗 as before');
});

test('[伤害-13] healThrough: only true counts; the behaviour sees its operator and its trait blackboard, and is asked only about units under 禁疗', () => {
  for (const say of [false, 1, 'yes', undefined, null]) {
    const { w, c, put } = arena(() => say);
    const medic = put('medic', 2, 2), pet = put('pet', 1, 2);
    healFree(pet);
    pet.hp = 500;
    assert.deepEqual([targetsOf(w, c, medic), healsThrough(w, c, medic, pet)], [[], false], String(say));
  }
  const bare = arena(undefined, (cc) => { cc.behaviors = { traits: { doc: { skip: () => false } } }; });
  const m0 = bare.put('medic', 2, 2), p0 = bare.put('pet', 1, 2);
  healFree(p0);
  p0.hp = 500;
  assert.deepEqual([targetsOf(bare.w, bare.c, m0), healsThrough(bare.w, bare.c, m0, p0)], [[], false], 'a behaviour without healThrough');
  const asked = /** @type {[string, string, number][]} */ ([]);
  const { w, c, put } = arena((t, ctx) => { asked.push([ctx.self.key, t.key, ctx.bb.heal_scale]); return true; }, (cc) => { cc.operators.medic.trait = { heal: true, bb: { heal_scale: 0.7 } }; });
  const medic = put('medic', 2, 2), pet = put('pet', 1, 2), mate = put('mate', 1, 3);
  healFree(pet);
  pet.hp = 500; mate.hp = 400;
  assert.deepEqual(targetsOf(w, c, medic), [mate, pet], 'by HP ratio, the one it heals through among them');
  assert.deepEqual(asked, [['medic', 'pet', 0.7]], 'asked about the one under 禁疗 only');
  assert.equal(healsThrough(w, c, /** @type {Unit} */ ({ ...medic, kind: KIND.ENEMY }), pet), false, 'not an operator: no behaviour');
});

test('[伤害-13] healThrough: through 不被友方治疗 too; a full-HP one is not taken; a heal locked on another that takes 禁疗 before it lands is void', () => {
  const { w, c, put, heals } = arena((t) => t.key === 'pet', (cc) => { cc.operators.medic.attack = { duration: 1, hit: 0.5 }; });
  const medic = put('medic', 2, 2), pet = put('pet', 1, 2), other = put('other', 1, 3);
  noAllyHeal(pet);
  assert.deepEqual(targetsOf(w, c, medic), [], 'full HP: not taken');
  pet.hp = 900; other.hp = 100;
  for (let i = 0; i < 60 && !medic.swing; i++) step(w, c);
  assert.deepEqual(medic.swing?.targets, [other.id], 'the lowest ratio is locked');
  healFree(other);
  pet.hp = 50;
  const got = heals(15).filter((h) => h[0] === 'medic');
  assert.deepEqual(got[0], ['medic', 'other', 0], 'the heal lands on 禁疗 it does not heal through: void');
  assert.equal(other.hp, 100);
  const next = heals(60).filter((h) => h[0] === 'medic');
  assert.deepEqual(next[0], ['medic', 'pet', 100], 'then it takes the one under 不被友方治疗 it heals through');
});

test('[伤害-13] [职业-11] a heal chain’s jump onto an ally it heals through 禁疗 heals it; without that, the jump’s heal is void', () => {
  /** @param {boolean} through */
  const run = (through) => {
    const { put, heals } = arena(through ? (t) => t.key === 'pet' : () => false, (cc) => {
      cc.operators.medic.trait = { heal: true, targets: 1, chain: { max: 3, scale: 0.5, radius: 0, cells: AROUND } };
    });
    put('medic', 2, 2);
    const mate = put('mate', 1, 2), pet = put('pet', 1, 1);
    healFree(pet);
    mate.hp = 500; pet.hp = 800;
    return { got: heals(2).filter((h) => h[0] === 'medic'), pet };
  };
  const yes = run(true), no = run(false);
  assert.deepEqual(yes.got.slice(0, 2), [['medic', 'mate', 100], ['medic', 'pet', 50]], 'mate, then the jump to pet at half');
  assert.equal(yes.pet.hp, 850);
  assert.deepEqual(no.got.slice(0, 2), [['medic', 'mate', 100], ['medic', 'pet', 0]], 'the same jump, void under 禁疗');
  assert.equal(no.pet.hp, 800);
});

test('[职业-6] the behaviour interface is version 6: a trait behaviour may name the allies its operator heals through 禁疗', () => {
  assert.equal(BEHAVIOR_API_VERSION, 6);
});
