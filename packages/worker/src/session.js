// A battle session in the worker (ADR 0009, 0053): the socket, the lockstep client, the frame clock, and the render
// state posted to the main thread after each frame time. Everything that touches the platform comes in through `io`,
// so the session runs the same in a Worker and in a Node test.
import { serverMessageProblem, PROTOCOL_VERSION } from '@aue/schema';
import { toView, stateHash, contentHash, fortress, football, cup } from '@aue/sim';
import { LockstepClient } from '@aue/net';
import { marksFor } from './marks.js';
import { operatorCards, summonCards } from './cards.js';

/** @typedef {{ send(text: string): void, close(): void, onopen: (() => void) | null, onmessage: ((text: string) => void) | null, onclose: (() => void) | null }} SocketLike */
/**
 * @typedef {object} SessionIO
 * @property {(url: string) => SocketLike} connect
 * @property {(msg: object, transfer?: Transferable[]) => void} post to the main thread
 * @property {() => number} now milliseconds
 * @property {(fn: () => void, ms: number) => unknown} later
 * @property {(match: import('@aue/schema').Match) => Promise<import('@aue/sim').Content>} [content] the content of a match (同步-9)
 */
/** @typedef {{ url: string, seat: number, key: string }} Target */

const FRAME_MS = 1000 / 30, RECONNECT_MS = 1000;

/**
 * What the battle UI shows of a player besides the view (费用-1, 部署-3, 合作-4, 合作-5): the frames until its next cost
 * point, the operators it has on the field and how many more it may deploy (部署-2), each card of its deck — the cost
 * to deploy it now (再部署惩罚 included) and the frame it may be deployed again from —, its summon cards (召唤-4, 界面-23),
 * the frames until it comes back when down (−1), the frames left of its open cost request (−1) and until it may ask again;
 * the cards held back (波次-9).
 * @typedef {{ costTimer: number, deployed: string[], slots: number, cards: Record<string, { cost: number, ready: number }>, hidden: string[],
 *   summons: Record<string, import('./cards.js').SummonStatus>, revive: number, ask: number, askCd: number }} PlayerStatus
 */
/**
 * 堡垒守御's state the page shows (守御-1, 守御-2, 守御-4): the phase, its wave, the frame the wave's defence began and the
 * frame the phase ends at, the waves defended,
 * the stamps they earn, the damage to the last wave, each seat's 「休整完毕」 and builder cards held, the wave's enemies and
 * those gone; each facility's level by unit id (守御-3).
 * @typedef {{ phase: string, wave: number, start: number, until: number, defended: number, stamps: number, damage: number, ready: boolean[], pools: Record<string, number>[], total: number,
 *   out: number, levels: Record<number, number> }} FortressStatus
 */
/**
 * 阵地足球's state the page shows (足球-6, 足球-7, 足球-3, 足球-14, 足球-16): the team drawn (its name), our goals and
 * theirs, the frame the match ends, the stamps; each ball on the field with what it summed toward its kick (the damage,
 * its threshold and the direction); the balls each seat holds with the frame its card's time is up; the ice and slime
 * by tile index; the tiles of the 守门位 (row × width + col); in a 锦标 match its stadium's name (锦标-2) and, in a penalty
 * shootout, the round under way and whose it is (锦标-4).
 * @typedef {{ team: string, home: number, away: number, until: number, stamps: number, balls: { id: number, sum: number, need: number, ax: number, ay: number }[],
 *   held: { until: number }[][], cover: Record<string, number>, spots: number[], stadium?: string, pk?: { round: number, side: 'ours' | 'theirs' } }} FootballStatus
 */
/**
 * The match's state the page shows besides the view (合作-6, 波次-2, 结束-1): the current wave, the current stage, the
 * frame its clock starts at, its count, the stamps, the stages passed, the result; each player's state; 堡垒守御's;
 * 阵地足球's.
 * @typedef {{ wave: number, stage: number, start: number, count: number, stamps: number, passed: number, result: number, players: PlayerStatus[],
 *   fortress?: FortressStatus, football?: FootballStatus }} Status
 */

/** @param {import('@aue/sim').World} w @returns {FortressStatus | undefined} */
const fortressOf = (w) => {
  const f = w.fortress;
  if (!f) return undefined;
  const levels = Object.fromEntries(w.units.flatMap((u) => (u.fac ? [[u.id, u.fac.level]] : [])));
  return { phase: f.phase, wave: f.round, start: f.start, until: f.until, defended: f.defended, stamps: fortress.fortressStamps(f.defended), damage: f.damage, ready: [...f.ready], pools: f.pools.map((p) => ({ ...p })), total: f.total, out: f.out, levels };
};

