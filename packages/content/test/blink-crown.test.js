// 闪现 on a cooldown (docs/spec/foes.md 敌能-84): 弑君者. The 0.5s blink is an even 15-frame glide, and there is no hit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, status, buffs, attrs, routes, displacement, damage, blocking } from '@aue/sim';
import { secondsToFrames } from '@aue/math';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { levelAt, levelContent, LEVELS } from '../src/index.js';
import { uncoveredAbilities, withFoeExtras } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World */
/** @typedef {import('@aue/sim').Unit} Unit */
/** @typedef {{ c: any, w: World, e: Unit, g: Unit | undefined }} Box */

const real = levelContent('act1multi_fortress_hard-01', 'NORMAL');
const CROWN = 'enemy_1502_crowns';
const LEVEL = 'act1multi_fortress_hard-01';
/** Road along row 1, checkpoint at col 4, so a 1.5-tile blink from col 1 stays on the road. */
const ROAD = { start: { row: 2, col: 0 }, end: { row: 1, col: 5 }, motion: 'WALK', checkpoints: [{ type: 'MOVE', row: 1, col: 4, time: 0 }] };
/** Checkpoint on the left edge, so a nudge to x=0.2 aims off the map. */
const LEFT = { start: { row: 2, col: 0 }, end: { row: 1, col: 5 }, motion: 'WALK', checkpoints: [{ type: 'MOVE', row: 1, col: 0, time: 0 }] };
const DIST = 1.5;
const GLIDE = 15;
const SLIP = 30;
const CD = secondsToFrames(15);

/** @returns {any} */
const rawCrown = () => LEVELS[LEVEL].enemies[CROWN];

/** The level record plus the page's 0.5s. `init` replaces the first cooldown; omit it to keep 15. @param {any} raw @param {number} [init] */
function tuned(raw, init) {
  const e = withFoeExtras(CROWN, raw);
  const skills = (e.skills ?? []).map((/** @type {any} */ s) => ({ ...s, ...(init === undefined ? {} : { initCooldown: init }) }));
  return { ...e, baseAttackTime: 100, skills };
}

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
  return ev.filter((x) => x.type === 'hit' && x.id === id);
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
  if (!e) throw new Error('crown test: enemy did not spawn');
  routes.displace(e, at.x, at.y);
  if (opt.leg !== undefined) e.leg = opt.leg;
  if (opt.path) { e.path = [...opt.path]; e.pt = 0; }
  if (opt.root !== false) status.applyStatus(e, 'root', {});
  return e;
}

/**
 * Spawn `def` on the road, rooted, and deploy a guard on its tile unless asked not to.
 * @param {any} def @param {{ x: number, y: number }} at
 * @param {{ route?: object, tile?: { row: number, col: number, patch: object }, leg?: number, path?: number[], root?: boolean, deploy?: boolean, col?: number }} [opt]
 * @returns {Box}
 */
function field(def, at, opt = {}) {
  const c = /** @type {any} */ (tinyContent());
  c.behaviors = real.behaviors;
  c.enemies = { [CROWN]: def };
  c.level.routes = [opt.route ?? ROAD];
  c.level.waves = [oneWave([spawnAt(0, CROWN)])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 9 };
  Object.assign(c.operators.guard, { cost: 0, maxHp: 1e6, atk: 0, def: 0, baseAttackTime: 100 });
  copyTiles(c, opt.tile);
  const w = createWorld(c, { seed: 1, players: 1 });
  const opened = [...step(w, c)];
  const e = aimEnemy(w, at, opt);
  const col = opt.col ?? Math.round(at.x);
  const deploy = opt.deploy === false ? [] : [[0, { type: 'deploy', op: 'guard', row: 1, col, dir: 0 }]];
  opened.push(...step(w, c, /** @type {any} */ (deploy)));
  const g = w.units.find((u) => u.owner >= 0);
  if (opt.deploy !== false && !g) throw new Error('crown test: guard did not deploy');
  e.ab['@hits'] = hitsOf(opened, e.id).length;
  return { c, w, e, g };
}

