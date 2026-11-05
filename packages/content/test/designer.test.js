// The designers' front (docs/spec/foes.md 敌能-132). Neither designer is in an extracted level, so the records are the
// enemy_database 17759cc8 level-0 rows. Their `block` (敌能-65, radio.test.js) is part of the rows and is not changed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, damage, elements, status, attrs } from '@aue/sim';
import { skeletonContent } from '../src/index.js';
import { uncoveredAbilities, withFoeExtras, FOE_EXTRAS } from '../src/foes.js';

/** @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef @typedef {import('@aue/sim').World} World */
/** @typedef {{ w: World, c: any, e: Unit }} Box */

const AMOUNT = 4000;
const TILE = Object.freeze({ key: 'tile_road', height: 'LOWLAND', buildable: 'ALL', passable: 'ALL', side: 'ALL' });

/**
 * What differs between the two level-0 rows (数据 enemy_database 17759cc8): HP, DEF, RES, `block.ep_damage_ratio`; and
 * the page each FOE_EXTRAS row cites.
 * @typedef {{ key: string, name: string, hp: number, def: number, res: number, block: number, oldid: number }} Row
 */
/** @type {readonly Row[]} */
const ROWS = Object.freeze([
  { key: 'enemy_10097_crshd', name: '心虚设计师', hp: 10000, def: 450, res: 30, block: 0.15, oldid: 354167 },
  { key: 'enemy_10097_crshd_2', name: '顺从内心的设计师', hp: 13000, def: 650, res: 40, block: 0.2, oldid: 354168 },
]);

/** Held on column 3 of row 1, facing right as it spawned. */
const STAND = Object.freeze({ start: { row: 1, col: 3 }, end: { row: 1, col: 0 }, motion: 'WALK', checkpoints: [{ type: 'WAIT_FOR_SECONDS', row: 1, col: 3, time: 999, dx: 0, dy: 0 }] });
/** Column 1 → 6 → 1 on row 1. */
const MARCH = Object.freeze({ start: { row: 1, col: 1 }, end: { row: 1, col: 1 }, motion: 'WALK', checkpoints: [{ type: 'MOVE', row: 1, col: 6, time: 0 }, { type: 'MOVE', row: 1, col: 1, time: 0 }] });
/** Column 6 → 0 on row 1, facing left. */
const LEFTWARD = Object.freeze({ start: { row: 1, col: 6 }, end: { row: 1, col: 0 }, motion: 'WALK', checkpoints: [] });

/**
 * A designer's database record, before FOE_EXTRAS; `weakness` replaces the data's blackboard for a shape check.
 * @param {Row} row @param {Record<string, number>} [weakness] @returns {EnemyDef}
 */
function designer(row, weakness = { damage_resistance: 0.8 }) {
  return {
    name: row.name, maxHp: row.hp, atk: 400, def: row.def, res: row.res, moveSpeed: 0.5, baseAttackTime: 1, rangeRadius: -1,
    applyWay: 'NONE', motion: 'WALK', massLevel: 4, levelType: 'ELITE', lifePointReduce: 1, epDamageResistance: 0, epResistance: 0,
    immune: ['silence'], talents: { weakness, block: { ep_damage_ratio: row.block } },
  };
}

/** An operator that deals nothing itself; only `blocker` blocks. @param {string} name @param {number} blockCnt */
const operator = (name, blockCnt) => ({ name, position: 'MELEE', cost: 0, blockCnt, baseAttackTime: 1, maxHp: 1e6, atk: 0, def: 0, res: 0, maxEp: 1e6, range: [{ row: 0, col: 0 }] });

/** @param {World} w @param {string} key @returns {Unit} */
function byKey(w, key) {
  const u = w.units.find((x) => x.key === key);
  assert.ok(u, key);
  return u;
}

/**
 * One enemy on an 8 × 3 road along `route`, its extras merged; operators only where `place` puts them.
 * @param {string} key @param {EnemyDef} def @param {object} route @returns {Box}
 */
