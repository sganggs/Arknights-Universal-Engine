// The Stronghold functions kits call that were gaps (docs/spec/compat.md 兼容-4), with kits of our own on an open field:
// burstLocked while a burst begins and runs, aggroCmp by 仇恨值, chainHealNext by the engine's heal-chain jump with a
// kit's rules for allies, performAttack as an attack now that heals; a kit's 麻痹 value as its layers, a beforeStatus
// handler's change too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { oneWave, spawnAt } from '@aue/testkit';
import { createWorld, step, buffs, status, attrs } from '@aue/sim';
import { kitsBehaviors } from '../src/compat/kits.js';
import { burstLocked } from '../src/compat/sh/damage.js';
import { aggroCmp } from '../src/compat/sh/targeting.js';
import { chainHealNext, performAttack } from '../src/compat/sh/ai.js';

/** @typedef {import('../src/compat/battle.js').ShBattle} ShBattle @typedef {import('../src/compat/unit.js').ShUnit} ShUnit */

/** A low tile any operator may stand on. @param {string} key @param {string} [buildable] */
const tile = (key, buildable = 'ALL') => ({ key, height: 'LOWLAND', buildable, passable: 'ALL', side: 'ALL' });

/**
 * An open field 7 × 5: every tile takes any operator, the start at (2, 0), the goal at (2, 6); `n` slimes (ATK 0, a
 * million HP, DEF 0) appear at 0.1 s.
 * @param {number} n
 */
function level(n) {
  const tiles = Array.from({ length: 5 }, (_, r) => Array.from({ length: 7 }, (_, c) => (r === 2 && c === 0 ? tile('tile_start', 'NONE') : r === 2 && c === 6 ? tile('tile_end', 'NONE') : tile('tile_road'))));
  return { id: 'open', width: 7, height: 5, options: { maxLifePoint: 9, initialCost: 99, maxCost: 99, costIncreaseTime: 1, characterLimit: 9, moveMultiplier: 1 }, tiles,
    routes: [{ start: { row: 2, col: 0 }, end: { row: 2, col: 6 }, motion: 'WALK', checkpoints: [] }], waves: n ? [oneWave(Array.from({ length: n }, () => spawnAt(0.1, 'slime')))] : [] };
}

/** An operator without a kit: melee, ATK 50, 1000 HP, its own tile and the one ahead. @param {string} name @param {Record<string, any>} [o] */
const plain = (name, o = {}) => ({ name, position: 'MELEE', cost: 1, blockCnt: 1, baseAttackTime: 1, maxHp: 1000, atk: 50, def: 0, res: 0, range: [{ row: 0, col: 0 }, { row: 0, col: 1 }], ...o });

/**
 * The open field with `ops` (operator records by key) — `kits` the inline kits of some of them (factories by key; the
 * kit's def names the record's skill) — and `n` slimes, put rooted on `spots` ([row, col]) once they are there.
 * @param {{ ops: Record<string, any>, kits?: Record<string, (...args: any[]) => any>, n?: number, spots?: number[][] }} o
 */
function field(o) {
  const c = /** @type {any} */ ({ level: level(o.n ?? 0), enemies: { slime: { name: 'slime', maxHp: 1e6, atk: 0, def: 0, res: 0, moveSpeed: 1 } }, operators: o.ops, decks: [Object.keys(o.ops)] });
  const box = /** @type {{ b: ShBattle | null }} */ ({ b: null });
  const skillOf = (/** @type {string} */ k) => (o.ops[k].skill ? { id: o.ops[k].skill.id, bb: {} } : null);
  const entries = Object.fromEntries(Object.entries(o.kits ?? {}).map(([k, f]) => [k, { factory: f, def: { name: k, skill: skillOf(k), raw: {} } }]));
  c.behaviors = kitsBehaviors(entries, (x) => { box.b = x; });
  const w = createWorld(c, { seed: 1, players: 1 });
  /** @param {number} frames @param {any[]} [cmds] */
  const run = (frames, cmds = []) => { for (let i = 0; i < frames; i++) step(w, c, i === 0 ? cmds : []); };
  const b = /** @type {ShBattle} */ (box.b);
  /** The kit's unit of an operator key (or the n-th slime). @param {string} key @param {number} [i] @returns {ShUnit} */
  const unit = (key, i = 0) => b.unitOf(/** @type {any} */ (w.units.filter((u) => u.key === key)[i]));
  if (o.n) {
    run(6);
    w.units.filter((u) => u.key === 'slime').forEach((e, i) => { const [r, col] = (o.spots ?? [])[i] ?? [2, 3]; Object.assign(e, { x: col, y: r }); status.applyStatus(e, 'root', {}); });
  }
  return { w, c, b, run, unit };
}

