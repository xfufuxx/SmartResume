'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { resumes, notifyResumesChanged } from '@/lib/api'

/**
 * 简历上传的阶段化进度（准备 → 上传 → 解析 → 完成 / 失败 / 取消）。
 *
 * 渐进式设计（2026-11-26 二次改版，修复「先跳 100% 再回落 88% 卡住」）：
 * 1. **单调不减**：所有写入走 advance()（percentRef 守卫取 max），
 *    任何竞态 / 定时器乱序都不可能让进度条回退；
 * 2. **上传段平滑自走**：真实字节进度回调优先（5%~32%），
 *    环境不回报进度时按缓动曲线自走（先快后慢），走到上限才切解析，
 *    与解析起点 35% 只差 3%，不存在「停 0 干等后大跳」；
 * 3. **解析段渐近爬升、永不静止**：按本机历史解析耗时做指数渐近曲线
 *    （35% → 96%，30s 约到 84%），并保证每 500ms 至少 +0.5%，
 *    条永远在可见地前进，不会「爬到某个数后一动不动」；
 * 4. **100% 只在真正完成时出现**，解析段上限 96%，从根上杜绝「先满再回落」；
 * 5. 100% 之后不再有任何定时器能写入（clearTimers + 单调守卫双保险）。
 *
 * 取消：cancel() 中止请求（AbortController）、清理全部定时器、进入 cancelled 态；
 * upload() 在取消时返回 null（不 throw），页面据此静默跳过成功回调。
 */
export type ResumeUploadPhase =
  | 'idle' | 'preparing' | 'uploading' | 'parsing' | 'done' | 'error' | 'cancelled'

/** 进度轴锚点（组件阶段指示条与此保持一致） */
export const UPLOAD_PROGRESS = {
  /** 准备阶段结束值 */
  PREPARE_END: 3,
  /** 上传段起点（真实字节进度映射区间 5%~32%） */
  UPLOAD_START: 5,
  /** 上传段上限（解析开始前不越过） */
  UPLOAD_CAP: 32,
  /** 解析段起点 */
  PARSE_START: 35,
  /** 解析段上限（100 只留给 done） */
  PARSE_CAP: 96,
} as const

const TICK_MS = 500
/** 上传段自走节拍（150ms 一次，肉眼连续） */
const WALK_MS = 150
const PREPARE_MS = 220
/** 安全阀：有真实进度回调但长时间不到 100%（个别浏览器尾部不再触发）时，8s 后仍切解析 */
const UPLOAD_STALL_MS = 8000

/** 本机历史解析耗时（毫秒），用于渐近曲线估算；无历史用 30s */
const PARSE_EST_KEY = 'resume_upload_parse_est_ms'
const PARSE_EST_DEFAULT = 30000
const PARSE_EST_MIN = 3000

function readParseEstimate(): number {
  if (typeof window === 'undefined') return PARSE_EST_DEFAULT
  try {
    const v = Number(window.localStorage.getItem(PARSE_EST_KEY))
    return Number.isFinite(v) && v >= PARSE_EST_MIN ? v : PARSE_EST_DEFAULT
  } catch {
    return PARSE_EST_DEFAULT
  }
}

