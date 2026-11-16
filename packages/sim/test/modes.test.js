// Attack modes (docs/spec/traits.md 职业-12, 职业-13) on the tiny level without spawns: attacks only in the skill with
// idle modifiers and a charge, heals in the skill, bullets, stored energy, element restoring heals; HP regeneration
// (属性-6) and regen auras.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step, bus, swing, boomerangStrike } from '../src/index.js';
import { makeEnemy } from '../src/units.js';
import { applyStatus } from '../src/status.js';
import { statsOf, intervalFrames } from '../src/attrs.js';
import { makeBuff, addBuff } from '../src/buffs.js';
import { deployProblem } from '../src/commands.js';

/** @typedef {import('../src/types.js').Unit} Unit */

const AROUND = [-1, 0, 1].flatMap((row) => [-1, 0, 1].map((col) => ({ row, col })));
/** A manual skill that costs 1 SP and lasts `duration` seconds. @param {number} duration */
const skill = (duration) => ({ id: 's', type: 'MANUAL', sp: 'time', cost: 1, init: 1, charges: 1, duration, ammo: false, bb: {} });

/** @param {(c: any) => void} tweak */
function arena(tweak) {
  const c = tinyContent();
  c.level.waves = [];
  c.level.options = { ...c.level.options, characterLimit: 9, initialCost: 99, maxCost: 99 };
  c.operators.sniper = { ...c.operators.sniper, range: AROUND };
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
  /** @param {string} op @param {number} row @param {number} col */
  const put = (op, row, col) => { step(w, c, [[0, { type: 'deploy', op, row, col, dir: 0 }]]); return /** @type {Unit} */ (w.units.at(-1)); };
  /** The events of the next n frames, commands in the first. @param {number} n @param {any[]} [cmds] */
  const run = (n, cmds = []) => { /** @type {any[]} */ const ev = []; for (let i = 0; i < n; i++) ev.push(...step(w, c, i === 0 ? cmds.map((x) => [0, x]) : [])); return ev; };
  return { w, c, foe, put, run };
}

/** @param {Unit} u @param {string} key */
const buffOf = (u, key) => u.buffs.find((b) => b.key === key);

test('[职业-12] a charge that starts at its init bonus: its steps at deployment', () => {
  const { put } = arena((c) => { c.operators.guard = { ...c.operators.guard, skill: skill(2), trait: { attackInSkill: true, charge: { atk: 2, steps: 40, init: 1 } } }; });
  const guard = put('guard', 1, 1);
  assert.deepEqual([buffOf(guard, 'charge')?.value, statsOf(guard).atk], [20, 50 * 2]);
});

test('[职业-12] attacks only in the skill; 阻挡数 × 0 out of it; the charge builds a step a second and is back at 0 when the skill ends', () => {
  const { foe, put, run } = arena((c) => {
    c.operators.guard = { ...c.operators.guard, skill: skill(2), trait: { attackInSkill: true, idleMods: { blockCntMul: 0 }, charge: { atk: 2, steps: 40 } } };
  });
  const guard = put('guard', 1, 1);
  foe(1, 2);
  assert.equal(statsOf(guard).blockCnt, 0);
  const idle = run(59);
  assert.equal(idle.filter((e) => e.type === 'hit').length, 0, 'no attack while the skill is off');
  assert.deepEqual([buffOf(guard, 'charge')?.value, statsOf(guard).atk], [2, 50 * (1 + 0.1)], 'two steps at 2 s');
  const on = run(40, [{ type: 'skill', unit: guard.id }]);
  assert.ok(on.some((e) => e.type === 'hit' && e.id === guard.id), 'it attacks in the skill');
  assert.deepEqual([statsOf(guard).blockCnt, buffOf(guard, 'charge')?.value], [2, 2], 'its 阻挡数 back, the charge held');
  while (guard.skill?.active) run(1);
  assert.deepEqual([statsOf(guard).blockCnt, buffOf(guard, 'charge')?.value, statsOf(guard).atk], [0, 0, 50], 'at the skill\'s end: 阻挡数 0, the charge back at 0');
  run(30);
  assert.equal(buffOf(guard, 'charge')?.value, 1, 'and a step again within the next second');
});