/** A deploy command. @param {string} op @param {number} row @param {number} col @returns {[number, any]} */
const deploy = (op, row, col) => [0, { type: 'deploy', op, row, col, dir: 0 }];
/** A buff of our own on a unit. @param {ShUnit} u @param {string} key @param {Record<string, any>} o */
const give = (u, key, o) => buffs.addBuff(/** @type {any} */ (u.u), buffs.makeBuff({ key, ...o }));

test('[兼容-4] burstLocked: no before a burst; yes while its burst begins (elementBurst, no lock flag yet), runs, and no once it ends; no off the field', () => {
  /** @type {any[]} */
  const seen = [];
  const kit = () => ({ skills: {}, install(/** @type {ShBattle} */ b) { b.on('elementBurst', (k) => { seen.push([burstLocked(k.target), !!k.target.s.flags.burstLock]); }); } });
  const { b, run, unit } = field({ ops: { guard: plain('guard'), spare: plain('spare') }, kits: { guard: kit, spare: () => ({ skills: {} }) }, n: 1 });
  run(1, [deploy('guard', 2, 2)]);
  const g = unit('guard'), s = unit('slime');
  assert.equal(burstLocked(s), false, 'its element values move');
  b.dealDamage(g, s, { type: 'element', element: 'neural', amount: 999 });
  assert.deepEqual([burstLocked(s), seen], [false, []], 'one short of the burst');
  b.dealDamage(g, s, { type: 'element', element: 'neural', amount: 1 });
  assert.deepEqual(seen, [[true, false]], 'its handlers: locked before the burst buff (the flag) is there');
  assert.deepEqual([burstLocked(s), !!s.findBuff('neuralBurst')], [true, true], 'in the burst');
  run(299);
  assert.equal(burstLocked(s), true, 'the 10 s burst, its last frame');
  run(1);
  assert.deepEqual([burstLocked(s), s.findBuff('neuralBurst')], [false, null], 'over: its values move again');
  b.dealDamage(g, s, { type: 'element', element: 'neural', amount: 1000 });
  b.dealDamage(g, s, { type: 'true', amount: 2e6 });
  run(1);
  assert.deepEqual([burstLocked(s), /** @type {any} */ (s.u).buffs.some((/** @type {any} */ x) => x.key === 'burst:SANITY')], [false, true], 'knocked out in a burst: off the field, no (its burst buff kept)');
  const spare = /** @type {ShUnit} */ ([...b.pieces.values()].find((p) => p.defId === 'spare'));
  assert.deepEqual([burstLocked(spare), burstLocked(null)], [false, false], 'a piece off the field, none');
  assert.deepEqual(b.errors, []);
});

