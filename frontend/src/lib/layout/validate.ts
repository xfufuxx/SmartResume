/**
 * 布局校验 —— 纯函数层，零 React 依赖，可单测。
 *
 * 五项检查（对应需求）：
 * 1. 越界（out-of-bounds）—— block 超出画布 / 安全边距；
 * 2. 重叠（overlap）—— 两个 block 矩形相交；
 * 3. 对齐不一致（misaligned）—— 同列块左缘参差不齐；
 * 4. 间距不一致（uneven-gap）—— 同列相邻块垂直间距忽大忽小；
 * 5. 内容溢出（overflow）—— block 高度装不下估算内容。
 *
 * 分级策略：
 * - auto（前四项中除重叠外的四项 + 越界）：可机械修正，validateLayout 默认先修后报；
 * - warn（重叠）：移动任何一块都可能违背用户意图，不自动修，弹窗里由用户决定。
 *
 * 所有修正都通过 withHistory 入撤销栈（store 层），用户可一键回退。
 */

import type { Block, BlockType, LayoutDocument } from './types.ts';
import { CANVAS_MM, SAFE_MARGIN_MM } from './types.ts';
import { clampRect, intersects, rectBottom, roundMm } from './geometry.ts';
import {
  OVERFLOW_MARGIN_MM,
  estimateContentHeightMm,
  extractBlockText,
} from './estimate.ts';
import { pageOf } from './paging.ts';

// 估算口径的唯一事实来源在 estimate.ts；这里 re-export 保持旧引用路径可用。
export {
  OVERFLOW_MARGIN_MM,
  extractBlockText,
  estimateContentHeightMm,
} from './estimate.ts';

/** 问题类型 */
export type IssueKind =
  | 'out-of-bounds'
  | 'overlap'
  | 'misaligned'
  | 'uneven-gap'
  | 'overflow';

/**
 * auto = 已自动修正（弹窗告知，可撤销）；
 * warn = 需要用户注意/决策（不自动修）
 */
export type IssueSeverity = 'auto' | 'warn';

export interface LayoutIssue {
  kind: IssueKind;
  severity: IssueSeverity;
  /** 相关 block id（重叠为两个） */
  blockIds: string[];
  /** 中文描述，弹窗直接展示 */
  message: string;
  /** 修正前后对比等补充信息 */
  detail?: string;
}

export interface ValidationResult {
  /** 校验（并可能自动修正）后的文档；autoFix=false 时为入参深拷贝 */
  doc: LayoutDocument;
  /** 全部问题，auto 类排在 warn 类前 */
  issues: LayoutIssue[];
  /** 是否存在需要用户确认的问题（warn 类） */
  needsAttention: boolean;
  /** 自动修正了几处 */
  autoFixedCount: number;
}

export interface ValidateOptions {
  /** 默认 true：先自动修正再报告 */
  autoFix?: boolean;
  canvas?: { width: number; height: number };
  margin?: number;
  /** 左缘对齐容差（mm），偏差超过视为不一致 */
  alignToleranceMm?: number;
  /** 垂直间距容差（mm），偏差超过视为不均匀 */
  gapToleranceMm?: number;
}

// ============ 常量 ============

const TYPE_LABELS: Record<BlockType, string> = {
  header: '姓名',
  contact: '联系方式',
  avatar: '头像',
  divider: '分隔线',
  summary: '个人简介',
  section: '栏目标题',
  item: '内容条目',
  'skill-group': '技能组',
  text: '文本',
};

/**
 * 参与对齐/间距修正的最小宽度比例：块宽 ≥ 内容区宽度的 40%（约 72mm）才参与。
 * 不能用「通栏 80%」——双栏布局的块宽只有 ~85mm，会把双栏全排除；
 * 40% 能覆盖双栏单列宽度，同时排除头像（30mm）等窄块。
 */
const COLUMN_MIN_WIDTH_RATIO = 0.4;

// ============ 工具 ============

