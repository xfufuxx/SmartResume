/**
 * 默认布局生成 —— 纯函数层。
 *
 * 输入 ResumeParseResult 形状的数据（宽松结构，不依赖 src/types，保持 lib/layout 独立），
 * 输出 LayoutDocument：从安全边距内起点自上而下流式堆叠，块间距默认 4mm；
 * 放不下自动翻页（多页简历），栏目标题与首条内容 keep-with-next 不分页分离。
 *
 * 设计约束：
 * - id 只由结构位置决定（blk_header / blk_exp_0 / blk_edu_1…），同数据重复生成结果一致（幂等），
 *   便于版本迁移与「重置默认布局」；
 * - 空数据不生成对应块；完全没有数据时返回空 blocks 文档（上层给提示）；
 * - contentRef.payload 冻结对应数据子结构，预览/导出都以快照为准；
 * - personal_info 暂无头像字段，默认不生成 avatar block（类型已在 types.ts 预留）。
 *
 * 两阶段：先按内容估算高度收集全部 Draft（位置未定），再流式分页。
 * 分页规则：
 * - 当前块在本页放不下且本页非空 → 翻页（新页从安全区顶边开始）；
 * - section 与紧随的块合计放不下且本页非空 → 一起翻到新页（不留孤儿标题）；
 * - 单个块比整页还高 → 仍然放（clampRect 会钳，validate 报红点），不静默裁切。
 */

import type { Block, BlockType, LayoutDocument } from './types.ts';
import { CANVAS_MM, LAYOUT_VERSION, SAFE_MARGIN_MM } from './types.ts';
import { roundMm } from './geometry.ts';
import { OVERFLOW_MARGIN_MM, estimateContentHeightMm } from './estimate.ts';
import { defaultsForTypeClone } from './defaults.ts';

/** 宽松输入结构：只读访问，字段全部可选，payload 原样透传 */
export interface ResumeLike {
  personal_info?: {
    name?: string;
    email?: string;
    phone?: string;
    [key: string]: unknown;
  } | null;
  summary?: string | null;
  experience?: Array<Record<string, unknown>> | null;
  education?: Array<Record<string, unknown>> | null;
  skills?: string[] | null;
  projects?: Array<Record<string, unknown>> | null;
  [key: string]: unknown;
}

export interface BuildLayoutOptions {
  canvas?: { width: number; height: number };
  margin?: number;
  /** 块间距（mm），默认 4 */
  gapMm?: number;
}

/**
 * 各类型的基础高度（mm）——「视觉留白下限」。
 * 实际高度 = max(基础高度, 内容估算高度 + 余量)，口径与 validate.ts 的
 * fixOverflow 完全一致（同一份 estimateContentHeightMm）。这样默认布局
 * 开箱就是干净的：红点只在用户主动缩矮块之后出现。
 *
 * 基础值按实测内容高度收紧（2026-10-21 校准）：header/contact 原本 14/10mm
 * 比真实文字（8.7/5.3mm）富余太多，白吃 10mm 垂直空间把整页顶出安全区；
 * education/skill-group 的 base 只作空数据兜底，有内容时一律以估算为准。
 */
const SECTION_HEIGHT_MM = 9;
const HEADER_HEIGHT_MM = 10;
const CONTACT_HEIGHT_MM = 6;
const DIVIDER_HEIGHT_MM = 1;
const SUMMARY_HEIGHT_MM = 24;
const SKILL_GROUP_HEIGHT_MM = 12;
/** item 类的最小高度：保证空条目也有可点击/可拖拽的区域 */
const ITEM_MIN_HEIGHT_MM = 16;
const EDUCATION_HEIGHT_MM = 12;

/** 分页收集阶段的中间产物：高度已定，位置留给第二阶段流式排布 */
interface Draft {
  id: string;
  type: BlockType;
  h: number;
  source: string;
  payload: unknown;
  overrides?: Partial<Pick<Block, 'freedom' | 'sizePolicy' | 'style'>>;
  /** keep-with-next：与后一个块不可分页分离（栏目标题 vs 首条内容） */
  keepNext?: boolean;
}

/**
 * 按内容估算块高度：构造草稿 block 喂 estimateContentHeightMm。
 * 无正文的类型（section/divider）估算返回原高度，即取基础高度。
 *
 * source 必须原样带进草稿：estimate 的 item 分支靠 itemKindOf(source)
 * 分 experience / education / projects 三类读字段，草稿丢了 source
 * 就会按错误口径估算（项目条目曾因此被少算 5mm）。
 */
function autoHeight(
  type: BlockType,
  w: number,
  payload: unknown,
  baseMm: number,
  minMm: number = 0,
  source = '',
): number {
  const draft: Block = {
    id: '__estimate_draft__',
    type,
    rect: { x: 0, y: 0, w, h: baseMm },
    freedom: 'free',
    sizePolicy: { resizableW: true, resizableH: true, minW: 1, minH: 1 },
    contentRef: { source, payload },
  };
  const need = estimateContentHeightMm(draft);
  return roundMm(Math.max(baseMm, need + OVERFLOW_MARGIN_MM, minMm));
}

