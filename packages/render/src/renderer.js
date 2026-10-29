// The battle renderer: a three.js scene of systems — terrain (a map theme's tile kit, or flat textures), the units'
// shadows, units (Spine figures or cards), the operator being placed, the attack effects — under the official camera, then the overlays (HP and SP
// bars) over it with the depth cleared (ADR 0027). The page owns the loop: it calls update() with each render state
// from the worker and render() once per animation frame.
import * as THREE from 'three';
import { KIND } from '@aue/schema';
import { applyPose, DEFAULT_VIEW, STEP_HEIGHT, screenOf, tileWorld } from './camera.js';
import { createTerrain, tileKeys } from './terrain.js';
import { createKitTerrain } from './kit.js';
import { createHighlight } from './highlight.js';
import { createRange } from './range.js';
import { createTileMarks } from './tilemarks.js';
import { createPitchMarks } from './pitchmarks.js';
import { createEffects } from './effects.js';
import { FPS } from './figure.js';
import { createUnits, unitTextureKey } from './units.js';
import { createOverlays } from './overlays.js';
import { createPlacing } from './placing.js';
import { spineModel } from './spine.js';

/**
 * @typedef {object} RendererOptions
 * @property {HTMLCanvasElement} canvas
 * @property {import('./terrain.js').TerrainLevel} level
 * @property {Map<string, THREE.Texture>} textures keyed 'tile:<key>', 'avatar:<charId>', 'enemy:<enemyKey>', 'ui:bar', 'ui:shadow',
 *   'ui:range', 'ui:directionRing', 'ui:directionArrow'
 * @property {readonly number[]} [view] the level's camera view vector
 * @property {import('./units.js').Models} [models] Spine models by content key (operators by character id)
 * @property {Set<string>} [leaders] content keys of leader enemies (red HP bars)
 * @property {Set<string>} [foeDevices] content keys of the devices on the enemies' side (装置-3): their blocks and bars in the
 *   enemies' colour (渲染-5, 渲染-16)
 * @property {boolean} [bars] whether the renderer draws the units' bars (渲染-5; default true): false when the page draws
 *   the battle UI's own (界面-19)
 * @property {import('./kit.js').LoadedKit | null} [kit] the map theme's tile kit (渲染-7); without one the tiles are flat
 *   textures
 * @property {import('./fx/player.js').FxPack | null} [effects] the units' attack effects (渲染-10…渲染-12); none without
 * @property {Record<string, number>} [skills] each operator's skill (1-based) by its key, for its skill's own effects
 * @property {number} [seat] the seat of the player watching (0 by default): their partner's co-op goals take the partner's
 *   marker (渲染-12)
 * @property {number} [pixelScale] the player's 清晰度 (渲染-15): the canvas's pixel ratio is the device's times this (default 1)
 * @property {boolean} [attackEffects] whether the attacks' effects are drawn (渲染-15; default true)
 * @property {Map<string, import('./devicemesh.js').DeviceMeshModel>} [deviceMeshes] devices' mesh models by content key (渲染-20)
 * @property {Set<string>} [flyers] content keys of the flying enemies, drawn in the air (渲染-21)
 */

/** The events that set off attack effects (渲染-10, 渲染-11); the player may turn them off (渲染-15). */
const ATTACK_EVENTS = new Set(['attack', 'shot', 'hit', 'heal']);

/**
 * The canvas's pixel ratio (渲染-15): the device's (1 when unknown) times the player's 清晰度, held to 0.25…2.
 * @param {number | undefined} device @param {number} scale
 */
export const pixelRatioOf = (device, scale) => (device || 1) * Math.min(2, Math.max(0.25, Number.isFinite(scale) ? scale : 1));

/** The textures without the start and end tiles' markers when the effects draw them (渲染-12). @param {RendererOptions} o */
const terrainTextures = (o) => (o.effects?.data.named?.tile_start ? new Map([...o.textures].filter(([k]) => !/^tile:tile_(start|end)/.test(k))) : o.textures);

/**
 * Where things land on the canvas, in its CSS pixels (渲染-13): `screenOf` a point of the field — tile coordinates
 * (fractions allowed) and a height level (0 ground, 1 high ground); `barsAt` where a unit's bars hang — under its feet,
 * a flyer's in the air over the ground's level (渲染-21).
 * @param {THREE.Camera} camera @param {{ width: number, height: number, highland?: number }} field @param {HTMLCanvasElement} canvas
 * @param {(id: number) => number} lift how high over its feet a unit is drawn
 */
