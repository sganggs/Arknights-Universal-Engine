// 轰炸 (docs/spec/foes.md 敌能-59) on the tiny map. The two guns are not in a packaged level, so the record is built
// here and the page-only duration, interval and times come from withFoeExtras.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, damage, status, buffs, displacement, devices } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent, withFoeExtras } from '../src/index.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

const BASE = {
  name: 'gun', maxHp: 15000, atk: 600, def: 1500, res: 10, moveSpeed: 0.5, applyWay: 'RANGED', rangeRadius: 3,
  baseAttackTime: 6, massLevel: 4, immune: ['silence'],
  skills: [{ key: 'Cannon', cooldown: 25, initCooldown: 10, sp: 0, bb: { atk_scale: 0.55 } }],
};

/** @param {Record<string, unknown>} [over] @param {string} [key] */
function gun(over = {}, key = 'enemy_1273_stmgun') {
  return withFoeExtras(key, /** @type {any} */ ({ ...BASE, ...over }));
}

/** @param {Record<string, any>} enemies @param {any[]} spawns @param {(c: any) => void} [tweak] */
function open(enemies, spawns, tweak) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = enemies;
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave(spawns)];
  c.level.options = { ...c.level.options, characterLimit: 8, initialCost: 99, maxCost: 99, costIncreaseTime: 1000 };
  for (const op of Object.values(c.operators)) Object.assign(op, { cost: 0, maxHp: 1e7, atk: 0, def: 500 });
  tweak?.(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  return { c, w };
}

/** @param {World} w @param {any} c @param {number} n */
const run = (w, c, n) => { for (let i = 0; i < n; i++) step(w, c); };
/** @param {World} w @param {string} key @returns {Unit[]} */
const ofKey = (w, key) => w.units.filter((u) => u.key === key);
/** @param {Unit} u @param {number} x @param {number} y */
const pin = (u, x, y) => { u.x = x; u.y = y; status.applyStatus(u, 'root', {}); };
/** @param {any[]} events @param {number} id */
const hitsOf = (events, id) => events.filter((ev) => ev.type === 'hit' && ev.id === id);
/** @param {any[]} events @param {number} id */
const attacksOf = (events, id) => events.filter((ev) => ev.type === 'attack' && ev.id === id);
/** @param {World} w @param {any} c @param {string} op @param {number} row @param {number} col @returns {Unit} */
function deployAt(w, c, op, row, col) {
  step(w, c, [[0, { type: 'deploy', op, row, col, dir: 0 }]]);
  return /** @type {Unit} */ (w.units.find((u) => u.key === op));
}

/** @param {Record<string, unknown>} [over] @param {(c: any) => void} [tweak] @param {string} [key] */
function world(over = {}, tweak, key = 'enemy_1273_stmgun') {
  const { c, w } = open({ [key]: gun(over, key) }, [spawnAt(0, key)], tweak);
  return { c, w, e: ofKey(w, key)[0] };
}

/** Roots the gun and keeps its normal attack from starting. @param {Unit} e @param {number} x @param {number} y */
function place(e, x, y) { pin(e, x, y); e.atkCd = 9999; }

/**
 * One step so a block can take hold, then the cast step. The cast step itself deals no bombardment hit.
 * @param {World} w @param {any} c @param {Unit} e
 */
function go(w, c, e) {
  e.atkCd = 9999;
  step(w, c);
  e.ab['Cannon.cd'] = 0;
  e.atkCd = 9999;
  return step(w, c);
}

/** The gun on tile (2, 1) and the guard deployed on that tile. @param {Record<string, unknown>} [over] @param {(c: any) => void} [tweak] */
function onGuard(over, tweak) {
  const { c, w, e } = world(over, tweak);
  place(e, 2, 1);
  return { c, w, e, g: deployAt(w, c, 'guard', 1, 2) };
}

