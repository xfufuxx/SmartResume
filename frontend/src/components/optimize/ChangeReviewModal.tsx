'use client'

/**
 * AI 修改逐条确认弹窗（P0）：
 * 「AI 建议 → 用户逐条确认 → 写入新版本」。
 *
 * - 每条建议：修改前/后对照（复用 diffSegments 高亮），可【接受】【拒绝】；
 *   editable 条目支持「编辑后接受」（在文本框里改 AI 建议文案）。
 * - 顶部快捷操作：全部接受 / 全部拒绝；底部「应用 N 条修改」生成人工确认版新记录，
 *   不覆盖原优化结果（新记录经 parent_record_id 挂进简历版本树）。
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal, Button, Tag, Empty, Space, Spin, Input, message } from 'antd'
import {
  CheckCircleFilled, CloseCircleFilled, EditOutlined, ThunderboltOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import { optimize } from '@/lib/api'
import { diffSegments } from '@/lib/diff'
import { useTheme } from '@/lib/theme'
import type { ChangeItem, ChangeApplyDecision, FactCheck } from '@/types'

interface ChangeReviewModalProps {
  open: boolean
  recordId: string | null
  onClose: () => void
  /** 应用成功后回调（参数为新记录 id），页面可据此刷新结果或提示 */
  onApplied?: (newRecordId: string) => void
}

type Decision = { action: 'accept' | 'reject'; text?: string }

const KIND_META: Record<ChangeItem['kind'], { label: string; color: string }> = {
  added: { label: '新增', color: 'green' },
  removed: { label: '移除', color: 'red' },
  modified: { label: '改写', color: 'blue' },
}

/** 事实核验徽标（P0-4）：✅ 来源于原始简历 / ⚠ 各类需确认警告 */
function FactBadges({ fc }: { fc?: FactCheck | null }) {
  if (!fc || fc.flags.length === 0) return null
  if (fc.level === 'ok') {
    return (
      <Tag color="success" style={{ fontSize: 12, marginRight: 0 }}>
        <SafetyCertificateOutlined /> 来源于原始简历
      </Tag>
    )
  }
  const badges: React.ReactNode[] = []
  fc.flags.forEach((f) => {
    if (f === 'sourced') return
    if (f === 'insufficient_source') {
      badges.push(<Tag key={f} color="warning" style={{ fontSize: 12, marginRight: 4 }}>⚠ 原简历未提及此内容</Tag>)
    } else if (f === 'added_number') {
      badges.push(
        <Tag key={f} color="warning" style={{ fontSize: 12, marginRight: 4 }}>
          ⚠ 新增数字：{fc.added_numbers.join('、')}
        </Tag>,
      )
    } else if (f === 'added_skill') {
      badges.push(<Tag key={f} color="warning" style={{ fontSize: 12, marginRight: 4 }}>⚠ 新增技能（AI 推断）</Tag>)
    } else if (f === 'exaggeration') {
      badges.push(
        <Tag key={f} color="warning" style={{ fontSize: 12, marginRight: 4 }}>
          ⚠ 可能夸大：{fc.exag_words.slice(0, 3).join('、')}
        </Tag>,
      )
    }
  })
  return (
    <Space size={0} wrap>
      {badges}
      {fc.flags.includes('sourced') && (
        <Tag color="success" style={{ fontSize: 12, marginRight: 4 }}>
          <SafetyCertificateOutlined /> 部分来源于原始简历
        </Tag>
      )}
    </Space>
  )
}

/** 修改前/后高亮渲染（与 OptimizeDiffModal 同一套视觉语言） */
function Segments({ segments, mode }: { segments: Array<{ text: string; type: string }>; mode: 'before' | 'after' }) {
  return (
    <>
      {segments.map((seg, i) => {
        if (mode === 'before' && seg.type === 'del') return <del key={i} className="opt-diff-strike">{seg.text}</del>
        if (mode === 'after' && seg.type === 'add') return <mark key={i} className="opt-diff-mark">{seg.text}</mark>
        return <span key={i}>{seg.text}</span>
      })}
    </>
  )
}

