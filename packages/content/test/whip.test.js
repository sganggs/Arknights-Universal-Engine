// 萨卡兹骸骨鞭笞者 / 拷打者, the 血珀 they leave, and 新生血裔's summon (docs/spec/foes.md 敌能-63).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, displacement, bus, stateHash, takeSnapshot, restoreSnapshot } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { uncoveredAbilities } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

const AURA = {
  'attack@ranged_atk_scale': 0.5, range_radius: 1, hp_ratio: 0.15, atk: 0.1, max_stack_cnt: 15,
};
const IMMUNE = ['stun', 'silence', 'sleep', 'frozen', 'levitate'];

/** @param {Record<string, unknown>} [over] */
function whipDef(over = {}) {
  return {
    name: 'whip', maxHp: 20000, atk: 900, def: 900, res: 20, moveSpeed: 0, baseAttackTime: 3, massLevel: 4,
    applyWay: 'ALL', rangeRadius: 1.3, talents: { Attack: { ...AURA }, Summon: { cnt: 2, enemy_key: 'seed' } }, ...over,
  };
}

/** @param {Record<string, unknown>} [over] */
function seedDef(over = {}) {
  return {
    name: 'seed', maxHp: 3000, atk: 100, def: 3000, res: 90, moveSpeed: 1, baseAttackTime: 1, massLevel: 2,
    rangeRadius: 1, applyWay: 'NONE', tauntLevel: -2, immune: [...IMMUNE],
    talents: { Passive: { damage_resistance: 0, hp_ratio: 0.1 } }, ...over,
  };
}

const FODDER = { name: 'fodder', maxHp: 100, atk: 0, def: 0, res: 0, moveSpeed: 0 };

function fellowDef() {
  return {
    name: 'fellow', maxHp: 4000, atk: 100, def: 200, res: 20, moveSpeed: 0, baseAttackTime: 2, massLevel: 1,
    applyWay: 'MELEE', rangeRadius: 1,
    talents: {
      DamageUp: { scale_ratio: 0.2, add_on: 1 }, Summon: { cnt: 1, enemy_key: 'seed' }, vampire: { heal_scale: 2.2 },
    },
  };
}

function shieldDef() {
  return {
    name: 'shield', maxHp: 1000, atk: 100, def: 0, res: 0, moveSpeed: 0,
    talents: { Summon: { cnt: 2, attack_speed: -40, duration: 5, enemy_key: 'seed' } },
  };
}

/** @param {Record<string, number>} bb */
function attackOnly(bb) {
  return { name: 'a', maxHp: 1, atk: 900, def: 0, res: 0, moveSpeed: 0, applyWay: 'ALL', rangeRadius: 1.3, talents: { Attack: bb } };
}

/** @param {Record<string, number>} bb */
function passiveOnly(bb) {
  return { name: 'p', maxHp: 1, atk: 0, def: 0, res: 0, talents: { Passive: bb } };
}

/** @param {string} name @param {Record<string, Record<string, number | string>>} talents */
function named(name, talents) {
  return { name, maxHp: 1, atk: 0, def: 0, res: 0, talents };
}

/** @param {Record<string, unknown>} enemies @param {string[]} keys @param {(c: any) => void} [tweak] */
function open(enemies, keys, tweak) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { ...c.enemies, ...enemies };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave(keys.map((key) => spawnAt(0, key)))];
  c.level.options = { ...c.level.options, characterLimit: 8, initialCost: 99, maxCost: 99, costIncreaseTime: 1000 };
  c.operators.guard.cost = 0;
  c.operators.sniper.cost = 0;
  if (tweak) tweak(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  return { c, w };
}

/** @param {World} w @param {any} c @param {number} n */
function run(w, c, n) { for (let i = 0; i < n; i++) step(w, c); }
/** @param {World} w @param {string} key @returns {Unit[]} */
const ofKey = (w, key) => w.units.filter((u) => u.key === key);
/**
 * Stand a unit on a point and drop its planned path. Move speed floors at 0.1 (属性-3), so a def of 0 still
 * walks after the tick. The leave aura reads centres on the scoring step: pin again at the start of that step.
 * @param {Unit} u @param {number} x @param {number} y
 */
