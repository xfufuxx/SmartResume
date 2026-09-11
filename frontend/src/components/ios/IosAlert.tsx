'use client'

import React from 'react'

export interface IosAlertAction {
  text: string
  onPress?: () => void
  danger?: boolean
  cancel?: boolean
  bold?: boolean
}

interface IosAlertProps {
  open: boolean
  title?: string
  message?: React.ReactNode
  actions?: IosAlertAction[]
}

/**
 * iOS 居中 Alert：圆角 14 + 半透明遮罩 + 底部按钮分隔线。
 */
export default function IosAlert({ open, title, message, actions = [] }: IosAlertProps) {
  if (!open) return null
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'var(--bg-overlay)' }} />
      <div
        className="animate-scale"
        style={{
          position: 'relative',
          maxWidth: 280,
          width: '100%',
          background: 'var(--bg-card)',
          borderRadius: 14,
          overflow: 'hidden',
          boxShadow: '0 12px 28px rgba(0,0,0,0.2)',
        }}
      >
        {title && (
          <div style={{ padding: '18px 16px 0', textAlign: 'center', fontSize: 17, fontWeight: 600, color: 'var(--text-primary)' }}>
            {title}
          </div>
        )}
        {message && (
          <div style={{ padding: '4px 16px 18px', textAlign: 'center', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {message}
          </div>
        )}
        <div style={{ display: 'flex', borderTop: '0.5px solid var(--ios-separator)' }}>
          {actions.map((a, i) => (
            <button
              key={i}
              onClick={a.onPress}
              className="ios-press"
              style={{
                flex: 1,
                border: 'none',
                borderLeft: i === 0 ? 'none' : '0.5px solid var(--ios-separator)',
                background: 'transparent',
                padding: 12,
                fontSize: 17,
                fontWeight: a.bold ? 600 : 400,
                color: a.danger ? 'var(--ios-red)' : a.cancel ? 'var(--text-primary)' : 'var(--ios-blue)',
                cursor: 'pointer',
              }}
            >
              {a.text}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
