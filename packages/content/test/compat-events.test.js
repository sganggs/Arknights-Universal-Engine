// What kits hear from the engine and what they key their buffs by (docs/spec/compat.md 兼容-4): the ordered-settlement and
// status events (damageCalculate, damageApplying, damageApplied, statusApplied, ammoUsed) as Stronghold's contexts; a kit's
// own emit of an event; the gap recorded for an event the engine never sends; buff keys of the shape of the aura sync's;
// the distance a push returns; the kits the tokens module defines for summons. The kits here are small ones of the test's
// own, on the tiny level with 推进之王's record.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step, attrs, deployProblem, summons } from '@aue/sim';
import { kitsBehaviors } from '../src/compat/kits.js';
import { buffKeyOf, buffNameOf } from '../src/compat/mods.js';
import { loadContent, matchContent } from '../src/index.js';
import { loadTraining, operatorAt } from '../src/operators.js';
import { defOf } from '../src/compat/records.js';

/** @typedef {import('../src/compat/battle.js').ShBattle} ShBattle @typedef {import('../src/compat/unit.js').ShUnit} ShUnit */

const SIEGE = 'char_112_siege';
/** E2 90, 潜能 6, S3 at 专精 3: her selected skill is `skchr_siege_3`. */
const BUILD = { elite: 2, level: 90, potential: 6, trust: 100, skill: 2, skillLevel: 10, module: 0, moduleLevel: 3 };
/** @type {any} */
let training;

before(async () => {
  training = await loadTraining(SIEGE);
});

/**
 * The tiny level with pieces `siege` and `texas` on the record of 推进之王 and the kits given for them; enemies sturdy enough
 * to last.
 * @param {Record<string, () => any>} kits @param {string[]} [deck]
 */
function match(kits, deck = Object.keys(kits)) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies.slime.maxHp = 4000;
  Object.assign(c.level.options, { initialCost: 40, maxCost: 99, characterLimit: 4 });
  const { talentBb, fieldTalents, rangeTalents, critTalents, timedTalents, deployTalents, ...rest } = operatorAt(training, BUILD);
  void [talentBb, fieldTalents, rangeTalents, critTalents, timedTalents, deployTalents];
  for (const k of deck) c.operators[k] = { ...rest, respawnTime: 1 };
  c.decks = [deck];
  const box = /** @type {{ b: any }} */ ({ b: null });
  const entries = Object.fromEntries(Object.entries(kits).map(([k, factory]) => [k, { factory, chess: true, def: defOf(SIEGE, training, BUILD) }]));
  const { world, skills, buffs, traits } = kitsBehaviors(entries, (x) => { box.b = x; });
  c.behaviors = { world, skills, buffs, traits };
  const w = createWorld(c, { seed: 1, players: 1 });
  return { c, w, b: /** @type {ShBattle} */ (box.b) };
}

/** @type {Record<string, any>} */
const DEPLOY = Object.freeze({
  siege: [0, { type: 'deploy', op: 'siege', row: 1, col: 3, dir: 2 }],
  texas: [0, { type: 'deploy', op: 'texas', row: 1, col: 4, dir: 2 }],
});

/** The piece of an operator key. @param {ShBattle} b @param {string} key @returns {ShUnit} */
const piece = (b, key) => /** @type {ShUnit} */ (b.pieces.get(`0|${key}`));
/** An enemy of the field, after the first waves are in. @param {ShBattle} b @param {any} w @param {any} c */
function enemy(b, w, c) {
  for (let i = 0; i < 40; i++) step(w, c);
  return /** @type {ShUnit} */ (b.enemies[0]);
}

