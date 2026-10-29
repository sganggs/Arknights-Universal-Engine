// Contract tests of the interface formats (ADR 0053): the render state matches its hand-written fixture number by
// number, events and messages are accepted exactly when well formed, and no input makes a validator throw.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import {
  VIEW_VERSION, FORTRESS_PHASE, viewLength, writeView, readView, eventProblems, clientMessageProblem, commandProblem, snapshotProblem, PROTOCOL_VERSION, serverMessageProblem,
  matchProblem, buildProblem, MAX_DECK, MAX_RUNES, MAX_BOARD, DIFFICULTIES,
} from '../src/index.js';

const SEED = 20261011;
const fixture = JSON.parse(readFileSync(new URL('fixtures/view-v7.json', import.meta.url), 'utf8'));

test('render state v7: the layout is the fixture, number by number, and reads back', () => {
  assert.equal(VIEW_VERSION, 7);
  const a = writeView(fixture.view);
  assert.deepEqual(Array.from(a), fixture.numbers);
  assert.deepEqual(readView(a), fixture.view);
  assert.equal(viewLength(4, 2), fixture.numbers.length);
});

test('render state: reuses a long enough array, refuses a wrong version or a short array', () => {
  const big = new Float64Array(96), a = writeView(fixture.view, big);
  assert.equal(a, big);
  assert.notEqual(writeView(fixture.view, new Float64Array(3)), null);
  assert.throws(() => readView(Float64Array.from([1, 0, 0, 0])), RangeError);
  assert.throws(() => readView(Float64Array.from([2, 0, 3, 0])), RangeError);
});

test('events: well formed ones pass; unknown types, wrong types and extra fields are reported', () => {
  assert.deepEqual(eventProblems({ type: 'hit', id: 1, target: 2, damage: 30 }), []);
  assert.deepEqual(eventProblems({ type: 'deploy', id: 1, key: 'char_500_noirc', owner: 0 }), []);
  assert.deepEqual(eventProblems({ type: 'skill', id: 3, active: 1 }), [], 'version 2: a skill starts or ends');
  assert.deepEqual(eventProblems({ type: 'burst', id: 3, el: 1 }), [], 'version 3: an element burst');
  assert.deepEqual(eventProblems({ type: 'heal', id: 3, target: 4, amount: 120 }), [], 'version 4: a heal');
  assert.deepEqual(eventProblems({ type: 'shot', id: 3, target: 4 }), [], 'version 5: a projectile');
  assert.deepEqual([eventProblems({ type: 'down', owner: 1 }), eventProblems({ type: 'revive', owner: 1 })], [[], []], 'version 6: a player down and back');
  assert.deepEqual([eventProblems({ type: 'ask', owner: 0 }), eventProblems({ type: 'answer', owner: 0, accept: -1, amount: 0 })], [[], []], 'version 7: a cost request');
  assert.deepEqual([eventProblems({ type: 'wave', index: 0 }), eventProblems({ type: 'predefine', key: 'trap_1#1', on: 1 }), eventProblems({ type: 'end', result: 1 })], [[], [], []],
    'version 8: a wave, a predefined unit, the end');
  assert.deepEqual(eventProblems({ type: 'stage', index: 1, on: 0, stamps: 2 }), [], 'version 8: a co-op stage');
  assert.deepEqual(eventProblems({ type: 'attack', id: 1, target: 2, wind: 12, face: 1 }), [], 'version 9: an attack with its wind-up; version 13 adds whether it faces');
  assert.deepEqual(eventProblems({ type: 'score', id: 1, goal: 1 }), [], 'version 14: a goal in 阵地足球');
  assert.deepEqual([eventProblems({ type: 'fortress', wave: 1, phase: FORTRESS_PHASE.rest, until: 900 }), eventProblems({ type: 'facility', id: 4, level: 2 })], [[], []],
    "version 11: [守御-1] 堡垒守御's phases, [守御-3] a facility's level");
  assert.deepEqual(eventProblems({ type: 'attack', id: 1, target: 2 }), ['attack.wind is not a number', 'attack.face is not a number']);
  assert.deepEqual(eventProblems({ type: 'attack', id: 1, target: 2, wind: 12 }), ['attack.face is not a number']);
  assert.deepEqual(eventProblems({ type: 'predefine', key: 3, on: 1 }), ['predefine.key is not a string']);
  assert.deepEqual(eventProblems(null), ['not an object']);
  assert.deepEqual(eventProblems({ type: 'explode' }), ['unknown event type explode']);
  assert.deepEqual(eventProblems({ type: 'death', id: '1', extra: 1 }), ['death.id is not a number', 'death has an unknown field extra']);
});

