// 卢西恩，“猩红血钻” and 不祥幻影 (docs/spec/foes.md 敌能-156): their talents and the skill `aoe`; the blink and the phantom
// are in lucien-blink.test.js. Neither is in a shipped level: the records are built from enemy_database
// (ArknightsGameData 17759cc8, level 0). Ours have 防御力 1000 unless a test says so, no attack, and 1000 of each element.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, elements, buffs, bus, damage, blocking, KIND } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras, withoutIncomplete, uncoveredAbilities } from '../src/foes.js';

/** @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef @typedef {import('@aue/sim').World} World */

const LUCIEN_KEY = 'enemy_2016_csphtm';
const PHANTOM_KEY = 'enemy_2017_csphts';
const TALENTS = Object.freeze({ penetrate: { def_penetrate: 0.4 }, evade: { prob: 0.4 }, combat: { 'attack@ep_damage_ratio': 0.2 } });
const AOE = Object.freeze({ key: 'aoe', cooldown: 10, initCooldown: 5, sp: 0, bb: { ep_damage_ratio: 0.2, atk_scale: 0.8 } });
const BLINK = Object.freeze({ key: 'blink', cooldown: 15, initCooldown: 10, sp: 0, bb: { dist: 1.5 } });
/** 卢西恩，“猩红血钻” at level 0 (enemy_database). @type {EnemyDef} */
const LUCIEN = /** @type {any} */ ({
  name: '卢西恩，“猩红血钻”', maxHp: 80000, atk: 1500, def: 600, res: 40, moveSpeed: 0.6, baseAttackTime: 3, rangeRadius: 0, applyWay: 'MELEE',
  motion: 'WALK', massLevel: 6, levelType: 'BOSS', lifePointReduce: 30, immune: ['stun', 'silence', 'sleep', 'freeze'], talents: TALENTS, skills: [BLINK, AOE],
});
/** 不祥幻影 at level 0 (enemy_database). @type {EnemyDef} */
const PHANTOM = /** @type {any} */ ({
  name: '不祥幻影', maxHp: 10000, atk: 750, def: 400, res: 20, moveSpeed: 0.6, baseAttackTime: 3, rangeRadius: 0, applyWay: 'MELEE',
  motion: 'WALK', massLevel: 2, levelType: 'ELITE', lifePointReduce: 1, talents: TALENTS, skills: [AOE],
});
/** The content's skill `aoe` of both: the data and the page's radius. */
const SKILL = Object.freeze({ ep_damage_ratio: 0.2, atk_scale: 0.8, radius: 2 });

/**
 * A record of `base` with these talents and skills replaced, the content's extras already in (`aoe` → its bb). The extras
 * are not merged again: the numbers stay the test's. @param {EnemyDef} base @param {any} [o] @returns {EnemyDef}
 */
function rec(base, o = {}) {
  const def = withFoeExtras(base === LUCIEN ? LUCIEN_KEY : PHANTOM_KEY, base);
  const skills = (def.skills ?? []).filter((s) => s.key !== 'blink' || !o.noBlink).map((s) => ({ ...s, ...(o[s.key] ?? {}), bb: { ...s.bb, ...(o[`${s.key}Bb`] ?? {}) } }));
  return /** @type {any} */ ({ ...def, ...(o.atk ? { atk: o.atk } : {}), talents: { ...def.talents, ...(o.talents ?? {}) }, skills });
}

/** Ours: sturdy, harmless. @param {any} c @param {any} o */
function ours(c, o) {
  const body = { cost: 0, maxHp: 1e6, atk: 0, def: o.def ?? 1000, res: 0, maxEp: 1000 };
  Object.assign(c.operators.guard, body);
  Object.assign(c.operators.sniper, body);
  for (const k of ['far', 'summon', 'camo', 'near']) c.operators[k] = { ...c.operators.guard, name: k };
  for (const k of ['hide', 'lift', 'veil']) c.operators[k] = { ...c.operators.sniper, name: k };
  c.operators.fly = { ...c.operators.sniper, name: 'fly', motion: 'FLY' };
}

/** Our device on (0, 1). @param {any} c */
function useDevice(c) {
  c.devices = { box: { name: 'box', maxHp: 1e6, atk: 0, def: 1000, res: 0, blockCnt: 0, baseAttackTime: 1, aspd: 100, tauntLevel: 0, massLevel: 0, talentBb: {} } };
  c.level.predefines = [{ alias: 'box#1', key: 'box', hidden: false, row: 0, col: 1, dir: 'UP' }];
}

