'use client'

import React, { useEffect, useMemo, useState, useCallback } from 'react'
import {
  Button,
  Card,
  Input,
  Select,
  DatePicker,
  Table,
  Tag,
  Progress,
  Drawer,
  Space,
  Typography,
  Dropdown,
  Modal,
  message,
  Spin,
  Empty,
  type MenuProps,
  type TableColumnsType,
} from 'antd'
import {
  SearchOutlined,
  ReloadOutlined,
  FilterOutlined,
  EyeOutlined,
  MoreOutlined,
  PlusOutlined,
  FileTextOutlined,
  SnippetsOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  DownloadOutlined,
} from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { useRouter } from 'next/navigation'
import { batch, resumes, jobs } from '@/lib/api'
import { getToken } from '@/lib/auth'
import AppLayout from '@/components/AppLayout'
import AuthGate from '@/components/AuthGate'
import type { BatchStatus, ResumeRecord, JobRecord } from '@/types'

const { Text } = Typography
const { RangePicker } = DatePicker
const MAX_JOBS = 5

type TaskStatus = 'running' | 'completed' | 'failed' | 'terminated' | 'queued'
type TaskType = '岗位匹配优化' | '通用优化'

interface BatchTask {
  id: string
  name: string
  remark: string
  type: TaskType
  resumeCount: number
  status: TaskStatus
  progress: number
  createdAt: string
  creator: string
  failedCount: number
}

interface ResumeProcessItem {
  id: string
  name: string
  status: TaskStatus
  progress: number
  score?: number
}

interface TaskLog {
  time: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
}

const STATUS_META: Record<TaskStatus, { label: string; color: string; bg: string }> = {
  running: { label: '运行中', color: 'var(--primary-600)', bg: 'var(--primary-50)' },
  completed: { label: '已完成', color: 'var(--success-600)', bg: 'var(--success-50)' },
  failed: { label: '失败', color: 'var(--error-600)', bg: 'var(--error-50)' },
  terminated: { label: '已终止', color: 'var(--text-tertiary)', bg: 'var(--gray-100)' },
  queued: { label: '排队中', color: 'var(--warning-600)', bg: 'var(--warning-50)' },
}

const LOG_COLOR: Record<TaskLog['type'], string> = {
  info: 'var(--primary-500)',
  success: 'var(--success-500)',
  warning: 'var(--warning-500)',
  error: 'var(--error-500)',
}

function StatusTag({ status }: { status: TaskStatus }) {
  const meta = STATUS_META[status]
  return (
    <Tag
      style={{
        margin: 0,
        border: 'none',
        background: meta.bg,
        color: meta.color,
        fontWeight: 500,
      }}
    >
      {meta.label}
    </Tag>
  )
}

function progressColor(status: TaskStatus): string {
  switch (status) {
    case 'completed':
      return 'var(--success-500)'
    case 'failed':
      return 'var(--error-500)'
    case 'terminated':
      return 'var(--gray-400)'
    case 'queued':
      return 'var(--warning-500)'
    default:
      return 'var(--primary-500)'
  }
}

