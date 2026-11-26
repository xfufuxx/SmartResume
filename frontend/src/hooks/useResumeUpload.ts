'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { resumes, notifyResumesChanged } from '@/lib/api'

/**
 * 简历上传的阶段化状态机（准备 → 上传 → 解析 → 完成 / 失败 / 取消）。
 *
 * 进度观感约定（2026-11-26 改版）：不再出现「开局即 99%/100%」的进度条——
 * 把整个流程映射到一条 0~100 的进度轴上分段推进：
 *   准备  0~5%    （校验文件、构建请求体，短暂）
 *   上传  5~35%   （axios onUploadProgress 真实字节进度映射到此区间）
 *   解析  35~88%  （OCR+LLM 耗时不定：每秒缓慢 +2% 爬升，88% 封顶驻留；
 *                  不假装精确，但让用户对「还要多久」有大致预期）
 *   完成  100%
 * 同时提供 cancel()：中止请求、清理计时器、进入 cancelled 态，
 * 由 UI 展示「已取消」并允许重新上传。
 */
export type ResumeUploadPhase =
  | 'idle' | 'preparing' | 'uploading' | 'parsing' | 'done' | 'error' | 'cancelled'

/** 进度轴各阶段的锚点（与组件内阶段指示条保持一致） */
export const UPLOAD_PROGRESS = {
  PREPARE_END: 5,
  UPLOAD_END: 35,
  PARSE_CAP: 88,
  PARSE_STEP_PER_SEC: 2,
} as const

export interface ResumeUploadResult {
  id: string
  parsed_json: any
  original_file_url: string | null
  file_type: string
  message?: string
}

