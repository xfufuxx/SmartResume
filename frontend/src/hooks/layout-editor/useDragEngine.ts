/**
 * 拖拽引擎 —— react-moveable 适配器 + 键盘方向键，零 store 依赖。
 *
 * 迁移说明（2026-10-21，引擎迁移）：
 * 原实现是自研 pointer 引擎（beginMove/beginResize + window 监听 + rAF 节流）。
 * 按需求固定选型迁移到 react-moveable，但**几何计算全部不变**——
 * 「moveable 出体力（指针捕获 / control 框 / 手柄 / 触摸归一），
 *   纯函数出大脑（自由度过滤 / 吸附 / 安全区钳制）」：
 * 1. onDrag/onResize 读 moveable 的位移量（beforeTranslate，zoom 换算回屏幕
 *    px 后）喂给已测试的 resolveMove/resolveResize，再覆写 DOM；
 * 2. moveable 的 snappable 关闭：避免与 computeSnap 两套吸附互相打架；
 * 3. 一次拖拽 = 一步历史：onDragEnd/onResizeEnd 才 onCommit；
 * 4. 键盘方向键微调（1px/Shift 10px）保留（moveable 不管键盘）；
 * 5. target 由 selectedId 派生。Gesto 的事件监听挂在 window 上、目标判定
 *    动态读 _dragTarget，且 componentDidUpdate 同步重建 gesto——因此
 *    「第一次按下未选中块」也能直接开始拖（React 离散事件的同步 flush
 *    先于事件冒泡到 window 完成 target 切换，已读源码确认）。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { OnDrag, OnDragEnd, OnDragStart, OnResize, OnResizeEnd, OnResizeStart } from 'react-moveable';

import type { Block, BlockRect, BlockSizePolicy, DragFreedom } from '../../lib/layout/types.ts';
import { CANVAS_MM, SAFE_MARGIN_MM, SNAP_THRESHOLD_PX } from '../../lib/layout/types.ts';
import type { ResizeHandle, SnapGuide } from '../../lib/layout/geometry.ts';
import { mmToPx, nudgeRect, roundMm } from '../../lib/layout/geometry.ts';
import { useAlignment } from './useAlignment.ts';

/** 方向键微调步长（CSS px @ 100% 缩放） */
export const NUDGE_PX = 1;
export const NUDGE_PX_FAST = 10;

export type DragMode = 'move' | 'resize';

export interface UseDragEngineOptions {
  /** 画布显示缩放（1 = 100%） */
  zoom?: number;
  /** 全部 block，用于吸附候选 */
  blocks?: Block[];
  canvas?: { width: number; height: number };
  margin?: number;
  /** 对齐吸附开关 */
  snapEnabled?: boolean;
  snapThresholdPx?: number;
  /** 网格吸附步长（mm）；null/0 = 关闭 */
  gridMm?: number | null;
  /** 当前选中块 id —— moveable 的 target 源 */
  selectedId?: string | null;
  /** 松手 / 松键后提交一次（store 负责入历史栈） */
  onCommit: (id: string, rect: BlockRect) => void;
}

/** A4Canvas 原样透传给 <Moveable> 的事件组 */
export interface MoveableHandlers {
  onDragStart: (e: OnDragStart) => void;
  onDrag: (e: OnDrag) => void;
  onDragEnd: (e: OnDragEnd) => void;
  onResizeStart: (e: OnResizeStart) => void;
  onResize: (e: OnResize) => void;
  onResizeEnd: (e: OnResizeEnd) => void;
}

export interface DragEngineApi {
  /** 正在拖拽/缩放的 block id（UI 可用于禁用文本选择等） */
  activeId: string | null;
  mode: DragMode | null;
  /** 当前参考线（吸附目标变化时才更新 state） */
  guides: SnapGuide[];
  /**
   * 拖拽/缩放进行中的实时 rect（未 commit）。
   *
   * 存在的意义：越界红点要「实时」——不能等松手 commit 后才亮。
   * 拖拽期间 DOM 位置由适配器直写 transform 推进，但 React state 里的
   * doc.blocks 还没变；上层把这一份临时 rect 覆盖进 blocks 副本，
   * 就能用同一套纯函数算出当前这一帧的越界情况。
   * 松手后立刻置 null（commit 的值已经进 doc）。
   */
  previewRect: { id: string; rect: BlockRect } | null;
  /** moveable 的 target：选中块的 DOM 节点（无选中为 null） */
  selectedTarget: HTMLElement | null;
  /** BlockFrame 用它注册自己的 DOM 节点：ref={(el) => api.registerNode(id, el)} */
  registerNode: (id: string, el: HTMLElement | null) => void;
  /** 透传给 <Moveable> 的六个事件处理器（稳定引用） */
  handlers: MoveableHandlers;
  onKeyDown: (
    e: ReactKeyboardEvent,
    id: string,
    rect: BlockRect,
    freedom: DragFreedom,
  ) => void;
}

