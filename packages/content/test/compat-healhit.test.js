// A kit's `onHit` on a heal attack (docs/spec/compat.md 兼容-5; hooks.md 钩子-3 `healHit`): Stronghold's doHeal calls the
// running skill's `onHit` after the heal and its chain, with the target and `heal`. The pinned 闪灵 kit, unchanged: her
// 自动掩护 (S2) gives the ally her next heal reaches a 屏障 from it. A probe kit on her record shows the context.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { oracleDir } from '@aue/testkit';
import { createWorld, step, bus, attrs } from '@aue/sim';
import { loadUnderGrid } from '../src/compat/grid.js';
import { defOf } from '../src/compat/records.js';
import { kitsBehaviors, withKitTrait } from '../src/compat/kits.js';
import { loadTraining, operatorAt } from '../src/operators.js';

/** @typedef {import('../src/compat/battle.js').ShBattle} ShBattle */

const ID = 'char_147_shining';
/** E2 90, 潜能 6, 专精 3; `skill` the index of the chosen skill. @param {number} skill */
const build = (skill) => ({ elite: 2, level: 90, potential: 6, trust: 100, skill, skillLevel: 10 });
/** @type {{ factory: any, training: any }} */
const kit = { factory: null, training: null };

before(async () => {
  const compat = new URL('../src/compat/', import.meta.url).href;
  register(new URL('hook.js', compat), { data: { root: pathToFileURL(`${oracleDir()}/`).href, compat } });
  const mod = await loadUnderGrid(() => import(pathToFileURL(join(oracleDir(), 'server', 'sim', 'content', 'kits', 'ops', 'op-shining.js')).href));
  kit.factory = mod.default[ID];
  kit.training = await loadTraining(ID);
});

/** The engine's record without its talents: the kit applies them (兼容-6). @param {Record<string, any>} d */
const bare = ({ talentBb, talentMods, talentTrait, fieldTalents, rangeTalents, critTalents, timedTalents, deployTalents, ...rest }) => rest;
/** A low tile any operator may stand on. @param {string} key @param {string} [buildable] */
const tile = (key, buildable = 'ALL') => ({ key, height: 'LOWLAND', buildable, passable: 'ALL', side: 'ALL' });

/**
 * An open field 7 × 5 without enemies: 闪灵 at (2, 2) with `factory` (the pinned kit's when none) at the build of skill
 * `skill`, and a guard without a kit at (2, 3) — 1000 HP, left at 100. @param {number} skill @param {any} [factory]
 */
function ward(skill, factory) {
  const b0 = build(skill), def = defOf(ID, kit.training, b0), entry = { factory: factory ?? kit.factory, def, tokens: {} };
  const tiles = Array.from({ length: 5 }, (_, r) => Array.from({ length: 7 }, (_, c) => (r === 2 && c === 0 ? tile('tile_start', 'NONE') : r === 2 && c === 6 ? tile('tile_end', 'NONE') : tile('tile_road'))));
  const lv = { id: 'open', width: 7, height: 5, options: { maxLifePoint: 9, initialCost: 99, maxCost: 99, costIncreaseTime: 1, characterLimit: 9, moveMultiplier: 1 }, tiles,
    routes: [{ start: { row: 2, col: 0 }, end: { row: 2, col: 6 }, motion: 'WALK', checkpoints: [] }], waves: [] };
  const g1 = { name: 'g1', position: 'MELEE', cost: 1, blockCnt: 1, baseAttackTime: 1, maxHp: 1000, atk: 0, def: 0, res: 0, range: [{ row: 0, col: 0 }] };
  const c = /** @type {any} */ ({ level: lv, enemies: {}, decks: [[ID, 'g1']], operators: { [ID]: { ...withKitTrait(/** @type {any} */ (bare(operatorAt(kit.training, b0))), entry, lv), respawnTime: 1 }, g1 } });
  const box = /** @type {{ b: ShBattle | null }} */ ({ b: null });
  c.behaviors = kitsBehaviors({ [ID]: entry }, (x) => { box.b = x; });
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: ID, row: 2, col: 2, dir: 0 }], [0, { type: 'deploy', op: 'g1', row: 2, col: 3, dir: 0 }]]);
  const me = /** @type {any} */ (w.units.find((u) => u.key === ID)), guard = /** @type {any} */ (w.units.find((u) => u.key === 'g1'));
  guard.hp = 100;
  /** The heals of the next n frames on the guard: [frame, amount]. @param {number} n @param {any[]} [cmds] */
  const run = (n, cmds = []) => {
    /** @type {number[][]} */
    const out = [];
    const id = bus.on(w, 'heal', (k) => { if (k.target === guard) out.push([w.frame, k.amount]); }, { priority: -1e9 });
    for (let i = 0; i < n; i++) step(w, c, i === 0 ? cmds : []);
    bus.off(w, id);
    return out;
  };
  return { w, b: /** @type {ShBattle} */ (box.b), me, guard, run };
}

/** Her skill command, its SP made full. @param {any} me @returns {[number, any]} */
const cast = (me) => { me.skill.sp = me.skill.cost; return [0, { type: 'skill', unit: me.id }]; };

test('[兼容-5] [钩子-3] 闪灵\'s 自动掩护, unchanged: her heals before it give no 屏障; the next heal after it gives the guard one from her ATK, with its DEF', async () => {
  const x = ward(1), g = x.b.unitOf(x.guard);
  assert.ok(x.run(90).length > 0, 'she heals the guard');
  assert.equal(g.findBuff('shining:barrier'), null, 'no skill, no 屏障');
  x.guard.hp = 100;
  let healed = [];
  for (let i = 0; i < 90 && healed.length === 0; i++) healed = x.run(1, i === 0 ? [cast(x.me)] : []);
  assert.ok(healed.length > 0, 'the skill\'s heal');
  const barrier = g.findBuff('shining:barrier');
  assert.ok(barrier && barrier.shield > 0, 'a 屏障');
  assert.equal(Math.round(barrier.shield), Math.round(attrs.statsOf(x.me).atk * /** @type {any} */ (x.b.unitOf(x.me)).skill.bb.atk_scale), 'her ATK × atk_scale');
  assert.ok(g.findBuff('shining:barrierDef'), 'and its DEF while it lasts');
  assert.deepEqual(x.b.errors.filter((e) => !e.label.startsWith('trait.')), []);
});

test('[兼容-5] [钩子-3] a heal attack calls the running skill\'s onHit once per attack, with the target and the heal\'s amount; not while the skill is down', async () => {
  /** @type {any[]} */
  const seen = [];
  const probe = () => ({ skills: { skchr_shining_1: { kind: 'duration', heal: true, onHit: (/** @type {any} */ ctx) => { seen.push([ctx.target?.defId, ctx.heal, ctx.skill?.active, ctx.x, ctx.y]); } } } });
  const x = ward(0, probe);
  assert.ok(x.run(90).length > 0 && seen.length === 0, 'heals with the skill down call nothing');
  x.guard.hp = 100;
  const heals = x.run(120, [cast(x.me)]);
  assert.ok(heals.length > 0, 'she heals while the skill runs');
  assert.equal(seen.length, heals.length, 'one onHit per heal attack');
  assert.deepEqual(seen.map((s) => [s[0], s[2], s[3], s[4]]), seen.map(() => ['g1', true, x.guard.x, x.guard.y]));
  assert.deepEqual(seen.map((s) => Math.round(s[1])), heals.map((h) => Math.round(h[1])), 'no heal multipliers here: the amount healed');
});
