'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  Typography, Spin, Row, Col, message, Button, Progress, List, Tag,
  Space, Avatar, Badge, Empty, Skeleton,
} from 'antd'
import {
  FileTextOutlined, FileSearchOutlined, ThunderboltOutlined,
  TrophyOutlined, RiseOutlined, FallOutlined, ArrowRightOutlined,
  RobotOutlined, CheckCircleOutlined, WarningOutlined,
  BellOutlined, HistoryOutlined, PlusOutlined, TeamOutlined,
  AimOutlined, SafetyCertificateOutlined,
} from '@ant-design/icons'
import dynamic from 'next/dynamic'
import type { EChartsOption } from 'echarts'
import * as echarts from 'echarts/core'
import { LineChart, BarChart, PieChart } from 'echarts/charts'
import {
  GridComponent, TooltipComponent, LegendComponent, TitleComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

// 仅注册看板实际用到的图表/组件，显著减小该路由 chunk；React 包装层动态加载避免阻塞首屏与路由切换
echarts.use([LineChart, BarChart, PieChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, CanvasRenderer])
const ReactECharts = dynamic(() => import('echarts-for-react/lib/core'), {
  ssr: false,
  loading: () => <Spin size="large" />,
})
import { useRouter } from 'next/navigation'
import { insights, messages, scoring } from '@/lib/api'
import { getToken } from '@/lib/auth'
import type {
  TrendingJob, InsightOverview, InsightActionItem, MessageItem,
} from '@/types'
import { useApiData } from '@/lib/useApi'
import AppLayout from '@/components/AppLayout'

function getCssVar(name: string, fallback = ''): string {
  if (typeof window === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

const ACTIVITY_META: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  resume: { icon: <FileTextOutlined />, color: 'var(--primary-500)', label: '简历' },
  job: { icon: <FileSearchOutlined />, color: 'var(--warning-500)', label: '岗位' },
  optimize: { icon: <ThunderboltOutlined />, color: 'var(--success-500)', label: '优化' },
}

const LEVEL_COLOR: Record<InsightActionItem['level'], string> = {
  primary: 'var(--primary-500)',
  warning: 'var(--warning-500)',
  info: 'var(--text-tertiary)',
}

function relativeTime(iso?: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(diff)) return ''
  const m = Math.floor(diff / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m} 分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} 天前`
  return new Date(iso).toLocaleDateString('zh-CN')
}

// 看板骨架屏：在未拿到数据（首次加载）时占位，配合 keepPreviousData 让重复访问直接渲染旧数据。
// 放在 AppLayout 外壳内，避免“整页白屏只剩一个转圈”被误判为加载不出来。
function DashboardSkeleton() {
  return (
    <>
      <div className="app-stat-grid">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="app-stat-card">
            <Skeleton active paragraph={false} title={{ width: '50%' }} />
            <div style={{ height: 14 }} />
            <Skeleton active paragraph={false} title={{ width: '30%' }} />
          </div>
        ))}
      </div>
      <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
        <Col xs={24} lg={10}>
          <div className="app-card" style={{ padding: 20 }}>
            <Skeleton active avatar paragraph={{ rows: 3 }} />
          </div>
        </Col>
        <Col xs={24} lg={14}>
          <div className="app-card" style={{ padding: 20 }}>
            <Skeleton active paragraph={{ rows: 4 }} />
          </div>
        </Col>
      </Row>
    </>
  )
}

export default function Dashboard() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    const t = getToken()
    if (!t) { router.push('/login'); return }
    setToken(t)
    router.prefetch('/resumes')
    router.prefetch('/history')
    router.prefetch('/')
  }, [router])

  // 客户端缓存 + 请求去重：面板重复访问瞬时渲染；并发用户下同类请求合并，降低后端压力
  const { data: ovRes, isLoading: ovLoading } = useApiData(
    token ? 'insights:overview:30' : null,
    () => insights.overview(30),
    { errorRetryCount: 0, onError: () => message.error('部分数据加载失败') },
  )
  const { data: tRes, isLoading: tLoading } = useApiData(
    token ? 'scoring:getTrending:7' : null,
    () => scoring.getTrending(7),
  )
  const { data: mRes, isLoading: mLoading } = useApiData(
    token ? 'messages:list:1:5' : null,
    () => messages.list(1, 5),
  )

  const overview = (ovRes?.data as InsightOverview | null | undefined) ?? null
  const trending = (tRes?.data as TrendingJob[] | undefined) ?? []
  const noticeList = (mRes?.data?.items as MessageItem[] | undefined) ?? []
  const loading = ovLoading || tLoading || mLoading
  // 仅当“首次加载且无任何历史数据”时才展示骨架屏；重复访问时 keepPreviousData 已有旧数据会直接渲染，不再转圈
  const initialLoading = loading && !ovRes && !tRes && !mRes

  const counts = overview?.counts
  const matchInfo = overview?.match

  const kpiStats = useMemo(() => ([
    { label: '我的简历', value: counts?.resumes ?? 0, unit: '份', icon: <FileTextOutlined />, color: 'blue' },
    { label: '目标岗位', value: counts?.jobs ?? 0, unit: '个', icon: <FileSearchOutlined />, color: 'orange' },
    { label: 'AI 优化次数', value: counts?.optimizations ?? 0, unit: '次', icon: <ThunderboltOutlined />, color: 'purple' },
    { label: '平均匹配度', value: matchInfo?.avg ?? 0, unit: '分', icon: <TrophyOutlined />, color: 'green' },
    { label: '历史最佳', value: matchInfo?.best ?? 0, unit: '分', icon: <CheckCircleOutlined />, color: 'red' },
  ]), [counts, matchInfo])

  const trend = overview?.trend || []

  const trendOption: EChartsOption = useMemo(() => ({
    tooltip: {
      trigger: 'axis',
      backgroundColor: getCssVar('--bg-card', '#ffffff'),
      borderColor: getCssVar('--border-light', '#e5e7eb'),
      textStyle: { color: getCssVar('--text-primary', '#111827') },
    },
    legend: {
      data: ['平均匹配度', '优化次数'],
      right: 0,
      top: 0,
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: getCssVar('--text-secondary', '#4b5563'), fontSize: 11 },
    },
    grid: { left: 8, right: 8, top: 34, bottom: 4, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: trend.map((t) => t.date),
      axisLine: { lineStyle: { color: getCssVar('--border-light', '#e5e7eb') } },
      axisLabel: { color: getCssVar('--text-tertiary', '#6b7280'), fontSize: 11, interval: Math.max(1, Math.floor(trend.length / 6)) },
    },
    yAxis: [
      {
        type: 'value', min: 0, max: 100,
        axisLine: { show: false },
        splitLine: { lineStyle: { color: getCssVar('--border-light', '#e5e7eb') } },
        axisLabel: { color: getCssVar('--text-tertiary', '#6b7280'), fontSize: 11, formatter: '{value}%' },
      },
      {
        type: 'value', min: 0,
        axisLine: { show: false }, splitLine: { show: false },
        axisLabel: { color: getCssVar('--text-tertiary', '#6b7280'), fontSize: 11, formatter: '{value}次' },
      },
    ],
    series: [
      {
        name: '平均匹配度',
        type: 'line',
        smooth: true,
        showSymbol: false,
        connectNulls: true,
        data: trend.map((t) => t.avg_score),
        lineStyle: { color: getCssVar('--primary-500', '#3b82f6'), width: 3 },
        itemStyle: { color: getCssVar('--primary-500', '#3b82f6') },
        areaStyle: {
          color: {
            type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: getCssVar('--primary-200', '#bfdbfe') },
              { offset: 1, color: getCssVar('--primary-50', '#eff6ff') },
            ],
          },
        },
      },
      {
        name: '优化次数',
        type: 'bar',
        yAxisIndex: 1,
        barMaxWidth: 12,
        data: trend.map((t) => t.count),
        itemStyle: { color: getCssVar('--success-500', '#10b981'), borderRadius: [3, 3, 0, 0] },
      },
    ],
  }), [trend])

  const pieData = useMemo(() => {
    const cats = overview?.categories || []
    if (!cats.length) return []
    return cats.slice(0, 6)
  }, [overview])

  const pieTotal = useMemo(() => pieData.reduce((sum, d) => sum + d.value, 0), [pieData])
  const PIE_COLORS = [
    getCssVar('--primary-500', '#3b82f6'),
    getCssVar('--success-500', '#10b981'),
    getCssVar('--warning-500', '#f59e0b'),
    getCssVar('--error-500', '#ef4444'),
    '#8b5cf6',
    '#06b6d4',
  ]

  const pieOption: EChartsOption = useMemo(() => ({
    tooltip: {
      trigger: 'item',
      backgroundColor: getCssVar('--bg-card', '#ffffff'),
      borderColor: getCssVar('--border-light', '#e5e7eb'),
      textStyle: { color: getCssVar('--text-primary', '#111827') },
    },
    legend: {
      orient: 'vertical', right: 4, top: 'center',
      itemWidth: 10, itemHeight: 10,
      textStyle: { color: getCssVar('--text-secondary', '#4b5563'), fontSize: 12 },
    },
    color: PIE_COLORS,
    series: [{
      name: '优化方向',
      type: 'pie',
      radius: ['55%', '80%'],
      center: ['34%', '50%'],
      avoidLabelOverlap: false,
      label: { show: false },
      emphasis: { label: { show: false } },
      data: pieData,
    }],
  }), [pieData])

  const actionItems = overview?.action_items || []
  const activities = overview?.recent_activities || []

  const hotJobs = useMemo(() => {
    if (trending.length) {
      return trending.slice(0, 5).map((t) => ({ name: t.job_title, value: Math.min(100, Math.max(50, 90 - t.rank * 8)) }))
    }
    return []
  }, [trending])

  const hasData = (counts?.resumes || 0) + (counts?.jobs || 0) + (counts?.optimizations || 0) > 0

  if (!token) {
    // 未登录态也先渲染 AppLayout 外壳 + 骨架屏，而非整页裸转圈：
    // 客户端 JS 一旦未 hydrate 也不会永久钉在白屏转圈；未登录时 useEffect 仍会跳转 /login
    return (
      <AppLayout activeKey="dashboard" title="求职数据看板">
        <div className="animate-in" style={{ padding: 24 }}>
          <DashboardSkeleton />
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout
      activeKey="dashboard"
      title="求职数据看板"
      subtitle={`${new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })} · 数据实时来自你的使用记录`}
      headerExtra={
        <Space>
          <Button icon={<AimOutlined />} onClick={() => router.push('/match')}>匹配罗盘</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push('/resumes')}>
            上传简历
          </Button>
        </Space>
      }
    >
      <div className="animate-in">
        {initialLoading ? (
          <DashboardSkeleton />
        ) : (
          <>
            <div className="app-stat-grid">
              {kpiStats.map((s, idx) => (
                <div key={idx} className="app-stat-card">
                  <div className="app-stat-header">
                    <span className="app-stat-label">{s.label}</span>
                    <div className={`app-stat-icon ${s.color}`}>{s.icon}</div>
                  </div>
                  <div className="app-stat-value">
                    {s.value}{s.unit && <span style={{ fontSize: 14, marginLeft: 2, color: 'var(--text-tertiary)' }}>{s.unit}</span>}
                  </div>
                  {s.label === '平均匹配度' && (matchInfo?.improvement ?? 0) !== 0 && (
                    <div className="app-stat-footer">
                      <span className={`app-stat-trend ${(matchInfo?.improvement ?? 0) >= 0 ? 'up' : 'down'}`}>
                        {(matchInfo?.improvement ?? 0) >= 0 ? <RiseOutlined /> : <FallOutlined />}
                        {Math.abs(matchInfo?.improvement ?? 0)} 分
                      </span>
                      <span>较首次优化</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {!hasData && (
              <div style={{ background: 'var(--primary-50)', border: '1px solid var(--primary-200)', borderRadius: 12, padding: '16px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
                <RobotOutlined style={{ fontSize: 22, color: 'var(--primary-600)' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>还没有数据，先完成这三步</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                    上传简历 → 录入目标岗位 → 一键 AI 优化，之后这里会自动生成你的求职数据。
                  </div>
                </div>
                <Button type="primary" onClick={() => router.push('/resumes')}>开始使用</Button>
              </div>
            )}

            <Row gutter={[24, 24]} style={{ marginBottom: 24 }}>
              <Col xs={24} lg={10}>
                <div className="app-card" style={{ padding: 20 }}>
                  <div className="app-section-title" style={{ marginBottom: 12 }}>
                    <HistoryOutlined style={{ color: 'var(--primary-600)' }} /> 最近动态
                  </div>
                  {activities.length ? (
                    <List
                      dataSource={activities}
                      renderItem={(item) => {
                        const meta = ACTIVITY_META[item.type] || ACTIVITY_META.resume
                        return (
                          <List.Item
                            style={{ cursor: item.type === 'optimize' && item.ref_id ? 'pointer' : 'default', padding: '12px 0' }}
                            onClick={() => {
                              if (item.type === 'optimize' && item.ref_id) router.push(`/history/${item.ref_id}`)
                              else if (item.type === 'resume') router.push('/resumes')
                              else router.push('/jobs')
                            }}
                            actions={[
                              <div key="score" style={{ textAlign: 'center', minWidth: 48 }}>
                                {item.match_score != null
                                  ? <Tag color="blue" style={{ marginInlineEnd: 0 }}>{item.match_score}%</Tag>
                                  : <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{meta.label}</span>}
                              </div>,
                            ]}
                          >
                            <List.Item.Meta
                              avatar={<div className="app-list-avatar" style={{ color: meta.color }}>{meta.icon}</div>}
                              title={<span className="app-list-title">{item.title}</span>}
                              description={<span className="app-list-desc">{item.desc} · {relativeTime(item.created_at)}</span>}
                            />
                          </List.Item>
                        )
                      }}
                    />
                  ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无动态" />
                  )}
                </div>
              </Col>

              <Col xs={24} lg={14}>
                <div className="app-card" style={{ padding: 20 }}>
                  <div className="app-section-title" style={{ marginBottom: 4 }}>
                    <TrophyOutlined style={{ color: 'var(--primary-600)' }} /> 匹配度趋势（近 30 天）
                  </div>
                  <ReactECharts echarts={echarts} option={trendOption} style={{ height: 260 }} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, marginTop: 8 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>平均匹配度</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{matchInfo?.avg ?? 0}</div>
                    </div>
                    <div style={{ width: 1, height: 24, background: 'var(--border-light)' }} />
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>最近一次</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--primary-600)' }}>{matchInfo?.latest ?? 0}</div>
                    </div>
                    <div style={{ width: 1, height: 24, background: 'var(--border-light)' }} />
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>样本数</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{matchInfo?.sample_size ?? 0}</div>
                    </div>
                  </div>
                </div>
              </Col>
            </Row>

            <Row gutter={[24, 24]}>
              <Col xs={24} md={12} lg={7}>
                <div className="app-card" style={{ padding: 20 }}>
                  <div className="app-section-title" style={{ marginBottom: 8 }}>
                    <RobotOutlined style={{ color: 'var(--primary-600)' }} /> 下一步建议
                  </div>
                  {actionItems.length ? (
                    <List
                      dataSource={actionItems}
                      renderItem={(item) => (
                        <List.Item style={{ padding: '12px 0', borderBottom: '1px solid var(--border-light)', alignItems: 'flex-start' }}>
                          <div style={{ display: 'flex', gap: 12, width: '100%' }}>
                            <Avatar size={32} style={{ background: 'var(--bg-page)', color: LEVEL_COLOR[item.level], flexShrink: 0 }}>
                              {item.level === 'warning' ? <WarningOutlined /> : item.level === 'primary' ? <ThunderboltOutlined /> : <RobotOutlined />}
                            </Avatar>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13, marginBottom: 4 }}>{item.title}</div>
                              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 8 }}>{item.desc}</div>
                              <Button type="primary" size="small" style={{ borderRadius: 6 }} onClick={() => router.push(item.link)}>
                                {item.action}
                              </Button>
                            </div>
                          </div>
                        </List.Item>
                      )}
                    />
                  ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无待办，状态良好" />
                  )}
                </div>
              </Col>

              <Col xs={24} md={12} lg={5}>
                <div className="app-card" style={{ padding: 20 }}>
                  <div className="app-section-title" style={{ marginBottom: 8 }}>
                    <ThunderboltOutlined style={{ color: 'var(--primary-600)' }} /> 优化方向分布
                  </div>
                  {pieData.length ? (
                    <>
                      <div style={{ position: 'relative' }}>
                        <ReactECharts echarts={echarts} option={pieOption} style={{ height: 200 }} />
                        <div style={{ position: 'absolute', top: '50%', left: '34%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>{pieTotal}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>总数</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                        {pieData.map((d, i) => (
                          <div key={d.name} style={{ textAlign: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 12, color: 'var(--text-tertiary)' }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: PIE_COLORS[i % PIE_COLORS.length] }} />
                              {d.name}
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                              {d.value} ({Math.round((d.value / Math.max(1, pieTotal)) * 100)}%)
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有优化记录" />
                  )}
                </div>
              </Col>

              <Col xs={24} md={12} lg={6}>
                <div className="app-card" style={{ padding: 20 }}>
                  <div className="app-section-title" style={{ marginBottom: 8 }}>
                    <AimOutlined style={{ color: 'var(--primary-600)' }} /> 快捷工具
                  </div>
                  <Row gutter={[12, 12]}>
                    {[
                      { key: 'match', label: '岗位匹配罗盘', desc: '一份简历对比全部岗位', icon: <AimOutlined />, path: '/match', color: 'var(--primary-500)' },
                      { key: 'interview', label: 'AI 面试押题', desc: '预测真题 + 答题要点', icon: <TeamOutlined />, path: '/interview', color: 'var(--success-500)' },
                      { key: 'ats', label: 'ATS 体检', desc: '机器可读性检查', icon: <SafetyCertificateOutlined />, path: '/ats', color: 'var(--warning-500)' },
                      { key: 'scoring', label: '简历评分', desc: '四维量化打分', icon: <TrophyOutlined />, path: '/scoring', color: '#8b5cf6' },
                    ].map((t) => (
                      <Col span={12} key={t.key}>
                        <div
                          onClick={() => router.push(t.path)}
                          style={{
                            padding: 14, borderRadius: 10, cursor: 'pointer',
                            background: 'var(--bg-page)', border: '1px solid var(--border-light)',
                          }}
                        >
                          <div style={{ fontSize: 18, color: t.color, marginBottom: 6 }}>{t.icon}</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{t.label}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{t.desc}</div>
                        </div>
                      </Col>
                    ))}
                  </Row>
                  {hotJobs.length > 0 && (
                    <>
                      <div className="app-section-title" style={{ margin: '18px 0 8px' }}>
                        <FileSearchOutlined style={{ color: 'var(--primary-600)' }} /> 热门岗位
                      </div>
                      <List
                        dataSource={hotJobs}
                        renderItem={(item, idx) => (
                          <List.Item style={{ padding: '8px 0', borderBottom: '1px solid var(--border-light)' }}>
                            <div style={{ width: '100%' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                <Space>
                                  <span style={{
                                    width: 20, height: 20, borderRadius: '50%', display: 'inline-flex',
                                    alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
                                    background: idx < 3 ? 'var(--warning-50)' : 'var(--gray-100)',
                                    color: idx < 3 ? 'var(--warning-600)' : 'var(--text-tertiary)',
                                  }}>{idx + 1}</span>
                                  <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{item.name}</span>
                                </Space>
                                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary-600)' }}>{item.value}%</span>
                              </div>
                              <div className="app-progress-bar">
                                <div style={{ width: `${item.value}%` }} />
                              </div>
                            </div>
                          </List.Item>
                        )}
                      />
                    </>
                  )}
                </div>
              </Col>

              <Col xs={24} md={12} lg={6}>
                <div className="app-card" style={{ padding: 20 }}>
                  <div className="app-section-title" style={{ marginBottom: 8 }}>
                    <BellOutlined style={{ color: 'var(--primary-600)' }} /> 系统通知
                  </div>
                  {noticeList.length ? (
                    <List
                      dataSource={noticeList}
                      renderItem={(item) => (
                        <List.Item
                          style={{ padding: '12px 0', borderBottom: '1px solid var(--border-light)', cursor: 'pointer' }}
                          onClick={() => router.push('/messages')}
                        >
                          <div style={{ display: 'flex', gap: 12 }}>
                            <Badge dot={!item.is_read} color="var(--primary-500)">
                              <Avatar size={36} style={{ background: 'var(--bg-page)', color: 'var(--text-tertiary)' }} icon={<BellOutlined />} />
                            </Badge>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5, marginBottom: 4 }}>
                                {item.title || item.content || '系统消息'}
                              </div>
                              <div style={{ fontSize: 12, color: 'var(--text-quaternary)' }}>{relativeTime(item.created_at)}</div>
                            </div>
                          </div>
                        </List.Item>
                      )}
                    />
                  ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无通知" />
                  )}
                  <div style={{ textAlign: 'center', marginTop: 10 }}>
                    <Button type="link" size="small" icon={<ArrowRightOutlined />} onClick={() => router.push('/messages')}>
                      查看全部消息
                    </Button>
                  </div>
                </div>
              </Col>
            </Row>

            {matchInfo && matchInfo.sample_size > 0 && (
              <div className="app-card" style={{ padding: 20, marginTop: 24 }}>
                <div className="app-section-title" style={{ marginBottom: 12 }}>
                  <TrophyOutlined style={{ color: 'var(--primary-600)' }} /> 效果概览
                </div>
                <Row gutter={[24, 24]} align="middle">
                  <Col xs={24} sm={8} style={{ textAlign: 'center' }}>
                    <Progress
                      type="dashboard"
                      percent={Math.round(matchInfo.avg)}
                      strokeColor="var(--primary-500)"
                      format={(p) => <span style={{ fontSize: 20, fontWeight: 700 }}>{p}</span>}
                    />
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>平均匹配度</div>
                  </Col>
                  <Col xs={24} sm={16}>
                    <Typography.Paragraph style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>
                      共完成 <b style={{ color: 'var(--text-primary)' }}>{counts?.optimizations ?? 0}</b> 次 AI 优化，
                      历史最佳匹配度 <b style={{ color: 'var(--text-primary)' }}>{matchInfo.best}</b> 分，
                      最近一次 <b style={{ color: 'var(--text-primary)' }}>{matchInfo.latest}</b> 分。
                      {matchInfo.improvement > 0
                        ? `相比首次优化提升了 ${matchInfo.improvement} 分，说明反复精炼确实有效。`
                        : matchInfo.improvement < 0
                          ? `相比首次下降了 ${Math.abs(matchInfo.improvement)} 分，可能换了目标岗位，建议针对单个岗位持续优化。`
                          : '继续保持，多做几次针对岗位的精炼效果会更明显。'}
                    </Typography.Paragraph>
                    <Space wrap>
                      <Button icon={<TeamOutlined />} onClick={() => router.push('/interview')}>生成面试押题</Button>
                      <Button icon={<AimOutlined />} onClick={() => router.push('/match')}>看看哪个岗位更适合我</Button>
                      <Button type="link" onClick={() => router.push('/history')}>查看全部优化记录</Button>
                    </Space>
                  </Col>
                </Row>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  )
}
