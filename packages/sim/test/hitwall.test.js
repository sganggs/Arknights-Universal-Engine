// 与高地碰撞 (docs/spec/foes.md 敌能-150): the step a 失衡 slide stops in because the tile it would enter is high ground
// (位移-3) is noted, and the context's bumpedHigh() shows it to the enemy's abilities once, at its next turn. The map's
// edge, a 低地 tile it cannot enter and a closed edge before a 低地 tile are not high ground; only an enemy that asked keeps
// a note.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, stateHash, takeSnapshot, restoreSnapshot } from '../src/index.js';
import { push, pull } from '../src/displacement.js';
import { makeEnemy } from '../src/units.js';
import { applyStatus } from '../src/status.js';

/** @typedef {import('../src/types.js').Unit} Unit @typedef {import('../src/types.js').World} World */

const ROAD = { key: 'tile_road', height: 'LOWLAND', buildable: 'MELEE', passable: 'ALL', side: 'ALL' };
const WALL = { key: 'tile_wall', height: 'HIGHLAND', buildable: 'RANGED', passable: 'FLY_ONLY', side: 'ALL' };
/** A 低地 tile ground units cannot enter, as a 围墙. */
const FENCE = { key: 'tile_road', height: 'LOWLAND', buildable: 'NONE', passable: 'FLY_ONLY', side: 'ALL' };
/** A 高地 tile ground units may enter, as a built 液压式高台 (守御-5). */
const PLATFORM = { key: 'tile_road', height: 'HIGHLAND', buildable: 'RANGED', passable: 'ALL', side: 'ALL', obstacle: true };
const TILES = /** @type {Record<string, object>} */ ({ '.': ROAD, '#': WALL, x: FENCE, p: PLATFORM });

/**
 * A level of rows (row 0 first; '.' road, '#' high ground, 'x' a 低地 wall, 'p' a high tile it may enter), an enemy of
 * weight 0 held by a root so it does not walk, at (x, 1); unless `ask` is false, its talent `probe` calls bumpedHigh()
 * each turn and logs it.
 * @param {string[]} rows @param {number} x @param {{ ask?: boolean, edges?: object[] }} [o]
 */
function field(rows, x, o = {}) {
  /** @type {boolean[]} */
  const seen = [];
  const c = /** @type {any} */ ({
    level: { id: 't', width: rows[0].length, height: rows.length, tiles: rows.map((r) => [...r].map((ch) => TILES[ch])), blockEdges: o.edges ?? [],
      options: { maxLifePoint: 3, initialCost: 0, maxCost: 99, costIncreaseTime: 1, characterLimit: 1, moveMultiplier: 0.5 },
      routes: [{ start: { row: 1, col: 0 }, end: { row: 1, col: 0 }, motion: 'WALK', checkpoints: [] }], waves: [] },
    enemies: { e: { name: 'e', maxHp: 1e6, atk: 0, def: 0, res: 0, moveSpeed: 0, massLevel: 0, baseAttackTime: 1, applyWay: 'MELEE', talents: { probe: {} } } },
    operators: {},
    behaviors: { foes: { probe: { tick: (/** @type {any} */ ctx) => { if (o.ask !== false) seen.push(ctx.bumpedHigh()); } } } },
  });
  const w = createWorld(c, { seed: 1, players: 1 }), e = makeEnemy(w, c, { key: 'e', route: 0 });
  e.x = x; e.y = 1;
  applyStatus(e, 'root', {});
  w.units.push(e);
  step(w, c);
  return { w, c, e, seen };
}

/** Steps `n` frames: the speed after each, and what that turn's tick saw. @param {ReturnType<typeof field>} f @param {number} n */
function run(f, n) {
  /** @type {{ vx: number | null, saw: boolean }[]} */
  const out = [];
  for (let i = 0; i < n; i++) {
    const k = f.seen.length;
    step(f.w, f.c);
    out.push({ vx: f.e.slide ? f.e.slide.vx : null, saw: f.seen.length > k && f.seen[k] });
  }
  return out;
}

/** The turns that saw a collision. @param {{ saw: boolean }[]} r */
const sawAt = (r) => r.flatMap((x, i) => (x.saw ? [i] : []));

test('[敌能-150] [位移-3] a slide stopped against a 高地 tile is seen once, by the enemy\'s next turn; the turns before and after see none', () => {
  const f = field(['....', '..#.', '....'], 1);
  assert.equal(push(f.w, f.c, f.e, 5, { from: { x: 0, y: 1 } }), true);
  assert.ok(f.e.x > 1 && f.e.slide && f.e.slide.vx > 0, 'it slides toward the wall');
  const r = run(f, 12);
  const stop = r.findIndex((x) => x.vx === 0);
  assert.ok(stop >= 0 && f.e.x < 1.5, `stopped before the wall: ${f.e.x}`);
  assert.deepEqual(sawAt(r), [stop + 1], 'seen at the turn after the one whose slide hit it, and only then');
  assert.equal(f.e.ab['@highBump'], 0, 'cleared after that turn');
});

