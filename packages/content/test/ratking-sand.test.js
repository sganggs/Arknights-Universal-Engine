// 鼠王's 唱沙 (docs/spec/foes.md 敌能-144): the centre, the cross, the damage, and the attack it takes the place of. A
// record with rangeRadius 0 keeps its normal attack out of a count (it then attacks only a blocker); the skill does not
// read the radius. The record is enemy_database level 0 (ratking-kit.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step, attrs, status, buffs, bus, devices } from '@aue/sim';
import { rat, rawRat, field, lost, run } from './ratking-kit.js';

/** @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').World} World */

/** No normal attack unless blocked. @param {Record<string, unknown>} [over] @param {Record<string, number>} [sand] */
const still = (over = {}, sand = {}) => rat({ rangeRadius: 0, ...over }, sand);
/** 唱沙 ready now. @param {Unit} e */
const ready = (e) => { e.ab['DriftSand.cd'] = 0; };
/** Attack events of this enemy. @param {any[]} ev @param {Unit} e */
const attacksOf = (ev, e) => ev.filter((x) => x.type === 'attack' && x.id === e.id);
/** HP lost by each operator, by key. @param {Record<string, Unit>} ops */
const losses = (ops) => Object.fromEntries(Object.entries(ops).map(([k, u]) => [k, lost(u)]));
/** A skill that gains SP when its operator is hit (受击回复, 技能-2). */
const HURT = { skill: { id: 't', type: 'MANUAL', sp: 'hurt', cost: 10, init: 0, charges: 1, duration: 0, ammo: false, bb: {} } };
/** A buff with these flags or mods on a unit. @param {Unit} u @param {Record<string, boolean>} flags @param {Record<string, number>} [mods] */
const give = (u, flags, mods = {}) => { buffs.addBuff(u, buffs.makeBuff({ key: `test:${Object.keys(flags).join()}`, flags, mods })); };

/** The frames after its spawn frame on which the lone unit `a` was hit, over n frames. @param {import('@aue/sim').EnemyDef} def @param {number} n */
function castFrames(def, n) {
  const box = field(def, [['a', 2, 2, 1e6]]), at = [];
  for (let i = 1; i <= n; i++) {
    const before = box.ops.a.hp;
    step(box.w, box.c);
    if (box.ops.a.hp < before) at.push(i + 1);
  }
  return { at, box };
}

test('[敌能-144] 唱沙: first 20 s after it appears, then 15 s after each cast; the cooldowns are the record\'s', () => {
  // the last of these frames is the third cast: its 15 s count has taken this frame off
  const { at, box } = castFrames(still(), 1499);
  assert.deepEqual(at, [600, 1050, 1500]);
  assert.equal(box.e.ab['DriftSand.cd'], 449);
  /** @param {number} cd */
  const quick = (cd) => rawRat().skills?.map((s) => (s.key === 'DriftSand' ? { ...s, initCooldown: 2, cooldown: cd } : s));
  assert.deepEqual(castFrames(still({ skills: quick(5) }), 400).at, [60, 210, 360]);
  // shorter than its attack interval (3.4 s, 102 frames): each cast waits for the attack the one before took
  assert.deepEqual(castFrames(still({ skills: quick(3) }), 300).at, [60, 162, 264]);
});

test('[敌能-144] 唱沙: SandStorm and Mark do nothing — no attack taken at 1 s, no zone and no ATK cut at 60 s', () => {
  const box = field(still(), [['a', 2, 2, 1e6, { atk: 100 }]]);
  run(box, 29);
  assert.equal(box.e.ab['Mark.cd'], 0);
  run(box, 2);
  assert.equal(box.e.atkCd, 0);
  // to frame 1932: past SandStorm's 60 s; the casts are 唱沙's at frames 600, 1050 and 1500
  run(box, 1900);
  assert.equal(lost(box.ops.a), 3 * 800);
  assert.equal(box.w.zones, undefined);
  assert.equal(attrs.statsOf(box.ops.a).atk, 100);
});