/** block 的展示名：「内容条目 blk_exp_0」 */
export function blockLabel(block: Block): string {
  const page = pageOf(block);
  return `${TYPE_LABELS[block.type]} ${block.id}${page > 0 ? `（第 ${page + 1} 页）` : ''}`;
}

/**
 * 按页分组的可见块。多页简历里，对齐 / 间距 / 重叠都只在**同一页内**判定：
 * 第 1 页的底边与第 2 页的顶边之间谈「间距」没有意义。
 */
function pageGroups(blocks: Block[]): Block[][] {
  const groups = new Map<number, Block[]>();
  for (const b of blocks) {
    if (b.visible === false) continue;
    const p = pageOf(b);
    const list = groups.get(p);
    if (list) list.push(b);
    else groups.set(p, [b]);
  }
  return Array.from(groups.values());
}

function cloneDoc(doc: LayoutDocument): LayoutDocument {
  return JSON.parse(JSON.stringify(doc)) as LayoutDocument;
}

function rectChanged(a: Block['rect'], b: Block['rect']): boolean {
  return a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h;
}

// ============ 五项检查与修正 ============

/** 1. 越界：clampRect 拉回安全区 */
function fixOutOfBounds(
  doc: LayoutDocument,
  canvas: { width: number; height: number },
  margin: number,
  issues: LayoutIssue[],
): void {
  for (const b of doc.blocks) {
    const clamped = clampRect(b.rect, canvas, margin);
    if (rectChanged(b.rect, clamped)) {
      issues.push({
        kind: 'out-of-bounds',
        severity: 'auto',
        blockIds: [b.id],
        message: `「${blockLabel(b)}」超出安全区，已拉回边界内`,
        detail: `(${b.rect.x}, ${b.rect.y}, ${b.rect.w}, ${b.rect.h}) → (${clamped.x}, ${clamped.y}, ${clamped.w}, ${clamped.h})`,
      });
      b.rect = clamped;
    }
  }
}

/**
 * 对齐候选：参与左缘/间距一致性的块。
 * 排除横向自由（用户明确要左右移动的横贯块）、锁定块与窄块（如头像）。
 */
function alignmentCandidates(
  doc: LayoutDocument,
  canvas: { width: number; height: number },
  margin: number,
): Block[] {
  const contentW = canvas.width - margin * 2;
  return doc.blocks.filter(
    (b) =>
      b.visible !== false &&
      b.freedom !== 'horizontal' &&
      b.freedom !== 'locked' &&
      b.rect.w >= contentW * COLUMN_MIN_WIDTH_RATIO,
  );
}

/** 按 x 间隙切簇：间隙 > 2×容差 视为不同列（双栏布局两列互不干扰） */
function clusterByX(blocks: Block[], toleranceMm: number): Block[][] {
  const sorted = [...blocks].sort((a, b) => a.rect.x - b.rect.x);
  const clusters: Block[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].rect.x - sorted[i - 1].rect.x;
    if (gap > toleranceMm * 2) clusters.push([]);
    clusters[clusters.length - 1].push(sorted[i]);
  }
  return clusters;
}

