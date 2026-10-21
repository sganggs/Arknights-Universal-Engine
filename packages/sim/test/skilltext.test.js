// Runtime of a skill's description besides its attacks (docs/spec/skills.md 技能-14). Numbers mirror skill level 7.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secondsToFrames } from '@aue/math';
import { tinyContent } from '@aue/testkit';
import { createWorld, step } from '../src/index.js';
import { statsOf } from '../src/attrs.js';
import { makeBuff, addBuff } from '../src/buffs.js';
import { enemyAttack } from '../src/combat.js';
import { dealDamage } from '../src/damage.js';
import { epOf } from '../src/elements.js';
import { endSkill, attackMods } from '../src/skills.js';
import { skillCounter, openSkillText } from '../src/skilltext.js';
import { forceSp } from '../src/sp.js';
import { makeEnemy, makeOperator } from '../src/units.js';

/** @typedef {import('../src/types.js').SkillDef} SkillDef */
/** @typedef {import('../src/types.js').Unit} Unit */
/** @typedef {import('../src/types.js').Content} Content */
/** @typedef {import('../src/types.js').World} World */

/** x-4, the 3×3 古米 stores on the heal. */
const X4 = [
  { row: 1, col: -1 }, { row: 1, col: 0 }, { row: 1, col: 1 }, { row: 0, col: -1 }, { row: 0, col: 0 }, { row: 0, col: 1 },
  { row: -1, col: -1 }, { row: -1, col: 0 }, { row: -1, col: 1 },
];
/** x-1, 余 S2's level range: behind the operator, not three tiles ahead. */
const X1 = [
  { row: 2, col: 0 }, { row: 1, col: -1 }, { row: 1, col: 0 }, { row: 1, col: 1 }, { row: 0, col: -2 }, { row: 0, col: -1 },
  { row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }, { row: -1, col: -1 }, { row: -1, col: 0 }, { row: -1, col: 1 }, { row: -2, col: 0 },
];

/** @param {Partial<SkillDef>} o @returns {SkillDef} */
const sk = (o) => ({ id: 'text', type: 'MANUAL', sp: 'time', cost: 5, init: 0, charges: 1, duration: 20, ammo: false, bb: {}, ...o });

/**
 * The tiny level, no spawns, the guard slow to attack. `prep` runs before the world exists.
 * @param {SkillDef} skill @param {(c: Content) => void} [prep]
 */
function field(skill, prep) {
  const c = /** @type {Content} */ (tinyContent());
  c.level.waves = [];
  c.operators.guard.baseAttackTime = 100;
  c.operators.guard.skill = skill;
  prep?.(c);
  return { w: createWorld(c, { seed: 1, players: 1 }), c };
}

/** @param {World} w @param {Content} c */
function deploy(w, c) {
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  return /** @type {Unit} */ (w.units.find((u) => u.key === 'guard'));
}

/** @param {World} w @param {Content} c @param {Unit} op */
function arm(w, c, op) {
  forceSp(/** @type {import('../src/types.js').SkillState} */ (op.skill), 99);
  step(w, c, [[0, { type: 'skill', unit: op.id }]]);
}

/** @param {World} w @param {Content} c @param {number} x @param {number} y @param {Record<string, unknown>} [more] */
function foe(w, c, x, y, more = {}) {
  const e = makeEnemy(w, c, { key: 'slime', route: 0 });
  e.x = x; e.y = y;
  e.base = { ...e.base, maxHp: 1e9, def: 0, res: 0, moveSpeed: 0, atk: 0, ...more };
  e.hp = 1e9; e.maxHp = 1e9;
  w.units.push(e);
  return e;
}

/** A quiet ally on a tile. @param {World} w @param {Content} c @param {number} col @param {number} row @param {number} hp */
function ally(w, c, col, row, hp) {
  const u = makeOperator(w, c, { key: 'guard', owner: 0, row, col, dir: 0 });
  u.hp = hp; u.skill = null; u.atkCd = 9999;
  u.base = { ...u.base, atk: 0 };
  w.units.push(u);
  return u;
}

/** @param {World} w @param {Content} c @param {number} n */
function run(w, c, n) { for (let i = 0; i < n; i++) step(w, c, []); }

/** @param {Unit} op */
const barrier = (op) => op.buffs.find((b) => b.key === 'skillBarrier');

