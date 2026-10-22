// 萨卡兹悖谬暴虐兵 (docs/spec/foes.md 敌能-55). The record is built here: the enemy is not in a level yet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, buffs, damage, blocking } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras, uncoveredAbilities, withoutIncomplete } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

/** @type {[string, number, number, string, number][]} */
const SPOTS = [
  ['guard', 1, 2, 'MELEE', 3],
  ['west', 1, 1, 'MELEE', 0],
  ['east', 1, 3, 'MELEE', 0],
  ['north', 0, 2, 'RANGED', 0],
  ['south', 2, 2, 'RANGED', 0],
  ['diag', 0, 3, 'RANGED', 0],
  ['wall', 2, 3, 'RANGED', 0],
];

/** Flags on the cross: 迷彩, 隐匿, 不可选中, 起飞, and 无敌 off the cross's damage. @type {Record<string, { key: string, flags: Record<string, boolean> }>} */
const MARK = {
  west: { key: 'camo', flags: { camou: true } },
  east: { key: 'hide', flags: { stealth: true } },
  north: { key: 'unt', flags: { untargetable: true } },
  south: { key: 'up', flags: { liftoff: true } },
  wall: { key: 'safe', flags: { invincible: true } },
};

/**
 * The two read enemies, with the page's block cost and the once marker on the data's blackboards.
 * @param {string} key @param {number} atk @param {number} [hp] @param {readonly string[]} [immune]
 */
function tyrant(key, atk, hp = 20000, immune = ['silence']) {
  return withFoeExtras(key, {
    name: key, maxHp: hp, atk, def: 0, res: 0, moveSpeed: 0.8, baseAttackTime: 2.9, immune: [...immune],
    talents: { AOEAttack: { atk_scale: 1.5 } },
    skills: [{ key: 'AOEAttack', cooldown: 0, initCooldown: 0, sp: 1, bb: { atk_scale: 1.5 } }],
  });
}

/** @param {Record<string, any>} enemies @param {any[]} spawns @param {(c: any) => void} [tweak] */
function open(enemies, spawns, tweak) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = enemies;
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave(spawns)];
  c.level.options = { ...c.level.options, characterLimit: 8, initialCost: 99, maxCost: 99, costIncreaseTime: 1000 };
  for (const op of Object.values(c.operators)) Object.assign(op, { cost: 0, maxHp: 1e6, atk: 0, def: 0 });
  tweak?.(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  return { c, w };
}

/** @param {World} w @param {any} c @param {number} n */
function run(w, c, n) {
  /** @type {any[]} */
  const out = [];
  for (let i = 0; i < n; i++) for (const ev of step(w, c)) out.push(ev);
  return out;
}

/** @param {World} w @param {string} key @returns {Unit[]} */
const ofKey = (w, key) => w.units.filter((u) => u.key === key);
/** @param {Unit} u @param {number} x @param {number} y */
const pin = (u, x, y) => { u.x = x; u.y = y; status.applyStatus(u, 'root', {}); };
/** @param {World} w @param {any} c @param {string} op @param {number} row @param {number} col */
const deploy = (w, c, op, row, col) => step(w, c, [[0, { type: 'deploy', op, row, col, dir: 0 }]]);
/** @param {World} w @param {string} key @returns {Unit} */
const opOf = (w, key) => /** @type {Unit} */ (w.units.find((u) => u.key === key));

/**
 * A guard on the first road tile, and optionally a weight-1 slime spawned ahead of the tyrant.
 * @param {number} blockCnt @param {boolean} withSlime
 */
function road(blockCnt, withSlime) {
  const key = 'enemy_1320_wdrrl';
  /** @type {Record<string, any>} */
  const enemies = { [key]: tyrant(key, 0) };
  const spawns = [spawnAt(0, key)];
  if (withSlime) {
    enemies.slime = { name: 'slime', maxHp: 5000, atk: 0, def: 0, res: 0, moveSpeed: 1 };
    spawns.unshift(spawnAt(0, 'slime'));
  }
  const { c, w } = open(enemies, spawns, (cc) => { cc.operators.guard.blockCnt = blockCnt; });
  deploy(w, c, 'guard', 1, 0);
  return { c, w, e: ofKey(w, key)[0], g: opOf(w, 'guard'), slime: withSlime ? ofKey(w, 'slime')[0] : null };
}

/**
 * Walks until the route's wait is over and the enemy is past the guard, noting a visit inside the block radius.
 * @param {number} blockCnt @param {boolean} withSlime
 */
