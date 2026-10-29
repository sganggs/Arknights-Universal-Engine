// Front and back damage reduction (docs/spec/foes.md 敌能-118). None of the five is in an extracted level, so the
// records are the enemy_database 17759cc8 level-0 rows. 箭棘兽 is the football level's row (敌能-91), unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, damage, attrs, status } from '@aue/sim';
import { skeletonContent } from '../src/index.js';
import { uncoveredAbilities, withFoeExtras } from '../src/foes.js';
import football from '../data/levels/act1multi_football.json' with { type: 'json' };

/** @typedef {import('@aue/sim').Unit} Unit */

const AMOUNT = 4000;
const TILE = Object.freeze({ key: 'tile_road', height: 'LOWLAND', buildable: 'ALL', passable: 'ALL', side: 'ALL' });

/**
 * A level-0 row. `resist` is `damage_resistance`. `front` marks the two whose weak side is the back.
 * @typedef {{ key: string, name: string, hp: number, atk: number, def: number, res: number, resist: number, immune?: boolean, quills?: boolean, ranged?: boolean, front?: boolean, raw?: any }} Row
 */

/** @type {Row[]} */
const BACK = [
  { key: 'enemy_1306_mhtrtl', name: '硬甲爪兽', hp: 14000, atk: 600, def: 120, res: 0, resist: 0.8, immune: true },
  { key: 'enemy_1306_mhtrtl_2', name: '刚甲爪兽', hp: 18000, atk: 680, def: 130, res: 0, resist: 0.8, immune: true },
  { key: 'enemy_1310_mhprpn', name: '棘兽', hp: 25000, atk: 580, def: 130, res: 5, resist: 0.75, quills: true, ranged: true },
];
/** @type {Row[]} */
const FRONT = [
  { key: 'enemy_1307_mhrhcr', name: '岩冠兽', hp: 12000, atk: 600, def: 140, res: 0, resist: 0.8, immune: true, front: true },
  { key: 'enemy_1307_mhrhcr_2', name: '坚岩冠兽', hp: 16000, atk: 750, def: 160, res: 0, resist: 0.8, immune: true, front: true },
];

/** @param {string} name */
const operator = (name) => ({ name, position: 'RANGED', cost: 0, blockCnt: 1, baseAttackTime: 1, maxHp: 1e6, atk: 0, def: 0, res: 0, range: [{ row: 0, col: 0 }] });

/** The database row, before the page's `back` or `front` is merged. @param {any} row */
function foe(row) {
  const ranged = row.ranged === true;
  return {
    name: row.name, maxHp: row.hp, atk: row.atk, def: row.def, res: row.res, moveSpeed: 0.7,
    baseAttackTime: ranged ? 3.5 : 4, massLevel: ranged ? 3 : 2, motion: 'WALK',
    applyWay: ranged ? 'RANGED' : 'MELEE', rangeRadius: ranged ? 0.5 : 0,
    ...(row.immune ? { immune: ['silence'] } : {}),
    ...(ranged ? { levelType: 'ELITE' } : {}),
    talents: {
      Weakness: { damage_resistance: row.resist },
      WeaknessUI: { value: 0 },
      ...(row.quills ? { QuillSpray: { hp_ratio: 0.12, atk_scale: 1.2, range_radius: 1.8 } } : {}),
    },
  };
}

/** @param {any} w @param {string} key */
function byKey(w, key) {
  const u = w.units.find((/** @type {Unit} */ x) => x.key === key);
  assert.ok(u, key);
  return /** @type {Unit} */ (u);
}

/**
 * The enemy stands or walks on row 1. Operators are only placed by `place`, a row away, so a melee enemy is not blocked
 * and does not turn toward one.
 * @param {any} row @param {any} route
 */
function open(row, route) {
  const key = row.key;
  const c = /** @type {any} */ ({
    level: {
      id: 'w', width: 8, height: 3, tiles: Array.from({ length: 3 }, () => Array.from({ length: 8 }, () => TILE)),
      routes: [route],
      waves: [{ preDelay: 0, postDelay: 0, maxWait: -1, fragments: [{ preDelay: 0, actions: [{ type: 'SPAWN', key, route: 0, count: 1, preDelay: 0, interval: 1 }] }] }],
      options: { maxLifePoint: 99, initialCost: 99, maxCost: 99, costIncreaseTime: 1, characterLimit: 8, moveMultiplier: 1 },
    },
    enemies: { [key]: withFoeExtras(key, row.raw ? row.raw : foe(row)) },
    operators: { back: operator('back'), front: operator('front'), same: operator('same'), left: operator('left'), right: operator('right') },
    behaviors: skeletonContent.behaviors,
  });
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  return { w, c, e: byKey(w, key) };
}

