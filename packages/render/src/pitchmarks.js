// 阵地足球's field marks (docs/spec/render.md 渲染-26): the 守门位's tiles and the ice and slime as flat translucent
// squares on their tiles, drawn before the units like the range — those whose effects the pack has are drawn by the
// effects instead —; and each ball's kick so far as an arrow from its centre along the summed direction, a tile long at
// its threshold.
import * as THREE from 'three';
import { toThree, tileWorld } from './camera.js';

/** The marks' colours (sRGB) and opacity (渲染-26): the 守门位's blue, the ice's pale cyan, the slime's yellow-green, the arrow's white. */
export const PITCH_MARKS = Object.freeze({
  spot: Object.freeze([0.16, 0.55, 1]), ice: Object.freeze([0.7, 0.93, 1]), slime: Object.freeze([0.6, 0.8, 0.2]), arrow: Object.freeze([1, 1, 1]), opacity: 0.45,
});

/** No kinds drawn by the effects. */
const NONE = new Set();
/** How far above its tile a mark lies, so it does not fight the ground. */
const LIFT = 0.012;
/** An arrow's width, in tiles. */
const ARROW_WIDTH = 0.08;

/** What the page gives (渲染-26): the 守门位's tiles, the ice (< 0) and slime (> 0) by tile, each ball's kick so far. */
/** @typedef {{ spots: readonly number[], cover: Readonly<Record<string, number>>, kicks: readonly { x: number, y: number, ax: number, ay: number, share: number }[] }} PitchState */

/**
 * The field marks layer. @param {import('./range.js').RangeLevel} level
 */
export function createPitchMarks(level) {
  const group = new THREE.Group(), quad = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const material = (/** @type {readonly number[]} */ c) => new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace), transparent: true, opacity: PITCH_MARKS.opacity, depthWrite: false,
  });
  const mats = { spot: material(PITCH_MARKS.spot), ice: material(PITCH_MARKS.ice), slime: material(PITCH_MARKS.slime), arrow: material(PITCH_MARKS.arrow) };
  /** The height of a tile's surface. @param {number} row @param {number} col */
  const h = (row, col) => (level.tiles[row]?.[col]?.height === 'HIGHLAND' ? 1 : 0);
  /** A square on a tile. @param {number} key @param {THREE.Material} m */
  const square = (key, m) => {
    const row = Math.floor(key / level.width), col = key % level.width;
    if (!level.tiles[row]?.[col]) return;
    const q = new THREE.Mesh(quad, m), p = toThree(tileWorld(level, col, row, h(row, col)));
    q.position.set(p[0], p[1] + LIFT, p[2]);
    q.renderOrder = -1;
    group.add(q);
  };
  return {
    object: group,
    /**
     * Shows the marks (渲染-26); null for none. @param {PitchState | null} s
     * @param {ReadonlySet<string>} [drawn] the kinds (`spot`, `ice`, `slime`) the effects draw
     */
    show(s, drawn = NONE) {
      for (const c of group.children) if (/** @type {THREE.Mesh} */ (c).geometry !== quad) /** @type {THREE.Mesh} */ (c).geometry.dispose();
      group.clear();
      if (!s) return;
      for (const [k, v] of Object.entries(s.cover)) if (!drawn.has(v < 0 ? 'ice' : 'slime')) square(Number(k), v < 0 ? mats.ice : mats.slime);
      if (!drawn.has('spot')) for (const k of s.spots) square(k, mats.spot);
      for (const a of s.kicks) {
        const len = Math.hypot(a.ax, a.ay), share = Math.min(1, Math.max(0, a.share));
        if (!(len > 0) || !(share > 0)) continue;
        const ux = a.ax / len, uy = a.ay / len, row = Math.round(a.y), col = Math.round(a.x);
        const from = toThree(tileWorld(level, a.x, a.y, h(row, col))), to = toThree(tileWorld(level, a.x + ux * share, a.y + uy * share, h(row, col)));
        const g = new THREE.PlaneGeometry(1, ARROW_WIDTH).rotateX(-Math.PI / 2);
        const q = new THREE.Mesh(g, mats.arrow);
        q.position.set((from[0] + to[0]) / 2, from[1] + LIFT * 2, (from[2] + to[2]) / 2);
        q.scale.set(Math.hypot(to[0] - from[0], to[2] - from[2]), 1, 1);
        q.rotation.y = -Math.atan2(to[2] - from[2], to[0] - from[0]);
        q.renderOrder = -1;
        group.add(q);
      }
    },
    count: () => group.children.length,
    dispose() {
      for (const c of group.children) if (/** @type {THREE.Mesh} */ (c).geometry !== quad) /** @type {THREE.Mesh} */ (c).geometry.dispose();
      group.clear(); quad.dispose();
      for (const m of Object.values(mats)) m.dispose();
    },
  };
}
