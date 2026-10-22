/**
 * rebuildContent 单测 —— 布局文档 → 简历内容重组（行内编辑持久化桥梁）。
 * 运行：npm test（node --test 原生 TS）
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Block, LayoutDocument } from '../types.ts';
import { rebuildContent, hasContentChanges, cleanResumeContent, parsePath } from '../rebuildContent.ts';

function block(id: string, type: Block['type'], source: string, payload: unknown, extra: Partial<Block> = {}): Block {
  return {
    id,
    type,
    rect: { x: 15, y: 15, w: 180, h: 10 },
    freedom: 'free',
    sizePolicy: { resizableW: true, resizableH: true, minW: 60, minH: 16 },
    contentRef: { source, payload },
    ...extra,
  };
}

function doc(...blocks: Block[]): LayoutDocument {
  return { version: 1, canvas: { width: 210, height: 297 }, blocks };
}

const BASE = {
  personal_info: { name: '张三', email: 'a@b.c', phone: '138' },
  summary: '旧总结',
  experience: [
    { title: '工程师', company: '甲公司', start: '2020', end: '2023', points: ['旧要点'] },
  ],
  education: [{ school: '某大学', degree: '学士', major: '计算机', start: '2016', end: '2020' }],
  skills: ['旧技能'],
  projects: [] as Array<{ name?: string; role?: string; points?: string[] }>,
};

describe('rebuildContent: 路径解析', () => {
  it('parsePath 处理点号与数组下标', () => {
    assert.deepEqual(parsePath('experience[0].points'), ['experience', '0', 'points']);
    assert.deepEqual(parsePath('personal_info.name'), ['personal_info', 'name']);
    assert.deepEqual(parsePath(''), []);
  });
});

describe('rebuildContent: 回写规则', () => {
  it('item 按 source 路径回写（experience / education / projects）', () => {
    const d = doc(
      block('blk_exp_0', 'item', 'experience[0]', {
        title: '高级工程师', company: '甲公司', start: '2020', end: '2023', points: ['新要点'],
      }),
      block('blk_edu_0', 'item', 'education[0]', {
        school: '新大学', degree: '硕士', major: 'AI', start: '2016', end: '2020',
      }),
      block('blk_proj_0', 'item', 'projects[0]', {
        name: '项目X', role: '负责人', start: '2021', end: '2022', points: ['做了一件事'],
      }),
    );
    const out = rebuildContent(d, BASE) as typeof BASE;
    assert.equal(out.experience[0].title, '高级工程师');
    assert.deepEqual(out.experience[0].points, ['新要点']);
    assert.equal(out.education[0].school, '新大学');
    assert.equal(out.projects[0].name, '项目X');
    assert.equal(out.projects[0].role, '负责人');
  });

  it('summary / skill-group 回写对应顶层键', () => {
    const d = doc(
      block('blk_summary', 'summary', 'summary', { summary: '新总结' }),
      block('blk_skills', 'skill-group', 'skills', { skills: ['React', 'TS'] }),
    );
    const out = rebuildContent(d, BASE) as typeof BASE;
    assert.equal(out.summary, '新总结');
    assert.deepEqual(out.skills, ['React', 'TS']);
  });

  it('header / contact 不回写（personal_info 受后端保护）', () => {
    const d = doc(
      block('blk_header', 'header', 'personal_info.name', { name: '改了的名字', email: 'a@b.c' }),
      block('blk_contact', 'contact', 'personal_info', { email: 'x@y.z', phone: '199' }),
    );
    const out = rebuildContent(d, BASE) as typeof BASE;
    assert.equal(out.personal_info.name, '张三');
    assert.equal(out.personal_info.email, 'a@b.c');
  });

  it('section / divider 跳过（结构块 payload 不是数据）', () => {
    const d = doc(
      block('blk_sec_experience', 'section', 'experience', { count: 1 }),
      block('blk_divider', 'divider', '', null),
    );
    const out = rebuildContent(d, BASE) as typeof BASE;
    assert.equal(out.experience[0].title, '工程师'); // 原样保留
  });

  it('未触碰的字段原样保留；隐藏块的内容也保留', () => {
    const d = doc(
      block('blk_exp_0', 'item', 'experience[0]', { title: '改了', company: '甲公司', start: '2020', end: '2023', points: ['p'] }, { visible: false }),
    );
    const out = rebuildContent(d, BASE) as typeof BASE;
    assert.equal(out.experience[0].title, '改了');
    assert.equal(out.education[0].school, '某大学');
    assert.equal(out.summary, '旧总结');
  });

  it('深拷贝：不修改传入的 base', () => {
    const d = doc(block('blk_exp_0', 'item', 'experience[0]', { title: '改', company: 'x', points: [] }));
    const snapshot = JSON.stringify(BASE);
    rebuildContent(d, BASE);
    assert.equal(JSON.stringify(BASE), snapshot);
  });
});

describe('hasContentChanges', () => {
  it('payload 变了 → true；只改 rect/显隐 → false', () => {
    const d0 = doc(block('blk_summary', 'summary', 'summary', { summary: '旧' }));
    const moved = doc({ ...block('blk_summary', 'summary', 'summary', { summary: '旧' }), rect: { x: 99, y: 15, w: 180, h: 10 } });
    const hidden = doc(block('blk_summary', 'summary', 'summary', { summary: '旧' }, { visible: false }));
    const edited = doc(block('blk_summary', 'summary', 'summary', { summary: '新' }));
    assert.equal(hasContentChanges(d0, d0), false);
    assert.equal(hasContentChanges(moved, d0), false);
    assert.equal(hasContentChanges(hidden, d0), false);
    assert.equal(hasContentChanges(edited, d0), true);
  });

  it('块数量变化 → true', () => {
    const d0 = doc(block('a', 'item', 'experience[0]', { x: 1 }));
    const d1 = doc(block('a', 'item', 'experience[0]', { x: 1 }), block('b', 'item', 'experience[1]', { x: 2 }));
    assert.equal(hasContentChanges(d1, d0), true);
  });
});

describe('cleanResumeContent', () => {
  it('trim 要点、去掉空条目与空技能；未知字段原样', () => {
    const dirty = {
      summary: '总结',
      experience: [
        { title: ' 工程师 ', company: '甲公司', points: ['  要点一  ', '', '   '] },
        { title: '', company: '', points: ['孤儿要点'] }, // 无 title/company → 整条删
      ],
      projects: [{ name: ' 项目 ', points: [' a ', ''] }, { name: '', points: ['x'] }],
      education: [{ school: ' 大学 ' }, { school: '' }],
      skills: [' TS ', '', '  '],
      extra_field: { keep: true },
    };
    const out = cleanResumeContent(dirty) as Record<string, never>;
    const exp = out.experience as unknown as Array<{ title: string; points: string[] }>;
    assert.equal(exp.length, 1);
    assert.equal(exp[0].title, '工程师');
    assert.deepEqual(exp[0].points, ['要点一']);
    const proj = out.projects as unknown as Array<{ name: string; points: string[] }>;
    assert.equal(proj.length, 1);
    assert.equal(proj[0].name, '项目');
    assert.deepEqual(proj[0].points, ['a']);
    assert.equal((out.education as unknown[]).length, 1);
    assert.deepEqual(out.skills, ['TS']);
    assert.deepEqual(out.extra_field, { keep: true });
  });
});
