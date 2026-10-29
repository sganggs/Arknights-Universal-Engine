// 狂欢游行 (docs/spec/foes.md 敌能-97…敌能-100). 巡游爵士乐手 (`fire`) and 热烈舞团领舞者 (`aura`, `aura2`) are 隐匿 —
// back at once when no longer blocked — and look every 0.3 s which mode they are in: 初始模式 while the 隐匿 holds, with
// 孤立, 反击模式 otherwise. “美食速递” and “醉后狂欢” take 90% less physical and arts damage and 3 blocks
// (`act38side_scale`, the blocks and “美食速递”'s ram from their pages); “醉后狂欢” throws beer (`bigAttack`). 巡游气球's
// `heal` heals a 烟花发射器. 狂欢时刻, “狂欢之主”, 烟花发射器 and 引线火焰 are not in the engine's levels: what only
// they take part in does nothing. It acts only through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext @typedef {import('@aue/sim').Unit} Unit */

/** The 隐匿 and the 孤立 it brings while it holds (敌能-97). */
const HIDE = 'carnivalHide', ALONE = 'carnivalAlone';
/** How often the mode is looked at (敌能-97: 「每0.3秒检测一次」), seconds. */
const CHECK_S = 0.3;
/** 领舞者's beat (敌能-98: 「每秒」), seconds. */
const BEAT_S = 1;
/** “醉后狂欢”'s charge before the beer flies (敌能-99; the page's 「短暂蓄力」 has no number: INF-0668), seconds. */
const CHARGE_S = 1;
/** The beer's splash radius around its target (敌能-99: 「半径1.5范围内」). */
const SPLASH = 1.5;
/** “美食速递”'s ram reach (敌能-99: 「半径0.5范围内」). */
const RAM = 0.5;

/** Whether `bb` has exactly these keys, each a number. @param {Record<string, unknown>} bb @param {readonly string[]} keys */
const exact = (bb, keys) => Object.keys(bb).length === keys.length && keys.every((k) => typeof bb[k] === 'number');

const SAX = Object.freeze(['atk_scale', 'enemy_cnvsax[cd].duration', 'enemy_cnvsax[cd].cooldown', 'ep_damage_ratio', 'hit_interval', 'enemy_cnvsax[cd].interval']);
/** 巡游爵士乐手's `fire` (敌能-97). @param {Record<string, unknown>} bb */
const saxShape = (bb) => exact(bb, SAX);
/** 领舞者's `aura` and `aura2` (敌能-98). @param {Record<string, unknown>} bb */
export const danceAura = (bb) => exact(bb, ['range_radius', 'atk_scale', 'ep_damage_ratio']);
/** `act38side_scale` with the page's blocks and ram (敌能-99). @param {Record<string, unknown>} bb */
const sideShape = (bb) => exact(bb, ['damage_resistance', 'block', 'ram']);
/** “醉后狂欢”'s `bigAttack` (敌能-99). @param {Record<string, unknown>} bb */
const beerShape = (bb) => exact(bb, ['block_cnt', 'duration', 'sp', 'cd']);
/** 巡游气球's `heal` (敌能-100). @param {Record<string, unknown>} bb */
const balloonShape = (bb) => exact(bb, ['hp_ratio']);

/** Whether a behaviour of this name is this family's, by its shape (关卡-2); any other name passes. @param {string} name @param {Record<string, unknown>} bb */
export function carnivalOwns(name, bb) {
  if (name === 'fire') return saxShape(bb);
  if (name === 'aura2') return danceAura(bb);
  if (name === 'act38side_scale') return sideShape(bb);
  if (name === 'bigAttack') return beerShape(bb);
  if (name === 'heal') return balloonShape(bb);
  return true;
}

/** Its 隐匿 from spawn, back at once when the block ends (敌能-97, 索敌-2). @param {FoeContext} ctx */
const hide = (ctx) => ctx.addBuff(ctx.self, { key: HIDE, flags: { stealth: true }, restore: 0 });

/**
 * The mode it is in (敌能-97): looked at every 0.3 s — 0 初始模式 while its 隐匿 holds (not blocked, nothing 反隐), with
 * 孤立; 1 反击模式 otherwise. @param {FoeContext} ctx
 */
function mode(ctx) {
  const st = ctx.state;
  if (ctx.frame < st.get('check')) return st.get('mode');
  st.set('check', ctx.frame + ctx.frames(CHECK_S));
  const m = ctx.blocked || ctx.stats(ctx.self).flags.unstealth ? 1 : 0, alone = ctx.self.buffs.some((b) => b.key === ALONE);
  st.set('mode', m);
  if (m === 0 && !alone) ctx.addBuff(ctx.self, { key: ALONE, flags: { noAllyHeal: true } });
  else if (m === 1 && alone) ctx.removeBuff(ctx.self, ALONE);
  return m;
}

