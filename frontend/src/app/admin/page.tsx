'use client'

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Layout, Button, Card, Typography, Spin, message, Tabs, Row, Col,
  Table, Tag, Space, Statistic, Select, Input, Modal, Empty, Popconfirm,
  Form, InputNumber, Switch, Badge, Descriptions, Divider, Tooltip, Progress,
  Avatar, DatePicker, Dropdown, Segmented, Drawer,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  LogoutOutlined, UserOutlined,
  DashboardOutlined, SettingOutlined, TeamOutlined,
  BarChartOutlined, FileTextOutlined, AuditOutlined,
  ApiOutlined, MonitorOutlined,
  MessageOutlined, KeyOutlined, SafetyOutlined,
  RobotOutlined, ThunderboltOutlined, ReloadOutlined,
  SearchOutlined, PlusOutlined, EditOutlined, DeleteOutlined,
  SendOutlined, EyeOutlined, StopOutlined, CheckCircleOutlined,
  ExclamationCircleOutlined, ClockCircleOutlined, RiseOutlined,
  FallOutlined, FundOutlined, PieChartOutlined, LineChartOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined,
  DownOutlined, MoreOutlined, SyncOutlined,
  FileSyncOutlined, FileProtectOutlined,
  ClusterOutlined, WarningOutlined, DatabaseOutlined,
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
  OrderItem, RevenueData, QuotaPackageItem,
} from '@/types'
import { useTheme } from '@/lib/theme'

echarts.use([LineChart, BarChart, PieChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, CanvasRenderer])

const { Header, Sider, Content } = Layout
const { TextArea } = Input

type ChartOption = any

// ── 领域字典（与后端模型/API 一一对应） ──────────────────────
const SCENE_LABELS: Record<string, string> = {
  work_experience: '工作经历', summary: '个人总结', project: '项目经验',
  skill_fill: '关键词填充', star_rewrite: 'STAR重写', general: '通用优化',
}
const STATUS_COLOR: Record<string, string> = { active: 'success', frozen: 'error', deleted_pending: 'warning' }
const STATUS_LABEL: Record<string, string> = { active: '正常', frozen: '已封禁', deleted_pending: '注销中' }
const CAREER_LABEL: Record<string, string> = {
  student: '在校学生', fresh: '应届毕业生', experienced: '职场人士', career_change: '转行中',
}
const TICKET_CATEGORY: Record<string, string> = { bug: '功能故障', content_error: '内容错误', refund: '退款问题', other: '其他' }
const TICKET_PRIORITY: Record<string, { label: string; color: string }> = {
  low: { label: '低', color: 'default' }, medium: { label: '中', color: 'warning' }, high: { label: '高', color: 'error' },
}
const TICKET_STATUS: Record<string, { label: string; color: string }> = {
  open: { label: '待处理', color: 'processing' }, in_progress: { label: '处理中', color: 'warning' },
  resolved: { label: '已解决', color: 'success' }, closed: { label: '已关闭', color: 'default' },
}
const ORDER_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: '待支付', color: 'default' }, success: { label: '已支付', color: 'success' },
  refunded: { label: '已退款', color: 'error' }, closed: { label: '已关闭', color: 'default' },
}
const KEYWORD_CATEGORY: Record<string, string> = {
  hard_skill: '硬技能', soft_skill: '软技能', certificate: '证书资格', tool: '工具平台', other: '其他',
}
const ADMIN_ACTION_LABEL: Record<string, string> = {
  user_ban: '封禁用户', user_unban: '解禁用户', set_vip: '设置VIP', add_quota: '增加额度',
  create_template: '创建模板', create_prompt: '创建Prompt', deploy_prompt: '部署Prompt',
  rollback_prompt: '回滚Prompt', refund_order: '订单退款',
}

