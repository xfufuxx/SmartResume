/**
 * A4Canvas —— 210×297mm 缩放舞台。
 *
 * 职责：
 * - 以 CSS mm 渲染 .lk-page（物理尺寸 = 导出 PDF 页面尺寸）；
 * - 持有 useDragEngine（需要 store 的 blocks / zoom / 开关，故放在组件内）；
 * - 缩放只做 transform: scale，mm 坐标永不被缩放污染；
 * - 网格覆盖层、吸附参考线、重叠提示、越界红点都在这里，且全部只进预览不进导出；
 * - react-moveable 实例挂在这里：target = 选中块，拖拽/缩放的几何计算
 *   全部委托 useDragEngine（内部走 mm 纯函数），moveable 只出交互体力。
 *
 * 布局用 CSS grid 把「标尺 + 舞台」拼成一个整体：
 *   [角标][横向标尺]
 *   [纵向标尺][舞台]
 * 标尺与页面同处一个滚动容器，缩放/滚动天然对齐，不需要额外同步 scrollPos。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import Moveable from 'react-moveable';
import { Empty, Spin } from 'antd';

import type { Block, LayoutDocument } from '../../lib/layout/types';
import { CANVAS_MM, SAFE_MARGIN_MM } from '../../lib/layout/types';
import { intersects, mmToPx, pxToMm } from '../../lib/layout/geometry';
import { overflowMapOf } from '../../lib/layout/overflow';
import { isPageEmpty, pageCountOf, pagesOf } from '../../lib/layout/paging';
import type { DragEngineApi } from '../../hooks/layout-editor/useDragEngine';
import { useDragEngine } from '../../hooks/layout-editor/useDragEngine';
import { useIsMobile } from '../../hooks/layout-editor/useIsMobile';
import { BlockFrame } from './BlockFrame';
import { Rulers } from './Rulers';
import { cx } from './cx';

/** 网格步长（mm） */
const GRID_MM = 5;

/** 跟随项目明暗主题（与 admin/page.tsx 等处一致） */
function useIsDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const sync = () => setDark(document.documentElement.classList.contains('dark'));
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

export interface A4CanvasProps {
  doc: LayoutDocument;
  zoom: number;
  gridSnap: boolean;
  alignAssist: boolean;
  selectedId: string | null;
  /** 当前显示页（0 基）——画布一次只渲染一页，标尺/moveable 保持单页语义 */
  activePage: number;
  onSelect: (id: string | null) => void;
  onCommitRect: (id: string, rect: Block['rect']) => void;
  /** 行内编辑态 */
  editingId?: string | null;
  onStartEdit?: (id: string) => void;
  onContentChange?: (id: string, payload: unknown) => void;
  onEndEdit?: () => void;
  /** 页签操作 */
  onPageChange?: (page: number) => void;
  onAddPage?: () => void;
  onRemovePage?: (page: number) => void;
}

