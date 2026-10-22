// 碎骨's grenade (docs/spec/foes.md 敌能-70). The 26%, the 3×3 and the 5 s are page-only extras. A flat `defdown`
// (−10 / −15) is another ability and stays uncovered (关卡-2). `atkup` is 敌能-8 and is not changed here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, buffs, bus, KIND } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras, uncoveredAbilities } from '../src/foes.js';
import rm01 from '../data/levels/act1multi_fortress_rm01.json' with { type: 'json' };
import hard01 from '../data/levels/act1multi_fortress_hard-01.json' with { type: 'json' };

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */
/** @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const KEY = 'enemy_1500_skulsr';
/** Flat `defdown` users (enemy_database 17759cc8). None of these is the grenade. @type {[string, number][]} */
const FLAT = [
  ['enemy_1004_mslime', -10], ['enemy_1004_mslime_2', -15], ['enemy_1095_ccripr', -10],
  ['enemy_1095_ccripr_2', -15], ['enemy_5028_dqlime_2', -15], ['enemy_5047_dqripr', -10],
];
/** Ground target, a closer flyer, a diagonal neighbour, a tile two away. @type {[string, number, number][]} */
const FIELD = [['sniper', 0, 3], ['bird', 0, 2], ['side', 1, 4], ['far', 2, 3]];

/** @param {Record<string, Record<string, number>>} [talents] @returns {EnemyDef} */
function skull(talents) {
  return {
    name: '碎骨', maxHp: 10000, atk: 1000, def: 0, res: 0, moveSpeed: 0, baseAttackTime: 3, rangeRadius: 2.6, applyWay: 'ALL', motion: 'WALK',
    talents: talents ?? { atkup: { atk: 0.5, hp_ratio: 0.5 }, defdown: { def: -0.5 } },
  };
}

/** @param {Record<string, Record<string, number>>} talents @returns {EnemyDef} */
const named = (talents) => ({ name: 'e', maxHp: 100, atk: 100, def: 0, res: 0, moveSpeed: 1, talents });

/**
 * 碎骨 stands on the road. The first attack waits out the deploy step.
 * @param {[string, number, number][]} seats @param {(c: any) => void} [tune]
 */
function stand(seats, tune) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [KEY]: withFoeExtras(KEY, skull()) };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, KEY)])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 8 };
  const quiet = { cost: 0, atk: 0, def: 0, res: 0, blockCnt: 0, maxHp: 5000 };
  Object.assign(c.operators.guard, quiet);
  Object.assign(c.operators.sniper, quiet, { tauntLevel: 1 });
  c.operators.bird = { ...c.operators.sniper, name: 'bird', motion: 'FLY', tauntLevel: 0 };
  c.operators.far = { ...c.operators.sniper, name: 'far', tauntLevel: 0 };
  c.operators.side = { ...c.operators.guard, name: 'side' };
  tune?.(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = /** @type {Unit} */ (w.units.find((u) => u.kind === KIND.ENEMY));
  Object.assign(e, { x: 2, y: 1, path: [], pt: 0 });
  status.applyStatus(e, 'root', {});
  e.atkCd = 40;
  if (seats.length) step(w, c, seats.map(([op, row, col]) => [0, { type: 'deploy', op, row, col, dir: 0 }]));
  return { c, w, e };
}

/** @param {ReturnType<typeof stand>} box */
const strike = (box) => { box.e.atkCd = 0; return /** @type {any[]} */ (step(box.w, box.c)); };
/** Hold the attack off for `n` frames so the debuff can decay. @param {ReturnType<typeof stand>} box @param {number} n */
function hold(box, n) {
  box.e.atkCd = 1000;
  for (let i = 0; i < n; i++) step(box.w, box.c);
}
/** @param {World} w @param {number} x @param {number} y */
function operatorAt(w, x, y) {
  const u = w.units.find((o) => o.kind === KIND.OPERATOR && o.x === x && o.y === y);
  if (!u) throw new Error(`no operator at ${x},${y}`);
  return u;
}
/** @param {any[]} ev @param {number} id */
const hitsOf = (ev, id) => ev.filter((x) => x.type === 'hit' && x.id === id);
/** @param {Unit} u @param {number} id */
const rider = (u, id) => u.buffs.filter((b) => b.key === `hitDebuff:${id}`);
/** @param {number} got @param {number} want */
const near = (got, want) => Math.abs(got - want) < 1e-6;

/** A grenade that dealt nothing still leaves the DEF loss (推断 INF-0507). @param {(s: Unit) => void} prep */
function still(prep) {
  const box = stand([['sniper', 0, 3]]);
  const s = operatorAt(box.w, 3, 0);
  const hp = s.hp;
  prep(s);
  const ev = strike(box);
  assert.equal(s.hp, hp);
  assert.equal(hitsOf(ev, box.e.id).length, 0);
  const got = rider(s, box.e.id);
  assert.equal(got.length, 1);
  assert.equal(got[0].mods.defPct, -0.5);
  assert.equal(got[0].mods.defMul, undefined);
}

