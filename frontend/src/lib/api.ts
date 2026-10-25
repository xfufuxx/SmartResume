import axios from 'axios'

import type { InterviewTrackPayload, ApplicationPayload, CommunicationPayload, AssessmentSubmit } from '@/types'
import { getToken, setAuthTokens, clearAuth } from '@/lib/auth'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

/** 暴露 base URL：可视化排版编辑器预览要拉取后端中文字体（与 PDF 同一份 Noto Sans SC） */
export const API_BASE_URL = API_BASE

const api = axios.create({
  baseURL: API_BASE,
  timeout: 20000,
})

/** 将相对路径（如 uploads/...）补全为后端完整 URL，已是完整 URL 则原样返回 */
export function toBackendUrl(url: string | undefined | null): string {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return `${API_BASE}/${url}`
}

// 单飞刷新：多个并发 401 只触发一次 /api/auth/refresh
let refreshPromise: Promise<boolean> | null = null

// 用于刷新 token 的独立 axios 实例：不带任何请求/响应拦截器。
// 关键修复：刷新请求若再次经过带鉴权的拦截器会自陷死锁
// （刷新请求在自身的请求拦截器里 await 正在发送中的自己），因此必须用“干净”实例发起。
const refreshApi = axios.create({
  baseURL: API_BASE,
  timeout: 20000,
})

/**
 * 单飞刷新：并发调用只发一次 /api/auth/refresh，成功则双 token 轮换写回。
 * 两个调用方：响应拦截器（收到真实 401 后被动刷新）与根 layout 的
 * AuthGatekeeper（启动时主动静默刷新）。失败时清除登录态但不跳转，
 * 跳转由调用方决定（拦截器硬跳 /login；门 replace('/login')）。
 */
export async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    const refreshToken = localStorage.getItem('refreshToken')
    if (!refreshToken) return false
    try {
      const res = await refreshApi.post('/api/auth/refresh', { refresh_token: refreshToken })
      const { access_token, refresh_token } = res.data || {}
      // setAuthTokens：localStorage + cookie 镜像同步（middleware 认 cookie）
      if (access_token) setAuthTokens(access_token, refresh_token)
      return true
    } catch {
      // 刷新失败（refresh 过期/被吊销）→ 清除登录态（含 cookie 镜像）
      clearAuth()
      return false
    } finally {
      refreshPromise = null
    }
  })()
  return refreshPromise
}

// 认证类端点：它们的 401 代表「凭证错误」（密码错/账号不存在/验证码错），
// 应由页面自己的 catch 显示提示。绝不能进入下面的刷新/跳转分支——
// 否则管理端登录失败会被拦截器静默弹到用户登录页（admin 登录无 refreshToken，
// 必然走进 clearAuthAndRedirect），用户完全看不到真实错误。
const AUTH_ENDPOINTS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/verify',
  '/api/admin/login',
]

function isAuthRequest(url?: string): boolean {
  if (!url) return false
  return AUTH_ENDPOINTS.some((p) => url.includes(p))
}

/**
 * 管理端接口判断：/api/admin/...（/api/admin/login 属 AUTH_ENDPOINTS，已在前面豁免）。
 * 用户端接口（/api/messages、/api/user/*、/api/resumes 等）走 get_current_user，
 * 其 sub 必须在 users 表中存在；管理会话的 JWT sub 是 admins 表 id，必然 401。
 */
function isAdminEndpointUrl(url?: string): boolean {
  if (!url) return false
  return url.includes('/api/admin/')
}

function clearAuthAndRedirect(failedUrl?: string) {
  // 管理员会话（admins JWT，无 refreshToken 体系）：失效时回管理端自己的登录页，
  // 而不是用户端 /login——否则管理后台一遇到 401 就被弹到用户登录页。
  const isAdminSession =
    typeof window !== 'undefined' && !!localStorage.getItem('admin')
  // 管理会话 + 用户端接口 401 = 「用错令牌类型」，不是「会话失效」：
  // 历史 bug —— /admin 加载态曾渲染 AppLayout，其 MessageBell 挂载即打
  // /api/messages（用户端），管理 token 必然 401 → 会话被清 → 弹回登录页，
  // 表现为「登录成功进首页一秒后被弹走」。此时绝不能清会话，原样拒绝让页面自己提示。
  if (isAdminSession && !isAdminEndpointUrl(failedUrl)) return
  clearAuth()
  if (isAdminSession) localStorage.removeItem('admin')
  if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
    window.location.href = isAdminSession ? '/admin/login' : '/login'
  }
}

// 请求拦截器：仅同步附加当前 token，不做任何 await —— 避免阻塞导航与数据请求
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  }
  return config
})

