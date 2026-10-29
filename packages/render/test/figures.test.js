// Spine figures without a GPU: geometry arrays, blend factors, animation roles, facing, and the units system with a
// model (docs/spec/render.md 渲染-1 … 渲染-4, docs/spec/spine.md 骨骼-16).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { tinyContent } from '@aue/testkit';
import { ANIM } from '@aue/schema';
import { figureArrays, blendFactors, animationRoles, formRoles, roleOf, operatorFacing, enemyFacing, SKELETON_SCALE, createFigure } from '../src/index.js';
import { createUnits } from '../src/units.js';
import { tinyModel } from './model.js';

const batch = (/** @type {number} */ page, /** @type {number} */ blend) => ({
  page, blend, positions: [0, 0, 100, 0, 100, 200], uvs: [0, 0, 1, 0, 1, 1], light: Array(12).fill(1), dark: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], indices: [0, 1, 2],
});

test('[渲染-2] geometry: positions in tiles, mirrored when flipped, one group per batch in order', () => {
  const a = figureArrays([batch(0, 0), batch(1, 1)], 0.01, false);
  assert.deepEqual([...a.position.slice(0, 9)], [0, 0, 0, 1, 0, 0, 1, 2, 0]);
  assert.deepEqual([...a.index], [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(a.groups, [{ start: 0, count: 3, page: 0, blend: 0 }, { start: 3, count: 3, page: 1, blend: 1 }]);
  assert.equal(a.light.length, 24);
  const flipped = figureArrays([batch(0, 0)], 0.01, true);
  assert.deepEqual([...flipped.position.slice(3, 6)], [-1, 0, 0]);
});

test('[骨骼-16] blend factors of the four modes, premultiplied or straight', () => {
  assert.deepEqual(blendFactors(0, true), { src: THREE.OneFactor, dst: THREE.OneMinusSrcAlphaFactor });
  assert.deepEqual(blendFactors(0, false), { src: THREE.SrcAlphaFactor, dst: THREE.OneMinusSrcAlphaFactor });
  assert.deepEqual(blendFactors(1, true), { src: THREE.OneFactor, dst: THREE.OneFactor });
  assert.deepEqual(blendFactors(1, false), { src: THREE.SrcAlphaFactor, dst: THREE.OneFactor });
  assert.deepEqual(blendFactors(2, true), { src: THREE.DstColorFactor, dst: THREE.OneMinusSrcAlphaFactor });
  assert.deepEqual(blendFactors(3, false), { src: THREE.OneFactor, dst: THREE.OneMinusSrcColorFactor });
});

test('[渲染-3] animation roles by name, falling back to idle; the role of what a unit is doing', () => {
  assert.deepEqual(animationRoles(['Attack', 'Default', 'Die', 'Idle', 'Start']), { idle: 'Idle', move: 'Idle', attack: 'Attack', die: 'Die', start: 'Start' });
  assert.deepEqual(animationRoles(['A_Idle', 'Move_Begin', 'Move_Loop', 'Attack_Die', 'Attack_A', 'B_Die']), { idle: 'A_Idle', move: 'Move_Loop', attack: 'Attack_A', die: 'B_Die', start: null });
  assert.equal(animationRoles(['idle_grey', 'Skill_Idle']).idle, 'idle_grey');
  assert.equal(animationRoles(['Pose']).attack, 'Pose');
  assert.deepEqual([ANIM.IDLE, ANIM.MOVE, ANIM.ATTACK, ANIM.DIE].map(roleOf), ['idle', 'move', 'attack', 'die']);
  assert.deepEqual(formRoles(['B_Idle', 'A_Attack', 'A_Default', 'A_Die', 'A_Idle', 'A_Move', 'B_Attack', 'B_Die', 'B_Move']), [
    { idle: 'A_Idle', move: 'A_Move', attack: 'A_Attack', die: 'A_Die', start: null }, { idle: 'B_Idle', move: 'B_Move', attack: 'B_Attack', die: 'B_Die', start: null }]);
  assert.equal(formRoles(['A_Idle', 'Move_Loop', 'B_Die']).length, 1, 'not every name in a form: one form');
});

test('[渲染-4] facing: operators use the back facing up and mirror facing left; enemies mirror when the simulation faces them left', () => {
  const m = { back: true, backDies: false, dying: false };
  assert.deepEqual(operatorFacing({ side: 'back', flip: false }, m), { side: 'back', flip: false });
  assert.deepEqual(operatorFacing({ side: 'front', flip: true }, m), { side: 'front', flip: true });
  assert.deepEqual(operatorFacing({ side: 'front', flip: false }, m), { side: 'front', flip: false });
  assert.deepEqual(operatorFacing({ side: 'back', flip: false }, { ...m, dying: true }), { side: 'front', flip: false });
  assert.deepEqual(operatorFacing({ side: 'back', flip: false }, { ...m, back: false }), { side: 'front', flip: false });
  assert.equal(enemyFacing(-1), true);
  assert.equal(enemyFacing(1), false);
  assert.equal(enemyFacing(0), false, 'a device: no left or right of its own');
  assert.equal(enemyFacing(undefined), false);
});

test('[渲染-2] a model drawn at its own scale: across and up apart (a prefab scaled and stretched)', () => {
  const a = figureArrays([batch(0, 0)], [0.01, 0.02], false);
  assert.deepEqual([...a.position.slice(3, 9)], [1, 0, 0, 1, 4, 0]);
  const plain = createFigure(tinyModel()), scaled = createFigure({ ...tinyModel(), scale: [0.8, 1.2] });
  plain.show('Idle', 0, true, false); scaled.show('Idle', 0, true, false);
  const top = (/** @type {ReturnType<typeof createFigure>} */ f) => /** @type {THREE.BufferAttribute} */ (/** @type {THREE.Mesh} */ (f.object).geometry.getAttribute('position')).getY(1);
  assert.ok(Math.abs(top(scaled) - top(plain) * 1.2) < 1e-6);
  assert.equal(SKELETON_SCALE, 0.0027);
  plain.dispose(); scaled.dispose();
});

test('[渲染-1] [渲染-2] units: a figure for a unit with a model, standing at its feet, facing the camera, not writing depth', () => {
  const level = tinyContent().level, u = createUnits(new Map(), new Map([['slime', { front: tinyModel() }]]));
  const view = { frame: 3, players: [], units: [{ id: 1, kind: 1, owner: -1, x: 1, y: 1, z: 0, dir: 0, hp: 1, maxHp: 1, anim: ANIM.MOVE, sp: -1, spCost: 0, skill: 0, skillLeft: -1, status: 0, element: 0, ep: 1, burst: 0 }] };
  u.update(view, { 1: 'slime' }, level, 0);
  assert.equal(u.count(), 1);
  const camera = new THREE.PerspectiveCamera();
  camera.rotation.set(-1, 0, 0);
  camera.updateMatrixWorld();
  u.pose(camera, 0);
  const figure = /** @type {THREE.Group} */ (u.object.children[0]), mesh = /** @type {THREE.Mesh} */ (figure.children[0]);
  assert.ok(figure.quaternion.equals(camera.quaternion));
  const pos = /** @type {THREE.BufferAttribute} */ (mesh.geometry.getAttribute('position'));
  assert.deepEqual([pos.getY(0), pos.getY(1)], [0, Math.fround(200 * SKELETON_SCALE)]);
  const mats = /** @type {THREE.ShaderMaterial[]} */ (mesh.material);
  assert.equal(mats.length, 1);
  assert.equal(mats[0].depthWrite, false);
  assert.equal(mats[0].depthTest, true);
  u.update({ ...view, units: [] }, {}, level, 0);
  assert.equal(u.count(), 0);
  u.dispose();
});
