/**
 * 多页排版 —— 纯函数层，零 React 依赖，可单测。
 *
 * 数据模型（与 types.ts 的注释呼应）：
 * - Block.page（0 基，缺省 0）表示所在页；rect.y 是**页内相对**坐标，
 *   因此所有单页几何（clampRect / overflow / estimate / 拖拽）零改动；
 * - LayoutDocument.pageCount 是总页数，缺省时按最大 block.page 兜底。
 *
 * 本模块只回答四个问题：
 * 1. 这个文档有几页、每页有哪些块（pagesOf / pageCountOf）；
 * 2. 页号不连续 / pageCount 写小了怎么补（normalizePages）；
 * 3. 块换页时 y 怎么落位（moveBlockToPage）；
 * 4. 增删页时块号怎么平移（addPage / removePage）。
 */

import type { Block, LayoutDocument } from './types.ts';
import { CANVAS_MM, SAFE_MARGIN_MM } from './types.ts';
import { clampRect, rectBottom, roundMm } from './geometry.ts';

/** 块所在页（缺省 0，兼容旧单页存档） */
export function pageOf(block: Block): number {
  const p = block.page;
  return typeof p === 'number' && Number.isInteger(p) && p >= 0 ? p : 0;
}

/** 文档总页数：pageCount 与「最大 block.page + 1」取大，至少 1 页 */
export function pageCountOf(doc: LayoutDocument): number {
  let maxPage = 0;
  for (const b of doc.blocks) maxPage = Math.max(maxPage, pageOf(b));
  const declared = typeof doc.pageCount === 'number' && Number.isInteger(doc.pageCount) ? doc.pageCount : 0;
  return Math.max(1, declared, maxPage + 1);
}

/** 按页分组的全部块（含隐藏块——隐藏块仍占位，与导出一致）。组内保持数组顺序 */
export function pagesOf(doc: LayoutDocument): Block[][] {
  const count = pageCountOf(doc);
  const pages: Block[][] = Array.from({ length: count }, () => []);
  for (const b of doc.blocks) pages[pageOf(b)].push(b);
  return pages;
}

/** 某页的可见块（预览 / 红点 / 重叠检测只认可见块） */
export function visibleBlocksOfPage(doc: LayoutDocument, page: number): Block[] {
  return pagesOf(doc)[page]?.filter((b) => b.visible !== false) ?? [];
}

/**
 * 补齐 pageCount（写小了或漏写的旧文档）。
 * 无变化返回原引用——上层可直接用于 reducer 的 sameDoc 短路。
 */
export function normalizePages(doc: LayoutDocument): LayoutDocument {
  const count = pageCountOf(doc);
  if (doc.pageCount === count) return doc;
  return { ...doc, pageCount: count };
}

function cloneDoc(doc: LayoutDocument): LayoutDocument {
  return JSON.parse(JSON.stringify(doc)) as LayoutDocument;
}

/**
 * 把块移到目标页：page 改写 + y 落到该页当前内容底部之后（安全区钳制）。
 *
 * y 目标 = max(该页可见块底边) + gap；空页则落在安全区顶边。
 * 放不下（超出安全区底）时 clampRect 钳住并亮红点，由用户决定怎么办——
 * 不静默丢内容，也不偷偷改别块的位置。
 *
 * 目标页越界（<0 或 ≥ 页数）时原样返回（调用方应先 disabled 按钮）。
 */
export function moveBlockToPage(
  doc: LayoutDocument,
  id: string,
  targetPage: number,
  options: { margin?: number; gap?: number; canvas?: { width: number; height: number } } = {},
): LayoutDocument {
  const count = pageCountOf(doc);
  const page = Math.trunc(targetPage);
  if (page < 0 || page >= count) return doc;
  const canvas = options.canvas ?? CANVAS_MM;
  const margin = options.margin ?? SAFE_MARGIN_MM;
  const gap = options.gap ?? doc.gap ?? 4;

  const next = cloneDoc(doc);
  const block = next.blocks.find((b) => b.id === id);
  if (!block || pageOf(block) === page) return doc;

  // 目标页当前内容底边（只看可见块；隐藏块不挡位）。空页落安全区顶边
  let bottom = margin;
  let hasContent = false;
  for (const b of next.blocks) {
    if (b.id === id || pageOf(b) !== page || b.visible === false) continue;
    bottom = Math.max(bottom, rectBottom(b.rect));
    hasContent = true;
  }
  const y = roundMm(hasContent ? bottom + gap : margin);
  block.page = page;
  block.rect = clampRect({ ...block.rect, y }, canvas, margin);
  return normalizePages(next);
}

/** 末尾追加一页（空页，用户随后把块移进来）。无变化返回原引用 */
export function addPage(doc: LayoutDocument): LayoutDocument {
  return normalizePages({ ...doc, pageCount: pageCountOf(doc) + 1 });
}

/**
 * 删除指定页：仅允许删**空页**（有块的页要先移走/隐藏，否则返回原引用，
 * 由调用方 disabled 按钮 + 提示，绝不把块挪到陌生位置造成重叠）。
 * 删除后后续页号整体前移。无变化返回原引用。
 */
export function removePage(doc: LayoutDocument, page: number): LayoutDocument {
  const count = pageCountOf(doc);
  const p = Math.trunc(page);
  if (p < 0 || p >= count) return doc;
  if (doc.blocks.some((b) => pageOf(b) === p)) return doc;
  if (count === 1) return doc; // 至少保留一页
  const next = cloneDoc(doc);
  for (const b of next.blocks) {
    if (pageOf(b) > p && b.page !== undefined) b.page = pageOf(b) - 1;
  }
  next.pageCount = count - 1;
  return normalizePages(next);
}

/** 某页是否为空（无任何块，含隐藏） */
export function isPageEmpty(doc: LayoutDocument, page: number): boolean {
  return !doc.blocks.some((b) => pageOf(b) === page);
}
