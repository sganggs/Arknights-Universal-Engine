// A figure over time: the deploy clip, attacks paced to land their OnAttack on the hit frame, idle after an attack,
// the die clip (docs/spec/render.md 渲染-3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANIM, DIR, SKILL_STATE } from '@aue/schema';
import { newFigure, follow, attacked, cast, dies, deathOver, clipAt } from '../src/figure.js';
import { tinyModel, formsModel, dollModel } from './model.js';
import { dollRoles } from '../src/roles.js';

/** A view unit doing `anim`. @param {number} kind @param {number} anim */
const unit = (kind, anim) => ({ id: 1, kind, owner: 0, x: 1, y: 1, z: 0, dir: 0, hp: 1, maxHp: 1, anim, sp: -1, spCost: 0, skill: 0, skillLeft: -1, status: 0, element: 0, ep: 1, burst: 0 });
/** A clip's name, time rounded to 1e-9, and looping. @param {{ name: string, time: number, loop: boolean }} c */
const at = (c) => [c.name, Math.round(c.time * 1e9) / 1e9, c.loop];

test('[渲染-3] an operator plays its deploy clip once, then what the view says', () => {
  const f = /** @type {import('../src/figure.js').Figure} */ (newFigure({ front: tinyModel() }, unit(0, ANIM.IDLE), 30));
  follow(f, unit(0, ANIM.IDLE), 30);
  assert.deepEqual(at(clipAt(f, 33)), ['Start', 0.1, false]);
  assert.deepEqual(at(clipAt(f, 45)), ['Idle', 0.1, true]);
  const enemy = /** @type {import('../src/figure.js').Figure} */ (newFigure({ front: tinyModel() }, unit(1, ANIM.MOVE), 0));
  follow(enemy, unit(1, ANIM.MOVE), 0);
  assert.deepEqual(at(clipAt(enemy, 3)), ['Move', 0.1, true]);
});

test('[渲染-3] an attack starts its clip paced to land OnAttack on the hit frame, then idles; idle in the view does not cut it', () => {
  const f = /** @type {import('../src/figure.js').Figure} */ (newFigure({ front: tinyModel() }, unit(1, ANIM.IDLE), 0));
  follow(f, unit(1, ANIM.ATTACK), 10);
  attacked(f, 15, 10);
  assert.equal(f.rate, 0.5);
  assert.deepEqual(at(clipAt(f, 25)), ['Attack', 0.25, false]);
  follow(f, unit(1, ANIM.IDLE), 26);
  assert.equal(f.role, 'attack');
  assert.deepEqual(at(clipAt(f, 34)), ['Attack', 0.4, false]);
  assert.deepEqual(at(clipAt(f, 46)), ['Idle', 0.1, true]);
  attacked(f, 0, 50);
  assert.equal(f.rate, 1);
  follow(f, unit(1, ANIM.MOVE), 52);
  assert.deepEqual(at(clipAt(f, 55)), ['Move', 0.1, true]);
});

test('[渲染-3] a cast plays the model\'s Skill_<n> (any case) once at its own pace, then idles; nothing without that clip', () => {
  const m = tinyModel(), clips = /** @type {any} */ (m.skeleton).animations;
  clips.push({ ...clips.find((/** @type {any} */ a) => a.name === 'Start'), name: 'skill_1' });
  const f = /** @type {import('../src/figure.js').Figure} */ (newFigure({ front: m }, unit(2, ANIM.IDLE), 0));
  follow(f, unit(2, ANIM.IDLE), 0);
  cast(f, 1, 10);
  assert.deepEqual(at(clipAt(f, 13)), ['skill_1', 0.1, false]);
  follow(f, unit(2, ANIM.IDLE), 14);
  assert.deepEqual([f.role, at(clipAt(f, 25))], ['attack', ['Idle', 0.1, true]], 'idle in the view does not cut it; idle after it');
  cast(f, 2, 30);
  assert.equal(f.since, 10, 'no Skill_2: nothing');
});

test('[渲染-3] a figure that died plays its die clip once and is over after it', () => {
  const f = /** @type {import('../src/figure.js').Figure} */ (newFigure({ front: tinyModel() }, unit(1, ANIM.MOVE), 0));
  assert.equal(dies(f, 60), true);
  assert.deepEqual(at(clipAt(f, 75)), ['Die', 0.5, false]);
  assert.equal(deathOver(f, 77), false);
  assert.equal(deathOver(f, 78), true);
});

