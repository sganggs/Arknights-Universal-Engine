// 暴鸰 / 暴鸰·G (docs/spec/foes.md 敌能-56, 敌能-37): one bomb on the target's 3×3, then move speed ×2 for good.
// The sports-mode boomb (atk_scale, projectile_life_time, projectile_range) stays uncovered (关卡-2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, buffs, bus } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import act07 from '../data/levels/act1multi_07.json' with { type: 'json' };
import { foeBehaviors, withFoeExtras, uncoveredAbilities, withoutIncomplete } from '../src/foes.js';
import { levelAt, levelContent } from '../src/index.js';

/** @typedef {import('@aue/sim').World} World */
/** @typedef {import('@aue/sim').Unit} Unit */
/** @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const HP = 1e6;

/** @param {'MELEE' | 'RANGED'} position @param {number} taunt */
function opOf(position, taunt) {
  return {
    name: position, position, cost: 0, blockCnt: 0, baseAttackTime: 1, maxHp: HP, atk: 0, def: 0, res: 0, tauntLevel: taunt,
    range: [{ row: 0, col: 0 }],
  };
}

/** @param {number} atk @returns {EnemyDef} */
function bombDef(atk) {
  return {
    name: atk === 1500 ? '暴鸰·G' : '暴鸰', maxHp: atk === 1500 ? 6000 : 4000, atk, def: atk === 1500 ? 220 : 150, res: 30,
    moveSpeed: 0.6, baseAttackTime: 5, rangeRadius: 2, applyWay: 'RANGED', motion: 'FLY', massLevel: 1,
    skills: [{ key: 'boomb', cooldown: 1, initCooldown: 1, sp: 0, bb: { move_speed: 2 } }],
  };
}

/**
 * Spawns 暴鸰 (atk 800) or 暴鸰·G (1500) at road column 0, rooted, then deploys `ops` on frame 1.
 * The bomb, with someone in range, is frame 30.
 * @param {number} atk @param {[string, number, number][]} ops @returns {{ c: any, w: World, e: Unit, by: Record<string, Unit> }}
 */
function place(atk, ops) {
  const key = atk === 1500 ? 'enemy_1040_bombd_2' : 'enemy_1040_bombd';
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [key]: withFoeExtras(key, bombDef(atk)) };
  c.behaviors = { foes: foeBehaviors };
  c.level.waves = [oneWave([spawnAt(0, key)])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, characterLimit: 9 };
  c.operators = { main: opOf('MELEE', 1), fly: opOf('MELEE', 0), edge: opOf('MELEE', 0), camou: opOf('RANGED', 0), far: opOf('MELEE', 0) };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = w.units.find((u) => u.owner < 0);
  assert.ok(e);
  e.x = 0;
  e.y = 1;
  status.applyStatus(e, 'root', {});
  step(w, c, ops.map(([op, row, col]) => [0, { type: 'deploy', op, row, col, dir: 0 }]));
  /** @type {Record<string, Unit>} */
  const by = {};
  for (const u of w.units) if (u.owner >= 0) by[u.key] = u;
  return { c, w, e, by };
}

/** @param {World} w @param {any} c @param {number} n */
function run(w, c, n) {
  /** @type {any[]} */
  const out = [];
  for (let i = 0; i < n; i++) for (const ev of step(w, c)) out.push({ ...ev, f: w.frame - 1 });
  return out;
}

/** @param {Unit} u */
const lost = (u) => HP - u.hp;

/**
 * Hits this enemy dealt, with the flags the presentation event does not carry.
 * @param {World} w @param {Unit} e
 */
function watchHits(w, e) {
  /** @type {{ id: number, attack: boolean, skill: boolean, splash: boolean, type: string }[]} */
  const hits = [];
  bus.on(w, 'hit', (k) => {
    if (k.credit !== e) return;
    hits.push({
      id: k.target.id, attack: k.dmg.isAttack === true, skill: k.dmg.isSkill === true, splash: k.dmg.isSplash === true, type: k.dmg.type,
    });
  });
  return hits;
}

/** @param {{ id: number, attack: boolean, skill: boolean, splash: boolean, type: string }[]} hits @param {number} id @param {boolean} splash */
function oneHit(hits, id, splash) {
  assert.deepEqual(hits.filter((h) => h.id === id), [{ id, attack: true, skill: true, splash, type: 'phys' }]);
}

