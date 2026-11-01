// Runtime of the sentences 技能-9 and 技能-14 leave (docs/spec/skills.md 技能-15): stopping attacks, cost bit by bit, HP lost
// as the skill starts, and what it does to enemies as it starts. Numbers mirror the data at skill level 7.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secondsToFrames } from '@aue/math';
import { tinyContent } from '@aue/testkit';
import { createWorld, step, targetsOf } from '../src/index.js';
import { statsOf } from '../src/attrs.js';
import { makeBuff, addBuff } from '../src/buffs.js';
import { endSkill, attackMods, GENERIC } from '../src/skills.js';
import { forceSp } from '../src/sp.js';
import { makeEnemy } from '../src/units.js';

/** @typedef {import('../src/types.js').SkillDef} SkillDef @typedef {import('../src/types.js').Unit} Unit */
/** @typedef {import('../src/types.js').Content} Content @typedef {import('../src/types.js').World} World */

/** @param {Partial<SkillDef>} o @returns {SkillDef} */
const sk = (o) => ({ id: 'text2', type: 'MANUAL', sp: 'time', cost: 5, init: 0, charges: 1, duration: 3, ammo: false, bb: {}, ...o });

/**
 * The tiny level without spawns or the cost that comes by itself (费用-1), so a skill's cost is all that changes it.
 * @param {SkillDef} skill @param {(c: Content) => void} [prep]
 */
function field(skill, prep) {
  const c = /** @type {Content} */ (tinyContent());
  c.level.waves = [];
  c.level.options = { ...c.level.options, costIncreaseTime: 1e6, maxCost: 99 };
  c.operators.guard.skill = skill;
  prep?.(c);
  return { w: createWorld(c, { seed: 1, players: 1 }), c };
}

/** @param {World} w @param {Content} c */
function deploy(w, c) {
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  return /** @type {Unit} */ (w.units.find((u) => u.key === 'guard'));
}

/** Starts the guard's manual skill in this frame's commands. @param {World} w @param {Content} c @param {Unit} op */
function arm(w, c, op) {
  forceSp(/** @type {import('../src/types.js').SkillState} */ (op.skill), 99);
  return step(w, c, [[0, { type: 'skill', unit: op.id }]]);
}

/** A still enemy with all but endless HP, at (x, y). @param {World} w @param {Content} c @param {number} x @param {number} y @param {Record<string, unknown>} [more] */
function foe(w, c, x, y, more = {}) {
  const e = makeEnemy(w, c, { key: 'slime', route: 0 });
  e.x = x; e.y = y;
  e.base = { ...e.base, maxHp: 1e9, def: 0, res: 0, moveSpeed: 0, atk: 0, ...more };
  e.hp = 1e9; e.maxHp = 1e9;
  w.units.push(e);
  return e;
}

/** Runs n frames; the attack events they had. @param {World} w @param {Content} c @param {number} n */
function run(w, c, n) {
  let attacks = 0;
  for (let i = 0; i < n; i++) attacks += step(w, c, []).filter((x) => x.type === 'attack').length;
  return attacks;
}

/** @param {Unit} u @param {string} key */
const buffOf = (u, key) => u.buffs.find((b) => b.key === key);

test('[技能-15] 停止攻击: no new attack while the skill runs; it attacks again once the skill ends', () => {
  const { w, c } = field(sk({ duration: 3, extra: { stopAttack: {} } }));
  const op = deploy(w, c);
  arm(w, c, op);
  assert.equal(buffOf(op, 'skillStop')?.flags.noAttack, true);
  const e = foe(w, c, 2, 1);
  assert.equal(run(w, c, secondsToFrames(3) - 1), 0, 'a target in range all along');
  assert.deepEqual([e.hp, op.skill?.active], [1e9, true]);
  assert.equal(run(w, c, 1), 1, 'the skill ends at the start of its turn, and it attacks in that turn');
  assert.equal(op.skill?.active, false);
  assert.equal(buffOf(op, 'skillStop'), undefined, 'the hold goes with the skill');
  assert.equal(1e9 - e.hp, statsOf(op).atk);
});

