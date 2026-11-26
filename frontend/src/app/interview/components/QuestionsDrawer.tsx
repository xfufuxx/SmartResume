'use client'

/** 题目抽屉：按考察维度分组，可收藏、记笔记、看要点。
 *
 * 标题按会话类型区分——对话式是「本场题目」（真的已经问过的题），
 * 一次性快速押题才是「押题题单」（还没问、只是预测）。
 */
import React, { useEffect, useState } from 'react'
import { Button, Drawer, Empty, Input, Tag, message } from 'antd'
import { BulbOutlined, SaveOutlined, StarFilled, StarOutlined } from '@ant-design/icons'

import { interview } from '@/lib/api'
import { groupQuestionsByCategory } from '@/lib/interview-chat'
import type { InterviewQuestion } from '@/types'

function NoteEditor({ item, onSaved }: { item: InterviewQuestion; onSaved: (note: string) => void }) {
  const [note, setNote] = useState(item.note || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => { setNote(item.note || '') }, [item.id, item.note])

  return (
    <div className="mock-note">
      <Input.TextArea
        value={note}
        rows={2}
        maxLength={4000}
        placeholder="记一句自己的回答思路（只自己可见）"
        onChange={(e) => setNote(e.target.value)}
      />
      <Button
        size="small"
        icon={<SaveOutlined />}
        loading={saving}
        disabled={note === (item.note || '')}
        onClick={async () => {
          setSaving(true)
          try {
            await interview.saveNote(item.id, note)
            onSaved(note)
            message.success('笔记已保存')
          } catch {
            message.error('保存失败')
          } finally {
            setSaving(false)
          }
        }}
      >
        保存笔记
      </Button>
    </div>
  )
}

export default function QuestionsDrawer({
  open,
  questions,
  mode,
  onClose,
  onBookmark,
  onNoteSaved,
}: {
  open: boolean
  questions: InterviewQuestion[]
  mode?: 'chat' | 'quick'
  onClose: () => void
  onBookmark: (q: InterviewQuestion) => void
  onNoteSaved: (id: string, note: string) => void
}) {
  const groups = groupQuestionsByCategory(questions)
  const [expanded, setExpanded] = useState<string | null>(null)
  const quick = mode === 'quick'

  return (
    <Drawer
      title={`${quick ? '押题题单' : '本场题目'}（${questions.length} 题）`}
      open={open}
      onClose={onClose}
      width={440}
      data-testid="mock-drawer"
    >
      {!questions.length ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={quick ? '还没有生成题目' : '这一场还没问到题'} />
      ) : (
        groups.map((group) => (
          <div key={group.category} className="mock-drawer-group">
            <div className="mock-drawer-group-title">{group.category} · {group.items.length}</div>
            {group.items.map((q) => {
              const expandedHere = expanded === q.id
              return (
                <div key={q.id} className="mock-drawer-item" data-testid="mock-drawer-item">
                  <div className="mock-drawer-q">
                    <span onClick={() => setExpanded(expandedHere ? null : q.id)}>{q.question}</span>
                    <Button
                      type="text"
                      size="small"
                      aria-label={q.is_bookmarked ? '取消收藏' : '收藏'}
                      icon={q.is_bookmarked
                        ? <StarFilled style={{ color: 'var(--warning-500)' }} />
                        : <StarOutlined />}
                      onClick={() => onBookmark(q)}
                    />
                  </div>
                  <div className="mock-drawer-tags">
                    {q.difficulty && <Tag>{q.difficulty}</Tag>}
                    {q.is_bookmarked && <Tag color="gold">已收藏</Tag>}
                    <button type="button" className="mock-link" onClick={() => setExpanded(expandedHere ? null : q.id)}>
                      {expandedHere ? '收起' : '展开要点与笔记'}
                    </button>
                  </div>
                  {expandedHere && (
                    <>
                      {q.intent && <div className="mock-q-intent"><BulbOutlined /> 考察点：{q.intent}</div>}
                      {!!q.answer_outline?.length && (
                        <ol className="mock-outline">{q.answer_outline.map((o, i) => <li key={i}>{o}</li>)}</ol>
                      )}
                      <NoteEditor item={q} onSaved={(note) => onNoteSaved(q.id, note)} />
                    </>
                  )}
                </div>
              )
            })}
          </div>
        ))
      )}
    </Drawer>
  )
}
