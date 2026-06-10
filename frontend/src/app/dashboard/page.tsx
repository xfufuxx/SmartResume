'use client'

import React, { useEffect, useState, useCallback } from 'react'
import {
  Layout, Button, Card, Typography, Spin, Row, Col, message,
  Progress, List, Tag, Space, Divider, Statistic, Select, Empty, Tooltip,
} from 'antd'
import {
  LogoutOutlined, HistoryOutlined, HomeOutlined,
  DashboardOutlined, FileTextOutlined, RiseOutlined,
  TrophyOutlined, AimOutlined, CheckCircleOutlined,
  CloseCircleOutlined, SmileOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import { scoring, feedback, resumes } from '@/lib/api'
import { getToken, clearAuth } from '@/lib/auth'
import type { ResumeScore, TrendingJob, FeedbackStats, ResumeRecord } from '@/types'

const { Header, Content } = Layout

const OUTCOME_LABELS: Record<string, string> = {
  no_reply: '已读不回',
  interview: '面试邀请',
  fail_round1: '一面挂',
  fail_round2: '二面挂',
  offer: '拿到Offer',
}

const OUTCOME_COLORS: Record<string, string> = {
  no_reply: '#8c8c8c',
  interview: '#1890ff',
  fail_round1: '#faad14',
  fail_round2: '#fa8c16',
  offer: '#52c41a',
}

export default function Dashboard() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)

  const [resumeList, setResumeList] = useState<ResumeRecord[]>([])
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null)
  const [score, setScore] = useState<ResumeScore | null>(null)
  const [scoreLoading, setScoreLoading] = useState(false)

  const [trending, setTrending] = useState<TrendingJob[]>([])
  const [trendingLoading, setTrendingLoading] = useState(false)

  const [stats, setStats] = useState<FeedbackStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)

  const [showTrending, setShowTrending] = useState(true)

  useEffect(() => {
    const t = getToken()
    if (!t) {
      router.push('/login')
      return
    }
    setToken(t)

    router.prefetch('/resumes')
    router.prefetch('/history')
    router.prefetch('/')
  }, [router])

  useEffect(() => {
    if (!token) return
    loadResumes()
    loadTrending()
    loadStats()
  }, [token])

  const loadResumes = useCallback(async () => {
    try {
      const res = await resumes.list()
      const list = res.data as ResumeRecord[]
      setResumeList(list)
      const primary = list.find((r) => r.is_primary) || list[0]
      if (primary) {
        setSelectedResumeId(primary.id)
        loadScore(primary.id)
      }
    } catch {
      message.error('加载简历列表失败')
    }
  }, [])

  const loadScore = useCallback(async (resumeId: string) => {
    setScoreLoading(true)
    try {
      const res = await scoring.getScore(resumeId)
      setScore(res.data)
    } catch {
      message.error('加载评分失败')
    } finally {
      setScoreLoading(false)
    }
  }, [])

  const loadTrending = useCallback(async () => {
    setTrendingLoading(true)
    try {
      const res = await scoring.getTrending(7)
      setTrending(res.data)
    } catch {
      setTrending([])
    } finally {
      setTrendingLoading(false)
    }
  }, [])

  const loadStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const res = await feedback.stats()
      setStats(res.data)
    } catch {
      setStats(null)
    } finally {
      setStatsLoading(false)
    }
  }, [])

  const handleResumeChange = useCallback((id: string) => {
    setSelectedResumeId(id)
    loadScore(id)
  }, [loadScore])

  const RadarChart = ({ score: s }: { score: ResumeScore }) => {
    if (!s) return null
    const dims = [
      { key: 'keyword_match', label: '关键词匹配', value: s.dimensions.keyword_match },
      { key: 'completeness', label: '内容完整性', value: s.dimensions.completeness },
      { key: 'quantification', label: '量化成果', value: s.dimensions.quantification },
      { key: 'format_readability', label: '排版清晰度', value: s.dimensions.format_readability },
    ]

    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center' }}>
        {dims.map((dim) => (
          <div key={dim.key} style={{ textAlign: 'center', width: 130 }}>
            <Progress
              type="circle"
              percent={dim.value}
              size={100}
              strokeColor={dim.value >= 80 ? '#52c41a' : dim.value >= 60 ? '#faad14' : '#ff4d4f'}
            />
            <div style={{ marginTop: 8, fontSize: 13, color: '#666' }}>{dim.label}</div>
          </div>
        ))}
      </div>
    )
  }

  if (!token) return null

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingInline: 24 }}>
        <Space>
          <Typography.Title level={4} style={{ color: '#fff', margin: 0 }}>
            <DashboardOutlined /> 智能分析与洞察
          </Typography.Title>
        </Space>
        <Space>
          <Button icon={<HomeOutlined />} onClick={() => router.push('/')} type="text" style={{ color: '#fff' }}>
            首页
          </Button>
          <Button icon={<FileTextOutlined />} onClick={() => router.push('/resumes')} type="text" style={{ color: '#fff' }}>
            简历库
          </Button>
          <Button icon={<HistoryOutlined />} onClick={() => router.push('/history')} type="text" style={{ color: '#fff' }}>
            历史记录
          </Button>
          <Button icon={<LogoutOutlined />} onClick={() => { clearAuth(); router.push('/login') }} type="text" style={{ color: '#fff' }}>
            退出
          </Button>
        </Space>
      </Header>

      <Content style={{ padding: 24, maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        <Row gutter={[24, 24]}>
          {/* 简历评分仪表盘 */}
          <Col xs={24} lg={14}>
            <Card
              title={<><TrophyOutlined /> 简历评分仪表盘</>}
              extra={
                <Select
                  value={selectedResumeId}
                  onChange={handleResumeChange}
                  style={{ width: 200 }}
                  options={resumeList.map((r) => ({
                    label: r.title || r.id.slice(0, 8),
                    value: r.id,
                  }))}
                />
              }
            >
              {scoreLoading ? (
                <Spin tip="正在计算评分..." style={{ display: 'block', textAlign: 'center', padding: 40 }} />
              ) : score ? (
                <>
                  <div style={{ textAlign: 'center', marginBottom: 24 }}>
                    <Statistic
                      title="综合得分"
                      value={score.total_score}
                      suffix="/ 100"
                      valueStyle={{
                        color: score.total_score >= 80 ? '#52c41a' : score.total_score >= 60 ? '#faad14' : '#ff4d4f',
                        fontSize: 36,
                      }}
                    />
                  </div>
                  <RadarChart score={score} />
                  <Divider />
                  <Typography.Title level={5}>优化建议</Typography.Title>
                  <List
                    size="small"
                    dataSource={score.suggestions}
                    renderItem={(item, idx) => (
                      <List.Item>
                        <Space>
                          <Tag color="orange">{idx + 1}</Tag>
                          <span>{item}</span>
                        </Space>
                      </List.Item>
                    )}
                    locale={{ emptyText: '暂无建议，简历状态良好' }}
                  />
                </>
              ) : (
                <Empty description="请先上传并解析简历" />
              )}
            </Card>
          </Col>

          {/* 投递分析与岗位热度 */}
          <Col xs={24} lg={10}>
            {/* 投递策略有效性 */}
            <Card
              title={<><AimOutlined /> 投递策略有效性</>}
              loading={statsLoading}
              style={{ marginBottom: 24 }}
            >
              {stats ? (
                <>
                  <Row gutter={16}>
                    <Col span={8}>
                      <Statistic title="总投递" value={stats.total_applications} suffix="次" />
                    </Col>
                    <Col span={8}>
                      <Statistic
                        title="面试率"
                        value={stats.interview_rate}
                        suffix="%"
                        valueStyle={{ color: stats.interview_rate >= 30 ? '#52c41a' : '#faad14' }}
                      />
                    </Col>
                    <Col span={8}>
                      <Statistic
                        title="Offer率"
                        value={stats.offer_rate}
                        suffix="%"
                        valueStyle={{ color: stats.offer_rate > 0 ? '#52c41a' : '#8c8c8c' }}
                      />
                    </Col>
                  </Row>
                  <Divider style={{ margin: '12px 0' }} />
                  <div>
                    {Object.entries(stats.outcome_breakdown).map(([key, count]) => (
                      <div key={key} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <Space>
                          {key === 'offer' ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> :
                           key === 'no_reply' ? <CloseCircleOutlined style={{ color: '#8c8c8c' }} /> :
                           <SmileOutlined style={{ color: OUTCOME_COLORS[key] }} />}
                          <span>{OUTCOME_LABELS[key] || key}</span>
                        </Space>
                        <Tag color={OUTCOME_COLORS[key]}>{count}</Tag>
                      </div>
                    ))}
                    {Object.keys(stats.outcome_breakdown).length === 0 && (
                      <Empty description="暂无投递记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                    )}
                  </div>
                </>
              ) : (
                <Empty description="暂无投递数据，在优化历史详情中添加投递记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}
            </Card>

            {/* 岗位热度分析 */}
            {showTrending && (
              <Card
                title={<><RiseOutlined /> 近7天热门岗位 TOP 5</>}
                loading={trendingLoading}
                extra={
                  <Button type="link" size="small" onClick={() => setShowTrending(false)}>
                    关闭
                  </Button>
                }
              >
                {trending.length > 0 ? (
                  <List
                    size="small"
                    dataSource={trending}
                    renderItem={(item) => (
                      <List.Item>
                        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                          <Space>
                            <Tag color={item.rank <= 3 ? 'gold' : 'default'}>#{item.rank}</Tag>
                            <span>{item.job_title}</span>
                          </Space>
                          <Space>
                            <Tag>{item.count} 个岗位</Tag>
                            {item.change_percent != null && (
                              <Tag color={item.change_percent > 0 ? 'red' : 'green'}>
                                {item.change_percent > 0 ? '+' : ''}{item.change_percent}%
                              </Tag>
                            )}
                          </Space>
                        </Space>
                      </List.Item>
                    )}
                  />
                ) : (
                  <Empty description="暂无足够数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                )}
                <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
                  * 基于平台匿名汇总数据，不涉及个人隐私
                </div>
              </Card>
            )}
          </Col>
        </Row>
      </Content>
    </Layout>
  )
}