/**
 * The content: the enemy `key` of record `def` (`rec` has put the extras in; incomplete abilities dropped unless `o.raw`),
 * `o.neutral`'s neutral units, our device with `o.device`, all spawning on frame 0. @param {string} key @param {EnemyDef} def @param {any} o
 */
function contentOf(key, def, o) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [key]: o.raw ? def : withoutIncomplete(def) };
  const spawns = [spawnAt(0, key)];
  for (const [i] of (o.neutral ?? []).entries()) {
    c.enemies[`neutral${i}`] = { name: 'neutral', maxHp: 1e6, atk: 0, def: 0, res: 0, moveSpeed: 0, neutral: true };
    spawns.push(spawnAt(0, `neutral${i}`));
  }
  c.behaviors = skeletonContent.behaviors;
  if (o.device) useDevice(c);
  c.level.waves = [oneWave(spawns)];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 9 };
  ours(c, o);
  return c;
}

/**
 * The enemy `o.key` (卢西恩 by default) of record `def` rooted at `o.at` (x 2, y 1), the neutral units at `o.neutral`'s
 * points; `o.ops` [key, row, col] deployed on the next step; `o.born` hears the `enemySpawn` event (钩子-3).
 * @param {EnemyDef} def @param {any} [o]
 */
function stand(def, o = {}) {
  const c = contentOf(o.key ?? LUCIEN_KEY, def, o);
  const w = createWorld(c, { seed: 1, players: 1 });
  if (o.born) bus.on(w, 'enemySpawn', o.born);
  step(w, c);
  const es = w.units.filter((u) => u.kind === KIND.ENEMY);
  for (const [i, e] of es.entries()) {
    const [x, y] = i === 0 ? o.at ?? [2, 1] : o.neutral[i - 1];
    Object.assign(e, { x, y, path: [], pt: 0 });
    status.applyStatus(e, 'root', {});
  }
  const ops = /** @type {[string, number, number][]} */ (o.ops ?? [['guard', 1, 3]]);
  step(w, c, ops.map(([op, row, col]) => [0, { type: 'deploy', op, row, col, dir: 0 }]));
  /** @param {string} k */
  const op = (k) => /** @type {Unit} */ (w.units.find((u) => u.key === k));
  return { c, w, e: es[0], op, neutrals: es.slice(1), dev: w.units.find((u) => u.kind === KIND.DEVICE) };
}

/** Steps until the world frame is `frame`: the frames before it are done. The events of those steps. @param {{ w: World, c: any }} box @param {number} frame */
function play(box, frame) {
  /** @type {any[]} */
  const ev = [];
  while (box.w.frame < frame) for (const x of step(box.w, box.c)) ev.push(x);
  return ev;
}

/** @param {Unit} u */
const nerve = (u) => elements.epOf(u, 'SANITY');
/** @param {Unit} u @param {string} key */
const count = (u, key) => u.buffs.filter((b) => b.key === key).length;
/** Its skill first ready at frame 3 (0.1 s after the spawn): the deploy is on frame 1, a test sets things up on frame 2. */
const SOON = { aoe: { initCooldown: 0.1 } };

