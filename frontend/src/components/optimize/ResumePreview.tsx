'use client'

import React from 'react'
import { Tag } from 'antd'
import {
  MailOutlined,
  PhoneOutlined,
  EnvironmentOutlined,
  CheckCircleFilled,
  FileTextOutlined,
} from '@ant-design/icons'
import type { ResumeParseResult } from '@/types'

interface ResumePreviewProps {
  data: ResumeParseResult | null
  /** 原始简历 / AI 优化后简历，决定主色调与高亮表现 */
  variant?: 'original' | 'optimized'
  /** 原始简历技能列表：用于在优化后简历中标出「新增技能」 */
  baselineSkills?: string[]
  /** 尚未解析时的占位提示 */
  emptyText?: React.ReactNode
}

const SKILL_LIMIT = 8

/**
 * 简历预览卡：把结构化简历 JSON 渲染成设计图里的「简历纸」样式。
 * 优化后一版会高亮新增技能，并给个人简介打上「AI 优化完成」标记。
 */
export default function ResumePreview({
  data,
  variant = 'original',
  baselineSkills,
  emptyText,
}: ResumePreviewProps) {
  if (!data) {
    return (
      <div className="opt-rp-empty">
        <FileTextOutlined style={{ fontSize: 26, color: 'var(--text-quaternary)' }} />
        <div>{emptyText || '暂无内容'}</div>
      </div>
    )
  }

  const info = data.personal_info || {}
  const experiences = data.experience || []
  const educations = data.education || []
  const skills = data.skills || []
  const isOptimized = variant === 'optimized'

  const headline = experiences[0]?.title
  const baseline = new Set((baselineSkills || []).map((s) => s.toLowerCase()))
  const addedSkills: string[] = isOptimized
    ? skills.filter((s) => !baseline.has(s.toLowerCase()))
    : []

  return (
    <div className={`opt-rp${isOptimized ? ' is-optimized' : ''}`}>
      {/* 抬头 */}
      <div className="opt-rp-head">
        <div className="opt-rp-name">{info.name || '未填写姓名'}</div>
        {headline && <div className="opt-rp-role">{headline}</div>}
        <div className="opt-rp-contact">
          {info.phone && (
            <span>
              <PhoneOutlined /> {info.phone}
            </span>
          )}
          {info.email && (
            <span>
              <MailOutlined /> {info.email}
            </span>
          )}
          <span>
            <EnvironmentOutlined /> {experiences[0]?.company || '—'}
          </span>
        </div>
      </div>

      {/* 个人简介 */}
      {data.summary && (
        <div className="opt-rp-section">
          <div className="opt-rp-section-title">
            个人简介
            {isOptimized && (
              <span className="opt-rp-badge">
                <CheckCircleFilled /> AI 优化完成
              </span>
            )}
          </div>
          <p className="opt-rp-text">{data.summary}</p>
        </div>
      )}

      {/* 工作经历 */}
      {experiences.length > 0 && (
        <div className="opt-rp-section">
          <div className="opt-rp-section-title">工作经历</div>
          {experiences.slice(0, 2).map((exp, i) => (
            <div key={i} className="opt-rp-exp">
              <div className="opt-rp-exp-head">
                <span className="opt-rp-exp-title">{exp.title || '—'}</span>
                {exp.company && <span className="opt-rp-exp-company">{exp.company}</span>}
                <span className="opt-rp-exp-time">
                  {[exp.start, exp.end].filter(Boolean).join(' - ')}
                </span>
              </div>
              {(exp.points || []).length > 0 && (
                <ul className="opt-rp-points">
                  {(exp.points || []).slice(0, 3).map((p, j) => (
                    <li key={j}>{p}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 教育背景 */}
      {educations.length > 0 && (
        <div className="opt-rp-section">
          <div className="opt-rp-section-title">教育背景</div>
          {educations.slice(0, 1).map((edu, i) => (
            <div key={i} className="opt-rp-exp">
              <div className="opt-rp-exp-head">
                <span className="opt-rp-exp-title">{edu.school || '—'}</span>
                <span className="opt-rp-exp-time">
                  {[edu.start, edu.end].filter(Boolean).join(' - ')}
                </span>
              </div>
              <div className="opt-rp-text">
                {[edu.degree, edu.major].filter(Boolean).join(' · ') || '—'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 技能 */}
      {skills.length > 0 && (
        <div className="opt-rp-section">
          <div className="opt-rp-section-title">技能</div>
          <div className="opt-rp-skills">
            {skills.slice(0, SKILL_LIMIT).map((s) => {
              const isNew = isOptimized && addedSkills.includes(s)
              return (
                <span key={s} className={`opt-rp-skill${isNew ? ' is-new' : ''}`}>
                  {s}
                  {isNew && <em>+</em>}
                </span>
              )
            })}
            {skills.length > SKILL_LIMIT && (
              <Tag className="opt-rp-skill-more">+{skills.length - SKILL_LIMIT}</Tag>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
