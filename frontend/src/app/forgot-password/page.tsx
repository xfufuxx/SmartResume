'use client'

import React, { useState } from 'react'
import { Card, Form, Input, Button, Typography, Steps, Space, message } from 'antd'
import { MailOutlined, LockOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/api'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [email, setEmail] = useState('')
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
      const mail = values.email
      setEmail(mail)
      setSending(true)
      await auth.forgotSendCode(mail)
      message.success('验证码已发送')
      startCountdown()
      setStep(1)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      if (detail) message.error(detail)
    } finally {
      setSending(false)
    }
  }

  const handleReset = async (values: { code: string; password: string }) => {
    setLoading(true)
    try {
      await auth.resetPassword(email, values.code, values.password)
      message.success('密码重置成功，请登录')
      router.push('/login')
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      message.error(detail || '重置失败')
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
          width: 440,
          borderRadius: 'var(--radius-2xl)',
          border: '1px solid var(--border-light)',
          background: 'var(--bg-card)',
          boxShadow: 'var(--shadow-lg)',
        }}
        styles={{ body: { padding: '32px 36px 28px' } }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: 'linear-gradient(135deg, var(--warning-500) 0%, var(--error-500) 100%)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
            boxShadow: '0 4px 16px rgba(245, 158, 11, 0.3)',
          }}>
            <LockOutlined style={{ color: '#fff', fontSize: 24 }} />
          </div>
          <Typography.Title level={3} style={{
            marginBottom: 4,
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: 'var(--text-primary)',
          }}>
            重置密码
          </Typography.Title>
          <Typography.Text style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>
            验证邮箱后设置新密码
          </Typography.Text>
        </div>

        <Steps
          current={step}
          items={[{ title: '验证邮箱' }, { title: '设置密码' }]}
          style={{ marginBottom: 28 }}
        />

        {step === 0 && (
          <Form form={form} onFinish={handleSendCode} size="large">
            <Form.Item name="email" rules={[{ required: true, type: 'email', message: '请输入有效的邮箱' }]}>
              <Input prefix={<MailOutlined style={{ color: 'var(--text-tertiary)' }} />} placeholder="注册邮箱" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={sending} block style={{ height: 44, fontSize: 16, fontWeight: 600 }}>
                发送验证码
              </Button>
            </Form.Item>
            <div style={{ textAlign: 'center' }}>
              <Link href="/login" style={{ color: 'var(--primary-600)', fontSize: 13 }}>返回登录</Link>
            </div>
          </Form>
        )}

        {step === 1 && (
          <Form onFinish={handleReset} size="large">
            <Form.Item>
              <Input prefix={<MailOutlined style={{ color: 'var(--text-tertiary)' }} />} value={email} disabled />
            </Form.Item>
            <Form.Item name="code" rules={[{ required: true, message: '请输入验证码' }]}>
              <Input prefix={<SafetyCertificateOutlined style={{ color: 'var(--text-tertiary)' }} />} placeholder="验证码" suffix={
                <Button type="link" loading={sending} disabled={countdown > 0} onClick={handleSendCode} style={{ padding: 0, color: 'var(--primary-600)' }}>
                  {countdown > 0 ? `${countdown}s` : '重新发送'}
                </Button>
              } />
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, min: 6, message: '新密码至少 6 位' }]}>
              <Input.Password prefix={<LockOutlined style={{ color: 'var(--text-tertiary)' }} />} placeholder="新密码（至少 6 位）" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading} block style={{ height: 44, fontSize: 16, fontWeight: 600 }}>
                重置密码
              </Button>
            </Form.Item>
            <div style={{ textAlign: 'center' }}>
              <Button type="link" onClick={() => setStep(0)} style={{ color: 'var(--primary-600)', fontSize: 13 }}>更换邮箱</Button>
            </div>
          </Form>
        )}
      </Card>
    </div>
  )
}