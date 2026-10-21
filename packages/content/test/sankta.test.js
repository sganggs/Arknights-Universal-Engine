// 萨科塔 flyers (docs/spec/foes.md 敌能-49): self-fear at half HP, the eye's ammo theft, the head's prayer roar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, buffs, skills, elements, devices, blocking } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras, withoutIncomplete, uncoveredAbilities } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

const WING = 'enemy_10083_hlbird', EYE = 'enemy_10084_hlegle', HEAD = 'enemy_10085_hllevi_2';
const UNREAD = ['enemy_10083_hlbird_2', 'enemy_10084_hlegle_2', 'enemy_10085_hllevi', 'enemy_10086_hltigr', 'enemy_10086_hltigr_2', 'enemy_1157_hymwr', 'enemy_1537_mhrors'];

const fearBb = { fear: 5, speed_duration: 5, move_speed: 1.5 };
const ammoSkill = { id: 'shots', type: 'MANUAL', sp: 'time', cost: 5, init: 0, charges: 1, duration: -1, ammo: true, bb: { cnt: 1 } };
/** @param {number} a @param {number} b */
const close = (a, b) => Math.abs(a - b) < 1e-9;
/** @param {Unit} u @param {string} key */
const buff = (u, key) => u.buffs.find((b) => b.key === key);
/** @param {World} w @param {string} key */
function unit(w, key) {
  const u = w.units.find((x) => x.key === key);
  assert.ok(u, key);
  return u;
}
/** @param {World} w @param {any} c @param {number} n */
function run(w, c, n) { for (let i = 0; i < n; i++) step(w, c); }
/** @param {string} op @param {number} row @param {number} col */
const dep = (op, row, col) => /** @type {[number, any]} */ ([0, { type: 'deploy', op, row, col, dir: 0 }]);

/** @param {string} key @param {any} def */
const prep = (key, def) => withoutIncomplete(withFoeExtras(key, def));

function wingDef() {
  return { name: WING, maxHp: 1500, atk: 0, def: 0, res: 30, moveSpeed: 0.9, motion: 'FLY', applyWay: 'NONE', rangeRadius: -1, talents: { SelfFear: { ...fearBb } } };
}
function eyeData() {
  return { name: EYE, maxHp: 5500, atk: 1000, def: 150, res: 30, moveSpeed: 0.7, motion: 'FLY', applyWay: 'RANGED', rangeRadius: 1.3, baseAttackTime: 3,
    talents: { SelfFear: { ...fearBb }, DamageOrBullet: { 'attack@minus_bullet': 1 } } };
}
function headDef() {
  return { name: HEAD, maxHp: 80000, atk: 0, def: 50, res: 30, moveSpeed: 0.4, motion: 'FLY', applyWay: 'NONE', rangeRadius: -1, talents: { SelfFear: { ...fearBb } },
    skills: [{ key: 'Roar', initCooldown: 20, cooldown: 40, sp: 0, bb: { duration: 15, attack_speed: -30 } }] };
}
/** @param {number} init @param {number} cd @param {number} dur */
function headSkill(init, cd, dur) {
  const d = headDef();
  d.skills = [{ key: 'Roar', initCooldown: init, cooldown: cd, sp: 0, bb: { duration: dur, attack_speed: -30 } }];
  return d;
}

/** A fresh tiny battle. The route flies, so a feared flyer walks straight (状态-10). @param {string} key @param {any} def */
function open(key, def) {
  const c = /** @type {any} */ (tinyContent());
  c.level.routes[0].motion = 'FLY';
  c.level.options.characterLimit = 9;
  c.level.options.initialCost = 99;
  c.level.options.maxCost = 99;
  c.enemies = { [key]: prep(key, def) };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, key)])];
  return { c, w: createWorld(c, { seed: 1, players: 1 }) };
}

/** Steps until `pred`, at most 8 times. How many it took, or 0. @param {World} w @param {any} c @param {() => boolean} pred */
function until(w, c, pred) {
  for (let i = 0; i < 8; i++) { step(w, c); if (pred()) return i + 1; }
  return 0;
}

/** @param {any} def @param {string} key */
function talent(def, key) {
  return def.talents[key];
}