test('[兼容-4] aggroCmp: ours by 嘲讽等级, then the later created first; enemies by 嘲讽等级, then the shorter 路径距离; off the field last', () => {
  const { b, run, unit } = field({ ops: { g1: plain('g1'), g2: plain('g2'), g3: plain('g3'), spare: plain('spare') }, kits: { spare: () => ({ skills: {} }) }, n: 2, spots: [[2, 2], [2, 4]] });
  run(1, [deploy('g1', 1, 1), deploy('g2', 1, 2)]);
  run(3, [deploy('g3', 1, 3)]);
  const [g1, g2, g3] = ['g1', 'g2', 'g3'].map((k) => unit(k)), names = (/** @type {ShUnit[]} */ l) => l.map((x) => x.defId);
  assert.deepEqual(names([g1, g2, g3].sort(aggroCmp)), ['g3', 'g2', 'g1'], 'g3 three frames later; g2 the second of its frame');
  give(g1, 'test:taunt', { mods: { taunt: 1 } });
  assert.deepEqual(names([g2, g3, g1].sort(aggroCmp)), ['g1', 'g3', 'g2'], 'a higher 嘲讽等级 first');
  give(g3, 'test:taunt', { mods: { taunt: -1 } });
  assert.deepEqual(names([g3, g2, g1].sort(aggroCmp)), ['g1', 'g2', 'g3']);
  const far = unit('slime', 0), near = unit('slime', 1);
  assert.deepEqual([aggroCmp(near, far), aggroCmp(far, near)], [-1, 1], 'nearer its goal first');
  give(far, 'test:taunt', { mods: { taunt: 1 } });
  assert.equal(aggroCmp(far, near), -1, 'its 嘲讽等级 first');
  const spare = /** @type {ShUnit} */ ([...b.pieces.values()].find((p) => p.defId === 'spare'));
  assert.deepEqual([aggroCmp(spare, g2), aggroCmp(g2, spare), aggroCmp(spare, spare)], [1, -1, 0], 'off the field after the others');
  /** @type {any} */ (g1.u).hp = 0;
  assert.deepEqual([aggroCmp(g1, g2), aggroCmp(g2, g1)], [1, -1], 'g1 at 0 HP: after the others, its 嘲讽等级 aside');
});

test('[兼容-4] aggroCmp: an enemy by its 路径距离 whenever it appeared, its 仇恨值 compared at the precision 0.1', () => {
  const { unit } = field({ ops: { guard: plain('guard') }, n: 3, spots: [[2, 3], [2, 3], [2, 3]] });
  const [first, second, third] = [0, 1, 2].map((i) => unit('slime', i));
  // one tile, 3 steps from the goal, less the offset towards it (索敌-6's 修正值): 2.8, 2.98, 2.93
  const at = (/** @type {ShUnit} */ e, /** @type {number} */ x) => { /** @type {any} */ (e.u).x = x; };
  at(first, 3.2); at(second, 3.02); at(third, 3.07);
  assert.deepEqual([aggroCmp(first, second), aggroCmp(second, first)], [-1, 1], 'the first to appear, nearer its goal: first');
  assert.equal(aggroCmp(second, third), 0, '2.98 and 2.93: the same 仇恨值 at 0.1 (向零取整)');
});

/**
 * The open field with a medic under a kit at (0, 0) — its trait's `healThrough` says yes for g4 and throws for g5 — and
 * guards: g1 on (2, 2), g2 on (2, 3) and g3 on (1, 2), g3 deployed two frames after the others.
 */
