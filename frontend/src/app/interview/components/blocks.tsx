'use client'

/** 模拟押题的结构化卡片：题目 / 点评 / 复盘。纯展示，动作由页面回传。 */
import React, { useState } from 'react'
import { Button, Tag, Tooltip } from 'antd'
import {
  BulbOutlined, CheckCircleOutlined, CloseCircleOutlined, StarFilled, StarOutlined,
  ThunderboltOutlined, TrophyOutlined,
} from '@ant-design/icons'

import type { InterviewFeedback, InterviewQuestion, InterviewSummary } from '@/types'

const CATEGORY_COLOR: Record<string, string> = {
  技术能力: 'blue',
  项目深挖: 'purple',
  行为面试: 'orange',
  岗位匹配: 'green',
  职业规划: 'cyan',
}

const DIFFICULTY_COLOR: Record<string, string> = {
  简单: 'green',
  中等: 'gold',
  困难: 'red',
}

export function QuestionBlock({
  item,
  index,
  onBookmark,
}: {
  item: InterviewQuestion
  index: number
  onBookmark?: (q: InterviewQuestion) => void
}) {
  const [showOutline, setShowOutline] = useState(false)
  const [showSample, setShowSample] = useState(false)

  return (
    <div className="mock-q" data-testid="mock-question-card">
      <div className="mock-q-head">
        <span className="mock-q-no">{index}</span>
        {item.category && <Tag color={CATEGORY_COLOR[item.category] || 'default'}>{item.category}</Tag>}
        {item.difficulty && <Tag color={DIFFICULTY_COLOR[item.difficulty] || 'default'}>{item.difficulty}</Tag>}
        {onBookmark && (
          <Tooltip title={item.is_bookmarked ? '取消收藏' : '收藏这道题'}>
            <Button
              type="text"
              size="small"
              data-testid="mock-bookmark"
              aria-label={item.is_bookmarked ? '取消收藏' : '收藏这道题'}
              icon={item.is_bookmarked
                ? <StarFilled style={{ color: 'var(--warning-500)' }} />
                : <StarOutlined />}
              onClick={() => onBookmark(item)}
            />
          </Tooltip>
        )}
      </div>
      <div className="mock-q-text" data-testid="mock-question-text">{item.question}</div>
      {item.intent && (
        <div className="mock-q-intent">
          <BulbOutlined style={{ color: 'var(--warning-500)' }} /> 考察点：{item.intent}
        </div>
      )}
      {!!item.answer_outline?.length && (
        <div className="mock-q-actions">
          <Button type="link" size="small" onClick={() => setShowOutline((v) => !v)}>
            {showOutline ? '收起答题要点' : '看答题要点'}
          </Button>
        </div>
      )}
      {showOutline && !!item.answer_outline?.length && (
        <ol className="mock-outline">
          {item.answer_outline.map((line, i) => <li key={i}>{line}</li>)}
        </ol>
      )}
      {item.sample_answer && (
        <>
          <div className="mock-q-actions">
            <Button type="link" size="small" onClick={() => setShowSample((v) => !v)}>
              {showSample ? '收起参考答案' : '看参考答案'}
            </Button>
          </div>
          {showSample && <div className="mock-sample">{item.sample_answer}</div>}
        </>
      )}
    </div>
  )
}

export function FeedbackBlock({ feedback }: { feedback: InterviewFeedback }) {
  return (
    <div className="mock-feedback" data-testid="mock-feedback">
      <div className="mock-feedback-head">
        <span><ThunderboltOutlined style={{ color: 'var(--primary-500)' }} /> 本轮点评</span>
        <Tag color={feedback.score >= 4 ? 'green' : feedback.score >= 3 ? 'gold' : 'red'}>
          {feedback.score}/5
        </Tag>
      </div>
      <div className="mock-feedback-cols">
        {!!feedback.hits?.length && (
          <div>
            <div className="mock-feedback-label ok"><CheckCircleOutlined /> 答到了</div>
            <ul>{feedback.hits.map((h, i) => <li key={i}>{h}</li>)}</ul>
          </div>
        )}
        {!!feedback.gaps?.length && (
          <div>
            <div className="mock-feedback-label miss"><CloseCircleOutlined /> 还可以补</div>
            <ul>{feedback.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
          </div>
        )}
      </div>
      {feedback.advice && <div className="mock-feedback-advice">建议：{feedback.advice}</div>}
    </div>
  )
}

export function ReportCard({
  summary,
  onRestart,
}: {
  summary: InterviewSummary
  onRestart?: () => void
}) {
  const coverage = Object.entries(summary.coverage || {})
  return (
    <div className="mock-report" data-testid="mock-report">
      <div className="mock-report-head">
        <span><TrophyOutlined style={{ color: 'var(--warning-500)' }} /> 本次模拟复盘</span>
        {onRestart && <Button size="small" onClick={onRestart}>再来一轮</Button>}
      </div>
      {summary.fallback && (
        <div className="mock-report-fallback">
          本次没有生成结构化建议，以下为 AI 文字复盘与本次出题的覆盖度统计。
        </div>
      )}
      {!!coverage.length && (
        <div className="mock-report-row">
          <span className="mock-report-label">覆盖度</span>
          <span className="mock-report-tags">
            {coverage.map(([key, value]) => <Tag key={key}>{key} ×{value}</Tag>)}
          </span>
        </div>
      )}
      {!!summary.strong?.length && (
        <div className="mock-report-row">
          <span className="mock-report-label ok">强项</span>
          <ul className="mock-report-list">{summary.strong.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      )}
      {!!summary.weak?.length && (
        <div className="mock-report-row">
          <span className="mock-report-label miss">短板</span>
          <ul className="mock-report-list">{summary.weak.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      )}
      {!!summary.actions?.length && (
        <div className="mock-report-row">
          <span className="mock-report-label">行动</span>
          <ol className="mock-report-list">{summary.actions.map((s, i) => <li key={i}>{s}</li>)}</ol>
        </div>
      )}
    </div>
  )
}
