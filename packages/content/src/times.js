// 岁兽残响 (docs/spec/foes.md 敌能-39, 敌能-43, 敌能-44) and the splash shape 热情丰碑 adds (敌能-69): bodies that lose one HP per successful hit, the parents that
// leave them on their own route — 沉沙 / 新硎 with their 断刃 among them —, 烹泉 / 沏虹's radius splash, death blast and
// ASPD debuff, and 清明 / 堂皇's 范围隐匿. They act only through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */
/** @typedef {import('@aue/sim').FoeContext} FoeContext */
/** @typedef {import('@aue/sim').buffs.BuffInit} BuffInit */

/**
 * Which damage types a hit-count body accepts (敌能-43). A blackboard 1 accepts that type. None set accepts every type
 * (敌能-39).
 * @param {Record<string, number>} bb @returns {Record<string, boolean>}
 */
function typeFlags(bb) {
  /** @type {Record<string, boolean>} */
  const flags = {};
  if (bb.phys === 1) flags.hitPhys = true;
  if (bb.arts === 1) flags.hitArts = true;
  if (bb.true === 1) flags.hitTrue = true;
  if (bb.elemental === 1) flags.hitElement = true;
  return flags;
}

/**
 * 特殊生命值 (敌能-39, 敌能-43): from the moment it appears, a successful hit of an accepted type removes 1 HP whatever
 * its size (伤害-9), it cannot be blocked and it makes no normal attacks. The data has no talent for it; the content
 * gives `hitCount`.
 * @type {FoeBehavior}
 */
const hitCount = Object.freeze({
  spawn: (ctx) => {
    ctx.addBuff(ctx.self, { key: 'hitCount', flags: { hitCount: true, noAttack: true, unblockable: true, ...typeFlags(ctx.bb) } });
  },
});

/** The enemy key a blackboard names (the data keeps it as text). @param {Record<string, number>} bb */
const keyIn = (bb) => String(/** @type {unknown} */ (bb.enemy_key) ?? '');

/** The 断刃 it holds (敌能-44): one buff, its value the count, its ATK up while one is left. */
const BLADES = 'blades';

/** Whether this death summon is a blade holder's (敌能-44): its blackboard has `cnt_add`. @param {Record<string, number>} bb */
const holdsBlades = (bb) => typeof bb.cnt_add === 'number';

/** ATK while it holds a blade (敌能-44): 沉沙's talent is spelled `Atkup`, 新硎's `AtkUp`. @param {FoeContext} ctx */
const bladeAtk = (ctx) => ({ atkPct: ctx.talent('Atkup')?.atk ?? ctx.talent('AtkUp')?.atk ?? 0 });

/**
 * A hit spends one blade (敌能-44); the last one takes the ATK with it and asks for the next attack at once.
 * @param {FoeContext} ctx
 */
function spendBlade(ctx) {
  const left = ctx.buffValue(ctx.self, BLADES) ?? 0;
  if (left <= 0) return;
  ctx.setBuff(ctx.self, BLADES, left - 1, left > 1 ? bladeAtk(ctx) : {});
  if (left === 1) ctx.attackAgain();
}

/**
 * 死亡召唤 (敌能-39, 敌能-44): knocked down — not by a fall when `fall` is 0 — after one shared draw of [0, 0.7)
 * seconds, `cnt` enemies of `enemy_key` (one by default) appear in the square of side 1 centred on it (offset up to
 * 0.5), on its route (敌能-22). A blade holder (`cnt_add`) starts with `cnt` blades, spends one on each hit and leaves
 * as many as it has left, at least one. The pages do not say the talent can be silenced.
 * @type {FoeBehavior}
 */
const DeadSpawn = Object.freeze({
  spawn: (ctx) => { if (holdsBlades(ctx.bb)) ctx.setBuff(ctx.self, BLADES, ctx.bb.cnt ?? 0, bladeAtk(ctx)); },
  hit: (ctx) => { if (holdsBlades(ctx.bb)) spendBlade(ctx); },
  death: (ctx) => {
    const bb = ctx.bb;
    if (bb.fall === 0 && ctx.fell) return;
    const key = keyIn(bb);
    if (!key) return;
    const cnt = holdsBlades(bb) ? Math.max(1, ctx.buffValue(ctx.self, BLADES) ?? 0) : bb.cnt ?? 1;
    ctx.summon(key, { cnt, delay: ctx.draw() * 0.7, bound: 0.5 });
  },
});

/**
 * The death debuff (敌能-43): ASPD `attack_speed` for `duration` seconds, resistible, each layer on its own, no cap. The
 * data's `interval` and `attack_speed_add` (固定每 3 秒额外 −0) add nothing and are not modelled.
 * @param {import('@aue/sim').foes.FoeContext} ctx @param {Record<string, number>} bb @returns {BuffInit}
 */
