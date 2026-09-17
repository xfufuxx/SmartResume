'use client'

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Button, Card, Typography, Spin, Row, Col, message, Empty, Select, Space, Tag, Progress,
} from 'antd'
import {
  TrophyOutlined, FileTextOutlined, ThunderboltOutlined, BulbOutlined,
  CheckCircleOutlined, ReloadOutlined, SafetyCertificateOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import { resumes, jobs, scoring } from '@/lib/api'
import { getToken } from '@/lib/auth'
import type { ResumeRecord, ResumeScore } from '@/types'
import AppLayout from '@/components/AppLayout'
import AuthGate from '@/components/AuthGate'

const { Text, Title } = Typography

interface JobOption {
  id: string
  title?: string
  company?: string
}

const DIMENSION_META: Record<string, { label: string; color: string }> = {
  completeness: { label: '信息完整度', color: '#2563EB' },
  keyword_match: { label: '关键词匹配', color: '#10B981' },
  quantification: { label: '成果量化', color: '#F59E0B' },
  format_readability: { label: '格式可读性', color: '#7C3AED' },
}

const SCORE_COLOR = (s: number) => (s >= 80 ? '#10B981' : s >= 60 ? '#F59E0B' : '#EF4444')

export default function ScoringPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [resumeList, setResumeList] = useState<ResumeRecord[]>([])
  const [jobList, setJobList] = useState<JobOption[]>([])
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [score, setScore] = useState<ResumeScore | null>(null)
  const [loading, setLoading] = useState(false)
  const [scoringLoading, setScoringLoading] = useState(false)

  useEffect(() => {
    const t = getToken()
    if (!t) { router.push('/login'); return }
    setToken(t)
    router.prefetch('/resumes')
    router.prefetch('/jobs')
  }, [router])

  const loadBase = useCallback(async () => {
    setLoading(true)
    try {
      const [rRes, jRes] = await Promise.all([
        resumes.list().catch(() => ({ data: [] as ResumeRecord[] })),
        jobs.list('', '').catch(() => ({ data: [] as JobOption[] })),
      ])
      const rList: ResumeRecord[] = rRes.data || []
      const jList: JobOption[] = jRes.data || []
      setResumeList(rList)
      setJobList(jList)
      const primary = rList.find((r) => r.is_primary) || rList[0]
      if (primary) setSelectedResumeId((prev) => prev || primary.id)
    } catch {
      message.error('加载数据失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (token) loadBase()
  }, [token, loadBase])

  const runScore = useCallback(async () => {
    if (!selectedResumeId) {
      message.warning('请先选择一份简历')
      return
    }
    setScoringLoading(true)
    try {
      const res = await scoring.getScore(selectedResumeId, selectedJobId || undefined)
      setScore(res.data || null)
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '评分失败')
    } finally {
      setScoringLoading(false)
    }
  }, [selectedResumeId, selectedJobId])

  useEffect(() => {
    if (token && selectedResumeId) runScore()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedResumeId, selectedJobId])

  const dimensions = useMemo(() => {
    if (!score?.dimensions) return []
    return Object.entries(score.dimensions).map(([key, val]) => ({
      key, value: val as number, ...DIMENSION_META[key],
    }))
  }, [score])

  if (!token) return <AuthGate activeKey="scoring" />

  return (
    <AppLayout activeKey="scoring" title="简历评分" subtitle="AI 智能分析简历竞争力">
      <div className="app-page-enter">
        <div className="app-page-header">
          <div className="app-page-header-left">
            <h1>简历评分</h1>
            <p>基于完整度、关键词、量化成果、格式可读性四个维度综合评分</p>
          </div>
          <Button type="primary" icon={<ReloadOutlined />} onClick={runScore} loading={scoringLoading}>重新评分</Button>
        </div>

        {/* 选择器 */}
        <Card style={{ borderRadius: 12, marginBottom: 16 }} styles={{ body: { padding: 16 } }}>
          <Row gutter={[16, 16]} align="middle">
            <Col flex="auto">
              <Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>选择简历</Text>
              <Select
                style={{ width: '100%' }}
                placeholder="请选择简历"
                value={selectedResumeId || undefined}
                onChange={setSelectedResumeId}
                options={resumeList.map((r) => ({ value: r.id, label: r.title || r.id.slice(0, 8) }))}
                notFoundContent={resumeList.length === 0 ? '暂无简历' : undefined}
              />
            </Col>
            <Col flex="auto">
              <Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>对照岗位（可选）</Text>
              <Select
                style={{ width: '100%' }}
                placeholder="请选择岗位进行匹配评分"
                value={selectedJobId || undefined}
                onChange={setSelectedJobId}
                allowClear
                options={jobList.map((j) => ({ value: j.id, label: `${j.title || '未命名'}${j.company ? ' @ ' + j.company : ''}` }))}
                notFoundContent={jobList.length === 0 ? '暂无岗位' : undefined}
              />
            </Col>
          </Row>
        </Card>

        {scoringLoading ? (
          <div style={{ textAlign: 'center', padding: 80 }}><Spin tip="正在分析简历..." /></div>
        ) : !score ? (
          <Card style={{ borderRadius: 12 }} styles={{ body: { padding: 60 } }}>
            <Empty description="选择简历后自动评分" />
          </Card>
        ) : (
          <Row gutter={[16, 16]}>
            {/* 总分卡 */}
            <Col xs={24} md={8}>
              <Card style={{ borderRadius: 12, height: '100%', textAlign: 'center' }} styles={{ body: { padding: 32 } }}>
                <Text type="secondary">综合评分</Text>
                <div style={{ margin: '16px 0' }}>
                  <Progress
                    type="dashboard"
                    percent={score.total_score}
                    strokeColor={SCORE_COLOR(score.total_score)}
                    format={(p) => <span style={{ fontSize: 32, fontWeight: 700, color: SCORE_COLOR(score.total_score) }}>{p}</span>}
                  />
                </div>
                <Tag color={score.total_score >= 80 ? 'success' : score.total_score >= 60 ? 'warning' : 'error'} style={{ borderRadius: 6 }}>
                  {score.total_score >= 80 ? '竞争力强' : score.total_score >= 60 ? '有待提升' : '急需优化'}
                </Tag>
              </Card>
            </Col>

            {/* 维度卡 */}
            <Col xs={24} md={16}>
              <Card style={{ borderRadius: 12, height: '100%' }} styles={{ body: { padding: 24 } }}>
                <Text strong style={{ fontSize: 15 }}>评分维度</Text>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 16 }}>
                  {dimensions.map((d) => (
                    <div key={d.key}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                        <span style={{ color: '#374151' }}>{d.label}</span>
                        <strong style={{ color: d.color }}>{d.value} 分</strong>
                      </div>
                      <Progress percent={d.value} showInfo={false} strokeColor={d.color} strokeWidth={8} />
                    </div>
                  ))}
                </div>
              </Card>
            </Col>

            {/* 建议卡 */}
            <Col span={24}>
              <Card style={{ borderRadius: 12 }} styles={{ body: { padding: 24 } }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <BulbOutlined style={{ color: '#F59E0B', fontSize: 18 }} />
                  <Text strong style={{ fontSize: 15 }}>优化建议</Text>
                  <Tag style={{ marginLeft: 4 }}>{score.suggestions?.length || 0} 条</Tag>
                </div>
                {score.suggestions?.length ? (
                  <div className="stagger-list" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {score.suggestions.map((s, i) => (
                      <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 16px', background: '#F8FAFC', borderRadius: 10 }}>
                        <CheckCircleOutlined style={{ color: '#10B981', marginTop: 3 }} />
                        <Text style={{ fontSize: 13, lineHeight: 1.6 }}>{s}</Text>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty description="暂无建议" />
                )}
              </Card>
            </Col>
          </Row>
        )}
      </div>
    </AppLayout>
  )
}