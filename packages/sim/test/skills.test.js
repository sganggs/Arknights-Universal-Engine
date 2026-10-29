// Skills (docs/spec/skills.md): SP by the slot, by attacking and by being hit; starting by command, on its own and at
// deployment; durations, ammo, next-attack skills and charges; the generic effects of the blackboard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step, setAtkCd } from '../src/index.js';
import { kindOf, makeSkillState, statMods, skillMods, STAT_KEYS, beforeAttack, setTimeLeft } from '../src/skills.js';
import { gainSp, forceSp, timeSp, hurtSp } from '../src/sp.js';
import { makeEnemy } from '../src/units.js';
import { applyStatus } from '../src/status.js';
import { dealDamage } from '../src/damage.js';
import { makeBuff } from '../src/buffs.js';
import { statsOf } from '../src/attrs.js';
import { reachKeys, setRange } from '../src/reach.js';

/** @typedef {import('../src/types.js').SkillDef} SkillDef @typedef {import('../src/types.js').Unit} Unit @typedef {import('../src/types.js').World} World */

/** @param {Partial<SkillDef>} o @returns {SkillDef} */
const sk = (o) => ({ id: 'test', type: 'MANUAL', sp: 'time', cost: 5, init: 0, charges: 1, duration: 0, ammo: false, bb: {}, ...o });

/**
 * The tiny level without waves: the guard (atk 50, 1 s) deployed at (1, 1) facing right with the skill, and a rooted
 * dummy at (1, 2) in its range (def 0, a billion HP). Returns the world, content, guard and dummy.
 * @param {SkillDef} skill @param {number} [dummies]
 */
