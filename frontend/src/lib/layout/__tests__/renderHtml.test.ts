/**
 * renderHtml.ts 单测 —— 预览/导出共享渲染器。
 * 运行：npm test（node --test 原生 TS）
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Block, LayoutDocument } from '../types.ts';
import { LAYOUT_VERSION } from '../types.ts';
import {
  BLOCK_CSS,
  blockContentStyleString,
  blockInnerHtml,
  layoutBodyHtml,
} from '../renderHtml.ts';

function block(overrides: Partial<Block> & Pick<Block, 'id' | 'type'>): Block {
  return {
    rect: { x: 15, y: 20, w: 180, h: 10 },
    freedom: 'free',
    sizePolicy: { resizableW: true, resizableH: true, minW: 30, minH: 8 },
    contentRef: { source: '', payload: null },
    ...overrides,
  } as Block;
}

describe('renderHtml: HTML 转义', () => {
  it('转义 < > & " \' 五种字符', () => {
    const html = blockInnerHtml(
      block({ id: 't', type: 'text', contentRef: { source: '', payload: '<script>alert("x")&\'' } }),
    );
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(html.includes('&amp;'));
    assert.ok(html.includes('&#39;'));
  });

  it('换行转 <br>（摘要类长文本）', () => {
    const html = blockInnerHtml(
      block({ id: 's', type: 'summary', contentRef: { source: 'summary', payload: { summary: '第一行\n第二行' } } }),
    );
    assert.ok(html.includes('第一行<br>第二行'));
  });
});

describe('renderHtml: 各类型内容', () => {
  it('header 渲染姓名', () => {
    const html = blockInnerHtml(
      block({ id: 'h', type: 'header', contentRef: { source: 'personal_info.name', payload: { name: '张三' } } }),
    );
    assert.ok(html.includes('class="lk-name"'));
    assert.ok(html.includes('张三'));
  });

  it('contact 渲染 email/phone，缺省字段跳过', () => {
    const html = blockInnerHtml(
      block({ id: 'c', type: 'contact', contentRef: { source: 'personal_info', payload: { phone: '13800000000' } } }),
    );
    assert.ok(html.includes('13800000000'));
    assert.ok(!html.includes('span></span')); // 无空 span
  });

  it('divider 渲染分隔线', () => {
    const html = blockInnerHtml(block({ id: 'd', type: 'divider', contentRef: { source: '', payload: null } }));
    assert.equal(html, '<div class="lk-divider"></div>');
  });

  it('section 标题由 source 派生', () => {
    const html = blockInnerHtml(
      block({ id: 's', type: 'section', contentRef: { source: 'experience', payload: { count: 2 } } }),
    );
    assert.ok(html.includes('工作经历'));
  });

  it('item（experience）渲染 title @ company + 周期 + 要点', () => {
    const html = blockInnerHtml(
      block({
        id: 'e',
        type: 'item',
        contentRef: {
          source: 'experience[0]',
          payload: { title: '高级工程师', company: '甲公司', start: '2020', end: '2023', points: ['负责架构'] },
        },
      }),
    );
    assert.ok(html.includes('高级工程师 @ 甲公司'));
    assert.ok(html.includes('2020 - 2023'));
    assert.ok(html.includes('<ul class="lk-points"><li>负责架构</li></ul>'));
  });

  it('item（education）渲染学校 + 学位专业 + 周期', () => {
    const html = blockInnerHtml(
      block({
        id: 'ed',
        type: 'item',
        contentRef: {
          source: 'education[0]',
          payload: { school: '某大学', degree: '本科', major: '计算机', start: '2016', end: '2020' },
        },
      }),
    );
    assert.ok(html.includes('某大学'));
    assert.ok(html.includes('本科 - 计算机 | 2016 - 2020'));
    assert.ok(!html.includes('lk-points')); // 教育条目不渲染要点列表
  });

  it('item（projects）渲染名称 + 技术栈', () => {
    const html = blockInnerHtml(
      block({
        id: 'p',
        type: 'item',
        contentRef: {
          source: 'projects[0]',
          payload: { name: '项目A', tech: ['React', 'Node'], description: '一个项目' },
        },
      }),
    );
    assert.ok(html.includes('项目A'));
    assert.ok(html.includes('技术栈：React、Node'));
    assert.ok(html.includes('一个项目'));
  });

  it('skill-group 渲染标签', () => {
    const html = blockInnerHtml(
      block({ id: 'sk', type: 'skill-group', contentRef: { source: 'skills', payload: { skills: ['TS', 'React'] } } }),
    );
    assert.ok(html.includes('<span class="lk-tag">TS</span>'));
    assert.ok(html.includes('<span class="lk-tag">React</span>'));
  });

  it('avatar 无图时渲染占位', () => {
    const html = blockInnerHtml(block({ id: 'a', type: 'avatar', contentRef: { source: 'personal_info.avatar', payload: {} } }));
    assert.ok(html.includes('lk-avatar-empty'));
  });
});

describe('renderHtml: 样式覆盖', () => {
  it('BlockStyle → inline style 字符串', () => {
    const s = blockContentStyleString(
      block({
        id: 'x',
        type: 'text',
        style: { fontSizePt: 12, fontWeight: 700, color: '#ff0000', align: 'center' },
      }),
    );
    assert.equal(s, ' style="font-size:12pt;font-weight:700;color:#ff0000;text-align:center"');
  });

  it('无样式时返回空串', () => {
    assert.equal(blockContentStyleString(block({ id: 'x', type: 'text' })), '');
  });
});

describe('renderHtml: layoutBodyHtml', () => {
  const doc: LayoutDocument = {
    version: LAYOUT_VERSION,
    canvas: { width: 210, height: 297 },
    blocks: [
      block({ id: 'blk_header', type: 'header', rect: { x: 15, y: 15, w: 180, h: 14 }, contentRef: { source: 'personal_info.name', payload: { name: '张三' } } }),
      block({ id: 'blk_hidden', type: 'text', rect: { x: 15, y: 40, w: 180, h: 10 }, visible: false, contentRef: { source: '', payload: '隐藏内容' } }),
      block({ id: 'blk_skills', type: 'skill-group', rect: { x: 15, y: 60, w: 180, h: 20 }, contentRef: { source: 'skills', payload: { skills: ['TS'] } } }),
    ],
  };

  it('结构 = .lk-page > .lk-blk(.lk-blk-content > 内容)，mm 定位', () => {
    const html = layoutBodyHtml(doc);
    // 多页后每页一个 .lk-page（带 data-page 页码标记）
    assert.ok(html.startsWith('<div class="lk-page" data-page="0" data-template="classic">'));
    assert.ok(html.includes('style="left:15mm;top:15mm;width:180mm;height:14mm"'));
    assert.ok(html.includes('class="lk-blk lk-header" data-block-id="blk_header"'));
    assert.ok(html.includes('<div class="lk-blk-content">'));
  });

  it('visible=false 的块整体跳过', () => {
    const html = layoutBodyHtml(doc);
    assert.ok(!html.includes('blk_hidden'));
    assert.ok(!html.includes('隐藏内容'));
  });

  it('块顺序 = z 序（数组序）', () => {
    const html = layoutBodyHtml(doc);
    assert.ok(html.indexOf('blk_header') < html.indexOf('blk_skills'));
  });

  it('不含任何编辑器 chrome（选区/手柄/参考线 class）', () => {
    const html = layoutBodyHtml(doc);
    for (const chrome of ['is-selected', 'is-overlapping', 'lk-handle', 'le-guide', 'le-grid']) {
      assert.ok(!html.includes(chrome), `导出 HTML 不应包含 ${chrome}`);
    }
  });
});

describe('renderHtml: BLOCK_CSS', () => {
  it('包含页面定位与各类型排版规则', () => {
    assert.ok(BLOCK_CSS.includes('.lk-page'));
    assert.ok(BLOCK_CSS.includes('width:210mm'));
    assert.ok(BLOCK_CSS.includes('.lk-section-title'));
    assert.ok(BLOCK_CSS.includes('.lk-tag'));
    assert.ok(BLOCK_CSS.includes('position:absolute'));
  });

  it('不含编辑器 chrome 规则', () => {
    for (const chrome of ['is-selected', 'lk-handle', 'le-guide']) {
      assert.ok(!BLOCK_CSS.includes(chrome));
    }
  });
});

describe('renderHtml: 多页导出', () => {
  function blk(id: string, page: number, y: number) {
    return {
      id,
      type: 'item' as const,
      page,
      rect: { x: 15, y, w: 180, h: 10 },
      freedom: 'free' as const,
      sizePolicy: { resizableW: true, resizableH: true, minW: 60, minH: 8 },
      contentRef: { source: 'experience[0]', payload: { title: 'T' } },
    };
  }

  it('按页输出多个 .lk-page，data-page 标记页码', () => {
    const doc: LayoutDocument = {
      version: 1,
      canvas: { width: 210, height: 297 },
      pageCount: 2,
      blocks: [blk('a', 0, 15), blk('b', 1, 15), blk('c', 0, 29)],
    };
    const html = layoutBodyHtml(doc);
    assert.equal(html.match(/class="lk-page"/g)?.length, 2);
    assert.ok(html.includes('data-page="0"'));
    assert.ok(html.includes('data-page="1"'));
    // 第 0 页含 a/c，第 1 页含 b
    const page0 = html.slice(html.indexOf('data-page="0"'), html.indexOf('data-page="1"'));
    assert.ok(page0.includes('data-block-id="a"'));
    assert.ok(page0.includes('data-block-id="c"'));
    assert.ok(!page0.includes('data-block-id="b"'));
  });

  it('空页也输出（页数与 pageCount 一致）', () => {
    const doc: LayoutDocument = {
      version: 1,
      canvas: { width: 210, height: 297 },
      pageCount: 3,
      blocks: [blk('a', 0, 15)],
    };
    const html = layoutBodyHtml(doc);
    assert.equal(html.match(/class="lk-page"/g)?.length, 3);
  });

  it('隐藏块不出现在任何页', () => {
    const doc: LayoutDocument = {
      version: 1,
      canvas: { width: 210, height: 297 },
      pageCount: 2,
      blocks: [blk('a', 0, 15), { ...blk('h', 0, 29), visible: false }],
    };
    const html = layoutBodyHtml(doc);
    assert.ok(!html.includes('data-block-id="h"'));
  });

  it('单页旧文档（无 page 字段）输出 1 个 .lk-page', () => {
    const doc: LayoutDocument = {
      version: 1,
      canvas: { width: 210, height: 297 },
      blocks: [
        {
          id: 'a',
          type: 'item',
          rect: { x: 15, y: 15, w: 180, h: 10 },
          freedom: 'free',
          sizePolicy: { resizableW: true, resizableH: true, minW: 60, minH: 8 },
          contentRef: { source: 'experience[0]', payload: { title: 'T' } },
        },
      ],
    };
    const html = layoutBodyHtml(doc);
    assert.equal(html.match(/class="lk-page"/g)?.length, 1);
  });

  it('BLOCK_CSS 含打印分页规则且末页不补分页符', () => {
    assert.ok(BLOCK_CSS.includes('page-break-after:always'));
    assert.ok(BLOCK_CSS.includes('.lk-page:last-child'));
    assert.ok(BLOCK_CSS.includes('break-inside:avoid'));
  });
});
