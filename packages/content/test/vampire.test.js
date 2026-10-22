// 吸血 (docs/spec/foes.md 敌能-75). atk 1000 is a fixture so a hit's dealt is 1000; the listed attacks are lower.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, buffs, KIND } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras, uncoveredAbilities } from '../src/foes.js';
import { LEVELS, levelAt } from '../src/levels.js';
import ig4 from '../data/levels/act1multi_07.json' with { type: 'json' };

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */
/** @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const NEST = { heal_scale: 1.5, 'attack@max_target': 3 };
const HEIR = { heal_scale: 2.2 };
/** Four tiles at distance 1 from the enemy on (2, 1). */
const RING = /** @type {[string, number, number][]} */ ([
  ['guard', 1, 1], ['g2', 1, 3], ['sniper', 0, 2], ['s2', 2, 2],
]);

/** @param {Record<string, Record<string, number>>} talents @param {Partial<EnemyDef>} [more] @returns {EnemyDef} */
function body(talents, more = {}) {
  return { name: 'e', maxHp: 20000, atk: 1000, def: 0, res: 0, moveSpeed: 0, baseAttackTime: 30, dmgType: 'arts', talents, ...more };
}

/** @param {string} key @param {Record<string, Record<string, number>>} talents */
const ranged = (key, talents) => withFoeExtras(key, body(talents, { applyWay: 'RANGED', rangeRadius: 1.6 }));
/** @param {string} key @param {Record<string, Record<string, number>>} talents */
const melee = (key, talents) => withFoeExtras(key, body(talents, { applyWay: 'MELEE' }));
/** @param {string} key @param {EnemyDef} def */
const gaps = (key, def) => uncoveredAbilities([withFoeExtras(key, def)]);

/**
 * The enemy stands on (2, 1), rooted, and does not attack until `play`.
 * @param {string} key @param {EnemyDef} def @param {[string, number, number][]} seats @param {(c: any) => void} [tweak]
 */
function scene(key, def, seats, tweak) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [key]: def };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, key)])];
  c.level.options = { ...c.level.options, characterLimit: 8, initialCost: 99, maxCost: 99, costIncreaseTime: 1000 };
  const op = { cost: 0, maxHp: 8000, atk: 0, def: 0, res: 0, maxEp: 1 };
  Object.assign(c.operators.guard, op);
  Object.assign(c.operators.sniper, op);
  c.operators.g2 = { ...c.operators.guard, name: 'g2' };
  c.operators.g3 = { ...c.operators.guard, name: 'g3' };
  c.operators.s2 = { ...c.operators.sniper, name: 's2' };
  tweak?.(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = w.units.find((u) => u.kind === KIND.ENEMY);
  if (!e) throw new Error(`no enemy ${key}`);
  e.x = 2;
  e.y = 1;
  e.path = [];
  e.pt = 0;
  e.atkCd = 999;
  status.applyStatus(e, 'root', {});
  for (const [id, row, col] of seats) step(w, c, [[0, { type: 'deploy', op: id, row, col, dir: 0 }]]);
  return { c, w, e };
}

/** One attack's hit events and the HP the enemy gained. @param {ReturnType<typeof scene>} box */
function play(box) {
  const { c, w, e } = box;
  const before = e.hp;
  e.atkCd = 0;
  /** @type {any[]} */
  const ev = [];
  for (let i = 0; i < 12; i++) ev.push(...step(w, c));
  return { hits: ev.filter((x) => x.type === 'hit' && x.id === e.id), gain: e.hp - before };
}

/** @param {World} w @param {string} key @returns {Unit} */
function unit(w, key) {
  const u = w.units.find((x) => x.key === key);
  if (!u) throw new Error(`no unit ${key}`);
  return u;
}

/** What levelAt would refuse for act1multi_07 at NORMAL, or the uncovered list if it loaded. @param {any} raw */
function levelGaps(raw) {
  try {
    const got = levelAt('act1multi_07', 'NORMAL', () => ({}), { act1multi_07: raw });
    return /** @type {string[]} */ (/** @type {any} */ (got.level).uncovered ?? []);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    const found = /not supported yet: (.+)$/.exec(message);
    if (!found?.[1]) throw err;
    return found[1].split(', ');
  }
}

test('[敌能-75] a 1000-damage hit heals 1500 or 2200', () => {
  /** @type {[string, number, boolean][]} */
  const rows = [
    ['enemy_1114_rgrdmn_2', 1500, true],
    ['enemy_1114_rgrdmn', 1500, true],
    ['enemy_1360_dfello', 2200, false],
    ['enemy_1228_dslime', 2200, false],
    ['enemy_1228_dslime_2', 2200, false],
  ];
  for (const [key, want, far] of rows) {
    const talents = { vampire: far ? { ...NEST } : { ...HEIR } };
    const box = scene(key, far ? ranged(key, talents) : melee(key, talents), [['guard', 1, 2]]);
    box.e.hp = 1000;
    const { hits, gain } = play(box);
    assert.equal(hits.length, 1, key);
    assert.equal(hits[0].damage, 1000, key);
    assert.equal(gain, want, key);
  }
});

