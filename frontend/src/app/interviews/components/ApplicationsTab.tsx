'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Button, Typography, Spin, message,
  Tag, Space, Modal, Input, Empty, Tooltip, Tabs, Select, Table, Pagination, Timeline,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  SendOutlined, CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined,
  EyeOutlined, DeleteOutlined, EditOutlined, PlusOutlined, CommentOutlined,
  MailOutlined, FieldTimeOutlined, RedoOutlined, GlobalOutlined, ExportOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import { applications, resumes } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import type {
  Application, ApplicationPayload, ApplicationStats, ApplicationStatus,
  DeliveryEvent, EmailSyncResult, ResumeRecord, SuppressionEntry,
} from '@/types'

const { TextArea } = Input

/* 投递状态：样式 + 中文标签（与后端 APPLICATION_STATUSES / APPLICATION_STATUS_LABELS 保持一致） */
const STATUS_META: Record<string, { bg: string; color: string; label: string; icon: React.ReactNode }> = {
  submitted: { bg: 'var(--primary-50)', color: 'var(--primary-600)', label: '已投递', icon: <SendOutlined /> },
  viewed: { bg: 'var(--gray-100)', color: 'var(--text-secondary)', label: '已查看', icon: <EyeOutlined /> },
  interview: { bg: 'var(--warning-50)', color: 'var(--warning-600)', label: '面试中', icon: <ClockCircleOutlined /> },
  offer: { bg: 'var(--success-50)', color: 'var(--success-600)', label: '已录用', icon: <CheckCircleOutlined /> },
  rejected: { bg: 'var(--error-50)', color: 'var(--error-600)', label: '未通过', icon: <CloseCircleOutlined /> },
}

const STATUS_ORDER: ApplicationStatus[] = ['submitted', 'viewed', 'interview', 'offer', 'rejected']

interface Props {
  /** 点击「记沟通」时由枢纽切到沟通消息 Tab 并预选该投递 */
  onRecordCommunication?: (app: Application) => void
}