/** @param {Box} box @param {number} n */
function steps(box, n) {
  /** @type {any[]} */
  const hits = [];
  for (let i = 0; i < n; i++) hits.push(...hitsOf(step(box.w, box.c), box.e.id));
  return hits;
}

/** Freeze ordinary attacks, then remember the guard. The deploy frame may already have hit. @param {Box} box @returns {{ hp: number, n: number }} */
function quiet(box) {
  const g = box.g;
  if (!g) throw new Error('crown test: no guard');
  box.e.atkCd = 1e9;
  return { hp: g.hp, n: box.w.units.length };
}

/** No new hit, no lost life, no summoned enemy. @param {Box} box @param {any[]} hits @param {number} hp @param {number} n */
function untouched(box, hits, hp, n) {
  const g = box.g;
  if (!g) throw new Error('crown test: no guard');
  assert.equal(hits.length, 0);
  assert.equal(g.hp, hp);
  assert.equal(box.w.units.filter((u) => u.owner < 0).length, 1);
  assert.equal(box.w.units.length, n);
}

/** initCooldown 0: the step after field is the first cast. @param {any} raw @param {{ x: number, y: number }} at @param {Parameters<typeof field>[2]} [opt] */
function soon(raw, at, opt) {
  const box = field(tuned(raw, 0), at, opt);
  quiet(box);
  return box;
}

test('[敌能-84] blocked with the cooldown ready, it slips and glides 1.5 tiles over 0.5s, invincible, and hits nobody', () => {
  const raw = rawCrown();
  assert.equal(raw.applyWay, 'MELEE');
  assert.equal(raw.atk, 700);
  assert.equal(raw.skills[0].cooldown, 15);
  assert.equal(raw.skills[0].initCooldown, 15);
  assert.equal(raw.skills[0].sp, 0);
  assert.deepEqual(raw.skills[0].bb, { dist: DIST });
  const box = soon(raw, { x: 1, y: 1 }, { col: 1 });
  const g = box.g;
  if (!g) throw new Error('crown test: no guard');
  const hp = g.hp, n = box.w.units.length;
  buffs.removeBuff(box.e, 'root');
  const hits = steps(box, 1);
  close(box.e.x, 1 + DIST / GLIDE);
  close(box.e.y, 1);
  assert.equal(box.e.blockedBy, -1);
  assert.equal(flag(box.e, 'unblockable'), true);
  assert.equal(flag(box.e, 'invincible'), true);
  assert.equal(flag(box.e, 'noDisplace'), true);
  assert.equal(box.e.ab['blink.k'], 1);
  assert.equal(box.e.ab['blink.cd'], CD - 1);
  assert.equal((box.e.ab['blink.sp'] ?? 0), 0);
  assert.equal(box.e.leg, 0);
  assert.equal(damage.dealDamage(box.w, g, box.e, { type: 'phys', amount: 800 }, box.c), 0);
  assert.equal(box.e.hp, box.e.maxHp);
  assert.equal(displacement.push(box.w, box.c, box.e, 30, { from: { x: 0, y: 1 }, effect: true }), false);
  hits.push(...steps(box, GLIDE - 1));
  close(box.e.x, 1 + DIST);
  close(box.e.y, 1);
  assert.equal(flag(box.e, 'invincible'), true);
  assert.equal(flag(box.e, 'unblockable'), true);
  assert.equal(flag(box.e, 'noDisplace'), true);
  assert.equal(box.e.ab['blink.k'], GLIDE);
  assert.equal(box.e.leg, 0);
  untouched(box, hits, hp, n);
});

