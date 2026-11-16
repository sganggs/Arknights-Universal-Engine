// The events of the ordered settlement of a hit and of a status (docs/spec/hooks.md 钩子-3): damageCalculate after hit and
// before the defences, damageApplying before the target's 伤判, damageApplied after the HP, statusApplied after a status
// took hold — a cold pair's freeze goes through beforeStatus too (状态-6) —, ammoUsed for a shot an ammo skill spends
// (技能-4); the buff keys the aura sync owns (职业-13); how far a slide takes a unit (位移-3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step, isAuraKey, displacement } from '../src/index.js';
import { on } from '../src/bus.js';
import { dealDamage } from '../src/damage.js';
import { makeOperator, makeEnemy } from '../src/units.js';
import { makeBuff, addBuff } from '../src/buffs.js';
import { inflict, applyStatus } from '../src/status.js';

/** A world with a guard (50 ATK) next to a slime (1000 HP, DEF 10) on the road; nothing else happens on its own. */
function field() {
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [];
  c.enemies.slime.maxHp = 1000;
  const w = createWorld(c, { seed: 1, players: 1 });
  const guard = makeOperator(w, c, { key: 'guard', owner: 0, row: 1, col: 1, dir: 0 }), slime = makeEnemy(w, c, { key: 'slime', route: 0 });
  w.units.push(guard, slime);
  return { c, w, guard, slime };
}

test('[钩子-3] damageCalculate: after hit, before the defences; a handler changes the hit, adds a precomputed hit that does not set it off again, or cancels', () => {
  const { w, guard, slime } = field(), seen = /** @type {string[]} */ ([]);
  on(w, 'hit', (k) => seen.push(`hit:${k.dmg.amount}`));
  on(w, 'damageCalculate', (k) => {
    seen.push(`calc:${k.source.key}>${k.target.key}:${k.credit.key}:${k.dmg.amount}`);
    if (k.dmg.tags?.includes('grow')) k.dmg.amount += 50;
    if (k.dmg.tags?.includes('rider')) dealDamage(w, k.source, k.target, { type: 'arts', amount: 100, calculation: 'precomputed', tags: ['added'] });
    if (k.dmg.tags?.includes('stop')) k.dmg.cancel = true;
  });
  assert.equal(dealDamage(w, guard, slime, { type: 'phys', amount: 50 }), 40);
  assert.equal(dealDamage(w, guard, slime, { type: 'phys', amount: 50, tags: ['grow'] }), 90, 'the amount a handler changed goes through the defences: 100 − 10');
  assert.equal(dealDamage(w, guard, slime, { type: 'phys', amount: 50, tags: ['stop'] }), 0);
  assert.equal(dealDamage(w, guard, slime, { type: 'phys', amount: 50, tags: ['rider'] }), 40, 'the rider is its own hit');
  assert.deepEqual(seen, ['hit:50', 'calc:guard>slime:guard:50', 'hit:50', 'calc:guard>slime:guard:50', 'hit:50', 'calc:guard>slime:guard:50', 'hit:50', 'calc:guard>slime:guard:50', 'hit:100'],
    'hit first, then the calculation; the rider’s own hit sets off hit and no calculation');
  assert.equal(slime.hp, 1000 - 40 - 90 - 40 - 100, 'the rider arts hit (RES 0) took its 100 besides the main hit');
});

test('[钩子-3] damageCalculate: none for a hit with no source, a hit that is calculated already, or a 生命流失', () => {
  const { w, guard, slime } = field(), seen = /** @type {string[]} */ ([]);
  on(w, 'damageCalculate', (k) => seen.push(`${k.source.key}:${k.dmg.amount}`));
  dealDamage(w, null, slime, { type: 'true', amount: 5 });
  dealDamage(w, guard, slime, { type: 'true', amount: 6, sourceless: true });
  dealDamage(w, guard, slime, { type: 'true', amount: 7, calculation: 'precomputed' });
  dealDamage(w, guard, slime, { type: 'true', amount: 8, calculation: 'resolved' });
  dealDamage(w, guard, slime, { type: 'true', amount: 9, hpLoss: true });
  assert.deepEqual(seen, []);
  dealDamage(w, guard, slime, { type: 'true', amount: 10 });
  assert.deepEqual(seen, ['guard:10']);
});

