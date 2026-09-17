'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Button, Card, Spin, Row, Col, message, Tag, Space, Select, Empty,
  Input, Slider, Progress, Popconfirm, Tooltip, Divider, Alert,
} from 'antd'
import {
  TeamOutlined, StarOutlined, StarFilled, ThunderboltOutlined,
  BulbOutlined, EditOutlined, DeleteOutlined,
  FileTextOutlined, FileSearchOutlined, CheckCircleOutlined,
  LoadingOutlined, TrophyOutlined, HistoryOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/AppLayout'
import AuthGate from '@/components/AuthGate'
import { interview, resumes, jobs } from '@/lib/api'
import { getToken } from '@/lib/auth'
import type {
  InterviewSessionDetail, InterviewSessionItem, InterviewQuestion,
  ResumeRecord,
} from '@/types'

const { TextArea } = Input

interface JobOption {
  id: string
  title?: string | null
  company?: string | null
  category?: string | null
}

const CATEGORY_COLOR: Record<string, string> = {
  '技术能力': 'blue',
  '项目深挖': 'purple',
  '行为面试': 'orange',
  '岗位匹配': 'green',
  '职业规划': 'cyan',
}

const DIFFICULTY_COLOR: Record<string, string> = {
  '简单': 'green',
  '中等': 'gold',
  '困难': 'red',
}

function QuestionCard({
  item,
  onToggleBookmark,
  onSaveNote,
}: {
  item: InterviewQuestion
  onToggleBookmark: (id: string) => void
  onSaveNote: (id: string, note: string) => void
}) {
  const [note, setNote] = useState(item.note || '')
  const [noteDirty, setNoteDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showAnswer, setShowAnswer] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setNote(item.note || '')
    setNoteDirty(false)
  }, [item.id, item.note])

  // 停止输入 800ms 后自动保存草稿
  useEffect(() => {
    if (!noteDirty) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setSaving(true)
      try {
        await onSaveNote(item.id, note)
        setNoteDirty(false)
      } finally {
        setSaving(false)
      }
    }, 800)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [note, noteDirty, item.id, onSaveNote])

  return (
    <Card
      size="small"
      style={{ marginBottom: 12, borderColor: item.is_bookmarked ? 'var(--primary-300)' : undefined }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
            background: 'var(--primary-50)', color: 'var(--primary-600)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700,
          }}>{item.order_index + 1}</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', flex: 1, minWidth: 200 }}>
            {item.question}
          </span>
          {item.category && <Tag color={CATEGORY_COLOR[item.category] || 'default'}>{item.category}</Tag>}
          {item.difficulty && <Tag color={DIFFICULTY_COLOR[item.difficulty] || 'default'}>{item.difficulty}</Tag>}
          <Tooltip title={item.is_bookmarked ? '取消收藏' : '收藏这道题'}>
            <Button
              type="text"
              size="small"
              icon={item.is_bookmarked ? <StarFilled style={{ color: 'var(--warning-500)' }} /> : <StarOutlined />}
              onClick={() => onToggleBookmark(item.id)}
            />
          </Tooltip>
        </div>
      }
    >
      {item.intent && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
          <BulbOutlined style={{ color: 'var(--warning-500)', marginRight: 6 }} />
          考察点：{item.intent}
        </div>
      )}

      {!!item.answer_outline?.length && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 6 }}>答题要点</div>
          <ol style={{ margin: 0, paddingLeft: 20, color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.8 }}>
            {item.answer_outline.map((o, i) => <li key={i}>{o}</li>)}
          </ol>
        </div>
      )}

      {item.sample_answer && (
        <>
          <Button
            type="link"
            size="small"
            style={{ paddingLeft: 0 }}
            onClick={() => setShowAnswer((v) => !v)}
          >
            {showAnswer ? '收起参考答案' : '查看参考答案'}
          </Button>
          {showAnswer && (
            <div style={{
              background: 'var(--bg-page)', borderRadius: 8, padding: 12,
              fontSize: 13, lineHeight: 1.8, color: 'var(--text-primary)', whiteSpace: 'pre-wrap',
            }}>
              {item.sample_answer}
            </div>
          )}
        </>
      )}

      <Divider style={{ margin: '12px 0' }} />
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
        <EditOutlined /> 我的回答草稿
        {saving && <span style={{ color: 'var(--text-quaternary)', fontWeight: 400 }}><LoadingOutlined /> 保存中…</span>}
        {!saving && !noteDirty && note && <span style={{ color: 'var(--success-500)', fontWeight: 400 }}><CheckCircleOutlined /> 已保存</span>}
      </div>
      <TextArea
        value={note}
        rows={3}
        maxLength={4000}
        showCount
        placeholder="写下你的回答思路，会自动保存。面试前回来过一遍效果最好。"
        onChange={(e) => { setNote(e.target.value); setNoteDirty(true) }}
      />
    </Card>
  )
}

