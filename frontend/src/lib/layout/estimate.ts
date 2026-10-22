/**
 * 内容高度估算 —— 纯函数层，零 React 依赖，可单测。
 *
 * 两个消费方：
 * - validate.ts：导出前发现「块高装不下内容」，自动增高（fixOverflow）；
 * - buildLayout.ts：默认布局直接按估算高度生成，开箱即「所见即所得」。
 *
 * 口径只有这一份，是「预览所见 = 导出所得」的前提。改模型必须同时看两边。
 *
 * 模型不是拍的，是校准的（2026-10-21，chromium + Noto Sans SC 逐元素实测）：
 * - 每个元素的字号/行高对齐 BLOCK_CSS（renderHtml.ts，预览与导出同一套）；
 * - 字符宽度：CJK 全角 = 1em，拉丁/数字 ≈ 0.6em，空格 ≈ 0.3em（实测 0.588）；
 * - 行盒修正 ×1.03：浏览器行盒向上取整到整像素，裸公式会系统性低估一行；
 * - 元素间距照抄 CSS：.lk-points 上 margin 1mm、li 间 0.5mm（末条折叠）、
 *   section 标题 1mm padding + 2px 下边框、技能 tag 行高 8.6mm、行间 1.2mm。
 *
 * item 块按 contentRef.source 分 experience / education / projects 三类取字段，
 * 与 renderHtml 的 itemHtml 分流完全一致——估算器看得见的必须是渲染器画得出的。
 * 改 BLOCK_CSS 或 itemHtml 必须同步改这里，否则「编辑时红点」与「导出 PDF」
 * 会互相矛盾（曾因估算器不认 school/major 字段，教育块高度全凭 base 猜）。
 */

import type { Block } from './types.ts';
import { CSS_PX_PER_MM, roundMm } from './geometry.ts';
import { itemKindOf, SECTION_LABELS } from './renderHtml.ts';

// ─── 字符宽度模型（em） ───

/** 拉丁/数字字符宽度（em）——Noto Sans SC 实测区间 0.49~0.59，取 0.55 保守（宁多勿少） */
const LATIN_EM = 0.55;
/** 空格宽度（em） */
const SPACE_EM = 0.3;

/** 行盒安全系数：浏览器行盒取整到像素，公式值需略放大才不低估 */
const LINE_BOX_SAFETY = 1.03;

/** 行数上限，防极端数据刷爆高度（单段 / 单块） */
const MAX_SEGMENT_LINES = 60;
const MAX_BLOCK_LINES = 240;

/** 增高余量（mm），防截断 */
export const OVERFLOW_MARGIN_MM = 0.5;

// ─── 元素度量（pt / line-height），与 BLOCK_CSS 一一对应 ───

const LINE_STYLE = {
  name: { pt: 20, lh: 1.25 }, // .lk-name
  contact: { pt: 10, lh: 1.5 }, // .lk-contact-line
  summary: { pt: 10.5, lh: 1.6 }, // .lk-summary-text
  section: { pt: 14, lh: 1.4 }, // .lk-section-title
  itemTitle: { pt: 11, lh: 1.4 }, // .lk-item-title
  itemSub: { pt: 10, lh: 1.5 }, // .lk-item-sub
  point: { pt: 10, lh: 1.55 }, // .lk-points li
  text: { pt: 10, lh: 1.6 }, // .lk-text
} as const;

/** section 标题的 padding-bottom + 2px 下边框（mm） */
const SECTION_EXTRA_MM = 1 + (2 * 25.4) / 96;
/** .lk-points 的上 margin 与 li 的下 margin（mm；末条 margin 折叠出 ul） */
const POINTS_MARGIN_TOP_MM = 1;
const POINT_GAP_MM = 0.5;
/** .lk-points 的 padding-left（mm）：折行宽度要扣掉 */
const POINTS_PADDING_LEFT_MM = 5;
/** 技能 tag：行高与行间（mm，实测 2 行 = 18.26mm 反推）、左右内边距与右 margin */
const SKILL_ROW_MM = 8.6;
const SKILL_ROW_GAP_MM = 1.2;
const TAG_SIDE_PAD_MM = 2.4;
const TAG_GAP_MM = 1.2;

/** pt × line-height → mm 行高（含行盒安全系数） */
function lineMm(pt: number, lh: number): number {
  return pt * lh * (25.4 / 72) * LINE_BOX_SAFETY;
}

/** 文本的等效全角字符数（em）：CJK = 1，拉丁/数字 = 0.6，空格 = 0.3 */
export function textEm(text: string): number {
  let em = 0;
  for (const ch of text) {
    if (ch === ' ' || ch === '\t') em += SPACE_EM;
    else if ((ch.codePointAt(0) ?? 0) > 0x2e7f) em += 1; // CJK 及全角标点
    else em += LATIN_EM;
  }
  return em;
}

