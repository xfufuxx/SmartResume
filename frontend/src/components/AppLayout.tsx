'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Avatar, Badge, Button, Dropdown, Spin, Tag, type MenuProps } from 'antd'
import {
  HomeOutlined,
  FileTextOutlined,
  FileSearchOutlined,
  UserOutlined,
  LogoutOutlined,
  BellOutlined,
  ThunderboltOutlined,
  SearchOutlined,
  MenuOutlined,
  MoonOutlined,
  SunOutlined,
  TrophyOutlined,
  SnippetsOutlined,
  MessageOutlined,
  HistoryOutlined,
  DeleteOutlined,
  ArrowLeftOutlined,
  TeamOutlined,
  SafetyCertificateOutlined,
  AimOutlined,
} from '@ant-design/icons'
import { useRouter, usePathname } from 'next/navigation'
import { clearAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme'
import { messages, search } from '@/lib/api'
import type { SearchResult } from '@/types'

interface AppLayoutProps {
  children: React.ReactNode
  /** 当前激活的导航项 key（用于高亮） */
  activeKey?: string
  /** 顶部标题 */
  title?: string
  subtitle?: string
  /** 隐藏整个导航外壳（用于登录、版本对比等全屏页） */
  hideNav?: boolean
  /** 提供则返回箭头（网页端详情页返回） */
  backPath?: string
  backLabel?: string
  /** 顶部右侧自定义内容 */
  headerExtra?: React.ReactNode
  /** 是否显示搜索框 */
  searchable?: boolean
  /** 页面级本地搜索回调（提供后，回车会同时触发页面内过滤） */
  onSearch?: (value: string) => void
}

interface NavItem {
  key: string
  label: string
  icon: React.ReactNode
  path: string
}

/** 网页端侧边栏导航（完整功能，不限 5 项） */
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: '主功能',
    items: [
      { key: 'dashboard', label: '首页', icon: <HomeOutlined />, path: '/dashboard' },
      { key: 'home', label: '优化', icon: <ThunderboltOutlined />, path: '/' },
      { key: 'resumes', label: '简历', icon: <FileTextOutlined />, path: '/resumes' },
      { key: 'jobs', label: '岗位', icon: <FileSearchOutlined />, path: '/jobs' },
      { key: 'profile', label: '我的', icon: <UserOutlined />, path: '/profile' },
    ],
  },
  {
    label: '求职工具',
    items: [
      { key: 'interview', label: 'AI 面试押题', icon: <TeamOutlined />, path: '/interview' },
      { key: 'match', label: '岗位匹配罗盘', icon: <AimOutlined />, path: '/match' },
      { key: 'ats', label: 'ATS 体检', icon: <SafetyCertificateOutlined />, path: '/ats' },
      { key: 'scoring', label: '简历评分', icon: <TrophyOutlined />, path: '/scoring' },
      { key: 'batch', label: '批量优化', icon: <SnippetsOutlined />, path: '/batch' },
    ],
  },
  {
    label: '记录',
    items: [
      { key: 'interviews', label: '面试追踪', icon: <MessageOutlined />, path: '/interviews' },
      { key: 'history', label: '历史记录', icon: <HistoryOutlined />, path: '/history' },
      { key: 'recycle', label: '回收站', icon: <DeleteOutlined />, path: '/recycle' },
    ],
  },
]

/** 搜索结果分组配色与跳转路径 */
const SEARCH_GROUPS = [
  { key: 'resumes' as const, label: '简历', path: (id: string) => `/resumes` },
  { key: 'jobs' as const, label: '岗位', path: (id: string) => `/jobs` },
  { key: 'optimizations' as const, label: '优化记录', path: (id: string) => `/history/${id}` },
]

