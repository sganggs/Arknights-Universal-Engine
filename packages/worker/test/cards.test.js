// The deck's state the battle UI reads (界面-10, 界面-23) and the deploy marks of a summon (召唤-4, 渲染-8). Test names
// cite the clauses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '@aue/sim';
import { tinyContent } from '@aue/testkit';
import { operatorCards, summonCards } from '../src/cards.js';
import { deployableKeys } from '../src/marks.js';

const base = tinyContent();
/** A summon record of the guard. @param {Record<string, any>} s @returns {any} */
const summon = (s) => ({
  name: 'wolf', position: 'MELEE', cost: 0, blockCnt: 1, baseAttackTime: 1, maxHp: 100, atk: 10, def: 0, res: 0, range: [{ row: 0, col: 0 }], respawnTime: 10,
  summoner: 'guard', summon: { deployLimit: 1, holdLimit: 1, supply: 1, occupy: 1, respawn: 'default', ...s },
});
const c = /** @type {any} */ ({ ...base, operators: { ...base.operators, wolf: summon({ ownerRange: true }), mark: summon({ respawn: 'unique', occupy: 0 }), probe: summon({ supply: 0 }),
  gift: summon({ supply: 0, grant: { n: 1, at: 'start' } }) },
  decks: [['guard', 'sniper']] });
const deploy = (/** @type {Record<string, any>} */ o) => /** @type {any} */ ({ type: 'deploy', op: 'guard', row: 1, col: 2, dir: 0, ...o });

test('[界面-23] [召唤-4] [召唤-8] the summon cards: shown with their owner on the field, the copies, full, a deploy place taken', () => {
  const w = createWorld(c, { seed: 1, players: 1 });
  assert.deepEqual(Object.keys(summonCards(w, c, 0)), ['wolf', 'mark', 'gift'], 'a summon with no card has none; one its owner\'s skill gives has one (召唤-8)');
  assert.equal(summonCards(w, c, 0).wolf.shown, false, 'its owner not on the field');
  assert.equal(summonCards(w, c, 0).mark.shown, false);
  step(w, c, [[0, deploy({})]]);
  assert.deepEqual(summonCards(w, c, 0).wolf, { cost: 0, ready: 0, held: 1, cooling: 0, shown: true, full: false, occupy: true });
  step(w, c, [[0, deploy({ op: 'wolf', col: 3 })], [0, deploy({ op: 'mark', col: 1 })]]);
  const s = summonCards(w, c, 0);
  assert.deepEqual([s.wolf.shown, s.wolf.held, s.wolf.full], [false, 0, true], '默认: all used, none shown');
  assert.deepEqual([s.mark.shown, s.mark.held, s.mark.full], [true, 0, true], '唯一: shown while its one is on the field');
  assert.equal(operatorCards(w, c, 0).slots, 0, 'the guard and the wolf (部署占用数 1) take the two places');
  assert.deepEqual(operatorCards(w, c, 0).cards.guard, { cost: 5, ready: 0, locked: false });
});

test('[波次-9] the cards held back: a hidden level token card until its alias comes into effect', () => {
  const h = /** @type {any} */ ({ ...c, level: { ...c.level, cards: { operators: [], tokens: [{ key: 'sniper', alias: 'cheer', count: 1, hidden: true }] } } });
  const w = createWorld(h, { seed: 1, players: 1 });
  assert.deepEqual(operatorCards(w, h, 0).hidden, ['sniper']);
  w.predefined.push('cheer');
  assert.deepEqual(operatorCards(w, h, 0).hidden, []);
});

test('[召唤-4] [渲染-8] a summon that may only stand in its owner\'s range: its marks are the free tiles the owner reaches now', () => {
  const w = createWorld(c, { seed: 1, players: 1 });
  assert.deepEqual(deployableKeys(w, c, 'wolf', 0), [], 'no owner: nowhere');
  step(w, c, [[0, deploy({})]]);
  assert.deepEqual(deployableKeys(w, c, 'wolf', 0), [1 * 6 + 3], 'the guard reaches (1, 2) and (1, 3); it stands on (1, 2)');
  assert.ok(deployableKeys(w, c, 'mark', 0).length > 1, 'any other summon: every tile it fits');
});

