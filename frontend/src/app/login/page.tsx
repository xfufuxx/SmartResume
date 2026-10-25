'use client'

import React, { useState, useEffect } from 'react'
import { Card, Form, Input, Button, Typography, Space, message, Checkbox, Divider } from 'antd'
import { MailOutlined, LockOutlined, FileTextOutlined } from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/api'
import { getToken, setAuthTokens, syncAuthCookie } from '@/lib/auth'
import QqIcon from '@/components/QqIcon'

/** next 参数校验：仅允许站内相对路径，防开放重定向（`//evil.com`） */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return ''
  return raw
}

export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [qqLoading, setQqLoading] = useState(false)

  useEffect(() => {
    // middleware 前置鉴权（C 方案）会把无票访问 307 到 /login?next=原路径。
    // 已登录（存量用户：localStorage 有票但 cookie 未镜像）→ 先补 cookie 再弹回，
    // 否则会形成「拦截→弹回→再拦截」死循环。
    syncAuthCookie()
    const t = getToken()
    if (t) router.replace(safeNext(new URLSearchParams(window.location.search).get('next')) || '/dashboard')
  }, [router])

  const handleLogin = async (values: { email: string; password: string; remember: boolean }) => {
    setLoading(true)
    try {
      const deviceId = localStorage.getItem('deviceId') || `web-${Date.now()}`
      localStorage.setItem('deviceId', deviceId)

      const res = await auth.login(values.email, values.password, deviceId)
      // setAuthTokens：localStorage + cookie 镜像同步（middleware 前置鉴权认 cookie）
      setAuthTokens(res.data.access_token, res.data.refresh_token)
      localStorage.setItem('user', JSON.stringify(res.data.user))
      message.success('登录成功')
      const next = safeNext(new URLSearchParams(window.location.search).get('next'))
      router.replace(next || '/dashboard')
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      message.error(detail || '邮箱或密码错误')
    } finally {
      setLoading(false)
    }
  }

  /** QQ 登录：向后端取授权页 URL 后整体跳转（appid/appkey 只存在于后端） */
  const handleQqLogin = async () => {
    setQqLoading(true)
    try {
      const res = await auth.qqAuthorize()
      window.location.href = res.data.authorize_url
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      message.error(detail || 'QQ 登录启动失败，请稍后重试')
    } finally {
      setQqLoading(false)
    }
  }

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
          width: 420,
          borderRadius: 'var(--radius-2xl)',
          border: '1px solid var(--border-light)',
          background: 'var(--bg-card)',
          boxShadow: 'var(--shadow-lg)',
        }}
        styles={{ body: { padding: '32px 36px 28px' } }}
      >
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: 'linear-gradient(135deg, var(--primary-600) 0%, var(--primary-700) 100%)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
            boxShadow: '0 4px 16px rgba(37, 99, 235, 0.3)',
          }}>
            <FileTextOutlined style={{ color: '#fff', fontSize: 26 }} />
          </div>
          <Typography.Title level={3} style={{
            marginBottom: 4,
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: 'var(--text-primary)',
          }}>
            欢迎回来
          </Typography.Title>
          <Typography.Text style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>
            登录智能简历，开启职业新篇章
          </Typography.Text>
        </div>

        {/* QQ 登录（第一位）：appid/appkey 只留在后端，点击直达 QQ 授权页 */}
        <Button
          block
          size="large"
          className="qq-login-btn"
          loading={qqLoading}
          onClick={handleQqLogin}
          icon={<QqIcon size={20} color="#fff" />}
        >
          使用 QQ 一键登录
        </Button>

        <Divider plain style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '20px 0 18px' }}>
          或使用邮箱登录
        </Divider>

        <Form onFinish={handleLogin} size="large" initialValues={{ remember: true }}>
          <Form.Item name="email" rules={[{ required: true, type: 'email', message: '请输入有效的邮箱' }]}>
            <Input prefix={<MailOutlined style={{ color: 'var(--text-tertiary)' }} />} placeholder="邮箱地址" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined style={{ color: 'var(--text-tertiary)' }} />} placeholder="密码" />
          </Form.Item>
          <Form.Item name="remember" valuePropName="checked" style={{ marginBottom: 16 }}>
            <Checkbox style={{ color: 'var(--text-tertiary)' }}>记住我（7天内免登录）</Checkbox>
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block style={{ height: 44, fontSize: 16, fontWeight: 600 }}>
              登录
            </Button>
          </Form.Item>
          <div style={{ textAlign: 'center' }}>
            <Space>
              <Link href="/forgot-password" style={{ color: 'var(--primary-600)', fontSize: 13 }}>忘记密码？</Link>
              <Typography.Text style={{ color: 'var(--text-disabled)' }}>|</Typography.Text>
              <Link href="/register" style={{ color: 'var(--primary-600)', fontSize: 13 }}>立即注册</Link>
            </Space>
          </div>
        </Form>
      </Card>
    </div>
  )
}