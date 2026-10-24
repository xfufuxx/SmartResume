/**
 * qrcode.ts 单测 —— URL 归一化/校验、链接提取、SVG 生成。
 * 运行：npm test（node --test 原生 TS）
 *
 * 注意：PNG dataURL 依赖浏览器 canvas，Node 无 canvas 包，不在此覆盖
 * （下载路径由 E2E/人工验证）；SVG 是纯 JS 编码，Node 可直跑。
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  QR_DEFAULTS,
  collectResumeLinks,
  extractUrlsFromText,
  generateQrSvg,
  guessLinkLabel,
  isValidQrUrl,
  normalizeUrl,
  qrFileName,
} from '../qrcode.ts';

describe('normalizeUrl', () => {
  it('补全 https 前缀', () => {
    assert.equal(normalizeUrl('github.com/x'), 'https://github.com/x');
    assert.equal(normalizeUrl('  example.com  '), 'https://example.com');
  });
  it('保留已有协议', () => {
    assert.equal(normalizeUrl('http://a.com'), 'http://a.com');
    assert.equal(normalizeUrl('https://a.com'), 'https://a.com');
  });
  it('空串原样返回', () => {
    assert.equal(normalizeUrl(''), '');
    assert.equal(normalizeUrl('   '), '');
  });
});

describe('isValidQrUrl', () => {
  it('空串合法（允许用户中途清空）', () => {
    assert.equal(isValidQrUrl(''), true);
  });
  it('常见域名合法', () => {
    assert.equal(isValidQrUrl('github.com/x'), true);
    assert.equal(isValidQrUrl('https://blog.example.com/path?q=1'), true);
    assert.equal(isValidQrUrl('http://localhost:3000'), true);
    assert.equal(isValidQrUrl('192.168.1.1'), true);
  });
  it('缺 TLD / 非 http 协议非法', () => {
    assert.equal(isValidQrUrl('not a url'), false);
    assert.equal(isValidQrUrl('javascript:alert(1)'), false);
    assert.equal(isValidQrUrl('ftp://a.com'), false);
  });
});

describe('extractUrlsFromText', () => {
  it('抓取多个链接并去重', () => {
    const text = '项目见 https://github.com/a/b ，博客 blog.csdn.net/c 和 https://github.com/a/b 重复';
    const urls = extractUrlsFromText(text);
    assert.equal(urls.length, 1); // 第二个缺协议，不匹配 http(s) 正则
    assert.equal(urls[0], 'https://github.com/a/b');
  });
  it('剥离句读尾缀', () => {
    assert.deepEqual(extractUrlsFromText('参考 https://example.com。'), ['https://example.com']);
  });
  it('空文本返回空数组', () => {
    assert.deepEqual(extractUrlsFromText(''), []);
  });
});

describe('collectResumeLinks', () => {
  it('递归收集嵌套结构中的链接', () => {
    const resume = {
      personal_info: { name: '张三' },
      projects: [{ name: 'P1', points: ['源码 https://github.com/a/b'] }],
      summary: '博客 https://blog.example.com',
    };
    const links = collectResumeLinks(resume);
    assert.equal(links.length, 2);
    assert.equal(links[0].url, 'https://github.com/a/b');
    assert.equal(links[1].url, 'https://blog.example.com');
  });
  it('大小写去重', () => {
    const links = collectResumeLinks({ a: 'https://x.com/1', b: 'https://X.com/1' });
    assert.equal(links.length, 1);
  });
  it('null/undefined 安全', () => {
    assert.deepEqual(collectResumeLinks(null), []);
    assert.deepEqual(collectResumeLinks(undefined), []);
  });
});

describe('guessLinkLabel', () => {
  it('识别常见站点', () => {
    assert.equal(guessLinkLabel('https://github.com/x'), 'GitHub');
    assert.equal(guessLinkLabel('https://www.linkedin.com/in/x'), 'LinkedIn');
    assert.equal(guessLinkLabel('https://blog.csdn.net/x'), 'CSDN 博客');
  });
  it('未知站点取主机名首段大写', () => {
    assert.equal(guessLinkLabel('https://my-site.com/x'), 'My-site');
  });
  it('非法 URL 兜底', () => {
    assert.equal(guessLinkLabel('@@@'), '链接');
  });
});

describe('qrFileName', () => {
  it('PNG/SVG 后缀与主机名', () => {
    assert.equal(qrFileName('https://github.com/x', 'png'), 'qrcode-github.com.png');
    assert.equal(qrFileName('https://github.com/x', 'svg'), 'qrcode-github.com.svg');
  });
  it('非法 URL 用默认名', () => {
    assert.equal(qrFileName('@@@', 'png'), 'qrcode.png');
  });
});

describe('generateQrSvg', () => {
  it('生成合法 SVG（含 viewBox 与路径）', async () => {
    const svg = await generateQrSvg('https://example.com');
    assert.match(svg, /^<svg/);
    assert.match(svg, /viewBox/);
    assert.match(svg, /<path/);
  });
  it('尊重尺寸与颜色选项', async () => {
    const svg = await generateQrSvg('https://example.com', {
      size: 120,
      dark: '#ff0000',
      light: '#eeeeee',
      margin: 2,
      errorCorrection: 'H',
    });
    assert.match(svg, /width="120"/);
    assert.match(svg, /#ff0000/);
    assert.match(svg, /#eeeeee/);
  });
  it('同一 URL 输出稳定（确定性）', async () => {
    const a = await generateQrSvg('https://example.com');
    const b = await generateQrSvg('https://example.com');
    assert.equal(a, b);
  });
  it('不同 URL 输出不同', async () => {
    const a = await generateQrSvg('https://example.com/a');
    const b = await generateQrSvg('https://example.com/b');
    assert.notEqual(a, b);
  });
  it('非法 URL 抛错', async () => {
    await assert.rejects(() => generateQrSvg('javascript:alert(1)'), /URL 不合法/);
  });
  it('缺省配置可用', async () => {
    const svg = await generateQrSvg('example.com');
    assert.match(svg, new RegExp(`width="${QR_DEFAULTS.size}"`));
  });
});
