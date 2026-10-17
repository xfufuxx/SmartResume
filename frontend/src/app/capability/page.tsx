'use client'

import React, { useEffect, useState } from 'react'
import { Tabs } from 'antd'
import { ExperimentOutlined, HistoryOutlined } from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/AppLayout'
import AuthGate from '@/components/AuthGate'
import { getToken } from '@/lib/auth'
import type { CapabilityAssessment, JobProfile } from '@/types'
import JobListTab from './components/JobListTab'
import RecordsTab from './components/RecordsTab'
import AssessmentFlow from './components/AssessmentFlow'
import ReportView from './components/ReportView'

export default function CapabilityPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('jobs')

  // 正在进行的测评（弹窗）与查看中的报告（弹窗）
  const [flowProfile, setFlowProfile] = useState<JobProfile | null>(null)
  const [viewing, setViewing] = useState<CapabilityAssessment | null>(null)
  // 每次完成/删除测评后自增，驱动「测评记录」Tab 重新拉取
  const [recordsKey, setRecordsKey] = useState(0)

  useEffect(() => {
    const t = getToken()
    if (!t) { router.push('/login'); return }
    setToken(t)
  }, [router])

  const handleAssessed = (assessment: CapabilityAssessment) => {
    setFlowProfile(null)
    setViewing(assessment)
    setRecordsKey((k) => k + 1)
  }

  if (!token) return <AuthGate activeKey="capability" />

  return (
    <AppLayout
      activeKey="capability"
      title="岗位能力测评"
      subtitle="全维度岗位能力自评，定位强弱项，获取分阶段提升路径与岗位匹配排行"
    >
      <div className="app-page-enter">
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'jobs',
              label: (
                <span>
                  <ExperimentOutlined style={{ marginRight: 6 }} />
                  岗位测评
                </span>
              ),
              children: (
                <JobListTab
                  onStart={(profile) => setFlowProfile(profile)}
                  onGoRecords={() => setActiveTab('records')}
                />
              ),
            },
            {
              key: 'records',
              label: (
                <span>
                  <HistoryOutlined style={{ marginRight: 6 }} />
                  测评记录
                </span>
              ),
              children: (
                <RecordsTab
                  refreshKey={recordsKey}
                  onView={(assessment) => setViewing(assessment)}
                  onDeleted={() => setRecordsKey((k) => k + 1)}
                  onGoAssess={() => setActiveTab('jobs')}
                />
              ),
            },
          ]}
        />
      </div>

      {/* 测评作答弹窗（专业能力 → 通识能力 两步） */}
      <AssessmentFlow
        open={!!flowProfile}
        profile={flowProfile}
        onCancel={() => setFlowProfile(null)}
        onDone={handleAssessed}
      />

      {/* 测评报告弹窗 */}
      <ReportView
        open={!!viewing}
        assessment={viewing}
        onCancel={() => setViewing(null)}
      />
    </AppLayout>
  )
}
