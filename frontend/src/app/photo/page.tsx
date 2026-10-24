'use client'

/**
 * AI 职业照页（/photo）：上传自拍 → 生成职业照 → 下载 / 设为简历头像。
 *
 * 与后端 /api/ai-photo/generate 的约定：
 * - Key 由用户自带（localStorage 持久化），随请求上传、服务端不落库；
 * - 错误走 HTTP 200 + body.error（quota_exceeded / invalid_key / safety_filtered /
 *   generate_failed），必须按 error 字段分支，不能只 catch HTTP 异常；
 * - 每用户每日上限 AI_PHOTO_DAILY_LIMIT 次，生成失败自动退还。
 *
 * 「设为简历头像」：把生成图写入某条优化记录的 optimized_json.personal_info.avatar
 * （PUT /content）。头像随简历数据进模板渲染（_avatar.html 宏），预览与 PDF 同链生效。
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Input,
  Modal,
  Segmented,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd'
import {
  CameraOutlined,
  CheckCircleOutlined,
  CloudDownloadOutlined,
  KeyOutlined,
  PictureOutlined,
  ReloadOutlined,
  SmileOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/AppLayout'
import AuthGate from '@/components/AuthGate'
import { aiPhoto, editor, optimize } from '@/lib/api'
import { getToken } from '@/lib/auth'

const { Text, Paragraph } = Typography

/** localStorage 键：用户自带 Gemini Key（与 JadeAI 同思路，服务端不落库） */
const API_KEY_STORAGE = 'gemini_api_key'

/** 默认提示词：自拍 → 职业照（面部特征保持，仅换装/背景/光线） */
const DEFAULT_PROMPT =
  '将这张自拍照转换成专业职业照：保持人物面部特征与发型不变，着装改为深色修身西装外套搭配白色衬衫，' +
  '背景改为纯净的浅灰蓝色渐变摄影背景，光线柔和均匀，呈现出专业、自信的形象。照片清晰度高，肤色自然。'

const ASPECT_OPTIONS = [
  { label: '1:1 方形', value: '1:1' },
  { label: '3:4 简历', value: '3:4' },
  { label: '2:3 一寸', value: '2:3' },
  { label: '4:3 横版', value: '4:3' },
]

