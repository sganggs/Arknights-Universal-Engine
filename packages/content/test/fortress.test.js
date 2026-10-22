// 堡垒守御's levels as content (docs/spec/fortress.md 守御-1…守御-6, docs/spec/level.md 关卡-8): the levels being tested
// load with their enemies' abilities not supported yet named; the facilities', builders' and rubble pile's profiles;
// every seat's builder cards; IG-DF-1 played headless the same way twice, builders at every rest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, stateHash, deployProblem, facilities } from '@aue/sim';
import { levelAt, levelContent, matchContent, TESTING, withBuilders, LEVELS, OFFICIAL_SOURCE } from '../src/index.js';

/** The phases a `fortress` event tells (schema FORTRESS_PHASE). */
const FORTRESS_PHASE = { defend: 0, rest: 1 };

test('[关卡-8] [关卡-2] [守御-1] the 堡垒守御 levels and level files being tested load, naming their enemies\' abilities with no behaviour or missing values; others still refuse', async () => {
  assert.deepEqual(TESTING, ['act1multi_fortress_rm01', 'act1multi_fortress_hard-01']);
  for (const [id, rules] of /** @type {const} */ ([['act1multi_fortress_rm01', { rest: 65, wave: 120, waveLast: 300, life: 3, restAdd: 5 }],
    ['act1multi_fortress_hard-01', { rest: 60, wave: 100, waveLast: 120, life: 3, restAdd: 5 }]])) {
    for (const d of /** @type {const} */ (['NORMAL', 'FOUR_STAR'])) {
      const lv = levelAt(id, d);
      assert.ok((lv.level.uncovered ?? []).length > 0, `${id} ${d}`);
      assert.equal((lv.level.uncovered ?? []).includes('loot'), false, `${id} ${d} loot`);
      assert.deepEqual(lv.level.fortress, rules);
      assert.deepEqual(Object.keys(lv.level.branches ?? {}), ['mufrprn_branch']);
    }
  }
  const raw = /** @type {any} */ (LEVELS).act1multi_01, odd = { ...raw, enemies: Object.fromEntries(Object.entries(raw.enemies).map(([k, e]) => [k, { .../** @type {any} */ (e), talents: { nope: {} } }])) };
  assert.throws(() => levelAt('odd', 'NORMAL', undefined, { odd }), /enemy abilities not supported yet: nope/);
  assert.deepEqual(levelAt('odd', 'NORMAL', undefined, { odd: { ...odd, testing: true } }).level.uncovered, ['nope'], 'a level file that says it is being tested');
  const bare = { ...raw, enemies: Object.fromEntries(Object.entries(raw.enemies).map(([k, e]) => [k === 'enemy_1067_snslime' ? 'sh_slime' : k, e])) };
  bare.level = { ...raw.level, waves: raw.level.waves.map((/** @type {any} */ w) => ({ ...w, fragments: w.fragments.map((/** @type {any} */ f) => ({ ...f, actions: f.actions.map((/** @type {any} */ a) => (a.key === 'enemy_1067_snslime' ? { ...a, key: 'sh_slime' } : a)) })) })) };
  assert.throws(() => levelAt('bare', 'NORMAL', undefined, { bare }), /enemy abilities not supported yet: boom/, 'a 冰爆源石虫 without its PRTS radius and delay has no behaviour for its explosion');
  const source = { ...OFFICIAL_SOURCE, levels: { bare: { ...bare, testing: true } } };
  const tested = /** @type {any} */ (await matchContent({ level: 'bare', difficulty: 'NORMAL', seed: 1, decks: [[]] }, { source }));
  assert.deepEqual([tested.level.uncovered, tested.enemies.sh_slime.talents, tested.enemies.enemy_1067_snslime], [['boom'], {}, undefined], 'being tested, it is there without it');
  assert.equal(levelAt('act1multi_01', 'NORMAL').level.uncovered, undefined);
});

