import type { DiscoveredJob, MatchDimensionKey } from '@/types'

/** 五维顺序与权重——必须与后端 `job_discovery.DIMENSION_WEIGHTS` 保持一致 */
export const DIMENSION_ORDER: MatchDimensionKey[] = [
  'skills', 'experience', 'education', 'location', 'salary',
]

export const DIMENSION_META: Record<MatchDimensionKey, {
  label: string
  weight: number
  hint: string
}> = {
  skills: { label: '技能匹配', weight: 30, hint: 'JD 核心技能在简历中的覆盖度' },
  experience: { label: '经验年限', weight: 25, hint: '工作年限与岗位要求区间的差距' },
  education: { label: '学历要求', weight: 10, hint: '最高学历是否达到岗位门槛' },
  location: { label: '工作地点', weight: 15, hint: '岗位城市与期望城市是否一致' },
  salary: { label: '薪资水平', weight: 20, hint: '岗位薪资区间是否覆盖期望' },
}

export const DISCOVERY_STEPS = ['解析简历画像', '检索相关岗位', '五维适配评分', '生成差距与建议']

export function rateColor(rate: number): string {
  if (rate >= 80) return 'var(--success-500)'
  if (rate >= 60) return 'var(--primary-500)'
  if (rate >= 40) return 'var(--warning-500)'
  return 'var(--error-500)'
}

export function rateLabel(rate: number): string {
  if (rate >= 80) return '强匹配 · 建议优先投递'
  if (rate >= 60) return '较匹配 · 优化后值得投递'
  if (rate >= 40) return '一般 · 需要补足关键差距'
  return '弱匹配 · 不建议优先考虑'
}

export function overallTone(rate: number): 'strong' | 'good' | 'fair' | 'weak' {
  if (rate >= 80) return 'strong'
  if (rate >= 60) return 'good'
  if (rate >= 40) return 'fair'
  return 'weak'
}

export function summarizeRates(items: DiscoveredJob[]): {
  strong: number
  good: number
  weak: number
  average: number
} {
  const list = items || []
  if (!list.length) return { strong: 0, good: 0, weak: 0, average: 0 }
  let strong = 0
  let good = 0
  let weak = 0
  let total = 0
  for (const item of list) {
    const rate = Number(item?.match_rate) || 0
    total += rate
    if (rate >= 80) strong += 1
    else if (rate >= 60) good += 1
    else weak += 1
  }
  return {
    strong,
    good,
    weak,
    average: Math.round((total / list.length) * 10) / 10,
  }
}

export function formatYears(years: number): string {
  const y = Number(years) || 0
  if (y <= 0) return '应届 / 待补充'
  return `${y % 1 === 0 ? y : y.toFixed(1)} 年`
}

export interface DimensionRow {
  key: MatchDimensionKey
  label: string
  hint: string
  weight: number
  score: number
  reason: string
}

/** 按固定顺序摊平五维；模型漏给某维度时补 0 分并标注「未评估」，不静默消失 */
export function dimensionRows(job: DiscoveredJob | null | undefined): DimensionRow[] {
  const dims = job?.dimensions || ({} as DiscoveredJob['dimensions'])
  return DIMENSION_ORDER.map((key) => {
    const meta = DIMENSION_META[key]
    const raw = dims?.[key]
    const score = raw && Number.isFinite(Number(raw.score)) ? Number(raw.score) : 0
    return {
      key,
      label: meta.label,
      hint: meta.hint,
      weight: meta.weight,
      score: Math.max(0, Math.min(100, Math.round(score))),
      reason: raw?.reason || '',
    }
  })
}

/** 后端进度文案 → 步骤条当前下标（0..3）；识别不了就停在第一步，不做假进度 */
export function progressStepIndex(progress: string): number {
  const text = progress || ''
  if (/完成|结束/.test(text)) return DISCOVERY_STEPS.length - 1
  if (/建议|理由|差距/.test(text)) return 3
  if (/评分|维度|技能|经验|学历|地点|薪资/.test(text)) return 2
  if (/检索|获取|招聘信息|结构化|岗位/.test(text)) return 1
  return 0
}

/** 岗位卡片搜索匹配：标题/公司/技能/渠道/城市任一命中 */
export function jobMatchesQuery(job: DiscoveredJob, query: string): boolean {
  const q = (query || '').trim().toLowerCase()
  if (!q) return true
  const haystack = [
    job?.title, job?.company, job?.source, job?.channel, job?.location, job?.summary,
    ...(job?.skills || []),
  ].join(' ').toLowerCase()
  return haystack.includes(q)
}

/** 摘要兜底：模型没给 summary 时用 JD 首句，避免卡片出现空白描述 */
export function jobSummary(job: DiscoveredJob, limit = 120): string {
  const text = (job?.summary || job?.jd_text || '').replace(/\s+/g, ' ').trim()
  if (!text) return '暂无岗位信息摘要'
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}