const HELLO = { t: 'hello', v: PROTOCOL_VERSION, seat: 1, key: 'k_abc-1', since: -1 };
const DEPLOY = { type: 'deploy', op: 'char_502_nblade', row: 3, col: 4, dir: 0 };

test('client messages: exactly the well-formed ones are accepted', () => {
  for (const m of [HELLO, { t: 'cmd', at: 99, cmd: DEPLOY }, { t: 'cmd', at: 0, cmd: { type: 'retreat', unit: 7 } }, { t: 'cmd', at: 5, cmd: { type: 'skill', unit: 7 } }, { t: 'hash', frame: 30, hash: 0xffffffff },
    { t: 'cmd', at: 5, cmd: { type: 'ask' } }, { t: 'cmd', at: 5, cmd: { type: 'answer', accept: 0 } }, { t: 'cmd', at: 5, cmd: { type: 'rest' } }, { t: 'speed', on: 1 }, { t: 'pause' },
    { t: 'pauseReply', accept: 1 }, { t: 'resume' }, { t: 'ready' }]) {
    assert.equal(clientMessageProblem(m), null, JSON.stringify(m));
  }
  const bad = [
    [[], 'message is not an object'], [{ t: 'nope' }, 'unknown message type nope'], [{ t: 'constructor' }, 'unknown message type constructor'],
    [{ ...HELLO, v: 3 }, 'protocol version 3, expected 11'], [{ ...HELLO, seat: 8 }, 'hello.seat out of range'], [{ ...HELLO, key: 'a b' }, 'hello.key is not an id'],
    [{ ...HELLO, since: 1.5 }, 'hello.since out of range'], [{ ...HELLO, admin: true }, 'unknown field admin'], [{ t: 'hash', frame: 1 }, 'missing field hash'],
    [{ t: 'hash', frame: 1, hash: -1 }, 'hash.hash is not a uint32'], [{ t: 'hash', frame: -1, hash: 1 }, 'hash.frame out of range'],
    [{ t: 'cmd', at: 2e6, cmd: DEPLOY }, 'cmd.at out of range'], [{ t: 'cmd', at: 1, cmd: { ...DEPLOY, row: 64 } }, 'deploy tile out of range'],
    [{ t: 'cmd', at: 1, cmd: { ...DEPLOY, dir: 4 } }, 'deploy.dir is not 0–3'], [{ t: 'cmd', at: 1, cmd: { ...DEPLOY, op: '../x' } }, 'deploy.op is not an id'],
    [{ t: 'cmd', at: 1, cmd: { type: 'retreat', unit: 0 } }, 'retreat.unit is not a unit id'], [{ t: 'cmd', at: 1, cmd: { type: 'skill', unit: 1.5 } }, 'skill.unit is not a unit id'], [{ t: 'cmd', at: 1, cmd: 'deploy' }, 'command is not an object'],
    [{ t: 'cmd', at: 1, cmd: { type: 'toString' } }, 'unknown command type toString'],
    [{ t: 'cmd', at: 1, cmd: { type: 'ask', seat: 1 } }, 'unknown field seat'], [{ t: 'cmd', at: 1, cmd: { type: 'answer', accept: 2 } }, 'answer.accept is not 0 or 1'],
    [{ t: 'speed', on: true }, 'speed.on is not 0 or 1'], [{ t: 'pause', seat: 0 }, 'unknown field seat'], [{ t: 'pauseReply' }, 'missing field accept'],
    [{ t: 'pauseReply', accept: -1 }, 'pauseReply.accept is not 0 or 1'], [{ t: 'resume', at: 3 }, 'unknown field at'], [{ t: 'ready', seat: 0 }, 'unknown field seat'],
  ];
  for (const [m, why] of bad) assert.equal(clientMessageProblem(m), why, JSON.stringify(m));
});

