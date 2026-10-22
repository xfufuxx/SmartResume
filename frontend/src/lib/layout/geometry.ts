/**
 * 几何与单位换算 —— 纯函数层，零依赖，可单测。
 *
 * 分工：
 * - 换算：mm ↔ CSS px（96dpi 参考像素）/ pt（72dpi），zoom 只作为换算参数，不进存储；
 * - 矩形：相交 / 包含 / 面积；
 * - 约束：applyFreedom 管「这个 block 允许怎么动」，clampRect 管「不许出安全区」；
 * - 吸附：computeSnap 纯函数算 { dx, dy, guides }，交互层只负责调用和改 transform。
 */

import type { BlockRect, BlockSizePolicy, DragFreedom } from './types.ts';
import { CANVAS_MM, SAFE_MARGIN_MM, SNAP_THRESHOLD_PX } from './types.ts';

/** 1 英寸 = 25.4mm */
export const MM_PER_INCH = 25.4;

/** CSS 参考像素密度：1mm = 96/25.4 ≈ 3.7795 px */
export const CSS_PX_PER_MM = 96 / MM_PER_INCH;

/** 印刷点密度：1mm = 72/25.4 ≈ 2.8346 pt */
export const PT_PER_MM = 72 / MM_PER_INCH;

/** 存储精度：mm 保留 2 位小数（0.01mm ≈ 0.04px，肉眼不可辨） */
export function roundMm(value: number): number {
  return Math.round(value * 100) / 100;
}

function safeZoom(zoom: number): number {
  return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
}

/** mm → CSS px。zoom 为画布显示缩放（1 = 100%） */
export function mmToPx(mm: number, zoom = 1): number {
  return mm * CSS_PX_PER_MM * safeZoom(zoom);
}

/** CSS px → mm。zoom 为画布显示缩放（1 = 100%） */
export function pxToMm(px: number, zoom = 1): number {
  return px / (CSS_PX_PER_MM * safeZoom(zoom));
}

/** mm → pt（PDF 导出用） */
export function mmToPt(mm: number): number {
  return mm * PT_PER_MM;
}

/** pt → mm */
export function ptToMm(pt: number): number {
  return pt / PT_PER_MM;
}

export function rectRight(rect: BlockRect): number {
  return rect.x + rect.w;
}

export function rectBottom(rect: BlockRect): number {
  return rect.y + rect.h;
}

export function moveRect(rect: BlockRect, dx: number, dy: number): BlockRect {
  return { x: rect.x + dx, y: rect.y + dy, w: rect.w, h: rect.h };
}

/**
 * 矩形相交。边缘相接（面积 0）不算重叠——
 * 否则两块紧贴也会被 validateLayout 判成重叠。
 */
export function intersects(a: BlockRect, b: BlockRect): boolean {
  return a.x < rectRight(b) && b.x < rectRight(a) && a.y < rectBottom(b) && b.y < rectBottom(a);
}

/** 相交面积（mm²），不相交为 0 */
export function intersectionArea(a: BlockRect, b: BlockRect): number {
  const w = Math.min(rectRight(a), rectRight(b)) - Math.max(a.x, b.x);
  const h = Math.min(rectBottom(a), rectBottom(b)) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** outer 是否完整包含 inner */
export function contains(outer: BlockRect, inner: BlockRect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    rectRight(inner) <= rectRight(outer) &&
    rectBottom(inner) <= rectBottom(outer)
  );
}

/**
 * 把 rect 钳制回安全区（画布边界内、边距外）。
 * 尺寸超出内容区时收缩到内容区大小；坐标保留 2 位小数。
 */
export function clampRect(
  rect: BlockRect,
  canvas: { width: number; height: number } = CANVAS_MM,
  margin: number = SAFE_MARGIN_MM,
): BlockRect {
  const maxW = Math.max(0, canvas.width - margin * 2);
  const maxH = Math.max(0, canvas.height - margin * 2);
  const w = Math.min(rect.w, maxW);
  const h = Math.min(rect.h, maxH);
  const x = Math.min(Math.max(rect.x, margin), canvas.width - margin - w);
  const y = Math.min(Math.max(rect.y, margin), canvas.height - margin - h);
  return { x: roundMm(x), y: roundMm(y), w: roundMm(w), h: roundMm(h) };
}