const ADMIN_MENU = [
  { key: 'dashboard', icon: <DashboardOutlined />, label: '首页' },
  { key: 'users', icon: <TeamOutlined />, label: '用户管理' },
  { key: 'content', icon: <FileTextOutlined />, label: '内容管理' },
  { key: 'ai', icon: <RobotOutlined />, label: 'AI模型管理' },
  { key: 'monitor', icon: <MonitorOutlined />, label: '任务监控中心' },
  { key: 'feedback', icon: <MessageOutlined />, label: '工单反馈中心' },
  { key: 'finance', icon: <FundOutlined />, label: '财务管理' },
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

function shortId(id: string): string {
  return id && id.length > 8 ? `${id.slice(0, 8)}…` : id
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

// ═══════════════════════════════════════════════════════
//  数据大屏（全部使用真实接口数据）
// ═══════════════════════════════════════════════════════

function DashboardPanel() {
  const [core, setCore] = useState<DashboardCore | null>(null)
  const [industries, setIndustries] = useState<IndustryItem[]>([])
  const [matchTrend, setMatchTrend] = useState<MatchTrend[]>([])
  const [features, setFeatures] = useState<FeatureUsage[]>([])
  const [jobTrending, setJobTrending] = useState<JobTrendItem[]>([])
  const [satisfaction, setSatisfaction] = useState<SatisfactionTrend[]>([])
  const [taskStats, setTaskStats] = useState<TaskStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState(30)
  const { theme } = useTheme()

  const chartColors = useMemo(() => theme === 'dark' ? {
    textPrimary: '#FFFFFF',
    textSecondary: 'rgba(235,235,245,0.60)',
    textTertiary: 'rgba(235,235,245,0.30)',
    borderLight: 'rgba(84,84,88,0.60)',
    bgCard: '#1C1C1E',
    primary: '#0A84FF',
    primary50: 'rgba(10,132,255,0.13)',
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
    success: '#34C759',
    warning: '#FF9500',
    purple: '#AF52DE',
    teal: '#5AC8FA',
    gray: '#8E8E93',
  }, [theme])

  const loadData = useCallback(async () => {
    const failures: string[] = []
    const settle = async <T,>(name: string, fn: () => Promise<T>): Promise<T | null> => {
      try { return await fn() } catch { failures.push(name); return null }
    }
    try {
      const [coreR, indR, matchR, featR, jobR, satR, taskR] = await Promise.all([
        settle('核心指标', () => admin.getDashboardCore()),
        settle('行业分布', () => admin.getDashboardIndustry()),
        settle('匹配分趋势', () => admin.getDashboardMatchImprovement(timeRange)),
        settle('功能使用', () => admin.getDashboardFeatureUsage()),
        settle('岗位热度', () => admin.getDashboardJobTrending()),
        settle('满意度', () => admin.getDashboardSatisfaction(timeRange)),
        settle('任务监控', () => admin.getTaskStats()),
      ])
      if (coreR) setCore(coreR.data)
      if (indR) setIndustries(indR.data?.industries || [])
      if (matchR) setMatchTrend(matchR.data?.trend || [])
      if (featR) setFeatures(featR.data?.features || [])
      if (jobR) setJobTrending(jobR.data?.jobs || [])
      if (satR) setSatisfaction(satR.data?.trend || [])
      if (taskR) setTaskStats(taskR.data || null)
      // 单接口失败不整体空白：能显示多少显示多少，仅提示缺失项
      if (failures.length) message.warning(`部分数据加载失败：${failures.join('、')}`)
    } catch { message.error('加载数据大屏失败') } finally { setLoading(false) }
  }, [timeRange])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    const timer = setInterval(loadData, 30000)
    return () => clearInterval(timer)
  }, [loadData])

  const axisBase = {
    axisLine: { lineStyle: { color: chartColors.borderLight } },
    axisLabel: { color: chartColors.textTertiary, fontSize: 11 },
  }
  const tooltipBase = {
    backgroundColor: chartColors.bgCard, borderColor: chartColors.borderLight,
    textStyle: { color: chartColors.textSecondary },
  }

  const matchOption: ChartOption = useMemo(() => ({
    tooltip: { trigger: 'axis', ...tooltipBase },
    grid: { left: 16, right: 16, top: 24, bottom: 32, containLabel: true },
    xAxis: {
      type: 'category', boundaryGap: false, data: matchTrend.map((d) => d.date),
      ...axisBase,
    },
    yAxis: {
      type: 'value', min: (v: { min: number }) => Math.floor(v.min - 5), max: (v: { max: number }) => Math.ceil(v.max + 5),
      splitLine: { lineStyle: { color: chartColors.borderLight, type: 'dashed' } },
      axisLabel: { color: chartColors.textTertiary, fontSize: 11 },
    },
    series: [{
      name: '平均匹配分', type: 'line', smooth: true, symbol: 'circle', symbolSize: 6,
      data: matchTrend.map((d) => d.avg_score),
      itemStyle: { color: chartColors.primary },
      lineStyle: { width: 3 },
      areaStyle: { color: new (echarts as any).graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: `${resolveCssVar('--primary-500', '#3b82f6')}66` }, { offset: 1, color: `${resolveCssVar('--primary-500', '#3b82f6')}08` }]) },
    }],
  }), [matchTrend, theme])

  const satisfactionOption: ChartOption = useMemo(() => ({
    tooltip: { trigger: 'axis', ...tooltipBase },
    grid: { left: 16, right: 16, top: 24, bottom: 32, containLabel: true },
    xAxis: {
      type: 'category', boundaryGap: false, data: satisfaction.map((d) => d.date),
      ...axisBase,
    },
    yAxis: {
      type: 'value', min: 0, max: 5,
      splitLine: { lineStyle: { color: chartColors.borderLight, type: 'dashed' } },
      axisLabel: { color: chartColors.textTertiary, fontSize: 11 },
    },
    series: [{
      name: '平均满意度', type: 'line', smooth: true, symbol: 'circle', symbolSize: 6,
      data: satisfaction.map((d) => d.avg_satisfaction),
      itemStyle: { color: chartColors.success },
      lineStyle: { width: 3 },
      areaStyle: { color: new (echarts as any).graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: `${resolveCssVar('--success-500', '#22c55e')}66` }, { offset: 1, color: `${resolveCssVar('--success-500', '#22c55e')}08` }]) },
    }],
  }), [satisfaction, theme])

  const featureOption: ChartOption = useMemo(() => ({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, ...tooltipBase },
    grid: { left: 16, right: 64, top: 8, bottom: 8, containLabel: true },
    xAxis: { type: 'value', splitLine: { show: false }, axisLabel: { show: false } },
    yAxis: {
      type: 'category', data: features.map((d) => d.name).reverse(),
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: chartColors.textSecondary, fontSize: 12 },
    },
    series: [{
      type: 'bar', data: features.map((d) => d.count).reverse(),
      itemStyle: { borderRadius: 4, color: chartColors.primary },
      label: { show: true, position: 'right', color: chartColors.textSecondary, fontSize: 11, formatter: '{c}' },
      barWidth: 14,
    }],
  }), [features, theme])

  const jobOption: ChartOption = useMemo(() => ({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, ...tooltipBase },
    grid: { left: 16, right: 64, top: 8, bottom: 8, containLabel: true },
    xAxis: { type: 'value', splitLine: { show: false }, axisLabel: { show: false } },
    yAxis: {
      type: 'category', data: jobTrending.map((d) => d.title).reverse(),
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: chartColors.textSecondary, fontSize: 12 },
    },
    series: [{
      type: 'bar', data: jobTrending.map((d) => d.count).reverse(),
      itemStyle: { borderRadius: 4, color: chartColors.teal },
      label: { show: true, position: 'right', color: chartColors.textSecondary, fontSize: 11, formatter: '{c} 次' },
      barWidth: 14,
    }],
  }), [jobTrending, theme])

  const industryOption: ChartOption = useMemo(() => ({
    tooltip: { trigger: 'item', ...tooltipBase },
    color: [chartColors.primary, chartColors.success, chartColors.warning, chartColors.purple, chartColors.teal, chartColors.gray],
    legend: { orient: 'vertical', right: 0, top: 'center', textStyle: { color: chartColors.textSecondary, fontSize: 11 }, itemWidth: 10, itemHeight: 10 },
    series: [{
      type: 'pie', radius: ['55%', '80%'], center: ['35%', '50%'],
      data: industries.map((d) => ({ name: d.name, value: d.count })),
      label: { show: false },
      labelLine: { show: false },
      emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.5)' } },
    }],
  }), [industries, theme])

  if (loading) return <Spin size="large" style={{ display: 'block', textAlign: 'center', padding: 60 }} />

  const extraSelect = (
    <Select value={timeRange} onChange={(v) => setTimeRange(v)} size="small"
      options={[{ label: '近7日', value: 7 }, { label: '近30日', value: 30 }, { label: '近90日', value: 90 }]}
      style={{ width: 90 }}
    />
  )

  const kpis: Array<{ label: string; value: React.ReactNode; icon: React.ReactNode; iconBg: string; iconColor: string; footer?: React.ReactNode }> = [
    { label: '用户总数', value: formatNumber(core?.total_users || 0), icon: <TeamOutlined />, iconBg: cssVar('--primary-50'), iconColor: cssVar('--primary-500') },
    { label: '活跃用户', value: formatNumber(core?.active_users || 0), icon: <UserOutlined />, iconBg: cssVar('--success-50'), iconColor: cssVar('--success-500') },
    { label: '今日活跃(DAU)', value: formatNumber(core?.dau || 0), icon: <ThunderboltOutlined />, iconBg: cssVar('--warning-50'), iconColor: cssVar('--warning-500'), footer: <TrendTag value={core?.dau_change_percent || 0} /> },
    { label: '今日上传简历', value: formatNumber(core?.today_uploads || 0), icon: <FileTextOutlined />, iconBg: cssVar('--primary-50'), iconColor: cssVar('--teal-500') },
    { label: '今日AI优化', value: formatNumber(core?.today_optimizations || 0), icon: <CarryOutOutlined />, iconBg: cssVar('--error-50'), iconColor: cssVar('--error-500') },
    { label: '累计优化次数', value: formatNumber(core?.total_optimizations || 0), icon: <DatabaseOutlined />, iconBg: cssVar('--primary-50'), iconColor: cssVar('--purple-500') },
    { label: '付费转化率', value: `${(core?.paid_conversion_rate || 0).toFixed(2)}%`, icon: <FundOutlined />, iconBg: cssVar('--success-50'), iconColor: cssVar('--success-500') },
  ]

  return (
    <div>
      <Row gutter={[16, 16]}>
        {kpis.map((k) => (
          <Col xs={24} sm={12} lg={8} xl={4} key={k.label}>
            <KpiCard label={k.label} value={k.value} icon={k.icon} iconBg={k.iconBg} iconColor={k.iconColor} footer={k.footer} />
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <ChartCard title={<><LineChartOutlined style={{ marginRight: 8 }} />简历匹配分趋势</>} extra={extraSelect} height={300}>
            {matchTrend.length > 0
              ? <ReactEChartsCore echarts={echarts} option={matchOption} style={{ height: 300 }} />
              : <Empty description="暂无优化记录" style={{ paddingTop: 100 }} />}
          </ChartCard>
        </Col>
        <Col xs={24} lg={12}>
          <ChartCard title={<><LineChartOutlined style={{ marginRight: 8 }} />用户满意度趋势</>} extra={extraSelect} height={300}>
            {satisfaction.length > 0
              ? <ReactEChartsCore echarts={echarts} option={satisfactionOption} style={{ height: 300 }} />
              : <Empty description="暂无评价数据" style={{ paddingTop: 100 }} />}
          </ChartCard>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={8}>
          <ChartCard title={<><BarChartOutlined style={{ marginRight: 8 }} />功能使用分布</>} height={300}>
            {features.length > 0
              ? <ReactEChartsCore echarts={echarts} option={featureOption} style={{ height: 300 }} />
              : <Empty description="暂无数据" style={{ paddingTop: 100 }} />}
          </ChartCard>
        </Col>
        <Col xs={24} lg={8}>
          <ChartCard title={<><BarChartOutlined style={{ marginRight: 8 }} />热门目标岗位 TOP10</>} height={300}>
            {jobTrending.length > 0
              ? <ReactEChartsCore echarts={echarts} option={jobOption} style={{ height: 300 }} />
              : <Empty description="暂无岗位数据" style={{ paddingTop: 100 }} />}
          </ChartCard>
        </Col>
        <Col xs={24} lg={8}>
          <ChartCard title={<><PieChartOutlined style={{ marginRight: 8 }} />求职行业分布</>} height={300}>
            {industries.length > 0
              ? <ReactEChartsCore echarts={echarts} option={industryOption} style={{ height: 300 }} />
              : <Empty description="暂无数据" style={{ paddingTop: 100 }} />}
          </ChartCard>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <ChartCard title={<><MonitorOutlined style={{ marginRight: 8 }} />今日 AI 任务实时监控</>} height={220}>
            <Row gutter={[8, 8]}>
              <Col xs={12} sm={6}>
                <div style={{ background: cssVar('--bg-body'), borderRadius: 8, padding: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: cssVar('--text-tertiary'), marginBottom: 4 }}>今日调用</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: cssVar('--text-primary') }}>{formatNumber(taskStats?.today_total || 0)}</div>
                </div>
              </Col>
              <Col xs={12} sm={6}>
                <div style={{ background: cssVar('--bg-body'), borderRadius: 8, padding: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: cssVar('--text-tertiary'), marginBottom: 4 }}>成功率</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: cssVar('--success-500') }}>{(taskStats?.success_rate || 0).toFixed(1)}%</div>
                </div>
              </Col>
              <Col xs={12} sm={6}>
                <div style={{ background: cssVar('--bg-body'), borderRadius: 8, padding: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: cssVar('--text-tertiary'), marginBottom: 4 }}>平均耗时</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: cssVar('--primary-500') }}>{Math.round(taskStats?.avg_latency_ms || 0)}ms</div>
                </div>
              </Col>
              <Col xs={12} sm={6}>
                <div style={{ background: cssVar('--bg-body'), borderRadius: 8, padding: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: cssVar('--text-tertiary'), marginBottom: 4 }}>今日失败</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: cssVar('--error-500') }}>{formatNumber(Math.max(0, (taskStats?.today_total || 0) - (taskStats?.today_success || 0)))}</div>
                </div>
              </Col>
            </Row>
          </ChartCard>
        </Col>
      </Row>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
//  用户管理
// ═══════════════════════════════════════════════════════

