// Fitting a node to its parent or the screen (docs/spec/ui.md 界面-30): an aspect ratio fitter (Unity's modes), a
// background covering its parent at its picture's ratio, a picture filling the whole screen, and a scaler that keeps a
// subtree in proportion to its root's size.
import { refNode } from './node.js';

/** @typedef {import('./node.js').UiNode} UiNode */
/** @typedef {import('./rect.js').Rect} Rect */

/**
 * The size an aspect ratio fitter gives a rect in a parent of PW × PH (Unity's AspectRatioFitter): width controls
 * height (1), height controls width (2), fit inside the parent (3), cover the parent (4); null for none (0).
 * @param {number} mode @param {number} ratio width ÷ height @param {number[]} own the rect's current size
 * @param {number} PW @param {number} PH @returns {number[] | null}
 */
export function aspectSize(mode, ratio, own, PW, PH) {
  const r = ratio > 0 ? ratio : 1;
  if (mode === 1) return [own[0], own[0] / r];
  if (mode === 2) return [own[1] * r, own[1]];
  if (mode !== 3 && mode !== 4) return null;
  const wide = PW / Math.max(1e-6, PH) > r;
  return (mode === 3) === wide ? [PH * r, PH] : [PW, PW / r];
}

/**
 * A node's rect after its fitters (界面-30): an aspect ratio fitter or a background cover sets its size (fit and cover
 * also centre it on its parent by stretching anchors); a background whose own rect already covers what the cover
 * would keeps its own rect (INF-0191). Its fitted rect is a copy so the next layout still reads its own size delta.
 * @param {UiNode} s @param {number} PW @param {number} PH @returns {Rect}
 */
export function fitRect(s, PW, PH) {
  const c = s.n.comps, f = c.aspect ?? (c.bgFit ? { mode: 4, ratio: c.bgFit.ratio } : null);
  if (!f || !f.mode) return s.rt;
  const rt = c.aspect ? s.rt : { ...s.rt }, own = [(rt.amax[0] - rt.amin[0]) * PW + rt.size[0], (rt.amax[1] - rt.amin[1]) * PH + rt.size[1]];
  let size = aspectSize(f.mode, f.ratio, own, PW, PH);
  if (!size) return rt;
  if (!c.aspect && own[0] >= size[0] && own[1] >= size[1]) size = own;
  if (f.mode >= 3) { rt.amin = [0, 0]; rt.amax = [1, 1]; rt.pos = [0, 0]; rt.size = [size[0] - PW, size[1] - PH]; return rt; }
  const a = f.mode === 1 ? 1 : 0;
  rt.size[a] = size[a] - (rt.amax[a] - rt.amin[a]) * (a === 0 ? PW : PH);
  return rt;
}

/**
 * A full-screen picture's box in its parent (界面-30): the whole canvas of its screen, from wherever its parent is.
 * @param {UiNode} s @returns {{ left: number, top: number, w: number, h: number }}
 */
export function screenBox(s) {
  let x = 0, y = 0;
  for (let n = s.parent; n; n = n.parent) { x += n.box?.[0] ?? 0; y += n.box?.[1] ?? 0; }
  const root = s.scr.root;
  return { left: -x, top: -y, w: root.w, h: root.h };
}

/**
 * A scaler's factor: its target's size against the size recorded for it (the smaller of the two axes), or null.
 * @param {UiNode} s @returns {number | null}
 */
export function scalerFactor(s) {
  const sc = s.n.comps.scaler, target = sc ? refNode(s, sc.target) : null;
  const made = target ? sc.steps.find((/** @type {any} */ st) => st.rt === sc.target) : null;
  if (!target?.box || !made || made.size[0] <= 0) return null;
  const k = made.size[1] > 0 ? Math.min(target.w / made.size[0], target.h / made.size[1]) : target.w / made.size[0];
  return Number.isFinite(k) && k > 0 ? k : null;
}

/**
 * A scaler (界面-30): its root's size against the size its subtree was made at gives a factor; each recorded node's
 * position and size (and its text's size) are the recorded ones times the factor. Nodes the scaler recorded outside
 * the prefab are left as they are.
 * @param {UiNode} s the scaler's node, laid out
 */
export function applyScaler(s) {
  const sc = s.n.comps.scaler, k = scalerFactor(s), target = refNode(s, sc.target);
  if (k == null || Math.abs(k - (s.scaleK ?? 1)) < 1e-4) return;
  s.scaleK = k;
  for (const st of sc.steps) {
    const n = st.rt ? refNode(s, st.rt) : null;
    if (!n || n === target) continue;
    n.rt.pos = [st.pos[0] * k, st.pos[1] * k];
    n.rt.size = [st.size[0] * k, st.size[1] * k];
    if (st.text && n.n.comps.text) n.fontK = (st.text.size * k) / n.n.comps.text.size;
  }
}