function arena(skill, dummies = 1) {
  const c = tinyContent();
  c.operators.guard.skill = skill;
  c.level.waves = [];
  const w = createWorld(c, { seed: 1, players: 2 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const guard = w.units[0];
  for (let i = 0; i < dummies; i++) {
    const foe = makeEnemy(w, c, { key: 'slime', route: 0 });
    foe.x = 2; foe.y = 1;
    foe.base = { ...foe.base, maxHp: 1e9, def: 0 };
    foe.hp = 1e9; foe.maxHp = 1e9;
    applyStatus(foe, 'root', {});
    w.units.push(foe);
  }
  return { w, c, guard };
}
/** Runs n frames, collecting events with their frame. @param {World} w @param {any} c @param {number} n @param {any[]} [cmds] */
function run(w, c, n, cmds = []) {
  /** @type {any[]} */
  const out = [];
  for (let i = 0; i < n; i++) for (const e of step(w, c, i === 0 ? cmds : [])) out.push({ ...e, f: w.frame - 1 });
  return out;
}

test('[技能-1] kinds from the data: passive, ammo, duration, next attack, instant', () => {
  assert.equal(kindOf(sk({ type: 'PASSIVE', duration: 10 })), 'passive');
  assert.equal(kindOf(sk({ ammo: true, bb: { 'attack@trigger_time': 4 } })), 'ammo');
  assert.equal(kindOf(sk({ duration: 20, bb: { atk: 1 } })), 'duration');
  assert.equal(kindOf(sk({ type: 'AUTO', sp: 'attack', duration: -1, bb: { atk_scale: 1.9 } })), 'next', '强力击');
  assert.equal(kindOf(sk({ type: 'AUTO', bb: { cost: 6 } })), 'instant', '冲锋号令');
  assert.deepEqual(makeSkillState(sk({ init: 9, cost: 3, charges: 2 })), { id: 'test', spType: 'time', cost: 3, cap: 6, sp: 6, slot: 0, active: false, armed: false, dur: -1, ammo: 0, at: -1 });
});

test('[技能-2] the SP slot: a point per 1 / speed seconds, the overflow kept, paused when full or during the skill; SP ignoring 阻回', () => {
  const st = makeSkillState(sk({ cost: 10 }));
  /** @param {number} rate @param {number} n */
  const frames = (rate, n) => { const at = []; for (let f = 1; at.length < n; f++) { const b = st.sp; timeSp(st, rate); if (st.sp > b) at.push(f); } return at; };
  assert.deepEqual(frames(1, 2), [30, 60]);
  st.sp = 0; st.slot = 0;
  assert.deepEqual(frames(1.5, 3), [20, 40, 60]);
  st.sp = 0; st.slot = 0;
  assert.deepEqual(frames(0.7, 3), [43, 86, 129], 'the overflow of each slot carries over (42.86, 85.71, 128.57)');
  st.sp = 9; st.slot = 0;
  for (let i = 0; i < 40; i++) timeSp(st, 1);
  assert.equal(st.sp, 10);
  const slot = st.slot;
  for (let i = 0; i < 40; i++) timeSp(st, 1);
  assert.equal(st.slot, slot, 'full: the slot keeps its progress');
  st.sp = 0; st.active = true;
  timeSp(st, 1);
  assert.equal(gainSp(st, 3), 0, '阻回');
  assert.equal(st.slot, slot);
  assert.deepEqual([forceSp(st, 3), st.sp, forceSp(st, 20), st.sp, forceSp(st, 1)], [3, 3, 7, 10, 0], 'ignoring 阻回: during the skill too, up to the cap');
});

test('[技能-2] by attacking: one point an attack, none for the skill\'s own attacks; by being hit, one a hit', () => {
  const a = arena(sk({ type: 'AUTO', sp: 'attack', cost: 3, duration: -1, bb: { atk_scale: 2 } }));
  const ev = run(a.w, a.c, 30 * 8 + 2);
  const hits = ev.filter((e) => e.type === 'hit').map((e) => e.damage);
  assert.deepEqual(hits.slice(0, 8), [50, 50, 50, 100, 50, 50, 50, 100], 'a cost-3 next-attack skill: every fourth attack');
  const h = arena(sk({ sp: 'hurt', cost: 4 }));
  const g = h.guard, foe = h.w.units[1];
  g.buffs.push(makeBuff({ key: 'shield', shieldHits: 1 }), makeBuff({ key: 'dodge', mods: { dodgePhys: 1 } }));
  for (let i = 0; i < 2; i++) dealDamage(h.w, foe, g, { type: 'phys', amount: 10 });
  assert.equal(g.skill?.sp, 2, 'dodged and blocked hits count');
  dealDamage(h.w, foe, g, { type: 'arts', amount: 10, noHurtSp: true });
  assert.equal(g.skill?.sp, 2, 'none for a hit marked noHurtSp (敌能-103: the burn)');
  dealDamage(h.w, foe, g, { type: 'phys', amount: 10, hpLoss: true });
  applyStatus(g, 'invincible', { frames: 5 });
  dealDamage(h.w, foe, g, { type: 'phys', amount: 10 });
  assert.equal(g.skill?.sp, 2, 'no point for 生命流失 or while invincible');
  hurtSp(g); hurtSp(g); hurtSp(g);
  assert.equal(g.skill?.sp, 4, 'up to the cap');
});

test('[技能-3] the skill command: the seat\'s own operator, a MANUAL skill, ready, able to act, not silenced', () => {
  const a = arena(sk({ cost: 2, init: 2, duration: 1, bb: { atk: 1 } }));
  const id = a.guard.id, cmd = (/** @type {number} */ seat) => [[seat, { type: 'skill', unit: id }]];
  run(a.w, a.c, 1, cmd(1));
  assert.equal(a.guard.skill?.active, false, 'another seat');
  applyStatus(a.guard, 'stun', { frames: 3 });
  run(a.w, a.c, 1, cmd(0));
  assert.equal(a.guard.skill?.active, false, 'stunned');
  a.guard.buffs = [];
  applyStatus(a.guard, 'silence', { frames: 3 });
  run(a.w, a.c, 1, cmd(0));
  assert.equal(a.guard.skill?.active, false, 'silenced');
  a.guard.buffs = [];
  const ev = run(a.w, a.c, 1, cmd(0));
  assert.equal(a.guard.skill?.active, true);
  assert.deepEqual(ev.filter((e) => e.type === 'skill').map((e) => [e.id, e.active]), [[id, 1]]);
  assert.equal(statsOf(a.guard).atk, 100, 'atk +100 %');
  const b = arena(sk({ cost: 2, init: 1 }));
  run(b.w, b.c, 1, [[0, { type: 'skill', unit: b.guard.id }]]);
  assert.equal(b.guard.skill?.sp, 1, 'not ready: nothing taken');
  const auto = arena(sk({ type: 'AUTO', cost: 9, init: 9, duration: 5 }));
  auto.guard.skill && (auto.guard.skill.sp = 0);
  run(auto.w, auto.c, 1, [[0, { type: 'skill', unit: auto.guard.id }]]);
  assert.equal(auto.guard.skill?.active, false, 'an AUTO skill takes no command');
});

test('[技能-3] AUTO: an instant skill starts when ready; others when about to attack; PASSIVE at deployment', () => {
  const a = arena(sk({ type: 'AUTO', cost: 2, init: 0, bb: { cost: 6 } }), 0);
  a.c.level.options.maxCost = 99;
  const before = a.w.players[0].cost;
  const ev = run(a.w, a.c, 60);
  assert.deepEqual(ev.filter((e) => e.type === 'skill').map((e) => e.f), [59, 59], 'instant: on and off in the frame it is ready');
  assert.equal(a.w.players[0].cost - before, 6 + 2, '+6 from the skill, +2 over 60 frames');
  const b = arena(sk({ type: 'AUTO', cost: 1, init: 1, duration: 2, bb: { atk: 1 } }), 0);
  run(b.w, b.c, 90);
  assert.equal(b.guard.skill?.active, false, 'no target, no start');
  const p = arena(sk({ type: 'PASSIVE', sp: 'none', cost: 0, duration: 10, bb: { atk: 0.3, def: 0.3 } }), 0);
  assert.equal(p.guard.skill?.active, true);
  assert.equal(statsOf(p.guard).atk, 65);
  run(p.w, p.c, 300);
  assert.equal(p.guard.skill?.active, false);
  assert.equal(statsOf(p.guard).atk, 50);
});

test('[技能-4] a duration runs n frames from the frame it starts; stun does not stop it; no SP meanwhile', () => {
  const a = arena(sk({ cost: 1, init: 1, duration: 1, bb: { attack_speed: 100 } }), 0);
  run(a.w, a.c, 1, [[0, { type: 'skill', unit: a.guard.id }]]);
  const started = a.w.frame - 1;
  applyStatus(a.guard, 'stun', { frames: 10 });
  /** @type {number[]} */
  const on = [];
  for (let i = 0; i < 40; i++) { if (a.guard.skill?.active) on.push(a.w.frame); step(a.w, a.c); }
  assert.equal(on.length, 30, 'still running before frames started+1 … started+30; it ends in the turn of started+30');
  assert.equal(on[0], started + 1);
  assert.equal(on[29], started + 30);
  assert.equal(a.guard.skill?.sp, 0, 'the slot did not run while it was active');
});

test('[技能-4] ammo: each skill attack takes a shot; out of ammo it ends at the next attack, which is a normal one', () => {
  const a = arena(sk({ cost: 1, init: 1, ammo: true, bb: { 'attack@trigger_time': 2, 'attack@atk_scale': 3 } }));
  const ev = run(a.w, a.c, 30 * 4, [[0, { type: 'skill', unit: a.guard.id }]]);
  const hits = ev.filter((e) => e.type === 'hit').map((e) => e.damage), skill = ev.filter((e) => e.type === 'skill');
  assert.deepEqual(hits.slice(0, 4), [150, 150, 50, 50]);
  const firstNormal = ev.filter((e) => e.type === 'hit')[2].f;
  assert.equal(skill[1].f, firstNormal, 'it ended at the third attack');
});

test('[技能-4] charges: SP holds cost × charges; two uses back to back', () => {
  const a = arena(sk({ cost: 2, init: 9, charges: 2, bb: { cost: 1 } }), 0);
  assert.equal(a.guard.skill?.sp, 4);
  const before = a.w.players[0].cost;
  run(a.w, a.c, 1, [[0, { type: 'skill', unit: a.guard.id }]]);
  run(a.w, a.c, 1, [[0, { type: 'skill', unit: a.guard.id }]]);
  assert.equal(a.guard.skill?.sp, 0);
  assert.equal(a.w.players[0].cost - before, 2);
});

test('[技能-5] the blackboard: attribute keys as mods, attack keys as the mods of the skill\'s attacks', () => {
  assert.deepEqual(statMods({ atk: 0.5, attack_speed: 30, def: -0.2, block_cnt: 1, times: 2, unknown: 9 }), { atkPct: 0.5, defPct: -0.2, aspd: 30, blockCnt: 1 });
  assert.equal(Object.keys(STAT_KEYS).length, 16);
  assert.deepEqual(skillMods({ 'attack@atk_scale': 2.3, 'attack@max_target': 3 }), { scale: 2.3, times: 1, targets: 3, skill: true });
  const a = arena(sk({ cost: 1, init: 1, duration: 5, bb: { atk_scale: 1.5, times: 2, max_target: 2 } }), 3);
  const ev = run(a.w, a.c, 2, [[0, { type: 'skill', unit: a.guard.id }]]);
  const hits = ev.filter((e) => e.type === 'hit');
  assert.equal(new Set(hits.map((e) => e.target)).size, 2, 'two targets');
  assert.deepEqual(hits.map((e) => e.damage), [75, 75, 75, 75], 'two hits each at 150 %');
  const v = arena(sk({ cost: 1, init: 1, duration: 10, bb: { cost: 6, atk: 0.2 } }), 0), before = v.w.players[0].cost;
  run(v.w, v.c, 1, [[0, { type: 'skill', unit: v.guard.id }]]);
  assert.equal(v.w.players[0].cost - before, 6, 'a duration skill\'s cost comes when it starts (香草)');
  assert.equal(statsOf(v.guard).atk, 60, 'and its attack +20 % for the duration');
});

test('[技能-6] a behaviour by skill id: its trigger, start, tick, attack and end, acting only through the context', () => {
  /** @type {string[]} */
  const seen = [];
  const a = arena(sk({ id: 'probe', type: 'AUTO', cost: 1, init: 1, duration: 1, bb: { power: 7 } }));
  const foe = /** @type {Unit} */ (a.w.units[1]);
  /** @type {import('../src/skills.js').SkillBehavior} */
  const probe = {
    trigger: 'attack',
    start(ctx) {
      seen.push(`start ${ctx.kind} ${ctx.bb.power}`);
      ctx.addBuff(ctx.self, { key: 'probe', mods: { atkFlat: 10 } });
      ctx.applyStatus(foe, 'stun', { frames: 100 });
      ctx.gainCost(1);
    },
    tick(ctx) { if (ctx.frame === ctx.self.skill?.at) return; if (!seen.includes('tick')) seen.push('tick'); },
    attack(ctx, mods) { seen.push(`attack ${ctx.stats(ctx.self).atk}`); return { ...mods, scale: 2 }; },
    end(ctx) {
      seen.push(`end ${ctx.dealDamage(foe, { type: 'true', amount: 5 })} ${ctx.heal(ctx.self, 1)}`);
      ctx.removeBuff(ctx.self, 'probe');
    },
  };
  a.c.behaviors = { skills: { probe } };
  const ev = run(a.w, a.c, 40);
  assert.deepEqual(seen, ['start duration 7', 'attack 60', 'tick', 'end 5 0']);
  assert.equal(ev.find((e) => e.type === 'hit')?.damage, 120, 'its attack mods: 60 atk × 2');
  assert.equal(foe.buffs.find((b) => b.key === 'stun')?.src, a.guard.id, 'the status names the skill\'s operator as its source');
  assert.equal(statsOf(a.guard).atk, 50);
});

test('[技能-7] the skill command closes a running closable skill — duration or ammo, MANUAL or AUTO — when the operator may trigger it', () => {
  const a = arena(sk({ cost: 2, init: 2, duration: 30, bb: { atk: 1 }, stoppable: true }));
  const cmd = [[0, { type: 'skill', unit: a.guard.id }]];
  run(a.w, a.c, 1, cmd);
  assert.equal(a.guard.skill?.active, true);
  applyStatus(a.guard, 'stun', { frames: 3 });
  run(a.w, a.c, 1, cmd);
  assert.equal(a.guard.skill?.active, true, 'stunned: no second trigger either');
  a.guard.buffs = a.guard.buffs.filter((b) => b.key !== 'stun');
  const ev = run(a.w, a.c, 1, cmd);
  assert.deepEqual(ev.filter((e) => e.type === 'skill').map((e) => e.active), [0]);
  assert.deepEqual([a.guard.skill?.active, a.guard.skill?.sp, statsOf(a.guard).atk], [false, 0, 50], 'closed: SP from 0, the bonus gone');
  run(a.w, a.c, 1, cmd);
  assert.equal(a.guard.skill?.active, false, 'not ready again yet: the command does nothing');
  const ammo = arena(sk({ type: 'AUTO', cost: 1, init: 1, ammo: true, bb: { 'attack@trigger_time': 50 }, stoppable: true }));
  run(ammo.w, ammo.c, 60);
  assert.equal(ammo.guard.skill?.active, true, 'the AUTO ammo skill started on its attack');
  run(ammo.w, ammo.c, 1, [[0, { type: 'skill', unit: ammo.guard.id }]]);
  assert.deepEqual([ammo.guard.skill?.active, ammo.guard.skill?.ammo], [false, 0]);
  const fixed = arena(sk({ cost: 2, init: 2, duration: 30 }));
  run(fixed.w, fixed.c, 1, [[0, { type: 'skill', unit: fixed.guard.id }]]);
  run(fixed.w, fixed.c, 1, [[0, { type: 'skill', unit: fixed.guard.id }]]);
  assert.equal(fixed.guard.skill?.active, true, 'not closable: it runs on');
});

test('[技能-8] while a skill with a range runs, the operator attacks within it; one reaching the whole map reaches everywhere', () => {
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [];
  c.operators.guard = { ...c.operators.guard, range: [{ row: 0, col: 0 }], skill: sk({ cost: 1, init: 1, duration: 10, range: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }] }) };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const g = w.units[0];
  assert.deepEqual([...reachKeys(c, g)], [1 * 6 + 1]);
  step(w, c, [[0, { type: 'skill', unit: g.id }]]);
  assert.deepEqual([...reachKeys(c, g)].sort((a, b) => a - b), [7, 8, 9]);
  c.operators.guard.skill = { ...c.operators.guard.skill, range: undefined, rangeAll: true };
  assert.equal(reachKeys(c, g).size, 18);
});