/**
 * 按拖动自由度过滤候选位置。必须传入「拖动开始时的 rect」作为基准，
 * 不能拿上一帧已过滤的 rect 当基准——否则 locked 轴会相对漂移。
 */
export function applyFreedom(
  start: BlockRect,
  next: BlockRect,
  freedom: DragFreedom,
): BlockRect {
  switch (freedom) {
    case 'horizontal':
      return { x: next.x, y: start.y, w: next.w, h: next.h };
    case 'vertical':
      return { x: start.x, y: next.y, w: next.w, h: next.h };
    case 'locked':
      return { x: start.x, y: start.y, w: start.w, h: start.h };
    default:
      // 'free'
      return { x: next.x, y: next.y, w: next.w, h: next.h };
  }
}

/** 一条对齐参考线。span 是它在另一根轴上的覆盖范围（mm） */
export interface SnapGuide {
  axis: 'x' | 'y';
  /** 参考线位置（mm） */
  position: number;
  /** x 轴参考线的 span 是垂直范围 [y1, y2]；y 轴参考线的 span 是水平范围 [x1, x2] */
  span: [number, number];
}

export interface SnapOptions {
  canvas?: { width: number; height: number };
  /** 安全边距（mm） */
  margin?: number;
  /** 吸附阈值（px @ 当前缩放） */
  thresholdPx?: number;
  /** 当前画布缩放，用于把 px 阈值换算成 mm */
  zoom?: number;
}

export interface SnapResult {
  /** 应叠加到 moving.x 的位移（mm） */
  dx: number;
  /** 应叠加到 moving.y 的位移（mm） */
  dy: number;
  /** 要显示的参考线 */
  guides: SnapGuide[];
}

interface SnapCandidate {
  position: number;
  span: [number, number];
}

function nearestSnap(
  edges: number[],
  candidates: SnapCandidate[],
  thresholdMm: number,
  axis: 'x' | 'y',
  moving: BlockRect,
): { delta: number; guide: SnapGuide | null } {
  let found = false;
  let bestDelta = 0;
  let best: SnapCandidate | null = null;
  for (const edge of edges) {
    for (const candidate of candidates) {
      const delta = candidate.position - edge;
      if (Math.abs(delta) > thresholdMm) continue;
      if (!found || Math.abs(delta) < Math.abs(bestDelta)) {
        found = true;
        bestDelta = delta;
        best = candidate;
      }
    }
  }
  if (!found || !best) return { delta: 0, guide: null };
  const span: [number, number] =
    axis === 'x'
      ? [Math.min(best.span[0], moving.y), Math.max(best.span[1], rectBottom(moving))]
      : [Math.min(best.span[0], moving.x), Math.max(best.span[1], rectRight(moving))];
  return {
    delta: bestDelta,
    guide: { axis, position: roundMm(best.position), span: [roundMm(span[0]), roundMm(span[1])] },
  };
}

/**
 * 计算移动中 rect 的吸附结果。
 *
 * 吸附源：画布四边（0 / 宽 / 高）、安全边距（margin / 宽-margin / 高-margin）、
 * 其他 block 的左/右/中（x 轴）与上/下/中（y 轴）。
 * 每根轴取阈值内最近的候选；已对齐（delta=0）也返回 guide，用于显示参考线。
 *
 * 调用方拿到结果后的标准用法：
 *   const snapped = clampRect({ ...moving, x: moving.x + r.dx, y: moving.y + r.dy }, ...);
 */
