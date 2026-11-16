// 雪孩子 / 雪顽童 (docs/spec/foes.md 敌能-150): pushed or pulled so that high ground stops its 失衡 slide, it takes its
// hitWall.value as true damage at its next turn, then not again for the page's 5 s (`rearm`). Records are built here from
// enemy_database (ArknightsGameData 17759cc8, level 0): these enemies are in no shipped level. The tiny map's high
// ground is made FLY_ONLY, as tile_wall is in the level data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, displacement, status, buffs, bus, KIND } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras, uncoveredAbilities, withoutIncomplete, FOE_EXTRAS } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const CHILD = 'enemy_10138_xdsnow';
const IMP = 'enemy_10138_xdsnow_2';
const YETI = 'enemy_19010_akplsn';

/**
 * A snow child's level-0 record (enemy_database: DEF 200, RES 10, 重量 1, move 0.6, interval 5) with its extras merged.
 * @param {string} key @param {number} maxHp @param {number} atk @param {Record<string, number | string>} [hitWall] the data's is { value: 5000 }
 * @returns {EnemyDef}
 */
function record(key, maxHp, atk, hitWall = { value: 5000 }) {
  return withFoeExtras(key, /** @type {any} */ ({
    name: key, maxHp, atk, def: 200, res: 10, moveSpeed: 0.6, baseAttackTime: 5, massLevel: 1, applyWay: 'MELEE', motion: 'WALK',
    talents: { hitWall },
  }));
}
const child = () => record(CHILD, 5500, 200);
const imp = () => record(IMP, 7000, 300);

/** A record with another `rearm`. @param {EnemyDef} def @param {number} rearm @returns {EnemyDef} */
const rearmed = (def, rearm) => ({ ...def, talents: { hitWall: { ...def.talents?.hitWall, rearm } } });

/**
 * The tiny map, its high ground FLY_ONLY, with `defs` and one SPAWN at frame 0 for each of `keys`.
 * @param {Record<string, EnemyDef>} defs @param {string[]} keys @returns {any}
 */
function content(defs, keys) {
  const c = /** @type {any} */ (tinyContent());
  c.level.tiles = c.level.tiles.map((/** @type {any[]} */ row) => row.map((t) => (t.height === 'HIGHLAND' ? { ...t, passable: 'FLY_ONLY' } : t)));
  c.enemies = defs;
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave(keys.map((key) => spawnAt(0, key)))];
  return c;
}

/**
 * The enemies `at` lists — [key, x, y], in spawn order — spawned on that map and held by a root there.
 * @param {Record<string, EnemyDef>} defs @param {[string, number, number][]} at @param {{ walk?: boolean, tune?: (c: any) => void }} [o]
 */
