// 卢西恩's 闪现 (docs/spec/foes.md 敌能-156): 弑君者's slip and glide (敌能-84) and the 不祥幻影 it leaves where the blink
// starts; the phantom's own abilities; the blink and the AOE in one turn. Neither enemy is in a shipped level: the
// records are built from enemy_database (ArknightsGameData 17759cc8, level 0).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, status, attrs, routes, damage, elements, bus, stateHash, takeSnapshot, restoreSnapshot, KIND } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras, withoutIncomplete } from '../src/foes.js';

/** @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef @typedef {import('@aue/sim').World} World */

const LUCIEN_KEY = 'enemy_2016_csphtm';
const PHANTOM_KEY = 'enemy_2017_csphts';
const TALENTS = Object.freeze({ penetrate: { def_penetrate: 0.4 }, evade: { prob: 0.4 }, combat: { 'attack@ep_damage_ratio': 0.2 } });
const AOE = Object.freeze({ key: 'aoe', cooldown: 10, initCooldown: 5, sp: 0, bb: { ep_damage_ratio: 0.2, atk_scale: 0.8 } });
/** 卢西恩，“猩红血钻” at level 0 (enemy_database). @type {EnemyDef} */
const LUCIEN = /** @type {any} */ ({
  name: '卢西恩，“猩红血钻”', maxHp: 80000, atk: 1500, def: 600, res: 40, moveSpeed: 0.6, baseAttackTime: 3, rangeRadius: 0, applyWay: 'MELEE',
  motion: 'WALK', massLevel: 6, levelType: 'BOSS', lifePointReduce: 30, immune: ['stun', 'silence', 'sleep', 'freeze'], talents: TALENTS,
  skills: [{ key: 'blink', cooldown: 15, initCooldown: 10, sp: 0, bb: { dist: 1.5 } }, AOE],
});
/** 不祥幻影 at level 0 (enemy_database). @type {EnemyDef} */
const PHANTOM = /** @type {any} */ ({
  name: '不祥幻影', maxHp: 10000, atk: 750, def: 400, res: 20, moveSpeed: 0.6, baseAttackTime: 3, rangeRadius: 0, applyWay: 'MELEE',
  motion: 'WALK', massLevel: 2, levelType: 'ELITE', lifePointReduce: 1, talents: TALENTS, skills: [AOE],
});
/** Road along row 1, checkpoint at col 4 (as 敌能-84's tests): a 1.5-tile blink from col 1 stays on the road. */
const ROAD = { start: { row: 2, col: 0 }, end: { row: 1, col: 5 }, motion: 'WALK', checkpoints: [{ type: 'MOVE', row: 1, col: 4, time: 0 }] };
/** Frames: the slip, the 0.5 s glide, the blink's cooldown. */
const SLIP = 30, GLIDE = 15, CD = 450;

/**
 * The content's record of `key` — its extras in — with these skill fields (`blink`, `aoe`) and blackboard keys
 * (`blinkBb`, `aoeBb`) put over them, incomplete abilities dropped. @param {string} key @param {any} [o] @returns {EnemyDef}
 */
function rec(key, o = {}) {
  const def = withFoeExtras(key, key === LUCIEN_KEY ? LUCIEN : PHANTOM);
  const skills = (def.skills ?? []).map((s) => ({ ...s, ...(o[s.key] ?? {}), bb: { ...s.bb, ...(o[`${s.key}Bb`] ?? {}) } }));
  return withoutIncomplete({ ...def, skills });
}

/** 卢西恩 with its blink ready at once and its AOE far off. */
const READY = { blink: { initCooldown: 0 }, aoe: { initCooldown: 99 } };

/**
 * 卢西恩 (`o.lucien`, else READY) rooted on the road at `o.x` (1) in row 1, a guard deployed on tile (1, 1) on the next
 * step, which blocks it, and its normal attack held off after that. `o.phantom` is the content's 不祥幻影 (null: none),
 * `o.more` more enemies, `o.tile` patches one tile. @param {any} [o]
 */
