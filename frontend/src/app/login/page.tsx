'use client'

import React, { useState, useEffect } from 'react'
import { Card, Form, Input, Button, Typography, Space, message, Checkbox, Divider } from 'antd'
import { MailOutlined, LockOutlined, WechatOutlined, GoogleOutlined, AlipayCircleOutlined } from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/api'
import { getToken } from '@/lib/auth'

export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const t = getToken()
    if (t) router.push('/')
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
      router.push('/')
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      message.error(detail || '邮箱或密码错误')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f0f2f5', padding: 24 }}>
      <Card style={{ width: 400, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
        <Typography.Title level={3} style={{ textAlign: 'center', marginBottom: 24 }}>
          智能简历登录
        </Typography.Title>

        <Form onFinish={handleLogin} size="large" initialValues={{ remember: true }}>
          <Form.Item name="email" rules={[{ required: true, type: 'email', message: '请输入有效的邮箱' }]}>
            <Input prefix={<MailOutlined />} placeholder="邮箱地址" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          <Form.Item name="remember" valuePropName="checked">
            <Checkbox>记住我（7天内免登录）</Checkbox>
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              登录
            </Button>
          </Form.Item>
          <div style={{ textAlign: 'center' }}>
            <Space>
              <Link href="/forgot-password">忘记密码？</Link>
              <Typography.Text>|</Typography.Text>
              <Link href="/register">立即注册</Link>
            </Space>
          </div>
        </Form>

        <Divider plain>其他方式登录（敬请期待）</Divider>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 24 }}>
          <Button shape="circle" icon={<WechatOutlined style={{ color: '#07c160' }} />} size="large" disabled title="微信登录（开发中）" />
          <Button shape="circle" icon={<AlipayCircleOutlined style={{ color: '#1677ff' }} />} size="large" disabled title="支付宝登录（开发中）" />
          <Button shape="circle" icon={<GoogleOutlined style={{ color: '#ea4335' }} />} size="large" disabled title="Google登录（开发中）" />
        </div>
      </Card>
    </div>
  )
}