test('[敌能-49] the three read rows keep Static and gain only their page numbers; unread ids stay uncovered', () => {
  const wing = prep(WING, wingDef()), eye = prep(EYE, eyeData()), head = prep(HEAD, headDef());
  const fearW = talent(wing, 'SelfFear'), fearE = talent(eye, 'SelfFear'), fearH = talent(head, 'SelfFear');
  const bullet = talent(eye, 'DamageOrBullet'), skill = (head.skills ?? [])[0];
  assert.deepEqual(talent(wing, 'Static'), {});
  assert.equal(fearW.speed_final, 1);
  assert.equal(fearW.hp_ratio, 0.5);
  assert.equal(fearW.move_speed, 1.5);
  assert.equal(bullet.steal, 1);
  assert.equal(bullet['attack@minus_bullet'], 1);
  assert.equal(fearE.speed_final, 1);
  assert.equal(fearH.speed_final, 0);
  assert.deepEqual(talent(head, 'Static'), {});
  assert.deepEqual([skill.initCooldown, skill.cooldown, skill.bb.duration, skill.bb.attack_speed, skill.bb.air, skill.bb.camou], [20, 40, 15, -30, 0, 1]);
  assert.deepEqual(uncoveredAbilities([wing, eye, head]), []);
  /** @param {string} key */
  const raw = (key) => ({ name: key, maxHp: 100, atk: 0, def: 0, res: 0, moveSpeed: 1, talents: { SelfFear: { ...fearBb }, DamageOrBullet: { 'attack@minus_bullet': 1 } },
    skills: [{ key: 'Roar', initCooldown: 20, cooldown: 40, sp: 0, bb: { duration: 15, attack_speed: -30 } }] });
  assert.deepEqual(uncoveredAbilities(UNREAD.map((k) => withFoeExtras(k, raw(k)))), ['SelfFear', 'DamageOrBullet', 'Roar']);
  for (const k of UNREAD) {
    const stripped = prep(k, raw(k));
    assert.equal(talent(stripped, 'SelfFear'), undefined, k);
    assert.equal(talent(stripped, 'DamageOrBullet'), undefined, k);
    assert.equal((stripped.skills ?? []).length, 0, k);
  }
});

test('[敌能-49] 半血恐惧 applies on the crossing frame, once, for 5s, and a flyer flutters on its own tile', () => {
  const { c, w } = open(WING, wingDef());
  step(w, c);
  const e = unit(w, WING), x0 = e.x, y0 = e.y;
  assert.equal(attrs.statsOf(e).flags.staticBody, true);
  e.hp = 750;
  step(w, c);
  assert.equal(buff(e, 'fear'), undefined, 'exactly half is not under half');
  e.hp = 749;
  step(w, c);
  const fear = buff(e, 'fear'), speed = buff(e, 'selfFear');
  assert.ok(fear && speed);
  assert.equal(fear.left, 150);
  assert.equal(speed.left, 150);
  assert.equal(e.drift?.self, 1);
  assert.equal(e.drift?.tiles.length, 0);
  assert.equal(attrs.statsOf(e).flags.fear, true);
  assert.equal(attrs.statsOf(e).flags.staticBody, true);
  assert.ok(close(attrs.statsOf(e).moveSpeed, 1.35));
  run(w, c, 8);
  const dx = e.x - x0, dy = e.y - y0;
  assert.ok(dx * dx + dy * dy > 0, 'it moved');
  assert.ok(Math.abs(e.x - x0) < 0.5 && Math.abs(e.y - y0) < 0.5, 'still on that tile');
  e.hp = 1500;
  step(w, c);
  e.hp = 100;
  step(w, c);
  assert.equal(e.buffs.filter((b) => b.key === 'fear').length, 1, 'a later drop does not apply it again');
});

test('[敌能-49] 半血恐惧 lasts 5s; 抵抗 shortens the fear and not the speed buff', () => {
  const plain = open(WING, wingDef());
  step(plain.w, plain.c);
  const a = unit(plain.w, WING);
  status.applyStatus(a, 'root', {});
  a.hp = 749;
  step(plain.w, plain.c);
  run(plain.w, plain.c, 149);
  assert.equal(buff(a, 'fear')?.left, 1);
  assert.equal(buff(a, 'selfFear')?.left, 1);
  step(plain.w, plain.c);
  assert.equal(buff(a, 'fear'), undefined);
  assert.equal(buff(a, 'selfFear'), undefined);
  assert.ok(close(attrs.statsOf(a).moveSpeed, 0.9));

  const held = open(WING, wingDef());
  step(held.w, held.c);
  const b = unit(held.w, WING);
  status.applyStatus(b, 'buffres', {});
  b.hp = 749;
  step(held.w, held.c);
  run(held.w, held.c, 75);
  assert.equal(buff(b, 'fear'), undefined);
  assert.equal(buff(b, 'selfFear')?.left, 75);
});

