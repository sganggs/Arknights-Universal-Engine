// The effects system (docs/spec/render.md 渲染-11): the units' attack effects, played from the frame's events. A start
// effect that waits (its lead ≥ 0.15 s: it keeps time with the attack clip) plays as the attack starts; the others when
// a melee hit lands or a shot leaves, once a frame for a unit. A shot carries its projectile's trail effect, flying from
// the attacker's chest to the target's along the projectile's arc at its speed, and stops when it hits. The hit effect
// plays at the target's chest. An effect is placed as its prefab says: as it is, mirrored with the unit's facing, or
// turned toward the attack's direction. While an operator's skill runs, its attacks take the skill's own effects.
// Besides the attacks (渲染-12): the start and end tiles carry their marker effects, a unit its statuses' effects for as
// long as it has them, and deploying and dying play theirs. A thrown 炼金单元 (渲染-25) flies to where it lands and plays
// its effects there until it ends. 阵地足球's goals carry markers of their own, its 守门位 and ice and slime theirs
// (渲染-26); a 锦标 ball lightning is coming to carries its warning, then the bolt and the burning (渲染-27). Effects keep
// battle time: they follow 2× and pause.
import * as THREE from 'three';
import { KIND, DIR, SKILL_STATE, STATUS_BIT } from '@aue/schema';
import { toThree, tileWorld } from './camera.js';
import { FxInstance, rootAt, rootAlong, rootToward, effectLead } from './fx/player.js';
import { FPS } from './figure.js';

/**
 * The effects' constants (渲染-11): the chest's height above the feet (tiles, along the models' up — the camera's), the
 * lead from which a start effect plays with the attack, the most effects at once, a projectile's speed when its prefab
 * gives none (tiles a second), and the longest a projectile flies past its time.
 */
export const FX = Object.freeze({ chest: 0.4, head: 0.8, early: 0.15, max: 160, speed: 10, overtime: 1 });

/** How high an effect starts by its prefab's spawn location (渲染-12): 2 the chest, 4 the head, the others the feet. */
const LIFT = /** @type {Record<number, number>} */ ({ 2: FX.chest, 4: FX.head });

/**
 * @typedef {import('./fx/player.js').FxPack} FxPack
 * @typedef {{ feet: number[], facing: number, dir: number[], kind: number, running: boolean, seen: number }} Place
 * @typedef {{ width: number, height: number, highland?: number, tiles?: { key: string, height: string, goal?: string }[][] }} FxLevel
 */
/** How an effect is turned: the unit's facing (±1) and a direction on the ground. @typedef {{ facing: number, dir: number[] }} Way */

/** A direction on the ground of each deploy direction (schema DIR), in three.js (north −z). */
const DIR_VEC = /** @type {Record<number, number[]>} */ ({ [DIR.RIGHT]: [1, 0, 0], [DIR.UP]: [0, 0, -1], [DIR.LEFT]: [-1, 0, 0], [DIR.DOWN]: [0, 0, 1] });

/**
 * An effect's root as its prefab places it (渲染-11): turned toward the way (rotate type 2), mirrored with the facing
 * (rotate type 1; the other way round when it faces left by default), else as it is.
 * @param {any} e @param {number[]} o @param {Way} way
 */
function rootFor(e, o, way) {
  if (e.rt === 2) return rootToward(o, way.dir);
  return rootAt(o, e.rt === 1 ? (e.ld ? -way.facing : way.facing) : 1);
}
/** @typedef {{ inst: FxInstance, src: number, target: number, pos: number[], d0: number, h0: number, arc: number, speed: number, t: number, T: number }} Flight */
/**
 * A thrown 炼金单元 (渲染-25): its throw in the pack, its landing tile and height, its trail's flight (from, to, arc, the
 * seconds it takes) and the seconds since it was thrown; its end; its drift (tiles a second, radius growth a second, the
 * seconds it drifts) from its radius; the effects it plays where it landed once it has.
 * @typedef {{ Z: any, x: number, y: number, z: number, from: number[], to: number[], arc: number, T: number, t: number, end: number, vx: number, vy: number,
 *   grow: number, drift: number, r0: number, trail: FxInstance | null, landed: FxInstance[] | null }} Pot
 */

