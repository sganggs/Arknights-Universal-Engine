// A 阵地足球 match recovers from a JSON snapshot frame for frame (docs/spec/lockstep.md 同步-2): the ball's slides, the
// players chasing, stopping (足球-9) and kicking it, kickoffs and goals (足球-6, 足球-7) leave no state a snapshot loses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, stateHash, takeSnapshot, restoreSnapshot, displacement } from '@aue/sim';
import { matchContent } from '../src/index.js';

/** @typedef {import('@aue/sim').World} World */

/** @param {World} w */
const restored = (w) => restoreSnapshot(JSON.parse(JSON.stringify(takeSnapshot(w))));

/** Every 4 s the first ball is kicked toward a goal, theirs and ours in turn, at 8 tiles/s. @param {World} w */
function kick(w) {
  const b = w.units.find((u) => u.ball && !u.hidden && u.hp > 0);
  if (w.frame % 120 !== 0 || !b) return;
  const toward = (w.frame / 120) % 2 === 0 ? 12 : 0, dx = toward - b.x, dy = 4 - b.y, d = Math.hypot(dx, dy);
  if (d > 0) displacement.kickSlide(b, dx / d, dy / d, 8);
}

for (const [level, difficulty] of /** @type {const} */ ([['act1multi_football', 'NORMAL'], ['act1multi_football', 'FOUR_STAR'], ['act1multi_football_hard-01', 'NORMAL']])) {
  test(`[同步-2] [足球-9] ${level} ${difficulty}: restored at times through the match, it goes on as the match it came from`, async () => {
    const c = await matchContent({ level, difficulty, seed: 3, decks: [[], []] });
    const w = createWorld(c, { seed: 3, players: 2 });
    /** @type {World[]} */
    const copies = [];
    for (let f = 1; f <= 30 * 120; f++) {
      kick(w);
      const events = step(w, c);
      for (const r of copies) {
        kick(r);
        assert.deepEqual(step(r, c), events, `events at frame ${w.frame}`);
        assert.equal(stateHash(r), stateHash(w), `hash at frame ${w.frame}`);
      }
      if (f % 450 === 0) copies.push(restored(w));
    }
    const fb = /** @type {{ home: number, away: number }} */ (w.football);
    assert.ok(fb.home > 0 && fb.away > 0, `goals both ways: ${fb.home}-${fb.away}`);
  });
}