function walked(blockCnt, withSlime) {
  const field = road(blockCnt, withSlime);
  let blocked = false, inside = false;
  for (let i = 0; i < 280; i++) {
    step(field.w, field.c);
    if (field.e.blockedBy >= 0) blocked = true;
    const dx = field.e.x - field.g.x, dy = field.e.y - field.g.y;
    if (field.e.blockedBy < 0 && dx * dx + dy * dy < 0.49) inside = true;
  }
  return { ...field, blocked, inside };
}

/** Deploys the cross around a pinned tyrant and holds its attack for the flags. @param {string} key @param {number} atk @param {number} hp @param {readonly string[]} [immune] */
function stand(key, atk, hp, immune) {
  const { c, w } = open({ [key]: tyrant(key, atk, hp, immune) }, [spawnAt(0, key)], (cc) => {
    for (const [name, , , position, blockCnt] of SPOTS) {
      cc.operators[name] = { name, position, cost: 0, blockCnt, baseAttackTime: 1, maxHp: 1e6, atk: 0, def: 0, res: 0, range: [{ row: 0, col: 0 }] };
    }
  });
  const e = ofKey(w, key)[0];
  pin(e, 2, 1);
  e.atkCd = 30;
  step(w, c, SPOTS.map(([name, row, col]) => [0, { type: 'deploy', op: name, row, col, dir: 0 }]));
  for (const [name] of SPOTS) {
    const mark = MARK[name];
    if (mark) buffs.addBuff(opOf(w, name), buffs.makeBuff(mark));
  }
  return { c, w, e };
}

/** Damage the tyrant dealt to each spot on one list of events. @param {any[]} ev @param {number} id @param {Record<string, number>} ids */
function loss(ev, id, ids) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const [name] of SPOTS) out[name] = ev.filter((x) => x.type === 'hit' && x.id === id && x.target === ids[name]).reduce((n, x) => n + x.damage, 0);
  return out;
}

/**
 * The first attack, then one interval of later hits. Silence is applied first, so an immune enemy still splashes.
 * @param {string} key @param {number} atk @param {number} hp @param {readonly string[]} [immune]
 */
function strike(key, atk, hp, immune) {
  const { c, w, e } = stand(key, atk, hp, immune);
  status.applyStatus(e, 'silence', {});
  const silenced = !!attrs.statsOf(e).flags.silence;
  e.atkCd = 0;
  const first = step(w, c);
  const later = run(w, c, attrs.intervalFrames(e.base.bat, attrs.statsOf(e).aspd));
  /** @type {Record<string, number>} */
  const ids = {};
  for (const [name] of SPOTS) ids[name] = opOf(w, name).id;
  return { silenced, blocked: e.blockedBy === ids.guard, load: blocking.blockLoad(w, opOf(w, 'guard')), first: loss(first, e.id, ids), later: loss(later, e.id, ids), e, w, c };
}

test('[敌能-55] block 3 holds it and costs 3 slots; block 2 lets it walk through the radius', () => {
  const held = walked(3, false);
  assert.equal(attrs.statsOf(held.e).blockCnt, 3);
  assert.equal(held.blocked, true);
  assert.equal(blocking.blockLoad(held.w, held.g), 3);
  assert.ok(held.e.x < 0.5, 'it stops on the guard');
  const past = walked(2, false);
  assert.equal(past.blocked, false);
  assert.equal(past.inside, true);
  assert.ok(past.e.x > 2, 'two slots do not hold a cost of 3');
});

test('[敌能-55] two free slots let it pass; freeing the held enemy blocks it on the next check', () => {
  const past = walked(3, true);
  assert.equal(past.slime && past.slime.blockedBy, past.g.id);
  assert.equal(past.blocked, false);
  assert.equal(past.inside, true);
  assert.ok(past.e.x > 2);
  assert.equal(blocking.blockLoad(past.w, past.g), 1);
  const again = road(3, true);
  pin(again.e, again.g.x, again.g.y);
  pin(/** @type {Unit} */ (again.slime), again.g.x, again.g.y);
  step(again.w, again.c);
  assert.equal(/** @type {Unit} */ (again.slime).blockedBy, again.g.id);
  assert.equal(again.e.blockedBy, -1);
  assert.equal(blocking.blockLoad(again.w, again.g), 1);
  damage.dealDamage(again.w, null, /** @type {Unit} */ (again.slime), { type: 'true', amount: 1e9 });
  step(again.w, again.c);
  step(again.w, again.c);
  assert.equal(again.e.blockedBy, again.g.id);
  assert.equal(blocking.blockLoad(again.w, again.g), 3);
});

