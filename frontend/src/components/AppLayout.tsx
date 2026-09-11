'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Layout, Menu, Button, Typography, Avatar, Badge, Input, Dropdown,
  type MenuProps,
} from 'antd'
import {
  HomeOutlined,
  FileTextOutlined,
  FileSearchOutlined,
  HistoryOutlined,
  UserOutlined,
  LogoutOutlined,
  BellOutlined,
  ThunderboltOutlined,
  LeftOutlined,
  SearchOutlined,
  MessageOutlined,
  TrophyOutlined,
  SnippetsOutlined,
  DeleteOutlined,
  MoonOutlined,
  SunOutlined,
} from '@ant-design/icons'
import { useRouter, usePathname } from 'next/navigation'
import { clearAuth, getToken } from '@/lib/auth'
import { useTheme } from '@/lib/theme'

const { Header, Sider, Content } = Layout

interface NavItem {
  key: string
  label: string
  icon: React.ReactNode
  path: string
}

const defaultNavItems: NavItem[] = [
  { key: 'dashboard', label: '首页', icon: <HomeOutlined />, path: '/dashboard' },
  { key: 'home', label: '简历优化', icon: <ThunderboltOutlined />, path: '/' },
  { key: 'resumes', label: '我的简历', icon: <FileTextOutlined />, path: '/resumes' },
  { key: 'jobs', label: '岗位库', icon: <FileSearchOutlined />, path: '/jobs' },
  { key: 'scoring', label: '简历评分', icon: <TrophyOutlined />, path: '/scoring' },
  { key: 'batch', label: '批量优化', icon: <SnippetsOutlined />, path: '/batch' },
  { key: 'interviews', label: '面试追踪', icon: <MessageOutlined />, path: '/interviews' },
  { key: 'history', label: '历史记录', icon: <HistoryOutlined />, path: '/history' },
  { key: 'recycle', label: '回收站', icon: <DeleteOutlined />, path: '/recycle' },
  { key: 'profile', label: '个人中心', icon: <UserOutlined />, path: '/profile' },
]

interface AppLayoutProps {
  children: React.ReactNode
  activeKey?: string
  title?: string
  subtitle?: string
  navItems?: NavItem[]
  maxWidth?: number | string
  hideNav?: boolean
  backPath?: string
  backLabel?: string
  headerExtra?: React.ReactNode
  searchable?: boolean
  onSearch?: (value: string) => void
}

