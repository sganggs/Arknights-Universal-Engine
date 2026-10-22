// 赛场补给车 / “天车散花”赛场补给车 (docs/spec/foes.md 敌能-86): a soda bottle every 1.5 s, true damage 2.5 s later.
// The same boomb keys without the page marker stay uncovered (关卡-2). 暴鸰's move_speed shape is 敌能-56.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, buffs, bus } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import act07 from '../data/levels/act1multi_07.json' with { type: 'json' };
import fort from '../data/levels/act1multi_fortress_rm01.json' with { type: 'json' };
import { foeBehaviors, withFoeExtras, uncoveredAbilities } from '../src/foes.js';
import { bombdOwns } from '../src/bombd.js';

/** @typedef {import('@aue/sim').World} World */
/** @typedef {import('@aue/sim').Unit} Unit */
/** @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const HP = 1e6;
const BX = 0.25;
const BY = 2;
const DAMAGE = 1440;

/** @param {string} name */
function opOf(name) {
  return {
    name, position: 'MELEE', cost: 0, blockCnt: 1, baseAttackTime: 1, maxHp: HP, atk: 0, def: 3000, res: 90, tauntLevel: 0,
    range: [{ row: 0, col: 0 }],
  };
}

/** @param {string} name @param {boolean} neutral */
function stander(name, neutral) {
  return { name, maxHp: HP, atk: 0, def: 3000, res: 90, moveSpeed: 0, ...(neutral ? { neutral: true } : {}) };
}

/** @param {number} atk @returns {EnemyDef} */
function defOf(atk) {
  if (atk === 800) return /** @type {EnemyDef} */ (/** @type {any} */ (act07).enemies.enemy_4004_muvltr);
  return {
    name: '“天车散花”赛场补给车', maxHp: 40000, atk: 1000, def: 600, res: 50, moveSpeed: 3, baseAttackTime: 1, rangeRadius: -1,
    applyWay: 'NONE', motion: 'WALK', massLevel: 2,
    skills: [{ key: 'boomb', cooldown: 1.5, initCooldown: 0, sp: 0, bb: { atk_scale: 1.8, projectile_life_time: 2.5, projectile_range: 1 } }],
  };
}

/**
 * The tiny level with the cart (and any extra enemies) spawned off the tile centre. Not stepped.
 * @param {number} atk @param {Record<string, object>} [extras]
 */
function content(atk, extras = {}) {
  const key = atk === 1000 ? 'enemy_4004_muvltr_2' : 'enemy_4004_muvltr';
  const c = /** @type {any} */ (tinyContent());
  c.level.routes[0].spawnOffset = { x: BX, y: 0 };
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, characterLimit: 9 };
  c.enemies = { [key]: withFoeExtras(key, defOf(atk)), ...extras };
  c.behaviors = { foes: foeBehaviors };
  c.level.waves = [oneWave([spawnAt(0, key), ...Object.keys(extras).map((k) => spawnAt(0, k))])];
  return { c, key };
}

/** One step: the cart has dropped its first bottle. @param {number} atk */
function wake(atk) {
  const { c, key } = content(atk);
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = w.units.find((u) => u.key === key);
  assert.ok(e);
  return { c, w, e };
}

/** Frames among the next `n` steps on which a bottle was queued. @param {World} w @param {any} c @param {number} n */
function added(w, c, n) {
  /** @type {number[]} */
  const frames = [];
  for (let i = 0; i < n; i++) {
    const before = w.blasts.length;
    step(w, c);
    if (w.blasts.length > before) frames.push(w.frame - 1);
  }
  return frames;
}

/** @param {World} w @param {any} c @param {number} n */
function run(w, c, n) {
  /** @type {any[]} */
  const out = [];
  for (let i = 0; i < n; i++) for (const ev of step(w, c)) out.push({ ...ev, f: w.frame - 1 });
  return out;
}

/** @param {'silence' | 'stun'} name */
function heldOff(name) {
  const { c, w, e } = wake(800);
  e.x = BX;
  e.y = BY;
  status.applyStatus(e, 'root', {});
  status.applyStatus(e, name, {});
  assert.deepEqual(added(w, c, 50), [], name);
  assert.equal(e.ab['boomb.cd'], 0, name);
  buffs.removeBuff(e, name);
  step(w, c);
  assert.equal(w.blasts.length, 2, name);
  assert.equal(e.ab['boomb.cd'], 44, name);
}

