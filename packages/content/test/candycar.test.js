// 寻路者甜品商 calls a candy cart; a blocked cart becomes a bomb (docs/spec/foes.md 敌能-82).
// Records are act1multi_07's. moveSpeed 0 is a fixture so a cart does not walk off the tile under test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, status, elements, buffs, KIND } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras, uncoveredAbilities } from '../src/foes.js';
import { CART_OF } from '../src/candycar.js';
import lv from '../data/levels/act1multi_07.json' with { type: 'json' };

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */
/** @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const DEALER = 'enemy_1217_rescar';
const FAMOUS = 'enemy_1217_rescar_2';
const CART = 'enemy_1218_bomscr';
const FINE = 'enemy_1218_bomscr_2';
const WITCH = 'enemy_1089_ltlntc';
const MASTER = 'enemy_1089_ltlntc_2';
const ATK = 'attack@s2mode_boom_atk';
const BURN = 'attack@s2mode_ep_fire_damage';
const TRAP = 'attack@s2mode_boom_atk_totrap';

/** Blocker on the cart, five ground neighbours, one levitated neighbour, one operator two tiles away. */
const SEATS = /** @type {[string, number, number][]} */ ([
  ['guard', 1, 2], ['g1', 1, 1], ['g3', 1, 3], ['sniper', 0, 2],
  ['s3', 0, 3], ['s2', 2, 2], ['s4', 2, 3], ['out', 1, 4],
]);
const HIT = /** @type {[number, number][]} */ ([[1, 2], [1, 1], [1, 3], [0, 3], [2, 2], [2, 3]]);

/** @type {Record<string, EnemyDef>} */
const enemies = /** @type {Record<string, EnemyDef>} */ (lv.enemies);
/** @param {string} key @returns {EnemyDef} */
const record = (key) => enemies[key];

/** @param {Unit | undefined} u @returns {Unit} */
function must(u) {
  if (!u) throw new Error('missing unit');
  return u;
}

/** @param {World} w @param {any} c @param {number} n */
function frames(w, c, n) {
  /** @type {any[]} */
  const out = [];
  for (let i = 0; i < n; i++) for (const ev of step(w, c)) out.push({ ...ev, f: w.frame - 1 });
  return out;
}

/** @param {any[]} ev @param {string} key */
const spawnedAt = (ev, key) => ev.filter((e) => e.type === 'spawn' && e.key === key).map((e) => e.f);

/** @param {string} dealer @param {string} cart */
function summonWorld(dealer, cart) {
  const c = tinyContent();
  const slow = (/** @type {string} */ k) => ({ ...withFoeExtras(k, record(k)), moveSpeed: 0 });
  c.enemies = { [dealer]: slow(dealer), [cart]: slow(cart) };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, dealer)])];
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  return { c, w, e: must(w.units.find((u) => u.key === dealer)) };
}

/** @param {any} c @param {number} def */
function dress(c, def) {
  const soft = { cost: 0, maxHp: 1e6, atk: 0, def: 0, res: 0 };
  Object.assign(c.operators.guard, soft, { def });
  Object.assign(c.operators.sniper, soft);
  for (const id of ['g1', 'g3', 'out']) c.operators[id] = { ...c.operators.guard, name: id };
  for (const id of ['s2', 's3', 's4']) c.operators[id] = { ...c.operators.sniper, name: id };
}

/** The cart stands on the road. A neutral stands on one of the eight tiles. @param {string} key @param {{ cd: number, def: number }} extra */
function field(key, extra) {
  const c = tinyContent();
  c.enemies = {
    [key]: { ...withFoeExtras(key, record(key)), moveSpeed: 0 },
    bystander: { name: 'bystander', maxHp: 1e6, atk: 0, def: 0, res: 0, moveSpeed: 0, neutral: true },
  };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, key), spawnAt(0, 'bystander')])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 12 };
  dress(c, extra.def);
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const cart = must(w.units.find((u) => u.key === key));
  cart.x = 2;
  cart.y = 1;
  cart.atkCd = extra.cd;
  status.applyStatus(cart, 'root', {});
  const neutral = must(w.units.find((u) => u.key === 'bystander'));
  neutral.x = 1;
  neutral.y = 0;
  status.applyStatus(neutral, 'root', {});
  return { c, w, cart, neutral };
}

