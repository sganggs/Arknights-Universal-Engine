// 赞助无人机 drops 轰隆隆先生 (docs/spec/foes.md 敌能-80, docs/spec/devices.md 装置-7). The level record carries the
// blackboard the enemy database does not; the card's redeploy time is the page's, not a field of that record.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, damage, attrs } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { levelAt, withLootCards, skeletonContent } from '../src/index.js';
import { withFoeExtras } from '../src/foes.js';

const KEY = 'trap_018_bomb';
/** @param {number} seat */
const CARD = (seat) => `${KEY}#${seat}`;

/**
 * What `levelAt` returns, named here so the helpers do not ask `ReturnType` (that cycles under checkJs).
 * @typedef {{
 *   level: import('@aue/sim').Content['level'],
 *   enemies: Record<string, import('@aue/sim').EnemyDef>,
 *   devices: Record<string, import('@aue/sim').DeviceDef>,
 * }} Loaded
 */

/** @param {number} [start] */
function rumbleOp(start = 0) {
  return {
    name: '轰隆隆先生', position: 'MELEE', cost: 5, blockCnt: 0, baseAttackTime: 1, maxHp: 100, atk: 0, def: 0, res: 0,
    range: [], profession: 'TRAP', trait: { free: true, noAttack: true, refund: 0, flags: { untargetable: true } },
    respawnTime: 5, char: KEY, rumble: { delay: 1.5, stun: 12, respawn: 5, start },
  };
}

/** @param {Record<string, unknown>} bb @param {number} [moveSpeed] */
function drone(bb, moveSpeed = 0) {
  return {
    name: '赞助无人机', maxHp: 100, atk: 0, def: 0, res: 0, moveSpeed, motion: 'FLY', applyWay: 'NONE', lifePointReduce: 0,
    immune: ['silence'], talents: { loot: bb, Static: {}, NoAttack: {} },
  };
}

/** @param {Record<string, unknown>} bb @param {number} [moveSpeed] */
function dropped(bb, moveSpeed = 0) {
  const c = tinyContent();
  c.enemies = { drone: drone(bb, moveSpeed) };
  c.behaviors = skeletonContent.behaviors;
  c.operators[CARD(0)] = rumbleOp(0);
  c.operators[CARD(1)] = rumbleOp(0);
  c.decks = [[CARD(0)], [CARD(1)]];
  c.level.waves = [oneWave([spawnAt(0, 'drone')])];
  return { c, w: createWorld(c, { seed: 1, players: 2 }) };
}

/** @param {import('@aue/sim').World} w @param {import('@aue/sim').Content} c */
function knock(w, c) {
  step(w, c);
  const e = w.units.find((u) => u.key === 'drone');
  assert.ok(e);
  damage.knockDown(e);
  step(w, c);
  return e;
}

test('[敌能-80] a knocked-down 赞助无人机 gives one 轰隆隆先生 to each seat', () => {
  const { c, w } = dropped({ token_key: KEY, cnt: 1 });
  const e = knock(w, c);
  assert.equal(attrs.statsOf(e).flags.noAttack, true);
  assert.equal(attrs.statsOf(e).flags.staticBody, true);
  assert.equal(attrs.statsOf(e).flying, true);
  assert.equal(w.players[0].loot?.[CARD(0)].held, 1);
  assert.equal(w.players[1].loot?.[CARD(1)].held, 1);
});

test('[敌能-80] cnt is floored, and each seat gets that many', () => {
  const { c, w } = dropped({ token_key: KEY, cnt: 2.9 });
  knock(w, c);
  assert.equal(w.players[0].loot?.[CARD(0)].held, 2);
  assert.equal(w.players[1].loot?.[CARD(1)].held, 2);
});

test('[敌能-80] reaching the goal gives no card', () => {
  const { c, w } = dropped({ token_key: KEY, cnt: 1 }, 20);
  let goal = false;
  for (let i = 0; i < 400 && !goal; i++) goal = step(w, c).some((e) => e.type === 'goal');
  assert.equal(goal, true);
  assert.equal(w.players[0].life, 3);
  assert.equal(w.players[0].loot?.[CARD(0)].held, 0);
  assert.equal(w.players[1].loot?.[CARD(1)].held, 0);
});

test('[敌能-80] no token_key, or a cnt that is not positive, gives nothing', () => {
  const boards = [{ cnt: 1 }, { token_key: KEY, cnt: 0 }, { token_key: '', cnt: 3 }, { token_key: KEY, cnt: -2 }];
  for (const bb of boards) {
    const { c, w } = dropped(bb);
    knock(w, c);
    assert.equal(w.players[0].loot?.[CARD(0)].held, 0, JSON.stringify(bb));
    assert.equal(w.players[1].loot?.[CARD(1)].held, 0, JSON.stringify(bb));
  }
});

/** @param {Loaded} lv @param {string} difficulty */
function gapOmitsLoot(lv, difficulty) {
  const uncovered = lv.level.uncovered ?? [];
  assert.equal(uncovered.includes('loot'), false, difficulty);
  assert.ok(uncovered.length > 0, difficulty);
}

/** @param {Loaded} lv */
function rumbleProfile(lv) {
  const d = lv.devices.trap_018_bomb;
  assert.deepEqual(d.rumble, { delay: 1.5, stun: 12, respawn: 5 });
  assert.equal(d.inert, undefined);
  assert.equal(d.cost, 5);
  assert.equal(d.maxHp, 100);
}

/** @param {Loaded} lv */
function droneRecord(lv) {
  const raw = lv.enemies.enemy_1105_tyokai;
  const talents = raw.talents;
  assert.ok(talents);
  assert.equal(Object.hasOwn(talents, 'Static'), false);
  assert.deepEqual(talents.loot, { token_key: KEY, cnt: 1 });
  const extra = withFoeExtras('enemy_1105_tyokai', raw).talents;
  assert.ok(extra);
  assert.deepEqual(extra.Static, {});
  assert.deepEqual(extra.NoAttack, {});
  assert.deepEqual(extra.loot, talents.loot);
}

/** @param {Loaded} lv */
function rumbleCard(lv) {
  const tokens = lv.level.cards && lv.level.cards.tokens;
  assert.ok(tokens);
  const token = tokens.find((t) => t.key === KEY);
  assert.ok(token);
  assert.equal(token.count, 0);
  /** @type {Record<string, import('@aue/sim').OperatorDef>} */
  const operators = {};
  const decks = [[], []];
  withLootCards(lv.level, lv.devices, operators, decks);
  assert.deepEqual(decks, [[CARD(0)], [CARD(1)]]);
  const op = operators[CARD(0)];
  const rumble = op.rumble, trait = op.trait, flags = trait && trait.flags;
  assert.ok(rumble && flags);
  assert.deepEqual([op.cost, op.position, op.respawnTime, op.blockCnt, rumble.start], [5, 'MELEE', 5, 0, 0]);
  assert.deepEqual([trait && trait.free, trait && trait.noAttack, trait && trait.refund, flags.untargetable], [true, true, 0, true]);
}

test('[敌能-80] [装置-7] IG-DF-1 profiles 轰隆隆先生 and no longer lists loot as a gap', () => {
  for (const difficulty of /** @type {const} */ (['NORMAL', 'FOUR_STAR'])) {
    const lv = levelAt('act1multi_fortress_rm01', difficulty);
    gapOmitsLoot(lv, difficulty);
    rumbleProfile(lv);
    droneRecord(lv);
    rumbleCard(lv);
  }
});
