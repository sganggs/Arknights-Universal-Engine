// 近地悬浮 and 升空 (docs/spec/foes.md 敌能-48, paths.md 路线-2). Frame counts come from 时间-2, not from literals.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, buffs, displacement, routes } from '@aue/sim';
import { secondsToFrames } from '@aue/math';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { uncoveredAbilities } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

/** @param {Record<string, number>} bb @param {number} [cooldown] @param {number} [initCooldown] */
const skill = (bb, cooldown = 25, initCooldown = 1) => ({ key: 'TakeOff', cooldown, initCooldown, sp: 0, bb });

/** @param {Record<string, unknown>} [more] */
function balloon(more = {}) {
  return {
    name: 'foe', maxHp: 8000, atk: 400, def: 0, res: 0, moveSpeed: 0.8, baseAttackTime: 2, massLevel: 3,
    immune: ['silence'], skills: [skill({ duration: 7, 'balloon_s[fly].move_speed': 0.5 })], ...more,
  };
}

/** 掠海漂移体's shape for the hover tests: ranged, so a radius attack is visible, and noFly is chained after Float. */
function drifter() {
  return {
    name: 'foe', maxHp: 20000, atk: 500, def: 0, res: 0, moveSpeed: 0, baseAttackTime: 0,
    applyWay: 'ALL', rangeRadius: 5, talents: { Float: {}, noFly: {} },
  };
}

/**
 * One enemy, operators optional. The start tile is made deployable; commands are [seat, command].
 * @param {Record<string, unknown>} enemy
 * @param {{ mult?: number, deploy?: [string, number, number][], tweak?: (c: any) => void }} [o]
 */
function world(enemy, o = {}) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { foe: enemy };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, 'foe')])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 6, moveMultiplier: o.mult ?? 0 };
  c.level.tiles[2][0] = { ...c.level.tiles[2][0], buildable: 'ALL' };
  const op = { cost: 0, maxHp: 1e7, atk: 0, def: 0, res: 0, blockCnt: 3 };
  Object.assign(c.operators.guard, op);
  Object.assign(c.operators.sniper, op, { tauntLevel: 1 });
  o.tweak?.(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  const seats = o.deploy ?? [['guard', 2, 0]];
  step(w, c, seats.map(([name, row, col]) => [0, { type: 'deploy', op: name, row, col, dir: 0 }]));
  const e = w.units.find((u) => u.key === 'foe');
  if (!e) throw new Error('foe did not spawn');
  return {
    c, w, e,
    guard: w.units.find((u) => u.key === 'guard'),
    sniper: w.units.find((u) => u.key === 'sniper'),
  };
}

/** @param {any[]} ev @param {number} id */
const hitsOf = (ev, id) => ev.filter((x) => x.type === 'hit' && x.id === id);

/** @param {number} got @param {number} want */
function near(got, want) {
  assert.ok(Math.abs(got - want) < 1e-9, `${got} vs ${want}`);
}

/** @param {Unit} op */
const sky = (op) => buffs.addBuff(op, buffs.makeBuff({ key: 'sky', flags: { blockFly: true } }));

/** Steps while `held` stays true. The step that clears it is separate: that step can already attack. @param {World} w @param {any} c @param {() => boolean} held */
function calm(w, c, held) {
  /** @type {any[]} */
  const earlier = [];
  for (let i = 0; i < 90; i++) {
    if (!held()) return { earlier, ev: /** @type {any[]} */ ([]) };
    const ev = step(w, c);
    if (!held()) return { earlier, ev };
    earlier.push(...ev);
  }
  throw new Error('status never ended');
}

/** @param {string} kind */
function ended(kind) {
  const box = world(drifter(), { deploy: [] });
  status.applyStatus(box.e, /** @type {any} */ (kind), { seconds: 1 });
  step(box.w, box.c);
  return box;
}

