'use client'

/**
 * 模拟面试（原「AI 面试押题」/「模拟押题」）：对话式模拟面试官。
 *
 * 交互：选简历/岗位 → AI 开场并逐题发问 → 用户作答 → 点评 + 追问/下一题 → 复盘。
 * 旧版「快速押题」会话以只读形式回放；接口 /api/interview 保持兼容。
 */
import React, { useCallback, useEffect, useState } from 'react'
import { Button, Col, Row, Tag, message } from 'antd'
import {
  CommentOutlined, FileTextOutlined, RobotOutlined, TeamOutlined, ThunderboltOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'

import AppLayout from '@/components/AppLayout'
import AuthGate from '@/components/AuthGate'
import ConfigPanel from './components/ConfigPanel'
import ChatStream from './components/ChatStream'
import QuestionsDrawer from './components/QuestionsDrawer'
import SessionSidebar from './components/SessionSidebar'
import { interview, jobs, resumes } from '@/lib/api'
import { getToken } from '@/lib/auth'
import { stageHeadline, stageKeyLabel } from '@/lib/interview-chat'
import { useMockInterview } from '@/hooks/useMockInterview'
import type {
  InterviewQuestion, InterviewSessionItem, InterviewSessionDetail, ResumeRecord,
} from '@/types'

interface JobOption {
  id: string
  title?: string | null
  company?: string | null
  category?: string | null
}

function fmt(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function MockInterviewPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [resumeList, setResumeList] = useState<ResumeRecord[]>([])
  const [jobList, setJobList] = useState<JobOption[]>([])
  const [resumeId, setResumeId] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [count, setCount] = useState(8)
  const [sessions, setSessions] = useState<InterviewSessionItem[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const mock = useMockInterview()
  const {
    session, messages, streamText, streaming, loading, error,
    quickGenerating, finishedTick, start, answer, control, openSession, generateQuick,
    updateQuestion, remove, reset, stop,
  } = mock

  useEffect(() => {
    const t = getToken()
    if (!t) { router.push('/login'); return }
    setToken(t)
  }, [router])

  const loadSessions = useCallback(async () => {
    setLoadingList(true)
    try {
      const res = await interview.listSessions()
      setSessions((res.data || []) as InterviewSessionItem[])
    } catch {
      /* 静默：历史列表失败不阻断主流程 */
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
        const rs = ((rRes.data || []) as ResumeRecord[]).filter((r) => !!r.parsed_json)
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

  // 复盘轮次完成时刷新历史列表（标题、状态、题数、最近消息）。
  // 注意不能依赖 session.stage：meta 事件会提前把本地 stage 置成 finished，
  // 那时后端尚未提交，拉到的还是「进行中」；而轮次结束后 stage 值不再变化、永不重刷。
  // finishedTick 只在后端 commit 之后的 turn 事件里自增，是精确触发器。
  useEffect(() => {
    if (finishedTick) loadSessions()
  }, [finishedTick, loadSessions])

  const handleStart = async () => {
    if (!resumeId && !jobId) {
      message.warning('请至少选择一份简历或一个岗位')
      return
    }
    await start({ resume_id: resumeId, job_image_id: jobId, question_count: count })
    loadSessions()
  }

  const handleQuick = async () => {
    if (!resumeId && !jobId) {
      message.warning('请至少选择一份简历或一个岗位')
      return
    }
    await generateQuick({ resume_id: resumeId, job_image_id: jobId, question_count: count })
    loadSessions()
  }

  const handleOpen = async (id: string) => {
    setDrawerOpen(false)
    await openSession(id)
  }

  const handleDelete = async (id: string) => {
    try {
      await remove(id)
      message.success('已删除')
      loadSessions()
    } catch {
      message.error('删除失败')
    }
  }

  const handleBookmark = async (q: InterviewQuestion) => {
    try {
      const res = await interview.toggleBookmark(q.id)
      updateQuestion(q.id, { is_bookmarked: !!(res.data as { is_bookmarked?: boolean })?.is_bookmarked })
    } catch {
      message.error('操作失败')
    }
  }

  const handleNoteSaved = (id: string, note: string) => updateQuestion(id, { note })

  if (!token) return <AuthGate activeKey="interview" />

  const current = session as InterviewSessionDetail | null

  return (
    <AppLayout
      activeKey="interview"
      title="模拟面试"
      subtitle="AI 面试官按你的简历与目标岗位逐题发问，答完即点评，最后给复盘"
    >
      <div className="app-page-enter mock-interview">
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={7}>
            {!current ? (
              <ConfigPanel
                resumes={resumeList}
                jobs={jobList}
                resumeId={resumeId}
                jobId={jobId}
                count={count}
                onResumeChange={setResumeId}
                onJobChange={setJobId}
                onCountChange={setCount}
                onStart={handleStart}
                starting={loading}
                onQuick={handleQuick}
                quickGenerating={quickGenerating}
              />
            ) : (
              <div className="app-card mock-current" style={{ padding: 18 }}>
                <div className="mock-current-title">{current.title || current.job_title || '模拟面试'}</div>
                <div className="mock-current-meta">
                  <Tag color={current.stage === 'finished' ? 'default' : 'blue'}>
                    {current.stage === 'finished'
                      ? '已复盘'
                      : stageKeyLabel(current.stage_key) || '面试中'}
                  </Tag>
                  {current.mode === 'quick' && <Tag>快速押题 · 只读</Tag>}
                </div>
                <div className="mock-current-rows">
                  {current.company && (
                    <div><span>公司</span><b>{current.company}</b></div>
                  )}
                  {current.mode !== 'quick' && !!current.plan?.length && (
                    <div>
                      <span>环节</span>
                      <b>{stageHeadline(current.plan, current.stage_key) || '—'}</b>
                    </div>
                  )}
                  <div>
                    <span>进度</span>
                    <b>
                      {current.target_count
                        ? `${current.question_count || 0} / ${current.target_count} 题`
                        : `${current.question_count || 0} 题`}
                    </b>
                  </div>
                  <div><span>开始</span><b>{fmt(current.created_at)}</b></div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <Button block size="small" icon={<FileTextOutlined />} onClick={() => setDrawerOpen(true)}>
                    {current.mode === 'quick' ? '押题题单' : '本场题目'}
                  </Button>
                  <Button block size="small" icon={<CommentOutlined />} onClick={reset}>
                    新开一场
                  </Button>
                </div>
              </div>
            )}

            <SessionSidebar
              sessions={sessions}
              activeId={current?.id}
              loading={loadingList}
              onOpen={handleOpen}
              onDelete={handleDelete}
            />
          </Col>

          <Col xs={24} lg={17}>
            {current ? (
              <ChatStream
                session={current}
                messages={messages}
                streamText={streamText}
                streaming={streaming}
                loading={loading}
                error={error}
                onSend={answer}
                onControl={control}
                onStop={stop}
                onBookmark={handleBookmark}
                onOpenDrawer={() => setDrawerOpen(true)}
                onReset={reset}
              />
            ) : (
              <div className="app-card mock-intro">
                <div className="mock-intro-icon"><RobotOutlined /></div>
                <h2>模拟一场，比背十道题有用</h2>
                <p>
                  它会先读你的简历和目标岗位，再按真实面试的顺序走：
                  自我介绍 → 简历深挖 → 专业能力 → 行为面试 → 求职动机 → 你反问；
                  目标题数多时还会问薪资与到岗。
                  每答完一题先给点评，再追问或换题，最后给一份带环节覆盖的复盘。
                </p>
                <div className="mock-intro-steps">
                  <div><span>1</span><b>选简历和岗位</b><em>决定问什么，越具体越贴近真实</em></div>
                  <div><span>2</span><b>走完面试全流程</b><em>一次一题，可要提示、跳过、随时结束</em></div>
                  <div><span>3</span><b>拿复盘</b><em>环节覆盖、强项短板、3 条行动建议</em></div>
                </div>
                <div className="mock-intro-foot">
                  <TeamOutlined /> 题目为 AI 预测，不是真题；不会给出录用结论。
                  <ThunderboltOutlined style={{ marginLeft: 12 }} /> 每场约 10~15 分钟
                </div>
              </div>
            )}
          </Col>
        </Row>

        <QuestionsDrawer
          open={drawerOpen}
          questions={current?.questions || []}
          mode={current?.mode}
          onClose={() => setDrawerOpen(false)}
          onBookmark={handleBookmark}
          onNoteSaved={handleNoteSaved}
        />
      </div>
    </AppLayout>
  )
}
