'use client'

import React, { useState, useEffect } from 'react'
import { Card, Form, Input, Button, Typography, Space, message, Checkbox, Divider } from 'antd'
import { MailOutlined, LockOutlined, WechatOutlined, GoogleOutlined, AlipayCircleOutlined, FileTextOutlined } from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/api'
import { getToken } from '@/lib/auth'

export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const t = getToken()
    if (t) router.replace('/dashboard')
  }, [router])

  const handleLogin = async (values: { email: string; password: string; remember: boolean }) => {
    setLoading(true)
    try {
      const deviceId = localStorage.getItem('deviceId') || `web-${Date.now()}`
      localStorage.setItem('deviceId', deviceId)

      const res = await auth.login(values.email, values.password, deviceId)
      localStorage.setItem('token', res.data.access_token)
      if (res.data.refresh_token) {
        localStorage.setItem('refreshToken', res.data.refresh_token)
      }
      localStorage.setItem('user', JSON.stringify(res.data.user))
      message.success('登录成功')
      router.replace('/dashboard')
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      message.error(detail || '邮箱或密码错误')
    } finally {
      setLoading(false)
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

        <Divider plain style={{ borderColor: 'var(--border-default)', color: 'var(--text-tertiary)', fontSize: 12, margin: '20px 0' }}>
          其他方式登录（敬请期待）
        </Divider>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 20 }}>
          <Button shape="circle" icon={<WechatOutlined style={{ color: '#07c160' }} />} size="large" disabled title="微信登录（开发中）" style={{ background: 'rgba(255,255,255,0.8)' }} />
          <Button shape="circle" icon={<AlipayCircleOutlined style={{ color: '#1677ff' }} />} size="large" disabled title="支付宝登录（开发中）" style={{ background: 'rgba(255,255,255,0.8)' }} />
          <Button shape="circle" icon={<GoogleOutlined style={{ color: '#ea4335' }} />} size="large" disabled title="Google登录（开发中）" style={{ background: 'rgba(255,255,255,0.8)' }} />
        </div>
      </Card>
    </div>
  )
}