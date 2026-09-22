'use client'

import React, { useEffect, useState } from 'react'
import { Tabs } from 'antd'
import { SendOutlined, MessageOutlined, CommentOutlined } from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/AppLayout'
import AuthGate from '@/components/AuthGate'
import { getToken } from '@/lib/auth'
import type { Application } from '@/types'
import ApplicationsTab from './components/ApplicationsTab'
import InterviewProgressTab from './components/InterviewProgressTab'
import CommunicationsTab from './components/CommunicationsTab'

export default function InterviewHub() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string>('applications')
  // 从「投递记录」联动到「沟通消息」时预选的投递（消费后置空，避免重复弹窗）
  const [presetApplicationId, setPresetApplicationId] = useState<string | null>(null)

  const handleRecordCommunication = (app: Application) => {
    setPresetApplicationId(app.id)
    setActiveTab('messages')
  }

  useEffect(() => {
    const t = getToken()
    if (!t) { router.push('/login'); return }
    setToken(t)
  }, [router])

  if (!token) return <AuthGate activeKey="interviews" />

  return (
    <AppLayout
      activeKey="interviews"
      title="面试追踪"
      subtitle="投递记录 · 面试进度 · 沟通消息，集中管理你的求职过程"
    >
      <div className="app-page-enter">
        <Tabs
          className="apps-hub-tabs"
          activeKey={activeTab}
          onChange={(key) => {
            setActiveTab(key)
            // 手动切 Tab 视为联动结束，清掉预选投递，避免再次进入时重复弹出沟通弹窗
            setPresetApplicationId(null)
          }}
          items={[
            {
              key: 'applications',
              label: (
                <span>
                  <SendOutlined style={{ marginRight: 6 }} />
                  投递记录
                </span>
              ),
            },
            {
              key: 'progress',
              label: (
                <span>
                  <MessageOutlined style={{ marginRight: 6 }} />
                  面试进度
                </span>
              ),
            },
            {
              key: 'messages',
              label: (
                <span>
                  <CommentOutlined style={{ marginRight: 6 }} />
                  沟通消息
                </span>
              ),
            },
          ]}
        />

        {activeTab === 'applications' && (
          <ApplicationsTab onRecordCommunication={handleRecordCommunication} />
        )}
        {activeTab === 'progress' && <InterviewProgressTab />}
        {activeTab === 'messages' && (
          <CommunicationsTab
            initialApplicationId={presetApplicationId}
          />
        )}
      </div>
    </AppLayout>
  )
}
