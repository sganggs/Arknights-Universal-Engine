// IG-FT-1's other enemies (docs/spec/foes.md 敌能-33, 敌能-36, 敌能-38, 敌能-87…敌能-93) with their records as extracted:
// 狙击步兵组长's stun, 无胄盟第三小队组长's 侵蚀, 固海凿石者 digging in, 温顺的武装大驮兽 with no 稳固锁链, 囊海爬行者's 刺伤 by
// 已损失生命值判定, enemies' left or right, 箭棘兽's weak front and quills, 凶豕兽's charge, and 深池塑能术师队长's flames.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, damage, attrs, status } from '@aue/sim';
import { skeletonContent } from '../src/index.js';
import { uncoveredAbilities, withFoeExtras } from '../src/foes.js';
import football from '../data/levels/act1multi_football.json' with { type: 'json' };

/** @typedef {import('@aue/sim').Unit} Unit */

const E = /** @type {Record<string, any>} */ (football.enemies);
const SEC = 30;
const ROAD = Object.freeze({ key: 'tile_road', height: 'LOWLAND', buildable: 'ALL', passable: 'ALL', side: 'ALL' });

/**
 * A 11 × 5 field of road with enemies of these keys: each standing at its point (a long wait there) or walking to a
 * point; operators of 1 and 3 blocks and a ranged one, all sturdy, with no attack unless given.
 * @param {{ key: string, x: number, y: number, to?: { x: number, y: number } }[]} units @param {{ atk?: number }} [o]
 */
function field(units, o = {}) {
  const routes = units.map(({ x, y, to }) => (to ? { start: { row: y, col: x }, end: { row: to.y, col: to.x }, motion: 'WALK', checkpoints: [] }
    : { start: { row: y, col: x }, end: { row: y, col: 0 }, motion: 'WALK', checkpoints: [{ type: 'WAIT_FOR_SECONDS', row: y, col: x, time: 999, dx: 0, dy: 0 }] }));
  const op = { maxHp: 1e7, atk: o.atk ?? 0, def: 0, res: 0, cost: 0, baseAttackTime: 1, respawnTime: 1 };
  const c = /** @type {any} */ ({
    level: { id: 'f', width: 11, height: 5, tiles: Array.from({ length: 5 }, () => Array.from({ length: 11 }, () => ROAD)), routes,
      waves: [{ preDelay: 0, postDelay: 0, maxWait: -1, fragments: [{ preDelay: 0, actions: units.map(({ key }, i) => ({ type: 'SPAWN', key, route: i, count: 1, preDelay: 0, interval: 1 })) }] }],
      options: { maxLifePoint: 99, initialCost: 99, maxCost: 99, costIncreaseTime: 1, characterLimit: 8, moveMultiplier: 1 } },
    enemies: Object.fromEntries([...new Set(units.map((u) => u.key)), ...units.flatMap((u) => (u.key === 'enemy_1176_dusocr_2' ? ['enemy_1177_dufrbl_2'] : []))].map((k) => [k, withFoeExtras(k, E[k])])),
    operators: {
      thin: { ...op, name: 'thin', position: 'MELEE', blockCnt: 1, range: [{ row: 0, col: 0 }, { row: 0, col: 1 }] },
      wall: { ...op, name: 'wall', position: 'MELEE', blockCnt: 3, range: [{ row: 0, col: 0 }, { row: 0, col: 1 }] },
      far: { ...op, name: 'far', position: 'RANGED', blockCnt: 1, range: [{ row: 0, col: 0 }] },
    },
    behaviors: skeletonContent.behaviors,
  });
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  return { w, c };
}

const by = (/** @type {any} */ w, /** @type {string} */ key) => /** @type {Unit} */ (w.units.find((/** @type {Unit} */ u) => u.key === key));
const run = (/** @type {any} */ w, /** @type {any} */ c, /** @type {number} */ n, /** @type {any[]} */ cmds = []) => {
  const ev = [];
  for (let i = 0; i < n; i++) ev.push(...step(w, c, i === 0 ? cmds : []));
  return ev;
};
/** @param {string} op @param {number} row @param {number} col @param {number} [dir] */
const deploy = (op, row, col, dir = 0) => /** @type {[number, any]} */ ([0, { type: 'deploy', op, row, col, dir }]);
const flags = (/** @type {Unit} */ u) => attrs.statsOf(u).flags;

test('[敌能-36] [敌能-33] 狙击步兵组长: every third attack stuns for 15 s; it does not attack flying units', () => {
  const { w, c } = field([{ key: 'enemy_1047_sagent_2', x: 6, y: 2 }]);
  const ev = run(w, c, 1, [deploy('far', 2, 4)]);
  const op = by(w, 'far');
  for (let i = 0; i < 20 * SEC && !flags(op).stun; i++) ev.push(...step(w, c));
  const attacks = ev.filter((e) => e.type === 'attack' && e.target === op.id).length;
  assert.equal(attacks, 3, 'two attacks, then the stunning one');
  assert.ok(op.buffs.some((b) => b.key === 'stun' && b.left > 14 * SEC));
  assert.deepEqual(withFoeExtras('enemy_1047_sagent_2', E.enemy_1047_sagent_2).talents?.noFly, {});
});

