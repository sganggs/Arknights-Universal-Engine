// 莱茵生命防卫科 (docs/spec/foes.md 敌能-51): one 护盾 layer blocks one physical or arts instance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attackNow, bus, damage, elements, sp, status, attrs } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { uncoveredAbilities, withoutIncomplete } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

const SHIELD = { max_block_damage_cnt: 1, block_damage_cnt: 0 };

/** @param {Record<string, number>} [shield] @param {number} [def] @returns {import('@aue/sim').EnemyDef} */
const body = (shield = SHIELD, def = 0) => ({ name: 'm', maxHp: 4500, atk: 0, def, res: 0, moveSpeed: 0, massLevel: 0, talents: { Shield: shield } });

/**
 * The tiny map, these enemies spawned and rooted.
 * @param {Record<string, any>} enemies @param {(c: any) => void} [tweak]
 */
function open(enemies, tweak) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = enemies;
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave(Object.keys(enemies).map((key) => spawnAt(0, key)))];
  c.level.options = { ...c.level.options, characterLimit: 8, initialCost: 99, maxCost: 99, costIncreaseTime: 1000 };
  tweak?.(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  for (const u of w.units) status.applyStatus(u, 'root', {});
  return { c, w };
}

/** @param {World} w @param {string} key @returns {Unit} */
const foe = (w, key) => /** @type {Unit} */ (w.units.find((u) => u.key === key));
/** @param {Unit} u */
const layers = (u) => u.buffs.find((b) => b.key === 'blockDamage')?.shieldHits ?? 0;
/** @param {World} w @param {any} c @returns {Unit} */
function deploy(w, c) {
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  return /** @type {Unit} */ (w.units.find((u) => u.key === 'guard'));
}
/** Puts the enemy on the tile in front of that guard. @param {Unit} e */
const beside = (e) => { e.x = 2; e.y = 1; };

/** Counts of the hooks a blocked hit may or may not fire. @param {World} w */
function watch(w) {
  const seen = { hit: 0, dodge: 0, dealt: /** @type {number[]} */ ([]), damaged: /** @type {number[]} */ ([]) };
  bus.on(w, 'hit', () => { seen.hit += 1; });
  bus.on(w, 'dodge', () => { seen.dodge += 1; });
  bus.on(w, 'attackHit', (ctx) => { seen.dealt.push(/** @type {{ dealt: number }} */ (ctx).dealt); });
  bus.on(w, 'damaged', (ctx) => { seen.damaged.push(/** @type {{ amount: number }} */ (ctx).amount); });
  return seen;
}

test('[敌能-51] [关卡-2] only the max_block_damage_cnt shape is covered', () => {
  const lys = { talents: { Shield: { ...SHIELD } } };
  const bro = { talents: { Shield: { dynamic: 8000, range_radius: 0.4 } } };
  const half = { talents: { Shield: { max_block_damage_cnt: 1 } } };
  assert.deepEqual(uncoveredAbilities([/** @type {any} */ (lys)]), []);
  assert.deepEqual(uncoveredAbilities([/** @type {any} */ (bro), /** @type {any} */ (half)]), ['Shield']);
  assert.equal(withoutIncomplete(/** @type {any} */ (bro)).talents?.Shield, undefined);
  assert.equal(withoutIncomplete(/** @type {any} */ (half)).talents?.Shield, undefined);
  assert.deepEqual(withoutIncomplete(/** @type {any} */ (lys)).talents?.Shield, SHIELD);
});

test('[敌能-51] the first physical hit and the first arts hit are blocked; the next of each lands; a large hit is one instance', () => {
  const { w } = open({ phys: body(), arts: body(), tough: body(SHIELD, 250) });
  const phys = foe(w, 'phys'), arts = foe(w, 'arts'), tough = foe(w, 'tough');
  assert.equal(layers(phys), 1);
  assert.equal(damage.dealDamage(w, null, phys, { type: 'phys', amount: 1000 }), 0);
  assert.equal(phys.hp, 4500);
  assert.equal(layers(phys), 0);
  assert.equal(damage.dealDamage(w, null, phys, { type: 'phys', amount: 1000 }), 1000);
  assert.equal(phys.hp, 3500);
  assert.equal(damage.dealDamage(w, null, arts, { type: 'arts', amount: 800 }), 0);
  assert.equal(arts.hp, 4500);
  assert.equal(damage.dealDamage(w, null, arts, { type: 'arts', amount: 800 }), 800);
  assert.equal(arts.hp, 3700);
  assert.equal(damage.dealDamage(w, null, tough, { type: 'phys', amount: 4000 }), 0);
  assert.equal(tough.hp, 4500);
  assert.equal(damage.dealDamage(w, null, tough, { type: 'phys', amount: 4000 }), 3750);
  assert.equal(tough.hp, 750);
});