/** @param {{ w: any, c: any }} box @param {[string, number][]} spots */
function place(box, spots) {
  step(box.w, box.c, spots.map(([op, col]) => /** @type {[number, any]} */ ([0, { type: 'deploy', op, row: 0, col, dir: 0 }])));
}

/** Facing right, held on column 3. `back` is the smaller column. @param {any} row */
function stand(row) {
  const box = open(row, { start: { row: 1, col: 3 }, end: { row: 1, col: 0 }, motion: 'WALK', checkpoints: [{ type: 'WAIT_FOR_SECONDS', row: 1, col: 3, time: 999, dx: 0, dy: 0 }] });
  place(box, [['back', 1], ['same', 3], ['front', 5]]);
  return { ...box, back: byKey(box.w, 'back'), front: byKey(box.w, 'front'), same: byKey(box.w, 'same') };
}

/** Walks column 1 → 6 → 1. `left` is column 0, `right` is column 7. @param {any} row */
function march(row) {
  const box = open(row, {
    start: { row: 1, col: 1 }, end: { row: 1, col: 1 }, motion: 'WALK',
    checkpoints: [{ type: 'MOVE', row: 1, col: 6, time: 0 }, { type: 'MOVE', row: 1, col: 1, time: 0 }],
  });
  place(box, [['left', 0], ['right', 7]]);
  return { ...box, left: byKey(box.w, 'left'), right: byKey(box.w, 'right') };
}

/** HP lost to one hit, after a refill, so DEF and RES cancel in a ratio. @param {{ w: any, c: any, e: Unit }} box @param {Unit | null} src @param {'phys' | 'arts' | 'true'} type @param {boolean} [sourceless] */
function lost(box, src, type, sourceless = false) {
  box.e.hp = box.e.maxHp;
  damage.dealDamage(box.w, src, box.e, sourceless ? { type, amount: AMOUNT, sourceless: true } : { type, amount: AMOUNT }, box.c);
  return box.e.maxHp - box.e.hp;
}

/** @param {number} cut @param {number} full @param {number} resist */
function ratio(cut, full, resist) {
  assert.ok(full > 0 && Math.abs(cut / full - (1 - resist)) < 1e-9, `${cut} / ${full}`);
}

/** The weak side is reduced; the strong side, the same column, no source, and true damage are not. @param {{ w: any, c: any, e: Unit, same: Unit }} box @param {Unit} weak @param {Unit} strong @param {number} resist */
function check(box, weak, strong, resist) {
  const phys = lost(box, strong, 'phys'), arts = lost(box, strong, 'arts');
  ratio(lost(box, weak, 'phys'), phys, resist);
  ratio(lost(box, weak, 'arts'), arts, resist);
  assert.equal(lost(box, box.same, 'phys'), phys);
  assert.equal(lost(box, null, 'phys'), phys);
  assert.equal(lost(box, weak, 'phys', true), phys);
  assert.equal(lost(box, weak, 'true'), AMOUNT);
}

/** @param {Unit} e @param {'backTakenMul' | 'frontTakenMul'} key @param {number} resist */
function taken(e, key, resist) {
  const b = e.buffs.find((x) => x.key === 'weakness');
  assert.ok(b);
  assert.equal(b.left, -1);
  assert.equal(b.mods[key], 1 - resist);
  assert.equal(b.mods[key === 'backTakenMul' ? 'frontTakenMul' : 'backTakenMul'], undefined);
}

/** @param {{ w: any, c: any, e: Unit }} box @param {(e: Unit) => boolean} pred */
function until(box, pred) {
  for (let i = 0; i < 500; i++) {
    step(box.w, box.c);
    if (pred(box.e)) return;
  }
  assert.fail(`still at ${box.e.x}, facing ${box.e.lr === -1 ? 'left' : 'right'}`);
}

test('[敌能-118] 硬甲爪兽, 刚甲爪兽, 棘兽: physical and arts from behind × (1 − damage_resistance); the front, the same column, no source and true damage stay full', () => {
  for (const row of BACK) {
    const box = stand(row);
    assert.equal(box.e.lr, undefined, row.key);
    check(box, box.back, box.front, row.resist);
    taken(box.e, 'backTakenMul', row.resist);
  }
  const held = stand(BACK[0]);
  status.applyStatus(held.e, 'invincible', {});
  held.e.hp = held.e.maxHp;
  assert.equal(damage.dealDamage(held.w, held.back, held.e, { type: 'phys', amount: AMOUNT }, held.c), 0);
  assert.equal(held.e.hp, held.e.maxHp);
});

test('[敌能-118] 岩冠兽, 坚岩冠兽: physical and arts from the front × (1 − damage_resistance); behind, the same column, no source and true damage stay full', () => {
  for (const row of FRONT) {
    const box = stand(row);
    assert.equal(box.e.lr, undefined, row.key);
    check(box, box.front, box.back, row.resist);
    taken(box.e, 'frontTakenMul', row.resist);
  }
});