test('[敌能-49] 「最终」 is a final multiplier; without it the direct column, and a prior movePct tells them apart', () => {
  const wing = open(WING, wingDef());
  step(wing.w, wing.c);
  const bird = unit(wing.w, WING);
  buffs.addBuff(bird, buffs.makeBuff({ key: 'prior', mods: { movePct: 1 } }));
  bird.hp = 749;
  step(wing.w, wing.c);
  assert.equal(buff(bird, 'selfFear')?.mods.moveMul, 1.5);
  assert.equal(buff(bird, 'selfFear')?.mods.movePct, undefined);
  assert.ok(close(attrs.statsOf(bird).moveSpeed, 2.7));

  const head = open(HEAD, headDef());
  step(head.w, head.c);
  const h = unit(head.w, HEAD);
  h.hp = 39999;
  step(head.w, head.c);
  assert.equal(buff(h, 'selfFear')?.mods.movePct, 0.5);
  assert.equal(buff(h, 'selfFear')?.mods.moveMul, undefined);
  assert.ok(close(attrs.statsOf(h).moveSpeed, 0.6));
  buffs.addBuff(h, buffs.makeBuff({ key: 'prior', mods: { movePct: 1 } }));
  assert.ok(close(attrs.statsOf(h).moveSpeed, 1));
});

test('[敌能-49] the talent is not silenced: a crossing while silenced or stunned still sets off the self-fear', () => {
  for (const key of ['silence', 'stun']) {
    const { c, w } = open(WING, wingDef());
    step(w, c);
    const e = unit(w, WING);
    status.applyStatus(e, /** @type {'silence'} */ (key), {});
    e.hp = 749;
    step(w, c);
    assert.ok(buff(e, 'fear'), key);
    assert.equal(e.ab['SelfFear.done'], 1, key);
  }
});

test('[敌能-49] spawning already under half does not count until HP crosses down from half again', () => {
  const { c, w } = open(WING, wingDef());
  step(w, c);
  const e = unit(w, WING);
  e.hp = 100;
  e.ab['SelfFear.hp'] = 100;
  step(w, c);
  assert.equal(buff(e, 'fear'), undefined);
  e.hp = 1500;
  step(w, c);
  e.hp = 100;
  step(w, c);
  assert.ok(buff(e, 'fear'));
});

test('[敌能-49] 之翼 makes no normal attack', () => {
  const { c, w } = open(WING, wingDef());
  c.operators.guard.cost = 0;
  const ev = step(w, c, [dep('guard', 1, 1)]);
  const e = unit(w, WING);
  e.x = 1; e.y = 1;
  const more = [];
  for (let i = 0; i < 5; i++) more.push(...step(w, c));
  assert.equal([...ev, ...more].filter((x) => x.type === 'attack' && x.id === e.id).length, 0);
});

/** The eye in range of a guard, rooted, with a probe that makes the cancelled hit observable. */
function beside() {
  const d = /** @type {any} */ (eyeData());
  d.talents = { ...d.talents, probe: {} };
  const { c, w } = open(EYE, d);
  c.behaviors = { ...c.behaviors, foes: { ...c.behaviors.foes, probe: { attack: (/** @type {any} */ _ctx, /** @type {any} */ mods) => ({ ...mods, element: 'FIRE', epScale: 0.1, hitStatus: { key: 'cold', seconds: 2 } }) } } };
  c.operators.guard.cost = 0;
  c.operators.guard.trait = { talentSp: [{ on: 'attacked', sp: 5 }] };
  c.operators.guard.skill = ammoSkill;
  step(w, c, [dep('guard', 1, 2)]);
  const e = unit(w, EYE), g = unit(w, 'guard');
  e.x = 3; e.y = 1;
  status.applyStatus(e, 'root', {});
  return { c, w, e, g };
}

