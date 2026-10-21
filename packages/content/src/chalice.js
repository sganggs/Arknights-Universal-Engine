// Soul chalices (docs/spec/foes.md 敌能-41). While a chalice is not disappeared, one ground enemy in its radius keeps
// damage_scale of a hit (伤判 priority −3000) and the chalice takes the rest as true damage. One chalice per enemy.
import { attrs, damage } from '@aue/sim';

/** @typedef {import('@aue/sim').Unit} Unit */
/** @typedef {import('@aue/sim').FoeContext} FoeContext */
/** @typedef {import('@aue/sim').buffs.TakeHit} TakeHit */

/** Buff key of the lent 伤判, the talent's name, so a second chalice sees the first. */
const KEY = 'takeDmg';
/** Behaviour key. Not the talent name: that key is the enemy ability. */
const ACT = 'chaliceShare';
/** 伤判 priority (伤害-8): after the usual priority-0 effects. */
const PRIO = -3000;
/** A hit whose base amount is at least this is 类斩杀 and is not shared (INF-0333). */
const EXECUTE = 999999;
/** Marks the true-damage share so the same effect does not take it again. */
const SHARE = 'chalice';

/**
 * Ground enemies in range that this chalice may cover. One that already carries the buff from another chalice is left
 * alone (INF-0334): lending again would only refresh that buff and keep its source.
 * @param {FoeContext} ctx @param {number} radius @param {number} scale @returns {Set<number>}
 */
function lendTo(ctx, radius, scale) {
  /** @type {Set<number>} */
  const keep = new Set();
  for (const u of ctx.allies(radius)) {
    if (u === ctx.self || ctx.stats(u).flying) continue;
    const held = u.buffs.find((b) => b.key === KEY);
    if (held && held.src !== ctx.self.id) continue;
    ctx.lend(u, KEY, { act: ACT, prio: PRIO, value: scale });
    keep.add(u.id);
  }
  return keep;
}

/** Drops this chalice's buff on enemies it no longer covers. Removing by key is safe: it never shares the key. @param {FoeContext} ctx @param {Set<number>} keep */
function release(ctx, keep) {
  for (const u of ctx.enemies()) {
    if (keep.has(u.id)) continue;
    const held = u.buffs.find((b) => b.key === KEY);
    if (held && held.src === ctx.self.id) ctx.removeBuff(u, KEY);
  }
}

/** Each turn (敌能-41): lend while this chalice is on the field, and take the buff back the moment it should stop. @param {FoeContext} ctx */
function tick(ctx) {
  const scale = ctx.bb.damage_scale, radius = ctx.bb.range_radius;
  if (typeof scale !== 'number' || typeof radius !== 'number') return;
  release(ctx, ctx.self.hidden ? new Set() : lendTo(ctx, radius, scale));
}

/** @type {import('@aue/sim').FoeBehavior} */
export const takeDmg = Object.freeze({ tick });

/** The chalice's radius, from its talent. Missing data covers nothing. @param {TakeHit['c']} c @param {Unit} owner */
function radiusOf(c, owner) {
  const r = c?.enemies[owner.key]?.talents?.takeDmg?.range_radius;
  return typeof r === 'number' ? r : 0;
}

/** Whether this hit is the share itself. @param {TakeHit} hit */
const shared = (hit) => !!hit.dmg.tags && hit.dmg.tags.includes(SHARE);

/**
 * The chalice that should take this hit, or null when the buff no longer applies (disappeared, dead, out of radius,
 * flying). The two frames a lent buff lingers must not keep reducing damage (敌能-41).
 * @param {import('@aue/sim').World} w @param {Unit} u @param {import('@aue/sim').Buff} b @param {TakeHit} hit
 * @returns {Unit | null}
 */
function coveredBy(w, u, b, hit) {
  const owner = w.units.find((x) => x.id === b.src);
  if (!owner || owner.hp <= 0 || owner.hidden || owner === u || attrs.statsOf(u).flying) return null;
  const r = radiusOf(hit.c, owner), dx = u.x - owner.x, dy = u.y - owner.y;
  return dx * dx + dy * dy <= r * r ? owner : null;
}

/**
 * 伤判 (敌能-41): the covered enemy keeps `damage_scale` of what this effect sees; the rest is true damage on the
 * chalice, from the original hit's source (INF-0335). A base amount of 999999 or more is left untouched (INF-0333).
 * @type {NonNullable<import('@aue/sim').buffs.Behavior['take']>}
 */
function shareTake(w, u, b, amount, hit) {
  if (shared(hit) || hit.dmg.amount >= EXECUTE) return amount;
  const owner = coveredBy(w, u, b, hit);
  if (!owner) return amount;
  const left = amount * b.value, removed = amount - left;
  if (removed > 0) damage.dealDamage(w, hit.credit, owner, { type: 'true', amount: removed, isAttack: false, tags: [SHARE] }, hit.c);
  return left;
}

/** @type {Readonly<Record<string, import('@aue/sim').buffs.Behavior>>} */
export const chaliceBuffs = Object.freeze({ [ACT]: { take: shareTake } });
