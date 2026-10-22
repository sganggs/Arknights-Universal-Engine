// 枷锁 (docs/spec/foes.md 敌能-72) on the tiny map. The two read ids go through FOE_EXTRAS; 萨卡兹业余术师 is the same
// blackboard with no page, so it stays uncovered (关卡-2) and the behaviour does nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, buffs, blocking, devices, bus } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras, uncoveredAbilities } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

const MAGE = 'enemy_1022_dmage';
const LEAD = 'enemy_1022_dmage_2';
const AMATEUR = 'enemy_5072_izdmge';
const MARK = 'lasso';
const PULSE = 500 * 0.35;

/** @param {string} key @param {number} atk */
function mage(key, atk) {
  return withFoeExtras(key, {
    name: key, maxHp: 12000, atk, def: 200, res: 50, moveSpeed: 0.8, baseAttackTime: 4, rangeRadius: 2.5,
    applyWay: 'RANGED', motion: 'WALK', massLevel: 2, dmgType: 'arts',
    skills: [{ key: 'lasso', cooldown: 0, initCooldown: 0, sp: 0, bb: { hit_duration: 20, atk_scale: 0.35, range_radius: 3 } }],
  });
}

/** The amateur's blackboard, with no read-page marker. @returns {import('@aue/sim').EnemyDef} */
function rawLasso() {
  return {
    name: AMATEUR, maxHp: 8000, atk: 400, def: 100, res: 30, moveSpeed: 0.8, baseAttackTime: 4, rangeRadius: 2.5,
    applyWay: 'RANGED', motion: 'WALK', dmgType: 'arts',
    skills: [{ key: 'lasso', cooldown: 0, initCooldown: 0, sp: 0, bb: { hit_duration: 20, atk_scale: 0.35, range_radius: 3 } }],
  };
}

/**
 * Spawns `key` on the tiny map, pins it at (1, 1) and roots it. `tweak` runs after the operators are cheap and tough.
 * @param {string} key @param {Record<string, unknown>} def @param {(c: any) => void} [tweak] @param {string[]} [also]
 */
function open(key, def, tweak, also = []) {
  const c = /** @type {any} */ (tinyContent());
  c.behaviors = skeletonContent.behaviors;
  c.level.options = { ...c.level.options, characterLimit: 8, initialCost: 99, maxCost: 99, costIncreaseTime: 1000 };
  for (const op of Object.values(c.operators)) Object.assign(op, { cost: 0, atk: 0, maxHp: 100000, res: 0 });
  tweak?.(c);
  c.enemies = { ...c.enemies, [key]: def };
  c.level.waves = [oneWave([spawnAt(0, key), ...also.map((k) => spawnAt(0, k))])];
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = /** @type {Unit} */ (w.units.find((u) => u.key === key));
  e.x = 1;
  e.y = 1;
  status.applyStatus(e, 'root', {});
  return { w, c, e };
}

/** @param {World} w @param {any} c @param {string} op @param {number} row @param {number} col */
const deploy = (w, c, op, row, col) => step(w, c, [[0, { type: 'deploy', op, row, col, dir: 0 }]]);
/** @param {World} w @param {string} key @returns {Unit} */
const unit = (w, key) => /** @type {Unit} */ (w.units.find((u) => u.key === key));
/** @param {Unit | undefined} u */
const lassoStun = (u) => u?.buffs.find((b) => b.key === 'stun' && b.tag === MARK);
/** @param {readonly any[]} ev @param {number} id */
const hitsOf = (ev, id) => ev.filter((x) => x.type === 'hit' && x.id === id);
/** @param {Unit} e */
const channel = (e) => e.buffs.find((b) => b.key === MARK);
/** A unit is 晕眩 only while a stun buff's flag is on (状态-7 drops it under immunity). @param {Unit} u */
const stunned = (u) => !!attrs.statsOf(u).flags.stun;

/** Hits and attack starts from `id` over `n` frames. @param {World} w @param {any} c @param {number} id @param {number} n */
function drain(w, c, id, n) {
  /** @type {number[]} */
  const hits = [];
  /** @type {number[]} */
  const attacks = [];
  for (let i = 0; i < n; i++) {
    for (const ev of step(w, c)) {
      if (ev.type === 'hit' && ev.id === id) hits.push(/** @type {number} */ (ev.damage));
      else if (ev.type === 'attack' && ev.id === id) attacks.push(i);
    }
  }
  return { hits, attacks };
}