test('[敌能-49] 夺弹 with a running ammo skill cancels the hit, and 0 shots does not end the skill', () => {
  const { c, w, g } = beside();
  skills.activate(w, c, g);
  assert.equal(g.skill?.ammo, 1);
  const hp = g.hp, x = g.x, y = g.y, sp = g.skill?.sp;
  assert.ok(until(w, c, () => g.skill?.ammo === 0 || g.hp !== hp) > 0);
  assert.equal(g.skill?.ammo, 0);
  assert.equal(g.skill?.active, true);
  assert.equal(g.hp, hp);
  assert.equal(g.x, x);
  assert.equal(g.y, y);
  assert.equal(buff(g, 'enemyCold'), undefined);
  assert.equal(elements.epOf(g, 'FIRE'), 1000);
  assert.equal(g.skill?.sp, sp);
});

test('[敌能-49] 夺弹 is decided at the hit; without ammo the hit lands', () => {
  const flown = beside();
  const hp = flown.g.hp;
  step(flown.w, flown.c);
  assert.ok(flown.w.events.some((ev) => ev.type === 'shot' && ev.id === flown.e.id));
  assert.equal(flown.g.hp, hp, 'still in the air');
  skills.activate(flown.w, flown.c, flown.g);
  assert.ok(until(flown.w, flown.c, () => flown.g.skill?.ammo === 0 || flown.g.hp !== hp) > 0);
  assert.equal(flown.g.skill?.ammo, 0);
  assert.equal(flown.g.skill?.active, true);
  assert.equal(flown.g.hp, hp);

  const plain = beside();
  const hp0 = plain.g.hp;
  assert.ok(until(plain.w, plain.c, () => plain.g.hp !== hp0) > 0);
  assert.ok(hp0 - plain.g.hp > 0);
  assert.ok(buff(plain.g, 'enemyCold'));
  assert.ok(elements.epOf(plain.g, 'FIRE') < 1000);
  assert.equal(plain.g.skill?.sp, 5);
});

test('[敌能-49] 猎手子弹 is not the ammo 夺弹 reads', () => {
  const { c, w } = open(EYE, eyeData());
  c.operators.guard.cost = 0;
  c.operators.guard.trait = { bullets: { max: 2, scale: 1.5 } };
  step(w, c, [dep('guard', 1, 2)]);
  const e = unit(w, EYE), g = unit(w, 'guard');
  e.x = 3; e.y = 1;
  status.applyStatus(e, 'root', {});
  const hp = g.hp;
  assert.ok(until(w, c, () => g.hp !== hp) > 0);
  assert.ok(hp - g.hp > 0);
});

test('[敌能-49] 之眼 does not attack a flying unit; a unit that only took off is still a target', () => {
  const fly = open(EYE, eyeData());
  fly.c.operators.guard.cost = 0;
  fly.c.operators.flyer = { ...fly.c.operators.guard, name: 'flyer', motion: 'FLY' };
  step(fly.w, fly.c, [dep('flyer', 1, 2)]);
  const eye = unit(fly.w, EYE);
  eye.x = 3; eye.y = 1;
  status.applyStatus(eye, 'root', {});
  let shots = 0;
  for (let i = 0; i < 5; i++) shots += step(fly.w, fly.c).filter((ev) => ev.type === 'shot').length;
  assert.equal(shots, 0);

  const up = open(EYE, eyeData());
  up.c.operators.guard.cost = 0;
  step(up.w, up.c, [dep('guard', 1, 2)]);
  const g = unit(up.w, 'guard');
  buffs.addBuff(g, buffs.makeBuff({ key: 'up', flags: { liftoff: true } }));
  const e = unit(up.w, EYE);
  e.x = 3; e.y = 1;
  status.applyStatus(e, 'root', {});
  let n = 0;
  for (let i = 0; i < 5; i++) n += step(up.w, up.c).filter((ev) => ev.type === 'shot').length;
  assert.ok(n > 0);
});

