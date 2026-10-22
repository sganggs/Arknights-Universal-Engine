// 迷路的巨像's 眩晕击 (docs/spec/foes.md 敌能-83): a stone every 13 s at the nearest unstunned unit of ours within 2.5.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secondsToFrames } from '@aue/math';
import { createWorld, step, status, buffs, attrs, devices } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { levelAt, levelContent } from '../src/index.js';
import { uncoveredAbilities, withFoeExtras } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

const KEY = 'enemy_2003_rockman';
const real = levelContent('act1multi_fortress_rm01', 'NORMAL');
const ATK = 1500;
const STONE = ATK * 0.7;

/**
 * The tiny map: foes spawn in frame 0 and stand rooted at (row, col); operators deploy in frame 1.
 * @param {[string, number, number][]} foes @param {[string, number, number][]} ops
 * @param {{ tweak?: (c: any) => void, beforeDeploy?: (es: Unit[]) => void }} [o]
 */
function arena(foes, ops, o = {}) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { ...real.enemies };
  c.behaviors = real.behaviors;
  c.level.waves = [oneWave(foes.map(([k]) => spawnAt(0, k)))];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 9 };
  for (const op of Object.values(c.operators)) Object.assign(op, { cost: 0, maxHp: 1e6 });
  Object.assign(c.operators.guard, { def: 0 });
  o.tweak?.(c);
  const w = /** @type {World} */ (createWorld(c, { seed: 1, players: 1 }));
  return { c, w, ...placed(w, c, foes, ops, o.beforeDeploy) };
}

/**
 * @param {World} w @param {any} c @param {[string, number, number][]} foes @param {[string, number, number][]} ops
 * @param {((es: Unit[]) => void) | undefined} beforeDeploy
 */
function placed(w, c, foes, ops, beforeDeploy) {
  step(w, c);
  const es = w.units.filter((u) => u.owner < 0);
  es.forEach((e, i) => { e.x = foes[i][2]; e.y = foes[i][1]; e.path = []; status.applyStatus(e, 'root', {}); });
  beforeDeploy?.(es);
  const opened = [...step(w, c, ops.map(([op, row, col]) => [0, { type: 'deploy', op, row, col, dir: 0 }]))];
  return { es, ops: w.units.filter((u) => u.owner >= 0), opened };
}

/** A second melee operator, copied after the arena has zeroed the guard's cost and defence. @param {any} cc */
function secondMelee(cc) {
  cc.operators.guard2 = { ...cc.operators.guard, name: 'g2' };
}

/** @param {Unit} u @param {number} x @param {number} y */
const put = (u, x, y) => { u.x = x; u.y = y; };

/** @param {number} a @param {number} b */
const near = (a, b) => Math.abs(a - b) < 1e-6;

/**
 * shot, hit and attack events from `prior` (the deploy step, frame w.frame − 1) through `until`.
 * @param {World} w @param {any} c @param {number} until @param {any[]} [prior]
 */
function trace(w, c, until, prior = []) {
  /** @type {{ frame: number, type: string, id: number, target: number, damage: number }[]} */
  const out = [];
  /** @param {number} frame @param {any} e */
  const push = (frame, e) => {
    if (e.type !== 'shot' && e.type !== 'hit' && e.type !== 'attack') return;
    out.push({ frame, type: e.type, id: e.id ?? -1, target: e.target ?? -1, damage: e.damage ?? 0 });
  };
  for (const e of prior) push(w.frame - 1, e);
  while (w.frame <= until) {
    const frame = w.frame;
    for (const e of step(w, c)) push(frame, e);
  }
  return out;
}

/** @param {ReturnType<typeof trace>} ev @param {number} id */
const shots = (ev, id) => ev.filter((e) => e.type === 'shot' && e.id === id);

/** The frame of the first hit on `target`, read before later frames tick the buffs. @param {World} w @param {any} c @param {number} target @param {number} until */
function hitFrame(w, c, target, until) {
  while (w.frame <= until) {
    const frame = w.frame;
    for (const e of step(w, c)) if (e.type === 'hit' && e.target === target) return frame;
  }
  return -1;
}

/** The first stone, or null when none was thrown by `until`. @param {World} w @param {any} c @param {number} id @param {number} [until] */
function thrown(w, c, id, until = 420) {
  return shots(trace(w, c, until), id)[0] ?? null;
}

/** A body whose only skill is StunAttack, for the coverage checks. @param {Record<string, number>} bb @param {number} [cd] @param {number} [sp] */
function shape(bb, cd = 13, sp = 0) {
  return {
    name: 't', maxHp: 100, atk: 100, def: 0, res: 0, moveSpeed: 1, baseAttackTime: 1,
    skills: [{ key: 'StunAttack', cooldown: cd, initCooldown: cd, sp, bb }],
  };
}

