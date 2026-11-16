// “邪魔的利刃” and “邪魔的利刃”，游荡者 (docs/spec/foes.md 敌能-141): 【国度】 on the 可部署位 around each ground tile they
// enter, ours there slowed, their hits on ours there × atk_scale. Neither is in a shipped level, so both records are
// built here from enemy_database level 0 (ArknightsGameData 17759cc8), on a 9 × 7 map: one road (row 3) through high
// ground. The blade spawns on the road's start (3, 0) and is then rooted where a test puts it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, stateHash, takeSnapshot, restoreSnapshot, attrs, status, buffs, bus } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras, uncoveredAbilities, withoutIncomplete, FOE_EXTRAS } from '../src/foes.js';
import { REALM } from '../src/blade.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const BLADE = 'enemy_2048_smgrd', WANDERER = 'enemy_2049_smgrd2';

/**
 * enemy_database level 0 (17759cc8) of the two blades; `talents` in place of theirs.
 * @param {string} key @param {Record<string, Record<string, unknown>>} [talents] @returns {EnemyDef}
 */
function record(key, talents) {
  const far = key === WANDERER;
  return /** @type {EnemyDef} */ (/** @type {unknown} */ ({
    name: far ? '“邪魔的利刃”，游荡者' : '“邪魔的利刃”', maxHp: far ? 60000 : 50000, atk: 800, def: 300, res: 30,
    moveSpeed: far ? 0.4 : 0.6, baseAttackTime: 4, rangeRadius: far ? 2 : 2.4, applyWay: 'RANGED', motion: 'WALK', massLevel: 4,
    levelType: 'BOSS', lifePointReduce: 5, immune: ['stun', 'freeze'],
    talents: talents ?? { DamageUp: { atk_scale: 2.5 }, BlackFog: { attack_speed: -50, range_id: far ? 'x-3' : 'x-4' } },
  }));
}

/** An enemy of these talents only. @param {Record<string, Record<string, unknown>>} talents @returns {EnemyDef} */
const named = (talents) => /** @type {EnemyDef} */ (/** @type {unknown} */ ({ name: 'e', maxHp: 100, atk: 100, def: 0, res: 0, moveSpeed: 1, talents }));

/** @param {string} key @param {string} height @param {string} buildable */
const tile = (key, height, buildable) => ({ key, height, buildable, passable: 'ALL', side: 'ALL' });
const W = tile('tile_wall', 'HIGHLAND', 'RANGED'), R = tile('tile_road', 'LOWLAND', 'MELEE');
const S = tile('tile_start', 'LOWLAND', 'NONE'), E = tile('tile_end', 'LOWLAND', 'NONE'), F = tile('tile_floor', 'LOWLAND', 'NONE');

/** @typedef {[string, number, number]} Seat a name, its row and column: melee on the road, ranged on high ground */

/**
 * The map, the blade `key` of `def`, ours of no attack and DEF 300 on `seats` (deployed in the second frame, after the
 * blade was put at `at` [row, col], rooted and its attack held).
 * @param {string} key @param {EnemyDef} def @param {[number, number]} at @param {Seat[]} seats @param {(c: any) => void} [tune]
 */
function scene(key, def, at, seats, tune) {
  const c = /** @type {any} */ (tinyContent());
  const high = () => Array.from({ length: 9 }, () => W);
  c.level = { ...c.level, width: 9, height: 7, tiles: [high(), high(), high(), [S, R, R, R, R, R, R, R, E], high(), high(), high()],
    routes: [{ start: { row: 3, col: 0 }, end: { row: 3, col: 8 }, motion: 'WALK', checkpoints: [] }], waves: [oneWave([spawnAt(0, key)])] };
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 20 };
  c.enemies = { [key]: withFoeExtras(key, def) };
  c.behaviors = skeletonContent.behaviors;
  for (const [name, row] of seats) c.operators[name] = { ...(row === 3 ? c.operators.guard : c.operators.sniper), name, cost: 0, atk: 0, def: 300, res: 0, blockCnt: 0, maxHp: 1e6 };
  tune?.(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = /** @type {Unit} */ (w.units.find((u) => u.key === key));
  put(e, at);
  status.applyStatus(e, 'root', {});
  e.atkCd = 1e6;
  step(w, c, seats.map(([op, row, col]) => [0, { type: 'deploy', op, row, col, dir: 0 }]));
  const of = (/** @type {string} */ name) => /** @type {Unit} */ (w.units.find((u) => u.key === name));
  return { c, w, e, of };
}

