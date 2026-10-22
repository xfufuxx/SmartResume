/**
 * reorder —— 移动端排序降级的几何层（纯函数，零依赖 DOM）。
 *
 * 背景：窄屏画布不能拖拽（A4Canvas readOnly），用户重排块顺序靠
 * SortablePanel 的 dnd-kit 列表。顺序只改 doc.blocks 数组是不够的——
 * 每块的 rect.y 是 buildLayout 时按旧顺序流式堆叠算的，数组换了顺序
 * 而 y 不变，视觉顺序与数据顺序就脱钩了。
 *
 * 本模块把「数组顺序 + y 重算」绑成一个原子操作：
 * - 数组：arrayMove（dnd-kit 的 onDragEnd 语义：active 落到 over 的位置）；
 * - page：active 落到 over 所在的页（跨页拖拽 = 换页，多页简历的核心交互）；
 * - y：**按页分组**，组内按新数组顺序从安全区顶端重新流式堆叠，
 *   间距取 doc.gap（旧文档兜底 DEFAULT_GAP_MM）；
 * - x / w / h / freedom / sizePolicy / locked / visible / style /
 *   contentRef 全部原样保留——用户手动调过的尺寸不能因排序丢失。
 *
 * 隐藏块参与堆叠（占位）：取消隐藏时位置可预期，不会砸到别的块上。
 * 代价是隐藏块在中间时可见块之间有间距——用户要紧凑就先取消隐藏
 * 再拖，或隐藏末尾的块。
 */

import type { Block, LayoutDocument } from './types.ts';
import { SAFE_MARGIN_MM } from './types.ts';
import { roundMm } from './geometry.ts';
import { pageOf } from './paging.ts';

/** doc.gap 缺省时的兜底间距（mm）——buildLayout 的默认值 */
export const DEFAULT_GAP_MM = 4;

/** 数组元素搬家（lodash move 语义，原地修改后返回同一数组） */
function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const [item] = arr.splice(from, 1);
  arr.splice(to, 0, item);
  return arr;
}

/**
 * 把 activeId 块移到 overId 块的位置，跨页则换页，并按新顺序重算各页 y。
 *
 * 返回**新文档**（深拷贝受影响的部分）；无变化时返回**原引用**
 * （方便 reducer 做引用比较短路，不污染历史栈）。
 */
export function reorderBlocks(
  doc: LayoutDocument,
  activeId: string,
  overId: string,
): LayoutDocument {
  const oldIndex = doc.blocks.findIndex((b) => b.id === activeId);
  const newIndex = doc.blocks.findIndex((b) => b.id === overId);
  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return doc;

  const gap = typeof doc.gap === 'number' && doc.gap > 0 ? doc.gap : DEFAULT_GAP_MM;
  // 先取 over 块的页（arrayMove 后 over 的索引会因 active 的移除而偏移）
  const overPage = pageOf(doc.blocks[newIndex]);
  const moved = arrayMove(doc.blocks.slice(), oldIndex, newIndex);

  // 跨页拖拽：active（arrayMove 后落在 newIndex）改到 over 所在页
  if (pageOf(moved[newIndex]) !== overPage) {
    moved[newIndex] = { ...moved[newIndex], page: overPage };
  }

  // 按页分组、组内按新数组顺序流式堆叠（页内 y 从安全区顶端起算）
  const cursor = new Map<number, number>();
  const reflowed: Block[] = moved.map((b) => {
    const page = pageOf(b);
    const y = cursor.get(page) ?? SAFE_MARGIN_MM;
    cursor.set(page, roundMm(y + b.rect.h + gap));
    return { ...b, rect: { ...b.rect, y: roundMm(y) } };
  });

  return { ...doc, blocks: reflowed };
}

/**
 * 排序面板 / 按钮的插入位置计算：active 的**同页**上方（或下方）邻居 id。
 * 跨页邻居不算数——按钮的意图是「在本页内微调位置」。
 */
export function neighborId(doc: LayoutDocument, activeId: string, dir: -1 | 1): string | null {
  const i = doc.blocks.findIndex((b) => b.id === activeId);
  if (i < 0) return null;
  const page = pageOf(doc.blocks[i]);
  const step = dir > 0 ? 1 : -1;
  for (let j = i + step; j >= 0 && j < doc.blocks.length; j += step) {
    if (pageOf(doc.blocks[j]) === page) return doc.blocks[j].id;
  }
  return null;
}