test('[敌能-51] true damage, elemental damage, 元素损伤, healing and 生命流失 do not spend it; splash and sourceless do', () => {
  const { w } = open({ plain: body(), sourceless: body() });
  const e = foe(w, 'plain'), bare = foe(w, 'sourceless');
  e.hp = 4000;
  assert.equal(damage.heal(w, null, e, 100), 100);
  assert.equal(e.hp, 4100);
  assert.equal(layers(e), 1);
  assert.equal(damage.dealDamage(w, null, e, { type: 'true', amount: 50 }), 50);
  assert.equal(damage.dealDamage(w, null, e, { type: 'elemental', amount: 50 }), 50);
  assert.equal(e.hp, 4000);
  assert.equal(layers(e), 1);
  const before = elements.epOf(e, 'FIRE');
  assert.equal(elements.dealEp(w, e, 'FIRE', 30), 30);
  assert.equal(before - elements.epOf(e, 'FIRE'), 30);
  assert.equal(damage.dealDamage(w, null, e, { type: 'phys', amount: 40, hpLoss: true }), 40);
  assert.equal(layers(e), 1);
  assert.equal(e.hp, 3960);
  assert.equal(damage.dealDamage(w, null, e, { type: 'phys', amount: 100, isSplash: true }), 0);
  assert.equal(e.hp, 3960);
  assert.equal(layers(e), 0);
  assert.equal(damage.dealDamage(w, null, bare, { type: 'arts', amount: 70, sourceless: true }), 0);
  assert.equal(bare.hp, 4500);
  assert.equal(layers(bare), 0);
});

test('[敌能-51] a two-hit attack blocks only the first instance; stun, attackHit and 攻击回复 still happen', () => {
  const { c, w } = open({ m: body() });
  const e = foe(w, 'm');
  c.operators.guard.atk = 1000;
  c.operators.guard.skill = { id: 's', type: 'MANUAL', sp: 'attack', cost: 10, init: 0, charges: 1, duration: 0, ammo: false, bb: {} };
  c.operators.guard.critTalents = [{ prob: 1, scale: 1, times: 2, stun: 1 }];
  const op = deploy(w, c);
  beside(e);
  const seen = watch(w);
  assert.equal(attackNow(w, c, op, [e]), true);
  assert.equal(e.hp, 3500);
  assert.equal(layers(e), 0);
  assert.equal(e.buffs.some((b) => b.key === 'stun'), true);
  assert.equal(op.skill?.sp, 1);
  assert.deepEqual(seen.dealt, [1000]);
  assert.equal(seen.hit, 2);
  assert.deepEqual(seen.damaged, [1000]);
  assert.equal(seen.dodge, 0);
  assert.deepEqual(w.events.filter((ev) => ev.type === 'hit' && ev.target === e.id).map((ev) => ev.damage), [1000]);
});

test('[敌能-51] a fully blocked hit still stuns and displaces, and attackHit reports no HP lost', () => {
  const { c, w } = open({ m: body() });
  const e = foe(w, 'm');
  c.operators.guard.atk = 800;
  c.operators.guard.skill = {
    id: 'push', type: 'MANUAL', sp: 'time', cost: 5, init: 0, charges: 1, duration: 10, ammo: false, bb: {},
    extra: { attack: { hitStatus: { key: 'stun', seconds: 2 }, displace: { pull: false, force: 2, along: true } } },
  };
  const op = deploy(w, c);
  sp.forceSp(/** @type {NonNullable<Unit['skill']>} */ (op.skill), 99);
  step(w, c, [[0, { type: 'skill', unit: op.id }]]);
  beside(e);
  const seen = watch(w);
  assert.equal(attackNow(w, c, op, [e]), true);
  assert.equal(e.hp, 4500);
  assert.equal(layers(e), 0);
  assert.equal(e.buffs.some((b) => b.key === 'stun'), true);
  assert.ok(e.slide);
  assert.ok(/** @type {NonNullable<Unit['slide']>} */ (e.slide).vx > 0);
  assert.deepEqual(seen.dealt, [0]);
  assert.equal(seen.hit, 1);
  assert.deepEqual(seen.damaged, []);
  assert.equal(seen.dodge, 0);
});