/** Puts a unit at the centre of a tile. @param {Unit} u @param {[number, number]} at */
const put = (u, [row, col]) => { u.x = col; u.y = row; };
/** @param {World} w @param {any} c @param {number} n */
const run = (w, c, n) => { for (let i = 0; i < n; i++) step(w, c); };
/** The 【国度】 buffs a unit holds. @param {Unit} u */
const realm = (u) => u.buffs.filter((b) => b.key === REALM);
/** A unit's attack speed now. @param {Unit} u */
const aspd = (u) => attrs.statsOf(u).aspd;
let given = 0;
/** Gives a unit flags or mods by a buff of a key of its own, so two of them both take effect. @param {Unit} u @param {Partial<import('@aue/sim').Buff>} o */
const give = (u, o) => { buffs.addBuff(u, buffs.makeBuff({ key: `test${given++}`, ...o })); };

/**
 * The blade's hits within `n` frames of starting an attack now: [target id, HP taken, the hit's base amount, isAttack,
 * isSkill]. `between` runs after the attack's own frame.
 * @param {ReturnType<typeof scene>} s @param {number} n @param {() => void} [between]
 */
function strike(s, n, between) {
  /** @type {[number, number, number, boolean, boolean][]} */
  const out = [];
  /** @type {Map<number, number>} */
  const base = new Map();
  /** @type {Map<number, [boolean, boolean]>} */
  const kind = new Map();
  const h = bus.on(s.w, 'hit', (k) => { if (k.source === s.e) { base.set(k.target.id, k.dmg.amount); kind.set(k.target.id, [!!k.dmg.isAttack, !!k.dmg.isSkill]); } });
  s.e.atkCd = 0;
  for (let i = 0; i < n; i++) {
    for (const ev of step(s.w, s.c)) {
      if (ev.type !== 'hit' || ev.id !== s.e.id) continue;
      const t = Number(ev.target), [atk, skill] = kind.get(t) ?? [false, false];
      out.push([t, Number(ev.damage), base.get(t) ?? 0, atk, skill]);
    }
    if (i === 0) between?.();
  }
  bus.off(s.w, h);
  s.e.atkCd = 1e6;
  return out;
}

test('[敌能-141] [关卡-2] the two read pages are covered with their marker; the other BlackFog and DamageUp shapes stay uncovered', () => {
  assert.deepEqual(FOE_EXTRAS[BLADE].talents, { DamageUp: { page: 1 } });
  assert.deepEqual(FOE_EXTRAS[WANDERER].talents, { DamageUp: { page: 1 } });
  assert.match(FOE_EXTRAS[BLADE].source, /&oldid=354395$/);
  assert.match(FOE_EXTRAS[WANDERER].source, /&oldid=354396$/);
  for (const key of [BLADE, WANDERER]) {
    assert.deepEqual(uncoveredAbilities([withFoeExtras(key, record(key))]), [], key);
    assert.deepEqual(uncoveredAbilities([record(key)]), ['DamageUp'], `${key} without the marker`);
    assert.deepEqual(Object.keys(withoutIncomplete(record(key)).talents ?? {}), ['BlackFog'], key);
  }
  // 无垠回荡克雷松: the same { atk_scale } and no page read. 追猎者 and 新生血裔: other shapes.
  assert.deepEqual(uncoveredAbilities([withFoeExtras('enemy_2056_smedzi', named({ DamageUp: { atk_scale: 2 } }))]), ['DamageUp']);
  assert.deepEqual(uncoveredAbilities([withFoeExtras('enemy_1520_empgrd', named({ BlackFog: { attack_speed: -50, damage_resistance: 0.5, range_radius: 1.8 } }))]), ['BlackFog']);
  // (新生血裔's own FOE_EXTRAS row is 敌能-75's vampire marker; its DamageUp shape alone, even with a page, is not this)
  assert.deepEqual(uncoveredAbilities([named({ DamageUp: { scale_ratio: 0.2, add_on: 1, page: 1 } })]), ['DamageUp']);
  assert.deepEqual(withFoeExtras('enemy_1360_dfello', named({ DamageUp: { scale_ratio: 0.2, add_on: 1 } })).talents?.DamageUp, { scale_ratio: 0.2, add_on: 1 });
  /** @type {Record<string, unknown>[]} */
  const fogs = [{ attack_speed: '-50', range_id: 'x-4' }, { attack_speed: -50, range_id: 4 }, { attack_speed: -50, range_id: 'x-99' },
    { attack_speed: -50, range_id: 'x-4', page: 1 }, { attack_speed: -50 }, { range_id: 'x-4' }];
  for (const bb of fogs) assert.deepEqual(uncoveredAbilities([named({ BlackFog: bb })]), ['BlackFog'], JSON.stringify(bb));
  /** @type {Record<string, unknown>[]} */
  const ups = [{ atk_scale: '2.5', page: 1 }, { atk_scale: 2.5, page: '1' }, { atk_scale: 2.5, page: 2 }, { atk_scale: 2.5, page: 1, add_on: 1 }];
  for (const bb of ups) assert.deepEqual(uncoveredAbilities([named({ DamageUp: bb })]), ['DamageUp'], JSON.stringify(bb));
  assert.deepEqual(uncoveredAbilities([named({ DamageUp: { atk_scale: 2.5, page: 1 }, BlackFog: { attack_speed: -50, range_id: 'x-4' } })]), []);
});

