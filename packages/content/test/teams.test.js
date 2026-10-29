// 阵地足球's teams (docs/spec/football.md 足球-15) with IG-FT-1's records as extracted: 战术队 aims at an open goal,
// 爱球会's forward carries the ball and its goalkeeper clears to a forward, 爱球会's muscleman goes for ours near the
// ball, 球德联's shot hurts ours by the ball and its goalkeeper rages, 战术队's muscleman chases one of ours that hit a
// player.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, damage, attrs, devices as dev, KIND } from '@aue/sim';
import { skeletonContent } from '../src/index.js';
import { uncoveredAbilities, withFoeExtras } from '../src/foes.js';
import { profiledDevices } from '../src/devices.js';
import { KICK_TIMES } from '../src/footballers.js';
import football from '../data/levels/act1multi_football.json' with { type: 'json' };

/** @typedef {import('@aue/sim').Unit} Unit */

const E = /** @type {Record<string, any>} */ (football.enemies), F = /** @type {any} */ (football);
const BALL = 'enemy_4015_musucr';

/**
 * IG-FT-1's field with these enemies at points, each waiting where it spawned; barriers on the given tiles of column 1.
 * @param {[string, number, number][]} units [key, x, y] @param {number[]} [barrierRows]
 */
function field(units, barrierRows = []) {
  const routes = units.map(([, x, y]) => ({ start: { row: y, col: x }, end: { row: y, col: 0 }, motion: 'WALK',
    checkpoints: [{ type: 'WAIT_FOR_SECONDS', row: y, col: x, time: 999, dx: 0, dy: 0 }] }));
  const op = { position: 'MELEE', maxHp: 1e6, atk: 1, def: 0, res: 0, cost: 1, blockCnt: 1, baseAttackTime: 1, respawnTime: 1, range: [{ row: 0, col: 1 }] };
  const predefines = barrierRows.map((r) => ({ alias: `bar#${r}`, key: 'trap_154_mugtps', hidden: true, row: r, col: 1, dir: 'UP' }));
  const c = /** @type {any} */ ({
    level: { id: 'ft', width: 13, height: 9, tiles: F.level.tiles, routes, predefines, football: F.level.football,
      // a kickoff tag, as IG-FT-1's waves have (足球-6): a team is drawn
      waves: [{ preDelay: 0, postDelay: 0, maxWait: -1, tag: 0, fragments: [{ preDelay: 0, actions: units.map(([key], i) => ({ type: 'SPAWN', key, route: i, count: 1, preDelay: 0, interval: 1 })) }] }],
      options: { maxLifePoint: 99, initialCost: 99, maxCost: 99, costIncreaseTime: 1, characterLimit: 8, moveMultiplier: 0.5 } },
    enemies: Object.fromEntries(units.map(([k]) => [k, withFoeExtras(k, E[k])])),
    devices: profiledDevices({ trap_154_mugtps: F.devices.trap_154_mugtps }).devices,
    operators: { a: { ...op, name: 'a' }, b: { ...op, name: 'b' } }, behaviors: skeletonContent.behaviors,
  });
  const w = createWorld(c, { seed: 1, players: 1 });
  for (const p of predefines) dev.placeDevice(w, c, p.alias);
  step(w, c);
  // each where it stands, and none waiting for the kickoff (the team drawn may be any)
  for (const [i, u] of w.units.filter((x) => x.kind === KIND.ENEMY).entries()) {
    u.x = units[i][1]; u.y = units[i][2];
    u.buffs = u.buffs.filter((x) => x.key !== 'kickoff');
  }
  return { w, c };
}

