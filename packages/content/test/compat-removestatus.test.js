// A kit's removeStatus through the compatibility layer (docs/spec/compat.md 兼容-4): Stronghold's removeBuff by the
// status's key, on the engine's status catalogue (状态-5) and the compat layer's stand-ins — with a kit of our own in the
// tiny level, and the pinned commit's own caller, the 6-tier cleanse of kits/shared/tier6.js, unchanged.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { oracleDir, tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { createWorld, step, buffs, status, attrs } from '@aue/sim';
import { kitsBehaviors } from '../src/compat/kits.js';
import { loadUnderGrid } from '../src/compat/grid.js';
import { CompatGap } from '../src/compat/sh/gap.js';

/** @typedef {import('../src/compat/battle.js').ShBattle} ShBattle @typedef {import('@aue/sim').Unit} Unit */

/** @type {(battle: any, u: any) => number} the pinned commit's cleanseAbnormal */
let cleanse;

before(async () => {
  const compat = new URL('../src/compat/', import.meta.url).href;
  register(new URL('hook.js', compat), { data: { root: pathToFileURL(`${oracleDir()}/`).href, compat } });
  const mod = await loadUnderGrid(() => import(pathToFileURL(join(oracleDir(), 'server', 'sim', 'content', 'kits', 'shared', 'tier6.js')).href));
  cleanse = mod.cleanseAbnormal;
});

/**
 * The tiny level with the guard under a kit of our own (its install may register handlers), one slime of 1e6 HP that
 * comes out at once and is held next to the guard; the battle and both units.
 * @param {(b: any, self: any) => void} [install]
 */
function match(install = () => {}) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies.slime.maxHp = 1e6;
  c.level.waves = [oneWave([spawnAt(0, 'slime')])];
  c.decks = [['guard']];
  const box = /** @type {{ b: ShBattle | null }} */ ({ b: null });
  const factory = () => ({ skills: {}, install(/** @type {any} */ b, /** @type {any} */ self) { install(b, self); } });
  c.behaviors = kitsBehaviors({ guard: { factory, def: { name: 'guard', skill: null } } }, (x) => { box.b = x; });
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 2, dir: 0 }]]);
  while (!w.units.some((/** @type {Unit} */ u) => u.key === 'slime')) step(w, c);
  const guard = /** @type {Unit} */ (w.units.find((u) => u.key === 'guard')), slime = /** @type {Unit} */ (w.units.find((u) => u.key === 'slime'));
  buffs.addBuff(slime, buffs.makeBuff({ key: 'held', flags: { root: true } }));
  return { w, c, guard, slime, b: /** @type {ShBattle} */ (box.b) };
}

/** @param {Unit} u */
const keys = (u) => u.buffs.map((x) => x.key).sort();

test('[兼容-4] [状态-5] removeStatus takes a status off by Stronghold\'s name: 睡眠, 束缚 (the engine\'s root), a stand-in; other buffs stay; none there: nothing', () => {
  const { guard, slime, b } = match();
  const e = b.unitOf(slime);
  buffs.addBuff(slime, buffs.makeBuff({ key: 'mine', mods: { atk: 5 } }));
  assert.equal(b.applyStatus(e, 'sleep', { duration: 5 }), true);
  assert.equal(b.applyStatus(e, 'bind', { duration: 5 }), true);
  assert.equal(b.applyStatus(e, 'defDown', { duration: 5, value: 0.3 }), true);
  assert.deepEqual(keys(slime), ['defDown', 'held', 'mine', 'root', 'sleep']);
  b.removeStatus(e, 'sleep');
  assert.deepEqual([keys(slime), !!attrs.statsOf(slime).flags.sleep], [['defDown', 'held', 'mine', 'root'], false]);
  b.removeStatus(e, 'bind');
  b.removeStatus(e, 'defDown');
  assert.deepEqual(keys(slime), ['held', 'mine'], 'root by 束缚, the stand-in by its key; `held` (no status) and `mine` stay');
  b.removeStatus(e, 'stun');
  assert.deepEqual(keys(slime), ['held', 'mine'], 'a status it does not have: nothing');
  assert.doesNotThrow(() => b.removeStatus(/** @type {any} */ (null), 'stun'), 'no unit: nothing');
  assert.deepEqual(keys(guard), []);
});

test('[兼容-4] [状态-5] [状态-6] 寒冷 and 冻结 come off from either side: a friendly cold and an enemy\'s cold, a friendly and an enemy freeze', () => {
  const { guard, slime, b } = match();
  status.applyStatus(slime, 'cold', { src: guard, seconds: 5 });
  status.applyStatus(guard, 'cold', { src: slime, seconds: 5 });
  assert.deepEqual([keys(slime), keys(guard)], [['cold', 'held'], ['enemyCold']]);
  b.removeStatus(b.unitOf(slime), 'cold');
  b.removeStatus(b.unitOf(guard), 'cold');
  assert.deepEqual([keys(slime), keys(guard)], [['held'], []]);
  status.applyStatus(slime, 'freeze', { src: guard, seconds: 5 });
  status.applyStatus(guard, 'freeze', { src: slime, seconds: 5 });
  assert.deepEqual([keys(slime), keys(guard)], [['freeze', 'held'], ['enemyFreeze']]);
  b.removeStatus(b.unitOf(slime), 'freeze');
  b.removeStatus(b.unitOf(guard), 'freeze');
  assert.deepEqual([keys(slime), keys(guard)], [['held'], []]);
});

test('[兼容-4] a name with no engine status and no stand-in (隐匿 `stealth`) is a gap; from a kit\'s handler it is recorded and the battle goes on', () => {
  const { w, c, slime, b } = match((bb, self) => { bb.every(1, () => { bb.removeStatus(self, 'stealth'); }, { owner: self }); });
  assert.throws(() => b.removeStatus(b.unitOf(slime), 'stealth'), (err) => err instanceof CompatGap && /status\.stealth/.test(String(err.message)));
  for (let i = 0; i < 40; i++) step(w, c);
  assert.ok(b.errors.some((x) => /status\.stealth/.test(x.message)), JSON.stringify(b.errors));
});

test('[兼容-4] the pinned 6-tier cleanse (kits/shared/tier6.js cleanseAbnormal), unchanged: every 异常状态 off by its Stronghold name, the rest kept', () => {
  const { guard, slime, b } = match();
  const u = b.unitOf(guard);
  status.applyStatus(guard, 'stun', { src: slime, seconds: 5 });
  status.applyStatus(guard, 'cold', { src: slime, seconds: 5 });
  status.applyStatus(guard, 'silence', { src: slime, seconds: 5 });
  assert.equal(b.applyStatus(u, 'bind', { duration: 5 }), true);
  buffs.addBuff(guard, buffs.makeBuff({ key: 'mine', mods: { atk: 5 } }));
  assert.equal(cleanse(b, u), 4);
  assert.deepEqual(keys(guard), ['mine']);
  assert.equal(cleanse(b, u), 0, 'nothing left to cleanse');
});
