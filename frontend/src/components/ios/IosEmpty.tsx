'use client'

import React from 'react'

interface IosEmptyProps {
  icon?: React.ReactNode
  text?: string
}

/**
 * iOS 空状态：居中图标 + 一行灰色说明，不花哨。
 */
export default function IosEmpty({ icon = '📭', text = '暂无数据' }: IosEmptyProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        color: 'var(--text-tertiary)',
      }}
    >
      <div style={{ fontSize: 40, opacity: 0.5, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 15, color: 'var(--text-tertiary)' }}>{text}</div>
    </div>
  )
}