// 把 FastAPI 返回的 detail 规范成字符串，避免 message.error(对象/数组)
// 触发 “Objects are not valid as a React child (found: object with keys ...)”。
// FastAPI 422 的 detail 形如 [{type, loc, msg, input, ctx}]，直接渲染会崩。
function normalizeErrorDetail(err: any) {
  let data = err?.response?.data
  // 500/502 等场景 body 常是纯文本/HTML（如 "Internal Server Error"），没有 .detail；
  // 且给字符串属性赋值会再抛 TypeError，把真实错误吞掉。统一转成 { detail } 对象。
  if (typeof data === 'string') {
    const text = data.trim()
    data = err.response.data = {
      detail:
        text && text.length < 200 && !text.startsWith('<')
          ? text
          : '服务器开小差了，请稍后重试',
    }
  }
  if (!data || typeof data !== 'object') return
  const detail = data.detail
  if (typeof detail === 'string') return
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d: any) => {
        if (!d) return ''
        const loc = Array.isArray(d.loc)
          ? d.loc.filter((x: any) => x !== 'body').join('.')
          : ''
        const m =
          d && typeof d === 'object' && typeof d.msg === 'string' ? d.msg : String(d)
        return loc ? `${loc}: ${m}` : m
      })
      .filter(Boolean)
    data.detail = msgs.length ? msgs.join('；') : '请求参数有误'
  } else if (detail && typeof detail === 'object') {
    data.detail =
      typeof (detail as any).msg === 'string'
        ? (detail as any).msg
        : JSON.stringify(detail)
  } else if (detail == null) {
    data.detail = '请求失败，请稍后重试'
  } else {
    data.detail = String(detail)
  }
}

// 响应拦截器：仅在收到真实 401 时单飞刷新一次并重放原请求（刷新走 refreshApi，无死锁）
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    // 先规范错误信息，保证下游 message.error 永远拿到字符串
    normalizeErrorDetail(err)
    const original: any = err.config || {}
    if (
      err.response?.status === 401 &&
      typeof window !== 'undefined' &&
      !original._retry &&
      !isAuthRequest(original.url)
    ) {
      if (!localStorage.getItem('refreshToken')) {
        clearAuthAndRedirect(original.url)
      } else {
        original._retry = true
        const ok = await refreshAccessToken()
        if (ok) {
          const newToken = localStorage.getItem('token')
          if (newToken) {
            original.headers = original.headers || {}
            original.headers.Authorization = `Bearer ${newToken}`
          }
          return api(original)
        }
        clearAuthAndRedirect(original.url)
      }
    }
    return Promise.reject(err)
  },
)

export default api

export const auth = {
  sendCode: (email: string, purpose = 'register') =>
    api.post('/api/auth/send-code', { email, purpose }),
  register: (email: string, password: string, code: string) =>
    api.post('/api/auth/register', { email, password, code }),
  login: (email: string, password: string, deviceId?: string) =>
    api.post('/api/auth/login', { email, password, device_id: deviceId || undefined }),
  /** 启动 QQ 登录：拿 QQ 授权页 URL（后端持有 appid，前端只负责跳转） */
  qqAuthorize: () =>
    api.get<{ authorize_url: string }>('/api/auth/qq/authorize'),
  refresh: (refreshToken: string) =>
    api.post('/api/auth/refresh', { refresh_token: refreshToken }),
  logout: () => api.post('/api/auth/logout'),
  forgotSendCode: (email: string) =>
    api.post('/api/auth/forgot-password/send-code', { email }),
  resetPassword: (email: string, code: string, newPassword: string) =>
    api.post('/api/auth/forgot-password/reset', { email, code, new_password: newPassword }),
  changePassword: (oldPassword: string, newPassword: string) =>
    api.post('/api/auth/change-password', { old_password: oldPassword, new_password: newPassword }),
  getDevices: () => api.get('/api/auth/devices'),
  removeDevice: (id: string) => api.delete(`/api/auth/devices/${id}`),
  bindPhone: (phone: string) => api.post('/api/auth/bind-phone', { phone }),
  unbindPhone: (password: string) => api.post('/api/auth/unbind-phone', { password }),
  deleteAccount: () => api.post('/api/auth/delete-account'),
}

export const user = {
  getProfile: () => api.get('/api/user/profile'),
  updateProfile: (data: { nickname?: string; career_state?: string }) =>
    api.put('/api/user/profile', data),
  updateExpectation: (data: {
    industries?: string[]; job_title?: string; salary_range?: string; cities?: string[]
  }) => api.put('/api/user/expectation', data),
  uploadAvatar: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post('/api/user/avatar', form)
  },
  agreePrivacy: () => api.post('/api/user/privacy/agree'),
  exportData: () => api.get('/api/user/export-data'),
  syncSavedTexts: () => api.post('/api/user/sync-saved-texts'),
  updateSavedTexts: (data: { resume_text?: string; job_text?: string }) =>
    api.put('/api/user/saved-texts', data),
}

