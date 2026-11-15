// Stronghold's battle content beyond the kits (docs/spec/compat.md 兼容-7) with a content module of our own, in the
// tiny level: the players' inputs (live bonds, band, the pieces' facts), a piece for every operator of the decks, the
// modules installed after the kits, in-battle layer gains and their event, a free redeployment, the redeploy time's
// multiplier, the SP cost's; the names the stand-ins gained for that content.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step, attrs, deck } from '@aue/sim';
import { kitsBehaviors } from '../src/compat/kits.js';
import { withGrid } from '../src/compat/grid.js';
import { CompatGap } from '../src/compat/sh/gap.js';
import { setShData, getData } from '../src/compat/sh/data.js';
import { msg, dn } from '../src/compat/sh/i18n.js';
import { extendedGrid, canTargetAlly } from '../src/compat/sh/targeting.js';
import { isPotential } from '../src/compat/sh/potential.js';
import { GEO } from '../src/compat/sh/sharedConstants.js';
import { DIR_VEC, oppositeDir, localBefore } from '../src/compat/sh/dir.js';
import { BOSS_ROW_OFFSET, ELEMENT } from '../src/compat/sh/constants.js';
import * as prep from '../src/compat/sh/prep.js';

/** @typedef {import('../src/compat/battle.js').ShBattle} ShBattle @typedef {import('../src/compat/players.js').PlayerInput} PlayerInput */

/** The guard's skill: 10 SP, none at the start, 5 s. */
const SKILL = { id: 'gs', type: 'AUTO', sp: 'time', cost: 10, init: 0, charges: 1, duration: 5, ammo: false, bb: {} };

/**
 * The tiny level with the guard (a skill, 20 s to redeploy) and the sniper, no kit; Stronghold's player input and our
 * modules; `tweak` changes the content. @param {PlayerInput} input @param {((b: ShBattle) => void)[]} [installs] @param {(c: any) => void} [tweak]
 */
function match(input, installs = [], tweak = undefined) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies.slime.maxHp = 1e6;
  Object.assign(c.level.options, { initialCost: 99, maxCost: 99, characterLimit: 4 });
  c.operators.guard = { ...c.operators.guard, skill: SKILL, respawnTime: 20 };
  c.decks = [['guard', 'sniper']];
  tweak?.(c);
  const box = /** @type {{ b: ShBattle | null }} */ ({ b: null });
  c.behaviors = kitsBehaviors({}, (x) => { box.b = x; }, { players: [input], modules: installs.map((install, i) => ({ name: `m${i}`, install })) });
  const w = createWorld(c, { seed: 1, players: 1 });
  return { c, w, b: /** @type {ShBattle} */ (box.b) };
}

/** @param {any} w @param {string} key */
const unit = (w, key) => w.units.find((/** @type {any} */ u) => u.key === key);
/** @param {any} w @param {any} c @param {number} n */
const run = (w, c, n) => { for (let i = 0; i < n; i++) step(w, c); };
const GUARD = /** @type {[number, any]} */ ([0, { type: 'deploy', op: 'guard', row: 1, col: 2, dir: 0 }]);

afterEach(() => setShData(null));

test('[兼容-7] a piece for every operator of the decks with its seat’s facts; the modules install after them, before any deployment', () => {
  /** @type {any[]} */
  const seen = [];
  const input = { bonds: { yanShip: { count: 3, active: true, tier: 1, layers: 4 } }, bandId: 'band_x', units: { guard: { id: 'chess_x_b', bonds: ['yanShip'], tier: 3, golden: true, items: ['it'] } } };
  const boom = () => { throw new Error('boom'); };
  const { b } = match(input, [boom, (bt) => { seen.push(bt.allyUnits.map((u) => [u.defId, u.def?.id, u.def?.baseId, u.def?.bonds ?? null, u.def?.tier, u.def?.golden ?? false, u.def?.position, u.items, u.deployed])); }]);
  assert.deepEqual(seen, [[['guard', 'chess_x_b', 'chess_x_a', ['yanShip'], 3, true, 'MELEE', ['it'], false], ['sniper', 'sniper', 'sniper', null, 1, false, 'RANGED', [], false]]], 'after one that failed');
  assert.deepEqual(b.errors, [{ label: 'content:m0', who: '', message: 'boom' }], 'its error recorded');
  const p = b.players[0];
  assert.deepEqual([p.playerId, p.bandId, p.bonds, p.input, p.mirror, p.dir], [0, 'band_x', input.bonds, input, false, 'RIGHT']);
  assert.notEqual(p.bonds.yanShip, input.bonds.yanShip, 'a live copy');
  assert.deepEqual([b.players.length, b.kind, b.flags.layerGainsEnabled, b.modeId, b.rect], [1, 'normal', true, null, { r0: 0, r1: 2, c0: 0, c1: 5 }]);
  assert.equal(b.allyUnits[0].player, p);
  assert.equal(b.getPlayer(0), p);
});

