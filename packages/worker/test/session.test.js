// The worker's BattleSession against an in-process LockstepHost, with a fake socket and a manual clock: render states
// are posted after frame times, commands reach the field, a closed socket reconnects, bad server messages are reported.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readView, clientMessageProblem } from '@aue/schema';
import { LockstepHost } from '@aue/net';
import { reachKeys, placedReach } from '@aue/sim';
import { tinyContent } from '@aue/testkit';
import { BattleSession } from '../src/index.js';

/** A manual clock and timer queue. */
function clock() {
  let now = 0;
  /** @type {{ at: number, fn: () => void }[]} */
  const timers = [];
  return {
    now: () => now,
    later: (/** @type {() => void} */ fn, /** @type {number} */ ms) => { timers.push({ at: now + ms, fn }); },
    /** @param {number} ms @param {(t: number) => void} each */
    run(ms, each) {
      for (const end = now + ms; now < end; now++) {
        each(now);
        timers.sort((a, b) => a.at - b.at);
        while (timers.length && timers[0].at <= now) /** @type {any} */ (timers.shift()).fn();
      }
    },
  };
}

/** A session wired to a host through fake sockets (no latency). @param {any} [c] the content */
function rig(c = tinyContent()) {
  const t = clock(), posts = /** @type {any[]} */ ([]), sent = /** @type {string[]} */ ([]);
  /** @type {any} */
  let sock = null;
  const host = new LockstepHost({ hashEvery: 1, content: c, seats: 1, seed: 5, send: (_seat, msg) => sock?.onmessage?.(JSON.stringify(msg)) });
  const session = new BattleSession(c, {
    now: t.now, later: t.later, post: (m) => posts.push(m),
    connect: () => {
      sock = { onopen: null, onmessage: null, onclose: null, close() { const s = sock; sock = null; host.bye(0, t.now()); s?.onclose?.(); },
        send(/** @type {string} */ text) {
          const m = JSON.parse(text);
          assert.equal(clientMessageProblem(m), null);
          sent.push(m.t);
          if (m.t === 'ready') { host.ready(0, t.now()); return; }
          if (m.t === 'hello') host.hello(0, t.now()); else if (m.t === 'cmd') host.command(0, m.at, m.cmd); else if (m.t === 'hash') host.hash(0, m.frame, m.hash);
          else if (m.t === 'speed') host.speed(0, m.on, t.now()); else if (m.t === 'pause') host.pause(0, t.now());
          else if (m.t === 'pauseReply') host.pauseReply(0, m.accept, t.now()); else if (m.t === 'signal') host.signal(0, m.s, t.now()); else host.resume(0, t.now());
        } };
      const s = sock;
      t.later(() => s.onopen?.(), 1);
      return s;
    },
  });
  return { host, session, posts, t, sent, socket: () => sock };
}

test('the session plays the server frames and posts a render state per frame time', () => {
  const r = rig();
  r.session.start({ url: 'ws://x', seat: 0, key: 'k' });
  r.t.run(1000, (now) => r.host.tick(now));
  const frames = r.posts.filter((p) => p.type === 'frame');
  assert.ok(frames.length >= 25, `${frames.length} frames posted`);
  const v = readView(frames.at(-1).view);
  assert.equal(v.frame, frames.at(-1).frame);
  assert.ok(Math.abs(v.frame - r.host.world.frame) <= 3, `client ${v.frame} vs server ${r.host.world.frame}`);
  const st = frames.at(-1).status;
  assert.deepEqual({ ...st, players: undefined }, { wave: 0, stage: -1, start: 0, count: 0, stamps: 0, passed: 0, result: -1, players: undefined }, 'the match status rides along');
  assert.deepEqual(st.players.map((/** @type {any} */ p) => [p.deployed, p.cards, p.revive, p.ask]), [[[], {}, -1, -1]], 'with the state of each player');
  assert.ok(st.players[0].costTimer > 0);
});

test('[足球-6] [足球-14] in 阵地足球 the status has the match: the team, the goals, its end, the stamps, the balls, the cards held, the ice and slime, the 守门位', () => {
  const c = /** @type {any} */ (tinyContent());
  c.level.football = { time: 300, wait: 0, stamps: [1], ahead: [[0, 0]], weights: { 0: [1] }, teams: [{ name: 'normal', weight: 1, players: {} }], roles: {} };
  const r = rig(c);
  r.session.start({ url: 'ws://x', seat: 0, key: 'k' });
  r.t.run(500, (now) => r.host.tick(now));
  const st = r.posts.filter((p) => p.type === 'frame').at(-1).status;
  assert.deepEqual(st.football, { team: 'normal', home: 0, away: 0, until: 300 * 30, stamps: 0, balls: [], held: [[]], cover: {}, spots: [] });
});

