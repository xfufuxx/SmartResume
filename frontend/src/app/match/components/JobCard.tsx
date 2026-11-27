'use client'

import React from 'react'
import { Button, Collapse, Progress, Space, Tag, Tooltip, message } from 'antd'
import {
  AimOutlined, BankOutlined, BookOutlined, BulbOutlined, CheckCircleOutlined,
  EnvironmentOutlined, ExportOutlined, FileTextOutlined, LinkOutlined,
  ThunderboltOutlined, WarningOutlined,
} from '@ant-design/icons'
import type { DiscoveredJob } from '@/types'
import {
  dimensionRows, jobSummary, overallTone, rateColor, rateLabel,
} from '@/lib/job-discovery'

interface JobCardProps {
  job: DiscoveredJob
  index: number
  optimizing: boolean
  onOptimize: (job: DiscoveredJob) => void
}

/** 每条理由/差距/建议的列表块：图标 + 文本，左侧色条区分语义 */
function ReasonBlock({
  title, icon, items, color, emptyText,
}: {
  title: string
  icon: React.ReactNode
  items: string[]
  color: string
  emptyText: string
}) {
  return (
    <div className="match-reason-block" style={{ borderLeftColor: color }}>
      <div style={{ fontSize: 12, fontWeight: 600, color, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
        {icon}{title}
      </div>
      {items.length ? (
        <ul className="match-reason-list">
          {items.map((text, i) => (
            <li key={`${title}-${i}`}>{text}</li>
          ))}
        </ul>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{emptyText}</div>
      )}
    </div>
  )
}

export default function JobCard({ job, index, optimizing, onOptimize }: JobCardProps) {
  const tone = overallTone(job.match_rate)
  const rows = dimensionRows(job)
  const rankStyle = index === 0
    ? { background: 'var(--warning-50)', color: 'var(--warning-600)' }
    : index < 3
      ? { background: 'var(--primary-50)', color: 'var(--primary-600)' }
      : { background: 'var(--gray-100)', color: 'var(--text-tertiary)' }

  const copyJd = async () => {
    const text = job.jd_text || `${job.title}\n${job.company}\n${job.summary}`
    try {
      await navigator.clipboard.writeText(text)
      message.success('岗位 JD 已复制')
    } catch {
      message.error('复制失败，请手动选择文本')
    }
  }

  return (
    <div className="app-card match-job-card" data-testid={`match-job-${job.id}`}>
      {/* ── 头部：排名 + 岗位 + 来源 + 适配分 ── */}
      <div className="match-job-head">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="match-rank" style={rankStyle}>{index + 1}</span>
            <span className="match-job-title">{job.title}</span>
            <Tooltip
              title={job.source_type === 'web'
                ? '来自公开招聘信息的实网检索，点击「查看原岗位」可打开'
                : 'AI 画像模式：这里标注的是该岗位画像参考的招聘渠道，并非实时在招岗位'}
            >
              <Tag
                color={job.source_type === 'web' ? 'blue' : undefined}
                style={{ marginInlineEnd: 0, fontSize: 11 }}
                data-testid="match-job-source"
              >
                {job.source_type === 'web' ? <LinkOutlined /> : <AimOutlined />}{' '}
                {job.source_type === 'web' ? job.source : `${job.source} · 画像`}
              </Tag>
            </Tooltip>
            {job.channel && <Tag style={{ marginInlineEnd: 0, fontSize: 11 }}>{job.channel}</Tag>}
          </div>
          <div className="match-job-sub">
            <BankOutlined /> {job.company}
            <span className="match-dot" />
            <EnvironmentOutlined /> {job.location}
            <span className="match-dot" />
            <BankOutlined /> {job.salary}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div className="match-score" style={{ color: rateColor(job.match_rate) }}>
            {job.match_rate}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>适配度</div>
        </div>
      </div>

      <Progress
        percent={job.match_rate}
        showInfo={false}
        strokeColor={rateColor(job.match_rate)}
        trailColor="var(--gray-100)"
        style={{ margin: '8px 0 2px' }}
      />

      <div style={{ fontSize: 12, color: rateColor(job.match_rate), fontWeight: 500 }}>
        {rateLabel(job.match_rate)}
      </div>

      {/* ── 岗位摘要 ── */}
      <p className="match-job-summary">{jobSummary(job)}</p>

      <Space size={[4, 4]} wrap style={{ marginBottom: 4 }}>
        <Tag icon={<ThunderboltOutlined />} style={{ marginInlineEnd: 0, fontSize: 11 }}>
          {job.experience_required}
        </Tag>
        <Tag icon={<BookOutlined />} style={{ marginInlineEnd: 0, fontSize: 11 }}>
          {job.education_required}
        </Tag>
        {(job.skills || []).slice(0, 6).map((skill) => (
          <Tag key={skill} style={{ marginInlineEnd: 0, fontSize: 11 }}>{skill}</Tag>
        ))}
      </Space>

      {/* ── 五维评分 ── */}
      <div className="match-dims" data-testid="match-dims">
        {rows.map((row) => (
          <Tooltip key={row.key} title={row.reason || row.hint}>
            <div className="match-dim-row">
              <span className="match-dim-label">{row.label}</span>
              <Progress
                percent={row.score}
                showInfo={false}
                size="small"
                strokeColor={rateColor(row.score)}
                trailColor="var(--gray-100)"
                style={{ flex: 1, margin: 0 }}
              />
              <span className="match-dim-score" style={{ color: rateColor(row.score) }}>{row.score}</span>
              <span className="match-dim-weight">权重 {row.weight}%</span>
            </div>
          </Tooltip>
        ))}
      </div>

      {/* ── 理由 / 差距 / 建议 ── */}
      <div className="match-reasons">
        <ReasonBlock
          title="匹配理由"
          icon={<CheckCircleOutlined />}
          items={job.match_reasons || []}
          color="var(--success-500)"
          emptyText="模型未给出具体匹配理由"
        />
        <ReasonBlock
          title="不匹配点"
          icon={<WarningOutlined />}
          items={job.mismatches || []}
          color="var(--warning-500)"
          emptyText="暂未发现硬性差距"
        />
        <ReasonBlock
          title="优化建议"
          icon={<BulbOutlined />}
          items={job.suggestions || []}
          color="var(--primary-500)"
          emptyText="按当前匹配度可直接投递"
        />
      </div>

      <Collapse
        ghost
        size="small"
        style={{ marginTop: 4 }}
        items={[{
          key: 'jd',
          label: <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}><FileTextOutlined /> 查看完整 JD</span>,
          children: (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
              {job.jd_text || '暂无完整 JD'}
            </div>
          ),
        }]}
      />

      <Space style={{ marginTop: 'auto', paddingTop: 8 }} wrap>
        <Button
          type="primary"
          size="small"
          icon={<ThunderboltOutlined />}
          loading={optimizing}
          onClick={() => onOptimize(job)}
          data-testid="match-optimize"
        >
          用这份简历优化
        </Button>
        <Button size="small" icon={<FileTextOutlined />} onClick={copyJd}>复制 JD</Button>
        {job.source_type === 'web' && job.url && (
          <Button
            size="small"
            icon={<ExportOutlined />}
            href={job.url}
            target="_blank"
            rel="noreferrer noopener"
          >
            查看原岗位
          </Button>
        )}
        {tone === 'weak' && (
          <Tooltip title="这个岗位与当前简历差距较大，优先投递强匹配岗位更划算">
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>差距较大，谨慎投递</span>
          </Tooltip>
        )}
      </Space>
    </div>
  )
}
