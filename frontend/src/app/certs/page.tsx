'use client'

import React, { useEffect, useState } from 'react'
import {
  Button, Spin, Row, Col, message, Tag, Space, Select, Empty, Input, Alert,
} from 'antd'
import {
  SafetyCertificateOutlined, LinkOutlined, TrophyOutlined,
  FileTextOutlined, AimOutlined, ClockCircleOutlined, WalletOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/AppLayout'
import AuthGate from '@/components/AuthGate'
import { certs, jobs, resumes } from '@/lib/api'
import { getToken } from '@/lib/auth'
import type { CertRecommendResult, ResumeRecord } from '@/types'

interface JobOption {
  id: string
  title?: string | null
  company?: string | null
  parsed_job_json?: Record<string, unknown> | null
}

const TIME_BUDGETS = ['3个月内', '半年', '一年']
const BUDGETS = ['免费', '低费用', '不限']

const CATEGORY_COLOR: Record<string, string> = {
  证书: 'blue',
  课程: 'geekblue',
  竞赛: 'gold',
  其他: 'default',
}

export default function CertRecommendPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [resumeList, setResumeList] = useState<ResumeRecord[]>([])
  const [jobList, setJobList] = useState<JobOption[]>([])
  const [resumeId, setResumeId] = useState<string>('')
  const [jobId, setJobId] = useState<string>('')
  const [existingCerts, setExistingCerts] = useState('')
  const [timeBudget, setTimeBudget] = useState<string | undefined>(undefined)
  const [budget, setBudget] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(true)
  const [result, setResult] = useState<CertRecommendResult | null>(null)

  useEffect(() => {
    const t = getToken()
    if (!t) { router.push('/login'); return }
    setToken(t)
  }, [router])

  useEffect(() => {
    if (!token) return
    const load = async () => {
      try {
        const [rRes, jRes] = await Promise.all([
          resumes.list().catch(() => ({ data: [] as ResumeRecord[] })),
          jobs.list().catch(() => ({ data: [] as JobOption[] })),
        ])
        const rs = ((rRes.data || []) as ResumeRecord[]).filter((r) => !!r.parsed_json)
        const js = ((jRes.data || []) as JobOption[]).filter((j) => !!j.parsed_job_json)
        setResumeList(rs)
        setJobList(js)
        const p = rs.find((r) => r.is_primary) || rs[0]
        if (p) setResumeId(p.id)
      } catch {
        message.error('加载数据失败')
      } finally {
        setLoadingData(false)
      }
    }
    load()
  }, [token])

  const generate = async () => {
    if (!resumeId) { message.warning('请先选择一份已解析的简历'); return }
    if (!jobId) { message.warning('请先选择一个已解析的目标岗位'); return }
    setLoading(true)
    setResult(null)
    try {
      const res = await certs.recommend({
        resume_id: resumeId,
        job_id: jobId,
        existing_certifications: existingCerts.trim() || undefined,
        time_budget: timeBudget,
        budget,
      })
      setResult(res.data as CertRecommendResult)
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      message.error(err?.response?.data?.detail || '推荐生成失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  const { gap_analysis: gap, recommendations, learning_path: path } = result || {}

  return (
    <AppLayout activeKey="certs" title="证书推荐" subtitle="基于简历与目标岗位的差距，AI 推荐最合适的证书与学习方向">
      {token === null ? (
        <AuthGate activeKey="certs" />
      ) : loadingData ? (
        <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
      ) : (
        <>
          {/* 输入区 */}
          <div className="app-card" style={{ marginBottom: 20 }}>
            <Row gutter={[16, 12]} align="middle">
              <Col xs={24} md={8}>
                <Select
                  style={{ width: '100%' }}
                  placeholder={resumeList.length ? '选择简历' : '暂无已解析简历'}
                  value={resumeId || undefined}
                  onChange={setResumeId}
                  data-testid="certs-resume-select"
                  options={resumeList.map((r) => ({
                    value: r.id,
                    label: r.title || r.parsed_json?.personal_info?.name || '未命名简历',
                  }))}
                />
              </Col>
              <Col xs={24} md={8}>
                <Select
                  style={{ width: '100%' }}
                  placeholder={jobList.length ? '选择目标岗位' : '暂无已解析岗位'}
                  value={jobId || undefined}
                  onChange={setJobId}
                  data-testid="certs-job-select"
                  options={jobList.map((j) => ({
                    value: j.id,
                    label: `${j.title || '未命名岗位'}${j.company ? ` @ ${j.company}` : ''}`,
                  }))}
                />
              </Col>
              <Col xs={24} md={8}>
                <Input
                  allowClear
                  maxLength={500}
                  placeholder="已持有的证书（可选，避免重复推荐）"
                  value={existingCerts}
                  onChange={(e) => setExistingCerts(e.target.value)}
                />
              </Col>
              <Col xs={12} md={5}>
                <Select
                  style={{ width: '100%' }}
                  allowClear
                  placeholder={<span><ClockCircleOutlined /> 学习时间投入</span>}
                  value={timeBudget}
                  onChange={setTimeBudget}
                  options={TIME_BUDGETS.map((t) => ({ value: t, label: t }))}
                />
              </Col>
              <Col xs={12} md={5}>
                <Select
                  style={{ width: '100%' }}
                  allowClear
                  placeholder={<span><WalletOutlined /> 预算偏好</span>}
                  value={budget}
                  onChange={setBudget}
                  options={BUDGETS.map((b) => ({ value: b, label: b }))}
                />
              </Col>
              <Col xs={24} md={14} style={{ textAlign: 'right' }}>
                <Button
                  type="primary"
                  icon={<SafetyCertificateOutlined />}
                  loading={loading}
                  onClick={generate}
                  disabled={!resumeList.length || !jobList.length}
                  data-testid="certs-generate-btn"
                >
                  生成证书推荐
                </Button>
              </Col>
            </Row>
            {!resumeList.length || !jobList.length ? (
              <Alert
                style={{ marginTop: 12 }}
                type="info"
                showIcon
                message={!resumeList.length ? '请先在「简历」页上传并等待解析完成' : '请先在「岗位库」上传岗位并等待解析完成'}
              />
            ) : null}
          </div>

          {loading && (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <Spin size="large" />
              <p style={{ marginTop: 16, color: 'var(--text-secondary)' }}>
                AI 正在分析简历与岗位差距，生成推荐中…
                <br />
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                  内容较详细，可能需要 1~5 分钟，请勿关闭页面
                </span>
              </p>
            </div>
          )}

          {!loading && !result && (
            <Empty
              description="选择简历与岗位后点击「生成证书推荐」"
              style={{ padding: 60 }}
            />
          )}

          {/* 差距分析 */}
          {!loading && gap && (
            <div className="app-card" style={{ marginBottom: 20 }} data-testid="certs-gap-analysis">
              <Space style={{ marginBottom: 12 }}>
                <AimOutlined style={{ color: 'var(--primary-500)' }} />
                <strong>差距分析</strong>
              </Space>
              <Row gutter={[16, 12]}>
                <Col xs={24} md={8}>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 6 }}>
                    <FileTextOutlined /> 简历核心技能
                  </div>
                  <Space size={[6, 6]} wrap>
                    {gap.resume_skills.length
                      ? gap.resume_skills.map((s, i) => <Tag key={i} color="green">{s}</Tag>)
                      : <span style={{ color: 'var(--text-tertiary)' }}>未识别到</span>}
                  </Space>
                </Col>
                <Col xs={24} md={8}>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 6 }}>
                    <AimOutlined /> 岗位核心要求
                  </div>
                  <Space size={[6, 6]} wrap>
                    {gap.jd_requirements.length
                      ? gap.jd_requirements.map((s, i) => <Tag key={i} color="blue">{s}</Tag>)
                      : <span style={{ color: 'var(--text-tertiary)' }}>未识别到</span>}
                  </Space>
                </Col>
                <Col xs={24} md={8}>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 6 }}>
                    <TrophyOutlined /> 差距项
                  </div>
                  <Space size={[6, 6]} wrap>
                    {gap.gaps.length
                      ? gap.gaps.map((s, i) => <Tag key={i} color="orange">{s}</Tag>)
                      : <span style={{ color: 'var(--text-tertiary)' }}>未识别到明显差距</span>}
                  </Space>
                </Col>
              </Row>
            </div>
          )}

          {/* 推荐卡片 */}
          {!loading && recommendations && recommendations.length > 0 && (
            <>
              <Row gutter={[20, 20]} style={{ marginBottom: 20 }}>
                {recommendations.map((r, idx) => (
                  <Col xs={24} md={12} xl={8} key={idx} style={{ display: 'flex' }}>
                    <div
                      className="app-card"
                      style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}
                      data-testid={`certs-rec-item-${idx}`}
                    >
                      <Space size={8} wrap>
                        <Tag color={CATEGORY_COLOR[r.category] || 'default'}>{r.category}</Tag>
                        <Tag>{r.level}</Tag>
                        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                          优先级 {r.priority}
                        </span>
                      </Space>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{r.title}</div>
                      {r.issuer && (
                        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                          颁发机构：{r.issuer}
                        </div>
                      )}
                      <Space size={[12, 6]} wrap style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        <span><WalletOutlined /> {r.estimated_cost || '费用未知'}</span>
                        <span><ClockCircleOutlined /> {r.estimated_duration || '周期未知'}</span>
                      </Space>
                      <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)', flex: 1 }}>
                        {r.why}
                      </div>
                      {r.link ? (
                        <Button
                          size="small"
                          icon={<LinkOutlined />}
                          href={r.link}
                          target="_blank"
                          style={{ alignSelf: 'flex-start' }}
                        >
                          官方链接
                        </Button>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                          请自行搜索官方报名入口
                        </span>
                      )}
                    </div>
                  </Col>
                ))}
              </Row>

              {/* 学习路径 */}
              {path && path.length > 0 && (
                <div className="app-card" data-testid="certs-learning-path">
                  <Space style={{ marginBottom: 12 }}>
                    <TrophyOutlined style={{ color: 'var(--warning-500)' }} />
                    <strong>建议学习路径</strong>
                  </Space>
                  <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 2 }}>
                    {path.map((step, i) => (
                      <li key={i} style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{step}</li>
                    ))}
                  </ol>
                </div>
              )}
            </>
          )}
        </>
      )}
    </AppLayout>
  )
}
