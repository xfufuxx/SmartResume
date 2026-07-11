'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
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
  BankOutlined, StarFilled, CodeOutlined, ToolOutlined, CrownOutlined,
  RocketOutlined, ExperimentOutlined, HighlightOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import { resumes, jobs, optimize, user, toBackendUrl } from '@/lib/api'
import { getToken, clearAuth } from '@/lib/auth'
import { formatDate } from '@/lib/utils'
import TemplateSelector from '@/components/TemplateSelector'
import type { TemplateOption } from '@/components/TemplateSelector'
import type { ResumeParseResult, JobParseResult, OptimizeResult, ResumeRecord } from '@/types'

const { Header, Content } = Layout

const TEMPLATE_OPTIONS: TemplateOption[] = [
  {
    key: 'professional', label: '专业分栏', icon: <FileTextOutlined />,
    preview: { primary: '#2c6fbb', secondary: '#1a5276', bg: '#fff', text: '#333', layout: 'dual', desc: '蓝色主题双栏布局，左侧联系信息右侧工作经历' },
  },
  {
    key: 'simple', label: '简约单栏', icon: <BulbOutlined />,
    preview: { primary: '#444', secondary: '#ddd', bg: '#fff', text: '#444', layout: 'single', desc: '极简单栏居中，浅灰色调，适合内容简洁的简历' },
  },
  {
    key: 'modern', label: '现代渐变', icon: <StarFilled />,
    preview: { primary: '#2c6fbb', secondary: '#3498db', bg: '#fff', text: '#333', layout: 'banner', desc: '蓝色渐变顶部横幅，左侧技能标签右侧工作经历' },
  },
  {
    key: 'compact', label: '紧凑高效', icon: <ThunderboltOutlined />,
    preview: { primary: '#111', secondary: '#333', bg: '#fff', text: '#333', layout: 'single', desc: '最大信息密度，时间线排版，适合内容丰富的简历' },
  },
  {
    key: 'elegant', label: '优雅金边', icon: <CrownOutlined />,
    preview: { primary: '#c9a962', secondary: '#2d2d2d', bg: '#fff', text: '#3a3a3a', layout: 'dual', desc: '深色侧边栏+金色点缀，高端商务风格' },
  },
  {
    key: 'dark', label: '深色科技', icon: <RocketOutlined />,
    preview: { primary: '#00d4ff', secondary: '#0d1117', bg: '#0d1117', text: '#e0e0e0', layout: 'dark', desc: '深色背景+霓虹蓝点缀，科技感十足，适合技术岗' },
  },
  {
    key: 'fresh', label: '清新绿意', icon: <ExperimentOutlined />,
    preview: { primary: '#2d6a4f', secondary: '#52b788', bg: '#fafcf8', text: '#3a5a40', layout: 'banner', desc: '绿色渐变顶部，自然清新风格，双栏布局' },
  },
  {
    key: 'classic', label: '经典黑白', icon: <HighlightOutlined />,
    preview: { primary: '#000', secondary: '#555', bg: '#fff', text: '#1a1a1a', layout: 'single', desc: '黑白极简，传统正式风格，粗线分隔，适合严肃场合' },
  },
  {
    key: 'latex', label: 'LaTeX 专业排版', icon: <CodeOutlined />,
    preview: { primary: '#2c3e50', secondary: '#2c6fbb', bg: '#fff', text: '#333', layout: 'dual', desc: '专业排版引擎，深蓝侧边栏，学术风格（需安装xelatex）' },
  },
  {
    key: 'preserve', label: '保留原样式', icon: <ToolOutlined />,
    preview: { primary: '#666', secondary: '#999', bg: '#fafafa', text: '#333', layout: 'single', desc: '在原PDF上替换文字，保留矢量图形/字体/照片（仅PDF）' },
  },
]