test('[兼容-4] a kit’s buff keyed like an engine aura (`aura:spRecovery`, `inspire:hp`) is not removed by the aura sync: kept under the kit namespace, by its own name for the kit (推断 INF-1110)', () => {
  const { c, w, b } = match({ siege: () => ({}) }, ['siege']);
  step(w, c, [DEPLOY.siege]);
  const p = piece(b, 'siege'), u = /** @type {any} */ (p.u), flat = () => attrs.statsOf(u).spRecovery;
  const base = flat();
  const given = b.addBuff(p, { key: 'aura:spRecovery', mods: { spRecoveryFlat: 0.4 }, duration: 2 });
  assert.equal(given?.key, 'aura:spRecovery', 'the kit sees the name it gave');
  assert.deepEqual(u.buffs.filter((/** @type {any} */ x) => x.key.endsWith('spRecovery')).map((/** @type {any} */ x) => x.key), ['kit:aura:spRecovery'], 'the engine holds it under the namespace');
  for (let i = 0; i < 5; i++) step(w, c);
  assert.ok(p.hasBuff('aura:spRecovery') && p.findBuff('aura:spRecovery')?.key === 'aura:spRecovery', 'the aura sync left it');
  assert.ok(Math.abs(flat() - base - 0.4) < 1e-9, 'its modifier counts');
  b.addBuff(p, { key: 'aura:spRecovery', mods: { spRecoveryFlat: 0.2 }, duration: 2 });
  assert.equal(u.buffs.filter((/** @type {any} */ x) => x.key === 'kit:aura:spRecovery').length, 1, 'given again it replaces itself, as one buff');
  assert.ok(Math.abs(flat() - base - 0.2) < 1e-9);
  assert.ok(b.applyStrongest(p, 'inspire:hp', { duration: 2, value: 0.5, mods: (v) => ({ hpMul: 1 + v }) }));
  step(w, c);
  assert.deepEqual(p.buffs.map((x) => x.key).filter((k) => k.includes(':')), ['aura:spRecovery', 'inspire:hp'], 'the strongest-wins buff is kept the same way');
  b.removeBuff(p, 'aura:spRecovery');
  assert.equal(p.hasBuff('aura:spRecovery'), false);
  assert.equal(flat(), base);
  const own = b.addBuff(p, { key: 'kit:aura:own', duration: 2 });
  assert.equal(own?.key, 'kit:aura:own', 'a name that already has the namespace’s shape comes back as it was');
});

test('[兼容-4] the names of buff keys both ways: aura-shaped keys and their kit-namespace ones, bursts, any other key as it is', () => {
  for (const [name, key] of [['aura:spRecovery', 'kit:aura:spRecovery'], ['field:x', 'kit:field:x'], ['kit:aura:x', 'kit:kit:aura:x'], ['burnBurst', 'burst:FIRE'], ['kit:x', 'kit:x'], ['halo2:model', 'halo2:model'], ['aura', 'aura']]) {
    assert.equal(buffKeyOf(name), key, name);
    assert.equal(buffNameOf(key), name, key);
  }
  assert.equal(buffNameOf('aura:3'), 'aura:3', 'an aura of the engine’s own keeps its key');
});

test('[兼容-4] [钩子-3] damageCalculate: a kit adds an arts hit of its own while its hit is calculated; the hit it deals does not set the event off again', () => {
  /** @type {string[]} */
  const seen = [];
  const { c, w, b } = match({ siege: () => ({ install(/** @type {ShBattle} */ battle, /** @type {ShUnit} */ unit) {
    battle.on('damageCalculate', (/** @type {any} */ ctx) => {
      seen.push(`${ctx.source === unit}:${ctx.target.side}:${ctx.dmg.type}:${ctx.dmg.amount}:${ctx.credit === unit}`);
      if (ctx.source !== unit || ctx.dmg.tags.includes('rider')) return;
      battle.dealDamage({ source: unit, target: ctx.target, amount: 100, type: 'arts', attackType: 'ADDITION', calculation: 'precomputed', origin: ctx.dmg, tags: ['rider'] });
    }, { owner: unit });
  } }) }, ['siege']);
  step(w, c, [DEPLOY.siege]);
  const e = enemy(b, w, c), hp = e.hp;
  const p = piece(b, 'siege');
  assert.ok(b.dealDamage(p, e, { type: 'phys', amount: 500 }) > 0);
  assert.equal(seen.length, 1, 'one calculation: the rider’s hit is precomputed');
  assert.equal(seen[0], 'true:enemy:phys:500:true');
  assert.ok(hp - e.hp > 100, `the rider arts hit (no RES) came on top of the main hit: ${hp - e.hp}`);
  assert.deepEqual(b.errors, []);
});

