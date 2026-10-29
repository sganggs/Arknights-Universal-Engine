// The layout pass (docs/spec/ui.md 界面-2–界面-4, 界面-24, 界面-29, 界面-30): every frame each shown node's box from its
// rect (or its layout group's placement, or its fitter), written as CSS only when it changed; content size fitters,
// best-fit texts, scalers, stencil masks, what takes taps.
import { originCss, rectBox, transformCss } from './rect.js';
import { arrange, gridArrange, prefSize } from './groups.js';
import { paintGraphic, rgba, sty } from './paint.js';
import { stencilUri } from './raster.js';
import { bestFit, fitSize } from './text.js';
import { applyScaler, fitRect, screenBox } from './fit.js';
import { rayPass } from './rays.js';
import { refNode } from './node.js';

/** @typedef {import('./node.js').UiNode} UiNode */

/**
 * A soft mask that reads another node's graphic (界面-4): its subtree shows through that graphic's sprite at the
 * graphic's box — by the sprite's alpha, or by its brightness for a colour channel (INF-0192) — and not outside it.
 * @param {UiNode} s @param {{ ch: string, mask?: string }} sm
 */
function softMask(s, sm) {
  const m = refNode(s, sm.mask), sp = m ? maskSprite(m) : null;
  if (!m?.box || !sp) return;
  const [x, y] = offsetIn(m, s), url = `url("${s.scr.ctx.base}${sp.uri}")`, size = `${m.box[2].toFixed(2)}px ${m.box[3].toFixed(2)}px`, at = `${x.toFixed(2)}px ${y.toFixed(2)}px`;
  // not clipped to the node's own box: the mask graphic's box may be larger
  for (const [k, v] of [['maskImage', url], ['maskSize', size], ['maskPosition', at], ['maskRepeat', 'no-repeat'], ['maskClip', 'no-clip']]) { sty(s, s.el, k, v); sty(s, s.el, `webkit${k[0].toUpperCase()}${k.slice(1)}`, v); }
  sty(s, s.el, 'maskMode', sm.ch === 'a' ? 'alpha' : 'luminance');
}

/** The sprite a node's graphic draws, or null. @param {UiNode} m */
function maskSprite(m) {
  const key = m.sprite ?? m.n.comps.img?.ref;
  return key ? m.scr.ctx.pack.sprites[key] ?? null : null;
}

/** A node's box's corner in an ancestor's box. @param {UiNode} m @param {UiNode} s @returns {number[]} */
function offsetIn(m, s) {
  let x = 0, y = 0;
  for (let n = /** @type {UiNode | null} */ (m); n && n !== s; n = n.parent) { x += n.box?.[0] ?? 0; y += n.box?.[1] ?? 0; }
  return [x, y];
}

/** The masks over a laid-out node's subtree: a soft mask reading another graphic, the stencil groups. @param {UiNode} s @param {number} w @param {number} h */
function masks(s, w, h) {
  if (s.n.comps.softMask?.mask) softMask(s, s.n.comps.softMask);
  if (s.stW) applyStencil(s, s.stW, w, h);
  for (const k of s.kids) if (k.stOuter && k.box) applyStencil(k, k.stOuter, k.box[2], k.box[3], [k.box[0], k.box[1]]);
}

/** A node not laid out: hidden, and its subtree not shown. @param {UiNode} s */
function markHidden(s) { for (const k of s.kids) { k.shown = false; markHidden(k); } }

/**
 * A stencil group's mask: its writer's shape at the writer's box, as the group's CSS mask (everything but the shape
 * for readers that draw outside it).
 * @param {UiNode} s the masked node @param {UiNode} k the writer @param {number} w @param {number} h @param {number[]} [off]
 */
function applyStencil(s, k, w, h, off = [0, 0]) {
  if (!k.box || !k.active) {
    if (s.stKey) { s.stKey = ''; sty(s, s.el, 'webkitMaskImage', 'none'); sty(s, s.el, 'maskImage', 'none'); }
    return;
  }
  const box = [k.box[0] - off[0], k.box[1] - off[1], k.box[2], k.box[3]], key = [w, h, ...box].map((v) => Math.round(v)).join(',') + (s.stOut ? 'o' : '');
  if (s.stKey === key) return;
  s.stKey = key;
  const uri = stencilUri(s.scr.ctx, k, box, [w, h], s.stOut);
  if (!uri) return;
  const v = `url("${uri}")`;
  for (const [a, b] of [['webkitMaskImage', v], ['maskImage', v], ['webkitMaskSize', '100% 100%'], ['maskSize', '100% 100%'], ['webkitMaskRepeat', 'no-repeat'], ['maskRepeat', 'no-repeat']]) sty(s, s.el, a, b);
}