test('[职业-12] a skill that begins and ends between two triggers of the charge still takes it back to 0', () => {
  const { put, run } = arena((c) => { c.operators.guard = { ...c.operators.guard, skill: skill(0.3), trait: { attackInSkill: true, charge: { atk: 2, steps: 40, init: 1 } } }; });
  const guard = put('guard', 1, 1);
  run(34);
  assert.equal(buffOf(guard, 'charge')?.value, 21, 'its start (20) and a step');
  run(12, [{ type: 'skill', unit: guard.id }]);
  assert.deepEqual([guard.skill?.active, buffOf(guard, 'charge')?.value], [false, 0], '0.3 s, between the triggers at 1 s and 2 s');
});

test('[职业-12] heals instead of attacks while the skill runs, at the skill healer\'s 倍率', () => {
  const { foe, put, run } = arena((c) => { c.operators.sniper = { ...c.operators.sniper, skill: skill(10), trait: { skillHeal: 0.5 } }; });
  const mate = put('guard', 1, 2), healer = put('sniper', 2, 2);
  mate.hp = 500;
  foe(1, 3);
  const before = run(46);
  assert.ok(before.some((e) => e.type === 'hit' && e.id === healer.id) && !before.some((e) => e.type === 'heal'));
  const during = run(46, [{ type: 'skill', unit: healer.id }]);
  assert.deepEqual(during.filter((e) => e.type === 'heal').map((e) => [e.target, e.amount]).slice(0, 1), [[mate.id, 15]]);
  assert.ok(!during.some((e) => e.type === 'shot' && e.id === healer.id), 'no attack launched while it heals');
});

test('[职业-12] bullets: each attack spends one at its 倍率; out of them, or without a target, it reloads one per base attack interval', () => {
  const { w, foe, put, run } = arena((c) => { c.operators.sniper = { ...c.operators.sniper, trait: { bullets: { max: 2, scale: 1.5 } } }; });
  const hunter = put('sniper', 2, 2);
  assert.equal(buffOf(hunter, 'bullets')?.value, 2, 'full at deployment');
  const e = foe(1, 2);
  const hits = run(200).filter((x) => x.type === 'hit' && x.id === hunter.id);
  assert.deepEqual(hits.slice(0, 3).map((x) => x.damage), [45, 45, 45]);
  w.units.splice(w.units.indexOf(e), 1);
  run(200);
  assert.equal(buffOf(hunter, 'bullets')?.value, 2, 'reloaded to full without a target');
});

test('[职业-12] stored energy: one per attack interval without a target, up to the most; it goes with the next attack', () => {
  const { foe, put, run } = arena((c) => { c.operators.sniper = { ...c.operators.sniper, trait: { store: 2 } }; });
  const mystic = put('sniper', 2, 2);
  run(200);
  assert.equal(buffOf(mystic, 'energy')?.value, 2);
  foe(1, 2);
  const ev = run(60);
  assert.equal(ev.filter((x) => x.type === 'shot' && x.id === mystic.id).length >= 3, true, 'its attack and two of energy');
  const hits = ev.filter((x) => x.type === 'hit' && x.id === mystic.id).map((x) => x.damage);
  assert.deepEqual(hits.slice(0, 3), [30, 30, 30]);
  assert.equal(buffOf(mystic, 'energy')?.value, 0);
});

test('[职业-12] heals that restore element values: a full-HP operator with element damage is a target; not in a burst', () => {
  const { put, run } = arena((c) => { c.operators.sniper = { ...c.operators.sniper, trait: { heal: true, targets: 1, epHeal: 0.5 } }; });
  const mate = put('guard', 1, 2), healer = put('sniper', 2, 2);
  mate.ep = { FIRE: 500 };
  const ev = run(2);
  assert.deepEqual(ev.filter((e) => e.type === 'heal').map((e) => [e.id, e.target]), [[healer.id, mate.id]]);
  assert.deepEqual(mate.ep, { FIRE: 515 });
  mate.ep = { FIRE: 990 };
  run(45);
  assert.deepEqual(mate.ep, {}, 'up to the maximum');
});