/** 阵地足球's goals' markers (渲染-12): ours the third co-op end marker (blue), theirs the start marker (red). */
const GOAL_MARKERS = /** @type {Readonly<Record<string, string>>} */ (Object.freeze({ tile_allygoal: 'tile_end_coop_3', tile_enemygoal: 'tile_start' }));

/** The seat a co-op goal belongs to (the engine's 合作-1): side A seat 0, side B seat 1; −1 for one of no single seat. @param {string | undefined} goal */
const goalSeat = (goal) => (goal === 'A' ? 0 : goal === 'B' ? 1 : -1);

/**
 * The marker effect of a start or end tile (渲染-12), or null: a co-op goal of the viewer's partner takes the second co-op
 * end marker, the others the first; a 阵地足球 goal its own.
 * @param {{ key: string, goal?: string }} t @param {Record<string, string>} named @param {number} seat the viewer's
 */
function markerOf(t, named, seat) {
  if (Object.hasOwn(GOAL_MARKERS, t.key)) return named[GOAL_MARKERS[t.key]] ?? null;
  if (t.key.startsWith('tile_start')) return named.tile_start ?? null;
  if (t.key !== 'tile_end_cooperate') return t.key.startsWith('tile_end') ? named.tile_end ?? null : null;
  const own = goalSeat(t.goal), mate = own >= 0 && own !== seat ? named.tile_end_coop_2 : undefined;
  return mate ?? named.tile_end_coop_1 ?? named.tile_end ?? null;
}

const NOWHERE = Object.freeze({ facing: 1, dir: [1, 0, 0] });
/** The tile markers' render order: after the range (−2), before the shadows (−1) and the units. */
const MARKER_ORDER = -1.9;

/** The camera's axes in the world. @param {THREE.Camera} camera */
export function cameraAxes(camera) {
  const e = camera.matrixWorld.elements;
  return { right: [e[0], e[1], e[2]], up: [e[4], e[5], e[6]], view: [-e[8], -e[9], -e[10]] };
}


/**
 * A 炼金单元 event's drift (渲染-25): tiles a second along the columns and rows, radius growth a second, the seconds it
 * drifts, the radius it started with. @param {Record<string, string | number>} e
 */
const driftOf = (e) => ({ vx: Number(e.vx) || 0, vy: Number(e.vy) || 0, grow: Number(e.grow) || 0, drift: (Number(e.drift) || 0) / FPS, r0: Number(e.r) || 1 });

class Effects {
  /**
   * @param {FxPack} pack @param {FxLevel} level
   * @param {{ skills?: Record<string, number>, seat?: number }} [o] each operator's skill (1-based) by its key; the viewer's seat (0 by default)
   */
  constructor(pack, level, o = {}) {
    this.pack = pack; this.level = level; this.object = new THREE.Group(); this.skills = o.skills ?? {}; this.seat = o.seat ?? 0;
    /** @type {Record<string, string>} effects by role */ this.named = pack.data.named ?? {};
    /** @type {Map<string, { inst: FxInstance, id: number, lift: number }>} a unit's status effects by `id:bit` */ this.statuses = new Map();
    /** @type {Map<string, FxInstance>} 阵地足球's field effects by `kind:tile` (渲染-26) */ this.field = new Map();
    /** @type {Map<number, { inst: FxInstance, id: number, lift: number }>} the lightning's lasting effect on each ball (渲染-27) */ this.storms = new Map();
    this.leads = new Map(Object.keys(pack.data.fx).map((k) => [k, effectLead(pack.data.fx[k])]));
    /** @type {FxInstance[]} */ this.live = [];
    /** @type {Flight[]} */ this.flights = [];
    /** @type {Pot[]} the 炼金单元 on the field */ this.pots = [];
    /** @type {Map<number, Place>} */ this.places = new Map();
    /** @type {Map<number, string>} */ this.keys = new Map();
    /** @type {Map<number, number>} the frame a unit's start effect last played */ this.started = new Map();
    this.frame = 0;
    /** the models' up (the camera's): the chest is above the feet along it */
    this.up = [0, 0.5, -Math.sqrt(3) / 2];
    this.markers();
  }