/** The tiny level as 堡垒守御 (the engine's 守御-1…守御-5): a facility of `kind` on (0, 1), each seat a plain builder card. @param {string} kind */
function fortressOf(kind) {
  const f = /** @type {any} */ (tinyContent());
  f.level.fortress = { rest: 10, wave: 20, waveLast: 30, life: 1, restAdd: 0 };
  f.level.cards = { operators: [], tokens: [{ key: 'worker', alias: 'worker', count: 2, hidden: false }] };
  f.level.predefines = [{ alias: 'fac#1', key: 'fac', hidden: false, row: 0, col: 1, dir: 'UP' }];
  const rec = { name: 'd', maxHp: 1000, atk: 0, def: 0, res: 0, blockCnt: 3, baseAttackTime: 1, aspd: 100, tauntLevel: -1, massLevel: 0, talentBb: {} };
  f.devices = { fac: { ...rec, facility: { kind, modes: [{ sp: 1, cost: 3 }, { sp: 1, cost: 4, value_char: 1 }, { sp: 1, cost: 5 }, {}] } }, worker: { ...rec, builder: { sp: 'sp', hits: 5, life: 6 } } };
  f.operators['worker#0'] = { name: 'worker', position: 'ALL', cost: 0, blockCnt: 0, baseAttackTime: 1, maxHp: 100, atk: 100, def: 0, res: 0, range: [], profession: 'TRAP',
    trait: { free: true, noAttack: true }, respawnTime: 0, builder: { sp: 'sp', hits: 5, life: 6 } };
  f.decks = [['guard', 'sniper', 'worker#0']];
  return f;
}

test('[界面-39] [守御-4] a builder\'s marks: none in a defence; in a rest the free tiles next to a facility below level 3 it fits', () => {
  const f = fortressOf('workshop'), w = /** @type {any} */ (createWorld(f, { seed: 1, players: 1 }));
  assert.deepEqual(deployableKeys(w, f, 'worker#0', 0), []);
  w.fortress.phase = 'rest';
  assert.deepEqual(deployableKeys(w, f, 'worker#0', 0), [0 * 6 + 2, 1 * 6 + 1], 'the high ground beside it and the road above it; not the floor');
  w.units.find((/** @type {any} */ u) => u.fac).fac.level = 3;
  assert.deepEqual(deployableKeys(w, f, 'worker#0', 0), [], 'at level 3 it takes no builder');
});

test('[界面-39] [守御-5] a built 临时休息舱 adds deploy places; a built 液压式高台 is a tile for ranged operators', () => {
  const lounge = fortressOf('lounge'), w = /** @type {any} */ (createWorld(lounge, { seed: 1, players: 1 }));
  w.units.find((/** @type {any} */ u) => u.fac).fac.level = 1;
  assert.equal(operatorCards(w, lounge, 0).slots, 3);
  const pf = fortressOf('platform');
  pf.level.predefines[0] = { ...pf.level.predefines[0], row: 1, col: 4 };
  const w2 = /** @type {any} */ (createWorld(pf, { seed: 1, players: 1 }));
  assert.equal(deployableKeys(w2, pf, 'sniper', 0).includes(1 * 6 + 4), false);
  w2.units.find((/** @type {any} */ u) => u.fac).fac.level = 1;
  assert.equal(deployableKeys(w2, pf, 'sniper', 0).includes(1 * 6 + 4), true);
});

test('[界面-41] [足球-14] a ball card is held back until its seat holds a caught ball', () => {
  const c = /** @type {any} */ (tinyContent());
  c.operators.ball = { ...c.operators.guard, name: 'ball', ballCard: true, cost: 3 };
  c.decks = [['guard', 'ball']];
  const w = /** @type {any} */ (createWorld(c, { seed: 1, players: 1 }));
  assert.deepEqual(operatorCards(w, c, 0).hidden, ['ball']);
  w.players[0].balls = [{ id: 9, until: 150, row: 1, col: 1 }];
  assert.deepEqual(operatorCards(w, c, 0).hidden, []);
});
