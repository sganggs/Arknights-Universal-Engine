// 新手祭司学徒 (docs/spec/foes.md 敌能-58). No AUE level carries it, so the record is built from the game data
// (ArknightsGameData 17759cc8): maxHp 4000, atk 300, Boom.projectile_range 1.2, Boom.heal_scale 5, FillWater dynamic
// 3000. Death heals other enemies in that radius for 500% of the ATK it has then. FillWater and the unread twin stay
// uncovered. A Boom without heal_scale is still the 敌能-5 blast.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, buffs } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent, FOE_EXTRAS } from '../src/index.js';
import { withFoeExtras, withoutIncomplete, uncoveredAbilities } from '../src/foes.js';

/** @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const PRIEST = 'enemy_10156_mncrer', TWIN = 'enemy_10156_mncrer_2';
const ATK = 300, HEAL = ATK * 5;

/** @param {string} key @param {number} maxHp @param {number} atk @returns {EnemyDef} */
function raw(key, maxHp, atk) {
  return {
    name: key, maxHp, atk, def: 100, res: 20, moveSpeed: 0.5, baseAttackTime: 5,
    talents: { Boom: { projectile_range: 1.2, heal_scale: 5 }, FillWater: { projectile_range: 1.2, dynamic: 3000 } },
  };
}

/** @param {string} key @param {number} [maxHp] @returns {EnemyDef} */
const plain = (key, maxHp = 4000) => ({ name: key, maxHp, atk: 0, def: 0, res: 0, moveSpeed: 0.5 });

/** The read priest through the level pipeline (关卡-2, 关卡-8). @returns {EnemyDef} */
const readPriest = () => withoutIncomplete(withFoeExtras(PRIEST, raw(PRIEST, 4000, ATK)));

/**
 * Tiny map. `keys` spawn on frame 0, in that order. Operators deal no damage.
 * @param {Record<string, EnemyDef>} enemies @param {string[]} keys
 */
function field(enemies, keys) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = enemies;
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave(keys.map((k) => spawnAt(0, k)))];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, characterLimit: 9 };
  for (const o of Object.values(c.operators)) Object.assign(o, { cost: 0, maxHp: 1e6, atk: 0 });
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  return { c, w, es: w.units.filter((u) => u.owner < 0) };
}

/** Puts each enemy on its spot, roots it, and (except the first) zeroes its attack. @param {Unit[]} es @param {[number, number, number | null][]} spots */
function arrange(es, spots) {
  for (let i = 0; i < es.length; i++) {
    const u = es[i], [x, y, hp] = spots[i];
    u.x = x;
    u.y = y;
    if (hp !== null) u.hp = hp;
    if (i > 0) u.base.atk = 0;
    status.applyStatus(u, 'root', {});
  }
}

/** Knocks `priest` down and returns the one frame. @param {World} w @param {any} c @param {Unit} priest */
function fell(w, c, priest) {
  priest.hp = 0;
  return step(w, c);
}

/** @param {World} w @param {string} key @returns {Unit | undefined} */
const unit = (w, key) => w.units.find((u) => u.key === key);

test('[敌能-58] 新手祭司学徒: the page marker is on Boom; FillWater stays and is the only uncovered ability', () => {
  const merged = withFoeExtras(PRIEST, raw(PRIEST, 4000, ATK));
  assert.deepEqual(merged.talents?.Boom, { projectile_range: 1.2, heal_scale: 5, page: 1 });
  assert.deepEqual(merged.talents?.FillWater, { projectile_range: 1.2, dynamic: 3000 });
  assert.equal(FOE_EXTRAS[PRIEST].source, 'https://prts.wiki/index.php?title=%E6%96%B0%E6%89%8B%E7%A5%AD%E5%8F%B8%E5%AD%A6%E5%BE%92&oldid=379778');
  assert.deepEqual(uncoveredAbilities([merged]), ['FillWater']);
  const kept = readPriest();
  assert.deepEqual(kept.talents?.Boom, { projectile_range: 1.2, heal_scale: 5, page: 1 });
  assert.ok(kept.talents?.FillWater);
});

