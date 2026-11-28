'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert, Button, Col, Empty, Input, Row, Segmented, Select, Space,
  Spin, Steps, Tag, Tooltip, message,
} from 'antd'
import {
  AimOutlined, BulbOutlined, CheckCircleOutlined, EnvironmentOutlined,
  FileTextOutlined, InfoCircleOutlined, RadarChartOutlined, ReloadOutlined,
  SearchOutlined, WarningOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/AppLayout'
import AuthGate from '@/components/AuthGate'
import { matching, optimize, resumes, user } from '@/lib/api'
import { getToken } from '@/lib/auth'
import JobCard from './components/JobCard'
import {
  DISCOVERY_STEPS, formatYears, jobMatchesQuery, progressStepIndex, summarizeRates,
} from '@/lib/job-discovery'
import type {
  DiscoveredJob, MatchDiscoveryResult, MatchDiscoveryTask, ResumeRecord,
} from '@/types'

const CITY_OPTIONS = ['北京', '上海', '深圳', '杭州', '广州', '成都', '武汉', '南京', '苏州', '西安']
const JOB_COUNT_OPTIONS = [3, 5, 6]

type FilterKey = 'all' | 'strong' | 'good' | 'weak'

export default function MatchBoardPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [resumeList, setResumeList] = useState<ResumeRecord[]>([])
  const [resumeId, setResumeId] = useState<string>('')
  const [direction, setDirection] = useState('')
  const [city, setCity] = useState<string | undefined>(undefined)
  const [salary, setSalary] = useState('')
  const [jobCount, setJobCount] = useState(5)

  const [result, setResult] = useState<MatchDiscoveryResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [progressText, setProgressText] = useState('')
  const [error, setError] = useState('')
  const [quota, setQuota] = useState<{ remaining: number; limit: number } | null>(null)
  const [optimizingId, setOptimizingId] = useState('')

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const optimizeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(() => {
    const t = getToken()
    if (!t) { router.push('/login'); return }
    setToken(t)
  }, [router])

  useEffect(() => () => {
    stopPolling()
    if (optimizeTimerRef.current) clearInterval(optimizeTimerRef.current)
  }, [stopPolling])

  // ── 简历列表 + 求职意向预填 ──
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
      try {
        const p = await user.getProfile()
        const exp = p.data?.expectation || {}
        // 只预填城市与薪资：期望岗位是账号级设置，换一份简历后未必适用，留空交给简历自动推断
        if (Array.isArray(exp.cities) && exp.cities.length) setCity((prev) => prev || exp.cities[0])
        if (exp.salary_range) setSalary((prev) => prev || exp.salary_range)
      } catch {
        /* 意向只是预填，取不到不影响检索 */
      }
      try {
        const q = await matching.getDiscoverQuota()
        setQuota({ remaining: q.data?.remaining ?? 0, limit: q.data?.limit ?? 0 })
      } catch {
        /* 额度展示失败不影响主流程 */
      }
    }
    load()
  }, [token])

  // ── 切换简历：先恢复最近一次结果，避免每次切换都重新花额度 ──
  useEffect(() => {
    if (!resumeId) return
    let alive = true
    stopPolling()
    setResult(null)
    setError('')
    setLoading(false)
    const loadLatest = async () => {
      try {
        const res = await matching.getLatestDiscovery(resumeId)
        if (!alive) return
        const latest = res.data?.result as MatchDiscoveryResult | null
        if (latest) {
          setResult(latest)
          const latestCity = latest.profile?.cities?.[0]
          if (latestCity) setCity(latestCity)
          if (latest.profile?.salary_expectation) setSalary(latest.profile.salary_expectation)
        }
      } catch {
        /* 没有历史结果就是空态，不报错 */
      }
    }
    loadLatest()
    return () => { alive = false }
  }, [resumeId, stopPolling])

  const pollTask = useCallback((taskId: string) => {
    let attempts = 0
    const tick = async () => {
      attempts += 1
      if (attempts > 420) {
        setError('检索超时，请稍后在历史结果中查看，或重新发起检索')
        setLoading(false)
        return
      }
      try {
        const res = await matching.getDiscoverStatus(taskId)
        const task: MatchDiscoveryTask = res.data
        setProgressText(task.progress || '')
        if (task.status === 'completed' && task.result) {
          setResult(task.result)
          setLoading(false)
          setQuery('')
          setFilter('all')
          message.success(`已检索到 ${task.result.total} 个匹配岗位`)
          return
        }
        if (task.status === 'failed') {
          setError(task.progress || '检索失败，请重试')
          setLoading(false)
          return
        }
        pollRef.current = setTimeout(tick, 2000)
      } catch (e: any) {
        if (e?.response?.status === 404) {
          setError('检索任务已过期，请重新发起检索')
          setLoading(false)
          return
        }
        pollRef.current = setTimeout(tick, 3000)
      }
    }
    tick()
  }, [])

  const startDiscovery = async () => {
    if (!resumeId) {
      message.warning('请先选择一份已解析的简历')
      return
    }
    stopPolling()
    setLoading(true)
    setError('')
    setResult(null)
    setProgressText('正在提交检索任务…')
    try {
      const res = await matching.discover({
        resume_id: resumeId,
        job_count: jobCount,
        city: city || null,
        direction: direction.trim() || null,
        salary: salary.trim() || null,
      })
      const q = res.data?.quota
      if (q) setQuota({ remaining: q.remaining, limit: q.limit })
      pollTask(res.data.task_id)
    } catch (e: any) {
      setLoading(false)
      const detail = e?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : '发起检索失败，请重试')
    }
  }

  // ── 用检索到的 JD 直接做一次优化（免去手动上传岗位） ──
  const goOptimize = async (job: DiscoveredJob) => {
    const resume = resumeList.find((r) => r.id === resumeId)
    if (!resume?.raw_text) {
      message.warning('该简历没有原始文本，无法直接优化，请先上传原件')
      return
    }
    const jobText = job.jd_text || `${job.title}\n${job.company}\n${job.location}\n${job.summary}`
    setOptimizingId(job.id)
    try {
      const res = await optimize.quick(
        resume.raw_text,
        jobText,
        `目标岗位：${job.title}${job.company ? ` @ ${job.company}` : ''}`,
      )
      const taskId = res.data?.task_id
      if (!taskId) throw new Error('未返回任务 ID')
      message.success('优化任务已提交，完成后会跳转到历史记录')
      if (optimizeTimerRef.current) clearInterval(optimizeTimerRef.current)
      optimizeTimerRef.current = setInterval(async () => {
        try {
          const s = await optimize.getTaskStatus(taskId)
          if (s.data?.status === 'completed') {
            if (optimizeTimerRef.current) clearInterval(optimizeTimerRef.current)
            setOptimizingId('')
            message.success('优化完成')
            router.push('/history')
          } else if (s.data?.status === 'failed') {
            if (optimizeTimerRef.current) clearInterval(optimizeTimerRef.current)
            setOptimizingId('')
            message.error(s.data?.progress || '优化失败')
          }
        } catch {
          if (optimizeTimerRef.current) clearInterval(optimizeTimerRef.current)
          setOptimizingId('')
        }
      }, 2500)
    } catch (e: any) {
      setOptimizingId('')
      message.error(e?.response?.data?.detail || '提交优化失败')
    }
  }

  const stats = useMemo(() => summarizeRates(result?.items || []), [result])
  const stepIndex = progressStepIndex(progressText)

  const visibleItems = useMemo(() => {
    const items = result?.items || []
    return items.filter((job) => {
      if (!jobMatchesQuery(job, query)) return false
      if (filter === 'strong') return job.match_rate >= 80
      if (filter === 'good') return job.match_rate >= 60 && job.match_rate < 80
      if (filter === 'weak') return job.match_rate < 60
      return true
    })
  }, [result, query, filter])

  const profile = result?.profile
  const canStart = !!resumeId && !loading

  if (!token) return <AuthGate activeKey="match" />

  return (
    <AppLayout
      activeKey="match"
      title="岗位匹配罗盘"
      subtitle="选一份简历，AI 自动检索市场上的相关岗位，并按技能、经验、学历、地点、薪资逐条算出适配度"
    >
      <div className="app-page-enter">
        {/* ── 检索条件 ── */}
        <div className="app-card" style={{ padding: 20, marginBottom: 20 }}>
          <Space wrap size={12} align="center">
            <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
              <FileTextOutlined /> 简历
            </span>
            <Select
              style={{ width: 250, maxWidth: '70vw' }}
              placeholder={resumeList.length ? '选择简历' : '暂无已解析简历'}
              value={resumeId || undefined}
              onChange={(v) => setResumeId(v)}
              options={resumeList.map((r) => ({
                value: r.id,
                label: r.title || r.parsed_json?.personal_info?.name || '未命名简历',
              }))}
              data-testid="match-resume-select"
            />
            <Input
              style={{ width: 180 }}
              placeholder="目标方向（可留空）"
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
              allowClear
            />
            <Select
              style={{ width: 130 }}
              placeholder="期望城市"
              value={city}
              onChange={setCity}
              allowClear
              options={CITY_OPTIONS.map((c) => ({ value: c, label: c }))}
            />
            <Input
              style={{ width: 140 }}
              placeholder="期望薪资，如 25-35K"
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
              allowClear
            />
            <Tooltip title="岗位越多生成越慢（6 个约 2-4 分钟），建议按需选择">
              <Select
                style={{ width: 118 }}
                value={jobCount}
                onChange={setJobCount}
                options={JOB_COUNT_OPTIONS.map((n) => ({ value: n, label: `${n} 个岗位` }))}
              />
            </Tooltip>
            <Button
              type="primary"
              icon={<RadarChartOutlined />}
              loading={loading}
              disabled={!canStart}
              onClick={startDiscovery}
              data-testid="match-start"
            >
              {result ? '重新检索' : 'AI 检索岗位'}
            </Button>
            {quota && quota.limit > 0 && (
              <span style={{ fontSize: 12, color: 'var(--text-quaternary)' }}>
                今日剩余 {quota.remaining}/{quota.limit} 次
              </span>
            )}
          </Space>
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-quaternary)' }}>
            <InfoCircleOutlined /> 不再需要手动上传岗位截图：检索会基于简历自动完成，匹配分为五维加权计算，
            结果仅供投递方向参考。
          </div>
        </div>

        {/* ── 进度 ── */}
        {loading && (
          <div className="app-card match-progress-card" data-testid="match-progress">
            <Steps
              current={stepIndex}
              size="small"
              responsive
              items={DISCOVERY_STEPS.map((label) => ({ title: label }))}
            />
            <div className="match-progress-hint">
              <Spin size="small" style={{ marginRight: 8 }} />
              {progressText || '正在启动检索…'}
            </div>
            <div className="match-progress-note">
              一次检索通常 30-90 秒；中途离开页面任务仍会继续，回来后可在历史结果中查看。
            </div>
          </div>
        )}

        {error && !loading && (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 20 }}
            message="检索没有完成"
            description={error}
            action={
              <Button size="small" type="primary" icon={<ReloadOutlined />} onClick={startDiscovery}>
                重试
              </Button>
            }
          />
        )}

        {/* ── 空态引导 ── */}
        {!loading && !result && !error && (
          <div className="app-card" style={{ padding: 28 }}>
            {resumeList.length === 0 ? (
              <Empty description="请先上传并成功解析一份简历，AI 才能基于它检索岗位">
                <Button type="primary" onClick={() => router.push('/resumes')}>去上传简历</Button>
              </Empty>
            ) : (
              <>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
                  不用再找 JD，AI 帮你把岗位找出来
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
                  选定简历后，系统会先提取你的技能、年限、学历与期望，再检索匹配的岗位，
                  逐条给出适配度、匹配理由、不匹配点和可执行的优化建议。
                </p>
                <div className="match-empty-steps">
                  <div className="match-empty-step">
                    <div className="n">1</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>提取简历画像</div>
                    <div style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
                      技能栈、工作年限、学历、城市与薪资期望
                    </div>
                  </div>
                  <div className="match-empty-step">
                    <div className="n">2</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>检索相关岗位</div>
                    <div style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
                      按方向与城市检索岗位，保留来源渠道
                    </div>
                  </div>
                  <div className="match-empty-step">
                    <div className="n">3</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>五维评分与建议</div>
                    <div style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
                      技能 / 经验 / 学历 / 地点 / 薪资逐项打分
                    </div>
                  </div>
                </div>
                <Space style={{ marginTop: 20 }} wrap>
                  <Button
                    type="primary"
                    size="large"
                    icon={<RadarChartOutlined />}
                    onClick={startDiscovery}
                    disabled={!canStart}
                  >
                    开始 AI 检索
                  </Button>
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                    预计 30-90 秒，消耗 1 次每日额度
                  </span>
                </Space>
              </>
            )}
          </div>
        )}

        {/* ── 结果 ── */}
        {!loading && result && (
          <>
            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
              <Col xs={12} md={6}>
                <div className="app-card" style={{ padding: 16 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>检索岗位</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {result.total}
                    <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: 4 }}>个</span>
                  </div>
                </div>
              </Col>
              <Col xs={12} md={6}>
                <div className="app-card" style={{ padding: 16 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>最高适配</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--success-500)' }}>
                    {result.best_rate}
                    <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: 4 }}>分</span>
                  </div>
                </div>
              </Col>
              <Col xs={12} md={6}>
                <div className="app-card" style={{ padding: 16 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>平均适配</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--primary-500)' }}>
                    {result.avg_rate}
                    <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: 4 }}>分</span>
                  </div>
                </div>
              </Col>
              <Col xs={12} md={6}>
                <div className="app-card" style={{ padding: 16 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>强匹配（≥80）</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--warning-500)' }}>
                    {stats.strong}
                    <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: 4 }}>个</span>
                  </div>
                </div>
              </Col>
            </Row>

            <div className="app-card" style={{ padding: 20, marginBottom: 16 }}>
              <div className="match-result-head">
                <div style={{ minWidth: 0 }}>
                  <Space size={8} wrap>
                    <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
                      基于「{result.resume_title || '当前简历'}」的检索结果
                    </span>
                    <Tag color={result.mode === 'web' ? 'blue' : 'purple'} style={{ marginInlineEnd: 0 }}>
                      {result.mode_label}
                    </Tag>
                    {profile?.target_titles?.slice(0, 1).map((t) => (
                      <Tag key={t} style={{ marginInlineEnd: 0 }}>{t}</Tag>
                    ))}
                  </Space>
                  <div className="match-profile-chips">
                    <Tag icon={<AimOutlined />} style={{ marginInlineEnd: 0 }}>
                      {formatYears(profile?.years_experience ?? 0)}经验
                    </Tag>
                    {profile?.education?.degree && (
                      <Tag style={{ marginInlineEnd: 0 }}>{profile.education.degree}</Tag>
                    )}
                    {(profile?.cities || []).map((c) => (
                      <Tag key={c} icon={<EnvironmentOutlined />} style={{ marginInlineEnd: 0 }}>{c}</Tag>
                    ))}
                    {(profile?.skills || []).slice(0, 6).map((s) => (
                      <Tag key={s} style={{ marginInlineEnd: 0 }}>{s}</Tag>
                    ))}
                  </div>
                </div>
              </div>

              {result.market_summary && (
                <Alert
                  type="info"
                  showIcon
                  icon={<BulbOutlined />}
                  style={{ marginBottom: 12 }}
                  message="市场判断"
                  description={
                    <div>
                      {result.market_summary}
                      {!!result.search_keywords?.length && (
                        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>检索关键词：</span>
                          {result.search_keywords.map((k) => (
                            <Tag key={k} style={{ marginInlineEnd: 0, fontSize: 11 }}>{k}</Tag>
                          ))}
                        </div>
                      )}
                    </div>
                  }
                />
              )}

              <Alert
                type="warning"
                showIcon
                message={`数据口径：${result.mode_label}`}
                description={result.notice}
                style={{ fontSize: 12 }}
              />

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14, alignItems: 'center' }}>
                <Segmented
                  value={filter}
                  onChange={(v) => setFilter(v as FilterKey)}
                  options={[
                    { value: 'all', label: `全部 ${result.total}` },
                    { value: 'strong', label: `强匹配 ${stats.strong}` },
                    { value: 'good', label: `较匹配 ${stats.good}` },
                    { value: 'weak', label: `待补差距 ${stats.weak}` },
                  ]}
                />
                <Input
                  style={{ width: 240, maxWidth: '100%' }}
                  prefix={<SearchOutlined />}
                  placeholder="筛选岗位 / 技能 / 城市"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  allowClear
                />
                <span style={{ fontSize: 11, color: 'var(--text-quaternary)' }}>
                  检索于 {result.generated_at ? new Date(result.generated_at).toLocaleString('zh-CN') : '刚刚'}
                </span>
              </div>
            </div>

            {visibleItems.length ? (
              // 注意：这里必须用 CSS Grid 而不是 Row/Col + display:flex。
              // Col 上叠自定义 style 会让 antd 的纵向 gutter 失效，且 height:100%
              // 在内容型高度的 flex 链上解析不稳定，卡片会溢出所属列、压到下一行。
              <div className="match-grid" data-testid="match-grid">
                {visibleItems.map((job, idx) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    index={idx}
                    optimizing={optimizingId === job.id}
                    onOptimize={goOptimize}
                  />
                ))}
              </div>
            ) : (
              <Empty description="当前筛选条件下没有岗位，换个关键词或切回「全部」">
                <Button onClick={() => { setQuery(''); setFilter('all') }}>清除筛选</Button>
              </Empty>
            )}

            <div style={{ textAlign: 'center', marginTop: 18 }}>
              <Button icon={<ReloadOutlined />} loading={loading} onClick={startDiscovery}>
                换一批岗位
              </Button>
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-quaternary)' }}>
                会重新消耗 1 次每日额度；调整上方方向 / 城市后再检索，结果会更贴近目标
              </div>
            </div>

            <div style={{ marginTop: 18, fontSize: 11, color: 'var(--text-quaternary)', lineHeight: 1.8 }}>
              <CheckCircleOutlined /> 适配分 = 技能 30% + 经验 25% + 薪资 20% + 地点 15% + 学历 10%；
              「匹配理由 / 不匹配点 / 优化建议」由模型结合简历事实给出，投递前请自行核实岗位信息。
              {result.mode === 'ai' && (
                <span> 当前未接入实时招聘接口，岗位为公司匿名化的代表性画像，不作为真实在招岗位承诺。</span>
              )}
              <span style={{ display: 'block', marginTop: 4 }}>
                <WarningOutlined /> 若需实网检索，请在 backend/.env 配置 TAVILY_API_KEY 或 SERPER_API_KEY 后重启后端。
              </span>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  )
}
