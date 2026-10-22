import type { ReactNode } from 'react'

/** 模板选择器选项（与 lib/templates.tsx::TEMPLATE_OPTIONS 元素同构，由 registry 派生） */
export interface TemplateOption {
  key: string
  label: string
  icon: ReactNode
  /** 预览卡片颜色信息 */
  preview: {
    primary: string
    secondary: string
    bg: string
    text: string
    layout: 'dual' | 'single' | 'banner' | 'dark'
    desc: string
  }
}

/** 选择器视图模式 */
export type ViewMode = 'grid' | 'list'
