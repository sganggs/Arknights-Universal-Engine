// Kit barriers and 护盾 layers on the engine's buffs (docs/spec/compat.md 兼容-4, damage.md 伤害-8): the barrier, the
// layers and the damage types they absorb, as a kit's spec gives them in Stronghold's shape, absorb as the engine's do;
// a spent one stays when its spec gave modifiers or flags; `extend` raises what it merges into; what Stronghold does and
// we do not (INF-1120…INF-1122). Then three pinned kits, unchanged: 年's layers, 机械师's typed barrier, 林's 琉璃璧.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { oracleDir, tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { createWorld, step, status, attrs } from '@aue/sim';
import { loadUnderGrid } from '../src/compat/grid.js';
import { defOf } from '../src/compat/records.js';
import { kitsBehaviors } from '../src/compat/kits.js';
import { shieldTypeOf, SHIELD_KEEP } from '../src/compat/shields.js';
import { loadTraining, operatorAt } from '../src/operators.js';

/** @typedef {import('../src/compat/battle.js').ShBattle} ShBattle */

const NIAN = 'char_2014_nian', MCNIST = 'char_4230_mcnist', LIN = 'char_4080_lin';
/** E2 90, 潜能 6, S1, the first module at stage 3 (年 PRO-X, 机械师 SO-A, 林 PLX-X). */
const BUILD = { elite: 2, level: 90, potential: 6, trust: 100, skill: 0, skillLevel: 10, module: 0, moduleLevel: 3 };
const TYPES = /** @type {const} */ (['phys', 'arts', 'true', 'elemental']);
/** @type {Record<string, { factory: any, training: any }>} */
const real = {};

before(async () => {
  const compat = new URL('../src/compat/', import.meta.url).href;
  register(new URL('hook.js', compat), { data: { root: pathToFileURL(`${oracleDir()}/`).href, compat } });
  for (const [id, file] of [[NIAN, 'op-nian.js'], [MCNIST, 'op-mcnist.js'], [LIN, 'op-lin.js']]) {
    const mod = await loadUnderGrid(() => import(pathToFileURL(join(oracleDir(), 'server', 'sim', 'content', 'kits', 'ops', file)).href));
    real[id] = { factory: mod.default[id], training: await loadTraining(id) };
  }
});

/** An operator's record without its talents: its kit gives them (兼容-6). @param {Record<string, any>} op */
const bare = ({ talentBb, talentMods, talentTrait, fieldTalents, rangeTalents, critTalents, timedTalents, deployTalents, ...rest }) => rest;

/**
 * The tiny level with the guard (no DEF or RES, 10000 HP) and `ops` (kits' operators, their kits in `kits`); a slime of a
 * million HP and no attack, put rooted at (1, 4) once it is there.
 * @param {Record<string, any>} kits @param {Record<string, any>} [ops]
 */
function match(kits, ops = {}) {
  const c = /** @type {any} */ (tinyContent());
  Object.assign(c.level.options, { initialCost: 99, maxCost: 99, characterLimit: 4 });
  c.level.waves = [oneWave([spawnAt(0.1, 'slime')])];
  Object.assign(c.operators.guard, { def: 0, res: 0, maxHp: 10000, respawnTime: 1 });
  Object.assign(c.operators, ops);
  c.enemies.slime.maxHp = 1e6;
  c.decks = [Object.keys(c.operators)];
  const box = /** @type {{ b: ShBattle | null }} */ ({ b: null });
  c.behaviors = kitsBehaviors(kits, (x) => { box.b = x; });
  const w = createWorld(c, { seed: 1, players: 1 });
  /** @type {any} */
  let slime;
  for (let i = 0; i < 30 && !(slime = w.units.find((u) => u.key === 'slime')); i++) step(w, c);
  Object.assign(slime, { x: 4, y: 1 });
  status.applyStatus(slime, 'root', {});
  return { w, c, b: /** @type {ShBattle} */ (box.b), slime };
}

