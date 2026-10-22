'use client'

import React from 'react'
import {
  FileTextOutlined, BulbOutlined, StarFilled,
  ThunderboltOutlined, CrownOutlined,
  RocketOutlined, ExperimentOutlined, HighlightOutlined,
  GlobalOutlined, FireOutlined, LayoutOutlined, ReadOutlined,
  TeamOutlined, SmileOutlined,
} from '@ant-design/icons'
import type { ResumeParseResult } from '@/types'

// ════════════════════════════════════════════════════════════════════════
// 模板元数据（Metadata）—— 全站单一事实源
// ════════════════════════════════════════════════════════════════════════

/** 模板分类（用于选择面板的分类标签过滤） */
export type TemplateCategory = 'business' | 'creative' | 'tech' | 'academic' | 'simple'

/** 预览渲染模式 */
export type TemplateRenderMode =
  /** 纯 CSS 模拟预览（轻量，无真实排版） */
  | 'css'
  /** React 组件高保真预览（懒加载真实模板组件，1:1 还原 PDF 版式） */
  | 'react'

/** 主题色（语义化 Token，供预览卡片 / 预览弹窗取色） */
export interface TemplateTheme {
  /** 主色（品牌色） */
  primary: string
  /** 辅色（渐变第二色 / 深色） */
  secondary: string
  /** 预览底色 */
  bg: string
  /** 正文文字色 */
  text: string
}

/** 结构化版式特征（驱动打印分页基座，与后端 app/services/print_css.py::LayoutFeatures 同构） */
export interface TemplateLayoutFeatures {
  /** 全幅背景头部（渐变条/色块顶到纸边）→ @page margin: 0 */
  fullBleedHeader: boolean
  /** 整页深色背景 → 必须打印背景色且跨页延续 */
  darkBackground: boolean
  /** 侧栏位置（null = 无侧栏） */
  sidebarSide: 'left' | 'right' | null
  /** 侧栏宽度（mm，按 A4 210mm 折算） */
  sidebarWidthMm: number | null
  /** 侧栏是否深色底（跨页需 box-decoration-break: clone） */
  sidebarDark: boolean
  /** 是否双栏 */
  twoColumn: boolean
  /** 是否时间轴条目 */
  timeline: boolean
  /** 非全幅模板纵向页边距（mm） */
  pageMarginYMm: number
  /** 非全幅模板横向页边距（mm） */
  pageMarginXMm: number
}

/** 模板元数据接口（TypeScript 契约） */
export interface TemplateMetadata {
  /** 模板 ID（与后端 backend/app/templates/{id}.html 一一对应） */
  id: string
  /** 展示名称 */
  name: string
  /** 作者 / 来源（内置模板标注「智能简历」，迁移模板标注来源） */
  author: string
  /** 版本号（用于 PDF 文档属性注入与缓存失效） */
  version: string
  /** 分类 */
  category: TemplateCategory
  /** 适用行业 */
  industries: string[]
  /** 标签（用于标签过滤，如「双栏」「单栏」「深色」） */
  tags: string[]
  /** 主题色 */
  theme: TemplateTheme
  /** 布局类型（仅驱动选择面板的 CSS 示意图，结构性事实以 layoutFeatures 为准） */
  layout: 'dual' | 'single' | 'banner' | 'dark'
  /** 结构化版式特征（打印分页决策的唯一依据） */
  layoutFeatures: TemplateLayoutFeatures
  /** 文本默认值（主题定制的合并基线：字号/行距/章节间距，与后端 template_meta.text_defaults 一致） */
  textDefaults: TemplateTextDefaults
  /** 一句话描述 */
  desc: string
  /** 预览渲染模式 */
  renderMode: TemplateRenderMode
  /** 预览图 URL（可选；未提供时由 renderMode 决定预览方式） */
  previewImageUrl?: string
  /** 组件懒加载路径（renderMode='react' 时必填；动态 import 拆分产物） */
  lazyComponent?: () => Promise<{ default: React.ComponentType<TemplatePreviewProps> }>
  /** 面板图标 */
  icon: React.ReactNode
  /** 是否内置 */
  builtin: boolean
}