export function computeSnap(
  moving: BlockRect,
  others: BlockRect[],
  options: SnapOptions = {},
): SnapResult {
  const canvas = options.canvas ?? CANVAS_MM;
  const margin = options.margin ?? SAFE_MARGIN_MM;
  const thresholdPx = options.thresholdPx ?? SNAP_THRESHOLD_PX;
  const zoom = options.zoom ?? 1;
  const thresholdMm = pxToMm(thresholdPx, zoom);

  const xCandidates: SnapCandidate[] = [
    { position: 0, span: [0, canvas.height] },
    { position: canvas.width, span: [0, canvas.height] },
    { position: margin, span: [margin, canvas.height - margin] },
    { position: canvas.width - margin, span: [margin, canvas.height - margin] },
  ];
  const yCandidates: SnapCandidate[] = [
    { position: 0, span: [0, canvas.width] },
    { position: canvas.height, span: [0, canvas.width] },
    { position: margin, span: [margin, canvas.width - margin] },
    { position: canvas.height - margin, span: [margin, canvas.width - margin] },
  ];
  for (const other of others) {
    if (other === moving) continue; // 防御：others 里混入自身时跳过，避免自吸附
    const right = rectRight(other);
    const bottom = rectBottom(other);
    xCandidates.push(
      { position: other.x, span: [other.y, bottom] },
      { position: other.x + other.w / 2, span: [other.y, bottom] },
      { position: right, span: [other.y, bottom] },
    );
    yCandidates.push(
      { position: other.y, span: [other.x, right] },
      { position: other.y + other.h / 2, span: [other.x, right] },
      { position: bottom, span: [other.x, right] },
    );
  }

  const xEdges = [moving.x, moving.x + moving.w / 2, rectRight(moving)];
  const yEdges = [moving.y, moving.y + moving.h / 2, rectBottom(moving)];

  const snapX = nearestSnap(xEdges, xCandidates, thresholdMm, 'x', moving);
  const snapY = nearestSnap(yEdges, yCandidates, thresholdMm, 'y', moving);

  const guides: SnapGuide[] = [];
  if (snapX.guide) guides.push(snapX.guide);
  if (snapY.guide) guides.push(snapY.guide);
  return { dx: snapX.delta, dy: snapY.delta, guides };
}

// ============ 交互解析：把「一次指针/按键输入」解析成合法 rect ============

/** 把坐标量化到 gridMm 整数倍。受 freedom 约束的轴不量化（该轴坐标本就恒定） */
function quantizeToGrid(rect: BlockRect, gridMm: number, freedom: DragFreedom): BlockRect {
  const q = (v: number): number => roundMm(Math.round(v / gridMm) * gridMm);
  return {
    ...rect,
    x: freedom === 'vertical' ? rect.x : q(rect.x),
    y: freedom === 'horizontal' ? rect.y : q(rect.y),
  };
}

/** 缩放手柄位置（四角） */
export type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se';

export interface ResolveMoveParams {
  /** 拖动开始时的 rect（mm）。自由度过滤必须基于它，不能用上一帧结果，否则会累积漂移 */
  start: BlockRect;
  /** 指针相对起点累计位移（CSS px） */
  deltaPx: { x: number; y: number };
  /** 画布显示缩放（1 = 100%） */
  zoom?: number;
  freedom: DragFreedom;
  canvas?: { width: number; height: number };
  margin?: number;
  /** 吸附配置：enabled 为 true 时启用，others 为其他 block 的 rect */
  snap?: { enabled: boolean; others?: BlockRect[]; thresholdPx?: number } | null;
  /**
   * 网格吸附步长（mm）。非 null 且 > 0 时，坐标量化到网格整数倍——
   * 应用顺序：自由度轴过滤 → 网格量化 → 软吸附 → 钳制。
   * 软吸附优先于网格（吸附是更细的对齐意图），所以网格在吸附之前量化。
   */
  gridMm?: number | null;
}

export interface ResolveMoveResult {
  rect: BlockRect;
  guides: SnapGuide[];
}

/**
 * 解析一次移动：px → mm → 自由度轴过滤 → 吸附 → 安全区钳制。
 *
 * 注意吸附位移也会再过一次自由度——horizontal 的 block 不应该被 dy 吸到
 * 别的行上去；locked 直接返回起始 rect。参考线按自由度过滤，
 * horizontal 只显示垂直参考线（x 轴），vertical 只显示水平参考线（y 轴）。
 */