/**
 * 每行可容纳的全角字符数（按块内可用宽度）。
 * 不取整：浏览器折行是「内容宽 > 行宽」的精确比较，CJK 在 Noto 里严格 1em，
 * 取整会把临界行（如 49.5em / 49.6em 容量）多算一行，白吃 5.6mm。
 */
function charsPerLine(widthMm: number, pt: number): number {
  const charPx = pt * (96 / 72);
  return Math.max(1, (widthMm * CSS_PX_PER_MM) / charPx);
}

/** 一段文本占几行（0 = 空段） */
function linesOf(text: string, widthMm: number, pt: number): number {
  const em = textEm(text.trim());
  if (em <= 0) return 0;
  return Math.min(MAX_SEGMENT_LINES, Math.ceil(em / charsPerLine(widthMm, pt)));
}

// ─── 文本提取（与 renderHtml 同口径，供调试/测试；估算本身走下面的分段模型） ───

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function nonEmptyStrings(value: unknown): string[] {
  return arr(value).filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
}

/** start/end → 「2021.03 - 至今」（与 renderHtml.joinPeriod 一致） */
function periodText(p: Record<string, unknown>): string {
  const s = str(p.start);
  const e = str(p.end);
  if (s && e) return `${s} - ${e}`;
  return s || e;
}

/** 从 contentRef.payload 提取纯文本（按类型取渲染真正展示的字段，'\n' 分段） */
export function extractBlockText(block: Block): string {
  const p = asRecord(block.contentRef?.payload);
  const parts: string[] = [];
  const push = (v: unknown) => {
    const s = typeof v === 'string' ? v.trim() : '';
    if (s) parts.push(s);
  };
  switch (block.type) {
    case 'header':
      push(p.name);
      break;
    case 'contact':
      push(p.name);
      push(p.email);
      push(p.phone);
      break;
    case 'summary':
      push(p.summary);
      break;
    case 'text':
      push(p.text);
      break;
    case 'skill-group': {
      const skills = arr(p.skills).length ? arr(p.skills) : arr(block.contentRef?.payload);
      skills.forEach(push);
      break;
    }
    case 'section':
      push(typeof p.title === 'string' ? p.title : SECTION_LABELS[block.contentRef?.source ?? '']);
      break;
    case 'item': {
      const kind = itemKindOf(block.contentRef?.source ?? '');
      const period = periodText(p);
      if (kind === 'education') {
        push(p.school);
        push([str(p.degree), str(p.major)].filter(Boolean).join(' - '));
        push(period);
      } else if (kind === 'projects') {
        push([str(p.name), str(p.role)].filter(Boolean).join(' · '));
        push(period);
        nonEmptyStrings(p.points).forEach(push);
        push(p.description);
        const tech = nonEmptyStrings(p.tech);
        if (tech.length) push(`技术栈：${tech.join('、')}`);
      } else {
        // experience / 来源不明：与 experienceItemHtml 一致
        push([str(p.title), str(p.company) ? `@ ${str(p.company)}` : ''].filter(Boolean).join(' '));
        push(p.period);
        push(p.location);
        push(period);
        nonEmptyStrings(p.points).forEach(push);
      }
      break;
    }
    default:
      // avatar / divider 无正文
      break;
  }
  return parts.join('\n');
}

// ─── 高度估算 ───

/** section 标题文本：payload.title 优先，否则按 source 查结构常量表 */
function sectionLabel(block: Block): string {
  const p = asRecord(block.contentRef?.payload);
  const fromPayload = typeof p.title === 'string' ? p.title.trim() : '';
  return fromPayload || SECTION_LABELS[block.contentRef?.source ?? ''] || '';
}

/** 技能组的 tag 槽位宽度（mm，含左右内边距与右 margin）——用于贪心模拟换行 */
function tagSlotMm(skill: string): number {
  const textMm = (textEm(skill) * LINE_STYLE.contact.pt * (96 / 72)) / CSS_PX_PER_MM;
  return textMm + TAG_SIDE_PAD_MM * 2 + TAG_GAP_MM;
}

/**
 * 估算内容所需高度（mm）。无正文的块返回原高度（不判溢出）。
 *
 * 分段模型：按 renderHtml 的 DOM 结构逐元素累加——
 * 标题行 + 副标题行 + 要点列表（上 margin + 每条行数 × 行高 + 条间 margin）
 * + 描述 + 技术栈行；contact/skill-group 走横向折行模型。
 */