test('[兼容-4] [钩子-3] damageApplying: the damage about to be taken — a kit lowers it, or cancels the hit as it does for its own dodge; damageApplied: what was taken, after the HP', () => {
  /** @type {string[]} */
  const seen = [];
  /** @type {{ cancel: boolean, set: number | null }} */
  const mode = { cancel: false, set: null };
  const { c, w, b } = match({ siege: () => ({ install(/** @type {ShBattle} */ battle, /** @type {ShUnit} */ unit) {
    battle.on('damageApplying', (/** @type {any} */ ctx) => {
      seen.push(`applying:${ctx.target === unit}:${ctx.source?.side}:${ctx.amount}`);
      if (mode.cancel) ctx.dmg.cancel = true;
      if (mode.set !== null) ctx.amount = mode.set;
    }, { owner: unit });
    battle.on('damageApplied', (/** @type {any} */ ctx) => { seen.push(`applied:${ctx.target.side}:${ctx.kind}:${ctx.amount}:${ctx.hpRemoved}:${ctx.source === unit}`); }, { owner: unit });
  } }) }, ['siege']);
  step(w, c, [DEPLOY.siege]);
  const e = enemy(b, w, c), p = piece(b, 'siege'), def = attrs.statsOf(/** @type {any} */ (e.u)).def;
  b.dealDamage(p, e, { type: 'phys', amount: 500 });
  const dealt = 500 - def;
  assert.deepEqual(seen, [`applying:false:ally:${dealt}`, `applied:enemy:damage:${dealt}:${dealt}:true`], 'the damage after the defences, then what was taken');
  seen.length = 0;
  mode.set = 7;
  assert.equal(b.dealDamage(p, e, { type: 'phys', amount: 500 }), 7);
  mode.set = null;
  mode.cancel = true;
  assert.equal(b.dealDamage(p, e, { type: 'phys', amount: 500 }), 0);
  assert.deepEqual(seen.filter((x) => x.startsWith('applied')), ['applied:enemy:damage:7:7:true'], 'a cancelled hit takes nothing');
  assert.deepEqual(b.errors, []);
});

test('[兼容-4] [钩子-3] statusApplied: the status as Stronghold names it, how long (seconds, Infinity for none), its value and whether it entered; a kit’s own emit reaches its handlers as it is', () => {
  /** @type {string[]} */
  const seen = [];
  const { c, w, b } = match({ siege: () => ({ install(/** @type {ShBattle} */ battle, /** @type {ShUnit} */ unit) {
    battle.on('statusApplied', (/** @type {any} */ ctx) => { seen.push(`${ctx.status}:${ctx.duration}:${ctx.value}:${ctx.entered}:${ctx.source === unit}:${ctx.target.side}`); }, { owner: unit });
  } }) }, ['siege']);
  step(w, c, [DEPLOY.siege]);
  const e = enemy(b, w, c), p = piece(b, 'siege');
  assert.ok(b.applyStatus(e, 'bind', { duration: 2, source: p }));
  assert.ok(b.applyStatus(e, 'bind', { duration: 1, source: p }));
  assert.ok(b.applyStatus(e, 'defDown', { duration: 3, source: p, value: 0.2 }), 'a stand-in status is reported the same');
  assert.deepEqual(seen, ['bind:2:0:true:true:enemy', 'bind:1:0:false:true:enemy', 'defDown:3:0.2:true:true:enemy']);
  seen.length = 0;
  b.emit('statusApplied', { source: p, target: e, status: 'sleep', duration: Infinity, entered: true });
  assert.deepEqual(seen, ['sleep:Infinity:undefined:true:true:enemy'], 'what a kit emits is not reshaped');
});

