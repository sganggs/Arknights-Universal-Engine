// Stronghold's operator kits through the compat layer (docs/spec/compat.md 兼容-2, 兼容-3): the import mapping table and
// its Node hook load the pinned oracle's 72 operator kits unchanged; the records made from the engine's training data
// are what each kit's factory builds its kit from, at any training.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { oracleDir } from '@aue/testkit';
import { MAPPING, mappedUrl } from '../src/compat/mapping.js';
import { loadUnderGrid, withGrid } from '../src/compat/grid.js';
import { recordOf, defOf, gridOf } from '../src/compat/records.js';
import { CompatGap } from '../src/compat/sh/gap.js';
import * as targeting from '../src/compat/sh/targeting.js';
import { rotateOffset, toLocal, dirFromDelta, offsetTile, frontOf, normDir } from '../src/compat/sh/dir.js';
import { loadTraining, statsAt, moduleAt } from '../src/operators.js';
import { withKitTrait } from '../src/compat/kits.js';

const OPS = join(oracleDir(), 'server', 'sim', 'content', 'kits', 'ops');
/** @type {[string, string, Function][]} file, character id, factory */
const kits = [];
/** The chess kits' modules by file, and the files that did not load with why. @type {Map<string, any>} */
const chessKits = new Map();
/** @type {string[]} */
const chessFailed = [];
before(async () => {
  const compat = new URL('../src/compat/', import.meta.url).href;
  register(new URL('hook.js', compat), { data: { root: pathToFileURL(`${oracleDir()}/`).href, compat } });
  for (const f of readdirSync(OPS).filter((x) => x.startsWith('op-')).sort()) {
    const mod = await loadUnderGrid(() => import(pathToFileURL(join(OPS, f)).href));
    const [charId, factory] = Object.entries(mod.default)[0];
    kits.push([f, charId, factory]);
  }
  for (const f of readdirSync(OPS).filter((x) => x.startsWith('chess_')).sort()) {
    try {
      chessKits.set(f, await loadUnderGrid(() => import(pathToFileURL(join(OPS, f)).href)));
    } catch (e) {
      chessFailed.push(`${f}: ${/** @type {Error} */ (e).message}`);
    }
  }
});

test('[兼容-2] the table: an engine module goes to its stand-in, content loads as it is, an unknown engine module is an error', () => {
  const root = 'file:///sh/', compat = 'file:///aue/compat/';
  assert.equal(mappedUrl(root, 'file:///sh/server/sim/targeting.js', compat), 'file:///aue/compat/sh/targeting.js');
  assert.equal(mappedUrl(root, 'file:///sh/server/data.js', compat), 'file:///aue/compat/sh/data.js');
  assert.equal(mappedUrl(root, 'file:///sh/server/sim/content/kits/shared/tier1.js', compat), null, 'content');
  assert.equal(mappedUrl(root, 'file:///elsewhere/x.js', compat), null, 'not Stronghold');
  assert.throws(() => mappedUrl(root, 'file:///sh/server/sim/battle.js', compat), /no mapping for the Stronghold module server\/sim\/battle\.js/);
  assert.equal(mappedUrl(root, 'file:///sh/shared/plugins/steps.js', compat), 'file:///aue/compat/sh/plugins/steps.js');
  assert.equal(Object.keys(MAPPING).length, 18);
});

test('[兼容-2] the pinned oracle’s 72 operator kits load unchanged; a name the layer does not provide yet throws when called', () => {
  assert.equal(kits.length, 72);
  for (const [f, charId, factory] of kits) assert.equal(typeof factory, 'function', `${f} ${charId}`);
  assert.throws(() => targeting.aggroCmp(), (e) => e instanceof CompatGap && e.what === 'targeting.aggroCmp');
});

test('[兼容-2] the pinned oracle’s 129 chess kits load too, each exporting the factories of its chess records', () => {
  assert.deepEqual(chessFailed, []);
  assert.equal(chessKits.size, 129);
  for (const [f, mod] of chessKits) {
    const entries = Object.entries(mod.default ?? {});
    assert.ok(entries.length > 0 && entries.every(([k, v]) => k.startsWith('chess_char_') && typeof v === 'function'), f);
  }
});