test('[渲染-3] a model with forms: the first form clips until its first attack, which plays that form attack; the next form after', () => {
  const f = /** @type {import('../src/figure.js').Figure} */ (newFigure({ front: formsModel() }, unit(1, ANIM.MOVE), 0));
  follow(f, unit(1, ANIM.MOVE), 0);
  assert.deepEqual(at(clipAt(f, 3)), ['A_Move', 0.1, true]);
  follow(f, unit(1, ANIM.ATTACK), 10);
  attacked(f, 0, 10);
  assert.deepEqual(at(clipAt(f, 13)), ['A_Attack', 0.1, false]);
  assert.deepEqual(at(clipAt(f, 28)), ['B_Idle', 0.1, true], 'the attack over: the next form');
  attacked(f, 0, 30);
  assert.deepEqual(at(clipAt(f, 33)), ['B_Attack', 0.1, false]);
  follow(f, unit(1, ANIM.MOVE), 50);
  assert.deepEqual(at(clipAt(f, 53)), ['B_Move', 0.1, true]);
  assert.equal(dies(f, 60), true);
  assert.equal(clipAt(f, 63).name, 'B_Die');
});

test('[渲染-24] a 傀儡师\'s clips by form: the switch in once, the 替身\'s own clips, the switch back once, its own again', () => {
  const u = (/** @type {number} */ form, anim = ANIM.IDLE) => ({ ...unit(0, anim), form });
  const f = /** @type {import('../src/figure.js').Figure} */ (newFigure({ front: dollModel() }, u(0), 0));
  follow(f, u(0), 0);
  assert.deepEqual(at(clipAt(f, 30)), ['Idle', 0.6, true]);
  follow(f, u(1), 30);
  assert.deepEqual([at(clipAt(f, 33)), at(clipAt(f, 45))], [['Doll_SwitchIn', 0.1, false], ['Idle', 0.1, true]]);
  follow(f, u(2), 45);
  assert.deepEqual(at(clipAt(f, 48)), ['Doll_Idle', 0.2, true], 'the 替身\'s idle on from the end of the switch');
  attacked(f, 0, 48);
  assert.deepEqual(at(clipAt(f, 51)), ['Doll_Attack', 0.1, false]);
  follow(f, u(3), 70);
  assert.deepEqual(at(clipAt(f, 73)), ['Doll_SwitchOut', 0.1, false]);
  follow(f, u(0), 90);
  assert.deepEqual(at(clipAt(f, 93)), ['Idle', 0.366666667, true], 'its own idle on from the end of the switch back');
});

test('[渲染-24] the 替身 clips of the three ways models name them; none for a model without', () => {
  assert.deepEqual(dollRoles(['Attack_A', 'Attack_B', 'Die_A', 'Die_B', 'Idle_A', 'Idle_B', 'Start_A', 'Start_B']), {
    own: { idle: 'Idle_A', move: 'Idle_A', attack: 'Attack_A', die: 'Die_A', start: 'Start_A' },
    doll: { idle: 'Idle_B', move: 'Idle_B', attack: 'Attack_B', die: 'Die_B', start: null, in: 'Start_B', out: 'Start_A' },
  });
  assert.deepEqual(dollRoles(['Attack', 'Idle', 'Start', 'Doll_Attack_Loop', 'Doll_Idle', 'Doll_Die', 'Doll_Skill_2_SwitchIn', 'Doll_Skill_1_SwitchIn', 'Doll_SwitchOut'])?.doll,
    { idle: 'Doll_Idle', move: 'Doll_Idle', attack: 'Doll_Attack_Loop', die: 'Doll_Die', start: null, in: 'Doll_Skill_1_SwitchIn', out: 'Doll_SwitchOut' });
  assert.deepEqual(dollRoles(['Attack_A', 'Attack_B', 'Idle', 'Start', 'Doll_Skill_1_Idle', 'Doll_Skill_1_Attack', 'Doll_Skill_1_SwitchIn', 'Doll_Skill_2_Loop'])?.doll,
    { idle: 'Doll_Skill_1_Idle', move: 'Doll_Skill_1_Idle', attack: 'Doll_Skill_1_Attack', die: null, start: null, in: 'Doll_Skill_1_SwitchIn', out: 'Start' }, 'skill sets: the first skill\'s');
  assert.equal(dollRoles(['Idle', 'Attack', 'Start']), null);
  const enemy = /** @type {import('../src/figure.js').Figure} */ (newFigure({ front: dollModel() }, unit(1, ANIM.IDLE), 0));
  assert.equal(enemy.dolls.front, null, 'enemies have none');
});

test('[渲染-4] an operator that does not turn (野鬃 2 技能) returns to its deploy facing, side and mirror', () => {
  const f = /** @type {import('../src/figure.js').Figure} */ (newFigure({ front: tinyModel(), back: tinyModel() }, { ...unit(0, ANIM.IDLE), dir: DIR.UP }, 0));
  f.role = 'attack'; f.aim = { x: 3, y: 1, id: 9 }; f.side = 'front'; f.flip = true;
  follow(f, { ...unit(0, ANIM.ATTACK), dir: DIR.UP, skill: SKILL_STATE.RUNNING }, 30, 'char_496_wildmn');
  assert.deepEqual([f.side, f.flip], ['back', false], 'both the side and the mirror return to the deploy direction');
});
