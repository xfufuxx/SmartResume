import uuid
import logging
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.core.deps import get_current_user
from app.config import settings
from app.models.user import User
from app.models.resume import Resume
from app.schemas.resume import ResumeResponse, ResumeUploadResponse, ResumeCreateRequest, ResumeUpdateRequest
from app.services.resume_parser import parse_resume_from_bytes
from app.services.storage import storage

logger = logging.getLogger(__name__)

router = APIRouter()
MAX_RESUMES = 10


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
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

    content = await file.read()
    if len(content) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds 20MB limit")

    filename = file.filename or f"resume.{ext}"

    key = f"resumes/{user.id}/{uuid.uuid4()}.{ext}"
    file_url = await storage.upload_bytes(content, key)

    try:
        result = await parse_resume_from_bytes(content, filename)
    except ValueError as e:
        logger.error(f"简历解析失败: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"简历解析异常: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"简历解析服务异常: {type(e).__name__}")

    resume = Resume(
        user_id=user.id,
        title=file.filename.rsplit(".", 1)[0] if file.filename else None,
        original_file_url=file_url,
        file_type=ext,
        parsed_json=result["parsed_json"],
        raw_text=result["raw_text"],
    )
    db.add(resume)
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
        .order_by(Resume.is_primary.desc(), Resume.created_at.desc())
    )
    return result.scalars().all()


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
        return resume

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
        raise HTTPException(status_code=404, detail="Resume not found")

    if body.title is not None:
        resume.title = body.title
        await db.commit()
        await db.refresh(resume)

    return resume


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
        raise HTTPException(status_code=404, detail="Resume not found")

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
    return resume


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
        raise HTTPException(status_code=404, detail="Resume not found")
    return resume


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
        raise HTTPException(status_code=404, detail="Resume not found")

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