import uuid
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, update, delete

from app.database import get_db
from app.core.deps import get_current_user
from app.config import settings
from app.core.errors import app_err
from app.core.file_security import validate_file_magic
from app.models.user import User
from app.models.job_image import JobImage
from app.models.interview_track import InterviewTrack
from app.models.application import Application
from app.schemas.job import (
    JobImageResponse, JobUpdateRequest, JobBatchActionRequest,
    JobCreateRequest, JobBatchCreateRequest,
)
from app.services.job_parser import parse_job_from_bytes
from app.services.job_completeness import merge_parsed_jobs, check_completeness
from app.services.storage import storage
from app.services.text_formatter import format_job_text

logger = logging.getLogger(__name__)

router = APIRouter()
TZ_UTC8 = timezone(timedelta(hours=8))

CATEGORIES = ["产品", "开发", "运营", "设计", "市场", "销售", "其他"]
JOB_STATUSES = ["投递中", "面试中", "已录用", "已拒绝"]
ALLOWED_IMAGE_EXTS = ("png", "jpg", "jpeg", "webp")
MAX_MERGE_IMAGES = 6  # 单次多图综合识别的图片上限


def _guess_category(title: str) -> str:
    if not title:
        return "其他"
    t = title.lower()
    if any(w in t for w in ["开发", "工程师", "后端", "前端", "算法", "architect", "developer", "java", "python", "go"]):
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


