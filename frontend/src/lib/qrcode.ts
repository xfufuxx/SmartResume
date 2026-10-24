/**
 * 二维码工具库 —— 参考 jadeAI `src/lib/qrcode.ts` 的交互逻辑，适配本项目数据形状。
 *
 * 职责边界：URL → 二维码是确定性计算，**纯前端完成**（qrcode npm 库），
 * 不经过服务端、不落库、不消耗 LLM 额度。
 *
 * 输入：URL 字符串 + 可选样式；输出：SVG 字符串 / PNG dataURL / Blob（下载用）。
 */

import QRCode from 'qrcode'

export interface QrGenerateOptions {
  /** 画布边长（px，正方形） */
  size?: number
  /** 安静区（模块数），1 是扫码容忍下限 */
  margin?: number
  /** 前景色（码点） */
  dark?: string
  /** 背景色 */
  light?: string
  /** 纠错等级：L 7% / M 15% / Q 25% / H 30% */
  errorCorrection?: 'L' | 'M' | 'Q' | 'H'
}

export const QR_DEFAULTS: Required<QrGenerateOptions> = {
  size: 240,
  margin: 1,
  dark: '#000000',
  light: '#ffffff',
  errorCorrection: 'M',
}

/** 统一补全协议：缺省按 https 处理（与 jadeAI 一致，用户输 github.com 也能扫） */
export function normalizeUrl(url: string): string {
  const trimmed = (url || '').trim()
  if (!trimmed) return trimmed
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

/**
 * 二维码 URL 校验：空串视为合法（允许用户中途清空，由调用方决定是否提交）；
 * 非空时必须是 http(s) 且主机名形如 example.com / localhost / IPv4。
 */
export function isValidQrUrl(url: string): boolean {
  if (!url.trim()) return true
  try {
    const parsed = new URL(normalizeUrl(url))
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    const host = parsed.hostname
    return host === 'localhost' || /\.\w{2,}$/.test(host) || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
  } catch {
    return false
  }
}

function buildOptions(options?: QrGenerateOptions) {
  const merged = { ...QR_DEFAULTS, ...(options || {}) }
  return {
    width: merged.size,
    margin: merged.margin,
    errorCorrectionLevel: merged.errorCorrection,
    color: { dark: merged.dark, light: merged.light },
  }
}

/** 生成 SVG 字符串（服务端/Node 亦可运行，无 canvas 依赖） */
export async function generateQrSvg(url: string, options?: QrGenerateOptions): Promise<string> {
  const target = normalizeUrl(url)
  if (!isValidQrUrl(target)) throw new Error(`无法生成二维码：URL 不合法（${url}）`)
  return QRCode.toString(target, { ...buildOptions(options), type: 'svg' })
}

/** 生成 PNG dataURL（浏览器 canvas 路径；Node 无 canvas 包时不可用） */
export async function generateQrPngDataUrl(url: string, options?: QrGenerateOptions): Promise<string> {
  const target = normalizeUrl(url)
  if (!isValidQrUrl(target)) throw new Error(`无法生成二维码：URL 不合法（${url}）`)
  return QRCode.toDataURL(target, { ...buildOptions(options), type: 'image/png' })
}

/** SVG 字符串 → PNG Blob（浏览器下载用；Node 环境无 DOM，调用会抛错） */
export async function svgToPngBlob(svg: string, size = QR_DEFAULTS.size): Promise<Blob> {
  if (typeof document === 'undefined') {
    throw new Error('svgToPngBlob 仅支持浏览器环境')
  }
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  const image = new Image()
  image.width = size
  image.height = size
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('SVG 光栅化失败'))
    image.src = dataUrl
  })
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建 2D 画布上下文')
  ctx.drawImage(image, 0, 0, size, size)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG 导出失败'))), 'image/png')
  })
}

/** 浏览器触发下载（dataURL 或 Blob 两种来源） */
export function triggerDownload(source: string | Blob, filename: string): void {
  if (typeof document === 'undefined') return
  const url = typeof source === 'string' ? source : URL.createObjectURL(source)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  if (typeof source !== 'string') {
    // 让浏览器完成跳转后再回收，iOS Safari 需要延迟
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

/** 从任意文本中抓取 http(s) 链接（简历自由文本里挖可扫码的 URL） */
export function extractUrlsFromText(text: string): string[] {
  if (!text) return []
  const matched = text.match(/https?:\/\/[^\s<>"'）)，。；、]+/gi) || []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of matched) {
    const cleaned = raw.replace(/[.,;:!?)\]}'"]+$/, '')
    const key = cleaned.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(cleaned)
  }
  return out
}

/** 递归收集简历 JSON 里全部字符串值上的候选链接，按出现顺序去重 */
export function collectResumeLinks(
  resume: Record<string, unknown> | null | undefined,
): { label: string; url: string }[] {
  const found: { label: string; url: string }[] = []
  const seen = new Set<string>()

  const walk = (node: unknown, path: string) => {
    if (typeof node === 'string') {
      for (const url of extractUrlsFromText(node)) {
        const key = url.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        found.push({ label: guessLinkLabel(url, path), url })
      }
      return
    }
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`))
      return
    }
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        walk(v, path ? `${path}.${k}` : k)
      }
    }
  }

  walk(resume || {}, '')
  return found
}

/** 按 URL 主机名猜一个人性化标签（github.com → GitHub） */
export function guessLinkLabel(url: string, _path = ''): string {
  try {
    const host = new URL(normalizeUrl(url)).hostname.replace(/^www\./, '')
    const map: Record<string, string> = {
      'github.com': 'GitHub',
      'gitee.com': 'Gitee',
      'linkedin.com': 'LinkedIn',
      'zhihu.com': '知乎',
      'juejin.cn': '掘金',
      'csdn.net': 'CSDN',
      'blog.csdn.net': 'CSDN 博客',
    }
    if (map[host]) return map[host]
    const first = host.split('.')[0]
    return first ? first.charAt(0).toUpperCase() + first.slice(1) : host
  } catch {
    return '链接'
  }
}

/** 由 URL 推导下载文件名（主机名 + 短哈希，避免特殊字符） */
export function qrFileName(url: string, ext: 'png' | 'svg'): string {
  let stem = 'qrcode'
  try {
    const host = new URL(normalizeUrl(url)).hostname.replace(/^www\./, '')
    stem = `qrcode-${host.replace(/[^\w.-]/g, '_')}`
  } catch {
    /* 用默认名 */
  }
  return `${stem}.${ext}`
}
