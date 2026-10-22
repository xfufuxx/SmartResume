/**
 * 性能基准 —— 「≤50 区块稳定 60fps」的可执行近似验证。
 *
 * 本机无浏览器环境，无法直接测 rAF 帧率。本文件测的是**拖拽热路径的
 * 纯函数耗时**：pointermove 每帧做的一次 resolveMove 全链路
 * （px→mm→自由度→吸附→钳制）里，吸附要扫其余 49 个块的边缘与中心，
 * 是 O(n²) 的来源。
 *
 * 60fps 帧预算 = 16.6ms，其中 React 渲染 + 样式计算占大头。
 * 断言单次全链路耗时 < 1ms（预算的 1/16），留足余量。
 *
 * 运行：npm test（node --test 原生 TS）
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Block, BlockRect, LayoutDocument } from '../types.ts';
import { CANVAS_MM } from '../types.ts';
import { buildLayout } from '../buildLayout.ts';
import { computeSnap, resolveMove } from '../geometry.ts';
import { parseLayout, serializeLayout } from '../serialize.ts';
import { layoutBodyHtml } from '../renderHtml.ts';
import { validateLayout } from '../validate.ts';

function makeBlock(id: string, x: number, y: number, w = 85, h = 20): Block {
  return {
    id,
    type: 'item',
    rect: { x, y, w, h },
    freedom: 'free',
    sizePolicy: { resizableW: true, resizableH: true, minW: 60, minH: 16 },
    contentRef: { source: 'experience[0]', payload: { title: id, points: ['a', 'b'] } },
  };
}

/** 50 块网格化布局（5 列 × 10 行，间距 2mm），双栏场景 */function gridDoc(count = 50): LayoutDocument {
  const cols = 5;
  const blocks: Block[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    blocks.push(makeBlock(`blk_${i}`, 15 + col * 36, 15 + row * 28));
  }
  return { version: 1, canvas: CANVAS_MM, blocks };
}

function timeIt(fn: () => void, rounds: number): number {
  // 预热：JIT 编译后再计时，避免首次解释执行的偏差
  for (let i = 0; i < Math.min(50, rounds); i++) fn();
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < rounds; i++) fn();
  const t1 = process.hrtime.bigint();
  return Number(t1 - t0) / 1e6 / rounds; // 平均 ms/次
}

describe('性能: 拖拽热路径（50 块）', () => {
  const doc = gridDoc(50);
  const others: BlockRect[] = doc.blocks.map((b) => b.rect);
  const start = doc.blocks[0].rect;

  it('resolveMove 全链路（含 49 块吸附扫描）平均 < 1ms', () => {
    let frame = 0;
    const avg = timeIt(() => {
      frame += 1;
      // 模拟 pointermove：每帧 delta 递增（含吸附命中与未命中两种路径）
      const deltaPx = { x: (frame % 40) - 20, y: (frame % 27) - 13 };
      resolveMove({
        start,
        deltaPx,
        freedom: 'free',
        zoom: 1,
        snap: { enabled: true, others },
      });
    }, 1000);
    assert.ok(avg < 1, `resolveMove 平均耗时 ${avg.toFixed(4)}ms，超出 1ms 预算`);
  });

  it('computeSnap 单独调用（O(n²) 候选扫描）平均 < 0.5ms', () => {
    const moving: BlockRect = { x: 30, y: 30, w: 85, h: 20 };
    const avg = timeIt(() => {
      computeSnap(moving, others, { canvas: CANVAS_MM });
    }, 1000);
    assert.ok(avg < 0.5, `computeSnap 平均耗时 ${avg.toFixed(4)}ms`);
  });

  it('关吸附的拖拽路径更快（< 0.1ms）', () => {
    let frame = 0;
    const avg = timeIt(() => {
      frame += 1;
      resolveMove({
        start,
        deltaPx: { x: frame % 30, y: frame % 30 },
        freedom: 'free',
        snap: { enabled: false },
      });
    }, 1000);
    assert.ok(avg < 0.1, `无吸附 resolveMove 平均耗时 ${avg.toFixed(4)}ms`);
  });
});

describe('性能: 50 块文档的结构操作', () => {
  const doc = gridDoc(50);

  it('serialize + parseLayout 往返 100 次 < 200ms', () => {
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < 100; i++) {
      const restored = parseLayout(serializeLayout(doc));
      assert.ok(restored);
    }
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    assert.ok(ms < 200, `100 次序列化往返耗时 ${ms.toFixed(1)}ms`);
  });

  it('layoutBodyHtml 100 次 < 200ms', () => {
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < 100; i++) layoutBodyHtml(doc);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    assert.ok(ms < 200, `100 次导出 HTML 渲染耗时 ${ms.toFixed(1)}ms`);
  });

  it('validateLayout 50 次 < 500ms', () => {
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < 50; i++) validateLayout(doc);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    assert.ok(ms < 500, `50 次校验耗时 ${ms.toFixed(1)}ms`);
  });

  it('buildLayout 50 块简历 100 次 < 500ms', () => {
    const data = {
      personal_info: { name: 'P', email: 'a@b.com' },
      summary: 's',
      experience: Array.from({ length: 16 }, (_, i) => ({ title: `t${i}`, points: ['p1', 'p2', 'p3'] })),
      education: Array.from({ length: 14 }, (_, i) => ({ school: `s${i}` })),
      skills: Array.from({ length: 30 }, (_, i) => `k${i}`),
      projects: Array.from({ length: 14 }, (_, i) => ({ name: `j${i}`, points: ['x'] })),
    };
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < 100; i++) buildLayout(data);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    assert.ok(ms < 500, `100 次默认布局生成耗时 ${ms.toFixed(1)}ms`);
  });
});

describe('性能: 规模上限保护', () => {
  it('200 块文档仍可完成一次全链路拖拽解析（< 5ms）', () => {
    const big = gridDoc(200);
    const others = big.blocks.map((b) => b.rect);
    const start = big.blocks[0].rect;
    const avg = timeIt(() => {
      resolveMove({ start, deltaPx: { x: 12, y: -8 }, freedom: 'free', snap: { enabled: true, others } });
    }, 200);
    assert.ok(avg < 5, `200 块 resolveMove 平均耗时 ${avg.toFixed(4)}ms`);
  });
});