test('[敌能-72] no ground unit of ours within 3, and a flyer, does not start it; 不会攻击飞行单位 still holds', () => {
  const far = open(MAGE, mage(MAGE, 500));
  far.e.x = 0;
  for (let i = 0; i < 5; i++) step(far.w, far.c);
  assert.equal(far.e.ab['lasso.done'], undefined);
  deploy(far.w, far.c, 'guard', 1, 4);
  step(far.w, far.c);
  assert.equal(far.e.ab['lasso.done'], undefined);
  assert.equal(lassoStun(unit(far.w, 'guard')), undefined);
  const fly = open(MAGE, mage(MAGE, 500), (c) => { c.operators.guard.motion = 'FLY'; });
  deploy(fly.w, fly.c, 'guard', 1, 1);
  const fg = unit(fly.w, 'guard');
  const hp = fg.hp;
  assert.equal(fly.e.ab['lasso.done'], undefined);
  assert.equal(lassoStun(fg), undefined);
  for (let i = 0; i < 150; i++) step(fly.w, fly.c);
  assert.equal(fg.hp, hp);
  assert.equal(fly.e.ab['lasso.done'], undefined);
});

test('[敌能-72] a stunned unit is not chosen and the once is not spent', () => {
  const { w, c, e } = open(MAGE, mage(MAGE, 500));
  status.applyStatus(e, 'silence', { seconds: 5 });
  deploy(w, c, 'guard', 1, 1);
  const op = unit(w, 'guard');
  status.applyStatus(op, 'stun', { seconds: 10, tag: 'other' });
  buffs.removeBuff(e, 'silence');
  const ev = step(w, c);
  assert.equal(e.ab['lasso.done'], undefined);
  assert.equal(hitsOf(ev, e.id).length, 0);
  assert.equal(op.buffs.some((b) => b.tag === MARK), false);
  assert.equal(channel(e), undefined);
});

test('[敌能-72] a stunned blocker is passed over, and 索敌-5 takes the later deploy rather than the nearer one', () => {
  const { w, c, e } = open(MAGE, mage(MAGE, 500), (c) => { c.operators.far = { ...c.operators.sniper, name: 'far' }; });
  status.applyStatus(e, 'silence', { seconds: 8 });
  deploy(w, c, 'guard', 1, 1);
  step(w, c, [
    [0, { type: 'deploy', op: 'sniper', row: 2, col: 2, dir: 0 }],
    [0, { type: 'deploy', op: 'far', row: 2, col: 3, dir: 0 }],
  ]);
  status.applyStatus(unit(w, 'guard'), 'stun', { seconds: 30, tag: 'other' });
  buffs.removeBuff(e, 'silence');
  const ev = step(w, c);
  const far = unit(w, 'far'), sniper = unit(w, 'sniper');
  assert.equal(e.ab['lasso.target'], far.id);
  assert.equal(hitsOf(ev, e.id)[0].target, far.id);
  assert.ok(lassoStun(far));
  assert.equal(lassoStun(sniper), undefined);
  assert.equal(unit(w, 'guard').buffs.some((b) => b.tag === MARK), false);
});

test('[敌能-72] a neutral alone does not start it; once a unit of ours is in range the neutral blocker is locked', () => {
  const { w, c, e } = open(MAGE, mage(MAGE, 500), (c) => {
    c.enemies.wood = { name: 'wood', maxHp: 5000, atk: 0, def: 0, res: 0, moveSpeed: 0, neutral: true };
  }, ['wood']);
  const wood = unit(w, 'wood');
  wood.x = 5;
  wood.y = 1;
  status.applyStatus(wood, 'root', {});
  step(w, c);
  assert.equal(e.ab['lasso.done'], undefined);
  assert.equal(blocking.blockBy(w, e, wood), true);
  const ev = deploy(w, c, 'sniper', 2, 2);
  assert.equal(e.ab['lasso.target'], wood.id);
  assert.equal(hitsOf(ev, e.id)[0].target, wood.id);
  assert.equal(hitsOf(ev, e.id)[0].damage, PULSE);
  assert.ok(lassoStun(wood));
  assert.equal(lassoStun(unit(w, 'sniper')), undefined);
});

