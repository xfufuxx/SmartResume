/**
 * 共享渲染器 —— 预览与导出的「唯一内容渲染实现」。
 *
 * 1:1 保证的结构来源：
 * - 预览的每个 block 由 BlockFrame 渲染：外层 .lk-blk（mm 绝对定位）+
 *   内层 .lk-blk-content（样式覆盖）+ blockInnerHtml() 产出的内容 HTML；
 * - 导出的每个 block 由 layoutBodyHtml() 生成：同一套 class、同一套
 *   inline mm 样式、同一个 blockInnerHtml() 字符串；
 * - 选区框、缩放手柄、参考线、网格都是 React 预览层chrome，只以
 *   .is-* / .le-* class 附加，从不进入导出 HTML。
 *
 * 本文件零依赖（不 import React / antd），node:test 可直接测。
 */

import type { Block, LayoutDocument } from './types.ts';
import { DEFAULT_TEMPLATE_ID } from './types.ts';
import { pageCountOf, pageOf } from './paging.ts';

/** section 块的标题：由 contentRef.source 派生（buildLayout 只存了 count，标题是结构常量） */
export const SECTION_LABELS: Record<string, string> = {
  summary: '个人总结',
  experience: '工作经历',
  education: '教育背景',
  skills: '专业技能',
  projects: '项目经历',
};

