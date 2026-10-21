// 岁兽残响, part two (docs/spec/foes.md 敌能-44): 断刃 spends on a damaging hit and the last one clears the attack
// cooldown; death leaves the blades that remain, at least one. 范围隐匿 lends 隐匿 within the radius while it is up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, damage, buffs, attrs, status, targeting, KIND } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent, withFoeExtras } from '../src/index.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */
/** @typedef {{ f: number, kind: string, damage?: number }} Mark */
/** @typedef {{ key: string, x: number, y: number, hidden?: boolean, cant?: boolean }} Extra */
/** @typedef {{ child?: string, seed?: number, row?: number, col?: number, hole?: boolean, also?: Extra[] }} PlaceOpts */
/** @typedef {{ c: any, w: World, e: Unit, by: Record<string, Unit> }} Box */

/**
 * One rooted enemy, plus any `also`, on the tiny map. The guard is sturdy and has no defence, so a blade's damage is its ATK.
 * @param {string} key @param {Record<string, unknown>} def @param {PlaceOpts} [o]
 * @returns {Box}
 */
function place(key, def, o = {}) {
  const c = /** @type {any} */ (tinyContent());
  const row = o.row ?? 1, col = o.col ?? 2, also = o.also ?? [];
  c.level.waves = [oneWave([spawnAt(0, key), ...also.map((a) => spawnAt(0, a.key))])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 9 };
  c.behaviors = skeletonContent.behaviors;
  c.operators.guard.def = 0;
  c.operators.guard.maxHp = 20000;
  c.enemies[key] = bare(key, def);
  if (o.child) c.enemies[o.child] = bare(o.child, { maxHp: 30 });
  for (const a of also) c.enemies[a.key] = bare(a.key, { maxHp: 500 });
  if (o.hole) c.level.tiles[row][col] = { ...c.level.tiles[row][col], key: 'tile_hole' };
  const w = createWorld(c, { seed: o.seed ?? 1, players: 1 });
  step(w, c);
  const e = w.units.find((u) => u.key === key);
  if (!e) throw new Error(`no enemy ${key}`);
  pin(e, col, row);
  return { c, w, e, by: lay(w, also) };
}

/** @param {string} key @param {Record<string, unknown>} more @returns {EnemyDef} */
function bare(key, more) {
  return withFoeExtras(key, /** @type {EnemyDef} */ ({ name: key, maxHp: 500, atk: 0, def: 0, res: 0, moveSpeed: 0, ...more }));
}

/** @param {Unit} u @param {number} x @param {number} y */
function pin(u, x, y) {
  Object.assign(u, { x, y, path: [], pt: 0 });
  status.applyStatus(u, 'root', {});
}

/** @param {World} w @param {Extra[]} also @returns {Record<string, Unit>} */
function lay(w, also) {
  /** @type {Record<string, Unit>} */
  const by = {};
  for (const a of also) {
    const u = w.units.find((x) => x.key === a.key);
    if (!u) throw new Error(`no enemy ${a.key}`);
    pin(u, a.x, a.y);
    if (a.hidden) u.hidden = true;
    if (a.cant) buffs.addBuff(u, buffs.makeBuff({ key: 'cant', flags: { untargetable: true } }));
    by[a.key] = u;
  }
  return by;
}

/** @param {string} child @param {string} spell @param {number} atk */
function bladeParent(child, spell, atk) {
  return {
    maxHp: 20000, atk: 100, def: 0, res: 0, moveSpeed: 0, baseAttackTime: 2.2, blockCnt: 1,
    talents: { DeadSpawn: { enemy_key: child, cnt: 4, cnt_add: -1 }, [spell]: { atk } },
  };
}

/** @param {string} child @param {number} duration */
function veilParent(child, duration) {
  return {
    maxHp: 20000, atk: 10, def: 0, res: 0, moveSpeed: 0, baseAttackTime: 3, blockCnt: 1,
    talents: { DeadSpawn: { enemy_key: child, cnt: 1 }, InvisibleShield: { duration: 3 } },
    skills: [{ key: 'InvisibleShield', initCooldown: 5, cooldown: 15, bb: { duration } }],
  };
}

/** @param {Unit} u */
const bladeValue = (u) => u.buffs.find((b) => b.key === 'blades')?.value ?? null;
/** @param {Unit} u */
const veiled = (u) => u.buffs.some((b) => b.key === 'rangeHide');

/** @param {any} ev @param {number} id @param {number} f @param {Mark[]} out */
function note(ev, id, f, out) {
  if (ev.id === id && (ev.type === 'attack' || ev.type === 'hit')) out.push({ f, kind: ev.type, damage: ev.damage });
}

