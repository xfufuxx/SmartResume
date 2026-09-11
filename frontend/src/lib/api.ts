import axios from 'axios'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

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

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      // 清除所有认证相关 key
      ;['token', 'refreshToken', 'user', 'deviceId'].forEach(k => localStorage.removeItem(k))
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login'
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

export const jobs = {
  upload: (file: File, useOcr = false) => {
    const form = new FormData()
    form.append('file', file)
    return api.post(`/api/jobs/upload?use_ocr=${useOcr}`, form)
  },
  list: (q = '', category = '') =>
    api.get('/api/jobs/', { params: { q, category } }),
  get: (id: string) => api.get(`/api/jobs/${id}`),
  update: (id: string, data: { title?: string; company?: string; category?: string; user_remark?: string }) =>
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
  runAsync: (resumeId: string, jobImageId: string, customInstructions?: string, template?: string) =>
    api.post('/api/optimize/async', {
      resume_id: resumeId,
      job_image_id: jobImageId,
      custom_instructions: customInstructions || null,
      template: template || null,
    }),
  /** 一键优化：使用个人中心保存的简历文本和岗位文本直接优化 */
  quick: (resumeText: string, jobText: string, customInstructions?: string, template?: string) =>
    api.post('/api/optimize/quick', {
      resume_text: resumeText,
      job_text: jobText,
      custom_instructions: customInstructions || null,
      template: template || 'professional',
    }),
  getTaskStatus: (taskId: string) =>
    api.get(`/api/optimize/async/${taskId}`),
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
}

export const scoring = {
  getScore: (resumeId: string, jobId?: string) =>
    api.get(`/api/resume/${resumeId}/score`, { params: jobId ? { job_id: jobId } : {} }),
  getTrending: (days = 7) => api.get('/api/jobs/trending', { params: { days } }),
}

export const matching = {
  calculate: (resumeId: string, jobId: string) =>
    api.post('/api/match/', { resume_id: resumeId, job_id: jobId }),
}

export const feedback = {
  create: (optimizationRecordId: string, outcome: string) =>
    api.post('/api/feedback/', { optimization_record_id: optimizationRecordId, outcome }),
  list: () => api.get('/api/feedback/'),
  stats: () => api.get('/api/feedback/stats'),
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
  render: (resumeId: string, template?: string) =>
    api.post('/api/optimize/render', { resume_id: resumeId, template: template || 'professional' }),
  /** 从简历文本解析后直接生成 PDF */
  renderText: (resumeText: string, template?: string) =>
    api.post('/api/optimize/render-text', { resume_text: resumeText, template: template || 'professional' }),
}