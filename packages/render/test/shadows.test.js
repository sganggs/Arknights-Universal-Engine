// Shadows without a GPU (docs/spec/render.md 渲染-6): one under each drawn unit, lying flat south of its feet, half
// transparent, drawn before the units, kept while a figure plays its die clip; none without the texture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { tinyContent } from '@aue/testkit';
import { ANIM, DIR } from '@aue/schema';
import { unitTextureKey, SHADOW, INDICATOR, toThree, tileWorld } from '../src/index.js';
import { createUnits, GRAPHIC, HOVER } from '../src/units.js';
import { tinyModel } from './model.js';

const level = tinyContent().level;
/** @param {string[]} keys */
const textures = (keys) => new Map(keys.map((k) => [k, new THREE.Texture()]));
const base = { owner: 0, dir: 0, hp: 1, maxHp: 1, anim: ANIM.IDLE, sp: -1, spCost: 0, skill: 0, skillLeft: -1 };
/** @param {number} frame @param {any[]} units */
const view = (frame, units) => ({ frame, players: [], units: units.map((x) => ({ ...base, ...x })) });

test('[渲染-6] shadows: one per drawn unit, flat on the ground south of its feet, half transparent, before the units', () => {
  const u = createUnits(textures([unitTextureKey(0, 'guard'), unitTextureKey(1, 'slime'), 'ui:shadow']));
  u.update(view(1, [{ id: 1, kind: 0, x: 1, y: 1, z: 1 }, { id: 2, kind: 1, x: 0, y: 2, z: 0 }, { id: 3, kind: 1, x: 0, y: 2, z: 0 }]),
    { 1: 'guard', 2: 'slime', 3: 'mystery' }, level);
  const shadows = /** @type {THREE.Mesh[]} */ (u.shadows.children), card = /** @type {THREE.Sprite} */ (u.object.children[0]);
  assert.equal(shadows.length, 2, 'the unit without a texture has no shadow');
  const [s] = shadows, mat = /** @type {THREE.MeshBasicMaterial} */ (s.material);
  assert.deepEqual(s.position.toArray(), [card.position.x, card.position.y, card.position.z + SHADOW.south]);
  s.geometry.computeBoundingBox();
  const size = /** @type {THREE.Box3} */ (s.geometry.boundingBox).getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.x - 0.608) < 1e-6 && Math.abs(size.z - 0.194) < 1e-6 && size.y < 1e-6, 'flat, 0.608 × 0.194 tiles');
  assert.deepEqual([mat.opacity, mat.transparent, mat.depthWrite, mat.depthTest, s.renderOrder], [0.502, true, false, true, -1]);
  u.update(view(2, [{ id: 2, kind: 1, x: 0.5, y: 1, z: 0 }]), {}, level);
  assert.equal(u.shadows.children.length, 1);
  assert.ok(Math.abs(u.shadows.children[0].position.z - (u.object.children[0].position.z + SHADOW.south)) < 1e-12, 'follows the unit');
  u.dispose();
  const bare = createUnits(textures([unitTextureKey(1, 'slime')]));
  bare.update(view(1, [{ id: 2, kind: 1, x: 0, y: 2, z: 0 }]), { 2: 'slime' }, level);
  assert.deepEqual([bare.count(), bare.shadows.children.length], [1, 0], 'no shadow texture: no shadows');
  bare.dispose();
});

test('[渲染-6] shadows: a dying figure keeps its shadow until it is removed', () => {
  const u = createUnits(textures(['ui:shadow']), new Map([['slime', { front: tinyModel() }]]));
  u.update(view(1, [{ id: 1, kind: 1, owner: -1, x: 1, y: 1, z: 0, anim: ANIM.MOVE }]), { 1: 'slime' }, level, 0);
  assert.equal(u.shadows.children.length, 1);
  u.update(view(2, []), {}, level, 0, [{ type: 'death', id: 1 }]);
  assert.equal(u.shadows.children.length, 1, 'kept while the die clip (0.6 s) plays');
  u.update(view(2 + 18, []), {}, level, 0);
  assert.equal(u.shadows.children.length, 0, 'gone with the figure');
  u.dispose();
});

test('[渲染-2] the figure of an operator or an enemy stands south of and above its feet, on its shadow; a device at its feet', () => {
  const u = createUnits(textures(['ui:shadow']), new Map([['slime', { front: tinyModel() }], ['guard', { front: tinyModel() }], ['post', { front: tinyModel() }]]));
  u.update(view(1, [{ id: 1, kind: 1, x: 1, y: 1, z: 0 }, { id: 2, kind: 0, x: 1, y: 1, z: 0 }, { id: 3, kind: 2, owner: -1, x: 1, y: 1, z: 0 }]),
    { 1: 'slime', 2: 'guard', 3: 'post' }, level, 0);
  const [enemy, op, device] = /** @type {THREE.Group[]} */ (u.object.children), [se] = /** @type {THREE.Mesh[]} */ (u.shadows.children);
  for (const f of [enemy, op]) {
    const d = f.position.clone().sub(device.position);
    assert.ok(Math.abs(d.x) < 1e-12 && Math.abs(d.y - GRAPHIC.up) < 1e-12 && Math.abs(d.z - GRAPHIC.south) < 1e-12, '0.2 south, 0.06 up');
  }
  assert.ok(Math.abs(se.position.z - (device.position.z + SHADOW.south)) < 1e-12 && Math.abs(se.position.y - device.position.y) < 1e-12, 'the shadow from the feet');
  u.dispose();
});

