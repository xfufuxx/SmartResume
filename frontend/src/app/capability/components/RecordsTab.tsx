'use client'

import React, { useCallback, useEffect, useState } from 'react'
import {
  Alert, Button, Card, Empty, List, Popconfirm, Progress, Space, Tag, Typography,
} from 'antd'
import {
  ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, ExperimentOutlined,
  FileTextOutlined, MinusOutlined, TrophyOutlined,
} from '@ant-design/icons'
import { capability } from '@/lib/api'
import type { CapabilityAssessment, CapabilityRankingItem } from '@/types'
import { formatDate } from '@/lib/utils'

const { Text, Paragraph } = Typography

interface Props {
  refreshKey: number
  onView: (assessment: CapabilityAssessment) => void
  onDeleted: () => void
  onGoAssess: () => void
}

const TREND_META: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  up: { icon: <ArrowUpOutlined />, color: 'var(--success-600)', label: '较上次提升' },
  down: { icon: <ArrowDownOutlined />, color: 'var(--error-600)', label: '较上次下降' },
  flat: { icon: <MinusOutlined />, color: 'var(--text-tertiary)', label: '与上次持平' },
}

/** 测评记录 Tab：岗位匹配排行 + 历史测评记录 */
export default function RecordsTab({ refreshKey, onView, onDeleted, onGoAssess }: Props) {
  const [loading, setLoading] = useState(true)
  const [records, setRecords] = useState<CapabilityAssessment[]>([])
  const [ranking, setRanking] = useState<CapabilityRankingItem[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [recordsRes, rankingRes] = await Promise.all([
        capability.assessments(),
        capability.ranking(),
      ])
      setRecords(recordsRes.data || [])
      setRanking(rankingRes.data || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  const handleDelete = async (id: string) => {
    await capability.remove(id)
    onDeleted()
    load()
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Typography.Text type="secondary">加载中…</Typography.Text>
      </div>
    )
  }

  if (records.length === 0) {
    return (
      <Card>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="还没有测评记录"
          style={{ padding: 40 }}
        >
          <Button type="primary" icon={<ExperimentOutlined />} onClick={onGoAssess}>
            去测第一个岗位
          </Button>
        </Empty>
      </Card>
    )
  }

  return (
    <div>
      {/* 岗位匹配排行：帮助用户了解自身比较适合的岗位 */}
      <Card
        title={
          <span>
            <TrophyOutlined style={{ marginRight: 8, color: 'var(--warning-500)' }} />
            岗位匹配排行
          </span>
        }
        extra={<Text type="secondary" style={{ fontSize: 12 }}>按最近一次测评匹配度排序 · 仅基于你的自评数据</Text>}
        style={{ marginBottom: 16 }}
      >
        <List
          dataSource={ranking}
          renderItem={(item, idx) => {
            const trend = TREND_META[item.trend] || TREND_META.flat
            return (
              <List.Item
                actions={[
                  <Button key="view" type="link" onClick={() => onView(records.find((r) => r.id === item.latest_assessment_id)!)}>
                    查看报告
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  avatar={
                    <div style={{ textAlign: 'center', width: 44 }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: idx === 0 ? 'var(--warning-500)' : 'var(--text-tertiary)' }}>
                        {idx + 1}
                      </div>
                    </div>
                  }
                  title={
                    <Space size={8} wrap>
                      <Text strong>{item.job_title}</Text>
                      <Tag color="blue">{item.category}</Tag>
                      {item.assessment_count > 1 && (
                        <Tag style={{ marginInlineEnd: 0 }}>
                          <span style={{ color: trend.color }}>{trend.icon}</span>
                          {item.trend === 'up' ? ` +${(item.overall_match - (item.previous_match ?? 0)).toFixed(1)}` : item.trend === 'down' ? ` ${(item.overall_match - (item.previous_match ?? 0)).toFixed(1)}` : ''}
                        </Tag>
                      )}
                      {item.weak_dimension_count > 0 && (
                        <Tag color="orange" style={{ marginInlineEnd: 0 }}>{item.weak_dimension_count} 项短板</Tag>
                      )}
                    </Space>
                  }
                  description={
                    <Space size={12} wrap>
                      <span>专业 {item.professional_avg.toFixed(1)} · 通识 {item.general_avg.toFixed(1)}</span>
                      <span>测评 {item.assessment_count} 次</span>
                      <span>{item.assessed_at ? formatDate(item.assessed_at) : ''}</span>
                    </Space>
                  }
                />
                <div style={{ width: 160, marginLeft: 16 }}>
                  <Progress
                    percent={Math.round(item.overall_match)}
                    strokeColor={item.overall_match >= 75 ? 'var(--success-500)' : item.overall_match >= 40 ? 'var(--warning-500)' : 'var(--error-500)'}
                    size="small"
                  />
                </div>
              </List.Item>
            )
          }}
        />
      </Card>

      {/* 历史记录 */}
      <Card title={<span><FileTextOutlined style={{ marginRight: 8 }} />全部测评记录</span>}>
        <List
          dataSource={records}
          renderItem={(a) => (
            <List.Item
              actions={[
                <Button key="view" type="link" onClick={() => onView(a)}>
                  查看报告
                </Button>,
                <Popconfirm
                  key="del"
                  title="删除这条测评记录？"
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => handleDelete(a.id)}
                >
                  <Button type="link" danger icon={<DeleteOutlined />}>
                    删除
                  </Button>
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space size={8} wrap>
                    <Text strong>{a.job_title}</Text>
                    <Tag color="blue">{a.category}</Tag>
                  </Space>
                }
                description={
                  <Space size={12} wrap>
                    <span>
                      匹配度{' '}
                      <Text strong style={{ color: a.overall_match >= 75 ? 'var(--success-600)' : a.overall_match >= 40 ? 'var(--warning-600)' : 'var(--error-600)' }}>
                        {a.overall_match.toFixed(1)}%
                      </Text>
                    </span>
                    <span>专业 {a.professional_avg.toFixed(1)} · 通识 {a.general_avg.toFixed(1)}</span>
                    <span>{a.created_at ? formatDate(a.created_at) : ''}</span>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
        {ranking.length >= 2 && (
          <Alert
            type="info"
            showIcon
            style={{ marginTop: 12 }}
            message={
              <span>
                你最匹配的岗位是「<Text strong>{ranking[0].job_title}</Text>」（{ranking[0].overall_match.toFixed(0)}%），
                可以把补步重点放在与它差距最小的维度上；多条记录也可用于对比复评前后的进步。
              </span>
            }
          />
        )}
      </Card>
    </div>
  )
}
