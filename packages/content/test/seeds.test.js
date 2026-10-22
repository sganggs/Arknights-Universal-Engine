// 枯朽萃聚使徒 / 腐败萃聚使徒 and the seeds they call (docs/spec/foes.md 敌能-64). The data blackboard is empty and
// the seeds have no talents; the test builds the records and lets FOE_EXTRAS fill the page's numbers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, KIND, bus, buffs, displacement } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras, uncoveredAbilities, FOE_EXTRAS } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const WITHER = 'enemy_1321_wdarft';
const ROTTEN = 'enemy_1321_wdarft_2';
const SEED = 'enemy_1269_nhfly';
const SEED2 = 'enemy_1269_nhfly_2';

/** @param {string} key @param {{ hp: number, def: number, res: number, immune?: string[] }} n @returns {EnemyDef} */
function callerDef(key, n) {
  return {
    name: key, maxHp: n.hp, atk: 500, def: n.def, res: n.res, moveSpeed: 0.3, baseAttackTime: 5, massLevel: 5,
    motion: 'FLY', applyWay: 'NONE', rangeRadius: 0,
    immune: n.immune ?? ['stun', 'silence', 'sleep', 'freeze', 'levitate'],
    skills: [{ key: 'BornBugs', cooldown: 10, initCooldown: 10, sp: 0, bb: {} }],
  };
}

/**
 * A seed. The data excerpt gives no def, res or attack interval; 0 keeps a hit equal to atk, and the default interval
 * still starts the first swing at once.
 * @param {string} key @param {number} maxHp @param {number} atk @returns {EnemyDef}
 */
function seedDef(key, maxHp, atk) {
  return {
    name: key, maxHp, atk, def: 0, res: 0, moveSpeed: 0.6, immune: ['silence'],
    motion: 'FLY', applyWay: 'RANGED', rangeRadius: 2,
  };
}

/**
 * The tiny map, `spawnKey` in on frame 0, then rooted at [row, col]. `deploy` drops the guard on the next step.
 * @param {Record<string, EnemyDef>} defs
 * @param {string} spawnKey
 * @param {{ at?: [number, number], deploy?: [number, number], before?: (w: World, c: any, e: Unit) => void }} [o]
 */
function arena(defs, spawnKey, o = {}) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = Object.fromEntries(Object.entries(defs).map(([k, e]) => [k, withFoeExtras(k, e)]));
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, spawnKey)])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 9, maxLifePoint: 99 };
  Object.assign(c.operators.guard, { cost: 0, maxHp: 1e6, atk: 0, def: 0 });
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = w.units.find((u) => u.key === spawnKey);
  if (!e) throw new Error(`missing ${spawnKey}`);
  const at = o.at ?? [1, 3];
  Object.assign(e, { x: at[1], y: at[0], path: [], pt: 0 });
  status.applyStatus(e, 'root', {});
  o.before?.(w, c, e);
  if (o.deploy) step(w, c, [[0, { type: 'deploy', op: 'guard', row: o.deploy[0], col: o.deploy[1], dir: 0 }]]);
  const g = w.units.find((u) => u.kind === KIND.OPERATOR) ?? null;
  if (o.deploy && !g) throw new Error('no guard');
  return { c, w, e, g };
}

/** @param {World} w @param {any} c @param {number} n */
function run(w, c, n) {
  /** @type {any[]} */
  const out = [];
  for (let i = 0; i < n; i++) for (const ev of step(w, c)) out.push({ ...ev, f: w.frame - 1 });
  return out;
}

/** @param {any[]} ev @param {string} key */
const spawned = (ev, key) => ev.filter((x) => x.type === 'spawn' && x.key === key);

/**
 * First cast at frame 300, three seeds at 320, the next three at 620. Silence on a data-immune caller does not stick.
 * @param {string} caller @param {string} seed
 * @param {{ hp: number, def: number, res: number, seedHp: number, seedAtk: number }} n
 */
function batch(caller, seed, n) {
  const { c, w, e } = arena({ [caller]: callerDef(caller, n), [seed]: seedDef(seed, n.seedHp, n.seedAtk) }, caller, { at: [1, 3] });
  status.applyStatus(e, 'silence', {});
  const early = spawned(run(w, c, 299), seed);
  const spot = { x: e.x, y: e.y, route: e.route, leg: e.leg };
  run(w, c, 1);
  const pending = (w.broods ?? []).map((b) => ({ key: b.key, x: b.x, y: b.y, left: b.left, route: b.route, leg: b.leg }));
  e.x += 0.4;
  const three = spawned(run(w, c, 20), seed);
  // The unit objects stay live. Snapshot where they appeared before the next 300 frames walk the route (敌能-22).
  const placed = three.map((ev) => {
    const u = w.units.find((x) => x.id === ev.id);
    if (!u) throw new Error(`missing ${seed} ${ev.id}`);
    return [u.x, u.y, u.route, u.leg, attrs.statsOf(u).flags.staticBody];
  });
  const again = spawned(run(w, c, 300), seed);
  return { e, early, spot, pending, three, placed, again };
}

