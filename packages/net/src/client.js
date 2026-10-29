// The client side of lockstep (spec 同步-3…同步-5, 同步-7, 同步-8): plays sealed frames only, stamps its commands
// INPUT_DELAY frames ahead, reports its state hash, restores the server's snapshot on welcome and on resync — or, for
// content with a world setup, replays the sealed commands from frame 0 —, and passes on the speed and pause controls and
// the seats' signals (同步-13). It runs in the worker; `send` is its transport.
import { createWorld, step, stateHash, restoreSnapshot } from '@aue/sim';
import { INPUT_DELAY, HASH_EVERY } from './constants.js';
import { framesThisTick } from './pacing.js';

/** @typedef {import('@aue/schema').Command} Command @typedef {import('@aue/schema').ServerMessage} ServerMessage */
/** @typedef {import('@aue/schema').ClientMessage} ClientMessage @typedef {import('@aue/sim').World} World */
/** @typedef {import('@aue/schema').ControlMessage} ControlMessage */
/**
 * @typedef {object} ClientOptions
 * @property {import('@aue/sim').Content} content
 * @property {(msg: ClientMessage) => void} send
 * @property {(w: World, events: Record<string, string | number>[]) => void} [onFrame] after every played frame
 * @property {(c: ControlMessage) => void} [onControl] when the speed or pause state changes
 * @property {(seat: number, s: import('@aue/schema').Signal) => void} [onSignal] a seat's signal (同步-13)
 */

export class LockstepClient {
  /** @param {ClientOptions} o */
  constructor(o) {
    this.o = o;
    /** @type {World | null} */
    this.world = null;
    this.sealed = -1;
    /** the battle's seed, from the welcome */
    this.seed = 0;
    /** the arbiter's player count, from the welcome; the former default before any welcome */
    this.seats = o.content.decks?.length ?? 1;
    /** @type {Map<number, [number, Command][]>} */
    this.queue = new Map();
    this.stats = { restamps: 0, resyncs: 0, errors: 0 };
    /** @type {ControlMessage | null} the last speed and pause state */
    this.control = null;
  }

  /** @param {ServerMessage} msg */
  receive(msg) {
    if (msg.t === 'welcome') { this.seed = msg.seed; this.seats = msg.seats; }
    if (msg.t === 'welcome' || msg.t === 'resync') this.startFrom(msg);
    if (msg.t === 'welcome') this.sealed = msg.frame;
    if (msg.t === 'frames') this.addFrames(msg.cmds, msg.to);
    if (msg.t === 'resync') this.stats.resyncs++;
    if (msg.t === 'restamp') this.stats.restamps++;
    if (msg.t === 'error') this.stats.errors++;
    if (msg.t === 'control') { this.control = msg; this.o.onControl?.(msg); }
    if (msg.t === 'signal') this.o.onSignal?.(msg.seat, msg.s);
  }

  /**
   * Where a welcome or a resync starts this client (同步-5): the snapshot, or a new battle replayed to the sealed frame.
   * @param {{ snapshot: object | null, frame: number, replay: [number, number, Command][] | null }} m
   */
  startFrom(m) {
    if (m.replay) this.replay(m.replay, m.frame);
    else this.restore(m.snapshot);
  }

  /**
   * A new battle of this content and seed, every sealed command played up to `upTo` at once (同步-5).
   * @param {[number, number, Command][]} cmds @param {number} upTo
   */
  replay(cmds, upTo) {
    const c = this.o.content, w = createWorld(c, { seed: this.seed, players: this.seats });
    /** @type {Map<number, [number, Command][]>} */
    const by = new Map();
    for (const [f, seat, cmd] of cmds) by.set(f, [...(by.get(f) ?? []), [seat, cmd]]);
    while (w.frame <= upTo) step(w, c, by.get(w.frame) ?? []);
    for (const f of [...this.queue.keys()]) if (f < w.frame) this.queue.delete(f);
    this.world = w;
  }

  /** @param {unknown} snapshot */
  restore(snapshot) {
    const w = restoreSnapshot(snapshot);
    for (const f of [...this.queue.keys()]) if (f < w.frame) this.queue.delete(f);
    this.world = w;
  }

  /** @param {[number, number, Command][]} cmds @param {number} to */
  addFrames(cmds, to) {
    for (const [f, seat, cmd] of cmds) {
      if (this.world && f < this.world.frame) continue;
      const list = this.queue.get(f) ?? [];
      list.push([seat, cmd]);
      this.queue.set(f, list);
    }
    this.sealed = Math.max(this.sealed, to);
  }

  /** Sealed frames not yet played. */
  backlog() { return this.world ? this.sealed - this.world.frame + 1 : 0; }

  /** Plays this frame time's share of the backlog (同步-4); returns the frames played. */
  pump() {
    const n = framesThisTick(this.backlog());
    for (let i = 0; i < n && this.world; i++) this.playOne(this.world);
    return n;
  }

  /** @param {World} w */
  playOne(w) {
    const f = w.frame, events = step(w, this.o.content, this.queue.get(f) ?? []);
    this.queue.delete(f);
    if (w.frame % HASH_EVERY === 0) this.o.send({ t: 'hash', frame: w.frame, hash: stateHash(w) });
    this.o.onFrame?.(w, events);
  }

  /** Sends a command for INPUT_DELAY frames after the next frame to play (同步-3). @param {Command} cmd */
  command(cmd) {
    if (this.world) this.o.send({ t: 'cmd', at: this.world.frame + INPUT_DELAY, cmd });
  }

  /** Turns this seat's 2× switch on or off (同步-7). @param {boolean} on */
  speed(on) { this.o.send({ t: 'speed', on: on ? 1 : 0 }); }

  /** Asks to pause (同步-8). */
  pause() { this.o.send({ t: 'pause' }); }

  /** Answers the mate's pause request (同步-8). @param {boolean} accept */
  pauseReply(accept) { this.o.send({ t: 'pauseReply', accept: accept ? 1 : 0 }); }

  /** Resumes a pause (同步-8). */
  resume() { this.o.send({ t: 'resume' }); }

  /** The page has loaded the battle (同步-11). */
  ready() { this.o.send({ t: 'ready' }); }

  /** A signal to the seats (同步-13). @param {import('@aue/schema').Signal} s */
  signal(s) { this.o.send({ t: 'signal', s }); }
}
