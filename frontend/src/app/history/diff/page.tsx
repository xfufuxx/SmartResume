'use client'

import React, { useEffect, useState } from 'react'
import {
  Card, Typography, Spin, message, Space,
  Row, Col, Tag, Descriptions, Empty,
} from 'antd'
import { useRouter, useSearchParams } from 'next/navigation'
import { optimize } from '@/lib/api'
import { getToken } from '@/lib/auth'
import { formatDate } from '@/lib/utils'
import type { ResumeParseResult, DiffResponse } from '@/types'
import AppLayout from '@/components/AppLayout'
import AuthGate from '@/components/AuthGate'

function SideBySideCard({ label, data, color }: { label: string; data: ResumeParseResult | null; color: string }) {
  if (!data) return <Empty description="无数据" />
  return (
    <Card size="small" title={<span style={{ color }}>{label}</span>} style={{ borderColor: color }}>
      {data.summary && (
        <div style={{ marginBottom: 12 }}>
          <Typography.Text type="secondary">个人总结</Typography.Text>
          <div style={{ background: 'var(--gray-100)', padding: 8, borderRadius: 6, marginTop: 4, fontSize: 13 }}>{data.summary}</div>
        </div>
      )}
      {data.skills && data.skills.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <Typography.Text type="secondary">技能</Typography.Text>
          <div style={{ marginTop: 4 }}>
            <Space wrap>{data.skills.map((s) => <Tag key={s}>{s}</Tag>)}</Space>
          </div>
        </div>
      )}
      {data.experience && data.experience.length > 0 && (
        <div>
          <Typography.Text type="secondary">工作经历</Typography.Text>
          {data.experience.map((exp, i) => (
            <Card size="small" key={i} style={{ marginTop: 4 }}>
              <Typography.Text strong>{exp.title} @ {exp.company}</Typography.Text>
              <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{exp.start} - {exp.end}</div>
              <ul style={{ paddingLeft: 20, marginTop: 4, marginBottom: 0 }}>
                {(exp.points || []).map((p, j) => <li key={j} style={{ fontSize: 13 }}>{p}</li>)}
              </ul>
            </Card>
          ))}
        </div>
      )}
      {data.education && data.education.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Typography.Text type="secondary">教育背景</Typography.Text>
          {data.education.map((edu, i) => (
            <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{edu.school} - {edu.major} {edu.degree}</div>
          ))}
        </div>
      )}
    </Card>
  )
}

export default function DiffPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const id1 = searchParams.get('id1') || ''
  const id2 = searchParams.get('id2') || ''

  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<DiffResponse | null>(null)

  useEffect(() => {
    const t = getToken()
    if (!t) { router.push('/login'); return }
    setToken(t)
  }, [router])

  useEffect(() => {
    if (!token || !id1 || !id2) return
    setLoading(true)
    optimize.diff(id1, id2).then((res) => {
      setData(res.data)
    }).catch(() => {
      message.error('加载对比失败')
    }).finally(() => setLoading(false))
  }, [token, id1, id2])

  if (!token) return <AuthGate activeKey="history" />

  if (loading) {
    return (
      <AppLayout activeKey="history" hideNav>
        <div className="app-empty-state" style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <Spin size="large" tip="加载中..." />
        </div>
      </AppLayout>
    )
  }

  if (!data) {
    return (
      <AppLayout activeKey="history" hideNav backPath="/history" backLabel="返回历史" title="版本对比" subtitle="无法加载对比数据">
        <div className="app-empty-state">
          <Empty description="无法加载对比数据" />
        </div>
      </AppLayout>
    )
  }

  const a = data.record_a
  const b = data.record_b

  return (
    <AppLayout activeKey="history" backPath="/history" backLabel="返回历史" title="版本对比" subtitle={`${a.job_title || ''} @ ${a.company || ''} vs ${b.job_title || ''} @ ${b.company || ''}`}>
      <div className="app-page-enter">
        <Card style={{ marginBottom: 16 }}>
          <Typography.Title level={5} className="app-section-title">差异摘要</Typography.Title>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            {data.diff_summary}
          </div>
          <Row gutter={16} style={{ marginTop: 12 }}>
            <Col xs={24} sm={12}>
              <Descriptions size="small" column={1}>
                <Descriptions.Item label="版本 A">{a.job_title} @ {a.company}</Descriptions.Item>
                <Descriptions.Item label="匹配分">{a.match_score} 分</Descriptions.Item>
                <Descriptions.Item label="时间">{a.created_at ? formatDate(a.created_at) : '-'}</Descriptions.Item>
              </Descriptions>
            </Col>
            <Col xs={24} sm={12}>
              <Descriptions size="small" column={1}>
                <Descriptions.Item label="版本 B">{b.job_title} @ {b.company}</Descriptions.Item>
                <Descriptions.Item label="匹配分">{b.match_score} 分</Descriptions.Item>
                <Descriptions.Item label="时间">{b.created_at ? formatDate(b.created_at) : '-'}</Descriptions.Item>
              </Descriptions>
            </Col>
          </Row>
        </Card>

        <Row gutter={16}>
          <Col xs={24} md={12}>
            <SideBySideCard label="版本 A" data={a.optimized_json || null} color="var(--text-tertiary)" />
          </Col>
          <Col xs={24} md={12}>
            <SideBySideCard label="版本 B" data={b.optimized_json || null} color="var(--primary-600)" />
          </Col>
        </Row>
      </div>
    </AppLayout>
  )
}