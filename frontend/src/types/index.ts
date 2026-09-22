export interface User {
  id: string
  email: string
  phone?: string
  nickname?: string
  avatar_url?: string
  is_verified?: boolean
  career_state?: string
  status?: string
}

export interface UserProfile {
  id: string
  email: string
  phone?: string
  nickname?: string
  avatar_url?: string
  career_state?: string
  expectation?: {
    industries: string[]
    job_title: string
    salary_range: string
    cities: string[]
  } | null
  saved_texts?: {
    resume_text?: string
    job_text?: string
  } | null
  privacy_agreed: boolean
  status: string
  created_at?: string
}

export interface TokenResponse {
  access_token: string
  refresh_token?: string
  token_type: string
  user: User
}

export interface UserDevice {
  id: string
  device_name?: string
  platform?: string
  ip_address?: string
  user_agent?: string
  last_active?: string
  is_revoked: boolean
  is_current: boolean
}

export interface MessageItem {
  id: string
  msg_type: string
  title?: string
  content?: string
  ref_id?: string
  is_read: boolean
  created_at?: string
}

export interface AdminUser {
  id: string
  email: string
  phone?: string
  nickname?: string
  career_state?: string
  status: string
  resume_count: number
  opt_count: number
  created_at?: string
}

export interface AdminUserDetail {
  id: string
  email: string
  phone?: string
  nickname?: string
  avatar_url?: string
  career_state?: string
  expectation?: any
  status: string
  resume_count: number
  opt_count: number
  quota: {
    daily_limit: number
    daily_used: number
    monthly_limit: number
    monthly_used: number
  }
  created_at?: string
  recent_logs: Array<{ action: string; detail?: string; created_at?: string }>
}

export interface AdminStats {
  total_users: number
  active_users: number
  total_optimizations: number
  today_new_users: number
  today_optimizations: number
  average_satisfaction: number
}

export interface DashboardCore {
  total_users: number
  active_users: number
  dau: number
  dau_change_percent: number
  today_optimizations: number
  today_uploads: number
  total_optimizations: number
}

export interface IndustryItem {
  name: string
  count: number
}

export interface MatchTrend {
  date: string
  avg_score: number
}

export interface FeatureUsage {
  name: string
  count: number
}

export interface JobTrendItem {
  title: string
  count: number
  percent: number
}

export interface SatisfactionTrend {
  date: string
  avg_satisfaction: number
}

export interface TaskStats {
  today_total: number
  today_success: number
  success_rate: number
  avg_latency_ms: number
  fail_by_reason: Array<{ reason: string; count: number }>
  model_health: Record<string, { total: number; success: number; success_rate: number; avg_latency_ms: number }>
}

export interface FailedTask {
  id: string
  user_id: string
  model_name: string
  error_message: string
  created_at?: string
}

export interface PromptItem {
  id: string
  name: string
  scene: string
  version: number
  is_active: boolean
  gray_ratio: number
  created_at?: string
  content?: string
  variables?: any
}

export interface PromptDetail extends PromptItem {
  all_versions: Array<{ version: number; id: string; is_active: boolean; gray_ratio: number; created_at?: string }>
}

export interface ModelConfig {
  id: string
  model_name: string
  display_name: string
  weight: number
  rate_limit_per_minute: number
  is_enabled: boolean
  tier: string
  consecutive_failures: number
  stats: { total: number; success: number; success_rate: number; avg_latency_ms: number }
}

export interface CallLog {
  id: string
  user_id: string
  model_name: string
  prompt_template_name?: string
  prompt_version?: number
  input_tokens?: number
  output_tokens?: number
  latency_ms?: number
  is_success: boolean
  error_message?: string
  cost_usd?: number
  created_at?: string
}

export interface TemplateItem {
  id: string
  name: string
  description?: string
  thumbnail_url?: string
  is_active: boolean
  is_default: boolean
  created_at?: string
}

export interface KeywordItem {
  id: string
  keyword: string
  industry: string
  category: string
  is_active: boolean
  created_at?: string
}

export interface ATSRuleItem {
  id: string
  name: string
  pattern: string
  severity: string
  is_active: boolean
  description?: string
}

export interface FeedbackItem {
  id: string
  score: number
  feedback_text?: string
  job_title?: string
  created_at?: string
}

export interface TicketItem {
  id: string
  user_id: string
  nickname?: string
  category: string
  priority: string
  subject: string
  status: string
  reply_count: number
  created_at?: string
}

export interface TicketDetail {
  id: string
  user_id: string
  category: string
  priority: string
  subject: string
  content?: string
  attachments?: any
  status: string
  resolution?: string
  assigned_to?: string
  created_at?: string
  replies: Array<{ id: string; content: string; admin_id?: string; user_id?: string; is_internal: boolean; created_at?: string }>
}

