'use client'

import React from 'react'
import type { TemplatePreviewProps } from '@/lib/template-registry'

/**
 * 现代双栏创意版（jadeAI two-column 迁移）
 * ─────────────────────────────────────────────────────────────
 * 来源：github.com/twwch/JadeAI · src/components/preview/templates/two-column.tsx
 * 版式特征：左侧渐变信息栏（技能/教育）+ 右侧主内容（概述/经历/项目），
 *           侧栏 35% 宽；分节点 break-inside: avoid。
 */

const token = {
  primary: '#2563eb',
  primaryDark: '#1e3a8a',
  bg: '#ffffff',
  text: '#1f2937',
  heading: '#111827',
  muted: '#6b7280',
  line: '#e5e7eb',
  sidebarBg: 'linear-gradient(160deg, #2563eb 0%, #1e3a8a 100%)',
  sidebarText: '#ffffff',
  fontFamily:
    '"Noto Sans SC", -apple-system, "PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", sans-serif',
} as const

/** 分流入左侧栏的板块（jadeAI 约定：skills / languages / certifications / custom） */
const LEFT_TYPES = new Set(['skills', 'education'])

export default function JadeTwocolTemplate({ resume }: TemplatePreviewProps) {
  const info = resume?.personal_info || {}
  const summary = resume?.summary || ''
  const experience = resume?.experience || []
  const projects = resume?.projects || []
  const education = resume?.education || []
  const skills = resume?.skills || []

  const dateRange = (start?: string, end?: string): string => {
    if (start && end) return `${start} – ${end}`
    return start || end || ''
  }

  const itemPoints = (item: { points?: string[]; description?: string }): string[] => {
    if (item.points && item.points.length > 0) return item.points.filter(Boolean)
    if (item.description) return [item.description]
    return []
  }

  const contactItems = [info.email, info.phone].filter(Boolean) as string[]

  return (
    <div style={s.page} className="jade-twocol-template">
      {/* ── 左侧信息栏（35%） ── */}
      <aside style={s.sidebar}>
        <div style={s.sidePhoto}>{info.name ? info.name.slice(0, 1) : '简'}</div>

        {/* 联系方式 */}
        {contactItems.length > 0 && (
          <section style={s.sideSection}>
            <h3 style={s.sideTitle}>联系方式</h3>
            {contactItems.map((c, i) => (
              <div key={`contact-${i}`} style={s.sideItem}>
                {c}
              </div>
            ))}
          </section>
        )}

        {/* 专业技能 */}
        {skills.length > 0 && (
          <section style={s.sideSection}>
            <h3 style={s.sideTitle}>专业技能</h3>
            <div style={s.skillWrap}>
              {skills.filter(Boolean).map((skill, i) => (
                <span key={`skill-${i}`} style={s.skillTag}>
                  {skill}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* 教育背景 */}
        {education.length > 0 && (
          <section style={s.sideSection}>
            <h3 style={s.sideTitle}>教育背景</h3>
            {education.map((edu, i) => (
              <div key={`edu-${i}`} style={s.sideBlock}>
                <div style={s.sideBlockTitle}>{edu.school}</div>
                <div style={s.sideBlockSub}>
                  {edu.degree}
                  {edu.major ? ` · ${edu.major}` : ''}
                </div>
                <div style={s.sideBlockDate}>{dateRange(edu.start, edu.end)}</div>
              </div>
            ))}
          </section>
        )}
      </aside>

      {/* ── 右侧主内容 ── */}
      <main style={s.main}>
        <header style={s.mainHeader}>
          <h1 style={s.name}>{info.name || '姓名'}</h1>
          <div style={s.nameLine} />
        </header>

        {summary && (
          <section style={s.mainSection}>
            <h2 style={s.mainTitle}>个人概述</h2>
            <p style={s.summaryText}>{summary}</p>
          </section>
        )}

        {experience.length > 0 && (
          <section style={s.mainSection}>
            <h2 style={s.mainTitle}>工作经历</h2>
            <div style={s.timeline}>
              {experience.map((exp, i) => (
                <div key={`exp-${i}`} style={s.timelineItem}>
                  <span style={s.timelineDot} />
                  <div style={s.expHeader}>
                    <span style={s.expTitle}>
                      {exp.title}
                      {exp.company ? ` — ${exp.company}` : ''}
                    </span>
                    <span style={s.expDate}>{dateRange(exp.start, exp.end)}</span>
                  </div>
                  {exp.points.filter(Boolean).length > 0 && (
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
            </div>
          </section>
        )}

        {projects.length > 0 && (
          <section style={s.mainSection}>
            <h2 style={s.mainTitle}>项目经历</h2>
            <div style={s.timeline}>
              {projects.map((proj, i) => {
                const points = itemPoints(proj)
                const tech = proj.tech || []
                return (
                  <div key={`proj-${i}`} style={s.timelineItem}>
                    <span style={s.timelineDot} />
                    <div style={s.expHeader}>
                      <span style={s.expTitle}>
                        {proj.name}
                        {proj.role ? ` · ${proj.role}` : ''}
                      </span>
                      <span style={s.expDate}>{dateRange(proj.start, proj.end)}</span>
                    </div>
                    {points.length > 0 && (
                      <ul style={s.pointList}>
                        {points.map((p, j) => (
                          <li key={`proj-${i}-p-${j}`} style={s.pointItem}>
                            {p}
                          </li>
                        ))}
                      </ul>
                    )}
                    {tech.length > 0 && (
                      <div style={s.techLine}>技术栈：{tech.join(' · ')}</div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

/** 供测试 / 预览断言使用的左栏分簿规则（与 jadeAI LEFT_TYPES 约定一致） */
export const JADE_TWOCOL_LEFT_TYPES = LEFT_TYPES

// ── 样式（与后端 jade-twocol.html 1:1） ──────────────────────────────
const s: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    width: '210mm',
    minHeight: '297mm',
    margin: '0 auto',
    background: token.bg,
    color: token.text,
    fontFamily: token.fontFamily,
    fontSize: '10pt',
    lineHeight: 1.6,
    boxSizing: 'border-box',
  },
  sidebar: {
    width: '35%',
    background: token.sidebarBg,
    color: token.sidebarText,
    padding: '12mm 7mm',
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
    boxSizing: 'border-box',
  },
  sidePhoto: {
    width: 64,
    height: 64,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.18)',
    border: '2px solid rgba(255,255,255,0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '26pt',
    fontWeight: 700,
    margin: '0 auto 4px',
  },
  sideSection: { display: 'flex', flexDirection: 'column', gap: 6 },
  sideTitle: {
    fontSize: '11pt',
    fontWeight: 700,
    letterSpacing: 2,
    borderBottom: '1px solid rgba(255,255,255,0.35)',
    paddingBottom: 4,
    margin: 0,
  },
  sideItem: { fontSize: '9pt', opacity: 0.92, wordBreak: 'break-all' },
  skillWrap: { display: 'flex', flexWrap: 'wrap', gap: 5 },
  skillTag: {
    fontSize: '8.5pt',
    background: 'rgba(255,255,255,0.16)',
    borderRadius: 4,
    padding: '2px 8px',
    whiteSpace: 'nowrap',
  },
  sideBlock: { marginBottom: 8, breakInside: 'avoid', pageBreakInside: 'avoid' },
  sideBlockTitle: { fontSize: '9.5pt', fontWeight: 700 },
  sideBlockSub: { fontSize: '8.5pt', opacity: 0.85 },
  sideBlockDate: { fontSize: '8pt', opacity: 0.7 },
  main: {
    flex: 1,
    padding: '12mm 10mm',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    boxSizing: 'border-box',
    minWidth: 0,
  },
  mainHeader: { marginBottom: 2 },
  name: {
    fontSize: '22pt',
    fontWeight: 700,
    color: token.heading,
    margin: 0,
    letterSpacing: 2,
  },
  nameLine: {
    width: 56,
    height: 4,
    background: token.primary,
    borderRadius: 2,
    marginTop: 6,
  },
  mainSection: { display: 'flex', flexDirection: 'column', gap: 6 },
  mainTitle: {
    fontSize: '12pt',
    fontWeight: 700,
    color: token.primaryDark,
    letterSpacing: 1,
    margin: 0,
    borderBottom: `2px solid ${token.line}`,
    paddingBottom: 3,
  },
  summaryText: { fontSize: '9.5pt', color: '#374151', margin: 0, textAlign: 'justify' },
  timeline: { display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 14, position: 'relative' },
  timelineItem: {
    position: 'relative',
    breakInside: 'avoid',
    pageBreakInside: 'avoid',
  },
  timelineDot: {
    position: 'absolute',
    left: -14,
    top: 5,
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: token.primary,
  },
  expHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 10,
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
  techLine: { fontSize: '9pt', color: token.muted, fontStyle: 'italic', marginTop: 2 },
}
