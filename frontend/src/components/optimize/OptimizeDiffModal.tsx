'use client'

import React, { useMemo } from 'react'
import { Modal, Button, Tag, Empty, Space } from 'antd'
import {
  CheckCircleFilled, DownloadOutlined, SwapOutlined, ThunderboltOutlined,
} from '@ant-design/icons'
import { buildResumeDiff, diffSegments } from '@/lib/diff'
import type { DiffEntry, DiffSegment } from '@/lib/diff'
import type { OptimizeResult, ResumeParseResult } from '@/types'

interface OptimizeDiffModalProps {
  open: boolean
  onClose: () => void
  /** 优化记录（含 optimized_json / original_json / match_score） */
  result: OptimizeResult | null
  /** 优化前简历；缺省时回退到记录里的 original_json */
  before: ResumeParseResult | null
  /** 优化前后匹配度（由页面用同一口径算出，缺省不显示对比） */
  scoreBefore?: number | null
  scoreAfter?: number | null
  /** 跳转「逐条对比」详情页 */
  onOpenDetail?: () => void
  /** 下载优化后的 PDF */
  onExport?: () => void
  exporting?: boolean
}

const KIND_META: Record<DiffEntry['kind'], { label: string; color: string; className: string }> = {
  added: { label: '新增', color: 'green', className: 'is-add' },
  removed: { label: '移除', color: 'red', className: 'is-del' },
  modified: { label: '改写', color: 'blue', className: 'is-mod' },
}

/** 高亮渲染：新增片段用 <mark>，删除片段用删除线，其余原样输出 */
function Segments({ segments }: { segments: DiffSegment[] }) {
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === 'add') return <mark key={i} className="opt-diff-mark">{seg.text}</mark>
        if (seg.type === 'del') return <span key={i} className="opt-diff-strike">{seg.text}</span>
        return <span key={i}>{seg.text}</span>
      })}
    </>
  )
}

/**
 * 优化前后对比弹窗：仅在优化彻底完成后弹出（由页面在任务 completed 时打开）。
 * 只呈现确有变化的条目，新增/改动文字用高亮标出，方便一眼看出改了什么。
 */
export default function OptimizeDiffModal({
  open, onClose, result, before, scoreBefore, scoreAfter, onOpenDetail, onExport, exporting,
}: OptimizeDiffModalProps) {
  const diff = useMemo(
    () => buildResumeDiff(before || result?.original_json || null, result?.optimized_json || null),
    [before, result],
  )

  // 预先算好每条的差异片段，避免渲染期重复做 LCS
  const groups = useMemo(
    () => diff.groups.map((group) => ({
      section: group.section,
      entries: group.entries.map((entry) => ({
        ...entry,
        segments: diffSegments(entry.before || '', entry.after || ''),
      })),
    })),
    [diff],
  )

  const sb = typeof scoreBefore === 'number' ? scoreBefore : null
  const sa = typeof scoreAfter === 'number' ? scoreAfter : null
  const hasScorePair = sb !== null && sa !== null
  const scoreDelta = sb !== null && sa !== null ? Number((sa - sb).toFixed(1)) : null

  return (
    <Modal
      title={<span className="opt-card-title"><ThunderboltOutlined /> 优化完成 · 前后对比</span>}
      open={open}
      onCancel={onClose}
      width={920}
      footer={null}
      maskClosable={false}
    >
      <div className="opt-diff-body">
        {/* 概览：匹配度前后 + 主要变化 */}
        <div className="opt-diff-head">
          {hasScorePair && (
            <div className="opt-diff-score">
              {/* 明确标注口径：本值来自规则化关键词匹配计算器，
                  与右侧「职位匹配度」（AI 岗位匹配分析出的 match_score）不是同一个指标，
                  不标注会让两个数字看起来互相矛盾 */}
              <span className="opt-diff-score-label">关键词匹配度</span>
              <b className="opt-diff-score-before">{sb}</b>
              <span className="opt-diff-score-arrow">→</span>
              <b className="opt-diff-score-after">{sa}</b>
              {scoreDelta !== null && Math.abs(scoreDelta) > 0.04 && (
                <Tag color={scoreDelta > 0 ? 'green' : 'orange'}>{scoreDelta > 0 ? `+${scoreDelta}` : scoreDelta}</Tag>
              )}
            </div>
          )}
          <div className="opt-diff-counts">
            <Tag color="green" icon={<CheckCircleFilled />}>新增 {diff.counts.added}</Tag>
            <Tag color="blue">改写 {diff.counts.modified}</Tag>
            {diff.counts.removed > 0 && <Tag color="red">移除 {diff.counts.removed}</Tag>}
          </div>
        </div>

        {diff.highlights.length > 0 && (
          <div className="opt-diff-highlights">
            <div className="opt-diff-highlights-title">主要变化</div>
            <Space wrap size={[8, 8]}>
              {diff.highlights.map((text) => (
                <span className="opt-diff-chip" key={text}>{text}</span>
              ))}
            </Space>
          </div>
        )}

        {/* 逐项对照 */}
        {groups.length === 0 ? (
          <Empty
            style={{ padding: '24px 0' }}
            description="本次优化未产生可比较的内容差异（可能只调整了排版或措辞标点）"
          />
        ) : (
          <div className="opt-diff-list">
            {groups.map((group) => (
              <div className="opt-diff-group" key={group.section}>
                <div className="opt-diff-group-title">{group.section}</div>
                {group.entries.map((entry) => {
                  const meta = KIND_META[entry.kind]
                  const showBefore = entry.kind !== 'added'
                  const showAfter = entry.kind !== 'removed'
                  return (
                    <div className={`opt-diff-item ${meta.className}`} key={entry.key}>
                      <div className="opt-diff-item-head">
                        <span className="opt-diff-item-label">{entry.label}</span>
                        <Tag color={meta.color}>{meta.label}</Tag>
                      </div>
                      {showBefore && (
                        <div className="opt-diff-pane is-before">
                          <span className="opt-diff-pane-tag">修改前</span>
                          <div className="opt-diff-text">
                            <Segments segments={entry.segments.before} />
                          </div>
                        </div>
                      )}
                      {showAfter && (
                        <div className="opt-diff-pane is-after">
                          <span className="opt-diff-pane-tag">修改后</span>
                          <div className="opt-diff-text">
                            <Segments segments={entry.segments.after} />
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}

        <div className="opt-diff-foot">
          <Space wrap>
            {onOpenDetail && (
              <Button icon={<SwapOutlined />} onClick={onOpenDetail}>查看逐条对比</Button>
            )}
            {onExport && (
              <Button type="primary" icon={<DownloadOutlined />} loading={exporting} onClick={onExport}>
                下载简历 PDF
              </Button>
            )}
          </Space>
          <Button onClick={onClose}>关闭</Button>
        </div>
      </div>
    </Modal>
  )
}