interface MoveSession {
  id: string;
  startRect: BlockRect;
  freedom: DragFreedom;
  sizePolicy: BlockSizePolicy;
  mode: DragMode;
  /** resize 时为四角手柄；move 时为 null */
  handle: ResizeHandle | null;
  /** 最近一次合法 rect（onDragEnd 提交用；无 drag 过程则 = startRect） */
  lastRect: BlockRect;
}

function sameRect(a: BlockRect, b: BlockRect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

function sameGuides(a: SnapGuide[], b: SnapGuide[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((g, i) => g.axis === b[i].axis && g.position === b[i].position);
}

/** moveable 的 resize direction（[-1,-1]…[1,1]）→ 我们的四角手柄名 */
function directionToHandle(direction: number[]): ResizeHandle | null {
  const dx = direction[0];
  const dy = direction[1];
  if (dx < 0 && dy < 0) return 'nw';
  if (dx > 0 && dy < 0) return 'ne';
  if (dx < 0 && dy > 0) return 'sw';
  if (dx > 0 && dy > 0) return 'se';
  return null;
}

export function useDragEngine(options: UseDragEngineOptions): DragEngineApi {
  const {
    zoom = 1,
    blocks = [],
    canvas = CANVAS_MM,
    margin = SAFE_MARGIN_MM,
    snapEnabled = true,
    snapThresholdPx = SNAP_THRESHOLD_PX,
    gridMm = null,
    selectedId = null,
    onCommit,
  } = options;

  const alignment = useAlignment({
    zoom,
    blocks,
    canvas,
    margin,
    thresholdPx: snapThresholdPx,
    enabled: snapEnabled,
    gridMm,
  });

  const [activeId, setActiveId] = useState<string | null>(null);
  const [mode, setMode] = useState<DragMode | null>(null);
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<HTMLElement | null>(null);
  const [previewRect, setPreviewRect] = useState<{ id: string; rect: BlockRect } | null>(null);

  const nodesRef = useRef<Map<string, HTMLElement>>(new Map());
  const sessionRef = useRef<MoveSession | null>(null);
  const guidesRef = useRef<SnapGuide[]>([]);
  const previewRef = useRef<{ id: string; rect: BlockRect } | null>(null);

  // options 放 ref：回调不因父组件重渲染而失效
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  /** 参考线仅在内容变化时 setState，避免拖拽中每帧重渲染 */
  const setGuidesIfChanged = useCallback((next: SnapGuide[]) => {
    if (sameGuides(guidesRef.current, next)) return;
    guidesRef.current = next;
    setGuides(next);
  }, []);

  /** 同上：拖拽中的临时 rect 也只在真正变化时才 setState */
  const setPreviewIfChanged = useCallback((next: { id: string; rect: BlockRect } | null) => {
    const prev = previewRef.current;
    if (!next && !prev) return;
    if (next && prev && next.id === prev.id && sameRect(next.rect, prev.rect)) return;
    previewRef.current = next;
    setPreviewRect(next);
  }, []);

  // selectedId → moveable target。ref 回调也会在 id 匹配时刷新（块重挂场景）
  useEffect(() => {
    setSelectedTarget(selectedId ? nodesRef.current.get(selectedId) ?? null : null);
  }, [selectedId]);

  const registerNode = useCallback((id: string, el: HTMLElement | null) => {
    if (el) nodesRef.current.set(id, el);
    else nodesRef.current.delete(id);
    if (id === optionsRef.current.selectedId) setSelectedTarget(el);
  }, []);

  const blockOf = useCallback((id: string | null | undefined): Block | null => {
    if (!id) return null;
    return (optionsRef.current.blocks ?? []).find((b) => b.id === id) ?? null;
  }, []);

  /**
   * 移动：mm 纯函数 → 覆写 transform。
   * 注意 moveable 也会写 transform（未缩放的页面 px），我们后写覆盖它。
   *
   * 坐标口径（重要）：所有块都在 `.le-page`（transform: scale(zoom)）内部，
   * 子元素写入的 CSS 长度会被 zoom 二次放大。因此这里写**未缩放**的
   * 逻辑 px = mmToPx(delta, 1)，渲染到屏幕正好是 mmToPx(delta, zoom)。
   * 同理 beforeTranslate 是逻辑 px，进入 resolveMove 前要 ×zoom 还原成
   * 屏幕 px（吸附阈值 thresholdPx 是屏幕口径）。
   */
  const applyMove = useCallback(
    (session: MoveSession, deltaPx: { x: number; y: number }): BlockRect | null => {
      const result = alignment.resolveMove({ start: session.startRect, deltaPx, freedom: session.freedom });
      const el = nodesRef.current.get(session.id);
      if (el) {
        el.style.transform = `translate(${mmToPx(result.rect.x - session.startRect.x, 1)}px, ${mmToPx(
          result.rect.y - session.startRect.y,
          1,
        )}px)`;
      }
      setGuidesIfChanged(result.guides);
      setPreviewIfChanged({ id: session.id, rect: result.rect });
      return result.rect;
    },
    [alignment, setGuidesIfChanged, setPreviewIfChanged],
  );

  /**
   * 缩放：mm 纯函数 → 覆写 left/top/width/height。
   * 非拖动边锚定由 resolveResize 内部保证（nw 改 x/w、se 只改 w/h…）。
   *
   * 这里**必须写 mm 而不是 px**：块的盒模型由 React 以 `${x}mm` 形式管理，
   * 写同单位的 mm 能保证 React 后续 diff 时「值未变就不写、值变了才写」
   * 的行为完全正确；写 px 虽然视觉等价，但 React 内部记的是 mm，
   * 两者字符串不等会让它误判，且残留 px 在导出前若发生重渲染会错乱。
   */
  const applyResize = useCallback(
    (session: MoveSession, deltaPx: { x: number; y: number }): BlockRect | null => {
      if (!session.handle) return null;
      const rect = alignment.resolveResize({
        start: session.startRect,
        handle: session.handle,
        deltaPx,
        sizePolicy: session.sizePolicy,
      });
      const el = nodesRef.current.get(session.id);
      if (el) {
        el.style.transform = '';
        el.style.left = `${rect.x}mm`;
        el.style.top = `${rect.y}mm`;
        el.style.width = `${rect.w}mm`;
        el.style.height = `${rect.h}mm`;
      }
      setPreviewIfChanged({ id: session.id, rect });
      return rect;
    },
    [alignment, setPreviewIfChanged],
  );

  /**
   * 拖拽期临时写入的收尾 —— 只清 transform，不清盒模型 style。
   * 两个迁移后实测踩到的坑：
   * 1. moveable 对「零位移 click」也触发 dragEnd，若清盒模型 style，
   *    React 内部记录未变不会重写，块会瞬间错位；
   * 2. 有位移时若先清盒模型再 onCommit，React 的 diff 对「值未变的属性」
   *    （如只动了 top，left/w/h 不变）不会写 DOM，被清的属性永久缺失。
   * 而盒模型 px（mmToPx 含 zoom）与 React 的 mm 值在 scale 容器里视觉
   * 完全等价，导出也不读 DOM——所以不清，留给 React 全权管理；
   * transform 则必须清：React 从不写它，残留会与新的 left/top 叠加成
   * 双倍位移。
   */
  const clearTransform = useCallback((id: string) => {
    const el = nodesRef.current.get(id);
    if (el) el.style.transform = '';
  }, []);

  /**
   * moveable 的位移量是「逻辑 px」（已按 zoom prop 折算成未缩放坐标系）；
   * resolveMove/resolveResize 期望屏幕 px，故乘 zoom 换算回来。
   *
   * 拖拽取 `beforeTranslate`（目标左上角的位移）；
   * 缩放取 `dist`（手柄位移）——**不能**用 `drag.beforeTranslate`：
   * 拖 se 手柄时目标左上角不动，beforeTranslate 恒为 [0,0]，会变成「缩放没反应」。
   */
  const toScreenDelta = useCallback((translate: number[]) => {
    const z = optionsRef.current.zoom ?? 1;
    return { x: (translate[0] ?? 0) * z, y: (translate[1] ?? 0) * z };
  }, []);

  const handleDragStart = useCallback(
    (_e: OnDragStart) => {
      const block = blockOf(optionsRef.current.selectedId);
      if (!block) return;
      sessionRef.current = {
        id: block.id,
        startRect: block.rect,
        freedom: block.freedom,
        sizePolicy: block.sizePolicy,
        mode: 'move',
        handle: null,
        lastRect: block.rect,
      };
      setActiveId(block.id);
      setMode('move');
    },
    [blockOf],
  );

  const handleDrag = useCallback(
    (e: OnDrag) => {
      const session = sessionRef.current;
      if (!session || session.mode !== 'move') return;
      const rect = applyMove(session, toScreenDelta(e.beforeTranslate));
      if (rect) session.lastRect = rect;
    },
    [applyMove, toScreenDelta],
  );

  const handleDragEnd = useCallback(
    (e: OnDragEnd) => {
      const session = sessionRef.current;
      sessionRef.current = null;
      setActiveId(null);
      setMode(null);
      setGuidesIfChanged([]);
      // 松手即交还给 doc：后续由 commit 后的 blocks 决定红点
      setPreviewIfChanged(null);
      if (!session) return;
      // 用最后一次事件的位移同步重算一次：提交的就是屏幕最终位置
      const last = e.lastEvent as OnDrag | undefined;
      if (last?.beforeTranslate) {
        const rect = applyMove(session, toScreenDelta(last.beforeTranslate));
        if (rect) session.lastRect = rect;
      }
      // 零位移（单击选中）：只清我们写的 transform，React 的 mm 盒模型
      // style 是唯一真相，不能碰
      clearTransform(session.id);
      if (!sameRect(session.lastRect, session.startRect)) {
        onCommitRef.current(session.id, session.lastRect);
      }
    },
    [applyMove, clearTransform, setGuidesIfChanged, setPreviewIfChanged, toScreenDelta],
  );

  const handleResizeStart = useCallback(
    (_e: OnResizeStart) => {
      const block = blockOf(optionsRef.current.selectedId);
      if (!block) return;
      const handle = directionToHandle(_e.direction);
      if (!handle) return;
      sessionRef.current = {
        id: block.id,
        startRect: block.rect,
        freedom: block.freedom,
        sizePolicy: block.sizePolicy,
        mode: 'resize',
        handle,
        lastRect: block.rect,
      };
      setActiveId(block.id);
      setMode('resize');
    },
    [blockOf],
  );

  const handleResize = useCallback(
    (e: OnResize) => {
      const session = sessionRef.current;
      if (!session || session.mode !== 'resize') return;
      const rect = applyResize(session, toScreenDelta(e.dist));
      if (rect) session.lastRect = rect;
    },
    [applyResize, toScreenDelta],
  );

  const handleResizeEnd = useCallback(
    (e: OnResizeEnd) => {
      const session = sessionRef.current;
      sessionRef.current = null;
      setActiveId(null);
      setMode(null);
      setGuidesIfChanged([]);
      // 松手即交还给 doc：后续由 commit 后的 blocks 决定红点
      setPreviewIfChanged(null);
      if (!session) return;
      const last = e.lastEvent as OnResize | undefined;
      if (last?.dist) {
        const rect = applyResize(session, toScreenDelta(last.dist));
        if (rect) session.lastRect = rect;
      }
      clearTransform(session.id);
      if (!sameRect(session.lastRect, session.startRect)) {
        onCommitRef.current(session.id, session.lastRect);
      }
    },
    [applyResize, clearTransform, setGuidesIfChanged, setPreviewIfChanged, toScreenDelta],
  );

  const handlers = useMemo<MoveableHandlers>(
    () => ({
      onDragStart: handleDragStart,
      onDrag: handleDrag,
      onDragEnd: handleDragEnd,
      onResizeStart: handleResizeStart,
      onResize: handleResize,
      onResizeEnd: handleResizeEnd,
    }),
    [
      handleDragStart,
      handleDrag,
      handleDragEnd,
      handleResizeStart,
      handleResize,
      handleResizeEnd,
    ],
  );

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent, id: string, rect: BlockRect, freedom: DragFreedom) => {
      if (freedom === 'locked') return;
      const step = e.shiftKey ? NUDGE_PX_FAST : NUDGE_PX;
      let dx = 0;
      let dy = 0;
      switch (e.key) {
        case 'ArrowLeft':
          dx = -step;
          break;
        case 'ArrowRight':
          dx = step;
          break;
        case 'ArrowUp':
          dy = -step;
          break;
        case 'ArrowDown':
          dy = step;
          break;
        default:
          return;
      }
      e.preventDefault(); // 阻止方向键滚动页面
      const { zoom: z, canvas: c, margin: m } = optionsRef.current;
      onCommitRef.current(
        id,
        nudgeRect(rect, freedom, dx, dy, z ?? 1, c ?? CANVAS_MM, m ?? SAFE_MARGIN_MM),
      );
    },
    [],
  );

  // 卸载时收尾：清空 session，防止残留引用
  useEffect(
    () => () => {
      sessionRef.current = null;
    },
    [],
  );

  return {
    activeId, mode, guides, previewRect, selectedTarget, registerNode, handlers, onKeyDown,
  };
}

/** 导出 roundMm 供测试对齐断言（几何层已有实现，这里转发避免重复 import） */
export { roundMm };
