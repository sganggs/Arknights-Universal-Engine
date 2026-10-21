// More enemy abilities (docs/spec/foes.md 敌能-12…敌能-16) on the real enemies of act1multi_06, placed on the tiny map:
// each enemy spawns by a wave, is moved where the test needs it and stands still.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, targeting } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { levelContent } from '../src/index.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

const real = levelContent('act1multi_06', 'NORMAL');

/**
 * The tiny map with the real enemies and behaviours: `foes` spawn in frame 0 and are put at their (row, col), rooted
 * unless `free`; then, in frame 1, operators (key, row, col) are deployed with no cost, with a million HP.
 * @param {[string, number, number][]} foes @param {[string, number, number][]} ops @param {{ free?: boolean, tweak?: (c: any) => void }} [o]
 */
function arena(foes, ops, o = {}) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { ...c.enemies, ...real.enemies };
  c.behaviors = real.behaviors;
  c.level.waves = [oneWave(foes.map(([k]) => spawnAt(0, k)))];
  c.level.options = { ...c.level.options, initialCost: 50, maxCost: 99, costIncreaseTime: 1000, characterLimit: 9 };
  for (const op of Object.values(c.operators)) Object.assign(op, { cost: 0, maxHp: 1e6 });
  o.tweak?.(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const es = w.units.filter((u) => u.owner < 0);
  es.forEach((e, i) => { e.x = foes[i][2]; e.y = foes[i][1]; if (!o.free) status.applyStatus(e, 'root', {}); });
  step(w, c, ops.map(([op, row, col]) => [0, { type: 'deploy', op, row, col, dir: 0 }]));
  return { c, w, es, ops: w.units.filter((u) => u.owner >= 0) };
}
/** Runs n frames; the events with their frame. @param {World} w @param {any} c @param {number} n */
function run(w, c, n) {
  /** @type {any[]} */
  const out = [];
  for (let i = 0; i < n; i++) for (const ev of step(w, c)) out.push({ ...ev, f: w.frame - 1 });
  return out;
}
/** A unit's buff value of a key, or null. @param {Unit} u @param {string} key */
const valueOf = (u, key) => u.buffs.find((b) => b.key === key)?.value ?? null;

test('[敌能-12] 资源偷取: every third projectile hit takes a cost from the operator\'s player (SP 2); 劫掠 every second takes 3 and heals 5 %', () => {
  const thief = arena([['enemy_1337_bhrknf', 1, 3]], [['guard', 1, 1]]);
  assert.equal(thief.c.enemies.enemy_1337_bhrknf.skills.map((/** @type {any} */ k) => k.sp).join(), '2,2');
  const hits = run(thief.w, thief.c, 400).filter((x) => x.type === 'hit' && x.id === thief.es[0].id);
  assert.ok(hits.length >= 6, String(hits.length));
  assert.equal(50 - thief.w.players[0].cost, Math.floor(hits.length / 3), 'the 3rd, 6th … hit');
  const raider = arena([['enemy_1339_bhrgrd', 1, 2]], [['guard', 1, 2]]);
  const [e] = raider.es, max = attrs.statsOf(e).maxHp;
  e.hp = max / 2;
  run(raider.w, raider.c, 150);
  const lost = 50 - raider.w.players[0].cost;
  assert.ok(lost > 0 && lost % 3 === 0, `three a hit (${lost})`);
  assert.ok(e.hp > max / 2, 'it healed itself');
});

test('[敌能-13] 能量: 匪帮轰击者 starts at 25 of 30, each point +10 % 攻击力 and +20 % 防御力; it loses one every 5 s', () => {
  const { w, c, es: [e] } = arena([['enemy_1359_ekulsr', 0, 5]], []);
  assert.equal(valueOf(e, 'energy'), 25);
  const base = e.base.atk;
  assert.ok(Math.abs(attrs.statsOf(e).atk - base * (1 + 2.5)) < 1e-6);
  run(w, c, 150);
  assert.equal(valueOf(e, 'energy'), 24);
});

test('[敌能-13] 辐射充能 and 过载: +1 a second to the enemies around; at the cap 过载, after it 0', () => {
  const { w, c, es: [gun, thief] } = arena([['enemy_1356_egun', 0, 4], ['enemy_1354_eghost', 0, 5]], []);
  assert.deepEqual([valueOf(gun, 'energy'), valueOf(thief, 'energy')], [0, 0]);
  run(w, c, 5 * 30 + 5 * 30);
  assert.equal(valueOf(thief, 'energy'), 5, 'five pulses after its first 5 s');
  run(w, c, 2);
  assert.ok(thief.buffs.some((b) => b.key === 'overload'), '过载 at the cap');
  assert.ok(attrs.statsOf(thief).aspd > 200);
  run(w, c, 10 * 30 + 2);
  assert.deepEqual([thief.buffs.some((b) => b.key === 'overload'), valueOf(thief, 'energy')], [false, 0]);
});

