import { NextResponse, type NextRequest } from 'next/server'

/**
 * 服务端前置鉴权（C 方案）——与客户端 AuthGatekeeper（A+B）分层叠加：
 *
 * - 本 middleware：只判「有无登录票」（cookie 镜像 sr-token / sr-refresh）。
 *   无票 → 307 跳 /login?next=原路径，**业务页 HTML 不出厂**，从源头消灭
 *   「先闪业务骨架再跳登录」的服务端残余窗口。
 * - 客户端门：判「票是否有效」——access 过期但 refresh 有效时静默刷新
 *   （B 的 7 天免登录）。
 *
 * 关键设计：这里**不做 JWT 过期判断**。cookie 的 Max-Age 与 refreshToken
 * TTL 对齐（7 天），过期续期完全交给客户端门；若 middleware 按 exp 提前
 * 跳登录，会把「过期但可刷新」的用户误踢出去，破坏 B。
 *
 * 公开前缀：/login /register /forgot-password（用户端公开页）+
 * /admin（管理后台独立 admin token 体系，admin 页面自己把关）。
 */
const PUBLIC_PREFIXES = ['/login', '/register', '/forgot-password', '/admin']

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next()
  }

  const hasTicket =
    !!request.cookies.get('sr-token')?.value || !!request.cookies.get('sr-refresh')?.value
  if (hasTicket) {
    return NextResponse.next()
  }

  const url = request.nextUrl.clone()
  url.pathname = '/login'
  url.search = ''
  // 深链保护：登录后回到原本想去的页面（login 页消费，校验防开放重定向）
  if (pathname !== '/') url.searchParams.set('next', `${pathname}${search}`)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|api/|favicon.ico|apple-icon.png|icon.png|.*\\.(?:png|jpg|jpeg|svg|ico|css|js|map|txt|xml|json|webp|woff2?)$).*)',
  ],
}