/** Deploys the guard on the enemy and collects its attack and hit marks until `n` attacks. @param {Box} box @param {number} n @returns {Mark[]} */
function swings(box, n) {
  const id = box.e.id;
  /** @type {Mark[]} */
  const out = [];
  const take = (/** @type {any[]} */ evs, /** @type {number} */ f) => { for (const ev of evs) note(ev, id, f, out); };
  const row = box.e.y, col = box.e.x;
  take(step(box.w, box.c, [[0, { type: 'deploy', op: 'guard', row, col, dir: 0 }]]), box.w.frame - 1);
  for (let i = 0; out.filter((x) => x.kind === 'attack').length < n && i < 400; i++) take(step(box.w, box.c), box.w.frame - 1);
  return out;
}

/** @param {Mark[]} log @param {string} kind */
const marks = (log, kind) => log.filter((x) => x.kind === kind);

/** @param {Mark[]} hit @param {number} from @param {number} to @param {number} dmg */
function sameDamage(hit, from, to, dmg) {
  for (let i = from; i < to; i++) assert.equal(hit[i].damage, dmg, `hit ${i}`);
}

/**
 * The four held hits, then the extra one at base ATK with no interval, then a full interval. With a wind-up the next
 * attack starts in the frame the fourth lands; one that lands at once is followed on the next frame.
 * @param {string} key @param {string} spell @param {number} pct @param {string} child @param {{ clip: string, duration: number, hit: number }} [attack]
 */
function expectBurst(key, spell, pct, child, attack) {
  const box = place(key, attack ? { ...bladeParent(child, spell, pct), attack } : bladeParent(child, spell, pct), { child });
  const high = attrs.statsOf(box.e).atk, base = box.e.base.atk;
  assert.equal(bladeValue(box.e), 4);
  assert.ok(high > base);
  const log = swings(box, 6);
  const atk = marks(log, 'attack'), hit = marks(log, 'hit');
  assert.equal(bladeValue(box.e), 0);
  assert.equal(attrs.statsOf(box.e).atk, base);
  const full = atk[1].f - atk[0].f;
  assert.ok(full > 1);
  assert.equal(atk[2].f - atk[1].f, full);
  assert.equal(atk[3].f - atk[2].f, full);
  assert.equal(atk[4].f - hit[3].f, attack ? 0 : 1);
  assert.equal(atk[5].f - atk[4].f, full);
  sameDamage(hit, 0, 4, high);
  assert.equal(hit[4].damage, base);
}

/** An attack that deals nothing spends no blade. @param {string} key @param {string} spell @param {number} pct */
function whiff(key, spell, pct) {
  const box = place(key, bladeParent('enemy_1208_msfji', spell, pct));
  box.e.atkCd = 2;
  const id = box.e.id;
  /** @type {Mark[]} */
  const out = [];
  const opened = step(box.w, box.c, [[0, { type: 'deploy', op: 'guard', row: box.e.y, col: box.e.x, dir: 0 }]]);
  const g = box.w.units.find((u) => u.kind === KIND.OPERATOR);
  if (!g) throw new Error('no guard');
  status.applyStatus(g, 'invincible', {});
  for (let i = 0; i < 8; i++) for (const ev of step(box.w, box.c)) note(ev, id, box.w.frame - 1, out);
  const early = opened.filter((ev) => ev.type === 'attack' && ev.id === id).length;
  return { blades: bladeValue(box.e), attacks: marks(out, 'attack').length, hits: marks(out, 'hit').length, early };
}

/**
 * Knocks the parent down. `blades` replaces the count it still holds.
 * @param {Box} box @param {string} child @param {number} [blades]
 */
function down(box, child, blades) {
  const b = box.e.buffs.find((x) => x.key === 'blades');
  if (blades !== undefined) {
    if (!b) throw new Error('no blades');
    b.value = blades;
  }
  const at = { x: box.e.x, y: box.e.y, route: box.e.route, leg: box.e.leg };
  box.e.hp = 0;
  step(box.w, box.c);
  const broods = (box.w.broods ?? []).filter((x) => x.key === child);
  const born = box.w.units.filter((u) => u.key === child);
  const held = broods.length > 0 ? broods : born;
  const left = broods.length > 0 ? broods[0].left : 0;
  return { n: held.length, held, at, left, same: broods.every((x) => x.left === left) };
}

