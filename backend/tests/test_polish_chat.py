"""AI 对话润色单元测试 —— 建议协议解析 + 额度逻辑（不发起真实上游请求）。

覆盖：
- parse_suggestions：多块提取、字段校验、损坏块跳过、空文本
- strip_suggestion_blocks：剥离后无残留块、空行压缩
- polish_system_prompt：含上下文与协议说明
- 额度：_check_and_consume_quota / _release_quota（fake Redis）
"""
import pytest

from app.api import polish as polish_api
from app.services.polish_chat import (
    parse_suggestions,
    polish_system_prompt,
    strip_suggestion_blocks,
)


def _block(obj: dict) -> str:
    import json
    return "```suggestion\n" + json.dumps(obj, ensure_ascii=False) + "\n```"


# ── parse_suggestions ────────────────────────────────────────────


def test_parse_single_suggestion():
    text = (
        "我把这句改写了：\n"
        + _block({"target": "工作经历", "original": "负责系统开发", "improved": "主导系统架构设计与落地", "reason": "强化动词"})
        + "\n理由如上。"
    )
    items = parse_suggestions(text)
    assert len(items) == 1
    assert items[0]["id"] == "sug-1"
    assert items[0]["original"] == "负责系统开发"
    assert items[0]["improved"] == "主导系统架构设计与落地"
    assert items[0]["reason"] == "强化动词"


def test_parse_multiple_suggestions_sequential_ids():
    text = (
        _block({"target": "A", "original": "a", "improved": "a2"})
        + "\n中间文字\n"
        + _block({"target": "B", "original": "b", "improved": "b2"})
    )
    items = parse_suggestions(text)
    assert [i["id"] for i in items] == ["sug-1", "sug-2"]
    assert [i["target"] for i in items] == ["A", "B"]


def test_parse_skips_corrupted_block():
    text = (
        _block({"target": "A", "original": "a", "improved": "a2"})
        + "\n```suggestion\n{这不是合法JSON}\n```\n"
        + _block({"target": "C", "original": "c", "improved": "c2"})
    )
    items = parse_suggestions(text)
    assert len(items) == 2
    assert [i["target"] for i in items] == ["A", "C"]


def test_parse_skips_missing_required_fields():
    text = _block({"target": "A", "original": "a"})  # 缺 improved
    assert parse_suggestions(text) == []


def test_parse_empty_text():
    assert parse_suggestions("") == []
    assert parse_suggestions("普通对话，没有建议") == []


def test_parse_ignores_other_code_blocks():
    text = "```json\n{\"a\": 1}\n```\n```suggestion\n" + '{"target":"A","original":"a","improved":"a2"}' + "\n```"
    items = parse_suggestions(text)
    assert len(items) == 1
    assert items[0]["target"] == "A"


# ── strip_suggestion_blocks ──────────────────────────────────────


def test_strip_removes_blocks_and_collapses_blanks():
    text = "开头\n\n" + _block({"target": "A", "original": "a", "improved": "a2"}) + "\n\n\n\n结尾"
    out = strip_suggestion_blocks(text)
    assert "suggestion" not in out
    assert "```" not in out
    assert out == "开头\n\n结尾"


def test_strip_noop_when_no_blocks():
    assert strip_suggestion_blocks("普通文本") == "普通文本"
    assert strip_suggestion_blocks("") == ""


# ── system prompt ────────────────────────────────────────────────


def test_system_prompt_contains_context_and_protocol():
    prompt = polish_system_prompt('{"personal_info": {"name": "张三"}}')
    assert "张三" in prompt
    assert "suggestion" in prompt
    assert "improved" in prompt


def test_system_prompt_handles_empty_context():
    prompt = polish_system_prompt("")
    assert "未提供简历上下文" in prompt


# ── 额度（fake Redis，与 ai_photo 同模式） ───────────────────────


class _FakeQuotaRedis:
    def __init__(self):
        self.store: dict[str, int] = {}
        self.ttls: dict[str, int] = {}

    async def incr(self, key):
        self.store[key] = self.store.get(key, 0) + 1
        return self.store[key]

    async def expire(self, key, ttl):
        self.ttls[key] = ttl
        return True

    async def get(self, key):
        val = self.store.get(key)
        return None if val is None else str(val).encode()

    async def decr(self, key):
        self.store[key] = self.store.get(key, 0) - 1
        return self.store[key]


@pytest.mark.asyncio
async def test_quota_under_limit(monkeypatch):
    monkeypatch.setattr(polish_api.settings, "POLISH_DAILY_LIMIT", 30)
    redis = _FakeQuotaRedis()
    ok, count = await polish_api._check_and_consume_quota(redis, "u1")
    assert ok is True and count == 1
    key = next(iter(redis.store))
    assert key.startswith("polish:count:u1:")
    assert redis.ttls[key] == 86400


@pytest.mark.asyncio
async def test_quota_blocks_above_limit(monkeypatch):
    monkeypatch.setattr(polish_api.settings, "POLISH_DAILY_LIMIT", 2)
    redis = _FakeQuotaRedis()
    results = [await polish_api._check_and_consume_quota(redis, "u1") for _ in range(3)]
    assert results == [(True, 1), (True, 2), (False, 3)]


@pytest.mark.asyncio
async def test_quota_release_decrements(monkeypatch):
    monkeypatch.setattr(polish_api.settings, "POLISH_DAILY_LIMIT", 2)
    redis = _FakeQuotaRedis()
    for _ in range(2):
        await polish_api._check_and_consume_quota(redis, "u1")
    await polish_api._release_quota(redis, "u1")
    assert next(iter(redis.store.values())) == 1
    ok, count = await polish_api._check_and_consume_quota(redis, "u1")
    assert ok is True and count == 2


@pytest.mark.asyncio
async def test_quota_release_zero_noop():
    redis = _FakeQuotaRedis()
    await polish_api._release_quota(redis, "never")
    assert redis.store == {}


@pytest.mark.asyncio
async def test_quota_release_swallows_error():
    class _BrokenRedis:
        async def get(self, key):
            raise RuntimeError("redis down")

        async def decr(self, key):  # pragma: no cover
            raise AssertionError("不应到达")

    await polish_api._release_quota(_BrokenRedis(), "u1")
