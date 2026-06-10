"""
模型路由与限流服务
支持多模型路由、权重、限流、熔断机制
"""
import asyncio
import time
from datetime import datetime, timezone
from collections import defaultdict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.admin import ModelRouting, AIModelCallLog

_RATE_COUNTERS: dict[str, list[float]] = defaultdict(list)
_RATE_LOCK = asyncio.Lock()


async def get_enabled_models(db: AsyncSession) -> list[ModelRouting]:
    result = await db.execute(
        select(ModelRouting).where(ModelRouting.is_enabled == True).order_by(ModelRouting.weight.desc())
    )
    return list(result.scalars().all())


async def route_model(db: AsyncSession, user_tier: str = "free") -> ModelRouting:
    models = await get_enabled_models(db)
    tier_models = [m for m in models if m.tier == user_tier]
    if not tier_models:
        tier_models = [m for m in models if m.tier == "free"]
    if not tier_models:
        tier_models = models
    if not tier_models:
        raise RuntimeError("No available AI models")

    async with _RATE_LOCK:
        model_weights = []
        for m in tier_models:
            if not await _check_rate_limit(m):
                continue
            weight = m.weight
            model_weights.append((m, weight))

        if not model_weights:
            for m in tier_models:
                if m.failover_to:
                    fallback = await db.get(ModelRouting, m.failover_to)
                    if fallback and fallback.is_enabled:
                        model_weights.append((fallback, fallback.weight))

        if not model_weights:
            model_weights = [(tier_models[0], tier_models[0].weight)]

    total_weight = sum(w for _, w in model_weights)
    import random
    r = random.uniform(0, total_weight)
    cumulative = 0
    for model, weight in model_weights:
        cumulative += weight
        if r <= cumulative:
            await _record_request(model.id)
            return model

    chosen = model_weights[-1][0]
    await _record_request(chosen.id)
    return chosen


async def _check_rate_limit(model: ModelRouting) -> bool:
    now = time.time()
    key = f"model:{model.id}"
    counters = _RATE_COUNTERS[key]
    cutoff_minute = now - 60
    counters = [t for t in counters if t > cutoff_minute]
    _RATE_COUNTERS[key] = counters

    if len(counters) >= model.rate_limit_per_minute:
        return False

    cutoff_hour = now - 3600
    hour_count = sum(1 for t in counters if t > cutoff_hour)
    if hour_count >= model.rate_limit_per_hour:
        return False

    return True


async def _record_request(model_id: str):
    _RATE_COUNTERS[f"model:{model_id}"].append(time.time())


async def record_model_call(
    db: AsyncSession,
    user_id: str | None,
    model_name: str,
    prompt_name: str | None,
    prompt_version: int | None,
    input_tokens: int | None,
    output_tokens: int | None,
    latency_ms: int | None,
    is_success: bool,
    error_message: str | None = None,
    cost_usd: float | None = None,
):
    log = AIModelCallLog(
        user_id=user_id,
        model_name=model_name,
        prompt_template_name=prompt_name,
        prompt_version=prompt_version,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        latency_ms=latency_ms,
        is_success=is_success,
        error_message=error_message,
        cost_usd=cost_usd,
    )
    db.add(log)
    await db.flush()

    if not is_success:
        result = await db.execute(
            select(ModelRouting).where(ModelRouting.model_name == model_name)
        )
        model = result.scalar_one_or_none()
        if model:
            model.consecutive_failures += 1
            if model.consecutive_failures >= model.max_consecutive_failures:
                model.is_enabled = False
                if model.failover_to:
                    fallback = await db.get(ModelRouting, model.failover_to)
                    if fallback:
                        fallback.is_enabled = True
            await db.flush()
    else:
        result = await db.execute(
            select(ModelRouting).where(ModelRouting.model_name == model_name)
        )
        model = result.scalar_one_or_none()
        if model:
            model.consecutive_failures = 0
            await db.flush()


async def get_model_stats(db: AsyncSession, hours: int = 24) -> dict:
    cutoff = datetime.now(timezone.utc)
    from datetime import timedelta
    cutoff = cutoff - timedelta(hours=hours)

    result = await db.execute(
        select(
            AIModelCallLog.model_name,
            func.count(AIModelCallLog.id).label("total"),
            func.sum(AIModelCallLog.is_success.cast(int)).label("success"),
            func.avg(AIModelCallLog.latency_ms).label("avg_latency"),
        ).where(AIModelCallLog.created_at >= cutoff).group_by(AIModelCallLog.model_name)
    )
    rows = result.all()
    return {
        row.model_name: {
            "total": row.total, "success": row.success or 0,
            "success_rate": round((row.success or 0) / row.total * 100, 1) if row.total else 0,
            "avg_latency_ms": round(row.avg_latency or 0, 1),
        }
        for row in rows
    }