/**
 * A text's size for its box: Unity's best fit; a multiline best fit, the largest size not above the text's own that
 * fits the box when wrapped at its width (界面-29); a scaler's factor on the text's size (界面-30).
 * @param {UiNode} s @param {number} w @param {number} h
 */
function fitText(s, w, h) {
  const tc = s.n.comps.text, mb = s.n.comps.bestFit;
  if (!s.t) return;
  if (tc.best === 1) {
    const max = tc.max * s.fontK, size = bestFit(s.scr.ctx.measure(s, max), max, [w, h], [Math.max(1, tc.min * s.fontK), max]);
    sty(s, s.t, 'fontSize', `${size}px`);
  } else if (mb) {
    const key = `${s.txt}|${Math.round(w)}|${Math.round(h)}|${s.fontK}`;
    if (key === s.fitKey) return;
    s.fitKey = key;
    const top = Math.round(tc.size * s.fontK), fits = (/** @type {number} */ z) => { const m = s.scr.ctx.measure(s, z); return m[1] <= h + 0.5 && m[0] <= w + 0.5; };
    sty(s, s.t, 'fontSize', `${fitSize(fits, Math.max(1, mb.min), top)}px`);
  } else if (s.fontK !== 1) sty(s, s.t, 'fontSize', `${tc.size * s.fontK}px`);
}

/**
 * A node's box in its parent: its layout group's placement, else its rect (a content size fitter sizes a rect on an
 * axis its anchors do not stretch).
 * @param {UiNode} s @param {number} PW @param {number} PH @param {readonly number[]} ppivot
 */
function boxOf(s, PW, PH, ppivot) {
  if (s.n.comps.fullscreen) return screenBox(s);
  const csf = s.n.comps.csf, rt = fitRect(s, PW, PH);
  if (csf) for (const a of [0, 1]) if (csf[a] && rt.amin[a] === rt.amax[a]) rt.size[a] = prefSize(s, a);
  if (s.lgRect) return { left: s.lgRect.x, top: s.lgRect.y, w: s.lgRect.w, h: s.lgRect.h };
  return rectBox(rt, PW, PH, ppivot, s.lp);
}

/**
 * Lays out a node and its subtree in a parent of PW × PH (y down) and paints it.
 * @param {UiNode} s @param {number} PW @param {number} PH @param {readonly number[]} ppivot @param {boolean} shownUp
 */
export function layout(s, PW, PH, ppivot, shownUp) {
  sty(s, s.el, 'display', s.active ? '' : 'none');
  s.shown = shownUp && s.active;
  // a hidden subtree is marked once, when it turns hidden
  if (!s.active) { if (!s.sealed) { markHidden(s); s.sealed = true; } return; }
  s.sealed = false;
  const { left, top, w, h } = boxOf(s, PW, PH, ppivot), rt = s.rt;
  sty(s, s.el, 'left', `${left.toFixed(2)}px`);
  sty(s, s.el, 'top', `${top.toFixed(2)}px`);
  sty(s, s.el, 'width', `${Math.max(0, w).toFixed(2)}px`);
  sty(s, s.el, 'height', `${Math.max(0, h).toFixed(2)}px`);
  sty(s, s.el, 'transformOrigin', originCss(rt));
  sty(s, s.el, 'transform', transformCss(rt));
  sty(s, s.el, 'opacity', String(+s.alpha.toFixed(3)));
  s.w = w; s.h = h; s.box = [left, top, w, h];
  if (s.t && s.color) { sty(s, s.t, 'color', rgba(s.color)); fitText(s, w, h); }
  paintGraphic(s, w, h);
  rayPass(s);
  if (s.n.comps.scaler) applyScaler(s);
  if (s.n.comps.lg) arrange(s, w, h);
  else if (s.n.comps.grid) gridArrange(s, w, h);
  for (const k of s.kids) layout(k, w, h, rt.pivot, s.shown);
  masks(s, w, h);
}