test('[敌能-58] 见习祭司学徒: no page, so Boom and FillWater are uncovered, and a stripped Boom does not heal', () => {
  const merged = withFoeExtras(TWIN, raw(TWIN, 5500, 360));
  assert.equal(merged.talents?.Boom.page, undefined);
  assert.deepEqual(uncoveredAbilities([merged]), ['Boom', 'FillWater']);
  const stripped = withoutIncomplete(merged);
  assert.equal(stripped.talents?.Boom, undefined);
  assert.deepEqual(stripped.talents?.FillWater, { projectile_range: 1.2, dynamic: 3000 });
  const { c, w, es } = field({ [TWIN]: stripped, near: plain('near') }, [TWIN, 'near']);
  arrange(es, [[3, 1, null], [4, 1, 100]]);
  fell(w, c, es[0]);
  assert.equal(unit(w, 'near')?.hp, 100);
  assert.equal(w.blasts.length, 0);
});

test('[敌能-58] knocked down: 500% of ATK to other enemies inside 1.2, including flying and stealth; not outside, hidden, neutral, full past the cap, 禁疗, operators, or as a blast', () => {
  const keys = [PRIEST, 'near', 'far', 'edge', 'out', 'fly', 'stealth', 'hidden', 'neutral', 'full', 'capped', 'banned'];
  const enemies = Object.fromEntries(keys.map((k) => [k, k === PRIEST ? readPriest() : plain(k)]));
  const { c, w, es } = field(enemies, keys);
  assert.deepEqual(es.map((u) => u.key), keys);
  // Priest at x = 0 so x + 1.2 is exactly the radius ((3 + 1.2) − 3 rounds just outside). The guard stands on
  // the priest, so the others sit outside its block radius and are not pulled off these points (阻挡-1).
  arrange(es, [
    [0, 1, null], [1, 1, 100], [2, 1, 100], [1.2, 1, 100], [1.25, 1, 100], [0, 2, 100],
    [0, 0, 100], [0.6, 1, 100], [0.4, 1, 100], [0, 1.8, null], [-0.7, 1, 900], [0, 0.3, 100],
  ]);
  const by = Object.fromEntries(es.map((u) => [u.key, u]));
  by.fly.base.motion = 'FLY';
  buffs.addBuff(by.stealth, buffs.makeBuff({ key: 'hide', flags: { stealth: true } }));
  by.neutral.base.neutral = true;
  by.hidden.hidden = true;
  status.applyStatus(by.banned, 'healFree', {});
  by.capped.base.maxHp = 1000;
  by.capped.maxHp = 1000;
  by[PRIEST].base.atk = 0;
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 0, dir: 0 }]]);
  by[PRIEST].base.atk = ATK;
  assert.equal(by[PRIEST].x, 0);
  assert.equal(attrs.statsOf(by[PRIEST]).atk, ATK);
  assert.equal(attrs.statsOf(by.fly).flying, true);
  assert.equal(attrs.statsOf(by.stealth).flags.stealth, true);
  const guard = /** @type {Unit} */ (w.units.find((u) => u.key === 'guard'));
  const guardHp = guard.hp;
  const ev = fell(w, c, by[PRIEST]);
  assert.equal(w.units.some((u) => u.key === PRIEST), false);
  assert.equal(w.blasts.length, 0);
  assert.equal(ev.some((e) => e.type === 'blast'), false);
  const hp = Object.fromEntries([['near', 100 + HEAL], ['far', 100], ['edge', 100 + HEAL], ['out', 100], ['fly', 100 + HEAL],
    ['stealth', 100 + HEAL], ['hidden', 100], ['neutral', 100], ['full', 4000], ['capped', 1000], ['banned', 100]]);
  for (const [k, n] of Object.entries(hp)) assert.equal(unit(w, k)?.hp, n, k);
  assert.equal(guard.hp, guardHp);
});