test('[敌能-141] [敌能-25] entering a road tile lays 【国度】 on the 3×3 of x-4; ours there are lent 攻击速度 −50 under one key', () => {
  /** @type {Seat[]} */
  const seats = [['a', 2, 4], ['b', 4, 5], ['g', 3, 5], ['c', 1, 4], ['d', 2, 6], ['h', 3, 7]];
  const s = scene(BLADE, record(BLADE), [3, 4], seats);
  for (const name of ['a', 'b', 'g']) {
    const u = s.of(name), got = realm(u);
    assert.equal(got.length, 1, name);
    assert.deepEqual([got[0].mods, got[0].src, aspd(u)], [{ aspd: -50 }, s.e.id, 50], name);
  }
  for (const name of ['c', 'd', 'h']) assert.deepEqual([realm(s.of(name)).length, aspd(s.of(name))], [0, 100], name);
  run(s.w, s.c, 60);
  assert.deepEqual(['a', 'b', 'g'].map((n) => realm(s.of(n)).length), [1, 1, 1], 'one lent buff, not one a frame');
  assert.ok(realm(s.of('a'))[0].left <= 2);
  // the number is the blackboard's
  const slower = scene(BLADE, record(BLADE, { DamageUp: { atk_scale: 2.5 }, BlackFog: { attack_speed: -30, range_id: 'x-4' } }), [3, 4], [['a', 2, 4]]);
  assert.deepEqual([realm(slower.of('a'))[0].mods, aspd(slower.of('a'))], [{ aspd: -30 }, 70]);
});

test('[敌能-141] x-3 (游荡者, and any record that names it): the tile and the 24 within three steps', () => {
  /** @type {Seat[]} */
  const seats = [['n3', 0, 4], ['k3', 1, 3], ['s3', 6, 4], ['r3', 3, 7], ['e3', 2, 6], ['out', 1, 2], ['out2', 5, 6], ['out3', 2, 7]];
  /** @type {[string, EnemyDef][]} */
  const both = [[WANDERER, record(WANDERER)], [BLADE, record(BLADE, { DamageUp: { atk_scale: 2.5 }, BlackFog: { attack_speed: -50, range_id: 'x-3' } })]];
  for (const [key, def] of both) {
    const s = scene(key, def, [3, 4], seats);
    assert.deepEqual(seats.map(([n]) => aspd(s.of(n))), [50, 50, 50, 50, 50, 100, 100, 100], key);
  }
  const x4 = scene(BLADE, record(BLADE), [3, 4], seats);
  assert.deepEqual(seats.map(([n]) => aspd(x4.of(n))), [100, 100, 100, 100, 100, 100, 100, 100]);
});

test('[敌能-141] 【国度】 stays where it was laid as the blade moves on, and ends within two frames of its leaving', () => {
  /** @type {Seat[]} */
  const seats = [['old', 2, 3], ['new', 2, 6], ['next', 4, 8]];
  const s = scene(BLADE, record(BLADE), [3, 4], seats);
  assert.deepEqual(seats.map(([n]) => aspd(s.of(n))), [50, 100, 100]);
  put(s.e, [3, 7]);
  step(s.w, s.c);
  assert.deepEqual(seats.map(([n]) => aspd(s.of(n))), [50, 50, 50], 'the old tiles stay, the new ones join');
  assert.deepEqual(seats.map(([n]) => realm(s.of(n)).length), [1, 1, 1]);
  s.e.hp = 0;
  step(s.w, s.c);
  assert.equal(s.w.units.includes(s.e), false);
  assert.deepEqual(seats.map(([n]) => realm(s.of(n)).length), [1, 1, 1], 'a lent buff outlasts one frame');
  step(s.w, s.c);
  assert.deepEqual(seats.map(([n]) => [realm(s.of(n)).length, aspd(s.of(n))]), [[0, 100], [0, 100], [0, 100]]);
});

