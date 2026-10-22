// 集团军火炮 (docs/spec/foes.md 敌能-60). No shipped level carries these ids, so the records are the game data's
// blackboards (ArknightsGameData 17759cc8) plus the page's zone radius. The cannon's attack is 0 on the record until
// it has been moved off the spawn tile: the spawn step would otherwise shoot whoever shares that tile.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, buffs, devices, summons } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent, withFoeExtras, FOE_EXTRAS } from '../src/index.js';
import { uncoveredAbilities } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const HP = 1e6;
const LIGHT = 'enemy_10122_uacann';
const HEAVY = 'enemy_10122_uacann_2';
const BOX = { name: 'box', maxHp: HP, atk: 0, def: 0, res: 0, blockCnt: 0, baseAttackTime: 1, aspd: 100, tauntLevel: 0, massLevel: 0, talentBb: {} };

/** @param {string} key @param {number} atk @param {number} arts */
function cannon(key, atk, arts) {
  return withFoeExtras(key, {
    name: key, maxHp: key === HEAVY ? 10000 : 8000, atk, def: 350, res: 0, moveSpeed: 0.8,
    applyWay: 'RANGED', rangeRadius: 10, baseAttackTime: 5, aspd: 100, massLevel: 2,
    talents: { ProjectileBoomRange: { 'attack@projectile_range': 1, 'attack@projectile_life_time': 3, 'attack@value': arts } },
  });
}

/** @param {string} key @param {number} atk @param {number} arts @param {boolean} [neutral] */
function world(key, atk, arts, neutral = false) {
  const c = /** @type {any} */ (tinyContent());
  const record = cannon(key, atk, arts);
  record.atk = 0;
  c.enemies = { [key]: record, ...(neutral ? { man: { name: 'man', maxHp: HP, atk: 0, def: 0, res: 0, moveSpeed: 0, neutral: true } } : {}) };
  c.behaviors = skeletonContent.behaviors;
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, characterLimit: 12 };
  for (const o of Object.values(c.operators)) Object.assign(o, { cost: 0, atk: 0, def: 0, res: 0, maxHp: HP });
  return c;
}

/** @param {string} key @param {number} atk @param {Unit[]} es */
function park(key, atk, es) {
  for (const e of es) {
    e.base.atk = atk;
    e.atkCd = 999;
    status.applyStatus(e, 'root', {});
  }
  const cannonU = /** @type {Unit} */ (es.find((u) => u.key === key));
  cannonU.x = 3.75;
  cannonU.y = 1;
  return cannonU;
}

/** @param {World} w @param {any} c @param {string[]} ops */
function deploy(w, c, ops) {
  const cols = [0, 1, 2, 3, 5];
  step(w, c, ops.map((op, i) => [0, { type: 'deploy', op, row: 1, col: cols[i], dir: 0 }]));
}

/** @param {World} w @param {any} c @param {Unit} e */
function shoot(w, c, e) {
  e.atkCd = 0;
  /** @type {any[]} */
  const ev = [];
  for (const x of step(w, c)) ev.push({ ...x, f: w.frame - 1 });
  return ev;
}

/** @param {World} w @param {any} c @param {number} n */
function run(w, c, n) {
  /** @type {any[]} */
  const out = [];
  for (let i = 0; i < n; i++) for (const ev of step(w, c)) out.push({ ...ev, f: w.frame - 1 });
  return out;
}

/** @param {any[]} ev @param {number} id */
const took = (ev, id) => ev.filter((x) => x.type === 'hit' && x.target === id);

/** @param {any[]} ev @param {number} id */
const dmg = (ev, id) => took(ev, id).map((x) => x.damage);

/**
 * Cannon at x=3.75 and one guard at x=4 (it blocks; its taunt wins). Extra operators stand at x=5, 6, … so a shell
 * aimed at the guard splashes the first of them and not the next.
 * @param {string} key @param {number} atk @param {number} arts @param {string[]} extra
 */
function duo(key, atk, arts, extra = []) {
  const c = world(key, atk, arts);
  for (const name of extra) c.operators[name] = { ...c.operators.guard, name };
  c.level.waves = [oneWave([spawnAt(0, key)])];
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = park(key, atk, w.units.filter((u) => u.key === key));
  deploy(w, c, ['guard', ...extra]);
  /** @type {Record<string, Unit>} */
  const by = Object.fromEntries(w.units.filter((u) => u.owner >= 0).map((u) => [u.key, u]));
  by.guard.x = 4;
  by.guard.y = 1;
  by.guard.base.tauntLevel = 1;
  extra.forEach((name, i) => { by[name].x = 5 + i; by[name].y = 1; });
  return { c, w, e, by };
}

