'use client'

/**
 * 模板选择器主组件（问题 14 拆分后只保留：过滤状态 + 卡片分发 + 弹窗编排）。
 *
 * 子组件：
 * - FilterBar：工具栏（视图/分类/标签/搜索）
 * - TemplateGridCard / TemplateListRow：两种视图的卡片
 * - PreviewModal：预览弹窗（CSS 示意图 / iframe 真实排版 / React 高保真）
 */

import React, { useMemo, useRef, useState } from 'react'
import { Modal, Typography, Row, Empty } from 'antd'
import { EyeOutlined } from '@ant-design/icons'
import { useTheme } from '@/lib/theme'
import {
  TemplateRegistry,
  type TemplateMetadata,
  type TemplateCategory,
} from '@/lib/templates-register'
import { FilterBar } from './FilterBar'
import { TemplateGridCard } from './TemplateGridCard'
import { TemplateListRow } from './TemplateListRow'
import { TemplatePreviewModal } from './PreviewModal'
import type { TemplateOption, ViewMode } from './types'

interface TemplateSelectorProps {
  open: boolean
  onClose: () => void
  selected: string
  onSelect: (key: string) => void
  options: TemplateOption[]
}

export default function TemplateSelector({
  open, onClose, selected, onSelect, options,
}: TemplateSelectorProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [view, setView] = useState<ViewMode>('grid')
  const [category, setCategory] = useState<TemplateCategory | 'all'>('all')
  const [query, setQuery] = useState('')
  const [previewKey, setPreviewKey] = useState<string | null>(null)
  /** 「使用此模板」时：预览弹窗先关，动画结束后再关主弹窗（避免同时关闭动画互撞） */
  const [pendingMainClose, setPendingMainClose] = useState(false)

  /** 以 options 为驱动、registry 元数据为增强的过滤（保持组件对旧调用方兼容） */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return options.filter((opt) => {
      const meta = TemplateRegistry.get(opt.key)
      if (category !== 'all' && meta?.category !== category) return false
      if (q) {
        const hay = [
          opt.key, opt.label, opt.preview.desc,
          meta?.author || '', ...(meta?.industries || []),
        ].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [options, category, query])

  // 预览弹窗：可见性由 previewKey 经 open 驱动；组件常驻不随 previewKey 卸载，
  // 否则 antd Modal 在 open=true 时被直接 unmount 会跳过关闭动画、残留可见 portal DOM。
  // 用 ref 保留最后一个预览对象，供关闭动画期间继续渲染。
  const lastPreview = useRef<{ meta: TemplateMetadata | undefined; option: TemplateOption } | null>(null)
  const activeOption = previewKey ? options.find((o) => o.key === previewKey) : undefined
  if (previewKey && activeOption) {
    lastPreview.current = { meta: TemplateRegistry.get(previewKey), option: activeOption }
  }
  const shownPreview = previewKey
    ? { meta: TemplateRegistry.get(previewKey), option: activeOption as TemplateOption }
    : lastPreview.current

  return (
    <Modal
      title="选择简历模板风格"
      open={open}
      onCancel={onClose}
      footer={null}
      width={860}
      styles={{ body: { padding: '14px 20px 20px', maxHeight: '76vh', overflowY: 'auto' } }}
    >
      <FilterBar
        view={view}
        onViewChange={setView}
        category={category}
        onCategoryChange={setCategory}
        query={query}
        onQueryChange={setQuery}
        options={options}
      />

      <Typography.Paragraph style={{ marginBottom: 16, color: 'var(--text-secondary)', fontSize: 13 }}>
        共 {filtered.length} 种风格，点击卡片即可选中；点击 <EyeOutlined /> 可先预览效果。
      </Typography.Paragraph>

      {filtered.length === 0 ? (
        <Empty description="没有符合条件的模板，试试调整筛选条件" style={{ padding: '40px 0' }} />
      ) : (
        <Row gutter={[12, 12]}>
          {filtered.map((opt) => {
            const meta = TemplateRegistry.get(opt.key)
            const cardProps = {
              option: opt,
              meta,
              selected: selected === opt.key,
              isDark,
              onSelect: () => { onSelect(opt.key); onClose() },
              onPreview: (e: React.MouseEvent) => {
                e.stopPropagation()
                setPreviewKey(opt.key)
              },
            }
            return view === 'list'
              ? <TemplateListRow key={opt.key} {...cardProps} />
              : <TemplateGridCard key={opt.key} {...cardProps} />
          })}
        </Row>
      )}

      {/* ── 预览弹窗（常驻：open 驱动可见性，避免卸载跳过关闭动画） ── */}
      {shownPreview && (
        <TemplatePreviewModal
          key={shownPreview.option.key}
          meta={shownPreview.meta}
          option={shownPreview.option}
          open={!!previewKey}
          onClose={() => setPreviewKey(null)}
          afterClose={() => {
            // 预览弹窗关闭动画播完后，再关主弹窗。
            // 两个弹窗若在同一批次内同时关闭，antd 嵌套弹窗的离开动画会互相取消，
            // 导致预览弹窗 portal 残留可见（display 未被置为 none）。
            if (pendingMainClose) {
              setPendingMainClose(false)
              onClose()
            }
          }}
          onUse={() => {
            onSelect(shownPreview.option.key)
            setPendingMainClose(true)
            setPreviewKey(null)
          }}
        />
      )}
    </Modal>
  )
}
