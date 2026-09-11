'use client'

import React from 'react'

interface IosSegmentedOption {
  label: string
  value: string
}

interface IosSegmentedProps {
  options: IosSegmentedOption[]
  value: string
  onChange?: (value: string) => void
}

/**
 * iOS Segmented Control（手写）。
 */
export default function IosSegmented({ options, value, onChange }: IosSegmentedProps) {
  return (
    <div
      style={{
        display: 'inline-flex',
        background: 'var(--ios-systemfill)',
        borderRadius: 9,
        padding: 2,
        gap: 2,
      }}
    >
      {options.map((o) => {
        const selected = value === o.value
        return (
          <button
            key={o.value}
            onClick={() => onChange?.(o.value)}
            className="ios-press"
            style={{
              border: 'none',
              background: selected ? 'var(--bg-card)' : 'transparent',
              borderRadius: 7,
              padding: '6px 14px',
              fontSize: 14,
              fontWeight: 500,
              color: selected ? 'var(--text-primary)' : 'var(--text-secondary)',
              cursor: 'pointer',
              boxShadow: selected ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.2s var(--ease-ios)',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