test('[敌能-86] a bottle at 0s and then every 1.5s, left at the cart point and not the tile centre', () => {
  const { c, w, e } = wake(800);
  const first = w.blasts[0];
  assert.ok(first);
  assert.equal(first.x, BX);
  assert.equal(first.y, BY);
  assert.equal(first.left, 74);
  assert.ok(e.x !== BX || e.y !== BY);
  e.x = 1.25;
  e.y = 1.5;
  status.applyStatus(e, 'root', {});
  assert.deepEqual(added(w, c, 90), [45, 90]);
  assert.ok(w.blasts.length > 0);
  assert.ok(w.blasts.every((b) => b.x === 1.25 && b.y === 1.5));
});

test('[敌能-86] [敌能-3] 2.5s later, 180% ATK true damage inside 1.0: ours, enemies, devices, self; not past 1.0, not 隐匿', () => {
  const { c, key } = content(800, { foe: stander('foe', false), civ: stander('civ', true) });
  c.operators = { edge: opOf('edge'), past: opOf('past'), fly: opOf('fly'), hide: opOf('hide'), camou: opOf('camou') };
  c.devices = { wall: { name: 'd', maxHp: HP, atk: 0, def: 3000, res: 90, blockCnt: 0, baseAttackTime: 1, side: 'ENEMY' } };
  c.level.predefines = [{ alias: 'wall#1', key: 'wall', hidden: false, row: 2, col: 0, dir: 'UP' }];
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = w.units.find((u) => u.key === key);
  assert.ok(e);
  assert.equal(w.blasts[0]?.x, BX);
  assert.equal(w.blasts[0]?.y, BY);
  buffs.addBuff(e, buffs.makeBuff({ key: 'up', mods: { atkPct: 1 } }));
  assert.ok(attrs.statsOf(e).atk > 800);
  e.x = BX;
  e.y = BY;
  status.applyStatus(e, 'root', {});
  const foe = w.units.find((u) => u.key === 'foe');
  const civ = w.units.find((u) => u.key === 'civ');
  const wall = w.units.find((u) => u.key === 'wall');
  assert.ok(foe && civ && wall);
  foe.x = 0.5;
  foe.y = BY;
  civ.x = 0;
  civ.y = BY;
  wall.x = 1;
  wall.y = BY;
  // A written move speed of 0 is still at least 0.1 (属性-3). Root them so they are still at these points at 2.5 s.
  status.applyStatus(foe, 'root', {});
  status.applyStatus(civ, 'root', {});
  step(w, c, [
    [0, { type: 'deploy', op: 'edge', row: 1, col: 0, dir: 0 }],
    [0, { type: 'deploy', op: 'past', row: 1, col: 1, dir: 0 }],
    [0, { type: 'deploy', op: 'fly', row: 1, col: 2, dir: 0 }],
    [0, { type: 'deploy', op: 'hide', row: 1, col: 3, dir: 0 }],
    [0, { type: 'deploy', op: 'camou', row: 1, col: 4, dir: 0 }],
  ]);
  /** @type {Record<string, Unit>} */
  const by = {};
  for (const u of w.units) if (u.owner >= 0) by[u.key] = u;
  // Blocking reads a blocker's tile as (y, x) with no rounding, so y stays a whole row. x may sit between columns.
  by.edge.x = 1.25;
  by.edge.y = BY;
  by.past.x = 1.5;
  by.past.y = BY;
  by.fly.x = BX;
  by.fly.y = BY;
  by.hide.x = 0.75;
  by.hide.y = BY;
  by.camou.x = 0;
  by.camou.y = BY;
  buffs.addBuff(by.fly, buffs.makeBuff({ key: 'hover', flags: { hover: true } }));
  buffs.addBuff(by.hide, buffs.makeBuff({ key: 'stealth', flags: { stealth: true } }));
  buffs.addBuff(by.camou, buffs.makeBuff({ key: 'camou', flags: { camou: true } }));
  /** @type {string[]} */
  const types = [];
  bus.on(w, 'hit', (k) => { if (k.credit === e) types.push(k.dmg.type); });
  const ev = run(w, c, 73);
  const hits = ev.filter((x) => x.type === 'hit');
  assert.deepEqual(ev.filter((x) => x.type === 'blast').map((x) => [x.f, x.x, x.y]), [[74, BX, BY]]);
  assert.equal(hits.length, 7);
  assert.ok(hits.every((x) => x.f === 74 && x.damage === DAMAGE && x.id === e.id));
  assert.deepEqual(types, ['true', 'true', 'true', 'true', 'true', 'true', 'true']);
  assert.equal(HP - by.edge.hp, DAMAGE);
  assert.equal(HP - by.past.hp, 0);
  assert.equal(HP - by.fly.hp, DAMAGE);
  assert.equal(HP - by.hide.hp, 0);
  assert.equal(HP - by.camou.hp, DAMAGE);
  assert.equal(HP - foe.hp, DAMAGE);
  assert.equal(HP - civ.hp, DAMAGE);
  assert.equal(HP - wall.hp, DAMAGE);
  assert.equal(e.maxHp - e.hp, DAMAGE);
});