function UsersPanel() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const [detailVisible, setDetailVisible] = useState(false)
  const [detail, setDetail] = useState<AdminUserDetail | null>(null)
  const [banTarget, setBanTarget] = useState<AdminUser | null>(null)
  const [banReason, setBanReason] = useState('违规操作')
  const [vipTarget, setVipTarget] = useState<AdminUser | null>(null)
  const [vipForm, setVipForm] = useState({ is_paid: true, daily_limit: 10, monthly_limit: 200 })
  const [quotaTarget, setQuotaTarget] = useState<AdminUser | null>(null)
  const [quotaForm, setQuotaForm] = useState({ amount: 10, reason: '运营补偿' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await admin.getUsers(page, 10, search, status)
      setUsers(res.data?.items || [])
      setTotal(res.data?.total || 0)
    } catch { message.error('加载用户失败') } finally { setLoading(false) }
  }, [page, search, status])

  useEffect(() => { load() }, [load])

  const openDetail = async (record: AdminUser) => {
    try {
      const res = await admin.getUserDetail(record.id)
      setDetail(res.data)
      setDetailVisible(true)
    } catch { message.error('加载用户详情失败') }
  }

  const columns: TableColumnsType<AdminUser> = [
    { title: '用户', dataIndex: 'nickname', width: 140, render: (v, r) => (
      <Space>
        <Avatar size="small" icon={<UserOutlined />} style={{ background: cssVar('--primary-500') }} />
        <span style={{ color: cssVar('--text-primary') }}>{v || '未设置昵称'}</span>
      </Space>
    ) },
    { title: '邮箱', dataIndex: 'email', ellipsis: true },
    { title: '求职状态', dataIndex: 'career_state', width: 100, render: (v) => v ? (CAREER_LABEL[v] || v) : '-' },
    { title: '简历', dataIndex: 'resume_count', width: 70, align: 'center' },
    { title: '优化', dataIndex: 'opt_count', width: 70, align: 'center' },
    { title: 'VIP', dataIndex: 'is_vip', width: 70, align: 'center', render: (v) => v ? <Tag color="gold">VIP</Tag> : <Tag>免费</Tag> },
    { title: '今日剩余额度', dataIndex: 'daily_quota', width: 110, align: 'center' },
    { title: '注册时间', dataIndex: 'created_at', width: 150, render: (v) => formatDate(v) },
    { title: '状态', dataIndex: 'status', width: 90, render: (v) => <Tag color={STATUS_COLOR[v]}>{STATUS_LABEL[v] || v}</Tag> },
    { title: '操作', key: 'action', width: 220, fixed: 'right', render: (_, record) => (
      <Space size={4}>
        <Button type="link" size="small" onClick={() => openDetail(record)}>详情</Button>
        <Button type="link" size="small" onClick={() => { setVipTarget(record); setVipForm({ is_paid: !record.is_vip, daily_limit: record.is_vip ? 3 : 10, monthly_limit: record.is_vip ? 50 : 200 }) }}>VIP/额度</Button>
        {record.status === 'active' ? (
          <Button type="link" danger size="small" onClick={() => { setBanTarget(record); setBanReason('违规操作') }}>封禁</Button>
        ) : (
          <Button type="link" size="small" onClick={() => admin.unbanUser(record.id).then(load)}>解封</Button>
        )}
      </Space>
    )},
  ]

  return (
    <Card style={{ background: cssVar('--bg-card'), borderColor: cssVar('--border-light') }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <Input placeholder="搜索邮箱/昵称" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 240 }} allowClear />
        <Select placeholder="状态" allowClear value={status || undefined} onChange={(v) => setStatus(v || '')} options={[{ label: '正常', value: 'active' }, { label: '已封禁', value: 'frozen' }]} style={{ width: 120 }} />
        <Button type="primary" icon={<SearchOutlined />} onClick={load}>查询</Button>
      </div>
      <Table rowKey="id" columns={columns} dataSource={users} loading={loading} scroll={{ x: 1200 }} pagination={{ current: page, pageSize: 10, total, onChange: setPage }} />

      <Modal title="用户详情" open={detailVisible} onCancel={() => setDetailVisible(false)} footer={null} width={720}>
        {detail && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="昵称">{detail.nickname || '-'}</Descriptions.Item>
            <Descriptions.Item label="邮箱">{detail.email}</Descriptions.Item>
            <Descriptions.Item label="手机">{detail.phone || '-'}</Descriptions.Item>
            <Descriptions.Item label="求职状态">{detail.career_state ? (CAREER_LABEL[detail.career_state] || detail.career_state) : '-'}</Descriptions.Item>
            <Descriptions.Item label="简历数">{detail.resume_count}</Descriptions.Item>
            <Descriptions.Item label="优化次数">{detail.opt_count}</Descriptions.Item>
            <Descriptions.Item label="状态"><Tag color={STATUS_COLOR[detail.status]}>{STATUS_LABEL[detail.status] || detail.status}</Tag></Descriptions.Item>
            <Descriptions.Item label="注册时间">{formatDate(detail.created_at || '')}</Descriptions.Item>
            <Descriptions.Item label="日额度">{detail.quota.daily_used} / {detail.quota.daily_limit}</Descriptions.Item>
            <Descriptions.Item label="月额度">{detail.quota.monthly_used} / {detail.quota.monthly_limit}</Descriptions.Item>
            <Descriptions.Item label="会员类型">{detail.quota.is_paid ? <Tag color="gold">VIP</Tag> : <Tag>免费</Tag>}</Descriptions.Item>
            <Descriptions.Item label="求职意向" span={2}>
              {detail.expectation
                ? `${detail.expectation.job_title || '不限'} · ${(detail.expectation.cities || []).join('/') || '城市不限'} · ${(detail.expectation.industries || []).join('/') || '行业不限'} · ${detail.expectation.salary_range || '薪资不限'}`
                : '未填写'}
            </Descriptions.Item>
          </Descriptions>
        )}
        {detail && (
          <>
            <Divider>最近订单</Divider>
            <Table rowKey="order_no" size="small" pagination={false}
              dataSource={detail.orders || []}
              columns={[
                { title: '订单号', dataIndex: 'order_no' },
                { title: '套餐', dataIndex: 'package_name', render: (v) => v || '-' },
                { title: '金额', dataIndex: 'amount', render: (v) => `¥${Number(v).toFixed(2)}` },
                { title: '状态', dataIndex: 'status', render: (v) => <Tag color={ORDER_STATUS[v]?.color}>{ORDER_STATUS[v]?.label || v}</Tag> },
                { title: '时间', dataIndex: 'created_at', render: (v) => formatDate(v) },
              ]}
              locale={{ emptyText: '暂无订单' }}
            />
            <Divider>最近动态</Divider>
            <Table rowKey="created_at" size="small" pagination={false}
              dataSource={detail.recent_logs || []}
              columns={[
                { title: '行为', dataIndex: 'action' },
                { title: '详情', dataIndex: 'detail', ellipsis: true },
                { title: '时间', dataIndex: 'created_at', render: (v) => formatDate(v) },
              ]}
              locale={{ emptyText: '暂无动态' }}
            />
          </>
        )}
      </Modal>

      <Modal title={`封禁用户：${banTarget?.nickname || ''}`} open={!!banTarget} onCancel={() => setBanTarget(null)}
        onOk={async () => {
          if (!banTarget) return
          await admin.banUser(banTarget.id, banReason)
          message.success('已封禁'); setBanTarget(null); load()
        }}>
        <Input.TextArea rows={3} value={banReason} onChange={(e) => setBanReason(e.target.value)} placeholder="封禁原因" />
      </Modal>

      <Modal title={`会员与额度：${vipTarget?.nickname || ''}`} open={!!vipTarget} onCancel={() => setVipTarget(null)}
        onOk={async () => {
          if (!vipTarget) return
          await admin.setVip(vipTarget.id, vipForm.is_paid, vipForm.daily_limit, vipForm.monthly_limit)
          message.success('已更新'); setVipTarget(null); load()
        }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>VIP 会员</span>
            <Switch checked={vipForm.is_paid} onChange={(v) => setVipForm({ ...vipForm, is_paid: v })} />
          </div>
          <div>
            <div style={{ marginBottom: 4, fontSize: 13, color: cssVar('--text-secondary') }}>每日额度</div>
            <InputNumber style={{ width: '100%' }} min={1} value={vipForm.daily_limit} onChange={(v) => setVipForm({ ...vipForm, daily_limit: v || 3 })} />
          </div>
          <div>
            <div style={{ marginBottom: 4, fontSize: 13, color: cssVar('--text-secondary') }}>每月额度</div>
            <InputNumber style={{ width: '100%' }} min={1} value={vipForm.monthly_limit} onChange={(v) => setVipForm({ ...vipForm, monthly_limit: v || 50 })} />
          </div>
        </div>
      </Modal>

      <Modal title={`追加额度：${quotaTarget?.nickname || ''}`} open={!!quotaTarget} onCancel={() => setQuotaTarget(null)}
        onOk={async () => {
          if (!quotaTarget) return
          await admin.addUserQuota(quotaTarget.id, quotaForm.amount, quotaForm.reason)
          message.success('额度已追加'); setQuotaTarget(null); load()
        }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ marginBottom: 4, fontSize: 13, color: cssVar('--text-secondary') }}>追加数量（次）</div>
            <InputNumber style={{ width: '100%' }} min={1} value={quotaForm.amount} onChange={(v) => setQuotaForm({ ...quotaForm, amount: v || 1 })} />
          </div>
          <div>
            <div style={{ marginBottom: 4, fontSize: 13, color: cssVar('--text-secondary') }}>原因</div>
            <Input value={quotaForm.reason} onChange={(e) => setQuotaForm({ ...quotaForm, reason: e.target.value })} />
          </div>
        </div>
      </Modal>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════
//  内容管理：模板 + 关键词库 + ATS 规则
// ═══════════════════════════════════════════════════════