test('[敌能-51] a blocked hit still counts for 受击回复 and spends the layer', () => {
  const { w } = open({ m: body() });
  const e = foe(w, 'm');
  e.skill = { id: 'hurt', spType: 'hurt', cost: 1, cap: 8, sp: 0, slot: 0, active: false, armed: false, dur: -1, ammo: 0, at: -1 };
  assert.equal(damage.dealDamage(w, null, e, { type: 'phys', amount: 100 }), 0);
  assert.equal(e.hp, 4500);
  assert.equal(e.skill?.sp, 1);
  assert.equal(layers(e), 0);
  assert.equal(damage.dealDamage(w, null, e, { type: 'phys', amount: 100 }), 100);
  assert.equal(e.skill?.sp, 2);
});

test('[敌能-51] silence does not remove the layer, and a spent layer does not come back', () => {
  const bornDef = body();
  bornDef.talents = { mute: {}, Shield: { ...SHIELD } };
  const { w, c } = open({ m: body(), born: bornDef }, (content) => {
    content.behaviors = { ...content.behaviors, foes: { ...content.behaviors.foes, mute: {
      spawn: (/** @type {any} */ ctx) => { ctx.addBuff(ctx.self, { key: 'silence', flags: { silence: true } }); },
    } } };
  });
  const late = foe(w, 'm'), born = foe(w, 'born');
  status.applyStatus(late, 'silence', {});
  step(w, c);
  step(w, c);
  assert.equal(attrs.statsOf(late).flags.silence, true);
  assert.equal(layers(late), 1);
  assert.equal(damage.dealDamage(w, null, late, { type: 'arts', amount: 20 }), 0);
  assert.equal(late.hp, 4500);
  assert.equal(attrs.statsOf(born).flags.silence, true);
  assert.equal(layers(born), 1);
  for (let i = 0; i < 90; i++) step(w, c);
  assert.equal(layers(late), 0);
  assert.equal(layers(born), 1);
  assert.equal(damage.dealDamage(w, null, late, { type: 'arts', amount: 20 }), 20);
});

test('[敌能-51] a spent count grants nothing; two layers block twice; another Shield shape grants nothing', () => {
  const { w } = open({
    spent: body({ max_block_damage_cnt: 1, block_damage_cnt: 1 }),
    two: body({ max_block_damage_cnt: 2, block_damage_cnt: 0 }),
    bro: { name: 'bro', maxHp: 1000, atk: 0, def: 0, res: 0, moveSpeed: 0, talents: { Shield: { dynamic: 8000, range_radius: 0.4 } } },
    half: { name: 'half', maxHp: 1000, atk: 0, def: 0, res: 0, moveSpeed: 0, talents: { Shield: { max_block_damage_cnt: 1 } } },
  });
  const spent = foe(w, 'spent'), two = foe(w, 'two'), bro = foe(w, 'bro'), half = foe(w, 'half');
  assert.equal(layers(spent), 0);
  assert.equal(damage.dealDamage(w, null, spent, { type: 'phys', amount: 10 }), 10);
  assert.equal(layers(two), 2);
  assert.equal(damage.dealDamage(w, null, two, { type: 'phys', amount: 10 }), 0);
  assert.equal(damage.dealDamage(w, null, two, { type: 'arts', amount: 10 }), 0);
  assert.equal(two.hp, 4500);
  assert.equal(layers(two), 0);
  assert.equal(damage.dealDamage(w, null, two, { type: 'phys', amount: 10 }), 10);
  assert.equal(layers(bro), 0);
  assert.equal(layers(half), 0);
  assert.equal(damage.dealDamage(w, null, bro, { type: 'phys', amount: 10 }), 10);
  assert.equal(damage.dealDamage(w, null, half, { type: 'arts', amount: 10 }), 10);
});