test('[技能-15] 小满: the hold and the sleep on the first n targets last the same seconds; then it attacks inside the skill', () => {
  const opening = [{ where: /** @type {const} */ ('attack'), most: 1, status: [{ key: /** @type {const} */ ('sleep'), seconds: 1 }] }];
  const { w, c } = field(sk({ duration: 10, extra: { stopAttack: { seconds: 1 }, opening } }));
  const op = deploy(w, c);
  const a = foe(w, c, 2, 1), b = foe(w, c, 2, 1);
  run(w, c, 1);
  const first = targetsOf(w, c, op)[0], other = first === a ? b : a;
  arm(w, c, op);
  const hold = buffOf(op, 'skillStop'), sleep = buffOf(first, 'sleep');
  assert.ok(hold && sleep);
  assert.equal(buffOf(other, 'sleep'), undefined, 'only the first one');
  assert.equal(hold.left, sleep.left, 'they run down together');
  assert.equal(run(w, c, hold.left - 1), 0, 'no attack while they last');
  assert.ok(buffOf(op, 'skillStop') && buffOf(first, 'sleep'));
  assert.equal(run(w, c, 1), 1, 'both go in the same frame, and it attacks in that turn');
  assert.deepEqual([buffOf(op, 'skillStop'), buffOf(first, 'sleep'), op.skill?.active], [undefined, undefined, true]);
});

test('[技能-15] 远山: seconds without attacks from the end; not when the skill ends because she leaves, nor once she is down', () => {
  const extra = { stopAfter: { seconds: 13 } };
  const { w, c } = field(sk({ duration: 30, extra }));
  const op = deploy(w, c);
  arm(w, c, op);
  assert.equal(buffOf(op, 'skillStopAfter'), undefined, 'not while it runs');
  endSkill(w, c, op, 'duration');
  assert.deepEqual([buffOf(op, 'skillStopAfter')?.left, buffOf(op, 'skillStopAfter')?.flags.noAttack], [secondsToFrames(13), true]);
  const gone = field(sk({ duration: 30, extra }));
  const g = deploy(gone.w, gone.c);
  arm(gone.w, gone.c, g);
  endSkill(gone.w, gone.c, g, 'death');
  assert.equal(buffOf(g, 'skillStopAfter'), undefined);
  const down = field(sk({ duration: 30, extra }));
  const d = deploy(down.w, down.c);
  arm(down.w, down.c, d);
  d.hp = 0;
  endSkill(down.w, down.c, d, 'duration');
  assert.equal(buffOf(d, 'skillStopAfter'), undefined);
});

test('[技能-15] [技能-5] 支援号令·β型: a cost every 0.57 s on the exact decimals, 14 in all, none flat at the start', () => {
  const costGain = { every: 0.57, cost: 1, steps: 14, plain: true };
  const { w, c } = field(sk({ duration: 8, bb: { value: 14, interval: 0.57, cost: 1 }, extra: { stopAttack: {}, costGain } }));
  const op = deploy(w, c);
  const p = w.players[0], start = p.cost;
  arm(w, c, op);
  assert.equal(p.cost, start, 'not the blackboard cost at the start');
  run(w, c, secondsToFrames(0.57) - 1);
  assert.equal(p.cost, start, 'not yet');
  run(w, c, 1);
  assert.equal(p.cost, start + 1, 'the first at 0.57 s');
  run(w, c, 85 - secondsToFrames(0.57));
  assert.equal(p.cost, start + 4, '5 × 0.57 = 2.85 s is 85.5 frames: the fifth is at 86, not 85');
  run(w, c, 1);
  assert.equal(p.cost, start + 5);
  run(w, c, secondsToFrames(8));
  assert.equal(op.skill?.active, false);
  assert.equal(p.cost, start + 14);
  assert.equal(op.buffs.some((b) => b.key === 'skillCostGain'), false);
});

