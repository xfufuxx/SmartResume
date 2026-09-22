import os
import uuid
import logging
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete, update

from app.database import get_db
from app.core.deps import get_current_user
from app.config import settings
from app.core.crypto import encrypt_field, decrypt_field
from app.core.errors import app_err
from app.core.file_security import validate_file_magic, validate_pdf_pages
from app.models.user import User
from app.models.resume import Resume
from app.models.batch_optimization import BatchOptimization, BatchJobTask
from app.models.optimized_resume import OptimizedResume
from app.models.interview import InterviewSession
from app.models.interview_track import InterviewTrack
from app.schemas.resume import ResumeResponse, ResumeUploadResponse, ResumeCreateRequest, ResumeUpdateRequest, ResumeBatchDeleteRequest, ResumeStats, FavoriteRequest
from app.services.resume_parser import parse_resume_from_bytes
from app.services.storage import storage, resign_file_url
from app.services.text_formatter import format_resume_text

logger = logging.getLogger(__name__)

router = APIRouter()
MAX_RESUMES = 10

# 回收站保留天数：超过后自动物理删除（记录 + 磁盘文件）
TRASH_RETENTION_DAYS = 7


def _file_key_from_url(url: str | None) -> str | None:
    """从历史三种 URL 形态（签名 URL / /uploads/ 相对路径 / uploads/ 相对路径）提取存储 key。"""
    if not url:
        return None
    path = urlparse(url).path if url.startswith("http") else url
    for marker in ("/api/files/", "/uploads/"):
        if marker in path:
            return path.split(marker, 1)[-1]
    if path.startswith("uploads/"):
        return path[len("uploads/"):]
    return None


async def _purge_expired_trash(db: AsyncSession) -> int:
    """物理删除回收站中超过保留期的简历（含磁盘文件），返回清理数量。"""
    cutoff = datetime.now(timezone(timedelta(hours=8))) - timedelta(days=TRASH_RETENTION_DAYS)
    result = await db.execute(
        select(Resume).where(Resume.deleted_at.isnot(None), Resume.deleted_at < cutoff)
    )
    expired = result.scalars().all()
    if not expired:
        return 0
    expired_ids = [r.id for r in expired]

    # 先处理外键引用，避免删除时违反约束（batch_job_tasks → batch_optimizations → resumes）：
    # - batch_job_tasks：批量优化任务明细随源简历一并删除
    # - batch_optimizations.source_resume_id（NOT NULL）：批量优化历史随源简历一并删除
    # - optimized_resumes.resume_id：优化结果为派生数据，随源简历一并删除
    # - interview_sessions.resume_id（可空）：会话本身保留，仅置空简历引用
    # - interview_tracks.resume_id（可空）：面试追踪是用户手动录入的记录，保留记录仅置空引用
    await db.execute(delete(BatchJobTask).where(BatchJobTask.batch_id.in_(
        select(BatchOptimization.id).where(BatchOptimization.source_resume_id.in_(expired_ids))
    )))
    await db.execute(delete(BatchOptimization).where(BatchOptimization.source_resume_id.in_(expired_ids)))
    await db.execute(delete(OptimizedResume).where(OptimizedResume.resume_id.in_(expired_ids)))
    await db.execute(update(InterviewSession).where(InterviewSession.resume_id.in_(expired_ids)).values(resume_id=None))
    await db.execute(update(InterviewTrack).where(InterviewTrack.resume_id.in_(expired_ids)).values(resume_id=None))

    for resume in expired:
        key = _file_key_from_url(resume.original_file_url)
        if key:
            local_path = os.path.join("uploads", key)
            try:
                if os.path.isfile(local_path):
                    os.remove(local_path)
            except OSError:
                logger.warning("清理过期回收站文件失败: %s", local_path, exc_info=True)
        await db.delete(resume)
    await db.commit()
    return len(expired)


