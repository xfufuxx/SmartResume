"""模拟押题对话单元测试 —— 结构化块协议 + 提示词 + 额度（不发起真实上游请求）。

覆盖：
- parse_blocks：三类块提取、坏 JSON 跳过、同类型只取第一个、块外正文忽略
- strip_blocks：剥离干净、空行压缩、无块时原样返回
- sanitize_feedback / sanitize_summary / sanitize_turn：字段校验与截断
- build_system_prompt：上下文/已出题目/阶段说明注入
- 额度：_check_and_consume_quota / _release_quota（fake Redis）
"""
import json

import pytest

from app.api import interview as interview_api
from app.services.interview_chat import (
    build_system_prompt,
    parse_blocks,
    sanitize_feedback,
    sanitize_summary,
    sanitize_turn,
    strip_blocks,
)


def _block(kind: str, obj: dict) -> str:
    return f"```{kind}\n" + json.dumps(obj, ensure_ascii=False) + "\n```"


QUESTION = {
    "category": "项目深挖",
    "difficulty": "困难",
    "question": "你提到订单系统重构，具体怎么保证灰度期间不出问题？",
    "intent": "考察线上变更风险控制",
    "answer_outline": ["灰度分批", "双写校验", "回滚预案"],
    "sample_answer": "我们先按 5% 流量灰度……",
}


# ── parse_blocks ─────────────────────────────────────────────────


def test_parse_all_three_blocks():
    text = (
        "先点评一下：结构清楚，但缺少量化结果。\n\n"
        + _block("feedback", {"score": 3, "hits": ["讲清了背景"], "gaps": ["没有指标"], "advice": "补一个转化率数字"})
        + "\n\n"
        + _block("question", QUESTION)
        + "\n\n"
        + _block("summary", {"coverage": {"项目深挖": 2}, "strong": ["经历真实"], "weak": ["缺量化"], "actions": ["每题补数字"]})
    )
    out = parse_blocks(text)
    assert out["feedback"]["score"] == 3
    assert out["question"]["category"] == "项目深挖"
    assert out["summary"]["coverage"]["项目深挖"] == 2


def test_parse_skips_broken_json():
    text = "正文\n```question\n{不是合法 JSON}\n```\n```feedback\n{\"score\": 4, \"advice\": \"好\"}\n```"
    out = parse_blocks(text)
    assert out["question"] is None
    assert out["feedback"]["score"] == 4


def test_parse_first_block_wins():
    text = _block("question", QUESTION) + "\n" + _block("question", {**QUESTION, "question": "第二题"})
    out = parse_blocks(text)
    assert out["question"]["question"].startswith("你提到订单系统重构")


def test_parse_ignores_other_fences():
    text = "```json\n{\"question\": \"伪装的\"}\n```\n```question\n" + json.dumps(QUESTION, ensure_ascii=False) + "\n```"
    out = parse_blocks(text)
    assert out["question"]["question"].startswith("你提到订单系统重构")


def test_parse_empty_text():
    assert parse_blocks("") == {"question": None, "feedback": None, "summary": None}


# ── strip_blocks ─────────────────────────────────────────────────


def test_strip_removes_blocks_and_collapses_blank_lines():
    text = "点评第一段。\n\n" + _block("feedback", {"score": 3, "advice": "补数字"}) + "\n\n\n\n下一题来了。"
    out = strip_blocks(text)
    assert "```" not in out
    assert "score" not in out
    assert out == "点评第一段。\n\n下一题来了。"


def test_strip_noop_when_no_blocks():
    assert strip_blocks("普通回复") == "普通回复"
    assert strip_blocks("") == ""


# ── sanitize ─────────────────────────────────────────────────────


def test_feedback_clamps_score_and_fields():
    fb = sanitize_feedback({"score": 99, "hits": "讲清了背景", "gaps": ["缺指标", ""], "advice": "补数字"})
    assert fb["score"] == 5
    assert fb["hits"] == ["讲清了背景"]
    assert fb["gaps"] == ["缺指标"]

    bad = sanitize_feedback({"score": "不是数字"})
    assert bad is None  # 没有任何有效字段 → 丢弃，不生成空点评卡