export function estimateContentHeightMm(block: Block): number {
  const w = block.rect.w;
  const p = asRecord(block.contentRef?.payload);

  switch (block.type) {
    case 'header': {
      const name = str(p.name);
      if (!name) return block.rect.h;
      return roundMm(linesOf(name, w, LINE_STYLE.name.pt) * lineMm(LINE_STYLE.name.pt, LINE_STYLE.name.lh));
    }
    case 'contact': {
      const flat = [str(p.name), str(p.email), str(p.phone)].filter(Boolean).join(' · ');
      if (!flat) return block.rect.h;
      return roundMm(linesOf(flat, w, LINE_STYLE.contact.pt) * lineMm(LINE_STYLE.contact.pt, LINE_STYLE.contact.lh));
    }
    case 'divider':
      return block.rect.h; // 纯边框，无内容
    case 'summary': {
      const text = typeof p.summary === 'string' ? p.summary : '';
      if (!text.trim()) return block.rect.h;
      return roundMm(linesOf(text, w, LINE_STYLE.summary.pt) * lineMm(LINE_STYLE.summary.pt, LINE_STYLE.summary.lh));
    }
    case 'section': {
      const label = sectionLabel(block);
      if (!label) return block.rect.h;
      const h =
        linesOf(label, w, LINE_STYLE.section.pt) * lineMm(LINE_STYLE.section.pt, LINE_STYLE.section.lh) +
        SECTION_EXTRA_MM;
      return roundMm(h);
    }
    case 'text': {
      const text = typeof p.text === 'string' ? p.text : typeof block.contentRef?.payload === 'string' ? block.contentRef.payload : '';
      if (!text.trim()) return block.rect.h;
      return roundMm(linesOf(text, w, LINE_STYLE.text.pt) * lineMm(LINE_STYLE.text.pt, LINE_STYLE.text.lh));
    }
    case 'item': {
      const kind = itemKindOf(block.contentRef?.source ?? '');
      const period = periodText(p);
      let title: string;
      let sub: string;
      let points: string[] = [];
      let description = '';
      let hasTech = false;

      if (kind === 'education') {
        // educationItemHtml：school 一行 + 「degree - major | period」一行
        title = str(p.school);
        sub = [[str(p.degree), str(p.major)].filter(Boolean).join(' - '), period].filter(Boolean).join(' | ');
      } else if (kind === 'projects') {
        // projectItemHtml：name · role + period + points + description + 技术栈
        title = [str(p.name), str(p.role)].filter(Boolean).join(' · ');
        sub = period;
        points = nonEmptyStrings(p.points);
        description = str(p.description);
        hasTech = nonEmptyStrings(p.tech).length > 0;
      } else {
        // experienceItemHtml / 来源不明：title @ company + period + points
        title = [str(p.title), str(p.company) ? `@ ${str(p.company)}` : ''].filter(Boolean).join(' ');
        sub = period || str(p.period);
        points = nonEmptyStrings(p.points);
      }

      let h =
        linesOf(title, w, LINE_STYLE.itemTitle.pt) * lineMm(LINE_STYLE.itemTitle.pt, LINE_STYLE.itemTitle.lh) +
        linesOf(sub, w, LINE_STYLE.itemSub.pt) * lineMm(LINE_STYLE.itemSub.pt, LINE_STYLE.itemSub.lh);

      if (points.length > 0) {
        const liW = Math.max(10, w - POINTS_PADDING_LEFT_MM);
        let liLines = 0;
        for (const pt of points) liLines += linesOf(pt, liW, LINE_STYLE.point.pt);
        liLines = Math.min(MAX_BLOCK_LINES, liLines);
        h += POINTS_MARGIN_TOP_MM + liLines * lineMm(LINE_STYLE.point.pt, LINE_STYLE.point.lh) +
          Math.max(0, points.length - 1) * POINT_GAP_MM;
      }
      if (description) {
        h += linesOf(description, w, LINE_STYLE.text.pt) * lineMm(LINE_STYLE.text.pt, LINE_STYLE.text.lh);
      }
      if (hasTech) {
        h += lineMm(LINE_STYLE.itemSub.pt, LINE_STYLE.itemSub.lh);
      }
      if (h <= 0) return block.rect.h; // 字段全空（空教育条目等）：不判溢出
      return roundMm(h);
    }
    case 'skill-group': {
      const skills = arr(p.skills).length ? nonEmptyStrings(p.skills) : nonEmptyStrings(block.contentRef?.payload);
      if (skills.length === 0) return block.rect.h;
      // 贪心模拟 flex-wrap：一行放不下就换行（槽位含右 margin）
      let rows = 1;
      let used = 0;
      for (const s of skills) {
        const slot = tagSlotMm(s);
        if (used > 0 && used + slot > w) {
          rows += 1;
          used = slot;
        } else {
          used += slot;
        }
      }
      return roundMm(rows * SKILL_ROW_MM + (rows - 1) * SKILL_ROW_GAP_MM);
    }
    default:
      // avatar 等无正文类型
      return block.rect.h;
  }
}
