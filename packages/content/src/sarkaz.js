// The Sarkaz (docs/spec/foes.md 敌能-28, 敌能-29, 敌能-32): the 重生造物 that shrug off damage and make their blockers
// hold more, the supply carts and the 集恨者 that feed on them, the 死亡之眼, the sentries' alarm and the mercenaries
// standing by until it. The royal guards' attack element is 敌能-38 (elementhit.js); 死亡之眼 stays 凋亡 here.
// They act only through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext @typedef {import('@aue/sim').Unit} Unit */

/** 凋亡损伤 (元素-1). */
const NECROSIS = 'DARK';

/** Whether an enemy is a 重生造物 (敌能-28): it has the `Creation` talent. @param {FoeContext} ctx @param {Unit} u */
const creation = (ctx, u) => ctx.talentOf(u, 'Creation') !== null;

/** 重生造物 (敌能-28): the physical and arts damage it takes × (1 − `damage_resistance`). @type {FoeBehavior} */
const dmg_res = Object.freeze({
  spawn: (ctx) => {
    const k = 1 - ctx.bb.damage_resistance;
    ctx.setBuff(ctx.self, 'dmg_res', 0, { physTakenMul: k, artsTakenMul: k });
  },
});

/**
 * 重生造物 (敌能-28): the unit blocking it has 阻挡数 + `block_cnt` while it does — at most `max_valid_stack_cnt` such
 * effects on one unit.
 * @type {FoeBehavior}
 */
const buff_to_blocker = Object.freeze({
  tick: (ctx) => {
    const b = ctx.blocker(), key = `blockUp:${ctx.self.id}`;
    if (!b) return;
    const others = b.buffs.filter((x) => x.key.startsWith('blockUp:') && x.key !== key).length;
    if (others < ctx.bb.max_valid_stack_cnt) ctx.lend(b, key, { mods: { blockCnt: ctx.bb.block_cnt } });
  },
});

/** A blackboard value by the end of its key (the data writes a supply cart's as `<buff>[attr_buff].atk`). @param {Record<string, number>} bb @param {string} end */
const byEnd = (bb, end) => Object.entries(bb).find(([k]) => k === end || k.endsWith(`.${end}`))?.[1] ?? 0;

/**
 * 补给 and 集恨 (敌能-28), by the blackboard. A supply cart (`ep_damage_ratio`), not silenced: every 重生造物 on the field
 * has 攻击力 + `atk` (直接乘算) while it is there — at most `max_valid_stack_cnt` carts of one kind at once — and adds
 * `ep_damage_ratio` of its 攻击力 as 凋亡损伤 to its attacks, once for each kind of cart. A 集恨者: 攻击力 + `atk` for each
 * 重生造物 on the field, at most `max_valid_stack_cnt` of them.
 * @type {FoeBehavior}
 */
const aura = Object.freeze({
  tick: (ctx) => {
    const bb = ctx.bb, atk = byEnd(bb, 'atk'), most = byEnd(bb, 'max_valid_stack_cnt');
    if (bb.ep_damage_ratio === undefined) {
      const n = Math.min(most, ctx.enemies().filter((u) => creation(ctx, u)).length);
      ctx.setBuff(ctx.self, 'aura', n, { atkPct: atk * n });
      return;
    }
    if (ctx.stats(ctx.self).flags.silence) return;
    const kind = `supply:${ctx.self.key}:`, key = `${kind}${ctx.self.id}`;
    for (const u of ctx.enemies()) {
      if (!creation(ctx, u) || u.buffs.filter((x) => x.key.startsWith(kind) && x.key !== key).length >= most) continue;
      ctx.lend(u, key, { mods: { atkPct: atk }, value: bb.ep_damage_ratio });
    }
  },
});

/**
 * A 重生造物's attacks under supply (敌能-28): 凋亡损伤 of its 攻击力 × the sum of the shares of the kinds of cart
 * supplying it.
 * @type {FoeBehavior}
 */
const Creation = Object.freeze({
  attack: (ctx, mods) => {
    /** @type {Map<string, number>} */
    const kinds = new Map();
    for (const b of ctx.self.buffs) if (b.key.startsWith('supply:')) kinds.set(b.key.split(':')[1], b.value);
    const share = [...kinds.values()].reduce((a, v) => a + v, 0);
    return share > 0 ? { ...mods, element: NECROSIS, ep: ctx.stats(ctx.self).atk * share } : mods;
  },
});

/**
 * 死亡之眼 (敌能-29): ready, able to act and not silenced, with a unit it may attack in reach, it channels on the first
 * one for `hit_duration` seconds — standing, no normal attacks, 沉默反制 (silence cleared and kept off) — dealing
 * `atk_scale` of its 攻击力 as arts damage each second; at the end the target and the units on the four tiles next to it
 * take `ep_damage_ratio` of it as 凋亡损伤. The target gone or the enemy unable to act, the channel stops.
 * @type {FoeBehavior}
 */
