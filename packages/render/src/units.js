// The units system: each unit is a Spine figure when its model is loaded (docs/spec/render.md 渲染-1 … 渲染-4), a device
// with a mesh model that mesh at its level (渲染-20), else a card with the operator's avatar or the enemy's icon standing
// at its feet; a device with none of them is a block in its side's colour (渲染-16); any other unit with neither is not drawn. Figures, cards and blocks are depth-tested against
// the terrain without writing depth (ADR 0027). A figure whose unit died stays to play its die clip. Every figure, card
// and block has a shadow (渲染-6) for as long as it is drawn; an operator, while it is not dying, its direction indicator
// (渲染-22). An operator's or an enemy's figure stands where the original puts its graphic,
// a little south of and above its feet (渲染-2); a flying enemy is drawn in the air over its shadow (渲染-21). A unit
// whose look is an effect (渲染-28) is drawn by the effects system: here it has only its shadow.
import * as THREE from 'three';
import { KIND } from '@aue/schema';
import { toThree, tileWorld } from './camera.js';
import { FPS, newFigure, follow, attacked, cast, dies, deathOver, poseFigure } from './figure.js';
import { createShadows } from './shadows.js';
import { createIndicators } from './indicators.js';
import { BAR } from './overlays.js';
import { createMeshDrawer } from './devicemesh.js';

const CARD = 0.8;
/** Where an operator's or an enemy's figure stands from its feet (渲染-2): its graphic, this far south and up, in tiles. */
export const GRAPHIC = Object.freeze({ south: 0.2, up: 0.06 });
/** How high over the ground a flying enemy is drawn, in tiles (渲染-21). */
export const HOVER = 1.4;
/** A device block (渲染-16): its footprint and height in tiles; its sides are this much of its top's colour. */
export const BLOCK = Object.freeze({ size: 0.7, height: 0.35, shade: 0.7 });

/** A block's geometry standing on its base, its top in the colour and its sides darker (渲染-16). @param {number} hex */
function blockGeometry(hex) {
  const g = new THREE.BoxGeometry(BLOCK.size, BLOCK.height, BLOCK.size).translate(0, BLOCK.height / 2, 0);
  const top = new THREE.Color(hex), side = top.clone().multiplyScalar(BLOCK.shade), n = g.attributes.normal, colors = /** @type {number[]} */ ([]);
  for (let i = 0; i < n.count; i++) (n.getY(i) > 0.5 ? top : side).toArray(colors, i * 3);
  return g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}
const BLOCKS = Object.freeze({ foe: blockGeometry(BAR.colors.enemy), ours: blockGeometry(BAR.colors.ours) });

/** A device's block: the enemies' bar colour for a device on their side, ours otherwise. @param {boolean} foe */
const newBlock = (foe) => new THREE.Mesh(foe ? BLOCKS.foe : BLOCKS.ours, new THREE.MeshBasicMaterial({ vertexColors: true, depthWrite: false }));

/** The texture key of a unit. @param {number} kind @param {string} key */
export const unitTextureKey = (kind, key) => (kind === KIND.OPERATOR ? `avatar:${key}` : kind === KIND.DEVICE ? `device:${key}` : `enemy:${key}`);

/** @typedef {Map<string, { front?: import('./spine.js').SpineModel, back?: import('./spine.js').SpineModel }>} Models */
/** @typedef {import('./figure.js').Figure} Figure */
/** @typedef {Record<string, string | number>} Event a presentation event (type and fields) */

/** A card: the texture standing at its bottom centre, not writing depth. @param {THREE.Texture} map */
function newCard(map) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthWrite: false }));
  s.center.set(0.5, 0);
  s.scale.set(CARD, CARD, 1);
  return s;
}

/**
 * Puts a unit's figure, card or block at its feet: an operator's or an enemy's figure where the original puts its graphic (渲染-2), lifted
 * by `up` (a flyer's hover, 渲染-21).
 * @param {THREE.Object3D} o @param {[number, number, number]} at @param {number} kind the unit's kind for a figure, else −1 @param {number} up
 */
function placeAt(o, at, kind, up) {
  const g = kind === KIND.ENEMY || kind === KIND.OPERATOR ? GRAPHIC : { south: 0, up: 0 };
  o.position.set(at[0], at[1] + g.up + up, at[2] + g.south);
}

/**
 * Where a unit stands and where its shadow lies, in three.js coordinates: at its feet; a flyer (渲染-21) at a constant
 * altitude over the ground's level, its shadow on the tile under it.
 * @param {{ width: number, height: number, highland?: number, tiles?: { height?: string }[][] }} level
 * @param {import('@aue/schema').ViewUnit} u @param {boolean} flying
 * @returns {{ at: [number, number, number], ground: [number, number, number] }}
 */