const pin = (u, x, y) => { u.x = x; u.y = y; u.path = []; };
/** @param {Unit} u */
const hold = (u) => { u.atkCd = 999; };
/** @param {World} w @param {any} c @param {string} op @param {number} row @param {number} col */
const deploy = (w, c, op, row, col) => step(w, c, [[0, { type: 'deploy', op, row, col, dir: 0 }]]);
/** @param {World} w @param {any} c @param {number} id */
const retreat = (w, c, id) => step(w, c, [[0, { type: 'retreat', unit: id }]]);
/** @param {World} w @param {string} key @returns {Unit} */
const opOf = (w, key) => /** @type {Unit} */ (w.units.find((u) => u.key === key));
/** @param {any[]} ev @param {number} id */
const hits = (ev, id) => ev.filter((e) => e.type === 'hit' && e.id === id);
/** @param {Unit} u */
const layers = (u) => u.buffs.find((b) => b.key === 'whipAtk')?.stacks ?? 0;
/** @param {Unit} u */
const atkOf = (u) => attrs.statsOf(u).atk;
/** @param {Unit[]} list */
function down(list) { for (const u of list) u.hp = 0; }

/** @param {string} op @param {number} row @param {number} col */
function strike(op, row, col) {
  const { c, w } = open({ whip: whipDef() }, ['whip']);
  const e = ofKey(w, 'whip')[0];
  pin(e, 2, 1);
  const ev = deploy(w, c, op, row, col);
  const t = opOf(w, op);
  return { blockedBy: e.blockedBy, damage: hits(ev, e.id)[0]?.damage, left: t.hp, n: hits(ev, e.id).length, exits: w.exits };
}

/** @param {Unit[]} list @param {number} x @param {number} y @param {number} route @param {number} leg */
function nearTile(list, x, y, route, leg) {
  assert.ok(list.length > 0);
  for (const s of list) {
    assert.ok(Math.abs(s.x - x) <= 0.1);
    assert.ok(Math.abs(s.y - y) <= 0.1);
    assert.equal(s.route, route);
    assert.equal(s.leg, leg);
  }
}

/** Whip plus `n` fodder, all standing on (2, 1). @param {number} n */
function crowd(n) {
  const keys = ['whip'];
  for (let i = 0; i < n; i++) keys.push('fodder');
  const { c, w } = open({ whip: whipDef(), fodder: FODDER }, keys);
  const e = ofKey(w, 'whip')[0];
  for (const u of w.units) if (u.kind === 1) pin(u, 2, 1);
  return { c, w, e, fodder: ofKey(w, 'fodder') };
}

test('[敌能-63] blocked melee hits for the full attack; unblocked ranged hits for half', () => {
  const blocked = strike('guard', 1, 2);
  assert.equal(blocked.n, 1);
  assert.ok(blocked.blockedBy >= 0);
  assert.equal(blocked.damage, 800);
  assert.equal(blocked.left, 200);
  const ranged = strike('sniper', 2, 2);
  assert.equal(ranged.n, 1);
  assert.equal(ranged.blockedBy, -1);
  assert.equal(ranged.damage, 430);
  assert.equal(ranged.left, 70);
  assert.ok(Array.isArray(ranged.exits));
});

test('[敌能-63] a flying operator in range is not a candidate, and one leaving at distance 1 still heals', () => {
  const missed = open({ whip: whipDef() }, ['whip'], (cc) => { cc.operators.sniper.motion = 'FLY'; });
  const flyer = ofKey(missed.w, 'whip')[0];
  pin(flyer, 2, 1);
  const ev = deploy(missed.w, missed.c, 'sniper', 2, 2);
  const sniper = opOf(missed.w, 'sniper');
  assert.equal(hits(ev, flyer.id).length, 0);
  assert.equal(sniper.hp, sniper.maxHp);
  const healed = open({ whip: whipDef() }, ['whip'], (cc) => { cc.operators.sniper.motion = 'FLY'; });
  const e = ofKey(healed.w, 'whip')[0];
  pin(e, 2, 1);
  hold(e);
  e.hp = 10000;
  deploy(healed.w, healed.c, 'sniper', 2, 2);
  pin(e, 2, 1);
  e.hp = 10000;
  retreat(healed.w, healed.c, opOf(healed.w, 'sniper').id);
  assert.equal(e.hp, 13000);
  assert.equal(layers(e), 1);
  assert.ok(Math.abs(atkOf(e) - 990) < 1e-9);
});