test('[敌能-144] 唱沙: the centre is the highest max HP on the field, in its range or not, never a flying unit', () => {
  const box = field(still(), [['low', 0, 1, 3000], ['high', 4, 0, 6000], ['bird', 2, 4, 9000, { motion: 'FLY' }]]);
  ready(box.e);
  step(box.w, box.c);
  assert.deepEqual(losses(box.ops), { low: 0, high: 800, bird: 0 });
  // equal max HP: 索敌-5 — the one deployed later (not the first created), and a taunt over the later deployment
  const tie = field(still(), [['p', 2, 1, 6000], ['q', 2, 6, 6000]]);
  ready(tie.e);
  step(tie.w, tie.c);
  assert.deepEqual(losses(tie.ops), { p: 0, q: 800 });
  const taunt = field(still(), [['q', 2, 6, 6000, { tauntLevel: 1 }], ['p', 2, 1, 6000]]);
  ready(taunt.e);
  step(taunt.w, taunt.c);
  assert.deepEqual(losses(taunt.ops), { q: 800, p: 0 });
});

test('[敌能-144] 唱沙: the centre goes by the current max HP — a max-HP buff counts, the HP left does not', () => {
  const raised = field(still(), [['up', 0, 1, 5000], ['plain', 3, 6, 9000]]);
  give(raised.ops.up, {}, { hpPct: 1 });
  ready(raised.e);
  step(raised.w, raised.c);
  assert.deepEqual(losses(raised.ops), { up: 800, plain: 0 });
  const worn = field(still(), [['worn', 0, 1, 9000], ['whole', 3, 6, 5000]]);
  worn.ops.worn.hp = 1000;
  ready(worn.e);
  step(worn.w, worn.c);
  assert.deepEqual([worn.ops.worn.hp, lost(worn.ops.whole)], [200, 0]);
});

test('[敌能-144] 唱沙: a neutral unit or a device of ours with the highest max HP is the centre', () => {
  const civ = { name: 'civ', maxHp: 50000, atk: 0, def: 0, res: 0, moveSpeed: 1, neutral: true };
  const box = field(still(), [['near', 1, 2, 1000], ['far', 3, 6, 9000]], { more: { civ } });
  const man = /** @type {Unit} */ (box.w.units.find((u) => u.key === 'civ'));
  Object.assign(man, { x: 1, y: 1, path: [], pt: 0 });
  status.applyStatus(man, 'root', {});
  ready(box.e);
  step(box.w, box.c);
  assert.deepEqual([lost(man), lost(box.ops.near), lost(box.ops.far)], [800, 800, 0]);
  const wall = field(still(), [['near', 1, 2, 1000], ['far', 3, 6, 9000]], {
    tweak: (c) => { c.devices = { ...(c.devices ?? {}), wall: { name: 'wall', maxHp: 90000, atk: 0, def: 0, res: 0 } }; },
  });
  const d = /** @type {Unit} */ (devices.spawnDevice(wall.w, wall.c, 'wall', 3, 3) ? wall.w.units.find((u) => u.key === 'wall') : null);
  ready(wall.e);
  step(wall.w, wall.c);
  assert.deepEqual([lost(d), lost(wall.ops.near), lost(wall.ops.far)], [800, 0, 800]);
});

test('[敌能-144] 唱沙: the second player\'s unit with the highest max HP is the centre too', () => {
  const two = { name: 'two', position: 'MELEE', cost: 0, blockCnt: 0, baseAttackTime: 1, maxHp: 9000, atk: 0, def: 0, res: 0, range: [{ row: 0, col: 0 }] };
  const box = field(still(), [['one', 0, 1, 6000]], { players: 2, tweak: (c) => { c.operators.two = two; } });
  step(box.w, box.c, [[1, { type: 'deploy', op: 'two', row: 3, col: 6, dir: 0 }]]);
  const other = /** @type {Unit} */ (box.w.units.find((u) => u.key === 'two'));
  assert.equal(other.owner, 1);
  ready(box.e);
  step(box.w, box.c);
  assert.deepEqual([lost(box.ops.one), lost(other)], [0, 800]);
});

