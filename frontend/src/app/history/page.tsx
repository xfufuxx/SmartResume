'use client'

import React, { useEffect, useState, useCallback } from 'react'
import {
  Layout, Button, Card, Typography, Spin, message, Space, Tag,
  Row, Col, Input, Select, Tabs, Popconfirm, Empty, Badge, Tooltip,
} from 'antd'
import {
  LogoutOutlined, HomeOutlined, DeleteOutlined, FileTextOutlined,
  PictureOutlined, ThunderboltOutlined, StarOutlined, StarFilled,
  RestOutlined, DiffOutlined, SearchOutlined, UndoOutlined,
  DashboardOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import { optimize } from '@/lib/api'
import { getToken, clearAuth } from '@/lib/auth'
import { formatDate } from '@/lib/utils'
import type { OptimizeResult } from '@/types'

const { Header, Content } = Layout

export default function HistoryPage() {
  const router = useRouter()

  const [token, setToken] = useState<string | null>(null)
  const [allRecords, setAllRecords] = useState<OptimizeResult[]>([])
  const [favorites, setFavorites] = useState<OptimizeResult[]>([])
  const [trash, setTrash] = useState<OptimizeResult[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('全部')
  const [categories, setCategories] = useState<string[]>(['全部', '开发', '产品', '运营', '设计', '市场', '其他'])
  const [selected, setSelected] = useState<string[]>([])

  useEffect(() => {
    const t = getToken()
    if (!t) { router.push('/login'); return }
    setToken(t)

    router.prefetch('/dashboard')
    router.prefetch('/resumes')
    router.prefetch('/')
  }, [router])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const res = await optimize.list(search, category === '全部' ? '' : category)
      setAllRecords(res.data)
    } catch { message.error('加载失败') }
    finally { setLoading(false) }
  }, [search, category])

  const fetchFavorites = useCallback(async () => {
    try {
      const res = await optimize.getFavorites()
      setFavorites(res.data)
    } catch { message.error('收藏加载失败') }
  }, [])

  const fetchTrash = useCallback(async () => {
    try {
      const res = await optimize.getTrash()
      setTrash(res.data)
    } catch { message.error('回收站加载失败') }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => { fetchFavorites() }, [fetchFavorites])

  const toggleFavorite = async (id: string) => {
    try {
      const res = await optimize.toggleFavorite(id)
      setAllRecords((prev) => prev.map((r) => (r.id === id ? { ...r, is_favorite: res.data.is_favorite } : r)))
      fetchFavorites()
    } catch { message.error('操作失败') }
  }

  const handleTrash = async (id: string) => {
    try {
      await optimize.trash(id)
      message.success('已移至回收站')
      fetchAll()
      fetchFavorites()
      fetchTrash()
    } catch { message.error('操作失败') }
  }

  const handleRestore = async (id: string) => {
    try {
      await optimize.restore(id)
      message.success('已恢复')
      fetchAll()
      fetchTrash()
    } catch { message.error('恢复失败') }
  }

  const handlePermanentDelete = async (id: string) => {
    try {
      await optimize.delete(id)
      message.success('已永久删除')
      fetchTrash()
    } catch { message.error('删除失败') }
  }

  const handleToggleSelect = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 2) return [prev[1], id]
      return [...prev, id]
    })
  }

  const handleDiff = () => {
    if (selected.length === 2) {
      router.push(`/history/diff?id1=${selected[0]}&id2=${selected[1]}`)
    }
  }

  const handleLogout = useCallback(() => {
    clearAuth()
    router.push('/login')
  }, [router])

  if (!token) return null

  const renderCard = (r: OptimizeResult, isTrash = false) => (
    <Card
      key={r.id}
      size="small"
      hoverable
      style={{
        borderColor: selected.includes(r.id) ? '#2c6fbb' : undefined,
        opacity: isTrash ? 0.7 : 1,
      }}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('.anticon')) return
        if (!isTrash) handleToggleSelect(r.id)
      }}
      actions={
        isTrash
          ? [
              <Tooltip title="恢复" key="restore"><Button type="link" icon={<UndoOutlined />} onClick={() => handleRestore(r.id)} /></Tooltip>,
              <Popconfirm title="永久删除？不可恢复！" key="perm" onConfirm={() => handlePermanentDelete(r.id)}>
                <Button type="link" danger icon={<DeleteOutlined />} />
              </Popconfirm>,
            ]
          : [
              <Tooltip title={r.is_favorite ? '取消收藏' : '收藏'} key="fav">
                <Button type="link" icon={r.is_favorite ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />} onClick={() => toggleFavorite(r.id)} />
              </Tooltip>,
              <Tooltip title="查看详情" key="detail">
                <Button type="link" onClick={() => router.push(`/history/${r.id}`)}>查看</Button>
              </Tooltip>,
              <Popconfirm title="移至回收站？" key="trash" onConfirm={() => handleTrash(r.id)}>
                <Button type="link" danger icon={<RestOutlined />} />
              </Popconfirm>,
            ]
      }
    >
      <Row gutter={8} align="middle">
        <Col flex="48px">
          <div style={{ width: 48, height: 48, borderRadius: 8, overflow: 'hidden', background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {r.thumbnail_url ? (
              <img src={r.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <FileTextOutlined style={{ fontSize: 24, color: '#bbb' }} />
            )}
          </div>
        </Col>
        <Col flex="auto">
          <Typography.Text strong ellipsis>{r.job_title || '未命名岗位'}</Typography.Text>
          <div>
            <Space size={4} wrap>
              {r.company && <Tag color="blue">{r.company}</Tag>}
              {r.category && <Tag>{r.category}</Tag>}
              {r.match_score != null && <Tag color={r.match_score >= 70 ? 'green' : 'orange'}>{r.match_score} 分</Tag>}
              {r.created_at && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{formatDate(r.created_at)}</Typography.Text>}
            </Space>
          </div>
        </Col>
      </Row>
    </Card>
  )

  const tabItems = [
    {
      key: 'all',
      label: <span><ThunderboltOutlined /> 全部优化</span>,
      children: (
        <div>
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={12} md={8}>
              <Input
                prefix={<SearchOutlined />}
                placeholder="搜索公司名 / 岗位名称..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                allowClear
              />
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Select value={category} onChange={setCategory} style={{ width: '100%' }}>
                {categories.map((c) => <Select.Option key={c} value={c}>{c}</Select.Option>)}
              </Select>
            </Col>
            <Col flex="auto">
              {selected.length === 2 && (
                <Button type="primary" icon={<DiffOutlined />} onClick={handleDiff}>
                  对比这两个版本
                </Button>
              )}
            </Col>
          </Row>
          <Spin spinning={loading}>
            {allRecords.length === 0 ? (
              <Empty description="暂无优化记录，去首页试试" />
            ) : (
              <Row gutter={[12, 12]}>
                {allRecords.map((r) => <Col xs={24} sm={12} lg={8} key={r.id}>{renderCard(r)}</Col>)}
              </Row>
            )}
          </Spin>
        </div>
      ),
    },
    {
      key: 'favorites',
      label: <span><StarFilled style={{ color: '#faad14' }} /> 收藏夹 <Badge count={favorites.length} size="small" /></span>,
      children: (
        favorites.length === 0 ? (
          <Empty description="暂无收藏内容，点击星星图标收藏" />
        ) : (
          <Row gutter={[12, 12]}>
            {favorites.map((r) => <Col xs={24} sm={12} lg={8} key={r.id}>{renderCard(r)}</Col>)}
          </Row>
        )
      ),
    },
    {
      key: 'trash',
      label: <span><DeleteOutlined /> 回收站 <Badge count={trash.length} size="small" /></span>,
      children: (
        trash.length === 0 ? (
          <Empty description="回收站为空" />
        ) : (
          <Row gutter={[12, 12]}>
            {trash.map((r) => <Col xs={24} sm={12} lg={8} key={r.id}>{renderCard(r, true)}</Col>)}
          </Row>
        )
      ),
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingInline: 24 }}>
        <Typography.Title level={4} style={{ color: '#fff', margin: 0 }}>
          历史记录
        </Typography.Title>
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
          <Button icon={<LogoutOutlined />} onClick={handleLogout} type="text" style={{ color: '#fff' }}>
            退出
          </Button>
        </Space>
      </Header>

      <Content style={{ padding: 24, maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        <Card>
          <Tabs
            defaultActiveKey="all"
            items={tabItems}
            onChange={(key) => {
              if (key === 'favorites') fetchFavorites()
              else if (key === 'trash') fetchTrash()
              else fetchAll()
            }}
          />
        </Card>
      </Content>
    </Layout>
  )
}