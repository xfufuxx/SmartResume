'use client'

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Button, Typography, Spin, message,
  Tag, Space, Modal, Input, Empty, Tooltip, Tabs, Select, Table, Dropdown, Pagination,
  Checkbox, Alert,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  PlusOutlined,
  UploadOutlined, DownloadOutlined, SearchOutlined, FilterOutlined,
  StarOutlined, StarFilled, UndoOutlined,
  CrownOutlined, CopyOutlined, DeleteOutlined, EditOutlined, EyeOutlined,
  EllipsisOutlined,
  ContainerOutlined, SendOutlined, CodeOutlined, AppstoreOutlined, LineChartOutlined,
  BgColorsOutlined, ShoppingOutlined, NotificationOutlined, FileSearchOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/AppLayout'
import AuthGate from '@/components/AuthGate'
import { jobs, applications, emailTemplates, resumes, user, toBackendUrl } from '@/lib/api'
import { getToken } from '@/lib/auth'
import { formatDate } from '@/lib/utils'
import type {
  ApplicationPayload, DeliveryContactHint, EmailTemplate, FormProbeResult, GuidePack,
  BatchApplicationResult, ResumeRecord,
} from '@/types'

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

/** 导入职位：单张图片识别后的待确认条目（可编辑） */
interface ImportJobItem {
  uid: string
  image_url?: string
  title: string
  company: string
  category: string
  salary_range: string
  location: string
  industry: string
  responsibilities: string
  parsed_job_json?: Record<string, unknown>
  status: 'parsing' | 'done' | 'error'
  error?: string
}

/* 分类图标与配色（职位信息列左侧彩色图标） */
const CATEGORY_META: Record<string, { icon: React.ReactNode; color: string }> = {
  '开发': { icon: <CodeOutlined />, color: '#007AFF' },
  '产品': { icon: <AppstoreOutlined />, color: '#AF52DE' },
  '运营': { icon: <LineChartOutlined />, color: '#FF9500' },
  '设计': { icon: <BgColorsOutlined />, color: '#FF2D55' },
  '市场': { icon: <NotificationOutlined />, color: '#32ADE6' },
  '销售': { icon: <ShoppingOutlined />, color: '#34C759' },
  '其他': { icon: <FileSearchOutlined />, color: '#8E8E93' },
}

const DEFAULT_CATEGORY_META = { icon: <FileSearchOutlined />, color: '#007AFF' }

/** 匹配度圆环（真实数据：来自该岗位优化记录的最高 match_score） */
function MatchRing({ value }: { value: number }) {
  const r = 17
  const c = 2 * Math.PI * r
  const color = value >= 85 ? 'var(--success-500)' : value >= 60 ? 'var(--warning-500)' : 'var(--error-500)'
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" style={{ display: 'block' }}>
      <circle cx="22" cy="22" r={r} fill="none" stroke="var(--gray-100)" strokeWidth="4" />
      <circle
        cx="22" cy="22" r={r} fill="none"
        stroke={color} strokeWidth="4" strokeLinecap="round"
        strokeDasharray={`${(c * Math.min(100, Math.max(0, value))) / 100} ${c}`}
        transform="rotate(-90 22 22)"
      />
      <text x="22" y="26.5" textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--text-primary)">
        {value}%
      </text>
    </svg>
  )
}