test('[兼容-4] [状态-6] a cold pair’s freeze is a status a kit hears: beforeStatus, and statusApplied for the freeze, not for the second cold', () => {
  /** @type {string[]} */
  const seen = [];
  const { c, w, b } = match({ siege: () => ({ install(/** @type {ShBattle} */ battle, /** @type {ShUnit} */ unit) {
    battle.on('beforeStatus', (/** @type {any} */ ctx) => { seen.push(`before:${ctx.status}:${ctx.duration}`); }, { owner: unit });
    battle.on('statusApplied', (/** @type {any} */ ctx) => { seen.push(`applied:${ctx.status}:${ctx.duration}`); }, { owner: unit });
  } }) }, ['siege']);
  step(w, c, [DEPLOY.siege]);
  const e = enemy(b, w, c), p = piece(b, 'siege');
  b.applyStatus(e, 'cold', { duration: 1, source: p });
  b.applyStatus(e, 'cold', { duration: 2, source: p });
  assert.deepEqual(seen, ['before:cold:1', 'applied:cold:1', 'before:cold:2', 'before:freeze:2', 'applied:freeze:2']);
});

test('[兼容-4] [钩子-3] ammoUsed: a shot the engine’s ammo skill spends reaches the kit with its unit and the shots left; the kit’s own emit of it too', () => {
  /** @type {string[]} */
  const seen = [];
  const { c, w, b } = match({ siege: () => ({ skill: { kind: 'ammo', ammo: 3 }, install(/** @type {ShBattle} */ battle, /** @type {ShUnit} */ unit) {
    battle.on('ammoUsed', (/** @type {any} */ ctx) => { seen.push(`${ctx.unit === unit}:${ctx.left}:${ctx.skill === unit.skill}`); }, { owner: unit });
  } }) }, ['siege']);
  step(w, c, [DEPLOY.siege]);
  const p = piece(b, 'siege'), st = /** @type {any} */ (/** @type {any} */ (w.units[0]).skill);
  assert.ok(p.skill?.activate('manual', { free: true }));
  const shots = st.ammo;
  for (let i = 0; i < 600 && st.ammo === shots; i++) step(w, c);
  assert.equal(st.ammo, shots - 1, 'a shot was spent');
  assert.deepEqual(seen, [`true:${shots - 1}:true`]);
  seen.length = 0;
  b.emit('ammoUsed', { unit: p, left: 9, skill: p.skill });
  assert.deepEqual(seen, ['true:9:true'], 'the kit’s own emit, with its own units, comes as it is');
  assert.deepEqual(b.errors, []);
});

test('[兼容-4] an event the engine never sends, listened to: `compat: event.<name> is not emitted yet`, once for each unit and event; the kit’s own emit still reaches it', () => {
  let heard = 0;
  const { b } = match({
    siege: () => ({ install(/** @type {ShBattle} */ battle, /** @type {ShUnit} */ unit) {
      battle.on('damageOutput', () => {}, { owner: unit });
      battle.on('damageOutput', () => {}, { owner: unit });
      battle.on('spGain', () => { heard++; }, { owner: unit });
      battle.on('hit', () => {}, { owner: unit });
    } }),
    texas: () => ({ install(/** @type {ShBattle} */ battle, /** @type {ShUnit} */ unit) { battle.on('damageOutput', () => {}, { owner: unit }); } }),
  });
  assert.deepEqual(b.errors.map((e) => [e.label, e.who, e.message]), [
    ['event.damageOutput', 'siege', 'compat: event.damageOutput is not emitted yet'],
    ['event.spGain', 'siege', 'compat: event.spGain is not emitted yet'],
    ['event.damageOutput', 'texas', 'compat: event.damageOutput is not emitted yet'],
  ]);
  b.emit('spGain', { unit: piece(b, 'siege'), amount: 1 });
  assert.equal(heard, 1);
  b.on('block', () => {}, {});
  b.on('block', () => {}, {});
  assert.deepEqual(b.errors.slice(3).map((e) => [e.who, e.message]), [['', 'compat: event.block is not emitted yet']], 'with no unit running: once for the battle');
});