test('[钩子-3] damageApplying: after the defences and the source’s multiplier, before the 伤判; a handler changes the damage — up or down — or cancels the hit as a whole', () => {
  const { w, guard, slime } = field(), seen = /** @type {string[]} */ ([]);
  let mode = 'keep';
  on(w, 'damageApplying', (k) => {
    seen.push(`${k.source?.key ?? null}/${k.credit?.key}>${k.target.key}:${k.amount}:${slime.buffs.find((b) => b.key === 'guardian')?.shield ?? '-'}`);
    if (mode === 'less') k.amount = 5;
    if (mode === 'more') k.amount = 200;
    if (mode === 'junk') k.amount = NaN;
    if (mode === 'cancel') k.dmg.cancel = true;
  });
  const hit = () => dealDamage(w, guard, slime, { type: 'phys', amount: 50 });
  assert.deepEqual([hit(), seen[0]], [40, 'guard/guard>slime:40:-'], '50 − DEF 10 reaches the event, and the HP');
  const got = /** @type {Record<string, number>} */ ({});
  for (const m of ['less', 'more', 'junk', 'cancel']) { mode = m; got[m] = hit(); }
  assert.deepEqual(got, { less: 5, more: 200, junk: 0, cancel: 0 });
  assert.equal(slime.hp, 1000 - 40 - 5 - 200, 'a number that is not finite is 0, a cancelled hit takes nothing');
  mode = 'keep';
  addBuff(slime, makeBuff({ key: 'guardian', shield: 100 }));
  seen.length = 0;
  assert.equal(hit(), 0);
  assert.deepEqual([seen[0], slime.buffs.find((b) => b.key === 'guardian')?.shield], ['guard/guard>slime:40:100', 60], 'the 伤判 follows it: the shield was whole when it was told');
  mode = 'cancel';
  hit();
  assert.equal(slime.buffs.find((b) => b.key === 'guardian')?.shield, 60, 'cancelled before the 伤判: the shield took nothing');
  mode = 'keep';
  seen.length = 0;
  dealDamage(w, guard, slime, { type: 'true', amount: 3, sourceless: true });
  assert.equal(seen[0], 'null/guard>slime:3:60', 'a hit that is without a source has none to see, its credit named');
});

test('[钩子-3] damageApplied: after the HP, for damage that took HP — its amount and the HP it removed —, before damaged; none for 生命流失, a hit that is dodged or does 0', () => {
  const { w, guard, slime } = field(), seen = /** @type {string[]} */ ([]);
  on(w, 'damageApplied', (k) => seen.push(`applied:${k.source?.key ?? null}>${k.target.key}:${k.kind}:${k.amount}:${k.hpRemoved}:${k.target.hp}`));
  on(w, 'damaged', (k) => seen.push(`damaged:${k.amount}`));
  /** The events since the last call. */
  const took = () => seen.splice(0);
  dealDamage(w, guard, slime, { type: 'phys', amount: 50 });
  assert.deepEqual(took(), ['applied:guard>slime:damage:40:40:960', 'damaged:40']);
  dealDamage(w, guard, slime, { type: 'true', amount: 9, sourceless: true });
  assert.deepEqual(took(), ['applied:null>slime:damage:9:9:951', 'damaged:9'], 'a hit with no source: none for the events');
  dealDamage(w, guard, slime, { type: 'true', amount: 7, hpLoss: true });
  assert.deepEqual(took(), ['damaged:7'], '生命流失');
  dealDamage(w, guard, slime, { type: 'true', amount: 0 });
  assert.deepEqual(took(), [], 'nothing taken');
  addBuff(slime, makeBuff({ key: 'evade', mods: { dodgePhys: 1 } }));
  dealDamage(w, guard, slime, { type: 'phys', amount: 50 });
  assert.deepEqual(took(), [], 'dodged');
  slime.buffs.length = 0;
  slime.hp = 30;
  dealDamage(w, guard, slime, { type: 'phys', amount: 500 });
  assert.deepEqual(took(), ['applied:guard>slime:damage:490:30:0', 'damaged:490'], 'the amount dealt, the HP that was there');
});

