// @aue/ui: the battle UI from the original Unity UI prefabs (ADR 0021, docs/spec/ui.md) — exported node trees drawn as
// positioned elements on a canvas scaled to the page: RectTransform layout, auto layout, images, texts, masks, clips,
// sliders, taps and templates.
export { createUi, UI_CSS } from './ui.js';
export { Screen, setSlider } from './screen.js';
export { scrollOf, scrollTo } from './scroll.js';
export { Animator, loops } from './anim.js';
export { UiNode, build, nodeAt, refNode, setText, setPicture, stencilScan } from './node.js';
export { layout } from './layout.js';
export { arrange, groupPref, prefSize, groupKids, gridArrange, gridPref, gridColumns, gridCells } from './groups.js';
export { canvasSize, rectBox, transformCss, originCss, copyRect, DEF_RT, FULL_RT } from './rect.js';
export { evalKeys, applyCurve, spriteAt } from './curves.js';
export { richHtml, isRich, faceOf, alignCss, shadowCss, bestFit, DEFAULT_FONTS } from './text.js';
export { fillCss, gradientCss, sliceOf, isSliced, drawable, blendOf, uvSpeed, rgba, ringAlpha, ringMask, LARGE_CANVAS_AREA, LARGE_CANVAS_MAX } from './paint.js';
export { drawNine, wipeAlpha } from './raster.js';
export { shaded, noiseOffset, warpUv, fadeAlpha } from './shade.js';
export { createBattleHud, costView, costFlash, flashColor, speedSprite } from './battle/hud.js';
export { createCards, cardViews, cardWidth, waitText, placeSummons } from './battle/cards.js';
export { createCoopTop, coopSpeedSprite, reviveText } from './battle/coop.js';
export { createFieldMenus, dragFacing, groundOffset, ARROW_DIRS } from './battle/menus.js';
export { homography, matrix3d, mapPoint, groundTransform } from './persp.js';
/** @typedef {import('./node.js').UiPack} UiPack */
/** @typedef {import('./battle/hud.js').HudState} HudState */
/** @typedef {import('./battle/cards.js').DeckCard} DeckCard */
/** @typedef {import('./battle/menus.js').MenuSkill} MenuSkill */
/** @typedef {import('./battle/coop.js').CoopState} CoopState */
export { createCostAsk, costAsk, ANSWER_SHOWN } from './battle/coopcost.js';
export { createMarks, MARK_KIND } from './battle/marks.js';
export { createBattleEmotes } from './battle/emotes.js';
export { OBJECTIVES, TIMER_WARN, clockText } from './battle/coop.js';
/** @typedef {import('./battle/coopcost.js').CostAsk} CostAsk */
/** @typedef {import('./battle/coopcost.js').CostAskInput} CostAskInput */
/** @typedef {import('./battle/coop.js').Task} Task */
export { createStates } from './battle/states.js';
export { createUnitBars } from './battle/unitbars.js';
export { createStart } from './battle/start.js';
export { createBanner, bannerTitle, holdText } from './battle/banner.js';
export { createGoalBanner, GOAL_SOUNDS } from './battle/goal.js';
export { createCupHud, shotBanner, CUP_SOUNDS } from './battle/cup.js';
export { createResting, restText } from './battle/resting.js';
/** @typedef {import('./battle/resting.js').Resting} Resting */
/** @typedef {import('./battle/coop.js').FortressTask} FortressTask */
/** @typedef {import('./battle/coop.js').FootballTask} FootballTask */
/** @typedef {import('./battle/cup.js').CupTask} CupTask */
/** @typedef {import('./battle/banner.js').StageStart} StageStart */
/** @typedef {import('./battle/start.js').StageInfo} StageInfo */
/** @typedef {import('./battle/unitbars.js').UnitBar} UnitBar */
/** @typedef {import('./battle/states.js').BattleStates} BattleStates */
