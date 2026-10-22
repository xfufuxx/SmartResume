/**
 * 对齐吸附装配层 —— 把 blocks / zoom / 开关注入 geometry.ts 的纯函数。
 *
 * 本身无状态，只提供 useCallback 包装的解析方法：
 * - resolveMove：一次移动的完整解析（自由度过滤 + 吸附 + 钳制）；
 * - resolveResize：一次缩放的完整解析（四角手柄 + 锚定 + 最小尺寸）；
 * - computeSnap：直接算吸附结果，供 hover 提示等未来场景。
 *
 * 被 useDragEngine 消费；也可被任何需要「给定 rect 求合法 rect」的组件复用。
 */

import { useCallback } from 'react';

import type { Block, BlockRect, BlockSizePolicy, DragFreedom } from '../../lib/layout/types.ts';
import { CANVAS_MM, SAFE_MARGIN_MM, SNAP_THRESHOLD_PX } from '../../lib/layout/types.ts';
import type { ResizeHandle, ResolveMoveResult, SnapResult } from '../../lib/layout/geometry.ts';
import { computeSnap, resolveMove as resolveMoveRect, resolveResize as resolveResizeRect } from '../../lib/layout/geometry.ts';

export interface UseAlignmentOptions {
  /** 画布显示缩放（1 = 100%） */
  zoom?: number;
  /** 全部 block（用于生成吸附候选；visible === false 的自动排除） */
  blocks?: Block[];
  canvas?: { width: number; height: number };
  margin?: number;
  thresholdPx?: number;
  /** 对齐辅助总开关（gridSnap 之外的软吸附） */
  enabled?: boolean;
  /** 网格吸附步长（mm）；null/0 = 关闭 */
  gridMm?: number | null;
}

export interface AlignmentApi {
  /** 解析一次移动。excludeId 通常是正在拖拽的 block 自身 */
  resolveMove: (params: {
    start: BlockRect;
    deltaPx: { x: number; y: number };
    freedom: DragFreedom;
    excludeId?: string;
  }) => ResolveMoveResult;
  /** 解析一次缩放 */
  resolveResize: (params: {
    start: BlockRect;
    handle: ResizeHandle;
    deltaPx: { x: number; y: number };
    sizePolicy: BlockSizePolicy;
  }) => BlockRect;
  /** 不移动、只算吸附结果 */
  computeSnap: (rect: BlockRect, excludeId?: string) => SnapResult;
}

export function useAlignment(options: UseAlignmentOptions = {}): AlignmentApi {
  const {
    zoom = 1,
    blocks = [],
    canvas = CANVAS_MM,
    margin = SAFE_MARGIN_MM,
    thresholdPx = SNAP_THRESHOLD_PX,
    enabled = true,
    gridMm = null,
  } = options;

  /** 吸附候选：排除隐藏块与自身 */
  const othersFor = useCallback(
    (excludeId?: string): BlockRect[] =>
      blocks
        .filter((b) => b.visible !== false && b.id !== excludeId)
        .map((b) => b.rect),
    [blocks],
  );

  const resolveMove = useCallback(
    (params: {
      start: BlockRect;
      deltaPx: { x: number; y: number };
      freedom: DragFreedom;
      excludeId?: string;
    }) =>
      resolveMoveRect({
        start: params.start,
        deltaPx: params.deltaPx,
        zoom,
        freedom: params.freedom,
        canvas,
        margin,
        snap: { enabled, others: othersFor(params.excludeId), thresholdPx },
        gridMm,
      }),
    [zoom, canvas, margin, enabled, thresholdPx, gridMm, othersFor],
  );

  const resolveResize = useCallback(
    (params: {
      start: BlockRect;
      handle: ResizeHandle;
      deltaPx: { x: number; y: number };
      sizePolicy: BlockSizePolicy;
    }) =>
      resolveResizeRect({
        start: params.start,
        handle: params.handle,
        deltaPx: params.deltaPx,
        zoom,
        sizePolicy: params.sizePolicy,
        canvas,
        margin,
      }),
    [zoom, canvas, margin],
  );

  const computeSnapFor = useCallback(
    (rect: BlockRect, excludeId?: string) =>
      computeSnap(rect, othersFor(excludeId), { canvas, margin, thresholdPx, zoom }),
    [othersFor, canvas, margin, thresholdPx, zoom],
  );

  return { resolveMove, resolveResize, computeSnap: computeSnapFor };
}