test('[敌能-84] invincible lasts the 0.5s glide and unblockable the 1s slip; the route then resumes', () => {
  const box = soon(rawCrown(), { x: 1, y: 1 }, { col: 1 });
  const g = box.g;
  if (!g) throw new Error('crown test: no guard');
  const hp = g.hp;
  const n = box.w.units.length;
  buffs.removeBuff(box.e, 'root');
  steps(box, GLIDE);
  assert.equal(flag(box.e, 'invincible'), true);
  assert.equal(flag(box.e, 'noDisplace'), true);
  const xAt = box.e.x;
  const hits = steps(box, 1);
  assert.equal(flag(box.e, 'invincible'), false);
  assert.equal(flag(box.e, 'noDisplace'), false);
  assert.equal(flag(box.e, 'unblockable'), true);
  assert.equal(has(box.e, 'blinkGlide'), false);
  assert.equal(has(box.e, 'blinkSlip'), true);
  const walked = Math.abs(box.e.x - xAt);
  assert.ok(walked > 0);
  assert.ok(walked < 0.05);
  assert.equal(box.e.leg, 0);
  hits.push(...steps(box, SLIP - GLIDE - 1));
  assert.equal(flag(box.e, 'unblockable'), true);
  assert.equal(box.e.blockedBy, -1);
  hits.push(...steps(box, 1));
  assert.equal(flag(box.e, 'unblockable'), false);
  assert.equal(has(box.e, 'blinkSlip'), false);
  untouched(box, hits, hp, n);
});

/** ① without ②. The enemy stays rooted, so the guard blocks it again once the slip ends. @param {Box} box */
function slipOnly(box) {
  const g = box.g;
  if (!g) throw new Error('crown test: no guard');
  const hp = g.hp, x = box.e.x, y = box.e.y, n = box.w.units.length;
  const hits = steps(box, 1);
  assert.equal(box.e.blockedBy, -1);
  assert.equal(flag(box.e, 'unblockable'), true);
  assert.equal(flag(box.e, 'invincible'), false);
  assert.equal(flag(box.e, 'noDisplace'), false);
  assert.equal(has(box.e, 'blinkGlide'), false);
  assert.equal(box.e.x, x);
  assert.equal(box.e.y, y);
  hits.push(...steps(box, SLIP - 1));
  assert.equal(flag(box.e, 'unblockable'), true);
  assert.equal(box.e.blockedBy, -1);
  hits.push(...steps(box, 1));
  assert.equal(flag(box.e, 'unblockable'), false);
  assert.equal(box.e.blockedBy, g.id);
  untouched(box, hits, hp, n);
}

test('[敌能-84] an impassable, hole, off-map or zero-length destination only slips, and still hits nobody', () => {
  const raw = rawCrown();
  const wall = { row: 1, col: 2, patch: { passable: 'NONE' } };
  const hole = { row: 1, col: 2, patch: { key: 'tile_hole', passable: 'ALL' } };
  slipOnly(soon(raw, { x: 1, y: 1 }, { col: 1, tile: wall }));
  slipOnly(soon(raw, { x: 1, y: 1 }, { col: 1, tile: hole }));
  const off = soon(raw, { x: 0, y: 1 }, { col: 0, route: LEFT });
  routes.displace(off.e, 0.2, 1);
  slipOnly(off);
  slipOnly(soon(raw, { x: 4, y: 1 }, { col: 4 }));
});

/** The first tick whose cooldown is already 0. Spawn counts, so this is world frame 450. @param {Box} box */
function toFirst(box) {
  while (box.w.frame < CD) {
    assert.ok((box.e.ab['blink.cd'] ?? 0) > 0);
    assert.equal(has(box.e, 'blinkSlip'), false);
    step(box.w, box.c);
  }
  assert.equal(box.w.frame, CD);
  assert.equal(box.e.ab['blink.cd'], 0);
  assert.equal(has(box.e, 'blinkSlip'), false);
  const g = box.g;
  if (!g) throw new Error('crown test: no guard');
  assert.equal(box.e.blockedBy, g.id);
}

/** After a cast, wait out the slip, stand the guard on it, and block again. @param {Box} box @returns {number} */
function reblock(box) {
  const g = box.g;
  if (!g) throw new Error('crown test: no guard');
  let n = 0;
  while (flag(box.e, 'unblockable')) {
    step(box.w, box.c);
    n += 1;
    if (n > SLIP + 5) throw new Error('crown test: slip did not end');
  }
  routes.displace(g, box.e.x, box.e.y);
  blocking.blockBy(box.w, box.e, g);
  assert.equal(box.e.blockedBy, g.id);
  return n;
}

