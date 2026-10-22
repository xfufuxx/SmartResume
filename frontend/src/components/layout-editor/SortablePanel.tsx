/**
 * SortablePanel —— 窄屏块排序面板（移动端拖拽降级方案）。
 *
 * 背景：≤767px 画布只读（moveable 拖拽在触屏上体验差），块顺序调整
 * 移到这里。dnd-kit 负责交互体力；顺序的几何后果（数组顺序 + y 重算）
 * 全部在纯函数 reorderBlocks 里，松手即 commit 一步历史（可撤销）。
 *
 * 设计：
 * - 锁定块禁用拖拽（useSortable disabled）——锁定即「别动我」；
 * - 每行带「上移/下移」按钮：不便拖拽时的替代路径（也服务无障碍）；
 * - 点击行 = 选中（与画布 selection 联动）；
 * - 拖拽中本行半透明，其余行让位动画由 dnd-kit 策略驱动；
 * - 键盘可达：KeyboardSensor + sortableKeyboardCoordinates。
 */

import type { DndContextProps } from '@dnd-kit/core';
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { LockOutlined, EyeInvisibleOutlined, EyeOutlined, HolderOutlined } from '@ant-design/icons';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';

import type { Block, LayoutDocument } from '../../lib/layout/types';
import { neighborId } from '../../lib/layout/reorder';
import { pageCountOf, pageOf } from '../../lib/layout/paging';
import { extractBlockText } from '../../lib/layout/estimate';
import { cx } from './cx';

const TYPE_LABELS: Record<Block['type'], string> = {
  header: '姓名',
  contact: '联系方式',
  avatar: '头像',
  divider: '分隔线',
  summary: '个人简介',
  section: '章节标题',
  item: '条目',
  'skill-group': '技能组',
  text: '文本',
};

/** 列表行摘要：块文本第一行（extractBlockText 已按渲染口径提取） */
function summarize(block: Block): string {
  const text = extractBlockText(block).split('\n')[0]?.trim() ?? '';
  if (text) return text.length > 40 ? `${text.slice(0, 40)}…` : text;
  return TYPE_LABELS[block.type];
}

export interface SortablePanelProps {
  doc: LayoutDocument;
  selectedId: string | null;
  onReorder: (activeId: string, overId: string) => void;
  onSelect: (id: string) => void;
  onToggleLock?: (id: string) => void;
  onToggleVisible?: (id: string) => void;
}

interface RowProps {
  block: Block;
  index: number;
  total: number;
  selected: boolean;
  /** 多页时显示页码徽标 */
  multiPage: boolean;
  onMove: (id: string, dir: -1 | 1) => void;
  onSelect: (id: string) => void;
  onToggleLock?: (id: string) => void;
  onToggleVisible?: (id: string) => void;
}

function SortableRow({
  block, index, total, selected, multiPage, onMove, onSelect, onToggleLock, onToggleVisible,
}: RowProps) {
  const locked = block.locked === true;
  const hidden = block.visible === false;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, setActivatorNodeRef } =
    useSortable({ id: block.id, disabled: locked });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cx(
        'le-sort-row',
        selected && 'is-selected',
        isDragging && 'is-dragging',
        hidden && 'is-hidden',
      )}
      data-block-id={block.id}
      onClick={() => onSelect(block.id)}
      {...attributes}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        className="le-sort-grip"
        aria-label={locked ? '已锁定，不能拖动' : '拖动调整顺序'}
        disabled={locked}
        {...(locked ? {} : listeners)}
      >
        <HolderOutlined />
      </button>

      <span className="le-sort-index">{index + 1}</span>

      {multiPage && (
        <span className="le-sort-page" title={`第 ${pageOf(block) + 1} 页`}>
          P{pageOf(block) + 1}
        </span>
      )}

      <span className="le-sort-body">
        <span className="le-sort-type">
          {TYPE_LABELS[block.type]}
          {locked && <LockOutlined title="已锁定" />}
          {hidden && <EyeInvisibleOutlined title="已隐藏" />}
        </span>
        <span className="le-sort-summary">{summarize(block)}</span>
      </span>

      <span className="le-sort-actions" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          title="上移"
          disabled={index === 0}
          onClick={() => onMove(block.id, -1)}
        >
          <ArrowUpOutlined />
        </button>
        <button
          type="button"
          title="下移"
          disabled={index === total - 1}
          onClick={() => onMove(block.id, 1)}
        >
          <ArrowDownOutlined />
        </button>
        {onToggleVisible && (
          <button type="button" title={hidden ? '取消隐藏' : '隐藏'} onClick={() => onToggleVisible(block.id)}>
            {hidden ? <EyeInvisibleOutlined /> : <EyeOutlined />}
          </button>
        )}
      </span>
    </div>
  );
}

export function SortablePanel({
  doc, selectedId, onReorder, onSelect, onToggleLock, onToggleVisible,
}: SortablePanelProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = doc.blocks.map((b) => b.id);
  const multiPage = pageCountOf(doc) > 1;

  const handleDragEnd: NonNullable<DndContextProps['onDragEnd']> = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    onReorder(String(active.id), String(over.id));
  };

  /** 上移/下移按钮：解析成邻居 id，与拖拽共用同一个 onReorder */
  const handleMove = (id: string, dir: -1 | 1) => {
    const target = neighborId(doc, id, dir);
    if (target) onReorder(id, target);
  };

  return (
    <div className="le-sortable">
      <div className="le-sortable-title">
        块顺序 <span className="le-sortable-hint">
          拖拽或按 ↑↓ 调整{multiPage ? '，拖到别页的行可跨页移动' : ''}，画布同步重排
        </span>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="le-sortable-list">
            {doc.blocks.map((b, i) => (
              <SortableRow
                key={b.id}
                block={b}
                index={i}
                total={doc.blocks.length}
                selected={b.id === selectedId}
                multiPage={multiPage}
                onMove={handleMove}
                onSelect={onSelect}
                onToggleLock={onToggleLock}
                onToggleVisible={onToggleVisible}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {doc.blocks.length === 0 && <div className="le-sortable-empty">暂无块</div>}
    </div>
  );
}