test('[敌能-75] the heal is capped, stopped by 禁疗, and scaled; self-heal ignores noAllyHeal', () => {
  const key = 'enemy_1114_rgrdmn_2';
  const def = ranged(key, { vampire: { ...NEST } });
  const cap = scene(key, def, [['guard', 1, 2]]);
  cap.e.hp = cap.e.maxHp - 100;
  const capped = play(cap);
  assert.equal(capped.hits.length, 1);
  assert.equal(capped.gain, 100);
  assert.equal(cap.e.hp, cap.e.maxHp);

  const banned = scene(key, def, [['guard', 1, 2]]);
  banned.e.hp = 1000;
  status.applyStatus(banned.e, 'healFree', { frames: 60 });
  const stopped = play(banned);
  assert.equal(stopped.hits[0].damage, 1000);
  assert.equal(stopped.gain, 0);
  assert.equal(banned.e.hp, 1000);

  const half = scene(key, def, [['guard', 1, 2]]);
  half.e.hp = 1000;
  buffs.addBuff(half.e, buffs.makeBuff({ key: 'taken', mods: { healingTakenMul: 0.5 } }));
  assert.equal(play(half).gain, 750);

  const own = scene(key, def, [['guard', 1, 2]]);
  own.e.hp = 1000;
  buffs.addBuff(own.e, buffs.makeBuff({ key: 'alone', flags: { noAllyHeal: true } }));
  assert.equal(play(own).gain, 1500);
});

test('[敌能-75] three targets heal three times; without the key, or in melee, only one does', () => {
  const nest = 'enemy_1114_rgrdmn_2';
  const many = scene(nest, ranged(nest, { vampire: { ...NEST } }), RING);
  many.e.hp = 1000;
  const got = play(many);
  assert.equal(got.hits.length, 3);
  assert.equal(new Set(got.hits.map((h) => h.target)).size, 3);
  assert.ok(got.hits.every((h) => h.damage === 1000));
  assert.equal(got.gain, 4500);
  const standing = many.w.units.filter((u) => u.kind === KIND.OPERATOR);
  assert.equal(standing.filter((u) => u.hp === u.maxHp).length, 1);

  const heir = 'enemy_1360_dfello';
  const one = scene(heir, ranged(heir, { vampire: { ...HEIR } }), RING);
  one.e.hp = 1000;
  const single = play(one);
  assert.equal(single.hits.length, 1);
  assert.equal(single.gain, 2200);

  const close = scene(heir, melee(heir, { vampire: { ...HEIR } }), [['guard', 1, 2], ['sniper', 2, 2]]);
  close.e.hp = 1000;
  const blocked = play(close);
  assert.equal(blocked.hits.length, 1);
  assert.equal(blocked.hits[0].target, unit(close.w, 'guard').id);
  assert.equal(unit(close.w, 'sniper').hp, unit(close.w, 'sniper').maxHp);
  assert.equal(blocked.gain, 2200);
});

test('[敌能-75] a dodge, a full absorb, or zero damage heals nothing; a partial barrier and overkill use dealt', () => {
  const key = 'enemy_1114_rgrdmn_2';
  const def = ranged(key, { vampire: { ...NEST } });
  const seat = /** @type {[string, number, number][]} */ ([['guard', 1, 2]]);

  const missed = scene(key, def, seat);
  buffs.addBuff(unit(missed.w, 'guard'), buffs.makeBuff({ key: 'dodge', mods: { dodgeArts: 1 } }));
  missed.e.hp = 1000;
  const dodge = play(missed);
  assert.equal(dodge.hits.length, 0);
  assert.equal(dodge.gain, 0);
  assert.equal(unit(missed.w, 'guard').hp, unit(missed.w, 'guard').maxHp);

  const wall = scene(key, def, seat);
  buffs.addBuff(unit(wall.w, 'guard'), buffs.makeBuff({ key: 'barrier', shield: 5000 }));
  wall.e.hp = 1000;
  const absorbed = play(wall);
  assert.equal(absorbed.hits.length, 0);
  assert.equal(absorbed.gain, 0);

  const part = scene(key, def, seat);
  buffs.addBuff(unit(part.w, 'guard'), buffs.makeBuff({ key: 'barrier', shield: 400 }));
  part.e.hp = 1000;
  const left = play(part);
  assert.equal(left.hits.length, 1);
  assert.equal(left.hits[0].damage, 600);
  assert.equal(left.gain, 900);

  const thin = scene(key, def, seat);
  const guard = unit(thin.w, 'guard');
  guard.hp = 100;
  thin.e.hp = 1000;
  const over = play(thin);
  assert.equal(over.hits.length, 1);
  assert.equal(over.hits[0].damage, 1000);
  assert.equal(guard.hp, 0);
  assert.equal(over.gain, 1500);
});