/** @param {string} caller @param {string} seed @param {ReturnType<typeof batch>} got */
function assertBatch(caller, seed, got) {
  const { e, early, spot, pending, three, placed, again } = got;
  assert.equal(attrs.statsOf(e).flags.silence, undefined, `${caller} keeps its silence immunity`);
  assert.equal(early.length, 0);
  assert.deepEqual(pending, [0, -1, 1].map((dx) => ({ key: seed, x: spot.x + dx, y: spot.y, left: 20, route: spot.route, leg: spot.leg })));
  assert.equal(e.x, spot.x + 0.4, 'the caller has moved; the brood kept the cast point');
  assert.deepEqual(three.map((x) => x.f), [320, 320, 320]);
  assert.deepEqual(placed, [
    [spot.x, spot.y, spot.route, spot.leg, true],
    [spot.x - 1, spot.y, spot.route, spot.leg, true],
    [spot.x + 1, spot.y, spot.route, spot.leg, true],
  ]);
  assert.deepEqual(again.map((x) => x.f), [620, 620, 620]);
}

/**
 * A rooted seed and a guard one tile to its left. The deploy step can launch. Deaths land in `deaths`.
 * @param {string} key @param {number} atk
 */
function planted(key, atk) {
  /** @type {(string | number | null)[][]} */
  const deaths = [];
  /** @type {string[]} */
  const kills = [];
  const opened = arena({ [key]: seedDef(key, key === SEED ? 1200 : 1550, atk) }, key, {
    at: [1, 3],
    deploy: [1, 2],
    before(w, c) {
      c.level.stages = [{ alias: 'k', objective: 'kill', goal: 9, time: 100, rest: 0 }];
      w.stage.running = true;
      w.stage.index = 0;
      w.stage.start = 0;
      bus.on(w, 'death', (ctx) => { deaths.push([ctx.unit.key, ctx.reason, ctx.killer, w.frame]); });
      bus.on(w, 'kill', (ctx) => { kills.push(ctx.victim.key); });
    },
  });
  return { ...opened, deaths, kills };
}

test('[敌能-64] 枯朽萃聚使徒: first cast at 10 s, three seeds 0.7 s later on its route, then every 10 s', () => {
  assertBatch(WITHER, SEED, batch(WITHER, SEED, { hp: 30000, def: 250, res: 30, seedHp: 1200, seedAtk: 750 }));
});

test('[敌能-64] 腐败萃聚使徒 calls 腐败之种 with the same offsets', () => {
  assert.equal(FOE_EXTRAS[ROTTEN].skills?.BornBugs.enemy_key, SEED2);
  assert.equal(FOE_EXTRAS[WITHER].skills?.BornBugs.enemy_key, SEED);
  assert.deepEqual(FOE_EXTRAS[SEED2].talents, { Static: {}, SelfDown: {} });
  assertBatch(ROTTEN, SEED2, batch(ROTTEN, SEED2, { hp: 35000, def: 300, res: 35, seedHp: 1550, seedAtk: 1250 }));
});

test('[敌能-64] a caller that is not immune to silence does not summon while silenced', () => {
  const quiet = callerDef(WITHER, { hp: 30000, def: 250, res: 30, immune: ['stun', 'sleep', 'freeze', 'levitate'] });
  const { c, w, e } = arena({ [WITHER]: quiet, [SEED]: seedDef(SEED, 1200, 750) }, WITHER);
  assert.ok(status.applyStatus(e, 'silence', { seconds: 30 }));
  assert.equal(attrs.statsOf(e).flags.silence, true);
  assert.equal(spawned(run(w, c, 330), SEED).length, 0);
  assert.equal(w.broods?.length ?? 0, 0);
});

test('[敌能-64] the seed hits an operator in range and is knocked down on that hit', () => {
  const { c, w, e, g, deaths, kills } = planted(SEED, 750);
  if (!g) throw new Error('no guard');
  assert.equal(w.shots.length, 1);
  assert.equal(w.shots[0].speed, 10);
  assert.ok(e.hp > 0);
  const ev = run(w, c, 4);
  const hit = ev.find((x) => x.type === 'hit' && x.id === e.id && x.target === g.id);
  assert.ok(hit);
  assert.equal(hit.f, 3);
  assert.deepEqual(deaths, [[SEED, 'killed', null, 3]]);
  assert.deepEqual(kills, []);
  assert.equal(ev.some((x) => x.type === 'hit' && x.target === e.id), false);
  assert.equal(w.stage.count, 1);
  assert.ok(!w.units.includes(e));
  assert.ok(g.hp < g.maxHp);
});

