import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { COMMON_CERT_GROUPS, extractCertsFromResume } from '../cert-options.ts'

describe('COMMON_CERT_GROUPS', () => {
  it('分组齐全且每组选项非空、value 唯一', () => {
    assert.ok(COMMON_CERT_GROUPS.length >= 4)
    const seen = new Set<string>()
    for (const g of COMMON_CERT_GROUPS) {
      assert.ok(g.title, '组标题必填')
      assert.ok(g.options.length >= 3, `组 ${g.title} 选项过少`)
      for (const o of g.options) {
        assert.ok(o.value && o.label)
        assert.ok(!seen.has(o.value), `证书 value 重复: ${o.value}`)
        seen.add(o.value)
      }
    }
  })
})

describe('extractCertsFromResume', () => {
  it('优先取新解析器的 certificates 数组字段', () => {
    const out = extractCertsFromResume({ certificates: ['CET-6', '软考中级·软件设计师'] })
    assert.deepEqual(out, ['CET-6', '软考中级·软件设计师'])
  })

  it('certificates 为逗号分隔字符串时也能拆分', () => {
    const out = extractCertsFromResume({ certificates: 'CET-6, PMP、教师资格证' })
    assert.equal(out.length, 3)
  })

  it('旧数据无 certificates 字段时回退 raw_text 启发式', () => {
    const raw = [
      '张伟 产品经理',
      '教育：某某大学 本科',
      '证书：CET-6、普通话二级甲等',
      '拥有 PMP 项目管理专业人士资格认证',
      '负责需求分析工作，使用 SQL 做数据分析',
    ].join('\n')
    const out = extractCertsFromResume({}, raw)
    assert.ok(out.some((s) => s.includes('CET-6')), JSON.stringify(out))
    assert.ok(out.some((s) => s.includes('普通话')), JSON.stringify(out))
    assert.ok(out.some((s) => s.includes('PMP')), JSON.stringify(out))
    // 纯技能行不应被误判为证书
    assert.ok(!out.some((s) => s.includes('SQL')), JSON.stringify(out))
  })

  it('排除"备考/计划"等未持有表述', () => {
    const raw = '证书：备考 PMP\n持有 CET-6'
    const out = extractCertsFromResume({}, raw)
    assert.ok(!out.some((s) => s.includes('备考')), JSON.stringify(out))
    assert.ok(out.some((s) => s.includes('CET-6')), JSON.stringify(out))
  })

  it('结果去重且不超过 12 条', () => {
    const raw = Array.from({ length: 20 }, (_, i) => `证书${i}：软考相关资格认证`).join('\n')
    const out = extractCertsFromResume({}, raw)
    assert.ok(out.length <= 12)
    assert.equal(new Set(out).size, out.length)
  })

  it('无证书数据时返回空数组（不抛异常）', () => {
    assert.deepEqual(extractCertsFromResume(null, null), [])
    assert.deepEqual(extractCertsFromResume({}, ''), [])
    assert.deepEqual(extractCertsFromResume({ skills: ['Python', 'SQL'] }, null), [])
  })
})
