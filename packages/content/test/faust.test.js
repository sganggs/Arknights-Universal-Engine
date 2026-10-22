// 浮士德 and 锈锤战士 (docs/spec/foes.md 敌能-79): invincible from the appearance frame, 致命一击 in place of the
// attack once a ground unit of ours is in range, 召唤弩炮 from a branch the two fortress levels do not have.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, damage, targeting, status, buffs, blocking, stateHash, takeSnapshot, restoreSnapshot } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { levelAt, levelContent, skeletonContent } from '../src/index.js';
import { uncoveredAbilities, withFoeExtras, withoutIncomplete } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').Content} Content */

const FAUST = 'enemy_1508_faust';
const FLSNIP = 'enemy_2006_flsnip';
const HARD = levelContent('act1multi_fortress_hard-01', 'NORMAL');
const RM = levelContent('act1multi_fortress_rm01', 'NORMAL');
const DEF = 200;
const RES = 50;

/** Physical and arts damage against the guard this file deploys (伤害-2, 伤害-3). @param {number} atk */
const phys = (atk) => Math.max(atk - DEF, 0.05 * atk);
/** @param {number} atk */
const artsOf = (atk) => Math.max(atk * (1 - RES / 100), 0.05 * atk);

/**
 * The tiny map. Enemies spawn on frame 0 and are rooted at (1, 2). `tweak` runs before the world exists.
 * @param {Record<string, unknown>} enemies @param {unknown[]} waves @param {(c: Content) => void} [tweak]
 */
function field(enemies, waves, tweak) {
  const c = /** @type {Content} */ (/** @type {unknown} */ (tinyContent()));
  c.enemies = /** @type {Content['enemies']} */ (enemies);
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = /** @type {Content['level']['waves']} */ (waves);
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 9 };
  for (const op of Object.values(c.operators)) Object.assign(op, { cost: 0, maxHp: 1e6, atk: 0, def: DEF, res: RES });
  tweak?.(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const es = w.units.filter((u) => u.owner < 0);
  for (const e of es) { e.x = 2; e.y = 1; e.path = []; status.applyStatus(e, 'root', {}); }
  return { c, w, es };
}

/** Deploys the guard. The events are that frame's, whose index is `w.frame - 1` afterwards. @param {World} w @param {Content} c @param {number} [col] */
function deploy(w, c, col = 2) {
  const frame = w.frame;
  const ev = step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col, dir: 0 }]]);
  const g = /** @type {Unit} */ (w.units.find((u) => u.owner >= 0));
  return { frame, ev, g };
}

/** Hit amounts from one enemy in these events. @param {readonly Record<string, string | number>[]} ev @param {number} id */
const hitAmounts = (ev, id) => ev.filter((x) => x.type === 'hit' && x.id === id).map((x) => /** @type {number} */ (x.damage));

/**
 * Hits over the next `n` frames, each tagged with the frame that produced it.
 * @param {World} w @param {Content} c @param {Unit} e @param {number} n
 */
function hitsFor(w, c, e, n) {
  /** @type {{ frame: number, damage: number }[]} */
  const out = [];
  for (let i = 0; i < n; i++) {
    const frame = w.frame;
    for (const damage of hitAmounts(step(w, c), e.id)) out.push({ frame, damage: /** @type {number} */ (damage) });
  }
  return out;
}

/** The first attack frame at or after the cooldown is ready. `readyAt` is the cd left after the spawn frame. @param {number} readyAt @param {number} every */
function skillFrame(readyAt, every) {
  let t = 1;
  while (t < readyAt) t += every;
  return t;
}

/** 锈锤战士 from the enemy table, plus the page-only marker, arts type and noFly (敌能-79). */
function flsnip() {
  return withFoeExtras(FLSNIP, {
    name: '锈锤战士', maxHp: 40000, atk: 1200, def: 550, res: 40, moveSpeed: 0.4, baseAttackTime: 5, rangeRadius: 20,
    applyWay: 'RANGED', motion: 'WALK', massLevel: 5, levelType: 'BOSS', immune: ['silence'],
    talents: { invincible: { duration: 60 } },
    skills: [{ key: 'CriticalHit', cooldown: 18, initCooldown: 18, sp: 0, bb: { atk_scale: 3 } }],
  });
}

const COVERED = ['invincible', 'CriticalHit', 'SummonBallis'];

/** One fortress difficulty still has other gaps, and none of this family's names. @param {string} id @param {'NORMAL' | 'FOUR_STAR'} d */
function gapClear(id, d) {
  const names = levelAt(id, d).level.uncovered ?? [];
  assert.ok(names.length > 0, id);
  for (const name of COVERED) assert.equal(names.includes(name), false, `${id} ${d} ${name}`);
}

