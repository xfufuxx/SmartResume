'use client'

import React, { useEffect, useState } from 'react'
import {
  Button, Card, Typography, Spin, message, Space,
  Row, Col, Divider, Tag, Progress, Empty, Select,
} from 'antd'
import {
  DownloadOutlined, EditOutlined, SaveOutlined, CloseOutlined, FileSyncOutlined,
} from '@ant-design/icons'
import { useRouter, useParams } from 'next/navigation'
import { optimize, toBackendUrl, editor } from '@/lib/api'
import { getToken } from '@/lib/auth'
import { formatDate } from '@/lib/utils'
import type { OptimizeResult, ResumeParseResult } from '@/types'
import AppLayout from '@/components/AppLayout'
import AuthGate from '@/components/AuthGate'
import ResumeEditor from '@/components/ResumeEditor'

const TEMPLATES = [
  { value: 'professional', label: '专业商务' },
  { value: 'simple', label: '简洁黑白' },
  { value: 'modern', label: '现代分栏' },
  { value: 'compact', label: '紧凑一页' },
  { value: 'elegant', label: '雅致衬线' },
  { value: 'classic', label: '经典排版' },
  { value: 'fresh', label: '清新蓝' },
  { value: 'dark', label: '深色质感' },
]

function ExperienceDiff({ original, optimized }: { original: ResumeParseResult; optimized: ResumeParseResult }) {
  const origExps = original.experience || []
  const optExps = optimized.experience || []
  const maxLen = Math.max(origExps.length, optExps.length)

  return (
    <div>
      <Typography.Title level={5}>工作经历</Typography.Title>
      {Array.from({ length: maxLen }).map((_, i) => (
        <Row gutter={16} key={i} style={{ marginBottom: 16 }}>
          <Col xs={24} md={12}>
            {origExps[i] ? (
              <Card size="small" title={<span style={{ color: 'var(--text-tertiary)' }}>原简历</span>} style={{ background: 'var(--gray-50)' }}>
                <Typography.Text strong>{origExps[i].title} @ {origExps[i].company}</Typography.Text>
                <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{origExps[i].start} - {origExps[i].end}</div>
                <ul style={{ paddingLeft: 20, marginTop: 4 }}>
                  {(origExps[i].points || []).map((p, j) => <li key={j} style={{ fontSize: 13 }}>{p}</li>)}
                </ul>
              </Card>
            ) : <Empty description="无" />}
          </Col>
          <Col xs={24} md={12}>
            {optExps[i] ? (
              <Card size="small" title={<span style={{ color: 'var(--primary-600)' }}>优化后</span>} style={{ borderColor: 'var(--primary-600)' }}>
                <Typography.Text strong>{optExps[i].title} @ {optExps[i].company}</Typography.Text>
                <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{optExps[i].start} - {optExps[i].end}</div>
                <ul style={{ paddingLeft: 20, marginTop: 4 }}>
                  {(optExps[i].points || []).map((p, j) => <li key={j} style={{ fontSize: 13 }}>{p}</li>)}
                </ul>
              </Card>
            ) : <Empty description="无" />}
          </Col>
        </Row>
      ))}
    </div>
  )
}

function SkillsDiff({ original, optimized }: { original: ResumeParseResult; optimized: ResumeParseResult }) {
  const origSkills = new Set(original.skills || [])
  const optSkills = new Set(optimized.skills || [])
  const added = (optimized.skills || []).filter((s) => !origSkills.has(s))
  const removed = (original.skills || []).filter((s) => !optSkills.has(s))
  const kept = (optimized.skills || []).filter((s) => origSkills.has(s))

  return (
    <div>
      <Typography.Title level={5}>技能对比</Typography.Title>
      <Space direction="vertical" style={{ width: '100%' }}>
        {kept.length > 0 && (
          <div>
            <Typography.Text type="secondary">保持不变：</Typography.Text>
            <Space wrap>{kept.map((s) => <Tag key={s}>{s}</Tag>)}</Space>
          </div>
        )}
        {added.length > 0 && (
          <div>
            <Typography.Text type="secondary">新增技能：</Typography.Text>
            <Space wrap>{added.map((s) => <Tag color="green" key={s}>+ {s}</Tag>)}</Space>
          </div>
        )}
        {removed.length > 0 && (
          <div>
            <Typography.Text type="secondary">移除技能：</Typography.Text>
            <Space wrap>{removed.map((s) => <Tag color="red" key={s}>- {s}</Tag>)}</Space>
          </div>
        )}
        {kept.length === 0 && added.length === 0 && <Empty description="无技能数据" />}
      </Space>
    </div>
  )
}

