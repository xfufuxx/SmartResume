'use client'

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Button, Card, Typography, Spin, message, Tabs, Badge, Dropdown,
  Checkbox, Space, Empty, Select, Switch, Row, Col,
} from 'antd'
import type { MenuProps } from 'antd'
import {
  BellOutlined, CheckCircleOutlined, DeleteOutlined, ThunderboltOutlined,
  FileTextOutlined, TrophyOutlined, InfoCircleOutlined,
  SettingOutlined, RightOutlined, MoreOutlined, MessageOutlined,
  FileSearchOutlined, RocketOutlined, CloseCircleOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import { messages } from '@/lib/api'
import { getToken } from '@/lib/auth'
import { formatDate } from '@/lib/utils'
import type { MessageItem } from '@/types'
import AppLayout from '@/components/AppLayout'
import AuthGate from '@/components/AuthGate'

const { Text } = Typography

type CategoryKey = 'all' | 'unread' | 'system' | 'optimize' | 'interview' | 'job'
type StatusFilter = 'all' | 'read' | 'unread'

interface TypeMeta {
  icon: React.ReactNode
  label: string
  colorVar: string
  bgVar: string
}

const MSG_TYPE_MAP: Record<string, TypeMeta> = {
  optimize: { icon: <ThunderboltOutlined />, label: '简历优化', colorVar: 'var(--primary-600)', bgVar: 'var(--primary-50)' },
  score: { icon: <TrophyOutlined />, label: '简历评分', colorVar: 'var(--success-600)', bgVar: 'var(--success-50)' },
  system: { icon: <InfoCircleOutlined />, label: '系统通知', colorVar: 'var(--text-tertiary)', bgVar: 'var(--gray-100)' },
  interview: { icon: <MessageOutlined />, label: '面试追踪', colorVar: 'var(--error-600)', bgVar: 'var(--error-50)' },
  job: { icon: <FileSearchOutlined />, label: '职位动态', colorVar: 'var(--warning-600)', bgVar: 'var(--warning-50)' },
  activity: { icon: <RocketOutlined />, label: '活动通知', colorVar: 'var(--orange-500)', bgVar: 'var(--warning-50)' },
  default: { icon: <BellOutlined />, label: '通知', colorVar: 'var(--text-tertiary)', bgVar: 'var(--gray-100)' },
}

const CATEGORIES: { key: CategoryKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'unread', label: '未读' },
  { key: 'system', label: '系统通知' },
  { key: 'optimize', label: '简历优化' },
  { key: 'interview', label: '面试追踪' },
  { key: 'job', label: '职位动态' },
]

const SETTING_ITEMS = [
  { key: 'system', label: '系统通知', icon: <BellOutlined /> },
  { key: 'optimize', label: '简历优化', icon: <FileTextOutlined /> },
  { key: 'interview', label: '面试追踪', icon: <MessageOutlined /> },
  { key: 'job', label: '职位动态', icon: <FileSearchOutlined /> },
  { key: 'activity', label: '活动通知', icon: <RocketOutlined /> },
]

const QUICK_ACTIONS = [
  { key: 'mark-all', label: '全部标记为已读', icon: <CheckCircleOutlined /> },
  { key: 'clear-read', label: '清空已读消息', icon: <CloseCircleOutlined /> },
  { key: 'settings', label: '通知设置', icon: <SettingOutlined /> },
  { key: 'subscriptions', label: '消息订阅管理', icon: <BellOutlined /> },
]

function timeAgo(dateStr?: string): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  const now = new Date()
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000)
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
  if (diff < 604800) return `${Math.floor(diff / 86400)} 天前`
  return formatDate(dateStr)
}

