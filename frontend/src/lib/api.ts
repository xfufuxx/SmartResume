import axios from 'axios'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: API_BASE,
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

  getOrders: (page = 1, pageSize = 20, status = '', userSearch = '', startDate = '', endDate = '') =>
    api.get('/api/admin/orders', { params: { page, page_size: pageSize, status, user_search: userSearch, start_date: startDate, end_date: endDate } }),
  refundOrder: (id: string, reason = '') =>
    api.post(`/api/admin/orders/${id}/refund`, { reason }),
  getRevenue: (days = 30) => api.get('/api/admin/revenue', { params: { days } }),

  getPackages: () => api.get('/api/admin/packages'),
  createPackage: (name: string, packageType: string, price: number, durationDays?: number, quotaAmount?: number) =>
    api.post('/api/admin/packages', { name, package_type: packageType, price, duration_days: durationDays, quota_amount: quotaAmount }),
  updatePackage: (id: string, data: { is_active?: boolean; price?: number }) =>
    api.put(`/api/admin/packages/${id}`, data),

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
  get: (id: string) => api.get(`/api/resumes/${id}`),
  create: (title?: string, sourceResumeId?: string) =>
    api.post('/api/resumes/', { title: title || null, source_resume_id: sourceResumeId || null }),
  update: (id: string, title: string) =>
    api.put(`/api/resumes/${id}`, { title }),
  setPrimary: (id: string) => api.put(`/api/resumes/${id}/primary`),
  delete: (id: string) => api.delete(`/api/resumes/${id}`),
}

export const jobs = {
  upload: (file: File, useOcr = false) => {
    const form = new FormData()
    form.append('file', file)
    return api.post(`/api/jobs/upload?use_ocr=${useOcr}`, form)
  },
  list: () => api.get('/api/jobs/'),
  get: (id: string) => api.get(`/api/jobs/${id}`),
  delete: (id: string) => api.delete(`/api/jobs/${id}`),
}

export const optimize = {
  run: (resumeId: string, jobImageId: string, customInstructions?: string) =>
    api.post('/api/optimize/', {
      resume_id: resumeId,
      job_image_id: jobImageId,
      custom_instructions: customInstructions || null,
    }),
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