def _scrub_raw(resume: Resume) -> Resume:
    """内存中解密 raw_text 并重签文件 URL（不写库）。

    - raw_text 解密供接口返回，兼容历史未加密数据；
    - original_file_url 重签名：DB 存的是上传时签发的 URL，30 天后过期，
      每次读取重签可保证前端预览（新标签页）与下载永远拿到有效链接。
    """
    if resume.raw_text:
        try:
            resume.raw_text = decrypt_field(resume.raw_text)
        except Exception:
            pass
    if resume.original_file_url:
        resume.original_file_url = resign_file_url(resume.original_file_url) or resume.original_file_url
    return resume


@router.post("/upload", response_model=ResumeUploadResponse)
async def upload_resume(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    count_result = await db.execute(
        select(func.count(Resume.id)).where(
            Resume.user_id == user.id,
            Resume.deleted_at.is_(None),
        )
    )
    current_count = count_result.scalar() or 0
    if current_count >= MAX_RESUMES:
        raise HTTPException(status_code=400, detail=f"简历数量已达上限（{MAX_RESUMES}份），请先删除不需要的简历")

    ext = file.filename.split(".")[-1].lower() if file.filename else "unknown"
    if ext not in ("pdf", "docx", "png", "jpg", "jpeg", "webp"):
        raise app_err("FILE_TYPE_INVALID")

    content = await file.read()
    if len(content) > settings.MAX_UPLOAD_SIZE:
        raise app_err("FILE_TOO_LARGE")

    # 真实文件类型校验（防「改扩展名上传恶意文件」）
    validate_file_magic(content, ext)
    if ext == "pdf":
        validate_pdf_pages(content)

    filename = file.filename or f"resume.{ext}"

    key = f"resumes/{user.id}/{uuid.uuid4()}.{ext}"
    file_url = await storage.upload_bytes(content, key)

    try:
        result = await parse_resume_from_bytes(content, filename)
    except ValueError as e:
        logger.error(f"简历解析失败: {e}")
        raise app_err("RESUME_PARSE_FAILED")
    except Exception as e:
        logger.error(f"简历解析异常: {e}", exc_info=True)
        raise app_err("RESUME_PARSE_FAILED")

    # PII 加密存储：raw_text 含姓名/电话/邮箱等敏感原文（PIPL 第 51 条）
    raw_text = result["raw_text"]
    try:
        raw_text = encrypt_field(raw_text) if raw_text else raw_text
    except Exception:
        logger.warning("raw_text 加密失败，将以明文存储")

    resume = Resume(
        user_id=user.id,
        title=file.filename.rsplit(".", 1)[0] if file.filename else None,
        original_file_url=file_url,
        file_type=ext,
        parsed_json=result["parsed_json"],
        raw_text=raw_text,
    )
    db.add(resume)

    # 将解析后的简历信息转为可读文字保存到用户个人信息中
    resume_text = format_resume_text(result["parsed_json"])
    if resume_text:
        if not user.saved_texts:
            user.saved_texts = {}
        user.saved_texts = {**user.saved_texts, "resume_text": resume_text}

    await db.flush()
    await db.refresh(resume)

    if current_count == 0:
        resume.is_primary = True
        await db.commit()
    else:
        await db.commit()

    return ResumeUploadResponse(id=resume.id, parsed_json=result["parsed_json"], original_file_url=file_url, file_type=ext, message="Resume parsed successfully")


@router.get("/", response_model=list[ResumeResponse])
async def list_resumes(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Resume)
        .where(Resume.user_id == user.id, Resume.deleted_at.is_(None))
        .order_by(
            Resume.is_primary.desc(),
            func.coalesce(Resume.updated_at, Resume.created_at).desc(),
        )
    )
    return [_scrub_raw(r) for r in result.scalars().all()]


