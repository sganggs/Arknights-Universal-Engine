// Stronghold's 缴械 and 反隐 through the compatibility layer (docs/spec/compat.md 兼容-4; docs/spec/status.md 状态-12):
// a kit's applyStatus('disarm') and a buff flagged `disarm` are the engine's 缴械; applyStatus('reveal') gives the
// engine's 反隐 flag `unstealth` instead of a CompatGap — with a kit of our own in the tiny level, and 涤火杰西卡's pinned
// kit, unchanged, whose module reveals the stealthed enemies in her range.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { oracleDir, tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { createWorld, step, bus, buffs, targeting } from '@aue/sim';
import { kitsBehaviors, kitsWorld, withKitTrait } from '../src/compat/kits.js';
import { loadUnderGrid } from '../src/compat/grid.js';
import { defOf } from '../src/compat/records.js';
import { CompatGap } from '../src/compat/sh/gap.js';
import { loadTraining, operatorAt } from '../src/operators.js';

/** @typedef {import('../src/compat/battle.js').ShBattle} ShBattle @typedef {import('@aue/sim').Unit} Unit */

const JESCA = 'char_1034_jesca2';
/** E2 90, 潜能 6, S3 at 专精 3, her first module “私家英雄” (uniequip_002_jesca2: 攻击范围内敌人的隐匿效果失效) at stage 3. */
const BUILD = { elite: 2, level: 90, potential: 6, trust: 100, skill: 2, skillLevel: 10, module: 0, moduleLevel: 3 };
/** @type {any} */
let jesca;
/** @type {any} */
let training;

before(async () => {
  const compat = new URL('../src/compat/', import.meta.url).href;
  register(new URL('hook.js', compat), { data: { root: pathToFileURL(`${oracleDir()}/`).href, compat } });
  const mod = await loadUnderGrid(() => import(pathToFileURL(join(oracleDir(), 'server', 'sim', 'content', 'kits', 'ops', 'op-jesca2.js')).href));
  jesca = mod.default[JESCA];
  training = await loadTraining(JESCA);
});

/**
 * The tiny level with the guard (ATK 50) under a kit of our own that does nothing, slimes of 1e6 HP walking in (with
 * `lone`, one slime at once instead, to be placed); the guard's hits by frame.
 * @param {{ lone?: boolean }} [o]
 */
function match(o = {}) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies.slime.maxHp = 1e6;
  if (o.lone) c.level.waves = [oneWave([spawnAt(0, 'slime')])];
  c.decks = [['guard']];
  const box = /** @type {{ b: ShBattle | null }} */ ({ b: null });
  const factory = () => ({ skills: {}, install() {} });
  c.behaviors = kitsBehaviors({ guard: { factory, def: { name: 'guard', skill: null } } }, (x) => { box.b = x; });
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 2, dir: 0 }]]);
  const guard = /** @type {Unit} */ (w.units.find((u) => u.key === 'guard'));
  /** @type {number[]} */
  const hits = [];
  bus.on(w, 'damaged', (k) => { if (k.source === guard) hits.push(w.frame); });
  return { w, c, guard, hits, b: /** @type {ShBattle} */ (box.b) };
}
/** @param {any} w @param {any} c @param {number} n */
const run = (w, c, n) => { for (let i = 0; i < n; i++) step(w, c); };

/**
 * The slime once it is out, put at (row, col) and held there under 隐匿 (a buff `veil`: stealth, root).
 * @param {any} w @param {any} c @param {number} row @param {number} col @returns {Unit}
 */
function hidden(w, c, row, col) {
  while (!w.units.some((/** @type {Unit} */ u) => u.key === 'slime')) step(w, c);
  const e = /** @type {Unit} */ (w.units.find((/** @type {Unit} */ u) => u.key === 'slime'));
  e.x = col; e.y = row;
  buffs.addBuff(e, buffs.makeBuff({ key: 'veil', flags: { stealth: true, root: true } }));
  return e;
}

test('[兼容-4] [状态-12] a kit\'s applyStatus(\'disarm\') is the engine\'s 缴械: its seconds as frames, the event in Stronghold\'s names, no attack while it holds', () => {
  for (const seconds of [2, 1.5]) {
    const { w, c, guard, hits, b } = match();
    while (hits.length === 0) step(w, c);
    const u = b.unitOf(guard), seen = /** @type {any[]} */ ([]);
    b.on('beforeStatus', (/** @type {any} */ k) => { seen.push([k.status, k.duration]); });
    const at = w.frame;
    assert.equal(b.applyStatus(u, 'disarm', { duration: seconds }), true);
    const held = /** @type {any} */ (u.findBuff('disarm'));
    assert.deepEqual([seen, held.status, held.timeLeft, guard.buffs.filter((x) => x.key === 'disarm').length, u.flags.disarm],
      [[['disarm', seconds]], 'disarm', seconds, 1, true], 'the catalogue\'s buff, as the kit names it');
    run(w, c, seconds * 30 + 40);
    const first = hits.find((f) => f > at) ?? -1;
    assert.ok(first >= at + seconds * 30, `${seconds} s: no hit until it ends (first after it at ${first - at})`);
    assert.deepEqual(b.errors, []);
  }
});

