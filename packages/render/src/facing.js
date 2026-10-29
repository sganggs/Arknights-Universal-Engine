// The direction a unit's model faces (docs/spec/render.md 渲染-4). A unit attacking something faces it while the attack clip
// plays and goes back to its deploy direction when the clip is over — PRTS「作战机制」§3.2.2 敌人朝向与相对方位
// （https://prts.wiki/index.php?title=作战机制&oldid=441625）：「进行攻击时：如背对攻击目标，则会先面向攻击目标再进行
// 攻击」，且「具有面向判定的敌人只有左右两种朝向」。干员侧的细节见该条款的实测与推断 INF-0283。
//
// 实测：重新索敌时按 45° 判一次，且相对部署方向——朝上部署（背对镜头）的干员只在目标位于自身下方且 |dy| > |dx| 时
// 用正面，其余用背面；其他干员在目标位于上方且 |dy| > |dx| 时用背面，其余用正面，左右按目标在哪一侧。同一个目标持续
// 期间，目标换到别的**列**才按左右翻转，同一列时保持原来的左右；同一**格**时不判方向。全部只用到引擎自己的格子模型，
// 没有任何手调的阈值。
import { DIR } from '@aue/schema';
import { faceTurns } from './faceModes.js';

/** @typedef {{ side: 'front' | 'back', flip: boolean }} Facing */

/** The side opposite a given one. @param {'front' | 'back'} side @returns {'front' | 'back'} */
const opposite = (side) => (side === 'back' ? 'front' : 'back');

/**
 * The side a re-acquired target takes (渲染-4): the operator's deploy side, unless the target is steeply the other way —
 * the 45° rule, relative to the deploy side.
 * @param {boolean} backDeployed whether the operator is deployed with its back showing
 * @param {number} x right-positive offset, in tiles @param {number} y up-positive offset, in tiles
 * @returns {'front' | 'back'}
 */
const acquiredSide = (backDeployed, x, y) => {
  const own = backDeployed ? 'back' : 'front';
  const towardOther = backDeployed ? y < 0 : y > 0;
  return Math.abs(y) > Math.abs(x) && towardOther ? opposite(own) : own;
};

/**
 * One step of the facing state machine (渲染-4).
 *
 * A target that is not the one the model already faces — a re-acquisition — decides the side from the 45° rule (relative
 * to the deploy side) and the mirror from which side the target is on. While the same target persists, only a change of
 * column mirrors the model, and only a change of row switches side; a target in the model's own tile judges nothing.
 * @param {Facing} prev the side and mirror the model has now
 * @param {number} dx right-positive offset, in tiles @param {number} dy up-positive offset, in tiles
 * @param {boolean} newTarget whether this is a different target than before
 * @param {boolean} [backDeployed] whether the operator is deployed with its back showing (朝上, 渲染-4)
 * @returns {Facing}
 */
export function facingStep(prev, dx, dy, newTarget, backDeployed = false) {
  const x = Number(dx) || 0, y = Number(dy) || 0;
  // the engine's own columns and rows: an offset inside one tile is the same column / row
  const col = Math.round(x), row = Math.round(y);
  if (col === 0 && row === 0) return { side: prev.side, flip: prev.flip };
  if (newTarget) return { side: acquiredSide(backDeployed, x, y), flip: x < 0 };
  if (col === 0) return { side: y > 0 ? 'back' : 'front', flip: prev.flip };
  return { side: prev.side, flip: x < 0 };
}

/** The side a deploy direction alone gives (渲染-4): straight up is the back model. @param {number} dir */
export const sideOf = (dir) => (dir === DIR.UP ? 'back' : 'front');
/** Whether a deploy direction alone is mirrored (渲染-4). @param {number} dir */
export const flipOf = (dir) => dir === DIR.LEFT;
/** Whether an operator turns toward a target at all (the per-operator table). */
export { faceTurns };
