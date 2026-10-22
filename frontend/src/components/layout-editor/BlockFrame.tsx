/**
 * BlockFrame —— 单个可拖拽区块的预览框架。
 *
 * 与导出的对应关系（1:1 的关键）：
 * - 本组件渲染的 DOM 结构 = layoutBodyHtml() 生成的导出结构：
 *   .lk-blk（inline mm 定位）> .lk-blk-content（样式覆盖）> blockInnerHtml()；
 * - 选区框（.is-selected）、重叠警示（.is-overlapping）只以附加 class 存在，
 *   导出 HTML 由 doc 生成时天然没有它们；
 * - visible === false 的块不渲染（A4Canvas 过滤），与导出一致。
 *
 * 交互委托：拖拽/缩放由 A4Canvas 里的 react-moveable 实例驱动（target 即本
 * 组件注册的 DOM），本组件只负责选中、键盘微调与自身注册——不持有任何拖拽
 * 状态。缩放手柄不再自渲染（原 .lk-handle），统一由 moveable 绘制。
 */

import { useRef } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';

import type { Block } from '../../lib/layout/types';
import type { BlockOverflow, OverflowSide } from '../../lib/layout/overflow';
import { blockInnerHtml } from '../../lib/layout/renderHtml';
import type { DragEngineApi } from '../../hooks/layout-editor/useDragEngine';
import { InlineEditor } from './InlineEditor';
import { cx } from './cx';

/** 双击判定间隔（ms）。浏览器 dblclick 阈值约 500ms，取 350ms 保守 */
const DBLCLICK_MS = 350;

const SIDE_LABEL: Record<OverflowSide, string> = {
  left: '左',
  right: '右',
  top: '上',
  bottom: '下',
};

/** 红点的 tooltip：把位置越界与内容溢出分别说清楚 */
function overflowTitle(o: BlockOverflow): string {
  const lines: string[] = [];
  if (o.sides.length > 0) {
    const parts = o.sides.map((s) => `${SIDE_LABEL[s]} ${o.outMm[s] ?? 0}mm`);
    lines.push(`超出安全区：${parts.join('、')}`);
  }
  if (o.contentOverflowMm !== undefined) {
    lines.push(`内容装不下：需要约 ${o.contentOverflowMm}mm 高，导出前会自动增高`);
  }
  if (o.offPage) lines.push('已出纸张边界，导出会被裁掉');
  return lines.join('；');
}

/** BlockStyle → React inline style（与 renderHtml.blockContentStyleString 保持同映射） */
function contentStyle(block: Block): CSSProperties | undefined {
  const s = block.style;
  if (!s) return undefined;
  const style: CSSProperties = {};
  if (typeof s.fontSizePt === 'number' && s.fontSizePt > 0) style.fontSize = `${s.fontSizePt}pt`;
  if (typeof s.fontWeight === 'number' && s.fontWeight > 0) style.fontWeight = s.fontWeight;
  if (typeof s.color === 'string' && s.color.trim()) style.color = s.color.trim();
  if (s.align) style.textAlign = s.align;
  return Object.keys(style).length > 0 ? style : undefined;
}

export interface BlockFrameProps {
  block: Block;
  selected: boolean;
  /** 与其他可见块重叠（视觉提示，不阻止操作） */
  overlapping: boolean;
  /** 越界情况（实时，含拖拽中间态）；null = 在安全区内 */
  overflow: BlockOverflow | null;
  /** 拖拽引擎（A4Canvas 持有，向下传递） */
  engine: DragEngineApi;
  /** 窄屏只读模式：不绑定拖拽/缩放/键盘 */
  readOnly: boolean;
  onSelect: (id: string) => void;
  /** 正处于行内编辑态（渲染表单替代内容） */
  editing?: boolean;
  /** 双击进入编辑 */
  onStartEdit?: (id: string) => void;
  /** 编辑中内容变化（实时提交到 store） */
  onContentChange?: (id: string, payload: unknown) => void;
  /** 退出编辑（提交） */
  onEndEdit?: () => void;
}

