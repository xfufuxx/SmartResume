"""人岗匹配：AI 岗位检索（主流程）+ 旧版手动岗位匹配（兼容保留）。

主流程（2026-11-28 起）
---------------------
``POST /api/match/discover``
    以简历为起点，AI 检索公开招聘信息/生成岗位画像，按技能、经验、学历、
    地点、薪资五维评估适配度。LLM 调用较慢，走「后台任务 + Redis 状态轮询」。

``GET /api/match/discover/{task_id}``
    查询检索进度与结果。

``GET /api/match/discover/latest?resume_id=``
    取该简历最近一次检索结果（刷新页面/切回页面时恢复，不用重新花额度）。

兼容保留
--------
``POST /api/match/`` 与 ``POST /api/match/rank``
    旧版「简历 × 用户自己上传的岗位」规则匹配。前端主流程已移除手动上传岗位的
    入口，接口保留供历史页面/脚本调用，不再作为主要功能。
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.deps import _get_redis_client, get_current_user, get_redis
from app.database import get_db
from app.models.job_image import JobImage
from app.models.resume import Resume
from app.models.user import User
from app.schemas.matching import MatchRequest, MatchResponse
from app.services.job_discovery import DEFAULT_JOBS, MAX_JOBS, MIN_JOBS, discover_jobs
from app.services.match_calculator import calculate_match
from app.services.task_recovery import is_stale

logger = logging.getLogger(__name__)

router = APIRouter()

TZ_SH = ZoneInfo("Asia/Shanghai")
TASK_TTL = 3600                 # 任务状态保留 1 小时（与优化任务一致）
LAST_RESULT_TTL = 7 * 86400     # 最近一次结果保留 7 天，供页面恢复
DISCOVERY_STALE_SECONDS = 1800  # 单次模型生成可达 6-7 分钟；30 分钟无心跳才判失败（前端另有 14 分钟上限）

_running_tasks: dict[str, asyncio.Task] = {}


# ─────────────────────────────────────────────────────────────
# 旧版：手动上传岗位的规则匹配（兼容保留）
# ─────────────────────────────────────────────────────────────
@router.post("/", response_model=MatchResponse)
async def match_resume_with_job(
    body: MatchRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """旧版单岗位匹配（规则引擎）。主流程已改为 AI 岗位检索，此处仅供兼容调用。"""
    resume_result = await db.execute(
        select(Resume).where(Resume.id == body.resume_id, Resume.user_id == user.id)
    )
    resume = resume_result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    if not resume.parsed_json:
        raise HTTPException(status_code=400, detail="Resume has not been parsed yet")

    job_result = await db.execute(
        select(JobImage).where(JobImage.id == body.job_id, JobImage.user_id == user.id)
    )
    job = job_result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job image not found")
    if not job.parsed_job_json:
        raise HTTPException(status_code=400, detail="Job has not been parsed yet")

    result = await calculate_match(resume.parsed_json, job.parsed_job_json)

    return MatchResponse(
        match_rate=result["match_rate"],
        missing_keywords=result["missing_keywords"],
    )


class RankRequest(BaseModel):
    resume_id: str
    limit: int | None = None


@router.post("/rank")
async def rank_jobs_for_resume(
    body: RankRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """旧版：一份简历 × 全部已解析岗位排序（纯规则引擎，不消耗 AI 额度）。

    前端主流程已不再使用（手动上传岗位退居次要入口），接口保留兼容。
    """
    resume_result = await db.execute(
        select(Resume).where(Resume.id == body.resume_id, Resume.user_id == user.id)
    )
    resume = resume_result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="简历不存在")
    if not resume.parsed_json:
        raise HTTPException(status_code=400, detail="该简历尚未解析完成")

    jobs = (
        await db.execute(
            select(JobImage)
            .where(JobImage.user_id == user.id, JobImage.deleted_at.is_(None))
            .order_by(JobImage.created_at.desc())
        )
    ).scalars().all()

    items: list[dict] = []
    skipped_items: list[dict] = []
    for j in jobs:
        if not j.parsed_job_json:
            skipped_items.append({
                "job_id": j.id,
                "title": j.title or "未命名岗位",
                "company": j.company or "",
                "category": j.category or "其他",
            })
            continue
        r = await calculate_match(resume.parsed_json, j.parsed_job_json)
        parsed = j.parsed_job_json or {}
        items.append({
            "job_id": j.id,
            "title": j.title or parsed.get("title") or "未命名岗位",
            "company": j.company or parsed.get("company") or "",
            "category": j.category or "其他",
            "match_rate": r["match_rate"],
            "missing_keywords": r["missing_keywords"],
            "is_favorite": bool(j.is_favorite),
        })

    items.sort(key=lambda x: x["match_rate"], reverse=True)
    if body.limit:
        items = items[: body.limit]

    scored = [i["match_rate"] for i in items]
    return {
        "resume_id": resume.id,
        "resume_title": resume.title or "简历",
        "total_jobs": len(jobs),
        "matched_jobs": len(items),
        "skipped_jobs": len(skipped_items),
        "skipped_items": skipped_items,
        "best_rate": max(scored) if scored else 0,
        "avg_rate": round(sum(scored) / len(scored), 1) if scored else 0,
        "items": items,
    }


# ─────────────────────────────────────────────────────────────
# AI 岗位检索（主流程）
# ─────────────────────────────────────────────────────────────
class DiscoverRequest(BaseModel):
    resume_id: str
    job_count: int = Field(default=DEFAULT_JOBS, ge=MIN_JOBS, le=MAX_JOBS)
    city: str | None = Field(default=None, max_length=40)
    direction: str | None = Field(default=None, max_length=60)
    salary: str | None = Field(default=None, max_length=40)
    industries: list[str] | None = Field(default=None, max_length=4)


def _task_key(task_id: str) -> str:
    return f"match_discover_task:{task_id}"


def _last_key(user_id: str, resume_id: str) -> str:
    return f"match_discover_last:{user_id}:{resume_id}"


def _quota_key(user_id: str, day: str | None = None) -> str:
    day = day or datetime.now(TZ_SH).date().isoformat()
    return f"match_discover_quota:{user_id}:{day}"


def _quota_limit() -> int:
    return max(1, int(getattr(settings, "JOB_DISCOVERY_DAILY_LIMIT", 20) or 20))


async def _consume_quota(redis: aioredis.Redis, user_id: str) -> tuple[int, int]:
    """扣一次检索额度；超限回滚计数并返回 (used, limit) 供调用方报错。"""
    key = _quota_key(user_id)
    used = await redis.incr(key)
    if used == 1:
        now = datetime.now(TZ_SH)
        tomorrow = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        await redis.expire(key, int((tomorrow - now).total_seconds()) + 60)
    limit = _quota_limit()
    if used > limit:
        await redis.decr(key)
    return used, limit


async def _refund_quota(redis: aioredis.Redis, user_id: str) -> None:
    """检索失败时退还额度（失败不该占用用户当天次数）。"""
    try:
        key = _quota_key(user_id)
        if await redis.get(key):
            await redis.decr(key)
    except Exception:  # noqa: BLE001
        logger.warning("[岗位检索] 退还额度失败", exc_info=True)


async def _write_task(redis: aioredis.Redis, task_id: str, payload: dict) -> None:
    payload = {**payload, "task_id": task_id, "updated_at": datetime.now(TZ_SH).isoformat()}
    try:
        await redis.setex(_task_key(task_id), TASK_TTL, json.dumps(payload, ensure_ascii=False))
    except Exception:  # noqa: BLE001 —— 状态写入失败不应中断检索本身
        logger.warning("[岗位检索] 状态写入失败 task=%s", task_id, exc_info=True)


def _spawn_task(task_id: str, coro, user_id: str = "") -> None:
    """登记后台任务；异常逃逸时兜底落 failed，避免前端无限等待。"""
    task = asyncio.create_task(coro)
    _running_tasks[task_id] = task

    def _cleanup(_t: asyncio.Task, _id: str = task_id, _uid: str = user_id) -> None:
        _running_tasks.pop(_id, None)
        exc = None if _t.cancelled() else _t.exception()
        if exc is None:
            return
        logger.error("[岗位检索] 任务 %s 异常逃逸: %s", _id, exc, exc_info=exc)
        asyncio.get_running_loop().create_task(
            _fail_task(_id, f"检索异常（{type(exc).__name__}）", _uid)
        )

    task.add_done_callback(_cleanup)


async def _fail_task(task_id: str, message: str, user_id: str = "") -> None:
    try:
        redis = _get_redis_client()
        await _write_task(redis, task_id, {
            "status": "failed",
            "progress": message,
            "user_id": user_id or None,
        })
    except Exception:  # noqa: BLE001
        logger.warning("[岗位检索] 兜底写 failed 失败 task=%s", task_id, exc_info=True)


async def _run_discovery(
    task_id: str,
    user_id: str,
    resume_id: str,
    resume_title: str,
    parsed: dict,
    body: DiscoverRequest,
) -> None:
    redis = _get_redis_client()
    state = {"text": "正在启动检索…", "start": time.monotonic(), "done": False}

    async def on_progress(text: str) -> None:
        state["text"] = text
        await _write_task(redis, task_id, {
            "status": "processing",
            "progress": text,
            "user_id": user_id,
            "resume_id": resume_id,
        })

    async def heartbeat() -> None:
        """LLM 生成阶段可能持续数分钟，定期刷新进度与心跳时间，避免像卡死。"""
        while True:
            await asyncio.sleep(30)
            if state["done"]:
                return
            elapsed = int(time.monotonic() - state["start"])
            await _write_task(redis, task_id, {
                "status": "processing",
                "progress": f'{state["text"]}（已用时 {elapsed // 60} 分 {elapsed % 60} 秒）',
                "user_id": user_id,
                "resume_id": resume_id,
            })

    hb = asyncio.create_task(heartbeat())
    try:
        result = await discover_jobs(
            parsed,
            job_count=body.job_count,
            city=body.city,
            direction=body.direction,
            salary=body.salary,
            industries=body.industries,
            on_progress=on_progress,
        )
        result["resume_id"] = resume_id
        result["resume_title"] = resume_title
        try:
            await redis.setex(
                _last_key(user_id, resume_id), LAST_RESULT_TTL,
                json.dumps(result, ensure_ascii=False),
            )
        except Exception:  # noqa: BLE001
            logger.warning("[岗位检索] 最近结果缓存失败", exc_info=True)
        state["done"] = True
        await _write_task(redis, task_id, {
            "status": "completed",
            "progress": "已完成",
            "user_id": user_id,
            "resume_id": resume_id,
            "result": result,
        })
    except asyncio.CancelledError:
        await _refund_quota(redis, user_id)
        raise
    except Exception as e:  # noqa: BLE001 —— 统一转成用户能懂的中文提示
        await _refund_quota(redis, user_id)
        logger.warning("[岗位检索] 失败 task=%s: %s", task_id, e, exc_info=True)
        msg = str(e) or "检索失败，请重试"
        state["done"] = True
        await _write_task(redis, task_id, {
            "status": "failed",
            "progress": msg,
            "user_id": user_id,
            "resume_id": resume_id,
        })
    finally:
        state["done"] = True
        hb.cancel()


@router.post("/discover")
async def discover_for_resume(
    body: DiscoverRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    redis: aioredis.Redis = Depends(get_redis),
):
    """提交一次 AI 岗位检索任务，立即返回 task_id。"""
    resume_result = await db.execute(
        select(Resume).where(
            Resume.id == body.resume_id,
            Resume.user_id == user.id,
            Resume.deleted_at.is_(None),
        )
    )
    resume = resume_result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="简历不存在")
    if not resume.parsed_json:
        raise HTTPException(status_code=400, detail="该简历尚未解析完成，请先完成解析再检索岗位")

    used, limit = await _consume_quota(redis, user.id)
    if used > limit:
        raise HTTPException(
            status_code=429,
            detail=f"今日 AI 岗位检索次数已用完（{limit} 次/天），明天 0 点后恢复",
        )

    task_id = str(uuid.uuid4())
    await _write_task(redis, task_id, {
        "status": "pending",
        "progress": "排队中…",
        "user_id": user.id,
        "resume_id": resume.id,
        "created_at": datetime.now(TZ_SH).isoformat(),
    })
    _spawn_task(task_id, _run_discovery(
        task_id, user.id, resume.id, resume.title or "简历", resume.parsed_json, body,
    ), user.id)
    return {
        "task_id": task_id,
        "status": "pending",
        "quota": {"used": used, "limit": limit, "remaining": max(0, limit - used)},
    }


@router.get("/discover/latest")
async def latest_discovery(
    resume_id: str = Query(..., min_length=1),
    user: User = Depends(get_current_user),
    redis: aioredis.Redis = Depends(get_redis),
):
    """返回该简历最近一次检索结果；没有则 result 为 null（前端展示空态）。"""
    raw = await redis.get(_last_key(user.id, resume_id))
    if not raw:
        return {"result": None}
    try:
        return {"result": json.loads(raw)}
    except json.JSONDecodeError:
        return {"result": None}


@router.get("/discover/quota")
async def discovery_quota(
    user: User = Depends(get_current_user),
    redis: aioredis.Redis = Depends(get_redis),
):
    """今日剩余检索次数（前端在按钮旁展示，避免用户点到 429 才知道）。"""
    try:
        used = int(await redis.get(_quota_key(user.id)) or 0)
    except (TypeError, ValueError):
        used = 0
    limit = _quota_limit()
    return {"used": used, "limit": limit, "remaining": max(0, limit - used)}


@router.get("/discover/{task_id}")
async def get_discovery_status(
    task_id: str,
    user: User = Depends(get_current_user),
    redis: aioredis.Redis = Depends(get_redis),
):
    """查询检索进度/结果；只能查看本人任务。"""
    raw = await redis.get(_task_key(task_id))
    if not raw:
        raise HTTPException(status_code=404, detail="任务不存在或已过期")
    try:
        info = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=404, detail="任务不存在或已过期")

    owner = info.get("user_id") or (info.get("result") or {}).get("user_id")
    if owner is not None and owner != user.id:
        raise HTTPException(status_code=404, detail="任务不存在或已过期")

    if info.get("status") in ("pending", "processing") and is_stale(
        info.get("updated_at"), DISCOVERY_STALE_SECONDS
    ):
        info["status"] = "failed"
        info["progress"] = "检索长时间无进展，已自动判定为失败，请重试"
        info["updated_at"] = datetime.now(TZ_SH).isoformat()
        await redis.setex(_task_key(task_id), TASK_TTL, json.dumps(info, ensure_ascii=False))

    return info