test('[敌能-72] a device of ours in range is locked; a hostile device is not', () => {
  const box = { name: 'box', maxHp: 1000, atk: 0, def: 0, res: 0, blockCnt: 0 };
  const hostile = open(MAGE, mage(MAGE, 500), (c) => { c.devices = { box: { ...box, side: 'ENEMY' } }; });
  assert.equal(devices.spawnDevice(hostile.w, hostile.c, 'box', 1, 3), true);
  step(hostile.w, hostile.c);
  assert.equal(hostile.e.ab['lasso.done'], undefined);
  assert.equal(lassoStun(unit(hostile.w, 'box')), undefined);
  const ours = open(MAGE, mage(MAGE, 500), (c) => { c.devices = { box }; });
  assert.equal(devices.spawnDevice(ours.w, ours.c, 'box', 1, 3), true);
  const ev = step(ours.w, ours.c);
  const d = unit(ours.w, 'box');
  assert.equal(ours.e.ab['lasso.target'], d.id);
  assert.equal(hitsOf(ev, ours.e.id)[0].damage, PULSE);
  assert.equal(lassoStun(d)?.left, -1);
});

test('[敌能-72] each pulse is sourced arts from the skill, a DoT, and not an attack', () => {
  const { w, c, e } = open(MAGE, mage(MAGE, 500));
  /** @type {any[]} */
  const seen = [];
  bus.on(w, 'damaged', (ev) => { if (ev.target.key === 'guard') seen.push(ev); });
  deploy(w, c, 'guard', 1, 4);
  assert.equal(seen.length, 1);
  const ev = seen[0];
  assert.equal(ev.source, e);
  assert.equal(ev.credit, e);
  assert.equal(ev.amount, PULSE);
  assert.equal(ev.type, 'arts');
  assert.equal(ev.dmg.isSkill, true);
  assert.equal(ev.dmg.isAttack, undefined);
  assert.notEqual(ev.dmg.sourceless, true);
  assert.equal(ev.dmg.hpLoss, undefined);
  assert.ok(ev.dmg.tags.includes('dot'));
  assert.ok(ev.dmg.tags.includes('periodic'));
});

test('[敌能-72] the target stays stunned and takes 35% ATK arts each second for 20 s, then is freed, and it never starts again', () => {
  const { w, c, e } = open(MAGE, mage(MAGE, 500));
  const born = hitsOf(deploy(w, c, 'guard', 1, 4), e.id);
  const op = unit(w, 'guard');
  const held = channel(e);
  assert.equal(born.length, 1);
  assert.equal(born[0].damage, PULSE);
  assert.equal(lassoStun(op)?.left, -1);
  assert.equal(lassoStun(op)?.resist, true);
  assert.equal(stunned(op), true);
  assert.equal(held?.flags.root, true);
  assert.equal(held?.flags.noAttack, true);
  assert.equal(e.ab['lasso.done'], 1);
  buffs.removeBuff(e, 'root');
  const mid = drain(w, c, e.id, 570);
  assert.equal(mid.attacks.length, 0);
  assert.equal(mid.hits.length, 19);
  assert.ok(mid.hits.every((d) => d === PULSE));
  assert.equal(op.buffs.filter((b) => b.key === 'stun' && b.tag === MARK).length, 1);
  assert.equal(stunned(op), true);
  assert.equal(e.ab['lasso.left'], 30);
  assert.equal(e.x, 1);
  const tail = drain(w, c, e.id, 29);
  assert.equal(tail.hits.length, 0);
  assert.equal(tail.attacks.length, 0);
  assert.equal(stunned(op), true);
  assert.equal(e.x, 1);
  const end = step(w, c);
  assert.equal(hitsOf(end, e.id).length, 0);
  assert.equal(lassoStun(op), undefined);
  assert.equal(stunned(op), false);
  assert.equal(channel(e), undefined);
  e.ab['lasso.cd'] = 0;
  const again = drain(w, c, e.id, 40);
  assert.ok(again.hits.every((d) => d !== PULSE));
  assert.equal(e.ab['lasso.done'], 1);
  assert.equal(lassoStun(op), undefined);
});

