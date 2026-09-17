'use client'

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import {
  Layout, Button, Card, Typography, Spin, message, Tabs, Row, Col,
  Table, Tag, Space, Statistic, Select, Input, Modal, Empty, Popconfirm,
  Form, InputNumber, Radio, Badge, Descriptions, Divider, Tooltip, Progress,
  Avatar, DatePicker, Dropdown, Segmented,
} from 'antd'
import type { TableColumnsType, MenuProps } from 'antd'
import {
  LogoutOutlined, HomeOutlined, UserOutlined,
  DashboardOutlined, SettingOutlined, TeamOutlined,
  BarChartOutlined, FileTextOutlined, AuditOutlined,
  ApiOutlined, MonitorOutlined,
  MessageOutlined, KeyOutlined, SafetyOutlined,
  RobotOutlined, ThunderboltOutlined, ReloadOutlined,
  SearchOutlined, PlusOutlined, EditOutlined, DeleteOutlined,
  SendOutlined, EyeOutlined, StopOutlined, CheckCircleOutlined,
  ExclamationCircleOutlined, ClockCircleOutlined, RiseOutlined,
  FallOutlined, FundOutlined, PieChartOutlined, LineChartOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined, BellOutlined,
  DownOutlined, MoreOutlined, SyncOutlined,
  FileSyncOutlined, FileProtectOutlined,
  ClusterOutlined, WarningOutlined, DatabaseOutlined,
  DesktopOutlined, MobileOutlined, TabletOutlined,
  GlobalOutlined, CarryOutOutlined, CloseCircleOutlined,
  PauseCircleOutlined, PlayCircleOutlined, SunOutlined, MoonOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import ReactEChartsCore from 'echarts-for-react/lib/core'
import * as echarts from 'echarts/core'
import { LineChart, BarChart, PieChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

import { admin } from '@/lib/api'
import { getToken, clearAdminAuth } from '@/lib/auth'
import { formatDate } from '@/lib/utils'
import type {
  AdminUser, AdminUserDetail, DashboardCore, IndustryItem, MatchTrend,
  FeatureUsage, JobTrendItem, SatisfactionTrend, TaskStats, FailedTask,
  PromptItem, PromptDetail, ModelConfig, CallLog, TemplateItem, KeywordItem,
  ATSRuleItem, FeedbackItem,
  TicketItem, TicketDetail, AdminLogItem, QuotaConfig,
} from '@/types'
import { useTheme } from '@/lib/theme'
import AuthGate from '@/components/AuthGate'

echarts.use([LineChart, BarChart, PieChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, CanvasRenderer])

const { Header, Sider, Content } = Layout
const { TextArea } = Input
const { RangePicker } = DatePicker

type ChartOption = any

const SCENE_LABELS: Record<string, string> = {
  work_experience: '工作经历', summary: '个人总结', project: '项目经验',
  skill_fill: '关键词填充', star_rewrite: 'STAR重写', general: '通用优化',
}
const STATUS_COLOR: Record<string, string> = { active: 'success', frozen: 'error', deleted_pending: 'warning' }
const STATUS_LABEL: Record<string, string> = { active: '正常', frozen: '已封禁', deleted_pending: '注销中' }
const TICKET_CATEGORY: Record<string, string> = { bug: '功能故障', content_error: '内容错误', refund: '退款问题', other: '其他' }

const ADMIN_MENU = [
  { key: 'dashboard', icon: <DashboardOutlined />, label: '首页' },
  { key: 'users', icon: <TeamOutlined />, label: '用户管理' },
  { key: 'content', icon: <FileTextOutlined />, label: '内容管理' },
  { key: 'ai', icon: <RobotOutlined />, label: 'AI模型管理' },
  { key: 'monitor', icon: <MonitorOutlined />, label: '任务监控中心' },
  { key: 'feedback', icon: <MessageOutlined />, label: '工单反馈中心' },
  { key: 'logs', icon: <AuditOutlined />, label: '审计日志中心' },
  { key: 'settings', icon: <SettingOutlined />, label: '系统设置' },
]

function formatNumber(n: number): string {
  return n.toLocaleString('zh-CN')
}

function formatPercent(n: number, digits = 1): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`
}

function cssVar(name: string): string {
  return `var(${name})`
}

function resolveCssVar(name: string, fallback = ''): string {
  if (typeof window === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

function useCssVars() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    setReady(true)
  }, [])
  return ready
}

function TrendTag({ value, prefix = '较昨日' }: { value: number; prefix?: string }) {
  const isUp = value >= 0
  return (
    <span style={{
      fontSize: 12, color: cssVar(isUp ? '--success-500' : '--error-500'),
      display: 'inline-flex', alignItems: 'center', gap: 2,
    }}>
      {isUp ? <RiseOutlined /> : <FallOutlined />}
      {prefix} {formatPercent(value)}
    </span>
  )
}

interface KpiCardProps {
  label: string
  value: React.ReactNode
  icon: React.ReactNode
  footer?: React.ReactNode
  iconBg?: string
  iconColor?: string
}

function KpiCard({ label, value, icon, footer, iconBg = cssVar('--primary-50'), iconColor = cssVar('--primary-500') }: KpiCardProps) {
  return (
    <Card bodyStyle={{ padding: 20 }} style={{ background: cssVar('--bg-card'), borderColor: cssVar('--border-light') }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, color: cssVar('--text-tertiary'), marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: cssVar('--text-primary'), letterSpacing: '-0.02em' }}>{value}</div>
          {footer && <div style={{ marginTop: 8 }}>{footer}</div>}
        </div>
        <div style={{
          width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: iconBg, color: iconColor, fontSize: 20, flexShrink: 0,
        }}>
          {icon}
        </div>
      </div>
    </Card>
  )
}

interface ChartCardProps {
  title: React.ReactNode
  children: React.ReactNode
  extra?: React.ReactNode
  height?: number
}

function ChartCard({ title, children, extra, height }: ChartCardProps) {
  return (
    <Card
      title={<span style={{ color: cssVar('--text-primary'), fontWeight: 600, fontSize: 15 }}>{title}</span>}
      extra={extra}
      bodyStyle={{ padding: 16, height: height ? height + 32 : undefined }}
      style={{ background: cssVar('--bg-card'), borderColor: cssVar('--border-light'), height: '100%' }}
    >
      {children}
    </Card>
  )
}

function ProgressBar({ label, value, color = cssVar('--primary-500'), suffix = '%' }: { label: string; value: number; color?: string; suffix?: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13, color: cssVar('--text-secondary') }}>
        <span>{label}</span>
        <span style={{ color: cssVar('--text-primary'), fontWeight: 600 }}>{value}{suffix}</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: cssVar('--gray-100'), overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${Math.min(100, Math.max(0, value))}%`, borderRadius: 4,
          background: color, transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
        }} />
      </div>
    </div>
  )
}