test('[技能-15] the cost due in the last frame comes when the skill runs its time; an early end gives no more', () => {
  const costGain = { every: 0.5, cost: 2, steps: 2, plain: true };
  const { w, c } = field(sk({ duration: 1, bb: { value: 4, interval: 0.5, cost: 2 }, extra: { costGain } }));
  const op = deploy(w, c);
  const p = w.players[0], start = p.cost;
  arm(w, c, op);
  run(w, c, secondsToFrames(1));
  assert.deepEqual([op.skill?.active, p.cost], [false, start + 4], 'the second on the frame it ends');
  const early = field(sk({ duration: 2, bb: { value: 8, interval: 0.5, cost: 2 }, extra: { costGain: { ...costGain, steps: 4 } } }));
  const e = deploy(early.w, early.c);
  const q = early.w.players[0], from = q.cost;
  arm(early.w, early.c, e);
  run(early.w, early.c, secondsToFrames(1) - 1);
  assert.equal(q.cost, from + 2, 'the first, at 0.5 s');
  // ended as a move does, in the frame's commands: the second is due in this frame, before the operator's turn
  endSkill(early.w, early.c, e, 'move');
  run(early.w, early.c, secondsToFrames(2));
  assert.equal(q.cost, from + 2, 'nothing from the frame it ends on');
});

test('[技能-15] [技能-5] a group\'s steps leave a plain cost alone: it is still gained at the start', () => {
  const costGain = { every: 1, cost: 1, steps: 3 };
  const { w, c } = field(sk({ duration: 3, bb: { cost: 2, 'x[cost].interval': 1, 'x[cost].cost': 1 }, extra: { costGain } }));
  const op = deploy(w, c);
  const p = w.players[0], start = p.cost;
  arm(w, c, op);
  assert.equal(p.cost, start + 2);
  run(w, c, secondsToFrames(3));
  assert.equal(p.cost, start + 5);
});

test('[技能-15] HP lost as the skill starts is 生命流失: a share of the HP it has, a barrier does not take it; of the maximum for a passive at deployment', () => {
  const { w, c } = field(sk({ extra: { selfLoss: { ratio: 0.5 } } }));
  const op = deploy(w, c);
  addBuff(op, makeBuff({ key: 'wall', shield: 500 }));
  op.hp = 800;
  arm(w, c, op);
  assert.equal(op.hp, 400, 'half the HP it has');
  assert.equal(buffOf(op, 'wall')?.shield, 500);
  const max = field(sk({ type: 'PASSIVE', sp: 'none', duration: 18, extra: { selfLoss: { ratio: 0.7, ofMax: true } } }));
  const m = deploy(max.w, max.c);
  assert.equal(m.hp, 1000 - 700, 'a passive one at deployment, of the maximum');
});

test('[技能-15] 八幡海铃: every hostile enemy in the attack range is feared; not one out of range, a neutral unit, nor one that has disappeared', () => {
  const opening = [{ where: /** @type {const} */ ('attack'), status: [{ key: /** @type {const} */ ('fear'), seconds: 1.5 }] }];
  const { w, c } = field(sk({ duration: 15, extra: { opening } }));
  const op = deploy(w, c);
  const near = foe(w, c, 2, 1, { motion: 'FLY' }), far = foe(w, c, 4, 1), neutral = foe(w, c, 2, 1, { neutral: true }), gone = foe(w, c, 2, 1);
  gone.hidden = true; // between 消失 and 出现 on its route (路线-4)
  arm(w, c, op);
  assert.ok(buffOf(near, 'fear'), 'flying too');
  assert.deepEqual([buffOf(far, 'fear'), buffOf(neutral, 'fear'), buffOf(gone, 'fear')], [undefined, undefined, undefined]);
});