export const messages = {
  list: (page = 1, pageSize = 20, unreadOnly = false) =>
    api.get('/api/messages', { params: { page, page_size: pageSize, unread_only: unreadOnly } }),
  markRead: (id: string) => api.put(`/api/messages/${id}/read`),
  markUnread: (id: string) => api.put(`/api/messages/${id}/unread`),
  markAllRead: () => api.put('/api/messages/read-all'),
  delete: (id: string) => api.delete(`/api/messages/${id}`),
}

export const admin = {
  login: (username: string, password: string) =>
    api.post('/api/admin/login', { username, password }),
  getUsers: (page = 1, pageSize = 20, search = '', status = '') =>
    api.get('/api/admin/users', { params: { page, page_size: pageSize, search, status_filter: status } }),
  getUserDetail: (id: string) => api.get(`/api/admin/users/${id}`),
  banUser: (id: string, reason: string, durationDays?: number) =>
    api.put(`/api/admin/users/${id}/ban`, { reason, duration_days: durationDays }),
  unbanUser: (id: string) => api.put(`/api/admin/users/${id}/unban`),
  setVip: (id: string, isPaid: boolean, dailyLimit?: number, monthlyLimit?: number) =>
    api.put(`/api/admin/users/${id}/vip`, { is_paid: isPaid, daily_limit: dailyLimit, monthly_limit: monthlyLimit }),
  addUserQuota: (id: string, amount: number, reason = '') =>
    api.post(`/api/admin/users/${id}/quota`, { amount, reason }),

  getDashboardCore: () => api.get('/api/admin/dashboard/core'),
  getDashboardIndustry: () => api.get('/api/admin/dashboard/industry'),
  getDashboardMatchImprovement: (days = 30) => api.get('/api/admin/dashboard/match_improvement', { params: { days } }),
  getDashboardFeatureUsage: () => api.get('/api/admin/dashboard/feature_usage'),
  getDashboardJobTrending: () => api.get('/api/admin/dashboard/job_trending'),
  getDashboardSatisfaction: (days = 30) => api.get('/api/admin/dashboard/satisfaction', { params: { days } }),

  getTemplates: () => api.get('/api/admin/templates'),
  createTemplate: (name: string, description = '', htmlContent = '', cssContent = '') =>
    api.post('/api/admin/templates', { name, description, html_content: htmlContent, css_content: cssContent }),
  updateTemplate: (id: string, data: { is_active?: boolean; is_default?: boolean; name?: string; html_content?: string; css_content?: string }) =>
    api.put(`/api/admin/templates/${id}`, data),
  deleteTemplate: (id: string) => api.delete(`/api/admin/templates/${id}`),

  getKeywords: (industry = '', category = '') =>
    api.get('/api/admin/keywords', { params: { industry, category } }),
  createKeyword: (keyword: string, industry = '通用', category = 'hard_skill') =>
    api.post('/api/admin/keywords', { keyword, industry, category }),
  batchImportKeywords: (keywords: Array<{ keyword: string; industry: string; category: string }>) =>
    api.post('/api/admin/keywords/batch', { keywords }),
  updateKeyword: (id: string, isActive: boolean) =>
    api.put(`/api/admin/keywords/${id}`, { is_active: isActive }),
  deleteKeyword: (id: string) => api.delete(`/api/admin/keywords/${id}`),

  getAtsRules: () => api.get('/api/admin/ats-rules'),
  createAtsRule: (name: string, pattern: string, severity = 'warning', description = '') =>
    api.post('/api/admin/ats-rules', { name, pattern, severity, description }),
  updateAtsRule: (id: string, data: { is_active?: boolean; severity?: string }) =>
    api.put(`/api/admin/ats-rules/${id}`, data),
  deleteAtsRule: (id: string) => api.delete(`/api/admin/ats-rules/${id}`),

  getPrompts: (name = '', scene = '') =>
    api.get('/api/admin/prompts', { params: { name, scene } }),
  createPrompt: (name: string, scene: string, content: string, variables?: any) =>
    api.post('/api/admin/prompts', { name, scene, content, variables }),
  getPromptDetail: (id: string) => api.get(`/api/admin/prompts/${id}`),
  deployPrompt: (id: string, grayRatio: number) =>
    api.post(`/api/admin/prompts/${id}/deploy`, { gray_ratio: grayRatio }),
  rollbackPrompt: (name: string, scene: string, targetVersion: number) =>
    api.post('/api/admin/prompts/rollback', { name, scene, target_version: targetVersion }),

  getModels: () => api.get('/api/admin/models'),
  updateModel: (id: string, data: { weight?: number; rate_limit_per_minute?: number; is_enabled?: boolean; tier?: string }) =>
    api.put(`/api/admin/models/${id}`, data),
  getCallLogs: (page = 1, pageSize = 50, modelName = '', isSuccess?: boolean) =>
    api.get('/api/admin/models/call-logs', { params: { page, page_size: pageSize, model_name: modelName, is_success: isSuccess } }),

  getTaskStats: () => api.get('/api/admin/tasks/stats'),
  getFailedTasks: (page = 1, pageSize = 50) =>
    api.get('/api/admin/tasks/failed', { params: { page, page_size: pageSize } }),
  retryTasks: (taskIds: string[]) =>
    api.post('/api/admin/tasks/retry', taskIds),

  getFeedbacks: (page = 1, pageSize = 20, minScore?: number, maxScore?: number) =>
    api.get('/api/admin/feedbacks', { params: { page, page_size: pageSize, min_score: minScore, max_score: maxScore } }),
  getFeedbackClustering: (days = 7) =>
    api.get('/api/admin/feedbacks/clustering', { params: { days } }),

  getTickets: (page = 1, pageSize = 20, status = '', priority = '', category = '') =>
    api.get('/api/admin/tickets', { params: { page, page_size: pageSize, status, priority, category } }),
  getTicketDetail: (id: string) => api.get(`/api/admin/tickets/${id}`),
  replyTicket: (id: string, content: string, isInternal = false) =>
    api.post(`/api/admin/tickets/${id}/reply`, { content, is_internal: isInternal }),
  updateTicketStatus: (id: string, status: string, resolution?: string) =>
    api.put(`/api/admin/tickets/${id}/status`, { status, resolution }),

  getQuotaConfig: () => api.get('/api/admin/quota/config'),
  getOrders: (page = 1, pageSize = 20, status = '', userSearch = '') =>
    api.get('/api/admin/orders', { params: { page, page_size: pageSize, status, user_search: userSearch } }),
  refundOrder: (id: string, reason = '') =>
    api.post(`/api/admin/orders/${id}/refund`, { reason }),
  getRevenue: (days = 30) =>
    api.get('/api/admin/revenue', { params: { days } }),
  getPackages: () => api.get('/api/admin/packages'),
  createPackage: (name: string, packageType: string, price: number, durationDays?: number, quotaAmount?: number) =>
    api.post('/api/admin/packages', { name, package_type: packageType, price, duration_days: durationDays, quota_amount: quotaAmount }),
  updatePackage: (id: string, data: { is_active?: boolean; price?: number }) =>
    api.put(`/api/admin/packages/${id}`, data),
  getAdminLogs: (page = 1, pageSize = 50, action = '', adminId = '') =>
    api.get('/api/admin/admin-logs', { params: { page, page_size: pageSize, action, admin_id: adminId } }),
}