/** Hits of the gun over n frames. @param {World} w @param {any} c @param {Unit} e @param {number} n */
function hitCount(w, c, e, n) {
  let k = 0;
  for (let i = 0; i < n; i++) k += hitsOf(step(w, c), e.id).length;
  return k;
}

/** The hit 15 frames after the previous check (the first call is the 0.5 s check). @param {World} w @param {any} c @param {Unit} e */
function nextHit(w, c, e) {
  run(w, c, 14);
  return hitsOf(step(w, c), e.id);
}

/** Attack events over n frames. @param {World} w @param {any} c @param {Unit} e @param {number} n */
function attackCount(w, c, e, n) {
  let k = 0;
  for (let i = 0; i < n; i++) k += attacksOf(step(w, c), e.id).length;
  return k;
}

test('[敌能-59] 轰炸: the first cooldown is 10 s, and it becomes ready on the 300th frame', () => {
  const { c, w, e } = world();
  assert.equal(e.ab['Cannon.cd'], 299);
  place(e, 2, 1);
  deployAt(w, c, 'guard', 1, 2);
  run(w, c, 298);
  assert.equal(e.ab['Cannon.cd'], 0);
  assert.equal(e.ab['Cannon.on'], undefined);
  step(w, c);
  assert.equal(e.ab['Cannon.on'], 1);
  assert.equal(e.ab['Cannon.cd'], 0);
});

test('[敌能-59] 轰炸: nobody in range does not cast and does not start the 25 s cooldown', () => {
  const { c, w, e } = world();
  place(e, 0, 2);
  e.ab['Cannon.cd'] = 0;
  const ev = step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 4, dir: 0 }]]);
  assert.equal(e.ab['Cannon.on'], undefined);
  assert.equal(e.ab['Cannon.cd'], 0);
  assert.equal(e.buffs.some((b) => b.key === 'bombard'), false);
  assert.equal(hitsOf(ev, e.id).length, 0);
});

test('[敌能-59] 轰炸: silence blocks the cast when the gun is not immune, and the cooldown stays ready', () => {
  const { c, w, e } = world({ immune: [] });
  place(e, 2, 1);
  deployAt(w, c, 'guard', 1, 2);
  status.applyStatus(e, 'silence', { frames: 600 });
  e.ab['Cannon.cd'] = 0;
  step(w, c);
  assert.equal(e.ab['Cannon.on'], undefined);
  assert.equal(e.ab['Cannon.cd'], 0);
  assert.equal(e.buffs.some((b) => b.key === 'bombard'), false);
});

test('[敌能-59] 轰炸: silence immunity still lets it cast, and a stun does not', () => {
  const silenced = onGuard();
  status.applyStatus(silenced.e, 'silence', { frames: 600 });
  go(silenced.w, silenced.c, silenced.e);
  assert.equal(silenced.e.ab['Cannon.on'], 1);
  const stunned = onGuard();
  status.applyStatus(stunned.e, 'stun', { frames: 60 });
  stunned.e.ab['Cannon.cd'] = 0;
  step(stunned.w, stunned.c);
  assert.equal(stunned.e.ab['Cannon.on'], undefined);
  assert.equal(stunned.e.ab['Cannon.cd'], 0);
});

test('[敌能-59] 轰炸: the anchor is the highest max HP, ahead of the blocker, and being blocked still casts', () => {
  const { c, w, e } = world({}, (cc) => { cc.operators.guard.maxHp = 500; cc.operators.sniper.maxHp = 9000; });
  place(e, 1, 1);
  const guard = deployAt(w, c, 'guard', 1, 1);
  guard.x = 1.4;
  const sniper = deployAt(w, c, 'sniper', 0, 3);
  go(w, c, e);
  assert.equal(e.blockedBy, guard.id);
  assert.equal(e.ab['Cannon.on'], 1);
  assert.equal(e.ab['Cannon.row'], 0);
  assert.equal(e.ab['Cannon.col'], 3);
  assert.equal(nextHit(w, c, e)[0]?.target, sniper.id);
});