test('[技能-15] [技能-5] 闪击: every blocked enemy takes the hit, then the stun — a dodged hit too; plain atk_scale is not the attack\'s', () => {
  const opening = [{ where: /** @type {const} */ ('blocked'), hit: { scale: 1.7, type: /** @type {const} */ ('phys') }, status: [{ key: /** @type {const} */ ('stun'), seconds: 6 }] }];
  // `atk` 1: the hit takes the attack with the skill's own buff (技能-5); the trait's arts on a hit of its attack (职业-20) must not ride on it
  const { w, c } = field(sk({ duration: 6, bb: { atk_scale: 1.7, attack_speed: 200, atk: 1 }, extra: { opening, hitScale: 'attack' } }), (cc) => {
    cc.operators.guard.trait = { ...cc.operators.guard.trait, extraArts: 0.5 };
  });
  const op = deploy(w, c);
  op.atkCd = 9999;
  const held = foe(w, c, 1, 1), dodger = foe(w, c, 1, 1), free = foe(w, c, 2, 1);
  addBuff(dodger, makeBuff({ key: 'dodge', mods: { dodgePhys: 1 } }));
  held.blockedBy = op.id; dodger.blockedBy = op.id;
  arm(w, c, op);
  assert.equal(statsOf(op).atk, 100);
  assert.equal(1e9 - held.hp, statsOf(op).atk * 1.7, 'the attack as it is now, and not an attack');
  assert.ok(buffOf(held, 'stun'));
  assert.deepEqual([dodger.hp, !!buffOf(dodger, 'stun')], [1e9, true], 'dodged, still stunned');
  assert.equal(buffOf(free, 'stun'), undefined, 'in range but not blocked');
  assert.equal(attackMods(w, c, op).scale, 1, 'its attacks are not ×1.7');
});

test('[技能-15] 但书: a hit on every enemy in range, then 停顿 and 沉默 for the seconds of the next clause — not on one the hit killed', () => {
  const status = [{ key: /** @type {const} */ ('sluggish'), seconds: 7 }, { key: /** @type {const} */ ('silence'), seconds: 7 }];
  const opening = [{ where: /** @type {const} */ ('attack'), hit: { scale: 2.8, type: /** @type {const} */ ('arts') }, status }];
  const { w, c } = field(sk({ duration: 7, bb: { atk_scale: 2.8, base_attack_time: -1 }, extra: { opening, hitScale: 'attack' } }));
  const op = deploy(w, c);
  op.atkCd = 9999;
  const e = foe(w, c, 2, 1), out = foe(w, c, 0, 1), weak = foe(w, c, 2, 1);
  weak.hp = 1;
  arm(w, c, op);
  assert.equal(1e9 - e.hp, statsOf(op).atk * 2.8);
  assert.deepEqual([!!buffOf(e, 'sluggish'), !!buffOf(e, 'silence')], [true, true]);
  assert.deepEqual([out.hp, buffOf(out, 'sluggish')], [1e9, undefined], 'behind the attack range');
  assert.deepEqual([weak.hp, buffOf(weak, 'sluggish'), buffOf(weak, 'silence')], [0, undefined, undefined]);
});

test('[技能-15] [技能-5] a registered behaviour is not also done from the description: one that runs the generic one keeps its flat start cost', () => {
  const extra = { stopAttack: {}, selfLoss: { ratio: 0.5 }, costGain: { every: 0.5, cost: 1, steps: 6, plain: true } };
  // as the kit bridge does for an operator without the kit whose skill id a kit registered (compat specs.js)
  const { w, c } = field(sk({ id: 'owned', bb: { cost: 1 }, extra }), (cc) => {
    cc.behaviors = { skills: { owned: { start(ctx) { GENERIC.start(ctx); } } } };
  });
  const op = deploy(w, c);
  const p = w.players[0], start = p.cost;
  arm(w, c, op);
  assert.deepEqual([op.hp, buffOf(op, 'skillStop'), buffOf(op, 'skillCostGain'), p.cost], [1000, undefined, undefined, start + 1]);
  run(w, c, secondsToFrames(3));
  assert.equal(p.cost, start + 1, 'nothing bit by bit');
});
