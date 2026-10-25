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
    FREE_QUOTA_MODELS,
    NO_FREE_QUOTA_MODELS,
    NON_TEXT_MODELS,
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


def _freeze_to(monkeypatch, day: date):
    """把 llm_policy 里的 date 冻结到指定日期（用于模拟额度到期后的挑选）。"""

    class _D:
        @classmethod
        def today(cls):
            return day

        def __new__(cls, *args, **kwargs):
            return date(*args, **kwargs)

    monkeypatch.setattr(llm_policy, "date", _D)


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
    # 文本档优先 max；max 档内按剩余天数降序——qwen3.8-max-0902（12-01）
    # runway 最长且余量 100%，优先于 11-01 到期的 qwen3.7-max / qwen3.8-max
    assert pick_free_model("text") == "qwen3.8-max-0902"


# ── 控制台核对（2026-10-25 用户截图逐行同步） ───────────────────


def test_console_synced_entries():
    # 截图修正：qwen3.8-max-0902 到期日是 12-01，不是 11-01（曾与 3.8-max 混淆）
    assert FREE_QUOTA_MODELS["qwen3.8-max-0902"] == date(2026, 12, 1)
    assert FREE_QUOTA_MODELS["qwen3.8-max"] == date(2026, 11, 1)
    # 截图新增的可用文本模型
    assert FREE_QUOTA_MODELS["qwen3.8-flash"] == date(2026, 11, 25)
    assert FREE_QUOTA_MODELS["deepseek-v4.1-flash"] == date(2026, 12, 13)
    assert FREE_QUOTA_MODELS["glm-5.3"] == date(2026, 11, 23)
    # 截图新增的非文本模型
    assert FREE_QUOTA_MODELS["qwen-mt-uni"] == date(2026, 12, 15)
    assert FREE_QUOTA_MODELS["qwen3.7-text-rerank"] == date(2026, 11, 30)
    assert FREE_QUOTA_MODELS["qwen-mt-image-2.0"] == date(2026, 11, 27)
    assert FREE_QUOTA_MODELS["wan3.0-video-prime"] == date(2026, 11, 21)
    for m in ("sambart-zhichu-v1", "sambart-hanna-v1", "sambart-clara-v1", "sambart-eva-v1"):
        assert FREE_QUOTA_MODELS[m] is None  # 控制台显示「永不过期」


def test_non_text_models_never_picked_for_text(frozen_today):
    # 语音/翻译/向量/视频模型进文本链路会直接坏菜：冻结到 max 档全部到期后，
    # 替补必须是文本模型，且绝不是 cosyvoice 等非文本模型
    for m in NON_TEXT_MODELS:
        assert m not in (pick_free_model("text"),)
    picked = pick_free_model("text")
    assert picked and picked not in NON_TEXT_MODELS


def test_fallback_after_max_expiry_prefers_longest_runway(monkeypatch):
    # 冻结到 2026-11-02（qwen3.7-max / qwen3.8-max 到期）：max 档仅剩
    # qwen3.8-max-0902（12-01），仍是首选；思考模型 deepseek-v4.1-flash
    # 虽然到期更晚（12-13）也排在它后面
    _freeze_to(monkeypatch, date(2026, 11, 2))
    assert pick_free_model("text") == "qwen3.8-max-0902"


def test_reasoning_model_is_last_resort(monkeypatch):
    # 冻结到 2026-12-02（max 档与 flash/pro 全部到期）：只剩思考模型
    # deepseek-v4.1-flash——作为最后手段启用（白嫖 runway 多撑约 12 天）
    _freeze_to(monkeypatch, date(2026, 12, 2))
    assert pick_free_model("text") == "deepseek-v4.1-flash"


def test_no_candidate_after_all_quotas_expire(monkeypatch):
    # 冻结到 2026-12-14（清单内文本模型全部到期）：无候选 → 上层走
    # check_before_call 本地拦截（中文提示），绝不发请求
    _freeze_to(monkeypatch, date(2026, 12, 14))
    assert pick_free_model("text") is None


def test_vision_pool_empty_without_free_vision_model(frozen_today):
    # 控制台免费清单内无视觉对话模型（qwen-mt-image-2.0 是图片翻译）：
    # 视觉链路不降级，由 llm_errors 转中文提示，绝不把图片请求发给文本模型
    assert pick_free_model("vision") is None
