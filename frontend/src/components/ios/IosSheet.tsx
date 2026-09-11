'use client'

import React, { useEffect } from 'react'

export interface IosSheetAction {
  label: string
  danger?: boolean
  onTap?: () => void
}

interface IosSheetProps {
  open: boolean
  onClose: () => void
  title?: string
  actions?: IosSheetAction[]
  cancelText?: string
}

/**
 * iOS 底部弹出 Sheet / ActionSheet：半透明遮罩 + 底部上滑面板 + 安全区。
 */
export default function IosSheet({
  open,
  onClose,
  title,
  actions = [],
  cancelText = '取消',
}: IosSheetProps) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000 }}>
      <div
        onClick={onClose}
        className="animate-in"
        style={{ position: 'absolute', inset: 0, background: 'var(--bg-overlay)' }}
      />
      <div
        className="animate-slide"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: '8px 8px calc(8px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {title && (
            <div
              style={{
                background: 'var(--bg-card)',
                borderRadius: 14,
                padding: 16,
                textAlign: 'center',
                color: 'var(--text-tertiary)',
                fontSize: 13,
              }}
            >
              {title}
            </div>
          )}
          <div style={{ background: 'var(--bg-card)', borderRadius: 14, overflow: 'hidden' }}>
            {actions.map((a, i) => (
              <button
                key={i}
                onClick={() => {
                  a.onTap?.()
                  onClose()
                }}
                className="ios-press"
                style={{
                  display: 'block',
                  width: '100%',
                  border: 'none',
                  borderBottom:
                    i === actions.length - 1 ? 'none' : '0.5px solid var(--ios-separator)',
                  background: 'transparent',
                  padding: 16,
                  fontSize: 20,
                  color: a.danger ? 'var(--ios-red)' : 'var(--ios-blue)',
                  cursor: 'pointer',
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            className="ios-press"
            style={{
              background: 'var(--bg-card)',
              borderRadius: 14,
              border: 'none',
              padding: 16,
              fontSize: 20,
              fontWeight: 600,
              color: 'var(--text-primary)',
              cursor: 'pointer',
            }}
          >
            {cancelText}
          </button>
        </div>
      </div>
    </div>
  )
}
