import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  DIMENSION_META, DIMENSION_ORDER, DISCOVERY_STEPS, dimensionRows, formatYears,
  jobMatchesQuery, jobSummary, overallTone, progressStepIndex, rateColor, rateLabel,
  summarizeRates,
} from '../job-discovery.ts'
import type { DiscoveredJob } from '@/types'

function job(overrides: Partial<DiscoveredJob> = {}): DiscoveredJob {
  return {
    id: 'dj-1',
    title: '高级前端工程师',
    company: '某头部电商平台',
    source: 'AI 岗位画像',
    source_type: 'ai',
    channel: '互联网 · 电商',
    location: '上海 · 浦东',
    salary: '30-45K',
    job_type: '全职',
    experience_required: '3-5 年',
    education_required: '本科及以上',
    summary: '负责交易链路前端架构与性能优化。',
    skills: ['React', 'TypeScript'],
    highlights: [],
    dimensions: {
      skills: { score: 88, reason: 'React 深度匹配' },
      experience: { score: 80, reason: '年限落在区间内' },
      education: { score: 100, reason: '本科满足' },
      location: { score: 95, reason: '同城' },
      salary: { score: 70, reason: '上限略低' },
    },
    match_rate: 84,
    match_reasons: ['React 项目经验 4 年'],
    mismatches: ['缺少 Node 服务端经验'],
    suggestions: ['补一个 BFF 项目'],
    jd_text: '负责交易链路前端架构。',
    url: null,
    ...overrides,
  }
}

describe('维度定义', () => {
  test('权重合计 100 且顺序稳定', () => {
    const total = DIMENSION_ORDER.reduce((sum, key) => sum + DIMENSION_META[key].weight, 0)
    assert.equal(total, 100)
    assert.deepEqual(DIMENSION_ORDER, ['skills', 'experience', 'education', 'location', 'salary'])
  })

  test('每个维度都有中文名与说明', () => {
    for (const key of DIMENSION_ORDER) {
      assert.ok(DIMENSION_META[key].label.length > 0)
      assert.ok(DIMENSION_META[key].hint.length > 0)
    }
  })
})

describe('适配度展示', () => {
  test('分级颜色/标签在边界处不跳档', () => {
    assert.equal(rateColor(80), 'var(--success-500)')
    assert.equal(rateColor(79), 'var(--primary-500)')
    assert.equal(rateColor(60), 'var(--primary-500)')
    assert.equal(rateColor(59), 'var(--warning-500)')
    assert.equal(rateColor(39), 'var(--error-500)')
    assert.match(rateLabel(85), /强匹配/)
    assert.match(rateLabel(65), /较匹配/)
    assert.match(rateLabel(45), /一般/)
    assert.match(rateLabel(20), /弱匹配/)
  })

  test('tone 与颜色档位一致', () => {
    assert.equal(overallTone(90), 'strong')
    assert.equal(overallTone(70), 'good')
    assert.equal(overallTone(50), 'fair')
    assert.equal(overallTone(10), 'weak')
  })

  test('summarizeRates 统计强/较/弱与均值', () => {
    const stats = summarizeRates([
      job({ id: 'a', match_rate: 90 }),
      job({ id: 'b', match_rate: 80 }),
      job({ id: 'c', match_rate: 65 }),
      job({ id: 'd', match_rate: 40 }),
    ])
    assert.deepEqual(stats, { strong: 2, good: 1, weak: 1, average: 68.8 })
    assert.deepEqual(summarizeRates([]), { strong: 0, good: 0, weak: 0, average: 0 })
  })
})

describe('formatYears', () => {
  test('0 与小数年份都有可读兜底', () => {
    assert.equal(formatYears(0), '应届 / 待补充')
    assert.equal(formatYears(6), '6 年')
    assert.equal(formatYears(5.7), '5.7 年')
    assert.equal(formatYears(Number('x')), '应届 / 待补充')
  })
})

describe('dimensionRows', () => {
  test('按固定顺序摊平并带权重', () => {
    const rows = dimensionRows(job())
    assert.deepEqual(rows.map((r) => r.key), DIMENSION_ORDER)
    assert.equal(rows[0].score, 88)
    assert.equal(rows[0].label, '技能匹配')
    assert.equal(rows[0].weight, 30)
    assert.equal(rows[0].reason, 'React 深度匹配')
  })

  test('缺失维度补 0 而不是消失', () => {
    const broken = job({ dimensions: { skills: { score: 88, reason: '' } } as any })
    const rows = dimensionRows(broken)
    assert.equal(rows.length, 5)
    assert.equal(rows[1].score, 0)
    assert.equal(rows[1].reason, '')
  })

  test('越界与非法分数收敛到 0-100', () => {
    const weird = job({
      dimensions: {
        skills: { score: 180, reason: '' },
        experience: { score: -20, reason: '' },
        education: { score: Number('x') as any, reason: '' },
        location: { score: 66.6, reason: '' },
        salary: { score: 0, reason: '' },
      },
    })
    const rows = dimensionRows(weird)
    assert.deepEqual(rows.map((r) => r.score), [100, 0, 0, 67, 0])
  })
})

describe('进度映射', () => {
  test('后端文案映射到正确的步骤下标', () => {
    assert.equal(progressStepIndex('正在提取简历画像…'), 0)
    assert.equal(progressStepIndex('正在检索匹配岗位…'), 1)
    assert.equal(progressStepIndex('已获取 12 条招聘信息，正在结构化…'), 1)
    assert.equal(progressStepIndex('正在按技能 / 经验 / 学历 / 地点 / 薪资评分…'), 2)
    assert.equal(progressStepIndex('正在生成匹配理由与优化建议…'), 3)
    assert.equal(progressStepIndex('已完成'), DISCOVERY_STEPS.length - 1)
  })

  test('无法识别的文案停在第一步，不假装有进度', () => {
    assert.equal(progressStepIndex(''), 0)
    assert.equal(progressStepIndex('未知状态'), 0)
  })
})

describe('筛选与摘要', () => {
  test('关键词命中标题/公司/技能/城市，空关键词全放行', () => {
    const j = job()
    assert.equal(jobMatchesQuery(j, ''), true)
    assert.equal(jobMatchesQuery(j, 'react'), true)
    assert.equal(jobMatchesQuery(j, '电商'), true)
    assert.equal(jobMatchesQuery(j, '上海'), true)
    assert.equal(jobMatchesQuery(j, '算法'), false)
  })

  test('摘要为空时用 JD 兜底，超长截断加省略号', () => {
    assert.equal(jobSummary(job({ summary: '' , jd_text: '' })), '暂无岗位信息摘要')
    assert.equal(jobSummary(job({ summary: '', jd_text: '来自 JD 的描述' })), '来自 JD 的描述')
    const long = jobSummary(job({ summary: '长'.repeat(200), jd_text: '' }), 10)
    assert.equal(long, `${'长'.repeat(10)}…`)
  })
})
