// A screen: a prefab (or a subtree of one) on the page (docs/spec/ui.md 界面-6–界面-8, 界面-24–界面-28, 界面-31). Nodes are
// found by the tail of their path; the page sets texts, pictures, sprites, colours, sliders, fills and states, plays
// clips, binds taps (a pressed button tints its target graphic), fills lists from their templates, puts text boxes on
// input fields. Nested prefabs are made where the prefab marks them; scroll views and tweens run by themselves.
import { build, refNode, setPicture, setText, stencilScan } from './node.js';
import { layout } from './layout.js';
import { FULL_RT, copyRect } from './rect.js';
import { setState, setTint, usable, buttonLook } from './rays.js';
import { attachScroll } from './scroll.js';
import { fadeTo, startTween } from './tween.js';
import { attachInput } from './input.js';

/** @typedef {import('./node.js').UiNode} UiNode */
/** @typedef {import('./node.js').PackNode} PackNode */
/** @typedef {import('./node.js').Ctx} Ctx */
/** @typedef {import('./anim.js').Animator} Animator */
/** @typedef {{ z?: number, at?: string, frame?: number[], into?: UiNode }} OpenOptions */

/** How deep nested prefabs are made inside one another. */
const NEST = 8;

// Paths outlive removals and must stay distinct across screens sharing an animator.
let nextInstance = 0;

/**
 * Unity's Slider showing a value (界面-7): the normalized value fills its fill image when that is a filled image, else
 * sets its fill rect's anchors — 0 to 1 across, and on the slider's axis up to the value (from the far end when the
 * direction is reversed).
 * @param {UiNode} s the slider @param {number} value
 */
export function setSlider(s, value) {
  const sl = s.n.comps.slider;
  if (!sl) return;
  const v = sl.whole ? Math.round(value) : value, n = sl.max > sl.min ? Math.max(0, Math.min(1, (v - sl.min) / (sl.max - sl.min))) : 0;
  const fill = refNode(s, sl.fill);
  if (!fill) return;
  if (fill.n.comps.img?.type === 3) { fill.fill = n; return; }
  const ax = sl.dir < 2 ? 0 : 1, reverse = sl.dir === 1 || sl.dir === 3;
  fill.rt.amin = [0, 0]; fill.rt.amax = [1, 1];
  if (reverse) fill.rt.amin[ax] = 1 - n; else fill.rt.amax[ax] = n;
}

/** The Selectable a tapped node belongs to: the node's own, or its parent's for a hit area child. @param {UiNode} s */
const selectableOf = (s) => s.n.comps.button ?? s.n.comps.toggle ?? s.parent?.n.comps.button ?? s.parent?.n.comps.toggle ?? null;

/** The prefab a pack reference names ('screen:<key>' or a key). @param {string | null | undefined} ref */
const screenKey = (ref) => (ref ? (ref.startsWith('screen:') ? ref.slice(7) : ref) : null);

/** A node's tweens that start by themselves (界面-33): its one tween and its others. @param {Record<string, any>} c its components */
const autoTweens = (c) => [c.tween, ...(c.tweens ?? [])].filter((tw) => tw?.auto);

export class Screen {
  /**
   * @param {Ctx} ctx @param {Animator} anim @param {string} name the prefab @param {OpenOptions} [o] `at`: the path of
   *   the subtree to open; `frame`: the size it is laid out in (else the canvas); `z`: its stacking order; `into`: a
   *   node of another screen it is opened in (界面-28)
   */
  constructor(ctx, anim, name, o = {}) {
    this.ctx = ctx; this.anim = anim; this.name = name; this.dead = false;
    /** @type {UiNode[]} */ this.all = [];
    /** @type {Map<string, UiNode[]>} */ this.found = new Map();
    this.frame = o.frame ?? null;
    /** @type {UiNode | null} */ this.into = o.into ?? null;
    const pn = o.at ? findPack(ctx.pack.screens[name], o.at) : ctx.pack.screens[name];
    if (!pn) throw new Error(`no prefab ${name}${o.at ? `/${o.at}` : ''} in the UI pack`);
    this.wrap = ctx.doc.createElement('div');
    this.wrap.className = 'aue-screen';
    if (o.z != null) this.wrap.style.zIndex = String(o.z);
    this.root = build(pn, null, o.at ?? '', this, o.at ?? '');
    // a root with a rect of its own (a top bar along the top edge, a part of a canvas) keeps it; one without, or a
    // root canvas whose rect the canvas drives (saved at scale 0), fills the canvas (or the frame)
    if (!pn.rt || pn.rt.scale[0] === 0 || pn.rt.scale[1] === 0) this.root.rt = copyRect(FULL_RT);
    stencilScan(this.root);
    this.wrap.appendChild(this.root.el);
    this.wire(this.all.slice(), 0);
  }