test('[技能-14] the counter hits the attacker, ignores a non-attack, and gives the operator no SP', () => {
  const { w, c } = field(sk({ bb: { atk_scale: 1.3 }, extra: { counter: { scale: 1.3, stat: 'atk', type: 'arts' }, hitScale: 'attack' } }));
  const op = deploy(w, c);
  const e = foe(w, c, 4, 1);
  addBuff(e, makeBuff({ key: 'dodge', mods: { dodgeArts: 1 } }));
  skillCounter(w, c, op, e, { type: 'phys', amount: 10, isAttack: true });
  assert.equal(e.hp, 1e9, 'the skill is not up');
  arm(w, c, op);
  assert.equal(op.skill?.sp, 0);
  skillCounter(w, c, op, e, { type: 'arts', amount: 10, isAttack: false });
  assert.equal(e.hp, 1e9, 'not an attack');
  skillCounter(w, c, op, e, { type: 'arts', amount: 10, isAttack: true });
  assert.equal(e.hp, 1e9 - statsOf(op).atk * 1.3, 'undoable: a full arts dodge still takes it');
  assert.equal(op.skill?.sp, 0, 'the counter is not an attack and not a hit on her');
});

test('[技能-14] a counter off defence uses the defence after the skill\'s buff', () => {
  const { w, c } = field(sk({ bb: { def: 0.85, atk_scale: 0.4 }, extra: { counter: { scale: 0.4, stat: 'def', type: 'phys' }, hitScale: 'attack' } }));
  const op = deploy(w, c);
  arm(w, c, op);
  const e = foe(w, c, 2, 1);
  skillCounter(w, c, op, e, { type: 'phys', amount: 10, isAttack: true });
  assert.equal(1e9 - e.hp, statsOf(op).def * 0.4);
});

test('[技能-14] 周围地面 waits out aoe_cd, skips flying, and adds the sentence\'s 元素损伤 and silence', () => {
  /** @type {NonNullable<NonNullable<SkillDef['extra']>['counter']>} */
  const counter = { scale: 1.4, stat: 'atk', type: 'arts', around: true, ground: true, cooldown: 2, element: 'DARK', epScale: 0.25, silence: 3 };
  const { w, c } = field(sk({ duration: 40, bb: { atk_scale: 1.4 }, extra: { counter, hitScale: 'attack' } }));
  const op = deploy(w, c);
  arm(w, c, op);
  const far = foe(w, c, 4, 1);
  w.frame = 10;
  skillCounter(w, c, op, far, { type: 'phys', amount: 1, isAttack: true });
  assert.equal(far.hp, 1e9, 'nobody 周围');
  assert.equal(op.buffs.find((b) => b.key === 'counterCd')?.n, 10, 'the cooldown starts anyway');
  const ground = foe(w, c, 2, 1);
  const fly = foe(w, c, 1, 2, { motion: 'FLY' });
  w.frame = 10 + secondsToFrames(2) - 1;
  skillCounter(w, c, op, ground, { type: 'phys', amount: 1, isAttack: true });
  assert.equal(ground.hp, 1e9, 'still cooling');
  w.frame = 10 + secondsToFrames(2);
  skillCounter(w, c, op, ground, { type: 'phys', amount: 1, isAttack: true });
  const drop = statsOf(op).atk * 1.4;
  assert.equal(1e9 - ground.hp, drop);
  assert.equal(fly.hp, 1e9, 'flying is not 地面');
  assert.equal(epOf(ground, 'DARK'), epOf(fly, 'DARK') - statsOf(op).atk * 0.25);
  assert.equal(ground.buffs.some((b) => b.key === 'silence'), true);
});

test('[技能-14] an enemy\'s attack takes the counter and does not recover SP while the skill runs', () => {
  const { w, c } = field(sk({ sp: 'hurt', init: 5, bb: { atk_scale: 1.3 }, extra: { counter: { scale: 1.3, stat: 'atk', type: 'arts' }, hitScale: 'attack' } }));
  const op = deploy(w, c);
  arm(w, c, op);
  const e = foe(w, c, 4, 1, { atk: 10 });
  e.blockedBy = op.id;
  assert.equal(op.skill?.sp, 0);
  enemyAttack(w, c, e);
  assert.equal(op.skill?.sp, 0, '阻回: the hit gives nothing while the skill runs, and the counter is not an attack');
  assert.equal(e.hp, 1e9 - statsOf(op).atk * 1.3);
});

test('[技能-14] a decaying barrier steps down every 0.5 s from the total, after the stat buff', () => {
  const { w, c } = field(sk({ type: 'PASSIVE', sp: 'none', duration: -1, bb: { max_hp: 0.5 }, extra: { barrier: { ratio: 1.8, seconds: 10, decay: true } } }));
  const op = deploy(w, c);
  const b = barrier(op);
  assert.ok(b);
  assert.equal(statsOf(op).maxHp, 1500, 'max_hp is on before the shield');
  assert.equal(b.shield, 1500 * 1.8);
  assert.equal(b.value, b.shield * 0.5 / 10);
  const full = b.shield;
  run(w, c, 13);
  assert.equal(b.shield, full, 'the deploy frame already counted as 1');
  run(w, c, 1);
  assert.equal(b.shield, full - b.value);
});