function UsersPanel() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await admin.getUsers(page, 10, search, status)
      setUsers(res.data?.items || [])
      setTotal(res.data?.total || 0)
    } catch { message.error('加载用户失败') } finally { setLoading(false) }
  }, [page, search, status])

  useEffect(() => { load() }, [load])

  const columns: TableColumnsType<AdminUser> = [
    { title: '用户ID', dataIndex: 'id', width: 90 },
    { title: '用户名', dataIndex: 'username', render: (v) => <span style={{ color: cssVar('--text-primary') }}>{v}</span> },
    { title: '邮箱', dataIndex: 'email' },
    { title: '注册时间', dataIndex: 'created_at', render: (v) => formatDate(v) },
    { title: '状态', dataIndex: 'status', render: (v) => <Tag color={STATUS_COLOR[v]}>{STATUS_LABEL[v]}</Tag> },
    { title: '操作', key: 'action', render: (_, record) => (
      <Space>
        <Button type="link" size="small">详情</Button>
        {record.status === 'active' ? (
          <Button type="link" danger size="small" onClick={() => admin.banUser(record.id, '违规').then(load)}>封禁</Button>
        ) : (
          <Button type="link" size="small" onClick={() => admin.unbanUser(record.id).then(load)}>解封</Button>
        )}
      </Space>
    )},
  ]

  return (
    <Card style={{ background: cssVar('--bg-card'), borderColor: cssVar('--border-light') }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <Input placeholder="搜索用户名/邮箱" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 240 }} />
        <Select placeholder="状态" allowClear value={status || undefined} onChange={setStatus} options={[{ label: '正常', value: 'active' }, { label: '已封禁', value: 'frozen' }]} style={{ width: 120 }} />
        <Button type="primary" icon={<SearchOutlined />} onClick={load}>查询</Button>
      </div>
      <Table rowKey="id" columns={columns} dataSource={users} loading={loading} pagination={{ current: page, pageSize: 10, total, onChange: setPage }} />
    </Card>
  )
}

function ContentPanel() {
  const [activeTab, setActiveTab] = useState('templates')
  const [templates, setTemplates] = useState<TemplateItem[]>([])
  const [keywords, setKeywords] = useState<KeywordItem[]>([])
  const [atsRules, setAtsRules] = useState<ATSRuleItem[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [t, k, a] = await Promise.all([
        admin.getTemplates().catch(() => ({ data: [] })),
        admin.getKeywords().catch(() => ({ data: [] })),
        admin.getAtsRules().catch(() => ({ data: [] })),
      ])
      setTemplates(t.data || [])
      setKeywords(k.data || [])
      setAtsRules(a.data || [])
    } catch { message.error('加载内容失败') } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const templateColumns: TableColumnsType<TemplateItem> = [
    { title: '名称', dataIndex: 'name' },
    { title: '描述', dataIndex: 'description' },
    { title: '默认', dataIndex: 'is_default', render: (v) => v ? <Tag color="blue">是</Tag> : <Tag>否</Tag> },
    { title: '操作', render: (_, r) => <Button type="link" size="small">编辑</Button> },
  ]

  const keywordColumns: TableColumnsType<KeywordItem> = [
    { title: '关键词', dataIndex: 'keyword' },
    { title: '行业', dataIndex: 'industry' },
    { title: '分类', dataIndex: 'category' },
    { title: '状态', dataIndex: 'is_active', render: (v) => <Tag color={v ? 'success' : 'default'}>{v ? '启用' : '停用'}</Tag> },
  ]

  const atsColumns: TableColumnsType<ATSRuleItem> = [
    { title: '规则名', dataIndex: 'name' },
    { title: '匹配模式', dataIndex: 'pattern' },
    { title: '严重等级', dataIndex: 'severity', render: (v) => <Tag color={v === 'error' ? 'error' : v === 'warning' ? 'warning' : 'default'}>{v}</Tag> },
    { title: '状态', dataIndex: 'is_active', render: (v) => <Tag color={v ? 'success' : 'default'}>{v ? '启用' : '停用'}</Tag> },
  ]

  return (
    <Card style={{ background: cssVar('--bg-card'), borderColor: cssVar('--border-light') }}>
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
        { key: 'templates', label: '简历模板', children: <Table rowKey="id" columns={templateColumns} dataSource={templates} loading={loading} pagination={{ pageSize: 8 }} /> },
        { key: 'keywords', label: '关键词库', children: <Table rowKey="id" columns={keywordColumns} dataSource={keywords} loading={loading} pagination={{ pageSize: 8 }} /> },
        { key: 'ats', label: 'ATS规则', children: <Table rowKey="id" columns={atsColumns} dataSource={atsRules} loading={loading} pagination={{ pageSize: 8 }} /> },
      ]} />
    </Card>
  )
}

