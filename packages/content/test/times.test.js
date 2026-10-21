// 岁兽残响, part one (docs/spec/foes.md 敌能-39): a body falls by 1 HP per successful hit, and its parent leaves the
// right number behind, inside the square on its own route, after one seeded delay. A fall spawns only where the page
// allows it. The bodies cannot be blocked and do not attack.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, damage, buffs, attrs, blocking, status, KIND } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent, withFoeExtras, FOE_EXTRAS } from '../src/index.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

/**
 * One enemy of `key` on the tiny map, rooted at (col, row), its record `def` with the PRTS extras merged. `child` is
 * another enemy the content must hold so a parent can summon it. `hole` makes that tile a 地穴.
 * @param {string} key @param {Record<string, unknown>} def
 * @param {{ child?: string, seed?: number, row?: number, col?: number, hole?: boolean }} [o]
 */
function place(key, def, o = {}) {
  const c = /** @type {any} */ (tinyContent());
  const row = o.row ?? 1, col = o.col ?? 2;
  c.level.waves = [oneWave([spawnAt(0, key)])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 9 };
  c.behaviors = skeletonContent.behaviors;
  c.enemies[key] = withFoeExtras(key, /** @type {EnemyDef} */ ({ name: key, maxHp: 3, atk: 0, def: 0, res: 0, moveSpeed: 1, ...def }));
  if (o.child) c.enemies[o.child] = withFoeExtras(o.child, /** @type {EnemyDef} */ ({ name: o.child, maxHp: 3, atk: 0, def: 0, res: 0, moveSpeed: 0 }));
  if (o.hole) c.level.tiles[row][col] = { ...c.level.tiles[row][col], key: 'tile_hole' };
  const w = createWorld(c, { seed: o.seed ?? 1, players: 1 });
  step(w, c);
  const e = w.units.find((u) => u.kind === KIND.ENEMY);
  if (!e) throw new Error(`no enemy ${key}`);
  Object.assign(e, { x: col, y: row, path: [], pt: 0 });
  status.applyStatus(e, 'root', {});
  return { c, w, e };
}
/** Runs n frames, returning the events with their frame. @param {World} w @param {any} c @param {number} n */
function run(w, c, n) {
  /** @type {any[]} */
  const out = [];
  for (let i = 0; i < n; i++) for (const ev of step(w, c)) out.push({ ...ev, f: w.frame - 1 });
  return out;
}
/** One hit, and the damage the hit event shows (null when the hit never landed). @param {World} w @param {Unit} e @param {any} dmg */
function strike(w, e, dmg) {
  w.events = [];
  const back = damage.dealDamage(w, null, e, dmg);
  const hit = /** @type {any} */ (w.events.find((x) => x.type === 'hit'));
  return { back, shown: hit ? hit.damage : null };
}
/**
 * Knocks the parent down and reports the batch it left: shared delay in frames (0 when they are already there), and
 * the points, on the broods or on the children.
 * @param {string} key @param {string} child @param {number} cnt @param {number} seed
 */
