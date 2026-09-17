'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  Button, Spin, Row, Col, message, Tag, Space, Select, Empty,
  Progress, Alert, Tooltip, Card, Statistic,
} from 'antd'
import {
  AimOutlined, ThunderboltOutlined, StarFilled, StarOutlined,
  FileTextOutlined, RiseOutlined, WarningOutlined, CheckCircleOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/AppLayout'
import AuthGate from '@/components/AuthGate'
import { matching, resumes, optimize } from '@/lib/api'
import { getToken } from '@/lib/auth'
import type { MatchRankResult, ResumeRecord } from '@/types'

function rateColor(rate: number): string {
  if (rate >= 80) return 'var(--success-500)'
  if (rate >= 60) return 'var(--primary-500)'
  if (rate >= 40) return 'var(--warning-500)'
  return 'var(--error-500)'
}

function rateLabel(rate: number): string {
  if (rate >= 80) return '强烈推荐投递'
  if (rate >= 60) return '值得优化后投递'
  if (rate >= 40) return '需要大幅补关键词'
  return '不建议优先考虑'
}

export default function MatchBoardPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [resumeList, setResumeList] = useState<ResumeRecord[]>([])
  const [resumeId, setResumeId] = useState<string>('')
  const [result, setResult] = useState<MatchRankResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [optimizingJobId, setOptimizingJobId] = useState<string>('')

  useEffect(() => {
    const t = getToken()
    if (!t) { router.push('/login'); return }
    setToken(t)
  }, [router])

  useEffect(() => {
    if (!token) return
    const load = async () => {
      try {
        const res = await resumes.list()
        const rs: ResumeRecord[] = ((res.data || []) as ResumeRecord[]).filter((r) => !!r.parsed_json)
        setResumeList(rs)
        if (rs.length) {
          const primary = rs.find((r) => r.is_primary) || rs[0]
          setResumeId(primary.id)
        }
      } catch {
        message.error('加载简历失败')
      }
    }
    load()
  }, [token])

  const runRank = async (rid: string) => {
    if (!rid) return
    setLoading(true)
    setResult(null)
    try {
      const res = await matching.rank(rid)
      setResult(res.data)
    } catch (e: any) {
      message.error(e?.response?.data?.detail || '匹配失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (resumeId) runRank(resumeId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeId])

  const goOptimize = async (jobId: string) => {
    if (!resumeId) return
    setOptimizingJobId(jobId)
    try {
      const res = await optimize.runAsync(resumeId, jobId)
      const taskId = res.data?.task_id
      if (!taskId) throw new Error('未返回任务 ID')
      message.success('优化任务已提交，正在后台处理')
      // 简单轮询后跳到最新记录
      const timer = setInterval(async () => {
        try {
          const s = await optimize.getTaskStatus(taskId)
          const status = s.data?.status
          if (status === 'completed') {
            clearInterval(timer)
            setOptimizingJobId('')
            message.success('优化完成')
            router.push('/history')
          } else if (status === 'failed') {
            clearInterval(timer)
            setOptimizingJobId('')
            message.error(s.data?.progress || '优化失败')
          }
        } catch {
          clearInterval(timer)
          setOptimizingJobId('')
        }
      }, 2500)
    } catch (e: any) {
      setOptimizingJobId('')
      message.error(e?.response?.data?.detail || '提交失败')
    }
  }

  const best = result?.items?.[0]

  const summary = useMemo(() => {
    if (!result?.items?.length) return null
    const items = result.items
    return {
      strong: items.filter((i) => i.match_rate >= 80).length,
      good: items.filter((i) => i.match_rate >= 60 && i.match_rate < 80).length,
      weak: items.filter((i) => i.match_rate < 60).length,
    }
  }, [result])

  if (!token) return <AuthGate activeKey="match" />

  return (
    <AppLayout
      activeKey="match"
      title="岗位匹配罗盘"
      subtitle="一份简历同时对比全部目标岗位，先看清楚该投哪个"
    >
      <div className="app-page-enter">
        <div className="app-card" style={{ padding: 20, marginBottom: 16 }}>
          <Space wrap size={12} align="center">
            <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
              <FileTextOutlined /> 选择简历
            </span>
            <Select
              style={{ width: 280, maxWidth: '70vw' }}
              placeholder={resumeList.length ? '选择简历' : '暂无已解析简历'}
              value={resumeId || undefined}
              onChange={(v) => setResumeId(v)}
              options={resumeList.map((r) => ({
                value: r.id,
                label: r.title || (r.parsed_json?.personal_info?.name) || '未命名简历',
              }))}
            />
            <Button type="primary" icon={<AimOutlined />} loading={loading} onClick={() => runRank(resumeId)}>
              重新计算
            </Button>
            <span style={{ fontSize: 12, color: 'var(--text-quaternary)' }}>
              纯规则引擎计算，不消耗 AI 额度
            </span>
          </Space>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" tip="计算中..." /></div>
        )}

        {!loading && result && (
          <>
            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
              <Col xs={12} md={6}>
                <Card><Statistic title="已解析岗位" value={result.matched_jobs} suffix={`/ ${result.total_jobs}`} /></Card>
              </Col>
              <Col xs={12} md={6}>
                <Card>
                  <Statistic
                    title="最佳匹配"
                    value={result.best_rate}
                    suffix="分"
                    valueStyle={{ color: rateColor(result.best_rate) }}
                    prefix={best ? <Tooltip title={best.title}><RiseOutlined /></Tooltip> : undefined}
                  />
                </Card>
              </Col>
              <Col xs={12} md={6}>
                <Card><Statistic title="平均匹配" value={result.avg_rate} suffix="分" /></Card>
              </Col>
              <Col xs={12} md={6}>
                <Card>
                  <Statistic
                    title="优势岗位（≥80）"
                    value={summary?.strong ?? 0}
                    suffix="个"
                    valueStyle={{ color: 'var(--success-500)' }}
                  />
                </Card>
              </Col>
            </Row>

            {result.skipped_jobs > 0 && (
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                message={`有 ${result.skipped_jobs} 个岗位尚未解析完成，未参与本次排名`}
              />
            )}

            {best && (
              <Alert
                type="success"
                showIcon
                icon={<CheckCircleOutlined />}
                style={{ marginBottom: 16 }}
                message={
                  <span>
                    最匹配的是 <b>{best.title}</b>{best.company ? ` @ ${best.company}` : ''}（{best.match_rate} 分）
                  </span>
                }
                description={
                  best.missing_keywords.length
                    ? `还差这些关键词：${best.missing_keywords.slice(0, 8).join('、')}。补上之后匹配度还能再涨。`
                    : '关键词覆盖已经很完整，可以直接针对这个岗位做一次 AI 优化。'
                }
                action={
                  <Button size="small" type="primary" loading={optimizingJobId === best.job_id} onClick={() => goOptimize(best.job_id)}>
                    立刻优化
                  </Button>
                }
              />
            )}

            {result.items.length ? (
              <Row gutter={[16, 16]}>
                {result.items.map((item, idx) => (
                  <Col xs={24} md={12} xl={8} key={item.job_id}>
                    <div className="app-card" style={{ padding: 18, height: '100%' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {idx < 3 && (
                              <span style={{
                                width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 11, fontWeight: 700,
                                background: idx === 0 ? 'var(--warning-50)' : 'var(--gray-100)',
                                color: idx === 0 ? 'var(--warning-600)' : 'var(--text-tertiary)',
                              }}>{idx + 1}</span>
                            )}
                            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.title}
                            </span>
                            {item.is_favorite && <StarFilled style={{ color: 'var(--warning-500)', fontSize: 12 }} />}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                            {item.company || '未填写公司'} · <Tag style={{ marginInlineEnd: 0 }}>{item.category}</Tag>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 22, fontWeight: 700, color: rateColor(item.match_rate), lineHeight: 1 }}>
                            {item.match_rate}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>匹配度</div>
                        </div>
                      </div>

                      <Progress
                        percent={item.match_rate}
                        showInfo={false}
                        strokeColor={rateColor(item.match_rate)}
                        style={{ margin: '12px 0 8px' }}
                      />

                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
                        {rateLabel(item.match_rate)}
                      </div>

                      {item.missing_keywords.length ? (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6 }}>
                            <WarningOutlined /> 缺失关键词（{item.missing_keywords.length}）
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {item.missing_keywords.slice(0, 8).map((k) => (
                              <Tag key={k} color="orange" style={{ marginInlineEnd: 0, fontSize: 11 }}>{k}</Tag>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: 'var(--success-500)', marginBottom: 12 }}>
                          <CheckCircleOutlined /> 岗位关键词已全部覆盖
                        </div>
                      )}

                      <Space>
                        <Button
                          type="primary"
                          size="small"
                          icon={<ThunderboltOutlined />}
                          loading={optimizingJobId === item.job_id}
                          onClick={() => goOptimize(item.job_id)}
                        >
                          针对它优化
                        </Button>
                        <Button size="small" onClick={() => router.push('/jobs')}>查看岗位</Button>
                      </Space>
                    </div>
                  </Col>
                ))}
              </Row>
            ) : (
              <Empty description="还没有可匹配的岗位，先去上传招聘截图" />
            )}
          </>
        )}

        {!loading && !result && resumeList.length === 0 && (
          <Empty description="请先上传并成功解析一份简历">
            <Button type="primary" onClick={() => router.push('/resumes')}>去上传简历</Button>
          </Empty>
        )}
      </div>
    </AppLayout>
  )
}
