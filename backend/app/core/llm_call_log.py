"""LLM 调用账本：把每一次真实发请求都落库到 ai_model_call_logs。

背景
----
改造前，`ai_model_call_logs` 的唯一写入方是 `services/model_router.record_model_call()`，
而 `route_model()` 在全项目没有任何调用点（死代码），`model_routing` 表也是空的。
结果就是：**所有直连 AsyncOpenAI 的链路（岗位解析 / 简历解析 / 优化 / 面试预演 / 排版编辑）
一条日志都不写**。一旦 AI 报错或想核算费用，只能靠猜——本次「账号 Arrearage」排查
就是被这个盲区拖累的。

因此所有发请求的地方统一走 `services.llm_invoke()`，由它在这里写账本。

设计要点
--------
1. **后台落库，不拖慢主链路**：用 `asyncio.create_task` 异步写，业务请求不等它。
2. **写日志失败绝不影响业务**：整个写入包 try/except，静默降级（只 warn 一次）。
3. **重试也会各记一条**：重试意味着可能产生多次计费，必须如实记录，否则账本会漏。
4. **费用按模型单价折算到 cost_usd**（走免费额度的模型记 0）。
"""

from __future__ import annotations

import asyncio
import logging

from app.core.llm_policy import billing_info, estimate_cost_cny

logger = logging.getLogger(__name__)

# 待落库的调用记录队列（防止后台任务堆积时无限增长）
_pending: list[dict] = []
_MAX_PENDING = 500


def _cny_to_usd(cny: float) -> float:
    """人民币折算美元，用于 cost_usd 字段（字段本身是美元口径）。"""
    return round(cny / 7.2, 6)


def _usage_tokens(resp) -> tuple[int | None, int | None]:
    """从 SDK 响应里取 token 用量；老版本 / 异常响应可能没有 usage。"""
    usage = getattr(resp, "usage", None)
    if not usage:
        return None, None
    try:
        pin = getattr(usage, "prompt_tokens", None)
        pout = getattr(usage, "completion_tokens", None)
        if pin is None and isinstance(usage, dict):
            pin = usage.get("prompt_tokens")
            pout = usage.get("completion_tokens")
        return pin, pout
    except Exception:  # noqa: BLE001
        return None, None


def _enqueue(record: dict) -> None:
    """入队（内存缓冲），由 ensure_flushed() 或下一次调用顺带写出。"""
    if len(_pending) >= _MAX_PENDING:
        logger.warning("[LLM 账本] 待写队列已达上限 %d 条，丢弃最旧的一条", _MAX_PENDING)
        _pending.pop(0)
    _pending.append(record)


async def _flush_one(record: dict) -> None:
    """真正写库。内部自持 session，失败静默。"""
    from app.database import async_session_factory
    from app.models.admin import AIModelCallLog
    from sqlalchemy import insert

    try:
        async with async_session_factory() as session:
            await session.execute(
                insert(AIModelCallLog).values(
                    model_name=record["model"],
                    prompt_template_name=record["task"],
                    input_tokens=record.get("in_tok"),
                    output_tokens=record.get("out_tok"),
                    latency_ms=record.get("latency_ms"),
                    is_success=record["ok"],
                    error_message=record.get("error"),
                    cost_usd=record.get("cost_usd"),
                )
            )
            await session.commit()
        # 写成功才出队；否则留在队列里等下次重试写出
        if record in _pending:
            _pending.remove(record)
    except Exception as e:  # noqa: BLE001
        # 写日志失败绝不能影响正在跑的业务，只留痕
        logger.debug("[LLM 账本] 写入失败（已忽略）: %s", e)


def enqueue_llm_call_record(
    *,
    model: str,
    task: str,
    ok: bool,
    in_tok: int | None = None,
    out_tok: int | None = None,
    latency_ms: int | None = None,
    error: str | None = None,
) -> None:
    """登记一条 LLM 调用，交给后台任务落库（非阻塞）。"""
    from app.config import settings

    if not getattr(settings, "LLM_ENABLE_CALL_LOG", True):
        return

    est = estimate_cost_cny(model, in_tok or 0, out_tok or 0)
    record = {
        "model": model,
        "task": task,
        "ok": ok,
        "in_tok": in_tok,
        "out_tok": out_tok,
        "latency_ms": latency_ms,
        "error": (error or "")[:500] or None,
        "cost_usd": _cny_to_usd(est),
    }
    _enqueue(record)

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        # 没有 running loop（例如 CLI 自检脚本里直接调用）：退化为同步写
        try:
            asyncio.run_coroutine_threadsafe(_flush_one(record), asyncio.new_event_loop())
        except Exception:  # noqa: BLE001
            pass
        return
    loop.create_task(_flush_one(record))


def summarize_pending() -> int:
    """返回待落库条数（供健康检查 / CLI 使用）。"""
    return len(_pending)