test('[敌能-70] [关卡-2] fortress 碎骨 takes the grenade shape; the other defdown shapes stay uncovered', () => {
  for (const lv of [rm01, hard01]) {
    const raw = /** @type {EnemyDef} */ (/** @type {any} */ (lv).enemies[KEY]);
    assert.equal(raw.applyWay, 'ALL');
    assert.equal(raw.rangeRadius, 2.6);
    assert.deepEqual(raw.talents?.atkup, { atk: 0.5, hp_ratio: 0.5 });
    assert.deepEqual(raw.talents?.defdown, { def: -0.5 });
    const merged = withFoeExtras(KEY, raw);
    assert.deepEqual(merged.talents?.defdown, { def: -0.5, scale: 0.26, duration: 5, square: 1 });
    assert.deepEqual(merged.talents?.noFly, {});
    assert.deepEqual(uncoveredAbilities([merged]), []);
    assert.deepEqual(uncoveredAbilities([raw]), ['defdown']);
  }
  for (const [key, def] of FLAT) {
    const e = withFoeExtras(key, named({ defdown: { def } }));
    assert.deepEqual(e.talents?.defdown, { def }, key);
    assert.deepEqual(uncoveredAbilities([e]), ['defdown'], key);
  }
  assert.deepEqual(uncoveredAbilities([named({ defdown: { def: -10, scale: 0.26, duration: 5, square: 1 } })]), ['defdown']);
  assert.deepEqual(uncoveredAbilities([named({ defdown: { def: -0.5 } })]), ['defdown']);
});

test('[敌能-70] [敌人攻击-1] blocked: melee at 100% on the blocker, no splash, no debuff, no shot', () => {
  const box = stand([['guard', 1, 2], ['sniper', 0, 3]], (c) => { c.operators.guard.blockCnt = 2; });
  const g = operatorAt(box.w, 2, 1), s = operatorAt(box.w, 3, 0);
  assert.equal(box.e.blockedBy, g.id);
  const ev = strike(box);
  const hits = hitsOf(ev, box.e.id);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].target, g.id);
  assert.equal(hits[0].damage, 1000);
  assert.equal(rider(g, box.e.id).length, 0);
  assert.equal(rider(s, box.e.id).length, 0);
  assert.equal(s.hp, s.maxHp);
  assert.equal(ev.some((x) => x.type === 'shot' && x.id === box.e.id), false);
  assert.equal(ev.some((x) => x.type === 'attack' && x.id === box.e.id && x.target !== g.id), false);
});

test('[敌能-70] [敌能-26] [敌能-33] [攻击-3] unblocked grenade is 26% on the ground target and the 3×3, including a flyer', () => {
  const box = stand(FIELD, (c) => { for (const op of Object.values(c.operators)) /** @type {any} */ (op).res = 90; });
  assert.equal(box.e.blockedBy, -1);
  /** @type {[number, string][]} */
  const kinds = [];
  bus.on(box.w, 'attackHit', (ctx) => { if (ctx.attacker.id === box.e.id) kinds.push([ctx.target.id, ctx.kind]); });
  const ev = strike(box);
  const main = operatorAt(box.w, 3, 0), bird = operatorAt(box.w, 2, 0), side = operatorAt(box.w, 4, 1), far = operatorAt(box.w, 3, 2);
  const attacks = ev.filter((x) => x.type === 'attack' && x.id === box.e.id);
  const hits = hitsOf(ev, box.e.id), of = (/** @type {number} */ id) => hits.filter((h) => h.target === id);
  const dealt = 1000 * 0.26;
  assert.deepEqual([attacks.length, attacks[0].target, attrs.statsOf(main).flying, attrs.statsOf(bird).flying], [1, main.id, false, true]);
  assert.equal(of(main.id).length, 1);
  assert.ok(near(of(main.id)[0].damage, dealt));
  assert.equal(of(bird.id)[0].damage, of(main.id)[0].damage);
  assert.equal(of(side.id)[0].damage, of(main.id)[0].damage);
  assert.equal(of(far.id).length, 0);
  assert.equal(far.hp, far.maxHp);
  assert.equal(ev.some((x) => x.type === 'shot' && x.id === box.e.id), false);
  assert.deepEqual(kinds.filter((k) => k[0] === main.id).map((k) => k[1]), ['main']);
  assert.deepEqual(kinds.filter((k) => k[0] === bird.id).map((k) => k[1]), ['splash']);
  assert.deepEqual(kinds.filter((k) => k[0] === side.id).map((k) => k[1]), ['splash']);
});