test('[敌能-56] [敌能-37] nobody in range: no bomb; noAttack and Static from spawn; one bomb the frame a target is in range', () => {
  const { c, w, e, by } = place(800, [['far', 1, 4]]);
  assert.equal(attrs.statsOf(e).flags.noAttack, true);
  assert.equal(attrs.statsOf(e).flags.staticBody, true);
  assert.equal(attrs.statsOf(e).flying, true);
  assert.equal(attrs.statsOf(e).moveSpeed, 0.6);
  const quiet = run(w, c, 40);
  assert.equal(quiet.filter((x) => x.type === 'hit' || x.type === 'attack').length, 0);
  assert.equal(lost(by.far), 0);
  assert.equal(attrs.statsOf(e).moveSpeed, 0.6);
  step(w, c, [[0, { type: 'deploy', op: 'main', row: 1, col: 2, dir: 0 }]]);
  const main = w.units.find((u) => u.key === 'main');
  assert.ok(main);
  assert.equal(lost(main), 800);
  assert.equal(lost(by.far), 0);
  assert.equal(attrs.statsOf(e).moveSpeed, 1.2);
  const again = run(w, c, 200);
  assert.equal(again.filter((x) => x.id === e.id && (x.type === 'hit' || x.type === 'attack')).length, 0);
});

test('[敌能-56] one bomb on the 3×3: main attack, splash including 迷彩 and a tile outside the radius; silence does not stop it; ×2 for good; never again', () => {
  const { c, w, e, by } = place(800, [['main', 1, 2], ['fly', 1, 1], ['edge', 1, 3], ['camou', 0, 3], ['far', 1, 4]]);
  buffs.addBuff(by.fly, buffs.makeBuff({ key: 'hover', flags: { hover: true } }));
  buffs.addBuff(by.camou, buffs.makeBuff({ key: 'camou', flags: { camou: true } }));
  status.applyStatus(e, 'silence', {});
  const hits = watchHits(w, e);
  const ev = run(w, c, 29);
  const bombHits = ev.filter((x) => x.type === 'hit' && x.id === e.id);
  assert.equal(bombHits.length, 4);
  assert.ok(bombHits.every((x) => x.f === 30));
  assert.equal(ev.filter((x) => x.type === 'attack' && x.id === e.id).length, 0);
  assert.equal(ev.filter((x) => x.type === 'blast' || x.type === 'bolt').length, 0);
  assert.equal(attrs.statsOf(e).flags.silence, true);
  assert.equal(attrs.statsOf(e).flags.noAttack, true);
  assert.equal(attrs.statsOf(e).moveSpeed, 1.2);
  assert.equal(e.buffs.find((b) => b.key === 'boomb')?.mods.moveMul, 2);
  assert.equal(lost(by.main), 800);
  assert.equal(lost(by.fly), 800);
  assert.equal(lost(by.edge), 800);
  assert.equal(lost(by.camou), 800);
  assert.equal(lost(by.far), 0);
  oneHit(hits, by.main.id, false);
  oneHit(hits, by.fly.id, true);
  oneHit(hits, by.edge.id, true);
  oneHit(hits, by.camou.id, true);
  assert.equal(hits.filter((h) => h.id === by.far.id).length, 0);
  const more = run(w, c, 200);
  assert.equal(more.filter((x) => x.id === e.id && (x.type === 'hit' || x.type === 'attack')).length, 0);
  assert.equal(lost(by.main), 800);
  assert.equal(attrs.statsOf(e).moveSpeed, 1.2);
});

test('[敌能-56] 暴鸰·G deals its own attack, 1500, on that same frame', () => {
  const { c, w, e, by } = place(1500, [['main', 1, 2]]);
  const ev = run(w, c, 29);
  assert.equal(e.key, 'enemy_1040_bombd_2');
  assert.equal(lost(by.main), 1500);
  assert.deepEqual(ev.filter((x) => x.type === 'hit').map((x) => x.f), [30]);
  assert.equal(attrs.statsOf(e).moveSpeed, 1.2);
});