/** @param {World} w @param {any} c @param {[string, number, number][]} seats @returns {any[]} */
function deploy(w, c, seats) {
  return step(w, c, seats.map(([op, row, col]) => [0, { type: 'deploy', op, row, col, dir: 0 }]));
}

/** @param {World} w @param {number} row @param {number} col */
function at(w, row, col) {
  return must(w.units.find((u) => u.kind === KIND.OPERATOR && u.y === row && u.x === col));
}

/** @param {Unit} u @param {number} arts @param {number} burn */
function burned(u, arts, burn) {
  assert.equal(u.hp, 1e6 - arts);
  assert.equal(elements.epOf(u, 'FIRE'), 1000 - burn);
}

/** @param {Unit} u */
function spared(u) {
  assert.equal(u.hp, 1e6);
  assert.equal(elements.epOf(u, 'FIRE'), 1000);
}

/** @param {string} key @param {number} arts @param {number} burn */
function expectBoom(key, arts, burn) {
  const box = field(key, { cd: 100, def: 0 });
  const life = box.w.players[0].life;
  deploy(box.w, box.c, SEATS);
  status.applyStatus(at(box.w, 0, 2), 'levitate', {});
  box.cart.atkCd = 0;
  const ev = frames(box.w, box.c, 1);
  for (const [row, col] of HIT) burned(at(box.w, row, col), arts, burn);
  spared(at(box.w, 0, 2));
  spared(at(box.w, 1, 4));
  spared(box.neutral);
  assert.equal(ev.filter((e) => e.type === 'blast').length, 0);
  assert.equal(ev.filter((e) => e.type === 'goal').length, 0);
  const deaths = ev.filter((e) => e.type === 'death');
  assert.equal(deaths.length, 1);
  assert.equal(deaths[0].id, box.cart.id);
  assert.equal(box.w.units.includes(box.cart), false);
  assert.equal(box.w.players[0].life, life);
}

/** @param {Record<string, Record<string, number>>} [talents] @param {any[]} [skills] */
function bare(talents, skills) {
  return { name: 'e', maxHp: 1, atk: 1, def: 0, res: 0, moveSpeed: 0, ...(talents ? { talents } : {}), ...(skills ? { skills } : {}) };
}

/** @param {Record<string, number>} bb */
const boomGap = (bb) => uncoveredAbilities([bare({ boom: bb })]);

/** @param {Record<string, number | string>} bb */
const bornGap = (bb) => uncoveredAbilities([bare(undefined, [{ key: 'BornCar', cooldown: 10, initCooldown: 5, sp: 1, bb: /** @type {Record<string, number>} */ (bb) }])]);

/** @param {Set<string>} used @param {Record<string, any>} enemies @param {Record<string, unknown>} bb */
function addKeys(used, enemies, bb) {
  for (const v of Object.values(bb)) if (typeof v === 'string' && Object.hasOwn(enemies, v)) used.add(v);
}

/** @param {Set<string>} used @param {Record<string, any>} enemies */
function pullNamed(used, enemies) {
  for (const k of used) {
    const e = enemies[k];
    if (!e) continue;
    const boards = [...Object.values(e.talents ?? {}), ...(e.skills ?? []).map((/** @type {any} */ x) => x.bb ?? {})];
    for (const bb of boards) addKeys(used, enemies, bb);
  }
}

/** Enemies a level's waves and branches spawn, then the enemy keys their raw blackboards name. @param {any} level */
function spawned(level) {
  const frags = [...level.level.waves.flatMap((/** @type {any} */ w) => w.fragments), ...Object.values(level.level.branches ?? {}).flat()];
  const used = new Set(frags.flatMap((/** @type {any} */ f) => f.actions.filter((/** @type {any} */ a) => a.type === 'SPAWN').map((/** @type {any} */ a) => a.key)));
  pullNamed(used, level.enemies);
  return used;
}

/**
 * The cart's place on the frame it appears. moveSpeed cannot be 0: the attribute floor is 0.1, so a cart brought in
 * during the enemy turn (no delay) walks one frame before the test can root it. A neighbouring tile is 1 away.
 * @param {World} w @param {Unit} e @param {any} x @param {number} f @param {number[]} at
 */