test('[渲染-21] a flying enemy is drawn in the air over its shadow on the ground; its lift for the bars', () => {
  const u = createUnits(textures(['ui:shadow', unitTextureKey(1, 'bat')]), new Map([['drone', { front: tinyModel() }]]), new Set(), new Map(), { flyers: new Set(['drone', 'bat']) });
  u.update(view(1, [{ id: 1, kind: 1, x: 1, y: 1, z: 0 }, { id: 2, kind: 1, x: 2, y: 1, z: 0 }]), { 1: 'drone', 2: 'bat' }, level, 0);
  const [drone, bat] = /** @type {THREE.Object3D[]} */ (u.object.children), [sd, sb] = /** @type {THREE.Mesh[]} */ (u.shadows.children);
  assert.ok(Math.abs(drone.position.y - sd.position.y - GRAPHIC.up - HOVER) < 1e-12, 'a figure: its graphic, lifted');
  assert.ok(Math.abs(bat.position.y - sb.position.y - HOVER) < 1e-12, 'a card too');
  assert.deepEqual([u.lift(1), u.lift(2), u.lift(3)], [HOVER, HOVER, 0]);
  const high = { ...level, tiles: level.tiles.map((/** @type {any[]} */ r, /** @type {number} */ y) => r.map((t, x) => (x === 1 && y === 1 ? { ...t, height: 'HIGHLAND' } : t))) };
  u.update(view(2, [{ id: 1, kind: 1, x: 1, y: 1, z: 1 }]), {}, high, 0);
  assert.ok(Math.abs(drone.position.y - GRAPHIC.up - HOVER) < 1e-12, 'a constant altitude over the ground, whatever level it started on');
  assert.ok(sd.position.y > 0.3, 'its shadow on the high tile under it');
  u.dispose();
});

test('[渲染-22] every operator on the field has the direction indicator at its feet, pointing its facing; not an enemy, not while dying', () => {
  const tex = textures(['ui:shadow', 'ui:directionRing', 'ui:directionArrow']);
  const u = createUnits(tex, new Map([['guard', { front: tinyModel() }], ['slime', { front: tinyModel() }]]));
  u.update(view(1, [{ id: 1, kind: 0, x: 1, y: 1, z: 0, dir: DIR.LEFT }, { id: 2, kind: 1, x: 2, y: 1, z: 0 }]), { 1: 'guard', 2: 'slime' }, level, 0);
  const marks = /** @type {THREE.Mesh[]} */ (u.indicators.children), at = toThree(tileWorld(level, 1, 1, 0));
  assert.equal(marks.length, 2, 'a ring and an arrow, for the operator only');
  const [ring, arrow] = marks;
  assert.ok(Math.abs(ring.position.x - at[0]) < 1e-12 && Math.abs(ring.position.z - at[2]) < 1e-12, 'the ring at its feet');
  assert.ok(Math.abs(arrow.position.x - (at[0] - INDICATOR.out)) < 1e-12, 'the arrow out to the west, its facing');
  u.update(view(2, [{ id: 2, kind: 1, x: 2, y: 1, z: 0 }]), {}, level, 0, [{ type: 'death', id: 1 }]);
  assert.equal(u.indicators.children.length, 0, 'gone as it dies');
  assert.equal(u.shadows.children.length, 2, 'its shadow kept while it plays its die clip');
  u.dispose();
  const bare = createUnits(textures(['ui:shadow']));
  bare.update(view(1, [{ id: 1, kind: 0, x: 1, y: 1, z: 0 }]), { 1: 'guard' }, level, 0);
  assert.equal(bare.indicators.children.length, 0, 'no textures: none');
  bare.dispose();
});

test('[渲染-28] a unit whose look is an effect: no figure, card or block, only its shadow on the ground; drawn for its bars', () => {
  const u = createUnits(textures(['ui:shadow', unitTextureKey(1, 'wind'), unitTextureKey(2, 'post')]), new Map([['wind', { front: tinyModel() }]]), new Set(), new Map(),
    { flyers: new Set(['wind']), looks: new Set(['wind', 'post']) });
  u.update(view(1, [{ id: 1, kind: 1, x: 1, y: 1, z: 0 }, { id: 2, kind: 2, x: 2, y: 1, z: 0 }]), { 1: 'wind', 2: 'post' }, level, 0);
  assert.deepEqual([u.object.children.length, u.shadows.children.length, u.count()], [0, 2, 0], 'nothing drawn here but the shadows');
  assert.deepEqual([u.shows(1), u.shows(2), u.lift(1)], [true, true, 0], 'shown, and a flyer of them on the ground');
  u.update(view(2, [{ id: 2, kind: 2, x: 2, y: 1, z: 0 }]), {}, level, 0);
  assert.deepEqual([u.shows(1), u.shadows.children.length], [false, 1], 'gone: its shadow goes');
  u.dispose();
});