test('[钩子-3] [状态-5] statusApplied: after the status took hold with how long it lasts, its value and whether it entered; not for one that is cancelled, refused or has no time', () => {
  const { w, guard, slime } = field(), seen = /** @type {string[]} */ ([]);
  on(w, 'statusApplied', (k) => seen.push(`${k.status}:${k.frames}:${k.strength}:${k.entered}:${k.source?.key ?? null}:${k.target.buffs.some((/** @type {any} */ b) => b.key === k.status)}`));
  on(w, 'beforeStatus', (k) => { if (k.status === 'sleep') k.cancel = true; if (k.status === 'stun') k.frames = 60; });
  inflict(w, slime, 'stun', { seconds: 1, src: guard });
  inflict(w, slime, 'stun', { seconds: 1, src: guard });
  inflict(w, slime, 'fragile', { seconds: 2, value: 0.2 });
  inflict(w, slime, 'sleep', { seconds: 1 });
  inflict(w, slime, 'levitate', { seconds: 0 });
  inflict(w, slime, 'sluggish', { frames: 15, src: guard });
  assert.deepEqual(seen, ['stun:60:0:true:guard:true', 'stun:60:0:false:guard:true', 'fragile:60:0.2:true:null:true', 'sluggish:15:0:true:guard:true']);
  applyStatus(slime, 'silence', { seconds: 1 });
  assert.equal(seen.length, 4, 'a status given without a battle has no event');
});

test('[钩子-3] [状态-6] a cold pair’s freeze goes through beforeStatus and statusApplied: a handler changes its frames or cancels it; the cold itself reports nothing', () => {
  const { w, guard, slime } = field(), seen = /** @type {string[]} */ ([]);
  let freeze = 'keep';
  on(w, 'beforeStatus', (k) => {
    seen.push(`before:${k.status}:${k.frames}:${k.source?.key ?? null}`);
    if (k.status === 'freeze' && freeze === 'cancel') k.cancel = true;
    if (k.status === 'freeze' && freeze === 'longer') k.frames = 100;
  });
  on(w, 'statusApplied', (k) => seen.push(`applied:${k.status}:${k.frames}:${k.entered}`));
  inflict(w, slime, 'cold', { seconds: 1, src: guard });
  inflict(w, slime, 'cold', { seconds: 2, src: guard });
  assert.deepEqual(seen, ['before:cold:30:guard', 'applied:cold:30:true', 'before:cold:60:guard', 'before:freeze:60:guard', 'applied:freeze:60:true']);
  assert.deepEqual(slime.buffs.map((b) => [b.key, b.left]), [['freeze', 60]], 'the pair became the freeze');
  seen.length = 0;
  const other = makeEnemy(w, /** @type {any} */ (tinyContent()), { key: 'slime', route: 0 });
  w.units.push(other);
  freeze = 'cancel';
  inflict(w, other, 'cold', { seconds: 1, src: guard });
  inflict(w, other, 'cold', { seconds: 1, src: guard });
  assert.deepEqual(seen.filter((x) => x.startsWith('before:freeze') || x.includes('freeze')), ['before:freeze:30:guard'], 'cancelled: no freeze, no event');
  assert.deepEqual(other.buffs.map((b) => b.key), ['cold', 'cold'], 'the second cold stays as a cold');
  seen.length = 0;
  const third = makeEnemy(w, /** @type {any} */ (tinyContent()), { key: 'slime', route: 0 });
  w.units.push(third);
  freeze = 'longer';
  inflict(w, third, 'cold', { seconds: 1, src: guard });
  inflict(w, third, 'cold', { seconds: 1, src: guard });
  assert.deepEqual([seen.at(-1), third.buffs.map((b) => [b.key, b.left])], ['applied:freeze:100:true', [['freeze', 100]]]);
});

