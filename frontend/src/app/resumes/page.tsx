'use client'

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Button, Card, Typography, Spin, Row, Col, message, Tag, Space,
  Modal, Input, Empty, Tooltip, Popconfirm, Alert, Descriptions, Checkbox,
  Progress, Dropdown, Select, Segmented, Pagination, Divider,
} from 'antd'
import {
  PlusOutlined, CrownOutlined, CopyOutlined, DeleteOutlined, EditOutlined,
  EyeOutlined, StarOutlined, StarFilled, MoreOutlined, AppstoreOutlined,
  BarsOutlined, ThunderboltOutlined, TrophyOutlined, FireOutlined,
  FileTextOutlined, BulbOutlined, ClockCircleOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import { resumes, toBackendUrl } from '@/lib/api'
import { getToken } from '@/lib/auth'
import { formatDate } from '@/lib/utils'
import type { ResumeRecord, ResumeStats } from '@/types'
import AppLayout from '@/components/AppLayout'
import AuthGate from '@/components/AuthGate'

const { Text, Title } = Typography

// 状态 → 标签映射
const STATUS_MAP: Record<string, { text: string; color: string; bg: string }> = {
  optimized: { text: '已优化', color: '#059669', bg: '#ECFDF5' },
  draft: { text: '草稿', color: '#475569', bg: '#F1F5F9' },
  unoptimized: { text: '未优化', color: '#64748B', bg: '#F8FAFC' },
}

const SCORE_COLOR = (score?: number | null) =>
  !score ? '#CBD5E1' : score >= 75 ? '#10B981' : score >= 60 ? '#F59E0B' : '#EF4444'

const SUGGESTIONS = [
  { icon: <BulbOutlined />, title: '优化简历可提升面试机会', desc: '根据职位要求针对性优化内容' },
  { icon: <FileTextOutlined />, title: '完善项目经历描述', desc: '建议使用 STAR 法则展示项目成果' },
  { icon: <FireOutlined />, title: '补充量化成果数据', desc: '包含具体数字可提升简历说服力' },
  { icon: <ThunderboltOutlined />, title: '优化技能关键词', desc: '增加与目标职位匹配的关键词' },
]

export default function ResumeLibrary() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [list, setList] = useState<ResumeRecord[]>([])
  const [stats, setStats] = useState<ResumeStats>({ total: 0, optimized: 0, draft: 0, unoptimized: 0, favorite: 0 })
  const [loading, setLoading] = useState(false)

  // 筛选状态
  const [activeTab, setActiveTab] = useState<string>('all')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('update_desc')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(6)

  // 弹窗状态
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [copySourceId, setCopySourceId] = useState<string | null>(null)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  const [previewResume, setPreviewResume] = useState<ResumeRecord | null>(null)

  // 批量管理
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [batchDeleting, setBatchDeleting] = useState(false)

  useEffect(() => {
    const t = getToken()
    if (!t) {
      router.push('/login')
      return
    }
    setToken(t)
    router.prefetch('/dashboard')
    router.prefetch('/')
  }, [router])

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await resumes.list()
      setList(res.data || [])
    } catch {
      message.error('加载简历列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadStats = useCallback(async () => {
    try {
      const res = await resumes.stats()
      if (res.data) setStats(res.data)
    } catch {
      // 统计失败不阻塞主流程
    }
  }, [])

  useEffect(() => {
    if (!token) return
    loadList()
    loadStats()
  }, [token, loadList, loadStats])

  // 筛选 + 搜索 + 排序后的派生列表
  const filteredList = useMemo(() => {
    let result = [...list]

    if (activeTab === 'optimized') {
      result = result.filter((r) => r.status === 'optimized')
    } else if (activeTab === 'favorite') {
      result = result.filter((r) => r.is_favorite)
    } else if (activeTab === 'recent') {
      result = result
        .filter((r) => r.updated_at || r.created_at)
        .sort((a, b) => (b.updated_at || b.created_at).localeCompare(a.updated_at || a.created_at))
    } else if (activeTab === 'recycle') {
      result = [] // 回收站需后端补充软删除列表接口，此处预留
    }

    if (searchKeyword.trim()) {
      const kw = searchKeyword.trim().toLowerCase()
      result = result.filter((r) =>
        (r.title || '').toLowerCase().includes(kw) ||
        (r.target_position || '').toLowerCase().includes(kw) ||
        (r.target_company || '').toLowerCase().includes(kw) ||
        (r.parsed_json?.skills || []).join(' ').toLowerCase().includes(kw)
      )
    }

    if (typeFilter !== 'all') {
      result = result.filter((r) => r.file_type === typeFilter)
    }
    if (statusFilter !== 'all') {
      result = result.filter((r) => r.status === statusFilter)
    }

    if (sortBy === 'update_desc') {
      result.sort((a, b) => (b.updated_at || b.created_at).localeCompare(a.updated_at || a.created_at))
    } else if (sortBy === 'update_asc') {
      result.sort((a, b) => (a.updated_at || a.created_at).localeCompare(b.updated_at || b.created_at))
    } else if (sortBy === 'score_desc') {
      result.sort((a, b) => (b.score || 0) - (a.score || 0))
    }

    return result
  }, [list, activeTab, searchKeyword, typeFilter, statusFilter, sortBy])

  const paginatedList = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredList.slice(start, start + pageSize)
  }, [filteredList, page, pageSize])

  const handleSearch = useCallback((value: string) => {
    setSearchKeyword(value)
    setPage(1)
  }, [])

  const handleToggleFavorite = useCallback(async (resume: ResumeRecord) => {
    const next = !resume.is_favorite
    try {
      await resumes.toggleFavorite(resume.id, next)
      setList((prev) => prev.map((r) => (r.id === resume.id ? { ...r, is_favorite: next } : r)))
      loadStats()
    } catch {
      message.error('操作失败')
    }
  }, [loadStats])

  const handleSetPrimary = useCallback(async (id: string) => {
    try {
      await resumes.setPrimary(id)
      setList((prev) => prev.map((r) => ({ ...r, is_primary: r.id === id })))
      message.success('已设置为主简历')
    } catch {
      message.error('设置失败')
    }
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await resumes.delete(id)
      setList((prev) => prev.filter((r) => r.id !== id))
      loadStats()
      message.success('已移入回收站')
    } catch {
      message.error('删除失败')
    }
  }, [loadStats])

  const handleCopy = useCallback((id: string) => {
    setCopySourceId(id)
    setNewTitle('')
    setCreateModalOpen(true)
  }, [])

  const handleCreate = useCallback(async () => {
    if (!copySourceId) return
    try {
      await resumes.create(newTitle || undefined, copySourceId)
      setCreateModalOpen(false)
      setCopySourceId(null)
      setNewTitle('')
      message.success('简历副本已创建')
      loadList()
      loadStats()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '创建失败')
    }
  }, [copySourceId, newTitle, loadList, loadStats])

  const handleEdit = useCallback((id: string, currentTitle: string) => {
    setEditId(id)
    setEditTitle(currentTitle || '')
    setEditModalOpen(true)
  }, [])

  const handleSaveEdit = useCallback(async () => {
    if (!editId) return
    try {
      await resumes.update(editId, editTitle)
      setEditModalOpen(false)
      setEditId(null)
      message.success('标题已更新')
      loadList()
    } catch {
      message.error('更新失败')
    }
  }, [editId, editTitle, loadList])

  const handleUpload = useCallback(async (file: File) => {
    try {
      await resumes.upload(file)
      message.success('简历上传成功')
      loadList()
      loadStats()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '上传失败')
    }
  }, [loadList, loadStats])

  const handlePreview = useCallback((resume: ResumeRecord) => {
    setPreviewResume(resume)
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
    if (selectedIds.length === list.length && list.length > 0) {
      setSelectedIds([])
    } else {
      setSelectedIds(list.map((r) => r.id))
    }
  }, [list, selectedIds])

  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.length === 0) return
    setBatchDeleting(true)
    try {
      await resumes.batchDelete(selectedIds)
      message.success(`已删除 ${selectedIds.length} 份简历`)
      setSelectedIds([])
      setSelectMode(false)
      loadList()
      loadStats()
    } catch {
      message.error('批量删除失败')
    } finally {
      setBatchDeleting(false)
    }
  }, [selectedIds, loadList, loadStats])

  if (!token) return <AuthGate activeKey="resumes" />

  const tabs = [
    { key: 'all', label: `全部 (${stats.total})` },
    { key: 'recent', label: '最近编辑' },
    { key: 'optimized', label: `已优化 (${stats.optimized})` },
    { key: 'favorite', label: `收藏 (${stats.favorite})` },
    { key: 'recycle', label: '回收站' },
  ]

  const donutPct = stats.total > 0
    ? {
        optimized: Math.round((stats.optimized / stats.total) * 100),
        draft: Math.round((stats.draft / stats.total) * 100),
      }
    : { optimized: 0, draft: 0 }

  const donutBackground = `conic-gradient(
    #10B981 0 ${donutPct.optimized}%,
    #3B82F6 ${donutPct.optimized}% ${donutPct.optimized + donutPct.draft}%,
    #E2E8F0 ${donutPct.optimized + donutPct.draft}% 100%
  )`

  const renderResumeCard = (resume: ResumeRecord) => {
    const status = STATUS_MAP[resume.status || 'draft'] || STATUS_MAP.draft
    const targetText = [resume.target_position, resume.target_company].filter(Boolean).join(' @ ') || '未设置目标职位'
    return (
      <Card
        hoverable
        key={resume.id}
        style={{ borderRadius: 12, overflow: 'hidden', position: 'relative', height: '100%' }}
        actions={[
          <Tooltip title="预览" key="preview">
            <Button type="text" icon={<EyeOutlined />} onClick={() => handlePreview(resume)} />
          </Tooltip>,
          <Tooltip title="设为默认" key="primary">
            <Button
              type="text"
              icon={<CrownOutlined style={{ color: resume.is_primary ? '#F59E0B' : '#94A3B8' }} />}
              onClick={() => handleSetPrimary(resume.id)}
              disabled={resume.is_primary}
            />
          </Tooltip>,
          <Tooltip title="复制" key="copy">
            <Button type="text" icon={<CopyOutlined />} onClick={() => handleCopy(resume.id)} />
          </Tooltip>,
          <Tooltip title="重命名" key="edit">
            <Button type="text" icon={<EditOutlined />} onClick={() => handleEdit(resume.id, resume.title || '')} />
          </Tooltip>,
          <Popconfirm key="delete" title="确定移入回收站？" onConfirm={() => handleDelete(resume.id)} okText="删除" cancelText="取消">
            <Tooltip title="删除">
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>,
        ]}
      >
        {selectMode && (
          <Checkbox
            checked={selectedIds.includes(resume.id)}
            onChange={() => toggleSelect(resume.id)}
            style={{ position: 'absolute', top: 12, left: 12, zIndex: 2 }}
          />
        )}
        {/* 右上角：收藏 + 更多 */}
        <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 2, display: 'flex', alignItems: 'center' }}>
          <Button
            type="text"
            size="small"
            icon={resume.is_favorite ? <StarFilled style={{ color: '#F59E0B' }} /> : <StarOutlined style={{ color: '#94A3B8' }} />}
            onClick={() => handleToggleFavorite(resume)}
          />
          <Dropdown
            menu={{
              items: [
                { key: 'preview', label: '预览', icon: <EyeOutlined />, onClick: () => handlePreview(resume) },
                { key: 'primary', label: '设为默认', icon: <CrownOutlined />, onClick: () => handleSetPrimary(resume.id) },
                { key: 'copy', label: '复制', icon: <CopyOutlined />, onClick: () => handleCopy(resume.id) },
                { key: 'edit', label: '重命名', icon: <EditOutlined />, onClick: () => handleEdit(resume.id, resume.title || '') },
                { type: 'divider' },
                { key: 'delete', label: '删除', danger: true, icon: <DeleteOutlined />, onClick: () => handleDelete(resume.id) },
              ],
            }}
            trigger={['click']}
          >
            <Button type="text" size="small" icon={<MoreOutlined style={{ color: '#94A3B8' }} />} />
          </Dropdown>
        </div>

        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', paddingTop: 4 }}>
          {/* 缩略图 / 图标占位 */}
          <div style={{
            width: 64, height: 80, borderRadius: 8, flexShrink: 0,
            background: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#2563EB', fontSize: 24,
          }}>
            <FileTextOutlined />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <Text strong ellipsis={{ tooltip: resume.title }} style={{ fontSize: 15, display: 'block' }}>
              {resume.title || resume.id.slice(0, 8) + '...'}
              {resume.version && resume.version > 1 ? ` v${resume.version}` : ''}
            </Text>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {targetText}
            </div>
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Tag style={{ color: status.color, background: status.bg, border: 'none', margin: 0 }}>{status.text}</Tag>
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: '#94A3B8', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <ClockCircleOutlined /> {resume.updated_at || resume.created_at ? formatDate(resume.updated_at || resume.created_at) : '-'}
              </span>
              {typeof resume.match_rate === 'number' && (
                <span style={{ color: '#2563EB' }}>匹配度 {resume.match_rate}%</span>
              )}
            </div>
          </div>

          {/* 评分圆环 */}
          <Progress
            type="circle"
            size={48}
            percent={resume.score ?? undefined}
            format={() => resume.score ?? '-'}
            strokeColor={SCORE_COLOR(resume.score)}
            style={{ flexShrink: 0 }}
          />
        </div>
      </Card>
    )
  }

  const renderResumeListItem = (resume: ResumeRecord) => {
    const status = STATUS_MAP[resume.status || 'draft'] || STATUS_MAP.draft
    return (
      <Card key={resume.id} style={{ borderRadius: 12, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {selectMode && (
            <Checkbox checked={selectedIds.includes(resume.id)} onChange={() => toggleSelect(resume.id)} />
          )}
          <div style={{
            width: 40, height: 40, borderRadius: 8, flexShrink: 0,
            background: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563EB',
          }}>
            <FileTextOutlined />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Space>
              <Text strong ellipsis={{ tooltip: resume.title }} style={{ maxWidth: 320 }}>
                {resume.title || resume.id.slice(0, 8) + '...'}
              </Text>
              {resume.is_primary && <Tag color="gold" style={{ margin: 0 }}>默认</Tag>}
              <Tag style={{ color: status.color, background: status.bg, border: 'none', margin: 0 }}>{status.text}</Tag>
            </Space>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
              {[resume.target_position, resume.target_company].filter(Boolean).join(' @ ') || '未设置目标职位'}
              {' · '}{resume.file_type?.toUpperCase()}
              {' · '}{resume.updated_at || resume.created_at ? formatDate(resume.updated_at || resume.created_at) : ''}
            </div>
          </div>
          {typeof resume.match_rate === 'number' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#2563EB' }}>{resume.match_rate}%</div>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>匹配度</div>
            </div>
          )}
          <Progress type="circle" size={44} percent={resume.score ?? undefined} format={() => resume.score ?? '-'} strokeColor={SCORE_COLOR(resume.score)} />
          <Space>
            <Tooltip title="收藏">
              <Button
                type="text"
                icon={resume.is_favorite ? <StarFilled style={{ color: '#F59E0B' }} /> : <StarOutlined style={{ color: '#94A3B8' }} />}
                onClick={() => handleToggleFavorite(resume)}
              />
            </Tooltip>
            <Tooltip title="预览"><Button type="text" icon={<EyeOutlined />} onClick={() => handlePreview(resume)} /></Tooltip>
            <Tooltip title="设为默认"><Button type="text" icon={<CrownOutlined style={{ color: resume.is_primary ? '#F59E0B' : '#94A3B8' }} />} onClick={() => handleSetPrimary(resume.id)} disabled={resume.is_primary} /></Tooltip>
            <Popconfirm title="确定移入回收站？" onConfirm={() => handleDelete(resume.id)} okText="删除" cancelText="取消">
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        </div>
      </Card>
    )
  }

  return (
    <AppLayout
      activeKey="resumes"
      title="我的简历"
      subtitle={`共 ${stats.total} 份简历`}
      onSearch={handleSearch}
      searchable
    >
      <div className="app-page-enter">
        {/* 顶部操作栏 */}
        <div className="app-page-header">
          <div className="app-page-header-left">
            <h1>我的简历{stats.total > 0 && <span style={{ color: '#94A3B8', fontSize: 14, fontWeight: 400, marginLeft: 8 }}>共 {stats.total} 份</span>}</h1>
          </div>
          <Space>
            {selectMode && selectedIds.length > 0 && (
              <Popconfirm title={`确定删除选中的 ${selectedIds.length} 份简历？`} onConfirm={handleBatchDelete} okText="删除" cancelText="取消">
                <Button danger loading={batchDeleting}>批量删除（{selectedIds.length}）</Button>
              </Popconfirm>
            )}
            {list.length > 0 && <Button onClick={toggleSelectMode}>{selectMode ? '取消选择' : '批量管理'}</Button>}
            <input
              type="file" id="upload-resume" accept=".pdf,.docx,.png,.jpg,.jpeg"
              style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = '' }}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => document.getElementById('upload-resume')?.click()}>
              创建简历
            </Button>
          </Space>
        </div>

        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          {/* 左侧主内容 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* 筛选标签页 */}
            <div style={{ marginBottom: 12 }}>
              <Segmented
                options={tabs.map((t) => ({ label: t.label, value: t.key }))}
                value={activeTab}
                onChange={(v) => { setActiveTab(v as string); setPage(1) }}
              />
            </div>

            {/* 筛选控件行 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <Select
                value={typeFilter}
                onChange={setTypeFilter}
                style={{ width: 120 }}
                options={[
                  { value: 'all', label: '全部类型' },
                  { value: 'pdf', label: 'PDF' },
                  { value: 'docx', label: 'Word' },
                  { value: 'png', label: '图片' },
                ]}
              />
              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                style={{ width: 120 }}
                options={[
                  { value: 'all', label: '全部状态' },
                  { value: 'optimized', label: '已优化' },
                  { value: 'draft', label: '草稿' },
                  { value: 'unoptimized', label: '未优化' },
                ]}
              />
              <Select
                value={sortBy}
                onChange={setSortBy}
                style={{ width: 130 }}
                options={[
                  { value: 'update_desc', label: '最近修改' },
                  { value: 'update_asc', label: '最早修改' },
                  { value: 'score_desc', label: '评分最高' },
                ]}
              />
              <span style={{ flex: 1 }} />
              <Segmented
                value={viewMode}
                onChange={(v) => setViewMode(v as 'grid' | 'list')}
                options={[
                  { value: 'grid', icon: <AppstoreOutlined /> },
                  { value: 'list', icon: <BarsOutlined /> },
                ]}
              />
            </div>

            {/* 主体内容 */}
            {loading ? (
              <Spin tip="加载中..." style={{ display: 'block', textAlign: 'center', padding: 60 }} />
            ) : filteredList.length === 0 ? (
              <Empty description={activeTab === 'recycle' ? '回收站是空的' : searchKeyword ? '未找到匹配的简历' : '还没有简历，请上传或创建你的第一份简历'}>
                {activeTab !== 'recycle' && !searchKeyword && (
                  <input type="file" id="upload-resume-empty" accept=".pdf,.docx,.png,.jpg,.jpeg" style={{ display: 'none' }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = '' }} />
                )}
                {activeTab !== 'recycle' && !searchKeyword && (
                  <Button type="primary" onClick={() => document.getElementById('upload-resume-empty')?.click()}>
                    <PlusOutlined /> 上传简历
                  </Button>
                )}
              </Empty>
            ) : viewMode === 'grid' ? (
              <>
                {selectMode && (
                  <div style={{ marginBottom: 12 }}>
                    <Button size="small" onClick={toggleSelectAll}>
                      {selectedIds.length === filteredList.length && filteredList.length > 0 ? '取消全选' : '全选'}
                    </Button>
                    <span style={{ marginLeft: 8, color: '#94A3B8', fontSize: 13 }}>已选 {selectedIds.length} / {filteredList.length}</span>
                  </div>
                )}
                <Row gutter={[16, 16]}>
                  {paginatedList.map((resume) => (
                    <Col xs={24} sm={12} md={8} key={resume.id}>
                      {renderResumeCard(resume)}
                    </Col>
                  ))}
                  {/* 上传占位卡 */}
                  {activeTab === 'all' && list.length < 10 && (
                    <Col xs={24} sm={12} md={8}>
                      <Card
                        style={{ borderRadius: 12, height: '100%', borderStyle: 'dashed', cursor: 'pointer' }}
                        onClick={() => document.getElementById('upload-resume')?.click()}
                        styles={{ body: { height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 220 } }}
                      >
                        <PlusOutlined style={{ fontSize: 32, color: '#94A3B8', marginBottom: 12 }} />
                        <Text strong>上传或新建简历</Text>
                        <Text type="secondary" style={{ marginTop: 4, fontSize: 12 }}>支持 PDF / DOCX / 图片 格式</Text>
                      </Card>
                    </Col>
                  )}
                </Row>
              </>
            ) : (
              <>
                {selectMode && (
                  <div style={{ marginBottom: 12 }}>
                    <Button size="small" onClick={toggleSelectAll}>
                      {selectedIds.length === filteredList.length && filteredList.length > 0 ? '取消全选' : '全选'}
                    </Button>
                    <span style={{ marginLeft: 8, color: '#94A3B8', fontSize: 13 }}>已选 {selectedIds.length} / {filteredList.length}</span>
                  </div>
                )}
                {paginatedList.map(renderResumeListItem)}
              </>
            )}

            {/* 分页 */}
            {filteredList.length > pageSize && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 16 }}>
                <span style={{ color: '#94A3B8', fontSize: 13 }}>每页</span>
                <Select
                  size="small"
                  value={pageSize}
                  onChange={(v) => { setPageSize(v); setPage(1) }}
                  style={{ width: 70 }}
                  options={[6, 12, 20].map((n) => ({ value: n, label: `${n} 条` }))}
                />
                <Pagination
                  current={page}
                  pageSize={pageSize}
                  total={filteredList.length}
                  onChange={setPage}
                  showSizeChanger={false}
                  size="small"
                />
              </div>
            )}
          </div>

          {/* 右侧面板 */}
          <div style={{ width: 280, flexShrink: 0 }}>
            {/* 简历概览环形图 */}
            <Card style={{ borderRadius: 12, marginBottom: 16 }} styles={{ body: { padding: 20 } }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Text strong>简历概览</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>本月</Text>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div style={{ position: 'relative', width: 150, height: 150, borderRadius: '50%', background: donutBackground }}>
                  <div style={{
                    position: 'absolute', inset: 22, background: '#fff', borderRadius: '50%',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <div style={{ fontSize: 32, fontWeight: 700, color: '#1E293B', lineHeight: 1 }}>{stats.total}</div>
                    <div style={{ fontSize: 12, color: '#94A3B8' }}>份简历</div>
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#64748B' }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#10B981', marginRight: 6 }} />已优化</span>
                  <strong>{stats.optimized}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#64748B' }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#3B82F6', marginRight: 6 }} />草稿</span>
                  <strong>{stats.draft}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#64748B' }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#E2E8F0', marginRight: 6 }} />未优化</span>
                  <strong>{stats.unoptimized}</strong>
                </div>
              </div>
            </Card>

            {/* 使用建议 */}
            <Card style={{ borderRadius: 12, marginBottom: 16 }} styles={{ body: { padding: 20 } }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text strong>简历使用建议</Text>
                <a style={{ fontSize: 12 }}>查看全部</a>
              </div>
              {SUGGESTIONS.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 0', borderTop: i > 0 ? '1px solid #F1F5F9' : 'none' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {s.icon}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#1E293B' }}>{s.title}</div>
                    <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>{s.desc}</div>
                  </div>
                </div>
              ))}
            </Card>

            {/* 快捷操作 */}
            <Card style={{ borderRadius: 12 }} styles={{ body: { padding: 20 } }}>
              <Text strong style={{ display: 'block', marginBottom: 12 }}>快捷操作</Text>
              <Row gutter={[12, 12]}>
                <Col span={12}>
                  <div
                    style={{ borderRadius: 12, padding: 16, background: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)', cursor: 'pointer', textAlign: 'center' }}
                    onClick={() => router.push('/')}
                  >
                    <ThunderboltOutlined style={{ fontSize: 20, color: '#2563EB' }} />
                    <div style={{ fontSize: 13, marginTop: 6, color: '#1E293B' }}>AI 优化</div>
                  </div>
                </Col>
                <Col span={12}>
                  <div
                    style={{ borderRadius: 12, padding: 16, background: 'linear-gradient(135deg, #F0FDF4, #DCFCE7)', cursor: 'pointer', textAlign: 'center' }}
                    onClick={() => router.push('/dashboard')}
                  >
                    <TrophyOutlined style={{ fontSize: 20, color: '#10B981' }} />
                    <div style={{ fontSize: 13, marginTop: 6, color: '#1E293B' }}>简历评分</div>
                  </div>
                </Col>
                <Col span={12}>
                  <div
                    style={{ borderRadius: 12, padding: 16, background: 'linear-gradient(135deg, #FFF7ED, #FFEDD5)', cursor: 'pointer', textAlign: 'center' }}
                    onClick={() => router.push('/dashboard')}
                  >
                    <FireOutlined style={{ fontSize: 20, color: '#F59E0B' }} />
                    <div style={{ fontSize: 13, marginTop: 6, color: '#1E293B' }}>批量优化</div>
                  </div>
                </Col>
                <Col span={12}>
                  <div
                    style={{ borderRadius: 12, padding: 16, background: 'linear-gradient(135deg, #F5F3FF, #EDE9FE)', cursor: 'pointer', textAlign: 'center' }}
                    onClick={() => router.push('/')}
                  >
                    <FileTextOutlined style={{ fontSize: 20, color: '#7C3AED' }} />
                    <div style={{ fontSize: 13, marginTop: 6, color: '#1E293B' }}>模板库</div>
                  </div>
                </Col>
              </Row>
            </Card>
          </div>
        </div>

        {/* 创建副本弹窗 */}
        <Modal title="创建简历副本" open={createModalOpen} onOk={handleCreate} onCancel={() => { setCreateModalOpen(false); setCopySourceId(null) }} okText="创建" cancelText="取消">
          <div style={{ marginBottom: 12 }}><Text type="secondary">新简历名称（留空则自动命名）</Text></div>
          <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="例如: 前端开发专用版" maxLength={50} />
        </Modal>

        {/* 重命名弹窗 */}
        <Modal title="重命名简历" open={editModalOpen} onOk={handleSaveEdit} onCancel={() => { setEditModalOpen(false); setEditId(null) }} okText="保存" cancelText="取消">
          <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="输入简历名称" maxLength={50} />
        </Modal>

        {/* 预览弹窗（保留原逻辑） */}
        <Modal
          title={previewResume?.title || '简历预览'}
          open={previewModalOpen}
          onCancel={() => { setPreviewModalOpen(false); setPreviewResume(null) }}
          footer={null}
          width={900}
          style={{ top: 20 }}
        >
          {previewResume && previewResume.file_type === 'pdf' ? (
            <iframe src={toBackendUrl(previewResume.original_file_url)} style={{ width: '100%', height: '75vh', border: 'none', borderRadius: 8 }} title="PDF 预览" />
          ) : previewResume && previewResume.file_type === 'docx' ? (
            <div style={{ padding: 16 }}>
              <Alert type="info" message="Word 文档无法直接在浏览器中预览，以下是解析后的内容" showIcon style={{ marginBottom: 16 }} />
              {previewResume.parsed_json ? (
                <div>
                  <Descriptions size="small" column={1} bordered>
                    <Descriptions.Item label="姓名">{previewResume.parsed_json.personal_info?.name || '-'}</Descriptions.Item>
                    <Descriptions.Item label="邮箱">{previewResume.parsed_json.personal_info?.email || '-'}</Descriptions.Item>
                    <Descriptions.Item label="电话">{previewResume.parsed_json.personal_info?.phone || '-'}</Descriptions.Item>
                  </Descriptions>
                  <Divider />
                  <Title level={5}>个人总结</Title>
                  <Typography.Paragraph>{previewResume.parsed_json.summary || '-'}</Typography.Paragraph>
                  <Divider />
                  <Title level={5}>工作经历</Title>
                  {(previewResume.parsed_json.experience || []).map((exp, i) => (
                    <Card size="small" key={i} style={{ marginBottom: 8 }}>
                      <Text strong>{exp.title} @ {exp.company}</Text>
                      <div style={{ color: '#94A3B8', fontSize: 12 }}>{exp.start} - {exp.end}</div>
                      <ul style={{ paddingLeft: 20, marginTop: 4 }}>
                        {(exp.points || []).map((p, j) => <li key={j} style={{ fontSize: 13 }}>{p}</li>)}
                      </ul>
                    </Card>
                  ))}
                  <Divider />
                  <Title level={5}>技能</Title>
                  <Space wrap>{(previewResume.parsed_json.skills || []).map((s) => <Tag key={s} style={{ color: '#475569', background: '#F1F5F9', border: 'none' }}>{s}</Tag>)}</Space>
                </div>
              ) : <Empty description="暂无解析内容" />}
            </div>
          ) : previewResume ? (
            <div style={{ padding: 16 }}>
              <Alert type="info" message={`${previewResume.file_type.toUpperCase()} 格式不支持在线预览`} showIcon />
              {previewResume.parsed_json && (
                <div style={{ marginTop: 16 }}>
                  <Title level={5}>解析后的内容</Title>
                  <pre style={{ whiteSpace: 'pre-wrap', background: '#F1F5F9', padding: 12, borderRadius: 8 }}>
                    {JSON.stringify(previewResume.parsed_json, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ) : null}
        </Modal>
      </div>
    </AppLayout>
  )
}