test('[敌能-64] a hit that deals nothing does not knock the seed down', () => {
  const { c, w, e, g } = planted(SEED, 750);
  if (!g) throw new Error('no guard');
  assert.equal(w.shots.length, 1);
  status.applyStatus(g, 'invincible', { seconds: 5 });
  const hp = g.hp;
  run(w, c, 4);
  assert.equal(g.hp, hp);
  assert.ok(e.hp > 0 && w.units.includes(e));
});

/** @param {'stun' | 'freeze' | 'sleep' | 'levitate'} flag */
function hold(flag) {
  const { c, w, e, g } = planted(SEED, 750);
  if (!g) throw new Error('no guard');
  assert.equal(w.shots.length, 1);
  const stuck = status.applyStatus(e, flag, { seconds: 5 });
  if (flag === 'levitate') {
    assert.equal(stuck, null);
    buffs.addBuff(e, buffs.makeBuff({ key: 'levitate', flags: { levitate: true } }));
  } else assert.ok(stuck);
  const hp = g.hp;
  run(w, c, 4);
  return { alive: e.hp > 0 && w.units.includes(e), hurt: g.hp < hp, on: attrs.statsOf(e).flags[flag] === true };
}

test('[敌能-64] stunned, frozen, asleep or levitated at the hit, the seed stays', () => {
  for (const flag of /** @type {const} */ (['stun', 'freeze', 'sleep', 'levitate'])) {
    const held = hold(flag);
    assert.equal(held.alive, true, flag);
    assert.equal(held.hurt, true, flag);
    assert.equal(held.on, true, flag);
  }
});

test('[敌能-64] 不进行普通攻击: blocked, the caller still deals nothing', () => {
  const { c, w, e } = arena({ [WITHER]: callerDef(WITHER, { hp: 30000, def: 250, res: 30 }) }, WITHER, { at: [1, 2], deploy: [1, 2] });
  const g = w.units.find((u) => u.kind === KIND.OPERATOR);
  if (!g) throw new Error('no guard');
  assert.equal(attrs.statsOf(e).flags.noAttack, true);
  buffs.addBuff(g, buffs.makeBuff({ key: 'bf', flags: { blockFly: true } }));
  const ev = run(w, c, 3);
  assert.equal(e.blockedBy, g.id);
  assert.equal(g.hp, g.maxHp);
  assert.equal(ev.some((x) => x.type === 'hit' && x.id === e.id), false);
});

test('[敌能-64] [位移-5] 之种 gets 静态刚体 from the content talent', () => {
  for (const key of [SEED, SEED2]) {
    const { c, w, e } = arena({ [key]: seedDef(key, 1200, 750) }, key);
    assert.equal(attrs.statsOf(e).flags.staticBody, true);
    assert.equal(attrs.statsOf(e).flying, true);
    assert.equal(displacement.displaceable(e), false);
    const x = e.x, y = e.y;
    assert.equal(displacement.push(w, c, e, 5, { from: { x: x - 1, y }, effect: true }), true);
    assert.equal(e.x, x);
    assert.equal(e.y, y);
    assert.equal(e.slide?.vx, 0);
    assert.equal(displacement.slideStep(c, e, w), false);
    assert.equal(e.slide, undefined);
  }
});

test('[敌能-64] BornBugs without the page numbers stays uncovered; the extras cover both sides', () => {
  const raw = callerDef(WITHER, { hp: 30000, def: 250, res: 30 });
  assert.deepEqual(uncoveredAbilities([raw]), ['BornBugs']);
  const partial = callerDef(WITHER, { hp: 30000, def: 250, res: 30 });
  partial.skills?.[0] && (partial.skills[0].bb = { delay: 0.7, left: 1, right: 1 });
  assert.deepEqual(uncoveredAbilities([partial]), ['BornBugs']);
  assert.deepEqual(uncoveredAbilities([withFoeExtras(WITHER, callerDef(WITHER, { hp: 30000, def: 250, res: 30 }))]), []);
  assert.deepEqual(uncoveredAbilities([withFoeExtras(SEED, seedDef(SEED, 1200, 750))]), []);
  assert.deepEqual(uncoveredAbilities([withFoeExtras(SEED2, seedDef(SEED2, 1550, 1250))]), []);
});