function canvasPoints(camera, field, canvas, lift) {
  const on = (/** @type {[number, number, number]} */ p) => screenOf(camera, p, canvas.clientWidth, canvas.clientHeight);
  return {
    /** @param {number} col @param {number} row @param {number} heightLevel */
    screenOf: (col, row, heightLevel) => on(tileWorld(field, col, row, heightLevel)),
    /** @param {import('@aue/schema').ViewUnit} u */
    barsAt: (u) => { const up = lift(u.id); return on(tileWorld(field, u.x, u.y, up > 0 ? up / (field.highland ?? STEP_HEIGHT) : u.z)); },
  };
}

/** Battle time from the frames the renderer is given: 30 a second, interpolated up to a frame past the last. */
function battleClock() {
  let frame = 0, at = 0, last = -1;
  return {
    /** @param {number} f @param {number} now ms */
    seen(f, now) { frame = f; at = now; },
    /** Battle seconds since the last call (0 to 0.1). @param {number} now ms */
    delta(now) {
      const f = frame + Math.min(1, Math.max(0, ((now - at) * FPS) / 1000)), d = last < 0 ? 0 : (f - last) / FPS;
      last = f;
      return Math.min(0.1, Math.max(0, d));
    },
  };
}

/** @param {RendererOptions} o */
export function createBattleRenderer(o) {
  const renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: true });
  renderer.autoClear = false;
  // the counts cover a whole frame (the scene and the overlays), reset at its start
  renderer.info.autoReset = false;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  scene.background = new THREE.Color(0x404040);
  const highlight = createHighlight(o.level), patch = highlight.patch;
  const terrain = o.kit ? createKitTerrain(o.level, o.kit, terrainTextures(o), patch) : createTerrain(o.level, o.textures, patch);
  const units = createUnits(o.textures, o.models, o.foeDevices, o.deviceMeshes, o.flyers), field = { ...o.level, highland: o.kit?.kit.highland };
  const range = createRange(field, o.textures.get('ui:range')), marks = createTileMarks(field, o.textures.get('ui:range')), pitch = createPitchMarks(field), clock = battleClock();
  const effects = o.effects ? createEffects(o.effects, field, { skills: o.skills, seat: o.seat ?? 0 }) : null, placing = createPlacing(o.textures, o.models ?? new Map(), field);
  scene.add(terrain.object, range.object, marks.object, pitch.object, units.shadows, units.indicators, placing.object, units.object, ...(effects ? [effects.object] : []));
  const overlays = createOverlays(o.bars === false ? new Map() : o.textures, o.leaders, o.foeDevices), ray = new THREE.Raycaster();

  let scale = o.pixelScale ?? 1, attackFx = o.attackEffects !== false;
  const resize = () => {
    const w = o.canvas.clientWidth, h = o.canvas.clientHeight;
    renderer.setPixelRatio(pixelRatioOf(globalThis.devicePixelRatio, scale));
    renderer.setSize(w, h, false);
    applyPose(camera, o.view ?? DEFAULT_VIEW, w / Math.max(1, h));
  };
  resize();

  return {
    resize,
    /** The player's 清晰度 (渲染-15). @param {number} s */
    setPixelScale(s) { scale = s; resize(); },
    /** Whether the attacks' effects are drawn from now on (渲染-15). @param {boolean} on */
    setAttackEffects(on) { attackFx = on; },
    /**
     * @param {import('@aue/schema').View} view @param {Record<string, string>} keys content keys of units (at least of those
     *   not given before)
     * @param {Record<string, string | number>[]} [events] the frame's presentation events
     */
    update(view, keys, events = []) {
      units.update(view, keys, field, performance.now(), events);
      overlays.update(view, keys, field, units.shows, units.lift);
      clock.seen(view.frame, performance.now());
      effects?.update(view, keys, attackFx ? events : events.filter((e) => !ATTACK_EVENTS.has(String(e.type))));
    },
    /** The facilities' levels by unit id (守御-3, 渲染-20); those not given are at 0. */ levels: units.setLevels,
    /** Highlights the tiles (keys row × width + col) the selected operator can be deployed on (渲染-8); null for none. @param {Iterable<number> | null} keys */
    highlight: (keys) => highlight.set(keys),
    /** Shows an attack range (渲染-9): tile keys, healing or not; null for none. @param {Iterable<number> | null} keys @param {boolean} [heal] */
    range: (keys, heal) => range.show(keys, heal),
    /** Shows the marked tiles (渲染-19); null for none. @param {readonly import('./tilemarks.js').TileMark[] | null} list */
    marks: (list) => marks.show(list),
    /** Shows 阵地足球's field marks (渲染-26): the effects the pack has, squares for the rest; null for none. @param {import('./pitchmarks.js').PitchState | null} s */
    pitch: (s) => pitch.show(s, effects?.pitch(s)),
    /** Shows the operator being placed (渲染-14); null for none. @param {import('./placing.js').Placing | null} p */
    placing: (p) => placing.set(p),
    render() {
      const now = performance.now() / 1000; range.tick(now); marks.tick(now);
      units.pose(camera); placing.pose(camera); overlays.pose(camera);
      effects?.step(clock.delta(performance.now()), camera);
      renderer.info.reset();
      renderer.clear();
      renderer.render(scene, camera);
      renderer.clearDepth();
      renderer.render(overlays.scene, camera);
    },
    ...canvasPoints(camera, field, o.canvas, units.lift),
    /** The tile under a point of the canvas, or null. @param {number} x @param {number} y client coordinates */
    pick(x, y) {
      const r = o.canvas.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera);
      const hit = ray.intersectObjects(terrain.object.children, false).find((/** @type {THREE.Intersection} */ h) => h.object.userData.col !== undefined);
      return hit ? { col: hit.object.userData.col, row: hit.object.userData.row } : null;
    },
    /** Whether a unit is drawn (a figure or a card). @param {number} id */
    shows: (id) => units.shows(id),
    /** What the last frame drew and what the GPU holds (for measuring): draw calls, triangles, geometries, textures and their estimated bytes. */
    stats: () => drawStats(renderer, [scene, overlays.scene]),
    dispose() { terrain.dispose(); range.dispose(); marks.dispose(); pitch.dispose(); highlight.dispose(); units.dispose(); placing.dispose(); overlays.dispose(); effects?.dispose(); renderer.dispose(); },
  };
}