/** @param {{ held: { x: number, y: number, route: number, leg: number }[], at: { x: number, y: number, route: number, leg: number } }} got */
function inSquare(got) {
  for (const p of got.held) {
    assert.ok(Math.abs(p.x - got.at.x) <= 0.5 && Math.abs(p.y - got.at.y) <= 0.5, `(${p.x}, ${p.y})`);
    assert.equal(p.route, got.at.route);
    assert.equal(p.leg, got.at.leg);
  }
}

/** @param {string} key @param {Record<string, unknown>} def @param {string} child */
function drop(key, def, child) {
  const box = place(key, def, { child, row: 0, col: 4, hole: true });
  step(box.w, box.c);
  const n = (box.w.broods ?? []).filter((b) => b.key === child).length + box.w.units.filter((u) => u.key === child).length;
  return { gone: !box.w.units.includes(box.e), n };
}

/** @param {string} key @param {number} duration @param {Extra[]} [also] @returns {Box} */
function veil(key, duration, also) {
  const near = also ?? [{ key: 'near', x: 4, y: 1 }];
  return place(key, veilParent('lamp', duration), { child: 'lamp', also: near });
}

/** @param {World} w @param {any} c @param {number} n @param {() => boolean} pred */
function until(w, c, n, pred) {
  for (let i = 0; i < n; i++) {
    step(w, c);
    if (pred()) return w.frame - 1;
  }
  return -1;
}

/** Frames of the first stealth window, stopping at the frame it drops. @param {Box} box @param {number} cap */
function openFrames(box, cap) {
  const ally = box.by.near;
  /** @type {number[]} */
  const frames = [];
  for (let i = 0; i < cap; i++) {
    step(box.w, box.c);
    if (veiled(ally)) frames.push(box.w.frame - 1);
    else if (frames.length) break;
  }
  return frames;
}

/** Steps up to the cast frame and reports whether anyone is already hidden. @param {Box} box */
function asleep(box) {
  while (box.w.frame < 150) step(box.w, box.c);
  return veiled(box.by.near);
}

/** @param {Box} box @param {Unit} u */
function deployOn(box, u) {
  step(box.w, box.c, [[0, { type: 'deploy', op: 'guard', row: u.y, col: u.x, dir: 0 }]]);
  const g = box.w.units.find((x) => x.kind === KIND.OPERATOR);
  if (!g) throw new Error('no guard');
  return g;
}

/** Four attack gaps, so a cast in between has to leave the interval alone. @param {Box} box */
function pace(box) {
  const id = box.e.id;
  /** @type {number[]} */
  const frames = [];
  const take = (/** @type {any[]} */ evs, /** @type {number} */ f) => {
    for (const ev of evs) if (ev.type === 'attack' && ev.id === id) frames.push(f);
  };
  take(step(box.w, box.c, [[0, { type: 'deploy', op: 'guard', row: box.e.y, col: box.e.x, dir: 0 }]]), box.w.frame - 1);
  for (let i = 0; frames.length < 4 && i < 400; i++) take(step(box.w, box.c), box.w.frame - 1);
  return [frames[1] - frames[0], frames[2] - frames[1], frames[3] - frames[2]];
}

/** The window fails to end while the caster has vanished — nothing is lent meanwhile — then stays up. @param {Box} box */
function stays(box) {
  const first = until(box.w, box.c, 200, () => veiled(box.by.near));
  while (box.w.frame < first + 90) step(box.w, box.c);
  box.e.hidden = true;
  for (let i = 0; i < 3; i++) step(box.w, box.c);
  const during = veiled(box.by.near);
  box.e.hidden = false;
  step(box.w, box.c);
  let held = veiled(box.by.near);
  for (let i = 0; i < 200; i++) {
    step(box.w, box.c);
    if (!veiled(box.by.near)) held = false;
  }
  return { first, during, held };
}

const FIELD = [
  { key: 'near', x: 4, y: 1 },
  { key: 'far', x: 4.1, y: 1 },
  { key: 'gone', x: 3, y: 1, hidden: true },
  { key: 'cant', x: 1, y: 1, cant: true },
];

/** @type {[string, number][]} */
const BODIES = [
  ['enemy_1208_msfji', 25],
  ['enemy_1208_msfji_2', 30],
  ['enemy_1210_msfden', 35],
  ['enemy_1210_msfden_2', 45],
];

test('[敌能-44] [攻击-2] four blades raise ATK, and the hit that spends the last lets the next attack start without the interval, at the base ATK', () => {
  expectBurst('enemy_1207_sfji', 'Atkup', 0.7, 'enemy_1208_msfji');
  expectBurst('enemy_1207_sfji_2', 'AtkUp', 0.8, 'enemy_1208_msfji_2');
  expectBurst('enemy_1207_sfji', 'Atkup', 0.7, 'enemy_1208_msfji', { clip: 'Attack', duration: 1, hit: 0.5 });
});