test('[敌能-156] [关卡-2] the shapes: both read records are covered with their extras, not without them, and no other shape is', () => {
  assert.deepEqual(uncoveredAbilities([LUCIEN]), ['combat', 'blink', 'aoe'], 'the data alone');
  assert.deepEqual(uncoveredAbilities([PHANTOM]), ['combat', 'aoe']);
  assert.deepEqual(uncoveredAbilities([withFoeExtras(LUCIEN_KEY, LUCIEN), withFoeExtras(PHANTOM_KEY, PHANTOM)]), []);
  assert.deepEqual(withFoeExtras(PHANTOM_KEY, PHANTOM).skills?.[0].bb, SKILL);
  /** @param {string} name @param {Record<string, unknown>} bb */
  const talent = (name, bb) => uncoveredAbilities([/** @type {any} */ ({ ...PHANTOM, talents: { [name]: bb }, skills: [] })]);
  /** @param {string} name @param {Record<string, unknown>} bb */
  const skill = (name, bb) => uncoveredAbilities([/** @type {any} */ ({ ...PHANTOM, talents: {}, skills: [{ ...AOE, key: name, bb }] })]);
  assert.deepEqual([talent('penetrate', { def_penetrate: 0.4 }), talent('evade', { prob: 0.4 }), skill('aoe', SKILL)], [[], [], []]);
  for (const bb of [{ def_penetrate: '0.4' }, { def_penetrate: 0.4, more: 1 }, {}]) assert.deepEqual(talent('penetrate', bb), ['penetrate'], JSON.stringify(bb));
  for (const bb of [{ prob: '0.4' }, { prob: 0.4, duration: 15 }, {}]) assert.deepEqual(talent('evade', bb), ['evade'], JSON.stringify(bb));
  const aoes = [AOE.bb, { ...SKILL, radius: '2' }, { ...SKILL, page: 1 }, { atk_scale: 0.8, radius: 2 }, { atk_scale: 0.8 }, { duration: 5 }, { freeze: 7, freeze_add: 1, freeze_max: 12, atk_scale: 8 }];
  for (const bb of aoes) assert.deepEqual(skill('aoe', bb), ['aoe'], JSON.stringify(bb));
  const blinks = [BLINK.bb, { dist: 1.5, glide: 0.5 }, { dist: 1.5, glide: 0.5, enemy_key: '' }, { dist: 1.5, glide: 0.5, enemy_key: 5 }, { dist: 1.5, glide: '0.5', enemy_key: PHANTOM_KEY },
    { dist: 1.5, enemy_key: PHANTOM_KEY }, { dist: 1.5, glide: 0.5, enemy_key: PHANTOM_KEY, atk_scale: 1 }];
  assert.deepEqual(blinks.map((bb) => skill('blink', bb)), [['blink'], [], ['blink'], ['blink'], ['blink'], ['blink'], ['blink']], 'only 弑君者\'s two keys and 卢西恩\'s three');
  assert.deepEqual(skill('blink', { dist: 1.5, glide: 0.5, enemy_key: PHANTOM_KEY }), []);
});

test('[敌能-156] [敌能-129] the skill\'s two numbers alone are no 鼎沸 any more: no 不进行普通攻击, no 停顿免疫, no pulse; it attacks its blocker', () => {
  const box = stand(LUCIEN, { raw: true, ops: [['guard', 1, 2]] });
  assert.deepEqual(box.c.enemies[LUCIEN_KEY].skills.map((/** @type {any} */ x) => x.key), ['blink', 'aoe'], 'kept on the enemy, as in a level being tested');
  const ev = play(box, 181);
  assert.equal(attrs.statsOf(box.e).flags.noAttack, undefined);
  assert.equal(attrs.statsOf(box.e).flags['immune:sluggish'], undefined);
  assert.deepEqual([count(box.e, 'cauldronStill'), count(box.e, 'cauldronUnslowed'), box.e.ab['aoe.next']], [0, 0, undefined]);
  assert.ok(ev.some((x) => x.type === 'attack' && x.id === box.e.id), 'it attacks the guard blocking it');
  assert.equal(nerve(box.op('guard')), 1000, 'the raw record has no `el`: no 神经损伤 either; and no AOE');
  assert.equal(box.e.ab['aoe.cd'], 0, 'its cooldown ran out at frame 150 and nothing used it');
});

test('[敌能-156] 无视防御: from the spawn 物理穿透 +def_penetrate on its normal attack and its skill; one buff, back next turn when taken away, silence does not stop it', () => {
  for (const [pen, hit] of [[0.4, 1500 - 600], [0.7, 1500 - 300]]) {
    const box = stand(rec(LUCIEN, { talents: { penetrate: { def_penetrate: pen } }, aoe: { initCooldown: 99 }, noBlink: true }), { ops: [['guard', 1, 2]] });
    assert.deepEqual(box.e.buffs.find((b) => b.key === 'lucienPierce')?.mods, { defIgnorePct: pen }, 'from the spawn');
    const g = box.op('guard');
    play(box, 3);
    assert.equal(1e6 - g.hp, hit, `攻击力 1500 against 防御力 1000 at ${pen}`);
  }
  const skill = stand(rec(PHANTOM, { ...SOON, talents: { penetrate: { def_penetrate: 0.7 } } }), { key: PHANTOM_KEY });
  play(skill, 4);
  assert.equal(1e6 - skill.op('guard').hp, 750 * 0.8 - 300, 'the AOE: 600 against 防御力 1000 at 0.7');
  status.applyStatus(skill.e, 'silence', {});
  buffs.removeBuff(skill.e, 'lucienPierce');
  assert.equal(attrs.statsOf(skill.e).defIgnorePct, 0);
  play(skill, 90);
  assert.equal(attrs.statsOf(skill.e).flags.silence, true);
  assert.deepEqual([count(skill.e, 'lucienPierce'), attrs.statsOf(skill.e).defIgnorePct], [1, 0.7], 'back, and one only');
  const none = stand(rec(PHANTOM, { ...SOON, talents: { penetrate: { def_penetrate: '0.7' } } }), { key: PHANTOM_KEY });
  play(none, 4);
  assert.equal(1e6 - none.op('guard').hp, 750 * 0.8 * 0.05, 'a text number is no talent: 600 − 1000 floors at 5%');
});