export const resumes = {
  upload: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post('/api/resumes/upload', form)
  },
  list: () => api.get('/api/resumes/'),
  stats: () => api.get('/api/resumes/stats'),
  get: (id: string) => api.get(`/api/resumes/${id}`),
  /** 简历版本树：原始版 → 各岗位优化版 → 微调链 */
  versionTree: (id: string) => api.get(`/api/resumes/${id}/version-tree`),
  create: (title?: string, sourceResumeId?: string) =>
    api.post('/api/resumes/', { title: title || null, source_resume_id: sourceResumeId || null }),
  update: (id: string, title: string) =>
    api.put(`/api/resumes/${id}`, { title }),
  setPrimary: (id: string) => api.put(`/api/resumes/${id}/primary`),
  toggleFavorite: (id: string, favorite: boolean) =>
    api.post(`/api/resumes/${id}/favorite`, { favorite }),
  delete: (id: string) => api.delete(`/api/resumes/${id}`),
  batchDelete: (ids: string[]) => api.post('/api/resumes/batch-delete', { ids }),
  trash: () => api.get('/api/resumes/trash'),
  restore: (id: string) => api.post(`/api/resumes/${id}/restore`),
  batchRestore: (ids: string[]) => api.post('/api/resumes/batch-restore', { ids }),
}

/** 简历解析导入：parse 只解析不落库（预览），apply 确认后落库并可用于一键优化 */
export const resumeImport = {
  parse: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post('/api/resume-import/parse', form)
  },
  apply: (body: {
    parsed_json: Record<string, unknown>
    raw_text?: string
    file_type?: string
    title?: string
  }) => api.post('/api/resume-import/apply', body),
}