test('[敌能-58] the heal uses the ATK at knockdown, then the healer and target heal multipliers', () => {
  const { c, w, es } = field({ [PRIEST]: readPriest(), plain: plain('plain', 20000), halved: plain('halved', 20000) }, [PRIEST, 'plain', 'halved']);
  arrange(es, [[3, 1, null], [4, 1, 100], [3, 2, 100]]);
  const [priest, open, halved] = es;
  buffs.addBuff(priest, buffs.makeBuff({ key: 'up', mods: { atkPct: 1, healingDealtMul: 2 } }));
  buffs.addBuff(halved, buffs.makeBuff({ key: 'taken', mods: { healingTakenMul: 0.5 } }));
  assert.equal(attrs.statsOf(priest).atk, ATK * 2);
  fell(w, c, priest);
  assert.equal(open.hp, 100 + ATK * 2 * 5 * 2);
  assert.equal(halved.hp, 100 + ATK * 2 * 5 * 2 * 0.5);
});

test('[敌能-58] silenced, the death heal does not happen', () => {
  const { c, w, es } = field({ [PRIEST]: readPriest(), near: plain('near') }, [PRIEST, 'near']);
  arrange(es, [[3, 1, null], [4, 1, 100]]);
  status.applyStatus(es[0], 'silence', {});
  assert.equal(attrs.statsOf(es[0]).flags.silence, true);
  const ev = fell(w, c, es[0]);
  assert.equal(unit(w, 'near')?.hp, 100);
  assert.equal(w.blasts.length, 0);
  assert.equal(ev.some((e) => e.type === 'blast'), false);
});

/** Frames until `id` reaches the goal, and where it stood as that frame began. @param {World} w @param {any} c @param {number} id */
function untilGoal(w, c, id) {
  for (let i = 0; i < 250; i++) {
    const u = w.units.find((x) => x.id === id);
    const at = { x: u?.x ?? NaN, y: u?.y ?? NaN };
    if (step(w, c).some((e) => e.type === 'goal' && e.id === id)) return at;
  }
  return null;
}

test('[敌能-58] walking into the goal does not heal, even with an enemy inside the radius', () => {
  const fast = raw(PRIEST, 4000, ATK);
  fast.moveSpeed = 5;
  const { c, w, es } = field({ [PRIEST]: withoutIncomplete(withFoeExtras(PRIEST, fast)), ally: plain('ally') }, [PRIEST, 'ally']);
  const [priest, ally] = es;
  ally.x = 4;
  ally.y = 1;
  ally.hp = 100;
  status.applyStatus(ally, 'root', {});
  const at = untilGoal(w, c, priest.id);
  assert.ok(at, `no goal; priest ${priest.x},${priest.y}`);
  const dx = at.x - 4, dy = at.y - 1;
  assert.ok(dx * dx + dy * dy <= 1.2 * 1.2, `left the radius before the goal: ${at.x},${at.y}`);
  assert.equal(ally.hp, 100);
  assert.equal(w.blasts.length, 0);
});

test('[敌能-58] [敌能-5] a Boom without heal_scale still blasts and does not heal an enemy', () => {
  const bom = withoutIncomplete(withFoeExtras('enemy_1385_winbom', {
    name: '喷射罐', maxHp: 1000, atk: 400, def: 0, res: 0, moveSpeed: 1,
    talents: { Boom: { atk_scale: 1, freeze: 10, 'attack@times': 3, 'attack@cooldown': 4, 'attack@attack_cd': 3 } },
  }));
  const bb = bom.talents?.Boom;
  if (!bb) throw new Error('Boom missing');
  assert.equal(bb.heal_scale, undefined);
  assert.deepEqual([bb.radius, bb.delay, bb.arts], [1.55, 0, 1]);
  const { c, w, es } = field({ enemy_1385_winbom: bom, near: plain('near') }, ['enemy_1385_winbom', 'near']);
  arrange(es, [[3, 1, null], [4, 1, 100]]);
  fell(w, c, es[0]);
  const b = w.blasts[0];
  assert.ok(b);
  assert.equal(w.blasts.length, 1);
  assert.deepEqual([b.radius, b.left, b.air, b.type, b.amount, b.src], [1.55, 0, true, 'arts', 400, es[0].id]);
  assert.equal(unit(w, 'near')?.hp, 100);
  step(w, c);
  assert.equal(unit(w, 'near')?.hp, 100);
});