test('[敌能-63] an operator and an enemy leaving within 1.0 each heal 15% and add a layer; outside 1.0 neither does', () => {
  const near = open({ whip: whipDef(), fodder: FODDER }, ['whip', 'fodder']);
  const e = ofKey(near.w, 'whip')[0];
  const fodder = ofKey(near.w, 'fodder')[0];
  pin(e, 2, 1);
  pin(fodder, 2, 1);
  hold(e);
  deploy(near.w, near.c, 'guard', 1, 3);
  const guard = opOf(near.w, 'guard');
  pin(e, 2, 1);
  pin(fodder, 2, 1);
  fodder.hp = 0;
  step(near.w, near.c);
  e.hp = 10000;
  pin(e, 2, 1);
  retreat(near.w, near.c, guard.id);
  assert.equal(e.hp, 16000);
  assert.equal(layers(e), 2);
  assert.equal(atkOf(e), 1080);
  const again = restoreSnapshot(takeSnapshot(near.w));
  assert.equal(stateHash(again), stateHash(near.w));
  const far = open({ whip: whipDef(), fodder: FODDER }, ['whip', 'fodder']);
  const w2 = ofKey(far.w, 'whip')[0];
  pin(w2, 2, 1);
  pin(ofKey(far.w, 'fodder')[0], 4, 1);
  hold(w2);
  deploy(far.w, far.c, 'guard', 1, 0);
  const farFodder = ofKey(far.w, 'fodder')[0];
  pin(w2, 2, 1);
  pin(farFodder, 4, 1);
  farFodder.hp = 0;
  step(far.w, far.c);
  w2.hp = 10000;
  pin(w2, 2, 1);
  retreat(far.w, far.c, opOf(far.w, 'guard').id);
  assert.equal(w2.hp, 10000);
  assert.equal(layers(w2), 0);
  assert.equal(atkOf(w2), 900);
});

test('[敌能-63] a neutral unit knocked down within 1.0 neither heals nor adds a layer; an enemy there does', () => {
  /** @param {boolean} neutral */
  const leave = (neutral) => {
    // ATK 0: an enemy attacks a neutral unit, and this one would kill the fodder before the log is armed
    const box = open({ whip: whipDef({ atk: 0 }), fodder: { ...FODDER, neutral } }, ['whip', 'fodder']);
    const e = ofKey(box.w, 'whip')[0];
    const fodder = ofKey(box.w, 'fodder')[0];
    pin(e, 2, 1);
    pin(fodder, 2, 1);
    hold(e);
    run(box.w, box.c, 1);
    fodder.hp = 0;
    run(box.w, box.c, 1);
    e.hp = 10000;
    run(box.w, box.c, 1);
    return { hp: e.hp, layers: layers(e), logged: (box.w.exits ?? []).length };
  };
  assert.deepEqual(leave(true), { hp: 10000, layers: 0, logged: 0 });
  assert.deepEqual(leave(false), { hp: 13000, layers: 1, logged: 1 });
});

test('[敌能-63] a knocked-down operator is healed on the next frame, not the frame it falls', () => {
  const { c, w } = open({ whip: whipDef() }, ['whip']);
  const e = ofKey(w, 'whip')[0];
  pin(e, 2, 1);
  hold(e);
  deploy(w, c, 'guard', 1, 3);
  const guard = opOf(w, 'guard');
  e.hp = 10000;
  guard.hp = 0;
  step(w, c);
  assert.equal(e.hp, 10000);
  assert.equal(layers(e), 0);
  pin(e, 2, 1);
  step(w, c);
  assert.equal(e.hp, 13000);
  assert.equal(layers(e), 1);
});

test('[敌能-63] a retreated summon inside 1.0 heals and adds a layer', () => {
  const { c, w } = open({ whip: whipDef() }, ['whip'], (cc) => {
    cc.operators.tentacle = {
      name: 'tentacle', position: 'MELEE', cost: 0, blockCnt: 1, baseAttackTime: 1, maxHp: 100, atk: 0, def: 0, res: 0,
      range: [{ row: 0, col: 0 }], respawnTime: 10, summoner: 'guard',
      summon: { deployLimit: 2, holdLimit: 3, supply: 2, occupy: 1, respawn: 'default' },
    };
  });
  const e = ofKey(w, 'whip')[0];
  pin(e, 2, 1);
  hold(e);
  e.hp = 10000;
  deploy(w, c, 'guard', 1, 0);
  deploy(w, c, 'tentacle', 1, 3);
  pin(e, 2, 1);
  e.hp = 10000;
  retreat(w, c, opOf(w, 'tentacle').id);
  assert.equal(e.hp, 13000);
  assert.equal(layers(e), 1);
});

