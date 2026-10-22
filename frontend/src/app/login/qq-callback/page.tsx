'use client'

import React, { useEffect, useState } from 'react'
import { Card, Spin, Button, Typography } from 'antd'
import { FileTextOutlined } from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import { user as userApi } from '@/lib/api'

/**
 * QQ 登录回调页（后端 /api/auth/qq/callback 最终跳转到此处）。
 *
 * 令牌经 URL hash 片段传入（#access_token=...&refresh_token=...）：
 * - hash 不会随请求发送到服务器，也不进 Referer，比 query 参数安全；
 * - 读取后立即用 history.replaceState 抹掉地址栏中的 hash，避免残留。
 *
 * 失败时后端带 #error=中文原因 跳回，本页展示原因并引导回登录页。
 */
type Phase = 'processing' | 'error'

export default function QqCallbackPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('processing')
  const [errorText, setErrorText] = useState('')

  // 挂载时一次性快照 hash 参数。
  // 坑：reactStrictMode 下 effect 会被执行两次，若在 effect 里读 hash，
  // 第一次读取后随即 replaceState 清掉地址栏 hash，第二次就读到空值、
  // 把首次拿到的令牌/错误覆盖成「回调参数缺失」。快照只取一次，规避该问题。
  const [hashParams] = useState<URLSearchParams | null>(() =>
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.hash.replace(/^#/, ''))
      : null,
  )

  useEffect(() => {
    const run = async () => {
      // 读完立即抹掉地址栏 hash，避免令牌/错误信息残留在浏览器地址栏
      window.history.replaceState(null, '', window.location.pathname)

      const accessToken = hashParams?.get('access_token')
      const refreshToken = hashParams?.get('refresh_token')
      const error = hashParams?.get('error')

      if (error) {
        setErrorText(error)
        setPhase('error')
        return
      }
      if (!accessToken) {
        setErrorText('回调参数缺失，请重新登录')
        setPhase('error')
        return
      }

      try {
        localStorage.setItem('token', accessToken)
        if (refreshToken) localStorage.setItem('refreshToken', refreshToken)
        // 拉取个人资料写入 user 缓存（与邮箱登录行为一致）；失败不阻塞登录
        try {
          const res = await userApi.getProfile()
          localStorage.setItem('user', JSON.stringify(res.data))
        } catch {
          /* 资料缓存缺失不影响使用，各页面按需再拉 */
        }
        router.replace('/dashboard')
      } catch {
        setErrorText('登录状态保存失败，请重试')
        setPhase('error')
      }
    }
    run()
  }, [router, hashParams])

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: 'var(--bg-body)',
      padding: 24,
    }}>
      <Card
        className="animate-scale"
        style={{
          width: 380,
          borderRadius: 'var(--radius-2xl)',
          border: '1px solid var(--border-light)',
          background: 'var(--bg-card)',
          boxShadow: 'var(--shadow-lg)',
        }}
        styles={{ body: { padding: '36px 32px 30px' } }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            background: 'linear-gradient(135deg, #12B7F5 0%, #0E9BD8 100%)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
          }}>
            <FileTextOutlined style={{ color: '#fff', fontSize: 24 }} />
          </div>

          {phase === 'processing' ? (
            <>
              <Typography.Title level={4} style={{ marginBottom: 6, color: 'var(--text-primary)' }}>
                QQ 登录成功
              </Typography.Title>
              <Typography.Text style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>
                正在进入工作台…
              </Typography.Text>
              <div style={{ marginTop: 18 }}>
                <Spin size="small" />
              </div>
            </>
          ) : (
            <>
              <Typography.Title level={4} style={{ marginBottom: 8, color: 'var(--text-primary)' }}>
                登录未完成
              </Typography.Title>
              <Typography.Paragraph style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 20 }}>
                {errorText}
              </Typography.Paragraph>
              <Button type="primary" block onClick={() => router.replace('/login')}>
                返回登录页
              </Button>
            </>
          )}
        </div>
      </Card>
    </div>
  )
}
