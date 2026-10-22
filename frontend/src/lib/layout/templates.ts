/**
 * 简历模板 —— 模板切换映射的纯函数层，零 React 依赖，可单测。
 *
 * 模板由两部分组成：
 * 1. 几何策略（layout）：安全边距 / 块间距 / 双栏参数。切换时按策略
 *    重新流式排布全部块（applyTemplate）；
 * 2. 视觉主题（fontScale + BLOCK_CSS 的 data-template 作用域规则）：
 *    字号倍率参与高度重估，颜色规则写在 renderHtml.ts 的 BLOCK_CSS。
 *
 * applyTemplate 的保留与重建契约：
 * - 保留：blocks 数组顺序（z 序）、id、contentRef（内容快照）、
 *   visible / locked / freedom / sizePolicy —— 用户的结构决策不动；
 * - 重建：rect（x/y/w/h）、page（重新分页）、gap、doc.template；
 * - 高度：目标宽度变化时按新宽度重估，只放大不缩小（用户缩矮块的
 *   意图保留，但窄栏装不下的内容必须给空间，否则导出即裁切）；
 * - 幂等：对 classic 默认布局再应用一次 classic，结果逐字节一致
 *   （w 不变 → h 保留 → y 重算等于原值），reducer 的 sameDoc 会短路。
 *
 * 双栏排布规则：
 * - 开头连续的 header / avatar / divider / text 作为通栏前缀排在第 1 页顶部；
 * - 其余块按 contentRef.source 前缀分流：sidebarSources 进侧栏，其余进主栏；
 * - 侧栏放不下的块降级到主栏队尾（按主栏全宽重排），不丢内容、不重叠；
 * - 主栏翻过「双栏区所在页」之后自动转通栏（后续页主栏全宽，空间优先）；
 * - section 与同组首块 keep-with-next，翻页时不留孤儿标题。
 */

import type { Block, LayoutDocument } from './types.ts';
import { CANVAS_MM, DEFAULT_TEMPLATE_ID } from './types.ts';
import { roundMm } from './geometry.ts';
import { OVERFLOW_MARGIN_MM, estimateContentHeightMm } from './estimate.ts';
import { normalizePages } from './paging.ts';

/** 默认模板 id（re-export 自 types.ts，避免 renderHtml 反向依赖本文件形成环） */
export { DEFAULT_TEMPLATE_ID };

/** 模板几何策略 */
export interface TemplateLayout {
  /** 安全边距（mm） */
  marginMm: number;
  /** 块间距（mm） */
  gapMm: number;
  /** 侧栏宽度（mm），0 = 单栏通排 */
  sidebarWidthMm: number;
  /** 侧栏在哪边 */
  sidebarSide: 'left' | 'right';
  /** 主栏与侧栏之间的间距（mm） */
  columnGapMm: number;
  /**
   * 进侧栏的 contentRef.source 前缀（双栏模板）。
   * buildLayout 的 source 约定：personal_info / summary / skills /
   * experience[i] / education[i] / projects[i]。
   * section 标题与组内首块同 source，天然同队，不会拆散。
   */
  sidebarSources: string[];
}

export interface LayoutTemplate {
  id: string;
  name: string;
  desc: string;
  layout: TemplateLayout;
  /**
   * 字号倍率：高度重估时按 max(1, fontScale) 放大估算值
   * （小于 1 不缩——估算口径按 classic 校准，缩小会裁切）。
   * 实际字号规则见 renderHtml.ts BLOCK_CSS 的 data-template 作用域。
   */
  fontScale: number;
}

/** 默认模板 id 已在 types.ts 定义并 re-export，此处不再重复声明 */

export const TEMPLATES: readonly LayoutTemplate[] = Object.freeze([
  {
    id: 'classic',
    name: '经典单栏',
    desc: '通栏单列、蓝灰主题，边距 15mm / 间距 4mm，适合大多数场景',
    layout: {
      marginMm: 15,
      gapMm: 4,
      sidebarWidthMm: 0,
      sidebarSide: 'left',
      columnGapMm: 0,
      sidebarSources: [],
    },
    fontScale: 1,
  },
  {
    id: 'compact',
    name: '紧凑',
    desc: '边距 12mm / 间距 2mm + 小字号，同样内容更省页',
    layout: {
      marginMm: 12,
      gapMm: 2,
      sidebarWidthMm: 0,
      sidebarSide: 'left',
      columnGapMm: 0,
      sidebarSources: [],
    },
    fontScale: 0.92,
  },
  {
    id: 'sidebar',
    name: '双栏·左栏',
    desc: '左侧 62mm 窄栏放联系方式/总结/技能，右侧主栏排经历与项目',
    layout: {
      marginMm: 14,
      gapMm: 3,
      sidebarWidthMm: 62,
      sidebarSide: 'left',
      columnGapMm: 6,
      // 联系方式不进侧栏：62mm 装不下邮箱（.lk-contact-line span 是 nowrap），
      // 它会整段被裁；并入通栏 banner 更符合双栏简历惯例
      sidebarSources: ['summary', 'skills'],
    },
    fontScale: 0.95,
  },
  {
    id: 'elegant',
    name: '典雅宽距',
    desc: '边距 20mm / 间距 6mm + 大字号标题，留白与呼吸感',
    layout: {
      marginMm: 20,
      gapMm: 6,
      sidebarWidthMm: 0,
      sidebarSide: 'left',
      columnGapMm: 0,
      sidebarSources: [],
    },
    fontScale: 1.1,
  },
]);

