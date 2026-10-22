// 闪现 (docs/spec/foes.md 敌能-73): “灰礼帽” and “见习灰礼帽”. The 2s blink is an even 60-frame glide.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, status, buffs, attrs, routes, displacement, damage, blocking } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { levelContent, LEVELS } from '../src/index.js';
import { uncoveredAbilities, withFoeExtras } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World */
/** @typedef {import('@aue/sim').Unit} Unit */
/** @typedef {{ c: any, w: World, e: Unit, g: Unit | undefined, opened: any[] }} Box */

const real = levelContent('act1multi_fortress_hard-01', 'NORMAL');
const HAT = 'enemy_1322_wdgyht';
const APPRENTICE = 'enemy_1322_wdgyht_2';
/** Road along row 1, checkpoint at col 4, so a 1.5-tile blink from col 1 stays on the road. */
const ROAD = { start: { row: 2, col: 0 }, end: { row: 1, col: 5 }, motion: 'WALK', checkpoints: [{ type: 'MOVE', row: 1, col: 4, time: 0 }] };
/** Checkpoint on the left edge, so a nudge to x=0.2 aims off the map. */
const LEFT = { start: { row: 2, col: 0 }, end: { row: 1, col: 5 }, motion: 'WALK', checkpoints: [{ type: 'MOVE', row: 1, col: 0, time: 0 }] };
const DIST = 1.5;
const GLIDE = 60;

/** @returns {any} */
const rawHat = () => LEVELS.act1multi_02.enemies[HAT];

/** “见习灰礼帽” is not in the level JSON. Same skill, the page's stats. @returns {any} */
function apprentice() {
  return {
    name: '“见习灰礼帽”', maxHp: 15000, atk: 1800, def: 375, res: 30, moveSpeed: 0.7, baseAttackTime: 6,
    rangeRadius: 0, applyWay: 'MELEE', motion: 'WALK', massLevel: 3, levelType: 'ELITE', lifePointReduce: 1,
    immune: ['silence', 'levitate'],
    skills: [{ key: 'blink', cooldown: 0, initCooldown: 0, sp: 2, bb: { atk_scale: 1, dist: DIST } }],
  };
}

/** The arena copy attacks once a second. The level record stays at 6. @param {string} key @param {any} raw */
const fast = (key, raw) => ({ ...withFoeExtras(key, raw), baseAttackTime: 1 });

/** @param {number} got @param {number} want */
function close(got, want) {
  assert.ok(Math.abs(got - want) < 1e-6, `${got} vs ${want}`);
}

/** @param {Unit} e @param {string} k */
const flag = (e, k) => !!attrs.statsOf(e).flags[k];
/** @param {Unit} e @param {string} k */
const has = (e, k) => e.buffs.some((b) => b.key === k);

/** @param {any[]} ev @param {number} id */
function hitsOf(ev, id) {
  return ev.filter((x) => x.type === 'hit' && x.id === id).map((x) => ({ damage: x.damage, target: x.target }));
}

/**
 * tinyContent reuses one object per tile kind. Copy before a patch, or every road cell changes with it.
 * @param {any} c @param {{ row: number, col: number, patch: object } | undefined} tile
 */
function copyTiles(c, tile) {
  /** @type {any[][]} */
  const tiles = c.level.tiles;
  c.level.tiles = tiles.map((row) => row.map((cell) => ({ ...cell })));
  if (tile) Object.assign(c.level.tiles[tile.row][tile.col], tile.patch);
}

/** @param {World} w @param {{ x: number, y: number }} at @param {{ leg?: number, path?: number[], root?: boolean }} opt @returns {Unit} */
function aimEnemy(w, at, opt) {
  const e = w.units.find((u) => u.owner < 0);
  if (!e) throw new Error('blink test: enemy did not spawn');
  routes.displace(e, at.x, at.y);
  if (opt.leg !== undefined) e.leg = opt.leg;
  if (opt.path) { e.path = [...opt.path]; e.pt = 0; }
  if (opt.root !== false) status.applyStatus(e, 'root', {});
  return e;
}

/**
 * @param {World} w @param {any} c @param {{ x: number, y: number }} at
 * @param {{ deploy?: boolean, col?: number }} opt
 * @returns {{ g: Unit | undefined, opened: any[] }}
 */