test('[敌能-84] the cooldown is 15s, the first cast is at 15s, and the next is 15s after the trigger', () => {
  const box = field(tuned(rawCrown()), { x: 1, y: 1 }, { col: 1 });
  const g = box.g;
  if (!g) throw new Error('crown test: no guard');
  quiet(box);
  assert.equal(has(box.e, 'root'), true);
  const hp = g.hp, n = box.w.units.length;
  toFirst(box);
  const t0 = box.w.frame;
  const hits = steps(box, 1);
  assert.equal(box.w.frame, t0 + 1);
  assert.equal(has(box.e, 'blinkSlip'), true);
  assert.equal(has(box.e, 'blinkGlide'), true);
  assert.equal(box.e.ab['blink.cd'], CD - 1);
  assert.equal(flag(box.e, 'invincible'), true);
  untouched(box, hits, hp, n);
  assert.equal(reblock(box), SLIP);
  const again = t0 + CD;
  while (box.w.frame < again) {
    step(box.w, box.c);
    assert.equal(has(box.e, 'blinkSlip'), false);
    assert.equal(box.e.ab['blink.k'], GLIDE);
  }
  assert.equal(box.w.frame, again);
  assert.equal(box.e.ab['blink.cd'], 0);
  assert.equal(box.e.blockedBy, g.id);
  steps(box, 1);
  assert.equal(has(box.e, 'blinkSlip'), true);
  assert.equal(box.e.ab['blink.k'], 1);
  assert.equal(box.e.ab['blink.cd'], CD - 1);
  assert.equal(g.hp, hp);
});

test('[敌能-84] silence, stun and no block do not spend a ready cooldown', () => {
  const raw = rawCrown();
  const silenced = soon(raw, { x: 1, y: 1 }, { col: 1 });
  status.applyStatus(silenced.e, 'silence', {});
  assert.equal(flag(silenced.e, 'silence'), true);
  steps(silenced, 1);
  assert.equal(silenced.e.ab['blink.cd'], 0);
  assert.equal(has(silenced.e, 'blinkSlip'), false);
  buffs.removeBuff(silenced.e, 'silence');
  steps(silenced, 1);
  assert.equal(has(silenced.e, 'blinkSlip'), true);
  assert.equal(silenced.e.ab['blink.cd'], CD - 1);
  const stunned = soon(raw, { x: 1, y: 1 }, { col: 1 });
  status.applyStatus(stunned.e, 'stun', {});
  assert.equal(attrs.statsOf(stunned.e).disabled, true);
  steps(stunned, 1);
  assert.equal(stunned.e.ab['blink.cd'], 0);
  assert.equal(has(stunned.e, 'blinkSlip'), false);
  buffs.removeBuff(stunned.e, 'stun');
  steps(stunned, 1);
  assert.equal(has(stunned.e, 'blinkSlip'), true);
  const loose = soon(raw, { x: 1, y: 1 }, { col: 1 });
  const g = loose.g;
  if (!g) throw new Error('crown test: no guard');
  blocking.release(loose.e);
  routes.displace(g, 0, 0);
  steps(loose, 1);
  assert.equal(loose.e.ab['blink.cd'], 0);
  assert.equal(has(loose.e, 'blinkSlip'), false);
  routes.displace(g, loose.e.x, loose.e.y);
  blocking.blockBy(loose.w, loose.e, g);
  steps(loose, 1);
  assert.equal(has(loose.e, 'blinkSlip'), true);
  assert.equal(loose.e.blockedBy, -1);
});

/** A cast already under way keeps gliding. @param {any} raw @param {(box: Box) => void} apply */
function stillGoing(raw, apply) {
  const box = soon(raw, { x: 1, y: 1 }, { col: 1 });
  steps(box, 1);
  apply(box);
  steps(box, GLIDE - 1);
  close(box.e.x, 1 + DIST);
  assert.equal(box.e.ab['blink.k'], GLIDE);
  assert.equal(flag(box.e, 'invincible'), true);
}

test('[敌能-84] silence or stun after the trigger does not cancel the glide', () => {
  stillGoing(rawCrown(), (box) => { status.applyStatus(box.e, 'silence', {}); });
  stillGoing(rawCrown(), (box) => { status.applyStatus(box.e, 'stun', {}); });
});

