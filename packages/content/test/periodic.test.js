// 每秒无来源真实伤害 (docs/spec/foes.md 敌能-50) on the tiny map. The six read enemies, and the unread `{ damage }`
// shape staying uncovered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, buffs, status, bus } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras, uncoveredAbilities, withoutIncomplete, FOE_EXTRAS } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

/** One second, in frames (时间-1). */
const SEC = 30;

/** The six pages that were read, and the `damage` each one states. */
const RANKS = Object.freeze(/** @type {const} */ ([
  ['enemy_1062_rager', 330], ['enemy_1062_rager_2', 500], ['enemy_1063_rageth', 250],
  ['enemy_1063_rageth_2', 350], ['enemy_1089_ltlntc', 400], ['enemy_1089_ltlntc_2', 400],
]));

/** @param {Record<string, EnemyDef>} enemies @param {any[]} spawns @param {(c: any) => void} [tweak] */
function open(enemies, spawns, tweak) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = enemies;
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave(spawns)];
  c.level.options = { ...c.level.options, characterLimit: 8, initialCost: 99, maxCost: 99, costIncreaseTime: 1000 };
  for (const op of Object.values(c.operators)) Object.assign(op, { cost: 0, maxHp: 1e7, atk: 0, def: 500 });
  tweak?.(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  return { c, w };
}

/** @param {World} w @param {any} c @param {number} n */
const run = (w, c, n) => { for (let i = 0; i < n; i++) step(w, c); };
/** @param {World} w @param {string} key @returns {Unit[]} */
const ofKey = (w, key) => w.units.filter((u) => u.key === key);
/** @param {Unit} u @param {number} x @param {number} y */
const pin = (u, x, y) => { u.x = x; u.y = y; status.applyStatus(u, 'root', {}); };
/** @param {any[]} events @param {number} id */
const hitsOf = (events, id) => events.filter((ev) => ev.type === 'hit' && ev.id === id);
/** @param {World} w @param {any} c @param {string} op @param {number} row @param {number} col */
const deploy = (w, c, op, row, col) => step(w, c, [[0, { type: 'deploy', op, row, col, dir: 0 }]]);
/** @param {World} w @param {string} key @returns {Unit} */
const opOf = (w, key) => /** @type {Unit} */ (w.units.find((u) => u.key === key));

/**
 * One of the six, with the page marker merged in. DEF and RES are high so a true hit is the only way the loss matches.
 * @param {string} key @param {number} damage @param {number} [maxHp]
 */
function host(key, damage, maxHp = 20000) {
  return withFoeExtras(key, {
    name: key, maxHp, atk: 0, def: 9999, res: 90, moveSpeed: 0, talents: { periodic_damage: { damage } },
  });
}

/** @param {string} key @param {number} damage */
const thrower = (key, damage) => withFoeExtras(key, {
  name: key, maxHp: 15000, atk: 100, def: 0, res: 0, moveSpeed: 0, applyWay: 'RANGED', rangeRadius: 2.6, baseAttackTime: 2,
  talents: { periodic_damage: { damage } },
});

/** Hit events of `id` within 12 frames. @param {World} w @param {any} c @param {number} id */
function untilHit(w, c, id) {
  /** @type {any[]} */
  const got = [];
  for (let i = 0; i < 12 && got.length === 0; i++) got.push(...hitsOf(step(w, c), id));
  return got;
}

/** @param {string} key @param {number} [damage] @returns {EnemyDef} */
const bare = (key, damage = 60) => ({ name: key, maxHp: 5000, atk: 0, def: 0, res: 0, moveSpeed: 0, talents: { periodic_damage: { damage } } });

test('[敌能-50] the first tick is one second after it appears, then every second, and DEF and RES do not reduce it', () => {
  for (const [key, damage] of RANKS) {
    const { c, w } = open({ [key]: host(key, damage) }, [spawnAt(0, key)]);
    const e = ofKey(w, key)[0];
    assert.equal(e.maxHp - e.hp, 0, `${key} takes nothing on the frame it appears`);
    run(w, c, SEC - 1);
    assert.equal(e.maxHp - e.hp, 0, `${key} takes nothing one frame early`);
    step(w, c);
    assert.equal(e.maxHp - e.hp, damage, key);
    run(w, c, SEC - 1);
    assert.equal(e.maxHp - e.hp, damage, `${key} waits the next second`);
    step(w, c);
    assert.equal(e.maxHp - e.hp, damage * 2, key);
  }
});

