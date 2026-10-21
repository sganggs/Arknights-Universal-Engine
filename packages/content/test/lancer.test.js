// 萨卡兹穿刺手 (docs/spec/foes.md 敌能-53) on the tiny map. The two read enemies are not both in a level here; the
// records are the data's. moveMultiplier stays small so a full 25 tries is still a walk, and nothing pins them with 束缚.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, buffs } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { foeBehaviors, withFoeExtras, uncoveredAbilities, withoutIncomplete, FOE_EXTRAS } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

const KEY = 'enemy_1072_dlancer';
const LEADER = 'enemy_1072_dlancer_2';
const MS = 'dlancer_t[trigger].move_speed';
const IV = 'dlancer_t[trigger].interval';
const CAP = 'dlancer_t[trigger].trig_cnt';

/** @param {number} scale @param {number} move @param {number} hp @param {number} atk */
function lancerDef(scale, move, hp, atk) {
  return {
    name: 'lancer', maxHp: hp, atk, def: 150, res: 40, moveSpeed: move, applyWay: 'MELEE', motion: 'WALK', massLevel: 3, baseAttackTime: 4, rangeRadius: 0,
    talents: { rush: { [MS]: 0.5, [IV]: 0.5, [CAP]: 25 }, firstattack: { atk_scale: scale } },
  };
}

/** @param {string} key @param {any} def */
function open(key, def) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [key]: withFoeExtras(key, def) };
  c.behaviors = { foes: foeBehaviors };
  c.level.waves = [oneWave([spawnAt(0, key)])];
  c.level.options = { ...c.level.options, moveMultiplier: 0.02, characterLimit: 8, initialCost: 99, maxCost: 99, costIncreaseTime: 1000 };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  return { c, w, e: /** @type {Unit} */ (w.units.find((u) => u.key === key)) };
}

/** @param {World} w @param {any} c @param {number} n */
const run = (w, c, n) => { for (let i = 0; i < n; i++) step(w, c); };
/** @param {Unit} e @param {string} k */
const ab = (e, k) => e.ab[k] ?? 0;
/** @param {Unit} e */
const speed = (e) => attrs.statsOf(e).moveSpeed;
/** Physical HP taken (伤害-7's 5% floor). @param {number} raw @param {number} def */
const taken = (raw, def) => Math.max(raw - def, raw * 0.05);
/** @param {any[]} events @param {number} id */
const hitsOf = (events, id) => events.filter((ev) => ev.type === 'hit' && ev.id === id);
/** @param {Unit} e @param {number} x @param {number} y */
const moved = (e, x, y) => (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y) > 0;
/** @param {World} w @param {any} c @param {number} row @param {number} col */
const deploy = (w, c, row, col) => step(w, c, [[0, { type: 'deploy', op: 'guard', row, col, dir: 0 }]]);
/** @param {World} w */
const guardOf = (w) => /** @type {Unit} */ (w.units.find((u) => u.key === 'guard'));
/** @param {Unit} e @param {Unit} g */
const stack = (e, g) => { e.x = g.x; e.y = g.y; };
/** @param {Unit} e */
const layered = (e) => e.buffs.some((b) => b.key === 'dlance');

test('[敌能-53] walking unblocked: no layer on the debut tick, then one every 0.5 s', () => {
  const { c, w, e } = open(KEY, lancerDef(600, 0.25, 6000, 450));
  const x = e.x, y = e.y;
  assert.equal(ab(e, 'rush.on'), 1);
  assert.equal(ab(e, 'rush.layers'), 0);
  assert.equal(ab(e, 'rush.tries'), 0);
  assert.equal(speed(e), 0.25);
  assert.equal(e.blockedBy, -1);
  run(w, c, 15);
  assert.equal(ab(e, 'rush.layers'), 1);
  assert.equal(ab(e, 'rush.tries'), 1);
  assert.equal(speed(e), 0.375);
  assert.ok(moved(e, x, y));
  run(w, c, 15);
  assert.equal(ab(e, 'rush.layers'), 2);
  assert.equal(speed(e), 0.5);
  assert.equal(e.blockedBy, -1);
});

