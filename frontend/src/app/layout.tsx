'use client'

import React from 'react'
import { ConfigProvider, theme as antdTheme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import AntdRegistry from '@/lib/AntdRegistry'
import { ThemeProvider, useTheme } from '@/lib/theme'
import './globals.css'

function ThemedConfig({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
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
      }}
    >
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