def test_summary_keeps_positive_coverage_only():
    summary = sanitize_summary({
        "coverage": {"技术能力": 2, "项目深挖": 0, "行为面试": "3", "x": -1},
        "strong": ["表达清楚"],
        "weak": "缺量化",
        "actions": ["每题补数字", "准备反问"],
    })
    assert summary["coverage"] == {"技术能力": 2, "行为面试": 3}
    assert summary["weak"] == ["缺量化"]
    assert len(summary["actions"]) == 2


def test_summary_rejects_empty():
    assert sanitize_summary({}) is None
    assert sanitize_summary(None) is None


def test_sanitize_turn_normalizes_question():
    turn = sanitize_turn({"question": {**QUESTION, "category": "不存在的分类", "difficulty": "地狱"}, "feedback": None, "summary": None})
    assert turn["question"]["category"] == "职业规划"
    assert turn["question"]["difficulty"] == "中等"
    assert turn["question"]["order_index"] == 0
    assert turn["feedback"] is None


def test_sanitize_turn_drops_question_without_text():
    turn = sanitize_turn({"question": {"category": "技术能力"}, "feedback": None, "summary": None})
    assert turn["question"] is None


# ── system prompt ────────────────────────────────────────────────


def test_system_prompt_injects_context_and_state():
    prompt = build_system_prompt(
        {"personal_info": {"name": "李明"}},
        {"title": "Java 后端工程师", "company": "星辰科技"},
        target_count=8,
        asked_questions=["讲讲订单系统重构"],
        stage="asking",
    )
    assert "李明" in prompt
    assert "星辰科技" in prompt
    assert "目标 8 题" in prompt
    assert "讲讲订单系统重构" in prompt
    assert "一次只问一道题" in prompt


def test_system_prompt_handles_missing_context():
    prompt = build_system_prompt(None, None, target_count=5, asked_questions=[], stage="briefing")
    assert "（未提供）" in prompt
    assert "还没有出过题" in prompt


def test_system_prompt_truncates_long_resume():
    prompt = build_system_prompt({"summary": "很长的经历" * 2000}, None, target_count=8, asked_questions=[], stage="asking")
    assert "内容过长已截断" in prompt


# ── 额度（fake Redis，与 AI 润色同模式） ─────────────────────────


class _FakeQuotaRedis:
    def __init__(self):
        self.store: dict[str, int] = {}

    async def incr(self, key):
        self.store[key] = self.store.get(key, 0) + 1
        return self.store[key]

    async def expire(self, key, ttl):
        return True

    async def get(self, key):
        val = self.store.get(key)
        return None if val is None else str(val).encode()

    async def decr(self, key):
        self.store[key] = self.store.get(key, 0) - 1
        return self.store[key]


@pytest.mark.asyncio
async def test_quota_allows_up_to_limit(monkeypatch):
    monkeypatch.setattr(interview_api.settings, "INTERVIEW_DAILY_TURNS", 3)
    redis = _FakeQuotaRedis()
    results = [await interview_api._check_and_consume_quota(redis, "u1") for _ in range(4)]
    assert [ok for ok, _ in results] == [True, True, True, False]


@pytest.mark.asyncio
async def test_quota_release_refunds_one_turn(monkeypatch):
    monkeypatch.setattr(interview_api.settings, "INTERVIEW_DAILY_TURNS", 2)
    redis = _FakeQuotaRedis()
    await interview_api._check_and_consume_quota(redis, "u1")
    await interview_api._check_and_consume_quota(redis, "u1")
    await interview_api._release_quota(redis, "u1")
    ok, _ = await interview_api._check_and_consume_quota(redis, "u1")
    assert ok is True


@pytest.mark.asyncio
async def test_quota_release_swallows_error():
    class _BrokenRedis:
        async def get(self, key):
            raise RuntimeError("redis down")

    await interview_api._release_quota(_BrokenRedis(), "u1")  # 不抛异常
