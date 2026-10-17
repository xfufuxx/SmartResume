'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  Card, Col, Empty, Input, Popover, Row, Select, Space, Spin, Tag, Typography, Button,
} from 'antd'
import { ExperimentOutlined, FileTextOutlined, SearchOutlined } from '@ant-design/icons'
import { capability } from '@/lib/api'
import type { JobProfile } from '@/types'

const { Text, Paragraph } = Typography

interface Props {
  onStart: (profile: JobProfile) => void
  onGoRecords: () => void
}

/** 岗位测评 Tab：搜索 + 分类过滤 + 岗位卡片列表 */
export default function JobListTab({ onStart, onGoRecords }: Props) {
  const [loading, setLoading] = useState(true)
  const [jobs, setJobs] = useState<JobProfile[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [keyword, setKeyword] = useState('')
  const [category, setCategory] = useState<string>('all')

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      try {
        const [jobsRes, catRes] = await Promise.all([
          capability.jobs(),
          capability.categories(),
        ])
        setJobs(jobsRes.data || [])
        setCategories(catRes.data || [])
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // 前端本地过滤（列表为内置岗位量级，无需每次击键请求后端）
  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return jobs.filter((j) => {
      if (category !== 'all' && j.category !== category) return false
      if (!kw) return true
      return (
        j.title.toLowerCase().includes(kw)
        || (j.category || '').toLowerCase().includes(kw)
        || (j.tags || []).some((t) => String(t).toLowerCase().includes(kw))
      )
    })
  }, [jobs, keyword, category])

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Space wrap size="middle" style={{ width: '100%' }}>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索岗位名称 / 分类 / 标签，如：测试、开发、产品"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{ width: 320, maxWidth: '80vw' }}
          />
          <Select
            value={category}
            onChange={setCategory}
            style={{ width: 160 }}
            options={[
              { label: '全部分类', value: 'all' },
              ...categories.map((c) => ({ label: c, value: c })),
            ]}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            共 {filtered.length} 个岗位画像 · 测评为自我评估，结果用于定位能力短板
          </Text>
          <Button type="link" style={{ padding: 0 }} onClick={onGoRecords}>
            查看我的测评记录与岗位匹配排行
          </Button>
        </Space>
      </Card>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin />
        </div>
      ) : filtered.length === 0 ? (
        <Empty description="没有匹配的岗位画像" style={{ padding: 60 }} />
      ) : (
        <Row gutter={[16, 16]}>
          {filtered.map((job) => (
            <Col xs={24} sm={12} lg={8} key={job.id}>
              <Card
                hoverable
                style={{ height: '100%' }}
                styles={{ body: { display: 'flex', flexDirection: 'column', height: '100%' } }}
              >
                <Space wrap size={4} style={{ marginBottom: 8 }}>
                  <Tag color="blue">{job.category}</Tag>
                  {(job.tags || []).slice(0, 3).map((t) => (
                    <Tag key={String(t)}>{String(t)}</Tag>
                  ))}
                </Space>
                <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 4 }}>
                  {job.title}
                </Typography.Title>
                <Paragraph
                  type="secondary"
                  style={{ fontSize: 12, flex: 1, marginBottom: 12 }}
                  ellipsis={{ rows: 2 }}
                >
                  {job.summary || job.description || '—'}
                </Paragraph>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  专业核心考察点 {job.professional_dimensions?.length || 0} 项 ·
                  通识基础素质 {job.general_dimensions?.length || 0} 项
                </Text>
                <Space style={{ marginTop: 12 }}>
                  <Button
                    type="primary"
                    icon={<ExperimentOutlined />}
                    onClick={() => onStart(job)}
                  >
                    能力测评
                  </Button>
                  <JobProfilePopover job={job} />
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  )
}

/** 「查看岗位画像」：内嵌 Popover 展示岗位描述与两套维度 */
function JobProfilePopover({ job }: { job: JobProfile }) {
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState<JobProfile | null>(null)

  useEffect(() => {
    if (!open || detail) return
    ;(async () => {
      try {
        const res = await capability.job(job.id)
        setDetail(res.data)
      } catch {
        setDetail(job)
      }
    })()
  }, [open, detail, job])

  const content = (
    <div style={{ width: 380, maxWidth: '80vw' }}>
      <Text strong>{job.title}</Text>
      <Paragraph style={{ fontSize: 12, marginTop: 8, whiteSpace: 'pre-wrap' }}>
        {(detail || job).description || (detail || job).summary || '暂无画像描述'}
      </Paragraph>
      <Text type="secondary" style={{ fontSize: 12 }}>
        专业核心考察点：
      </Text>
      <div style={{ margin: '4px 0 8px' }}>
        {(detail || job).professional_dimensions?.map((d) => (
          <Tag key={d.name} style={{ marginBottom: 4 }}>{d.name}</Tag>
        ))}
      </div>
      <Text type="secondary" style={{ fontSize: 12 }}>
        通识基础素质：
      </Text>
      <div style={{ margin: '4px 0 0' }}>
        {(detail || job).general_dimensions?.map((d) => (
          <Tag key={d.name} style={{ marginBottom: 4 }}>{d.name}</Tag>
        ))}
      </div>
    </div>
  )

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      content={content}
      title="岗位画像"
      trigger="click"
      placement="right"
    >
      <Button icon={<FileTextOutlined />}>查看岗位画像</Button>
    </Popover>
  )
}
