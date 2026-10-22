// Enemy abilities' machinery (docs/spec/foes.md 敌能-1…敌能-4): hooks and their context, skill cooldowns, delayed
// explosions, 直击 bolts, and the attack mods enemy abilities use (channel, cross splash, attack bonus).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { KIND } from '@aue/schema';
import { createWorld, step, stateHash, takeSnapshot, restoreSnapshot } from '../src/index.js';
import { makeEnemy, makeOperator } from '../src/units.js';
import { foeSpawn, BOLT_RADIUS } from '../src/foes.js';
import { addBuff, makeBuff } from '../src/buffs.js';

/** @typedef {import('../src/types.js').World} World @typedef {import('../src/types.js').Unit} Unit */

/**
 * The tiny map without waves; enemy `foe` with the given talents/skills and behaviours; operators placed by `ops`.
 * @param {Record<string, unknown>} def @param {Record<string, any>} behaviors
 */
function arena(def, behaviors) {
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [];
  c.enemies.foe = { name: 'foe', maxHp: 1000, atk: 100, def: 0, res: 0, moveSpeed: 0, ...def };
  c.behaviors = { foes: behaviors };
  const w = createWorld(c, { seed: 1, players: 1 });
  return { c, w };
}
/** An enemy of the arena at (row, col). @param {World} w @param {any} c @param {number} row @param {number} col */
function foe(w, c, row, col) {
  const e = makeEnemy(w, c, { key: 'foe', route: 0 });
  e.x = col; e.y = row;
  w.units.push(e);
  foeSpawn(w, c, e);
  return e;
}
/** An operator at (row, col). @param {World} w @param {any} c @param {string} key @param {number} row @param {number} col */
function op(w, c, key, row, col) {
  const u = makeOperator(w, c, { key, owner: 0, row, col, dir: 0 });
  w.units.push(u);
  return u;
}
/** Runs n frames, returning the events with their frame. @param {World} w @param {any} c @param {number} n */
function run(w, c, n) {
  /** @type {any[]} */
  const out = [];
  for (let i = 0; i < n; i++) for (const e of step(w, c)) out.push({ ...e, f: w.frame - 1 });
  return out;
}

test('[敌能-2] hooks: spawn, tick seeing hurt and unblocked, death; state per ability; skills ready after initCooldown, again after use', () => {
  /** @type {any[]} */
  const seen = [];
  const { c, w } = arena({ talents: { mark: { n: 2 } }, skills: [{ key: 'zap', cooldown: 1, initCooldown: 0.5, bb: { k: 3 } }] }, {
    mark: {
      spawn: (/** @type {any} */ ctx) => { ctx.state.set('n', ctx.bb.n); seen.push(['spawn', ctx.state.get('n')]); },
      tick: (/** @type {any} */ ctx) => { if (ctx.hurt) seen.push(['hurt', ctx.frame]); if (ctx.unblocked) seen.push(['unblocked', ctx.frame]); },
      death: (/** @type {any} */ ctx) => { seen.push(['death', ctx.frame]); },
    },
    zap: { tick: (/** @type {any} */ ctx) => { if (ctx.ready) { seen.push(['zap', ctx.frame, ctx.bb.k]); ctx.use(); } } },
  });
  const e = foe(w, c, 1, 3);
  run(w, c, 20);
  e.hp -= 1;
  run(w, c, 1);
  e.blockedBy = 99; e.ab['@blocked'] = 1;
  e.blockedBy = -1;
  run(w, c, 30);
  e.hp = 0;
  run(w, c, 1);
  assert.deepEqual(seen, [['spawn', 2], ['zap', 15, 3], ['hurt', 20], ['unblocked', 21], ['zap', 45, 3], ['death', 51]], 'ready 0.5 s after spawning, then 1 s after use');
});

