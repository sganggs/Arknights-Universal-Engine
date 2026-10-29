// “与我无关” (docs/spec/foes.md 敌能-111): not blocked and never attacking; after each turn it was hurt, its
// 已损失生命值判定 at `FireBottleTrigger`'s `hp_ratio` (敌能-89); passed, the skill `FireBottle` is forced: a 燃烧区域 of
// the page's `radius` on its spot that for an hour deals `damage` sourceless true damage each second to each of ours in
// it, with no 受击回复, every zone on its own. It acts only through the context (ADR 0055).
import { lostLifePassed } from './lostlife.js';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */

/** The zone's life (敌能-111: 「实际只能生效3600秒」), seconds. */
const LIFE_S = 3600;

/** Whether `bb` has exactly these keys, each a number. @param {Record<string, unknown>} bb @param {readonly string[]} keys */
const exact = (bb, keys) => Object.keys(bb).length === keys.length && keys.every((k) => typeof bb[k] === 'number');

/** Whether a behaviour of this name is this family's, by its shape (关卡-2); any other name passes. @param {string} name @param {Record<string, unknown>} bb */
export function bottleOwns(name, bb) {
  if (name === 'FireBottleTrigger') return exact(bb, ['hp_ratio']);
  if (name === 'FireBottle') return exact(bb, ['damage', 'radius']);
  return true;
}

/** `FireBottleTrigger` (敌能-111). @type {FoeBehavior} */
const FireBottleTrigger = Object.freeze({
  spawn: (ctx) => { if (exact(ctx.bb, ['hp_ratio'])) ctx.addBuff(ctx.self, { key: 'bottleMan', flags: { unblockable: true, noAttack: true } }); },
  tick: (ctx) => {
    const bottle = ctx.skillBb('FireBottle'), self = ctx.self;
    if (!exact(ctx.bb, ['hp_ratio']) || !bottle || !exact(bottle, ['damage', 'radius']) || !ctx.hurt || !lostLifePassed(ctx, ctx.bb.hp_ratio)) return;
    ctx.zone({ x: self.x, y: self.y, radius: bottle.radius, life: LIFE_S, low: 0, high: 0, air: true, open: true, pure: bottle.damage });
  },
});

/** The behaviours of this file, by name; `FireBottle` holds the numbers `FireBottleTrigger` reads. @type {Readonly<Record<string, FoeBehavior>>} */
export const bottleBehaviors = Object.freeze({ FireBottleTrigger, FireBottle: Object.freeze({}) });
