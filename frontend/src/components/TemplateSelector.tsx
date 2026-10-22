'use client'

import React, { useMemo, useRef, useState, Suspense } from 'react'
import {
  Modal, Card, Row, Col, Typography, Tag, Segmented, Input, Empty, Spin,
  Tabs, Badge, Tooltip,
} from 'antd'
import {
  SearchOutlined, EyeOutlined, AppstoreOutlined,
  BarsOutlined, CheckCircleFilled,
} from '@ant-design/icons'
import { useTheme } from '@/lib/theme'
import {
  TemplateRegistry,
  CATEGORY_LABELS,
  type TemplateMetadata,
  type TemplateCategory,
} from '@/lib/template-registry'
import { DEMO_RESUME } from '@/lib/template-demo-data'

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

type ViewMode = 'grid' | 'list'

/** 迷你预览卡片：用纯 CSS 模拟模板风格（画廊页复用） */
export function MiniPreview({ preview }: { preview: TemplateOption['preview'] }) {
  return (
    <div
      style={{
        width: '100%',
        height: 84,
        borderRadius: 10,
        overflow: 'hidden',
        border: '1px solid rgba(0, 0, 0, 0.06)',
        backgroundColor: preview.bg,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
      }}
    >
      {/* 模拟布局 */}
      {preview.layout === 'banner' && (
        <>
          <div style={{ height: 24, background: `linear-gradient(135deg, ${preview.primary}, ${preview.secondary})` }} />
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

/** 放大版 CSS 模拟预览（预览弹窗中 css 模式使用） */
function LargeCssPreview({ preview }: { preview: TemplateOption['preview'] }) {
  return (
    <div style={{ transform: 'scale(2.1)', transformOrigin: 'top center', width: '100%' }}>
      <MiniPreview preview={preview} />
    </div>
  )
}

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

/** 模板预览弹窗（画廊页复用：onUse 交由调用方实现「使用此模板」闭环） */
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
  const [tag, setTag] = useState<string | null>(null)
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
  }, [options, category, tag, query])

  const tags = useMemo(() => {
    const set = new Set<string>()
    options.forEach((o) => TemplateRegistry.get(o.key)?.tags.forEach((t) => set.add(t)))
    return Array.from(set).sort()
  }, [options])

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

  const renderCard = (opt: TemplateOption) => {
    const meta = TemplateRegistry.get(opt.key)
    const isSelected = selected === opt.key
    const cardStyle: React.CSSProperties = {
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

    const footer = (
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{
          width: 28, height: 28, borderRadius: 7,
          background: isSelected ? opt.preview.primary : isDark ? '#3A3A3C' : '#E5E7EB',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.3s, color 0.3s',
          flexShrink: 0,
        }}>
          {React.cloneElement(opt.icon as React.ReactElement, {
            style: { color: isSelected ? '#fff' : isDark ? '#AEAEB2' : '#6B7280', fontSize: 14 }
          })}
        </span>
        <Typography.Text strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{opt.label}</Typography.Text>
        {isSelected && (
          <Tag color="blue" style={{
            marginLeft: 'auto', fontSize: 10,
            borderRadius: 6, padding: '1px 8px',
            border: 'none',
            background: `${opt.preview.primary}15`,
            color: opt.preview.primary,
          }}>
            <CheckCircleFilled style={{ marginRight: 4 }} />
            当前使用中
          </Tag>
        )}
        {meta?.renderMode === 'react' && !isSelected && (
          <Tooltip title="支持高保真组件预览">
            <Tag style={{ marginLeft: isSelected ? 0 : 'auto', fontSize: 10, borderRadius: 6 }}>高保真</Tag>
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
        {opt.preview.desc}
      </Typography.Text>
    )

    const previewBtn = (e: React.MouseEvent) => {
      e.stopPropagation()
      setPreviewKey(opt.key)
    }

    if (view === 'list') {
      return (
        <Col xs={24} key={opt.key}>
          <Card
            hoverable
            size="small"
            style={cardStyle}
            styles={{ body: { padding: '10px 12px' } }}
            onClick={() => { onSelect(opt.key); onClose() }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 72, flexShrink: 0 }}>
                <MiniPreview preview={opt.preview} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Typography.Text strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{opt.label}</Typography.Text>
                  {meta && <Tag style={{ fontSize: 10, borderRadius: 6 }}>{CATEGORY_LABELS[meta.category]}</Tag>}
                  {isSelected && (
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
                  {opt.preview.desc}
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
                onClick={previewBtn}
                title="预览"
                style={{ fontSize: 16, color: isDark ? '#AEAEB2' : '#6B7280', padding: 8, flexShrink: 0 }}
              />
            </div>
          </Card>
        </Col>
      )
    }

    return (
      <Col xs={24} sm={12} md={6} key={opt.key}>
        <Card
          hoverable
          size="small"
          style={cardStyle}
          styles={{ body: { padding: 10 } }}
          onClick={() => { onSelect(opt.key); onClose() }}
        >
          <MiniPreview preview={opt.preview} />
          {footer}
          {desc}
          <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {meta ? (
              <Tag style={{ fontSize: 10, borderRadius: 6, margin: 0 }}>{CATEGORY_LABELS[meta.category]}</Tag>
            ) : <span />}
            <EyeOutlined
              onClick={previewBtn}
              title="预览"
              style={{ fontSize: 14, color: isDark ? '#AEAEB2' : '#6B7280', padding: 4 }}
            />
          </div>
        </Card>
      </Col>
    )
  }

  return (
    <Modal
      title="选择简历模板风格"
      open={open}
      onCancel={onClose}
      footer={null}
      width={860}
      styles={{ body: { padding: '14px 20px 20px', maxHeight: '76vh', overflowY: 'auto' } }}
    >
      {/* ── 工具栏：视图切换 + 分类 + 标签 + 搜索 ── */}
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
          onChange={(e) => setQuery(e.target.value)}
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
              onChange={(checked) => setTag(checked ? t : null)}
            >
              #{t}
            </Tag.CheckableTag>
          ))}
        </div>
      )}

      <Typography.Paragraph style={{ marginBottom: 16, color: 'var(--text-secondary)', fontSize: 13 }}>
        共 {filtered.length} 种风格，点击卡片即可选中；点击 <EyeOutlined /> 可先预览效果。
      </Typography.Paragraph>

      {filtered.length === 0 ? (
        <Empty description="没有符合条件的模板，试试调整筛选条件" style={{ padding: '40px 0' }} />
      ) : (
        <Row gutter={[12, 12]}>{filtered.map(renderCard)}</Row>
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