function recordParseDuration(ms: number) {
  if (typeof window === 'undefined' || ms < PARSE_EST_MIN) return
  try {
    const prev = Number(window.localStorage.getItem(PARSE_EST_KEY))
    const next = Number.isFinite(prev) && prev >= PARSE_EST_MIN
      ? Math.round(prev * 0.6 + ms * 0.4) // 滚动平均：跟得上机器/网络变化，不被单次抖动带跑
      : Math.round(ms)
    window.localStorage.setItem(PARSE_EST_KEY, String(next))
  } catch {
    /* 隐私模式 / 存储禁用：估算退回默认值即可，不影响上传 */
  }
}

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
  // 本次解析耗时估算（秒），供 UI 显示「预计约 X 秒」
  const [estimateSec, setEstimateSec] = useState(Math.round(PARSE_EST_DEFAULT / 1000))

  // phase 镜像 ref：cancel()/定时器回调需要同步读取当前阶段
  const phaseRef = useRef<ResumeUploadPhase>('idle')
  useEffect(() => { phaseRef.current = phase }, [phase])

  // 进度值以 ref 为准（state 只负责渲染），保证单调性判断不受异步渲染影响
  const percentRef = useRef(0)
  const elapsedMsRef = useRef(0)
  const estRef = useRef(PARSE_EST_DEFAULT)

  const abortRef = useRef<AbortController | null>(null)
  const cancelledRef = useRef(false)
  /** 本次上传是否收到过真实字节进度（决定上传段靠回调切换还是自走到位后切换） */
  const sawProgressRef = useRef(false)
  const timersRef = useRef<{ prep?: number; auto?: number; parse?: number; fallback?: number }>({})
  // 准备阶段 sleep 的唤醒函数：取消/重置时清掉 prep 定时器后必须 resolve，
  // 否则 upload() 会永远挂在 await 上（页面 handleUpload 也不返回）
  const wakePrepRef = useRef<(() => void) | null>(null)

  const clearTimers = useCallback(() => {
    const t = timersRef.current
    if (t.prep) window.clearTimeout(t.prep)
    if (t.auto) window.clearInterval(t.auto)
    if (t.parse) window.clearInterval(t.parse)
    if (t.fallback) window.clearTimeout(t.fallback)
    timersRef.current = {}
    if (wakePrepRef.current) {
      wakePrepRef.current()
      wakePrepRef.current = null
    }
  }, [])

  /** 单调推进：新值只取不小于当前值的部分（杜绝回退），100 只由 done 写入 */
  const advance = useCallback((next: number) => {
    const v = Math.min(100, Math.max(percentRef.current, next))
    if (v <= percentRef.current) return
    percentRef.current = v
    setPercent(Math.round(v))
  }, [])

  /** 进入解析段：停掉上传段定时器，启动渐近爬升（每 500ms 至少 +0.5，永不停滞） */
  const enterParsing = useCallback(() => {
    if (phaseRef.current !== 'uploading') return
    const t = timersRef.current
    if (t.auto) { window.clearInterval(t.auto); t.auto = undefined }
    if (t.fallback) { window.clearTimeout(t.fallback); t.fallback = undefined }

    phaseRef.current = 'parsing'
    setPhase('parsing')
    advance(UPLOAD_PROGRESS.PARSE_START)

    timersRef.current.parse = window.setInterval(() => {
      elapsedMsRef.current += TICK_MS
      setElapsed(Math.floor(elapsedMsRef.current / 1000))
      const est = Math.max(PARSE_EST_MIN, estRef.current)
      // 指数渐近：等待到估算时长时约走完 80%，之后缓慢逼近上限
      const ratio = elapsedMsRef.current / est
      const curved = UPLOAD_PROGRESS.PARSE_START
        + (UPLOAD_PROGRESS.PARSE_CAP - UPLOAD_PROGRESS.PARSE_START) * (1 - Math.exp(-1.6 * ratio))
      // 下限保障：即使渐近曲线走平，也保证每 tick 有可见增量，条体永不「卡住」
      advance(Math.min(UPLOAD_PROGRESS.PARSE_CAP, Math.max(curved, percentRef.current + 0.5)))
    }, TICK_MS)
  }, [advance])

  const upload = useCallback(async (file: File): Promise<ResumeUploadResult | null> => {
    clearTimers()
    cancelledRef.current = false
    const ac = new AbortController()
    abortRef.current = ac

    percentRef.current = 0
    elapsedMsRef.current = 0
    estRef.current = readParseEstimate()
    sawProgressRef.current = false
    setEstimateSec(Math.max(3, Math.round(estRef.current / 1000)))
    setPercent(0)
    setElapsed(0)
    setFileName(file.name)
    setErrorMsg('')
    setPhase('preparing')
    advance(UPLOAD_PROGRESS.PREPARE_END)

    // 阶段一「准备」：短暂驻留，让用户看见起点而不是直接跳过
    await new Promise<void>((resolve) => {
      wakePrepRef.current = resolve
      timersRef.current.prep = window.setTimeout(() => {
        timersRef.current.prep = undefined
        wakePrepRef.current = null
        resolve()
      }, PREPARE_MS)
    })
    if (cancelledRef.current) { abortRef.current = null; return null }

    setPhase('uploading')
    // 阶段二「上传」：真实字节进度优先；不回报进度时按缓动自走（先快后慢），
    // 走到上传段上限后自动切解析——切点与解析起点（35）只差 3%，不会出现大跳变。
    timersRef.current.auto = window.setInterval(() => {
      const cur = percentRef.current
      if (cur < UPLOAD_PROGRESS.UPLOAD_CAP) {
        const step = Math.max(0.8, (UPLOAD_PROGRESS.UPLOAD_CAP - cur) * 0.12)
        advance(Math.min(UPLOAD_PROGRESS.UPLOAD_CAP, cur + step))
      } else if (!sawProgressRef.current) {
        enterParsing()
      }
    }, WALK_MS)
    // 安全阀：有真实进度但个别浏览器尾部不再触发 100% 时，兜底切解析
    timersRef.current.fallback = window.setTimeout(enterParsing, UPLOAD_STALL_MS)

    const startedAt = Date.now()
    try {
      const res = await resumes.upload(
        file,
        (p) => {
          sawProgressRef.current = true
          advance(
            UPLOAD_PROGRESS.UPLOAD_START
            + (p / 100) * (UPLOAD_PROGRESS.UPLOAD_CAP - UPLOAD_PROGRESS.UPLOAD_START),
          )
          if (p >= 100) enterParsing()
        },
        ac.signal,
      )
      clearTimers()
      recordParseDuration(Date.now() - startedAt)
      advance(100)
      setPhase('done')
      // 通知其他页面（首页 / 我的简历各自持有列表 state）即时刷新
      notifyResumesChanged()
      return res.data as ResumeUploadResult
    } catch (e) {
      clearTimers()
      if (isCancelError(e) || cancelledRef.current) {
        // 用户主动取消：静默进入 cancelled 态（不作为错误上报）
        setPhase('cancelled')
        return null
      }
      setErrorMsg(extractUploadError(e))
      setPhase('error')
      throw e
    } finally {
      abortRef.current = null
    }
  }, [advance, clearTimers, enterParsing])

  /** 取消当前上传：中止请求 / 打断准备阶段，进入 cancelled 态。返回是否执行了取消 */
  const cancel = useCallback((): boolean => {
    const cur = phaseRef.current
    if (cur !== 'preparing' && cur !== 'uploading' && cur !== 'parsing') return false
    cancelledRef.current = true
    clearTimers()
    try { abortRef.current?.abort() } catch { /* 已 abort 或不存在，忽略 */ }
    setPhase('cancelled')
    return true
  }, [clearTimers])

  const reset = useCallback(() => {
    cancelledRef.current = true // 若仍有在途请求，随 reset 一并作废
    clearTimers()
    try { abortRef.current?.abort() } catch { /* 同上 */ }
    percentRef.current = 0
    elapsedMsRef.current = 0
    setPhase('idle')
    setPercent(0)
    setElapsed(0)
    setFileName('')
    setErrorMsg('')
  }, [clearTimers])

  const busy = phase === 'preparing' || phase === 'uploading' || phase === 'parsing'

  return { phase, percent, elapsed, fileName, errorMsg, estimateSec, busy, upload, cancel, reset }
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

/** 供 UI 复用的阶段文案（渐进式进度版） */
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