test('[兼容-4] [状态-12] a kit buff flagged disarm holds the attack too; under the kit\'s invulnerable it does nothing (状态-12, unlike Stronghold)', () => {
  const plain = match(), shell = match();
  for (const m of [plain, shell]) while (m.hits.length === 0) step(m.w, m.c);
  const at = plain.w.frame;
  plain.b.addBuff(plain.b.unitOf(plain.guard), { key: 'cast', duration: 2, flags: { disarm: true } });
  shell.b.addBuff(shell.b.unitOf(shell.guard), { key: 'cast', duration: 2, flags: { disarm: true, invulnerable: true } });
  run(plain.w, plain.c, 60);
  run(shell.w, shell.c, 60);
  assert.deepEqual([plain.hits.filter((f) => f > at), plain.guard.buffs.find((x) => x.key === 'cast')?.flags], [[], undefined], '2 s without a hit; the buff is gone');
  assert.ok(shell.hits.filter((f) => f > at).length >= 1, '无敌: 缴械 does nothing (Stronghold\'s disarm would hold it)');
});

test('[兼容-4] a kit\'s applyStatus(\'reveal\') is the engine\'s 反隐: one buff with unstealth, the longer time kept, after beforeStatus; read back as reveal', () => {
  const { w, c, b } = match({ lone: true });
  const e = hidden(w, c, 1, 4);
  const s = b.unitOf(e), seen = /** @type {any[]} */ ([]);
  b.on('beforeStatus', (/** @type {any} */ k) => { seen.push([k.status, k.duration]); if (k.duration > 5) k.cancel = true; });
  assert.equal(targeting.stealthed(e), true);
  assert.equal(b.applyStatus(s, 'reveal', { duration: 1 }), true);
  const r = /** @type {any} */ (e.buffs.find((x) => x.key === 'reveal'));
  assert.deepEqual([r.flags, r.mods, r.rule, r.left, targeting.stealthed(e), s.flags.reveal, s.findBuff('reveal')?.status], [{ unstealth: true }, {}, 'extend', 30, false, true, 'reveal']);
  run(w, c, 10);
  b.applyStatus(s, 'reveal', { duration: 0.5 });
  assert.deepEqual(e.buffs.filter((x) => x.key === 'reveal').map((x) => x.left), [20], 'one buff; 0.5 s does not shorten it');
  b.applyStatus(s, 'reveal', { duration: 2.5 });
  assert.equal(r.left, 75, 'the longer time');
  assert.equal(b.applyStatus(s, 'reveal', { duration: 9 }), false, 'a handler cancels it');
  assert.deepEqual(seen, [['reveal', 1], ['reveal', 0.5], ['reveal', 2.5], ['reveal', 9]]);
  run(w, c, 75);
  assert.deepEqual([e.buffs.some((x) => x.key === 'reveal'), targeting.stealthed(e)], [false, true], 'it ends: 隐匿 again');
  b.addBuff(s, { key: 'lamp', duration: 1, flags: { reveal: true } });
  assert.deepEqual([e.buffs.find((x) => x.key === 'lamp')?.flags, targeting.stealthed(e)], [{ unstealth: true }, false], 'a kit buff\'s reveal flag is the same');
  assert.throws(() => b.applyStatus(s, 'slow', { duration: 1 }), (x) => x instanceof CompatGap && x.what === 'status.slow', 'a status the engine lacks still says so');
  assert.equal(b.applyStatus(s, 'defDown', { duration: 1 }), true);
  const other = e.buffs.find((x) => x.key === 'defDown');
  assert.deepEqual([other?.flags, other?.rule], [{}, 'max'], 'the other stand-in carries no 反隐 and keeps its strongest-value rule');
});

/** The engine's record without its talents: her kit applies them. @param {Record<string, any>} d */
const bare = ({ talentBb, fieldTalents, rangeTalents, critTalents, timedTalents, deployTalents, ...rest }) => rest;

test('[兼容-4] 涤火杰西卡\'s pinned kit: her module reveals the stealthed enemy in her range with no kit error, and lets go when it leaves', () => {
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [oneWave([spawnAt(0, 'slime')])];
  c.enemies.slime.maxHp = 1e7;
  Object.assign(c.level.options, { initialCost: 40, maxCost: 99, characterLimit: 4 });
  const entry = { factory: jesca, def: defOf(JESCA, training, BUILD) };
  // as in a match: her module's own aura (职业-20) is the kit's, not the engine's
  c.operators.jesca2 = { ...withKitTrait(/** @type {any} */ (bare(operatorAt(training, BUILD))), entry, c.level), respawnTime: 1 };
  c.decks = [['jesca2']];
  const box = /** @type {{ b: any }} */ ({ b: null });
  c.behaviors = { world: kitsWorld({ jesca2: entry }, (x) => { box.b = x; }) };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'jesca2', row: 1, col: 1, dir: 0 }]]);
  const e = hidden(w, c, 1, 3);
  run(w, c, 30);
  const b = /** @type {ShBattle} */ (box.b);
  assert.deepEqual([b.errors, targeting.stealthed(e), e.buffs.filter((x) => x.key === 'reveal').length], [[], false, 1], 'revealed every 0.2 s, one buff');
  e.x = 5;
  run(w, c, 20);
  assert.deepEqual([e.buffs.some((x) => x.key === 'reveal'), targeting.stealthed(e)], [false, true], 'out of her range: its 0.3 s run out, 隐匿 again');
});
