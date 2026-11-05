// 隐匿 that the enemy pages write and the enemy data does not carry (docs/spec/foes.md 敌能-131). FOE_EXTRAS gives those
// enemies `Stealth`, a talent name no enemy in the data uses — as `Static` (敌能-37) and `NoAttack` (敌能-117) —, with
// the page's restore after a block (`restore`, seconds) when it names one; 业余竞演者 is also 孤立 while hidden
// (`alone`). 流泪小子's own talent `Combat` is its attack stun, told from the name's other shapes by the blackboard and the
// page marker. They act only through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext */

/** The 隐匿 source and 业余竞演者's 孤立 (敌能-131): keys no other ability gives, so each is only ever this one's. */
const HIDE = 'lurk', ALONE = 'lurkAlone';

/**
 * 业余竞演者's 孤立 (敌能-131, INF-0781): on while its 隐匿 holds — not blocked, no 反隐 —, off otherwise, looked at on
 * its spawn and each of its turns. AUE's 孤立 is `noAllyHeal`, as 巡游爵士乐手's (敌能-97).
 * @param {FoeContext} ctx
 */
function alone(ctx) {
  const on = !ctx.blocked && !ctx.stats(ctx.self).flags.unstealth, has = ctx.self.buffs.some((b) => b.key === ALONE);
  if (on && !has) ctx.addBuff(ctx.self, { key: ALONE, flags: { noAllyHeal: true } });
  else if (!on && has) ctx.removeBuff(ctx.self, ALONE);
}

/**
 * `Stealth` (敌能-131): a lasting 隐匿 source from spawn (INF-0780). A block lifts it and the release starts 索敌-2's
 * window: `restore` seconds when the page names them, else 索敌-2's 3 s (the pages that write only 「隐匿」). Silence
 * does not touch it: 隐匿 is no 特殊能力.
 * @type {FoeBehavior}
 */
const Stealth = Object.freeze({
  spawn: (ctx) => {
    const r = ctx.bb.restore;
    ctx.addBuff(ctx.self, { key: HIDE, flags: { stealth: true }, ...(typeof r === 'number' ? { restore: ctx.frames(r) } : {}) });
    if (ctx.bb.alone === 1) alone(ctx);
  },
  tick: (ctx) => { if (ctx.bb.alone === 1) alone(ctx); },
});

/** The keys 流泪小子's `Combat` holds (敌能-131): the data's stun seconds and the page marker. */
const STUN_KEYS = new Set(['attack@stun', 'page']);

/**
 * Whether a talent of this name and blackboard is 流泪小子's attack stun (敌能-131): `Combat` with `attack@stun` and no
 * key but the page marker. Any other name passes. The name's other eleven shapes (反装甲步兵's, 裂礁者's …) are not this,
 * and stay uncovered (关卡-2).
 * @param {string} name @param {Record<string, unknown>} bb
 */
export function combatOwns(name, bb) {
  if (name !== 'Combat') return true;
  return typeof bb['attack@stun'] === 'number' && Object.keys(bb).every((k) => STUN_KEYS.has(k));
}

/**
 * The read page's shape (敌能-131): with its marker. The same shape without it (`enemy_2034_sythef_2`, no page read) does
 * nothing. @param {Record<string, unknown>} bb
 */
const armed = (bb) => combatOwns('Combat', bb) && bb.page === 1;

/**
 * 流泪小子's `Combat` (敌能-131, INF-0782): each hit of its normal attack carries `attack@stun` seconds of 晕眩, a status the
 * hit gives a target still up after it (状态-5), dodged or not. A talent: silence does not stop it.
 * @type {FoeBehavior}
 */
const Combat = Object.freeze({
  attack: (ctx, mods) => (armed(ctx.bb) ? { ...mods, hitStatus: { key: 'stun', seconds: ctx.bb['attack@stun'] } } : mods),
});

/** The behaviours of this file, by talent name. @type {Readonly<Record<string, FoeBehavior>>} */
export const stealthBehaviors = Object.freeze({ Stealth, Combat });
