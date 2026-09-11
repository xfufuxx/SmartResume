'use client'

import React from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useTheme } from '@/lib/theme'

export interface IosTabItem {
  key: string
  label: string
  icon: React.ReactNode
  path: string
}

interface IosTabBarProps {
  items: IosTabItem[]
  /** 强制指定选中项；不传则按当前路径匹配 */
  activeKey?: string
  /** 毛玻璃条最大宽度（响应式居中），默认 480 */
  maxWidth?: number
}

/**
 * iOS 底部 TabBar：毛玻璃、图标 24px、选中态主色、标签 10px、安全区。
 */
export default function IosTabBar({ items, activeKey, maxWidth = 480 }: IosTabBarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { theme } = useTheme()
  const active = activeKey || pathname
  const barBg =
    theme === 'dark' ? 'rgba(28, 28, 30, 0.82)' : 'rgba(249, 249, 249, 0.82)'

  return (
    <nav
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 60,
        background: barBg,
        backdropFilter: 'saturate(180%) blur(20px)',
        WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        borderTop: '0.5px solid var(--ios-separator)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        display: 'flex',
        maxWidth,
        margin: '0 auto',
      }}
    >
      {items.map((it) => {
        const isExact = active === it.path || active === it.key
        const isSub =
          it.path !== '/' && (active === it.path || active.startsWith(it.path + '/'))
        const isActive = isExact || isSub
        return (
          <button
            key={it.key}
            onClick={() => router.push(it.path)}
            className="ios-press"
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              padding: '8px 0 6px',
              cursor: 'pointer',
              color: isActive ? 'var(--ios-blue)' : 'var(--text-tertiary)',
            }}
          >
            <span style={{ fontSize: 24, lineHeight: 1, display: 'flex' }}>{it.icon}</span>
            <span style={{ fontSize: 10, fontWeight: isActive ? 600 : 400 }}>{it.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