/** Shortened roar (init 0.1s) with one of every invite case already on the field. */
function inviteWorld() {
  const c = /** @type {any} */ (tinyContent());
  c.level.routes[0].motion = 'FLY';
  c.level.options.characterLimit = 9;
  c.level.options.initialCost = 99;
  /** @param {string} key @param {string} [motion] */
  const op = (key, motion = 'WALK') => ({ ...c.operators.guard, name: key, cost: 0, motion });
  c.operators.far = op('far');
  c.operators.fly = op('fly', 'FLY');
  c.operators.lift = op('lift');
  c.operators.cam = op('cam');
  c.operators.hide = op('hide');
  c.operators.nap = { ...c.operators.sniper, name: 'nap', cost: 0 };
  c.operators.ghost = { ...c.operators.sniper, name: 'ghost', cost: 0 };
  c.enemies = { [HEAD]: prep(HEAD, headSkill(0.1, 1, 1)), citizen: { name: 'citizen', maxHp: 50, atk: 0, def: 0, res: 0, moveSpeed: 0, neutral: true } };
  c.devices = { ours: { name: 'ours', maxHp: 100, atk: 0, def: 0, res: 0 }, foe: { name: 'foe', maxHp: 100, atk: 0, def: 0, res: 0, side: 'ENEMY' } };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, HEAD), spawnAt(0, 'citizen')])];
  const w = createWorld(c, { seed: 1, players: 1 });
  devices.spawnDevice(w, c, 'ours', 0, 0);
  devices.spawnDevice(w, c, 'foe', 0, 1);
  step(w, c, [dep('far', 1, 4), dep('fly', 1, 3), dep('lift', 1, 2), dep('cam', 1, 1), dep('hide', 1, 0), dep('nap', 0, 2), dep('ghost', 0, 3)]);
  /** @param {string} key @param {Record<string, boolean>} flags */
  const mark = (key, flags) => buffs.addBuff(unit(w, key), buffs.makeBuff({ key: 'mark', flags }));
  mark('lift', { liftoff: true });
  mark('cam', { camou: true });
  mark('hide', { stealth: true });
  mark('nap', { sleep: true });
  mark('ghost', { untargetable: true });
  status.applyStatus(unit(w, HEAD), 'root', {});
  return { c, w };
}

test('[敌能-49] 祈祷邀约: operators and our devices, not flyers, stealth, sleep, untargetable, neutrals or hostile devices', () => {
  const { c, w } = inviteWorld();
  run(w, c, 3);
  /** @param {string} key */
  const aspd = (key) => attrs.statsOf(unit(w, key)).aspd;
  assert.equal(aspd('far'), 70);
  assert.equal(aspd('lift'), 70);
  assert.equal(aspd('cam'), 70);
  assert.equal(aspd('fly'), 100);
  assert.equal(aspd('hide'), 100);
  assert.equal(aspd('nap'), 100);
  assert.equal(aspd('ghost'), 100);
  assert.equal(aspd('ours'), 70);
  assert.equal(aspd('foe'), 100);
  assert.equal(aspd('citizen'), 100);
  const invited = buff(unit(w, 'far'), 'invited');
  assert.ok(invited);
  assert.equal(invited.mods.aspd, -30);
  assert.equal(invited.left, 30);
  assert.equal(unit(w, 'far').buffs.filter((b) => b.key === 'invited').length, 1);
});

/** Two roar casters. `a` is ready at once, `b` after 0.5s; each effect lasts 1s. @param {string} key @param {number} init */
function roarUnit(key, init) {
  return { name: key, maxHp: 1000, atk: 0, def: 0, res: 0, moveSpeed: 0.4, motion: 'FLY', applyWay: 'NONE', rangeRadius: -1,
    skills: [{ key: 'Roar', initCooldown: init, cooldown: 2, sp: 0, bb: { duration: 1, attack_speed: -30, air: 0, camou: 1 } }] };
}

test('[敌能-49] 受邀祈祷 refreshes instead of stacking, and this caster\'s cooldown starts when its own effect ends', () => {
  const c = /** @type {any} */ (tinyContent());
  c.level.routes[0].motion = 'FLY';
  c.level.options.initialCost = 99;
  c.operators.guard.cost = 0;
  c.enemies = { a: roarUnit('a', 0), b: roarUnit('b', 0.5) };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, 'a'), spawnAt(0, 'b')])];
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [dep('guard', 1, 3)]);
  const a = unit(w, 'a'), b = unit(w, 'b'), g = unit(w, 'guard');
  status.applyStatus(a, 'root', {});
  status.applyStatus(b, 'root', {});
  assert.equal(a.ab['Roar.cd'] ?? 0, 0, 'not started at the cast');
  assert.equal(attrs.statsOf(g).aspd, 70);
  run(w, c, 15);
  assert.equal(buff(g, 'invited')?.left, 30);
  assert.equal(g.buffs.filter((x) => x.key === 'invited').length, 1);
  assert.equal(attrs.statsOf(g).aspd, 70);
  run(w, c, 15);
  assert.equal(a.ab['Roar.cd'], 59);
  assert.ok(buff(g, 'invited'));
  assert.equal(b.ab['Roar.cd'] ?? 0, 0);
});

