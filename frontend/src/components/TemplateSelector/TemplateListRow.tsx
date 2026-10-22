'use client'

/**
 * 列表视图模板行（从 TemplateSelector.tsx 的 renderCard 拆出，问题 14）。
 * 与 TemplateGridCard 共用 cardStyles.cardStyleFor 保持视觉一致。
 */

import React from 'react'
import { Card, Col, Typography, Tag } from 'antd'
import { CheckCircleFilled, EyeOutlined } from '@ant-design/icons'
import { CATEGORY_LABELS, type TemplateMetadata } from '@/lib/templates-register'
import { MiniPreview } from './MiniPreview'
import { cardStyleFor } from './cardStyles'
import type { TemplateOption } from './types'

interface TemplateListRowProps {
  option: TemplateOption
  meta: TemplateMetadata | undefined
  selected: boolean
  isDark: boolean
  /** 点击行：父组件负责 onSelect(key) + 关闭主弹窗 */
  onSelect: () => void
  /** 点击预览眼睛：父组件负责 stopPropagation + 打开预览弹窗 */
  onPreview: (e: React.MouseEvent) => void
}

export function TemplateListRow({
  option, meta, selected, isDark, onSelect, onPreview,
}: TemplateListRowProps) {
  return (
    <Col xs={24}>
      <Card
        hoverable
        size="small"
        style={cardStyleFor(option, selected, isDark)}
        styles={{ body: { padding: '10px 12px' } }}
        onClick={onSelect}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 72, flexShrink: 0 }}>
            <MiniPreview preview={option.preview} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Typography.Text strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{option.label}</Typography.Text>
              {meta && <Tag style={{ fontSize: 10, borderRadius: 6 }}>{CATEGORY_LABELS[meta.category]}</Tag>}
              {selected && (
                <Tag color="blue" style={{ fontSize: 10, borderRadius: 6 }}>
                  <CheckCircleFilled style={{ marginRight: 4 }} />当前使用中
                </Tag>
              )}
            </div>
            <Typography.Text style={{
              fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              overflow: 'hidden', marginTop: 2,
            }}>
              {option.preview.desc}
            </Typography.Text>
            {meta && (
              <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {meta.industries.slice(0, 3).map((i) => (
                  <Tag key={i} style={{ fontSize: 10, borderRadius: 6, margin: 0 }}>{i}</Tag>
                ))}
              </div>
            )}
          </div>
          <EyeOutlined
            onClick={onPreview}
            title="预览"
            style={{ fontSize: 16, color: isDark ? '#AEAEB2' : '#6B7280', padding: 8, flexShrink: 0 }}
          />
        </div>
      </Card>
    </Col>
  )
}
