'use client'

import React, { useEffect, useState, useCallback } from 'react'
import {
  Layout, Button, Card, Typography, Spin, message, Space,
  Row, Col, Divider, Tag, Progress, Descriptions, Empty,
} from 'antd'
import {
  LogoutOutlined, HomeOutlined, HistoryOutlined, ArrowLeftOutlined,
  DashboardOutlined, FileTextOutlined,
} from '@ant-design/icons'
import { useRouter, useSearchParams } from 'next/navigation'
import { optimize } from '@/lib/api'
import { getToken, clearAuth } from '@/lib/auth'
import { formatDate } from '@/lib/utils'
import type { OptimizeResult, ResumeParseResult, DiffResponse } from '@/types'

const { Header, Content } = Layout

function SideBySideCard({ label, data, color }: { label: string; data: ResumeParseResult | null; color: string }) {
  if (!data) return <Empty description="无数据" />
  return (
    <Card size="small" title={<span style={{ color }}>{label}</span>} style={{ borderColor: color }}>
      {data.summary && (
        <div style={{ marginBottom: 12 }}>
          <Typography.Text type="secondary">个人总结</Typography.Text>
          <div style={{ background: '#f6f8fa', padding: 8, borderRadius: 6, marginTop: 4 }}>{data.summary}</div>
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
              <div style={{ color: '#999', fontSize: 12 }}>{exp.start} - {exp.end}</div>
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
            <div key={i}>{edu.school} - {edu.major} {edu.degree}</div>
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

  const handleLogout = useCallback(() => {
    clearAuth()
    router.push('/login')
  }, [router])

  if (!token) return null

  if (loading) {
    return (
      <Layout style={{ minHeight: '100vh' }}>
        <Content style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <Spin size="large" tip="加载中..." />
        </Content>
      </Layout>
    )
  }

  if (!data) {
    return (
      <Layout style={{ minHeight: '100vh' }}>
        <Header style={{ display: 'flex', alignItems: 'center', paddingInline: 24 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.back()} type="text" style={{ color: '#fff' }}>返回</Button>
        </Header>
        <Content style={{ padding: 24, textAlign: 'center' }}>
          <Empty description="无法加载对比数据" />
        </Content>
      </Layout>
    )
  }

  const a = data.record_a
  const b = data.record_b

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingInline: 24 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/history')} type="text" style={{ color: '#fff' }}>
            返回历史
          </Button>
          <Typography.Title level={5} style={{ color: '#fff', margin: 0 }}>
            版本对比
          </Typography.Title>
        </Space>
        <Space>
          <Button icon={<DashboardOutlined />} onClick={() => router.push('/dashboard')} type="text" style={{ color: '#fff' }}>仪表盘</Button>
          <Button icon={<FileTextOutlined />} onClick={() => router.push('/resumes')} type="text" style={{ color: '#fff' }}>简历库</Button>
          <Button icon={<HistoryOutlined />} onClick={() => router.push('/history')} type="text" style={{ color: '#fff' }}>历史记录</Button>
          <Button icon={<HomeOutlined />} onClick={() => router.push('/')} type="text" style={{ color: '#fff' }}>首页</Button>
          <Button icon={<LogoutOutlined />} onClick={handleLogout} type="text" style={{ color: '#fff' }}>退出</Button>
        </Space>
      </Header>

      <Content style={{ padding: 24, maxWidth: 1400, margin: '0 auto', width: '100%' }}>
        <Card style={{ marginBottom: 16 }}>
          <Typography.Title level={5}>差异摘要</Typography.Title>
          <div style={{ fontSize: 14, color: '#666' }}>
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
            <SideBySideCard label="版本 A" data={a.optimized_json || null} color="#999" />
          </Col>
          <Col xs={24} md={12}>
            <SideBySideCard label="版本 B" data={b.optimized_json || null} color="#2c6fbb" />
          </Col>
        </Row>
      </Content>
    </Layout>
  )
}