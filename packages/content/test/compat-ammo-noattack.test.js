// An ammo skill whose spec says attack.noAttack drops the attack already due on its start frame (docs/spec/compat.md
// 兼容-5): 蕾缪安 S3, unchanged, and a probe kit for the frame the real kit cannot isolate.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { secondsToFrames } from '@aue/math';
import { ANIM } from '@aue/schema';
import { oracleDir, oneWave, spawnAt, tinyContent } from '@aue/testkit';
import { createWorld, step, bus, buffs, status } from '@aue/sim';
import { loadUnderGrid } from '../src/compat/grid.js';
import { defOf } from '../src/compat/records.js';
import { kitsBehaviors, withKitTrait } from '../src/compat/kits.js';
import { loadTraining, operatorAt } from '../src/operators.js';

/** @typedef {import('../src/compat/battle.js').ShBattle} ShBattle */

const CHAR = 'char_4193_lemuen';
/** The differential's build (兼容-6): E2 60, 潜能 6, 信赖 0, S3 at rank 7, the last module at level 3. */
const BUILD = { elite: 2, level: 60, potential: 6, trust: 0, skill: 2, skillLevel: 7, module: 0, moduleLevel: 3 };
/** @type {any} */
let factory;
/** @type {Awaited<ReturnType<typeof loadTraining>>} */
let training;

before(async () => {
  const compat = new URL('../src/compat/', import.meta.url).href;
  register(new URL('hook.js', compat), { data: { root: pathToFileURL(`${oracleDir()}/`).href, compat } });
  const file = join(oracleDir(), 'server', 'sim', 'content', 'kits', 'ops', 'chess_char_6_01-lemuen.js');
  const mod = await loadUnderGrid(() => import(pathToFileURL(file).href));
  factory = mod.default.chess_char_6_01_a;
  training = await loadTraining(CHAR);
});

/** The engine's record without its talents: the kit applies them (兼容-6). @param {Record<string, any>} d */
const bare = ({ talentBb, talentMods, talentTrait, fieldTalents, rangeTalents, critTalents, timedTalents, deployTalents, ...rest }) => rest;

/** Holds a dummy still without a status a kit can read (兼容-6). @param {any} u @param {number} row @param {number} col */
function park(u, row, col) {
  u.x = col;
  u.y = row;
  if (!u.buffs.some((/** @type {any} */ b) => b.key === 'test:still')) buffs.addBuff(u, buffs.makeBuff({ key: 'test:still', flags: { root: true } }));
}

/**
 * 蕾缪安 on the tiny level, S3 retimed the way the differential starts a manual skill: AUTO, as she is about to attack.
 * The kit file is not edited. Her talent blackboard and `attack@trigger_time` come from this build.
 */
function field() {
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [oneWave([spawnAt(0, 'dummy')])];
  Object.assign(c.level.options, { initialCost: 99, maxCost: 99, characterLimit: 4 });
  c.enemies = { dummy: { name: 'dummy', maxHp: 1e7, atk: 0, def: 0, res: 0, moveSpeed: 1 } };
  const def = defOf(CHAR, training, BUILD), entry = { factory, def, chess: true };
  c.operators = { lemuen: { ...withKitTrait(/** @type {any} */ (bare(operatorAt(training, BUILD))), entry, c.level), respawnTime: 1 } };
  c.operators.lemuen.skill = { ...c.operators.lemuen.skill, type: 'AUTO' };
  c.decks = [['lemuen']];
  const box = /** @type {{ b: ShBattle | null }} */ ({ b: null });
  c.behaviors = kitsBehaviors({ lemuen: entry }, (x) => { box.b = x; });
  const w = createWorld(c, { seed: 1, players: 1 });
  const talent = def.talents[1].bb;
  return { w, c, b: /** @type {ShBattle} */ (box.b), shots: def.skill.bb['attack@trigger_time'], add: talent.add_count, wait: talent.interval };
}

/**
 * One S3: the dummy stays out of range until `waitFrames`, then stands in front of her. Locks are the kit's own
 * `ammoUsed` (it carries `skill`); an engine shot does not.
 * @param {number} waitFrames
 */
function cast(waitFrames) {
  const { w, c, b, shots, add, wait } = field();
  const kitLocks = /** @type {number[]} */ ([]), engineShots = /** @type {number[]} */ ([]), stray = /** @type {number[]} */ ([]);
  let phase = false;
  bus.on(w, 'ammoUsed', (k) => { (k.skill ? kitLocks : engineShots).push(w.frame); });
  bus.on(w, 'skillStart', () => { phase = true; });
  bus.on(w, 'skillEnd', () => { phase = false; });
  bus.on(w, 'damaged', (k) => { if (phase && k.dmg?.isAttack) stray.push(k.amount); });
  step(w, c, [[0, { type: 'deploy', op: 'lemuen', row: 2, col: 2, dir: 0 }]]);
  const me = /** @type {any} */ (w.units.find((u) => u.key === 'lemuen'));
  const foe = /** @type {any} */ (w.units.find((u) => u.key === 'dummy'));
  me.skill.sp = me.skill.cost;
  park(foe, 0, 5);
  while (w.frame < waitFrames) step(w, c);
  park(foe, 1, 2);
  let guard = 0;
  while (!me.skill.active && guard++ < 5) step(w, c);
  const opened = { ammo: me.skill.ammo, atkCd: me.atkCd, frame: w.frame - 1 };
  while (me.skill.active && w.frame < waitFrames + 400) step(w, c);
  return { b, shots, add, wait, kitLocks, engineShots, stray, opened, active: me.skill.active };
}