export interface AdminLogItem {
  id: string
  admin_id: string
  action: string
  target_type?: string
  target_id?: string
  details?: any
  created_at?: string
}

export interface QuotaConfig {
  free_daily_limit: number
  free_monthly_limit: number
  carry_over: boolean
}

export interface ResumeParseResult {
  personal_info: { name?: string; email?: string; phone?: string }
  summary?: string
  experience: Array<{
    company: string
    title: string
    start?: string
    end?: string
    points: string[]
  }>
  education: Array<{
    school: string
    degree?: string
    major?: string
    start?: string
    end?: string
  }>
  skills: string[]
  projects: Array<{
    name: string
    description?: string
    tech: string[]
  }>
}

export interface ResumeRecord {
  id: string
  user_id: string
  title?: string
  original_file_url: string
  file_type: string
  parsed_json: ResumeParseResult | null
  raw_text: string | null
  is_primary: boolean
  target_position?: string | null
  target_company?: string | null
  version?: number
  status?: string
  match_rate?: number | null
  score?: number | null
  is_favorite?: boolean
  thumbnail_url?: string | null
  deleted_at?: string
  created_at: string
  updated_at?: string | null
}

export interface ResumeStats {
  total: number
  optimized: number
  draft: number
  unoptimized: number
  favorite: number
}

export interface JobParseResult {
  title?: string
  company?: string
  salary_range?: string
  location?: string
  must_have: {
    skills: string[]
    experience?: string
    education?: string
  }
  nice_to_have: {
    skills: string[]
    qualifications: string[]
  }
  responsibilities: string[]
  soft_skills: string[]
  industry?: string
  original_text: string
}

export interface JobRecord {
  id: string
  user_id: string
  image_url: string
  parsed_job_json: JobParseResult | null
  created_at: string
}

export interface MatchAnalysis {
  match_score: number
  strengths: string[]
  gaps: string[]
  rewrite_strategy: Record<string, string>
}

export interface OptimizeResult {
  id: string
  resume_id?: string
  job_image_id?: string
  match_analysis?: MatchAnalysis
  original_json?: ResumeParseResult
  optimized_json?: ResumeParseResult
  changes_description?: string
  custom_instructions?: string
  pdf_url?: string
  match_score?: number
  job_title?: string
  company?: string
  category?: string
  thumbnail_url?: string
  is_favorite: boolean
  satisfaction_score?: number
  feedback_text?: string
  parent_record_id?: string
  refine_count: number
  deleted_at?: string
  status: string
  created_at?: string
}

export interface DiffResponse {
  record_a: OptimizeResult
  record_b: OptimizeResult
  diff_summary: string
}

export interface ScoreDimension {
  completeness: number
  keyword_match: number
  quantification: number
  format_readability: number
}

export interface ResumeScore {
  total_score: number
  dimensions: ScoreDimension
  suggestions: string[]
}

export interface TrendingJob {
  rank: number
  job_title: string
  category: string
  count: number
  change_percent?: number
}

export interface MatchResult {
  match_rate: number
  missing_keywords: string[]
}

export interface BatchStatus {
  batch_id: string
  status: string
  total_jobs: number
  completed_jobs: number
  created_at?: string
  completed_at?: string
}

export interface RefineResult {
  id: string
  original_text: string
  suggested_text: string
  refined_text: string
  refine_count: number
}

// ── 个人数据洞察（首页真实统计）──
export interface InsightCounts {
  resumes: number
  jobs: number
  optimizations: number
  favorites: number
  unparsed_resumes: number
  unparsed_jobs: number
}

export interface InsightMatch {
  avg: number
  best: number
  latest: number
  improvement: number
  sample_size: number
}

export interface InsightTrendPoint {
  date: string
  count: number
  avg_score: number | null
}

export interface InsightActivity {
  type: 'resume' | 'job' | 'optimize'
  title: string
  desc: string
  match_score?: number | null
  ref_id?: string
  created_at: string
}

export interface InsightActionItem {
  level: 'primary' | 'warning' | 'info'
  title: string
  desc: string
  action: string
  link: string
}

export interface InsightOverview {
  counts: InsightCounts
  match: InsightMatch
  trend: InsightTrendPoint[]
  categories: Array<{ name: string; value: number }>
  recent_activities: InsightActivity[]
  action_items: InsightActionItem[]
  unread_messages: number
  generated_at: string
}

// ── AI 面试预测 ──
export interface InterviewQuestion {
  id: string
  session_id: string
  order_index: number
  category?: string | null
  difficulty?: string | null
  question: string
  intent?: string | null
  answer_outline: string[]
  sample_answer?: string | null
  is_bookmarked: boolean
  note?: string | null
}