export const jobs = {
  upload: (file: File, useOcr = false) => {
    const form = new FormData()
    form.append('file', file)
    return api.post(`/api/jobs/upload?use_ocr=${useOcr}`, form)
  },
  /** 手动创建职位（填写字段，无需图片） */
  create: (data: {
    title: string
    company?: string
    category?: string
    user_remark?: string
    image_url?: string
    parsed_job_json?: Record<string, unknown>
  }) => api.post('/api/jobs/create', data),
  /** 上传职位图片：仅识别解析、不入库，返回结构化职位数据供预览确认 */
  parseImage: (file: File, useOcr = false) => {
    const form = new FormData()
    form.append('file', file)
    return api.post(`/api/jobs/parse-image?use_ocr=${useOcr}`, form)
  },
  /** 批量创建职位（导入确认后落库） */
  batchCreate: (jobs: Array<{
    title: string
    company?: string
    category?: string
    user_remark?: string
    image_url?: string
    parsed_job_json?: Record<string, unknown>
  }>) => api.post('/api/jobs/batch-create', { jobs }),
  list: (q = '', category = '') =>
    api.get('/api/jobs/', { params: { q, category } }),
  get: (id: string) => api.get(`/api/jobs/${id}`),
  update: (id: string, data: { title?: string; company?: string; category?: string; status?: string; user_remark?: string }) =>
    api.put(`/api/jobs/${id}`, data),
  setPrimary: (id: string) => api.put(`/api/jobs/${id}/primary`),
  toggleFavorite: (id: string) => api.post(`/api/jobs/${id}/favorite`),
  copy: (id: string) => api.post(`/api/jobs/${id}/copy`),
  trash: (id: string) => api.post(`/api/jobs/${id}/trash`),
  restore: (id: string) => api.post(`/api/jobs/${id}/restore`),
  getFavorites: () => api.get('/api/jobs/favorites'),
  getTrash: () => api.get('/api/jobs/trash'),
  categories: () => api.get('/api/jobs/categories'),
  delete: (id: string) => api.delete(`/api/jobs/${id}`),
  batchTrash: (ids: string[]) => api.post('/api/jobs/batch-trash', { ids }),
  batchDelete: (ids: string[]) => api.post('/api/jobs/batch-delete', { ids }),
  batchRestore: (ids: string[]) => api.post('/api/jobs/batch-restore', { ids }),
}

export const optimize = {
  run: (resumeId: string, jobImageId: string, customInstructions?: string) =>
    api.post('/api/optimize/', {
      resume_id: resumeId,
      job_image_id: jobImageId,
      custom_instructions: customInstructions || null,
    }),
  runAsync: (resumeId: string, jobImageId: string, customInstructions?: string, template?: string, signal?: AbortSignal) =>
    api.post('/api/optimize/async', {
      resume_id: resumeId,
      job_image_id: jobImageId,
      custom_instructions: customInstructions || null,
      template: template || null,
    }, { signal }),
  /** 一键优化：使用个人中心保存的简历文本和岗位文本直接优化 */
  quick: (resumeText: string, jobText: string, customInstructions?: string, template?: string, signal?: AbortSignal) =>
    api.post('/api/optimize/quick', {
      resume_text: resumeText,
      job_text: jobText,
      custom_instructions: customInstructions || null,
      template: template || 'professional',
    }, { signal }),
  getTaskStatus: (taskId: string) =>
    api.get(`/api/optimize/async/${taskId}`),
  /** 停止进行中的异步任务（AI 优化 / 一键优化 / PDF 渲染），立即中断并回到可操作状态 */
  cancelTask: (taskId: string) =>
    api.post(`/api/optimize/async/${taskId}/cancel`),
  list: (q = '', category = '') =>
    api.get('/api/optimize/', { params: { q, category } }),
  get: (id: string) => api.get(`/api/optimize/${id}`),
  delete: (id: string) => api.delete(`/api/optimize/${id}`),
  toggleFavorite: (id: string) => api.post(`/api/optimize/${id}/favorite`),
  getFavorites: () => api.get('/api/optimize/favorites'),
  trash: (id: string) => api.post(`/api/optimize/${id}/trash`),
  restore: (id: string) => api.post(`/api/optimize/${id}/restore`),
  getTrash: () => api.get('/api/optimize/trash'),
  diff: (id1: string, id2: string) =>
    api.get('/api/optimize/diff', { params: { id1, id2 } }),
  categories: () => api.get('/api/optimize/categories'),
  feedback: (id: string, score: number, text?: string) =>
    api.post(`/api/optimize/${id}/feedback`, { satisfaction_score: score, feedback_text: text || null }),
  /** AI 修改逐条确认：获取条/点级变更清单 */
  changes: (id: string) => api.get(`/api/optimize/${id}/changes`),
  /** AI 修改逐条确认：应用决策，生成「人工确认版」新记录 */
  applyChanges: (id: string, decisions: { id: string; action: 'accept' | 'reject'; text?: string | null }[]) =>
    api.post(`/api/optimize/${id}/changes/apply`, { decisions }),
}

export const scoring = {
  getScore: (resumeId: string, jobId?: string) =>
    api.get(`/api/resume/${resumeId}/score`, { params: jobId ? { job_id: jobId } : {} }),
  getTrending: (days = 7) => api.get('/api/scoring/jobs/trending', { params: { days } }),
}