test('[敌能-156] 闪避: not blocked as its turn starts it holds 物理/法术闪避 of prob, blocked it does not; it takes off only its own key; silence does not stop it', () => {
  /** @type {string[][]} */
  const born = [];
  const box = stand(rec(PHANTOM, { talents: { evade: { prob: 0.25 } }, aoe: { initCooldown: 99 } }), { key: PHANTOM_KEY, ops: [['guard', 1, 3]], born: (/** @type {{ enemy: Unit }} */ k) => { born.push(k.enemy.buffs.map((b) => b.key)); } });
  const e = box.e;
  assert.deepEqual(born, [['lucienPierce', 'lucienEvade']], 'both on as it appears, before its first turn');
  assert.deepEqual(e.buffs.find((b) => b.key === 'lucienEvade')?.mods, { dodgePhys: 0.25, dodgeArts: 0.25 });
  status.applyStatus(e, 'silence', {});
  buffs.addBuff(e, buffs.makeBuff({ key: 'evade', mods: { dodgePhys: 0.1 } }));
  play(box, 30);
  assert.equal(count(e, 'lucienEvade'), 1, 'one buff, not one a turn');
  const g = box.op('guard');
  Object.assign(e, { x: g.x, y: g.y });
  play(box, 31);
  assert.equal(e.blockedBy, g.id);
  assert.equal(count(e, 'lucienEvade'), 1, 'blocked in its turn: the dodge holds for the rest of the frame');
  play(box, 32);
  assert.deepEqual([count(e, 'lucienEvade'), count(e, 'evade')], [0, 1], 'gone on its next turn; another source\'s `evade` stays');
  buffs.removeBuff(e, 'evade');
  assert.equal(damage.dealDamage(box.w, g, e, { type: 'phys', amount: 1000 }, box.c), 1000 - 400, 'blocked: nothing to dodge with');
  blocking.release(e);
  Object.assign(e, { x: 2, y: 1 });
  play(box, 33);
  assert.deepEqual([e.blockedBy, count(e, 'lucienEvade')], [-1, 1], 'let go: back on its next turn');
  assert.deepEqual(e.buffs.find((b) => b.key === 'lucienEvade')?.mods, { dodgePhys: 0.25, dodgeArts: 0.25 });
  const sure = stand(rec(PHANTOM, { talents: { evade: { prob: 1 } }, aoe: { initCooldown: 99 } }), { key: PHANTOM_KEY });
  /** @type {string[]} */
  const dodged = [];
  bus.on(sure.w, 'dodge', (k) => { dodged.push(k.dmg.type); });
  const dealt = ['phys', 'arts', 'true'].map((type) => damage.dealDamage(sure.w, sure.op('guard'), sure.e, { type: /** @type {any} */ (type), amount: 1000 }, sure.c));
  assert.deepEqual([dealt, dodged], [[0, 0, 1000], ['phys', 'arts']], 'prob 1: 物理 and 法术 dodged, 真实 not');
});

test('[敌能-156] [敌能-38] the normal attack\'s 神经损伤: 攻击力 × attack@ep_damage_ratio on the unit blocking it, on the 攻击力 it has', () => {
  const box = stand(rec(LUCIEN, { aoe: { initCooldown: 99 }, noBlink: true }), { ops: [['guard', 1, 2]] });
  play(box, 3);
  assert.deepEqual([1e6 - box.op('guard').hp, nerve(box.op('guard'))], [900, 1000 - 300], '1500 × 0.2');
  for (const el of ['WATER', 'FIRE', 'DARK', 'ANGER']) assert.equal(elements.epOf(box.op('guard'), /** @type {any} */ (el)), 1000, el);
  const born = (/** @type {{ enemy: Unit }} */ k) => { buffs.addBuff(k.enemy, buffs.makeBuff({ key: 'up', mods: { atkPct: 0.5 } })); };
  const up = stand(rec(LUCIEN, { talents: { combat: { 'attack@ep_damage_ratio': 0.1, el: 1 } }, aoe: { initCooldown: 99 }, noBlink: true }), { ops: [['guard', 1, 2]], born });
  play(up, 3);
  assert.equal(nerve(up.op('guard')), 1000 - 225, '2250 × 0.1');
  const shade = stand(rec(PHANTOM, { aoe: { initCooldown: 99 } }), { key: PHANTOM_KEY, ops: [['guard', 1, 2]] });
  play(shade, 3);
  const sg = shade.op('guard');
  assert.deepEqual([1e6 - sg.hp, nerve(sg), elements.epOf(sg, 'WATER')], [150, 1000 - 150, 1000], '不祥幻影, its own `el`: 750 against 0.6 × 1000, and 750 × 0.2');
});

