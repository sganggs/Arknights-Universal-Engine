// 轰隆隆先生 on the field (docs/spec/devices.md 装置-7, docs/spec/foes.md 敌能-80): a counted card, a cross of stun
// 1.5s after deploy, then it is gone. The redeploy time started at deploy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, deployProblem, damage, attrs, buffs } from '@aue/sim';
import { secondsToFrames } from '@aue/math';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';

const KEY = 'trap_018_bomb';
const CARD = 'trap_018_bomb#0';
const STUN = secondsToFrames(12);

/** @param {Record<string, unknown>} [more] */
function foe(more = {}) {
  return { name: 'e', maxHp: 100, atk: 0, def: 0, res: 0, moveSpeed: 0, ...more };
}

/** @param {Record<string, ReturnType<typeof foe>>} enemies */
function field(enemies) {
  const c = tinyContent();
  c.level.options.initialCost = 30;
  c.level.options.maxCost = 99;
  // The level's cap is 12 and a tick clamps cost down to it, which would hide a refund. Freeze recovery.
  c.level.options.costIncreaseTime = 1e9;
  c.level.options.characterLimit = 1;
  c.enemies = enemies;
  c.operators[CARD] = {
    name: '轰隆隆先生', position: 'MELEE', cost: 5, blockCnt: 0, baseAttackTime: 1, maxHp: 100, atk: 0, def: 0, res: 0,
    range: [], profession: 'TRAP', trait: { free: true, noAttack: true, refund: 0, flags: { untargetable: true } },
    respawnTime: 5, char: KEY, rumble: { delay: 1.5, stun: 12, respawn: 5, start: 0 },
  };
  c.decks = [[CARD, 'guard', 'sniper'], []];
  c.level.waves = [oneWave(Object.keys(enemies).map((k) => spawnAt(0, k)))];
  const w = createWorld(c, { seed: 1, players: 2 });
  const pile = w.players[0].loot?.[CARD];
  assert.ok(pile);
  pile.held = 1;
  return { c, w };
}

/** @param {import('@aue/sim').World} w @param {import('@aue/sim').Content} c @param {number} frame */
function reach(w, c, frame) {
  while (w.frame < frame) step(w, c);
}

/** @param {number} row @param {number} col @returns {import('@aue/schema').DeployCommand} */
const at = (row, col) => ({ type: 'deploy', op: CARD, row, col, dir: 0 });

/** Where each labelled enemy stands for the cross. Row, then column. */
const SPOT = { self: [1, 1], flyer: [1, 2], side: [2, 1], neutral: [1, 0], diag: [2, 2], far: [1, 4], hid: [1, 1] };

/** @param {import('@aue/sim').World} w */
function put(w) {
  for (const u of w.units) {
    const spot = SPOT[/** @type {keyof typeof SPOT} */ (u.key)];
    if (!spot) continue;
    u.y = spot[0];
    u.x = spot[1];
  }
}

/** @param {import('@aue/sim').World} w @param {string} key */
function stunLeft(w, key) {
  const u = w.units.find((x) => x.key === key);
  return u?.buffs.find((b) => b.key === 'stun')?.left ?? 0;
}

/** @param {import('@aue/sim').World} w @param {string} key */
function stunResist(w, key) {
  const u = w.units.find((x) => x.key === key);
  return u?.buffs.find((b) => b.key === 'stun')?.resist ?? false;
}

const AREA = {
  self: foe(), flyer: foe({ motion: 'FLY' }), side: foe(), neutral: foe({ neutral: true }), diag: foe(), far: foe(),
};

test('[装置-7] [敌能-80] no copy held cannot deploy, and a deck without the card has no loot pile', () => {
  const c = tinyContent();
  const bare = createWorld(c, { seed: 1, players: 2 });
  assert.equal(Object.hasOwn(bare.players[0], 'loot'), false);
  assert.equal(Object.hasOwn(bare.players[1], 'loot'), false);
  const { c: armed, w } = field({});
  w.players[0].loot?.[CARD] && (w.players[0].loot[CARD].held = 0);
  assert.equal(deployProblem(w, armed, 0, at(1, 1)), 'no device card left');
});

test('[装置-7] it deploys on a melee tile, free of the deploy limit, blocking nothing and untargetable', () => {
  const { c, w } = field({});
  assert.equal(deployProblem(w, c, 0, at(0, 2)), 'tile not buildable for this operator');
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 3, dir: 0 }]]);
  assert.equal(deployProblem(w, c, 0, { type: 'deploy', op: 'sniper', row: 0, col: 2, dir: 0 }), 'deploy limit reached');
  assert.equal(deployProblem(w, c, 0, at(1, 1)), null);
  step(w, c, [[0, at(1, 1)]]);
  const u = w.units.find((x) => x.key === CARD);
  assert.ok(u);
  assert.equal(u.base.blockCnt, 0);
  assert.equal(attrs.statsOf(u).flags.untargetable, true);
  assert.equal(w.players[0].deployed.includes(CARD), false);
  assert.equal(w.players[0].cost, 20);
});