test('[技能-14] a barrier tied to the skill goes when it ends; one with its own seconds stays; physical ignores arts', () => {
  const tied = field(sk({ extra: { barrier: { ratio: 1, seconds: 30, tied: true } } }));
  const op = deploy(tied.w, tied.c);
  arm(tied.w, tied.c, op);
  assert.ok(barrier(op));
  endSkill(tied.w, tied.c, op, 'stopped');
  assert.equal(barrier(op), undefined);
  const own = field(sk({ extra: { barrier: { ratio: 0.5, seconds: 10, type: 'phys' } } }), (c) => { c.operators.guard.def = 0; });
  const g = deploy(own.w, own.c);
  arm(own.w, own.c, g);
  const before = g.hp;
  dealDamage(own.w, null, g, { type: 'arts', amount: 40 }, own.c);
  assert.deepEqual([g.hp, barrier(g)?.shield], [before - 40, 500], 'arts passes a physical barrier');
  dealDamage(own.w, null, g, { type: 'phys', amount: 30 }, own.c);
  assert.deepEqual([g.hp, barrier(g)?.shield], [before - 40, 470]);
  endSkill(own.w, own.c, g, 'stopped');
  assert.equal(barrier(g)?.shield, 470, 'its own seconds are not the skill\'s');
});

test('[技能-14] a registered behaviour is not also done from the description', () => {
  const { w, c } = field(sk({ id: 'owned', extra: { barrier: { ratio: 1, seconds: 10 } } }), (c) => {
    c.behaviors = { skills: { owned: { start() { /* the kit owns this id */ } } } };
  });
  const op = deploy(w, c);
  arm(w, c, op);
  assert.equal(barrier(op), undefined);
});

test('[技能-14] a start burst hits the level range, flying included, and a far enemy stays', () => {
  const burst = { at: /** @type {const} */ ('start'), scale: 2, type: /** @type {const} */ ('phys'), where: /** @type {const} */ ('cells'), range: X1 };
  const { w, c } = field(sk({ type: 'PASSIVE', sp: 'none', duration: -1, bb: { atk_scale: 2 }, extra: { bursts: [burst], hitScale: 'attack' } }));
  const behind = foe(w, c, 0, 1, { motion: 'FLY' });
  const far = foe(w, c, 4, 1);
  deploy(w, c);
  assert.equal(1e9 - behind.hp, 100, 'passive, behind, flying');
  assert.equal(far.hp, 1e9);
});

test('[技能-14] [技能-5] the end burst uses atk_scale; the attack uses attack@atk_scale; a downed operator does not burst', () => {
  const burst = { at: /** @type {const} */ ('end'), scale: 2.4, type: /** @type {const} */ ('arts'), where: /** @type {const} */ ('attack') };
  const { w, c } = field(sk({ bb: { atk_scale: 2.4, 'attack@atk_scale': 1.15 }, extra: { bursts: [burst], hitScale: 'attack' } }));
  const op = deploy(w, c);
  const near = foe(w, c, 2, 1);
  const out = foe(w, c, 0, 1);
  arm(w, c, op);
  assert.equal(attackMods(w, c, op).scale, 1.15);
  assert.equal(near.hp, 1e9 - statsOf(op).atk * 1.15, 'one attack');
  assert.equal(out.hp, 1e9);
  const mid = near.hp;
  endSkill(w, c, op, 'duration');
  assert.equal(near.hp, mid - statsOf(op).atk * 2.4);
  assert.equal(out.hp, 1e9, 'behind the attack range');
  const dead = field(sk({ extra: { bursts: [burst], hitScale: 'attack' } }));
  const op2 = deploy(dead.w, dead.c);
  const e2 = foe(dead.w, dead.c, 2, 1);
  arm(dead.w, dead.c, op2);
  const left = e2.hp;
  op2.hp = 0;
  endSkill(dead.w, dead.c, op2, 'duration');
  assert.equal(e2.hp, left, 'no HP');
  const gone = field(sk({ extra: { bursts: [burst], hitScale: 'attack' } }));
  const op3 = deploy(gone.w, gone.c);
  const e3 = foe(gone.w, gone.c, 2, 1);
  arm(gone.w, gone.c, op3);
  const stay = e3.hp;
  endSkill(gone.w, gone.c, op3, 'death');
  assert.equal(e3.hp, stay, 'leaving the field');
});

