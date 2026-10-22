import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { Block, LayoutDocument } from '../types.ts';
import { DEFAULT_GAP_MM, neighborId, reorderBlocks } from '../reorder.ts';

function blk(id: string, h: number, extra: Partial<Block> = {}): Block {
  return {
    id,
    type: 'item',
    rect: { x: 15, y: 0, w: 180, h },
    freedom: 'free',
    sizePolicy: { resizableW: true, resizableH: true, minW: 60, minH: 8 },
    contentRef: { source: `experience[0]`, payload: {} },
    ...extra,
  };
}

function doc(blocks: Block[], gap?: number): LayoutDocument {
  return {
    version: 1,
    canvas: { width: 210, height: 297 },
    ...(gap === undefined ? {} : { gap }),
    blocks,
  };
}

describe('reorder: 数组重排 + y 重算', () => {
  it('交换相邻两块：数组顺序与 y 同步换位', () => {
    const d = doc([blk('a', 20), blk('b', 30)], 4);
    const r = reorderBlocks(d, 'a', 'b');
    assert.deepEqual(r.blocks.map((b) => b.id), ['b', 'a']);
    // y 按新顺序堆叠：b 从安全区顶端起，a 接在后面
    assert.equal(r.blocks[0].rect.y, 15);
    assert.equal(r.blocks[1].rect.y, 49); // 15 + 30 + 4
  });

  it('拖到队尾：中间块全部上移一个间距', () => {
    const d = doc([blk('a', 10), blk('b', 20), blk('c', 30)], 4);
    const r = reorderBlocks(d, 'a', 'c');
    assert.deepEqual(r.blocks.map((b) => b.id), ['b', 'c', 'a']);
    assert.deepEqual(
      r.blocks.map((b) => b.rect.y),
      [15, 39, 73], // b=15；c=15+20+4；a=39+30+4
    );
  });

  it('x / w / h / 锁定 / 样式 / payload 全部保留', () => {
    const styled = blk('a', 25, {
      locked: true,
      visible: false,
      style: { fontSizePt: 12, color: '#f00' },
      rect: { x: 30, y: 200, w: 150, h: 25 },
    });
    const d = doc([styled, blk('b', 10)], 4);
    const r = reorderBlocks(d, 'b', 'a');
    const a = r.blocks.find((b) => b.id === 'a')!;
    assert.equal(a.rect.x, 30);
    assert.equal(a.rect.w, 150);
    assert.equal(a.rect.h, 25);
    assert.equal(a.locked, true);
    assert.equal(a.visible, false);
    assert.deepEqual(a.style, { fontSizePt: 12, color: '#f00' });
    assert.equal(r.blocks.find((b) => b.id === 'b')!.rect.y, 15); // b 顶上来了
  });

  it('gap 缺省兜底 DEFAULT_GAP_MM（旧 v1 文档）', () => {
    const d = doc([blk('a', 10), blk('b', 10)]);
    const r = reorderBlocks(d, 'a', 'b');
    assert.equal(r.blocks[1].rect.y, 15 + 10 + DEFAULT_GAP_MM);
  });

  it('gap=0 或负值也走兜底', () => {
    const d = doc([blk('a', 10), blk('b', 10)], 0);
    const r = reorderBlocks(d, 'a', 'b');
    assert.equal(r.blocks[1].rect.y, 15 + 10 + DEFAULT_GAP_MM);
  });

  it('隐藏块参与堆叠：取消隐藏后位置可预期', () => {
    const d = doc([blk('a', 10), blk('hidden', 10, { visible: false }), blk('b', 10)], 4);
    const r = reorderBlocks(d, 'b', 'a'); // b 到最前，a/hidden 顺次后移
    assert.deepEqual(r.blocks.map((b) => b.id), ['b', 'a', 'hidden']);
    assert.deepEqual(
      r.blocks.map((b) => b.rect.y),
      [15, 29, 43], // 隐藏块仍占位
    );
  });

  it('原样返回场景：同一块 / id 不存在（返回原引用）', () => {
    const d = doc([blk('a', 10), blk('b', 10)], 4);
    assert.equal(reorderBlocks(d, 'a', 'a'), d);
    assert.equal(reorderBlocks(d, 'x', 'a'), d);
    assert.equal(reorderBlocks(d, 'a', 'x'), d);
  });

  it('原文档不被修改（纯函数）', () => {
    const d = doc([blk('a', 10), blk('b', 20)], 4);
    const before = JSON.stringify(d);
    reorderBlocks(d, 'a', 'b');
    assert.equal(JSON.stringify(d), before);
  });
});

