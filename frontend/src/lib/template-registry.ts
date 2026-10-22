/**
 * 模板 Registry —— 纯类型契约 + 注册表类 + 速查工厂（无 JSX，运行期零依赖）。
 *
 * 关注点拆分（问题 14）：
 * - 本文件（.ts，纯）：类型 / CATEGORY_LABELS / TemplateRegistry 单例 / LF·TD 速查；
 * - `templates-register.tsx`：14 套内置模板注册数据 + 注册动作 + **对外唯一入口**。
 *
 * ⚠️ 业务代码请一律 import `@/lib/templates-register`：本文件不含注册动作，
 * 直接导入会得到**空 Registry**（编译期不报错、运行期模板全失踪）。
 * `scripts/check_template_sync.py` 有静态断言拦截绕过入口的导入。
 *
 * 新增模板只需改 `templates-register.tsx`，并保持与后端
 * `app/services/template_meta.py::TEMPLATE_META` 逐字段一致
 * （`scripts/check_template_sync.py` 秒级守护，pre-commit 强制）。
 */

import type React from 'react'
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

/** 版式特征速查：默认单栏 15mm 边距，按模板覆盖差异项（与后端 template_meta.layout_features 一致）
 *  导出供 templates-register.tsx 的注册数据使用（新增模板写 LF({...}) 即可获得默认值） */
export const LF = (o: Partial<TemplateLayoutFeatures> = {}): TemplateLayoutFeatures => ({
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

/** 文本默认值速查（与后端 template_meta.text_defaults 一致；academic 另带衬线字体栈）
 *  导出供 templates-register.tsx 的注册数据使用 */
export const TD = (o: Partial<TemplateTextDefaults> = {}): TemplateTextDefaults => ({
  baseFontSizePt: 10.5,
  lineHeight: 1.6,
  sectionGapMm: 6,
  ...o,
})

/** 便捷函数：按 ID 取元数据 */
export function getTemplateMeta(id: string): TemplateMetadata | undefined {
  return TemplateRegistry.get(id)
}