  /** The start and end tiles' marker effects, lasting, drawn before the units (after the range, before the shadows). */
  markers() {
    (this.level.tiles ?? []).forEach((cols, row) => cols.forEach((t, col) => {
      const n = markerOf(t, this.named, this.seat);
      if (n) this.play(n, toThree(tileWorld(this.level, col, row, t.height === 'HIGHLAND' ? 1 : 0)), NOWHERE, 'loop', MARKER_ORDER);
    }));
  }

  /**
   * 阵地足球's field (渲染-26): a lasting effect on each 守门位 tile and each tile of ice or slime, of the kinds the pack
   * has (`football_spot`, `football_ice`, `football_slime`); started as a tile gets one, stopped as it loses it. The
   * kinds it draws. @param {import('./pitchmarks.js').PitchState | null} s @returns {Set<string>}
   */
  pitch(s) {
    const want = this.fieldWanted(s), drawn = new Set([...want.keys()].map((key) => key.split(':')[0]));
    for (const [key, inst] of this.field) if (!want.has(key) || inst.done) { inst.stop(); this.field.delete(key); }
    for (const [key, { n, k }] of want) {
      if (this.field.has(key)) continue;
      const row = Math.floor(k / this.level.width), col = k % this.level.width, high = this.level.tiles?.[row]?.[col]?.height === 'HIGHLAND';
      const inst = this.play(n, toThree(tileWorld(this.level, col, row, high ? 1 : 0)), NOWHERE, 'loop', MARKER_ORDER);
      if (inst) this.field.set(key, inst);
    }
    return drawn;
  }

  /**
   * The field effects wanted (渲染-26), by `kind:tile`: the effect and the tile of each 守门位, ice and slime the pack
   * has an effect for. @param {import('./pitchmarks.js').PitchState | null} s
   */
  fieldWanted(s) {
    /** @type {Map<string, { n: string, k: number }>} */
    const want = new Map();
    const add = (/** @type {string} */ kind, /** @type {number} */ k) => {
      const n = this.named[`football_${kind}`];
      if (n && this.pack.data.fx[n]) want.set(`${kind}:${k}`, { n, k });
    };
    for (const k of s?.spots ?? []) add('spot', k);
    for (const [k, v] of Object.entries(s?.cover ?? {})) add(v < 0 ? 'ice' : 'slime', Number(k));
    return want;
  }

  /** A place lifted along the models' up. @param {number[]} feet @param {number} lift */
  lifted(feet, lift) { return feet.map((v, i) => v + this.up[i] * lift); }

  /** @param {number[]} feet */
  chest(feet) { return this.lifted(feet, FX.chest); }

  /** @param {string | undefined} name @param {number[]} o @param {Way} way @param {string} kind @param {number} [order] */
  play(name, o, way, kind, order) {
    const fx = this.pack.data.fx;
    if (!name || !fx[name] || this.live.length >= FX.max) return null;
    const e = fx[name], i = new FxInstance(e, kind === 'trail' ? rootAlong(o, way.dir) : rootFor(e, o, way), { kind, tex: this.pack.textures, order });
    this.live.push(i); this.object.add(i.group);
    return i;
  }

  /** A unit's attack effects by its content key; its skill's own while the skill runs. @param {number} id */
  by(id) {
    const key = this.keys.get(id) ?? '', E = this.pack.data.by[key], slot = this.skills[key];
    return E && slot && E.m?.[slot] && this.places.get(id)?.running ? E.m[slot] : E;
  }

  /** Whether a unit's start effect keeps time with its attack clip. @param {any} E */
  early(E) { return !!(E && E.s && (this.leads.get(E.s) ?? 0) >= FX.early); }

  /** The way from a unit to its target: its facing, and the direction to the target (else its own). @param {number} id @param {number} target */
  way(id, target) {
    const a = this.places.get(id), b = this.places.get(target);
    if (!a) return { facing: 1, dir: [1, 0, 0] };
    if (!b) return { facing: a.facing, dir: a.dir };
    const d = [b.feet[0] - a.feet[0], 0, b.feet[2] - a.feet[2]];
    return { facing: Math.sign(d[0]) || a.facing, dir: Math.hypot(d[0], d[2]) > 1e-6 ? d : a.dir };
  }