export const matching = {
  calculate: (resumeId: string, jobId: string) =>
    api.post('/api/match/', { resume_id: resumeId, job_id: jobId }),
  /** 一份简历 × 全部岗位：批量算匹配度并排序（规则引擎，不消耗额度） */
  rank: (resumeId: string, limit?: number) =>
    api.post('/api/match/rank', { resume_id: resumeId, limit: limit ?? null }),
}

export const batch = {
  optimize: (sourceResumeId: string, jobIds: string[]) =>
    api.post('/api/batch-optimize', { source_resume_id: sourceResumeId, job_ids: jobIds }),
  getStatus: (batchId: string) => api.get(`/api/batch/${batchId}/status`),
}

export const refine = {
  refine: (optId: string, instruction: string, targetSection?: string) =>
    api.post(`/api/optimization/${optId}/refine`, { instruction, target_section: targetSection || null }),
}

/** 直接渲染：跳过 AI 优化，将简历 JSON 直接生成 PDF */
export const render = {
  /** 从已解析的简历生成 PDF */
  render: (resumeId: string, template?: string, signal?: AbortSignal) =>
    api.post('/api/optimize/render', { resume_id: resumeId, template: template || 'professional' }, { signal }),
  /** 从简历文本解析后直接生成 PDF */
  renderText: (resumeText: string, template?: string, signal?: AbortSignal) =>
    api.post('/api/optimize/render-text', { resume_text: resumeText, template: template || 'professional' }, { signal }),
}

/** 个人数据洞察：首页真实统计（一次请求拿全量，避免瀑布式加载） */
export const insights = {
  overview: (days = 30) => api.get('/api/insights/overview', { params: { days } }),
}

/** AI 面试预测：押题 + 答题指导 */
export const interview = {
  generate: (resumeId: string | null, jobId: string | null, questionCount = 8) =>
    api.post('/api/interview/generate', {
      resume_id: resumeId || null,
      job_image_id: jobId || null,
      question_count: questionCount,
    }),
  listSessions: () => api.get('/api/interview/sessions'),
  getSession: (sessionId: string) => api.get(`/api/interview/sessions/${sessionId}`),
  deleteSession: (sessionId: string) => api.delete(`/api/interview/sessions/${sessionId}`),
  toggleBookmark: (questionId: string) => api.post(`/api/interview/questions/${questionId}/bookmark`),
  saveNote: (questionId: string, note: string) =>
    api.put(`/api/interview/questions/${questionId}/note`, { note }),
  listBookmarks: (limit = 50) => api.get('/api/interview/bookmarks', { params: { limit } }),
}

/** 面试追踪：记录的字段全部由用户手动录入（项目不具备投递能力，不做任何自动派生） */
export const interviewTracks = {
  options: () => api.get('/api/interview-tracks/options'),
  list: (params?: { status?: string; keyword?: string; start?: string; end?: string }) =>
    api.get('/api/interview-tracks/', { params }),
  stats: () => api.get('/api/interview-tracks/stats'),
  create: (payload: InterviewTrackPayload) => api.post('/api/interview-tracks/', payload),
  update: (id: string, payload: InterviewTrackPayload) =>
    api.put(`/api/interview-tracks/${id}`, payload),
  remove: (id: string) => api.delete(`/api/interview-tracks/${id}`),
}

/** 岗位能力测评：岗位画像库 + 用户自评 + 报告生成 + 岗位匹配排行 */
export const capability = {
  /** 岗位画像列表（搜索/分类过滤） */
  jobs: (params?: { keyword?: string; category?: string }) =>
    api.get('/api/capability/jobs', { params }),
  /** 岗位分类（筛下拉单一数据源） */
  categories: () => api.get('/api/capability/categories'),
  /** 岗位画像详情（含两套测评维度） */
  job: (id: string) => api.get(`/api/capability/jobs/${id}`),
  /** 提交自评 → 生成报告 */
  submit: (payload: AssessmentSubmit) => api.post('/api/capability/assessments', payload),
  /** 我的测评记录（时间倒序） */
  assessments: () => api.get('/api/capability/assessments'),
  /** 单次测评报告详情 */
  assessment: (id: string) => api.get(`/api/capability/assessments/${id}`),
  /** 删除一条测评记录 */
  remove: (id: string) => api.delete(`/api/capability/assessments/${id}`),
  /** 岗位匹配排行（每岗位取最近一次，按匹配度倒序） */
  ranking: () => api.get('/api/capability/ranking'),
}