test('[敌能-144] 唱沙: the cross is `arm` tiles along the centre\'s row and column, by the tile each unit stands on', () => {
  const seats = /** @type {import('./ratking-kit.js').Seat[]} */ ([['c', 2, 4, 9000], ['w3', 2, 1, 1000], ['w4', 2, 0, 1000], ['e3', 2, 7, 1000], ['e4', 2, 8, 1000],
    ['n2', 0, 4, 1000], ['s2', 4, 4, 1000], ['d1', 1, 3, 1000], ['d2', 3, 5, 1000]]);
  const box = field(still(), seats);
  ready(box.e);
  step(box.w, box.c);
  assert.deepEqual(losses(box.ops), { c: 800, w3: 800, w4: 0, e3: 800, e4: 0, n2: 800, s2: 800, d1: 0, d2: 0 });
  const one = field(still({}, { arm: 1 }), [['c', 2, 4, 9000], ['w1', 2, 3, 1000], ['w2', 2, 2, 1000], ['n1', 1, 4, 1000], ['n2', 0, 4, 1000]]);
  ready(one.e);
  step(one.w, one.c);
  assert.deepEqual(losses(one.ops), { c: 800, w1: 800, w2: 0, n1: 800, n2: 0 });
});

test('[敌能-144] [技能-2] 唱沙: `damage` physical splash, a skill hit and not an attack, not scaled by ATK; DEF, 低血 and 受击回复 apply', () => {
  const box = field(still(), [['a', 2, 4, 9000, HURT], ['b', 2, 5, 1000, { def: 300 }]]);
  /** @type {{ id: number, attack: boolean, skill: boolean, splash: boolean, type: string }[]} */
  const seen = [];
  bus.on(box.w, 'hit', (k) => {
    if (k.credit === box.e) seen.push({ id: k.target.id, attack: k.dmg.isAttack === true, skill: k.dmg.isSkill === true, splash: k.dmg.isSplash === true, type: k.dmg.type });
  });
  buffs.addBuff(box.e, buffs.makeBuff({ key: 'testAtk', mods: { atkPct: 1 } }));
  ready(box.e);
  step(box.w, box.c);
  const flags = { attack: false, skill: true, splash: true, type: 'phys' };
  assert.deepEqual(seen, [{ id: box.ops.a.id, ...flags }, { id: box.ops.b.id, ...flags }]);
  assert.deepEqual(losses(box.ops), { a: 800, b: 500 });
  assert.equal(box.ops.a.skill?.sp, 1);
  const low = field(still({}, { damage: 500 }), [['a', 2, 4, 9000]]);
  low.e.hp = 10000;
  ready(low.e);
  step(low.w, low.c);
  assert.equal(lost(low.ops.a), 750);
});