/** 「寒灾」 keeps the unread `invincible` and gains none of this family's flags. */
function witchStays() {
  const witch = { name: '寒灾', maxHp: 100, atk: 0, def: 0, res: 0, moveSpeed: 0, talents: { invincible: { duration: 80 } } };
  assert.deepEqual(uncoveredAbilities([/** @type {any} */ (witch)]), ['invincible']);
  assert.equal(withoutIncomplete(/** @type {any} */ (witch)).talents?.invincible, undefined);
  const { es: [e] } = field({ witch }, [oneWave([spawnAt(0, 'witch')])]);
  assert.equal(e.buffs.some((b) => b.key === 'appear:invincible' || b.key === 'faust:body'), false);
  assert.equal(!!attrs.statsOf(e).flags.unblockable, false);
  assert.equal(targeting.selectable(e), true);
  assert.equal(withFoeExtras('enemy_2007_flwitch', /** @type {any} */ (witch)).talents?.invincible?.page, undefined);
}

test('[敌能-79] [关卡-2] fortress gaps lose the three names; 「寒灾」 stays uncovered and does nothing', () => {
  for (const id of ['act1multi_fortress_hard-01', 'act1multi_fortress_rm01']) { gapClear(id, 'NORMAL'); gapClear(id, 'FOUR_STAR'); }
  witchStays();
  const marked = withFoeExtras(FAUST, /** @type {any} */ ({ name: 'x', maxHp: 1, atk: 1, def: 0, res: 0, moveSpeed: 1, talents: { invincible: { duration: 150 } }, skills: [{ key: 'CriticalHit', bb: { atk_scale: 2 } }] }));
  assert.equal(marked.talents?.invincible?.page, 1);
  assert.equal(marked.skills?.[0].bb.arts, 0);
  assert.equal(flsnip().skills?.[0].bb.arts, 1);
});

test('[敌能-79] 150 s, 120 s and 60 s invincible from the appearance frame, then damage; unblockable and sleep-immune stay', () => {
  for (const [key, def, seconds] of /** @type {const} */ ([
    [FAUST, HARD.enemies[FAUST], 150], [FAUST, RM.enemies[FAUST], 120], [FLSNIP, flsnip(), 60],
  ])) {
    const { c, w, es: [e] } = field({ [key]: def }, [oneWave([spawnAt(0, key)])]);
    const end = seconds * 30;
    while (w.frame < end) {
      assert.equal(damage.dealDamage(w, null, e, { type: 'true', amount: 7 }), 0);
      assert.equal(targeting.selectable(e), false);
      step(w, c);
    }
    assert.equal(damage.dealDamage(w, null, e, { type: 'true', amount: 7 }), 0, `${seconds}s still holds`);
    status.applyStatus(e, 'sleep', {});
    assert.equal(!!attrs.statsOf(e).flags.sleep, false);
    assert.equal(attrs.statsOf(e).disabled, false);
    assert.equal(attrs.statsOf(e).flags.unblockable, true);
    step(w, c);
    assert.equal(e.buffs.some((b) => b.key === 'appear:invincible'), false, `${seconds}s ends`);
    assert.equal(targeting.selectable(e), true);
    assert.equal(damage.dealDamage(w, null, e, { type: 'true', amount: 7 }), 7);
    assert.equal(attrs.statsOf(e).flags.unblockable, true);
    assert.equal(!!attrs.statsOf(e).flags.sleep, false);
  }
});

test('[敌能-79] 致命一击 replaces the attack at 17 s / 30 s / 18 s: 200% and 250% physical, 300% arts, and not without a ground unit', () => {
  const rows = [
    { key: FAUST, def: HARD.enemies[FAUST], scale: 2, kind: 'phys' },
    { key: FAUST, def: RM.enemies[FAUST], scale: 2.5, kind: 'phys' },
    { key: FLSNIP, def: flsnip(), scale: 3, kind: 'arts' },
  ];
  for (const row of rows) {
    const quiet = field({ [row.key]: row.def }, [oneWave([spawnAt(0, row.key)])]);
    const readyAt = quiet.es[0].ab['CriticalHit.cd'];
    assert.deepEqual(hitsFor(quiet.w, quiet.c, quiet.es[0], readyAt + 5), [], 'no ground unit, no hit');
    const { c, w, es: [e] } = field({ [row.key]: row.def }, [oneWave([spawnAt(0, row.key)])]);
    const every = attrs.intervalFrames(e.base.bat, e.base.aspd);
    const at = skillFrame(e.ab['CriticalHit.cd'], every);
    const { ev } = deploy(w, c);
    const hits = hitAmounts(ev, e.id).map((damage) => ({ frame: 1, damage: /** @type {number} */ (damage) }));
    hits.push(...hitsFor(w, c, e, at));
    const dealt = row.kind === 'arts' ? artsOf(e.base.atk * row.scale) : phys(e.base.atk * row.scale);
    assert.ok(hits.some((h) => h.frame < at && h.damage === phys(e.base.atk)), `ordinary physical hit before ${at}`);
    assert.equal(hits.find((h) => h.frame === at)?.damage, dealt, `${row.kind} × ${row.scale} at frame ${at}`);
    assert.equal(hits.filter((h) => h.frame === at).length, 1, 'the skill replaces the attack');
  }
});