function noteSpawn(w, e, x, f, at) {
  at.push(f);
  const u = must(w.units.find((n) => n.id === x.id));
  const dx = u.x - e.x, dy = u.y - e.y;
  assert.ok(dx * dx + dy * dy < 0.01, `${u.x},${u.y} vs ${e.x},${e.y}`);
  assert.equal(u.route, e.route);
  assert.equal(u.leg, e.leg);
  status.applyStatus(u, 'root', {});
}

/** @param {string} dealer @param {string} cart @param {number[]} atFrames */
function calls(dealer, cart, atFrames) {
  const { c, w, e } = summonWorld(dealer, cart);
  // One frame of the 0.1 floor already happened inside the spawn step. Put the dealer back on the start tile.
  e.x = 0;
  e.y = 2;
  e.leg = 0;
  e.path = [];
  status.applyStatus(e, 'root', {});
  status.applyStatus(e, 'silence', {});
  /** @type {number[]} */
  const at = [];
  for (let i = 0; i < 1100; i++) {
    for (const x of step(w, c)) if (x.type === 'spawn' && x.key === cart) noteSpawn(w, e, x, w.frame - 1, at);
  }
  assert.deepEqual(at, atFrames);
  assert.equal(e.ab['BornCar.ammo'], 0);
  assert.deepEqual([e.x, e.y, e.leg], [0, 2, 0]);
  assert.equal(w.units.filter((u) => u.key === cart).length, 3);
}

test('[敌能-82] 甜品商 calls a 糖果车 0.1 s after the skill, three times, and silence does not stop it', () => {
  calls(DEALER, CART, [152, 452, 752]);
  const skill = mustSkill(DEALER);
  assert.equal(skill.enemy_key, undefined);
  assert.equal(CART_OF[DEALER], CART);
  assert.equal(skill.delay, 0.1);
  assert.equal(skill.max, 3);
});

test('[敌能-82] 知名甜品商 calls a 精致糖果车 on the skill frame, with no delay', () => {
  calls(FAMOUS, FINE, [150, 450, 750]);
  const skill = mustSkill(FAMOUS);
  assert.equal(CART_OF[FAMOUS], FINE);
  assert.equal(skill.delay, undefined);
  assert.equal(skill.max, 3);
});

/** @param {string} key */
function mustSkill(key) {
  const skill = withFoeExtras(key, record(key)).skills?.find((s) => s.key === 'BornCar');
  if (!skill) throw new Error(`no BornCar on ${key}`);
  return skill.bb;
}

test('[敌能-82] a stunned 知名甜品商 keeps its ammunition and calls on the frame it can act', () => {
  const { c, w, e } = summonWorld(FAMOUS, FINE);
  status.applyStatus(e, 'stun', {});
  const held = frames(w, c, 200);
  assert.deepEqual(spawnedAt(held, FINE), []);
  assert.equal(e.ab['BornCar.ammo'], 3);
  assert.equal(e.ab['BornCar.cd'], 0);
  buffs.removeBuff(e, 'stun');
  const next = frames(w, c, 1);
  assert.deepEqual(spawnedAt(next, FINE), [201]);
  assert.equal(e.ab['BornCar.ammo'], 2);
});

test('[敌能-82] a blocked 糖果车 explodes: 375 arts and 250 burn, not on a flyer, then it is knocked down', () => {
  expectBoom(CART, 375, 250);
});

test('[敌能-82] a blocked 精致糖果车 explodes for 550 arts and 350 burn', () => {
  expectBoom(FINE, 550, 350);
});

test('[敌能-82] a silenced cart does not switch and its attack stays physical', () => {
  const { c, w, cart } = field(CART, { cd: 0, def: 100 });
  status.applyStatus(cart, 'silence', {});
  deploy(w, c, [['guard', 1, 2]]);
  const guard = at(w, 1, 2);
  assert.equal(guard.hp, 1e6 - 200);
  assert.equal(elements.epOf(guard, 'FIRE'), 1000);
  assert.ok(cart.hp > 0);
  assert.equal(cart.ab['boom.mode'] ?? 0, 0);
  assert.equal(record(CART).dmgType, 'arts');
  assert.equal(record(FINE).dmgType, 'arts');
});

