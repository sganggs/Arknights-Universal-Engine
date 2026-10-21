// 岁兽残响 part two (docs/spec/foes.md 敌能-43): 烹泉 / 沏虹 splash on the projectile, the death blast and its
// resistible ASPD debuff, and the tea vessels' damage-type filter on the part-one hit count.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, damage, buffs, attrs, status, KIND } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent, withFoeExtras } from '../src/index.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

/** @typedef {{ key: string, atk: number, speed: number, aspd: number, child: string }} Rank */
/** @type {readonly Rank[]} */
const RANKS = Object.freeze([
  { key: 'enemy_1203_sfhu', atk: 280, speed: -40, aspd: 60, child: 'enemy_1204_msfhu' },
  { key: 'enemy_1203_sfhu_2', atk: 360, speed: -50, aspd: 50, child: 'enemy_1204_msfhu_2' },
]);

/** Guards that deal and block nothing, plus five copies — one card cannot be deployed twice. @param {any} c */
function quietOps(c) {
  c.operators.guard = { ...c.operators.guard, atk: 0, blockCnt: 0 };
  c.operators.sniper = { ...c.operators.sniper, atk: 0, blockCnt: 0 };
  for (let i = 0; i < 5; i++) c.operators[`g${i}`] = { ...c.operators.guard, name: `g${i}` };
}

/**
 * A rooted 烹泉 or 沏虹 on the tiny map, blackboard from the data plus the PRTS extras. `count` spawns that many on
 * the same tile. `hole` makes its tile a 地穴. Guards and the sniper deal nothing and block nothing.
 * @param {Rank} rank
 * @param {{ row?: number, col?: number, count?: number, hole?: boolean, seed?: number }} [o]
 */
function stand(rank, o = {}) {
  const c = /** @type {any} */ (tinyContent());
  const row = o.row ?? 1, col = o.col ?? 2, count = o.count ?? 1;
  c.level.waves = [oneWave([spawnAt(0, rank.key, { count })])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 9 };
  quietOps(c);
  c.behaviors = skeletonContent.behaviors;
  const talents = {
    DeadSpawn: { enemy_key: rank.child, cnt: 4 },
    DeadBoom: { duration: 15, interval: 3, attack_speed: rank.speed, attack_speed_add: 0 },
  };
  // enemy_key is a string; EnemyDef's blackboard is numeric, so the cast goes through unknown.
  c.enemies[rank.key] = withFoeExtras(rank.key, /** @type {EnemyDef} */ (/** @type {unknown} */ ({
    name: rank.key, maxHp: 6500, atk: rank.atk, def: 0, res: 0, moveSpeed: 0.8, baseAttackTime: 3.5,
    applyWay: 'RANGED', rangeRadius: 2, blockCnt: 0, talents,
  })));
  c.enemies[rank.child] = withFoeExtras(rank.child, /** @type {EnemyDef} */ ({
    name: rank.child, maxHp: rank.child.endsWith('_2') ? 6 : 4, atk: 0, def: 0, res: 0, moveSpeed: 0.7, talents: { hitCount: {} },
  }));
  if (o.hole) c.level.tiles[row][col] = { ...c.level.tiles[row][col], key: 'tile_hole' };
  const w = createWorld(c, { seed: o.seed ?? 1, players: 1 });
  step(w, c);
  const foes = w.units.filter((u) => u.key === rank.key);
  for (const e of foes) {
    Object.assign(e, { x: col, y: row, path: [], pt: 0, atkCd: 9999 });
    status.applyStatus(e, 'root', {});
  }
  const e = foes[0];
  if (!e) throw new Error(`no enemy ${rank.key}`);
  return { c, w, e, foes };
}

/** Deploys `n` guard copies on the road (cols 0–4) while the enemy is held. @param {ReturnType<typeof stand>} box @param {number} n */
function guards(box, n) {
  /** @type {[number, any][]} */
  const cmds = [];
  for (let i = 0; i < n; i++) cmds.push([0, { type: 'deploy', op: `g${i}`, row: 1, col: i, dir: 0 }]);
  step(box.w, box.c, cmds);
  return cmds.map(([, cmd]) => {
    const u = box.w.units.find((x) => x.key === cmd.op);
    if (!u) throw new Error(`deploy ${cmd.op} failed`);
    return u;
  });
}

/** @param {World} w @param {any} c @param {number} n */
function run(w, c, n) {
  for (let i = 0; i < n; i++) step(w, c);
}