test('[敌能-79] 致命一击 does not fire for a flyer, an out-of-range blocker, or while silenced', () => {
  const { c, w, es: [e] } = field({ [FLSNIP]: flsnip() }, [oneWave([spawnAt(0, FLSNIP)])], (cc) => { Object.assign(cc.operators.guard, { motion: 'FLY' }); });
  const opened = deploy(w, c);
  assert.deepEqual(hitsFor(w, c, e, 40), []);
  assert.deepEqual(hitAmounts(opened.ev, e.id), []);
  opened.g.base.motion = 'WALK';
  const landed = hitsFor(w, c, e, 1);
  assert.equal(landed[0].damage, phys(e.base.atk), 'a ground unit, and the cooldown is not ready yet');

  const far = body({ rangeRadius: 0.2, skills: [skill(0, 2, 0)] });
  const held = field({ far }, [oneWave([spawnAt(0, 'far')])]);
  const away = deploy(held.w, held.c, 4);
  assert.equal(blocking.blockBy(held.w, held.es[0], away.g), true);
  const launched = step(held.w, held.c);
  assert.equal(held.es[0].ab['CriticalHit.cd'], 0, 'a failed trigger does not start the cooldown');
  const flown = [...hitAmounts(launched, held.es[0].id), ...hitsFor(held.w, held.c, held.es[0], 8).map((h) => h.damage)];
  assert.deepEqual(flown, [phys(1000)], 'the blocker is outside the attack radius, so the shot stays ordinary');

  const mute = body({ immune: [], skills: [skill(0, 2, 0)] });
  const silenced = field({ mute }, [oneWave([spawnAt(0, 'mute')])]);
  status.applyStatus(silenced.es[0], 'silence', {});
  const first = deploy(silenced.w, silenced.c);
  assert.deepEqual(hitAmounts(first.ev, silenced.es[0].id), [phys(1000)]);
  buffs.removeBuff(silenced.es[0], 'silence');
  const next = hitsFor(silenced.w, silenced.c, silenced.es[0], attrs.intervalFrames(5, 100));
  assert.equal(next.at(-1)?.damage, phys(2000));
});

/** A ranged body whose 致命一击 is already on the blackboard (the page marker, without FOE_EXTRAS). @param {Record<string, unknown>} over */
function body(over) {
  return {
    name: 't', maxHp: 5000, atk: 1000, def: 0, res: 0, moveSpeed: 0, baseAttackTime: 5, rangeRadius: 8, applyWay: 'RANGED', motion: 'WALK', ...over,
  };
}

/** @param {number} init @param {number} scale @param {number} arts */
function skill(init, scale, arts) {
  return { key: 'CriticalHit', cooldown: 10, initCooldown: init, sp: 0, bb: { atk_scale: scale, arts } };
}

