/**
 * 模拟面试的纯函数：流式正文过滤、环节文案、快捷操作、消息合并。
 *
 * 单独抽出来的原因：
 * 1. SSE 增量里会夹着 ```question {...}``` 结构化块，直接渲染会出现大段 JSON；
 *    必须边流边剥（块可能被拆在多个 delta 里）；
 * 2. 这些逻辑是纯字符串/数组运算，用 node --test 覆盖成本低、回归价值高。
 */
import type {
  InterviewChatMessage, InterviewIntent, InterviewPlanItem, InterviewStage, InterviewStageKey,
} from '@/types'

// fenced 块的语言标注不保证是块名：实测模型会写 ```json 包 {"summary": ...}。
// 匹配任意 fenced 块，再按「标注 + 块体键名」判定是否三类结构化块。
const FENCE_RE = /```([\w-]*)[ \t]*\n([\s\S]*?)```/g
const STRUCT_HINT_RE = /["']\s*(?:question|feedback|summary)\s*["']/
const BLOCK_KINDS = ['question', 'feedback', 'summary']
const AMBIGUOUS_LANGS = ['', 'json', 'yaml', 'json5']
// 明确的普通代码语言：即使未闭合也不截断（流式期间显示半截代码，完成后完整）
const COMMON_CODE_LANGS = new Set([
  'python', 'js', 'javascript', 'ts', 'typescript', 'java', 'go', 'rust',
  'c', 'cpp', 'csharp', 'sql', 'bash', 'sh', 'shell', 'html', 'css',
])

function isStructuredBlock(lang: string, body: string): boolean {
  const tag = (lang || '').toLowerCase()
  if (BLOCK_KINDS.includes(tag)) return true
  if (!AMBIGUOUS_LANGS.includes(tag)) return false
  return STRUCT_HINT_RE.test(body.slice(0, 2000))
}

/**
 * 流式展示文本：剥掉已闭合的结构化块（兼容 ```json 包裹），并截断尚未闭合的块。
 *
 * 例：`点评…\n```question\n{"category": "技术` → `点评…`
 * 普通代码块（如 ```python）原样保留。
 */
export function stripStreamingBlocks(text: string): string {
  if (!text) return ''
  let out = text.replace(FENCE_RE, (m, lang: string, body: string) =>
    isStructuredBlock(lang, body) ? '' : m)
  // 块可能只吐出了开头（``` 已出现但还没闭合）：存在未闭合 fence 且语言标注
  // 不是明确普通代码语言时截断，防止半截 JSON 漏进气泡。
  // （fence 标记成对出现，奇数个说明有未闭合的）
  const fences = out.match(/```[\w-]*/g) || []
  if (fences.length % 2 === 1) {
    const open = out.lastIndexOf('```')
    const tag = ( /^```([\w-]*)/.exec(out.slice(open))?.[1] || '' ).toLowerCase()
    if (!COMMON_CODE_LANGS.has(tag)) out = out.slice(0, open)
  }
  out = out.replace(/\n{3,}/g, '\n\n')
  return out.trim()
}

export const STAGE_TEXT: Record<InterviewStage, string> = {
  briefing: '开场',
  asking: '面试中',
  finished: '已复盘',
}

export function stageText(stage?: InterviewStage | null): string {
  return stage ? STAGE_TEXT[stage] || '面试中' : '面试中'
}

/** 去重比较用的归一化：忽略空白与标点差异，避免「？」「.」导致匹配失败 */
function normalizeForCompare(text: string): string {
  return text.replace(/\s+/g, '').replace(/[「」“”"'’‘：:，,。.？?！!…—\-、；;]/g, '')
}

/**
 * 正文与题目块去重：模型常把题干既写进正文、又放进 question 块，
 * 直接渲染会出现「气泡一句 + 题卡同一句」的重复。
 *
 * 做法是逐句比对：归一化后属于题干一部分的句子从正文删掉；
 * 删完只剩寒暄/反应（如「嗯，这块我记一下」）就保留，删空则整段不再渲染。
 * 题干过短（<12 字）时不动，避免误删「为什么？」这类常见短句。
 */
export function dedupeQuestionText(content: string, question?: string | null): string {
  const body = (content || '').trim()
  const q = (question || '').trim()
  if (!body || !q) return body
  const qNorm = normalizeForCompare(q)
  if (qNorm.length < 12) return body

  const sentences = body.match(/[^。！？!?；;\n]+[。！？!?；;\n]?/g) || [body]
  const kept = sentences.filter((sentence) => {
    const sNorm = normalizeForCompare(sentence)
    if (!sNorm) return false
    // 整句已被题干覆盖，或这句本身就包含题干（模型加了语气词），都算重复
    const covered = qNorm.includes(sNorm) || sNorm.includes(qNorm)
    return !(covered && sNorm.length >= 6)
  })
  return kept.join('').trim()
}

/** 环节名的兜底文案：后端 plan 缺失时（旧接口/只读快照）仍能显示人话 */
export const STAGE_KEY_LABEL: Record<InterviewStageKey, string> = {
  opening: '自我介绍',
  resume: '简历深挖',
  skill: '专业能力',
  behavior: '行为面试',
  motivation: '求职动机',
  salary: '薪资与到岗',
  reverse: '反问环节',
}

/** 每个环节给候选人的一句作答提示，贴在输入框上方 */
const STAGE_NOTE: Record<InterviewStageKey, string> = {
  opening: '先做一段自我介绍；面试官会顺着你讲的往下挖',
  resume: '会盯着简历细节问：你个人做了什么、结果怎么量化',
  skill: '对照岗位要求验证硬技能，用一个具体案例带出原理',
  behavior: '用 STAR 讲：情境、你的任务、你的动作、结果',
  motivation: '讲真实动机：为什么走、为什么这家、3 年想做什么',
  salary: '给区间并说明依据，比只报一个数字更有说服力',
  reverse: '轮到你了：问团队、考核、这个岗位当前最大的挑战',
}

export function stageNote(key?: InterviewStageKey | null): string {
  return (key && STAGE_NOTE[key]) || '像真面试一样回答，面试官会接着你的话往下问'
}

export function stageKeyLabel(key?: InterviewStageKey | null): string {
  return (key && STAGE_KEY_LABEL[key]) || ''
}

/** 当前环节在计划里的位置，用于「第 2 / 6 环节」标题 */
export function stagePosition(
  plan: InterviewPlanItem[] | undefined | null,
  key?: InterviewStageKey | null,
): { index: number; total: number; item: InterviewPlanItem } | null {
  if (!plan?.length) return null
  const index = plan.findIndex((p) => p.key === key)
  if (index < 0) return null
  return { index, total: plan.length, item: plan[index] }
}

export function stageHeadline(
  plan: InterviewPlanItem[] | undefined | null,
  key?: InterviewStageKey | null,
): string {
  const pos = stagePosition(plan, key)
  if (!pos) return stageKeyLabel(key)
  return `第 ${pos.index + 1} / ${pos.total} 环节 · ${pos.item.label}`
}

/** 某环节已出题数：plan 的区间与总题数算出，避免再存一份计数 */
export function stageUsed(item: InterviewPlanItem, askedCount: number): number {
  return Math.min(item.count, Math.max(0, askedCount - item.start))
}

export interface QuickReply {
  label: string
  /** 控制意图；为空表示把 label 当普通回答发出去 */
  intent?: InterviewIntent
}

/** 输入框上方的快捷操作：随环节变化，避免用户不知道能说什么。 */
export function quickReplies(
  stage?: InterviewStage | null,
  askedCount = 0,
  stageKey?: InterviewStageKey | null,
): QuickReply[] {
  if (stage === 'finished') return []
  if (!askedCount) {
    return [{ label: '开始吧', intent: 'start' }]
  }
  // 反问环节用户是提问方，给几个真实面试里值得问的方向，而不是「下一题」
  if (stageKey === 'reverse') {
    return [
      { label: '团队规模和汇报关系是怎样的？' },
      { label: '这个岗位当前最大的挑战是什么？' },
      { label: '考核和晋升怎么定？' },
    ]
  }
  return [
    { label: '给我提示', intent: 'hint' },
    { label: '下一题', intent: 'next' },
    { label: '跳过这题', intent: 'skip' },
    { label: '结束模拟', intent: 'finish' },
  ]
}

/** 题目卡上的展开按钮文案：反问环节问的是「该问什么」，不是「该怎么答」 */
export function questionActionLabels(stageKey?: InterviewStageKey | null): {
  outline: string
  sample: string
} {
  if (stageKey === 'reverse') {
    return { outline: '看可问的方向', sample: '看示范提问' }
  }
  return { outline: '看答题要点', sample: '看参考答案' }
}

/**
 * 把服务端返回的完整 turn 消息合并进列表：
 * - 存在同 id → 覆盖（流式占位被服务端真值替换）；
 * - 不存在 → 追加；
 * - 按 order_index 去重，防止重试/刷新后重复气泡。
 */
export function mergeTurnMessage(
  messages: InterviewChatMessage[],
  incoming: InterviewChatMessage,
): InterviewChatMessage[] {
  const next = messages.some((m) => m.id === incoming.id)
    ? messages.map((m) => (m.id === incoming.id ? incoming : m))
    : [...messages, incoming]
  const seen = new Set<string>()
  return next.filter((m) => {
    if (seen.has(m.id)) return false
    seen.add(m.id)
    return true
  })
}

/** 复盘/清单面板：当前会话题目按分类聚合，保持出题顺序。 */
export function groupQuestionsByCategory<T extends { category?: string | null }>(
  questions: T[],
): Array<{ category: string; items: T[] }> {
  const order: string[] = []
  const map = new Map<string, T[]>()
  for (const q of questions) {
    const key = q.category || '综合'
    if (!map.has(key)) {
      map.set(key, [])
      order.push(key)
    }
    map.get(key)!.push(q)
  }
  return order.map((category) => ({ category, items: map.get(category)! }))
}