test('[敌能-156] AOE: first at 5 s, again 10 s after; each within the radius takes 攻击力 × atk_scale physical and 攻击力 × ep_damage_ratio 神经损伤 as a skill, the first the trigger saw unsplashed', () => {
  const box = stand(rec(LUCIEN, { noBlink: true }), { ops: [['guard', 1, 3], ['sniper', 0, 2]] });
  /** @type {[string, boolean, boolean, boolean][]} */
  const hits = [];
  bus.on(box.w, 'hit', (k) => { if (k.source === box.e) hits.push([k.target.key, k.dmg.isSplash === true, k.dmg.isSkill === true, k.dmg.isAttack === true]); });
  const g = box.op('guard'), s = box.op('sniper');
  play(box, 150);
  assert.deepEqual([g.hp, s.hp, nerve(g), box.e.ab['aoe.cd']], [1e6, 1e6, 1000, 0], 'nothing before frame 150');
  play(box, 151);
  assert.deepEqual([1e6 - g.hp, 1e6 - s.hp, nerve(g), nerve(s)], [600, 600, 700, 700], '1200 − 0.6 × 1000 and 300');
  assert.deepEqual(hits, [['guard', true, true, false], ['sniper', false, true, false]], 'the later deployed is first (索敌-5): the main target');
  assert.equal(box.e.ab['aoe.cd'], 299);
  play(box, 450);
  assert.equal(1e6 - g.hp, 600, 'not again before frame 450');
  play(box, 451);
  assert.deepEqual([1e6 - g.hp, nerve(g), hits.length], [1200, 400, 4]);
  const held = stand(rec(PHANTOM, SOON), { key: PHANTOM_KEY, ops: [['guard', 1, 2], ['sniper', 0, 2]] });
  /** @type {[string, boolean][]} */
  const split = [];
  bus.on(held.w, 'hit', (k) => { if (k.source === held.e && k.dmg.isSkill) split.push([k.target.key, k.dmg.isSplash === true]); });
  play(held, 4);
  assert.equal(held.e.blockedBy, held.op('guard').id);
  assert.deepEqual(split, [['guard', false], ['sniper', true]], 'blocked: the unit blocking it is first, though deployed first');
});

test('[敌能-156] AOE: the numbers and the radius are the blackboard\'s, on the 攻击力 it has; the circle\'s edge is in, a hair past it is not', () => {
  const box = stand(rec(PHANTOM, { ...SOON, aoeBb: { atk_scale: 0.5, ep_damage_ratio: 0.1, radius: 1.2 } }), { key: PHANTOM_KEY, ops: [['guard', 1, 3], ['far', 1, 4], ['sniper', 0, 3]] });
  buffs.addBuff(box.e, buffs.makeBuff({ key: 'up', mods: { atkPct: 1 } }));
  play(box, 4);
  assert.deepEqual([1e6 - box.op('guard').hp, nerve(box.op('guard'))], [1500 * 0.5 - 600, 1000 - 150], '攻击力 1500: 750 − 0.6 × 1000 and 150');
  assert.deepEqual([box.op('far').hp, box.op('sniper').hp], [1e6, 1e6], 'at 2 and 1.41: outside 1.2');
  const edge = stand(rec(PHANTOM, SOON), { key: PHANTOM_KEY, def: 0, ops: [['far', 1, 4]] });
  play(edge, 4);
  assert.equal(1e6 - edge.op('far').hp, 600, 'at exactly 2: in');
  const past = stand(rec(PHANTOM, SOON), { key: PHANTOM_KEY, def: 0, at: [1.99, 1], ops: [['far', 1, 4]] });
  play(past, 4);
  assert.deepEqual([past.op('far').hp, past.e.ab['aoe.cd']], [1e6, 0], 'at 2.01: out, and nobody else: it waits, ready');
});