  /**
   * Makes the parts of newly built nodes work: nested prefabs where marked (界面-28), scroll views (界面-27), tweens
   * that start by themselves (界面-33).
   * @param {UiNode[]} nodes @param {number} depth
   */
  wire(nodes, depth) {
    for (const s of nodes) {
      const c = s.n.comps;
      if (c.scroll) attachScroll(s);
      for (const tw of autoTweens(c)) startTween(s, tw);
      const nest = c.mark ?? c.inst;
      const key = screenKey(nest?.screen);
      if (!nest || !key || !this.ctx.pack.screens[key] || depth >= NEST) continue;
      const at = c.inst ? refNode(s, c.inst.at) ?? s : s;
      const made = this.instantiate(at, key, undefined, { named: true, depth: depth + 1 });
      if (c.mark?.visible === 0) made.active = false;
    }
  }

  /**
   * Nodes whose path ends with a tail ('name' or 'parent/name'), in a node's subtree if given; an empty tail is that
   * node (or the screen's root).
   * @param {string} tail @param {UiNode} [under]
   */
  q(tail, under) {
    if (!tail) return [under ?? this.root];
    const key = `${under?.path ?? ''}|${tail}`, hit = this.found.get(key);
    if (hit) return hit;
    const base = under ? `${under.path}/` : '';
    const r = this.all.filter((s) => (!under || s === under || s.path.startsWith(base)) && (s.path === tail || s.path.endsWith(`/${tail}`)));
    this.found.set(key, r);
    return r;
  }

  /** @param {string} tail @param {UiNode} [under] */
  one(tail, under) { return this.q(tail, under)[0] ?? null; }
  /** @param {string} tail @param {unknown} v @param {UiNode} [under] */
  text(tail, v, under) { for (const s of this.q(tail, under)) setText(s, v); }
  /** @param {string} tail @param {unknown} v @param {UiNode} [under] */
  show(tail, v, under) { for (const s of this.q(tail, under)) s.active = !!v; }
  /** A picture (a URL; null for the prefab's sprite). @param {string} tail @param {string | null} url @param {UiNode} [under] */
  picture(tail, url, under) { for (const s of this.q(tail, under)) setPicture(s, url); }
  /** A sprite of the pack. @param {string} tail @param {string | null} key @param {UiNode} [under] */
  sprite(tail, key, under) { for (const s of this.q(tail, under)) { s.sprite = key; s.paintKey = ''; } }
  /** A graphic's or text's colour (r, g, b, a in 0–1). @param {string} tail @param {number[]} c @param {UiNode} [under] */
  color(tail, c, under) { for (const s of this.q(tail, under)) if (s.color) { s.color = [...c]; s.paintKey = ''; } }
  /** @param {string} tail @param {number} v @param {UiNode} [under] */
  slider(tail, v, under) { for (const s of this.q(tail, under)) setSlider(s, v); }
  /** A filled image's amount. @param {string} tail @param {number} v @param {UiNode} [under] */
  fill(tail, v, under) { for (const s of this.q(tail, under)) s.fill = v; }
  /** @param {string} tail @param {string} clip @param {import('./anim.js').PlayOptions} [o] @param {UiNode} [under] */
  play(tail, clip, o, under) { return this.anim.play(this.one(tail, under), clip, o); }
  /** A switch's or a button's state (界面-25). @param {string} tail @param {number} i @param {UiNode} [under] */
  state(tail, i, under) { for (const s of this.q(tail, under)) setState(s, i, fadeTo); }

  /**
   * A list's items (界面-26): n items made from its template (or the one given), the extra ones removed; each filled.
   * @param {string} tail @param {number} n @param {(item: UiNode, i: number) => void} [fill] @param {UiNode} [under]
   * @param {string} [template] a prefab for a list whose template the pack does not give ('screen:<key>' or a key)
   * @returns {UiNode[]}
   */
  list(tail, n, fill, under, template) {
    const s = this.q(tail, under).find((x) => x.n.comps.list || template) ?? null;
    const key = screenKey(template ?? s?.n.comps.list?.template);
    if (!s || !key || !this.ctx.pack.screens[key]) return [];
    const items = (s.items ??= []);
    while (items.length > n) this.remove(/** @type {UiNode} */ (items.pop()));
    while (items.length < n) items.push(this.instantiate(s, key));
    items.forEach((item, i) => { item.active = true; fill?.(item, i); });
    return items;
  }

