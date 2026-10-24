/**
 * buildLayout.ts 单测 —— 默认布局生成。
 * 运行：npm test（node --test 原生 TS）
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { LayoutDocument } from '../types.ts';
import { buildLayout, sameLayout, type ResumeLike } from '../buildLayout.ts';
import { validateLayout } from '../validate.ts';

const FULL: ResumeLike = {
  personal_info: { name: '张三', email: 'a@b.com', phone: '13800000000' },
  summary: '五年前端经验',
  experience: [
    {
      title: '高级工程师',
      company: '甲公司',
      points: ['负责架构', '主导优化', '带团队'],
    },
    { title: '工程师', company: '乙公司', points: ['业务开发'] },
  ],
  education: [{ school: '某大学', major: '计算机' }],
  skills: ['TypeScript', 'React', 'Node'],
  projects: [{ name: '项目A', points: ['实现X', '实现Y'] }],
};

function ids(d: LayoutDocument): string[] {
  return d.blocks.map((b) => b.id);
}

describe('buildLayout: 完整数据', () => {
  const d = buildLayout(FULL);

  it('块序列符合单栏流式结构', () => {
    assert.deepEqual(ids(d), [
      'blk_header',
      'blk_contact',
      'blk_divider',
      'blk_summary',
      'blk_sec_experience',
      'blk_exp_0',
      'blk_exp_1',
      'blk_sec_education',
      'blk_edu_0',
      'blk_sec_skills',
      'blk_skills',
      'blk_sec_projects',
      'blk_proj_0',
    ]);
  });

  it('首块从安全边距起点开始，通栏宽度', () => {
    const first = d.blocks[0];
    assert.equal(first.rect.x, 15);
    assert.equal(first.rect.y, 15);
    assert.equal(first.rect.w, 180);
  });

  it('自上而下流动，相邻块间距 4mm', () => {
    for (let i = 1; i < d.blocks.length; i++) {
      const prev = d.blocks[i - 1];
      const cur = d.blocks[i];
      const gap = Math.round((cur.rect.y - (prev.rect.y + prev.rect.h)) * 100) / 100;
      assert.equal(gap, 4, `${prev.id} → ${cur.id} gap=${gap}`);
    }
  });

  it('item 高度按内容估算生成（与 validate 的 fixOverflow 同口径）', () => {
    const exp0 = d.blocks.find((b) => b.id === 'blk_exp_0')!;
    const exp1 = d.blocks.find((b) => b.id === 'blk_exp_1')!;
    // 校准模型（2026-10-21）：标题 11pt×1.4 一行 5.59mm + 要点列表
    // （上 margin 1mm + 3 条 × 5.63mm + 条间 2×0.5mm）+ 0.5mm 余量 = 24.99mm
    assert.equal(exp0.rect.h, 24.99);
    // exp1：标题一行 + 1 条要点 = 12.72mm，低于 item 最小高度 16 → 取 16
    assert.equal(exp1.rect.h, 16);
  });

  it('contentRef.payload 冻结对应数据子结构', () => {
    const exp0 = d.blocks.find((b) => b.id === 'blk_exp_0')!;
    assert.equal(exp0.contentRef.source, 'experience[0]');
    assert.deepEqual(exp0.contentRef.payload, FULL.experience![0]);
    const header = d.blocks.find((b) => b.id === 'blk_header')!;
    assert.equal(header.contentRef.source, 'personal_info.name');
  });

  it('默认 freedom/sizePolicy 来自 defaults 表', () => {
    const header = d.blocks.find((b) => b.id === 'blk_header')!;
    const exp0 = d.blocks.find((b) => b.id === 'blk_exp_0')!;
    assert.equal(header.freedom, 'vertical');
    assert.equal(exp0.freedom, 'free');
  });

  it('canvas 为 A4，version 为当前版本', () => {
    assert.deepEqual(d.canvas, { width: 210, height: 297 });
    assert.equal(d.version, 1);
  });

  it('默认布局开箱干净：validateLayout 无需任何自动修正', () => {
    // 方案 A 的验收点：buildLayout 与 estimateContentHeightMm 同一口径，
    // 默认布局不再出现「高度装不下内容」的假阳性红点。
    const result = validateLayout(d);
    assert.equal(result.autoFixedCount, 0);
    assert.equal(result.issues.length, 0);
  });

  it('全部块落在安全区内（含底部）', () => {
    for (const b of d.blocks) {
      assert.ok(b.rect.y + b.rect.h <= 297 - 15 + 0.01, `${b.id} 底部越界`);
      assert.ok(b.rect.y >= 15, `${b.id} 顶部越界`);
    }
  });
});

describe('buildLayout: 空数据与缺节', () => {
  it('null 数据 → 空 blocks', () => {
    const d = buildLayout(null);
    assert.equal(d.blocks.length, 0);
    assert.equal(d.version, 1);
  });

  it('空对象 → 空 blocks', () => {
    assert.equal(buildLayout({}).blocks.length, 0);
  });

  it('只有 summary → 单块，无 header/divider', () => {
    const d = buildLayout({ summary: '一句话' });
    assert.deepEqual(ids(d), ['blk_summary']);
  });

  it('只有技能 → section + skill-group', () => {
    const d = buildLayout({ skills: ['A'] });
    assert.deepEqual(ids(d), ['blk_sec_skills', 'blk_skills']);
  });

  it('personal_info 无任何字段 → 不生成 header/contact', () => {
    const d = buildLayout({ personal_info: {}, summary: 'x' });
    assert.deepEqual(ids(d), ['blk_summary']);
  });
});

describe('buildLayout: 职业照块', () => {
  const AVATAR = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  it('personal_info.avatar 有值 → 末尾生成 blk_avatar（z 序最上）', () => {
    const d = buildLayout({ ...FULL, personal_info: { ...FULL.personal_info!, avatar: AVATAR } });
    const list = ids(d);
    assert.equal(list[list.length - 1], 'blk_avatar');
  });

  it('无 avatar → 不生成头像块（版式与历史一致）', () => {
    const d = buildLayout(FULL);
    assert.equal(d.blocks.some((b) => b.type === 'avatar'), false);
  });

  it('头像块固定右上角：30×42mm（5:7 一寸照比例）', () => {
    const d = buildLayout({ ...FULL, personal_info: { ...FULL.personal_info!, avatar: AVATAR } });
    const av = d.blocks.find((b) => b.type === 'avatar')!;
    assert.deepEqual(
      { x: av.rect.x, y: av.rect.y, w: av.rect.w, h: av.rect.h },
      { x: 210 - 15 - 30, y: 15, w: 30, h: 42 },
    );
  });

  it('头部区收窄为左栏（146mm）与头像并行，通栏内容下探到头像底部之下', () => {
    const d = buildLayout({ ...FULL, personal_info: { ...FULL.personal_info!, avatar: AVATAR } });
    const byId = new Map(d.blocks.map((b) => [b.id, b]));
    const header = byId.get('blk_header')!;
    const contact = byId.get('blk_contact')!;
    const divider = byId.get('blk_divider')!;
    const av = byId.get('blk_avatar')!;
    // 头部/联系方式窄栏：右缘不越过头像左缘（165 - 4 间隙）
    assert.equal(header.rect.x + header.rect.w, 161);
    assert.equal(contact.rect.x + contact.rect.w, 161);
    // 通栏块（分隔线起）必须整块位于头像底部+gap 之下，矩形零重叠
    assert.ok(divider.rect.y >= av.rect.y + av.rect.h + 4 - 0.01, `divider y=${divider.rect.y}`);
    assert.equal(divider.rect.w, 180);
  });

  it('头像块 payload 为 { url }，source=personal_info.avatar，freedom=free', () => {
    const d = buildLayout({ ...FULL, personal_info: { ...FULL.personal_info!, avatar: AVATAR } });
    const av = d.blocks.find((b) => b.type === 'avatar')!;
    assert.deepEqual(av.contentRef.payload, { url: AVATAR });
    assert.equal(av.contentRef.source, 'personal_info.avatar');
    assert.equal(av.freedom, 'free');
  });

  it('只有头像（无姓名）→ 单块，无 divider', () => {
    const d = buildLayout({ personal_info: { avatar: AVATAR } });
    assert.deepEqual(ids(d), ['blk_avatar']);
  });

  it('带头像的默认布局同样开箱干净（validateLayout 无修正无警告）', () => {
    const d = buildLayout({ ...FULL, personal_info: { ...FULL.personal_info!, avatar: AVATAR } });
    const result = validateLayout(d);
    assert.equal(result.autoFixedCount, 0);
    assert.equal(result.issues.length, 0);
  });
});

describe('buildLayout: 幂等与 id 稳定性', () => {
  it('同数据两次生成结构一致（忽略 updatedAt）', () => {
    const a = buildLayout(FULL);
    const b = buildLayout(FULL);
    assert.equal(sameLayout(a, b), true);
  });

  it('数据内容变化不影响已有块的 id', () => {
    const a = buildLayout(FULL);
    const b = buildLayout({
      ...FULL,
      experience: [FULL.experience![0], ...FULL.experience!.slice(1), { title: '新' }],
    });
    assert.deepEqual(ids(a).slice(0, 7), ids(b).slice(0, 7));
    assert.ok(ids(b).includes('blk_exp_2'));
  });

  it('gapMm 可配置', () => {
    const d = buildLayout({ summary: 'x', skills: ['A'] }, { gapMm: 10 });
    const summary = d.blocks[0];
    const sec = d.blocks[1];
    assert.equal(sec.rect.y - (summary.rect.y + summary.rect.h), 10);
  });

  it('回归：项目条目按 projects 口径估算（草稿必须带 source，曾少算 5mm）', () => {
    const d = buildLayout({
      projects: [
        {
          name: '全域直流管控平台',
          role: '后端负责人',
          start: '2022.03',
          end: '2023.08',
          points: ['负责后端整体方案落地，完成代码编写、自测与性能优化。', '负责业务需求理解与接口服务设计，输出接口文档。'],
        },
      ],
    });
    const proj = d.blocks.find((b) => b.id === 'blk_proj_0')!;
    // 标题 5.59 + 期间 5.45 + 要点（1 + 2×5.63 + 0.5）+ 0.5 余量 = 25.3mm 量级，
    // 若草稿丢了 source 会按 experience 口径漏掉标题行 → 只有 ~20mm
    assert.ok(proj.rect.h > 24, `项目块应按 projects 口径估算，实际 h=${proj.rect.h}`);
  });

  it('回归：教育条目按 school/degree/major 估算（估算器曾对教育字段失明）', () => {
    const d = buildLayout({
      education: [{ school: '南京邮电大学', degree: '本科', major: '计算机科学与技术', start: '2015.09', end: '2019.06' }],
    });
    const edu = d.blocks.find((b) => b.id === 'blk_edu_0')!;
    // 标题一行 5.59 + 副标题（degree - major | period）一行 5.45 + 0.5 = 11.54 → base 12
    assert.equal(edu.rect.h, 12);
  });

  it('自定义 canvas/margin 生效', () => {
    const d = buildLayout({ summary: 'x' }, { canvas: { width: 100, height: 200 }, margin: 10 });
    assert.equal(d.canvas.width, 100);
    assert.equal(d.blocks[0].rect.x, 10);
    assert.equal(d.blocks[0].rect.w, 80);
  });
});

describe('buildLayout: 多页自动分页', () => {
  /** 一页放不下的数据：summary 很长 + 若干经历条目 */
  function longData(expCount: number) {
    return {
      personal_info: { name: '张三', email: 'a@b.c' },
      summary: '甲'.repeat(400),
      experience: Array.from({ length: expCount }, (_, i) => ({
        title: `高级工程师${i}`,
        company: `某公司${i}`,
        start: '2020',
        end: '2023',
        points: ['负责核心模块架构设计与性能优化，主导重构', '带三人小组完成微服务拆分，QPS 提升 3 倍'],
      })),
    };
  }

  it('内容超一页：自动翻页，pageCount 与 block.page 正确', () => {
    const d = buildLayout(longData(6));
    assert.ok(d.pageCount! >= 2, '长内容必须分页');
    const pages = new Set(d.blocks.map((b) => b.page ?? 0));
    assert.deepEqual(Array.from(pages).sort(), [0, 1]);
    // 每页所有块底边不超安全区（282mm）
    for (const b of d.blocks) {
      assert.ok(b.rect.y + b.rect.h <= 282 + 0.01, `${b.id} 底边 ${b.rect.y + b.rect.h} 越界`);
      assert.ok(b.rect.y >= 15 - 0.01, `${b.id} 顶边 ${b.rect.y} 越界`);
    }
    // 每页顶部块从安全区顶边开始
    const firstOfPage1 = d.blocks.find((b) => (b.page ?? 0) === 1)!;
    assert.equal(firstOfPage1.rect.y, 15);
  });

  it('section 与首条 item keep-with-next：不产生孤儿标题', () => {
    // 精确控制：让 section 恰好落在页尾而 item 放不下
    const d = buildLayout(longData(6));
    const sections = d.blocks.filter((b) => b.type === 'section');
    for (const sec of sections) {
      const page = sec.page ?? 0;
      // section 所在的页里，必须存在同一页的后续内容块（非 section）
      const samePageContent = d.blocks.filter(
        (b) => (b.page ?? 0) === page && b.type !== 'section',
      );
      assert.ok(samePageContent.length > 0, `${sec.id} 是孤儿标题（第 ${page + 1} 页无内容）`);
    }
  });

  it('单页放得下：pageCount=1，全部块 page=0', () => {
    const d = buildLayout({ summary: '短总结', skills: ['A', 'B'] });
    assert.equal(d.pageCount, 1);
    assert.ok(d.blocks.every((b) => (b.page ?? 0) === 0));
  });

  it('空数据：pageCount=1、blocks 空', () => {
    const d = buildLayout(null);
    assert.equal(d.pageCount, 1);
    assert.equal(d.blocks.length, 0);
  });
});
