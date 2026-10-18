import type { MessageItem } from '@/types'

export interface MessageTarget {
  /** 目标路由（可带 query 深链参数，用于定位到具体内容） */
  path: string
  /** 目标模块名称，用于行内提示文案，如「→ 岗位能力测评」 */
  label: string
}

/**
 * 消息类型 → 功能模块 跳转映射。
 *
 * 映射依据：
 * - job     岗位动态：目前由「岗位能力测评完成」产生，ref_id = 测评记录 id
 *           → /capability?record=<id> 自动打开该测评报告
 * - optimize 简历优化：ref_id = 优化后的简历记录 id
 *           → /history?id=<id> 高亮定位该条优化记录
 * - score    简历评分：ref_id = 简历 id → /scoring 评分页
 * - interview 面试追踪/提醒：ref_id = 面试记录 id（可为空）→ /interviews
 * - warning  异常提醒（如简历解析失败）：ref_id = 简历 id → /resumes 我的简历
 * - vip      会员到期等账户类提醒（历史遗留类型）→ /profile 个人中心
 * - system / activity 纯通知类，无对应业务内容 → 不跳转，留在消息中心展开查看
 *
 * 未知类型同样不跳转，保证老数据/新类型不会导向错误页面。
 */
const MSG_TYPE_TARGETS: Record<string, (msg: MessageItem) => MessageTarget | null> = {
  job: (msg) => ({
    path: msg.ref_id ? `/capability?record=${encodeURIComponent(msg.ref_id)}` : '/capability',
    label: '岗位能力测评',
  }),
  optimize: (msg) => ({
    path: msg.ref_id ? `/history?id=${encodeURIComponent(msg.ref_id)}` : '/history',
    label: '优化历史',
  }),
  score: () => ({ path: '/scoring', label: '简历评分' }),
  interview: () => ({ path: '/interviews', label: '面试追踪' }),
  warning: () => ({ path: '/resumes', label: '我的简历' }),
  vip: () => ({ path: '/profile', label: '个人中心' }),
  system: () => null,
  activity: () => null,
}

/**
 * 解析一条消息的跳转目标。
 * 返回 null 表示该类型消息不跳转（调用方应退化为「展开详情」行为）。
 */
export function resolveMessageTarget(msg: MessageItem): MessageTarget | null {
  const resolver = MSG_TYPE_TARGETS[msg.msg_type]
  if (!resolver) return null
  return resolver(msg)
}
