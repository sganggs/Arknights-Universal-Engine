// What a kit keeps in `unit.trait` that the engine keeps too (docs/spec/compat.md 兼容-4): Stronghold's profession installs
// keep their own state there — a 解放者's ramp, a 驭械术师's drone ramp, a 傀儡师's phase — and the kits that apply their
// operator's trait themselves read and write it. Here the same names read the engine's own state of the deployed
// operator and a write changes it, so the kit and the engine's trait never disagree about it (ADR 0057: nothing is
// stored twice). While the piece is not on the field, or its branch has no such state, a field is a plain value.
import { KIND, traits, buffs } from '@aue/sim';

/** @typedef {import('./unit.js').ShUnit} ShUnit @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').Content} Content */

/** The buff of a key a unit holds, or null. @param {Unit} u @param {string} key */
const held = (u, key) => u.buffs.find((b) => b.key === key) ?? null;

/** @param {number} v @param {number} lo @param {number} hi */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** The engine's unit of a piece on the field, with the content, or null (a piece keeps its last deployment's unit after it left). @param {ShUnit} p */
const onField = (p) => (p.u && p.u.kind === KIND.OPERATOR && p.deployed ? { c: p.b.c, u: p.u } : null);

/**
 * The ramp of a 解放者 (Stronghold's `trait.ramp`, a share of its attack): the attack bonus of the engine's `charge` buff
 * (职业-12). A write goes to the nearest step of the charge, at most all its steps.
 * @param {ShUnit} p @param {Record<string, any>} own
 */
const ramp = (p, own) => ({
  get() {
    const e = onField(p), ch = e && traits.traitOf(e.c, e.u).charge, b = e && ch ? held(e.u, 'charge') : null;
    return ch ? b?.mods.atkPct ?? 0 : own.ramp;
  },
  set(/** @type {unknown} */ v) {
    const e = onField(p), ch = e && traits.traitOf(e.c, e.u).charge, b = e && ch ? held(e.u, 'charge') : null;
    if (!e || !ch) { own.ramp = v; return; }
    if (!b) return;
    const n = ch.atk > 0 ? clamp(Math.round((Number(v) * ch.steps) / ch.atk), 0, ch.steps) : 0;
    buffs.retune(e.u, b, n, n > 0 ? { atkPct: (ch.atk * n) / ch.steps } : {});
  },
});

/** The funnel and its `funnel` buff of a piece on the field (职业-12), or null. @param {ShUnit} p */
function funnelOf(p) {
  const e = onField(p), f = e ? traits.funnelNow(p.b.w, e.c, e.u) : null, b = e && f ? held(e.u, 'funnel') : null;
  return e && f && b ? { u: e.u, f, b } : null;
}

/** The 倍率 of a drone's latest attack: `init` with no target yet, else `init` + `delta` for each attack after the first, at most `max`. @param {{ f: { init: number, delta: number, max: number }, b: { value: number, n: number } }} s */
const scaleOf = (s) => (s.b.value < 0 ? s.f.init : Math.min(s.f.max, s.f.init + s.f.delta * s.b.n));

/**
 * A 驭械术师's drone ramp (Stronghold's `trait.funnelTarget` and `trait.funnelScale`): the engine's `funnel` buff — the id of
 * the latest target, the count of attacks on it (职业-12). Writing the target begins the ramp on it; writing the scale
 * sets the count that gives it.
 * @param {ShUnit} p @param {Record<string, any>} own
 */
const target = (p, own) => ({
  get() { const s = funnelOf(p); return s ? (s.b.value >= 0 ? s.b.value : null) : own.funnelTarget ?? null; },
  set(/** @type {any} */ v) {
    const s = funnelOf(p);
    if (!s) { own.funnelTarget = v; return; }
    buffs.retune(s.u, s.b, Number.isInteger(v) && v >= 0 ? v : -1, {});
    buffs.count(s.b, -s.b.n);
  },
});

/** @param {ShUnit} p @param {Record<string, any>} own */
const scale = (p, own) => ({
  get() { const s = funnelOf(p); return s ? scaleOf(s) : own.funnelScale; },
  set(/** @type {unknown} */ v) {
    const s = funnelOf(p);
    if (!s) { own.funnelScale = v; return; }
    const n = s.f.delta > 0 ? Math.max(0, Math.round((Number(v) - s.f.init) / s.f.delta)) : 0;
    buffs.count(s.b, n - s.b.n);
  },
});

/**
 * The 倍率 the engine's funnel gives the next attack of a piece on a target: `init` on another target than the latest, else
 * one step more; 1 for a piece without one on the field (the `funnelMul` of its profile, unit.js).
 * @param {ShUnit} p @param {Unit | null} t
 */
export function funnelNext(p, t) {
  const s = funnelOf(p);
  if (!s || !t) return 1;
  return s.b.value === t.id ? Math.min(s.f.max, s.f.init + s.f.delta * (s.b.n + 1)) : s.f.init;
}

/**
 * The ramp per target (Stronghold's `trait.funnelMap`, a Map by enemy id of `{ s, t }`): the engine keeps the ramp of its
 * latest target only, so the map has that one; `t`, the time of its last step, is never now. A map written back sets the
 * ramp of the latest target when it has one.
 * @param {ShUnit} p @param {Record<string, any>} own
 */
const map = (p, own) => ({
  get() {
    const s = funnelOf(p);
    return s ? new Map(s.b.value >= 0 ? [[s.b.value, { s: scaleOf(s), t: -Infinity }]] : []) : own.funnelMap;
  },
  set(/** @type {any} */ m) {
    const s = funnelOf(p);
    if (!s) { own.funnelMap = m; return; }
    const v = m instanceof Map && s.b.value >= 0 ? m.get(s.b.value)?.s : undefined;
    if (Number.isFinite(v)) buffs.count(s.b, Math.max(0, s.f.delta > 0 ? Math.round((v - s.f.init) / s.f.delta) : 0) - s.b.n);
  },
});

/**
 * A 傀儡师's phase (Stronghold's `trait.doll` and `trait.dollSwitching`), from the engine's doll buff (职业-15): the 替身
 * from the start of the switch to it until it ends; switching on the way to it and on the way back.
 * @param {ShUnit} p @param {'doll' | 'dollSwitching'} name @param {Record<string, any>} own
 */
const phase = (p, name, own) => ({
  get() {
    const e = onField(p);
    if (!e || !traits.traitOf(e.c, e.u).doll) return own[name] ?? false;
    const ph = traits.dollPhase(e.u), P = traits.DOLL_PHASE;
    return name === 'doll' ? ph === P.IN || ph === P.DOLL : ph === P.IN || ph === P.OUT;
  },
  set(/** @type {unknown} */ v) {
    const e = onField(p);
    if (e && traits.traitOf(e.c, e.u).doll) p.noteGap(`trait.${name}`);
    else own[name] = v;
  },
});

/**
 * A piece's `trait`: Stronghold's per-unit state of its profession, as a plain object a kit may add its own fields to, with
 * the fields above over the engine's state (a `ramp`, the funnel's, a doll's).
 * @param {ShUnit} p @returns {Record<string, any>}
 */
export function traitOfPiece(p) {
  /** @type {Record<string, any>} */
  const own = {}, t = {};
  const fields = { ramp: ramp(p, own), funnelTarget: target(p, own), funnelScale: scale(p, own), funnelMap: map(p, own), doll: phase(p, 'doll', own), dollSwitching: phase(p, 'dollSwitching', own) };
  for (const [k, a] of Object.entries(fields)) Object.defineProperty(t, k, { ...a, enumerable: true, configurable: true });
  return t;
}