function placeOf(level, u, flying) {
  const at = /** @type {[number, number, number]} */ (toThree(tileWorld(level, u.x, u.y, flying ? 0 : u.z)));
  if (!flying) return { at, ground: at };
  const under = level.tiles?.[Math.round(u.y)]?.[Math.round(u.x)]?.height === 'HIGHLAND' ? 1 : 0;
  return { at, ground: /** @type {[number, number, number]} */ (toThree(tileWorld(level, u.x, u.y, under))) };
}

/**
 * A drawn unit's marks on the ground: its shadow (渲染-6), an operator's direction indicator (渲染-22).
 * @param {{ place: (id: number, at: [number, number, number]) => void }} shadows
 * @param {{ place: (id: number, at: [number, number, number], dir: number) => void }} marks
 * @param {import('@aue/schema').ViewUnit} u @param {[number, number, number]} ground
 */
function onGround(shadows, marks, u, ground) {
  shadows.place(u.id, ground);
  if (u.kind === KIND.OPERATOR) marks.place(u.id, ground, u.dir);
}

/**
 * The units drawn by effects (渲染-28): here each on the field has only its shadow, and counts as drawn.
 * @param {Set<string>} looks their content keys @param {(id: number) => string} keyOf
 * @param {{ place: (id: number, at: [number, number, number]) => void, drop: (id: number) => void }} shadows
 */
function lookedUnits(looks, keyOf, shadows) {
  /** @type {Set<number>} */ const on = new Set();
  return {
    on,
    /** Whether the unit is one of them; if so, its shadow at `ground`. @param {import('@aue/schema').ViewUnit} u @param {[number, number, number]} ground */
    place(u, ground) { if (!looks.has(keyOf(u.id))) return false; on.add(u.id); shadows.place(u.id, ground); return true; },
    /** Those gone from the view lose their shadows. @param {Set<number>} seen */
    prune(seen) { for (const id of on) if (!seen.has(id)) { on.delete(id); shadows.drop(id); } },
  };
}

/** @param {Figure} f */
const disposeFigure = (f) => { for (const x of Object.values(f.sides)) x.dispose(); };

/**
 * An attack event for a figure (渲染-3, 渲染-4): its clip starts, and the model turns toward the target of that swing.
 * @param {Map<number, import('./figure.js').Figure>} figures @param {import('@aue/schema').View} view
 * @param {{ type: string, id: number, target: number, wind: number, face?: number }} e
 */
function swingOf(figures, view, e) {
  const f = figures.get(Number(e.id));
  if (!f || f.dying) return;
  attacked(f, Number(e.wind), view.frame);
  // 渲染-4: only a swing that has one thing to face turns the model (the sim says which kind it is)
  if (e.face === 0) return;
  const t = view.units.find((v) => v.id === Number(e.target));
  if (t) f.aim = { x: t.x, y: t.y, id: t.id };
}

/**
 * The frame's swings and casts for the figures (渲染-3, 渲染-4): an attack turns and starts its clip, a cast its Skill_<n>.
 * @param {Map<number, Figure>} figures @param {import('@aue/schema').View} view @param {Event[]} events
 */
function playEvents(figures, view, events) {
  for (const e of events) {
    const f = e.type === 'cast' ? figures.get(Number(e.id)) : undefined;
    if (e.type === 'attack') swingOf(figures, view, /** @type {any} */ (e));
    else if (f && !f.dying) cast(f, Number(e.n), view.frame);
  }
}

/**
 * The units system; its shadows and the operators' direction indicators are separate objects (drawn before every unit).
 * @param {Map<string, THREE.Texture>} textures @param {Models} [models] by content key (operators by character id)
 * @param {Set<string>} [foeDevices] content keys of the devices on the enemies' side (装置-3)
 * @param {Map<string, import('./devicemesh.js').DeviceMeshModel>} [meshes] devices' mesh models by content key (渲染-20)
 * @param {{ flyers?: Set<string>, looks?: Set<string> }} [o] content keys of the flying enemies (渲染-21) and of the units
 *   whose look is an effect (渲染-28)
 */
