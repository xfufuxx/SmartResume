import uuid
import json
import logging
import asyncio
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from app.database import get_db
from app.core.deps import get_current_user, get_redis, RateLimiter
from app.core.errors import app_err
from app.models.user import User
from app.models.resume import Resume
from app.models.job_image import JobImage
from app.models.optimized_resume import OptimizedResume
from app.schemas.optimization import (
    OptimizeRequest, OptimizeResponse, MatchAnalysis, DiffResponse,
    SatisfactionFeedbackRequest, QuickOptimizeRequest, RenderRequest, RenderTextRequest,
    UpdateContentRequest,
)
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
        raise app_err("PARSE_BEFORE_OPTIMIZE")

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
        "user_id": user.id,
        "created_at": datetime.now(TZ_UTC8).isoformat(),
    }))

    _spawn_task(task_id, _run_optimize_task_from_text(
        task_id, user.id, body.resume_text, body.job_text, body.custom_instructions, body.template
    ))

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
        raise app_err("OPTIMIZATION_NOT_FOUND")
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


# ── 在线编辑 + 重新导出 PDF ──

_ALLOWED_TEMPLATES = {
    "professional", "simple", "modern", "compact", "elegant", "dark", "fresh", "classic",
}


@router.put("/{opt_id}/content", response_model=OptimizeResponse)
async def update_optimized_content(
    opt_id: str,
    body: UpdateContentRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """在线微调 AI 优化结果（改摘要、增删经历要点、调整技能顺序等）。"""
    if not body.optimized_json:
        raise HTTPException(status_code=400, detail="内容不能为空")

    result = await db.execute(
        select(OptimizedResume).where(OptimizedResume.id == opt_id, OptimizedResume.user_id == user.id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="优化记录不存在")

    data = dict(body.optimized_json)
    # 保护个人信息：不允许通过编辑接口篡改姓名/联系方式等身份字段
    if record.optimized_json and isinstance(record.optimized_json.get("personal_info"), dict):
        data.setdefault("personal_info", record.optimized_json["personal_info"])
    if len(json.dumps(data, ensure_ascii=False)) > 200_000:
        raise HTTPException(status_code=413, detail="内容过长，请精简后再保存")

    record.optimized_json = data
    await db.commit()
    return _to_response(record)


@router.post("/{opt_id}/reexport")
async def reexport_pdf(
    opt_id: str,
    template: str = Query("professional", description="模板: professional/simple/modern/compact/elegant/dark/fresh/classic"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """按当前 optimized_json 重新生成 PDF（编辑内容后同步导出版式文件）。"""
    result = await db.execute(
        select(OptimizedResume).where(OptimizedResume.id == opt_id, OptimizedResume.user_id == user.id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="优化记录不存在")
    if not record.optimized_json:
        raise HTTPException(status_code=400, detail="该记录没有可导出的内容")

    if template not in _ALLOWED_TEMPLATES:
        template = "professional"

    from app.services.pdf_generator import generate_pdf

    try:
        pdf_bytes = await generate_pdf(record.optimized_json, f"{template}.html")
    except Exception as e:
        logger.error(f"[重新导出] PDF 生成失败 opt={opt_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"PDF 生成失败: {type(e).__name__}")

    pdf_key = f"optimized/{user.id}/{uuid.uuid4()}.pdf"
    new_url = await storage.upload_bytes(pdf_bytes, pdf_key, "application/pdf")

    old_url = record.pdf_url
    record.pdf_url = new_url
    await db.commit()

    if old_url:
        try:
            await storage.delete(old_url)
        except Exception:
            pass  # 旧文件清理失败不影响主流程

    return {"pdf_url": new_url, "template": template}


# ── 异步优化（任务队列 + 轮询） ──

_TASK_TTL = 3600  # 任务状态在 Redis 中保留 1 小时


# ── 任务取消（前端「停止优化」）──────────────────────────────────────
# 两级中断，保证点击停止后立刻回到可操作状态：
#   1) 进程内 asyncio.Task 注册表：直接 cancel 正在执行的任务，中断在途的 LLM / PDF 调用；
#   2) Redis 取消标记：跨进程兜底（多 worker 部署时，取消请求可能落在别的进程），
#      后台任务在每个进度检查点读取该标记，命中即中断，且不再写库。
_running_tasks: dict[str, asyncio.Task] = {}


class _TaskCancelled(Exception):
    """内部信号：任务被用户主动停止（需与执行失败区分开）。"""


def _cancel_key(task_id: str) -> str:
    return f"optimize_task_cancel:{task_id}"


def _spawn_task(task_id: str, coro) -> None:
    """登记并启动后台任务；任务结束（含被取消）后自动摘除登记。"""
    task = asyncio.create_task(coro)
    _running_tasks[task_id] = task
    task.add_done_callback(lambda _t, _id=task_id: _running_tasks.pop(_id, None))


async def _is_cancelled(redis: aioredis.Redis, task_id: str) -> bool:
    """任务是否已被标记停止；Redis 异常时不阻断正常流程。"""
    try:
        return bool(await redis.exists(_cancel_key(task_id)))
    except Exception:
        return False


async def _abort_if_cancelled(redis: aioredis.Redis, task_key: str) -> None:
    """写库前的最后一道护栏：任务已停止则中断，避免留下半成品优化记录。"""
    if await _is_cancelled(redis, task_key.split(":", 1)[-1]):
        raise _TaskCancelled()


async def _mark_task_cancelled(redis: aioredis.Redis, task_key: str) -> None:
    """把任务状态落为 cancelled；此处不再检查取消标记，失败也不抛出。"""
    try:
        await _update_status_impl(redis, task_key, "cancelled", "已停止优化")
    except Exception:
        pass


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
        raise app_err("PARSE_BEFORE_OPTIMIZE")

    task_id = str(uuid.uuid4())
    task_key = f"optimize_task:{task_id}"

    await redis.setex(task_key, _TASK_TTL, json.dumps({
        "status": "pending",
        "progress": "排队中...",
        "user_id": user.id,
        "created_at": datetime.now(TZ_UTC8).isoformat(),
    }))

    # 后台异步执行（登记到任务表，便于「停止优化」时立即取消）
    _spawn_task(task_id, _run_optimize_task(task_id, user.id, resume, job, body.custom_instructions, body.template))

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
    user: User = Depends(get_current_user),
):
    """查询异步优化任务状态（需登录，且只能查看本人任务，防止越权读取他人简历 PII）"""
    task_key = f"optimize_task:{task_id}"
    data = await redis.get(task_key)
    if not data:
        raise HTTPException(status_code=404, detail="任务不存在或已过期")

    task_info = json.loads(data)
    # 越权防护：任务归属（pending 时写顶层 user_id，完成后结果里也带 user_id）须与当前用户一致
    owner = task_info.get("user_id") or (task_info.get("result") or {}).get("user_id")
    if owner is not None and owner != user.id:
        raise HTTPException(status_code=404, detail="任务不存在或已过期")
    return task_info


@router.post("/async/{task_id}/cancel")
async def cancel_optimize_task(
    task_id: str,
    redis: aioredis.Redis = Depends(get_redis),
    user: User = Depends(get_current_user),
):
    """停止进行中的异步任务（AI 优化 / 一键优化 / PDF 渲染）。

    行为：
    - 置 Redis 取消标记（跨进程有效）并取消本进程内正在执行的任务，立即中断在途调用；
    - 后台任务随后把状态落为 cancelled，且不再写库（不会留下半成品记录）；
    - 幂等：任务已结束（completed/failed）时返回 cancelled=False，不报错。
    """
    task_key = f"optimize_task:{task_id}"
    data = await redis.get(task_key)
    if not data:
        raise HTTPException(status_code=404, detail="任务不存在或已过期")

    info = json.loads(data)
    owner = info.get("user_id") or (info.get("result") or {}).get("user_id")
    if owner is not None and owner != user.id:
        raise HTTPException(status_code=404, detail="任务不存在或已过期")

    status = info.get("status")
    if status in ("completed", "failed"):
        return {"task_id": task_id, "status": status, "cancelled": False}

    # ① 取消标记（跨进程兜底） ② 取消本进程内任务（立即中断在途 LLM / PDF 调用）
    await redis.setex(_cancel_key(task_id), _TASK_TTL, "1")
    task = _running_tasks.get(task_id)
    if task is not None and not task.done():
        task.cancel()

    # 等后台任务自己收尾写入 cancelled，避免与它的收尾写入互相覆盖
    for _ in range(20):
        fresh = await redis.get(task_key)
        if not fresh:
            break
        if json.loads(fresh).get("status") == "cancelled":
            break
        await asyncio.sleep(0.05)

    fresh = await redis.get(task_key)
    current = json.loads(fresh).get("status") if fresh else "cancelled"
    if current not in ("completed", "failed", "cancelled"):
        # 任务不在本进程（多 worker）或已异常退出：由本接口兜底落状态
        await _mark_task_cancelled(redis, task_key)
        current = "cancelled"

    return {"task_id": task_id, "status": current, "cancelled": current == "cancelled"}


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

        # 写库前最后护栏：已停止则不落库，并回收刚上传的 PDF，避免留下半成品记录与孤儿文件
        try:
            await _abort_if_cancelled(redis, task_key)
        except _TaskCancelled:
            try:
                await storage.delete(pdf_key)
            except Exception:
                pass
            raise

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

    except _TaskCancelled:
        # 命中取消标记：用户在检查点之间点了停止
        await _mark_task_cancelled(redis, task_key)
    except asyncio.CancelledError:
        # 进程内任务被直接取消（中断在途 LLM / PDF 调用）：落状态后继续上抛，保持“已取消”语义
        await _mark_task_cancelled(redis, task_key)
        raise
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

        # 7. 保存到数据库（写库前最后护栏：已停止则不落库，并回收刚上传的 PDF）
        try:
            await _abort_if_cancelled(redis, task_key)
        except _TaskCancelled:
            try:
                await storage.delete(pdf_key)
            except Exception:
                pass
            raise
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

    except _TaskCancelled:
        # 命中取消标记：用户在检查点之间点了停止
        await _mark_task_cancelled(redis, task_key)
    except asyncio.CancelledError:
        # 进程内任务被直接取消（中断在途 LLM / PDF 调用）：落状态后继续上抛，保持“已取消”语义
        await _mark_task_cancelled(redis, task_key)
        raise
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
    # 取消护栏：任务被停止后，后续任何 "processing" 进度写入都转为中断信号，
    # 使后台任务在下一个检查点立刻退出，不再继续消耗 LLM 与写库
    if status == "processing" and await _is_cancelled(redis, task_key.split(":", 1)[-1]):
        raise _TaskCancelled()
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


# ── 直接渲染（跳过 AI 优化，仅格式转化） ──

@router.post("/render")
async def render_resume(
    body: RenderRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    redis: aioredis.Redis = Depends(get_redis),
    _rl: None = Depends(_optimize_limiter),
):
    """跳过 AI 优化，直接将简历解析结果渲染为 PDF。

    用于测试 PDF 生成管线是否正常，不依赖 LLM 优化。
    """
    resume_result = await db.execute(
        select(Resume).where(Resume.id == body.resume_id, Resume.user_id == user.id)
    )
    resume = resume_result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    if not resume.parsed_json:
        raise HTTPException(status_code=400, detail="Resume has not been parsed yet")

    task_id = str(uuid.uuid4())
    task_key = f"optimize_task:{task_id}"

    await redis.setex(task_key, _TASK_TTL, json.dumps({
        "status": "pending",
        "progress": "正在准备渲染...",
        "user_id": user.id,
        "created_at": datetime.now(TZ_UTC8).isoformat(),
    }))

    template = body.template or "professional"
    _spawn_task(task_id, _run_render_task(task_id, user.id, resume, template))

    return {"task_id": task_id, "status": "pending"}


@router.post("/render-text")
async def render_resume_text(
    body: RenderTextRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    redis: aioredis.Redis = Depends(get_redis),
    _rl: None = Depends(_optimize_limiter),
):
    """跳过 AI 优化，解析简历文本后直接渲染为 PDF。

    用于测试：从个人中心保存的文本直接生成简历 PDF。
    """
    if not body.resume_text or not body.resume_text.strip():
        raise HTTPException(status_code=400, detail="简历文本不能为空")

    task_id = str(uuid.uuid4())
    task_key = f"optimize_task:{task_id}"

    await redis.setex(task_key, _TASK_TTL, json.dumps({
        "status": "pending",
        "progress": "正在解析文本...",
        "user_id": user.id,
        "created_at": datetime.now(TZ_UTC8).isoformat(),
    }))

    template = body.template or "professional"
    _spawn_task(task_id, _run_render_text_task(task_id, user.id, body.resume_text, template))

    return {"task_id": task_id, "status": "pending"}


async def _run_render_task(
    task_id: str,
    user_id: str,
    resume: Resume,
    template: str,
):
    """后台执行直接渲染任务（从已解析的简历 JSON）"""
    from app.database import async_session_factory
    from app.config import settings as app_config
    from app.services.pdf_generator import generate_pdf

    task_key = f"optimize_task:{task_id}"
    redis = None

    try:
        redis = aioredis.from_url(app_config.REDIS_URL, decode_responses=True)
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"渲染任务 {task_id} 无法连接 Redis: {e}")
        return

    try:
        parsed = resume.parsed_json
        name = (parsed.get("personal_info") or {}).get("name", "")

        logger.info(f"[渲染任务] 开始渲染: template={template}, template_name={template}.html, name={name}")

        await _update_status_impl(redis, task_key, "processing", "正在生成 PDF...")

        template_name = f"{template}.html"
        logger.info(f"[渲染任务] 调用 generate_pdf: template_name={template_name}")
        pdf_bytes = await generate_pdf(parsed, template_name)
        logger.info(f"[渲染任务] generate_pdf 返回: {len(pdf_bytes)} bytes")
        pdf_key = f"optimized/{user_id}/{uuid.uuid4()}.pdf"
        pdf_url = await storage.upload_bytes(pdf_bytes, pdf_key, "application/pdf")

        async with async_session_factory() as db:
            opt_record = OptimizedResume(
                user_id=user_id,
                resume_id=resume.id,
                original_json=parsed,
                optimized_json=parsed,  # 未优化，原样输出
                match_score=None,
                pdf_url=pdf_url,
                changes_description="（直接渲染模式，未进行 AI 优化）",
                job_title=name or "简历",
                category="其他",
                status="completed",
            )
            db.add(opt_record)
            await db.flush()
            await db.refresh(opt_record)
            await db.commit()

            response = _to_response(opt_record)

        await _update_status_impl(redis, task_key, "completed", "渲染完成", result=response.model_dump(mode="json"))

    except _TaskCancelled:
        await _mark_task_cancelled(redis, task_key)
    except asyncio.CancelledError:
        await _mark_task_cancelled(redis, task_key)
        raise
    except Exception as e:
        try:
            await _update_status_impl(redis, task_key, "failed", f"渲染失败: {str(e)[:200]}")
        except Exception:
            pass
    finally:
        if redis is not None:
            try:
                await redis.close()
            except Exception:
                pass


async def _run_render_text_task(
    task_id: str,
    user_id: str,
    resume_text: str,
    template: str,
):
    """后台执行直接渲染任务（从文本解析后生成 PDF）"""
    from app.database import async_session_factory
    from app.config import settings as app_config
    from app.services.resume_parser import parse_resume_text
    from app.services.pdf_generator import generate_pdf

    task_key = f"optimize_task:{task_id}"
    redis = None

    try:
        redis = aioredis.from_url(app_config.REDIS_URL, decode_responses=True)
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"渲染任务 {task_id} 无法连接 Redis: {e}")
        return

    try:
        await _update_status_impl(redis, task_key, "processing", "正在解析简历文本...")
        parsed = await parse_resume_text(resume_text)

        name = (parsed.get("personal_info") or {}).get("name", "")

        await _update_status_impl(redis, task_key, "processing", "正在生成 PDF...")

        template_name = f"{template}.html"
        pdf_bytes = await generate_pdf(parsed, template_name)
        pdf_key = f"optimized/{user_id}/{uuid.uuid4()}.pdf"
        pdf_url = await storage.upload_bytes(pdf_bytes, pdf_key, "application/pdf")

        async with async_session_factory() as db:
            opt_record = OptimizedResume(
                user_id=user_id,
                original_json=parsed,
                optimized_json=parsed,  # 未优化，原样输出
                match_score=None,
                pdf_url=pdf_url,
                changes_description="（直接渲染模式，未进行 AI 优化）",
                job_title=name or "简历",
                category="其他",
                status="completed",
            )
            db.add(opt_record)
            await db.flush()
            await db.refresh(opt_record)
            await db.commit()

            response = _to_response(opt_record)

        await _update_status_impl(redis, task_key, "completed", "渲染完成", result=response.model_dump(mode="json"))

    except _TaskCancelled:
        await _mark_task_cancelled(redis, task_key)
    except asyncio.CancelledError:
        await _mark_task_cancelled(redis, task_key)
        raise
    except Exception as e:
        try:
            await _update_status_impl(redis, task_key, "failed", f"渲染失败: {str(e)[:200]}")
        except Exception:
            pass
    finally:
        if redis is not None:
            try:
                await redis.close()
            except Exception:
                pass


# ── 模板测试（跳过 LLM，直接渲染 PDF） ──

_MOCK_RESUME_DATA = {
    "personal_info": {
        "name": "张三",
        "email": "zhangsan@example.com",
        "phone": "138-0000-0000",
    },
    "summary": "5年全栈开发经验，熟悉 Python、TypeScript、React、FastAPI。主导过多个中大型项目的架构设计与落地，具备良好的团队协作与技术攻关能力。",
    "experience": [
        {
            "title": "高级后端工程师",
            "company": "某科技有限公司",
            "start": "2021.06",
            "end": "至今",
            "points": [
                "主导微服务架构迁移，将单体应用拆分为 8 个独立服务，系统可用性从 99.5% 提升至 99.95%",
                "设计并实现统一网关层，支持限流、熔断、灰度发布，日均处理请求 500 万+",
                "推动 CI/CD 流水线自动化，部署频率从每周一次提升至每日多次",
            ],
        },
        {
            "title": "全栈开发工程师",
            "company": "另一家科技公司",
            "start": "2019.07",
            "end": "2021.05",
            "points": [
                "使用 React + FastAPI 开发内部数据平台，覆盖 200+ 日活用户",
                "优化 PostgreSQL 慢查询 30+ 条，平均响应时间降低 60%",
            ],
        },
    ],
    "education": [
        {
            "school": "某某大学",
            "degree": "硕士",
            "major": "计算机科学与技术",
            "start": "2017.09",
            "end": "2019.06",
        },
        {
            "school": "某某大学",
            "degree": "学士",
            "major": "软件工程",
            "start": "2013.09",
            "end": "2017.06",
        },
    ],
    "skills": ["Python", "TypeScript", "React", "FastAPI", "PostgreSQL", "Docker", "Kubernetes", "Redis", "Git"],
    "projects": [
        {
            "name": "智能简历优化系统",
            "description": "基于 AI 的简历分析与优化平台，支持多种格式导入、智能内容优化、多模板 PDF 导出。",
            "tech": ["FastAPI", "React", "Playwright", "SQLAlchemy"],
        },
    ],
}


@router.post("/test-template")
async def test_template(
    template: str = Query("professional", description="模板名称: professional, simple, modern, compact, elegant, dark, fresh, classic"),
    body: dict | None = None,
    user: User = Depends(get_current_user),  # 防止未登录被刷爆渲染；上线前应改为 admin 鉴权或下线
):
    """测试模板渲染（跳过 LLM 优化，直接用数据生成 PDF）

    用法:
      POST /api/optimize/test-template?template=professional
      POST /api/optimize/test-template?template=modern  （body 可传自定义 resume JSON）
    """
    from app.services.pdf_generator import generate_pdf

    data = (body or {}).get("resume_data") or _MOCK_RESUME_DATA
    template_name = f"{template}.html"

    try:
        pdf_bytes = await generate_pdf(data, template_name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF 生成失败: {type(e).__name__}: {e}")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="test_{template}.pdf"'},
    )


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