test('[敌能-83] no stone when nobody of ours is within 2.5, or the only one is stunned; 2.5 is inside, 2.6 and 3 are not', () => {
  const far = arena([[KEY, 1, 1]], [['guard', 1, 4]]);
  assert.equal(thrown(far.w, far.c, far.es[0].id), null, 'distance 3');
  const edge = arena([[KEY, 1, 1]], [['guard', 1, 4]]);
  put(edge.ops[0], 3.5, 1);
  const atEdge = thrown(edge.w, edge.c, edge.es[0].id);
  assert.equal(atEdge?.frame, secondsToFrames(13));
  assert.equal(atEdge?.target, edge.ops[0].id);
  const out = arena([[KEY, 1, 1]], [['guard', 1, 4]]);
  put(out.ops[0], 3.6, 1);
  assert.equal(thrown(out.w, out.c, out.es[0].id), null, 'distance 2.6');
  const stunned = arena([[KEY, 1, 1]], [['guard', 1, 2]]);
  status.applyStatus(stunned.ops[0], 'stun', {});
  assert.equal(thrown(stunned.w, stunned.c, stunned.es[0].id), null, 'only a stunned unit');
  assert.equal(stunned.es[0].ab['StunAttack.cd'], 0, 'no target leaves the cooldown ready');
});

test('[敌能-83] the stone picks the nearest unstunned unit, including a flyer, and skips a closer stunned, airborne or hidden one', () => {
  const nearFirst = arena([[KEY, 1, 1]], [['guard', 1, 2], ['guard2', 1, 3]], { tweak: secondMelee });
  put(nearFirst.ops[0], 2, 1);
  put(nearFirst.ops[1], 3, 1);
  assert.equal(thrown(nearFirst.w, nearFirst.c, nearFirst.es[0].id)?.target, nearFirst.ops[0].id);
  const skipStun = arena([[KEY, 1, 1]], [['guard', 1, 2], ['guard2', 1, 3]], { tweak: secondMelee });
  put(skipStun.ops[0], 2, 1);
  put(skipStun.ops[1], 3, 1);
  status.applyStatus(skipStun.ops[0], 'stun', {});
  assert.equal(thrown(skipStun.w, skipStun.c, skipStun.es[0].id)?.target, skipStun.ops[1].id);
  const fly = arena([[KEY, 1, 1]], [['guard', 1, 3], ['guard2', 1, 2]], { tweak: secondMelee });
  put(fly.ops[0], 3, 1);
  put(fly.ops[1], 2, 1);
  fly.ops[1].base.motion = 'FLY';
  assert.equal(attrs.statsOf(fly.ops[1]).flying, true);
  assert.equal(thrown(fly.w, fly.c, fly.es[0].id)?.target, fly.ops[1].id);
  const air = arena([[KEY, 1, 1]], [['guard', 1, 2], ['guard2', 1, 3]], { tweak: secondMelee });
  put(air.ops[0], 2, 1);
  put(air.ops[1], 3, 1);
  buffs.addBuff(air.ops[0], buffs.makeBuff({ key: 'up', flags: { liftoff: true } }));
  assert.equal(thrown(air.w, air.c, air.es[0].id)?.target, air.ops[1].id);
  const hid = arena([[KEY, 1, 1]], [['guard', 1, 2], ['guard2', 1, 3]], { tweak: secondMelee });
  put(hid.ops[0], 2, 1);
  put(hid.ops[1], 3, 1);
  buffs.addBuff(hid.ops[0], buffs.makeBuff({ key: 'hide', flags: { stealth: true } }));
  assert.equal(thrown(hid.w, hid.c, hid.es[0].id)?.target, hid.ops[1].id);
});

test('[敌能-83] an equal distance goes to the later deploy, and to the blocker when one of them is blocking', () => {
  const later = arena([[KEY, 1, 2]], [['guard', 1, 0], ['guard2', 1, 4]], { tweak: secondMelee });
  const byHate = thrown(later.w, later.c, later.es[0].id);
  assert.equal(byHate?.target, later.ops[1].id, 'the later deploy wins a hatred tie');
  const blocked = arena([[KEY, 1, 2]], [['guard', 1, 2], ['guard2', 1, 1]], { tweak: secondMelee });
  put(blocked.ops[0], 3, 1);
  assert.equal(blocked.es[0].blockedBy, blocked.ops[0].id, 'moving the blocker does not drop the block');
  assert.equal(thrown(blocked.w, blocked.c, blocked.es[0].id)?.target, blocked.ops[0].id);
});