export default function AppLayout({
  children,
  activeKey,
  title,
  subtitle,
  navItems = defaultNavItems,
  maxWidth = 1440,
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
  const [token, setToken] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [navigating, setNavigating] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const prevPathRef = useRef(pathname)

  useEffect(() => {
    setToken(getToken())
  }, [pathname])

  // 路由切换时显示顶部进度条，给予即时反馈，避免用户误以为卡顿而重复点击
  useEffect(() => {
    if (prevPathRef.current !== pathname) {
      prevPathRef.current = pathname
      setNavigating(true)
      const timer = setTimeout(() => setNavigating(false), 600)
      return () => clearTimeout(timer)
    }
  }, [pathname])

  const active = useMemo(() => {
    if (activeKey) return activeKey
    if (pathname === '/') return 'home'
    const item = navItems.find((n) => n.path === pathname)
    return item?.key || ''
  }, [activeKey, pathname, navItems])

  const triggerSearch = () => {
    onSearch?.(searchValue)
  }

  const handleLogout = () => {
    clearAuth()
    router.push('/login')
  }

  const userMenuItems: MenuProps['items'] = [
    { key: 'profile', label: '个人中心', icon: <UserOutlined />, onClick: () => router.push('/profile') },
    { type: 'divider' },
    { key: 'logout', label: '退出登录', icon: <LogoutOutlined />, onClick: handleLogout },
  ]

  const logo = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '18px 20px 14px',
      height: 64,
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: 10,
        background: 'linear-gradient(135deg, #2563EB, #3B82F6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 10px rgba(37, 99, 235, 0.25)',
      }}>
        <FileTextOutlined style={{ color: '#fff', fontSize: 18 }} />
      </div>
      {!collapsed && (
        <span style={{
          fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em',
        }}>智能简历</span>
      )}
    </div>
  )

  const userAvatar = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '12px 16px',
      borderTop: '1px solid var(--border-light)',
    }}>
      <Avatar style={{ background: 'linear-gradient(135deg, #2563EB, #3B82F6)' }} icon={<UserOutlined />} />
      {!collapsed && (
        <div style={{ overflow: 'hidden' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            当前用户
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{token ? '已登录' : '访客'}</div>
        </div>
      )}
    </div>
  )

  const sider = !hideNav && (
    <Sider
      width={220}
      collapsed={collapsed}
      collapsedWidth={72}
      trigger={null}
      collapsible
      style={{
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border-light)',
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {logo}
      <Menu
        mode="inline"
        selectedKeys={[active]}
        items={navItems.map((item) => ({
          key: item.key,
          icon: item.icon,
          label: item.label,
          onClick: () => router.push(item.path),
        }))}
        style={{ flex: 1, borderRight: 'none', paddingTop: 8 }}
      />
      {userAvatar}
    </Sider>
  )

  const headerLeft = backPath ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <Button
        icon={<LeftOutlined />}
        onClick={() => router.push(backPath)}
        type="text"
        style={{ color: 'var(--text-secondary)' }}
      >
        {backLabel}
      </Button>
      <div style={{ width: 1, height: 20, background: 'var(--border-light)' }} />
    </div>
  ) : null

  const pageTitle = title ? (
    <div>
      <Typography.Title level={4} style={{ margin: 0, fontWeight: 700, fontSize: 20, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
        {title}
      </Typography.Title>
      {subtitle && (
        <Typography.Text style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>{subtitle}</Typography.Text>
      )}
    </div>
  ) : null

  return (
    <Layout style={{ minHeight: '100vh', background: 'var(--bg-body)' }}>
      {sider}
      <Layout style={{
        marginLeft: hideNav ? 0 : (collapsed ? 72 : 220),
        transition: 'margin-left 0.2s ease',
        minHeight: '100vh',
        background: 'var(--bg-body)',
      }}>
        <Header style={{
          height: 84,
          background: 'var(--bg-header)',
          borderBottom: '1px solid var(--border-light)',
          padding: '20px 24px 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          position: 'sticky',
          top: 0,
          zIndex: 99,
          overflow: 'hidden',
        }}>
          {navigating && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                height: 3,
                width: '100%',
                background: 'linear-gradient(90deg, transparent, #2563EB, transparent)',
                borderRadius: 3,
                animation: 'route-progress 0.6s ease-in-out',
              }}
            />
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 0 }}>
            {headerLeft}
            {pageTitle}
          </div>

          {searchable && (
            <div style={{ width: 360, maxWidth: '40%' }}>
              <Input
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                placeholder="搜索简历、职位、模板..."
                allowClear
                onPressEnter={triggerSearch}
                style={{ width: '100%' }}
                suffix={
                  <span
                    role="button"
                    aria-label="搜索"
                    onClick={triggerSearch}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      paddingLeft: 10,
                      marginLeft: 8,
                      borderLeft: '1px solid var(--border-light)',
                      cursor: 'pointer',
                      color: 'var(--text-tertiary)',
                      transition: 'color 0.2s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--primary-500)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)' }}
                  >
                    <SearchOutlined style={{ fontSize: 16 }} />
                  </span>
                }
              />
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {headerExtra}
            <Button
              type="text"
              icon={theme === 'dark' ? <SunOutlined style={{ fontSize: 18 }} /> : <MoonOutlined style={{ fontSize: 18 }} />}
              onClick={toggleTheme}
              style={{ color: 'var(--text-tertiary)' }}
              title={theme === 'dark' ? '切换浅色主题' : '切换深色主题'}
            />
            <Badge count={3} size="small">
              <Button type="text" icon={<BellOutlined style={{ fontSize: 18 }} />} style={{ color: 'var(--text-tertiary)' }} onClick={() => router.push('/messages')} />
            </Badge>
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <Avatar style={{ cursor: 'pointer', background: 'linear-gradient(135deg, #2563EB, #3B82F6)' }} icon={<UserOutlined />} />
            </Dropdown>
          </div>
        </Header>

        <Content style={{
          padding: 24,
          maxWidth,
          margin: '0 auto',
          width: '100%',
        }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  )
}
