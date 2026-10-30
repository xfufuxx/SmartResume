/**
 * 排版模式二维码块单测 —— buildLayout 生成 / ensureQrCodeBlock 补齐 /
 * qrPlacement 落位 / renderHtml 渲染。
 *
 * 背景：模板导出走 qr_footer.py 注入（文档流页脚），排版模式是绝对定位画布，
 * 二维码必须作为独立 block 才能所见即所得——本文件守住这条链路的形状。
 * 运行：npm test（node --test 原生 TS）
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Block, LayoutDocument } from '../types.ts';
import { BLOCK_TYPES, SAFE_MARGIN_MM } from '../types.ts';
import { buildLayout, ensureQrCodeBlock, qrPlacement, type ResumeLike } from '../buildLayout.ts';
import { blockInnerHtml } from '../renderHtml.ts';
import { auditDefaults } from '../defaults.ts';
import { estimateContentHeightMm } from '../estimate.ts';

const QR = { image: 'data:image/png;base64,iVBORw0KGgo=', label: 'Java 后端', url: 'https://a.example.com/me' };

const BASE: ResumeLike = {
  personal_info: { name: '张三', email: 'a@b.com', phone: '13800000000' },
  summary: '五年前端经验',
  experience: [{ title: '高级工程师', company: '甲公司', points: ['负责架构', '主导优化'] }],
  education: [{ school: '某大学', major: '计算机' }],
  skills: ['TypeScript', 'React'],
  projects: [{ name: '项目A', points: ['实现X'] }],
};

function findQr(doc: LayoutDocument): Block | undefined {
  return doc.blocks.find((b) => b.type === 'qrcode');
}

// ── 类型注册 ──

describe('qrcode 块类型注册', () => {
  it('在 BLOCK_TYPES 内且 defaults 覆盖（auditDefaults 全绿）', () => {
    assert.ok(BLOCK_TYPES.includes('qrcode'));
    const audit = auditDefaults();
    assert.equal(audit.ok, true, JSON.stringify(audit.problems));
  });
});

// ── buildLayout ──

describe('buildLayout 二维码块', () => {
  it('有 qr_code 才生成块，且落在内容流最末（项目经历之后）', () => {
    const withQr = buildLayout({ ...BASE, qr_code: QR });
    const qr = findQr(withQr);
    assert.ok(qr, '应生成二维码块');
    assert.equal(qr?.id, 'blk_qrcode');
    assert.equal(qr?.contentRef.source, 'qr_code');
    assert.deepEqual(qr?.contentRef.payload, QR);

    const proj = withQr.blocks.find((b) => b.id === 'blk_proj_0');
    assert.ok(proj && qr!.rect.y > proj.rect.y, '二维码应在项目经历之后');
  });

  it('无 qr_code / image 为空 → 不生成块（空壳只占版面）', () => {
    assert.equal(findQr(buildLayout(BASE)), undefined);
    assert.equal(findQr(buildLayout({ ...BASE, qr_code: { image: '' } })), undefined);
    assert.equal(findQr(buildLayout({ ...BASE, qr_code: null })), undefined);
  });

  it('默认布局开箱合法（不报越界/重叠）', async () => {
    const { validateLayout } = await import('../validate.ts');
    const doc = buildLayout({ ...BASE, qr_code: QR });
    const result = validateLayout(doc);
    const overlaps = result.issues.filter((i) => i.kind === 'overlap');
    assert.equal(overlaps.length, 0, JSON.stringify(overlaps));
  });
});

// ── 旧存档补齐 ──

describe('ensureQrCodeBlock 旧存档补齐', () => {
  it('存档无二维码块 → 补在最后一页内容底部之下', () => {
    const saved = buildLayout(BASE); // 模拟「二维码功能之前」的存档
    assert.equal(findQr(saved), undefined);
    const patched = ensureQrCodeBlock(saved, { ...BASE, qr_code: QR });
    const qr = findQr(patched);
    assert.ok(qr);
    const bottom = saved.blocks
      .filter((b) => (b.page ?? 0) === 0)
      .reduce((m, b) => Math.max(m, b.rect.y + b.rect.h), 0);
    assert.ok(qr!.rect.y >= bottom, '应排在已有内容之下');
    assert.equal(patched.blocks.length, saved.blocks.length + 1);
  });

  it('已有二维码块 → 原样返回（不重复、不覆盖用户摆好的位置）', () => {
    const doc = buildLayout({ ...BASE, qr_code: QR });
    const moved: LayoutDocument = {
      ...doc,
      blocks: doc.blocks.map((b) => (b.type === 'qrcode' ? { ...b, rect: { ...b.rect, x: 120, y: 200 } } : b)),
    };
    assert.equal(ensureQrCodeBlock(moved, { ...BASE, qr_code: QR }), moved);
  });

  it('简历没有二维码 → 原样返回', () => {
    const doc = buildLayout(BASE);
    assert.equal(ensureQrCodeBlock(doc, BASE), doc);
  });

  it('最后一页放不下 → 落到新的一页顶部（绝不叠在内容上）', () => {
    const tall: LayoutDocument = {
      version: 1,
      canvas: { width: 210, height: 297 },
      gap: 4,
      pageCount: 1,
      blocks: [
        {
          id: 'blk_big',
          type: 'text',
          page: 0,
          rect: { x: SAFE_MARGIN_MM, y: SAFE_MARGIN_MM, w: 180, h: 260 },
          freedom: 'free',
          sizePolicy: { resizableW: true, resizableH: true, minW: 10, minH: 8 },
          contentRef: { source: 'text[0]', payload: { text: '很长的内容' } },
        },
      ],
    };
    const patched = ensureQrCodeBlock(tall, { qr_code: QR });
    const qr = findQr(patched);
    assert.equal(qr?.page, 1, '应翻到新页');
    assert.equal(qr?.rect.y, SAFE_MARGIN_MM);
    assert.equal(patched.pageCount, 2);
  });
});

// ── 落位 ──

describe('qrPlacement', () => {
  it('本页放得下 → 内容底部 + gap；放不下 → 新页顶部', () => {
    const doc = buildLayout(BASE);
    const place = qrPlacement(doc, 0);
    assert.equal(place.page, 0);
    assert.ok(place.y > SAFE_MARGIN_MM);
    assert.equal(place.h, 24);

    const full: LayoutDocument = {
      ...doc,
      blocks: [
        ...doc.blocks,
        {
          id: 'blk_fill',
          type: 'text',
          page: 0,
          rect: { x: SAFE_MARGIN_MM, y: 270, w: 180, h: 20 },
          freedom: 'free',
          sizePolicy: { resizableW: true, resizableH: true, minW: 10, minH: 8 },
          contentRef: { source: 'text[0]', payload: { text: 'x' } },
        },
      ],
    };
    const overflow = qrPlacement(full, 0);
    assert.equal(overflow.page, 1);
    assert.equal(overflow.y, SAFE_MARGIN_MM);
  });
});

// ── 渲染 ──

describe('renderHtml 二维码块', () => {
  const block: Block = {
    id: 'blk_qrcode',
    type: 'qrcode',
    rect: { x: 15, y: 200, w: 180, h: 24 },
    freedom: 'free',
    sizePolicy: { resizableW: true, resizableH: true, minW: 15, minH: 15 },
    contentRef: { source: 'qr_code', payload: QR },
  };

  it('输出图片 + 标签 + 链接', () => {
    const html = blockInnerHtml(block);
    assert.ok(html.includes('class="lk-qrcode"'));
    assert.ok(html.includes(`src="${QR.image}"`));
    assert.ok(html.includes('Java 后端'));
    assert.ok(html.includes('https://a.example.com/me'));
  });

  it('内容按 HTML 转义（结构永不被数据破坏）', () => {
    const evil: Block = {
      ...block,
      contentRef: {
        source: 'qr_code',
        payload: { image: QR.image, label: '<img onerror=x>', url: '"><script>y</script>' },
      },
    };
    const html = blockInnerHtml(evil);
    // 转义后只剩无害文本：label 整体转义、URL 的引号被转义，
    // 且 <img 只出现一次（二维码图片本身），没有第二个由数据注入的标签
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;img onerror=x&gt;'));
    assert.ok(html.includes('&quot;&gt;'));
    assert.equal((html.match(/<img/g) ?? []).length, 1);
  });

  it('无图 → 占位框（比空白块更容易发现问题）', () => {
    const empty: Block = { ...block, contentRef: { source: 'qr_code', payload: { label: 'x' } } };
    const html = blockInnerHtml(empty);
    assert.ok(html.includes('lk-qrcode-empty'));
    assert.ok(!html.includes('<img'));
  });

  it('高度估算不判溢出（图按块高缩放）', () => {
    assert.equal(estimateContentHeightMm(block), block.rect.h);
  });
});
