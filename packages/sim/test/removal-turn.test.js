// A skill recovers its summons during the owner's turn (召唤-10), before their turns (帧-1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { createWorld, step, deployProblem } from '../src/index.js';

/** Deploy through the command path, with no edits to units or skill clocks. @param {boolean} ranged */
function arena(ranged) {
  const c = tinyContent();
  c.level.options.characterLimit = 4;
  c.level.waves = [oneWave([spawnAt(0, 'slime')])];
  c.level.routes[0].start = { row: 1, col: 3 };
  Object.assign(c.enemies.slime, { maxHp: 10000, def: 0, moveSpeed: 0 });
  c.operators.guard.range = [];
  c.operators.guard.skill = { id: 'recover', type: 'MANUAL', sp: 'time', cost: 1, init: 1, charges: 1, duration: 1, ammo: false, bb: {} };
  c.operators.token = {
    ...c.operators.guard, skill: undefined, cost: 1, atk: 10, blockCnt: 0,
    position: ranged ? 'RANGED' : 'MELEE', baseAttackTime: ranged ? 2 : 1,
    range: [{ row: ranged ? 1 : 0, col: 1 }],
    ...(ranged ? { attack: { duration: 2, hit: 1 } } : {}),
    summoner: 'guard', summon: { supply: 1, holdLimit: 1, deployLimit: 1, occupy: 0, respawn: 'default', skillEnd: { recover: true } },
  };
  c.operators.witness = { ...c.operators.guard, skill: undefined, cost: 1, atk: 7, range: [{ row: 0, col: -1 }] };
  const w = createWorld(c, { seed: 1, players: 1 });
  const ownerCommand = { type: /** @type {const} */ ('deploy'), op: 'guard', row: 1, col: 1, dir: 0 };
  assert.equal(deployProblem(w, c, 0, ownerCommand), null);
  step(w, c, [[0, ownerCommand]]);
  const owner = w.units.find((u) => u.key === 'guard');
  assert.ok(owner);
  const tokenCommand = { ...ownerCommand, op: 'token', row: ranged ? 0 : 1, col: 2 };
  const witnessCommand = { ...ownerCommand, op: 'witness', col: 4 };
  assert.equal(deployProblem(w, c, 0, tokenCommand), null);
  assert.equal(deployProblem(w, c, 0, witnessCommand), null);
  step(w, c, [[0, tokenCommand], [0, witnessCommand], [0, { type: 'skill', unit: owner.id }]]);
  const token = w.units.find((u) => u.key === 'token'), witness = w.units.find((u) => u.key === 'witness');
  assert.ok(token && witness && owner.skill?.active);
  while (w.frame < 31) step(w, c);
  assert.ok(w.units.includes(token), 'the summon stays until the skill ends');
  return { w, c, token, witness };
}

for (const ranged of [false, true]) {
  test(`[召唤-10] [帧-1] a recovered summon cannot ${ranged ? 'finish its wind-up' : 'start its next attack'} later in the same frame`, () => {
    const { w, c, token, witness } = arena(ranged);
    const target = w.units.find((u) => u.key === 'slime');
    assert.ok(target);
    const before = target.hp;
    const events = step(w, c);
    assert.ok(events.some((e) => e.type === 'retreat' && e.id === token.id));
    assert.ok(!w.units.includes(token));
    assert.equal(w.players[0].summons?.token.held, 1, 'the copy is recovered');
    assert.deepEqual(events.filter((e) => e.id === token.id && ['attack', 'shot', 'hit'].some((type) => e.type === type)), [], 'no attack from the departed summon');
    assert.ok(!w.shots.some((s) => s.src === token.id), 'no projectile from the departed summon');
    assert.ok(events.some((e) => e.type === 'hit' && e.id === witness.id), 'the surviving operator takes its turn');
    assert.equal(before - target.hp, 7, 'only the surviving operator damages the target');
  });
}
