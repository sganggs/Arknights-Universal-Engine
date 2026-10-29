// The tile highlight and the attack range without a GPU (docs/spec/render.md 渲染-8, 渲染-9): the highlight factor,
// the highlight texture and the terrain materials it patches; the range quads, their look and their scrolling.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { tinyContent } from '@aue/testkit';
import { HIGHLIGHT, highlightFactor, RANGE, tileWorld, toThree } from '../src/index.js';
import { createHighlight } from '../src/highlight.js';
import { createRange } from '../src/range.js';
import { createTileMarks, TILE_MARKS } from '../src/tilemarks.js';
import { createPitchMarks, PITCH_MARKS } from '../src/pitchmarks.js';
import { createTerrain } from '../src/terrain.js';

const level = tinyContent().level;

test('[渲染-8] the highlight factor: 1 at 0.5, darker below, brighter above, up to 3.5', () => {
  assert.deepEqual([0, 0.25, 0.5, 0.6, 1, 1.5].map((h) => Math.round(highlightFactor(h) * 1000) / 1000), [0, 0.5, 1, 1.5, 3.5, 3.5]);
  assert.equal(highlightFactor(HIGHLIGHT.normal), 1);
});

test('[渲染-8] the highlight texture: one texel per tile, the chosen tiles at the deployable value, the rest at 0.5', () => {
  const h = createHighlight(level), data = /** @type {Float32Array} */ (h.map.image.data);
  assert.deepEqual([h.map.image.width, h.map.image.height, h.map.magFilter], [6, 3, THREE.NearestFilter]);
  h.set([7, 8]);
  const on = Math.fround(HIGHLIGHT.deployable);
  assert.deepEqual([data[7 * 4], data[8 * 4 + 3], data[0], data[9 * 4]], [on, on, 0.5, 0.5]);
  h.set(null);
  assert.ok(data.every((v) => v === HIGHLIGHT.normal));
  // the texel the shader takes for a fragment at a tile's centre is that tile's: u = (x + w/2)/w, v = (h/2 − z)/h
  for (const [col, row] of [[0, 0], [5, 2], [3, 1]]) {
    const [x, , z] = toThree(tileWorld(level, col, row, 0));
    assert.deepEqual([Math.floor(((x + 3) / 6) * 6), Math.floor(((1.5 - z) / 3) * 3)], [col, row]);
  }
  h.dispose();
});

