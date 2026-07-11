'use client'

import React from 'react'
import { Modal, Card, Row, Col, Typography, Tag } from 'antd'
import {
  FileTextOutlined, BulbOutlined, StarFilled,
  ThunderboltOutlined, CrownOutlined, CodeOutlined, ToolOutlined,
  RocketOutlined, ExperimentOutlined, HighlightOutlined,
} from '@ant-design/icons'

export interface TemplateOption {
  key: string
  label: string
  icon: React.ReactNode
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

interface TemplateSelectorProps {
  open: boolean
  onClose: () => void
  selected: string
  onSelect: (key: string) => void
  options: TemplateOption[]
}

/** 迷你预览卡片：用纯 CSS 模拟模板风格 */
function MiniPreview({ preview }: { preview: TemplateOption['preview'] }) {
  return (
    <div
      style={{
        width: '100%',
        height: 120,
        borderRadius: 6,
        overflow: 'hidden',
        border: '1px solid #e8e8e8',
        backgroundColor: preview.bg,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* 模拟布局 */}
      {preview.layout === 'banner' && (
        <>
          <div style={{ height: 28, background: `linear-gradient(135deg, ${preview.primary}, ${preview.secondary})` }} />
          <div style={{ flex: 1, display: 'flex' }}>
            <div style={{ width: '35%', background: '#f5f5f5', padding: 4 }}>
              <div style={{ height: 4, width: '60%', background: preview.primary, borderRadius: 2, marginBottom: 4 }} />
              <div style={{ height: 3, width: '80%', background: '#ddd', marginBottom: 2 }} />
              <div style={{ height: 3, width: '70%', background: '#ddd', marginBottom: 4 }} />
              <div style={{ height: 4, width: '50%', background: preview.primary, borderRadius: 2, marginBottom: 4 }} />
              <div style={{ height: 3, width: '75%', background: '#ddd', marginBottom: 2 }} />
            </div>
            <div style={{ flex: 1, padding: 4 }}>
              <div style={{ height: 4, width: '35%', background: preview.primary, borderRadius: 2, marginBottom: 4 }} />
              <div style={{ height: 3, width: '90%', background: '#ddd', marginBottom: 2 }} />
              <div style={{ height: 3, width: '85%', background: '#ddd', marginBottom: 2 }} />
              <div style={{ height: 3, width: '70%', background: '#ddd', marginBottom: 4 }} />
              <div style={{ height: 3, width: '88%', background: '#ddd', marginBottom: 2 }} />
            </div>
          </div>
        </>
      )}
      {preview.layout === 'dual' && (
        <div style={{ flex: 1, display: 'flex' }}>
          <div style={{ width: '32%', background: preview.primary, padding: 4, color: '#fff', fontSize: 6 }}>
            <div style={{ height: 3, width: '50%', background: 'rgba(255,255,255,0.3)', marginBottom: 4 }} />
            <div style={{ height: 2, width: '80%', background: 'rgba(255,255,255,0.2)', marginBottom: 2 }} />
            <div style={{ height: 2, width: '70%', background: 'rgba(255,255,255,0.2)', marginBottom: 4 }} />
            <div style={{ height: 3, width: '40%', background: 'rgba(255,255,255,0.3)', marginBottom: 4 }} />
            <div style={{ height: 2, width: '75%', background: 'rgba(255,255,255,0.2)', marginBottom: 2 }} />
          </div>
          <div style={{ flex: 1, padding: 4, background: '#fff' }}>
            <div style={{ height: 4, width: '30%', background: preview.primary, borderRadius: 2, marginBottom: 4 }} />
            <div style={{ height: 3, width: '90%', background: '#e8e8e8', marginBottom: 2 }} />
            <div style={{ height: 3, width: '85%', background: '#e8e8e8', marginBottom: 2 }} />
            <div style={{ height: 3, width: '70%', background: '#e8e8e8', marginBottom: 4 }} />
            <div style={{ height: 3, width: '88%', background: '#e8e8e8', marginBottom: 2 }} />
            <div style={{ height: 3, width: '60%', background: '#e8e8e8' }} />
          </div>
        </div>
      )}
      {preview.layout === 'dark' && (
        <div style={{ flex: 1, background: '#0d1117', padding: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ height: 4, width: '35%', background: preview.primary, borderRadius: 2, boxShadow: `0 0 6px ${preview.primary}44` }} />
          <div style={{ height: 2, width: '60%', background: '#30363d' }} />
          <div style={{ display: 'flex', gap: 3 }}>
            <div style={{ height: 4, width: 22, background: '#161b22', border: `1px solid ${preview.primary}44`, borderRadius: 2 }} />
            <div style={{ height: 4, width: 22, background: '#161b22', border: `1px solid ${preview.primary}44`, borderRadius: 2 }} />
          </div>
          <div style={{ height: 3, width: '90%', background: '#21262d', borderRadius: 1 }} />
          <div style={{ height: 3, width: '80%', background: '#21262d', borderRadius: 1 }} />
        </div>
      )}
      {preview.layout === 'single' && (
        <div style={{ flex: 1, padding: 8, background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{ height: 6, width: '35%', background: preview.primary, borderRadius: 2 }} />
          <div style={{ height: 2, width: '50%', background: '#ddd' }} />
          <div style={{ width: '100%', height: 1, background: '#eee' }} />
          <div style={{ height: 4, width: '80%', background: '#f0f0f0', alignSelf: 'flex-start', borderRadius: 2 }} />
          <div style={{ height: 3, width: '90%', background: '#f5f5f5', alignSelf: 'flex-start' }} />
          <div style={{ height: 3, width: '75%', background: '#f5f5f5', alignSelf: 'flex-start' }} />
          <div style={{ height: 3, width: '85%', background: '#f5f5f5', alignSelf: 'flex-start' }} />
        </div>
      )}
    </div>
  )
}

export default function TemplateSelector({
  open, onClose, selected, onSelect, options,
}: TemplateSelectorProps) {
  return (
    <Modal
      title="选择简历模板风格"
      open={open}
      onCancel={onClose}
      footer={null}
      width={780}
      bodyStyle={{ padding: '16px 20px' }}
    >
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        选择一种模板风格，生成优化后的简历将使用该样式排版。点击卡片即可选中。
      </Typography.Paragraph>

      <Row gutter={[16, 16]}>
        {options.map((opt) => {
          const isSelected = selected === opt.key
          return (
            <Col xs={24} sm={12} md={8} key={opt.key}>
              <Card
                hoverable
                size="small"
                style={{
                  cursor: 'pointer',
                  borderColor: isSelected ? opt.preview.primary : undefined,
                  borderWidth: isSelected ? 2 : 1,
                  boxShadow: isSelected ? `0 0 0 2px ${opt.preview.primary}33` : undefined,
                }}
                bodyStyle={{ padding: 10 }}
                onClick={() => { onSelect(opt.key); onClose() }}
              >
                <MiniPreview preview={opt.preview} />
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {opt.icon}
                  <Typography.Text strong style={{ fontSize: 13 }}>{opt.label}</Typography.Text>
                  {isSelected && <Tag color="blue" style={{ marginLeft: 'auto', fontSize: 10 }}>已选</Tag>}
                </div>
                <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
                  {opt.preview.desc}
                </Typography.Text>
              </Card>
            </Col>
          )
        })}
      </Row>
    </Modal>
  )
}