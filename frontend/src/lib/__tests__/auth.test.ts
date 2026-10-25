import { test, describe, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  getToken, getRefreshToken, clearAuth, isAuthenticated, isTokenExpired,
  setAuthTokens, syncAuthCookie,
} from '../auth.ts'

// auth.ts 依赖浏览器全局（window/localStorage/document.cookie/atob）。
// Node 下 atob 原生可用，其余需要 stub。注意：测试进程内
// globalThis.localStorage 可能已被 Node 自身定义（或未定义），统一替换为可控替身。
let cookieJar = new Map<string, string>()

function makeStorage(): Storage {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => { map.set(k, String(v)) },
    removeItem: (k: string) => { map.delete(k) },
    clear: () => { map.clear() },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() { return map.size },
  } as Storage
}

/** 迷你 cookie jar：解析 name=value 与 Max-Age（≤0 即删除），忽略 Path/SameSite/Secure */
function installDocumentStub() {
  ;(globalThis as any).document = {
    get cookie() {
      return Array.from(cookieJar.entries()).map(([k, v]) => `${k}=${v}`).join('; ')
    },
    set cookie(raw: string) {
      const [pair, ...attrs] = raw.split(';').map((s) => s.trim())
      const idx = pair.indexOf('=')
      const name = pair.slice(0, idx)
      const maxAge = attrs
        .find((a) => a.toLowerCase().startsWith('max-age='))
        ?.split('=')[1]
      if (maxAge !== undefined && Number(maxAge) <= 0) cookieJar.delete(name)
      else cookieJar.set(name, pair.slice(idx + 1))
    },
  }
}

before(() => {
  ;(globalThis as any).window = {}
  ;(globalThis as any).localStorage = makeStorage()
  installDocumentStub()
})

beforeEach(() => {
  localStorage.clear()
  cookieJar.clear()
})

/** 造一个仅前端可解析的 JWT 形状 token（后端不验签，atob 解 payload） */
function makeJwt(expOffsetSec: number): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64')
  const header = b64({ alg: 'HS256', typ: 'JWT' })
  const payload = b64({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) + expOffsetSec })
  return `${header}.${payload}.fake-signature`
}

describe('isTokenExpired', () => {
  test('未过期 token → false', () => {
    assert.equal(isTokenExpired(makeJwt(3600)), false)
  })

  test('已过期 token → true', () => {
    assert.equal(isTokenExpired(makeJwt(-60)), true)
  })

  test('null → true（无凭证视为不可用）', () => {
    assert.equal(isTokenExpired(null), true)
  })

  test('无 exp 字段 → false（无法本地判定，交给服务端 401）', () => {
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64')
    const token = `${b64({ alg: 'HS256' })}.${b64({ sub: 'u' })}.sig`
    assert.equal(isTokenExpired(token), false)
  })

  test('畸形 token → false（与历史行为一致，不误杀）', () => {
    assert.equal(isTokenExpired('not-a-jwt'), false)
  })
})

describe('getToken', () => {
  test('有效 token 原样返回', () => {
    const t = makeJwt(3600)
    localStorage.setItem('token', t)
    assert.equal(getToken(), t)
  })

  test('过期 token 返回 null 且不清除登录态（核心回归：refreshToken 必须保留）', () => {
    const expired = makeJwt(-60)
    const refresh = makeJwt(7 * 24 * 3600)
    localStorage.setItem('token', expired)
    localStorage.setItem('refreshToken', refresh)
    localStorage.setItem('user', JSON.stringify({ id: '1' }))
    localStorage.setItem('deviceId', 'dev-1')

    assert.equal(getToken(), null)
    // 历史 bug：过期即 clearAuth()，把 7 天 refreshToken 一并删掉，
    // 导致「记住我 7 天」从未生效。现在清除只发生在刷新失败/主动登出。
    assert.equal(localStorage.getItem('refreshToken'), refresh)
    assert.equal(localStorage.getItem('user'), JSON.stringify({ id: '1' }))
    assert.equal(localStorage.getItem('deviceId'), 'dev-1')
  })

  test('无 token → null', () => {
    assert.equal(getToken(), null)
  })

  test('畸形 token 原样返回（不过期校验，兼容自定义格式）', () => {
    localStorage.setItem('token', 'custom-format-token')
    assert.equal(getToken(), 'custom-format-token')
  })
})

describe('getRefreshToken', () => {
  test('有值原样返回；无值返回 null', () => {
    assert.equal(getRefreshToken(), null)
    localStorage.setItem('refreshToken', 'rt-1')
    assert.equal(getRefreshToken(), 'rt-1')
  })
})

describe('clearAuth / isAuthenticated', () => {
  test('clearAuth 清除全部四个认证 key + cookie 镜像', () => {
    localStorage.setItem('token', 't')
    localStorage.setItem('refreshToken', 'rt')
    localStorage.setItem('user', 'u')
    localStorage.setItem('deviceId', 'd')
    setAuthTokens('t', 'rt')
    assert.ok(document.cookie.includes('sr-token='))
    clearAuth()
    assert.equal(localStorage.length, 0)
    assert.ok(!document.cookie.includes('sr-token='), `cookie 未清: ${document.cookie}`)
    assert.ok(!document.cookie.includes('sr-refresh='), `cookie 未清: ${document.cookie}`)
  })

  test('isAuthenticated 与 getToken 一致', () => {
    assert.equal(isAuthenticated(), false)
    localStorage.setItem('token', makeJwt(3600))
    assert.equal(isAuthenticated(), true)
    localStorage.setItem('token', makeJwt(-60))
    assert.equal(isAuthenticated(), false)
  })
})

describe('cookie 镜像（C 方案：middleware 服务端前置鉴权）', () => {
  const enc = (v: string) => encodeURIComponent(v)

  test('setAuthTokens 同时写 localStorage 与 sr-token/sr-refresh cookie', () => {
    setAuthTokens('at-1', 'rt-1')
    assert.equal(localStorage.getItem('token'), 'at-1')
    assert.equal(localStorage.getItem('refreshToken'), 'rt-1')
    assert.ok(document.cookie.includes(`sr-token=${enc('at-1')}`))
    assert.ok(document.cookie.includes(`sr-refresh=${enc('rt-1')}`))
  })

  test('setAuthTokens 无 refresh 参数时不写 refresh cookie', () => {
    setAuthTokens('at-2')
    assert.ok(document.cookie.includes('sr-token='))
    assert.ok(!document.cookie.includes('sr-refresh='))
  })

  test('syncAuthCookie 从 localStorage 补写 cookie（存量用户兜底）', () => {
    localStorage.setItem('token', 'at-3')
    localStorage.setItem('refreshToken', 'rt-3')
    assert.ok(!document.cookie.includes('sr-token='))
    syncAuthCookie()
    assert.ok(document.cookie.includes('sr-token='))
    assert.ok(document.cookie.includes('sr-refresh='))
  })

  test('syncAuthCookie 双空时清 cookie（登出后残留清理）', () => {
    setAuthTokens('at-4', 'rt-4')
    localStorage.clear()
    syncAuthCookie()
    assert.ok(!document.cookie.includes('sr-token='))
    assert.ok(!document.cookie.includes('sr-refresh='))
  })
})
