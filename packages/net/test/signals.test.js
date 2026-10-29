// Signals between seats (docs/spec/lockstep.md 同步-13): their shape, the host passing them on once the battle has begun
// and until it ends, a seat's rate, the mode's rule, and the client's side.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientMessageProblem, serverMessageProblem, signalProblem, PROTOCOL_VERSION } from '@aue/schema';
import { tinyContent } from '@aue/testkit';
import { LockstepHost, LockstepClient, SIGNAL_RATE } from '../src/index.js';

/** A host of two seats, both connected, recording what it sends; `rule`, the mode's rule. @param {(seat: number, s: any, now: number) => boolean} [rule] */
function host2(rule) {
  /** @type {[number, any][]} */
  const out = [];
  const host = new LockstepHost({ content: tinyContent(), seats: 2, seed: 1, send: (seat, msg) => out.push([seat, msg]), ...(rule ? { signals: rule } : {}) });
  host.hello(0, 0);
  host.hello(1, 0);
  return { host, out, signals: () => out.filter(([, m]) => m.t === 'signal') };
}

const EMOTE = { kind: 'emote', id: 'multiv3_battle_thanks', theme: 'emoticon_basic' };

test('[同步-13] a signal: a kind and at most five small fields, numbers from 0 to 9999 or short ids', () => {
  assert.equal(PROTOCOL_VERSION, 11);
  assert.equal(signalProblem(EMOTE), null);
  assert.equal(signalProblem({ kind: 'mark', row: 3, col: 7, tip: 0 }), null);
  assert.equal(clientMessageProblem({ t: 'signal', s: EMOTE }), null);
  assert.equal(serverMessageProblem({ t: 'signal', seat: 1, s: EMOTE }), null);
  for (const bad of [null, {}, { kind: 3 }, { kind: 'mark', row: -1 }, { kind: 'mark', row: 10000 }, { kind: 'mark', row: 1.5 }, { kind: 'mark', note: 'hello world!' },
    { kind: 'x', a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 }, { kind: 'x', 'Bad-Key': 1 }, { kind: 'x', nested: { a: 1 } }]) {
    assert.ok(signalProblem(bad), `${JSON.stringify(bad)} is refused`);
  }
  assert.match(String(clientMessageProblem({ t: 'signal', s: EMOTE, extra: 1 })), /unknown field/);
  assert.match(String(serverMessageProblem({ t: 'signal', seat: 8, s: EMOTE })), /seat/);
});

test('[同步-13] the host passes a signal on with its seat to every connected seat, only once the battle has begun', () => {
  const { host, signals } = host2();
  host.signal(0, EMOTE, 10);
  assert.equal(signals().length, 0, 'before both seats are ready');
  host.ready(0, 20);
  host.ready(1, 20);
  host.signal(1, EMOTE, 30);
  assert.deepEqual(signals(), [[0, { t: 'signal', seat: 1, s: EMOTE }], [1, { t: 'signal', seat: 1, s: EMOTE }]]);
  host.bye(0, 40);
  host.signal(1, EMOTE, 50);
  assert.deepEqual(signals().slice(2).map(([to]) => to), [1], 'a seat that left gets none');
  host.world.result = 1;
  host.signal(1, EMOTE, 60);
  assert.equal(signals().length, 3, 'none once the battle has ended');
});

test('[同步-13] a seat sends at most SIGNAL_RATE a second; the mode\'s rule drops others without using the allowance', () => {
  let allow = false;
  const { host, signals } = host2(() => allow);
  host.ready(0, 0);
  host.ready(1, 0);
  for (let i = 0; i < 3; i++) host.signal(0, EMOTE, 100);
  assert.equal(signals().length, 0, 'the rule said no');
  allow = true;
  for (let i = 0; i < SIGNAL_RATE + 2; i++) host.signal(0, EMOTE, 100);
  host.signal(1, EMOTE, 100);
  const from = (/** @type {number} */ seat) => signals().filter(([to, m]) => to === 0 && m.seat === seat).length;
  assert.deepEqual([from(0), from(1)], [SIGNAL_RATE, 1], 'seat 0 held at its rate, seat 1 has its own');
  host.signal(0, EMOTE, 100 + 1000 / SIGNAL_RATE);
  assert.equal(from(0), SIGNAL_RATE + 1, 'one more after a quarter of a second');
});

test('[同步-13] the client sends signals and hands the seats\' signals on; they change nothing in its battle', () => {
  /** @type {any[]} */
  const sent = [], got = /** @type {any[]} */ ([]);
  const c = new LockstepClient({ content: tinyContent(), send: (m) => sent.push(m), onSignal: (seat, s) => got.push([seat, s]) });
  c.signal({ kind: 'mark', row: 2, col: 4 });
  assert.deepEqual(sent, [{ t: 'signal', s: { kind: 'mark', row: 2, col: 4 } }]);
  c.receive({ t: 'signal', seat: 1, s: EMOTE });
  assert.deepEqual(got, [[1, EMOTE]]);
  assert.equal(c.world, null, 'no battle started from it');
});