test('[技能-14] self-stun at the end; not when she is down or the skill ends because she leaves', () => {
  const extra = { selfStun: { seconds: 5 } };
  const { w, c } = field(sk({ bb: { stun: 5 }, extra }));
  const op = deploy(w, c);
  arm(w, c, op);
  endSkill(w, c, op, 'duration');
  assert.equal(op.buffs.find((b) => b.key === 'stun')?.left, secondsToFrames(5));
  const down = field(sk({ extra }));
  const a = deploy(down.w, down.c);
  arm(down.w, down.c, a);
  a.hp = 0;
  endSkill(down.w, down.c, a, 'duration');
  assert.equal(a.buffs.some((b) => b.key === 'stun'), false);
  const left = field(sk({ extra }));
  const b = deploy(left.w, left.c);
  arm(left.w, left.c, b);
  endSkill(left.w, left.c, b, 'death');
  assert.equal(b.buffs.some((x) => x.key === 'stun'), false);
});

test('[技能-14] one ally: the most injured inside the range; 其他 skips herself', () => {
  const heal = { scale: 1.3, on: /** @type {const} */ ('attack'), range: X4 };
  const { w, c } = field(sk({ duration: 0, bb: {}, extra: { allyHeal: heal } }));
  const op = deploy(w, c);
  const low = ally(w, c, 0, 1, 100);
  const mid = ally(w, c, 1, 0, 500);
  foe(w, c, 2, 1);
  arm(w, c, op);
  assert.deepEqual([low.hp, mid.hp, op.hp], [100 + 50 * 1.3, 500, 1000]);
  const other = { scale: 1.3, on: /** @type {const} */ ('attack'), others: true, range: X4 };
  const o = field(sk({ duration: 0, bb: {}, extra: { allyHeal: other } }));
  const self = deploy(o.w, o.c);
  self.hp = 100;
  const mate = ally(o.w, o.c, 0, 1, 500);
  foe(o.w, o.c, 2, 1);
  arm(o.w, o.c, self);
  assert.deepEqual([self.hp, mate.hp], [100, 500 + 50 * 1.3]);
});

test('[技能-14] a single ally falls back within 1.5; 不足一半 is strict; 所有 does not fall back', () => {
  const one = { scale: 1.5, on: /** @type {const} */ ('attack'), below: 0.5 };
  const { w, c } = field(sk({ duration: 0, bb: {}, extra: { allyHeal: one } }));
  const op = deploy(w, c);
  const half = ally(w, c, 2, 1, 500);
  const low = ally(w, c, 0, 1, 400);
  const far = ally(w, c, 3, 1, 100);
  foe(w, c, 2, 1);
  arm(w, c, op);
  assert.deepEqual([half.hp, low.hp, far.hp], [500, 400 + 50 * 1.5, 100]);
  const all = { scale: 1.1, on: /** @type {const} */ ('start'), all: true, range: [{ row: 0, col: 0 }] };
  const s = field(sk({ duration: 0, type: 'AUTO', bb: {}, extra: { allyHeal: all } }));
  const self = deploy(s.w, s.c);
  const near = ally(s.w, s.c, 0, 1, 100);
  forceSp(/** @type {import('../src/types.js').SkillState} */ (self.skill), 99);
  step(s.w, s.c, []);
  assert.equal(near.hp, 100, '所有 does not reach past the stored cells');
});

test('[技能-14] 所有友方 at the start heals every injured ally in the cells, herself included', () => {
  const heal = { scale: 1.1, on: /** @type {const} */ ('start'), all: true, range: X4 };
  const { w, c } = field(sk({ duration: 0, type: 'AUTO', bb: {}, extra: { allyHeal: heal } }));
  const op = deploy(w, c);
  op.hp = 400;
  const a = ally(w, c, 0, 1, 200);
  const full = ally(w, c, 1, 0, 1000);
  forceSp(/** @type {import('../src/types.js').SkillState} */ (op.skill), 99);
  step(w, c, []);
  assert.deepEqual([op.hp, a.hp, full.hp], [400 + 50 * 1.1, 200 + 50 * 1.1, 1000]);
  assert.equal(op.skill?.active, false, 'no duration: it ends in the frame it starts');
});

test('[技能-14] a medic does not heal from the sentence', () => {
  const heal = { scale: 1.3, on: /** @type {const} */ ('start'), all: true, range: X4 };
  const { w, c } = field(sk({ extra: { allyHeal: heal } }), (cc) => { cc.operators.guard.profession = 'MEDIC'; });
  const op = deploy(w, c);
  const a = ally(w, c, 0, 1, 100);
  openSkillText(w, c, op);
  assert.equal(a.hp, 100);
});
