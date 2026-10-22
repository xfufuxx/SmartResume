/**
 * layoutReducer 单测 —— 撤销/重做/入栈条件（纯函数，无需 React）。
 * 运行：npm test（node --test 原生 TS）
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Block, LayoutDocument } from '../../../lib/layout/types.ts';
import {
  HISTORY_LIMIT,
  createInitialState,
  layoutReducer,
  type EditorAction,
  type EditorState,
} from '../layoutReducer.ts';

function makeBlock(id: string, x = 15, y = 15): Block {
  return {
    id,
    type: 'item',
    rect: { x, y, w: 180, h: 10 },
    freedom: 'free',
    sizePolicy: { resizableW: true, resizableH: true, minW: 60, minH: 16 },
    contentRef: { source: 'test' },
  };
}

function fixture(): LayoutDocument {
  return {
    version: 1,
    canvas: { width: 210, height: 297 },
    blocks: [makeBlock('a', 15, 15), makeBlock('b', 15, 29)],
  };
}

function run(state: EditorState, ...actions: EditorAction[]): EditorState {
  return actions.reduce(layoutReducer, state);
}

describe('layoutReducer: 移动与入栈', () => {
  it('MOVE_BLOCK 更新 rect 并入栈', () => {
    const s0 = createInitialState(fixture());
    const s1 = run(s0, { type: 'MOVE_BLOCK', id: 'a', rect: { x: 50, y: 15, w: 180, h: 10 } });
    assert.equal(s1.doc.blocks[0].rect.x, 50);
    assert.equal(s1.past.length, 1);
    assert.equal(s1.dirty, true);
    assert.equal(s1.future.length, 0);
  });

  it('相同 rect 的 MOVE_BLOCK 不入栈（误触保护）', () => {
    const s0 = createInitialState(fixture());
    const s1 = run(s0, { type: 'MOVE_BLOCK', id: 'a', rect: { ...s0.doc.blocks[0].rect } });
    assert.equal(s1, s0); // 原样返回
    assert.equal(s1.past.length, 0);
    assert.equal(s1.dirty, false);
  });

  it('不存在的 id 不入栈', () => {
    const s0 = createInitialState(fixture());
    const s1 = run(s0, { type: 'MOVE_BLOCK', id: 'zzz', rect: { x: 1, y: 1, w: 1, h: 1 } });
    assert.equal(s1, s0);
  });

  it('RESIZE_BLOCK 同样入栈', () => {
    const s0 = createInitialState(fixture());
    const s1 = run(s0, { type: 'RESIZE_BLOCK', id: 'a', rect: { x: 15, y: 15, w: 100, h: 30 } });
    assert.equal(s1.doc.blocks[0].rect.h, 30);
    assert.equal(s1.past.length, 1);
  });
});

describe('layoutReducer: 撤销 / 重做', () => {
  it('UNDO/REDO 往返', () => {
    const s0 = createInitialState(fixture());
    const moved = run(s0, { type: 'MOVE_BLOCK', id: 'a', rect: { x: 50, y: 15, w: 180, h: 10 } });
    const undone = run(moved, { type: 'UNDO' });
    assert.equal(undone.doc.blocks[0].rect.x, 15);
    assert.equal(undone.future.length, 1);
    const redone = run(undone, { type: 'REDO' });
    assert.equal(redone.doc.blocks[0].rect.x, 50);
    assert.equal(redone.future.length, 0);
  });

  it('空栈 UNDO/REDO 原样返回', () => {
    const s0 = createInitialState(fixture());
    assert.equal(run(s0, { type: 'UNDO' }), s0);
    assert.equal(run(s0, { type: 'REDO' }), s0);
  });

  it('新操作清空 redo 栈', () => {
    const s0 = createInitialState(fixture());
    const moved = run(s0, { type: 'MOVE_BLOCK', id: 'a', rect: { x: 50, y: 15, w: 180, h: 10 } });
    const undone = run(moved, { type: 'UNDO' });
    assert.equal(undone.future.length, 1);
    const moved2 = run(undone, { type: 'MOVE_BLOCK', id: 'b', rect: { x: 15, y: 60, w: 180, h: 10 } });
    assert.equal(moved2.future.length, 0);
  });

  it('50 步上限：连续 60 次移动后 past=50，可一路 UNDO 回最初', () => {
    let s = createInitialState(fixture());
    for (let i = 1; i <= 60; i++) {
      s = run(s, { type: 'MOVE_BLOCK', id: 'a', rect: { x: 15 + i, y: 15, w: 180, h: 10 } });
    }
    assert.equal(s.past.length, HISTORY_LIMIT);
    assert.equal(s.doc.blocks[0].rect.x, 75);
    // 回到最初 50 步前的状态（第 10 次移动后的 x=25，即 past 栈底）
    for (let i = 0; i < HISTORY_LIMIT; i++) s = run(s, { type: 'UNDO' });
    assert.equal(s.doc.blocks[0].rect.x, 25);
    assert.equal(s.past.length, 0);
    // 再多 UNDO 无操作
    assert.equal(run(s, { type: 'UNDO' }), s);
  });

  it('50 步 REDO 回放：连续 UNDO 50 步后可一路 REDO 回最新', () => {
    let s = createInitialState(fixture());
    for (let i = 1; i <= 60; i++) {
      s = run(s, { type: 'MOVE_BLOCK', id: 'a', rect: { x: 15 + i, y: 15, w: 180, h: 10 } });
    }
    assert.equal(s.doc.blocks[0].rect.x, 75);
    for (let i = 0; i < HISTORY_LIMIT; i++) s = run(s, { type: 'UNDO' });
    assert.equal(s.doc.blocks[0].rect.x, 25);
    for (let i = 0; i < HISTORY_LIMIT; i++) s = run(s, { type: 'REDO' });
    assert.equal(s.doc.blocks[0].rect.x, 75); // 回到最新状态
    assert.equal(s.future.length, 0);
    // 再多 REDO 无操作
    assert.equal(run(s, { type: 'REDO' }), s);
  });

  it('REDO 中途做新操作会截断后续历史', () => {
    let s = createInitialState(fixture());
    s = run(s, { type: 'MOVE_BLOCK', id: 'a', rect: { x: 30, y: 15, w: 180, h: 10 } });
    s = run(s, { type: 'MOVE_BLOCK', id: 'a', rect: { x: 50, y: 15, w: 180, h: 10 } });
    s = run(s, { type: 'UNDO' }, { type: 'UNDO' }); // 回到 x=15
    assert.equal(s.doc.blocks[0].rect.x, 15);
    assert.equal(s.future.length, 2);
    s = run(s, { type: 'MOVE_BLOCK', id: 'a', rect: { x: 40, y: 15, w: 180, h: 10 } });
    assert.equal(s.future.length, 0); // x=30/x=50 的历史被丢弃
    s = run(s, { type: 'UNDO' });
    assert.equal(s.doc.blocks[0].rect.x, 15);
    assert.equal(run(s, { type: 'REDO' }).doc.blocks[0].rect.x, 40);
  });
});

describe('layoutReducer: 层级与属性开关', () => {
  it('BRING_FRONT 把块移到数组末尾', () => {
    const s0 = createInitialState(fixture());
    const s1 = run(s0, { type: 'BRING_FRONT', id: 'a' });
    assert.deepEqual(
      s1.doc.blocks.map((b) => b.id),
      ['b', 'a'],
    );
    assert.equal(s1.past.length, 1);
  });

  it('SEND_BACK 把块移到数组头部', () => {
    const s0 = createInitialState(fixture());
    const s1 = run(s0, { type: 'SEND_BACK', id: 'b' });
    assert.deepEqual(
      s1.doc.blocks.map((b) => b.id),
      ['b', 'a'],
    );
  });

  it('已在顶层/底层时 BRING_FRONT/SEND_BACK 无操作', () => {
    const s0 = createInitialState(fixture());
    assert.equal(run(s0, { type: 'BRING_FRONT', id: 'b' }), s0);
    assert.equal(run(s0, { type: 'SEND_BACK', id: 'a' }), s0);
  });

  it('TOGGLE_LOCK / TOGGLE_VISIBLE 切换并入栈', () => {
    const s0 = createInitialState(fixture());
    const s1 = run(s0, { type: 'TOGGLE_LOCK', id: 'a' });
    assert.equal(s1.doc.blocks[0].locked, true);
    const s2 = run(s1, { type: 'TOGGLE_LOCK', id: 'a' });
    assert.equal(s2.doc.blocks[0].locked, false);
    const s3 = run(s2, { type: 'TOGGLE_VISIBLE', id: 'b' });
    assert.equal(s3.doc.blocks[1].visible, false);
    const s4 = run(s3, { type: 'TOGGLE_VISIBLE', id: 'b' });
    assert.equal(s4.doc.blocks[1].visible, true);
  });

  it('SET_FREEDOM 同步 locked 标志', () => {
    const s0 = createInitialState(fixture());
    const s1 = run(s0, { type: 'SET_FREEDOM', id: 'a', freedom: 'locked' });
    assert.equal(s1.doc.blocks[0].freedom, 'locked');
    assert.equal(s1.doc.blocks[0].locked, true);
    const s2 = run(s1, { type: 'SET_FREEDOM', id: 'a', freedom: 'vertical' });
    assert.equal(s2.doc.blocks[0].locked, undefined);
  });
});

describe('layoutReducer: 视图操作不入栈', () => {
  it('SELECT_BLOCK / SET_ZOOM / TOGGLE_GRID / TOGGLE_ALIGN 不入栈不脏', () => {
    const s0 = createInitialState(fixture());
    const s1 = run(
      s0,
      { type: 'SELECT_BLOCK', id: 'a' },
      { type: 'SET_ZOOM', zoom: 0.75 },
      { type: 'TOGGLE_GRID' },
      { type: 'TOGGLE_ALIGN' },
    );
    assert.equal(s1.selectedId, 'a');
    assert.equal(s1.zoom, 0.75);
    assert.equal(s1.gridSnap, true);
    assert.equal(s1.alignAssist, false);
    assert.equal(s1.past.length, 0);
    assert.equal(s1.dirty, false);
  });

  it('重复 SELECT 同 id 原样返回', () => {
    const s0 = createInitialState(fixture());
    const s1 = run(s0, { type: 'SELECT_BLOCK', id: 'a' });
    assert.equal(run(s1, { type: 'SELECT_BLOCK', id: 'a' }), s1);
  });
});

describe('layoutReducer: 重置与自动修正', () => {
  it('RESET_LAYOUT 回到 initialDoc 且可撤销', () => {
    const s0 = createInitialState(fixture());
    const moved = run(s0, { type: 'MOVE_BLOCK', id: 'a', rect: { x: 50, y: 15, w: 180, h: 10 } });
    const reset = run(moved, { type: 'RESET_LAYOUT' });
    assert.equal(reset.doc.blocks[0].rect.x, 15);
    assert.equal(reset.past.length, 2);
    const undone = run(reset, { type: 'UNDO' });
    assert.equal(undone.doc.blocks[0].rect.x, 50);
  });

  it('无变化的 RESET_LAYOUT 不入栈', () => {
    const s0 = createInitialState(fixture());
    assert.equal(run(s0, { type: 'RESET_LAYOUT' }), s0);
  });

  it('APPLY_AUTOFIX 修正越界并入栈', () => {
    const bad = fixture();
    bad.blocks[0].rect = { x: 205, y: 15, w: 20, h: 10 };
    const s0 = createInitialState(bad);
    const s1 = run(s0, { type: 'APPLY_AUTOFIX' });
    assert.equal(s1.doc.blocks[0].rect.x, 175);
    assert.equal(s1.past.length, 1);
    const undone = run(s1, { type: 'UNDO' });
    assert.equal(undone.doc.blocks[0].rect.x, 205); // 可撤销回退
  });

  it('干净文档的 APPLY_AUTOFIX 无操作', () => {
    const s0 = createInitialState(fixture());
    assert.equal(run(s0, { type: 'APPLY_AUTOFIX' }), s0);
  });

  it('LOAD_LAYOUT 重置全部状态', () => {
    let s = createInitialState(fixture());
    s = run(
      s,
      { type: 'MOVE_BLOCK', id: 'a', rect: { x: 50, y: 15, w: 180, h: 10 } },
      { type: 'SELECT_BLOCK', id: 'a' },
      { type: 'SET_ZOOM', zoom: 0.5 },
    );
    const fresh = fixture();
    fresh.blocks[1].rect.y = 100;
    const s2 = run(s, { type: 'LOAD_LAYOUT', doc: fresh });
    assert.equal(s2.past.length, 0);
    assert.equal(s2.future.length, 0);
    assert.equal(s2.selectedId, null);
    assert.equal(s2.zoom, 1);
    assert.equal(s2.dirty, false);
    assert.equal(s2.doc.blocks[1].rect.y, 100);
  });
});

describe('layoutReducer: 不可变性', () => {
  it('reducer 不修改传入 state 的 doc', () => {
    const s0 = createInitialState(fixture());
    const snapshot = JSON.stringify(s0.doc);
    run(s0, { type: 'MOVE_BLOCK', id: 'a', rect: { x: 99, y: 99, w: 180, h: 10 } });
    assert.equal(JSON.stringify(s0.doc), snapshot);
  });
});

describe('layoutReducer: 行内编辑', () => {
  /** 带 summary 内容的块：UPDATE_CONTENT 的高度重算需要真实文本 */
  function summaryFixture(): LayoutDocument {
    return {
      version: 1,
      canvas: { width: 210, height: 297 },
      blocks: [
        {
          id: 'blk_summary',
          type: 'summary',
          rect: { x: 15, y: 15, w: 180, h: 30 },
          freedom: 'free',
          sizePolicy: { resizableW: true, resizableH: true, minW: 60, minH: 16 },
          contentRef: { source: 'summary', payload: { summary: '两字' } },
        },
      ],
    };
  }

  it('START_EDIT / END_EDIT 只切视图态，不入栈不置脏', () => {
    const s0 = createInitialState(summaryFixture());
    const s1 = run(s0, { type: 'START_EDIT', id: 'blk_summary' });
    assert.equal(s1.editingId, 'blk_summary');
    // 基线入栈（撤销一次回到编辑前），但不置脏
    assert.equal(s1.past.length, 1);
    assert.equal(s1.dirty, false);
    const s2 = run(s1, { type: 'END_EDIT' });
    assert.equal(s2.editingId, null);
    // 一字未改：基线被弹掉，恢复干净状态
    assert.equal(s2.past.length, 0);
    assert.equal(s2.dirty, false);
  });

  it('UPDATE_CONTENT 更新 payload 并入栈（非编辑会话，如自动修复）', () => {
    const s0 = createInitialState(summaryFixture());
    const s1 = run(s0, {
      type: 'UPDATE_CONTENT',
      id: 'blk_summary',
      payload: { summary: '甲'.repeat(300) },
    });
    assert.equal((s1.doc.blocks[0].contentRef.payload as { summary: string }).summary.length, 300);
    assert.equal(s1.past.length, 1);
    assert.equal(s1.dirty, true);
  });

  it('编辑会话中的连续输入合并为一步历史（撤销一次回到编辑前）', () => {
    const s0 = createInitialState(summaryFixture());
    const before = JSON.stringify(s0.doc.blocks[0].contentRef.payload);
    const s1 = run(
      s0,
      { type: 'START_EDIT', id: 'blk_summary' },
      { type: 'UPDATE_CONTENT', id: 'blk_summary', payload: { summary: '甲' } },
      { type: 'UPDATE_CONTENT', id: 'blk_summary', payload: { summary: '甲甲' } },
      { type: 'UPDATE_CONTENT', id: 'blk_summary', payload: { summary: '甲甲甲' } },
      { type: 'END_EDIT' },
    );
    // 三次输入只压了一步栈
    assert.equal(s1.past.length, 1);
    assert.equal(JSON.stringify(s1.past[0].blocks[0].contentRef.payload), before);
    assert.equal((s1.doc.blocks[0].contentRef.payload as { summary: string }).summary, '甲甲甲');
    // 撤销 → 回到编辑前
    const s2 = run(s1, { type: 'UNDO' });
    assert.equal(JSON.stringify(s2.doc.blocks[0].contentRef.payload), before);
  });

  it('内容变多时块自动长高（只长高不压低）', () => {
    const s0 = createInitialState(summaryFixture());
    const h0 = s0.doc.blocks[0].rect.h;
    const s1 = run(s0, {
      type: 'UPDATE_CONTENT',
      id: 'blk_summary',
      payload: { summary: '甲'.repeat(600) }, // 远超 30mm 容量
    });
    assert.ok(s1.doc.blocks[0].rect.h > h0, '长内容必须长高');
    // 内容变少：保持用户当前高度，不自动压低
    const s2 = run(s1, {
      type: 'UPDATE_CONTENT',
      id: 'blk_summary',
      payload: { summary: '短' },
    });
    assert.equal(s2.doc.blocks[0].rect.h, s1.doc.blocks[0].rect.h);
  });

  it('SELECT_BLOCK 切到别的块时退出编辑；点中正在编辑的块则保持', () => {
    const s0 = createInitialState(fixture());
    const s1 = run(s0, { type: 'START_EDIT', id: 'a' });
    const same = run(s1, { type: 'SELECT_BLOCK', id: 'a' });
    assert.equal(same.editingId, 'a'); // 保持编辑
    const other = run(s1, { type: 'SELECT_BLOCK', id: 'b' });
    assert.equal(other.editingId, null);
    assert.equal(other.selectedId, 'b');
    const blank = run(s1, { type: 'SELECT_BLOCK', id: null });
    assert.equal(blank.editingId, null);
  });

  it('UNDO / REDO / RESET_LAYOUT 退出编辑态（防编辑一个已被替换的块）', () => {
    const s0 = createInitialState(summaryFixture());
    const s1 = run(
      s0,
      { type: 'START_EDIT', id: 'blk_summary' },
      { type: 'UPDATE_CONTENT', id: 'blk_summary', payload: { summary: '改' } },
    );
    assert.equal(s1.editingId, 'blk_summary');
    const s2 = run(s1, { type: 'UNDO' });
    assert.equal(s2.editingId, null);
    const s3 = run(s2, { type: 'START_EDIT', id: 'blk_summary' }, { type: 'RESET_LAYOUT' });
    assert.equal(s3.editingId, null);
  });
});

