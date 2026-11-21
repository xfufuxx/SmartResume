/**
 * 证书推荐页的「已持有证书」辅助模块：
 * - COMMON_CERT_GROUPS：常见证书清单（复选下拉选项，按类分组）
 * - extractCertsFromResume：从简历 parsed_json / raw_text 自动识别证书候选
 */

export interface CertOptionItem {
  value: string
  label: string
}

export interface CertOptionGroup {
  label: string
  title: string
  options: CertOptionItem[]
}

/** 常见证书清单（覆盖大多数求职场景；用户仍可自由输入清单外的证书） */
export const COMMON_CERT_GROUPS: CertOptionGroup[] = [
  {
    label: '语言能力',
    title: '语言能力',
    options: [
      { value: 'CET-4', label: '大学英语四级（CET-4）' },
      { value: 'CET-6', label: '大学英语六级（CET-6）' },
      { value: '雅思 IELTS', label: '雅思 IELTS' },
      { value: '托福 TOEFL', label: '托福 TOEFL' },
      { value: 'BEC 商务英语', label: 'BEC 商务英语' },
      { value: 'CATTI 翻译资格', label: 'CATTI 翻译专业资格' },
      { value: '普通话二级甲等', label: '普通话二级甲等' },
      { value: '日语 JLPT', label: '日语能力考（JLPT）' },
    ],
  },
  {
    label: '计算机/IT',
    title: '计算机 / IT',
    options: [
      { value: '计算机二级', label: '全国计算机等级二级' },
      { value: '软考中级', label: '软考中级（软件设计师等）' },
      { value: '软考高级·信息系统项目管理师', label: '软考高级·信息系统项目管理师' },
      { value: '华为 HCIA', label: '华为 HCIA' },
      { value: '华为 HCIP', label: '华为 HCIP' },
      { value: '阿里云 ACA', label: '阿里云 ACA' },
      { value: '阿里云 ACP', label: '阿里云 ACP' },
      { value: '腾讯云 TCA', label: '腾讯云 TCA' },
      { value: 'AWS 认证', label: 'AWS 云从业者认证' },
      { value: 'Azure 认证', label: 'Microsoft Azure 认证' },
      { value: 'CKA', label: 'CKA（Kubernetes 管理员）' },
      { value: 'CISP', label: 'CISP 注册信息安全专业人员' },
    ],
  },
  {
    label: '财会金融',
    title: '财会 / 金融',
    options: [
      { value: '初级会计职称', label: '初级会计职称' },
      { value: '中级会计职称', label: '中级会计职称' },
      { value: 'CPA 注册会计师', label: 'CPA 注册会计师' },
      { value: 'CFA', label: 'CFA 特许金融分析师' },
      { value: 'FRM', label: 'FRM 金融风险管理师' },
      { value: 'ACCA', label: 'ACCA 国际注册会计师' },
      { value: '证券从业资格', label: '证券从业资格' },
      { value: '基金从业资格', label: '基金从业资格' },
      { value: '银行从业资格', label: '银行从业资格' },
      { value: '税务师', label: '税务师' },
    ],
  },
  {
    label: '项目/管理',
    title: '项目 / 管理',
    options: [
      { value: 'PMP', label: 'PMP 项目管理专业人士' },
      { value: 'ACP 敏捷认证', label: 'PMI-ACP 敏捷管理' },
      { value: 'NPDP', label: 'NPDP 产品经理国际认证' },
      { value: '人力资源管理师', label: '企业人力资源管理师' },
    ],
  },
  {
    label: '教育/法律/工程',
    title: '教育 / 法律 / 工程',
    options: [
      { value: '教师资格证', label: '中小学教师资格证' },
      { value: '法律职业资格', label: '法律职业资格证书' },
      { value: '二级建造师', label: '二级建造师' },
      { value: '一级建造师', label: '一级建造师' },
      { value: '造价工程师', label: '一级造价工程师' },
      { value: '执业药师', label: '执业药师' },
    ],
  },
]

