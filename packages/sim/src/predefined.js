// Predefined operators (docs/spec/waves.md 波次-7): a level's character instances with a tile and no alias — the
// partner's operators of a training level — stand on the field when they come into effect (波次-6): at their tile,
// facing their way, for the last seat (the partner in a match of two), paying nothing, outside any deck and the deploy
// limit; their deployment takes hold as an operator's does (部署-2); withdrawn, they retreat.
import { DIR, KIND } from '@aue/schema';
import { makeOperator } from './units.js';
import { arrive } from './commands.js';
import { PREDEFINED } from './constants.js';
import { withdraw } from './deck.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content */

/** The content key of a predefined operator. @param {string} alias */
export const predefinedKey = (alias) => `${alias}${PREDEFINED}`;

/** Whether a predefined unit is an operator of the content (波次-7). @param {Content} c @param {string} alias */
export const isPredefinedOperator = (c, alias) => Object.hasOwn(c.operators, predefinedKey(alias)) && (c.level.predefines ?? []).some((x) => x.alias === alias && x.build);

/**
 * A predefined operator is withdrawn (波次-7): on the field, it retreats (撤退-1). @param {World} w @param {Content} c
 * @param {string} alias
 */
export function withdrawPredefined(w, c, alias) {
  const op = w.units.find((u) => u.kind === KIND.OPERATOR && u.key === predefinedKey(alias) && u.hp > 0);
  if (op) withdraw(w, c, op);
}

/**
 * A predefined unit comes into effect (波次-7): when it is an operator of the content with a tile and not on the field,
 * it is deployed for the last seat. Whether it was.
 * @param {World} w @param {Content} c @param {string} alias
 */
export function placePredefined(w, c, alias) {
  const p = (c.level.predefines ?? []).find((x) => x.alias === alias && x.build);
  const key = predefinedKey(alias);
  if (!p || p.row === undefined || p.col === undefined || !Object.hasOwn(c.operators, key)) return false;
  if (w.units.some((u) => u.kind === KIND.OPERATOR && u.key === key)) return false;
  const owner = Math.max(0, w.players.length - 1);
  const u = makeOperator(w, c, { key, owner, row: p.row, col: p.col, dir: DIR[/** @type {keyof typeof DIR} */ (p.dir ?? 'UP')] ?? DIR.UP, paid: 0 });
  w.units.push(u);
  w.events.push({ type: 'deploy', id: u.id, key: u.key, owner });
  arrive(w, c, u);
  return true;
}