test('client messages: no JSON value makes the validator throw; it returns a string or null', () => {
  fc.assert(fc.property(fc.jsonValue(), (v) => {
    const r = clientMessageProblem(v), c = commandProblem(v);
    return (r === null || typeof r === 'string') && (c === null || typeof c === 'string');
  }), { seed: SEED, numRuns: 3000 });
});

test('client messages: generated well-formed deploys are accepted', () => {
  const deploy = fc.record({ type: fc.constant('deploy'), op: fc.stringMatching(/^[a-z0-9_]{1,64}$/), row: fc.integer({ min: 0, max: 63 }), col: fc.integer({ min: 0, max: 63 }), dir: fc.integer({ min: 0, max: 3 }) });
  fc.assert(fc.property(fc.integer({ min: 0, max: 1_000_000 }), deploy, (at, cmd) => clientMessageProblem({ t: 'cmd', at, cmd }) === null), { seed: SEED, numRuns: 1000 });
});

test('snapshot envelope v13', () => {
  assert.equal(snapshotProblem({ v: 20, frame: 0, data: {} }), null, 'version 20: a ball\'s physics');
  assert.equal(snapshotProblem({ v: 19, frame: 0, data: {} }), 'snapshot version 19, expected 20');
  assert.equal(snapshotProblem([]), 'snapshot is not an object');
  assert.equal(snapshotProblem({ v: 21, frame: 0, data: {} }), 'snapshot version 21, expected 20');
  assert.equal(snapshotProblem({ v: 20, frame: -1, data: {} }), 'snapshot.frame out of range');
  assert.equal(snapshotProblem({ v: 20, frame: 0, data: [] }), 'snapshot.data is not an object');
  assert.equal(snapshotProblem({ v: 20, frame: 0 }), 'missing field data');
});

test('server messages: well-formed ones pass; broken ones are reported, never thrown', () => {
  const ok = [
    { t: 'welcome', v: PROTOCOL_VERSION, seat: 0, seats: 2, seed: 9, frame: -1, snapshot: { v: 17, frame: 0, data: {} }, match: null, content: 7, replay: null },
    { t: 'frames', from: 3, to: 5, cmds: [[4, 1, DEPLOY], [5, 0, { type: 'retreat', unit: 2 }]] },
    { t: 'restamp', from: 3, to: 7 }, { t: 'resync', snapshot: {}, frame: 3, replay: null }, { t: 'error', code: 'x', message: 'y' },
    { t: 'control', fast: [1, 0], held: 0, asker: -1, resuming: 0 }, { t: 'frames', from: 1, to: 1, cmds: [[1, 1, { type: 'answer', accept: 1 }]] },
    { t: 'welcome', v: PROTOCOL_VERSION, seat: 1, seats: 2, seed: 9, frame: 40, snapshot: null, match: null, content: 7, replay: [[4, 1, DEPLOY]] },
    { t: 'resync', snapshot: null, frame: 40, replay: [] },
  ];
  for (const m of ok) assert.equal(serverMessageProblem(m), null, JSON.stringify(m));
  const bad = [
    [null, 'message is not an object'], [{ t: 'hello' }, 'unknown message type hello'],
    [{ ...ok[0], v: 3 }, 'protocol version 3, expected 11'], [{ ...ok[0], seed: 1.5 }, 'welcome fields out of range'], [{ ...ok[0], content: -1 }, 'welcome fields out of range'],
    [{ ...ok[1], to: 2 }, 'frames range malformed'], [{ ...ok[1], cmds: {} }, 'sealed commands are not an array'],
    [{ ...ok[1], cmds: [[4, 9, DEPLOY]] }, 'frames.cmds has a malformed entry'], [{ ...ok[1], cmds: [[4, 1, { type: 'x' }]] }, 'unknown command type x'],
    [{ t: 'restamp', from: -1, to: 1 }, 'restamp out of range'], [{ t: 'error', code: 1, message: 'y' }, 'error fields are not strings'],
    [{ t: 'resync' }, 'missing field snapshot'], [{ ...ok[3], frame: -2 }, 'resync.frame out of range'],
    [{ ...ok[0], replay: [[1, 9, DEPLOY]] }, 'frames.cmds has a malformed entry'], [{ ...ok[3], replay: 'x' }, 'sealed commands are not an array'],
    [{ ...ok[5], fast: [2] }, 'control.fast is not a list of 0 and 1'], [{ ...ok[5], fast: Array(9).fill(0) }, 'control.fast is not a list of 0 and 1'],
    [{ ...ok[5], fast: 1 }, 'control.fast is not a list of 0 and 1'], [{ ...ok[5], asker: 8 }, 'control fields out of range'], [{ ...ok[5], held: 2 }, 'control fields out of range'],
  ];
  for (const [m, why] of bad) assert.equal(serverMessageProblem(m), why, JSON.stringify(m));
  fc.assert(fc.property(fc.jsonValue(), (v) => { const r = serverMessageProblem(v); return r === null || typeof r === 'string'; }), { seed: SEED, numRuns: 2000 });
});

