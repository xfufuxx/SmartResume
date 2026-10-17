'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  Alert, Button, Modal, Rate, Space, Steps, Typography,
} from 'antd'
import { LeftOutlined, RightOutlined } from '@ant-design/icons'
import { capability } from '@/lib/api'
import type { CapabilityAssessment, JobProfile } from '@/types'

const { Text, Paragraph } = Typography

interface Props {
  open: boolean
  profile: JobProfile | null
  onCancel: () => void
  onDone: (assessment: CapabilityAssessment) => void
}

const SCORE_HINTS: Record<number, string> = {
  1: '零基础：没有概念或从未接触',
  2: '了解：知道概念，需要查资料才能动手',
  3: '入门：能在指导下完成常规任务',
  4: '熟练：能独立完成任务并处理常见问题',
  5: '精通：能设计方法、指导他人并优化流程',
}

/** 测评作答弹窗：专业能力 → 通识能力 两步，1~5 星自评 */
export default function AssessmentFlow({ open, profile, onCancel, onDone }: Props) {
  const [step, setStep] = useState(0)
  const [profScores, setProfScores] = useState<Record<string, number>>({})
  const [genScores, setGenScores] = useState<Record<string, number>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // 打开新测评时重置全部状态
  useEffect(() => {
    if (open) {
      setStep(0)
      setProfScores({})
      setGenScores({})
      setError('')
    }
  }, [open, profile?.id])

  const profDims = profile?.professional_dimensions || []
  const genDims = profile?.general_dimensions || []
  const currentDims = step === 0 ? profDims : genDims
  const currentScores = step === 0 ? profScores : genScores
  const setCurrentScores = step === 0 ? setProfScores : setGenScores

  const ratedCount = useMemo(
    () => currentDims.filter((d) => currentScores[d.name]).length,
    [currentDims, currentScores],
  )
  const allRated = ratedCount === currentDims.length && currentDims.length > 0

  const handleNext = () => {
    if (!allRated) {
      setError(`还有 ${currentDims.length - ratedCount} 个维度未评分，请全部完成后再继续`)
      return
    }
    setError('')
    setStep(1)
  }

  const handleSubmit = async () => {
    if (!profile) return
    if (!allRated) {
      setError(`还有 ${currentDims.length - ratedCount} 个维度未评分`)
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await capability.submit({
        job_profile_id: profile.id,
        professional_scores: profScores,
        general_scores: genScores,
      })
      onDone(res.data)
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : '提交失败，请检查网络后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      title={profile ? `「${profile.title}」能力测评` : '能力测评'}
      onCancel={onCancel}
      width={720}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          取消
        </Button>,
        step === 0 ? (
          <Button key="next" type="primary" icon={<RightOutlined />} onClick={handleNext} disabled={!allRated}>
            下一步：通识基础素质
          </Button>
        ) : (
          <Space key="actions">
            <Button icon={<LeftOutlined />} onClick={() => { setError(''); setStep(0) }}>
              上一步
            </Button>
            <Button type="primary" loading={submitting} onClick={handleSubmit} disabled={!allRated}>
              提交并生成报告
            </Button>
          </Space>
        ),
      ]}
    >
      {profile && (
        <>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message={`岗位能力自评：共 ${profDims.length + genDims.length} 个考察点（约 ${Math.max(2, Math.ceil((profDims.length + genDims.length) / 4))} 分钟），完整覆盖该岗位的主要能力要求；请按真实水平打分（1~5 星），系统据此计算匹配度并生成针对性提升建议。`}
          />
          <Steps
            size="small"
            current={step}
            style={{ marginBottom: 20 }}
            items={[
              { title: `专业核心考察点（${profDims.length} 项）` },
              { title: `通识基础素质（${genDims.length} 项）` },
            ]}
          />
          {error && (
            <Alert type="warning" showIcon message={error} style={{ marginBottom: 16 }} />
          )}
          <div style={{ maxHeight: '46vh', overflowY: 'auto', paddingRight: 4 }}>
            {currentDims.map((dim, idx) => (
              <div
                key={dim.name}
                style={{
                  padding: '12px 0',
                  borderBottom: idx === currentDims.length - 1 ? 'none' : '1px solid var(--border-light)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <Text strong>{dim.name}</Text>
                    <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0 }}>
                      {dim.desc}
                    </Paragraph>
                  </div>
                  <Rate
                    count={5}
                    value={currentScores[dim.name] || 0}
                    onChange={(v) => {
                      setCurrentScores((prev) => ({ ...prev, [dim.name]: v }))
                      setError('')
                    }}
                  />
                </div>
                {currentScores[dim.name] ? (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {SCORE_HINTS[currentScores[dim.name]] || ''}
                  </Text>
                ) : null}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, textAlign: 'right' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              已评 {ratedCount} / {currentDims.length} 项
            </Text>
          </div>
        </>
      )}
    </Modal>
  )
}
