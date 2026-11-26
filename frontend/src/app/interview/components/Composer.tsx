'use client'

/** 对话输入区：快捷操作 chips + 多行输入 + 发送/停止。 */
import React, { useState } from 'react'
import { Button, Input } from 'antd'
import { SendOutlined, StopOutlined } from '@ant-design/icons'

import { quickReplies, stageNote } from '@/lib/interview-chat'
import type { InterviewIntent, InterviewStage, InterviewStageKey } from '@/types'

const { TextArea } = Input

export default function Composer({
  stage,
  stageKey,
  askedCount,
  streaming,
  disabled,
  onSend,
  onControl,
  onStop,
}: {
  stage?: InterviewStage | null
  stageKey?: InterviewStageKey | null
  askedCount: number
  streaming: boolean
  disabled?: boolean
  onSend: (text: string) => void
  onControl: (intent: InterviewIntent) => void
  onStop: () => void
}) {
  const [text, setText] = useState('')
  const chips = quickReplies(stage, askedCount, stageKey)

  const send = () => {
    const value = text.trim()
    if (!value || streaming || disabled) return
    setText('')
    onSend(value)
  }

  return (
    <div className="mock-composer">
      {!!chips.length && !streaming && (
        <div className="mock-chips" data-testid="mock-chips">
          {chips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              className="mock-chip"
              onClick={() => {
                if (chip.intent) onControl(chip.intent)
                else onSend(chip.label)
              }}
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}

      <TextArea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={askedCount ? stageNote(stageKey) : '面试官正在开场，点「开始吧」即可'}
        autoSize={{ minRows: 1, maxRows: 4 }}
        maxLength={4000}
        disabled={streaming || disabled}
        data-testid="mock-input"
        onPressEnter={(e) => {
          if (!e.shiftKey) {
            e.preventDefault()
            send()
          }
        }}
      />

      <div className="mock-composer-foot">
        <span className="mock-composer-tip">Enter 发送 · Shift + Enter 换行</span>
        {streaming ? (
          <Button danger icon={<StopOutlined />} onClick={onStop} data-testid="mock-stop">
            停止生成
          </Button>
        ) : (
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={send}
            disabled={!text.trim() || disabled}
            data-testid="mock-send"
          >
            发送
          </Button>
        )}
      </div>
    </div>
  )
}