test('[敌能-59] 轰炸: an equal max HP keeps the blocker, ahead of the later deploy', () => {
  const { c, w, e } = world({}, (cc) => { cc.operators.guard.maxHp = 1000; cc.operators.sniper.maxHp = 1000; });
  place(e, 1, 1);
  const guard = deployAt(w, c, 'guard', 1, 1);
  guard.x = 1.4;
  deployAt(w, c, 'sniper', 0, 3);
  go(w, c, e);
  assert.equal(e.blockedBy, guard.id);
  assert.equal(e.ab['Cannon.col'], 1);
  assert.equal(e.ab['Cannon.row'], 1);
  assert.equal(nextHit(w, c, e)[0]?.target, guard.id);
});

test('[敌能-59] 轰炸: a blocker outside the attack radius is not the anchor', () => {
  const { c, w, e } = world({ rangeRadius: 0.2 }, (cc) => {
    cc.operators.guard2 = { ...cc.operators.guard, name: 'guard2', blockCnt: 1, maxHp: 9000 };
    cc.operators.guard.blockCnt = 0;
    cc.operators.guard.maxHp = 100;
  });
  place(e, 1, 1);
  // A block starts only while the operator's x,y is a tile index (阻挡-2 looks the tile up that way). Slide it after.
  const blocker = deployAt(w, c, 'guard2', 1, 1);
  blocker.x = 1.6;
  const guard = deployAt(w, c, 'guard', 1, 1);
  guard.x = 1.2;
  go(w, c, e);
  assert.equal(e.blockedBy, blocker.id);
  assert.equal(e.ab['Cannon.col'], 1);
  assert.equal(e.ab['Cannon.row'], 1);
});

test('[敌能-59] 轰炸: a flying operator can be the anchor', () => {
  const { c, w, e } = world({}, (cc) => {
    cc.operators.sniper.motion = 'FLY';
    cc.operators.sniper.maxHp = 9000;
    cc.operators.guard.maxHp = 500;
  });
  place(e, 2, 1);
  deployAt(w, c, 'guard', 1, 0);
  const sniper = deployAt(w, c, 'sniper', 0, 3);
  go(w, c, e);
  assert.equal(e.ab['Cannon.col'], 3);
  assert.equal(e.ab['Cannon.row'], 0);
  assert.equal(nextHit(w, c, e)[0]?.target, sniper.id);
});

/** The high-max-HP sniper carries `flag`, so the guard is the anchor. @param {string} flag */
function flagged(flag) {
  const { c, w, e } = world({}, (cc) => { cc.operators.sniper.maxHp = 9000; cc.operators.guard.maxHp = 500; });
  place(e, 2, 1);
  const guard = deployAt(w, c, 'guard', 1, 0);
  const sniper = deployAt(w, c, 'sniper', 0, 3);
  buffs.addBuff(sniper, buffs.makeBuff({ key: 'hide', flags: { [flag]: true } }));
  go(w, c, e);
  assert.equal(e.ab['Cannon.col'], 0);
  assert.equal(nextHit(w, c, e)[0]?.target, guard.id);
}

test('[敌能-59] 轰炸: 隐匿, 迷彩 and 起飞 are not the anchor', () => {
  flagged('stealth');
  flagged('camou');
  flagged('liftoff');
});

test('[敌能-59] 轰炸: a neutral unit is not the anchor', () => {
  const key = 'enemy_1273_stmgun';
  const { c, w } = open({
    [key]: gun(),
    civ: { name: 'civ', maxHp: 50000, atk: 0, def: 0, res: 0, moveSpeed: 0, neutral: true },
  }, [spawnAt(0, key), spawnAt(0, 'civ')], (cc) => { cc.operators.guard.maxHp = 500; });
  const e = ofKey(w, key)[0], civ = ofKey(w, 'civ')[0];
  place(e, 2, 1);
  place(civ, 5, 1);
  const guard = deployAt(w, c, 'guard', 1, 0);
  go(w, c, e);
  assert.equal(e.ab['Cannon.col'], 0);
  assert.equal(nextHit(w, c, e)[0]?.target, guard.id);
});