export default function MessagesPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [list, setList] = useState<MessageItem[]>([])
  const [loading, setLoading] = useState(false)
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [settings, setSettings] = useState<Record<string, boolean>>({
    system: true, optimize: true, interview: true, job: true, activity: false,
  })

  useEffect(() => {
    const t = getToken()
    if (!t) {
      router.push('/login')
      return
    }
    setToken(t)
  }, [router])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await messages.list(1, 100, false)
      setList(res.data?.items || [])
    } catch {
      message.error('加载消息失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (token) load()
  }, [token, load])

  const counts = useMemo(() => {
    const total = list.length
    const unread = list.filter((m) => !m.is_read).length
    const byType: Record<string, number> = {}
    list.forEach((m) => {
      byType[m.msg_type] = (byType[m.msg_type] || 0) + 1
    })
    return { total, unread, byType }
  }, [list])

  const filteredList = useMemo(() => {
    let result = list
    if (activeCategory === 'unread') {
      result = result.filter((m) => !m.is_read)
    } else if (activeCategory !== 'all') {
      result = result.filter((m) => m.msg_type === activeCategory)
    }
    if (statusFilter === 'read') {
      result = result.filter((m) => m.is_read)
    } else if (statusFilter === 'unread') {
      result = result.filter((m) => !m.is_read)
    }
    return result
  }, [list, activeCategory, statusFilter])

  const allFilteredSelected = useMemo(() => {
    return filteredList.length > 0 && filteredList.every((m) => selectedIds.has(m.id))
  }, [filteredList, selectedIds])

  const indeterminate = useMemo(() => {
    return selectedIds.size > 0 && !allFilteredSelected
  }, [selectedIds, allFilteredSelected])

  const handleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allFilteredSelected) {
        filteredList.forEach((m) => next.delete(m.id))
      } else {
        filteredList.forEach((m) => next.add(m.id))
      }
      return next
    })
  }, [allFilteredSelected, filteredList])

  const handleSelectOne = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const handleMarkRead = useCallback(async (id?: string) => {
    const ids = id ? [id] : Array.from(selectedIds)
    if (ids.length === 0) return
    try {
      await Promise.all(ids.map((i) => messages.markRead(i)))
      setList((prev) => prev.map((m) => (ids.includes(m.id) ? { ...m, is_read: true } : m)))
      setSelectedIds(new Set())
      message.success('已标记为已读')
    } catch {
      message.error('操作失败')
    }
  }, [selectedIds])

  const handleMarkAllRead = useCallback(async () => {
    try {
      await messages.markAllRead()
      setList((prev) => prev.map((m) => ({ ...m, is_read: true })))
      setSelectedIds(new Set())
      message.success('全部已标记为已读')
    } catch {
      message.error('操作失败')
    }
  }, [])

  const handleDelete = useCallback(async (id?: string) => {
    const ids = id ? [id] : Array.from(selectedIds)
    if (ids.length === 0) return
    try {
      await Promise.all(ids.map((i) => messages.delete(i)))
      setList((prev) => prev.filter((m) => !ids.includes(m.id)))
      setSelectedIds((prev) => {
        const next = new Set(prev)
        ids.forEach((i) => next.delete(i))
        return next
      })
      message.success('已删除')
    } catch {
      message.error('删除失败')
    }
  }, [selectedIds])

  const handleClearRead = useCallback(async () => {
    const readIds = list.filter((m) => m.is_read).map((m) => m.id)
    if (readIds.length === 0) return
    try {
      await Promise.all(readIds.map((i) => messages.delete(i)))
      setList((prev) => prev.filter((m) => !m.is_read))
      setSelectedIds(new Set())
      message.success('已清空已读消息')
    } catch {
      message.error('清空失败')
    }
  }, [list])

  const handleOpen = useCallback((msg: MessageItem) => {
    setExpandedId((prev) => (prev === msg.id ? null : msg.id))
    if (!msg.is_read) {
      messages.markRead(msg.id)
        .then(() => {
          setList((prev) => prev.map((m) => (m.id === msg.id ? { ...m, is_read: true } : m)))
        })
        .catch(() => { /* ignore */ })
    }
  }, [])

  const handleQuickAction = useCallback((key: string) => {
    if (key === 'mark-all') handleMarkAllRead()
    else if (key === 'clear-read') handleClearRead()
    else if (key === 'settings') message.info('通知设置功能开发中')
    else if (key === 'subscriptions') message.info('消息订阅管理功能开发中')
  }, [handleMarkAllRead, handleClearRead])

  const chartData = useMemo(() => {
    const entries = Object.entries(counts.byType)
      .map(([type, count]) => ({ type, count, meta: MSG_TYPE_MAP[type] || MSG_TYPE_MAP.default }))
      .sort((a, b) => b.count - a.count)
    const total = counts.total || 1
    let acc = 0
    const segments = entries.map((e) => {
      const start = acc
      const pct = (e.count / total) * 100
      acc += pct
      return { ...e, start, end: acc }
    })
    return { segments, total: counts.total }
  }, [counts])

  const donutStyle = useMemo(() => {
    if (chartData.segments.length === 0) {
      return { background: 'var(--gray-200)' }
    }
    const stops = chartData.segments.map((s) => `${s.meta.colorVar} ${s.start}% ${s.end}%`).join(', ')
    return { background: `conic-gradient(${stops})` }
  }, [chartData])

  const statusOptions = [
    { label: '全部状态', value: 'all' },
    { label: '已读', value: 'read' },
    { label: '未读', value: 'unread' },
  ]

  if (!token) return <AuthGate activeKey="messages" />

  return (
    <AppLayout
      activeKey="messages"
      title="消息通知"
      subtitle={counts.unread > 0 ? `${counts.unread} 条未读消息` : '所有消息均已读'}
    >
      <div className="app-page" style={{ padding: 0 }}>
        <Row gutter={[24, 24]}>
          <Col xs={24} lg={17} xl={18}>
            <Card styles={{ body: { padding: 0 } }}>
              <Tabs
                activeKey={activeCategory}
                onChange={(k) => setActiveCategory(k as CategoryKey)}
                style={{ padding: '0 20px' }}
                items={CATEGORIES.map((c) => ({
                  key: c.key,
                  label: (
                    <span>
                      {c.label}
                      <Badge
                        count={c.key === 'all' ? counts.total : c.key === 'unread' ? counts.unread : counts.byType[c.key] || 0}
                        showZero
                        style={{
                          marginLeft: 8,
                          backgroundColor: c.key === activeCategory ? 'var(--primary-600)' : 'var(--gray-300)',
                          color: 'var(--text-inverse)',
                          fontWeight: 500,
                        }}
                      />
                    </span>
                  ),
                }))}
              />

              <div
                style={{
                  padding: '12px 20px',
                  borderBottom: '1px solid var(--border-light)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <Space>
                  <Checkbox checked={allFilteredSelected} indeterminate={indeterminate} onChange={handleSelectAll}>
                    全选
                  </Checkbox>
                  <Button icon={<CheckCircleOutlined />} onClick={() => handleMarkRead()} disabled={selectedIds.size === 0}>
                    标记已读
                  </Button>
                </Space>
                <Space>
                  <Select
                    value={statusFilter}
                    onChange={(v) => setStatusFilter(v as StatusFilter)}
                    options={statusOptions}
                    style={{ width: 110 }}
                    size="small"
                  />
                  <Button icon={<CloseCircleOutlined />} onClick={handleClearRead} disabled={counts.total - counts.unread === 0}>
                    清空已读
                  </Button>
                </Space>
              </div>

              {loading ? (
                <div style={{ textAlign: 'center', padding: 60 }}>
                  <Spin />
                </div>
              ) : filteredList.length === 0 ? (
                <Empty description={activeCategory === 'unread' ? '没有未读消息' : '暂无消息'} style={{ padding: 60 }} />
              ) : (
                <div className="stagger-list">
                  {filteredList.map((msg) => {
                    const meta = MSG_TYPE_MAP[msg.msg_type] || MSG_TYPE_MAP.default
                    const expanded = expandedId === msg.id
                    const selected = selectedIds.has(msg.id)
                    const menuItems: MenuProps['items'] = [
                      {
                        key: 'read',
                        label: '标记为已读',
                        icon: <CheckCircleOutlined />,
                        disabled: msg.is_read,
                        onClick: () => handleMarkRead(msg.id),
                      },
                      {
                        key: 'delete',
                        label: '删除',
                        icon: <DeleteOutlined />,
                        danger: true,
                        onClick: () => handleDelete(msg.id),
                      },
                    ]
                    return (
                      <div
                        key={msg.id}
                        style={{
                          padding: '16px 20px',
                          borderBottom: '1px solid var(--border-light)',
                          cursor: 'pointer',
                          background: selected ? 'var(--bg-active)' : (msg.is_read ? 'var(--bg-card)' : 'var(--bg-hover)'),
                          transition: 'background var(--duration-fast)',
                        }}
                        onClick={() => handleOpen(msg)}
                      >
                        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                          <Checkbox
                            checked={selected}
                            onChange={(e) => {
                              e.stopPropagation()
                              handleSelectOne(msg.id, e.target.checked)
                            }}
                          />
                          <div
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 10,
                              flexShrink: 0,
                              background: meta.bgVar,
                              color: meta.colorVar,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 18,
                            }}
                          >
                            {meta.icon}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <Text strong={!msg.is_read} style={{ fontSize: 14, color: 'var(--text-primary)' }}>
                                {msg.title || meta.label}
                              </Text>
                              <span
                                style={{
                                  padding: '2px 8px',
                                  borderRadius: 999,
                                  background: msg.is_read ? 'var(--gray-100)' : 'var(--primary-50)',
                                  color: msg.is_read ? 'var(--text-tertiary)' : 'var(--primary-600)',
                                  fontSize: 11,
                                  fontWeight: 500,
                                  flexShrink: 0,
                                }}
                              >
                                {msg.is_read ? '已读' : '未读'}
                              </span>
                              <span style={{ flex: 1 }} />
                              <Text style={{ fontSize: 12, color: 'var(--text-tertiary)', flexShrink: 0 }}>
                                {timeAgo(msg.created_at)}
                              </Text>
                            </div>
                            <div
                              style={{
                                fontSize: 13,
                                color: 'var(--text-secondary)',
                                marginTop: 4,
                                lineHeight: 1.6,
                                display: '-webkit-box',
                                WebkitLineClamp: expanded ? undefined : 1,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                              }}
                            >
                              {msg.content || '暂无内容'}
                            </div>
                            {expanded && (
                              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                                <Button
                                  size="small"
                                  icon={<CheckCircleOutlined />}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleMarkRead(msg.id)
                                  }}
                                  disabled={msg.is_read}
                                >
                                  标记已读
                                </Button>
                                <Button
                                  size="small"
                                  danger
                                  icon={<DeleteOutlined />}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleDelete(msg.id)
                                  }}
                                >
                                  删除
                                </Button>
                              </div>
                            )}
                          </div>
                          <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
                            <Button
                              type="text"
                              size="small"
                              icon={<MoreOutlined />}
                              onClick={(e) => e.stopPropagation()}
                              style={{ color: 'var(--text-tertiary)' }}
                            />
                          </Dropdown>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          </Col>

          <Col xs={24} lg={7} xl={6}>
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <Card
                title="通知设置"
                extra={
                  <Button type="link" size="small" style={{ padding: 0 }}>
                    去设置 <RightOutlined />
                  </Button>
                }
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {SETTING_ITEMS.map((item) => (
                    <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Space size={8}>
                        <span style={{ color: 'var(--text-tertiary)', fontSize: 15 }}>{item.icon}</span>
                        <Text style={{ color: 'var(--text-primary)' }}>{item.label}</Text>
                      </Space>
                      <Switch
                        size="small"
                        checked={settings[item.key]}
                        onChange={(v) => setSettings((prev) => ({ ...prev, [item.key]: v }))}
                      />
                    </div>
                  ))}
                </div>
              </Card>

              <Card
                title="消息统计"
                extra={<Text style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>近 7 天</Text>}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative', width: 120, height: 120, ...donutStyle, borderRadius: '50%' }}>
                    <div
                      style={{
                        position: 'absolute',
                        inset: 24,
                        borderRadius: '50%',
                        background: 'var(--bg-card)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'column',
                      }}
                    >
                      <Text strong style={{ fontSize: 22, color: 'var(--text-primary)', lineHeight: 1 }}>
                        {chartData.total}
                      </Text>
                      <Text style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>总消息</Text>
                    </div>
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 120 }}>
                    {chartData.segments.slice(0, 5).map((s) => (
                      <div key={s.type} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                        <Space size={6}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.meta.colorVar }} />
                          <Text style={{ color: 'var(--text-secondary)' }}>{s.meta.label}</Text>
                        </Space>
                        <Text style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                          {s.count} ({Math.round((s.count / (chartData.total || 1)) * 100)}%)
                        </Text>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              <Card title="快捷操作">
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {QUICK_ACTIONS.map((item, idx) => (
                    <div
                      key={item.key}
                      onClick={() => handleQuickAction(item.key)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 0',
                        cursor: 'pointer',
                        borderBottom: idx === QUICK_ACTIONS.length - 1 ? 'none' : '1px solid var(--border-light)',
                      }}
                    >
                      <Space size={10}>
                        <span style={{ color: 'var(--text-tertiary)', fontSize: 15 }}>{item.icon}</span>
                        <Text style={{ color: 'var(--text-primary)' }}>{item.label}</Text>
                      </Space>
                      <RightOutlined style={{ color: 'var(--text-quaternary)', fontSize: 12 }} />
                    </div>
                  ))}
                </div>
              </Card>
            </Space>
          </Col>
        </Row>
      </div>
    </AppLayout>
  )
}
