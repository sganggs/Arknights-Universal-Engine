// 轰隆隆先生 (docs/spec/devices.md 装置-7, docs/spec/foes.md 敌能-80): counted cards on the seat that has them. A copy's
// 再部署时间 starts when it is deployed (再部署策略 默认). 1.5s later it stuns the cross and leaves, with no refund and
// no second timer. Nothing here is stored on the unit — `at` on a live entry is the trigger frame, not a unit field.
import { secondsToFrames } from '@aue/math';
import { KIND } from '@aue/schema';
import { statsOf } from './attrs.js';
import { tileOf } from './body.js';
import { releaseAll } from './blocking.js';
import { inflict } from './status.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit */
/** @typedef {import('./types.js').LootPile} LootPile */

/**
 * The seat's 轰隆隆先生 piles, or undefined when its deck has none — absent, so a world without the card keeps its shape.
 * @param {Content} c @param {number} seat @returns {Record<string, LootPile> | undefined}
 */
export function lootForSeat(c, seat) {
  /** @type {Record<string, LootPile>} */
  const bags = {};
  for (const key of c.decks?.[seat] ?? []) {
    const rumble = c.operators[key]?.rumble;
    if (!rumble) continue;
    bags[key] = { held: rumble.start ?? 0, back: [], live: [] };
  }
  return Object.keys(bags).length > 0 ? bags : undefined;
}

/** Copies of one card the seat can deploy now (装置-7). @param {World} w @param {number} seat @param {string} key */
export const lootHeld = (w, seat, key) => w.players[seat]?.loot?.[key]?.held ?? 0;

/**
 * Each allied seat that already has this card gains `n` copies (敌能-80). A world whose decks never got the card,
 * or a key that is not one of those cards, gains nothing. `n` is floored; below 1 gives nothing.
 * @param {World} w @param {Content} c @param {string} key @param {number} n
 */
export function grantLootCards(w, c, key, n) {
  if (typeof key !== 'string' || key === '' || typeof n !== 'number' || !(n > 0)) return;
  const cnt = Math.floor(n);
  if (cnt <= 0) return;
  w.players.forEach((p, seat) => {
    const id = `${key}#${seat}`, pile = p.loot?.[id];
    if (!pile || !c.operators[id]?.rumble) return;
    pile.held += cnt;
  });
}

/**
 * Deploy one held copy (装置-7): the redeploy timer and the trigger both start this frame. The record's cost was
 * already paid by the deploy.
 * @param {World} w @param {Content} c @param {number} seat @param {string} key @param {number} id
 */
export function takeLoot(w, c, seat, key, id) {
  const pile = w.players[seat]?.loot?.[key], rumble = c.operators[key]?.rumble;
  if (!pile || !rumble || pile.held <= 0) return;
  pile.held -= 1;
  pile.back.push(w.frame + secondsToFrames(rumble.respawn));
  pile.live.push({ id, at: w.frame + secondsToFrames(rumble.delay) });
}

/**
 * The device left before its trigger (撤退, or HP 0): drop the pending stun. The redeploy timer already running is
 * kept (装置-7) — leaving does not start another, and does not refund.
 * @param {World} w @param {Unit} u
 */
export function dropRumble(w, u) {
  const pile = w.players[u.owner]?.loot?.[u.key];
  if (!pile) return;
  pile.live = pile.live.filter((job) => job.id !== u.id);
}

/** Copies whose redeploy time, started at deploy, is up (装置-7). Before commands, so one may be placed this frame. @param {World} w */
export function returnLoot(w) {
  for (const p of w.players) {
    if (!p.loot) continue;
    for (const pile of Object.values(p.loot)) {
      while (pile.back.length > 0 && pile.back[0] <= w.frame) {
        pile.back.shift();
        pile.held += 1;
      }
    }
  }
}

/** Devices whose 1.5s has elapsed (装置-7): stun, then leave. After buffs tick, so the stun's first frame is this one. @param {World} w @param {Content} c */
export function boomLoot(w, c) {
  for (const id of dueIds(w)) fireRumble(w, c, id);
}

/** Trigger frames reached this frame, taken off the piles either way. @param {World} w @returns {number[]} */
function dueIds(w) {
  /** @type {number[]} */
  const due = [];
  for (const p of w.players) {
    if (!p.loot) continue;
    for (const pile of Object.values(p.loot)) {
      /** @type {LootPile['live']} */
      const stay = [];
      for (const job of pile.live) if (job.at <= w.frame) due.push(job.id); else stay.push(job);
      pile.live = stay;
    }
  }
  return due;
}

/**
 * Stun unless the device is silenced this frame (坏脾气 is a skill; 销毁自身 is the device line), then remove it.
 * Already gone, or already at 0 HP, does not stun (装置-7).
 * @param {World} w @param {Content} c @param {number} id
 */
function fireRumble(w, c, id) {
  const u = w.units.find((x) => x.id === id);
  if (!u || u.hp <= 0) return;
  const seconds = c.operators[u.key]?.rumble?.stun;
  if (seconds !== undefined && !statsOf(u).flags.silence) stunCross(w, u, seconds);
  const at = w.units.indexOf(u);
  if (at < 0) return;
  w.units.splice(at, 1);
  releaseAll(w, u.id);
  w.events.push({ type: 'death', id: u.id });
}

/** Enemies on the device's tile and the four tiles beside it (装置-7): not neutrals; flyers and unselectable ones too. @param {World} w @param {Unit} src @param {number} seconds */
function stunCross(w, src, seconds) {
  for (const t of w.units) if (inCross(src, t)) inflict(w, t, 'stun', { seconds, src });
}

/** @param {Unit} src @param {Unit} t */
function inCross(src, t) {
  if (t.kind !== KIND.ENEMY || t.base.neutral === true || t.hp <= 0) return false;
  const [sr, sc] = tileOf(src), [tr, tc] = tileOf(t);
  return Math.abs(sr - tr) + Math.abs(sc - tc) <= 1;
}
