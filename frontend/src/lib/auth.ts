const AUTH_KEYS = ['token', 'refreshToken', 'user', 'deviceId']

/**
 * middleware 唯一可读的登录态通道（C 方案：服务端前置鉴权）。
 * middleware 跑在 Edge runtime，读不到 localStorage，只能读 cookie——
 * 这里把登录态镜像一份到 cookie。设计约束：
 * - **非 httpOnly**：登出/清除时 JS 要能删；且 token 本就在 localStorage
 *   （XSS 同样可读），镜像不降低安全水位；
 * - **Max-Age 7 天，与 refreshToken TTL 对齐**：绝不能设成 access 的 2 小时，
 *   否则浏览器停止发送 cookie，middleware 会把「过期但可静默刷新」的用户
 *   误踢去登录，破坏 B 的 7 天免登录；
 * - cookie 只表达「有无登录票」，有效期以服务端验签 + 客户端刷新为准。
 */
const TOKEN_COOKIE = 'sr-token'
const REFRESH_COOKIE = 'sr-refresh'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7

function cookieSuffix(maxAge: number): string {
  const secure =
    typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : ''
  return `; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`
}

function writeCookie(name: string, value: string): void {
  if (typeof document === 'undefined') return
  document.cookie = `${name}=${encodeURIComponent(value)}${cookieSuffix(COOKIE_MAX_AGE)}`
}

function clearCookie(name: string): void {
  if (typeof document === 'undefined') return
  // 删除必须与写入保持同 Path/SameSite；Max-Age=0 立即过期
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`
}

function clearAuthCookie(): void {
  clearCookie(TOKEN_COOKIE)
  clearCookie(REFRESH_COOKIE)
}

/**
 * 登录态统一写入口：localStorage + cookie 镜像同步。
 * 调用方：邮箱登录、QQ 回调、注册、refresh 轮换。
 */
export function setAuthTokens(token: string, refreshToken?: string | null): void {
  if (typeof window === 'undefined') return
  localStorage.setItem('token', token)
  writeCookie(TOKEN_COOKIE, token)
  if (refreshToken) {
    localStorage.setItem('refreshToken', refreshToken)
    writeCookie(REFRESH_COOKIE, refreshToken)
  }
}

/**
 * 把 localStorage 的登录态补写进 cookie（兜底同步）。
 * 场景：① 存量用户（本方案上线前登录的，有 localStorage 无 cookie）被
 * middleware 拦到 /login 后，login 页/门自动弹回目标页前必须先补票，
 * 否则会形成「拦截→弹回→再拦截」死循环；② 极端情况下 cookie 丢失。
 * 两边都无票时顺带清 cookie（登出后残留清理）。
 */
export function syncAuthCookie(): void {
  if (typeof document === 'undefined' || typeof localStorage === 'undefined') return
  const t = localStorage.getItem('token')
  const r = localStorage.getItem('refreshToken')
  if (t) writeCookie(TOKEN_COOKIE, t)
  if (r) writeCookie(REFRESH_COOKIE, r)
  if (!t && !r) clearAuthCookie()
}

/** 解析 JWT payload（不验签，只取 exp）。畸形 token 返回 null */
function decodeJwtPayload(token: string): { exp?: number } | null {
  try {
    return JSON.parse(atob(token.split('.')[1]))
  } catch {
    return null
  }
}

/**
 * 判断 access token 是否已过期（纯判断，无副作用）。
 * 畸形 / 非标准 JWT 一律视为「未过期」——与历史行为一致：
 * 后端若使用自定义格式 token，前端无法本地判定，交给服务端 401 处理。
 */
export function isTokenExpired(token: string | null): boolean {
  if (!token) return true
  const payload = decodeJwtPayload(token)
  if (!payload?.exp) return false
  return payload.exp * 1000 < Date.now()
}

/**
 * 获取当前 access token。过期返回 null，但**不清除登录态**——
 * refreshToken（7 天）是否保留由调用方裁决：静默刷新成功则整体续期，
 * 只有刷新失败 / 用户主动登出才 clearAuth()。
 * 历史 bug：这里过期即 clearAuth()，把 refreshToken 一并删掉，
 * 「记住我 7 天」从未生效，每次 access 过期（默认 120 分钟）都被迫完整重登。
 */
export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  const token = localStorage.getItem('token')
  if (!token) return null
  if (isTokenExpired(token)) return null
  return token
}

/** 读取 refreshToken（过期与否由调用方判断，不做清除） */
export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('refreshToken')
}

/** 清除所有认证相关的 localStorage 数据 + cookie 镜像 */
export function clearAuth(): void {
  AUTH_KEYS.forEach(key => localStorage.removeItem(key))
  clearAuthCookie()
}

/** 清除管理员认证状态（额外清理 admin key） */
export function clearAdminAuth(): void {
  clearAuth()
  localStorage.removeItem('admin')
}

export function isAuthenticated(): boolean {
  return getToken() !== null
}