export default function InterviewPrepPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)

  const [resumeList, setResumeList] = useState<ResumeRecord[]>([])
  const [jobList, setJobList] = useState<JobOption[]>([])
  const [resumeId, setResumeId] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [questionCount, setQuestionCount] = useState(8)

  const [sessions, setSessions] = useState<InterviewSessionItem[]>([])
  const [current, setCurrent] = useState<InterviewSessionDetail | null>(null)
  const [generating, setGenerating] = useState(false)
  const [loadingList, setLoadingList] = useState(false)
  const [showBookmarkedOnly, setShowBookmarkedOnly] = useState(false)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const t = getToken()
    if (!t) { router.push('/login'); return }
    setToken(t)
  }, [router])

  const loadSessions = useCallback(async () => {
    setLoadingList(true)
    try {
      const res = await interview.listSessions()
      setSessions(res.data || [])
    } catch {
      /* 静默 */
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => {
    if (!token) return
    const load = async () => {
      try {
        const [rRes, jRes] = await Promise.all([
          resumes.list().catch(() => ({ data: [] as ResumeRecord[] })),
          jobs.list().catch(() => ({ data: [] as JobOption[] })),
        ])
        const rs: ResumeRecord[] = ((rRes.data || []) as ResumeRecord[]).filter((r) => !!r.parsed_json)
        setResumeList(rs)
        setJobList((jRes.data || []) as JobOption[])
        if (rs.length) setResumeId((prev) => prev || (rs.find((r) => r.is_primary) || rs[0]).id)
      } catch {
        message.error('加载简历/岗位失败')
      }
    }
    load()
    loadSessions()
  }, [token, loadSessions])

  // 轮询生成中的会话
  const startPolling = useCallback((sessionId: string) => {
    if (pollTimer.current) clearInterval(pollTimer.current)
    pollTimer.current = setInterval(async () => {
      try {
        const res = await interview.getSession(sessionId)
        const data: InterviewSessionDetail = res.data
        setCurrent(data)
        if (data.status === 'completed' || data.status === 'failed') {
          if (pollTimer.current) clearInterval(pollTimer.current)
          pollTimer.current = null
          setGenerating(false)
          loadSessions()
          if (data.status === 'failed') message.error(data.error_message || '生成失败，请重试')
        }
      } catch {
        if (pollTimer.current) clearInterval(pollTimer.current)
        pollTimer.current = null
        setGenerating(false)
      }
    }, 2500)
  }, [loadSessions])

  useEffect(() => () => { if (pollTimer.current) clearInterval(pollTimer.current) }, [])

  const handleGenerate = async () => {
    if (!resumeId && !jobId) {
      message.warning('请至少选择一份简历或一个岗位')
      return
    }
    setGenerating(true)
    setCurrent(null)
    try {
      const res = await interview.generate(resumeId, jobId, questionCount)
      const sessionId = res.data?.session_id
      if (!sessionId) throw new Error('未返回会话 ID')
      message.success('已提交，AI 正在押题…')
      startPolling(sessionId)
    } catch (e: any) {
      setGenerating(false)
      message.error(e?.response?.data?.detail || '生成失败，请稍后重试')
    }
  }

  const openSession = async (id: string) => {
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null }
    setGenerating(false)
    try {
      const res = await interview.getSession(id)
      setCurrent(res.data)
      if (res.data.status === 'pending' || res.data.status === 'processing') {
        setGenerating(true)
        startPolling(id)
      }
    } catch {
      message.error('加载失败')
    }
  }

  const handleToggleBookmark = async (questionId: string) => {
    if (!current) return
    // 乐观更新，失败再回滚
    const snapshot = current
    setCurrent({
      ...current,
      questions: current.questions.map((q) => q.id === questionId ? { ...q, is_bookmarked: !q.is_bookmarked } : q),
    })
    try {
      await interview.toggleBookmark(questionId)
    } catch {
      setCurrent(snapshot)
      message.error('操作失败')
    }
  }

  const handleSaveNote = async (questionId: string, note: string) => {
    await interview.saveNote(questionId, note)
    if (current) {
      setCurrent({
        ...current,
        questions: current.questions.map((q) => q.id === questionId ? { ...q, note } : q),
      })
    }
  }

  const handleDeleteSession = async (id: string) => {
    try {
      await interview.deleteSession(id)
      message.success('已删除')
      if (current?.id === id) setCurrent(null)
      loadSessions()
    } catch {
      message.error('删除失败')
    }
  }

  const visibleQuestions = useMemo(() => {
    const qs = current?.questions || []
    return showBookmarkedOnly ? qs.filter((q) => q.is_bookmarked) : qs
  }, [current, showBookmarkedOnly])

  const bookmarkCount = useMemo(
    () => (current?.questions || []).filter((q) => q.is_bookmarked).length,
    [current],
  )

  if (!token) return <AuthGate activeKey="interview" />

  return (
    <AppLayout
      activeKey="interview"
      title="AI 面试押题"
      subtitle="基于你的真实经历与目标岗位，预测高概率面试题并给出答题框架"
    >
      <div className="app-page-enter">
        <Row gutter={[16, 16]}>
          {/* 左侧：配置 + 历史 */}
          <Col xs={24} lg={7}>
            <div className="app-card" style={{ padding: 20 }}>
              <div className="app-section-title" style={{ marginBottom: 14 }}>
                <ThunderboltOutlined style={{ color: 'var(--primary-600)' }} /> 生成押题
              </div>

              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 6 }}>
                  <FileTextOutlined /> 选择简历
                </div>
                <Select
                  style={{ width: '100%' }}
                  placeholder={resumeList.length ? '选择简历' : '暂无已解析的简历'}
                  value={resumeId}
                  onChange={setResumeId}
                  allowClear
                  options={resumeList.map((r) => ({
                    value: r.id,
                    label: r.title || (r.parsed_json?.personal_info?.name) || '未命名简历',
                  }))}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 6 }}>
                  <FileSearchOutlined /> 目标岗位
                </div>
                <Select
                  style={{ width: '100%' }}
                  placeholder={jobList.length ? '选择岗位（可选）' : '暂无岗位'}
                  value={jobId}
                  onChange={setJobId}
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={jobList.map((j) => ({
                    value: j.id,
                    label: [j.title || '未命名岗位', j.company].filter(Boolean).join(' @ '),
                  }))}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 6 }}>
                  题目数量：{questionCount} 道
                </div>
                <Slider min={3} max={15} value={questionCount} onChange={setQuestionCount} />
              </div>

              <Button
                type="primary"
                block
                size="large"
                icon={<TeamOutlined />}
                loading={generating}
                onClick={handleGenerate}
              >
                {generating ? 'AI 正在押题…' : '开始押题'}
              </Button>

              <div style={{ fontSize: 11, color: 'var(--text-quaternary)', marginTop: 10, lineHeight: 1.6 }}>
                题目来自你的简历细节与目标岗位要求，每日额度内可用。建议先自己答一遍，再对照参考答案。
              </div>
            </div>

            <div className="app-card" style={{ padding: 20, marginTop: 16 }}>
              <div className="app-section-title" style={{ marginBottom: 10 }}>
                <HistoryOutlined style={{ color: 'var(--primary-600)' }} /> 历史押题
              </div>
              {loadingList ? (
                <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div>
              ) : sessions.length ? (
                <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                  {sessions.map((s) => {
                    const active = current?.id === s.id
                    return (
                      <div
                        key={s.id}
                        onClick={() => openSession(s.id)}
                        style={{
                          padding: '10px 12px', borderRadius: 8, marginBottom: 8, cursor: 'pointer',
                          background: active ? 'var(--primary-50)' : 'var(--bg-page)',
                          border: active ? '1px solid var(--primary-200)' : '1px solid transparent',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {s.job_title || '通用押题'}
                          </span>
                          <Popconfirm title="删除这次押题？" onConfirm={(e) => { e?.stopPropagation(); handleDeleteSession(s.id) }} onCancel={(e) => e?.stopPropagation()}>
                            <Button type="text" size="small" icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
                          </Popconfirm>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                          {s.company ? `@ ${s.company} · ` : ''}{s.question_count} 题 · {new Date(s.created_at || '').toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </div>
                        {s.status === 'failed' && <Tag color="red" style={{ marginTop: 4 }}>生成失败</Tag>}
                        {s.status !== 'completed' && s.status !== 'failed' && <Tag color="blue" style={{ marginTop: 4 }}>生成中</Tag>}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有押题记录" />
              )}
            </div>
          </Col>

          {/* 右侧：题目区 */}
          <Col xs={24} lg={17}>
            {generating && !current?.questions?.length && (
              <div className="app-card" style={{ padding: 60, textAlign: 'center' }}>
                <Spin size="large" />
                <div style={{ marginTop: 16, color: 'var(--text-secondary)' }}>
                  AI 正在结合你的经历出题中，通常需要 20~60 秒…
                </div>
                <Progress percent={60} status="active" showInfo={false} style={{ maxWidth: 360, margin: '18px auto 0' }} />
              </div>
            )}

            {!generating && !current && (
              <div className="app-card" style={{ padding: 80, textAlign: 'center' }}>
                <TeamOutlined style={{ fontSize: 44, color: 'var(--primary-300)' }} />
                <div style={{ marginTop: 16, fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
                  选择简历和岗位，开始生成面试押题
                </div>
                <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-secondary)', maxWidth: 460, margin: '8px auto 0' }}>
                  系统会围绕你的项目细节、岗位硬性要求和常见行为面试问题出题，每题附考察点与答题要点。
                </div>
              </div>
            )}

            {current && (
              <>
                {current.status === 'failed' && (
                  <Alert
                    type="error"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message="押题失败"
                    description={current.error_message || 'AI 服务暂时不可用，请稍后重试'}
                  />
                )}

                {current.overall_advice && (
                  <div className="app-card" style={{ padding: 20, marginBottom: 16 }}>
                    <div className="app-section-title" style={{ marginBottom: 10 }}>
                      <TrophyOutlined style={{ color: 'var(--warning-500)' }} /> 总体面试策略
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 1.9, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                      {current.overall_advice}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                  <Space>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      共 {current.questions.length} 题
                    </span>
                    <Tag color="blue">{current.job_title || '通用押题'}{current.company ? ` @ ${current.company}` : ''}</Tag>
                  </Space>
                  <Space>
                    <Button
                      size="small"
                      icon={<StarFilled style={{ color: bookmarkCount ? 'var(--warning-500)' : undefined }} />}
                      onClick={() => setShowBookmarkedOnly((v) => !v)}
                      type={showBookmarkedOnly ? 'primary' : 'default'}
                    >
                      只看收藏 {bookmarkCount ? `(${bookmarkCount})` : ''}
                    </Button>
                    <Button size="small" onClick={handleGenerate} disabled={generating}>
                      重新生成
                    </Button>
                  </Space>
                </div>

                {visibleQuestions.length ? (
                  visibleQuestions.map((q) => (
                    <QuestionCard
                      key={q.id}
                      item={q}
                      onToggleBookmark={handleToggleBookmark}
                      onSaveNote={handleSaveNote}
                    />
                  ))
                ) : (
                  <Empty description={showBookmarkedOnly ? '还没有收藏的题目' : '暂无题目'} />
                )}
              </>
            )}
          </Col>
        </Row>
      </div>
    </AppLayout>
  )
}
