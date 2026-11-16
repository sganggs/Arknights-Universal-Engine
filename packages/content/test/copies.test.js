// Copies of one operator in a seat's deck (docs/spec/lockstep.md 同步-9): a mode that allows them says so (`copies`);
// each copy has its own key, record, summons and card, and the deck's team talents count once (干员-9). The protocol's
// match settings keep one of each operator per deck.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contentHash, createWorld, step, deployProblem } from '@aue/sim';
import { matchProblem } from '@aue/schema';
import { matchContent, deckKeys, seatOfKey, summonKey, loadTraining } from '../src/index.js';
import { teamTalentsAt } from '../src/operators.js';

const E1 = { elite: 1, level: 40, potential: 1, trust: 0, skill: 0, skillLevel: 4 }, E2 = { elite: 2, level: 90, potential: 6, trust: 100, skill: 0, skillLevel: 7 };
const AT = /** @type {const} */ ({ level: 'act1multi_01', difficulty: 'NORMAL', seed: 1 });
const SNIPER = 'char_1035_wisdel', WARD = 'token_10035_wisdel_wward';

test('[同步-9] deck keys: an id\'s first entry id#seat, its n-th id#seat#n; the seat of a key; a summon\'s key follows its owner\'s', () => {
  assert.deepEqual(deckKeys(['a', 'b', 'a', 'a'], 1), ['a#1', 'b#1', 'a#1#2', 'a#1#3']);
  assert.deepEqual(['a#1', 'a#1#3', 't#0', 'x#2#pre', 'alias#pre', 'a'].map(seatOfKey), [1, 1, 0, -1, -1, -1], 'a predefined operator\'s key has no seat');
  assert.deepEqual([summonKey('t', 'a#1'), summonKey('t', 'a#1#3'), summonKey('t', 'x#2#pre')], ['t#1', 't#1#3', null]);
});

test('[同步-9] [召唤-2] a deck with copies: each its own record at its training and its own summons; refused unless the match allows copies; the protocol keeps one of each', async () => {
  const deck = [{ id: SNIPER, build: E1 }, { id: SNIPER, build: E2 }];
  await assert.rejects(matchContent({ ...AT, decks: [deck] }), /seat 0: char_1035_wisdel twice in one deck/);
  const c = /** @type {any} */ (await matchContent({ ...AT, decks: [deck], copies: true }));
  assert.deepEqual(c.decks, [[`${SNIPER}#0`, `${SNIPER}#0#2`]]);
  const [a, b] = [c.operators[`${SNIPER}#0`], c.operators[`${SNIPER}#0#2`]];
  assert.ok(a.atk < b.atk && a.char === SNIPER && b.char === SNIPER, 'each copy at its own training');
  assert.deepEqual([c.operators[`${WARD}#0`].summoner, c.operators[`${WARD}#0#2`].summoner], [`${SNIPER}#0`, `${SNIPER}#0#2`], 'summons of several operators do not stack');
  assert.equal(matchProblem({ ...AT, decks: [deck] }), `${SNIPER} twice in one deck`);
  assert.equal(matchProblem({ ...AT, decks: [deck], copies: true }), 'unknown field copies');
});

test('[同步-9] [部署-2] two copies on the field together; a deck without copies keeps its keys and its content hash', async () => {
  const id = 'char_122_beagle', c = await matchContent({ ...AT, decks: [[{ id, build: E1 }, { id, build: E1 }]], copies: true });
  const w = createWorld(c, { seed: 1, players: 1 });
  w.players[0].cost = 99;
  const tiles = c.level.tiles.flatMap((row, r) => row.map((_, col) => ({ type: /** @type {const} */ ('deploy'), op: `${id}#0`, row: r, col, dir: 0 })))
    .filter((cmd) => deployProblem(w, c, 0, cmd) === null);
  step(w, c, [[0, tiles[0]]]);
  const second = { ...tiles[1], op: `${id}#0#2` };
  assert.equal(deployProblem(w, c, 0, second), null);
  step(w, c, [[0, second]]);
  assert.deepEqual(w.units.filter((u) => u.owner === 0).map((u) => u.key), [`${id}#0`, `${id}#0#2`]);
  const plain = { ...AT, decks: [[{ id, build: E1 }, { id: SNIPER, build: E2 }]] }, [x, y] = await Promise.all([matchContent(plain), matchContent({ ...plain, copies: true })]);
  assert.deepEqual(x.decks, [[`${id}#0`, `${SNIPER}#0`]]);
  assert.equal(contentHash(x), contentHash(y));
});

