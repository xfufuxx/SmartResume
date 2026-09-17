'use client'

import React from 'react'

export type ScoreLevel = 'great' | 'good' | 'fair' | 'poor'

/** 统一的分档口径：>=85 非常匹配 / >=70 较为匹配 / >=50 基本匹配 / 其余 匹配偏低 */
export function scoreLevel(score: number): ScoreLevel {
  if (score >= 85) return 'great'
  if (score >= 70) return 'good'
  if (score >= 50) return 'fair'
  return 'poor'
}

const LEVEL_META: Record<ScoreLevel, { label: string; color: string; desc: string }> = {
  great: { label: '非常匹配', color: 'var(--success-500)', desc: '您的简历与该职位高度契合，建议继续优化以获得更好机会。' },
  good: { label: '较为匹配', color: 'var(--primary-500)', desc: '您的简历与该职位基本契合，补齐关键技能后竞争力更强。' },
  fair: { label: '基本匹配', color: 'var(--warning-500)', desc: '简历与岗位存在一定差距，建议按下方建议逐项优化。' },
  poor: { label: '匹配偏低', color: 'var(--error-500)', desc: '简历与岗位要求差距较大，建议先调整目标岗位或补充经历。' },
}

export function levelMeta(score: number) {
  return LEVEL_META[scoreLevel(score)]
}

interface MatchGaugeProps {
  /** 0-100 */
  score: number
  /** 直径（px） */
  size?: number
}

/**
 * 匹配度环形仪表盘：纯 SVG 实现，避免为一个小图表引入图表库。
 */
export default function MatchGauge({ score, size = 110 }: MatchGaugeProps) {
  const safe = Math.max(0, Math.min(100, Number.isFinite(score) ? score : 0))
  const meta = LEVEL_META[scoreLevel(safe)]
  const stroke = 8
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const dash = (c * safe) / 100

  return (
    <div className="opt-gauge" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`匹配度 ${safe}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--gray-100)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={meta.color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray 0.6s cubic-bezier(0.32, 0.72, 0, 1)' }}
        />
      </svg>
      <div className="opt-gauge-center" style={{ color: meta.color }}>
        <b>{safe}</b>
        <span>匹配度</span>
      </div>
    </div>
  )
}
