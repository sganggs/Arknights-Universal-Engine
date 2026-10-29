// Native skill recovery (召唤-10) ends a summon's turns, but not a shot it already launched (攻击-3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { createWorld, step, deployProblem, stateHash, bus, damage } from '@aue/sim';
import { loadTraining, operatorAt } from '../src/operators.js';
import { loadToken, tokenAt } from '../src/tokens.js';
import { skillBehaviors } from '../src/skills.js';

const OWNER = 'char_248_mgllan#0', TOKEN = 'token_10005_mgllan_drone3#0';
const BUILD = { elite: 2, level: 90, potential: 1, trust: 0, skill: 2, skillLevel: 7, module: -1 };

/** Ordinary commands; real records, no changes to unit state or SP. @param {number} deployed */
async function arena(deployed) {
  const training = await loadTraining('char_248_mgllan'), token = await loadToken('token_10005_mgllan_drone3');
  const c = tinyContent();
  c.level.options = { ...c.level.options, initialCost: 40, maxCost: 99, characterLimit: 4 };
  c.level.routes[0].start = { row: 1, col: 3 };
  c.level.routes[0].checkpoints = [{ type: 'WAIT_FOR_SECONDS', row: 0, col: 0, time: 1000 }];
  c.level.waves = [oneWave([spawnAt(0, 'slime')])];
  c.enemies.slime = { ...c.enemies.slime, maxHp: 1e9, def: 0 };
  c.operators = { [OWNER]: operatorAt(training, BUILD), [TOKEN]: { ...tokenAt(token, TOKEN.split('#')[0], training, BUILD), summoner: OWNER } };
  c.decks = [[OWNER]];
  c.behaviors = { skills: skillBehaviors };
  const w = createWorld(c, { seed: 1, players: 1 });
  /** @type {string[]} */
  const lifecycle = [];
  for (const name of ['death', 'kill', 'skillEnd']) bus.on(w, name, (ctx) => lifecycle.push(`${w.frame}:${name}:${ctx.unit?.id}:${ctx.reason}`));
  /** @param {string} op @param {number} row */
  const deploy = (op, row) => ({ type: /** @type {const} */ ('deploy'), op, row, col: 2, dir: 0 });
  assert.equal(deployProblem(w, c, 0, deploy(OWNER, 0)), null);
  step(w, c, [[0, deploy(OWNER, 0)]]);
  while (w.frame < deployed) step(w, c);
  assert.equal(deployProblem(w, c, 0, deploy(TOKEN, 2)), null);
  step(w, c, [[0, deploy(TOKEN, 2)]]);
  const owner = w.units.find((u) => u.key === OWNER), drone = w.units.find((u) => u.key === TOKEN);
  assert.ok(owner?.skill && drone);
  while (w.frame < 600) step(w, c);
  assert.ok(owner.skill.sp >= 44, 'SP recovered naturally');
  step(w, c, [[0, { type: 'skill', unit: owner.id }]]);
  assert.deepEqual([owner.skill.at, owner.skill.dur], [600, 450]);
  while (w.frame < 1050) step(w, c);
  assert.ok(w.units.includes(drone));
  return { w, c, owner, drone, lifecycle };
}

test('[召唤-10] [帧-1] Magallan S3 rank 7 recalls Longteng.A before its next attack', async () => {
  const { w, c, drone } = await arena(15);
  assert.equal(drone.atkCd, 0, '69-frame attack cooldown naturally ends at frame 1050');
  const events = step(w, c);
  assert.ok(events.some((e) => e.type === 'retreat' && e.id === drone.id));
  assert.ok(!w.units.includes(drone));
  assert.equal(w.players[0].summons?.[TOKEN].held, 5);
  assert.deepEqual(events.filter((e) => e.id === drone.id && ['attack', 'shot', 'hit'].some((type) => e.type === type)), []);
});

test('[攻击-3] [钩子-2] [钩子-3] recovery keeps a previously launched shot, delayed damage and lifecycle hooks', async () => {
  const { w, c, owner, drone, lifecycle } = await arena(14);
  const target = w.units.find((u) => u.key === 'slime');
  assert.ok(target && w.shots.some((s) => s.src === drone.id), 'the drone fired at frame 1049');
  const before = target.hp;
  /** @type {number[]} */
  const callbacks = [];
  bus.after(w, 2, (world) => { callbacks.push(world.frame); damage.dealDamage(world, null, target, { type: 'true', amount: 11 }, c); });
  /** @type {{ frame: number, id: number, damage: number }[]} */
  const hits = [];
  for (let i = 0; i < 5; i++) {
    const frame = w.frame;
    for (const e of step(w, c)) if (e.type === 'hit') {
      assert.ok(typeof e.id === 'number' && typeof e.damage === 'number');
      hits.push({ frame, id: e.id, damage: e.damage });
    }
  }
  assert.deepEqual(lifecycle, [`1050:death:${drone.id}:retreat`, `1050:skillEnd:${owner.id}:duration`]);
  assert.deepEqual(callbacks, [1052]);
  assert.deepEqual(hits, [{ frame: 1052, id: -1, damage: 11 }, { frame: 1052, id: -1, damage: 753 }]);
  assert.equal(before - target.hp, 764);
  assert.equal(w.shots.length, 0);
  assert.equal(stateHash(w), 2683494392);
});
