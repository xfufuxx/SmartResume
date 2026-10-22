import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isLayoutDocument, migrateLayout, parseLayout, serializeLayout } from '../serialize.ts';
import { CANVAS_MM, LAYOUT_VERSION } from '../types.ts';
import type { Block, LayoutDocument } from '../types.ts';

function makeBlock(id: string): Block {
  return {
    id,
    type: 'item',
    rect: { x: 15, y: 88, w: 180, h: 30 },
    freedom: 'free',
    sizePolicy: { resizableW: false, resizableH: true, minW: 40, minH: 12 },
    contentRef: { source: 'experience[0]', payload: { company: 'A' } },
  };
}

function makeDoc(overrides: Partial<LayoutDocument> = {}): LayoutDocument {
  return {
    version: LAYOUT_VERSION,
    canvas: { ...CANVAS_MM },
    blocks: [makeBlock('blk_exp_0'), makeBlock('blk_exp_1')],
    view: { zoom: 1, gridSnap: false, alignAssist: true },
    updatedAt: '2026-10-20T12:00:00.000Z',
    ...overrides,
  };
}

describe('serialize / parse 往返', () => {
  it('JSON 字符串往返后深度相等', () => {
    const doc = makeDoc();
    assert.deepEqual(parseLayout(serializeLayout(doc)), doc);
  });

  it('parseLayout 直接接受已 parse 的对象', () => {
    assert.deepEqual(parseLayout(makeDoc()), makeDoc());
  });

  it('空 blocks 数组也是合法文档', () => {
    const doc = makeDoc({ blocks: [] });
    assert.deepEqual(parseLayout(serializeLayout(doc)), doc);
  });
});

describe('parseLayout 形状校验（不可信输入一律 null）', () => {
  it('非 JSON 字符串', () => {
    assert.equal(parseLayout('{not json'), null);
  });

  it('null / 数组 / 空对象 / 数字', () => {
    assert.equal(parseLayout(null), null);
    assert.equal(parseLayout([]), null);
    assert.equal(parseLayout({}), null);
    assert.equal(parseLayout(42), null);
  });

  it('blocks 缺 rect', () => {
    const bad = makeDoc();
    (bad.blocks[0] as unknown as { rect: unknown }).rect = undefined;
    assert.equal(parseLayout(bad), null);
  });

  it('block type 非法', () => {
    const bad = makeDoc();
    (bad.blocks[0] as unknown as { type: string }).type = 'carousel';
    assert.equal(parseLayout(bad), null);
  });

  it('freedom 非法', () => {
    const bad = makeDoc();
    (bad.blocks[0] as unknown as { freedom: string }).freedom = 'diagonal';
    assert.equal(parseLayout(bad), null);
  });

  it('rect 宽高为 0 拒绝（退化矩形）', () => {
    const bad = makeDoc();
    bad.blocks[0].rect.w = 0;
    assert.equal(parseLayout(bad), null);
  });

  it('canvas 尺寸非正数拒绝', () => {
    const bad = makeDoc();
    (bad as unknown as { canvas: unknown }).canvas = { width: 0, height: 297 };
    assert.equal(parseLayout(bad), null);
  });

  it('version 过新 → null（无法降级，回退默认布局）', () => {
    assert.equal(parseLayout(makeDoc({ version: LAYOUT_VERSION + 1 })), null);
  });

  it('存在但缺迁移函数的旧版本 → null（回退默认布局）', () => {
    assert.equal(parseLayout(makeDoc({ version: 0 })), null);
  });
});

describe('isLayoutDocument', () => {
  it('合法文档为真', () => {
    assert.equal(isLayoutDocument(makeDoc()), true);
  });

  it('缺 sizePolicy 为假', () => {
    const bad = makeDoc();
    (bad.blocks[0] as unknown as { sizePolicy: unknown }).sizePolicy = undefined;
    assert.equal(isLayoutDocument(bad), false);
  });

  it('contentRef 缺 source 为假', () => {
    const bad = makeDoc();
    (bad.blocks[0] as unknown as { contentRef: unknown }).contentRef = { path: 'x' };
    assert.equal(isLayoutDocument(bad), false);
  });

  it('id 为空串为假', () => {
    const bad = makeDoc();
    (bad.blocks[0] as unknown as { id: string }).id = '';
    assert.equal(isLayoutDocument(bad), false);
  });

  it('template 可选：缺省合法，非字符串 / 空串非法', () => {
    const ok = makeDoc();
    assert.equal(isLayoutDocument(ok), true); // 旧存档无 template
    const withTpl = makeDoc();
    (withTpl as unknown as { template: string }).template = 'sidebar';
    assert.equal(isLayoutDocument(withTpl), true);
    const bad = makeDoc();
    (bad as unknown as { template: number }).template = 3;
    assert.equal(isLayoutDocument(bad), false);
    const empty = makeDoc();
    (empty as unknown as { template: string }).template = '';
    assert.equal(isLayoutDocument(empty), false);
  });
});

describe('migrateLayout', () => {
  it('当前版本原样返回', () => {
    const doc = makeDoc();
    assert.deepEqual(migrateLayout(doc), doc);
  });

  it('版本过新抛错', () => {
    assert.throws(() => migrateLayout(makeDoc({ version: 99 })), /版本过新/);
  });

  it('缺迁移函数时抛错并说明缺哪一段', () => {
    assert.throws(() => migrateLayout(makeDoc({ version: 0 })), /缺少 v0 → v1 的迁移函数/);
  });
});