test('[敌能-72] another stun keeps its own time after this skill\'s stun is taken off', () => {
  const { w, c, e } = open(MAGE, mage(MAGE, 500));
  deploy(w, c, 'guard', 1, 4);
  const op = unit(w, 'guard');
  status.applyStatus(op, 'stun', { seconds: 40, tag: 'other' });
  const other = () => op.buffs.find((b) => b.key === 'stun' && b.tag === 'other');
  const before = other()?.left;
  assert.equal(op.buffs.filter((b) => b.tag === MARK).length, 1);
  drain(w, c, e.id, 600);
  assert.equal(lassoStun(op), undefined);
  assert.equal(other()?.left, (before ?? 0) - 600);
  assert.equal(stunned(op), true);
});

test('[敌能-72] 晕眩抗性 does not expire the skill\'s endless stun', () => {
  const { w, c, e } = open(MAGE, mage(MAGE, 500));
  deploy(w, c, 'guard', 1, 4);
  const op = unit(w, 'guard');
  status.applyStatus(op, 'buffres', { value: 0.5 });
  drain(w, c, e.id, 60);
  assert.equal(lassoStun(op)?.left, -1);
  assert.equal(stunned(op), true);
});

test('[敌能-72] silence ends the channel and frees the target at once, and it does not start again', () => {
  const { w, c, e } = open(MAGE, mage(MAGE, 500));
  deploy(w, c, 'guard', 1, 4);
  const op = unit(w, 'guard');
  assert.equal(stunned(op), true);
  status.applyStatus(e, 'silence', { seconds: 5 });
  const ev = step(w, c);
  assert.equal(hitsOf(ev, e.id).length, 0);
  assert.equal(channel(e), undefined);
  assert.equal(lassoStun(op), undefined);
  assert.equal(stunned(op), false);
  assert.equal(e.ab['lasso.done'], 1);
  buffs.removeBuff(e, 'silence');
  const more = drain(w, c, e.id, 40);
  assert.ok(more.hits.every((d) => d !== PULSE));
  assert.equal(lassoStun(op), undefined);
});

test('[敌能-72] a stun on the caster ends the channel and frees the target', () => {
  const { w, c, e } = open(MAGE, mage(MAGE, 500));
  deploy(w, c, 'guard', 1, 4);
  const op = unit(w, 'guard');
  status.applyStatus(e, 'stun', {});
  const ev = step(w, c);
  assert.equal(hitsOf(ev, e.id).length, 0);
  assert.equal(channel(e), undefined);
  assert.equal(lassoStun(op), undefined);
  assert.equal(stunned(op), false);
  assert.equal(stunned(e), true);
  assert.equal(e.ab['lasso.done'], 1);
});

test('[敌能-72] the target dying ends the channel and does not lock someone else', () => {
  const { w, c, e } = open(MAGE, mage(MAGE, 500));
  status.applyStatus(e, 'silence', { seconds: 5 });
  deploy(w, c, 'guard', 1, 1);
  deploy(w, c, 'sniper', 2, 2);
  buffs.removeBuff(e, 'silence');
  const started = step(w, c);
  const op = unit(w, 'guard');
  assert.equal(hitsOf(started, e.id)[0].target, op.id);
  op.hp = 0;
  const ev = step(w, c);
  assert.equal(hitsOf(ev, e.id).length, 0);
  assert.equal(channel(e), undefined);
  assert.equal(w.units.includes(op), false);
  assert.equal(lassoStun(unit(w, 'sniper')), undefined);
  assert.equal(e.ab['lasso.done'], 1);
});

test('[敌能-72] the caster being knocked down takes the skill\'s stun off', () => {
  const { w, c, e } = open(MAGE, mage(MAGE, 500));
  deploy(w, c, 'guard', 1, 4);
  const op = unit(w, 'guard');
  assert.ok(lassoStun(op));
  e.hp = 0;
  step(w, c);
  assert.equal(w.units.includes(e), false);
  assert.equal(lassoStun(op), undefined);
  assert.equal(stunned(op), false);
});

