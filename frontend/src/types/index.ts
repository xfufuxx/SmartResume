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
  is_vip: boolean
  daily_quota: number
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
    is_paid: boolean
  }
  created_at?: string
  recent_logs: Array<{ action: string; detail?: string; created_at?: string }>
  orders: Array<{ order_no: string; package_name?: string; amount: number; status: string; created_at?: string }>
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
  paid_conversion_rate: number
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

export interface OrderItem {
  id: string
  order_no: string
  user_id: string
  nickname?: string
  email?: string
  package_name?: string
  package_type: string
  amount: number
  payment_method?: string
  status: string
  paid_at?: string
  created_at?: string
}

export interface RevenueData {
  total_revenue: number
  refund_amount: number
  net_revenue: number
  order_count: number
  daily: Array<{ date: string; revenue: number; orders: number }>
}

export interface PackageItem {
  id: string
  name: string
  package_type: string
  price: number
  duration_days?: number
  quota_amount?: number
  is_active: boolean
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
  vip_unlimited: boolean
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
  deleted_at?: string
  created_at: string
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

export interface FeedbackRecord {
  id: string
  user_id: string
  optimization_record_id: string
  outcome: string
  created_at: string
}

export interface FeedbackStats {
  total_applications: number
  interview_rate: number
  offer_rate: number
  outcome_breakdown: Record<string, number>
  version_comparison: Array<{
    resume_id: string
    total_applications: number
    interview_rate: number
    offer_rate: number
  }>
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