'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  Button, Spin, Row, Col, message, Tag, Space, Select, Empty,
  Progress, Card, Alert, List, Divider,
} from 'antd'
import {
  SafetyCertificateOutlined, CheckCircleOutlined, CloseCircleOutlined,
  WarningOutlined, InfoCircleOutlined, FileTextOutlined, FileSearchOutlined,
  ThunderboltOutlined, BulbOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/AppLayout'
import AuthGate from '@/components/AuthGate'
import { ats, resumes, jobs, optimize } from '@/lib/api'
import { getToken } from '@/lib/auth'
import type { AtsCheckResult, ResumeRecord, OptimizeResult } from '@/types'

interface JobOption {
  id: string
  title?: string | null
  company?: string | null
  parsed_job_json?: Record<string, unknown> | null
}

const LEVEL_META: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  error: { color: 'var(--error-500)', icon: <CloseCircleOutlined />, label: '致命' },
  warn: { color: 'var(--warning-500)', icon: <WarningOutlined />, label: '警告' },
  info: { color: 'var(--primary-500)', icon: <InfoCircleOutlined />, label: '提示' },
}

function scoreColor(score: number): string {
  if (score >= 85) return 'var(--success-500)'
  if (score >= 70) return 'var(--primary-500)'
  if (score >= 50) return 'var(--warning-500)'
  return 'var(--error-500)'
}