test('[敌能-141] the first turn counts; a high tile lays nothing; only 可部署位 become 【国度】', () => {
  /** @type {Seat[]} */
  const seats = [['spawn', 2, 1], ['high', 6, 4], ['none', 2, 7], ['wall', 2, 8]];
  const s = scene(BLADE, record(BLADE), [5, 4], seats);
  assert.equal(aspd(s.of('spawn')), 50, 'the spawn tile (3, 0) was entered on its first turn');
  run(s.w, s.c, 5);
  assert.equal(aspd(s.of('high')), 100, 'standing on high ground lays nothing');
  s.c.level.tiles[2][7] = F;
  put(s.e, [3, 7]);
  step(s.w, s.c);
  assert.deepEqual([aspd(s.of('none')), aspd(s.of('wall'))], [100, 50], 'a NONE tile is no 可部署位, whoever stands on it');
  // laid on entering, not each turn: the tile turning deployable under a blade that stays waits for its next tile
  s.c.level.tiles[2][7] = W;
  run(s.w, s.c, 5);
  assert.equal(aspd(s.of('none')), 100);
  put(s.e, [3, 6]);
  step(s.w, s.c);
  assert.equal(aspd(s.of('none')), 50);
});

test('[敌能-141] [路线-4] while 消失 it enters nothing; the turn it shows again counts', () => {
  const s = scene(BLADE, record(BLADE), [3, 4], [['x', 2, 7]]);
  s.e.hidden = true;
  put(s.e, [3, 7]);
  run(s.w, s.c, 3);
  assert.equal(aspd(s.of('x')), 100);
  s.e.hidden = false;
  step(s.w, s.c);
  assert.equal(aspd(s.of('x')), 50);
});

test('[敌能-141] a new row in the same column is a tile entered too (a push across the road)', () => {
  const s = scene(BLADE, record(BLADE), [3, 4], [['up', 1, 4]]);
  assert.equal(aspd(s.of('up')), 100);
  s.c.level.tiles[2][4] = R;
  put(s.e, [2, 4]);
  step(s.w, s.c);
  assert.equal(aspd(s.of('up')), 50);
});

test('[敌能-141] [索敌-2] the slow takes flying and 无敌 ones, not 隐匿, 迷彩, 无法选中, 沉睡 or 起飞 ones, nor a neutral unit', () => {
  /** @type {Seat[]} */
  const seats = [['fly', 2, 3], ['cam', 2, 4], ['inv', 2, 5], ['sth', 4, 3], ['unt', 4, 4], ['lift', 4, 5], ['slp', 3, 5]];
  const s = scene(BLADE, record(BLADE), [3, 4], seats, (c) => {
    c.operators.fly.motion = 'FLY';
    c.enemies.civ = { name: 'civ', maxHp: 1e6, atk: 0, def: 0, res: 0, moveSpeed: 0, neutral: true };
    c.level.waves = [oneWave([spawnAt(0, BLADE), spawnAt(0, 'civ')])];
  });
  assert.equal(attrs.statsOf(s.of('fly')).flying, true);
  give(s.of('cam'), { flags: { camou: true } });
  status.applyStatus(s.of('inv'), 'invincible', { seconds: 100 });
  give(s.of('sth'), { flags: { stealth: true } });
  give(s.of('unt'), { flags: { untargetable: true } });
  give(s.of('lift'), { flags: { liftoff: true } });
  status.applyStatus(s.of('slp'), 'sleep', { seconds: 100 });
  assert.equal(attrs.statsOf(s.of('slp')).flags.sleep, true);
  const civ = s.of('civ');
  put(civ, [3, 3]);
  status.applyStatus(civ, 'root', {});
  run(s.w, s.c, 3);
  assert.deepEqual(seats.map(([n]) => aspd(s.of(n))), [50, 100, 50, 100, 100, 100, 100]);
  assert.deepEqual([realm(civ).length, aspd(civ)], [0, 100]);
});

