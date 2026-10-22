/**
 * 溢出检测 —— 纯函数层，零 React 依赖，可单测。
 *
 * 与 validate.ts 的分工：
 * - validate.ts 的 `out-of-bounds` 是**导出前**的批量检查与自动修正（拉回安全区）；
 * - 本模块是**编辑时**的实时体检：每帧（拖拽中）对每个可见块给出「越了哪条边、
 *   超了多少 mm、是否已经掉出纸张」。它不修正任何东西，只负责把事实告诉 UI。
 *
 * 两类问题：
 * - **位置越界**：rect 超出安全区（甚至掉出纸张）。拖拽/缩放都被 clampRect
 *   挡着，正常操作造不出来，主要用于揭示历史遗留的脏数据；
 * - **内容溢出**：块高度装不下文字。缩矮块时**实时发生**（没有自动增高机制
 *   在编辑期介入），是红点真正的主战场。
 * 严重度：掉出纸张（导出必被裁）> 越安全区 > 仅内容溢出。
 *
 * 容差 0.01mm：与 roundMm 的存储精度一致，避免「clampRect 刚拉回边界」的块
 * 因浮点误差被判成越界而一直亮红点。
 */

import type { Block, BlockRect } from './types.ts';
import { CANVAS_MM, SAFE_MARGIN_MM } from './types.ts';
import { rectBottom, rectRight, roundMm } from './geometry.ts';
import { estimateContentHeightMm } from './validate.ts';

/** 越界方向 */
export type OverflowSide = 'left' | 'right' | 'top' | 'bottom';

/** 浮点容差（mm）：mm 存储精度是 0.01，比它小一档即可 */
export const OVERFLOW_EPS_MM = 0.01;

export interface BlockOverflow {
  id: string;
  /** 越界方向（可能多个） */
  sides: OverflowSide[];
  /** 各方向超出量（mm，正数）。只含 sides 里出现的方向 */
  outMm: Partial<Record<OverflowSide, number>>;
  /**
   * 是否已掉出纸张物理边界（导出会被裁掉）。
   * 注意：offPage 的块必然同时有对应的 sides（安全区在纸张内）。
   */
  offPage: boolean;
  /**
   * 内容装不下当前高度时的估算需要高度（mm）；undefined = 装得下。
   *
   * 这才是编辑器里**真正会实时发生**的溢出：位置越界会被 clampRect 挡住
   * （拖不出安全区），但把块缩矮没有任何机制阻止——文字立刻被裁。
   * 估算口径与 validate.ts 的 fixOverflow 完全一致（同一个纯函数），
   * 所以「编辑时看到的点」与「导出前自动增高」不会互相矛盾。
   */
  contentOverflowMm?: number;
}

/** 安全区矩形（mm）：内容应待在里面的那块区域 */
export function safeArea(
  canvas: { width: number; height: number } = CANVAS_MM,
  margin: number = SAFE_MARGIN_MM,
): BlockRect {
  return {
    x: margin,
    y: margin,
    w: Math.max(0, canvas.width - margin * 2),
    h: Math.max(0, canvas.height - margin * 2),
  };
}

/**
 * 检测单个块的溢出情况（位置越界 + 内容装不下）。都正常返回 null。
 *
 * 两类问题共用一个返回值，UI 按字段分别呈现：
 * - sides / outMm / offPage：位置越界（红点 + 越界边描红）；
 * - contentOverflowMm：内容装不下（琥珀点，缩矮块时实时出现）。
 */
export function detectBlockOverflow(
  block: Block,
  canvas: { width: number; height: number } = CANVAS_MM,
  margin: number = SAFE_MARGIN_MM,
): BlockOverflow | null {
  const r = block.rect;
  const eps = OVERFLOW_EPS_MM;
  const sides: OverflowSide[] = [];
  const outMm: Partial<Record<OverflowSide, number>> = {};

  const left = margin - r.x;
  if (left > eps) {
    sides.push('left');
    outMm.left = roundMm(left);
  }
  const right = rectRight(r) - (canvas.width - margin);
  if (right > eps) {
    sides.push('right');
    outMm.right = roundMm(right);
  }
  const top = margin - r.y;
  if (top > eps) {
    sides.push('top');
    outMm.top = roundMm(top);
  }
  const bottom = rectBottom(r) - (canvas.height - margin);
  if (bottom > eps) {
    sides.push('bottom');
    outMm.bottom = roundMm(bottom);
  }

  const offPage =
    r.x < -eps ||
    r.y < -eps ||
    rectRight(r) > canvas.width + eps ||
    rectBottom(r) > canvas.height + eps;

  // 内容溢出：估算需要高度 > 当前高度（与 fixOverflow 同一个判定阈值）
  let contentOverflowMm: number | undefined;
  const need = estimateContentHeightMm(block);
  if (need > r.h + 0.01) contentOverflowMm = roundMm(need);

  // 两类都没命中 → 干净
  if (sides.length === 0 && contentOverflowMm === undefined) return null;

  return { id: block.id, sides, outMm, offPage, contentOverflowMm };
}

/**
 * 批量检测（跳过 visible === false 的块——它与导出一致，隐藏块不参与排版体检）。
 * 返回数组，顺序与输入一致。
 */
export function detectOverflow(
  blocks: Block[],
  canvas: { width: number; height: number } = CANVAS_MM,
  margin: number = SAFE_MARGIN_MM,
): BlockOverflow[] {
  const out: BlockOverflow[] = [];
  for (const b of blocks) {
    if (b.visible === false) continue;
    const o = detectBlockOverflow(b, canvas, margin);
    if (o) out.push(o);
  }
  return out;
}

/** 同上但返回 Map，供组件 O(1) 查询（渲染期每帧都要查） */
export function overflowMapOf(
  blocks: Block[],
  canvas: { width: number; height: number } = CANVAS_MM,
  margin: number = SAFE_MARGIN_MM,
): Map<string, BlockOverflow> {
  const map = new Map<string, BlockOverflow>();
  for (const o of detectOverflow(blocks, canvas, margin)) map.set(o.id, o);
  return map;
}

/** 是否有任何可见块越界（工具栏/导出守卫的开关用） */
export function hasOverflow(
  blocks: Block[],
  canvas: { width: number; height: number } = CANVAS_MM,
  margin: number = SAFE_MARGIN_MM,
): boolean {
  return detectOverflow(blocks, canvas, margin).length > 0;
}