test('[敌能-53] the debut try does not count: 25 layers at 12.5 s, and the cap stays in the state', () => {
  const { c, w, e } = open(KEY, lancerDef(600, 0.25, 6000, 450));
  const x = e.x, y = e.y;
  run(w, c, 375);
  assert.equal(ab(e, 'rush.layers'), 25);
  assert.equal(ab(e, 'rush.tries'), 25);
  assert.equal(ab(e, 'rush.on'), 1);
  assert.equal(speed(e), 3.375);
  assert.ok(moved(e, x, y));
  run(w, c, 15);
  assert.equal(ab(e, 'rush.layers'), 25);
  assert.equal(ab(e, 'rush.tries'), 25);
  assert.equal(ab(e, 'rush.on'), 1);
  assert.equal(speed(e), 3.375);
});

test('[敌能-53] silence does not stop the layers', () => {
  const { c, w, e } = open(KEY, lancerDef(600, 0.25, 6000, 450));
  status.applyStatus(e, 'silence', {});
  run(w, c, 15);
  assert.equal(attrs.statsOf(e).flags.silence, true);
  assert.equal(ab(e, 'rush.layers'), 1);
  assert.equal(speed(e), 0.375);
});

test('[敌能-53] a block keeps the state and its layers and tries nothing; unblocked, the tries go on', () => {
  const { c, w, e } = open(KEY, lancerDef(600, 0.25, 6000, 450));
  run(w, c, 15);
  e.atkCd = 999;
  deploy(w, c, 1, 2);
  const g = guardOf(w);
  stack(e, g);
  const contact = step(w, c);
  assert.equal(e.blockedBy, g.id);
  assert.equal(hitsOf(contact, e.id).length, 0);
  const acc = ab(e, 'rush.acc');
  run(w, c, 30);
  assert.equal(e.blockedBy, g.id);
  assert.equal(ab(e, 'rush.on'), 1);
  assert.equal(ab(e, 'rush.layers'), 1);
  assert.equal(ab(e, 'rush.tries'), 1);
  assert.equal(ab(e, 'rush.acc'), acc);
  assert.equal(layered(e), true);
  g.hp = 0;
  step(w, c);
  assert.equal(e.blockedBy, -1);
  run(w, c, 15);
  assert.equal(ab(e, 'rush.layers'), 2);
  assert.equal(ab(e, 'rush.tries'), 2);
});

test('[敌能-53] the first attack after a block, even a later one, adds the extra hit', () => {
  const { c, w, e } = open(KEY, lancerDef(600, 0.25, 6000, 450));
  run(w, c, 15);
  deploy(w, c, 1, 2);
  const g = guardOf(w);
  stack(e, g);
  e.atkCd = 20;
  /** @type {any[]} */
  let hs = [];
  for (let i = 0; i < 40 && hs.length === 0; i++) hs = hitsOf(step(w, c), e.id);
  assert.equal(e.blockedBy, g.id);
  assert.equal(hs.length, 2);
  assert.equal(hs[1].damage, taken(0.375 * 600, 100));
  assert.equal(ab(e, 'rush.on'), 0);
  assert.equal(layered(e), false);
});

test('[敌能-53] 晕眩 exits every tick and does not re-enter until it ends', () => {
  const { c, w, e } = open(KEY, lancerDef(600, 0.25, 6000, 450));
  run(w, c, 15);
  status.applyStatus(e, 'stun', { frames: 30 });
  step(w, c);
  assert.equal(attrs.statsOf(e).flags.stun, true);
  assert.equal(ab(e, 'rush.on'), 0);
  assert.equal(layered(e), false);
  e.ab['rush.on'] = 1;
  e.ab['rush.layers'] = 4;
  buffs.addBuff(e, buffs.makeBuff({ key: 'dlance', mods: { movePct: 2 } }));
  step(w, c);
  assert.equal(ab(e, 'rush.on'), 0);
  assert.equal(ab(e, 'rush.layers'), 0);
  assert.equal(layered(e), false);
  buffs.removeBuff(e, 'stun');
  step(w, c);
  assert.equal(ab(e, 'rush.on'), 1);
  assert.equal(ab(e, 'rush.layers'), 0);
  run(w, c, 15);
  assert.equal(ab(e, 'rush.layers'), 1);
  assert.equal(ab(e, 'rush.tries'), 1);
});