describe('reorder: neighborId（上移/下移按钮）', () => {
  const d = doc([blk('a', 10), blk('b', 10), blk('c', 10)]);

  it('中间块上下邻居', () => {
    assert.equal(neighborId(d, 'b', -1), 'a');
    assert.equal(neighborId(d, 'b', 1), 'c');
  });

  it('边界返回 null', () => {
    assert.equal(neighborId(d, 'a', -1), null);
    assert.equal(neighborId(d, 'c', 1), null);
  });

  it('id 不存在返回 null', () => {
    assert.equal(neighborId(d, 'zzz', 1), null);
  });
});

describe('reorder: 跨页拖拽（多页简历）', () => {
  function multiPageDoc() {
    const mk = (id: string, page: number, y: number, h = 10) => ({
      id,
      type: 'item' as const,
      page,
      rect: { x: 15, y, w: 180, h },
      freedom: 'free' as const,
      sizePolicy: { resizableW: true, resizableH: true, minW: 60, minH: 8 },
      contentRef: { source: 'experience[0]', payload: {} },
    });
    return {
      version: 1,
      canvas: { width: 210, height: 297 },
      gap: 4,
      pageCount: 2,
      blocks: [mk('a', 0, 15), mk('b', 0, 29), mk('c', 1, 15), mk('d', 1, 29)],
    };
  }

  it('拖到别的页：active.page 改为 over 所在页', () => {
    const d = reorderBlocks(multiPageDoc(), 'a', 'c');
    const byId = Object.fromEntries(d.blocks.map((b) => [b.id, b]));
    assert.equal(byId.a.page, 1); // a 跟到 c 所在的第 1 页
    assert.equal(byId.b.page, 0);
    // 第 1 页重新堆叠：b? 不——只有 a 换了页。第 1 页 = [c, a]
    assert.equal(byId.c.rect.y, 15);
    assert.equal(byId.a.rect.y, 29); // c(10)+gap → 29
    // 第 0 页只剩 b，回到顶边
    assert.equal(byId.b.rect.y, 15);
  });

  it('同页排序：page 不变', () => {
    const d = reorderBlocks(multiPageDoc(), 'a', 'b');
    assert.ok(d.blocks.every((b) => b.page === (b.id === 'a' || b.id === 'b' ? 0 : 1)));
  });

  it('neighborId：只认同页邻居', () => {
    const d = multiPageDoc();
    assert.equal(neighborId(d, 'b', 1), null); // b 是第 0 页最后一块，下家是跨页的 c → null
    assert.equal(neighborId(d, 'a', 1), 'b');
    assert.equal(neighborId(d, 'c', -1), null); // c 是第 1 页第一块
    assert.equal(neighborId(d, 'd', -1), 'c');
  });

  it('每页各自堆叠：y 不跨页累加', () => {
    const d = reorderBlocks(multiPageDoc(), 'a', 'd'); // a 拖到第 1 页队尾
    const byId = Object.fromEntries(d.blocks.map((b) => [b.id, b]));
    assert.equal(byId.a.page, 1);
    // 第 1 页顺序 [c, d, a]：c=15, d=29, a=43
    assert.equal(byId.c.rect.y, 15);
    assert.equal(byId.d.rect.y, 29);
    assert.equal(byId.a.rect.y, 43);
    // 第 0 页只剩 b
    assert.equal(byId.b.rect.y, 15);
  });
});