test('[渲染-8] a patched terrain material multiplies its output by the factor of its tile\'s texel', () => {
  const h = createHighlight(level), seen = /** @type {THREE.Material[]} */ ([]);
  const keys = [...new Set(level.tiles.flat().map((/** @type {{ key: string }} */ t) => `tile:${t.key}`))];
  const t = createTerrain(level, new Map(keys.map((k) => [k, new THREE.Texture()])), (m) => { h.patch(m); seen.push(m); });
  assert.equal(seen.length, keys.length * 2, 'every top and side material');
  const shader = { uniforms: {}, vertexShader: 'void main() {\n#include <project_vertex>\n}', fragmentShader: 'void main() {\n#include <colorspace_fragment>\n}' };
  /** @type {any} */ (seen[0]).onBeforeCompile(shader);
  assert.ok('aueHighlight' in shader.uniforms && 'aueTiles' in shader.uniforms);
  assert.match(shader.vertexShader, /vAueTile = \(modelMatrix \* vec4\(transformed, 1\.0\)\)\.xz;/);
  assert.match(shader.fragmentShader, /#include <colorspace_fragment>[\s\S]*gl_FragColor\.rgb \*= 2\.0 \* clamp\(h, 0\.0, 0\.5\) \+ 5\.0 \* clamp\(h - 0\.5, 0\.0, 0\.5\);/);
  t.dispose(); h.dispose();
});

test('[渲染-9] the range: a quad per tile at its height, orange or cyan, translucent, before the shadows; none without keys or texture', () => {
  const field = { ...level, highland: 0.3 }, r = createRange(field, new THREE.Texture());
  r.show([2, 7]);
  assert.equal(r.count(), 2);
  const [wall, road] = /** @type {THREE.Mesh[]} */ (r.object.children);
  assert.ok(Math.abs(wall.position.y - 0.3) < 1e-12 && road.position.y === 0, 'tile 2 is high ground at the theme height');
  assert.deepEqual([road.position.x, road.position.z], [toThree(tileWorld(level, 1, 1, 0))[0], toThree(tileWorld(level, 1, 1, 0))[2]]);
  const m = /** @type {THREE.ShaderMaterial} */ (road.material), orange = new THREE.Color().setRGB(1, 0.6, 0.12, THREE.SRGBColorSpace);
  assert.ok(m.uniforms.color.value.equals(orange));
  assert.deepEqual([m.transparent, m.depthWrite, m.uniforms.opacity.value, m.uniforms.lift.value, road.renderOrder], [true, false, RANGE.opacity, 0.2, -2]);
  assert.match(m.vertexShader, /gl_Position\.z = raised\.z \/ raised\.w \* gl_Position\.w;/);
  r.show([7], true);
  const cyan = new THREE.Color().setRGB(0.25, 0.86, 1, THREE.SRGBColorSpace);
  assert.ok(/** @type {THREE.ShaderMaterial} */ (/** @type {THREE.Mesh} */ (r.object.children[0]).material).uniforms.color.value.equals(cyan));
  r.tick(4);
  assert.equal(m.uniforms.shift.value, -2, 'the stripes move 0.5 per second of real time');
  r.show(null);
  assert.equal(r.count(), 0);
  r.dispose();
  const bare = createRange(field, undefined);
  bare.show([7]);
  assert.equal(bare.count(), 0, 'no texture: nothing drawn');
  bare.dispose();
});

test("[渲染-19] the marks: a quad a marked tile at its height, this seat's blue, the mate's green; none without marks or texture", () => {
  const field = { ...level, highland: 0.3 }, m = createTileMarks(field, new THREE.Texture());
  m.show([{ key: 7, mate: false }, { key: 8, mate: true }, { key: 99, mate: true }]);
  assert.equal(m.count(), 2, 'a tile outside the level is none');
  const [mine, mate] = /** @type {THREE.Mesh[]} */ (m.object.children), color = (/** @type {THREE.Mesh} */ q) => /** @type {any} */ (q.material).uniforms.color.value;
  assert.deepEqual(mine.position.toArray(), toThree(tileWorld(field, 1, 1, 0)));
  assert.ok(color(mine).equals(new THREE.Color().setRGB(TILE_MARKS.mine[0], TILE_MARKS.mine[1], TILE_MARKS.mine[2], THREE.SRGBColorSpace)));
  assert.ok(color(mate).equals(new THREE.Color().setRGB(TILE_MARKS.mate[0], TILE_MARKS.mate[1], TILE_MARKS.mate[2], THREE.SRGBColorSpace)));
  assert.equal(/** @type {any} */ (mine.material).uniforms.opacity.value, TILE_MARKS.opacity);
  m.tick(2);
  assert.equal(/** @type {any} */ (mine.material).uniforms.shift.value, -RANGE.speed * 2, "its stripes scroll as the range's");
  m.show(null);
  assert.equal(m.count(), 0);
  m.dispose();
  const bare = createTileMarks(field, undefined);
  bare.show([{ key: 7, mate: false }]);
  assert.equal(bare.count(), 0, 'no texture: nothing drawn');
});

test('[渲染-26] 阵地足球: a square on each 守门位 tile and each tile of ice or slime in its colour; an arrow for the kick a ball has summed, a tile long at its threshold', () => {
  const field = { ...level, highland: 0.3 }, m = createPitchMarks(field);
  m.show({ spots: [7], cover: { 8: -0.3, 9: 0.3 }, kicks: [{ x: 1, y: 1, ax: 2, ay: 0, share: 0.5 }, { x: 2, y: 1, ax: 0, ay: 0, share: 1 }] });
  assert.equal(m.count(), 4, 'three squares and the arrow; a kick with no direction is none');
  const meshes = /** @type {THREE.Mesh[]} */ (m.object.children), color = (/** @type {THREE.Mesh} */ q) => /** @type {any} */ (q.material).color;
  const want = (/** @type {readonly number[]} */ c) => new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
  assert.ok(color(meshes[0]).equals(want(PITCH_MARKS.ice)) && color(meshes[1]).equals(want(PITCH_MARKS.slime)) && color(meshes[2]).equals(want(PITCH_MARKS.spot)));
  const [x, , z] = toThree(tileWorld(field, 1, 1, 0));
  assert.deepEqual([meshes[2].position.x, meshes[2].position.z], [x, z]);
  assert.ok(Math.abs(meshes[3].scale.x - 0.5) < 1e-9, 'half its threshold: half a tile');
  m.show(null);
  assert.equal(m.count(), 0);
  m.show({ spots: [7], cover: { 8: -0.3, 9: 0.3 }, kicks: [] }, new Set(['spot', 'ice']));
  assert.deepEqual(m.object.children.map((q) => color(/** @type {THREE.Mesh} */ (q)).equals(want(PITCH_MARKS.slime))), [true], 'the kinds the effects draw: no square');
  m.dispose();
});

