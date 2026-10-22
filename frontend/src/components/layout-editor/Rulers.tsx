/**
 * Rulers —— 画布四周的 mm 标尺（@scena/react-guides）。
 *
 * 定位：**纯预览 chrome**，不进导出（导出只认 doc.blocks 的 mm 矩形）。
 *
 * 为什么用 Guides 而不是自己画 canvas：
 * - 需求固定选型；且它自带刻度密度自适应、拖拽参考线与缩放重绘，
 *   比手写 canvas 少一大堆边界处理；
 * - 这里只用到它的「标尺 + 参考线」能力：参考线被用来标出**安全区边界**
 *   与**当前选中块的两条边**，让用户不用算就能看出块有没有越线。
 *
 * 关键换算：Ruler 的 `zoom` 语义是「一个 unit 单位占多少屏幕 px」，
 * 文档示例「1cm = 37.7952px → zoom: 37.7952, unit: 1」。
 * 我们要每 10mm 一条主刻度，故 zoom = 10 × CSS_PX_PER_MM × 视图缩放。
 * segment=10 → 两条主刻度之间再分 10 小格，即每 1mm 一小格。
 */

import { useEffect, useRef, useState } from 'react';
import Guides from '@scena/react-guides';

import type { BlockRect } from '../../lib/layout/types';
import { CSS_PX_PER_MM, mmToPx } from '../../lib/layout/geometry';

/** 标尺厚度（CSS px，屏幕坐标，不随画布缩放） */
export const RULER_SIZE = 22;

/** 主刻度间隔（mm）：每 10mm 一条带数字的线 */
const RULER_UNIT_MM = 10;
/** 主刻度之间的小格数：10 格 = 每 1mm 一小格 */
const RULER_SEGMENT = 10;

export interface RulersProps {
  /** 画布尺寸（mm） */
  canvas: { width: number; height: number };
  /** 安全边距（mm）：标尺上用参考线标出 */
  margin: number;
  /** 画布显示缩放（1 = 100%） */
  zoom: number;
  /** 当前选中块 rect（mm）；null 时标尺只画安全区 */
  selection: BlockRect | null;
  /** 暗色模式 */
  dark?: boolean;
}

/**
 * 标尺参考线位置（屏幕 px）：安全区两条边 + 选中块两条边。
 * 抽成纯函数便于单独验证换算口径。
 */
export function guidePositionsMm(
  canvas: { width: number; height: number },
  margin: number,
  selection: BlockRect | null,
): { horizontal: number[]; vertical: number[] } {
  const vertical = [margin, canvas.width - margin];
  const horizontal = [margin, canvas.height - margin];
  if (selection) {
    vertical.push(selection.x, selection.x + selection.w);
    horizontal.push(selection.y, selection.y + selection.h);
  }
  return { horizontal, vertical };
}

export function Rulers({ canvas, margin, zoom, selection, dark = false }: RulersProps) {
  // Guides 内部用 canvas + ResizeObserver，只在客户端挂载后再渲染，SSR 直接跳过
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const hRef = useRef<Guides>(null);
  const vRef = useRef<Guides>(null);

  const stageW = mmToPx(canvas.width, zoom);
  const stageH = mmToPx(canvas.height, zoom);
  const rulerZoom = RULER_UNIT_MM * CSS_PX_PER_MM * zoom;
  /**
   * 纵向标尺的 zoom 口径与横向**不一致**（react-ruler 0.28 实测）：
   * 同样传 unit=10，横向主刻度间距 = zoom（37.8 CSS px = 10mm，正确），
   * 纵向却是 zoom × unit（378 CSS px = 100mm，整整 10 倍）。
   * 因此纵向这里不乘 RULER_UNIT_MM，两个方向才都落在 10mm。
   * 这是实测反推出来的补偿，改 ruler 版本时要重新量一次。
   */
  const rulerZoomV = CSS_PX_PER_MM * zoom;

  const { horizontal, vertical } = guidePositionsMm(canvas, margin, selection);
  const hPx = horizontal.map((mm) => mmToPx(mm, zoom));
  const vPx = vertical.map((mm) => mmToPx(mm, zoom));

  // 参考线随选中块/缩放变化。Guides 的 guides 是内部 state，只能通过
  // ref.loadGuides() 更新（没有对应的受控 prop）。
  useEffect(() => {
    if (!mounted) return;
    hRef.current?.loadGuides(hPx);
  }, [mounted, hPx.join(','), zoom]);

  useEffect(() => {
    if (!mounted) return;
    vRef.current?.loadGuides(vPx);
  }, [mounted, vPx.join(','), zoom]);

  const palette = dark
    ? { background: '#2C2C2E', line: '#8E8E93', text: '#D1D1D6', guide: '#0A84FF' }
    : { background: '#FAFAFA', line: '#9CA3AF', text: '#6B7280', guide: '#0066D6' };

  return (
    <>
      <div
        className="le-ruler-corner"
        style={{ width: RULER_SIZE, height: RULER_SIZE, background: palette.background }}
        aria-hidden
      />
      <div className="le-ruler le-ruler-h" style={{ width: stageW, height: RULER_SIZE }} aria-hidden>
        {mounted && (
          <Guides
            ref={hRef}
            type="horizontal"
            width={stageW}
            height={RULER_SIZE}
            zoom={rulerZoom}
            unit={RULER_UNIT_MM}
            segment={RULER_SEGMENT}
            backgroundColor={palette.background}
            lineColor={palette.line}
            textColor={palette.text}
            guideStyle={{ background: palette.guide }}
            guidePosStyle={{ color: palette.guide }}
            // 只借用它的参考线做标注，禁止用户增删拖动（那会改变布局语义）
            lockGuides={['add', 'change', 'remove']}
            displayDragPos={false}
            displayGuidePos={false}
            negativeRuler={false}
            range={[0, stageW]}
            font="10px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
          />
        )}
      </div>
      <div className="le-ruler le-ruler-v" style={{ width: RULER_SIZE, height: stageH }} aria-hidden>
        {mounted && (
          <Guides
            ref={vRef}
            type="vertical"
            width={RULER_SIZE}
            height={stageH}
            zoom={rulerZoomV}
            unit={RULER_UNIT_MM}
            segment={RULER_SEGMENT}
            backgroundColor={palette.background}
            lineColor={palette.line}
            textColor={palette.text}
            guideStyle={{ background: palette.guide }}
            guidePosStyle={{ color: palette.guide }}
            lockGuides={['add', 'change', 'remove']}
            displayDragPos={false}
            displayGuidePos={false}
            negativeRuler={false}
            range={[0, stageH]}
            font="10px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
          />
        )}
      </div>
    </>
  );
}
