import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CSS_PX_PER_MM,
  PT_PER_MM,
  applyFreedom,
  clampRect,
  computeSnap,
  contains,
  intersectionArea,
  intersects,
  mmToPt,
  mmToPx,
  moveRect,
  ptToMm,
  pxToMm,
  rectBottom,
  rectRight,
  roundMm,
} from '../geometry.ts';
import { CANVAS_MM, SAFE_MARGIN_MM, SNAP_THRESHOLD_PX } from '../types.ts';
import type { BlockRect } from '../types.ts';

const rect = (x: number, y: number, w: number, h: number): BlockRect => ({ x, y, w, h });

function closeTo(actual: number, expected: number, precision = 6): void {
  assert.ok(
    Math.abs(actual - expected) < 10 ** -precision,
    `expected ${actual} to be close to ${expected}`,
  );
}

describe('单位换算', () => {
  it('1mm = 96/25.4 CSS px（96dpi 参考像素）', () => {
    closeTo(mmToPx(25.4), 96);
    closeTo(CSS_PX_PER_MM, 3.7795, 4);
  });

  it('1mm = 72/25.4 pt（PDF 导出）', () => {
    closeTo(mmToPt(25.4), 72);
    closeTo(ptToMm(72), 25.4);
    closeTo(PT_PER_MM, 2.8346, 4);
  });

  it('px ↔ mm 往返无损（含各缩放档）', () => {
    for (const zoom of [1, 0.75, 0.5]) {
      closeTo(pxToMm(mmToPx(37.5, zoom), zoom), 37.5);
    }
  });

  it('缩放只改像素表示，不改存储值', () => {
    closeTo(mmToPx(10, 0.5), mmToPx(10) / 2);
    closeTo(mmToPx(10, 0.75), mmToPx(10) * 0.75);
  });

  it('zoom 非法（0 / NaN）时回退 1，不会除零', () => {
    closeTo(pxToMm(96, 0), 25.4);
    closeTo(mmToPx(25.4, Number.NaN), 96);
  });
});

describe('roundMm', () => {
  it('保留 2 位小数', () => {
    assert.equal(roundMm(10.126), 10.13);
    assert.equal(roundMm(10.124), 10.12);
    assert.equal(roundMm(-3.456), -3.46);
    assert.equal(roundMm(15), 15);
  });
});

describe('矩形运算', () => {
  it('rectRight / rectBottom', () => {
    assert.equal(rectRight(rect(10, 20, 30, 40)), 40);
    assert.equal(rectBottom(rect(10, 20, 30, 40)), 60);
  });

  it('intersects：重叠为真，边缘相接不算', () => {
    assert.equal(intersects(rect(0, 0, 10, 10), rect(5, 5, 10, 10)), true);
    assert.equal(intersects(rect(0, 0, 10, 10), rect(10, 0, 10, 10)), false);
    assert.equal(intersects(rect(0, 0, 10, 10), rect(0, 10, 10, 10)), false);
    assert.equal(intersects(rect(0, 0, 10, 10), rect(2, 2, 3, 3)), true);
    assert.equal(intersects(rect(0, 0, 10, 10), rect(20, 20, 5, 5)), false);
  });

  it('intersectionArea', () => {
    assert.equal(intersectionArea(rect(0, 0, 10, 10), rect(5, 5, 10, 10)), 25);
    assert.equal(intersectionArea(rect(0, 0, 10, 10), rect(10, 0, 10, 10)), 0);
  });

  it('contains', () => {
    assert.equal(contains(rect(0, 0, 100, 100), rect(10, 10, 20, 20)), true);
    assert.equal(contains(rect(0, 0, 100, 100), rect(90, 10, 20, 20)), false);
  });

  it('moveRect 返回新对象，不改原对象', () => {
    const a = rect(10, 10, 20, 20);
    const b = moveRect(a, 5, -3);
    assert.deepEqual(b, { x: 15, y: 7, w: 20, h: 20 });
    assert.deepEqual(a, { x: 10, y: 10, w: 20, h: 20 });
  });
});

describe('clampRect（安全边距硬约束）', () => {
  it('越界拉回安全区内', () => {
    assert.deepEqual(clampRect(rect(0, 0, 50, 50)), { x: 15, y: 15, w: 50, h: 50 });
    assert.deepEqual(clampRect(rect(200, 290, 50, 50)), { x: 145, y: 232, w: 50, h: 50 });
  });

  it('尺寸超出内容区时收缩到内容区大小', () => {
    assert.deepEqual(clampRect(rect(0, 0, 500, 500)), { x: 15, y: 15, w: 180, h: 267 });
  });

  it('安全区内原样返回（坐标取 2 位小数）', () => {
    assert.deepEqual(clampRect(rect(20.126, 30, 100, 100)), { x: 20.13, y: 30, w: 100, h: 100 });
  });
});