test('[敌能-2] targets and attack hooks change whom an enemy attacks and how', () => {
  const { c, w } = arena({ applyWay: 'MELEE' }, {
    far: {
      targets: (/** @type {any} */ ctx, /** @type {Unit[]} */ cands) => [...cands, ...ctx.foes(3)],
      attack: (/** @type {any} */ _ctx, /** @type {any} */ mods) => ({ ...mods, scale: 2, type: 'arts' }),
    },
  });
  c.enemies.foe.talents = { far: {} };
  const e = foe(w, c, 1, 4), g = op(w, c, 'guard', 1, 2);
  const hp = g.hp, ev = run(w, c, 3);
  assert.deepEqual(ev.filter((x) => x.type === 'attack').map((x) => x.target), [g.id], 'not blocking it, yet attacked');
  assert.equal(hp - g.hp, 200, 'arts 200 against res 0 (def 100 would cut physical)');
  assert.equal(e.hp, 1000);
});

test('[敌能-3] a delayed explosion: after its delay, the operators and neutral units within its radius, flying ones only if it reaches the air', () => {
  const { c, w } = arena({}, {
    blow: { death: (/** @type {any} */ ctx) => ctx.blast({ x: 2, y: 1, radius: 1.5, delay: 1, air: false, sourced: false, type: 'phys', amount: 300, status: { key: 'cold', seconds: 10 } }) },
  });
  c.enemies.foe.talents = { blow: {} };
  c.enemies.civ = { name: 'civ', maxHp: 1000, atk: 0, def: 0, res: 0, moveSpeed: 0, neutral: true };
  const e = foe(w, c, 2, 5), near = op(w, c, 'guard', 1, 1), far = op(w, c, 'sniper', 0, 4);
  const civ = makeEnemy(w, c, { key: 'civ', route: 0 });
  civ.x = 2; civ.y = 2; w.units.push(civ);
  addBuff(near, makeBuff({ key: 'camo', flags: { camou: true } }));
  e.hp = 0;
  run(w, c, 30);
  assert.deepEqual([near.hp, civ.hp], [1000, 1000], 'not yet');
  const ev = run(w, c, 1);
  assert.deepEqual(ev.filter((x) => x.type === 'blast').map((x) => [x.f, x.x, x.y]), [[30, 2, 1]]);
  assert.deepEqual([near.hp, civ.hp, far.hp], [1000 - 200, 700, 500], 'camouflage does not help; out of reach untouched');
  assert.ok(near.buffs.some((b) => b.key === 'cold'), 'source-less: the plain cold');
  assert.equal(w.blasts.length, 0);
});

test('[敌能-4] a 直击 bolt flies along its line and hits the first unit within 0.3 — or sets off an explosion there; off the map it is gone', () => {
  /** @type {any} */
  let shoot = null;
  const { c, w } = arena({}, { gun: { tick: (/** @type {any} */ ctx) => { if (shoot) { ctx.bolt(shoot); shoot = null; } } } });
  c.enemies.foe.talents = { gun: {} };
  foe(w, c, 1, 5);
  const a = op(w, c, 'guard', 1, 3), b = op(w, c, 'guard', 1, 1);
  shoot = { dx: -1, dy: 0, type: 'phys', amount: 400 };
  const ev = run(w, c, 10);
  assert.deepEqual(ev.filter((x) => x.type === 'bolt').length, 1);
  assert.deepEqual([a.hp, b.hp], [700, 1000], 'only the first');
  shoot = { dx: -1, dy: 0, type: 'phys', amount: 400, blast: 3 };
  run(w, c, 10);
  assert.deepEqual([a.hp, b.hp], [400, 700], 'the explosion reaches both');
  shoot = { dx: 0, dy: 1, type: 'phys', amount: 400 };
  run(w, c, 30);
  assert.equal(w.bolts.length, 0, 'off the map');
  assert.equal(BOLT_RADIUS, 0.3);
});

