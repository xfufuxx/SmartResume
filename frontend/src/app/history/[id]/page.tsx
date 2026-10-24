'use client'

import React, { useEffect, useMemo, useCallback, useState } from 'react'
import {
  Button, Card, Typography, Spin, message, Space,
  Row, Col, Divider, Tag, Progress, Empty, Modal,
} from 'antd'
import {
  DownloadOutlined, EditOutlined, SaveOutlined, CloseOutlined, FileSyncOutlined, LayoutOutlined,
  PictureOutlined, BgColorsOutlined, QrcodeOutlined,
} from '@ant-design/icons'
import { Tooltip } from 'antd'
import ThemeDrawer from '@/components/ThemeDrawer'
import QrCodeCard from '@/components/QrCodeCard'
import { useRouter, useParams } from 'next/navigation'
import { optimize, toBackendUrl, editor } from '@/lib/api'
import { getToken } from '@/lib/auth'
import { formatDate } from '@/lib/utils'
import type { OptimizeResult, ResumeParseResult } from '@/types'
import AppLayout from '@/components/AppLayout'
import AuthGate from '@/components/AuthGate'
import ResumeEditor from '@/components/ResumeEditor'
import TemplateSelector from '@/components/TemplateSelector'
import { LayoutEditor } from '@/components/layout-editor'
import { buildLayout, type ResumeLike } from '@/lib/layout/buildLayout'
import { parseLayout } from '@/lib/layout/serialize'
import { TEMPLATE_OPTIONS, TEMPLATE_LABELS, DEFAULT_TEMPLATE } from '@/lib/templates'
import { collectResumeLinks } from '@/lib/qrcode'

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

/** 项目条目公共渲染：兼容 points 形状（name/role/start/end/points）与旧形状（description/tech） */
function ProjectFields({ proj }: { proj: ResumeParseResult['projects'][number] }) {
  const period = [proj.start, proj.end].filter(Boolean).join(' - ')
  return (
    <>
      <Typography.Text strong>{proj.name}</Typography.Text>
      {(proj.role || period) && (
        <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
          {[proj.role, period].filter(Boolean).join(' | ')}
        </div>
      )}
      {(proj.points || []).length > 0 && (
        <ul style={{ paddingLeft: 20, marginTop: 4, marginBottom: 0 }}>
          {(proj.points || []).map((p, j) => <li key={j} style={{ fontSize: 13 }}>{p}</li>)}
        </ul>
      )}
      {proj.description && <div style={{ marginTop: 4 }}>{proj.description}</div>}
      {proj.tech && proj.tech.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <Space wrap>{proj.tech.map((t) => <Tag key={t}>{t}</Tag>)}</Space>
        </div>
      )}
    </>
  )
}

