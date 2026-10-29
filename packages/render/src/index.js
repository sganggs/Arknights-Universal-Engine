// @aue/render: the three.js battle renderer (ADR 0025–0028): the official camera, terrain from a map theme's tile kit
// (or flat textures), units as Spine figures (or cards where no model is loaded).
export { createBattleRenderer, loadTextures, matchTextureKeys, loadSpineModels, loadTileKit, pixelRatioOf } from './renderer.js';
export { kitKey, kitPattern, KIT_ALIAS, KIT_LIGHT } from './kit.js';
export { HIGHLIGHT, highlightFactor } from './highlight.js';
export { RANGE } from './range.js';
export { FX, createEffects, loadEffectPack, cameraAxes } from './effects.js';
export { effectLead, rootAt, rootAlong } from './fx/player.js';
export { createFigure, figureArrays, blendFactors, spineModel, SKELETON_SCALE } from './spine.js';
export { animationRoles, formRoles, roleOf, operatorFacing, enemyFacing } from './roles.js';
export { facingStep, sideOf, flipOf, faceTurns } from './facing.js';
export { FACE_OVERRIDES } from './faceModes.js';
export { barsOf, BAR } from './overlays.js';
export { cameraPose, applyPose, toThree, tileWorld, screenOf, adapt, DEFAULT_VIEW, FOV, STEP_HEIGHT } from './camera.js';
export { tileKeys } from './terrain.js';
export { unitTextureKey } from './units.js';
export { loadDeviceMeshes, newDeviceMesh, showLevel, partGeometry } from './devicemesh.js';
export { SHADOW } from './shadows.js';
export { createPlacing } from './placing.js';
export { createIndicators, INDICATOR } from './indicators.js';
export { createBattleAudio } from './audio.js';
export { createUiScene, canvasCorners, canvasPlane, canvasRoot, meshGeometry, posOf, quatOf } from './uiscene.js';
export { createUiFx, pageRoot } from './uifx.js';
export { soundsOf, musicOf, pickSound, roomFor } from './sounds.js';
export { dubOf, linesOf, voicesOf, leaderOf, admit, newGate, inDub, LINE_TYPES } from './voices.js';
export { TILE_MARKS } from './tilemarks.js';
export { PITCH_MARKS } from './pitchmarks.js';
export { effectIndex, effectSubsetJson } from './fx/subset.js';
