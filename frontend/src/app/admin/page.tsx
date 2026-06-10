'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import {
  Layout, Button, Card, Typography, Spin, message, Tabs, Row, Col,
  Table, Tag, Space, Statistic, Select, Input, Modal, Empty, Popconfirm,
  Form, InputNumber, Radio, Badge, Descriptions, Divider, Tooltip,
} from 'antd'
import {
  LogoutOutlined, HomeOutlined, UserOutlined,
  DashboardOutlined, SettingOutlined, TeamOutlined,
  BarChartOutlined, FileTextOutlined, AuditOutlined,
  ApiOutlined, MonitorOutlined, DollarOutlined,
  MessageOutlined, KeyOutlined, SafetyOutlined,
  RobotOutlined, ThunderboltOutlined, ReloadOutlined,
  SearchOutlined, PlusOutlined, EditOutlined, DeleteOutlined,
  SendOutlined, EyeOutlined, StopOutlined, CheckCircleOutlined,
  ExclamationCircleOutlined, ClockCircleOutlined, RiseOutlined,
  FallOutlined, FundOutlined, PieChartOutlined, LineChartOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import ReactEChartsCore from 'echarts-for-react/lib/core'
import * as echarts from 'echarts/core'
import { LineChart, BarChart, PieChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

import { admin } from '@/lib/api'
import { getToken, clearAdminAuth } from '@/lib/auth'
import type {
  AdminUser, AdminUserDetail, DashboardCore, IndustryItem, MatchTrend,
  FeatureUsage, JobTrendItem, SatisfactionTrend, TaskStats, FailedTask,
  PromptItem, PromptDetail, ModelConfig, CallLog, TemplateItem, KeywordItem,
  ATSRuleItem, OrderItem, RevenueData, PackageItem, FeedbackItem,
  TicketItem, TicketDetail, AdminLogItem, QuotaConfig,
} from '@/types'

echarts.use([LineChart, BarChart, PieChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, CanvasRenderer])

const { Header, Sider, Content } = Layout
const { TextArea } = Input

const SCENE_LABELS: Record<string, string> = {
  work_experience: '工作经历', summary: '个人总结', project: '项目经验',
  skill_fill: '关键词填充', star_rewrite: 'STAR重写', general: '通用优化',
}
const STATUS_COLOR: Record<string, string> = { active: 'green', frozen: 'red', deleted_pending: 'orange' }
const STATUS_LABEL: Record<string, string> = { active: '正常', frozen: '已封禁', deleted_pending: '注销中' }
const ORDER_STATUS: Record<string, { color: string; label: string }> = {
  pending: { color: 'default', label: '待支付' }, success: { color: 'green', label: '已支付' },
  failed: { color: 'red', label: '失败' }, refunding: { color: 'orange', label: '退款中' }, refunded: { color: 'purple', label: '已退款' },
}
const TICKET_CATEGORY: Record<string, string> = { bug: '功能故障', content_error: '内容错误', refund: '退款问题', other: '其他' }

export default function AdminPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  const [activeMenu, setActiveMenu] = useState('dashboard')
  const autoRefreshRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const t = getToken()
    const adminData = localStorage.getItem('admin')
    if (!t || !adminData) { router.push('/admin/login'); return }
    setToken(t)
  }, [router])

  useEffect(() => {
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current) }
  }, [])

  const menuItems = [
    { key: 'dashboard', icon: <DashboardOutlined />, label: '数据大屏' },
    { key: 'users', icon: <TeamOutlined />, label: '用户管理' },
    { key: 'content', icon: <FileTextOutlined />, label: '内容管理' },
    { key: 'ai', icon: <RobotOutlined />, label: 'AI模型' },
    { key: 'monitor', icon: <MonitorOutlined />, label: '任务监控' },
    { key: 'finance', icon: <DollarOutlined />, label: '财务管理' },
    { key: 'feedback', icon: <MessageOutlined />, label: '反馈工单' },
    { key: 'logs', icon: <AuditOutlined />, label: '审计日志' },
  ]

  if (!token) return null

  const renderContent = () => {
    switch (activeMenu) {
      case 'dashboard': return <DashboardPanel />
      case 'users': return <UsersPanel />
      case 'content': return <ContentPanel />
      case 'ai': return <AIModelPanel />
      case 'monitor': return <MonitorPanel />
      case 'finance': return <FinancePanel />
      case 'feedback': return <FeedbackPanel />
      case 'logs': return <LogsPanel />
      default: return <DashboardPanel />
    }
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} width={220} style={{ background: '#001529' }}>
        <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography.Title level={5} style={{ color: '#fff', margin: 0 }}>
            {collapsed ? <SettingOutlined /> : '管理后台'}
          </Typography.Title>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100% - 64px)' }}>
          <div style={{ flex: 1 }}>
            {menuItems.map((item) => (
              <div
                key={item.key}
                onClick={() => setActiveMenu(item.key)}
                style={{
                  padding: '12px 24px', cursor: 'pointer', color: activeMenu === item.key ? '#fff' : '#ffffffa0',
                  background: activeMenu === item.key ? '#1890ff' : 'transparent',
                  display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.2s',
                }}
              >
                {item.icon}
                {!collapsed && <span>{item.label}</span>}
              </div>
            ))}
          </div>
        </div>
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingInline: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
          <Typography.Title level={5} style={{ margin: 0 }}>
            {menuItems.find((m) => m.key === activeMenu)?.icon} {menuItems.find((m) => m.key === activeMenu)?.label}
          </Typography.Title>
          <Space>
            <Button icon={<HomeOutlined />} onClick={() => router.push('/')}>首页</Button>
            <Button icon={<DashboardOutlined />} onClick={() => router.push('/dashboard')}>仪表盘</Button>
            <Button icon={<LogoutOutlined />} onClick={() => { clearAdminAuth(); router.push('/admin/login') }}>退出</Button>
          </Space>
        </Header>
        <Content style={{ padding: 24, background: '#f5f5f5', overflow: 'auto' }}>
          {renderContent()}
        </Content>
      </Layout>
    </Layout>
  )
}

// ═══════════════════════════════════════════════════════
//  数据大屏 Panel
// ═══════════════════════════════════════════════════════

