/**
 * resolveMove / resolveResize / nudgeRect 单测 —— 交互解析纯函数。
 * 这三个函数是 useDragEngine 的计算核心，hook 只负责事件与 DOM。
 *
 * 数值基准：1mm = 96/25.4 ≈ 3.7795 CSS px；10px ≈ 2.6458mm（存储舍入 2.65）。
 * 运行：npm test（node --test 原生 TS）
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { BlockRect, BlockSizePolicy } from '../types.ts';
import { nudgeRect, resolveMove, resolveResize } from '../geometry.ts';

const FULL: BlockSizePolicy = { resizableW: true, resizableH: true, minW: 10, minH: 5 };

function rect(x: number, y: number, w: number, h: number): BlockRect {
  return { x, y, w, h };
}

describe('resolveMove: 网格量化', () => {
  it('gridMm=5：坐标量化到 5mm 整数倍', () => {
    const { rect: r } = resolveMove({
      start: rect(20, 20, 50, 10),
      deltaPx: { x: 10, y: 10 }, // ≈ 2.65mm → 22.65 → 量化到 25
      freedom: 'free',
      gridMm: 5,
    });
    assert.equal(r.x, 25);
    assert.equal(r.y, 25);
  });

  it('gridMm=null / 0：不量化（默认行为）', () => {
    const a = resolveMove({ start: rect(20, 20, 50, 10), deltaPx: { x: 10, y: 0 }, freedom: 'free', gridMm: null });
    const b = resolveMove({ start: rect(20, 20, 50, 10), deltaPx: { x: 10, y: 0 }, freedom: 'free', gridMm: 0 });
    assert.equal(a.rect.x, 22.65);
    assert.equal(b.rect.x, 22.65);
  });

  it('horizontal：只量化 x，y 本就钉死', () => {
    const { rect: r } = resolveMove({
      start: rect(20, 20, 50, 10),
      deltaPx: { x: 10, y: 30 },
      freedom: 'horizontal',
      gridMm: 5,
    });
    assert.equal(r.x, 25);
    assert.equal(r.y, 20);
  });

  it('吸附优先于网格：命中吸附时取吸附值，不再量化', () => {
    const { rect: r } = resolveMove({
      start: rect(20, 20, 50, 10),
      deltaPx: { x: 10, y: 0 }, // 22.65，距 22.5 仅 0.15mm < 阈值
      freedom: 'free',
      gridMm: 5,
      snap: { enabled: true, others: [rect(22.5, 100, 50, 10)] },
    });
    assert.equal(r.x, 22.5); // 吸附值（非网格的 25）
  });

  it('量化后仍受安全区钳制', () => {
    const { rect: r } = resolveMove({
      start: rect(20, 20, 50, 10),
      deltaPx: { x: -100, y: 0 }, // 20-26.46 < 15 → 钳回 15（也是 5 的倍数）
      freedom: 'free',
      gridMm: 5,
    });
    assert.equal(r.x, 15);
  });
});

describe('resolveMove: 单位换算与自由度', () => {
  it('free：px 位移换算为 mm（10px ≈ 2.65mm）', () => {
    const { rect: r } = resolveMove({
      start: rect(20, 20, 50, 10),
      deltaPx: { x: 10, y: 10 },
      freedom: 'free',
    });
    assert.equal(r.x, 22.65);
    assert.equal(r.y, 22.65);
  });

  it('horizontal：只允许 x 移动，y 钉死', () => {
    const { rect: r } = resolveMove({
      start: rect(20, 20, 50, 10),
      deltaPx: { x: 10, y: 50 },
      freedom: 'horizontal',
    });
    assert.equal(r.x, 22.65);
    assert.equal(r.y, 20);
  });

  it('vertical：只允许 y 移动，x 钉死', () => {
    const { rect: r } = resolveMove({
      start: rect(20, 20, 50, 10),
      deltaPx: { x: 10, y: 50 },
      freedom: 'vertical',
    });
    assert.equal(r.x, 20);
    assert.equal(r.y, 33.23); // 50px ≈ 13.229mm
  });

  it('locked：完全不动', () => {
    const { rect: r, guides } = resolveMove({
      start: rect(20, 20, 50, 10),
      deltaPx: { x: 100, y: 100 },
      freedom: 'locked',
    });
    assert.deepEqual(r, rect(20, 20, 50, 10));
    assert.equal(guides.length, 0);
  });

  it('zoom=0.5 时同样 px 位移换到双倍 mm', () => {
    const { rect: r } = resolveMove({
      start: rect(20, 20, 50, 10),
      deltaPx: { x: 10, y: 0 },
      freedom: 'free',
      zoom: 0.5,
    });
    assert.equal(r.x, 25.29); // 10px @50% ≈ 5.29mm
  });
});

describe('resolveMove: 吸附', () => {
  it('左缘吸附到其他 block 的左缘（阈值内修正）', () => {
    const { rect: r } = resolveMove({
      start: rect(20, 20, 50, 10),
      deltaPx: { x: 302, y: 0 }, // ≈ 79.91mm，距 100 差 0.09mm
      freedom: 'free',
      snap: { enabled: true, others: [rect(100, 20, 50, 10)] },
    });
    assert.equal(r.x, 100);
  });

  it('右缘吸附到其他 block 的左缘', () => {
    const { rect: r } = resolveMove({
      start: rect(20, 20, 50, 10),
      deltaPx: { x: 113, y: 0 }, // ≈ 29.93mm → x≈49.93，right≈99.93
      freedom: 'free',
      snap: { enabled: true, others: [rect(100, 20, 50, 10)] },
    });
    assert.equal(r.x, 50);
  });

  it('已对齐（delta=0）也返回参考线用于显示', () => {
    const { rect: r, guides } = resolveMove({
      start: rect(20, 20, 50, 10),
      deltaPx: { x: 0, y: 0 },
      freedom: 'free',
      snap: { enabled: true, others: [rect(100, 20, 50, 10)] },
    });
    assert.equal(r.x, 20);
    assert.equal(guides.length, 1);
    assert.equal(guides[0].axis, 'y'); // y 方向与 other 的 y=20 天然对齐
    assert.equal(guides[0].position, 20);
  });

  it('超出阈值不吸附', () => {
    const { rect: r } = resolveMove({
      start: rect(20, 20, 50, 10),
      deltaPx: { x: 100, y: 0 }, // ≈ 26.46mm → x≈46.46，距 100 很远
      freedom: 'free',
      snap: { enabled: true, others: [rect(100, 20, 50, 10)] },
    });
    assert.equal(r.x, 46.46);
  });

  it('snap.enabled=false 时完全不吸附', () => {
    const { rect: r, guides } = resolveMove({
      start: rect(20, 20, 50, 10),
      deltaPx: { x: 302, y: 0 },
      freedom: 'free',
      snap: { enabled: false, others: [rect(100, 20, 50, 10)] },
    });
    assert.equal(r.x, 99.9); // 302px ≈ 79.9mm，不吸附
    assert.equal(guides.length, 0);
  });

  it('horizontal 自由度：吸附位移不会把 y 吸走，参考线只留 x 轴', () => {
    const { rect: r, guides } = resolveMove({
      start: rect(20, 20, 50, 10),
      deltaPx: { x: 302, y: 302 }, // y 方向与 other 的 y=100 差得远，不会触发 y 吸附
      freedom: 'horizontal',
      snap: { enabled: true, others: [rect(100, 100, 50, 10)] },
    });
    assert.equal(r.x, 100);
    assert.equal(r.y, 20);
    assert.ok(guides.every((g) => g.axis === 'x'));
  });

  it('vertical 自由度：参考线只留 y 轴', () => {
    const { rect: r, guides } = resolveMove({
      start: rect(20, 20, 50, 10),
      deltaPx: { x: 302, y: 0 },
      freedom: 'vertical',
      snap: { enabled: true, others: [rect(100, 20, 50, 10)] },
    });
    assert.equal(r.x, 20); // x 被自由度钉回
    assert.ok(guides.every((g) => g.axis === 'y'));
  });
});

describe('resolveMove: 安全区钳制', () => {
  it('拖出画布右下角被拉回安全区', () => {
    const { rect: r } = resolveMove({
      start: rect(200, 290, 20, 20),
      deltaPx: { x: 50, y: 50 },
      freedom: 'free',
    });
    assert.deepEqual(r, rect(175, 262, 20, 20));
  });

  it('吸附修正后仍越界时钳制优先', () => {
    const { rect: r } = resolveMove({
      start: rect(200, 290, 20, 20),
      deltaPx: { x: 302, y: 0 },
      freedom: 'free',
      snap: { enabled: true, others: [rect(100, 20, 50, 10)] },
    });
    assert.ok(r.x <= 175);
    assert.ok(r.x + r.w <= 195);
  });
});

describe('resolveResize: 四角手柄与约束', () => {
  it('se：右下扩展，左上不动', () => {
    const r = resolveResize({
      start: rect(20, 20, 50, 10),
      handle: 'se',
      deltaPx: { x: 38, y: 38 }, // ≈ 10.05mm
      sizePolicy: FULL,
    });
    assert.equal(r.w, 60.05);
    assert.equal(r.h, 20.05);
    assert.equal(r.x, 20);
    assert.equal(r.y, 20);
  });

  it('nw：左上拖动，右下锚定', () => {
    const r = resolveResize({
      start: rect(20, 20, 50, 10),
      handle: 'nw',
      deltaPx: { x: 38, y: 38 },
      sizePolicy: FULL,
    });
    assert.equal(r.x, 30.05);
    assert.equal(r.w, 39.95); // 右缘 70 钉死
    assert.equal(r.y, 25); // 高度触底 minH=5，下缘 30 钉死
    assert.equal(r.h, 5);
  });

  it('最小尺寸兜底，不翻转', () => {
    const r = resolveResize({
      start: rect(20, 20, 50, 10),
      handle: 'se',
      deltaPx: { x: -500, y: -500 },
      sizePolicy: FULL,
    });
    assert.equal(r.w, 10);
    assert.equal(r.h, 5);
  });

  it('resizableW=false 时宽度不变', () => {
    const r = resolveResize({
      start: rect(20, 20, 50, 10),
      handle: 'se',
      deltaPx: { x: 38, y: 38 },
      sizePolicy: { resizableW: false, resizableH: true, minW: 10, minH: 5 },
    });
    assert.equal(r.w, 50);
    assert.equal(r.h, 20.05);
  });

  it('扩展不超过画布右界（硬钳制）', () => {
    const r = resolveResize({
      start: rect(20, 20, 50, 10),
      handle: 'se',
      deltaPx: { x: 1000, y: 0 },
      sizePolicy: FULL,
    });
    assert.equal(r.w, 175); // 210 - 15 边距 - x=20
    assert.ok(r.x + r.w <= 195);
  });

  it('zoom=0.5 时同 px 位移换到双倍 mm', () => {
    const r = resolveResize({
      start: rect(20, 20, 50, 10),
      handle: 'se',
      deltaPx: { x: 38, y: 0 },
      zoom: 0.5,
      sizePolicy: FULL,
    });
    assert.equal(r.w, 70.11); // 38px @50% ≈ 20.11mm
  });
});

describe('nudgeRect: 键盘微调', () => {
  it('1px 微调（≈0.26mm）', () => {
    const r = nudgeRect(rect(20, 20, 50, 10), 'free', 1, 1);
    assert.equal(r.x, 20.26);
    assert.equal(r.y, 20.26);
  });

  it('Shift 10px 微调', () => {
    const r = nudgeRect(rect(20, 20, 50, 10), 'free', 10, 10);
    assert.equal(r.x, 22.65);
    assert.equal(r.y, 22.65);
  });

  it('负方向微调', () => {
    const r = nudgeRect(rect(20, 20, 50, 10), 'free', -10, -10);
    assert.equal(r.x, 17.35);
    assert.equal(r.y, 17.35);
  });

  it('vertical 自由度只动 y', () => {
    const r = nudgeRect(rect(20, 20, 50, 10), 'vertical', 10, 10);
    assert.equal(r.x, 20);
    assert.equal(r.y, 22.65);
  });

  it('locked 自由度不动', () => {
    const r = nudgeRect(rect(20, 20, 50, 10), 'locked', 10, 10);
    assert.deepEqual(r, rect(20, 20, 50, 10));
  });

  it('微调越界同样钳制', () => {
    const r = nudgeRect(rect(205, 290, 20, 20), 'free', 10, 10);
    assert.equal(r.x, 175);
    assert.equal(r.y, 262);
  });

  it('zoom=0.5 时 1px 换到双倍 mm', () => {
    const r = nudgeRect(rect(20, 20, 50, 10), 'free', 1, 0, 0.5);
    assert.equal(r.x, 20.53); // 1px @50% ≈ 0.53mm
  });
});