function AIModelPanel() {
  const [models, setModels] = useState<ModelConfig[]>([])
  const [logs, setLogs] = useState<CallLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [m, l] = await Promise.all([admin.getModels(), admin.getCallLogs(1, 20)])
        setModels(m.data || [])
        setLogs(l.data?.items || [])
      } catch { message.error('加载模型数据失败') } finally { setLoading(false) }
    }
    load()
  }, [])

  const modelColumns: TableColumnsType<ModelConfig> = [
    { title: '模型', dataIndex: 'name' },
    { title: '提供商', dataIndex: 'provider' },
    { title: '权重', dataIndex: 'weight' },
    { title: '每分钟限制', dataIndex: 'rate_limit_per_minute' },
    { title: '状态', dataIndex: 'is_enabled', render: (v) => <Tag color={v ? 'success' : 'error'}>{v ? '启用' : '停用'}</Tag> },
    { title: '操作', render: () => <Button type="link" size="small">配置</Button> },
  ]

  const logColumns: TableColumnsType<CallLog> = [
    { title: '时间', dataIndex: 'created_at', render: (v) => formatDate(v) },
    { title: '模型', dataIndex: 'model_name' },
    { title: '耗时', dataIndex: 'latency_ms', render: (v) => `${v}ms` },
    { title: '结果', dataIndex: 'is_success', render: (v) => <Tag color={v ? 'success' : 'error'}>{v ? '成功' : '失败'}</Tag> },
  ]

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={14}>
        <Card title="模型配置" style={{ background: cssVar('--bg-card'), borderColor: cssVar('--border-light') }}>
          <Table rowKey="id" columns={modelColumns} dataSource={models} loading={loading} pagination={{ pageSize: 6 }} />
        </Card>
      </Col>
      <Col xs={24} lg={10}>
        <Card title="最近调用日志" style={{ background: cssVar('--bg-card'), borderColor: cssVar('--border-light') }}>
          <Table rowKey="id" columns={logColumns} dataSource={logs} loading={loading} pagination={{ pageSize: 6 }} />
        </Card>
      </Col>
    </Row>
  )
}

function MonitorPanel() {
  const [stats, setStats] = useState<TaskStats | null>(null)
  const [failed, setFailed] = useState<FailedTask[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [s, f] = await Promise.all([admin.getTaskStats(), admin.getFailedTasks()])
        setStats(s.data || null)
        setFailed(f.data?.items || [])
      } catch { message.error('加载监控数据失败') } finally { setLoading(false) }
    }
    load()
  }, [])

  const failedColumns: TableColumnsType<FailedTask> = [
    { title: '任务ID', dataIndex: 'id' },
    { title: '类型', dataIndex: 'task_type' },
    { title: '错误信息', dataIndex: 'error_message', ellipsis: true },
    { title: '失败时间', dataIndex: 'failed_at', render: (v) => formatDate(v) },
    { title: '操作', render: (_, r) => <Button type="link" size="small" onClick={() => admin.retryTasks([r.id]).then(() => message.success('已重试'))}>重试</Button> },
  ]

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={8}>
        <Card title="任务统计" style={{ background: cssVar('--bg-card'), borderColor: cssVar('--border-light') }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <KpiCard label="今日任务" value={stats?.today_total || 0} icon={<ClockCircleOutlined />} iconBg={cssVar('--warning-50')} iconColor={cssVar('--warning-500')} />
            <KpiCard label="今日成功" value={stats?.today_success || 0} icon={<CheckCircleOutlined />} iconBg={cssVar('--success-50')} iconColor={cssVar('--success-500')} />
            <KpiCard label="成功率" value={`${(stats?.success_rate || 0).toFixed(1)}%`} icon={<SyncOutlined spin />} iconBg={cssVar('--primary-50')} iconColor={cssVar('--primary-500')} />
            <KpiCard label="平均耗时" value={`${stats?.avg_latency_ms || 0}ms`} icon={<ClockCircleOutlined />} iconBg={`${cssVar('--purple-500')}20`} iconColor={cssVar('--purple-500')} />
          </div>
        </Card>
      </Col>
      <Col xs={24} lg={16}>
        <Card title="失败任务" style={{ background: cssVar('--bg-card'), borderColor: cssVar('--border-light') }}>
          <Table rowKey="id" columns={failedColumns} dataSource={failed} loading={loading} pagination={{ pageSize: 6 }} />
        </Card>
      </Col>
    </Row>
  )
}