/**
 * Knocks the enemy down. The blast is queued this frame and has not gone off (帧-1: removeDead is after foeEffects).
 * @param {ReturnType<typeof stand>} box
 */
function queue(box) {
  box.e.hp = 0;
  step(box.w, box.c);
  const b = box.w.blasts[0];
  if (!b) throw new Error('no blast queued');
  return b;
}

/**
 * Vessels already out plus those still waiting (a 0-frame summon is already a unit; a later one is a brood).
 * @param {World} w
 * @param {string} child
 */
function vessels(w, child) {
  const waiting = w.broods ?? [];
  return waiting.filter((b) => b.key === child).length + w.units.filter((u) => u.key === child).length;
}

/** @param {Unit} u */
const brews = (u) => u.buffs.filter((b) => b.key === 'pengquan');

/** One hit, and the damage the hit event shows. @param {World} w @param {Unit} e @param {any} dmg */
function strike(w, e, dmg) {
  w.events = [];
  const back = damage.dealDamage(w, null, e, dmg);
  const hit = /** @type {any} */ (w.events.find((x) => x.type === 'hit'));
  return { back, shown: hit ? hit.damage : null };
}

/**
 * A hit-count body, extras merged. @param {string} key @param {number} hp
 */
function vessel(key, hp) {
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [oneWave([spawnAt(0, key)])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 9 };
  c.behaviors = skeletonContent.behaviors;
  c.enemies[key] = withFoeExtras(key, /** @type {EnemyDef} */ ({
    name: key, maxHp: hp, atk: 0, def: 0, res: 0, moveSpeed: 0.7, talents: { hitCount: {} },
  }));
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = w.units.find((u) => u.kind === KIND.ENEMY);
  if (!e) throw new Error(`no enemy ${key}`);
  Object.assign(e, { x: 2, y: 1, path: [], pt: 0 });
  status.applyStatus(e, 'root', {});
  return { w, e };
}

/** The flags the type filter cares about. @param {Unit} e */
function typeOf(e) {
  const f = attrs.statsOf(e).flags;
  return {
    hitCount: f.hitCount, noAttack: f.noAttack, unblockable: f.unblockable,
    hitArts: f.hitArts, hitTrue: f.hitTrue, hitPhys: f.hitPhys, hitElement: f.hitElement,
  };
}

const ACCEPTED = { hitCount: true, noAttack: true, unblockable: true, hitArts: true, hitTrue: true, hitPhys: undefined, hitElement: undefined };

test('[敌能-43] [攻击-3] 烹泉\'s normal attack rides a projectile and splashes arts within 1.0, through camouflage, not into the air', () => {
  const rank = RANKS[0], box = stand(rank);
  const [primary, inside, outside, flying, camou] = guards(box, 5);
  primary.x = box.e.x + 0.5;
  primary.buffs.push(buffs.makeBuff({ key: 'taunt', mods: { taunt: 2 } }));
  inside.x = primary.x + 1;
  outside.x = primary.x + 1.02;
  flying.x = primary.x;
  flying.y = primary.y + 1;
  status.applyStatus(flying, 'levitate', {});
  camou.x = primary.x - 0.5;
  camou.buffs.push(buffs.makeBuff({ key: 'camou', flags: { camou: true } }));
  assert.equal(attrs.statsOf(box.e).flags.seeCamou, true);
  box.e.atkCd = 0;
  step(box.w, box.c);
  const shot = box.w.shots[0];
  assert.equal(box.w.shots.length, 1);
  assert.equal(primary.hp, 1000);
  assert.equal(shot.type, 'arts');
  assert.equal(shot.amount, rank.atk);
  assert.equal(shot.splash && shot.splash.radius, 1);
  assert.equal(shot.splash && shot.splash.side, 'friendly');
  step(box.w, box.c);
  assert.equal(1000 - primary.hp, rank.atk);
  assert.equal(1000 - inside.hp, rank.atk);
  assert.equal(outside.hp, 1000);
  assert.equal(flying.hp, 1000);
  assert.equal(1000 - camou.hp, rank.atk);
  assert.equal(box.w.units.filter((u) => brews(u).length > 0).length, 0);
});