test('[敌能-59] 轰炸: a device of ours with the highest max HP is the anchor', () => {
  const key = 'enemy_1273_stmgun';
  const { c, w } = open({ [key]: gun() }, [spawnAt(0, key)], (cc) => {
    cc.operators.guard.maxHp = 500;
    cc.devices = { ...(cc.devices ?? {}), wall: { name: 'wall', maxHp: 90000, atk: 0, def: 0, res: 0 } };
  });
  const e = ofKey(w, key)[0];
  place(e, 2, 1);
  deployAt(w, c, 'guard', 1, 0);
  devices.spawnDevice(w, c, 'wall', 1, 4);
  go(w, c, e);
  assert.equal(e.ab['Cannon.row'], 1);
  assert.equal(e.ab['Cannon.col'], 4);
});

test('[敌能-59] 轰炸: the 3×3 stays on the cast tile when the anchor moves', () => {
  const { c, w, e } = world({}, (cc) => { cc.operators.sniper.maxHp = 5000; cc.operators.guard.maxHp = 100; });
  place(e, 2, 1);
  const guard = deployAt(w, c, 'guard', 1, 0);
  const sniper = deployAt(w, c, 'sniper', 0, 3);
  go(w, c, e);
  assert.equal(e.ab['Cannon.row'], 0);
  assert.equal(e.ab['Cannon.col'], 3);
  assert.equal(nextHit(w, c, e)[0]?.target, sniper.id);
  sniper.x = 2;
  sniper.y = 0;
  assert.equal(nextHit(w, c, e)[0]?.target, sniper.id);
  sniper.x = 0;
  sniper.y = 0;
  guard.x = 3;
  guard.y = 1;
  assert.equal(nextHit(w, c, e)[0]?.target, guard.id);
  assert.equal(e.ab['Cannon.row'], 0);
  assert.equal(e.ab['Cannon.col'], 3);
});

test('[敌能-59] 轰炸: the zone stays when the anchor dies', () => {
  const { c, w, e } = world({}, (cc) => { cc.operators.sniper.maxHp = 5000; cc.operators.guard.maxHp = 400; });
  place(e, 2, 1);
  const guard = deployAt(w, c, 'guard', 1, 3);
  const sniper = deployAt(w, c, 'sniper', 0, 3);
  go(w, c, e);
  sniper.hp = 0;
  assert.equal(nextHit(w, c, e)[0]?.target, guard.id);
  assert.equal(e.ab['Cannon.row'], 0);
  assert.equal(e.ab['Cannon.col'], 3);
  assert.equal(w.units.includes(sniper), false);
});

test('[敌能-59] 轰炸: each tick hits the highest HP ratio, then switches when that ratio falls', () => {
  const { c, w, e } = world({}, (cc) => { cc.operators.guard.maxHp = 400; cc.operators.sniper.maxHp = 1000; });
  place(e, 1, 1);
  const guard = deployAt(w, c, 'guard', 1, 2);
  const sniper = deployAt(w, c, 'sniper', 0, 3);
  sniper.hp = 500;
  go(w, c, e);
  assert.equal(e.ab['Cannon.row'], 0);
  assert.equal(e.ab['Cannon.col'], 3);
  const dmg = 600 * 0.55;
  assert.equal(nextHit(w, c, e)[0]?.target, guard.id);
  assert.equal(guard.hp, 400 - dmg);
  assert.equal(nextHit(w, c, e)[0]?.target, sniper.id);
  assert.equal(sniper.hp, 500 - dmg);
});