const by = (/** @type {any} */ w, /** @type {string} */ key) => /** @type {Unit} */ (w.units.find((/** @type {Unit} */ u) => u.key === key));
const run = (/** @type {any} */ w, /** @type {any} */ c, /** @type {number} */ n, /** @type {any[]} */ cmds = []) => { for (let i = 0; i < n; i++) step(w, c, i === 0 ? cmds : []); };
/** @param {string} op @param {number} row @param {number} col */
const deploy = (op, row, col) => /** @type {[number, any]} */ ([0, { type: 'deploy', op, row, col, dir: 0 }]);
/** Where the ray of a slide from a point meets the column x. @param {Unit} b @param {number} x */
const rowAt = (b, x) => b.y + /** @type {any} */ (b.slide).vy * (x - b.x) / /** @type {any} */ (b.slide).vx;
/** Frames until a kick's hit. @param {string} key @param {string} skill */
const hitOf = (key, skill) => Math.round(/** @type {any} */ (KICK_TIMES)[key][skill][0] * 30);

test('[足球-15] a 战术队 forward shoots at the one tile of our goal with no barrier in front', () => {
  const { w, c } = field([['enemy_4022_mushtm', 6, 4], [BALL, 6.15, 4]], [1, 2, 3, 4, 6, 7]);
  const b = by(w, BALL);
  run(w, c, hitOf('enemy_4022_mushtm', 'slapshot'));
  assert.ok(b.slide, 'kicked');
  // the frame of its own friction taken already: the ray from where it is now
  assert.ok(Math.abs(rowAt(b, 0) - 5) < 1e-6, `at row ${rowAt(b, 0)}`);
});

test('[足球-15] a 战术队 goalkeeper clears at a tile of our goal it has a clear line to', () => {
  const { w, c } = field([['enemy_4023_mushtb', 10, 4], [BALL, 10.4, 4]]);
  const b = by(w, BALL);
  run(w, c, 1 + hitOf('enemy_4023_mushtb', 'clearance'));
  const y = rowAt(b, 0);
  assert.ok(b.slide && b.slide.vx < 0 && Math.abs(y - Math.round(y)) < 1e-6 && y >= 1 && y <= 7, `a goal tile, row ${y}`);
});

test('[足球-15] an 爱球会 goalkeeper clears at the forward nearest our goal', () => {
  const { w, c } = field([['enemy_4026_muhryb', 10, 4], [BALL, 10.4, 4], ['enemy_4025_muhrym', 5, 2]]);
  const b = by(w, BALL), fw = by(w, 'enemy_4025_muhrym');
  run(w, c, 1 + hitOf('enemy_4026_muhryb', 'clearance'));
  assert.ok(b.slide, 'kicked');
  assert.ok(Math.abs(rowAt(b, fw.x) - fw.y) < 0.05, `toward the forward: ${rowAt(b, fw.x)} vs ${fw.y}`);
});

test('[足球-15] an 爱球会 forward carries the ball 0.2 s on: faster, a block more, the ball at its feet; a hit kicks it off', () => {
  const { w, c } = field([['enemy_4025_muhrym', 6, 4], [BALL, 6.1, 4]]);
  const fw = by(w, 'enemy_4025_muhrym'), b = by(w, BALL);
  // it takes the ball on the field's first frame (1): the carry from 6 frames on
  run(w, c, 6);
  assert.equal(fw.buffs.some((x) => x.key === 'dribble'), false, 'not yet');
  run(w, c, 1);
  const s = attrs.statsOf(fw);
  assert.ok(fw.buffs.some((x) => x.key === 'dribble'), 'carrying');
  assert.deepEqual([s.blockCnt, Math.round(s.moveSpeed * 100) / 100], [1 + 1, Math.round(2.2 * 1.8 * 100) / 100]);
  const x0 = fw.x;
  run(w, c, 15);
  assert.ok(fw.x < x0 - 0.4, `toward our goal: ${x0 - fw.x}`);
  assert.deepEqual([b.x, b.y], [fw.x, fw.y], 'the ball at its feet');
  run(w, c, 1, [deploy('a', 4, 1)]);
  damage.dealDamage(w, by(w, 'a'), b, { type: 'phys', amount: 1e5 }, c);
  run(w, c, 1);
  assert.equal(fw.buffs.some((x) => x.key === 'dribble'), false, 'kicked off its feet');
});

test('[足球-15] an 爱球会 forward carrying the ball into our goal scores', () => {
  const { w, c } = field([['enemy_4025_muhrym', 1.4, 4], [BALL, 1.45, 4]]);
  run(w, c, 60);
  assert.equal(/** @type {any} */ (w.football).away, 1);
});

