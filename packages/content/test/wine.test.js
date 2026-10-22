// 咸鳞汁推荐者 / 朗姆酒推荐者 (docs/spec/foes.md 敌能-62): the barrel, then one 【免费品尝】 area.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, buffs, stateHash, blocking, KIND } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras, uncoveredAbilities, withoutIncomplete, FOE_EXTRAS } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

const BOOM = { attack_speed: 100, prob: 0.8, fixed_duration: 30, blockee_atk_scale: 2.8 };
const S = attrs.statsOf;
/** @param {Unit} u */
const taste = (u) => u.buffs.find((b) => b.key === 'freeTaste');
/** @param {Unit} u */
const barrel = (u) => u.buffs.find((b) => b.key === 'barrel');

/**
 * @param {string} key @param {number} atk @param {number} hp @param {number} [x] @param {number} [y]
 */
function recommender(key, atk, hp, x = 2, y = 1) {
  return {
    key, x, y,
    def: {
      name: key, maxHp: hp, atk, def: 500, res: 20, moveSpeed: 0.5, baseAttackTime: 3, applyWay: 'MELEE', motion: 'WALK',
      talents: { 1: { move_speed: 3 } },
      skills: [{ key: 'BlockedBoom', cooldown: 0, initCooldown: 0, sp: 0, bb: { ...BOOM } }],
    },
  };
}

/** @param {string} key @param {Record<string, unknown>} [over] @param {number} [x] */
function pawn(key, over = {}, x = 4) {
  return { key, x, y: 1, def: { name: key, maxHp: 1e6, atk: 0, def: 0, res: 0, moveSpeed: 0, motion: 'WALK', ...over } };
}

/**
 * Spawn, root each enemy on its point, then deploy the guard on the recommender's tile. The block is recorded after
 * that frame's talent tick, so the barrel is still unspent when this returns (敌能-62).
 * @param {{ key: string, def: Record<string, unknown>, x: number, y: number }[]} foes
 * @param {{ deploy?: boolean, hurt?: boolean }} [o]
 */
function stand(foes, o = {}) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = Object.fromEntries(foes.map((f) => [f.key, withFoeExtras(f.key, /** @type {any} */ (f.def))]));
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave(foes.map((f) => spawnAt(0, f.key)))];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 8 };
  Object.assign(c.operators.guard, { cost: 0, maxHp: 1e6, atk: 0, def: 0, res: 0 });
  // MANUAL, so the one point of 受击回复 is still there at the end of the frame (an AUTO skill would spend it).
  if (o.hurt) c.operators.guard.skill = { id: 's', type: 'MANUAL', sp: 'hurt', cost: 1, init: 0, charges: 1, duration: 0, ammo: false, bb: {} };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const es = w.units.filter((u) => u.kind === KIND.ENEMY);
  es.forEach((e, i) => {
    const f = foes[i];
    if (!f) throw new Error(`no seat for enemy ${i}`);
    Object.assign(e, { x: f.x, y: f.y, path: [], pt: 0 });
    status.applyStatus(e, 'root', {});
  });
  if (o.deploy !== false) step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 2, dir: 0 }]]);
  return { c, w, es, ops: w.units.filter((u) => u.kind === KIND.OPERATOR) };
}

/** @template T @param {readonly T[]} xs @param {number} [i] @returns {T} */
function at(xs, i = 0) {
  const x = xs[i];
  if (x === undefined) throw new Error(`missing ${i}`);
  return x;
}

/** @param {World} w @param {any} c */
function stepHits(w, c) {
  /** @type {any[]} */
  const ev = [];
  for (const e of step(w, c)) ev.push(e);
  return ev.filter((e) => e.type === 'hit');
}

/** Hits `id` lands over `n` frames, with the frame each one landed. @param {World} w @param {any} c @param {number} id @param {number} n */
function hitLog(w, c, id, n) {
  /** @type {{ f: number, damage: number }[]} */
  const hits = [];
  for (let i = 0; i < n; i++) {
    for (const ev of step(w, c)) {
      if (ev.type !== 'hit' || ev.id !== id) continue;
      hits.push({ f: w.frame - 1, damage: /** @type {any} */ (ev).damage });
    }
  }
  return hits;
}