test('[兼容-4] push returns the tiles it moves the enemy — the step now and the slide that follows, a wall or the map’s edge stopping it —, 0 when the force does not take hold', () => {
  const { c, w, b } = match({ siege: () => ({}) }, ['siege']);
  const e = enemy(b, w, c), u = /** @type {any} */ (e.u), x0 = e.x, y0 = e.y, open = b.pushDistance(e, 1);
  const goes = b.push(e, 1, { from: { x: x0 - 1, y: y0 } });
  assert.ok(Math.abs(goes - open) < 1e-9, `an open way: ${goes} against the ${open} of the open ground`);
  for (let i = 0; i < 300 && u.slide; i++) step(w, c);
  assert.ok(Math.abs(Math.hypot(e.x - x0, e.y - y0) - goes) < 1e-9, `it moved as told: ${Math.hypot(e.x - x0, e.y - y0)}`);
  const f = enemy(b, w, c), v = /** @type {any} */ (f.u);
  v.x = 0.3;
  v.y = 1;
  const short = b.push(f, 1, { from: { x: 1.3, y: 1 } }), wanted = b.pushDistance(f, 1);
  assert.ok(short > 0 && short < wanted - 0.3, `the map’s edge stops it short: ${short} of ${wanted}`);
  for (let i = 0; i < 300 && v.slide; i++) step(w, c);
  assert.ok(Math.abs(0.3 - f.x - short) < 1e-9, `${0.3 - f.x} against ${short}`);
  assert.equal(b.push(f, -5, { from: { x: 1.3, y: 1 } }), 0, 'a force its weight takes away');
  assert.equal(b.push(piece(b, 'siege'), 1), 0, 'not an enemy');
  v.buffs.push({ key: 'rigid', src: -1, rule: 'queue', value: 0, mods: {}, flags: { staticBody: true }, stacks: 1, maxStacks: 1, left: -1, prio: 0, n: 0, shield: 0, shieldHits: 0, shieldType: '', decay: 1, every: 0, fixed: false });
  assert.equal(b.push(f, 5, { from: { x: 1.3, y: 1 } }), 0, 'a 静态刚体 enters 失衡 and moves nowhere (DIF-0050)');
});

/** The deck of a wisdel and the summon her skill makes. */
const SNIPER = 'char_1035_wisdel', WARD = 'token_10035_wisdel_wward';
const E2 = { elite: 2, level: 90, potential: 6, trust: 100, skill: 0, skillLevel: 7 };
const AT = /** @type {const} */ ({ level: 'act1multi_01', difficulty: 'NORMAL', seed: 1 });

/**
 * A match of a wisdel with a kit and `modules` after it, the wisdel deployed: the world, content, battle and her piece.
 * @param {{ name: string, install: (b: any) => void, kits?: Record<string, Function> }[]} modules
 */
async function summoner(modules) {
  /** @type {any} */
  let battle = null;
  const c = await matchContent({ ...AT, decks: [[{ id: SNIPER, build: E2 }]] }, { kits: { [SNIPER]: /** @type {any} */ (() => ({})) }, content: { modules, seen: (b) => { battle = b; } } });
  const w = createWorld(c, { seed: 1, players: 1 }), key = `${SNIPER}#0`;
  w.players[0].cost = 99;
  const deploy = c.level.tiles.flatMap((row, r) => row.map((_, col) => ({ type: /** @type {const} */ ('deploy'), op: key, row: r, col, dir: 0 }))).find((cmd) => deployProblem(w, c, 0, cmd) === null);
  step(w, c, [[0, /** @type {any} */ (deploy)]]);
  return { w, c: /** @type {any} */ (c), b: /** @type {ShBattle} */ (battle), p: /** @type {ShUnit} */ (battle.pieces.get(`0|${key}`)) };
}

/** A free tile for a summon. @param {any} w @param {any} c @returns {{ r: number, col: number }} */
function free(w, c) {
  return c.level.tiles.flatMap((/** @type {any[]} */ row, /** @type {number} */ r) => row.map((/** @type {any} */ t, /** @type {number} */ col) => ({ t, r, col })))
    .find((/** @type {any} */ x) => x.t.buildable !== 'NONE' && !w.units.some((/** @type {any} */ u) => u.x === x.col && u.y === x.r));
}