test('[同步-9] match settings: exactly the well-formed ones pass; a welcome carries them or null', () => {
  const build = { elite: 2, level: 90, potential: 6, trust: 200, skill: 2, skillLevel: 10 };
  const match = { level: 'act1multi_01', difficulty: 'FOUR_STAR', seed: 1209492319, decks: [[{ id: 'char_122_beagle', build }], []] };
  assert.equal(matchProblem(match), null);
  assert.equal(buildProblem({ ...build, skill: -1, elite: 0, level: 1, potential: 1, trust: 0, skillLevel: 1 }), null);
  assert.deepEqual([buildProblem({ ...build, module: 2, moduleLevel: 3 }), buildProblem({ ...build, module: -1 }), buildProblem({ ...build, moduleLevel: 1 })], [null, null, null], 'the module fields may be left out');
  assert.deepEqual([buildProblem({ ...build, module: 3 }), buildProblem({ ...build, moduleLevel: 0 }), buildProblem({ ...build, module: 0.5 })],
    ['build.module out of range', 'build.moduleLevel out of range', 'build.module out of range']);
  const bad = [
    [null, 'match is not an object'], [{ ...match, extra: 1 }, 'unknown field extra'], [{ ...match, level: 'a b' }, 'match.level is not an id'],
    [{ ...match, difficulty: 'EASY' }, 'match.difficulty is not NORMAL or FOUR_STAR'], [{ ...match, seed: -1 }, 'match.seed is not a uint32'],
    [{ ...match, decks: [] }, 'match.decks is not one deck per seat'], [{ ...match, decks: Array(9).fill([]) }, 'match.decks is not one deck per seat'],
    [{ ...match, decks: [Array(MAX_DECK + 1).fill({ id: 'x', build })] }, `a deck is not a list of at most ${MAX_DECK}`],
    [{ ...match, decks: [[1]] }, 'a deck entry is not an object'], [{ ...match, decks: [[{ id: '../x', build }]] }, 'deck entry id is not an id'],
    [{ ...match, decks: [[{ id: 'a', build: { ...build, level: 91 } }]] }, 'build.level out of range'], [{ ...match, decks: [[{ id: 'a', build: [] }]] }, 'build is not an object'],
    [{ ...match, decks: [[{ id: 'a', build: { ...build, x: 1 } }]] }, 'unknown field x'], [{ ...match, decks: [[{ id: 'a', build }, { id: 'a', build }]] }, 'a twice in one deck'],
  ];
  for (const [m, why] of bad) assert.equal(matchProblem(m), why, JSON.stringify(m));
  assert.deepEqual(DIFFICULTIES, ['NORMAL', 'FOUR_STAR']);
  const welcome = { t: 'welcome', v: PROTOCOL_VERSION, seat: 0, seats: 2, seed: 9, frame: -1, snapshot: null, match, content: 7, replay: null };
  assert.equal(serverMessageProblem(welcome), null);
  assert.equal(serverMessageProblem({ ...welcome, match: { ...match, seed: 1.5 } }), 'match.seed is not a uint32');
  const { match: _m, ...noMatch } = welcome;
  assert.equal(serverMessageProblem(noMatch), 'missing field match');
});

