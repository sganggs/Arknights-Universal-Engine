// Element damage on a normal attack (docs/spec/foes.md 敌能-38). Ratios are the enemy_database 17759cc8 blackboards;
// atk 1000 is a fixture so the product is readable. `el` is the 元素-1 id from FOE_EXTRAS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, elements, damage, KIND } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras, uncoveredAbilities, FOE_EXTRAS, foeBehaviors } from '../src/foes.js';
import rm07 from '../data/levels/act1multi_rm07.json' with { type: 'json' };

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */
/** @typedef {import('@aue/sim').EnemyDef} EnemyDef */
/** @typedef {import('../../sim/src/damage.js').Damage} Damage */
/** @typedef {'SANITY' | 'WATER' | 'FIRE' | 'DARK' | 'ANGER'} El */

const RATIO = 'attack@ep_damage_ratio';
/** @type {Damage} */
const HIT = { type: 'phys', amount: 1 };
const SPEED = { attack_speed: 100, duration: 10, stack_cnt: 20, warning_stack_cnt: 10 };
/** Blocker, four cross neighbours, one diagonal (row, col). */
const SEATS = /** @type {[string, number, number][]} */ ([
  ['guard', 1, 2], ['g2', 1, 1], ['g3', 1, 3], ['sniper', 0, 2], ['s2', 2, 2], ['s3', 0, 3],
]);
const CROSS = [[1, 2], [1, 1], [1, 3], [0, 2], [2, 2]];

/** @param {Record<string, Record<string, number>>} talents @param {Partial<EnemyDef>} [more] @returns {EnemyDef} */
function enemy(talents, more = {}) {
  return { name: 'e', maxHp: 1e6, atk: 1000, def: 0, res: 0, moveSpeed: 0, baseAttackTime: 1, maxEp: 1e6, talents, ...more };
}

/** @param {string} key @param {any} def */
const gaps = (key, def) => uncoveredAbilities([withFoeExtras(key, def)]);

/** @param {number} got @param {number} want */
const close = (got, want) => Math.abs(got - want) < 1e-6;
/** @param {any[]} ev @param {number} id @param {number} [target] */
const on = (ev, id, target) => ev.filter((x) => x.type === 'hit' && x.id === id && (target === undefined || x.target === target));
/** @param {Unit} u */
const pulse = (u) => u.buffs.find((b) => b.key === 'attackSpeedUp');

/** @param {World} w @param {any} c @param {number} n */
function struck(w, c, n) {
  /** @type {any[]} */
  const out = [];
  for (let i = 0; i < n; i++) for (const ev of step(w, c)) out.push(ev);
  return out;
}

/** @param {World} w @param {Unit} e @param {number} n @param {Damage} dmg */
function poke(w, e, n, dmg) {
  for (let i = 0; i < n; i++) damage.dealDamage(w, null, e, dmg);
}

/**
 * The enemy spawns, stands on the guard's tile, and the operators deploy. Extras are merged; incomplete talents are
 * not stripped, so a missing `el` can be seen to add nothing.
 * @param {string} key @param {any} def
 * @param {{ ops?: [string, number, number][], late?: boolean, twin?: boolean }} [o]
 */
function fight(key, def, o = {}) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [key]: withFoeExtras(key, def) };
  if (o.late) c.enemies.bystander = { name: 'bystander', maxHp: 1e6, atk: 0, def: 0, res: 0, moveSpeed: 0 };
  c.behaviors = skeletonContent.behaviors;
  const spawns = [spawnAt(0, key)];
  if (o.twin) spawns.push(spawnAt(0, key));
  if (o.late) spawns.push(spawnAt(2, 'bystander'));
  c.level.waves = [oneWave(spawns)];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 8 };
  const op = { cost: 0, maxHp: 1e6, atk: 0, def: 10000, res: 0, maxEp: 1e6 };
  Object.assign(c.operators.guard, op);
  Object.assign(c.operators.sniper, op);
  c.operators.g2 = { ...c.operators.guard, name: 'g2' };
  c.operators.g3 = { ...c.operators.guard, name: 'g3' };
  c.operators.s2 = { ...c.operators.sniper, name: 's2' };
  c.operators.s3 = { ...c.operators.sniper, name: 's3' };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  for (const e of w.units) if (e.kind === KIND.ENEMY) {
    Object.assign(e, { x: 2, y: 1, path: [], pt: 0 });
    status.applyStatus(e, 'root', {});
  }
  const placed = o.ops ?? [];
  if (placed.length) step(w, c, placed.map(([id, row, col]) => [0, { type: 'deploy', op: id, row, col, dir: 0 }]));
  return { c, w, es: w.units.filter((u) => u.kind === KIND.ENEMY), ops: w.units.filter((u) => u.kind === KIND.OPERATOR) };
}

