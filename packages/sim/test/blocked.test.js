// The block event (docs/spec/hooks.md 钩子-6): `blocked` when an enemy is blocked by contact (阻挡-1) — once the block
// holds, once per block, never for an enemy that cannot be blocked or for content's blockBy; a handler may let it go; no
// handler, no change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { KIND } from '@aue/schema';
import { makeOperator, makeEnemy } from '../src/units.js';
import { tryBlock, blockBy, release } from '../src/blocking.js';
import { applyStatus } from '../src/status.js';
import { addBuff, makeBuff } from '../src/buffs.js';
import { on } from '../src/bus.js';
import { createWorld, step, stateHash } from '../src/index.js';

/** @typedef {import('../src/types.js').Unit} Unit @typedef {import('../src/types.js').World} World */

const ROAD = { key: 'tile_road', height: 'LOWLAND', buildable: 'MELEE', passable: 'ALL', side: 'ALL' };

/** A 6 × 21 field of road with a guard `g` (block 2) and an enemy `e` that stands still. @returns {any} */
function field() {
  const tiles = Array.from({ length: 6 }, () => Array.from({ length: 21 }, () => ROAD));
  return {
    level: { id: 'f', width: 21, height: 6, tiles, waves: [],
      options: { maxLifePoint: 3, initialCost: 10, maxCost: 99, costIncreaseTime: 1, characterLimit: 9, moveMultiplier: 0.5 },
      routes: [{ start: { row: 3, col: 9 }, end: { row: 3, col: 20 }, checkpoints: [], motion: 'WALK' }] },
    enemies: { e: { name: 'e', maxHp: 1e8, atk: 0, def: 0, res: 0, moveSpeed: 0 }, n: { name: 'n', maxHp: 1e8, atk: 0, def: 0, res: 0, moveSpeed: 0, neutral: true } },
    operators: { g: { name: 'g', position: 'MELEE', cost: 1, blockCnt: 2, baseAttackTime: 1, maxHp: 1000, atk: 0, def: 0, res: 0, range: [] } },
  };
}

/** The field's world with the guard at (3, 5), and what `blocked` saw: blocker, enemy, its blocker id and frame then. @param {any} c */
function arena(c) {
  const w = createWorld(c, { seed: 1, players: 1 }), g = makeOperator(w, c, { key: 'g', owner: 0, row: 3, col: 5, dir: 0 });
  w.units.push(g);
  w.frame = 1;
  /** @type {{ blocker: Unit, enemy: Unit, by: number, at: number, x: number, left: boolean }[]} */
  const seen = [];
  on(w, 'blocked', (k) => { seen.push({ blocker: k.blocker, enemy: k.enemy, by: k.enemy.blockedBy, at: k.enemy.blockedAt, x: k.enemy.x, left: k.enemy.lr === -1 }); });
  /** An enemy of `key` at (x, y). @param {string} key @param {number} x @param {number} y */
  const foe = (key, x, y) => {
    const e = makeEnemy(w, c, { key, route: 0 });
    e.x = x; e.y = y;
    w.units.push(e);
    return e;
  };
  return { w, g, seen, foe };
}

test('[钩子-6] blocked: a contact block sends its blocker and enemy once the block holds; none while it stays, again after a release', () => {
  const c = field(), { w, g, seen, foe } = arena(c), e = foe('e', 5.6, 3);
  assert.equal(tryBlock(w, c, e), true);
  assert.equal(seen.length, 1);
  assert.deepEqual([seen[0].blocker, seen[0].enemy, seen[0].by, seen[0].at, seen[0].left], [g, e, g.id, 1, true], 'blocked and turned toward the guard on its left');
  w.frame = 2;
  assert.equal(tryBlock(w, c, e), true);
  assert.equal(seen.length, 1, 'already blocked: nothing');
  release(e);
  w.frame = 3;
  tryBlock(w, c, e);
  assert.deepEqual([seen.length, seen[1].at], [2, 3], 'blocked again after the release');
});

test('[钩子-6] blocked: none for an enemy that cannot be blocked or is out of reach, nor for content’s blockBy; 隐匿, 迷彩 and 无敌 are blocked and sent', () => {
  const c = field(), { w, g, seen, foe } = arena(c);
  assert.equal(tryBlock(w, c, foe('n', 5.2, 3)), false, 'neutral');
  const hidden = foe('e', 5.2, 3);
  hidden.hidden = true;
  assert.equal(tryBlock(w, c, hidden), false, 'disappeared');
  for (const key of /** @type {const} */ (['fear', 'attract', 'levitate', 'sleep'])) {
    const e = foe('e', 5.2, 3);
    applyStatus(e, key, { frames: 30 });
    assert.equal(tryBlock(w, c, e), false, key);
  }
  const ub = foe('e', 5.2, 3);
  addBuff(ub, makeBuff({ key: 'ub', flags: { unblockable: true } }));
  assert.equal(tryBlock(w, c, ub), false, 'unblockable');
  assert.equal(tryBlock(w, c, foe('e', 5 + 0.7071, 3)), false, 'just outside the radius');
  const far = foe('e', 15, 3);
  assert.equal(blockBy(w, far, g), true);
  assert.deepEqual([far.blockedBy, seen.length], [g.id, 0], 'content’s block holds and sends none');
  release(far);
  const shy = foe('e', 5.2, 3), cam = foe('e', 4.8, 3);
  addBuff(shy, makeBuff({ key: 'st', flags: { stealth: true } }));
  addBuff(cam, makeBuff({ key: 'cm', flags: { camou: true } }));
  assert.deepEqual([tryBlock(w, c, shy), tryBlock(w, c, cam)], [true, true]);
  release(shy);
  const inv = foe('e', 5.2, 3);
  addBuff(inv, makeBuff({ key: 'iv', flags: { invincible: true } }));
  assert.equal(tryBlock(w, c, inv), true, '无敌');
  assert.deepEqual(seen.map((s) => [s.blocker, s.enemy]), [[g, shy], [g, cam], [g, inv]]);
});