test('[兼容-5] 蕾缪安 S3, unchanged: the due attack does not land or spend a shot; locks equal attack@trigger_time', () => {
  const r = cast(0);
  assert.equal(r.active, false, 'the lock phase ended');
  assert.deepEqual([r.opened.ammo, r.opened.atkCd], [r.shots, 0], 'the start frame spent nothing and did not restart the cooldown');
  assert.deepEqual([r.kitLocks.length, r.engineShots, r.stray], [r.shots, [], []], `${r.shots} kit locks, no engine shot, no isAttack while it ran`);
  assert.deepEqual(r.b.errors.filter((e) => !e.label.startsWith('trait.')), []);
});

test('[兼容-5] 蕾缪安 S3 after 逃犯引渡手续: the next cast locks trigger_time plus the talent\'s add_count', () => {
  const r = cast(secondsToFrames(15));
  assert.equal(r.wait, 15, 'this build\'s blackboard, not the kit\'s fallback of 20');
  assert.equal(r.add, 2);
  assert.equal(r.active, false);
  assert.deepEqual([r.opened.ammo, r.opened.atkCd], [r.shots + r.add, 0]);
  assert.deepEqual([r.kitLocks.length, r.engineShots, r.stray], [r.shots + r.add, [], []]);
  assert.deepEqual(r.b.errors.filter((e) => !e.label.startsWith('trait.')), []);
});

/**
 * The tiny guard, an ammo skill `s` that starts as she is about to attack, a rooted slime one tile ahead. `spec` is the
 * kit's description. Her attack interval is 2 s, longer than a 1 s skill.
 * @param {Record<string, any>} spec
 */
function open(spec) {
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [oneWave([spawnAt(0, 'slime')])];
  c.level.options.initialCost = 99;
  c.enemies.slime = { ...c.enemies.slime, maxHp: 1e7, def: 0 };
  c.operators.guard = { ...c.operators.guard, baseAttackTime: 2, skill: {
    id: 's', type: 'AUTO', sp: 'time', cost: 10, init: 10, charges: 1, duration: 0, ammo: true, bb: { 'attack@trigger_time': 4 },
  } };
  c.decks = [['guard']];
  const factoryOf = () => ({ skills: { s: spec } });
  c.behaviors = kitsBehaviors({ guard: { factory: factoryOf, def: { name: 'guard', skill: { id: 's', bb: {} } } } });
  const w = createWorld(c, { seed: 1, players: 1 });
  /** @type {{ frame: number, attack: boolean }[]} */
  const hits = [];
  bus.on(w, 'damaged', (k) => { hits.push({ frame: w.frame, attack: !!k.dmg?.isAttack }); });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 2, dir: 0 }]]);
  const guard = /** @type {any} */ (w.units.find((u) => u.key === 'guard'));
  const foe = /** @type {any} */ (w.units.find((u) => u.key === 'slime'));
  Object.assign(foe, { x: 3, y: 1 });
  status.applyStatus(foe, 'root', {});
  return { w, c, guard, foe, hits };
}

test('[兼容-5] [技能-3] a probe kit: noAttack drops the due attack, spends nothing, leaves the cooldown at 0, and she attacks the frame it ends', () => {
  const { w, c, guard, hits } = open({ kind: 'ammo', duration: 1, attack: { noAttack: true } });
  let start = -1, end = -1, cdAtEnd = -1, held = -1;
  bus.on(w, 'skillStart', () => { start = w.frame; });
  bus.on(w, 'skillEnd', () => { end = w.frame; cdAtEnd = guard.atkCd; });
  step(w, c);
  assert.deepEqual([start, guard.skill.active, guard.skill.ammo, guard.atkCd, guard.anim, hits], [w.frame - 1, true, 4, 0, ANIM.IDLE, []]);
  // endSkill clears ammo as the duration ends, so the unspent count is the last frame the skill is still running.
  while (end < 0 && w.frame < start + 90) { held = guard.skill.ammo; step(w, c); }
  const during = hits.filter((h) => h.attack && h.frame < end), onEnd = hits.filter((h) => h.attack && h.frame === end);
  assert.deepEqual([end, cdAtEnd, held, during, onEnd.length], [start + secondsToFrames(1), 0, 4, [], 1]);
});

test('[兼容-5] [技能-3] a probe kit without noAttack: the due attack hits and the engine spends one shot', () => {
  const { w, c, guard, hits } = open({ kind: 'ammo', attack: { atkScale: 1 } });
  step(w, c);
  assert.equal(guard.skill.active, true);
  assert.equal(guard.skill.ammo, 3, 'the attack the kit did make spends one');
  assert.equal(hits.filter((h) => h.attack).length, 1);
});

test('[兼容-5] [技能-3] a probe kit: a start that leaves her down spends no attack and does not start the cooldown', () => {
  const { w, c, guard, foe, hits } = open({ kind: 'ammo', onStart(/** @type {any} */ ctx) { ctx.unit.hp = 0; } });
  const hp = foe.hp;
  step(w, c);
  assert.equal(guard.hp, 0);
  assert.equal(guard.atkCd, 0);
  assert.equal(foe.hp, hp);
  assert.deepEqual(hits, []);
});