test('[敌能-83] the hit is 70% ATK physical, then 25 s of resistible stun; a killing hit applies no stun', () => {
  const open = arena([[KEY, 1, 1]], [['guard', 1, 1]]);
  const ev = trace(open.w, open.c, secondsToFrames(13), open.opened);
  const shot = shots(ev, open.es[0].id)[0];
  const hit = ev.find((e) => e.type === 'hit' && e.target === open.ops[0].id && e.frame === shot.frame);
  assert.equal(shot.frame, secondsToFrames(13));
  assert.ok(hit && near(hit.damage, STONE));
  const stun = open.ops[0].buffs.filter((b) => b.key === 'stun');
  assert.equal(stun.length, 1);
  assert.equal(stun[0].left, secondsToFrames(25));
  assert.equal(stun[0].resist, true);
  const tough = arena([[KEY, 1, 1]], [['guard', 1, 1]], { tweak: (cc) => { cc.operators.guard.def = 600; } });
  const mid = trace(tough.w, tough.c, secondsToFrames(13)).find((e) => e.type === 'hit' && e.target === tough.ops[0].id && near(e.damage, STONE - 600));
  assert.ok(mid, 'defence 600 leaves 450');
  const wall = arena([[KEY, 1, 1]], [['guard', 1, 1]], { tweak: (cc) => { cc.operators.guard.def = 2000; } });
  const floor = trace(wall.w, wall.c, secondsToFrames(13)).find((e) => e.type === 'hit' && e.target === wall.ops[0].id && near(e.damage, STONE * 0.05));
  assert.ok(floor, 'a high defence still takes 5% of the stone');
  const frail = arena([[KEY, 1, 1]], [['guard', 1, 3]]);
  put(frail.ops[0], 3, 1);
  frail.ops[0].hp = 10;
  const landed = trace(frail.w, frail.c, secondsToFrames(13) + 8).filter((e) => e.type === 'hit' && e.target === frail.ops[0].id);
  assert.equal(landed.length, 1);
  assert.ok(near(landed[0].damage, STONE));
  assert.equal(frail.ops[0].hp, 0);
  assert.equal(frail.ops[0].buffs.some((b) => b.key === 'stun'), false);
});

test('[敌能-83] the cooldown is 13 s, the first stone at 13 s and the next at 26 s; with no target it stays ready and throws the frame one appears', () => {
  const held = arena([[KEY, 1, 1]], [['guard', 1, 1]], { tweak: (cc) => { cc.operators.guard.immune = ['stun']; } });
  const ev = trace(held.w, held.c, secondsToFrames(26), held.opened);
  assert.deepEqual(shots(ev, held.es[0].id).map((e) => e.frame), [secondsToFrames(13), secondsToFrames(26)]);
  const wait = arena([[KEY, 1, 1]], []);
  assert.equal(thrown(wait.w, wait.c, wait.es[0].id, secondsToFrames(13)), null);
  assert.equal(wait.es[0].ab['StunAttack.cd'], 0);
  const woke = [...step(wait.w, wait.c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]])];
  assert.equal(wait.w.frame, secondsToFrames(13) + 2);
  assert.equal(woke.some((e) => e.type === 'shot' && e.id === wait.es[0].id), true);
});

test('[敌能-83] silence and being unable to act hold the throw without restarting the cooldown; its own silence immunity does not', () => {
  const shut = arena([[KEY, 1, 1]], [['guard', 1, 1]], {
    tweak: (cc) => { cc.enemies[KEY] = { ...cc.enemies[KEY], immune: cc.enemies[KEY].immune.filter((/** @type {string} */ k) => k !== 'silence') }; },
    beforeDeploy: (es) => { status.applyStatus(es[0], 'silence', {}); },
  });
  assert.equal(attrs.statsOf(shut.es[0]).flags.silence, true);
  assert.equal(thrown(shut.w, shut.c, shut.es[0].id, secondsToFrames(13)), null);
  assert.equal(shut.es[0].ab['StunAttack.cd'], 0);
  buffs.removeBuff(shut.es[0], 'silence');
  const resumed = [...step(shut.w, shut.c)].some((e) => e.type === 'shot');
  assert.equal(resumed, true);
  const down = arena([[KEY, 1, 1]], [['guard', 1, 1]]);
  status.applyStatus(down.es[0], 'stun', {});
  assert.equal(thrown(down.w, down.c, down.es[0].id, secondsToFrames(13)), null);
  assert.equal(down.es[0].ab['StunAttack.cd'], 0);
  buffs.removeBuff(down.es[0], 'stun');
  assert.equal([...step(down.w, down.c)].some((e) => e.type === 'shot'), true);
  const immune = arena([[KEY, 1, 1]], [['guard', 1, 1]], { beforeDeploy: (es) => { status.applyStatus(es[0], 'silence', {}); } });
  // Immunity drops the flag (状态-7): it is absent, not a false entry, and the throw still checks it.
  assert.equal(!!attrs.statsOf(immune.es[0]).flags.silence, false);
  assert.equal(thrown(immune.w, immune.c, immune.es[0].id)?.frame, secondsToFrames(13));
});