test('[敌能-48] 近地悬浮 is blocked only with blockFly, keeps 失衡免疫, and stays a ground move', () => {
  const box = world(drifter());
  const e = box.e, guard = box.guard;
  if (!guard) throw new Error('no guard');
  assert.equal(e.base.motion, 'WALK');
  assert.equal(attrs.statsOf(e).flying, true);
  assert.equal(attrs.statsOf(e).flags.noDisplace, true);
  assert.equal(displacement.displaceable(e), false);
  assert.equal(e.blockedBy, -1, 'a ground operator does not block it');
  sky(guard);
  step(box.w, box.c);
  assert.equal(e.blockedBy, guard.id);
  status.applyStatus(e, 'groundbind', { seconds: 2 });
  step(box.w, box.c);
  assert.equal(e.ab['Float.up'], 1, '缚地 does not end it');
  assert.equal(attrs.statsOf(e).flying, false, '缚地 puts it on the ground while the mark remains');
  assert.equal(displacement.displaceable(e), false, '失衡免疫 still holds');
  assert.ok(e.buffs.some((b) => b.key === 'hover'));
});

test('[敌能-48] 晕眩, 沉睡, 无法行动 and 冻结 end 近地悬浮 for good and add 0.5 s of stun', () => {
  const stunFrames = secondsToFrames(0.5);
  for (const kind of ['stun', 'sleep', 'freeze', 'enemyFreeze']) {
    const { e } = ended(kind);
    assert.equal(e.ab['Float.up'], 0, kind);
    assert.equal(e.buffs.some((b) => b.key === 'hover'), false, kind);
    assert.ok(e.buffs.some((b) => b.key === 'stun' && b.left === stunFrames), kind);
  }
  const box = ended('freeze');
  for (let i = 0; i < 90; i++) step(box.w, box.c);
  assert.equal(box.e.ab['Float.up'], 0);
  assert.equal(box.e.buffs.some((b) => b.key === 'hover'), false);
});

/** One step under a status that must not drop the hover. @param {string} kind @param {boolean} raw a buff, because 浮空 is refused on a flying unit */
function stays(kind, raw) {
  const box = world(drifter(), { deploy: [] });
  if (raw) buffs.addBuff(box.e, buffs.makeBuff({ key: kind, flags: { [kind]: true }, left: secondsToFrames(1) }));
  else status.applyStatus(box.e, /** @type {any} */ (kind), { seconds: 1 });
  step(box.w, box.c);
  assert.equal(box.e.ab['Float.up'], 1, kind);
  assert.ok(box.e.buffs.some((b) => b.key === 'hover'), kind);
  assert.equal(box.e.buffs.some((b) => b.key === 'stun' && b.left === secondsToFrames(0.5)), false, kind);
}

test('[敌能-48] 浮空, 麻痹震颤, 束缚 and 沉默 do not end 近地悬浮', () => {
  stays('palsyShake', false);
  stays('root', false);
  stays('silence', false);
  stays('levitate', true);
});

test('[敌能-48] hovering still attacks, noFly still drops flyers, and afterwards only the blocker is hit', () => {
  const box = world(drifter(), {
    deploy: [['guard', 2, 0], ['sniper', 0, 2], ['kite', 0, 3]],
    tweak: (c) => { c.operators.kite = { ...c.operators.sniper, name: 'kite', tauntLevel: 2 }; },
  });
  const kite = box.w.units.find((u) => u.key === 'kite'), guard = box.guard, sniper = box.sniper;
  if (!kite || !guard || !sniper) throw new Error('operators missing');
  buffs.addBuff(kite, buffs.makeBuff({ key: 'hover', flags: { hover: true } }));
  const up = step(box.w, box.c);
  assert.equal(box.e.blockedBy, -1);
  assert.deepEqual(hitsOf(up, box.e.id).map((x) => x.target), [sniper.id], 'the flying taunt is skipped');
  status.applyStatus(box.e, 'freeze', { seconds: 1 });
  step(box.w, box.c);
  const held = () => !!(attrs.statsOf(box.e).flags.stun || attrs.statsOf(box.e).flags.freeze);
  const done = calm(box.w, box.c, held);
  assert.equal(hitsOf(done.earlier, box.e.id).length, 0);
  assert.deepEqual(hitsOf(done.ev, box.e.id).map((x) => x.target), [guard.id]);
});