export interface InterviewSessionItem {
  id: string
  resume_id?: string | null
  job_image_id?: string | null
  job_title?: string | null
  company?: string | null
  status: 'pending' | 'processing' | 'completed' | 'failed'
  error_message?: string | null
  overall_advice?: string | null
  question_count: number
  created_at?: string | null
}

export interface InterviewSessionDetail extends InterviewSessionItem {
  questions: InterviewQuestion[]
}

// ── 岗位匹配罗盘 ──
export interface MatchRankItem {
  job_id: string
  title: string
  company: string
  category: string
  match_rate: number
  missing_keywords: string[]
  is_favorite: boolean
}

export interface MatchRankResult {
  resume_id: string
  resume_title: string
  total_jobs: number
  matched_jobs: number
  skipped_jobs: number
  best_rate: number
  avg_rate: number
  items: MatchRankItem[]
}

// ── 全局搜索 ──
export interface SearchResultItem {
  id: string
  title: string
  company?: string
  snippet?: string
  match_score?: number | null
  created_at?: string | null
}

export interface SearchResult {
  query: string
  resumes: SearchResultItem[]
  jobs: SearchResultItem[]
  optimizations: SearchResultItem[]
  total: number
}

// ── ATS 体检 ──
export interface AtsIssue {
  level: 'error' | 'warn' | 'info'
  message: string
}

export interface AtsCheckResult {
  score: number
  passed: boolean
  issues: AtsIssue[]
  suggestions: string[]
  keyword_coverage?: { covered: string[]; missing: string[] } | null
}

// ── 简历分析聚合（优化主页右侧面板 + 底部指标卡）──
export interface AnalysisDimensions {
  ats_score: number
  /** 岗位关键词在简历中的覆盖率（0-100，百分比） */
  keyword_density: number
  keyword_match: number
  /** 可读性（0-10） */
  readability: number
  /** 影响力评分（0-10） */
  impact: number
}

export interface AnalysisSuggestion {
  title: string
  desc: string
  detail: string
}

export interface ResumeAnalysis {
  match_rate: number
  job_keywords: string[]
  skill_tags: string[]
  matched_keywords: string[]
  missing_keywords: string[]
  dimensions: AnalysisDimensions
  total_score: number
  ats: { score: number; passed: boolean; issues: AtsIssue[] }
  suggestions: AnalysisSuggestion[]
}/* ── 面试追踪：记录全部由用户手动录入（项目不具备投递能力，不自动派生） ── */
export type InterviewTrackStatus = 'scheduled' | 'awaiting' | 'passed' | 'offer' | 'rejected'

export interface InterviewTrack {
  id: string
  user_id: string
  company: string
  position: string
  location: string | null
  stage: string | null
  mode: string | null
  interviewer: string | null
  interview_time: string | null
  status: InterviewTrackStatus
  result: string | null
  resume_id: string | null
  job_image_id: string | null
  created_at: string | null
  updated_at: string | null
}

/** 新建 / 编辑面试记录时提交给后端的表单体 */
export type InterviewTrackPayload = Omit<
  InterviewTrack,
  'id' | 'user_id' | 'created_at' | 'updated_at'
>

export interface InterviewTrackStats {
  total: number
  by_status: Record<string, number>
  by_stage: Record<string, number>
  offer_rate: number
  pass_rate: number
  upcoming_7d: number
}

/* ── 岗位投递申请：用户向指定岗位发起的一次投递（与岗位关联存储，防重复） ── */
export type ApplicationStatus = 'submitted' | 'viewed' | 'interview' | 'offer' | 'rejected'

/** 外部投递通道：email=邮件直投（真实发送）；manual=记录模式（引导用户去官方渠道）；form=官网表单半自动投递；guide=平台引导投递 */
export type DeliveryChannel = 'email' | 'manual' | 'form' | 'guide'
/** 外部投递状态（与 status 站内流程状态相互独立） */
export type DeliveryStatus = 'pending' | 'sent' | 'failed' | 'bounced' | 'not_applicable'
/** 投递事件类型（delivery_events 流水） */
export type DeliveryEventType =
  | 'queued' | 'sent' | 'failed' | 'bounced' | 'replied'
  | 'form_prefilled' | 'form_submitted' | 'form_failed'
  | 'guide_opened' | 'guide_submitted' | 'guide_failed'

export interface Application {
  id: string
  user_id: string
  job_image_id: string
  resume_id: string | null
  applicant_name: string
  email: string
  phone: string
  expected_salary: string | null
  available_from: string | null
  cover_letter: string | null
  status: ApplicationStatus
  // ── 真实触达（阶段1：邮件直投；阶段3：官网表单）──
  channel: DeliveryChannel | null
  apply_url: string | null
  recipient_email: string | null
  delivery_status: DeliveryStatus | null
  sent_at: string | null
  provider_message_id: string | null
  consent_at: string | null
  job_title: string | null
  job_company: string | null
  created_at: string | null
  updated_at: string | null
}