test('[锦标-2] [锦标-4] [锦标-7] [界面-42] a 锦标 match\'s status: its stadium, the sides, the kickoff wait; in a penalty shootout the round, whose, whether under way, the results', () => {
  const c = /** @type {any} */ (tinyContent());
  c.level.football = { time: 300, wait: 3, stamps: [1], ahead: [[0, 0]], weights: { 0: [1] }, teams: [{ name: 'normal', weight: 1, players: {} }], roles: {},
    cup: { moveSpeed: 1.2, mercy: -1, stadium: { name: 'winter', moveMul: 1, ice: 0.3 }, sides: { ours: '罗德岛队', theirs: '业余组' },
      icons: { ours: 'act1football_teamicon_1', theirs: 'act1football_teamicon_3' } } };
  const r = rig(c);
  r.session.start({ url: 'ws://x', seat: 0, key: 'k' });
  r.t.run(500, (now) => r.host.tick(now));
  const st = r.posts.filter((p) => p.type === 'frame').at(-1).status;
  const w = /** @type {import('@aue/sim').World} */ (r.session.client.world), fs = /** @type {any} */ (w.football);
  assert.deepEqual([st.football.stadium, st.football.sides, st.football.ready], ['winter', { ours: '罗德岛队', theirs: '业余组' }, fs.kick + 90]);
  assert.deepEqual(st.football.icons, { ours: 'act1football_teamicon_1', theirs: 'act1football_teamicon_3' });
  assert.equal(st.football.pk, undefined, 'no shootout yet');
  fs.pk = { round: 1, begun: -1, ball: 0, kicked: false, counted: false, shots: [1] };
  r.t.run(200, (now) => r.host.tick(now));
  const later = r.posts.filter((p) => p.type === 'frame').at(-1).status;
  assert.deepEqual(later.football.pk, { round: 1, side: 'theirs', on: false, until: -1, shots: [1] }, 'between rounds: no countdown');
  fs.pk = { round: 2, begun: w.frame, ball: 0, kicked: false, counted: false, shots: [1, 0] };
  r.t.run(100, (now) => r.host.tick(now));
  const pk = r.posts.filter((p) => p.type === 'frame').at(-1).status.football.pk;
  assert.deepEqual([pk.side, pk.on, pk.shots], ['ours', true, [1, 0]]);
});

test('a command reaches the field; the debug state matches the server at the same frame', () => {
  const r = rig();
  r.session.start({ url: 'ws://x', seat: 0, key: 'k' });
  r.t.run(300, (now) => r.host.tick(now));
  r.session.command({ type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 });
  r.t.run(1000, (now) => r.host.tick(now));
  const d = r.session.debug();
  assert.equal(d.hash, r.host.hashes.get(d.frame));
  assert.ok(r.posts.some((p) => p.type === 'frame' && p.events.some((/** @type {any} */ e) => e.type === 'deploy')));
  const keys = Object.assign({}, ...r.posts.filter((p) => p.type === 'frame').map((p) => p.keys));
  assert.ok(Object.values(keys).includes('guard') && Object.values(keys).includes('slime'), JSON.stringify(keys));
});

test('[渲染-8] [渲染-9] marks: from the session\'s world and seat — deployable tiles, the preview, an own operator\'s reach', () => {
  const r = rig();
  r.session.start({ url: 'ws://x', seat: 0, key: 'k' });
  r.t.run(300, (now) => r.host.tick(now));
  r.session.command({ type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 });
  r.t.run(1000, (now) => r.host.tick(now));
  const w = /** @type {import('@aue/sim').World} */ (r.session.client.world), op = w.units.find((u) => u.key === 'guard');
  assert.ok(op);
  const c = r.session.client.o.content;
  assert.deepEqual(r.session.marks({ tile: { row: 1, col: 1 } }), { type: 'marks', deployable: [], range: { keys: [...reachKeys(c, op)], heal: false } });
  // the sniper fits the four wall tiles (keys 2, 3, 14, 15); the guard's tile is taken but is not a wall anyway
  const m = r.session.marks({ op: 'sniper', dir: 0, tile: { row: 0, col: 2 } });
  assert.deepEqual(m.deployable, [2, 3, 14, 15]);
  assert.deepEqual(m.range?.keys.sort((x, y) => x - y), [...placedReach(c, 'sniper', 0, 2, 0).keys].sort((x, y) => x - y));
  assert.deepEqual(r.session.marks({ op: 'guard', dir: 0, tile: { row: 1, col: 1 } }).range, null, 'a taken tile previews nothing');
  assert.ok(!r.session.marks({ op: 'guard' }).deployable.includes(7), 'nor is it deployable');
  assert.deepEqual(r.session.marks({ tile: { row: 2, col: 0 } }), { type: 'marks', deployable: [], range: null }, 'no own operator there');
});