const initialTasks: BatchTask[] = [
  {
    id: 'batch-001',
    name: '前端工程师批量优化',
    remark: '针对前端岗位优化',
    type: '岗位匹配优化',
    resumeCount: 32,
    status: 'running',
    progress: 68,
    createdAt: '2025-06-02 14:30',
    creator: '张小明',
    failedCount: 0,
  },
  {
    id: 'batch-002',
    name: '产品经理简历优化',
    remark: '产品方向通用优化',
    type: '通用优化',
    resumeCount: 46,
    status: 'running',
    progress: 45,
    createdAt: '2025-06-02 11:20',
    creator: '张小明',
    failedCount: 1,
  },
  {
    id: 'batch-003',
    name: '高级Java开发工程师',
    remark: '社招岗位JD匹配',
    type: '岗位匹配优化',
    resumeCount: 28,
    status: 'completed',
    progress: 100,
    createdAt: '2025-06-01 16:45',
    creator: '张小明',
    failedCount: 0,
  },
  {
    id: 'batch-004',
    name: '数据分析师优化任务',
    remark: '数据岗位批量优化',
    type: '通用优化',
    resumeCount: 37,
    status: 'completed',
    progress: 100,
    createdAt: '2025-06-01 10:15',
    creator: '张小明',
    failedCount: 0,
  },
  {
    id: 'batch-005',
    name: '测试工程师批量优化',
    remark: '测试岗JD匹配',
    type: '岗位匹配优化',
    resumeCount: 20,
    status: 'failed',
    progress: 20,
    createdAt: '2025-05-31 18:20',
    creator: '张小明',
    failedCount: 4,
  },
  {
    id: 'batch-006',
    name: '运维工程师优化任务',
    remark: '运维岗位通用优化',
    type: '通用优化',
    resumeCount: 15,
    status: 'terminated',
    progress: 30,
    createdAt: '2025-05-31 09:40',
    creator: '张小明',
    failedCount: 0,
  },
  {
    id: 'batch-007',
    name: 'AI算法工程师优化',
    remark: '算法岗JD深度优化',
    type: '岗位匹配优化',
    resumeCount: 18,
    status: 'queued',
    progress: 0,
    createdAt: '2025-05-30 15:10',
    creator: '张小明',
    failedCount: 0,
  },
  {
    id: 'batch-008',
    name: '后端工程师批量优化',
    remark: '后端岗位定向优化',
    type: '岗位匹配优化',
    resumeCount: 24,
    status: 'completed',
    progress: 100,
    createdAt: '2025-05-30 10:00',
    creator: '张小明',
    failedCount: 0,
  },
]

