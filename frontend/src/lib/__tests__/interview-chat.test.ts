/**
 * interview-chat.ts 单测 —— 流式正文过滤 / 消息合并 / 快捷操作 / 分组。
 * 运行：npm test（node --test 原生 TS）
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  dedupeQuestionText, groupQuestionsByCategory, mergeTurnMessage, questionActionLabels, quickReplies,
  stageHeadline, stageKeyLabel, stageNote, stagePosition, stageText, stageUsed,
  stripStreamingBlocks,
} from '../interview-chat.ts';
import type { InterviewChatMessage, InterviewPlanItem } from '../../types/index.ts';

const msg = (id: string, content: string, order = 1): InterviewChatMessage => ({
  id,
  session_id: 's1',
  role: 'assistant',
  kind: 'text',
  content,
  payload: {},
  order_index: order,
});

describe('stripStreamingBlocks', () => {
  it('剥离已闭合的结构化块，保留正文', () => {
    const text = '点评一下：结构清楚。\n```feedback\n{"score": 3}\n```\n下一题。';
    assert.equal(stripStreamingBlocks(text), '点评一下：结构清楚。\n\n下一题。');
  });

  it('截断尚未闭合的块（流式只吐了开头）', () => {
    const text = '我先说结论。\n```question\n{"category": "技术';
    assert.equal(stripStreamingBlocks(text), '我先说结论。');
  });

  it('块跨多个 delta 拼起来后仍能剥干净', () => {
    let acc = '';
    for (const piece of ['好，', '下一题：', '\n```que', 'stion\n{"question":"Q"', '}\n```']) {
      acc += piece;
    }
    assert.equal(stripStreamingBlocks(acc), '好，下一题：');
  });

  it('没有块时原样返回（压缩末尾空白）', () => {
    assert.equal(stripStreamingBlocks('  普通回复  '), '普通回复');
    assert.equal(stripStreamingBlocks(''), '');
  });

  it('只处理 question/feedback/summary 三种围栏，其它代码块保留', () => {
    const text = '示例：\n```json\n{"a":1}\n```';
    assert.ok(stripStreamingBlocks(text).includes('"a":1'));
  });
});

describe('mergeTurnMessage', () => {
  it('同 id 覆盖而不是追加', () => {
    const list = [msg('m1', '占位')];
    const out = mergeTurnMessage(list, msg('m1', '服务端真值'));
    assert.equal(out.length, 1);
    assert.equal(out[0].content, '服务端真值');
  });

  it('新消息追加，重复 id 去重', () => {
    const list = [msg('m1', 'a')];
    const out = mergeTurnMessage(mergeTurnMessage(list, msg('m2', 'b')), msg('m2', 'b'));
    assert.deepEqual(out.map((m) => m.id), ['m1', 'm2']);
  });
});

describe('quickReplies / stageText', () => {
  it('未出题时只给「开始吧」，且以 start 意图触发开场', () => {
    const chips = quickReplies('briefing', 0);
    assert.equal(chips.length, 1);
    assert.equal(chips[0].label, '开始吧');
    assert.equal(chips[0].intent, 'start');
  });

  it('面试中给四个控制操作', () => {
    const mid = quickReplies('asking', 3, 'resume');
    assert.deepEqual(mid.map((r) => r.intent), ['hint', 'next', 'skip', 'finish']);
  });

  it('反问环节换成「值得问的问题」，不再催下一题', () => {
    const chips = quickReplies('asking', 6, 'reverse');
    assert.equal(chips.length, 3);
    assert.ok(chips.every((c) => !c.intent), '反问环节的 chips 应当作为普通提问发送');
    assert.ok(chips.some((c) => c.label.includes('挑战')));
  });

  it('已复盘不再给任何快捷操作', () => {
    assert.deepEqual(quickReplies('finished', 5), []);
  });

  it('阶段文案有默认值', () => {
    assert.equal(stageText('asking'), '面试中');
    assert.equal(stageText(null), '面试中');
  });
});

// 8 题的计划：开场 1 / 简历 2 / 专业 2 / 行为 1 / 动机 1 / 反问 1
const PLAN: InterviewPlanItem[] = [
  { key: 'opening', label: '自我介绍', focus: '', count: 1, start: 0, end: 1 },
  { key: 'resume', label: '简历深挖', focus: '', count: 2, start: 1, end: 3 },
  { key: 'skill', label: '专业能力', focus: '', count: 2, start: 3, end: 5 },
  { key: 'behavior', label: '行为面试', focus: '', count: 1, start: 5, end: 6 },
  { key: 'motivation', label: '求职动机', focus: '', count: 1, start: 6, end: 7 },
  { key: 'reverse', label: '反问环节', focus: '', count: 1, start: 7, end: 8 },
];

describe('环节视图', () => {
  it('定位当前环节并给出「第 N / M 环节」标题', () => {
    const pos = stagePosition(PLAN, 'resume');
    assert.equal(pos?.index, 1);
    assert.equal(pos?.total, 6);
    assert.equal(stageHeadline(PLAN, 'resume'), '第 2 / 6 环节 · 简历深挖');
  });

  it('plan 缺失或环节未知时退回环节名兜底，不抛错', () => {
    assert.equal(stageHeadline(undefined, 'resume'), '简历深挖');
    assert.equal(stageHeadline(PLAN, null), '');
    assert.equal(stagePosition([], 'opening'), null);
    assert.equal(stageKeyLabel('salary'), '薪资与到岗');
    assert.equal(stageKeyLabel(null), '');
  });

  it('环节内已出题数不超过配额', () => {
    assert.equal(stageUsed(PLAN[1], 0), 0);
    assert.equal(stageUsed(PLAN[1], 2), 1);
    assert.equal(stageUsed(PLAN[1], 99), 2);
  });

  it('每个环节都有作答提示，未知环节有通用兜底', () => {
    assert.ok(stageNote('reverse').includes('问团队'));
    assert.ok(stageNote(undefined).length > 4);
  });

  it('反问环节的题目卡按钮改成「提问」语义', () => {
    assert.deepEqual(questionActionLabels('reverse'), { outline: '看可问的方向', sample: '看示范提问' });
    assert.deepEqual(questionActionLabels('skill'), { outline: '看答题要点', sample: '看参考答案' });
  });
});

describe('groupQuestionsByCategory', () => {
  it('按首次出现顺序分组，未知分类归入综合', () => {
    const groups = groupQuestionsByCategory([
      { category: '项目深挖' }, { category: '技术能力' }, { category: '项目深挖' }, { category: null },
    ]);
    assert.deepEqual(groups.map((g) => g.category), ['项目深挖', '技术能力', '综合']);
    assert.equal(groups[0].items.length, 2);
  });
});

describe('dedupeQuestionText', () => {
  const question = '先请你用 60-90 秒做个自我介绍：你是谁、主要做过什么、为什么适合这个岗位？';

  it('正文整段就是题干时全部剥掉，改由题卡展示', () => {
    assert.equal(dedupeQuestionText(question, question), '');
  });

  it('保留面试官反应句，只删重复题干', () => {
    const body = `嗯，这块我记一下。${question}`;
    assert.equal(dedupeQuestionText(body, question), '嗯，这块我记一下。');
  });

  it('正文没有重复时原样返回', () => {
    assert.equal(dedupeQuestionText('那我们开始吧。', question), '那我们开始吧。');
  });

  it('没有题目块时不做处理', () => {
    assert.equal(dedupeQuestionText(question, null), question.trim());
    assert.equal(dedupeQuestionText(question, ''), question.trim());
  });

  it('题干过短不误删常见短句', () => {
    assert.equal(dedupeQuestionText('为什么？', '为什么？'), '为什么？');
  });
});

describe('stripStreamingBlocks 兼容 ```json 包裹块（回归：复盘裸 JSON）', () => {
  it('剥掉 ```json 包裹的 summary 块', () => {
    const text = '本次模拟到这里。\n```json\n{"summary": {"coverage": {"自我介绍": 1}}}\n```\n谢谢。';
    const out = stripStreamingBlocks(text);
    assert.equal(out, '本次模拟到这里。\n\n谢谢。');
  });

  it('保留普通代码块（python / 无键提示的 json）', () => {
    const text = '看这段：\n```python\nprint("hello")\n```\n完。';
    assert.equal(stripStreamingBlocks(text), '看这段：\n```python\nprint("hello")\n```\n完。');
    const plain = '数据：\n```json\n{"foo": 1}\n```\n用。';
    assert.ok(stripStreamingBlocks(plain).includes('"foo"'));
  });

  it('未闭合的 ```json 结构化块被截断', () => {
    const text = '复盘如下：\n```json\n{"summary": {"coverage": {';
    const out = stripStreamingBlocks(text);
    assert.equal(out, '复盘如下：');
  });
});