export default function OptimizationDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<OptimizeResult | null>(null)

  // ── 在线编辑 + 重新导出 PDF ──
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<ResumeParseResult | null>(null)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [template, setTemplate] = useState('professional')

  useEffect(() => {
    const t = getToken()
    if (!t) {
      router.push('/login')
      return
    }
    setToken(t)
  }, [router])

  useEffect(() => {
    if (!token || !id) return
    setLoading(true)
    optimize.get(id).then((res) => {
      setDetail(res.data)
    }).catch(() => {
      message.error('加载详情失败')
    }).finally(() => setLoading(false))
  }, [token, id])

  const startEdit = () => {
    if (!detail?.optimized_json) {
      message.warning('该记录没有可编辑的内容')
      return
    }
    setDraft(JSON.parse(JSON.stringify(detail.optimized_json)) as ResumeParseResult)
    setEditing(true)
  }

  const handleSave = async () => {
    if (!draft || !id) return
    // 前端先清理空行，避免导出 PDF 出现空白要点
    const cleaned: ResumeParseResult = {
      ...draft,
      experience: (draft.experience || [])
        .filter((e) => (e.title || e.company))
        .map((e) => ({ ...e, points: (e.points || []).map((p) => p.trim()).filter(Boolean) })),
      projects: (draft.projects || []).filter((p) => p.name),
      education: (draft.education || []).filter((e) => e.school),
      skills: (draft.skills || []).map((s) => s.trim()).filter(Boolean),
    }
    setSaving(true)
    try {
      const res = await editor.updateContent(id, cleaned as unknown as Record<string, unknown>)
      setDetail(res.data)
      setEditing(false)
      message.success('已保存，记得重新导出 PDF')
    } catch (e: any) {
      message.error(e?.response?.data?.detail || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleReexport = async () => {
    if (!id) return
    setExporting(true)
    try {
      const res = await editor.reexport(id, template)
      setDetail((prev) => (prev ? { ...prev, pdf_url: res.data?.pdf_url } : prev))
      message.success('PDF 已按最新内容重新生成')
    } catch (e: any) {
      message.error(e?.response?.data?.detail || '导出失败')
    } finally {
      setExporting(false)
    }
  }

  if (!token) return <AuthGate activeKey="history" />

  if (loading) {
    return (
      <AppLayout activeKey="history" hideNav>
        <div className="app-empty-state" style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <Spin size="large" tip="加载中..." />
        </div>
      </AppLayout>
    )
  }

  if (!detail) {
    return (
      <AppLayout activeKey="history" hideNav backPath="/history" backLabel="返回历史" title="优化详情" subtitle="未找到该记录">
        <div className="app-empty-state">
          <Empty description="未找到该优化记录" />
        </div>
      </AppLayout>
    )
  }

  const original = (detail.original_json as ResumeParseResult) || null
  const optimized = (detail.optimized_json as ResumeParseResult) || null

  return (
    <AppLayout activeKey="history" backPath="/history" backLabel="返回历史" title="优化详情" subtitle={`${detail.job_title || ''} ${detail.company ? '@ ' + detail.company : ''}`}>
      <div className="app-page-enter">
        <Row gutter={[16, 16]}>
          <Col span={24}>
            <Card>
              <div className="app-page-header" style={{ marginBottom: 0 }}>
                <Space wrap>
                  {detail.match_score != null && (
                    <Tag color="blue" style={{ fontSize: 16, padding: '4px 12px' }}>
                      匹配度: {detail.match_score} 分
                    </Tag>
                  )}
                  <Tag color={detail.status === 'completed' ? 'green' : 'orange'}>
                    {detail.status === 'completed' ? '已完成' : '待处理'}
                  </Tag>
                  {detail.created_at && (
                    <Tag>{formatDate(detail.created_at)}</Tag>
                  )}
                </Space>
                {detail.pdf_url && (
                  <Button
                    type="primary"
                    icon={<DownloadOutlined />}
                    onClick={() => window.open(toBackendUrl(detail.pdf_url), '_blank')}
                  >
                    下载 PDF
                  </Button>
                )}
                {editing ? (
                  <Space wrap>
                    <Button
                      type="primary"
                      icon={<SaveOutlined />}
                      loading={saving}
                      onClick={handleSave}
                    >
                      保存修改
                    </Button>
                    <Button icon={<CloseOutlined />} onClick={() => setEditing(false)}>取消</Button>
                    <Select
                      style={{ width: 130 }}
                      value={template}
                      onChange={setTemplate}
                      options={TEMPLATES}
                    />
                    <Button
                      icon={<FileSyncOutlined />}
                      loading={exporting}
                      onClick={handleReexport}
                    >
                      重新导出 PDF
                    </Button>
                  </Space>
                ) : (
                  <Button icon={<EditOutlined />} onClick={startEdit}>编辑内容</Button>
                )}
              </div>
            </Card>
          </Col>
        </Row>

        {detail.match_analysis && (
          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={24} sm={8}>
              <Card size="small">
                <Typography.Text type="secondary">匹配得分</Typography.Text>
                <Progress type="dashboard" percent={detail.match_analysis.match_score} size={100} />
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card size="small" title="优势匹配">
                {(detail.match_analysis.strengths || []).map((s, i) => (
                  <div key={i} style={{ padding: '4px 0', color: 'var(--success-500)' }}>+ {s}</div>
                ))}
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card size="small" title="差距分析">
                {(detail.match_analysis.gaps || []).map((g, i) => (
                  <div key={i} style={{ padding: '4px 0', color: 'var(--error-500)' }}>- {g}</div>
                ))}
              </Card>
            </Col>
          </Row>
        )}

        <Divider />

        {editing && draft ? (
          <Card
            title="编辑优化结果"
            style={{ marginTop: 16 }}
            extra={<span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>改动保存后可重新导出 PDF</span>}
          >
            <ResumeEditor
              value={draft}
              onChange={setDraft}
              personalInfo={(optimized?.personal_info || original?.personal_info) as { name?: string; email?: string; phone?: string } | undefined}
            />
          </Card>
        ) : (
          <>
            {detail.changes_description && (
              <Card title="修改说明" style={{ marginBottom: 16 }}>
                <pre style={{ whiteSpace: 'pre-wrap', background: 'var(--gray-100)', padding: 12, borderRadius: 8, margin: 0 }}>
                  {detail.changes_description}
                </pre>
              </Card>
            )}
          </>
        )}

        {optimized && !editing && (
          <Card title="简历内容对比" style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Card size="small" title={<span style={{ color: 'var(--text-tertiary)' }}>优化前 - 个人总结</span>} style={{ background: 'var(--gray-50)', marginBottom: 12 }}>
                  {original?.summary || optimized.summary || '暂无'}
                </Card>
              </Col>
              <Col xs={24} md={12}>
                <Card size="small" title={<span style={{ color: 'var(--primary-600)' }}>优化后 - 个人总结</span>} style={{ borderColor: 'var(--primary-600)', marginBottom: 12 }}>
                  {optimized.summary || '暂无'}
                </Card>
              </Col>
            </Row>

            <Divider />

            <ExperienceDiff original={original || { experience: [], skills: [], projects: [], personal_info: {}, summary: '', education: [] }} optimized={optimized} />

            <Divider />

            <SkillsDiff original={original || { experience: [], skills: [], projects: [], personal_info: {}, summary: '', education: [] }} optimized={optimized} />

            {optimized.projects && optimized.projects.length > 0 && (
              <>
                <Divider />
                <Typography.Title level={5} className="app-section-title">项目经历</Typography.Title>
                {optimized.projects.map((proj, i) => (
                  <Card size="small" key={i} style={{ marginBottom: 8 }}>
                    <Typography.Text strong>{proj.name}</Typography.Text>
                    {proj.description && <div style={{ marginTop: 4 }}>{proj.description}</div>}
                    {proj.tech && proj.tech.length > 0 && (
                      <div style={{ marginTop: 4 }}>
                        <Space wrap>{proj.tech.map((t) => <Tag key={t}>{t}</Tag>)}</Space>
                      </div>
                    )}
                  </Card>
                ))}
              </>
            )}

            {optimized.education && optimized.education.length > 0 && (
              <>
                <Divider />
                <Typography.Title level={5} className="app-section-title">教育背景</Typography.Title>
                {optimized.education.map((edu, i) => (
                  <Card size="small" key={i} style={{ marginBottom: 8 }}>
                    <Typography.Text strong>{edu.school}</Typography.Text>
                    <div style={{ color: 'var(--text-secondary)' }}>
                      {[edu.degree, edu.major].filter(Boolean).join(' - ')}
                      {edu.start && ` | ${edu.start} - ${edu.end || '至今'}`}
                    </div>
                  </Card>
                ))}
              </>
            )}
          </Card>
        )}
      </div>
    </AppLayout>
  )
}