test('[敌能-50] the clock starts when the enemy appears, not when the battle does', () => {
  const key = 'enemy_1062_rager';
  const { c, w } = open({ [key]: host(key, 330) }, [spawnAt(1, key)]);
  assert.equal(ofKey(w, key).length, 0);
  run(w, c, SEC - 1);
  assert.equal(ofKey(w, key).length, 0, 'a one-second pre-delay has not put it on the field');
  step(w, c);
  const e = ofKey(w, key)[0];
  assert.equal(e.maxHp - e.hp, 0);
  assert.equal(e.ab['periodic_damage.t'], 1);
  run(w, c, SEC - 1);
  assert.equal(e.maxHp - e.hp, 0);
  step(w, c);
  assert.equal(e.maxHp - e.hp, 330);
});

test('[敌能-50] being carried pauses the clock without resetting it', () => {
  const key = 'enemy_1062_rager';
  const { c, w } = open({ [key]: host(key, 330) }, [spawnAt(0, key)]);
  const e = ofKey(w, key)[0];
  e.ab['@carrier'] = 1;
  run(w, c, SEC + 5);
  assert.equal(e.hp, e.maxHp);
  assert.equal(e.ab['periodic_damage.t'], 1, 'carried frames are not counted');
  delete e.ab['@carrier'];
  run(w, c, SEC - 1);
  assert.equal(e.hp, e.maxHp, 'it resumes from the count it had, so the next frame is still early');
  step(w, c);
  assert.equal(e.maxHp - e.hp, 330);
});

test('[敌能-50] hidden blocks that tick, and the clock keeps the same schedule', () => {
  const key = 'enemy_1062_rager';
  const { c, w } = open({ [key]: host(key, 330) }, [spawnAt(0, key)]);
  const e = ofKey(w, key)[0];
  e.hidden = true;
  run(w, c, SEC);
  assert.equal(e.hp, e.maxHp);
  assert.equal(e.ab['periodic_damage.t'], SEC + 1, 'hidden frames still count');
  e.hidden = false;
  step(w, c);
  assert.equal(e.hp, e.maxHp, 'the blocked second was spent');
  run(w, c, SEC - 2);
  step(w, c);
  assert.equal(e.maxHp - e.hp, 330);
});

test('[敌能-50] 脆弱 and trueTakenMul apply; 庇护 and flat reduction do not', () => {
  const key = 'enemy_1062_rager';
  const { c, w } = open({ [key]: host(key, 330) }, [spawnAt(0, key)]);
  const e = ofKey(w, key)[0];
  buffs.addBuff(e, buffs.makeBuff({
    key: 'fragile', mods: { dmgTakenMul: 2, trueTakenMul: 2, physTakenMul: 0.1, artsTakenMul: 0.1, dmgReduceFlat: 9999 },
  }));
  run(w, c, SEC - 1);
  step(w, c);
  assert.equal(e.maxHp - e.hp, 1320);
});

test('[敌能-50] a shield layer, a barrier and 伤害抵挡 absorb the tick', () => {
  const key = 'enemy_1062_rager';
  const shielded = open({ [key]: host(key, 330) }, [spawnAt(0, key)]);
  const s = ofKey(shielded.w, key)[0];
  buffs.addBuff(s, buffs.makeBuff({ key: 'shield', shieldHits: 1 }));
  run(shielded.w, shielded.c, SEC - 1);
  const ev = step(shielded.w, shielded.c);
  assert.equal(s.hp, s.maxHp);
  assert.equal(ev.some((x) => x.type === 'hit' && x.target === s.id), false);
  assert.equal(s.buffs.some((b) => b.key === 'shield'), false);
  const barred = open({ [key]: host(key, 330) }, [spawnAt(0, key)]);
  const bar = ofKey(barred.w, key)[0];
  buffs.addBuff(bar, buffs.makeBuff({ key: 'barrier', shield: 100 }));
  run(barred.w, barred.c, SEC - 1);
  step(barred.w, barred.c);
  assert.equal(bar.maxHp - bar.hp, 230);
  assert.equal(bar.buffs.some((b) => b.key === 'barrier'), false);
  const blocked = open({ [key]: host(key, 330) }, [spawnAt(0, key)]);
  const b = ofKey(blocked.w, key)[0];
  buffs.addBuff(b, buffs.makeBuff({ key: 'block', mods: { blockAll: 1 } }));
  run(blocked.w, blocked.c, SEC);
  assert.equal(b.hp, b.maxHp);
});