  /**
   * A unit's start effects, once a frame: the ones that wait as the attack starts, the others as it strikes; turned by
   * the unit's facing and direction (operators) or toward the target. @param {number} id @param {number} target @param {boolean} waits
   */
  start(id, target, waits) {
    const E = this.by(id), at = this.places.get(id);
    if (!E || !E.s || this.early(E) !== waits || !at || this.started.get(id) === this.frame) return;
    this.started.set(id, this.frame);
    const way = this.keys.get(id)?.startsWith('char_') ? { facing: at.facing, dir: at.dir } : this.way(id, target);
    for (const n of E.ss ?? [E.s]) this.play(n, at.feet, way, 'start');
  }

  /** A shot leaving: the start effect, and its projectile's trail flying to the target. @param {number} id @param {number} target */
  shot(id, target) {
    this.start(id, target, false);
    const E = this.by(id), a = this.places.get(id), b = this.places.get(target);
    if (!E || !E.t || !a || !b) return;
    const from = this.chest(a.feet), to = this.chest(b.feet), d = [to[0] - from[0], 0, to[2] - from[2]], d0 = Math.max(0.3, Math.hypot(d[0], d[2])), v = E.v || FX.speed;
    const inst = this.play(E.t, from, { facing: 1, dir: d }, 'trail');
    if (inst) this.flights.push({ inst, src: id, target, pos: from, d0, h0: from[1], arc: E.arc || 0, speed: v, t: 0, T: d0 / v + FX.overtime });
  }

  /** A hit (or heal) landing: its projectile stops; a melee start effect; the hit effect at the target. @param {number} id @param {number} target */
  hit(id, target) {
    const f = this.flights.find((x) => x.src === id && x.target === target);
    if (f) { f.inst.stop(); this.flights = this.flights.filter((x) => x !== f); }
    const E = this.by(id), b = this.places.get(target);
    if (!E || !b) return;
    if (!E.t) this.start(id, target, false);
    const way = this.way(id, target);
    for (const n of E.hs ?? (E.h ? [E.h] : [])) this.play(n, this.chest(b.feet), way, 'hit');
  }

  /** Each flight moves toward its target's chest along its arc. @param {number} dt */
  fly(dt) {
    this.flights = this.flights.filter((f) => {
      const b = this.places.get(f.target);
      f.t += dt;
      if (!b || f.t > f.T) { f.inst.stop(); return false; }
      const to = this.chest(b.feet), d = [to[0] - f.pos[0], 0, to[2] - f.pos[2]], dist = Math.hypot(d[0], d[2]), k = Math.min(1, (f.speed * dt) / (dist || 1));
      f.pos = [f.pos[0] + d[0] * k, 0, f.pos[2] + d[2] * k];
      const p = Math.min(1, Math.max(0, 1 - Math.max(0, dist - f.speed * dt) / f.d0));
      const h = f.h0 + (to[1] - f.h0) * p + f.arc * 4 * p * (1 - p);
      f.inst.R = rootAlong([f.pos[0], h, f.pos[2]], dist > 1e-3 ? d : f.inst.R.ex);
      return true;
    });
  }

  /**
   * A 炼金单元 thrown (渲染-25; the engine's 技能-13): its thrower's skill's throw in the pack (`z` by the skill's number) —
   * its trail flies from the thrower's chest to the landing tile at its speed along its arc, then what it plays where it
   * lands loops there until the 炼金单元's frames are over. Without a throw in the pack, nothing.
   * @param {Record<string, string | number>} e
   */
  alchemy(e) {
    const src = Number(e.src), key = this.keys.get(src) ?? '', Z = this.pack.data.by[key]?.z?.[this.skills[key]];
    if (!Z) return;
    const x = Number(e.x), y = Number(e.y), z = this.heightAt(x, y), at = this.places.get(src);
    const to = toThree(tileWorld(this.level, x, y, z)), from = at ? this.chest(at.feet) : to, d = [to[0] - from[0], 0, to[2] - from[2]], dist = Math.hypot(d[0], d[2]);
    const trail = Z.t && dist > 1e-3 ? this.play(Z.t, from, { facing: 1, dir: d }, 'trail') : null;
    this.pots.push({ Z, x, y, z, from, to, arc: Z.arc || 0, T: trail ? dist / (Z.v || FX.speed) : 0, t: 0, end: Number(e.frames) / FPS, ...driftOf(e), trail, landed: null });
  }

