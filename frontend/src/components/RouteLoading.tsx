'use client'

import React from 'react'
import { Spin } from 'antd'

/**
 * 路由级加载骨架：在各板块路由切换（chunk 尚未就绪/数据请求中）
 * 立即给出视觉反馈，避免白屏被误认为「点击无响应」。
 */
export default function RouteLoading() {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '60vh',
        padding: '48px 0',
      }}
    >
      <Spin size="large" tip="加载中..." />
    </div>
  )
}
