'use client'

/**
 * 模板选择器公共入口（保持既有导入路径 `@/components/TemplateSelector` 稳定）。
 *
 * 拆分（问题 14）：
 * - TemplateSelector.tsx：主组件（过滤状态 + 卡片分发 + 弹窗编排）
 * - FilterBar.tsx：工具栏（视图 / 分类 / 标签 / 搜索）
 * - TemplateGridCard.tsx / TemplateListRow.tsx：两种视图的卡片（共用 cardStyles）
 * - PreviewModal.tsx：预览弹窗（CSS 示意图 / iframe 真实排版 / React 高保真）
 * - MiniPreview.tsx：纯 CSS 迷你预览（画廊页复用）
 * - types.ts / cardStyles.ts：共享类型与卡片样式
 */

export { default } from './TemplateSelector'
export { MiniPreview } from './MiniPreview'
export { TemplatePreviewModal } from './PreviewModal'
export type { TemplateOption, ViewMode } from './types'
