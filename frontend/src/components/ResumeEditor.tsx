'use client'

import React from 'react'
import { Input, Button, Select, Space, Card, Typography, Empty } from 'antd'
import {
  PlusOutlined, DeleteOutlined, MinusCircleOutlined,
} from '@ant-design/icons'
import type { ResumeParseResult } from '@/types'

const { TextArea } = Input

interface ResumeEditorProps {
  value: ResumeParseResult
  onChange: (next: ResumeParseResult) => void
  /** 只读展示个人信息（不允许编辑，避免篡改身份信息） */
  personalInfo?: { name?: string; email?: string; phone?: string }
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '4px 0 10px' }}>
      {children}
    </div>
  )
}

/** 优化结果在线编辑器：直接微调 AI 产出的简历 JSON */
export default function ResumeEditor({ value, onChange, personalInfo }: ResumeEditorProps) {
  const patch = (partial: Partial<ResumeParseResult>) => onChange({ ...value, ...partial })

  const updateExperience = (idx: number, partial: Record<string, unknown>) => {
    const list = [...(value.experience || [])]
    list[idx] = { ...list[idx], ...partial }
    patch({ experience: list })
  }

  const updateProject = (idx: number, partial: Record<string, unknown>) => {
    const list = [...(value.projects || [])]
    list[idx] = { ...list[idx], ...partial }
    patch({ projects: list })
  }

  const updateEducation = (idx: number, partial: Record<string, unknown>) => {
    const list = [...(value.education || [])]
    list[idx] = { ...list[idx], ...partial }
    patch({ education: list })
  }

  return (
    <div>
      {personalInfo && (personalInfo.name || personalInfo.email || personalInfo.phone) && (
        <div style={{
          background: 'var(--bg-page)', borderRadius: 8, padding: '10px 12px',
          fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 16,
        }}>
          个人信息（{personalInfo.name || '未填写'} · {personalInfo.phone || '-'} · {personalInfo.email || '-'}）不可编辑，如需修改请重新上传简历。
        </div>
      )}

      {/* 个人总结 */}
      <Card size="small" style={{ marginBottom: 12 }} title={<span style={{ fontSize: 13 }}>个人总结</span>}>
        <TextArea
          rows={4}
          value={value.summary || ''}
          onChange={(e) => patch({ summary: e.target.value })}
          placeholder="用 2-3 句话概括你的核心竞争力和目标方向"
          maxLength={600}
          showCount
        />
      </Card>

      {/* 技能 */}
      <Card size="small" style={{ marginBottom: 12 }} title={<span style={{ fontSize: 13 }}>专业技能</span>}>
        <Select
          mode="tags"
          style={{ width: '100%' }}
          placeholder="输入技能后回车添加，例如：Python、项目管理"
          value={value.skills || []}
          onChange={(v) => patch({ skills: v as string[] })}
          tokenSeparators={[',', '，', '、']}
        />
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
          拖动顺序即导出顺序，建议把岗位最看重的技能放前面
        </div>
      </Card>

      {/* 工作经历 */}
      <Card
        size="small"
        style={{ marginBottom: 12 }}
        title={<span style={{ fontSize: 13 }}>工作经历（{value.experience?.length || 0}）</span>}
        extra={
          <Button
            type="link"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => patch({ experience: [...(value.experience || []), { title: '', company: '', start: '', end: '', points: [''] }] })}
          >
            添加
          </Button>
        }
      >
        {(value.experience || []).length ? (
          (value.experience || []).map((exp, i) => (
            <div key={i} style={{ border: '1px solid var(--border-light)', borderRadius: 8, padding: 12, marginBottom: 10 }}>
              <Space wrap style={{ marginBottom: 8 }}>
                <Input
                  style={{ width: 160 }}
                  placeholder="职位"
                  value={exp.title || ''}
                  onChange={(e) => updateExperience(i, { title: e.target.value })}
                />
                <Input
                  style={{ width: 160 }}
                  placeholder="公司"
                  value={exp.company || ''}
                  onChange={(e) => updateExperience(i, { company: e.target.value })}
                />
                <Input
                  style={{ width: 100 }}
                  placeholder="开始 2021.06"
                  value={exp.start || ''}
                  onChange={(e) => updateExperience(i, { start: e.target.value })}
                />
                <Input
                  style={{ width: 100 }}
                  placeholder="结束 至今"
                  value={exp.end || ''}
                  onChange={(e) => updateExperience(i, { end: e.target.value })}
                />
                <Button
                  danger
                  type="text"
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={() => patch({ experience: (value.experience || []).filter((_, k) => k !== i) })}
                />
              </Space>

              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 6 }}>工作要点（建议带数字）</div>
              {(exp.points || []).map((p, j) => (
                <div key={j} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <TextArea
                    autoSize={{ minRows: 1, maxRows: 4 }}
                    value={p}
                    onChange={(e) => {
                      const points = [...(exp.points || [])]
                      points[j] = e.target.value
                      updateExperience(i, { points })
                    }}
                    placeholder="例如：主导 XX 系统重构，QPS 提升 3 倍"
                  />
                  <Button
                    type="text"
                    icon={<MinusCircleOutlined />}
                    onClick={() => updateExperience(i, { points: (exp.points || []).filter((_, k) => k !== j) })}
                  />
                </div>
              ))}
              <Button
                type="dashed"
                size="small"
                block
                icon={<PlusOutlined />}
                onClick={() => updateExperience(i, { points: [...(exp.points || []), ''] })}
              >
                添加要点
              </Button>
            </div>
          ))
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无工作经历" />
        )}
      </Card>

      {/* 项目经历 */}
      <Card
        size="small"
        style={{ marginBottom: 12 }}
        title={<span style={{ fontSize: 13 }}>项目经历（{value.projects?.length || 0}）</span>}
        extra={
          <Button
            type="link"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => patch({ projects: [...(value.projects || []), { name: '', description: '', tech: [] }] })}
          >
            添加
          </Button>
        }
      >
        {(value.projects || []).length ? (
          (value.projects || []).map((proj, i) => (
            <div key={i} style={{ border: '1px solid var(--border-light)', borderRadius: 8, padding: 12, marginBottom: 10 }}>
              <Space style={{ marginBottom: 8, width: '100%' }}>
                <Input
                  style={{ flex: 1 }}
                  placeholder="项目名称"
                  value={proj.name || ''}
                  onChange={(e) => updateProject(i, { name: e.target.value })}
                />
                <Button
                  danger
                  type="text"
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={() => patch({ projects: (value.projects || []).filter((_, k) => k !== i) })}
                />
              </Space>
              <TextArea
                rows={2}
                placeholder="项目描述：做了什么、解决了什么问题、产出是什么"
                value={proj.description || ''}
                onChange={(e) => updateProject(i, { description: e.target.value })}
              />
              <div style={{ marginTop: 8 }}>
                <Select
                  mode="tags"
                  style={{ width: '100%' }}
                  placeholder="技术栈"
                  value={proj.tech || []}
                  onChange={(v) => updateProject(i, { tech: v as string[] })}
                  tokenSeparators={[',', '，', '、']}
                />
              </div>
            </div>
          ))
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无项目经历" />
        )}
      </Card>

      {/* 教育背景 */}
      <Card
        size="small"
        title={<span style={{ fontSize: 13 }}>教育背景（{value.education?.length || 0}）</span>}
        extra={
          <Button
            type="link"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => patch({ education: [...(value.education || []), { school: '', degree: '', major: '', start: '', end: '' }] })}
          >
            添加
          </Button>
        }
      >
        {(value.education || []).length ? (
          (value.education || []).map((edu, i) => (
            <Space key={i} wrap style={{ marginBottom: 8 }}>
              <Input
                style={{ width: 160 }}
                placeholder="学校"
                value={edu.school || ''}
                onChange={(e) => updateEducation(i, { school: e.target.value })}
              />
              <Input
                style={{ width: 90 }}
                placeholder="学历"
                value={edu.degree || ''}
                onChange={(e) => updateEducation(i, { degree: e.target.value })}
              />
              <Input
                style={{ width: 150 }}
                placeholder="专业"
                value={edu.major || ''}
                onChange={(e) => updateEducation(i, { major: e.target.value })}
              />
              <Input
                style={{ width: 100 }}
                placeholder="开始"
                value={edu.start || ''}
                onChange={(e) => updateEducation(i, { start: e.target.value })}
              />
              <Input
                style={{ width: 100 }}
                placeholder="结束"
                value={edu.end || ''}
                onChange={(e) => updateEducation(i, { end: e.target.value })}
              />
              <Button
                danger
                type="text"
                size="small"
                icon={<DeleteOutlined />}
                onClick={() => patch({ education: (value.education || []).filter((_, k) => k !== i) })}
              />
            </Space>
          ))
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无教育背景" />
        )}
      </Card>

      <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 10 }}>
        提示：修改后点击「保存修改」，再点「重新导出 PDF」即可生成带有你改动的新版简历文件。
      </Typography.Text>
    </div>
  )
}