/**
 * Light cannon with a guard on every side of the two radii. Positions are dyadic so 1, 1.015625, 1.75 and 1.875
 * compare exactly. Only the guard stands inside the block radius, and its taunt is 1.
 * @param {number} atk @param {number} arts
 */
function cast(atk, arts) {
  const c = world(LIGHT, atk, arts, true);
  for (const name of ['inn', 'out', 'edge', 'far', 'camou', 'stealth', 'dark', 'pup']) c.operators[name] = { ...c.operators.guard, name };
  c.operators.fly = { ...c.operators.sniper, name: 'fly' };
  c.operators.lift = { ...c.operators.sniper, name: 'lift' };
  c.devices = { box: { ...BOX }, foe: { ...BOX, name: 'foe', side: 'ENEMY' } };
  c.level.waves = [oneWave([spawnAt(0, LIGHT), spawnAt(0, 'man')])];
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = park(LIGHT, atk, [/** @type {Unit} */ (w.units.find((u) => u.key === LIGHT))]);
  const man = /** @type {Unit} */ (w.units.find((u) => u.key === 'man'));
  man.x = 4.5;
  man.y = 0.5;
  deploy(w, c, ['guard', 'inn', 'out', 'edge']);
  step(w, c, [
    [0, { type: 'deploy', op: 'fly', row: 2, col: 2, dir: 0 }],
    [0, { type: 'deploy', op: 'lift', row: 2, col: 3, dir: 0 }],
  ]);
  /** @type {Record<string, Unit>} */
  const by = Object.fromEntries(w.units.filter((u) => u.owner >= 0).map((u) => [u.key, u]));
  const at = /** @type {Record<string, [number, number]>} */ ({
    guard: [4, 1], inn: [5, 1], out: [5.015625, 1], edge: [5.75, 1], fly: [4.875, 1], lift: [4.5, 1.5],
  });
  for (const [name, xy] of Object.entries(at)) { by[name].x = xy[0]; by[name].y = xy[1]; }
  // The road's last column is the goal. The rest deploy once the first four have left those tiles. Column 4 is the
  // cannon's tile: a deploy there would push the cannon (阻挡-4).
  deploy(w, c, ['far', 'camou', 'stealth', 'dark']);
  for (const name of ['far', 'camou', 'stealth', 'dark']) by[name] = /** @type {Unit} */ (w.units.find((u) => u.key === name));
  by.far.x = 5.875; by.far.y = 1;
  by.camou.x = 4.5; by.camou.y = 1;
  by.stealth.x = 4.75; by.stealth.y = 1;
  by.dark.x = 4.25; by.dark.y = 1.5;
  by.guard.base.tauntLevel = 1;
  by.out.base.res = 50;
  assert.equal(devices.spawnDevice(w, c, 'box', 1, 3), true);
  assert.equal(devices.spawnDevice(w, c, 'foe', 0, 3), true);
  const box = /** @type {Unit} */ (w.units.find((u) => u.key === 'box'));
  const foe = /** @type {Unit} */ (w.units.find((u) => u.key === 'foe'));
  box.x = 4.625; box.y = 1;
  foe.x = 4.75; foe.y = 0.5;
  const pup = summons.spawnSummon(w, c, by.guard, 'pup', { row: 1, col: 3 });
  if (!pup) throw new Error('summon was not placed');
  pup.x = 4.25; pup.y = 1;
  buffs.addBuff(by.camou, buffs.makeBuff({ key: 'camou', flags: { camou: true } }));
  buffs.addBuff(by.stealth, buffs.makeBuff({ key: 'stealth', flags: { stealth: true } }));
  buffs.addBuff(by.dark, buffs.makeBuff({ key: 'dark', flags: { untargetable: true } }));
  buffs.addBuff(by.lift, buffs.makeBuff({ key: 'lift', flags: { liftoff: true } }));
  status.applyStatus(by.fly, 'levitate', {});
  return { c, w, e, man, box, foe, pup, by };
}

test('[敌能-60] 轻型 splash is 100% phys inside radius 1, once, and misses what the radius and 不可对空 leave out', () => {
  const { c, w, e, man, box, foe, pup, by } = cast(350, 100);
  assert.equal(attrs.statsOf(by.fly).flying, true);
  assert.equal(attrs.statsOf(by.lift).flying, false);
  const ev = shoot(w, c, e);
  assert.equal(e.blockedBy, by.guard.id);
  assert.deepEqual(dmg(ev, by.guard.id), [350]);
  assert.deepEqual(dmg(ev, by.inn.id), [350], 'distance 1 is inside');
  assert.deepEqual(dmg(ev, by.camou.id), [350], '迷彩 cannot dodge a splash');
  assert.deepEqual(dmg(ev, by.dark.id), [350], '无法选择 is still in the splash');
  assert.deepEqual(dmg(ev, box.id), [350], 'our device');
  assert.deepEqual(dmg(ev, pup.id), [350], 'a summon is an operator');
  assert.deepEqual(dmg(ev, man.id), [350], 'a neutral unit is in an enemy splash too (合作-9)');
  for (const u of [by.out, by.edge, by.far, by.stealth, by.fly, by.lift, foe]) assert.deepEqual(dmg(ev, u.id), [], u.key);
  assert.ok(took(ev, by.guard.id).every((x) => x.id === e.id));
  assert.equal(w.zones?.length, 1, 'splash targets do not each leave a zone');
  assert.equal(w.zones?.[0]?.x, by.guard.x);
  assert.equal(w.zones?.[0]?.y, by.guard.y);
});