function ContentPanel() {
  const [activeTab, setActiveTab] = useState('templates')
  const [templates, setTemplates] = useState<TemplateItem[]>([])
  const [keywords, setKeywords] = useState<KeywordItem[]>([])
  const [atsRules, setAtsRules] = useState<ATSRuleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [industryFilter, setIndustryFilter] = useState('')

  const [tplModal, setTplModal] = useState<{ open: boolean; editing?: TemplateItem } | null>(null)
  const [tplForm, setTplForm] = useState({ name: '', description: '' })
  const [kwModal, setKwModal] = useState(false)
  const [kwForm, setKwForm] = useState({ keyword: '', industry: '互联网', category: 'hard_skill' })
  const [kwBatchModal, setKwBatchModal] = useState(false)
  const [kwBatchText, setKwBatchText] = useState('')
  const [atsModal, setAtsModal] = useState<{ open: boolean; editing?: ATSRuleItem } | null>(null)
  const [atsForm, setAtsForm] = useState({ name: '', pattern: '', severity: 'warning', description: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [t, k, a] = await Promise.all([
        admin.getTemplates().catch(() => ({ data: [] })),
        admin.getKeywords(industryFilter).catch(() => ({ data: [] })),
        admin.getAtsRules().catch(() => ({ data: [] })),
      ])
      setTemplates(t.data || [])
      setKeywords(k.data || [])
      setAtsRules(a.data || [])
    } catch { message.error('加载内容失败') } finally { setLoading(false) }
  }, [industryFilter])

  useEffect(() => { load() }, [load])

  const saveTemplate = async () => {
    if (!tplForm.name.trim()) { message.warning('请填写模板名称'); return }
    if (tplModal?.editing) {
      await admin.updateTemplate(tplModal.editing.id, { name: tplForm.name })
      message.success('模板已更新')
    } else {
      await admin.createTemplate(tplForm.name, tplForm.description)
      message.success('模板已创建')
    }
    setTplModal(null); load()
  }

  const saveKeyword = async () => {
    if (!kwForm.keyword.trim()) { message.warning('请填写关键词'); return }
    await admin.createKeyword(kwForm.keyword, kwForm.industry, kwForm.category)
    message.success('关键词已添加'); setKwModal(false); setKwForm({ keyword: '', industry: '互联网', category: 'hard_skill' }); load()
  }

  const batchImport = async () => {
    const items = kwBatchText.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
      const [keyword, industry, category] = line.split(/[,，]/).map((s) => s.trim())
      return { keyword, industry: industry || '通用', category: category || 'hard_skill' }
    }).filter((i) => i.keyword)
    if (!items.length) { message.warning('没有可导入的关键词'); return }
    await admin.batchImportKeywords(items)
    message.success(`已导入 ${items.length} 个关键词`); setKwBatchModal(false); setKwBatchText(''); load()
  }

  const saveAtsRule = async () => {
    if (!atsForm.name.trim() || !atsForm.pattern.trim()) { message.warning('请填写规则名和匹配模式'); return }
    if (atsModal?.editing) {
      await admin.updateAtsRule(atsModal.editing.id, { severity: atsForm.severity })
      message.success('规则已更新')
    } else {
      await admin.createAtsRule(atsForm.name, atsForm.pattern, atsForm.severity, atsForm.description)
      message.success('规则已创建')
    }
    setAtsModal(null); load()
  }

  const templateColumns: TableColumnsType<TemplateItem> = [
    { title: '名称', dataIndex: 'name', render: (v) => <span style={{ color: cssVar('--text-primary') }}>{v}</span> },
    { title: '描述', dataIndex: 'description', ellipsis: true },
    { title: '默认', dataIndex: 'is_default', width: 80, render: (v) => v ? <Tag color="blue">是</Tag> : <Tag>否</Tag> },
    { title: '状态', dataIndex: 'is_active', width: 80, render: (v) => <Tag color={v ? 'success' : 'default'}>{v ? '启用' : '停用'}</Tag> },
    { title: '创建时间', dataIndex: 'created_at', width: 150, render: (v) => formatDate(v) },
    { title: '操作', key: 'action', width: 220, render: (_, r) => (
      <Space size={4}>
        <Button type="link" size="small" onClick={() => { setTplModal({ open: true, editing: r }); setTplForm({ name: r.name, description: r.description || '' }) }}>编辑</Button>
        <Button type="link" size="small" onClick={() => admin.updateTemplate(r.id, { is_default: !r.is_default }).then(() => { message.success('已设置'); load() })}>
          {r.is_default ? '取消默认' : '设为默认'}
        </Button>
        <Button type="link" size="small" onClick={() => admin.updateTemplate(r.id, { is_active: !r.is_active }).then(() => { message.success('已更新'); load() })}>
          {r.is_active ? '停用' : '启用'}
        </Button>
        <Popconfirm title="确认删除该模板？" onConfirm={() => admin.deleteTemplate(r.id).then(() => { message.success('已删除'); load() })}>
          <Button type="link" danger size="small">删除</Button>
        </Popconfirm>
      </Space>
    )},
  ]

  const keywordColumns: TableColumnsType<KeywordItem> = [
    { title: '关键词', dataIndex: 'keyword', render: (v) => <span style={{ color: cssVar('--text-primary') }}>{v}</span> },
    { title: '行业', dataIndex: 'industry', width: 120 },
    { title: '分类', dataIndex: 'category', width: 100, render: (v) => KEYWORD_CATEGORY[v] || v },
    { title: '状态', dataIndex: 'is_active', width: 90, render: (v) => <Tag color={v ? 'success' : 'default'}>{v ? '启用' : '停用'}</Tag> },
    { title: '操作', key: 'action', width: 140, render: (_, r) => (
      <Space size={4}>
        <Button type="link" size="small" onClick={() => admin.updateKeyword(r.id, !r.is_active).then(() => { message.success('已更新'); load() })}>
          {r.is_active ? '停用' : '启用'}
        </Button>
        <Popconfirm title="确认删除该关键词？" onConfirm={() => admin.deleteKeyword(r.id).then(() => { message.success('已删除'); load() })}>
          <Button type="link" danger size="small">删除</Button>
        </Popconfirm>
      </Space>
    )},
  ]

  const atsColumns: TableColumnsType<ATSRuleItem> = [
    { title: '规则名', dataIndex: 'name', render: (v) => <span style={{ color: cssVar('--text-primary') }}>{v}</span> },
    { title: '匹配模式', dataIndex: 'pattern', ellipsis: true },
    { title: '严重等级', dataIndex: 'severity', width: 100, render: (v) => <Tag color={v === 'error' ? 'error' : v === 'warning' ? 'warning' : 'default'}>{v === 'error' ? '错误' : v === 'warning' ? '警告' : '提示'}</Tag> },
    { title: '说明', dataIndex: 'description', ellipsis: true },
    { title: '状态', dataIndex: 'is_active', width: 90, render: (v) => <Tag color={v ? 'success' : 'default'}>{v ? '启用' : '停用'}</Tag> },
    { title: '操作', key: 'action', width: 200, render: (_, r) => (
      <Space size={4}>
        <Button type="link" size="small" onClick={() => { setAtsModal({ open: true, editing: r }); setAtsForm({ name: r.name, pattern: r.pattern, severity: r.severity, description: r.description || '' }) }}>编辑</Button>
        <Button type="link" size="small" onClick={() => admin.updateAtsRule(r.id, { is_active: !r.is_active }).then(() => { message.success('已更新'); load() })}>
          {r.is_active ? '停用' : '启用'}
        </Button>
        <Popconfirm title="确认删除该规则？" onConfirm={() => admin.deleteAtsRule(r.id).then(() => { message.success('已删除'); load() })}>
          <Button type="link" danger size="small">删除</Button>
        </Popconfirm>
      </Space>
    )},
  ]

  return (
    <Card style={{ background: cssVar('--bg-card'), borderColor: cssVar('--border-light') }}>
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
        {
          key: 'templates', label: '简历模板',
          children: (
            <>
              <div style={{ marginBottom: 12, textAlign: 'right' }}>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => { setTplModal({ open: true }); setTplForm({ name: '', description: '' }) }}>新建模板</Button>
              </div>
              <Table rowKey="id" columns={templateColumns} dataSource={templates} loading={loading} pagination={{ pageSize: 10 }} />
            </>
          ),
        },
        {
          key: 'keywords', label: '关键词库',
          children: (
            <>
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <Select placeholder="行业筛选" allowClear value={industryFilter || undefined} onChange={(v) => setIndustryFilter(v || '')}
                  options={Array.from(new Set(keywords.map((k) => k.industry))).map((i) => ({ label: i, value: i }))} style={{ width: 160 }} />
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setKwModal(true)}>新增关键词</Button>
                <Button icon={<FileSyncOutlined />} onClick={() => setKwBatchModal(true)}>批量导入</Button>
              </div>
              <Table rowKey="id" columns={keywordColumns} dataSource={keywords} loading={loading} pagination={{ pageSize: 10 }} />
            </>
          ),
        },
        {
          key: 'ats', label: 'ATS规则',
          children: (
            <>
              <div style={{ marginBottom: 12, textAlign: 'right' }}>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => { setAtsModal({ open: true }); setAtsForm({ name: '', pattern: '', severity: 'warning', description: '' }) }}>新建规则</Button>
              </div>
              <Table rowKey="id" columns={atsColumns} dataSource={atsRules} loading={loading} pagination={{ pageSize: 10 }} />
            </>
          ),
        },
      ]} />

      <Modal title={tplModal?.editing ? '编辑模板' : '新建模板'} open={!!tplModal} onCancel={() => setTplModal(null)} onOk={saveTemplate}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ marginBottom: 4, fontSize: 13, color: cssVar('--text-secondary') }}>模板名称</div>
            <Input value={tplForm.name} onChange={(e) => setTplForm({ ...tplForm, name: e.target.value })} placeholder="如：简约蓝" />
          </div>
          <div>
            <div style={{ marginBottom: 4, fontSize: 13, color: cssVar('--text-secondary') }}>描述</div>
            <Input.TextArea rows={3} value={tplForm.description} onChange={(e) => setTplForm({ ...tplForm, description: e.target.value })} />
          </div>
        </div>
      </Modal>

      <Modal title="新增关键词" open={kwModal} onCancel={() => setKwModal(false)} onOk={saveKeyword}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ marginBottom: 4, fontSize: 13, color: cssVar('--text-secondary') }}>关键词</div>
            <Input value={kwForm.keyword} onChange={(e) => setKwForm({ ...kwForm, keyword: e.target.value })} />
          </div>
          <div>
            <div style={{ marginBottom: 4, fontSize: 13, color: cssVar('--text-secondary') }}>行业</div>
            <Input value={kwForm.industry} onChange={(e) => setKwForm({ ...kwForm, industry: e.target.value })} />
          </div>
          <div>
            <div style={{ marginBottom: 4, fontSize: 13, color: cssVar('--text-secondary') }}>分类</div>
            <Select style={{ width: '100%' }} value={kwForm.category} onChange={(v) => setKwForm({ ...kwForm, category: v })}
              options={Object.entries(KEYWORD_CATEGORY).map(([value, label]) => ({ label, value }))} />
          </div>
        </div>
      </Modal>

      <Modal title="批量导入关键词" open={kwBatchModal} onCancel={() => setKwBatchModal(false)} onOk={batchImport}>
        <div style={{ marginBottom: 8, fontSize: 13, color: cssVar('--text-tertiary') }}>
          每行一条，格式：<code>关键词,行业,分类</code>（行业和分类可省略，默认「通用 / 硬技能」）
        </div>
        <Input.TextArea rows={8} value={kwBatchText} onChange={(e) => setKwBatchText(e.target.value)}
          placeholder={'Python,互联网,hard_skill\n数据分析,金融,hard_skill\n项目管理,通用,soft_skill'} />
      </Modal>

      <Modal title={atsModal?.editing ? '编辑ATS规则' : '新建ATS规则'} open={!!atsModal} onCancel={() => setAtsModal(null)} onOk={saveAtsRule}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ marginBottom: 4, fontSize: 13, color: cssVar('--text-secondary') }}>规则名</div>
            <Input value={atsForm.name} onChange={(e) => setAtsForm({ ...atsForm, name: e.target.value })} />
          </div>
          <div>
            <div style={{ marginBottom: 4, fontSize: 13, color: cssVar('--text-secondary') }}>匹配模式（正则）</div>
            <Input value={atsForm.pattern} onChange={(e) => setAtsForm({ ...atsForm, pattern: e.target.value })} placeholder="如：\b(?:年龄|性别|婚姻)\b" />
          </div>
          <div>
            <div style={{ marginBottom: 4, fontSize: 13, color: cssVar('--text-secondary') }}>严重等级</div>
            <Select style={{ width: '100%' }} value={atsForm.severity} onChange={(v) => setAtsForm({ ...atsForm, severity: v })}
              options={[{ label: '错误', value: 'error' }, { label: '警告', value: 'warning' }, { label: '提示', value: 'info' }]} />
          </div>
          <div>
            <div style={{ marginBottom: 4, fontSize: 13, color: cssVar('--text-secondary') }}>说明</div>
            <Input.TextArea rows={2} value={atsForm.description} onChange={(e) => setAtsForm({ ...atsForm, description: e.target.value })} />
          </div>
        </div>
      </Modal>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════
//  AI 模型管理：Prompt 模板 + 模型配置 + 调用日志
// ═══════════════════════════════════════════════════════