/** @param {import('@aue/sim').World} w @param {import('@aue/sim').Content} c @returns {FootballStatus | undefined} */
const footballOf = (w, c) => {
  const f = w.football, rules = c.level.football;
  if (!f || !rules) return undefined;
  return {
    team: rules.teams[f.team]?.name ?? '', home: f.home, away: f.away, until: f.until, stamps: football.footballStamps(rules, f),
    balls: w.units.flatMap((u) => (u.ball && !u.hidden ? [{ id: u.id, sum: u.ball.sum, need: u.ball.need, ax: u.ball.ax, ay: u.ball.ay }] : [])),
    held: w.players.map((p) => (p.balls ?? []).map((b) => ({ until: b.until }))), cover: { ...f.cover },
    spots: w.units.flatMap((u) => (u.spot && !u.hidden ? [Math.round(u.y) * c.level.width + Math.round(u.x)] : [])),
    ...cupOf(w, c),
  };
};

/** A 锦标 match's stadium and penalty round (锦标-2, 锦标-4), nothing outside one. @param {import('@aue/sim').World} w @param {import('@aue/sim').Content} c */
const cupOf = (w, c) => {
  const st = cup.isCup(c) ? cup.stadiumOf(w, c) : null, side = cup.penaltySide(w), pk = w.football?.pk;
  return { ...(st ? { stadium: st.name } : {}), ...(side && pk ? { pk: { round: pk.round, side } } : {}) };
};

/** @param {import('@aue/sim').World} w @param {import('@aue/sim').Content} c @returns {Status} */
const statusOf = (w, c) => ({
  wave: w.sched.wave, stage: w.stage.index, start: w.stage.start, count: w.stage.count, stamps: w.stage.stamps, passed: w.stage.passed, result: w.result,
  players: w.players.map((p, i) => ({
    costTimer: p.costTimer, deployed: [...p.deployed], revive: p.revive, ask: p.ask, askCd: p.askCd,
    ...operatorCards(w, c, i), summons: summonCards(w, c, i),
  })),
  ...(w.fortress ? { fortress: fortressOf(w) } : {}),
  ...(w.football ? { football: footballOf(w, c) } : {}),
});

export class BattleSession {
  /** @param {import('@aue/sim').Content} content @param {SessionIO} io */
  constructor(content, io) {
    this.io = io;
    /** @type {Record<string, string | number>[]} */
    this.events = [];
    /** the content of the client's match @type {import('@aue/sim').Content} */
    this.content = content;
    this.client = this.clientFor(content);
    /** @type {string | null} the match the client's content was made from */
    this.match = null;
    /** @type {import('@aue/schema').ServerMessage[] | null} messages waiting while a match's content is made */
    this.waiting = null;
    /** @type {SocketLike | null} */
    this.socket = null;
    /** @type {Target | null} */
    this.target = null;
    this.stopped = false;
    /** whether the page has loaded the battle (同步-11) */
    this.loaded = false;
    this.ticks = 0;
    this.t0 = 0;
    /** @type {Set<number>} unit ids whose content key the page has */
    this.known = new Set();
    /** @type {import('@aue/sim').World | null} the world the known ids belong to (a restore starts a new one) */
    this.knownWorld = null;
  }

  /** A lockstep client of this content, and the content's hash (同步-10). @param {import('@aue/sim').Content} content */
  clientFor(content) {
    this.content = content;
    this.contentHash = contentHash(content);
    return new LockstepClient({
      content, send: (m) => this.socket?.send(JSON.stringify(m)), onFrame: (_w, ev) => { this.events.push(...ev); },
      onControl: (c) => this.io.post({ type: 'control', fast: c.fast, held: c.held, asker: c.asker, resuming: c.resuming }),
      onSignal: (seat, s) => this.io.post({ type: 'signal', seat, s }),
    });
  }

  /** A signal from the page to the seats (同步-13). @param {import('@aue/schema').Signal} s */
  signal(s) { this.client.signal(s); }

  /** The page has loaded the battle (同步-11): the server is told, and again after a reconnect. */
  ready() {
    this.loaded = true;
    this.client.ready();
  }

  /**
   * A speed or pause control from the page (同步-7, 同步-8), passed to the server.
   * @param {{ type: 'speed', on: boolean } | { type: 'pause' } | { type: 'pauseReply', accept: boolean } | { type: 'resume' }} c
   */
  control(c) {
    if (c.type === 'speed') this.client.speed(c.on);
    else if (c.type === 'pause') this.client.pause();
    else if (c.type === 'pauseReply') this.client.pauseReply(c.accept);
    else this.client.resume();
  }

  /** Connects and starts the frame clock. @param {Target} target */
  start(target) {
    this.target = target;
    this.t0 = this.io.now();
    this.open();
    this.io.later(() => this.tick(), FRAME_MS);
  }