test('[敌能-118] 棘兽 stays reduced from behind while silenced', () => {
  const box = stand(BACK[2]);
  assert.notEqual(status.applyStatus(box.e, 'silence', { seconds: 8 }), null);
  assert.equal(attrs.statsOf(box.e).flags.silence, true);
  check(box, box.back, box.front, 0.75);
  taken(box.e, 'backTakenMul', 0.75);
});

test('[敌能-118] walking the other way swaps which side is reduced', () => {
  for (const row of [BACK[0], FRONT[0]]) {
    const box = march(row);
    until(box, (e) => e.x > 2 && e.lr !== -1);
    const goingRight = [lost(box, box.left, 'phys'), lost(box, box.right, 'phys')];
    until(box, (e) => e.lr === -1 && e.x < 5);
    const goingLeft = [lost(box, box.left, 'phys'), lost(box, box.right, 'phys')];
    const weakRight = row.front ? 1 : 0;
    ratio(goingRight[weakRight], goingRight[1 - weakRight], row.resist);
    ratio(goingLeft[1 - weakRight], goingLeft[weakRight], row.resist);
  }
});

test('[敌能-118] 箭棘兽 on the football level is still × 0.25 from behind', () => {
  const key = 'enemy_1310_mhprpn_2';
  const raw = /** @type {any} */ (football).enemies[key];
  const merged = withFoeExtras(key, raw);
  assert.equal(merged.talents?.Weakness?.damage_resistance, 0.75);
  assert.equal(merged.talents?.Weakness?.back, 1);
  const box = stand({ key, raw, resist: 0.75 });
  check(box, box.back, box.front, 0.75);
});

/** A damage_resistance-only `Weakness`, as the unread rows have it. `more` adds whole talents (荒原刺背兽's quills). @param {string} name @param {number} resist @param {Record<string, Record<string, number>>} [more] */
function shell(name, resist, more = {}) {
  return /** @type {any} */ ({ name, maxHp: 1000, atk: 100, def: 0, res: 0, moveSpeed: 1, talents: { Weakness: { damage_resistance: resist }, WeaknessUI: { value: 0 }, ...more } });
}

test('[敌能-118] the five are covered; a damage_resistance-only Weakness, and the designers\' weakness, stay uncovered', () => {
  for (const row of [...BACK, ...FRONT]) {
    const def = withFoeExtras(row.key, foe(row));
    assert.equal(def.talents?.Weakness?.[row.front ? 'front' : 'back'], 1, row.key);
    assert.equal(def.talents?.Weakness?.[row.front ? 'back' : 'front'], undefined, row.key);
    assert.deepEqual(uncoveredAbilities([def]), [], row.key);
  }
  /** @type {[string, number][]} */
  const openRows = [
    ['enemy_2085_skzjxd', 0.8], ['enemy_2085_skzjxd_2', 0.8], ['enemy_4007_murino', 0.85], ['enemy_4007_murino_2', 0.95],
    ['enemy_1311_mhkryk', 0.8], ['enemy_1311_mhkryk_2', 0.8], ['enemy_15053_dqtrtl', 0.8], ['enemy_15055_dqrhcr', 0.8],
  ];
  for (const [key, resist] of openRows) assert.deepEqual(uncoveredAbilities([withFoeExtras(key, shell(key, resist))]), ['Weakness'], key);
  const quills = shell('enemy_15054_dqprpn', 0.75, { QuillSpray: { hp_ratio: 0.12, atk_scale: 2.4, range_radius: 2.8 } });
  assert.deepEqual(uncoveredAbilities([quills]), ['Weakness']);
  assert.deepEqual(uncoveredAbilities([/** @type {any} */ ({ talents: { weakness: { damage_resistance: 0.8 } } })]), ['weakness']);
  /** @param {Record<string, number>} bb */
  const shape = (bb) => uncoveredAbilities([/** @type {any} */ ({ talents: { Weakness: bb } })]);
  assert.deepEqual(shape({ damage_resistance: 0.8, back: 1 }), []);
  assert.deepEqual(shape({ damage_resistance: 0.8, front: 1 }), []);
  assert.deepEqual(shape({ damage_resistance: 0.8, back: 1, front: 1 }), ['Weakness']);
  assert.deepEqual(shape({ damage_resistance: 0.8, back: 1, value: 0 }), ['Weakness']);
  assert.deepEqual(shape({ back: 1 }), ['Weakness']);
  assert.deepEqual(shape({ damage_resistance: 0.8 }), ['Weakness']);
  assert.deepEqual(shape({ damage_resistance: 0.8, front: 2 }), ['Weakness']);
});