test('[敌能-38] 无胄盟第三小队组长: each hit adds 攻击力 × 0.35 of 侵蚀损伤', () => {
  const { w, c } = field([{ key: 'enemy_1182_flasrt_2', x: 6, y: 2 }]);
  run(w, c, 1, [deploy('thin', 2, 3)]);
  const op = by(w, 'thin');
  const ev = run(w, c, 4 * SEC);
  assert.ok(ev.some((e) => e.type === 'attack' && e.target === op.id), 'it attacked');
  const lost = 1000 - (op.ep.WATER ?? 1000), each = 600 * 0.35;
  assert.ok(lost > 0 && Math.abs(lost / each - Math.round(lost / each)) < 1e-9, `侵蚀 ${lost}, ${each} a hit`);
  assert.deepEqual(uncoveredAbilities([withFoeExtras('enemy_1182_flasrt_2', E.enemy_1182_flasrt_2)]), []);
});

test('[敌能-87] 固海凿石者: as its first attack starts, 20 s of 防御力 + 300 and 自缚', () => {
  const { w, c } = field([{ key: 'enemy_2022_syzeni', x: 7, y: 2, to: { x: 0, y: 2 } }]);
  const e = by(w, 'enemy_2022_syzeni'), def = attrs.statsOf(e).def;
  run(w, c, 1, [deploy('thin', 2, 3)]);
  for (let i = 0; i < 10 * SEC && !e.buffs.some((b) => b.key === 'digIn'); i++) step(w, c);
  assert.equal(attrs.statsOf(e).def, def + 300);
  const x = e.x;
  run(w, c, 5 * SEC);
  assert.equal(e.x, x, 'it stays');
  run(w, c, 16 * SEC);
  assert.equal(e.buffs.some((b) => b.key === 'digIn'), false, 'over after 20 s');
});

test('[敌能-88] 温顺的武装大驮兽: with no 稳固锁链 its ability has nothing to do, and counts as covered', () => {
  assert.deepEqual(uncoveredAbilities([withFoeExtras('enemy_1415_mmkabi_2', E.enemy_1415_mmkabi_2)]), []);
});

test('[敌能-89] 囊海爬行者: 刺伤 each time it has lost a further 15%: arts and 神经损伤 within 2; not under 晕眩', () => {
  const { w, c } = field([{ key: 'enemy_1152_dsurch', x: 5, y: 2 }]);
  run(w, c, 1, [deploy('thin', 2, 4)]);
  const e = by(w, 'enemy_1152_dsurch'), op = by(w, 'thin'), hit = (/** @type {number} */ n) => damage.dealDamage(w, op, e, { type: 'true', amount: n }, c);
  hit(3700);
  run(w, c, 2);
  assert.equal(op.hp, op.maxHp, '14.8% lost: nothing yet');
  hit(100);
  run(w, c, 2);
  assert.equal(op.maxHp - op.hp, 300, '15.2%: 攻击力 × 1 arts');
  assert.equal(1000 - op.ep.SANITY, 300, 'and 攻击力 × 1 of 神经损伤');
  hit(3500);
  run(w, c, 2);
  assert.equal(op.maxHp - op.hp, 300, '29.2%: the next stage not reached');
  status.applyStatus(e, 'stun', { seconds: 5 });
  hit(500);
  run(w, c, 2);
  assert.equal(op.maxHp - op.hp, 300, 'stunned: the stage passes without 刺伤');
  hit(4000);
  run(w, c, 2);
  assert.equal(op.maxHp - op.hp, 300, '47.2% while still stunned');
});

test('[敌能-90] an enemy faces right as it appears, the way it moves, and what it attacks', () => {
  const { w, c } = field([{ key: 'enemy_1047_sagent_2', x: 5, y: 1 }, { key: 'enemy_2022_syzeni', x: 9, y: 3, to: { x: 0, y: 3 } }]);
  const still = by(w, 'enemy_1047_sagent_2'), walker = by(w, 'enemy_2022_syzeni');
  run(w, c, 5);
  assert.equal(still.lr, undefined, 'standing: right, as it appeared');
  assert.equal(walker.lr, -1, 'walking left');
  run(w, c, 1, [deploy('far', 3, 9)]);
  for (let i = 0; i < 5 * SEC && walker.lr === -1; i++) step(w, c);
  assert.equal(walker.lr, undefined, 'attacking the one behind it, to its right');
});