function openGuard(w, c, at, opt) {
  const col = opt.col ?? Math.round(at.x);
  const deploy = opt.deploy === false ? [] : [[0, { type: 'deploy', op: 'guard', row: 1, col, dir: 0 }]];
  const opened = [...step(w, c, /** @type {any} */ (deploy))];
  const g = w.units.find((u) => u.owner >= 0);
  if (opt.deploy !== false && !g) throw new Error('blink test: guard did not deploy');
  return { g, opened };
}

/**
 * Spawn `def` on the road, rooted, and deploy a guard on its tile unless asked not to.
 * @param {any} def @param {string} key @param {{ x: number, y: number }} at
 * @param {{ route?: object, tile?: { row: number, col: number, patch: object }, leg?: number, path?: number[], root?: boolean, deploy?: boolean, col?: number }} [opt]
 * @returns {Box}
 */
function field(def, key, at, opt = {}) {
  const c = /** @type {any} */ (tinyContent());
  c.behaviors = real.behaviors;
  c.enemies = { [key]: def };
  c.level.routes = [opt.route ?? ROAD];
  c.level.waves = [oneWave([spawnAt(0, key)])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 9 };
  Object.assign(c.operators.guard, { cost: 0, maxHp: 1e6, atk: 0, def: 0, baseAttackTime: 100 });
  copyTiles(c, opt.tile);
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = aimEnemy(w, at, opt);
  const { g, opened } = openGuard(w, c, at, opt);
  return { c, w, e, g, opened };
}

/** Two ordinary hits fill the bar. The second hit's own turn does not blink. @param {Box} box */
function charge(box) {
  const hits = hitsOf(box.opened, box.e.id);
  assert.equal(box.e.ab['blink.sp'] ?? 0, hits.length > 0 ? 1 : 0);
  assert.equal(has(box.e, 'blinkSlip'), false);
  for (let i = 0; i < 500 && (box.e.ab['blink.sp'] ?? 0) < 2; i++) {
    hits.push(...hitsOf(step(box.w, box.c), box.e.id));
    if ((box.e.ab['blink.sp'] ?? 0) === 1) assert.equal(has(box.e, 'blinkSlip'), false);
  }
  assert.equal(box.e.ab['blink.sp'], 2);
  assert.equal(has(box.e, 'blinkSlip'), false);
  assert.equal(hits.length, 2);
  assert.ok(hits.every((h) => h.damage === box.e.base.atk));
  return hits;
}

/** @param {Box} box @param {number} n */
function steps(box, n) {
  /** @type {{ frame: number, damage: number, target: number }[]} */
  const out = [];
  for (let i = 0; i < n; i++) {
    const frame = box.w.frame;
    for (const h of hitsOf(step(box.w, box.c), box.e.id)) out.push({ frame, ...h });
  }
  return out;
}

