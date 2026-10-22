import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectBlockOverflow,
  detectOverflow,
  hasOverflow,
  overflowMapOf,
  safeArea,
} from '../overflow.ts';
import { roundMm } from '../geometry.ts';
import { CANVAS_MM, SAFE_MARGIN_MM } from '../types.ts';
import type { Block, BlockRect } from '../types.ts';

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

const rect = (x: number, y: number, w: number, h: number): BlockRect => ({ x, y, w, h });

describe('safeArea：内容区矩形', () => {
  it('A4 + 15mm 边距 = 180×267mm 从 (15,15) 起', () => {
    const a = safeArea();
    assert.deepEqual(a, { x: 15, y: 15, w: 180, h: 267 });
  });

  it('边距大于画布一半时宽度不为负（钳到 0）', () => {
    const a = safeArea({ width: 20, height: 20 }, 15);
    assert.deepEqual(a, { x: 15, y: 15, w: 0, h: 0 });
  });
});

describe('detectBlockOverflow：越界方向判定', () => {
  it('完全在安全区内 → null', () => {
    assert.equal(detectBlockOverflow(block({ id: 'a', rect: rect(15, 15, 180, 10) })), null);
  });

  it('恰好贴边（x = margin）不算越界 —— 边界相等是合法位置', () => {
    assert.equal(detectBlockOverflow(block({ id: 'a', rect: rect(15, 15, 180, 267) })), null);
  });

  it('左越界：x < margin，超出量 = margin - x', () => {
    const o = detectBlockOverflow(block({ id: 'a', rect: rect(10, 20, 100, 10) }));
    assert.ok(o);
    assert.deepEqual(o.sides, ['left']);
    assert.equal(o.outMm.left, 5);
    assert.equal(o.offPage, false);
  });

  it('右越界：右边超出 width - margin', () => {
    const o = detectBlockOverflow(block({ id: 'a', rect: rect(100, 20, 100, 10) }));
    assert.ok(o);
    assert.deepEqual(o.sides, ['right']);
    assert.equal(o.outMm.right, 5); // 200 - 195
  });

  it('上越界 + 下越界同时存在', () => {
    const o = detectBlockOverflow(block({ id: 'a', rect: rect(20, 5, 50, 280) }));
    assert.ok(o);
    assert.deepEqual(o.sides, ['top', 'bottom']);
    assert.equal(o.outMm.top, 10); // 15 - 5
    assert.equal(o.outMm.bottom, 3); // (5+280) - (297-15)
  });

  it('四边全越：块比安全区还大', () => {
    const o = detectBlockOverflow(block({ id: 'a', rect: rect(0, 0, 210, 297) }));
    assert.ok(o);
    assert.deepEqual(o.sides, ['left', 'right', 'top', 'bottom']);
  });

  it('offPage：掉出纸张物理边界才为 true', () => {
    // 越安全区但没掉出纸（x=10 > 0）
    assert.equal(detectBlockOverflow(block({ id: 'a', rect: rect(10, 20, 100, 10) }))?.offPage, false);
    // x = -1，已掉出纸左边
    assert.equal(detectBlockOverflow(block({ id: 'a', rect: rect(-1, 20, 100, 10) }))?.offPage, true);
    // 右边缘 212 > 210
    assert.equal(detectBlockOverflow(block({ id: 'a', rect: rect(120, 20, 92, 10) }))?.offPage, true);
  });

  it('浮点容差：0.005mm 的误差不算越界（roundMm 精度内）', () => {
    assert.equal(
      detectBlockOverflow(block({ id: 'a', rect: rect(14.995, 15, 100, 10) })),
      null,
    );
  });

  it('超出量保留 2 位小数（与存储精度一致）', () => {
    // 超出量一律走 roundMm（不写死某个浮点字面量，避免依赖 JS 的 .5 舍入细节）
    const x = 11.111;
    const o = detectBlockOverflow(block({ id: 'a', rect: rect(x, 15, 100, 10) }));
    assert.equal(o?.outMm.left, roundMm(15 - x));
    assert.equal(roundMm(roundMm(15 - x)), roundMm(15 - x)); // 幂等：再取整不变
  });
});

describe('detectOverflow：批量与隐藏块', () => {
  it('跳过 visible === false 的块（与导出一致）', () => {
    const out = detectOverflow([
      block({ id: 'a', rect: rect(-50, 20, 100, 10) }),
      block({ id: 'b', rect: rect(-50, 40, 100, 10), visible: false }),
    ]);
    assert.deepEqual(out.map((o) => o.id), ['a']);
  });

  it('只返回越界的块，顺序与输入一致', () => {
    const out = detectOverflow([
      block({ id: 'ok', rect: rect(15, 15, 100, 10) }),
      block({ id: 'x', rect: rect(0, 15, 100, 10) }),
      block({ id: 'ok2', rect: rect(15, 40, 100, 10) }),
      block({ id: 'y', rect: rect(15, 15, 100, 400) }),
    ]);
    assert.deepEqual(out.map((o) => o.id), ['x', 'y']);
  });

  it('空数组 / 全合法 → 空结果', () => {
    assert.deepEqual(detectOverflow([]), []);
    assert.deepEqual(detectOverflow([block({ id: 'a' })]), []);
  });

  it('自定义画布与边距生效', () => {
    const out = detectOverflow(
      [block({ id: 'a', rect: rect(15, 15, 100, 10) })],
      { width: 100, height: 100 },
      5,
    );
    // 100 宽、5 边距：右界 95，块右缘 115 → 越界 20
    assert.equal(out[0].outMm.right, 20);
  });
});