/** @param {ReturnType<typeof fight>} box @param {El} el @param {number} ratio @param {'arts' | 'phys'} kind */
function expectEp(box, el, ratio, kind) {
  const { c, w, es: [e], ops: [g] } = box;
  const was = elements.epOf(g, el);
  const ev = struck(w, c, 70);
  const hits = on(ev, e.id, g.id);
  const dealt = kind === 'arts' ? 1000 : 50;
  assert.ok(hits.length > 0 && hits.every((x) => x.damage === dealt), `${kind} hits ${hits.map((x) => x.damage).join(',')}`);
  assert.ok(close(was - elements.epOf(g, el), hits.length * 1000 * ratio), `${el} ${was - elements.epOf(g, el)}`);
  assert.equal(elements.epOf(g, el === 'DARK' ? 'SANITY' : 'DARK'), 1e6);
}

/** Attacks landed and none of the four elements moved. @param {ReturnType<typeof fight>} box */
function expectNone(box) {
  const { c, w, es: [e], ops: [g] } = box;
  /** @type {El[]} */
  const four = ['SANITY', 'WATER', 'FIRE', 'DARK'];
  const before = four.map((el) => elements.epOf(g, el));
  const ev = struck(w, c, 70);
  assert.ok(on(ev, e.id, g.id).length > 0);
  four.forEach((el, i) => assert.equal(elements.epOf(g, el), before[i], el));
}

/** 侵蚀 on the blocker and the four tiles next to it, not the diagonal. @param {string} key @param {any} talents @param {number} range */
function cross(key, talents, range) {
  const box = fight(key, enemy(talents, { dmgType: 'arts', applyWay: 'RANGED', rangeRadius: range }), { ops: SEATS });
  const { c, w, es: [e], ops } = box;
  const was = new Map(ops.map((u) => [u, elements.epOf(u, 'WATER')]));
  const ev = struck(w, c, 70);
  const guard = ops.find((u) => u.y === 1 && u.x === 2);
  assert.ok(guard);
  const n = on(ev, e.id, guard.id).length;
  // The snipers are ranged, so their own attacks launch projectiles. The enemy's cross does not (敌能-26).
  assert.ok(n > 0, 'hits land');
  assert.equal(ev.filter((x) => x.type === 'shot' && x.id === e.id).length, 0, 'the cross hits at once');
  for (const [row, col] of CROSS) {
    const u = ops.find((x) => x.y === row && x.x === col);
    assert.ok(u);
    assert.ok(close(/** @type {number} */ (was.get(u)) - elements.epOf(u, 'WATER'), n * 800), `${row},${col}`);
  }
  const diag = ops.find((u) => u.y === 0 && u.x === 3);
  assert.ok(diag);
  assert.equal(elements.epOf(diag, 'WATER'), was.get(diag));
}

const singer = () => enemy(
  { attack: { [RATIO]: 0.2 }, AttackSpeedUp: { ...SPEED } },
  { atk: 0, dmgType: 'arts', applyWay: 'RANGED', rangeRadius: 2.5 },
);

const GUARD = /** @type {[string, number, number][]} */ ([['guard', 1, 2]]);