function field(o = {}) {
  const c = /** @type {any} */ (tinyContent());
  c.behaviors = skeletonContent.behaviors;
  c.enemies = { [LUCIEN_KEY]: o.lucien ?? rec(LUCIEN_KEY, READY), ...(o.phantom === null ? {} : { [PHANTOM_KEY]: o.phantom ?? rec(PHANTOM_KEY) }), ...(o.more ?? {}) };
  c.level.routes = [ROAD];
  c.level.tiles = c.level.tiles.map((/** @type {any[]} */ row) => row.map((cell) => ({ ...cell })));
  if (o.tile) Object.assign(c.level.tiles[o.tile.row][o.tile.col], o.tile.patch);
  c.level.waves = [oneWave([spawnAt(0, LUCIEN_KEY)])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 9 };
  Object.assign(c.operators.guard, { cost: 0, maxHp: 1e6, atk: 0, def: 1000, res: 0, maxEp: 1000, baseAttackTime: 100 });
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = /** @type {Unit} */ (w.units.find((u) => u.key === LUCIEN_KEY));
  routes.displace(e, o.x ?? 1, 1);
  status.applyStatus(e, 'root', {});
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  e.atkCd = 1e9;
  const g = /** @type {Unit} */ (w.units.find((u) => u.kind === KIND.OPERATOR));
  return { c, w, e, g };
}

/** @param {{ w: World, c: any }} box @param {number} n */
function steps(box, n) {
  for (let i = 0; i < n; i++) step(box.w, box.c);
}

/** @param {number} got @param {number} want @param {string} [what] */
function close(got, want, what) {
  assert.ok(Math.abs(got - want) < 1e-9, `${what ?? ''} ${got} vs ${want}`);
}

/** @param {Unit} e @param {string} k */
const flag = (e, k) => !!attrs.statsOf(e).flags[k];
/** @param {World} w @param {string} key */
const all = (w, key) => w.units.filter((u) => u.key === key);

test('[敌能-156] [敌能-84] 闪现: blocked and ready it slips, glides 1.5 tiles over 0.5 s, and leaves one 不祥幻影 where it started, on its route and leg', () => {
  const box = field({ x: 1.2 }), { e, g, w } = box;
  assert.equal(e.blockedBy, g.id);
  const x0 = e.x, leg = e.leg, n = w.units.length;
  assert.equal(x0, 1.5, 'the guard deployed on its tile set it 0.5 from its centre (阻挡-4): no tile centre');
  step(w, box.c);
  const shades = all(w, PHANTOM_KEY);
  assert.equal(shades.length, 1);
  const p = shades[0];
  assert.deepEqual([p.x, p.y, p.route, p.leg, w.units.length], [x0, 1, e.route, leg, n + 1], 'where the blink starts, on its route from its leg');
  close(e.x, x0 + 1.5 / GLIDE, 'the first step of the glide');
  assert.deepEqual([e.blockedBy, flag(e, 'unblockable'), flag(e, 'invincible'), flag(e, 'noDisplace'), e.ab['blink.cd']], [-1, true, true, true, CD - 1]);
  assert.equal(e.atkCd, 1e9 - 1, 'the blink takes no attack');
  assert.equal(p.blockedBy, g.id, 'the guard it slipped now holds the phantom');
  steps(box, GLIDE - 1);
  close(e.x, x0 + 1.5, 'the whole 1.5 tiles at the 15th frame');
  assert.equal(flag(e, 'invincible'), true);
  steps(box, 1);
  assert.deepEqual([flag(e, 'invincible'), flag(e, 'noDisplace'), flag(e, 'unblockable')], [false, false, true], 'the glide is over, the 1 s slip not');
  steps(box, SLIP - GLIDE);
  assert.equal(flag(e, 'unblockable'), false);
  assert.equal(all(w, PHANTOM_KEY).length, 1, 'one phantom for one blink');
});

test('[敌能-156] 闪现 first at 10 s (frame 300), as the data\'s initCooldown says', () => {
  const box = field({ lucien: rec(LUCIEN_KEY, { aoe: { initCooldown: 99 } }) });
  while (box.w.frame < 300) {
    assert.equal(all(box.w, PHANTOM_KEY).length, 0, `frame ${box.w.frame}`);
    step(box.w, box.c);
  }
  assert.equal(box.e.blockedBy, box.g.id);
  steps(box, 1);
  assert.deepEqual([all(box.w, PHANTOM_KEY).length, box.e.ab['blink.cd']], [1, CD - 1]);
});

test('[敌能-156] 闪现\'s numbers are the blackboard\'s: dist, glide in frames, and the enemy it leaves', () => {
  const other = { ...rec(PHANTOM_KEY), name: 'other' };
  const box = field({ lucien: rec(LUCIEN_KEY, { ...READY, blinkBb: { dist: 1, glide: 0.3, enemy_key: 'enemy_other' } }), more: { enemy_other: other } });
  steps(box, 1);
  close(box.e.x, 1 + 1 / 9, '0.3 s is 9 frames');
  assert.deepEqual([all(box.w, 'enemy_other').length, all(box.w, PHANTOM_KEY).length], [1, 0], 'its enemy_key, not the phantom by name');
  steps(box, 8);
  close(box.e.x, 2);
  assert.equal(flag(box.e, 'invincible'), true);
  steps(box, 1);
  assert.equal(flag(box.e, 'invincible'), false);
});

