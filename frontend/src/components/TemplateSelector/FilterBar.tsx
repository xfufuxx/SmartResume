'use client'

/**
 * 选择器工具栏：视图切换 + 分类 Tabs（带计数）+ 搜索框。
 * 从 TemplateSelector.tsx 拆出（问题 14）——纯展示组件，状态全部由父组件持有。
 */

import { Segmented, Tabs, Input } from 'antd'
import type { CSSProperties } from 'react'
import { SearchOutlined, AppstoreOutlined, BarsOutlined } from '@ant-design/icons'
import {
  TemplateRegistry,
  CATEGORY_LABELS,
  type TemplateCategory,
} from '@/lib/templates-register'
import type { TemplateOption, ViewMode } from './types'

/** 分类计数样式：弱化的普通数字，不用红色 pill（深色主题下红底白字很突兀） */
const countStyle: CSSProperties = {
  marginLeft: 4,
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--text-secondary)',
}

interface FilterBarProps {
  view: ViewMode
  onViewChange: (v: ViewMode) => void
  category: TemplateCategory | 'all'
  onCategoryChange: (c: TemplateCategory | 'all') => void
  query: string
  onQueryChange: (q: string) => void
  /** 用于分类计数（registry 元数据增强） */
  options: TemplateOption[]
}

export function FilterBar({
  view, onViewChange,
  category, onCategoryChange,
  query, onQueryChange,
  options,
}: FilterBarProps) {
  const categoryCount = (k: TemplateCategory) =>
    options.filter((o) => TemplateRegistry.get(o.key)?.category === k).length

  return (
    <>
      {/* ── 工具栏：视图切换 + 分类 + 搜索 ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 14 }}>
        <Segmented
          value={view}
          onChange={(v) => onViewChange(v as ViewMode)}
          options={[
            { label: '网格', value: 'grid', icon: <AppstoreOutlined /> },
            { label: '列表', value: 'list', icon: <BarsOutlined /> },
          ]}
        />
        <Tabs
          size="small"
          activeKey={category}
          onChange={(k) => onCategoryChange(k as TemplateCategory | 'all')}
          items={[
            {
              key: 'all',
              label: (
                <span>
                  全部<span style={countStyle}>{options.length || 0}</span>
                </span>
              ),
            },
            ...(Object.keys(CATEGORY_LABELS) as TemplateCategory[]).map((k) => ({
              key: k,
              label: (
                <span key={k}>
                  {CATEGORY_LABELS[k]}<span style={countStyle}>{categoryCount(k)}</span>
                </span>
              ),
            })),
          ]}
          style={{ flex: 1, minWidth: 280 }}
        />
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="搜索模板 / 行业 / 标签"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          style={{ width: 220 }}
        />
      </div>
    </>
  )
}