/** React 模板组件的 props 契约（jadeAI 迁移模板遵循） */
export interface TemplatePreviewProps {
  resume: ResumeParseResult
}

/** 分类中文名 */
export const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  business: '商务通用',
  creative: '创意设计',
  tech: '技术极客',
  academic: '学术严谨',
  simple: '简约清新',
}


// ════════════════════════════════════════════════════════════════════════
// TemplateRegistry —— 统一注册 / 查询 / 过滤
// ════════════════════════════════════════════════════════════════════════

export interface TemplateFilter {
  /** 分类（'all' = 不限） */
  category?: TemplateCategory | 'all'
  /** 标签（命中任一标签即保留） */
  tags?: string[]
  /** 关键词（匹配 id / name / desc / industries / tags） */
  query?: string
}

class TemplateRegistryImpl {
  private items = new Map<string, TemplateMetadata>()
  private listeners = new Set<() => void>()

  /** 注册模板（同 id 重复注册时后者覆盖前者，便于热更新 / 测试） */
  register(meta: TemplateMetadata): void {
    this.items.set(meta.id, meta)
    this.emit()
  }

  /** 批量注册 */
  registerAll(metas: TemplateMetadata[]): void {
    metas.forEach((m) => this.items.set(m.id, m))
    this.emit()
  }

  /** 按 ID 取模板；不存在返回 undefined */
  get(id: string): TemplateMetadata | undefined {
    return this.items.get(id)
  }

  /** 必须存在，否则抛错（供渲染路由使用） */
  getRequired(id: string): TemplateMetadata {
    const meta = this.items.get(id)
    if (!meta) {
      throw new Error(`[TemplateRegistry] 未注册的模板 ID: ${id}`)
    }
    return meta
  }

  /** 全量列表（注册顺序） */
  list(): TemplateMetadata[] {
    return Array.from(this.items.values())
  }

  /** 按分类过滤 */
  byCategory(category: TemplateCategory | 'all'): TemplateMetadata[] {
    if (category === 'all') return this.list()
    return this.list().filter((t) => t.category === category)
  }

  /** 全部标签（去重，供过滤面板） */
  allTags(): string[] {
    const set = new Set<string>()
    this.list().forEach((t) => t.tags.forEach((tag) => set.add(tag)))
    return Array.from(set).sort()
  }

  /** 全部适用行业（去重） */
  allIndustries(): string[] {
    const set = new Set<string>()
    this.list().forEach((t) => t.industries.forEach((i) => set.add(i)))
    return Array.from(set).sort()
  }

