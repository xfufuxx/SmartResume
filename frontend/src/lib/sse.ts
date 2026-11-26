/**
 * 通用 SSE 客户端：POST + 逐帧解析 `data: {...}\n\n`。
 *
 * 抽出来之前，润色与模拟押题各写一份 40 行分帧逻辑——两边协议演进时容易只改一边。
 * 事件结构由调用方按 type 分派；单帧 JSON 损坏只跳过该帧，不中断整条流。
 */
import { API_BASE_URL } from './api-base'
import { getToken } from './auth'

export interface SSEPayload {
  type: string
  [key: string]: unknown
}

export async function streamPostSSE(
  path: string,
  body: unknown,
  onEvent: (payload: SSEPayload) => void,
  signal?: AbortSignal,
  errorPrefix = '对话请求失败',
): Promise<void> {
  const token = getToken()
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
    signal,
  })

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    // 后端 4xx 的 detail 是中文可操作提示：优先透出，而不是只给状态码
    let detail = text.slice(0, 200)
    try {
      const parsed = JSON.parse(text)
      if (typeof parsed?.detail === 'string') detail = parsed.detail
    } catch {
      /* 非 JSON 响应保持原文截断 */
    }
    throw new Error(detail ? `${errorPrefix}（${res.status}）：${detail}` : `${errorPrefix}（${res.status}）`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let sep: number
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      const line = frame.split('\n').find((l) => l.startsWith('data:'))
      if (!line) continue
      try {
        onEvent(JSON.parse(line.slice(5).trim()) as SSEPayload)
      } catch {
        /* 单帧损坏不阻断流 */
      }
    }
  }
}