test('[敌能-156] no ②, no 幻影: a destination it may not stand on only slips; a key the content lacks brings no one', () => {
  const wall = field({ tile: { row: 1, col: 2, patch: { passable: 'NONE' } } });
  const n = wall.w.units.length;
  steps(wall, 1);
  assert.deepEqual([wall.e.x, wall.e.y, wall.w.units.length, wall.e.blockedBy, flag(wall.e, 'unblockable'), flag(wall.e, 'invincible')], [1, 1, n, -1, true, false]);
  assert.equal(wall.e.ab['blink.cd'], CD - 1, 'the skill was used all the same (敌能-84)');
  const lone = field({ phantom: null });
  const m = lone.w.units.length;
  steps(lone, 1);
  close(lone.e.x, 1 + 1.5 / GLIDE);
  assert.equal(lone.w.units.length, m, 'no 不祥幻影 in the content: no one appears');
});

test('[敌能-156] the 不祥幻影: its talents from its spawn, its AOE 5 s after it, taking that attack; it stays when 卢西恩 leaves', () => {
  const box = field(), { w, g } = box;
  steps(box, 1);
  const p = all(w, PHANTOM_KEY)[0], born = w.frame - 1;
  assert.deepEqual(p.buffs.find((b) => b.key === 'lucienPierce')?.mods, { defIgnorePct: 0.4 });
  steps(box, 1);
  assert.equal(p.buffs.some((b) => b.key === 'lucienEvade'), false, 'blocked by the guard: no dodge');
  assert.ok(p.ab['aoe.cd'] > 0);
  while (w.frame < born + 150) step(w, box.c);
  const nerve = elements.epOf(g, 'SANITY');
  step(w, box.c);
  assert.equal(p.ab['aoe.cd'], 299, 'cast 150 frames after the frame it appeared');
  assert.equal(p.atkCd, 89, 'its attack waits an interval');
  assert.equal(nerve - elements.epOf(g, 'SANITY'), 150, '750 × 0.2 神经损伤 on the guard');
  damage.knockDown(box.e);
  step(w, box.c);
  assert.deepEqual([w.units.includes(box.e), w.units.includes(p), p.hp > 0], [false, true, true], '卢西恩 gone, the phantom stays');
});

/** The damage 卢西恩 deals from now on, frame by frame. @param {{ w: World, e: Unit }} box @returns {Record<number, number>} */
function dealt(box) {
  /** @type {Record<number, number>} */
  const at = {};
  bus.on(box.w, 'damaged', (k) => { if (k.source === box.e) at[box.w.frame] = (at[box.w.frame] ?? 0) + k.amount; });
  return at;
}

test('[敌能-156] two skills in one turn: the blink goes, the AOE waits for its next turn; the AOE alone goes at once', () => {
  const box = field({ lucien: rec(LUCIEN_KEY, { blink: { initCooldown: 99 }, aoe: { initCooldown: 99 } }) }), { e } = box;
  const by = dealt(box), t = box.w.frame;
  e.ab['blink.cd'] = 0;
  e.ab['aoe.cd'] = 0;
  steps(box, 1);
  assert.equal(all(box.w, PHANTOM_KEY).length, 1, 'the blink, first in the table');
  assert.deepEqual([by[t], e.ab['aoe.cd']], [undefined, 0], 'no AOE in that turn: still ready');
  steps(box, 1);
  assert.deepEqual([by[t + 1], e.ab['aoe.cd']], [600, 299], 'the next turn: 1200 − 0.6 × 1000 on the guard');
  const solo = field({ lucien: rec(LUCIEN_KEY, { blink: { initCooldown: 99 }, aoe: { initCooldown: 99 } }) });
  const once = dealt(solo), u = solo.w.frame;
  solo.e.ab['aoe.cd'] = 0;
  steps(solo, 1);
  assert.deepEqual([once[u], all(solo.w, PHANTOM_KEY).length], [600, 0], 'the blink not ready: the AOE in this turn');
});

test('[敌能-156] [同步-2] a match restored mid-glide goes on alike, the phantom with it', () => {
  const box = field();
  steps(box, 5);
  const copy = { w: restoreSnapshot(JSON.parse(JSON.stringify(takeSnapshot(box.w)))), c: box.c };
  steps(box, 40);
  steps(copy, 40);
  assert.equal(stateHash(copy.w), stateHash(box.w));
  assert.equal(all(copy.w, PHANTOM_KEY).length, 1);
});