export default function JobLibrary() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)

  // 数据：allJobs 为全量在库岗位（用于统计卡与 Tab 计数），list 为当前 Tab 原始数据
  const [allJobs, setAllJobs] = useState<JobRecord[]>([])
  const [list, setList] = useState<JobRecord[]>([])
  const [favCount, setFavCount] = useState(0)
  const [matchMap, setMatchMap] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)

  // Tab 与筛选（岗位库仅做仓库维度的筛选，不含任何投递 / 面试状态）
  const [activeTab, setActiveTab] = useState('all')
  const [searchQ, setSearchQ] = useState('')
  const [cityFilter, setCityFilter] = useState<string | undefined>()
  const [categoryFilter, setCategoryFilter] = useState('')
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')

  // 分页与选择
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [selectedIds, setSelectedIds] = useState<React.Key[]>([])
  const [batchLoading, setBatchLoading] = useState(false)

  // 弹窗状态
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [addForm, setAddForm] = useState({
    title: '', company: '', category: '', salary_range: '', location: '',
    industry: '', responsibilities: '', must_have: '', nice_to_have: '', user_remark: '',
  })
  const [addLoading, setAddLoading] = useState(false)

  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importList, setImportList] = useState<ImportJobItem[]>([])
  const [importParsing, setImportParsing] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editJob, setEditJob] = useState<JobRecord | null>(null)
  const [editForm, setEditForm] = useState({ title: '', company: '', category: '', user_remark: '' })
  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  const [previewJob, setPreviewJob] = useState<JobRecord | null>(null)

  // 一键投递：弹窗 + 表单（招聘软件式：只选简历 + 选填附言，联系方式自动带出）
  const [applyModalOpen, setApplyModalOpen] = useState(false)
  const [applyJob, setApplyJob] = useState<JobRecord | null>(null)
  const [applyForm, setApplyForm] = useState({
    resume_id: '', cover_letter: '', recipient_email: '', apply_url: '', consent_given: false, guide: false,
  })
  const [applyLoading, setApplyLoading] = useState(false)
  const [contactHint, setContactHint] = useState<DeliveryContactHint | null>(null)
  // ── 阶段3：官网表单探测（apply_url 填写后可探测表单结构与 robots 核查）──
  const [formProbe, setFormProbe] = useState<FormProbeResult | null>(null)
  const [formProbing, setFormProbing] = useState(false)
  // ── 阶段4：平台引导投递一键准备包（勾选 guide 后自动生成）──
  const [guidePack, setGuidePack] = useState<GuidePack | null>(null)
  const [guideLoading, setGuideLoading] = useState(false)
  // ── 阶段2：邮件模板 + 批量投递 ──
  const [applyTemplates, setApplyTemplates] = useState<EmailTemplate[]>([])
  const [batchApplyOpen, setBatchApplyOpen] = useState(false)
  const [batchApplyLoading, setBatchApplyLoading] = useState(false)
  const [batchForm, setBatchForm] = useState({ resume_id: '', cover_letter: '', consent_given: false })
  const [batchEmails, setBatchEmails] = useState<Record<string, string>>({})
  const [batchHints, setBatchHints] = useState<Record<string, DeliveryContactHint>>({})
  const [resumeOptions, setResumeOptions] = useState<{ label: string; value: string }[]>([])
  const [profile, setProfile] = useState<{ nickname?: string; email: string; phone?: string } | null>(null)

  useEffect(() => {
    const t = getToken()
    if (!t) { router.push('/login'); return }
    setToken(t)
    router.prefetch('/')
    router.prefetch('/resumes')
    router.prefetch('/history')
  }, [router])

  const loadData = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const allRes = await jobs.list(searchQ, categoryFilter)
      setAllJobs(allRes.data)
      let current: JobRecord[] = allRes.data
      if (activeTab === 'favorites') {
        const r = await jobs.getFavorites()
        current = r.data
      } else if (activeTab === 'trash') {
        const r = await jobs.getTrash()
        current = r.data
      }
      setList(current)
      try {
        const f = await jobs.getFavorites()
        setFavCount(f.data.length)
      } catch { /* 静默失败 */ }
    } catch {
      message.error('加载岗位列表失败')
    } finally {
      setLoading(false)
    }
  }, [token, activeTab, searchQ, categoryFilter])

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, activeTab])

  // 匹配度：来自该岗位历史优化记录的最高 match_score（无记录显示 —）
  useEffect(() => {
    if (!token) return
    import('@/lib/api').then(({ optimize }) =>
      optimize.list('', '')
        .then((res) => {
          const m: Record<string, number> = {}
          for (const r of (res.data || []) as Array<{ job_image_id?: string | null; match_score?: number | null }>) {
            if (r.job_image_id && typeof r.match_score === 'number') {
              m[r.job_image_id] = Math.max(m[r.job_image_id] ?? 0, r.match_score)
            }
          }
          setMatchMap(m)
        })
        .catch(() => { /* 静默失败：匹配度列显示 — */ }),
    )
  }, [token])

  // 简历选项 + 个人资料（仅用于投递弹窗）
  useEffect(() => {
    if (!token) return
    resumes.list()
      .then((res) => {
        const opts = ((res.data || []) as ResumeRecord[]).map((r) => ({
          label: r.title || '未命名简历',
          value: r.id,
        }))
        setResumeOptions(opts)
      })
      .catch(() => { /* 静默失败 */ })
    user.getProfile()
      .then((res) => {
        const d = (res.data || {}) as { nickname?: string; email: string; phone?: string }
        setProfile({ nickname: d.nickname, email: d.email, phone: d.phone })
      })
      .catch(() => { /* 静默失败 */ })
  }, [token])

  // 筛选条件变化时回到第一页
  useEffect(() => {
    setPage(1)
  }, [activeTab, searchQ, cityFilter, categoryFilter, sortDir, pageSize])

  /* ── 字段读取助手 ── */
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

  const getJobParsed = (job: JobRecord) =>
    (job.parsed_job_json || {}) as Record<string, string>

  /* ── 过滤 + 排序（客户端） ── */
  const filtered = useMemo(() => {
    let arr = [...list]
    const kw = searchQ.trim().toLowerCase()
    if (kw) {
      arr = arr.filter((j) => {
        const p = getJobParsed(j)
        return (
          getJobTitle(j).toLowerCase().includes(kw) ||
          getJobCompany(j).toLowerCase().includes(kw) ||
          (p.location || '').toLowerCase().includes(kw)
        )
      })
    }
    if (cityFilter) {
      arr = arr.filter((j) => getJobParsed(j).location === cityFilter)
    }
    if (categoryFilter) {
      arr = arr.filter((j) => j.category === categoryFilter)
    }
    arr.sort((a, b) => {
      const ta = new Date(a.created_at).getTime()
      const tb = new Date(b.created_at).getTime()
      return sortDir === 'desc' ? tb - ta : ta - tb
    })
    return arr
  }, [list, activeTab, searchQ, cityFilter, categoryFilter, sortDir])

  const paged = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  )

  const cityOptions = useMemo(() => {
    const set = new Set<string>()
    for (const j of list) {
      const loc = getJobParsed(j).location
      if (loc) set.add(loc)
    }
    return Array.from(set).map((c) => ({ label: c, value: c }))
  }, [list])

  /* ── 统计卡（纯仓库维度：全部 / 收藏，不含任何投递或面试状态） ── */
  const statCards = useMemo(() => ([
    { key: 'all', label: '全部意向岗位', icon: <ContainerOutlined />, color: '#007AFF', count: allJobs.length, delta: 0 },
    { key: 'favorites', label: '收藏岗位', icon: <StarOutlined />, color: '#32ADE6', count: favCount, delta: 0 },
  ]), [allJobs, favCount])

  /* ── 业务操作 ── */
  const handleSearch = useCallback(() => {
    if (activeTab === 'all') loadData()
  }, [activeTab, loadData])

  /* ── 添加职位：手动表单提交（无需图片） ── */
  const handleAddSubmit = useCallback(async () => {
    const f = addForm
    if (!f.title.trim()) {
      message.warning('请填写职位标题')
      return
    }
    setAddLoading(true)
    try {
      const parsed_job_json: Record<string, unknown> = {}
      if (f.salary_range.trim()) parsed_job_json.salary_range = f.salary_range.trim()
      if (f.location.trim()) parsed_job_json.location = f.location.trim()
      if (f.industry.trim()) parsed_job_json.industry = f.industry.trim()
      const responsibilities = f.responsibilities.split('\n').map((s) => s.trim()).filter(Boolean)
      if (responsibilities.length) parsed_job_json.responsibilities = responsibilities
      const must = f.must_have.split('\n').map((s) => s.trim()).filter(Boolean)
      if (must.length) parsed_job_json.must_have = { skills: must }
      const nice = f.nice_to_have.split('\n').map((s) => s.trim()).filter(Boolean)
      if (nice.length) parsed_job_json.nice_to_have = { skills: nice }

      await jobs.create({
        title: f.title.trim(),
        company: f.company.trim() || undefined,
        category: f.category || undefined,
        user_remark: f.user_remark.trim() || undefined,
        parsed_job_json: Object.keys(parsed_job_json).length ? parsed_job_json : undefined,
      })
      message.success('职位添加成功')
      setAddModalOpen(false)
      setAddForm({ title: '', company: '', category: '', salary_range: '', location: '', industry: '', responsibilities: '', must_have: '', nice_to_have: '', user_remark: '' })
      loadData()
    } catch {
      message.error('添加失败')
    } finally {
      setAddLoading(false)
    }
  }, [addForm, loadData])

  /* ── 导入职位：图片识别 → 预览编辑 → 批量创建 ── */
  const handleImportFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setImportParsing(true)
    const tasks = Array.from(files).map((file) => {
      const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      setImportList((prev) => [
        ...prev,
        { uid, title: '', company: '', category: '', salary_range: '', location: '', industry: '', responsibilities: '', status: 'parsing' },
      ])
      return jobs.parseImage(file)
        .then((res) => {
          const data = res.data || {}
          const pj = (data.parsed_job_json || {}) as Record<string, unknown>
          const item: ImportJobItem = {
            uid,
            image_url: data.image_url,
            title: data.title || '',
            company: data.company || '',
            category: data.category || '',
            salary_range: (pj.salary_range as string) || '',
            location: (pj.location as string) || '',
            industry: (pj.industry as string) || '',
            responsibilities: ((pj.responsibilities as string[]) || []).join('\n'),
            parsed_job_json: pj,
            status: 'done',
          }
          setImportList((prev) => prev.map((it) => (it.uid === uid ? item : it)))
        })
        .catch((err: unknown) => {
          const errorMsg = err instanceof Error ? err.message :
            (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '识别失败'
          setImportList((prev) => prev.map((it) => (it.uid === uid ? { ...it, status: 'error', error: errorMsg } : it)))
        })
    })
    await Promise.all(tasks)
    setImportParsing(false)
  }, [])

  const updateImportItem = useCallback((uid: string, patch: Partial<ImportJobItem>) => {
    setImportList((prev) => prev.map((it) => (it.uid === uid ? { ...it, ...patch } : it)))
  }, [])

  const removeImportItem = useCallback((uid: string) => {
    setImportList((prev) => prev.filter((it) => it.uid !== uid))
  }, [])

  const handleImportConfirm = useCallback(async () => {
    const ready = importList.filter((it) => it.status === 'done' && it.title.trim())
    if (ready.length === 0) {
      message.warning('没有可导入的已识别职位')
      return
    }
    setImportParsing(true)
    try {
      const payload = ready.map((it) => {
        const pj: Record<string, unknown> = { ...(it.parsed_job_json || {}) }
        pj.title = it.title
        pj.company = it.company || undefined
        pj.salary_range = it.salary_range.trim() || undefined
        pj.location = it.location.trim() || undefined
        pj.industry = it.industry.trim() || undefined
        pj.responsibilities = it.responsibilities.split('\n').map((s) => s.trim()).filter(Boolean)
        return {
          title: it.title.trim(),
          company: it.company.trim() || undefined,
          category: it.category || undefined,
          image_url: it.image_url || undefined,
          parsed_job_json: pj,
        }
      })
      const res = await jobs.batchCreate(payload)
      message.success(res.data?.detail || `成功导入 ${ready.length} 个职位`)
      setImportModalOpen(false)
      setImportList([])
      loadData()
    } catch {
      message.error('批量导入失败')
    } finally {
      setImportParsing(false)
    }
  }, [importList, loadData])

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

  const handleTrash = useCallback((id: string) => {
    Modal.confirm({
      title: '移入回收站',
      content: '确定将该岗位移至回收站吗？',
      okText: '确定',
      cancelText: '取消',
      onOk: async () => {
        try {
          await jobs.trash(id)
          message.success('已移至回收站')
          loadData()
        } catch {
          message.error('删除失败')
        }
      },
    })
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

  const handlePermanentDelete = useCallback((id: string) => {
    Modal.confirm({
      title: '永久删除',
      content: '确定永久删除该岗位吗？此操作不可撤销。',
      okText: '永久删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await jobs.delete(id)
          message.success('已永久删除')
          loadData()
        } catch {
          message.error('删除失败')
        }
      },
    })
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
    if (!editForm.title.trim()) {
      message.warning('请填写职位标题')
      return
    }
    try {
      await jobs.update(editJob.id, {
        title: editForm.title.trim(),
        company: editForm.company.trim() || undefined,
        category: editForm.category || undefined,
        user_remark: editForm.user_remark.trim() || undefined,
      })
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

  /* ── 一键投递：打开弹窗（预填岗位信息 + 探测 HR 邮箱/官网链接）+ 提交 ── */
  const openApply = useCallback((job: JobRecord) => {
    setApplyJob(job)
    setApplyForm({ resume_id: '', cover_letter: '', recipient_email: '', apply_url: '', consent_given: false, guide: false })
    setContactHint(null)
    setFormProbe(null)
    setGuidePack(null)
    setApplyModalOpen(true)
    // 探测该岗位 JD 中的 HR 邮箱 / 官网投递链接与通道可用性（失败静默：弹窗仍可手动填写）
    applications.contactHint(job.id)
      .then((r) => {
        const hint = r.data as DeliveryContactHint
        setContactHint(hint)
        if (hint.email) {
          setApplyForm((p) => ({ ...p, recipient_email: hint.email || '' }))
        }
        if (hint.apply_url) {
          setApplyForm((p) => ({ ...p, apply_url: hint.apply_url || '' }))
        }
      })
      .catch(() => { /* 探测失败不阻塞投递 */ })
  }, [])

  // ── 阶段3：官网投递链接探测（只读：robots 核查 + 表单字段识别）──
  const handleProbeForm = useCallback(() => {
    const url = applyForm.apply_url.trim()
    if (!url) { message.warning('请先填写官网投递链接'); return }
    setFormProbing(true)
    applications.probeForm(url)
      .then((r) => {
        const probe = r.data as FormProbeResult
        setFormProbe(probe)
        if (!probe.robots_allowed) {
          message.warning('该站点 robots.txt 禁止自动访问，请改用其它投递方式')
        } else if (probe.form_detected) {
          message.success(`识别到 ${probe.fields.length} 个可预填字段`)
        } else {
          message.info(probe.detail || '未识别到静态表单，可直接打开预填浏览器确认')
        }
      })
      .catch(() => { message.warning('探测失败，请检查链接是否可访问') })
      .finally(() => setFormProbing(false))
  }, [applyForm.apply_url])

  // ── 阶段2：邮件模板（挂载时拉取一次；选择时占位符替换后填入附言）──
  useEffect(() => {
    emailTemplates.list()
      .then((r) => setApplyTemplates((r.data || []) as EmailTemplate[]))
      .catch(() => { /* 模板拉取失败不阻塞投递弹窗 */ })
  }, [])

  const fillTemplate = useCallback((body: string, jobTitle: string, company: string) => {
    return body
      .replaceAll('{job_title}', jobTitle || '该岗位')
      .replaceAll('{company}', company || '贵司')
      .replaceAll('{applicant_name}', profile?.nickname || '')
  }, [profile])

  const handlePickTemplate = useCallback((templateId: string, jobTitle: string, company: string) => {
    const tpl = applyTemplates.find((t) => t.id === templateId)
    if (!tpl) return
    setApplyForm((p) => ({ ...p, cover_letter: fillTemplate(tpl.body, jobTitle, company) }))
  }, [applyTemplates, fillTemplate])

  // ── 阶段2：批量投递（复用单投的授权/额度/邮箱探测链路）──
  const openBatchApply = useCallback(() => {
    const ids = selectedIds.slice(0, 10).map(String)
    if (ids.length === 0) return
    setBatchForm({ resume_id: '', cover_letter: '', consent_given: false })
    setBatchEmails({})
    setBatchHints({})
    setBatchApplyOpen(true)
    // 并发探测各岗位的 HR 邮箱（失败静默，用户可手填）
    ids.forEach((id) => {
      applications.contactHint(id)
        .then((r) => {
          const hint = r.data as DeliveryContactHint
          setBatchHints((p) => ({ ...p, [id]: hint }))
          if (hint.email) setBatchEmails((p) => ({ ...p, [id]: hint.email || '' }))
        })
        .catch(() => { /* 单岗探测失败不阻塞其余岗位 */ })
    })
  }, [selectedIds])

  const handleBatchApplySubmit = useCallback(async () => {
    const ids = selectedIds.slice(0, 10).map(String)
    if (ids.length === 0) return
    const emails: Record<string, string> = {}
    Object.entries(batchEmails).forEach(([k, v]) => {
      if (v && v.trim()) emails[k] = v.trim()
    })
    const hasEmail = Object.keys(emails).length > 0
    if (hasEmail && !batchForm.consent_given) {
      message.warning('对外投递需先勾选下方的授权确认')
      return
    }
    setBatchApplyLoading(true)
    try {
      const r = await applications.batch({
        job_image_ids: ids,
        resume_id: batchForm.resume_id || null,
        cover_letter: batchForm.cover_letter.trim() || null,
        recipient_emails: hasEmail ? emails : undefined,
        consent_given: batchForm.consent_given && hasEmail,
      })
      const res = r.data as BatchApplicationResult
      const parts = [`成功 ${res.created}`]
      if (res.skipped) parts.push(`跳过 ${res.skipped}`)
      if (res.failed_quota) parts.push(`额度不足 ${res.failed_quota}`)
      message.success(`批量投递完成：${parts.join('，')}`, 5)
      setBatchApplyOpen(false)
      setSelectedIds([])
      loadData()
    } catch (err: unknown) {
      const resp = (err as { response?: { data?: { detail?: string } } })?.response
      message.warning(resp?.data?.detail || '批量投递失败，请稍后重试')
    } finally {
      setBatchApplyLoading(false)
    }
  }, [selectedIds, batchEmails, batchForm, loadData])

  // ── 阶段4：一键准备包（平台识别 + 深链 + 简历纯文本）──
  const fetchGuidePack = useCallback((jobId: string, resumeId?: string) => {
    setGuideLoading(true)
    applications.guidePack(jobId, resumeId || undefined)
      .then((r) => setGuidePack(r.data as GuidePack))
      .catch(() => { message.warning('准备包生成失败，请稍后重试') })
      .finally(() => setGuideLoading(false))
  }, [])

  const copyText = useCallback(async (text: string, tip: string) => {
    try {
      await navigator.clipboard.writeText(text)
      message.success(tip)
    } catch {
      message.warning('复制失败，请手动选择文本复制')
    }
  }, [])

  const handleApplySubmit = useCallback(async () => {
    if (!applyJob) return
    const email = applyForm.recipient_email.trim()
    const applyUrl = applyForm.apply_url.trim()
    const guide = applyForm.guide
    if ((email || applyUrl || guide) && !applyForm.consent_given) {
      message.warning('对外投递需先勾选下方的授权确认')
      return
    }
    if (guide && !guidePack?.deep_link) {
      message.warning('平台引导投递需先生成准备包（深链）')
      return
    }
    setApplyLoading(true)
    try {
      const payload: ApplicationPayload = {
        job_image_id: applyJob.id,
        resume_id: applyForm.resume_id || null,
        cover_letter: applyForm.cover_letter.trim() || null,
        status: 'submitted',
        recipient_email: guide ? null : (email || null),
        apply_url: guide ? (guidePack?.deep_link || null) : (applyUrl || null),
        channel_hint: guide ? 'guide' : null,
        consent_given: applyForm.consent_given && !!(guide || email || applyUrl),
      }
      await applications.create(payload)
      if (guide) {
        message.success('已登记平台引导投递。请前往「面试追踪 → 投递记录」打开平台岗位页完成投递，回来标记结果', 6)
      } else if (email) {
        message.success('已提交投递，邮件正在发送，可在「面试追踪 → 投递记录」查看送达状态')
      } else if (applyUrl) {
        message.success('已创建官网表单投递，请在「面试追踪 → 投递记录」打开预填浏览器，核对后手动提交', 6)
      } else {
        message.success('已登记投递记录，可在「面试追踪」查看进度')
      }
      setApplyModalOpen(false)
      setApplyJob(null)
    } catch (err: unknown) {
      const resp = (err as { response?: { status?: number; data?: { detail?: string } } })?.response
      if (resp?.status === 409) {
        message.warning('你已投递过该岗位')
        setApplyModalOpen(false)
        setApplyJob(null)
      } else if (resp?.status === 429) {
        message.warning(resp?.data?.detail || '已达今日投递上限，请明日再试')
      } else if (resp?.status === 422) {
        message.warning(resp?.data?.detail || '投递信息有误，请检查邮箱与授权勾选')
      } else {
        message.error('投递失败，请检查表单后重试')
      }
    } finally {
      setApplyLoading(false)
    }
  }, [applyJob, applyForm, guidePack])

  const handleBatchTrash = useCallback(() => {
    if (selectedIds.length === 0) return
    Modal.confirm({
      title: `将选中的 ${selectedIds.length} 个岗位移至回收站？`,
      okText: '确定',
      cancelText: '取消',
      onOk: async () => {
        setBatchLoading(true)
        try {
          const res = await jobs.batchTrash(selectedIds as string[])
          message.success(res.data?.detail || `已移至回收站 ${selectedIds.length} 个岗位`)
          setSelectedIds([])
          loadData()
        } catch {
          message.error('批量删除失败')
        } finally {
          setBatchLoading(false)
        }
      },
    })
  }, [selectedIds, loadData])

  const handleBatchDelete = useCallback(() => {
    if (selectedIds.length === 0) return
    Modal.confirm({
      title: `永久删除选中的 ${selectedIds.length} 个岗位？`,
      content: '此操作不可撤销。',
      okText: '永久删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        setBatchLoading(true)
        try {
          const res = await jobs.batchDelete(selectedIds as string[])
          message.success(res.data?.detail || `已永久删除 ${selectedIds.length} 个岗位`)
          setSelectedIds([])
          loadData()
        } catch {
          message.error('批量删除失败')
        } finally {
          setBatchLoading(false)
        }
      },
    })
  }, [selectedIds, loadData])

  const handleBatchRestore = useCallback(async () => {
    if (selectedIds.length === 0) return
    setBatchLoading(true)
    try {
      const res = await jobs.batchRestore(selectedIds as string[])
      message.success(res.data?.detail || `已恢复 ${selectedIds.length} 个岗位`)
      setSelectedIds([])
      loadData()
    } catch {
      message.error('批量恢复失败')
    } finally {
      setBatchLoading(false)
    }
  }, [selectedIds, loadData])

  /* ── 表格渲染 ── */
  const renderJobCell = (job: JobRecord) => {
    const meta = CATEGORY_META[job.category || ''] || DEFAULT_CATEGORY_META
    const p = getJobParsed(job)
    const sub = [p.salary_range, p.location].filter(Boolean).join(' · ')
    return (
      <div className="job-title-cell">
        <div className="job-title-icon" style={{ background: `${meta.color}1A`, color: meta.color }}>
          {meta.icon}
        </div>
        <div className="job-title-main">
          <div className="job-title-name">
            {getJobTitle(job)}
            {job.is_primary && (
              <Tag style={{ marginLeft: 6, color: 'var(--warning-600)', backgroundColor: 'var(--warning-50)', fontSize: 11, lineHeight: '16px', padding: '0 6px' }}>
                默认
              </Tag>
            )}
          </div>
          <div className="job-title-sub">{sub || '暂无薪资 / 地点信息'}</div>
        </div>
      </div>
    )
  }

  const renderActionCell = (job: JobRecord) => {
    if (activeTab === 'trash') {
      return (
        <Space size={2}>
          <Tooltip title="恢复">
            <button className="job-action-btn" onClick={(e) => { e.stopPropagation(); handleRestore(job.id) }}>
              <UndoOutlined />
            </button>
          </Tooltip>
          <Tooltip title="永久删除">
            <button
              className="job-action-btn"
              style={{ color: 'var(--error-500)' }}
              onClick={(e) => { e.stopPropagation(); handlePermanentDelete(job.id) }}
            >
              <DeleteOutlined />
            </button>
          </Tooltip>
        </Space>
      )
    }
    const moreItems = [
      { key: 'preview', icon: <EyeOutlined />, label: '预览详情' },
      { key: 'primary', icon: <CrownOutlined />, label: job.is_primary ? '已是默认岗位' : '设为默认岗位', disabled: job.is_primary },
      { key: 'copy', icon: <CopyOutlined />, label: '复制岗位' },
      { type: 'divider' as const },
      { key: 'trash', icon: <DeleteOutlined />, label: '移入回收站', danger: true },
    ]
    return (
      <Space size={2}>
        <Tooltip title={job.is_favorite ? '取消收藏' : '收藏'}>
          <button
            className={`job-action-btn${job.is_favorite ? ' fav-active' : ''}`}
            onClick={(e) => { e.stopPropagation(); handleToggleFavorite(job.id) }}
          >
            {job.is_favorite ? <StarFilled /> : <StarOutlined />}
          </button>
        </Tooltip>
        <Tooltip title="编辑">
          <button className="job-action-btn" onClick={(e) => { e.stopPropagation(); openEdit(job) }}>
            <EditOutlined />
          </button>
        </Tooltip>
        <Tooltip title="一键投递该岗位">
          <button className="job-action-btn" onClick={(e) => { e.stopPropagation(); openApply(job) }}>
            <SendOutlined />
          </button>
        </Tooltip>
        <Dropdown
          trigger={['click']}
          menu={{
            items: moreItems,
            onClick: ({ key, domEvent }) => {
              domEvent.stopPropagation()
              if (key === 'preview') openPreview(job)
              else if (key === 'primary') handleSetPrimary(job.id)
              else if (key === 'copy') handleCopy(job.id)
              else if (key === 'trash') handleTrash(job.id)
            },
          }}
        >
          <button className="job-action-btn" onClick={(e) => e.stopPropagation()}>
            <EllipsisOutlined />
          </button>
        </Dropdown>
      </Space>
    )
  }

  const columns: ColumnsType<JobRecord> = [
    {
      title: '职位信息',
      key: 'info',
      render: (_, job) => renderJobCell(job),
    },
    {
      title: '公司信息',
      key: 'company',
      width: 180,
      render: (_, job) => {
        const p = getJobParsed(job)
        return (
          <div>
            <div className="job-company-name">{getJobCompany(job) || '—'}</div>
            <div className="job-company-sub">{p.industry || '未识别行业'}</div>
          </div>
        )
      },
    },
    {
      title: '创建时间',
      key: 'time',
      width: 170,
      render: (_, job) => (
        <div>
          <div className="job-time-main">{formatDate(job.created_at)}</div>
          <div className="job-time-sub">{activeTab === 'trash' ? '已删除' : (job.image_url ? '图片导入' : '手动创建')}</div>
        </div>
      ),
    },
    {
      title: '匹配度',
      key: 'match',
      width: 90,
      align: 'center',
      render: (_, job) => {
        const score = matchMap[job.id]
        if (activeTab === 'trash' || typeof score !== 'number') {
          return <span className="job-stage-sub">—</span>
        }
        return <MatchRing value={score} />
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      render: (_, job) => renderActionCell(job),
    },
  ]

  if (!token) return <AuthGate activeKey="jobs" />

  return (
    <AppLayout activeKey="jobs" title="岗位库 / 意向岗位">
      <div className="app-page-enter">
        {/* ── 顶部统计卡（纯仓库维度） ── */}
        <div className="jobs-stat-grid">
          {statCards.map((card) => {
            const active = activeTab === card.key
            return (
              <div
                key={card.key}
                className={`jobs-stat-card${active ? ' is-active' : ''}`}
                onClick={() => { setActiveTab(card.key); setSelectedIds([]) }}
              >
                <div className="jobs-stat-icon" style={{ background: `${card.color}1A`, color: card.color }}>
                  {card.icon}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="jobs-stat-label">{card.label}</div>
                  <div className="jobs-stat-value">{card.count}</div>
                  <div className="jobs-stat-delta">
                    共 {card.count} 个意向岗位
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Tab 行 + 导入 / 添加 ── */}
        <Tabs
          className="jobs-tabs"
          activeKey={activeTab}
          onChange={(key) => { setActiveTab(key); setSelectedIds([]) }}
          tabBarExtraContent={{
            right: (
              <Space>
                <Button icon={<DownloadOutlined />} onClick={() => setImportModalOpen(true)}>
                  导入职位
                </Button>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddModalOpen(true)}>
                  添加职位
                </Button>
              </Space>
            ),
          }}
          items={[
            { key: 'all', label: <span>全部岗位<span className="jobs-tab-count">({allJobs.length})</span></span> },
            { key: 'favorites', label: <span>收藏<span className="jobs-tab-count">({favCount})</span></span> },
            { key: 'trash', label: <span>回收站{activeTab === 'trash' ? <span className="jobs-tab-count">({list.length})</span> : null}</span> },
          ]}
        />

        {/* ── 搜索与筛选行（仓库维度：关键词 / 城市 / 分类） ── */}
        <div className="jobs-filter-row">
          <Input.Search
            placeholder="请输入职位名称、公司名称或关键词"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            onSearch={handleSearch}
            allowClear
            style={{ width: 300, maxWidth: '100%' }}
          />
          <Select
            placeholder="全部城市"
            value={cityFilter}
            onChange={(v) => setCityFilter(v)}
            allowClear
            style={{ minWidth: 110 }}
            options={cityOptions}
            notFoundContent="暂无城市数据"
          />
          <Select
            value={sortDir}
            onChange={(v) => setSortDir(v)}
            style={{ minWidth: 110 }}
            options={[
              { label: '创建时间：最新', value: 'desc' },
              { label: '创建时间：最早', value: 'asc' },
            ]}
          />
          <Dropdown
            trigger={['click']}
            menu={{
              selectedKeys: [categoryFilter],
              items: [{ key: '', label: '全部分类' }, ...CATEGORIES.map((c) => ({ key: c, label: c }))],
              onClick: ({ key }) => setCategoryFilter(key),
            }}
          >
            <Button icon={<FilterOutlined />}>
              {categoryFilter ? `分类：${categoryFilter}` : '更多筛选'}
            </Button>
          </Dropdown>
        </div>

        {/* ── 批量操作条 ── */}
        {selectedIds.length > 0 && (
          <div className="jobs-batch-bar">
            <span className="jobs-batch-bar-text">已选择 {selectedIds.length} 项</span>
            {activeTab === 'trash' ? (
              <>
                <Button size="small" loading={batchLoading} onClick={handleBatchRestore}>
                  批量恢复
                </Button>
                <Button size="small" danger loading={batchLoading} onClick={handleBatchDelete}>
                  批量永久删除
                </Button>
              </>
            ) : (
              <Button size="small" danger loading={batchLoading} onClick={handleBatchTrash}>
                批量移入回收站
              </Button>
            )}
            <Button size="small" type="text" onClick={() => setSelectedIds([])}>
              取消选择
            </Button>
          </div>
        )}

        {/* ── 职位表格 ── */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <Spin size="large" />
            <div style={{ marginTop: 12, color: 'var(--text-tertiary)', fontSize: 13 }}>加载中...</div>
          </div>
        ) : filtered.length === 0 ? (
          <Empty
            description={
              activeTab === 'trash' ? '回收站为空' :
              activeTab === 'favorites' ? '暂无收藏岗位' :
              searchQ || cityFilter || categoryFilter ? '没有符合条件的职位' :
              '还没有职位，请上传你的第一份职位'
            }
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ padding: '48px 0' }}
          >
            {activeTab === 'all' && !searchQ && !cityFilter && !categoryFilter && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddModalOpen(true)}>
                添加职位
              </Button>
            )}
          </Empty>
        ) : (
          <>
            <Table
              className="jobs-table"
              rowKey="id"
              columns={columns}
              dataSource={paged}
              pagination={false}
              rowSelection={{
                selectedRowKeys: selectedIds,
                onChange: (keys) => setSelectedIds(keys),
              }}
              onRow={(job) => ({
                onClick: () => { if (activeTab !== 'trash') openPreview(job) },
              })}
            />
            <div className="jobs-table-footer">
              <span className="jobs-table-total">共 {filtered.length} 条</span>
              <Pagination
                current={page}
                pageSize={pageSize}
                total={filtered.length}
                onChange={(p, ps) => { setPage(p); setPageSize(ps) }}
                showSizeChanger
                pageSizeOptions={[10, 20, 50]}
                showQuickJumper
              />
            </div>
          </>
        )}

        {/* 导入职位弹窗 */}
        <Modal
          title="导入职位（图片识别）"
          open={importModalOpen}
          onCancel={() => { setImportModalOpen(false); setImportList([]) }}
          width={760}
          destroyOnClose
          footer={[
            <Button key="cancel" onClick={() => { setImportModalOpen(false); setImportList([]) }}>取消</Button>,
            <Button
              key="confirm"
              type="primary"
              loading={importParsing}
              disabled={!importList.some((it) => it.status === 'done' && it.title.trim())}
              onClick={handleImportConfirm}
            >
              确认导入 {importList.filter((it) => it.status === 'done' && it.title.trim()).length} 个职位
            </Button>,
          ]}
        >
          <div className="job-import-body">
            <div className="job-import-drop">
              <UploadOutlined style={{ fontSize: 40, color: 'var(--primary-600)' }} />
              <div style={{ marginTop: 10 }}>
                <Typography.Text>上传职位截图，系统自动识别并批量导入</Typography.Text>
              </div>
              <div style={{ marginTop: 6 }}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  支持 PNG / JPG / JPEG / WebP，可一次选择多张；单张含多个岗位也可识别
                </Typography.Text>
              </div>
              <input
                type="file"
                id="import-job-input"
                accept=".png,.jpg,.jpeg,.webp"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => { handleImportFiles(e.target.files); e.target.value = '' }}
              />
              <Button
                type="primary"
                icon={<UploadOutlined />}
                loading={importParsing}
                style={{ marginTop: 14 }}
                onClick={() => document.getElementById('import-job-input')?.click()}
              >
                选择图片
              </Button>
            </div>

            {importList.length > 0 && (
              <div className="job-import-list">
                <div className="job-import-list-head">
                  已识别 {importList.filter((it) => it.status === 'done').length} 个职位（可编辑后导入）
                </div>
                {importList.map((it) => (
                  <div className="job-import-item" key={it.uid}>
                    {it.status === 'parsing' && (
                      <div className="job-import-item-parsing"><Spin size="small" /> 识别中...</div>
                    )}
                    {it.status === 'error' && (
                      <div className="job-import-item-error">
                        <span>识别失败：{it.error}</span>
                        <Button size="small" type="text" danger onClick={() => removeImportItem(it.uid)}>移除</Button>
                      </div>
                    )}
                    {it.status === 'done' && (
                      <div className="job-import-item-grid">
                        <Input
                          placeholder="职位标题"
                          value={it.title}
                          onChange={(e) => updateImportItem(it.uid, { title: e.target.value })}
                        />
                        <Input
                          placeholder="公司名称"
                          value={it.company}
                          onChange={(e) => updateImportItem(it.uid, { company: e.target.value })}
                        />
                        <Select
                          placeholder="分类"
                          value={it.category || undefined}
                          onChange={(v) => updateImportItem(it.uid, { category: v || '' })}
                          allowClear
                          style={{ width: '100%' }}
                          options={CATEGORIES.map((c) => ({ label: c, value: c }))}
                        />
                        <Input
                          placeholder="薪资范围"
                          value={it.salary_range}
                          onChange={(e) => updateImportItem(it.uid, { salary_range: e.target.value })}
                        />
                        <Input
                          placeholder="工作地点"
                          value={it.location}
                          onChange={(e) => updateImportItem(it.uid, { location: e.target.value })}
                        />
                        <Input
                          placeholder="行业"
                          value={it.industry}
                          onChange={(e) => updateImportItem(it.uid, { industry: e.target.value })}
                        />
                        <Button size="small" type="text" danger style={{ gridColumn: '1 / -1' }} onClick={() => removeImportItem(it.uid)}>
                          移除该职位
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>

        {/* 添加职位弹窗 */}
        <Modal
          title="添加职位"
          open={addModalOpen}
          onOk={handleAddSubmit}
          onCancel={() => setAddModalOpen(false)}
          okText="创建职位"
          cancelText="取消"
          confirmLoading={addLoading}
          destroyOnClose
        >
          <div className="job-add-form">
            <div className="job-add-row">
              <label>职位标题 *</label>
              <Input value={addForm.title} onChange={(e) => setAddForm((p) => ({ ...p, title: e.target.value }))} placeholder="如：Java 后端开发工程师" />
            </div>
            <div className="job-add-row">
              <label>公司名称</label>
              <Input value={addForm.company} onChange={(e) => setAddForm((p) => ({ ...p, company: e.target.value }))} placeholder="如：阿里巴巴" />
            </div>
            <div className="job-add-row">
              <label>分类</label>
              <Select
                value={addForm.category || undefined}
                onChange={(v) => setAddForm((p) => ({ ...p, category: v || '' }))}
                allowClear
                placeholder="选择分类"
                style={{ width: '100%' }}
                options={CATEGORIES.map((c) => ({ label: c, value: c }))}
              />
            </div>
            <div className="job-add-row job-add-row-2">
              <div>
                <label>薪资范围</label>
                <Input value={addForm.salary_range} onChange={(e) => setAddForm((p) => ({ ...p, salary_range: e.target.value }))} placeholder="如：20K-40K" />
              </div>
              <div>
                <label>工作地点</label>
                <Input value={addForm.location} onChange={(e) => setAddForm((p) => ({ ...p, location: e.target.value }))} placeholder="如：北京" />
              </div>
            </div>
            <div className="job-add-row">
              <label>行业</label>
              <Input value={addForm.industry} onChange={(e) => setAddForm((p) => ({ ...p, industry: e.target.value }))} placeholder="如：互联网" />
            </div>
            <div className="job-add-row">
              <label>岗位职责（每行一条）</label>
              <TextArea value={addForm.responsibilities} onChange={(e) => setAddForm((p) => ({ ...p, responsibilities: e.target.value }))} rows={3} placeholder={'负责后端核心系统设计与开发\n参与系统架构优化'} />
            </div>
            <div className="job-add-row job-add-row-2">
              <div>
                <label>必备要求（每行一条）</label>
                <TextArea value={addForm.must_have} onChange={(e) => setAddForm((p) => ({ ...p, must_have: e.target.value }))} rows={3} placeholder={'Python\nFastAPI / Django'} />
              </div>
              <div>
                <label>加分项（每行一条）</label>
                <TextArea value={addForm.nice_to_have} onChange={(e) => setAddForm((p) => ({ ...p, nice_to_have: e.target.value }))} rows={3} placeholder={'Kubernetes\n微服务架构'} />
              </div>
            </div>
            <div className="job-add-row">
              <label>备注</label>
              <TextArea value={addForm.user_remark} onChange={(e) => setAddForm((p) => ({ ...p, user_remark: e.target.value }))} rows={2} placeholder="添加备注信息" />
            </div>
          </div>
        </Modal>

        {/* 编辑弹窗（岗位库纯仓库：只编辑岗位本身，不含任何投递 / 面试状态） */}
        <Modal
          title="编辑职位信息"
          open={editModalOpen}
          onOk={handleSaveEdit}
          onCancel={() => { setEditModalOpen(false); setEditJob(null) }}
          okText="保存"
          cancelText="取消"
        >
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div>
              <Typography.Text>职位标题</Typography.Text>
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
          title={previewJob ? getJobTitle(previewJob) : '职位预览'}
          open={previewModalOpen}
          onCancel={() => { setPreviewModalOpen(false); setPreviewJob(null) }}
          footer={[
            <Button
              key="apply"
              type="primary"
              icon={<SendOutlined />}
              onClick={() => {
                if (previewJob) {
                  setPreviewModalOpen(false)
                  openApply(previewJob)
                }
              }}
            >
              一键投递
            </Button>,
            <Button key="close" onClick={() => { setPreviewModalOpen(false); setPreviewJob(null) }}>
              关闭
            </Button>,
          ]}
          width={800}
        >
          {previewJob && (
            <div>
              {previewJob.image_url && (
                <div style={{ textAlign: 'center', marginBottom: 16 }}>
                  <img
                    src={toBackendUrl(previewJob.image_url)}
                    alt="职位截图"
                    style={{ maxWidth: '100%', maxHeight: 360, borderRadius: 8, border: '1px solid var(--gray-100)' }}
                  />
                </div>
              )}
              <div style={{ marginBottom: 16 }}>
                {previewJob.company && <Tag style={{ color: 'var(--primary-600)', backgroundColor: 'var(--primary-50)' }}>{previewJob.company}</Tag>}
                {previewJob.category && <Tag style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--gray-100)' }}>{previewJob.category}</Tag>}
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
                            <Tag key={s} style={{ color: 'var(--error-600)', backgroundColor: 'var(--error-50)' }}>{s}</Tag>
                          ))}
                        </Space>
                      </>
                    )}
                    {niceSkills.length > 0 && (
                      <>
                        <Typography.Title level={5} style={{ marginTop: 16 }}>加分项</Typography.Title>
                        <Space wrap>
                          {niceSkills.map((s: string) => (
                            <Tag key={s} style={{ color: 'var(--success-600)', backgroundColor: 'var(--success-50)' }}>{s}</Tag>
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

        {/* 一键投递弹窗：岗位信息只读 + 选简历 + 选填附言（联系方式自动带出） */}
        <Modal
          title="投递该岗位"
          open={applyModalOpen}
          onOk={handleApplySubmit}
          onCancel={() => { setApplyModalOpen(false); setApplyJob(null) }}
          okText="确认投递"
          cancelText="取消"
          confirmLoading={applyLoading}
          destroyOnClose
        >
          {applyJob && (
            <div className="job-add-form">
              <div className="job-add-row">
                <label>投递岗位</label>
                <Input
                  value={`${getJobTitle(applyJob)}${getJobCompany(applyJob) ? ' @ ' + getJobCompany(applyJob) : ''}`}
                  disabled
                />
              </div>
              <div className="apps-applicant-hint">
                投递人信息将自动取自你的个人资料：
                <span className="apps-applicant-hint-name">
                  {profile?.nickname || profile?.email || '—'}
                </span>
                <span className="apps-applicant-hint-sub">
                  {profile?.email || ''}{profile?.phone ? ` · ${profile.phone}` : ' · 未绑定手机'}
                </span>
                <span className="apps-applicant-hint-tip">如需修改，请前往「个人中心」</span>
              </div>
              <div className="job-add-row">
                <label>投递简历（可选）</label>
                <Select
                  value={applyForm.resume_id || undefined}
                  onChange={(v) => { setApplyForm((p) => ({ ...p, resume_id: v || '' })); setGuidePack(null) }}
                  allowClear
                  placeholder="选择要投递的简历"
                  style={{ width: '100%' }}
                  options={resumeOptions}
                  notFoundContent="暂无简历"
                />
              </div>
              <div className="job-add-row">
                <label>HR 接收邮箱（选填）</label>
                <Input
                  value={applyForm.recipient_email}
                  onChange={(e) => setApplyForm((p) => ({ ...p, recipient_email: e.target.value }))}
                  placeholder={contactHint?.email ? '已从岗位信息中识别，可修改' : '填写招聘方邮箱将真实邮件投递；留空则仅登记记录'}
                  allowClear
                />
                {contactHint && !contactHint.smtp_configured && (
                  <div className="apps-applicant-hint-tip" style={{ marginTop: 4 }}>
                    当前未配置发件邮箱（SMTP），投递将以演示模式记录流程，不会真正出网。
                  </div>
                )}
                {contactHint && (
                  <div className="apps-applicant-hint-tip" style={{ marginTop: 4 }}>
                    今日已投递 {contactHint.sent_today}/{contactHint.daily_limit} 封
                  </div>
                )}
              </div>
              <div className="job-add-row">
                <label>官网投递链接（选填，阶段3）</label>
                <Space.Compact style={{ width: '100%' }}>
                  <Input
                    value={applyForm.apply_url}
                    onChange={(e) => { setApplyForm((p) => ({ ...p, apply_url: e.target.value })); setFormProbe(null) }}
                    placeholder={contactHint?.apply_url ? '已从岗位信息中识别，可修改' : '填写公司官网/ATS 投递页链接，走表单半自动投递'}
                    allowClear
                  />
                  <Button onClick={handleProbeForm} loading={formProbing} disabled={!applyForm.apply_url.trim()}>
                    检测表单
                  </Button>
                </Space.Compact>
                {formProbe && (
                  <div className="apps-applicant-hint-tip" style={{ marginTop: 4 }}>
                    {formProbe.robots_allowed ? (
                      <>
                        <span style={{ color: '#52c41a' }}>✓ robots 允许</span>
                        {formProbe.form_detected
                          ? `；识别到 ${formProbe.fields.length} 个可预填字段（${formProbe.fields.map((f) => f.kind).join('、')}）`
                          : `；${formProbe.detail || '未识别到静态表单'}`}
                      </>
                    ) : (
                      <span style={{ color: '#ff4d4f' }}>
                        ✕ {formProbe.detail || 'robots.txt 禁止自动访问，请改用其它投递方式'}
                      </span>
                    )}
                  </div>
                )}
                <div className="apps-applicant-hint-tip" style={{ marginTop: 4 }}>
                  表单投递为半自动：系统仅帮你预填，提交前你可在浏览器中核对并手动点击提交。
                </div>
              </div>
              <div className="job-add-row">
                <label>平台引导投递（一键准备包）</label>
                <Checkbox
                  checked={applyForm.guide}
                  onChange={(e) => {
                    const on = e.target.checked
                    setApplyForm((p) => ({ ...p, guide: on }))
                    if (on && applyJob) fetchGuidePack(applyJob.id, applyForm.resume_id || undefined)
                  }}
                >
                  <span style={{ fontSize: 13 }}>
                    生成「准备包」：平台岗位深链 + 简历文本一键复制，由你前往官方平台完成投递（本应用不代替你提交）
                  </span>
                </Checkbox>
                {applyForm.guide && (
                  <div style={{ marginTop: 8 }}>
                    {guidePack ? (
                      <Space direction="vertical" size={4} style={{ width: '100%' }}>
                        <Typography.Text style={{ fontSize: 13 }}>
                          已识别平台：<b>{guidePack.platform_name}</b>
                          {guidePack.link_source === 'platform_search' && '（岗位信息中未找到平台链接，已生成平台搜索页）'}
                        </Typography.Text>
                        <Space wrap>
                          <Button
                            size="small"
                            icon={<SendOutlined />}
                            onClick={() => window.open(guidePack.deep_link, '_blank')}
                          >
                            打开平台岗位页
                          </Button>
                          <Button
                            size="small"
                            icon={<CopyOutlined />}
                            disabled={!guidePack.resume_text}
                            onClick={() => copyText(guidePack.resume_text, '简历文本已复制，可直接粘贴到平台输入框')}
                          >
                            复制简历文本{guidePack.resume_title ? `（${guidePack.resume_title}）` : ''}
                          </Button>
                          {applyForm.cover_letter.trim() !== '' && (
                            <Button
                              size="small"
                              icon={<CopyOutlined />}
                              onClick={() => copyText(applyForm.cover_letter.trim(), '附言已复制')}
                            >
                              复制附言
                            </Button>
                          )}
                        </Space>
                      </Space>
                    ) : (
                      <Button
                        size="small"
                        loading={guideLoading}
                        onClick={() => applyJob && fetchGuidePack(applyJob.id, applyForm.resume_id || undefined)}
                      >
                        生成准备包
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {applyTemplates.length > 0 && (
                <div className="job-add-row">
                  <label>附言模板</label>
                  <Select
                    value={undefined}
                    onChange={(v) => v && applyJob && handlePickTemplate(v, getJobTitle(applyJob), getJobCompany(applyJob))}
                    placeholder="选择模板快速填写附言（可再编辑）"
                    style={{ width: '100%' }}
                    allowClear={false}
                    options={applyTemplates.map((t) => ({
                      label: t.is_default ? `${t.name}（默认）` : t.name, value: t.id,
                    }))}
                  />
                </div>
              )}
              <div className="job-add-row">
                <label>附言 / 求职信（可选）</label>
                <TextArea
                  value={applyForm.cover_letter}
                  onChange={(e) => setApplyForm((p) => ({ ...p, cover_letter: e.target.value }))}
                  rows={3}
                  placeholder="简单介绍自己，或补充说明你想对招聘方说的话"
                />
              </div>
              {(applyForm.recipient_email.trim() !== '' || applyForm.apply_url.trim() !== '' || applyForm.guide) && (
                <div className="job-add-row">
                  <Checkbox
                    checked={applyForm.consent_given}
                    onChange={(e) => setApplyForm((p) => ({ ...p, consent_given: e.target.checked }))}
                  >
                    <span style={{ fontSize: 13 }}>
                      {applyForm.guide
                        ? '我知悉我将自行前往上述平台完成投递：本应用仅生成深链与简历文本供我手动使用，不会代替我向平台提交任何信息。'
                        : applyForm.apply_url.trim() !== ''
                          ? '我同意将我的简历与联系方式（姓名 / 邮箱 / 电话）提交至上述官网投递页面用于该岗位应聘。'
                          : '我同意将我的简历与联系方式（姓名 / 邮箱 / 电话）发送至上述邮箱用于该岗位应聘。'}
                      依据《个人信息保护法》，向第三方提供个人信息需单独取得你的同意。
                    </span>
                  </Checkbox>
                </div>
              )}
            </div>
          )}
        </Modal>

        {/* ── 批量投递弹窗（阶段2） ── */}
        <Modal
          title={`批量投递（${selectedIds.length > 10 ? 10 : selectedIds.length} 个岗位）`}
          open={batchApplyOpen}
          onOk={handleBatchApplySubmit}
          onCancel={() => setBatchApplyOpen(false)}
          okText="确认批量投递"
          cancelText="取消"
          confirmLoading={batchApplyLoading}
          destroyOnClose
        >
          <div className="job-add-form">
            <div className="apps-applicant-hint">
              投递人信息将自动取自你的个人资料：
              <span className="apps-applicant-hint-name">
                {profile?.nickname || profile?.email || '—'}
              </span>
              <span className="apps-applicant-hint-tip">
                系统将逐个岗位投递并受每日额度限制；已投递过的岗位自动跳过。
              </span>
            </div>
            <div className="job-add-row">
              <label>投递简历（可选，批量共用）</label>
              <Select
                value={batchForm.resume_id || undefined}
                onChange={(v) => setBatchForm((p) => ({ ...p, resume_id: v || '' }))}
                allowClear
                placeholder="选择要投递的简历"
                style={{ width: '100%' }}
                options={resumeOptions}
                notFoundContent="暂无简历"
              />
            </div>
            <div className="job-add-row">
              <label>各岗位 HR 接收邮箱（识别自动填入，可修改；清空则该岗位仅登记记录）</label>
              {selectedIds.slice(0, 10).map(String).map((id) => {
                const job = list.find((j) => j.id === id)
                const hint = batchHints[id]
                return (
                  <div key={id} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                    <span style={{ flex: '0 0 200px', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={job ? `${getJobTitle(job)}${getJobCompany(job) ? ' @ ' + getJobCompany(job) : ''}` : id}>
                      {job ? getJobTitle(job) : id}
                    </span>
                    <Input
                      size="small"
                      value={batchEmails[id] ?? ''}
                      onChange={(e) => setBatchEmails((p) => ({ ...p, [id]: e.target.value }))}
                      placeholder={hint?.email ? '已识别' : '未识别到，可手填'}
                      allowClear
                    />
                  </div>
                )
              })}
            </div>
            {applyTemplates.length > 0 && (
              <div className="job-add-row">
                <label>附言模板</label>
                <Select
                  value={undefined}
                  onChange={(v) => v && handlePickTemplate(v, '', '')}
                  placeholder="选择模板快速填写附言（批量共用，可再编辑）"
                  style={{ width: '100%' }}
                  allowClear={false}
                  options={applyTemplates.map((t) => ({
                    label: t.is_default ? `${t.name}（默认）` : t.name, value: t.id,
                  }))}
                />
              </div>
            )}
            <div className="job-add-row">
              <label>附言 / 求职信（可选，批量共用）</label>
              <TextArea
                value={batchForm.cover_letter}
                onChange={(e) => setBatchForm((p) => ({ ...p, cover_letter: e.target.value }))}
                rows={3}
                placeholder="批量投递共用同一份附言"
              />
            </div>
            {Object.values(batchEmails).some((v) => v && v.trim() !== '') && (
              <div className="job-add-row">
                <Checkbox
                  checked={batchForm.consent_given}
                  onChange={(e) => setBatchForm((p) => ({ ...p, consent_given: e.target.checked }))}
                >
                  <span style={{ fontSize: 13 }}>
                    我同意将我的简历与联系方式（姓名 / 邮箱 / 电话）发送至上述各岗位对应邮箱用于应聘。
                    依据《个人信息保护法》，向第三方提供个人信息需单独取得你的同意。
                  </span>
                </Checkbox>
              </div>
            )}
          </div>
        </Modal>
      </div>
    </AppLayout>
  )
}
