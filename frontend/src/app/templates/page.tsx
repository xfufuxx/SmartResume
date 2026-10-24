'use client'

/**
 * 模板画廊 /templates —— 模板体系的独立「橱窗」页。
 *
 * - 分类 Tabs + 标签 chips + 搜索 + 网格/列表视图，与 Modal 选择器同一套元数据
 *   （TemplateRegistry 单一事实源）；预览弹窗复用 TemplateSelector 的实现
 *   （css 示意 / iframe 真实排版 / react 高保真三模式）。
 * - 「使用此模板」闭环：
 *   - 带 `?record=<优化记录 id>` 进入：PUT /api/optimize/{id}/template 落库
 *     （服务端按记录模板重导出 PDF），成功后跳回 /history/{id}；
 *   - 无记录：跳优化页 `/?template=<id>`，由优化页带入本次会话的选择。
 */

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Card, Col, Row, Typography, Tag, Segmented, Input, Empty, Tabs, Badge,
  Tooltip, Button, message, Skeleton,
} from 'antd'
import {
  SearchOutlined, EyeOutlined, AppstoreOutlined, BarsOutlined,
  CheckCircleFilled, PictureOutlined,
} from '@ant-design/icons'
import { useTheme } from '@/lib/theme'
import {
  TemplateRegistry,
  CATEGORY_LABELS,
  type TemplateMetadata,
  type TemplateCategory,
} from '@/lib/templates-register'
import { TEMPLATE_OPTIONS, DEFAULT_TEMPLATE } from '@/lib/templates'
import { editor, optimize } from '@/lib/api'
import { MiniPreview, TemplatePreviewModal } from '@/components/TemplateSelector'

type ViewMode = 'grid' | 'list'

function GalleryInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const [view, setView] = useState<ViewMode>('grid')
  const [category, setCategory] = useState<TemplateCategory | 'all'>('all')
  const [tag, setTag] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [previewKey, setPreviewKey] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)

  /** 闭环上下文：从详情页「换模板」入口进来时带记录 id */
  const recordId = searchParams.get('record')
  const [recordTemplate, setRecordTemplate] = useState<string | null>(null)

  useEffect(() => {
    if (!recordId) {
      setRecordTemplate(null)
      return
    }
    let alive = true
    optimize
      .get(recordId)
      .then((res) => {
        if (alive) setRecordTemplate(res.data?.template || null)
      })
      .catch(() => {
        if (alive) setRecordTemplate(null)
      })
    return () => {
      alive = false
    }
  }, [recordId])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return TEMPLATE_OPTIONS.filter((opt) => {
      const meta = TemplateRegistry.get(opt.key)
      if (category !== 'all' && meta?.category !== category) return false
      if (tag && !(meta?.tags || []).includes(tag)) return false
      if (q) {
        const hay = [
          opt.key, opt.label, opt.preview.desc,
          meta?.author || '', ...(meta?.industries || []), ...(meta?.tags || []),
        ].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [category, tag, query])

  const tags = useMemo(() => {
    const set = new Set<string>()
    TEMPLATE_OPTIONS.forEach((o) => TemplateRegistry.get(o.key)?.tags.forEach((t) => set.add(t)))
    return Array.from(set).sort()
  }, [])

  /** 「使用此模板」闭环：有记录落库并跳回详情页；无记录带参进优化页 */
  const handleUse = async (key: string) => {
    if (!recordId) {
      router.push(`/?template=${encodeURIComponent(key)}`)
      return
    }
    setApplying(true)
    try {
      await editor.setTemplate(recordId, key)
      message.success(`已应用「${TemplateRegistry.get(key)?.name || key}」，正在返回记录详情…`)
      router.push(`/history/${recordId}`)
    } catch (e) {
      message.error(`应用模板失败：${(e as Error)?.message || '请稍后重试'}`)
      setApplying(false)
    }
  }

  // 预览弹窗常驻（避免 antd Modal 卸载跳过关闭动画残留 portal DOM）
  const lastPreview = useRef<{ meta: TemplateMetadata | undefined; option: (typeof TEMPLATE_OPTIONS)[number] } | null>(null)
  const activeOption = previewKey ? TEMPLATE_OPTIONS.find((o) => o.key === previewKey) : undefined
  if (previewKey && activeOption) {
    lastPreview.current = { meta: TemplateRegistry.get(previewKey), option: activeOption }
  }
  const shownPreview = previewKey
    ? { meta: TemplateRegistry.get(previewKey), option: activeOption! }
    : lastPreview.current

  const renderCard = (opt: (typeof TEMPLATE_OPTIONS)[number]) => {
    const meta = TemplateRegistry.get(opt.key)
    const isCurrent = !!recordId && recordTemplate === opt.key
    const cardStyle: React.CSSProperties = {
      cursor: 'pointer',
      borderRadius: 16,
      height: '100%',
      border: isCurrent
        ? `2px solid ${opt.preview.primary}`
        : isDark ? '1px solid rgba(84, 84, 88, 0.6)' : '1px solid rgba(0, 0, 0, 0.05)',
      background: isCurrent
        ? `linear-gradient(135deg, ${opt.preview.primary}08, ${opt.preview.secondary}08)`
        : isDark ? '#1C1C1E' : 'rgba(255, 255, 255, 0.85)',
      boxShadow: isCurrent
        ? `0 8px 24px ${opt.preview.primary}22, 0 0 0 1px ${opt.preview.primary}33`
        : '0 4px 12px rgba(0, 0, 0, 0.06)',
    }
    const openPreview = () => setPreviewKey(opt.key)

    const useBtn = (
      <Button
        type={isCurrent ? 'default' : 'primary'}
        size="small"
        disabled={applying}
        style={isCurrent ? { borderColor: opt.preview.primary, color: opt.preview.primary } : { background: opt.preview.primary }}
        onClick={(e) => {
          e.stopPropagation()
          handleUse(opt.key)
        }}
      >
        {isCurrent ? '当前使用中' : '使用此模板'}
      </Button>
    )

    if (view === 'list') {
      return (
        <Col xs={24} key={opt.key}>
          <Card hoverable size="small" style={cardStyle} styles={{ body: { padding: '12px 14px' } }} onClick={openPreview}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 88, flexShrink: 0 }}>
                <MiniPreview preview={opt.preview} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Typography.Text strong style={{
                    fontSize: 14, color: 'var(--text-primary)',
                    flex: 1, minWidth: 0,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{opt.label}</Typography.Text>
                  {meta && <Tag style={{ fontSize: 10, borderRadius: 6 }}>{CATEGORY_LABELS[meta.category]}</Tag>}
                  {meta?.renderMode === 'react' && (
                    <Tooltip title="支持高保真组件预览">
                      <Tag color="green" style={{ fontSize: 10, borderRadius: 6 }}>高保真</Tag>
                    </Tooltip>
                  )}
                </div>
                <Typography.Text style={{
                  fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  overflow: 'hidden', marginTop: 2,
                }}>
                  {opt.preview.desc}
                </Typography.Text>
                {meta && (
                  <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {meta.industries.slice(0, 4).map((i) => (
                      <Tag key={i} style={{ fontSize: 10, borderRadius: 6, margin: 0 }}>{i}</Tag>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                {useBtn}
                <EyeOutlined
                  title="预览"
                  onClick={(e) => { e.stopPropagation(); openPreview() }}
                  style={{ fontSize: 16, color: isDark ? '#AEAEB2' : '#6B7280', padding: 8 }}
                />
              </div>
            </div>
          </Card>
        </Col>
      )
    }

    return (
      <Col xs={24} sm={12} md={8} lg={6} key={opt.key}>
        <Card
          hoverable
          size="small"
          className="tpl-grid-card"
          style={cardStyle}
          styles={{ body: { padding: 12 } }}
          onClick={openPreview}
        >
          <MiniPreview preview={opt.preview} />
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Typography.Text strong style={{
              fontSize: 13, color: 'var(--text-primary)',
              flex: 1, minWidth: 0,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{opt.label}</Typography.Text>
            {meta?.renderMode === 'react' && (
              <Tooltip title="支持高保真组件预览">
                <Tag color="green" style={{ fontSize: 10, borderRadius: 6, marginLeft: 'auto', flexShrink: 0 }}>高保真</Tag>
              </Tooltip>
            )}
          </div>
          <Typography.Text style={{
            fontSize: 10, marginTop: 4, color: 'var(--text-secondary)', lineHeight: 1.35,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {opt.preview.desc}
          </Typography.Text>
          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {meta ? (
              <Tag style={{ fontSize: 10, borderRadius: 6, margin: 0 }}>{CATEGORY_LABELS[meta.category]}</Tag>
            ) : <span />}
            <EyeOutlined
              title="预览"
              onClick={(e) => { e.stopPropagation(); openPreview() }}
              style={{ fontSize: 14, color: isDark ? '#AEAEB2' : '#6B7280', padding: 4 }}
            />
          </div>
          <div style={{ marginTop: 8 }}>{useBtn}</div>
        </Card>
      </Col>
    )
  }

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '20px 20px 40px' }}>
      {/* ── 页头 ── */}
      <div style={{ marginBottom: 16 }}>
        <Typography.Title level={3} style={{ marginBottom: 4, color: 'var(--text-primary)' }}>
          <PictureOutlined style={{ marginRight: 8 }} />
          简历模板库
        </Typography.Title>
        <Typography.Text style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          共 {TEMPLATE_OPTIONS.length} 套模板，点击卡片查看大图预览；
          {recordId
            ? '当前正在为一条优化记录挑选模板，点击「使用此模板」将直接应用并返回详情。'
            : '点击「使用此模板」将带着该模板进入优化页。'}
        </Typography.Text>
      </div>

      {/* ── 工具栏 ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 14 }}>
        <Segmented
          value={view}
          onChange={(v) => setView(v as ViewMode)}
          options={[
            { label: '网格', value: 'grid', icon: <AppstoreOutlined /> },
            { label: '列表', value: 'list', icon: <BarsOutlined /> },
          ]}
        />
        <Tabs
          size="small"
          activeKey={category}
          onChange={(k) => setCategory(k as TemplateCategory | 'all')}
          items={[
            { key: 'all', label: <Badge size="small" offset={[8, 0]} count={TEMPLATE_OPTIONS.length} showZero={false}>全部</Badge> },
            ...(Object.keys(CATEGORY_LABELS) as TemplateCategory[]).map((k) => ({
              key: k,
              label: (
                <Badge
                  key={k}
                  size="small"
                  offset={[8, 0]}
                  count={TEMPLATE_OPTIONS.filter((o) => TemplateRegistry.get(o.key)?.category === k).length}
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
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: 220 }}
        />
      </div>

      {/* ── 标签 chips ── */}
      {tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {tags.map((t) => (
            <Tag.CheckableTag key={t} checked={tag === t} onChange={(checked) => setTag(checked ? t : null)}>
              #{t}
            </Tag.CheckableTag>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <Empty description="没有符合条件的模板，试试调整筛选条件" style={{ padding: '60px 0' }} />
      ) : (
        <Row gutter={[14, 14]}>{filtered.map(renderCard)}</Row>
      )}

      {/* ── 预览弹窗 ── */}
      {shownPreview && (
        <TemplatePreviewModal
          key={shownPreview.option.key}
          meta={shownPreview.meta}
          option={shownPreview.option}
          open={!!previewKey}
          onClose={() => setPreviewKey(null)}
          onUse={() => {
            const key = shownPreview.option.key
            setPreviewKey(null)
            handleUse(key)
          }}
        />
      )}
    </div>
  )
}

export default function TemplatesPage() {
  return (
    <Suspense fallback={<Skeleton active style={{ maxWidth: 1280, margin: '20px auto', padding: '0 20px' }} />}>
      <GalleryInner />
    </Suspense>
  )
}