export function resolveMove(p: ResolveMoveParams): ResolveMoveResult {
  const zoom = safeZoom(p.zoom ?? 1);
  const canvas = p.canvas ?? CANVAS_MM;
  const margin = p.margin ?? SAFE_MARGIN_MM;
  const next = moveRect(p.start, pxToMm(p.deltaPx.x, zoom), pxToMm(p.deltaPx.y, zoom));
  const freed = applyFreedom(p.start, next, p.freedom);
  if (p.freedom === 'locked') {
    return { rect: clampRect(p.start, canvas, margin), guides: [] };
  }
  let moved = freed;
  let guides: SnapGuide[] = [];
  if (p.gridMm && p.gridMm > 0) {
    moved = quantizeToGrid(moved, p.gridMm, p.freedom);
  }
  if (p.snap?.enabled) {
    const snap = computeSnap(freed, p.snap.others ?? [], {
      canvas,
      margin,
      thresholdPx: p.snap.thresholdPx,
      zoom,
    });
    moved = applyFreedom(
      p.start,
      { ...freed, x: freed.x + snap.dx, y: freed.y + snap.dy },
      p.freedom,
    );
    guides = snap.guides.filter((g) =>
      p.freedom === 'horizontal' ? g.axis === 'x' : p.freedom === 'vertical' ? g.axis === 'y' : true,
    );
  }
  return { rect: clampRect(moved, canvas, margin), guides };
}

export interface ResolveResizeParams {
  start: BlockRect;
  handle: ResizeHandle;
  /** 指针相对起点累计位移（CSS px） */
  deltaPx: { x: number; y: number };
  zoom?: number;
  /** 尺寸策略：决定哪条边可动、最小尺寸 */
  sizePolicy: BlockSizePolicy;
  canvas?: { width: number; height: number };
  margin?: number;
}

/**
 * 解析一次缩放。nw/ne/sw/se 四角手柄，非拖动边锚定：
 * - 拖右侧（ne/se）左边不动；拖下侧（se/sw）上边不动；
 * - 拖左上（nw）右下钉死；拖右上（ne）左下钉死；以此类推。
 * 不可缩放的轴（sizePolicy）忽略该方向位移；最小尺寸兜底防翻转。
 */
export function resolveResize(p: ResolveResizeParams): BlockRect {
  const zoom = safeZoom(p.zoom ?? 1);
  const canvas = p.canvas ?? CANVAS_MM;
  const margin = p.margin ?? SAFE_MARGIN_MM;
  const { resizableW, resizableH, minW, minH } = p.sizePolicy;
  const dx = pxToMm(p.deltaPx.x, zoom);
  const dy = pxToMm(p.deltaPx.y, zoom);
  const right = rectRight(p.start);
  const bottom = rectBottom(p.start);
  const east = p.handle === 'ne' || p.handle === 'se';
  const south = p.handle === 'se' || p.handle === 'sw';

  let { x, y } = p.start;
  let w = p.start.w;
  let h = p.start.h;

  if (resizableW) {
    w = east ? p.start.w + dx : right - (p.start.x + dx);
    // 上界：东边受画布右界限制，西边受锚定 right 限制
    w = Math.min(w, east ? canvas.width - margin - x : right - margin);
    w = Math.max(w, minW);
    if (!east) x = right - w;
  }
  if (resizableH) {
    h = south ? p.start.h + dy : bottom - (p.start.y + dy);
    h = Math.min(h, south ? canvas.height - margin - y : bottom - margin);
    h = Math.max(h, minH);
    if (!south) y = bottom - h;
  }
  return clampRect({ x, y, w, h }, canvas, margin);
}

/**
 * 键盘微调：一次按键 = 一步历史（不走吸附——按键是精确操作，
 * 吸附会帮倒忙）。freedom 轴过滤 + 安全区钳制与拖拽一致。
 */
export function nudgeRect(
  rect: BlockRect,
  freedom: DragFreedom,
  dxPx: number,
  dyPx: number,
  zoom = 1,
  canvas: { width: number; height: number } = CANVAS_MM,
  margin: number = SAFE_MARGIN_MM,
): BlockRect {
  const z = safeZoom(zoom);
  const next = moveRect(rect, pxToMm(dxPx, z), pxToMm(dyPx, z));
  return clampRect(applyFreedom(rect, next, freedom), canvas, margin);
}