test('[敌能-150] [位移-2] the step a ballistic push takes as it lands counts; an effect\'s push hits on its own first slide frame', () => {
  const f = field(['....', '..#.', '....'], 1.45);
  push(f.w, f.c, f.e, 5, { from: { x: 0, y: 1 } });
  assert.deepEqual([f.e.x, f.e.slide?.vx], [1.45, 0], 'the first step would enter the wall: it stays, no speed');
  assert.deepEqual(sawAt(run(f, 5)), [0], 'the next turn sees it');
  const g = field(['....', '..#.', '....'], 1.45);
  push(g.w, g.c, g.e, 5, { from: { x: 0, y: 1 }, effect: true });
  assert.equal(g.e.ab['@highBump'], 0, 'no step yet');
  assert.deepEqual(sawAt(run(g, 5)), [1], 'its slide hits on the turn after the push, seen one turn later');
});

test('[敌能-150] [位移-3] [地图-2] the map\'s edge, a 低地 tile it cannot enter and a closed edge before a 低地 tile stop it but are no collision', () => {
  for (const [name, rows, edges] of /** @type {[string, string[], object[]][]} */ ([
    ['edge', ['..', '..', '..'], []],
    ['低地 wall', ['....', '..x.', '....'], []],
    ['closed edge', ['....', '....', '....'], [{ row: 1, col: 1, dir: 'RIGHT', mask: 'WALK_ONLY' }]],
  ])) {
    const f = field(rows, 1.45, { edges });
    push(f.w, f.c, f.e, 5, { from: { x: 0, y: 1 } });
    assert.deepEqual([f.e.x, f.e.slide?.vx], [1.45, 0], `${name}: stopped`);
    assert.deepEqual(sawAt(run(f, 6)), [], `${name}: not high ground`);
  }
  const edged = field(['....', '..#.', '....'], 1.45, { edges: [{ row: 1, col: 1, dir: 'RIGHT', mask: 'WALK_ONLY' }] });
  push(edged.w, edged.c, edged.e, 5, { from: { x: 0, y: 1 } });
  assert.deepEqual(sawAt(run(edged, 4)), [0], 'a closed edge before a 高地 tile: the tile it would enter is high ground');
});

test('[敌能-150] [地图-2] a 高地 tile the slide may enter does not stop it, so no collision; a closed edge before it does, and counts', () => {
  const f = field(['....', '..p.', '....'], 1.45);
  push(f.w, f.c, f.e, 5, { from: { x: 0, y: 1 } });
  const r = run(f, 40);
  assert.ok(f.e.x > 1.5, `it slid onto the platform: ${f.e.x}`);
  assert.deepEqual(sawAt(r), []);
  const g = field(['....', '..p.', '....'], 1.45, { edges: [{ row: 1, col: 1, dir: 'RIGHT', mask: 'WALK_ONLY' }] });
  push(g.w, g.c, g.e, 5, { from: { x: 0, y: 1 } });
  assert.deepEqual([g.e.x, g.e.slide?.vx], [1.45, 0], 'the closed edge stops it');
  assert.deepEqual(sawAt(run(g, 4)), [0], 'only the tile behind the edge counts, and it is high ground');
});

test('[敌能-150] [位移-4] a pull pinned against high ground is stopped again and again: each stop is seen at the next turn', () => {
  const f = field(['.....', '..#..', '.....'], 1.2);
  assert.equal(pull(f.w, f.c, f.e, 0, { to: { x: 2.2, y: 1 }, by: { x: 2.6, y: 1 } }), true);
  const r = run(f, 31);
  assert.ok(f.e.x < 1.5, 'never in the wall');
  const stops = r.flatMap((x, i) => (x.vx === 0 && i < 30 ? [i] : []));
  assert.ok(stops.length >= 2, `stopped ${stops.length} times`);
  assert.deepEqual(sawAt(r), stops.map((i) => i + 1));
});

test('[敌能-150] only an enemy that asked keeps a note, and only from its first call: no key otherwise, nothing before', () => {
  const quiet = field(['....', '..#.', '....'], 1.45, { ask: false });
  push(quiet.w, quiet.c, quiet.e, 5, { from: { x: 0, y: 1 } });
  run(quiet, 4);
  assert.equal(Object.hasOwn(quiet.e.ab, '@highBump'), false, 'its state is as it was');
  const f = field(['....', '..#.', '....'], 1.45, { ask: false });
  push(f.w, f.c, f.e, 5, { from: { x: 0, y: 1 } });
  f.c.behaviors.foes.probe.tick = (/** @type {any} */ ctx) => { f.seen.push(ctx.bumpedHigh()); };
  assert.deepEqual(sawAt(run(f, 3)), [], 'the collision came before the first call');
  push(f.w, f.c, f.e, 5, { from: { x: 0, y: 1 } });
  assert.deepEqual(sawAt(run(f, 3)), [0], 'after it, one is seen');
});

test('[敌能-150] [同步-2] the note is state: a world restored from a snapshot taken before the turn that sees it goes on the same', () => {
  const f = field(['....', '..#.', '....'], 1.45);
  push(f.w, f.c, f.e, 5, { from: { x: 0, y: 1 } });
  assert.equal(f.e.ab['@highBump'], 1);
  const b = restoreSnapshot(JSON.parse(JSON.stringify(takeSnapshot(f.w))));
  assert.equal(b.units.find((u) => u.key === 'e')?.ab['@highBump'], 1);
  for (let i = 0; i < 4; i++) {
    assert.equal(stateHash(b), stateHash(f.w), `frame ${f.w.frame}`);
    step(f.w, f.c);
    step(b, f.c);
  }
  assert.equal(b.units.find((u) => u.key === 'e')?.ab['@highBump'], 0);
});