  open() {
    const t = /** @type {Target} */ (this.target), s = this.io.connect(t.url);
    this.socket = s;
    s.onopen = () => {
      s.send(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, seat: t.seat, key: t.key, since: this.client.world?.frame ?? -1 }));
      if (this.loaded) s.send(JSON.stringify({ t: 'ready' }));
      this.io.post({ type: 'net', state: 'open' });
    };
    s.onmessage = (text) => this.receive(text);
    s.onclose = () => {
      if (this.socket !== s) return;
      this.socket = null;
      this.io.post({ type: 'net', state: 'closed' });
      if (!this.stopped) this.io.later(() => this.open(), RECONNECT_MS);
    };
  }

  /** A server message: checked, then handed to the lockstep client; a bad one is reported, not fatal. @param {string} text */
  receive(text) {
    /** @type {unknown} */
    let msg;
    try { msg = JSON.parse(text); } catch { msg = null; }
    const why = serverMessageProblem(msg);
    if (why) { this.io.post({ type: 'net', state: 'bad-message', reason: why }); return; }
    const m = /** @type {import('@aue/schema').ServerMessage} */ (msg);
    if (this.waiting) { this.waiting.push(m); return; }
    if (m.t === 'welcome' && m.match && this.io.content && JSON.stringify(m.match) !== this.match) { this.makeContent(m, m.match, this.io.content); return; }
    this.deliver(m);
  }

  /**
   * A welcome with new match settings (同步-9): its content is made first; the messages meanwhile wait, then all go to a
   * client of that content.
   * @param {import('@aue/schema').ServerMessage} welcome @param {import('@aue/schema').Match} match
   * @param {(match: import('@aue/schema').Match) => Promise<import('@aue/sim').Content>} make
   */
  makeContent(welcome, match, make) {
    this.match = JSON.stringify(match);
    this.waiting = [welcome];
    make(match).then((content) => {
      this.client = this.clientFor(content);
      const queued = this.waiting ?? [];
      this.waiting = null;
      for (const q of queued) this.deliver(q);
      this.io.post({ type: 'net', state: 'match', match, frame: welcome.t === 'welcome' ? welcome.frame : -1 });
    }, (e) => {
      this.waiting = null;
      this.match = null;
      this.io.post({ type: 'net', state: 'bad-message', reason: String(e instanceof Error ? e.message : e) });
    });
  }

  /** A checked message to the lockstep client; one it cannot take is reported, not fatal. @param {import('@aue/schema').ServerMessage} m */
  deliver(m) {
    if (m.t === 'welcome' && m.content !== this.contentHash) {
      this.io.post({ type: 'net', state: 'bad-message', reason: 'the content differs from the server’s (同步-10)' });
      return;
    }
    try { this.client.receive(m); } catch (e) {
      this.io.post({ type: 'net', state: 'bad-message', reason: String(e instanceof Error ? e.message : e) });
    }
  }

  /** One frame time: play this tick's frames, post the render state, schedule the next tick without drift. */
  tick() {
    if (this.stopped) return;
    const played = this.client.pump(), w = this.client.world;
    if (played > 0 && w) {
      const view = toView(w);
      this.io.post({ type: 'frame', frame: w.frame, view, events: this.events, keys: this.newKeys(w), status: statusOf(w, this.content) }, [view.buffer]);
      this.events = [];
    }
    this.ticks++;
    this.io.later(() => this.tick(), Math.max(0, this.t0 + (this.ticks + 1) * FRAME_MS - this.io.now()));
  }

  /**
   * The content keys of units the page has not been told about (all of them after a restore).
   * @param {import('@aue/sim').World} w @returns {Record<string, string>}
   */
  newKeys(w) {
    if (this.knownWorld !== w) { this.known.clear(); this.knownWorld = w; }
    /** @type {Record<string, string>} */
    const out = {};
    for (const u of w.units) if (!this.known.has(u.id)) { this.known.add(u.id); out[u.id] = u.key; }
    return out;
  }

  /** @param {import('@aue/schema').Command} cmd */
  command(cmd) { this.client.command(cmd); }

  /** The state for tests and the debug panel. */
  debug() {
    const w = this.client.world;
    return { type: 'debug', frame: w?.frame ?? -1, hash: w ? stateHash(w) : 0, sealed: this.client.sealed, stats: this.client.stats };
  }

  /**
   * The field marks for the page (render spec 渲染-8, 渲染-9) from the session's world and seat (marks.js).
   * @param {import('./marks.js').MarkQuery} q
   */
  marks(q) {
    return { type: 'marks', ...marksFor(this.client.world, this.client.o.content, this.target?.seat ?? -1, q) };
  }

  stop() {
    this.stopped = true;
    const s = this.socket;
    this.socket = null;
    s?.close();
  }
}