  /** A tile's height level: 1 on high ground. @param {number} x the column @param {number} y the row */
  heightAt(x, y) { return this.level.tiles?.[y]?.[x]?.height === 'HIGHLAND' ? 1 : 0; }

  /**
   * The 炼金单元 over dt seconds (渲染-25): the trail along its arc until it lands, then its effects at the landing tile —
   * moved by its drift and scaled with its radius while it drifts —; all of them stop when it ends.
   * @param {number} dt
   */
  potsStep(dt) {
    this.pots = this.pots.filter((p) => {
      p.t += dt;
      if (p.t >= p.end) { p.trail?.stop(); for (const i of p.landed ?? []) i.stop(); return false; }
      if (!p.landed && p.t >= p.T) {
        p.trail?.stop(); p.trail = null;
        p.landed = /** @type {any[]} */ (p.Z.r ?? []).map((n) => this.play(n, p.to, NOWHERE, 'loop')).filter((i) => i !== null);
      } else if (p.trail) {
        const k = p.t / p.T, pos = [0, 1, 2].map((i) => p.from[i] + (p.to[i] - p.from[i]) * k);
        pos[1] += p.arc * 4 * k * (1 - k);
        p.trail.R = rootAlong(pos, [p.to[0] - p.from[0], 0, p.to[2] - p.from[2]]);
      }
      if (p.landed && p.drift > 0) {
        const s = Math.min(p.t, p.drift), o = toThree(tileWorld(this.level, p.x + p.vx * s, p.y + p.vy * s, p.z)), k = (p.r0 + p.grow * s) / p.r0;
        for (const i of p.landed) { const R = rootAt(o, 1); i.R = { o, ex: R.ex.map((v) => v * k), ey: R.ey.map((v) => v * k), ez: R.ez.map((v) => v * k) }; }
      }
      return true;
    });
  }

  /** The units' places: operators face by their direction, enemies by how they moved. @param {import('@aue/schema').View} view */
  track(view) {
    for (const u of view.units) {
      const old = this.places.get(u.id), feet = toThree(tileWorld(this.level, u.x, u.y, u.z)), op = u.kind === KIND.OPERATOR;
      const facing = op ? (u.dir === DIR.LEFT ? -1 : 1) : old ? Math.sign(feet[0] - old.feet[0]) || old.facing : 1;
      this.places.set(u.id, { feet, facing, dir: op ? DIR_VEC[u.dir] ?? [1, 0, 0] : [facing, 0, 0], kind: u.kind, running: u.skill === SKILL_STATE.RUNNING, seen: view.frame });
    }
    for (const [id, p] of this.places) if (view.frame - p.seen > 30) this.places.delete(id);
    this.trackStatuses(view);
  }

  /** Each shown status a unit has plays its effect for as long as it lasts (渲染-12). @param {import('@aue/schema').View} view */
  trackStatuses(view) {
    const seen = new Set();
    for (const u of view.units) {
      for (const [name, bit] of Object.entries(STATUS_BIT)) {
        const k = `${u.id}:${bit}`, n = this.named[`status_${name}`], at = this.places.get(u.id);
        if (!(u.status & bit) || !n || !at) continue;
        seen.add(k);
        if (this.statuses.has(k)) continue;
        const lift = LIFT[this.pack.data.fx[n]?.sl] ?? 0, inst = this.play(n, this.lifted(at.feet, lift), { facing: at.facing, dir: at.dir }, 'loop');
        if (inst) this.statuses.set(k, { inst, id: u.id, lift });
      }
    }
    for (const [k, s] of this.statuses) if (!seen.has(k)) { s.inst.stop(); this.statuses.delete(k); }
  }

