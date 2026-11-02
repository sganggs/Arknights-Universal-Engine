// A burst's damage and an operator's dodge through the compat layer (docs/spec/elements.md 元素-3, 元素-4): 老鲤's pinned
// kit (v0.3.1) with S1 小惩大诫 running, whose 法术闪避 is a buff modifier like the engine's own: his 灼燃 burst's 1200
// arts is dodged exactly when the draw is below the skill's chance, his 侵蚀 burst's physical hit by nothing of his.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { oracleDir } from '@aue/testkit';
import { createWorld, step, elements, attrs, skills, draw, deployProblem, DIR } from '@aue/sim';
import { loadKits, matchContent } from '../src/index.js';

/** @typedef {import('@aue/sim').Unit} Unit */

/** The pinned commit's root as a URL. */
let root = '';

before(() => {
  const compat = new URL('../src/compat/', import.meta.url).href;
  root = pathToFileURL(`${oracleDir()}/`).href;
  register(new URL('hook.js', compat), { data: { root, compat } });
});

const LEE = 'char_322_lmlee';

/**
 * 老鲤 (E2 90, 潜能 6, S1 at rank 10) alone in act1multi_01 without waves, on the first tile that takes him, his S1 started
 * once its SP is full (with no enemy he makes no attack, which an AUTO skill of his waits for, 技能-3). Returns the world,
 * content and his unit.
 */
async function leeWithS1() {
  const { kits } = await loadKits(root, [LEE]);
  const build = { elite: 2, level: 90, potential: 6, trust: 100, skill: 0, skillLevel: 10 };
  const c = /** @type {any} */ (await matchContent({ level: 'act1multi_01', difficulty: 'NORMAL', seed: 7, decks: [[{ id: LEE, build }]] }, { kits }));
  c.level = { ...c.level, waves: [] };
  const w = createWorld(c, { seed: 7, players: 1 });
  w.players[0].cost = 99;
  const op = `${LEE}#0`;
  /** @type {any} */
  let cmd = null;
  for (let row = 0; row < c.level.height && !cmd; row++) {
    for (let col = 0; col < c.level.width && !cmd; col++) {
      const x = { type: /** @type {const} */ ('deploy'), op, row, col, dir: DIR.RIGHT };
      if (deployProblem(w, c, 0, x) === null) cmd = x;
    }
  }
  step(w, c, [[0, cmd]]);
  const u = /** @type {Unit} */ (w.units.find((x) => x.key === op));
  const st = /** @type {NonNullable<Unit['skill']>} */ (u.skill);
  for (let i = 0; i < 600 && st.sp < st.cost; i++) step(w, c);
  skills.activate(w, c, u);
  step(w, c);
  return { w, c, u };
}

test('[元素-3] [元素-4] 老鲤\'s pinned kit with S1 on: his 法术闪避 dodges the 灼燃 burst\'s 1200 arts exactly when the draw is below the skill\'s 40%; nothing of his dodges the 侵蚀 burst\'s physical hit', async () => {
  const { w, c, u } = await leeWithS1();
  assert.ok(u.skill?.active, 'S1 runs');
  const own = u.buffs.filter((b) => (b.mods.dodgeArts ?? 0) > 0 || (b.mods.dodgePhys ?? 0) > 0 || (b.mods.dodgeMelee ?? 0) > 0);
  assert.deepEqual(own.map((b) => [b.mods.dodgeArts, b.mods.dodgePhys]), [[0.4, undefined]], 'one buff: S1\'s 法术闪避 at rank 10');
  const hp = u.hp;
  let n = 0;
  for (let k = 0; k < 30; k++) {
    const below = draw({ rng: w.rng }) < 0.4;
    elements.dealEpFrom(w, u, 'FIRE', 1000, { src: null, c });
    const res = attrs.statsOf(u).res;
    assert.equal(hp - u.hp, below ? 0 : 1200 * (1 - res / 100), `burst ${k}`);
    if (below) n++;
    u.hp = hp;
    u.buffs = u.buffs.filter((b) => !b.key.startsWith('burst:'));
    u.ep = {};
  }
  assert.ok(n > 0 && n < 30, `${n} of 30 dodged`);
  const r = w.rng;
  elements.dealEpFrom(w, u, 'WATER', 1000, { src: null, c });
  assert.equal(w.rng, r, 'no draw: he has no physical dodge');
  assert.equal(hp - u.hp, Math.max(800 - attrs.statsOf(u).def, 800 * 0.05), '800 physical after his lowered 防御力');
});
