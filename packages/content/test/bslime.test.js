// 高能源石虫 and 高能源石虫·α (docs/spec/foes.md 敌能-5). No AUE level carries them yet, so the records are built
// here from the game data (ArknightsGameData 17759cc enemy_database: maxHp 2460 / 3700, atk 260 / 350, def 0, res 0,
// boom.atk_scale 4); a mod level can bring them. Talent boom: radius 1.25, delay 1 s, 400% physical, no air, source
// invalid, silenceable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent, withFoeExtras } from '../src/index.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

const HP = 1e6;
/** Physical damage after DEF, at least 5% (伤害-1). @param {number} atk @param {number} def */
const phys = (atk, def) => Math.max(atk - def, atk * 0.05);

/**
 * The enemy as the game data gives it, its talent as the data names it. Extras merge on top.
 * @param {string} key @param {number} atk @param {number} maxHp
 */
function record(key, atk, maxHp) {
  return withFoeExtras(key, { name: key, maxHp, atk, def: 0, res: 0, moveSpeed: 1, talents: { boom: { atk_scale: 4 } } });
}

/**
 * Tiny map: the built enemy stands at (row 1, col 3). A ground ally one tile away, a ground ally two tiles away,
 * and a levitated ally one tile away. Returns after the deploy frame.
 * @param {string} key @param {number} atk @param {number} maxHp
 */
function arena(key, atk, maxHp) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [key]: record(key, atk, maxHp) };
  c.behaviors = skeletonContent.behaviors;
  c.operators.far = { ...c.operators.guard, name: 'far' };
  c.level.waves = [oneWave([spawnAt(0, key)])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, characterLimit: 9 };
  for (const o of Object.values(c.operators)) Object.assign(o, { cost: 0, maxHp: HP });
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = /** @type {Unit} */ (w.units.find((u) => u.owner < 0));
  e.x = 3; e.y = 1;
  status.applyStatus(e, 'root', {});
  step(w, c, [
    [0, { type: 'deploy', op: 'guard', row: 1, col: 2, dir: 0 }],
    [0, { type: 'deploy', op: 'far', row: 1, col: 1, dir: 0 }],
    [0, { type: 'deploy', op: 'sniper', row: 2, col: 3, dir: 0 }],
  ]);
  const by = Object.fromEntries(w.units.filter((u) => u.owner >= 0).map((u) => [u.key, u]));
  status.applyStatus(by.sniper, 'levitate', {});
  return { c, w, e, near: by.guard, far: by.far, air: by.sniper };
}

/** Runs n frames; the events with their frame. @param {World} w @param {any} c @param {number} n */
function run(w, c, n) {
  /** @type {any[]} */
  const out = [];
  for (let i = 0; i < n; i++) for (const ev of step(w, c)) out.push({ ...ev, f: w.frame - 1 });
  return out;
}

/** Knocked down: the queued blast, then who it hits one second later. @param {string} key @param {number} atk @param {number} maxHp */
function knockedDown(key, atk, maxHp) {
  const { c, w, e, near, far, air } = arena(key, atk, maxHp);
  assert.equal(attrs.statsOf(air).flying, true);
  e.hp = 0;
  step(w, c);
  const [b] = w.blasts;
  assert.equal(w.blasts.length, 1);
  assert.deepEqual([b.src, b.radius, b.air, b.type, b.amount], [-1, 1.25, false, 'phys', atk * 4]);
  const ev = run(w, c, 31);
  const hits = ev.filter((x) => x.type === 'hit' && x.target === near.id);
  assert.deepEqual(hits.map((x) => [x.f, x.id, x.damage]), [[32, -1, phys(atk * 4, near.base.def)]]);
  assert.deepEqual(ev.filter((x) => x.type === 'blast').map((x) => x.f), [32]);
  assert.equal(far.hp, HP);
  assert.equal(air.hp, HP);
}

test('[敌能-5] 高能源石虫 and ·α: PRTS extras on talent boom; the record keeps 攻击力 400%', () => {
  const bb = { atk_scale: 4, radius: 1.25, delay: 1, arts: 0, air: 0, sourced: 0 };
  assert.deepEqual(record('enemy_1021_bslime', 260, 2460).talents?.boom, bb);
  assert.deepEqual(record('enemy_1021_bslime_2', 350, 3700).talents?.boom, bb);
});

test('[敌能-5] 高能源石虫: knocked down, after 1 s a physical 400% explosion of radius 1.25 hits the ground ally inside it; not the one outside, not the flying one; the hit has no source', () => {
  knockedDown('enemy_1021_bslime', 260, 2460);
});

test('[敌能-5] 高能源石虫·α: the same explosion, at its own attack (350 × 400%)', () => {
  knockedDown('enemy_1021_bslime_2', 350, 3700);
});

test('[敌能-5] 高能源石虫 and ·α: silenced, the death explosion does not happen', () => {
  for (const [key, atk, maxHp] of /** @type {const} */ ([['enemy_1021_bslime', 260, 2460], ['enemy_1021_bslime_2', 350, 3700]])) {
    const { c, w, e, near } = arena(key, atk, maxHp);
    status.applyStatus(e, 'silence', {});
    e.hp = 0;
    assert.equal(run(w, c, 40).filter((x) => x.type === 'blast').length, 0);
    assert.equal(w.blasts.length, 0);
    assert.equal(near.hp, HP);
  }
});