/** 模板下拉/分段选项（EditorToolbar 的 Segmented 直接吃这个） */
export const TEMPLATE_OPTIONS: ReadonlyArray<{ label: string; value: string; desc: string }> =
  Object.freeze(TEMPLATES.map((t) => ({ label: t.name, value: t.id, desc: t.desc })));

export function getTemplate(id: string): LayoutTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

/** source 的分组键：'experience[0]' → 'experience'（keep-with-next 与侧栏分流共用） */
function groupOf(source: string): string {
  const m = /^[^.[]+/.exec(source);
  return m ? m[0] : source;
}

/**
 * 通栏前缀类型：双栏模板里这些块横跨全宽（简历头部三件套 + 自由文本）。
 * contact 必须在这里：.lk-contact-line span 是 nowrap，放进 62mm 侧栏会被裁掉。
 */
const BANNER_TYPES = new Set(['header', 'contact', 'avatar', 'divider', 'text']);

/** 流式队列的一项：块 + 是否与同队下一块 keep-with-next */
interface Entry {
  block: Block;
  keepNext: boolean;
}

/**
 * 按模板重排布局文档。
 *
 * @param doc 现有布局（块顺序/内容/可见性/锁定全部保留）
 * @param templateId 目标模板 id；不存在时原样返回（调用方应先校验）
 * @returns 新文档（template/gap/pageCount/blocks 全部重建；无变化时
 *          对 classic 默认布局幂等，可由上层 sameDoc 短路）
 */
export function applyTemplate(doc: LayoutDocument, templateId: string): LayoutDocument {
  const tpl = getTemplate(templateId);
  if (!tpl) return doc;

  const canvas = doc.canvas ?? CANVAS_MM;
  const margin = tpl.layout.marginMm;
  const gap = tpl.layout.gapMm;
  const safeBottom = roundMm(canvas.height - margin);
  const fullW = roundMm(canvas.width - margin * 2);
  const sbW = tpl.layout.sidebarWidthMm;
  const upScale = Math.max(1, tpl.fontScale);

  if (doc.blocks.length === 0) {
    return { ...doc, template: tpl.id, gap, pageCount: 1 };
  }

  /**
   * 目标宽度下的块高：宽度不变 → 原样保留（含用户手调，缩矮的也尊重）；
   * 宽度变化 → 按新宽度重估，只放大不缩小，并乘字号倍率（同样只放大）。
   */
  const heightFor = (b: Block, w: number): number => {
    const nw = roundMm(w);
    if (Math.abs(nw - b.rect.w) <= 0.01) return b.rect.h;
    const need = estimateContentHeightMm({ ...b, rect: { ...b.rect, w: nw } });
    return roundMm(Math.max(b.rect.h, need * upScale + OVERFLOW_MARGIN_MM));
  };

  // ── 队列拆分（顺序即 z 序，原样保留到产出阶段） ──
  const entries: Entry[] = doc.blocks.map((b, i) => {
    const next = doc.blocks[i + 1];
    const keepNext =
      b.type === 'section' &&
      !!next &&
      next.type !== 'section' &&
      groupOf(next.contentRef.source) === groupOf(b.contentRef.source);
    return { block: b, keepNext };
  });

  const emitted = new Map<string, Block>();
  /** `${page}:${col}` → 该页该列已有内容（翻页判定用，空列不翻） */
  const pageColFilled = new Set<string>();
  let page = 0;
  let y = margin;
  /** 双栏区所在页（banner 排完落点）；主栏翻过它之后转通栏 */
  let doubleZonePage = 0;

  const emit = (e: Entry, col: string, x: number, w: number, yy: number): void => {
    const h = heightFor(e.block, w);
    emitted.set(e.block.id, {
      ...e.block,
      page,
      rect: { x: roundMm(x), y: roundMm(yy), w: roundMm(w), h },
    });
    pageColFilled.add(`${page}:${col}`);
    y = roundMm(yy + h + gap);
  };

  /**
   * 单列流式排布（含翻页）。主栏翻过双栏区所在页时，剩余队列转通栏递归重排。
   */
  const flow = (list: Entry[], col: string, x: number, w: number, startY: number, startPage: number): void => {
    page = startPage;
    y = startY;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const h = heightFor(e.block, w);
      const follow = e.keepNext && list[i + 1] ? heightFor(list[i + 1].block, w) : 0;
      const need = follow > 0 ? roundMm(h + gap + follow) : h;
      const filled = pageColFilled.has(`${page}:${col}`);
      if (filled && roundMm(y + need) > safeBottom + 0.01) {
        page += 1;
        y = margin;
        // 双栏模板：主栏翻过双栏区所在页 → 后续页通栏（空间优先）
        if (col === 'main' && sbW > 0 && page > doubleZonePage) {
          flow(list.slice(i), 'main', margin, fullW, margin, page);
          return;
        }
      }
      emit(e, col, x, w, y);
    }
  };

  if (sbW > 0) {
    // 1) 通栏前缀：开头连续的 header/avatar/divider/text
    let idx = 0;
    const banner: Entry[] = [];
    while (idx < entries.length && BANNER_TYPES.has(entries[idx].block.type)) {
      banner.push(entries[idx]);
      idx += 1;
    }
    flow(banner, 'banner', margin, fullW, margin, 0);
    doubleZonePage = page;

    // 2) 侧栏 / 主栏分流（section 与组内首块同 source，天然同队）
    const rest = entries.slice(idx);
    const side: Entry[] = [];
    const main: Entry[] = [];
    for (const e of rest) {
      const src = e.block.contentRef.source;
      const toSide = tpl.layout.sidebarSources.some((p) => src === p || src.startsWith(p));
      (toSide ? side : main).push(e);
    }

    // 3) 双栏区几何
    const sideX =
      tpl.layout.sidebarSide === 'left' ? margin : roundMm(margin + fullW - sbW);
    const mainX =
      tpl.layout.sidebarSide === 'left'
        ? roundMm(margin + sbW + tpl.layout.columnGapMm)
        : margin;
    const mainW = roundMm(fullW - sbW - tpl.layout.columnGapMm);
    const zoneTop = Math.max(y, margin);

    // 4) 侧栏流式：放不下的（含 keep-with-next 的组尾）降级到主栏队尾
    page = doubleZonePage;
    y = zoneTop;
    const demoted: Entry[] = [];
    for (let i = 0; i < side.length; i++) {
      const e = side[i];
      const h = heightFor(e.block, sbW);
      const follow = e.keepNext && side[i + 1] ? heightFor(side[i + 1].block, sbW) : 0;
      const need = follow > 0 ? roundMm(h + gap + follow) : h;
      const filled = pageColFilled.has(`${page}:side`);
      if (filled && roundMm(y + need) > safeBottom + 0.01) {
        demoted.push(...side.slice(i));
        break;
      }
      emit(e, 'side', sideX, sbW, y);
    }

    // 5) 主栏流式（降级块按主栏宽重排，拼在队尾）
    flow([...main, ...demoted], 'main', mainX, mainW, zoneTop, doubleZonePage);
  } else {
    flow(entries, 'main', margin, fullW, margin, 0);
  }

  // 产出：按原数组顺序重组（z 序不变）；理论上全覆盖，缺失的块原样兜底防丢内容
  const blocks = doc.blocks.map((b) => emitted.get(b.id) ?? b);
  const maxPage = blocks.reduce((m, b) => Math.max(m, (b.page ?? 0) + 1), 1);
  return normalizePages({ ...doc, template: tpl.id, gap, pageCount: maxPage, blocks });
}

/** 自检用：模板表完整性（供测试调用） */
export function auditTemplates(): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const t of TEMPLATES) {
    if (ids.has(t.id)) problems.push(`duplicate template id "${t.id}"`);
    ids.add(t.id);
    if (!t.name.trim()) problems.push(`${t.id}: empty name`);
    if (!t.desc.trim()) problems.push(`${t.id}: empty desc`);
    const { marginMm, gapMm, sidebarWidthMm, columnGapMm } = t.layout;
    if (!(marginMm > 0) || marginMm >= 100) problems.push(`${t.id}: bad margin ${marginMm}`);
    if (!(gapMm >= 0) || gapMm > 30) problems.push(`${t.id}: bad gap ${gapMm}`);
    if (!(sidebarWidthMm >= 0)) problems.push(`${t.id}: bad sidebar width`);
    if (sidebarWidthMm > 0 && !(columnGapMm > 0)) problems.push(`${t.id}: two-column needs columnGap`);
    if (!(t.fontScale > 0) || t.fontScale > 2) problems.push(`${t.id}: bad fontScale ${t.fontScale}`);
  }
  return { ok: problems.length === 0, problems };
}