test('[敌能-50] 无敌 blocks the hit and does not pause the clock', () => {
  const key = 'enemy_1062_rager';
  const { c, w } = open({ [key]: host(key, 330) }, [spawnAt(0, key)]);
  const e = ofKey(w, key)[0];
  run(w, c, SEC - 1);
  status.applyStatus(e, 'invincible', { frames: 5 });
  step(w, c);
  assert.equal(e.hp, e.maxHp);
  buffs.removeBuff(e, 'invincible');
  step(w, c);
  assert.equal(e.hp, e.maxHp, 'the blocked second was spent');
  run(w, c, SEC - 2);
  step(w, c);
  assert.equal(e.maxHp - e.hp, 330);
});

test('[敌能-50] 重生\'s 无敌 blocks the tick, and the clock still advances', () => {
  const key = 'enemy_1062_rager';
  const { c, w } = open({ [key]: host(key, 330) }, [spawnAt(0, key)]);
  const e = ofKey(w, key)[0];
  buffs.addBuff(e, buffs.makeBuff({
    key: 'reborn', flags: { invincible: true, untargetable: true, unblockable: true, sidelined: true },
  }));
  run(w, c, SEC);
  assert.equal(e.hp, e.maxHp);
  assert.equal(e.ab['periodic_damage.t'], SEC + 1);
});

test('[敌能-50] silence does not stop the talent', () => {
  const key = 'enemy_1062_rager';
  const { c, w } = open({ [key]: host(key, 330) }, [spawnAt(0, key)]);
  const e = ofKey(w, key)[0];
  buffs.addBuff(e, buffs.makeBuff({ key: 'silence', flags: { silence: true } }));
  run(w, c, SEC);
  assert.equal(e.maxHp - e.hp, 330);
});

test('[敌能-50] a non-positive damage deals nothing, and the clock still runs', () => {
  const key = 'enemy_1062_rager';
  const { c, w } = open({ [key]: host(key, 0) }, [spawnAt(0, key)]);
  const e = ofKey(w, key)[0];
  run(w, c, SEC + 5);
  assert.equal(e.hp, e.maxHp);
  assert.ok(e.ab['periodic_damage.t'] > SEC);
});

test('[敌能-50] the tick can knock it down, credited to itself, and 不死 keeps 1 HP', () => {
  const key = 'enemy_1062_rager';
  const { c, w } = open({ [key]: host(key, 330, 100) }, [spawnAt(0, key)]);
  const e = ofKey(w, key)[0];
  /** @type {any[]} */
  const deaths = [];
  /** @type {any[]} */
  const kills = [];
  bus.on(w, 'death', (ctx) => { deaths.push(ctx); });
  bus.on(w, 'kill', (ctx) => { kills.push(ctx); });
  deploy(w, c, 'sniper', 2, 2);
  const sniper = opOf(w, 'sniper');
  run(w, c, SEC - 2);
  const ev = step(w, c);
  const hit = ev.find((x) => x.type === 'hit' && x.target === e.id);
  assert.equal(hit?.id, e.id, 'credited to itself (伤害-7), like 敌能-42');
  assert.equal(hit?.damage, 330);
  assert.equal(w.units.includes(e), false);
  assert.equal(deaths.length, 1);
  assert.equal(deaths[0].reason, 'killed');
  assert.equal(deaths[0].killer, e);
  assert.equal(deaths[0].unit, e);
  assert.equal(kills.length, 1);
  assert.equal(kills[0].killer, e);
  assert.equal(kills[0].victim, e);
  assert.equal(sniper.hp, sniper.maxHp);
  const kept = open({ [key]: host(key, 330, 100) }, [spawnAt(0, key)]);
  const u = ofKey(kept.w, key)[0];
  buffs.addBuff(u, buffs.makeBuff({ key: 'undying', flags: { undying: true } }));
  run(kept.w, kept.c, SEC);
  assert.equal(u.hp, 1);
  assert.equal(kept.w.units.includes(u), true);
});

test('[敌能-50] the two throwers do not attack a flying unit', () => {
  for (const [key, damage] of /** @type {const} */ ([['enemy_1063_rageth', 250], ['enemy_1063_rageth_2', 350]])) {
    const { c, w } = open({ [key]: thrower(key, damage) }, [spawnAt(0, key)], (cc) => {
      cc.operators.guard.motion = 'FLY';
      for (const op of Object.values(cc.operators)) op.def = 0;
    });
    const e = ofKey(w, key)[0];
    pin(e, 2, 1);
    e.atkCd = 0;
    const blocked = deploy(w, c, 'guard', 1, 2);
    const guard = opOf(w, 'guard');
    assert.equal(e.blockedBy, guard.id);
    assert.equal(hitsOf(blocked, e.id).length, 0);
    deploy(w, c, 'sniper', 2, 2);
    const sniper = opOf(w, 'sniper');
    const got = untilHit(w, c, e.id);
    assert.equal(got.length, 1, key);
    assert.equal(got[0].target, sniper.id);
    assert.equal(sniper.maxHp - sniper.hp, 100);
    assert.equal(guard.hp, guard.maxHp);
  }
});

