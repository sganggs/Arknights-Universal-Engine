// 「巨大的丑东西」's first-form attack (docs/spec/foes.md 敌能-124): blocked, the blocker at the data's 350%; not
// blocked, one ground unit within the page's 2.5 and its 3×3 at 100%. The record is act1multi_fortress_rm01's; its
// rebirth, bomb, 大祭司 form and 砍伐 have no behaviour here and do nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, bus, KIND } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras, uncoveredAbilities } from '../src/foes.js';
import rm01 from '../data/levels/act1multi_fortress_rm01.json' with { type: 'json' };

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const KEY = 'enemy_1512_mcmstr';
const RAGE = 'attack@mcmstr_rage_attack.atk_scale';
const raw = /** @type {EnemyDef} */ (/** @type {any} */ (rm01).enemies[KEY]);
/** Ground target, a closer flyer, a diagonal neighbour, a tile two away. @type {[string, number, number][]} */
const FIELD = [['sniper', 0, 3], ['bird', 0, 2], ['side', 1, 4], ['far', 2, 3]];

/** @param {Record<string, Record<string, number>>} talents @returns {EnemyDef} */
const named = (talents) => ({ name: 'e', maxHp: 100, atk: 100, def: 0, res: 0, moveSpeed: 1, talents });

/**
 * 丑东西 held at (x, 1) on the road with its attack waiting; operators deal nothing and have no defence.
 * @param {[string, number, number][]} seats @param {{ x?: number, tune?: (c: any) => void }} [o]
 */
function stand(seats, o = {}) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [KEY]: withFoeExtras(KEY, raw) };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, KEY)])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 8 };
  const quiet = { cost: 0, atk: 0, def: 0, res: 0, blockCnt: 0, maxHp: 1e5 };
  Object.assign(c.operators.guard, quiet);
  Object.assign(c.operators.sniper, quiet, { tauntLevel: 1 });
  c.operators.bird = { ...c.operators.sniper, name: 'bird', motion: 'FLY', tauntLevel: 0 };
  c.operators.far = { ...c.operators.sniper, name: 'far', tauntLevel: 0 };
  c.operators.side = { ...c.operators.guard, name: 'side' };
  o.tune?.(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = /** @type {Unit} */ (w.units.find((u) => u.kind === KIND.ENEMY));
  Object.assign(e, { x: o.x ?? 2, y: 1, path: [], pt: 0 });
  status.applyStatus(e, 'root', {});
  e.atkCd = 200;
  if (seats.length) step(w, c, seats.map(([op, row, col]) => [0, { type: 'deploy', op, row, col, dir: 0 }]));
  return { c, w, e };
}

/** Its attack, ready now; the events of the frames until the swing is over. @param {ReturnType<typeof stand>} box */
function strike(box) {
  box.e.atkCd = 0;
  /** @type {any[]} */
  const ev = [...step(box.w, box.c)];
  for (let i = 0; i < 90 && box.e.swing; i++) ev.push(...step(box.w, box.c));
  return ev;
}
/** @param {World} w @param {number} x @param {number} y */
function operatorAt(w, x, y) {
  const u = w.units.find((u2) => u2.kind === KIND.OPERATOR && u2.x === x && u2.y === y);
  if (!u) throw new Error(`no operator at ${x},${y}`);
  return u;
}
/** @param {any[]} ev @param {number} id */
const hitsOf = (ev, id) => ev.filter((x) => x.type === 'hit' && x.id === id);

test('[敌能-124] [关卡-2] the fortress record takes the page radius and its combat is covered; the bare scale or one more key is not', () => {
  assert.equal(raw.applyWay, 'ALL');
  assert.equal(raw.rangeRadius, 0);
  assert.deepEqual(raw.talents?.combat, { [RAGE]: 3.5 });
  const merged = withFoeExtras(KEY, raw);
  assert.deepEqual(merged.talents?.combat, { [RAGE]: 3.5, radius: 2.5 });
  assert.equal(uncoveredAbilities([merged]).includes('combat'), false);
  assert.equal(uncoveredAbilities([raw]).includes('combat'), true);
  assert.deepEqual(uncoveredAbilities([named({ combat: { [RAGE]: 3.5, radius: 2.5, el: 1 } })]), ['combat']);
  assert.deepEqual(uncoveredAbilities([named({ combat: { [RAGE]: 3.5 } })]), ['combat']);
});

test('[敌能-124] [敌人攻击-1] blocked: the blocker alone at 350%, no splash, no shot', () => {
  const box = stand([['guard', 1, 3], ['sniper', 0, 3]], { tune: (c) => { c.operators.guard.blockCnt = 3; } });
  const g = operatorAt(box.w, 3, 1), s = operatorAt(box.w, 3, 0);
  box.e.x = 3;
  step(box.w, box.c);
  assert.equal(box.e.blockedBy, g.id);
  const ev = strike(box);
  const hits = hitsOf(ev, box.e.id);
  assert.deepEqual(hits.map((h) => [h.target, h.damage]), [[g.id, 800 * 3.5]]);
  assert.equal(s.hp, s.maxHp);
  assert.equal(ev.some((x) => x.type === 'shot' && x.id === box.e.id), false);
});

test('[敌能-124] [敌能-26] [攻击-3] not blocked: one ground unit within 2.5 at 100%, its 3×3 splashed, a flyer too; no shot', () => {
  const box = stand(FIELD);
  assert.equal(box.e.blockedBy, -1);
  /** @type {[number, string][]} */
  const kinds = [];
  bus.on(box.w, 'attackHit', (ctx) => { if (ctx.attacker.id === box.e.id) kinds.push([ctx.target.id, ctx.kind]); });
  const ev = strike(box);
  const main = operatorAt(box.w, 3, 0), bird = operatorAt(box.w, 2, 0), side = operatorAt(box.w, 4, 1), far = operatorAt(box.w, 3, 2);
  const attacks = ev.filter((x) => x.type === 'attack' && x.id === box.e.id);
  assert.deepEqual([attacks.length, attacks[0].target, attrs.statsOf(bird).flying], [1, main.id, true]);
  const hits = hitsOf(ev, box.e.id), of = (/** @type {number} */ id) => hits.filter((h) => h.target === id).map((h) => h.damage);
  assert.deepEqual([of(main.id), of(bird.id), of(side.id), of(far.id)], [[800], [800], [800], []]);
  assert.equal(far.hp, far.maxHp);
  assert.equal(ev.some((x) => x.type === 'shot' && x.id === box.e.id), false);
  assert.deepEqual(kinds.filter((k) => k[0] === main.id).map((k) => k[1]), ['main']);
  assert.deepEqual(kinds.filter((k) => k[0] !== main.id).map((k) => k[1]), ['splash', 'splash']);
});

test('[敌能-124] [敌人攻击-1] a ground unit beyond 2.5 + 0.25, or only a flyer within it, is not attacked', () => {
  const box = stand([['sniper', 0, 3], ['bird', 2, 2]], { x: 0 });
  const s = operatorAt(box.w, 3, 0), bird = operatorAt(box.w, 2, 2);
  assert.ok(Math.hypot(s.x - box.e.x, s.y - box.e.y) > 2.75);
  const ev = strike(box);
  assert.equal(ev.some((x) => x.type === 'attack' && x.id === box.e.id), false);
  assert.deepEqual([s.hp, bird.hp], [s.maxHp, bird.maxHp]);
});