test('[属性-6] 生命回复: its rate ÷ 30 a frame up to the maximum; not a heal, so 禁疗 does not stop it', () => {
  const { put, run } = arena(() => {});
  const guard = put('guard', 1, 1);
  guard.hp = 500;
  addBuff(guard, makeBuff({ key: 'r', mods: { hpRegen: 30 } }));
  applyStatus(guard, 'healFree', {});
  const ev = run(30);
  assert.ok(Math.abs(guard.hp - 530) < 1e-9, String(guard.hp));
  assert.equal(ev.filter((e) => e.type === 'heal').length, 0);
  guard.hp = 999.5;
  run(1);
  assert.equal(guard.hp, 1000);
});

test('[职业-13] [部署-2] 吟游者: no attacks, outside the deploy limit; the operators in its range regenerate, until it leaves', () => {
  const { w, c, foe, put, run } = arena((cc) => {
    cc.level.options.characterLimit = 1;
    cc.operators.sniper = { ...cc.operators.sniper, atk: 300, trait: { noAttack: true, free: true, regenAura: 0.1 } };
    cc.operators.g2 = { ...cc.operators.guard };
  });
  const guard = put('guard', 1, 2);
  assert.equal(deployProblem(w, c, 0, { type: 'deploy', op: 'g2', row: 1, col: 1, dir: 0 }), 'deploy limit reached');
  const bard = put('sniper', 2, 2);
  assert.equal(w.units.includes(bard), true, 'deployed past the limit');
  assert.equal(deployProblem(w, c, 0, { type: 'deploy', op: 'g2', row: 1, col: 1, dir: 0 }), 'deploy limit reached', 'and it takes no place');
  guard.hp = 500;
  foe(1, 3);
  const ev = run(30);
  assert.equal(ev.filter((e) => e.type === 'shot' && e.id === bard.id).length, 0);
  assert.ok(Math.abs(guard.hp - 530) < 1e-6, String(guard.hp));
  assert.deepEqual([guard.buffs.map((b) => [b.key, b.mods.hpRegen]), bard.buffs.map((b) => b.key)], [[[`aura:${bard.id}`, 30]], [`aura:${bard.id}`]]);
  run(1, [{ type: 'retreat', unit: bard.id }]);
  assert.deepEqual(guard.buffs, [], 'its source gone, the aura goes');
});

test('[部署-5] an on-field team talent: every operator of its profession on the field, while its source is', () => {
  const { put, run } = arena((cc) => {
    cc.operators.guard = { ...cc.operators.guard, profession: 'WARRIOR' };
    cc.operators.g2 = { ...cc.operators.guard, profession: 'TANK' };
    cc.operators.sniper = { ...cc.operators.sniper, profession: 'SNIPER', fieldTalents: [{ profession: 'WARRIOR', bb: { atk: 0.2 } }] };
  });
  const guard = put('guard', 1, 1), tank = put('g2', 1, 2);
  assert.equal(statsOf(guard).atk, 50);
  const src = put('sniper', 2, 2);
  assert.deepEqual([guard.buffs.map((b) => [b.key, b.mods]), tank.buffs, src.buffs], [[[`field:${src.id}:0`, { atkPct: 0.2 }]], [], []]);
  assert.equal(statsOf(guard).atk, 60);
  run(1, [{ type: 'retreat', unit: src.id }]);
  assert.deepEqual(guard.buffs, [], 'gone with its source');
});

