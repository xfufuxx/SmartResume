'use client'

import React, { useEffect, useState, useCallback } from 'react'
import {
  Layout, Button, Card, Typography, Spin, message, Space,
  Row, Col, Divider, Tag, Progress, Descriptions, Alert, Empty,
} from 'antd'
import {
  LogoutOutlined, HomeOutlined, HistoryOutlined,
  DownloadOutlined, ArrowLeftOutlined,
  DashboardOutlined, FileTextOutlined,
} from '@ant-design/icons'
import { useRouter, useParams } from 'next/navigation'
import { optimize, toBackendUrl } from '@/lib/api'
import { getToken, clearAuth } from '@/lib/auth'
import { formatDate } from '@/lib/utils'
import type { OptimizeResult, ResumeParseResult } from '@/types'

const { Header, Content } = Layout

function ExperienceDiff({ original, optimized }: { original: ResumeParseResult; optimized: ResumeParseResult }) {
  const origExps = original.experience || []
  const optExps = optimized.experience || []
  const maxLen = Math.max(origExps.length, optExps.length)

  return (
    <div>
      <Typography.Title level={5}>工作经历</Typography.Title>
      {Array.from({ length: maxLen }).map((_, i) => (
        <Row gutter={16} key={i} style={{ marginBottom: 16 }}>
          <Col xs={24} md={12}>
            {origExps[i] ? (
              <Card size="small" title={<span style={{ color: '#999' }}>原简历</span>} style={{ background: '#fafafa' }}>
                <Typography.Text strong>{origExps[i].title} @ {origExps[i].company}</Typography.Text>
                <div style={{ color: '#999', fontSize: 12 }}>{origExps[i].start} - {origExps[i].end}</div>
                <ul style={{ paddingLeft: 20, marginTop: 4 }}>
                  {(origExps[i].points || []).map((p, j) => <li key={j} style={{ fontSize: 13 }}>{p}</li>)}
                </ul>
              </Card>
            ) : <Empty description="无" />}
          </Col>
          <Col xs={24} md={12}>
            {optExps[i] ? (
              <Card size="small" title={<span style={{ color: '#2c6fbb' }}>优化后</span>} style={{ borderColor: '#2c6fbb' }}>
                <Typography.Text strong>{optExps[i].title} @ {optExps[i].company}</Typography.Text>
                <div style={{ color: '#999', fontSize: 12 }}>{optExps[i].start} - {optExps[i].end}</div>
                <ul style={{ paddingLeft: 20, marginTop: 4 }}>
                  {(optExps[i].points || []).map((p, j) => <li key={j} style={{ fontSize: 13 }}>{p}</li>)}
                </ul>
              </Card>
            ) : <Empty description="无" />}
          </Col>
        </Row>
      ))}
    </div>
  )
}

function SkillsDiff({ original, optimized }: { original: ResumeParseResult; optimized: ResumeParseResult }) {
  const origSkills = new Set(original.skills || [])
  const optSkills = new Set(optimized.skills || [])
  const added = (optimized.skills || []).filter((s) => !origSkills.has(s))
  const removed = (original.skills || []).filter((s) => !optSkills.has(s))
  const kept = (optimized.skills || []).filter((s) => origSkills.has(s))

  return (
    <div>
      <Typography.Title level={5}>技能对比</Typography.Title>
      <Space direction="vertical" style={{ width: '100%' }}>
        {kept.length > 0 && (
          <div>
            <Typography.Text type="secondary">保持不变：</Typography.Text>
            <Space wrap>{kept.map((s) => <Tag key={s}>{s}</Tag>)}</Space>
          </div>
        )}
        {added.length > 0 && (
          <div>
            <Typography.Text type="secondary">新增技能：</Typography.Text>
            <Space wrap>{added.map((s) => <Tag color="green" key={s}>+ {s}</Tag>)}</Space>
          </div>
        )}
        {removed.length > 0 && (
          <div>
            <Typography.Text type="secondary">移除技能：</Typography.Text>
            <Space wrap>{removed.map((s) => <Tag color="red" key={s}>- {s}</Tag>)}</Space>
          </div>
        )}
        {kept.length === 0 && added.length === 0 && <Empty description="无技能数据" />}
      </Space>
    </div>
  )
}