/** The page-only marker registered for a read enemy. @param {string} key */
function marker(key) {
  const x = FOE_EXTRAS[key];
  if (!x || !x.talents || !x.skills || !x.source) throw new Error(`no marker for ${key}`);
  return x;
}

/** @param {'disarmedCombat' | 'stun'} key */
function postponed(key) {
  const box = stand([recommender('enemy_10044_wintun', 850, 1e6)]);
  const e = at(box.es), g = at(box.ops);
  status.applyStatus(e, key, {});
  step(box.w, box.c);
  assert.equal(g.hp, 1e6);
  assert.equal(S(e).moveSpeed, 1.5);
  assert.equal(S(e).flags.noAttack, true);
  assert.equal(Object.hasOwn(box.w, 'tastings'), false);
  buffs.removeBuff(e, key);
  const hits = stepHits(box.w, box.c);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].damage, 850 * 2.8);
}

test('[敌能-62] carrying: speed ×3 and no attack from appearance; silence keeps both; a removed barrel comes back', () => {
  const quiet = stand([recommender('enemy_10044_wintun', 850, 9000)], { deploy: false });
  const e = at(quiet.es);
  assert.equal(S(e).moveSpeed, 1.5);
  assert.equal(S(e).flags.noAttack, true);
  assert.equal(e.maxHp, 9000);
  buffs.removeBuff(e, 'barrel');
  assert.equal(barrel(e), undefined);
  step(quiet.w, quiet.c);
  assert.equal(S(e).moveSpeed, 1.5);
  assert.equal(S(e).flags.noAttack, true);
  const held = stand([recommender('enemy_10044_wintun', 850, 9000)]);
  const wine = at(held.es), g = at(held.ops);
  assert.equal(g.hp, 1e6, 'the deploy frame is not the smash');
  assert.equal(Object.hasOwn(held.w, 'tastings'), false);
  status.applyStatus(wine, 'silence', {});
  step(held.w, held.c);
  assert.equal(g.hp, 1e6);
  assert.equal(S(wine).moveSpeed, 1.5);
  assert.equal(S(wine).flags.noAttack, true);
});

test('[敌能-62] the first blocked frame spends the barrel: one 280% physical hit, then the area at the blocker\'s tile centre', () => {
  const box = stand([recommender('enemy_10044_wintun', 850, 9000)], { hurt: true });
  const e = at(box.es), g = at(box.ops);
  g.x = 2.2;
  e.x = 2.4;
  /** @type {any[]} */
  const ev = [];
  for (const x of step(box.w, box.c)) ev.push(x);
  const hits = ev.filter((x) => x.type === 'hit' && x.id === e.id);
  assert.deepEqual(hits.map((h) => h.damage), [850 * 2.8]);
  assert.equal(ev.some((x) => x.type === 'attack' && x.id === e.id), false);
  assert.equal(g.skill && g.skill.sp, 1, '受击回复');
  assert.equal(barrel(e), undefined);
  assert.equal(S(e).flags.noAttack, undefined);
  assert.equal(S(e).moveSpeed, 0.5);
  const area = at(box.w.tastings ?? []);
  assert.deepEqual([area.x, area.y, area.radius, area.remain, area.aspd, area.dodge], [2, 1, 2, 899, 100, 0.8]);
  const got = taste(e);
  assert.ok(got);
  assert.equal(got.mods.aspd, 100);
  assert.equal(got.mods.dodgePhys, 0.8);
  assert.equal(S(e).aspd, 200);
});