test('[敌能-59] 轰炸: an equal HP ratio keeps the blocker', () => {
  const { c, w, e } = world({}, (cc) => { cc.operators.guard.maxHp = 500; cc.operators.sniper.maxHp = 2000; });
  place(e, 2.2, 1);
  const guard = deployAt(w, c, 'guard', 1, 2);
  const sniper = deployAt(w, c, 'sniper', 0, 3);
  go(w, c, e);
  assert.equal(e.blockedBy, guard.id);
  assert.equal(e.ab['Cannon.col'], 3);
  assert.equal(nextHit(w, c, e)[0]?.target, guard.id);
  assert.equal(sniper.hp, sniper.maxHp);
});

test('[敌能-59] 轰炸: an empty check does not spend the 10, so a later check can be the tenth', () => {
  const { c, w, e, g } = onGuard();
  go(w, c, e);
  g.x = 5;
  g.y = 0;
  assert.equal(hitCount(w, c, e, 30), 0);
  assert.equal(e.ab['Cannon.shots'], 0);
  g.x = 2;
  g.y = 1;
  assert.equal(hitCount(w, c, e, 135), 9);
  assert.equal(e.ab['Cannon.on'], 1);
  assert.equal(e.ab['Cannon.cd'], 0);
  assert.equal(hitCount(w, c, e, 15), 1);
  assert.equal(e.ab['Cannon.shots'], 10);
  assert.equal(e.ab['Cannon.on'], 0);
  assert.equal(e.ab['Cannon.cd'], 749);
});

test('[敌能-59] 轰炸: a full zone fires ten hits from 0.5 s to 5.0 s, and the show ends at 6.0 s', () => {
  const { c, w, e } = onGuard();
  const cast = go(w, c, e);
  assert.equal(hitsOf(cast, e.id).length, 0);
  assert.equal(e.ab['Cannon.t'], 0);
  assert.equal(e.ab['Cannon.left'], 180);
  assert.equal(hitCount(w, c, e, 150), 10);
  assert.equal(e.ab['Cannon.shots'], 10);
  assert.equal(e.ab['Cannon.cd'], 0);
  assert.equal(e.buffs.some((b) => b.key === 'bombard'), true);
  assert.equal(hitCount(w, c, e, 15), 0);
  assert.equal(hitCount(w, c, e, 15), 0);
  assert.equal(e.ab['Cannon.on'], 0);
  assert.equal(e.ab['Cannon.cd'], 749);
  assert.equal(e.buffs.some((b) => b.key === 'bombard'), false);
});

test('[敌能-59] 轰炸: the hit is arts of atk × 0.55, and it gives 受击回复 without spending the attack cooldown', () => {
  const { c, w, e, g } = onGuard({}, (cc) => {
    cc.operators.guard.res = 0;
    cc.operators.guard.def = 500;
    cc.operators.guard.skill = { id: 't', type: 'MANUAL', sp: 'hurt', cost: 10, init: 0, charges: 1, duration: 0, ammo: false, bb: {} };
  });
  go(w, c, e);
  assert.equal(nextHit(w, c, e).length, 1);
  assert.equal(g.maxHp - g.hp, 600 * 0.55);
  assert.equal(g.skill?.sp, 1);
  assert.equal(e.atkCd, 9999);
});

test('[敌能-59] 轰炸: RES applies, and the high-accuracy gun uses its own attack', () => {
  const soft = onGuard({}, (cc) => { cc.operators.guard.res = 50; });
  go(soft.w, soft.c, soft.e);
  nextHit(soft.w, soft.c, soft.e);
  assert.equal(soft.g.maxHp - soft.g.hp, 600 * 0.55 * 0.5);
  const key = 'enemy_1273_stmgun_2';
  const { c, w } = open({ [key]: gun({ atk: 750, maxHp: 18000 }, key) }, [spawnAt(0, key)]);
  const e = ofKey(w, key)[0];
  place(e, 2, 1);
  const g = deployAt(w, c, 'guard', 1, 2);
  go(w, c, e);
  const hit = nextHit(w, c, e);
  // The dealt amount is the hit's damage. Subtracting it from the 1e7 pool rounds 750 × 0.55 back to 412.5.
  assert.equal(hit[0]?.damage, 750 * 0.55);
  assert.ok(g.hp < g.maxHp);
});

