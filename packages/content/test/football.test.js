// 阵地足球 (docs/spec/football.md 足球-1, 足球-2): IG-FT-1's field and goals as extracted, and the balls of its data —
// `physic` makes each one a ball with its own numbers; its `aura` of `block_cnt` alone is the ball's, not a supply car.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { uncoveredAbilities } from '../src/foes.js';
import football from '../data/levels/act1multi_football.json' with { type: 'json' };

/** @typedef {import('@aue/sim').EnemyDef} EnemyDef */

/** The balls of IG-FT-1's data: every enemy with a `physic` talent. */
const BALLS = Object.entries(football.enemies).filter(([, e]) => /** @type {any} */ (e).talents?.physic);

test('[足球-1] IG-FT-1: 13 × 9, rows 0 and 8 forbidden, our goal the column 0 and theirs the column 12, passable and not deployable', () => {
  const lv = football.level;
  assert.deepEqual([lv.width, lv.height], [13, 9]);
  for (let r = 0; r < 9; r++) {
    for (let col = 0; col < 13; col++) {
      const t = lv.tiles[r][col];
      const want = r === 0 || r === 8 ? 'tile_forbidden' : col === 0 ? 'tile_allygoal' : col === 12 ? 'tile_enemygoal' : 'tile_football';
      assert.equal(t.key, want, `row ${r} col ${col}`);
      if (want === 'tile_allygoal' || want === 'tile_enemygoal') assert.deepEqual([t.passable, t.buildable], ['ALL', 'NONE']);
    }
  }
});

test('[足球-2] each of the ten balls becomes a ball at its spawn with its own physic and a block of 3; physic and aura are covered', () => {
  assert.equal(BALLS.length, 10);
  for (const [key, def] of BALLS) {
    const e = /** @type {EnemyDef & { talents: Record<string, Record<string, number>> }} */ (def), p = e.talents.physic;
    const c = /** @type {any} */ (tinyContent());
    c.enemies = { [key]: e };
    c.behaviors = skeletonContent.behaviors;
    c.level.waves = [oneWave([spawnAt(0, key)])];
    const w = createWorld(c, { seed: 1, players: 1 });
    step(w, c);
    const u = w.units.find((x) => x.key === key);
    assert.deepEqual(u?.ball && [u.ball.f, u.ball.e, u.ball.force, u.ball.need, u.ball.block],
      [p.friction_factor, p.restitution_factor, p.force, p.value, e.talents.aura.block_cnt], key);
    const left = uncoveredAbilities([e]);
    assert.equal(left.includes('physic') || left.includes('aura'), false, `${key}: ${left.join(', ')}`);
  }
});