export default function ApplicationsTab({ onRecordCommunication }: Props) {
  const router = useRouter()

  const [list, setList] = useState<Application[]>([])
  const [stats, setStats] = useState<ApplicationStats | null>(null)
  const [loading, setLoading] = useState(false)

  const [activeTab, setActiveTab] = useState('all')
  const [searchQ, setSearchQ] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editApp, setEditApp] = useState<Application | null>(null)
  const [editForm, setEditForm] = useState({ status: 'submitted', resume_id: '', cover_letter: '' })
  const [editLoading, setEditLoading] = useState(false)
  const [resumeOptions, setResumeOptions] = useState<{ label: string; value: string }[]>([])
  // ── 投递轨迹（阶段1 邮件直投）──
  const [timelineApp, setTimelineApp] = useState<Application | null>(null)
  const [timelineEvents, setTimelineEvents] = useState<DeliveryEvent[]>([])
  const [timelineLoading, setTimelineLoading] = useState(false)
  const [resendingId, setResendingId] = useState<string | null>(null)
  // ── 官网表单半自动投递（阶段3）──
  const [prefillingId, setPrefillingId] = useState<string | null>(null)
  // ── 回执闭环（阶段2）──
  const [syncing, setSyncing] = useState(false)
  const [suppressOpen, setSuppressOpen] = useState(false)
  const [suppressList, setSuppressList] = useState<SuppressionEntry[]>([])
  const [suppressLoading, setSuppressLoading] = useState(false)
  const [newSuppressEmail, setNewSuppressEmail] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [listRes, statsRes] = await Promise.all([applications.list(), applications.stats()])
      setList((listRes.data || []) as Application[])
      setStats((statsRes.data || { total: 0, by_status: {} }) as ApplicationStats)
    } catch {
      message.error('加载投递记录失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  /* ── 阶段2：IMAP 回执同步（退信→bounced+名单；回复→沟通时间线）── */
  const handleSyncEmail = useCallback(async () => {
    setSyncing(true)
    try {
      const r = await applications.syncEmail()
      const res = (r.data || {}) as EmailSyncResult
      if (!res.enabled) {
        message.info(res.message || '未配置 IMAP，无法拉取邮件回执')
      } else {
        message.success(res.message || `扫描 ${res.scanned} 封，退信 ${res.bounces}、回复 ${res.replies}`, 5)
        if (res.bounces || res.replies) loadData()
      }
    } catch {
      message.error('回执同步失败，请稍后重试')
    } finally {
      setSyncing(false)
    }
  }, [loadData])

  /* ── 阶段2：邮件不发送名单（suppression）管理 ── */
  const openSuppressions = useCallback(async () => {
    setSuppressOpen(true)
    setSuppressLoading(true)
    try {
      const r = await applications.suppressions.list()
      setSuppressList((r.data || []) as SuppressionEntry[])
    } catch {
      message.error('名单加载失败')
    } finally {
      setSuppressLoading(false)
    }
  }, [])

  const handleAddSuppression = useCallback(async () => {
    const email = newSuppressEmail.trim()
    if (!email) return
    try {
      await applications.suppressions.add(email)
      message.success('已加入不发送名单')
      setNewSuppressEmail('')
      const r = await applications.suppressions.list()
      setSuppressList((r.data || []) as SuppressionEntry[])
    } catch (err: unknown) {
      const resp = (err as { response?: { data?: { detail?: string } } })?.response
      message.warning(resp?.data?.detail || '加入失败，请检查邮箱格式')
    }
  }, [newSuppressEmail])

  const handleRemoveSuppression = useCallback(async (id: string) => {
    try {
      await applications.suppressions.remove(id)
      setSuppressList((p) => p.filter((e) => e.id !== id))
      message.success('已移除，可恢复向该邮箱投递')
    } catch {
      message.error('移除失败')
    }
  }, [])

  // 状态 / 关键词变化时回到第一页
  useEffect(() => { setPage(1) }, [activeTab, searchQ, pageSize])

  const filtered = useMemo(() => {
    let arr = [...list]
    if (activeTab !== 'all') arr = arr.filter((a) => a.status === activeTab)
    const kw = searchQ.trim().toLowerCase()
    if (kw) {
      arr = arr.filter((a) =>
        (a.job_title || '').toLowerCase().includes(kw) ||
        (a.job_company || '').toLowerCase().includes(kw) ||
        (a.applicant_name || '').toLowerCase().includes(kw) ||
        (a.email || '').toLowerCase().includes(kw),
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
      { key: 'all', label: '全部投递', icon: <SendOutlined />, color: '#007AFF', count: stats?.total || 0 },
      ...STATUS_ORDER.map((k) => ({
        key: k,
        label: STATUS_META[k].label,
        icon: STATUS_META[k].icon,
        color: STATUS_META[k].color,
        count: s[k] || 0,
      })),
    ]
  }, [stats])

  const renderStatusTag = (status: string) => {
    const meta = STATUS_META[status] || STATUS_META.submitted
    return (
      <span className="job-status-tag" style={{ background: meta.bg, color: meta.color }}>
        {meta.label}
      </span>
    )
  }

  const openEdit = useCallback(async (app: Application) => {
    setEditApp(app)
    setEditForm({ status: app.status, resume_id: app.resume_id || '', cover_letter: app.cover_letter || '' })
    try {
      const res = await resumes.list()
      setResumeOptions(((res.data || []) as ResumeRecord[]).map((r) => ({ label: r.title || '未命名简历', value: r.id })))
    } catch { /* 静默失败：简历下拉为空不影响改状态 */ }
    setEditModalOpen(true)
  }, [])

  const handleSaveEdit = useCallback(async () => {
    if (!editApp) return
    setEditLoading(true)
    try {
      const payload: ApplicationPayload = {
        job_image_id: editApp.job_image_id,
        resume_id: editForm.resume_id || null,
        cover_letter: editForm.cover_letter.trim() || null,
        status: editForm.status as ApplicationStatus,
      }
      await applications.update(editApp.id, payload)
      message.success('已更新投递状态')
      setEditModalOpen(false)
      setEditApp(null)
      loadData()
    } catch {
      message.error('更新失败')
    } finally {
      setEditLoading(false)
    }
  }, [editApp, editForm, loadData])

  const handleWithdraw = useCallback((app: Application) => {
    Modal.confirm({
      title: '撤回投递',
      content: `确定撤回对「${app.job_title || '该岗位'}」的投递吗？撤回后可重新投递。`,
      okText: '撤回投递',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await applications.remove(app.id)
          message.success('已撤回投递')
          loadData()
        } catch {
          message.error('撤回失败')
        }
      },
    })
  }, [loadData])

  /* ── 投递轨迹：查看邮件投递事件时间线 / 重发失败投递 ── */
  const openTimeline = useCallback(async (a: Application) => {
    setTimelineApp(a)
    setTimelineEvents([])
    setTimelineLoading(true)
    try {
      const r = await applications.deliveryEvents(a.id)
      setTimelineEvents(r.data || [])
    } catch {
      message.error('投递轨迹加载失败')
    } finally {
      setTimelineLoading(false)
    }
  }, [])

  const handleResend = useCallback(async (a: Application) => {
    setResendingId(a.id)
    try {
      await applications.resend(a.id)
      message.success('已重新加入发送队列')
      loadData()
    } catch (err: unknown) {
      const resp = (err as { response?: { status?: number; data?: { detail?: string } } })?.response
      message.warning(resp?.data?.detail || '重发失败')
    } finally {
      setResendingId(null)
    }
  }, [loadData])

  /* ── 阶段3：官网表单半自动投递 ── */
  const handlePrefillForm = useCallback(async (a: Application) => {
    setPrefillingId(a.id)
    try {
      await applications.prefillForm(a.id)
      message.success('预填浏览器已启动：请在打开的官网页面核对信息，并手动点击提交', 6)
      setTimeout(() => loadData(), 3000)  // 预填结果稍后经 delivery_events 回写
    } catch (err: unknown) {
      const resp = (err as { response?: { status?: number; data?: { detail?: string } } })?.response
      message.warning(resp?.data?.detail || '预填启动失败')
    } finally {
      setPrefillingId(null)
    }
  }, [loadData])

  const handleReportFormResult = useCallback((a: Application, result: 'submitted' | 'failed') => {
    Modal.confirm({
      title: result === 'submitted' ? '确认已在官网提交？' : '官网提交未完成？',
      content: result === 'submitted'
        ? `确认你已在「${a.job_title || '该岗位'}」的官网投递页手动点击提交，系统将把该投递标记为已提交。`
        : '将把该投递标记为「官网提交未完成」，之后可重新打开预填浏览器重试。',
      okText: result === 'submitted' ? '确认已提交' : '标记未完成',
      cancelText: '取消',
      okButtonProps: result === 'failed' ? { danger: true } : undefined,
      onOk: async () => {
        try {
          await applications.reportFormResult(a.id, result)
          message.success(result === 'submitted' ? '已记录：官网提交成功' : '已记录：官网提交未完成')
          loadData()
        } catch (err: unknown) {
          const resp = (err as { response?: { data?: { detail?: string } } })?.response
          message.warning(resp?.data?.detail || '结果回填失败')
        }
      },
    })
  }, [loadData])

  /* ── 阶段4：平台引导投递（一键准备包） ── */
  const handleOpenGuide = useCallback(async (a: Application) => {
    if (a.apply_url) window.open(a.apply_url, '_blank')
    try {
      await applications.guideOpened(a.id)
      loadData()
    } catch { /* 事件留痕失败不阻塞跳转 */ }
  }, [loadData])

  const handleReportGuideResult = useCallback((a: Application, result: 'submitted' | 'failed') => {
    Modal.confirm({
      title: result === 'submitted' ? '确认已在平台完成投递？' : '平台投递未完成？',
      content: result === 'submitted'
        ? `确认你已在「${a.job_title || '该岗位'}」的招聘平台（${a.apply_url || '平台岗位页'}）手动完成投递，系统将把该投递标记为已提交。`
        : '将把该投递标记为「平台投递未完成」，之后可重新打开平台岗位页重试。',
      okText: result === 'submitted' ? '确认已投递' : '标记未完成',
      cancelText: '取消',
      okButtonProps: result === 'failed' ? { danger: true } : undefined,
      onOk: async () => {
        try {
          await applications.reportGuideResult(a.id, result)
          message.success(result === 'submitted' ? '已记录：平台投递完成' : '已记录：平台投递未完成')
          loadData()
        } catch (err: unknown) {
          const resp = (err as { response?: { data?: { detail?: string } } })?.response
          message.warning(resp?.data?.detail || '结果回填失败')
        }
      },
    })
  }, [loadData])

  const columns: ColumnsType<Application> = [
    {
      title: '投递岗位',
      key: 'job',
      render: (_, a) => (
        <div className="job-title-cell">
          <div className="job-title-main">
            <div className="job-title-name">{a.job_title || '未知岗位'}</div>
            <div className="job-title-sub">{a.job_company || '—'}</div>
          </div>
        </div>
      ),
    },
    {
      title: '申请人',
      key: 'applicant',
      width: 190,
      render: (_, a) => (
        <div>
          <div className="job-company-name">{a.applicant_name || '—'}</div>
          <div className="job-company-sub">{a.email || '—'}</div>
        </div>
      ),
    },
    {
      title: '联系电话',
      key: 'phone',
      width: 130,
      render: (_, a) => a.phone || '—',
    },
    {
      title: '投递状态',
      key: 'status',
      width: 130,
      render: (_, a) => (
        <Space size={4} wrap>
          {renderStatusTag(a.status)}
          {a.channel === 'form' && <Tag color="geekblue" style={{ marginInlineEnd: 0 }}>官网表单</Tag>}
          {a.channel === 'email' && <Tag color="cyan" style={{ marginInlineEnd: 0 }}>邮件</Tag>}
          {a.channel === 'guide' && <Tag color="purple" style={{ marginInlineEnd: 0 }}>平台引导</Tag>}
        </Space>
      ),
    },
    {
      title: '投递时间',
      key: 'time',
      width: 150,
      render: (_, a) => <span className="job-time-main">{formatDate(a.created_at || '')}</span>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 190,
      render: (_, a) => (
        <Space size={2}>
          <Tooltip title="查看岗位库">
            <button className="job-action-btn" onClick={() => router.push('/jobs')}>
              <EyeOutlined />
            </button>
          </Tooltip>
          <Tooltip title="更新状态">
            <button className="job-action-btn" onClick={() => openEdit(a)}>
              <EditOutlined />
            </button>
          </Tooltip>
          <Tooltip title="记一笔沟通">
            <button
              className="job-action-btn"
              onClick={() => onRecordCommunication?.(a)}
              disabled={!onRecordCommunication}
            >
              <CommentOutlined />
            </button>
          </Tooltip>
          {a.channel === 'email' && (
            <>
              <Tooltip title="投递轨迹">
                <button className="job-action-btn" onClick={() => openTimeline(a)}>
                  <FieldTimeOutlined />
                </button>
              </Tooltip>
              {a.delivery_status === 'failed' && (
                <Tooltip title="重新发送">
                  <button
                    className="job-action-btn"
                    style={{ color: 'var(--warning-600)' }}
                    onClick={() => handleResend(a)}
                    disabled={resendingId === a.id}
                  >
                    <RedoOutlined />
                  </button>
                </Tooltip>
              )}
            </>
          )}
          {a.channel === 'form' && (
            <>
              <Tooltip title="投递轨迹">
                <button className="job-action-btn" onClick={() => openTimeline(a)}>
                  <FieldTimeOutlined />
                </button>
              </Tooltip>
              {a.delivery_status !== 'sent' && (
                <>
                  <Tooltip title="打开预填浏览器（系统只预填，提交需你在页面中手动确认）">
                    <button
                      className="job-action-btn"
                      style={{ color: 'var(--primary-600)' }}
                      onClick={() => handlePrefillForm(a)}
                      disabled={prefillingId === a.id}
                    >
                      <GlobalOutlined />
                    </button>
                  </Tooltip>
                  <Tooltip title="标记：已在官网确认提交">
                    <button
                      className="job-action-btn"
                      style={{ color: 'var(--success-600)' }}
                      onClick={() => handleReportFormResult(a, 'submitted')}
                    >
                      <CheckCircleOutlined />
                    </button>
                  </Tooltip>
                  {a.delivery_status === 'failed' && (
                    <Tooltip title="重新预填重试">
                      <button
                        className="job-action-btn"
                        style={{ color: 'var(--warning-600)' }}
                        onClick={() => handlePrefillForm(a)}
                        disabled={prefillingId === a.id}
                      >
                        <RedoOutlined />
                      </button>
                    </Tooltip>
                  )}
                </>
              )}
            </>
          )}
          {a.channel === 'guide' && (
            <>
              <Tooltip title="投递轨迹">
                <button className="job-action-btn" onClick={() => openTimeline(a)}>
                  <FieldTimeOutlined />
                </button>
              </Tooltip>
              {a.delivery_status !== 'sent' && (
                <>
                  <Tooltip title="打开平台岗位页（由你手动完成投递）">
                    <button
                      className="job-action-btn"
                      style={{ color: 'var(--primary-600)' }}
                      onClick={() => handleOpenGuide(a)}
                    >
                      <ExportOutlined />
                    </button>
                  </Tooltip>
                  <Tooltip title="标记：已在平台完成投递">
                    <button
                      className="job-action-btn"
                      style={{ color: 'var(--success-600)' }}
                      onClick={() => handleReportGuideResult(a, 'submitted')}
                    >
                      <CheckCircleOutlined />
                    </button>
                  </Tooltip>
                  {a.delivery_status === 'failed' && (
                    <Tooltip title="重新打开平台重试">
                      <button
                        className="job-action-btn"
                        style={{ color: 'var(--warning-600)' }}
                        onClick={() => handleOpenGuide(a)}
                      >
                        <RedoOutlined />
                      </button>
                    </Tooltip>
                  )}
                </>
              )}
            </>
          )}
          <Tooltip title="撤回投递">
            <button
              className="job-action-btn"
              style={{ color: 'var(--error-500)' }}
              onClick={() => handleWithdraw(a)}
            >
              <DeleteOutlined />
            </button>
          </Tooltip>
        </Space>
      ),
    },
  ]

  return (
    <div className="app-page-enter">
      {/* 顶部统计卡 */}
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
            <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push('/jobs')}>
              去岗位库投递
            </Button>
          ),
        }}
        items={[
          { key: 'all', label: <span>全部投递<span className="jobs-tab-count">({stats?.total || 0})</span></span> },
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
          placeholder="搜索岗位 / 公司 / 姓名 / 邮箱"
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
          description={searchQ ? '没有符合条件的投递记录' : '还没有投递记录，去岗位库发起第一份投递吧'}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ padding: '48px 0' }}
        >
          <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push('/jobs')}>
            去岗位库投递
          </Button>
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
        title="更新投递状态"
        open={editModalOpen}
        onOk={handleSaveEdit}
        onCancel={() => { setEditModalOpen(false); setEditApp(null) }}
        okText="保存"
        cancelText="取消"
        confirmLoading={editLoading}
        destroyOnClose
      >
        {editApp && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div>
              <Typography.Text>投递岗位</Typography.Text>
              <Input value={`${editApp.job_title || ''}${editApp.job_company ? ' @ ' + editApp.job_company : ''}`} disabled />
            </div>
            <div>
              <Typography.Text>投递状态</Typography.Text>
              <Select
                value={editForm.status}
                onChange={(v) => setEditForm((p) => ({ ...p, status: v }))}
                style={{ width: '100%' }}
                options={STATUS_ORDER.map((k) => ({ label: STATUS_META[k].label, value: k }))}
              />
            </div>
            <div className="apps-applicant-hint">
              投递人信息（取自个人资料，不可修改）：
              <span className="apps-applicant-hint-name">{editApp.applicant_name || '—'}</span>
              <span className="apps-applicant-hint-sub">
                {editApp.email || ''}{editApp.phone ? ` · ${editApp.phone}` : ''}
              </span>
            </div>
            <div>
              <Typography.Text>投递简历（可选）</Typography.Text>
              <Select
                value={editForm.resume_id || undefined}
                onChange={(v) => setEditForm((p) => ({ ...p, resume_id: v || '' }))}
                allowClear
                placeholder="选择投递所用简历"
                style={{ width: '100%' }}
                options={resumeOptions}
                notFoundContent="暂无简历"
              />
            </div>
            <div>
              <Typography.Text>求职信 / 备注</Typography.Text>
              <TextArea
                value={editForm.cover_letter}
                onChange={(e) => setEditForm((p) => ({ ...p, cover_letter: e.target.value }))}
                rows={3}
              />
            </div>
          </Space>
        )}
      </Modal>

      {/* 投递轨迹时间线（邮件直投事件流水） */}
      <Modal
        title={`投递轨迹${timelineApp?.job_title ? ` · ${timelineApp.job_title}` : ''}`}
        open={!!timelineApp}
        footer={[
          timelineApp?.channel === 'email' && timelineApp?.delivery_status === 'failed' && (
            <Button
              key="resend"
              type="primary"
              loading={resendingId === timelineApp?.id}
              onClick={() => { if (timelineApp) { handleResend(timelineApp); setTimelineApp(null) } }}
            >
              重新发送
            </Button>
          ),
          timelineApp?.channel === 'form' && timelineApp?.delivery_status !== 'sent' && (
            <Button
              key="prefill"
              type="primary"
              loading={prefillingId === timelineApp?.id}
              onClick={() => { if (timelineApp) { handlePrefillForm(timelineApp) } }}
            >
              打开预填浏览器
            </Button>
          ),
          timelineApp?.channel === 'form' && timelineApp?.delivery_status !== 'sent' && (
            <Button
              key="mark-submitted"
              onClick={() => { if (timelineApp) handleReportFormResult(timelineApp, 'submitted') }}
            >
              标记已提交
            </Button>
          ),
          <Button key="close" onClick={() => setTimelineApp(null)}>关闭</Button>,
        ]}
        onCancel={() => setTimelineApp(null)}
        destroyOnClose
      >
        {timelineApp && (
          <Space direction="vertical" size="small" style={{ width: '100%', marginBottom: 16 }}>
            <Typography.Text type="secondary">
              {timelineApp.channel === 'email'
                ? `邮件直投 → ${timelineApp.recipient_email || '—'}（授权于 ${formatDate(timelineApp.consent_at || '')}）`
                : timelineApp.channel === 'form'
                  ? `官网表单半自动投递 → ${timelineApp.apply_url || '—'}（系统只预填，提交由你在页面中手动确认）`
                  : '手动投递记录（未经过外部通道）'}
            </Typography.Text>
          </Space>
        )}
        {timelineLoading ? (
          <div style={{ textAlign: 'center', padding: 32 }}><Spin /></div>
        ) : timelineEvents.length === 0 ? (
          <Empty description="暂无投递事件" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Timeline
            items={timelineEvents.map((e) => {
              const itemMeta: Record<string, { color: string }> = {
                queued: { color: 'blue' },
                sent: { color: 'green' },
                failed: { color: 'red' },
                bounced: { color: 'orange' },
                replied: { color: 'green' },
                form_prefilled: { color: 'blue' },
                form_submitted: { color: 'green' },
                form_failed: { color: 'red' },
                guide_opened: { color: 'blue' },
                guide_submitted: { color: 'green' },
                guide_failed: { color: 'red' },
              }
              const typeLabel: Record<string, string> = {
                queued: '已加入发送队列',
                sent: '已投递到对方邮箱',
                failed: '发送失败',
                bounced: '被退信',
                replied: '对方已回复',
                form_prefilled: '官网表单已预填（待人工确认提交）',
                form_submitted: '已在官网确认提交',
                form_failed: '官网提交未完成',
                guide_opened: '已打开平台岗位页',
                guide_submitted: '已在平台完成投递（用户回填）',
                guide_failed: '平台投递未完成（用户回填）',
              }
              const m = itemMeta[e.event_type] || { color: 'gray' }
              return {
                color: m.color,
                children: (
                  <div>
                    <div>{typeLabel[e.event_type] || e.event_type}</div>
                    {e.detail && (
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{e.detail}</div>
                    )}
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                      {formatDate(e.occurred_at || '')}
                    </div>
                  </div>
                ),
              }
            })}
          />
        )}
      </Modal>

      {/* ── 不发送名单（suppression）管理弹窗（阶段2） ── */}
      <Modal
        title="邮件不发送名单"
        open={suppressOpen}
        onCancel={() => setSuppressOpen(false)}
        footer={null}
        width={520}
        destroyOnClose
      >
        <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-tertiary)' }}>
          退信地址会自动加入此名单并暂停向其投递（尊重对方服务器信号）；确认对方可正常接收后可在此移除。
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <Input
            value={newSuppressEmail}
            onChange={(e) => setNewSuppressEmail(e.target.value)}
            placeholder="手动加入邮箱地址（不想再向其投递）"
            allowClear
          />
          <Button onClick={handleAddSuppression}>加入</Button>
        </div>
        {suppressLoading ? (
          <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
        ) : suppressList.length === 0 ? (
          <Empty description="名单为空" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          suppressList.map((e) => (
            <div
              key={e.id}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--gray-100)' }}
            >
              <div>
                <div style={{ fontSize: 13 }}>{e.email}</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                  {e.reason === 'bounce' ? '退信自动加入' : '手动加入'}
                  {e.created_at ? ` · ${formatDate(e.created_at)}` : ''}
                  {e.detail ? ` · ${e.detail.slice(0, 60)}` : ''}
                </div>
              </div>
              <Button size="small" onClick={() => handleRemoveSuppression(e.id)}>移除</Button>
            </div>
          ))
        )}
      </Modal>
    </div>
  )
}
