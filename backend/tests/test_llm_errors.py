"""LLM 错误分类与中文友好化单元测试（不发起真实上游请求）。

覆盖：
- is_retryable_error：403/401/400 不重试；429/408/5xx 重试；
  无状态码保守重试；仅消息文本带 "Error code: 403" 也能正确判定
- friendly_error：403 额度耗尽 → LLMQuotaExhausted（含控制台指引）；
  403 权限 / 401 Key / 429 / 400 / 5xx / 连接 / 未知 的中文映射
- wrap_llm_error：已中文化异常原样返回（幂等）
"""
from app.core.llm_errors import (
    LLMQuotaExhausted,
    friendly_error,
    is_retryable_error,
    wrap_llm_error,
)


def _openai_style(status: int, message: str) -> Exception:
    """模拟 openai.APIStatusError 的 str() 形态（Error code: NNN - {...}）。"""
    return Exception(f"Error code: {status} - {{'error': {{'message': '{message}'}}}}")


# ── is_retryable_error ───────────────────────────────────────────


def test_quota_403_not_retryable():
    e = _openai_style(403, "Free quota exhausted. ...")
    assert is_retryable_error(e) is False


def test_401_400_not_retryable():
    assert is_retryable_error(_openai_style(401, "invalid api key")) is False
    assert is_retryable_error(_openai_style(400, "bad request")) is False


def test_429_and_5xx_retryable():
    assert is_retryable_error(_openai_style(429, "rate limit")) is True
    assert is_retryable_error(_openai_style(500, "internal")) is True
    assert is_retryable_error(_openai_style(503, "unavailable")) is True
    assert is_retryable_error(_openai_style(408, "timeout")) is True


def test_status_from_attribute():
    class FakeStatus(Exception):
        status_code = 403

    assert is_retryable_error(FakeStatus("boom")) is False


def test_unknown_error_retryable_conservatively():
    # 无状态码的业务异常（如 JSON 解析失败）：保守重试，保持既有容错行为
    assert is_retryable_error(ValueError("大模型返回的不是有效 JSON")) is True


# ── friendly_error ───────────────────────────────────────────────


def test_quota_403_maps_to_exhausted_with_guidance():
    e = _openai_style(
        403,
        'Free quota exhausted. To continue accessing the model on a paid basis, '
        'please add funds or disable the "use free tier only" mode.',
    )
    out = friendly_error(e, "qwen3.7-flash")
    assert isinstance(out, LLMQuotaExhausted)
    msg = str(out)
    assert "bailian.console.aliyun.com" in msg          # 控制台地址
    assert "LLM_ALLOW_PAID=true" in msg                  # 处理方式③
    assert "LLM_API_KEY" in msg                          # 处理方式②
    assert "qwen3.7-flash" in msg                        # 点名模型


def test_allocation_quota_error_code_also_detected():
    # 真实百炼错误码形态（无空格、驼峰），靠 allocationquota 特征命中
    e = _openai_style(403, "AllocationQuota.FreeTierOnly: ...")
    out = friendly_error(e)
    assert isinstance(out, LLMQuotaExhausted)


def test_403_without_quota_hint_is_permission_error():
    e = _openai_style(403, "Access denied for this model")
    out = friendly_error(e, "qwen3.7-flash")
    assert not isinstance(out, LLMQuotaExhausted)
    assert "拒绝访问" in str(out)


def test_401_maps_to_key_error():
    out = friendly_error(_openai_style(401, "invalid api key"))
    assert "LLM_API_KEY" in str(out)


def test_429_maps_to_rate_limit():
    out = friendly_error(_openai_style(429, "rate limit exceeded"))
    assert "频繁" in str(out)


def test_400_mentions_model_config():
    out = friendly_error(_openai_style(400, "model not exist"), "qwen9-none")
    assert "LLM_MODEL_TEXT" in str(out)


def test_503_maps_to_unavailable():
    out = friendly_error(_openai_style(503, "service unavailable"))
    assert "稍后重试" in str(out)


def test_connection_error_maps_to_network():
    out = friendly_error(Exception("Connection error: timeout"))
    assert "无法连接" in str(out)


def test_unknown_error_keeps_brief():
    out = friendly_error(ValueError("某个没见过的错误 " + "x" * 500))
    assert "AI 服务调用失败" in str(out)
    assert len(str(out)) < 300  # 原文被截断，不刷屏


# ── wrap_llm_error ───────────────────────────────────────────────


def test_wrap_is_idempotent_for_quota():
    original = LLMQuotaExhausted("已经中文了")
    assert wrap_llm_error(original, "m") is original


def test_wrap_converts_plain_exception():
    out = wrap_llm_error(_openai_style(403, "Free quota exhausted"), "qwen3.7-flash")
    assert isinstance(out, LLMQuotaExhausted)
