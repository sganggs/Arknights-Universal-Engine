// Soul chalices (docs/spec/foes.md 敌能-41): a covered ground enemy keeps 5% of a hit and the chalice takes the rest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, damage, buffs } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { takeDmg, chaliceBuffs } from '../src/chalice.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

const ROOK = 'enemy_1430_lrrook', ROOK2 = 'enemy_1430_lrrook_2';

/** @param {number} a @param {number} b */
const close = (a, b) => Math.abs(a - b) < 1e-6;

/** @param {string} key @param {number} maxHp */
function cup(key, maxHp) {
  return {
    name: key, maxHp, atk: 0, def: 0, res: 30, moveSpeed: 0, motion: 'FLY', applyWay: 'NONE', rangeRadius: 1.7,
    talents: { takeDmg: { damage_scale: 0.05, range_radius: 1.7 } },
  };
}

/** @param {string} key @param {string} motion */
const walker = (key, motion) => ({ name: key, maxHp: 5000, atk: 0, def: 0, res: 0, moveSpeed: 0, motion });

/** @param {World} w @param {string} key @returns {Unit} */
function unit(w, key) {
  const u = w.units.find((x) => x.key === key);
  if (!u) throw new Error(`missing ${key}`);
  return u;
}

/** @param {any} c @param {string[]} keys @param {number} hp */
function place(c, keys, hp) {
  for (const key of keys) {
    if (key === 'ground') c.enemies.ground = walker('ground', 'WALK');
    else if (key === 'flyer') c.enemies.flyer = walker('flyer', 'FLY');
    else c.enemies[key] = cup(key, hp);
  }
}

/** Cups and neighbours at the route start, and a guard in range who does not attack. @param {string[]} keys @param {number} [hp] */
function bring(keys, hp = 1000) {
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [oneWave(keys.map((key) => spawnAt(0, key)))];
  place(c, keys, hp);
  c.operators.guard.atk = 0;
  c.behaviors = { foes: { takeDmg }, buffs: chaliceBuffs };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 0, dir: 0 }]]);
  return { c, w, op: unit(w, 'guard') };
}

/** @param {Unit} u @param {number} hp */
function pump(u, hp) {
  u.base.maxHp = hp;
  u.maxHp = hp;
  u.hp = hp;
}

/** @param {Unit} u */
const held = (u) => u.buffs.find((b) => b.key === 'takeDmg');

test('[敌能-41] a covered ground enemy keeps 5% of an arts hit; the chalice takes the rest as true damage from the attacker', () => {
  const { c, w, op } = bring([ROOK, 'ground', 'flyer']);
  const cupU = unit(w, ROOK), ground = unit(w, 'ground'), flyer = unit(w, 'flyer'), buff = held(ground);
  assert.ok(buff);
  assert.equal(buff.src, cupU.id);
  assert.equal(buff.prio, -3000);
  assert.equal(held(flyer), undefined);
  assert.equal(held(cupU), undefined);
  const cupHp = cupU.hp;
  const dealt = damage.dealDamage(w, op, ground, { type: 'arts', amount: 100 }, c);
  assert.ok(close(dealt, 5));
  assert.ok(close(ground.hp, 4995));
  assert.ok(close(cupHp - cupU.hp, 95), 'true damage ignores the chalice res of 30');
  const share = w.events.filter((e) => e.type === 'hit' && e.target === cupU.id);
  assert.equal(share.length, 1);
  assert.equal(share[0].id, op.id);
  const after = cupU.hp, flyerHp = flyer.hp;
  damage.dealDamage(w, op, flyer, { type: 'arts', amount: 100 }, c);
  assert.ok(close(flyer.hp, flyerHp - 100));
  assert.equal(cupU.hp, after);
});