/** Full glide toward the checkpoint, the hit, then one resumed route step and a second cast. @param {string} key @param {any} raw */
function glideOnce(key, raw) {
  const box = field(fast(key, raw), key, { x: 1, y: 1 }, { col: 1 });
  const g = box.g;
  if (!g) throw new Error('blink test: no guard');
  charge(box);
  const atk = box.e.base.atk;
  buffs.removeBuff(box.e, 'root');
  const t0 = box.w.frame;
  assert.equal(steps(box, 1).length, 0);
  close(box.e.x, 1 + DIST / GLIDE);
  close(box.e.y, 1);
  assert.equal(box.e.blockedBy, -1);
  assert.equal(flag(box.e, 'unblockable'), true);
  assert.equal(flag(box.e, 'invincible'), true);
  assert.equal(flag(box.e, 'noDisplace'), true);
  assert.equal(box.e.ab['blink.sp'], 0);
  assert.equal(box.e.ab['blink.k'], 1);
  assert.equal(box.e.leg, 0);
  const glide = box.e.buffs.find((b) => b.key === 'blinkGlide');
  assert.ok(glide);
  assert.equal(glide.flags.unblockable, true);
  assert.equal(glide.flags.invincible, true);
  assert.equal(glide.flags.noDisplace, true);
  const hp = box.e.hp;
  assert.equal(damage.dealDamage(box.w, g, box.e, { type: 'phys', amount: 800 }, box.c), 0);
  assert.equal(box.e.hp, hp);
  assert.equal(displacement.push(box.w, box.c, box.e, 30, { from: { x: 0, y: 1 }, effect: true }), false);
  buffs.addBuff(box.e, buffs.makeBuff({ key: 'up', mods: { atkFlat: 500 } }));
  assert.equal(steps(box, 8).length, 0);
  const blow = steps(box, 1);
  assert.equal(blow.length, 1);
  assert.equal(blow[0].frame, t0 + 9);
  assert.equal(blow[0].damage, atk + 500);
  assert.equal(blow[0].target, g.id);
  assert.equal(box.e.ab['blink.sp'], 0);
  close(box.e.x, 1 + (10 * DIST) / GLIDE);
  assert.equal(steps(box, 50).length, 0);
  close(box.e.x, 1 + DIST);
  close(box.e.y, 1);
  assert.equal(flag(box.e, 'invincible'), true);
  assert.equal(flag(box.e, 'unblockable'), true);
  assert.equal(box.e.leg, 0);
  assert.equal(box.e.ab['blink.k'], GLIDE);
  const xAt = box.e.x;
  steps(box, 1);
  assert.equal(flag(box.e, 'invincible'), false);
  assert.equal(flag(box.e, 'unblockable'), false);
  assert.equal(has(box.e, 'blinkGlide'), false);
  assert.equal(has(box.e, 'blinkSlip'), false);
  const walked = Math.abs(box.e.x - xAt);
  assert.ok(walked > 0 && walked < 0.05);
  assert.equal(box.e.leg, 0);
  blocking.blockBy(box.w, box.e, g);
  box.e.atkCd = 0;
  steps(box, 1);
  assert.equal(box.e.ab['blink.sp'], 1);
  box.e.atkCd = 0;
  steps(box, 1);
  assert.equal(box.e.ab['blink.sp'], 2);
  assert.equal(has(box.e, 'blinkSlip'), false);
  const x2 = box.e.x;
  steps(box, 1);
  assert.equal(box.e.ab['blink.sp'], 0);
  assert.equal(box.e.blockedBy, -1);
  close(box.e.x, x2 + DIST / GLIDE);
  close(box.e.y, 1);
}

/**
 * ① and ③ without ②. `at`, when given, is where it stands as the bar is spent.
 * @param {Box} box @param {number} atk @param {{ x: number, y: number }} [at]
 */
function slipOnly(box, atk, at) {
  const g = box.g;
  if (!g) throw new Error('blink test: no guard');
  charge(box);
  if (at) routes.displace(box.e, at.x, at.y);
  const x = box.e.x, y = box.e.y, t0 = box.w.frame;
  steps(box, 1);
  assert.equal(box.e.ab['blink.sp'], 0);
  assert.equal(box.e.blockedBy, -1);
  assert.equal(flag(box.e, 'unblockable'), true);
  assert.equal(flag(box.e, 'invincible'), false);
  assert.equal(has(box.e, 'blinkGlide'), false);
  assert.equal(box.e.x, x);
  assert.equal(box.e.y, y);
  assert.equal(steps(box, 8).length, 0);
  const blow = steps(box, 1);
  assert.equal(blow.length, 1);
  assert.equal(blow[0].frame, t0 + 9);
  assert.equal(blow[0].damage, atk);
  assert.equal(blow[0].target, g.id);
  steps(box, 20);
  assert.equal(flag(box.e, 'unblockable'), true);
  assert.equal(box.e.blockedBy, -1);
  steps(box, 1);
  assert.equal(flag(box.e, 'unblockable'), false);
  assert.equal(box.e.blockedBy, g.id);
}

/** A cast already under way keeps gliding and still hits. @param {(box: Box) => void} apply */
function stillGoing(apply) {
  const box = field(fast(HAT, { ...rawHat(), immune: [] }), HAT, { x: 1, y: 1 }, { col: 1 });
  charge(box);
  buffs.removeBuff(box.e, 'root');
  steps(box, 1);
  apply(box);
  const blow = steps(box, 9);
  assert.equal(blow.length, 1);
  close(box.e.x, 1 + (10 * DIST) / GLIDE);
}

