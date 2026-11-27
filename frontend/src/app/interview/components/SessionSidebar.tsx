'use client'

/** 左栏：历史模拟会话。支持批量管理模式（勾选 → 全选 → 批量删除）。 */
import React, { useState } from 'react'
import { Button, Checkbox, Empty, Popconfirm, Spin, Tag } from 'antd'
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
  onBatchDelete,
}: {
  sessions: InterviewSessionItem[]
  activeId?: string
  loading: boolean
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  /** 批量删除：返回实际删除数（>0 时自动退出批量模式）；失败抛错由父级提示 */
  onBatchDelete: (ids: string[]) => Promise<number>
}) {
  const [batchMode, setBatchMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const exitBatch = () => {
    setBatchMode(false)
    setSelected(new Set())
  }

  const allSelected = sessions.length > 0 && selected.size === sessions.length
  const confirmBatchDelete = async () => {
    setDeleting(true)
    try {
      const deleted = await onBatchDelete(Array.from(selected))
      if (deleted > 0) exitBatch()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="app-card mock-side" style={{ padding: 16, marginTop: 16 }}>
      <div className="mock-side-head">
        <div className="app-section-title" style={{ marginBottom: 0 }}>
          <HistoryOutlined style={{ color: 'var(--primary-600)' }} /> 历史模拟
        </div>
        {!batchMode && sessions.length > 0 && (
          <Button
            size="small"
            type="text"
            onClick={() => setBatchMode(true)}
            data-testid="mock-batch-toggle"
          >
            批量管理
          </Button>
        )}
      </div>

      {batchMode && (
        <div className="mock-side-toolbar" data-testid="mock-batch-bar">
          <Checkbox
            checked={allSelected}
            indeterminate={selected.size > 0 && !allSelected}
            onChange={(e) => setSelected(e.target.checked ? new Set(sessions.map((s) => s.id)) : new Set())}
            data-testid="mock-batch-all"
          >
            全选
          </Checkbox>
          <span className="mock-side-toolbar-count">已选 {selected.size} 条</span>
          <Popconfirm
            title={`删除所选 ${selected.size} 条记录？`}
            description="删除后无法恢复，包含其中的题目与复盘。"
            okText="删除"
            okButtonProps={{ danger: true }}
            cancelText="取消"
            onConfirm={confirmBatchDelete}
            disabled={selected.size === 0}
          >
            <Button
              size="small"
              danger
              disabled={selected.size === 0}
              loading={deleting}
              icon={<DeleteOutlined />}
              data-testid="mock-batch-delete"
            >
              删除所选
            </Button>
          </Popconfirm>
          <Button size="small" type="text" onClick={exitBatch}>
            取消
          </Button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 16 }}><Spin size="small" /></div>
      ) : !sessions.length ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有记录" />
      ) : (
        <div className="mock-side-list">
          {sessions.map((s) => {
            const active = activeId === s.id
            const checked = selected.has(s.id)
            const title = s.title || (s.job_title ? `${s.job_title} · 模拟面试` : '通用模拟面试')
            return (
              <div
                key={s.id}
                className={`mock-side-item${active ? ' active' : ''}${batchMode ? ' selectable' : ''}${checked ? ' checked' : ''}`}
                data-testid="mock-session-item"
                data-session-id={s.id}
                onClick={() => (batchMode ? toggle(s.id) : onOpen(s.id))}
              >
                {batchMode && (
                  /* Checkbox 点击会同时触发外层行 onClick，包一层 stopPropagation 防止双重切换 */
                  <span className="mock-side-check" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={checked} onChange={() => toggle(s.id)} />
                  </span>
                )}
                <div className="mock-side-main">
                  <div className="mock-side-row">
                    <span className="mock-side-title">{title}</span>
                    {!batchMode && (
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
                    )}
                  </div>
                  <div className="mock-side-meta">
                    {s.mode === 'quick' && <Tag>快速</Tag>}
                    {s.mode !== 'quick' && (
                      <Tag color={s.stage === 'finished' ? 'default' : 'blue'}>
                        {s.stage === 'finished' ? '已结束' : '进行中'}
                      </Tag>
                    )}
                    {s.status === 'failed' && <Tag color="red">失败</Tag>}
                    {s.status === 'pending' && <Tag color="blue">生成中</Tag>}
                    <span>{s.question_count || 0} 题</span>
                    <span>{fmt(s.created_at)}</span>
                  </div>
                  {s.last_message && <div className="mock-side-last">{s.last_message}</div>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