test('[守御-3] [守御-4] [守御-6] the devices of IG-DF-1: five kinds of facility with four modes, two builders, the rubble pile\'s range', () => {
  const { devices } = levelAt('act1multi_fortress_rm01', 'NORMAL');
  /** @type {Record<string, string>} */
  const kinds = {};
  for (const [k, d] of Object.entries(devices)) if (d.facility) kinds[k] = d.facility.kind;
  assert.deepEqual(kinds, { trap_205_mufrfm: 'workshop', trap_206_mufrbk: 'lounge', trap_207_mufrwl: 'platform', trap_208_mufrst: 'roadblock', trap_209_mufrbs: 'gym' });
  for (const d of Object.values(devices)) if (d.facility) assert.equal(d.facility.modes.length, 4);
  assert.equal(devices.trap_208_mufrst.facility?.boom, 20000);
  assert.deepEqual(devices.trap_205_mufrfm.facility?.modes.map((m) => m.cost), [10, 10, 15, 100]);
  assert.deepEqual(devices.trap_205_mufrfm.immune, ['stun', 'freeze', 'levitate', 'sleep']);
  assert.deepEqual([devices.trap_166_muwork.builder, devices.trap_166_muwork.cost], [{ sp: 'sp', hits: 5, life: 6 }, 0]);
  assert.deepEqual([devices.trap_202_muworkg.builder, devices.trap_202_muworkg.cost], [{ sp: 'sp2', hits: 18, life: 20 }, 5]);
  assert.deepEqual([devices.trap_203_mufrprn.rubble?.cells.length, devices.trap_203_mufrprn.rubble?.branch], [21, 'mufrprn_branch']);
});

test('[守御-4] [装置-7] a 堡垒守御 match: every seat\'s deck has the builders, then 轰隆隆先生, keyed id#seat', async () => {
  const c = await matchContent({ level: 'act1multi_fortress_rm01', difficulty: 'NORMAL', seed: 1, decks: [[], []] });
  assert.deepEqual(c.decks, [['trap_166_muwork#0', 'trap_202_muworkg#0', 'trap_018_bomb#0'], ['trap_166_muwork#1', 'trap_202_muworkg#1', 'trap_018_bomb#1']]);
  const b = c.operators['trap_202_muworkg#1'];
  assert.deepEqual([b.cost, b.position, b.trait?.free, b.trait?.noAttack, b.builder?.hits], [5, 'ALL', true, true, 18]);
  const plain = await matchContent({ level: 'act1multi_01', difficulty: 'NORMAL', seed: 1, decks: [[], []] });
  assert.deepEqual(plain.decks, [[], []]);
});

/** IG-DF-1 with every seat's builders, lives enough to see it through. */
function df1() {
  const c = /** @type {any} */ (levelContent('act1multi_fortress_rm01', 'NORMAL')), decks = [[], []];
  withBuilders(c.level, c.devices, c.operators, decks);
  c.level = { ...c.level, options: { ...c.level.options, maxLifePoint: 999 } };
  return c;
}

/** In a rest, each seat's builder cards next to the first facility below level 3 a builder may stand by. @param {any} w @param {any} c */
function builders(w, c) {
  /** @type {[number, any][]} */
  const out = [];
  for (const seat of [0, 1]) {
    for (const [op, n] of Object.entries(w.fortress.pools[seat])) {
      if (n <= 0) continue;
      const spots = facilities.facilities(w, c).filter(({ u }) => (u.fac?.level ?? 3) < 3)
        .flatMap(({ u }) => [[1, 0, 3], [-1, 0, 1], [0, 1, 2], [0, -1, 0]].map(([dr, dc, dir]) => ({ type: 'deploy', op, row: u.y + dr, col: u.x + dc, dir })));
      const cmd = spots.find((s) => deployProblem(w, c, seat, /** @type {any} */ (s)) === null);
      if (cmd) out.push([seat, cmd]);
    }
  }
  return out;
}

test('[守御-1] [守御-2] [守御-4] IG-DF-1 plays out headless the same way twice: defences and rests, builders raising facilities', () => {
  const c = df1();
  const play = () => {
    const w = /** @type {any} */ (createWorld(c, { seed: 5, players: 2 })), seen = /** @type {number[][]} */ ([]);
    for (let f = 0; f < 30 * 60 * 14 && w.result < 0; f++) {
      const cmds = w.fortress.phase === 'rest' && w.frame % 30 === 0 ? builders(w, c) : [];
      if (w.fortress.phase === 'rest' && w.frame + 30 * 40 >= w.fortress.until) cmds.push([0, { type: 'rest' }], [1, { type: 'rest' }]);
      for (const e of step(w, c, cmds)) if (e.type === 'fortress') seen.push([Number(e.wave), Number(e.phase)]);
    }
    return { w, seen, hash: stateHash(w) };
  };
  const a = play(), b = play();
  assert.equal(a.hash, b.hash);
  assert.deepEqual(a.seen.slice(0, 4), [[0, FORTRESS_PHASE.defend], [1, FORTRESS_PHASE.rest], [1, FORTRESS_PHASE.defend], [2, FORTRESS_PHASE.rest]]);
  assert.ok(facilities.facilities(a.w, c).some(({ u }) => (u.fac?.top ?? 0) >= 1), 'builders raised a facility');
  assert.ok(a.w.fortress.defended >= 2);
});