  /** A unit deploying or dying (渲染-12): its effect at its feet. @param {string} type @param {number} id */
  role(type, id) {
    const at = this.places.get(id);
    if (!at) return;
    const n = type === 'deploy' ? this.named.deploy : at.kind === KIND.OPERATOR ? this.named.die_operator : this.named.die_enemy;
    this.play(n, at.feet, { facing: at.facing, dir: at.dir }, 'start');
  }

  /**
   * A frame: the units' places and keys, then its events. @param {import('@aue/schema').View} view
   * @param {Record<string, string>} newKeys @param {Record<string, string | number>[]} events
   */
  update(view, newKeys, events) {
    this.frame = view.frame;
    for (const [id, k] of Object.entries(newKeys)) this.keys.set(Number(id), k);
    this.track(view);
    for (const e of events) {
      const id = Number(e.id), target = Number(e.target);
      if (e.type === 'attack') this.start(id, target, true);
      else if (e.type === 'shot') this.shot(id, target);
      else if (e.type === 'hit' || e.type === 'heal') this.hit(id, target);
      else if (e.type === 'deploy' || e.type === 'death') this.role(String(e.type), id);
      else if (e.type === 'alchemy') this.alchemy(e);
      else if (e.type === 'thunder') this.thunder(id, Number(e.phase));
    }
  }

  /**
   * Lightning on a 锦标 ball (渲染-27): its warning from the warning on, kept on the ball; at the bolt the warning stops,
   * the bolt plays at the ball and its burning starts, kept on it until it is over. @param {number} id @param {number} phase 0 warn, 1 strike, 2 over
   */
  thunder(id, phase) {
    const at = this.places.get(id), was = this.storms.get(id);
    if (was) { was.inst.stop(); this.storms.delete(id); }
    if (!at) return;
    if (phase === 1) this.play(this.named.thunder_hit, at.feet, { facing: 1, dir: [1, 0, 0] }, 'start');
    const n = phase === 0 ? this.named.thunder_warn : phase === 1 ? this.named.thunder_burn : undefined;
    const lift = LIFT[this.pack.data.fx[n ?? '']?.sl] ?? 0, inst = n ? this.play(n, this.lifted(at.feet, lift), { facing: 1, dir: [1, 0, 0] }, 'loop') : null;
    if (inst) this.storms.set(id, { inst, id, lift });
  }

  /** Advances the effects by dt seconds of battle time and draws them for the camera. @param {number} dt @param {THREE.Camera} camera */
  step(dt, camera) {
    const cam = cameraAxes(camera);
    this.up = cam.up;
    this.fly(dt);
    this.potsStep(dt);
    for (const s of [...this.statuses.values(), ...this.storms.values()]) { const at = this.places.get(s.id); if (at) s.inst.R = { ...s.inst.R, o: this.lifted(at.feet, s.lift) }; }
    this.live = this.live.filter((i) => {
      i.step(dt);
      if (i.done) { this.object.remove(i.group); i.dispose(); return false; }
      i.draw(cam);
      return true;
    });
  }

  count() { return this.live.length; }

  dispose() { for (const i of this.live) i.dispose(); this.live = []; this.flights = []; this.pots = []; this.statuses.clear(); this.field.clear(); this.storms.clear(); this.object.clear(); }
}

/**
 * The effects system for a level. @param {FxPack} pack @param {FxLevel} level
 * @param {{ skills?: Record<string, number>, seat?: number }} [o] each operator's skill (1-based) by its content key; the viewer's seat
 */
export const createEffects = (pack, level, o) => new Effects(pack, level, o);

/**
 * Loads an effect pack (渲染-10): its data and its textures (data URIs; repeating unless the pack clamps them; used as
 * they are, no colour-space conversion). @param {any} data @returns {Promise<FxPack>}
 */
export async function loadEffectPack(data) {
  const loader = new THREE.TextureLoader(), textures = new Map(), clamp = new Set(data.clamp || []);
  await Promise.all(Object.entries(data.tex).map(async ([k, uri]) => {
    const t = await loader.loadAsync(/** @type {string} */ (uri)).catch(() => null);
    if (!t) return;
    if (!clamp.has(k)) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    textures.set(k, t);
  }));
  return { data, textures };
}