export default function AtsPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)

  const [resumeList, setResumeList] = useState<ResumeRecord[]>([])
  const [jobList, setJobList] = useState<JobOption[]>([])
  const [optList, setOptList] = useState<OptimizeResult[]>([])

  const [sourceType, setSourceType] = useState<'resume' | 'optimized'>('resume')
  const [resumeId, setResumeId] = useState<string>('')
  const [optId, setOptId] = useState<string>('')
  const [jobId, setJobId] = useState<string | undefined>(undefined)

  const [result, setResult] = useState<AtsCheckResult | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const t = getToken()
    if (!t) { router.push('/login'); return }
    setToken(t)
  }, [router])

  useEffect(() => {
    if (!token) return
    const load = async () => {
      try {
        const [rRes, jRes, oRes] = await Promise.all([
          resumes.list().catch(() => ({ data: [] as ResumeRecord[] })),
          jobs.list().catch(() => ({ data: [] as JobOption[] })),
          optimize.list().catch(() => ({ data: [] as OptimizeResult[] })),
        ])
        const rs: ResumeRecord[] = ((rRes.data || []) as ResumeRecord[]).filter((r) => !!r.parsed_json)
        setResumeList(rs)
        setJobList((jRes.data || []) as JobOption[])
        setOptList(((oRes.data || []) as OptimizeResult[]).filter((o) => !!o.optimized_json))
        if (rs.length) {
          const p = rs.find((r) => r.is_primary) || rs[0]
          setResumeId(p.id)
        }
      } catch {
        message.error('加载数据失败')
      }
    }
    load()
  }, [token])

  const runCheck = async () => {
    let resumeJson: Record<string, unknown> | null = null
    if (sourceType === 'resume') {
      const picked = resumeList.find((r) => r.id === resumeId)?.parsed_json
      resumeJson = (picked as unknown as Record<string, unknown>) || null
      if (!resumeJson) { message.warning('请选择一份已解析的简历'); return }
    } else {
      const opt = optList.find((o) => o.id === optId)
      resumeJson = (opt?.optimized_json as unknown as Record<string, unknown>) || null
      if (!resumeJson) { message.warning('请选择一条优化记录'); return }
    }
    const jobJson = jobId ? jobList.find((j) => j.id === jobId)?.parsed_job_json || null : null

    setLoading(true)
    setResult(null)
    try {
      const res = await ats.check(resumeJson, jobJson)
      setResult(res.data)
    } catch (e: any) {
      message.error(e?.response?.data?.detail || '检查失败')
    } finally {
      setLoading(false)
    }
  }

  // 选择源后自动跑一次，减少一次点击
  useEffect(() => {
    if (!token) return
    if (sourceType === 'resume' && resumeId) runCheck()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, sourceType, resumeId, jobId])

  const grouped = useMemo(() => {
    const issues = result?.issues || []
    return {
      error: issues.filter((i) => i.level === 'error'),
      warn: issues.filter((i) => i.level === 'warn'),
      info: issues.filter((i) => i.level === 'info'),
    }
  }, [result])

  if (!token) return <AuthGate activeKey="ats" />

  return (
    <AppLayout
      activeKey="ats"
      title="ATS 简历体检"
      subtitle="按企业筛选系统的规则检查机器可读性，避免因排版或缺失模块被漏掉"
    >
      <div className="app-page-enter">
        <div className="app-card" style={{ padding: 20, marginBottom: 16 }}>
          <Space wrap size={12} align="center">
            <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>检查对象</span>
            <Select
              style={{ width: 120 }}
              value={sourceType}
              onChange={(v) => { setSourceType(v); setResult(null) }}
              options={[
                { value: 'resume', label: '原始简历' },
                { value: 'optimized', label: '优化结果' },
              ]}
            />
            {sourceType === 'resume' ? (
              <Select
                style={{ width: 240, maxWidth: '60vw' }}
                placeholder={resumeList.length ? '选择简历' : '暂无已解析简历'}
                value={resumeId || undefined}
                onChange={setResumeId}
                options={resumeList.map((r) => ({
                  value: r.id,
                  label: r.title || (r.parsed_json?.personal_info?.name) || '未命名简历',
                }))}
              />
            ) : (
              <Select
                style={{ width: 260, maxWidth: '60vw' }}
                placeholder={optList.length ? '选择优化记录' : '暂无优化记录'}
                value={optId || undefined}
                onChange={(v) => { setOptId(v); setResult(null) }}
                showSearch
                optionFilterProp="label"
                options={optList.map((o) => ({
                  value: o.id,
                  label: `${o.job_title || '优化记录'}${o.company ? ' @ ' + o.company : ''}${o.match_score != null ? ` · ${o.match_score}分` : ''}`,
                }))}
              />
            )}

            <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
              <FileSearchOutlined /> 对照岗位
            </span>
            <Select
              style={{ width: 220, maxWidth: '60vw' }}
              placeholder="可选，勾选后分析关键词覆盖"
              value={jobId}
              onChange={setJobId}
              allowClear
              showSearch
              optionFilterProp="label"
              options={jobList
                .filter((j) => j.parsed_job_json)
                .map((j) => ({
                  value: j.id,
                  label: [j.title || '未命名岗位', j.company].filter(Boolean).join(' @ '),
                }))}
            />

            <Button type="primary" icon={<SafetyCertificateOutlined />} loading={loading} onClick={runCheck}>
              开始体检
            </Button>
          </Space>
        </div>

        {loading && <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" tip="检查中..." /></div>}

        {!loading && result && (
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={8}>
              <div className="app-card" style={{ padding: 24, textAlign: 'center' }}>
                <Progress
                  type="dashboard"
                  percent={result.score}
                  strokeColor={scoreColor(result.score)}
                  format={(p) => <span style={{ fontSize: 30, fontWeight: 700, color: scoreColor(result.score) }}>{p}</span>}
                />
                <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 6 }}>ATS 友好度得分</div>
                <div style={{ marginTop: 12 }}>
                  {result.passed
                    ? <Tag color="success" icon={<CheckCircleOutlined />}>可以放心投递</Tag>
                    : <Tag color="warning" icon={<WarningOutlined />}>建议先修复再投递</Tag>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 12, lineHeight: 1.7, textAlign: 'left' }}>
                  {result.score >= 85 && '简历结构完整、关键词覆盖良好，机器解析基本不会丢信息。'}
                  {result.score >= 70 && result.score < 85 && '整体可用，但仍有会被扣分的地方，按右侧建议调整后更稳。'}
                  {result.score >= 50 && result.score < 70 && '存在明显结构或关键词缺口，建议优化后再投递。'}
                  {result.score < 50 && '当前版本在机器筛选环节风险较高，建议先做一次 AI 优化。'}
                </div>
                <Button
                  type="primary"
                  icon={<ThunderboltOutlined />}
                  style={{ marginTop: 14 }}
                  onClick={() => router.push('/')}
                >
                  去 AI 优化
                </Button>
              </div>
            </Col>

            <Col xs={24} lg={16}>
              <div className="app-card" style={{ padding: 20 }}>
                <div className="app-section-title" style={{ marginBottom: 12 }}>
                  <WarningOutlined style={{ color: 'var(--warning-500)' }} /> 问题清单（{result.issues.length}）
                </div>
                {result.issues.length ? (
                  <List
                    dataSource={result.issues}
                    renderItem={(issue) => {
                      const meta = LEVEL_META[issue.level] || LEVEL_META.info
                      return (
                        <List.Item style={{ padding: '10px 0', borderBottom: '1px solid var(--border-light)' }}>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                            <span style={{ color: meta.color, marginTop: 2, fontSize: 15 }}>{meta.icon}</span>
                            <div style={{ flex: 1 }}>
                              <Tag color={issue.level === 'error' ? 'red' : issue.level === 'warn' ? 'orange' : 'blue'} style={{ marginInlineEnd: 6 }}>
                                {meta.label}
                              </Tag>
                              <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{issue.message}</span>
                            </div>
                          </div>
                        </List.Item>
                      )
                    }}
                  />
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有发现问题，简历结构很规范" />
                )}

                {!!result.suggestions?.length && (
                  <>
                    <Divider style={{ margin: '18px 0 12px' }} />
                    <div className="app-section-title" style={{ marginBottom: 10 }}>
                      <BulbOutlined style={{ color: 'var(--warning-500)' }} /> 修改建议
                    </div>
                    <ol style={{ margin: 0, paddingLeft: 20, color: 'var(--text-primary)', fontSize: 13, lineHeight: 2 }}>
                      {result.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                    </ol>
                  </>
                )}
              </div>

              {result.keyword_coverage && (
                <div className="app-card" style={{ padding: 20, marginTop: 16 }}>
                  <div className="app-section-title" style={{ marginBottom: 12 }}>
                    <FileTextOutlined style={{ color: 'var(--primary-600)' }} /> 岗位关键词覆盖
                  </div>
                  <Row gutter={[16, 16]}>
                    <Col xs={24} md={12}>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8 }}>
                        已覆盖（{result.keyword_coverage.covered.length}）
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {result.keyword_coverage.covered.length
                          ? result.keyword_coverage.covered.map((k) => <Tag key={k} color="success">{k}</Tag>)
                          : <span style={{ fontSize: 12, color: 'var(--text-quaternary)' }}>无</span>}
                      </div>
                    </Col>
                    <Col xs={24} md={12}>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8 }}>
                        缺失（{result.keyword_coverage.missing.length}）
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {result.keyword_coverage.missing.length
                          ? result.keyword_coverage.missing.map((k) => <Tag key={k} color="orange">{k}</Tag>)
                          : <span style={{ fontSize: 12, color: 'var(--success-500)' }}>已全部覆盖</span>}
                      </div>
                    </Col>
                  </Row>
                </div>
              )}
            </Col>
          </Row>
        )}

        {!loading && !result && (
          <Alert
            type="info"
            showIcon
            message="选择一个检查对象后点击「开始体检」，系统会从联系信息、必要板块、关键词覆盖、排版复杂度等维度打分。"
          />
        )}

        {(grouped.error.length > 0 || grouped.warn.length > 0) && result && (
          <div style={{ height: 8 }} />
        )}
      </div>
    </AppLayout>
  )
}
