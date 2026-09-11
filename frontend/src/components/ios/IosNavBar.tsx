'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/lib/theme'

interface IosNavBarProps {
  title: string
  subtitle?: string
  /** 是否显示大标题（Large Title），滚动后收缩为居中标题 */
  largeTitle?: boolean
  backPath?: string
  backLabel?: string
  onBack?: () => void
  right?: React.ReactNode
  /** 大标题区域下方的搜索栏（iOS UISearchBar 风格） */
  search?: React.ReactNode
  /** 滚动容器 ref；不传则监听 window 滚动 */
  scrollRef?: React.RefObject<HTMLElement>
}

/**
 * iOS 导航栏：顶部大标题（Large Title），滚动后收缩为居中标题；
 * 毛玻璃背景 backdrop-filter: saturate(180%) blur(20px)。
 */
export default function IosNavBar({
  title,
  subtitle,
  largeTitle = true,
  backPath,
  backLabel = '返回',
  onBack,
  right,
  search,
  scrollRef,
}: IosNavBarProps) {
  const router = useRouter()
  const { theme } = useTheme()
  const [collapsed, setCollapsed] = useState(false)
  const ticking = useRef(false)

  useEffect(() => {
    const el = scrollRef?.current ?? (typeof window !== 'undefined' ? window : null)
    const onScroll = () => {
      if (ticking.current) return
      ticking.current = true
      requestAnimationFrame(() => {
        const y = scrollRef?.current
          ? (scrollRef.current as HTMLElement).scrollTop
          : window.scrollY
        setCollapsed(y > 24)
        ticking.current = false
      })
    }
    if (el) el.addEventListener('scroll', onScroll as EventListener, { passive: true })
    return () => {
      if (el) el.removeEventListener('scroll', onScroll as EventListener)
    }
  }, [scrollRef])

  const handleBack = () => {
    if (onBack) onBack()
    else if (backPath) router.push(backPath)
  }

  const barBg =
    theme === 'dark' ? 'rgba(28, 28, 30, 0.72)' : 'rgba(249, 249, 249, 0.82)'

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: barBg,
        backdropFilter: 'saturate(180%) blur(20px)',
        WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        borderBottom: collapsed ? '0.5px solid var(--ios-separator)' : 'none',
        transition: 'border-color 0.2s var(--ease-ios)',
      }}
    >
      <div
        style={{
          height: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 8px',
          paddingTop: 'env(safe-area-inset-top, 0px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, flex: 1 }}>
          {(backPath || onBack) && (
            <button
              onClick={handleBack}
              className="ios-press"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                background: 'none',
                border: 'none',
                color: 'var(--ios-blue)',
                fontSize: 17,
                padding: '6px 4px',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 22, lineHeight: 1, marginTop: -2 }}>‹</span>
              <span
                style={{
                  maxWidth: 120,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {backLabel}
              </span>
            </button>
          )}
          {(collapsed || backPath || onBack) && (
            <span
              style={{
                fontSize: 17,
                fontWeight: 600,
                color: 'var(--text-primary)',
                marginLeft: backPath || onBack ? 8 : 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {title}
            </span>
          )}
        </div>
        {right && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {right}
          </div>
        )}
      </div>
      {largeTitle && !collapsed && (
        <div style={{ padding: '4px 16px 8px' }}>
          <div
            style={{
              fontSize: 34,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: 'var(--text-primary)',
              lineHeight: 1.2,
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div style={{ fontSize: 15, color: 'var(--text-tertiary)', marginTop: 2 }}>
              {subtitle}
            </div>
          )}
          {search && (
            <div style={{ marginTop: 12 }}>{search}</div>
          )}
        </div>
      )}
    </div>
  )
}