test('[敌能-73] two attacks fill the bar; blocked, it glides 1.5 tiles over 2s and hits the former blocker', () => {
  const hat = rawHat();
  assert.equal(hat.baseAttackTime, 6);
  assert.equal(hat.skills[0].sp, 2);
  assert.equal(hat.skills[0].cooldown, 0);
  assert.equal(hat.skills[0].initCooldown, 0);
  assert.deepEqual(hat.skills[0].bb, { atk_scale: 1, dist: 1.5 });
  assert.equal(LEVELS.act1multi_02.enemies[APPRENTICE], undefined);
  glideOnce(HAT, hat);
  glideOnce(APPRENTICE, apprentice());
});

test('[敌能-73] an impassable, hole, off-map or zero-length destination still slips and hits, without blinking', () => {
  const hat = () => fast(HAT, rawHat());
  const atk = rawHat().atk;
  slipOnly(field(hat(), HAT, { x: 1, y: 1 }, { col: 1, tile: { row: 1, col: 2, patch: { passable: 'NONE' } } }), atk);
  slipOnly(field(hat(), HAT, { x: 1, y: 1 }, { col: 1, tile: { row: 1, col: 2, patch: { key: 'tile_hole', passable: 'ALL' } } }), atk);
  slipOnly(field(hat(), HAT, { x: 0, y: 1 }, { col: 0, route: LEFT }), atk, { x: 0.2, y: 1 });
  slipOnly(field(hat(), HAT, { x: 4, y: 1 }, { col: 4 }), atk);
});

test('[敌能-73] silence, stun and no block hold a full bar; the next blocked turn spends it', () => {
  const open = fast(HAT, { ...rawHat(), immune: [] });
  const silenced = field(open, HAT, { x: 1, y: 1 }, { col: 1 });
  charge(silenced);
  status.applyStatus(silenced.e, 'silence', {});
  assert.equal(flag(silenced.e, 'silence'), true);
  steps(silenced, 1);
  assert.equal(silenced.e.ab['blink.sp'], 2);
  assert.equal(has(silenced.e, 'blinkSlip'), false);
  buffs.removeBuff(silenced.e, 'silence');
  steps(silenced, 1);
  assert.equal(silenced.e.ab['blink.sp'], 0);
  assert.equal(has(silenced.e, 'blinkSlip'), true);
  const stunned = field(fast(HAT, rawHat()), HAT, { x: 1, y: 1 }, { col: 1 });
  charge(stunned);
  status.applyStatus(stunned.e, 'stun', {});
  steps(stunned, 1);
  assert.equal(stunned.e.ab['blink.sp'], 2);
  assert.equal(has(stunned.e, 'blinkSlip'), false);
  const loose = field(fast(HAT, rawHat()), HAT, { x: 1, y: 1 }, { col: 1 });
  const g = loose.g;
  if (!g) throw new Error('blink test: no guard');
  charge(loose);
  blocking.release(loose.e);
  routes.displace(g, 0, 0);
  steps(loose, 1);
  assert.equal(loose.e.ab['blink.sp'], 2);
  assert.equal(has(loose.e, 'blinkSlip'), false);
  blocking.blockBy(loose.w, loose.e, g);
  steps(loose, 1);
  assert.equal(loose.e.ab['blink.sp'], 0);
  assert.equal(loose.e.blockedBy, -1);
});

test('[敌能-73] silence or stun after the trigger does not cancel the glide or the hit', () => {
  stillGoing((box) => { status.applyStatus(box.e, 'silence', {}); });
  stillGoing((box) => { status.applyStatus(box.e, 'stun', {}); });
});

test('[敌能-73] the hit is skipped when the former blocker has left the field', () => {
  const box = field(fast(HAT, rawHat()), HAT, { x: 1, y: 1 }, { col: 1 });
  const g = box.g;
  if (!g) throw new Error('blink test: no guard');
  charge(box);
  steps(box, 1);
  step(box.w, box.c, [[0, { type: 'retreat', unit: g.id }]]);
  assert.equal(box.w.units.includes(g), false);
  assert.equal(steps(box, 12).length, 0);
});