export function createUnits(textures, models = new Map(), foeDevices = new Set(), meshes = new Map(), { flyers = new Set(), looks = new Set() } = {}) {
  const group = new THREE.Group(), shadows = createShadows(textures.get('ui:shadow')), marks = createIndicators(textures.get('ui:directionRing'), textures.get('ui:directionArrow'));
  /** @type {Map<number, THREE.Sprite | THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>>} cards and blocks */ const cards = new Map();
  /** @type {Map<number, Figure>} */ const figures = new Map();
  /** @type {Map<number, string>} unit id → content key, from the worker's frame messages */ const keys = new Map();
  const clock = { frame: 0, at: 0 }, mesh = createMeshDrawer(group, meshes, (id) => keys.get(id) ?? ''), looked = lookedUnits(looks, (id) => keys.get(id) ?? '', shadows);

  /** @param {import('@aue/schema').ViewUnit} u */
  const card = (u) => {
    const key = keys.get(u.id) ?? '', map = textures.get(unitTextureKey(u.kind, key));
    const s = map ? newCard(map) : u.kind === KIND.DEVICE ? newBlock(foeDevices.has(key)) : null;
    if (s) { group.add(s); cards.set(u.id, s); }
    return s;
  };

  /** @param {import('@aue/schema').ViewUnit} u @param {number} frame */
  const figure = (u, frame) => { const f = newFigure(models.get(keys.get(u.id) ?? ''), u, frame); if (f) { group.add(f.group); figures.set(u.id, f); } return f; };

  /** How high over its feet a unit is drawn (渲染-21): a flying enemy's hover — not one drawn by an effect (渲染-28) —, else 0. @param {number} id */
  const lift = (id) => (flyers.has(keys.get(id) ?? '') && !looks.has(keys.get(id) ?? '') ? HOVER : 0);

  /**
   * A unit at its place: a device's mesh (渲染-20), else its figure (an operator's or an enemy's offset, 渲染-2), else
   * its card or block, made on first sight; a flyer in the air (渲染-21), its shadow on the ground.
   * @param {import('@aue/schema').ViewUnit} u @param {{ at: [number, number, number], ground: [number, number, number] }} p @param {number} frame
   */
  const draw = (u, { at, ground }, frame) => {
    if (looked.place(u, ground)) return;
    if (mesh.draw(u, u.kind === KIND.DEVICE && !figures.has(u.id) && !cards.has(u.id), at)) return;
    const f = figures.get(u.id) ?? (cards.has(u.id) ? null : figure(u, frame)), s = f ? null : cards.get(u.id) ?? card(u);
    if (!f && !s) return;
    if (f) follow(f, u, frame, keys.get(u.id) ?? '');
    placeAt(f ? f.group : /** @type {THREE.Object3D} */ (s), at, f ? u.kind : -1, lift(u.id)); onGround(shadows, marks, u, ground);
  };

  /** Units gone from the view: cards go; a figure that died plays its die clip and goes after. @param {Set<number>} seen @param {Set<number>} died @param {number} frame */
  const prune = (seen, died, frame) => {
    for (const [id, s] of cards) if (!seen.has(id)) { group.remove(s); s.material.dispose(); cards.delete(id); shadows.drop(id); marks.drop(id); }
    mesh.prune(seen); looked.prune(seen);
    for (const [id, f] of figures) {
      if (seen.has(id)) continue;
      marks.drop(id);
      if (f.dying ? !deathOver(f, frame) : died.has(id) && dies(f, frame)) continue;
      group.remove(f.group); disposeFigure(f); figures.delete(id); shadows.drop(id);
    }
  };

  return {
    object: group,
    shadows: shadows.object,
    indicators: marks.object,
    /**
     * @param {import('@aue/schema').View} view @param {Record<string, string>} newKeys @param {{ width: number, height: number }} level
     * @param {number} [now] ms @param {Event[]} [events] the frame's presentation events
     */
    update(view, newKeys, level, now = performance.now(), events = []) {
      for (const [id, key] of Object.entries(newKeys)) keys.set(Number(id), key);
      Object.assign(clock, { frame: view.frame, at: now });
      const seen = new Set();
      for (const u of view.units) { seen.add(u.id); draw(u, placeOf(level, u, lift(u.id) > 0), view.frame); }
      playEvents(figures, view, events);
      prune(seen, new Set(events.filter((e) => e.type === 'death').map((e) => Number(e.id))), view.frame);
    },
    /** Poses every figure for the moment `now` and turns it to face the camera. @param {THREE.Camera} camera @param {number} [now] ms */
    pose(camera, now = performance.now()) {
      const frame = clock.frame + Math.min(1, Math.max(0, ((now - clock.at) * FPS) / 1000));
      for (const f of figures.values()) poseFigure(f, frame, camera);
    },
    /** The facilities' levels (守御-3) by unit id; those not given are at 0. @param {Record<string, number>} by */
    setLevels: mesh.setLevels,
    lift,
    count: () => cards.size + figures.size + mesh.placed.size,
    /** Whether a unit is drawn (as a living figure, a mesh, a card or an effect, 渲染-28). @param {number} id */
    shows: (id) => cards.has(id) || looked.on.has(id) || mesh.placed.has(id) || (figures.has(id) && !figures.get(id)?.dying),
    dispose() {
      for (const s of cards.values()) s.material.dispose();
      for (const f of figures.values()) disposeFigure(f);
      cards.clear(); figures.clear(); looked.on.clear(); mesh.placed.clear(); shadows.dispose(); marks.dispose();
    },
  };
}