test('[敌能-144] [阻挡-2] 唱沙: 迷彩 is in the cross but never the centre; 隐匿, 无法选中 and 起飞 are neither; nor is 沉睡 the centre; a dodge spares only that unit', () => {
  // `side` is in mid's cross only: the centre is mid, and cam (3 tiles along its row) is hit
  const cam = field(still(), [['cam', 2, 4, 9000], ['mid', 2, 7, 5000], ['side', 0, 7, 1000]]);
  give(cam.ops.cam, { camou: true });
  ready(cam.e);
  step(cam.w, cam.c);
  assert.deepEqual(losses(cam.ops), { cam: 800, mid: 800, side: 800 });
  const box = field(still(), [['top', 2, 4, 9000], ['hid', 2, 5, 1000], ['unt', 2, 3, 1000], ['lift', 1, 4, 20000], ['dodger', 3, 4, 1000],
    ['plain', 2, 6, 1000], ['bird', 2, 2, 1000, { motion: 'FLY' }]]);
  give(box.ops.hid, { stealth: true });
  give(box.ops.unt, { untargetable: true });
  give(box.ops.lift, { liftoff: true });
  give(box.ops.dodger, {}, { dodgePhys: 1 });
  ready(box.e);
  step(box.w, box.c);
  assert.deepEqual(losses(box.ops), { top: 800, hid: 0, unt: 0, lift: 0, dodger: 0, plain: 800, bird: 800 });
  // 隐匿, 无法选中 and 沉睡 with the highest max HP are not the centre either
  for (const flag of ['stealth', 'untargetable', 'sleep']) {
    const out = field(still(), [['big', 0, 1, 20000], ['top', 3, 6, 9000]]);
    give(out.ops.big, { [flag]: true });
    ready(out.e);
    step(out.w, out.c);
    assert.deepEqual([flag, losses(out.ops)], [flag, { big: 0, top: 800 }]);
  }
  // 起飞 evades a ground 鼠王 only (阻挡-2): one that counts as flying (近地悬浮) may take it as the centre and hit it
  const air = field(still(), [['lift', 1, 4, 20000], ['top', 3, 6, 9000]]);
  give(air.ops.lift, { liftoff: true });
  give(air.e, { hover: true });
  ready(air.e);
  step(air.w, air.c);
  assert.deepEqual(losses(air.ops), { lift: 800, top: 0 });
});

test('[敌能-144] 唱沙: an invincible centre takes nothing, the rest of the cross does, and the cast still counts', () => {
  const box = field(still(), [['top', 2, 4, 9000, HURT], ['other', 2, 3, 1000]]);
  status.applyStatus(box.ops.top, 'invincible', {});
  ready(box.e);
  step(box.w, box.c);
  assert.deepEqual(losses(box.ops), { top: 0, other: 800 });
  assert.equal(box.ops.top.skill?.sp, 0);
  assert.equal(box.e.ab['DriftSand.cd'], 449);
});

test('[敌能-144] 唱沙: it waits for its attack cooldown, then takes that attack — no swing that frame, the next an interval later', () => {
  const control = field(rat(), [['g', 2, 6, 1e6]], { at: [2, 4] });
  control.e.ab['DriftSand.cd'] = 99999;
  control.e.atkCd = 5;
  assert.equal(attacksOf(run(control, 5), control.e).length, 0);
  assert.equal(attacksOf(step(control.w, control.c), control.e).length, 1);
  const box = field(rat(), [['g', 2, 6, 1e6]], { at: [2, 4] });
  ready(box.e);
  box.e.atkCd = 5;
  assert.equal(attacksOf(run(box, 5), box.e).length, 0);
  assert.deepEqual([lost(box.ops.g), box.e.ab['DriftSand.cd']], [0, 0]);
  assert.equal(attacksOf(step(box.w, box.c), box.e).length, 0);
  assert.deepEqual([lost(box.ops.g), box.e.ab['DriftSand.cd'], box.e.atkCd], [800, 449, 101]);
  assert.equal(attacksOf(run(box, 101), box.e).length, 0);
  assert.equal(attacksOf(step(box.w, box.c), box.e).length, 1);
});