test('[敌能-91] 箭棘兽: from behind 物理/法术 × 0.25; each 10% lost, quills over the half behind it, within 1.8', () => {
  const { w, c } = field([{ key: 'enemy_1310_mhprpn_2', x: 5, y: 2 }]);
  run(w, c, 1, [deploy('thin', 2, 4)]);
  run(w, c, 1, [deploy('wall', 2, 6)]);
  const e = by(w, 'enemy_1310_mhprpn_2'), back = by(w, 'thin'), front = by(w, 'wall');
  // it faces right (it never moved): its back is the left
  e.buffs = e.buffs.filter((b) => b.key !== 'stun');
  const hp = e.hp;
  damage.dealDamage(w, back, e, { type: 'phys', amount: 1000 }, c);
  const fromBack = hp - e.hp;
  damage.dealDamage(w, front, e, { type: 'phys', amount: 1000 }, c);
  const fromFront = hp - fromBack - e.hp;
  assert.ok(Math.abs(fromBack / fromFront - 0.25) < 1e-9, `${fromBack} vs ${fromFront}`);
  damage.dealDamage(w, front, e, { type: 'true', amount: e.maxHp * 0.11 }, c);
  run(w, c, 2);
  assert.ok(back.hp < back.maxHp, 'the one behind is hit');
  assert.equal(front.hp, front.maxHp, 'the one in front is not');
});

test('[敌能-92] 凶豕兽: it takes 2 blocks; charging, layers after 5 s, rams ours it runs into; blocked, its hit ends the charge', () => {
  const { w, c } = field([{ key: 'enemy_1309_mhboar', x: 10, y: 2, to: { x: 0, y: 2 } }]);
  const e = by(w, 'enemy_1309_mhboar'), layers = () => e.buffs.find((b) => b.key === 'boarSpeed')?.stacks ?? 0;
  assert.equal(attrs.statsOf(e).blockCnt, 2);
  run(w, c, 4 * SEC);
  assert.equal(layers(), 0, 'no layer in the first 5 s');
  run(w, c, 2 * SEC);
  assert.ok(layers() >= 2, `layers ${layers()}`);
  status.applyStatus(e, 'stun', { seconds: 1 });
  run(w, c, 4);
  assert.deepEqual([layers(), e.buffs.some((b) => b.key === 'boarCharge')], [0, false], '晕眩 ends the charge and its layers');
  run(w, c, 2 * SEC);
  assert.deepEqual([layers(), e.buffs.some((b) => b.key === 'boarCharge')], [0, true], 'a new charge, still in its first 5 s');
  run(w, c, 1, [deploy('thin', 2, Math.round(e.x) - 2)]);
  const thin = by(w, 'thin');
  for (let i = 0; i < 5 * SEC && thin.hp === thin.maxHp; i++) step(w, c);
  assert.ok(thin.hp < thin.maxHp, 'one of 1 block is rammed, not blocking it');
  run(w, c, 1, [deploy('wall', 2, Math.round(e.x) - 2)]);
  const wall = by(w, 'wall');
  for (let i = 0; i < 10 * SEC && e.buffs.some((b) => b.key === 'boarCharge'); i++) step(w, c);
  assert.equal(e.blockedBy, wall.id);
  assert.equal(layers(), 0, 'its hit ended the charge and its layers');
  assert.ok(wall.hp < wall.maxHp);
  assert.deepEqual(uncoveredAbilities([E.enemy_1309_mhboar]), []);
});

test('[敌能-93] 深池塑能术师队长: a flame where it stands, unblocked from 5 s on; the flame skips waits, fades, blows up on ours on low ground', () => {
  const { w, c } = field([{ key: 'enemy_1176_dusocr_2', x: 9, y: 2 }]);
  const flames = () => w.units.filter((u) => u.key === 'enemy_1177_dufrbl_2');
  run(w, c, 5 * SEC - 2);
  assert.equal(flames().length, 0, 'not before 5 s');
  run(w, c, 3);
  const [f] = flames();
  assert.ok(f, 'a flame');
  assert.deepEqual([flags(f).invincible, flags(f).untargetable, flags(f).unblockable], [true, true, true]);
  // the caster's way holds it for 999 s; the flame walks on to the way's end, column 0
  run(w, c, SEC);
  assert.ok(f.x < 9 - 1, `it walks: ${f.x}`);
  const atk = attrs.statsOf(f).atk;
  assert.ok(atk < 600 && atk > 600 * 0.3, `fading: ${atk}`);
  run(w, c, 1, [deploy('thin', 2, Math.max(1, Math.round(f.x) - 3))]);
  const op = by(w, 'thin');
  for (let i = 0; i < 3 * SEC && w.units.includes(f) && f.hp > 0; i++) step(w, c);
  assert.ok(op.hp < op.maxHp, 'arts damage');
  assert.ok(op.ep.FIRE < 1000, '灼燃损伤');
  assert.equal(w.units.includes(f) && f.hp > 0, false, 'it went');
});
