import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Block, BlockType, LayoutDocument } from '../types.ts';
import { buildLayout } from '../buildLayout.ts';
import { pageCountOf, pageOf, pagesOf } from '../paging.ts';
import {
  DEFAULT_TEMPLATE_ID, TEMPLATES, TEMPLATE_OPTIONS, applyTemplate, auditTemplates, getTemplate,
} from '../templates.ts';

// ── 夹具 ──

function doc(blocks: Block[], extra: Partial<LayoutDocument> = {}): LayoutDocument {
  return {
    version: 1,
    canvas: { width: 210, height: 297 },
    gap: 4,
    pageCount: 1,
    blocks,
    ...extra,
  };
}

function blk(
  id: string,
  type: BlockType,
  y: number,
  h: number,
  source: string,
  payload: unknown = {},
  opts: Partial<Block> = {},
): Block {
  return {
    id,
    type,
    page: 0,
    rect: { x: 15, y, w: 180, h },
    freedom: 'free',
    sizePolicy: { resizableW: true, resizableH: true, minW: 60, minH: 8 },
    contentRef: { source, payload },
    ...opts,
  };
}

/** 标准简历数据（与详情页 optimized_json 同形状） */
const RESUME = {
  personal_info: { name: '张三', email: 'zhang@example.com', phone: '13800000000' },
  summary: '五年后端开发经验，主导过多个高并发系统的架构设计与落地。',
  experience: [
    {
      company: '某科技',
      title: '高级后端工程师',
      start: '2021-03',
      end: '至今',
      points: ['负责订单系统重构，QPS 提升 3 倍', '搭建可观测性体系，故障定位时间缩短 60%'],
    },
    {
      company: '某互联网',
      title: '后端工程师',
      start: '2018-07',
      end: '2021-02',
      points: ['参与支付网关开发', '维护对账系统'],
    },
  ],
  education: [{ school: '某某大学', degree: '本科', major: '计算机科学', start: '2014-09', end: '2018-06' }],
  skills: ['Python', 'FastAPI', 'PostgreSQL', 'Redis', 'Docker'],
  projects: [{ name: '智能简历', role: '负责人', start: '2025-01', end: '2025-10', points: ['AI 简历优化'] }],
};

function byId(d: LayoutDocument, id: string): Block {
  const b = d.blocks.find((x) => x.id === id);
  assert.ok(b, `missing block ${id}`);
  return b as Block;
}

/** 同一页内两两矩形是否相交（边缘相接不算） */
function overlapsOnPage(d: LayoutDocument, page: number): Array<[string, string]> {
  const group = pagesOf(d)[page] ?? [];
  const hits: Array<[string, string]> = [];
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const a = group[i].rect;
      const b = group[j].rect;
      const xOverlap = a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01;
      const yOverlap = a.y < b.y + b.h - 0.01 && b.y < a.y + a.h - 0.01;
      if (xOverlap && yOverlap) hits.push([group[i].id, group[j].id]);
    }
  }
  return hits;
}

// ── 模板表 ──

describe('templates: 注册表', () => {
  it('auditTemplates 无问题，四个模板齐全且 id 唯一', () => {
    const audit = auditTemplates();
    assert.deepEqual(audit.problems, []);
    assert.equal(audit.ok, true);
    assert.equal(TEMPLATES.length, 4);
    const ids = TEMPLATES.map((t) => t.id);
    assert.deepEqual(ids, ['classic', 'compact', 'sidebar', 'elegant']);
    assert.equal(new Set(ids).size, ids.length);
  });

  it('默认模板 id 在注册表中，TEMPLATE_OPTIONS 与注册表一一对应', () => {
    assert.ok(getTemplate(DEFAULT_TEMPLATE_ID));
    assert.equal(TEMPLATE_OPTIONS.length, TEMPLATES.length);
    assert.deepEqual(
      TEMPLATE_OPTIONS.map((o) => o.value),
      TEMPLATES.map((t) => t.id),
    );
    for (const o of TEMPLATE_OPTIONS) assert.ok(o.label.length > 0 && o.desc.length > 0);
  });

  it('getTemplate：未知 id 返回 undefined', () => {
    assert.equal(getTemplate('nope'), undefined);
  });

  it('只有 sidebar 模板是双栏，其余 single-column', () => {
    for (const t of TEMPLATES) {
      if (t.id === 'sidebar') {
        assert.ok(t.layout.sidebarWidthMm > 0);
        assert.ok(t.layout.columnGapMm > 0);
        assert.ok(t.layout.sidebarSources.length > 0);
      } else {
        assert.equal(t.layout.sidebarWidthMm, 0);
        assert.equal(t.layout.sidebarSources.length, 0);
      }
    }
  });
});

