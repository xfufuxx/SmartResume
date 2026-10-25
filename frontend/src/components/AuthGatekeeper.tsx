'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Spin } from 'antd'
import { getToken, getRefreshToken, clearAuth, isTokenExpired } from '@/lib/auth'
import { refreshAccessToken } from '@/lib/api'

/**
 * 无需用户登录态的前缀：
 * - /login /register /forgot-password：用户端公开页
 * - /admin：管理后台有独立的 admin token 鉴权体系（admin/page.tsx 自己把关），
 *   若被本门拦截会连 /admin/login 都进不去
 */
const PUBLIC_PREFIXES = ['/login', '/register', '/forgot-password', '/admin']

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * 全局鉴权门（挂在根 layout，所有页面的最外层）。
 *
 * 解决的问题（重启服务/离开一段时间后打开前端的真实故障）：
 * 1. **先闪业务页再跳走**：原来鉴权写在每个页面的 useEffect 里，SSR 阶段
 *    token 恒为 null，服务端先吐出 AppLayout 外壳 + 骨架屏的 HTML（用户
 *    感知为「优化主界面」），hydration 完成后才跳 /login。本门在 SSR 阶段
 *    就只渲染全局 loading，未裁决前 children 一律不挂载——业务页骨架
 *    再也不会先于跳转出现。
 * 2. **access 一过期就被迫完整重登**：access token TTL 仅 120 分钟，而
 *    refresh token 有 7 天。本门在 access 过期时先静默刷新（复用 api.ts
 *    的单飞 refreshAccessToken，成功后双 token 轮换写回），成功才放行；
 *    只有刷新失败（refresh 过期/被吊销）才 clearAuth + replace('/login')。
 *    配合 auth.ts 的修复（过期不再误删 refreshToken），「记住我 7 天」生效。
 *
 * 导航语义：
 * - 跳登录用 replace 而非 push：历史栈里不残留被踢走的业务页，返回键不会闪回。
 * - decided 一旦置 true 不再回退：首屏挂载必然从 false 开始裁决；已放行后
 *   在业务区间导航无需重裁（token 若在别的标签页失效，由 api.ts 的 401
 *   拦截器收口——它会清场并硬跳 /login，整页刷新后本门重新裁决）。
 * - children 未裁决时不渲染：各页面自带的 `if (!t) router.push('/login')`
 *   兜底逻辑因此不会与门竞态（页面挂载时 token 必然已有效）。
 */
export default function AuthGatekeeper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [decided, setDecided] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function decide() {
      // 公开页直接放行（/login 自己的「已登录跳 /dashboard」逻辑不受影响）
      if (isPublicPath(pathname)) {
        if (!cancelled) setDecided(true)
        return
      }
      // ① access 有效 → 放行
      const token = getToken()
      if (token) {
        if (!cancelled) setDecided(true)
        return
      }
      // ② access 缺失/过期 + refresh 仍在有效期内 → 静默续期后放行
      const refreshToken = getRefreshToken()
      if (refreshToken && !isTokenExpired(refreshToken)) {
        const ok = await refreshAccessToken()
        if (cancelled) return
        if (ok) {
          setDecided(true)
          return
        }
      }
      // ③ 无可用凭证或刷新失败 → 清场去登录（replace：不污染历史栈）
      clearAuth()
      if (!cancelled) router.replace('/login')
    }

    decide()
    return () => { cancelled = true }
  }, [pathname, router])

  if (!decided) {
    return (
      <div className="auth-gate" data-testid="auth-gate-loading">
        <Spin size="large" />
        <p className="auth-gate-text">正在验证登录状态…</p>
      </div>
    )
  }

  return <>{children}</>
}