test('[敌能-50] the six read enemies carry the page marker, so periodic_damage is covered', () => {
  for (const [key, damage] of RANKS) {
    const d = withFoeExtras(key, bare(key, damage));
    const pd = d.talents && d.talents.periodic_damage;
    assert.equal(pd && pd.self, 1, key);
    assert.equal(pd && pd.damage, damage);
    assert.equal(uncoveredAbilities([d]).includes('periodic_damage'), false, key);
  }
});

test('[敌能-50] noFly is added only for the two throwers; the witch\'s boom and occupy stay uncovered', () => {
  const thrown = withFoeExtras('enemy_1063_rageth', bare('enemy_1063_rageth', 250));
  const bones = withFoeExtras('enemy_1063_rageth_2', bare('enemy_1063_rageth_2', 350));
  assert.deepEqual(thrown.talents && thrown.talents.noFly, {});
  assert.deepEqual(bones.talents && bones.talents.noFly, {});
  const soldier = withFoeExtras('enemy_1062_rager', bare('enemy_1062_rager', 330));
  const shaman = withFoeExtras('enemy_1089_ltlntc', bare('enemy_1089_ltlntc', 400));
  assert.equal(soldier.talents && soldier.talents.noFly, undefined);
  assert.equal(shaman.talents && shaman.talents.noFly, undefined);
  const witch = withFoeExtras('enemy_1089_ltlntc', {
    ...bare('enemy_1089_ltlntc', 400), talents: { periodic_damage: { damage: 400 }, boom: { atk_scale: 2 }, occupy: { sp: -1 } },
  });
  const left = uncoveredAbilities([witch]);
  assert.equal(left.includes('periodic_damage'), false);
  assert.equal(left.includes('boom'), true);
  assert.equal(left.includes('occupy'), true);
});

test('[敌能-50] [足球-11] unread { damage } users stay uncovered and the tick does not run; a { damage: 0 } — the players\' — does nothing; 锤锤到肉 hurts itself', () => {
  const unread = /** @type {[string, number][]} */ ([
    ['enemy_1227_dair', 60], ['enemy_1227_dair_2', 90], ['enemy_19053_akrbt', 300],
    ['enemy_19054_akrbsp', 350], ['enemy_4005_musqrl', 5000], ['enemy_4005_musqrl_2', 5000],
    ['enemy_5036_dqger_2', 300],
  ]);
  for (const key of ['enemy_15032_dqhrgr', 'enemy_4014_mugnfu', 'enemy_4024_mushtg', 'enemy_4024_mushtg_2', 'enemy_4030_mukfug', 'enemy_4030_mukfug_2']) {
    assert.equal(uncoveredAbilities([bare(key, 0)]).includes('periodic_damage'), false, key);
  }
  for (const [key, damage] of unread) {
    assert.equal(FOE_EXTRAS[key], undefined, key);
    const raw = bare(key, damage);
    assert.equal(uncoveredAbilities([raw]).includes('periodic_damage'), true, key);
    const stripped = withoutIncomplete(raw).talents;
    assert.equal(stripped && stripped.periodic_damage, undefined, key);
  }
  // “锤锤到肉”: the page leaves the 330 unwritten; it is the talent every page writes out, on itself (足球-11)
  const hammer = withFoeExtras('enemy_4014_mugnfu_2', bare('enemy_4014_mugnfu_2', 330));
  assert.equal(uncoveredAbilities([hammer]).includes('periodic_damage'), false);
  const h = open({ enemy_4014_mugnfu_2: hammer }, [spawnAt(0, 'enemy_4014_mugnfu_2')]);
  run(h.w, h.c, 2 * SEC + 5);
  assert.equal(ofKey(h.w, 'enemy_4014_mugnfu_2')[0].hp, 5000 - 2 * 330, 'two seconds: 2 × 330 on itself');
  const quiet = open({ enemy_1227_dair: withoutIncomplete(bare('enemy_1227_dair', 60)) }, [spawnAt(0, 'enemy_1227_dair')]);
  run(quiet.w, quiet.c, SEC + 5);
  assert.equal(ofKey(quiet.w, 'enemy_1227_dair')[0].hp, 5000);
});
