'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
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
  MoonOutlined,
  SunOutlined,
  TrophyOutlined,
  SnippetsOutlined,
  MessageOutlined,
  HistoryOutlined,
  DeleteOutlined,
} from '@ant-design/icons'
import { useRouter, usePathname } from 'next/navigation'
import { clearAuth, getToken } from '@/lib/auth'
import { useTheme } from '@/lib/theme'
import IosNavBar from '@/components/ios/IosNavBar'
import IosTabBar, { type IosTabItem } from '@/components/ios/IosTabBar'

interface AppLayoutProps {
  children: React.ReactNode
  activeKey?: string
  title?: string
  subtitle?: string
  /** 隐藏顶部导航栏与底部 TabBar（用于需全屏的页面，如登录、版本对比） */
  hideNav?: boolean
  backPath?: string
  backLabel?: string
  headerExtra?: React.ReactNode
  /** 是否显示搜索栏，且提供了 onSearch 时渲染 iOS 搜索条 */
  searchable?: boolean
  onSearch?: (value: string) => void
  /** 内容区最大宽度（响应式居中），默认 960 */
  maxWidth?: number | string
}

/** 底部 TabBar 主导航（iOS 建议 ≤5 项） */
const TAB_ITEMS: IosTabItem[] = [
  { key: 'dashboard', label: '首页', icon: <HomeOutlined />, path: '/dashboard' },
  { key: 'home', label: '优化', icon: <ThunderboltOutlined />, path: '/' },
  { key: 'resumes', label: '简历', icon: <FileTextOutlined />, path: '/resumes' },
  { key: 'jobs', label: '岗位', icon: <FileSearchOutlined />, path: '/jobs' },
  { key: 'profile', label: '我的', icon: <UserOutlined />, path: '/profile' },
]

/** 主 Tab 之外的高级功能，通过右上角头像菜单「更多功能」进入，保证全部可达 */
const MORE_ITEMS: IosTabItem[] = [
  { key: 'scoring', label: '简历评分', icon: <TrophyOutlined />, path: '/scoring' },
  { key: 'batch', label: '批量优化', icon: <SnippetsOutlined />, path: '/batch' },
  { key: 'interviews', label: '面试追踪', icon: <MessageOutlined />, path: '/interviews' },
  { key: 'history', label: '历史记录', icon: <HistoryOutlined />, path: '/history' },
  { key: 'recycle', label: '回收站', icon: <DeleteOutlined />, path: '/recycle' },
]

/** iOS 风格搜索条，渲染在导航栏大标题下方 */
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
        padding: '9px 12px',
      }}
    >
      <SearchOutlined style={{ color: 'var(--text-tertiary)', fontSize: 16 }} />
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
          fontSize: 15,
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
            fontSize: 16,
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

export default function AppLayout({
  children,
  title,
  subtitle,
  hideNav = false,
  backPath,
  backLabel = '返回',
  headerExtra,
  searchable = true,
  onSearch,
  maxWidth = 960,
}: AppLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { theme, toggleTheme } = useTheme()
  const [token, setToken] = useState<string | null>(null)
  const [navigating, setNavigating] = useState(false)
  const prevPathRef = useRef(pathname)

  useEffect(() => {
    setToken(getToken())
  }, [pathname])

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

  const userMenuItems: MenuProps['items'] = useMemo(() => {
    const moreGroup = MORE_ITEMS.map((it) => ({
      key: it.key,
      label: it.label,
      icon: it.icon,
      onClick: () => router.push(it.path),
    }))
    return [
      { key: 'profile', label: '个人中心', icon: <UserOutlined />, onClick: () => router.push('/profile') },
      { type: 'divider' as const },
      ...moreGroup,
      { type: 'divider' as const },
      { key: 'logout', label: '退出登录', icon: <LogoutOutlined />, onClick: handleLogout },
    ]
  }, [router])

  const navRight = (
    <>
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
        <Avatar
          style={{ cursor: 'pointer', background: 'var(--primary-500)' }}
          icon={<UserOutlined />}
        />
      </Dropdown>
    </>
  )

  const showSearch = searchable !== false && !!onSearch
  const frameMax = typeof maxWidth === 'number' ? maxWidth : 960

  // ── 全屏模式（隐藏导航，如登录、版本对比加载态）──
  if (hideNav) {
    return <div style={{ minHeight: '100vh', background: 'var(--bg-body)' }}>{children}</div>
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-body)', display: 'flex', flexDirection: 'column', maxWidth: frameMax, margin: '0 auto', position: 'relative' }}>
      {/* 路由切换进度条 */}
      {navigating && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            maxWidth: frameMax,
            margin: '0 auto',
            height: 2,
            zIndex: 200,
            background: 'linear-gradient(90deg, transparent, var(--primary-500), transparent)',
            animation: 'route-progress 0.6s ease-in-out',
          }}
        />
      )}

      <IosNavBar
        title={title || ''}
        subtitle={subtitle}
        backPath={backPath}
        backLabel={backLabel}
        largeTitle={!backPath}
        right={navRight}
        search={showSearch ? <IosSearchBar onSearch={onSearch!} /> : undefined}
      />

      <main
        style={{
          flex: 1,
          width: '100%',
          padding: '0 16px',
          paddingBottom: 'calc(var(--tabbar-height) + env(safe-area-inset-bottom, 0px) + 16px)',
        }}
      >
        {children}
      </main>

      <IosTabBar items={TAB_ITEMS} activeKey={pathname} maxWidth={frameMax} />
    </div>
  )
}