test('[敌能-49] 祈祷邀约 casts with no target and while blocked; silence blocks the cast, not the cooldown that follows', () => {
  const lonely = open(HEAD, headSkill(0, 1, 0.2));
  step(lonely.w, lonely.c);
  const e = unit(lonely.w, HEAD);
  assert.equal(e.ab['Roar.left'], 6);
  assert.equal(lonely.w.units.some((u) => buff(u, 'invited')), false);
  status.applyStatus(e, 'silence', {});
  run(lonely.w, lonely.c, 6);
  assert.equal(e.ab['Roar.cd'], 29, 'the 1s cooldown starts as the 0.2s ends, silence or not');

  const blocked = open(HEAD, headSkill(0.1, 1, 0.2));
  blocked.c.operators.guard.cost = 0;
  step(blocked.w, blocked.c, [dep('guard', 1, 0)]);
  const h = unit(blocked.w, HEAD), holder = unit(blocked.w, 'guard');
  assert.equal(blocking.blockBy(blocked.w, h, holder), true);
  run(blocked.w, blocked.c, 3);
  assert.ok((h.ab['Roar.left'] ?? 0) > 0);
  assert.equal(h.blockedBy, holder.id);

  const quiet = open(HEAD, headSkill(0.1, 1, 0.2));
  step(quiet.w, quiet.c);
  const q = unit(quiet.w, HEAD);
  status.applyStatus(q, 'silence', {});
  run(quiet.w, quiet.c, 3);
  assert.equal(q.ab['Roar.left'] ?? 0, 0);
  buffs.removeBuff(q, 'silence');
  step(quiet.w, quiet.c);
  assert.ok((q.ab['Roar.left'] ?? 0) > 0);
});

test('[敌能-49] 昂首\'s 20s, 15s and 40s: the cooldown starts the frame the 15s ends', () => {
  const { c, w } = open(HEAD, headDef());
  step(w, c);
  const e = unit(w, HEAD);
  status.applyStatus(e, 'root', {});
  run(w, c, 599);
  assert.equal(e.ab['Roar.left'] ?? 0, 0);
  step(w, c);
  assert.equal(e.ab['Roar.left'], 450);
  assert.equal(e.ab['Roar.cd'] ?? 0, 0);
  run(w, c, 449);
  assert.equal(e.ab['Roar.left'], 1);
  step(w, c);
  assert.equal(e.ab['Roar.left'], 0);
  assert.equal(e.ab['Roar.cd'], 1199);
});

test('[敌能-49] a same-named ability without the page\'s numbers does not fear, steal or roar', () => {
  const key = 'enemy_10084_hlegle_2';
  const c = /** @type {any} */ (tinyContent());
  c.level.options.initialCost = 99;
  c.operators.guard.cost = 0;
  c.operators.guard.skill = { ...ammoSkill, bb: { cnt: 3 } };
  c.enemies = { [key]: { name: key, maxHp: 2000, atk: 1000, def: 0, res: 0, moveSpeed: 1, motion: 'FLY', applyWay: 'RANGED', rangeRadius: 1.3, baseAttackTime: 3,
    talents: { SelfFear: { ...fearBb }, DamageOrBullet: { 'attack@minus_bullet': 1 } },
    skills: [{ key: 'Roar', initCooldown: 0, cooldown: 40, sp: 0, bb: { duration: 15, attack_speed: -30 } }] } };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, key)])];
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [dep('guard', 1, 2)]);
  const e = unit(w, key), g = unit(w, 'guard');
  skills.activate(w, c, g);
  e.x = 3; e.y = 1;
  e.hp = 100;
  status.applyStatus(e, 'root', {});
  const hp = g.hp;
  assert.ok(until(w, c, () => g.hp !== hp) > 0);
  assert.ok(hp - g.hp > 0);
  assert.equal(g.skill?.ammo, 3);
  assert.equal(buff(e, 'fear'), undefined);
  assert.equal(buff(g, 'invited'), undefined);
  assert.equal(e.ab['Roar.left'] ?? 0, 0);
});