test('[敌能-86] “天车散花”赛场补给车 deals 180% of its own 1000 ATK', () => {
  const { c, w, e } = wake(1000);
  e.x = BX;
  e.y = BY;
  status.applyStatus(e, 'root', {});
  c.operators.guard = { ...opOf('guard'), blockCnt: 0 };
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const g = w.units.find((u) => u.key === 'guard');
  assert.ok(g);
  g.x = BX;
  g.y = BY;
  const ev = run(w, c, 73);
  const hits = ev.filter((x) => x.type === 'hit');
  assert.equal(hits.length, 2);
  assert.ok(hits.every((x) => x.damage === 1800 && x.f === 74));
  assert.equal(e.maxHp - e.hp, 1800);
  assert.equal(HP - g.hp, 1800);
});

test('[敌能-86] silence and stun hold the next bottle and do not spend it; fear and 失衡 still drop one', () => {
  heldOff('silence');
  heldOff('stun');
  const fear = wake(800);
  fear.e.x = BX;
  fear.e.y = BY;
  status.applyStatus(fear.e, 'root', {});
  status.applyStatus(fear.e, 'fear', {});
  assert.equal(attrs.statsOf(fear.e).flags.fear, true);
  assert.deepEqual(added(fear.w, fear.c, 45), [45]);
  const slide = wake(800);
  slide.e.x = BX;
  slide.e.y = BY;
  status.applyStatus(slide.e, 'root', {});
  added(slide.w, slide.c, 44);
  slide.e.slide = { vx: 0, vy: 0, hard: 30 };
  step(slide.w, slide.c);
  assert.equal(slide.w.blasts.length, 2);
  assert.ok(slide.e.slide);
});

test('[敌能-86] the amount is the ATK at the drop, and the hit is sourceless once the cart has left', () => {
  const { c, w, e } = wake(800);
  const id = e.id;
  e.x = 5;
  e.y = 0;
  status.applyStatus(e, 'root', {});
  c.operators.guard = { ...opOf('guard'), blockCnt: 0 };
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const g = w.units.find((u) => u.key === 'guard');
  assert.ok(g);
  g.x = BX;
  g.y = BY;
  // Frame 0 already ran. The deploy was frame 1. Frames 2..72 leave the bottle at 2 frames; frame 73 removes the cart
  // before the projectile phase, and frame 74 is the blast.
  run(w, c, 71);
  e.hp = 0;
  const dying = step(w, c);
  assert.equal(dying.some((x) => x.type === 'hit' || x.type === 'blast'), false);
  assert.equal(w.units.some((u) => u.id === id), false);
  const ev = run(w, c, 1);
  const hits = ev.filter((x) => x.type === 'hit');
  assert.deepEqual(hits.map((x) => [x.f, x.id, x.target, x.damage]), [[74, -1, g.id, DAMAGE]]);
  assert.equal(HP - g.hp, DAMAGE);
});