/** HTML 属性/文本转义。简历内容是用户自有数据，但转义保证结构永不被数据破坏 */
function escapeHtml(value: unknown): string {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 文本转义并保留换行（摘要等长文本） */
function escapeText(value: unknown): string {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, '<br>');
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function joinPeriod(start: unknown, end: unknown): string {
  const s = str(start);
  const e = str(end);
  if (s && e) return `${s} - ${e}`;
  return s || e;
}

/** item 块的数据来源种类（experience / education / projects 共用 'item' 类型，按 source 前缀分流） */
export type ItemKind = 'experience' | 'education' | 'projects' | 'unknown';

export function itemKindOf(source: string): ItemKind {
  if (source.startsWith('experience')) return 'experience';
  if (source.startsWith('education')) return 'education';
  if (source.startsWith('projects')) return 'projects';
  return 'unknown';
}

/** BlockStyle → inline style 字符串（预览 React 侧用同名字段构造 CSSProperties，保持一致） */
export function blockContentStyleString(block: Block): string {
  const s = block.style;
  if (!s) return '';
  const parts: string[] = [];
  if (typeof s.fontSizePt === 'number' && s.fontSizePt > 0) parts.push(`font-size:${s.fontSizePt}pt`);
  if (typeof s.fontWeight === 'number' && s.fontWeight > 0) parts.push(`font-weight:${s.fontWeight}`);
  if (typeof s.color === 'string' && s.color.trim()) parts.push(`color:${escapeHtml(s.color.trim())}`);
  if (s.align) parts.push(`text-align:${s.align}`);
  return parts.length ? ` style="${parts.join(';')}"` : '';
}

// ============ 各类型内容 HTML ============

function headerHtml(block: Block): string {
  const p = asRecord(block.contentRef.payload);
  const name = str(p.name) || (typeof block.contentRef.payload === 'string' ? block.contentRef.payload : '');
  return `<div class="lk-name">${escapeHtml(name)}</div>`;
}

function contactHtml(block: Block): string {
  const p = asRecord(block.contentRef.payload);
  const fields: Array<[string, string]> = [
    ['email', ''],
    ['phone', ''],
    ['address', ''],
    ['linkedin', ''],
    ['github', ''],
  ];
  const spans = fields
    .map(([key, prefix]) => (str(p[key]) ? `<span>${prefix}${escapeHtml(p[key])}</span>` : ''))
    .filter(Boolean)
    .join('');
  return `<div class="lk-contact-line">${spans}</div>`;
}

function dividerHtml(): string {
  return '<div class="lk-divider"></div>';
}

function summaryHtml(block: Block): string {
  const p = asRecord(block.contentRef.payload);
  const text = str(p.summary) || (typeof block.contentRef.payload === 'string' ? block.contentRef.payload : '');
  return `<div class="lk-summary-text">${escapeText(text)}</div>`;
}

function sectionHtml(block: Block): string {
  const p = asRecord(block.contentRef.payload);
  const label = str(p.title) || SECTION_LABELS[block.contentRef.source] || '';
  return `<div class="lk-section-title">${escapeHtml(label)}</div>`;
}

function experienceItemHtml(p: Record<string, unknown>): string {
  const company = str(p.company);
  const title = [str(p.title), company ? `@ ${company}` : ''].filter(Boolean).join(' ');
  const period = joinPeriod(p.start, p.end);
  const points = arr(p.points)
    .map((x) => `<li>${escapeHtml(x)}</li>`)
    .join('');
  return (
    `<div class="lk-item-title">${escapeHtml(title)}</div>` +
    (period ? `<div class="lk-item-sub">${escapeHtml(period)}</div>` : '') +
    (points ? `<ul class="lk-points">${points}</ul>` : '')
  );
}

function educationItemHtml(p: Record<string, unknown>): string {
  const school = str(p.school);
  const degree = [str(p.degree), str(p.major)].filter(Boolean).join(' - ');
  const period = joinPeriod(p.start, p.end);
  const sub = [degree, period].filter(Boolean).join(' | ');
  return (
    `<div class="lk-item-title">${escapeHtml(school)}</div>` +
    (sub ? `<div class="lk-item-sub">${escapeHtml(sub)}</div>` : '')
  );
}

function projectItemHtml(p: Record<string, unknown>): string {
  const head = [str(p.name), str(p.role)].filter(Boolean).join(' · ');
  const period = joinPeriod(p.start, p.end);
  const points = arr(p.points)
    .map((x) => `<li>${escapeHtml(x)}</li>`)
    .join('');
  const description = str(p.description);
  const tech = arr(p.tech).filter(Boolean);
  return (
    `<div class="lk-item-title">${escapeHtml(head)}</div>` +
    (period ? `<div class="lk-item-sub">${escapeHtml(period)}</div>` : '') +
    (points ? `<ul class="lk-points">${points}</ul>` : '') +
    (description ? `<div class="lk-text">${escapeText(description)}</div>` : '') +
    (tech.length ? `<div class="lk-item-sub">技术栈：${escapeHtml(tech.join('、'))}</div>` : '')
  );
}

function itemHtml(block: Block): string {
  const p = asRecord(block.contentRef.payload);
  const kind = itemKindOf(block.contentRef.source);
  if (kind === 'education') return educationItemHtml(p);
  if (kind === 'projects') return projectItemHtml(p);
  if (kind === 'experience') return experienceItemHtml(p);
  // 来源不明的 item：尽力渲染通用字段，不丢内容
  return experienceItemHtml(p);
}

function skillGroupHtml(block: Block): string {
  const p = asRecord(block.contentRef.payload);
  const skills = arr(p.skills).length ? arr(p.skills) : arr(block.contentRef.payload);
  const tags = skills.map((s) => `<span class="lk-tag">${escapeHtml(s)}</span>`).join('');
  return `<div class="lk-skills">${tags}</div>`;
}

function textHtml(block: Block): string {
  const p = asRecord(block.contentRef.payload);
  const text = str(p.text) || (typeof block.contentRef.payload === 'string' ? block.contentRef.payload : '');
  return `<div class="lk-text">${escapeText(text)}</div>`;
}

function avatarHtml(block: Block): string {
  const p = asRecord(block.contentRef.payload);
  const url = str(p.url) || str(p.avatar_url) || str(p.avatar);
  if (url) return `<img class="lk-avatar-img" src="${escapeHtml(url)}" alt="">`;
  return '<div class="lk-avatar-empty"></div>';
}

/**
 * 单个 block 的内容 HTML（不含定位外层）。
 * 预览（BlockFrame 的 dangerouslySetInnerHTML）与导出（layoutBodyHtml）
 * 调用的是同一个函数 —— 这是 1:1 的核心保证。
 */
export function blockInnerHtml(block: Block): string {
  switch (block.type) {
    case 'header':
      return headerHtml(block);
    case 'contact':
      return contactHtml(block);
    case 'divider':
      return dividerHtml();
    case 'summary':
      return summaryHtml(block);
    case 'section':
      return sectionHtml(block);
    case 'item':
      return itemHtml(block);
    case 'skill-group':
      return skillGroupHtml(block);
    case 'text':
      return textHtml(block);
    case 'avatar':
      return avatarHtml(block);
    default:
      return '';
  }
}

/** 内容包裹层（样式覆盖挂在这里）。预览与导出共用 */
export function blockContentWrapperHtml(block: Block): string {
  return `<div class="lk-blk-content"${blockContentStyleString(block)}>${blockInnerHtml(block)}</div>`;
}

/**
 * 整个布局文档的 body HTML。
 * - visible === false 的块整体跳过（预览不渲染，导出不输出）；
 * - 按页分组输出多个 .lk-page（每页一个 210×297 容器，打印时一页一 PDF 页）；
 * - 空页也输出（用户可能故意留白），保持页数与 pageCount 一致；
 * - blocks 数组顺序 = z 序（后者在上），与预览 DOM 顺序一致。
 */
export function layoutBodyHtml(doc: LayoutDocument): string {
  const count = pageCountOf(doc);
  const template = doc.template ?? DEFAULT_TEMPLATE_ID;
  const pages: string[] = [];
  for (let p = 0; p < count; p++) {
    const parts = doc.blocks
      .filter((b) => b.visible !== false && pageOf(b) === p)
      .map(
        (b) =>
          `<div class="lk-blk lk-${b.type}" data-block-id="${escapeHtml(b.id)}" ` +
          `style="left:${b.rect.x}mm;top:${b.rect.y}mm;width:${b.rect.w}mm;height:${b.rect.h}mm">` +
          blockContentWrapperHtml(b) +
          '</div>',
      );
    pages.push(`<div class="lk-page" data-page="${p}" data-template="${escapeHtml(template)}">${parts.join('')}</div>`);
  }
  return pages.join('');
}

/**
 * 块定位/排版 CSS —— 预览与导出共用（预览运行时注入 <style>，导出随请求发给后端）。
 * 只放内容与定位，不放任何编辑器 chrome（选区/手柄/参考线在 editor.css）。
 */
export const BLOCK_CSS = `
.lk-page{width:210mm;height:297mm;position:relative;overflow:hidden;background:#fff;box-sizing:border-box;
  break-inside:avoid;page-break-inside:avoid;}
/* 多页导出：每个 .lk-page 精确占满一页 A4；最后一个不补分页符（避免尾部空白页） */
@media print{
  .lk-page{page-break-after:always;break-after:page;}
  .lk-page:last-child{page-break-after:auto;break-after:auto;}
}
.lk-blk{position:absolute;box-sizing:border-box;}
.lk-blk-content{width:100%;height:100%;overflow:hidden;}
.lk-name{font-size:20pt;font-weight:700;color:#1a1a1a;line-height:1.25;}
.lk-header .lk-blk-content{display:flex;align-items:center;}
.lk-contact-line{font-size:10pt;color:#666;line-height:1.5;}
.lk-contact-line span{margin-right:14px;white-space:nowrap;}
.lk-divider{border-top:0.4mm solid #d9d9d9;width:100%;}
.lk-summary-text{font-size:10.5pt;color:#333;line-height:1.6;}
.lk-section-title{display:block;font-size:14pt;font-weight:700;color:#2c6fbb;border-bottom:2px solid #2c6fbb;padding-bottom:1mm;line-height:1.4;}
.lk-item-title{font-size:11pt;font-weight:700;color:#1a1a1a;line-height:1.4;}
.lk-item-sub{font-size:10pt;color:#555;line-height:1.5;}
.lk-points{margin:1mm 0 0;padding-left:5mm;}
.lk-points li{font-size:10pt;color:#333;line-height:1.55;margin-bottom:0.5mm;}
.lk-skills{line-height:1.9;}
.lk-tag{display:inline-block;background:#eef3fb;color:#2c6fbb;padding:0.6mm 2.4mm;margin:0 1.2mm 1.2mm 0;border-radius:1mm;font-size:10pt;}
.lk-text{font-size:10pt;color:#333;line-height:1.6;}
.lk-avatar-img{width:100%;height:100%;object-fit:cover;border-radius:2mm;display:block;}
.lk-avatar-empty{width:100%;height:100%;border:0.3mm dashed #d9d9d9;border-radius:2mm;box-sizing:border-box;}
/* ── 模板主题（templates.ts 的视觉半边；几何由 applyTemplate 负责） ──
   作用域挂 .lk-page[data-template]，只改字号/颜色，不碰定位。
   字号与 fontScale 口径一致：compact 缩小（高度按 classic 口径估算，偏保守不裁切）；
   elegant 只放大标题/单行类元素（多行元素放大有估算偏差，宁可不放大）；
   sidebar 只缩侧栏块（窄栏 62mm，全宽字号会折行过多）。 */
.lk-page[data-template="compact"] .lk-name{font-size:18pt;}
.lk-page[data-template="compact"] .lk-contact-line{font-size:9pt;}
.lk-page[data-template="compact"] .lk-summary-text{font-size:9.5pt;}
.lk-page[data-template="compact"] .lk-section-title{font-size:12pt;}
.lk-page[data-template="compact"] .lk-item-title{font-size:10pt;}
.lk-page[data-template="compact"] .lk-item-sub{font-size:9pt;}
.lk-page[data-template="compact"] .lk-points li{font-size:9pt;}
.lk-page[data-template="compact"] .lk-tag{font-size:9pt;}
.lk-page[data-template="compact"] .lk-text{font-size:9pt;}
.lk-page[data-template="sidebar"] .lk-contact-line{font-size:9.5pt;}
.lk-page[data-template="sidebar"] .lk-summary-text{font-size:9.5pt;}
.lk-page[data-template="sidebar"] .lk-tag{font-size:9pt;}
.lk-page[data-template="elegant"] .lk-name{font-size:22pt;}
.lk-page[data-template="elegant"] .lk-section-title{font-size:15pt;}
.lk-page[data-template="elegant"] .lk-summary-text{font-size:11pt;}
.lk-page[data-template="elegant"] .lk-tag{font-size:10.5pt;}
`;

/** 预览页注入字体/样式的 <style> id（防重复注入） */
export const LAYOUT_STYLE_ELEMENT_ID = 'lk-block-style';