test('[敌能-41] 殉亡魂灵圣杯 shares the same way', () => {
  const { c, w, op } = bring([ROOK2, 'ground']);
  const cupU = unit(w, ROOK2), ground = unit(w, 'ground'), before = cupU.hp;
  const dealt = damage.dealDamage(w, op, ground, { type: 'true', amount: 100 }, c);
  assert.ok(close(dealt, 5) && close(before - cupU.hp, 95));
});

test('[敌能-41] elemental damage is shared too', () => {
  const { c, w, op } = bring([ROOK, 'ground']);
  const cupU = unit(w, ROOK), ground = unit(w, 'ground'), before = cupU.hp;
  const dealt = damage.dealDamage(w, op, ground, { type: 'elemental', amount: 100 }, c);
  assert.ok(close(dealt, 5) && close(before - cupU.hp, 95));
});

test('[敌能-41] an enemy already covered by one chalice is not covered by the other; the earlier one takes the share', () => {
  const { c, w, op } = bring([ROOK, ROOK2, 'ground']);
  const first = unit(w, ROOK), second = unit(w, ROOK2), ground = unit(w, 'ground');
  const list = ground.buffs.filter((b) => b.key === 'takeDmg');
  assert.equal(list.length, 1);
  assert.equal(list[0].src, first.id);
  const a = first.hp, b = second.hp;
  damage.dealDamage(w, op, ground, { type: 'true', amount: 100 }, c);
  assert.ok(close(a - first.hp, 95));
  assert.equal(second.hp, b);
});

test('[敌能-41] a disappeared chalice does not cover, and the lent buff does not keep reducing damage', () => {
  const { c, w, op } = bring([ROOK, 'ground']);
  const cupU = unit(w, ROOK), ground = unit(w, 'ground'), before = cupU.hp;
  cupU.hidden = true;
  const dealt = damage.dealDamage(w, op, ground, { type: 'true', amount: 80 }, c);
  assert.equal(dealt, 80);
  assert.equal(cupU.hp, before);
  step(w, c);
  assert.equal(held(ground), undefined);
});

test('[敌能-41] the radius is a circle of 1.7, boundary included; past it the lingering buff does not reduce damage', () => {
  const { c, w, op } = bring([ROOK, 'ground']);
  const cupU = unit(w, ROOK), ground = unit(w, 'ground');
  ground.x = cupU.x + 1.7;
  const before = cupU.hp;
  const on = damage.dealDamage(w, op, ground, { type: 'true', amount: 100 }, c);
  assert.ok(close(on, 5) && close(before - cupU.hp, 95));
  ground.x = cupU.x + 2;
  const mid = cupU.hp;
  const off = damage.dealDamage(w, op, ground, { type: 'true', amount: 100 }, c);
  assert.equal(off, 100);
  assert.equal(cupU.hp, mid);
});

test('[敌能-41] a hovering enemy is not covered, and the buff is taken back on the chalice\'s turn', () => {
  const { c, w, op } = bring([ROOK, 'ground']);
  const cupU = unit(w, ROOK), ground = unit(w, 'ground'), before = cupU.hp;
  buffs.addBuff(ground, buffs.makeBuff({ key: 'up', flags: { hover: true } }));
  const dealt = damage.dealDamage(w, op, ground, { type: 'true', amount: 40 }, c);
  assert.equal(dealt, 40);
  assert.equal(cupU.hp, before);
  step(w, c);
  assert.equal(held(ground), undefined);
});