test('[敌能-156] AOE who: ours, a summon, our device, neutral units, flyers and 迷彩 within the radius; not 隐匿, 无法选中, 起飞, 沉睡, nor beyond', () => {
  const box = stand(rec(LUCIEN, { ...SOON, noBlink: true }), {
    ops: [['guard', 1, 3], ['summon', 1, 0], ['camo', 1, 4], ['near', 1, 1], ['sniper', 0, 2], ['hide', 0, 3], ['fly', 2, 2], ['lift', 2, 3]],
    device: true, neutral: [[2.5, 1], [4.1, 1]],
  });
  box.op('summon').summoner = 1;
  buffs.addBuff(box.op('camo'), buffs.makeBuff({ key: 'camo', flags: { camou: true } }));
  buffs.addBuff(box.op('hide'), buffs.makeBuff({ key: 'veil', flags: { stealth: true } }));
  buffs.addBuff(box.op('lift'), buffs.makeBuff({ key: 'up', flags: { liftoff: true } }));
  buffs.addBuff(box.op('near'), buffs.makeBuff({ key: 'out', flags: { untargetable: true } }));
  status.applyStatus(box.op('sniper'), 'sleep', { seconds: 30 });
  play(box, 4);
  /** @param {Unit} u */
  const hit = (u) => u.hp === 1e6 - 600 && nerve(u) === 700;
  for (const k of ['guard', 'summon', 'camo', 'fly']) assert.equal(hit(box.op(k)), true, k);
  assert.ok(box.dev && hit(box.dev), 'our device');
  for (const k of ['hide', 'lift', 'near', 'sniper']) assert.deepEqual([box.op(k).hp, nerve(box.op(k))], [1e6, 1000], k);
  assert.deepEqual([box.neutrals[0].hp, nerve(box.neutrals[0])], [1e6 - 1200, 1000], 'a neutral unit at 0.5: 防御力 0, no 神经损伤');
  assert.equal(box.neutrals[1].hp, 1e6, 'one at 2.1');
});

test('[敌能-156] AOE trigger: nobody in the radius, or only 迷彩 ones, keeps it ready; the turn the trigger sees one, it goes and hits the 迷彩 one too', () => {
  const box = stand(rec(PHANTOM, SOON), { key: PHANTOM_KEY, ops: [['camo', 1, 3]] });
  const camo = box.op('camo');
  buffs.addBuff(camo, buffs.makeBuff({ key: 'camo', flags: { camou: true } }));
  play(box, 60);
  assert.deepEqual([camo.hp, nerve(camo), box.e.ab['aoe.cd']], [1e6, 1000, 0], 'only a 迷彩 unit: not cast, ready');
  /** @type {string[]} */
  const main = [];
  bus.on(box.w, 'hit', (k) => { if (k.source === box.e && !k.dmg.isSplash) main.push(k.target.key); });
  step(box.w, box.c, [[0, { type: 'deploy', op: 'sniper', row: 0, col: 3, dir: 0 }]]);
  assert.deepEqual([1e6 - camo.hp, nerve(camo), box.e.ab['aoe.cd']], [30, 850, 299], 'the frame the sniper comes: cast, the 迷彩 one hit as splash');
  assert.deepEqual(main, ['sniper'], 'the main target is one the trigger saw, not the later-deployed-first 迷彩 one');
  const lift = stand(rec(PHANTOM, SOON), { key: PHANTOM_KEY, ops: [['lift', 0, 3]] });
  buffs.addBuff(lift.op('lift'), buffs.makeBuff({ key: 'up', flags: { liftoff: true } }));
  play(lift, 30);
  assert.equal(lift.e.ab['aoe.cd'], 0, 'only a 起飞 unit: the trigger does not see it');
  const short = stand(rec(PHANTOM, { ...SOON, aoeBb: { radius: 1.2 } }), { key: PHANTOM_KEY, ops: [['sniper', 0, 3]] });
  play(short, 30);
  assert.deepEqual([short.op('sniper').hp, short.e.ab['aoe.cd']], [1e6, 0], 'radius 1.2, the sniper at 1.41: the trigger looks as far as the radius');
});

