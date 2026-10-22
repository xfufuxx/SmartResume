import type { CSSProperties } from 'react'
import type { TemplateOption } from './types'

/**
 * 网格卡与列表行共用的卡片样式（选中态高亮 + 暗色适配）。
 * 从 TemplateSelector.tsx 的 renderCard 内联对象拆出（问题 14）——
 * 两种视图共用同一份视觉规范，避免两边各自漂移。
 */
export function cardStyleFor(opt: TemplateOption, isSelected: boolean, isDark: boolean): CSSProperties {
  return {
    cursor: 'pointer',
    borderRadius: 16,
    height: '100%',
    border: isSelected
      ? `2px solid ${opt.preview.primary}`
      : isDark ? '1px solid rgba(84, 84, 88, 0.6)' : '1px solid rgba(0, 0, 0, 0.05)',
    background: isSelected
      ? `linear-gradient(135deg, ${opt.preview.primary}08, ${opt.preview.secondary}08)`
      : isDark ? '#1C1C1E' : 'rgba(255, 255, 255, 0.85)',
    boxShadow: isSelected
      ? `0 8px 24px ${opt.preview.primary}22, 0 0 0 1px ${opt.preview.primary}33`
      : '0 4px 12px rgba(0, 0, 0, 0.06)',
    transition: 'background 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), border-color 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
  }
}
