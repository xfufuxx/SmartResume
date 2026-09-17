'use client'

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import {
  Button, Upload, Card, Typography, Spin, message,
  Tag, Space, List, Input, Modal, Empty, Switch, Select, Tooltip, Skeleton,
} from 'antd'
import {
  UploadOutlined, FileTextOutlined, PictureOutlined,
  ThunderboltOutlined, DownloadOutlined,
  BulbOutlined, StarFilled, CrownOutlined,
  RocketOutlined, ExperimentOutlined, HighlightOutlined,
  FolderOpenOutlined, CheckCircleFilled, SwapOutlined,
  AimOutlined, FormOutlined, StopOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import {
  resumes, jobs, optimize, user, toBackendUrl,
  analysis as analysisApi, render as renderApi,
} from '@/lib/api'
import { getToken } from '@/lib/auth'
import { useApiData } from '@/lib/useApi'
import { formatDate } from '@/lib/utils'
import AppLayout from '@/components/AppLayout'
import TemplateSelector from '@/components/TemplateSelector'
import type { TemplateOption } from '@/components/TemplateSelector'
import ResumePreview from '@/components/optimize/ResumePreview'
import MatchGauge, { levelMeta } from '@/components/optimize/MatchGauge'
import MetricStat from '@/components/optimize/MetricStat'
import OptimizeDiffModal from '@/components/optimize/OptimizeDiffModal'
import type {
  ResumeParseResult, JobParseResult, OptimizeResult, ResumeRecord, ResumeAnalysis,
} from '@/types'

const TEMPLATE_OPTIONS: TemplateOption[] = [
  { key: 'professional', label: '专业分栏', icon: <FileTextOutlined />, preview: { primary: '#2c6fbb', secondary: '#1a5276', bg: '#fff', text: '#333', layout: 'dual', desc: '蓝色主题双栏布局，左侧联系信息右侧工作经历' } },
  { key: 'simple', label: '简约单栏', icon: <BulbOutlined />, preview: { primary: '#444', secondary: '#ddd', bg: '#fff', text: '#444', layout: 'single', desc: '极简单栏居中，浅灰色调，适合内容简洁的简历' } },
  { key: 'modern', label: '现代渐变', icon: <StarFilled />, preview: { primary: '#2c6fbb', secondary: '#3498db', bg: '#fff', text: '#333', layout: 'banner', desc: '蓝色渐变顶部横幅，左侧技能标签右侧工作经历' } },
  { key: 'compact', label: '紧凑高效', icon: <ThunderboltOutlined />, preview: { primary: '#111', secondary: '#333', bg: '#fff', text: '#333', layout: 'single', desc: '最大信息密度，时间线排版，适合内容丰富的简历' } },
  { key: 'elegant', label: '优雅金边', icon: <CrownOutlined />, preview: { primary: '#c9a962', secondary: '#2d2d2d', bg: '#fff', text: '#3a3a3a', layout: 'dual', desc: '深色侧边栏+金色点缀，高端商务风格' } },
  { key: 'dark', label: '深色科技', icon: <RocketOutlined />, preview: { primary: '#00d4ff', secondary: '#0d1117', bg: '#0d1117', text: '#e0e0e0', layout: 'dark', desc: '深色背景+霓虹蓝点缀，科技感十足，适合技术岗' } },
  { key: 'fresh', label: '清新绿意', icon: <ExperimentOutlined />, preview: { primary: '#2d6a4f', secondary: '#52b788', bg: '#fafcf8', text: '#3a5a40', layout: 'banner', desc: '绿色渐变顶部，自然清新风格，双栏布局' } },
  { key: 'classic', label: '经典黑白', icon: <HighlightOutlined />, preview: { primary: '#000', secondary: '#555', bg: '#fff', text: '#1a1a1a', layout: 'single', desc: '黑白极简，传统正式风格，粗线分隔，适合严肃场合' } },
]

const POLL_INTERVAL = 2000
const POLL_TIMEOUT = 5 * 60 * 1000
/** 简历库单账号容量上限（与产品约定一致） */
const RESUME_LIBRARY_CAP = 200
/** 右侧面板最多展示的关键词芯片数量 */
const KEYWORD_PREVIEW = 6

// 剪贴板粘贴上传：MIME 类型 → 文件扩展名
const PASTE_MIME_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

type StepState = 'done' | 'active' | 'todo'

/** 运行时长展示：只反映「等了多久」，不伪装成进度百分比 */
function formatDuration(sec: number) {
  const s = Math.max(0, Math.floor(sec))
  if (s < 60) return `${s} 秒`
  const m = Math.floor(s / 60)
  const rest = s % 60
  return rest ? `${m} 分 ${rest} 秒` : `${m} 分`
}

export default function Home() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)

  // ── 简历 ──
  const [resumeId, setResumeId] = useState<string | null>(null)
  const [resumeData, setResumeData] = useState<ResumeParseResult | null>(null)
  const [resumeFileUrl, setResumeFileUrl] = useState<string | null>(null)
  const [resumeFileType, setResumeFileType] = useState<string | null>(null)
  const [resumeLoading, setResumeLoading] = useState(false)
  const [resumeSelectModalOpen, setResumeSelectModalOpen] = useState(false)
  const [resumeListLoading, setResumeListLoading] = useState(false)
  const [resumeList, setResumeList] = useState<ResumeRecord[]>([])
  const [resumeCount, setResumeCount] = useState<number>(0)

  // ── 岗位 ──
  const [jobId, setJobId] = useState<string | null>(null)
  const [jobData, setJobData] = useState<JobParseResult | null>(null)
  const [jobLoading, setJobLoading] = useState(false)
  const [jobSelectModalOpen, setJobSelectModalOpen] = useState(false)
  const [jobListLoading, setJobListLoading] = useState(false)
  const [jobList, setJobList] = useState<Record<string, unknown>[]>([])

  // ── 目标职位卡片 ──
  const [targetTitle, setTargetTitle] = useState('')
  const [useJobDesc, setUseJobDesc] = useState(true)
  const [useCustomKeywords, setUseCustomKeywords] = useState(false)
  const [customKeywords, setCustomKeywords] = useState<string[]>([])

  // ── 优化 ──
  const [optimizing, setOptimizing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState('professional')
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [result, setResult] = useState<OptimizeResult | null>(null)
  /** 前后对比弹窗：只在优化彻底完成后打开 */
  const [diffModalOpen, setDiffModalOpen] = useState(false)
  /** 本次运行已用时长（秒）：只反映「还在进行中」，不伪装成进度 */
  const [runningSeconds, setRunningSeconds] = useState(0)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 秒级计时器：驱动「已用时」文案 */
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  /** 本次运行开始时间戳：用真实时钟算已用时，避免定时器漂移累积误差 */
  const startedAtRef = useRef(0)
  /** 进行中的异步任务 id，供「停止优化」使用 */
  const taskIdRef = useRef<string | null>(null)
  /** 提交请求的中断控制器：停止时中断尚未返回的提交请求 */
  const abortRef = useRef<AbortController | null>(null)
  /** 本次运行是否已被用户停止：用于忽略迟到的响应与轮询结果 */
  const cancelledRef = useRef(false)
  /** 运行锁：同步置位，挡住双击 / 运行中再次发起造成的并发任务 */
  const runningRef = useRef(false)
  /** 运行前的结果快照：停止后恢复到可操作状态（不丢上次结果） */
  const prevResultRef = useRef<OptimizeResult | null>(null)

  const [savedTexts, setSavedTexts] = useState<{ resumeText: string; jobText: string }>({ resumeText: '', jobText: '' })

  // ── 分析（原始 / 优化后分别计算，用真实差值展示提升）──
  const [baseAnalysis, setBaseAnalysis] = useState<ResumeAnalysis | null>(null)
  const [optimizedAnalysis, setOptimizedAnalysis] = useState<ResumeAnalysis | null>(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [appliedSuggestions, setAppliedSuggestions] = useState<Record<string, boolean>>({})
  const [keywordModalOpen, setKeywordModalOpen] = useState(false)
  const [suggestionModalOpen, setSuggestionModalOpen] = useState(false)

  useEffect(() => {
    const t = getToken()
    if (!t) { router.push('/login'); return }
    setToken(t)
    router.prefetch('/dashboard')
    router.prefetch('/resumes')
    router.prefetch('/history')
    router.prefetch('/profile')
  }, [router])

  // 个人资料 / 简历库统计：客户端缓存 + 请求去重（SWR）。
  // 切回该面板先渲染上次数据（keepPreviousData）再后台刷新，重复访问零等待；
  // 并发用户下同类请求在 dedupingInterval 内自动合并，降低后端压力
  const { data: profileRes } = useApiData(token ? 'user:getProfile' : null, () => user.getProfile())
  const { data: statsRes } = useApiData(token ? 'resumes:stats' : null, () => resumes.stats())

  useEffect(() => {
    const data = (profileRes as any)?.data || (profileRes as any)
    const texts = data?.saved_texts || {}
    if (texts.resume_text || texts.job_text) {
      setSavedTexts({ resumeText: texts.resume_text || '', jobText: texts.job_text || '' })
    }
  }, [profileRes])

  useEffect(() => {
    if (statsRes == null) return
    const data = (statsRes as any)?.data || (statsRes as any)
    setResumeCount(Number(data?.total) || 0)
  }, [statsRes])

  // ══════════ 上传 / 选择 ══════════

  const handleResumeUpload = useCallback(async (file: File) => {
    setResumeLoading(true)
    try {
      const res = await resumes.upload(file)
      setResumeId(res.data.id)
      setResumeData(res.data.parsed_json)
      setResumeFileUrl(res.data.original_file_url || null)
      setResumeFileType(res.data.file_type || null)
      setResult(null)
      setAppliedSuggestions({})
      setResumeCount((c) => c + 1)
      message.success({ content: '简历解析成功', key: 'resume-upload' })
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { detail?: string } }; message?: string }
      let msg = axiosErr?.response?.data?.detail || axiosErr?.message || '上传失败'
      if (!axiosErr?.response) msg = '网络错误，无法连接到服务器。请确认后端已启动（http://localhost:8000）'
      else if (axiosErr.response.status === 401) msg = '登录已过期，请重新登录'
      else if (axiosErr.response.status === 413) msg = '文件过大，请选择 20MB 以内的文件'
      message.error({ content: `简历解析失败: ${msg}`, key: 'resume-upload' })
    } finally { setResumeLoading(false) }
  }, [])

  const handleOpenResumeLibrary = useCallback(async () => {
    setResumeSelectModalOpen(true); setResumeListLoading(true)
    try { const res = await resumes.list(); setResumeList(res.data || []) }
    catch { message.error('加载简历库失败'); setResumeSelectModalOpen(false) }
    finally { setResumeListLoading(false) }
  }, [])

  const handleSelectResume = useCallback(async (record: ResumeRecord) => {
    setResumeSelectModalOpen(false); setResumeLoading(true)
    try {
      const res = await resumes.get(record.id)
      setResumeId(res.data.id); setResumeData(res.data.parsed_json)
      setResumeFileUrl(res.data.original_file_url || null); setResumeFileType(res.data.file_type || null)
      setResult(null); setAppliedSuggestions({})
      message.success({ content: `已选择简历：${res.data.title || '未命名'}`, key: 'resume-upload' })
    } catch { message.error('获取简历详情失败') }
    finally { setResumeLoading(false) }
  }, [])

  const handleOpenJobLibrary = useCallback(async () => {
    setJobSelectModalOpen(true); setJobListLoading(true)
    try { const res = await jobs.list(); setJobList(res.data || []) }
    catch { message.error('加载岗位库失败'); setJobSelectModalOpen(false) }
    finally { setJobListLoading(false) }
  }, [])

  const handleSelectJob = useCallback(async (record: Record<string, unknown>) => {
    setJobSelectModalOpen(false); setJobLoading(true)
    try {
      const res = await jobs.get(record.id as string)
      setJobId(res.data.id); setJobData(res.data.parsed_job_json)
      if (res.data.parsed_job_json?.title) setTargetTitle(res.data.parsed_job_json.title)
      message.success({ content: `已选择岗位：${(record.title as string) || '未命名'}`, key: 'job-upload' })
    } catch { message.error('获取岗位详情失败') }
    finally { setJobLoading(false) }
  }, [])

  const handleJobUpload = useCallback(async (file: File) => {
    setJobLoading(true)
    try {
      const res = await jobs.upload(file)
      setJobId(res.data.id); setJobData(res.data.parsed_job_json)
      if (res.data.parsed_job_json?.title) setTargetTitle(res.data.parsed_job_json.title)
      message.success({ content: '岗位需求解析成功', key: 'job-upload' })
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { detail?: string } }; message?: string }
      let msg = axiosErr?.response?.data?.detail || axiosErr?.message || '上传失败'
      if (!axiosErr?.response) msg = '网络错误，无法连接到服务器。请确认后端已启动（http://localhost:8000）'
      else if (axiosErr.response.status === 401) msg = '登录已过期，请重新登录'
      else if (axiosErr.response.status === 413) msg = '文件过大，请选择 20MB 以内的文件'
      message.error({ content: `岗位解析失败: ${msg}`, key: 'job-upload' })
    } finally { setJobLoading(false) }
  }, [])

  // Ctrl+V 粘贴上传：从剪贴板读取图片/PDF 文件，路由到对应上传逻辑
  const handlePaste = useCallback((e: React.ClipboardEvent, kind: 'resume' | 'job') => {
    const items = e.clipboardData?.items
    if (!items || items.length === 0) return
    const allowed = kind === 'resume'
      ? ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg', 'image/webp']
      : ['image/png', 'image/jpeg', 'image/webp']
    if (kind === 'resume' && resumeLoading) return
    if (kind === 'job' && jobLoading) return
    let handled = false
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (it.kind !== 'file') continue
      const file = it.getAsFile()
      if (!file || !file.type) continue
      const ext = PASTE_MIME_EXT[file.type]
      if (!ext || !allowed.includes(file.type)) continue
      const name = file.name && file.name.includes('.') ? file.name : `pasted-${Date.now()}.${ext}`
      const renamed = new File([file], name, { type: file.type })
      if (kind === 'resume') handleResumeUpload(renamed)
      else handleJobUpload(renamed)
      handled = true
    }
    if (handled) e.preventDefault()
  }, [resumeLoading, jobLoading, handleResumeUpload, handleJobUpload])

  // ══════════ 分析 ══════════

  // 原始简历 + 目标岗位 → 匹配度 / 关键词 / ATS / 四维指标 / 建议
  useEffect(() => {
    if (!resumeData) { setBaseAnalysis(null); return }
    let cancelled = false
    setAnalysisLoading(true)
    analysisApi
      .resume(resumeData as unknown as Record<string, unknown>, (jobData as unknown as Record<string, unknown>) || null)
      .then((res) => { if (!cancelled) setBaseAnalysis(res.data as ResumeAnalysis) })
      .catch(() => { if (!cancelled) setBaseAnalysis(null) })
      .finally(() => { if (!cancelled) setAnalysisLoading(false) })
    return () => { cancelled = true }
  }, [resumeData, jobData])

  // 优化后简历 → 同口径再算一次，用于展示真实提升
  useEffect(() => {
    if (!result?.optimized_json) { setOptimizedAnalysis(null); return }
    let cancelled = false
    analysisApi
      .resume(result.optimized_json as unknown as Record<string, unknown>, (jobData as unknown as Record<string, unknown>) || null)
      .then((res) => { if (!cancelled) setOptimizedAnalysis(res.data as ResumeAnalysis) })
      .catch(() => { if (!cancelled) setOptimizedAnalysis(null) })
    return () => { cancelled = true }
  }, [result, jobData])

  /** 展示口径：有优化结果就看优化后，否则看原始简历 */
  const displayAnalysis = optimizedAnalysis || baseAnalysis
  const suggestions = useMemo(() => displayAnalysis?.suggestions || [], [displayAnalysis])

  const matchScore = result?.match_score ?? displayAnalysis?.match_rate ?? 0
  const matchLevel = levelMeta(matchScore)
  const matchDelta = optimizedAnalysis && baseAnalysis ? optimizedAnalysis.match_rate - baseAnalysis.match_rate : null

  /** 关键词芯片：优先用岗位技能标签，缺失/命中按分析结果着色 */
  const keywordChips = useMemo(() => {
    const tags = (displayAnalysis?.skill_tags?.length ? displayAnalysis.skill_tags : displayAnalysis?.job_keywords) || []
    const matched = new Set((displayAnalysis?.matched_keywords || []).map((k) => k.toLowerCase()))
    return tags.map((tag) => ({ tag, covered: matched.has(tag.toLowerCase()) }))
  }, [displayAnalysis])

  const coveredCount = keywordChips.filter((c) => c.covered).length

  // 目标职位自定义关键词默认带入岗位必备技能，方便直接微调
  useEffect(() => {
    if (!jobData) return
    const must = jobData.must_have?.skills || []
    if (must.length) setCustomKeywords((prev) => (prev.length ? prev : must))
  }, [jobData])

  // ══════════ 优化 ══════════

  /** 只清「轮询 + 超时」两个定时器；秒表由 beginRun 独立管理 */
  const clearPollTimers = useCallback(() => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
  }, [])

  const clearTimers = useCallback(() => {
    clearPollTimers()
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
  }, [clearPollTimers])

  /** 运行开始：起秒表。只用于展示已用时，不再伪造进度条 */
  const beginRun = useCallback(() => {
    cancelledRef.current = false
    runningRef.current = true
    startedAtRef.current = Date.now()
    setRunningSeconds(0)
    if (tickRef.current) clearInterval(tickRef.current)
    tickRef.current = setInterval(() => {
      setRunningSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000))
    }, 1000)
  }, [])

  /** 运行收尾：清所有定时器 + 复位运行态（成功 / 失败 / 停止 / 超时 统一走这里） */
  const finishRun = useCallback(() => {
    clearTimers()
    runningRef.current = false
    taskIdRef.current = null
    abortRef.current = null
    setOptimizing(false)
    setExporting(false)
    setRunningSeconds(0)
  }, [clearTimers])

  /** 并发闸门：已有任务在跑时不允许再发起（返回 true 表示已拦住） */
  const blockedByRunning = useCallback(() => {
    if (!runningRef.current) return false
    message.warning('已有任务正在进行，请先点击「停止优化」或等待完成')
    return true
  }, [])

  /** 轮询异步任务（AI 优化 / 直接渲染共用），completed 时回调结果 */
  const startTaskPolling = useCallback((taskId: string, onDone: (r: OptimizeResult) => void) => {
    // 注意：只清轮询/超时定时器。若这里调用 clearTimers()，会把 beginRun 起的秒表一起清掉，
    // 导致「已用时」永远停在 0 秒（真实浏览器验证时抓到过这个缺陷）。
    clearPollTimers()
    taskIdRef.current = taskId
    timeoutRef.current = setTimeout(() => {
      if (cancelledRef.current) return
      cancelledRef.current = true
      finishRun()
      optimize.cancelTask(taskId).catch(() => { /* 后端可能已自行结束，忽略 */ })
      message.error('优化超时（超过 5 分钟），已自动停止，请稍后重试')
    }, POLL_TIMEOUT)
    pollingRef.current = setInterval(async () => {
      // 用户已停止：不再消费任何轮询结果，避免迟到的响应把界面又推回运行态
      if (cancelledRef.current) return
      try {
        const statusRes = await optimize.getTaskStatus(taskId)
        if (cancelledRef.current) return
        // 注意：后端把阶段文案/失败原因都写在 progress 字段里（见 _update_status_impl）
        const { status: taskStatus, result: taskResult, progress: taskNote } = statusRes.data
        if (taskStatus === 'completed' && taskResult) {
          cancelledRef.current = true      // 置位后再收尾，防止同一 tick 内重复回调
          finishRun()
          onDone(taskResult as OptimizeResult)
        } else if (taskStatus === 'cancelled') {
          // 任务在后端被停掉（例如另一个标签页点的停止）：本地静默收尾即可
          cancelledRef.current = true
          finishRun()
        } else if (taskStatus === 'failed') {
          cancelledRef.current = true
          finishRun()
          message.error(`优化失败: ${taskNote || '未知错误'}`)
        }
      } catch (err: unknown) {
        // 任务记录被清理（404）或后端不可用：停止轮询，别让界面永远转下去
        const status = (err as { response?: { status?: number } })?.response?.status
        if (status === 404) {
          cancelledRef.current = true
          finishRun()
          message.error('任务已失效，请重新发起优化')
        }
        // 其余为单次网络抖动：忽略，等下一次轮询
      }
    }, POLL_INTERVAL)
  }, [clearPollTimers, finishRun])

  /** 组装本次优化要额外传达给 AI 的要求（已应用建议 + 自定义关键词 + 目标职位）*/
  const buildInstructions = useCallback((allApplied = false) => {
    const parts: string[] = []
    const active = suggestions.filter((s) => allApplied || appliedSuggestions[s.title])
    active.forEach((s) => parts.push(`${s.title}：${s.detail}`))
    if (useCustomKeywords && customKeywords.length) parts.push(`重点体现关键词：${customKeywords.join('、')}`)
    if (targetTitle.trim()) parts.push(`目标职位：${targetTitle.trim()}`)
    return parts.join('；')
  }, [suggestions, appliedSuggestions, useCustomKeywords, customKeywords, targetTitle])

  const runOptimize = useCallback(async (instructions?: string) => {
    if (!resumeId) { message.warning('请先上传简历'); return }
    if (!jobId) { message.warning('请先上传或选择目标岗位'); return }
    if (blockedByRunning()) return
    // 快照上一次结果：若中途停止，恢复到可操作状态而不是留下一片空白
    prevResultRef.current = result
    const controller = new AbortController()
    abortRef.current = controller
    setResult(null)
    setOptimizing(true)
    beginRun()
    try {
      const taskRes = await optimize.runAsync(
        resumeId, jobId, instructions || buildInstructions() || undefined, selectedTemplate, controller.signal,
      )
      // 用户在「提交请求还没返回」的窗口里点了停止：忽略这次迟到响应
      if (cancelledRef.current) return
      const taskId = taskRes.data.task_id as string
      startTaskPolling(taskId, (r) => {
        setResult(r)
        setDiffModalOpen(true)   // 仅在优化彻底完成后弹出前后对比
        message.success(`简历优化完成${r.match_score != null ? `，匹配度 ${r.match_score} 分` : ''}`)
      })
    } catch (err: unknown) {
      if (cancelledRef.current) return
      finishRun()
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '提交优化任务失败'
      message.error(`优化失败: ${msg}`)
    }
  }, [resumeId, jobId, selectedTemplate, result, blockedByRunning, beginRun, finishRun, startTaskPolling, buildInstructions])

  /** 个人中心文本一键生成（跳过上传，直接用已保存的简历/岗位文本）*/
  const handleQuickOptimize = useCallback(async () => {
    if (!savedTexts.resumeText.trim()) { message.warning('请先在「个人中心」中填写简历信息'); return }
    if (!savedTexts.jobText.trim()) { message.warning('请先在「个人中心」中填写岗位信息'); return }
    if (blockedByRunning()) return
    prevResultRef.current = result
    const controller = new AbortController()
    abortRef.current = controller
    setResult(null)
    setOptimizing(true)
    beginRun()
    try {
      const taskRes = await optimize.quick(
        savedTexts.resumeText, savedTexts.jobText, buildInstructions() || undefined, selectedTemplate, controller.signal,
      )
      if (cancelledRef.current) return
      const taskId = taskRes.data.task_id as string
      startTaskPolling(taskId, (r) => {
        setResult(r)
        setDiffModalOpen(true)
        message.success('简历优化完成')
      })
    } catch (err: unknown) {
      if (cancelledRef.current) return
      finishRun()
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '提交优化任务失败'
      message.error(`优化失败: ${msg}`)
    }
  }, [savedTexts, selectedTemplate, result, blockedByRunning, beginRun, finishRun, startTaskPolling, buildInstructions])

  /** 全部应用：标记全部建议，并在条件具备时按最新要求重新优化 */
  const handleApplyAll = useCallback(() => {
    if (!suggestions.length) { message.info('当前没有待应用的优化建议'); return }
    const next: Record<string, boolean> = {}
    suggestions.forEach((s) => { next[s.title] = true })
    setAppliedSuggestions(next)
    if (!resumeData) { message.warning('请先上传简历'); return }
    if (!jobId) { message.info('建议已记录，选择目标职位后点击「立即优化」即可生效'); return }
    // 已在运行中就不重复发起，否则「正在重新优化」的提示与实际行为不符
    if (blockedByRunning()) return
    message.success('已应用全部建议，正在按最新要求重新优化…')
    runOptimize(buildInstructions(true))
  }, [suggestions, resumeData, jobId, runOptimize, buildInstructions, blockedByRunning])

  const toggleSuggestion = useCallback((title: string) => {
    setAppliedSuggestions((prev) => ({ ...prev, [title]: !prev[title] }))
  }, [])

  /** 导出 PDF：已有结果直接下载；否则按当前模板直接渲染一份（跳过 AI 优化）*/
  const handleExportPdf = useCallback(async () => {
    if (result?.pdf_url) { window.open(toBackendUrl(result.pdf_url), '_blank'); return }
    if (!resumeId) { message.warning('请先上传简历'); return }
    if (blockedByRunning()) return
    const controller = new AbortController()
    abortRef.current = controller
    setExporting(true)
    beginRun()
    try {
      const res = await renderApi.render(resumeId, selectedTemplate, controller.signal)
      if (cancelledRef.current) return
      const taskId = res.data.task_id as string
      startTaskPolling(taskId, (r) => {
        if (r.pdf_url) {
          window.open(toBackendUrl(r.pdf_url), '_blank')
          message.success('PDF 已生成（未经过 AI 优化）')
        } else {
          message.error('PDF 生成失败')
        }
      })
    } catch (err: unknown) {
      if (cancelledRef.current) return
      finishRun()
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '导出失败'
      message.error(msg)
    }
  }, [result, resumeId, selectedTemplate, blockedByRunning, beginRun, finishRun, startTaskPolling])

  /**
   * 停止优化（AI 优化 / 一键生成 / PDF 渲染共用）。
   * 分三步，顺序不能颠倒：先本地掐断（否则迟到的响应会把界面推回运行态），
   * 再恢复可操作状态（还原中断前的结果），最后才异步通知后端。
   */
  const handleStopOptimize = useCallback(async () => {
    const taskId = taskIdRef.current
    cancelledRef.current = true   // 先置位：此后所有迟到响应 / 轮询结果一律丢弃
    abortRef.current?.abort()     // 中断「提交请求尚未返回」的在途 HTTP
    finishRun()
    setResult(prevResultRef.current)   // 恢复中断前的展示，不丢上一次结果
    if (taskId) {
      try { await optimize.cancelTask(taskId) }
      catch { /* 后端可能已自行结束：本地状态已恢复，不阻塞用户 */ }
    }
    message.info('已停止优化，可重新发起')
  }, [finishRun])

  // 卸载兜底：清掉所有定时器并中断在途请求，避免离开页面后仍留有回调
  useEffect(() => {
    return () => {
      clearTimers()
      abortRef.current?.abort()
    }
  }, [clearTimers])

  // ══════════ 派生视图状态 ══════════

  const stepDone = [
    !!resumeData,
    !!(jobData || (useCustomKeywords && customKeywords.length)),
    !!result,
    !!result,
  ]
  const firstTodo = stepDone.findIndex((d) => !d)
  const activeIndex = result ? 3 : (firstTodo === -1 ? 2 : firstTodo)
  const stepState = (i: number): StepState => {
    if (stepDone[i]) return 'done'
    if (i === activeIndex) return 'active'
    return 'todo'
  }

  const nowScore = displayAnalysis?.dimensions
  const delta = (get: (d: NonNullable<typeof nowScore>) => number) =>
    optimizedAnalysis && baseAnalysis ? Number((get(optimizedAnalysis.dimensions) - get(baseAnalysis.dimensions)).toFixed(1)) : undefined

  if (!token) {
    // 未登录态也先渲染 AppLayout 外壳 + 骨架屏，而非整页裸转圈：
    // 客户端 JS 一旦未 hydrate 也不会永久钉在白屏转圈；未登录时 useEffect 仍会跳转 /login
    return (
      <AppLayout activeKey="home" searchable>
        <div className="app-page-enter opt-page" style={{ padding: 24 }}>
          <Skeleton active paragraph={{ rows: 10 }} />
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout activeKey="home" searchable>
      <div className="app-page-enter opt-page">
        <div className="opt-layout">
          {/* ══════════ 主区 ══════════ */}
          <div className="opt-main">
            <div className="opt-head">
              <h1>AI 简历优化</h1>
              <p>上传、分析并优化您的简历，适配任何职位。</p>
            </div>

            {/* 四步进度 */}
            <div className="opt-steps">
              {['上传简历', '目标职位', 'AI 分析', '优化完成'].map((label, i) => {
                const st = stepState(i)
                return (
                  <React.Fragment key={label}>
                    {i > 0 && <span className={`opt-step-line${stepState(i - 1) === 'done' ? ' done' : ''}`} />}
                    <div className={`opt-step is-${st}`}>
                      <span className="opt-step-dot">{st === 'done' ? <CheckCircleFilled /> : i + 1}</span>
                      <span className="opt-step-label">{label}</span>
                    </div>
                  </React.Fragment>
                )
              })}
            </div>

            {/* 原始 vs 优化后 */}
            <div className="opt-compare">
              <Card
                className="opt-compare-card"
                title={<span className="opt-card-title"><FileTextOutlined /> 原始简历</span>}
                extra={<Tag className="opt-soft-tag">修改前</Tag>}
                onPaste={(e) => handlePaste(e, 'resume')}
              >
                <Spin spinning={resumeLoading} tip="正在解析简历...">
                  <ResumePreview
                    data={resumeData}
                    variant="original"
                    emptyText={<span>上传或从简历库选择一份简历</span>}
                  />
                </Spin>
              </Card>

              <button
                className="opt-swap-btn"
                disabled={!result}
                title={result ? '查看逐条优化对比' : '优化完成后可查看逐条对比'}
                onClick={() => result && router.push(`/history/${result.id}`)}
              >
                <SwapOutlined />
              </button>

              <Card
                className="opt-compare-card is-optimized"
                title={<span className="opt-card-title"><ThunderboltOutlined /> AI 优化后简历</span>}
                extra={result ? <Tag color="green" icon={<CheckCircleFilled />}>已优化</Tag> : <Tag className="opt-soft-tag">待优化</Tag>}
              >
                <ResumePreview
                  data={(result?.optimized_json as ResumeParseResult) || null}
                  variant="optimized"
                  baselineSkills={resumeData?.skills}
                  emptyText={<span>点击下方「立即优化」生成新版简历</span>}
                />
              </Card>
            </div>

            {/* 立即优化 */}
            <div className="opt-runbar">
              <Button
                size="large"
                icon={TEMPLATE_OPTIONS.find((o) => o.key === selectedTemplate)?.icon || <FileTextOutlined />}
                onClick={() => setShowTemplateModal(true)}
              >
                {TEMPLATE_OPTIONS.find((o) => o.key === selectedTemplate)?.label || '选择模板'}
              </Button>
              <Button
                type="primary"
                size="large"
                className="opt-run-btn"
                icon={<ThunderboltOutlined />}
                loading={optimizing}
                disabled={!resumeId || !jobId || exporting}
                onClick={() => runOptimize()}
              >
                立即优化
              </Button>
            </div>
            {(!resumeId || !jobId) && (
              <div className="opt-run-hint">
                {!resumeId && '请先在下方「上传简历文件」中上传简历；'}
                {!jobId && '并在「目标职位」中选择或上传岗位需求。'}
              </div>
            )}

            {/* 运行中：只给「在做什么 + 等了多久 + 停止」，不展示无法反映真实进度的百分比 */}
            {(optimizing || exporting) && (
              <div className="opt-running" role="status" aria-live="polite">
                <span className="opt-running-dot" />
                <span className="opt-running-text">
                  {optimizing ? '正在优化简历…' : '正在渲染 PDF…'}
                  <span className="opt-running-time">已用时 {formatDuration(runningSeconds)}</span>
                </span>
                <span className="opt-running-tip">完成后将自动弹出前后对比</span>
                <Button
                  danger
                  size="small"
                  icon={<StopOutlined />}
                  onClick={handleStopOptimize}
                >
                  停止优化
                </Button>
              </div>
            )}

            {/* 优化说明 */}
            {result && !optimizing && (
              <Card
                className="opt-result-card"
                title={<span className="opt-card-title">优化说明</span>}
                extra={<Button type="link" onClick={() => router.push(`/history/${result.id}`)}>查看详情</Button>}
              >
                <pre className="opt-result-text">
                  {result.changes_description || '简历 PDF 已生成，可点击「导出 PDF」下载。'}
                </pre>
                <Space wrap>
                  <Button type="primary" icon={<DownloadOutlined />} onClick={handleExportPdf}>下载简历 PDF</Button>
                  <Button onClick={() => router.push(`/history/${result.id}`)}>查看逐条对比</Button>
                </Space>
              </Card>
            )}

            {/* 底部三卡 */}
            <div className="opt-bottom">
              {/* ① 上传简历文件 */}
              <Card
                className="opt-bottom-card"
                title={<span className="opt-card-title"><UploadOutlined /> 上传简历文件</span>}
                extra={<Button type="link" size="small" onClick={() => router.push('/resumes')}>查看全部</Button>}
                onPaste={(e) => handlePaste(e, 'resume')}
              >
                <Upload.Dragger
                  accept=".pdf,.docx,.png,.jpg,.jpeg"
                  beforeUpload={(file) => { handleResumeUpload(file); return false }}
                  showUploadList={false}
                  disabled={resumeLoading}
                  className="opt-dragger"
                >
                  {resumeLoading ? (
                    <Spin tip="正在解析简历..."><div style={{ minHeight: 80 }} /></Spin>
                  ) : (
                    <>
                      <p className="ant-upload-drag-icon"><UploadOutlined /></p>
                      <p className="app-upload-text">拖拽文件到此处，或点击上传</p>
                      <p className="app-upload-hint">支持 PDF、Word 格式，最大 20MB（也可 Ctrl+V 粘贴）</p>
                      <div className="opt-file-types">
                        <span className="opt-file-type pdf">PDF</span>
                        <span className="opt-file-type word">Word</span>
                      </div>
                    </>
                  )}
                </Upload.Dragger>
                {resumeData && (
                  <div className="opt-picked">
                    <CheckCircleFilled style={{ color: 'var(--success-500)' }} />
                    <span>已选择：{resumeData.personal_info?.name || '未命名简历'}</span>
                    {resumeFileUrl && resumeFileType === 'pdf' && (
                      <a href={toBackendUrl(resumeFileUrl)} target="_blank" rel="noreferrer">查看原件</a>
                    )}
                  </div>
                )}
                <div className="opt-bottom-foot">
                  <Button size="small" icon={<FolderOpenOutlined />} onClick={handleOpenResumeLibrary} disabled={resumeLoading}>
                    从简历库选择
                  </Button>
                  <span className="opt-counter">{resumeCount}/{RESUME_LIBRARY_CAP}</span>
                  {savedTexts.resumeText.trim() && (
                    <Tooltip title="使用「个人中心 - 我的信息」里保存的简历文本，跳过上传直接生成">
                      <Button size="small" type="link" icon={<FormOutlined />} loading={optimizing} onClick={handleQuickOptimize}>
                        一键生成
                      </Button>
                    </Tooltip>
                  )}
                </div>
              </Card>

              {/* ② 目标职位 */}
              <Card
                className="opt-bottom-card"
                title={<span className="opt-card-title"><AimOutlined /> 目标职位</span>}
                extra={<Button type="link" size="small" onClick={() => router.push('/jobs')}>岗位库</Button>}
              >
                <Input
                  value={targetTitle}
                  onChange={(e) => setTargetTitle(e.target.value)}
                  placeholder="请输入您想申请的职位，如：Java开发工程师..."
                  allowClear
                />

                <div className="opt-switch-row">
                  <div>
                    <div className="opt-switch-title">使用职位描述</div>
                    <div className="opt-switch-desc">按 JD 精准匹配岗位关键词</div>
                  </div>
                  <Switch size="small" checked={useJobDesc} onChange={setUseJobDesc} />
                </div>

                {useJobDesc && (
                  <div className="opt-job-zone" onPaste={(e) => handlePaste(e, 'job')}>
                    {jobData ? (
                      <div className="opt-picked">
                        <CheckCircleFilled style={{ color: 'var(--success-500)' }} />
                        <span className="opt-picked-name">
                          {jobData.title || '未命名岗位'}
                          {jobData.company ? ` · ${jobData.company}` : ''}
                        </span>
                        <Button size="small" type="link" onClick={handleOpenJobLibrary}>更换</Button>
                      </div>
                    ) : (
                      <Upload.Dragger
                        accept=".png,.jpg,.jpeg,.webp"
                        beforeUpload={(file) => { handleJobUpload(file); return false }}
                        showUploadList={false}
                        disabled={jobLoading}
                        className="opt-dragger is-slim"
                      >
                        {jobLoading ? (
                          <Spin tip="正在解析岗位需求..."><div style={{ minHeight: 60 }} /></Spin>
                        ) : (
                          <p className="app-upload-hint">
                            <PictureOutlined /> 拖拽岗位截图到此处，或点击上传（支持 Ctrl+V 粘贴）
                          </p>
                        )}
                      </Upload.Dragger>
                    )}
                    {jobData?.must_have?.skills?.length ? (
                      <div className="opt-job-skills">
                        {jobData.must_have.skills.slice(0, 4).map((s) => (
                          <span key={s} className="opt-mini-chip">{s}</span>
                        ))}
                        {jobData.must_have.skills.length > 4 && (
                          <span className="opt-mini-chip">+{jobData.must_have.skills.length - 4}</span>
                        )}
                      </div>
                    ) : null}
                    {!jobData && (
                      <div style={{ marginTop: 8 }}>
                        <Button size="small" icon={<FolderOpenOutlined />} onClick={handleOpenJobLibrary} disabled={jobLoading}>
                          从岗位库选择
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                <div className="opt-switch-row">
                  <div>
                    <div className="opt-switch-title">自定义关键词</div>
                    <div className="opt-switch-desc">强制在简历中体现这些关键词</div>
                  </div>
                  <Switch size="small" checked={useCustomKeywords} onChange={setUseCustomKeywords} />
                </div>

                {useCustomKeywords && (
                  <Select
                    mode="tags"
                    style={{ width: '100%', marginTop: 8 }}
                    placeholder="输入关键词后回车，如：Spring Boot"
                    value={customKeywords}
                    onChange={setCustomKeywords}
                    tokenSeparators={[',', '，', ' ']}
                  />
                )}
              </Card>

              {/* ③ 简历分析 */}
              <Card
                className="opt-bottom-card"
                title={<span className="opt-card-title"><ExperimentOutlined /> 简历分析</span>}
                extra={optimizedAnalysis ? <Tag color="green">优化后</Tag> : <Tag className="opt-soft-tag">优化前</Tag>}
              >
                {!nowScore ? (
                  <div className="opt-analysis-empty">
                    {analysisLoading ? <Spin size="small" /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="上传简历后自动分析" />}
                  </div>
                ) : (
                  <div className="opt-metric-grid">
                    <MetricStat label="ATS 评分" value={nowScore.ats_score} unit="分" delta={delta((d) => d.ats_score)} deltaUnit="point" />
                    <MetricStat label="关键词密度" value={nowScore.keyword_density} unit="%" delta={delta((d) => d.keyword_density)} deltaUnit="%" />
                    <MetricStat label="可读性" value={nowScore.readability.toFixed(1)} unit="分" delta={delta((d) => d.readability)} deltaUnit="point" />
                    <MetricStat label="影响力评分" value={nowScore.impact.toFixed(1)} unit="分" delta={delta((d) => d.impact)} deltaUnit="point" />
                  </div>
                )}
                {optimizedAnalysis && baseAnalysis && (
                  <div className="opt-analysis-note">
                    综合评分 {baseAnalysis.total_score} → {optimizedAnalysis.total_score}
                    （原始 / 优化后同口径计算）
                  </div>
                )}
              </Card>
            </div>
          </div>

          {/* ══════════ 右侧面板 ══════════ */}
          <aside className="opt-side">
            <Card className="opt-side-card" title={<span className="opt-card-title">职位匹配度</span>}>
              <div className="opt-match">
                <MatchGauge score={matchScore} />
                <div className="opt-match-info">
                  <div className="opt-match-level" style={{ color: matchLevel.color }}>{matchLevel.label}</div>
                  <div className="opt-match-desc">{matchLevel.desc}</div>
                  {matchDelta != null && matchDelta !== 0 && (
                    <div className="opt-match-delta">
                      {/* 上面的大数是 AI 岗位匹配分；这个增量来自规则化关键词匹配，
                          标清口径避免被读成「大数应该涨这么多」 */}
                      关键词匹配度较优化前 {matchDelta > 0 ? '+' : ''}{matchDelta} 分
                    </div>
                  )}
                </div>
              </div>
              {!jobData && (
                <div className="opt-side-hint">
                  选择目标岗位后可算出真实匹配度
                </div>
              )}
            </Card>

            <Card
              className="opt-side-card"
              title={<span className="opt-card-title">关键词匹配</span>}
              extra={keywordChips.length > KEYWORD_PREVIEW ? (
                <Button type="link" size="small" onClick={() => setKeywordModalOpen(true)}>查看全部</Button>
              ) : null}
            >
              {keywordChips.length === 0 ? (
                <div className="opt-side-hint">上传简历并选择岗位后，自动比对关键词</div>
              ) : (
                <>
                  <div className="opt-keywords">
                    {keywordChips.slice(0, KEYWORD_PREVIEW).map(({ tag, covered }) => (
                      <span key={tag} className={`opt-kw${covered ? ' covered' : ''}`}>
                        {covered && <CheckCircleFilled />}
                        {tag}
                      </span>
                    ))}
                    {keywordChips.length > KEYWORD_PREVIEW && (
                      <button className="opt-kw more" onClick={() => setKeywordModalOpen(true)}>
                        +{keywordChips.length - KEYWORD_PREVIEW} 更多
                      </button>
                    )}
                  </div>
                  <div className="opt-side-hint">
                    已覆盖 {coveredCount}/{keywordChips.length} 个岗位关键词
                  </div>
                </>
              )}
            </Card>

            <Card
              className="opt-side-card"
              title={<span className="opt-card-title">AI 优化建议</span>}
              extra={suggestions.length > 4 ? (
                <Button type="link" size="small" onClick={() => setSuggestionModalOpen(true)}>查看全部</Button>
              ) : null}
            >
              {suggestions.length === 0 ? (
                <div className="opt-side-hint">
                  {analysisLoading ? '正在分析简历…' : '上传简历后给出针对性优化建议'}
                </div>
              ) : (
                <div className="opt-suggestions">
                  {suggestions.slice(0, 4).map((s) => {
                    const on = !!appliedSuggestions[s.title]
                    return (
                      <button
                        key={s.title}
                        className={`opt-suggestion${on ? ' is-applied' : ''}`}
                        onClick={() => toggleSuggestion(s.title)}
                        title={s.detail}
                      >
                        <span className="opt-suggestion-icon">
                          {on ? <CheckCircleFilled /> : <BulbOutlined />}
                        </span>
                        <span className="opt-suggestion-body">
                          <span className="opt-suggestion-title">{s.title}</span>
                          <span className="opt-suggestion-desc">{s.desc}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </Card>

            <div className="opt-side-actions">
              <Button type="primary" block size="large" icon={<ThunderboltOutlined />} onClick={handleApplyAll} disabled={!suggestions.length}>
                全部应用
              </Button>
              <Button block size="large" icon={<DownloadOutlined />} loading={exporting} onClick={handleExportPdf} disabled={!resumeId || optimizing}>
                导出 PDF
              </Button>
            </div>
          </aside>
        </div>

        {/* 关键词全部 */}
        <Modal title="关键词匹配" open={keywordModalOpen} onCancel={() => setKeywordModalOpen(false)} footer={null} width={560}>
          <div className="opt-kw-modal">
            <div className="opt-kw-group">
              <div className="opt-kw-group-title">已覆盖（{coveredCount}）</div>
              <Space wrap>
                {keywordChips.filter((c) => c.covered).map(({ tag }) => (
                  <Tag key={tag} color="green" icon={<CheckCircleFilled />}>{tag}</Tag>
                ))}
                {coveredCount === 0 && <span className="app-text-caption">暂无</span>}
              </Space>
            </div>
            <div className="opt-kw-group">
              <div className="opt-kw-group-title">待补充（{keywordChips.length - coveredCount}）</div>
              <Space wrap>
                {keywordChips.filter((c) => !c.covered).map(({ tag }) => (
                  <Tag key={tag}>{tag}</Tag>
                ))}
                {keywordChips.length - coveredCount === 0 && <span className="app-text-caption">全部命中，很棒</span>}
              </Space>
            </div>
          </div>
        </Modal>

        {/* 建议全部 */}
        <Modal title="AI 优化建议" open={suggestionModalOpen} onCancel={() => setSuggestionModalOpen(false)} footer={null} width={620}>
          <List
            dataSource={suggestions}
            renderItem={(s) => {
              const on = !!appliedSuggestions[s.title]
              return (
                <List.Item
                  actions={[
                    <Button key="t" type="link" size="small" onClick={() => toggleSuggestion(s.title)}>
                      {on ? '取消应用' : '应用'}
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    avatar={on ? <CheckCircleFilled style={{ color: 'var(--success-500)', fontSize: 18 }} /> : <BulbOutlined style={{ color: 'var(--primary-500)', fontSize: 18 }} />}
                    title={s.title}
                    description={
                      <>
                        <div>{s.desc}</div>
                        {s.detail && <div className="app-text-caption" style={{ marginTop: 4 }}>诊断：{s.detail}</div>}
                      </>
                    }
                  />
                </List.Item>
              )
            }}
          />
        </Modal>

        {/* 简历库选择弹窗 */}
        <Modal title="从简历库选择" open={resumeSelectModalOpen} onCancel={() => setResumeSelectModalOpen(false)} footer={null} width={700}>
          <Spin spinning={resumeListLoading}>
            {resumeList.length === 0 ? (
              <Empty description="简历库为空，请先上传一份简历" />
            ) : (
              <List dataSource={resumeList} renderItem={(item) => (
                <List.Item actions={[<Button type="link" size="small" onClick={() => handleSelectResume(item)} key="select">选择</Button>]}>
                  <List.Item.Meta
                    title={item.title || '未命名简历'}
                    description={
                      <Space>
                        <Tag style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--gray-100)' }}>{item.file_type?.toUpperCase() || 'Unknown'}</Tag>
                        {item.parsed_json?.personal_info?.name && <span>{item.parsed_json.personal_info.name}</span>}
                        {item.created_at && <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{formatDate(item.created_at)}</span>}
                        {item.is_primary && <Tag style={{ color: 'var(--success-600)', backgroundColor: 'var(--success-50)' }}>默认</Tag>}
                      </Space>
                    }
                  />
                </List.Item>
              )} />
            )}
          </Spin>
        </Modal>

        {/* 岗位库选择弹窗 */}
        <Modal title="从岗位库选择" open={jobSelectModalOpen} onCancel={() => setJobSelectModalOpen(false)} footer={null} width={700}>
          <Spin spinning={jobListLoading}>
            {jobList.length === 0 ? (
              <Empty description="岗位库为空，请先上传一份岗位" />
            ) : (
              <List dataSource={jobList} renderItem={(item: Record<string, unknown>) => {
                const isPrimary = item.is_primary as boolean
                const isFavorite = item.is_favorite as boolean
                const company = item.company as string | null
                const category = item.category as string | null
                const createdAt = item.created_at as string | null
                return (
                  <List.Item actions={[<Button type="link" size="small" onClick={() => handleSelectJob(item)} key="select">选择</Button>]}>
                    <List.Item.Meta
                      title={<Space>{(item.title as string) || '未命名岗位'}{isPrimary && <Tag style={{ color: 'var(--warning-600)', backgroundColor: 'var(--warning-50)' }}>默认</Tag>}{isFavorite && <StarFilled style={{ color: 'var(--warning-500)', fontSize: 12 }} />}</Space>}
                      description={
                        <Space>
                          {company && <span><FileTextOutlined /> {company}</span>}
                          {category && <Tag style={{ color: 'var(--primary-600)', backgroundColor: 'var(--primary-50)' }}>{category}</Tag>}
                          {createdAt && <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{formatDate(createdAt)}</span>}
                        </Space>
                      }
                    />
                  </List.Item>
                )
              }} />
            )}
          </Spin>
        </Modal>

        {/* 优化完成 → 前后对比（仅在任务彻底完成后由 runOptimize / handleQuickOptimize 打开）*/}
        <OptimizeDiffModal
          open={diffModalOpen}
          onClose={() => setDiffModalOpen(false)}
          result={result}
          before={resumeData}
          scoreBefore={baseAnalysis?.match_rate ?? null}
          scoreAfter={optimizedAnalysis?.match_rate ?? null}
          onOpenDetail={result ? () => router.push(`/history/${result.id}`) : undefined}
          onExport={handleExportPdf}
          exporting={exporting}
        />

        <TemplateSelector open={showTemplateModal} onClose={() => setShowTemplateModal(false)} selected={selectedTemplate} onSelect={setSelectedTemplate} options={TEMPLATE_OPTIONS} />
      </div>
    </AppLayout>
  )
}
