// 乌顶巨角卢鲁 and 伊斯贝塔 (docs/spec/foes.md 敌能-114), from a level with 雪崩 — which the engine's levels do not have.
// 卢鲁's skill `skill` (角力对决): blocked, ready, able and not silenced, it charges for `duration` s; not held down at
// the end and still blocked by the same unit, it hits it for `atk_scale_s` × 攻击力 physical; otherwise it is in a
// 角力失败模式 for `data`'s `attack@fail_duration` s (`attack@fail_duration2` when 晕眩 or 沉睡 holds it then), attacking
// to no effect. It does not attack while it charges. 伊斯贝塔 (`data` of its shape) attacks only what blocks it, and its
// hit splashes `attack@atk_scale_2` × 攻击力 physical on each other of ours on the ground within 1.5 of the target;
// `start`, with the page's `rock` marker, is its entrance. It acts only through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext */

/** 伊斯贝塔's splash (敌能-114: 「半径1.5范围内」). */
const SPLASH = 1.5;

/** Whether `bb` has exactly these keys, each a number. @param {Record<string, unknown>} bb @param {readonly string[]} keys */
const exact = (bb, keys) => Object.keys(bb).length === keys.length && keys.every((k) => typeof bb[k] === 'number');

const FAIL = Object.freeze(['attack@fail_duration', 'attack@fail_duration2']);
const ROCK = Object.freeze(['attack@atk_scale', 'attack@atk_scale_2']);

/** Whether a behaviour of this name is this family's, by its shape (关卡-2); any other name passes. @param {string} name @param {Record<string, unknown>} bb */
export function avalancheOwns(name, bb) {
  if (name === 'data') return exact(bb, FAIL) || exact(bb, ROCK);
  if (name === 'skill') return exact(bb, ['duration', 'atk_scale_s']);
  if (name === 'start') return Object.keys(bb).length === 1 && bb.rock === 1;
  return true;
}

/** Held down: 晕眩, 冻结, 沉睡, unable to act, or in 失衡 (敌能-114). @param {FoeContext} ctx */
const held = (ctx) => { const s = ctx.stats(ctx.self), f = s.flags; return s.disabled || f.stun || f.freeze || f.sleep || ctx.unbalanced; };

/** The charge's end (敌能-114): the hit, or the 角力失败模式. @param {FoeContext} ctx */
function settle(ctx) {
  const st = ctx.state, b = ctx.blocker(), fail = ctx.talent('data');
  st.set('due', 0);
  if (st.get('broke') !== 1 && b && b.id === st.get('who')) {
    ctx.dealDamage(b, { type: 'phys', amount: ctx.stats(ctx.self).atk * ctx.bb.atk_scale_s });
    return;
  }
  if (!fail || !exact(fail, FAIL)) return;
  const f = ctx.stats(ctx.self).flags, second = f.stun || f.sleep;
  st.set('dull', ctx.frame + ctx.frames(second ? fail['attack@fail_duration2'] : fail['attack@fail_duration']));
}

/** 角力对决 (敌能-114). @type {FoeBehavior} */
const skill = Object.freeze({
  attack: (ctx, mods) => (exact(ctx.bb, ['duration', 'atk_scale_s']) && ctx.frame < ctx.state.get('dull') ? { ...mods, scale: 0 } : mods),
  targets: (ctx, cands) => (exact(ctx.bb, ['duration', 'atk_scale_s']) && ctx.state.get('due') > 0 ? [] : cands),
  tick: (ctx) => {
    const st = ctx.state;
    if (!exact(ctx.bb, ['duration', 'atk_scale_s'])) return;
    if (st.get('due') > 0) {
      if (held(ctx)) st.set('broke', 1);
      if (ctx.frame >= st.get('due')) settle(ctx);
      return;
    }
    const b = ctx.blocker();
    if (!b || !ctx.ready || held(ctx) || ctx.stats(ctx.self).flags.silence || ctx.frame < st.get('dull')) return;
    ctx.use();
    st.set('who', b.id);
    st.set('broke', 0);
    st.set('due', ctx.frame + ctx.frames(ctx.bb.duration));
  },
});

/** 伊斯贝塔's `data` (敌能-114): only what blocks it; its hit splashes. @type {FoeBehavior} */
const data = Object.freeze({
  targets: (ctx, cands) => {
    if (!exact(ctx.bb, ROCK)) return cands;
    const b = ctx.blocker();
    return b ? cands.filter((u) => u.id === b.id) : [];
  },
  hit: (ctx, t) => {
    if (!exact(ctx.bb, ROCK)) return;
    const amount = ctx.stats(ctx.self).atk * ctx.bb['attack@atk_scale_2'];
    for (const u of ctx.ours().filter((x) => x !== t && !ctx.stats(x).flying && (x.x - t.x) * (x.x - t.x) + (x.y - t.y) * (x.y - t.y) <= SPLASH * SPLASH)) {
      ctx.dealDamage(u, { type: 'phys', amount, isSplash: true });
    }
  },
});

/** The behaviours of this file, by name. @type {Readonly<Record<string, FoeBehavior>>} */
export const avalancheBehaviors = Object.freeze({ skill, data, start: Object.freeze({}) });