/** @param {'stun' | 'freeze' | 'sleep'} name */
function held(name) {
  const { c, w, e, by } = place(800, [['main', 1, 2]]);
  status.applyStatus(e, name, {});
  run(w, c, 40);
  assert.equal(lost(by.main), 0, name);
  assert.equal(attrs.statsOf(e).moveSpeed, 0.6, name);
  assert.equal(e.ab['boomb.done'] ?? 0, 0, name);
  buffs.removeBuff(e, name);
  step(w, c);
  assert.equal(lost(by.main), 800, name);
  assert.equal(attrs.statsOf(e).moveSpeed, 1.2, name);
  assert.equal(e.ab['boomb.done'], 1, name);
}

test('[敌能-56] stun, freeze and sleep hold the one bomb and do not spend it', () => {
  for (const name of /** @type {const} */ (['stun', 'freeze', 'sleep'])) held(name);
});

test('[敌能-56] a flying unit in range is the main target; camouflage alone is not a target', () => {
  const fly = place(800, [['fly', 1, 1]]);
  buffs.addBuff(fly.by.fly, buffs.makeBuff({ key: 'hover', flags: { hover: true } }));
  const hits = watchHits(fly.w, fly.e);
  run(fly.w, fly.c, 29);
  assert.equal(lost(fly.by.fly), 800);
  oneHit(hits, fly.by.fly.id, false);
  const open = place(800, [['camou', 0, 2]]);
  run(open.w, open.c, 29);
  assert.equal(lost(open.by.camou), 800, 'row 0 col 2 is inside the radius');
  const cam = place(800, [['camou', 0, 2]]);
  buffs.addBuff(cam.by.camou, buffs.makeBuff({ key: 'camou', flags: { camou: true } }));
  run(cam.w, cam.c, 40);
  assert.equal(lost(cam.by.camou), 0);
  assert.equal(attrs.statsOf(cam.e).moveSpeed, 0.6);
  assert.equal(cam.e.ab['boomb.done'] ?? 0, 0);
});

/** The sports blackboard does not take this behaviour, on the real 赛场补给车 or when the skill is left in place. */
function sportsStays() {
  const cart = /** @type {EnemyDef} */ (/** @type {any} */ (act07).enemies.enemy_4004_muvltr);
  assert.equal(cart.skills?.[0]?.bb.move_speed, undefined);
  assert.ok(uncoveredAbilities([cart]).includes('boomb'));
  assert.equal((withoutIncomplete(cart).skills ?? []).some((s) => s.key === 'boomb'), false);
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { enemy_4004_muvltr: cart };
  c.behaviors = { foes: foeBehaviors };
  c.level.waves = [oneWave([spawnAt(0, 'enemy_4004_muvltr')])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, characterLimit: 9 };
  c.operators.guard = { ...c.operators.guard, cost: 0, atk: 0, def: 0, blockCnt: 0, maxHp: HP };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = w.units.find((u) => u.key === 'enemy_4004_muvltr');
  assert.ok(e);
  const before = attrs.statsOf(e).moveSpeed;
  e.x = 0;
  e.y = 1;
  status.applyStatus(e, 'root', {});
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 2, dir: 0 }]]);
  const ev = run(w, c, 40);
  const g = w.units.find((u) => u.key === 'guard');
  assert.ok(g);
  assert.equal(g.hp, g.maxHp);
  assert.equal(ev.filter((x) => x.type === 'hit' && x.id === e.id).length, 0);
  assert.equal(attrs.statsOf(e).flags.noAttack, undefined);
  assert.equal(attrs.statsOf(e).moveSpeed, before);
  assert.equal(e.buffs.some((b) => b.key === 'boomb' || b.key === 'noAttack'), false);
}

test('[敌能-56] [关卡-2] [关卡-8] sports-mode boomb stays uncovered; the move_speed shape is covered and has Static', () => {
  sportsStays();
  const uncovered = levelAt('act1multi_fortress_rm01', 'NORMAL').level.uncovered;
  assert.ok(uncovered);
  assert.ok(uncovered.includes('boomb'));
  const played = levelContent('act1multi_fortress_rm01', 'NORMAL');
  assert.ok(played.level.uncovered?.includes('boomb'));
  assert.equal(played.enemies.enemy_4009_murgby?.skills?.some((s) => s.key === 'boomb'), false);
  assert.deepEqual(uncoveredAbilities([withFoeExtras('enemy_1040_bombd', bombDef(800))]), []);
  assert.deepEqual(withFoeExtras('enemy_1040_bombd_2', bombDef(1500)).talents?.Static, {});
});