test('[敌能-144] [状态-12] 唱沙: stun, silence, 恐惧, 缴械, 强制缴械, noAttack and 失衡 hold it, ready, until they end; silence immunity does not', () => {
  /** @type {[string, (e: Unit) => void][]} */
  const holds = [
    ['stun', (e) => { status.applyStatus(e, 'stun', { seconds: 1 }); }],
    ['silence', (e) => { status.applyStatus(e, 'silence', { seconds: 1 }); }],
    ['fear', (e) => { status.applyStatus(e, 'fear', { seconds: 1 }); }],
    ['缴械', (e) => { status.applyStatus(e, 'disarm', { seconds: 1 }); }],
    ['强制缴械', (e) => { status.applyStatus(e, 'forceDisarm', { seconds: 1 }); }],
    ['noAttack', (e) => { buffs.addBuff(e, buffs.makeBuff({ key: 'testNoAttack', flags: { noAttack: true }, left: 30 })); }],
    ['失衡', (e) => { e.slide = { vx: 0, vy: 0, hard: 0 }; }],
    ['攻击力 0', (e) => { buffs.addBuff(e, buffs.makeBuff({ key: 'testNoAtk', mods: { atkMul: 0 }, left: 30 })); }],
  ];
  for (const [name, hold] of holds) {
    const box = field(still({ immune: [] }), [['g', 2, 2, 1e6]]);
    hold(box.e);
    ready(box.e);
    step(box.w, box.c);
    assert.deepEqual([name, lost(box.ops.g), box.e.ab['DriftSand.cd']], [name, 0, 0]);
    run(box, 40);
    assert.deepEqual([name, lost(box.ops.g)], [name, 800]);
  }
  const immune = field(still(), [['g', 2, 2, 1e6]]);
  status.applyStatus(immune.e, 'silence', { seconds: 1 });
  ready(immune.e);
  step(immune.w, immune.c);
  assert.equal(lost(immune.ops.g), 800);
  const shielded = field(still({ immune: [] }), [['g', 2, 2, 1e6]]);
  status.applyStatus(shielded.e, 'disarm', { seconds: 1 });
  status.applyStatus(shielded.e, 'invincible', { seconds: 1 });
  ready(shielded.e);
  step(shielded.w, shielded.c);
  assert.equal(lost(shielded.ops.g), 800, '缴械 does nothing while it is 无敌 (状态-12)');
});

test('[敌能-144] 唱沙: not while it has disappeared or a swing of its is under way', () => {
  const box = field(still(), [['g', 2, 2, 1e6]]);
  ready(box.e);
  box.e.hidden = true;
  step(box.w, box.c);
  box.e.hidden = false;
  box.e.swing = { wind: 50, since: 0, targets: [], mods: { scale: 1, times: 1, targets: 1, skill: false } };
  step(box.w, box.c);
  assert.deepEqual([lost(box.ops.g), box.e.ab['DriftSand.cd']], [0, 0]);
  box.e.swing = null;
  step(box.w, box.c);
  assert.equal(lost(box.ops.g), 800);
});

test('[敌能-144] 唱沙: 战栗 holds it only while it is blocked', () => {
  const blocked = field(still({ immune: [] }), [['blk', 2, 4, 1e6, { blockCnt: 2 }]], { at: [2, 4] });
  assert.equal(blocked.e.blockedBy, blocked.ops.blk.id);
  status.applyStatus(blocked.e, 'disarmedCombat', { seconds: 10 });
  ready(blocked.e);
  run(blocked, 3);
  assert.deepEqual([lost(blocked.ops.blk), blocked.e.ab['DriftSand.cd']], [0, 0]);
  const free = field(still({ immune: [] }), [['g', 2, 2, 1e6]]);
  status.applyStatus(free.e, 'disarmedCombat', { seconds: 10 });
  ready(free.e);
  step(free.w, free.c);
  assert.equal(lost(free.ops.g), 800);
});

test('[敌能-144] 唱沙: nobody on the field — no cast, still ready, its attack not taken; the first unit deployed is hit', () => {
  const op = { name: 'g', position: 'MELEE', cost: 0, blockCnt: 0, baseAttackTime: 1, maxHp: 5000, atk: 0, def: 0, res: 0, range: [{ row: 0, col: 0 }] };
  const box = field(rat(), [], { tweak: (c) => { c.operators.g = op; } });
  ready(box.e);
  run(box, 3);
  assert.deepEqual([box.e.ab['DriftSand.cd'], box.e.atkCd], [0, 0]);
  step(box.w, box.c, [[0, { type: 'deploy', op: 'g', row: 2, col: 2, dir: 0 }]]);
  step(box.w, box.c);
  const g = /** @type {Unit} */ (box.w.units.find((u) => u.key === 'g'));
  assert.equal(lost(g), 800);
});