/** Whether it may act now: able and not silenced. @param {FoeContext} ctx */
const able = (ctx) => { const s = ctx.stats(ctx.self); return !s.disabled && !s.flags.silence; };

/** A 演奏 hit on the target it locked (敌能-97): arts at `atk_scale`, then 灼燃损伤 at `ep_damage_ratio`. @param {FoeContext} ctx @param {Unit} t */
function note(ctx, t) {
  const atk = ctx.stats(ctx.self).atk;
  ctx.dealDamage(t, { type: 'arts', amount: atk * ctx.bb.atk_scale, isProjectile: true });
  if (t.hp > 0) ctx.dealEp(t, 'FIRE', atk * ctx.bb.ep_damage_ratio);
}

/**
 * 狂欢式演奏 (敌能-97): in 反击模式, ready, able, with one of ours in its attack range, it locks the first its attack would
 * pick and plays for at most `enemy_cnvsax[cd].duration` s, a note each `hit_interval` s; silenced, unable, or the
 * target gone, the playing ends. @param {FoeContext} ctx @param {number} m
 */
function play(ctx, m) {
  const st = ctx.state, lock = st.get('lock');
  if (lock > 0) {
    const t = ctx.unit(lock - 1);
    if (!t || t.hp <= 0 || !able(ctx) || ctx.frame >= st.get('until')) { st.set('lock', 0); return; }
    if (ctx.frame < st.get('beat')) return;
    st.set('beat', ctx.frame + ctx.frames(ctx.bb.hit_interval));
    note(ctx, t);
    return;
  }
  const t = m === 1 && ctx.ready && able(ctx) ? ctx.order(ctx.foes(ctx.self.base.rangeRadius))[0] : undefined;
  if (!t) return;
  ctx.use();
  st.set('lock', t.id + 1);
  st.set('until', ctx.frame + ctx.frames(ctx.bb['enemy_cnvsax[cd].duration']));
  st.set('beat', ctx.frame + ctx.frames(ctx.bb.hit_interval));
}

/**
 * 巡游爵士乐手 (敌能-97): 隐匿 from spawn; in 初始模式 no normal attack, in 反击模式 only the one blocking it, and none
 * while it plays. @type {FoeBehavior}
 */
const fire = Object.freeze({
  spawn: (ctx) => { if (saxShape(ctx.bb)) hide(ctx); },
  targets: (ctx, cands) => {
    if (!saxShape(ctx.bb)) return cands;
    const b = ctx.blocker();
    return ctx.state.get('mode') === 1 && ctx.state.get('lock') === 0 && b ? cands.filter((u) => u.id === b.id) : [];
  },
  tick: (ctx) => { if (saxShape(ctx.bb)) play(ctx, mode(ctx)); },
});

/**
 * 领舞者's beat (敌能-98): each second from its spawn, in the mode this talent is for, each of ours within
 * `range_radius` takes arts at `atk_scale` and, when it took some, 灼燃损伤 at `ep_damage_ratio`.
 * @param {FoeContext} ctx @param {number} want 0 for `aura` (初始模式), 1 for `aura2` (反击模式)
 */
export function danceTick(ctx, want) {
  const st = ctx.state, m = mode(ctx);
  if (st.get('next') === 0) st.set('next', ctx.frame + ctx.frames(BEAT_S));
  if (ctx.frame < st.get('next')) return;
  st.set('next', ctx.frame + ctx.frames(BEAT_S));
  if (m !== want) return;
  const self = ctx.self, atk = ctx.stats(self).atk, r = ctx.bb.range_radius;
  for (const u of ctx.ours().filter((x) => (x.x - self.x) * (x.x - self.x) + (x.y - self.y) * (x.y - self.y) <= r * r)) {
    if (ctx.dealDamage(u, { type: 'arts', amount: atk * ctx.bb.atk_scale }) > 0 && u.hp > 0) ctx.dealEp(u, 'FIRE', atk * ctx.bb.ep_damage_ratio);
  }
}

/** 领舞者's `aura2` (敌能-98): its 隐匿 from spawn, no normal attack, the 反击模式 beat. @type {FoeBehavior} */
const aura2 = Object.freeze({
  spawn: (ctx) => { if (danceAura(ctx.bb)) hide(ctx); },
  targets: (ctx, cands) => (danceAura(ctx.bb) ? [] : cands),
  tick: (ctx) => { if (danceAura(ctx.bb)) danceTick(ctx, 1); },
});