test('[敌能-53] 束缚 exits and keeps exiting; 冻结 does not', () => {
  const rooted = open(KEY, lancerDef(600, 0.25, 6000, 450));
  run(rooted.w, rooted.c, 15);
  status.applyStatus(rooted.e, 'root', {});
  step(rooted.w, rooted.c);
  assert.equal(attrs.statsOf(rooted.e).flags.root, true);
  assert.equal(ab(rooted.e, 'rush.on'), 0);
  assert.equal(layered(rooted.e), false);
  step(rooted.w, rooted.c);
  assert.equal(ab(rooted.e, 'rush.on'), 0);
  assert.equal(ab(rooted.e, 'rush.layers'), 0);
  buffs.removeBuff(rooted.e, 'root');
  step(rooted.w, rooted.c);
  assert.equal(ab(rooted.e, 'rush.on'), 1);
  assert.equal(ab(rooted.e, 'rush.layers'), 0);
  const frozen = open(KEY, lancerDef(600, 0.25, 6000, 450));
  run(frozen.w, frozen.c, 15);
  status.applyStatus(frozen.e, 'freeze', { frames: 60 });
  run(frozen.w, frozen.c, 15);
  assert.equal(attrs.statsOf(frozen.e).flags.freeze, true);
  assert.equal(ab(frozen.e, 'rush.on'), 1);
  assert.equal(ab(frozen.e, 'rush.layers'), 2);
  assert.equal(speed(frozen.e), 0.5);
});

test('[敌能-53] a hit while accelerating adds physical damage of the current move speed × 600, then exits', () => {
  const { c, w, e } = open(KEY, lancerDef(600, 0.25, 6000, 450));
  run(w, c, 15);
  deploy(w, c, 1, 2);
  const g = guardOf(w);
  const fast = speed(e);
  stack(e, g);
  e.atkCd = 0;
  const ev = step(w, c);
  const hs = hitsOf(ev, e.id);
  const def = 100;
  assert.equal(hs.length, 2);
  assert.equal(hs[0].damage, taken(450, def));
  assert.equal(hs[1].damage, taken(fast * 600, def));
  assert.equal(hs[1].damage, 125);
  assert.equal(ab(e, 'rush.on'), 0);
  assert.equal(ab(e, 'rush.layers'), 0);
  assert.equal(ab(e, 'rush.tries'), 0);
  assert.equal(layered(e), false);
  assert.equal(speed(e), 0.25);
});

test('[敌能-53] the leader\'s extra hit is the current move speed × 800', () => {
  const { c, w, e } = open(LEADER, lancerDef(800, 0.3, 8000, 500));
  run(w, c, 15);
  deploy(w, c, 1, 2);
  const g = guardOf(w);
  const fast = speed(e);
  stack(e, g);
  e.atkCd = 0;
  const hs = hitsOf(step(w, c), e.id);
  assert.equal(ab(e, 'rush.layers'), 0);
  assert.equal(hs.length, 2);
  assert.equal(hs[0].damage, taken(500, 100));
  assert.equal(hs[1].damage, taken(fast * 800, 100));
  assert.equal(fast, 0.3 * 1.5);
});

test('[敌能-53] a hit that takes no HP does not add the extra hit and does not exit', () => {
  const { c, w, e } = open(KEY, lancerDef(600, 0.25, 6000, 450));
  run(w, c, 15);
  deploy(w, c, 1, 2);
  const g = guardOf(w);
  status.applyStatus(g, 'invincible', {});
  stack(e, g);
  e.atkCd = 0;
  const ev = step(w, c);
  assert.equal(hitsOf(ev, e.id).length, 0);
  assert.equal(g.hp, g.maxHp);
  assert.equal(ab(e, 'rush.on'), 1);
  assert.equal(ab(e, 'rush.layers'), 1);
  assert.equal(layered(e), true);
});

test('[敌能-53] when the normal hit already drops the target, the extra instance deals nothing and the state still exits', () => {
  const { c, w, e } = open(KEY, lancerDef(600, 0.25, 6000, 450));
  run(w, c, 15);
  deploy(w, c, 1, 2);
  const g = guardOf(w);
  g.hp = 200;
  stack(e, g);
  e.atkCd = 0;
  const hs = hitsOf(step(w, c), e.id);
  assert.equal(hs.length, 1);
  assert.equal(hs[0].damage, taken(450, 100));
  assert.equal(g.hp, 0);
  assert.equal(ab(e, 'rush.on'), 0);
  assert.equal(layered(e), false);
});

