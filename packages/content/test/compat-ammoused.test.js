// The engine's ammoUsed as kits see it (docs/spec/compat.md 兼容-4「弹药的事件」, hooks.md 钩子-3): the kit's unit, the
// shots left and its skill; a kit's own emit of it (Stronghold's kits spend extra shots of one attack themselves) reaches
// the handlers as it is — with a kit of our own on the tiny level.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { createWorld, step, buffs } from '@aue/sim';
import { kitsBehaviors } from '../src/compat/kits.js';

/** @typedef {import('../src/compat/battle.js').ShBattle} ShBattle @typedef {import('@aue/sim').Unit} Unit */

/**
 * The tiny level: the guard with an ammo skill of `shots` shots it may start at once, under a kit of our own (its install
 * gets the battle and its unit), one slime of 1e6 HP held in its range; the skill started.
 * @param {number} shots @param {(b: any, self: any) => void} install
 */
function match(shots, install) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies.slime.maxHp = 1e6;
  c.level.waves = [oneWave([spawnAt(0, 'slime')])];
  c.operators.guard.skill = { id: 'test', type: 'MANUAL', sp: 'time', cost: 1, init: 1, charges: 1, duration: 0, ammo: true, bb: { 'attack@trigger_time': shots } };
  c.decks = [['guard']];
  const box = /** @type {{ b: ShBattle | null }} */ ({ b: null });
  const factory = () => ({ skills: {}, install(/** @type {any} */ b, /** @type {any} */ self) { install(b, self); } });
  c.behaviors = kitsBehaviors({ guard: { factory, def: { name: 'guard', skill: null } } }, (x) => { box.b = x; });
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 2, dir: 0 }]]);
  while (!w.units.some((/** @type {Unit} */ u) => u.key === 'slime')) step(w, c);
  const guard = /** @type {Unit} */ (w.units.find((u) => u.key === 'guard')), slime = /** @type {Unit} */ (w.units.find((u) => u.key === 'slime'));
  slime.x = 3; slime.y = 1;
  buffs.addBuff(slime, buffs.makeBuff({ key: 'held', flags: { root: true } }));
  step(w, c, [[0, { type: 'skill', unit: guard.id }]]);
  return { w, c, guard, b: /** @type {ShBattle} */ (box.b) };
}

test('[兼容-4] [钩子-3] a kit sees ammoUsed with its own unit, the shots left and its skill, whose ammoLeft is that number', () => {
  for (const shots of [3, 4]) {
    /** @type {any[]} */
    const seen = [];
    let self = null;
    const { w, c, b } = match(shots, (bb, me) => { self = me; bb.on('ammoUsed', (/** @type {any} */ k) => { seen.push([k.unit === me, k.left, k.skill?.ammoLeft, k.skill === me.skill]); }, { owner: me }); });
    for (let i = 0; i < 30 * (shots + 2); i++) step(w, c);
    assert.ok(self && b);
    assert.deepEqual(seen, Array.from({ length: shots }, (_, i) => [true, shots - 1 - i, shots - 1 - i, true]));
  }
});

test('[兼容-4] a kit\'s own emit of ammoUsed (its extra shots) reaches every handler as it is: the same unit, left and skill', () => {
  /** @type {any[]} */
  const seen = [];
  const { w, c, b } = match(5, (bb, me) => {
    bb.on('ammoUsed', (/** @type {any} */ k) => { seen.push(k); }, { owner: me });
  });
  const me = b.unitOf(/** @type {Unit} */ (w.units.find((u) => u.key === 'guard')));
  const sent = { unit: me, left: 2, skill: me.skill }, before = seen.length;
  b.emit('ammoUsed', sent);
  assert.equal(seen.length, before + 1);
  assert.equal(seen[before], sent, 'not reshaped');
  step(w, c);
});