test('[敌能-43] 沏虹\'s normal attack is the same arts splash, for its own attack', () => {
  const rank = RANKS[1], box = stand(rank);
  const [primary, outside] = guards(box, 2);
  primary.x = box.e.x + 0.5;
  primary.buffs.push(buffs.makeBuff({ key: 'taunt', mods: { taunt: 2 } }));
  outside.x = primary.x + 1.02;
  box.e.atkCd = 0;
  step(box.w, box.c);
  assert.equal(box.w.shots.length, 1);
  assert.equal(primary.hp, 1000);
  step(box.w, box.c);
  assert.equal(1000 - primary.hp, rank.atk);
  assert.equal(outside.hp, 1000);
});

test('[敌能-43] [阻挡-2] a camouflaged operator can be the target; a flying one cannot; 对地规避 takes no splash', () => {
  const hidden = stand(RANKS[0]);
  const [only] = guards(hidden, 1);
  only.x = hidden.e.x + 0.5;
  only.buffs.push(buffs.makeBuff({ key: 'camou', flags: { camou: true } }));
  hidden.e.atkCd = 0;
  step(hidden.w, hidden.c);
  step(hidden.w, hidden.c);
  assert.equal(1000 - only.hp, RANKS[0].atk);
  const air = stand(RANKS[0]);
  const [bird] = guards(air, 1);
  bird.x = air.e.x + 0.5;
  status.applyStatus(bird, 'levitate', {});
  air.e.atkCd = 0;
  step(air.w, air.c);
  assert.equal(air.w.shots.length, 0);
  assert.equal(bird.hp, 1000);
  const box = stand(RANKS[0]);
  const [primary, lift] = guards(box, 2);
  primary.x = box.e.x + 0.5;
  primary.buffs.push(buffs.makeBuff({ key: 'taunt', mods: { taunt: 2 } }));
  lift.x = primary.x;
  lift.y = primary.y - 1;
  lift.buffs.push(buffs.makeBuff({ key: 'up', flags: { liftoff: true } }));
  box.e.atkCd = 0;
  step(box.w, box.c);
  step(box.w, box.c);
  assert.equal(1000 - primary.hp, RANKS[0].atk);
  assert.equal(lift.hp, 1000);
});

test('[敌能-43] [敌能-3] the death blast is arts within 1.25, ignores camouflage, misses the air, and leaves 烹泉减益', () => {
  for (const rank of RANKS) {
    const box = stand(rank);
    const [hit, miss, air, camou] = guards(box, 4);
    hit.x = box.e.x + 1.25;
    miss.x = box.e.x - 1.26;
    air.x = box.e.x;
    air.y = box.e.y + 1;
    status.applyStatus(air, 'levitate', {});
    camou.x = box.e.x + 0.4;
    camou.buffs.push(buffs.makeBuff({ key: 'camou', flags: { camou: true } }));
    const queued = queue(box);
    assert.equal(queued.left, 0);
    assert.equal(queued.amount, rank.atk);
    assert.equal(queued.type, 'arts');
    assert.equal(queued.radius, 1.25);
    assert.equal(queued.air, false);
    assert.equal(queued.buff && queued.buff.key, 'pengquan');
    assert.equal(queued.buff && queued.buff.mods && queued.buff.mods.aspd, rank.speed);
    step(box.w, box.c);
    assert.equal(1000 - hit.hp, rank.atk);
    assert.equal(miss.hp, 1000);
    assert.equal(air.hp, 1000);
    assert.equal(1000 - camou.hp, rank.atk);
    const got = brews(hit);
    assert.equal(got.length, 1);
    assert.equal(got[0].left, 450);
    assert.equal(got[0].rule, 'independent');
    assert.equal(got[0].maxStacks, Number.MAX_SAFE_INTEGER);
    assert.equal(got[0].resist, true);
    assert.equal(got[0].every, 0);
    assert.equal(got[0].src, -1);
    assert.equal(attrs.statsOf(hit).aspd, rank.aspd);
    assert.equal(brews(miss).length, 0);
    assert.equal(brews(air).length, 0);
    assert.equal(attrs.statsOf(camou).aspd, rank.aspd);
  }
});

test('[敌能-43] silence drops the blast and the debuff; the four vessels are still summoned', () => {
  for (const rank of RANKS) {
    const box = stand(rank);
    const [g] = guards(box, 1);
    g.x = box.e.x + 0.5;
    status.applyStatus(box.e, 'silence', {});
    box.e.hp = 0;
    step(box.w, box.c);
    assert.equal(box.w.blasts.length, 0);
    assert.equal(vessels(box.w, rank.child), 4);
    step(box.w, box.c);
    assert.equal(box.w.blasts.length, 0);
    assert.equal(g.hp, 1000);
    assert.equal(brews(g).length, 0);
    assert.equal(vessels(box.w, rank.child), 4);
  }
});