test('[敌能-73] 失衡免疫 is a lasting noDisplace from spawn; the glide has it even without that talent', () => {
  const born = field(fast(HAT, rawHat()), HAT, { x: 1, y: 1 }, { col: 1, deploy: false });
  const x = born.e.x;
  status.applyStatus(born.e, 'silence', {});
  status.applyStatus(born.e, 'levitate', {});
  assert.equal(flag(born.e, 'silence'), false);
  assert.equal(flag(born.e, 'levitate'), false);
  assert.equal(has(born.e, 'shiftImmune'), true);
  assert.equal(displacement.push(born.w, born.c, born.e, 30, { from: { x: 0, y: 1 }, effect: true }), false);
  assert.equal(born.e.x, x);
  const bare = field({ ...rawHat(), baseAttackTime: 1 }, HAT, { x: 1, y: 1 }, { col: 1, deploy: false });
  const x1 = bare.e.x;
  assert.equal(has(bare.e, 'shiftImmune'), false);
  assert.equal(displacement.push(bare.w, bare.c, bare.e, 30, { from: { x: 0, y: 1 } }), true);
  assert.notEqual(bare.e.x, x1);
  const only = field({ ...rawHat(), baseAttackTime: 1 }, HAT, { x: 1, y: 1 }, { col: 1 });
  charge(only);
  buffs.removeBuff(only.e, 'root');
  steps(only, 1);
  const x2 = only.e.x;
  assert.equal(has(only.e, 'blinkGlide'), true);
  assert.equal(displacement.push(only.w, only.c, only.e, 30, { from: { x: 0, y: 1 }, effect: true }), false);
  assert.equal(only.e.x, x2);
});

test('[敌能-73] the last leg blinks along the next path point, or the leg end when none is planned', () => {
  const def = fast(HAT, rawHat());
  const aimed = field(def, HAT, { x: 1, y: 1 }, { col: 1, leg: 1, path: [1, 2] });
  charge(aimed);
  steps(aimed, GLIDE);
  close(aimed.e.x, 1);
  close(aimed.e.y, 1 + DIST);
  assert.equal(aimed.e.leg, 1);
  const empty = field(def, HAT, { x: 1, y: 1 }, { col: 1, leg: 1, path: [] });
  charge(empty);
  steps(empty, GLIDE);
  close(empty.e.x, 1 + DIST);
  close(empty.e.y, 1);
  assert.equal(empty.e.leg, 1);
});

test('[敌能-73] overshooting the checkpoint keeps the leg, and the route resumes from the new point', () => {
  const box = field(fast(HAT, rawHat()), HAT, { x: 3, y: 1 }, { col: 3 });
  charge(box);
  routes.displace(box.e, 3.2, 1);
  buffs.removeBuff(box.e, 'root');
  steps(box, GLIDE);
  close(box.e.x, 3.2 + DIST);
  close(box.e.y, 1);
  assert.equal(box.e.leg, 0);
  const x = box.e.x, y = box.e.y;
  steps(box, 12);
  assert.equal(box.e.leg, 0);
  const moved = Math.abs(box.e.x - x) + Math.abs(box.e.y - y);
  assert.ok(moved > 0.05 && moved < 0.5);
});

test('[敌能-73] only numeric atk_scale and dist together are this blink; other shapes stay uncovered', () => {
  assert.deepEqual(uncoveredAbilities([withFoeExtras(HAT, rawHat()), withFoeExtras(APPRENTICE, apprentice())]), []);
  assert.deepEqual(uncoveredAbilities([rawHat()]), []);
  /** @param {Record<string, number>} bb */
  const skill = (bb) => ({
    name: 'x', maxHp: 1, atk: 1, def: 0, res: 0, moveSpeed: 1,
    skills: [{ key: 'blink', cooldown: 0, initCooldown: 0, sp: 0, bb }],
  });
  /** @type {Record<string, number>[]} */
  const shapes = [
    { dist: 1.5 },
    { range_radius: 2 },
    { atk_scale_blink: 1, max: 4 },
    { delay: 1, cooldown_0: 1 },
    { atk_scale: 1, dist: 1.5, extra: 1 },
  ];
  for (const bb of shapes) assert.deepEqual(uncoveredAbilities([skill(bb)]), ['blink']);
});