test('[敌能-62] the hit lands on an unselectable blocker; an invincible one takes none, and the barrel is spent either way', () => {
  const cant = stand([recommender('enemy_10044_wintun', 850, 1e6)], { hurt: true });
  const cg = at(cant.ops);
  buffs.addBuff(cg, buffs.makeBuff({ key: 'cant', flags: { untargetable: true } }));
  const hits = stepHits(cant.w, cant.c);
  assert.deepEqual(hits.map((h) => h.damage), [850 * 2.8]);
  assert.equal(cg.skill && cg.skill.sp, 1);
  assert.equal((cant.w.tastings ?? []).length, 1);
  const inv = stand([recommender('enemy_10044_wintun', 850, 1e6)], { hurt: true });
  const ie = at(inv.es), ig = at(inv.ops);
  status.applyStatus(ig, 'invincible', {});
  assert.equal(stepHits(inv.w, inv.c).length, 0);
  assert.equal(ig.hp, 1e6);
  assert.equal(ig.skill && ig.skill.sp, 0);
  assert.equal(barrel(ie), undefined);
  assert.equal((inv.w.tastings ?? []).length, 1);
});

test('[敌能-62] 缴械 and stun postpone the barrel; the next frame the enemy can act spends it', () => {
  postponed('disarmedCombat');
  postponed('stun');
});

test('[敌能-62] let go, then blocked again: the one barrel is spent the first frame it is already blocked', () => {
  const box = stand([recommender('enemy_10044_wintun', 850, 1e6)]);
  const e = at(box.es), g = at(box.ops);
  status.applyStatus(e, 'silence', {});
  step(box.w, box.c);
  assert.equal(g.hp, 1e6);
  buffs.removeBuff(e, 'silence');
  blocking.release(e);
  e.x = 5;
  step(box.w, box.c);
  assert.equal(e.blockedBy, -1);
  assert.ok(barrel(e));
  e.x = g.x;
  e.y = g.y;
  step(box.w, box.c);
  assert.ok(e.blockedBy >= 0);
  assert.equal(g.hp, 1e6, 'the frame the block starts is not the smash');
  assert.deepEqual(stepHits(box.w, box.c).map((h) => h.damage), [850 * 2.8]);
});

test('[敌能-62] ground enemies inside, including an isolated one, gain +100 ASPD and 80% physical dodge; a flying one and a neutral do not; walking out drops both', () => {
  const box = stand([
    recommender('enemy_10044_wintun', 850, 1e6),
    pawn('ground'), pawn('flyer', { motion: 'FLY' }), pawn('neutral', { neutral: true }), pawn('alone'),
  ]);
  const ground = at(box.es, 1), flyer = at(box.es, 2), neutral = at(box.es, 3), alone = at(box.es, 4);
  buffs.addBuff(alone, buffs.makeBuff({ key: 'alone', flags: { isolated: true } }));
  step(box.w, box.c);
  assert.equal(S(ground).aspd, 200);
  assert.equal(taste(ground)?.mods.dodgePhys, 0.8);
  assert.equal(taste(flyer), undefined);
  assert.equal(S(flyer).aspd, 100);
  assert.equal(taste(neutral), undefined);
  assert.equal(S(alone).aspd, 200);
  assert.equal(S(alone).flags.isolated, true);
  const edge = at(box.w.tastings ?? []).x + 2.1;
  ground.x = edge;
  step(box.w, box.c);
  assert.ok(taste(ground), 'the collider on the circle still counts');
  ground.x = at(box.w.tastings ?? []).x + 2.2;
  step(box.w, box.c);
  assert.equal(taste(ground), undefined);
  assert.equal(S(ground).aspd, 100);
  status.applyStatus(alone, 'levitate', {});
  step(box.w, box.c);
  assert.equal(taste(alone), undefined, '浮空 counts as flying');
  buffs.removeBuff(alone, 'levitate');
  step(box.w, box.c);
  assert.equal(S(alone).aspd, 200);
  status.applyStatus(flyer, 'groundbind', {});
  step(box.w, box.c);
  assert.equal(S(flyer).aspd, 200, '缚地 counts as ground');
  buffs.removeBuff(flyer, 'groundbind');
  step(box.w, box.c);
  assert.equal(taste(flyer), undefined);
});

test('[敌能-62] two areas give one shared buff, not twice the attack speed', () => {
  const box = stand([
    recommender('enemy_10044_wintun', 850, 1e6),
    recommender('enemy_10044_wintun', 850, 1e6),
    pawn('ground'),
  ]);
  step(box.w, box.c);
  const ground = at(box.es, 2);
  assert.equal((box.w.tastings ?? []).length, 2);
  assert.equal(ground.buffs.filter((b) => b.key === 'freeTaste').length, 1);
  assert.equal(S(ground).aspd, 200);
  assert.equal(taste(ground)?.mods.dodgePhys, 0.8);
  assert.equal(S(at(box.es)).aspd, 200);
});

