"""可靠异步任务队列（P0）：任务恢复与悬挂自愈。

背景（产品优化建议 §16）：异步任务此前仅用 asyncio.create_task 在 Web 进程内执行，
服务器重启会导致任务中断——用户看到「页面持续等待 / 状态异常」。

本模块做两层可靠性保障（任务状态本身仍持久化在 Redis / 数据库，不引入独立
worker 进程；多进程部署时可平滑演进为 arq/Celery，见 docs）：

1. **启动恢复**（recover_interrupted_tasks，lifespan 调用）：
   Web 进程重启后，把三类任务中遗留的 pending/processing 状态统一判为 failed
   并写明原因——
   - AI 优化：Redis `optimize_task:{id}`
   - 面试押题：DB `interview_sessions.status=pending`
   - 批量优化：DB `batch_optimizations` + `batch_job_tasks`
2. **心跳超时兜底**（is_stale，各轮询端点调用）：
   执行进程异常死亡（未触发重启恢复）时，轮询端点依据最后心跳时间把超时任务
   判为 failed，前端立即收到明确错误而不是无限等待。
"""
import json
import logging
from datetime import datetime, timedelta, timezone

import redis.asyncio as aioredis
from sqlalchemy import update

from app.core.deps import _get_redis_client
from app.database import async_session_factory
from app.models.batch_optimization import BatchJobTask, BatchOptimization
from app.models.interview import InterviewSession

logger = logging.getLogger(__name__)

# 心跳超时阈值：优化任务（LLM+PDF，检查点即心跳）10 分钟；
# 面试押题为单次 LLM 调用，10 分钟；
# 批量优化逐岗位跑完整优化链，按 3 分钟/岗位 动态计算，下限 30 分钟。
OPTIMIZE_STALE_SECONDS = 600
INTERVIEW_STALE_SECONDS = 600
BATCH_STALE_SECONDS_PER_JOB = 180
BATCH_STALE_MIN_SECONDS = 1800

RETRY_HINT = "服务重启导致任务中断，请重试"
STALE_HINT = "任务长时间无进展，已自动判定为失败，请重试"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_ts(value) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        dt = datetime.fromisoformat(str(value))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def is_stale(updated_at, stale_seconds: int, now: datetime | None = None) -> bool:
    """任务最后心跳距今是否超过阈值（执行进程死亡兜底判定）。"""
    ts = _parse_ts(updated_at)
    if ts is None:
        return False  # 无时间戳（旧数据）不做判定，交由启动恢复处理
    return (now or _now()) - ts > timedelta(seconds=stale_seconds)


def batch_stale_seconds(total_jobs: int) -> int:
    return max(BATCH_STALE_MIN_SECONDS, BATCH_STALE_SECONDS_PER_JOB * max(total_jobs, 1))


async def recover_interrupted_tasks() -> dict:
    """启动时清理三类任务的中断遗留（幂等，可重复调用）。返回恢复统计用于日志。"""
    stats = {"optimize": 0, "interview": 0, "batch": 0, "batch_tasks": 0}
    now = _now()

    # ── AI 优化任务（Redis）──
    try:
        redis: aioredis.Redis = _get_redis_client()
        keys = [k async for k in redis.scan_iter(match="optimize_task:*", count=100)]
        for key in keys:
            try:
                raw = await redis.get(key)
                if not raw:
                    continue
                info = json.loads(raw)
                if info.get("status") in ("pending", "processing"):
                    info["status"] = "failed"
                    info["progress"] = RETRY_HINT
                    info["updated_at"] = now.isoformat()
                    ttl = await redis.ttl(key)
                    await redis.set(key, json.dumps(info), ex=ttl if ttl and ttl > 0 else 3600)
                    stats["optimize"] += 1
            except Exception:  # noqa: BLE001 单 key 异常不影响其它任务
                logger.warning("[任务恢复] 处理 Redis key 失败: %s", key, exc_info=True)
    except Exception:  # noqa: BLE001 Redis 不可用时跳过（登录等流程会显式报错）
        logger.warning("[任务恢复] Redis 不可用，跳过优化任务恢复", exc_info=True)

    # ── 面试押题 + 批量优化（DB）──
    try:
        async with async_session_factory() as db:
            # 面试押题：pending 即中断（生成中状态为 processing 也不存在，此任务只有 pending→done/failed）
            r = await db.execute(
                update(InterviewSession)
                .where(InterviewSession.status == "pending")
                .values(status="failed", error_message=RETRY_HINT)
            )
            stats["interview"] = r.rowcount or 0

            # 批量优化：批次与未完成子任务一并判失败
            r = await db.execute(
                update(BatchOptimization)
                .where(BatchOptimization.status.in_(("pending", "processing")))
                .values(status="failed", completed_at=now)
            )
            stats["batch"] = r.rowcount or 0
            r = await db.execute(
                update(BatchJobTask)
                .where(BatchJobTask.status.in_(("pending", "processing")))
                .values(status="failed", error_message=RETRY_HINT)
            )
            stats["batch_tasks"] = r.rowcount or 0

            await db.commit()
    except Exception:  # noqa: BLE001
        logger.warning("[任务恢复] DB 任务恢复失败", exc_info=True)

    if any(stats.values()):
        logger.info("[任务恢复] 启动清理中断任务: %s", stats)
    return stats