function AIModelPanel() {
  const [activeTab, setActiveTab] = useState('prompts')
  const [prompts, setPrompts] = useState<PromptItem[]>([])
  const [promptDetail, setPromptDetail] = useState<PromptDetail | null>(null)
  const [models, setModels] = useState<ModelConfig[]>([])
  const [logs, setLogs] = useState<CallLog[]>([])
  const [logTotal, setLogTotal] = useState(0)
  const [logPage, setLogPage] = useState(1)
  const [logModel, setLogModel] = useState('')
  const [logSuccess, setLogSuccess] = useState<boolean | undefined>(undefined)
  const [loading, setLoading] = useState(true)

  const [modelEdit, setModelEdit] = useState<ModelConfig | null>(null)
  const [modelForm, setModelForm] = useState({ weight: 1, rate_limit_per_minute: 60, tier: 'free', is_enabled: true })
  const [promptCreate, setPromptCreate] = useState(false)
  const [promptForm, setPromptForm] = useState({ name: '', scene: 'general', content: '' })
  const [deployTarget, setDeployTarget] = useState<PromptItem | null>(null)
  const [grayRatio, setGrayRatio] = useState(0)
  const [rollbackTarget, setRollbackTarget] = useState<PromptItem | null>(null)
  const [rollbackVersion, setRollbackVersion] = useState(1)

  const loadPrompts = useCallback(async () => {
    try {
      const res = await admin.getPrompts()
      setPrompts(res.data?.prompts || [])
    } catch { /* ignore */ }
  }, [])

  const loadModels = useCallback(async () => {
    try {
      const res = await admin.getModels()
      setModels(res.data?.models || [])
    } catch { /* ignore */ }
  }, [])

  const loadLogs = useCallback(async () => {
    try {
      const res = await admin.getCallLogs(logPage, 20, logModel, logSuccess)
      setLogs(res.data?.items || [])
      setLogTotal(res.data?.total || 0)
    } catch { /* ignore */ }
  }, [logPage, logModel, logSuccess])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      await Promise.all([loadPrompts(), loadModels(), loadLogs()])
      setLoading(false)
    }
    load()
  }, [loadPrompts, loadModels, loadLogs])

  const openPromptDetail = async (p: PromptItem) => {
    try {
      const res = await admin.getPromptDetail(p.id)
      setPromptDetail(res.data)
    } catch { message.error('加载Prompt详情失败') }
  }

  const promptColumns: TableColumnsType<PromptItem> = [
    { title: '名称', dataIndex: 'name', render: (v) => <span style={{ color: cssVar('--text-primary') }}>{v}</span> },
    { title: '场景', dataIndex: 'scene', width: 120, render: (v) => SCENE_LABELS[v] || v },
    { title: '版本', dataIndex: 'version', width: 70, align: 'center', render: (v) => `v${v}` },
    { title: '灰度', dataIndex: 'gray_ratio', width: 80, align: 'center', render: (v) => `${v}%` },
    { title: '状态', dataIndex: 'is_active', width: 90, render: (v) => <Tag color={v ? 'success' : 'default'}>{v ? '已部署' : '未部署'}</Tag> },
    { title: '创建时间', dataIndex: 'created_at', width: 150, render: (v) => formatDate(v) },
    { title: '操作', key: 'action', width: 260, render: (_, r) => (
      <Space size={4}>
        <Button type="link" size="small" onClick={() => openPromptDetail(r)}>详情</Button>
        <Button type="link" size="small" onClick={() => { setDeployTarget(r); setGrayRatio(r.gray_ratio || 0) }}>部署</Button>
        <Button type="link" size="small" onClick={() => { setRollbackTarget(r); setRollbackVersion(Math.max(1, r.version - 1)) }}>回滚</Button>
      </Space>
    )},
  ]

  const modelColumns: TableColumnsType<ModelConfig> = [
    { title: '模型', dataIndex: 'display_name', render: (v, r) => (
      <div>
        <div style={{ color: cssVar('--text-primary'), fontWeight: 500 }}>{v}</div>
        <div style={{ fontSize: 12, color: cssVar('--text-tertiary') }}>{r.model_name}</div>
      </div>
    ) },
    { title: '层级', dataIndex: 'tier', width: 80, render: (v) => <Tag color={v === 'vip' ? 'gold' : 'default'}>{v === 'vip' ? 'VIP' : '免费'}</Tag> },
    { title: '权重', dataIndex: 'weight', width: 70, align: 'center' },
    { title: '每分钟限流', dataIndex: 'rate_limit_per_minute', width: 110, align: 'center' },
    { title: '24h调用', dataIndex: 'stats', width: 90, align: 'center', render: (v) => v?.total || 0 },
    { title: '24h成功率', dataIndex: 'stats', width: 100, align: 'center', render: (v) => v ? `${v.success_rate}%` : '-' },
    { title: '连续失败', dataIndex: 'consecutive_failures', width: 90, align: 'center', render: (v) => v > 0 ? <Tag color="error">{v}</Tag> : <Tag color="success">0</Tag> },
    { title: '状态', dataIndex: 'is_enabled', width: 80, render: (v) => <Tag color={v ? 'success' : 'error'}>{v ? '启用' : '停用'}</Tag> },
    { title: '操作', key: 'action', width: 90, render: (_, r) => (
      <Button type="link" size="small" onClick={() => {
        setModelEdit(r)
        setModelForm({ weight: r.weight, rate_limit_per_minute: r.rate_limit_per_minute, tier: r.tier, is_enabled: r.is_enabled })
      }}>配置</Button>
    )},
  ]

  const logColumns: TableColumnsType<CallLog> = [
    { title: '时间', dataIndex: 'created_at', width: 160, render: (v) => formatDate(v) },
    { title: '模型', dataIndex: 'model_name', width: 130, render: (v) => <span style={{ fontSize: 12 }}>{v}</span> },
    { title: 'Prompt', dataIndex: 'prompt_template_name', width: 130, render: (v, r) => v ? `${v}${r.prompt_version ? ` v${r.prompt_version}` : ''}` : '-' },
    { title: '输入', dataIndex: 'input_tokens', width: 80, align: 'right', render: (v) => v ?? '-' },
    { title: '输出', dataIndex: 'output_tokens', width: 80, align: 'right', render: (v) => v ?? '-' },
    { title: '耗时', dataIndex: 'latency_ms', width: 90, align: 'right', render: (v) => v ? `${v}ms` : '-' },
    { title: '费用', dataIndex: 'cost_usd', width: 90, align: 'right', render: (v) => v ? `$${Number(v).toFixed(4)}` : '-' },
    { title: '结果', dataIndex: 'is_success', width: 80, render: (v, r) => v
      ? <Tag color="success">成功</Tag>
      : <Tooltip title={r.error_message || '未知错误'}><Tag color="error">失败</Tag></Tooltip> },
  ]

  return (
    <Card style={{ background: cssVar('--bg-card'), borderColor: cssVar('--border-light') }}>
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
        {
          key: 'prompts', label: 'Prompt 模板',
          children: (
            <>
              <div style={{ marginBottom: 12, textAlign: 'right' }}>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => { setPromptCreate(true); setPromptForm({ name: '', scene: 'general', content: '' }) }}>新建 Prompt 版本</Button>
              </div>
              <Table rowKey="id" columns={promptColumns} dataSource={prompts} loading={loading} pagination={{ pageSize: 10 }} />
            </>
          ),
        },
        {
          key: 'models', label: '模型配置',
          children: <Table rowKey="id" columns={modelColumns} dataSource={models} loading={loading} pagination={false} />,
        },
        {
          key: 'logs', label: '调用日志',
          children: (
            <>
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <Select placeholder="模型筛选" allowClear value={logModel || undefined} onChange={(v) => setLogModel(v || '')} style={{ width: 200 }}
                  options={Array.from(new Set(models.map((m) => m.model_name))).map((m) => ({ label: m, value: m }))} />
                <Select placeholder="结果筛选" allowClear value={logSuccess} onChange={(v) => setLogSuccess(v)} style={{ width: 140 }}
                  options={[{ label: '成功', value: true }, { label: '失败', value: false }]} />
                <Button icon={<ReloadOutlined />} onClick={loadLogs}>刷新</Button>
              </div>
              <Table rowKey="id" columns={logColumns} dataSource={logs} loading={loading}
                pagination={{ current: logPage, pageSize: 20, total: logTotal, onChange: setLogPage }} />
            </>
          ),
        },
      ]} />

      <Modal title="Prompt 详情" open={!!promptDetail} onCancel={() => setPromptDetail(null)} footer={null} width={720}>
        {promptDetail && (
          <>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="名称">{promptDetail.name}</Descriptions.Item>
              <Descriptions.Item label="场景">{SCENE_LABELS[promptDetail.scene] || promptDetail.scene}</Descriptions.Item>
              <Descriptions.Item label="当前版本">v{promptDetail.version}</Descriptions.Item>
              <Descriptions.Item label="灰度">{promptDetail.gray_ratio}%</Descriptions.Item>
            </Descriptions>
            <Divider>模板内容</Divider>
            <pre style={{ whiteSpace: 'pre-wrap', background: cssVar('--bg-body'), padding: 12, borderRadius: 8, fontSize: 13 }}>{promptDetail.content}</pre>
            <Divider>全部版本</Divider>
            <Table rowKey="id" size="small" pagination={false}
              dataSource={promptDetail.all_versions || []}
              columns={[
                { title: '版本', dataIndex: 'version', render: (v) => `v${v}` },
                { title: '灰度', dataIndex: 'gray_ratio', render: (v) => `${v}%` },
                { title: '状态', dataIndex: 'is_active', render: (v) => <Tag color={v ? 'success' : 'default'}>{v ? '已部署' : '未部署'}</Tag> },
                { title: '创建时间', dataIndex: 'created_at', render: (v) => formatDate(v) },
              ]}
            />
          </>
        )}
      </Modal>

      <Modal title={`配置模型：${modelEdit?.display_name || ''}`} open={!!modelEdit} onCancel={() => setModelEdit(null)}
        onOk={async () => {
          if (!modelEdit) return
          await admin.updateModel(modelEdit.id, modelForm)
          message.success('模型配置已更新'); setModelEdit(null); loadModels()
        }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ marginBottom: 4, fontSize: 13, color: cssVar('--text-secondary') }}>权重（越大被选中的概率越高）</div>
            <InputNumber style={{ width: '100%' }} min={1} value={modelForm.weight} onChange={(v) => setModelForm({ ...modelForm, weight: v || 1 })} />
          </div>
          <div>
            <div style={{ marginBottom: 4, fontSize: 13, color: cssVar('--text-secondary') }}>每分钟限流</div>
            <InputNumber style={{ width: '100%' }} min={1} value={modelForm.rate_limit_per_minute} onChange={(v) => setModelForm({ ...modelForm, rate_limit_per_minute: v || 60 })} />
          </div>
          <div>
            <div style={{ marginBottom: 4, fontSize: 13, color: cssVar('--text-secondary') }}>层级</div>
            <Select style={{ width: '100%' }} value={modelForm.tier} onChange={(v) => setModelForm({ ...modelForm, tier: v })}
              options={[{ label: '免费', value: 'free' }, { label: 'VIP', value: 'vip' }]} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>启用</span>
            <Switch checked={modelForm.is_enabled} onChange={(v) => setModelForm({ ...modelForm, is_enabled: v })} />
          </div>
        </div>
      </Modal>

      <Modal title="新建 Prompt 版本" open={promptCreate} onCancel={() => setPromptCreate(false)}
        onOk={async () => {
          if (!promptForm.name.trim() || !promptForm.content.trim()) { message.warning('请填写名称和内容'); return }
          const res = await admin.createPrompt(promptForm.name, promptForm.scene, promptForm.content)
          message.success(`版本 v${res.data?.version} 已创建`); setPromptCreate(false); loadPrompts()
        }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ marginBottom: 4, fontSize: 13, color: cssVar('--text-secondary') }}>名称（同一名称下自动递增版本号）</div>
            <Input value={promptForm.name} onChange={(e) => setPromptForm({ ...promptForm, name: e.target.value })} />
          </div>
          <div>
            <div style={{ marginBottom: 4, fontSize: 13, color: cssVar('--text-secondary') }}>场景</div>
            <Select style={{ width: '100%' }} value={promptForm.scene} onChange={(v) => setPromptForm({ ...promptForm, scene: v })}
              options={Object.entries(SCENE_LABELS).map(([value, label]) => ({ label, value }))} />
          </div>
          <div>
            <div style={{ marginBottom: 4, fontSize: 13, color: cssVar('--text-secondary') }}>模板内容</div>
            <Input.TextArea rows={8} value={promptForm.content} onChange={(e) => setPromptForm({ ...promptForm, content: e.target.value })} />
          </div>
        </div>
      </Modal>

      <Modal title={`部署 Prompt：${deployTarget?.name || ''}`} open={!!deployTarget} onCancel={() => setDeployTarget(null)}
        onOk={async () => {
          if (!deployTarget) return
          await admin.deployPrompt(deployTarget.id, grayRatio)
          message.success(`已部署（灰度 ${grayRatio}%）`); setDeployTarget(null); loadPrompts()
        }}>
        <div style={{ marginBottom: 8, fontSize: 13, color: cssVar('--text-tertiary') }}>灰度比例：0% 表示全量发布；其余比例按用户随机放量。</div>
        <InputNumber min={0} max={100} value={grayRatio} onChange={(v) => setGrayRatio(v || 0)} style={{ width: '100%' }} addonAfter="%" />
      </Modal>

      <Modal title={`回滚 Prompt：${rollbackTarget?.name || ''}`} open={!!rollbackTarget} onCancel={() => setRollbackTarget(null)}
        onOk={async () => {
          if (!rollbackTarget) return
          await admin.rollbackPrompt(rollbackTarget.name, rollbackTarget.scene, rollbackVersion)
          message.success(`已回滚到 v${rollbackVersion}`); setRollbackTarget(null); loadPrompts()
        }}>
        <div style={{ marginBottom: 8, fontSize: 13, color: cssVar('--text-tertiary') }}>选择要回滚到的历史版本：</div>
        <Select style={{ width: '100%' }} value={rollbackVersion} onChange={setRollbackVersion}
          options={prompts.filter((p) => p.name === rollbackTarget?.name && p.scene === rollbackTarget?.scene && p.version !== rollbackTarget?.version)
            .map((p) => ({ label: `v${p.version}（${formatDate(p.created_at || '')}）`, value: p.version }))} />
      </Modal>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════