test('[敌能-60] the zone is centred on the main target, reaches the collider, ticks three times and stacks nothing into one hit', () => {
  const { c, w, e, man, box, foe, pup, by } = cast(350, 100);
  const ev = shoot(w, c, e);
  const z = /** @type {any} */ (w.zones?.[0]);
  assert.equal(dmg(ev, by.guard.id).includes(100), false, 'the frame it is placed does not tick');
  assert.deepEqual(
    [z.x, z.y, z.radius, z.arts, z.pad, z.air, z.open, z.wide, z.life, z.next, z.src, z.low, z.high],
    [4, 1, 1.5, 100, 0.25, false, false, true, 90, 30, e.id, 0, 0],
  );
  assert.equal(z.placed, took(ev, by.guard.id)[0].f);
  const later = run(w, c, 90);
  const guard = took(later, by.guard.id);
  assert.deepEqual(guard.map((x) => x.damage), [100, 100, 100]);
  assert.deepEqual(guard.map((x) => x.f), [z.placed + 30, z.placed + 60, z.placed + 90]);
  assert.deepEqual(guard.map((x) => x.id), [e.id, e.id, e.id]);
  for (const u of [by.inn, by.edge, box, pup]) assert.deepEqual(dmg(later, u.id), [100, 100, 100], u.key);
  assert.deepEqual(dmg(later, by.out.id), [50, 50, 50], 'RES 50 halves the 100, and 1.015625 is inside the zone');
  for (const u of [by.far, by.camou, by.stealth, by.fly, by.lift, by.dark, man, foe]) assert.deepEqual(dmg(later, u.id), [], u.key);
  assert.equal(w.zones, undefined, 'the third tick is the last frame');
});

test('[敌能-60] a second hit leaves a second zone, and the two tick on their own clocks', () => {
  const { c, w, e, by } = duo(LIGHT, 350, 100);
  shoot(w, c, e);
  shoot(w, c, e);
  assert.equal(w.zones?.length, 2);
  const ev = run(w, c, 90);
  assert.deepEqual(dmg(ev, by.guard.id), [100, 100, 100, 100, 100, 100]);
  assert.equal(w.zones, undefined);
});

test('[敌能-60] two zones placed on the same frame each deal 100', () => {
  const c = world(LIGHT, 350, 100);
  c.level.waves = [oneWave([spawnAt(0, LIGHT), spawnAt(0, LIGHT)])];
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const es = w.units.filter((u) => u.key === LIGHT);
  assert.equal(es.length, 2);
  park(LIGHT, 350, es);
  es[1].x = 3.75;
  es[1].y = 1;
  deploy(w, c, ['guard']);
  const guard = /** @type {Unit} */ (w.units.find((u) => u.key === 'guard'));
  guard.x = 4; guard.y = 1; guard.base.tauntLevel = 1;
  es[0].atkCd = 0; es[1].atkCd = 0;
  step(w, c);
  assert.equal(w.zones?.length, 2);
  assert.deepEqual(dmg(run(w, c, 30), guard.id), [100, 100]);
});

test('[敌能-60] 重型 hits for 500 and the zone deals 150', () => {
  const { c, w, e, by } = duo(HEAVY, 500, 150, ['inn']);
  const ev = shoot(w, c, e);
  assert.deepEqual(dmg(ev, by.guard.id), [500]);
  assert.deepEqual(dmg(ev, by.inn.id), [500]);
  const z = /** @type {any} */ (w.zones?.[0]);
  assert.deepEqual([z.radius, z.arts, z.life], [1.5, 150, 90]);
  const later = run(w, c, 30);
  assert.deepEqual(dmg(later, by.guard.id), [150]);
  assert.deepEqual(dmg(later, by.inn.id), [150]);
});

test('[敌能-60] a flying blocker is not a target, so nothing is fired and no zone is placed', () => {
  const { c, w, e, by } = duo(LIGHT, 350, 100);
  status.applyStatus(by.guard, 'levitate', {});
  assert.equal(attrs.statsOf(by.guard).flying, true);
  const ev = shoot(w, c, e);
  assert.equal(ev.some((x) => x.type === 'hit' || x.type === 'shot'), false);
  assert.equal(w.zones, undefined);
  assert.equal(w.shots.length, 0);
});