test('[敌能-48] a highland blocker does not hold it once 近地悬浮 has ended, so it has no target', () => {
  const box = world(drifter(), {
    deploy: [['sniper', 2, 2]],
    tweak: (c) => { c.level.routes[0].start = { row: 2, col: 2 }; },
  });
  const sniper = box.sniper;
  if (!sniper) throw new Error('no sniper');
  sky(sniper);
  step(box.w, box.c);
  assert.equal(box.e.blockedBy, sniper.id);
  status.applyStatus(box.e, 'freeze', { seconds: 1 });
  step(box.w, box.c);
  assert.equal(box.e.blockedBy, -1);
  assert.equal(box.e.base.motion, 'WALK');
  const held = () => !!(attrs.statsOf(box.e).flags.stun || attrs.statsOf(box.e).flags.freeze);
  const done = calm(box.w, box.c, held);
  assert.equal(hitsOf(done.earlier, box.e.id).length, 0);
  assert.equal(hitsOf(done.ev, box.e.id).length, 0);
});

/** @param {Record<string, unknown>} bb */
const gapsOf = (bb) => uncoveredAbilities([/** @type {any} */ (balloon({ skills: [skill(/** @type {any} */ (bb))] }))]);

test('[敌能-48] TakeOff outside the 喷气人 blackboard stays uncovered', () => {
  assert.deepEqual(gapsOf({}), ['TakeOff']);
  assert.deepEqual(gapsOf({ move_speed: 0.1 }), ['TakeOff']);
  assert.deepEqual(gapsOf({ duration: 7, 'balloon_s[fly].move_speed': 0.5, extra: 1 }), ['TakeOff']);
  assert.deepEqual(gapsOf({ duration: Number.NaN, 'balloon_s[fly].move_speed': 0.5 }), ['TakeOff']);
  assert.deepEqual(gapsOf({ duration: 7, 'balloon_s[fly].move_speed': 0.5 }), []);
});

/** Fifty frames is past the moment a real 喷气人 would have flown. @param {Record<string, unknown>} bb */
function idle(bb) {
  const box = world(balloon({ immune: [], moveSpeed: 0, skills: [skill(/** @type {any} */ (bb))] }));
  for (let i = 0; i < 50; i++) step(box.w, box.c);
  return box.e;
}

test('[敌能-48] a TakeOff that is not the 喷气人 shape does nothing at runtime', () => {
  const shapes = [{}, { move_speed: 0.1 }, { duration: 7, 'balloon_s[fly].move_speed': 0.5, extra: 1 }];
  for (const bb of shapes) {
    const e = idle(bb);
    assert.equal(e.base.motion, 'WALK');
    assert.equal(e.ab['TakeOff.phase'] ?? 0, 0);
  }
});

test('[敌能-48] the detector waits out the first cooldown, checks every 0.33 s, and stays if that check is open', () => {
  const box = world(balloon({ moveSpeed: 0 }));
  const guard = box.guard;
  if (!guard) throw new Error('no guard');
  while ((box.e.ab['TakeOff.phase'] ?? 0) < 1) step(box.w, box.c);
  const granted = box.w.frame;
  assert.equal(granted, secondsToFrames(1) + 1);
  // A stunned guard lets go. 0.5 s covers the open check and ends before the next one, so the same guard blocks again.
  status.applyStatus(guard, 'stun', { seconds: 0.5 });
  step(box.w, box.c);
  assert.equal(box.e.blockedBy, -1);
  while (box.w.frame < granted + secondsToFrames(0.33)) step(box.w, box.c);
  // `assert.equal` narrows the property; a fresh read stays a string so the later FLY check typechecks.
  const motion = () => /** @type {string} */ (box.e.base.motion);
  assert.equal(motion(), 'WALK');
  assert.equal(box.e.ab['TakeOff.phase'], 1);
  const looked = box.w.frame;
  while (motion() !== 'FLY' && box.w.frame <= looked + secondsToFrames(0.33)) step(box.w, box.c);
  assert.equal(motion(), 'FLY');
  assert.equal(box.w.frame, looked + secondsToFrames(0.33));
});