test('[敌能-38] the named enemies take their element id; a ratio alone does not', () => {
  /** @type {[string, Record<string, Record<string, number>>, Record<string, number>][]} */
  const merged = [
    ['enemy_1148_dssbr', { epdamage: { [RATIO]: 0.15 } }, { el: 1 }],
    ['enemy_1148_dssbr_2', { epdamage: { [RATIO]: 0.15 } }, { el: 1 }],
    ['enemy_2009_csaudc', { combat: { [RATIO]: 0.2 } }, { el: 1 }],
    ['enemy_2010_csdcr', { attack: { [RATIO]: 0.2 } }, { el: 1 }],
    ['enemy_1305_mhslim', { EpDamage: { [RATIO]: 1 } }, { el: 3 }],
    ['enemy_1305_mhslim_2', { EpDamage: { [RATIO]: 1 } }, { el: 3 }],
    ['enemy_1161_tidmag', { EpDamage: { [RATIO]: 0.8 } }, { el: 2, cross: 1 }],
    ['enemy_1161_tidmag_2', { EpDamage: { [RATIO]: 0.8 } }, { el: 2, cross: 1 }],
    ['enemy_2021_syfish', { EpDamage: { [RATIO]: 0.2 } }, { el: 2 }],
  ];
  for (const [key, talents, extra] of merged) {
    const name = Object.keys(talents)[0] ?? '';
    const got = withFoeExtras(key, enemy(talents)).talents?.[name];
    assert.deepEqual(got, { ...talents[name], ...extra }, key);
    assert.deepEqual(gaps(key, enemy(talents)), [], key);
  }
  for (const key of ['enemy_1229_darmy', 'enemy_1229_darmy_2', 'enemy_1275_dwlock', 'enemy_1275_dwlock_2']) {
    const raw = /** @type {any} */ (rm07).enemies[key];
    const name = key.startsWith('enemy_1229') ? 'epdamage' : 'empty';
    const got = withFoeExtras(key, raw).talents?.[name];
    assert.ok(got);
    assert.equal(got.el, 4, key);
    assert.equal(got[RATIO], name === 'epdamage' ? 0.37 : 0.25, key);
    assert.deepEqual(gaps(key, raw), [], key);
  }
  assert.equal(FOE_EXTRAS.enemy_1162_magmot_2, undefined);
  assert.equal(FOE_EXTRAS.enemy_1183_mlasrt_2, undefined);
  assert.equal(FOE_EXTRAS.enemy_2029_symon, undefined);
});

test('[敌能-38] a shared talent name with the wrong blackboard, or no el, stays incomplete and adds no element', () => {
  const bare = enemy({ epdamage: { [RATIO]: 0.15 } });
  assert.deepEqual(gaps('enemy_1150_dsjely', bare), ['epdamage']);
  expectNone(fight('enemy_1150_dsjely', bare, { ops: GUARD }));
  const chain = enemy({ epdamage: { [RATIO]: 0.15, 'attack@max_target': 3, 'attack@chain.atk_scale': 1, el: 1 } });
  assert.deepEqual(gaps('enemy_1225_dkmage', chain), ['epdamage']);
  expectNone(fight('enemy_1225_dkmage', chain, { ops: GUARD }));
  assert.deepEqual(gaps('enemy_15017_dqdwlo', enemy({ empty: { [RATIO]: 0.25 } })), ['empty']);
  assert.deepEqual(gaps('enemy_1522_captan', enemy({ AttackSpeedUp: { attack_speed: 30 } })), ['AttackSpeedUp']);
  assert.deepEqual(gaps('enemy_1512_mcmstr', enemy({ combat: { 'attack@mcmstr_rage_attack.atk_scale': 3.5 } })), ['combat']);
  assert.deepEqual(gaps('enemy_2014_csice', enemy({ combat: { [RATIO]: 0.2, 'attack@freeze': 2, el: 1 } })), ['combat']);
  assert.deepEqual(gaps('enemy_1230_bare', enemy({ EpDamage: { ep_damage_ratio: 0.8, el: 2 } })), ['EpDamage']);
  assert.deepEqual(gaps('enemy_5002_fan', enemy({ attack: { [RATIO]: 0.2, 'attack@times': 3, el: 1 } })), ['attack']);
});