test('[敌能-70] [敌能-33] a flyer alone is not the main target, so it is not attacked', () => {
  const box = stand([['bird', 0, 2]]);
  const bird = operatorAt(box.w, 2, 0);
  const hp = bird.hp;
  const ev = strike(box);
  assert.equal(attrs.statsOf(bird).flying, true);
  assert.equal(ev.some((x) => x.type === 'attack' && x.id === box.e.id), false);
  assert.equal(hitsOf(ev, box.e.id).length, 0);
  assert.equal(bird.hp, hp);
  assert.equal(rider(bird, box.e.id).length, 0);
});

test('[敌能-70] DEF −50% is defPct for 5 s, and a second grenade refreshes it', () => {
  const box = stand([['sniper', 0, 3]], (c) => { c.operators.sniper.def = 200; });
  const s = operatorAt(box.w, 3, 0);
  const ev = strike(box);
  const amt = 1000 * 0.26;
  assert.ok(near(hitsOf(ev, box.e.id)[0].damage, Math.max(amt * 0.05, amt - 200)));
  let got = rider(s, box.e.id);
  assert.equal(got.length, 1);
  assert.equal(got[0].mods.defPct, -0.5);
  assert.equal(got[0].mods.defMul, undefined);
  assert.equal(got[0].left, 150);
  assert.equal(attrs.statsOf(s).def, 100);
  hold(box, 40);
  assert.equal(rider(s, box.e.id)[0].left, 110);
  strike(box);
  got = rider(s, box.e.id);
  assert.equal(got.length, 1);
  assert.equal(got[0].left, 150);
  assert.equal(got[0].mods.defPct, -0.5);
  assert.equal(attrs.statsOf(s).def, 100);
  hold(box, 149);
  assert.equal(rider(s, box.e.id)[0].left, 1);
  hold(box, 1);
  assert.equal(rider(s, box.e.id).length, 0);
  assert.equal(attrs.statsOf(s).def, 200);
});

test('[敌能-70] a dodged grenade and a grenade that deals 0 still apply the DEF loss', () => {
  still((s) => { buffs.addBuff(s, buffs.makeBuff({ key: 'dodge', mods: { dodgePhys: 1 } })); });
  still((s) => { buffs.addBuff(s, buffs.makeBuff({ key: 'wall', shieldHits: 1 })); });
});

test('[敌能-70] invincible still receives the DEF loss; a killing grenade leaves none', () => {
  still((s) => {
    status.applyStatus(s, 'invincible', { seconds: 10 });
    assert.equal(attrs.statsOf(s).invincible, true);
  });
  const box = stand([['sniper', 0, 3]], (c) => { c.operators.sniper.maxHp = 100; });
  const s = operatorAt(box.w, 3, 0);
  let hp = -1, left = -1;
  bus.on(box.w, 'attackHit', (ctx) => {
    if (ctx.attacker.id !== box.e.id || ctx.kind !== 'main') return;
    hp = ctx.target.hp;
    left = rider(ctx.target, box.e.id).length;
  });
  strike(box);
  assert.equal(hp, 0);
  assert.equal(left, 0);
  assert.equal(s.hp, 0);
  assert.equal(box.w.units.includes(s), false);
});

test('[敌能-70] [敌能-8] silence does not stop the grenade; HP at or below half still raises ATK', () => {
  const box = stand([['sniper', 0, 3]]);
  status.applyStatus(box.e, 'silence', { seconds: 30 });
  assert.equal(attrs.statsOf(box.e).flags.silence, true);
  assert.equal(box.e.base.immune.includes('silence'), false);
  box.e.hp = 4999;
  const ev = strike(box);
  const up = box.e.buffs.find((b) => b.key === 'atkup');
  assert.equal(up?.mods.atkPct, 0.5);
  assert.equal(attrs.statsOf(box.e).atk, 1500);
  assert.ok(near(hitsOf(ev, box.e.id)[0].damage, 1500 * 0.26));
  box.e.hp = 5001;
  hold(box, 1);
  assert.equal(box.e.buffs.some((b) => b.key === 'atkup'), false);
  box.e.hp = 5000;
  hold(box, 1);
  assert.equal(box.e.buffs.find((b) => b.key === 'atkup')?.mods.atkPct, 0.5);
});

test('[敌能-70] a flat def on 碎骨, even with the page keys merged on, is not the grenade', () => {
  const box = stand([['sniper', 0, 3]], (c) => {
    c.enemies[KEY] = withFoeExtras(KEY, skull({ defdown: { def: -10 } }));
  });
  assert.deepEqual(box.c.enemies[KEY].talents.defdown, { def: -10, scale: 0.26, duration: 5, square: 1 });
  assert.deepEqual(uncoveredAbilities([box.c.enemies[KEY]]), ['defdown']);
  const s = operatorAt(box.w, 3, 0);
  const ev = strike(box);
  assert.equal(hitsOf(ev, box.e.id).map((h) => h.damage).join(','), '1000');
  assert.equal(rider(s, box.e.id).length, 0);
});