const POLL_INTERVAL = 2000     // 轮询间隔 2 秒
const POLL_TIMEOUT = 5 * 60 * 1000  // 最大轮询时间 5 分钟

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
  const [jobSelectModalOpen, setJobSelectModalOpen] = useState(false)
  const [jobListLoading, setJobListLoading] = useState(false)
  const [jobList, setJobList] = useState<Record<string, unknown>[]>([])

  const [optimizing, setOptimizing] = useState(false)
  const [optimizeProgress, setOptimizeProgress] = useState('')
  const [customInstructions, setCustomInstructions] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('professional')
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [result, setResult] = useState<OptimizeResult | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [savedTexts, setSavedTexts] = useState<{
    resumeText: string; jobText: string;
  }>({ resumeText: '', jobText: '' })

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

  // 加载「我的信息」中的简历文本和岗位文本
  useEffect(() => {
    const t = getToken()
    if (!t) return
    user.getProfile().then((res: any) => {
      const data = res.data || res
      const texts = data.saved_texts || {}
      if (texts.resume_text || texts.job_text) {
        setSavedTexts({
          resumeText: texts.resume_text || '',
          jobText: texts.job_text || '',
        })
      }
    }).catch((err) => {
      console.warn('[profile] 获取个人资料失败:', err?.response?.status, err?.message)
    })
  }, [])

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

  const handleOpenJobLibrary = useCallback(async () => {
    setJobSelectModalOpen(true)
    setJobListLoading(true)
    try {
      const res = await jobs.list()
      setJobList(res.data || [])
    } catch {
      message.error('加载岗位库失败')
      setJobSelectModalOpen(false)
    } finally {
      setJobListLoading(false)
    }
  }, [])

  const handleSelectJob = useCallback(async (record: Record<string, unknown>) => {
    setJobSelectModalOpen(false)
    setJobLoading(true)
    try {
      const res = await jobs.get(record.id as string)
      setJobId(res.data.id)
      setJobData(res.data.parsed_job_json)
      message.success({ content: `已选择岗位：${(record.title as string) || '未命名'}`, key: 'job-upload' })
    } catch {
      message.error('获取岗位详情失败')
    } finally {
      setJobLoading(false)
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

  const clearTimers = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const handleOptimize = useCallback(async () => {
    if (!resumeId || !jobId) {
      message.warning('请先上传简历和岗位需求')
      return
    }
    setOptimizing(true)
    setOptimizeProgress('正在提交优化任务...')
    setResult(null)

    // 清理之前的轮询
    clearTimers()

    try {
      // 使用异步模式提交任务
      const taskRes = await optimize.runAsync(resumeId, jobId, customInstructions.trim() || undefined, selectedTemplate)
      const taskId = taskRes.data.task_id as string

      // 超时定时器：5 分钟后自动停止轮询
      timeoutRef.current = setTimeout(() => {
        clearTimers()
        setOptimizing(false)
        setOptimizeProgress('')
        message.error('优化超时，请稍后重试')
      }, POLL_TIMEOUT)

      // 轮询任务状态
      pollingRef.current = setInterval(async () => {
        try {
          const statusRes = await optimize.getTaskStatus(taskId)
          const { status: taskStatus, progress, result: taskResult } = statusRes.data

          setOptimizeProgress(progress || '')

          if (taskStatus === 'completed' && taskResult) {
            // 任务完成
            clearTimers()
            setResult(taskResult as OptimizeResult)
            setOptimizing(false)
            message.success('简历优化完成')
          } else if (taskStatus === 'failed') {
            clearTimers()
            setOptimizing(false)
            setOptimizeProgress('')
            message.error(`优化失败: ${progress || '未知错误'}`)
          }
        } catch {
          // 轮询失败不中断，继续尝试
        }
      }, POLL_INTERVAL)
    } catch (err: unknown) {
      setOptimizing(false)
      setOptimizeProgress('')
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '提交优化任务失败'
      message.error(`优化失败: ${msg}`)
    }
  }, [resumeId, jobId, customInstructions, selectedTemplate, clearTimers])

  const handleQuickOptimize = useCallback(async () => {
    if (!savedTexts.resumeText.trim() || !savedTexts.jobText.trim()) {
      message.warning('请先在「个人中心」中填写简历信息和岗位信息')
      return
    }
    setOptimizing(true)
    setOptimizeProgress('正在提交优化任务...')
    setResult(null)
    clearTimers()

    try {
      const taskRes = await optimize.quick(
        savedTexts.resumeText,
        savedTexts.jobText,
        customInstructions.trim() || undefined,
        selectedTemplate
      )
      const taskId = taskRes.data.task_id as string

      timeoutRef.current = setTimeout(() => {
        clearTimers()
        setOptimizing(false)
        setOptimizeProgress('')
        message.error('优化超时，请稍后重试')
      }, POLL_TIMEOUT)

      pollingRef.current = setInterval(async () => {
        try {
          const statusRes = await optimize.getTaskStatus(taskId)
          const { status: taskStatus, progress, result: taskResult } = statusRes.data
          setOptimizeProgress(progress || '')
          if (taskStatus === 'completed' && taskResult) {
            clearTimers()
            setResult(taskResult as OptimizeResult)
            setOptimizing(false)
            message.success('简历优化完成')
          } else if (taskStatus === 'failed') {
            clearTimers()
            setOptimizing(false)
            setOptimizeProgress('')
            message.error(`优化失败: ${progress || '未知错误'}`)
          }
        } catch { /* ignore */ }
      }, POLL_INTERVAL)
    } catch (err: unknown) {
      setOptimizing(false)
      setOptimizeProgress('')
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '提交优化任务失败'
      message.error(`优化失败: ${msg}`)
    }
  }, [savedTexts, customInstructions, selectedTemplate, clearTimers])

  // 组件卸载时清理轮询
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

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
            icon={<BankOutlined />}
            onClick={() => router.push('/jobs')}
            type="text"
            style={{ color: '#fff' }}
          >
            岗位库
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
        {/* 一键优化：使用个人中心保存的简历/岗位文本 */}
        <Card
          size="small"
          title={<span><ThunderboltOutlined /> 我的信息 — 一键优化</span>}
          style={{ marginBottom: 16, borderColor: '#1677ff' }}
          extra={
            <Space size={8}>
              <Button
                size="small"
                icon={TEMPLATE_OPTIONS.find(o => o.key === selectedTemplate)?.icon || <FileTextOutlined />}
                onClick={() => setShowTemplateModal(true)}
              >
                {TEMPLATE_OPTIONS.find(o => o.key === selectedTemplate)?.label || '选择模板'}
              </Button>
              <Button
                type="primary"
                size="small"
                loading={optimizing}
                disabled={!savedTexts.resumeText.trim() || !savedTexts.jobText.trim()}
                onClick={() => handleQuickOptimize()}
              >
                优化我的简历
              </Button>
            </Space>
          }
        >
          {(!savedTexts.resumeText && !savedTexts.jobText) ? (
            <Alert
              type="info"
              showIcon
              message="尚未填写简历/岗位信息"
              description={
                <span>
                  请先前往
                  <Button type="link" size="small" onClick={() => router.push('/profile')} style={{ padding: '0 4px' }}>
                    个人中心
                  </Button>
                  填写「我的信息」中的简历文本和岗位文本，即可在此一键优化。
                </span>
              }
            />
          ) : (
            <Row gutter={16}>
                <Col span={12}>
                  <Typography.Text type="secondary">简历文本：</Typography.Text>
                  <Input.TextArea
                    value={savedTexts.resumeText}
                    onChange={(e) => setSavedTexts({ ...savedTexts, resumeText: e.target.value })}
                    placeholder="从个人中心同步的简历文本"
                    autoSize={{ minRows: 3, maxRows: 8 }}
                    style={{ marginTop: 4 }}
                  />
                </Col>
                <Col span={12}>
                  <Typography.Text type="secondary">岗位文本：</Typography.Text>
                  <Input.TextArea
                    value={savedTexts.jobText}
                    onChange={(e) => setSavedTexts({ ...savedTexts, jobText: e.target.value })}
                    placeholder="从个人中心同步的岗位文本"
                    autoSize={{ minRows: 3, maxRows: 8 }}
                    style={{ marginTop: 4 }}
                  />
                </Col>
              </Row>
          )}
        </Card>
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
              <div style={{ textAlign: 'center', marginTop: 12 }}>
                <Button
                  icon={<FolderOpenOutlined />}
                  onClick={handleOpenJobLibrary}
                  disabled={jobLoading}
                >
                  从岗位库选择
                </Button>
              </div>
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
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
            <Button
              size="large"
              icon={TEMPLATE_OPTIONS.find(o => o.key === selectedTemplate)?.icon || <FileTextOutlined />}
              onClick={() => setShowTemplateModal(true)}
            >
              {TEMPLATE_OPTIONS.find(o => o.key === selectedTemplate)?.label || '选择模板'}
            </Button>
            <Button
              type="primary"
              size="large"
              icon={<ThunderboltOutlined />}
              onClick={handleOptimize}
              loading={optimizing}
              disabled={!resumeId || !jobId}
            >
              优化我的简历
            </Button>
          </div>
        </div>

        {optimizing && (
          <Card>
            <Spin tip="AI 正在优化简历...">
              <div style={{ padding: 40, textAlign: 'center' }}>
                <Progress type="circle" percent={100} status="active" />
                <p style={{ marginTop: 16, color: '#999' }}>{optimizeProgress || '正在分析匹配度、优化内容、生成 PDF...'}</p>
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

        {/* 岗位库选择弹窗 */}
        <Modal
          title="从岗位库选择"
          open={jobSelectModalOpen}
          onCancel={() => setJobSelectModalOpen(false)}
          footer={null}
          width={700}
        >
          <Spin spinning={jobListLoading}>
            {jobList.length === 0 ? (
              <Empty description="岗位库为空，请先上传一份岗位" />
            ) : (
              <List
                dataSource={jobList}
                renderItem={(item: Record<string, unknown>) => {
                  const isPrimary = item.is_primary as boolean
                  const isFavorite = item.is_favorite as boolean
                  const company = item.company as string | null
                  const category = item.category as string | null
                  const createdAt = item.created_at as string | null
                  return (
                    <List.Item
                      actions={[
                        <Button
                          type="link"
                          size="small"
                          onClick={() => handleSelectJob(item)}
                        >
                          选择
                        </Button>,
                      ]}
                    >
                      <List.Item.Meta
                        title={
                          <Space>
                            {(item.title as string) || '未命名岗位'}
                            {isPrimary && <Tag color="gold">默认</Tag>}
                            {isFavorite && <StarFilled style={{ color: '#faad14', fontSize: 12 }} />}
                          </Space>
                        }
                        description={
                          <Space>
                            {company && <span><BankOutlined /> {company}</span>}
                            {category && <Tag color="blue">{category}</Tag>}
                            {createdAt && (
                              <span style={{ color: '#999', fontSize: 12 }}>
                                {formatDate(createdAt)}
                              </span>
                            )}
                          </Space>
                        }
                      />
                    </List.Item>
                  )
                }}
              />
            )}
          </Spin>
        </Modal>
      </Content>

      <TemplateSelector
        open={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        selected={selectedTemplate}
        onSelect={setSelectedTemplate}
        options={TEMPLATE_OPTIONS}
      />
    </Layout>
  )
}