/** The textures a material uses: its maps and its uniforms' textures. @param {THREE.Material} m @returns {THREE.Texture[]} */
function texturesOf(m) {
  const out = Object.values(m).filter((v) => v instanceof THREE.Texture);
  const u = /** @type {{ uniforms?: Record<string, { value: unknown }> }} */ (m).uniforms;
  if (u) for (const x of Object.values(u)) if (x.value instanceof THREE.Texture) out.push(x.value);
  return out;
}

/**
 * The renderer's counts of the last frame and an estimate of the texture memory of the scenes: 4 bytes a texel, a
 * third more with mipmaps.
 * @param {THREE.WebGLRenderer} renderer @param {THREE.Object3D[]} scenes
 */
export function drawStats(renderer, scenes) {
  const tex = new Set();
  for (const sc of scenes) sc.traverse((obj) => {
    const mat = /** @type {{ material?: THREE.Material | THREE.Material[] }} */ (obj).material;
    for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) for (const t of texturesOf(m)) tex.add(t);
  });
  let bytes = 0;
  for (const t of tex) {
    const im = /** @type {{ width?: number, height?: number } | null} */ (t.image);
    if (im?.width && im.height) bytes += im.width * im.height * 4 * (t.generateMipmaps ? 4 / 3 : 1);
  }
  const { render, memory } = renderer.info;
  return { calls: render.calls, triangles: render.triangles, geometries: memory.geometries, textures: memory.textures, sceneTextures: tex.size, textureBytes: Math.round(bytes) };
}

/** The battle UI's textures the renderer draws with (渲染-5, 渲染-6, 渲染-8, 渲染-9, 渲染-14). */
const UI_TEXTURES = Object.freeze(['ui:bar', 'ui:shadow', 'ui:range', 'ui:directionRing', 'ui:directionArrow']);

/**
 * The texture keys a match draws with: the UI's, the level's tiles' (渲染-7), each unit's card by its kind (渲染-1,
 * 渲染-16) — operators by character ID, enemies and devices by key.
 * @param {import('./terrain.js').TerrainLevel} level @param {{ operators: Iterable<string>, enemies: Iterable<string>, devices?: Iterable<string> }} units
 * @returns {string[]}
 */
