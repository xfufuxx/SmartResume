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
 * - personal_info.avatar 有值时生成右上角头像块（30×42mm 一寸照比例，freedom=free
 *   可任意拖拽/缩放；source=personal_info.avatar，行内改 URL 经 rebuildContent 回写）。
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
/** 职业照块默认尺寸：30×42mm（5:7 一寸照比例），固定页面右上角 */
const AVATAR_WIDTH_MM = 30;
const AVATAR_HEIGHT_MM = 42;

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
  /** 自定义宽度（mm）：有职业照时头部区收窄为左栏，避免与右上角头像矩形重叠 */
  w?: number;
  /** 固定坐标块（职业照）：不参与垂直流，直接落在指定位置 */
  fixed?: { x: number; y: number; w: number; h: number };
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
    wOverride?: number,
  ): void => {
    drafts.push({ id, type, h: roundMm(h), source, payload, overrides, keepNext, w: wOverride });
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
  const avatarUrl = typeof personal?.avatar === 'string' ? personal.avatar.trim() : '';

  // 有职业照时：头像占右上角 30×42mm，头部区（姓名/联系方式）收窄为左栏
  // （146mm），分隔线起的内容流下探到头像底部+gap——矩形零重叠，
  // validateLayout 不报重叠警告，默认布局依旧「开箱干净」。
  const avatarX = roundMm(canvas.width - margin - AVATAR_WIDTH_MM);
  const headW = avatarUrl ? roundMm(avatarX - margin - gap) : w;

  // 头部：姓名 → 联系方式 → 分隔线
  if (personal && hasText(personal.name)) {
    push(
      'blk_header',
      'header',
      autoHeight('header', headW, personal, HEADER_HEIGHT_MM, 0, 'personal_info.name'),
      'personal_info.name',
      personal,
      undefined,
      false,
      headW,
    );
  }
  if (personal && (hasText(personal.email) || hasText(personal.phone))) {
    push(
      'blk_contact',
      'contact',
      autoHeight('contact', headW, personal, CONTACT_HEIGHT_MM, 0, 'personal_info'),
      'personal_info',
      personal,
      undefined,
      false,
      headW,
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

  // 职业照：固定页面右上角（不参与垂直流；无照片不生成，版式与无头像时一致）。
  // 放在 drafts 末尾 = blocks 数组末尾 = z 序最上，压住可能很长的联系方式行。
  if (avatarUrl) {
    drafts.push({
      id: 'blk_avatar',
      type: 'avatar',
      h: AVATAR_HEIGHT_MM,
      source: 'personal_info.avatar',
      payload: { url: avatarUrl },
      fixed: { x: avatarX, y: margin, w: AVATAR_WIDTH_MM, h: AVATAR_HEIGHT_MM },
    });
  }

  // ── 阶段二：流式分页 ──
  const safeBottom = roundMm(canvas.height - margin);
  const blocks: Block[] = [];
  let page = 0;
  // 固定块（职业照）把垂直流的下探线压到其底部+gap：头部区（姓名/联系方式）
  // 收窄成左栏与头像并行，其余通栏块必须整块让位，否则矩形重叠会进 validate 警告。
  const flowFloor = drafts.reduce(
    (floor, d) => (d.fixed ? Math.max(floor, roundMm(d.fixed.y + d.fixed.h + gap)) : floor),
    margin,
  );
  let y = margin;

  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i];
    const defaults = defaultsForTypeClone(d.type);
    const bw = d.w ?? w;
    // 固定坐标块（职业照）：不占垂直流，直接落在指定位置（默认第 0 页右上角）
    if (d.fixed) {
      blocks.push({
        id: d.id,
        type: d.type,
        page: 0,
        rect: { x: d.fixed.x, y: d.fixed.y, w: d.fixed.w, h: d.fixed.h },
        freedom: d.overrides?.freedom ?? defaults.freedom,
        sizePolicy: d.overrides?.sizePolicy ?? defaults.sizePolicy,
        contentRef: { source: d.source, payload: d.payload },
        ...(d.overrides?.style ? { style: d.overrides.style } : {}),
      });
      continue;
    }
    // 窄栏块（头部区）与头像并行；通栏块下探到头像底部之下
    if (d.w === undefined && y < flowFloor) y = flowFloor;
    // keep-with-next：与后一个块合计放不下且本页已有内容 → 一起翻页
    const followH = d.keepNext ? drafts[i + 1]?.h ?? 0 : 0;
    const need = followH > 0 ? roundMm(d.h + gap + followH) : d.h;
    const pageHasContent = blocks.some((b) => b.page === page);
    if (pageHasContent && roundMm(y + need) > safeBottom + 0.01) {
      page += 1;
      y = margin;
    }
    blocks.push({
      id: d.id,
      type: d.type,
      page,
      rect: { x, y: roundMm(y), w: bw, h: d.h },
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