test('[兼容-2] the stand-in direction helpers: facing-RIGHT offsets turned a quarter per step, row 0 at the bottom', () => {
  assert.deepEqual(['UP', 'RIGHT', 'DOWN', 'LEFT'].map((d) => rotateOffset(1, 2, d)), [[2, -1], [1, 2], [-2, 1], [-1, -2]]);
  for (const d of ['UP', 'RIGHT', 'DOWN', 'LEFT']) assert.deepEqual(toLocal(...(/** @type {[number, number]} */ (rotateOffset(1, 2, d))), d), [1, 2]);
  assert.deepEqual([dirFromDelta(0, 0), dirFromDelta(2, 2), dirFromDelta(3, 1), dirFromDelta(-3, 1), normDir(-1), normDir('up')], ['RIGHT', 'RIGHT', 'UP', 'DOWN', 'LEFT', 'UP']);
  assert.deepEqual([offsetTile(4, 4, 0, 1, 'UP'), frontOf(4, 4, 'DOWN', 2)], [[5, 4], [2, 4]]);
  assert.ok(!Object.is(rotateOffset(0, 0, 'LEFT')[0], -0), 'never −0');
});

test('[兼容-3] an operator’s record at a build: its own attributes, range, trait, talents with its module’s changes, its skills', async () => {
  const t = await loadTraining('char_1035_wisdel'), b = { elite: 2, level: 90, potential: 6, trust: 100, skill: 2, skillLevel: 10, module: 0, moduleLevel: 3 };
  const rec = recordOf('char_1035_wisdel', t, b), s = statsAt(t, b, moduleAt(t, b));
  assert.deepEqual([rec.stats.maxHp, rec.stats.atk, rec.stats.bat, rec.stats.cost], [s.maxHp, s.atk, s.baseAttackTime, s.cost], 'no talent folded in');
  assert.deepEqual(rec.rangeGrid, t.phases[2].range.map((c) => [c.row, c.col]));
  assert.deepEqual([rec.skills.length, rec.skill.skillId, rec.skill.index], [3, 'skchr_wisdel_3', 2]);
  assert.equal(rec.skill.bb.atk, t.skills[2]?.levels[9].blackboard.find((e) => e.key === 'atk')?.value);
  assert.deepEqual([rec.module.id, rec.module.level, rec.module.active, rec.status], [t.modules[0].id, 3, true, { phase: 2, level: 90, skillLevel: 10, equipLevel: 3 }]);
  assert.ok(rec.talents.some((/** @type {any} */ x) => x.fromModule), 'its module changes a talent');
  const low = recordOf('char_1035_wisdel', t, { elite: 0, level: 1, potential: 1, trust: 0, skill: 0, skillLevel: 1 });
  assert.deepEqual([low.skills.length, low.module.active, low.talents.length], [1, false, 0], 'E0: one skill, no module, no talent');
  assert.deepEqual(gridOf('0-1'), [[0, 0]]);
  assert.equal(gridOf('nope'), null);
});

test('[兼容-3] the module choices as each module states them, and the record without a module', async () => {
  const t = await loadTraining('char_112_siege'), b = { elite: 2, level: 90, potential: 6, trust: 100, skill: 2, skillLevel: 10, module: 0, moduleLevel: 3 };
  const rec = recordOf('char_112_siege', t, b), [x, y] = rec.modules;
  assert.deepEqual([x.uniEquipId, x.typeName, x.isDefault, x.level, y.typeName, y.isDefault], ['uniequip_002_siege', 'SOL-X', true, 3, 'SOL-Y', false]);
  assert.equal(rec.statsBase.atk + x.attr.atk, rec.stats.atk, 'its flat attributes');
  assert.deepEqual([x.traitOverride?.bb, y.traitOverride, rec.traitBase.bb, rec.trait.bb], [{ atk: 0.08, def: 0.08 }, null, {}, { atk: 0.08, def: 0.08 }]);
  assert.deepEqual(x.talentChanges.map((/** @type {any} */ c) => [c.talentIndex, c.bb]), [[0, { atk: 0.08, def: 0.08 }]], 'the last unlocked step, as the module states it');
  assert.deepEqual([rec.talentsBase[0].bb, rec.talents[0].bb], [{ atk: 0.1, def: 0.1 }, { atk: 0.08, def: 0.08 }], 'without the module; merged with it');
  assert.deepEqual(y.talentChanges.map((/** @type {any} */ c) => [c.talentIndex, c.hidden, c.bb]), [[-1, true, { runtime_cost: -4 }], [1, false, { sp: 3 }], [-1, true, { sp: 1 }]]);
  assert.deepEqual(recordOf('char_112_siege', t, { elite: 1, level: 1, potential: 1, trust: 0, skill: 0, skillLevel: 1 }).modules, [], 'none unlocked');
});