/** 岗位投递申请：用户向指定岗位发起投递（关联存储 + 状态记录 + 防重复 + 阶段1 邮件直投） */
export const applications = {
  options: () => api.get('/api/applications/options'),
  list: (params?: { status?: string; keyword?: string }) =>
    api.get('/api/applications/', { params }),
  stats: () => api.get('/api/applications/stats'),
  create: (payload: ApplicationPayload) => api.post('/api/applications/', payload),
  update: (id: string, payload: ApplicationPayload) =>
    api.put(`/api/applications/${id}`, payload),
  remove: (id: string) => api.delete(`/api/applications/${id}`),
  check: (jobId: string) => api.get(`/api/applications/check/${jobId}`),
  appliedJobIds: () => api.get('/api/applications/applied-job-ids'),
  /** 投递弹窗：HR 邮箱探测 + 通道可用性/额度 */
  contactHint: (jobId: string) => api.get(`/api/applications/contact-hint/${jobId}`),
  /** 投递轨迹时间线 */
  deliveryEvents: (id: string) => api.get(`/api/applications/${id}/delivery-events`),
  /** 求职时间线：聚合投递事件 + 沟通消息 + 面试进度（按时间升序） */
  timeline: (id: string) => api.get(`/api/applications/${id}/timeline`),
  /** 重发失败的邮件投递 */
  resend: (id: string) => api.post(`/api/applications/${id}/resend`),
  /** 批量投递（阶段2）：多岗位共用简历/附言/授权，逐个限频调度 */
  batch: (payload: {
    job_image_ids: string[]
    resume_id?: string | null
    cover_letter?: string | null
    recipient_emails?: Record<string, string>
    consent_given?: boolean
  }) => api.post('/api/applications/batch', payload),
  /** 轮询 IMAP 收件箱：退信→bounced+suppression，回复→沟通时间线 */
  syncEmail: () => api.post('/api/applications/email/sync'),
  /** 邮件不发送名单（suppression）管理 */
  suppressions: {
    list: () => api.get('/api/applications/suppressions'),
    add: (email: string, detail?: string) =>
      api.post('/api/applications/suppressions', { email, detail }),
    remove: (id: string) => api.delete(`/api/applications/suppressions/${id}`),
  },
  /** ── 阶段3：官网表单半自动投递 ── */
  /** 只读探测官网投递页：robots 核查 + 表单字段识别（不提交任何数据） */
  probeForm: (url: string) => api.post('/api/applications/form/probe', { url }),
  /** 打开预填浏览器（headed）：系统只预填，提交需用户在页面中手动确认 */
  prefillForm: (id: string, opts?: { headless?: boolean; keep_open_seconds?: number }) =>
    api.post(`/api/applications/${id}/form/prefill`, opts ?? {}),
  /** 用户在官网人工确认后的结果回填：submitted / failed */
  reportFormResult: (id: string, result: 'submitted' | 'failed', detail?: string) =>
    api.post(`/api/applications/${id}/form/result`, { result, detail }),
  /** ── 阶段4：平台引导投递（一键准备包） ── */
  /** 一键准备包：平台识别 + 深链 + 简历纯文本（最后一步由用户在官方平台完成） */
  guidePack: (jobId: string, resumeId?: string | null) =>
    api.get(`/api/applications/guide-pack/${jobId}`, {
      params: resumeId ? { resume_id: resumeId } : undefined,
    }),
  /** 记录「用户点击打开平台岗位页」事件（时间线留痕） */
  guideOpened: (id: string) => api.post(`/api/applications/${id}/guide/opened`),
  /** 用户在官方平台完成/放弃投递后的结果回填：submitted / failed */
  reportGuideResult: (id: string, result: 'submitted' | 'failed', detail?: string) =>
    api.post(`/api/applications/${id}/guide/result`, { result, detail }),
}

/** 邮件模板管理（阶段2）：投递附言默认模板 + 用户自定义 */
export const emailTemplates = {
  list: () => api.get('/api/email-templates/'),
  create: (payload: { name: string; body: string; is_default?: boolean }) =>
    api.post('/api/email-templates/', payload),
  update: (id: string, payload: { name?: string; body?: string; is_default?: boolean }) =>
    api.put(`/api/email-templates/${id}`, payload),
  remove: (id: string) => api.delete(`/api/email-templates/${id}`),
}

/** 面试追踪 - 沟通消息：用户与某家公司就某次投递的往来（与全局通知中心 /messages 相互独立） */
export const communications = {
  options: () => api.get('/api/communications/options'),
  list: (params?: { application_id?: string; company?: string; keyword?: string; direction?: string }) =>
    api.get('/api/communications/', { params }),
  stats: () => api.get('/api/communications/stats'),
  create: (payload: CommunicationPayload) => api.post('/api/communications/', payload),
  update: (id: string, payload: CommunicationPayload) =>
    api.put(`/api/communications/${id}`, payload),
  remove: (id: string) => api.delete(`/api/communications/${id}`),
}

/** 全局搜索：跨简历 / 岗位 / 优化记录 */
export const search = {
  all: (q: string, limit = 5) => api.get('/api/search', { params: { q, limit } }),
}