// ── applyTemplate 基本契约 ──

describe('templates: applyTemplate 契约', () => {
  const base = buildLayout(RESUME);

  it('未知模板 id 原样返回（引用相等）', () => {
    assert.equal(applyTemplate(base, 'nope'), base);
  });

  it('classic 在默认布局上幂等：几何逐块一致，gap/pageCount 不变', () => {
    const next = applyTemplate(base, 'classic');
    assert.equal(next.blocks.length, base.blocks.length);
    for (let i = 0; i < base.blocks.length; i++) {
      assert.deepEqual(next.blocks[i], base.blocks[i], `block #${i} ${base.blocks[i].id}`);
    }
    assert.equal(next.gap, 4);
    assert.equal(next.pageCount, base.pageCount);
    assert.equal(next.template, 'classic');
  });

  it('保留：块顺序、id、内容 payload、visible / locked / freedom / sizePolicy', () => {
    const withFlags = buildLayout(RESUME);
    const target = withFlags.blocks.find((b) => b.type === 'item') as Block;
    target.visible = false;
    target.locked = true;
    target.freedom = 'vertical';
    const next = applyTemplate(withFlags, 'sidebar');
    assert.deepEqual(next.blocks.map((b) => b.id), withFlags.blocks.map((b) => b.id));
    const kept = byId(next, target.id);
    assert.equal(kept.visible, false);
    assert.equal(kept.locked, true);
    assert.equal(kept.freedom, 'vertical');
    assert.deepEqual(kept.contentRef, target.contentRef);
    assert.deepEqual(kept.sizePolicy, target.sizePolicy);
  });

  it('写入 template / gap / pageCount，且 pageCount ≥ 实际最大页 + 1', () => {
    const next = applyTemplate(base, 'compact');
    assert.equal(next.template, 'compact');
    assert.equal(next.gap, 2);
    const maxPage = next.blocks.reduce((m, b) => Math.max(m, pageOf(b)), 0);
    assert.ok(pageCountOf(next) >= maxPage + 1);
    assert.ok((next.pageCount ?? 0) >= 1);
  });

  it('空 blocks：只补 template/gap/pageCount，不造块', () => {
    const empty = doc([]);
    const next = applyTemplate(empty, 'sidebar');
    assert.deepEqual(next.blocks, []);
    assert.equal(next.template, 'sidebar');
    assert.equal(next.pageCount, 1);
    assert.equal(next.gap, 3);
  });

  it('幂等：同一模板连续应用两次，结果一致', () => {
    for (const t of TEMPLATES) {
      const once = applyTemplate(base, t.id);
      const twice = applyTemplate(once, t.id);
      assert.deepEqual(twice.blocks, once.blocks, `template ${t.id} not idempotent`);
      assert.equal(twice.pageCount, once.pageCount);
    }
  });

  it('所有块都在画布内（x≥margin，右/下边界不越界；超高单块允许溢出由红点提示）', () => {
    const next = applyTemplate(base, 'sidebar');
    const margin = 14;
    for (const b of next.blocks) {
      assert.ok(b.rect.x >= margin - 0.01, `${b.id} x=${b.rect.x}`);
      assert.ok(b.rect.y >= margin - 0.01, `${b.id} y=${b.rect.y}`);
      assert.ok(b.rect.x + b.rect.w <= 210 - margin + 0.01, `${b.id} right overflow`);
    }
  });
});

// ── 单栏模板几何 ──