export function matchTextureKeys(level, units) {
  return [...UI_TEXTURES, ...tileKeys(level).map((k) => `tile:${k}`), ...[...units.operators].map((k) => unitTextureKey(KIND.OPERATOR, k)),
    ...[...units.enemies].map((k) => unitTextureKey(KIND.ENEMY, k)), ...[...(units.devices ?? [])].map((k) => unitTextureKey(KIND.DEVICE, k))];
}

/**
 * Loads the textures a manifest lists (relative to baseUrl), as sRGB: all of them, or only those of the keys given
 * (a match's, 渲染-1) that it lists.
 * @param {{ files: Record<string, { file: string }> }} manifest @param {string} baseUrl @param {Iterable<string>} [keys]
 * @returns {Promise<Map<string, THREE.Texture>>}
 */
export async function loadTextures(manifest, baseUrl, keys) {
  const loader = new THREE.TextureLoader(), out = new Map(), want = keys ? new Set(keys) : null;
  await Promise.all(Object.entries(manifest.files).filter(([key]) => !want || want.has(key)).map(async ([key, f]) => {
    const t = await loader.loadAsync(new URL(f.file, baseUrl).href);
    t.colorSpace = THREE.SRGBColorSpace;
    out.set(key, t);
  }));
  return out;
}

/**
 * The tile kits of the assets (渲染-7): per theme its kit file, the default theme and the themes of particular levels.
 * @typedef {{ version: number, default: string, levels?: Record<string, string>, kits: Record<string, string> }} KitIndex
 */

/**
 * Loads the tile kit a level uses (渲染-7) — the index's theme for the level, else the default — with its textures
 * (sRGB, repeating); paths relative to baseUrl. Null when the index names no kit for it.
 * @param {KitIndex} index @param {string} baseUrl @param {string} levelId @returns {Promise<import('./kit.js').LoadedKit | null>}
 */
export async function loadTileKit(index, baseUrl, levelId) {
  const path = index.kits[index.levels?.[levelId] ?? index.default];
  if (!path) return null;
  const url = new URL(path, baseUrl), kit = /** @type {import('./kit.js').TileKit} */ (await fetch(url).then((r) => r.json()));
  const loader = new THREE.TextureLoader(), textures = new Map();
  const files = new Set(kit.materials.flatMap((m) => [m.map, m.emissiveMap]).filter((f) => f !== null));
  await Promise.all([...files].map(async (f) => {
    const t = await loader.loadAsync(new URL(/** @type {string} */ (f), url).href);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    textures.set(f, t);
  }));
  return { kit, textures };
}

/**
 * @typedef {{ version: number, models: Record<string, Record<string, { skel: string, atlas: string, pages: Record<string, string>, pma: boolean, scale?: number, stretchY?: number }>> }} SpineIndex
 */

/**
 * Loads the Spine models a list of content keys needs from a model index (paths relative to baseUrl); keys the index
 * does not have are left out.
 * @param {SpineIndex} index @param {string} baseUrl @param {string[]} ids @returns {Promise<import('./units.js').Models>}
 */
export async function loadSpineModels(index, baseUrl, ids) {
  const loader = new THREE.TextureLoader(), out = /** @type {import('./units.js').Models} */ (new Map());
  const url = (/** @type {string} */ f) => new URL(f, baseUrl).href;
  await Promise.all([...new Set(ids)].filter((id) => index.models[id]).map(async (id) => {
    /** @type {Record<string, import('./spine.js').SpineModel>} */
    const sides = {};
    for (const [side, m] of Object.entries(index.models[id])) {
      const [skel, atlas] = await Promise.all([fetch(url(m.skel)).then((r) => r.arrayBuffer()), fetch(url(m.atlas)).then((r) => r.text())]);
      const pages = new Map(await Promise.all(Object.entries(m.pages).map(async ([name, file]) => /** @type {[string, THREE.Texture]} */ ([name, await loader.loadAsync(url(file))]))));
      const model = spineModel(new Uint8Array(skel), atlas, pages, m.pma), k = m.scale ?? 1;
      sides[side] = m.scale || m.stretchY ? { ...model, scale: [k, k * (m.stretchY ?? 1)] } : model;
    }
    out.set(id, sides);
  }));
  return out;
}