test('[钩子-6] blocked: deployed onto the enemy’s tile, the event sees the enemy already on the 0.5 circle', () => {
  const c = field(), { w, g, seen, foe } = arena(c);
  g.born = w.frame;
  const e = foe('e', 5.2, 3);
  tryBlock(w, c, e);
  assert.equal(seen.length, 1);
  assert.ok(Math.abs(seen[0].x - 5.5) < 1e-12, `${seen[0].x}`);
});

test('[钩子-6] blocked: a handler may let the enemy go — tryBlock says so; in its turn it walks on, and the check after its walk blocks it again', () => {
  const c = tinyContent();
  c.level.waves = [];
  const w = createWorld(c, { seed: 1, players: 1 }), slime = makeEnemy(w, c, { key: 'slime', route: 0 });
  w.units.push(slime);
  /** @type {[number, number, boolean][]} */
  const seen = [];
  let lets = 1;
  on(w, 'blocked', (k) => {
    seen.push([w.frame, k.enemy.x, k.enemy.blockedBy >= 0]);
    if (lets-- > 0) release(k.enemy);
  });
  // on the road toward the goal, 0.6 short of tile (1, 3): inside a guard's radius there, not yet on its tile
  for (let i = 0; i < 900 && !(slime.y === 1 && slime.x > 2.3); i++) step(w, c);
  const x0 = slime.x;
  assert.ok(x0 < 2.5 && seen.length === 0, `${x0}`);
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 3, dir: 2 }]]);
  const guard = /** @type {Unit} */ (w.units.find((u) => u.kind === KIND.OPERATOR));
  assert.equal(seen.length, 2, 'the check at its turn’s start, then the one after its walk');
  assert.deepEqual([seen[0][0], seen[0][1], seen[0][2]], [seen[1][0], x0, true], 'one turn; the block held when the handler saw it');
  assert.ok(seen[1][1] > x0, 'released, it walked a step before the second check');
  assert.equal(slime.blockedBy, guard.id);
  const x = slime.x;
  for (let i = 0; i < 30; i++) step(w, c);
  assert.deepEqual([seen.length, slime.x], [2, x], 'held from then on, nothing more sent');
  const f = field(), a = arena(f), e = a.foe('e', 5.6, 3);
  on(a.w, 'blocked', (k) => { release(k.enemy); });
  assert.deepEqual([tryBlock(a.w, f, e), e.blockedBy, a.seen.length, a.seen[0].by], [false, -1, 1, a.g.id], 'let go: tryBlock says it is not blocked');
  const f2 = field(), a2 = arena(f2), e2 = a2.foe('e', 5.6, 3), other = makeOperator(a2.w, f2, { key: 'g', owner: 0, row: 3, col: 9, dir: 0 });
  a2.w.units.push(other);
  on(a2.w, 'blocked', (k) => { release(k.enemy); blockBy(a2.w, k.enemy, other); });
  assert.deepEqual([tryBlock(a2.w, f2, e2), e2.blockedBy, a2.seen[0].by], [true, other.id, a2.g.id], 'let go and given to another unit by content: blocked');
});

test('[钩子-6] blocked: it comes in the enemy’s turn before its attack; with no handler — or one that does nothing — the battle is the same', () => {
  /** @param {boolean} listen */
  const play = (listen) => {
    const c = tinyContent();
    c.enemies.slime.maxHp = 1e6;
    c.enemies.slime.atk = 30;
    const w = createWorld(c, { seed: 1, players: 1 }), hashes = [];
    /** @type {(boolean | null)[]} */
    const swinging = [];
    if (listen) on(w, 'blocked', (k) => { swinging.push(k.enemy.swing === null ? false : true); });
    step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 3, dir: 2 }]]);
    for (let f = 1; f < 400; f++) { step(w, c); hashes.push(stateHash(w)); }
    const guard = /** @type {Unit} */ (w.units.find((u) => u.kind === KIND.OPERATOR));
    return { hashes, swinging, hurt: guard.hp < 1000 };
  };
  const quiet = play(false), heard = play(true);
  assert.deepEqual(heard.hashes, quiet.hashes);
  assert.deepEqual(heard.swinging, [false, false], 'both slimes, neither attacking yet when it is blocked');
  assert.ok(heard.hurt, 'then they attack their blocker');
});