//  任务监控中心
// ═══════════════════════════════════════════════════════

function MonitorPanel() {
  const [stats, setStats] = useState<TaskStats | null>(null)
  const [failed, setFailed] = useState<FailedTask[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, f] = await Promise.all([admin.getTaskStats(), admin.getFailedTasks()])
      setStats(s.data || null)
      setFailed(f.data?.items || [])
    } catch { message.error('加载监控数据失败') } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const failedColumns: TableColumnsType<FailedTask> = [
    { title: '时间', dataIndex: 'created_at', width: 160, render: (v) => formatDate(v) },
    { title: '模型', dataIndex: 'model_name', width: 140, render: (v) => <span style={{ fontSize: 12 }}>{v}</span> },
    { title: '用户', dataIndex: 'user_id', width: 110, render: (v) => <Tooltip title={v}>{shortId(v)}</Tooltip> },
    { title: '错误信息', dataIndex: 'error_message', ellipsis: true },
    { title: '操作', key: 'action', width: 80, render: (_, r) => (
      <Button type="link" size="small" onClick={() => admin.retryTasks([r.id]).then(() => message.success('已触发重试'))}>重试</Button>
    )},
  ]

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={10}>
        <Card title="今日任务统计" style={{ background: cssVar('--bg-card'), borderColor: cssVar('--border-light') }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <KpiCard label="今日调用" value={formatNumber(stats?.today_total || 0)} icon={<ClockCircleOutlined />} iconBg={cssVar('--warning-50')} iconColor={cssVar('--warning-500')} />
            <KpiCard label="今日成功" value={formatNumber(stats?.today_success || 0)} icon={<CheckCircleOutlined />} iconBg={cssVar('--success-50')} iconColor={cssVar('--success-500')} />
            <KpiCard label="成功率" value={`${(stats?.success_rate || 0).toFixed(1)}%`} icon={<SyncOutlined spin />} iconBg={cssVar('--primary-50')} iconColor={cssVar('--primary-500')} />
            <KpiCard label="平均耗时" value={`${Math.round(stats?.avg_latency_ms || 0)}ms`} icon={<ThunderboltOutlined />} iconBg={`${cssVar('--purple-500')}20`} iconColor={cssVar('--purple-500')} />
          </div>
        </Card>
        <Card title="失败原因分布（今日）" style={{ background: cssVar('--bg-card'), borderColor: cssVar('--border-light'), marginTop: 16 }}>
          {(stats?.fail_by_reason || []).length > 0 ? (
            (stats?.fail_by_reason || []).map((r) => (
              <ProgressBar key={r.reason} label={r.reason} value={r.count} color={cssVar('--error-500')} suffix=" 次" />
            ))
          ) : <Empty description="今日暂无失败" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
        </Card>
      </Col>
      <Col xs={24} lg={14}>
        <Card title="模型健康度（24小时）" style={{ background: cssVar('--bg-card'), borderColor: cssVar('--border-light'), marginBottom: 16 }}>
          <Table rowKey="model_name" size="small" loading={loading} pagination={false}
            dataSource={Object.entries(stats?.model_health || {}).map(([model_name, v]) => ({ model_name, ...v }))}
            columns={[
              { title: '模型', dataIndex: 'model_name', render: (v) => <span style={{ fontSize: 12 }}>{v}</span> },
              { title: '调用', dataIndex: 'total', align: 'right' },
              { title: '成功', dataIndex: 'success', align: 'right' },
              { title: '成功率', dataIndex: 'success_rate', align: 'right', render: (v) => `${v}%` },
              { title: '平均耗时', dataIndex: 'avg_latency_ms', align: 'right', render: (v) => `${Math.round(v)}ms` },
            ]}
            locale={{ emptyText: '24小时内无调用记录' }}
          />
        </Card>
        <Card title="失败任务（近24小时）" style={{ background: cssVar('--bg-card'), borderColor: cssVar('--border-light') }}>
          <Table rowKey="id" columns={failedColumns} dataSource={failed} loading={loading} pagination={{ pageSize: 8 }} />
        </Card>
      </Col>
    </Row>
  )
}

// ═══════════════════════════════════════════════════════
//  工单反馈中心
// ═══════════════════════════════════════════════════════

