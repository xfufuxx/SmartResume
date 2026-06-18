'use client'

import React, { useEffect, useState, useCallback } from 'react'
import {
  Layout, Button, Card, Typography, Spin, Row, Col, message,
  Tag, Space, Divider, Modal, Input, Empty, Tooltip, Popconfirm, Alert, Descriptions, Checkbox,
} from 'antd'
import {
  LogoutOutlined, HistoryOutlined, HomeOutlined,
  FileTextOutlined, PlusOutlined, CrownOutlined,
  CopyOutlined, DeleteOutlined, EditOutlined,
  DashboardOutlined, EyeOutlined, BankOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import { resumes, scoring, jobs, toBackendUrl } from '@/lib/api'
import { getToken, clearAuth } from '@/lib/auth'
import { formatDate } from '@/lib/utils'
import type { ResumeRecord, ResumeScore } from '@/types'

const { Header, Content } = Layout

export default function ResumeLibrary() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [list, setList] = useState<ResumeRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [scores, setScores] = useState<Record<string, ResumeScore | null>>({})
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [copySourceId, setCopySourceId] = useState<string | null>(null)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  const [previewResume, setPreviewResume] = useState<ResumeRecord | null>(null)
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
    router.prefetch('/history')
    router.prefetch('/')
  }, [router])

  useEffect(() => {
    if (!token) return
    loadList()
  }, [token])

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await resumes.list()
      setList(res.data)
    } catch {
      message.error('加载简历列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadScore = useCallback(async (resumeId: string) => {
    try {
      const res = await scoring.getScore(resumeId)
      setScores((prev) => ({ ...prev, [resumeId]: res.data }))
    } catch {
      setScores((prev) => ({ ...prev, [resumeId]: null }))
    }
  }, [])

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
      message.success('已删除')
    } catch {
      message.error('删除失败')
    }
  }, [])

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
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '创建失败')
    }
  }, [copySourceId, newTitle, loadList])

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
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '上传失败')
    }
  }, [loadList])

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
    if (selectedIds.length === list.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(list.map((r) => r.id))
    }
  }, [list, selectedIds])

  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.length === 0) return
    setBatchDeleting(true)
    try {
      const res = await resumes.batchDelete(selectedIds)
      message.success(res.data?.detail || `已删除 ${selectedIds.length} 份简历`)
      setSelectedIds([])
      setSelectMode(false)
      loadList()
    } catch {
      message.error('批量删除失败')
    } finally {
      setBatchDeleting(false)
    }
  }, [selectedIds, loadList])

  if (!token) return null

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingInline: 24 }}>
        <Space>
          <Typography.Title level={4} style={{ color: '#fff', margin: 0 }}>
            <FileTextOutlined /> 简历库
          </Typography.Title>
        </Space>
        <Space>
          <Button icon={<HomeOutlined />} onClick={() => router.push('/')} type="text" style={{ color: '#fff' }}>
            首页
          </Button>
          <Button icon={<BankOutlined />} onClick={() => router.push('/jobs')} type="text" style={{ color: '#fff' }}>
            岗位库
          </Button>
          <Button icon={<DashboardOutlined />} onClick={() => router.push('/dashboard')} type="text" style={{ color: '#fff' }}>
            仪表盘
          </Button>
          <Button icon={<HistoryOutlined />} onClick={() => router.push('/history')} type="text" style={{ color: '#fff' }}>
            历史记录
          </Button>
          <Button icon={<LogoutOutlined />} onClick={() => { clearAuth(); router.push('/login') }} type="text" style={{ color: '#fff' }}>
            退出
          </Button>
        </Space>
      </Header>

      <Content style={{ padding: 24, maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <Typography.Title level={3} style={{ margin: 0 }}>我的简历（{list.length}/10）</Typography.Title>
          <Space>
            {selectMode && selectedIds.length > 0 && (
              <Popconfirm
                title={`确定删除选中的 ${selectedIds.length} 份简历？`}
                onConfirm={handleBatchDelete}
                okText="删除"
                cancelText="取消"
              >
                <Button danger loading={batchDeleting}>
                  批量删除（{selectedIds.length}）
                </Button>
              </Popconfirm>
            )}
            {list.length > 0 && (
              <Button onClick={toggleSelectMode}>
                {selectMode ? '取消选择' : '批量管理'}
              </Button>
            )}
            <input
            type="file"
            id="upload-resume"
            accept=".pdf,.docx,.png,.jpg,.jpeg"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleUpload(file)
              e.target.value = ''
            }}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => document.getElementById('upload-resume')?.click()}
            disabled={list.length >= 10}
          >
            上传新简历
          </Button>
          </Space>
        </div>

        {loading ? (
          <Spin tip="加载中..." style={{ display: 'block', textAlign: 'center', padding: 60 }} />
        ) : list.length === 0 ? (
          <Empty description="还没有简历，请上传你的第一份简历" image={Empty.PRESENTED_IMAGE_SIMPLE}>
            <input
              type="file"
              id="upload-resume-empty"
              accept=".pdf,.docx,.png,.jpg,.jpeg"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleUpload(file)
                e.target.value = ''
              }}
            />
            <Button type="primary" onClick={() => document.getElementById('upload-resume-empty')?.click()}>
              <PlusOutlined /> 上传简历
            </Button>
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
            {list.map((resume) => (
              <Col xs={24} sm={12} md={8} key={resume.id}>
                <div style={{ position: 'relative' }}>
                {selectMode && (
                  <Checkbox
                    checked={selectedIds.includes(resume.id)}
                    onChange={() => toggleSelect(resume.id)}
                    style={{ position: 'absolute', top: 8, left: 8, zIndex: 1 }}
                  />
                )}
                <Card
                  hoverable
                  style={{
                    borderColor: resume.is_primary ? '#2c6fbb' : undefined,
                    borderWidth: resume.is_primary ? 2 : 1,
                  }}
                  actions={[
                    <Tooltip title="预览" key="preview">
                      <Button
                        type="text"
                        icon={<EyeOutlined />}
                        onClick={() => handlePreview(resume)}
                      />
                    </Tooltip>,
                    <Tooltip title="设为默认" key="primary">
                      <Button
                        type="text"
                        icon={<CrownOutlined style={{ color: resume.is_primary ? '#faad14' : '#8c8c8c' }} />}
                        onClick={() => handleSetPrimary(resume.id)}
                        disabled={resume.is_primary}
                      />
                    </Tooltip>,
                    <Tooltip title="复制" key="copy">
                      <Button
                        type="text"
                        icon={<CopyOutlined />}
                        onClick={() => handleCopy(resume.id)}
                      />
                    </Tooltip>,
                    <Tooltip title="重命名" key="edit">
                      <Button
                        type="text"
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(resume.id, resume.title || '')}
                      />
                    </Tooltip>,
                    <Popconfirm
                      key="delete"
                      title="确定删除此简历？"
                      onConfirm={() => handleDelete(resume.id)}
                      okText="删除"
                      cancelText="取消"
                    >
                      <Tooltip title="删除">
                        <Button type="text" danger icon={<DeleteOutlined />} />
                      </Tooltip>
                    </Popconfirm>,
                  ]}
                >
                  <Card.Meta
                    title={
                      <Space>
                        {resume.title || resume.id.slice(0, 8) + '...'}
                        {resume.is_primary && <Tag color="gold">默认</Tag>}
                      </Space>
                    }
                    description={
                      <div>
                        <div style={{ marginBottom: 8 }}>
                          <Tag>{resume.file_type.toUpperCase()}</Tag>
                          <span style={{ fontSize: 12, color: '#999' }}>
                            {resume.created_at ? formatDate(resume.created_at) : ''}
                          </span>
                        </div>
                        {resume.parsed_json && (
                          <div style={{ fontSize: 12, color: '#666' }}>
                            <div>姓名: {resume.parsed_json.personal_info?.name || '-'}</div>
                            <div>技能: {(resume.parsed_json.skills || []).slice(0, 4).join(', ') || '-'}</div>
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

        {/* 创建副本弹窗 */}
        <Modal
          title="创建简历副本"
          open={createModalOpen}
          onOk={handleCreate}
          onCancel={() => { setCreateModalOpen(false); setCopySourceId(null) }}
          okText="创建"
          cancelText="取消"
        >
          <div style={{ marginBottom: 12 }}>
            <Typography.Text type="secondary">新简历名称（留空则自动命名）</Typography.Text>
          </div>
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="例如: 前端开发专用版"
            maxLength={50}
          />
        </Modal>

        {/* 重命名弹窗 */}
        <Modal
          title="重命名简历"
          open={editModalOpen}
          onOk={handleSaveEdit}
          onCancel={() => { setEditModalOpen(false); setEditId(null) }}
          okText="保存"
          cancelText="取消"
        >
          <Input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            placeholder="输入简历名称"
            maxLength={50}
          />
        </Modal>

        {/* 简历预览弹窗 */}
        <Modal
          title={previewResume?.title || '简历预览'}
          open={previewModalOpen}
          onCancel={() => { setPreviewModalOpen(false); setPreviewResume(null) }}
          footer={null}
          width={900}
          style={{ top: 20 }}
        >
          {previewResume && previewResume.file_type === 'pdf' ? (
            <iframe
              src={toBackendUrl(previewResume.original_file_url)}
              style={{ width: '100%', height: '75vh', border: 'none', borderRadius: 8 }}
              title="PDF 预览"
            />
          ) : previewResume && previewResume.file_type === 'docx' ? (
            <div style={{ padding: 16 }}>
              <Alert
                type="info"
                message="Word 文档无法直接在浏览器中预览，以下是解析后的内容"
                showIcon
                style={{ marginBottom: 16 }}
              />
              {previewResume.parsed_json ? (
                <div>
                  <Descriptions size="small" column={1} bordered>
                    <Descriptions.Item label="姓名">{previewResume.parsed_json.personal_info?.name || '-'}</Descriptions.Item>
                    <Descriptions.Item label="邮箱">{previewResume.parsed_json.personal_info?.email || '-'}</Descriptions.Item>
                    <Descriptions.Item label="电话">{previewResume.parsed_json.personal_info?.phone || '-'}</Descriptions.Item>
                  </Descriptions>
                  <Divider />
                  <Typography.Title level={5}>个人总结</Typography.Title>
                  <Typography.Paragraph>{previewResume.parsed_json.summary || '-'}</Typography.Paragraph>
                  <Divider />
                  <Typography.Title level={5}>工作经历</Typography.Title>
                  {(previewResume.parsed_json.experience || []).map((exp, i) => (
                    <Card size="small" key={i} style={{ marginBottom: 8 }}>
                      <Typography.Text strong>{exp.title} @ {exp.company}</Typography.Text>
                      <div style={{ color: '#999', fontSize: 12 }}>{exp.start} - {exp.end}</div>
                      <ul style={{ paddingLeft: 20, marginTop: 4 }}>
                        {(exp.points || []).map((p, j) => <li key={j} style={{ fontSize: 13 }}>{p}</li>)}
                      </ul>
                    </Card>
                  ))}
                  <Divider />
                  <Typography.Title level={5}>技能</Typography.Title>
                  <Space wrap>{(previewResume.parsed_json.skills || []).map((s) => <Tag key={s}>{s}</Tag>)}</Space>
                  {previewResume.parsed_json.education && previewResume.parsed_json.education.length > 0 && (
                    <>
                      <Divider />
                      <Typography.Title level={5}>教育背景</Typography.Title>
                      {previewResume.parsed_json.education.map((edu, i) => (
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
                </div>
              ) : (
                <Empty description="暂无解析内容" />
              )}
            </div>
          ) : previewResume ? (
            <div style={{ padding: 16 }}>
              <Alert
                type="info"
                message={`${previewResume.file_type.toUpperCase()} 格式不支持在线预览`}
                showIcon
              />
              {previewResume.parsed_json && (
                <div style={{ marginTop: 16 }}>
                  <Typography.Title level={5}>解析后的内容</Typography.Title>
                  <pre style={{ whiteSpace: 'pre-wrap', background: '#f6f8fa', padding: 12, borderRadius: 8 }}>
                    {JSON.stringify(previewResume.parsed_json, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ) : null}
        </Modal>
      </Content>
    </Layout>
  )
}