const DeathEye = Object.freeze({
  tick: (ctx) => {
    if (ctx.state.get('left') > 0) { channel(ctx); return; }
    const s = ctx.stats(ctx.self);
    if (!ctx.ready || s.disabled || s.flags.silence) return;
    const [t] = ctx.order(ctx.foes(ctx.self.base.rangeRadius + 0.25));
    if (!t) return;
    ctx.use();
    ctx.state.set('target', t.id);
    ctx.state.set('left', ctx.frames(ctx.bb.hit_duration));
    ctx.state.set('t', 0);
    ctx.removeBuff(ctx.self, 'silence');
    ctx.addBuff(ctx.self, { key: 'deathEye', flags: { 'immune:silence': true, root: true, noAttack: true } });
  },
});

/** One frame of 死亡之眼's channel (敌能-29). @param {FoeContext} ctx */
function channel(ctx) {
  const st = ctx.state, self = ctx.self, t = ctx.foes(Infinity).find((u) => u.id === st.get('target'));
  if (!t || ctx.stats(self).disabled) { stopChannel(ctx); return; }
  const left = st.get('left') - 1, n = st.get('t') + 1, atk = ctx.stats(self).atk;
  st.set('left', left);
  st.set('t', n);
  if (n % ctx.frames(1) === 0) ctx.dealDamage(t, { type: 'arts', amount: atk * ctx.bb.atk_scale });
  if (left > 0) return;
  for (const u of ctx.around(t, 'cross')) ctx.dealEp(u, NECROSIS, atk * ctx.bb.ep_damage_ratio);
  stopChannel(ctx);
}

/** 死亡之眼's channel over (敌能-29). @param {FoeContext} ctx */
function stopChannel(ctx) {
  ctx.state.set('left', 0);
  ctx.removeBuff(ctx.self, 'deathEye');
}

/** 警戒 (敌能-32): 不死 until its alarm is raised. @type {FoeBehavior} */
const warn = Object.freeze({
  spawn: (ctx) => { ctx.addBuff(ctx.self, { key: 'warn', flags: { undying: true } }); },
});

/** How often a sentry looks at its HP (敌能-32), in seconds. */
const LOOK = 0.2;

/**
 * 警报 (敌能-32): every 0.2 s the sentry looks at its HP; once it is below `warn`'s `hp_ratio` of its maximum, as soon as
 * the skill is ready and the sentry can act and is not silenced, every enemy on the field gets 攻击力 + `atk` and 防御力 +
 * `def` (直接乘算; the strongest alarm counts, for good), the mercenaries standing by (`revive`) take up arms, and its
 * 不死 ends — once.
 * @type {FoeBehavior}
 */
const Awake = Object.freeze({
  tick: (ctx) => {
    const st = ctx.state, self = ctx.self, s = ctx.stats(self);
    if (st.get('done')) return;
    st.set('clock', st.get('clock') + 1);
    if (!st.get('alert') && st.get('clock') % ctx.frames(LOOK) === 0 && self.hp < s.maxHp * (ctx.talent('warn')?.hp_ratio ?? 1)) st.set('alert', 1);
    if (!st.get('alert') || !ctx.ready || s.disabled || s.flags.silence) return;
    st.set('done', 1);
    ctx.use();
    for (const u of ctx.enemies()) {
      if ((ctx.buffValue(u, 'alarm') ?? -1) < ctx.bb.atk) ctx.setBuff(u, 'alarm', ctx.bb.atk, { atkPct: ctx.bb.atk, defPct: ctx.bb.def });
    }
    ctx.removeBuff(self, 'warn');
  },
});

/** A mercenary's 自缚 when its blackboard gives no `unmove_duration` (敌能-32), in seconds. */
const STANDBY_BIND = 150;

/**
 * 待命 and 临战 (敌能-32): it comes in standing by — no normal attacks, and for `unmove_duration` seconds (150 when the
 * data gives none) unable to move —; below `hp_ratio` of its maximum HP, or under a sentry's alarm, it takes up arms
 * for good: 移动速度 + `move_speed` (直接乘算).
 * @type {FoeBehavior}
 */
const revive = Object.freeze({
  spawn: (ctx) => {
    const bind = ctx.bb.unmove_duration ?? STANDBY_BIND;
    ctx.addBuff(ctx.self, { key: 'standby', flags: { noAttack: true } });
    if (bind > 0) ctx.addBuff(ctx.self, { key: 'standby:bind', flags: { root: true }, left: ctx.frames(bind) });
  },
  tick: (ctx) => {
    const self = ctx.self;
    if (ctx.state.get('armed')) return;
    if (self.hp >= ctx.stats(self).maxHp * ctx.bb.hp_ratio && ctx.buffValue(self, 'alarm') === null) return;
    ctx.state.set('armed', 1);
    ctx.removeBuff(self, 'standby');
    ctx.removeBuff(self, 'standby:bind');
    ctx.setBuff(self, 'engaged', 0, { movePct: ctx.bb.move_speed });
  },
});

/** The behaviours of this file, by talent or skill name. @type {Readonly<Record<string, FoeBehavior>>} */
export const sarkazBehaviors = Object.freeze({ dmg_res, buff_to_blocker, aura, Creation, DeathEye, warn, Awake, revive });
