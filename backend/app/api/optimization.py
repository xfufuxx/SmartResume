import uuid
import json
import asyncio
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from app.database import get_db
from app.core.deps import get_current_user, get_redis, RateLimiter
from app.models.user import User
from app.models.resume import Resume
from app.models.job_image import JobImage
from app.models.optimized_resume import OptimizedResume
from app.schemas.optimization import OptimizeRequest, OptimizeResponse, MatchAnalysis, DiffResponse, SatisfactionFeedbackRequest, QuickOptimizeRequest
from app.services.agent_optimizer import analyze_match, optimize_resume, generate_changes_description
from app.services.storage import storage
from app.services.pdf_styler import _generate_styled_or_fallback

import redis.asyncio as aioredis

router = APIRouter()
TZ_UTC8 = timezone(timedelta(hours=8))

CATEGORIES = ["产品", "开发", "运营", "设计", "市场", "销售", "其他"]

# 优化接口速率限制：每用户每分钟最多 3 次
_optimize_limiter = RateLimiter(max_requests=3, window_seconds=60)


def _to_response(r: OptimizedResume) -> OptimizeResponse:
    return OptimizeResponse(
        id=r.id, resume_id=r.resume_id, job_image_id=r.job_image_id,
        optimized_json=r.optimized_json, original_json=r.original_json,
        changes_description=r.changes_description, custom_instructions=r.custom_instructions,
        pdf_url=r.pdf_url, match_score=r.match_score,
        job_title=r.job_title, company=r.company, category=r.category,
        thumbnail_url=r.thumbnail_url, is_favorite=r.is_favorite,
        satisfaction_score=r.satisfaction_score, feedback_text=r.feedback_text,
        parent_record_id=r.parent_record_id, refine_count=r.refine_count,
        deleted_at=r.deleted_at, status=r.status, created_at=r.created_at,
    )


@router.post("/", response_model=OptimizeResponse)
async def optimize(
    body: OptimizeRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    _rl: None = Depends(_optimize_limiter),
):
    resume_result = await db.execute(
        select(Resume).where(Resume.id == body.resume_id, Resume.user_id == user.id)
    )
    resume = resume_result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    job_result = await db.execute(
        select(JobImage).where(JobImage.id == body.job_image_id, JobImage.user_id == user.id)
    )
    job = job_result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job image not found")

    if not resume.parsed_json or not job.parsed_job_json:
        raise HTTPException(status_code=400, detail="Resume or Job has not been parsed yet")

    job_title = job.parsed_job_json.get("title", "")
    company = job.parsed_job_json.get("company", "")
    category = _guess_category(job_title)

    match_result = await analyze_match(resume.parsed_json, job.parsed_job_json)
    optimized = await optimize_resume(
        resume.parsed_json, job.parsed_job_json,
        match_result.get("rewrite_strategy", {}),
        body.custom_instructions,
    )
    changes = await generate_changes_description(resume.parsed_json, optimized)

    # ── 生成 PDF（版式保留优先，回退模板） ──
    pdf_bytes = await _generate_styled_or_fallback(resume, optimized, job.parsed_job_json, body.custom_instructions)
    pdf_key = f"optimized/{user.id}/{uuid.uuid4()}.pdf"
    pdf_url = await storage.upload_bytes(pdf_bytes, pdf_key, "application/pdf")

    opt_record = OptimizedResume(
        user_id=user.id, resume_id=resume.id, job_image_id=job.id,
        original_json=resume.parsed_json, optimized_json=optimized,
        match_score=match_result.get("match_score"), pdf_url=pdf_url,
        changes_description=changes, custom_instructions=body.custom_instructions,
        job_title=job_title or None, company=company or None, category=category,
        thumbnail_url=job.image_url, status="completed",
    )
    db.add(opt_record)
    await db.flush()
    await db.refresh(opt_record)
    await db.commit()

    resp = _to_response(opt_record)
    resp.match_analysis = MatchAnalysis(
        match_score=match_result.get("match_score", 0),
        strengths=match_result.get("strengths", []),
        gaps=match_result.get("gaps", []),
        rewrite_strategy=match_result.get("rewrite_strategy", {}),
    )
    return resp


