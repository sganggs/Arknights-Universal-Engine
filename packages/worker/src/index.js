// @aue/worker: the battle in a module Worker (ADR 0009). The page imports startBattle (main.js) and points it at the
// served worker.js; BattleSession (session.js) is the platform-free core, tested in Node.
export { startBattle } from './main.js';
export { BattleSession } from './session.js';
/** @typedef {import('./session.js').Status} Status */
/** @typedef {import('./session.js').PlayerStatus} PlayerStatus */
/** @typedef {import('./session.js').FootballStatus} FootballStatus */
/** @typedef {import('./cards.js').SummonStatus} SummonStatus */
