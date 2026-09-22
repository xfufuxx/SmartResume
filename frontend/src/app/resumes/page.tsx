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
  FileTextOutlined, BulbOutlined, ClockCircleOutlined, DownloadOutlined, RollbackOutlined,
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

// 回收站保留期（与后端 TRASH_RETENTION_DAYS 保持一致），到期自动彻底清除
const TRASH_RETENTION_DAYS = 7
const trashDaysLeft = (deletedAt?: string | null) => {
  if (!deletedAt) return TRASH_RETENTION_DAYS
  const ms = new Date(deletedAt).getTime() + TRASH_RETENTION_DAYS * 86400000 - Date.now()
  return Math.max(0, Math.ceil(ms / 86400000))
}

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
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  // 回收站
  const [trashList, setTrashList] = useState<ResumeRecord[]>([])
  const [trashLoading, setTrashLoading] = useState(false)

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

  // 切到回收站 Tab 时加载软删除列表
  const loadTrash = useCallback(async () => {
    setTrashLoading(true)
    try {
      const res = await resumes.trash()
      setTrashList(res.data || [])
    } catch {
      message.error('加载回收站失败')
    } finally {
      setTrashLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!token) return
    if (activeTab === 'recycle') loadTrash()
  }, [token, activeTab, loadTrash])

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
      // 回收站：展示软删除列表（后端 GET /api/resumes/trash）
      result = [...trashList]
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
  }, [list, trashList, activeTab, searchKeyword, typeFilter, statusFilter, sortBy])

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

  const handleRestore = useCallback(async (id: string) => {
    try {
      await resumes.restore(id)
      setTrashList((prev) => prev.filter((r) => r.id !== id))
      message.success('简历已恢复')
      loadList()
      loadStats()
    } catch {
      message.error('恢复失败')
    }
  }, [loadList, loadStats])

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

  const handlePreview = useCallback(async (resume: ResumeRecord) => {
    const url = toBackendUrl(resume.original_file_url)
    const type = (resume.file_type || '').toLowerCase()
    // 浏览器无法直接渲染 Word，展示解析内容
    if (type === 'docx' || !url) {
      setPreviewResume(resume)
      setPreviewModalOpen(true)
      return
    }
    // PDF / 图片：页面内弹窗展示。fetch blob 后用 <embed>/<img> 内嵌渲染，
    // 不做文件导航——避免被浏览器「下载 PDF 而非打开」设置处理成自动下载
    setPreviewResume(resume)
    setPreviewBlobUrl(null)
    setPreviewModalOpen(true)
    setPreviewLoading(true)
    try {
      const resp = await fetch(url)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      setPreviewBlobUrl(URL.createObjectURL(await resp.blob()))
    } catch {
      message.error('文件加载失败，链接可能已过期，请刷新页面后重试')
      setPreviewModalOpen(false)
      setPreviewResume(null)
    } finally {
      setPreviewLoading(false)
    }
  }, [])

  const closePreview = useCallback(() => {
    setPreviewModalOpen(false)
    setPreviewResume(null)
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl)
      setPreviewBlobUrl(null)
    }
  }, [previewBlobUrl])

  const handleDownload = useCallback(async (resume: ResumeRecord) => {
    const url = toBackendUrl(resume.original_file_url)
    if (!url) {
      message.warning('该简历没有可下载的原始文件')
      return
    }
    setDownloadingId(resume.id)
    try {
      // 直接下载签名 URL 的内容并以简历标题命名（跨域直链的 download 属性无效，故走 blob）
      const resp = await fetch(url)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const blob = await resp.blob()
      const ext = (resume.file_type || 'pdf').toLowerCase()
      const safeName = (resume.title || '简历').replace(/[\\/:*?"<>|]/g, '_')
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = `${safeName}.${ext}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(blobUrl)
      message.success('简历已开始下载')
    } catch {
      message.error('下载失败，链接可能已过期，请刷新页面后重试')
    } finally {
      setDownloadingId(null)
    }
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
    const isTrash = activeTab === 'recycle'
    const actions = isTrash
      ? [
          <Tooltip title="预览" key="preview">
            <Button type="text" icon={<EyeOutlined />} onClick={() => handlePreview(resume)} />
          </Tooltip>,
          <Tooltip title="下载" key="download">
            <Button type="text" icon={<DownloadOutlined spin={downloadingId === resume.id} />} onClick={() => handleDownload(resume)} />
          </Tooltip>,
          <Tooltip title="恢复到我的简历" key="restore">
            <Button type="text" icon={<RollbackOutlined />} onClick={() => handleRestore(resume.id)} />
          </Tooltip>,
        ]
      : [
          <Tooltip title="预览" key="preview">
            <Button type="text" icon={<EyeOutlined />} onClick={() => handlePreview(resume)} />
          </Tooltip>,
          <Tooltip title="下载" key="download">
            <Button type="text" icon={<DownloadOutlined spin={downloadingId === resume.id} />} onClick={() => handleDownload(resume)} />
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
        ]
    return (
      <Card
        hoverable
        className="resume-card"
        key={resume.id}
        style={{ borderRadius: 12, overflow: 'hidden', position: 'relative', height: '100%' }}
        actions={actions}
      >
        {selectMode && !isTrash && (
          <Checkbox
            checked={selectedIds.includes(resume.id)}
            onChange={() => toggleSelect(resume.id)}
            style={{ position: 'absolute', top: 12, left: 12, zIndex: 2 }}
          />
        )}

        <div style={{ display: 'flex', gap: 14, alignItems: 'stretch', flexWrap: 'wrap', rowGap: 10 }}>
          {/* 缩略图 / 图标占位 */}
          <div style={{
            width: 60, height: 76, borderRadius: 10, flexShrink: 0, alignSelf: 'center',
            background: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#2563EB', fontSize: 24,
          }}>
            <FileTextOutlined />
          </div>

          <div style={{ flex: 1, minWidth: 160, alignSelf: 'center' }}>
            <Text strong ellipsis={{ tooltip: resume.title }} style={{ fontSize: 15, display: 'block', paddingRight: 4 }}>
              {resume.title || resume.id.slice(0, 8) + '...'}
              {resume.version && resume.version > 1 ? ` v${resume.version}` : ''}
            </Text>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {targetText}
            </div>
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Tag style={{ color: status.color, background: status.bg, border: 'none', margin: 0, borderRadius: 6 }}>{status.text}</Tag>
              {resume.is_primary && !isTrash && <Tag color="gold" style={{ margin: 0, borderRadius: 6 }}>默认</Tag>}
              {isTrash && (
                <Tooltip title={`保留期剩余 ${trashDaysLeft(resume.deleted_at)} 天，到期将自动彻底清除`}>
                  <Tag color="warning" style={{ margin: 0, borderRadius: 6 }}>
                    {trashDaysLeft(resume.deleted_at)} 天后清除
                  </Tag>
                </Tooltip>
              )}
            </div>
            <div style={{ marginTop: 9, fontSize: 12, color: '#94A3B8', display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap', overflow: 'hidden' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                <ClockCircleOutlined /> {resume.updated_at || resume.created_at ? formatDate(resume.updated_at || resume.created_at) : '-'}
              </span>
              {typeof resume.match_rate === 'number' && (
                <span style={{ color: '#2563EB', whiteSpace: 'nowrap', flexShrink: 0 }}>匹配度 {resume.match_rate}%</span>
              )}
            </div>
          </div>

          {/* 右侧：评分环 + 收藏/更多（文档流内排列，绝不重叠；卡片过窄时整块换行） */}
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <Progress
                type="circle"
                size={48}
                percent={resume.score ?? undefined}
                format={() => resume.score ?? '-'}
                strokeColor={SCORE_COLOR(resume.score)}
              />
              <span style={{ fontSize: 11, color: '#94A3B8' }}>评分</span>
            </div>
            <Divider type="vertical" style={{ height: 52, margin: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {isTrash ? (
                <Tooltip title="恢复到我的简历">
                  <Button type="text" size="small" icon={<RollbackOutlined style={{ color: '#10B981' }} />} onClick={() => handleRestore(resume.id)} />
                </Tooltip>
              ) : (
                <Button
                  type="text"
                  size="small"
                  icon={resume.is_favorite ? <StarFilled style={{ color: '#F59E0B' }} /> : <StarOutlined style={{ color: '#94A3B8' }} />}
                  onClick={() => handleToggleFavorite(resume)}
                />
              )}
              <Dropdown
                menu={{
                  items: isTrash
                    ? [
                        { key: 'preview', label: '预览', icon: <EyeOutlined />, onClick: () => handlePreview(resume) },
                        { key: 'download', label: '下载', icon: <DownloadOutlined />, onClick: () => handleDownload(resume) },
                        { key: 'restore', label: '恢复', icon: <RollbackOutlined />, onClick: () => handleRestore(resume.id) },
                      ]
                    : [
                        { key: 'preview', label: '预览', icon: <EyeOutlined />, onClick: () => handlePreview(resume) },
                        { key: 'download', label: '下载', icon: <DownloadOutlined />, onClick: () => handleDownload(resume) },
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
          </div>
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
              {activeTab === 'recycle' && ` · ${trashDaysLeft(resume.deleted_at)} 天后自动清除`}
            </div>
          </div>
          {typeof resume.match_rate === 'number' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#2563EB' }}>{resume.match_rate}%</div>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>匹配度</div>
            </div>
          )}
          <Progress type="circle" size={44} percent={resume.score ?? undefined} format={() => resume.score ?? '-'} strokeColor={SCORE_COLOR(resume.score)} />
          {activeTab === 'recycle' ? (
            <Space>
              <Tooltip title="预览"><Button type="text" icon={<EyeOutlined />} onClick={() => handlePreview(resume)} /></Tooltip>
              <Tooltip title="下载"><Button type="text" icon={<DownloadOutlined spin={downloadingId === resume.id} />} onClick={() => handleDownload(resume)} /></Tooltip>
              <Button icon={<RollbackOutlined />} onClick={() => handleRestore(resume.id)}>恢复</Button>
            </Space>
          ) : (
            <Space>
              <Tooltip title="收藏">
                <Button
                  type="text"
                  icon={resume.is_favorite ? <StarFilled style={{ color: '#F59E0B' }} /> : <StarOutlined style={{ color: '#94A3B8' }} />}
                  onClick={() => handleToggleFavorite(resume)}
                />
              </Tooltip>
              <Tooltip title="预览"><Button type="text" icon={<EyeOutlined />} onClick={() => handlePreview(resume)} /></Tooltip>
              <Tooltip title="下载"><Button type="text" icon={<DownloadOutlined spin={downloadingId === resume.id} />} onClick={() => handleDownload(resume)} /></Tooltip>
              <Tooltip title="设为默认"><Button type="text" icon={<CrownOutlined style={{ color: resume.is_primary ? '#F59E0B' : '#94A3B8' }} />} onClick={() => handleSetPrimary(resume.id)} disabled={resume.is_primary} /></Tooltip>
              <Popconfirm title="确定移入回收站？" onConfirm={() => handleDelete(resume.id)} okText="删除" cancelText="取消">
                <Button type="text" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </Space>
          )}
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
            {activeTab !== 'recycle' && list.length > 0 && <Button onClick={toggleSelectMode}>{selectMode ? '取消选择' : '批量管理'}</Button>}
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

        <div className="resume-layout" style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
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
            {(activeTab === 'recycle' ? trashLoading : loading) ? (
              <Spin size="large" style={{ display: 'block', textAlign: 'center', padding: 60 }} />
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
                    <Col xs={24} md={24} lg={12} xxl={8} key={resume.id}>
                      {renderResumeCard(resume)}
                    </Col>
                  ))}
                  {/* 上传占位卡 */}
                  {activeTab === 'all' && list.length < 10 && (
                    <Col xs={24} md={24} lg={12} xxl={8}>
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
          <div className="resume-side" style={{ width: 280, flexShrink: 0 }}>
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

        {/* 预览弹窗：PDF/图片 fetch blob 后页面内渲染（不触发下载），docx 展示解析内容 */}
        <Modal
          title={previewResume?.title || '简历预览'}
          open={previewModalOpen}
          onCancel={closePreview}
          footer={
            previewResume ? (
              <Button
                icon={<DownloadOutlined />}
                loading={downloadingId === previewResume.id}
                onClick={() => handleDownload(previewResume)}
              >
                下载原文件
              </Button>
            ) : null
          }
          width={900}
          style={{ top: 20 }}
        >
          {previewResume && ['pdf', 'png', 'jpg', 'jpeg', 'webp'].includes((previewResume.file_type || '').toLowerCase()) ? (
            <div style={{ minHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {previewLoading ? (
                <Spin size="large" />
              ) : previewBlobUrl && (previewResume.file_type || '').toLowerCase() === 'pdf' ? (
                <embed
                  src={previewBlobUrl}
                  type="application/pdf"
                  style={{ width: '100%', height: '75vh', border: 'none', borderRadius: 8 }}
                />
              ) : previewBlobUrl ? (
                <img src={previewBlobUrl} alt="简历预览" style={{ maxWidth: '100%', borderRadius: 8 }} />
              ) : null}
            </div>
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