test('[同步-13] a signal from the page goes to the server and comes back to the page with its seat', () => {
  const r = rig();
  r.session.start({ url: 'ws://x', seat: 0, key: 'k0' });
  r.t.run(10, () => {});
  r.session.signal({ kind: 'emote', id: 'multiv3_battle_thanks', theme: 'emoticon_basic' });
  assert.ok(r.sent.includes('signal'));
  assert.deepEqual(r.posts.filter((m) => m.type === 'signal'), [{ type: 'signal', seat: 0, s: { kind: 'emote', id: 'multiv3_battle_thanks', theme: 'emoticon_basic' } }]);
});

test('a closed socket reconnects and the session resumes from the server snapshot', () => {
  const r = rig();
  r.session.start({ url: 'ws://x', seat: 0, key: 'k' });
  r.t.run(1000, (now) => r.host.tick(now));
  assert.equal(r.session.client.world?.units.length, 1, 'an enemy is on the field before the drop');
  r.socket().close();
  r.t.run(2500, (now) => r.host.tick(now));
  assert.deepEqual(r.posts.filter((p) => p.type === 'net').map((p) => p.state), ['open', 'closed', 'open']);
  const d = r.session.debug();
  assert.equal(d.hash, r.host.hashes.get(d.frame));
  const afterReconnect = r.posts.findLastIndex((p) => p.type === 'net' && p.state === 'open');
  const firstFrame = r.posts.slice(afterReconnect).find((p) => p.type === 'frame');
  assert.ok(firstFrame && Object.keys(firstFrame.keys).length > 0, 'after a restore every unit is announced again');
  r.session.stop();
  assert.equal(r.socket(), null);
});

test('bad server messages are reported and do not break the session', () => {
  const r = rig();
  r.session.start({ url: 'ws://x', seat: 0, key: 'k' });
  r.t.run(100, (now) => r.host.tick(now));
  r.session.receive('{not json');
  r.session.receive(JSON.stringify({ t: 'frames', from: 5, to: 1, cmds: [] }));
  r.session.receive(JSON.stringify({ t: 'resync', snapshot: { v: 9 }, frame: 5, replay: null }));
  assert.deepEqual(r.posts.filter((p) => p.state === 'bad-message').map((p) => p.reason),
    ['message is not an object', 'frames range malformed', 'snapshot: missing field frame']);
  r.t.run(500, (now) => r.host.tick(now));
  assert.equal(r.session.debug().hash, r.host.hashes.get(r.session.debug().frame));
});

test('[同步-9] a welcome with match settings: the content is made first, messages meanwhile wait, then the match plays', async () => {
  const c = tinyContent(), made = { ...c, decks: [['guard']] }, t = clock(), posts = /** @type {any[]} */ ([]);
  const match = { level: 'tiny', difficulty: /** @type {const} */ ('NORMAL'), seed: 5, decks: [[{ id: 'guard', build: { elite: 0, level: 1, potential: 1, trust: 0, skill: -1, skillLevel: 1 } }]] };
  /** @type {any} */
  let sock = null, release = /** @type {() => void} */ (() => {});
  const host = new LockstepHost({ hashEvery: 1, content: made, seats: 1, seed: 5, match, send: (_seat, msg) => sock?.onmessage?.(JSON.stringify(msg)) });
  const session = new BattleSession(c, {
    now: t.now, later: t.later, post: (m) => posts.push(m),
    content: (m) => new Promise((resolve) => { assert.deepEqual(m, match); release = () => resolve(made); }),
    connect: () => {
      sock = { onopen: null, onmessage: null, onclose: null, close() {},
        send(/** @type {string} */ text) { const m = JSON.parse(text); if (m.t === 'hello') host.hello(0, t.now()); else if (m.t === 'cmd') host.command(0, m.at, m.cmd); else if (m.t === 'hash') host.hash(0, m.frame, m.hash); } };
      const s = sock;
      t.later(() => s.onopen?.(), 1);
      return s;
    },
  });
  session.start({ url: 'ws://x', seat: 0, key: 'k' });
  t.run(200, (now) => host.tick(now));
  assert.equal(session.client.world, null, 'still making the content');
  release();
  await new Promise((r) => setImmediate(r));
  t.run(600, (now) => host.tick(now));
  assert.ok(posts.some((p) => p.type === 'net' && p.state === 'match' && p.frame === -1), 'with the frame sealed when it joined: none yet');
  session.command({ type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 });
  t.run(600, (now) => host.tick(now));
  const d = session.debug();
  assert.equal(d.hash, host.hashes.get(d.frame));
  assert.equal(host.world.units.filter((u) => u.key === 'guard').length, 1);
  const last = posts.filter((p) => p.type === 'frame').at(-1).status.players[0];
  assert.deepEqual(last.deployed, ['guard'], 'the status has the made content\'s deck');
  assert.deepEqual(last.cards, { guard: { cost: made.operators.guard.cost, ready: 0, locked: false } });
  assert.equal(last.slots, made.level.options.characterLimit - 1, 'one deploy slot taken');
});