test('[部署-6] an in-range talent: the enemies, or the operators, with a tile in its source attack range, while there', () => {
  const { w, foe, put, run } = arena((cc) => {
    cc.operators.sniper = { ...cc.operators.sniper, range: [{ row: 0, col: 1 }], rangeTalents: [{ side: 'enemy', ranged: false, mods: { resPct: -0.5 } }, { side: 'ally', ranged: true, mods: { defFlat: 10 } }] };
  });
  const near = foe(2, 3), far = foe(1, 4);
  near.base = { ...near.base, res: 40 };
  const src = put('sniper', 2, 2), guard = put('guard', 1, 2);
  run(1);
  assert.deepEqual([near.buffs.filter((b) => b.key.startsWith('range:')).map((b) => b.mods), statsOf(near).res, far.buffs.some((b) => b.key.startsWith('range:'))], [[{ resPct: -0.5 }], 20, false]);
  assert.deepEqual([src.buffs.filter((b) => b.key.startsWith('range:')).length, guard.buffs.length], [0, 0], 'its own tile is not in this range; a melee operator is not ranged');
  near.x = 5;
  run(1);
  assert.equal(near.buffs.some((b) => b.key.startsWith('range:')), false, 'out of range: gone');
  assert.ok(w.units.includes(far));
});

test('[部署-7] timed talents: a step every interval up to its most; once after an interval; for a time after deployment', () => {
  const { put, run } = arena((cc) => {
    cc.operators.guard = { ...cc.operators.guard, timedTalents: [
      { kind: 'stack', seconds: 1, max: 2, mods: { atkFlat: 10 } }, { kind: 'after', seconds: 2, max: 1, mods: { defFlat: 5 } },
      { kind: 'during', seconds: 1, max: 1, mods: { aspd: 7 } }] };
  });
  const g = put('guard', 1, 1);
  assert.deepEqual([statsOf(g).atk, statsOf(g).def, statsOf(g).aspd], [50, 100, 107]);
  run(29);
  assert.deepEqual([statsOf(g).atk, statsOf(g).aspd], [60, 100], 'a step at 1 s; the timed one over');
  run(30);
  assert.deepEqual([statsOf(g).atk, statsOf(g).def], [70, 105], 'two steps; the once-after one at 2 s');
  run(90);
  assert.deepEqual([statsOf(g).atk, statsOf(g).def], [70, 105], 'no more');
});

test('[部署-8] [随机-1] deployment talents: SP (one draw when it is a range), a heal of every operator, shield layers', () => {
  const { w, put } = arena((cc) => {
    cc.operators.guard = { ...cc.operators.guard, skill: { ...skill(10), cost: 30, init: 0 }, deployTalents: [{ sp: [7, 16] }, { heal: { value: 100 } }, { shield: 3 }] };
    cc.operators.g2 = { ...cc.operators.guard, skill: undefined, deployTalents: [{ sp: [5, 6] }] };
  });
  const mate = put('g2', 1, 2);
  mate.hp = 500;
  const rng = w.rng, g = put('guard', 1, 1), st = /** @type {any} */ (g.skill);
  assert.notEqual(w.rng, rng);
  assert.ok(Number.isInteger(st.sp) && st.sp >= 7 && st.sp <= 15, String(st.sp));
  assert.deepEqual([mate.hp, g.buffs.find((b) => b.key === 'deployShield')?.shieldHits], [600, 3]);
});

test('[职业-12] funnel: init on a new target, delta more for each attack on the same, at most max; another target starts over', () => {
  const { w, foe, put, run } = arena((c) => { c.operators.sniper = { ...c.operators.sniper, trait: { funnel: { init: 0.2, delta: 0.15, max: 1.1 } } }; });
  const op = put('sniper', 2, 2), first = foe(1, 2);
  const dmg = () => run(400).filter((x) => x.type === 'hit' && x.id === op.id).map((x) => Math.round(Number(x.damage) * 10) / 10);
  assert.deepEqual(dmg().slice(0, 8), [6, 10.5, 15, 19.5, 24, 28.5, 33, 33], 'ATK 30: 20 % up by 15 to 110 %');
  w.units.splice(w.units.indexOf(first), 1);
  foe(1, 3);
  assert.deepEqual(dmg().slice(0, 2), [6, 10.5]);
  assert.equal(buffOf(op, 'funnel')?.value, w.units.at(-1)?.id, 'the target it counts for');
});

