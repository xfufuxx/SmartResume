'use client'

import React, { useState } from 'react'
import { Card, Form, Input, Button, Typography, message } from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import { admin } from '@/lib/api'

export default function AdminLoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleLogin = async (values: { username: string; password: string }) => {
    setLoading(true)
    try {
      const res = await admin.login(values.username, values.password)
      localStorage.setItem('token', res.data.access_token)
      localStorage.setItem('admin', JSON.stringify(res.data.admin))
      message.success('管理员登录成功')
      router.push('/admin')
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      message.error(detail || '用户名或密码错误')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'var(--bg-body)', padding: 24 }}>
      <Card style={{ width: 400, borderRadius: 'var(--radius-2xl)', border: '1px solid var(--border-light)', background: 'var(--bg-card)', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Typography.Title level={3} style={{ margin: 0, color: 'var(--text-primary)' }}>管理后台</Typography.Title>
          <Typography.Text type="secondary">请使用管理员账号登录</Typography.Text>
        </div>

        <Form onFinish={handleLogin} size="large">
          <Form.Item name="username" rules={[{ required: true, message: '请输入管理员用户名' }]}>
            <Input prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              登录管理后台
            </Button>
          </Form.Item>
          <div style={{ textAlign: 'center' }}>
            <Button type="link" onClick={() => router.push('/login')}>← 返回用户登录</Button>
          </div>
        </Form>

        <div style={{ marginTop: 16, padding: 12, background: 'var(--gray-100)', borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--text-tertiary)' }}>
          <div>默认管理员: <strong>superadmin</strong></div>
          <div>默认密码: <strong>admin123</strong></div>
          <div style={{ marginTop: 4 }}>首次使用请在数据库 `admins` 表中创建管理员后登录</div>
        </div>
      </Card>
    </div>
  )
}