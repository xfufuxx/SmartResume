'use client'

import { useCallback, useEffect, useState } from 'react'
import { resumes, notifyResumesChanged } from '@/lib/api'

/**
 * 简历上传的两阶段状态机。
 *
 * 背景：axios 的 onUploadProgress 只覆盖「请求体上传」，而真正耗时的是
 * 后端 OCR + LLM 解析（8s～1min+），这段期间浏览器不会有任何进度事件。
 * 因此把流程拆成「正在上传（真实百分比）」→「正在解析（诚实显示已等待时长）」，
 * 让用户始终知道进行到哪一步，而不是面对一个长期无反馈的转圈。
 * 遵循项目既有约定：解析阶段不伪装成进度百分比（见首页 formatDuration）。
 */
export type ResumeUploadPhase = 'idle' | 'uploading' | 'parsing' | 'done' | 'error'

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

  // 解析阶段每秒累加等待时长（真实耗时，不是伪装的进度）
  useEffect(() => {
    if (phase !== 'parsing') return
    const timer = window.setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => window.clearInterval(timer)
  }, [phase])

  const upload = useCallback(async (file: File): Promise<ResumeUploadResult> => {
    setFileName(file.name)
    setPercent(0)
    setElapsed(0)
    setPhase('uploading')

    // 兜底：少数环境 XHR 不回报 100% 进度，1.2s 后强制进入「解析中」，
    // 避免请求体早已发完却一直停在「正在上传」。
    const fallbackTimer = window.setTimeout(() => {
      setPhase((p) => (p === 'uploading' ? 'parsing' : p))
    }, 1200)

    try {
      const res = await resumes.upload(file, (p) => {
        setPercent(p)
        if (p >= 100) setPhase('parsing')
      })
      setPercent(100)
      setPhase('done')
      // 通知其他页面（首页 / 我的简历各自持有列表 state）即时刷新
      notifyResumesChanged()
      return res.data as ResumeUploadResult
    } catch (e) {
      setPhase('error')
      throw e
    } finally {
      window.clearTimeout(fallbackTimer)
    }
  }, [])

  const reset = useCallback(() => {
    setPhase('idle')
    setPercent(0)
    setElapsed(0)
    setFileName('')
  }, [])

  const busy = phase === 'uploading' || phase === 'parsing'

  return { phase, percent, elapsed, fileName, busy, upload, reset }
}

/** 供 UI 复用的阶段文案 */
export function uploadPhaseText(
  phase: ResumeUploadPhase,
  percent: number,
  fileName: string,
  elapsed: number,
) {
  if (phase === 'uploading') return `正在上传 ${fileName || '简历'}… ${percent}%`
  if (phase === 'parsing') return `文件已上传，AI 正在解析简历… 已等待 ${elapsed} 秒`
  if (phase === 'done') return '解析完成'
  if (phase === 'error') return '上传失败'
  return ''
}