test('[技能-8] a skill behaviour may give the running skill\'s range, read as it is now, over the record\'s', () => {
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [];
  const cells = [{ row: 0, col: 1 }];
  c.operators.guard = { ...c.operators.guard, range: [{ row: 0, col: 0 }], skill: sk({ cost: 1, init: 1, duration: 10, range: [{ row: 0, col: 1 }, { row: 0, col: 2 }] }) };
  c.behaviors = { skills: { test: { range: () => [...cells] } } };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const g = w.units[0];
  assert.deepEqual([...reachKeys(c, g)], [7], 'its own range while the skill is off');
  step(w, c, [[0, { type: 'skill', unit: g.id }]]);
  assert.deepEqual([...reachKeys(c, g)], [8], 'the behaviour\'s');
  cells.push({ row: 0, col: 3 });
  assert.deepEqual([...reachKeys(c, g)].sort((a, b) => a - b), [8, 10], 'as it is now');
});

test('[技能-9] what a description adds: every blocked enemy as targets or more of them, hits, arts, a status on each hit, modifiers', () => {
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [];
  const extra = /** @type {any} */ ({ mods: { dodgePhys: 0.5 }, attack: { more: 1, times: 2, type: 'arts', hitStatus: { key: 'stun', seconds: 1 } } });
  c.operators.guard = { ...c.operators.guard, range: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }], skill: sk({ cost: 1, init: 1, duration: 10, extra }) };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const g = w.units[0];
  for (const col of [2, 3]) {
    const e = makeEnemy(w, c, { key: 'slime', route: 0 });
    e.x = col; e.y = 1; e.base = { ...e.base, maxHp: 1e6, res: 0 }; e.hp = e.maxHp = 1e6;
    applyStatus(e, 'root', {});
    w.units.push(e);
  }
  const ev = step(w, c, [[0, { type: 'skill', unit: g.id }]]);
  const hits = ev.filter((e) => e.type === 'hit' && e.id === g.id);
  assert.deepEqual(hits.map((e) => e.damage), [50, 50, 50, 50], 'two targets (one more), two hits each, arts (no resistance)');
  assert.ok(w.units.slice(1).every((e) => e.buffs.some((b) => b.key === 'stun')));
  assert.deepEqual(g.buffs.find((b) => b.key === 'skill')?.mods, { dodgePhys: 0.5 });
  c.operators.guard.skill = { ...c.operators.guard.skill, extra: { attack: { blocked: true } } };
  assert.deepEqual(beforeAttack(w, c, g).blocked, true);
});