test('[敌能-43] [地图-4] a fall still blasts; 烹泉 summons nothing, 沏虹 still summons four', () => {
  /** @param {Rank} rank */
  const fell = (rank) => {
    const box = stand(rank, { row: 0, col: 4, hole: true });
    step(box.w, box.c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 4, dir: 0 }]]);
    const g = box.w.units.find((u) => u.key === 'guard');
    if (!g) throw new Error('no guard');
    const n = vessels(box.w, rank.child);
    step(box.w, box.c);
    return { g, n };
  };
  const peng = fell(RANKS[0]), qi = fell(RANKS[1]);
  assert.equal(peng.n, 0);
  assert.equal(qi.n, 4);
  assert.equal(1000 - peng.g.hp, RANKS[0].atk);
  assert.equal(1000 - qi.g.hp, RANKS[1].atk);
  assert.equal(attrs.statsOf(peng.g).aspd, RANKS[0].aspd);
  assert.equal(attrs.statsOf(qi.g).aspd, RANKS[1].aspd);
});

test('[敌能-43] [状态-3] 烹泉减益 lasts 15 s, and 抵抗 0.5 halves that', () => {
  const open = stand(RANKS[0]);
  const [bare] = guards(open, 1);
  bare.x = open.e.x;
  queue(open);
  step(open.w, open.c);
  const plain = brews(bare)[0];
  run(open.w, open.c, 449);
  assert.equal(plain.left, 1);
  assert.equal(attrs.statsOf(bare).aspd, RANKS[0].aspd);
  run(open.w, open.c, 1);
  assert.equal(brews(bare).length, 0);
  assert.equal(attrs.statsOf(bare).aspd, 100);
  const held = stand(RANKS[1]);
  const [guard] = guards(held, 1);
  guard.x = held.e.x;
  status.applyStatus(guard, 'buffres', {});
  assert.equal(attrs.statsOf(guard).statusRes, 0.5);
  queue(held);
  step(held.w, held.c);
  const slow = brews(guard)[0];
  assert.equal(slow.left, 450);
  run(held.w, held.c, 224);
  assert.equal(slow.left, 2);
  assert.equal(attrs.statsOf(guard).aspd, RANKS[1].aspd);
  run(held.w, held.c, 1);
  assert.equal(brews(guard).length, 0);
  assert.equal(attrs.statsOf(guard).aspd, 100);
});

test('[敌能-43] two death blasts keep independent layers; the earlier one expires on its own', () => {
  for (const rank of RANKS) {
    const box = stand(rank, { count: 2 });
    const [g] = guards(box, 1);
    g.x = box.e.x;
    g.y = box.e.y;
    box.foes[0].hp = 0;
    step(box.w, box.c);
    step(box.w, box.c);
    run(box.w, box.c, 30);
    box.foes[1].hp = 0;
    step(box.w, box.c);
    step(box.w, box.c);
    const layers = brews(g);
    assert.deepEqual(layers.map((b) => b.left).sort((a, b) => a - b), [418, 450]);
    assert.equal(layers.reduce((n, b) => n + (b.mods.aspd ?? 0), 0), rank.speed * 2);
    assert.equal(attrs.statsOf(g).aspd, 20);
    run(box.w, box.c, 418);
    const left = brews(g);
    assert.equal(left.length, 1);
    assert.equal(left[0].left, 32);
    assert.equal(left[0].mods.aspd, rank.speed);
    assert.equal(attrs.statsOf(g).aspd, 100 + rank.speed);
  }
});