test('[敌能-84] an ordinary attack does not fill a bar, and there is no lasting 失衡免疫', () => {
  const raw = rawCrown();
  const armed = tuned(raw, 0);
  armed.skills[0].sp = 2;
  armed.baseAttackTime = raw.baseAttackTime;
  const box = field(armed, { x: 1, y: 1 }, { col: 1 });
  assert.ok(box.e.atkCd > 0);
  assert.equal(box.e.ab['@hits'], 1);
  assert.equal((box.e.ab['blink.sp'] ?? 0), 0);
  assert.equal(has(box.e, 'blinkSlip'), false);
  box.e.atkCd = 1e9;
  assert.equal(steps(box, 1).length, 0);
  assert.equal(has(box.e, 'blinkSlip'), true);
  assert.equal((box.e.ab['blink.sp'] ?? 0), 0);
  const bare = field(tuned(raw, 0), { x: 1, y: 1 }, { col: 1, deploy: false });
  const x = bare.e.x;
  status.applyStatus(bare.e, 'silence', {});
  assert.equal(flag(bare.e, 'silence'), true);
  assert.equal(has(bare.e, 'shiftImmune'), false);
  assert.equal(displacement.push(bare.w, bare.c, bare.e, 30, { from: { x: 0, y: 1 } }), true);
  assert.notEqual(bare.e.x, x);
});

test('[敌能-84] the last leg uses the next path point, and overshooting keeps the leg', () => {
  const raw = rawCrown();
  const aimed = soon(raw, { x: 1, y: 1 }, { col: 1, leg: 1, path: [1, 2] });
  steps(aimed, GLIDE);
  close(aimed.e.x, 1);
  close(aimed.e.y, 1 + DIST);
  assert.equal(aimed.e.leg, 1);
  const empty = soon(raw, { x: 1, y: 1 }, { col: 1, leg: 1, path: [] });
  steps(empty, GLIDE);
  close(empty.e.x, 1 + DIST);
  close(empty.e.y, 1);
  assert.equal(empty.e.leg, 1);
  const over = soon(raw, { x: 3, y: 1 }, { col: 3 });
  routes.displace(over.e, 3.2, 1);
  buffs.removeBuff(over.e, 'root');
  steps(over, GLIDE);
  close(over.e.x, 3.2 + DIST);
  assert.equal(over.e.leg, 0);
  const x = over.e.x;
  steps(over, 1);
  assert.ok(over.e.x < x);
  assert.equal(over.e.leg, 0);
});

test('[敌能-84] 卢西恩 and the other blink shapes stay uncovered; the fortress gap list loses blink', () => {
  const raw = rawCrown();
  assert.deepEqual(uncoveredAbilities([raw]), ['blink']);
  assert.deepEqual(uncoveredAbilities([withFoeExtras(CROWN, raw)]), []);
  const at = levelAt(LEVEL, 'NORMAL');
  assert.equal((at.level.uncovered ?? []).includes('blink'), false);
  const skill = real.enemies[CROWN].skills?.[0];
  assert.deepEqual(skill?.bb, { dist: DIST, glide: 0.5 });
  /** @param {Record<string, number>} bb */
  const foe = (bb) => ({
    name: 'x', maxHp: 1, atk: 1, def: 0, res: 0, moveSpeed: 1,
    skills: [{ key: 'blink', cooldown: 15, initCooldown: 15, sp: 0, bb }],
  });
  /** @type {Record<string, number>[]} */
  const shapes = [
    { dist: DIST },
    { range_radius: 2 },
    { atk_scale_blink: 1, max: 4 },
    { delay: 1, cooldown_0: 1 },
    { atk_scale: 1, dist: DIST, glide: 0.5 },
    { dist: DIST, glide: 0.5, extra: 1 },
  ];
  for (const bb of shapes) assert.deepEqual(uncoveredAbilities([foe(bb)]), ['blink']);
  assert.deepEqual(uncoveredAbilities([foe({ dist: DIST, glide: 0.5 })]), []);
  assert.deepEqual(uncoveredAbilities([foe({ atk_scale: 1, dist: DIST })]), []);
});