test('[敌能-82] unsilencing a blocked cart switches it on the next turn, and that attack explodes', () => {
  const { c, w, cart } = field(CART, { cd: 100, def: 0 });
  status.applyStatus(cart, 'silence', {});
  deploy(w, c, [['guard', 1, 2]]);
  frames(w, c, 1);
  assert.equal(cart.ab['boom.mode'] ?? 0, 0);
  buffs.removeBuff(cart, 'silence');
  frames(w, c, 1);
  assert.equal(cart.ab['boom.mode'], 1);
  assert.ok(cart.hp > 0);
  cart.atkCd = 0;
  frames(w, c, 1);
  burned(at(w, 1, 2), 375, 250);
  assert.equal(w.units.includes(cart), false);
});

test('[敌能-82] after the switch, leaving the block and being silenced still explode', () => {
  const { c, w, cart } = field(CART, { cd: 100, def: 0 });
  deploy(w, c, [['guard', 1, 2]]);
  frames(w, c, 1);
  assert.equal(cart.ab['boom.mode'], 1);
  const guard = at(w, 1, 2);
  status.applyStatus(guard, 'stun', {});
  frames(w, c, 1);
  assert.equal(cart.blockedBy, -1);
  assert.equal(cart.ab['boom.mode'], 1);
  buffs.removeBuff(guard, 'stun');
  status.applyStatus(cart, 'silence', {});
  cart.atkCd = 0;
  frames(w, c, 1);
  burned(guard, 375, 250);
  assert.equal(w.units.includes(cart), false);
});

test('[敌能-82] the attack that meets the block explodes on that frame', () => {
  const { c, w, cart } = field(CART, { cd: 0, def: 0 });
  const life = w.players[0].life;
  const ev = deploy(w, c, [['guard', 1, 2]]);
  burned(at(w, 1, 2), 375, 250);
  assert.equal(ev.filter((e) => e.type === 'blast').length, 0);
  assert.equal(ev.filter((e) => e.type === 'goal').length, 0);
  assert.equal(ev.filter((e) => e.type === 'death' && e.id === cart.id).length, 1);
  assert.equal(w.units.includes(cart), false);
  assert.equal(w.players[0].life, life);
});

test('[敌能-82] cart boom is covered without radius; other boom shapes keep their coverage; BornCar needs its ammunition cap', () => {
  assert.deepEqual(boomGap({ atk_scale: 2 }), ['boom']);
  assert.deepEqual(boomGap({ radius: 1.25, delay: 1 }), []);
  assert.deepEqual(boomGap({ [ATK]: 375, [BURN]: 250 }), ['boom']);
  assert.deepEqual(boomGap({ [ATK]: 375, [BURN]: 250, [TRAP]: 5000 }), []);
  assert.deepEqual(bornGap({}), ['BornCar']);
  assert.deepEqual(bornGap({ max: 3 }), []);
  assert.deepEqual(uncoveredAbilities([withFoeExtras(DEALER, record(DEALER))]), []);
  assert.ok(uncoveredAbilities([withFoeExtras(WITCH, record(WITCH))]).includes('boom'));
});

test('[敌能-82] act1multi_07 drops BornCar and the carts\' boom; 冬灵血巫\'s boom stays uncovered', () => {
  const keys = spawned(lv);
  for (const k of [DEALER, FAMOUS, CART, FINE, WITCH, MASTER]) assert.ok(keys.has(k), k);
  const gaps = uncoveredAbilities([...keys].map((k) => withFoeExtras(k, record(k))));
  assert.equal(gaps.includes('BornCar'), false);
  assert.equal(gaps.includes('shotbuff'), false);
  assert.equal(gaps.includes('boom'), true);
  assert.deepEqual(uncoveredAbilities([withFoeExtras(CART, record(CART)), withFoeExtras(FINE, record(FINE))]), []);
  const rest = [...keys].filter((k) => k !== WITCH && k !== MASTER);
  assert.equal(uncoveredAbilities(rest.map((k) => withFoeExtras(k, record(k)))).includes('boom'), false);
});
