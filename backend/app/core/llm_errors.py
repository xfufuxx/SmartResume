"""LLM 调用的错误分类与中文友好化。

背景
----
百炼（DashScope）等 OpenAI 兼容端点的错误是英文原文，且带 JSON 结构，
直接甩给用户看不懂、也不知道怎么办。典型场景：

  403 AllocationQuota.FreeTierOnly —— 免费额度耗尽 / 账号处于「仅免费」模式
  401 invalid api key             —— Key 无效或过期
  429 rate limit                  —— 限流（**唯一应该重试的状态码**）
  400 bad request                 —— 模型名不存在 / 参数不兼容

同时 agent_optimizer / text_optimizer 的重试循环原先对**所有**异常一视同仁地
重试——403 这种确定性错误重试 3 次纯属浪费（每次还可能等满 timeout）。

本模块提供两件事：
1. `is_retryable_error(e)`：这个异常值不值得重试；
2. `friendly_error(e, model)`：把异常转成用户看得懂、知道下一步做什么的中文异常。
"""

from __future__ import annotations

import logging
import re

logger = logging.getLogger(__name__)

# 阿里云百炼控制台（充值 / 关闭「仅使用免费额度」都在这里）
BAILIAN_CONSOLE = "bailian.console.aliyun.com"

# 免费额度耗尽的典型上游文案（大小写不敏感匹配）
_QUOTA_HINTS = (
    "free quota",
    "free tier",
    "allocationquota",
    "quota exhausted",
    "insufficient quota",
    "balance",
)

# openai 库的 APIStatusError.__str__ 形如 "Error code: 403 - {...}"；
# mock/替身异常可能只有消息没有 status_code 属性，用正则兜底提取。
_STATUS_IN_MSG = re.compile(r"error\s*code[:\s]+(\d{3})", re.IGNORECASE)


class LLMQuotaExhausted(RuntimeError):
    """额度耗尽（免费额度到期 / 余额不足 / 账号处于仅免费模式）。

    单独的类型让上层可以区分「全局性没钱」和「单次偶发失败」——
    例如 text_optimizer 的批处理对普通失败保留原文，但对此类异常必须上抛。
    """


def _status_code(e: BaseException) -> int | None:
    """取 HTTP 状态码：优先 status_code 属性，其次从消息文本提取，都没有返回 None。"""
    code = getattr(e, "status_code", None)
    if isinstance(code, int):
        return code
    m = _STATUS_IN_MSG.search(str(e))
    if m:
        return int(m.group(1))
    return None


def _looks_like_quota_error(e: BaseException) -> bool:
    """403 也可能是权限/地域问题；只有文案命中额度特征才判定为额度耗尽。"""
    msg = str(e).lower()
    return any(h in msg for h in _QUOTA_HINTS)


def is_retryable_error(e: BaseException) -> bool:
    """判断异常是否值得重试。

    可重试：429 限流、408 超时、5xx 服务端错误。
    不可重试：400/401/403 等确定性客户端错误（重试结果不会变）。
    无状态码的异常（JSON 解析失败等业务异常）：保守重试，保持既有容错行为。
    """
    code = _status_code(e)
    if code is None:
        return True
    if code in (408, 429):
        return True
    if code >= 500:
        return True
    return False


def friendly_error(e: BaseException, model: str = "") -> BaseException:
    """把 LLM 调用异常转成中文可操作异常（保留原文便于排查）。

    Args:
        e: 原始异常（openai.APIStatusError / APITimeoutError / 其它）。
        model: 出错的模型名，用于提示里点名。

    Returns:
        新的异常实例（LLMQuotaExhausted / ValueError / RuntimeError），
        str() 即用户可见的中文提示；无法归类时返回原文截断的 RuntimeError。
    """
    code = _status_code(e)
    raw = str(e)
    # 上游 message 往往很长（JSON 结构），提示里只保留摘要
    raw_brief = raw[:160].replace("\n", " ")
    m = f"（模型 {model}）" if model else ""

    # ── 额度耗尽：403 + 文案特征 ──
    if code == 403 and _looks_like_quota_error(e):
        return LLMQuotaExhausted(
            f"AI 服务免费额度已耗尽{m}。请登录 {BAILIAN_CONSOLE} 充值，"
            f"或关闭账号的『仅使用免费额度』模式；也可以在 backend/.env 更换 LLM_API_KEY，"
            f"或设置 LLM_ALLOW_PAID=true 允许按量计费。"
        )

    # ── 403 其它原因（权限 / 地域 / 未开通） ──
    if code == 403:
        return ValueError(
            f"AI 服务拒绝访问{m}（权限不足或地域未开通）：{raw_brief}。"
            f"请检查 {BAILIAN_CONSOLE} 中该模型的访问权限。"
        )

    # ── Key 无效 ──
    if code == 401:
        return ValueError(
            f"LLM_API_KEY 无效或已过期{m}，请检查 backend/.env 中的配置。"
        )

    # ── 限流（可重试，若仍失败则走到这里） ──
    if code == 429:
        return RuntimeError(
            f"AI 服务请求过于频繁{m}，请稍后重试（系统已自动重试 {raw_brief[:80]}）。"
        )

    # ── 请求被拒（模型名不存在 / 参数不兼容） ──
    if code == 400:
        return ValueError(
            f"AI 服务拒绝了请求{m}：{raw_brief}。"
            f"请检查 LLM_MODEL_TEXT / LLM_MODEL_VISION 是否为当前账号可用的模型名。"
        )

    # ── 5xx 服务端错误 ──
    if code is not None and code >= 500:
        return RuntimeError(
            f"AI 服务（{code}）暂时不可用{m}，请稍后重试；若持续失败请查看服务商状态页。"
        )

    # ── 连接 / 超时 ──
    # 双通道识别：① 异常类型名（requests.ConnectionError / openai.APIConnectionError /
    # TimeoutError 等 SDK 原生类型）；② 消息文案（业务层包装成的通用异常会保留
    # "Connection error" / "timeout" 原文，只靠类型名会漏判成普通失败）。
    name = type(e).__name__
    text = raw.lower()
    if (any(t in name for t in ("Timeout", "Connection", "Connect", "Network"))
            or any(t in text for t in (
                "connection", "connect", "timed out", "timeout", "network",
                "连接失败", "网络", "超时",
            ))):
        return RuntimeError(
            f"无法连接 AI 服务{m}（网络超时或连接失败），请检查网络与 LLM_API_BASE 配置。"
        )

    # ── 其它：保留原文摘要 ──
    return RuntimeError(f"AI 服务调用失败{m}：{raw_brief}")


def wrap_llm_error(e: BaseException, model: str = "") -> BaseException:
    """便捷入口：已中文化过（LLMQuotaExhausted 等自定义类型）的直接返回。

    供 except 块里 `raise wrap_llm_error(e, model)` 使用，避免二次包装。
    """
    if isinstance(e, (LLMQuotaExhausted,)):
        return e
    return friendly_error(e, model)
