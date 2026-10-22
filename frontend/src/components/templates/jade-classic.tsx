'use client'

import React from 'react'
import type { TemplatePreviewProps } from '@/lib/templates-register'

/**
 * 经典单栏专业版（jadeAI classic 迁移）
 * ─────────────────────────────────────────────────────────────
 * 来源：github.com/twwch/JadeAI · src/components/preview/templates/classic.tsx
 * 版式特征：居中姓名 + 细联系线条 + 全宽细线分节 + 圆点条目，ATS 解析最友好。
 * 约定：A4 纸张 max-w-[210mm]、最小高度 297mm；分节点 break-inside: avoid。
 */

/** 语义化 CSS Token（与后端 jade-classic.html 保持一致） */
const token = {
  bg: '#ffffff',
  text: '#1f2937',
  heading: '#111827',
  muted: '#6b7280',
  line: '#d1d5db',
  accent: '#1f2937',
  fontFamily:
    '"Noto Sans SC", -apple-system, "PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", sans-serif',
} as const

interface Section {
  id: string
  title: string
  render: () => React.ReactNode
}

export default function JadeClassicTemplate({ resume }: TemplatePreviewProps) {
  const info = resume?.personal_info || {}
  const summary = resume?.summary || ''
  const experience = resume?.experience || []
  const projects = resume?.projects || []
  const education = resume?.education || []
  const skills = resume?.skills || []

  const isSectionEmpty = (list: unknown[] | undefined | null): boolean =>
    !list || list.length === 0

  const contactItems = [info.email, info.phone].filter(Boolean) as string[]

  /** 时间区间拼接（任一为空则只显示有值的一侧） */
  const dateRange = (start?: string, end?: string): string => {
    if (start && end) return `${start} – ${end}`
    return start || end || ''
  }

  /** 条目要点（兼容新旧项目形状：points[] 优先，description 兜底） */
  const itemPoints = (item: {
    points?: string[]
    description?: string
  }): string[] => {
    if (item.points && item.points.length > 0) return item.points.filter(Boolean)
    if (item.description) return [item.description]
    return []
  }

  const sections: Section[] = [
    {
      id: 'summary',
      title: '个人概述',
      render: () => (
        <p style={s.summaryText}>{summary}</p>
      ),
    },
    {
      id: 'experience',
      title: '工作经历',
      render: () => (
        <>
          {experience.map((exp, i) => (
            <div key={`exp-${i}`} style={s.expItem}>
              <div style={s.expHeader}>
                <span style={s.expTitle}>
                  {exp.title}
                  {exp.company ? ` — ${exp.company}` : ''}
                </span>
                <span style={s.expDate}>{dateRange(exp.start, exp.end)}</span>
              </div>
              {!isSectionEmpty(exp.points) && (
                <ul style={s.pointList}>
                  {exp.points.filter(Boolean).map((p, j) => (
                    <li key={`exp-${i}-p-${j}`} style={s.pointItem}>
                      {p}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </>
      ),
    },
    {
      id: 'projects',
      title: '项目经历',
      render: () => (
        <>
          {projects.map((proj, i) => {
            const points = itemPoints(proj)
            const tech = proj.tech || []
            return (
              <div key={`proj-${i}`} style={s.projItem}>
                <div style={s.expHeader}>
                  <span style={s.expTitle}>
                    {proj.name}
                    {proj.role ? ` · ${proj.role}` : ''}
                  </span>
                  <span style={s.expDate}>{dateRange(proj.start, proj.end)}</span>
                </div>
                {!isSectionEmpty(points) && (
                  <ul style={s.pointList}>
                    {points.map((p, j) => (
                      <li key={`proj-${i}-p-${j}`} style={s.pointItem}>
                        {p}
                      </li>
                    ))}
                  </ul>
                )}
                {!isSectionEmpty(tech) && (
                  <div style={s.techLine}>技术栈：{tech.join(' · ')}</div>
                )}
              </div>
            )
          })}
        </>
      ),
    },
    {
      id: 'skills',
      title: '专业技能',
      render: () => (
        <div style={s.skillRow}>
          {skills.filter(Boolean).map((skill, i) => (
            <span key={`skill-${i}`} style={s.skillItem}>
              {skill}
            </span>
          ))}
        </div>
      ),
    },
    {
      id: 'education',
      title: '教育背景',
      render: () => (
        <>
          {education.map((edu, i) => (
            <div key={`edu-${i}`} style={s.eduItem}>
              <div style={s.expHeader}>
                <span style={s.expTitle}>{edu.school}</span>
                <span style={s.expDate}>{dateRange(edu.start, edu.end)}</span>
              </div>
              <div style={s.eduDetail}>
                {edu.degree}
                {edu.major ? ` · ${edu.major}` : ''}
              </div>
            </div>
          ))}
        </>
      ),
    },
  ]

  return (
    <div style={s.page} className="jade-classic-template">
      {/* ── 页眉：姓名 + 联系方式 ── */}
      <header style={s.header}>
        <h1 style={s.name}>{info.name || '姓名'}</h1>
        {!isSectionEmpty(contactItems) && (
          <div style={s.contact}>
            {contactItems.map((c, i) => (
              <span key={`contact-${i}`} style={s.contactItem}>
                {c}
              </span>
            ))}
          </div>
        )}
      </header>

      {/* ── 分节渲染 ── */}
      {sections.map((sec) => {
        const isEmpty =
          (sec.id === 'summary' && !summary) ||
          (sec.id === 'experience' && isSectionEmpty(experience)) ||
          (sec.id === 'projects' && isSectionEmpty(projects)) ||
          (sec.id === 'skills' && isSectionEmpty(skills)) ||
          (sec.id === 'education' && isSectionEmpty(education))
        if (isEmpty) return null
        return (
          <section key={sec.id} style={s.section}>
            <h2 style={s.sectionTitle}>{sec.title}</h2>
            {sec.render()}
          </section>
        )
      })}
    </div>
  )
}

// ── 样式（语义化，与后端 Jinja 版 1:1） ──────────────────────────────
const s: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: '210mm',
    minHeight: '297mm',
    margin: '0 auto',
    background: token.bg,
    color: token.text,
    fontFamily: token.fontFamily,
    fontSize: '10pt',
    lineHeight: 1.6,
    padding: '14mm 16mm',
    boxSizing: 'border-box',
  },
  header: {
    textAlign: 'center',
    paddingBottom: 10,
    borderBottom: `3px solid ${token.accent}`,
    marginBottom: 14,
  },
  name: {
    fontSize: '24pt',
    fontWeight: 700,
    letterSpacing: 6,
    color: token.heading,
    margin: '0 0 4px',
  },
  contact: {
    display: 'flex',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: '0 18px',
    fontSize: '9pt',
    color: token.muted,
  },
  contactItem: { whiteSpace: 'nowrap' },
  section: { marginBottom: 12 },
  sectionTitle: {
    fontSize: '12pt',
    fontWeight: 700,
    letterSpacing: 2,
    color: token.heading,
    borderBottom: `2px solid ${token.accent}`,
    paddingBottom: 2,
    margin: '0 0 6px',
  },
  summaryText: {
    fontSize: '9.5pt',
    color: '#374151',
    lineHeight: 1.7,
    textAlign: 'justify',
    margin: 0,
  },
  expItem: {
    marginBottom: 8,
    breakInside: 'avoid',
    pageBreakInside: 'avoid',
  },
  expHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 12,
    marginBottom: 2,
  },
  expTitle: { fontWeight: 700, fontSize: '10.5pt', color: token.heading },
  expDate: { fontSize: '9pt', color: token.muted, whiteSpace: 'nowrap' },
  pointList: { listStyle: 'none', margin: '2px 0 0', padding: 0 },
  pointItem: {
    fontSize: '9.5pt',
    color: '#374151',
    lineHeight: 1.6,
    paddingLeft: 12,
    position: 'relative',
  },
  projItem: {
    marginBottom: 8,
    paddingLeft: 10,
    borderLeft: `2px solid ${token.line}`,
    breakInside: 'avoid',
    pageBreakInside: 'avoid',
  },
  techLine: { fontSize: '9pt', color: token.muted, fontStyle: 'italic', marginTop: 2 },
  skillRow: { display: 'flex', flexWrap: 'wrap', gap: '4px 14px' },
  skillItem: { fontSize: '9.5pt', color: '#374151', whiteSpace: 'nowrap' },
  eduItem: { marginBottom: 4, breakInside: 'avoid', pageBreakInside: 'avoid' },
  eduDetail: { fontSize: '9pt', color: token.muted },
}