@router.get("/", response_model=list[OptimizeResponse])
async def list_optimizations(
    q: str = Query("", description="搜索关键词"),
    category: str = Query("", description="分类筛选"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(OptimizedResume).where(
        OptimizedResume.user_id == user.id,
        OptimizedResume.deleted_at.is_(None),
    ).order_by(OptimizedResume.created_at.desc())

    if category and category != "全部":
        stmt = stmt.where(OptimizedResume.category == category)

    result = await db.execute(stmt)
    records = result.scalars().all()

    if q:
        q_lower = q.lower()
        records = [
            r for r in records
            if (r.job_title and q_lower in r.job_title.lower())
            or (r.company and q_lower in r.company.lower())
            or (r.changes_description and q_lower in r.changes_description.lower())
        ]

    return [_to_response(r) for r in records]


@router.get("/categories")
async def list_categories(
    user: User = Depends(get_current_user),
):
    return CATEGORIES


@router.get("/favorites", response_model=list[OptimizeResponse])
async def list_favorites(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(OptimizedResume).where(
            OptimizedResume.user_id == user.id,
            OptimizedResume.is_favorite == True,
            OptimizedResume.deleted_at.is_(None),
        ).order_by(OptimizedResume.created_at.desc())
    )
    return [_to_response(r) for r in result.scalars().all()]


@router.post("/{opt_id}/favorite")
async def toggle_favorite(
    opt_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(OptimizedResume).where(OptimizedResume.id == opt_id, OptimizedResume.user_id == user.id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    record.is_favorite = not record.is_favorite
    await db.commit()
    return {"is_favorite": record.is_favorite}


@router.get("/trash", response_model=list[OptimizeResponse])
async def list_trash(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(OptimizedResume).where(
            OptimizedResume.user_id == user.id,
            OptimizedResume.deleted_at.isnot(None),
        ).order_by(OptimizedResume.deleted_at.desc())
    )
    return [_to_response(r) for r in result.scalars().all()]


@router.post("/{opt_id}/trash")
async def soft_delete(
    opt_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(OptimizedResume).where(OptimizedResume.id == opt_id, OptimizedResume.user_id == user.id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    record.deleted_at = datetime.now(TZ_UTC8)
    record.is_favorite = False
    await db.commit()
    return {"detail": "已移至回收站"}


@router.post("/{opt_id}/restore")
async def restore(
    opt_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(OptimizedResume).where(OptimizedResume.id == opt_id, OptimizedResume.user_id == user.id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    record.deleted_at = None
    await db.commit()
    return {"detail": "已恢复"}


@router.delete("/{opt_id}")
async def permanent_delete(
    opt_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(OptimizedResume).where(OptimizedResume.id == opt_id, OptimizedResume.user_id == user.id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    if record.pdf_url:
        await storage.delete(record.pdf_url)
    await db.delete(record)
    await db.commit()
    return {"detail": "已永久删除"}


@router.get("/diff", response_model=DiffResponse)
async def diff_versions(
    id1: str = Query(...),
    id2: str = Query(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(OptimizedResume).where(
            OptimizedResume.id.in_([id1, id2]),
            OptimizedResume.user_id == user.id,
        )
    )
    records = {r.id: r for r in result.scalars().all()}
    a = records.get(id1)
    b = records.get(id2)
    if not a or not b:
        raise HTTPException(status_code=404, detail="记录不存在")

    diff_summary = _compute_diff_summary(a, b)
    return DiffResponse(record_a=_to_response(a), record_b=_to_response(b), diff_summary=diff_summary)


# ── 我的信息：从个人中心 saved_texts 一键优化 ──

@router.post("/quick")
async def optimize_quick(
    body: QuickOptimizeRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    redis: aioredis.Redis = Depends(get_redis),
    _rl: None = Depends(_optimize_limiter),
):
    """一键优化：使用个人中心中保存的简历文本和岗位文本直接优化"""
    if not body.resume_text or not body.resume_text.strip():
        raise HTTPException(status_code=400, detail="简历文本不能为空")
    if not body.job_text or not body.job_text.strip():
        raise HTTPException(status_code=400, detail="岗位文本不能为空")

    task_id = str(uuid.uuid4())
    task_key = f"optimize_task:{task_id}"

    await redis.setex(task_key, _TASK_TTL, json.dumps({
        "status": "pending",
        "progress": "正在解析文本...",
        "created_at": datetime.now(TZ_UTC8).isoformat(),
    }))

    asyncio.create_task(
        _run_optimize_task_from_text(
            task_id, user.id, body.resume_text, body.job_text, body.custom_instructions, body.template
        )
    )

    return {"task_id": task_id, "status": "pending"}


@router.get("/{opt_id}", response_model=OptimizeResponse)
async def get_optimization(
    opt_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(OptimizedResume).where(OptimizedResume.id == opt_id, OptimizedResume.user_id == user.id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Optimization not found")
    return _to_response(record)


@router.post("/{opt_id}/feedback")
async def submit_satisfaction(
    opt_id: str,
    body: SatisfactionFeedbackRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if body.satisfaction_score < 1 or body.satisfaction_score > 5:
        raise HTTPException(status_code=400, detail="评分需在 1-5 之间")
    if body.feedback_text and len(body.feedback_text) > 200:
        raise HTTPException(status_code=400, detail="反馈文字不能超过200字")

    result = await db.execute(
        select(OptimizedResume).where(OptimizedResume.id == opt_id, OptimizedResume.user_id == user.id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="优化记录不存在")
    if record.satisfaction_score is not None:
        raise HTTPException(status_code=409, detail="该记录已评价过")

    record.satisfaction_score = body.satisfaction_score
    record.feedback_text = body.feedback_text
    await db.commit()

    return {"detail": "评价已提交"}


# ── 异步优化（任务队列 + 轮询） ──

_TASK_TTL = 3600  # 任务状态在 Redis 中保留 1 小时


@router.post("/async")
async def optimize_async(
    body: OptimizeRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    redis: aioredis.Redis = Depends(get_redis),
    _rl: None = Depends(_optimize_limiter),
):
    """提交异步优化任务，立即返回 task_id"""
    resume_result = await db.execute(
        select(Resume).where(Resume.id == body.resume_id, Resume.user_id == user.id)
    )
    resume = resume_result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    job_result = await db.execute(
        select(JobImage).where(JobImage.id == body.job_image_id, JobImage.user_id == user.id)
    )
    job = job_result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job image not found")

    if not resume.parsed_json or not job.parsed_job_json:
        raise HTTPException(status_code=400, detail="Resume or Job has not been parsed yet")

    task_id = str(uuid.uuid4())
    task_key = f"optimize_task:{task_id}"

    await redis.setex(task_key, _TASK_TTL, json.dumps({
        "status": "pending",
        "progress": "排队中...",
        "created_at": datetime.now(TZ_UTC8).isoformat(),
    }))

    # 后台异步执行
    asyncio.create_task(
        _run_optimize_task(task_id, user.id, resume, job, body.custom_instructions, body.template)
    )

    return {"task_id": task_id, "status": "pending"}


def _compute_diff_summary(a: OptimizedResume, b: OptimizedResume) -> str:
    parts = []
    if a.match_score and b.match_score:
        parts.append(f"匹配分: {a.match_score} → {b.match_score} ({b.match_score - a.match_score:+d})")
    if a.company != b.company:
        parts.append(f"公司: {a.company or '-'} → {b.company or '-'}")
    if a.job_title != b.job_title:
        parts.append(f"岗位: {a.job_title or '-'} → {b.job_title or '-'}")
    parts.append(f"A: {a.created_at}, B: {b.created_at}")
    return " | ".join(parts) if parts else "无显著差异"


@router.get("/async/{task_id}")
async def get_optimize_status(
    task_id: str,
    redis: aioredis.Redis = Depends(get_redis),
):
    """查询异步优化任务状态"""
    task_key = f"optimize_task:{task_id}"
    data = await redis.get(task_key)
    if not data:
        raise HTTPException(status_code=404, detail="任务不存在或已过期")

    task_info = json.loads(data)
    return task_info


async def _run_optimize_task(
    task_id: str,
    user_id: str,
    resume: Resume,
    job: JobImage,
    custom_instructions: str | None,
    template: str | None = None,
):
    """后台执行优化任务，完成后更新 Redis 状态"""
    from app.database import async_session_factory
    from app.config import settings as app_config

    task_key = f"optimize_task:{task_id}"
    redis = None

    # 初始化 Redis 连接
    try:
        redis = aioredis.from_url(app_config.REDIS_URL, decode_responses=True)
    except Exception as e:
        # Redis 不可达，任务无法追踪，直接返回
        import logging
        logging.getLogger(__name__).error(f"优化任务 {task_id} 无法连接 Redis: {e}")
        return

    try:
        await _update_status_impl(redis, task_key, "processing", "正在分析匹配度...")

        match_result = await analyze_match(resume.parsed_json, job.parsed_job_json)

        await _update_status_impl(redis, task_key, "processing", "正在优化简历内容...")

        optimized = await optimize_resume(
            resume.parsed_json, job.parsed_job_json,
            match_result.get("rewrite_strategy", {}),
            custom_instructions,
        )

        await _update_status_impl(redis, task_key, "processing", "正在生成修改说明...")

        changes = await generate_changes_description(resume.parsed_json, optimized)

        await _update_status_impl(redis, task_key, "processing", "正在生成 PDF...")

        pdf_bytes = await _generate_styled_or_fallback(resume, optimized, job.parsed_job_json, custom_instructions, template)
        pdf_key = f"optimized/{user_id}/{uuid.uuid4()}.pdf"
        pdf_url = await storage.upload_bytes(pdf_bytes, pdf_key, "application/pdf")

        # 保存到数据库
        job_title = job.parsed_job_json.get("title", "")
        company = job.parsed_job_json.get("company", "")
        category = _guess_category(job_title)

        async with async_session_factory() as db:
            opt_record = OptimizedResume(
                user_id=user_id, resume_id=resume.id, job_image_id=job.id,
                original_json=resume.parsed_json, optimized_json=optimized,
                match_score=match_result.get("match_score"), pdf_url=pdf_url,
                changes_description=changes, custom_instructions=custom_instructions,
                job_title=job_title or None, company=company or None, category=category,
                thumbnail_url=job.image_url, status="completed",
            )
            db.add(opt_record)
            await db.flush()
            await db.refresh(opt_record)
            await db.commit()

            response = _to_response(opt_record)
            response.match_analysis = MatchAnalysis(
                match_score=match_result.get("match_score", 0),
                strengths=match_result.get("strengths", []),
                gaps=match_result.get("gaps", []),
                rewrite_strategy=match_result.get("rewrite_strategy", {}),
            )

        await _update_status_impl(redis, task_key, "completed", "优化完成", result=response.model_dump(mode="json"))

    except Exception as e:
        try:
            await _update_status_impl(redis, task_key, "failed", f"优化失败: {str(e)[:200]}")
        except Exception:
            pass
    finally:
        if redis is not None:
            try:
                await redis.close()
            except Exception:
                pass


async def _run_optimize_task_from_text(
    task_id: str,
    user_id: str,
    resume_text: str,
    job_text: str,
    custom_instructions: str | None,
    template: str | None = None,
):
    """后台执行基于文本的一键优化任务（从个人中心 saved_texts）"""
    from app.database import async_session_factory
    from app.config import settings as app_config
    from app.services.resume_parser import parse_resume_text
    from app.services.job_parser import parse_job_text

    task_key = f"optimize_task:{task_id}"
    redis = None

    try:
        redis = aioredis.from_url(app_config.REDIS_URL, decode_responses=True)
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"优化任务 {task_id} 无法连接 Redis: {e}")
        return

    try:
        # 1. 解析简历文本
        await _update_status_impl(redis, task_key, "processing", "正在解析简历文本...")
        parsed_resume = await parse_resume_text(resume_text)

        # 2. 解析岗位文本
        await _update_status_impl(redis, task_key, "processing", "正在解析岗位文本...")
        parsed_job = await parse_job_text(job_text)

        job_title = parsed_job.get("title", "")
        company = parsed_job.get("company", "")
        category = _guess_category(job_title)

        # 3. 匹配分析
        await _update_status_impl(redis, task_key, "processing", "正在分析匹配度...")
        match_result = await analyze_match(parsed_resume, parsed_job)

        # 4. 优化简历
        await _update_status_impl(redis, task_key, "processing", "正在优化简历内容...")
        optimized = await optimize_resume(
            parsed_resume, parsed_job,
            match_result.get("rewrite_strategy", {}),
            custom_instructions,
        )

        # 5. 生成修改说明
        await _update_status_impl(redis, task_key, "processing", "正在生成修改说明...")
        changes = await generate_changes_description(parsed_resume, optimized)

        # 6. 生成 PDF（使用选定的模板方案）
        await _update_status_impl(redis, task_key, "processing", f"正在使用 {template or 'professional'} 方案生成 PDF...")
        pdf_bytes = await _generate_styled_or_fallback(None, optimized, parsed_job, custom_instructions, template)
        pdf_key = f"optimized/{user_id}/{uuid.uuid4()}.pdf"
        pdf_url = await storage.upload_bytes(pdf_bytes, pdf_key, "application/pdf")

        # 7. 保存到数据库
        async with async_session_factory() as db:
            opt_record = OptimizedResume(
                user_id=user_id,
                original_json=parsed_resume,
                optimized_json=optimized,
                match_score=match_result.get("match_score"),
                pdf_url=pdf_url,
                changes_description=changes,
                custom_instructions=custom_instructions,
                job_title=job_title or None,
                company=company or None,
                category=category,
                status="completed",
            )
            db.add(opt_record)
            await db.flush()
            await db.refresh(opt_record)
            await db.commit()

            response = _to_response(opt_record)
            response.match_analysis = MatchAnalysis(
                match_score=match_result.get("match_score", 0),
                strengths=match_result.get("strengths", []),
                gaps=match_result.get("gaps", []),
                rewrite_strategy=match_result.get("rewrite_strategy", {}),
            )

        await _update_status_impl(redis, task_key, "completed", "优化完成", result=response.model_dump(mode="json"))

    except Exception as e:
        try:
            await _update_status_impl(redis, task_key, "failed", f"优化失败: {str(e)[:200]}")
        except Exception:
            pass
    finally:
        if redis is not None:
            try:
                await redis.close()
            except Exception:
                pass


async def _update_status_impl(redis: aioredis.Redis, task_key: str, status: str, progress: str, **extra):
    existing = await redis.get(task_key)
    if not existing:
        import logging
        logging.getLogger(__name__).warning(f"任务状态 key 不存在: {task_key}（可能已过期或 Redis 重启）")
        return
    info = json.loads(existing)
    info["status"] = status
    info["progress"] = progress
    info.update(extra)
    await redis.setex(task_key, _TASK_TTL, json.dumps(info))


def _guess_category(title: str) -> str:
    t = title.lower()
    if any(w in t for w in ["开发", "工程师", "后端", "前端", "算法", "architect", "developer"]):
        return "开发"
    if any(w in t for w in ["产品", "product"]):
        return "产品"
    if any(w in t for w in ["运营", "operation"]):
        return "运营"
    if any(w in t for w in ["设计", "designer", "ui", "ux"]):
        return "设计"
    if any(w in t for w in ["市场", "marketing", "销售"]):
        return "市场"
    return "其他"


def _compute_diff_summary(a: OptimizedResume, b: OptimizedResume) -> str:
    parts = []
    if a.match_score and b.match_score:
        parts.append(f"匹配分: {a.match_score} → {b.match_score} ({b.match_score - a.match_score:+d})")
    if a.company != b.company:
        parts.append(f"公司: {a.company or '-'} → {b.company or '-'}")
    if a.job_title != b.job_title:
        parts.append(f"岗位: {a.job_title or '-'} → {b.job_title or '-'}")
    parts.append(f"A: {a.created_at}, B: {b.created_at}")
    return " | ".join(parts) if parts else "无显著差异"