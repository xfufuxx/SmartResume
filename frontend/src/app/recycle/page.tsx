'use client'

import React, { useEffect, useMemo, useState, useCallback } from 'react'
import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  FileTextOutlined,
  ThunderboltOutlined,
  MessageOutlined,
  ContainerOutlined,
  FileOutlined,
  DeleteOutlined,
  UndoOutlined,
  SearchOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import { resumes, jobs, optimize } from '@/lib/api'
import { getToken } from '@/lib/auth'
import { formatDate } from '@/lib/utils'
import type { ResumeRecord, JobRecord, OptimizeResult } from '@/types'
import AppLayout from '@/components/AppLayout'
import AuthGate from '@/components/AuthGate'

const { Text } = Typography

type ItemType = 'resume' | 'report' | 'interview' | 'job' | 'other'
type TabKey = 'all' | ItemType

const RETENTION_DAYS = 30

interface TrashItem {
  id: string
  type: ItemType
  title: string
  source: string
  deletedAt: string
  remainingDays: number
  size: string
}

interface TrashJobRecord extends JobRecord {
  deleted_at?: string
  title?: string
  company?: string
}

interface TypeMeta {
  label: string
  color: string
  bg: string
  icon: React.ComponentType<{ style?: React.CSSProperties }>
}

const typeMeta: Record<ItemType, TypeMeta> = {
  resume: {
    label: '简历',
    color: 'var(--primary-600)',
    bg: 'var(--primary-50)',
    icon: FileTextOutlined,
  },
  report: {
    label: '优化报告',
    color: 'var(--success-600)',
    bg: 'var(--success-50)',
    icon: ThunderboltOutlined,
  },
  interview: {
    label: '面试记录',
    color: 'var(--purple-500)',
    bg: 'var(--gray-100)',
    icon: MessageOutlined,
  },
  job: {
    label: '职位',
    color: 'var(--warning-600)',
    bg: 'var(--warning-50)',
    icon: ContainerOutlined,
  },
  other: {
    label: '其他',
    color: 'var(--text-tertiary)',
    bg: 'var(--gray-100)',
    icon: FileOutlined,
  },
}

const tabs: { key: TabKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'resume', label: '简历' },
  { key: 'report', label: '优化报告' },
  { key: 'interview', label: '面试记录' },
  { key: 'job', label: '职位' },
  { key: 'other', label: '其他' },
]

function extractArray(res: { data?: unknown } | unknown): unknown[] {
  if (!res) return []
  const data = (res as { data?: unknown }).data
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object' && 'data' in data) {
    const nested = (data as { data?: unknown }).data
    return Array.isArray(nested) ? nested : []
  }
  return []
}

function deriveSize(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  const kb = (hash % 520) + 30
  return `${kb} KB`
}

function calcRemainingDays(deletedAt: string): number {
  const deleted = new Date(deletedAt).getTime()
  if (Number.isNaN(deleted)) return 0
  const expireAt = deleted + RETENTION_DAYS * 24 * 60 * 60 * 1000
  const diff = expireAt - Date.now()
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)))
}

function TypeTag({ type }: { type: ItemType }) {
  const meta = typeMeta[type]
  return (
    <Tag
      style={{
        color: meta.color,
        background: meta.bg,
        border: 'none',
        fontWeight: 500,
      }}
    >
      {meta.label}
    </Tag>
  )
}

function FileIcon({ type }: { type: ItemType }) {
  const meta = typeMeta[type]
  const Icon = meta.icon
  return (
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: 'var(--radius-md)',
        background: meta.bg,
        color: meta.color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 18,
        flexShrink: 0,
      }}
    >
      <Icon />
    </div>
  )
}

