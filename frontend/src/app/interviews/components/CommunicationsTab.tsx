'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Button, Typography, Spin, message, Tag, Space, Modal, Input, Empty, Tooltip,
  Tabs, Select, DatePicker,
} from 'antd'
import {
  PlusOutlined, EditOutlined, DeleteOutlined, CommentOutlined,
  PhoneOutlined, MailOutlined, WechatOutlined, EllipsisOutlined,
  ArrowUpOutlined, ArrowDownOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { communications, applications } from '@/lib/api'
import type {
  Application, Communication, CommunicationChannel, CommunicationDirection,
  CommunicationPayload, CommunicationStats,
} from '@/types'

const { TextArea } = Input

/* 方向 / 渠道（与后端 COMMUNICATION_* 枚举保持一致） */
const DIRECTION_META: Record<CommunicationDirection, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  out: { label: '我→公司', icon: <ArrowUpOutlined />, color: 'var(--primary-600)', bg: 'var(--primary-50)' },
  in: { label: '公司→我', icon: <ArrowDownOutlined />, color: 'var(--success-600)', bg: 'var(--success-50)' },
}

const CHANNEL_META: Record<CommunicationChannel, { label: string; icon: React.ReactNode }> = {
  phone: { label: '电话', icon: <PhoneOutlined /> },
  email: { label: '邮件', icon: <MailOutlined /> },
  wechat: { label: '微信', icon: <WechatOutlined /> },
  other: { label: '其他', icon: <EllipsisOutlined /> },
}

const CHANNEL_ORDER: CommunicationChannel[] = ['phone', 'email', 'wechat', 'other']
const DIRECTION_ORDER: CommunicationDirection[] = ['out', 'in']

interface Props {
  /** 由「投递记录」Tab 联动跳转过来时预选的投递 */
  initialApplicationId?: string | null
}

