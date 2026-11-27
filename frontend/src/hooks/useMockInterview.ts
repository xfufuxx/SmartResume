'use client'

/**
 * useMockInterview —— 模拟面试的会话状态机。
 *
 * 职责边界：
 * - 只处理「创建/打开/对话/停止/删除」与消息合并，不碰任何渲染；
 * - 流式正文单独放在 streamText（原始增量，渲染前过 stripStreamingBlocks）；
 * - 服务端 turn 事件返回的完整消息才是真值：用它覆盖本地占位，避免前后端两份内容漂移；
 * - 用户作答先乐观上屏（刷新后由后端消息重放，不再本地补）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { message as antdMessage } from 'antd'

import { interview } from '@/lib/api'
import { mergeTurnMessage } from '@/lib/interview-chat'
import type {
  InterviewChatMessage, InterviewIntent, InterviewPlanItem, InterviewQuestion,
  InterviewSessionDetail, InterviewStage, InterviewStageKey,
} from '@/types'

export interface MockInterviewConfig {
  resume_id: string | null
  job_image_id: string | null
  question_count: number
}

const QUICK_POLL_MS = 2500
const QUICK_TIMEOUT_MS = 180_000

let _seq = 0
const localId = (prefix: string) => `${prefix}-${++_seq}-${Date.now()}`

export function useMockInterview() {
  const [session, setSession] = useState<InterviewSessionDetail | null>(null)
  const [messages, setMessages] = useState<InterviewChatMessage[]>([])
  const [streamText, setStreamText] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [quickGenerating, setQuickGenerating] = useState(false)
  const [quickHint, setQuickHint] = useState('')
  /** 每完成一轮 stage=finished 的轮次自增：页面用它精确触发历史列表刷新 */
  const [finishedTick, setFinishedTick] = useState(0)

  const abortRef = useRef<AbortController | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  useEffect(() => () => {
    abortRef.current?.abort()
    if (pollRef.current) clearInterval(pollRef.current)
  }, [])

  const applySession = useCallback((next: InterviewSessionDetail) => {
    setSession(next)
    setMessages(next.messages || [])
  }, [])

  const runTurn = useCallback(async (
    sessionId: string,
    intent: InterviewIntent,
    text = '',
  ) => {
    if (abortRef.current) return
    const controller = new AbortController()
    abortRef.current = controller
    setStreaming(true)
    setStreamText('')
    setError(null)

    // 作答先乐观上屏：控制意图（提示/跳过/结束）不产生用户气泡
    let optimisticId: string | null = null
    let errored = false
    if (intent === 'answer' && text.trim()) {
      optimisticId = localId('local-answer')
      setMessages((prev) => [...prev, {
        id: optimisticId!,
        session_id: sessionId,
        role: 'user',
        kind: 'answer',
        content: text.trim(),
        payload: {},
        order_index: -1,
      }])
    }

    try {
      await interview.chat(
        sessionId,
        { intent, message: text },
        {
          onMeta: (info) => {
            setSession((prev) => (prev ? {
              ...prev,
              // 注意：这里不更新 stage。meta 在 LLM 开跑前就到达，此时后端还未提交；
              // 若提前置 finished，页面会拿旧库数据刷新列表，且轮次结束后值不再变化、永不重刷。
              // stage 只认 turn 事件（后端 commit 之后才发出，是权威值）。
              stage_key: (info.stage_key as InterviewStageKey) || prev.stage_key,
              plan: (info.plan as InterviewPlanItem[]) || prev.plan,
              turn_index: info.turn ?? prev.turn_index,
              question_count: info.asked_count ?? prev.question_count,
              target_count: info.target_count ?? prev.target_count,
            } : prev))
          },
          onDelta: (delta) => setStreamText((prev) => prev + delta),
          onTurn: (info) => {
            setStreamText('')
            setMessages((prev) => mergeTurnMessage(prev, info.message))
            const freshQuestion = info.message.payload?.question
            setSession((prev) => {
              if (!prev) return prev
              const questions = freshQuestion && !prev.questions.some((q) => q.id === freshQuestion.id)
                ? [...prev.questions, freshQuestion]
                : prev.questions
              return {
                ...prev,
                stage: info.stage,
                // 环节以服务端为准：追问留在原环节，新题可能已跨到下一环节
                stage_key: info.stage_key || info.message.payload?.stage_key || prev.stage_key,
                plan: info.plan || prev.plan,
                question_count: info.asked_count,
                target_count: info.target_count,
                questions,
                summary: info.message.payload?.summary || prev.summary,
                finished_at: info.stage === 'finished' ? new Date().toISOString() : prev.finished_at,
              }
            })
            // turn 事件在 db.commit() 之后发出，此时历史列表才能拉到已结束状态
            if (info.stage === 'finished') setFinishedTick((t) => t + 1)
          },
          onError: (msg) => {
            // SSE error = 请求已被受理（作答已落库），只丢助手回复，不撤回用户气泡
            setError(msg)
          },
        },
        controller.signal,
      )
    } catch (e: unknown) {
      if ((e as Error)?.name === 'AbortError') {
        // 主动停止：保留已上屏的回答，助手气泡丢弃（后端未落库、额度已退还）
        setStreamText('')
      } else {
        errored = true
        setError((e as Error)?.message || '对话失败，请稍后重试')
      }
    } finally {
      // 只有请求根本没被受理（额度/并发/参数错误）才撤回乐观气泡；
      // SSE error 时作答已落库，保留气泡更符合刷新后的真实数据。
      if (errored && optimisticId) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
      }
      setStreaming(false)
      abortRef.current = null
    }
  }, [])

  /** 新建并开场：创建会话 → 拉详情 → 自动发 intent=start */
  const start = useCallback(async (config: MockInterviewConfig) => {
    setLoading(true)
    setError(null)
    setMessages([])
    setStreamText('')
    try {
      const created = await interview.createSession({
        resume_id: config.resume_id,
        job_image_id: config.job_image_id,
        question_count: config.question_count,
      })
      const sid = (created.data as { id?: string })?.id
      if (!sid) throw new Error('创建会话失败：未返回会话 ID')
      const detail = await interview.getSession(sid)
      applySession(detail.data as InterviewSessionDetail)
      setLoading(false)
      await runTurn(sid, 'start')
    } catch (e: unknown) {
      const msg = (e as Error)?.message || '创建模拟会话失败，请稍后重试'
      setError(msg)
      antdMessage.error(msg)  // 此时还没有会话，ChatStream 的错误条无处渲染
      setLoading(false)
    }
  }, [applySession, runTurn])

  const openSession = useCallback(async (id: string) => {
    stop()
    setLoading(true)
    setError(null)
    setStreamText('')
    try {
      const res = await interview.getSession(id)
      applySession(res.data as InterviewSessionDetail)
    } catch (e: unknown) {
      const msg = (e as Error)?.message || '加载会话失败'
      setError(msg)
      antdMessage.error(msg)
    } finally {
      setLoading(false)
    }
  }, [applySession, stop])

  const answer = useCallback(async (text: string) => {
    if (!session || streaming) return
    await runTurn(session.id, 'answer', text)
  }, [session, streaming, runTurn])

  const control = useCallback(async (intent: InterviewIntent) => {
    if (!session || streaming) return
    await runTurn(session.id, intent)
  }, [session, streaming, runTurn])

  /** 快速押题（旧链路）：后台生成整套题，轮询完成后只读回放 */
  const generateQuick = useCallback(async (config: MockInterviewConfig) => {
    if (quickGenerating) return
    setQuickGenerating(true)
    setQuickHint('AI 正在生成整套押题，通常需要 20~60 秒…')
    setError(null)
    stopPolling()
    try {
      const res = await interview.generate(config.resume_id, config.job_image_id, config.question_count)
      const sid = (res.data as { session_id?: string })?.session_id
      if (!sid) throw new Error('提交失败：未返回会话 ID')
      const startedAt = Date.now()
      await new Promise<void>((resolve, reject) => {
        pollRef.current = setInterval(async () => {
          try {
            const detail = await interview.getSession(sid)
            const data = detail.data as InterviewSessionDetail
            if (data.status === 'completed') {
              stopPolling()
              applySession(data)
              resolve()
            } else if (data.status === 'failed') {
              stopPolling()
              reject(new Error(data.error_message || '生成失败，请稍后重试'))
            } else if (Date.now() - startedAt > QUICK_TIMEOUT_MS) {
              stopPolling()
              reject(new Error('生成超时，请稍后在历史记录里查看'))
            }
          } catch (e) {
            stopPolling()
            reject(e)
          }
        }, QUICK_POLL_MS)
      })
      antdMessage.success('快速押题已生成，可逐题查看要点')
    } catch (e: unknown) {
      const msg = (e as Error)?.message || '快速押题失败'
      setError(msg)
      antdMessage.error(msg)
    } finally {
      stopPolling()
      setQuickGenerating(false)
      setQuickHint('')
    }
  }, [applySession, quickGenerating, stopPolling])

  /** 收藏/笔记等题目资产变更：同步会话清单与消息气泡里的同一道题 */
  const updateQuestion = useCallback((questionId: string, patch: Partial<InterviewQuestion>) => {
    setSession((prev) => (prev ? {
      ...prev,
      questions: prev.questions.map((q) => (q.id === questionId ? { ...q, ...patch } : q)),
    } : prev))
    setMessages((prev) => prev.map((m) => {
      const q = m.payload?.question
      if (!q || q.id !== questionId) return m
      return { ...m, payload: { ...m.payload, question: { ...q, ...patch } } }
    }))
  }, [])

  const remove = useCallback(async (id: string) => {
    await interview.deleteSession(id)
    if (session?.id === id) {
      stop()
      setSession(null)
      setMessages([])
      setStreamText('')
    }
  }, [session?.id, stop])

  const reset = useCallback(() => {
    stop()
    setSession(null)
    setMessages([])
    setStreamText('')
    setError(null)
  }, [stop])

  return {
    session,
    messages,
    streamText,
    streaming,
    loading,
    error,
    quickGenerating,
    quickHint,
    /** 完成复盘轮次的次数：历史列表刷新的精确触发器 */
    finishedTick,
    start,
    answer,
    control,
    openSession,
    generateQuick,
    updateQuestion,
    remove,
    reset,
    stop,
    setError,
  }
}