test('[同步-9] match content that cannot be made is reported', async () => {
  const c = tinyContent(), t = clock(), posts = /** @type {any[]} */ ([]);
  const match = { level: 'nope', difficulty: /** @type {const} */ ('NORMAL'), seed: 5, decks: [[]] };
  /** @type {any} */
  let sock = null;
  const host = new LockstepHost({ hashEvery: 1, content: c, seats: 1, seed: 5, match, send: (_seat, msg) => sock?.onmessage?.(JSON.stringify(msg)) });
  const session = new BattleSession(c, {
    now: t.now, later: t.later, post: (m) => posts.push(m), content: () => Promise.reject(new Error('no level nope')),
    connect: () => {
      sock = { onopen: null, onmessage: null, onclose: null, close() {}, send(/** @type {string} */ text) { if (JSON.parse(text).t === 'hello') host.hello(0, t.now()); } };
      const s = sock;
      t.later(() => s.onopen?.(), 1);
      return s;
    },
  });
  session.start({ url: 'ws://x', seat: 0, key: 'k' });
  t.run(50, (now) => host.tick(now));
  await new Promise((r) => setImmediate(r));
  assert.ok(posts.some((p) => p.type === 'net' && p.state === 'bad-message' && /no level nope/.test(p.reason)));
});

test('[同步-11] the page loaded: the server is told, and told again after the socket reconnects', () => {
  const r = rig();
  r.session.start({ url: 'ws://x', seat: 0, key: 'k' });
  r.t.run(50, (now) => r.host.tick(now));
  assert.deepEqual(r.sent.filter((m) => m !== 'hash'), ['hello'], 'not before the page says so');
  r.session.ready();
  assert.deepEqual([r.sent.at(-1), r.host.loaded.has(0)], ['ready', true]);
  r.socket().close();
  r.t.run(2000, (now) => r.host.tick(now));
  assert.deepEqual(r.sent.filter((m) => m !== 'hash' && m !== 'cmd').slice(-2), ['hello', 'ready'], 'hello, then ready again');
});

test('[同步-7] [同步-8] controls from the page reach the server; its control state comes back to the page', () => {
  const r = rig();
  r.session.start({ url: 'ws://x', seat: 0, key: 'k' });
  r.t.run(100, (now) => r.host.tick(now));
  r.session.control({ type: 'speed', on: true });
  r.t.run(50, (now) => r.host.tick(now));
  assert.deepEqual(r.host.fast, [1]);
  r.session.control({ type: 'pause' });
  r.t.run(50, (now) => r.host.tick(now));
  assert.equal(r.host.held, true, 'alone: paused at once');
  r.session.control({ type: 'resume' });
  r.session.control({ type: 'pauseReply', accept: true });
  r.t.run(1100, (now) => r.host.tick(now));
  assert.equal(r.host.held, false);
  const controls = r.posts.filter((p) => p.type === 'control');
  assert.deepEqual(controls.at(-1), { type: 'control', fast: [1], held: 0, asker: -1, resuming: 0 });
  assert.ok(controls.some((c) => c.held === 1));
});


test('[同步-10] a welcome whose content hash differs from the session\'s content is refused', () => {
  const r = rig();
  r.host.content = (r.host.content ^ 1) >>> 0;
  r.session.start({ url: 'ws://x', seat: 0, key: 'k' });
  r.t.run(500, (now) => r.host.tick(now));
  assert.ok(r.posts.some((p) => p.type === 'net' && p.state === 'bad-message' && /content differs/.test(p.reason)));
  assert.equal(r.posts.filter((p) => p.type === 'frame').length, 0, 'no frames are played');
});
