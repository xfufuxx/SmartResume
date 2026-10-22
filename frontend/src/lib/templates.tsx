'use client'

import type { TemplateOption } from '@/components/TemplateSelector'
import { TemplateRegistry } from './template-registry'

/**
 * 全站简历模板清单（兼容层，数据来自 TemplateRegistry 单一事实源）。
 *
 * 新代码请直接使用：
 *   import { TemplateRegistry } from '@/lib/template-registry'
 * 本文件保留 TEMPLATE_OPTIONS / TEMPLATE_LABELS / DEFAULT_TEMPLATE 三个导出，
 * 供尚未迁移的旧调用方使用；key 与后端 backend/app/templates/{key}.html 一一对应。
 */

/** key → 展示名（下拉 / 按钮文案等非卡片场景使用） */
export const TEMPLATE_LABELS: Record<string, string> = Object.fromEntries(
  TemplateRegistry.list().map((t) => [t.id, t.name]),
)

/** 默认模板 */
export const DEFAULT_TEMPLATE = 'professional'

/** 全量模板选项（顺序 = 注册顺序） */
export const TEMPLATE_OPTIONS: TemplateOption[] = TemplateRegistry.list().map((t) => ({
  key: t.id,
  label: t.name,
  icon: t.icon,
  preview: {
    primary: t.theme.primary,
    secondary: t.theme.secondary,
    bg: t.theme.bg,
    text: t.theme.text,
    layout: t.layout,
    desc: t.desc,
  },
}))
