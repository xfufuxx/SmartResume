/**
 * interview-chat.ts 单测 —— 流式正文过滤 / 消息合并 / 快捷操作 / 分组。
 * 运行：npm test（node --test 原生 TS）
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  groupQuestionsByCategory, mergeTurnMessage, quickReplies, stageText, stripStreamingBlocks,
} from '../interview-chat.ts';
import type { InterviewChatMessage } from '../../types/index.ts';

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
  it('未出题时给开场建议，出题后给控制操作', () => {
    assert.equal(quickReplies('briefing', 0).length, 3);
    assert.equal(quickReplies('briefing', 0)[0].label, '直接开始');
    const mid = quickReplies('asking', 3);
    assert.deepEqual(mid.map((r) => r.intent), ['hint', 'next', 'skip', 'finish']);
  });

  it('已复盘不再给任何快捷操作', () => {
    assert.deepEqual(quickReplies('finished', 5), []);
  });

  it('阶段文案有默认值', () => {
    assert.equal(stageText('asking'), '面试中');
    assert.equal(stageText(null), '面试中');
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