/** 新建 / 更新投递时提交给后端的表单体（招聘软件式：仅岗位 + 选填简历/附言，联系方式由后端从资料带出） */
export interface ApplicationPayload {
  job_image_id: string
  resume_id?: string | null
  cover_letter?: string | null
  status?: ApplicationStatus
  /** HR 接收邮箱（非空 = 邮件直投通道） */
  recipient_email?: string | null
  /** 官网投递入口 URL（非空且授权 = 官网表单半自动通道；guide 通道传平台深链） */
  apply_url?: string | null
  /** 显式通道选择（guide=平台引导投递；不传则按 email>form 自动决策） */
  channel_hint?: 'guide' | null
  /** 用户对本次对外投递的明示同意（PIPL 单独同意，邮件直投必为 true） */
  consent_given?: boolean
}

/** 投递事件流水（投递轨迹时间线） */
export interface DeliveryEvent {
  id: string
  application_id: string
  event_type: DeliveryEventType
  detail: string | null
  occurred_at: string | null
}

/** 投递弹窗打开时的 HR 邮箱探测结果与通道可用性 */
export interface DeliveryContactHint {
  email: string | null
  email_source: string | null
  /** JD 中探测到的官网投递入口（阶段3，可人工修改） */
  apply_url: string | null
  smtp_configured: boolean
  delivery_enabled: boolean
  daily_limit: number
  sent_today: number
}

/* ── 阶段3：官网表单半自动投递 ── */

/** 探测到的单个表单字段 */
export interface FormProbeField {
  selector: string
  kind: 'name' | 'email' | 'phone' | 'cover_letter' | 'resume_file' | 'other'
  input_type: string
  label: string | null
}

/** 官网投递页探测结果（robots 核查 + 表单结构，只读不提交） */
export interface FormProbeResult {
  ok: boolean
  url: string
  robots_allowed: boolean
  robots_detail: string | null
  form_detected: boolean
  fields: FormProbeField[]
  site_title: string | null
  detail: string | null
}

export interface ApplicationStats {
  total: number
  by_status: Record<string, number>
}

/* ── 阶段4：平台引导投递（一键准备包） ── */

/** 一键准备包：平台识别 + 深链 + 简历纯文本（最后一步投递由用户在官方平台完成） */
export interface GuidePack {
  platform_key: 'boss' | 'zhilian' | '51job' | 'liepin' | 'lagou' | 'linkedin'
  platform_name: string
  deep_link: string
  /** job_url=JD内平台链接 / platform_search=平台搜索页 */
  link_source: 'job_url' | 'platform_search'
  job_title: string | null
  job_company: string | null
  resume_title: string | null
  resume_text: string
}

// ── 阶段2：回执闭环 / 批量投递 / 邮件模板 / suppression 名单 ──

/** 邮件回执同步结果（IMAP 轮询） */
export interface EmailSyncResult {
  enabled: boolean
  scanned: number
  matched?: number
  bounces: number
  replies: number
  suppressed_new?: number
  message: string
}

/** 批量投递单岗位结果 */
export interface BatchResultItem {
  job_image_id: string
  application_id: string | null
  ok: boolean
  code: number
  detail: string
}

/** 批量投递汇总结果 */
export interface BatchApplicationResult {
  created: number
  skipped: number
  failed_quota: number
  items: BatchResultItem[]
}

/** 邮件模板（投递附言模板，支持 {job_title}/{company}/{applicant_name} 占位符） */
export interface EmailTemplate {
  id: string
  name: string
  body: string
  is_default: boolean
  created_at: string | null
  updated_at: string | null
}

/** 邮件不发送名单条目（退信自动加入 / 手动加入） */
export interface SuppressionEntry {
  id: string
  email: string
  reason: 'bounce' | 'manual'
  detail: string | null
  created_at: string | null
}

// ── 面试追踪 - 沟通消息：用户与某家公司就某次投递的往来（与全局通知中心 /messages 相互独立）──
export type CommunicationDirection = 'out' | 'in'
export type CommunicationChannel = 'phone' | 'email' | 'wechat' | 'other'

export interface Communication {
  id: string
  user_id: string
  application_id: string | null
  company: string
  position: string | null
  direction: CommunicationDirection
  channel: CommunicationChannel
  content: string
  contact_at: string | null
  created_at: string | null
  updated_at: string | null
}

/** 新建 / 更新沟通时提交给后端的表单体 */
export interface CommunicationPayload {
  application_id?: string | null
  company?: string | null
  position?: string | null
  direction: CommunicationDirection
  channel: CommunicationChannel
  content: string
  contact_at?: string | null
}

export interface CommunicationStats {
  total: number
  by_direction: Record<string, number>
  by_channel: Record<string, number>
}