test('[技能-4] content may set the frames a running timed skill has left: at least 1, ended in that frame’s turn', () => {
  const a = arena(sk({ cost: 1, init: 1, duration: 10 }), 0);
  run(a.w, a.c, 1, [[0, { type: 'skill', unit: a.guard.id }]]);
  const st = /** @type {import('../src/types.js').SkillState} */ (a.guard.skill);
  setTimeLeft(st, 0);
  assert.equal(st.dur, 1);
  run(a.w, a.c, 1);
  assert.equal(st.active, false);
  setTimeLeft(st, 50);
  assert.equal(st.dur, -1, 'not running: unchanged');
});

test('[攻击-1] content may give an operator its own attack range and take it back', () => {
  const a = arena(sk({}), 0), own = [...reachKeys(a.c, a.guard)];
  setRange(a.guard, [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }]);
  assert.deepEqual([...reachKeys(a.c, a.guard)].sort((x, y) => x - y), [7, 8, 9, 10], 'row 1, columns 1–4, facing right');
  setRange(a.guard, null);
  assert.deepEqual([...reachKeys(a.c, a.guard)], own);
  assert.equal('range' in a.guard, false);
});

test('[技能-6] [职业-13] [攻击-2] a behaviour\'s timing: another kind and time than the record\'s; a buff flag noAttack; content sets the attack cooldown', () => {
  const a = arena(sk({ id: 'timed', type: 'AUTO', cost: 2, init: 2, duration: 0, bb: { atk_scale: 3 } }));
  /** @type {import('../src/skills.js').SkillBehavior} */
  const timed = { trigger: 'ready', timing: () => ({ kind: 'duration', seconds: 2 }), start(ctx) { ctx.addBuff(ctx.self, { key: 'hold', flags: { noAttack: true } }); },
    end(ctx) { ctx.removeBuff(ctx.self, 'hold'); } };
  a.c.behaviors = { skills: { timed } };
  run(a.w, a.c, 1);
  assert.deepEqual([a.guard.skill?.active, a.guard.skill?.dur], [true, 60], 'a next-attack skill by its record, two seconds by its timing');
  const ev = run(a.w, a.c, 50);
  assert.equal(ev.filter((e) => e.type === 'attack' && e.id === a.guard.id).length, 0, 'held back from attacking by the flag');
  run(a.w, a.c, 10);
  assert.equal(a.guard.skill?.active, false);
  assert.ok(run(a.w, a.c, 40).some((e) => e.type === 'attack' && e.id === a.guard.id), 'the flag gone: it attacks again');
  const plain = arena(sk({ id: 'plain', type: 'AUTO', cost: 1, init: 1, duration: 0, bb: { atk_scale: 3 } }));
  plain.c.behaviors = { skills: { plain: { timing: () => null } } };
  run(plain.w, plain.c, 1);
  assert.equal(plain.guard.skill?.dur, -1, 'no timing: the record\'s kind');
  setAtkCd(a.guard, 12.4);
  assert.equal(a.guard.atkCd, 12);
  setAtkCd(a.guard, -3);
  assert.equal(a.guard.atkCd, 0);
});

