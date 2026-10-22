'use client'

/**
 * 模板预览弹窗（画廊页复用：onUse 交由调用方实现「使用此模板」闭环）。
 *
 * 从 616 行的 TemplateSelector.tsx 拆出（问题 14）：弹窗 + 两种预览模式
 * （CSS 示意图 / iframe 真实排版 / React 组件高保真）自成一个文件。
 */

import React, { useEffect, useState } from 'react'
import { Modal, Typography, Tag, Tabs, Empty, Spin } from 'antd'
import { useTheme } from '@/lib/theme'
import { CATEGORY_LABELS, type TemplateMetadata } from '@/lib/templates-register'
import { DEMO_RESUME } from '@/lib/template-demo-data'
import { MiniPreview, LargeCssPreview } from './MiniPreview'
import type { TemplateOption } from './types'

/** React 组件高保真预览（懒加载真实模板组件） */
function ReactTemplatePreview({ meta }: { meta: TemplateMetadata }) {
  const [Comp, setComp] = useState<React.ComponentType<{ resume: typeof DEMO_RESUME }> | null>(null)
  const [error, setError] = useState<string | null>(null)

  React.useEffect(() => {
    let alive = true
    setComp(null)
    setError(null)
    if (!meta.lazyComponent) {
      setError('该模板未注册懒加载组件')
      return
    }
    meta
      .lazyComponent()
      .then((mod) => {
        if (alive) setComp(() => mod.default)
      })
      .catch((e) => {
        if (alive) setError(String(e))
      })
    return () => {
      alive = false
    }
  }, [meta])

  if (error) return <Empty description={`组件加载失败：${error}`} />
  if (!Comp) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 360 }}>
        <Spin tip="正在加载模板组件…" />
      </div>
    )
  }
  return (
    <div
      style={{
        border: '1px solid rgba(0,0,0,0.08)',
        borderRadius: 8,
        overflow: 'auto',
        maxHeight: 480,
        background: '#fff',
      }}
    >
      <Comp resume={DEMO_RESUME} />
    </div>
  )
}

export function TemplatePreviewModal({
  meta,
  option,
  open,
  onClose,
  afterClose,
  onUse,
}: {
  meta: TemplateMetadata | undefined
  option: TemplateOption
  open: boolean
  onClose: () => void
  /** 关闭动画播放完毕（antd Modal afterClose） */
  afterClose?: () => void
  onUse: () => void
}) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const isReactMode = meta?.renderMode === 'react'
  const [tab, setTab] = useState<'sketch' | 'real'>('sketch')

  return (
    <Modal
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {meta?.icon || option.icon}
          <span>{option.label} · 预览</span>
          {isReactMode && <Tag color="green">高保真</Tag>}
          {!isReactMode && <Tag>示意图</Tag>}
        </span>
      }
      open={open}
      onCancel={onClose}
      afterClose={afterClose}
      width={760}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {meta ? `作者：${meta.author} · 版本 v${meta.version}` : ''}
          </Typography.Text>
          <button
            type="button"
            onClick={onUse}
            style={{
              border: 'none',
              borderRadius: 8,
              padding: '6px 18px',
              background: option.preview.primary,
              color: '#fff',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            使用此模板
          </button>
        </div>
      }
    >
      <Typography.Paragraph style={{ color: isDark ? '#bbb' : '#666', fontSize: 13 }}>
        {option.preview.desc}
      </Typography.Paragraph>

      {isReactMode ? (
        <ReactTemplatePreview meta={meta!} />
      ) : (
        <Tabs
          activeKey={tab}
          onChange={(k) => setTab(k as 'sketch' | 'real')}
          items={[
            {
              key: 'sketch',
              label: '示意图',
              children: (
                <div
                  style={{
                    border: '1px solid rgba(0,0,0,0.08)',
                    borderRadius: 8,
                    background: '#fff',
                    padding: 20,
                    minHeight: 360,
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'center',
                  }}
                >
                  <div style={{ width: 300 }}>
                    <LargeCssPreview preview={option.preview} />
                  </div>
                </div>
              ),
            },
            {
              key: 'real',
              label: '真实排版',
              children: (
                <iframe
                  title={`${option.label} 真实排版预览`}
                  src={`/api/templates/${option.key}/preview`}
                  loading="lazy"
                  style={{
                    width: '100%',
                    height: 480,
                    border: '1px solid rgba(0,0,0,0.08)',
                    borderRadius: 8,
                    background: '#fff',
                  }}
                />
              ),
            },
          ]}
        />
      )}

      {meta && (
        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <Tag color="blue">{CATEGORY_LABELS[meta.category]}</Tag>
          {meta.industries.map((i) => (
            <Tag key={i}>{i}</Tag>
          ))}
          {meta.tags.map((t) => (
            <Tag key={t} color="geekblue">
              #{t}
            </Tag>
          ))}
        </div>
      )}
    </Modal>
  )
}