/** 全局搜索：跨简历 / 岗位 / 优化记录聚合检索 */
function GlobalSearch({ onPageSearch }: { onPageSearch?: (value: string) => void }) {
  const router = useRouter()
  const [value, setValue] = useState('')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SearchResult | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const reqSeq = useRef(0)

  // 输入防抖 350ms 后请求后端，避免每敲一个字打一次接口
  useEffect(() => {
    const kw = value.trim()
    if (!kw) {
      setResult(null)
      setOpen(false)
      return
    }
    setLoading(true)
    const timer = setTimeout(async () => {
      const seq = ++reqSeq.current
      try {
        const res = await search.all(kw, 5)
        if (seq === reqSeq.current) {
          setResult(res.data)
          setOpen(true)
        }
      } catch {
        if (seq === reqSeq.current) setResult(null)
      } finally {
        if (seq === reqSeq.current) setLoading(false)
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [value])

  // 点击空白关闭结果面板
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const total = result?.total ?? 0

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'var(--ios-systemfill)',
          borderRadius: 10,
          padding: '7px 12px',
          width: 240,
          maxWidth: '42vw',
        }}
      >
        {loading ? <Spin size="small" /> : <SearchOutlined style={{ color: 'var(--text-tertiary)', fontSize: 15 }} />}
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => { if (result && total > 0) setOpen(true) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onPageSearch?.(value)
              setOpen(true)
            }
            if (e.key === 'Escape') setOpen(false)
          }}
          placeholder="搜索简历 / 岗位 / 优化记录"
          className="ios-search-input"
          aria-label="全局搜索"
          style={{
            flex: 1,
            border: 'none',
            background: 'transparent',
            outline: 'none',
            fontSize: 14,
            color: 'var(--text-primary)',
            minWidth: 0,
          }}
        />
        {value && (
          <button
            onClick={() => { setValue(''); setResult(null); setOpen(false); onPageSearch?.('') }}
            aria-label="清除"
            className="ios-press"
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
              fontSize: 14,
              lineHeight: 1,
              padding: 0,
            }}
          >
            ✕
          </button>
        )}
      </div>

      {open && value.trim() && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            width: 400,
            maxWidth: '86vw',
            maxHeight: 420,
            overflowY: 'auto',
            background: 'var(--bg-card, #fff)',
            border: '1px solid var(--border-light)',
            borderRadius: 12,
            boxShadow: '0 12px 32px rgba(15, 23, 42, 0.14)',
            zIndex: 120,
            padding: '6px 0',
          }}
        >
          {!result || total === 0 ? (
            <div style={{ padding: '18px 16px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
              {loading ? '搜索中…' : '没有匹配的简历、岗位或优化记录'}
            </div>
          ) : (
            SEARCH_GROUPS.map((group) => {
              const items = result[group.key] || []
              if (!items.length) return null
              return (
                <div key={group.key}>
                  <div style={{ padding: '8px 16px 4px', fontSize: 11, color: 'var(--text-tertiary)', letterSpacing: 0.5 }}>
                    {group.label}
                  </div>
                  {items.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => {
                        setOpen(false)
                        router.push(group.path(item.id))
                      }}
                      style={{
                        padding: '8px 16px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-page)' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.title}
                          {item.company ? <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: 6 }}>@ {item.company}</span> : null}
                        </div>
                        {item.snippet && (
                          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.snippet}
                          </div>
                        )}
                      </div>
                      {item.match_score != null && (
                        <Tag color="blue" style={{ marginInlineEnd: 0, flexShrink: 0 }}>{item.match_score}%</Tag>
                      )}
                    </div>
                  ))}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

function isActive(item: NavItem, pathname: string, activeKey?: string) {
  if (activeKey && activeKey === item.key) return true
  if (item.path === '/') return pathname === '/' || pathname === ''
  return pathname === item.path || pathname.startsWith(item.path + '/')
}

export default function AppLayout({
  children,
  activeKey,
  title,
  subtitle,
  hideNav = false,
  backPath,
  backLabel = '返回',
  headerExtra,
  searchable = true,
  onSearch,
}: AppLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { theme, toggleTheme } = useTheme()
  const [navigating, setNavigating] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const prevPathRef = useRef(pathname)
  const prefetchedRef = useRef(false)

  // 路由切换时顶部显示细进度条；在新路由真正提交（commit）后通过双 rAF 收起，
  // 不再写死 600ms，避免“进度条走完但页面还没好”的虚假即时反馈
  useEffect(() => {
    if (prevPathRef.current !== pathname) {
      prevPathRef.current = pathname
      setNavigating(true)
    }
  }, [pathname])

  useEffect(() => {
    if (!navigating) return
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => setNavigating(false)),
    )
    return () => cancelAnimationFrame(raf)
  }, [navigating, pathname])

  // 登录后预热所有板块路由 chunk：使首次点击即时跳转，
  // 解决「首次登录点击功能板块卡顿/需点击多次」的问题（路由按需编译/下载导致白屏）
  useEffect(() => {
    if (prefetchedRef.current) return
    prefetchedRef.current = true
    NAV_GROUPS.forEach((group) =>
      group.items.forEach((it) => {
        try {
          router.prefetch(it.path)
        } catch {
          /* 预取失败不影响导航 */
        }
      })
    )
    // 侧边栏未列出的高频入口（铃铛消息）也预热，确保点击即时跳转
    ;['/messages'].forEach((p) => {
      try {
        router.prefetch(p)
      } catch {
        /* 预取失败不影响导航 */
      }
    })
  }, [router])

  // 未读消息红点：登录后拉取一次真实未读数（原为写死 3）。
  // 改为仅在挂载时拉取，避免每次路由切换都发起一次后端请求——多用户并发下可显著减少无效调用
  useEffect(() => {
    const load = async () => {
      try {
        const res = await messages.list(1, 1, true)
        setUnreadCount(res.data?.unread_count || 0)
      } catch {
        /* 静默失败：铃铛仍可正常跳转 */
      }
    }
    load()
  }, [])

  const handleLogout = () => {
    clearAuth()
    router.push('/login')
  }

  const userMenuItems: MenuProps['items'] = useMemo(
    () => [
      { key: 'profile', label: '个人中心', icon: <UserOutlined />, onClick: () => router.push('/profile') },
      { type: 'divider' as const },
      { key: 'logout', label: '退出登录', icon: <LogoutOutlined />, onClick: handleLogout },
    ],
    [router],
  )

  // ── 全屏模式（隐藏导航外壳）──
  if (hideNav) {
    return <div className="wb-shell">{children}</div>
  }

  const navRight = (
    <div className="wb-header-right">
      {headerExtra}
      <Button
        type="text"
        icon={theme === 'dark' ? <SunOutlined style={{ fontSize: 18 }} /> : <MoonOutlined style={{ fontSize: 18 }} />}
        onClick={toggleTheme}
        style={{ color: 'var(--text-tertiary)' }}
        title={theme === 'dark' ? '切换浅色主题' : '切换深色主题'}
      />
      <Badge count={unreadCount} size="small">
        <Button
          type="text"
          icon={<BellOutlined style={{ fontSize: 18 }} />}
          style={{ color: 'var(--text-tertiary)' }}
          onClick={() => router.push('/messages')}
        />
      </Badge>
      <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
        <Avatar style={{ cursor: 'pointer', background: 'var(--primary-500)' }} icon={<UserOutlined />} />
      </Dropdown>
    </div>
  )

  return (
    <div className="wb-shell">
      {/* 路由切换进度条（全宽） */}
      {navigating && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            zIndex: 200,
            background: 'linear-gradient(90deg, transparent, var(--primary-500), transparent)',
            animation: 'route-progress 0.6s ease-in-out',
          }}
        />
      )}

      {/* 左侧玻璃侧边栏（网页端） */}
      <aside className={`wb-sidebar${drawerOpen ? ' open' : ''}`}>
        <div className="wb-brand">
          <div className="wb-brand-logo">
            <ThunderboltOutlined />
          </div>
          <span className="wb-brand-name">智能简历</span>
        </div>

        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="wb-nav-group-label">{group.label}</div>
            {group.items.map((it) => {
              const active = isActive(it, pathname, activeKey)
              return (
                <Link key={it.key} href={it.path} className={`wb-navitem${active ? ' active' : ''}`} onClick={() => { setNavigating(true); setDrawerOpen(false) }}>
                  <span className="wb-nav-icon">{it.icon}</span>
                  <span>{it.label}</span>
                </Link>
              )
            })}
          </div>
        ))}

        <div className="wb-sidebar-footer">
          <Avatar style={{ background: 'var(--primary-500)' }} size={32} icon={<UserOutlined />} />
          <div style={{ lineHeight: 1.2, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>我的账户</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>免费版</div>
          </div>
        </div>
      </aside>

      {/* 移动端抽屉遮罩 */}
      {drawerOpen && <div className="wb-backdrop" onClick={() => setDrawerOpen(false)} />}

      {/* 主区域：顶部栏 + 内容 */}
      <div className="wb-main">
        <header className="wb-header">
          <button className="wb-hamburger" onClick={() => setDrawerOpen((v) => !v)} aria-label="菜单">
            <MenuOutlined />
          </button>
          {backPath && (
            <button
              onClick={() => router.push(backPath)}
              className="ios-press"
              aria-label={backLabel}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                border: 'none',
                background: 'transparent',
                color: 'var(--ios-blue)',
                fontSize: 15,
                cursor: 'pointer',
                padding: '6px 4px',
              }}
            >
              <ArrowLeftOutlined />
              <span>{backLabel}</span>
            </button>
          )}
          {(title || subtitle) && (
            <div className="wb-header-title">
              {title && <b>{title}</b>}
              {subtitle && <span>{subtitle}</span>}
            </div>
          )}
          {searchable !== false && <GlobalSearch onPageSearch={onSearch} />}
          {navRight}
        </header>

        <main className="wb-content">{children}</main>
      </div>
    </div>
  )
}