test('[职业-6] [职业-12] a trait behaviour says whether its operator may attack, and what a turn without a target does', () => {
  const said = { attack: true, store: /** @type {boolean | undefined} */ (undefined) }, turns = /** @type {number[]} */ ([]);
  const { foe, put, run } = arena((cc) => {
    cc.operators.sniper = { ...cc.operators.sniper, branch: 'b', trait: { store: 2 } };
    cc.behaviors = { traits: { b: { canAttack: () => said.attack, store: (/** @type {any} */ ctx) => { turns.push(ctx.frame); return said.store; } } } };
  });
  const op = put('sniper', 2, 2);
  foe(1, 2);
  said.attack = false;
  run(60);
  assert.equal(buffOf(op, 'energy')?.value, 2, 'no attack: as if it had no target — the engine\'s own store');
  said.store = true;
  const at = turns.length, every = intervalFrames(statsOf(op).bat, statsOf(op).aspd);
  run(200);
  const mine = turns.slice(at);
  assert.ok(mine.length >= 3 && mine.every((f, i) => i === 0 || f - mine[i - 1] === every), 'its own store, an attack interval each');
  said.attack = true;
  assert.ok(run(200).some((x) => x.type === 'hit' && x.id === op.id));
});

test('[职业-6] [职业-12] a trait behaviour that owns its operator\'s deployment: no trait buff from the engine; its mode\'s buffs stay', () => {
  const owned = new Set(/** @type {number[]} */ ([]));
  const { put } = arena((cc) => {
    cc.operators.sniper = { ...cc.operators.sniper, branch: 'b', trait: { bullets: { max: 2, scale: 1.5 }, mods: { dodgePhys: 0.5 } } };
    cc.operators.guard = { ...cc.operators.guard, branch: 'b', trait: { bullets: { max: 2, scale: 1.5 }, mods: { dodgePhys: 0.5 } } };
    cc.behaviors = { traits: { b: { own: (/** @type {any} */ ctx) => owned.has(ctx.self.id) || undefined } } };
  });
  const theirs = put('guard', 1, 1);
  owned.add(/** @type {number} */ (theirs.id) + 1);
  const mine = put('sniper', 2, 2);
  assert.deepEqual([buffOf(theirs, 'trait')?.mods, buffOf(theirs, 'bullets')?.value], [{ dodgePhys: 0.5 }, 2]);
  assert.deepEqual([buffOf(mine, 'trait'), buffOf(mine, 'bullets')?.value], [undefined, 2]);
});

test('[职业-12] [钩子-3] boomerangs: out to the target, back to the thrower, caught; no new attack until all are back', () => {
  const caught = /** @type {number[]} */ ([]);
  const { w, foe, put, run } = arena((c) => { c.operators.sniper = { ...c.operators.sniper, trait: { boomerang: { out: 15, back: 0.5 } } }; });
  bus.on(w, 'boomerangCaught', () => { caught.push(w.frame); });
  const op = put('sniper', 2, 2), e = foe(1, 2);
  const first = run(60), hits = first.filter((x) => x.type === 'hit' && x.id === op.id);
  assert.equal(hits.length, 1, 'one hit; the boomerang is on its way back for 2 s');
  assert.deepEqual(w.shots.map((s) => [s.src, s.ret]), [[op.id, 1]]);
  run(60);
  assert.equal(caught.length, 1, 'caught');
  assert.ok(run(60).some((x) => x.type === 'hit' && x.id === op.id), 'it attacks again');
  w.units.splice(w.units.indexOf(e), 1);
  const back = w.shots.filter((s) => s.src === op.id);
  assert.ok(back.every((s) => s.ret === 1), 'a target that left: the boomerang comes back from where it is');
});