export function buildLayout(
  data: ResumeLike | null | undefined,
  options: BuildLayoutOptions = {},
): LayoutDocument {
  const canvas = options.canvas ?? CANVAS_MM;
  const margin = options.margin ?? SAFE_MARGIN_MM;
  const gap = options.gapMm ?? 4;

  // ── 阶段一：收集（高度按内容估算，位置留到阶段二） ──
  const drafts: Draft[] = [];
  const x = margin;
  const w = roundMm(canvas.width - margin * 2);

  const push = (
    id: string,
    type: BlockType,
    h: number,
    source: string,
    payload: unknown,
    overrides?: Partial<Pick<Block, 'freedom' | 'sizePolicy' | 'style'>>,
    keepNext = false,
  ): void => {
    drafts.push({ id, type, h: roundMm(h), source, payload, overrides, keepNext });
  };

  const hasText = (v: unknown): boolean => typeof v === 'string' && v.trim().length > 0;

  if (!data) {
    return {
      version: LAYOUT_VERSION,
      canvas: { width: canvas.width, height: canvas.height },
      gap,
      pageCount: 1,
      blocks: [],
      updatedAt: new Date().toISOString(),
    };
  }

  const personal = data.personal_info ?? null;
  const experience = Array.isArray(data.experience) ? data.experience : [];
  const education = Array.isArray(data.education) ? data.education : [];
  const skills = Array.isArray(data.skills) ? data.skills : [];
  const projects = Array.isArray(data.projects) ? data.projects : [];

  // 头部：姓名 → 联系方式 → 分隔线
  if (personal && hasText(personal.name)) {
    push(
      'blk_header',
      'header',
      autoHeight('header', w, personal, HEADER_HEIGHT_MM, 0, 'personal_info.name'),
      'personal_info.name',
      personal,
    );
  }
  if (personal && (hasText(personal.email) || hasText(personal.phone))) {
    push(
      'blk_contact',
      'contact',
      autoHeight('contact', w, personal, CONTACT_HEIGHT_MM, 0, 'personal_info'),
      'personal_info',
      personal,
    );
  }
  if (drafts.length > 0) {
    push('blk_divider', 'divider', DIVIDER_HEIGHT_MM, '', null);
  }

  // 个人简介
  if (hasText(data.summary)) {
    push(
      'blk_summary',
      'summary',
      autoHeight('summary', w, { summary: data.summary }, SUMMARY_HEIGHT_MM, 0, 'summary'),
      'summary',
      { summary: data.summary },
    );
  }

  // 工作经历（section 与首条 keep-with-next）
  if (experience.length > 0) {
    push(
      'blk_sec_experience',
      'section',
      SECTION_HEIGHT_MM,
      'experience',
      { count: experience.length },
      undefined,
      true,
    );
    experience.forEach((item, i) => {
      push(
        `blk_exp_${i}`,
        'item',
        autoHeight('item', w, item, ITEM_MIN_HEIGHT_MM, 0, `experience[${i}]`),
        `experience[${i}]`,
        item,
      );
    });
  }

  // 教育背景
  if (education.length > 0) {
    push(
      'blk_sec_education',
      'section',
      SECTION_HEIGHT_MM,
      'education',
      { count: education.length },
      undefined,
      true,
    );
    education.forEach((item, i) => {
      push(
        `blk_edu_${i}`,
        'item',
        autoHeight('item', w, item, EDUCATION_HEIGHT_MM, 0, `education[${i}]`),
        `education[${i}]`,
        item,
      );
    });
  }

  // 技能（扁平数组 → 单一技能组块）
  if (skills.length > 0) {
    push(
      'blk_sec_skills',
      'section',
      SECTION_HEIGHT_MM,
      'skills',
      { count: skills.length },
      undefined,
      true,
    );
    push(
      'blk_skills',
      'skill-group',
      autoHeight('skill-group', w, { skills }, SKILL_GROUP_HEIGHT_MM, 0, 'skills'),
      'skills',
      { skills },
    );
  }

  // 项目经历
  if (projects.length > 0) {
    push(
      'blk_sec_projects',
      'section',
      SECTION_HEIGHT_MM,
      'projects',
      { count: projects.length },
      undefined,
      true,
    );
    projects.forEach((item, i) => {
      push(
        `blk_proj_${i}`,
        'item',
        autoHeight('item', w, item, ITEM_MIN_HEIGHT_MM, 0, `projects[${i}]`),
        `projects[${i}]`,
        item,
      );
    });
  }

  // ── 阶段二：流式分页 ──
  const safeBottom = roundMm(canvas.height - margin);
  const blocks: Block[] = [];
  let page = 0;
  let y = margin;

  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i];
    // keep-with-next：与后一个块合计放不下且本页已有内容 → 一起翻页
    const followH = d.keepNext ? drafts[i + 1]?.h ?? 0 : 0;
    const need = followH > 0 ? roundMm(d.h + gap + followH) : d.h;
    const pageHasContent = blocks.some((b) => b.page === page);
    if (pageHasContent && roundMm(y + need) > safeBottom + 0.01) {
      page += 1;
      y = margin;
    }
    const defaults = defaultsForTypeClone(d.type);
    blocks.push({
      id: d.id,
      type: d.type,
      page,
      rect: { x, y: roundMm(y), w, h: d.h },
      freedom: d.overrides?.freedom ?? defaults.freedom,
      sizePolicy: d.overrides?.sizePolicy ?? defaults.sizePolicy,
      contentRef: { source: d.source, payload: d.payload },
      ...(d.overrides?.style ? { style: d.overrides.style } : {}),
    });
    y = roundMm(y + d.h + gap);
  }

  return {
    version: LAYOUT_VERSION,
    canvas: { width: canvas.width, height: canvas.height },
    gap,
    pageCount: page + 1,
    blocks,
    updatedAt: new Date().toISOString(),
  };
}

/** 比较两份布局是否一致（忽略 updatedAt / view），供幂等测试与 store 去重 */
export function sameLayout(a: LayoutDocument, b: LayoutDocument): boolean {
  const strip = (doc: LayoutDocument) => {
    const { updatedAt: _updatedAt, view: _view, ...rest } = doc;
    return JSON.stringify(rest);
  };
  return strip(a) === strip(b);
}
