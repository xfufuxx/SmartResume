'use client'

/** 对话主区：消息流（含题目/点评/复盘卡）+ 流式气泡 + 输入区。 */
import React, { useEffect, useRef } from 'react'
import { Alert, Badge, Button, Empty, Spin, Tag, Tooltip } from 'antd'
import {
  HistoryOutlined, ReloadOutlined, RobotOutlined, StopOutlined, UnorderedListOutlined,
} from '@ant-design/icons'

import Composer from './Composer'
import StageRail from './StageRail'
import { FeedbackBlock, QuestionBlock, ReportCard } from './blocks'
import { dedupeQuestionText, stageHeadline, stageKeyLabel, stageText, stripStreamingBlocks } from '@/lib/interview-chat'
import type {
  InterviewChatMessage, InterviewIntent, InterviewQuestion, InterviewSessionDetail,
} from '@/types'

export default function ChatStream({
  session,
  messages,
  streamText,
  streaming,
  loading,
  error,
  onSend,
  onControl,
  onStop,
  onBookmark,
  onOpenDrawer,
  onReset,
}: {
  session: InterviewSessionDetail
  messages: InterviewChatMessage[]
  streamText: string
  streaming: boolean
  loading: boolean
  error: string | null
  onSend: (text: string) => void
  onControl: (intent: InterviewIntent) => void
  onStop: () => void
  onBookmark: (q: InterviewQuestion) => void
  onOpenDrawer: () => void
  onReset: () => void
}) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const readOnly = (session.mode || 'quick') === 'quick'
  const finished = session.stage === 'finished'
  const target = session.target_count || 0
  const asked = session.question_count || 0
  const plan = session.plan || []
  const stageKey = session.stage_key || null
  const visible = stripStreamingBlocks(streamText)

  useEffect(() => {
    const el = bodyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, streamText, streaming])

  return (
    <div className="app-card mock-chat" data-testid="mock-chat">
      <div className="mock-chat-head">
        <div className="mock-chat-title">
          <div className="mock-chat-title-main">
            {session.title || session.job_title || '模拟面试'}
            {readOnly && <Tag style={{ marginLeft: 8 }}>快速押题 · 只读</Tag>}
          </div>
          <div className="mock-chat-sub">
            <Tag color={finished ? 'default' : 'blue'}>
              {finished ? stageText('finished') : stageKeyLabel(session.stage_key) || stageText(session.stage)}
            </Tag>
            {!readOnly && !!plan.length && (
              <span className="mock-chat-stage" data-testid="mock-stage-headline">
                {stageHeadline(plan, session.stage_key)}
              </span>
            )}
            {session.job_title && <span>{session.job_title}{session.company ? ` @ ${session.company}` : ''}</span>}
            <span>已出 {asked}{target ? ` / 目标 ${target}` : ''} 题</span>
          </div>
        </div>
        <div className="mock-chat-tools">
          <Badge count={session.questions?.length || 0} size="small" color="var(--primary-500)">
            <Button size="small" icon={<UnorderedListOutlined />} onClick={onOpenDrawer} data-testid="mock-open-drawer">
              {readOnly ? '押题题单' : '本场题目'}
            </Button>
          </Badge>
          {!readOnly && !finished && (
            <Tooltip title="结束本轮并生成复盘">
              <Button size="small" onClick={() => onControl('finish')} disabled={streaming} data-testid="mock-finish">
                结束模拟
              </Button>
            </Tooltip>
          )}
          <Button size="small" icon={<ReloadOutlined />} onClick={onReset} data-testid="mock-reset">
            {finished || readOnly ? '新开一场' : '重开'}
          </Button>
        </div>
      </div>

      {/* 真实面试的环节进度：只读的旧版快速押题没有环节，不显示 */}
      {!readOnly && <StageRail plan={plan} stageKey={stageKey} asked={asked} finished={finished} />}

      <div className="mock-chat-body" ref={bodyRef} data-testid="mock-messages">
        {loading && !messages.length ? (
          <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>
        ) : !messages.length && !streaming ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有对话内容" />
        ) : (
          messages.map((m) => {
            // 题干已经渲染成卡片，正文里重复的那句要剥掉，否则每轮都念两遍
            const bubble = dedupeQuestionText(m.content || '', m.payload?.question?.question)
            return (
            <div key={m.id} className={`mock-msg ${m.role}`} data-testid={`mock-msg-${m.role}`}>
              {m.role === 'assistant' && <div className="mock-avatar"><RobotOutlined /></div>}
              <div className="mock-bubble-wrap">
                {bubble && <div className="mock-bubble">{bubble}</div>}
                {m.payload?.feedback && <FeedbackBlock feedback={m.payload.feedback} />}
                {m.payload?.question && (
                  <QuestionBlock
                    item={m.payload.question}
                    index={(m.payload.question.order_index || 0) + 1}
                    stageKey={m.payload.stage_key}
                    followup={!!m.payload.followup}
                    onBookmark={readOnly ? undefined : onBookmark}
                  />
                )}
                {m.payload?.summary && (
                  <ReportCard summary={m.payload.summary} plan={plan} onRestart={onReset} />
                )}
              </div>
            </div>
            )
          })
        )}

        {streaming && (
          <div className="mock-msg assistant" data-testid="mock-msg-streaming">
            <div className="mock-avatar"><RobotOutlined /></div>
            <div className="mock-bubble-wrap">
              <div className="mock-bubble">
                {visible}
                {!visible && <span className="mock-typing"><i /><i /><i /></span>}
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <Alert
          type="error"
          showIcon
          closable
          message={error}
          style={{ margin: '0 16px 8px' }}
          data-testid="mock-error"
        />
      )}

      {readOnly ? (
        <div className="mock-readonly-bar">
          <HistoryOutlined /> 这是旧版「快速押题」记录，只能查看；想模拟真实问答请新开一场。
        </div>
      ) : finished ? (
        <div className="mock-readonly-bar">
          <StopOutlined /> 本次模拟已结束。复盘在上方，可点「新开一场」换个岗位再练。
        </div>
      ) : (
        <Composer
          stage={session.stage}
          stageKey={stageKey}
          askedCount={asked}
          streaming={streaming}
          onSend={onSend}
          onControl={onControl}
          onStop={onStop}
        />
      )}
    </div>
  )
}