test('[敌能-38] 底海滑动者: 15% 神经, physical; 骇笑看客: 20% 神经', () => {
  const slide = enemy({ epdamage: { [RATIO]: 0.15 } });
  expectEp(fight('enemy_1148_dssbr', slide, { ops: GUARD }), 'SANITY', 0.15, 'phys');
  const crowd = enemy({ combat: { [RATIO]: 0.2 } });
  expectEp(fight('enemy_2009_csaudc', crowd, { ops: GUARD }), 'SANITY', 0.2, 'phys');
});

test('[敌能-38] 绯红歌伶: 20% 神经 on an arts hit; 灼热源石虫: 100% 灼燃, arts from the handbook', () => {
  const song = enemy({ attack: { [RATIO]: 0.2 }, AttackSpeedUp: { ...SPEED } }, { dmgType: 'arts', applyWay: 'RANGED', rangeRadius: 2.5 });
  expectEp(fight('enemy_2010_csdcr', song, { ops: GUARD }), 'SANITY', 0.2, 'arts');
  const worm = enemy({ EpDamage: { [RATIO]: 1 } }, { dmgType: 'arts', applyWay: 'RANGED', rangeRadius: 1.8 });
  expectEp(fight('enemy_1305_mhslim', worm, { ops: GUARD }), 'FIRE', 1, 'arts');
});

test('[敌能-38] [敌能-26] 控潮术师 and 术师快艇: 80% 侵蚀 on the target and the four tiles beside it', () => {
  cross('enemy_1161_tidmag', { EpDamage: { [RATIO]: 0.8 } }, 2.2);
  // The data's enemy_key is a string. The talent name alone has no behaviour, so the boat stays incomplete.
  const boat = { EpDamage: { [RATIO]: 0.8 }, DeathRattle: {} };
  assert.deepEqual(gaps('enemy_1162_magmot', enemy(boat)), ['DeathRattle']);
  cross('enemy_1162_magmot', boat, 3);
});

/** The names of these abilities that no behaviour covers yet: another clause may give one (`noFly`, a skill). @param {string[]} names */
const stillOpen = (names) => names.filter((n) => !Object.hasOwn(foeBehaviors, n));

test('[敌能-38] 骨海漂流体 hits one target; 掠海漂移体 is complete once Float has a behaviour (敌能-48); 清扫小队 on what has none', () => {
  const fish = enemy({ EpDamage: { [RATIO]: 0.2 } });
  const box = fight('enemy_2021_syfish', fish, { ops: [['guard', 1, 2], ['g2', 1, 3]] });
  const was = elements.epOf(box.ops[1], 'WATER');
  expectEp(box, 'WATER', 0.2, 'phys');
  assert.equal(elements.epOf(box.ops[1], 'WATER'), was, 'no splash');
  const drift = enemy({ EpDamage: { [RATIO]: 0.5 } }, { applyWay: 'ALL', rangeRadius: 2.6 });
  assert.deepEqual(gaps('enemy_2025_syufo', drift), []);
  assert.deepEqual(withFoeExtras('enemy_2025_syufo', drift).talents?.Float, {});
  expectEp(fight('enemy_2025_syufo', drift, { ops: GUARD }), 'WATER', 0.5, 'phys');
  const crew = enemy({ EpDamage: { [RATIO]: 0.35 } }, {
    applyWay: 'RANGED', rangeRadius: 10,
    skills: [{ key: 'PowerAttack', cooldown: 0, initCooldown: 0, sp: 0, bb: { ep_damage_ratio: 0.35, atk_scale: 1.5 } }],
  });
  assert.deepEqual(gaps('enemy_1183_mlasrt', crew), stillOpen(['noFly', 'PowerAttack']));
  // the 侵蚀 on its normal attack alone: without the skill, whose 强力击 is another clause's
  const plain = enemy({ EpDamage: { [RATIO]: 0.35 } }, { applyWay: 'RANGED', rangeRadius: 10 });
  expectEp(fight('enemy_1183_mlasrt', plain, { ops: GUARD }), 'WATER', 0.35, 'phys');
});