test('[兼容-7] a lasting buff given before the deployment takes hold at it; the deployments before the battle starts are the initial ones', () => {
  /** @type {boolean[]} */
  const initial = [];
  const { w, c } = match({}, [(b) => {
    b.addBuff(b.allyUnits[0], { key: 'bond:x', mods: { atkPct: 0.5 }, persist: true });
    b.on('deploy', (k) => { initial.push(k.initial); });
  }]);
  step(w, c, [GUARD]);
  assert.equal(attrs.statsOf(unit(w, 'guard')).atk, 75);
  run(w, c, 3);
  step(w, c, [[0, { type: 'deploy', op: 'sniper', row: 0, col: 2, dir: 0 }]]);
  assert.deepEqual(initial, [true, false]);
});

test('[兼容-7] in-battle layers: the event first (a handler may change them), the live copy, at most 999, nothing while gains are off', () => {
  const input = { bonds: { yanShip: { count: 3, active: true, tier: 1, layers: 990 } } };
  const { w, c, b } = match(input);
  step(w, c, [GUARD]);
  /** @type {any[]} */
  const got = [];
  b.on('layerGain', (k) => { got.push([k.playerId, k.bondId, k.n, k.reason, k.source?.defId ?? null, k.tile]); k.n += 1; });
  const g = b.unitOf(unit(w, 'guard'));
  assert.equal(b.addLayers(0, 'yanShip', 5, 'bond', { source: g }), 6);
  assert.deepEqual(got, [[0, 'yanShip', 5, 'bond', 'guard', [1, 2]]]);
  assert.equal(b.addLayers(0, 'yanShip', 10), 3, 'the cap');
  assert.equal(b.addLayers(0, 'yanShip', 1), 0, 'full: no event');
  assert.equal(got.length, 2);
  assert.equal(b.addLayers(0, 'miraShip', 2, 'item'), 3, 'a bond the seat lacks counts for the battle');
  assert.deepEqual([b.players[0].bonds.yanShip.layers, input.bonds.yanShip.layers], [999, 990]);
  assert.deepEqual(b.players[0].layerGains, { yanShip: 9, miraShip: 3 });
  b.on('layerGain', (k) => { if (k.reason === 'void') k.n = Infinity; }, { priority: -1 });
  assert.equal(b.addLayers(0, 'miraShip', 2, 'void'), 0, 'no finite number: cancelled');
  assert.deepEqual([b.addLayers(1, 'yanShip', 1), b.addLayers(0, 'yanShip', 0), b.addTempLayers(0, 'yanShip', 2.7)], [0, 0, 2]);
  b.flags.layerGainsEnabled = false;
  assert.deepEqual([b.addLayers(0, 'miraShip', 1), b.addTempLayers(0, 'yanShip', 1)], [0, 0]);
});

/** The sniper's deployment cuts a guard card not on the field by 1, to −2 at most (部署-10 `deployCut`). @param {any} c */
const sniperCuts = (c) => {
  c.operators.guard.profession = 'WARRIOR';
  c.operators.sniper.talentTrait = { deployCut: { profession: 'WARRIOR', value: -1, max: 2 } };
};

