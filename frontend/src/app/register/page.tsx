'use client'

import React, { useState } from 'react'
import { Card, Form, Input, Button, Typography, Space, message } from 'antd'
import { MailOutlined, LockOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/api'

export default function RegisterPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [form] = Form.useForm()

  const startCountdown = () => {
    setCountdown(60)
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(timer); return 0 }
        return c - 1
      })
    }, 1000)
  }

  const handleSendCode = async () => {
    try {
      const values = await form.validateFields(['email'])
      setSending(true)
      await auth.sendCode(values.email, 'register')
      message.success('验证码已发送')
      startCountdown()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      if (detail) message.error(detail)
    } finally {
      setSending(false)
    }
  }

  const handleRegister = async (values: { email: string; password: string; code: string }) => {
    setLoading(true)
    try {
      const res = await auth.register(values.email, values.password, values.code)
      localStorage.setItem('token', res.data.access_token)
      localStorage.setItem('user', JSON.stringify(res.data.user))
      message.success('注册成功')
      router.push('/dashboard')
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      message.error(detail || '注册失败')
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
            <SafetyCertificateOutlined style={{ color: '#fff', fontSize: 24 }} />
          </div>
          <Typography.Title level={3} style={{
            marginBottom: 4,
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: 'var(--text-primary)',
          }}>
            创建账号
          </Typography.Title>
          <Typography.Text style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>
            注册智能简历，开启职业新篇章
          </Typography.Text>
        </div>

        <Form form={form} onFinish={handleRegister} size="large">
          <Form.Item name="email" rules={[{ required: true, type: 'email', message: '请输入有效的邮箱' }]}>
            <Input prefix={<MailOutlined style={{ color: 'var(--text-tertiary)' }} />} placeholder="邮箱地址" />
          </Form.Item>

          <Form.Item name="code" rules={[{ required: true, message: '请输入验证码' }]}>
            <Input prefix={<SafetyCertificateOutlined style={{ color: 'var(--text-tertiary)' }} />} placeholder="验证码" suffix={
              <Button type="link" loading={sending} disabled={countdown > 0} onClick={handleSendCode} style={{ padding: 0, color: 'var(--primary-600)' }}>
                {countdown > 0 ? `${countdown}s` : '获取验证码'}
              </Button>
            } />
          </Form.Item>

          <Form.Item name="password" rules={[{ required: true, min: 6, message: '密码至少 6 位' }]}>
            <Input.Password prefix={<LockOutlined style={{ color: 'var(--text-tertiary)' }} />} placeholder="密码（至少 6 位）" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block style={{ height: 44, fontSize: 16, fontWeight: 600 }}>
              注册
            </Button>
          </Form.Item>

          <div style={{ textAlign: 'center' }}>
            <Space>
              <Typography.Text style={{ color: 'var(--text-tertiary)' }}>已有账号？</Typography.Text>
              <Link href="/login" style={{ color: 'var(--primary-600)', fontSize: 13 }}>去登录</Link>
            </Space>
          </div>
        </Form>
      </Card>
    </div>
  )
}