export default function BatchOptimizePage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [tasks, setTasks] = useState<BatchTask[]>(initialTasks)

  // filters
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null)

  // drawer
  const [selectedTask, setSelectedTask] = useState<BatchTask | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailStatus, setDetailStatus] = useState<BatchStatus | null>(null)

  // create modal
  const [createOpen, setCreateOpen] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [resumeOptions, setResumeOptions] = useState<ResumeRecord[]>([])
  const [jobOptions, setJobOptions] = useState<{ id: string; title: string }[]>([])
  const [sourceResumeId, setSourceResumeId] = useState<string | null>(null)
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const t = getToken()
    if (!t) {
      router.push('/login')
      return
    }
    setToken(t)
    router.prefetch('/resumes')
    router.prefetch('/jobs')
  }, [router])

  useEffect(() => {
    if (!token) return
    setLoading(true)
    const timer = setTimeout(() => setLoading(false), 400)
    return () => clearTimeout(timer)
  }, [token])

  const stats = useMemo(() => {
    const total = tasks.length
    const running = tasks.filter((t) => t.status === 'running').length
    const completed = tasks.filter((t) => t.status === 'completed').length
    const failed = tasks.filter((t) => t.status === 'failed').length
    const terminated = tasks.filter((t) => t.status === 'terminated').length
    const rate = completed + failed > 0 ? ((completed / (completed + failed)) * 100).toFixed(1) : '0.0'

    return [
      {
        label: '全部任务',
        value: total,
        icon: <SnippetsOutlined />,
        iconBg: 'var(--primary-50)',
        iconColor: 'var(--primary-600)',
        trend: '较昨日 +1',
        trendUp: true,
      },
      {
        label: '运行中',
        value: running,
        icon: <PlayCircleOutlined />,
        iconBg: 'var(--success-50)',
        iconColor: 'var(--success-600)',
        trend: '较昨日 +2',
        trendUp: true,
      },
      {
        label: '已完成',
        value: completed,
        icon: <CheckCircleOutlined />,
        iconBg: 'var(--primary-50)',
        iconColor: 'var(--primary-600)',
        trend: '较昨日 +3',
        trendUp: true,
      },
      {
        label: '失败/终止',
        value: failed + terminated,
        icon: <CloseCircleOutlined />,
        iconBg: 'var(--error-50)',
        iconColor: 'var(--error-600)',
        trend: '较昨日 0',
        trendUp: true,
      },
      {
        label: '成功率',
        value: `${rate}%`,
        icon: <CheckCircleOutlined />,
        iconBg: 'var(--success-50)',
        iconColor: 'var(--success-600)',
        trend: '较昨日 -1.2%',
        trendUp: false,
      },
    ]
  }, [tasks])

  const filteredTasks = useMemo(() => {
    let data = tasks.filter((t) => {
      const k = keyword.trim()
      const matchKeyword =
        !k || t.name.includes(k) || t.remark.includes(k) || t.creator.includes(k)
      const matchStatus = statusFilter === 'all' || t.status === statusFilter
      const matchType = typeFilter === 'all' || t.type === typeFilter

      let matchDate = true
      if (dateRange) {
        const d = dayjs(t.createdAt)
        const start = dateRange[0].startOf('day')
        const end = dateRange[1].endOf('day')
        matchDate = (d.isAfter(start) || d.isSame(start)) && (d.isBefore(end) || d.isSame(end))
      }
      return matchKeyword && matchStatus && matchType && matchDate
    })

    data = data.sort((a, b) => {
      const da = dayjs(a.createdAt)
      const db = dayjs(b.createdAt)
      return sortOrder === 'desc' ? db.valueOf() - da.valueOf() : da.valueOf() - db.valueOf()
    })

    return data
  }, [tasks, keyword, statusFilter, typeFilter, sortOrder, dateRange])

  const resetFilters = useCallback(() => {
    setKeyword('')
    setStatusFilter('all')
    setTypeFilter('all')
    setSortOrder('desc')
    setDateRange(null)
  }, [])

  const applyFilters = useCallback(() => {
    message.success('筛选已应用')
  }, [])

  const handleRowClick = useCallback((record: BatchTask) => {
    setSelectedTask(record)
    setDrawerOpen(true)
  }, [])

  const getActionItems = useCallback(
    (record: BatchTask): MenuProps['items'] => {
      const items: MenuProps['items'] = [
        {
          key: 'view',
          icon: <EyeOutlined />,
          label: '查看详情',
          onClick: () => handleRowClick(record),
        },
      ]
      if (record.status === 'running') {
        items.push({
          key: 'pause',
          icon: <PauseCircleOutlined />,
          label: '暂停任务',
          onClick: () => message.info('任务已暂停'),
        })
        items.push({
          key: 'terminate',
          icon: <CloseCircleOutlined />,
          label: '终止任务',
          onClick: () => message.warning('任务已终止'),
        })
      }
      if (record.status === 'completed') {
        items.push({
          key: 'download',
          icon: <DownloadOutlined />,
          label: '下载全部结果',
          onClick: () => message.success('开始下载结果文件'),
        })
      }
      items.push({
        key: 'delete',
        icon: <CloseCircleOutlined />,
        label: '删除记录',
        onClick: () => message.info('记录已删除'),
      })
      return items
    },
    [handleRowClick]
  )

  const columns: TableColumnsType<BatchTask> = [
    {
      title: '任务信息',
      key: 'info',
      render: (_, record) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 'var(--radius-md)',
              background: 'var(--primary-50)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--primary-600)',
              fontSize: 18,
            }}
          >
            <FileTextOutlined />
          </div>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{record.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              备注：{record.remark}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (value: TaskType) => (
        <span style={{ color: 'var(--text-secondary)' }}>{value}</span>
      ),
    },
    {
      title: '简历数量',
      dataIndex: 'resumeCount',
      key: 'resumeCount',
      render: (value: number) => (
        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{value} 份</span>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (value: TaskStatus) => <StatusTag status={value} />,
    },
    {
      title: '进度',
      dataIndex: 'progress',
      key: 'progress',
      render: (value: number, record) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Progress
            percent={value}
            size="small"
            showInfo={false}
            style={{ flex: 1, minWidth: 80 }}
            strokeColor={progressColor(record.status)}
            trailColor="var(--gray-100)"
          />
          <span
            style={{
              width: 40,
              textAlign: 'right',
              fontSize: 13,
              color: 'var(--text-secondary)',
            }}
          >
            {value}%
          </span>
        </div>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (value: string) => {
        const [date, time] = value.split(' ')
        return (
          <div>
            <div style={{ color: 'var(--text-primary)' }}>{date}</div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{time}</div>
          </div>
        )
      },
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button
            type="text"
            icon={<EyeOutlined />}
            onClick={(e) => {
              e.stopPropagation()
              handleRowClick(record)
            }}
            style={{ color: 'var(--primary-600)' }}
          >
            查看
          </Button>
          <Dropdown menu={{ items: getActionItems(record) }} placement="bottomRight" arrow>
            <Button
              type="text"
              icon={<MoreOutlined />}
              onClick={(e) => e.stopPropagation()}
              style={{ color: 'var(--text-tertiary)' }}
            />
          </Dropdown>
        </Space>
      ),
    },
  ]

  // detail drawer data
  useEffect(() => {
    if (!drawerOpen || !selectedTask) return

    let interval: ReturnType<typeof setInterval> | null = null

    const fetchDetail = async () => {
      setDetailLoading(true)
      try {
        const fallback: BatchStatus = {
          batch_id: selectedTask.id,
          status: selectedTask.status,
          total_jobs: selectedTask.resumeCount,
          completed_jobs: Math.round((selectedTask.resumeCount * selectedTask.progress) / 100),
          created_at: selectedTask.createdAt,
        }
        const res = await (batch.getStatus(selectedTask.id) as Promise<{ data: BatchStatus }>).catch(
          () => ({ data: fallback })
        )
        setDetailStatus(res.data)
      } finally {
        setDetailLoading(false)
      }
    }

    fetchDetail()
    interval = setInterval(fetchDetail, 2000)

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [drawerOpen, selectedTask?.id])

  const detailDerived = useMemo(() => {
    if (!selectedTask) return null

    const total = detailStatus?.total_jobs ?? selectedTask.resumeCount
    const completed =
      detailStatus?.completed_jobs ?? Math.round((selectedTask.resumeCount * selectedTask.progress) / 100)
    const failed = selectedTask.failedCount
    const processing =
      selectedTask.status === 'running'
        ? Math.min(2, Math.max(0, total - completed - failed))
        : 0
    const pending = Math.max(0, total - completed - failed - processing)
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0

    const names = ['张三', '李四', '王五', '赵六', '钱七', '孙八', '周九', '吴十']
    const positions = ['前端开发工程师', 'Java开发工程师', '产品经理', '数据分析师', '测试工程师', '运维工程师', '算法工程师', '后端开发工程师']

    let index = 0
    const resumeItems: ResumeProcessItem[] = []
    const add = (count: number, status: TaskStatus, prog: number) => {
      for (let i = 0; i < count; i++) {
        index++
        const name = `${names[index % names.length]}-${positions[index % positions.length]}简历.pdf`
        resumeItems.push({
          id: `${selectedTask.id}-resume-${index}`,
          name,
          status,
          progress: prog,
          score: status === 'completed' ? 75 + (index % 20) : undefined,
        })
      }
    }

    add(completed, 'completed', 100)
    add(failed, 'failed', 0)
    add(processing, 'running', 65)
    add(pending, 'queued', 0)

    const base = dayjs(selectedTask.createdAt)
    const logs: TaskLog[] = [
      {
        time: base.format('HH:mm'),
        message: '任务创建成功，已加入队列等待分配资源',
        type: 'success',
      },
      {
        time: base.add(1, 'minute').format('HH:mm'),
        message: '开始处理任务，已分配计算资源',
        type: 'info',
      },
    ]

    if (completed > 0) {
      logs.push({
        time: base.add(3, 'minute').format('HH:mm'),
        message: `简历 1-${Math.min(completed, total)} 处理完成`,
        type: 'success',
      })
    }
    if (processing > 0) {
      logs.push({
        time: base.add(5, 'minute').format('HH:mm'),
        message: `简历 ${completed + 1}-${Math.min(completed + processing, total)} 处理中`,
        type: 'info',
      })
    }
    if (failed > 0) {
      logs.push({
        time: base.add(6, 'minute').format('HH:mm'),
        message: `${failed} 份简历处理失败，请查看详情`,
        type: 'error',
      })
    }

    return { total, completed, failed, processing, pending, progress, resumeItems, logs }
  }, [detailStatus, selectedTask])

  // create modal data
  useEffect(() => {
    if (!createOpen) return
    setSourceResumeId(null)
    setSelectedJobIds([])

    const load = async () => {
      setCreateLoading(true)
      try {
        const [rRes, jRes] = await Promise.all([
          (resumes.list() as Promise<{ data: ResumeRecord[] }>).catch(() => ({ data: [] as ResumeRecord[] })),
          (jobs.list('', '') as Promise<{ data: JobRecord[] }>).catch(() => ({ data: [] as JobRecord[] })),
        ])
        setResumeOptions(rRes.data || [])
        const jList = (jRes.data || []).map((j) => ({
          id: j.id,
          title: j.parsed_job_json?.title || `岗位-${j.id.slice(0, 6)}`,
        }))
        setJobOptions(jList)
      } finally {
        setCreateLoading(false)
      }
    }

    load()
  }, [createOpen])

  const handleJobSelect = (values: string[]) => {
    if (values.length > MAX_JOBS) {
      message.warning(`一次最多优化 ${MAX_JOBS} 个岗位`)
      return
    }
    setSelectedJobIds(values)
  }

  const handleCreate = async () => {
    if (!sourceResumeId) {
      message.warning('请选择源简历')
      return
    }
    if (selectedJobIds.length === 0) {
      message.warning('请至少选择一个目标岗位')
      return
    }
    setSubmitting(true)
    try {
      const res = await batch.optimize(sourceResumeId, selectedJobIds)
      const data = (res.data || {}) as {
        batch_id?: string
        status?: string
        total_jobs?: number
        completed_jobs?: number
      }
      const resume = resumeOptions.find((r) => r.id === sourceResumeId)
      const newTask: BatchTask = {
        id: data.batch_id || `batch-${Date.now()}`,
        name: `${resume?.title || resume?.parsed_json?.personal_info?.name || '未知简历'}批量优化`,
        remark: `针对${selectedJobIds.length}个岗位定向优化`,
        type: '岗位匹配优化',
        resumeCount: selectedJobIds.length,
        status: 'queued',
        progress: 0,
        createdAt: dayjs().format('YYYY-MM-DD HH:mm'),
        creator: '当前用户',
        failedCount: 0,
      }
      setTasks((prev) => [newTask, ...prev])
      setCreateOpen(false)
      setSourceResumeId(null)
      setSelectedJobIds([])
      message.success('批量任务已创建')
    } catch {
      message.error('创建失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  if (!token) return <AuthGate activeKey="batch" />

  return (
    <AppLayout
      activeKey="batch"
      title="批量优化中心"
      subtitle="任务列表"
      headerExtra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setCreateOpen(true)}
        >
          新建批量任务
        </Button>
      }
    >
      <div>
        {/* KPI stat cards */}
        <div className="app-stat-grid">
          {stats.map((s) => (
            <Card key={s.label} className="app-stat-card" bordered={false}>
              <div className="app-stat-header">
                <span className="app-stat-label">{s.label}</span>
                <div
                  className="app-stat-icon"
                  style={{ background: s.iconBg, color: s.iconColor }}
                >
                  {s.icon}
                </div>
              </div>
              <div className="app-stat-value">{s.value}</div>
              <div className="app-stat-footer">
                <span className={`app-stat-trend ${s.trendUp ? 'up' : 'down'}`}>
                  {s.trend}
                </span>
              </div>
            </Card>
          ))}
        </div>

        {/* filter bar */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 'var(--space-3)',
            padding: 'var(--space-4)',
            marginBottom: 'var(--space-6)',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-light)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <Input
            placeholder="搜索任务名称、备注"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            allowClear
            prefix={<SearchOutlined style={{ color: 'var(--text-quaternary)' }} />}
            style={{ width: 240 }}
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 140 }}
            options={[
              { value: 'all', label: '全部状态' },
              { value: 'running', label: '运行中' },
              { value: 'completed', label: '已完成' },
              { value: 'failed', label: '失败' },
              { value: 'terminated', label: '已终止' },
              { value: 'queued', label: '排队中' },
            ]}
          />
          <Select
            value={typeFilter}
            onChange={setTypeFilter}
            style={{ width: 140 }}
            options={[
              { value: 'all', label: '全部类型' },
              { value: '岗位匹配优化', label: '岗位匹配优化' },
              { value: '通用优化', label: '通用优化' },
            ]}
          />
          <Select
            value={sortOrder}
            onChange={setSortOrder}
            style={{ width: 140 }}
            options={[
              { value: 'desc', label: '创建时间降序' },
              { value: 'asc', label: '创建时间升序' },
            ]}
          />
          <RangePicker
            value={dateRange}
            onChange={(dates) => setDateRange(dates as [Dayjs, Dayjs] | null)}
            placeholder={['开始日期', '结束日期']}
            style={{ width: 260 }}
          />
          <div style={{ flex: 1, minWidth: 12 }} />
          <Button icon={<ReloadOutlined />} onClick={resetFilters}>
            重置
          </Button>
          <Button type="primary" icon={<FilterOutlined />} onClick={applyFilters}>
            筛选
          </Button>
        </div>

        {/* task table */}
        <div className="app-card" style={{ overflow: 'hidden' }}>
          <Table
            rowKey="id"
            columns={columns}
            dataSource={filteredTasks}
            loading={loading}
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条`,
              position: ['bottomCenter'],
            }}
            onRow={(record) => ({
              onClick: () => handleRowClick(record),
            })}
          />
        </div>
      </div>

      {/* detail drawer */}
      <Drawer
        title={<span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>任务详情</span>}
        placement="right"
        width={480}
        onClose={() => setDrawerOpen(false)}
        open={drawerOpen}
        styles={{ body: { padding: 0 } }}
      >
        {detailLoading && !detailDerived ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              padding: 'var(--space-12)',
            }}
          >
            <Spin />
          </div>
        ) : !detailDerived || !selectedTask ? (
          <Empty style={{ marginTop: 'var(--space-12)' }} />
        ) : (
          <div style={{ padding: 'var(--space-6)' }}>
            {/* header */}
            <div
              style={{
                display: 'flex',
                gap: 'var(--space-3)',
                marginBottom: 'var(--space-6)',
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--primary-50)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--primary-600)',
                  fontSize: 20,
                }}
              >
                <SnippetsOutlined />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                  }}
                >
                  {selectedTask.name}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>
                  任务类型：{selectedTask.type} · 创建人：{selectedTask.creator}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-quaternary)', marginTop: 2 }}>
                  创建时间：{selectedTask.createdAt}
                </div>
              </div>
              <StatusTag status={(detailStatus?.status as TaskStatus) || selectedTask.status} />
            </div>

            {/* overall progress */}
            <div style={{ marginBottom: 'var(--space-6)' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 'var(--space-3)',
                }}
              >
                <span
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                  }}
                >
                  整体进度
                </span>
                <span
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                  }}
                >
                  {detailDerived.progress}%
                </span>
              </div>
              <Progress
                percent={detailDerived.progress}
                showInfo={false}
                strokeColor="var(--primary-500)"
                trailColor="var(--gray-100)"
                size="small"
              />
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 'var(--space-3)',
                  marginTop: 'var(--space-4)',
                }}
              >
                {[
                  { label: '已完成', value: detailDerived.completed, color: 'var(--success-500)' },
                  { label: '处理中', value: detailDerived.processing, color: 'var(--primary-500)' },
                  { label: '等待中', value: detailDerived.pending, color: 'var(--warning-500)' },
                  { label: '失败', value: detailDerived.failed, color: 'var(--error-500)' },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      padding: 'var(--space-3)',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-page)',
                      border: '1px solid var(--border-light)',
                      textAlign: 'center',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 700,
                        color: item.color,
                      }}
                    >
                      {item.value}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                      {item.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* resume processing list */}
            <div style={{ marginBottom: 'var(--space-6)' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 'var(--space-3)',
                }}
              >
                <span
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                  }}
                >
                  简历处理列表（共 {detailDerived.total} 份）
                </span>
                <Button type="link" size="small" style={{ padding: 0 }}>
                  下载全部结果
                </Button>
              </div>
              <div
                style={{
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-lg)',
                  overflow: 'hidden',
                  background: 'var(--bg-card)',
                }}
              >
                {detailDerived.resumeItems.map((item, idx) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-3)',
                      padding: '12px 16px',
                      borderBottom:
                        idx < detailDerived.resumeItems.length - 1
                          ? '1px solid var(--border-light)'
                          : 'none',
                    }}
                  >
                    <FileTextOutlined style={{ color: 'var(--primary-600)' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {item.name}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                        {STATUS_META[item.status].label}
                        {item.score !== undefined ? ` · 匹配评分：${item.score}` : ''}
                      </div>
                    </div>
                    <div style={{ width: 80, flexShrink: 0 }}>
                      <Progress
                        percent={item.progress}
                        size="small"
                        showInfo={false}
                        strokeColor={progressColor(item.status)}
                        trailColor="var(--gray-100)"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* task logs */}
            <div style={{ marginBottom: 'var(--space-6)' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 'var(--space-3)',
                }}
              >
                <span
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                  }}
                >
                  任务日志
                </span>
                <Button type="link" size="small" style={{ padding: 0 }}>
                  查看更多日志
                </Button>
              </div>
              <div>
                {detailDerived.logs.map((log, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      gap: 'var(--space-3)',
                      padding: '8px 0',
                    }}
                  >
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: LOG_COLOR[log.type],
                        marginTop: 6,
                        flexShrink: 0,
                      }}
                    />
                    <div>
                      <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                        {log.message}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-quaternary)' }}>
                        {log.time}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* actions */}
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              {selectedTask.status === 'running' && (
                <Button icon={<PauseCircleOutlined />}>暂停任务</Button>
              )}
              <Button icon={<CloseCircleOutlined />}>终止任务</Button>
              <Button style={{ marginLeft: 'auto' }} icon={<DownloadOutlined />}>
                下载结果
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* create batch task modal */}
      <Modal
        title="新建批量任务"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        confirmLoading={submitting}
        okText="开始优化"
        cancelText="取消"
      >
        {createLoading ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              padding: 'var(--space-12)',
            }}
          >
            <Spin />
          </div>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                  marginBottom: 'var(--space-2)',
                }}
              >
                选择源简历
              </div>
              <Select
                placeholder="请选择源简历"
                value={sourceResumeId}
                onChange={setSourceResumeId}
                style={{ width: '100%' }}
                options={resumeOptions.map((r) => ({
                  value: r.id,
                  label: r.title || r.id.slice(0, 8),
                }))}
                notFoundContent={<Empty description="暂无简历" />}
              />
            </div>
            <div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                  marginBottom: 'var(--space-2)',
                }}
              >
                选择目标岗位（最多 {MAX_JOBS} 个）
              </div>
              <Select
                mode="multiple"
                placeholder="请选择目标岗位"
                value={selectedJobIds}
                onChange={handleJobSelect}
                style={{ width: '100%' }}
                options={jobOptions.map((j) => ({ value: j.id, label: j.title }))}
                maxTagCount={3}
                notFoundContent={<Empty description="暂无岗位" />}
              />
            </div>
          </Space>
        )}
      </Modal>
    </AppLayout>
  )
}