test('[同步-5] protocol 11 welcome carries the arbiter seats and names one of them', () => {
  const welcome = { t: 'welcome', v: PROTOCOL_VERSION, seat: 0, seats: 2, seed: 7, frame: -1, snapshot: null, match: null, content: 1, replay: [] };
  assert.equal(PROTOCOL_VERSION, 11);
  for (const [seats, seat] of [[1, 0], [2, 1], [8, 7]]) assert.equal(serverMessageProblem({ ...welcome, seats, seat }), null);
  for (const seats of [0, 9, 1.5, null, '2']) assert.equal(serverMessageProblem({ ...welcome, seats }), 'welcome fields out of range');
  assert.equal(serverMessageProblem({ ...welcome, seat: 2 }), 'welcome fields out of range');
  const { seats: _seats, ...noSeats } = welcome;
  assert.equal(serverMessageProblem(noSeats), 'missing field seats');
  assert.equal(serverMessageProblem({ ...welcome, v: 10 }), 'protocol version 10, expected 11');
  assert.equal(clientMessageProblem({ ...HELLO, v: 10 }), 'protocol version 10, expected 11');
});

test('[同步-9] [符文-1] a match may carry each seat\'s runes: a key, a profession mask and a blackboard of [key, number or text]', () => {
  const build = { elite: 2, level: 90, potential: 6, trust: 200, skill: 2, skillLevel: 10 };
  const match = { level: 'act1multi_01', difficulty: 'NORMAL', seed: 7, decks: [[{ id: 'char_122_beagle', build }], []] };
  const r = { key: 'env_gbuff_new', professions: 639, board: [['key', 'attr_up_on_trigger[atk][max_hp]'], ['atk', 0.03], ['attack@sp', 3]] };
  assert.equal(PROTOCOL_VERSION, 11);
  assert.equal(matchProblem({ ...match, runes: [[r], []] }), null);
  assert.equal(matchProblem({ ...match, runes: [[], []] }), null);
  const bad = [
    [{ ...match, runes: [[r]] }, 'match.runes is not one list per seat'], [{ ...match, runes: [Array(MAX_RUNES + 1).fill(r), []] }, `a seat's runes are not a list of at most ${MAX_RUNES}`],
    [{ ...match, runes: [[1], []] }, 'a rune is not an object'], [{ ...match, runes: [[{ ...r, x: 1 }], []] }, 'unknown field x'],
    [{ ...match, runes: [[{ ...r, key: 'A B' }], []] }, 'rune.key is not a rune key'], [{ ...match, runes: [[{ ...r, professions: 1024 }], []] }, 'rune.professions is not a profession mask'],
    [{ ...match, runes: [[{ ...r, board: [['atk', Infinity]] }], []] }, 'rune.board is not a list of [key, value]'],
    [{ ...match, runes: [[{ ...r, board: [['atk']] }], []] }, 'rune.board is not a list of [key, value]'],
    [{ ...match, runes: [[{ ...r, board: Array(MAX_BOARD + 1).fill(['atk', 1]) }], []] }, 'rune.board is not a list of [key, value]'],
  ];
  for (const [m, why] of bad) assert.equal(matchProblem(m), why, JSON.stringify(m).slice(0, 120));
});