function open(defs, at, o = {}) {
  const c = content(defs, at.map(([key]) => key));
  o.tune?.(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const foes = w.units.filter((u) => u.kind === KIND.ENEMY);
  assert.equal(foes.length, at.length);
  if (!o.walk) at.forEach(([, x, y], i) => { Object.assign(foes[i], { x, y }); status.applyStatus(foes[i], 'root', {}); });
  return { w, c, foes, e: foes[0] };
}

/** Pushes `e` from 1 below: at (x, 1.45) its first step enters row 2's high ground, and stops (位移-2). @param {ReturnType<typeof open>} box @param {Unit} e */
function bump(box, e) {
  assert.equal(displacement.push(box.w, box.c, e, 2, { from: { x: e.x, y: e.y - 1 } }), true);
  assert.deepEqual([e.slide?.vx, e.slide?.vy], [0, 0], 'stopped where it is');
}

/** Steps until the frame about to run is `frame`. @param {ReturnType<typeof open>} box @param {number} frame */
function until(box, frame) {
  while (box.w.frame < frame) step(box.w, box.c);
}

/** The `damaged` events on `e`. @param {World} w @param {Unit} e */
function damages(w, e) {
  /** @type {any[]} */
  const out = [];
  bus.on(w, 'damaged', (ev) => { if (ev.target === e) out.push(ev); });
  return out;
}

test('[敌能-150] the pages\' extras: `rearm` 5 on 雪孩子 and 雪顽童; 直立小雪怪\'s bare `value` stays uncovered (关卡-2)', () => {
  assert.deepEqual(FOE_EXTRAS[CHILD].talents, { hitWall: { rearm: 5 } });
  assert.deepEqual(FOE_EXTRAS[IMP].talents, { hitWall: { rearm: 5 } });
  assert.ok(FOE_EXTRAS[CHILD].source.endsWith('&oldid=373740') && FOE_EXTRAS[IMP].source.endsWith('&oldid=373742'));
  assert.equal(FOE_EXTRAS[YETI], undefined);
  assert.deepEqual(child().talents, { hitWall: { value: 5000, rearm: 5 } });
  assert.deepEqual(uncoveredAbilities([child(), imp()]), []);
  const yeti = record(YETI, 1000, 100);
  assert.deepEqual(yeti.talents, { hitWall: { value: 5000 } });
  assert.deepEqual(uncoveredAbilities([yeti]), ['hitWall']);
  assert.deepEqual(withoutIncomplete(yeti).talents, {}, 'a level being tested leaves its hitWall out (关卡-8)');
  assert.deepEqual(withoutIncomplete(child()).talents, child().talents);
});

test('[敌能-150] [关卡-2] only exactly `value` and `rearm`, both numbers: a string, a missing key or another key is not this ability', () => {
  for (const hitWall of [{ value: '5000', rearm: 5 }, { value: 5000, rearm: '5' }, { rearm: 5 }, { value: 5000, rearm: 5, interval: 1 }]) {
    const def = /** @type {EnemyDef} */ ({ name: 'x', maxHp: 1, atk: 0, def: 0, res: 0, moveSpeed: 1, talents: { hitWall: /** @type {any} */ (hitWall) } });
    assert.deepEqual(uncoveredAbilities([def]), ['hitWall'], JSON.stringify(hitWall));
  }
});

test('[敌能-150] [位移-3] 雪孩子 pushed into high ground takes 5000 true damage at its next turn: sourceless, its own, no attack, no skill', () => {
  const box = open({ [CHILD]: child() }, [[CHILD, 2, 1.45]]);
  const e = box.e, hits = damages(box.w, e);
  e.buffs.push(buffs.makeBuff({ key: 'out', mods: { dmgDealtMul: 2 } }));
  bump(box, e);
  assert.equal(e.hp, 5500, 'not on the push itself');
  step(box.w, box.c);
  assert.equal(e.hp, 500, 'DEF 200 and its own ×2 dealt do not change it');
  assert.equal(hits.length, 1);
  const [h] = hits;
  assert.deepEqual([h.source, h.credit, h.type, h.amount], [null, e, 'true', 5000]);
  assert.ok(!h.dmg.isAttack && !h.dmg.isSkill && !h.dmg.hpLoss);
  for (let i = 0; i < 40; i++) step(box.w, box.c);
  assert.equal(e.hp, 500, 'once');
});

test('[敌能-150] 雪顽童 the same: 7000 − 5000', () => {
  const box = open({ [IMP]: imp() }, [[IMP, 3, 1.45]]);
  bump(box, box.e);
  step(box.w, box.c);
  assert.equal(box.e.hp, 2000);
});

test('[敌能-150] the damage is the blackboard\'s `value`, not a constant', () => {
  const box = open({ [CHILD]: record(CHILD, 5500, 200, { value: 1234 }) }, [[CHILD, 2, 1.45]]);
  bump(box, box.e);
  step(box.w, box.c);
  assert.equal(box.e.hp, 5500 - 1234);
});

test('[敌能-150] a `value` of 0 or below is no hit: no `hit` event, its HP as it was', () => {
  for (const value of [0, -300]) {
    const box = open({ [CHILD]: record(CHILD, 5500, 200, { value }) }, [[CHILD, 2, 1.45]]);
    const e = box.e;
    /** @type {any[]} */
    const hits = [];
    bus.on(box.w, 'hit', (ev) => { if (ev.target === e) hits.push(ev); });
    e.hp = 5000;
    bump(box, e);
    step(box.w, box.c);
    assert.deepEqual([hits.length, e.hp], [0, 5000], `value ${value}`);
  }
});

test('[敌能-150] [时间-2] not again within `rearm`: 5 s is 150 frames — a collision seen 149 frames later does nothing, one at 150 hits', () => {
  const box = open({ [IMP]: record(IMP, 20000, 300) }, [[IMP, 2, 1.45]]);
  const e = box.e, f0 = box.w.frame;
  bump(box, e);
  step(box.w, box.c);
  assert.equal(e.hp, 15000);
  until(box, f0 + 149);
  bump(box, e);
  step(box.w, box.c);
  assert.equal(e.hp, 15000, 'frame +149: still within');
  bump(box, e);
  step(box.w, box.c);
  assert.equal(e.hp, 10000, 'frame +150');
});

test('[敌能-150] [时间-2] `rearm` follows the blackboard: 2 s is 60 frames', () => {
  const box = open({ [IMP]: rearmed(record(IMP, 20000, 300), 2) }, [[IMP, 2, 1.45]]);
  const e = box.e, f0 = box.w.frame;
  bump(box, e);
  step(box.w, box.c);
  until(box, f0 + 59);
  bump(box, e);
  step(box.w, box.c);
  assert.equal(e.hp, 15000, 'frame +59');
  bump(box, e);
  step(box.w, box.c);
  assert.equal(e.hp, 10000, 'frame +60');
});

test('[敌能-150] 无敌 or 沉睡 takes the damage away, but that collision still starts the window', () => {
  for (const key of /** @type {const} */ (['invincible', 'sleep'])) {
    const box = open({ [IMP]: record(IMP, 20000, 300) }, [[IMP, 2, 1.45]]);
    const e = box.e, f0 = box.w.frame;
    status.applyStatus(e, key, { seconds: 1 });
    bump(box, e);
    step(box.w, box.c);
    assert.equal(e.hp, 20000, key);
    until(box, f0 + 60);
    assert.equal(e.buffs.some((b) => b.key === key), false, `${key} is over`);
    bump(box, e);
    step(box.w, box.c);
    assert.equal(e.hp, 20000, `${key}: within the window it started`);
    until(box, f0 + 150);
    bump(box, e);
    step(box.w, box.c);
    assert.equal(e.hp, 15000, key);
  }
});

test('[敌能-150] silence, stun and freeze do not stop it: a talent the page does not call silenceable', () => {
  const box = open({ [CHILD]: child() }, [[CHILD, 2, 1.45]]);
  for (const key of /** @type {const} */ (['silence', 'stun', 'freeze'])) status.applyStatus(box.e, key, {});
  bump(box, box.e);
  step(box.w, box.c);
  assert.equal(box.e.hp, 500);
});

test('[敌能-150] each enemy keeps its own window', () => {
  const big = record(CHILD, 20000, 200);
  const box = open({ [CHILD]: big }, [[CHILD, 2, 1.45], [CHILD, 3, 1.45]]);
  const [a, b] = box.foes, f0 = box.w.frame;
  bump(box, a);
  step(box.w, box.c);
  until(box, f0 + 10);
  bump(box, b);
  step(box.w, box.c);
  until(box, f0 + 20);
  bump(box, a);
  step(box.w, box.c);
  assert.deepEqual([a.hp, b.hp], [15000, 15000], 'b was hit inside a\'s window; a not again inside its own');
});

test('[敌能-150] [位移-4] a pull that drags it into high ground stops it again and again, and costs one hit', () => {
  const box = open({ [CHILD]: child() }, [[CHILD, 2, 1.2]]);
  const e = box.e;
  assert.equal(displacement.pull(box.w, box.c, e, 1, { to: { x: 2, y: 2.2 }, by: { x: 2, y: 2.6 } }), true);
  let stops = 0;
  for (let i = 0; i < 60 && e.slide; i++) {
    step(box.w, box.c);
    if (e.slide?.pull && e.slide.vy === 0) stops++;
  }
  assert.ok(stops >= 2, `stopped ${stops} times`);
  assert.equal(e.hp, 500);
});

test('[敌能-150] [位移-3] [地图-2] only high ground: the map\'s edge, a 低地 tile it cannot enter and a closed edge before a 低地 tile do nothing', () => {
  const box = open({ [IMP]: imp() }, [[IMP, 0, 0.45], [IMP, 4, 0.55], [IMP, 4.45, 1]], {
    tune: (c) => {
      c.level.tiles[0][4] = { ...c.level.tiles[0][4], passable: 'FLY_ONLY' };
      c.level.blockEdges = [{ row: 1, col: 4, dir: 'RIGHT', mask: 'WALK_ONLY' }];
    },
  });
  const [edge, fence, edged] = box.foes;
  displacement.push(box.w, box.c, edge, 2, { from: { x: 0, y: 1.45 } });
  displacement.push(box.w, box.c, fence, 2, { from: { x: 4, y: 1.55 } });
  displacement.push(box.w, box.c, edged, 2, { from: { x: 3.45, y: 1 } });
  for (let i = 0; i < 40; i++) step(box.w, box.c);
  assert.ok(edge.y > -0.5 && edge.y < 0 && fence.y === 0.55 && edged.x === 4.45, 'each was stopped');
  assert.deepEqual(box.foes.map((u) => u.hp), [7000, 7000, 7000]);
});

test('[敌能-150] without 失衡 there is no collision: walking its route between the high ground does nothing', () => {
  const box = open({ [CHILD]: child() }, [[CHILD, 0, 2]], { walk: true });
  const e = box.e;
  for (let i = 0; i < 260; i++) step(box.w, box.c);
  assert.ok(box.w.units.includes(e) && e.y === 1 && e.x > 2, `it walks the road between the high ground: ${e.x}, ${e.y}`);
  assert.equal(e.hp, 5500);
});

test('[敌能-150] [伤害-9] the hit can knock it down: at the frame\'s end it leaves as killed, credited to itself', () => {
  const box = open({ [CHILD]: child() }, [[CHILD, 2, 1.45]]);
  const e = box.e;
  /** @type {any[]} */
  const deaths = [];
  bus.on(box.w, 'death', (ev) => { if (ev.unit === e) deaths.push(ev); });
  e.hp = 3000;
  bump(box, e);
  step(box.w, box.c);
  assert.equal(box.w.units.includes(e), false);
  assert.deepEqual(deaths.map((d) => [d.reason, d.killer]), [['killed', e]]);
});

test('[敌能-150] the collision is judged as it happens, in 失衡: a slide that ends on the frame it hits still costs the hit next turn', () => {
  const box = open({ [CHILD]: child() }, [[CHILD, 2, 1]]);
  const e = box.e;
  displacement.push(box.w, box.c, e, 2, { from: { x: 2, y: 0 } });
  let frames = 0;
  while (e.slide && frames < 10) { step(box.w, box.c); frames++; }
  assert.ok(frames === 3 && e.y > 1.4 && e.y < 1.5, `its 硬直 ran out on the frame the wall stopped it: ${frames}, ${e.y}`);
  assert.equal(e.hp, 5500, 'that frame: not yet');
  step(box.w, box.c);
  assert.equal(e.hp, 500, 'its next turn, out of 失衡 by then');
});

test('[敌能-150] it notes collisions from the moment it appears: one before its first turn counts', () => {
  const c = content({ [CHILD]: child() }, [CHILD]);
  const w = createWorld(c, { seed: 1, players: 1 });
  bus.on(w, 'enemySpawn', (/** @type {{ enemy: Unit }} */ ev) => {
    Object.assign(ev.enemy, { x: 2, y: 1.45 });
    status.applyStatus(ev.enemy, 'root', {});
    displacement.push(w, c, ev.enemy, 2, { from: { x: 2, y: 0.45 } });
  });
  step(w, c);
  const e = w.units.find((u) => u.key === CHILD);
  assert.equal(e?.hp, 500, 'pushed into the wall as it spawned, hit at its first turn');
});
