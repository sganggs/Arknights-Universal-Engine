// Field auras while the holder is on the field (docs/spec/foes.md 敌能-74): 术师囚犯's attack speed and
// 梅菲斯特's 生命回复速度. Both reuse the lent buff (敌能-25) and `enemies()`. They act only through the context (ADR 0055).
// `healaura` is also 荷谟伊英雄 and 梅菲斯特，“歌者”, with other blackboards; only `field` 1 is this page.

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext */

/**
 * Whether `healaura` is 梅菲斯特's field aura (敌能-74). Any other name is not this family's concern.
 * `field` 1 is the page marker; the data's ratio alone is 荷谟伊英雄 or the 歌者 and stays uncovered (关卡-2).
 * @param {string} name @param {Record<string, unknown>} bb
 */
export function healAuraOwns(name, bb) {
  if (name !== 'healaura') return true;
  return bb.field === 1 && typeof bb.hp_recovery_per_sec === 'number';
}

/**
 * The highest `atkspeedup` currently on the field (敌能-74): one lent key, so a lower holder must not overwrite it.
 * @param {FoeContext} ctx @param {number} mine
 */
function bestAspd(ctx, mine) {
  let best = mine;
  for (const u of ctx.enemies()) {
    if (u === ctx.self) continue;
    const v = ctx.talentOf(u, 'atkspeedup')?.attack_speed;
    if (typeof v === 'number' && v > best) best = v;
  }
  return best;
}

/**
 * 术师囚犯 / 危险术师囚犯 (敌能-74): every enemy `enemies()` returns gains `attack_speed` attack speed (直接加算),
 * one lent key. Holders below the highest value on the field lend nothing, so two +30 stay +30 and +30 with +50 stays +50.
 * @param {FoeContext} ctx
 */
function aspdAura(ctx) {
  const mine = ctx.bb.attack_speed;
  if (typeof mine !== 'number' || mine !== bestAspd(ctx, mine)) return;
  for (const u of ctx.enemies()) ctx.lend(u, 'atkspeedup', { mods: { aspd: mine } });
}

/** 术师囚犯's attack-speed aura (敌能-74). @type {FoeBehavior} */
const atkspeedup = Object.freeze({ tick: aspdAura });

/**
 * 梅菲斯特 (敌能-74): the same enemies gain `hp_recovery_per_sec` 生命回复速度 (直接乘算). The data stores 1 for +100%.
 * A unit whose 生命回复速度 is 0, with no flat regen, stays at 0. Without the page marker this talent is not his.
 * @param {FoeContext} ctx
 */
function healAura(ctx) {
  const n = ctx.bb.hp_recovery_per_sec;
  // `field` 1 is the page marker (敌能-74). The same check as healAuraOwns; ctx.bb is a number map, so it stays here.
  if (ctx.bb.field !== 1 || typeof n !== 'number') return;
  for (const u of ctx.enemies()) ctx.lend(u, 'healaura', { mods: { hpRegenPct: n } });
}

/** 梅菲斯特's regen aura (敌能-74). @type {FoeBehavior} */
const healaura = Object.freeze({ tick: healAura });

/** The behaviours of this file, by talent name. @type {Readonly<Record<string, FoeBehavior>>} */
export const fieldAuraBehaviors = Object.freeze({ atkspeedup, healaura });