/** @param {any} w @param {string} key */
const unit = (w, key) => w.units.find((/** @type {any} */ u) => u.key === key);
/** The guard deployed on (1, 1) as a kit sees it. @param {{ w: any, c: any, b: ShBattle }} m @returns {any} */
function guardOf(m) {
  step(m.w, m.c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  return m.b.unitOf(unit(m.w, 'guard'));
}
/** The engine's buff of a key on a kit's unit. @param {any} sh @param {string} key */
const engineBuff = (sh, key) => sh.u.buffs.find((/** @type {any} */ x) => x.key === key);
/** Deals `amount` of `type` with no source; returns the HP it took. @param {ShBattle} b @param {any} t @param {number} amount @param {string} [type] */
const hit = (b, t, amount, type = 'true') => b.dealDamage(null, t, { amount, type });

test('[兼容-4] a kit\'s barrier reaches the engine\'s buff: it takes min(barrier, damage) of every type until spent, then the buff goes; the amount is the spec\'s, else its modifiers\' shield, at least 0', () => {
  const m = match({}), { b } = m, g = guardOf(m);
  b.addBuff(g, { key: 'wall', shield: 300 });
  const wall = g.findBuff('wall');
  assert.deepEqual([wall.shield, engineBuff(g, 'wall').shield, engineBuff(g, 'wall').shieldType], [300, 300, '']);
  assert.deepEqual([hit(b, g, 100, 'phys'), hit(b, g, 150, 'arts'), wall.shield, g.hp], [0, 0, 50, 10000], 'physical, arts: whole');
  assert.deepEqual([hit(b, g, 80), wall.shield, g.hp, g.findBuff('wall')], [30, 0, 9970, null], 'the rest to HP; spent, the buff goes');
  b.addBuff(g, { key: 'wall', shield: 500 });
  assert.deepEqual([hit(b, g, 450, 'elemental'), g.findBuff('wall').shield, hit(b, g, 70), g.hp], [0, 50, 20, 9950], 'another amount; 元素伤害 too');
  b.addBuff(g, { key: 'old', mods: { shield: 120 } });
  assert.deepEqual([g.findBuff('old').shield, hit(b, g, 200), g.hp], [120, 80, 9870], 'Stronghold reads a barrier from the modifiers when the spec has none');
  b.addBuff(g, { key: 'both', shield: 40, mods: { shield: 400 } });
  assert.equal(g.findBuff('both').shield, 40, 'the spec\'s own first');
  b.removeBuff(g, 'both');
  b.addBuff(g, { key: 'both', shield: 0, mods: { shield: 400 } });
  assert.equal(g.findBuff('both').shield, 0, 'a barrier of 0 the spec gives is its own too (Stronghold\'s ??)');
  b.removeBuff(g, 'both');
  b.removeBuff(g, 'old');
  for (const shield of [-50, NaN, '', 0]) {
    b.addBuff(g, { key: 'none', shield, shieldHits: shield === 0 ? 0 : 1, shieldType: 'arts' });
    assert.deepEqual([engineBuff(g, 'none').shield, hit(b, g, 10)], [0, 10], String(shield));
  }
  assert.deepEqual(b.errors, []);
});

test('[兼容-4] a kit\'s 护盾 layers: each negates one hit, whatever its size, until none is left; part of a layer counts as one; the kit reads the layers left', () => {
  const m = match({}), { b } = m, g = guardOf(m);
  b.addBuff(g, { key: 'layers', shieldHits: 2 });
  const l = g.findBuff('layers');
  assert.deepEqual([l.shieldHits, hit(b, g, 900, 'phys'), l.shieldHits, hit(b, g, 5, 'arts'), g.findBuff('layers'), hit(b, g, 40), g.hp],
    [2, 0, 1, 0, null, 40, 9960]);
  for (const [n, negated] of [[3, 3], [1.5, 2], [0.4, 1], [-1, 0], [NaN, 0]]) {
    b.addBuff(g, { key: 'layers', shieldHits: n });
    let k = 0;
    while (k < 9 && hit(b, g, 1) === 0) k++;
    assert.equal(k, negated, `${n} layers`);
  }
  assert.deepEqual(b.errors, []);
});

test('[兼容-4] what a kit\'s shield absorbs: none named is every type; a type, or a list of them, only those (the engine\'s "+"); names of no damage type count for nothing, and with none it absorbs nothing', () => {
  assert.deepEqual([undefined, null, '', false, 'arts', 'phys', ['phys', 'arts'], ['arts', 'true', 'phys'], ['phys', 'element'], [], ['element'], 'phys+arts', true, 5]
    .map(shieldTypeOf), ['', '', '', '', 'arts', 'phys', 'phys+arts', 'phys+arts+true', 'phys', 'none', 'none', 'none', 'none', 'none']);
  const m = match({}), { b } = m, g = guardOf(m);
  /** The HP a hit of 100 of each type takes through a fresh buff of `spec`. @param {Record<string, any>} spec */
  const through = (spec) => Object.fromEntries(TYPES.map((type) => {
    b.addBuff(g, { key: 'typed', ...spec });
    return [type, hit(b, g, 100, type)];
  }));
  const all = (/** @type {number} */ n) => ({ phys: n, arts: n, true: n, elemental: n });
  // 夜莺 S2 'arts', 傀影 S1 'phys', 机械师 ['phys', 'arts'], 电弧 S1 ['phys', 'arts', 'true'], the rest none
  assert.deepEqual(through({ shield: 500, shieldType: 'arts' }), { ...all(100), arts: 0 });
  assert.deepEqual(through({ shield: 500, shieldType: 'phys' }), { ...all(100), phys: 0 });
  assert.deepEqual(through({ shield: 500, shieldType: ['phys', 'arts'] }), { ...all(0), true: 100, elemental: 100 });
  assert.deepEqual(through({ shield: 500, shieldType: ['phys', 'arts', 'true'] }), { ...all(0), elemental: 100 });
  assert.deepEqual(through({ shield: 500 }), all(0));
  assert.deepEqual(through({ shield: 500, shieldType: null }), all(0));
  assert.deepEqual(through({ shield: 500, shieldType: [] }), all(100), 'Stronghold\'s empty list absorbs nothing');
  assert.deepEqual(through({ shieldHits: 9, shieldType: 'arts' }), { ...all(100), arts: 0 }, 'layers of a type');
  assert.deepEqual(through({ shieldHits: 9, shieldType: ['true', 'elemental'] }), { ...all(0), phys: 100, arts: 100 });
  b.addBuff(g, { key: 'later', shieldType: 'arts' });
  g.findBuff('later').shield = 100;
  assert.deepEqual([hit(b, g, 60, 'phys'), hit(b, g, 60, 'arts'), g.findBuff('later').shield], [60, 0, 40], 'a type with no amount yet: a barrier the kit writes later is of that type');
  assert.deepEqual(b.errors, []);
});

test('[兼容-4] a spent kit shield stays when its spec gave modifiers or flags, empty ones too, and goes when it gave neither; a kit\'s write of the barrier follows that rule; extend raises the barrier and layers it merges into, stack keeps them', () => {
  const m = match({}), { b } = m, g = guardOf(m);
  /** Spends `spec`'s shield with one hit of 100; whether its buff stays, and its engine flags then. @param {Record<string, any>} spec */
  const spent = (spec) => {
    b.addBuff(g, { key: 'k', ...spec });
    hit(b, g, 100);
    const x = engineBuff(g, 'k');
    b.removeBuff(g, 'k');
    return x ? x.flags : null;
  };
  assert.deepEqual([spent({ shield: 100 }), spent({ shieldHits: 1 }), spent({ shield: 100, shieldType: 'true' }), spent({ shield: 100, mods: null, flags: undefined })],
    [null, null, null, null], 'neither given (null or undefined is none, as Stronghold\'s ??): it goes');
  assert.deepEqual([spent({ shield: 100, mods: {} }), spent({ shield: 100, flags: {} }), spent({ shieldHits: 1, mods: {} }), spent({ shield: 100, flags: { stun: false }, mods: { atkPct: '1' } })],
    Array(4).fill({ [SHIELD_KEEP]: true }), 'given, though empty: it stays');
  assert.deepEqual([spent({ shield: 100, mods: { defPct: 0.1 } }), spent({ shield: 100, flags: { invulnerable: true } })], [{}, { invincible: true }], 'with real ones the engine keeps it itself');
  assert.deepEqual([spent({ mods: {} }), spent({ mods: {}, shield: 0 })], [{}, {}], 'no shield: nothing added');
  b.addBuff(g, { key: 'glass', shield: 100, mods: {} });
  const glass = g.findBuff('glass');
  assert.deepEqual([hit(b, g, 130), g.findBuff('glass')?.shield, hit(b, g, 20)], [30, 0, 20], 'kept, spent: it takes nothing');
  glass.shield = 60;
  assert.deepEqual([hit(b, g, 50), glass.shield], [0, 10], 'written again: it absorbs again');
  glass.shield = 0;
  assert.ok(g.findBuff('glass'), 'a write of 0 keeps it too');
  b.addBuff(g, { key: 'plain', shield: 100 });
  g.findBuff('plain').shield = 0;
  assert.equal(g.findBuff('plain'), null, 'a plain one goes at a write of 0');
  b.addBuff(g, { key: 'e', shield: 100, shieldHits: 1, refresh: 'extend', duration: 5 });
  b.addBuff(g, { key: 'e', shield: 300, shieldHits: 3, refresh: 'extend', duration: 1 });
  const e = g.findBuff('e');
  assert.deepEqual([g.u.buffs.filter((/** @type {any} */ x) => x.key === 'e').length, e.shield, e.shieldHits, e.timeLeft], [1, 300, 3, 5], 'raised; the longer time');
  b.addBuff(g, { key: 'e', shield: 50, refresh: 'extend' });
  assert.deepEqual([e.shield, e.shieldHits], [300, 3], 'a lower one changes neither');
  b.addBuff(g, { key: 's', shield: 100, refresh: 'stack', maxStacks: 3 });
  b.addBuff(g, { key: 's', shield: 300, shieldHits: 2, refresh: 'stack', maxStacks: 3 });
  assert.deepEqual([g.findBuff('s').shield, g.findBuff('s').shieldHits, g.findBuff('s').stacks], [100, 0, 2], 'stack keeps them, as Stronghold\'s');
  assert.deepEqual(b.errors, []);
});

test('[兼容-4] a kit\'s barrier and layers are left alone on an invincible unit, and by a 流失 or 元素损伤', () => {
  const m = match({}), { b } = m, g = guardOf(m);
  b.addBuff(g, { key: 'wall', shield: 300, shieldHits: 1 });
  const wall = g.findBuff('wall'), hp = g.hp;
  b.addBuff(g, { key: 'god', flags: { invulnerable: true } });
  assert.deepEqual([hit(b, g, 100), wall.shieldHits, wall.shield, g.hp], [0, 1, 300, hp], 'invincible: nothing taken, nothing spent');
  b.removeBuff(g, 'god');
  assert.deepEqual([b.loseHp(g, 50), wall.shieldHits, wall.shield, g.hp], [50, 1, 300, hp - 50], 'a 流失 goes past them');
  b.dealDamage(null, g, { type: 'element', element: 'burn', amount: 100 });
  assert.deepEqual([wall.shieldHits, wall.shield, g.hp], [1, 300, hp - 50], '元素损伤 goes to the element');
  assert.deepEqual([hit(b, g, 100), wall.shieldHits, wall.shield], [0, 0, 300], 'then a hit takes the layer');
  assert.deepEqual(b.errors, []);
});

test('[兼容-4] a kit\'s shields take their turn in the engine\'s 伤判 (DIF-0007): by acquisition order, the older barrier first; a dodge buff older than a barrier leaves it whole, a newer one dodges what the barrier let through', () => {
  const m = match({}), { b } = m, g = guardOf(m);
  const ind = { key: 'ind', refresh: 'independent', maxStacks: 9 };
  b.addBuff(g, { ...ind, shield: 100 });
  b.addBuff(g, { ...ind, shield: 50 });
  const left = () => g.u.buffs.filter((/** @type {any} */ x) => x.key === 'ind').map((/** @type {any} */ x) => x.shield);
  assert.deepEqual([hit(b, g, 60), left()], [0, [40, 50]], 'the older first');
  assert.deepEqual([hit(b, g, 60), left()], [0, [30]], 'spent, it goes and the next takes the rest');
  b.removeBuff(g, 'ind');
  let dodges = 0;
  b.on('dodge', (k) => { if (k.target === g) dodges++; });
  b.addBuff(g, { key: 'evade', mods: { dodgePhys: 1 } });
  b.addBuff(g, { key: 'wall', shield: 100 });
  assert.deepEqual([hit(b, g, 60, 'phys'), g.findBuff('wall').shield, dodges], [0, 100, 1], 'the dodge first: the barrier untouched');
  b.removeBuff(g, 'evade');
  b.addBuff(g, { key: 'evade', mods: { dodgePhys: 1 } });
  assert.deepEqual([hit(b, g, 150, 'phys'), g.findBuff('wall'), dodges], [0, null, 2], 'the barrier first: spent, the rest dodged');
  assert.deepEqual(b.errors, []);
});

test('[兼容-4] a hit a kit shield takes whole has no damaged (INF-1120); a spent one the engine takes away runs no onRemove, one the kit removes does (INF-1121)', () => {
  const m = match({}), { b } = m, g = guardOf(m);
  /** @type {string[]} */
  const log = [];
  b.on('damaged', (k) => { if (k.target === g) log.push(`damaged:${k.amount}`); });
  b.on('hpDamage', (k) => { if (k.target === g) log.push(`hpDamage:${k.amount}`); });
  b.addBuff(g, { key: 'w1', shield: 50, onRemove: () => log.push('w1') });
  hit(b, g, 30);
  assert.deepEqual(log.splice(0), [], 'taken whole: no event');
  hit(b, g, 30);
  assert.deepEqual([g.findBuff('w1'), log.splice(0)], [null, ['hpDamage:10', 'damaged:10']], 'spent by a hit: gone, no onRemove; the rest\'s events');
  b.addBuff(g, { key: 'w2', shield: 50, onRemove: () => log.push('w2') });
  b.removeBuff(g, 'w2');
  assert.deepEqual(log, ['w2']);
  assert.deepEqual(b.errors, []);
});

test('[兼容-4] a lasting kit barrier comes back at the next deployment with the amount the kit gave, not what was left (INF-1122)', () => {
  const kit = () => ({ skills: {}, install() {} });
  const m = match({ guard: { def: { name: 'guard', skill: null, raw: {} }, factory: kit } }), { w, c, b } = m, g = guardOf(m);
  b.addBuff(g, { key: 'keepsake', shield: 100, shieldHits: 2, persist: true });
  assert.deepEqual([hit(b, g, 60), hit(b, g, 60), hit(b, g, 60), g.findBuff('keepsake').shieldHits, g.findBuff('keepsake').shield], [0, 0, 0, 0, 40], 'two layers, then 60 of the barrier');
  step(w, c, [[0, { type: 'retreat', unit: g.u.id }]]);
  for (let i = 0; i < 300 && !unit(w, 'guard'); i++) step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  assert.equal(b.unitOf(unit(w, 'guard')), g, 'the same piece');
  assert.deepEqual([g.findBuff('keepsake').shield, g.findBuff('keepsake').shieldHits], [100, 2]);
  assert.deepEqual(b.errors, []);
});

/**
 * One of the pinned kits on the tiny level, the blackboard of its talent `talent` changed by `bb`, deployed at `at`
 * (row, col); `rec` changes its record.
 * @param {string} id @param {string} key its operator key
 * @param {{ talent: string, bb: Record<string, number>, at: [number, number], rec?: Record<string, any> }} o
 */
function pinned(id, key, { talent, bb, at, rec = {} }) {
  const { factory, training } = real[id], def = defOf(id, training, BUILD);
  def.raw = { ...def.raw, talents: def.raw.talents.map((/** @type {any} */ t) => (t.name === talent ? { ...t, bb: { ...t.bb, ...bb } } : t)) };
  const m = match({ [key]: { factory, def } }, { [key]: { ...bare(operatorAt(training, BUILD)), respawnTime: 1, ...rec } });
  step(m.w, m.c, [[0, { type: 'deploy', op: key, row: at[0], col: at[1], dir: 0 }]]);
  return { ...m, op: /** @type {any} */ (m.b.unitOf(unit(m.w, key))) };
}

test('[兼容-4] 年\'s kit unchanged: 干明可鉴 gives `times` 护盾 layers at her deployment, each negating a hit; PRO-X counts the broken ones by the layers it reads — a 流失 breaks none; a negated hit has no damaged, so its stacks come with the next hit that lands (INF-1120)', () => {
  for (const times of [2, 3]) {
    const { b, op: n } = pinned(NIAN, 'nian', { talent: '干明可鉴', bb: { times }, at: [1, 1] });
    const stacks = () => n.findBuff('talent:nian:shieldBreak')?.stacks ?? 0;
    assert.deepEqual([n.findBuff('talent:nian:shield')?.shieldHits, engineBuff(n, 'talent:nian:shield').shieldType], [times, '']);
    assert.deepEqual([b.loseHp(n, 10), stacks()], [10, 0], 'a 流失 skips the layers; all of them are read there');
    const negated = Array.from({ length: times }, () => hit(b, n, 500, 'arts'));
    assert.deepEqual([negated, n.findBuff('talent:nian:shield'), stacks()], [Array(times).fill(0), null, 0], 'each hit negated, the spent buff gone; no damaged yet');
    assert.deepEqual([hit(b, n, 500), stacks()], [500, times], 'the next hit lands: every broken layer at once');
    assert.deepEqual(b.errors, []);
  }
});

test('[兼容-4] 机械师\'s kit unchanged: 生命方程\'s barrier at her deployment is hp_ratio × her max HP, of physical and arts damage only (her [\'phys\', \'arts\']) — true damage passes it — and the hit that breaks it is cancelled whole (超额防护)', () => {
  for (const ratio of [0.4, 0.25]) {
    const { b, op: me } = pinned(MCNIST, 'mcnist', { talent: '生命方程', bb: { hp_ratio: ratio }, at: [1, 1], rec: { def: 0, res: 0 } });
    const bar = me.findBuff('mcnist:t2:barrier'), full = ratio * attrs.statsOf(me.u).maxHp, hp = me.hp;
    assert.deepEqual([bar.shield, engineBuff(me, 'mcnist:t2:barrier').shieldType], [full, 'phys+arts']);
    assert.deepEqual([hit(b, me, 100), bar.shield, me.hp], [100, full, hp - 100], 'true damage passes it');
    assert.deepEqual([hit(b, me, 300, 'arts'), bar.shield], [0, full - 300]);
    assert.deepEqual([hit(b, me, full, 'phys'), me.hp, me.findBuff('mcnist:t2:barrier')], [0, hp - 100, null], 'the hit that breaks it: cancelled whole');
    assert.deepEqual([hit(b, me, 200, 'phys'), me.hp], [200, hp - 300], 'then physical damage lands');
    assert.deepEqual(b.errors, []);
  }
});

test('[兼容-4] 林\'s kit unchanged: the 琉璃璧 (its talent\'s `value`; its spec\'s mods: {}) stays when hits drain it, so the hit that breaks it bursts — the enemy next to her stunned and hit — and it is back `interval` s later; a hit it takes whole does not fill it again (INF-1120)', () => {
  for (const [value, interval] of [[300, 2], [200, 1]]) {
    const { w, c, b, slime, op: lin } = pinned(LIN, 'lin', { talent: '计出万全', bb: { value, interval }, at: [2, 2] });
    Object.assign(slime, { x: 2, y: 1 });
    const glass = () => lin.findBuff('lin:glass');
    assert.equal(glass()?.shield, value);
    assert.deepEqual([hit(b, lin, value - 50), glass()?.shield], [0, 50], 'taken whole: not filled again (Stronghold fills it at a damaged of 0)');
    assert.deepEqual([hit(b, lin, 50), glass()?.shield, engineBuff(lin, 'lin:glass').flags], [0, 0, { [SHIELD_KEEP]: true }], 'drained to 0: it stays');
    // the hit comes between frames: it counts from the frame to come
    const before = slime.hp, at = w.frame;
    assert.deepEqual([hit(b, lin, 40), glass(), attrs.statsOf(slime).flags.stun, slime.hp < before], [40, null, true, true], 'the next hit breaks it: the burst');
    while (!glass() && w.frame < at + 600) step(w, c);
    assert.deepEqual([w.frame - 1 - at, glass()?.shield], [interval * 30, value], 'back interval s later (the frame it came back in)');
    assert.deepEqual([hit(b, lin, value + 10), glass()], [10, null], 'one hit beyond it breaks it at once');
    assert.deepEqual(b.errors, []);
  }
});
