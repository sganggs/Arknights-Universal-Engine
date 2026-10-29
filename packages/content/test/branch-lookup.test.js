// An accepted data mod may name a missing branch like Object.prototype; it is still missing (敌能-79).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, deployProblem } from '@aue/sim';
import { createSource, matchContent, LEVELS } from '../src/index.js';

const KEY = 'enemy_1508_faust', LEVEL = 'branchprobe:case';

/** A controlled wave using the native enemy/actual operator, through the normal strict JSON mod loader. @param {string} branch */
async function content(branch) {
  const raw = structuredClone(LEVELS.act1multi_fortress_rm01);
  raw.level.id = LEVEL;
  delete raw.level.fortress;
  raw.level.predefines = []; raw.level.branches = {};
  raw.level.options.initialCost = 99; raw.level.options.maxCost = 99;
  raw.level.waves = [{ preDelay: 0, postDelay: 0, maxWait: -1, fragments: [{ preDelay: 0,
    actions: [{ type: 'SPAWN', key: KEY, count: 1, interval: 0, preDelay: 0, route: 0 }] }] }];
  const data = { levels: { [LEVEL]: raw }, enemies: { [KEY]: { skills: { SummonBallis: { bb: { branch_id: branch } } } } } };
  const source = await createSource([{ id: 'branchprobe', manifest: { type: 'data', version: '1.0.0', app: '>=0.1.3', name: 'branchprobe', files: { data: 'data.json' } },
    files: { 'data.json': JSON.stringify(data) } }]);
  assert.equal(source.reports[0].loaded, true, JSON.stringify(source.reports));
  return matchContent({ level: LEVEL, difficulty: 'NORMAL', seed: 7,
    decks: [[{ id: 'char_010_chen', build: { elite: 2, level: 90, potential: 1, trust: 0, skill: 1, skillLevel: 10 } }]] }, { source });
}

/** The legal deployment closest to route 0's start. @param {import('@aue/sim').World} w @param {import('@aue/sim').Content} c */
function deployment(w, c) {
  const start = c.level.routes[0].start, places = [];
  for (let row = 0; row < c.level.height; row++) for (let col = 0; col < c.level.width; col++) {
    const command = { type: /** @type {const} */ ('deploy'), op: 'char_010_chen#0', row, col, dir: 0 };
    if (deployProblem(w, c, 0, command) === null) places.push({ command, distance: Math.abs(row - start.row) + Math.abs(col - start.col) });
  }
  places.sort((a, b) => a.distance - b.distance);
  assert.ok(places.length > 0);
  return places[0].command;
}

for (const branch of ['not_a_branch', 'toString', 'hasOwnProperty', 'valueOf', 'constructor', '__proto__']) {
  test(`[敌能-79] [mod-6] a loaded missing branch ${branch} leaves the ordinary attack intact`, async () => {
    const c = await content(branch), w = createWorld(c, { seed: 7, players: 1 });
    assert.equal(Object.hasOwn(c.level.branches ?? {}, branch), false);
    step(w, c);
    const enemy = w.units.find((u) => u.key === KEY);
    assert.ok(enemy);
    const events = step(w, c, [[0, deployment(w, c)]]);
    assert.ok(events.some((e) => e.type === 'deploy'));
    let attacks = 0;
    for (let i = 0; i < 300; i++) attacks += step(w, c).filter((e) => e.type === 'attack' && e.id === enemy.id).length;
    assert.ok(attacks > 0, 'the native enemy actually reached ordinary attack windows');
    assert.equal(enemy.ab['SummonBallis.cd'], 0, 'nothing summoned: no cooldown spent');
    assert.equal(w.branchAt, undefined, 'no cursor is created for a missing branch');
  });
}
