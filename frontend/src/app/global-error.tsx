'use client'

import { useEffect, useState } from 'react'
import { Button, ConfigProvider, Result, theme as antdTheme } from 'antd'

// 根布局级错误边界：普通 error.tsx 在根 layout（含 ThemeProvider / ConfigProvider）崩溃时
// 自身无法渲染（它没有外壳可挂载）。global-error 会替换整个根 layout，因此必须自带
// <html>/<body>。作用：即便 cssinjs / 主题 / echarts.use 在根布局抛错，用户也能看到
// 可重试的报错页，而不是 Next 默认白屏被永久“卡在加载”表面掩盖。
// 注意：本页在 ThemeProvider / globals.css 之外渲染，主题需直接从 localStorage 恢复
// （key 与 lib/theme.tsx 的 STORAGE_KEY 一致），避免暗色用户撞见刺眼的白底错误页。
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    console.error('根布局错误:', error)
    const stored = localStorage.getItem('smart-resume-theme')
    setIsDark(stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches))
  }, [error])

  return (
    <html lang="zh-CN" data-theme={isDark ? 'dark' : 'light'} suppressHydrationWarning>
      <body style={{ margin: 0, background: isDark ? '#000000' : '#F3F4F6' }}>
        <ConfigProvider
          theme={{
            algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
            token: { colorPrimary: '#007AFF' },
          }}
        >
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '100vh',
          }}>
            <div style={{
              padding: '32px 48px',
              borderRadius: 16,
              border: `1px solid ${isDark ? 'rgba(84, 84, 88, 0.6)' : '#e5e7eb'}`,
              background: isDark ? '#1C1C1E' : '#fff',
              boxShadow: isDark ? '0 10px 30px rgba(0, 0, 0, 0.5)' : '0 10px 30px rgba(0, 0, 0, 0.08)',
            }}>
              <Result
                status="error"
                title="应用加载失败"
                subTitle={error.message || '根布局发生了未知错误，请稍后重试'}
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
          </div>
        </ConfigProvider>
      </body>
    </html>
  )
}