test('[敌能-38] 绯红歌伶: 19 hits do nothing; the 20th adds 100 attack speed for 10 s', () => {
  const { c, w, es: [e] } = fight('enemy_2010_csdcr', singer());
  poke(w, e, 19, HIT);
  step(w, c);
  assert.equal(attrs.statsOf(e).aspd, 100);
  assert.equal(pulse(e), undefined);
  poke(w, e, 1, HIT);
  step(w, c);
  assert.equal(attrs.statsOf(e).aspd, 200);
  assert.equal(pulse(e)?.left, 300);
});

test('[敌能-38] 不可叠加: 40 hits add 100 once, and the next turn spends the rest without refreshing', () => {
  const { c, w, es: [e] } = fight('enemy_2010_csdcr', singer());
  poke(w, e, 40, HIT);
  step(w, c);
  assert.equal(pulse(e)?.left, 300);
  assert.equal(attrs.statsOf(e).aspd, 200);
  step(w, c);
  assert.equal(pulse(e)?.left, 299);
  assert.equal(e.buffs.filter((b) => b.key === 'attackSpeedUp').length, 1);
  assert.equal(attrs.statsOf(e).aspd, 200);
});

test('[敌能-38] the attack-speed buff lasts 10 s from the turn it is given, then is gone', () => {
  const { c, w, es: [e] } = fight('enemy_2010_csdcr', singer());
  poke(w, e, 20, HIT);
  step(w, c);
  struck(w, c, 299);
  assert.equal(pulse(e)?.left, 1);
  assert.equal(attrs.statsOf(e).aspd, 200);
  step(w, c);
  assert.equal(pulse(e), undefined);
  assert.equal(attrs.statsOf(e).aspd, 100);
});

test('[敌能-38] 生命流失 and 无敌 do not count, and an operator is not tallied', () => {
  const { c, w, es: [e] } = fight('enemy_2010_csdcr', singer(), { ops: GUARD });
  const g = w.units.find((u) => u.kind === KIND.OPERATOR);
  // The deploy step already let the guard's attack count once (amount 0 still passes the gate). Freeze it so the
  // later turns add nothing of their own.
  if (g) g.atkCd = 1000;
  const before = e.ab['@taken'] ?? 0;
  poke(w, e, 20, { type: 'true', amount: 1, hpLoss: true });
  poke(w, /** @type {Unit} */ (g), 5, HIT);
  step(w, c);
  assert.equal(pulse(e), undefined);
  assert.equal(e.ab['@taken'] ?? 0, before);
  assert.equal(g?.ab['@taken'], undefined);
  status.applyStatus(e, 'invincible', {});
  poke(w, e, 20, HIT);
  step(w, c);
  assert.equal(pulse(e), undefined);
  assert.equal(e.ab['@taken'] ?? 0, before);
});

test('[敌能-38] two singers in one turn add 100, not 200; an enemy that appears later does not get it', () => {
  const pair = fight('enemy_2010_csdcr', singer(), { twin: true });
  for (const e of pair.es) poke(pair.w, e, 20, HIT);
  step(pair.w, pair.c);
  for (const e of pair.es) {
    assert.equal(attrs.statsOf(e).aspd, 200);
    assert.equal(e.buffs.filter((b) => b.key === 'attackSpeedUp').length, 1);
  }
  const late = fight('enemy_2010_csdcr', singer(), { late: true });
  poke(late.w, late.es[0], 20, HIT);
  step(late.w, late.c);
  let born = /** @type {Unit | undefined} */ (undefined);
  while (!born && late.w.frame < 90) {
    step(late.w, late.c);
    born = late.w.units.find((u) => u.key === 'bystander');
  }
  assert.ok(born);
  assert.equal(pulse(/** @type {Unit} */ (born)), undefined);
  assert.equal(attrs.statsOf(/** @type {Unit} */ (born)).aspd, 100);
  assert.equal(attrs.statsOf(late.es[0]).aspd, 200);
});