test('[敌能-63] fifteen layers cap the attack at ×2.5; the sixteenth leave still heals', () => {
  const { c, w, e, fodder } = crowd(16);
  down(fodder.slice(0, 15));
  step(w, c);
  step(w, c);
  assert.equal(layers(e), 15);
  assert.equal(atkOf(e), 2250);
  e.hp = 10000;
  fodder[15].hp = 0;
  step(w, c);
  assert.equal(e.hp, 10000);
  step(w, c);
  assert.equal(e.hp, 13000);
  assert.equal(layers(e), 15);
  assert.equal(atkOf(e), 2250);
});

test('[敌能-63] death summons two 血珀 inside the 0.2 square on its route; 新生血裔 summons one; a fall still summons', () => {
  const born = open({ whip: whipDef(), seed: seedDef() }, ['whip']);
  const e = ofKey(born.w, 'whip')[0];
  pin(e, 2, 1);
  const route = e.route, leg = e.leg;
  e.hp = 0;
  step(born.w, born.c);
  const kids = ofKey(born.w, 'seed');
  nearTile(kids, 2, 1, route, leg);
  assert.equal(kids.length, 2);
  assert.equal(born.w.broods, undefined);
  const one = open({ fellow: fellowDef(), seed: seedDef() }, ['fellow']);
  const f = ofKey(one.w, 'fellow')[0];
  pin(f, 2, 1);
  f.hp = 0;
  step(one.w, one.c);
  nearTile(ofKey(one.w, 'seed'), 2, 1, f.route, f.leg);
  assert.equal(ofKey(one.w, 'seed').length, 1);
  const fell = open({ whip: whipDef(), seed: seedDef() }, ['whip']);
  const h = ofKey(fell.w, 'whip')[0];
  pin(h, 2, 1);
  fell.c.level.tiles[1][2] = { ...fell.c.level.tiles[1][2], key: 'tile_hole' };
  step(fell.w, fell.c);
  assert.equal(fell.w.units.includes(h), false);
  assert.equal(ofKey(fell.w, 'seed').length, 2);
  assert.equal(fell.w.broods, undefined);
});

test('[敌能-63] silence does not stop the death summon or the 血珀 drain', () => {
  const born = open({ whip: whipDef(), seed: seedDef() }, ['whip']);
  const e = ofKey(born.w, 'whip')[0];
  pin(e, 2, 1);
  assert.equal(status.applyStatus(e, 'silence', {}) !== null, true);
  assert.equal(attrs.statsOf(e).flags.silence, true);
  e.hp = 0;
  step(born.w, born.c);
  assert.equal(ofKey(born.w, 'seed').length, 2);
  const quiet = open({ seed: seedDef({ immune: ['stun', 'sleep', 'frozen', 'levitate'] }) }, ['seed']);
  const s = ofKey(quiet.w, 'seed')[0];
  assert.equal(status.applyStatus(s, 'silence', {}) !== null, true);
  assert.equal(attrs.statsOf(s).flags.silence, true);
  run(quiet.w, quiet.c, 29);
  assert.equal(s.hp, 3000);
  step(quiet.w, quiet.c);
  assert.equal(s.hp, 2700);
});

test('[敌能-63] 拷打者 hits for 580 unblocked and heals 3750', () => {
  const shot = open({ lash: whipDef({ name: 'lash', maxHp: 25000, atk: 1200, def: 1200 }) }, ['lash']);
  const e = ofKey(shot.w, 'lash')[0];
  pin(e, 2, 1);
  const ev = deploy(shot.w, shot.c, 'sniper', 2, 2);
  assert.equal(e.blockedBy, -1);
  assert.equal(hits(ev, e.id)[0].damage, 580);
  const healed = open({ lash: whipDef({ name: 'lash', maxHp: 25000, atk: 1200, def: 1200 }), fodder: FODDER }, ['lash', 'fodder']);
  const l = ofKey(healed.w, 'lash')[0];
  pin(l, 2, 1);
  pin(ofKey(healed.w, 'fodder')[0], 2, 1);
  hold(l);
  ofKey(healed.w, 'fodder')[0].hp = 0;
  step(healed.w, healed.c);
  l.hp = 10000;
  step(healed.w, healed.c);
  assert.equal(l.hp, 13750);
  assert.equal(layers(l), 1);
  assert.equal(atkOf(l), 1320);
});

