// 「巨大的丑东西」's first knockdown (docs/spec/foes.md 敌能-125): a 10 s rebirth at full HP, its blast 2.17 s into it,
// then the 大祭司 form. The record is act1multi_fortress_rm01's; 砍伐 still has no behaviour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, damage, KIND } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras, uncoveredAbilities } from '../src/foes.js';
import rm01 from '../data/levels/act1multi_fortress_rm01.json' with { type: 'json' };

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const KEY = 'enemy_1512_mcmstr';
const raw = /** @type {EnemyDef} */ (/** @type {any} */ (rm01).enemies[KEY]);
/** The blast's frame after the knockdown's: 2.17 s (时间-2). */
const BLAST = 65;
/** The rebirth's frames: 10 s. */
const REBIRTH = 300;

/** @param {Record<string, Record<string, number>>} talents @param {any[]} [skills] @returns {EnemyDef} */
const named = (talents, skills) => ({ name: 'e', maxHp: 100, atk: 100, def: 0, res: 0, moveSpeed: 1, talents, ...(skills ? { skills } : {}) });

/**
 * 丑东西 held at (x, 1); `seats` deployed; operators deal nothing and have no defence. Its attack waits.
 * @param {[string, number, number][]} seats @param {number} [x]
 */
function stand(seats, x = 2) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [KEY]: withFoeExtras(KEY, raw) };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, KEY)])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 8 };
  for (const op of Object.values(c.operators)) Object.assign(op, { cost: 0, atk: 0, def: 0, res: 0, maxHp: 1e5 });
  c.operators.bird = { ...c.operators.sniper, name: 'bird', motion: 'FLY' };
  c.operators.far = { ...c.operators.sniper, name: 'far' };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = /** @type {Unit} */ (w.units.find((u) => u.kind === KIND.ENEMY));
  Object.assign(e, { x, y: 1, path: [], pt: 0 });
  status.applyStatus(e, 'root', {});
  e.atkCd = 5000;
  if (seats.length) step(w, c, seats.map(([op, row, col]) => [0, { type: 'deploy', op, row, col, dir: 0 }]));
  return { c, w, e };
}

/** Knocks it down; returns the frame of the knockdown. @param {World} w @param {any} c @param {Unit} e */
function knock(w, c, e) {
  damage.dealDamage(w, null, e, { type: 'true', amount: 1e9 });
  const f = w.frame;
  step(w, c);
  return f;
}

/** Steps to just past frame `f`, gathering the events with their frames. @param {World} w @param {any} c @param {number} f */
function until(w, c, f) {
  /** @type {any[]} */
  const out = [];
  while (w.frame <= f) for (const x of step(w, c)) out.push({ ...x, f: w.frame - 1 });
  return out;
}

/** @param {World} w @param {number} x @param {number} y */
function operatorAt(w, x, y) {
  const u = w.units.find((o) => o.kind === KIND.OPERATOR && o.x === x && o.y === y);
  if (!u) throw new Error(`no operator at ${x},${y}`);
  return u;
}

test('[敌能-125] [关卡-2] the fortress record takes the page marks and the blast numbers; only 砍伐 stays a gap', () => {
  const merged = withFoeExtras(KEY, raw);
  assert.deepEqual(merged.talents?.reborn, { duration: 10, page: 1 });
  assert.deepEqual(merged.talents?.bird_run, { move_speed: 0.7, magic_resistance: 40, def: 500, damage: 1300, page: 1 });
  assert.deepEqual(merged.skills?.find((s) => s.key === 'bomb[reborning]')?.bb, { stun: 25, atk_scale: 1.5, delay: 2.17, radius: 3 });
  assert.deepEqual(uncoveredAbilities([merged]), ['cut_tree']);
  assert.deepEqual(uncoveredAbilities([raw]), ['combat', 'reborn', 'bird_run', 'cut_tree', 'bomb[reborning]']);
  // 「先打几个字在这里」's shapes, and a marked one with one more key, are not these
  assert.deepEqual(uncoveredAbilities([named({ bird_run: { move_speed: 15, magic_resistance: -10, def: -200, damage: 0, max_hp: 0.3 } })]), ['bird_run']);
  assert.deepEqual(uncoveredAbilities([named({ bird_run: { move_speed: 0.7, magic_resistance: 40, def: 500, damage: 1300, page: 1, max_hp: 1 } })]), ['bird_run']);
  const bomb = (/** @type {Record<string, number>} */ bb) => [{ key: 'bomb[reborning]', cooldown: 9999, initCooldown: 9999, sp: 0, bb }];
  assert.deepEqual(uncoveredAbilities([named({}, bomb({ stun: 0, atk_scale: 0 }))]), ['bomb[reborning]']);
});

test('[敌能-125] [敌能-78] the first knockdown: full HP, 10 s it cannot be selected; the blast 2.17 s in, flyers too, 25 s stun', () => {
  const { c, w, e } = stand([['sniper', 0, 2], ['bird', 2, 2], ['far', 0, 3]], 0);
  const near = operatorAt(w, 2, 0), bird = operatorAt(w, 2, 2), far = operatorAt(w, 3, 0);
  const f = knock(w, c, e);
  assert.equal(w.units.includes(e), true);
  assert.equal(e.hp, e.maxHp);
  assert.equal(attrs.statsOf(e).invincible, true);
  const ev = until(w, c, f + BLAST);
  assert.deepEqual(ev.filter((x) => x.type === 'blast').map((x) => [x.f - f, x.x, x.y]), [[BLAST, 0, 1]]);
  const hits = ev.filter((x) => x.type === 'hit' && x.id === e.id);
  assert.deepEqual(hits.map((h) => [h.target, h.damage]).toSorted((a, b) => a[0] - b[0]), [[near.id, 1200], [bird.id, 1200]].toSorted((a, b) => a[0] - b[0]));
  assert.equal(far.hp, far.maxHp, '3.2 tiles away');
  for (const u of [near, bird]) assert.equal(attrs.statsOf(u).flags.stun, true);
  const stun = near.buffs.find((b) => b.key === 'stun');
  assert.ok(stun && stun.left > 25 * 30 - 3 && stun.left <= 25 * 30);
  assert.equal(until(w, c, f + REBIRTH - 1).some((x) => x.type === 'blast'), false, 'once');
});

test('[敌能-125] the rebirth over: the 大祭司 form, no attack, unblockable, 1300 true damage each second; the second knockdown is final', () => {
  const { c, w, e } = stand([['guard', 1, 2]]);
  const g = operatorAt(w, 2, 1);
  const f = knock(w, c, e);
  until(w, c, f + REBIRTH - 1);
  assert.equal(e.buffs.some((b) => b.key === 'priest'), false);
  until(w, c, f + REBIRTH);
  const s = attrs.statsOf(e);
  assert.deepEqual([s.def, s.res, Math.round(s.moveSpeed * 100) / 100], [2300, 60, 1.3]);
  assert.deepEqual([s.flags.noAttack, s.flags.unblockable], [true, true]);
  assert.notEqual(e.blockedBy, g.id);
  e.atkCd = 0;
  const later = until(w, c, f + REBIRTH + 30);
  assert.equal(later.some((x) => x.type === 'attack' && x.id === e.id), false);
  const losses = later.filter((x) => x.type === 'hit' && x.target === e.id);
  assert.deepEqual(losses.map((x) => [x.f - f, x.damage]), [[REBIRTH + 30, 1300]]);
  assert.equal(e.hp, e.maxHp - 1300);
  knock(w, c, e);
  assert.equal(w.units.includes(e), false);
});