test('[符文-1] a seat\'s runes reach every copy and each copy\'s summons', async () => {
  const deck = [{ id: SNIPER, build: E2 }, { id: SNIPER, build: E2 }], rune = { key: 'char_attribute_mul', professions: 639 | 128, board: /** @type {[string, number][]} */ ([['atk', 1.1]]) };
  const [plain, c] = /** @type {any[]} */ (await Promise.all([matchContent({ ...AT, decks: [deck], copies: true }), matchContent({ ...AT, decks: [deck], copies: true, runes: [[rune]] })]));
  for (const k of [`${SNIPER}#0`, `${SNIPER}#0#2`, `${WARD}#0`, `${WARD}#0#2`]) assert.equal(c.operators[k].atk, plain.operators[k].atk * 1.1, k);
});

test('[兼容-6] [兼容-4] each copy of a kitted operator has its own kit entry and piece; the kit is named once', async () => {
  const id = 'char_1013_chen2';
  const calls = async (/** @type {number} */ n) => {
    let made = 0;
    const factory = /** @type {any} */ (() => { made++; return {}; });
    const c = await matchContent({ ...AT, decks: [Array.from({ length: n }, () => ({ id, build: E2 }))], copies: true }, { kits: { [id]: factory } });
    step(createWorld(c, { seed: 1, players: 1 }), c, []);
    return { made, used: /** @type {any} */ (c).kits.used };
  };
  const [one, two] = [await calls(1), await calls(2)];
  assert.deepEqual([two.made, two.used], [one.made * 2, [id]]);
});

test('[兼容-4] [召唤-6] a kit summons for the second copy: that copy\'s own summon record', async () => {
  /** @type {any[]} */
  const pieces = [];
  /** @type {any} */
  let battle = null;
  const factory = /** @type {any} */ (() => ({ install(/** @type {any} */ b, /** @type {any} */ piece) { battle = b; pieces.push(piece); } }));
  const c = await matchContent({ ...AT, decks: [[{ id: SNIPER, build: E2 }, { id: SNIPER, build: E2 }]], copies: true }, { kits: { [SNIPER]: factory } });
  const w = createWorld(c, { seed: 1, players: 1 });
  w.players[0].cost = 99;
  const free = (/** @type {string} */ op) => c.level.tiles.flatMap((row, r) => row.map((_, col) => ({ type: /** @type {const} */ ('deploy'), op, row: r, col, dir: 0 })))
    .find((cmd) => deployProblem(w, c, 0, cmd) === null);
  for (const k of [`${SNIPER}#0`, `${SNIPER}#0#2`]) step(w, c, [[0, /** @type {any} */ (free(k))]]);
  const second = pieces[1], spot = /** @type {{ row: number, col: number }} */ (c.level.tiles.flatMap((row, r) => row.map((t, col) => ({ t, row: r, col })))
    .find((x) => x.t.buildable !== 'NONE' && !w.units.some((u) => u.x === x.col && u.y === x.row)));
  assert.equal(second.u.key, `${SNIPER}#0#2`);
  const t = battle.spawnToken(second, WARD, spot.row, spot.col);
  assert.deepEqual([t.u.key, t.u.summoner], [`${WARD}#0#2`, second.u.id]);
});

test('[干员-9] copies give their deck\'s team talents once: the best trained copy\'s, wherever it stands in the deck', async () => {
  const nian = 'char_2014_nian', tank = 'char_202_demkni', bonus = teamTalentsAt(await loadTraining(nian), E2).deck[0].bb.max_hp;
  const hp = async (/** @type {{ id: string, build: any }[]} */ deck) => /** @type {any} */ (await matchContent({ ...AT, decks: [deck], copies: true })).operators[`${tank}#0`].talentBb?.max_hp ?? 0;
  const none = await hp([{ id: tank, build: E2 }]);
  assert.equal(bonus, 0.2);
  for (const deck of [[{ id: nian, build: E1 }, { id: nian, build: E2 }], [{ id: nian, build: E2 }, { id: nian, build: E1 }], [{ id: nian, build: E2 }, { id: nian, build: E2 }]]) {
    assert.ok(Math.abs(await hp([...deck, { id: tank, build: E2 }]) - none - bonus) < 1e-12, JSON.stringify(deck.map((d) => d.build.elite)));
  }
});
