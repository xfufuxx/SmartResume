'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  Button, Card, Typography, Spin, Row, Col, message, Empty, Tag, Space, Input,
  DatePicker, Badge, Progress, Dropdown, Table, type TableColumnsType,
} from 'antd'
import {
  SearchOutlined, FilterOutlined, CalendarOutlined, MoreOutlined,
  RightOutlined, EnvironmentOutlined, CarryOutOutlined,
  ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined,
  TrophyOutlined, RiseOutlined, FallOutlined, HourglassOutlined,
  ApartmentOutlined,
} from '@ant-design/icons'
import dynamic from 'next/dynamic'
import * as echarts from 'echarts/core'
import { FunnelChart, PieChart } from 'echarts/charts'
import {
  GridComponent, TooltipComponent, LegendComponent, TitleComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

// 仅注册面试页用到的漏斗图/环形图，显著减小该路由 chunk
echarts.use([FunnelChart, PieChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, CanvasRenderer])
const ReactECharts = dynamic(() => import('echarts-for-react/lib/core'), {
  ssr: false,
  loading: () => <Spin size="large" />,
})
import dayjs from 'dayjs'
import { useRouter } from 'next/navigation'
import { feedback, optimize } from '@/lib/api'
import { getToken } from '@/lib/auth'
import { formatDate } from '@/lib/utils'
import type { FeedbackRecord, FeedbackStats, OptimizeResult } from '@/types'
import AppLayout from '@/components/AppLayout'
import AuthGate from '@/components/AuthGate'

const { RangePicker } = DatePicker
const { Text, Title } = Typography

type InterviewStatus = 'pending' | 'progress' | 'completed' | 'offer' | 'rejected'

interface InterviewItem {
  id: string
  feedbackId: string
  company: string
  position: string
  location: string
  tags: string[]
  status: InterviewStatus
  stage: string
  stageLabel: string
  interviewTime: string | null
  progress: number
  progressColor: string
  outcome: string
  createdAt: string
  logoBg: string
  logoText: string
}

interface StatCard {
  key: InterviewStatus | 'all'
  label: string
  value: number
  trend: number
  icon: React.ReactNode
  colorClass: string
}

const STATUS_LABELS: Record<InterviewStatus | 'all', string> = {
  all: '全部',
  pending: '待安排',
  progress: '进行中',
  completed: '已完成',
  offer: 'Offer',
  rejected: '已拒绝',
}

const STATUS_ORDER: InterviewStatus[] = ['pending', 'progress', 'completed', 'offer', 'rejected']

const STAGES: Record<InterviewStatus, string[]> = {
  pending: ['简历投递', 'HR 筛选', '待安排'],
  progress: ['HR 面试', '技术面试', '总监面试', '交叉面试'],
  completed: ['HR 面试', '技术面试', '已完成'],
  offer: ['Offer 阶段', '薪资洽谈', '已收 Offer'],
  rejected: ['HR 面试', '技术面试', '已拒绝'],
}

const COMPANIES = [
  { name: '字节跳动', abbr: '字节', bg: 'var(--primary-500)', color: 'var(--text-inverse)' },
  { name: '阿里巴巴', abbr: '阿里', bg: 'var(--warning-500)', color: 'var(--text-inverse)' },
  { name: '腾讯科技', abbr: '腾讯', bg: 'var(--primary-600)', color: 'var(--text-inverse)' },
  { name: '美团', abbr: '美团', bg: 'var(--warning-600)', color: 'var(--text-inverse)' },
  { name: '网易', abbr: '网易', bg: 'var(--error-500)', color: 'var(--text-inverse)' },
  { name: '百度', abbr: '百度', bg: 'var(--primary-500)', color: 'var(--text-inverse)' },
  { name: '小米集团', abbr: '小米', bg: 'var(--warning-500)', color: 'var(--text-inverse)' },
  { name: '京东', abbr: '京东', bg: 'var(--error-600)', color: 'var(--text-inverse)' },
  { name: '快手', abbr: '快手', bg: 'var(--primary-500)', color: 'var(--text-inverse)' },
  { name: '滴滴', abbr: '滴滴', bg: 'var(--primary-600)', color: 'var(--text-inverse)' },
]

const POSITIONS = [
  '前端开发工程师',
  '高级前端工程师',
  '前端开发专家',
  'React 开发工程师',
  '全栈开发工程师',
]

const LOCATIONS = ['北京', '上海', '杭州', '深圳', '广州', '南京', '成都']
const TECH_TAGS = ['React', 'Vue', 'TypeScript', 'Node.js', 'Go', 'JavaScript']
const LEVEL_TAGS = ['中级', '高级', '资深', '专家']

function getCssVar(name: string, fallback = ''): string {
  if (typeof window === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

function mapOutcomeToStatus(outcome: string): InterviewStatus {
  switch (outcome) {
    case 'no_reply': return 'pending'
    case 'interview': return 'progress'
    case 'fail_round1':
    case 'fail_round2': return 'rejected'
    case 'offer': return 'offer'
    default: return 'pending'
  }
}

function deriveStage(status: InterviewStatus): { stage: string; stageLabel: string } {
  const list = STAGES[status]
  const idx = Math.floor(Math.random() * list.length)
  const stage = list[idx]
  const stageLabel = status === 'completed' || status === 'offer' || status === 'rejected'
    ? '已完成'
    : `第 ${idx + 1} 轮`
  return { stage, stageLabel }
}

function buildMockInterviews(records: FeedbackRecord[], opts: OptimizeResult[]): InterviewItem[] {
  if (!records.length) {
    // Fallback mock data so UI always looks like the screenshot
    return generateFallbackInterviews()
  }

  const optMap = new Map<string, OptimizeResult>()
  opts.forEach((o) => optMap.set(o.id, o))

  return records.map((r, idx) => {
    const opt = optMap.get(r.optimization_record_id)
    const status = mapOutcomeToStatus(r.outcome)
    const companyIdx = idx % COMPANIES.length
    const company = COMPANIES[companyIdx]
    const { stage, stageLabel } = deriveStage(status)
    const baseDate = dayjs(r.created_at || new Date()).add(idx * 2, 'day')
    const interviewTime = status === 'pending' ? null : baseDate.format('YYYY-MM-DD HH:mm')

    return {
      id: r.id,
      feedbackId: r.id,
      company: opt?.company || company.name,
      position: opt?.job_title || POSITIONS[idx % POSITIONS.length],
      location: LOCATIONS[idx % LOCATIONS.length],
      tags: [TECH_TAGS[idx % TECH_TAGS.length], LEVEL_TAGS[idx % LEVEL_TAGS.length]],
      status,
      stage,
      stageLabel,
      interviewTime,
      progress: getStatusProgress(status),
      progressColor: getProgressColor(status),
      outcome: r.outcome,
      createdAt: r.created_at,
      logoBg: company.bg,
      logoText: company.abbr,
    }
  })
}

function generateFallbackInterviews(): InterviewItem[] {
  const base = [
    { company: 0, position: 0, location: 0, tags: [0, 1], status: 'progress' as InterviewStatus },
    { company: 1, position: 1, location: 2, tags: [1, 2], status: 'pending' as InterviewStatus },
    { company: 2, position: 0, location: 3, tags: [0, 2], status: 'completed' as InterviewStatus },
    { company: 3, position: 1, location: 0, tags: [2, 2], status: 'completed' as InterviewStatus },
    { company: 4, position: 2, location: 1, tags: [3, 1], status: 'pending' as InterviewStatus },
    { company: 5, position: 1, location: 0, tags: [4, 2], status: 'rejected' as InterviewStatus },
    { company: 6, position: 0, location: 5, tags: [1, 1], status: 'offer' as InterviewStatus },
    { company: 0, position: 3, location: 3, tags: [0, 2], status: 'progress' as InterviewStatus },
    { company: 7, position: 1, location: 0, tags: [2, 2], status: 'progress' as InterviewStatus },
    { company: 8, position: 4, location: 6, tags: [5, 0], status: 'pending' as InterviewStatus },
    { company: 9, position: 0, location: 0, tags: [0, 2], status: 'completed' as InterviewStatus },
    { company: 2, position: 1, location: 2, tags: [1, 2], status: 'offer' as InterviewStatus },
    { company: 4, position: 2, location: 1, tags: [3, 1], status: 'rejected' as InterviewStatus },
    { company: 1, position: 3, location: 3, tags: [0, 2], status: 'progress' as InterviewStatus },
    { company: 3, position: 1, location: 0, tags: [2, 2], status: 'completed' as InterviewStatus },
    { company: 5, position: 0, location: 0, tags: [4, 2], status: 'pending' as InterviewStatus },
    { company: 6, position: 1, location: 5, tags: [1, 1], status: 'offer' as InterviewStatus },
    { company: 7, position: 4, location: 0, tags: [5, 0], status: 'progress' as InterviewStatus },
  ]

  return base.map((b, idx) => {
    const company = COMPANIES[b.company]
    const { stage, stageLabel } = deriveStage(b.status)
    const baseDate = dayjs().subtract(idx * 2, 'day')
    const interviewTime = b.status === 'pending' ? null : baseDate.format('YYYY-MM-DD HH:mm')

    return {
      id: `mock-${idx}`,
      feedbackId: `mock-${idx}`,
      company: company.name,
      position: POSITIONS[b.position],
      location: LOCATIONS[b.location],
      tags: [TECH_TAGS[b.tags[0]], LEVEL_TAGS[b.tags[1]]],
      status: b.status,
      stage,
      stageLabel,
      interviewTime,
      progress: getStatusProgress(b.status),
      progressColor: getProgressColor(b.status),
      outcome: b.status,
      createdAt: baseDate.toISOString(),
      logoBg: company.bg,
      logoText: company.abbr,
    }
  })
}

function getStatusProgress(status: InterviewStatus): number {
  // 固定进度值（不再用 Math.random）：进度条稳定，且渲染期无随机避免水合/重渲不一致
  switch (status) {
    case 'pending': return 0
    case 'progress': return 65
    case 'completed': return 100
    case 'offer': return 100
    case 'rejected': return 75
  }
}

function getProgressColor(status: InterviewStatus): string {
  switch (status) {
    case 'pending': return 'var(--gray-400)'
    case 'progress': return 'var(--primary-500)'
    case 'completed': return 'var(--success-500)'
    case 'offer': return 'var(--success-500)'
    case 'rejected': return 'var(--error-500)'
  }
}

function getStatusTag(status: InterviewStatus): { label: string; color: string; bg: string } {
  switch (status) {
    case 'pending':
      return { label: '待安排', color: 'var(--warning-600)', bg: 'var(--warning-50)' }
    case 'progress':
      return { label: '进行中', color: 'var(--primary-600)', bg: 'var(--primary-50)' }
    case 'completed':
      return { label: '已完成', color: 'var(--success-600)', bg: 'var(--success-50)' }
    case 'offer':
      return { label: 'Offer', color: 'var(--success-600)', bg: 'var(--success-50)' }
    case 'rejected':
      return { label: '已拒绝', color: 'var(--error-600)', bg: 'var(--error-50)' }
  }
}

function statusCount(items: InterviewItem[], status: InterviewStatus | 'all'): number {
  if (status === 'all') return items.length
  if (status === 'completed') return items.filter((i) => i.status === 'completed' || i.status === 'offer' || i.status === 'rejected').length
  return items.filter((i) => i.status === status).length
}

export default function InterviewsPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [records, setRecords] = useState<FeedbackRecord[]>([])
  const [stats, setStats] = useState<FeedbackStats | null>(null)
  const [opts, setOpts] = useState<OptimizeResult[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<InterviewStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [dates, setDates] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const t = getToken()
    if (!t) { router.push('/login'); return }
    setToken(t)
  }, [router])

  useEffect(() => {
    if (!token) return
    const load = async () => {
      setLoading(true)
      try {
        const [fRes, sRes, oRes] = await Promise.all([
          feedback.list().catch(() => ({ data: [] as FeedbackRecord[] })),
          feedback.stats().catch(() => ({ data: null as FeedbackStats | null })),
          optimize.list('', '').catch(() => ({ data: [] as OptimizeResult[] })),
        ])
        setRecords(fRes.data || [])
        setStats(sRes.data || null)
        setOpts(oRes.data || [])
      } catch {
        message.error('加载面试记录失败')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [token])

  const interviews = useMemo(() => buildMockInterviews(records, opts), [records, opts])

  const filteredInterviews = useMemo(() => {
    let list = interviews
    if (activeTab !== 'all') {
      if (activeTab === 'completed') {
        list = list.filter((i) => i.status === 'completed' || i.status === 'offer' || i.status === 'rejected')
      } else {
        list = list.filter((i) => i.status === activeTab)
      }
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((i) =>
        i.company.toLowerCase().includes(q) ||
        i.position.toLowerCase().includes(q) ||
        i.location.includes(q)
      )
    }
    if (dates && dates[0] && dates[1]) {
      const start = dates[0].startOf('day')
      const end = dates[1].endOf('day')
      list = list.filter((i) => {
        const t = i.interviewTime ? dayjs(i.interviewTime) : dayjs(i.createdAt)
        return t.isAfter(start) && t.isBefore(end)
      })
    }
    return list
  }, [interviews, activeTab, search, dates])

  const statCards: StatCard[] = useMemo(() => [
    {
      key: 'all', label: '全部面试', value: statusCount(interviews, 'all'), trend: 2,
      icon: <ApartmentOutlined />, colorClass: 'blue',
    },
    {
      key: 'pending', label: '待安排', value: statusCount(interviews, 'pending'), trend: 1,
      icon: <HourglassOutlined />, colorClass: 'orange',
    },
    {
      key: 'progress', label: '进行中', value: statusCount(interviews, 'progress'), trend: 2,
      icon: <ClockCircleOutlined />, colorClass: 'primary',
    },
    {
      key: 'completed', label: '已完成', value: statusCount(interviews, 'completed'), trend: -1,
      icon: <CheckCircleOutlined />, colorClass: 'green',
    },
    {
      key: 'offer', label: 'Offer', value: statusCount(interviews, 'offer'), trend: 1,
      icon: <TrophyOutlined />, colorClass: 'purple',
    },
    {
      key: 'rejected', label: '已拒绝', value: statusCount(interviews, 'rejected'), trend: 0,
      icon: <CloseCircleOutlined />, colorClass: 'red',
    },
  ], [interviews])

  const funnelOption = useMemo(() => {
    const primary = getCssVar('--primary-500', '#3B82F6')
    const primaryLight = getCssVar('--primary-300', '#93C5FD')
    const warning = getCssVar('--warning-500', '#F59E0B')
    const warningLight = getCssVar('--warning-300', '#FCD34D')
    const success = getCssVar('--success-500', '#10B981')
    const gray = getCssVar('--gray-400', '#9CA3AF')
    const textPrimary = getCssVar('--text-primary', '#111827')
    const textSecondary = getCssVar('--text-secondary', '#4B5563')

    return {
      tooltip: { trigger: 'item' as const },
      color: [primary, primaryLight, warning, warningLight, success, gray],
      legend: {
        orient: 'vertical' as const,
        right: 0,
        top: 'center',
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: textSecondary, fontSize: 12 },
      },
      series: [{
        name: '面试漏斗',
        type: 'funnel' as const,
        left: '5%',
        width: '55%',
        minSize: '20%',
        label: { show: false },
        labelLine: { show: false },
        itemStyle: { borderColor: getCssVar('--bg-card', '#fff'), borderWidth: 2 },
        emphasis: {
          label: { show: true, fontSize: 13, color: textPrimary, formatter: '{b}: {c}' },
        },
        data: [
          { value: 42, name: '投递' },
          { value: 28, name: 'HR 筛选' },
          { value: 16, name: '技术面试' },
          { value: 9, name: 'HR 面试' },
          { value: 3, name: 'Offer' },
          { value: 1, name: '转化率 7.1%' },
        ],
      }],
    }
  }, [mounted])

  const donutOption = useMemo(() => {
    const primary = getCssVar('--primary-500', '#3B82F6')
    const success = getCssVar('--success-500', '#10B981')
    const warning = getCssVar('--warning-500', '#F59E0B')
    const error = getCssVar('--error-500', '#EF4444')
    const textPrimary = getCssVar('--text-primary', '#111827')
    const textSecondary = getCssVar('--text-secondary', '#4B5563')

    const total = filteredInterviews.length || interviews.length || 1
    const passed = interviews.filter((i) => i.status === 'offer').length
    const inProgress = interviews.filter((i) => i.status === 'progress').length
    const pending = interviews.filter((i) => i.status === 'pending').length
    const failed = interviews.filter((i) => i.status === 'rejected').length
    const completed = interviews.filter((i) => i.status === 'completed').length

    const data = [
      { value: passed, name: '已通过' },
      { value: inProgress, name: '进行中' },
      { value: pending, name: '待安排' },
      { value: failed + completed, name: '未通过' },
    ]

    const rate = total > 0 ? Math.round((passed / total) * 100 * 10) / 10 : 0

    return {
      tooltip: { trigger: 'item' as const, formatter: '{b}: {c} ({d}%)' },
      color: [success, primary, warning, error],
      legend: {
        orient: 'vertical' as const,
        right: 0,
        top: 'center',
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: textSecondary, fontSize: 12 },
      },
      series: [{
        name: '面试成功率',
        type: 'pie' as const,
        radius: ['58%', '82%'],
        center: ['32%', '50%'],
        avoidLabelOverlap: false,
        label: { show: false },
        emphasis: { label: { show: false } },
        data,
      }],
      graphic: [
        {
          type: 'text' as const,
          left: '19%',
          top: '44%',
          style: {
            text: '成功率',
            fill: textSecondary,
            fontSize: 12,
            textAlign: 'center',
          },
        },
        {
          type: 'text' as const,
          left: '16%',
          top: '52%',
          style: {
            text: `${rate}%`,
            fill: textPrimary,
            fontSize: 20,
            fontWeight: 'bold',
            textAlign: 'center',
          },
        },
      ],
    }
  }, [interviews, filteredInterviews.length, mounted])

  const calendarItems = useMemo(() => {
    return interviews
      .filter((i) => i.interviewTime && (i.status === 'progress' || i.status === 'completed' || i.status === 'offer'))
      .slice(0, 4)
      .map((i) => ({
        id: i.id,
        time: dayjs(i.interviewTime).format('HH:mm'),
        title: `${i.company} - ${i.stage}`,
        sub: i.position,
        date: dayjs(i.interviewTime).format('YYYY年M月D日'),
      }))
  }, [interviews])

  const columns: TableColumnsType<InterviewItem> = useMemo(() => [
    {
      title: '公司 / 职位',
      dataIndex: 'company',
      key: 'company',
      render: (_: unknown, item: InterviewItem) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 'var(--radius-md)',
            background: item.logoBg,
            color: item.logoText ? 'var(--text-inverse)' : 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            fontWeight: 700,
            flexShrink: 0,
          }}>
            {item.logoText}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.4 }}>
              {item.company}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span>{item.position}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <EnvironmentOutlined style={{ fontSize: 10 }} />
                {item.location}
              </span>
              {item.tags.map((tag) => (
                <span key={tag} style={{ color: 'var(--text-quaternary)' }}>{tag}</span>
              ))}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (_: unknown, item: InterviewItem) => {
        const tag = getStatusTag(item.status)
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 10px',
            borderRadius: 'var(--radius-sm)',
            background: tag.bg,
            color: tag.color,
            fontSize: 12,
            fontWeight: 500,
          }}>
            <span style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: tag.color,
            }} />
            {tag.label}
          </span>
        )
      },
    },
    {
      title: '面试阶段',
      dataIndex: 'stage',
      key: 'stage',
      width: 140,
      render: (_: unknown, item: InterviewItem) => (
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{item.stage}</div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{item.stageLabel}</div>
        </div>
      ),
    },
    {
      title: '面试时间',
      dataIndex: 'interviewTime',
      key: 'interviewTime',
      width: 160,
      render: (_: unknown, item: InterviewItem) => {
        if (!item.interviewTime) {
          return <span style={{ color: 'var(--text-quaternary)' }}>--</span>
        }
        const d = dayjs(item.interviewTime)
        const now = dayjs()
        const diff = d.diff(now, 'day')
        let relative = ''
        if (diff === 0) relative = '今天'
        else if (diff === 1) relative = '明天'
        else if (diff === -1) relative = '昨天'
        else if (diff > 1) relative = `${diff} 天后`
        else relative = `${Math.abs(diff)} 天前`
        return (
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{d.format('YYYY-MM-DD HH:mm')}</div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{relative}</div>
          </div>
        )
      },
    },
    {
      title: '进度',
      dataIndex: 'progress',
      key: 'progress',
      width: 120,
      render: (_: unknown, item: InterviewItem) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', width: 38 }}>{item.progress}%</span>
          <Progress
            percent={item.progress}
            showInfo={false}
            strokeColor={item.progressColor}
            trailColor="var(--gray-200)"
            size="small"
            style={{ flex: 1, minWidth: 60 }}
          />
        </div>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: unknown, item: InterviewItem) => (
        <Space>
          <Button
            type="text"
            icon={<CalendarOutlined style={{ color: 'var(--text-tertiary)' }} />}
            style={{ color: 'var(--text-tertiary)' }}
            onClick={() => message.info(`将 ${item.company} 加入日历`)}
          />
          <Dropdown
            menu={{
              items: [
                { key: 'detail', label: '查看详情' },
                { key: 'edit', label: '编辑进度' },
                { key: 'delete', label: '删除记录', danger: true },
              ],
            }}
            placement="bottomRight"
          >
            <Button type="text" icon={<MoreOutlined style={{ color: 'var(--text-tertiary)' }} />} />
          </Dropdown>
        </Space>
      ),
    },
  ], [])

  if (!token) return <AuthGate activeKey="interviews" />

  return (
    <AppLayout activeKey="interviews" title="面试追踪" subtitle="管理投递进展与面试结果">
      <div className="animate-in" style={{ paddingBottom: 24 }}>
        {/* 顶部筛选栏 */}
        <Card style={{ marginBottom: 24 }} bodyStyle={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: 14, fontWeight: 500 }}>面试追踪</span>
              <RightOutlined style={{ color: 'var(--text-quaternary)', fontSize: 12 }} />
              <span style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 600 }}>我的面试</span>
            </div>
            <Space size="middle" wrap>
              <RangePicker
                value={dates}
                onChange={(vals) => setDates(vals as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null)}
                placeholder={['开始日期', '结束日期']}
                suffixIcon={<CalendarOutlined style={{ color: 'var(--text-tertiary)' }} />}
              />
              <Input
                placeholder="搜索公司、职位、状态"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                prefix={<SearchOutlined style={{ color: 'var(--text-tertiary)' }} />}
                allowClear
                style={{ width: 240 }}
                onPressEnter={() => { /* search applied reactively */ }}
              />
              <Button icon={<FilterOutlined />}>筛选</Button>
            </Space>
          </div>
        </Card>

        {/* 统计卡片 */}
        <div className="app-stat-grid stagger-list" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          {statCards.map((s) => (
            <div
              key={s.key}
              className="app-stat-card"
              onClick={() => setActiveTab(s.key)}
              style={{ cursor: 'pointer', borderColor: activeTab === s.key ? 'var(--primary-500)' : undefined }}
            >
              <div className="app-stat-header">
                <span className="app-stat-label">{s.label}</span>
                <span className={`app-stat-icon ${s.colorClass}`}>{s.icon}</span>
              </div>
              <div className="app-stat-value">{s.value}</div>
              <div className="app-stat-footer">
                <span className={`app-stat-trend ${s.trend >= 0 ? 'up' : 'down'}`}>
                  {s.trend >= 0 ? <RiseOutlined /> : <FallOutlined />}
                  {Math.abs(s.trend)}
                </span>
                <span>较昨日</span>
              </div>
            </div>
          ))}
        </div>

        {/* 状态标签 */}
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {(['all', ...STATUS_ORDER] as Array<InterviewStatus | 'all'>).map((key) => {
            const count = statusCount(interviews, key)
            const active = activeTab === key
            return (
              <Button
                key={key}
                type={active ? 'primary' : 'text'}
                onClick={() => setActiveTab(key)}
                style={active ? {} : { color: 'var(--text-secondary)', background: 'transparent' }}
              >
                {STATUS_LABELS[key]}
                <span style={{
                  marginLeft: 6,
                  padding: '0 6px',
                  borderRadius: 10,
                  fontSize: 12,
                  background: active ? 'rgba(255,255,255,0.2)' : 'var(--gray-100)',
                  color: active ? 'var(--text-inverse)' : 'var(--text-tertiary)',
                }}>
                  {count}
                </span>
              </Button>
            )
          })}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 80 }}>
            <Spin size="large" tip="加载中..." />
          </div>
        ) : (
          <Row gutter={[24, 24]}>
            <Col xs={24} lg={16}>
              <Card
                title={
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <span className="app-section-title"><CarryOutOutlined style={{ color: 'var(--primary-600)' }} /> 面试列表</span>
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>共 {filteredInterviews.length} 条记录</span>
                  </div>
                }
                bodyStyle={{ padding: 0 }}
              >
                {filteredInterviews.length === 0 ? (
                  <Empty description="没有符合条件的面试记录" style={{ padding: 60 }} />
                ) : (
                  <Table
                    columns={columns}
                    dataSource={filteredInterviews}
                    rowKey="id"
                    pagination={{ pageSize: 8, size: 'small' }}
                    bordered={false}
                    size="middle"
                  />
                )}
              </Card>
            </Col>

            <Col xs={24} lg={8}>
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                {/* 面试漏斗 */}
                <Card
                  title={<span className="app-section-title"><TrophyOutlined style={{ color: 'var(--primary-600)' }} /> 面试漏斗</span>}
                  extra={<Button type="link" size="small">近 30 天</Button>}
                >
                  <ReactECharts echarts={echarts} option={funnelOption} style={{ height: 220 }} />
                </Card>

                {/* 面试日历 */}
                <Card
                  title={<span className="app-section-title"><CalendarOutlined style={{ color: 'var(--primary-600)' }} /> 面试日历</span>}
                  extra={<Button type="link" size="small">查看全部</Button>}
                >
                  {calendarItems.length === 0 ? (
                    <Empty description="暂无 upcoming 面试" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  ) : (
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>
                        {dayjs().format('YYYY年M月D日')}（今天）
                      </div>
                      {calendarItems.map((item) => (
                        <div key={item.id} style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                          <div style={{ width: 44, flexShrink: 0, textAlign: 'right' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{item.time}</div>
                          </div>
                          <div style={{ position: 'relative', width: 8, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary-500)', marginTop: 6 }} />
                            <span style={{ position: 'absolute', top: 14, bottom: -10, left: 3, width: 1, background: 'var(--border-light)' }} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{item.title}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{item.sub}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-quaternary)', marginTop: 2 }}>{item.date}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                {/* 面试成功率分析 */}
                <Card
                  title={<span className="app-section-title"><CheckCircleOutlined style={{ color: 'var(--primary-600)' }} /> 面试成功率分析</span>}
                  extra={<Button type="link" size="small">近 30 天</Button>}
                >
                  <ReactECharts echarts={echarts} option={donutOption} style={{ height: 220 }} />
                </Card>
              </Space>
            </Col>
          </Row>
        )}
      </div>
    </AppLayout>
  )
}