test('[敌能-53] while still blocked, the next attack is only the normal hit', () => {
  const { c, w, e } = open(KEY, lancerDef(600, 0.25, 6000, 450));
  run(w, c, 15);
  deploy(w, c, 1, 2);
  stack(e, guardOf(w));
  e.atkCd = 0;
  step(w, c);
  assert.equal(ab(e, 'rush.on'), 0);
  run(w, c, e.atkCd);
  const hs = hitsOf(step(w, c), e.id);
  assert.equal(hs.length, 1);
  assert.equal(hs[0].damage, taken(450, 100));
  assert.equal(layered(e), false);
  assert.equal(ab(e, 'rush.on'), 0);
});

/** @param {string} key @param {Record<string, Record<string, number>>} talents */
const uncovered = (key, talents) => uncoveredAbilities([withFoeExtras(key, /** @type {any} */ ({ talents }))]);
/** @param {string} key @param {string} talent */
const marker = (key, talent) => /** @type {any} */ (FOE_EXTRAS[key]).talents[talent].paged;

test('[敌能-53] unread rush and firstattack users stay uncovered; the read pages do not', () => {
  const yrlanc = {
    rush: { [MS]: 0.5, [IV]: 0.5, [CAP]: 25 },
    firstattack: { atk_scale: 600 },
    CollectCoin: { range_radius: 0.25 },
  };
  assert.deepEqual(uncovered('enemy_5059_yrlanc', yrlanc), ['rush', 'firstattack', 'CollectCoin']);
  assert.deepEqual(uncovered('enemy_5007_lancfd', { rush: { [MS]: 1, [IV]: 0.3, [CAP]: 15 } }), ['rush']);
  const dog = { 'mcndog_t[trigger].move_speed': 0.5, 'mcndog_t[trigger].interval': 0.333, 'mcndog_t[trigger].trig_cnt': 30, 'mcndog_t_predelay.predelay': 3 };
  assert.deepEqual(uncovered('enemy_8011_mcndog_2', { rush: dog }), ['rush']);
  assert.deepEqual(uncovered('enemy_8011_mcndog_3', { rush: dog }), ['rush']);
  const rug = { 'mcnrsh_t[trigger].move_speed': 0.5, 'mcnrsh_t[trigger].interval': 0.333, 'mcnrsh_t[trigger].trig_cnt': 30, 'mcnrsh_t_predelay.predelay': 5, 'weak[limit]': 6, damage_scale: 2 };
  assert.deepEqual(uncovered('enemy_8013_mcnrsh', { rush: rug }), ['rush']);
  assert.deepEqual(uncovered(KEY, lancerDef(600, 0.25, 6000, 450).talents), []);
  assert.deepEqual(uncovered(LEADER, lancerDef(800, 0.3, 8000, 500).talents), []);
  const left = /** @type {any} */ (withoutIncomplete(/** @type {any} */ ({ talents: yrlanc }))).talents;
  assert.equal(left.rush, undefined);
  assert.equal(left.firstattack, undefined);
  assert.equal(left.CollectCoin.range_radius, 0.25);
  assert.equal(marker(KEY, 'rush'), 1);
  assert.equal(marker(LEADER, 'firstattack'), 1);
  assert.equal(FOE_EXTRAS.enemy_5059_yrlanc, undefined);
  assert.equal(FOE_EXTRAS.enemy_5007_lancfd, undefined);
  assert.equal(foeBehaviors.CollectCoin, undefined);
  assert.notEqual(foeBehaviors.rush, foeBehaviors.Rush);
  assert.notEqual(foeBehaviors.firstattack, foeBehaviors.FirstAttack);
});

test('[敌能-53] the same names without the page marker do not accelerate', () => {
  const same = lancerDef(600, 0.25, 6000, 450);
  const { c, w, e } = open('enemy_5059_yrlanc', same);
  const x = e.x, y = e.y;
  run(w, c, 30);
  assert.equal(speed(e), 0.25);
  assert.equal(ab(e, 'rush.on'), 0);
  assert.equal(layered(e), false);
  assert.ok(moved(e, x, y));
  const dog = open('enemy_8011_mcndog_2', {
    name: 'dog', maxHp: 1000, atk: 100, def: 0, res: 0, moveSpeed: 0.6, applyWay: 'MELEE', baseAttackTime: 4,
    talents: { rush: { 'mcndog_t[trigger].move_speed': 0.5, 'mcndog_t[trigger].interval': 0.333, 'mcndog_t[trigger].trig_cnt': 30, 'mcndog_t_predelay.predelay': 3 } },
  });
  run(dog.w, dog.c, 30);
  assert.equal(speed(dog.e), 0.6);
  assert.equal(ab(dog.e, 'rush.on'), 0);
});