test('[敌能-44] a hit that deals nothing spends no blade', () => {
  /** @type {[string, string, number][]} */
  const rows = [['enemy_1207_sfji', 'Atkup', 0.7], ['enemy_1207_sfji_2', 'AtkUp', 0.8]];
  for (const [key, spell, pct] of rows) {
    const got = whiff(key, spell, pct);
    assert.equal(got.early, 0, key);
    assert.ok(got.attacks > 0, key);
    assert.equal(got.hits, 0, key);
    assert.equal(got.blades, 4, key);
  }
});

test('[敌能-44] [敌能-39] death leaves the blades still held, at least one, inside the square on its own route', () => {
  const full = down(place('enemy_1207_sfji', bladeParent('enemy_1208_msfji', 'Atkup', 0.7), { child: 'enemy_1208_msfji' }), 'enemy_1208_msfji');
  assert.equal(full.n, 4);
  assert.equal(full.same, true);
  inSquare(full);
  const none = down(place('enemy_1207_sfji', bladeParent('enemy_1208_msfji', 'Atkup', 0.7), { child: 'enemy_1208_msfji' }), 'enemy_1208_msfji', 0);
  assert.equal(none.n, 1);
  const two = down(place('enemy_1207_sfji_2', bladeParent('enemy_1208_msfji_2', 'AtkUp', 0.8), { child: 'enemy_1208_msfji_2' }), 'enemy_1208_msfji_2', 2);
  assert.equal(two.n, 2);
  const lamp = down(place('enemy_1209_sfden', veilParent('enemy_1210_msfden', 5), { child: 'enemy_1210_msfden' }), 'enemy_1210_msfden');
  assert.equal(lamp.n, 1);
});

test('[敌能-44] [地图-4] 沉沙 still leaves its spears when it falls; 新硎, 清明 and 堂皇 do not', () => {
  const sand = drop('enemy_1207_sfji', bladeParent('enemy_1208_msfji', 'Atkup', 0.7), 'enemy_1208_msfji');
  assert.equal(sand.gone, true);
  assert.equal(sand.n, 4);
  const hone = drop('enemy_1207_sfji_2', bladeParent('enemy_1208_msfji_2', 'AtkUp', 0.8), 'enemy_1208_msfji_2');
  assert.equal(hone.gone, true);
  assert.equal(hone.n, 0);
  const qing = drop('enemy_1209_sfden', veilParent('enemy_1210_msfden', 5), 'enemy_1210_msfden');
  assert.equal(qing.gone, true);
  assert.equal(qing.n, 0);
  const tang = drop('enemy_1209_sfden_2', veilParent('enemy_1210_msfden_2', 3), 'enemy_1210_msfden_2');
  assert.equal(tang.gone, true);
  assert.equal(tang.n, 0);
});

test('[敌能-44] 范围隐匿 stays off until the skill casts, lasts the talent\'s 3 s for both, and cools down from its end', () => {
  for (const [key, skillDuration] of /** @type {[string, number][]} */ ([['enemy_1209_sfden', 5], ['enemy_1209_sfden_2', 3]])) {
    const box = veil(key, skillDuration);
    assert.equal(asleep(box), false, key);
    const on = openFrames(box, 400);
    assert.equal(on[0], 150, key);
    assert.equal(on.length, 90 + 1, `${key}: 3 s, then the lent buff's last frame`);
    assert.equal(until(box.w, box.c, 800, () => veiled(box.by.near)), 150 + 90 + 450, key);
  }
});

test('[敌能-44] [索敌-2] the field hides other enemies inside radius 2, including one that cannot be selected, and 反隐 still cancels it', () => {
  const box = veil('enemy_1209_sfden', 5, FIELD);
  const { near, far, gone, cant } = box.by;
  assert.ok(until(box.w, box.c, 200, () => veiled(near)) >= 0);
  assert.equal(veiled(far), false);
  assert.equal(veiled(gone), false);
  assert.equal(veiled(cant), true);
  assert.equal(veiled(box.e), false);
  assert.equal(targeting.selectable(near), false);
  assert.equal(targeting.selectable(cant), false);
  buffs.addBuff(near, buffs.makeBuff({ key: 'seen', flags: { unstealth: true } }));
  assert.equal(targeting.selectable(near), true);
  assert.equal(attrs.statsOf(near).flags.stealth, true);
  near.x = 5;
  assert.equal(until(box.w, box.c, 3, () => !veiled(near)) - box.w.frame, -1, 'gone within the two lent frames');
  near.x = 4;
  step(box.w, box.c);
  assert.equal(veiled(near), true);
});