/** ATS 友好度体检 */
export const ats = {
  check: (resumeJson: Record<string, unknown>, jobJson?: Record<string, unknown> | null) =>
    api.post('/api/ats/check', { resume_json: resumeJson, job_json: jobJson || null }),
}

/** 简历分析聚合：匹配度 / 关键词覆盖 / ATS / 四维指标 / 可执行建议（纯规则，不消耗 AI 额度） */
export const analysis = {
  resume: (resumeJson: Record<string, unknown>, jobJson?: Record<string, unknown> | null) =>
    api.post('/api/analysis/resume', { resume_json: resumeJson, job_json: jobJson || null }),
}

/** AI 职业照：上传自拍 → 生成职业照（Key 由用户自带，服务端不落库） */
export const aiPhoto = {
  /**
   * 生成职业照。注意：后端错误走 HTTP 200 + body.error（quota_exceeded /
   * invalid_key / safety_filtered / generate_failed），前端需按 error 字段分支提示。
   */
  generate: (payload: {
    image: string
    prompt: string
    requirements?: string
    aspectRatio?: string
    apiKey: string
  }) => api.post('/api/ai-photo/generate', payload),
}

/** 优化结果在线编辑 + 重新导出 PDF */
export const editor = {
  updateContent: (optId: string, optimizedJson: Record<string, unknown>) =>
    api.put(`/api/optimize/${optId}/content`, { optimized_json: optimizedJson }),
  /** 重新导出 PDF；不传 template 时使用记录中已保存的模板 */
  reexport: (optId: string, template?: string) =>
    api.post(`/api/optimize/${optId}/reexport`, null, {
      params: template ? { template } : {},
    }),
  /** 切换记录使用的模板（模板 ID 落库，成为预览/导出的唯一事实来源） */
  setTemplate: (optId: string, template: string) =>
    api.put(`/api/optimize/${optId}/template`, { template }),
  /** 更新记录的主题定制（与模板默认合并落库；保存即重导出，保持文件与记录一致） */
  setTheme: (optId: string, theme: Record<string, string | number>) =>
    api.put(`/api/optimize/${optId}/theme`, theme, { params: { reexport: true } }),
  /** 可视化排版：保存布局文档（layout_json） */
  saveLayout: (optId: string, layout: Record<string, unknown>) =>
    api.put(`/api/optimize/${optId}/layout`, { layout }),
  /**
   * 可视化排版：按当前布局导出 PDF。
   * html/css 由前端共享渲染器生成（预览与导出同一实现），后端只包字体壳。
   */
  exportLayout: (optId: string, html: string, css: string, layout?: Record<string, unknown> | null) =>
    api.post(`/api/optimize/${optId}/export-layout`, { html, css, layout: layout ?? null }),
}

/** AI 对话润色：多轮会话 + SSE 流式 + 结构化建议（suggestion） */
export const polish = {
  createSession: (body: {
    target_type: 'optimized' | 'text'
    target_id?: string
    text?: string
    title?: string
  }) => api.post('/api/polish/sessions', body),
  listSessions: () => api.get('/api/polish/sessions'),
  getSession: (id: string) => api.get(`/api/polish/sessions/${id}`),
  deleteSession: (id: string) => api.delete(`/api/polish/sessions/${id}`),
  /**
   * 发送消息并消费 SSE 流（axios 不便于流式读取，这里用原生 fetch）。
   * 事件协议见后端 app/api/polish.py：delta / suggestions / done / error。
   */
  chat: (
    sessionId: string,
    message: string,
    handlers: {
      onDelta?: (text: string) => void
      onSuggestions?: (items: PolishSuggestion[]) => void
      onDone?: (info: { quota_used?: number }) => void
      onError?: (message: string) => void
    },
    signal?: AbortSignal,
  ) => {
    const token = getToken()
    return fetch(`${API_BASE_URL}/api/polish/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ session_id: sessionId, message }),
      signal,
    }).then(async (res) => {
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '')
        throw new Error(`对话请求失败（${res.status}）${text.slice(0, 120)}`)
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        // SSE 以空行分帧
        let sep: number
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, sep)
          buffer = buffer.slice(sep + 2)
          const line = frame.split('\n').find((l) => l.startsWith('data:'))
          if (!line) continue
          try {
            const payload = JSON.parse(line.slice(5).trim())
            if (payload.type === 'delta') handlers.onDelta?.(payload.text || '')
            else if (payload.type === 'suggestions') handlers.onSuggestions?.(payload.items || [])
            else if (payload.type === 'done') handlers.onDone?.(payload)
            else if (payload.type === 'error') handlers.onError?.(payload.message || '对话失败')
          } catch {
            /* 单帧损坏不阻断流 */
          }
        }
      }
    })
  },
}

export interface PolishSuggestion {
  id: string
  target: string
  original: string
  improved: string
  reason: string
}
