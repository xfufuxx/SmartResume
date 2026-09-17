/**
 * 简历「优化前 / 优化后」差异计算（纯函数、确定性，无随机与时间依赖）。
 *
 * 用途：优化彻底完成后，在对比弹窗里逐项展示「修改前 → 修改后」，
 * 并用 <mark> 高亮真正新增/改动的文字片段。
 *
 * 实现要点：
 * - 文本比对用 LCS（最长公共子序列）做字符级 diff；超长文本自动降级为「按行」比对，
 *   避免 O(n*m) 状态表过大（上限见 MAX_CHAR_DIFF）。
 * - 只输出真正发生变化的条目，未变化的内容不进入弹窗。
 */

import type { ResumeParseResult } from '@/types'

export type DiffSegmentType = 'same' | 'add' | 'del'

export interface DiffSegment {
  text: string
  type: DiffSegmentType
}

export type DiffKind = 'added' | 'removed' | 'modified'

export interface DiffEntry {
  key: string
  /** 条目标题，如「个人简介」或「某某公司 · 前端工程师」 */
  label: string
  kind: DiffKind
  before?: string
  after?: string
}

export interface DiffGroup {
  section: string
  entries: DiffEntry[]
}

export interface ResumeDiff {
  /** 仅包含确有变化的章节 */
  groups: DiffGroup[]
  counts: { added: number; removed: number; modified: number }
  /** 主要变化摘要，用于弹窗顶部强调 */
  highlights: string[]
  skillsAdded: string[]
  skillsRemoved: string[]
  /** 同源改写的关键词（如「微服务」→「微服务开发」），单列以免被误读成删技能 */
  skillsRefined: { from: string; to: string }[]
  hasChanges: boolean
}

/** 逐字符比对的长度上限；两侧任一超过即降级为按行比对 */
const MAX_CHAR_DIFF = 600
/** 摘要里最多列出的关键词个数 */
const HIGHLIGHT_KEYWORD_LIMIT = 6

function normalizeText(input?: string | null): string {
  return (input || '').replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim()
}

/** 通用序列差异：命中 eq 的位置视为相同，其余按侧归类为删除 / 新增 */
function diffUnits<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean): Array<{ type: DiffSegmentType; value: T }> {
  const n = a.length
  const m = b.length
  const width = m + 1
  const dp = new Int32Array((n + 1) * width)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * width + j] = eq(a[i], b[j])
        ? dp[(i + 1) * width + j + 1] + 1
        : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1])
    }
  }
  const out: Array<{ type: DiffSegmentType; value: T }> = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (eq(a[i], b[j])) {
      out.push({ type: 'same', value: a[i] })
      i++
      j++
    } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
      out.push({ type: 'del', value: a[i] })
      i++
    } else {
      out.push({ type: 'add', value: b[j] })
      j++
    }
  }
  while (i < n) out.push({ type: 'del', value: a[i++] })
  while (j < m) out.push({ type: 'add', value: b[j++] })
  return out
}

function mergeSegments(units: Array<{ type: DiffSegmentType; value: string }>): DiffSegment[] {
  const segments: DiffSegment[] = []
  units.forEach(({ type, value }) => {
    if (!value) return
    const last = segments[segments.length - 1]
    if (last && last.type === type) last.text += value
    else segments.push({ text: value, type })
  })
  return segments
}

/** 按行切分并保留行尾换行符（避免使用后行断言，兼容旧版 Safari） */
function splitKeepEol(text: string): string[] {
  const lines = text.split('\n')
  return lines
    .map((line, index) => (index < lines.length - 1 ? `${line}\n` : line))
    .filter((line) => line.length > 0)
}

/**
 * 生成两侧高亮片段：
 * - before 侧保留 same + del（删除内容以删除态呈现）
 * - after 侧保留 same + add（新增内容以新增态呈现）
 */
export function diffSegments(beforeText: string, afterText: string): { before: DiffSegment[]; after: DiffSegment[] } {
  const before = normalizeText(beforeText)
  const after = normalizeText(afterText)
  if (before === after) {
    return { before: [{ text: before, type: 'same' }], after: [{ text: after, type: 'same' }] }
  }
  const useChar = before.length <= MAX_CHAR_DIFF && after.length <= MAX_CHAR_DIFF
  const units = useChar
    ? diffUnits(before.split(''), after.split(''), (x, y) => x === y).map((u) => ({ type: u.type, value: u.value }))
    : diffUnits(
        splitKeepEol(before),
        splitKeepEol(after),
        (x, y) => x.trim() === y.trim(),
      ).map((u) => ({ type: u.type, value: u.value }))

  const segments = mergeSegments(units)
  return {
    before: segments.filter((s) => s.type !== 'add'),
    after: segments.filter((s) => s.type !== 'del'),
  }
}