test('[技能-4] the ammo count of a skill whose blackboard says trigger_time ("装有{trigger_time}发弹药")', () => {
  const a = arena(sk({ cost: 1, init: 1, ammo: true, bb: { trigger_time: 3, 'attack@atk_scale': 3 } }));
  const ev = run(a.w, a.c, 30 * 5, [[0, { type: 'skill', unit: a.guard.id }]]);
  assert.deepEqual(ev.filter((e) => e.type === 'hit').map((e) => e.damage).slice(0, 4), [150, 150, 150, 50]);
});

test('[技能-9] [状态-5] the flags a description gives hold while the skill runs: 不死 keeps the HP at 1, and ends with the skill', () => {
  const { w, c, guard } = arena(sk({ cost: 5, init: 5, duration: 2, extra: { flags: { undying: true } } }));
  run(w, c, 1, [[0, { type: 'skill', unit: guard.id }]]);
  assert.equal(guard.skill?.active, true);
  assert.equal(statsOf(guard).flags.undying, true);
  dealDamage(w, null, guard, { type: 'true', amount: 1e9 });
  assert.equal(guard.hp, 1, 'not below 1 while the skill runs');
  run(w, c, 61);
  assert.equal(guard.skill?.active, false);
  assert.equal(guard.buffs.some((b) => b.key === 'skillFlags'), false);
  dealDamage(w, null, guard, { type: 'true', amount: 1e9 });
  assert.equal(guard.hp, 0, 'the skill over, a lethal hit is lethal');
});

test('[技能-9] flags are only held by a skill that runs: an instant one gives none', () => {
  const { w, c, guard } = arena(sk({ cost: 5, init: 5, extra: { flags: { undying: true } } }));
  run(w, c, 1, [[0, { type: 'skill', unit: guard.id }]]);
  assert.equal(guard.buffs.some((b) => b.key === 'skillFlags'), false);
  assert.equal(statsOf(guard).flags.undying, undefined);
});
