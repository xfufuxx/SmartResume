"""LLM 计费策略单元测试 —— 免费额度清单、付费拦截、自动降级。

覆盖：
- billing_info / normalize_model：快照后缀归一、过期模型判定
- check_before_call：免费模型放行；付费模型 + 仅免费模式 → PaidCallBlocked
- resolve_model：AUTO_FALLBACK 开启时过期模型自动切替补；关闭时原样返回
- pick_free_model / estimate_cost_cny 基础行为

日期通过 monkeypatch 固定为 2026-10-25（qwen3.7-flash 额度 10-23 已到期，
qwen3.7-max 11-01 / deepseek-v4-pro-0813 11-13 仍在免费期），保证与运行日无关。
"""
from datetime import date

import pytest

from app.core import llm_policy
from app.core.llm_policy import (
    NO_FREE_QUOTA_MODELS,
    PaidCallBlocked,
    billing_info,
    check_before_call,
    estimate_cost_cny,
    normalize_model,
    pick_free_model,
    resolve_model,
)

FIXED_TODAY = date(2026, 10, 25)


class _FixedDate:
    """替身 date 类：today() 恒返回 FIXED_TODAY，其余参数行为不动。"""

    @classmethod
    def today(cls):
        return FIXED_TODAY

    def __new__(cls, *args, **kwargs):
        return date(*args, **kwargs)


@pytest.fixture
def frozen_today(monkeypatch):
    monkeypatch.setattr(llm_policy, "date", _FixedDate)


# ── billing_info / normalize_model ───────────────────────────────


def test_normalize_strips_snapshot_suffix():
    assert normalize_model("qwen3.7-flash-2026-07-15") == "qwen3.7-flash"
    assert normalize_model("qwen3.7-plus-2026-05-26") == "qwen3.7-plus"


def test_flash_is_free_but_expired_at_fixed_today(frozen_today):
    info = billing_info("qwen3.7-flash")
    assert info["has_free_quota"] is True
    assert info["expiry"] == date(2026, 10, 23)  # 早于 FIXED_TODAY → 已过期
    assert "2026-10-23" in info["reason"]  # reason 说明「已到期」，不能是空串


def test_max_still_free_at_fixed_today(frozen_today):
    info = billing_info("qwen3.7-max")
    assert info["has_free_quota"] is True
    assert info["expiry"] == date(2026, 11, 1)  # 晚于 FIXED_TODAY → 仍在免费期


def test_plus_has_no_free_quota():
    info = billing_info("qwen3.7-plus")
    assert info["has_free_quota"] is False
    assert "qwen3.7-plus" in NO_FREE_QUOTA_MODELS


def test_unknown_model_treated_as_paid():
    info = billing_info("some-unknown-model")
    assert info["has_free_quota"] is False


def test_estimate_cost_zero_for_free_model():
    assert estimate_cost_cny("qwen3.7-flash", 10000, 2000) == 0.0


def test_estimate_cost_positive_for_paid_model():
    cost = estimate_cost_cny("qwen3.7-plus", 1_000_000, 0)
    assert cost == pytest.approx(2.0)  # 输入单价 2 元/百万 Token


# ── check_before_call ────────────────────────────────────────────


def test_check_passes_for_free_model(frozen_today):
    info = check_before_call("qwen3.7-max", "测试")
    assert info["has_free_quota"] is True
    assert info["estimated_cost_cny"] == 0.0


def test_check_blocks_paid_model_when_allow_paid_false(frozen_today, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "LLM_ALLOW_PAID", False)
    with pytest.raises(PaidCallBlocked) as ei:
        check_before_call("qwen3.7-plus", "测试", 1000, 1000)
    msg = str(ei.value)
    assert "仅免费额度" in msg
    assert "LLM_ALLOW_PAID=true" in msg  # 给出可操作处理方式


def test_check_blocks_expired_free_model_when_allow_paid_false(frozen_today, monkeypatch):
    # 「在免费清单里」≠「现在能白嫖」：额度已到期的模型同样按量计费，
    # 仅免费模式下必须本地拦截（AUTO_FALLBACK 关闭时的纵深防御，
    # 否则请求发到上游还是 403）
    from app.config import settings

    monkeypatch.setattr(settings, "LLM_ALLOW_PAID", False)
    with pytest.raises(PaidCallBlocked) as ei:
        check_before_call("qwen3.7-flash", "测试", 1000, 1000)
    assert "2026-10-23" in str(ei.value)


def test_check_allows_paid_model_when_allow_paid_true(frozen_today, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "LLM_ALLOW_PAID", True)
    info = check_before_call("qwen3.7-plus", "测试", 1_000_000, 0)
    assert info["has_free_quota"] is False
    assert info["estimated_cost_cny"] > 0


# ── resolve_model（自动降级） ────────────────────────────────────


def test_expired_model_falls_back_when_auto_fallback_on(frozen_today, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "LLM_AUTO_FALLBACK", True)
    resolved, note = resolve_model("qwen3.7-flash")
    # 降级目标必须是仍在免费期内的模型（且不是原模型）
    expected = pick_free_model("text")
    assert resolved == expected
    assert resolved != "qwen3.7-flash"
    assert note  # 有切换说明（会进日志）
    assert "2026-10-23" in note  # 说明里点名额度到期日，而非空 reason


def test_fresh_model_untouched_when_auto_fallback_on(frozen_today, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "LLM_AUTO_FALLBACK", True)
    resolved, note = resolve_model("qwen3.7-max")
    assert resolved == "qwen3.7-max"
    assert note == ""


def test_no_fallback_when_auto_fallback_off(frozen_today, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "LLM_AUTO_FALLBACK", False)
    resolved, note = resolve_model("qwen3.7-flash")
    assert resolved == "qwen3.7-flash"  # 原样返回，交给上层预检/上游报错
    assert note == ""


def test_pick_free_model_prefers_max_tier(frozen_today):
    # 文本档优先 max：qwen3.7-max / qwen3.8-max 排在 flash/其它之前
    assert pick_free_model("text") in ("qwen3.7-max", "qwen3.8-max")