test('[敌能-83] the throw does not take the attack interval, and 战栗 does not stop it', () => {
  const open = arena([[KEY, 1, 1]], [['guard', 1, 1]], { tweak: (cc) => { cc.operators.guard.immune = ['stun']; } });
  const every = attrs.intervalFrames(4.4, 100);
  const last = 1 + 3 * every;
  const ev = trace(open.w, open.c, last, open.opened);
  const attacks = ev.filter((e) => e.type === 'attack' && e.id === open.es[0].id).map((e) => e.frame);
  /** @type {number[]} */
  const want = [];
  for (let f = 1; f <= last; f += every) want.push(f);
  assert.deepEqual(attacks, want);
  assert.equal(shots(ev, open.es[0].id).some((e) => e.frame === secondsToFrames(13)), true);
  const held = arena([[KEY, 1, 1]], [['guard', 1, 1]], { beforeDeploy: (es) => { status.applyStatus(es[0], 'disarmedCombat', {}); } });
  const quiet = trace(held.w, held.c, secondsToFrames(13) + 5, held.opened);
  assert.equal(quiet.some((e) => e.type === 'attack' && e.id === held.es[0].id), false);
  assert.equal(shots(quiet, held.es[0].id)[0]?.frame, secondsToFrames(13));
});

/** A stone at distance 2, still in the air. @param {{ hp?: number }} [o] */
function lofted(o = {}) {
  const open = arena([[KEY, 1, 1]], [['guard', 1, 3]]);
  put(open.ops[0], 3, 1);
  if (o.hp !== undefined) open.ops[0].hp = o.hp;
  const ev = trace(open.w, open.c, secondsToFrames(13));
  const shot = shots(ev, open.es[0].id)[0];
  assert.equal(shot.frame, secondsToFrames(13));
  const flying = open.w.shots.find((s) => s.target === open.ops[0].id);
  assert.ok(flying);
  assert.equal(flying.speed, 10);
  assert.equal(flying.skill, true);
  assert.equal(flying.skillHit, 1);
  assert.ok(near(flying.amount, STONE));
  assert.deepEqual(flying.hitStatus, { key: 'stun', seconds: 25 });
  return { ...open, flying };
}

test('[敌能-83] the stone is a homing skill shot: it follows a move, drops if the target is gone, and keeps the attack from the throw', () => {
  const chase = lofted();
  put(chase.ops[0], 5, 1);
  const hit = trace(chase.w, chase.c, chase.w.frame + 30).find((e) => e.type === 'hit' && e.target === chase.ops[0].id);
  assert.ok(hit && near(hit.damage, STONE) && hit.id === chase.es[0].id);
  const gone = lofted();
  gone.ops[0].hp = 0;
  const after = trace(gone.w, gone.c, gone.w.frame + 3);
  assert.equal(after.some((e) => e.type === 'hit' && e.target === gone.ops[0].id), false);
  assert.equal(gone.w.shots.some((s) => s.skillHit === 1), false);
  const grown = lofted();
  buffs.addBuff(grown.es[0], buffs.makeBuff({ key: 'up', mods: { atkPct: 1 } }));
  assert.ok(attrs.statsOf(grown.es[0]).atk > ATK);
  assert.ok(near(grown.flying.amount, STONE));
  const still = trace(grown.w, grown.c, grown.w.frame + 12).find((e) => e.type === 'hit' && e.target === grown.ops[0].id);
  assert.ok(still && near(still.damage, STONE));
  const dead = lofted();
  dead.es[0].hp = 0;
  const orphan = trace(dead.w, dead.c, dead.w.frame + 12).find((e) => e.type === 'hit' && e.target === dead.ops[0].id);
  assert.ok(orphan && orphan.id === -1 && near(orphan.damage, STONE));
  const lifted = lofted();
  buffs.addBuff(lifted.ops[0], buffs.makeBuff({ key: 'up', flags: { liftoff: true } }));
  const missed = trace(lifted.w, lifted.c, lifted.w.frame + 12);
  assert.equal(missed.some((e) => e.type === 'hit' && e.target === lifted.ops[0].id), false);
  assert.equal(lifted.ops[0].buffs.some((b) => b.key === 'stun'), false);
});