function FeedbackPanel() {
  const [tickets, setTickets] = useState<TicketItem[]>([])
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [t, f] = await Promise.all([admin.getTickets(), admin.getFeedbacks()])
        setTickets(t.data?.items || [])
        setFeedbacks(f.data?.items || [])
      } catch { message.error('加载反馈数据失败') } finally { setLoading(false) }
    }
    load()
  }, [])

  const ticketColumns: TableColumnsType<TicketItem> = [
    { title: '标题', dataIndex: 'title' },
    { title: '分类', dataIndex: 'category', render: (v) => TICKET_CATEGORY[v] || v },
    { title: '优先级', dataIndex: 'priority', render: (v) => <Tag color={v === 'high' ? 'error' : v === 'medium' ? 'warning' : 'default'}>{v}</Tag> },
    { title: '状态', dataIndex: 'status', render: (v) => <Tag color={v === 'open' ? 'processing' : v === 'resolved' ? 'success' : 'default'}>{v}</Tag> },
    { title: '操作', render: () => <Button type="link" size="small">处理</Button> },
  ]

  const feedbackColumns: TableColumnsType<FeedbackItem> = [
    { title: '用户', dataIndex: 'username' },
    { title: '评分', dataIndex: 'score', render: (v) => <Tag color={v >= 4 ? 'success' : v >= 3 ? 'warning' : 'error'}>{v}分</Tag> },
    { title: '内容', dataIndex: 'content', ellipsis: true },
    { title: '时间', dataIndex: 'created_at', render: (v) => formatDate(v) },
  ]

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={14}>
        <Card title="工单列表" style={{ background: cssVar('--bg-card'), borderColor: cssVar('--border-light') }}>
          <Table rowKey="id" columns={ticketColumns} dataSource={tickets} loading={loading} pagination={{ pageSize: 8 }} />
        </Card>
      </Col>
      <Col xs={24} lg={10}>
        <Card title="用户评价" style={{ background: cssVar('--bg-card'), borderColor: cssVar('--border-light') }}>
          <Table rowKey="id" columns={feedbackColumns} dataSource={feedbacks} loading={loading} pagination={{ pageSize: 6 }} />
        </Card>
      </Col>
    </Row>
  )
}

function LogsPanel() {
  const [logs, setLogs] = useState<AdminLogItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const res = await admin.getAdminLogs()
        setLogs(res.data?.items || [])
      } catch { message.error('加载日志失败') } finally { setLoading(false) }
    }
    load()
  }, [])

  const columns: TableColumnsType<AdminLogItem> = [
    { title: '时间', dataIndex: 'created_at', render: (v) => formatDate(v), width: 170 },
    { title: '管理员', dataIndex: 'admin_username' },
    { title: '操作', dataIndex: 'action' },
    { title: 'IP', dataIndex: 'ip_address' },
    { title: '详情', dataIndex: 'details', ellipsis: true },
  ]

  return (
    <Card style={{ background: cssVar('--bg-card'), borderColor: cssVar('--border-light') }}>
      <Table rowKey="id" columns={columns} dataSource={logs} loading={loading} pagination={{ pageSize: 10 }} />
    </Card>
  )
}

function SettingsPanel() {
  const [form] = Form.useForm()
  const [quota, setQuota] = useState<QuotaConfig | null>(null)

  useEffect(() => {
    admin.getQuotaConfig().then((res) => {
      setQuota(res.data || null)
      form.setFieldsValue(res.data || {})
    })
  }, [form])

  return (
    <Card title="配额与系统设置" style={{ background: cssVar('--bg-card'), borderColor: cssVar('--border-light') }}>
      <Form form={form} layout="vertical" style={{ maxWidth: 600 }}>
        <Form.Item name="default_daily_quota" label="默认每日额度">
          <InputNumber style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="default_monthly_quota" label="默认每月额度">
          <InputNumber style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item>
          <Button type="primary">保存设置</Button>
        </Form.Item>
      </Form>
    </Card>
  )
}

