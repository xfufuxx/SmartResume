'use client'

import React from 'react'
import { createCache, extractStyle, StyleProvider } from '@ant-design/cssinjs'
import { useServerInsertedHTML } from 'next/navigation'

/**
 * AntD v5 cssinjs 与 Next.js App Router 的水合兼容层。
 *
 * ⚠️ 关键点（踩过坑，勿改）：`extractStyle(cache, true)` 的第二个参数 `plain` 必须传 `true`。
 * 在 @ant-design/cssinjs 1.x 中：
 *   - extractStyle(cache, true)  → 返回【纯 CSS 文本】
 *   - extractStyle(cache)（默认 plain=false）→ 返回【已包好 <style …> 标签的字符串】
 * 后者塞进 `<style dangerouslySetInnerHTML>` 后会形成嵌套：
 *     <style id="antd"><style data-rc-order="prependQueue" data-css-hash="…">a:where(…){…}</style>…</style>
 * 浏览器把内层 `<style …>` 当作普通文本丢给 CSS 解析器 → 整段样式被判为非法选择器而丢弃
 * → 服务端 HTML 零 AntD 样式（表现为导航变裸链接、卡片/栅格全丢）。
 * 更糟的是 cssinjs 在客户端会依据「服务端已注入」的假设跳过注入，导致水合后依旧无样式。
 */
export default function AntdRegistry({ children }: { children: React.ReactNode }) {
  // cache 需在组件生命周期内保持同一实例：服务端复用同一份缓存累积全部已渲染组件的样式
  const cache = React.useMemo(() => createCache(), [])

  useServerInsertedHTML(() => (
    <style id="antd" dangerouslySetInnerHTML={{ __html: extractStyle(cache, true) }} />
  ))

  return <StyleProvider cache={cache}>{children}</StyleProvider>
}
