'use client'

import React, { useEffect, useState, useCallback } from 'react'
import {
  Layout, Button, Upload, Card, Typography, Spin, Row, Col, message,
  Descriptions, Tag, Divider, Space, Alert, Progress, List, Input,
  Modal, Empty,
} from 'antd'
import {
  UploadOutlined, FileTextOutlined, PictureOutlined,
  ThunderboltOutlined, DownloadOutlined, LogoutOutlined,
  HistoryOutlined, HomeOutlined, BulbOutlined,
  DashboardOutlined, UserOutlined, SettingOutlined, FolderOpenOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import { resumes, jobs, optimize, toBackendUrl } from '@/lib/api'
import { getToken, clearAuth } from '@/lib/auth'
import { formatDate } from '@/lib/utils'
import type { ResumeParseResult, JobParseResult, OptimizeResult, ResumeRecord } from '@/types'

const { Header, Content } = Layout

export default function Home() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)

  const [resumeId, setResumeId] = useState<string | null>(null)
  const [resumeData, setResumeData] = useState<ResumeParseResult | null>(null)
  const [resumeFileUrl, setResumeFileUrl] = useState<string | null>(null)
  const [resumeFileType, setResumeFileType] = useState<string | null>(null)
  const [resumeLoading, setResumeLoading] = useState(false)
  const [resumeSelectModalOpen, setResumeSelectModalOpen] = useState(false)
  const [resumeListLoading, setResumeListLoading] = useState(false)
  const [resumeList, setResumeList] = useState<ResumeRecord[]>([])

  const [jobId, setJobId] = useState<string | null>(null)
  const [jobData, setJobData] = useState<JobParseResult | null>(null)
  const [jobLoading, setJobLoading] = useState(false)

  const [optimizing, setOptimizing] = useState(false)
  const [customInstructions, setCustomInstructions] = useState('')
  const [result, setResult] = useState<OptimizeResult | null>(null)

  useEffect(() => {
    const t = getToken()
    if (!t) {
      router.push('/login')
      return
    }
    setToken(t)

    router.prefetch('/dashboard')
    router.prefetch('/resumes')
    router.prefetch('/history')
    router.prefetch('/profile')
  }, [router])

  const handleLogout = useCallback(() => {
    clearAuth()
    router.push('/login')
  }, [router])

  const handleResumeUpload = useCallback(async (file: File) => {
    setResumeLoading(true)
    try {
      const res = await resumes.upload(file)
      setResumeId(res.data.id)
      setResumeData(res.data.parsed_json)
      setResumeFileUrl(res.data.original_file_url || null)
      setResumeFileType(res.data.file_type || null)
      message.success({ content: '简历解析成功', key: 'resume-upload' })
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { detail?: string } }; message?: string }
      let msg = axiosErr?.response?.data?.detail || axiosErr?.message || '上传失败'
      if (!axiosErr?.response) {
        msg = '网络错误，无法连接到服务器。请确认后端已启动（http://localhost:8000）'
      } else if (axiosErr.response.status === 401) {
        msg = '登录已过期，请重新登录'
      } else if (axiosErr.response.status === 413) {
        msg = '文件过大，请选择 20MB 以内的文件'
      }
      message.error({ content: `简历解析失败: ${msg}`, key: 'resume-upload' })
    } finally {
      setResumeLoading(false)
    }
  }, [])

  const handleOpenResumeLibrary = useCallback(async () => {
    setResumeSelectModalOpen(true)
    setResumeListLoading(true)
    try {
      const res = await resumes.list()
      setResumeList(res.data || [])
    } catch {
      message.error('加载简历库失败')
      setResumeSelectModalOpen(false)
    } finally {
      setResumeListLoading(false)
    }
  }, [])

  const handleSelectResume = useCallback(async (record: ResumeRecord) => {
    setResumeSelectModalOpen(false)
    setResumeLoading(true)
    try {
      const res = await resumes.get(record.id)
      setResumeId(res.data.id)
      setResumeData(res.data.parsed_json)
      setResumeFileUrl(res.data.original_file_url || null)
      setResumeFileType(res.data.file_type || null)
      message.success({ content: `已选择简历：${res.data.title || '未命名'}`, key: 'resume-upload' })
    } catch {
      message.error('获取简历详情失败')
    } finally {
      setResumeLoading(false)
    }
  }, [])

  const handleJobUpload = useCallback(async (file: File) => {
    setJobLoading(true)
    try {
      const res = await jobs.upload(file)
      setJobId(res.data.id)
      setJobData(res.data.parsed_job_json)
      message.success({ content: '岗位需求解析成功', key: 'job-upload' })
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { detail?: string } }; message?: string }
      let msg = axiosErr?.response?.data?.detail || axiosErr?.message || '上传失败'
      if (!axiosErr?.response) {
        msg = '网络错误，无法连接到服务器。请确认后端已启动（http://localhost:8000）'
      } else if (axiosErr.response.status === 401) {
        msg = '登录已过期，请重新登录'
      } else if (axiosErr.response.status === 413) {
        msg = '文件过大，请选择 20MB 以内的文件'
      }
      message.error({ content: `岗位解析失败: ${msg}`, key: 'job-upload' })
    } finally {
      setJobLoading(false)
    }
  }, [])

  const handleOptimize = useCallback(async () => {
    if (!resumeId || !jobId) {
      message.warning('请先上传简历和岗位需求')
      return
    }
    setOptimizing(true)
    try {
      const res = await optimize.run(resumeId, jobId, customInstructions.trim() || undefined)
      setResult(res.data)
      message.success('简历优化完成')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '优化失败'
      message.error(`优化失败: ${msg}`)
    } finally {
      setOptimizing(false)
    }
  }, [resumeId, jobId, customInstructions])

  const handleDownload = useCallback(() => {
    if (result?.pdf_url) {
      window.open(toBackendUrl(result.pdf_url), '_blank')
    }
  }, [result])

  if (!token) return null

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingInline: 24 }}>
        <Space>
          <Typography.Title level={4} style={{ color: '#fff', margin: 0 }}>
            智能简历优化
          </Typography.Title>
        </Space>
        <Space>
          <Button
            icon={<DashboardOutlined />}
            onClick={() => router.push('/dashboard')}
            type="text"
            style={{ color: '#fff' }}
          >
            仪表盘
          </Button>
          <Button
            icon={<FileTextOutlined />}
            onClick={() => router.push('/resumes')}
            type="text"
            style={{ color: '#fff' }}
          >
            简历库
          </Button>
          <Button
            icon={<HistoryOutlined />}
            onClick={() => router.push('/history')}
            type="text"
            style={{ color: '#fff' }}
          >
            历史记录
          </Button>
          <Button
            icon={<UserOutlined />}
            onClick={() => router.push('/profile')}
            type="text"
            style={{ color: '#fff' }}
          >
            个人中心
          </Button>
          <Button
            icon={<HomeOutlined />}
            onClick={() => router.push('/')}
            type="text"
            style={{ color: '#fff' }}
          >
            首页
          </Button>
          <Button icon={<LogoutOutlined />} onClick={handleLogout} type="text" style={{ color: '#fff' }}>
            退出
          </Button>
        </Space>
      </Header>

      <Content style={{ padding: 24, maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        <Row gutter={[24, 24]}>
          <Col xs={24} md={12}>
            <Card title={<><FileTextOutlined /> 上传简历</>}>
              <Upload.Dragger
                accept=".pdf,.docx,.png,.jpg,.jpeg"
                beforeUpload={(file) => { handleResumeUpload(file); return false }}
                showUploadList={false}
                disabled={resumeLoading}
              >
                {resumeLoading ? (
                  <Spin tip="正在解析简历..." />
                ) : (
                  <>
                    <p className="ant-upload-drag-icon"><UploadOutlined /></p>
                    <p>拖拽或点击上传简历</p>
                    <p style={{ color: '#999' }}>支持 PDF / Word / 图片（最大 20MB）</p>
                  </>
                )}
              </Upload.Dragger>
              <div style={{ textAlign: 'center', marginTop: 12 }}>
                <Button
                  icon={<FolderOpenOutlined />}
                  onClick={handleOpenResumeLibrary}
                  disabled={resumeLoading}
                >
                  从简历库选择
                </Button>
              </div>
              {resumeData && (
                <div style={{ marginTop: 16 }}>
                  <Alert type="success" message="简历已解析" showIcon />
                  <Descriptions size="small" column={1} style={{ marginTop: 8 }}>
                    <Descriptions.Item label="姓名">{resumeData.personal_info?.name || '-'}</Descriptions.Item>
                    <Descriptions.Item label="邮箱">{resumeData.personal_info?.email || '-'}</Descriptions.Item>
                    <Descriptions.Item label="技能">{(resumeData.skills || []).slice(0, 6).join(', ') || '-'}</Descriptions.Item>
                    <Descriptions.Item label="工作经历">{(resumeData.experience || []).length} 段</Descriptions.Item>
                  </Descriptions>
                  {resumeFileUrl && resumeFileType === 'pdf' && (
                    <div style={{ marginTop: 12 }}>
                      <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>原始简历预览：</Typography.Text>
                      <iframe
                        src={toBackendUrl(resumeFileUrl)}
                        style={{ width: '100%', height: 400, border: '1px solid #d9d9d9', borderRadius: 8 }}
                        title="PDF 预览"
                      />
                    </div>
                  )}
                </div>
              )}
            </Card>
          </Col>

          <Col xs={24} md={12}>
            <Card title={<><PictureOutlined /> 上传岗位需求</>}>
              <Upload.Dragger
                accept=".png,.jpg,.jpeg,.webp"
                beforeUpload={(file) => { handleJobUpload(file); return false }}
                showUploadList={false}
                disabled={jobLoading}
              >
                {jobLoading ? (
                  <Spin tip="正在解析岗位需求..." />
                ) : (
                  <>
                    <p className="ant-upload-drag-icon"><UploadOutlined /></p>
                    <p>拖拽或点击上传岗位截图</p>
                    <p style={{ color: '#999' }}>支持 JPG / PNG / WebP（最大 20MB）</p>
                  </>
                )}
              </Upload.Dragger>
              {jobData && (
                <div style={{ marginTop: 16 }}>
                  <Alert type="success" message="岗位需求已解析" showIcon />
                  <Descriptions size="small" column={1} style={{ marginTop: 8 }}>
                    <Descriptions.Item label="职位">{jobData.title || '-'}</Descriptions.Item>
                    <Descriptions.Item label="公司">{jobData.company || '-'}</Descriptions.Item>
                    <Descriptions.Item label="薪资">{jobData.salary_range || '-'}</Descriptions.Item>
                    <Descriptions.Item label="地点">{jobData.location || '-'}</Descriptions.Item>
                  </Descriptions>
                  <div style={{ marginTop: 8 }}>
                    <Typography.Text strong>必备技能：</Typography.Text>
                    <Space wrap>
                      {(jobData.must_have?.skills || []).map((s) => <Tag color="blue" key={s}>{s}</Tag>)}
                    </Space>
                  </div>
                </div>
              )}
            </Card>
          </Col>
        </Row>

        <div style={{ textAlign: 'center', margin: '24px 0' }}>
          {resumeId && jobId && (
            <Card
              size="small"
              style={{ marginBottom: 16, textAlign: 'left', maxWidth: 600, marginLeft: 'auto', marginRight: 'auto' }}
              title={<><BulbOutlined /> 自定义优化提示（可选）</>}
            >
              <Input.TextArea
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder="例如：重点突出我的项目管理经验、用更量化的方式描述工作成果、强调我的英语能力..."
                autoSize={{ minRows: 2, maxRows: 4 }}
                maxLength={500}
                showCount
              />
            </Card>
          )}
          <Button
            type="primary"
            size="large"
            icon={<ThunderboltOutlined />}
            onClick={handleOptimize}
            loading={optimizing}
            disabled={!resumeId || !jobId}
            style={{ height: 48, paddingInline: 48 }}
          >
            优化我的简历
          </Button>
        </div>

        {optimizing && (
          <Card>
            <Spin tip="AI 正在优化简历...">
              <div style={{ padding: 40, textAlign: 'center' }}>
                <Progress type="circle" percent={100} status="active" />
                <p style={{ marginTop: 16, color: '#999' }}>正在分析匹配度、优化内容、生成 PDF...</p>
              </div>
            </Spin>
          </Card>
        )}

        {result && !optimizing && (
          <Card
            title="优化结果"
            extra={
              <Button type="link" onClick={() => router.push(`/history/${result.id}`)}>
                查看详情
              </Button>
            }
          >
            {result.match_analysis && (
              <Row gutter={[16, 16]}>
                <Col xs={24} sm={8}>
                  <Card size="small">
                    <Typography.Text type="secondary">匹配得分</Typography.Text>
                    <Progress
                      type="dashboard"
                      percent={result.match_analysis.match_score}
                      size={100}
                    />
                  </Card>
                </Col>
                <Col xs={24} sm={8}>
                  <Card size="small" title="优势">
                    <List size="small" dataSource={result.match_analysis.strengths} renderItem={(item) => <List.Item>{item}</List.Item>} />
                  </Card>
                </Col>
                <Col xs={24} sm={8}>
                  <Card size="small" title="差距">
                    <List size="small" dataSource={result.match_analysis.gaps} renderItem={(item) => <List.Item style={{ color: '#ff4d4f' }}>{item}</List.Item>} />
                  </Card>
                </Col>
              </Row>
            )}

            <Divider />

            <Typography.Title level={5}>修改说明</Typography.Title>
            <pre style={{ whiteSpace: 'pre-wrap', background: '#f6f8fa', padding: 12, borderRadius: 8 }}>
              {result.changes_description}
            </pre>

            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <Space>
                {result.pdf_url && (
                  <Button type="primary" icon={<DownloadOutlined />} size="large" onClick={handleDownload}>
                    下载优化后 PDF
                  </Button>
                )}
                {result.match_analysis && (
                  <Button size="large" onClick={() => router.push(`/history/${result.id}`)}>
                    查看详细对比
                  </Button>
                )}
              </Space>
            </div>
          </Card>
        )}
        {/* 简历库选择弹窗 */}
        <Modal
          title="从简历库选择"
          open={resumeSelectModalOpen}
          onCancel={() => setResumeSelectModalOpen(false)}
          footer={null}
          width={700}
        >
          <Spin spinning={resumeListLoading}>
            {resumeList.length === 0 ? (
              <Empty description="简历库为空，请先上传一份简历" />
            ) : (
              <List
                dataSource={resumeList}
                renderItem={(item) => (
                  <List.Item
                    actions={[
                      <Button
                        type="link"
                        size="small"
                        onClick={() => handleSelectResume(item)}
                      >
                        选择
                      </Button>,
                    ]}
                  >
                    <List.Item.Meta
                      title={item.title || '未命名简历'}
                      description={
                        <Space>
                          <Tag>{item.file_type?.toUpperCase() || 'Unknown'}</Tag>
                          {item.parsed_json?.personal_info?.name && (
                            <span>{item.parsed_json.personal_info.name}</span>
                          )}
                          {item.created_at && (
                            <span style={{ color: '#999', fontSize: 12 }}>
                              {formatDate(item.created_at)}
                            </span>
                          )}
                          {item.is_primary && <Tag color="green">默认</Tag>}
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </Spin>
        </Modal>
      </Content>
    </Layout>
  )
}