describe('layoutReducer: 移动端排序（REORDER_BLOCK）', () => {
  function sortFixture(): LayoutDocument {
    const mk = (id: string, h: number) => ({
      id,
      type: 'item' as const,
      rect: { x: 15, y: 0, w: 180, h },
      freedom: 'free' as const,
      sizePolicy: { resizableW: true, resizableH: true, minW: 60, minH: 8 },
      contentRef: { source: `experience[0]`, payload: {} },
    });
    return {
      version: 1,
      canvas: { width: 210, height: 297 },
      gap: 4,
      blocks: [mk('a', 10), mk('b', 20), mk('c', 30)],
    };
  }

  it('重排入栈、置脏、可撤销', () => {
    const s0 = createInitialState(sortFixture());
    const s1 = run(s0, { type: 'REORDER_BLOCK', activeId: 'a', overId: 'c' });
    assert.deepEqual(s1.doc.blocks.map((b) => b.id), ['b', 'c', 'a']);
    assert.equal(s1.past.length, 1);
    assert.equal(s1.dirty, true);
    const s2 = run(s1, { type: 'UNDO' });
    assert.deepEqual(s2.doc.blocks.map((b) => b.id), ['a', 'b', 'c']);
  });

  it('无变化（同一块/id 不存在）原样返回，不污染历史', () => {
    const s0 = createInitialState(sortFixture());
    assert.equal(run(s0, { type: 'REORDER_BLOCK', activeId: 'a', overId: 'a' }), s0);
    assert.equal(run(s0, { type: 'REORDER_BLOCK', activeId: 'zz', overId: 'a' }), s0);
  });

  it('重排时退出编辑态', () => {
    const s0 = createInitialState(sortFixture());
    const s1 = run(s0, { type: 'START_EDIT', id: 'a' });
    const s2 = run(s1, { type: 'REORDER_BLOCK', activeId: 'a', overId: 'b' });
    assert.equal(s2.editingId, 'a'); // REORDER 不动编辑态（与移动端流程无冲突）
  });
});