@router.post("/upload", response_model=JobImageResponse)
async def upload_job_image(
    file: UploadFile = File(...),
    use_ocr: bool = Query(False, description="Force OCR fallback"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ext = file.filename.split(".")[-1].lower() if file.filename else "unknown"
    if ext not in ("png", "jpg", "jpeg", "webp"):
        raise app_err("FILE_TYPE_INVALID")

    content = await file.read()
    if len(content) > settings.MAX_UPLOAD_SIZE:
        raise app_err("FILE_TOO_LARGE")

    # 真实文件类型校验（防「改扩展名上传恶意文件」）
    validate_file_magic(content, ext)

    filename = file.filename or f"job.{ext}"

    key = f"job-images/{user.id}/{uuid.uuid4()}.{ext}"
    file_url = await storage.upload_bytes(content, key)

    try:
        result = await parse_job_from_bytes(content, filename, use_ocr_fallback=use_ocr)
    except ValueError as e:
        logger.error(f"岗位图片解析失败: {e}")
        raise app_err("JOB_PARSE_FAILED")
    except Exception as e:
        logger.error(f"岗位图片解析异常: {e}", exc_info=True)
        raise app_err("JOB_PARSE_FAILED")

    parsed = result.get("parsed_job_json") or {}
    title = parsed.get("title", "")
    company = parsed.get("company", "")
    category = _guess_category(title)

    # 如果用户还没有默认岗位，自动设为默认
    existing = await db.execute(
        select(JobImage).where(
            JobImage.user_id == user.id,
            JobImage.deleted_at.is_(None),
            JobImage.is_primary == True,
        )
    )
    has_primary = existing.scalar_one_or_none() is not None

    job_image = JobImage(
        user_id=user.id,
        image_url=file_url,
        parsed_job_json=result["parsed_job_json"],
        ocr_text=result.get("ocr_text"),
        title=title or None,
        company=company or None,
        category=category,
        is_primary=not has_primary,
    )
    db.add(job_image)

    # 将解析后的岗位信息转为可读文字保存到用户个人信息中
    job_text = format_job_text(parsed)
    if job_text:
        if not user.saved_texts:
            user.saved_texts = {}
        user.saved_texts = {**user.saved_texts, "job_text": job_text}

    await db.flush()
    await db.refresh(job_image)
    await db.commit()

    return job_image


@router.get("/categories")
async def list_categories():
    return CATEGORIES


@router.get("/favorites", response_model=list[JobImageResponse])
async def list_favorites(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(JobImage).where(
            JobImage.user_id == user.id,
            JobImage.is_favorite == True,
            JobImage.deleted_at.is_(None),
        ).order_by(JobImage.created_at.desc())
    )
    return result.scalars().all()


@router.get("/trash", response_model=list[JobImageResponse])
async def list_trash(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(JobImage).where(
            JobImage.user_id == user.id,
            JobImage.deleted_at.isnot(None),
        ).order_by(JobImage.deleted_at.desc())
    )
    return result.scalars().all()


@router.get("/", response_model=list[JobImageResponse])
async def list_job_images(
    q: str = Query("", description="搜索关键词"),
    category: str = Query("", description="分类筛选"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(JobImage).where(
        JobImage.user_id == user.id,
        JobImage.deleted_at.is_(None),
    ).order_by(JobImage.is_primary.desc(), JobImage.created_at.desc())

    if category and category != "全部":
        stmt = stmt.where(JobImage.category == category)

    result = await db.execute(stmt)
    jobs = result.scalars().all()

    if q:
        q_lower = q.lower()
        jobs = [
            j for j in jobs
            if (j.title and q_lower in j.title.lower())
            or (j.company and q_lower in j.company.lower())
        ]

    return jobs


@router.post("/create", response_model=JobImageResponse)
async def create_job(
    body: JobCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """手动创建职位（无需图片）：前端填写字段直接入库"""
    title = (body.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="请填写职位标题")

    category = body.category or _guess_category(title)

    existing = await db.execute(
        select(JobImage).where(
            JobImage.user_id == user.id,
            JobImage.deleted_at.is_(None),
            JobImage.is_primary == True,
        )
    )
    has_primary = existing.scalar_one_or_none() is not None

    parsed = body.parsed_job_json or {}
    job_image = JobImage(
        user_id=user.id,
        image_url=body.image_url or "",  # 手动创建无图片，置空串满足 NOT NULL
        parsed_job_json=parsed or None,
        title=title or None,
        company=(body.company or "").strip() or None,
        category=category,
        user_remark=(body.user_remark or "").strip() or None,
        status=body.status if body.status in JOB_STATUSES else "投递中",
        is_primary=not has_primary,
    )
    db.add(job_image)

    # 将解析后的岗位信息转为可读文字保存到用户个人信息中
    job_text = format_job_text(parsed)
    if job_text:
        if not user.saved_texts:
            user.saved_texts = {}
        user.saved_texts = {**user.saved_texts, "job_text": job_text}

    await db.flush()
    await db.refresh(job_image)
    await db.commit()
    return job_image


@router.post("/parse-image")
async def parse_job_image(
    file: UploadFile = File(...),
    use_ocr: bool = Query(False, description="Force OCR fallback"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """上传职位图片：仅识别解析、不入库，返回结构化职位数据供前端预览确认后批量导入"""
    ext = file.filename.split(".")[-1].lower() if file.filename else "unknown"
    if ext not in ("png", "jpg", "jpeg", "webp"):
        raise app_err("FILE_TYPE_INVALID")

    content = await file.read()
    if len(content) > settings.MAX_UPLOAD_SIZE:
        raise app_err("FILE_TOO_LARGE")

    # 真实文件类型校验（防「改扩展名上传恶意文件」）
    validate_file_magic(content, ext)

    filename = file.filename or f"job.{ext}"
    key = f"job-images/{user.id}/{uuid.uuid4()}.{ext}"
    file_url = await storage.upload_bytes(content, key)

    try:
        result = await parse_job_from_bytes(content, filename, use_ocr_fallback=use_ocr)
    except ValueError as e:
        logger.error(f"岗位图片解析失败: {e}")
        raise app_err("JOB_PARSE_FAILED")
    except Exception as e:
        logger.error(f"岗位图片解析异常: {e}", exc_info=True)
        raise app_err("JOB_PARSE_FAILED")

    parsed = result.get("parsed_job_json") or {}
    title = parsed.get("title", "")
    company = parsed.get("company", "")
    category = _guess_category(title)

    return {
        "image_url": file_url,
        "title": title or None,
        "company": company or None,
        "category": category,
        "parsed_job_json": parsed,
        "ocr_text": result.get("ocr_text"),
    }


@router.post("/parse-images")
async def parse_job_images_merged(
    files: list[UploadFile] = File(...),
    use_ocr: bool = Query(False, description="Force OCR fallback"),
    user: User = Depends(get_current_user),
):
    """多图综合识别：解析全部图片 → 信息汇总合并 → 必填模块完整性校验。

    - 校验不通过：本次上传失败（不落任何数据，清理已上传文件），返回缺失模块清单；
    - 校验通过：返回合并后的结构化岗位数据，供前端预览确认后批量导入；
    - 兼容原有单图 /parse-image 与 /upload 流程，二者不受影响。
    """
    if not files:
        raise HTTPException(status_code=400, detail="请至少上传一张图片")
    if len(files) > MAX_MERGE_IMAGES:
        raise HTTPException(status_code=400, detail=f"单次最多上传 {MAX_MERGE_IMAGES} 张图片")

    # ── 1. 逐个文件基础校验（格式 / 大小 / 真实文件类型），无效文件跳过并记录 ──
    valid: list[tuple[str, bytes, str]] = []  # (filename, content, ext)
    file_errors: list[str] = []
    for f in files:
        name = f.filename or "未命名图片"
        ext = name.split(".")[-1].lower() if f.filename and "." in f.filename else "unknown"
        if ext not in ALLOWED_IMAGE_EXTS:
            file_errors.append(f"{name}：不支持的图片格式")
            continue
        content = await f.read()
        if len(content) > settings.MAX_UPLOAD_SIZE:
            file_errors.append(f"{name}：文件超过大小限制")
            continue
        try:
            validate_file_magic(content, ext)
        except Exception as e:
            logger.warning(f"岗位图片文件类型校验失败 {name}: {e}")
            file_errors.append(f"{name}：文件内容与扩展名不符或已损坏")
            continue
        valid.append((name, content, ext))

    if not valid:
        raise HTTPException(
            status_code=400,
            detail={"message": "没有有效的图片文件，上传已取消", "missing_modules": [], "per_image_errors": file_errors},
        )

    # ── 2. 先上传存储（校验通过后挂到岗位记录；失败则统一清理） ──
    stored_urls: list[str] = []
    try:
        for name, content, ext in valid:
            key = f"job-images/{user.id}/{uuid.uuid4()}.{ext}"
            stored_urls.append(await storage.upload_bytes(content, key))
    except Exception as e:
        logger.error(f"岗位图片存储失败: {e}", exc_info=True)
        for url in stored_urls:
            try:
                await storage.delete(url)
            except Exception:
                pass
        raise HTTPException(status_code=500, detail="图片存储失败，请稍后重试")

    async def _cleanup_storage():
        for url in stored_urls:
            try:
                await storage.delete(url)
            except Exception:
                pass

    # ── 3. 并发解析各张图片（单张失败不拖垮整体，只要有一张成功即可继续） ──
    async def _parse_one(content: bytes, filename: str):
        return await parse_job_from_bytes(content, filename, use_ocr_fallback=use_ocr)

    try:
        results = await asyncio.gather(
            *[_parse_one(c, n) for n, c, _ in valid], return_exceptions=True
        )
    except Exception as e:  # gather(return_exceptions=True) 一般不抛，兜底防御
        logger.error(f"岗位多图解析异常: {e}", exc_info=True)
        await _cleanup_storage()
        raise HTTPException(status_code=500, detail="图片解析服务异常，请稍后重试")

    parsed_parts: list[dict] = []
    ocr_texts: list[str] = []
    parse_errors: list[str] = list(file_errors)
    for (name, _, _), r in zip(valid, results):
        if isinstance(r, Exception):
            logger.error(f"岗位图片 {name} 解析失败: {r}")
            parse_errors.append(f"{name}：识别失败")
            continue
        parsed = r.get("parsed_job_json") or {}
        if isinstance(parsed, dict) and parsed:
            parsed_parts.append(parsed)
        else:
            parse_errors.append(f"{name}：未识别到有效岗位信息")
        ocr = r.get("ocr_text")
        if ocr:
            ocr_texts.append(str(ocr))

    if not parsed_parts:
        await _cleanup_storage()
        raise HTTPException(
            status_code=422,
            detail={
                "message": "所有图片均未识别到有效岗位信息，本次上传失败",
                "missing_modules": [],
                "per_image_errors": parse_errors,
            },
        )

    # ── 4. 信息汇总合并 + 必填模块完整性校验 ──
    merged = merge_parsed_jobs(parsed_parts)
    report = check_completeness(merged)

    if not report["passed"]:
        await _cleanup_storage()
        logger.info(
            f"岗位上传完整性校验未通过: missing={report['missing_modules']} user={user.id}"
        )
        raise HTTPException(
            status_code=422,
            detail={
                "message": "岗位信息不完整，本次上传未通过完整性校验",
                "missing_modules": report["missing_modules"],
                "recognized_modules": report["recognized_modules"],
                "filled_count": report["filled_count"],
                "total": report["total"],
                "parsed_preview": merged,
                "per_image_errors": parse_errors,
            },
        )

    return {
        "image_url": stored_urls[0],
        "image_urls": stored_urls,
        "title": merged.get("title") or None,
        "company": merged.get("company") or None,
        "category": _guess_category(merged.get("title") or ""),
        "parsed_job_json": merged,
        "ocr_text": "\n─────\n".join(ocr_texts) or None,
        "completeness": report,
        "per_image_errors": parse_errors,
    }


@router.post("/batch-create")
async def batch_create_jobs(
    body: JobBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """批量创建职位（用于导入职位确认后落库）"""
    existing = await db.execute(
        select(JobImage).where(
            JobImage.user_id == user.id,
            JobImage.deleted_at.is_(None),
            JobImage.is_primary == True,
        )
    )
    has_primary = existing.scalar_one_or_none() is not None

    created = []
    for item in body.jobs:
        title = (item.title or "").strip()
        if not title:
            continue
        category = item.category or _guess_category(title)
        parsed = item.parsed_job_json or {}
        job_image = JobImage(
            user_id=user.id,
            image_url=item.image_url or "",
            parsed_job_json=parsed or None,
            title=title or None,
            company=(item.company or "").strip() or None,
            category=category,
            user_remark=(item.user_remark or "").strip() or None,
            status=item.status if item.status in JOB_STATUSES else "投递中",
            is_primary=(not has_primary) and len(created) == 0,
        )
        db.add(job_image)
        created.append(job_image)

        # 将解析后的岗位信息转为可读文字保存到用户个人信息中
        job_text = format_job_text(parsed)
        if job_text:
            if not user.saved_texts:
                user.saved_texts = {}
            user.saved_texts = {**user.saved_texts, "job_text": job_text}

    await db.commit()
    return {"detail": f"成功导入 {len(created)} 个职位", "created_count": len(created)}


@router.post("/batch-trash")
async def batch_trash_jobs(
    body: JobBatchActionRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not body.ids:
        raise HTTPException(status_code=400, detail="请提供要删除的岗位 ID 列表")

    result = await db.execute(
        select(JobImage).where(
            JobImage.id.in_(body.ids),
            JobImage.user_id == user.id,
            JobImage.deleted_at.is_(None),
        )
    )
    jobs_to_trash = result.scalars().all()

    if not jobs_to_trash:
        raise HTTPException(status_code=404, detail="未找到可删除的岗位")

    now = datetime.now(TZ_UTC8)
    trashed_count = 0
    has_primary_deleted = False

    for job in jobs_to_trash:
        if job.is_primary:
            has_primary_deleted = True
        job.deleted_at = now
        job.is_favorite = False
        job.is_primary = False
        trashed_count += 1

    # 如果删除了默认岗位，自动提升下一个为默认
    if has_primary_deleted:
        next_job = await db.execute(
            select(JobImage).where(
                JobImage.user_id == user.id,
                JobImage.deleted_at.is_(None),
            ).order_by(JobImage.created_at.desc()).limit(1)
        )
        next_one = next_job.scalar_one_or_none()
        if next_one:
            next_one.is_primary = True

    await db.commit()
    return {"detail": f"已移至回收站 {trashed_count} 个岗位", "deleted_count": trashed_count}


@router.post("/batch-delete")
async def batch_delete_jobs(
    body: JobBatchActionRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not body.ids:
        raise HTTPException(status_code=400, detail="请提供要删除的岗位 ID 列表")

    result = await db.execute(
        select(JobImage).where(
            JobImage.id.in_(body.ids),
            JobImage.user_id == user.id,
        )
    )
    jobs_to_delete = result.scalars().all()

    if not jobs_to_delete:
        raise HTTPException(status_code=404, detail="未找到可删除的岗位")

    # 岗位被永久删除前，先解除面试追踪记录的引用（记录是用户手动录入的，保留内容仅置空关联）
    await db.execute(
        update(InterviewTrack)
        .where(InterviewTrack.job_image_id.in_([j.id for j in jobs_to_delete]))
        .values(job_image_id=None)
    )
    # 同步清除这些岗位的投递申请（外键级联也会处理，这里显式清理更稳妥）
    await db.execute(
        delete(Application).where(Application.job_image_id.in_([j.id for j in jobs_to_delete]))
    )

    deleted_count = 0
    for job in jobs_to_delete:
        if job.image_url:
            await storage.delete(job.image_url)
        await db.delete(job)
        deleted_count += 1

    await db.commit()
    return {"detail": f"已永久删除 {deleted_count} 个岗位", "deleted_count": deleted_count}


@router.post("/batch-restore")
async def batch_restore_jobs(
    body: JobBatchActionRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not body.ids:
        raise HTTPException(status_code=400, detail="请提供要恢复的岗位 ID 列表")

    result = await db.execute(
        select(JobImage).where(
            JobImage.id.in_(body.ids),
            JobImage.user_id == user.id,
            JobImage.deleted_at.isnot(None),
        )
    )
    jobs_to_restore = result.scalars().all()

    if not jobs_to_restore:
        raise HTTPException(status_code=404, detail="未找到可恢复的岗位")

    restored_count = 0
    for job in jobs_to_restore:
        job.deleted_at = None
        restored_count += 1

    await db.commit()
    return {"detail": f"已恢复 {restored_count} 个岗位", "restored_count": restored_count}


@router.get("/{job_id}", response_model=JobImageResponse)
async def get_job_image(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(JobImage).where(JobImage.id == job_id, JobImage.user_id == user.id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise app_err("JOB_NOT_FOUND")
    return job


@router.put("/{job_id}", response_model=JobImageResponse)
async def update_job(
    job_id: str,
    body: JobUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(JobImage).where(JobImage.id == job_id, JobImage.user_id == user.id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="岗位不存在")

    if body.title is not None:
        job.title = body.title
    if body.company is not None:
        job.company = body.company
    if body.category is not None:
        job.category = body.category
    if body.status is not None:
        if body.status not in JOB_STATUSES:
            raise HTTPException(status_code=400, detail="非法的投递状态")
        job.status = body.status
    if body.user_remark is not None:
        job.user_remark = body.user_remark

    await db.commit()
    await db.refresh(job)
    return job


@router.put("/{job_id}/primary", response_model=JobImageResponse)
async def set_primary(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(JobImage).where(JobImage.id == job_id, JobImage.user_id == user.id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="岗位不存在")

    # 取消当前默认
    current = await db.execute(
        select(JobImage).where(
            JobImage.user_id == user.id,
            JobImage.is_primary == True,
            JobImage.deleted_at.is_(None),
        )
    )
    for j in current.scalars().all():
        j.is_primary = False

    job.is_primary = True
    await db.commit()
    await db.refresh(job)
    return job


@router.post("/{job_id}/favorite", response_model=JobImageResponse)
async def toggle_favorite(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(JobImage).where(JobImage.id == job_id, JobImage.user_id == user.id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="岗位不存在")

    job.is_favorite = not job.is_favorite
    await db.commit()
    await db.refresh(job)
    return job


@router.post("/{job_id}/copy", response_model=JobImageResponse)
async def copy_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(JobImage).where(JobImage.id == job_id, JobImage.user_id == user.id)
    )
    original = result.scalar_one_or_none()
    if not original:
        raise HTTPException(status_code=404, detail="岗位不存在")

    new_job = JobImage(
        user_id=user.id,
        image_url=original.image_url,
        parsed_job_json=original.parsed_job_json,
        ocr_text=original.ocr_text,
        title=f"{original.title or '岗位'} (副本)" if original.title else "岗位 (副本)",
        company=original.company,
        category=original.category,
        status=original.status or "投递中",
        is_primary=False,
        is_favorite=False,
    )
    db.add(new_job)
    await db.flush()
    await db.refresh(new_job)
    await db.commit()
    return new_job


@router.post("/{job_id}/trash", response_model=JobImageResponse)
async def soft_delete(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(JobImage).where(JobImage.id == job_id, JobImage.user_id == user.id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="岗位不存在")

    job.deleted_at = datetime.now(TZ_UTC8)
    job.is_favorite = False
    job.is_primary = False

    # 自动提升下一个为默认
    if job.is_primary:
        next_job = await db.execute(
            select(JobImage).where(
                JobImage.user_id == user.id,
                JobImage.deleted_at.is_(None),
                JobImage.id != job_id,
            ).order_by(JobImage.created_at.desc())
        )
        next_one = next_job.scalars().first()
        if next_one:
            next_one.is_primary = True

    await db.commit()
    await db.refresh(job)
    return job


@router.post("/{job_id}/restore", response_model=JobImageResponse)
async def restore(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(JobImage).where(JobImage.id == job_id, JobImage.user_id == user.id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="岗位不存在")

    job.deleted_at = None
    await db.commit()
    await db.refresh(job)
    return job


@router.delete("/{job_id}")
async def delete_job_image(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(JobImage).where(JobImage.id == job_id, JobImage.user_id == user.id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise app_err("JOB_NOT_FOUND")

    # 解除面试追踪记录的引用，避免外键约束报错（记录本身保留）
    await db.execute(
        update(InterviewTrack).where(InterviewTrack.job_image_id == job.id).values(job_image_id=None)
    )
    # 同步清除该岗位的投递申请（外键级联也会处理，这里显式清理更稳妥）
    await db.execute(
        delete(Application).where(Application.job_image_id == job.id)
    )
    if job.image_url:
        await storage.delete(job.image_url)
    await db.delete(job)
    await db.commit()
    return {"detail": "已永久删除"}