/** 客户端压缩：长边 ≤1024px、JPEG 0.9（与 JadeAI 同参数；再大的图上游拒绝） */
async function resizeImage(file: File | Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片解析失败，请换一张试试'))
    image.src = dataUrl
  })
  const MAX = 1024
  let { width, height } = img
  if (width > height && width > MAX) {
    height = Math.round((height * MAX) / width)
    width = MAX
  } else if (height >= width && height > MAX) {
    width = Math.round((width * MAX) / height)
    height = MAX
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('浏览器不支持 canvas')
  ctx.drawImage(img, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', 0.9)
}

function formatSize(dataUrl: string): string {
  const base64 = dataUrl.split(',')[1] || ''
  const kb = Math.round((base64.length * 0.75) / 1024)
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`
}

export default function PhotoPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)

  // ── API Key（用户自带，localStorage 持久化） ──
  // 两个概念必须分开：apiKey=输入框当前值（随请求上传）；savedKey=已落盘的值
  // （决定「已配置」态与显示分支）。曾用同一个值驱动两者：一键入字 UI 就假装
  // 「已保存」但 localStorage 从未写入——本地看起来成功，刷新后 Key 丢了。
  const [apiKey, setApiKey] = useState('')
  const [savedKey, setSavedKey] = useState('')
  const [keyEditing, setKeyEditing] = useState(false)

  // ── 自拍原图（压缩后 dataURL）与拍照弹窗 ──
  const [sourceImage, setSourceImage] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // ── 生成参数 ──
  const [aspectRatio, setAspectRatio] = useState('3:4')
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [requirements, setRequirements] = useState('')

  // ── 生成状态与结果 ──
  const [generating, setGenerating] = useState(false)
  const [resultImage, setResultImage] = useState('')
  const [resultText, setResultText] = useState('')
  const [usedCount, setUsedCount] = useState<number | null>(null)

  // ── 设为简历头像：记录选择弹窗 ──
  const [pickerOpen, setPickerOpen] = useState(false)
  const [records, setRecords] = useState<Array<{ id: string; title: string; template?: string }>>([])
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const t = getToken()
    if (!t) {
      router.push('/login')
      return
    }
    setToken(t)
    const saved = localStorage.getItem(API_KEY_STORAGE) || ''
    setSavedKey(saved)
    setApiKey(saved)
    // 没有已存的 Key → 直接展开编辑态，少一次点击
    setKeyEditing(!saved)
  }, [router])

  // 卸载时关闭摄像头（避免离开页面后指示灯常亮）
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const saveKey = useCallback(() => {
    const key = apiKey.trim()
    if (key) {
      localStorage.setItem(API_KEY_STORAGE, key)
      setSavedKey(key)
      message.success('API Key 已保存到本机浏览器')
    } else {
      localStorage.removeItem(API_KEY_STORAGE)
      setSavedKey('')
      message.info('已清除本机保存的 API Key')
    }
    setKeyEditing(false)
  }, [apiKey])

  const handlePickFile = useCallback(async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      message.error('请选择图片文件（JPG / PNG / WebP）')
      return
    }
    try {
      const dataUrl = await resizeImage(file)
      setSourceImage(dataUrl)
      setResultImage('')
    } catch (e) {
      message.error((e as Error).message || '图片处理失败')
    }
  }, [])

  const openCamera = useCallback(async () => {
    setCameraOpen(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      })
      streamRef.current = stream
      // Modal 渲染完成后再绑定流（ref 就绪）
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(() => undefined)
        }
      })
    } catch {
      setCameraOpen(false)
      message.error('无法访问摄像头，请检查浏览器权限或改用上传照片')
    }
  }, [])

  const closeCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCameraOpen(false)
  }, [])

  const capturePhoto = useCallback(async () => {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
    if (!blob) {
      message.error('拍照失败，请重试')
      return
    }
    const dataUrl = await resizeImage(blob)
    setSourceImage(dataUrl)
    setResultImage('')
    closeCamera()
    message.success('已捕获照片')
  }, [closeCamera])

  const handleGenerate = useCallback(async () => {
    if (!sourceImage) {
      message.warning('请先上传或拍摄一张自拍照')
      return
    }
    const key = apiKey.trim()
    if (!key) {
      message.warning('请先填写并保存你的 Gemini API Key')
      return
    }
    setGenerating(true)
    try {
      const res = await aiPhoto.generate({
        image: sourceImage,
        prompt: prompt.trim(),
        requirements: requirements.trim() || undefined,
        aspectRatio,
        apiKey: key,
      })
      const data = res.data || {}
      // 后端错误走 200 + body.error，必须分支处理
      if (data.error) {
        const tips: Record<string, string> = {
          quota_exceeded: data.detail || '今日生成次数已达上限，明天再试',
          invalid_key: 'API Key 无效，请检查后重填',
          safety_filtered: '照片被安全策略拦截，请换一张更清晰的正面照',
          generate_failed: data.detail || '生成服务异常，请稍后重试',
        }
        message.error(tips[data.error] || data.detail || '生成失败')
        return
      }
      if (!data.image) {
        message.error('生成结果为空，请重试')
        return
      }
      setResultImage(data.image)
      setResultText(data.text || '')
      if (typeof data.used === 'number') setUsedCount(data.used)
      message.success('职业照生成完成')
    } catch (e: unknown) {
      const err = e as { response?: { status?: number } }
      if (err?.response?.status === 401) {
        message.error('登录状态已过期，请重新登录')
      } else {
        message.error('网络异常，请稍后重试')
      }
    } finally {
      setGenerating(false)
    }
  }, [sourceImage, apiKey, prompt, requirements, aspectRatio])

  const handleDownload = useCallback(() => {
    if (!resultImage) return
    const a = document.createElement('a')
    a.href = resultImage
    a.download = `职业照-${aspectRatio.replace(':', 'x')}.jpg`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }, [resultImage, aspectRatio])

  const openPicker = useCallback(async () => {
    setPickerOpen(true)
    setRecordsLoading(true)
    try {
      const res = await optimize.list()
      const list = (res.data || []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        title: (r.job_title as string) || (r.category as string) || '未命名简历',
        template: r.template as string | undefined,
      }))
      setRecords(list)
      if (list.length === 0) message.info('还没有优化记录，请先优化一份简历再设置头像')
    } catch {
      message.error('获取简历列表失败')
    } finally {
      setRecordsLoading(false)
    }
  }, [])

  const applyAvatar = useCallback(
    async (recordId: string) => {
      setSaving(true)
      try {
        const detail = await optimize.get(recordId)
        const record = detail.data || {}
        const json = { ...(record.optimized_json || {}) }
        const personalInfo = { ...(json.personal_info || {}) }
        personalInfo.avatar = resultImage
        json.personal_info = personalInfo
        await editor.updateContent(recordId, json)
        message.success('已设为简历头像，预览与导出同步生效')
        setPickerOpen(false)
      } catch {
        message.error('设置失败，请稍后重试')
      } finally {
        setSaving(false)
      }
    },
    [resultImage],
  )

  if (!token) return <AuthGate activeKey="photo" />

  // 生成按钮：有值即可用（请求带当前 apiKey）；「已配置」标签只认落盘的 savedKey
  const keyReady = !!apiKey.trim()
  const showInput = !savedKey || keyEditing

  return (
    <AppLayout
      activeKey="photo"
      title="AI 职业照"
      subtitle="上传一张自拍，生成专业职业照，一键设为简历头像"
    >
      <div className="app-page-enter" style={{ maxWidth: 920, margin: '0 auto' }}>
        {/* ── Step 0：API Key ── */}
        <Card
          size="small"
          style={{ marginBottom: 16 }}
          title={
            <Space>
              <KeyOutlined />
              <span>Gemini API Key（自带）</span>
              {savedKey ? <Tag color="green" data-testid="api-key-configured">已配置</Tag> : <Tag color="orange" data-testid="api-key-missing">未配置</Tag>}
            </Space>
          }
          extra={
            <Button
              type="link"
              size="small"
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
            >
              免费申请 Key
            </Button>
          }
        >
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message="Key 仅保存在你的浏览器本地，随本次请求上传用于生成，服务端不存储、不用于其他用途。"
          />
          {showInput ? (
            <Space.Compact style={{ width: '100%' }}>
              <Input.Password
                value={apiKey}
                placeholder="粘贴你的 Gemini API Key（AIza...）"
                onChange={(e) => setApiKey(e.target.value)}
                onPressEnter={saveKey}
                autoFocus
              />
              <Button type="primary" onClick={saveKey} data-testid="save-api-key">
                保存
              </Button>
            </Space.Compact>
          ) : (
            <Space>
              <Text type="secondary">Key 已保存（{savedKey.slice(0, 6)}…{savedKey.slice(-4)}）</Text>
              <Button size="small" onClick={() => setKeyEditing(true)}>
                更换
              </Button>
            </Space>
          )}
        </Card>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* ── Step 1：上传自拍 ── */}
          <Card size="small" title={<Space><PictureOutlined /><span>1. 上传自拍</span></Space>}>
            <input
              type="file"
              id="photo-source-input"
              accept="image/png,image/jpeg,image/webp"
              style={{ display: 'none' }}
              onChange={(e) => {
                void handlePickFile(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            {sourceImage ? (
              <div style={{ textAlign: 'center' }}>
                <img
                  src={sourceImage}
                  alt="自拍预览"
                  style={{
                    maxWidth: '100%',
                    maxHeight: 260,
                    borderRadius: 8,
                    border: '1px solid var(--ant-color-border, #d9d9d9)',
                  }}
                />
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    已压缩 {formatSize(sourceImage)}（长边 ≤1024px）
                  </Text>
                </div>
                <Space style={{ marginTop: 8 }}>
                  <Button size="small" onClick={() => document.getElementById('photo-source-input')?.click()}>
                    换一张
                  </Button>
                  <Button size="small" type="text" danger onClick={() => { setSourceImage(''); setResultImage('') }}>
                    移除
                  </Button>
                </Space>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <SmileOutlined style={{ fontSize: 40, color: 'var(--primary-600, #1677ff)' }} />
                <div style={{ marginTop: 10 }}>
                  <Text type="secondary">正面、光线均匀、无遮挡的自拍效果最好</Text>
                </div>
                <Space style={{ marginTop: 14 }}>
                  <Button
                    type="primary"
                    icon={<PictureOutlined />}
                    onClick={() => document.getElementById('photo-source-input')?.click()}
                  >
                    选择照片
                  </Button>
                  <Button icon={<CameraOutlined />} onClick={() => void openCamera()}>
                    拍照
                  </Button>
                </Space>
              </div>
            )}
          </Card>

          {/* ── Step 2：生成选项 ── */}
          <Card size="small" title={<Space><ReloadOutlined /><span>2. 生成选项</span></Space>}>
            <div style={{ marginBottom: 12 }}>
              <Text strong>照片比例</Text>
              <div style={{ marginTop: 6 }}>
                <Segmented
                  block
                  value={aspectRatio}
                  onChange={(v) => setAspectRatio(v as string)}
                  options={ASPECT_OPTIONS}
                />
              </div>
              <div style={{ marginTop: 4 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  简历一寸照槽位为 5:7，建议选 2:3 或 3:4，裁切最自然
                </Text>
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <Text strong>提示词</Text>
              <Input.TextArea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
                style={{ marginTop: 6 }}
              />
            </div>
            <div>
              <Text strong>补充要求（可选）</Text>
              <Input
                value={requirements}
                onChange={(e) => setRequirements(e.target.value)}
                placeholder="如：佩戴细框眼镜、领带换成藏青色"
                style={{ marginTop: 6 }}
              />
            </div>
            <Button
              type="primary"
              block
              size="large"
              style={{ marginTop: 16 }}
              loading={generating}
              disabled={!sourceImage || !keyReady}
              onClick={() => void handleGenerate()}
            >
              {generating ? '正在生成职业照…' : '生成职业照'}
            </Button>
            {usedCount !== null && (
              <div style={{ textAlign: 'center', marginTop: 8 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  今日已生成 {usedCount} 次
                </Text>
              </div>
            )}
          </Card>
        </div>

        {/* ── Step 3：结果 ── */}
        <Card
          size="small"
          style={{ marginTop: 16 }}
          title={<Space><CheckCircleOutlined /><span>3. 生成结果</span></Space>}
        >
          {generating ? (
            <div style={{ textAlign: 'center', padding: 48 }}>
              <Spin size="large" tip="AI 正在绘制，约需 10-30 秒…" />
            </div>
          ) : resultImage ? (
            <div style={{ textAlign: 'center' }}>
              <img
                src={resultImage}
                alt="职业照生成结果"
                style={{
                  maxWidth: '100%',
                  maxHeight: 380,
                  borderRadius: 8,
                  border: '1px solid var(--ant-color-border, #d9d9d9)',
                }}
              />
              {resultText && (
                <Paragraph type="secondary" style={{ marginTop: 8, fontSize: 12 }}>
                  {resultText}
                </Paragraph>
              )}
              <Space style={{ marginTop: 12 }} size="middle">
                <Button icon={<CloudDownloadOutlined />} onClick={handleDownload}>
                  下载照片
                </Button>
                <Button type="primary" icon={<UserOutlined />} onClick={() => void openPicker()}>
                  设为简历头像
                </Button>
              </Space>
              <Paragraph type="secondary" style={{ marginTop: 12, fontSize: 12, marginBottom: 0 }}>
                设为头像后立即可见：简历预览与 PDF 导出同步更新（一寸照/圆形可在主题定制中切换）。
              </Paragraph>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 32 }}>
              <Text type="secondary">完成上面两步后，这里会显示生成的职业照</Text>
            </div>
          )}
        </Card>
      </div>

      {/* ── 拍照弹窗 ── */}
      <Modal
        title="拍摄自拍"
        open={cameraOpen}
        onCancel={closeCamera}
        footer={[
          <Button key="cancel" onClick={closeCamera}>
            取消
          </Button>,
          <Button key="capture" type="primary" icon={<CameraOutlined />} onClick={() => void capturePhoto()}>
            拍照
          </Button>,
        ]}
        destroyOnHidden
      >
        <div style={{ textAlign: 'center' }}>
          <video
            ref={videoRef}
            playsInline
            muted
            style={{ width: '100%', borderRadius: 8, background: '#000', transform: 'scaleX(-1)' }}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            画面为镜像预览，拍出的照片不会镜像
          </Text>
        </div>
      </Modal>

      {/* ── 选择简历弹窗 ── */}
      <Modal
        title="设为哪份简历的头像？"
        open={pickerOpen}
        onCancel={() => setPickerOpen(false)}
        footer={null}
        destroyOnHidden
      >
        {recordsLoading ? (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <Spin />
          </div>
        ) : records.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Text type="secondary">暂无优化记录</Text>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {records.map((r) => (
              <Button
                key={r.id}
                block
                loading={saving}
                onClick={() => void applyAvatar(r.id)}
                style={{ height: 'auto', padding: '10px 12px', textAlign: 'left' }}
              >
                <div>
                  <div>{r.title}</div>
                  {r.template && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      模板：{r.template}
                    </Text>
                  )}
                </div>
              </Button>
            ))}
          </div>
        )}
      </Modal>
    </AppLayout>
  )
}
