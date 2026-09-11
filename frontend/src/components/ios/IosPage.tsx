'use client'

import React from 'react'

interface IosPageProps {
  children: React.ReactNode
  /** 内容最大宽度（移动端列宽），默认 480 */
  maxWidth?: number
  /** 是否预留底部 TabBar 的安全高度 */
  tabBar?: boolean
  className?: string
  style?: React.CSSProperties
}

/**
 * iOS 滚动内容容器：移动优先、居中列宽、安全区、惯性滚动。
 * 与 IosNavBar（吸顶）+ IosTabBar（吸底）配合组成页面外壳。
 */
export default function IosPage({
  children,
  maxWidth = 480,
  tabBar = false,
  className = '',
  style,
}: IosPageProps) {
  return (
    <div
      className="ios-scroll"
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        paddingBottom: tabBar
          ? 'calc(var(--tabbar-height) + env(safe-area-inset-bottom, 0px) + 12px)'
          : 'env(safe-area-inset-bottom, 0px)',
        ...style,
      }}
    >
      <div
        className={className}
        style={{ maxWidth, margin: '0 auto', width: '100%', padding: '0 16px' }}
      >
        {children}
      </div>
    </div>
  )
}