@router.get("/stats", response_model=ResumeStats)
async def get_resume_stats(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """「我的简历」概览统计：总数、已优化、草稿、未优化、收藏数量"""
    # 惰性触发过期回收站清理：即使用户从不打开回收站也会被及时清理
    await _purge_expired_trash(db)
    base = select(Resume).where(Resume.user_id == user.id, Resume.deleted_at.is_(None))

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    optimized = (await db.execute(
        select(func.count(Resume.id)).where(
            Resume.user_id == user.id, Resume.deleted_at.is_(None), Resume.status == "optimized"
        )
    )).scalar() or 0
    draft = (await db.execute(
        select(func.count(Resume.id)).where(
            Resume.user_id == user.id, Resume.deleted_at.is_(None), Resume.status == "draft"
        )
    )).scalar() or 0
    unoptimized = (await db.execute(
        select(func.count(Resume.id)).where(
            Resume.user_id == user.id, Resume.deleted_at.is_(None), Resume.status == "unoptimized"
        )
    )).scalar() or 0
    favorite = (await db.execute(
        select(func.count(Resume.id)).where(
            Resume.user_id == user.id, Resume.deleted_at.is_(None), Resume.is_favorite.is_(True)
        )
    )).scalar() or 0

    return ResumeStats(
        total=total,
        optimized=optimized,
        draft=draft,
        unoptimized=unoptimized,
        favorite=favorite,
    )


@router.post("/{resume_id}/favorite", response_model=ResumeResponse)
async def toggle_favorite(
    resume_id: str,
    body: FavoriteRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """收藏 / 取消收藏简历"""
    result = await db.execute(
        select(Resume).where(
            Resume.id == resume_id,
            Resume.user_id == user.id,
            Resume.deleted_at.is_(None),
        )
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise app_err("RESUME_NOT_FOUND")

    resume.is_favorite = body.favorite
    await db.commit()
    await db.refresh(resume)
    return _scrub_raw(resume)


@router.post("/", response_model=ResumeResponse)
async def create_resume(
    body: ResumeCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    count_result = await db.execute(
        select(func.count(Resume.id)).where(
            Resume.user_id == user.id,
            Resume.deleted_at.is_(None),
        )
    )
    if count_result.scalar() >= MAX_RESUMES:
        raise HTTPException(status_code=400, detail=f"简历数量已达上限（{MAX_RESUMES}份）")

    if body.source_resume_id:
        source_result = await db.execute(
            select(Resume).where(
                Resume.id == body.source_resume_id,
                Resume.user_id == user.id,
                Resume.deleted_at.is_(None),
            )
        )
        source = source_result.scalar_one_or_none()
        if not source:
            raise HTTPException(status_code=404, detail="源简历不存在")

        resume = Resume(
            user_id=user.id,
            title=body.title or f"{source.title or '简历'} (副本)",
            original_file_url=source.original_file_url,
            file_type=source.file_type,
            parsed_json=source.parsed_json,
            raw_text=source.raw_text,
        )
        db.add(resume)
        await db.flush()
        await db.refresh(resume)
        await db.commit()
        return _scrub_raw(resume)

    raise HTTPException(status_code=400, detail="请上传文件以创建新简历，或提供 source_resume_id 复制已有简历")


@router.put("/{resume_id}", response_model=ResumeResponse)
async def update_resume(
    resume_id: str,
    body: ResumeUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Resume).where(
            Resume.id == resume_id,
            Resume.user_id == user.id,
            Resume.deleted_at.is_(None),
        )
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise app_err("RESUME_NOT_FOUND")

    if body.title is not None:
        resume.title = body.title
        await db.commit()
        await db.refresh(resume)

    return _scrub_raw(resume)


@router.put("/{resume_id}/primary", response_model=ResumeResponse)
async def set_primary_resume(
    resume_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Resume).where(
            Resume.id == resume_id,
            Resume.user_id == user.id,
            Resume.deleted_at.is_(None),
        )
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise app_err("RESUME_NOT_FOUND")

    all_result = await db.execute(
        select(Resume).where(
            Resume.user_id == user.id,
            Resume.deleted_at.is_(None),
        )
    )
    for r in all_result.scalars().all():
        r.is_primary = (r.id == resume_id)

    await db.commit()
    await db.refresh(resume)
    return _scrub_raw(resume)


@router.post("/batch-delete")
async def batch_delete_resumes(
    body: ResumeBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not body.ids:
        raise HTTPException(status_code=400, detail="请提供要删除的简历 ID 列表")

    result = await db.execute(
        select(Resume).where(
            Resume.id.in_(body.ids),
            Resume.user_id == user.id,
            Resume.deleted_at.is_(None),
        )
    )
    resumes_to_delete = result.scalars().all()

    if not resumes_to_delete:
        raise HTTPException(status_code=404, detail="未找到可删除的简历")

    TZ_UTC8 = timezone(timedelta(hours=8))
    now = datetime.now(TZ_UTC8)
    deleted_count = 0
    has_primary_deleted = False

    for resume in resumes_to_delete:
        if resume.is_primary:
            has_primary_deleted = True
        resume.deleted_at = now
        resume.is_primary = False
        deleted_count += 1

    # 如果删除了主简历，自动提升下一个为默认
    if has_primary_deleted:
        primary_result = await db.execute(
            select(Resume).where(
                Resume.user_id == user.id,
                Resume.deleted_at.is_(None),
            ).order_by(Resume.created_at.desc()).limit(1)
        )
        first = primary_result.scalar_one_or_none()
        if first:
            first.is_primary = True

    await db.commit()
    return {"detail": f"已删除 {deleted_count} 份简历", "deleted_count": deleted_count}


@router.get("/trash", response_model=list[ResumeResponse])
async def list_trash_resumes(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """回收站：列出已软删除的简历（先清理超过保留期的过期记录）"""
    await _purge_expired_trash(db)
    result = await db.execute(
        select(Resume)
        .where(Resume.user_id == user.id, Resume.deleted_at.isnot(None))
        .order_by(Resume.deleted_at.desc())
    )
    return [_scrub_raw(r) for r in result.scalars().all()]


@router.post("/batch-restore")
async def batch_restore_resumes(
    body: ResumeBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """从回收站批量恢复简历"""
    if not body.ids:
        raise HTTPException(status_code=400, detail="请提供要恢复的简历 ID 列表")

    result = await db.execute(
        select(Resume).where(
            Resume.id.in_(body.ids),
            Resume.user_id == user.id,
            Resume.deleted_at.isnot(None),
        )
    )
    resumes_to_restore = result.scalars().all()
    if not resumes_to_restore:
        raise HTTPException(status_code=404, detail="未找到可恢复的简历")

    restored_count = 0
    for resume in resumes_to_restore:
        resume.deleted_at = None
        restored_count += 1

    await db.commit()
    return {"detail": f"已恢复 {restored_count} 份简历", "restored_count": restored_count}


@router.post("/{resume_id}/restore", response_model=ResumeResponse)
async def restore_resume(
    resume_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """从回收站恢复简历"""
    result = await db.execute(
        select(Resume).where(
            Resume.id == resume_id,
            Resume.user_id == user.id,
            Resume.deleted_at.isnot(None),
        )
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="简历不存在或不在回收站中")

    resume.deleted_at = None
    await db.commit()
    await db.refresh(resume)
    return _scrub_raw(resume)


@router.get("/{resume_id}", response_model=ResumeResponse)
async def get_resume(
    resume_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Resume).where(
            Resume.id == resume_id,
            Resume.user_id == user.id,
            Resume.deleted_at.is_(None),
        )
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise app_err("RESUME_NOT_FOUND")
    return _scrub_raw(resume)


@router.delete("/{resume_id}")
async def soft_delete_resume(
    resume_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Resume).where(
            Resume.id == resume_id,
            Resume.user_id == user.id,
            Resume.deleted_at.is_(None),
        )
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise app_err("RESUME_NOT_FOUND")

    TZ_UTC8 = timezone(timedelta(hours=8))
    resume.deleted_at = datetime.now(TZ_UTC8)
    resume.is_primary = False

    primary_result = await db.execute(
        select(Resume).where(
            Resume.user_id == user.id,
            Resume.deleted_at.is_(None),
            Resume.is_primary == True,
        )
    )
    if not primary_result.scalar_one_or_none():
        first_result = await db.execute(
            select(Resume).where(
                Resume.user_id == user.id,
                Resume.deleted_at.is_(None),
            ).order_by(Resume.created_at.desc()).limit(1)
        )
        first = first_result.scalar_one_or_none()
        if first:
            first.is_primary = True

    await db.commit()
    return {"detail": "Deleted"}