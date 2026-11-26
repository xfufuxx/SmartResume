/**
 * 模拟押题的纯函数：流式正文过滤、阶段文案、快捷操作、消息合并。
 *
 * 单独抽出来的原因：
 * 1. SSE 增量里会夹着 ```question {...}``` 结构化块，直接渲染会出现大段 JSON；
 *    必须边流边剥（块可能被拆在多个 delta 里）；
 * 2. 这些逻辑是纯字符串/数组运算，用 node --test 覆盖成本低、回归价值高。
 */
import type { InterviewChatMessage, InterviewIntent, InterviewStage } from '@/types'

const BLOCK_RE = /```(?:question|feedback|summary)\s*\n[\s\S]*?```/g

/**
 * 流式展示文本：剥掉已闭合的结构化块，并截断尚未闭合的块。
 *
 * 例：`点评…\n```question\n{"category": "技术` → `点评…`
 */
export function stripStreamingBlocks(text: string): string {
  if (!text) return ''
  let out = text.replace(BLOCK_RE, '')
  // 块可能只吐出了开头（含 ``` 但还没有闭合），从这里截断
  const open = out.lastIndexOf('```')
  if (open !== -1) out = out.slice(0, open)
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

export interface QuickReply {
  label: string
  /** 控制意图；为空表示把 label 当普通回答发出去 */
  intent?: InterviewIntent
}

/** 输入框上方的快捷操作：随阶段变化，避免用户不知道能说什么。 */
export function quickReplies(stage?: InterviewStage | null, askedCount = 0): QuickReply[] {
  if (stage === 'finished') return []
  if (!askedCount) {
    return [
      { label: '直接开始' },
      { label: '先练项目深挖' },
      { label: '先练技术题' },
    ]
  }
  return [
    { label: '给我提示', intent: 'hint' },
    { label: '下一题', intent: 'next' },
    { label: '跳过这题', intent: 'skip' },
    { label: '结束模拟', intent: 'finish' },
  ]
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