test('[敌能-44] [索敌-2] a blocked enemy keeps the field without effect and has it back the moment the block ends', () => {
  const box = veil('enemy_1209_sfden', 5);
  const near = box.by.near;
  assert.ok(until(box.w, box.c, 200, () => veiled(near)) >= 0);
  assert.equal(targeting.stealthed(near), true);
  const guard = deployOn(box, near);
  assert.equal(near.blockedBy, guard.id);
  step(box.w, box.c);
  assert.equal(veiled(near), true);
  assert.equal(targeting.stealthed(near), false);
  step(box.w, box.c, [[0, { type: 'retreat', unit: guard.id }]]);
  assert.equal(near.blockedBy, -1);
  assert.equal(targeting.stealthed(near), true, 'restore 0: no 3 s window');
});

test('[敌能-44] silence does not stop the cast; stun does, until it can act; the cast does not take the attack interval', () => {
  const quiet = veil('enemy_1209_sfden', 5);
  status.applyStatus(quiet.e, 'silence', {});
  assert.equal(asleep(quiet), false);
  assert.equal(openFrames(quiet, 400)[0], 150);
  const held = veil('enemy_1209_sfden', 5);
  status.applyStatus(held.e, 'stun', { seconds: 30 });
  assert.equal(until(held.w, held.c, 220, () => veiled(held.by.near)), -1);
  buffs.removeBuff(held.e, 'stun');
  assert.ok(until(held.w, held.c, 5, () => veiled(held.by.near)) >= 0);
  const g = pace(veil('enemy_1209_sfden', 5));
  assert.ok(g[0] > 1);
  assert.equal(g[0], g[1]);
  assert.equal(g[1], g[2]);
});

test('[敌能-44] the field that fails to end while the caster has vanished stays up after it reappears', () => {
  const got = stays(veil('enemy_1209_sfden', 5));
  assert.equal(got.first, 150);
  assert.equal(got.during, false);
  assert.equal(got.held, true);
});

test('[敌能-44] [敌能-39] spears and lamps fall by one HP per hit and do not attack or get blocked', () => {
  for (const [key, hp] of BODIES) {
    const box = place(key, { maxHp: hp, atk: 40, baseAttackTime: 1, talents: { hitCount: {} } });
    const f = attrs.statsOf(box.e).flags;
    box.c.operators.guard.atk = 0;
    const guard = deployOn(box, box.e);
    damage.dealDamage(box.w, null, box.e, { type: 'phys', amount: 500 });
    assert.equal(box.e.hp, hp - 1, key);
    assert.equal(f.hitCount, true, key);
    assert.equal(f.noAttack, true, key);
    assert.equal(f.unblockable, true, key);
    assert.equal(box.e.blockedBy === guard.id, false, key);
    assert.equal(box.w.events.some((ev) => ev.type === 'attack' && ev.id === box.e.id), false, key);
  }
});

/** @param {EnemyDef} d @param {string} name @param {string} key */
function field(d, name, key) {
  const row = d.talents ? d.talents[name] : undefined;
  return row ? row[key] : undefined;
}

/** @param {EnemyDef} d @param {string} key */
function skillField(d, key) {
  const skill = d.skills ? d.skills[0] : undefined;
  const bb = skill ? skill.bb : undefined;
  return bb ? bb[key] : undefined;
}

test('[敌能-44] a fall is skipped only where the page excepts one, and only the skill blackboard carries the cast', () => {
  const sand = bare('enemy_1207_sfji', { talents: { DeadSpawn: { enemy_key: 'enemy_1208_msfji', cnt: 4, cnt_add: -1 } } });
  const hone = bare('enemy_1207_sfji_2', { talents: { DeadSpawn: { enemy_key: 'enemy_1208_msfji_2', cnt: 4, cnt_add: -1 } } });
  const qing = bare('enemy_1209_sfden', veilParent('enemy_1210_msfden', 5));
  assert.equal(field(sand, 'DeadSpawn', 'fall'), undefined);
  assert.equal(field(hone, 'DeadSpawn', 'fall'), 0);
  assert.equal(field(qing, 'DeadSpawn', 'fall'), 0);
  assert.equal(skillField(qing, 'cast'), 1);
  assert.equal(skillField(qing, 'duration'), 5);
  assert.equal(field(qing, 'InvisibleShield', 'duration'), 3);
  assert.equal(field(qing, 'InvisibleShield', 'cast'), undefined);
});