test('[敌能-79] 召唤弩炮 never fires in the fortress levels, and takes the next plain entry of a synthetic faust_ballis', () => {
  for (const lv of [HARD, RM]) {
    const { c, w, es: [e] } = field({ [FAUST]: lv.enemies[FAUST] }, [oneWave([spawnAt(0, FAUST)])], (cc) => { cc.level.branches = lv.level.branches; });
    deploy(w, c);
    hitsFor(w, c, e, 800);
    assert.equal(w.units.filter((u) => u.owner < 0 && u.key !== FAUST).length, 0);
    assert.equal(e.ab['SummonBallis.cd'], 0, 'nothing summoned, so the cooldown is not started again');
  }
  const { c, w, es: [e] } = field({ caster: caster() }, [oneWave([spawnAt(0, 'caster')])], arm);
  const first = deploy(w, c);
  assert.deepEqual(hitAmounts(first.ev, e.id), [], 'the summon occupies the attack');
  assert.deepEqual(placed(w), [[4, 0, 1]], 'the missing key and the hidden group are skipped');
  const snap = takeSnapshot(w);
  const copy = restoreSnapshot(snap);
  assert.equal(stateHash(copy), stateHash(w));
  for (let i = 0; i < 30; i++) { step(w, c); step(copy, c); }
  assert.equal(stateHash(copy), stateHash(w));
  assert.deepEqual(placed(w), [[4, 0, 1], [4, 0, 1]]);
  assert.deepEqual(placed(copy), [[4, 0, 1], [4, 0, 1]], 'the restored cursor does not summon the first entry again');
  hitsFor(w, c, e, 30);
  assert.deepEqual(placed(w), [[4, 0, 1], [4, 0, 1], [0, 2, 0]]);
  const after = hitsFor(w, c, e, 30);
  assert.equal(placed(w).length, 3);
  assert.equal(after.at(-1)?.damage, phys(1000), 'the branch is used up: an ordinary attack');
  assert.equal(e.ab['SummonBallis.cd'], 0);
});

test('[敌能-79] 致命一击 takes the attack ahead of 召唤弩炮; two casters share the branch', () => {
  const { c, w, es: [e] } = field({ both: { ...caster(), atk: 1000, skills: [skill(0, 2, 0), caster().skills[0]] } }, [oneWave([spawnAt(0, 'both')])], arm);
  const opened = deploy(w, c);
  assert.deepEqual(hitAmounts(opened.ev, e.id), [phys(2000)]);
  assert.deepEqual(placed(w), []);
  const summoned = hitsFor(w, c, e, 30);
  assert.deepEqual(summoned.map((h) => h.damage), []);
  assert.equal(placed(w).length, 1);
  const pair = field({ a: caster(), b: caster() }, [oneWave([spawnAt(0, 'a'), spawnAt(0, 'b')])], arm);
  deploy(pair.w, pair.c);
  assert.equal(placed(pair.w).length, 2, 'the second caster takes the next entry');
  assert.equal(pair.w.branchAt?.faust_ballis, 3, 'the missing key is consumed as well as the two that appear');
});

/** 召唤弩炮 with no wait, so each attack window spends one entry. */
function caster() {
  return {
    name: '浮士德', maxHp: 5000, atk: 1000, def: 0, res: 0, moveSpeed: 0, baseAttackTime: 1, rangeRadius: 20, applyWay: 'RANGED', motion: 'WALK',
    skills: [{ key: 'SummonBallis', cooldown: 0, initCooldown: 0, sp: 0, bb: { branch_id: 'faust_ballis' } }],
  };
}

/** Holds a summoned ballista on its route start. Move speed cannot fall below 0.1 (属性-3), so it would otherwise walk. @param {import('@aue/sim').FoeContext} ctx */
function pin(ctx) {
  ctx.addBuff(ctx.self, { key: 'stay', flags: { root: true } });
}

/** A branch: a missing key, a hidden group, two individuals on route 1, then one on route 0. @param {Content} c */
function arm(c) {
  const prev = c.behaviors ?? {};
  const foes = prev.foes ?? {};
  c.behaviors = { ...prev, foes: { ...foes, stay: { spawn: pin } } };
  c.level.routes.push({ start: { row: 0, col: 4 }, end: { row: 0, col: 5 }, motion: 'WALK', checkpoints: [] });
  c.enemies.ballista = { name: 'ballista', maxHp: 500, atk: 0, def: 0, res: 0, moveSpeed: 0, baseAttackTime: 5, talents: { stay: {} } };
  /** @param {string} key @param {number} route @param {number} count @param {string} [hidden] */
  const spawn = (key, route, count, hidden) => ({
    type: /** @type {'SPAWN'} */ ('SPAWN'), key, route, count, preDelay: 40, interval: 9, ...(hidden ? { hidden } : {}),
  });
  c.level.branches = { faust_ballis: [
    { preDelay: 99, actions: [spawn('ghost', 1, 1), spawn('ballista', 1, 2, 'pack'), spawn('ballista', 1, 2), { type: 'ACTIVATE', key: 'x', route: 0, count: 1, preDelay: 0, interval: 0 }] },
    { preDelay: 0, actions: [spawn('ballista', 0, 1)] },
  ] };
}

/** Ballistae as [x, y, route], in creation order. @param {World} w */
const placed = (w) => w.units.filter((u) => u.key === 'ballista').map((u) => [u.x, u.y, u.route]);
