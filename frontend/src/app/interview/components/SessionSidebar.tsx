'use client'

/** 左栏：历史模拟会话。 */
import React from 'react'
import { Button, Empty, Popconfirm, Spin, Tag } from 'antd'
import { DeleteOutlined, HistoryOutlined } from '@ant-design/icons'

import type { InterviewSessionItem } from '@/types'

function fmt(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function SessionSidebar({
  sessions,
  activeId,
  loading,
  onOpen,
  onDelete,
}: {
  sessions: InterviewSessionItem[]
  activeId?: string
  loading: boolean
  onOpen: (id: string) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="app-card mock-side" style={{ padding: 16, marginTop: 16 }}>
      <div className="app-section-title" style={{ marginBottom: 10 }}>
        <HistoryOutlined style={{ color: 'var(--primary-600)' }} /> 历史模拟
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 16 }}><Spin size="small" /></div>
      ) : !sessions.length ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有记录" />
      ) : (
        <div className="mock-side-list">
          {sessions.map((s) => {
            const active = activeId === s.id
            const title = s.title || (s.job_title ? `${s.job_title} · 模拟面试` : '通用模拟面试')
            return (
              <div
                key={s.id}
                className={`mock-side-item${active ? ' active' : ''}`}
                data-testid="mock-session-item"
                data-session-id={s.id}
                onClick={() => onOpen(s.id)}
              >
                <div className="mock-side-row">
                  <span className="mock-side-title">{title}</span>
                  <Popconfirm
                    title="删除这次记录？"
                    onConfirm={(e) => { e?.stopPropagation(); onDelete(s.id) }}
                    onCancel={(e) => e?.stopPropagation()}
                  >
                    <Button
                      type="text"
                      size="small"
                      aria-label="删除"
                      icon={<DeleteOutlined />}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </Popconfirm>
                </div>
                <div className="mock-side-meta">
                  {s.mode === 'quick' && <Tag>快速</Tag>}
                  {s.mode !== 'quick' && (
                    <Tag color={s.stage === 'finished' ? 'default' : 'blue'}>
                      {s.stage === 'finished' ? '已复盘' : '进行中'}
                    </Tag>
                  )}
                  {s.status === 'failed' && <Tag color="red">失败</Tag>}
                  {s.status === 'pending' && <Tag color="blue">生成中</Tag>}
                  <span>{s.question_count || 0} 题</span>
                  <span>{fmt(s.created_at)}</span>
                </div>
                {s.last_message && <div className="mock-side-last">{s.last_message}</div>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
