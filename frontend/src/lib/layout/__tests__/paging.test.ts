import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Block, LayoutDocument } from '../types.ts';
import {
  addPage, isPageEmpty, moveBlockToPage, normalizePages,
  pageCountOf, pageOf, pagesOf, removePage, visibleBlocksOfPage,
} from '../paging.ts';

function blk(id: string, y: number, h = 10, opts: Partial<Block> = {}): Block {
  return {
    id,
    type: 'item',
    page: 0,
    rect: { x: 15, y, w: 180, h },
    freedom: 'free',
    sizePolicy: { resizableW: true, resizableH: true, minW: 60, minH: 8 },
    contentRef: { source: `experience[0]`, payload: {} },
    ...opts,
  };
}

function doc(blocks: Block[], pageCount?: number): LayoutDocument {
  return {
    version: 1,
    canvas: { width: 210, height: 297 },
    gap: 4,
    ...(pageCount !== undefined ? { pageCount } : {}),
    blocks,
  };
}

describe('paging: 页号兜底与分组', () => {
  it('pageOf：缺省 page = 0（旧单页存档兼容）', () => {
    const { page: _page, ...rest } = blk('a', 15);
    assert.equal(pageOf(rest as Block), 0);
  });

  it('pageCountOf：pageCount 写小了按最大 block.page 兜底', () => {
    const d = doc([blk('a', 15, 10, { page: 0 }), blk('b', 15, 10, { page: 2 })], 1);
    assert.equal(pageCountOf(d), 3);
  });

  it('pagesOf：按页分组且组内保持数组顺序', () => {
    const d = doc([
      blk('a', 15, 10, { page: 1 }),
      blk('b', 15, 10, { page: 0 }),
      blk('c', 15, 10, { page: 1 }),
    ]);
    const pages = pagesOf(d);
    assert.equal(pages.length, 2);
    assert.deepEqual(pages[0].map((b) => b.id), ['b']);
    assert.deepEqual(pages[1].map((b) => b.id), ['a', 'c']);
  });

  it('visibleBlocksOfPage：隐藏块不参与预览分组', () => {
    const d = doc([blk('a', 15), blk('b', 30, 10, { visible: false })]);
    assert.deepEqual(visibleBlocksOfPage(d, 0).map((b) => b.id), ['a']);
  });

  it('normalizePages：补齐 pageCount，无变化返回原引用', () => {
    const d = doc([blk('a', 15, 10, { page: 1 })], 1);
    const fixed = normalizePages(d);
    assert.equal(fixed.pageCount, 2);
    assert.equal(normalizePages(fixed), fixed); // 幂等：原引用
  });
});

describe('paging: 块换页', () => {
  it('移到空页：y 落在安全区顶边', () => {
    const d = doc([blk('a', 15, 10, { page: 0 })], 2);
    const r = moveBlockToPage(d, 'a', 1);
    const moved = r.blocks[0];
    assert.equal(moved.page, 1);
    assert.equal(moved.rect.y, 15);
    assert.equal(moved.rect.x, 15); // x/w/h 保留
  });

  it('移到有内容的页：y 落在该页内容底边 + gap', () => {
    const d = doc([
      blk('a', 15, 20, { page: 0 }),          // 第 0 页：底边 35
      blk('b', 100, 30, { page: 0 }),         // 第 0 页：底边 130
      blk('c', 15, 10, { page: 1 }),          // 要移到第 1 页
    ]);
    const r = moveBlockToPage(d, 'c', 0);
    assert.equal(r.blocks[2].page, 0);
    assert.equal(r.blocks[2].rect.y, 134); // 130 + gap 4
  });

  it('目标页放不下：clamp 到安全区底（不静默丢内容）', () => {
    const d = doc([
      blk('a', 15, 260, { page: 0 }),         // 第 0 页几乎占满：底边 275
      blk('c', 15, 10, { page: 1 }),
    ]);
    const r = moveBlockToPage(d, 'c', 0);
    // 275+4+10=289 > 282 → y 钳到 272
    assert.equal(r.blocks[1].rect.y, 272);
  });

  it('同页移动 / id 不存在 / 目标页越界：原样返回', () => {
    const d = doc([blk('a', 15, 10, { page: 0 })], 2);
    assert.equal(moveBlockToPage(d, 'a', 0), d);
    assert.equal(moveBlockToPage(d, 'zz', 1), d);
    assert.equal(moveBlockToPage(d, 'a', -1), d);
    assert.equal(moveBlockToPage(d, 'a', 2), d);
  });

  it('隐藏块不挡位：y 按可见块底边计算', () => {
    const d = doc([
      blk('a', 15, 20, { page: 0 }),                    // 可见：底边 35
      blk('hidden', 60, 100, { page: 0, visible: false }), // 隐藏：不挡
      blk('c', 15, 10, { page: 1 }),
    ]);
    const r = moveBlockToPage(d, 'c', 0);
    assert.equal(r.blocks[2].rect.y, 39); // 35 + 4
  });
});

describe('paging: 增删页', () => {
  it('addPage：末尾追加空页', () => {
    const d = doc([blk('a', 15, 10, { page: 0 })], 1);
    const r = addPage(d);
    assert.equal(r.pageCount, 2);
    assert.equal(r.blocks[0].page, 0);
  });

  it('removePage：仅允许删空页，后续页号前移', () => {
    const d = doc([
      blk('a', 15, 10, { page: 0 }),
      blk('b', 15, 10, { page: 2 }),
    ], 3);
    assert.equal(isPageEmpty(d, 1), true);
    const r = removePage(d, 1);
    assert.equal(r.pageCount, 2);
    assert.equal(r.blocks[1].page, 1); // 原第 2 页 → 第 1 页
  });

  it('removePage：非空页 / 末页 / 越界一律原样返回', () => {
    const d = doc([blk('a', 15, 10, { page: 0 })], 2);
    assert.equal(removePage(d, 0), d);   // 非空
    assert.equal(removePage(d, 5), d);   // 越界
    const single = doc([], 1);
    assert.equal(removePage(single, 0), single); // 仅一页不删
  });
});