function DashboardPanel() {
  const [core, setCore] = useState<DashboardCore | null>(null)
  const [industries, setIndustries] = useState<IndustryItem[]>([])
  const [matchTrend, setMatchTrend] = useState<MatchTrend[]>([])
  const [features, setFeatures] = useState<FeatureUsage[]>([])
  const [jobTrending, setJobTrending] = useState<JobTrendItem[]>([])
  const [satisfaction, setSatisfaction] = useState<SatisfactionTrend[]>([])
  const [loading, setLoading] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

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

  const matchOption = {
    tooltip: { trigger: 'axis' },
    grid: { left: 50, right: 20, top: 30, bottom: 30 },
    xAxis: { type: 'category', data: matchTrend.map((d) => d.date), axisLabel: { rotate: 30, fontSize: 10 } },
    yAxis: { type: 'value', name: '平均匹配度', min: 0, max: 100 },
    series: [{ data: matchTrend.map((d) => d.avg_score), type: 'line', smooth: true, areaStyle: { opacity: 0.15 }, itemStyle: { color: '#1890ff' } }],
  }

  const industryOption = {
    tooltip: { trigger: 'item' },
    legend: { orient: 'vertical', left: 'left', type: 'scroll' },
    series: [{
      type: 'pie', radius: ['40%', '70%'], center: ['55%', '50%'],
      data: industries.slice(0, 10).map((d) => ({ name: d.name, value: d.count })),
      emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.5)' } },
    }],
  }

  const jobOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 120, right: 30, top: 10, bottom: 20 },
    xAxis: { type: 'value', name: '数量' },
    yAxis: { type: 'category', data: jobTrending.map((d) => d.title).reverse(), axisLabel: { fontSize: 10 } },
    series: [{ type: 'bar', data: jobTrending.map((d) => d.count).reverse(), itemStyle: { color: '#52c41a' }, label: { show: true, position: 'right' } }],
  }

  const satOption = {
    tooltip: { trigger: 'axis' },
    grid: { left: 50, right: 20, top: 10, bottom: 30 },
    xAxis: { type: 'category', data: satisfaction.map((d) => d.date), axisLabel: { rotate: 30, fontSize: 10 } },
    yAxis: { type: 'value', name: '满意度', min: 0, max: 5 },
    series: [{ data: satisfaction.map((d) => d.avg_satisfaction), type: 'line', smooth: true, itemStyle: { color: '#faad14' }, areaStyle: { opacity: 0.15 } }],
  }

  const featureOption = {
    tooltip: { trigger: 'axis' },
    grid: { left: 100, right: 30, top: 10, bottom: 20 },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: features.map((d) => d.name) },
    series: [{ type: 'bar', data: features.map((d) => d.count), itemStyle: { color: '#722ed1' }, label: { show: true, position: 'right' } }],
  }

  if (loading) return <Spin size="large" style={{ display: 'block', textAlign: 'center', padding: 60 }} />

  const panelStyle = fullscreen ? { position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, background: '#f5f5f5', padding: 24, overflow: 'auto' } : {}

  return (
    <div ref={containerRef} style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4}><BarChartOutlined /> 数据大屏</Typography.Title>
        <Space>
          <Tag color="processing">自动刷新 30s</Tag>
          <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
          <Button onClick={() => setFullscreen(!fullscreen)}>{fullscreen ? '退出全屏' : '全屏'}</Button>
        </Space>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={12} sm={6}><Card><Statistic title="DAU" value={core?.dau || 0} suffix="人" prefix={core?.dau_change_percent && core.dau_change_percent > 0 ? <RiseOutlined /> : <FallOutlined />} valueStyle={{ color: (core?.dau_change_percent || 0) >= 0 ? '#52c41a' : '#ff4d4f' }} /><div style={{ fontSize: 12, color: '#999' }}>环比 {(core?.dau_change_percent || 0) >= 0 ? '+' : ''}{core?.dau_change_percent || 0}%</div></Card></Col>
        <Col xs={12} sm={6}><Card><Statistic title="总用户数" value={core?.total_users || 0} suffix="人" /><div style={{ fontSize: 12, color: '#999' }}>活跃 {core?.active_users || 0} 人</div></Card></Col>
        <Col xs={12} sm={6}><Card><Statistic title="今日优化" value={core?.today_optimizations || 0} suffix="次" prefix={<ThunderboltOutlined />} /><div style={{ fontSize: 12, color: '#999' }}>累计 {core?.total_optimizations || 0} 次</div></Card></Col>
        <Col xs={12} sm={6}><Card><Statistic title="付费转化率" value={core?.paid_conversion_rate || 0} suffix="%" precision={1} valueStyle={{ color: (core?.paid_conversion_rate || 0) > 5 ? '#52c41a' : '#faad14' }} /><div style={{ fontSize: 12, color: '#999' }}>今日上传 {core?.today_uploads || 0}</div></Card></Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title={<><FundOutlined /> 匹配度提升趋势（30天）</>}>
            {matchTrend.length > 0 ? <ReactEChartsCore echarts={echarts} option={matchOption} style={{ height: 300 }} /> : <Empty description="暂无数据" />}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title={<><PieChartOutlined /> 各行业简历占比</>}>
            {industries.length > 0 ? <ReactEChartsCore echarts={echarts} option={industryOption} style={{ height: 300 }} /> : <Empty description="暂无数据" />}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title={<><RiseOutlined /> 热门岗位 TOP 10（30天）</>}>
            {jobTrending.length > 0 ? <ReactEChartsCore echarts={echarts} option={jobOption} style={{ height: 350 }} /> : <Empty description="暂无数据" />}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title={<><LineChartOutlined /> 满意度趋势（30天）</>}>
            {satisfaction.length > 0 ? <ReactEChartsCore echarts={echarts} option={satOption} style={{ height: 350 }} /> : <Empty description="暂无数据" />}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="最常用功能">
            {features.length > 0 ? <ReactEChartsCore echarts={echarts} option={featureOption} style={{ height: 250 }} /> : <Empty description="暂无数据" />}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title={<><ExclamationCircleOutlined /> 热门岗位占比</>}>
            {jobTrending.length > 0 ? (
              <div>
                {jobTrending.map((j, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <Space><Tag color={i < 3 ? 'gold' : 'default'}>#{i + 1}</Tag><span>{j.title}</span></Space>
                    <Space><span>{j.count} 次</span><Tag>{j.percent}%</Tag></Space>
                  </div>
                ))}
              </div>
            ) : <Empty description="暂无数据" />}
          </Card>
        </Col>
      </Row>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
//  用户管理 Panel
// ═══════════════════════════════════════════════════════