export default function AdminPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [token, setToken] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [activeMenu, setActiveMenu] = useState('dashboard')

  useEffect(() => {
    const t = getToken()
    const adminData = typeof window !== 'undefined' ? localStorage.getItem('admin') : null
    if (!t || !adminData) { router.push('/admin/login'); return }
    setToken(t)
  }, [router])

  const renderContent = () => {
    switch (activeMenu) {
      case 'dashboard': return <DashboardPanel />
      case 'users': return <UsersPanel />
      case 'content': return <ContentPanel />
      case 'ai': return <AIModelPanel />
      case 'monitor': return <MonitorPanel />
      case 'feedback': return <FeedbackPanel />
      case 'logs': return <LogsPanel />
      case 'settings': return <SettingsPanel />
      default: return <DashboardPanel />
    }
  }

  if (!token) return <AuthGate activeKey="admin" />

  return (
    <Layout style={{ minHeight: '100vh', background: cssVar('--bg-body') }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={240}
        collapsedWidth={72}
        trigger={null}
        style={{
          background: cssVar('--bg-sidebar'),
          borderRight: `1px solid ${cssVar('--border-light')}`,
          position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 100,
          boxShadow: cssVar('--shadow-lg'),
        }}
      >
        <div style={{
          height: 64, display: 'flex', alignItems: 'center', gap: 12,
          padding: '0 20px', borderBottom: `1px solid ${cssVar('--border-light')}`,
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: `linear-gradient(135deg, ${cssVar('--primary-600')}, ${cssVar('--primary-400')})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 4px 10px ${cssVar('--primary-600')}40`,
          }}>
            <SettingOutlined style={{ color: cssVar('--gray-0'), fontSize: 18 }} />
          </div>
          {!collapsed && (
            <Typography.Title level={5} style={{ color: cssVar('--text-primary'), margin: 0, fontWeight: 700, letterSpacing: '-0.01em' }}>
              管理后台
            </Typography.Title>
          )}
        </div>

        <div style={{ padding: '12px 0', display: 'flex', flexDirection: 'column', height: 'calc(100% - 64px)' }}>
          <div style={{ flex: 1 }}>
            {ADMIN_MENU.map((item) => {
              const active = activeMenu === item.key
              return (
                <div
                  key={item.key}
                  onClick={() => setActiveMenu(item.key)}
                  style={{
                    padding: '11px 20px', margin: '4px 12px', borderRadius: 8,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
                    color: active ? cssVar('--text-inverse') : cssVar('--text-secondary'),
                    background: active ? cssVar('--primary-600') : 'transparent',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    fontSize: 14, fontWeight: active ? 600 : 500,
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = cssVar('--bg-hover')
                      e.currentTarget.style.color = cssVar('--text-primary')
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.color = cssVar('--text-secondary')
                    }
                  }}
                >
                  {item.icon}
                  {!collapsed && <span>{item.label}</span>}
                </div>
              )
            })}
          </div>
          <div
            onClick={() => setCollapsed(!collapsed)}
            style={{
              padding: '12px 20px', margin: '8px 12px', borderRadius: 8,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
              color: cssVar('--text-tertiary'), fontSize: 13,
            }}
          >
            {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            {!collapsed && <span>收起菜单</span>}
          </div>
        </div>
      </Sider>

      <Layout style={{
        marginLeft: collapsed ? 72 : 240,
        transition: 'margin-left 0.2s ease',
        minHeight: '100vh', background: cssVar('--bg-body'),
      }}>
        <Header style={{
          background: cssVar('--bg-header'), borderBottom: `1px solid ${cssVar('--border-light')}`,
          height: 64, position: 'sticky', top: 0, zIndex: 99,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          paddingInline: 24,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Typography.Title level={5} style={{ margin: 0, color: cssVar('--text-primary'), fontWeight: 600, letterSpacing: '-0.01em' }}>
              {ADMIN_MENU.find((m) => m.key === activeMenu)?.label}
            </Typography.Title>
          </div>
          <Space>
            <Segmented
              value={theme}
              onChange={(val) => setTheme(val as any)}
              options={[
                { label: (<span><SunOutlined /> 亮色</span>), value: 'light' },
                { label: (<span><MoonOutlined /> 暗色</span>), value: 'dark' },
              ]}
            />
            <Button icon={<HomeOutlined />} onClick={() => router.push('/')} type="text" style={{ color: cssVar('--text-secondary') }}>首页</Button>
            <Button icon={<DashboardOutlined />} onClick={() => router.push('/dashboard')} type="text" style={{ color: cssVar('--text-secondary') }}>仪表盘</Button>
            <Badge count={3} size="small">
              <Button type="text" icon={<BellOutlined style={{ fontSize: 18 }} />} style={{ color: cssVar('--text-secondary') }} />
            </Badge>
            <Avatar style={{ background: `linear-gradient(135deg, ${cssVar('--primary-600')}, ${cssVar('--primary-400')})` }} icon={<UserOutlined />} />
            <Button icon={<LogoutOutlined />} onClick={() => { clearAdminAuth(); router.push('/admin/login') }} type="text" style={{ color: cssVar('--text-tertiary') }}>退出</Button>
          </Space>
        </Header>
        <Content style={{ padding: 24, overflow: 'auto' }}>
          {renderContent()}
        </Content>
      </Layout>
    </Layout>
  )
}

// ═══════════════════════════════════════════════════════
//  数据大屏 Panel
// ═══════════════════════════════════════════════════════

const DASHBOARD_KPIS = [
  { label: '用户总数', value: 28560, delta: 1.14, icon: <TeamOutlined />, iconBg: cssVar('--primary-50'), iconColor: cssVar('--primary-500') },
  { label: '活跃用户', value: 8560, delta: 2.52, icon: <UserOutlined />, iconBg: cssVar('--success-50'), iconColor: cssVar('--success-500') },
  { label: '生成任务总数', value: 132890, delta: 0.97, icon: <ThunderboltOutlined />, iconBg: cssVar('--warning-50'), iconColor: cssVar('--warning-500') },
  { label: '今日任务数', value: 6432, delta: 15.45, icon: <CarryOutOutlined />, iconBg: cssVar('--error-50'), iconColor: cssVar('--error-500') },
  { label: '系统剩余额度', value: 1256320, delta: 1.91, suffix: '次', icon: <DatabaseOutlined />, iconBg: cssVar('--primary-50'), iconColor: cssVar('--teal-500') },
]

const TASK_TYPE_DATA = [
  { value: 38560, name: '简历优化' },
  { value: 28320, name: '简历评分' },
  { value: 18820, name: '面试追踪' },
  { value: 16540, name: '批量优化' },
  { value: 12680, name: '职位匹配' },
  { value: 18170, name: '其他' },
]

const PROVINCE_DATA = [
  { name: '广东省', value: 3560 },
  { name: '北京市', value: 2990 },
  { name: '江苏省', value: 2450 },
  { name: '浙江省', value: 2160 },
  { name: '上海市', value: 1980 },
  { name: '山东省', value: 1680 },
  { name: '四川省', value: 1420 },
]

const FEATURE_TOP_DATA = [
  { name: '简历优化', value: 32560 },
  { name: '简历评分', value: 18760 },
  { name: '批量优化', value: 9620 },
  { name: '面试追踪', value: 6980 },
  { name: 'AI 改写', value: 4360 },
]

const DEVICE_DATA = [
  { value: 56.23, name: 'PC端' },
  { value: 38.41, name: '移动端' },
  { value: 5.36, name: '平板端' },
]

const SOURCE_DATA = [
  { value: 42.36, name: '官网注册' },
  { value: 24.18, name: '合作渠道' },
  { value: 16.35, name: '社交媒体' },
  { value: 10.24, name: '搜索引擎' },
  { value: 6.87, name: '其他' },
]

// 确定性伪随机：用于图表 mock 数据，避免渲染期 Math.random 导致每次重渲数据抖动（也防止水合不一致）
function jitter(seed: number, amp: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return (x - Math.floor(x)) * amp
}

function generateDates(days: number): string[] {
  const dates: string[] = []
  const today = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    dates.push(`${d.getMonth() + 1}-${d.getDate()}`)
  }
  return dates
}

function DashboardPanel() {
  const [core, setCore] = useState<DashboardCore | null>(null)
  const [industries, setIndustries] = useState<IndustryItem[]>([])
  const [matchTrend, setMatchTrend] = useState<MatchTrend[]>([])
  const [features, setFeatures] = useState<FeatureUsage[]>([])
  const [jobTrending, setJobTrending] = useState<JobTrendItem[]>([])
  const [satisfaction, setSatisfaction] = useState<SatisfactionTrend[]>([])
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState(7)
  const { theme } = useTheme()

  // Canvas 不解析 CSS 变量，这里跟随主题给出真实色值，保证暗色/亮色下图表文字、边框、背景均清晰可读
  const chartColors = useMemo(() => theme === 'dark' ? {
    textPrimary: '#FFFFFF',
    textSecondary: 'rgba(235,235,245,0.60)',
    textTertiary: 'rgba(235,235,245,0.30)',
    borderLight: 'rgba(84,84,88,0.60)',
    bgCard: '#1C1C1E',
    primary: '#0A84FF',
    primary50: 'rgba(10,132,255,0.13)',
    primary200: '#66B2FF',
    success: '#30D158',
    warning: '#FF9F0A',
    purple: '#BF5AF2',
    teal: '#64D2FF',
    gray: '#8E8E93',
  } : {
    textPrimary: '#000000',
    textSecondary: 'rgba(60,60,67,0.60)',
    textTertiary: 'rgba(60,60,67,0.30)',
    borderLight: 'rgba(60,60,67,0.29)',
    bgCard: '#FFFFFF',
    primary: '#007AFF',
    primary50: '#E9F2FF',
    primary200: '#99C2FF',
    success: '#34C759',
    warning: '#FF9500',
    purple: '#AF52DE',
    teal: '#5AC8FA',
    gray: '#8E8E93',
  }, [theme])

  const loadData = useCallback(async () => {
    try {
      const [coreR, indR, matchR, featR, jobR, satR] = await Promise.all([
        admin.getDashboardCore(), admin.getDashboardIndustry(),
        admin.getDashboardMatchImprovement(30), admin.getDashboardFeatureUsage(),
        admin.getDashboardJobTrending(), admin.getDashboardSatisfaction(30),
      ])
      setCore(coreR.data)
      setIndustries(indR.data?.industries || [])
      setMatchTrend(matchR.data?.trend || [])
      setFeatures(featR.data?.features || [])
      setJobTrending(jobR.data?.jobs || [])
      setSatisfaction(satR.data?.trend || [])
    } catch { message.error('加载数据大屏失败') } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    const timer = setInterval(loadData, 30000)
    return () => clearInterval(timer)
  }, [loadData])

  const dates = useMemo(() => generateDates(timeRange), [timeRange])

  const userGrowthOption: ChartOption = useMemo(() => ({
    tooltip: { trigger: 'axis', backgroundColor: chartColors.bgCard, borderColor: chartColors.borderLight, textStyle: { color: chartColors.textSecondary } },
    legend: { data: ['新增用户', '活跃用户'], textStyle: { color: chartColors.textSecondary }, bottom: 0 },
    grid: { left: 16, right: 16, top: 24, bottom: 32, containLabel: true },
    xAxis: {
      type: 'category', boundaryGap: false, data: dates,
      axisLine: { lineStyle: { color: chartColors.borderLight } },
      axisLabel: { color: chartColors.textTertiary, fontSize: 11 },
    },
    yAxis: {
      type: 'value', splitLine: { lineStyle: { color: chartColors.borderLight, type: 'dashed' } },
      axisLabel: { color: chartColors.textTertiary, fontSize: 11 },
    },
    series: [
      {
        name: '新增用户', type: 'line', smooth: true, symbol: 'circle', symbolSize: 6,
        data: dates.map((_, i) => 3000 + Math.sin(i * 0.8) * 1500 + i * 120 + Math.random() * 500),
        itemStyle: { color: chartColors.primary },
        lineStyle: { width: 3 },
        areaStyle: { color: new (echarts as any).graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: `${resolveCssVar('--primary-500', '#3b82f6')}66` }, { offset: 1, color: `${resolveCssVar('--primary-500', '#3b82f6')}08` }]) },
      },
      {
        name: '活跃用户', type: 'line', smooth: true, symbol: 'circle', symbolSize: 6,
        data: dates.map((_, i) => 5000 + Math.cos(i * 0.7) * 1200 + i * 80 + Math.random() * 400),
        itemStyle: { color: chartColors.teal },
        lineStyle: { width: 3 },
        areaStyle: { color: new (echarts as any).graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: `${resolveCssVar('--teal-500', '#14b8a6')}66` }, { offset: 1, color: `${resolveCssVar('--teal-500', '#14b8a6')}08` }]) },
      },
    ],
  }), [dates, theme])

  const taskTypeOption: ChartOption = useMemo(() => ({
    tooltip: { trigger: 'item', backgroundColor: chartColors.bgCard, borderColor: chartColors.borderLight, textStyle: { color: chartColors.textSecondary } },
    color: [chartColors.primary, chartColors.success, chartColors.warning, chartColors.purple, chartColors.teal, chartColors.gray],
    legend: { orient: 'vertical', right: 0, top: 'center', textStyle: { color: chartColors.textSecondary, fontSize: 11 }, itemWidth: 10, itemHeight: 10 },
    series: [{
      type: 'pie', radius: ['55%', '80%'], center: ['35%', '50%'],
      data: TASK_TYPE_DATA,
      label: { show: true, position: 'center', formatter: '{total|132,890}\n{text|总任务数}', rich: { total: { fontSize: 20, fontWeight: 700, color: chartColors.textPrimary }, text: { fontSize: 12, color: chartColors.textTertiary } } },
      labelLine: { show: false },
      emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.5)' } },
    }],
  }), [theme])

  const systemStatusOption: ChartOption = null

  const taskTrendOption: ChartOption = useMemo(() => ({
    tooltip: { trigger: 'axis', backgroundColor: chartColors.bgCard, borderColor: chartColors.borderLight, textStyle: { color: chartColors.textSecondary } },
    legend: { data: ['简历优化', '简历评分', '面试追踪', '批量优化', '其他'], textStyle: { color: chartColors.textSecondary }, bottom: 0 },
    grid: { left: 16, right: 16, top: 24, bottom: 32, containLabel: true },
    xAxis: {
      type: 'category', boundaryGap: false, data: dates,
      axisLine: { lineStyle: { color: chartColors.borderLight } },
      axisLabel: { color: chartColors.textTertiary, fontSize: 11 },
    },
    yAxis: {
      type: 'value', splitLine: { lineStyle: { color: chartColors.borderLight, type: 'dashed' } },
      axisLabel: { color: chartColors.textTertiary, fontSize: 11 },
    },
    series: [
      { name: '简历优化', type: 'line', smooth: true, data: dates.map((_, i) => 8000 + Math.sin(i) * 2000 + jitter(i, 800)), itemStyle: { color: chartColors.primary } },
      { name: '简历评分', type: 'line', smooth: true, data: dates.map((_, i) => 6000 + Math.cos(i) * 1500 + jitter(i, 600)), itemStyle: { color: chartColors.success } },
      { name: '面试追踪', type: 'line', smooth: true, data: dates.map((_, i) => 4000 + Math.sin(i + 1) * 1000 + jitter(i, 500)), itemStyle: { color: chartColors.warning } },
      { name: '批量优化', type: 'line', smooth: true, data: dates.map((_, i) => 3000 + Math.cos(i + 2) * 800 + jitter(i, 400)), itemStyle: { color: chartColors.purple } },
      { name: '其他', type: 'line', smooth: true, data: dates.map((_, i) => 2000 + Math.sin(i + 3) * 500 + jitter(i, 300)), itemStyle: { color: chartColors.gray } },
    ],
  }), [dates, theme])

  const provinceOption: ChartOption = useMemo(() => ({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: chartColors.bgCard, borderColor: chartColors.borderLight, textStyle: { color: chartColors.textSecondary } },
    grid: { left: 16, right: 80, top: 16, bottom: 16, containLabel: true },
    xAxis: {
      type: 'value', splitLine: { lineStyle: { color: chartColors.borderLight, type: 'dashed' } },
      axisLabel: { color: chartColors.textTertiary, fontSize: 11 },
    },
    yAxis: {
      type: 'category', data: PROVINCE_DATA.map((d) => d.name).reverse(),
      axisLine: { lineStyle: { color: chartColors.borderLight } },
      axisLabel: { color: chartColors.textSecondary, fontSize: 11 },
    },
    visualMap: {
      orient: 'vertical', right: 0, top: 'center', min: 0, max: 4000,
      text: ['高', '低'], textStyle: { color: chartColors.textTertiary },
      inRange: { color: [chartColors.primary50, chartColors.primary] },
      itemWidth: 12, itemHeight: 80,
    },
    series: [{
      type: 'bar', data: PROVINCE_DATA.map((d) => d.value).reverse(),
      itemStyle: { borderRadius: [0, 4, 4, 0], color: new (echarts as any).graphic.LinearGradient(1, 0, 0, 0, [{ offset: 0, color: resolveCssVar('--primary-500', '#3b82f6') }, { offset: 1, color: resolveCssVar('--primary-200', '#bfdbfe') }]) },
      label: { show: true, position: 'right', color: chartColors.textSecondary, fontSize: 11 },
    }],
  }), [theme])

  const featureOption: ChartOption = useMemo(() => ({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: chartColors.bgCard, borderColor: chartColors.borderLight, textStyle: { color: chartColors.textSecondary } },
    grid: { left: 16, right: 64, top: 8, bottom: 8, containLabel: true },
    xAxis: {
      type: 'value', splitLine: { show: false },
      axisLabel: { show: false },
    },
    yAxis: {
      type: 'category', data: FEATURE_TOP_DATA.map((d) => d.name).reverse(),
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: chartColors.textSecondary, fontSize: 12 },
    },
    series: [{
      type: 'bar', data: FEATURE_TOP_DATA.map((d) => d.value).reverse(),
      itemStyle: { borderRadius: 4, color: chartColors.primary },
      label: { show: true, position: 'right', color: chartColors.textSecondary, fontSize: 11, formatter: '{c}' },
      barWidth: 14,
    }],
  }), [theme])

  const deviceOption: ChartOption = useMemo(() => ({
    tooltip: { trigger: 'item', backgroundColor: chartColors.bgCard, borderColor: chartColors.borderLight, textStyle: { color: chartColors.textSecondary } },
    color: [chartColors.primary, chartColors.success, chartColors.warning],
    legend: { orient: 'vertical', right: 0, top: 'center', textStyle: { color: chartColors.textSecondary, fontSize: 12 }, itemWidth: 10, itemHeight: 10 },
    series: [{
      type: 'pie', radius: ['55%', '80%'], center: ['35%', '50%'],
      data: DEVICE_DATA,
      label: { show: true, position: 'center', formatter: '{total|28,560}\n{text|总数}', rich: { total: { fontSize: 18, fontWeight: 700, color: chartColors.textPrimary }, text: { fontSize: 11, color: chartColors.textTertiary } } },
      labelLine: { show: false },
    }],
  }), [theme])

  const sourceOption: ChartOption = useMemo(() => ({
    tooltip: { trigger: 'item', backgroundColor: chartColors.bgCard, borderColor: chartColors.borderLight, textStyle: { color: chartColors.textSecondary } },
    color: [chartColors.primary, chartColors.success, chartColors.warning, chartColors.purple, chartColors.gray],
    legend: { orient: 'vertical', right: 0, top: 'center', textStyle: { color: chartColors.textSecondary, fontSize: 12 }, itemWidth: 10, itemHeight: 10 },
    series: [{
      type: 'pie', radius: ['55%', '80%'], center: ['35%', '50%'],
      data: SOURCE_DATA,
      label: { show: true, position: 'center', formatter: '{total|100%}\n{text|来源}', rich: { total: { fontSize: 18, fontWeight: 700, color: chartColors.textPrimary }, text: { fontSize: 11, color: chartColors.textTertiary } } },
      labelLine: { show: false },
    }],
  }), [theme])

  if (loading) return <Spin size="large" style={{ display: 'block', textAlign: 'center', padding: 60 }} />

  const extraSelect = (
    <Select value={timeRange} onChange={(v) => setTimeRange(v)} size="small"
      options={[{ label: '近7日', value: 7 }, { label: '近30日', value: 30 }, { label: '近90日', value: 90 }]}
      style={{ width: 90 }}
    />
  )

  return (
    <div>
      <Row gutter={[16, 16]}>
        {DASHBOARD_KPIS.map((k, idx) => (
          <Col xs={24} sm={12} lg={8} xl={4} key={idx}>
            <KpiCard
              label={k.label}
              value={`${formatNumber(k.value)}${k.suffix || ''}`}
              icon={k.icon}
              iconBg={k.iconBg}
              iconColor={k.iconColor}
              footer={<TrendTag value={k.delta} />}
            />
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <ChartCard title={<><LineChartOutlined style={{ marginRight: 8 }} />用户增长趋势</>} extra={extraSelect} height={300}>
            <ReactEChartsCore echarts={echarts} option={userGrowthOption} style={{ height: 300 }} />
          </ChartCard>
        </Col>
        <Col xs={24} lg={6}>
          <ChartCard title={<><PieChartOutlined style={{ marginRight: 8 }} />任务类型占比</>} height={300}>
            <ReactEChartsCore echarts={echarts} option={taskTypeOption} style={{ height: 300 }} />
          </ChartCard>
        </Col>
        <Col xs={24} lg={6}>
          <ChartCard title={<><MonitorOutlined style={{ marginRight: 8 }} />系统运行状态</>} height={300}>
            <div style={{ paddingTop: 8 }}>
              <ProgressBar label="CPU 使用率" value={26} color={cssVar('--primary-500')} />
              <ProgressBar label="内存使用率" value={48} color={cssVar('--success-500')} />
              <ProgressBar label="磁盘使用率" value={32} color={cssVar('--warning-500')} />
              <ProgressBar label="接口调用量" value={68} color={cssVar('--purple-500')} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: 13, color: cssVar('--text-secondary') }}>
                <span>系统状态</span>
                <Tag color="success">正常</Tag>
              </div>
            </div>
          </ChartCard>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <ChartCard title={<><LineChartOutlined style={{ marginRight: 8 }} />任务趋势</>} extra={extraSelect} height={300}>
            <ReactEChartsCore echarts={echarts} option={taskTrendOption} style={{ height: 300 }} />
          </ChartCard>
        </Col>
        <Col xs={24} lg={12}>
          <ChartCard title={<><GlobalOutlined style={{ marginRight: 8 }} />用户分布</>} height={300}>
            <ReactEChartsCore echarts={echarts} option={provinceOption} style={{ height: 300 }} />
          </ChartCard>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={6}>
          <ChartCard title={<><BarChartOutlined style={{ marginRight: 8 }} />热门功能 TOP5</>} height={260}>
            <ReactEChartsCore echarts={echarts} option={featureOption} style={{ height: 260 }} />
          </ChartCard>
        </Col>
        <Col xs={24} lg={6}>
          <ChartCard title={<><DesktopOutlined style={{ marginRight: 8 }} />用户设备分布</>} height={260}>
            <ReactEChartsCore echarts={echarts} option={deviceOption} style={{ height: 260 }} />
          </ChartCard>
        </Col>
        <Col xs={24} lg={6}>
          <ChartCard title={<><PieChartOutlined style={{ marginRight: 8 }} />新用户来源渠道</>} height={260}>
            <ReactEChartsCore echarts={echarts} option={sourceOption} style={{ height: 260 }} />
          </ChartCard>
        </Col>
        <Col xs={24} lg={6}>
          <ChartCard title={<><CarryOutOutlined style={{ marginRight: 8 }} />实时任务监控</>} height={260}>
            <Row gutter={[8, 8]}>
              <Col span={12}>
                <div style={{ background: cssVar('--bg-body'), borderRadius: 8, padding: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: cssVar('--text-tertiary'), marginBottom: 4 }}>排队中</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: cssVar('--text-primary') }}>126</div>
                </div>
              </Col>
              <Col span={12}>
                <div style={{ background: cssVar('--bg-body'), borderRadius: 8, padding: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: cssVar('--text-tertiary'), marginBottom: 4 }}>处理中</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: cssVar('--primary-500') }}>1,256</div>
                </div>
              </Col>
              <Col span={12}>
                <div style={{ background: cssVar('--bg-body'), borderRadius: 8, padding: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: cssVar('--text-tertiary'), marginBottom: 4 }}>已完成(今日)</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: cssVar('--success-500') }}>6,320</div>
                </div>
              </Col>
              <Col span={12}>
                <div style={{ background: cssVar('--bg-body'), borderRadius: 8, padding: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: cssVar('--text-tertiary'), marginBottom: 4 }}>失败(今日)</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: cssVar('--error-500') }}>32</div>
                </div>
              </Col>
            </Row>
          </ChartCard>
        </Col>
      </Row>
    </div>
  )
}
