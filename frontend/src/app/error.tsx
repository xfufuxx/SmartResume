'use client'

import { useEffect } from 'react'
import { Button, Result } from 'antd'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('页面错误:', error)
  }, [error])

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: '#f5f5f5',
    }}>
      <Result
        status="error"
        title="页面加载失败"
        subTitle={error.message || '发生了未知错误，请稍后重试'}
        extra={[
          <Button type="primary" key="retry" onClick={reset}>
            重试
          </Button>,
          <Button key="home" onClick={() => { window.location.href = '/' }}>
            返回首页
          </Button>,
        ]}
      />
    </div>
  )
}