test('[敌能-83] a stun already on the target stays queued ahead of the stone\'s 25 s', () => {
  const open = lofted();
  status.applyStatus(open.ops[0], 'stun', { seconds: 3 });
  const shotFrame = secondsToFrames(13);
  const frame = hitFrame(open.w, open.c, open.ops[0].id, shotFrame + 12);
  assert.ok(frame > shotFrame);
  const stun = open.ops[0].buffs.filter((b) => b.key === 'stun');
  assert.equal(stun.length, 2);
  assert.equal(stun[0].left, secondsToFrames(3) - (frame - shotFrame));
  assert.equal(stun[1].left, secondsToFrames(25));
  assert.equal(stun[0].resist && stun[1].resist, true);
  assert.equal(attrs.statsOf(open.ops[0]).flags.stun, true);
});

/** @param {boolean} neutral */
function bystander(neutral) {
  return {
    name: 'n', maxHp: 5000, atk: 0, def: 0, res: 0, moveSpeed: 0.5, baseAttackTime: 4, neutral,
    rangeRadius: 0, applyWay: 'MELEE', motion: 'WALK', massLevel: 1,
  };
}

/** @param {number} blockCnt @param {string} [side] */
function deviceRec(blockCnt, side) {
  return { name: 'd', maxHp: 500, atk: 0, def: 0, res: 0, blockCnt, baseAttackTime: 1, ...(side ? { side } : {}) };
}

test('[敌能-83] a closer neutral unit or our device is a target; a hostile enemy or a hostile device is not', () => {
  const friend = arena([[KEY, 1, 1], ['bystander', 1, 2]], [['guard', 1, 4]], {
    tweak: (cc) => { cc.enemies.bystander = bystander(true); },
  });
  assert.equal(thrown(friend.w, friend.c, friend.es[0].id)?.target, friend.es[1].id);
  const foe = arena([[KEY, 1, 1], ['bystander', 1, 2]], [['guard', 1, 4]], {
    tweak: (cc) => { cc.enemies.bystander = bystander(false); },
  });
  put(foe.ops[0], 3, 1);
  assert.equal(thrown(foe.w, foe.c, foe.es[0].id)?.target, foe.ops[0].id);
  const box = arena([[KEY, 1, 1]], [['guard', 1, 4]], { tweak: (cc) => { cc.devices = { box: deviceRec(0) }; } });
  assert.equal(devices.spawnDevice(box.w, box.c, 'box', 1, 2), true);
  const ours = box.w.units.find((u) => u.key === 'box');
  assert.equal(thrown(box.w, box.c, box.es[0].id)?.target, ours?.id);
  const bad = arena([[KEY, 1, 1]], [['guard', 1, 3]], { tweak: (cc) => { cc.devices = { foe: deviceRec(0, 'ENEMY') }; } });
  assert.equal(devices.spawnDevice(bad.w, bad.c, 'foe', 1, 2), true);
  assert.equal(thrown(bad.w, bad.c, bad.es[0].id)?.target, bad.ops[0].id);
});

test('[敌能-83] 配重投石机 and 孤独的巨像 stay uncovered; act1multi_fortress_rm01 no longer lists StunAttack', () => {
  assert.deepEqual(uncoveredAbilities([shape({ atk_scale: 0.7, stun: 25 })]), ['StunAttack']);
  assert.deepEqual(uncoveredAbilities([shape({ atk_scale: 1, stun: 5, range_radius: 2 }, 999)]), ['StunAttack']);
  assert.deepEqual(uncoveredAbilities([shape({ atk_scale: 1, stun: 5, range_radius: 2, page: 1 })]), ['StunAttack']);
  assert.deepEqual(uncoveredAbilities([shape({ stun: 3 }, 10, 5)]), ['StunAttack']);
  const marked = withFoeExtras(KEY, shape({ atk_scale: 0.7, stun: 25 }));
  assert.equal(marked.skills?.[0].bb.page, 1);
  assert.deepEqual(uncoveredAbilities([marked]), []);
  const skill = real.enemies[KEY].skills?.find((s) => s.key === 'StunAttack');
  assert.deepEqual(skill?.bb, { atk_scale: 0.7, stun: 25, page: 1 });
  for (const d of /** @type {const} */ (['NORMAL', 'FOUR_STAR'])) {
    const gap = levelAt('act1multi_fortress_rm01', d).level.uncovered ?? [];
    assert.equal(gap.includes('StunAttack'), false, d);
  }
});