test('[敌能-86] noAttack and unblockable: it does not swing, and a blocker on it is not blocking', () => {
  const { c, w, e } = wake(800);
  assert.equal(attrs.statsOf(e).flags.noAttack, true);
  assert.equal(attrs.statsOf(e).flags.unblockable, true);
  e.x = 1;
  e.y = 1;
  status.applyStatus(e, 'root', {});
  c.operators.guard = { ...c.operators.guard, cost: 0, atk: 0 };
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const g = w.units.find((u) => u.key === 'guard');
  assert.ok(g);
  g.x = e.x;
  g.y = e.y;
  const ev = run(w, c, 40);
  assert.equal(e.blockedBy, -1);
  assert.equal(ev.filter((x) => x.type === 'attack' && x.id === e.id).length, 0);
  assert.equal(ev.filter((x) => x.type === 'hit' && x.id === e.id).length, 0);
});

/** The unread boomb shape: same three keys, other numbers, no page marker. @param {string} name @returns {EnemyDef} */
function supplier(name) {
  return {
    name, maxHp: 1000, atk: 100, def: 0, res: 0, moveSpeed: 1,
    skills: [{ key: 'boomb', cooldown: 3, initCooldown: 0, sp: 0, bb: { atk_scale: 1, projectile_life_time: 3, projectile_range: 0.6 } }],
  };
}

test('[敌能-86] [敌能-56] [关卡-2] the marker covers the two carts; the other 补给员 and 暴鸰\'s shape stay as they are', () => {
  const cart = /** @type {EnemyDef} */ (/** @type {any} */ (act07).enemies.enemy_4004_muvltr);
  assert.equal(uncoveredAbilities([cart]).includes('boomb'), true);
  assert.equal(uncoveredAbilities([withFoeExtras('enemy_4004_muvltr', cart)]).includes('boomb'), false);
  const gaps = uncoveredAbilities(Object.entries(/** @type {any} */ (act07).enemies).map(([k, e]) => withFoeExtras(k, /** @type {EnemyDef} */ (e))));
  assert.equal(gaps.includes('boomb'), false);
  const variant = defOf(1000);
  assert.equal(uncoveredAbilities([variant]).includes('boomb'), true);
  assert.equal(withFoeExtras('enemy_4004_muvltr_2', variant).skills?.[0]?.bb.soda, 1);
  assert.equal(uncoveredAbilities([withFoeExtras('enemy_4004_muvltr_2', variant)]).includes('boomb'), false);
  const unread = [
    ['enemy_4006_mumole', '沙地兽补给员'], ['enemy_4006_mumole_2', '“雨露均沾”沙地兽补给员'],
    ['enemy_4008_mucat', '重锤补给员'], ['enemy_4008_mucat_2', '“横冲直撞”重锤补给员'],
    ['enemy_4011_musqhd', '鼷兽补给箱'], ['enemy_4009_murgby', '铁头前锋'], ['enemy_4010_mubsbl', '长臂投手'],
  ];
  for (const [key, name] of unread) {
    const e = withFoeExtras(key, supplier(name));
    assert.equal(e.skills?.[0]?.bb.soda, undefined, key);
    assert.equal(uncoveredAbilities([e]).includes('boomb'), true, key);
  }
  for (const key of ['enemy_4009_murgby', 'enemy_4009_murgby_2', 'enemy_4010_mubsbl', 'enemy_4010_mubsbl_2']) {
    const raw = /** @type {EnemyDef} */ (/** @type {any} */ (fort).enemies[key]);
    assert.equal(uncoveredAbilities([withFoeExtras(key, raw)]).includes('boomb'), true, key);
  }
  assert.equal(bombdOwns('boomb', { move_speed: 2 }), true);
  assert.equal(bombdOwns('boomb', { move_speed: 2, soda: 1, atk_scale: 1.8, projectile_life_time: 2.5, projectile_range: 1 }), true);
  assert.equal(bombdOwns('boomb', { atk_scale: 1.8, projectile_life_time: 2.5, projectile_range: 1 }), false);
  assert.equal(bombdOwns('other', {}), true);
  const { c } = content(800);
  c.enemies.mumole = supplier('沙地兽补给员');
  c.level.waves = [oneWave([spawnAt(0, 'mumole')])];
  const bare = createWorld(c, { seed: 1, players: 1 });
  run(bare, c, 50);
  const mole = bare.units.find((u) => u.key === 'mumole');
  assert.ok(mole);
  assert.equal(bare.blasts.length, 0);
  assert.equal(attrs.statsOf(mole).flags.noAttack, undefined);
});