export default function RecyclePage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<TrashItem[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<TabKey>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    const t = getToken()
    if (!t) {
      router.push('/login')
      return
    }
    setToken(t)
  }, [router])

  const load = useCallback(async () => {
    setLoading(true)
    setSelectedIds([])
    try {
      const [resRes, jobRes, optRes] = await Promise.all([
        resumes.trash(),
        jobs.getTrash(),
        optimize.getTrash(),
      ])

      const resumeRows = extractArray(resRes) as ResumeRecord[]
      const jobRows = extractArray(jobRes) as TrashJobRecord[]
      const optRows = extractArray(optRes) as OptimizeResult[]

      const mapped: TrashItem[] = [
        ...resumeRows.map((r) => {
          const deletedAt = r.deleted_at || r.updated_at || r.created_at
          const title = r.title || `未命名简历.${r.file_type || 'pdf'}`
          return {
            id: r.id,
            type: 'resume' as ItemType,
            title,
            source: '我的简历',
            deletedAt,
            remainingDays: calcRemainingDays(deletedAt),
            size: deriveSize(r.id + (r.file_type || '')),
          }
        }),
        ...jobRows.map((j) => {
          const title =
            j.title ||
            j.parsed_job_json?.title ||
            '未命名职位'
          const source = '职位管理'
          const deletedAt =
            j.deleted_at || j.created_at || new Date().toISOString()
          return {
            id: j.id,
            type: 'job' as ItemType,
            title,
            source,
            deletedAt,
            remainingDays: calcRemainingDays(deletedAt),
            size: '--',
          }
        }),
        ...optRows.map((o) => {
          const title =
            o.job_title
              ? `${o.job_title}${o.company ? ` · ${o.company}` : ''} 优化报告`
              : '未命名优化报告'
          const deletedAt =
            o.deleted_at || o.created_at || new Date().toISOString()
          return {
            id: o.id,
            type: 'report' as ItemType,
            title,
            source: 'AI 优化',
            deletedAt,
            remainingDays: calcRemainingDays(deletedAt),
            size: deriveSize(o.id + 'report'),
          }
        }),
      ]

      mapped.sort(
        (a, b) =>
          new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime()
      )

      setItems(mapped)
    } catch {
      message.error('加载回收站失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (token) load()
  }, [token, load])

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((item) => {
      const matchesTab = activeTab === 'all' || item.type === activeTab
      const matchesSearch =
        !q ||
        item.title.toLowerCase().includes(q) ||
        typeMeta[item.type].label.includes(q) ||
        item.source.toLowerCase().includes(q)
      return matchesTab && matchesSearch
    })
  }, [items, activeTab, search])

  const tabCounts = useMemo(() => {
    const counts: Record<TabKey, number> = {
      all: items.length,
      resume: 0,
      report: 0,
      interview: 0,
      job: 0,
      other: 0,
    }
    items.forEach((item) => {
      counts[item.type] += 1
    })
    return counts
  }, [items])

  const restoreByType = useCallback(
    async (ids: string[], type: ItemType) => {
      if (type === 'resume') {
        await resumes.batchRestore(ids)
      } else if (type === 'job') {
        await jobs.batchRestore(ids)
      } else if (type === 'report') {
        await Promise.all(ids.map((id) => optimize.restore(id)))
      } else {
        throw new Error('该类型暂不支持恢复')
      }
    },
    []
  )

  const deleteByType = useCallback(
    async (ids: string[], type: ItemType) => {
      if (type === 'resume') {
        await resumes.batchDelete(ids)
      } else if (type === 'job') {
        await jobs.batchDelete(ids)
      } else if (type === 'report') {
        await Promise.all(ids.map((id) => optimize.delete(id)))
      } else {
        throw new Error('该类型暂不支持删除')
      }
    },
    []
  )

  const handleRestore = useCallback(
    async (item: TrashItem) => {
      try {
        await restoreByType([item.id], item.type)
        message.success('已还原')
        load()
      } catch {
        message.error('还原失败')
      }
    },
    [load, restoreByType]
  )

  const handleDelete = useCallback(
    async (item: TrashItem) => {
      try {
        await deleteByType([item.id], item.type)
        message.success('已彻底删除')
        load()
      } catch {
        message.error('删除失败')
      }
    },
    [load, deleteByType]
  )

  const groupByType = useCallback((ids: string[]) => {
    const map: Record<ItemType, string[]> = {
      resume: [],
      report: [],
      interview: [],
      job: [],
      other: [],
    }
    ids.forEach((id) => {
      const item = items.find((i) => i.id === id)
      if (item) map[item.type].push(id)
    })
    return map
  }, [items])

  const handleBatchRestore = useCallback(async () => {
    if (selectedIds.length === 0) return
    try {
      const groups = groupByType(selectedIds)
      await Promise.all(
        (Object.keys(groups) as ItemType[])
          .filter((key) => groups[key].length > 0)
          .map((key) => restoreByType(groups[key], key))
      )
      message.success(`已还原 ${selectedIds.length} 项`)
      setSelectedIds([])
      load()
    } catch {
      message.error('批量还原失败')
    }
  }, [selectedIds, groupByType, load, restoreByType])

  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.length === 0) return
    try {
      const groups = groupByType(selectedIds)
      await Promise.all(
        (Object.keys(groups) as ItemType[])
          .filter((key) => groups[key].length > 0)
          .map((key) => deleteByType(groups[key], key))
      )
      message.success(`已彻底删除 ${selectedIds.length} 项`)
      setSelectedIds([])
      load()
    } catch {
      message.error('批量删除失败')
    }
  }, [selectedIds, groupByType, load, deleteByType])

  const handleClearAll = useCallback(() => {
    if (items.length === 0) return
    Modal.confirm({
      title: '清空回收站',
      content: '清空后所有内容将被永久删除且无法恢复，是否继续？',
      okText: '清空',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          const groups = groupByType(items.map((i) => i.id))
          await Promise.all(
            (Object.keys(groups) as ItemType[])
              .filter((key) => groups[key].length > 0)
              .map((key) => deleteByType(groups[key], key))
          )
          message.success('回收站已清空')
          setSelectedIds([])
          load()
        } catch {
          message.error('清空失败')
        }
      },
    })
  }, [items, groupByType, load, deleteByType])

  const remainingDaysColor = (days: number) => {
    if (days <= 3) return 'var(--error-500)'
    if (days <= 7) return 'var(--warning-500)'
    return 'var(--warning-500)'
  }

  const columns: ColumnsType<TrashItem> = [
    {
      title: '文件名称',
      dataIndex: 'title',
      key: 'title',
      render: (_, record) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <FileIcon type={record.type} />
          <Text
            strong
            ellipsis={{ tooltip: true }}
            style={{ maxWidth: 280, color: 'var(--text-primary)' }}
          >
            {record.title}
          </Text>
        </div>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 110,
      render: (type: ItemType) => <TypeTag type={type} />,
    },
    {
      title: '来源',
      dataIndex: 'source',
      key: 'source',
      width: 120,
      render: (source: string) => (
        <span style={{ color: 'var(--text-secondary)' }}>{source}</span>
      ),
    },
    {
      title: '删除时间',
      dataIndex: 'deletedAt',
      key: 'deletedAt',
      width: 170,
      sorter: (a, b) =>
        new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime(),
      render: (deletedAt: string) => (
        <span style={{ color: 'var(--text-secondary)' }}>
          {formatDate(deletedAt)}
        </span>
      ),
    },
    {
      title: '剩余时间',
      dataIndex: 'remainingDays',
      key: 'remainingDays',
      width: 100,
      render: (days: number) => (
        <span style={{ color: remainingDaysColor(days), fontWeight: 500 }}>
          {days} 天
        </span>
      ),
    },
    {
      title: '大小',
      dataIndex: 'size',
      key: 'size',
      width: 90,
      render: (size: string) => (
        <span style={{ color: 'var(--text-tertiary)' }}>{size}</span>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_, record) => (
        <Space size="small">
          <Button
            type="text"
            size="small"
            icon={<UndoOutlined />}
            onClick={() => handleRestore(record)}
            style={{ color: 'var(--primary-600)' }}
          >
            还原
          </Button>
          <Popconfirm
            title="确定要彻底删除吗？"
            description="删除后将无法恢复，请谨慎操作。"
            onConfirm={() => handleDelete(record)}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
            >
              彻底删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  if (!token) return <AuthGate activeKey="recycle" />

  return (
    <AppLayout
      activeKey="recycle"
      title="回收站"
      subtitle="已删除的内容会保留 30 天，可在此恢复"
      searchable={false}
    >
      <div className="app-page-enter">
        <Alert
          message="回收站中的内容会在 30 天后自动永久删除，您也可以手动彻底删除。"
          type="info"
          showIcon
          icon={<InfoCircleOutlined />}
          style={{
            marginBottom: 20,
            background: 'var(--primary-50)',
            color: 'var(--text-secondary)',
          }}
        />

        <Card style={{ borderRadius: 'var(--radius-lg)' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16,
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div
              role="tablist"
              style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}
            >
              {tabs.map((tab) => {
                const active = activeTab === tab.key
                return (
                  <button
                    key={tab.key}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveTab(tab.key)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 'var(--radius-md)',
                      border: 'none',
                      background: active ? 'var(--primary-50)' : 'transparent',
                      color: active
                        ? 'var(--primary-600)'
                        : 'var(--text-secondary)',
                      fontWeight: active ? 600 : 500,
                      cursor: 'pointer',
                      transition: 'all var(--duration-fast) var(--ease-out)',
                    }}
                  >
                    {tab.label}
                    <span
                      style={{
                        marginLeft: 6,
                        color: active
                          ? 'var(--primary-600)'
                          : 'var(--text-quaternary)',
                        fontSize: 12,
                      }}
                    >
                      ({tabCounts[tab.key]})
                    </span>
                  </button>
                )
              })}
            </div>

            <Space>
              <Input
                placeholder="搜索文件名称、类型"
                prefix={<SearchOutlined style={{ color: 'var(--text-quaternary)' }} />}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                allowClear
                style={{ width: 240 }}
              />
              <Button
                danger
                icon={<DeleteOutlined />}
                onClick={handleClearAll}
                disabled={items.length === 0}
              >
                清空回收站
              </Button>
            </Space>
          </div>

          {selectedIds.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                marginBottom: 16,
                borderRadius: 'var(--radius-md)',
                background: 'var(--primary-50)',
                border: '1px solid var(--border-light)',
              }}
            >
              <span style={{ color: 'var(--text-secondary)' }}>
                已选 <strong style={{ color: 'var(--primary-600)' }}>{selectedIds.length}</strong> 项
              </span>
              <Space>
                <Button
                  size="small"
                  icon={<UndoOutlined />}
                  onClick={handleBatchRestore}
                >
                  批量还原
                </Button>
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={handleBatchDelete}
                >
                  批量删除
                </Button>
              </Space>
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <Spin size="large" />
            </div>
          ) : filteredItems.length === 0 ? (
            <Empty
              description="暂无回收站内容"
              style={{ padding: 60 }}
            />
          ) : (
            <Table<TrashItem>
              rowKey="id"
              columns={columns}
              dataSource={filteredItems}
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showQuickJumper: true,
                pageSizeOptions: [10, 20, 50],
                showTotal: (total) => `共 ${total} 条`,
              }}
              rowSelection={{
                selectedRowKeys: selectedIds,
                onChange: (keys) => setSelectedIds(keys as string[]),
              }}
            />
          )}
        </Card>
      </div>
    </AppLayout>
  )
}