export default function OptimizationDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<OptimizeResult | null>(null)

  useEffect(() => {
    const t = getToken()
    if (!t) {
      router.push('/login')
      return
    }
    setToken(t)
  }, [router])

  useEffect(() => {
    if (!token || !id) return
    setLoading(true)
    optimize.get(id).then((res) => {
      setDetail(res.data)
    }).catch(() => {
      message.error('加载详情失败')
    }).finally(() => setLoading(false))
  }, [token, id])

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

  if (!detail) {
    return (
      <Layout style={{ minHeight: '100vh' }}>
        <Header style={{ display: 'flex', alignItems: 'center', paddingInline: 24 }}>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => router.back()} type="text" style={{ color: '#fff' }}>
              返回
            </Button>
          </Space>
        </Header>
        <Content style={{ padding: 24, textAlign: 'center' }}>
          <Empty description="未找到该优化记录" />
        </Content>
      </Layout>
    )
  }

  const original = (detail.original_json as ResumeParseResult) || null
  const optimized = (detail.optimized_json as ResumeParseResult) || null

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingInline: 24 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/history')} type="text" style={{ color: '#fff' }}>
            返回历史
          </Button>
          <Typography.Title level={5} style={{ color: '#fff', margin: 0 }}>
            优化详情
          </Typography.Title>
        </Space>
        <Space>
          <Button icon={<DashboardOutlined />} onClick={() => router.push('/dashboard')} type="text" style={{ color: '#fff' }}>
            仪表盘
          </Button>
          <Button icon={<FileTextOutlined />} onClick={() => router.push('/resumes')} type="text" style={{ color: '#fff' }}>
            简历库
          </Button>
          <Button icon={<HomeOutlined />} onClick={() => router.push('/')} type="text" style={{ color: '#fff' }}>
            首页
          </Button>
          <Button icon={<HistoryOutlined />} onClick={() => router.push('/history')} type="text" style={{ color: '#fff' }}>
            历史记录
          </Button>
          <Button icon={<LogoutOutlined />} onClick={handleLogout} type="text" style={{ color: '#fff' }}>
            退出
          </Button>
        </Space>
      </Header>

      <Content style={{ padding: 24, maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        <Row gutter={[16, 16]}>
          <Col span={24}>
            <Card>
              <Space wrap>
                {detail.match_score != null && (
                  <Tag color="blue" style={{ fontSize: 16, padding: '4px 12px' }}>
                    匹配度: {detail.match_score} 分
                  </Tag>
                )}
                <Tag color={detail.status === 'completed' ? 'green' : 'orange'}>
                  {detail.status === 'completed' ? '已完成' : '待处理'}
                </Tag>
                {detail.created_at && (
                  <Tag>{formatDate(detail.created_at)}</Tag>
                )}
              </Space>
              {detail.pdf_url && (
                <Button
                  type="primary"
                  icon={<DownloadOutlined />}
                  onClick={() => window.open(toBackendUrl(detail.pdf_url), '_blank')}
                  style={{ float: 'right' }}
                >
                  下载 PDF
                </Button>
              )}
            </Card>
          </Col>
        </Row>

        {detail.match_analysis && (
          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={24} sm={8}>
              <Card size="small">
                <Typography.Text type="secondary">匹配得分</Typography.Text>
                <Progress type="dashboard" percent={detail.match_analysis.match_score} size={100} />
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card size="small" title="优势匹配">
                {(detail.match_analysis.strengths || []).map((s, i) => (
                  <div key={i} style={{ padding: '4px 0', color: '#52c41a' }}>+ {s}</div>
                ))}
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card size="small" title="差距分析">
                {(detail.match_analysis.gaps || []).map((g, i) => (
                  <div key={i} style={{ padding: '4px 0', color: '#ff4d4f' }}>- {g}</div>
                ))}
              </Card>
            </Col>
          </Row>
        )}

        <Divider />

        {detail.changes_description && (
          <Card title="修改说明" style={{ marginBottom: 16 }}>
            <pre style={{ whiteSpace: 'pre-wrap', background: '#f6f8fa', padding: 12, borderRadius: 8, margin: 0 }}>
              {detail.changes_description}
            </pre>
          </Card>
        )}

        {optimized && (
          <Card title="简历内容对比" style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Card size="small" title={<span style={{ color: '#999' }}>优化前 - 个人总结</span>} style={{ background: '#fafafa', marginBottom: 12 }}>
                  {original?.summary || optimized.summary || '暂无'}
                </Card>
              </Col>
              <Col xs={24} md={12}>
                <Card size="small" title={<span style={{ color: '#2c6fbb' }}>优化后 - 个人总结</span>} style={{ borderColor: '#2c6fbb', marginBottom: 12 }}>
                  {optimized.summary || '暂无'}
                </Card>
              </Col>
            </Row>

            <Divider />

            <ExperienceDiff original={original || { experience: [], skills: [], projects: [], personal_info: {}, summary: '', education: [] }} optimized={optimized} />

            <Divider />

            <SkillsDiff original={original || { experience: [], skills: [], projects: [], personal_info: {}, summary: '', education: [] }} optimized={optimized} />

            {optimized.projects && optimized.projects.length > 0 && (
              <>
                <Divider />
                <Typography.Title level={5}>项目经历</Typography.Title>
                {optimized.projects.map((proj, i) => (
                  <Card size="small" key={i} style={{ marginBottom: 8 }}>
                    <Typography.Text strong>{proj.name}</Typography.Text>
                    {proj.description && <div style={{ marginTop: 4 }}>{proj.description}</div>}
                    {proj.tech && proj.tech.length > 0 && (
                      <div style={{ marginTop: 4 }}>
                        <Space wrap>{proj.tech.map((t) => <Tag key={t}>{t}</Tag>)}</Space>
                      </div>
                    )}
                  </Card>
                ))}
              </>
            )}

            {optimized.education && optimized.education.length > 0 && (
              <>
                <Divider />
                <Typography.Title level={5}>教育背景</Typography.Title>
                {optimized.education.map((edu, i) => (
                  <Card size="small" key={i} style={{ marginBottom: 8 }}>
                    <Typography.Text strong>{edu.school}</Typography.Text>
                    <div style={{ color: '#666' }}>
                      {[edu.degree, edu.major].filter(Boolean).join(' - ')}
                      {edu.start && ` | ${edu.start} - ${edu.end || '至今'}`}
                    </div>
                  </Card>
                ))}
              </>
            )}
          </Card>
        )}
      </Content>
    </Layout>
  )
}