describe('applyFreedom（自由度轴过滤，基于起始 rect）', () => {
  const start = rect(15, 20, 50, 10);

  it('free 原样通过', () => {
    assert.deepEqual(applyFreedom(start, rect(80, 99, 50, 10), 'free'), rect(80, 99, 50, 10));
  });

  it('horizontal 锁 y', () => {
    assert.deepEqual(applyFreedom(start, rect(80, 99, 50, 10), 'horizontal'), rect(80, 20, 50, 10));
  });

  it('vertical 锁 x', () => {
    assert.deepEqual(applyFreedom(start, rect(80, 99, 50, 10), 'vertical'), rect(15, 99, 50, 10));
  });

  it('locked 完全不动', () => {
    assert.deepEqual(applyFreedom(start, rect(80, 99, 50, 10), 'locked'), start);
  });

  it('连续过滤不累积漂移（每帧都用起始 rect 做基准）', () => {
    let current = rect(15, 20, 50, 10);
    for (let i = 0; i < 5; i += 1) {
      current = applyFreedom(start, moveRect(current, 3, 7), 'horizontal');
    }
    assert.deepEqual(current, rect(30, 20, 50, 10));
  });
});

describe('computeSnap（纯函数吸附）', () => {
  it('左边缘靠近安全边距时吸附，参考线 span 覆盖内容带', () => {
    const r = computeSnap(rect(16, 100, 40, 20), []);
    closeTo(r.dx, -1);
    assert.equal(r.dy, 0);
    assert.equal(r.guides.length, 1);
    assert.equal(r.guides[0].axis, 'x');
    assert.equal(r.guides[0].position, SAFE_MARGIN_MM);
    assert.deepEqual(r.guides[0].span, [SAFE_MARGIN_MM, CANVAS_MM.height - SAFE_MARGIN_MM]);
  });

  it('已对齐时 dx=0 但仍返回参考线（用于常显）', () => {
    const r = computeSnap(rect(15, 100, 40, 20), []);
    assert.equal(r.dx, 0);
    assert.equal(r.guides.length, 1);
    assert.equal(r.guides[0].position, 15);
  });

  it('超出阈值不吸附、无参考线', () => {
    const r = computeSnap(rect(25, 100, 40, 20), []);
    assert.equal(r.dx, 0);
    assert.equal(r.dy, 0);
    assert.deepEqual(r.guides, []);
  });

  it('吸附到其他 block 的右边缘，span 取两者外接', () => {
    const other = rect(60, 100, 80, 20);
    const r = computeSnap(rect(31, 100, 30, 20), [other]);
    closeTo(r.dx, -1);
    assert.equal(r.guides[0].position, 60);
    assert.deepEqual(r.guides[0].span, [100, 120]);
  });

  it('吸附到其他 block 的水平中心', () => {
    const other = rect(60, 100, 80, 20);
    const r = computeSnap(rect(79, 100, 40, 20), [other]);
    closeTo(r.dx, 1);
    assert.equal(r.guides[0].position, 100);
  });

  it('y 轴同理：顶边靠近安全边距', () => {
    const r = computeSnap(rect(100, 16, 40, 20), []);
    assert.equal(r.dx, 0);
    closeTo(r.dy, -1);
    assert.equal(r.guides[0].axis, 'y');
  });

  it('两个轴可同时吸附，返回两条参考线', () => {
    const r = computeSnap(rect(16, 16, 40, 20), []);
    closeTo(r.dx, -1);
    closeTo(r.dy, -1);
    assert.equal(r.guides.length, 2);
    assert.deepEqual(
      r.guides.map((g) => g.axis).sort(),
      ['x', 'y'],
    );
  });

  it('zoom 缩小 → 阈值覆盖的 mm 变大（6px @50% ≈ 3.17mm）', () => {
    const full = pxToMm(SNAP_THRESHOLD_PX, 1);
    closeTo(full, 1.587, 3);
    closeTo(pxToMm(SNAP_THRESHOLD_PX, 0.5), full * 2);
    assert.equal(computeSnap(rect(17.5, 100, 40, 20), [], { zoom: 1 }).dx, 0);
    closeTo(computeSnap(rect(17.5, 100, 40, 20), [], { zoom: 0.5 }).dx, -2.5);
  });

  it('阈值内多个候选时取最近', () => {
    const r = computeSnap(rect(15.5, 100, 40, 20), []);
    assert.equal(r.guides[0].position, 15);
  });

  it('others 混入自身时跳过，不会自吸附', () => {
    const self = rect(16, 100, 40, 20);
    const r = computeSnap(self, [self]);
    closeTo(r.dx, -1);
    assert.equal(r.guides[0].position, 15);
  });

  it('自定义 canvas / margin / 阈值生效', () => {
    const r = computeSnap(rect(10.4, 50, 30, 10), [], {
      canvas: { width: 100, height: 100 },
      margin: 10,
      thresholdPx: 6,
      zoom: 1,
    });
    closeTo(r.dx, -0.4);
    assert.equal(r.guides[0].position, 10);
  });
});