test('[敌能-62] a huge enemy is inside when its rectangle reaches the circle, and out just past it', () => {
  const box = stand([recommender('enemy_10044_wintun', 850, 1e6), pawn('huge')]);
  step(box.w, box.c);
  const huge = at(box.es, 1);
  Object.assign(huge, { hitArea: { w: 2, h: 1, dx: 0, dy: 0 } });
  huge.x = 5;
  step(box.w, box.c);
  assert.equal(S(huge).aspd, 200);
  huge.x = 5.2;
  step(box.w, box.c);
  assert.equal(taste(huge), undefined);
  assert.equal(S(huge).aspd, 100);
});

test('[敌能-62] the area lasts 30 s and stays after the recommender is knocked down', () => {
  const box = stand([recommender('enemy_10044_wintun', 850, 1e6), pawn('ground')]);
  const e = at(box.es), ground = at(box.es, 1);
  step(box.w, box.c);
  assert.equal(at(box.w.tastings ?? []).remain, 899);
  e.hp = 0;
  step(box.w, box.c);
  assert.equal(box.w.units.includes(e), false);
  assert.equal(at(box.w.tastings ?? []).remain, 898);
  assert.equal(S(ground).aspd, 200);
  for (let i = 0; i < 897; i++) step(box.w, box.c);
  assert.equal(at(box.w.tastings ?? []).remain, 1);
  assert.equal(S(ground).aspd, 200);
  step(box.w, box.c);
  assert.equal((box.w.tastings ?? []).length, 0);
  assert.equal(Object.hasOwn(box.w, 'tastings'), true);
  assert.equal(taste(ground), undefined);
  assert.equal(S(ground).aspd, 100);
});

test('[敌能-62] after the barrel the next attack is a 100% melee one base interval later; a later one uses the area\'s attack speed', () => {
  const box = stand([recommender('enemy_10044_wintun', 850, 1e6)]);
  const hits = hitLog(box.w, box.c, at(box.es).id, 160);
  assert.equal(at(hits, 0).damage, 850 * 2.8);
  assert.equal(at(hits, 1).damage, 850);
  assert.equal(at(hits, 2).damage, 850);
  assert.equal(at(hits, 1).f - at(hits, 0).f, attrs.intervalFrames(3, 100));
  assert.equal(at(hits, 2).f - at(hits, 1).f, attrs.intervalFrames(3, 200));
});

test('[敌能-62] 朗姆酒推荐者: atk 1000, the hit is 2800, max HP 10500, the same barrel', () => {
  const box = stand([recommender('enemy_10044_wintun_2', 1000, 10500)], { hurt: true });
  const e = at(box.es), g = at(box.ops);
  assert.equal(e.maxHp, 10500);
  assert.equal(S(e).moveSpeed, 1.5);
  const hits = stepHits(box.w, box.c);
  assert.deepEqual(hits.map((h) => h.damage), [1000 * 2.8]);
  assert.equal(g.skill && g.skill.sp, 1);
  assert.equal(at(box.w.tastings ?? []).radius, 2);
  assert.equal(S(e).moveSpeed, 0.5);
});