test('[兼容-4] [兼容-7] a summon of a kitted operator gets the kit the tokens module defines for it; a kit passed to spawnToken comes first', async () => {
  /** @type {string[]} */
  const log = [];
  const tokenKit = (/** @type {Record<string, any>} */ bb, /** @type {any} */ _raw, /** @type {any} */ def) => ({
    fromTokens: true, made: def?.name ?? null,
    install(/** @type {ShBattle} */ _b, /** @type {ShUnit} */ unit) { log.push(`install:${unit.defId}:${unit.kind}`); },
  });
  const { w, c, b, p } = await summoner([{ name: 'tokens', install: () => { log.push('module'); }, kits: { [WARD]: tokenKit, token_other: tokenKit } }]);
  assert.deepEqual(log, ['module']);
  const at = free(w, c), t = b.spawnToken(p, WARD, at.r, at.col);
  assert.ok(t, 'summoned');
  assert.equal(/** @type {any} */ (t.kit)?.fromTokens, true, 'its kit is the module’s');
  assert.deepEqual(log, ['module', `install:${WARD}:token`], 'installed before anything of its deployment');
  const own = { own: true };
  const at2 = free(w, c), u = b.spawnToken(p, WARD, at2.r, at2.col, { kit: own });
  assert.equal(u?.kit, own, 'the kit the caller passes comes first');
  assert.deepEqual(b.errors, []);
});

test('[兼容-4] [兼容-7] a summon has no kit without the tokens module, from a module that does not define one for it, or when its factory throws (recorded)', async () => {
  const none = await summoner([]);
  const at = free(none.w, none.c);
  assert.equal(none.b.spawnToken(none.p, WARD, at.r, at.col)?.kit ?? null, null, 'no module: the engine’s own summon');
  const other = await summoner([{ name: 'tokens', install: () => {}, kits: { token_other: () => ({}) } }]);
  const at2 = free(other.w, other.c);
  assert.equal(other.b.spawnToken(other.p, WARD, at2.r, at2.col)?.kit ?? null, null, 'no kit for this summon');
  const bad = await summoner([{ name: 'tokens', install: () => {}, kits: { [WARD]: () => { throw new Error('no kit today'); } } }]);
  const at3 = free(bad.w, bad.c), t = bad.b.spawnToken(bad.p, WARD, at3.r, at3.col);
  assert.ok(t, 'still summoned');
  assert.equal(t.kit ?? null, null);
  assert.deepEqual(bad.b.errors.map((e) => [e.label, e.message]), [[`tokenKit:${WARD}`, 'no kit today']]);
});

test('[兼容-7] the content modules keep their `kits` (the tokens module’s kits of summons) when they load', async () => {
  const kits = { a: () => ({}) };
  const r = await loadContent('file:///sh/', ['tokens', 'bonds'], async (/** @type {string} */ url) => (url.endsWith('/tokens.js') ? { install() {}, kits } : { install() {} }));
  assert.deepEqual(r.modules.map((m) => [m.name, m.kits ?? null]), [['tokens', kits], ['bonds', null]]);
});

test('[兼容-4] [兼容-7] a summon of an operator with no kit is the engine’s own, whatever the tokens module defines (DIF-0052)', async () => {
  /** @type {any} */
  let battle = null;
  const kits = { [WARD]: () => ({ fromTokens: true }) };
  const c = await matchContent({ ...AT, decks: [[{ id: SIEGE, build: E2 }, { id: SNIPER, build: E2 }]] },
    { kits: { [SIEGE]: /** @type {any} */ (() => ({})) }, content: { modules: [{ name: 'tokens', install: () => {}, kits }], seen: (b) => { battle = b; } } });
  const w = createWorld(c, { seed: 1, players: 1 }), key = `${SNIPER}#0`;
  w.players[0].cost = 99;
  const deploy = c.level.tiles.flatMap((row, r) => row.map((_, col) => ({ type: /** @type {const} */ ('deploy'), op: key, row: r, col, dir: 0 }))).find((cmd) => deployProblem(w, c, 0, cmd) === null);
  step(w, c, [[0, /** @type {any} */ (deploy)]]);
  const owner = /** @type {any} */ (w.units.find((u) => u.key === key)), at = free(w, c);
  const token = summons.spawnSummon(w, /** @type {any} */ (c), owner, `${WARD}#0`, { row: at.r, col: at.col });
  assert.ok(token, 'summoned by the engine');
  const unit = /** @type {ShBattle} */ (battle).unitOf(/** @type {any} */ (token));
  assert.deepEqual([unit.kind, unit.kit ?? null], ['token', null]);
});