function chainField() {
  const kit = () => ({ skills: {}, trait: { healThrough: (/** @type {any} */ _h, /** @type {ShUnit} */ a) => { if (a.defId === 'g5') throw new Error('no'); return a.defId === 'g4'; } } });
  const ops = Object.fromEntries(['medic', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6'].map((k) => [k, plain(k)]));
  const m = field({ ops, kits: { medic: kit } });
  m.run(1, [deploy('medic', 0, 0), deploy('g1', 2, 2), deploy('g2', 2, 3)]);
  m.run(2, [deploy('g3', 1, 2)]);
  const [medic, g1, g2, g3] = ['medic', 'g1', 'g2', 'g3'].map((k) => m.unit(k));
  /** Sets an HP ratio. @param {ShUnit} u @param {number} r */
  const ratio = (u, r) => { /** @type {any} */ (u.u).hp = r * u.maxHp; };
  /** The next jump of the medic's chain from `from`, none of `seen` (the kits' ids). @param {ShUnit[]} seen @param {ShUnit} [from] */
  const next = (seen = [g1], from = g1) => chainHealNext(m.b, medic, from, new Set(seen.map((x) => x.id)))?.defId ?? null;
  return { ...m, medic, g1, g2, g3, ratio, next };
}

test('[兼容-4] chainHealNext: the 3 × 3 around the last one, the lowest HP ratio at 0.001, then the latest deployed; full HP too; none twice', () => {
  const { g1, g2, g3, ratio, next } = chainField();
  ratio(g2, 0.5); ratio(g3, 0.8);
  assert.equal(next(), 'g2');
  ratio(g2, 0.9);
  assert.equal(next(), 'g3', 'the lower ratio');
  ratio(g2, 0.5); ratio(g3, 0.5004);
  assert.equal(next(), 'g3', 'within 0.001: g3, deployed later');
  ratio(g3, 0.5014);
  assert.equal(next(), 'g2');
  ratio(g2, 1); ratio(g3, 1);
  assert.equal(next(), 'g3', 'all at full HP: the latest deployed');
  assert.equal(next([g1, g3]), 'g2', 'not one already jumped to');
  assert.equal(next([g1, g2, g3]), null, 'the medic, two tiles from g1, is not on its 3 × 3');
  assert.equal(next([g2, g3], g2), 'g1', 'from g2: g1 next to it');
});

test('[兼容-4] chainHealNext: never a 孤立 ally; one that refuses allies\' heals only through the healer\'s kit trait (INF-1130); the healer itself either way; 禁疗 still', () => {
  const { b, run, unit, medic, g1, g2, g3, ratio, next } = chainField();
  run(1, [deploy('g4', 3, 2), deploy('g5', 3, 3), deploy('g6', 0, 1)]);
  const [g4, g5, g6] = ['g4', 'g5', 'g6'].map((k) => unit(k));
  ratio(g2, 0.5); ratio(g3, 0.6); ratio(g4, 0.3); ratio(g5, 0.2);
  for (const x of [g4, g5]) give(x, 'test:refuse', { flags: { noAllyHeal: true } });
  assert.equal(next(), 'g4', 'g5 (0.2) refuses and the answer for it throws; g4 (0.3) through the trait');
  assert.deepEqual(b.errors.map((e) => e.label), ['profile.healThrough'], 'that answer recorded');
  give(g4, 'test:alone', { flags: { isolated: true } });
  assert.equal(next(), 'g2', 'g4 孤立: not even through the trait');
  give(g2, 'test:alone', { flags: { isolated: true } });
  assert.equal(next(), 'g3', 'g2 孤立');
  status.applyStatus(/** @type {any} */ (g3.u), 'healFree', {});
  assert.equal(next(), 'g3', 'g3 under 禁疗: jumped to (its heal void, 职业-11)');
  ratio(medic, 0.1);
  for (const x of [medic, g6]) give(x, 'test:alone', { flags: { isolated: true } });
  assert.equal(next([g1, g3], g6), 'medic', 'from g6: the medic, 孤立 but the healer');
  ratio(medic, 1);
  assert.equal(next([g1, g3, medic], g6), null, 'g6 孤立 itself, g3 already jumped to');
  ratio(medic, 0.1);
  give(medic, 'test:refuse', { flags: { noAllyHeal: true } });
  assert.equal(next([g1, g3], g6), 'medic', 'the healer refusing allies\' heals too: its own heal reaches it (职业-9)');
});

/**
 * The open field with a guard under our kit at (2, 2) (ATK 50 + 50 %: 75 now; the slime out of its range), an ally that
 * does not attack at (2, 3) at 100 HP and a slime (DEF 0) at (2, 4); `spec` the kit's description of the guard's skill `s`, running from the start when given.
 * @param {Record<string, any> | null} [spec]
 */
function attackField(spec = null) {
  const guard = plain('guard', spec ? { skill: { id: 's', type: 'AUTO', sp: 'time', cost: 1, init: 1, charges: 1, duration: 0, ammo: false, bb: {} } } : {});
  const m = field({ ops: { guard, ally: plain('ally', { atk: 0, range: [{ row: 0, col: 0 }] }) }, kits: { guard: () => ({ skills: spec ? { s: spec } : {} }) }, n: 1, spots: [[2, 4]] });
  m.run(2, [deploy('guard', 2, 2), deploy('ally', 2, 3)]);
  const g = m.unit('guard'), ally = m.unit('ally'), e = m.unit('slime');
  give(g, 'test:atk', { mods: { atkPct: 0.5 } });
  /** @type {any} */ (ally.u).hp = 100;
  return { ...m, g, ally, e, healProfile: { ...m.b.effectiveProfile(g), dmgType: 'heal', heal: { mode: 'single' } } };
}

test('[兼容-4] performAttack: a heal profile heals the targets given now — a guard\'s too —, its 攻击力 now × atkScale × healScale; its cooldown untouched', () => {
  const { b, g, ally, e, healProfile } = attackField();
  const cd = /** @type {any} */ (g.u).atkCd, atk = attrs.statsOf(/** @type {any} */ (g.u)).atk;
  assert.equal(atk, 75);
  assert.equal(performAttack(b, g, { ...healProfile, atkScale: 2, healScale: 1.5 }, [ally]), true);
  assert.deepEqual([ally.hp, e.hp, /** @type {any} */ (g.u).atkCd], [100 + 75 * 3, 1e6, cd], '225 healed; the slime untouched; the cooldown as it was');
  performAttack(b, g, { ...healProfile, atkScale: 1, healScale: 1 }, [ally]);
  assert.equal(ally.hp, 325 + 75);
  performAttack(b, g, { ...healProfile, atkScale: 1, healScale: 4 }, [ally]);
  assert.equal(ally.hp, 400 + 300, 'healScale');
  assert.equal(performAttack(b, g, { ...healProfile, healScale: 2 }, [ally]), true);
  assert.equal(ally.hp, 700 + 150, 'no atkScale: 1');
  assert.deepEqual(b.errors, []);
});

test('[兼容-4] performAttack: another profile is its attack now on the targets given, at the profile\'s atkScale over its profile\'s now; none on the field: nothing', () => {
  const plainRun = attackField();
  assert.equal(performAttack(plainRun.b, plainRun.g, { ...plainRun.b.effectiveProfile(plainRun.g), atkScale: 2 }, [plainRun.e]), true);
  assert.equal(1e6 - plainRun.e.hp, 150, '75 × 2');
  assert.equal(performAttack(plainRun.b, plainRun.g, plainRun.b.effectiveProfile(plainRun.g), [plainRun.e]), true);
  assert.equal(1e6 - plainRun.e.hp, 225, 'its own: 75');
  assert.equal(performAttack(plainRun.b, plainRun.g, { ...plainRun.healProfile, dmgType: 'physical', atkScale: 2, healScale: 4 }, [plainRun.e]), true);
  assert.deepEqual([1e6 - plainRun.e.hp, plainRun.ally.hp], [375, 100], 'a heal mode without dmgType heal is no heal (Stronghold\'s test), its healScale not read: 75 × 2');
  const sk = attackField({ kind: 'duration', duration: 30, attack: { atkScale: 2 } });
  sk.run(1);
  assert.equal(sk.b.effectiveProfile(sk.g).atkScale, 2, 'its skill runs: 2 ×');
  performAttack(sk.b, sk.g, sk.b.effectiveProfile(sk.g), [sk.e]);
  assert.equal(1e6 - sk.e.hp, 150, 'as its profile now: the skill\'s 2 ×');
  const before = sk.e.hp;
  performAttack(sk.b, sk.g, { ...sk.b.effectiveProfile(sk.g), atkScale: 6 }, [sk.e]);
  assert.equal(before - sk.e.hp, 450, '6 × over the 2 × it has now: × 3');
  sk.run(1, [[0, { type: 'retreat', unit: /** @type {any} */ (sk.ally.u).id }]]);
  assert.deepEqual([performAttack(sk.b, sk.g, sk.healProfile, [sk.ally]), performAttack(sk.b, sk.g, sk.healProfile, [])], [false, false], 'no target on the field');
  assert.deepEqual(sk.b.errors, []);
});

test('[兼容-4] performAttack: with noAmmo the shot of a running ammo skill is kept; without, the attack spends one', () => {
  const ammo = { id: 'a', type: 'MANUAL', sp: 'time', cost: 5, init: 0, charges: 1, duration: 0, ammo: true, bb: { trigger_time: 5 } };
  const { b, run, unit } = field({ ops: { guard: plain('guard', { skill: ammo }) }, kits: { guard: () => ({ skills: {} }) }, n: 1, spots: [[2, 5]] });
  run(1, [deploy('guard', 2, 2)]);
  const g = unit('guard'), e = unit('slime'), u = /** @type {any} */ (g.u);
  u.skill.sp = u.skill.cost;
  run(1, [[0, { type: 'skill', unit: u.id }]]);
  assert.equal(g.skill?.ammoLeft, 5, 'its 5 shots; the slime out of its range');
  assert.equal(performAttack(b, g, b.effectiveProfile(g), [e], { noAmmo: true }), true);
  assert.deepEqual([g.skill?.ammoLeft, 1e6 - e.hp], [5, 50], 'noAmmo: none spent');
  performAttack(b, g, b.effectiveProfile(g), [e]);
  assert.deepEqual([g.skill?.ammoLeft, 1e6 - e.hp], [4, 100], 'one spent');
  assert.deepEqual(b.errors, []);
});

/** A slime's layers of 麻痹. @param {ShUnit} e */
const layers = (e) => e.findBuff('palsy')?.stacks ?? 0;

test('[兼容-4] a kit\'s 麻痹: its value is its layers — whole, at least 1, at most 3 —, given at once on those there up to 3; none: 1', () => {
  const { b, unit } = field({ ops: { guard: plain('guard') }, n: 4, spots: [[2, 2], [2, 3], [2, 4], [2, 5]] });
  const [s0, s1, s2, s3] = [0, 1, 2, 3].map((i) => unit('slime', i));
  assert.deepEqual([b.applyStatus(s0, 'palsy', { value: 2 }), layers(s0)], [true, 2]);
  b.applyStatus(s0, 'palsy', { value: 2 });
  assert.equal(layers(s0), 3, '2 + 2, at most 3');
  b.applyStatus(s1, 'palsy', { value: 5 });
  b.applyStatus(s2, 'palsy', { value: 2.9 });
  b.applyStatus(s3, 'palsy', {});
  assert.deepEqual([layers(s1), layers(s2), layers(s3)], [3, 2, 1]);
  b.applyStatus(s3, 'palsy', { value: 0.4 });
  assert.equal(layers(s3), 2, 'less than 1: 1');
  assert.deepEqual([s0.findBuff('palsy')?.timeLeft, /** @type {any} */ (s0.u).buffs.filter((/** @type {any} */ x) => x.key === 'palsy').length], [Infinity, 1], 'one buff, no end');
});

test('[兼容-4] a kit\'s 麻痹: beforeStatus shows its value; a handler\'s new value gives the layers, a cancel none, for that application only', () => {
  /** @type {any[]} */
  const seen = [];
  /** @type {{ to: Map<ShUnit, number>, cancel: boolean, stop: boolean, nested: ShUnit | null }} */
  const say = { to: new Map(), cancel: false, stop: false, nested: null };
  const kit = () => ({ skills: {}, install(/** @type {ShBattle} */ b) {
    b.on('beforeStatus', (k) => {
      if (k.status !== 'palsy') return;
      seen.push(k.value);
      const nested = say.nested;
      say.nested = null;
      if (nested) b.applyStatus(nested, 'palsy', { value: 3 });
      if (say.to.has(k.target)) k.value = say.to.get(k.target);
      if (say.cancel) k.cancel = true;
      if (say.stop) k.stopPropagation = true;
    });
  } });
  const { b, unit } = field({ ops: { guard: plain('guard') }, kits: { guard: kit }, n: 5, spots: [[2, 2], [2, 3], [2, 4], [2, 5], [1, 5]] });
  const [s0, s1, s2, s3, s4] = [0, 1, 2, 3, 4].map((i) => unit('slime', i));
  say.to = new Map([[s0, 1], [s1, 3]]);
  b.applyStatus(s0, 'palsy', { value: 2.5 });
  b.applyStatus(s1, 'palsy', { value: 1 });
  assert.deepEqual([seen.splice(0), layers(s0), layers(s1)], [[2.5, 1], 1, 3], 'the kit\'s values; the handler\'s 1 and 3');
  say.cancel = true;
  assert.deepEqual([b.applyStatus(s2, 'palsy', { value: 2 }), layers(s2), seen.splice(0)], [false, 0, [2]], 'cancelled');
  say.cancel = false;
  say.to = new Map([[s2, 2], [s3, 1]]);
  say.nested = s2;
  b.applyStatus(s3, 'palsy', { value: 3 });
  assert.deepEqual([seen.splice(0), layers(s2), layers(s3)], [[3, 3], 2, 1], 'one applied inside the handler: 2 by its own event, then this one\'s 1');
  say.to = new Map([[s4, 3]]);
  say.stop = true;
  b.applyStatus(s4, 'palsy', { value: 1 });
  assert.equal(layers(s4), 3, 'a handler that ends the dispatch: its value still');
  assert.deepEqual(b.errors, []);
});