test('[敌能-63] 血珀 is rooted, unblockable, unattacking and not displaced; 庇护 0% writes no taken multiplier', () => {
  const { c, w } = open({ seed: seedDef() }, ['seed']);
  const e = ofKey(w, 'seed')[0];
  const mark = e.buffs.find((b) => b.key === 'dseed');
  assert.ok(mark);
  assert.deepEqual(mark.flags, { root: true, noAttack: true, unblockable: true, noDisplace: true });
  assert.equal(mark.mods.physTakenMul, undefined);
  assert.equal(mark.mods.artsTakenMul, undefined);
  assert.equal(e.buffs.some((b) => b.key === 'root'), false);
  const s = attrs.statsOf(e);
  assert.equal(s.taunt, -2);
  assert.equal(s.immobile, true);
  assert.equal(s.flags.noAttack, true);
  assert.equal(displacement.displaceable(e), false);
  assert.equal(w.exits, undefined);
  pin(e, 2, 1);
  run(w, c, 15);
  assert.equal(e.x, 2);
  assert.equal(e.y, 1);
  assert.equal(e.hp, 3000);
  const ev = deploy(w, c, 'guard', 1, 2);
  assert.equal(e.blockedBy, -1);
  assert.equal(hits(ev, e.id).length, 0);
});

test('[敌能-63] 血珀 loses 10% of max HP each second as 生命流失 and is gone after ten', () => {
  const { c, w } = open({ seed: seedDef() }, ['seed']);
  const e = ofKey(w, 'seed')[0];
  status.applyStatus(e, 'invincible', {});
  /** @type {number[]} */
  const lost = [];
  bus.on(w, 'damaged', (ev) => { if (ev.target === e && ev.dmg.hpLoss === true) lost.push(ev.amount); });
  assert.equal(w.exits, undefined);
  run(w, c, 29);
  assert.equal(e.hp, 3000);
  assert.equal(w.frame, 30);
  step(w, c);
  assert.equal(e.hp, 2700);
  assert.equal(w.frame, 31);
  assert.deepEqual(lost, [300]);
  run(w, c, 270);
  assert.equal(w.units.includes(e), false);
  assert.equal(w.frame, 301);
  assert.equal(lost.length, 10);
  assert.ok(lost.every((n) => n === 300));
  assert.equal(w.exits, undefined);
});

test('[敌能-63] only this Attack, Summon and Passive shape is covered; the others do nothing here', () => {
  const gaps = (/** @type {any} */ def) => uncoveredAbilities([def]);
  assert.deepEqual(gaps(whipDef()), []);
  assert.deepEqual(gaps(seedDef()), []);
  assert.deepEqual(gaps(fellowDef()), ['DamageUp', 'vampire']);
  assert.deepEqual(gaps(shieldDef()), ['Summon']);
  assert.deepEqual(gaps(attackOnly({ 'attack@atk_scale': 2 })), ['Attack']);
  assert.deepEqual(gaps(attackOnly({ 'attack@max_target': 3 })), ['Attack']);
  assert.deepEqual(gaps(attackOnly({ atk_scale: 1 })), ['Attack']);
  // 固海凿石者's shape is 敌能-87's (stonecutter.js); one more key is no shape
  assert.deepEqual(gaps(attackOnly({ duration: 10, def: 200 })), []);
  assert.deepEqual(gaps(attackOnly({ duration: 10, def: 200, atk: 1 })), ['Attack']);
  assert.deepEqual(gaps(passiveOnly({ damage_resistance: 0.3, hp_ratio: 0.1 })), ['Passive']);
  assert.deepEqual(gaps(passiveOnly({ hp_ratio: 0.04 })), ['Passive']);
  assert.deepEqual(gaps(passiveOnly({ damage_resistance: 0, hp_ratio: 0.1, duration: 1 })), ['Passive']);
  assert.deepEqual(gaps(named('s', { Summon: { enemy_key: 'enemy_1344_ddlamb' } })), ['Summon']);
  assert.deepEqual(gaps(named('d', { DamageUp: { atk_scale: 2.5 } })), ['DamageUp']);
  assert.deepEqual(gaps(named('v', { vampire: { heal_scale: 2.2 } })), ['vampire']);
  const odd = open({ odd: attackOnly({ 'attack@atk_scale': 2 }) }, ['odd']);
  const e = ofKey(odd.w, 'odd')[0];
  pin(e, 2, 1);
  const ev = deploy(odd.w, odd.c, 'sniper', 2, 2);
  assert.equal(hits(ev, e.id)[0].damage, 880);
  assert.equal(odd.w.exits, undefined);
  const shield = open({ shield: shieldDef(), seed: seedDef() }, ['shield']);
  const g = ofKey(shield.w, 'shield')[0];
  g.hp = 0;
  step(shield.w, shield.c);
  assert.equal(ofKey(shield.w, 'seed').length, 0);
});
