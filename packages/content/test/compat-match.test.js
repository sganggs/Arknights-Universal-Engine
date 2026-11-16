// The pinned Stronghold kits in matches (docs/spec/compat.md 兼容-6, ADR 0058): the commit and each kit's file, loading
// the enabled ones, and a match's content with one — her record without talents, her kit's behaviours, the hash.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { oracleDir, STRONGHOLD } from '@aue/testkit';
import { createWorld, step, contentHash } from '@aue/sim';
import { KIT_SOURCE, KIT_FILES, KITS_ENABLED, loadKits, matchContent, chessKit } from '../src/index.js';
import { loadUnderGrid } from '../src/compat/grid.js';

/** The pinned commit's root as a URL. */
let root = '';

before(() => {
  const compat = new URL('../src/compat/', import.meta.url).href;
  root = pathToFileURL(`${oracleDir()}/`).href;
  register(new URL('hook.js', compat), { data: { root, compat } });
});

const BUILD = { elite: 2, level: 90, potential: 6, trust: 100, skill: 2, skillLevel: 10, module: 0, moduleLevel: 3 };
/** @param {string} id */
const match = (id) => ({ level: 'act1multi_01', difficulty: /** @type {const} */ ('NORMAL'), seed: 7, decks: [[{ id, build: BUILD }]] });

test('[兼容-6] the pinned commit is the oracle’s; each kit file holds its operator’s kit', async () => {
  assert.deepEqual(KIT_SOURCE, { repo: STRONGHOLD.repo, tag: STRONGHOLD.tag, sha: STRONGHOLD.sha });
  assert.equal(Object.keys(KIT_FILES).length, 72);
  for (const [id, file] of Object.entries(KIT_FILES)) {
    const mod = await loadUnderGrid(() => import(root + file));
    assert.deepEqual(Object.keys(mod.default), [id], file);
  }
  assert.ok(KITS_ENABLED.every((id) => Object.hasOwn(KIT_FILES, id)));
});

test('[兼容-6] loading: the enabled kits of the operators asked; one that does not load is named', async () => {
  const ok = await loadKits(root, ['char_112_siege', 'char_285_medic2', 'char_112_siege']);
  assert.deepEqual([Object.keys(ok.kits), ok.failed], [['char_112_siege'], []], 'an operator without a kit (Lancet-2): none loaded');
  const bad = await loadKits(`${root}nowhere/`, ['char_112_siege']);
  assert.deepEqual([Object.keys(bad.kits), bad.failed], [[], ['char_112_siege']]);
});

test('[兼容-6] a match with a kit: her record without talents, her kit’s behaviours, the kit in the content and its hash', async () => {
  const { kits } = await loadKits(root, ['char_112_siege']);
  const plain = await matchContent(match('char_112_siege')), kitted = await matchContent(match('char_112_siege'), { kits });
  const op = /** @type {any} */ (kitted.operators['char_112_siege#0']);
  assert.deepEqual(kitted.kits, { sha: STRONGHOLD.sha, used: ['char_112_siege'] });
  assert.equal(plain.kits, undefined);
  assert.equal(typeof kitted.behaviors?.world, 'function');
  assert.ok(kitted.behaviors?.skills && Object.hasOwn(kitted.behaviors.skills, 'skchr_siege_3'));
  assert.ok(!('fieldTalents' in op) && !('talentBb' in op));
  assert.notEqual(contentHash(kitted), contentHash(plain));
  const w = createWorld(kitted, { seed: 7, players: 1 }), tile = kitted.level.tiles.flatMap((row, r) => row.map((t, c) => ({ t, r, c }))).find((x) => x.t.buildable === 'MELEE');
  const deploy = { type: 'deploy', op: 'char_112_siege#0', row: /** @type {any} */ (tile).r, col: /** @type {any} */ (tile).c, dir: 0 };
  const mine = () => /** @type {any} */ (w.units.find((x) => x.key === 'char_112_siege#0'));
  for (let i = 0; i < 900 && !mine(); i++) step(w, kitted, [[0, /** @type {any} */ (deploy)]]);
  for (let i = 0; i < 30; i++) step(w, kitted);
  const u = mine();
  assert.deepEqual(u.buffs.map((/** @type {any} */ b) => b.key).sort(), ['talent:siege:pioneers', 'talent:siege:self'], 'her talents, by her kit');
});

test('[兼容-6] [干员-15] a 傀儡师 with a kit: its 替身 keeps its range; its 替身 talent is the kit\'s to apply', async () => {
  const kits = { char_1023_ghost2: () => ({ skills: {} }) };
  const plain = await matchContent(match('char_1023_ghost2')), kitted = await matchContent(match('char_1023_ghost2'), { kits });
  const doll = (/** @type {any} */ c) => c.operators['char_1023_ghost2#0'].trait.doll;
  assert.deepEqual([doll(plain).attack, doll(plain).aura, doll(plain).range.length], [false, { moveMul: 0.4, scale: 0.8 }, 9], 'PUM-X 3: the engine\'s');
  assert.deepEqual([doll(kitted).attack, doll(kitted).aura, doll(kitted).range], [true, null, doll(plain).range]);
});

test('[兼容-5] a chess kit given to a match (chessKit) makes its default skill the spec of the selected one; the same factory unmarked leaves the piece without a spec', async () => {
  const kit = { skill: { kind: 'duration' } };
  const factory = () => kit;
  for (const [name, given, want] of /** @type {[string, () => any, unknown][]} */ ([['chessKit', chessKit(factory), kit.skill], ['unmarked', () => kit, null]])) {
    /** @type {any[]} */
    const seen = [];
    const c = await matchContent(match('char_112_siege'), { kits: { char_112_siege: given }, content: { seen: (b) => { seen.push(b); } } });
    createWorld(c, { seed: 7, players: 1 });
    const piece = seen[0].pieces.get('0|char_112_siege#0');
    assert.ok(piece?.kit, 'the kit is installed');
    assert.equal(piece.skill.spec ?? null, want, name);
  }
});