test('[敌能-156] AOE trigger: a flyer, our device or a neutral unit alone in the radius sets it off; one asleep does not', () => {
  const fly = stand(rec(PHANTOM, SOON), { key: PHANTOM_KEY, ops: [['fly', 2, 2]] });
  const dev = stand(rec(PHANTOM, SOON), { key: PHANTOM_KEY, ops: [], device: true });
  const neutral = stand(rec(PHANTOM, SOON), { key: PHANTOM_KEY, ops: [], neutral: [[2.5, 1]] });
  for (const box of [fly, dev, neutral]) play(box, 4);
  assert.deepEqual([1e6 - fly.op('fly').hp, fly.e.ab['aoe.cd']], [30, 299], 'a flyer (技能默认可对空)');
  assert.deepEqual([1e6 - (dev.dev?.hp ?? 0), dev.e.ab['aoe.cd']], [30, 299], 'our device');
  assert.deepEqual([1e6 - neutral.neutrals[0].hp, neutral.e.ab['aoe.cd']], [600, 299], 'a neutral unit (防御力 0)');
  const asleep = stand(rec(PHANTOM, SOON), { key: PHANTOM_KEY, ops: [['sniper', 0, 2]] });
  status.applyStatus(asleep.op('sniper'), 'sleep', { seconds: 30 });
  play(asleep, 30);
  assert.deepEqual([asleep.op('sniper').hp, asleep.e.ab['aoe.cd']], [1e6, 0], 'only a sleeping unit: not cast, ready');
});

test('[敌能-156] AOE main target: blocked, the unit blocking it, even 迷彩 or 隐匿 — which alone does not set the skill off', () => {
  for (const flag of ['camou', 'stealth']) {
    const box = stand(rec(PHANTOM, SOON), { key: PHANTOM_KEY, ops: [['guard', 1, 2]] });
    const g = box.op('guard');
    buffs.addBuff(g, buffs.makeBuff({ key: 'cover', flags: { [flag]: true } }));
    play(box, 30);
    assert.deepEqual([box.e.blockedBy, box.e.ab['aoe.cd']], [g.id, 0], `${flag}: blocked by it alone, not cast, ready`);
    /** @type {string[]} */
    const hits = [];
    bus.on(box.w, 'hit', (k) => { if (k.source === box.e && k.dmg.isSkill) hits.push(`${k.target.key}${k.dmg.isSplash ? ' splash' : ''}`); });
    step(box.w, box.c, [[0, { type: 'deploy', op: 'sniper', row: 0, col: 2, dir: 0 }]]);
    assert.deepEqual(hits.toSorted(), ['guard', 'sniper splash'], `${flag}: the sniper sets it off, the guard blocking it is the main target (总是选择阻挡目标)`);
  }
  const gone = stand(rec(PHANTOM, { aoe: { initCooldown: 99 } }), { key: PHANTOM_KEY, ops: [['guard', 1, 2], ['sniper', 0, 2]] });
  /** @type {string[]} */
  const main = [];
  bus.on(gone.w, 'hit', (k) => { if (k.source === gone.e && k.dmg.isSkill && !k.dmg.isSplash) main.push(k.target.key); });
  gone.op('guard').hp = 0;
  gone.e.ab['aoe.cd'] = 0;
  step(gone.w, gone.c);
  assert.deepEqual([main, gone.e.ab['aoe.cd']], [['sniper'], 299], 'the blocker already at 0 HP when its turn starts is no main target: the next by 索敌-5 is');
});

test('[敌能-156] [关卡-2] kept on an enemy anyway, a shape these behaviours do not know does nothing: no 穿透, no 闪避, no AOE', () => {
  const base = rec(PHANTOM, SOON);
  /** @type {any} */
  const odd = { ...base, talents: { penetrate: { def_penetrate: 0.4, more: 1 }, evade: { prob: '0.4' } }, skills: (base.skills ?? []).map((x) => ({ ...x, bb: { ...SKILL, radius: '2' } })) };
  const box = stand(odd, { key: PHANTOM_KEY, raw: true });
  play(box, 30);
  assert.deepEqual([box.e.buffs.map((b) => b.key), box.op('guard').hp], [['root'], 1e6]);
});

test('[敌能-156] AOE takes the attack: no normal attack on its frame, the attack cooldown becomes an interval; it does not wait for the attack cooldown', () => {
  const box = stand(rec(PHANTOM, { aoe: { initCooldown: 2 } }), { key: PHANTOM_KEY, ops: [['guard', 1, 2]] });
  const g = box.op('guard');
  play(box, 59);
  assert.equal(box.e.blockedBy, g.id);
  assert.ok(box.e.atkCd > 0, 'mid-interval after its first swing at frame 1');
  const ev = play(box, 61);
  assert.equal(ev.some((x) => x.type === 'attack' && x.id === box.e.id), false, 'no swing on the cast frame');
  assert.equal(box.e.atkCd, 90 - 1, 'a whole 3 s interval from the cast frame (counted down once that frame)');
  assert.equal(box.e.ab['aoe.cd'], 299);
});