function experienceText(item: ResumeParseResult['experience'][number]): string {
  const head = [item.title, item.company].filter(Boolean).join(' · ')
  const period = [item.start, item.end].filter(Boolean).join(' - ')
  const points = (item.points || []).map((p) => `· ${p}`).join('\n')
  return [head, period, points].filter(Boolean).join('\n')
}

function projectText(item: ResumeParseResult['projects'][number]): string {
  const tech = (item.tech || []).length ? `技术栈：${item.tech.join('、')}` : ''
  return [item.name, item.description || '', tech].filter(Boolean).join('\n')
}

function educationText(item: ResumeParseResult['education'][number]): string {
  const period = [item.start, item.end].filter(Boolean).join(' - ')
  return [item.school, item.degree || '', item.major || '', period].filter(Boolean).join(' · ')
}

/** 列表型章节的对比：按下标对齐，输出新增 / 删除 / 改写三类条目 */
function compareList<T>(
  beforeList: T[] | undefined,
  afterList: T[] | undefined,
  toText: (item: T) => string,
  labelOf: (item: T, index: number) => string,
  keyPrefix: string,
): DiffEntry[] {
  const beforeArr = Array.isArray(beforeList) ? beforeList : []
  const afterArr = Array.isArray(afterList) ? afterList : []
  const entries: DiffEntry[] = []
  const max = Math.max(beforeArr.length, afterArr.length)
  for (let i = 0; i < max; i++) {
    const b = beforeArr[i]
    const a = afterArr[i]
    const beforeText = b ? normalizeText(toText(b)) : ''
    const afterText = a ? normalizeText(toText(a)) : ''
    if (!beforeText && !afterText) continue
    const label = a ? labelOf(a, i) : labelOf(b as T, i)
    if (!beforeText) {
      entries.push({ key: `${keyPrefix}-${i}`, label, kind: 'added', after: afterText })
    } else if (!afterText) {
      entries.push({ key: `${keyPrefix}-${i}`, label, kind: 'removed', before: beforeText })
    } else if (beforeText !== afterText) {
      entries.push({ key: `${keyPrefix}-${i}`, label, kind: 'modified', before: beforeText, after: afterText })
    }
  }
  return entries
}

/**
 * 区分「关键词被细化」与「关键词被删掉」。
 *
 * 优化器常把「微服务」写成「微服务开发」、「Linux」写成「Linux 系统运维」，
 * 若按集合差集处理会同时报出「移除 + 新增」，用户会误以为自己的技能被删了。
 * 这里把互为包含关系的成对项识别为同源改写，只把真正无对应项的算作新增 / 移除。
 */
function pairSkillRenames(added: string[], removed: string[]) {
  const norm = (s: string) => s.toLowerCase().replace(/[\s\-_/、,，.。()（）]/g, '')
  const pendingAdded = [...added]
  const refined: { from: string; to: string }[] = []
  const dropped: string[] = []
  for (const r of removed) {
    const rn = norm(r)
    if (!rn) continue
    // 优先取包含关系最紧的一个（长度差最小），避免「Java」误配到「JavaScript 开发」
    let bestIdx = -1
    let bestGap = Infinity
    pendingAdded.forEach((a, i) => {
      const an = norm(a)
      if (!an) return
      if (an.includes(rn) || rn.includes(an)) {
        const gap = Math.abs(an.length - rn.length)
        if (gap < bestGap) { bestGap = gap; bestIdx = i }
      }
    })
    if (bestIdx >= 0) {
      refined.push({ from: r, to: pendingAdded[bestIdx] })
      pendingAdded.splice(bestIdx, 1)
    } else {
      dropped.push(r)
    }
  }
  return { refined, pendingAdded, dropped }
}