function leave(key, child, cnt, seed) {
  const { c, w, e } = place(key, { maxHp: 5000, atk: 0, talents: { DeadSpawn: { enemy_key: child, cnt } } }, { child, seed });
  const at = { x: e.x, y: e.y, route: e.route, leg: e.leg };
  e.hp = 0;
  const died = w.frame;
  step(w, c);
  const broods = (w.broods ?? []).filter((b) => b.key === child);
  const left = broods.length > 0 ? broods[0].left : 0;
  assert.ok(broods.every((b) => b.left === left), 'one delay for the batch');
  const born = w.units.filter((u) => u.key === child);
  const held = broods.length > 0 ? broods : born;
  return { c, w, at, died, left, held, n: held.length };
}
/** @param {{ at: { x: number, y: number, route: number, leg: number }, held: { x: number, y: number, route: number, leg: number }[] }} got */
function inSquare(got) {
  for (const p of got.held) {
    assert.ok(Math.abs(p.x - got.at.x) <= 0.5 && Math.abs(p.y - got.at.y) <= 0.5, `(${p.x}, ${p.y}) around (${got.at.x}, ${got.at.y})`);
    assert.equal(p.route, got.at.route);
    assert.equal(p.leg, got.at.leg);
  }
}
/** Steps the delay, then the children stand where the batch put them. @param {ReturnType<typeof leave>} got @param {string} key */
function show(got, key) {
  if (got.left > 0) {
    const ev = run(got.w, got.c, got.left).filter((x) => x.type === 'spawn' && x.key === key);
    assert.deepEqual(ev.map((x) => x.f), Array.from({ length: got.n }, () => got.died + got.left));
  }
  const born = got.w.units.filter((u) => u.key === key);
  assert.equal(born.length, got.n);
  for (const u of born) {
    assert.ok(Math.abs(u.x - got.at.x) <= 0.5 && Math.abs(u.y - got.at.y) <= 0.5);
    assert.equal(u.route, got.at.route);
    assert.equal(u.leg, got.at.leg);
  }
}
/** @param {string} key @param {string} child @param {number} cnt */
function fallen(key, child, cnt) {
  const { c, w, e } = place(key, { maxHp: 5000, atk: 0, talents: { DeadSpawn: { enemy_key: child, cnt } } }, { child, row: 0, col: 4, hole: true });
  step(w, c);
  const n = (w.broods ?? []).filter((b) => b.key === child).length + w.units.filter((u) => u.key === child).length;
  return { gone: !w.units.includes(e), n };
}
/** @param {string} key @param {Record<string, unknown>} [more] */
const extra = (key, more = {}) => withFoeExtras(key, /** @type {EnemyDef} */ ({ name: key, maxHp: 1, atk: 0, def: 0, res: 0, moveSpeed: 1, ...more }));
/** `DeadSpawn` after the extras merge. @param {string} key @param {Record<string, unknown>} bb */
function spawned(key, bb) {
  const talents = extra(key, { talents: { DeadSpawn: bb } }).talents;
  if (!talents || !talents.DeadSpawn) throw new Error(key);
  return /** @type {{ enemy_key?: string, cnt?: number, fall?: number }} */ (talents.DeadSpawn);
}
const BODIES = ['enemy_1196_msfyin', 'enemy_1196_msfyin_2', 'enemy_1198_msfshu', 'enemy_1198_msfshu_2', 'enemy_1200_msfjin', 'enemy_1200_msfjin_2', 'enemy_1202_msfzhi', 'enemy_1202_msfzhi_2'];
/** Deploys a guard on the enemy's tile and returns that frame's events. @param {{ w: World, c: any, e: Unit }} box */
const guardOn = (box) => step(box.w, box.c, [[0, { type: 'deploy', op: 'guard', row: box.e.y, col: box.e.x, dir: 0 }]]);

test('[敌能-39] a 3-hit body loses 1 HP per successful hit, whatever the size; the event and the return stay the calculated damage', () => {
  const { w, e } = place('enemy_1198_msfshu', { maxHp: 3, talents: { hitCount: {} } });
  const phys = strike(w, e, { type: 'phys', amount: 1000 });
  assert.deepEqual([e.hp, phys.back, phys.shown], [2, 1000, 1000]);
  const arts = strike(w, e, { type: 'arts', amount: 1 });
  assert.deepEqual([e.hp, arts.back, arts.shown], [1, 1, 1]);
  const truth = strike(w, e, { type: 'true', amount: 0.4 });
  assert.deepEqual([e.hp, truth.back, truth.shown], [0, 0.4, 0.4]);
  const dead = strike(w, e, { type: 'true', amount: 10 });
  assert.deepEqual([e.hp, dead.back, dead.shown], [0, 0, null]);
  const bronze = place('enemy_1200_msfjin', { maxHp: 30, talents: { hitCount: {} } });
  const burst = strike(bronze.w, bronze.e, { type: 'elemental', amount: 40 });
  assert.deepEqual([bronze.e.hp, burst.back, burst.shown], [29, 40, 40]);
});

