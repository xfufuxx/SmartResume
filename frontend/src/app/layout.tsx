'use client'

import React, { useMemo } from 'react'
import { App, ConfigProvider, theme as antdTheme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import AntdRegistry from '@/lib/AntdRegistry'
import { ThemeProvider, useTheme } from '@/lib/theme'
import './globals.css'

/**
 * 让静态方法（`message.*` / `notification.*` / `Modal.confirm`）跑在 `<App>` 上下文里。
 *
 * 背景：静态方法在 antd 里是脱离 React 树的，拿不到 ConfigProvider 的动态主题，
 * antd 会在每次调用时打印「Static function can not consume context like dynamic theme」。
 * 全站有 300+ 处 `message.*` 调用，逐个改造成 `App.useApp()` 收益低、回归面大；
 * 官方给出的另一条路就是用 `holderRender` 指定这些静态节点的渲染器，
 * 静态节点被包进 `<App>` 后即可消费主题与全局配置，告警随之消失。
 *
 * 注意：antd 5.29 的类型定义里 `holderRender` 只出现在 `GlobalConfigProps`
 * （即 `ConfigProvider.config`），并未出现在 `ConfigProviderProps`，所以这里用
 * `ConfigProvider.config({ holderRender })` 而不是把它当 prop 传——两者在运行时等价，
 * 但前者有完整类型。
 */
ConfigProvider.config({
  holderRender: (node) => <App>{node}</App>,
})

function ThemedConfig({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  // 用 useMemo 固化 theme 对象引用：避免每次渲染重建导致 ConfigProvider 重算派生算法并重渲整棵子树
  const antdThemeObj = useMemo(
    () => ({
      algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: '#007AFF',
          colorInfo: '#007AFF',
          colorSuccess: '#34C759',
          colorWarning: '#FF9500',
          colorError: '#FF3B30',
          colorLink: '#007AFF',
          borderRadius: 10,
          borderRadiusLG: 12,
          borderRadiusSM: 8,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', 'Helvetica Neue', sans-serif",
          fontSize: 15,
          colorBgContainer: isDark ? '#1C1C1E' : '#FFFFFF',
          colorText: isDark ? '#FFFFFF' : '#000000',
          colorTextSecondary: isDark ? 'rgba(235,235,245,0.60)' : 'rgba(60,60,67,0.60)',
          colorTextTertiary: isDark ? 'rgba(235,235,245,0.30)' : 'rgba(60,60,67,0.30)',
          colorBorder: isDark ? 'rgba(84,84,88,0.6)' : 'rgba(60,60,67,0.29)',
          colorBgLayout: isDark ? '#000000' : '#F2F2F7',
          boxShadowSecondary: '0 12px 28px rgba(0, 0, 0, 0.08)',
        },
        components: {
          Card: {
            borderRadiusLG: 16,
            boxShadowTertiary: '0 1px 3px rgba(0, 0, 0, 0.06)',
          },
          Button: {
            borderRadius: 12,
            controlHeight: 40,
            controlHeightLG: 48,
            fontWeight: 500,
          },
          Input: {
            borderRadius: 10,
            controlHeight: 40,
            controlHeightLG: 48,
          },
          Modal: {
            borderRadiusLG: 14,
          },
          Layout: {
            headerBg: isDark ? '#1C1C1E' : '#FFFFFF',
            bodyBg: isDark ? '#000000' : '#F2F2F7',
            siderBg: isDark ? '#1C1C1E' : '#FFFFFF',
          },
          Menu: {
            borderRadius: 10,
          },
          Table: {
            headerBg: isDark ? '#2C2C2E' : '#F2F2F7',
            headerColor: isDark ? 'rgba(235,235,245,0.60)' : 'rgba(60,60,67,0.60)',
            rowHoverBg: isDark ? '#2C2C2E' : '#F2F2F7',
            colorBgContainer: isDark ? '#1C1C1E' : '#FFFFFF',
          },
          Select: {
            optionSelectedBg: isDark ? 'rgba(10,132,255,0.20)' : 'rgba(0,122,255,0.08)',
          },
        },
      }),
    [isDark],
  )

  return (
    <ConfigProvider locale={zhCN} theme={antdThemeObj}>
      {children}
    </ConfigProvider>
  )
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ThemedHtml>
        <AntdRegistry>
          <ThemedConfig>
            <body
              suppressHydrationWarning
              style={{
                margin: 0,
                minHeight: '100vh',
              }}
            >
              {children}
            </body>
          </ThemedConfig>
        </AntdRegistry>
      </ThemedHtml>
    </ThemeProvider>
  )
}

function ThemedHtml({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme()
  return (
    <html lang="zh-CN" data-theme={theme} suppressHydrationWarning>
      {children}
    </html>
  )
}
