const AUTH_KEYS = ['token', 'refreshToken', 'user', 'deviceId']

/**
 * 获取当前 token，同时校验 JWT 是否过期。
 * 过期或无效则自动清除认证状态并返回 null（与改动前行为一致）。
 * 双 token 的自动刷新由 api.ts 拦截器在收到真实 401 时处理。
 */
export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  const token = localStorage.getItem('token')
  if (!token) return null

  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      clearAuth()
      return null
    }
  } catch {
    // token 格式不合法（非标准 JWT），仅返回 token 不做过期校验
    // 因为后端可能使用自定义格式的 token
  }

  return token
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