function UsersPanel() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(false)

  const [detailModal, setDetailModal] = useState(false)
  const [detail, setDetail] = useState<AdminUserDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [banModal, setBanModal] = useState(false)
  const [banUser, setBanUser] = useState<AdminUser | null>(null)
  const [banReason, setBanReason] = useState('')
  const [banDays, setBanDays] = useState<number | undefined>()

  const [vipModal, setVipModal] = useState(false)
  const [vipUser, setVipUser] = useState<AdminUser | null>(null)
  const [vipPaid, setVipPaid] = useState(false)
  const [vipDaily, setVipDaily] = useState<number | undefined>()
  const [vipMonthly, setVipMonthly] = useState<number | undefined>()

  const [quotaModal, setQuotaModal] = useState(false)
  const [quotaUser, setQuotaUser] = useState<AdminUser | null>(null)
  const [quotaAmount, setQuotaAmount] = useState(10)
  const [quotaReason, setQuotaReason] = useState('')

  const loadUsers = useCallback(async (p = 1, s = '', st = '') => {
    setLoading(true)
    try {
      const res = await admin.getUsers(p, 20, s, st)
      setUsers(res.data.items || [])
      setTotal(res.data.total || 0)
      setPage(p)
    } catch { message.error('加载用户列表失败') } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadUsers() }, [loadUsers])

  const handleBan = async () => {
    if (!banUser) return
    try { await admin.banUser(banUser.id, banReason || '违规', banDays); message.success('已封禁'); setBanModal(false); loadUsers(page, search, statusFilter) } catch { message.error('操作失败') }
  }

  const handleUnban = async (id: string) => {
    try { await admin.unbanUser(id); message.success('已解封'); loadUsers(page, search, statusFilter) } catch { message.error('操作失败') }
  }

  const handleSetVip = async () => {
    if (!vipUser) return
    try { await admin.setVip(vipUser.id, vipPaid, vipDaily, vipMonthly); message.success('VIP已更新'); setVipModal(false); loadUsers(page, search, statusFilter) } catch { message.error('操作失败') }
  }

  const handleAddQuota = async () => {
    if (!quotaUser) return
    try { await admin.addUserQuota(quotaUser.id, quotaAmount, quotaReason); message.success('额度已增加'); setQuotaModal(false); loadUsers(page, search, statusFilter) } catch { message.error('操作失败') }
  }

  const showDetail = async (id: string) => {
    setDetailLoading(true); setDetailModal(true)
    try { const res = await admin.getUserDetail(id); setDetail(res.data) } catch { message.error('加载详情失败') } finally { setDetailLoading(false) }
  }

  const columns = [
    { title: '昵称', dataIndex: 'nickname', key: 'nickname', width: 100 },
    { title: '邮箱', dataIndex: 'email', key: 'email', width: 160 },
    { title: '手机', dataIndex: 'phone', key: 'phone', width: 120 },
    { title: '状态', dataIndex: 'status', key: 'status', width: 80, render: (s: string) => <Tag color={STATUS_COLOR[s] || 'default'}>{STATUS_LABEL[s] || s}</Tag> },
    { title: 'VIP', dataIndex: 'is_vip', key: 'is_vip', width: 60, render: (v: boolean) => v ? <Tag color="gold">VIP</Tag> : <Tag>免费</Tag> },
    { title: '简历', dataIndex: 'resume_count', key: 'resume_count', width: 60 },
    { title: '优化', dataIndex: 'opt_count', key: 'opt_count', width: 60 },
    { title: '额度', dataIndex: 'daily_quota', key: 'daily_quota', width: 60 },
    {
      title: '操作', key: 'action', width: 260,
      render: (_: any, r: AdminUser) => (
        <Space size="small" wrap>
          <Button size="small" icon={<EyeOutlined />} onClick={() => showDetail(r.id)}>详情</Button>
          {r.status === 'active' ? (
            <Button size="small" danger onClick={() => { setBanUser(r); setBanModal(true) }}>封禁</Button>
          ) : r.status === 'frozen' ? (
            <Popconfirm title="确定解封?" onConfirm={() => handleUnban(r.id)}><Button size="small" type="primary">解封</Button></Popconfirm>
          ) : null}
          <Button size="small" onClick={() => { setVipUser(r); setVipPaid(r.is_vip); setVipModal(true) }}>VIP</Button>
          <Button size="small" onClick={() => { setQuotaUser(r); setQuotaModal(true) }}>额度</Button>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Card>
        <Space style={{ marginBottom: 16 }} wrap>
          <Input.Search placeholder="搜索昵称/邮箱" onSearch={(v) => { setSearch(v); loadUsers(1, v, statusFilter) }} style={{ width: 250 }} allowClear />
          <Select placeholder="状态" allowClear style={{ width: 120 }} onChange={(v) => { setStatusFilter(v || ''); loadUsers(1, search, v || '') }}
            options={[{ label: '正常', value: 'active' }, { label: '已封禁', value: 'frozen' }, { label: '注销中', value: 'deleted_pending' }]} />
        </Space>
        <Table rowKey="id" columns={columns} dataSource={users} loading={loading}
          pagination={{ current: page, total, pageSize: 20, onChange: (p) => loadUsers(p, search, statusFilter) }} size="middle" scroll={{ x: 1000 }} />
      </Card>

      <Modal title="用户详情" open={detailModal} onCancel={() => setDetailModal(false)} footer={null} width={700}>
        {detailLoading ? <Spin /> : detail ? (
          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label="昵称">{detail.nickname || '-'}</Descriptions.Item>
            <Descriptions.Item label="邮箱">{detail.email}</Descriptions.Item>
            <Descriptions.Item label="手机">{detail.phone || '-'}</Descriptions.Item>
            <Descriptions.Item label="状态"><Tag color={STATUS_COLOR[detail.status]}>{STATUS_LABEL[detail.status]}</Tag></Descriptions.Item>
            <Descriptions.Item label="简历数">{detail.resume_count}</Descriptions.Item>
            <Descriptions.Item label="优化次数">{detail.opt_count}</Descriptions.Item>
            <Descriptions.Item label="VIP">{detail.quota?.is_paid ? <Tag color="gold">是</Tag> : '否'}</Descriptions.Item>
            <Descriptions.Item label="日额度">{detail.quota?.daily_used || 0}/{detail.quota?.daily_limit || 3}</Descriptions.Item>
            <Descriptions.Item label="月额度">{detail.quota?.monthly_used || 0}/{detail.quota?.monthly_limit || 50}</Descriptions.Item>
            <Descriptions.Item label="注册时间">{detail.created_at ? new Date(detail.created_at).toLocaleString() : '-'}</Descriptions.Item>
          </Descriptions>
        ) : <Empty />}
        {detail?.orders && detail.orders.length > 0 && (
          <>
            <Divider>消费记录</Divider>
            <Table rowKey="order_no" dataSource={detail.orders} size="small" pagination={false}
              columns={[
                { title: '订单号', dataIndex: 'order_no', width: 160 }, { title: '套餐', dataIndex: 'package_name' },
                { title: '金额', dataIndex: 'amount', render: (v: number) => `¥${v}` },
                { title: '状态', dataIndex: 'status', render: (s: string) => <Tag color={ORDER_STATUS[s]?.color}>{ORDER_STATUS[s]?.label || s}</Tag> },
              ]} />
          </>
        )}
      </Modal>

      <Modal title="封禁用户" open={banModal} onOk={handleBan} onCancel={() => setBanModal(false)}>
        <div style={{ marginBottom: 12 }}>封禁 <Tag color="red">{banUser?.nickname || banUser?.email}</Tag></div>
        <Input placeholder="封禁原因" value={banReason} onChange={(e) => setBanReason(e.target.value)} style={{ marginBottom: 12 }} />
        <InputNumber placeholder="封禁天数（留空=永久）" value={banDays} onChange={(v) => setBanDays(v || undefined)} style={{ width: '100%' }} min={1} />
      </Modal>

      <Modal title="VIP管理" open={vipModal} onOk={handleSetVip} onCancel={() => setVipModal(false)}>
        <div style={{ marginBottom: 12 }}>用户: <Tag>{vipUser?.nickname || vipUser?.email}</Tag></div>
        <div style={{ marginBottom: 12 }}><Radio.Group value={vipPaid} onChange={(e) => setVipPaid(e.target.value)}><Radio value={true}>VIP</Radio><Radio value={false}>免费用户</Radio></Radio.Group></div>
        <InputNumber placeholder="每日额度" value={vipDaily} onChange={(v) => setVipDaily(v || undefined)} style={{ width: '100%', marginBottom: 12 }} min={0} />
        <InputNumber placeholder="每月额度" value={vipMonthly} onChange={(v) => setVipMonthly(v || undefined)} style={{ width: '100%' }} min={0} />
      </Modal>

      <Modal title="调整额度" open={quotaModal} onOk={handleAddQuota} onCancel={() => setQuotaModal(false)}>
        <div style={{ marginBottom: 12 }}>用户: <Tag>{quotaUser?.nickname || quotaUser?.email}</Tag> 当前日余: {quotaUser?.daily_quota}</div>
        <InputNumber placeholder="增加次数" value={quotaAmount} onChange={(v) => setQuotaAmount(v || 10)} style={{ width: '100%', marginBottom: 12 }} min={1} />
        <Input placeholder="调整原因" value={quotaReason} onChange={(e) => setQuotaReason(e.target.value)} />
      </Modal>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
//  内容管理 Panel
// ═══════════════════════════════════════════════════════

function ContentPanel() {
  return (
    <Card>
      <Tabs defaultActiveKey="templates" items={[
        { key: 'templates', label: '简历模板', children: <TemplatesSub /> },
        { key: 'keywords', label: '行业关键词', children: <KeywordsSub /> },
        { key: 'ats', label: 'ATS规则', children: <ATSRulesSub /> },
      ]} />
    </Card>
  )
}

function TemplatesSub() {
  const [templates, setTemplates] = useState<TemplateItem[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [form] = Form.useForm()

  const load = useCallback(async () => {
    setLoading(true)
    try { const res = await admin.getTemplates(); setTemplates(res.data || []) } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    const v = await form.validateFields()
    try { await admin.createTemplate(v.name, v.description || '', v.html_content || '', v.css_content || ''); message.success('已创建'); setModalOpen(false); form.resetFields(); load() } catch { message.error('创建失败') }
  }

  const handleToggle = async (id: string, isActive: boolean) => {
    try { await admin.updateTemplate(id, { is_active: isActive }); message.success('已更新'); load() } catch { message.error('操作失败') }
  }

  const handleDelete = async (id: string) => {
    try { await admin.deleteTemplate(id); message.success('已删除'); load() } catch { message.error('删除失败') }
  }

  const columns = [
    { title: '名称', dataIndex: 'name', key: 'name' },
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: '状态', dataIndex: 'is_active', key: 'is_active', width: 80, render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? '上架' : '下架'}</Tag> },
    { title: '默认', dataIndex: 'is_default', key: 'is_default', width: 80, render: (v: boolean) => v ? <Tag color="blue">是</Tag> : '-' },
    {
      title: '操作', key: 'action', width: 220,
      render: (_: any, r: TemplateItem) => (
        <Space size="small">
          <Button size="small" onClick={() => handleToggle(r.id, !r.is_active)}>{r.is_active ? '下架' : '上架'}</Button>
          <Popconfirm title="确定删除?" onConfirm={() => handleDelete(r.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)} style={{ marginBottom: 16 }}>新增模板</Button>
      <Table rowKey="id" columns={columns} dataSource={templates} loading={loading} pagination={false} size="middle" />
      <Modal title="新增模板" open={modalOpen} onOk={handleCreate} onCancel={() => setModalOpen(false)}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label="描述"><Input /></Form.Item>
          <Form.Item name="html_content" label="HTML"><TextArea rows={4} /></Form.Item>
          <Form.Item name="css_content" label="CSS"><TextArea rows={4} /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

function KeywordsSub() {
  const [keywords, setKeywords] = useState<KeywordItem[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [form] = Form.useForm()
  const [industryFilter, setIndustryFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try { const res = await admin.getKeywords(industryFilter); setKeywords(res.data || []) } catch {} finally { setLoading(false) }
  }, [industryFilter])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    const v = await form.validateFields()
    try { await admin.createKeyword(v.keyword, v.industry || '通用', v.category || 'hard_skill'); message.success('已添加'); setModalOpen(false); form.resetFields(); load() } catch { message.error('添加失败') }
  }

  const columns = [
    { title: '关键词', dataIndex: 'keyword', key: 'keyword' },
    { title: '行业', dataIndex: 'industry', key: 'industry', width: 100 },
    { title: '类别', dataIndex: 'category', key: 'category', width: 100, render: (v: string) => <Tag>{v === 'hard_skill' ? '硬技能' : v === 'soft_skill' ? '软技能' : v}</Tag> },
    { title: '状态', dataIndex: 'is_active', key: 'is_active', width: 80, render: (v: boolean) => <Badge status={v ? 'success' : 'default'} text={v ? '启用' : '停用'} /> },
    {
      title: '操作', key: 'action', width: 120,
      render: (_: any, r: KeywordItem) => (
        <Space size="small">
          <Button size="small" onClick={async () => { try { await admin.updateKeyword(r.id, !r.is_active); load() } catch {} }}>{r.is_active ? '停用' : '启用'}</Button>
          <Popconfirm title="确定删除?" onConfirm={async () => { try { await admin.deleteKeyword(r.id); load() } catch {} }}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>添加关键词</Button>
        <Select placeholder="行业筛选" allowClear style={{ width: 120 }} value={industryFilter || undefined} onChange={(v) => setIndustryFilter(v || '')}
          options={[{ label: '互联网', value: '互联网' }, { label: '金融', value: '金融' }, { label: '医疗', value: '医疗' }, { label: '教育', value: '教育' }, { label: '通用', value: '通用' }]} />
      </Space>
      <Table rowKey="id" columns={columns} dataSource={keywords} loading={loading} pagination={{ pageSize: 50 }} size="middle" />
      <Modal title="添加关键词" open={modalOpen} onOk={handleCreate} onCancel={() => setModalOpen(false)}>
        <Form form={form} layout="vertical">
          <Form.Item name="keyword" label="关键词" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="industry" label="行业" initialValue="通用"><Select options={[{ label: '互联网', value: '互联网' }, { label: '金融', value: '金融' }, { label: '医疗', value: '医疗' }, { label: '通用', value: '通用' }]} /></Form.Item>
          <Form.Item name="category" label="类别" initialValue="hard_skill"><Select options={[{ label: '硬技能', value: 'hard_skill' }, { label: '软技能', value: 'soft_skill' }]} /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

function ATSRulesSub() {
  const [rules, setRules] = useState<ATSRuleItem[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [form] = Form.useForm()

  const load = useCallback(async () => {
    setLoading(true)
    try { const res = await admin.getAtsRules(); setRules(res.data || []) } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    const v = await form.validateFields()
    try { await admin.createAtsRule(v.name, v.pattern, v.severity || 'warning', v.description || ''); message.success('已创建'); setModalOpen(false); form.resetFields(); load() } catch { message.error('创建失败') }
  }

  const columns = [
    { title: '规则名', dataIndex: 'name', key: 'name' },
    { title: '正则', dataIndex: 'pattern', key: 'pattern', ellipsis: true, render: (v: string) => <code style={{ fontSize: 11 }}>{v}</code> },
    { title: '级别', dataIndex: 'severity', key: 'severity', width: 80, render: (v: string) => <Tag color={v === 'error' ? 'red' : 'orange'}>{v === 'error' ? '错误' : '警告'}</Tag> },
    { title: '状态', dataIndex: 'is_active', key: 'is_active', width: 80, render: (v: boolean) => <Badge status={v ? 'success' : 'default'} text={v ? '启用' : '停用'} /> },
    {
      title: '操作', key: 'action', width: 120,
      render: (_: any, r: ATSRuleItem) => (
        <Space size="small">
          <Button size="small" onClick={async () => { try { await admin.updateAtsRule(r.id, { is_active: !r.is_active }); load() } catch {} }}>{r.is_active ? '停用' : '启用'}</Button>
          <Popconfirm title="确定删除?" onConfirm={async () => { try { await admin.deleteAtsRule(r.id); load() } catch {} }}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)} style={{ marginBottom: 16 }}>新增规则</Button>
      <Table rowKey="id" columns={columns} dataSource={rules} loading={loading} pagination={false} size="middle" />
      <Modal title="新增ATS规则" open={modalOpen} onOk={handleCreate} onCancel={() => setModalOpen(false)}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="规则名" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="pattern" label="正则表达式" rules={[{ required: true }]}><Input placeholder="如: <table.*?>" /></Form.Item>
          <Form.Item name="severity" label="级别" initialValue="warning"><Select options={[{ label: '警告', value: 'warning' }, { label: '错误', value: 'error' }]} /></Form.Item>
          <Form.Item name="description" label="描述"><TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
//  AI模型管理 Panel
// ═══════════════════════════════════════════════════════

function AIModelPanel() {
  return (
    <Card>
      <Tabs defaultActiveKey="prompts" items={[
        { key: 'prompts', label: 'Prompt管理', children: <PromptsSub /> },
        { key: 'models', label: '模型路由', children: <ModelsSub /> },
        { key: 'callLogs', label: '调用日志', children: <CallLogsSub /> },
      ]} />
    </Card>
  )
}

function PromptsSub() {
  const [prompts, setPrompts] = useState<PromptItem[]>([])
  const [loading, setLoading] = useState(false)
  const [createModal, setCreateModal] = useState(false)
  const [deployModal, setDeployModal] = useState(false)
  const [rollbackModal, setRollbackModal] = useState(false)
  const [detailModal, setDetailModal] = useState(false)
  const [detail, setDetail] = useState<PromptDetail | null>(null)
  const [selectedPrompt, setSelectedPrompt] = useState<PromptItem | null>(null)
  const [form] = Form.useForm()

  const load = useCallback(async () => {
    setLoading(true)
    try { const res = await admin.getPrompts(); setPrompts(res.data?.prompts || []) } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    const v = await form.validateFields()
    try { await admin.createPrompt(v.name, v.scene, v.content, v.variables); message.success('已创建'); setCreateModal(false); form.resetFields(); load() } catch { message.error('创建失败') }
  }

  const handleDeploy = async () => {
    const v = await form.validateFields()
    if (!selectedPrompt) return
    try { await admin.deployPrompt(selectedPrompt.id, v.gray_ratio || 0); message.success('已部署'); setDeployModal(false); load() } catch { message.error('部署失败') }
  }

  const handleRollback = async () => {
    const v = await form.validateFields()
    try { await admin.rollbackPrompt(v.name, v.scene, v.target_version); message.success('已回滚'); setRollbackModal(false); load() } catch { message.error('回滚失败') }
  }

  const showDetail = async (id: string) => {
    try { const res = await admin.getPromptDetail(id); setDetail(res.data); setDetailModal(true) } catch { message.error('加载失败') }
  }

  const columns = [
    { title: '名称', dataIndex: 'name', key: 'name', width: 130 },
    { title: '场景', dataIndex: 'scene', key: 'scene', width: 100, render: (v: string) => <Tag>{SCENE_LABELS[v] || v}</Tag> },
    { title: '版本', dataIndex: 'version', key: 'version', width: 70, render: (v: number) => <Tag color="blue">v{v}</Tag> },
    { title: '状态', dataIndex: 'is_active', key: 'is_active', width: 80, render: (v: boolean) => <Badge status={v ? 'success' : 'default'} text={v ? '激活' : '未激活'} /> },
    { title: '灰度', dataIndex: 'gray_ratio', key: 'gray_ratio', width: 80, render: (v: number) => v > 0 ? <Tag color="orange">{v}%</Tag> : '-' },
    {
      title: '操作', key: 'action', width: 250,
      render: (_: any, r: PromptItem) => (
        <Space size="small">
          <Button size="small" icon={<EyeOutlined />} onClick={() => showDetail(r.id)}>详情</Button>
          <Button size="small" type="primary" onClick={() => { setSelectedPrompt(r); setDeployModal(true); form.setFieldsValue({ gray_ratio: r.gray_ratio }) }}>部署</Button>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setCreateModal(true); form.resetFields() }}>新建Prompt</Button>
        <Button onClick={() => { setRollbackModal(true); form.resetFields() }}>版本回滚</Button>
      </Space>
      <Table rowKey="id" columns={columns} dataSource={prompts} loading={loading} pagination={false} size="middle" />

      <Modal title="新建Prompt" open={createModal} onOk={handleCreate} onCancel={() => setCreateModal(false)} width={700}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true }]}><Input placeholder="如: work_experience_star" /></Form.Item>
          <Form.Item name="scene" label="场景" rules={[{ required: true }]}><Select options={Object.entries(SCENE_LABELS).map(([k, v]) => ({ label: v, value: k }))} /></Form.Item>
          <Form.Item name="content" label="Prompt内容" rules={[{ required: true }]}><TextArea rows={8} placeholder="支持变量: {{job_description}}, {{resume_section}} 等" /></Form.Item>
          <Form.Item name="variables" label="变量(JSON)"><TextArea rows={3} placeholder='{"job_description": "岗位描述", "resume_section": "简历内容"}' /></Form.Item>
        </Form>
      </Modal>

      <Modal title="部署Prompt" open={deployModal} onOk={handleDeploy} onCancel={() => setDeployModal(false)}>
        <Form form={form} layout="vertical">
          <div style={{ marginBottom: 12 }}>部署: <Tag color="blue">{selectedPrompt?.name} v{selectedPrompt?.version}</Tag></div>
          <Form.Item name="gray_ratio" label="灰度比例 (%)"><InputNumber min={0} max={100} style={{ width: '100%' }} placeholder="100=全量, 0=仅激活" /></Form.Item>
        </Form>
      </Modal>

      <Modal title="版本回滚" open={rollbackModal} onOk={handleRollback} onCancel={() => setRollbackModal(false)}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Prompt名称" rules={[{ required: true }]}><Input placeholder="如: work_experience_star" /></Form.Item>
          <Form.Item name="scene" label="场景" rules={[{ required: true }]}><Select options={Object.entries(SCENE_LABELS).map(([k, v]) => ({ label: v, value: k }))} /></Form.Item>
          <Form.Item name="target_version" label="目标版本" rules={[{ required: true }]}><InputNumber min={1} style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>

      <Modal title="Prompt详情" open={detailModal} onCancel={() => setDetailModal(false)} footer={null} width={800}>
        {detail ? (
          <>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="名称">{detail.name}</Descriptions.Item>
              <Descriptions.Item label="场景"><Tag>{SCENE_LABELS[detail.scene] || detail.scene}</Tag></Descriptions.Item>
              <Descriptions.Item label="版本">v{detail.version}</Descriptions.Item>
              <Descriptions.Item label="状态"><Tag color={detail.is_active ? 'green' : 'default'}>{detail.is_active ? '激活' : '未激活'}</Tag></Descriptions.Item>
              <Descriptions.Item label="灰度">{detail.gray_ratio}%</Descriptions.Item>
            </Descriptions>
            <Divider>Prompt内容</Divider>
            <pre style={{ background: '#f5f5f5', padding: 16, borderRadius: 8, maxHeight: 300, overflow: 'auto', fontSize: 12 }}>{detail.content}</pre>
            {detail.variables && (
              <>
                <Divider>变量</Divider>
                <pre style={{ background: '#f5f5f5', padding: 16, borderRadius: 8, fontSize: 12 }}>{JSON.stringify(detail.variables, null, 2)}</pre>
              </>
            )}
            <Divider>版本历史</Divider>
            <Table rowKey="id" dataSource={detail.all_versions} size="small" pagination={false}
              columns={[
                { title: '版本', dataIndex: 'version', render: (v: number) => <Tag color="blue">v{v}</Tag> },
                { title: '状态', dataIndex: 'is_active', render: (v: boolean) => v ? <Tag color="green">激活</Tag> : <Tag>未激活</Tag> },
                { title: '灰度', dataIndex: 'gray_ratio', render: (v: number) => v > 0 ? `${v}%` : '-' },
                { title: '时间', dataIndex: 'created_at', render: (t: string) => t ? new Date(t).toLocaleString() : '-' },
              ]} />
          </>
        ) : <Empty />}
      </Modal>
    </div>
  )
}

function ModelsSub() {
  const [models, setModels] = useState<ModelConfig[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { const res = await admin.getModels(); setModels(res.data?.models || []) } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleToggle = async (id: string, enabled: boolean) => {
    try { await admin.updateModel(id, { is_enabled: enabled }); message.success('已更新'); load() } catch { message.error('操作失败') }
  }

  const columns = [
    { title: '模型', dataIndex: 'display_name', key: 'display_name', width: 120 },
    { title: '标识', dataIndex: 'model_name', key: 'model_name', width: 100 },
    { title: '权重', dataIndex: 'weight', key: 'weight', width: 60 },
    { title: '限流/min', dataIndex: 'rate_limit_per_minute', key: 'rate_limit_per_minute', width: 80 },
    { title: 'Tier', dataIndex: 'tier', key: 'tier', width: 80, render: (v: string) => <Tag color={v === 'paid' ? 'gold' : 'default'}>{v}</Tag> },
    { title: '状态', dataIndex: 'is_enabled', key: 'is_enabled', width: 80, render: (v: boolean) => <Badge status={v ? 'success' : 'error'} text={v ? '启用' : '停用'} /> },
    { title: '连续失败', dataIndex: 'consecutive_failures', key: 'consecutive_failures', width: 80, render: (v: number) => v > 0 ? <Tag color="red">{v}</Tag> : '-' },
    { title: '成功率', key: 'success_rate', width: 80, render: (_: any, r: ModelConfig) => <span style={{ color: (r.stats?.success_rate || 0) >= 95 ? '#52c41a' : '#ff4d4f' }}>{r.stats?.success_rate || '-'}%</span> },
    { title: '平均延迟', key: 'avg_latency', width: 90, render: (_: any, r: ModelConfig) => `${r.stats?.avg_latency_ms || '-'}ms` },
    {
      title: '操作', key: 'action', width: 100,
      render: (_: any, r: ModelConfig) => (
        <Button size="small" onClick={() => handleToggle(r.id, !r.is_enabled)}>{r.is_enabled ? '停用' : '启用'}</Button>
      ),
    },
  ]

  return <Table rowKey="id" columns={columns} dataSource={models} loading={loading} pagination={false} size="middle" />
}

function CallLogsSub() {
  const [logs, setLogs] = useState<CallLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    try { const res = await admin.getCallLogs(p, 50); setLogs(res.data?.items || []); setTotal(res.data?.total || 0); setPage(p) } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const columns = [
    { title: '用户', dataIndex: 'user_id', key: 'user_id', width: 90, ellipsis: true },
    { title: '模型', dataIndex: 'model_name', key: 'model_name', width: 100 },
    { title: 'Prompt', dataIndex: 'prompt_template_name', key: 'prompt_template_name', width: 100, ellipsis: true },
    { title: '版本', dataIndex: 'prompt_version', key: 'prompt_version', width: 60, render: (v: number) => v ? `v${v}` : '-' },
    { title: 'Token', key: 'tokens', width: 100, render: (_: any, r: CallLog) => `入${r.input_tokens || 0}/出${r.output_tokens || 0}` },
    { title: '耗时', dataIndex: 'latency_ms', key: 'latency_ms', width: 80, render: (v: number) => v ? `${v}ms` : '-' },
    { title: '状态', dataIndex: 'is_success', key: 'is_success', width: 70, render: (v: boolean) => v ? <Tag color="green">成功</Tag> : <Tag color="red">失败</Tag> },
    { title: '费用', dataIndex: 'cost_usd', key: 'cost_usd', width: 80, render: (v: number) => v != null ? `$${v.toFixed(4)}` : '-' },
    { title: '时间', dataIndex: 'created_at', key: 'created_at', width: 150, render: (t: string) => t ? new Date(t).toLocaleString() : '-' },
  ]

  return <Table rowKey="id" columns={columns} dataSource={logs} loading={loading} pagination={{ current: page, total, pageSize: 50, onChange: (p) => load(p) }} size="small" scroll={{ x: 1000 }} />
}

// ═══════════════════════════════════════════════════════
//  任务监控 Panel
// ═══════════════════════════════════════════════════════

function MonitorPanel() {
  const [stats, setStats] = useState<TaskStats | null>(null)
  const [failedTasks, setFailedTasks] = useState<FailedTask[]>([])
  const [failedTotal, setFailedTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [sRes, fRes] = await Promise.all([admin.getTaskStats(), admin.getFailedTasks()])
      setStats(sRes.data)
      setFailedTasks(fRes.data?.items || [])
      setFailedTotal(fRes.data?.total || 0)
    } catch { message.error('加载失败') } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const timer = setInterval(load, 15000)
    return () => clearInterval(timer)
  }, [load])

  const modelHealthOption = stats?.model_health ? {
    tooltip: { trigger: 'axis' },
    legend: { data: ['成功率', '平均延迟'] },
    grid: { left: 60, right: 60, top: 40, bottom: 50 },
    xAxis: { type: 'category', data: Object.keys(stats.model_health), axisLabel: { rotate: 20, fontSize: 10 } },
    yAxis: [
      { type: 'value', name: '成功率(%)', min: 0, max: 100 },
      { type: 'value', name: '延迟(ms)' },
    ],
    series: [
      { name: '成功率', type: 'bar', data: Object.values(stats.model_health).map((m) => m.success_rate), itemStyle: { color: '#52c41a' } },
      { name: '平均延迟', type: 'line', yAxisIndex: 1, data: Object.values(stats.model_health).map((m) => m.avg_latency_ms), itemStyle: { color: '#1890ff' } },
    ],
  } : null

  const failColumns = [
    { title: '用户ID', dataIndex: 'user_id', key: 'user_id', ellipsis: true },
    { title: '模型', dataIndex: 'model_name', key: 'model_name', width: 100 },
    { title: '错误', dataIndex: 'error_message', key: 'error_message', ellipsis: true },
    { title: '时间', dataIndex: 'created_at', key: 'created_at', width: 150, render: (t: string) => t ? new Date(t).toLocaleString() : '-' },
  ]

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
        <Tag color="processing">自动刷新 15s</Tag>
      </Space>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}><Card><Statistic title="今日总请求" value={stats?.today_total || 0} /></Card></Col>
        <Col xs={12} sm={6}><Card><Statistic title="成功率" value={stats?.success_rate || 0} suffix="%" precision={1} valueStyle={{ color: (stats?.success_rate || 0) >= 95 ? '#52c41a' : '#ff4d4f' }} /></Card></Col>
        <Col xs={12} sm={6}><Card><Statistic title="平均延迟" value={stats?.avg_latency_ms || 0} suffix="ms" /></Card></Col>
        <Col xs={12} sm={6}><Card><Statistic title="今日成功" value={stats?.today_success || 0} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#52c41a' }} /></Card></Col>
      </Row>

      {stats?.fail_by_reason && stats.fail_by_reason.length > 0 && (
        <Card title="错误分类统计" style={{ marginBottom: 16 }} size="small">
          {stats.fail_by_reason.map((f, i) => (
            <Tag key={i} color="red" style={{ marginBottom: 8 }}>{f.reason}: {f.count}次</Tag>
          ))}
        </Card>
      )}

      {modelHealthOption && (
        <Card title="模型健康度" style={{ marginBottom: 16 }}>
          <ReactEChartsCore echarts={echarts} option={modelHealthOption} style={{ height: 300 }} />
        </Card>
      )}

      <Card title={<><ExclamationCircleOutlined /> 最近失败任务（24h）</>}>
        <Table rowKey="id" columns={failColumns} dataSource={failedTasks} loading={loading} pagination={{ total: failedTotal, pageSize: 50 }} size="small" />
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
//  财务管理 Panel
// ═══════════════════════════════════════════════════════

function FinancePanel() {
  return (
    <Tabs defaultActiveKey="orders" items={[
      { key: 'orders', label: '订单管理', children: <OrdersSub /> },
      { key: 'revenue', label: '营收报表', children: <RevenueSub /> },
      { key: 'packages', label: '套餐管理', children: <PackagesSub /> },
    ]} />
  )
}

function OrdersSub() {
  const [orders, setOrders] = useState<OrderItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')

  const load = useCallback(async (p = 1, s = '') => {
    setLoading(true)
    try { const res = await admin.getOrders(p, 20, s); setOrders(res.data?.items || []); setTotal(res.data?.total || 0); setPage(p) } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleRefund = async (id: string) => {
    try { await admin.refundOrder(id); message.success('退款已处理'); load(page, statusFilter) } catch { message.error('退款失败') }
  }

  const columns = [
    { title: '订单号', dataIndex: 'order_no', key: 'order_no', width: 160, ellipsis: true },
    { title: '用户', dataIndex: 'nickname', key: 'nickname', width: 80 },
    { title: '套餐', dataIndex: 'package_name', key: 'package_name', width: 100 },
    { title: '金额', dataIndex: 'amount', key: 'amount', width: 80, render: (v: number) => `¥${v}` },
    { title: '状态', dataIndex: 'status', key: 'status', width: 80, render: (s: string) => <Tag color={ORDER_STATUS[s]?.color}>{ORDER_STATUS[s]?.label || s}</Tag> },
    { title: '时间', dataIndex: 'created_at', key: 'created_at', width: 140, render: (t: string) => t ? new Date(t).toLocaleString() : '-' },
    {
      title: '操作', key: 'action', width: 80,
      render: (_: any, r: OrderItem) => r.status === 'success' ? (
        <Popconfirm title="确定退款?" onConfirm={() => handleRefund(r.id)}><Button size="small" danger>退款</Button></Popconfirm>
      ) : null,
    },
  ]

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Select placeholder="状态筛选" allowClear style={{ width: 120 }} onChange={(v) => { setStatusFilter(v || ''); load(1, v || '') }}
          options={Object.entries(ORDER_STATUS).map(([k, v]) => ({ label: v.label, value: k }))} />
      </Space>
      <Table rowKey="id" columns={columns} dataSource={orders} loading={loading} pagination={{ current: page, total, pageSize: 20, onChange: (p) => load(p, statusFilter) }} size="middle" scroll={{ x: 800 }} />
    </div>
  )
}

function RevenueSub() {
  const [revenue, setRevenue] = useState<RevenueData | null>(null)
  const [loading, setLoading] = useState(false)
  const [days, setDays] = useState(30)

  const load = useCallback(async (d = 30) => {
    setLoading(true)
    try { const res = await admin.getRevenue(d); setRevenue(res.data) } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const revenueOption = revenue?.daily ? {
    tooltip: { trigger: 'axis' },
    grid: { left: 60, right: 30, top: 20, bottom: 50 },
    xAxis: { type: 'category', data: revenue.daily.map((d) => d.date), axisLabel: { rotate: 30, fontSize: 10 } },
    yAxis: { type: 'value' },
    series: [
      { name: '收入(元)', type: 'bar', data: revenue.daily.map((d) => d.revenue), itemStyle: { color: '#52c41a' } },
      { name: '订单数', type: 'line', data: revenue.daily.map((d) => d.orders), itemStyle: { color: '#1890ff' } },
    ],
  } : null

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Select value={days} onChange={(v) => { setDays(v); load(v) }}
          options={[{ label: '近7天', value: 7 }, { label: '近30天', value: 30 }, { label: '近90天', value: 90 }]} />
        <Button icon={<ReloadOutlined />} onClick={() => load(days)}>刷新</Button>
      </Space>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col sm={8}><Card><Statistic title="总收入" value={revenue?.total_revenue || 0} prefix="¥" precision={2} /></Card></Col>
        <Col sm={8}><Card><Statistic title="退款金额" value={revenue?.refund_amount || 0} prefix="¥" precision={2} valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
        <Col sm={8}><Card><Statistic title="净收入" value={revenue?.net_revenue || 0} prefix="¥" precision={2} valueStyle={{ color: '#52c41a' }} /></Card></Col>
      </Row>

      {revenueOption && (
        <Card title="每日收入趋势">
          <ReactEChartsCore echarts={echarts} option={revenueOption} style={{ height: 350 }} />
        </Card>
      )}
    </div>
  )
}

function PackagesSub() {
  const [packages, setPackages] = useState<PackageItem[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [form] = Form.useForm()

  const load = useCallback(async () => {
    setLoading(true)
    try { const res = await admin.getPackages(); setPackages(res.data || []) } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    const v = await form.validateFields()
    try { await admin.createPackage(v.name, v.package_type, v.price, v.duration_days, v.quota_amount); message.success('已创建'); setModalOpen(false); form.resetFields(); load() } catch { message.error('创建失败') }
  }

  const columns = [
    { title: '名称', dataIndex: 'name', key: 'name' },
    { title: '类型', dataIndex: 'package_type', key: 'package_type', render: (v: string) => <Tag>{v}</Tag> },
    { title: '价格', dataIndex: 'price', key: 'price', render: (v: number) => `¥${v}` },
    { title: '有效期', dataIndex: 'duration_days', key: 'duration_days', render: (v: number) => v ? `${v}天` : '用完为止' },
    { title: '次数', dataIndex: 'quota_amount', key: 'quota_amount', render: (v: number) => v != null ? (v < 0 ? '不限量' : `${v}次`) : '-' },
    { title: '状态', dataIndex: 'is_active', key: 'is_active', render: (v: boolean) => <Badge status={v ? 'success' : 'default'} text={v ? '上架' : '下架'} /> },
    {
      title: '操作', key: 'action',
      render: (_: any, r: PackageItem) => (
        <Button size="small" onClick={async () => { try { await admin.updatePackage(r.id, { is_active: !r.is_active }); load() } catch {} }}>{r.is_active ? '下架' : '上架'}</Button>
      ),
    },
  ]

  return (
    <div>
      <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)} style={{ marginBottom: 16 }}>新增套餐</Button>
      <Table rowKey="id" columns={columns} dataSource={packages} loading={loading} pagination={false} size="middle" />
      <Modal title="新增套餐" open={modalOpen} onOk={handleCreate} onCancel={() => setModalOpen(false)}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="package_type" label="类型" rules={[{ required: true }]}><Select options={[{ label: '月度VIP', value: 'monthly_vip' }, { label: '年度VIP', value: 'yearly_vip' }, { label: '充值包', value: 'topup_10' }]} /></Form.Item>
          <Form.Item name="price" label="价格(元)" rules={[{ required: true }]}><InputNumber min={0} step={0.01} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="duration_days" label="有效期(天)"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="quota_amount" label="次数(-1=不限量)"><InputNumber min={-1} style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
//  反馈工单 Panel
// ═══════════════════════════════════════════════════════

function FeedbackPanel() {
  return (
    <Tabs defaultActiveKey="feedbacks" items={[
      { key: 'feedbacks', label: 'AI反馈', children: <FeedbacksSub /> },
      { key: 'tickets', label: '投诉工单', children: <TicketsSub /> },
    ]} />
  )
}

function FeedbacksSub() {
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [minScore, setMinScore] = useState<number | undefined>()
  const [clustering, setClustering] = useState<{ total_low: number; samples: string[] } | null>(null)

  const load = useCallback(async (p = 1, ms?: number) => {
    setLoading(true)
    try { const res = await admin.getFeedbacks(p, 20, ms); setFeedbacks(res.data?.items || []); setTotal(res.data?.total || 0); setPage(p) } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load(); loadClustering() }, [])

  const loadClustering = async () => {
    try { const res = await admin.getFeedbackClustering(7); setClustering(res.data) } catch {}
  }

  const columns = [
    { title: '评分', dataIndex: 'score', key: 'score', width: 80, render: (v: number) => <Tag color={v >= 4 ? 'green' : v >= 3 ? 'orange' : 'red'}>{v} 星</Tag> },
    { title: '反馈', dataIndex: 'feedback_text', key: 'feedback_text', ellipsis: true },
    { title: '岗位', dataIndex: 'job_title', key: 'job_title', width: 120 },
    { title: '时间', dataIndex: 'created_at', key: 'created_at', width: 140, render: (t: string) => t ? new Date(t).toLocaleString() : '-' },
  ]

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Select placeholder="最低评分" allowClear style={{ width: 120 }} onChange={(v) => { setMinScore(v); load(1, v) }}
          options={[{ label: '1星', value: 1 }, { label: '2星', value: 2 }, { label: '3星', value: 3 }, { label: '4星', value: 4 }, { label: '5星', value: 5 }]} />
      </Space>
      {clustering && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <div>近7天低分反馈: <Tag color="red">{clustering.total_low}条</Tag></div>
          {clustering.samples.length > 0 && (
            <div style={{ marginTop: 8 }}>{clustering.samples.slice(0, 5).map((s, i) => <Tag key={i} style={{ marginBottom: 4 }}>{s}</Tag>)}</div>
          )}
        </Card>
      )}
      <Table rowKey="id" columns={columns} dataSource={feedbacks} loading={loading} pagination={{ current: page, total, pageSize: 20, onChange: (p) => load(p, minScore) }} size="middle" />
    </div>
  )
}

function TicketsSub() {
  const [tickets, setTickets] = useState<TicketItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [detailModal, setDetailModal] = useState(false)
  const [detail, setDetail] = useState<TicketDetail | null>(null)
  const [replyContent, setReplyContent] = useState('')

  const load = useCallback(async (p = 1, s = '') => {
    setLoading(true)
    try { const res = await admin.getTickets(p, 20, s); setTickets(res.data?.items || []); setTotal(res.data?.total || 0); setPage(p) } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const showDetail = async (id: string) => {
    try { const res = await admin.getTicketDetail(id); setDetail(res.data); setDetailModal(true); setReplyContent('') } catch { message.error('加载失败') }
  }

  const handleReply = async () => {
    if (!detail || !replyContent.trim()) return
    try { await admin.replyTicket(detail.id, replyContent); message.success('已回复'); setReplyContent(''); showDetail(detail.id) } catch { message.error('回复失败') }
  }

  const handleStatus = async (status: string) => {
    if (!detail) return
    try { await admin.updateTicketStatus(detail.id, status); message.success('状态已更新'); showDetail(detail.id) } catch { message.error('操作失败') }
  }

  const columns = [
    { title: '用户', dataIndex: 'nickname', key: 'nickname', width: 80 },
    { title: '类型', dataIndex: 'category', key: 'category', width: 80, render: (v: string) => <Tag>{TICKET_CATEGORY[v] || v}</Tag> },
    { title: '优先级', dataIndex: 'priority', key: 'priority', width: 70, render: (v: string) => <Tag color={v === 'high' ? 'red' : v === 'medium' ? 'orange' : 'default'}>{v}</Tag> },
    { title: '主题', dataIndex: 'subject', key: 'subject', ellipsis: true },
    { title: '状态', dataIndex: 'status', key: 'status', width: 80, render: (s: string) => <Tag color={s === 'open' ? 'red' : s === 'in_progress' ? 'orange' : s === 'resolved' ? 'green' : 'default'}>{s === 'open' ? '待处理' : s === 'in_progress' ? '处理中' : s === 'resolved' ? '已解决' : s === 'closed' ? '已关闭' : s}</Tag> },
    { title: '回复', dataIndex: 'reply_count', key: 'reply_count', width: 50 },
    { title: '时间', dataIndex: 'created_at', key: 'created_at', width: 130, render: (t: string) => t ? new Date(t).toLocaleString() : '-' },
    {
      title: '操作', key: 'action', width: 100,
      render: (_: any, r: TicketItem) => <Button size="small" icon={<EyeOutlined />} onClick={() => showDetail(r.id)}>处理</Button>,
    },
  ]

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Select placeholder="状态筛选" allowClear style={{ width: 120 }} onChange={(v) => { setStatusFilter(v || ''); load(1, v || '') }}
          options={[{ label: '待处理', value: 'open' }, { label: '处理中', value: 'in_progress' }, { label: '已解决', value: 'resolved' }, { label: '已关闭', value: 'closed' }]} />
      </Space>
      <Table rowKey="id" columns={columns} dataSource={tickets} loading={loading} pagination={{ current: page, total, pageSize: 20, onChange: (p) => load(p, statusFilter) }} size="middle" />

      <Modal title="工单详情" open={detailModal} onCancel={() => setDetailModal(false)} footer={null} width={700}>
        {detail ? (
          <>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="类型"><Tag>{TICKET_CATEGORY[detail.category] || detail.category}</Tag></Descriptions.Item>
              <Descriptions.Item label="优先级"><Tag color={detail.priority === 'high' ? 'red' : 'orange'}>{detail.priority}</Tag></Descriptions.Item>
              <Descriptions.Item label="状态"><Tag color={detail.status === 'open' ? 'red' : 'green'}>{detail.status}</Tag></Descriptions.Item>
              <Descriptions.Item label="主题">{detail.subject}</Descriptions.Item>
            </Descriptions>
            <Divider>内容</Divider>
            <div style={{ background: '#fafafa', padding: 12, borderRadius: 8, marginBottom: 16 }}>{detail.content || '-'}</div>
            {detail.replies && detail.replies.length > 0 && (
              <>
                <Divider>回复记录</Divider>
                {detail.replies.map((r) => (
                  <div key={r.id} style={{ padding: '8px 12px', marginBottom: 8, background: r.admin_id ? '#e6f7ff' : '#f6ffed', borderRadius: 6, borderLeft: `3px solid ${r.admin_id ? '#1890ff' : '#52c41a'}` }}>
                    <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>
                      {r.admin_id ? '管理员' : '用户'} {r.is_internal ? <Tag color="orange" style={{ marginLeft: 8 }}>内部备注</Tag> : null}
                      <span style={{ float: 'right' }}>{r.created_at ? new Date(r.created_at).toLocaleString() : ''}</span>
                    </div>
                    <div>{r.content}</div>
                  </div>
                ))}
              </>
            )}
            {detail.status !== 'closed' && (
              <>
                <Divider>回复</Divider>
                <TextArea rows={3} value={replyContent} onChange={(e) => setReplyContent(e.target.value)} placeholder="输入回复内容..." style={{ marginBottom: 12 }} />
                <Space>
                  <Button type="primary" icon={<SendOutlined />} onClick={handleReply}>发送回复</Button>
                  {detail.status === 'open' && <Button onClick={() => handleStatus('in_progress')}>标记处理中</Button>}
                  {detail.status !== 'resolved' && <Button onClick={() => handleStatus('resolved')}>标记已解决</Button>}
                  <Button onClick={() => handleStatus('closed')}>关闭工单</Button>
                </Space>
              </>
            )}
          </>
        ) : <Empty />}
      </Modal>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
//  审计日志 Panel
// ═══════════════════════════════════════════════════════

function LogsPanel() {
  const [logs, setLogs] = useState<AdminLogItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    try { const res = await admin.getAdminLogs(p, 50); setLogs(res.data?.items || []); setTotal(res.data?.total || 0); setPage(p) } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const columns = [
    { title: '管理员ID', dataIndex: 'admin_id', key: 'admin_id', width: 100, ellipsis: true },
    { title: '操作', dataIndex: 'action', key: 'action', width: 140, render: (v: string) => <Tag>{v}</Tag> },
    { title: '目标类型', dataIndex: 'target_type', key: 'target_type', width: 80 },
    { title: '目标ID', dataIndex: 'target_id', key: 'target_id', width: 100, ellipsis: true },
    { title: '详情', dataIndex: 'details', key: 'details', ellipsis: true, render: (v: any) => v ? JSON.stringify(v) : '-' },
    { title: '时间', dataIndex: 'created_at', key: 'created_at', width: 150, render: (t: string) => t ? new Date(t).toLocaleString() : '-' },
  ]

  return (
    <Card>
      <Table rowKey="id" columns={columns} dataSource={logs} loading={loading} pagination={{ current: page, total, pageSize: 50, onChange: (p) => load(p) }} size="small" scroll={{ x: 800 }} />
    </Card>
  )
}