  /** 组合过滤：分类 + 标签 + 关键词 */
  filter(filter: TemplateFilter): TemplateMetadata[] {
    const { category = 'all', tags, query } = filter
    const q = (query || '').trim().toLowerCase()
    return this.list().filter((t) => {
      if (category !== 'all' && t.category !== category) return false
      if (tags && tags.length > 0 && !tags.some((tag) => t.tags.includes(tag))) return false
      if (q) {
        const haystack = [t.id, t.name, t.desc, t.author, ...t.industries, ...t.tags]
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }

  /** 订阅变更（注册热更新时通知） */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn())
  }
}

/** 全局单例 */
export const TemplateRegistry = new TemplateRegistryImpl()

/** 模板文本默认值（主题定制基线，与后端 template_meta.text_defaults 逐字段一致） */
export interface TemplateTextDefaults {
  /** 正文字号（pt） */
  baseFontSizePt: number
  /** 正文行距 */
  lineHeight: number
  /** 章节间距（mm） */
  sectionGapMm: number
  /** 模板自有字体栈（academic 为衬线栈；其余为默认无衬线栈） */
  fontFamily?: string
}

/** 版式特征速查：默认单栏 15mm 边距，按模板覆盖差异项（与后端 template_meta.layout_features 一致） */
const LF = (o: Partial<TemplateLayoutFeatures> = {}): TemplateLayoutFeatures => ({
  fullBleedHeader: false,
  darkBackground: false,
  sidebarSide: null,
  sidebarWidthMm: null,
  sidebarDark: false,
  twoColumn: false,
  timeline: false,
  pageMarginYMm: 15,
  pageMarginXMm: 15,
  ...o,
})

/** 文本默认值速查（与后端 template_meta.text_defaults 一致；academic 另带衬线字体栈） */
const TD = (o: Partial<TemplateTextDefaults> = {}): TemplateTextDefaults => ({
  baseFontSizePt: 10.5,
  lineHeight: 1.6,
  sectionGapMm: 6,
  ...o,
})

/** 便捷函数：按 ID 取元数据 */
export function getTemplateMeta(id: string): TemplateMetadata | undefined {
  return TemplateRegistry.get(id)
}

// ════════════════════════════════════════════════════════════════════════
// 注册内置模板（12 套自有 + 2 套 jadeAI 迁移）
// ════════════════════════════════════════════════════════════════════════

TemplateRegistry.registerAll([
  {
    id: 'professional',
    name: '专业分栏',
    author: '智能简历',
    version: '1.0.0',
    category: 'business',
    industries: ['通用', '互联网', '金融'],
    tags: ['双栏', '商务'],
    theme: { primary: '#2c6fbb', secondary: '#1a5276', bg: '#ffffff', text: '#333333' },
    layout: 'single',
    layoutFeatures: LF(),
    textDefaults: TD({ baseFontSizePt: 11, lineHeight: 1.6, sectionGapMm: 4.2 }),
    desc: '蓝色主题双栏布局，左侧联系信息右侧工作经历',
    renderMode: 'css',
    icon: <FileTextOutlined />,
    builtin: true,
  },
  {
    id: 'simple',
    name: '简约单栏',
    author: '智能简历',
    version: '1.0.0',
    category: 'simple',
    industries: ['通用', '行政', '教育'],
    tags: ['单栏', '极简'],
    theme: { primary: '#444444', secondary: '#dddddd', bg: '#ffffff', text: '#444444' },
    layout: 'single',
    layoutFeatures: LF({ pageMarginYMm: 18, pageMarginXMm: 18 }),
    textDefaults: TD({ baseFontSizePt: 10.5, lineHeight: 1.7, sectionGapMm: 4.8 }),
    desc: '极简单栏居中，浅灰色调，适合内容简洁的简历',
    renderMode: 'css',
    icon: <BulbOutlined />,
    builtin: true,
  },
  {
    id: 'modern',
    name: '现代渐变',
    author: '智能简历',
    version: '1.0.0',
    category: 'creative',
    industries: ['互联网', '市场', '运营'],
    tags: ['横幅', '渐变'],
    theme: { primary: '#2c6fbb', secondary: '#3498db', bg: '#ffffff', text: '#333333' },
    layout: 'banner',
    layoutFeatures: LF({ fullBleedHeader: true, sidebarSide: 'left', sidebarWidthMm: 71.4, twoColumn: true }),
    textDefaults: TD({ baseFontSizePt: 10.5, lineHeight: 1.6, sectionGapMm: 4.8 }),
    desc: '蓝色渐变顶部横幅，左侧技能标签右侧工作经历',
    renderMode: 'css',
    icon: <StarFilled />,
    builtin: true,
  },
  {
    id: 'ocean',
    name: '海洋之蓝',
    author: '智能简历',
    version: '1.0.0',
    category: 'business',
    industries: ['互联网', '制造业', '咨询'],
    tags: ['横幅', '渐变', '清爽'],
    theme: { primary: '#0e7490', secondary: '#0c4a6e', bg: '#f0f9ff', text: '#334155' },
    layout: 'banner',
    layoutFeatures: LF({ fullBleedHeader: true, sidebarSide: 'left', sidebarWidthMm: 67.2, twoColumn: true }),
    textDefaults: TD({ baseFontSizePt: 10, lineHeight: 1.6, sectionGapMm: 4.2 }),
    desc: '青蓝渐变顶部，清爽干练，适合互联网与制造业岗位',
    renderMode: 'css',
    icon: <GlobalOutlined />,
    builtin: true,
  },
  {
    id: 'sunset',
    name: '暖阳落日',
    author: '智能简历',
    version: '1.0.0',
    category: 'creative',
    industries: ['运营', '市场', '创意'],
    tags: ['横幅', '暖色'],
    theme: { primary: '#ea580c', secondary: '#9a3412', bg: '#fffbeb', text: '#44403c' },
    layout: 'banner',
    layoutFeatures: LF({ fullBleedHeader: true, sidebarSide: 'left', sidebarWidthMm: 67.2, twoColumn: true }),
    textDefaults: TD({ baseFontSizePt: 10, lineHeight: 1.6, sectionGapMm: 4.2 }),
    desc: '暖橙渐变顶部，亲和有活力，适合运营市场与创意岗位',
    renderMode: 'css',
    icon: <FireOutlined />,
    builtin: true,
  },
  {
    id: 'violet',
    name: '紫韵流光',
    author: '智能简历',
    version: '1.0.0',
    category: 'creative',
    industries: ['设计', '互联网', '传媒'],
    tags: ['双栏', '时间轴'],
    theme: { primary: '#7c3aed', secondary: '#4c1d95', bg: '#faf5ff', text: '#3f3f46' },
    layout: 'dual',
    layoutFeatures: LF({ fullBleedHeader: true, sidebarSide: 'left', sidebarWidthMm: 71.4, sidebarDark: true, twoColumn: true, timeline: true }),
    textDefaults: TD({ baseFontSizePt: 10, lineHeight: 1.6, sectionGapMm: 4.8 }),
    desc: '深紫侧边栏+时间轴条目，兼具设计感与专业性',
    renderMode: 'css',
    icon: <LayoutOutlined />,
    builtin: true,
  },
  {
    id: 'academic',
    name: '学术严谨',
    author: '智能简历',
    version: '1.0.0',
    category: 'academic',
    industries: ['学术', '国企', '科研'],
    tags: ['单栏', '衬线', '正式'],
    theme: { primary: '#1e3a5f', secondary: '#6b7280', bg: '#ffffff', text: '#1f2937' },
    layout: 'single',
    layoutFeatures: LF({ fullBleedHeader: true }),
    textDefaults: TD({ baseFontSizePt: 10, lineHeight: 1.65, sectionGapMm: 4.2, fontFamily: "Georgia, 'Times New Roman', 'Noto Sans SC', 'Microsoft YaHei', serif" }),
    desc: '衬线字体单栏版式，双线页眉，适合学术、国企与严肃场合',
    renderMode: 'css',
    icon: <ReadOutlined />,
    builtin: true,
  },
  {
    id: 'compact',
    name: '紧凑高效',
    author: '智能简历',
    version: '1.0.0',
    category: 'simple',
    industries: ['技术', '通用'],
    tags: ['单栏', '高密度'],
    theme: { primary: '#111111', secondary: '#333333', bg: '#ffffff', text: '#333333' },
    layout: 'single',
    layoutFeatures: LF({ timeline: true, pageMarginYMm: 12, pageMarginXMm: 15 }),
    textDefaults: TD({ baseFontSizePt: 9.5, lineHeight: 1.5, sectionGapMm: 2.6 }),
    desc: '最大信息密度，时间线排版，适合内容丰富的简历',
    renderMode: 'css',
    icon: <ThunderboltOutlined />,
    builtin: true,
  },
  {
    id: 'elegant',
    name: '优雅金边',
    author: '智能简历',
    version: '1.0.0',
    category: 'business',
    industries: ['金融', '高管', '咨询'],
    tags: ['双栏', '高端'],
    theme: { primary: '#c9a962', secondary: '#2d2d2d', bg: '#ffffff', text: '#3a3a3a' },
    layout: 'dual',
    layoutFeatures: LF({ fullBleedHeader: true, sidebarSide: 'left', sidebarWidthMm: 63, sidebarDark: true, twoColumn: true }),
    textDefaults: TD({ baseFontSizePt: 10, lineHeight: 1.7, sectionGapMm: 2.1 }),
    desc: '深色侧边栏+金色点缀，高端商务风格',
    renderMode: 'css',
    icon: <CrownOutlined />,
    builtin: true,
  },
  {
    id: 'dark',
    name: '深色科技',
    author: '智能简历',
    version: '1.0.0',
    category: 'tech',
    industries: ['技术', '互联网', '游戏'],
    tags: ['深色', '霓虹'],
    theme: { primary: '#00d4ff', secondary: '#0d1117', bg: '#0d1117', text: '#e0e0e0' },
    layout: 'dark',
    layoutFeatures: LF({ fullBleedHeader: true, darkBackground: true }),
    textDefaults: TD({ baseFontSizePt: 10, lineHeight: 1.6, sectionGapMm: 3.7 }),
    desc: '深色背景+霓虹蓝点缀，科技感十足，适合技术岗',
    renderMode: 'css',
    icon: <RocketOutlined />,
    builtin: true,
  },
  {
    id: 'fresh',
    name: '清新绿意',
    author: '智能简历',
    version: '1.0.0',
    category: 'simple',
    industries: ['教育', '医疗', '公益'],
    tags: ['横幅', '自然'],
    theme: { primary: '#2d6a4f', secondary: '#52b788', bg: '#fafcf8', text: '#3a5a40' },
    layout: 'banner',
    layoutFeatures: LF({ fullBleedHeader: true, sidebarSide: 'left', sidebarWidthMm: 67.2, twoColumn: true }),
    textDefaults: TD({ baseFontSizePt: 10, lineHeight: 1.6, sectionGapMm: 4.2 }),
    desc: '绿色渐变顶部，自然清新风格，双栏布局',
    renderMode: 'css',
    icon: <ExperimentOutlined />,
    builtin: true,
  },
  {
    id: 'classic',
    name: '经典黑白',
    author: '智能简历',
    version: '1.0.0',
    category: 'academic',
    industries: ['通用', '国企', '公务'],
    tags: ['单栏', '正式', '黑白'],
    theme: { primary: '#000000', secondary: '#555555', bg: '#ffffff', text: '#1a1a1a' },
    layout: 'single',
    layoutFeatures: LF({ pageMarginYMm: 15, pageMarginXMm: 18 }),
    textDefaults: TD({ baseFontSizePt: 10, lineHeight: 1.6, sectionGapMm: 3.7 }),
    desc: '黑白极简，传统正式风格，粗线分隔，适合严肃场合',
    renderMode: 'css',
    icon: <HighlightOutlined />,
    builtin: true,
  },
  // ── jadeAI 迁移模板（React 组件高保真预览 + 后端 Jinja 双实现）──
  {
    id: 'jade-classic',
    name: '经典单栏专业版',
    author: 'jadeAI (twwch/JadeAI) 迁移',
    version: '1.0.0',
    category: 'business',
    industries: ['通用', '互联网', '金融', '咨询'],
    tags: ['单栏', 'ATS 友好', '经典'],
    theme: { primary: '#1f2937', secondary: '#6b7280', bg: '#ffffff', text: '#1f2937' },
    layout: 'single',
    layoutFeatures: LF({ pageMarginYMm: 15, pageMarginXMm: 16 }),
    textDefaults: TD({ baseFontSizePt: 10, lineHeight: 1.6, sectionGapMm: 3.2 }),
    desc: 'jadeAI 经典单栏：深灰标题 + 细分隔线 + 圆点条目，ATS 解析最友好',
    renderMode: 'react',
    lazyComponent: () => import('@/components/templates/jade-classic'),
    icon: <TeamOutlined />,
    builtin: false,
  },
  {
    id: 'jade-twocol',
    name: '现代双栏创意版',
    author: 'jadeAI (twwch/JadeAI) 迁移',
    version: '1.0.0',
    category: 'creative',
    industries: ['设计', '互联网', '产品', '传媒'],
    tags: ['双栏', '渐变侧栏', '创意'],
    theme: { primary: '#2563eb', secondary: '#1e3a8a', bg: '#ffffff', text: '#1f2937' },
    layout: 'dual',
    layoutFeatures: LF({ fullBleedHeader: true, sidebarSide: 'left', sidebarWidthMm: 73.5, sidebarDark: true, twoColumn: true, timeline: true }),
    textDefaults: TD({ baseFontSizePt: 10, lineHeight: 1.6, sectionGapMm: 0.8 }),
    desc: 'jadeAI 现代双栏：左侧渐变信息栏 + 右侧时间轴，兼顾设计感与可读性',
    renderMode: 'react',
    lazyComponent: () => import('@/components/templates/jade-twocol'),
    icon: <SmileOutlined />,
    builtin: false,
  },
])