test('[敌能-55] the first attack is a 150% cross through 迷彩 and 无法选择; later attacks are ordinary', () => {
  const s = strike('enemy_1320_wdrrl', 800, 20000);
  assert.equal(s.silenced, false);
  assert.equal(s.blocked, true);
  assert.equal(s.load, 3);
  for (const name of ['guard', 'west', 'east', 'north', 'south']) assert.equal(s.first[name], 1200, name);
  assert.equal(s.first.diag, 0);
  assert.equal(s.first.wall, 0);
  assert.equal(s.later.guard, 800);
  for (const name of ['west', 'east', 'north', 'south', 'diag', 'wall']) assert.equal(s.later[name], 0, name);
});

test('[敌能-55] 兵长: the same splash at 150% of its own attack', () => {
  const s = strike('enemy_1320_wdrrl_2', 1200, 25000);
  assert.equal(s.first.guard, 1800);
  assert.equal(s.first.east, 1800);
  assert.equal(s.first.south, 1800);
  assert.equal(s.later.guard, 1200);
  assert.equal(s.load, 3);
});

test('[敌能-55] silence skips the splash without spending it when the enemy is not immune', () => {
  const { c, w, e } = stand('enemy_1320_wdrrl', 800, 20000, []);
  status.applyStatus(e, 'silence', {});
  assert.equal(attrs.statsOf(e).flags.silence, true);
  e.atkCd = 0;
  const blocked = step(w, c);
  const guard = opOf(w, 'guard'), east = opOf(w, 'east');
  const hits = blocked.filter((ev) => ev.type === 'hit' && ev.id === e.id);
  assert.deepEqual(hits.map((ev) => ev.target), [guard.id]);
  assert.equal(guard.maxHp - guard.hp, 800);
  assert.equal(east.hp, east.maxHp);
  buffs.removeBuff(e, 'silence');
  e.atkCd = 0;
  const freed = step(w, c);
  const splash = freed.filter((ev) => ev.type === 'hit' && ev.id === e.id);
  assert.equal(splash.length, 5);
  assert.equal(guard.maxHp - guard.hp, 800 + 1200);
  assert.equal(east.maxHp - east.hp, 1200);
});

test('[敌能-55] the other AOEAttack skills stay uncovered and do not splash', () => {
  const others = [
    { skills: [{ key: 'AOEAttack', bb: { atk_scale: 1 } }] },
    { skills: [{ key: 'AOEAttack', bb: { atk_scale: 2.5 } }] },
    { skills: [{ key: 'AOEAttack', bb: { max_target: 1, range_radius: 2, atk_scale: 4 } }] },
  ];
  assert.deepEqual(uncoveredAbilities(others.map((e) => /** @type {any} */ (e))), ['AOEAttack']);
  const read = tyrant('enemy_1320_wdrrl', 800);
  const cap = tyrant('enemy_1320_wdrrl_2', 1200, 25000);
  assert.deepEqual(uncoveredAbilities([read, cap]), []);
  assert.equal(read.talents?.AOEAttack?.block, 3);
  assert.equal(read.talents?.AOEAttack?.once, 1);
  assert.equal(read.skills?.[0]?.bb.once, 1);
  assert.equal(withoutIncomplete({
    name: 'x', maxHp: 1, atk: 1, def: 0, res: 0, moveSpeed: 1,
    skills: [{ key: 'AOEAttack', cooldown: 0, initCooldown: 0, bb: { atk_scale: 2.5 } }],
  }).skills?.length, 0);
  const key = 'enemy_2092_skzamy';
  const { c, w } = open({
    [key]: { name: key, maxHp: 5000, atk: 400, def: 0, res: 0, moveSpeed: 0.5, baseAttackTime: 2.9, skills: [{ key: 'AOEAttack', cooldown: 0, initCooldown: 0, sp: 0, bb: { atk_scale: 2.5 } }] },
  }, [spawnAt(0, key)], (cc) => {
    cc.operators.guard.blockCnt = 2;
    cc.operators.east = { name: 'east', position: 'MELEE', cost: 0, blockCnt: 0, baseAttackTime: 1, maxHp: 1e6, atk: 0, def: 0, res: 0, range: [{ row: 0, col: 0 }] };
  });
  const e = ofKey(w, key)[0];
  pin(e, 2, 1);
  e.atkCd = 30;
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 2, dir: 0 }], [0, { type: 'deploy', op: 'east', row: 1, col: 3, dir: 0 }]]);
  e.atkCd = 0;
  const ev = step(w, c);
  const guard = opOf(w, 'guard'), east = opOf(w, 'east');
  assert.equal(guard.maxHp - guard.hp, 400);
  assert.equal(east.hp, east.maxHp);
  assert.equal(ev.filter((x) => x.type === 'hit' && x.id === e.id).length, 1);
});
