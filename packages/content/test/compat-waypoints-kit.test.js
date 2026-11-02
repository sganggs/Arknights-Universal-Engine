// 酒神's pinned kit and the grid's waypoints (docs/spec/compat.md 兼容-4): her 本能的召唤, on the oracle's kit code
// unchanged, lures every 0.1 s the 可达 enemies of its x-1 — a flyer by its own 行动方式, a ground enemy when the
// waypoints from its tile to the summon's are not null —; one on high ground or cut off by closed edges (地图-2) stays,
// and no error is recorded. Nothing in the compat layer gives a summon placed on the board its kit (Stronghold's
// `_setupUnit`), so a 本能的召唤 in a match has none (兼容-4): the test takes the kit from her own talent through a battle
// that has that step, and summons it with spawnToken.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { oracleDir, spawnAt, oneWave } from '@aue/testkit';
import { createWorld, step, KIND, DIR } from '@aue/sim';
import { loadKits, matchContent } from '../src/index.js';
import { ShUnit } from '../src/compat/unit.js';
import { worldBattles } from '../src/compat/buffhooks.js';

/** @typedef {import('@aue/sim').Unit} Unit */

const PHATM2 = 'char_1042_phatm2', CALL = 'token_10054_phatm2_encdool';
/** E2 90, 潜能 6, S2 群体性谵妄 at 专精 3. */
const BUILD = { elite: 2, level: 90, potential: 6, trust: 100, skill: 1, skillLevel: 10 };
/** @type {Record<string, any>} */
let kits = {};

before(async () => {
  const compat = new URL('../src/compat/', import.meta.url).href, root = pathToFileURL(`${oracleDir()}/`).href;
  register(new URL('hook.js', compat), { data: { root, compat } });
  ({ kits } = await loadKits(root, [PHATM2]));
});

/** A route that keeps its enemy waiting where it comes in. @param {number} row @param {number} col @param {string} motion */
const stay = (row, col, motion) => ({ start: { row, col }, end: { row: 2, col: 5 }, motion, checkpoints: [{ type: 'WAIT_FOR_SECONDS', row: 0, col: 0, time: 60 }] });

/** The four edges of a tile, closed to ground units (地图-2). @param {number} row @param {number} col */
const fenced = (row, col) => ['UP', 'RIGHT', 'DOWN', 'LEFT'].map((dir) => ({ row, col, dir, mask: 'WALK_ONLY' }));

/**
 * 战场#01's map (act1multi_01) with 酒神 on (1, 4) and four waiting enemies in the x-1 of a 本能的召唤 on (5, 5): a
 * walker on the road (4, 5), a walker and a flyer on the high ground (6, 4), a walker on the road (5, 7) — inside closed
 * edges when `edges` —; the summon spawned with her own kit for it. The enemies holding its 诱导 after 4 frames.
 * @param {any[]} edges
 */
async function lure(edges) {
  const c = /** @type {any} */ (await matchContent({ level: 'act1multi_01', difficulty: 'NORMAL', seed: 7, decks: [[{ id: PHATM2, build: BUILD }]] }, { kits }));
  const routes = [stay(4, 5, 'WALK'), stay(6, 4, 'WALK'), stay(6, 4, 'FLY'), stay(5, 7, 'WALK')];
  c.level = { ...c.level, routes, blockEdges: edges, waves: [oneWave(['walker', 'walker', 'flyer', 'walker'].map((key, route) => spawnAt(0, key, { route })))] };
  c.enemies = { ...c.enemies, walker: { name: 'walker', maxHp: 1e6, atk: 0, def: 0, res: 0, moveSpeed: 1 }, flyer: { name: 'flyer', maxHp: 1e6, atk: 0, def: 0, res: 0, moveSpeed: 1, motion: 'FLY' } };
  const w = createWorld(c, { seed: 7, players: 1 });
  w.players[0].cost = 99;
  step(w, c, [[0, { type: 'deploy', op: `${PHATM2}#0`, row: 1, col: 4, dir: DIR.UP }]]);
  for (let i = 0; i < 5; i++) step(w, c);
  const b = /** @type {any} */ (worldBattles.get(w)), piece = b.pieces.get(`0|${PHATM2}#0`);
  // her third talent gives each 本能的召唤 placed on the board and not deployed its kit, through Stronghold's _setupUnit
  const placed = new ShUnit(b, { kind: 'token', key: CALL, ownerId: 0, def: piece.tokenDefs[CALL], ownerUnit: piece });
  /** @type {any} */
  let kit = null;
  piece.kit.talents[2].install(Object.create(b, { allyUnits: { value: [placed] }, _setupUnit: { value: (/** @type {any} */ _t, /** @type {any} */ k) => { kit = k; } } }), piece);
  const tok = b.spawnToken(piece, CALL, 5, 5, { kit });
  for (let i = 0; i < 4; i++) step(w, c);
  const enemies = w.units.filter((u) => u.kind === KIND.ENEMY);
  const held = enemies.filter((u) => u.buffs.some((x) => x.key === 'attract' && x.src === tok.u.id)).map((u) => `${u.key}@${Math.round(u.y)},${Math.round(u.x)}`);
  return { b, tok, enemies, held };
}

test('[兼容-4] 酒神’s pinned kit: 本能的召唤 lures the 可达 enemies of its x-1 — the walker with a ground way, the flyer —, not one on high ground or fenced in', async () => {
  const { b, tok, enemies, held } = await lure(fenced(5, 7));
  assert.equal(enemies.length, 4, 'all four came in');
  assert.ok(tok.alive && tok.kit, 'the summon on (5, 5) with her kit');
  assert.deepEqual(held, ['walker@4,5', 'flyer@6,4'], 'the nearest first; the walker on (6, 4) and the fenced (5, 7) have no ground way to (5, 5)');
  assert.deepEqual(b.errors, [], 'the kit asked the grid without a gap');
});

test('[兼容-4] 酒神’s pinned kit: the fence open, the walker on (5, 7) has a ground way and is lured too; the waypoints decide it', async () => {
  const { b, tok, held } = await lure([]);
  assert.deepEqual(held, ['walker@4,5', 'flyer@6,4', 'walker@5,7']);
  assert.deepEqual([b.grid.waypoints(5, 7, tok.tileR, tok.tileC), b.grid.waypoints(6, 4, 5, 5)], [[[5, 7], [5, 5]], null]);
  assert.deepEqual(b.errors, []);
});