test('[兼容-3] the def a kit receives: the record normalised, with the loadout', async () => {
  const t = await loadTraining('char_1035_wisdel'), def = defOf('char_1035_wisdel', t, { elite: 2, level: 90, potential: 5, trust: 100, skill: 1, skillLevel: 7 });
  assert.deepEqual([def.charId, def.diyFor, def.skill.id, def.skill.skillType, def.loadout.skillIndex, def.loadout.potential, def.loadout.moduleId], [
    'char_1035_wisdel', 'aue_char_1035_wisdel', 'skchr_wisdel_2', 'MANUAL', 1, 5, 'none']);
  assert.equal(def.raw.charId, 'char_1035_wisdel');
  assert.equal(def.stats.atk, def.raw.stats.atk);
});

test('[兼容-3] every kit’s factory builds its kit from our records: each skill at E2 with its last module, and at E0 and E1', async () => {
  let built = 0;
  for (const [f, charId, factory] of kits) {
    const t = await loadTraining(charId), mod = t.modules.length ? { module: t.modules.length - 1, moduleLevel: 3 } : {};
    const builds = [...t.skills.map((_, skill) => ({ elite: 2, level: t.phases[2].maxLevel, potential: 6, trust: 100, skill, skillLevel: 10, ...mod })),
      { elite: 0, level: 1, potential: 1, trust: 0, skill: 0, skillLevel: 1 }, { elite: 1, level: 1, potential: 1, trust: 0, skill: Math.min(1, t.skills.length - 1), skillLevel: 4 }];
    for (const b of builds) {
      const def = defOf(charId, t, b), kit = withGrid({ width: 12, height: 8 }, () => factory(def.skill?.bb ?? {}, def.raw, def));
      assert.ok(kit && typeof kit === 'object' && kit.skills, `${f} at elite ${b.elite}, skill ${b.skill}`);
      built++;
    }
  }
  assert.equal(built, 360);
});

test('[兼容-5] a kitted operator follows its kit’s trait: no aftershock beside its afterHit, its splash radius, a 塑灵术师’s summon 倍率 left to its kit', () => {
  const op = /** @type {any} */ ({ name: 'x', position: 'RANGED', cost: 9, blockCnt: 1, baseAttackTime: 1, maxHp: 1, atk: 1, def: 0, res: 0, range: [] });
  const entry = (/** @type {any} */ trait) => ({ factory: () => ({ skills: [], trait }), def: { raw: {} } });
  const lv = { width: 6, height: 3 };
  const bomb = withKitTrait({ ...op, branch: 'bombarder', trait: { aftershock: 0.5, splash: { radius: 0.9, scale: 1, ground: true } } }, entry({ afterHit: () => {}, splashRadius: 1.2 }), lv);
  assert.deepEqual([bomb.trait?.aftershock, bomb.trait?.splash], [0, { radius: 1.2, scale: 1, ground: true }]);
  const soul = withKitTrait({ ...op, branch: 'soulcaster', trait: { summonBlocked: true, summonBlockedScale: 1.15 } }, entry(undefined), lv);
  assert.deepEqual([soul.trait?.summonBlocked, soul.trait?.summonBlockedScale], [true, 1], 'its kit multiplies its hits itself');
  const plain = { ...op, branch: 'sword', trait: { hits: 2 } };
  assert.equal(withKitTrait(plain, entry({}), lv), plain, 'nothing to follow: the record as it is');
  const moduled = withKitTrait({ ...op, branch: 'executor', trait: { whiles: [{ when: 'alone4', mods: { atkPct: 0.1 } }], vs: [{ when: 'near', atk: 1.1 }], far: { min: 1, max: 4, dmg: 0.1 } } }, entry({}), lv);
  assert.deepEqual([moduled.trait?.whiles, moduled.trait?.vs, moduled.trait?.far, moduled.trait?.crowd, moduled.trait?.packed], [[], [], null, null, null],
    'a module\'s trait additions are its kit\'s (职业-17, 职业-18)');
});
