// Control deadlines between sealing ticks (docs/spec/lockstep.md 同步-3, 同步-6–同步-8): controlled wall times in ms.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { LockstepHost, framesAt, PAUSE_ASK_MS } from '../src/index.js';

/** Both seats ready at 0, paused at 50; resume requested at 60, due at 1060. */
function resuming() {
  /** @type {any[]} */
  const controls = [];
  const host = new LockstepHost({ content: tinyContent(), seats: 2, seed: 1,
    send: (seat, msg) => { if (seat === 0 && msg.t === 'control') controls.push(msg); } });
  for (const seat of [0, 1]) { host.hello(seat, 0); host.ready(seat, 0); }
  host.pause(0, 50); host.pauseReply(1, 1, 50); host.resume(0, 60);
  host.tick(1056);
  return { host, controls };
}

test('[同步-3] [同步-7] [同步-8] speed changes after a resume deadline and before the next tick split the elapsed time', () => {
  const { host, controls } = resuming();
  host.speed(0, 1, 1063);
  host.speed(1, 1, 1068);
  host.tick(1072);
  // 50 before the pause, 8 at 1× after 1060, then 4 at 2×: 66, not 74.
  assert.equal(host.battleMs(1072), 66);
  assert.equal(host.sealed + 1, framesAt(66));
  assert.deepEqual(controls.slice(-3).map((m) => [m.held, m.resuming, m.fast]),
    [[0, 0, [0, 0]], [0, 0, [1, 0]], [0, 0, [1, 1]]], 'the due resume is announced before the switches');
});

for (const offset of [-1, 0, 1]) test(`[同步-7] [同步-8] speed at resume deadline ${offset >= 0 ? '+' : ''}${offset} ms`, () => {
  const { host } = resuming();
  const at = 1060 + offset;
  host.speed(0, 1, at); host.speed(1, 1, at);
  host.tick(1072);
  const expected = 50 + Math.max(0, offset) + (1072 - Math.max(1060, at)) * 2;
  assert.equal(host.battleMs(1072), expected);
});

test('[同步-7] [同步-8] turning 2× off after the resume deadline keeps the earlier interval at 2×', () => {
  const { host } = resuming();
  host.speed(0, 1, 1057); host.speed(1, 1, 1057);
  host.speed(0, 0, 1068);
  host.tick(1072);
  assert.equal(host.battleMs(1072), 50 + 8 * 2 + 4);
});

test('[同步-8] a new pause after the resume deadline is accepted before the next tick', () => {
  const { host } = resuming();
  host.pause(1, 1063);
  assert.deepEqual([host.held, host.asker, host.resumeAt], [false, 1, null]);
  host.pauseReply(0, 1, 1066);
  host.tick(1072);
  assert.deepEqual([host.held, host.battleMs(1072)], [true, 56]);
});

test('[同步-8] pause and resume between ticks preserve the running time on each side of the pause', () => {
  const { host } = resuming();
  host.tick(1072);
  assert.equal(host.battleMs(1072), 62);
  host.resume(1, 1073);
  assert.equal(host.resumeAt, null, 'a second resume after the deadline cannot start another wait');
});

test('[同步-8] a repeated resume after its deadline settles the first one before the next tick', () => {
  const { host } = resuming();
  host.resume(1, 1068);
  assert.deepEqual([host.held, host.resumeAt, host.battleMs(1068)], [false, null, 58]);
  host.tick(1072);
  assert.equal(host.battleMs(1072), 62);
});

test('[同步-6] [同步-8] leaving after a due resume counts the connected interval but not the later offline interval', () => {
  const { host } = resuming();
  host.bye(0, 1063); host.bye(1, 1068);
  host.tick(1072);
  host.tick(2000);
  host.hello(0, 2000);
  host.tick(2010);
  assert.equal(host.battleMs(2010), 68, '50 + 8 connected after resume + 10 after reconnect');
  assert.equal(host.sealed + 1, framesAt(68));
});

test('[同步-6] [同步-8] reconnecting after a due resume starts time at the reconnect and sends current controls', () => {
  const { host, controls } = resuming();
  host.bye(0, 1057); host.bye(1, 1058);
  host.hello(0, 1068);
  assert.deepEqual(controls.at(-1), { t: 'control', fast: [0, 0], held: 0, asker: -1, resuming: 0 });
  host.tick(1072);
  assert.equal(host.battleMs(1072), 54, 'the offline part after 1060 is not counted');
});

for (const offset of [-1, 0, 1]) test(`[同步-8] pause reply at request expiry ${offset >= 0 ? '+' : ''}${offset} ms`, () => {
  const { host } = resuming();
  host.tick(1072);
  host.pause(0, 1080);
  host.pauseReply(1, 1, 1080 + PAUSE_ASK_MS + offset);
  assert.deepEqual([host.held, host.asker], [offset < 0, -1]);
});

test('[同步-8] a fresh request at the old request expiry replaces the expired one before a tick', () => {
  const { host } = resuming();
  host.tick(1072);
  host.pause(0, 1080);
  host.pause(1, 1080 + PAUSE_ASK_MS);
  assert.deepEqual([host.asker, host.askedAt], [1, 1080 + PAUSE_ASK_MS]);
});
