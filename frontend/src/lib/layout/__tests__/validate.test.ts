/**
 * validate.ts 单测 —— 五项校验与自动修正。
 * 运行：npm test（node --test 原生 TS）
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Block, LayoutDocument } from '../types.ts';
import {
  autoFixLayout,
  blockLabel,
  estimateContentHeightMm,
  extractBlockText,
  isLayoutClean,
  validateLayout,
} from '../validate.ts';

function block(overrides: Partial<Block> & { id: string }): Block {
  return {
    type: 'item',
    rect: { x: 15, y: 15, w: 180, h: 10 },
    freedom: 'free',
    sizePolicy: { resizableW: true, resizableH: true, minW: 60, minH: 16 },
    contentRef: { source: 'test' },
    ...overrides,
  };
}

function doc(blocks: Block[]): LayoutDocument {
  return { version: 1, canvas: { width: 210, height: 297 }, blocks };
}

describe('extractBlockText / estimateContentHeightMm', () => {
  it('item：标题 + 公司 + 要点全部提取', () => {
    const b = block({
      id: 'exp_0',
      contentRef: {
        source: 'experience[0]',
        payload: {
          title: '资深前端工程师',
          company: '某公司',
          points: ['负责架构', '主导优化'],
        },
      },
    });
    // experienceItemHtml 把 title 与 @company 合成一行，提取同口径
    assert.equal(extractBlockText(b), '资深前端工程师 @ 某公司\n负责架构\n主导优化');
  });

  it('无 payload / 空 payload 返回空串', () => {
    assert.equal(extractBlockText(block({ id: 'a' })), '');
    assert.equal(
      extractBlockText(block({ id: 'b', contentRef: { source: 'x', payload: null } })),
      '',
    );
  });

  it('education：按 school/degree/major/period 提取（渲染器同口径）', () => {
    const b = block({
      id: 'edu_0',
      contentRef: {
        source: 'education[0]',
        payload: { school: '南京邮电大学', degree: '本科', major: '计算机', start: '2015.09', end: '2019.06' },
      },
    });
    assert.equal(extractBlockText(b), '南京邮电大学\n本科 - 计算机\n2015.09 - 2019.06');
  });

  it('projects：按 name·role/period/points/description/tech 提取', () => {
    const b = block({
      id: 'proj_0',
      contentRef: {
        source: 'projects[0]',
        payload: {
          name: '平台',
          role: '负责人',
          start: '2022.03',
          end: '2023.08',
          points: ['要点一'],
          description: '描述',
          tech: ['Java', 'Redis'],
        },
      },
    });
    assert.equal(extractBlockText(b), '平台 · 负责人\n2022.03 - 2023.08\n要点一\n描述\n技术栈：Java、Redis');
  });

  it('summary：200 全角字符 @10.5pt @180mm 宽 → 5 行 → 30.56mm', () => {
    const b = block({
      id: 'summary',
      type: 'summary',
      rect: { x: 15, y: 50, w: 180, h: 24 },
      contentRef: { source: 'summary', payload: { summary: '甲'.repeat(200) } },
    });
    // 行容量 = 680.31px ÷ 14px = 48.59 字/行，200 字 → 5 行；
    // 5 × (10.5pt × 1.6 行高 × 25.4/72 × 1.03 行盒修正) = 30.52mm（2026-10-21 校准模型）
    assert.equal(estimateContentHeightMm(b), 30.52);
  });

  it('无文本块返回原高度（不判溢出）', () => {
    const b = block({ id: 'divider', type: 'divider', rect: { x: 15, y: 45, w: 180, h: 1 } });
    assert.equal(estimateContentHeightMm(b), 1);
  });
});

describe('validateLayout: 越界（auto）', () => {
  it('超出右下角被拉回安全区', () => {
    const d = doc([block({ id: 'a', rect: { x: 205, y: 290, w: 20, h: 20 } })]);
    const result = validateLayout(d);
    assert.equal(result.autoFixedCount, 1);
    assert.equal(result.needsAttention, false);
    assert.deepEqual(result.doc.blocks[0].rect, { x: 175, y: 262, w: 20, h: 20 });
    assert.equal(result.issues[0].kind, 'out-of-bounds');
    assert.equal(result.issues[0].severity, 'auto');
  });

  it('不修改入参文档（不可变）', () => {
    const d = doc([block({ id: 'a', rect: { x: 205, y: 290, w: 20, h: 20 } })]);
    const snapshot = JSON.stringify(d);
    validateLayout(d);
    assert.equal(JSON.stringify(d), snapshot);
  });
});

describe('validateLayout: 重叠（warn，不自动修）', () => {
  it('两块相交 → warn 且不修正', () => {
    const d = doc([
      block({ id: 'a', rect: { x: 15, y: 15, w: 180, h: 20 } }),
      block({ id: 'b', rect: { x: 15, y: 25, w: 180, h: 20 } }),
    ]);
    const result = validateLayout(d);
    assert.equal(result.autoFixedCount, 0);
    assert.equal(result.needsAttention, true);
    assert.equal(result.issues.length, 1);
    assert.equal(result.issues[0].kind, 'overlap');
    assert.equal(result.issues[0].severity, 'warn');
    assert.deepEqual(result.issues[0].blockIds, ['a', 'b']);
  });

  it('边缘相接不算重叠', () => {
    const d = doc([
      block({ id: 'a', rect: { x: 15, y: 15, w: 180, h: 10 } }),
      block({ id: 'b', rect: { x: 15, y: 25, w: 180, h: 10 } }),
    ]);
    assert.equal(validateLayout(d).issues.length, 0);
  });

  it('隐藏块不参与重叠检查', () => {
    const d = doc([
      block({ id: 'a', rect: { x: 15, y: 15, w: 180, h: 20 } }),
      block({ id: 'b', rect: { x: 15, y: 25, w: 180, h: 20 }, visible: false }),
    ]);
    assert.equal(validateLayout(d).issues.length, 0);
  });
});

describe('validateLayout: 对齐不一致（auto，聚类）', () => {
  it('同列左缘参差 → 对齐到最左值', () => {
    // 注意用 w=100 而非通栏 180：全宽块的 x 被 clampRect 钉死在 15，没有参差空间
    const d = doc([
      block({ id: 'a', rect: { x: 15, y: 15, w: 100, h: 10 } }),
      block({ id: 'b', rect: { x: 15.8, y: 29, w: 100, h: 10 } }),
      block({ id: 'c', rect: { x: 16.2, y: 43, w: 100, h: 10 } }),
    ]);
    const result = validateLayout(d);
    const xs = result.doc.blocks.map((b) => b.rect.x);
    assert.deepEqual(xs, [15, 15, 15]);
    const misaligned = result.issues.filter((i) => i.kind === 'misaligned');
    assert.equal(misaligned.length, 2);
  });

  it('双栏布局两列各自内聚，互不干扰', () => {
    // 双栏单列宽 85mm（≥ 内容区 40% = 72mm，参与修正）；两列 x 相距 94mm，切成两簇
    const d = doc([
      block({ id: 'a', rect: { x: 15, y: 15, w: 85, h: 10 } }),
      block({ id: 'b', rect: { x: 15.6, y: 29, w: 85, h: 10 } }),
      block({ id: 'c', rect: { x: 109, y: 15, w: 85, h: 10 } }),
      block({ id: 'd', rect: { x: 109.8, y: 29, w: 85, h: 10 } }),
    ]);
    const result = validateLayout(d);
    const xs = result.doc.blocks.map((b) => b.rect.x);
    assert.deepEqual(xs, [15, 15, 109, 109]);
  });

  it('horizontal 自由的块（divider/contact）不参与左缘对齐', () => {
    // divider 宽 100（非通栏），x=60 有活动空间且不越界，应保持原位
    const d = doc([
      block({ id: 'a', type: 'item', rect: { x: 15, y: 15, w: 100, h: 10 } }),
      block({
        id: 'div',
        type: 'divider',
        freedom: 'horizontal',
        rect: { x: 60, y: 29, w: 100, h: 1 },
      }),
    ]);
    const result = validateLayout(d);
    assert.equal(result.doc.blocks[1].rect.x, 60);
    assert.ok(!result.issues.some((i) => i.kind === 'misaligned'));
  });

  it('窄块（头像类）不参与对齐', () => {
    const d = doc([
      block({ id: 'a', rect: { x: 15, y: 15, w: 180, h: 10 } }),
      block({ id: 'av', type: 'avatar', rect: { x: 165, y: 15, w: 30, h: 40 } }),
    ]);
    const result = validateLayout(d);
    assert.equal(result.doc.blocks[1].rect.x, 165);
  });
});

describe('validateLayout: 间距不一致（auto）', () => {
  it('同列 4/4/8 的间距 → 第三块归位到理想间距 4', () => {
    const d = doc([
      block({ id: 'a', rect: { x: 15, y: 15, w: 180, h: 10 } }),
      block({ id: 'b', rect: { x: 15, y: 29, w: 180, h: 10 } }),
      block({ id: 'c', rect: { x: 15, y: 43, w: 180, h: 10 } }),
      block({ id: 'd', rect: { x: 15, y: 61, w: 180, h: 10 } }),
    ]);
    const result = validateLayout(d);
    // gaps = [4, 4, 8] → 中位数 4；d 应从 61 挪到 43+10+4=57
    assert.equal(result.doc.blocks[3].rect.y, 57);
    const gapIssues = result.issues.filter((i) => i.kind === 'uneven-gap');
    assert.equal(gapIssues.length, 1);
    assert.deepEqual(gapIssues[0].blockIds, ['d']);
  });

  it('等距布局不触发间距问题', () => {
    const d = doc([
      block({ id: 'a', rect: { x: 15, y: 15, w: 180, h: 10 } }),
      block({ id: 'b', rect: { x: 15, y: 29, w: 180, h: 10 } }),
      block({ id: 'c', rect: { x: 15, y: 43, w: 180, h: 10 } }),
    ]);
    assert.ok(!validateLayout(d).issues.some((i) => i.kind === 'uneven-gap'));
  });

  it('少于 3 块不判间距', () => {
    const d = doc([
      block({ id: 'a', rect: { x: 15, y: 15, w: 180, h: 10 } }),
      block({ id: 'b', rect: { x: 15, y: 100, w: 180, h: 10 } }),
    ]);
    assert.ok(!validateLayout(d).issues.some((i) => i.kind === 'uneven-gap'));
  });
});

describe('validateLayout: 内容溢出（auto）', () => {
  it('高度不足 → 增高到估算值 + 0.5mm 余量', () => {
    const longPoints = Array.from({ length: 8 }, (_, i) => `第${i}条很长的工作要点描述文字`);
    const d = doc([
      block({
        id: 'exp_0',
        rect: { x: 15, y: 15, w: 180, h: 10 },
        contentRef: {
          source: 'experience[0]',
          payload: { title: '工程师', company: '公司', points: longPoints },
        },
      }),
    ]);
    const result = validateLayout(d);
    const overflowIssues = result.issues.filter((i) => i.kind === 'overflow');
    assert.equal(overflowIssues.length, 1);
    assert.ok(result.doc.blocks[0].rect.h > 10);
    assert.equal(overflowIssues[0].severity, 'auto');
  });

  it('增高后不越出画布底界', () => {
    const longPoints = Array.from({ length: 30 }, (_, i) => `第${i}条很长的工作要点描述文字`);
    const d = doc([
      block({
        id: 'exp_0',
        rect: { x: 15, y: 280, w: 180, h: 10 },
        contentRef: {
          source: 'experience[0]',
          payload: { title: '工程师', company: '公司', points: longPoints },
        },
      }),
    ]);
    const result = validateLayout(d);
    const b = result.doc.blocks[0];
    assert.ok(b.rect.y + b.rect.h <= 282 + 0.001); // 297 - 15 边距
    assert.ok(b.rect.h <= 267 + 0.001);
  });
});

describe('validateLayout: autoFix=false 与综合场景', () => {
  it('autoFix=false：只报告不修正，全部升级为 warn', () => {
    const d = doc([block({ id: 'a', rect: { x: 205, y: 15, w: 20, h: 10 } })]);
    const result = validateLayout(d, { autoFix: false });
    assert.equal(result.autoFixedCount, 0);
    assert.equal(result.needsAttention, true);
    assert.equal(result.doc.blocks[0].rect.x, 205); // 未修
    assert.equal(result.issues[0].severity, 'warn');
    assert.equal(result.issues[0].kind, 'out-of-bounds');
  });

  it('干净文档：无问题', () => {
    const d = doc([
      block({ id: 'a', rect: { x: 15, y: 15, w: 180, h: 10 } }),
      block({ id: 'b', rect: { x: 15, y: 29, w: 180, h: 10 } }),
      block({ id: 'c', rect: { x: 15, y: 43, w: 180, h: 10 } }),
    ]);
    assert.equal(isLayoutClean(d), true);
    assert.equal(validateLayout(d).issues.length, 0);
  });

  it('空文档：无问题', () => {
    assert.equal(isLayoutClean(doc([])), true);
  });

  it('autoFixLayout：修正计数与 validateLayout 的 autoFixedCount 一致', () => {
    const d = doc([
      block({ id: 'a', rect: { x: 15, y: 15, w: 100, h: 10 } }),
      block({ id: 'b', rect: { x: 15.8, y: 29, w: 100, h: 10 } }),
      block({ id: 'c', rect: { x: 16.2, y: 43, w: 100, h: 10 } }),
    ]);
    const direct = autoFixLayout(d);
    const viaValidate = validateLayout(d);
    assert.equal(direct.fixed, viaValidate.autoFixedCount);
    assert.equal(JSON.stringify(direct.doc), JSON.stringify(viaValidate.doc));
  });

  it('隐藏块不参与修正', () => {
    const d = doc([
      block({ id: 'a', rect: { x: 205, y: 15, w: 20, h: 10 }, visible: false }),
    ]);
    // 越界修正对所有块生效（含隐藏），防取消隐藏时看到越界
    const result = validateLayout(d);
    assert.equal(result.autoFixedCount, 1);
  });

  it('回归：间距传播/溢出增高引入的新越界被兜底钳制收口', () => {
    // b 间距 0、c 间距 235（严重不均，触发传播）、d 已越界（281+10=291 > 282）
    // 任何修正路径（传播、增高）的最终结果都必须收敛在安全区内
    const d = doc([
      block({ id: 'a', rect: { x: 15, y: 15, w: 180, h: 10 } }),
      block({ id: 'b', rect: { x: 15, y: 25, w: 180, h: 10 } }),
      block({ id: 'c', rect: { x: 15, y: 270, w: 180, h: 10 } }),
      block({ id: 'd', rect: { x: 15, y: 281, w: 180, h: 10 } }),
    ]);
    const { doc: fixed } = autoFixLayout(d);
    for (const b of fixed.blocks) {
      assert.ok(b.rect.x >= 15 && b.rect.y >= 15, `${b.id} 左上越界`);
      assert.ok(b.rect.x + b.rect.w <= 195 && b.rect.y + b.rect.h <= 282, `${b.id} 右下越界`);
    }
  });
});

describe('validate: 多页分组', () => {
  function blk(id: string, page: number, y: number, x = 15, h = 10) {
    return {
      id,
      type: 'item' as const,
      page,
      rect: { x, y, w: 180, h },
      freedom: 'free' as const,
      sizePolicy: { resizableW: true, resizableH: true, minW: 60, minH: 8 },
      contentRef: { source: 'experience[0]', payload: { title: 'T', points: ['x'] } },
    };
  }

  it('间距不一致只页内判定：跨页的 y 差不报警', () => {
    // 第 0 页块间距均匀（4mm）；第 1 页块间距也均匀。若跨页混算会误报
    const doc: LayoutDocument = {
      version: 1,
      canvas: { width: 210, height: 297 },
      gap: 4,
      pageCount: 2,
      blocks: [blk('a', 0, 15), blk('b', 0, 29), blk('c', 1, 15), blk('d', 1, 29)],
    };
    const r = autoFixLayout(doc);
    const gapIssues = r.issues.filter((i) => i.kind === 'uneven-gap');
    assert.equal(gapIssues.length, 0);
  });

  it('重叠只页内判定：不同页同坐标不算重叠', () => {
    const doc: LayoutDocument = {
      version: 1,
      canvas: { width: 210, height: 297 },
      pageCount: 2,
      blocks: [blk('a', 0, 15), blk('b', 1, 15)], // 完全同坐标，不同页
    };
    const r = autoFixLayout(doc);
    assert.equal(r.issues.filter((i) => i.kind === 'overlap').length, 0);
  });

  it('同页重叠照常报 warn', () => {
    const doc: LayoutDocument = {
      version: 1,
      canvas: { width: 210, height: 297 },
      pageCount: 2,
      blocks: [blk('a', 0, 15), blk('b', 0, 15)],
    };
    // autoFix 不收重叠（warn 类），走 validateLayout 的收集分支
    const r = validateLayout(doc);
    assert.equal(r.issues.filter((i) => i.kind === 'overlap').length, 1);
    assert.equal(r.needsAttention, true);
  });

  it('blockLabel：第 2 页起的块带页码后缀', () => {
    assert.match(blockLabel(blk('a', 1, 15)), /第 2 页/);
    assert.doesNotMatch(blockLabel(blk('a', 0, 15)), /第 2 页/);
  });

  it('间距修正只在本页内进行：改一页不动另一页', () => {
    // 第 0 页间距混乱（4 和 20），第 1 页间距整齐——修正第 0 页时第 1 页纹丝不动
    const doc: LayoutDocument = {
      version: 1,
      canvas: { width: 210, height: 297 },
      gap: 4,
      pageCount: 2,
      blocks: [
        blk('a', 0, 15), blk('b', 0, 29), blk('c', 0, 49), // 间距 4 / 20
        blk('d', 1, 15), blk('e', 1, 29), blk('f', 1, 43), // 间距 4 / 4
      ],
    };
    const r = autoFixLayout(doc);
    const byId = Object.fromEntries(r.doc.blocks.map((b) => [b.id, b]));
    assert.equal(byId.d.rect.y, 15);
    assert.equal(byId.e.rect.y, 29);
    assert.equal(byId.f.rect.y, 43);
  });
});
