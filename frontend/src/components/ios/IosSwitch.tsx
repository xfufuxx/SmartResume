'use client'

import React from 'react'

interface IosSwitchProps {
  checked: boolean
  onChange?: (next: boolean) => void
  disabled?: boolean
}

/**
 * iOS 原生风格 Switch（手写，不依赖组件库）。
 */
export default function IosSwitch({ checked, onChange, disabled }: IosSwitchProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange?.(!checked)}
      style={{
        width: 51,
        height: 31,
        borderRadius: 31,
        padding: 2,
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: checked ? 'var(--ios-blue)' : 'rgba(120, 120, 128, 0.32)',
        transition: 'background 0.25s var(--ease-ios)',
        position: 'relative',
        flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 22 : 2,
          width: 27,
          height: 27,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          transition: 'left 0.25s var(--ease-ios)',
        }}
      />
    </button>
  )
}