test('[职业-12] [钩子-3] boomerangHit: a handler holds the boomerang where it hit, strikes another with it, sends it back from elsewhere', () => {
  const { w, c, foe, put, run } = arena((cc) => { cc.operators.sniper = { ...cc.operators.sniper, trait: { boomerang: { out: 15, back: 15 } } }; });
  /** @type {any[]} */
  const held = [];
  bus.on(w, 'boomerangHit', (k) => { k.hold = true; held.push(k); });
  const op = put('sniper', 2, 2), e = foe(1, 2), other = foe(1, 3);
  const hits = run(60).filter((x) => x.type === 'hit' && x.id === op.id);
  assert.deepEqual([hits.length, held.length, held[0]?.target, held[0]?.x, held[0]?.y], [1, 1, e, 2, 1], 'held where it hit');
  assert.deepEqual(w.shots.map((s) => [s.held, s.sx, s.sy]), [[1, 2, 1]], 'it stays there; no new attack meanwhile');
  boomerangStrike(w, c, w.shots[0], other);
  assert.ok(other.hp < other.maxHp, 'its attack strikes another enemy');
  assert.equal(swing.sendBack(w, w.shots[0], 3, 1)?.ret, 1);
  assert.equal(swing.sendBack(w, w.shots[0], 3, 1), null, 'once');
  run(3);
  assert.equal(w.shots.length, 0, 'flown back from (3, 1), √2 tiles at 15 a second, and caught');
  w.units.splice(w.units.indexOf(e), 1);
  w.units.splice(w.units.indexOf(other), 1);
  const f = foe(1, 2);
  run(60);
  assert.deepEqual([w.shots.filter((s) => s.held).length, f.hp < f.maxHp], [1, true]);
  w.units.splice(w.units.indexOf(op), 1);
  run(1);
  assert.equal(w.shots.length, 0, 'its thrower left: gone');
});

test('[职业-12] up in the air while the skill does not run: flags, flying enemies only; the skill\'s attacks splash', () => {
  const { foe, put, run } = arena((c) => {
    c.operators.sniper = { ...c.operators.sniper, skill: skill(5), trait: { idleFlags: { liftoff: true }, idleAirOnly: true, skillSplash: { radius: 1.1, scale: 1, ground: false } } };
  });
  const op = put('sniper', 2, 2), a = foe(1, 2), b = foe(1, 3);
  assert.equal(buffOf(op, 'idle')?.flags.liftoff, true);
  assert.equal(run(60).filter((x) => x.type === 'hit' && x.id === op.id).length, 0, 'ground enemies: no attack');
  const hits = run(90, [{ type: 'skill', unit: op.id }]).filter((x) => x.type === 'hit' && x.id === op.id).map((x) => x.target);
  assert.ok(hits.includes(a.id) && hits.includes(b.id), 'in the skill: the ground enemy and the one splashed');
  assert.equal(buffOf(op, 'idle'), undefined, 'landed');
});

test('[职业-12] 要塞: a ranged attack with its splash on what is in its range, a melee one on what stands on its tile', () => {
  const { w, foe, put, run } = arena((c) => { c.operators.guard = { ...c.operators.guard, range: [{ row: 0, col: 1 }, { row: 0, col: 2 }], trait: { fortress: 1 } }; });
  const op = put('guard', 1, 1), far = foe(1, 3), near = foe(1, 3.6);
  const ev = run(60);
  assert.ok(ev.some((x) => x.type === 'shot' && x.id === op.id), 'ranged: a projectile');
  const hit = ev.filter((x) => x.type === 'hit' && x.id === op.id).map((x) => x.target);
  assert.ok(hit.includes(far.id) && hit.includes(near.id), 'its splash');
  for (const e of [far, near]) w.units.splice(w.units.indexOf(e), 1);
  const mine = foe(1, 1), ev2 = run(60);
  assert.ok(!ev2.some((x) => x.type === 'shot' && x.id === op.id) && ev2.some((x) => x.type === 'hit' && x.id === op.id && x.target === mine.id), 'melee on its own tile');
});

test('[职业-3] hits that take a share each: every hit its share of the amount, after the defences; only the first gives 受击回复', () => {
  const seen = /** @type {[number, number | undefined, boolean][]} */ ([]);
  const { w, foe, put, run } = arena((c) => { c.operators.guard = { ...c.operators.guard, trait: { hits: 2, hitMul: 0.5 } }; });
  bus.on(w, 'hit', (k) => { if (k.dmg.isAttack) seen.push([k.dmg.amount, k.dmg.mul, k.dmg.noHurtSp === true]); });
  const guard = put('guard', 1, 1);
  foe(1, 2);
  const hits = run(70).filter((x) => x.type === 'hit' && x.id === guard.id).map((x) => x.damage);
  assert.deepEqual(hits.slice(0, 4), [25, 25, 25, 25], 'two hits of half of ATK 50 for each attack, a foe without defence');
  assert.deepEqual(seen.slice(0, 4), [[50, 0.5, false], [50, 0.5, true], [50, 0.5, false], [50, 0.5, true]], 'the second of an attack gives no 受击回复');
});