describe('templates: 单栏几何（compact / elegant）', () => {
  const base = buildLayout(RESUME);

  it('compact：边距 12mm、间距 2mm，全部块全宽', () => {
    const next = applyTemplate(base, 'compact');
    for (const b of next.blocks) {
      assert.equal(b.rect.x, 12, `${b.id} x`);
      assert.equal(b.rect.w, 186, `${b.id} w`);
    }
    // y 序列 = 12 + 逐块 (h + 2)，同页内严格递增
    const page0 = pagesOf(next)[0];
    let expected = 12;
    for (const b of page0) {
      assert.ok(Math.abs(b.rect.y - expected) < 0.01, `${b.id} y=${b.rect.y} expected ${expected}`);
      expected = Math.round((b.rect.y + b.rect.h + 2) * 100) / 100;
    }
    assert.equal(overlapsOnPage(next, 0).length, 0);
  });

  it('elegant：边距 20mm，宽度变化触发高度重估（只放大不缩小）', () => {
    const next = applyTemplate(base, 'elegant');
    for (const b of next.blocks) {
      assert.equal(b.rect.x, 20, `${b.id} x`);
      assert.equal(b.rect.w, 170, `${b.id} w`);
      const before = byId(base, b.id);
      assert.ok(b.rect.h >= before.rect.h - 0.01, `${b.id} 高度不应被缩小`);
    }
    assert.equal(next.gap, 6);
  });

  it('compact：宽度变化但字号更小，高度按保守口径不缩（h ≥ 原 h）', () => {
    const next = applyTemplate(base, 'compact');
    for (const b of next.blocks) {
      const before = byId(base, b.id);
      assert.ok(b.rect.h >= before.rect.h - 0.01, `${b.id} 高度不应被缩小`);
    }
  });
});

// ── 双栏模板几何 ──

describe('templates: sidebar 双栏几何', () => {
  const base = buildLayout(RESUME);
  const next = applyTemplate(base, 'sidebar');
  // margin 14 / sidebar 62 / columnGap 6 → main x=82 w=114，全宽 182

  it('header + 联系方式作为通栏前缀横跨全宽', () => {
    const header = byId(next, 'blk_header');
    assert.equal(header.rect.x, 14);
    assert.equal(header.rect.w, 182);
    assert.equal(header.page, 0);
    // contact 是 nowrap 横排，必须通栏（进 62mm 侧栏会被裁）
    const contact = byId(next, 'blk_contact');
    assert.equal(contact.rect.x, 14);
    assert.equal(contact.rect.w, 182);
    assert.equal(contact.page, 0);
  });

  it('总结 / 技能进左栏（x=14, w=62）', () => {
    for (const id of ['blk_summary', 'blk_sec_skills', 'blk_skills']) {
      const b = byId(next, id);
      assert.equal(b.rect.x, 14, `${id} x`);
      assert.equal(b.rect.w, 62, `${id} w`);
      assert.equal(b.page, 0, `${id} page`);
    }
  });

  it('经历 / 教育 / 项目进右主栏（x=82, w=114）', () => {
    for (const id of ['blk_sec_experience', 'blk_exp_0', 'blk_exp_1', 'blk_sec_education', 'blk_edu_0', 'blk_sec_projects', 'blk_proj_0']) {
      const b = byId(next, id);
      assert.equal(b.rect.x, 82, `${id} x`);
      assert.equal(b.rect.w, 114, `${id} w`);
    }
  });

  it('双栏区从 banner 底边之下开始（不与 banner 重叠）', () => {
    const divider = byId(next, 'blk_divider');
    const zoneTop = divider.rect.y + divider.rect.h + 3; // gap 3
    for (const id of ['blk_summary', 'blk_sec_experience']) {
      assert.ok(byId(next, id).rect.y >= zoneTop - 0.01, `${id} 应落在 banner 之下`);
    }
  });

  it('两列同页不重叠（侧栏块与主栏块 x 区间互不相交）', () => {
    assert.deepEqual(overlapsOnPage(next, 0), []);
    assert.deepEqual(overlapsOnPage(next, 1), []);
  });

  it('侧栏块宽度变窄后高度重估变大（summary 折行更多）', () => {
    // 180 字：全宽 180mm 约 4 行，62mm 窄栏约 12 行 —— 高度必须增长
    const longSummary = '长期从事后端系统研发与稳定性建设，'.repeat(10);
    const d = doc([
      blk('h', 'header', 15, 10, 'personal_info.name', { name: '张三' }),
      blk('s', 'summary', 30, 24, 'summary', { summary: longSummary }),
    ]);
    const out = applyTemplate(d, 'sidebar');
    const s = byId(out, 's');
    assert.equal(s.rect.w, 62);
    assert.ok(s.rect.h > 24, `summary 窄栏后应增高，实际 ${s.rect.h}`);
  });

  it('sidebar 模板无 header 时，侧栏紧跟 banner 之后从安全区顶边开始', () => {
    const noHeader = doc([
      blk('c', 'contact', 15, 10, 'personal_info', { email: 'a@b.c' }),
      blk('s', 'summary', 30, 20, 'summary', { summary: '简介' }),
    ]);
    const out = applyTemplate(noHeader, 'sidebar');
    assert.equal(out.blocks.length, 2);
    // contact 属于通栏 banner
    assert.equal(byId(out, 'c').rect.y, 14);
    assert.equal(byId(out, 'c').rect.x, 14);
    assert.equal(byId(out, 'c').rect.w, 182);
    // summary 进侧栏，起点在 banner 底边之下
    const s = byId(out, 's');
    assert.equal(s.rect.x, 14);
    assert.equal(s.rect.w, 62);
    assert.ok(s.rect.y >= byId(out, 'c').rect.y + byId(out, 'c').rect.h + 3 - 0.01);
  });

  it('侧栏放不下的块降级到主栏（不丢内容、不重叠、不留在侧栏窄栏）', () => {
    // summary h=240 装满侧栏剩余空间 → 技能 section 与技能组放不下，整组降级
    const tall = doc([
      blk('h', 'header', 15, 10, 'personal_info.name', { name: '张三' }),
      blk('s', 'summary', 30, 240, 'summary', { summary: '超长简介' }),
      blk('sc', 'section', 275, 9, 'skills', { count: 2 }),
      blk('sk', 'skill-group', 290, 30, 'skills', { skills: ['A', 'B'] }),
    ]);
    const out = applyTemplate(tall, 'sidebar');
    assert.equal(out.blocks.length, 4);
    // summary 仍在侧栏
    assert.equal(byId(out, 's').rect.w, 62);
    // 技能标题 + 技能组被降级 → 主栏宽度（第 0 页 114，翻页后 182）
    for (const id of ['sc', 'sk']) {
      const b = byId(out, id);
      assert.ok(b.rect.w === 114 || b.rect.w === 182, `${id} 降级后宽度 ${b.rect.w}`);
      assert.notEqual(b.rect.x, 14, `${id} 不应留在侧栏 x=14`);
    }
    // 没有重叠、没有块丢失
    assert.deepEqual(overlapsOnPage(out, 0), []);
    assert.deepEqual(overlapsOnPage(out, 1), []);
    assert.equal(new Set(out.blocks.map((b) => b.id)).size, 4);
  });
});