test('[敌能-60] 无敌 reducing the hit to 0 still places the zone', () => {
  const { c, w, e, by } = duo(LIGHT, 350, 100, ['inn']);
  status.applyStatus(by.guard, 'invincible', {});
  const ev = shoot(w, c, e);
  assert.equal(by.guard.hp, HP);
  assert.deepEqual(dmg(ev, by.guard.id), []);
  assert.deepEqual(dmg(ev, by.inn.id), [350]);
  assert.equal(w.zones?.length, 1);
  assert.equal(w.zones?.[0]?.x, by.guard.x);
});

test('[敌能-60] silence does not stop the talent', () => {
  const { c, w, e, by } = duo(LIGHT, 350, 100, ['inn']);
  status.applyStatus(e, 'silence', {});
  const ev = shoot(w, c, e);
  assert.deepEqual(dmg(ev, by.guard.id), [350]);
  assert.deepEqual(dmg(ev, by.inn.id), [350]);
  assert.equal(w.zones?.[0]?.arts, 100);
});

test('[敌能-60] a shell already in flight still splashes after the cannon dies, and places no zone', () => {
  const { c, w, e, by } = duo(LIGHT, 350, 100, ['inn']);
  by.guard.x = 5.75;
  by.inn.x = 6.75;
  e.atkCd = 0;
  const first = step(w, c);
  assert.equal(first.some((x) => x.type === 'hit'), false);
  assert.equal(w.zones, undefined);
  assert.equal(w.shots.length, 1);
  e.hp = 0;
  const ev = run(w, c, 8);
  assert.deepEqual(took(ev, by.guard.id).map((x) => [x.damage, x.id]), [[350, -1]]);
  assert.deepEqual(took(ev, by.inn.id).map((x) => [x.damage, x.id]), [[350, -1]]);
  assert.equal(w.zones, undefined);
});

test('[敌能-60] a zone already placed stays up after the cannon dies and its later ticks have no source', () => {
  const { c, w, e, by } = duo(LIGHT, 350, 100);
  const ev = shoot(w, c, e);
  const placed = /** @type {number} */ (w.zones?.[0]?.placed);
  e.hp = 0;
  step(w, c);
  assert.equal(w.units.includes(e), false);
  assert.equal(w.zones?.length, 1);
  by.guard.base.res = 50;
  const later = run(w, c, 89);
  const ticks = took(later, by.guard.id);
  assert.deepEqual(ticks.map((x) => x.damage), [50, 50, 50], 'RES still applies with no source');
  assert.deepEqual(ticks.map((x) => x.id), [-1, -1, -1]);
  assert.deepEqual(ticks.map((x) => x.f), [placed + 30, placed + 60, placed + 90]);
  assert.equal(took(ev, by.guard.id)[0].id, e.id, 'the shell that landed while it was alive names it');
});

test('[敌能-60] the zone stays where the target was hit', () => {
  const { c, w, e, by } = duo(LIGHT, 350, 100, ['inn']);
  shoot(w, c, e);
  const centre = /** @type {number} */ (w.zones?.[0]?.x);
  by.guard.x = 10;
  by.inn.x = centre;
  const ev = run(w, c, 30);
  assert.equal(w.zones?.[0]?.x, centre);
  assert.deepEqual(dmg(ev, by.guard.id), []);
  assert.deepEqual(dmg(ev, by.inn.id), [100]);
});

test('[敌能-60] the page radius is required; the two read ids carry oldid 369386 and 377750', () => {
  const raw = cannon(LIGHT, 350, 100);
  delete raw.talents?.ProjectileBoomRange?.zone;
  assert.deepEqual(uncoveredAbilities([raw]), ['ProjectileBoomRange']);
  const other = cannon('enemy_unread', 350, 100);
  delete other.talents?.ProjectileBoomRange?.zone;
  assert.deepEqual(uncoveredAbilities([other]), ['ProjectileBoomRange']);
  assert.equal(cannon(LIGHT, 350, 100).talents?.ProjectileBoomRange?.zone, 1.5);
  assert.equal(cannon(HEAVY, 500, 150).talents?.ProjectileBoomRange?.zone, 1.5);
  assert.deepEqual(uncoveredAbilities([cannon(LIGHT, 350, 100), cannon(HEAVY, 500, 150)]), []);
  assert.ok(FOE_EXTRAS[LIGHT].source.endsWith('oldid=369386'));
  assert.ok(FOE_EXTRAS[HEAVY].source.endsWith('oldid=377750'));
});