test('[敌能-62] 假酒海盗 stays uncovered: no page marker, no ×3, no 280% hit, no area', () => {
  const def = {
    name: 'pirate', maxHp: 1e6, atk: 850, def: 0, res: 0, moveSpeed: 0.5, baseAttackTime: 3,
    talents: { 1: { move_speed: 3 } },
    skills: [{ key: 'BlockedBoom', cooldown: 0, initCooldown: 0, sp: 0, bb: { ...BOOM } }],
  };
  const wrapped = withFoeExtras('enemy_15031_dqhlti', /** @type {any} */ (def));
  assert.equal(FOE_EXTRAS.enemy_15031_dqhlti, undefined);
  assert.deepEqual(uncoveredAbilities([wrapped]), ['1', 'BlockedBoom']);
  const stripped = withoutIncomplete(/** @type {any} */ (wrapped));
  assert.equal(stripped.talents?.['1'], undefined);
  assert.equal(stripped.skills?.length, 0);
  const box = stand([{ key: 'enemy_15031_dqhlti', x: 2, y: 1, def }]);
  const e = at(box.es), g = at(box.ops);
  assert.equal(S(e).moveSpeed, 0.5);
  assert.equal(S(e).flags.noAttack, undefined);
  assert.equal(barrel(e), undefined);
  assert.equal(Object.hasOwn(box.w, 'tastings'), false);
  assert.equal(g.hp, 1e6 - 850, 'the unread shape still attacks at 100% once blocked');
  step(box.w, box.c);
  assert.equal(g.hp, 1e6 - 850);
  assert.equal(Object.hasOwn(box.w, 'tastings'), false);
});

test('[敌能-62] an unread talent `1` stays as it was; the spy\'s ammunition and the two read pages stay covered', () => {
  const slow = { name: 'm', maxHp: 1e6, atk: 100, def: 0, res: 0, moveSpeed: 1, talents: { 1: { move_speed: 0.35 } } };
  assert.deepEqual(uncoveredAbilities([withFoeExtras('enemy_2070_skzfbx', /** @type {any} */ (slow))]), ['1']);
  const wing = { name: 'w', maxHp: 1, atk: 1, def: 0, res: 0, moveSpeed: 1, talents: { 1: { move_speed: 1.2, 'attack@atk_scale': 1 } } };
  assert.deepEqual(uncoveredAbilities([/** @type {any} */ (wing)]), ['1']);
  const box = stand([{ key: 'enemy_2070_skzfbx', x: 2, y: 1, def: slow }]);
  const e = at(box.es);
  assert.equal(S(e).moveSpeed, 1);
  assert.equal(S(e).flags.noAttack, undefined);
  assert.equal(barrel(e), undefined);
  const spy = { name: 's', maxHp: 1, atk: 1, def: 0, res: 0, moveSpeed: 1, talents: { 1: { 'attack@cost': -2, 'attack@sp': -1 } } };
  assert.deepEqual(uncoveredAbilities([withFoeExtras('enemy_1317_wdexg', /** @type {any} */ (spy))]), []);
  const juice = recommender('enemy_10044_wintun', 850, 9000).def;
  const rum = recommender('enemy_10044_wintun_2', 1000, 10500).def;
  assert.deepEqual(uncoveredAbilities([withFoeExtras('enemy_10044_wintun', /** @type {any} */ (juice))]), []);
  assert.deepEqual(uncoveredAbilities([withFoeExtras('enemy_10044_wintun_2', /** @type {any} */ (rum))]), []);
  const juiceMark = marker('enemy_10044_wintun'), rumMark = marker('enemy_10044_wintun_2');
  assert.equal(juiceMark.talents?.['1']?.carry, 1);
  assert.equal(juiceMark.skills?.BlockedBoom?.radius, 2);
  assert.equal(rumMark.skills?.BlockedBoom?.radius, 2);
  assert.match(juiceMark.source, /oldid=362308/);
  assert.match(rumMark.source, /oldid=362309/);
});

/** A match that never pours: one step of the tiny level, nothing else. @returns {World} */
function quiet() {
  const c = tinyContent();
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  return w;
}

test('[敌能-62] a match that never places an area has no tastings key; placing one puts it in the state hash', () => {
  const a = quiet(), b = quiet();
  assert.equal(Object.hasOwn(a, 'tastings'), false);
  assert.equal(Object.hasOwn(b, 'tastings'), false);
  assert.equal(stateHash(a), stateHash(b));
  const box = stand([recommender('enemy_10044_wintun', 850, 1e6)]);
  step(box.w, box.c);
  assert.equal(Object.hasOwn(box.w, 'tastings'), true);
  const hash = stateHash(box.w);
  const saved = box.w.tastings;
  delete box.w.tastings;
  assert.notEqual(stateHash(box.w), hash);
  box.w.tastings = saved;
  assert.equal(stateHash(box.w), hash);
});
