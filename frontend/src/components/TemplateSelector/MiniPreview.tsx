'use client'

import type { TemplateOption } from './types'

/** 迷你预览卡片：用纯 CSS 模拟模板风格（画廊页复用） */
export function MiniPreview({ preview }: { preview: TemplateOption['preview'] }) {
  return (
    <div
      style={{
        width: '100%',
        height: 84,
        borderRadius: 10,
        overflow: 'hidden',
        border: '1px solid rgba(0, 0, 0, 0.06)',
        backgroundColor: preview.bg,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
      }}
    >
      {/* 模拟布局 */}
      {preview.layout === 'banner' && (
        <>
          <div style={{ height: 24, background: `linear-gradient(135deg, ${preview.primary}, ${preview.secondary})` }} />
          <div style={{ flex: 1, display: 'flex' }}>
            <div style={{ width: '35%', background: '#f5f5f5', padding: 4 }}>
              <div style={{ height: 4, width: '60%', background: preview.primary, borderRadius: 2, marginBottom: 4 }} />
              <div style={{ height: 3, width: '80%', background: '#ddd', marginBottom: 2 }} />
              <div style={{ height: 3, width: '70%', background: '#ddd', marginBottom: 4 }} />
              <div style={{ height: 4, width: '50%', background: preview.primary, borderRadius: 2, marginBottom: 4 }} />
              <div style={{ height: 3, width: '75%', background: '#ddd', marginBottom: 2 }} />
            </div>
            <div style={{ flex: 1, padding: 4 }}>
              <div style={{ height: 4, width: '35%', background: preview.primary, borderRadius: 2, marginBottom: 4 }} />
              <div style={{ height: 3, width: '90%', background: '#ddd', marginBottom: 2 }} />
              <div style={{ height: 3, width: '85%', background: '#ddd', marginBottom: 2 }} />
              <div style={{ height: 3, width: '70%', background: '#ddd', marginBottom: 4 }} />
              <div style={{ height: 3, width: '88%', background: '#ddd', marginBottom: 2 }} />
            </div>
          </div>
        </>
      )}
      {preview.layout === 'dual' && (
        <div style={{ flex: 1, display: 'flex' }}>
          <div style={{ width: '32%', background: preview.primary, padding: 4, color: '#fff', fontSize: 6 }}>
            <div style={{ height: 3, width: '50%', background: 'rgba(255,255,255,0.3)', marginBottom: 4 }} />
            <div style={{ height: 2, width: '80%', background: 'rgba(255,255,255,0.2)', marginBottom: 2 }} />
            <div style={{ height: 2, width: '70%', background: 'rgba(255,255,255,0.2)', marginBottom: 4 }} />
            <div style={{ height: 3, width: '40%', background: 'rgba(255,255,255,0.3)', marginBottom: 4 }} />
            <div style={{ height: 2, width: '75%', background: 'rgba(255,255,255,0.2)', marginBottom: 2 }} />
          </div>
          <div style={{ flex: 1, padding: 4, background: '#fff' }}>
            <div style={{ height: 4, width: '30%', background: preview.primary, borderRadius: 2, marginBottom: 4 }} />
            <div style={{ height: 3, width: '90%', background: '#e8e8e8', marginBottom: 2 }} />
            <div style={{ height: 3, width: '85%', background: '#e8e8e8', marginBottom: 2 }} />
            <div style={{ height: 3, width: '70%', background: '#e8e8e8', marginBottom: 4 }} />
            <div style={{ height: 3, width: '88%', background: '#e8e8e8', marginBottom: 2 }} />
            <div style={{ height: 3, width: '60%', background: '#e8e8e8' }} />
          </div>
        </div>
      )}
      {preview.layout === 'dark' && (
        <div style={{ flex: 1, background: '#0d1117', padding: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ height: 4, width: '35%', background: preview.primary, borderRadius: 2, boxShadow: `0 0 6px ${preview.primary}44` }} />
          <div style={{ height: 2, width: '60%', background: '#30363d' }} />
          <div style={{ display: 'flex', gap: 3 }}>
            <div style={{ height: 4, width: 22, background: '#161b22', border: `1px solid ${preview.primary}44`, borderRadius: 2 }} />
            <div style={{ height: 4, width: 22, background: '#161b22', border: `1px solid ${preview.primary}44`, borderRadius: 2 }} />
          </div>
          <div style={{ height: 3, width: '90%', background: '#21262d', borderRadius: 1 }} />
          <div style={{ height: 3, width: '80%', background: '#21262d', borderRadius: 1 }} />
        </div>
      )}
      {preview.layout === 'single' && (
        <div style={{ flex: 1, padding: 8, background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{ height: 6, width: '35%', background: preview.primary, borderRadius: 2 }} />
          <div style={{ height: 2, width: '50%', background: '#ddd' }} />
          <div style={{ width: '100%', height: 1, background: '#eee' }} />
          <div style={{ height: 4, width: '80%', background: '#f0f0f0', alignSelf: 'flex-start', borderRadius: 2 }} />
          <div style={{ height: 3, width: '90%', background: '#f5f5f5', alignSelf: 'flex-start' }} />
          <div style={{ height: 3, width: '75%', background: '#f5f5f5', alignSelf: 'flex-start' }} />
          <div style={{ height: 3, width: '85%', background: '#f5f5f5', alignSelf: 'flex-start' }} />
        </div>
      )}
    </div>
  )
}

/** 放大版 CSS 模拟预览（预览弹窗中 css 模式使用；仅模块内消费，不走 barrel） */
export function LargeCssPreview({ preview }: { preview: TemplateOption['preview'] }) {
  return (
    <div style={{ transform: 'scale(2.1)', transformOrigin: 'top center', width: '100%' }}>
      <MiniPreview preview={preview} />
    </div>
  )
}
