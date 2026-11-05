'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  Button, Spin, Row, Col, message, Select, Input, Alert, Collapse,
} from 'antd'
import {
  SafetyCertificateOutlined, LinkOutlined, TrophyOutlined,
  FileTextOutlined, AimOutlined, ClockCircleOutlined, WalletOutlined,
  BulbOutlined, CheckCircleFilled, ReloadOutlined, RocketOutlined,
  BookOutlined, ThunderboltOutlined, SearchOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/AppLayout'
import AuthGate from '@/components/AuthGate'
import { certs, jobs, resumes } from '@/lib/api'
import { getToken } from '@/lib/auth'
import type { CertCatalogItem, CertCatalogResult, CertRecommendResult, ResumeRecord } from '@/types'

interface JobOption {
  id: string
  title?: string | null
  company?: string | null
  parsed_job_json?: Record<string, unknown> | null
}

const TIME_BUDGETS = ['3个月内', '半年', '一年']
const BUDGETS = ['免费', '低费用', '不限']

/** 类别 → 配色（证书蓝 / 课程紫 / 竞赛橙 / 其他灰） */
const CATEGORY_META: Record<string, { color: string; bg: string }> = {
  证书: { color: '#007AFF', bg: 'rgba(0, 122, 255, 0.12)' },
  课程: { color: '#5E5CE6', bg: 'rgba(94, 92, 230, 0.12)' },
  竞赛: { color: '#FF9500', bg: 'rgba(255, 149, 0, 0.14)' },
  其他: { color: '#8E8E93', bg: 'rgba(142, 142, 147, 0.14)' },
}

const LEVEL_META: Record<string, { color: string; bg: string }> = {
  入门级: { color: '#34C759', bg: 'rgba(52, 199, 89, 0.12)' },
  中级: { color: '#007AFF', bg: 'rgba(0, 122, 255, 0.12)' },
  高级: { color: '#AF52DE', bg: 'rgba(175, 82, 222, 0.12)' },
}

function FieldLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="certs-field-label">
      {icon}
      <span>{children}</span>
    </div>
  )
}

/**
 * 差距分析的条目渲染：短词（≤12 字）用胶囊标签，长句用带圆点的整行文本。
 * LLM 常常把差距写成整句话，全部塞进胶囊会挤成一团、难以阅读。
 */
