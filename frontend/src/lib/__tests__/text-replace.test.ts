/**
 * text-replace.ts 单测 —— 润色建议应用到简历 JSON。
 * 运行：npm test（node --test 原生 TS）
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { countTextInJson, replaceTextInJson } from '../text-replace.ts';

const RESUME: Record<string, unknown> = {
  personal_info: { name: '李明', email: 'liming@example.com', phone: '13800138000' },
  summary: '五年前端经验，负责多个系统建设',
  experience: [
    { company: '星辰科技', title: '高级工程师', points: ['负责订单系统架构设计', '带 3 人团队'] },
    { company: '云帆软件', title: '工程师', points: ['参与 OA 系统开发'] },
  ],
  education: [{ school: '华中科技大学', degree: '本科', major: '计算机' }],
  skills: ['Python', 'FastAPI'],
};

const exp = (json: Record<string, unknown>) => json.experience as Array<{ points: string[] }>;

describe('replaceTextInJson', () => {
  it('替换嵌套数组中的字符串', () => {
    const out = replaceTextInJson(RESUME, '负责订单系统架构设计', '主导订单系统架构设计与演进，支撑日订单 50 万+');
    assert.equal(out.replaced, 1);
    assert.equal(exp(out.json)[0].points[0], '主导订单系统架构设计与演进，支撑日订单 50 万+');
  });

  it('原文不存在时 replaced=0 且内容不变', () => {
    const out = replaceTextInJson(RESUME, '不存在的原文', '新文本');
    assert.equal(out.replaced, 0);
    assert.deepEqual(out.json, RESUME);
  });

  it('同一字符串内多处出现全部替换', () => {
    const doc: Record<string, unknown> = { text: '很好很好很好' };
    const out = replaceTextInJson(doc, '很好', '出色');
    assert.equal(out.replaced, 1); // 按字段计数
    assert.equal(out.json.text, '出色出色出色');
  });

  it('多个字段命中分别计数', () => {
    const doc = { a: '负责系统', b: { c: '负责系统' } };
    const out = replaceTextInJson(doc, '负责系统', '主导系统');
    assert.equal(out.replaced, 2);
  });

  it('身份字段受保护（email/phone/id 不被替换）', () => {
    const doc: Record<string, unknown> = {
      personal_info: { email: 'a@b.com', phone: '13800000000' },
      items: [{ id: 'x-1', url: 'https://a.com', description: '负责系统' }],
    };
    const out = replaceTextInJson(doc, 'a@b.com', 'hacked@evil.com');
    assert.equal(out.replaced, 0);
    assert.equal((out.json.personal_info as Record<string, unknown>).email, 'a@b.com');
    // 同批替换 URL 也不生效
    const out2 = replaceTextInJson(doc, 'https://a.com', 'https://evil.com');
    assert.equal(out2.replaced, 0);
    assert.equal((out2.json.items as Array<Record<string, unknown>>)[0].url, 'https://a.com');
    // 非保护字段正常替换
    const out3 = replaceTextInJson(doc, '负责系统', '主导系统');
    assert.equal(out3.replaced, 1);
    assert.equal((out3.json.items as Array<Record<string, unknown>>)[0].description, '主导系统');
  });

  it('不改入参（不可变）', () => {
    const before = JSON.stringify(RESUME);
    replaceTextInJson(RESUME, '负责订单系统架构设计', '新文本');
    assert.equal(JSON.stringify(RESUME), before);
  });

  it('null/undefined 根安全', () => {
    assert.deepEqual(replaceTextInJson(null, 'a', 'b').json, {});
    assert.equal(replaceTextInJson(null, 'a', 'b').replaced, 0);
  });
});

describe('countTextInJson', () => {
  it('统计出现次数', () => {
    assert.equal(countTextInJson(RESUME, '负责订单系统架构设计'), 1);
    assert.equal(countTextInJson(RESUME, '负责'), 2); // summary 与 experience 各一处
    assert.equal(countTextInJson(RESUME, '不存在'), 0);
    assert.equal(countTextInJson(RESUME, ''), 0);
  });
  it('保护字段不计入', () => {
    assert.equal(countTextInJson(RESUME, 'liming@example.com'), 0);
  });
});