test('[敌能-75] a centurion does not hit a flyer, silence or not; a slime still hits one', () => {
  const nest = 'enemy_1114_rgrdmn_2';
  const box = scene(nest, ranged(nest, { vampire: { ...NEST } }), [['guard', 1, 2], ['sniper', 2, 2]], (c) => {
    c.operators.guard.motion = 'FLY';
  });
  buffs.addBuff(box.e, buffs.makeBuff({ key: 'silence', flags: { silence: true } }));
  assert.equal(attrs.statsOf(box.e).flags.silence, true);
  box.e.hp = 1000;
  const got = play(box);
  assert.equal(got.hits.length, 1);
  assert.equal(got.hits[0].target, unit(box.w, 'sniper').id);
  assert.equal(unit(box.w, 'guard').hp, unit(box.w, 'guard').maxHp);
  assert.equal(got.gain, 1500);

  const slime = 'enemy_1228_dslime';
  const fed = scene(slime, melee(slime, { vampire: { ...HEIR } }), [['guard', 1, 2]], (c) => {
    c.operators.guard.motion = 'FLY';
  });
  fed.e.hp = 1000;
  const bit = play(fed);
  assert.equal(bit.hits.length, 1);
  assert.equal(bit.hits[0].target, unit(fed.w, 'guard').id);
  assert.equal(bit.gain, 2200);
});

test('[敌能-75] only the five read ids are covered; 虹吸巨刃 stays uncovered and does not heal', () => {
  /** @type {[string, Record<string, number>, boolean][]} */
  const read = [
    ['enemy_1114_rgrdmn', { ...NEST }, true],
    ['enemy_1114_rgrdmn_2', { ...NEST }, true],
    ['enemy_1360_dfello', { ...HEIR }, false],
    ['enemy_1228_dslime', { ...HEIR }, false],
    ['enemy_1228_dslime_2', { ...HEIR }, false],
  ];
  for (const [key, bb, fly] of read) {
    const got = withFoeExtras(key, body({ vampire: bb })).talents ?? {};
    assert.equal(got.vampire?.page, 1, key);
    assert.equal(got.vampire?.heal_scale, bb.heal_scale, key);
    assert.equal(fly ? got.noFly !== undefined : got.noFly === undefined, true, key);
    assert.equal(gaps(key, body({ vampire: bb })).includes('vampire'), false, key);
  }
  const blade = 'enemy_15040_dqrdmn';
  const shape = body({ vampire: { ...NEST } }, { applyWay: 'RANGED', rangeRadius: 1.6 });
  assert.equal(gaps(blade, shape).includes('vampire'), true);
  const bare = scene(blade, shape, [['guard', 1, 2]]);
  bare.e.hp = 1000;
  const dry = play(bare);
  assert.equal(dry.hits.length, 1);
  assert.equal(dry.hits[0].damage, 1000);
  assert.equal(dry.gain, 0);

  const extra = body({ vampire: { ...NEST, other: 1 } });
  assert.equal(gaps('enemy_1114_rgrdmn_2', extra).includes('vampire'), true);

  const heir = body({
    DamageUp: { scale_ratio: 0.2, add_on: 1 },
    Summon: /** @type {any} */ ({ cnt: 1, enemy_key: 'enemy_1367_dseed' }),
    vampire: { ...HEIR },
  });
  // Only what this clause decides: whether `Summon` is covered belongs to the 骸骨鞭笞者 family.
  assert.equal(gaps('enemy_1360_dfello', heir).includes('vampire'), false);
  assert.equal(gaps('enemy_1360_dfello', heir).includes('DamageUp'), true);
});

test('[敌能-75] act1multi_07\'s gap list loses vampire', () => {
  assert.equal(Object.hasOwn(LEVELS, 'act1multi_07'), false);
  assert.notEqual(/** @type {any} */ (ig4).testing, true);
  const record = /** @type {EnemyDef} */ (/** @type {any} */ (ig4).enemies.enemy_1114_rgrdmn_2);
  assert.equal(JSON.stringify(/** @type {any} */ (ig4).level.waves).includes('enemy_1114_rgrdmn_2'), true);
  assert.deepEqual(gaps('enemy_1114_rgrdmn_2', record), []);
  assert.equal(levelGaps(ig4).includes('vampire'), false);
});