test('[敌能-41] [伤害-9] [伤害-10] 类斩杀, a direct HP change and 生命流失 are not shared; a smaller lethal hit is', () => {
  const { c, w, op } = bring([ROOK, 'ground']);
  const cupU = unit(w, ROOK), ground = unit(w, 'ground');
  pump(ground, 2e6);
  pump(cupU, 2e6);
  const before = cupU.hp;
  assert.equal(damage.dealDamage(w, op, ground, { type: 'true', amount: 999999 }, c), 999999);
  assert.equal(cupU.hp, before);
  assert.ok(close(ground.hp, 2e6 - 999999));
  const cut = damage.dealDamage(w, op, ground, { type: 'true', amount: 999998 }, c);
  assert.ok(close(cut, 999998 * 0.05));
  assert.ok(close(before - cupU.hp, 999998 - cut));
  const mid = cupU.hp;
  damage.setHp(ground, ground.hp - 40);
  assert.equal(cupU.hp, mid);
  assert.equal(damage.dealDamage(w, op, ground, { type: 'true', amount: 70, hpLoss: true }, c), 70);
  assert.equal(cupU.hp, mid);
  pump(ground, 4);
  const lethal = damage.dealDamage(w, op, ground, { type: 'true', amount: 100 }, c);
  assert.equal(ground.hp, 0);
  assert.ok(close(lethal, 5) && close(mid - cupU.hp, 95));
});

test('[敌能-41] 类斩杀 is the base amount, so defence does not turn a hit of 999999 into a shared one', () => {
  const { c, w, op } = bring([ROOK, 'ground']);
  const cupU = unit(w, ROOK), ground = unit(w, 'ground');
  pump(ground, 2e6);
  ground.base.def = 500000;
  const before = cupU.hp;
  const dealt = damage.dealDamage(w, op, ground, { type: 'phys', amount: 999999 }, c);
  const full = damage.mitigate(999999, 'phys', { def: 500000, res: 0, epDamageResistance: 0 }, { defIgnorePct: 0, defIgnoreFlat: 0, resIgnorePct: 0, resIgnoreFlat: 0 });
  assert.equal(dealt, full);
  assert.equal(cupU.hp, before);
});

test('[敌能-41] the share can kill the chalice, and a dead chalice no longer covers', () => {
  const { c, w, op } = bring([ROOK, 'ground'], 40);
  const cupU = unit(w, ROOK), ground = unit(w, 'ground');
  const dealt = damage.dealDamage(w, op, ground, { type: 'true', amount: 100 }, c);
  assert.ok(close(dealt, 5));
  assert.equal(cupU.hp, 0);
  step(w, c);
  assert.equal(w.units.includes(cupU), false);
  const left = ground.hp;
  const again = damage.dealDamage(w, op, ground, { type: 'true', amount: 40 }, c);
  assert.equal(again, 40);
  assert.ok(close(ground.hp, left - 40));
});

test('[敌能-41] [伤害-8] priority −3000 runs after 脆弱, and a shield that cancels the hit leaves the chalice unhurt', () => {
  const raised = bring([ROOK, 'ground']);
  const cupU = unit(raised.w, ROOK), ground = unit(raised.w, 'ground'), before = cupU.hp;
  buffs.addBuff(ground, buffs.makeBuff({ key: 'fragile', mods: { dmgTakenMul: 2 } }));
  const dealt = damage.dealDamage(raised.w, raised.op, ground, { type: 'true', amount: 100 }, raised.c);
  assert.ok(close(dealt, 10) && close(before - cupU.hp, 190));
  const blocked = bring([ROOK, 'ground']);
  const wall = unit(blocked.w, 'ground'), chalice = unit(blocked.w, ROOK), hp = chalice.hp, ghp = wall.hp;
  buffs.addBuff(wall, buffs.makeBuff({ key: 'wall', shield: 1000 }));
  assert.equal(damage.dealDamage(blocked.w, blocked.op, wall, { type: 'true', amount: 100 }, blocked.c), 0);
  assert.equal(chalice.hp, hp);
  assert.equal(wall.hp, ghp);
});

test('[敌能-41] [敌人攻击-1] atk 0 does not attack, so applyWay NONE needs no extra rule', () => {
  const { c, w } = bring([ROOK, 'ground']);
  const cupU = unit(w, ROOK), guard = unit(w, 'guard'), hp = guard.hp;
  assert.deepEqual([cupU.base.atk, cupU.base.applyWay], [0, 'NONE']);
  for (let i = 0; i < 40; i++) step(w, c);
  assert.equal(guard.hp, hp);
  assert.equal(cupU.swing, null);
});