describe('layoutReducer: 多页操作', () => {
  function pageFixture(): LayoutDocument {
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
      blocks: [mk('a', 0, 15), mk('b', 0, 29), mk('c', 1, 15)],
    };
  }

  it('MOVE_BLOCK_TO_PAGE：换页 + 视图切到目标页 + 可撤销', () => {
    const s0 = createInitialState(pageFixture());
    const s1 = run(s0, { type: 'MOVE_BLOCK_TO_PAGE', id: 'a', targetPage: 1 });
    const a = s1.doc.blocks.find((b) => b.id === 'a')!;
    assert.equal(a.page, 1);
    assert.equal(a.rect.y, 29); // c(15+10) + gap 4
    assert.equal(s1.activePage, 1);
    assert.equal(s1.dirty, true);
    const s2 = run(s1, { type: 'UNDO' });
    assert.equal(s2.doc.blocks.find((b) => b.id === 'a')!.page, 0);
  });

  it('MOVE_BLOCK_TO_PAGE：同页 / 越界原样返回（不入栈）', () => {
    const s0 = createInitialState(pageFixture());
    assert.equal(run(s0, { type: 'MOVE_BLOCK_TO_PAGE', id: 'a', targetPage: 0 }), s0);
    assert.equal(run(s0, { type: 'MOVE_BLOCK_TO_PAGE', id: 'a', targetPage: 5 }), s0);
  });

  it('ADD_PAGE：页数 +1 且视图切到新页，可撤销', () => {
    const s0 = createInitialState(pageFixture());
    const s1 = run(s0, { type: 'ADD_PAGE' });
    assert.equal(s1.doc.pageCount, 3);
    assert.equal(s1.activePage, 2);
    const s2 = run(s1, { type: 'UNDO' });
    assert.equal(s2.doc.pageCount, 2);
  });

  it('REMOVE_PAGE：删空页后续页号前移；非空页删不动', () => {
    const s0 = createInitialState(pageFixture());
    // pageCount=2 但只有 page 0/1 有块，没有空页可删 → 原样
    assert.equal(run(s0, { type: 'REMOVE_PAGE', page: 0 }), s0);
    // 追加空页后再删
    const s1 = run(s0, { type: 'ADD_PAGE' }); // pageCount=3，第 2 页空
    const s2 = run(s1, { type: 'REMOVE_PAGE', page: 2 });
    assert.equal(s2.doc.pageCount, 2);
    assert.equal(s2.activePage, 1); // 从第 2 页（已删）钳回第 1 页
  });

  it('SET_PAGE：纯视图态，不入栈不置脏；越界钳制', () => {
    const s0 = createInitialState(pageFixture());
    const s1 = run(s0, { type: 'SET_PAGE', page: 1 });
    assert.equal(s1.activePage, 1);
    assert.equal(s1.past.length, 0);
    assert.equal(s1.dirty, false);
    assert.equal(run(s0, { type: 'SET_PAGE', page: 9 }).activePage, 1);
  });

  it('createInitialState：旧文档（无 page/pageCount）自动补齐为单页', () => {
    const legacy = {
      version: 1,
      canvas: { width: 210, height: 297 },
      blocks: [
        {
          id: 'a',
          type: 'item' as const,
          rect: { x: 15, y: 15, w: 180, h: 10 },
          freedom: 'free' as const,
          sizePolicy: { resizableW: true, resizableH: true, minW: 60, minH: 8 },
          contentRef: { source: 'experience[0]', payload: {} },
        },
      ],
    };
    const s0 = createInitialState(legacy);
    assert.equal(s0.doc.pageCount, 1);
    assert.equal(s0.activePage, 0);
    assert.equal(s0.dirty, false);
  });

  it('UNDO 到更少页数时 activePage 钳制不越界', () => {
    const s0 = createInitialState(pageFixture());
    const s1 = run(s0, { type: 'ADD_PAGE' }, { type: 'SET_PAGE', page: 2 }); // 3 页，停在第 2 页
    assert.equal(s1.activePage, 2);
    const s2 = run(s1, { type: 'UNDO' }); // 撤销 ADD_PAGE → 回到 2 页
    assert.equal(s2.activePage, 1);
  });
});

