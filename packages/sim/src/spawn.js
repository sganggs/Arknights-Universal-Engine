// An enemy spawning (docs/spec/waves.md 波次-1): a wave's or a branch's SPAWN action acting once (守御-6) — the enemy
// at the start of its route, or one another brought in where that put it (敌能-22) —, its spawn event, its abilities
// set up, the `deploy` and `enemySpawn` events.
import { makeEnemy } from './units.js';
import { foeSpawn } from './foes.js';
import { emit } from './bus.js';
import { joinRoute } from './routes.js';
import { teamKey, kickoffWait, catchUp } from './football.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content */
/** @typedef {import('./types.js').WaveAction} WaveAction */
/** One plain SPAWN individual a branch still owes (敌能-79). @typedef {{ key: string, route: number, unharmful?: boolean }} BranchSpawn */

/**
 * @param {World} w @param {Content} c
 * @param {{ key: string, route: number, unharmful?: boolean, place?: { leg: number, x: number, y: number } }} a `place`: for one brought in (敌能-22), the
 *   leg and the point it starts from
 * @param {number} fragAt the frame its fragment began @param {number} wave the wave that waits for it, −1 for none
 */
export function spawnEnemy(w, c, a, fragAt, wave) {
  const key = teamKey(w, c, a.key), up = catchUp(w, c, key);
  const u = makeEnemy(w, c, { key, route: a.route, frag: fragAt, wave, unharmful: a.unharmful, ...(a.place ? { place: a.place } : {}), ...(up ? { up } : {}) });
  if (a.place) joinRoute(c, u);
  w.units.push(u);
  w.events.push({ type: 'spawn', id: u.id, key: u.key });
  foeSpawn(w, c, u);
  kickoffWait(w, c, u);
  emit(w, 'deploy', { unit: u, initial: false });
  emit(w, 'enemySpawn', { enemy: u });
  return u;
}

/** A hidden group or a random pack is the wave scheduler's, not one preset ballista (波次-4, 波次-5). @param {WaveAction} a */
const packed = (a) => !!(a.hidden || a.group || a.pack);

/**
 * The plain SPAWN individuals of a branch, in phase order then action order, `count` times each (敌能-79).
 * ACTIVATE, WITHDRAW, STORY, NONE, hidden groups and random packs are not individuals. `preDelay` and `interval`
 * belong to the level's own schedule and are not read: the skill places the one it takes now.
 * @param {Content} c @param {string} branchId @returns {BranchSpawn[]}
 */
function plainSpawns(c, branchId) {
  const branches = c.level.branches, phases = branches && Object.hasOwn(branches, branchId) ? branches[branchId] : undefined;
  if (!phases) return [];
  /** @type {BranchSpawn[]} */
  const out = [];
  for (const phase of phases) {
    for (const a of phase.actions) {
      if (a.type !== 'SPAWN' || packed(a) || !(a.count > 0)) continue;
      for (let i = 0; i < a.count; i++) out.push({ key: a.key, route: a.route, ...(a.unharmful ? { unharmful: true } : {}) });
    }
  }
  return out;
}

/** How many individuals of this branch 召唤弩炮 has already taken (敌能-79). Absent until the first take. @param {World} w @param {string} id @param {number} n */
function remember(w, id, n) {
  // An own data key even for __proto__; JSON recovery gives the cursor dictionary an ordinary prototype again.
  Object.defineProperty(w.branchAt ??= {}, id, { value: n, writable: true, enumerable: true, configurable: true });
}

/**
 * The next plain SPAWN individual of a branch that has not been taken (敌能-79): spawned at that action's own route
 * start, waiting for no wave. A key the content has no enemy for is skipped, as 敌能-22 summons nothing for one, and
 * the search goes on so one cast still brings one enemy. Nothing left: null, and the cursor stays where it is.
 * 守御-6 does not call this; its fragments are scheduled whole.
 * @param {World} w @param {Content} c @param {string} branchId @returns {import('./types.js').Unit | null}
 */
export function takeBranch(w, c, branchId) {
  const list = plainSpawns(c, branchId);
  let at = w.branchAt && Object.hasOwn(w.branchAt, branchId) ? w.branchAt[branchId] : 0;
  while (at < list.length) {
    const a = list[at];
    at += 1;
    remember(w, branchId, at);
    if (!Object.hasOwn(c.enemies, a.key)) continue;
    if (!c.level.routes[a.route]) throw new RangeError(`takeBranch: branch ${branchId} route ${a.route} is not on the level`);
    return spawnEnemy(w, c, a, w.frame, -1);
  }
  return null;
}