function FeedbackPanel() {
  const [tickets, setTickets] = useState<TicketItem[]>([])
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([])
  const [clustering, setClustering] = useState<{ total_low: number; samples: string[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [category, setCategory] = useState('')
  const [minScore, setMinScore] = useState<number | undefined>(undefined)

  const [detail, setDetail] = useState<TicketDetail | null>(null)
  const [replyContent, setReplyContent] = useState('')
  const [replyInternal, setReplyInternal] = useState(false)
  const [replying, setReplying] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [t, f, c] = await Promise.all([
        admin.getTickets(1, 50, status, priority, category),
        admin.getFeedbacks(1, 20, minScore),
        admin.getFeedbackClustering(7),
      ])
      setTickets(t.data?.items || [])
      setFeedbacks(f.data?.items || [])
      setClustering(c.data || null)
    } catch { message.error('加载反馈数据失败') } finally { setLoading(false) }
  }, [status, priority, category, minScore])

  useEffect(() => { load() }, [load])

  const openTicket = async (t: TicketItem) => {
    try {
      const res = await admin.getTicketDetail(t.id)
      setDetail(res.data)
      setReplyContent('')
    } catch { message.error('加载工单详情失败') }
  }

  const sendReply = async () => {
    if (!detail || !replyContent.trim()) { message.warning('请输入回复内容'); return }
    setReplying(true)
    try {
      await admin.replyTicket(detail.id, replyContent, replyInternal)
      message.success('回复已发送'); setReplyContent('')
      const res = await admin.getTicketDetail(detail.id)
      setDetail(res.data)
      load()
    } catch { message.error('回复失败') } finally { setReplying(false) }
  }

  const changeTicketStatus = async (s: string, resolution?: string) => {
    if (!detail) return
    await admin.updateTicketStatus(detail.id, s, resolution)
    message.success('状态已更新')
    const res = await admin.getTicketDetail(detail.id)
    setDetail(res.data)
    load()
  }

  const ticketColumns: TableColumnsType<TicketItem> = [
    { title: '主题', dataIndex: 'subject', ellipsis: true, render: (v) => <span style={{ color: cssVar('--text-primary') }}>{v}</span> },
    { title: '用户', dataIndex: 'nickname', width: 110, render: (v) => v || '-' },
    { title: '分类', dataIndex: 'category', width: 90, render: (v) => TICKET_CATEGORY[v] || v },
    { title: '优先级', dataIndex: 'priority', width: 70, render: (v) => <Tag color={TICKET_PRIORITY[v]?.color}>{TICKET_PRIORITY[v]?.label || v}</Tag> },
    { title: '状态', dataIndex: 'status', width: 90, render: (v) => <Tag color={TICKET_STATUS[v]?.color}>{TICKET_STATUS[v]?.label || v}</Tag> },
    { title: '回复', dataIndex: 'reply_count', width: 60, align: 'center' },
    { title: '创建时间', dataIndex: 'created_at', width: 150, render: (v) => formatDate(v) },
    { title: '操作', key: 'action', width: 70, render: (_, r) => <Button type="link" size="small" onClick={() => openTicket(r)}>处理</Button> },
  ]

  const feedbackColumns: TableColumnsType<FeedbackItem> = [
    { title: '岗位', dataIndex: 'job_title', ellipsis: true, render: (v) => v || '-' },
    { title: '评分', dataIndex: 'score', width: 70, render: (v) => <Tag color={v >= 4 ? 'success' : v >= 3 ? 'warning' : 'error'}>{v} 分</Tag> },
    { title: '评价内容', dataIndex: 'feedback_text', ellipsis: true },
    { title: '时间', dataIndex: 'created_at', width: 150, render: (v) => formatDate(v) },
  ]

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={15}>
        <Card title="工单列表" style={{ background: cssVar('--bg-card'), borderColor: cssVar('--border-light') }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <Select placeholder="状态" allowClear value={status || undefined} onChange={(v) => setStatus(v || '')} style={{ width: 120 }}
              options={Object.entries(TICKET_STATUS).map(([value, v]) => ({ label: v.label, value }))} />
            <Select placeholder="优先级" allowClear value={priority || undefined} onChange={(v) => setPriority(v || '')} style={{ width: 110 }}
              options={Object.entries(TICKET_PRIORITY).map(([value, v]) => ({ label: v.label, value }))} />
            <Select placeholder="分类" allowClear value={category || undefined} onChange={(v) => setCategory(v || '')} style={{ width: 120 }}
              options={Object.entries(TICKET_CATEGORY).map(([value, label]) => ({ label, value }))} />
          </div>
          <Table rowKey="id" columns={ticketColumns} dataSource={tickets} loading={loading} pagination={{ pageSize: 8 }} />
        </Card>
      </Col>
      <Col xs={24} lg={9}>
        <Card title="用户评价" style={{ background: cssVar('--bg-card'), borderColor: cssVar('--border-light'), marginBottom: 16 }}
          extra={<Select placeholder="最低分" allowClear value={minScore} onChange={(v) => setMinScore(v)} style={{ width: 100 }} size="small"
            options={[1, 2, 3, 4, 5].map((v) => ({ label: `${v} 分以上`, value: v }))} />}>
          <Table rowKey="id" size="small" columns={feedbackColumns} dataSource={feedbacks} loading={loading} pagination={{ pageSize: 6 }} />
        </Card>
        <Card title="低分反馈聚类（近7天）" style={{ background: cssVar('--bg-card'), borderColor: cssVar('--border-light') }}>
          <Statistic title="低分反馈数（≤2分）" value={clustering?.total_low || 0} />
          <Divider style={{ margin: '12px 0' }} />
          <div style={{ maxHeight: 200, overflow: 'auto' }}>
            {(clustering?.samples || []).length > 0
              ? (clustering?.samples || []).map((s, i) => (
                <div key={i} style={{ fontSize: 12, color: cssVar('--text-secondary'), padding: '6px 0', borderBottom: `1px solid ${cssVar('--border-light')}` }}>{s}</div>
              ))
              : <Empty description="暂无低分反馈" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
          </div>
        </Card>
      </Col>

      <Drawer title={`工单处理：${detail?.subject || ''}`} open={!!detail} onClose={() => setDetail(null)} width={560}
        extra={<Space>
          <Button size="small" onClick={() => changeTicketStatus('resolved')}>标记解决</Button>
          <Button size="small" onClick={() => changeTicketStatus('closed')}>关闭工单</Button>
        </Space>}>
        {detail && (
          <>
            <Descriptions column={2} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="分类">{TICKET_CATEGORY[detail.category] || detail.category}</Descriptions.Item>
              <Descriptions.Item label="优先级"><Tag color={TICKET_PRIORITY[detail.priority]?.color}>{TICKET_PRIORITY[detail.priority]?.label}</Tag></Descriptions.Item>
              <Descriptions.Item label="状态"><Tag color={TICKET_STATUS[detail.status]?.color}>{TICKET_STATUS[detail.status]?.label}</Tag></Descriptions.Item>
              <Descriptions.Item label="创建时间">{formatDate(detail.created_at || '')}</Descriptions.Item>
            </Descriptions>
            <div style={{ background: cssVar('--bg-body'), borderRadius: 8, padding: 12, fontSize: 13, color: cssVar('--text-secondary'), whiteSpace: 'pre-wrap' }}>
              {detail.content || '（无正文）'}
            </div>
            <Divider>沟通记录（{(detail.replies || []).length}）</Divider>
            <div style={{ maxHeight: 300, overflow: 'auto', marginBottom: 16 }}>
              {(detail.replies || []).map((r) => (
                <div key={r.id} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: cssVar('--text-tertiary'), marginBottom: 4 }}>
                    {r.admin_id ? '客服' : '用户'} · {formatDate(r.created_at || '')}{r.is_internal ? ' · 内部备注' : ''}
                  </div>
                  <div style={{
                    background: r.is_internal ? cssVar('--warning-50') : cssVar('--primary-50'),
                    borderRadius: 8, padding: 10, fontSize: 13, color: cssVar('--text-primary'), whiteSpace: 'pre-wrap',
                  }}>{r.content}</div>
                </div>
              ))}
              {(detail.replies || []).length === 0 && <Empty description="暂无沟通记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
            </div>
            <Input.TextArea rows={3} value={replyContent} onChange={(e) => setReplyContent(e.target.value)} placeholder="输入回复内容…" />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
              <span style={{ fontSize: 12, color: cssVar('--text-tertiary') }}>
                <Switch size="small" checked={replyInternal} onChange={setReplyInternal} /> 内部备注（用户不可见）
              </span>
              <Button type="primary" icon={<SendOutlined />} loading={replying} onClick={sendReply}>发送回复</Button>
            </div>
          </>
        )}
      </Drawer>
    </Row>
  )
}

// ═══════════════════════════════════════════════════════
//  财务管理
// ═══════════════════════════════════════════════════════