export function A4Canvas({
  doc,
  zoom,
  gridSnap,
  alignAssist,
  selectedId,
  activePage,
  onSelect,
  onCommitRect,
  editingId = null,
  onStartEdit,
  onContentChange,
  onEndEdit,
  onPageChange,
  onAddPage,
  onRemovePage,
}: A4CanvasProps) {
  const readOnly = useIsMobile();
  const dark = useIsDark();
  const pageRef = useRef<HTMLDivElement>(null);

  const pageCount = pageCountOf(doc);
  const page = Math.max(0, Math.min(activePage, pageCount - 1));
  /** 当前页全部块（含隐藏）与可见块 */
  const pageBlocks = useMemo(
    () => pagesOf(doc)[page] ?? [],
    [doc, page],
  );

  const engine = useDragEngine({
    zoom,
    blocks: pageBlocks,
    canvas: CANVAS_MM,
    margin: SAFE_MARGIN_MM,
    snapEnabled: alignAssist,
    gridMm: gridSnap ? GRID_MM : null,
    selectedId,
    onCommit: onCommitRect,
  });

  /**
   * 参与渲染（重叠/越界判定）的 blocks。
   * 拖拽进行中用 engine.previewRect 覆盖对应块——这样红点是「实时」的：
   * 手指还没松就能看到这块已经越界，而不是等 commit 后才亮。
   */
  const effectiveBlocks = useMemo(() => {
    const p = engine.previewRect;
    if (!p) return pageBlocks;
    return pageBlocks.map((b) => (b.id === p.id ? { ...b, rect: p.rect } : b));
  }, [pageBlocks, engine.previewRect]);

  const visibleBlocks = useMemo(() => effectiveBlocks.filter((b) => b.visible !== false), [effectiveBlocks]);

  const selectedBlock = useMemo(
    () => doc.blocks.find((b) => b.id === selectedId) ?? null,
    [doc.blocks, selectedId],
  );

  /** moveable 能力开关：锁定块只显示选框，不拖不缩 */
  const canDrag =
    !readOnly &&
    !!selectedBlock &&
    selectedBlock.locked !== true &&
    selectedBlock.freedom !== 'locked';
  const canResize =
    !readOnly &&
    !!selectedBlock &&
    selectedBlock.locked !== true &&
    (selectedBlock.sizePolicy.resizableW || selectedBlock.sizePolicy.resizableH);

  /** 重叠检测：O(n²)，≤50 块 = 1225 次比较，render 级开销可忽略 */
  const overlappingIds = useMemo(() => {
    const ids = new Set<string>();
    for (let i = 0; i < visibleBlocks.length; i++) {
      for (let j = i + 1; j < visibleBlocks.length; j++) {
        if (intersects(visibleBlocks[i].rect, visibleBlocks[j].rect)) {
          ids.add(visibleBlocks[i].id);
          ids.add(visibleBlocks[j].id);
        }
      }
    }
    return ids;
  }, [visibleBlocks]);

  /** 越界检测：每帧 O(n)，结果按 id 索引供 BlockFrame 画红点 */
  const overflowMap = useMemo(
    () => overflowMapOf(effectiveBlocks, CANVAS_MM, SAFE_MARGIN_MM),
    [effectiveBlocks],
  );

  /** 鼠标在页面上的 mm 位置（画十字游标，配合标尺读数）；移出页面则隐藏 */
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  const updateCursor = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = pageRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // rect 是屏幕坐标（已含 scale(zoom)），先除 zoom 回到未缩放 CSS px，再转 mm
    const x = pxToMm((e.clientX - r.left) / zoom, 1);
    const y = pxToMm((e.clientY - r.top) / zoom, 1);
    setCursor({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
  };

  const pageBackgroundClick = (e: ReactPointerEvent<HTMLDivElement>) => {
    // 点到空白处（非区块、非 moveable 的选框/手柄 chrome）取消选中。
    // 必须排除 .moveable-control-box：手柄的 pointerdown 会冒泡到这里，
    // 若误判为「点空白」而清空 selectedId，moveable 的 target 会同步变为
    // null、controlGesto 被销毁，同一事件再到 window 时就没人处理缩放了。
    const t = e.target as HTMLElement;
    if (t.closest('.lk-blk') || t.closest('.moveable-control-box')) return;
    // 编辑中点空白：先收掉编辑（表单 blur 也会做，双保险），再取消选中
    if (editingId) onEndEdit?.();
    onSelect(null);
  };

  const stageWidthPx = mmToPx(doc.canvas.width, zoom);
  const stageHeightPx = mmToPx(doc.canvas.height, zoom);

  return (
    <div className="le-canvas-wrap">
      {/*
        页签栏：单页视图 + 页签切换（标尺 / 游标 / moveable 全部保持单页语义）。
        多页简历的跨页移动走 InspectorPanel 的「移到上/下一页」与
        SortablePanel 的跨页拖拽（见 MOVE_BLOCK_TO_PAGE / REORDER_BLOCK）。
      */}
      {pageCount > 1 && (
        <div className="le-page-tabs">
          {Array.from({ length: pageCount }, (_, i) => {
            const count = pagesOf(doc)[i]?.length ?? 0;
            const empty = isPageEmpty(doc, i);
            return (
              <div key={i} className={cx('le-page-tab', i === page && 'is-active')}>
                <button
                  type="button"
                  onClick={() => onPageChange?.(i)}
                  title={`第 ${i + 1} 页（${count} 块）`}
                >
                  第 {i + 1} 页
                  <span className="le-page-tab-count">{count}</span>
                </button>
                {empty && pageCount > 1 && onRemovePage && (
                  <button
                    type="button"
                    className="le-page-tab-close"
                    title="删除此空页"
                    onClick={() => onRemovePage(i)}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
          {onAddPage && (
            <button type="button" className="le-page-tab le-page-tab-add" onClick={onAddPage} title="添加新页">
              + 添加页
            </button>
          )}
        </div>
      )}

      <div className="le-workspace">
        <Rulers
          canvas={doc.canvas}
          margin={SAFE_MARGIN_MM}
          zoom={zoom}
          selection={selectedBlock ? selectedBlock.rect : null}
          dark={dark}
        />

        <div className="le-stage" style={{ width: stageWidthPx, height: stageHeightPx }}>
          <div
            ref={pageRef}
            className={cx('le-page', `le-zoom-${Math.round(zoom * 100)}`)}
            style={{ width: `${doc.canvas.width}mm`, height: `${doc.canvas.height}mm`, transform: `scale(${zoom})` }}
            onPointerDown={pageBackgroundClick}
            onPointerMove={updateCursor}
            onPointerLeave={() => setCursor(null)}
          >
            {gridSnap && <div className="le-grid" aria-hidden />}

            {visibleBlocks.map((block) => (
              <BlockFrame
                key={block.id}
                block={block}
                selected={block.id === selectedId}
                editing={block.id === editingId}
                overlapping={overlappingIds.has(block.id)}
                overflow={overflowMap.get(block.id) ?? null}
                engine={engine}
                readOnly={readOnly}
                onSelect={onSelect}
                onStartEdit={onStartEdit}
                onContentChange={onContentChange}
                onEndEdit={onEndEdit}
              />
            ))}

            {visibleBlocks.length === 0 && (
              <div className="le-empty">
                <Empty
                  description={
                    doc.blocks.length === 0
                      ? '暂无内容块，请先完成 AI 优化'
                      : `第 ${page + 1} 页为空，把块移进来或切换页签`
                  }
                />
              </div>
            )}

            {/* 吸附参考线（预览层 chrome，不进导出） */}
            {engine.guides.map((g, i) => (
              <div
                key={`${g.axis}-${g.position}-${i}`}
                className={cx('le-guide', g.axis === 'x' ? 'le-guide-x' : 'le-guide-y')}
                style={g.axis === 'x' ? { left: `${g.position}mm` } : { top: `${g.position}mm` }}
              />
            ))}

            {/* 鼠标游标十字线（mm 定位，与标尺读数对应） */}
            {cursor && (
              <>
                <div className="le-cursor le-cursor-x" style={{ left: `${cursor.x}mm` }} aria-hidden />
                <div className="le-cursor le-cursor-y" style={{ top: `${cursor.y}mm` }} aria-hidden />
              </>
            )}

            {/*
              react-moveable：拖拽 + 四角缩放 + 触摸。
              - snappable=false：吸附走我们已测试的 computeSnap（见 engine.guides）；
              - zoom={zoom}：moveable 把指针位移换算成页面坐标，适配器再乘回
                屏幕 px 喂给 mm 纯函数；
              - bounds 不传：安全区钳制由 resolveMove/resolveResize 内的
                clampRect 承担（更精确：自由度过滤 + 吸附 + roundMm 一次到位）；
              - origin=false：不显示中心原点；
              - 编辑态 target 置 null：行内编辑时块不是拖拽目标，选框/手柄
                一并消失，焦点完全交给表单；
              - 窄屏（readOnly）同样置 null：registerNode 不区分只读态，
                不在这里挡一道，点一下块 moveable 就挂上、触屏又能拖了，
                「只读预览」的提示就成了假的。窄屏排序走 SortablePanel。
            */}
            <Moveable
              target={editingId || readOnly ? null : engine.selectedTarget}
              draggable={canDrag}
              resizable={canResize}
              renderDirections={['nw', 'ne', 'sw', 'se']}
              origin={false}
              snappable={false}
              zoom={zoom}
              className="le-moveable"
              {...engine.handlers}
            />
          </div>
        </div>
      </div>

      {readOnly && (
        <div className="le-mobile-hint">
          <Spin size="small" /> 画布为只读预览，用下方「块顺序」面板拖拽调整排版
        </div>
      )}
    </div>
  );
}

/** 导出引擎 API 类型供测试/上层引用（避免循环 import 的再导出） */
export type { DragEngineApi };