describe('layoutReducer: 模板切换（APPLY_TEMPLATE）', () => {
  /** 已归一化的经典布局（块带 page、文档带 template），用于幂等短路断言 */
  function templatedFixture(): LayoutDocument {
    return {
      version: 1,
      canvas: { width: 210, height: 297 },
      gap: 4,
      pageCount: 1,
      template: 'classic',
      blocks: [
        {
          id: 'a',
          type: 'item',
          page: 0,
          rect: { x: 15, y: 15, w: 180, h: 10 },
          freedom: 'free',
          sizePolicy: { resizableW: true, resizableH: true, minW: 60, minH: 8 },
          contentRef: { source: 'test' },
        },
      ],
    };
  }

  it('切换模板：几何重建、template 写入、入栈并置脏', () => {
    const s0 = createInitialState(templatedFixture());
    assert.equal(s0.doc.template, 'classic');
    const s1 = run(s0, { type: 'APPLY_TEMPLATE', templateId: 'sidebar' });
    assert.equal(s1.doc.template, 'sidebar');
    assert.equal(s1.doc.gap, 3);
    assert.equal(s1.doc.blocks[0].rect.x, 82); // 主栏 x
    assert.equal(s1.doc.blocks[0].rect.w, 114);
    assert.equal(s1.past.length, 1);
    assert.equal(s1.dirty, true);
  });

  it('切到当前模板（classic → classic）短路：不入栈、不置脏', () => {
    const s0 = createInitialState(templatedFixture());
    const s1 = run(s0, { type: 'APPLY_TEMPLATE', templateId: 'classic' });
    assert.equal(s1, s0);
  });

  it('UNDO 可回到切换前的几何', () => {
    const s0 = createInitialState(templatedFixture());
    const s1 = run(s0, { type: 'APPLY_TEMPLATE', templateId: 'elegant' });
    assert.equal(s1.doc.blocks[0].rect.x, 20);
    const s2 = run(s1, { type: 'UNDO' });
    assert.equal(s2.doc.template, 'classic');
    assert.equal(s2.doc.blocks[0].rect.x, 15);
  });

  it('切换后视图回第 1 页（几何与页数全变，不停在陌生页）', () => {
    const s0 = createInitialState(templatedFixture());
    const s1 = run(s0, { type: 'ADD_PAGE' }, { type: 'SET_PAGE', page: 1 });
    assert.equal(s1.activePage, 1);
    const s2 = run(s1, { type: 'APPLY_TEMPLATE', templateId: 'compact' });
    assert.equal(s2.activePage, 0);
  });

  it('createInitialState：旧文档无 template → 补 classic', () => {
    const s0 = createInitialState(fixture());
    assert.equal(s0.doc.template, 'classic');
    assert.equal(s0.initialDoc.template, 'classic');
    assert.equal(s0.dirty, false);
  });
});