function FinancePanel() {
  const [revenue, setRevenue] = useState<RevenueData | null>(null)
  const [orders, setOrders] = useState<OrderItem[]>([])
  const [packages, setPackages] = useState<QuotaPackageItem[]>([])
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)
  const [status, setStatus] = useState('')
  const [userSearch, setUserSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [refundTarget, setRefundTarget] = useState<OrderItem | null>(null)
  const [refundReason, setRefundReason] = useState('用户申请退款')
  const { theme } = useTheme()

  const chartColors = useMemo(() => theme === 'dark' ? {
    textSecondary: 'rgba(235,235,245,0.60)', textTertiary: 'rgba(235,235,245,0.30)',
    borderLight: 'rgba(84,84,88,0.60)', bgCard: '#1C1C1E', primary: '#0A84FF', success: '#30D158',
  } : {
    textSecondary: 'rgba(60,60,67,0.60)', textTertiary: 'rgba(60,60,67,0.30)',
    borderLight: 'rgba(60,60,67,0.29)', bgCard: '#FFFFFF', primary: '#007AFF', success: '#34C759',
  }, [theme])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [r, o, p] = await Promise.all([
        admin.getRevenue(days), admin.getOrders(page, 10, status, userSearch), admin.getPackages(),
      ])
      setRevenue(r.data || null)
      setOrders(o.data?.items || [])
      setTotal(o.data?.total || 0)
      setPackages(p.data || [])
    } catch { message.error('加载财务数据失败') } finally { setLoading(false) }
  }, [days, status, userSearch, page])

  useEffect(() => { load() }, [load])

  const revenueOption: ChartOption = useMemo(() => ({
    tooltip: { trigger: 'axis', backgroundColor: chartColors.bgCard, borderColor: chartColors.borderLight, textStyle: { color: chartColors.textSecondary } },
    grid: { left: 16, right: 16, top: 24, bottom: 32, containLabel: true },
    xAxis: {
      type: 'category', boundaryGap: false, data: (revenue?.daily || []).map((d) => d.date),
      axisLine: { lineStyle: { color: chartColors.borderLight } },
      axisLabel: { color: chartColors.textTertiary, fontSize: 11 },
    },
    yAxis: {
      type: 'value', splitLine: { lineStyle: { color: chartColors.borderLight, type: 'dashed' } },
      axisLabel: { color: chartColors.textTertiary, fontSize: 11 },
    },
    series: [{
      name: '日营收', type: 'line', smooth: true, symbol: 'circle', symbolSize: 6,
      data: (revenue?.daily || []).map((d) => d.revenue),
      itemStyle: { color: chartColors.primary },
      lineStyle: { width: 3 },
      areaStyle: { color: new (echarts as any).graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: `${resolveCssVar('--primary-500', '#3b82f6')}66` }, { offset: 1, color: `${resolveCssVar('--primary-500', '#3b82f6')}08` }]) },
    }],
  }), [revenue, theme])

  const orderColumns: TableColumnsType<OrderItem> = [
    { title: '订单号', dataIndex: 'order_no', width: 200, render: (v) => <span style={{ fontSize: 12 }}>{v}</span> },
    { title: '用户', dataIndex: 'nickname', width: 110, render: (v, r) => v || <Tooltip title={r.user_id}>{shortId(r.user_id)}</Tooltip> },
    { title: '邮箱', dataIndex: 'email', ellipsis: true, render: (v) => v || '-' },
    { title: '套餐', dataIndex: 'package_name', width: 140, render: (v, r) => v || r.package_type },
    { title: '金额', dataIndex: 'amount', width: 100, align: 'right', render: (v) => `¥${Number(v).toFixed(2)}` },
    { title: '支付方式', dataIndex: 'payment_method', width: 100, render: (v) => v || '-' },
    { title: '状态', dataIndex: 'status', width: 90, render: (v) => <Tag color={ORDER_STATUS[v]?.color}>{ORDER_STATUS[v]?.label || v}</Tag> },
    { title: '创建时间', dataIndex: 'created_at', width: 150, render: (v) => formatDate(v) },
    { title: '操作', key: 'action', width: 80, render: (_, r) => r.status === 'success' ? (
      <Button type="link" danger size="small" onClick={() => { setRefundTarget(r); setRefundReason('用户申请退款') }}>退款</Button>
    ) : '-',
    },
  ]

  const packageColumns: TableColumnsType<QuotaPackageItem> = [
    { title: '套餐名称', dataIndex: 'name', render: (v) => <span style={{ color: cssVar('--text-primary') }}>{v}</span> },
    { title: '类型', dataIndex: 'package_type', width: 110 },
    { title: '价格', dataIndex: 'price', width: 100, align: 'right', render: (v) => `¥${Number(v).toFixed(2)}` },
    { title: '有效期(天)', dataIndex: 'duration_days', width: 100, align: 'right', render: (v) => v ?? '-' },
    { title: '额度(次)', dataIndex: 'quota_amount', width: 100, align: 'right', render: (v) => v ?? '-' },
    { title: '状态', dataIndex: 'is_active', width: 90, render: (v) => <Tag color={v ? 'success' : 'default'}>{v ? '上架' : '下架'}</Tag> },
    { title: '操作', key: 'action', width: 90, render: (_, r) => (
      <Button type="link" size="small" onClick={() => admin.updatePackage(r.id, { is_active: !r.is_active }).then(() => { message.success('已更新'); load() })}>
        {r.is_active ? '下架' : '上架'}
      </Button>
    )},
  ]

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <KpiCard label={`总营收（近${days}天）`} value={`¥${formatNumber(revenue?.total_revenue || 0)}`} icon={<FundOutlined />} iconBg={cssVar('--success-50')} iconColor={cssVar('--success-500')} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <KpiCard label="退款金额" value={`¥${formatNumber(revenue?.refund_amount || 0)}`} icon={<FallOutlined />} iconBg={cssVar('--error-50')} iconColor={cssVar('--error-500')} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <KpiCard label="净营收" value={`¥${formatNumber(revenue?.net_revenue || 0)}`} icon={<RiseOutlined />} iconBg={cssVar('--primary-50')} iconColor={cssVar('--primary-500')} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <KpiCard label="成交订单数" value={formatNumber(revenue?.order_count || 0)} icon={<CarryOutOutlined />} iconBg={cssVar('--warning-50')} iconColor={cssVar('--warning-500')} />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <ChartCard title={<><LineChartOutlined style={{ marginRight: 8 }} />每日营收趋势</>}
            extra={<Select value={days} onChange={setDays} size="small" style={{ width: 100 }}
              options={[{ label: '近7天', value: 7 }, { label: '近30天', value: 30 }, { label: '近90天', value: 90 }]} />}
            height={260}>
            {(revenue?.daily || []).length > 0
              ? <ReactEChartsCore echarts={echarts} option={revenueOption} style={{ height: 260 }} />
              : <Empty description="暂无成交订单" style={{ paddingTop: 80 }} />}
          </ChartCard>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <Card title="订单列表" style={{ background: cssVar('--bg-card'), borderColor: cssVar('--border-light') }}>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <Select placeholder="订单状态" allowClear value={status || undefined} onChange={(v) => setStatus(v || '')} style={{ width: 140 }}
                options={Object.entries(ORDER_STATUS).map(([value, v]) => ({ label: v.label, value }))} />
              <Input placeholder="搜索用户昵称/邮箱" allowClear value={userSearch} onChange={(e) => setUserSearch(e.target.value)} style={{ width: 220 }} />
              <Button type="primary" icon={<SearchOutlined />} onClick={load}>查询</Button>
            </div>
            <Table rowKey="id" columns={orderColumns} dataSource={orders} loading={loading} scroll={{ x: 1100 }}
              pagination={{ current: page, pageSize: 10, total, onChange: setPage }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <Card title="套餐管理" style={{ background: cssVar('--bg-card'), borderColor: cssVar('--border-light') }}>
            <Table rowKey="id" columns={packageColumns} dataSource={packages} loading={loading} pagination={false} />
          </Card>
        </Col>
      </Row>

      <Modal title={`退款确认：${refundTarget?.order_no || ''}`} open={!!refundTarget} onCancel={() => setRefundTarget(null)}
        onOk={async () => {
          if (!refundTarget) return
          try {
            await admin.refundOrder(refundTarget.id, refundReason)
            message.success('退款成功'); setRefundTarget(null); load()
          } catch (e: any) {
            message.error(e?.response?.data?.detail || '退款失败')
          }
        }}>
        <div style={{ marginBottom: 8 }}>退款金额：<b>¥{Number(refundTarget?.amount || 0).toFixed(2)}</b>，退款后订单状态将变为「已退款」。</div>
        <Input.TextArea rows={3} value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="退款原因" />
      </Modal>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
//  审计日志中心
// ═══════════════════════════════════════════════════════

function LogsPanel() {
  const [logs, setLogs] = useState<AdminLogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await admin.getAdminLogs(page, 20, action)
      setLogs(res.data?.items || [])
      setTotal(res.data?.total || 0)
    } catch { message.error('加载日志失败') } finally { setLoading(false) }
  }, [page, action])

  useEffect(() => { load() }, [load])

  const columns: TableColumnsType<AdminLogItem> = [
    { title: '时间', dataIndex: 'created_at', width: 160, render: (v) => formatDate(v) },
    { title: '管理员', dataIndex: 'admin_username', width: 110, render: (v) => v || <Tooltip title="未知管理员">-</Tooltip> },
    { title: '操作', dataIndex: 'action', width: 130, render: (v) => ADMIN_ACTION_LABEL[v] || v },
    { title: '对象类型', dataIndex: 'target_type', width: 90, render: (v) => v || '-' },
    { title: '对象ID', dataIndex: 'target_id', width: 100, render: (v) => v ? <Tooltip title={v}>{shortId(v)}</Tooltip> : '-' },
    { title: '详情', dataIndex: 'details', ellipsis: true, render: (v) => v ? JSON.stringify(v) : '-' },
    { title: 'IP', dataIndex: 'ip_address', width: 130, render: (v) => v || '-' },
  ]

  return (
    <Card style={{ background: cssVar('--bg-card'), borderColor: cssVar('--border-light') }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <Select placeholder="操作类型" allowClear value={action || undefined} onChange={(v) => setAction(v || '')} style={{ width: 180 }}
          options={Object.entries(ADMIN_ACTION_LABEL).map(([value, label]) => ({ label, value }))} />
        <Button type="primary" icon={<SearchOutlined />} onClick={load}>查询</Button>
      </div>
      <Table rowKey="id" columns={columns} dataSource={logs} loading={loading} pagination={{ current: page, pageSize: 20, total, onChange: setPage }} />
    </Card>
  )
}

// ═══════════════════════════════════════════════════════
//  系统设置
// ═══════════════════════════════════════════════════════

function SettingsPanel() {
  const [quota, setQuota] = useState<QuotaConfig | null>(null)

  useEffect(() => {
    admin.getQuotaConfig().then((res) => setQuota(res.data || null)).catch(() => message.error('加载配置失败'))
  }, [])

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={12}>
        <Card title="免费额度配置" style={{ background: cssVar('--bg-card'), borderColor: cssVar('--border-light') }}>
          {quota ? (
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="免费用户每日额度">{quota.free_daily_limit} 次</Descriptions.Item>
              <Descriptions.Item label="免费用户每月额度">{quota.free_monthly_limit} 次</Descriptions.Item>
              <Descriptions.Item label="VIP 是否无限额度">{quota.vip_unlimited ? '是' : '否'}</Descriptions.Item>
              <Descriptions.Item label="未用完额度是否结转">{quota.carry_over ? '结转' : '不结转'}</Descriptions.Item>
            </Descriptions>
          ) : <Spin />}
          <div style={{ marginTop: 12, fontSize: 12, color: cssVar('--text-tertiary') }}>
            当前为内置默认配置；如需调整，请在服务端 <code>backend/.env</code> 中修改额度相关参数后重启后端。
          </div>
        </Card>
      </Col>
      <Col xs={24} lg={12}>
        <Card title="系统信息" style={{ background: cssVar('--bg-card'), borderColor: cssVar('--border-light') }}>
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="系统名称">智能简历 · 管理后台</Descriptions.Item>
            <Descriptions.Item label="技术栈">FastAPI + PostgreSQL + Redis + Next.js</Descriptions.Item>
            <Descriptions.Item label="鉴权方式">Admin JWT（有效期 120 分钟）</Descriptions.Item>
            <Descriptions.Item label="数据备份">每日自动备份（backups/ 目录，保留 7 份）</Descriptions.Item>
          </Descriptions>
        </Card>
      </Col>
    </Row>
  )
}

// ═══════════════════════════════════════════════════════
//  主框架
// ═══════════════════════════════════════════════════════

export default function AdminPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [token, setToken] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [activeMenu, setActiveMenu] = useState('dashboard')
  const [adminName, setAdminName] = useState('')

  useEffect(() => {
    const t = getToken()
    const adminData = typeof window !== 'undefined' ? localStorage.getItem('admin') : null
    if (!t || !adminData) { router.push('/admin/login'); return }
    setToken(t)
    try {
      const parsed = JSON.parse(adminData)
      setAdminName(parsed?.username || '')
    } catch { /* ignore */ }
  }, [router])

  const renderContent = () => {
    switch (activeMenu) {
      case 'dashboard': return <DashboardPanel />
      case 'users': return <UsersPanel />
      case 'content': return <ContentPanel />
      case 'ai': return <AIModelPanel />
      case 'monitor': return <MonitorPanel />
      case 'feedback': return <FeedbackPanel />
      case 'finance': return <FinancePanel />
      case 'logs': return <LogsPanel />
      case 'settings': return <SettingsPanel />
      default: return <DashboardPanel />
    }
  }

  if (!token) {
    // ⚠️ 此处绝不能渲染 AppLayout/AuthGate：AppLayout 的 MessageBell 挂载即请求
    // /api/messages（用户端接口，走 get_current_user），而管理会话 JWT 的 sub 是
    // admins 表 id，用户端鉴权必然 401 → api.ts 拦截器清会话并跳登录页，
    // 表现为「登录成功进首页一秒后被弹回登录页」。管理后台有自己的 Layout，
    // 加载态必须自包含，不挂任何用户端组件。
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: cssVar('--bg-body') }}>
        <Spin size="large" />
        <span style={{ color: cssVar('--text-tertiary'), fontSize: 13 }}>管理后台加载中...</span>
      </div>
    )
  }

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
            <span style={{ color: cssVar('--text-secondary'), fontSize: 13 }}>{adminName || '管理员'}</span>
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