/** 全部常见证书 value 集合（用于判断一个证书名是否属于常见项） */
const COMMON_CERT_VALUES = new Set(
  COMMON_CERT_GROUPS.flatMap((g) => g.options.map((o) => o.value)),
)

/** 证书关键词：命中即认为是证书描述（用于从简历文本启发式识别） */
const CERT_KEYWORD_RE =
  /(英语四六级|CET-?\s?[46]|雅思|IELTS|托福|TOEFL|BEC|CATTI|普通话|教师资格|教师资|软考|系统架构师|信息系统项目管理师|软件设计师|网络工程师|电子商务师|PMP|PMI-?ACP|NPDP|注册会计师|CPA|初级会计|中级会计|会计从业|CFA|FRM|ACCA|证券从业|基金从业|银行从业|税务师|法律职业资格|司法考试|HCIA|HCIP|HCIE|华为认证|阿里云|腾讯云|AWS|Azure|云计算|CKA|RHCE|CCNA|CCNP|思科|Oracle|OCP|CISP|ISTQB|计算机等级|计算机二级|计算机三级|执业医师|执业药师|护士执业|建造师|造价工程师|监理工程师|消防工程师|安全工程师|人力资源管理师|导游资格)/i

/** 规范化：去首尾空白与编号/分隔符残留 */
function cleanCertName(s: string): string {
  return s
    .replace(/^[\s\-–—·•*#\d]+[.、)）]?\s*/, '')
    .replace(/[（(].{0,14}(年|届|证书编号|编号)[^)）]*[)）]/g, '')
    .replace(/[，,；;。.！!？?]+$/, '')
    .trim()
}

/** 从一段文本按行提取证书候选（行含关键词且长度合理） */
function extractFromText(text: string, max = 12): string[] {
  if (!text) return []
  const out: string[] = []
  for (const rawLine of text.split(/[\n;；]+/)) {
    const line = cleanCertName(rawLine)
    if (!line || line.length > 40) continue
    if (!CERT_KEYWORD_RE.test(line)) continue
    // 排除"期望获得/备考中"之类的表述——只统计已持有的
    if (/备考|准备考|计划|期望|意向|正在学/.test(line)) continue
    out.push(line)
    if (out.length >= max) break
  }
  return out
}

/**
 * 从简历自动识别证书候选。
 * 优先级：parsed_json.certificates（新版解析器提取）> raw_text 启发式扫描。
 * 返回去重后的名称数组（每项即一个证书名）。
 */
export function extractCertsFromResume(
  parsed: Record<string, unknown> | null | undefined,
  rawText?: string | null,
): string[] {
  const found: string[] = []
  const push = (s: unknown) => {
    if (typeof s !== 'string') return
    const name = cleanCertName(s)
    if (!name || name.length > 40) return
    if (!found.some((x) => x === name || x.includes(name) || name.includes(x))) found.push(name)
  }

  // 1. 新版解析器的 certificates 字段（list[str] 或逗号串都兼容）
  const certs = parsed?.certificates
  if (Array.isArray(certs)) certs.forEach(push)
  else if (typeof certs === 'string' && certs.trim()) certs.split(/[、,，;；/]/).forEach(push)

  // 2. 旧版数据兜底：raw_text / summary / skills 启发式扫描
  if (found.length === 0) {
    if (typeof rawText === 'string' && rawText.trim()) extractFromText(rawText).forEach(push)
    if (found.length === 0 && typeof parsed?.summary === 'string') {
      extractFromText(parsed.summary).forEach(push)
    }
    if (found.length === 0 && Array.isArray(parsed?.skills)) {
      for (const s of parsed.skills as unknown[]) {
        if (typeof s === 'string' && CERT_KEYWORD_RE.test(s)) push(s)
      }
    }
  }

  return found.slice(0, 12)
}

/** 判断证书名是否已是常见清单项（是则保留标准 value，否则原样保留自由文本） */
export function normalizeCertTag(tag: string): string {
  const t = tag.trim()
  if (!t) return ''
  if (COMMON_CERT_VALUES.has(t)) return t
  return t
}
