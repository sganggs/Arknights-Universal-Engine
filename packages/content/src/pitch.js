// 阵地足球's pitch (docs/spec/football.md 足球-13, 足球-14): `aura` of `block_cnt`, `sp` and `value` is a 守门位's — the
// block it gives one of ours on its tile — read here, so that `aura` is not 敌能-28's supply cart; and the ball card, a
// level token whose device brings a caught ball back on our half.
import { sarkazBehaviors } from './sarkaz.js';
import { danceAura, danceTick } from './carnival.js';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').OperatorDef} OperatorDef @typedef {import('@aue/sim').DeviceDef} DeviceDef */

/** Whether an `aura` blackboard is a 守门位's (足球-13): `block_cnt` with `sp` and `value`. @param {Record<string, unknown>} bb */
export const spotAura = (bb) => typeof bb.block_cnt === 'number' && 'sp' in bb && 'value' in bb && Object.keys(bb).length === 3;

/**
 * `aura` by its shape (足球-13, 敌能-98, 敌能-28): a 守门位's makes the enemy one at its spawn; 领舞者's is its 初始模式
 * beat; any other is 敌能-28's.
 * @type {FoeBehavior}
 */
const aura = Object.freeze({
  ...sarkazBehaviors.aura,
  tick: (ctx) => { if (danceAura(ctx.bb)) danceTick(ctx, 0); else sarkazBehaviors.aura.tick?.(ctx); },
  spawn: (ctx) => {
    if (spotAura(ctx.bb)) ctx.goalSpot(/** @type {number} */ (ctx.bb.block_cnt));
    else sarkazBehaviors.aura.spawn?.(ctx);
  },
});

/** The behaviours of this file, by talent name. @type {Readonly<Record<string, FoeBehavior>>} */
export const pitchBehaviors = Object.freeze({ aura });

/**
 * A ball card (足球-14) from its device record: melee, free, never attacking, at the record's cost; no unit of its own.
 * @param {string} key @param {DeviceDef} d @returns {OperatorDef}
 */
function ballCardDef(key, d) {
  return {
    name: d.name, position: 'MELEE', cost: d.cost ?? 0, blockCnt: 0, baseAttackTime: d.baseAttackTime, maxHp: d.maxHp, atk: d.atk, def: d.def, res: d.res,
    aspd: d.aspd, tauntLevel: d.tauntLevel, massLevel: d.massLevel, range: [], profession: 'TRAP', trait: { free: true, noAttack: true }, respawnTime: 0, char: key,
    ballCard: true,
  };
}

/**
 * Every seat's ball card (足球-14): for each level token whose device profile is one, a record keyed "id#seat" in the
 * operators and that seat's deck.
 * @param {import('@aue/sim').Content['level']} level @param {Record<string, DeviceDef>} devices
 * @param {Record<string, OperatorDef>} operators changed in place @param {string[][]} decks changed in place
 */
export function withBallCards(level, devices, operators, decks) {
  const tokens = (level.cards?.tokens ?? []).filter((t) => devices[t.key]?.ballCard);
  decks.forEach((deck, seat) => {
    for (const t of tokens) {
      const id = `${t.key}#${seat}`;
      operators[id] = ballCardDef(t.key, devices[t.key]);
      deck.push(id);
    }
  });
}