test('[敌能-6] [敌能-7] [敌能-11] attack mods: a channel of hits then a cooldown; a cross splash; an attack bonus for one attack', () => {
  const { c, w } = arena({ applyWay: 'MELEE' }, {
    mods: { attack: (/** @type {any} */ _ctx, /** @type {any} */ m) => ({ ...m, type: 'true', channel: { hits: 3, duration: 3, after: 2 } }) },
  });
  c.enemies.foe.talents = { mods: {} };
  const e = foe(w, c, 1, 2), g = op(w, c, 'guard', 1, 2);
  e.blockedBy = g.id; e.blockedAt = 0;
  const hp0 = g.hp, ev = run(w, c, 300);
  assert.deepEqual(ev.filter((x) => x.type === 'attack' && x.id === e.id).map((x) => x.f), [0, 150], 'one channel every 3 s + 2 s');
  assert.equal(hp0 - g.hp, 600, 'three true-damage hits of 100 in each channel');
  const cross = arena({ applyWay: 'MELEE' }, { x: { attack: (/** @type {any} */ _ctx, /** @type {any} */ m) => ({ ...m, cross: true, atkPct: 1, type: 'true' }) } });
  cross.c.enemies.foe.talents = { x: {} };
  const f2 = foe(cross.w, cross.c, 1, 2), g2 = op(cross.w, cross.c, 'guard', 1, 2), side = op(cross.w, cross.c, 'sniper', 0, 2), off = op(cross.w, cross.c, 'sniper', 0, 3);
  f2.blockedBy = g2.id; f2.blockedAt = 0;
  run(cross.w, cross.c, 1);
  assert.deepEqual([1000 - g2.hp, 500 - side.hp, off.hp], [200, 200, 500], 'true damage 100 × (1 + 100%) on the target and the next tile; not diagonal');
});

test('[敌能-2] [同步-2] abilities, bolts and explosions are state: a snapshot runs on the same', () => {
  const { c, w } = arena({}, {
    gun: { tick: (/** @type {any} */ ctx) => { if (ctx.ready) { ctx.use(); ctx.bolt({ dx: -1, dy: 0, type: 'phys', amount: 50, blast: 1 }); } } },
  });
  c.enemies.foe.skills = [{ key: 'gun', cooldown: 0.4, initCooldown: 0, bb: {} }];
  foe(w, c, 1, 5);
  op(w, c, 'guard', 1, 1);
  run(w, c, 7);
  const copy = restoreSnapshot(JSON.parse(JSON.stringify(takeSnapshot(w))));
  run(w, c, 60);
  run(copy, c, 60);
  assert.equal(stateHash(copy), stateHash(w));
  assert.ok(w.units.find((u) => u.kind === KIND.OPERATOR)?.hp ?? 0 < 1000);
});

test('[敌能-2] the context\'s common members act on the battle; gainCost does nothing for an enemy', () => {
  const { c, w } = arena({ talents: { all: { v: 1 }, other: { q: 7 } } }, {
    all: {
      tick: (/** @type {any} */ ctx) => {
        if (ctx.frame !== 1) return;
        const [g] = ctx.foes(5);
        ctx.dealDamage(g, { type: 'true', amount: 300 });
        ctx.heal(g, 100);
        ctx.dealEp(g, 'FIRE', 50);
        ctx.addBuff(g, { key: 'mark', mods: { atkPct: 1 } });
        ctx.removeBuff(g, 'mark');
        ctx.applyStatus(g, 'stun', { seconds: 1 });
        ctx.gainCost(5);
        ctx.state.set('seen', ctx.talent('other')?.q ?? 0);
        ctx.state.set('none', ctx.talent('nope') === null ? 1 : 0);
      },
    },
    other: {},
  });
  const e = foe(w, c, 1, 4), g = op(w, c, 'guard', 1, 2);
  const cost = w.players[0].cost;
  run(w, c, 2);
  assert.deepEqual([1000 - g.hp, g.buffs.some((b) => b.key === 'mark'), g.buffs.some((b) => b.key === 'stun'), g.ep.FIRE ?? 0], [200, false, true, 950]);
  assert.deepEqual([e.ab['all.seen'], e.ab['all.none']], [7, 1]);
  assert.ok(w.players[0].cost >= cost && w.players[0].cost <= cost + 1, 'only the usual regeneration');
});