test('[敌能-43] [伤害-9] 青瓷 and 彩瓷 lose 1 HP only to arts and true; the shown damage stays; 生命流失 is the whole amount', () => {
  const qing = vessel('enemy_1204_msfhu', 4);
  const phys = strike(qing.w, qing.e, { type: 'phys', amount: 100 });
  assert.deepEqual([qing.e.hp, phys.back, phys.shown], [4, 100, 100]);
  const el = strike(qing.w, qing.e, { type: 'elemental', amount: 80 });
  assert.deepEqual([qing.e.hp, el.back, el.shown], [4, 80, 80]);
  const arts = strike(qing.w, qing.e, { type: 'arts', amount: 7 });
  assert.deepEqual([qing.e.hp, arts.back, arts.shown], [3, 7, 7]);
  const truth = strike(qing.w, qing.e, { type: 'true', amount: 0.4 });
  assert.deepEqual([qing.e.hp, truth.back, truth.shown], [2, 0.4, 0.4]);
  const loss = vessel('enemy_1204_msfhu', 4);
  assert.equal(damage.dealDamage(loss.w, null, loss.e, { type: 'phys', amount: 2, hpLoss: true }), 2);
  assert.equal(loss.e.hp, 2);
  assert.deepEqual(typeOf(qing.e), ACCEPTED);
  assert.deepEqual(typeOf(vessel('enemy_1204_msfhu_2', 6).e), ACCEPTED);
});

test('[敌能-43] four accepted hits fell 青瓷 and six fell 彩瓷; a body with no type filter still loses 1 to physical', () => {
  const qing = vessel('enemy_1204_msfhu', 4);
  for (let i = 0; i < 3; i++) damage.dealDamage(qing.w, null, qing.e, { type: 'arts', amount: 500 });
  assert.equal(qing.e.hp, 1);
  damage.dealDamage(qing.w, null, qing.e, { type: 'true', amount: 1 });
  assert.equal(qing.e.hp, 0);
  const cai = vessel('enemy_1204_msfhu_2', 6);
  for (let i = 0; i < 5; i++) damage.dealDamage(cai.w, null, cai.e, { type: 'true', amount: 9 });
  assert.equal(cai.e.hp, 1);
  damage.dealDamage(cai.w, null, cai.e, { type: 'arts', amount: 2 });
  assert.equal(cai.e.hp, 0);
  const plain = vessel('body', 3);
  damage.dealDamage(plain.w, null, plain.e, { type: 'phys', amount: 40 });
  assert.equal(plain.e.hp, 2);
});

/**
 * Talents after the PRTS extras merge. The summon key is a string, which EnemyDef's numeric blackboard does not allow.
 * @param {string} key
 * @param {Record<string, Record<string, number | string>>} talents
 */
function merged(key, talents) {
  const body = /** @type {EnemyDef} */ (/** @type {unknown} */ ({ name: key, maxHp: 1, atk: 0, def: 0, res: 0, moveSpeed: 1, talents }));
  const got = withFoeExtras(key, body).talents;
  if (!got) throw new Error(key);
  return got;
}

test('[敌能-43] the extras merge the splash, the fall rule and the type filter', () => {
  const peng = merged('enemy_1203_sfhu', {
    DeadSpawn: { enemy_key: 'enemy_1204_msfhu', cnt: 4 },
    DeadBoom: { duration: 15, interval: 3, attack_speed: -40, attack_speed_add: 0 },
  });
  const spawn = /** @type {{ enemy_key?: string, cnt?: number, fall?: number }} */ (peng.DeadSpawn);
  const boom = /** @type {Record<string, number>} */ (peng.DeadBoom);
  assert.equal(spawn.fall, 0);
  assert.equal(spawn.cnt, 4);
  assert.deepEqual(peng.Splash, { radius: 1 });
  assert.deepEqual(boom, {
    duration: 15, interval: 3, attack_speed: -40, attack_speed_add: 0, radius: 1.25, delay: 0, air: 0, atk_scale: 1,
  });
  const qi = merged('enemy_1203_sfhu_2', {
    DeadSpawn: { enemy_key: 'enemy_1204_msfhu_2', cnt: 4 },
    DeadBoom: { duration: 15, interval: 3, attack_speed: -50, attack_speed_add: 0 },
  });
  const qiSpawn = /** @type {{ fall?: number }} */ (qi.DeadSpawn);
  const qiBoom = /** @type {Record<string, number>} */ (qi.DeadBoom);
  assert.equal(qiSpawn.fall, undefined);
  assert.deepEqual(qi.Splash, { radius: 1 });
  assert.equal(qiBoom.attack_speed, -50);
  assert.equal(qiBoom.air, 0);
  assert.deepEqual(merged('enemy_1204_msfhu', { hitCount: {} }).hitCount, { arts: 1, true: 1 });
  assert.deepEqual(merged('enemy_1204_msfhu_2', { hitCount: {} }).hitCount, { arts: 1, true: 1 });
});
