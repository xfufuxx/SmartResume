'use client'

/**
 * 选择器工具栏：视图切换 + 分类 Tabs（带计数）+ 标签 chips + 搜索框。
 * 从 TemplateSelector.tsx 拆出（问题 14）——纯展示组件，状态全部由父组件持有。
 */

import { Segmented, Tabs, Badge, Input, Tag } from 'antd'
import { SearchOutlined, AppstoreOutlined, BarsOutlined } from '@ant-design/icons'
import {
  TemplateRegistry,
  CATEGORY_LABELS,
  type TemplateCategory,
} from '@/lib/templates-register'
import type { TemplateOption, ViewMode } from './types'

interface FilterBarProps {
  view: ViewMode
  onViewChange: (v: ViewMode) => void
  category: TemplateCategory | 'all'
  onCategoryChange: (c: TemplateCategory | 'all') => void
  tag: string | null
  onTagChange: (t: string | null) => void
  query: string
  onQueryChange: (q: string) => void
  /** 用于分类计数（registry 元数据增强） */
  options: TemplateOption[]
  /** 标签云（父组件从 options 派生，去重排序） */
  tags: string[]
}

export function FilterBar({
  view, onViewChange,
  category, onCategoryChange,
  tag, onTagChange,
  query, onQueryChange,
  options, tags,
}: FilterBarProps) {
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
            { key: 'all', label: <Badge size="small" offset={[8, 0]} count={options.length || 0} showZero={false}>全部</Badge> },
            ...(Object.keys(CATEGORY_LABELS) as TemplateCategory[]).map((k) => ({
              key: k,
              label: (
                <Badge
                  key={k}
                  size="small"
                  offset={[8, 0]}
                  count={options.filter((o) => TemplateRegistry.get(o.key)?.category === k).length}
                  showZero={false}
                >
                  {CATEGORY_LABELS[k]}
                </Badge>
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

      {/* ── 标签过滤 chips ── */}
      {tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {tags.map((t) => (
            <Tag.CheckableTag
              key={t}
              checked={tag === t}
              onChange={(checked) => onTagChange(checked ? t : null)}
            >
              #{t}
            </Tag.CheckableTag>
          ))}
        </div>
      )}
    </>
  )
}