/**
 * “美食速递”'s ram (敌能-99): moving on its own, each of ours on low ground, not flying, that comes within 0.5 takes its
 * 攻击力 as physical damage, once until it is out of reach again. @param {FoeContext} ctx
 */
function ram(ctx) {
  const st = ctx.state, self = ctx.self, s = ctx.stats(self);
  const moving = !ctx.blocked && !s.immobile && !s.disabled && !ctx.unbalanced;
  const near = moving ? ctx.ours().filter((u) => ctx.onLow(u) && !ctx.stats(u).flying && (u.x - self.x) * (u.x - self.x) + (u.y - self.y) * (u.y - self.y) <= RAM * RAM) : [];
  for (const u of near) {
    const was = st.get(`in${u.id}`) === ctx.frame - 1;
    st.set(`in${u.id}`, ctx.frame);
    if (!was) ctx.dealDamage(u, { type: 'phys', amount: s.atk });
  }
}

/**
 * `act38side_scale` (敌能-99): from spawn physical and arts damage taken × (1 − `damage_resistance`) and `block` blocks
 * taken; with `ram`, the ram. @type {FoeBehavior}
 */
const side = Object.freeze({
  spawn: (ctx) => {
    if (!sideShape(ctx.bb)) return;
    const keep = 1 - ctx.bb.damage_resistance;
    ctx.addBuff(ctx.self, { key: 'carnivalGuard', mods: { physTakenMul: keep, artsTakenMul: keep, blockCnt: ctx.bb.block - ctx.stats(ctx.self).blockCnt } });
  },
  tick: (ctx) => { if (sideShape(ctx.bb) && ctx.bb.ram > 0) ram(ctx); },
});

/**
 * The beer (敌能-99): the target it aimed at, if still on the field, and each of ours on the ground within 1.5 of it
 * take its 攻击力 as physical damage and have one block fewer for `duration` s, not stacking.
 * @param {FoeContext} ctx @param {Unit} t
 */
function beer(ctx, t) {
  const atk = ctx.stats(ctx.self).atk, bb = ctx.bb;
  const hit = [t, ...ctx.ours().filter((u) => u !== t && !ctx.stats(u).flying && (u.x - t.x) * (u.x - t.x) + (u.y - t.y) * (u.y - t.y) <= SPLASH * SPLASH)];
  for (const u of hit) {
    ctx.dealDamage(u, { type: 'phys', amount: atk, isSplash: u !== t });
    ctx.removeBuff(u, 'beerBlock');
    ctx.addBuff(u, { key: 'beerBlock', mods: { blockCnt: bb.block_cnt }, left: ctx.frames(bb.duration) });
  }
}

/**
 * 畅饮时间 (敌能-99): ready, able, with one of ours in its attack range, it aims at the first its attack would pick and
 * charges 1 s; then the beer, if it is still able. Its normal attack is only on the one blocking it, none while it
 * charges. @type {FoeBehavior}
 */
const bigAttack = Object.freeze({
  targets: (ctx, cands) => {
    if (!beerShape(ctx.bb)) return cands;
    const b = ctx.blocker();
    return ctx.state.get('aim') === 0 && b ? cands.filter((u) => u.id === b.id) : [];
  },
  tick: (ctx) => {
    if (!beerShape(ctx.bb)) return;
    const st = ctx.state, aim = st.get('aim');
    if (aim > 0) {
      if (ctx.frame < st.get('due')) return;
      st.set('aim', 0);
      const t = ctx.unit(aim - 1);
      if (t && t.hp > 0 && able(ctx)) beer(ctx, t);
      return;
    }
    const t = ctx.ready && able(ctx) ? ctx.order(ctx.foes(ctx.self.base.rangeRadius))[0] : undefined;
    if (!t) return;
    ctx.use();
    st.set('aim', t.id + 1);
    st.set('due', ctx.frame + ctx.frames(CHARGE_S));
  },
});

/** 巡游气球's `heal` (敌能-100): it heals a 烟花发射器 when knocked down; the engine's levels have none. @type {FoeBehavior} */
const heal = Object.freeze({});

/** The behaviours of this file, by name; `aura` dispatches here by its shape (pitch.js). @type {Readonly<Record<string, FoeBehavior>>} */
export const carnivalBehaviors = Object.freeze({ fire, aura2, 'act38side_scale': side, bigAttack, heal });