function ProjectDiff({ original, optimized }: { original: ResumeParseResult; optimized: ResumeParseResult }) {
  const origProjs = original.projects || []
  const optProjs = optimized.projects || []
  const maxLen = Math.max(origProjs.length, optProjs.length)
  if (maxLen === 0) return null

  return (
    <div>
      <Typography.Title level={5}>项目经历</Typography.Title>
      {Array.from({ length: maxLen }).map((_, i) => (
        <Row gutter={16} key={i} style={{ marginBottom: 16 }}>
          <Col xs={24} md={12}>
            {origProjs[i] ? (
              <Card size="small" title={<span style={{ color: 'var(--text-tertiary)' }}>优化前</span>} style={{ background: 'var(--gray-50)' }}>
                <ProjectFields proj={origProjs[i]} />
              </Card>
            ) : <Empty description="无" />}
          </Col>
          <Col xs={24} md={12}>
            {optProjs[i] ? (
              <Card size="small" title={<span style={{ color: 'var(--primary-600)' }}>优化后</span>} style={{ borderColor: 'var(--primary-600)' }}>
                <ProjectFields proj={optProjs[i]} />
              </Card>
            ) : <Empty description="无" />}
          </Col>
        </Row>
      ))}
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
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [themeDrawerOpen, setThemeDrawerOpen] = useState(false)
  /** 二维码弹窗：从简历正文自动提取候选链接 */
  const [qrOpen, setQrOpen] = useState(false)
  const qrSuggestions = useMemo(
    () => collectResumeLinks((detail?.optimized_json || null) as Record<string, unknown> | null),
    [detail],
  )

  /** 重新拉取记录（主题保存/重导出后刷新 pdf_url 与 theme_config） */
  const reloadDetail = useCallback(() => {
    if (!token || !id) return
    optimize.get(id).then((res) => setDetail(res.data)).catch(() => {})
  }, [token, id])
  // ── 可视化排版编辑器（独立模式，与内容编辑互斥） ──
  const [layoutEditing, setLayoutEditing] = useState(false)

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
      // 模板选择以记录为准（刷新/换设备后仍复现上次的版式）
      if (res.data?.template) setTemplate(res.data.template)
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

  const startLayoutEdit = () => {
    if (!detail?.optimized_json) {
      message.warning('该记录没有可排版的内容')
      return
    }
    setLayoutEditing(true)
  }

  /** 布局文档：已保存过排版 → 读档；否则按内容生成默认布局 */
  const initialLayoutDoc = useMemo(() => {
    if (!detail) return null
    return parseLayout(detail.layout_json) ?? buildLayout(detail.optimized_json as ResumeLike | undefined)
  }, [detail?.layout_json, detail?.optimized_json])

  const handleSave = async () => {
    if (!draft || !id) return
    // 前端先清理空行，避免导出 PDF 出现空白要点
    const cleaned: ResumeParseResult = {
      ...draft,
      experience: (draft.experience || [])
        .filter((e) => (e.title || e.company))
        .map((e) => ({ ...e, points: (e.points || []).map((p) => p.trim()).filter(Boolean) })),
      projects: (draft.projects || [])
        .filter((p) => p.name)
        // points 形状：去空白行；旧形状（description/tech）原样保留，不注入空 points
        .map((p) => (p.points ? { ...p, points: p.points.map((x) => x.trim()).filter(Boolean) } : p)),
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

  /** 切换模板：立即落库（失败不阻断交互，导出时会再次固化） */
  const handleSelectTemplate = (key: string) => {
    setTemplate(key)
    if (!id) return
    editor.setTemplate(id, key).catch(() => {
      // 静默失败：导出时仍会带 template 参数并落库
    })
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
          <Spin size="large" tip="加载中..."><div style={{ minHeight: 1 }} /></Spin>
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
                    <Button
                      icon={TEMPLATE_OPTIONS.find((o) => o.key === template)?.icon}
                      onClick={() => setShowTemplateModal(true)}
                    >
                      {TEMPLATE_LABELS[template] || '选择模板'}
                    </Button>
                    <Tooltip title="定制配色/字体/字号/行距/页边距/章节间距，保存即重新导出">
                      <Button
                        icon={<BgColorsOutlined />}
                        onClick={() => setThemeDrawerOpen(true)}
                      >
                        主题定制
                      </Button>
                    </Tooltip>
                    <Tooltip title="去模板库逛逛全部风格，挑选后一键应用回本记录">
                      <Button
                        icon={<PictureOutlined />}
                        onClick={() => router.push(`/templates?record=${id}`)}
                      >
                        更多模板
                      </Button>
                    </Tooltip>
                    <Tooltip title="把简历里的链接生成二维码，下载 PNG/SVG">
                      <Button icon={<QrcodeOutlined />} onClick={() => setQrOpen(true)}>
                        二维码
                      </Button>
                    </Tooltip>
                    <Button
                      icon={<FileSyncOutlined />}
                      loading={exporting}
                      onClick={handleReexport}
                    >
                      重新导出 PDF
                    </Button>
                  </Space>
                ) : !layoutEditing ? (
                  <Space wrap>
                    <Button icon={<EditOutlined />} onClick={startEdit}>编辑内容</Button>
                    <Button icon={<LayoutOutlined />} onClick={startLayoutEdit}>可视化排版</Button>
                    <Tooltip title="把简历里的链接生成二维码，下载 PNG/SVG">
                      <Button icon={<QrcodeOutlined />} onClick={() => setQrOpen(true)}>
                        二维码
                      </Button>
                    </Tooltip>
                    <Tooltip title="去模板库逛逛全部风格，挑选后一键应用回本记录">
                      <Button icon={<PictureOutlined />} onClick={() => router.push(`/templates?record=${id}`)}>
                        更多模板
                      </Button>
                    </Tooltip>
                    <Tooltip title="定制配色/字体/字号/行距/页边距/章节间距，保存即重新导出">
                      <Button icon={<BgColorsOutlined />} onClick={() => setThemeDrawerOpen(true)}>
                        主题定制
                      </Button>
                    </Tooltip>
                  </Space>
                ) : null}
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

        {layoutEditing && initialLayoutDoc ? (
          <LayoutEditor
            optId={id}
            initialDoc={initialLayoutDoc}
            initialContent={detail.optimized_json as Record<string, unknown> | undefined}
            onClose={() => setLayoutEditing(false)}
            onExported={(pdfUrl) =>
              setDetail((prev) => (prev ? { ...prev, pdf_url: pdfUrl } : prev))
            }
            onSaved={() =>
              optimize.get(id).then((res) => setDetail(res.data)).catch(() => {})
            }
          />
        ) : editing && draft ? (
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

            {((original?.projects?.length || 0) + (optimized.projects?.length || 0)) > 0 && (
              <>
                <Divider />
                <ProjectDiff original={original || { experience: [], skills: [], projects: [], personal_info: {}, summary: '', education: [] }} optimized={optimized} />
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
      <TemplateSelector
        open={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        selected={template}
        onSelect={handleSelectTemplate}
        options={TEMPLATE_OPTIONS}
      />
      {id && (
        <ThemeDrawer
          open={themeDrawerOpen}
          onClose={() => setThemeDrawerOpen(false)}
          recordId={id}
          templateId={template}
          initial={detail?.theme_config ?? null}
          contentJson={(detail?.optimized_json as Record<string, unknown> | undefined) ?? null}
          onSaved={reloadDetail}
        />
      )}

      <Modal
        title="简历二维码"
        open={qrOpen}
        onCancel={() => setQrOpen(false)}
        footer={null}
        width={520}
        destroyOnHidden
      >
        <QrCodeCard
          suggestions={qrSuggestions}
          initialLabel={detail?.job_title || ''}
          compact
        />
      </Modal>
    </AppLayout>
  )
}