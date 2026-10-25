const AUTH_KEYS = ['token', 'refreshToken', 'user', 'deviceId']

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

/** 清除所有认证相关的 localStorage 数据 */
export function clearAuth(): void {
  AUTH_KEYS.forEach(key => localStorage.removeItem(key))
}

/** 清除管理员认证状态（额外清理 admin key） */
export function clearAdminAuth(): void {
  clearAuth()
  localStorage.removeItem('admin')
}

export function isAuthenticated(): boolean {
  return getToken() !== null
}