function open(key, def, route) {
  const c = /** @type {any} */ ({
    level: {
      id: 'd', width: 8, height: 3, tiles: Array.from({ length: 3 }, () => Array.from({ length: 8 }, () => TILE)),
      routes: [route],
      waves: [{ preDelay: 0, postDelay: 0, maxWait: -1, fragments: [{ preDelay: 0, actions: [{ type: 'SPAWN', key, route: 0, count: 1, preDelay: 0, interval: 1 }] }] }],
      options: { maxLifePoint: 99, initialCost: 99, maxCost: 99, costIncreaseTime: 1, characterLimit: 8, moveMultiplier: 1 },
    },
    enemies: { [key]: withFoeExtras(key, def) },
    operators: Object.fromEntries(['back', 'front', 'same', 'left', 'right'].map((n) => [n, operator(n, 0)]).concat([['blocker', operator('blocker', 1)]])),
    behaviors: skeletonContent.behaviors,
  });
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  return { w, c, e: byKey(w, key) };
}

/** Deploys at once, facing right. @param {Box} box @param {[string, number, number][]} spots operator, row, column */
function place(box, spots) {
  step(box.w, box.c, spots.map(([op, row, col]) => /** @type {[number, any]} */ ([0, { type: 'deploy', op, row, col, dir: 0 }])));
}

/** The events of `n` frames. @param {Box} box @param {number} n */
function frames(box, n) {
  /** @type {any[]} */
  const ev = [];
  for (let i = 0; i < n; i++) ev.push(...step(box.w, box.c));
  return ev;
}

/** @param {Box} box @param {(e: Unit) => boolean} pred */
function until(box, pred) {
  for (let i = 0; i < 1200; i++) {
    if (pred(box.e)) return;
    step(box.w, box.c);
  }
  assert.fail(`still at ${box.e.x}, facing ${box.e.lr === -1 ? 'left' : 'right'}`);
}

/**
 * HP lost to one hit of AMOUNT, after a refill, so DEF and RES cancel in a ratio.
 * @param {Box} box @param {Unit | null} src @param {'phys' | 'arts' | 'true' | 'elemental'} type @param {boolean} [sourceless]
 */
function lost(box, src, type, sourceless = false) {
  box.e.hp = box.e.maxHp;
  damage.dealDamage(box.w, src, box.e, sourceless ? { type, amount: AMOUNT, sourceless: true } : { type, amount: AMOUNT }, box.c);
  return box.e.maxHp - box.e.hp;
}

/** The front's 80% off. @param {number} cut @param {number} full */
function fifth(cut, full) {
  assert.ok(full > 0 && Math.abs(cut / full - 0.2) < 1e-9, `${cut} / ${full}`);
}

/** Standing on column 3, facing right: `back` on column 1, `same` on 3, `front` on 5, all a row away. @param {Row} row */
function stand(row) {
  const box = open(row.key, designer(row), STAND);
  place(box, [['back', 0, 1], ['same', 0, 3], ['front', 0, 5]]);
  return { ...box, back: byKey(box.w, 'back'), same: byKey(box.w, 'same'), front: byKey(box.w, 'front') };
}

test('[敌能-132] the designers are covered with the pages\' front: 1; every other weakness shape stays uncovered and adds nothing', () => {
  for (const row of ROWS) {
    const def = withFoeExtras(row.key, designer(row));
    assert.deepEqual(def.talents?.weakness, { damage_resistance: 0.8, front: 1 }, row.key);
    assert.deepEqual(def.talents?.block, { ep_damage_ratio: row.block }, row.key);
    assert.deepEqual(uncoveredAbilities([def]), [], row.key);
    assert.match(FOE_EXTRAS[row.key].source, new RegExp(`&oldid=${row.oldid}$`), row.key);
    assert.deepEqual(uncoveredAbilities([designer(row)]), ['weakness'], `${row.key} without its page`);
  }
  assert.deepEqual(uncoveredAbilities([designer(ROWS[0], { damage_resistance: 0.8, front: 1 })]), []);
  /** Not the pages' shape. The last two have the marker and two keys but no numeric damage_resistance: none, or a valueStr. */
  const wrong = /** @type {Record<string, number>[]} */ (/** @type {unknown} */ ([
    { damage_resistance: 0.8 }, { damage_resistance: 0.8, back: 1 }, { damage_resistance: 0.8, front: 1, back: 1 }, { damage_resistance: 0.8, front: 2 },
    { damage_resistance: 0.8, front: 1, value: 0 }, { front: 1 }, { value: 0.8, front: 1 }, { damage_resistance: '0.8', front: 1 },
  ]));
  for (const bb of wrong) {
    const def = designer(ROWS[0], bb);
    assert.deepEqual(uncoveredAbilities([def]), ['weakness'], JSON.stringify(bb));
    const bare = open('enemy_bare', def, STAND);
    assert.equal(bare.e.buffs.some((b) => b.key === 'weakness'), false, JSON.stringify(bb));
  }
});

