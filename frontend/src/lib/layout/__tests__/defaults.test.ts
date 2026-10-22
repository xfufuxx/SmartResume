/**
 * defaults.ts 单测 —— 类型默认参数表的完整性与不可变性。
 * 运行：npm test（node --test 原生 TS）
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_FREEDOM,
  DEFAULT_SIZE_POLICY,
  auditDefaults,
  defaultsForType,
  defaultsForTypeClone,
} from '../defaults.ts';
import { BLOCK_TYPES, DRAG_FREEDOMS } from '../types.ts';

describe('defaults: 表完整性', () => {
  it('auditDefaults 无问题', () => {
    const result = auditDefaults();
    assert.equal(result.ok, true, result.problems.join('; '));
  });

  it('两张表完整覆盖 BLOCK_TYPES', () => {
    for (const type of BLOCK_TYPES) {
      assert.ok(DEFAULT_FREEDOM[type], `missing freedom for ${type}`);
      assert.ok(DEFAULT_SIZE_POLICY[type], `missing sizePolicy for ${type}`);
    }
  });

  it('freedom 取值都在 DRAG_FREEDOMS 内', () => {
    for (const type of BLOCK_TYPES) {
      assert.ok(
        DRAG_FREEDOMS.includes(DEFAULT_FREEDOM[type]),
        `${type}: ${DEFAULT_FREEDOM[type]}`,
      );
    }
  });

  it('最小尺寸均为正数', () => {
    for (const type of BLOCK_TYPES) {
      const sp = DEFAULT_SIZE_POLICY[type];
      assert.ok(sp.minW > 0, `${type}.minW`);
      assert.ok(sp.minH > 0, `${type}.minH`);
    }
  });
});

describe('defaults: 分配逻辑与第 1 步确认稿一致', () => {
  it('item / avatar / text 为 free', () => {
    assert.equal(DEFAULT_FREEDOM.item, 'free');
    assert.equal(DEFAULT_FREEDOM.avatar, 'free');
    assert.equal(DEFAULT_FREEDOM.text, 'free');
  });

  it('contact / divider / skill-group 为 horizontal', () => {
    assert.equal(DEFAULT_FREEDOM.contact, 'horizontal');
    assert.equal(DEFAULT_FREEDOM.divider, 'horizontal');
    assert.equal(DEFAULT_FREEDOM['skill-group'], 'horizontal');
  });

  it('header / summary / section 为 vertical', () => {
    assert.equal(DEFAULT_FREEDOM.header, 'vertical');
    assert.equal(DEFAULT_FREEDOM.summary, 'vertical');
    assert.equal(DEFAULT_FREEDOM.section, 'vertical');
  });

  it('section 不可缩放；divider 只能改宽度', () => {
    assert.deepEqual(DEFAULT_SIZE_POLICY.section, {
      resizableW: false,
      resizableH: false,
      minW: 60,
      minH: 6,
    });
    assert.deepEqual(DEFAULT_SIZE_POLICY.divider, {
      resizableW: true,
      resizableH: false,
      minW: 20,
      minH: 1,
    });
  });
});

describe('defaults: 防共享引用', () => {
  it('defaultsForTypeClone 返回深拷贝，改动不污染表', () => {
    const a = defaultsForTypeClone('item');
    a.sizePolicy.minW = 999;
    a.freedom = 'locked';
    const b = defaultsForTypeClone('item');
    assert.equal(b.sizePolicy.minW, 60);
    assert.equal(b.sizePolicy.minH, 16);
    assert.equal(b.freedom, 'free');
    assert.equal(DEFAULT_SIZE_POLICY.item.minW, 60);
  });

  it('defaultsForType 返回表内引用（只读用法）', () => {
    assert.equal(defaultsForType('item').sizePolicy, DEFAULT_SIZE_POLICY.item);
  });
});
