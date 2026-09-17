'use client'

import React from 'react'
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons'

interface MetricStatProps {
  label: string
  value: number | string
  /** 数值单位，如「分」「%」 */
  unit?: string
  /** 环比变化：正数显示提升，负数显示下降；undefined 表示暂无基线 */
  delta?: number
  /** 是否按百分比展示环比 */
  deltaUnit?: '%' | 'point' | ''
  hint?: string
}

/**
 * 单指标卡：大数字 + 单位 + 环比标签，用于底部「简历分析」。
 * 无基线（尚未生成优化结果）时不显示环比，避免出现编造的涨幅。
 */
export default function MetricStat({ label, value, unit = '', delta, deltaUnit = '%', hint }: MetricStatProps) {
  const hasDelta = typeof delta === 'number' && Number.isFinite(delta) && Math.abs(delta) > 0.04
  const up = hasDelta && (delta as number) > 0

  return (
    <div className="opt-metric">
      <div className="opt-metric-label">{label}</div>
      <div className="opt-metric-value">
        <b>{value}</b>
        {unit && <i>{unit}</i>}
      </div>
      <div className="opt-metric-foot">
        {hasDelta ? (
          <span className={`opt-metric-delta ${up ? 'up' : 'down'}`}>
            {up ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
            {Math.abs(Number((delta as number).toFixed(1)))}
            {deltaUnit}
          </span>
        ) : (
          <span className="opt-metric-delta none">{hint || '待优化后对比'}</span>
        )}
      </div>
    </div>
  )
}