function brewOf(ctx, bb) {
  return {
    key: 'pengquan', rule: 'independent', maxStacks: Number.MAX_SAFE_INTEGER, resist: true,
    left: ctx.frames(bb.duration), mods: { aspd: bb.attack_speed ?? 0 },
  };
}

/**
 * 死亡爆炸 (敌能-43): knocked down and not silenced, an arts blast of `atk_scale` × attack at its position (敌能-3), and
 * the debuff on whoever it hits. Silence drops both. A fall still explodes; the summon's fall rule is DeadSpawn's.
 * @type {FoeBehavior}
 */
const DeadBoom = Object.freeze({
  death: (ctx) => {
    const bb = ctx.bb, s = ctx.stats(ctx.self);
    if (s.flags.silence || typeof bb.radius !== 'number' || typeof bb.delay !== 'number' || typeof bb.duration !== 'number') return;
    ctx.blast({
      x: ctx.self.x, y: ctx.self.y, radius: bb.radius, delay: bb.delay, air: bb.air === 1, sourced: true,
      type: 'arts', amount: s.atk * (typeof bb.atk_scale === 'number' ? bb.atk_scale : 1), buff: brewOf(ctx, bb),
    });
  },
});

/**
 * The normal attack's radius splash (敌能-43, 敌能-69): arts, full amount, on the projectile (攻击-3). `air` 1 is
 * 热情丰碑: the page does not say 无视迷彩, and the header tooltip says an attack may hit the air, so no seeCamou and
 * not ground-only. 烹泉 / 沏虹 have no `air`, so they still ignore camouflage and stay ground-only. An enemy selects
 * nothing in the air already (索敌-2).
 * @type {FoeBehavior}
 */
const Splash = Object.freeze({
  spawn: (ctx) => {
    if (ctx.bb.air === 1) return;
    ctx.addBuff(ctx.self, { key: 'seeCamou', flags: { seeCamou: true } });
  },
  attack: (ctx, mods) => (typeof ctx.bb.radius !== 'number' ? mods : {
    ...mods, type: 'arts', splash: { radius: ctx.bb.radius, scale: 1, ground: ctx.bb.air !== 1, side: 'friendly' },
  }),
});

/** 范围隐匿's radius, the page's 2.0 (敌能-44). */
const FIELD_R = 2;

/**
 * Lends 隐匿 to the other enemies within the radius, selectable or not, while it has not vanished (敌能-44, 敌能-25). A
 * blocked one holds it without effect and has it back the moment it is released (`restore` 0, 索敌-2).
 * @param {FoeContext} ctx
 */
function lendField(ctx) {
  if (ctx.self.hidden) return;
  for (const u of ctx.allies(FIELD_R)) if (u !== ctx.self) ctx.lend(u, 'rangeHide', { flags: { stealth: true }, restore: 0 });
}

/**
 * One frame of a field that is up (敌能-44). The frame its time runs out it ends and the skill's cooldown starts — unless
 * it has vanished: then the field stays for good.
 * @param {FoeContext} ctx
 */
function keepField(ctx) {
  const st = ctx.state;
  if (st.get('forever') !== 1) {
    st.set('left', st.get('left') - 1);
    if (st.get('left') <= 0 && ctx.self.hidden) st.set('forever', 1);
    else if (st.get('left') <= 0) { st.set('on', 0); ctx.use(); return; }
  }
  lendField(ctx);
}

/**
 * 范围隐匿 (技能 `InvisibleShield`, 敌能-44): ready and able to act — silence does not stop it — the field is up for the
 * talent of the same name's `duration` seconds. The talent shares the name and its state, so only the skill, which the
 * content marks `cast`, runs it.
 * @type {FoeBehavior}
 */
const InvisibleShield = Object.freeze({
  tick: (ctx) => {
    if (ctx.bb.cast !== 1) return;
    if (ctx.state.get('on') === 1) { keepField(ctx); return; }
    if (!ctx.ready || ctx.stats(ctx.self).disabled) return;
    ctx.state.set('on', 1);
    ctx.state.set('left', ctx.frames(ctx.talent('InvisibleShield')?.duration ?? 0));
    lendField(ctx);
  },
});

/** The behaviours of this file, by talent or skill name; `Atkup` (沉沙) is read by DeadSpawn. @type {Readonly<Record<string, FoeBehavior>>} */
export const timeBehaviors = Object.freeze({ hitCount, DeadSpawn, DeadBoom, Splash, Atkup: Object.freeze({}), InvisibleShield });