test('[技能-3] [职业-12] an AUTO skill of an operator that attacks only while its skill runs starts as soon as it is ready', () => {
  const starts = /** @type {number[]} */ ([]);
  const { w, foe, put, run } = arena((c) => { c.operators.guard = { ...c.operators.guard, skill: { ...skill(2), type: 'AUTO', cost: 2, init: 0 }, trait: { attackInSkill: true } }; });
  bus.on(w, 'skillStart', () => { starts.push(w.frame); });
  const guard = put('guard', 1, 1);
  foe(1, 2);
  const ev = run(150);
  assert.ok(starts.length >= 1 && starts[0] <= 62, `started at its second SP: ${starts}`);
  assert.ok(ev.some((x) => x.type === 'hit' && x.id === guard.id), 'and attacked in it');
});

test('[职业-6] [职业-12] a trait behaviour says which funnel its operator has: none, or other numbers than the trait\'s', () => {
  /** @type {{ funnel: { init: number, delta: number, max: number } | null | undefined }} */
  const said = { funnel: undefined };
  const { w, foe, put, run } = arena((c) => {
    c.operators.sniper = { ...c.operators.sniper, branch: 'b', trait: { funnel: { init: 0.2, delta: 0.15, max: 1.1 } } };
    c.behaviors = { traits: { b: { funnel: () => said.funnel } } };
  });
  const amounts = /** @type {number[]} */ ([]);
  bus.on(w, 'hit', (k) => { if (k.dmg.isAttack) amounts.push(Math.round(k.dmg.amount * 100) / 100); });
  const op = put('sniper', 2, 2);
  foe(1, 2);
  run(130);
  assert.deepEqual(amounts.slice(0, 3), [6, 10.5, 15], 'it says nothing: the trait\'s');
  amounts.length = 0;
  const counted = buffOf(op, 'funnel')?.n;
  said.funnel = null;
  run(130);
  assert.deepEqual(amounts.slice(0, 3), [30, 30, 30], 'none: ATK 30 each time, and no count');
  assert.equal(buffOf(op, 'funnel')?.n, counted, 'the count stayed where it was');
  amounts.length = 0;
  said.funnel = { init: 0.5, delta: 0, max: 0.5 };
  run(130);
  assert.deepEqual(amounts.slice(0, 3), [15, 15, 15], 'other numbers');
});

test('[职业-6] [职业-13] a trait behaviour says how much the regeneration aura gives each operator: more, less, or none', () => {
  /** @type {(a: number) => number | undefined} */
  let say = () => undefined;
  const asked = /** @type {number[]} */ ([]);
  const { run, put } = arena((cc) => {
    cc.operators.g2 = { ...cc.operators.guard };
    cc.operators.sniper = { ...cc.operators.sniper, branch: 'b', atk: 300, trait: { noAttack: true, free: true, regenAura: 0.1 } };
    cc.behaviors = { traits: { b: { regen: (/** @type {any} */ ctx, /** @type {Unit} */ t, /** @type {number} */ amount) => { asked.push(t.id); return say(amount); } } } };
  });
  const guard = put('guard', 1, 2), bard = put('sniper', 2, 2), far = put('g2', 1, 0);
  run(2);
  const regen = () => guard.buffs.find((b) => b.key === `aura:${bard.id}`)?.mods.hpRegen;
  assert.equal(regen(), 30, 'it says nothing: the amount');
  assert.ok(asked.includes(guard.id) && !asked.includes(far.id), 'asked for the operators in its range only');
  say = (a) => a * 2;
  run(2);
  assert.equal(regen(), 60, 'more');
  say = () => 0;
  run(2);
  assert.equal(regen(), undefined, 'none: no buff');
});
