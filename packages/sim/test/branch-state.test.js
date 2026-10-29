// FoeContext.summonNext addresses own branches/cursors, including names that also exist on Object.prototype.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { createWorld, step, stateHash, takeSnapshot, restoreSnapshot } from '../src/index.js';

/** @param {string} branch @returns {import('../src/types.js').Content} */
function content(branch) {
  const c = tinyContent();
  c.enemies.caller = { ...c.enemies.slime, talents: { call: {} } };
  c.level.routes[0].checkpoints[1].time = 60;
  c.level.waves = [oneWave([spawnAt(0, 'caller')])];
  c.level.branches = Object.fromEntries([['first', [{ preDelay: 0, actions: [spawnAt(0, 'slime')] }]],
    [branch, [{ preDelay: 0, actions: [spawnAt(0, 'slime', { count: 2 })] }]]]);
  const calls = ['first', branch, branch, branch];
  c.behaviors = { foes: { call: { tick: (/** @type {import('../src/foes.js').FoeContext} */ ctx) => {
    const n = ctx.state.get('n');
    if (n >= calls.length) return;
    ctx.summonNext(calls[n]);
    ctx.state.set('n', n + 1);
  } } } };
  return c;
}

for (const branch of ['second', 'toString', 'hasOwnProperty', 'constructor', '__proto__']) {
  test(`[敌能-79] [同步-1] [同步-2] own branch ${branch} has an independent cursor after another branch and JSON recovery`, () => {
    const c = content(branch), w = createWorld(c, { seed: 7, players: 1 });
    step(w, c);
    assert.equal(w.units.filter((u) => u.key === 'slime').length, 1, 'first branch was consumed');
    let restored = restoreSnapshot(JSON.parse(JSON.stringify(takeSnapshot(w))));
    for (let i = 0; i < 8; i++) {
      if (i === 1) {
        assert.equal(restored.branchAt?.[branch], 1, 'one individual consumed before a second JSON recovery');
        restored = restoreSnapshot(JSON.parse(JSON.stringify(takeSnapshot(restored))));
      }
      assert.deepEqual(step(w, c), step(restored, c));
      assert.equal(stateHash(w), stateHash(restored));
      assert.deepEqual(takeSnapshot(w), takeSnapshot(restored));
    }
    assert.equal(w.units.filter((u) => u.key === 'slime').length, 3, 'the two individuals of the second branch appeared once each');
    assert.ok(w.branchAt);
    assert.equal(Object.hasOwn(w.branchAt, branch), true);
    assert.equal(w.branchAt[branch], 2);
    assert.equal(w.branchAt.first, 1);
    assert.equal(Object.getPrototypeOf(w.branchAt), Object.prototype, 'the counter is ordinary data, without a changed prototype');
  });
}