export default function ChangeReviewModal({ open, recordId, onClose, onApplied }: ChangeReviewModalProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [loading, setLoading] = useState(false)
  const [changes, setChanges] = useState<ChangeItem[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [warnCount, setWarnCount] = useState(0)
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [applying, setApplying] = useState(false)

  const load = useCallback(async (id: string) => {
    setLoading(true)
    setChanges([])
    setDecisions({})
    try {
      const r = await optimize.changes(id)
      setChanges(r.data?.changes || [])
      setCounts(r.data?.counts || {})
      setWarnCount(r.data?.warn_count || 0)
    } catch {
      message.error('变更清单加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open && recordId) load(recordId)
  }, [open, recordId, load])

  const setDecision = (id: string, d: Decision | undefined) => {
    setDecisions((prev) => {
      const next = { ...prev }
      if (!d) delete next[id]
      else next[id] = d
      return next
    })
  }

  const acceptedCount = useMemo(
    () => Object.values(decisions).filter((d) => d.action === 'accept').length,
    [decisions],
  )

  const acceptAll = () => {
    const next: Record<string, Decision> = {}
    changes.forEach((c) => { next[c.id] = { action: 'accept' } })
    setDecisions(next)
  }
  const rejectAll = () => setDecisions({})

  const handleApply = useCallback(async () => {
    if (!recordId || acceptedCount === 0) return
    const payload: ChangeApplyDecision[] = Object.entries(decisions).map(([id, d]) => ({
      id, action: d.action, text: d.action === 'accept' ? (d.text ?? null) : null,
    }))
    setApplying(true)
    try {
      const r = await optimize.applyChanges(recordId, payload)
      message.success(`已生成人工确认版（接受 ${acceptedCount} 条），可在历史与版本树中查看`, 6)
      onApplied?.(r.data?.id)
      onClose()
    } catch (err: unknown) {
      const resp = (err as { response?: { status?: number; data?: { detail?: string } } })?.response
      message.warning(resp?.data?.detail || '应用失败，请重试')
    } finally {
      setApplying(false)
    }
  }, [recordId, decisions, acceptedCount, onApplied, onClose])

  // 按 section 分组展示
  const groups = useMemo(() => {
    const map = new Map<string, ChangeItem[]>()
    changes.forEach((c) => {
      const arr = map.get(c.section_label) || []
      arr.push(c)
      map.set(c.section_label, arr)
    })
    return Array.from(map.entries())
  }, [changes])

  return (
    <Modal
      title={<span><ThunderboltOutlined style={{ color: 'var(--primary-600)', marginRight: 8 }} />逐条确认 AI 修改</span>}
      open={open}
      onCancel={onClose}
      width={880}
      maskClosable={false}
      footer={
        loading || changes.length === 0 ? null : (
          <Space>
            <Button onClick={acceptAll}>全部接受</Button>
            <Button onClick={rejectAll}>全部拒绝</Button>
            <Button
              type="primary"
              disabled={acceptedCount === 0}
              loading={applying}
              onClick={handleApply}
            >
              应用 {acceptedCount} 条修改并生成新版本
            </Button>
          </Space>
        )
      }
    >
      <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-tertiary)' }}>
        AI 共提出 {changes.length} 条修改建议（改写 {counts.modified || 0} · 新增 {counts.added || 0} · 移除 {counts.removed || 0}）。
        未确认的修改不会写入——应用后将以原简历为底生成「人工确认版」，原优化结果保持不变。
        {warnCount > 0 && (
          <div style={{
            marginTop: 6,
            color: isDark ? '#FFB340' : '#AD6800',
            background: isDark ? 'rgba(255, 149, 0, 0.12)' : '#FFFBE6',
            border: `1px solid ${isDark ? 'rgba(255, 149, 0, 0.35)' : '#FFE58F'}`,
            borderRadius: 8, padding: '6px 10px',
          }}>
            <SafetyCertificateOutlined style={{ marginRight: 6 }} />
            事实核验提示：{warnCount} 条建议包含 AI 新增的数字 / 技能 / 强主张表述（已用 ⚠ 标出），建议逐条核对后确认，避免简历出现未经证实的内容。
          </div>
        )}
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 32 }}><Spin /></div>
      ) : changes.length === 0 ? (
        <Empty description="本次优化没有产生可逐条确认的内容差异" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <div style={{ maxHeight: 480, overflowY: 'auto', paddingRight: 4 }}>
          {groups.map(([sectionLabel, items]) => (
            <div key={sectionLabel} style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>{sectionLabel}</div>
              {items.map((c) => {
                const meta = KIND_META[c.kind]
                const d = decisions[c.id]
                const segments = c.editable
                  ? diffSegments(c.original_text || '', d?.action === 'accept' && d.text ? d.text : (c.suggested_text || ''))
                  : null
                return (
                  <div
                    key={c.id}
                    style={{
                      border: '1px solid var(--gray-100)', borderRadius: 10,
                      padding: '10px 12px', marginBottom: 8,
                      background: d?.action === 'accept' ? 'var(--success-50, #F0FDF4)' : d?.action === 'reject' ? 'var(--gray-50, #F8FAFC)' : undefined,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <Space size={6} wrap>
                        <Tag color={meta.color}>{meta.label}</Tag>
                        <span style={{ fontSize: 13 }}>{c.label}</span>
                      </Space>
                      <Space size={4}>
                        <Button
                          size="small"
                          type={d?.action === 'accept' ? 'primary' : 'default'}
                          icon={<CheckCircleFilled />}
                          onClick={() => setDecision(c.id, d?.action === 'accept' ? undefined : { action: 'accept' })}
                        >
                          接受
                        </Button>
                        <Button
                          size="small"
                          danger={d?.action === 'reject'}
                          icon={<CloseCircleFilled />}
                          onClick={() => setDecision(c.id, d?.action === 'reject' ? undefined : { action: 'reject' })}
                        >
                          拒绝
                        </Button>
                      </Space>
                    </div>
                    {/* 事实核验徽标（P0-4） */}
                    <div style={{ marginTop: 6 }}>
                      <FactBadges fc={c.fact_check} />
                    </div>
                    {c.kind !== 'added' && c.original_text && (
                      <div style={{ fontSize: 13, marginTop: 8, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                        <Tag style={{ marginRight: 6 }}>修改前</Tag>
                        {segments ? <Segments segments={segments.before} mode="before" /> : c.original_text}
                      </div>
                    )}
                    {c.kind !== 'removed' && (
                      <>
                        <div style={{ fontSize: 13, marginTop: 6, whiteSpace: 'pre-wrap' }}>
                          <Tag color="blue" style={{ marginRight: 6 }}>{c.kind === 'added' ? '建议新增' : 'AI 建议'}</Tag>
                          {segments ? <Segments segments={segments.after} mode="after" /> : c.suggested_text}
                        </div>
                        {/* 编辑后接受：仅可编辑条目（summary / 描述 / 技能文案） */}
                        {c.editable && d?.action === 'accept' && (
                          <Input.TextArea
                            style={{ marginTop: 8 }}
                            value={d.text ?? c.suggested_text ?? ''}
                            onChange={(e) => setDecision(c.id, { action: 'accept', text: e.target.value })}
                            autoSize={{ minRows: 2, maxRows: 6 }}
                            maxLength={1000}
                            placeholder="可在此修改 AI 建议文案后再接受"
                          />
                        )}
                      </>
                    )}
                    {!c.editable && d?.action === 'accept' && (
                      <div style={{ fontSize: 12, marginTop: 6, color: 'var(--text-tertiary)' }}>
                        <EditOutlined /> 该条为结构化内容（整段/字段），只能整条接受或拒绝
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