test('[敌能-13] 能量夺取: every 2 s 匪帮斧手 takes one from each enemy around that has some', () => {
  const { w, c, es: [axe, bomber] } = arena([['enemy_1357_erob', 0, 4], ['enemy_1359_ekulsr', 0, 5]], []);
  run(w, c, 60);
  assert.deepEqual([valueOf(axe, 'energy'), valueOf(bomber, 'energy')], [1, 24]);
});

test('[敌能-14] 隐匿 with 强击: the buff stays while blocked, the strike spends the mark, and the mark returns when 隐匿 does', () => {
  const { w, c, es: [e], ops: [g] } = arena([['enemy_1299_ymkilr', 1, 4]], [['guard', 1, 1]]);
  assert.ok(attrs.statsOf(e).flags.stealth);
  e.x = 1;
  run(w, c, 3);
  assert.equal(e.blockedBy, g.id);
  assert.equal(attrs.statsOf(e).flags.stealth, true, 'the buff stays');
  assert.equal(targeting.stealthed(e), false);
  assert.equal(e.ab['InvisibleCombat.mark'], 0);
  assert.equal(1e6 - g.hp >= 2 * 800 - 100, true, 'the strike');
  step(w, c, [[0, { type: 'retreat', unit: g.id }]]);
  run(w, c, 2);
  assert.equal(e.blockedBy, -1);
  assert.equal(targeting.stealthed(e), false, 'unblocked, not yet hidden');
  assert.equal(e.ab['InvisibleCombat.mark'], 0);
  run(w, c, 90);
  assert.equal(targeting.stealthed(e), true, 'hidden again');
  assert.equal(e.ab['InvisibleCombat.mark'], 1);
});

test('[敌能-15] 引导: after 10 s it channels 5 s without attacking, then 200 % as arts on its target and +100 攻击速度 for 20 s', () => {
  const { w, c, es: [e], ops: [g] } = arena([['enemy_1300_ymmir', 1, 3]], [['guard', 1, 1]]);
  const ev = run(w, c, 10 * 30 + 5 * 30 + 3);
  const during = ev.filter((x) => x.type === 'attack' && x.id === e.id && x.f > 10 * 30 + 3 && x.f < 15 * 30);
  assert.deepEqual(during, [], 'no attack while channelling');
  assert.ok(ev.some((x) => x.type === 'hit' && x.id === e.id && x.damage === 800), '400 × 2 arts, no resistance');
  assert.ok(e.buffs.some((b) => b.key === 'guide' && b.mods.aspd === 100));
  assert.ok(g.hp < 1e6);
});

test('[敌能-16] 载客: an enemy within 0.5 goes aboard; the first 云梯 lets it alight; it takes 4 of a blocker\'s 阻挡数', () => {
  const tweak = (/** @type {any} */ c) => { c.level.tiles[0][5] = { ...c.level.tiles[0][5], key: 'tile_stairs' }; };
  const { w, c, es: [bus, rider] } = arena([['enemy_1302_ymtro', 0, 1], ['enemy_1337_bhrknf', 0, 1.2]], [], { tweak });
  run(w, c, 1);
  assert.deepEqual([rider.hidden, attrs.statsOf(bus).blockCnt], [true, 4]);
  bus.x = 5;
  run(w, c, 2);
  assert.deepEqual([rider.hidden, rider.x, rider.y], [false, 5, 0], 'at the centre of its tile');
  rider.x = 5.1;
  run(w, c, 2);
  assert.equal(rider.hidden, false, 'it carries no more');
  const again = arena([['enemy_1302_ymtro', 0, 1], ['enemy_1337_bhrknf', 0, 1.2]], []);
  run(again.w, again.c, 1);
  again.es[0].hp = 0;
  run(again.w, again.c, 1);
  assert.equal(again.es[1].hidden, false, 'it left the field: they alight');
});

test('[敌能-8] 匪帮轰击者 unblocked: its ranged attack at 50 % hits the target and the eight tiles around it', () => {
  const { w, c, es: [e], ops } = arena([['enemy_1359_ekulsr', 0, 4]], [['guard', 1, 2], ['sniper', 2, 3]]);
  const ev = run(w, c, 160).filter((x) => x.type === 'hit' && x.id === e.id);
  const first = ev.filter((x) => x.f === ev[0].f);
  assert.deepEqual(first.map((x) => x.target).sort((a, b) => a - b), ops.map((o) => o.id).sort((a, b) => a - b), 'both in the 3 × 3 around the target');
  assert.ok(first.every((x) => x.damage < attrs.statsOf(e).atk * 0.5 + 1));
});
