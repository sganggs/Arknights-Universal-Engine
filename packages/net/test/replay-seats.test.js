// Replay must rebuild the arbiter's player count, even when native Content has no optional decks (同步-5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step, stateHash, takeSnapshot, bus, traits } from '@aue/sim';
import { serverMessageProblem } from '@aue/schema';
import { LockstepHost, LockstepClient } from '../src/index.js';

/** Native content without a fixed deck, with a documented per-world timer (钩子-4). */
function content() {
  const c = tinyContent();
  c.behaviors = { world: (/** @type {import('@aue/sim').World} */ w, /** @type {import('@aue/sim').Content} */ cc) => {
    bus.every(w, 7, () => w.players.forEach((_p, seat) => traits.gainCost(w, cc, seat, 1)));
  } };
  return c;
}

/** Only connect; no host clock advancement or controls. @param {number} seats @param {number} seat @param {boolean} [replay] */
function join(seats, seat, replay = true) {
  const c = content(), messages = /** @type {import('@aue/schema').ServerMessage[]} */ ([]);
  const events = /** @type {Record<string, string | number>[][]} */ ([]);
  if (!replay) delete c.behaviors;
  const host = new LockstepHost({ content: c, seats, seed: 7, send: (_s, m) => messages.push(m) });
  host.hello(seat, 0);
  const welcome = messages.find((m) => m.t === 'welcome');
  assert.ok(welcome);
  assert.equal(serverMessageProblem(welcome), null);
  assert.equal(host.world.frame, 0);
  const client = new LockstepClient({ content: c, send: () => {}, onFrame: (_w, ev) => events.push(structuredClone(ev)) });
  client.receive(JSON.parse(JSON.stringify(welcome)));
  assert.ok(client.world);
  return { c, host, client, events };
}

for (const [seats, seat] of [[1, 0], [2, 0], [2, 1]]) {
  test(`[同步-5] replay welcome without decks: ${seats} players, joining seat ${seat}`, () => {
    const { host, client } = join(seats, seat);
    assert.equal(client.world?.players.length, seats, 'replay uses the arbiter player count');
    assert.equal(stateHash(/** @type {import('@aue/sim').World} */ (client.world)), stateHash(host.world));
    assert.deepEqual(takeSnapshot(/** @type {import('@aue/sim').World} */ (client.world)), takeSnapshot(host.world));
  });
}

test('[同步-5] replay resync keeps the welcome player count, a mate deploy and native timers', () => {
  const { c, client, events } = join(2, 0), expected = createWorld(c, { seed: 7, players: 2 });
  const cmd = /** @type {const} */ ({ type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 });
  client.receive({ t: 'frames', from: 0, to: 19, cmds: [[0, 1, cmd]] });
  while (client.backlog() > 0) client.pump();
  for (let f = 0; f <= 19; f++) assert.deepEqual(events[f], step(expected, c, f === 0 ? [[1, cmd]] : []));
  assert.ok(client.world);
  assert.deepEqual(takeSnapshot(client.world), takeSnapshot(expected), 'timer callbacks ran before recovery');
  const msg = /** @type {const} */ ({ t: 'resync', snapshot: null, frame: 19, replay: /** @type {[number, number, import('@aue/schema').Command][]} */ ([[0, 1, cmd]]) });
  assert.equal(serverMessageProblem(msg), null);
  client.receive(JSON.parse(JSON.stringify(msg)));
  assert.equal(client.world.units.filter((u) => u.owner === 1).length, 1, 'seat 1 deployed during replay');
  assert.equal(stateHash(client.world), stateHash(expected), 'the setup and its timers agree after recovery');
  assert.deepEqual(takeSnapshot(client.world), takeSnapshot(expected));
  client.receive({ t: 'frames', from: 20, to: 39, cmds: [] });
  while (client.backlog() > 0) client.pump();
  for (let f = 20; f <= 39; f++) assert.deepEqual(events[f], step(expected, c));
  assert.deepEqual(takeSnapshot(client.world), takeSnapshot(expected), 'restored timers continue');
});

test('[同步-5] a native snapshot welcome without decks keeps both players', () => {
  const { host, client } = join(2, 1, false);
  assert.ok(client.world);
  assert.deepEqual(takeSnapshot(client.world), takeSnapshot(host.world));
});