test('[敌能-59] 轰炸: during the 6 s it does not attack normally, and the end frame can', () => {
  const { c, w, e } = onGuard();
  e.ab['Cannon.cd'] = 0;
  e.atkCd = 0;
  const cast = step(w, c);
  assert.equal(attacksOf(cast, e.id).length, 0);
  assert.equal(attackCount(w, c, e, 179), 0);
  assert.equal(e.atkCd, 0);
  assert.equal(e.buffs.some((b) => b.key === 'bombard'), true);
  assert.equal(attacksOf(step(w, c), e.id).length, 1);
  assert.ok(e.atkCd > 0);
  assert.equal(e.buffs.some((b) => b.key === 'bombard'), false);
});

test('[敌能-59] 轰炸: it does not walk during the show, and it walks on the frame the show ends', () => {
  const { c, w, e } = world({ atk: 0 });
  deployAt(w, c, 'guard', 1, 0);
  e.ab['Cannon.cd'] = 0;
  step(w, c);
  const y = e.y;
  run(w, c, 179);
  assert.equal(e.y, y);
  assert.equal(e.buffs.some((b) => b.key === 'bombard'), true);
  step(w, c);
  assert.notEqual(e.y, y);
  assert.equal(e.buffs.some((b) => b.key === 'bombard'), false);
});

test('[敌能-59] 轰炸: the immunities hold through the tenth shot and end with the show', () => {
  const { c, w, e } = onGuard();
  go(w, c, e);
  for (const k of /** @type {const} */ (['stun', 'freeze', 'levitate', 'sleep'])) assert.ok(status.applyStatus(e, k, { frames: 400 }));
  const during = attrs.statsOf(e);
  assert.equal(during.disabled, false);
  assert.equal(during.flying, false);
  assert.equal(during.invincible, false);
  assert.equal(during.flags.noAttack, true);
  assert.equal(during.immobile, true);
  assert.equal(displacement.displaceable(e), false);
  damage.dealDamage(w, null, e, { type: 'true', amount: 40 });
  assert.equal(e.hp, e.maxHp - 40);
  run(w, c, 160);
  assert.equal(attrs.statsOf(e).disabled, false);
  assert.equal(e.buffs.some((b) => b.key === 'stun'), true);
  run(w, c, 20);
  const after = attrs.statsOf(e);
  assert.equal(after.disabled, true);
  assert.equal(after.flying, true);
  assert.equal(after.invincible, true);
  assert.equal(e.buffs.some((b) => b.key === 'bombard'), false);
  assert.equal(e.buffs.some((b) => b.key === 'stun'), true);
  const held = e.hp;
  damage.dealDamage(w, null, e, { type: 'true', amount: 40 });
  assert.equal(e.hp, held);
});

test('[敌能-59] 轰炸: the 25 s cooldown starts when the show ends, and the next cast is 750 frames later', () => {
  const { c, w, e } = onGuard();
  go(w, c, e);
  run(w, c, 150);
  assert.equal(e.ab['Cannon.cd'], 0);
  assert.equal(e.ab['Cannon.on'], 1);
  run(w, c, 30);
  assert.equal(e.ab['Cannon.cd'], 749);
  assert.equal(e.ab['Cannon.on'], 0);
  run(w, c, 749);
  assert.equal(e.ab['Cannon.cd'], 0);
  assert.equal(e.ab['Cannon.on'], 0);
  step(w, c);
  assert.equal(e.ab['Cannon.on'], 1);
});