/** 对比简历解析结果，生成分组变更清单与主要变化摘要 */
export function buildResumeDiff(
  before?: ResumeParseResult | null,
  after?: ResumeParseResult | null,
): ResumeDiff {
  const empty: ResumeDiff = {
    groups: [], counts: { added: 0, removed: 0, modified: 0 }, highlights: [], skillsAdded: [], skillsRemoved: [], skillsRefined: [], hasChanges: false,
  }
  if (!after) return empty

  const groups: DiffGroup[] = []

  // 个人简介
  const beforeSummary = normalizeText(before?.summary)
  const afterSummary = normalizeText(after.summary)
  if (beforeSummary !== afterSummary && (beforeSummary || afterSummary)) {
    groups.push({
      section: '个人简介',
      entries: [{
        key: 'summary',
        label: '个人简介',
        kind: !beforeSummary ? 'added' : !afterSummary ? 'removed' : 'modified',
        before: beforeSummary,
        after: afterSummary,
      }],
    })
  }

  // 技能：把同源改写与真正增删分开列，避免「细化关键词」被误读为「删掉了技能」
  const beforeSkills = (before?.skills || []).map((s) => normalizeText(String(s))).filter(Boolean)
  const afterSkills = (after.skills || []).map((s) => normalizeText(String(s))).filter(Boolean)
  const beforeSet = new Set(beforeSkills.map((s) => s.toLowerCase()))
  const afterSet = new Set(afterSkills.map((s) => s.toLowerCase()))
  const rawAdded = afterSkills.filter((s) => !beforeSet.has(s.toLowerCase()))
  const rawRemoved = beforeSkills.filter((s) => !afterSet.has(s.toLowerCase()))
  const { refined: skillsRefined, pendingAdded, dropped: skillsRemoved } = pairSkillRenames(rawAdded, rawRemoved)
  const skillsAdded = pendingAdded
  if (skillsRefined.length || skillsAdded.length || skillsRemoved.length) {
    const entries: DiffEntry[] = []
    if (skillsRefined.length) {
      entries.push({
        key: 'skills-refine',
        label: '关键词细化 / 调整',
        kind: 'modified',
        before: skillsRefined.map((r) => r.from).join('、'),
        after: skillsRefined.map((r) => r.to).join('、'),
      })
    }
    if (skillsAdded.length) {
      entries.push({ key: 'skills-add', label: '新增技能 / 关键词', kind: 'added', after: skillsAdded.join('、') })
    }
    if (skillsRemoved.length) {
      entries.push({ key: 'skills-del', label: '移除技能 / 关键词', kind: 'removed', before: skillsRemoved.join('、') })
    }
    groups.push({ section: '技能关键词', entries })
  }

  // 工作经历 / 项目经历 / 教育经历
  const experience = compareList(
    before?.experience, after.experience, experienceText,
    (item, i) => [item.company, item.title].filter(Boolean).join(' · ') || `第 ${i + 1} 段经历`, 'exp',
  )
  if (experience.length) groups.push({ section: '工作经历', entries: experience })

  const projects = compareList(
    before?.projects, after.projects, projectText,
    (item, i) => item.name || `项目 ${i + 1}`, 'proj',
  )
  if (projects.length) groups.push({ section: '项目经历', entries: projects })

  const education = compareList(
    before?.education, after.education, educationText,
    (item, i) => item.school || `教育经历 ${i + 1}`, 'edu',
  )
  if (education.length) groups.push({ section: '教育经历', entries: education })

  const counts = groups.reduce(
    (acc, g) => {
      g.entries.forEach((e) => { acc[e.kind] += 1 })
      return acc
    },
    { added: 0, removed: 0, modified: 0 },
  )

  // 主要变化摘要（只陈述确切的条目数，不做进度/程度之类的推测）
  const highlights: string[] = []
  if (skillsRefined.length) {
    const shown = skillsRefined.slice(0, HIGHLIGHT_KEYWORD_LIMIT).map((r) => `${r.from} → ${r.to}`).join('、')
    highlights.push(`关键词细化 ${skillsRefined.length} 个：${shown}${skillsRefined.length > HIGHLIGHT_KEYWORD_LIMIT ? ' 等' : ''}`)
  }
  if (skillsAdded.length) highlights.push(`新增关键词 ${skillsAdded.length} 个：${skillsAdded.slice(0, HIGHLIGHT_KEYWORD_LIMIT).join('、')}${skillsAdded.length > HIGHLIGHT_KEYWORD_LIMIT ? ' 等' : ''}`)
  if (skillsRemoved.length) highlights.push(`移除关键词 ${skillsRemoved.length} 个：${skillsRemoved.slice(0, HIGHLIGHT_KEYWORD_LIMIT).join('、')}`)
  if (beforeSummary !== afterSummary && beforeSummary) highlights.push('个人简介已重写')
  const expModified = experience.filter((e) => e.kind === 'modified').length
  const expAdded = experience.filter((e) => e.kind === 'added').length
  if (expModified) highlights.push(`工作经历改写 ${expModified} 段`)
  if (expAdded) highlights.push(`工作经历新增 ${expAdded} 段`)
  const projModified = projects.filter((e) => e.kind === 'modified').length
  if (projModified) highlights.push(`项目经历改写 ${projModified} 个`)
  const eduModified = education.filter((e) => e.kind === 'modified').length
  if (eduModified) highlights.push(`教育经历修正 ${eduModified} 条`)
  if (!highlights.length && counts.modified) highlights.push(`共改写 ${counts.modified} 处内容`)

  return {
    groups,
    counts,
    highlights,
    skillsAdded,
    skillsRemoved,
    skillsRefined,
    hasChanges: groups.length > 0,
  }
}
