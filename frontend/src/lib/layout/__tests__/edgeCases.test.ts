/**
 * 边界用例单测 —— 空数据 / 脏数据 / 超多块（50+）/ 渲染安全边界。
 * 运行：npm test（node --test 原生 TS）
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Block, LayoutDocument } from '../types.ts';
import { CANVAS_MM } from '../types.ts';
import { buildLayout } from '../buildLayout.ts';
import { isLayoutDocument, parseLayout, serializeLayout } from '../serialize.ts';
import { autoFixLayout, validateLayout } from '../validate.ts';
import {
  BLOCK_CSS,
  blockInnerHtml,
  itemKindOf,
  layoutBodyHtml,
} from '../renderHtml.ts';

function makeBlock(id: string, overrides: Partial<Block> = {}): Block {
  return {
    id,
    type: 'item',
    rect: { x: 15, y: 15, w: 180, h: 16 },
    freedom: 'free',
    sizePolicy: { resizableW: true, resizableH: true, minW: 60, minH: 16 },
    contentRef: { source: 'experience[0]', payload: {} },
    ...overrides,
  };
}

// ============ buildLayout: 脏数据与空值 ============

describe('buildLayout: 脏数据与空值', () => {
  it('各节为 null 时不生成对应块', () => {
    const d = buildLayout({
      personal_info: null,
      summary: null,
      experience: null,
      education: null,
      skills: null,
      projects: null,
    });
    assert.equal(d.blocks.length, 0);
  });

  it('非数组节（字符串/数字）被忽略，不抛错', () => {
    const d = buildLayout({
      experience: 'not-array' as unknown as [],
      skills: 42 as unknown as string[],
      projects: {} as unknown as [],
    });
    assert.equal(d.blocks.length, 0);
  });

  it('空白字符串 name / email / phone 不生成 header/contact', () => {
    const d = buildLayout({ personal_info: { name: '   ', email: '', phone: '\t\n' } });
    assert.equal(d.blocks.length, 0);
  });

  it('只有 phone → contact + divider（name 为空，不生成 header）', () => {
    const d = buildLayout({ personal_info: { phone: '13800000000' } });
    assert.deepEqual(
      d.blocks.map((b) => b.id),
      ['blk_contact', 'blk_divider'],
    );
  });

  it('item 无 points → 最小高度 16mm', () => {
    const d = buildLayout({ experience: [{ title: 'X' }] });
    assert.equal(d.blocks.find((b) => b.id === 'blk_exp_0')!.rect.h, 16);
  });

  it('空字符串数组的技能节不生成块', () => {
    assert.equal(buildLayout({ skills: [] }).blocks.length, 0);
  });

  it('空数组节不生成 section（无标题空块）', () => {
    const d = buildLayout({ experience: [], education: [], projects: [] });
    assert.equal(d.blocks.length, 0);
  });
});

// ============ 超多块（50+）全链路 ============

function hugeResume() {
  return {
    personal_info: { name: '超多块用户', email: 'a@b.com', phone: '13800000000' },
    summary: '内容超出一页的长摘要'.repeat(20),
    experience: Array.from({ length: 16 }, (_, i) => ({
      title: `职位${i}`,
      company: `公司${i}`,
      points: ['要点一', '要点二', '要点三'],
    })),
    education: Array.from({ length: 14 }, (_, i) => ({ school: `学校${i}`, major: '计算机' })),
    skills: Array.from({ length: 30 }, (_, i) => `技能${i}`),
    projects: Array.from({ length: 14 }, (_, i) => ({
      name: `项目${i}`,
      points: ['实现A', '实现B'],
    })),
  };
}

describe('超多块（50+）全链路', () => {
  const doc = buildLayout(hugeResume());

  it('buildLayout 产出超过 50 块且 id 唯一', () => {
    assert.ok(doc.blocks.length > 50, `实际 ${doc.blocks.length} 块`);
    const ids = new Set(doc.blocks.map((b) => b.id));
    assert.equal(ids.size, doc.blocks.length);
  });

  it('serialize 往返不丢块（JSON 字符串形态）', () => {
    const restored = parseLayout(serializeLayout(doc));
    assert.ok(restored);
    assert.equal(restored!.blocks.length, doc.blocks.length);
    assert.equal(JSON.stringify(restored), JSON.stringify(doc));
  });

  it('isLayoutDocument 接受大文档', () => {
    assert.equal(isLayoutDocument(JSON.parse(serializeLayout(doc))), true);
  });

  it('validateLayout 对大文档返回结构化结果（自动分页后零越界）', () => {
    const result = validateLayout(doc);
    // 多页后 buildLayout 已把块分流到各页安全区内：不再有越界问题
    assert.ok(result.issues.every((i) => typeof i.kind === 'string'));
    assert.deepEqual(
      result.issues.filter((i) => i.kind === 'out-of-bounds').map((i) => i.blockIds),
      [],
      '自动分页后不应有越界',
    );
    assert.ok(doc.pageCount! > 1, '大文档必须分页');
    // autoFix 后直接验证几何结果：所有块都收敛在安全区内
    // （不查 issues——兜底钳制自身会记一条 severity:auto 的 out-of-bounds，
    //   含义是「曾越界，已拉回」，不是「仍越界」）
    const fixed = autoFixLayout(doc);
    const stillOut = fixed.doc.blocks.filter((b) => {
      const r = b.rect;
      return r.x < 15 || r.y < 15 || r.x + r.w > 195 || r.y + r.h > 282;
    });
    assert.deepEqual(stillOut.map((b) => b.id), [], 'autoFix 后仍有块越界');
    // 不存在 warn 级的越界（auto 级 = 已自动修好）
    const afterFix = validateLayout(fixed.doc);
    assert.ok(!afterFix.issues.some((i) => i.kind === 'out-of-bounds' && i.severity === 'warn'));
  });

  it('layoutBodyHtml 为每个可见块输出定位与 id', () => {
    const html = layoutBodyHtml(doc);
    for (const b of doc.blocks) {
      assert.ok(html.includes(`data-block-id="${b.id}"`), `缺少 ${b.id}`);
    }
    // mm 单位直出（预览与导出的同一真相）
    assert.ok(html.includes('left:15mm;top:15mm;'));
    assert.ok(html.startsWith('<div class="lk-page" data-page="0" data-template="classic">'));
    assert.ok(html.endsWith('</div>'));
  });

  it('大文档 validate + renderHtml 往返后块数守恒', () => {
    const json = serializeLayout(doc);
    const restored = parseLayout(json)!;
    const visible = restored.blocks.filter((b) => b.visible !== false);
    const html = layoutBodyHtml(restored);
    const matches = html.match(/data-block-id="/g) ?? [];
    assert.equal(matches.length, visible.length);
  });
});

// ============ renderHtml: 转义与空数据 ============

describe('renderHtml: 转义与空数据', () => {
  it('XSS payload 全转义（name / 要点 / 技能 / 图片 src）', () => {
    const b = makeBlock('x', {
      type: 'header',
      contentRef: { source: 'personal_info.name', payload: { name: '<script>alert(1)</script>' } },
    });
    const html = blockInnerHtml(b);
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));

    const item = makeBlock('y', {
      contentRef: {
        source: 'experience[0]',
        payload: { title: '"onmouseover="alert(1)', points: ['<img src=x onerror=alert(1)>'] },
      },
    });
    const itemHtml = blockInnerHtml(item);
    assert.ok(!itemHtml.includes('<img'));
    assert.ok(itemHtml.includes('&lt;img'));

    const skill = makeBlock('z', {
      type: 'skill-group',
      contentRef: { source: 'skills', payload: { skills: ['<b>x</b>'] } },
    });
    assert.ok(!blockInnerHtml(skill).includes('<b>'));

    const avatar = makeBlock('a', {
      type: 'avatar',
      contentRef: { source: 'personal_info.avatar', payload: { url: 'x" onerror="alert(1)' } },
    });
    assert.ok(blockInnerHtml(avatar).includes('&quot;'));
  });

  it('引号属性注入被转义（data-block-id 结构永不被破坏）', () => {
    const b = makeBlock('evil" id="hacked', { type: 'header', contentRef: { source: 'x', payload: {} } });
    const html = layoutBodyHtml({
      version: 1,
      canvas: CANVAS_MM,
      blocks: [b],
    });
    assert.ok(html.includes('data-block-id="evil&quot; id=&quot;hacked"'));
  });

  it('空 payload 的每种类型都不抛错', () => {
    const types: Array<Block['type']> = [
      'header', 'contact', 'avatar', 'divider', 'summary', 'section', 'item', 'skill-group', 'text',
    ];
    for (const type of types) {
      const b = makeBlock(`b-${type}`, { type, contentRef: { source: 'experience[0]', payload: null } });
      assert.doesNotThrow(() => blockInnerHtml(b));
    }
  });

  it('divider 不依赖 payload', () => {
    const b = makeBlock('d', { type: 'divider', contentRef: { source: '', payload: undefined } });
    assert.equal(blockInnerHtml(b), '<div class="lk-divider"></div>');
  });

  it('visible=false 的块被 layoutBodyHtml 跳过（预览导出一致）', () => {
    const doc: LayoutDocument = {
      version: 1,
      canvas: CANVAS_MM,
      blocks: [makeBlock('a'), makeBlock('b', { visible: false })],
    };
    const html = layoutBodyHtml(doc);
    assert.ok(html.includes('data-block-id="a"'));
    assert.ok(!html.includes('data-block-id="b"'));
  });

  it('空 blocks → 空页面壳（单页）', () => {
    const html = layoutBodyHtml({ version: 1, canvas: CANVAS_MM, blocks: [] });
    assert.equal(html, '<div class="lk-page" data-page="0" data-template="classic"></div>');
  });

  it('blocks 数组顺序 = z 序（DOM 顺序与预览一致）', () => {
    const doc: LayoutDocument = {
      version: 1,
      canvas: CANVAS_MM,
      blocks: [makeBlock('bottom'), makeBlock('top')],
    };
    const html = layoutBodyHtml(doc);
    assert.ok(html.indexOf('data-block-id="bottom"') < html.indexOf('data-block-id="top"'));
  });

  it('section 标题从 contentRef.source 派生（中文）', () => {
    const b = makeBlock('s', {
      type: 'section',
      contentRef: { source: 'experience', payload: { count: 3 } },
    });
    assert.ok(blockInnerHtml(b).includes('工作经历'));
  });

  it('itemKindOf 按 source 前缀分流', () => {
    assert.equal(itemKindOf('experience[2]'), 'experience');
    assert.equal(itemKindOf('education[0]'), 'education');
    assert.equal(itemKindOf('projects[1]'), 'projects');
    assert.equal(itemKindOf('whatever'), 'unknown');
  });

  it('BLOCK_CSS 不含编辑器 chrome（选区/手柄/参考线/网格类名）', () => {
    for (const chrome of ['is-selected', 'is-overlapping', 'is-locked', 'lk-handle', 'le-guide', 'le-grid']) {
      assert.ok(!BLOCK_CSS.includes(chrome), `导出 CSS 混入了 chrome：${chrome}`);
    }
  });

  it('BLOCK_CSS 用 mm 单位定义画布与块（物理单位真相）', () => {
    assert.ok(BLOCK_CSS.includes('width:210mm'));
    assert.ok(BLOCK_CSS.includes('height:297mm'));
  });
});