test('[敌能-39] [伤害-8] [伤害-10] [伤害-11] a zero, a dodge, a shield, a full barrier and 无敌 do not count; a partial barrier does; 生命流失 is the whole amount; a heal restores a hit', () => {
  const { w, e } = place('body', { maxHp: 3, talents: { hitCount: {} } });
  assert.equal(strike(w, e, { type: 'true', amount: 0 }).back, 0);
  assert.equal(e.hp, 3);
  const dodged = place('dodge', { maxHp: 3, talents: { hitCount: {} } });
  dodged.e.buffs.push(buffs.makeBuff({ key: 'dodge', mods: { dodgePhys: 1 } }));
  assert.equal(damage.dealDamage(dodged.w, null, dodged.e, { type: 'phys', amount: 50 }), 0);
  assert.equal(dodged.e.hp, 3);
  const shielded = place('shield', { maxHp: 3, talents: { hitCount: {} } });
  shielded.e.buffs.push(buffs.makeBuff({ key: 'shield', shieldHits: 1 }));
  assert.equal(damage.dealDamage(shielded.w, null, shielded.e, { type: 'true', amount: 80 }), 0);
  assert.equal(shielded.e.hp, 3);
  const wall = place('wall', { maxHp: 3, talents: { hitCount: {} } });
  wall.e.buffs.push(buffs.makeBuff({ key: 'barrier', shield: 100 }));
  assert.equal(damage.dealDamage(wall.w, null, wall.e, { type: 'true', amount: 40 }), 0);
  assert.equal(wall.e.hp, 3);
  const inv = place('inv', { maxHp: 3, talents: { hitCount: {} } });
  inv.e.buffs.push(buffs.makeBuff({ key: 'inv', flags: { invincible: true } }));
  assert.equal(damage.dealDamage(inv.w, null, inv.e, { type: 'true', amount: 50 }), 0);
  assert.equal(inv.e.hp, 3);
  const part = place('part', { maxHp: 3, talents: { hitCount: {} } });
  part.e.buffs.push(buffs.makeBuff({ key: 'barrier', shield: 30 }));
  const rest = strike(part.w, part.e, { type: 'true', amount: 80 });
  assert.deepEqual([part.e.hp, rest.back, rest.shown], [2, 50, 50]);
  const loss = place('loss', { maxHp: 3, talents: { hitCount: {} } });
  assert.equal(damage.dealDamage(loss.w, null, loss.e, { type: 'true', amount: 10, hpLoss: true }), 10);
  assert.equal(loss.e.hp, 0);
  const healed = place('healed', { maxHp: 3, talents: { hitCount: {} } });
  assert.equal(damage.dealDamage(healed.w, null, healed.e, { type: 'true', amount: 7 }), 7);
  assert.equal(healed.e.hp, 2);
  healed.w.events = [];
  assert.equal(damage.heal(healed.w, null, healed.e, 1), 1);
  assert.equal(healed.e.hp, 3);
  assert.equal(healed.w.events.some((x) => x.type === 'hit'), false);
  const plain = place('plain', { maxHp: 100 });
  assert.equal(damage.dealDamage(plain.w, null, plain.e, { type: 'true', amount: 40 }), 40);
  assert.equal(plain.e.hp, 60);
});

