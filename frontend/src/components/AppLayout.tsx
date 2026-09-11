'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Avatar, Badge, Button, Dropdown, type MenuProps } from 'antd'
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
} from '@ant-design/icons'
import { useRouter, usePathname } from 'next/navigation'
import { clearAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme'

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
  /** 是否显示搜索框（同时需提供 onSearch） */
  searchable?: boolean
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
    label: '工具',
    items: [
      { key: 'scoring', label: '简历评分', icon: <TrophyOutlined />, path: '/scoring' },
      { key: 'batch', label: '批量优化', icon: <SnippetsOutlined />, path: '/batch' },
      { key: 'interviews', label: '面试追踪', icon: <MessageOutlined />, path: '/interviews' },
      { key: 'history', label: '历史记录', icon: <HistoryOutlined />, path: '/history' },
      { key: 'recycle', label: '回收站', icon: <DeleteOutlined />, path: '/recycle' },
    ],
  },
]

/** iOS 风格搜索框（用于顶部栏） */
function IosSearchBar({
  onSearch,
  placeholder = '搜索',
}: {
  onSearch: (value: string) => void
  placeholder?: string
}) {
  const [value, setValue] = useState('')
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'var(--ios-systemfill)',
        borderRadius: 10,
        padding: '7px 12px',
        width: 220,
        maxWidth: '40vw',
      }}
    >
      <SearchOutlined style={{ color: 'var(--text-tertiary)', fontSize: 15 }} />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSearch(value)
        }}
        placeholder={placeholder}
        className="ios-search-input"
        aria-label={placeholder}
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
          onClick={() => {
            setValue('')
            onSearch('')
          }}
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
  const prevPathRef = useRef(pathname)

  // 路由切换时顶部显示细进度条，给予即时反馈
  useEffect(() => {
    if (prevPathRef.current !== pathname) {
      prevPathRef.current = pathname
      setNavigating(true)
      const timer = setTimeout(() => setNavigating(false), 600)
      return () => clearTimeout(timer)
    }
  }, [pathname])

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
      <Badge count={3} size="small">
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

  const showSearch = searchable !== false && !!onSearch

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
                <Link key={it.key} href={it.path} className={`wb-navitem${active ? ' active' : ''}`} onClick={() => setDrawerOpen(false)}>
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
          {showSearch && <IosSearchBar onSearch={onSearch!} />}
          {navRight}
        </header>

        <main className="wb-content">{children}</main>
      </div>
    </div>
  )
}