export function useResumeUpload() {
  const [phase, setPhase] = useState<ResumeUploadPhase>('idle')
  const [percent, setPercent] = useState(0)
  const [fileName, setFileName] = useState('')
  const [elapsed, setElapsed] = useState(0)
  // 失败原因（透传后端 detail），供进度条错误态展示
  const [errorMsg, setErrorMsg] = useState('')

  // phase 镜像 ref：cancel() 需要同步读取当前阶段做守卫
  const phaseRef = useRef<ResumeUploadPhase>('idle')
  useEffect(() => { phaseRef.current = phase }, [phase])

  // 取消上下文：abortController 中止在途请求；cancelledRef 兜底标记
  const abortRef = useRef<AbortController | null>(null)
  const cancelledRef = useRef(false)

  // 解析阶段：每秒累计等待时长 + 进度缓慢爬升（35% → 88% 封顶）
  useEffect(() => {
    if (phase !== 'parsing') return
    // 兜底：部分环境 XHR 不回报 e.total，上传段 percent 停在 0——
    // 进入解析时先抬到上传段终点锚点，避免从 0 缓爬造成「几乎没动」的观感
    setPercent((p) => (p < UPLOAD_PROGRESS.UPLOAD_END ? UPLOAD_PROGRESS.UPLOAD_END : p))
    const timer = window.setInterval(() => {
      setElapsed((e) => e + 1)
      setPercent((p) => Math.min(UPLOAD_PROGRESS.PARSE_CAP, p + UPLOAD_PROGRESS.PARSE_STEP_PER_SEC))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [phase])

  const upload = useCallback(async (file: File): Promise<ResumeUploadResult | null> => {
    cancelledRef.current = false
    const ac = new AbortController()
    abortRef.current = ac

    setFileName(file.name)
    setPercent(0)
    setElapsed(0)
    setErrorMsg('')
    setPhase('preparing')

    // 阶段一「准备」：校验文件、构建请求体（短暂驻留，让阶段条可见）
    await new Promise((resolve) => setTimeout(resolve, 250))
    if (cancelledRef.current) {
      abortRef.current = null
      return null
    }

    setPhase('uploading')
    // 兜底：少数环境 XHR 不回报 100% 进度，1.2s 后强制进入「解析中」，
    // 避免请求体早已发完却一直停在「正在上传」。
    const fallbackTimer = window.setTimeout(() => {
      setPhase((p) => (p === 'uploading' ? 'parsing' : p))
    }, 1200)

    try {
      // 阶段二「上传」：真实字节进度映射到 5%~35%，不发假进度
      const res = await resumes.upload(
        file,
        (p) => {
          setPercent(
            UPLOAD_PROGRESS.PREPARE_END
            + Math.round(p * (UPLOAD_PROGRESS.UPLOAD_END - UPLOAD_PROGRESS.PREPARE_END)),
          )
          if (p >= 100) setPhase('parsing')
        },
        ac.signal,
      )
      setPercent(100)
      setPhase('done')
      // 通知其他页面（首页 / 我的简历各自持有列表 state）即时刷新
      notifyResumesChanged()
      return res.data as ResumeUploadResult
    } catch (e) {
      if (isCancelError(e) || cancelledRef.current) {
        // 用户主动取消：静默进入 cancelled 态（不作为错误上报）
        setPhase('cancelled')
        return null
      }
      setErrorMsg(extractUploadError(e))
      setPhase('error')
      throw e
    } finally {
      window.clearTimeout(fallbackTimer)
      abortRef.current = null
    }
  }, [])

  /** 取消当前上传：中止请求 / 打断准备阶段，进入 cancelled 态。返回是否执行了取消 */
  const cancel = useCallback((): boolean => {
    const cur = phaseRef.current
    if (cur !== 'preparing' && cur !== 'uploading' && cur !== 'parsing') return false
    cancelledRef.current = true
    try { abortRef.current?.abort() } catch { /* 已 abort 或不存在，忽略 */ }
    setPhase('cancelled')
    return true
  }, [])

  const reset = useCallback(() => {
    cancelledRef.current = true // 若仍有在途请求，随 reset 一并作废
    try { abortRef.current?.abort() } catch { /* 同上 */ }
    setPhase('idle')
    setPercent(0)
    setElapsed(0)
    setFileName('')
    setErrorMsg('')
  }, [])

  const busy = phase === 'preparing' || phase === 'uploading' || phase === 'parsing'

  return { phase, percent, elapsed, fileName, errorMsg, busy, upload, cancel, reset }
}

/** axios 取消类错误识别（v1 CancelledError / 旧版 ECONNABORTED+canceled 文案） */
function isCancelError(e: unknown): boolean {
  const err = e as { code?: string; name?: string; message?: string }
  return err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError'
    || (err?.code === 'ECONNABORTED' && /cancel/i.test(err?.message || ''))
}

/** 从上传异常中提炼人话（优先后端 detail，网络/超时给原因码），与页面 toast 口径一致 */
export function extractUploadError(e: unknown): string {
  const err = e as { response?: { status?: number; data?: { detail?: unknown } }; message?: string; code?: string }
  const detail = err?.response?.data?.detail
  if (typeof detail === 'string' && detail.trim()) return detail
  const st = err?.response?.status
  if (st === 401) return '登录已过期，请重新登录'
  if (st === 413) return '文件过大，请选择 20MB 以内的文件'
  if (st && st >= 500) return `服务器内部错误（${st}），请稍后重试`
  const msg = err?.message || ''
  if (msg.includes('timeout') || err?.code === 'ECONNABORTED') return '处理超时，请稍后重试或改用 Word（.docx）格式'
  if (err?.code === 'ERR_NETWORK') return '网络错误，无法连接到服务器'
  return msg || '上传失败'
}

/** 供 UI 复用的阶段文案（阶段化进度版） */
export function uploadPhaseText(
  phase: ResumeUploadPhase,
  percent: number,
  fileName: string,
  elapsed: number,
) {
  if (phase === 'preparing') return `正在准备上传 ${fileName || '简历'}…`
  if (phase === 'uploading') return `正在上传 ${fileName || '简历'}… ${percent}%`
  if (phase === 'parsing') return `文件已上传，AI 正在解析简历… 已等待 ${elapsed} 秒`
  if (phase === 'done') return '解析完成'
  if (phase === 'cancelled') return '已取消上传'
  if (phase === 'error') return '上传失败'
  return ''
}