function GapItems({
  items, tone, empty,
}: { items: string[]; tone: 'skill' | 'jd' | 'gap'; empty: string }) {
  if (!items.length) return <span className="certs-muted">{empty}</span>
  // 保持原始顺序：短词渲染成胶囊，长句独占一行（flex-basis:100% 会自然换行）
  return (
    <div className="certs-gap-items">
      {items.map((s, i) => (
        s.length <= 12
          ? <span key={i} className={`certs-tag is-${tone}`}>{s}</span>
          : (
            <div key={i} className={`certs-gap-line is-${tone}`}>
              <i aria-hidden />
              <span>{s}</span>
            </div>
          )
      ))}
    </div>
  )
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
  // 内置证书资源库
  const [catalog, setCatalog] = useState<CertCatalogResult | null>(null)
  const [catalogCategory, setCatalogCategory] = useState<string>('')
  const [catalogSearch, setCatalogSearch] = useState('')
  const [errorText, setErrorText] = useState<string>('')

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
        if (js[0]) setJobId(js[0].id)
      } catch {
        message.error('加载简历 / 岗位数据失败')
      } finally {
        setLoadingData(false)
      }
    }
    load()
    // 资源库独立加载（失败不打扰 AI 推荐主流程）
    certs.catalog()
      .then((res) => setCatalog(res.data as CertCatalogResult))
      .catch(() => setCatalog({ categories: [], items: [] }))
  }, [token])

  const generate = async () => {
    if (!resumeId) { message.warning('请先选择一份已解析的简历'); return }
    if (!jobId) { message.warning('请先选择一个已解析的目标岗位'); return }
    setLoading(true)
    setResult(null)
    setErrorText('')
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
      const err = e as { response?: { status?: number; data?: { detail?: string } } }
      const detail = err?.response?.data?.detail
      const status = err?.response?.status
      const text = detail
        || (status === 429 ? '操作过于频繁，请稍等片刻再试'
          : status === 503 ? 'AI 服务暂时不可用，请稍后重试'
            : status === 402 ? 'AI 额度已用尽，请稍后重试'
              : '推荐生成失败，请稍后重试')
      setErrorText(text)
      // toast 只提示「失败」+ key 去重；详细原因放在页内 Alert，避免长文案遮住页头
      message.error({ content: '生成失败，详情见下方提示', key: 'certs-error' })
    } finally {
      setLoading(false)
    }
  }

  const reset = () => { setResult(null); setErrorText('') }

  // 资源库：按分类 + 关键词过滤（名称/机构/说明）
  const catalogItems: CertCatalogItem[] = useMemo(() => {
    const all = catalog?.items ?? []
    const kw = catalogSearch.trim().toLowerCase()
    return all.filter((it) => {
      if (catalogCategory && it.category !== catalogCategory) return false
      if (!kw) return true
      return (
        it.name.toLowerCase().includes(kw)
        || (it.issuer || '').toLowerCase().includes(kw)
        || (it.desc || '').toLowerCase().includes(kw)
      )
    })
  }, [catalog, catalogCategory, catalogSearch])

  const catalogGroups = useMemo(() => {
    const groups: Array<{ category: string; items: CertCatalogItem[] }> = []
    for (const it of catalogItems) {
      let g = groups.find((x) => x.category === it.category)
      if (!g) { g = { category: it.category, items: [] }; groups.push(g) }
      g.items.push(it)
    }
    return groups
  }, [catalogItems])

  const gap = result?.gap_analysis
  const recs = result?.recommendations ?? []
  const path = result?.learning_path ?? []
  const canGenerate = !!resumeId && !!jobId && !loading

  return (
    <AppLayout
      activeKey="certs"
      title="证书推荐"
      subtitle="基于简历与目标岗位的差距，AI 推荐最合适的证书与学习方向"
    >
      {token === null ? (
        <AuthGate activeKey="certs" />
      ) : loadingData ? (
        <div className="certs-center"><Spin size="large" /></div>
      ) : (
        <div className="certs-page">
          {/* ── 顶部英雄区 ── */}
          <section className="certs-hero">
            <div className="certs-hero-glow" aria-hidden />
            <div className="certs-hero-icon"><SafetyCertificateOutlined /></div>
            <div className="certs-hero-body">
              <h2>生成你的证书路线图</h2>
              <p>对比简历能力与岗位 JD，找出关键差距，给出可执行的考证 / 学习顺序</p>
            </div>
            <div className="certs-hero-stats">
              <div className="certs-stat">
                <strong>{resumeList.length}</strong>
                <span>已解析简历</span>
              </div>
              <div className="certs-stat-divider" />
              <div className="certs-stat">
                <strong>{jobList.length}</strong>
                <span>已解析岗位</span>
              </div>
            </div>
          </section>

          {/* ── 输入面板 ── */}
          <section className="app-card certs-panel">
            <div className="certs-panel-head">
              <span className="certs-panel-title"><RocketOutlined /> 选择分析对象</span>
              <span className="certs-panel-tip">简历与岗位各需完成解析</span>
            </div>

            <Row gutter={[16, 16]}>
              <Col xs={24} md={12}>
                <FieldLabel icon={<FileTextOutlined />}>简历</FieldLabel>
                <Select
                  style={{ width: '100%' }}
                  size="large"
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
              <Col xs={24} md={12}>
                <FieldLabel icon={<AimOutlined />}>目标岗位</FieldLabel>
                <Select
                  style={{ width: '100%' }}
                  size="large"
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
              <Col xs={24}>
                <FieldLabel icon={<BookOutlined />}>已持有的证书（可选）</FieldLabel>
                <Input
                  allowClear
                  size="large"
                  maxLength={500}
                  placeholder="例如：CET-6、软考中级、阿里云 ACA —— 填写后可避免重复推荐"
                  value={existingCerts}
                  onChange={(e) => setExistingCerts(e.target.value)}
                />
              </Col>
              <Col xs={12} md={8}>
                <FieldLabel icon={<ClockCircleOutlined />}>学习时间投入</FieldLabel>
                <Select
                  style={{ width: '100%' }}
                  size="large"
                  allowClear
                  placeholder="不限"
                  value={timeBudget}
                  onChange={setTimeBudget}
                  options={TIME_BUDGETS.map((t) => ({ value: t, label: t }))}
                />
              </Col>
              <Col xs={12} md={8}>
                <FieldLabel icon={<WalletOutlined />}>预算偏好</FieldLabel>
                <Select
                  style={{ width: '100%' }}
                  size="large"
                  allowClear
                  placeholder="不限"
                  value={budget}
                  onChange={setBudget}
                  options={BUDGETS.map((b) => ({ value: b, label: b }))}
                />
              </Col>
              <Col xs={24} md={8} className="certs-submit-col">
                <Button
                  type="primary"
                  size="large"
                  className="certs-submit"
                  icon={<ThunderboltOutlined />}
                  loading={loading}
                  onClick={generate}
                  disabled={!canGenerate}
                  data-testid="certs-generate-btn"
                >
                  {result ? '重新生成' : '生成证书推荐'}
                </Button>
              </Col>
            </Row>

            {!resumeList.length || !jobList.length ? (
              <Alert
                className="certs-alert"
                type="info"
                showIcon
                message={!resumeList.length ? '请先在「简历」页上传并等待解析完成' : '请先在「岗位库」上传岗位并等待解析完成'}
              />
            ) : null}

            {errorText ? (
              <Alert
                className="certs-alert"
                type="error"
                showIcon
                closable
                message="生成失败"
                description={errorText}
                onClose={() => setErrorText('')}
                action={
                  <Button size="small" icon={<ReloadOutlined />} onClick={generate}>重试</Button>
                }
              />
            ) : null}
          </section>

          {/* ── 加载中 ── */}
          {loading && (
            <section className="app-card certs-loading">
              <div className="certs-pulse"><SafetyCertificateOutlined /></div>
              <h3>AI 正在生成你的证书路线图</h3>
              <p className="certs-loading-sub">已读取简历与岗位 JD，正在做差距分析并匹配证书库…</p>
              <div className="certs-steps">
                <span className="is-done"><CheckCircleFilled /> 解析简历</span>
                <span className="is-done"><CheckCircleFilled /> 读取岗位要求</span>
                <span className="is-active"><i className="certs-dot" /> 匹配证书与学习资源</span>
              </div>
              <div className="certs-loading-hint">
                <ClockCircleOutlined /> 内容较详细，通常 1~5 分钟、最长约 10 分钟，请勿关闭页面
              </div>
            </section>
          )}

          {/* ── 空状态 ── */}
          {!loading && !result && !errorText && (
            <section className="certs-empty">
              <div className="certs-empty-icon"><BulbOutlined /></div>
              <h3>三步得到你的考证方案</h3>
              <p>选择简历与目标岗位，AI 会先找出能力差距，再给出有优先级的证书与学习路径</p>
              <div className="certs-empty-steps">
                <div><span>1</span>选择简历</div>
                <div className="certs-empty-arrow">→</div>
                <div><span>2</span>选择岗位</div>
                <div className="certs-empty-arrow">→</div>
                <div><span>3</span>生成推荐</div>
              </div>
            </section>
          )}

          {/* ── 差距分析 ── */}
          {!loading && gap && (
            <section className="app-card certs-gap" data-testid="certs-gap-analysis">
              <div className="certs-section-head">
                <span className="certs-section-title"><AimOutlined /> 差距分析</span>
                <span className="certs-section-sub">推荐依据：简历能力 × 岗位要求</span>
              </div>
              <Row gutter={[16, 16]}>
                <Col xs={24} md={8}>
                  <div className="certs-gap-panel is-skill">
                    <div className="certs-gap-head">
                      <FileTextOutlined /> 简历核心技能
                      <span className="certs-count">{gap.resume_skills.length}</span>
                    </div>
                    <GapItems items={gap.resume_skills} tone="skill" empty="未识别到" />
                  </div>
                </Col>
                <Col xs={24} md={8}>
                  <div className="certs-gap-panel is-jd">
                    <div className="certs-gap-head">
                      <AimOutlined /> 岗位核心要求
                      <span className="certs-count">{gap.jd_requirements.length}</span>
                    </div>
                    <GapItems items={gap.jd_requirements} tone="jd" empty="未识别到" />
                  </div>
                </Col>
                <Col xs={24} md={8}>
                  <div className="certs-gap-panel is-gap">
                    <div className="certs-gap-head">
                      <TrophyOutlined /> 待补齐差距
                      <span className="certs-count">{gap.gaps.length}</span>
                    </div>
                    <GapItems items={gap.gaps} tone="gap" empty="未识别到明显差距" />
                  </div>
                </Col>
              </Row>
            </section>
          )}

          {/* ── 推荐列表 ── */}
          {!loading && recs.length > 0 && (
            <section className="certs-results">
              <div className="certs-section-head">
                <span className="certs-section-title"><SafetyCertificateOutlined /> 推荐证书与学习内容</span>
                <span className="certs-section-sub">
                  共 {recs.length} 项 · 按优先级排序
                  <Button type="link" size="small" icon={<ReloadOutlined />} onClick={reset}>
                    清空结果
                  </Button>
                </span>
              </div>

              <Row gutter={[16, 16]}>
                {recs.map((r, idx) => {
                  const cat = CATEGORY_META[r.category] || CATEGORY_META['其他']
                  const lv = LEVEL_META[r.level] || LEVEL_META['入门级']
                  return (
                    <Col xs={24} md={12} xl={8} key={`${r.title}-${idx}`} style={{ display: 'flex' }}>
                      <article className="certs-card" data-testid={`certs-rec-item-${idx}`}>
                        <div className="certs-card-top">
                          <span className="certs-rank">{r.priority}</span>
                          <span className="certs-pill" style={{ color: cat.color, background: cat.bg }}>
                            {r.category}
                          </span>
                          <span className="certs-pill" style={{ color: lv.color, background: lv.bg }}>
                            {r.level}
                          </span>
                        </div>

                        <h3 className="certs-card-title">{r.title}</h3>
                        {r.issuer && <div className="certs-issuer">{r.issuer}</div>}

                        <div className="certs-meta">
                          <span><WalletOutlined /> {r.estimated_cost || '费用未知'}</span>
                          <span><ClockCircleOutlined /> {r.estimated_duration || '周期未知'}</span>
                        </div>

                        <p className="certs-why">{r.why}</p>

                        <div className="certs-card-foot">
                          {r.link ? (
                            <a className="certs-link" href={r.link} target="_blank" rel="noopener noreferrer">
                              <LinkOutlined /> 官方链接
                            </a>
                          ) : (
                            <span className="certs-nolink">请自行搜索官方报名入口</span>
                          )}
                        </div>
                      </article>
                    </Col>
                  )
                })}
              </Row>
            </section>
          )}

          {/* ── 学习路径 ── */}
          {!loading && path.length > 0 && (
            <section className="app-card certs-path-card" data-testid="certs-learning-path">
              <div className="certs-section-head">
                <span className="certs-section-title"><TrophyOutlined /> 建议学习路径</span>
                <span className="certs-section-sub">按顺序推进，先补齐最影响匹配度的能力</span>
              </div>
              <ol className="certs-path">
                {path.map((step, i) => (
                  <li key={i}>
                    <span className="certs-path-index">{i + 1}</span>
                    <span className="certs-path-text">{step}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* ── 行业证书资源库 ── */}
          {catalog && catalog.items.length > 0 && (
            <section className="app-card certs-catalog" data-testid="certs-catalog">
              <div className="certs-section-head">
                <span className="certs-section-title"><BookOutlined /> 行业证书资源库</span>
                <span className="certs-section-sub">
                  共 {catalog.items.length} 项 · {catalog.categories.length} 个行业方向 · 官方入口人工整理
                </span>
              </div>

              <div className="certs-catalog-bar">
                <Select
                  style={{ width: 220, maxWidth: '60vw' }}
                  allowClear
                  placeholder="全部行业分类"
                  value={catalogCategory || undefined}
                  onChange={(v) => setCatalogCategory(v || '')}
                  options={catalog.categories.map((c) => ({ value: c, label: c }))}
                  data-testid="certs-catalog-category"
                />
                <Input
                  allowClear
                  prefix={<SearchOutlined style={{ color: 'var(--text-quaternary)' }} />}
                  placeholder="搜索证书 / 机构 / 关键词，如：华为、会计、PMP"
                  style={{ flex: 1, minWidth: 0 }}
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  data-testid="certs-catalog-search"
                />
              </div>

              {catalogItems.length === 0 ? (
                <div className="certs-muted" style={{ textAlign: 'center', padding: '24px 0' }}>
                  没有匹配的资源，换个关键词试试
                </div>
              ) : (
                <Collapse
                  className="certs-catalog-collapse"
                  defaultActiveKey={catalogGroups.slice(0, 1).map((g) => g.category)}
                  items={catalogGroups.map((g) => ({
                    key: g.category,
                    label: (
                      <span className="certs-catalog-cat">
                        {g.category}
                        <span className="certs-count">{g.items.length}</span>
                      </span>
                    ),
                    children: (
                      <div className="certs-catalog-list">
                        {g.items.map((it, i) => (
                          <div className="certs-catalog-item" key={`${it.name}-${i}`}>
                            <span className={`certs-pill ${it.type === 'certificate' ? 'is-cert' : 'is-course'}`}>
                              {it.type === 'certificate' ? '证书' : '课程'}
                            </span>
                            <div className="certs-catalog-body">
                              <div className="certs-catalog-name">
                                {it.name}
                                {it.issuer && <span className="certs-catalog-issuer"> · {it.issuer}</span>}
                              </div>
                              {it.desc && <div className="certs-catalog-desc">{it.desc}</div>}
                            </div>
                            <a
                              className="certs-link"
                              href={it.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <LinkOutlined /> 官网
                            </a>
                          </div>
                        ))}
                      </div>
                    ),
                  }))}
                />
              )}
            </section>
          )}
        </div>
      )}

      <style jsx>{`
        .certs-page { display: flex; flex-direction: column; gap: 18px; }
        .certs-center { text-align: center; padding: 80px 0; }

        /* ── 英雄区 ── */
        .certs-hero {
          position: relative;
          display: flex; align-items: center; gap: 16px;
          padding: 20px 22px;
          border-radius: var(--radius-xl);
          border: 1px solid rgba(0, 122, 255, 0.18);
          background: linear-gradient(120deg, rgba(0,122,255,0.10) 0%, rgba(94,92,230,0.08) 55%, rgba(175,82,222,0.06) 100%);
          overflow: hidden;
        }
        .certs-hero-glow {
          position: absolute; right: -40px; top: -60px; width: 220px; height: 220px;
          background: radial-gradient(circle, rgba(0,122,255,0.20), transparent 68%);
          pointer-events: none;
        }
        .certs-hero-icon {
          flex: none; width: 52px; height: 52px; border-radius: 16px;
          display: grid; place-items: center; font-size: 26px; color: #fff;
          background: linear-gradient(135deg, #007AFF, #5E5CE6);
          box-shadow: 0 8px 20px rgba(0, 122, 255, 0.28);
        }
        .certs-hero-body { flex: 1; min-width: 0; }
        .certs-hero-body h2 { margin: 0 0 4px; font-size: 19px; font-weight: 700; color: var(--text-primary); }
        .certs-hero-body p { margin: 0; font-size: 13px; color: var(--text-secondary); line-height: 1.6; }
        .certs-hero-stats { display: flex; align-items: center; gap: 14px; flex: none; }
        .certs-stat { display: flex; flex-direction: column; align-items: center; min-width: 58px; }
        .certs-stat strong { font-size: 22px; font-weight: 700; color: var(--text-primary); line-height: 1.2; }
        .certs-stat span { font-size: 11px; color: var(--text-tertiary); }
        .certs-stat-divider { width: 1px; height: 26px; background: var(--border-light); }

        /* ── 输入面板 ── */
        .certs-panel { padding: 18px 20px 20px; }
        .certs-panel-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
        .certs-panel-title { font-size: 14px; font-weight: 650; color: var(--text-primary); display: inline-flex; gap: 8px; align-items: center; }
        .certs-panel-tip { font-size: 12px; color: var(--text-tertiary); }
        .certs-field-label {
          display: flex; align-items: center; gap: 6px;
          font-size: 12px; font-weight: 500; color: var(--text-secondary);
          margin-bottom: 7px;
        }
        .certs-submit-col { display: flex; align-items: flex-end; }
        .certs-submit {
          width: 100%; height: 40px; border-radius: 10px; font-weight: 600; white-space: nowrap;
          box-shadow: 0 6px 16px rgba(0, 122, 255, 0.24);
        }
        .certs-alert { margin-top: 14px; }

        /* ── 加载 ── */
        .certs-loading { text-align: center; padding: 46px 24px; }
        .certs-pulse {
          width: 62px; height: 62px; margin: 0 auto 18px; border-radius: 50%;
          display: grid; place-items: center; font-size: 28px; color: #fff;
          background: linear-gradient(135deg, #007AFF, #5E5CE6);
          animation: certs-pulse 2.1s var(--ease-smooth) infinite;
        }
        @keyframes certs-pulse {
          0% { box-shadow: 0 0 0 0 rgba(0, 122, 255, 0.32); }
          70% { box-shadow: 0 0 0 20px rgba(0, 122, 255, 0); }
          100% { box-shadow: 0 0 0 0 rgba(0, 122, 255, 0); }
        }
        .certs-loading h3 { margin: 0 0 6px; font-size: 16px; font-weight: 650; color: var(--text-primary); }
        .certs-loading-sub { margin: 0 0 20px; font-size: 13px; color: var(--text-secondary); }
        .certs-steps { display: flex; justify-content: center; flex-wrap: wrap; gap: 20px; margin-bottom: 16px; }
        .certs-steps span { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--text-secondary); }
        .certs-steps .is-done { color: #34C759; }
        .certs-steps .is-active { color: var(--primary-500); font-weight: 600; }
        .certs-dot {
          width: 8px; height: 8px; border-radius: 50%; background: var(--primary-500);
          display: inline-block; animation: certs-blink 1.1s ease-in-out infinite;
        }
        @keyframes certs-blink { 0%, 100% { opacity: 0.25; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1); } }
        .certs-loading-hint { font-size: 12px; color: var(--text-tertiary); }

        /* ── 空状态 ── */
        .certs-empty {
          text-align: center; padding: 44px 24px;
          border: 1px dashed var(--border-medium);
          border-radius: var(--radius-xl);
          background: linear-gradient(180deg, rgba(0,122,255,0.03), transparent 62%);
        }
        .certs-empty-icon {
          width: 56px; height: 56px; margin: 0 auto 14px; border-radius: 18px;
          display: grid; place-items: center; font-size: 26px;
          color: var(--primary-500); background: rgba(0, 122, 255, 0.10);
        }
        .certs-empty h3 { margin: 0 0 6px; font-size: 15px; font-weight: 650; color: var(--text-primary); }
        .certs-empty p { margin: 0 auto 18px; max-width: 520px; font-size: 13px; line-height: 1.7; color: var(--text-secondary); }
        .certs-empty-steps { display: flex; align-items: center; justify-content: center; gap: 10px; flex-wrap: wrap; }
        .certs-empty-steps > div { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--text-secondary); }
        .certs-empty-steps span {
          width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center;
          font-size: 11px; font-weight: 700; color: #fff; background: var(--primary-500);
        }
        .certs-empty-arrow { color: var(--text-quaternary); }

        /* ── 区块标题 ── */
        .certs-section-head {
          display: flex; align-items: baseline; justify-content: space-between;
          gap: 12px; margin-bottom: 14px; flex-wrap: wrap;
        }
        .certs-section-title {
          display: inline-flex; align-items: center; gap: 8px;
          font-size: 14.5px; font-weight: 650; color: var(--text-primary);
        }
        .certs-section-sub { font-size: 12px; color: var(--text-tertiary); display: inline-flex; align-items: center; gap: 4px; }

        /* ── 差距分析 ── */
        .certs-gap { padding: 18px 20px 20px; }
        .certs-gap-panel {
          height: 100%; padding: 14px 15px; border-radius: var(--radius-lg);
          border: 1px solid var(--border-light);
        }
        .certs-gap-panel.is-skill { background: rgba(52, 199, 89, 0.06); border-color: rgba(52, 199, 89, 0.18); }
        .certs-gap-panel.is-jd { background: rgba(0, 122, 255, 0.06); border-color: rgba(0, 122, 255, 0.18); }
        .certs-gap-panel.is-gap { background: rgba(255, 149, 0, 0.07); border-color: rgba(255, 149, 0, 0.20); }
        .certs-gap-head {
          display: flex; align-items: center; gap: 7px; margin-bottom: 10px;
          font-size: 12.5px; font-weight: 600; color: var(--text-secondary);
        }
        .certs-count {
          margin-left: auto; font-size: 11px; font-weight: 600; padding: 1px 7px;
          border-radius: 999px; color: var(--text-secondary); background: var(--bg-hover);
        }
        /* 以下类名用在子组件 GapItems 的 JSX 里，styled-jsx 局部作用域覆盖不到，
           必须用 :global()（类名统一带 certs- 前缀，不会污染其他页面） */
        :global(.certs-gap-items) { display: flex; flex-wrap: wrap; gap: 6px; }
        :global(.certs-tag) {
          display: inline-flex; align-items: center;
          padding: 3px 10px; border-radius: 999px;
          font-size: 12px; line-height: 1.5; white-space: nowrap;
        }
        :global(.certs-tag.is-skill) { color: #248A3D; background: rgba(52, 199, 89, 0.14); }
        :global(.certs-tag.is-jd) { color: #0062CC; background: rgba(0, 122, 255, 0.13); }
        :global(.certs-tag.is-gap) { color: #B26A00; background: rgba(255, 149, 0, 0.16); }
        :global(.certs-gap-line) {
          flex-basis: 100%; display: flex; gap: 8px;
          font-size: 12.5px; line-height: 1.7; color: var(--text-secondary);
          padding: 1px 0;
        }
        :global(.certs-gap-line i) {
          flex: none; width: 5px; height: 5px; border-radius: 50%;
          margin-top: 8px; opacity: .9;
        }
        :global(.certs-gap-line.is-skill i) { background: #34C759; }
        :global(.certs-gap-line.is-jd i) { background: #007AFF; }
        :global(.certs-gap-line.is-gap i) { background: #FF9500; }
        :global(.certs-muted) { font-size: 12px; color: var(--text-tertiary); }

        /* 深色主题下提亮标签文字（浅色底/深色底两套对比度） */
        :global([data-theme="dark"] .certs-tag.is-skill) { color: #5BE07E; }
        :global([data-theme="dark"] .certs-tag.is-jd) { color: #6FAFFF; }
        :global([data-theme="dark"] .certs-tag.is-gap) { color: #FFB454; }

        /* ── 推荐卡片 ── */
        .certs-card {
          flex: 1; width: 100%; display: flex; flex-direction: column;
          padding: 16px 17px 14px;
          border-radius: var(--radius-xl);
          border: 1px solid var(--border-light);
          background: var(--bg-card);
          box-shadow: var(--shadow-xs);
          transition: transform .22s var(--ease-out), box-shadow .22s var(--ease-out), border-color .22s var(--ease-out);
        }
        .certs-card:hover {
          transform: translateY(-3px);
          border-color: rgba(0, 122, 255, 0.28);
          box-shadow: var(--shadow-lg);
        }
        .certs-card-top { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; flex-wrap: wrap; }
        .certs-rank {
          width: 22px; height: 22px; border-radius: 7px; display: grid; place-items: center;
          font-size: 11.5px; font-weight: 700; color: #fff;
          background: linear-gradient(135deg, #007AFF, #5E5CE6);
          box-shadow: 0 3px 8px rgba(0, 122, 255, 0.25);
        }
        .certs-pill {
          font-size: 11.5px; font-weight: 600; padding: 2px 9px; border-radius: 999px;
        }
        .certs-card-title {
          margin: 0 0 4px; font-size: 15px; font-weight: 650; line-height: 1.45;
          color: var(--text-primary);
        }
        .certs-issuer { font-size: 12px; color: var(--text-tertiary); margin-bottom: 10px; }
        .certs-meta {
          display: flex; flex-wrap: wrap; gap: 8px 14px; margin-bottom: 10px;
          font-size: 12px; color: var(--text-secondary);
        }
        .certs-meta span {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 3px 9px; border-radius: 8px; background: var(--bg-hover);
        }
        .certs-why {
          flex: 1; margin: 0 0 12px; font-size: 13px; line-height: 1.75;
          color: var(--text-secondary);
        }
        .certs-card-foot { margin-top: auto; }
        .certs-link {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 5px 12px; border-radius: 8px;
          font-size: 12.5px; font-weight: 600; color: var(--primary-500);
          background: rgba(0, 122, 255, 0.09);
          transition: background .18s var(--ease-out);
        }
        .certs-link:hover { background: rgba(0, 122, 255, 0.16); }
        .certs-nolink { font-size: 12px; color: var(--text-tertiary); }

        /* ── 学习路径 ── */
        .certs-path-card { padding: 18px 20px 20px; }
        .certs-path { list-style: none; margin: 0; padding: 0; }
        .certs-path li {
          position: relative; display: flex; gap: 14px;
          padding: 0 0 18px 0;
        }
        .certs-path li:last-child { padding-bottom: 0; }
        .certs-path li:not(:last-child)::before {
          content: ''; position: absolute; left: 13px; top: 28px; bottom: 0;
          width: 2px; border-radius: 2px;
          background: linear-gradient(180deg, rgba(0,122,255,0.35), rgba(0,122,255,0.08));
        }
        .certs-path-index {
          flex: none; width: 27px; height: 27px; border-radius: 50%;
          display: grid; place-items: center;
          font-size: 12px; font-weight: 700; color: #fff;
          background: linear-gradient(135deg, #007AFF, #5E5CE6);
          box-shadow: 0 4px 10px rgba(0, 122, 255, 0.22);
        }
        .certs-path-text {
          padding-top: 3px; font-size: 13px; line-height: 1.75;
          color: var(--text-secondary);
        }

        /* ── 行业证书资源库 ── */
        .certs-catalog { padding: 18px 20px 20px; }
        .certs-catalog-bar { display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
        .certs-catalog-cat {
          display: inline-flex; align-items: center; gap: 8px;
          font-size: 13px; font-weight: 600; color: var(--text-primary);
        }
        :global(.certs-catalog-collapse) { background: transparent; }
        :global(.certs-catalog-collapse .ant-collapse-item) {
          border: 1px solid var(--border-light); border-radius: var(--radius-lg) !important;
          margin-bottom: 8px; background: var(--bg-card); overflow: hidden;
        }
        :global(.certs-catalog-collapse .ant-collapse-header) { align-items: center !important; }
        .certs-catalog-list { display: flex; flex-direction: column; gap: 2px; }
        .certs-catalog-item {
          display: flex; align-items: flex-start; gap: 10px;
          padding: 9px 4px; border-radius: 10px;
        }
        .certs-catalog-item:hover { background: var(--bg-hover); }
        .certs-catalog-item .certs-pill { flex: none; margin-top: 1px; }
        :global(.certs-pill.is-cert) { color: #0062CC; background: rgba(0, 122, 255, 0.13); }
        :global(.certs-pill.is-course) { color: #5E5CE6; background: rgba(94, 92, 230, 0.13); }
        :global([data-theme="dark"] .certs-pill.is-cert) { color: #6FAFFF; }
        :global([data-theme="dark"] .certs-pill.is-course) { color: #A5A3F5; }
        .certs-catalog-body { flex: 1; min-width: 0; }
        .certs-catalog-name {
          font-size: 13px; font-weight: 550; color: var(--text-primary); line-height: 1.55;
        }
        .certs-catalog-issuer { font-weight: 400; color: var(--text-tertiary); font-size: 12px; }
        .certs-catalog-desc { font-size: 12px; color: var(--text-tertiary); line-height: 1.6; margin-top: 2px; }
        .certs-catalog-item .certs-link { flex: none; font-size: 12px; padding: 4px 10px; }

        @media (max-width: 768px) {
          .certs-hero { flex-wrap: wrap; }
          .certs-hero-stats { width: 100%; justify-content: flex-start; }
          .certs-submit-col { align-items: stretch; }
        }
      `}</style>
    </AppLayout>
  )
}