test('[敌能-132] facing right: physical and arts from the front × 0.2; behind, its own column, no source, true, elemental damage and 元素损伤 stay full', () => {
  for (const row of ROWS) {
    const box = stand(row);
    assert.equal(box.e.lr, undefined, row.key);
    const b = box.e.buffs.find((x) => x.key === 'weakness');
    assert.ok(b, row.key);
    assert.equal(b.left, -1);
    assert.ok(Math.abs(b.mods.frontTakenMul - 0.2) < 1e-9);
    assert.equal(b.mods.backTakenMul, undefined);
    for (const type of /** @type {const} */ (['phys', 'arts'])) {
      const full = lost(box, box.back, type);
      fifth(lost(box, box.front, type), full);
      assert.equal(lost(box, box.same, type), full, `${row.key} ${type} same column`);
      assert.equal(lost(box, null, type), full, `${row.key} ${type} no source`);
      assert.equal(lost(box, box.front, type, true), full, `${row.key} ${type} sourceless`);
    }
    assert.equal(lost(box, box.front, 'true'), AMOUNT);
    assert.equal(lost(box, box.front, 'elemental'), AMOUNT);
    assert.equal(elements.dealEp(box.w, box.e, 'SANITY', 100, box.front), 100);
    assert.equal(elements.dealEp(box.w, box.e, 'SANITY', 100, box.back), 100);
  }
});

test('[敌能-132] walking the other way turns the front with it (敌能-90)', () => {
  const box = open(ROWS[1].key, designer(ROWS[1]), MARCH);
  place(box, [['left', 0, 0], ['right', 0, 7]]);
  const left = byKey(box.w, 'left'), right = byKey(box.w, 'right');
  until(box, (e) => e.x > 2 && e.lr !== -1);
  fifth(lost(box, right, 'phys'), lost(box, left, 'phys'));
  until(box, (e) => e.lr === -1 && e.x < 5);
  fifth(lost(box, left, 'phys'), lost(box, right, 'phys'));
});

test('[敌能-132] blocked from behind, it turns to its blocker: the blocker\'s side becomes the front, and no attack turns it back', () => {
  for (const row of ROWS) {
    const box = open(row.key, designer(row), LEFTWARD);
    until(box, (e) => e.x < 4.45);
    assert.equal(box.e.lr, -1, row.key);
    place(box, [['blocker', 1, 5], ['left', 0, 2], ['right', 0, 7]]);
    const blocker = byKey(box.w, 'blocker'), left = byKey(box.w, 'left'), right = byKey(box.w, 'right');
    frames(box, 2);
    assert.equal(box.e.blockedBy, blocker.id, row.key);
    assert.equal(box.e.lr, undefined, row.key);
    const full = lost(box, left, 'phys');
    fifth(lost(box, blocker, 'phys'), full);
    fifth(lost(box, right, 'phys'), full);
    const ev = frames(box, 60);
    assert.equal(ev.filter((x) => x.type === 'attack' && x.id === box.e.id).length, 0, row.key);
    assert.equal(box.e.lr, undefined, row.key);
    assert.equal(box.e.blockedBy, blocker.id, row.key);
  }
});

test('[敌能-132] stun and freeze leave the front on; silence does not take effect (状态-7)', () => {
  const box = stand(ROWS[0]);
  for (const key of /** @type {const} */ (['silence', 'stun', 'freeze'])) assert.notEqual(status.applyStatus(box.e, key, { seconds: 5 }), null, key);
  const flags = attrs.statsOf(box.e).flags;
  assert.notEqual(flags.silence, true);
  assert.equal(flags.stun, true);
  fifth(lost(box, box.front, 'arts'), lost(box, box.back, 'arts'));
  frames(box, 200);
  assert.equal(attrs.statsOf(box.e).flags.stun, undefined);
  fifth(lost(box, box.front, 'phys'), lost(box, box.back, 'phys'));
});