test('[足球-15] a 球德联 shot hurts ours by the ball: 1000 every 1.5 s for 10 s', () => {
  const { w, c } = field([['enemy_4028_mukfum', 6, 4], [BALL, 6.15, 4]]);
  const b = by(w, BALL);
  run(w, c, hitOf('enemy_4028_mukfum', 'slapshot'));
  const h = /** @type {any} */ (b.ball).hurt;
  assert.deepEqual([h.amount, h.every, h.until - w.frame], [1000, 45, 300 - 1]);
  run(w, c, 1, [deploy('a', 2, 3)]);
  const a = by(w, 'a');
  b.slide = undefined;
  b.x = a.x; b.y = a.y;
  const hp = a.hp;
  while (w.frame < h.next) step(w, c);
  step(w, c);
  assert.equal(hp - a.hp, 1000);
});

test('[足球-15] a 球德联 goalkeeper at half its HP rages 15 s — 攻击力 and 防御力 +200% — and goes for our operators', () => {
  const { w, c } = field([['enemy_4029_mukfub', 10, 4]]);
  const k = by(w, 'enemy_4029_mukfub'), base = attrs.statsOf(k);
  run(w, c, 1, [deploy('a', 4, 7)]);
  damage.dealDamage(w, null, k, { type: 'true', amount: k.maxHp / 2 }, c);
  run(w, c, 1);
  const s = attrs.statsOf(k);
  assert.deepEqual([s.atk, s.def], [base.atk * 3, base.def * 3]);
  const x0 = k.x;
  run(w, c, 30);
  assert.ok(k.x < x0 - 0.3, `toward the operator: ${x0 - k.x}`);
  run(w, c, 15 * 30);
  assert.equal(k.buffs.some((x) => x.key === 'rage'), false, 'over after 15 s');
});

test('[足球-15] a 战术队 muscleman chases one of ours that hit another player: 3 s at 移动速度 +140%, then 6 s of cooldown', () => {
  const { w, c } = field([['enemy_4024_mushtg', 9, 7], ['enemy_4022_mushtm', 4, 4]]);
  const m = by(w, 'enemy_4024_mushtg');
  run(w, c, 1, [deploy('a', 4, 3)]);
  const a = by(w, 'a');
  damage.dealDamage(w, a, by(w, 'enemy_4022_mushtm'), { type: 'phys', amount: 10 }, c);
  run(w, c, 2);
  const mark = m.buffs.find((x) => x.key === 'mark');
  assert.equal(mark?.value, a.id);
  assert.equal(Math.round(attrs.statsOf(m).moveSpeed * 100) / 100, Math.round(E['enemy_4024_mushtg'].moveSpeed * 2.4 * 100) / 100);
  const d0 = Math.hypot(m.x - a.x, m.y - a.y);
  run(w, c, 30);
  assert.ok(Math.hypot(m.x - a.x, m.y - a.y) < d0 - 0.5, 'beyond its radius, it goes for the marked one');
  assert.deepEqual(uncoveredAbilities([withFoeExtras('enemy_4024_mushtg', E['enemy_4024_mushtg']), withFoeExtras('enemy_4029_mukfub', E['enemy_4029_mukfub'])]), []);
});

test('[足球-15] an 爱球会 muscleman goes for the one of ours that can block nearest the ball, within 2.0 of it', () => {
  const { w, c } = field([['enemy_4027_muhryg', 9, 4], [BALL, 4, 2]]);
  const m = by(w, 'enemy_4027_muhryg');
  run(w, c, 1, [deploy('a', 2, 5)]);
  run(w, c, 1, [deploy('b', 6, 8)]);
  const a = by(w, 'a'), d0 = Math.hypot(m.x - a.x, m.y - a.y);
  run(w, c, 30);
  assert.ok(Math.hypot(m.x - a.x, m.y - a.y) < d0 - 0.3, 'toward the one by the ball, not the nearer one');
});