test('[敌能-72] the target leaving the radius does not end the channel', () => {
  const { w, c, e } = open(MAGE, mage(MAGE, 500));
  deploy(w, c, 'guard', 1, 4);
  const op = unit(w, 'guard');
  op.x = 20;
  const seen = drain(w, c, e.id, 30);
  assert.equal(seen.hits.length, 1);
  assert.equal(seen.hits[0], PULSE);
  assert.equal(lassoStun(op)?.left, -1);
  assert.ok(channel(e));
  assert.equal(e.ab['lasso.done'], 1);
});

test('[敌能-72] a locked unit that can no longer be selected, and is not blocking, is freed at once', () => {
  const { w, c, e } = open(MAGE, mage(MAGE, 500));
  deploy(w, c, 'guard', 1, 4);
  const op = unit(w, 'guard');
  buffs.addBuff(op, buffs.makeBuff({ key: 'hide', flags: { untargetable: true } }));
  const ev = step(w, c);
  assert.equal(hitsOf(ev, e.id).length, 0);
  assert.equal(channel(e), undefined);
  assert.equal(lassoStun(op), undefined);
  assert.equal(stunned(op), false);
});

test('[敌能-72] 起飞 blocks a later pulse and does not end the channel', () => {
  const { w, c, e } = open(MAGE, mage(MAGE, 500));
  deploy(w, c, 'guard', 1, 4);
  const op = unit(w, 'guard');
  const hp = op.hp;
  buffs.addBuff(op, buffs.makeBuff({ key: 'up', flags: { liftoff: true } }));
  const seen = drain(w, c, e.id, 30);
  assert.equal(seen.hits.length, 0);
  assert.equal(op.hp, hp);
  assert.equal(lassoStun(op)?.left, -1);
  assert.equal(stunned(op), true);
  assert.ok(channel(e));
});

test('[敌能-72] a unit immune to 晕眩 still takes the arts, and the stun buff is there with the flag off', () => {
  const { w, c, e } = open(MAGE, mage(MAGE, 500), (c) => { c.operators.guard.immune = ['stun']; });
  const ev = deploy(w, c, 'guard', 1, 4);
  const op = unit(w, 'guard');
  assert.equal(hitsOf(ev, e.id)[0].damage, PULSE);
  assert.equal(op.hp, 100000 - PULSE);
  assert.equal(lassoStun(op)?.left, -1);
  assert.equal(stunned(op), false);
  assert.ok(channel(e));
});

test('[敌能-72] [关卡-2] 萨卡兹业余术师 stays uncovered and does nothing; the two read pages are covered, with 不会攻击飞行单位', () => {
  const raw = rawLasso();
  assert.deepEqual(uncoveredAbilities([raw]), ['lasso']);
  assert.equal(withFoeExtras(AMATEUR, raw), raw);
  const read = mage(MAGE, 500), lead = mage(LEAD, 700);
  assert.deepEqual(uncoveredAbilities([read, lead]), []);
  assert.deepEqual(read.talents?.noFly, {});
  assert.deepEqual(lead.talents?.noFly, {});
  assert.equal(read.skills?.[0].bb.page, 1);
  assert.equal(lead.skills?.[0].bb.page, 1);
  const quiet = open(AMATEUR, raw);
  deploy(quiet.w, quiet.c, 'guard', 1, 4);
  step(quiet.w, quiet.c);
  assert.equal(quiet.e.ab['lasso.done'], undefined);
  assert.equal(lassoStun(unit(quiet.w, 'guard')), undefined);
  assert.equal(channel(quiet.e), undefined);
});

test('[敌能-72] 萨卡兹术师组长 stuns and burns at 35% of 700, and silence frees the target at once', () => {
  const { w, c, e } = open(LEAD, mage(LEAD, 700));
  const ev = deploy(w, c, 'guard', 1, 4);
  const op = unit(w, 'guard');
  assert.equal(hitsOf(ev, e.id)[0].damage, 700 * 0.35);
  assert.equal(stunned(op), true);
  assert.equal(lassoStun(op)?.left, -1);
  status.applyStatus(e, 'silence', {});
  const next = step(w, c);
  assert.equal(hitsOf(next, e.id).length, 0);
  assert.equal(lassoStun(op), undefined);
  assert.equal(stunned(op), false);
  assert.equal(channel(e), undefined);
  assert.equal(e.ab['lasso.done'], 1);
});