test('[装置-7] 1.5s after deploy it stuns the cross, a flyer included, then it is gone', () => {
  const { c, w } = field(AREA);
  step(w, c, [[0, at(1, 1)]]);
  const cost = w.players[0].cost;
  const id = w.units.find((u) => u.key === CARD)?.id;
  reach(w, c, 45);
  put(w);
  assert.equal(w.units.some((u) => u.key === CARD), true);
  const events = step(w, c);
  assert.equal(w.units.some((u) => u.key === CARD), false);
  assert.equal(w.players[0].cost, cost);
  assert.equal(events.some((e) => e.type === 'death' && e.id === id), true);
  assert.equal(events.some((e) => e.type === 'retreat'), false);
  assert.equal(attrs.statsOf(/** @type {import('@aue/sim').Unit} */ (w.units.find((u) => u.key === 'flyer'))).flying, true);
  for (const key of ['self', 'flyer', 'side']) {
    assert.equal(stunLeft(w, key), STUN, key);
    assert.equal(stunResist(w, key), true, key);
  }
  for (const key of ['neutral', 'diag', 'far']) assert.equal(stunLeft(w, key), 0, key);
});

test('[装置-7] an untargetable enemy on its tile is stunned; a hidden one is too', () => {
  const { c, w } = field({ hid: foe() });
  step(w, c, [[0, at(1, 1)]]);
  reach(w, c, 45);
  put(w);
  const hid = w.units.find((u) => u.key === 'hid');
  assert.ok(hid);
  hid.hidden = true;
  buffs.addBuff(hid, buffs.makeBuff({ key: 'hide', flags: { untargetable: true } }));
  step(w, c);
  assert.equal(stunLeft(w, 'hid'), STUN);
});

test('[装置-7] silenced at the trigger, it does not stun and still breaks', () => {
  const { c, w } = field({ self: foe() });
  step(w, c, [[0, at(1, 1)]]);
  reach(w, c, 45);
  put(w);
  const dev = w.units.find((u) => u.key === CARD);
  assert.ok(dev);
  buffs.addBuff(dev, buffs.makeBuff({ key: 'silence', flags: { silence: true } }));
  step(w, c);
  assert.equal(w.units.some((u) => u.key === CARD), false);
  assert.equal(stunLeft(w, 'self'), 0);
});

test('[装置-7] a retreat before it triggers refunds nothing and does not stun; the copy returns on the deploy timer', () => {
  const { c, w } = field({ self: foe() });
  step(w, c, [[0, at(1, 1)]]);
  const dev = w.units.find((u) => u.key === CARD);
  assert.ok(dev);
  const cost = w.players[0].cost;
  step(w, c, [[0, { type: 'retreat', unit: dev.id }]]);
  assert.equal(w.players[0].cost, cost);
  assert.equal(w.players[0].loot?.[CARD].held, 0);
  reach(w, c, 45);
  put(w);
  step(w, c);
  assert.equal(stunLeft(w, 'self'), 0);
  assert.equal(w.players[0].loot?.[CARD].held, 0);
  reach(w, c, 151);
  assert.equal(w.players[0].loot?.[CARD].held, 1);
  assert.equal(w.players[0].cost, cost);
});

test('[装置-7] broken before 1.5s, it does not stun and the cost stays spent', () => {
  const { c, w } = field({ self: foe() });
  step(w, c, [[0, at(1, 1)]]);
  const cost = w.players[0].cost;
  const dev = w.units.find((u) => u.key === CARD);
  assert.ok(dev);
  damage.knockDown(dev);
  reach(w, c, 45);
  put(w);
  step(w, c);
  assert.equal(stunLeft(w, 'self'), 0);
  assert.equal(w.players[0].cost, cost);
  reach(w, c, 151);
  assert.equal(w.players[0].loot?.[CARD].held, 1);
});

test('[装置-7] after it breaks, the copy returns 5s from deploy and the cost stays spent', () => {
  const { c, w } = field({});
  step(w, c, [[0, at(1, 1)]]);
  const cost = w.players[0].cost;
  reach(w, c, 46);
  assert.equal(w.units.some((u) => u.key === CARD), false);
  assert.equal(w.players[0].loot?.[CARD].held, 0);
  assert.equal(w.players[0].cost, cost);
  reach(w, c, 151);
  assert.equal(w.players[0].loot?.[CARD].held, 1);
});