test('[兼容-7] 立刻重新部署: a fallen piece’s next deployment takes no 再部署时间 and no cost, once; on another tile it is a gap', () => {
  /** @type {any[]} */
  const exits = [];
  /** @type {any[]} */
  const tiles = [];
  const { w, c, b } = match({}, [(bt) => {
    bt.on('layerGain', (k) => { tiles.push(k.tile); });
    bt.on('death', (k) => {
      bt.addLayers(0, 'yanShip', 1, 'bond', { source: k.unit });
      exits.push([k.unit.defId, k.reason, k.unit.removeReason, k.unit.removed, k.unit.respawnAt, bt.redeploy(k.unit, { free: true }), bt.redeploy(k.unit)]);
    });
  }], sniperCuts);
  step(w, c, [GUARD]);
  const g = b.unitOf(unit(w, 'guard')), p = w.players[0];
  g.hp = 0;
  step(w, c);
  const left = w.frame - 1;
  assert.deepEqual(exits, [['guard', 'killed', 'killed', false, Infinity, true, false]], 'its card not set yet in its own event');
  assert.deepEqual(tiles, [[1, 2]], 'a gain from the unit leaving now: its tile');
  assert.equal(unit(w, 'guard'), undefined);
  step(w, c);
  assert.ok(p.cards.guard.ready <= w.frame, 'ready now');
  assert.equal(g.respawnAt, (left + 600) / 30, 'when it would have come back');
  step(w, c, [[0, { type: 'deploy', op: 'sniper', row: 0, col: 2, dir: 0 }]]);
  assert.equal(deck.deployCost(c, p, 'guard', w), 0, 'the sniper’s cut did not take it back');
  const cost = p.cost;
  step(w, c, [GUARD]);
  assert.ok(unit(w, 'guard'), 'deployed again');
  assert.equal(p.cost, cost, 'for free');
  assert.ok(g.respawnAt > b.time && g.lastAttackAt === -Infinity, 'back before its time; no attack in this deployment');
  assert.equal(deck.deployCost(c, p, 'guard', w) > 0, true, 'only the once');
  assert.throws(() => b.redeploy(g, { tile: [1, 3] }), (e) => e instanceof CompatGap && e.what === 'battle.redeploy.tile');
  assert.throws(() => b.retreat(g, { reason: 'raid' }), (e) => e instanceof CompatGap && e.what === 'battle.retreat.raid');
  assert.ok(unit(w, 'guard'), '突袭’s retreat does nothing');
});

test('[兼容-7] the redeploy time × the redeployMul of the unit’s lasting buffs (助力); its SP cost × spCostMul from its next deployment (绝技)', () => {
  const { w, c, b } = match({}, [(bt) => {
    const g = bt.allyUnits[0];
    bt.addBuff(g, { key: 'bond:deput', mods: { redeployMul: 0.7 }, persist: true });
    /** @type {any} */ (g.skill).spCostMul = 0.75;
  }]);
  step(w, c, [GUARD]);
  const guard = unit(w, 'guard'), g = b.unitOf(guard);
  b.addBuff(g, { key: 'for:now', mods: { redeployMul: 0.5 } });
  assert.deepEqual([guard.skill.cost, guard.skill.cap, g.skill?.spCostMul, g.skill?.spType], [7, 7, 0.75, 'time']);
  g.hp = 0;
  step(w, c);
  const left = w.frame - 1;
  step(w, c);
  assert.equal(w.players[0].cards.guard.ready - left, 420, '20 s × 0.7, not × the buff for this deployment only');
  assert.equal(g.respawnAt, w.players[0].cards.guard.ready / 30);
});

test('[兼容-7] respawnAt as content sets it: a retreat’s at once, a knock-out’s once the engine set the card, later ones on the card; no number is a gap', () => {
  /** @type {any[]} */
  const seen = [];
  const { w, c, b } = match({}, [(bt) => bt.on('death', (k) => {
    seen.push([k.unit.respawnAt, bt.time]);
    k.unit.respawnAt = bt.time + (k.reason === 'retreat' ? 4 : 2);
  })]);
  step(w, c, [GUARD]);
  const g = b.unitOf(unit(w, 'guard')), p = w.players[0];
  b.retreat(g);
  assert.deepEqual([seen[0][0], g.respawnAt, p.cards.guard.ready], [(w.frame + 600) / 30, b.time + 4, w.frame + 120], 'a retreat: its card was set before its event');
  g.respawnAt = b.time + 1;
  assert.equal(p.cards.guard.ready, w.frame + 30, 'off the field: on its card');
  assert.throws(() => { g.respawnAt = Infinity; }, (e) => e instanceof CompatGap && e.what === 'unit.respawnAt');
  run(w, c, 31);
  step(w, c, [GUARD]);
  b.unitOf(unit(w, 'guard')).hp = 0;
  step(w, c);
  const at = seen[1][1];
  assert.deepEqual([seen[1][0], p.cards.guard.ready > w.frame + 60], [Infinity, true], 'a knock-out: not yet');
  step(w, c);
  assert.deepEqual([p.cards.guard.ready, g.respawnAt], [Math.round((at + 2) * 30), at + 2], 'once the engine set it, as set');
});

