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
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f0f2f5', padding: 24 }}>
      <Card style={{ width: 420, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
        <Typography.Title level={3} style={{ textAlign: 'center', marginBottom: 24 }}>
          重置密码
        </Typography.Title>
        <Steps current={step} items={[{ title: '验证邮箱' }, { title: '设置密码' }]} style={{ marginBottom: 24 }} />

        {step === 0 && (
          <Form form={form} onFinish={handleSendCode} size="large">
            <Form.Item name="email" rules={[{ required: true, type: 'email', message: '请输入有效的邮箱' }]}>
              <Input prefix={<MailOutlined />} placeholder="注册邮箱" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={sending} block>
                发送验证码
              </Button>
            </Form.Item>
            <div style={{ textAlign: 'center' }}>
              <Link href="/login">返回登录</Link>
            </div>
          </Form>
        )}

        {step === 1 && (
          <Form onFinish={handleReset} size="large">
            <Form.Item>
              <Input prefix={<MailOutlined />} value={email} disabled />
            </Form.Item>
            <Form.Item name="code" rules={[{ required: true, message: '请输入验证码' }]}>
              <Input prefix={<SafetyCertificateOutlined />} placeholder="验证码" suffix={
                <Button type="link" loading={sending} disabled={countdown > 0} onClick={handleSendCode} style={{ padding: 0 }}>
                  {countdown > 0 ? `${countdown}s` : '重新发送'}
                </Button>
              } />
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, min: 6, message: '新密码至少 6 位' }]}>
              <Input.Password prefix={<LockOutlined />} placeholder="新密码（至少 6 位）" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading} block>
                重置密码
              </Button>
            </Form.Item>
            <div style={{ textAlign: 'center' }}>
              <Button type="link" onClick={() => setStep(0)}>更换邮箱</Button>
            </div>
          </Form>
        )}
      </Card>
    </div>
  )
}