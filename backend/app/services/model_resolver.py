"""优化链路的模型路由解析：优先 model_routing 表动态路由，异常/空表回退 settings 默认模型。

model_router 原本只服务管理后台统计，主链路始终用 settings.LLM_MODEL_TEXT。
本模块把两者接起来，同时保证：路由表为空 / DB 不可用 / 任何异常时，
行为与接线前完全一致（回退默认模型），并通过 60s 进程内缓存避免每请求查库。
"""
import logging
import time

from app.config import settings

logger = logging.getLogger(__name__)

_CACHE_TTL = 60.0  # 秒：路由结果与回退结果都缓存，避免路由表不可用时每请求空查库
_cache: dict[str, tuple[float, str]] = {}  # kind -> (过期时间点, 模型名)


async def resolve_model_name(kind: str = "text", user_tier: str = "free") -> str:
    """解析当前应使用的模型名。任何失败都静默回退到 settings 默认模型。"""
    now = time.monotonic()
    hit = _cache.get(kind)
    if hit and hit[0] > now:
        return hit[1]

    fallback = settings.LLM_MODEL_VISION if kind == "vision" else settings.LLM_MODEL_TEXT
    model = fallback
    try:
        from app.database import async_session_factory
        from app.services.model_router import route_model_name

        async with async_session_factory() as db:
            name = await route_model_name(db, user_tier=user_tier, kind=kind)
        if name:
            model = name
            if model != fallback:
                logger.info("[模型路由] kind=%s 命中路由表: %s", kind, model)
    except Exception as e:  # noqa: BLE001 —— 路由是增强项，绝不允许阻断主链路
        logger.info("[模型路由] 路由表不可用，回退默认模型 %s: %s", fallback, e)

    _cache[kind] = (now + _CACHE_TTL, model)
    return model


async def report_model_result(model_name: str, ok: bool) -> None:
    """把优化链路的调用结果回写到路由熔断器（连续失败自动禁用 + failover）。"""
    try:
        from app.database import async_session_factory
        from app.services.model_router import update_model_health

        async with async_session_factory() as db:
            await update_model_health(db, model_name, ok)
            await db.commit()
    except Exception as e:  # noqa: BLE001
        logger.info("[模型路由] 结果回写失败（忽略）: %s", e)
