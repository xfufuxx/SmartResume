'use client'

import React, { useEffect, useState, useCallback } from 'react'
import {
  Layout, Button, Card, Typography, Spin, Row, Col, message,
  Tag, Space, Modal, Input, Empty, Tooltip, Popconfirm, Tabs, Select, Checkbox,
} from 'antd'
import {
  HomeOutlined, HistoryOutlined, FileTextOutlined, PlusOutlined,
  CrownOutlined, CopyOutlined, DeleteOutlined, EditOutlined,
  DashboardOutlined, StarOutlined, StarFilled, UndoOutlined,
  BankOutlined, UploadOutlined, HeartOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import { jobs, toBackendUrl } from '@/lib/api'
import { getToken, clearAuth } from '@/lib/auth'
import { formatDate } from '@/lib/utils'

const { Header, Content } = Layout
const { TextArea } = Input

const CATEGORIES = ['产品', '开发', '运营', '设计', '市场', '销售', '其他']

interface JobRecord {
  id: string
  user_id: string
  image_url: string
  parsed_job_json?: Record<string, unknown> | null
  title?: string | null
  company?: string | null
  category?: string | null
  is_primary: boolean
  is_favorite: boolean
  user_remark?: string | null
  deleted_at?: string | null
  created_at: string
}

export default function JobLibrary() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [list, setList] = useState<JobRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('all')
  const [searchQ, setSearchQ] = useState('')
  const [filterCategory, setFilterCategory] = useState('')

  // 弹窗状态
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editJob, setEditJob] = useState<JobRecord | null>(null)
  const [editForm, setEditForm] = useState({ title: '', company: '', category: '', user_remark: '' })
  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  const [previewJob, setPreviewJob] = useState<JobRecord | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [batchLoading, setBatchLoading] = useState(false)

  useEffect(() => {
    const t = getToken()
    if (!t) { router.push('/login'); return }
    setToken(t)
    router.prefetch('/')
    router.prefetch('/resumes')
    router.prefetch('/history')
  }, [router])

  useEffect(() => {
    if (!token) return
    loadData()
  }, [token, activeTab])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      let res
      if (activeTab === 'favorites') {
        res = await jobs.getFavorites()
      } else if (activeTab === 'trash') {
        res = await jobs.getTrash()
      } else {
        res = await jobs.list(searchQ, filterCategory)
      }
      setList(res.data)
    } catch {
      message.error('加载岗位列表失败')
    } finally {
      setLoading(false)
    }
  }, [activeTab, searchQ, filterCategory])

  const handleSearch = useCallback(() => {
    if (activeTab === 'all') loadData()
  }, [activeTab, loadData])

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true)
    try {
      await jobs.upload(file)
      message.success('岗位上传成功')
      setUploadModalOpen(false)
      loadData()
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message :
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '上传失败'
      message.error(errorMsg)
    } finally {
      setUploading(false)
    }
  }, [loadData])

  const handleSetPrimary = useCallback(async (id: string) => {
    try {
      await jobs.setPrimary(id)
      message.success('已设为默认岗位')
      loadData()
    } catch {
      message.error('设置失败')
    }
  }, [loadData])

  const handleToggleFavorite = useCallback(async (id: string) => {
    try {
      await jobs.toggleFavorite(id)
      loadData()
    } catch {
      message.error('操作失败')
    }
  }, [loadData])

  const handleCopy = useCallback(async (id: string) => {
    try {
      await jobs.copy(id)
      message.success('岗位已复制')
      loadData()
    } catch {
      message.error('复制失败')
    }
  }, [loadData])

  const handleTrash = useCallback(async (id: string) => {
    try {
      await jobs.trash(id)
      message.success('已移至回收站')
      loadData()
    } catch {
      message.error('删除失败')
    }
  }, [loadData])

  const handleRestore = useCallback(async (id: string) => {
    try {
      await jobs.restore(id)
      message.success('已恢复')
      loadData()
    } catch {
      message.error('恢复失败')
    }
  }, [loadData])

  const handlePermanentDelete = useCallback(async (id: string) => {
    try {
      await jobs.delete(id)
      message.success('已永久删除')
      loadData()
    } catch {
      message.error('删除失败')
    }
  }, [loadData])

  const openEdit = useCallback((job: JobRecord) => {
    setEditJob(job)
    setEditForm({
      title: job.title || '',
      company: job.company || '',
      category: job.category || '',
      user_remark: job.user_remark || '',
    })
    setEditModalOpen(true)
  }, [])

  const handleSaveEdit = useCallback(async () => {
    if (!editJob) return
    try {
      await jobs.update(editJob.id, editForm)
      message.success('更新成功')
      setEditModalOpen(false)
      setEditJob(null)
      loadData()
    } catch {
      message.error('更新失败')
    }
  }, [editJob, editForm, loadData])

  const openPreview = useCallback((job: JobRecord) => {
    setPreviewJob(job)
    setPreviewModalOpen(true)
  }, [])

  const toggleSelectMode = useCallback(() => {
    setSelectMode((prev) => !prev)
    setSelectedIds([])
  }, [])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }, [])

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.length === list.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(list.map((j) => j.id))
    }
  }, [list, selectedIds])

  const handleBatchTrash = useCallback(async () => {
    if (selectedIds.length === 0) return
    setBatchLoading(true)
    try {
      const res = await jobs.batchTrash(selectedIds)
      message.success(res.data?.detail || `已移至回收站 ${selectedIds.length} 个岗位`)
      setSelectedIds([])
      setSelectMode(false)
      loadData()
    } catch {
      message.error('批量删除失败')
    } finally {
      setBatchLoading(false)
    }
  }, [selectedIds, loadData])

  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.length === 0) return
    setBatchLoading(true)
    try {
      const res = await jobs.batchDelete(selectedIds)
      message.success(res.data?.detail || `已永久删除 ${selectedIds.length} 个岗位`)
      setSelectedIds([])
      setSelectMode(false)
      loadData()
    } catch {
      message.error('批量删除失败')
    } finally {
      setBatchLoading(false)
    }
  }, [selectedIds, loadData])

  const handleBatchRestore = useCallback(async () => {
    if (selectedIds.length === 0) return
    setBatchLoading(true)
    try {
      const res = await jobs.batchRestore(selectedIds)
      message.success(res.data?.detail || `已恢复 ${selectedIds.length} 个岗位`)
      setSelectedIds([])
      setSelectMode(false)
      loadData()
    } catch {
      message.error('批量恢复失败')
    } finally {
      setBatchLoading(false)
    }
  }, [selectedIds, loadData])

  const getJobTitle = (job: JobRecord) => {
    if (job.title) return job.title
    const parsed = job.parsed_job_json as Record<string, unknown> | null
    return (parsed?.title as string) || '未命名岗位'
  }

  const getJobCompany = (job: JobRecord) => {
    if (job.company) return job.company
    const parsed = job.parsed_job_json as Record<string, unknown> | null
    return (parsed?.company as string) || ''
  }

  if (!token) return null

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingInline: 24 }}>
        <Space>
          <Typography.Title level={4} style={{ color: '#fff', margin: 0 }}>
            <BankOutlined /> 岗位库
          </Typography.Title>
        </Space>
        <Space>
          <Button icon={<HomeOutlined />} onClick={() => router.push('/')} type="text" style={{ color: '#fff' }}>首页</Button>
          <Button icon={<FileTextOutlined />} onClick={() => router.push('/resumes')} type="text" style={{ color: '#fff' }}>简历库</Button>
          <Button icon={<DashboardOutlined />} onClick={() => router.push('/dashboard')} type="text" style={{ color: '#fff' }}>仪表盘</Button>
          <Button icon={<HistoryOutlined />} onClick={() => router.push('/history')} type="text" style={{ color: '#fff' }}>历史记录</Button>
          <Button icon={<UndoOutlined />} onClick={() => { clearAuth(); router.push('/login') }} type="text" style={{ color: '#fff' }}>退出</Button>
        </Space>
      </Header>

      <Content style={{ padding: 24, maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        {/* 顶部操作栏 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Typography.Title level={3} style={{ margin: 0 }}>我的岗位</Typography.Title>
          <Space>
            {selectMode && selectedIds.length > 0 && (
              <>
                {activeTab === 'trash' ? (
                  <>
                    <Popconfirm
                      title={`确定恢复选中的 ${selectedIds.length} 个岗位？`}
                      onConfirm={handleBatchRestore}
                      okText="恢复"
                      cancelText="取消"
                    >
                      <Button loading={batchLoading}>
                        批量恢复（{selectedIds.length}）
                      </Button>
                    </Popconfirm>
                    <Popconfirm
                      title={`确定永久删除选中的 ${selectedIds.length} 个岗位？此操作不可撤销。`}
                      onConfirm={handleBatchDelete}
                      okText="永久删除"
                      cancelText="取消"
                    >
                      <Button danger loading={batchLoading}>
                        批量永久删除（{selectedIds.length}）
                      </Button>
                    </Popconfirm>
                  </>
                ) : (
                  <Popconfirm
                    title={`确定将选中的 ${selectedIds.length} 个岗位移至回收站？`}
                    onConfirm={handleBatchTrash}
                    okText="确定"
                    cancelText="取消"
                  >
                    <Button danger loading={batchLoading}>
                      批量删除（{selectedIds.length}）
                    </Button>
                  </Popconfirm>
                )}
              </>
            )}
            {list.length > 0 && (
              <Button onClick={toggleSelectMode}>
                {selectMode ? '取消选择' : '批量管理'}
              </Button>
            )}
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setUploadModalOpen(true)}>
              上传岗位
            </Button>
          </Space>
        </div>

        {/* 搜索和筛选 */}
        {activeTab === 'all' && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <Input.Search
              placeholder="搜索岗位标题或公司"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onSearch={handleSearch}
              style={{ maxWidth: 300 }}
              allowClear
            />
            <Select
              placeholder="分类筛选"
              value={filterCategory || undefined}
              onChange={(v) => { setFilterCategory(v || ''); }}
              allowClear
              style={{ minWidth: 120 }}
              options={[
                { label: '全部', value: '' },
                ...CATEGORIES.map(c => ({ label: c, value: c })),
              ]}
            />
          </div>
        )}

        {/* Tab 切换 */}
        <Tabs
          activeKey={activeTab}
          onChange={(key) => { setActiveTab(key); setSelectMode(false); setSelectedIds([]) }}
          items={[
            { key: 'all', label: '全部岗位' },
            { key: 'favorites', label: <span><HeartOutlined /> 收藏</span> },
            { key: 'trash', label: '回收站' },
          ]}
          style={{ marginBottom: 16 }}
        />

        {/* 岗位列表 */}
        {loading ? (
          <Spin tip="加载中..." style={{ display: 'block', textAlign: 'center', padding: 60 }} />
        ) : list.length === 0 ? (
          <Empty
            description={
              activeTab === 'trash' ? '回收站为空' :
              activeTab === 'favorites' ? '暂无收藏岗位' :
              '还没有岗位，请上传你的第一份岗位'
            }
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            {activeTab === 'all' && (
              <Button type="primary" onClick={() => setUploadModalOpen(true)}>
                <PlusOutlined /> 上传岗位
              </Button>
            )}
          </Empty>
        ) : (
          <>
            {selectMode && (
              <div style={{ marginBottom: 12 }}>
                <Button size="small" onClick={toggleSelectAll}>
                  {selectedIds.length === list.length ? '取消全选' : '全选'}
                </Button>
                <span style={{ marginLeft: 8, color: '#999', fontSize: 13 }}>
                  已选 {selectedIds.length} / {list.length}
                </span>
              </div>
            )}
            <Row gutter={[16, 16]}>
            {list.map((job) => (
              <Col xs={24} sm={12} md={8} key={job.id}>
                <div style={{ position: 'relative' }}>
                {selectMode && (
                  <Checkbox
                    checked={selectedIds.includes(job.id)}
                    onChange={() => toggleSelect(job.id)}
                    style={{ position: 'absolute', top: 8, left: 8, zIndex: 1 }}
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
                <Card
                  hoverable
                  onClick={() => !selectMode && openPreview(job)}
                  style={{
                    borderColor: job.is_primary ? '#2c6fbb' : undefined,
                    borderWidth: job.is_primary ? 2 : 1,
                  }}
                  actions={activeTab === 'trash' ? [
                    <Tooltip title="恢复" key="restore">
                      <Button type="text" icon={<UndoOutlined />} onClick={(e) => { e.stopPropagation(); handleRestore(job.id) }} />
                    </Tooltip>,
                    <Popconfirm key="delete" title="确定永久删除？" onConfirm={() => handlePermanentDelete(job.id)} okText="删除" cancelText="取消">
                      <Tooltip title="永久删除">
                        <Button type="text" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
                      </Tooltip>
                    </Popconfirm>,
                  ] : [
                    <Tooltip title={job.is_favorite ? '取消收藏' : '收藏'} key="fav">
                      <Button
                        type="text"
                        icon={job.is_favorite ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />}
                        onClick={(e) => { e.stopPropagation(); handleToggleFavorite(job.id) }}
                      />
                    </Tooltip>,
                    <Tooltip title="设为默认" key="primary">
                      <Button
                        type="text"
                        icon={<CrownOutlined style={{ color: job.is_primary ? '#faad14' : '#8c8c8c' }} />}
                        onClick={(e) => { e.stopPropagation(); handleSetPrimary(job.id) }}
                        disabled={job.is_primary}
                      />
                    </Tooltip>,
                    <Tooltip title="编辑" key="edit">
                      <Button type="text" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); openEdit(job) }} />
                    </Tooltip>,
                    <Tooltip title="复制" key="copy">
                      <Button type="text" icon={<CopyOutlined />} onClick={(e) => { e.stopPropagation(); handleCopy(job.id) }} />
                    </Tooltip>,
                    <Popconfirm key="trash" title="确定移至回收站？" onConfirm={() => handleTrash(job.id)} okText="确定" cancelText="取消">
                      <Tooltip title="删除">
                        <Button type="text" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
                      </Tooltip>
                    </Popconfirm>,
                  ]}
                >
                  <Card.Meta
                    title={
                      <Space>
                        {getJobTitle(job)}
                        {job.is_primary && <Tag color="gold">默认</Tag>}
                        {job.is_favorite && <StarFilled style={{ color: '#faad14', fontSize: 12 }} />}
                      </Space>
                    }
                    description={
                      <div>
                        {getJobCompany(job) && (
                          <div style={{ marginBottom: 4 }}>
                            <BankOutlined style={{ marginRight: 4 }} />
                            {getJobCompany(job)}
                          </div>
                        )}
                        <div style={{ marginBottom: 4 }}>
                          {job.category && <Tag color="blue">{job.category}</Tag>}
                          <span style={{ fontSize: 12, color: '#999' }}>
                            {formatDate(job.created_at)}
                          </span>
                        </div>
                        {job.parsed_job_json && (
                          <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                            {(job.parsed_job_json as Record<string, string>).salary_range && (
                              <div>薪资: {(job.parsed_job_json as Record<string, string>).salary_range}</div>
                            )}
                            {(job.parsed_job_json as Record<string, string>).location && (
                              <div>地点: {(job.parsed_job_json as Record<string, string>).location}</div>
                            )}
                          </div>
                        )}
                      </div>
                    }
                  />
                </Card>
                </div>
              </Col>
            ))}
          </Row>
          </>
        )}

        {/* 上传弹窗 */}
        <Modal
          title="上传岗位图片"
          open={uploadModalOpen}
          onCancel={() => setUploadModalOpen(false)}
          footer={null}
        >
          <div style={{ textAlign: 'center', padding: 24 }}>
            <input
              type="file"
              id="upload-job-input"
              accept=".png,.jpg,.jpeg,.webp"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleUpload(file)
                e.target.value = ''
              }}
            />
            <UploadOutlined style={{ fontSize: 48, color: '#2c6fbb', marginBottom: 16 }} />
            <div style={{ marginBottom: 16 }}>
              <Typography.Text type="secondary">
                支持 PNG、JPG、JPEG、WebP 格式，最大 20MB
              </Typography.Text>
            </div>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              loading={uploading}
              onClick={() => document.getElementById('upload-job-input')?.click()}
            >
              选择图片
            </Button>
          </div>
        </Modal>

        {/* 编辑弹窗 */}
        <Modal
          title="编辑岗位信息"
          open={editModalOpen}
          onOk={handleSaveEdit}
          onCancel={() => { setEditModalOpen(false); setEditJob(null) }}
          okText="保存"
          cancelText="取消"
        >
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div>
              <Typography.Text>岗位标题</Typography.Text>
              <Input value={editForm.title} onChange={(e) => setEditForm(p => ({ ...p, title: e.target.value }))} placeholder="如：Java后端开发" />
            </div>
            <div>
              <Typography.Text>公司名称</Typography.Text>
              <Input value={editForm.company} onChange={(e) => setEditForm(p => ({ ...p, company: e.target.value }))} placeholder="如：阿里巴巴" />
            </div>
            <div>
              <Typography.Text>分类</Typography.Text>
              <Select
                value={editForm.category || undefined}
                onChange={(v) => setEditForm(p => ({ ...p, category: v || '' }))}
                allowClear
                placeholder="选择分类"
                style={{ width: '100%' }}
                options={CATEGORIES.map(c => ({ label: c, value: c }))}
              />
            </div>
            <div>
              <Typography.Text>备注</Typography.Text>
              <TextArea
                value={editForm.user_remark}
                onChange={(e) => setEditForm(p => ({ ...p, user_remark: e.target.value }))}
                placeholder="添加备注信息"
                rows={3}
              />
            </div>
          </Space>
        </Modal>

        {/* 预览弹窗 */}
        <Modal
          title={previewJob ? getJobTitle(previewJob) : '岗位预览'}
          open={previewModalOpen}
          onCancel={() => { setPreviewModalOpen(false); setPreviewJob(null) }}
          footer={null}
          width={800}
        >
          {previewJob && (
            <div>
              <div style={{ marginBottom: 16 }}>
                {previewJob.company && <Tag color="blue"><BankOutlined /> {previewJob.company}</Tag>}
                {previewJob.category && <Tag>{previewJob.category}</Tag>}
              </div>
              {previewJob.parsed_job_json && (() => {
                const pj = previewJob.parsed_job_json as Record<string, unknown>
                const responsibilities = pj.responsibilities as string[] | undefined
                const mustHave = pj.must_have as Record<string, unknown> | undefined
                const niceToHave = pj.nice_to_have as Record<string, unknown> | undefined
                const mustSkills = (mustHave?.skills || []) as string[]
                const niceSkills = (niceToHave?.skills || []) as string[]
                return (
                  <div>
                    {responsibilities && responsibilities.length > 0 && (
                      <>
                        <Typography.Title level={5}>岗位职责</Typography.Title>
                        <ul>
                          {responsibilities.map((r: string, i: number) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    {mustSkills.length > 0 && (
                      <>
                        <Typography.Title level={5}>必备要求</Typography.Title>
                        <Space wrap>
                          {mustSkills.map((s: string) => (
                            <Tag key={s} color="red">{s}</Tag>
                          ))}
                        </Space>
                      </>
                    )}
                    {niceSkills.length > 0 && (
                      <>
                        <Typography.Title level={5} style={{ marginTop: 16 }}>加分项</Typography.Title>
                        <Space wrap>
                          {niceSkills.map((s: string) => (
                            <Tag key={s} color="green">{s}</Tag>
                          ))}
                        </Space>
                      </>
                    )}
                  </div>
                )
              })()}
              {previewJob.user_remark && (
                <>
                  <Typography.Title level={5} style={{ marginTop: 16 }}>备注</Typography.Title>
                  <Typography.Paragraph>{previewJob.user_remark}</Typography.Paragraph>
                </>
              )}
            </div>
          )}
        </Modal>
      </Content>
    </Layout>
  )
}
