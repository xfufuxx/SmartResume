/**
 * 布局文档的序列化 / 反序列化 / 版本迁移。
 *
 * 契约：
 * - DB 里读出的 JSON 是不可信输入：形状不合法 → parseLayout 返回 null，
 *   上层回退 buildLayout() 默认布局（内容不丢，只是排版重置）；
 * - 版本迁移用「注册表 + while 循环」：将来出 v2 只需在 MIGRATIONS 加一个
 *   v1 → v2 函数并把 types.ts 的 LAYOUT_VERSION 改成 2；
 * - 版本过新（数据比代码新）→ 抛错，parseLayout 捕获后返回 null，同样走默认布局。
 */

import type { Block, BlockRect, LayoutDocument } from './types.ts';
import { BLOCK_TYPES, DRAG_FREEDOMS, LAYOUT_VERSION } from './types.ts';

type Migration = (doc: LayoutDocument) => LayoutDocument;

/**
 * 版本迁移注册表：key = 源版本号，value = 把它升级到下一版的函数。
 *
 * 示例（未来 v2 若给 Block 增加 lockedBy 字段）：
 *   MIGRATIONS[1] = (doc) => ({
 *     ...doc,
 *     version: 2,
 *     blocks: doc.blocks.map((b) => ({ ...b, lockedBy: null })),
 *   });
 * 同时把 types.ts 的 LAYOUT_VERSION 改为 2。
 */
const MIGRATIONS: Record<number, Migration> = {};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isBlockRect(value: unknown): value is BlockRect {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    isFiniteNumber(r.x) &&
    isFiniteNumber(r.y) &&
    isFiniteNumber(r.w) &&
    isFiniteNumber(r.h) &&
    r.x >= 0 &&
    r.y >= 0 &&
    r.w > 0 &&
    r.h > 0
  );
}

function isBlock(value: unknown): value is Block {
  if (typeof value !== 'object' || value === null) return false;
  const b = value as Record<string, unknown>;
  if (typeof b.id !== 'string' || b.id.length === 0) return false;
  if (typeof b.type !== 'string' || !BLOCK_TYPES.includes(b.type as Block['type'])) return false;
  if (!isBlockRect(b.rect)) return false;
  if (typeof b.freedom !== 'string' || !DRAG_FREEDOMS.includes(b.freedom as Block['freedom'])) {
    return false;
  }
  const sizePolicy = b.sizePolicy as Record<string, unknown> | undefined;
  if (!sizePolicy || typeof sizePolicy !== 'object') return false;
  if (typeof sizePolicy.resizableW !== 'boolean' || typeof sizePolicy.resizableH !== 'boolean') {
    return false;
  }
  if (!isFiniteNumber(sizePolicy.minW) || !isFiniteNumber(sizePolicy.minH)) return false;
  const contentRef = b.contentRef as Record<string, unknown> | undefined;
  if (!contentRef || typeof contentRef !== 'object' || typeof contentRef.source !== 'string') {
    return false;
  }
  return true;
}

/** 形状校验（不校验位置合法性——那是 validateLayout 的活） */
export function isLayoutDocument(value: unknown): value is LayoutDocument {
  if (typeof value !== 'object' || value === null) return false;
  const d = value as Record<string, unknown>;
  if (!isFiniteNumber(d.version) || !Number.isInteger(d.version) || d.version < 0) return false;
  const canvas = d.canvas as Record<string, unknown> | undefined;
  if (!canvas || typeof canvas !== 'object') return false;
  if (!isFiniteNumber(canvas.width) || !isFiniteNumber(canvas.height)) return false;
  if (canvas.width <= 0 || canvas.height <= 0) return false;
  if (!Array.isArray(d.blocks)) return false;
  if (!d.blocks.every(isBlock)) return false;
  // pageCount 可选（多页简历）：存在则必须是 ≥1 的整数
  if (d.pageCount !== undefined && (!Number.isInteger(d.pageCount) || (d.pageCount as number) < 1)) {
    return false;
  }
  // template 可选（模板切换）：存在则必须是非空字符串（未知 id 由 UI 兜底 classic）
  if (d.template !== undefined && (typeof d.template !== 'string' || d.template.length === 0)) {
    return false;
  }
  return true;
}

/** 把文档迁移到当前版本。无法迁移时抛错（缺迁移函数 / 版本过新） */
export function migrateLayout(doc: LayoutDocument): LayoutDocument {
  if (doc.version > LAYOUT_VERSION) {
    throw new Error(`布局版本过新：v${doc.version}，当前仅支持到 v${LAYOUT_VERSION}`);
  }
  let current = doc;
  let guard = 0;
  while (current.version < LAYOUT_VERSION) {
    const migration = MIGRATIONS[current.version];
    if (!migration) {
      throw new Error(`缺少 v${current.version} → v${current.version + 1} 的迁移函数，无法安全升级`);
    }
    current = migration(current);
    guard += 1;
    if (guard > 100) {
      throw new Error('版本迁移循环异常，疑似注册表写成了环');
    }
  }
  return current;
}

/** 序列化为 JSON 字符串（先迁移到当前版本） */
export function serializeLayout(doc: LayoutDocument): string {
  return JSON.stringify(migrateLayout(doc));
}

/**
 * 解析布局 JSON（字符串或已 parse 的对象）。
 * 任何不合法 / 不可迁移的情况都返回 null，由上层回退默认布局。
 */
export function parseLayout(input: unknown): LayoutDocument | null {
  let raw = input;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!isLayoutDocument(raw)) return null;
  try {
    return migrateLayout(raw);
  } catch {
    return null;
  }
}
