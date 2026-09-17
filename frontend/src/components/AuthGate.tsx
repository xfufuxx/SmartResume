'use client'

import React from 'react'
import { Skeleton } from 'antd'
import AppLayout from '@/components/AppLayout'

/**
 * 鉴权未就绪（token 尚未取出）时的占位外壳。
 *
 * 修复点：这些页面原本在 `if (!token)` 时直接 `return <Spin />`，那个 Spin 由 SSR 产出、
 * 位于 AppLayout 外壳之外。一旦客户端 JS 因任何原因未能 hydration，`useEffect` 不会执行，
 * 服务端吐出的裸转圈就被永久钉在屏幕中央 —— 表现为“一直卡在加载、进不了页面”。
 *
 * 改为先渲染 AppLayout 外壳 + 骨架屏：即便 JS 未起，用户也看到真实界面框架而非白屏转圈，
 * 配合根布局 global-error.tsx 也能在出错时给出可重试报错页。未登录时组件内的 useEffect
 * 仍会 router.push('/login')，鉴权跳转逻辑不变。
 */
export default function AuthGate({
  activeKey,
  children,
}: {
  activeKey?: string
  children?: React.ReactNode
}) {
  return (
    <AppLayout activeKey={activeKey}>
      <div style={{ padding: 24 }}>
        {children ?? <Skeleton active paragraph={{ rows: 8 }} title />}
      </div>
    </AppLayout>
  )
}