test('[敌能-39] the bodies are unblockable and do not attack, even with an attack and a guard on their tile', () => {
  const marked = place('enemy_1196_msfyin', { maxHp: 100, atk: 400, applyWay: 'RANGED', rangeRadius: 3, blockCnt: 1, talents: { hitCount: {} } });
  const s = attrs.statsOf(marked.e);
  assert.deepEqual([s.flags.hitCount, s.flags.noAttack, s.flags.unblockable], [true, true, true]);
  const ev = [...guardOn(marked), ...run(marked.w, marked.c, 40)];
  assert.equal(ev.filter((x) => x.type === 'attack' && x.id === marked.e.id).length, 0);
  assert.equal(marked.e.blockedBy, -1);
  assert.equal(blocking.tryBlock(marked.w, marked.c, marked.e), false);
  const plain = place('biter', { maxHp: 1000, atk: 400, applyWay: 'RANGED', rangeRadius: 3, blockCnt: 1 });
  const swung = [...guardOn(plain), ...run(plain.w, plain.c, 5)];
  assert.ok(swung.some((x) => x.type === 'attack' && x.id === plain.e.id), 'the same attack without the mark does swing');
});

test('[敌能-39] a parent leaves the right count inside the square on its own route, at one seeded delay within 0.7 s', () => {
  const a = leave('enemy_1195_sfyin', 'enemy_1196_msfyin', 2, 1);
  const b = leave('enemy_1195_sfyin', 'enemy_1196_msfyin', 2, 1);
  assert.equal(a.n, 2);
  assert.ok(a.left >= 0 && a.left <= 21, `delay ${a.left}`);
  assert.equal(a.left, b.left);
  assert.deepEqual(a.held.map((p) => [p.x, p.y]), b.held.map((p) => [p.x, p.y]));
  inSquare(a);
  show(a, 'enemy_1196_msfyin');
  const many = leave('enemy_1201_sfzhi', 'enemy_1202_msfzhi', 15, 7);
  assert.equal(many.n, 15);
  assert.ok(many.left >= 0 && many.left <= 21);
  inSquare(many);
  show(many, 'enemy_1202_msfzhi');
});

test('[敌能-39] [地图-4] 磨砻 and 雅气 leave nothing when they fall; 明鉴 still does', () => {
  const milled = fallen('enemy_1195_sfyin', 'enemy_1196_msfyin', 2);
  const fair = fallen('enemy_1197_sfshu_2', 'enemy_1198_msfshu_2', 3);
  const mirror = fallen('enemy_1195_sfyin_2', 'enemy_1196_msfyin_2', 2);
  assert.deepEqual([milled.gone, milled.n, fair.gone, fair.n, mirror.gone, mirror.n], [true, 0, true, 0, true, 2]);
});

test('[敌能-39] the eight bodies gain an empty hitCount talent', () => {
  for (const k of BODIES) {
    const talents = extra(k).talents;
    if (!talents) throw new Error(k);
    assert.deepEqual(talents.hitCount, {});
  }
});

test('[敌能-39] only 磨砻 and 雅气 skip a fall; 明鉴 still spawns after one', () => {
  const mill = spawned('enemy_1195_sfyin', { enemy_key: 'enemy_1196_msfyin', cnt: 2 });
  assert.equal(mill.fall, 0);
  assert.equal(mill.enemy_key, 'enemy_1196_msfyin');
  assert.equal(mill.cnt, 2);
  assert.equal(spawned('enemy_1197_sfshu_2', { enemy_key: 'enemy_1198_msfshu_2', cnt: 3 }).fall, 0);
  assert.equal(spawned('enemy_1195_sfyin_2', { enemy_key: 'x', cnt: 2 }).fall, undefined);
});

test('[敌能-39] 身观\'s taunt is the record; this family adds no taunt talent', () => {
  assert.equal(Object.hasOwn(FOE_EXTRAS, 'enemy_1199_sfjin'), false);
  const seen = place('enemy_1199_sfjin', { tauntLevel: 1, talents: { DeadSpawn: { enemy_key: 'enemy_1200_msfjin', cnt: 1 } } }, { child: 'enemy_1200_msfjin' });
  assert.equal(attrs.statsOf(seen.e).taunt, 1);
  const talents = extra('enemy_1199_sfjin', { tauntLevel: 1 }).talents;
  assert.equal(talents && talents.taunt, undefined);
});
