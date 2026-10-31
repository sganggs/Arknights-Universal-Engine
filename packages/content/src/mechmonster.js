// 「巨大的丑东西」 (docs/spec/foes.md 敌能-124, 敌能-125). Its first form (敌能-124): blocked, a melee hit at the data's
// `attack@mcmstr_rage_attack.atk_scale`; not blocked, an attack on one ground unit of ours within the page's radius
// (2.5, a content extra) that hits the target's 3×3 at 100% (敌能-26). The talent name `combat` is shared — 敌能-38's
// element hit lives on it too (elementhit.js) — so only this shape is this attack.

import { constants } from '@aue/sim';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext @typedef {import('@aue/sim').skills.AttackMods} AttackMods @typedef {import('@aue/sim').Unit} Unit */

/** The blocked melee's 攻击力倍率, in the data. */
const RAGE = 'attack@mcmstr_rage_attack.atk_scale';

/** 丑东西's `combat` (敌能-124): exactly the data's scale and the page's `radius`. @param {Record<string, unknown>} bb */
export const rageShape = (bb) => Object.keys(bb).length === 2 && typeof bb[RAGE] === 'number' && typeof bb.radius === 'number';

/**
 * Its candidates (敌能-124): blocked, the blocker alone, as its data range (0) already gives; not blocked, the units of
 * ours it may select within `radius` + 0.25 (敌人攻击-1). The default selection leaves out flying units; a ground enemy
 * does not select 起飞 either (阻挡-2).
 * @param {FoeContext} ctx @param {Unit[]} cands @returns {Unit[]}
 */
export function rageTargets(ctx, cands) {
  if (!rageShape(ctx.bb) || ctx.blocked) return cands;
  return ctx.foes(/** @type {number} */ (ctx.bb.radius) + constants.ALLY_COLLIDER_RADIUS).filter((u) => !ctx.stats(u).flags.liftoff);
}

/**
 * Its attack (敌能-124), on its own shape: blocked, × the data's scale on the blocker; not blocked, the target's 3×3 at
 * the same 100% — the target normal damage, the others splash, flying ones too (敌能-26). Not a projectile: its
 * applyWay is ALL, and the square lands with the swing (INF-0703).
 * @param {FoeContext} ctx @param {AttackMods} mods @returns {AttackMods}
 */
export function rageAttack(ctx, mods) {
  if (ctx.blocked) return { ...mods, scale: mods.scale * /** @type {number} */ (ctx.bb[RAGE]) };
  return { ...mods, square: true, splashScale: 1 };
}

// Its first knockdown (敌能-125): 敌能-78's rebirth at full HP for `duration` seconds (its `reborn` carries the page
// marker), `bomb[reborning]`'s blast `delay` seconds into it, and once the rebirth is over the 大祭司 form of
// `bird_run`. The delay and the blast radius are the page's.

/** 自爆's numbers (敌能-125): the data's `stun` and `atk_scale`, the page's `delay` and `radius`. */
const BOMB_KEYS = Object.freeze(['stun', 'atk_scale', 'delay', 'radius']);
/** 大祭司形态's numbers (敌能-125): the data's four and the page marker. */
const PRIEST_KEYS = Object.freeze(['move_speed', 'magic_resistance', 'def', 'damage', 'page']);
/** 敌能-18's rebirth buff. */
const REBORN = 'reborn';

/** Exactly these keys, all numbers. @param {Record<string, unknown>} bb @param {readonly string[]} keys */
const exactly = (bb, keys) => Object.keys(bb).length === keys.length && keys.every((k) => typeof bb[k] === 'number');

/**
 * Whether a talent or skill of this name, with this blackboard, is the one this file runs (敌能-124, 敌能-125). Any
 * other name is not this family's concern. `combat` is elementhit.js's, `reborn` helmknights.js's.
 * @param {string} name @param {Record<string, unknown>} bb
 */
export function mechOwns(name, bb) {
  if (name === 'bomb[reborning]') return exactly(bb, BOMB_KEYS);
  if (name === 'bird_run') return exactly(bb, PRIEST_KEYS);
  return true;
}

/** Its rebirth buff, while it is in its rebirth (敌能-18). @param {FoeContext} ctx */
const reviving = (ctx) => ctx.self.buffs.find((b) => b.key === REBORN);

/**
 * `bomb[reborning]` (敌能-125): `delay` seconds after its rebirth began — counted on the rebirth buff, which runs the
 * `reborn` talent's `duration` — one blast of `radius` where it stands, this frame: attack × `atk_scale` physical on
 * our units and neutral ones (敌能-3), flying ones too, and `stun` seconds of 晕眩 (INF-0704). Once. Its own cooldown
 * (9999 s) never fires it.
 * @type {FoeBehavior}
 */
const rebornBomb = Object.freeze({
  tick: (ctx) => {
    const bb = ctx.bb, b = reviving(ctx), rb = ctx.talent('reborn');
    if (!exactly(bb, BOMB_KEYS) || !b || !rb || ctx.state.get('done') === 1) return;
    if (ctx.frames(rb.duration) - b.left < ctx.frames(bb.delay)) return;
    ctx.state.set('done', 1);
    ctx.blast({
      x: ctx.self.x, y: ctx.self.y, radius: bb.radius, delay: 0, air: true, sourced: true,
      type: 'phys', amount: ctx.stats(ctx.self).atk * bb.atk_scale, status: { key: 'stun', seconds: bb.stun },
    });
  },
});

/** The 大祭司's loss (敌能-125): each second from the form, `damage` sourceless true damage on itself. @param {FoeContext} ctx */
function burn(ctx) {
  const st = ctx.state;
  if (ctx.frame < st.get('next')) return;
  st.set('next', ctx.frame + ctx.frames(1));
  ctx.dealDamage(ctx.self, { type: 'true', amount: ctx.bb.damage, sourceless: true });
}

/**
 * `bird_run` (敌能-125): the frame its rebirth buff has run out, the 大祭司 form for good — DEF + `def`, RES +
 * `magic_resistance`, move speed + `move_speed` (直接加算), no attack, unblockable, its block let go (INF-0705) — and
 * from a second later each second `damage` sourceless true damage on itself.
 * @type {FoeBehavior}
 */
const priestForm = Object.freeze({
  tick: (ctx) => {
    const bb = ctx.bb, st = ctx.state;
    if (!exactly(bb, PRIEST_KEYS)) return;
    if (st.get('form') === 1) { burn(ctx); return; }
    if (reviving(ctx)) { st.set('seen', 1); return; }
    if (st.get('seen') !== 1) return;
    st.set('form', 1);
    st.set('next', ctx.frame + ctx.frames(1));
    ctx.release();
    ctx.addBuff(ctx.self, { key: 'priest', mods: { defFlat: bb.def, resFlat: bb.magic_resistance, moveFlat: bb.move_speed }, flags: { noAttack: true, unblockable: true } });
  },
});

/** The behaviours of this file, by talent or skill name. @type {Readonly<Record<string, FoeBehavior>>} */
export const mechBehaviors = Object.freeze({ 'bomb[reborning]': rebornBomb, bird_run: priestForm });