export default function CommunicationsTab({ initialApplicationId }: Props) {
  const [list, setList] = useState<Communication[]>([])
  const [stats, setStats] = useState<CommunicationStats | null>(null)
  const [loading, setLoading] = useState(false)

  const [activeTab, setActiveTab] = useState('all')
  const [channelFilter, setChannelFilter] = useState<CommunicationChannel | 'all'>('all')
  const [searchQ, setSearchQ] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Communication | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    application_id: null as string | null,
    company: '',
    position: '',
    direction: 'out' as CommunicationDirection,
    channel: 'phone' as CommunicationChannel,
    contact_at: null as string | null,
    content: '',
  })
  const [appOptions, setAppOptions] = useState<{ label: string; value: string }[]>([])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [listRes, statsRes] = await Promise.all([communications.list(), communications.stats()])
      setList((listRes.data || []) as Communication[])
      setStats((statsRes.data || null) as CommunicationStats | null)
    } catch {
      message.error('加载沟通记录失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const loadAppOptions = useCallback(async () => {
    try {
      const res = await applications.list()
      setAppOptions(((res.data || []) as Application[]).map((a) => ({
        label: `${a.job_title || '未知岗位'}${a.job_company ? ' @ ' + a.job_company : ''}`,
        value: a.id,
      })))
    } catch { /* 静默失败：关联下拉为空不影响记录 */ }
  }, [])

  const openCreate = useCallback(async (presetAppId?: string | null) => {
    setEditing(null)
    setForm({
      application_id: presetAppId ?? null,
      company: '', position: '', direction: 'out', channel: 'phone',
      contact_at: dayjs().toISOString(), content: '',
    })
    await loadAppOptions()
    setModalOpen(true)
  }, [loadAppOptions])

  const openEdit = useCallback(async (c: Communication) => {
    setEditing(c)
    setForm({
      application_id: c.application_id,
      company: c.company || '',
      position: c.position || '',
      direction: c.direction,
      channel: c.channel,
      contact_at: c.contact_at,
      content: c.content,
    })
    await loadAppOptions()
    setModalOpen(true)
  }, [loadAppOptions])

  // 从「投递记录」联动跳入时，自动打开预填该投递的新增弹窗
  useEffect(() => {
    if (initialApplicationId) openCreate(initialApplicationId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialApplicationId])

  const handleSave = useCallback(async () => {
    if (!form.content.trim()) { message.warning('请填写沟通内容'); return }
    if (!form.application_id && !form.company.trim()) {
      message.warning('请填写公司名称，或选择一条关联的投递记录')
      return
    }
    setSaving(true)
    try {
      const payload: CommunicationPayload = {
        application_id: form.application_id || null,
        company: form.company.trim() || null,
        position: form.position.trim() || null,
        direction: form.direction,
        channel: form.channel,
        content: form.content.trim(),
        contact_at: form.contact_at,
      }
      if (editing) {
        await communications.update(editing.id, payload)
        message.success('已更新沟通记录')
      } else {
        await communications.create(payload)
        message.success('已添加沟通记录')
      }
      setModalOpen(false)
      setEditing(null)
      loadData()
    } catch {
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }, [form, editing, loadData])

  const handleDelete = useCallback((c: Communication) => {
    Modal.confirm({
      title: '删除沟通记录',
      content: `确定删除与「${c.company}」的这条沟通记录吗？`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await communications.remove(c.id)
          message.success('已删除')
          loadData()
        } catch {
          message.error('删除失败')
        }
      },
    })
  }, [loadData])

  const filtered = useMemo(() => {
    let arr = [...list]
    if (activeTab !== 'all') arr = arr.filter((c) => c.direction === activeTab)
    if (channelFilter !== 'all') arr = arr.filter((c) => c.channel === channelFilter)
    const kw = searchQ.trim().toLowerCase()
    if (kw) {
      arr = arr.filter((c) =>
        (c.company || '').toLowerCase().includes(kw) ||
        (c.position || '').toLowerCase().includes(kw) ||
        (c.content || '').toLowerCase().includes(kw),
      )
    }
    return arr
  }, [list, activeTab, channelFilter, searchQ])

  /* 按沟通日期分组，形成时间线（Array.from 兼容当前编译目标下的 Map 迭代） */
  const grouped = useMemo(() => {
    const map = new Map<string, Communication[]>()
    for (const c of filtered) {
      const key = c.contact_at ? dayjs(c.contact_at).format('YYYY-MM-DD') : '未标注时间'
      const bucket = map.get(key)
      if (bucket) bucket.push(c)
      else map.set(key, [c])
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [filtered])

  const statCards = useMemo(() => {
    const d = stats?.by_direction || {}
    return [
      { key: 'all', label: '全部沟通', icon: <CommentOutlined />, color: '#007AFF', count: stats?.total || 0 },
      ...DIRECTION_ORDER.map((k) => ({
        key: k,
        label: DIRECTION_META[k].label,
        icon: DIRECTION_META[k].icon,
        color: DIRECTION_META[k].color,
        count: d[k] || 0,
      })),
    ]
  }, [stats])

  return (
    <div className="app-page-enter">
      <div className="jobs-stat-grid">
        {statCards.map((card) => (
          <div
            key={card.key}
            className={`jobs-stat-card${activeTab === card.key ? ' is-active' : ''}`}
            onClick={() => setActiveTab(card.key)}
          >
            <div className="jobs-stat-icon" style={{ background: `${card.color}1A`, color: card.color }}>
              {card.icon}
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="jobs-stat-label">{card.label}</div>
              <div className="jobs-stat-value">{card.count}</div>
            </div>
          </div>
        ))}
      </div>

      <Tabs
        className="jobs-tabs"
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key)}
        tabBarExtraContent={{
          right: (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate(null)}>
              记一笔沟通
            </Button>
          ),
        }}
        items={[
          { key: 'all', label: <span>全部<span className="jobs-tab-count">({stats?.total || 0})</span></span> },
          ...DIRECTION_ORDER.map((k) => ({
            key: k,
            label: (
              <span>
                {DIRECTION_META[k].label}
                <span className="jobs-tab-count">({(stats?.by_direction || {})[k] || 0})</span>
              </span>
            ),
          })),
        ]}
      />

      <div className="jobs-filter-row">
        <Input.Search
          placeholder="搜索公司 / 职位 / 沟通内容"
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          allowClear
          style={{ width: 280, maxWidth: '100%' }}
        />
        <Select
          value={channelFilter}
          onChange={setChannelFilter}
          style={{ width: 140 }}
          options={[{ label: '全部渠道', value: 'all' }, ...CHANNEL_ORDER.map((c) => ({ label: CHANNEL_META[c].label, value: c }))]}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" />
          <div style={{ marginTop: 12, color: 'var(--text-tertiary)', fontSize: 13 }}>加载中...</div>
        </div>
      ) : filtered.length === 0 ? (
        <Empty
          description={searchQ ? '没有符合条件的沟通记录' : '还没有沟通记录，点击「记一笔沟通」记录与公司的往来'}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ padding: '48px 0' }}
        >
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate(null)}>记一笔沟通</Button>
        </Empty>
      ) : (
        <div className="comm-timeline">
          {grouped.map(([date, items]) => (
            <div key={date} className="comm-day-group">
              <div className="comm-day-label">{date}</div>
              {items.map((c) => {
                const dir = DIRECTION_META[c.direction]
                const ch = CHANNEL_META[c.channel]
                return (
                  <div key={c.id} className="comm-item">
                    <div className="comm-item-head">
                      <span className="comm-dir-tag" style={{ background: dir.bg, color: dir.color }}>
                        {dir.icon} {dir.label}
                      </span>
                      <span className="comm-company">{c.company}</span>
                      {c.position && <span className="comm-position">{c.position}</span>}
                      <Tag bordered={false} style={{ marginLeft: 4 }}>{ch.icon} {ch.label}</Tag>
                      <span className="comm-time">
                        {c.contact_at ? dayjs(c.contact_at).format('HH:mm') : ''}
                      </span>
                      <Space size={2} className="comm-actions">
                        <Tooltip title="编辑">
                          <button className="job-action-btn" onClick={() => openEdit(c)}><EditOutlined /></button>
                        </Tooltip>
                        <Tooltip title="删除">
                          <button
                            className="job-action-btn"
                            style={{ color: 'var(--error-500)' }}
                            onClick={() => handleDelete(c)}
                          >
                            <DeleteOutlined />
                          </button>
                        </Tooltip>
                      </Space>
                    </div>
                    <div className="comm-content">{c.content}</div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

      <Modal
        title={editing ? '编辑沟通记录' : '记一笔沟通'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => { setModalOpen(false); setEditing(null) }}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        width={600}
        destroyOnClose
      >
        <div className="apps-edit-2col" style={{ marginTop: 16 }}>
          <div>
            <Typography.Text>方向</Typography.Text>
            <Select
              value={form.direction}
              onChange={(v) => setForm((p) => ({ ...p, direction: v }))}
              style={{ width: '100%' }}
              options={DIRECTION_ORDER.map((k) => ({ label: DIRECTION_META[k].label, value: k }))}
            />
          </div>
          <div>
            <Typography.Text>渠道</Typography.Text>
            <Select
              value={form.channel}
              onChange={(v) => setForm((p) => ({ ...p, channel: v }))}
              style={{ width: '100%' }}
              options={CHANNEL_ORDER.map((k) => ({ label: CHANNEL_META[k].label, value: k }))}
            />
          </div>
          <div>
            <Typography.Text>公司名称</Typography.Text>
            <Input
              value={form.company}
              onChange={(e) => setForm((p) => ({ ...p, company: e.target.value }))}
              placeholder="关联投递后会自动带出"
            />
          </div>
          <div>
            <Typography.Text>职位（可选）</Typography.Text>
            <Input
              value={form.position}
              onChange={(e) => setForm((p) => ({ ...p, position: e.target.value }))}
              placeholder="如：前端工程师"
            />
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <Typography.Text>关联投递记录（可选）</Typography.Text>
          <Select
            value={form.application_id || undefined}
            onChange={(v) => setForm((p) => ({ ...p, application_id: v ?? null }))}
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="选择一条投递记录"
            style={{ width: '100%' }}
            options={appOptions}
            notFoundContent="暂无投递记录"
          />
        </div>

        <div style={{ marginTop: 14 }}>
          <Typography.Text>沟通时间</Typography.Text>
          <DatePicker
            showTime
            style={{ width: '100%' }}
            placeholder="选择沟通时间"
            value={form.contact_at ? dayjs(form.contact_at) : null}
            onChange={(d) => setForm((p) => ({ ...p, contact_at: d ? d.toISOString() : null }))}
          />
        </div>

        <div style={{ marginTop: 14 }}>
          <Typography.Text>沟通内容 *</Typography.Text>
          <TextArea
            value={form.content}
            onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
            rows={4}
            placeholder="如：HR 电话沟通，确认下周三上午十点线上面试"
          />
        </div>
      </Modal>
    </div>
  )
}