test('[敌能-156] [状态-12] AOE gate: stun, silence (不祥幻影), 缴械, 强制缴械, noAttack, 恐惧, 消失 and 失衡 hold it ready; 卢西恩 cannot be silenced', () => {
  /** @type {[string, (e: Unit) => void][]} */
  const holds = [
    ['stun', (e) => { status.applyStatus(e, 'stun', { seconds: 1 }); }],
    ['silence', (e) => { status.applyStatus(e, 'silence', { seconds: 1 }); }],
    ['缴械', (e) => { status.applyStatus(e, 'disarm', { seconds: 1 }); }],
    ['强制缴械', (e) => { status.applyStatus(e, 'forceDisarm', { seconds: 1 }); }],
    ['noAttack', (e) => { buffs.addBuff(e, buffs.makeBuff({ key: 'disarm', flags: { noAttack: true }, left: 30 })); }],
    ['fear', (e) => { buffs.addBuff(e, buffs.makeBuff({ key: 'scare', flags: { fear: true }, left: 30 })); }],
    ['hidden', (e) => { e.hidden = true; }],
    ['失衡', (e) => { e.slide = { vx: 0, vy: 0, hard: 25 }; }],
  ];
  for (const [name, put] of holds) {
    const box = stand(rec(PHANTOM, SOON), { key: PHANTOM_KEY });
    put(box.e);
    play(box, 20);
    assert.deepEqual([box.op('guard').hp, box.e.ab['aoe.cd']], [1e6, 0], `${name}: not cast, ready`);
    box.e.hidden = false;
    play(box, 40);
    assert.equal(1e6 - box.op('guard').hp, 30, `${name}: cast once it is lifted (600 against 防御力 1000 at 0.4 floors at 5%)`);
  }
  const lucien = stand(rec(LUCIEN, { ...SOON, noBlink: true }));
  status.applyStatus(lucien.e, 'silence', { seconds: 30 });
  assert.equal(attrs.statsOf(lucien.e).flags.silence, undefined, '免疫沉默');
  play(lucien, 4);
  assert.equal(1e6 - lucien.op('guard').hp, 600);
});

test('[敌能-156] AOE gate: 战栗 holds it only while it is blocked', () => {
  const tremble = buffs.makeBuff({ key: 'tremble', flags: { disarmedCombat: true } });
  const held = stand(rec(PHANTOM, SOON), { key: PHANTOM_KEY, ops: [['guard', 1, 2]] });
  buffs.addBuff(held.e, { ...tremble });
  play(held, 30);
  assert.deepEqual([held.e.blockedBy, held.e.ab['aoe.cd']], [held.op('guard').id, 0], 'blocked under 战栗: not cast, ready');
  const free = stand(rec(PHANTOM, SOON), { key: PHANTOM_KEY });
  buffs.addBuff(free.e, { ...tremble });
  play(free, 30);
  assert.deepEqual([free.e.blockedBy, 1e6 - free.op('guard').hp, free.e.ab['aoe.cd']], [-1, 30, 299 - 26], 'not blocked: cast at frame 3');
});

test('[敌能-156] AOE: the damage, then the 神经损伤, whatever the damage did: dodged or shielded it still lands; 无敌 takes neither', () => {
  const box = stand(rec(PHANTOM, SOON), { key: PHANTOM_KEY, def: 0, ops: [['guard', 1, 3], ['sniper', 0, 2], ['far', 1, 4]] });
  /** @type {string[]} */
  const seen = [];
  bus.on(box.w, 'hit', (k) => { if (k.source === box.e) seen.push(`hit ${k.target.key}`); });
  bus.on(box.w, 'elementHit', (k) => { if (k.source === box.e) seen.push(`${k.dmg.element} ${k.target.key}`); });
  buffs.addBuff(box.op('guard'), buffs.makeBuff({ key: 'evade', mods: { dodgePhys: 1 } }));
  buffs.addBuff(box.op('sniper'), buffs.makeBuff({ key: 'wall', shieldHits: 1 }));
  status.applyStatus(box.op('far'), 'invincible', {});
  play(box, 4);
  assert.deepEqual(seen, ['hit guard', 'SANITY guard', 'hit sniper', 'SANITY sniper'], 'damage before 神经损伤, target by target; 无敌 stops both before their events (伤害-7, 元素-2)');
  for (const k of ['guard', 'sniper']) assert.deepEqual([box.op(k).hp, nerve(box.op(k))], [1e6, 850], `${k}: no HP lost, 神经损伤 750 × 0.2`);
  assert.deepEqual([box.op('far').hp, nerve(box.op('far'))], [1e6, 1000], '无敌');
});
