'use client'

import React from 'react'
import { Alert, Button, Modal, Progress, Space, Tag, Typography } from 'antd'
import {
  BulbOutlined, CheckCircleOutlined, RiseOutlined, WarningOutlined,
} from '@ant-design/icons'
import type { CapabilityAssessment, ReportDimensionItem } from '@/types'
import { formatDate } from '@/lib/utils'

const { Text, Paragraph, Title } = Typography

interface Props {
  open: boolean
  assessment: CapabilityAssessment | null
  onCancel: () => void
}

const LEVEL_STYLE: Record<string, { color: string; bg: string }> = {
  critical: { color: 'var(--error-600)', bg: 'var(--error-50)' },
  weak: { color: 'var(--warning-600)', bg: 'var(--warning-50)' },
  fair: { color: 'var(--primary-600)', bg: 'var(--primary-50)' },
  good: { color: 'var(--success-600)', bg: 'var(--success-50)' },
  excellent: { color: '#7C3AED', bg: '#F3E8FF' },
}

function ScoreTag({ item }: { item: ReportDimensionItem }) {
  const style = LEVEL_STYLE[item.level] || LEVEL_STYLE.fair
  return (
    <Tag style={{ background: style.bg, color: style.color, border: 'none', fontWeight: 600 }}>
      {item.score} 分 · {item.level_label}
    </Tag>
  )
}

function DimensionList({ items }: { items: ReportDimensionItem[] }) {
  if (items.length === 0) return <Text type="secondary">暂无数据</Text>
  return (
    <div>
      {items.map((item) => (
        <div key={item.name} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-light)' }}>
          <Space size={8} wrap>
            <Text strong>{item.name}</Text>
            <ScoreTag item={item} />
          </Space>
          <Paragraph style={{ fontSize: 13, marginBottom: 0, marginTop: 4, color: 'var(--text-secondary)' }}>
            {item.analysis}
          </Paragraph>
        </div>
      ))}
    </div>
  )
}

/** 测评报告弹窗：匹配度 + 整体分析 + 逐维度分析 + 三阶段补步建议 + 总结 */
export default function ReportView({ open, assessment, onCancel }: Props) {
  const report = assessment?.report
  const match = report?.overall_match ?? 0

  return (
    <Modal
      open={open}
      title={report ? `「${report.job_title}」岗位测评报告` : '测评报告'}
      onCancel={onCancel}
      width={880}
      footer={[
        <Button key="close" type="primary" onClick={onCancel}>
          知道了
        </Button>,
      ]}
    >
      {report && (
        <div style={{ maxHeight: '68vh', overflowY: 'auto', paddingRight: 8 }}>
          {/* 头部：匹配度 + 均分 */}
          <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
            <Progress
              type="dashboard"
              percent={Math.round(match)}
              gapDegree={90}
              strokeColor={match >= 75 ? 'var(--success-500)' : match >= 40 ? 'var(--warning-500)' : 'var(--error-500)'}
              format={(p) => (
                <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>{p}%</span>
              )}
            />
            <div style={{ flex: 1, minWidth: 220 }}>
              <Title level={5} style={{ marginTop: 0 }}>整体匹配度</Title>
              <Space size={8} wrap>
                <Tag color="blue">{report.category}</Tag>
                <Tag>专业均分 {report.professional_avg.toFixed(1)}</Tag>
                <Tag>通识均分 {report.general_avg.toFixed(1)}</Tag>
              </Space>
            </div>
          </div>

          {/* 整体分析 */}
          <Title level={5}>整体分析</Title>
          <Paragraph style={{ whiteSpace: 'pre-wrap', color: 'var(--text-secondary)' }}>
            {report.overall_analysis}
          </Paragraph>

          {/* 逐维度分析 */}
          <Title level={5} style={{ marginTop: 24 }}>通用能力分析</Title>
          <DimensionList items={report.general_analysis} />

          <Title level={5} style={{ marginTop: 24 }}>专业能力分析</Title>
          <DimensionList items={report.professional_analysis} />

          {/* 能力补步建议 */}
          <Title level={5} style={{ marginTop: 24 }}>能力补步建议</Title>
          <Alert
            type="info"
            showIcon
            icon={<RiseOutlined />}
            style={{ marginBottom: 16 }}
            message={
              <span>
                鉴于当前匹配度属于{' '}
                <Text strong>{match < 40 ? '结构性缺口' : match < 75 ? '针对性补强' : '优势证明'}</Text>
                ，补步路径坚持「{report.improvement_plan.principle}」原则，分三阶段推进：
              </span>
            }
          />
          {report.improvement_plan.phases.map((phase) => (
            <PhaseCard key={phase.stage}>
              <Space align="center" size={8} wrap style={{ marginBottom: 4 }}>
                <Tag color="processing">{phase.stage}</Tag>
                <Text strong style={{ fontSize: 15 }}>{phase.title}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>{phase.period}</Text>
              </Space>
              <Paragraph style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                <BulbOutlined style={{ marginRight: 6, color: 'var(--warning-500)' }} />
                目标：{phase.goal}
              </Paragraph>
              {phase.reading.length > 0 && (
                <>
                  <Text strong style={{ fontSize: 13 }}>必学清单：</Text>
                  <div style={{ margin: '4px 0 8px' }}>
                    {phase.reading.map((group) => (
                      <div key={group.category} style={{ marginBottom: 4 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>【{group.category}】</Text>
                        <Text style={{ fontSize: 13, marginLeft: 6 }}>{group.items.join('；')}</Text>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {phase.actions.length > 0 && (
                <>
                  <Text strong style={{ fontSize: 13 }}>关键动作：</Text>
                  <div style={{ margin: '4px 0 0' }}>
                    {phase.actions.map((action, i) => (
                      <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '2px 0' }}>
                        <CheckCircleOutlined style={{ marginRight: 6, color: 'var(--success-500)' }} />
                        {action}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </PhaseCard>
          ))}

          {/* 总结与郑重建议 */}
          <Title level={5} style={{ marginTop: 24 }}>总结与关键提醒</Title>
          <Paragraph style={{ color: 'var(--text-secondary)' }}>
            你当前 {match.toFixed(0)}% 的匹配度，不是「能力不够」，而是尚未系统建立该职业的能力结构。
          </Paragraph>
          {report.summary.reminders.map((r, i) => (
            <Paragraph key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
              <WarningOutlined style={{ marginRight: 6, color: 'var(--warning-500)' }} />
              {r}
            </Paragraph>
          ))}

          <Alert
            type="warning"
            showIcon
            style={{ marginTop: 16 }}
            message="郑重建议"
            description={
              <div>
                {report.summary.solemn_advice.map((s, i) => (
                  <div key={i} style={{ fontSize: 13, padding: '2px 0' }}>· {s}</div>
                ))}
              </div>
            }
          />

          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              报告生成日期：{formatDate(report.summary.generated_at)} · 建议下次复评：{formatDate(report.summary.next_review_at)}
            </Text>
          </div>
        </div>
      )}
    </Modal>
  )
}

/** 阶段卡片（局部样式容器） */
function PhaseCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        border: '1px solid var(--border-light)',
        borderRadius: 10,
        padding: '12px 16px',
        marginBottom: 12,
        background: 'var(--bg-card, #fff)',
      }}
    >
      {children}
    </div>
  )
}
