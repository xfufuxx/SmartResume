'use client'

import React from 'react'

/**
 * iOS Inset Grouped 分组列表：左右留白的圆角卡片分组。
 */
export function IosGroup({
  header,
  footer,
  children,
}: {
  header?: string
  footer?: string
  children: React.ReactNode
}) {
  return (
    <div style={{ margin: '16px 16px' }}>
      {header && (
        <div
          style={{
            fontSize: 13,
            color: 'var(--text-tertiary)',
            letterSpacing: 0.3,
            padding: '0 16px 6px',
            fontWeight: 600,
          }}
        >
          {header}
        </div>
      )}
      <div
        style={{
          background: 'var(--bg-card)',
          borderRadius: 12,
          overflow: 'hidden',
          border: '0.5px solid var(--ios-separator)',
        }}
      >
        {children}
      </div>
      {footer && (
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: '6px 16px 0', lineHeight: 1.4 }}>
          {footer}
        </div>
      )}
    </div>
  )
}

interface IosCellProps {
  icon?: React.ReactNode
  title: React.ReactNode
  value?: React.ReactNode
  onPress?: () => void
  /** 右侧 accessory：chevron（箭头）/ none */
  accessory?: 'chevron' | 'none'
  last?: boolean
  danger?: boolean
}

/**
 * iOS 列表单元格：分割线从文字左侧起始（图标列无分割线），末项无分割线。
 */
export function IosCell({
  icon,
  title,
  value,
  onPress,
  accessory = 'chevron',
  last = false,
  danger = false,
}: IosCellProps) {
  const interactive = !!onPress
  return (
    <div
      onClick={onPress}
      className={interactive ? 'ios-press' : undefined}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        cursor: interactive ? 'pointer' : 'default',
        background: 'var(--bg-card)',
      }}
    >
      {icon && (
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 16,
            fontSize: 22,
            color: danger ? 'var(--ios-red)' : 'var(--text-primary)',
            flexShrink: 0,
          }}
        >
          {icon}
        </span>
      )}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '12px 16px',
          borderBottom: last ? 'none' : '0.5px solid var(--ios-separator)',
        }}
      >
        <span
          style={{
            fontSize: 17,
            color: danger ? 'var(--ios-red)' : 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </span>
        {value != null && (
          <span
            style={{
              fontSize: 17,
              color: 'var(--text-tertiary)',
              flexShrink: 0,
              marginLeft: 8,
            }}
          >
            {value}
          </span>
        )}
        {accessory === 'chevron' && interactive && (
          <span style={{ color: 'var(--text-quaternary)', fontSize: 18, flexShrink: 0 }}>›</span>
        )}
      </div>
    </div>
  )
}