test('[敌能-48] silence and stun only stop the detector being given', () => {
  const silenced = world(balloon({ immune: [], moveSpeed: 0 }));
  status.applyStatus(silenced.e, 'silence', { seconds: 3 });
  while (silenced.w.frame < secondsToFrames(1) + 1) step(silenced.w, silenced.c);
  assert.equal(silenced.e.ab['TakeOff.phase'] ?? 0, 0);
  buffs.removeBuff(silenced.e, 'silence');
  step(silenced.w, silenced.c);
  assert.equal(silenced.e.ab['TakeOff.phase'], 1);

  const stunned = world(balloon({ immune: [], moveSpeed: 0 }));
  status.applyStatus(stunned.e, 'stun', { seconds: 2 });
  while (stunned.w.frame < secondsToFrames(1) + 1) step(stunned.w, stunned.c);
  assert.equal(stunned.e.ab['TakeOff.phase'] ?? 0, 0);
  buffs.removeBuff(stunned.e, 'stun');
  step(stunned.w, stunned.c);
  assert.equal(stunned.e.ab['TakeOff.phase'], 1);

  const held = world(balloon({ immune: [], moveSpeed: 0 }));
  while ((held.e.ab['TakeOff.phase'] ?? 0) < 1) step(held.w, held.c);
  const at = held.w.frame;
  status.applyStatus(held.e, 'stun', { seconds: 2 });
  while (held.e.base.motion !== 'FLY') step(held.w, held.c);
  assert.equal(held.w.frame - at, secondsToFrames(0.33));
  const took = held.w.frame;
  status.applyStatus(held.e, 'silence', { seconds: 20 });
  while (held.e.base.motion === 'FLY') step(held.w, held.c);
  assert.equal(held.w.frame - took, secondsToFrames(7));
});

/**
 * A 7 s flight, measured from the frames the steps report. The opening cut is still on after 1.5 s minus one frame.
 * @param {Record<string, unknown>} enemy
 * @param {{ deploy?: [string, number, number][] }} [o]
 */
function flightOf(enemy, o = {}) {
  const box = world(enemy, o);
  while ((box.e.ab['TakeOff.phase'] ?? 0) < 1) step(box.w, box.c);
  const granted = box.w.frame;
  while (box.e.base.motion !== 'FLY') step(box.w, box.c);
  const t0 = box.w.frame;
  const braked = attrs.statsOf(box.e).moveSpeed;
  const flag = attrs.statsOf(box.e).flags;
  const blocked = box.e.blockedBy;
  /** @type {any[]} */
  const during = [];
  for (let i = 0; i < secondsToFrames(1.5) - 1; i++) during.push(...step(box.w, box.c));
  const brakeHeld = box.e.buffs.some((b) => b.key === 'takeOff:brake');
  during.push(...step(box.w, box.c));
  const opened = attrs.statsOf(box.e).moveSpeed;
  const brakeGone = !box.e.buffs.some((b) => b.key === 'takeOff:brake');
  /** @type {any[]} */
  let landEv = [];
  while (box.e.base.motion === 'FLY') {
    const ev = step(box.w, box.c);
    if (box.e.base.motion === 'FLY') during.push(...ev);
    else landEv = ev;
  }
  return { box, granted, t0, landed: box.w.frame, braked, opened, flag, blocked, brakeHeld, brakeGone, during, landEv };
}