  /**
   * A text box over an input field (界面-31). @param {string} tail @param {import('./input.js').InputOptions} o @param {UiNode} [under]
   */
  input(tail, o, under) {
    const s = this.q(tail, under).find((x) => x.n.comps.input);
    return s ? attachInput(s, o) : null;
  }

  /**
   * Makes nodes tappable: a click on a shown node whose buttons work calls fn; pressing tints its button's target
   * graphic by the pressed colour, and a colour set's targets with it (界面-6, 界面-24, 界面-25).
   * @param {string} tail @param {(e: Event, s: UiNode) => void} fn @param {UiNode} [under]
   */
  tap(tail, fn, under) {
    for (const s of this.q(tail, under)) {
      s.el.classList.add('aue-hot');
      s.el.addEventListener('click', (e) => { e.stopPropagation(); if (s.shown && usable(s)) fn(e, s); });
      this.press(s);
    }
  }

  /** A listener on nodes (pointer events for drags). @param {string} tail @param {string} type @param {(e: Event, s: UiNode) => void} fn @param {UiNode} [under] */
  on(tail, type, fn, under) {
    for (const s of this.q(tail, under)) { s.el.classList.add('aue-hot'); s.el.addEventListener(type, (e) => fn(e, s)); }
  }

  /** The pressed tint of a node's Selectable on its target graphic. @param {UiNode} s */
  press(s) {
    const sel = selectableOf(s);
    if (!sel || sel.transition !== 1 || !sel.colors || !sel.target) return;
    const target = refNode(s, sel.target), owner = s.n.comps.button || s.n.comps.toggle ? s : s.parent;
    if (!target || !owner) return;
    /** @param {boolean} on */
    const set = (on) => {
      owner.pressed = on && usable(owner);
      if (this.ctx.rays || owner.look != null) buttonLook(owner); else setTint(target, owner.pressed ? sel.colors.pressed : null);
    };
    s.el.addEventListener('pointerdown', () => set(true));
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) s.el.addEventListener(ev, () => set(false));
  }

  /**
   * A template prefab instantiated under a node (界面-8): its root keeps the template's rect; a layout group on the
   * container places it. A nested prefab (界面-28) is named by its root.
   * @param {UiNode} parent @param {string} tpl @param {number} [at] its index among the children (else last)
   * @param {{ named?: boolean, depth?: number }} [o]
   */
  instantiate(parent, tpl, at, o = {}) {
    const pn = this.ctx.pack.screens[tpl];
    if (!pn) throw new Error(`no prefab ${tpl} in the UI pack`);
    const from = this.all.length, path = o.named ? `${parent.path}/${pn.name}` : `${parent.path}/${tpl}#${nextInstance++}`;
    const s = build(pn, parent, path, this, '');
    stencilScan(s);
    if (at != null && at < parent.kids.length) { parent.el.insertBefore(s.el, parent.kids[at].el); parent.kids.splice(at, 0, s); }
    else { parent.kids.push(s); parent.el.appendChild(s.el); }
    this.found.clear();
    this.wire(this.all.slice(from), o.depth ?? 0);
    return s;
  }

  /** Removes an instantiated node and its subtree. @param {UiNode} s */
  remove(s) {
    const p = s.parent;
    if (p) p.kids.splice(p.kids.indexOf(s), 1);
    s.el.remove();
    const pre = s.path, gone = (/** @type {UiNode} */ x) => x.path === pre || x.path.startsWith(`${pre}/`);
    this.anim.drop((x) => gone(x.s));
    this.all = this.all.filter((x) => { if (!gone(x)) return true; x.gone = true; return false; });
    this.found.clear();
  }

  /** Lays the screen out in its frame (or the canvas of w × h). @param {number} w @param {number} h */
  layout(w, h) {
    const [fw, fh] = this.frame ?? [w, h];
    this.wrap.style.width = `${fw}px`; this.wrap.style.height = `${fh}px`;
    layout(this.root, fw, fh, [0.5, 0.5], this.into ? this.into.shown : true);
  }

  close() {
    this.dead = true;
    this.anim.drop((p) => p.s.scr === this);
    this.wrap.remove();
  }
}

/** A prefab's node at a path. @param {PackNode | undefined} n @param {string} path */
function findPack(n, path) {
  let cur = n;
  for (const part of path.split('/')) cur = cur?.children.find((c) => c.name === part);
  return cur;
}
