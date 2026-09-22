'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Button, Typography, Spin, message, Tag, Space, Modal, Input, Empty, Tooltip,
  Tabs, Select, Table, DatePicker, Pagination,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  PlusOutlined, EditOutlined, DeleteOutlined, CalendarOutlined,
  CheckCircleOutlined, CloseCircleOutlined, TrophyOutlined, HourglassOutlined,
  ClockCircleOutlined, ApartmentOutlined,
} from '@ant-design/icons'
import dynamic from 'next/dynamic'
import * as echarts from 'echarts/core'
import { FunnelChart, PieChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import dayjs from 'dayjs'
import { interviewTracks, resumes, jobs } from '@/lib/api'
import type {
  InterviewTrack, InterviewTrackPayload, InterviewTrackStats, InterviewTrackStatus,
  ResumeRecord, JobRecord,
} from '@/types'

// 仅注册本页用到的漏斗图 / 环形图，减小该路由 chunk
echarts.use([FunnelChart, PieChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])
const ReactECharts = dynamic(() => import('echarts-for-react/lib/core'), {
  ssr: false,
  loading: () => <Spin size="large" />,
})

const { TextArea } = Input

/* 面试进展状态（与后端 TRACK_STATUSES 保持一致） */
const STATUS_META: Record<InterviewTrackStatus, { label: string; bg: string; color: string; icon: React.ReactNode }> = {
  scheduled: { label: '待面试', bg: 'var(--primary-50)', color: 'var(--primary-600)', icon: <ClockCircleOutlined /> },
  awaiting: { label: '待结果', bg: 'var(--warning-50)', color: 'var(--warning-600)', icon: <HourglassOutlined /> },
  passed: { label: '已通过', bg: 'var(--success-50)', color: 'var(--success-600)', icon: <CheckCircleOutlined /> },
  offer: { label: '已录用', bg: 'var(--success-50)', color: 'var(--success-700)', icon: <TrophyOutlined /> },
  rejected: { label: '未通过', bg: 'var(--error-50)', color: 'var(--error-600)', icon: <CloseCircleOutlined /> },
}

const STATUS_ORDER: InterviewTrackStatus[] = ['scheduled', 'awaiting', 'passed', 'offer', 'rejected']
const STAGES = ['笔试', '一面', '二面', '三面', '群面', 'HR 面', '终面', '其他']
const MODES = ['现场', '线上', '电话']

const EMPTY_FORM: InterviewTrackPayload = {
  company: '', position: '', location: null, stage: null, mode: null,
  interviewer: null, interview_time: null, status: 'scheduled', result: null,
  resume_id: null, job_image_id: null,
}

export default function InterviewProgressTab() {
  const [list, setList] = useState<InterviewTrack[]>([])
  const [stats, setStats] = useState<InterviewTrackStats | null>(null)
  const [loading, setLoading] = useState(false)

  const [activeTab, setActiveTab] = useState('all')
  const [searchQ, setSearchQ] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<InterviewTrack | null>(null)
  const [form, setForm] = useState<InterviewTrackPayload>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [resumeOptions, setResumeOptions] = useState<{ label: string; value: string }[]>([])
  const [jobOptions, setJobOptions] = useState<{ label: string; value: string }[]>([])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [listRes, statsRes] = await Promise.all([interviewTracks.list(), interviewTracks.stats()])
      setList((listRes.data || []) as InterviewTrack[])
      setStats((statsRes.data || null) as InterviewTrackStats | null)
    } catch {
      message.error('加载面试记录失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => { setPage(1) }, [activeTab, searchQ, pageSize])

  const filtered = useMemo(() => {
    let arr = [...list]
    if (activeTab !== 'all') arr = arr.filter((t) => t.status === activeTab)
    const kw = searchQ.trim().toLowerCase()
    if (kw) {
      arr = arr.filter((t) =>
        t.company.toLowerCase().includes(kw) ||
        t.position.toLowerCase().includes(kw) ||
        (t.location || '').toLowerCase().includes(kw),
      )
    }
    return arr
  }, [list, activeTab, searchQ])

  const paged = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  )

  const statCards = useMemo(() => {
    const s = stats?.by_status || {}
    return [
      { key: 'all', label: '全部面试', icon: <CalendarOutlined />, color: '#007AFF', count: stats?.total || 0 },
      ...STATUS_ORDER.map((k) => ({
        key: k,
        label: STATUS_META[k].label,
        icon: STATUS_META[k].icon,
        color: STATUS_META[k].color,
        count: s[k] || 0,
      })),
      { key: '__upcoming', label: '7 天内待面试', icon: <ClockCircleOutlined />, color: '#FF9500', count: stats?.upcoming_7d || 0 },
    ]
  }, [stats])

  /* 轮次漏斗：仅展示有记录的轮次，零值段用 minSize 避免占位 */
  const funnelOption = useMemo(() => {
    const byStage = stats?.by_stage || {}
    const data = STAGES
      .map((s) => ({ name: s, value: byStage[s] || 0 }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value)
    return {
      tooltip: { trigger: 'item', formatter: '{b}: {c} 场' },
      series: [{
        type: 'funnel',
        top: 10, bottom: 10, left: '8%', right: '8%',
        minSize: '0%',
        sort: 'descending',
        gap: 2,
        label: { show: true, position: 'inside', color: '#fff', fontSize: 12 },
        data: data.length ? data : [{ name: '暂无记录', value: 0 }],
      }],
    }
  }, [stats])

  /* 结果分布环形图：环心文字用 DOM 叠加（echarts graphic 在本项目不渲染） */
  const pieOption = useMemo(() => {
    const s = stats?.by_status || {}
    const colorMap: Record<string, string> = {
      scheduled: '#007AFF', awaiting: '#FF9500', passed: '#34C759', offer: '#248A3D', rejected: '#FF3B30',
    }
    const data = STATUS_ORDER
      .map((k) => ({ name: STATUS_META[k].label, value: s[k] || 0, itemStyle: { color: colorMap[k] } }))
      .filter((d) => d.value > 0)
    return {
      tooltip: { trigger: 'item', formatter: '{b}: {c} 场 ({d}%)' },
      legend: { bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 12 } },
      series: [{
        type: 'pie',
        radius: ['52%', '74%'],
        center: ['50%', '44%'],
        avoidLabelOverlap: true,
        label: { show: false },
        data: data.length ? data : [{ name: '暂无记录', value: 1, itemStyle: { color: '#E5E5EA' } }],
      }],
    }
  }, [stats])

  const openCreate = useCallback(async () => {
    setEditing(null)
    setForm({ ...EMPTY_FORM })
    await loadRefOptions()
    setModalOpen(true)
  }, [])

  const openEdit = useCallback(async (t: InterviewTrack) => {
    setEditing(t)
    setForm({
      company: t.company, position: t.position, location: t.location, stage: t.stage,
      mode: t.mode, interviewer: t.interviewer, interview_time: t.interview_time,
      status: t.status, result: t.result, resume_id: t.resume_id, job_image_id: t.job_image_id,
    })
    await loadRefOptions()
    setModalOpen(true)
  }, [])

  const loadRefOptions = useCallback(async () => {
    try {
      const [rRes, jRes] = await Promise.all([resumes.list(), jobs.list()])
      setResumeOptions(((rRes.data || []) as ResumeRecord[]).map((r) => ({ label: r.title || '未命名简历', value: r.id })))
      setJobOptions(((jRes.data || []) as JobRecord[]).map((j) => {
        // 岗位标题 / 公司存在 parsed_job_json 内（JobRecord 本身只有 id / image_url 等元数据）
        const parsed = j.parsed_job_json
        const title = parsed?.title || '未命名岗位'
        const company = parsed?.company || ''
        return { label: company ? `${title} @ ${company}` : title, value: j.id }
      }))
    } catch { /* 静默失败：关联下拉为空不影响录入 */ }
  }, [])

  const handleSave = useCallback(async () => {
    if (!form.company.trim()) { message.warning('请填写公司名称'); return }
    if (!form.position.trim()) { message.warning('请填写应聘职位'); return }
    setSaving(true)
    try {
      const payload: InterviewTrackPayload = {
        ...form,
        company: form.company.trim(),
        position: form.position.trim(),
        location: form.location?.trim() || null,
        interviewer: form.interviewer?.trim() || null,
        result: form.result?.trim() || null,
      }
      if (editing) {
        await interviewTracks.update(editing.id, payload)
        message.success('已更新面试记录')
      } else {
        await interviewTracks.create(payload)
        message.success('已添加面试记录')
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

  const handleDelete = useCallback((t: InterviewTrack) => {
    Modal.confirm({
      title: '删除面试记录',
      content: `确定删除「${t.company} · ${t.position}」的面试记录吗？`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await interviewTracks.remove(t.id)
          message.success('已删除')
          loadData()
        } catch {
          message.error('删除失败')
        }
      },
    })
  }, [loadData])

  const columns: ColumnsType<InterviewTrack> = [
    {
      title: '公司 / 职位',
      key: 'job',
      render: (_, t) => (
        <div className="job-title-cell">
          <div className="job-title-main">
            <div className="job-title-name">{t.position}</div>
            <div className="job-title-sub">{t.company}{t.location ? ` · ${t.location}` : ''}</div>
          </div>
        </div>
      ),
    },
    {
      title: '轮次',
      key: 'stage',
      width: 100,
      render: (_, t) => (t.stage ? <Tag bordered={false}>{t.stage}</Tag> : '—'),
    },
    {
      title: '方式',
      key: 'mode',
      width: 90,
      render: (_, t) => t.mode || '—',
    },
    {
      title: '面试时间',
      key: 'time',
      width: 160,
      render: (_, t) => (
        <span className="job-time-main">
          {t.interview_time ? dayjs(t.interview_time).format('YYYY-MM-DD HH:mm') : '—'}
        </span>
      ),
    },
    {
      title: '状态',
      key: 'status',
      width: 110,
      render: (_, t) => (
        <span className="job-status-tag" style={{ background: STATUS_META[t.status].bg, color: STATUS_META[t.status].color }}>
          {STATUS_META[t.status].label}
        </span>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      render: (_, t) => (
        <Space size={2}>
          <Tooltip title="编辑">
            <button className="job-action-btn" onClick={() => openEdit(t)}><EditOutlined /></button>
          </Tooltip>
          <Tooltip title="删除">
            <button className="job-action-btn" style={{ color: 'var(--error-500)' }} onClick={() => handleDelete(t)}>
              <DeleteOutlined />
            </button>
          </Tooltip>
        </Space>
      ),
    },
  ]

  return (
    <div className="app-page-enter">
      <div className="jobs-stat-grid">
        {statCards.map((card) => (
          <div
            key={card.key}
            className={`jobs-stat-card${activeTab === card.key ? ' is-active' : ''}`}
            onClick={() => { if (card.key !== '__upcoming') setActiveTab(card.key) }}
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

      {/* 图表区：轮次漏斗 + 结果分布 */}
      <div className="apps-chart-row">
        <div className="apps-chart-card">
          <div className="apps-chart-title">
            <ApartmentOutlined /> 面试轮次分布
          </div>
          <ReactECharts echarts={echarts} option={funnelOption} style={{ height: 220 }} notMerge />
        </div>
        <div className="apps-chart-card">
          <div className="apps-chart-title">结果分布</div>
          <div style={{ position: 'relative' }}>
            <ReactECharts echarts={echarts} option={pieOption} style={{ height: 220 }} notMerge />
            <div className="apps-pie-center">
              <div className="apps-pie-center-value">{stats?.offer_rate ?? 0}%</div>
              <div className="apps-pie-center-label">Offer 率</div>
            </div>
          </div>
        </div>
      </div>

      <Tabs
        className="jobs-tabs"
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key)}
        tabBarExtraContent={{
          right: (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              添加面试
            </Button>
          ),
        }}
        items={[
          { key: 'all', label: <span>全部<span className="jobs-tab-count">({stats?.total || 0})</span></span> },
          ...STATUS_ORDER.map((k) => ({
            key: k,
            label: (
              <span>
                {STATUS_META[k].label}
                <span className="jobs-tab-count">({(stats?.by_status || {})[k] || 0})</span>
              </span>
            ),
          })),
        ]}
      />

      <div className="jobs-filter-row">
        <Input.Search
          placeholder="搜索公司 / 职位 / 地点"
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          allowClear
          style={{ width: 320, maxWidth: '100%' }}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" />
          <div style={{ marginTop: 12, color: 'var(--text-tertiary)', fontSize: 13 }}>加载中...</div>
        </div>
      ) : filtered.length === 0 ? (
        <Empty
          description={searchQ ? '没有符合条件的面试记录' : '还没有面试记录，点击「添加面试」手动录入'}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ padding: '48px 0' }}
        >
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>添加面试</Button>
        </Empty>
      ) : (
        <>
          <Table className="jobs-table" rowKey="id" columns={columns} dataSource={paged} pagination={false} />
          <div className="jobs-table-footer">
            <span className="jobs-table-total">共 {filtered.length} 条</span>
            <Pagination
              current={page}
              pageSize={pageSize}
              total={filtered.length}
              onChange={(p, ps) => { setPage(p); setPageSize(ps) }}
              showSizeChanger
              pageSizeOptions={[10, 20, 50]}
              showQuickJumper
            />
          </div>
        </>
      )}

      <Modal
        title={editing ? '编辑面试记录' : '添加面试记录'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => { setModalOpen(false); setEditing(null) }}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        width={640}
        destroyOnClose
      >
        <div className="apps-edit-2col" style={{ marginTop: 16 }}>
          <div>
            <Typography.Text>公司 *</Typography.Text>
            <Input
              value={form.company}
              onChange={(e) => setForm((p) => ({ ...p, company: e.target.value }))}
              placeholder="如：字节跳动"
            />
          </div>
          <div>
            <Typography.Text>应聘职位 *</Typography.Text>
            <Input
              value={form.position}
              onChange={(e) => setForm((p) => ({ ...p, position: e.target.value }))}
              placeholder="如：前端工程师"
            />
          </div>
          <div>
            <Typography.Text>工作地点</Typography.Text>
            <Input
              value={form.location || ''}
              onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
              placeholder="如：北京"
            />
          </div>
          <div>
            <Typography.Text>面试轮次</Typography.Text>
            <Select
              value={form.stage || undefined}
              onChange={(v) => setForm((p) => ({ ...p, stage: v ?? null }))}
              allowClear
              placeholder="选择轮次"
              style={{ width: '100%' }}
              options={STAGES.map((s) => ({ label: s, value: s }))}
            />
          </div>
          <div>
            <Typography.Text>面试方式</Typography.Text>
            <Select
              value={form.mode || undefined}
              onChange={(v) => setForm((p) => ({ ...p, mode: v ?? null }))}
              allowClear
              placeholder="选择方式"
              style={{ width: '100%' }}
              options={MODES.map((m) => ({ label: m, value: m }))}
            />
          </div>
          <div>
            <Typography.Text>面试官 / 联系人</Typography.Text>
            <Input
              value={form.interviewer || ''}
              onChange={(e) => setForm((p) => ({ ...p, interviewer: e.target.value }))}
              placeholder="如：李经理"
            />
          </div>
          <div>
            <Typography.Text>面试时间</Typography.Text>
            <DatePicker
              showTime
              style={{ width: '100%' }}
              placeholder="选择面试时间"
              value={form.interview_time ? dayjs(form.interview_time) : null}
              onChange={(d) => setForm((p) => ({ ...p, interview_time: d ? d.toISOString() : null }))}
            />
          </div>
          <div>
            <Typography.Text>进展状态</Typography.Text>
            <Select
              value={form.status}
              onChange={(v) => setForm((p) => ({ ...p, status: v }))}
              style={{ width: '100%' }}
              options={STATUS_ORDER.map((k) => ({ label: STATUS_META[k].label, value: k }))}
            />
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <Typography.Text>关联岗位（可选）</Typography.Text>
          <Select
            value={form.job_image_id || undefined}
            onChange={(v) => setForm((p) => ({ ...p, job_image_id: v ?? null }))}
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="从岗位库选择"
            style={{ width: '100%' }}
            options={jobOptions}
            notFoundContent="岗位库暂无岗位"
          />
        </div>

        <div style={{ marginTop: 14 }}>
          <Typography.Text>关联简历（可选）</Typography.Text>
          <Select
            value={form.resume_id || undefined}
            onChange={(v) => setForm((p) => ({ ...p, resume_id: v ?? null }))}
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="选择所用简历"
            style={{ width: '100%' }}
            options={resumeOptions}
            notFoundContent="暂无简历"
          />
        </div>

        <div style={{ marginTop: 14 }}>
          <Typography.Text>面试复盘 / 结果备注</Typography.Text>
          <TextArea
            value={form.result || ''}
            onChange={(e) => setForm((p) => ({ ...p, result: e.target.value }))}
            rows={3}
            placeholder="记录面试题目、表现、反馈等"
          />
        </div>
      </Modal>
    </div>
  )
}