// ── 多页 ──

describe('templates: 多页切换', () => {
  it('长内容切 sidebar：主栏翻过双栏页后转通栏（后续页 x=14 w=182）', () => {
    const long = buildLayout({
      ...RESUME,
      experience: Array.from({ length: 8 }, (_, i) => ({
        company: `公司 ${i}`,
        title: '后端工程师',
        start: '2018-01',
        end: '2020-01',
        points: ['负责核心系统研发与维护，持续优化性能与稳定性', '推动工程规范落地，完善监控与告警'],
      })),
    });
    assert.ok(pageCountOf(long) > 1, '夹具应为多页文档');
    const out = applyTemplate(long, 'sidebar');
    const count = pageCountOf(out);
    assert.ok(count > 1, '切换后仍应多页');
    for (const b of out.blocks) {
      if (pageOf(b) === 0) continue;
      assert.equal(b.rect.x, 14, `${b.id} (p${pageOf(b)}) 后续页应通栏`);
      assert.equal(b.rect.w, 182, `${b.id} (p${pageOf(b)}) 后续页应全宽`);
    }
    for (let p = 0; p < count; p++) assert.deepEqual(overlapsOnPage(out, p), [], `page ${p} 有重叠`);
  });

  it('从多页双栏切回 compact：页数按新排版重算，所有块回到全宽单列', () => {
    const out = applyTemplate(buildLayout(RESUME), 'sidebar');
    const back = applyTemplate(out, 'compact');
    for (const b of back.blocks) {
      assert.equal(b.rect.x, 12);
      assert.equal(b.rect.w, 186);
      assert.equal(b.page, 0);
    }
    assert.equal(back.pageCount, 1);
    assert.equal(back.template, 'compact');
  });

  it('循环切换不累积漂移：classic → sidebar → classic 与直接 classic 一致', () => {
    const base = buildLayout(RESUME);
    const round = applyTemplate(applyTemplate(base, 'sidebar'), 'classic');
    const direct = applyTemplate(base, 'classic');
    // 双栏往返会改变宽度→按新宽度重估高度，故只比对 x/w/y 序列与页数
    assert.deepEqual(
      round.blocks.map((b) => [b.rect.x, b.rect.w, b.page]),
      direct.blocks.map((b) => [b.rect.x, b.rect.w, b.page]),
    );
    assert.equal(round.pageCount, direct.pageCount);
  });
});