describe('overflowMapOf / hasOverflow', () => {
  it('Map 以 id 为键，可 O(1) 查询', () => {
    const map = overflowMapOf([
      block({ id: 'a', rect: rect(-5, 15, 20, 10) }),
      block({ id: 'b', rect: rect(15, 15, 100, 10) }),
    ]);
    assert.equal(map.size, 1);
    assert.ok(map.get('a'));
    assert.equal(map.get('b'), undefined);
  });

  it('hasOverflow 是开关语义', () => {
    assert.equal(hasOverflow([block({ id: 'a' })]), false);
    assert.equal(hasOverflow([block({ id: 'a', rect: rect(0, 0, 10, 10) })]), true);
  });
});

describe('内容溢出：块装不下文字', () => {
  it('高度够 → 不报（contentOverflowMm 为 undefined）', () => {
    const b = block({
      id: 'a',
      type: 'summary',
      rect: rect(15, 15, 180, 60),
      contentRef: { source: 'summary', payload: { summary: '短文本' } },
    });
    const o = detectBlockOverflow(b);
    // 短文本在 60mm 里装得下 → 整体干净
    assert.equal(o, null);
  });

  it('缩矮后立刻报：需要高度 > 当前高度', () => {
    const text = '资深后端工程师'.repeat(20); // 140 字
    const b = block({
      id: 'a',
      type: 'summary',
      rect: rect(15, 15, 180, 5),
      contentRef: { source: 'summary', payload: { summary: text } },
    });
    const o = detectBlockOverflow(b);
    assert.ok(o, '应检出内容溢出');
    assert.equal(o?.sides.length, 0, '位置没越界');
    assert.ok(o?.contentOverflowMm, '应给出估算需要高度');
    assert.ok((o?.contentOverflowMm ?? 0) > 5, '需要高度应大于当前 5mm');
  });

  it('与 validate.ts 的 fixOverflow 同一口径：它增高的块这里必被标出', async () => {
    const { autoFixLayout } = await import('../validate.ts');
    const text = '资深后端工程师，精通分布式系统与高并发架构。'.repeat(10);
    const b = block({
      id: 'a',
      type: 'summary',
      rect: rect(15, 15, 180, 6),
      contentRef: { source: 'summary', payload: { summary: text } },
    });
    assert.ok(detectBlockOverflow(b), '修正前：内容溢出');

    const theDoc = { version: 1, canvas: { width: 210, height: 297 }, blocks: [b] };
    const { doc: fixed } = autoFixLayout(theDoc);
    const fixedBlock = fixed.blocks[0];
    assert.equal(
      detectBlockOverflow(fixedBlock)?.contentOverflowMm,
      undefined,
      '修正后：增高到位，不再报内容溢出',
    );
  });

  it('回归：横向排列的块不按「每段一行」误报（技能组曾经被估成 49.62mm）', () => {
    // 20 个技能标签，渲染是 flex-wrap 横排，不是 20 行
    const skills = Array.from({ length: 20 }, (_, i) => `技能${i}`);
    const b = block({
      id: 'sk',
      type: 'skill-group',
      rect: rect(15, 15, 180, 20),
      contentRef: { source: 'skills', payload: { skills } },
    });
    assert.equal(detectBlockOverflow(b), null, '20 个技能在 20mm 里不该被判溢出');
  });

  it('横向块真的装不下时照样报（只缩到 5mm）', () => {
    const skills = Array.from({ length: 20 }, (_, i) => `技能${i}`);
    const b = block({
      id: 'sk',
      type: 'skill-group',
      rect: rect(15, 15, 180, 5),
      contentRef: { source: 'skills', payload: { skills } },
    });
    assert.ok(detectBlockOverflow(b)?.contentOverflowMm, '5mm 装不下仍应报');
  });

  it('contact 三个字段是一行 inline，不按三行算', () => {
    const b = block({
      id: 'ct',
      type: 'contact',
      rect: rect(15, 15, 180, 10),
      contentRef: { source: 'personal_info', payload: { name: '张三', email: 'a@b.com', phone: '13800000000' } },
    });
    assert.equal(detectBlockOverflow(b), null);
  });

  it('无文本块（divider/avatar）永不误报内容溢出', () => {
    const d = block({ id: 'd', type: 'divider', rect: rect(15, 15, 180, 1) });
    assert.equal(detectBlockOverflow(d), null);
  });

  it('位置越界 + 内容溢出同时存在时一起返回', () => {
    const b = block({
      id: 'a',
      type: 'summary',
      rect: rect(0, 15, 180, 5), // 左越界 + 装不下
      contentRef: { source: 'summary', payload: { summary: '资深工程师'.repeat(30) } },
    });
    const o = detectBlockOverflow(b);
    assert.ok(o);
    assert.deepEqual(o?.sides, ['left']);
    assert.ok(o?.contentOverflowMm);
  });
});

describe('与 validateLayout 的 out-of-bounds 口径一致', () => {
  it('clampRect 拉回后的块不会再被判越界（不会一直亮红点）', async () => {
    const { clampRect } = await import('../geometry.ts');
    const outside = block({ id: 'a', rect: rect(-30, 400, 500, 500) });
    assert.ok(detectBlockOverflow(outside)); // 修正前：越界
    const fixed = { ...outside, rect: clampRect(outside.rect, CANVAS_MM, SAFE_MARGIN_MM) };
    assert.equal(detectBlockOverflow(fixed), null); // 修正后：干净
  });
});
