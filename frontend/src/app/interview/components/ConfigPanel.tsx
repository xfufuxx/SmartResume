'use client'

/** 左栏：开新一场模拟的配置（简历 + 岗位 + 目标题数）。 */
import React from 'react'
import { Button, Popconfirm, Select, Slider, Tooltip } from 'antd'
import {
  FileSearchOutlined, FileTextOutlined, InfoCircleOutlined, PlayCircleOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'

import type { ResumeRecord } from '@/types'

export default function ConfigPanel({
  resumes,
  jobs,
  resumeId,
  jobId,
  count,
  onResumeChange,
  onJobChange,
  onCountChange,
  onStart,
  starting,
  onQuick,
  quickGenerating,
}: {
  resumes: ResumeRecord[]
  jobs: Array<{ id: string; title?: string | null; company?: string | null }>
  resumeId: string | null
  jobId: string | null
  count: number
  onResumeChange: (id: string | null) => void
  onJobChange: (id: string | null) => void
  onCountChange: (n: number) => void
  onStart: () => void
  starting: boolean
  onQuick: () => void
  quickGenerating: boolean
}) {
  const canStart = !!(resumeId || jobId)

  return (
    <div className="app-card" style={{ padding: 20 }}>
      <div className="app-section-title" style={{ marginBottom: 6 }}>
        <PlayCircleOutlined style={{ color: 'var(--primary-600)' }} /> 开一场模拟面试
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.7, marginBottom: 14 }}>
        按真实面试顺序走：自我介绍 → 简历深挖 → 专业能力 → 行为面试 → 求职动机 → 你反问，
        题数多时加薪资到岗。一次一题，答完先点评再追问或换题。
      </div>

      <div style={{ marginBottom: 14 }}>
        <div className="mock-field-label"><FileTextOutlined /> 我的简历</div>
        <Select
          style={{ width: '100%' }}
          placeholder={resumes.length ? '选择简历（可选）' : '暂无已解析的简历'}
          value={resumeId}
          onChange={onResumeChange}
          allowClear
          showSearch
          optionFilterProp="label"
          options={resumes.map((r) => ({
            value: r.id,
            label: r.title || r.parsed_json?.personal_info?.name || '未命名简历',
          }))}
        />
      </div>

      <div style={{ marginBottom: 14 }}>
        <div className="mock-field-label"><FileSearchOutlined /> 目标岗位</div>
        <Select
          style={{ width: '100%' }}
          placeholder={jobs.length ? '选择岗位（可选）' : '暂无岗位'}
          value={jobId}
          onChange={onJobChange}
          allowClear
          showSearch
          optionFilterProp="label"
          options={jobs.map((j) => ({
            value: j.id,
            label: [j.title || '未命名岗位', j.company].filter(Boolean).join(' @ '),
          }))}
        />
      </div>

      <div style={{ marginBottom: 14 }}>
        <div className="mock-field-label">
          目标题数：{count} 道
          <Tooltip title="3 题只走自我介绍 + 简历深挖 + 反问；题数越多环节越全，10 题以上才会问到薪资到岗。中途也可随时结束">
            <InfoCircleOutlined style={{ marginLeft: 4, color: 'var(--text-quaternary)' }} />
          </Tooltip>
        </div>
        <Slider min={3} max={15} value={count} onChange={onCountChange} />
      </div>

      <Button
        type="primary"
        block
        size="large"
        icon={<PlayCircleOutlined />}
        loading={starting}
        disabled={!canStart}
        onClick={onStart}
        data-testid="mock-start"
      >
        {starting ? '正在开场…' : '开始模拟面试'}
      </Button>
      {!canStart && (
        <div style={{ fontSize: 11, color: 'var(--text-quaternary)', marginTop: 8 }}>
          至少选择一份简历或一个岗位
        </div>
      )}

      <div className="mock-quick-entry">
        <div className="mock-quick-title">
          <ThunderboltOutlined /> 只要一套题单？
        </div>
        <div className="mock-quick-desc">
          快速押题：一次性出完整套题，不进入对话，只读查看题目、要点和参考答案。
        </div>
        <Popconfirm
          title="一次性生成整套押题？"
          description="会直接出完所有题并以只读方式查看，适合只想看题、不想对话的时候。"
          okText="生成"
          cancelText="取消"
          onConfirm={onQuick}
        >
          <Button size="small" loading={quickGenerating} data-testid="mock-quick">
            生成押题题单（{count} 题）
          </Button>
        </Popconfirm>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-quaternary)', lineHeight: 1.6, marginTop: 6 }}>
        题目来自简历细节与岗位要求，属于 AI 预测，不是真题。建议先自己答，再看要点。
      </div>
    </div>
  )
}