test('[兼容-7] what the content reads of the battle and its units: 寒冷, the last attack, the data, a damage info; 无来源 resolved 真实伤害', () => {
  const { w, c, b } = match({}, [], (x) => { x.enemies.slime.atk = 110; });
  step(w, c, [GUARD]);
  run(w, c, 330);
  const g = b.unitOf(unit(w, 'guard')), e = b.enemies[0];
  assert.ok(g.lastAttackAt > 0 && g.lastAttackAt <= b.time, 'it attacked');
  assert.equal(b.applyStatus(e, 'cold', { duration: 2 }), true);
  assert.deepEqual([e.s?.flags.cold, e.flags.cold, g.flags.cold ?? false], [true, true, false]);
  assert.deepEqual([b.isDown(), b.restTile(g), b.makeDamage({ amount: 3, sourceless: true })], [false, [1, 2], { type: 'phys', amount: 3, mul: 1, tags: [], sourceless: true }]);
  assert.deepEqual(b.data.raw, {});
  setShData({ bonds: { yanShip: { name: '炎' } } });
  assert.equal(b.data.raw.bonds.yanShip.name, '炎');
  assert.throws(() => b.data.rawEnemy('enemy_1'), (x) => x instanceof CompatGap && x.what === 'data.rawEnemy');
  const hp = e.hp;
  assert.equal(b.dealDamage({ source: null, target: e, amount: 40, type: 'true', calculation: 'resolved' }), 40);
  assert.equal(e.hp, hp - 40);
  assert.throws(() => b.dealDamage({ source: g, target: e, amount: 40, type: 'phys', calculation: 'resolved' }), (x) => x instanceof CompatGap && x.what === 'attack.calculation.resolved');
  assert.ok(e.lastAttackAt > 0 && e.lastAttackAt <= b.time, 'an enemy’s too');
  /** @type {number[]} */
  const atDeploy = [];
  b.on('deploy', (k) => { atDeploy.push(k.unit.lastAttackAt); });
  b.retreat(g);
  assert.ok(b.redeploy(g, { free: false }));
  const p = w.players[0];
  assert.ok(p.cards.guard.ready <= w.frame && deck.deployCost(c, p, 'guard', w) > 0, 'not free: no 再部署时间, its cost');
  step(w, c, [GUARD]);
  assert.deepEqual([g.deployed, atDeploy, g.removeReason], [true, [-Infinity], 'retreat'], 'a new deployment: no attack in it yet');
});

test('[兼容-7] a 生命流失 with a source and another credit counts for the credit (阿戈尔’s 吞噬)', () => {
  const { w, c, b } = match({});
  step(w, c, [GUARD]);
  run(w, c, 30);
  /** @type {string[]} */
  const kills = [];
  b.on('kill', (k) => { kills.push(`${k.killer?.defId}>${k.victim?.defId}`); });
  const e = b.enemies[0], g = b.unitOf(unit(w, 'guard')), go = { now: true };
  b.on('tick', () => { if (go.now) { go.now = false; b.dealHPLose({ source: e, credit: g, target: e, amount: 2e6, type: 'true' }); } });
  step(w, c);
  assert.deepEqual(kills, ['guard>slime']);
});

test('[兼容-7] the stand-ins’ new names: messages, the extended grid, potentials, Stronghold’s geometry and values, the prep side’s gaps, the data', () => {
  assert.deepEqual([msg('【维多利亚】获得{n}件维式重锤', { n: 2 }), dn('炎')], [{ msgid: '【维多利亚】获得{n}件维式重锤', params: { n: 2 } }, { dn: '炎' }]);
  assert.deepEqual(withGrid({ width: 6, height: 3 }, () => extendedGrid([[0, 0], [0, 1], [1, 0], 'x'], 2)), [[0, 0], [0, 1], [1, 0], [0, 2], [0, 3], [1, 1], [1, 2]]);
  assert.deepEqual(withGrid({ width: 6, height: 3 }, () => extendedGrid([[0, 0]], 0)), [[0, 0]]);
  assert.deepEqual([isPotential(1), isPotential(6), isPotential(7), isPotential(2.5), isPotential('3')], [true, true, false, false, false]);
  assert.deepEqual([GEO.FIELD, BOSS_ROW_OFFSET, ELEMENT.burn.enemy.elemDamage], [{ r0: 9, r1: 12, c0: 2, c1: 10 }, -7, 7000]);
  assert.deepEqual([DIR_VEC.UP, oppositeDir('LEFT'), localBefore([0, 1], [0, 2]), localBefore([1, 0], null)], [[1, 0], 'RIGHT', true, true]);
  for (const f of [prep.createRng, prep.garrisonUpgradeKey, prep.nextGarrisonUpgrade, prep.validateSkillSpec, prep.matchesSchema, canTargetAlly]) assert.throws(() => f(), CompatGap);
  assert.throws(() => getData(), (x) => x instanceof CompatGap && x.what === 'data.getData');
  setShData({ config: {} });
  assert.deepEqual(getData(), { config: {} });
});