test('[钩子-3] [状态-6] an enemy’s cold on an enemy cold is the enemy freeze, reported as freeze; a freeze already there is not entered again', () => {
  const { w, guard, slime } = field(), foe = makeEnemy(w, /** @type {any} */ (tinyContent()), { key: 'slime', route: 0 }), seen = /** @type {string[]} */ ([]);
  w.units.push(foe);
  on(w, 'statusApplied', (k) => seen.push(`${k.status}:${k.entered}`));
  inflict(w, guard, 'cold', { seconds: 1, src: foe });
  inflict(w, guard, 'cold', { seconds: 1, src: foe });
  inflict(w, guard, 'cold', { seconds: 1, src: foe });
  assert.deepEqual(seen, ['cold:true', 'freeze:true', 'freeze:false']);
  assert.ok(slime.hp > 0);
});

test('[钩子-3] [技能-4] ammoUsed: an ammo skill spends a shot and says how many are left; none for an attack that spends none', () => {
  const c = /** @type {any} */ (tinyContent());
  c.operators.guard.skill = { id: 'test', type: 'MANUAL', sp: 'time', cost: 1, init: 1, charges: 1, duration: 0, ammo: true, bb: { 'attack@trigger_time': 3, 'attack@atk_scale': 2 } };
  c.level.waves = [];
  const w = createWorld(c, { seed: 1, players: 2 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const guard = w.units[0], foe = makeEnemy(w, c, { key: 'slime', route: 0 });
  foe.x = 2; foe.y = 1;
  foe.base = { ...foe.base, maxHp: 1e9, def: 0 };
  foe.hp = foe.maxHp = 1e9;
  applyStatus(foe, 'root', {});
  w.units.push(foe);
  const seen = /** @type {string[]} */ ([]);
  let free = false;
  on(w, 'attack', (k) => { if (free) k.noAmmo = true; });
  on(w, 'ammoUsed', (k) => seen.push(`${k.unit.key}:${k.left}`));
  step(w, c, [[0, { type: 'skill', unit: guard.id }]]);
  for (let i = 0; i < 60; i++) step(w, c);
  assert.deepEqual(seen, ['guard:2', 'guard:1', 'guard:0'], 'a shot for each skill attack, the shots left after it');
  for (let i = 0; i < 90; i++) step(w, c);
  assert.equal(guard.skill?.sp, 1, 'the SP is back');
  free = true;
  seen.length = 0;
  step(w, c, [[0, { type: 'skill', unit: guard.id }]]);
  for (let i = 0; i < 90; i++) step(w, c);
  assert.deepEqual([guard.skill?.active, guard.skill?.ammo, seen], [true, 3, []], 'attacks that spend no shot: no event, the skill still full');
});

test('[职业-13] the keys the aura sync owns: the prefixes of the engine’s auras, nothing else', () => {
  for (const key of ['aura:3', 'aura:spRecovery', 'field:1', 'range:1', 'doll:2', 'mod:x', 'ally:x', 'inspire:hp', 'alchemy:1', 'aspd:1', 'fieldRegen:1', 'fieldBuff:1', 'stackShare:1', 'resistRegen:1', 'stayVuln:1']) {
    assert.equal(isAuraKey(key), true, key);
  }
  for (const key of ['kit:aura:x', 'aura', 'auras:1', 'talent:x', 'burst:FIRE', 'stun', '']) assert.equal(isAuraKey(key), false, key);
});

/** A level of rows ('.' road, '#' wall; row 0 first) and an enemy at (x, 1). @param {string[]} rows @param {number} x */
function lane(rows, x) {
  const road = { key: 'tile_road', height: 'LOWLAND', buildable: 'MELEE', passable: 'ALL', side: 'ALL' }, wall = { key: 'tile_wall', height: 'HIGHLAND', buildable: 'RANGED', passable: 'FLY_ONLY', side: 'ALL' };
  const c = /** @type {any} */ ({
    level: { id: 't', width: rows[0].length, height: rows.length, tiles: rows.map((r) => [...r].map((ch) => (ch === '#' ? wall : road))),
      options: { maxLifePoint: 3, initialCost: 99, maxCost: 99, costIncreaseTime: 1, characterLimit: 8, moveMultiplier: 0.5 },
      routes: [{ start: { row: 1, col: 0 }, end: { row: 1, col: rows[0].length - 1 }, motion: 'WALK', checkpoints: [] }], waves: [] },
    enemies: { e: { name: 'e', maxHp: 1e6, atk: 100, def: 0, res: 0, moveSpeed: 1, massLevel: 1, baseAttackTime: 1, applyWay: 'MELEE' } },
    operators: {},
  });
  const w = createWorld(c, { seed: 1, players: 1 }), e = makeEnemy(w, c, { key: 'e', route: 0 });
  e.x = x; e.y = 1;
  w.units.push(e);
  return { w, c, e };
}

/** Runs the slide of `e` to its end. @param {any} c @param {any} e */
function slideOut(c, e) {
  for (let i = 0; i < 300 && e.slide; i++) displacement.slideStep(c, e);
}

test('[位移-3] slideTravel: how far the slide a unit is in takes it, as the frames will — open ground, a wall, the map’s edge —; the unit does not move', () => {
  for (const effect of [false, true]) {
    const { w, c, e } = lane(['.......', '.......', '.......'], 1), x0 = e.x;
    assert.equal(displacement.push(w, c, e, 1, { from: { x: 0, y: 1 }, effect }), true);
    const at = e.x, far = displacement.slideTravel(c, e);
    assert.equal(e.x, at, 'a projection');
    slideOut(c, e);
    assert.ok(Math.abs(e.x - at - far) < 1e-9, `${effect ? 'effect' : 'ballistic'}: ${e.x - at} vs ${far}`);
    assert.ok(Math.abs(at - x0 + far - (effect ? 1.56247 : 1.6958)) < 0.003, 'PRTS’s distance, within the integration’s 0.003');
  }
  const hit = lane(['.......', '..#....', '.......'], 1), edge = lane(['.......', '.......', '.......'], 0.2);
  assert.equal(displacement.push(hit.w, hit.c, hit.e, 3, { from: { x: 0, y: 1 } }), true);
  const first = hit.e.x, left = displacement.slideTravel(hit.c, hit.e);
  slideOut(hit.c, hit.e);
  assert.ok(Math.abs(hit.e.x - first - left) < 1e-9, 'stopped by the wall in front of it');
  assert.ok(hit.e.x < 1.5 && hit.e.x - 1 < 1.6958 - 0.1, `it did not enter the wall tile, so it came short of the open ground (x ${hit.e.x})`);
  assert.equal(displacement.push(edge.w, edge.c, edge.e, 3, { from: { x: 2, y: 1 } }), true);
  const away = edge.e.x, to = displacement.slideTravel(edge.c, edge.e);
  slideOut(edge.c, edge.e);
  assert.ok(Math.abs(away - edge.e.x - to) < 1e-9 && edge.e.x > -0.5, 'stopped at the map’s edge');
});

test('[位移-3] [位移-5] slideTravel is 0 for a unit that does not slide, a 静态刚体, one that is lifted', () => {
  const { w, c, e } = lane(['.......', '.......', '.......'], 1);
  assert.equal(displacement.slideTravel(c, e), 0, 'not sliding');
  e.buffs.push(makeBuff({ key: 'rigid', flags: { staticBody: true } }));
  assert.equal(displacement.push(w, c, e, 3, { from: { x: 0, y: 1 } }), true, 'it enters 失衡');
  assert.equal(displacement.slideTravel(c, e), 0, 'with no speed');
  const up = lane(['.......', '.......', '.......'], 1);
  up.e.slide = { vx: 4, vy: 0, hard: 3 };
  up.e.buffs.push(makeBuff({ key: 'up', flags: { levitate: true } }));
  assert.equal(displacement.slideTravel(up.c, up.e), 0, 'a lifted unit’s slide ends at once');
});