/** 3. 对齐不一致：页内簇左缘对齐到最左值 */
function fixAlignment(
  doc: LayoutDocument,
  canvas: { width: number; height: number },
  margin: number,
  tolerance: number,
  issues: LayoutIssue[],
): void {
  const candidates = alignmentCandidates(doc, canvas, margin);
  if (candidates.length < 2) return;
  for (const group of pageGroups(candidates)) {
    for (const cluster of clusterByX(group, tolerance)) {
      if (cluster.length < 2) continue;
      const target = cluster[0].rect.x;
      for (const b of cluster) {
        if (Math.abs(b.rect.x - target) > tolerance) {
          const before = b.rect.x;
          b.rect.x = target;
          issues.push({
            kind: 'misaligned',
            severity: 'auto',
            blockIds: [b.id],
            message: `「${blockLabel(b)}」左缘与同列块差 ${(before - target).toFixed(2)}mm，已对齐`,
            detail: `x: ${before} → ${target}`,
          });
        }
      }
    }
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : roundMm((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * 4. 间距不一致：同列自上而下，把偏差超过容差的相邻块归位到理想间距（中位数）。
 *
 * 关键口径：间距基准是「上方最近的可见块底边」，而不是 candidates 序列里的
 * 上一个。alignmentCandidates 排除了 horizontal 块（contact / divider /
 * skill-group），但它们实实在在地占据垂直空间——若按 candidate 序列算，
 * 跨这些块的间距会被算成「不均匀」，median 虽仍对，归位时却把块拽到
 * 被排除块身上，直接制造重叠（buildLayout 默认布局曾因此 9 误报 + 3 重叠）。
 */
function fixGaps(
  doc: LayoutDocument,
  canvas: { width: number; height: number },
  margin: number,
  tolerance: number,
  issues: LayoutIssue[],
): void {
  const candidates = alignmentCandidates(doc, canvas, margin);
  if (candidates.length < 3) return;
  const visible = doc.blocks.filter((b) => b.visible !== false);
  /** 同页（x 对齐）且在 b 上方的最近可见块底边；没有则安全区顶边 */
  const baseBottom = (b: Block): number => {
    let base = margin;
    for (const other of visible) {
      if (other.id === b.id) continue;
      if (pageOf(other) !== pageOf(b)) continue; // 跨页的块不参与页内间距
      if (Math.abs(other.rect.x - b.rect.x) > tolerance) continue;
      const bottom = rectBottom(other.rect);
      if (bottom <= b.rect.y + tolerance) base = Math.max(base, bottom);
    }
    return base;
  };
  for (const group of pageGroups(candidates)) {
    for (const cluster of clusterByX(group, tolerance)) {
      if (cluster.length < 3) continue;
      const col = [...cluster].sort((a, b) => a.rect.y - b.rect.y);
      const gaps: number[] = [];
      for (let i = 1; i < col.length; i++) {
        gaps.push(roundMm(col[i].rect.y - baseBottom(col[i])));
      }
      const ideal = median(gaps);
      for (let i = 1; i < col.length; i++) {
        const expectedY = roundMm(baseBottom(col[i]) + ideal);
        if (Math.abs(col[i].rect.y - expectedY) > tolerance) {
          const before = col[i].rect.y;
          col[i].rect.y = expectedY;
          issues.push({
            kind: 'uneven-gap',
            severity: 'auto',
            blockIds: [col[i].id],
            message: `「${blockLabel(col[i])}」与上方间距不均匀，已统一为 ${ideal}mm`,
            detail: `y: ${before} → ${expectedY}`,
          });
        }
      }
    }
  }
}

/** 5. 内容溢出：增高到估算高度 + 余量，兜底不越出画布 */
function fixOverflow(
  doc: LayoutDocument,
  canvas: { width: number; height: number },
  margin: number,
  issues: LayoutIssue[],
): void {
  const maxH = canvas.height - margin * 2;
  for (const b of doc.blocks) {
    if (b.visible === false) continue;
    const need = estimateContentHeightMm(b);
    if (need > b.rect.h + 0.01) {
      const before = b.rect.h;
      b.rect.h = Math.min(roundMm(need + OVERFLOW_MARGIN_MM), maxH);
      const maxY = canvas.height - margin - b.rect.h;
      if (b.rect.y > maxY) b.rect.y = roundMm(maxY);
      issues.push({
        kind: 'overflow',
        severity: 'auto',
        blockIds: [b.id],
        message: `「${blockLabel(b)}」高度不足以容纳内容，已增高防截断`,
        detail: `h: ${before} → ${b.rect.h}`,
      });
    }
  }
}

/** 2. 重叠：只警告不自动修（边缘相接不算重叠）。同页内两两比较——跨页不可能重叠 */
function collectOverlaps(doc: LayoutDocument): LayoutIssue[] {
  const visible = doc.blocks.filter((b) => b.visible !== false);
  const issues: LayoutIssue[] = [];
  for (const group of pageGroups(visible)) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (intersects(group[i].rect, group[j].rect)) {
          issues.push({
            kind: 'overlap',
            severity: 'warn',
            blockIds: [group[i].id, group[j].id],
            message: `「${blockLabel(group[i])}」与「${blockLabel(group[j])}」重叠`,
            detail: '导出的 PDF 中两块内容会互相遮挡，建议手动挪开其中一块',
          });
        }
      }
    }
  }
  return issues;
}

// ============ 对外主函数 ============

/**
 * 自动修正（不含重叠警告）。返回新文档与修正计数，不修改入参。
 * store 的 APPLY_AUTOFIX action 用它。
 */
export function autoFixLayout(
  doc: LayoutDocument,
  options: ValidateOptions = {},
): { doc: LayoutDocument; fixed: number; issues: LayoutIssue[] } {
  const canvas = options.canvas ?? CANVAS_MM;
  const margin = options.margin ?? SAFE_MARGIN_MM;
  const alignTolerance = options.alignToleranceMm ?? 0.5;
  const gapTolerance = options.gapToleranceMm ?? 2;

  const working = cloneDoc(doc);
  const issues: LayoutIssue[] = [];
  fixOutOfBounds(working, canvas, margin, issues);
  fixAlignment(working, canvas, margin, alignTolerance, issues);
  fixGaps(working, canvas, margin, gapTolerance, issues);
  fixOverflow(working, canvas, margin, issues);
  // 兜底：fixGaps 的等距传播与 fixOverflow 的增高都可能把「不需要增高的块」
  // 推出安全区（fixOverflow 只钳自己增高过的块）。硬约束最后再执行一次，
  // 保证修正确认的结果里不存在越界——修正之间不互相引入新问题。
  fixOutOfBounds(working, canvas, margin, issues);
  return { doc: working, fixed: issues.length, issues };
}

/**
 * 导出前校验入口。
 *
 * 默认行为：先自动修正（越界/对齐/间距/溢出），再对修正后的文档收集重叠警告。
 * autoFix=false 时原样报告全部问题（auto 类也升级为 warn，等待用户处理）。
 */
export function validateLayout(
  doc: LayoutDocument,
  options: ValidateOptions = {},
): ValidationResult {
  const { autoFix = true } = options;

  if (autoFix) {
    const result = autoFixLayout(doc, options);
    const warnings = collectOverlaps(result.doc);
    return {
      doc: result.doc,
      issues: [...result.issues, ...warnings],
      needsAttention: warnings.length > 0,
      autoFixedCount: result.fixed,
    };
  }

  // 不自动修：全部按 warn 报告
  const working = cloneDoc(doc);
  const reportOnly: LayoutIssue[] = [];
  const canvas = options.canvas ?? CANVAS_MM;
  const margin = options.margin ?? SAFE_MARGIN_MM;
  for (const b of working.blocks) {
    const clamped = clampRect(b.rect, canvas, margin);
    if (rectChanged(b.rect, clamped)) {
      reportOnly.push({
        kind: 'out-of-bounds',
        severity: 'warn',
        blockIds: [b.id],
        message: `「${blockLabel(b)}」超出安全区`,
        detail: `(${b.rect.x}, ${b.rect.y}, ${b.rect.w}, ${b.rect.h})`,
      });
    }
    const need = estimateContentHeightMm(b);
    if (b.visible !== false && need > b.rect.h + 0.01) {
      reportOnly.push({
        kind: 'overflow',
        severity: 'warn',
        blockIds: [b.id],
        message: `「${blockLabel(b)}」高度可能不足以容纳内容（估算需 ${need}mm，当前 ${b.rect.h}mm）`,
      });
    }
  }
  const issues = [...reportOnly, ...collectOverlaps(working)];
  return {
    doc: working,
    issues,
    needsAttention: issues.length > 0,
    autoFixedCount: 0,
  };
}

/** 便捷判断：文档当前是否干净（无需任何修正/警告） */
export function isLayoutClean(doc: LayoutDocument, options?: ValidateOptions): boolean {
  const result = validateLayout(doc, options);
  return result.issues.length === 0;
}
