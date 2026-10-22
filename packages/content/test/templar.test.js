// 圣堂剑士 (docs/spec/foes.md 敌能-61): the record is built here — the enemy is not in a shipped level (mod-4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, buffs } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { uncoveredAbilities, withFoeExtras } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

/** 6 s is 180 frames (时间-2). The first try is the 180th turn, so the frame counter reads 180 afterwards. */
const GAP = 180;

/**
 * @param {{ atk?: number, maxHp?: number, move?: number, atkAdd?: number, trigger?: { max_stack_cnt?: number }, ammo?: number }} [o]
 */
function holy(o = {}) {
  const trigger = o.trigger ?? {};
  return {
    name: '圣堂剑士', maxHp: o.maxHp ?? 6000, atk: o.atk ?? 400, def: 350, res: 0, moveSpeed: 1.2,
    applyWay: 'MELEE', rangeRadius: -1, baseAttackTime: 1.3,
    talents: {
      AttributeStorage: { move_speed: 1, atk: 0 },
      SkillTrigger: { interval: 6, max_stack_cnt: trigger.max_stack_cnt ?? 10 },
    },
    skills: [{ key: 'ForeverEnhance', cooldown: 0, initCooldown: 0, sp: 1, bb: { move_speed_add: o.move ?? 0.2, atk_add: o.atkAdd ?? 0.2, ammo: o.ammo ?? 5 } }],
  };
}

/** @param {ReturnType<typeof holy>} def */
function open(def) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { e: def };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, 'e')])];
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = /** @type {Unit} */ (w.units.find((u) => u.key === 'e'));
  status.applyStatus(e, 'root', {});
  return { c, w, e };
}

/** @param {World} w @param {any} c @param {number} n */
const run = (w, c, n) => { for (let i = 0; i < n; i++) step(w, c); };

/** The ammo left (敌能-61). @param {Unit} e */
const ammo = (e) => e.ab['ForeverEnhance.sp'] ?? 0;

/** @param {Unit} e */
const look = (e) => {
  const s = attrs.statsOf(e);
  return { atk: s.atk, move: s.moveSpeed, n: e.buffs.find((b) => b.key === 'forever')?.value ?? 0, left: e.buffs.find((b) => b.key === 'forever')?.left };
};

test('[敌能-61] the three names are covered with the page ammo, and the 技力槽 starts full', () => {
  const def = holy();
  assert.deepEqual(uncoveredAbilities([/** @type {any} */ (def)]), []);
  const bare = { ...def, skills: [{ ...def.skills[0], bb: { move_speed_add: 0.2, atk_add: 0.2 } }] };
  assert.deepEqual(uncoveredAbilities([/** @type {any} */ (bare)]), ['ForeverEnhance'], 'without the page ammo the skill is not covered');
  assert.equal(/** @type {any} */ (withFoeExtras('enemy_10087_hlchgr', /** @type {any} */ (bare))).skills[0].bb.ammo, 5);
  assert.equal(/** @type {any} */ (withFoeExtras('enemy_10087_hlchgr_2', /** @type {any} */ (bare))).skills[0].bb.ammo, 7);
  const { e } = open(def);
  assert.equal(ammo(e), 5);
  assert.deepEqual(look(e), { atk: 400, move: 1.2, n: 0, left: undefined });
});

test('[敌能-61] 圣堂剑士: one layer every 6 s while ammo lasts, then it stops; silence does not', () => {
  const { c, w, e } = open(holy());
  run(w, c, GAP - 2);
  assert.equal(w.frame, GAP - 1);
  assert.equal(look(e).n, 0, 'the first try is one interval after it appears');
  status.applyStatus(e, 'silence', { frames: 10_000 });
  run(w, c, 1);
  assert.equal(w.frame, GAP);
  assert.deepEqual(look(e), { atk: 480, move: 1.44, n: 1, left: -1 });
  assert.equal(ammo(e), 4);
  run(w, c, 1);
  assert.equal(look(e).n, 1, 'a ready cooldown does not trigger the skill by itself');
  run(w, c, GAP * 2 - 1);
  assert.equal(w.frame, GAP * 3);
  assert.deepEqual([look(e).n, look(e).atk, look(e).move], [3, 640, 1.92]);
  run(w, c, GAP * 2);
  assert.equal(w.frame, GAP * 5);
  assert.deepEqual([look(e).n, look(e).atk, look(e).move], [5, 800, 2.4]);
  assert.equal(ammo(e), 0);
  run(w, c, GAP);
  assert.deepEqual([look(e).n, ammo(e)], [5, 0], 'no layer without SP, and the stack cap of 10 is not reached');
});

test('[敌能-61] a try while it cannot act fails without spending; the next wait is another interval', () => {
  const { c, w, e } = open(holy());
  run(w, c, GAP - 2);
  status.applyStatus(e, 'stun', { frames: 10_000 });
  run(w, c, 1);
  assert.equal(w.frame, GAP);
  assert.deepEqual([look(e).n, ammo(e)], [0, 5]);
  buffs.removeBuff(e, 'stun');
  run(w, c, GAP - 1);
  assert.equal(look(e).n, 0, 'the failed try already restarted the interval');
  run(w, c, 1);
  assert.equal(w.frame, GAP * 2);
  assert.deepEqual([look(e).n, look(e).atk, ammo(e)], [1, 480, 4]);
});

test('[敌能-61] extra ammo still stops at max_stack_cnt', () => {
  const { c, w, e } = open(holy({ ammo: 20 }));
  run(w, c, GAP * 10 - 1);
  assert.equal(w.frame, GAP * 10);
  assert.deepEqual([look(e).n, look(e).atk, ammo(e)], [10, 1200, 10]);
  run(w, c, GAP);
  assert.equal(w.frame, GAP * 11);
  assert.deepEqual([look(e).n, ammo(e)], [10, 10]);
});

test('[敌能-61] 精锐圣堂剑士: 7 ammo, 25% a layer, and it stops at 7', () => {
  const { c, w, e } = open(holy({
    atk: 500, move: 0.25, atkAdd: 0.25, trigger: { max_stack_cnt: 15 }, ammo: 7,
  }));
  assert.equal(ammo(e), 7);
  run(w, c, GAP - 1);
  assert.equal(w.frame, GAP);
  assert.deepEqual([look(e).atk, look(e).move, ammo(e)], [625, 1.5, 6]);
  run(w, c, GAP * 3);
  assert.equal(w.frame, GAP * 4);
  assert.deepEqual([look(e).n, look(e).atk, look(e).move], [4, 1000, 2.4]);
  run(w, c, GAP * 3);
  assert.equal(w.frame, GAP * 7);
  assert.deepEqual([look(e).n, look(e).atk, look(e).move], [7, 1375, 3.3]);
  assert.equal(ammo(e), 0);
  run(w, c, GAP);
  assert.equal(w.frame, GAP * 8);
  assert.equal(look(e).n, 7);
});
