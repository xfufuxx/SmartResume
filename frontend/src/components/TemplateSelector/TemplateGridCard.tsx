'use client'

/**
 * 网格视图模板卡（从 TemplateSelector.tsx 的 renderCard 拆出，问题 14）。
 * 与 TemplateListRow 共用 cardStyles.cardStyleFor 保持视觉一致。
 */

import React from 'react'
import { Card, Col, Typography, Tag, Tooltip } from 'antd'
import { CheckCircleFilled, EyeOutlined } from '@ant-design/icons'
import { CATEGORY_LABELS, type TemplateMetadata } from '@/lib/templates-register'
import { MiniPreview } from './MiniPreview'
import { cardStyleFor } from './cardStyles'
import type { TemplateOption } from './types'

interface TemplateGridCardProps {
  option: TemplateOption
  meta: TemplateMetadata | undefined
  selected: boolean
  isDark: boolean
  /** 点击卡片：父组件负责 onSelect(key) + 关闭主弹窗 */
  onSelect: () => void
  /** 点击预览眼睛：父组件负责 stopPropagation + 打开预览弹窗 */
  onPreview: (e: React.MouseEvent) => void
}

export function TemplateGridCard({
  option, meta, selected, isDark, onSelect, onPreview,
}: TemplateGridCardProps) {
  const footer = (
    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        width: 28, height: 28, borderRadius: 7,
        background: selected ? option.preview.primary : isDark ? '#3A3A3C' : '#E5E7EB',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.3s, color 0.3s',
        flexShrink: 0,
      }}>
        {React.cloneElement(option.icon as React.ReactElement, {
          style: { color: selected ? '#fff' : isDark ? '#AEAEB2' : '#6B7280', fontSize: 14 }
        })}
      </span>
      <Typography.Text strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{option.label}</Typography.Text>
      {selected && (
        <Tag color="blue" style={{
          marginLeft: 'auto', fontSize: 10,
          borderRadius: 6, padding: '1px 8px',
          border: 'none',
          background: `${option.preview.primary}15`,
          color: option.preview.primary,
        }}>
          <CheckCircleFilled style={{ marginRight: 4 }} />
          当前使用中
        </Tag>
      )}
      {meta?.renderMode === 'react' && !selected && (
        <Tooltip title="支持高保真组件预览">
          <Tag style={{ marginLeft: selected ? 0 : 'auto', fontSize: 10, borderRadius: 6 }}>高保真</Tag>
        </Tooltip>
      )}
    </div>
  )

  const desc = (
    <Typography.Text style={{
      fontSize: 10, display: '-webkit-box', marginTop: 4,
      color: 'var(--text-secondary)', lineHeight: 1.35,
      WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
    }}>
      {option.preview.desc}
    </Typography.Text>
  )

  return (
    <Col xs={24} sm={12} md={6}>
      <Card
        hoverable
        size="small"
        style={cardStyleFor(option, selected, isDark)}
        styles={{ body: { padding: 10 } }}
        onClick={onSelect}
      >
        <MiniPreview preview={option.preview} />
        {footer}
        {desc}
        <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {meta ? (
            <Tag style={{ fontSize: 10, borderRadius: 6, margin: 0 }}>{CATEGORY_LABELS[meta.category]}</Tag>
          ) : <span />}
          <EyeOutlined
            onClick={onPreview}
            title="预览"
            style={{ fontSize: 14, color: isDark ? '#AEAEB2' : '#6B7280', padding: 4 }}
          />
        </div>
      </Card>
    </Col>
  )
}