export function BlockFrame({
  block, selected, overlapping, overflow, engine, readOnly, onSelect,
  editing = false, onStartEdit, onContentChange, onEndEdit,
}: BlockFrameProps) {
  const { rect } = block;
  const locked = block.locked === true;
  const movable = !readOnly && !locked && block.freedom !== 'locked';
  /** 可编辑：非只读、未锁定、非分隔线（纯装饰，没有内容） */
  const editable = !readOnly && !locked && block.type !== 'divider';

  // 选中即走 moveable：pointerdown 只负责选中（moveable 的 Gesto 监听在
  // window 上，React 离散事件的同步 flush 会先于事件冒泡到 window 完成
  // target 切换，因此第一次按下即可拖动，无需二次按下）
  //
  // 双击检测不走 dblclick 事件：moveable 的 Gesto 对 target 的 mousedown
  // 调用 preventDefault（阻止拖拽时选中文本），浏览器被抑制后不再派发
  // dblclick（实测 document 捕获层也收不到）——所以这里用 pointerdown
  // 时间间隔自行判定双击，pointer 事件不受该抑制影响。
  const lastClickAtRef = useRef(0);

  const handlePointerDown = () => {
    onSelect(block.id);
    if (!editable || !onStartEdit) return;
    const now = Date.now();
    if (now - lastClickAtRef.current < DBLCLICK_MS) {
      lastClickAtRef.current = 0;
      onStartEdit(block.id);
    } else {
      lastClickAtRef.current = now;
    }
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!movable) return;
    // 编辑态不劫持按键：Enter/Esc 等由行内编辑器自行处理
    if (editing) return;
    if (e.key === 'Enter' && editable && onStartEdit) {
      e.preventDefault();
      onStartEdit(block.id);
      return;
    }
    engine.onKeyDown(e, block.id, rect, block.freedom);
  };

  return (
    <div
      ref={(el) => engine.registerNode(block.id, el)}
      className={cx(
        'lk-blk',
        `lk-${block.type}`,
        selected && 'is-selected',
        editing && 'is-editing',
        overlapping && 'is-overlapping',
        // 红框只给「位置越界」；仅内容溢出用琥珀底边线表示，不抢框
        overflow && overflow.sides.length > 0 && 'is-overflow',
        overflow?.offPage && 'is-offpage',
        locked && 'is-locked',
        movable && 'is-movable',
      )}
      style={{
        left: `${rect.x}mm`,
        top: `${rect.y}mm`,
        width: `${rect.w}mm`,
        height: `${rect.h}mm`,
      }}
      data-block-id={block.id}
      tabIndex={movable ? 0 : -1}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
    >
      {editing ? (
        <InlineEditor
          key={block.id}
          block={block}
          onChange={(payload) => onContentChange?.(block.id, payload)}
          onDone={() => onEndEdit?.()}
        />
      ) : (
        <div className="lk-blk-content" style={contentStyle(block)} dangerouslySetInnerHTML={{ __html: blockInnerHtml(block) }} />
      )}

      {/*
        越界 chrome（预览层，不进导出——导出 HTML 由 renderHtml 从 doc 生成，
        与这里的 DOM 无关）：越界的那几条边描红 + 右上角红点。
        红点带 tooltip 说明超出多少 mm；已出纸张边界时加深并加脉冲动画。
      */}
      {overflow && (
        <>
          {overflow.sides.map((side) => (
            <div key={side} className={`lk-of-edge lk-of-${side}`} aria-hidden />
          ))}
          {/* 内容从底部溢出：底边单独描一条琥珀线 */}
          {overflow.contentOverflowMm !== undefined && (
            <div className="lk-of-content" aria-hidden />
          )}
          <span
            className={cx(
              'lk-overflow-dot',
              overflow.offPage && 'is-offpage',
              // 仅内容溢出（位置没越界）用琥珀：警告级，不是「导出会被裁」
              overflow.sides.length === 0 && 'is-content',
            )}
            title={overflowTitle(overflow)}
            aria-hidden
          />
        </>
      )}
    </div>
  );
}