test('[敌能-48] flight lasts 7 s at +50% with 1.5 s of final −90%, then lands 1.333 s, and the cooldown starts as it lands', () => {
  const f = flightOf(balloon({ applyWay: 'ALL', rangeRadius: 5, baseAttackTime: 0 }), { deploy: [['guard', 2, 0], ['sniper', 0, 2]] });
  const { box, e } = { box: f.box, e: f.box.e };
  assert.equal(f.t0 - f.granted, secondsToFrames(0.33));
  assert.equal(f.landed - f.t0, secondsToFrames(7));
  near(f.braked, 0.8 * 1.5 * 0.1);
  assert.equal(f.brakeHeld, true);
  near(f.opened, 0.8 * 1.5);
  assert.equal(f.brakeGone, true);
  assert.equal(f.flag.noAttack, true);
  assert.equal(f.flag.unblockable, true);
  assert.equal(f.flag.noDisplace, true);
  assert.equal(f.blocked, -1);
  assert.equal(hitsOf(f.during, e.id).length, 0);
  assert.ok(hitsOf(f.landEv, e.id).length > 0);
  assert.equal(e.base.motion, 'WALK');
  assert.equal(e.ab['TakeOff.cd'], secondsToFrames(25) - 1);
  near(attrs.statsOf(e).moveSpeed, 0.1);
  assert.ok(e.buffs.some((b) => b.key === 'takeOff:land'));
  for (let i = 0; i < secondsToFrames(1.333) - 1; i++) step(box.w, box.c);
  assert.equal(attrs.statsOf(e).flags.unblockable, true);
  step(box.w, box.c);
  assert.equal(attrs.statsOf(e).flags.unblockable, undefined);
  assert.equal(e.ab['TakeOff.phase'] ?? 0, 0);
  while ((e.ab['TakeOff.phase'] ?? 0) !== 1 && box.w.frame <= f.landed + secondsToFrames(25)) step(box.w, box.c);
  assert.equal(box.w.frame, f.landed + secondsToFrames(25));
  assert.equal(e.ab['TakeOff.phase'], 1);
});

test('[敌能-48] a flight shorter than 1.5 s drops the opening cut when it lands', () => {
  const bb = { duration: 1, 'balloon_s[fly].move_speed': 0.5 };
  const box = world(balloon({ moveSpeed: 2, skills: [skill(bb)] }));
  while (box.e.base.motion !== 'FLY') step(box.w, box.c);
  near(attrs.statsOf(box.e).moveSpeed, 2 * 1.5 * 0.1);
  while (box.e.base.motion === 'FLY') step(box.w, box.c);
  assert.equal(box.e.buffs.some((b) => b.key === 'takeOff:brake'), false);
  near(attrs.statsOf(box.e).moveSpeed, 0.2);
});

test('[敌能-48] [路线-2] taking off and landing each plan the current leg again', () => {
  const rows = ['........', '..##....', '..##....', '........'];
  const road = { key: 'tile_road', height: 'LOWLAND', buildable: 'MELEE', passable: 'ALL', side: 'ALL' };
  const wall = { key: 'tile_wall', height: 'HIGHLAND', buildable: 'RANGED', passable: 'FLY_ONLY', side: 'ALL' };
  const box = world(balloon({ atk: 0 }), {
    mult: 0.001, deploy: [],
    tweak: (c) => {
      c.level.width = 8;
      c.level.height = 4;
      c.level.tiles = rows.map((s) => [...s].map((ch) => (ch === '#' ? wall : road)));
      c.level.routes = [{ start: { row: 2, col: 0 }, end: { row: 2, col: 6 }, motion: 'WALK', checkpoints: [] }];
    },
  });
  const { c, w, e } = box;
  const route = c.level.routes[0];
  const leg = routes.legsOf(route)[0];
  step(w, c);
  const walked = e.path.slice();
  assert.notDeepEqual(walked, [6, 2]);
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 2, col: 0, dir: 0 }]]);
  let before = walked;
  while (e.base.motion !== 'FLY') {
    before = e.path.slice();
    step(w, c);
  }
  assert.deepEqual(before, walked);
  assert.equal(e.base.motion, 'FLY');
  assert.deepEqual(e.path, [6, 2]);
  assert.deepEqual(e.path, routes.planLeg(c, route, e, /** @type {any} */ (leg)));
  while (e.base.motion === 'FLY') step(w, c);
  assert.equal(e.base.motion, 'WALK');
  assert.notDeepEqual(e.path, [6, 2]);
  assert.deepEqual(e.path, routes.planLeg(c, route, e, /** @type {any} */ (leg)));
});
