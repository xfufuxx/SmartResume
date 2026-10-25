import { test, describe, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  getToken, getRefreshToken, clearAuth, isAuthenticated, isTokenExpired,
} from '../auth.ts'

// auth.ts 依赖浏览器全局（window/localStorage/atob）。Node 下 atob 原生可用，
// window/localStorage 需要 stub。注意：测试进程内 globalThis.localStorage
// 可能已被 Node 自身定义（或未定义），统一替换为可控替身。
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

before(() => {
  ;(globalThis as any).window = {}
  ;(globalThis as any).localStorage = makeStorage()
})

beforeEach(() => {
  localStorage.clear()
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
  test('clearAuth 清除全部四个认证 key', () => {
    localStorage.setItem('token', 't')
    localStorage.setItem('refreshToken', 'rt')
    localStorage.setItem('user', 'u')
    localStorage.setItem('deviceId', 'd')
    clearAuth()
    assert.equal(localStorage.length, 0)
  })

  test('isAuthenticated 与 getToken 一致', () => {
    assert.equal(isAuthenticated(), false)
    localStorage.setItem('token', makeJwt(3600))
    assert.equal(isAuthenticated(), true)
    localStorage.setItem('token', makeJwt(-60))
    assert.equal(isAuthenticated(), false)
  })
})