test('[敌能-141] DamageUp: a hit on ours holding 【国度】 is 攻击力 × 2.5 before the DEF; outside × 1; an attack, not a skill', () => {
  const s = scene(BLADE, record(BLADE), [3, 4], [['in', 2, 5], ['out', 1, 4]]);
  // 嘲讽等级 picks the target (it is held to −2…2): `in` at 2, then −2, then 2 again; `out` stays 0
  give(s.of('in'), { mods: { taunt: 2 } });
  assert.deepEqual(strike(s, 12), [[s.of('in').id, 800 * 2.5 - 300, 2000, true, false]]);
  give(s.of('in'), { mods: { taunt: -4 } });
  assert.deepEqual(strike(s, 12), [[s.of('out').id, 800 - 300, 800, true, false]]);
  // the current 攻击力
  buffs.addBuff(s.e, buffs.makeBuff({ key: 'up', mods: { atkPct: 0.5 } }));
  assert.equal(attrs.statsOf(s.e).atk, 1200);
  give(s.of('in'), { mods: { taunt: 4 } });
  assert.deepEqual(strike(s, 12).map((h) => [h[0], h[1]]), [[s.of('in').id, 1200 * 2.5 - 300]]);
  // the number is the blackboard's
  const two = scene(BLADE, record(BLADE, { DamageUp: { atk_scale: 2 }, BlackFog: { attack_speed: -50, range_id: 'x-4' } }), [3, 4], [['in', 2, 5]]);
  assert.deepEqual(strike(two, 12).map((h) => h[1]), [800 * 2 - 300]);
  // an unread page's DamageUp (无垠回荡克雷松's { atk_scale } without the marker) leaves the hit as it is
  const bare = scene('enemy_2056_smedzi', record(BLADE), [3, 4], [['in', 2, 5]]);
  assert.deepEqual([aspd(bare.of('in')), bare.c.enemies.enemy_2056_smedzi.talents.DamageUp], [50, { atk_scale: 2.5 }]);
  assert.deepEqual(strike(bare, 12).map((h) => h[1]), [800 - 300]);
});

test('[敌能-141] the 倍率 is looked at as the shot arrives; a dodged or 无敌 target takes nothing, a neutral unit × 1', () => {
  // launched at one outside 【国度】, whose tile joins before the shot lands
  const late = scene(BLADE, record(BLADE), [3, 4], [['late', 2, 6]]);
  assert.equal(aspd(late.of('late')), 100);
  assert.deepEqual(strike(late, 12, () => put(late.e, [3, 5])).map((h) => h[1]), [800 * 2.5 - 300]);
  // launched at one in 【国度】 that is 隐匿 before it lands: the shot still hits, the buff is gone by then
  const s = scene(BLADE, record(BLADE), [3, 4], [['p', 2, 4]]);
  assert.deepEqual(strike(s, 12, () => give(s.of('p'), { flags: { stealth: true } })).map((h) => h[1]), [800 - 300]);
  const dodge = scene(BLADE, record(BLADE), [3, 4], [['p', 2, 4]]);
  give(dodge.of('p'), { mods: { dodgePhys: 1 } });
  assert.deepEqual(strike(dodge, 12), []);
  const inv = scene(BLADE, record(BLADE), [3, 4], [['p', 2, 4]]);
  status.applyStatus(inv.of('p'), 'invincible', { seconds: 100 });
  assert.deepEqual(strike(inv, 12), []);
  assert.equal(inv.of('p').hp, 1e6);
  const civ = scene(BLADE, record(BLADE), [3, 4], [], (c) => {
    c.enemies.civ = { name: 'civ', maxHp: 1e6, atk: 0, def: 0, res: 0, moveSpeed: 0, neutral: true };
    c.level.waves = [oneWave([spawnAt(0, BLADE), spawnAt(0, 'civ')])];
  });
  const man = civ.of('civ');
  put(man, [3, 3]);
  status.applyStatus(man, 'root', {});
  assert.deepEqual(strike(civ, 12).map((h) => [h[0], h[1]]), [[man.id, 800]]);
});

test('[敌能-141] silence stops neither talent', () => {
  const s = scene(BLADE, record(BLADE), [3, 4], [['p', 2, 4], ['q', 2, 7]]);
  status.applyStatus(s.e, 'silence', { seconds: 60 });
  assert.equal(attrs.statsOf(s.e).flags.silence, true);
  put(s.e, [3, 6]);
  step(s.w, s.c);
  assert.deepEqual([aspd(s.of('p')), aspd(s.of('q'))], [50, 50]);
  give(s.of('p'), { mods: { taunt: 2 } });
  assert.deepEqual(strike(s, 12).map((h) => h[1]), [800 * 2.5 - 300]);
});

test('[敌能-141] [同步-2] the laid 【国度】 is the blade\'s state: a snapshot runs on the same', () => {
  const s = scene(BLADE, record(BLADE), [3, 4], [['p', 2, 4], ['q', 2, 7]]);
  put(s.e, [3, 7]);
  run(s.w, s.c, 3);
  const copy = restoreSnapshot(JSON.parse(JSON.stringify(takeSnapshot(s.w))));
  run(s.w, s.c, 30);
  run(copy, s.c, 30);
  assert.equal(stateHash(copy), stateHash(s.w));
  const p = /** @type {Unit} */ (copy.units.find((u) => u.key === 'p'));
  assert.deepEqual([realm(p).length, aspd(p)], [1, 50]);
});
