// 隐匿 in the battle (docs/spec/targeting.md 索敌-2, traits.md 职业-8 / 职业-11 / 职业-31 / 职业-35, foes.md 敌能-3 / 敌能-7):
// the restore window on both release paths, splash and chains, tile splash, deployment circles, a timed blast.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step, stateHash, takeSnapshot, restoreSnapshot, targeting } from '../src/index.js';
import { makeEnemy, makeOperator } from '../src/units.js';
import { applyStatus } from '../src/status.js';
import { statsOf } from '../src/attrs.js';
import { addBuff, makeBuff } from '../src/buffs.js';
import { foeSpawn } from '../src/foes.js';

/** @typedef {import('../src/types.js').World} World @typedef {import('../src/types.js').Unit} Unit */

/**
 * The tiny level without waves, a second guard `g2`, cost enough. `tweak` runs before the world exists.
 * @param {(c: any) => void} [tweak]
 */
function arena(tweak) {
  const c = tinyContent();
  c.level.waves = [];
  c.level.options = { ...c.level.options, characterLimit: 9, initialCost: 99, maxCost: 99 };
  c.operators.g2 = { ...c.operators.guard, trait: { noAttack: true }, range: [{ row: 0, col: 5 }] };
  tweak?.(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  return { w, c };
}

/** A rooted enemy at (row, col), defence 0, not walking. @param {World} w @param {any} c @param {number} row @param {number} col */
function foe(w, c, row, col) {
  const e = makeEnemy(w, c, { key: 'slime', route: 0 });
  e.x = col;
  e.y = row;
  e.base = { ...e.base, maxHp: 1e6, def: 0, res: 0, moveSpeed: 0 };
  e.hp = e.maxHp = statsOf(e).maxHp;
  applyStatus(e, 'root', {});
  w.units.push(e);
  return e;
}

/** @param {World} w @param {any} c @param {number} n @param {any[]} [cmds] */
function run(w, c, n, cmds = []) {
  const first = /** @type {[number, any][]} */ (cmds.map((x) => (Array.isArray(x) ? x : [0, x])));
  /** @type {any[]} */
  const out = [];
  for (let i = 0; i < n; i++) for (const e of step(w, c, i === 0 ? first : [])) out.push(e);
  return out;
}

/** @param {string} op @param {number} row @param {number} col */
const deploy = (op, row, col) => ({ type: 'deploy', op, row, col, dir: 0 });
/** @param {Unit} u @param {string} [key] */
const hide = (u, key = 'hide') => addBuff(u, makeBuff({ key, flags: { stealth: true } }));
/** @param {Unit} u @param {string} [key] */
const off = (u, key = 'hide') => u.buffs.find((b) => b.key === `stealthOff:${key}`);
/** @param {Unit} u */
const camou = (u) => addBuff(u, makeBuff({ key: 'camo', flags: { camou: true } }));

/** A stealthed enemy blocked on the guard's tile. Retreat and a fallen blocker both start from here. */
function held() {
  const { w, c } = arena((cc) => { cc.operators.guard.range = [{ row: 0, col: 5 }]; });
  const g = /** @type {Unit} */ (run(w, c, 1, [deploy('guard', 1, 1)]) && w.units[0]);
  const e = foe(w, c, 1, 1);
  hide(e);
  run(w, c, 1);
  assert.equal(e.blockedBy, g.id);
  assert.equal(targeting.stealthed(e), false);
  return { w, c, g, e };
}

test('[索敌-2] a retreat counts the release frame; 隐匿 returns on the 90th tick', () => {
  const { w, c, e } = held();
  assert.equal(targeting.selectable(e), true, 'blocked, so selectable');
  run(w, c, 1, [{ type: 'retreat', unit: /** @type {Unit} */ (w.units[0]).id }]);
  assert.equal(off(e)?.left, 89);
  assert.equal(targeting.stealthed(e), false);
  run(w, c, 88);
  assert.equal(off(e)?.left, 1);
  assert.equal(targeting.stealthed(e), false);
  run(w, c, 1);
  assert.equal(off(e), undefined);
  assert.equal(targeting.stealthed(e), true);
  assert.equal(targeting.selectable(e), false);
});

test('[索敌-2] a blocker falling releases after 状态结算, so that frame is not one of the 90', () => {
  const { w, c, g, e } = held();
  g.hp = 0;
  run(w, c, 1);
  assert.equal(e.blockedBy, -1);
  assert.equal(off(e)?.left, 90);
  assert.equal(targeting.stealthed(e), false);
  run(w, c, 89);
  assert.equal(off(e)?.left, 1);
  assert.equal(targeting.stealthed(e), false);
  run(w, c, 1);
  assert.equal(targeting.stealthed(e), true);
});

test('[索敌-2] blocking again refills the window on the next release', () => {
  const { w, c, e } = held();
  const g = /** @type {Unit} */ (w.units[0]);
  run(w, c, 1, [{ type: 'retreat', unit: g.id }]);
  assert.equal(off(e)?.left, 89);
  run(w, c, 1, [deploy('g2', 1, 1)]);
  const g2 = w.units.find((u) => u.key === 'g2');
  assert.equal(e.blockedBy, g2?.id);
  assert.equal(off(e)?.left, 88);
  run(w, c, 1, [{ type: 'retreat', unit: /** @type {number} */ (g2?.id) }]);
  assert.equal(off(e)?.left, 89);
});

test('[索敌-2] [同步-2] a snapshot in the window keeps the countdown', () => {
  const { w, c, e } = held();
  run(w, c, 1, [{ type: 'retreat', unit: /** @type {Unit} */ (w.units[0]).id }]);
  run(w, c, 10);
  assert.equal(off(e)?.left, 79);
  const copy = restoreSnapshot(JSON.parse(JSON.stringify(takeSnapshot(w))));
  assert.equal(stateHash(copy), stateHash(w));
  run(w, c, 78);
  run(copy, c, 78);
  const e2 = /** @type {Unit} */ (copy.units.find((u) => u.id === e.id));
  assert.equal(off(e)?.left, 1);
  assert.equal(off(e2)?.left, 1);
  assert.equal(targeting.stealthed(e), false);
  assert.equal(targeting.stealthed(e2), false);
  run(w, c, 1);
  run(copy, c, 1);
  assert.equal(targeting.stealthed(e), true);
  assert.equal(targeting.stealthed(e2), true);
  assert.equal(stateHash(copy), stateHash(w));
});

test('[职业-8] [索敌-2] a splash skips 隐匿 and still hits 迷彩; a blocked 隐匿 enemy is hit', () => {
  const { w, c } = arena((cc) => {
    cc.operators.guard.trait = { splash: { radius: 1, scale: 0.5, ground: false } };
    cc.operators.guard.range = [{ row: 0, col: 1 }];
  });
  run(w, c, 1, [deploy('guard', 1, 1), deploy('g2', 1, 4)]);
  const g2 = /** @type {Unit} */ (w.units.find((u) => u.key === 'g2'));
  const main = foe(w, c, 1, 2), hid = foe(w, c, 2, 2), cam = foe(w, c, 1, 3), heldFoe = foe(w, c, 0, 2);
  hide(hid);
  hide(heldFoe);
  camou(cam);
  heldFoe.blockedBy = g2.id;
  const hits = run(w, c, 1).filter((e) => e.type === 'hit').map((e) => [e.target, e.damage]);
  assert.deepEqual(hits, [[main.id, 50], [cam.id, 25], [heldFoe.id, 25]]);
  assert.equal(hid.hp, hid.maxHp);
});

test('[职业-11] [索敌-2] a damage chain jumps to 迷彩 and skips 隐匿', () => {
  const { w, c } = arena((cc) => {
    cc.operators.guard.trait = { chain: { max: 4, scale: 0.5, radius: 1.7, cells: null } };
    cc.operators.guard.range = [{ row: 0, col: 1 }];
  });
  const g = /** @type {Unit} */ (run(w, c, 1, [deploy('guard', 1, 1)]) && w.units[0]);
  const a = foe(w, c, 1, 2), cam = foe(w, c, 2, 2), hid = foe(w, c, 2, 3);
  camou(cam);
  hide(hid);
  const hits = run(w, c, 1).filter((e) => e.type === 'hit' && e.id === g.id).map((e) => [e.target, e.damage]);
  assert.deepEqual(hits, [[a.id, 50], [cam.id, 25]]);
  assert.equal(hid.hp, hid.maxHp);
});

/**
 * An enemy with one talent behaviour, and operators placed by hand.
 * @param {Record<string, any>} behaviors @param {Record<string, unknown>} [def]
 */
function kit(behaviors, def = {}) {
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [];
  c.enemies.foe = { name: 'foe', maxHp: 1000, atk: 100, def: 0, res: 0, moveSpeed: 0, applyWay: 'MELEE', talents: { x: {} }, ...def };
  c.behaviors = { foes: behaviors };
  const w = createWorld(c, { seed: 1, players: 1 });
  /** @param {number} row @param {number} col */
  const enemy = (row, col) => {
    const e = makeEnemy(w, c, { key: 'foe', route: 0 });
    e.x = col;
    e.y = row;
    w.units.push(e);
    foeSpawn(w, c, e);
    return e;
  };
  /** @param {string} key @param {number} row @param {number} col */
  const op = (key, row, col) => {
    const u = makeOperator(w, c, { key, owner: 0, row, col, dir: 0 });
    w.units.push(u);
    return u;
  };
  return { w, c, enemy, op };
}

test('[敌能-7] [索敌-2] a tile splash hits its locked target and 迷彩, and skips other 隐匿', () => {
  const { w, c, enemy, op } = kit({ x: { attack: (/** @type {any} */ _ctx, /** @type {any} */ m) => ({ ...m, cross: true, type: 'true' }) } });
  const e = enemy(1, 2), primary = op('guard', 1, 2), hid = op('sniper', 1, 3), cam = op('guard', 1, 1);
  hide(primary);
  hide(hid);
  camou(cam);
  e.blockedBy = primary.id;
  run(w, c, 1);
  assert.deepEqual([primary.hp, cam.hp, hid.hp], [900, 900, 500]);
});

test('[敌能-26] [索敌-2] around keeps the locked unit and 迷彩, and skips other 隐匿', () => {
  /** @type {number[] | null} */
  let ids = null;
  /** @type {{ w: World | null }} */
  const box = { w: null };
  const { w, c, enemy, op } = kit({
    x: {
      tick: (/** @type {any} */ ctx) => {
        if (ids || !box.w) return;
        const t = box.w.units.find((u) => u.x === 2 && u.y === 1);
        if (t) ids = ctx.around(t, 'cross').map((/** @type {Unit} */ u) => u.id);
      },
    },
  }, { atk: 0, rangeRadius: 0 });
  box.w = w;
  enemy(1, 4);
  const primary = op('guard', 1, 2), hid = op('sniper', 1, 3), cam = op('guard', 1, 1);
  hide(primary);
  hide(hid);
  camou(cam);
  run(w, c, 1);
  assert.deepEqual(ids, [primary.id, cam.id]);
});

test('[敌能-3] [索敌-2] an explosion skips 隐匿 and still hits 迷彩', () => {
  const { w, c, enemy, op } = kit({
    x: { death: (/** @type {any} */ ctx) => ctx.blast({ x: 2, y: 1, radius: 1.1, delay: 0, air: true, sourced: false, type: 'true', amount: 80 }) },
  }, { atk: 0, rangeRadius: 0, talents: { x: {} } });
  c.operators.s2 = { ...c.operators.sniper };
  const e = enemy(2, 0), hid = op('sniper', 0, 2), cam = op('guard', 1, 2), far = op('s2', 0, 3);
  hide(hid);
  camou(cam);
  e.hp = 0;
  run(w, c, 1);
  assert.deepEqual([hid.hp, cam.hp, far.hp], [500, 1000, 500], 'queued, not yet');
  run(w, c, 1);
  assert.deepEqual([hid.hp, cam.hp, far.hp], [500, 920, 500]);
});

test('[职业-31] [索敌-2] a deployment stun hits its locked 隐匿 target and 迷彩, and skips other 隐匿', () => {
  const { w, c } = arena((cc) => {
    Object.assign(cc.operators.guard, { range: [{ row: 0, col: 1 }], trait: { seeStealth: true }, talentTrait: { deployStun: { seconds: 4, radius: 1 } } });
  });
  const main = foe(w, c, 1, 2), hid = foe(w, c, 2, 2), cam = foe(w, c, 1, 3);
  hide(main);
  hide(hid);
  camou(cam);
  run(w, c, 1, [deploy('guard', 1, 1)]);
  assert.deepEqual([main, hid, cam].map((u) => !!statsOf(u).flags.stun), [true, false, true]);
});

test('[职业-31] [索敌-2] a deployment blast skips 隐匿, including one on its tile, and hits 迷彩', () => {
  const { w, c } = arena((cc) => {
    Object.assign(cc.operators.guard, { trait: { noAttack: true }, talentTrait: { deployBlast: { scale: 0.8, stun: 3, again: '' } } });
  });
  const on = foe(w, c, 1, 1), side = foe(w, c, 1, 0), cam = foe(w, c, 1, 2);
  hide(on);
  hide(side);
  camou(cam);
  const hp = cam.hp;
  run(w, c, 1, [deploy('guard', 1, 1)]);
  assert.deepEqual([on.hp, side.hp, hp - cam.hp, !!statsOf(cam).flags.stun, !!statsOf(on).flags.stun], [on.maxHp, side.maxHp, 40, true, false]);
});

test('[职业-35] [索敌-2] a timed blast skips 隐匿 and still hits 迷彩', () => {
  const { w, c } = arena((cc) => {
    Object.assign(cc.operators.guard, {
      range: [{ row: 0, col: 5 }],
      talentTrait: { timedBlast: { after: 3, scale: 4, fragile: { value: 0.3, seconds: 8 } } },
    });
  });
  run(w, c, 1, [deploy('guard', 1, 1)]);
  const hid = foe(w, c, 2, 2), cam = foe(w, c, 0, 2), plain = foe(w, c, 2, 1);
  hide(hid);
  camou(cam);
  const hp = plain.hp;
  run(w, c, 89);
  assert.equal(plain.hp, hp, 'not yet');
  run(w, c, 1);
  assert.deepEqual([hid.hp, hp - cam.hp, hp - plain.hp, cam.buffs.some((b) => b.key === 'fragile')], [hid.maxHp, 200, 200, true]);
});