test('[敌能-2] [敌能-16] more of the context: allies, order, talents and buffs of others, the blocker, tags and tiles, cost, passengers, hits', () => {
  /** @type {any} */
  const seen = {};
  const { c, w } = arena({ talents: { probe: { x: 1 } }, tags: ['machine'], rangeRadius: 2, applyWay: 'RANGED' }, {
    probe: {
      tick: (/** @type {any} */ ctx) => {
        if (seen.done) return;
        const other = ctx.allies(9).find((/** @type {Unit} */ u) => u !== ctx.self);
        seen.allies = ctx.allies(9).length;
        seen.order = ctx.order(ctx.foes(9)).map((/** @type {Unit} */ u) => u.key);
        seen.talent = [ctx.talentOf(other, 'probe'), ctx.talentOf(ctx.foes(9)[0], 'probe')];
        ctx.setBuff(other, 'v', 2, { atkFlat: 1 });
        ctx.setBuff(other, 'v', 3, { atkFlat: 2 });
        seen.value = [ctx.buffValue(other, 'v'), ctx.buffValue(other, 'nope')];
        seen.tags = [ctx.tagsOf(other), ctx.tagsOf(ctx.foes(9)[0])];
        seen.tile = ctx.tileKey();
        seen.blocker = ctx.blocker();
        ctx.drainCost(ctx.foes(9)[0], 100);
        ctx.drainCost(other, 1);
        ctx.board(other);
        ctx.board(ctx.self);
        seen.passengers = ctx.passengers();
        seen.done = 1;
      },
      hit: (/** @type {any} */ _ctx, /** @type {Unit} */ t, /** @type {number} */ dealt, /** @type {boolean} */ ranged) => { seen.hit = [t.key, dealt > 0, ranged]; },
    },
  });
  const a = foe(w, c, 1, 4), b = foe(w, c, 0, 4);
  op(w, c, 'sniper', 2, 3);
  run(w, c, 1);
  assert.deepEqual([seen.allies, seen.order, seen.talent, seen.value, seen.tags, seen.tile, seen.blocker, w.players[0].cost],
    [2, ['sniper'], [{ x: 1 }, null], [3, null], [['machine'], []], 'tile_road', null, 0]);
  assert.deepEqual([b.hidden, seen.passengers, b.buffs.find((x) => x.key === 'v')?.mods], [true, 1, { atkFlat: 2 }]);
  run(w, c, 60);
  assert.deepEqual(seen.hit, ['sniper', true, true], 'its projectile hit');
  a.hp = 0;
  run(w, c, 1);
  assert.equal(b.hidden, false, 'its carrier left: it alights');
});

test('[敌能-3] a blast without all still skips an enemy in the radius', () => {
  const { c, w } = arena({}, {
    blow: { death: (/** @type {any} */ ctx) => ctx.blast({ x: ctx.self.x, y: ctx.self.y, radius: 2, delay: 0, air: true, sourced: false, type: 'true', amount: 10 }) },
  });
  c.enemies.foe.talents = { blow: {} };
  c.enemies.other = { name: 'o', maxHp: 100, atk: 0, def: 80, res: 50, moveSpeed: 0 };
  c.operators.guard = { ...c.operators.guard, atk: 0 };
  const e = foe(w, c, 1, 2);
  const other = makeEnemy(w, c, { key: 'other', route: 0 });
  other.x = 2; other.y = 1; w.units.push(other);
  const g = op(w, c, 'guard', 1, 2);
  e.hp = 0;
  run(w, c, 2);
  assert.equal(other.hp, 100);
  assert.equal(g.hp, 990);
});

test('[敌能-86] a blast with all hits every unit in the radius, enemies included, for the full true amount', () => {
  const { c, w } = arena({}, {
    blow: {
      tick: (/** @type {any} */ ctx) => {
        if (ctx.state.get('d')) return;
        ctx.state.set('d', 1);
        ctx.blast({ x: 2, y: 1, radius: 1, delay: 0, air: true, sourced: true, all: true, type: 'true', amount: 10 });
      },
    },
  });
  c.enemies.foe.talents = { blow: {} };
  c.enemies.other = { name: 'o', maxHp: 100, atk: 0, def: 80, res: 50, moveSpeed: 0 };
  const e = foe(w, c, 1, 2);
  const near = makeEnemy(w, c, { key: 'other', route: 0 });
  near.x = 2; near.y = 1; w.units.push(near);
  const far = makeEnemy(w, c, { key: 'other', route: 0 });
  far.x = 4; far.y = 1; w.units.push(far);
  run(w, c, 1);
  assert.equal(near.hp, 90);
  assert.equal(far.hp, 100);
  assert.equal(e.hp, 990);
});
